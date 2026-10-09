#include "gbs/audio.hpp"
#include "gbs_hw.h"

#if !defined(__arm__) && !defined(__thumb__)
extern "C" __attribute__((weak)) uint32_t gbs_hw_audio_pcm_underrun_count(void) {
    return 0;
}
#endif

namespace {

struct SfxPlayback {
    const gbs::SfxTone* tones;
    size_t tone_count;
    size_t index;
    uint8_t frames_remaining;
    uint8_t elapsed_frames;
    bool playing;
};

struct MusicPlayback {
    const gbs::MusicStep* steps;
    size_t step_count;
    size_t index;
    uint8_t frames_remaining;
    bool loop;
    bool playing;
};

struct TrackerPlayback {
    const gbs::TrackerAsset* asset;
    size_t order_index;
    size_t step_index;
    uint8_t frames_remaining;
    bool playing;
};

struct TrackerChannelPlayback {
    const gbs::TrackerStep* step;
    uint8_t elapsed_frames;
    uint8_t duration_frames;
};

struct PcmPlayback {
    const gbs::PcmAsset* asset;
    uint32_t position_fp;
    uint32_t step_fp;
    uint8_t volume;
    uint8_t priority;
    int8_t pan;
    uint16_t age;
    bool playing;
};

struct AudioVolumeState {
    uint8_t current;
    uint8_t start;
    uint8_t target;
    uint16_t total_frames;
    uint16_t remaining_frames;
};

SfxPlayback sfx {};
MusicPlayback music {};
TrackerPlayback tracker {};
TrackerChannelPlayback tracker_channels[4] {};
PcmPlayback pcm_sfx[gbs::PCM_MIXER_MAX_SFX_VOICES] {};
PcmPlayback pcm_music {};
PcmPlayback pcm_tracker[4] {};
#if defined(__arm__) || defined(__thumb__)
#define GBS_AUDIO_EWRAM __attribute__((section(".ewram_bss")))
#define GBS_AUDIO_FAST_RAM __attribute__((section(".iwram.audio_scratch")))
#define GBS_AUDIO_HOT_CODE __attribute__((section(".iwram"), target("arm"), optimize("O2"), noinline, long_call))
#else
#define GBS_AUDIO_EWRAM
#define GBS_AUDIO_FAST_RAM
#define GBS_AUDIO_HOT_CODE
#endif
struct MixVoice {
    PcmPlayback* playback;
    gbs::AudioChannel primary;
    gbs::AudioChannel pcm;
    gbs::PcmPanGains pan;
    uint32_t start_position;
};
// The IRQ stack is small; scratch voices live in EWRAM, like the mix buffers.
MixVoice pcm_mix_voices[gbs::PCM_MIXER_MAX_ACTIVE_VOICES] GBS_AUDIO_EWRAM {};
// One accumulator serves both sides; stereo replays the same voice positions.
int16_t pcm_mix_accumulator[gbs::PCM_MIXER_SAMPLES_PER_FRAME] GBS_AUDIO_FAST_RAM {};
alignas(4) uint8_t pcm_mix_buffers[2][2][gbs::PCM_MIXER_SAMPLES_PER_FRAME + 32] GBS_AUDIO_EWRAM {};
int8_t pcm_gain_left[256] GBS_AUDIO_FAST_RAM {};
#undef GBS_AUDIO_EWRAM
#undef GBS_AUDIO_FAST_RAM
uint8_t pcm_mix_buffer_index = 0;
uint16_t pcm_voice_age = 1;
bool pcm_output_active = false;
uint32_t pcm_submitted_blocks = 0;
bool music_muted = false;
bool sfx_muted = false;
bool pcm_music_muted = false;
bool pcm_sfx_muted = false;
AudioVolumeState channel_volumes[4] {};

void reset_pcm_playback(PcmPlayback& playback);
void start_pcm_playback(
    PcmPlayback& playback,
    const gbs::PcmAsset& asset,
    uint8_t priority,
    uint8_t volume,
    uint32_t sample_rate_hz = 0,
    int8_t pan = 0
);
void start_tracker_sample(const gbs::TrackerStep& step);
void enforce_pcm_voice_budget();

// The GBA audio clock runs in VBlank independently of rendering. Publish
// changes from the game as a short critical section; nested audio calls retain
// the caller's previous interrupt state. Asset validation stays outside it.
class AudioStateLock {
#if defined(__arm__) || defined(__thumb__)
    uint16_t previous_;
public:
    AudioStateLock() : previous_(gbs_hw_audio_lock_state()) {}
    ~AudioStateLock() { gbs_hw_audio_unlock_state(previous_); }
#else
public:
    AudioStateLock() = default;
#endif
};

size_t audio_channel_index(gbs::AudioChannel channel) {
    return static_cast<size_t>(channel);
}

uint8_t channel_volume(gbs::AudioChannel channel) {
    return channel_volumes[audio_channel_index(channel)].current;
}

uint8_t scaled_volume(uint8_t source, gbs::AudioChannel channel) {
    return static_cast<uint8_t>((static_cast<uint16_t>(source) * channel_volume(channel)) / 15u);
}

uint8_t envelope_volume(uint8_t volume, uint8_t attack_frames, uint8_t release_frames, uint8_t elapsed_frames, uint8_t duration_frames) {
    if (attack_frames > 0 && elapsed_frames < attack_frames) {
        return static_cast<uint8_t>((static_cast<uint16_t>(volume) * elapsed_frames) / attack_frames);
    }
    if (release_frames > 0 && duration_frames > elapsed_frames && duration_frames - elapsed_frames <= release_frames) {
        return static_cast<uint8_t>((static_cast<uint16_t>(volume) * (duration_frames - elapsed_frames)) / release_frames);
    }
    return volume;
}

void output_sfx_tone(const gbs::SfxTone& tone, uint8_t envelope_gain) {
    const uint8_t volume = scaled_volume(envelope_gain, gbs::AudioChannel::Sfx);
    gbs_hw_audio_set_psg_pan(tone.noise ? 4 : 1, tone.pan);
    if (tone.noise) {
        gbs_hw_audio_play_noise(tone.frequency_hz, volume, tone.duty);
    } else {
        gbs_hw_audio_play_square(1, tone.frequency_hz, volume, tone.duty);
    }
}

void update_sfx_tone_volume(const gbs::SfxTone& tone, uint8_t envelope_gain) {
    const uint8_t volume = scaled_volume(envelope_gain, gbs::AudioChannel::Sfx);
    if (tone.noise) {
        gbs_hw_audio_set_noise_volume(volume);
    } else {
        gbs_hw_audio_set_square_volume(1, volume, tone.duty);
    }
}

void start_sfx_tone(const gbs::SfxTone& tone) {
    sfx.elapsed_frames = 0;
    sfx.frames_remaining = tone.duration_frames;
    // As with tracker notes, PSG must latch a nonzero initial volume for
    // an audible tone. Starting a software attack at zero disables its DAC.
    output_sfx_tone(tone, tone.volume);
}

void output_music_step(const gbs::MusicStep& step) {
    gbs_hw_audio_set_psg_pan(2, step.pan);
    gbs_hw_audio_play_square(2, step.frequency_hz, scaled_volume(step.volume, gbs::AudioChannel::Music), step.duty);
}

void start_music_step(const gbs::MusicStep& step) {
    output_music_step(step);
    music.frames_remaining = step.duration_frames;
}

void output_tracker_step(const gbs::TrackerStep& step, uint8_t envelope_gain) {
    const uint8_t volume = scaled_volume(envelope_gain, gbs::AudioChannel::Music);
    gbs_hw_audio_set_psg_pan(step.channel, step.pan);
    if (step.channel == 4) {
        gbs_hw_audio_play_noise(step.frequency_hz, volume, step.duty);
    } else if (step.channel == 3) {
        gbs_hw_audio_play_wave(step.frequency_hz, volume, step.waveform);
    } else {
        gbs_hw_audio_play_square(step.channel, step.frequency_hz, volume, step.duty);
    }
}

void update_tracker_step_volume(const gbs::TrackerStep& step, uint8_t envelope_gain) {
    if (step.sample_only) {
        pcm_tracker[step.channel - 1u].volume = envelope_gain;
        return;
    }
    const uint8_t volume = scaled_volume(envelope_gain, gbs::AudioChannel::Music);
    if (step.channel == 4) {
        gbs_hw_audio_set_noise_volume(volume);
    } else if (step.channel == 3) {
        gbs_hw_audio_set_wave_volume(volume);
    } else {
        gbs_hw_audio_set_square_volume(step.channel, volume, step.duty);
    }
}

void start_tracker_step(const gbs::TrackerStep& step) {
    TrackerChannelPlayback& channel = tracker_channels[step.channel - 1u];
    channel = TrackerChannelPlayback { &step, 0, step.duration_frames };
    // PSG envelope registers latch their initial volume when the channel is
    // triggered. Starting at zero silences the DAC and later writes cannot
    // reproduce a software attack reliably on real GBA hardware.
    if (step.sample_only) {
        if (step.channel == 4) gbs_hw_audio_stop_noise();
        else if (step.channel == 3) gbs_hw_audio_stop_wave();
        else gbs_hw_audio_stop_square(step.channel);
    } else output_tracker_step(step, step.volume);
    start_tracker_sample(step);
    if (step.sample_only && step.attack_frames > 0) pcm_tracker[step.channel - 1u].volume = 0;
    tracker.frames_remaining = step.duration_frames;
}

void reset_sfx_state() {
    sfx.tones = nullptr;
    sfx.tone_count = 0;
    sfx.index = 0;
    sfx.frames_remaining = 0;
    sfx.elapsed_frames = 0;
    sfx.playing = false;
}

void reset_music_state() {
    music.steps = nullptr;
    music.step_count = 0;
    music.index = 0;
    music.frames_remaining = 0;
    music.loop = false;
    music.playing = false;
}

void reset_tracker_state() {
    tracker.asset = nullptr;
    tracker.order_index = 0;
    tracker.step_index = 0;
    tracker.frames_remaining = 0;
    tracker.playing = false;
    for (TrackerChannelPlayback& channel : tracker_channels) {
        channel = TrackerChannelPlayback { nullptr, 0, 0 };
    }
    for (PcmPlayback& playback : pcm_tracker) {
        reset_pcm_playback(playback);
    }
}

void reset_pcm_playback(PcmPlayback& playback) {
    playback.asset = nullptr;
    playback.position_fp = 0;
    playback.step_fp = 0;
    playback.volume = 0;
    playback.priority = 0;
    playback.pan = 0;
    playback.age = 0;
    playback.playing = false;
}

void reset_pcm_sfx_state() {
    for (size_t index = 0; index < gbs::PCM_MIXER_MAX_SFX_VOICES; ++index) {
        reset_pcm_playback(pcm_sfx[index]);
    }
}

void reset_pcm_music_state() {
    reset_pcm_playback(pcm_music);
}

void reset_audio_mutes() {
    music_muted = false;
    sfx_muted = false;
    pcm_music_muted = false;
    pcm_sfx_muted = false;
}

void reset_audio_volumes() {
    for (size_t index = 0; index < 4; ++index) {
        channel_volumes[index] = AudioVolumeState { 15, 15, 15, 0, 0 };
    }
}

const gbs::TrackerPattern* current_tracker_pattern();

void refresh_active_psg_outputs(bool music_changed, bool sfx_changed) {
    if (sfx_changed && sfx.playing && sfx.tones != nullptr && sfx.index < sfx.tone_count) {
        const gbs::SfxTone& tone = sfx.tones[sfx.index];
        update_sfx_tone_volume(
            tone,
            envelope_volume(tone.volume, tone.attack_frames, tone.release_frames, sfx.elapsed_frames, tone.duration_frames)
        );
    }
    if (!music_changed) {
        return;
    }
    if (music.playing && music.steps != nullptr && music.index < music.step_count) {
        output_music_step(music.steps[music.index]);
    }
    const gbs::TrackerPattern* pattern = current_tracker_pattern();
    if (tracker.playing && pattern != nullptr && tracker.step_index < pattern->step_count) {
        const gbs::TrackerStep& step = pattern->steps[tracker.step_index];
        const TrackerChannelPlayback& channel = tracker_channels[step.channel - 1u];
        update_tracker_step_volume(
            step,
            envelope_volume(step.volume, step.attack_frames, step.release_frames, channel.elapsed_frames, channel.duration_frames)
        );
    }
}

void update_audio_volume_fades() {
    bool music_changed = false;
    bool sfx_changed = false;
    for (size_t index = 0; index < 4; ++index) {
        AudioVolumeState& state = channel_volumes[index];
        if (state.remaining_frames == 0 || state.total_frames == 0) {
            continue;
        }
        const uint16_t elapsed = static_cast<uint16_t>(state.total_frames - state.remaining_frames + 1u);
        const int delta = static_cast<int>(state.target) - static_cast<int>(state.start);
        const int value = static_cast<int>(state.start) + (delta * elapsed) / state.total_frames;
        state.current = static_cast<uint8_t>(value < 0 ? 0 : (value > 15 ? 15 : value));
        --state.remaining_frames;
        if (state.remaining_frames == 0) {
            state.current = state.target;
        }
        music_changed = music_changed || index == audio_channel_index(gbs::AudioChannel::Music);
        sfx_changed = sfx_changed || index == audio_channel_index(gbs::AudioChannel::Sfx);
    }
    refresh_active_psg_outputs(music_changed, sfx_changed);
}

uint32_t pcm_step_for_asset(const gbs::PcmAsset& asset, uint32_t sample_rate_hz) {
    const uint32_t playback_rate_hz = sample_rate_hz == 0 ? asset.sample_rate_hz : sample_rate_hz;
    uint32_t step = static_cast<uint32_t>((static_cast<uint64_t>(playback_rate_hz) << 16) / gbs::PCM_MIXER_SAMPLE_RATE_HZ);
    if (step == 0) {
        step = 1;
    }
    return step;
}

void start_pcm_playback(PcmPlayback& playback, const gbs::PcmAsset& asset, uint8_t priority, uint8_t volume, uint32_t sample_rate_hz, int8_t pan) {
    if (pcm_voice_age == 0xFFFFu) {
        // Keep relative SFX age across arbitrarily many music/sample triggers.
        // Assigned ranks are below the next rank, so each pass skips them.
        uint16_t rank = 1;
        for (; rank <= gbs::PCM_MIXER_MAX_SFX_VOICES; ++rank) {
            PcmPlayback* next = nullptr;
            for (PcmPlayback& effect : pcm_sfx) {
                if (effect.playing && effect.age >= rank &&
                    (next == nullptr || effect.age < next->age)) next = &effect;
            }
            if (next == nullptr) break;
            next->age = rank;
        }
        pcm_voice_age = rank;
    }
    playback.asset = &asset;
    playback.position_fp = 0;
    playback.step_fp = pcm_step_for_asset(asset, sample_rate_hz);
    playback.volume = volume;
    playback.priority = priority;
    playback.pan = pan;
    playback.age = pcm_voice_age++;
    playback.playing = true;
}

void start_tracker_sample(const gbs::TrackerStep& step) {
    PcmPlayback& playback = pcm_tracker[step.channel - 1u];
    if (step.sample_index < 0 || tracker.asset == nullptr || tracker.asset->samples == nullptr ||
        static_cast<size_t>(step.sample_index) >= tracker.asset->sample_count) {
        reset_pcm_playback(playback);
        return;
    }
    start_pcm_playback(
        playback,
        tracker.asset->samples[step.sample_index],
        0,
        step.volume,
        step.sample_rate_hz,
        step.pan
    );
}

void update_sfx() {
    if (!sfx.playing) {
        return;
    }

    if (sfx.frames_remaining > 0) {
        --sfx.frames_remaining;
        ++sfx.elapsed_frames;
    }
    if (sfx.frames_remaining > 0) {
        const gbs::SfxTone& tone = sfx.tones[sfx.index];
        if (tone.attack_frames > 0 || tone.release_frames > 0) {
            update_sfx_tone_volume(
                tone,
                envelope_volume(tone.volume, tone.attack_frames, tone.release_frames, sfx.elapsed_frames, tone.duration_frames)
            );
        }
        return;
    }

    ++sfx.index;
    if (sfx.index >= sfx.tone_count) {
        gbs::stop_sfx();
        return;
    }

    start_sfx_tone(sfx.tones[sfx.index]);
}

void update_music() {
    if (!music.playing) {
        return;
    }

    if (music.frames_remaining > 0) {
        --music.frames_remaining;
    }
    if (music.frames_remaining > 0) {
        return;
    }

    ++music.index;
    if (music.index >= music.step_count) {
        if (!music.loop) {
            gbs::stop_music();
            return;
        }
        music.index = 0;
    }

    start_music_step(music.steps[music.index]);
}

const gbs::TrackerPattern* current_tracker_pattern() {
    if (!tracker.playing || tracker.asset == nullptr || tracker.order_index >= tracker.asset->order_count) {
        return nullptr;
    }
    uint8_t pattern_index = tracker.asset->order[tracker.order_index];
    if (pattern_index >= tracker.asset->pattern_count) {
        return nullptr;
    }
    return &tracker.asset->patterns[pattern_index];
}

bool advance_tracker_position() {
    const gbs::TrackerPattern* pattern = current_tracker_pattern();
    if (pattern == nullptr) {
        gbs::stop_tracker_music();
        return false;
    }

    ++tracker.step_index;
    if (tracker.step_index >= pattern->step_count) {
        tracker.step_index = 0;
        ++tracker.order_index;
        if (tracker.order_index >= tracker.asset->order_count) {
            if (!tracker.asset->loop) {
                gbs::stop_tracker_music();
                return false;
            }
            tracker.order_index = 0;
        }
        pattern = current_tracker_pattern();
        if (pattern == nullptr) {
            gbs::stop_tracker_music();
            return false;
        }
    }

    return true;
}

void start_tracker_row() {
    uint8_t active_channels = 0;
    while (tracker.playing) {
        const gbs::TrackerPattern* pattern = current_tracker_pattern();
        if (pattern == nullptr || tracker.step_index >= pattern->step_count) {
            gbs::stop_tracker_music();
            return;
        }
        const gbs::TrackerStep& step = pattern->steps[tracker.step_index];
        active_channels = static_cast<uint8_t>(active_channels | (1u << (step.channel - 1u)));
        start_tracker_step(step);
        if (tracker.frames_remaining > 0) {
            for (size_t channel_index = 0; channel_index < 4; ++channel_index) {
                if ((active_channels & (1u << channel_index)) != 0) {
                    tracker_channels[channel_index].duration_frames = tracker.frames_remaining;
                } else {
                    reset_pcm_playback(pcm_tracker[channel_index]);
                }
            }
            if ((active_channels & (1u << 0)) == 0) gbs_hw_audio_stop_square(1);
            if ((active_channels & (1u << 1)) == 0) gbs_hw_audio_stop_square(2);
            if ((active_channels & (1u << 2)) == 0) gbs_hw_audio_stop_wave();
            if ((active_channels & (1u << 3)) == 0) gbs_hw_audio_stop_noise();
            enforce_pcm_voice_budget();
            return;
        }
        if (!advance_tracker_position()) {
            return;
        }
    }
}

void advance_tracker_step() {
    if (advance_tracker_position()) {
        start_tracker_row();
    }
}

void update_tracker() {
    if (!tracker.playing) {
        return;
    }

    if (tracker.frames_remaining > 0) {
        for (TrackerChannelPlayback& channel : tracker_channels) {
            if (channel.step == nullptr || channel.elapsed_frames >= channel.duration_frames) {
                continue;
            }
            ++channel.elapsed_frames;
            if (channel.step->attack_frames > 0 || channel.step->release_frames > 0) {
                update_tracker_step_volume(
                    *channel.step,
                    envelope_volume(
                        channel.step->volume,
                        channel.step->attack_frames,
                        channel.step->release_frames,
                        channel.elapsed_frames,
                        channel.duration_frames
                    )
                );
            }
        }
        --tracker.frames_remaining;
    }
    if (tracker.frames_remaining > 0) {
        return;
    }

    advance_tracker_step();
}

bool pcm_playback_has_sample(const PcmPlayback& playback) {
    if (!playback.playing || playback.asset == nullptr) {
        return false;
    }
    return (playback.position_fp >> 16) < playback.asset->sample_count || playback.asset->loop;
}

bool any_pcm_playing() {
    if (pcm_playback_has_sample(pcm_music)) {
        return true;
    }
    for (size_t index = 0; index < gbs::PCM_MIXER_MAX_SFX_VOICES; ++index) {
        if (pcm_playback_has_sample(pcm_sfx[index])) {
            return true;
        }
    }
    for (const PcmPlayback& playback : pcm_tracker) {
        if (pcm_playback_has_sample(playback)) {
            return true;
        }
    }
    return false;
}

void cleanup_finished_pcm_playback(PcmPlayback& playback) {
    if (!playback.playing || playback.asset == nullptr || playback.asset->loop) {
        return;
    }
    if ((playback.position_fp >> 16) >= playback.asset->sample_count) {
        reset_pcm_playback(playback);
    }
}

void cleanup_finished_pcm() {
    cleanup_finished_pcm_playback(pcm_music);
    for (size_t index = 0; index < gbs::PCM_MIXER_MAX_SFX_VOICES; ++index) {
        cleanup_finished_pcm_playback(pcm_sfx[index]);
    }
    for (PcmPlayback& playback : pcm_tracker) {
        cleanup_finished_pcm_playback(playback);
    }
}

// Samples times a 0..15 gain fit in 16 bits. This exact reciprocal keeps
// truncation toward zero while avoiding software division per mixed sample.
__attribute__((always_inline)) inline int32_t scale_pcm_sample(int32_t sample, uint8_t gain) {
    if (gain == 15) return sample;
    if (gain == 0) return 0;
    const int32_t product = sample * gain;
    const uint32_t magnitude = static_cast<uint32_t>(product < 0 ? -product : product);
    const int32_t scaled = static_cast<int32_t>((magnitude * 0x8889u) >> 19);
    return product < 0 ? -scaled : scaled;
}

// Reuse exact integer gain results across a block and voices with the same mix.
// Interpolation stays in the inner loop; only the repeated gain arithmetic moves.
// Cache only gain values, never asset data; changed settings replace the table.
uint8_t pcm_gain_key[4] {};
bool pcm_gain_key_valid = false;
bool pcm_block_stereo = false;
GBS_AUDIO_HOT_CODE void prepare_pcm_gain_table(uint8_t volume, uint8_t primary, uint8_t pcm, uint8_t pan) {
    if (pcm_gain_key_valid && pcm_gain_key[0] == volume && pcm_gain_key[1] == primary &&
        pcm_gain_key[2] == pcm && pcm_gain_key[3] == pan) return;
    for (int source = -128; source <= 127; ++source) {
        const int32_t sample = scale_pcm_sample(scale_pcm_sample(scale_pcm_sample(source, volume), primary), pcm);
        pcm_gain_left[source + 128] = static_cast<int8_t>(scale_pcm_sample(sample, pan));
    }
    pcm_gain_key[0] = volume; pcm_gain_key[1] = primary; pcm_gain_key[2] = pcm;
    pcm_gain_key[3] = pan; pcm_gain_key_valid = true;
}

// Keep only the sample loops in fast RAM; loop boundaries and playback state
// are handled once per run in ROM, leaving room for the full mixed project.
GBS_AUDIO_HOT_CODE void mix_pcm_native_run(const int8_t* samples, const int8_t* gains, int16_t* output, size_t count) {
    if (gains == nullptr) {
        for (int16_t* end = output + count; output != end; ++output) *output += *samples++;
    } else {
        for (int16_t* end = output + count; output != end; ++output) *output += gains[*samples++ + 128];
    }
}

GBS_AUDIO_HOT_CODE void mix_pcm_interpolated_run(const int8_t* samples, const int8_t* gains, uint32_t position, uint32_t step, int16_t* output, size_t count) {
    for (int16_t* end = output + count; output != end; ++output) {
        const uint32_t index = position >> 16;
        const int32_t current = samples[index];
        const int32_t sample = current + (((samples[index + 1u] - current) * static_cast<int32_t>(position & 0xFFFFu)) >> 16);
        *output += gains == nullptr ? sample : gains[sample + 128];
        position += step;
    }
}

void mix_pcm_voice_samples(PcmPlayback& playback, const int8_t* gains) {
    const gbs::PcmAsset& asset = *playback.asset;
    const int8_t* const samples = asset.samples;
    const uint32_t count = static_cast<uint32_t>(asset.sample_count);
    const uint32_t loop_start = static_cast<uint32_t>(asset.loop_start_sample);
    const uint32_t loop_end = static_cast<uint32_t>(gbs::pcm_loop_end_sample(asset));
    const uint32_t boundary = asset.loop ? loop_end : count;
    const uint32_t step = playback.step_fp;
    uint32_t position = playback.position_fp;
    size_t output = 0;
    while (output < gbs::PCM_MIXER_SAMPLES_PER_FRAME) {
        if ((position >> 16) >= count) { playback.playing = false; break; }
        const bool terminal = (position >> 16) == boundary - 1u;
        const uint32_t run_boundary = terminal ? boundary : boundary - 1u;
        const uint32_t distance = (run_boundary << 16) - position;
        const uint32_t until_boundary = distance / step + (distance % step != 0 ? 1u : 0u);
        const size_t remaining = gbs::PCM_MIXER_SAMPLES_PER_FRAME - output;
        const size_t run = until_boundary < remaining ? until_boundary : remaining;
        const uint32_t start = position;
        if (step == 65536u && (position & 0xFFFFu) == 0) {
            mix_pcm_native_run(samples + (position >> 16), gains, pcm_mix_accumulator + output, run);
            output += run;
            position += static_cast<uint32_t>(run) << 16;
        } else if (!terminal) {
            mix_pcm_interpolated_run(samples, gains, position, step, pcm_mix_accumulator + output, run);
            output += run;
            position += static_cast<uint32_t>(run) * step;
        } else {
            const int32_t current = samples[boundary - 1u];
            const int32_t difference = asset.loop ? samples[loop_start] - current : 0;
            for (size_t end = output + run; output < end; ++output) {
                const int32_t sample = current + ((difference * static_cast<int32_t>(position & 0xFFFFu)) >> 16);
                pcm_mix_accumulator[output] += gains == nullptr ? sample : gains[sample + 128];
                position += step;
            }
        }
        // Handle a boundary once per run, including 16.16 carry at 65535 samples.
        const uint64_t next = static_cast<uint64_t>(start) + static_cast<uint64_t>(run) * step;
        if (asset.loop && (next >> 16) >= loop_end) {
            const uint32_t overflow = static_cast<uint32_t>(next >> 16) - loop_end;
            position = ((loop_start + overflow % (loop_end - loop_start)) << 16) | (next & 0xFFFFu);
        } else {
            const uint64_t end = static_cast<uint64_t>(count) << 16;
            position = static_cast<uint32_t>(next < end ? next : end);
        }
    }
    playback.position_fp = position;
}

void mix_pcm_voice_block(const MixVoice& voice, bool right) {
    PcmPlayback& playback = *voice.playback;
    if (!playback.playing || playback.asset == nullptr) return;
    const uint8_t primary_gain = channel_volume(voice.primary);
    const uint8_t pcm_gain = channel_volume(voice.pcm);
    // Unity gain needs no table lookup; other mixes reuse exact integer gains.
    const uint8_t pan = right ? voice.pan.right : voice.pan.left;
    if (playback.volume == 15 && primary_gain == 15 && pcm_gain == 15 && pan == 15) {
        mix_pcm_voice_samples(playback, nullptr);
    } else {
        prepare_pcm_gain_table(playback.volume, primary_gain, pcm_gain, pan);
        mix_pcm_voice_samples(playback, pcm_gain_left);
    }
}

constexpr size_t pcm_max_mixed_magnitude = gbs::PCM_MIXER_MAX_ACTIVE_VOICES * 128;
struct PcmLimiterTable {
    uint8_t values[pcm_max_mixed_magnitude + 1] {};
    constexpr PcmLimiterTable() {
        for (size_t magnitude = 0; magnitude <= pcm_max_mixed_magnitude; ++magnitude) {
            const size_t excess = magnitude > 96 ? magnitude - 96 : 0;
            values[magnitude] = static_cast<uint8_t>(magnitude <= 96 ? magnitude : 96 + (excess * 31) / (excess + 32));
        }
    }
};
constexpr PcmLimiterTable pcm_limiter {};
__attribute__((always_inline)) inline int8_t clamp_pcm_sample(int32_t sample) {
    const size_t magnitude = static_cast<size_t>(sample < 0 ? -sample : sample);
    const int32_t limited = pcm_limiter.values[magnitude > pcm_max_mixed_magnitude ? pcm_max_mixed_magnitude : magnitude];
    return static_cast<int8_t>(sample < 0 ? -limited : limited);
}

constexpr uint8_t encode_pcm_fifo_sample(int8_t sample) {
    return static_cast<uint8_t>(sample);
}

GBS_AUDIO_HOT_CODE void clear_pcm_accumulator() {
    for (size_t index = 0; index < gbs::PCM_MIXER_SAMPLES_PER_FRAME; ++index) pcm_mix_accumulator[index] = 0;
}

GBS_AUDIO_HOT_CODE void write_pcm_mix_side(uint8_t* output, uint8_t* mono_mirror) {
    for (size_t index = 0; index < gbs::PCM_MIXER_SAMPLES_PER_FRAME; ++index) {
        output[index] = encode_pcm_fifo_sample(clamp_pcm_sample(pcm_mix_accumulator[index]));
        if (mono_mirror != nullptr) mono_mirror[index] = output[index];
    }
}

void update_pcm_mixer() {
    cleanup_finished_pcm();
    if (!any_pcm_playing()) {
        if (pcm_output_active) {
            gbs_hw_audio_finish_pcm8_stereo_stream();
            pcm_output_active = false;
        }
        return;
    }

    uint8_t* left_buffer = pcm_mix_buffers[pcm_mix_buffer_index][0];
    uint8_t* right_buffer = pcm_mix_buffers[pcm_mix_buffer_index][1];
    pcm_mix_buffer_index = static_cast<uint8_t>(1u - pcm_mix_buffer_index);

    MixVoice* const voices = pcm_mix_voices;
    size_t voice_count = 0;
    if (pcm_music.playing) voices[voice_count++] = { &pcm_music, gbs::AudioChannel::Music, gbs::AudioChannel::PcmMusic, { 15, 15 }, pcm_music.position_fp };
    for (PcmPlayback& playback : pcm_sfx) {
        if (playback.playing) voices[voice_count++] = { &playback, gbs::AudioChannel::Sfx, gbs::AudioChannel::PcmSfx, gbs::pcm_pan_gains(playback.pan), playback.position_fp };
    }
    for (PcmPlayback& playback : pcm_tracker) {
        if (playback.playing) voices[voice_count++] = { &playback, gbs::AudioChannel::Music, gbs::AudioChannel::PcmMusic, gbs::pcm_pan_gains(playback.pan), playback.position_fp };
    }
    pcm_block_stereo = false;
    for (size_t index = 0; index < voice_count; ++index) {
        if (voices[index].pan.left != voices[index].pan.right) pcm_block_stereo = true;
    }
    // Accumulate one side at a time to avoid a second 1056-byte scratch block.
    // Restore initial positions for the right pass; both passes advance identically.
    for (unsigned side = 0; side < (pcm_block_stereo ? 2u : 1u); ++side) {
        clear_pcm_accumulator();
        for (size_t index = 0; index < voice_count; ++index) {
            if (side != 0) {
                voices[index].playback->position_fp = voices[index].start_position;
                voices[index].playback->playing = true;
            }
            mix_pcm_voice_block(voices[index], side != 0);
        }
        uint8_t* output = side == 0 ? left_buffer : right_buffer;
        write_pcm_mix_side(output, pcm_block_stereo ? nullptr : right_buffer);
    }

    // FIFO can prefetch one burst beyond the frame boundary. Hold the final
    // value in owned padding; the VBlank handler bounds each DMA to one frame.
    for (size_t index = gbs::PCM_MIXER_SAMPLES_PER_FRAME; index < gbs::PCM_MIXER_SAMPLES_PER_FRAME + 32; ++index) {
        left_buffer[index] = left_buffer[gbs::PCM_MIXER_SAMPLES_PER_FRAME - 1];
        right_buffer[index] = right_buffer[gbs::PCM_MIXER_SAMPLES_PER_FRAME - 1];
    }
    if (!pcm_output_active) {
        gbs_hw_audio_start_pcm8_stereo_stream(gbs::PCM_MIXER_SAMPLE_RATE_HZ);
        pcm_output_active = true;
    }
    gbs_hw_audio_submit_pcm8_stereo_stream_block(
        left_buffer,
        right_buffer,
        static_cast<uint32_t>(gbs::PCM_MIXER_SAMPLES_PER_FRAME)
    );
    ++pcm_submitted_blocks;
    cleanup_finished_pcm();
    if (!any_pcm_playing()) {
        gbs_hw_audio_finish_pcm8_stereo_stream();
        pcm_output_active = false;
    }
}

size_t available_pcm_sfx_capacity() {
    size_t music_voices = pcm_playback_has_sample(pcm_music) ? 1u : 0u;
    for (const PcmPlayback& playback : pcm_tracker) {
        if (pcm_playback_has_sample(playback)) ++music_voices;
    }
    const size_t remaining = gbs::PCM_MIXER_MAX_ACTIVE_VOICES > music_voices
        ? gbs::PCM_MIXER_MAX_ACTIVE_VOICES - music_voices : 0u;
    return remaining < gbs::PCM_MIXER_MAX_SFX_VOICES ? remaining : gbs::PCM_MIXER_MAX_SFX_VOICES;
}

PcmPlayback* lowest_priority_pcm_sfx() {
    PcmPlayback* oldest_lowest = nullptr;
    for (size_t index = 0; index < gbs::PCM_MIXER_MAX_SFX_VOICES; ++index) {
        if (!pcm_sfx[index].playing) continue;
        if (oldest_lowest == nullptr ||
            pcm_sfx[index].priority < oldest_lowest->priority ||
            (pcm_sfx[index].priority == oldest_lowest->priority && pcm_sfx[index].age < oldest_lowest->age)) {
            oldest_lowest = &pcm_sfx[index];
        }
    }

    return oldest_lowest;
}

void enforce_pcm_voice_budget() {
    const size_t capacity = available_pcm_sfx_capacity();
    size_t active = gbs::audio_pcm_active_sfx_count();
    while (active > capacity) {
        PcmPlayback* victim = lowest_priority_pcm_sfx();
        if (victim == nullptr) break;
        reset_pcm_playback(*victim);
        --active;
    }
}

PcmPlayback* find_pcm_sfx_slot(uint8_t priority) {
    const size_t capacity = available_pcm_sfx_capacity();
    if (capacity == 0) return nullptr;
    if (gbs::audio_pcm_active_sfx_count() < capacity) {
        for (PcmPlayback& playback : pcm_sfx) {
            if (!playback.playing) return &playback;
        }
    }
    PcmPlayback* oldest_lowest = lowest_priority_pcm_sfx();
    if (oldest_lowest != nullptr && priority >= oldest_lowest->priority) {
        return oldest_lowest;
    }
    return nullptr;
}

} // namespace

namespace gbs {

bool is_valid_sfx_asset(const SfxAsset& asset) {
    if (asset.tones == nullptr || asset.tone_count == 0) {
        return false;
    }
    for (size_t index = 0; index < asset.tone_count; ++index) {
        if (!is_valid_sfx_tone(asset.tones[index])) {
            return false;
        }
    }
    return true;
}

bool is_valid_music_asset(const MusicAsset& asset) {
    if (asset.steps == nullptr || asset.step_count == 0) {
        return false;
    }
    for (size_t index = 0; index < asset.step_count; ++index) {
        if (!is_valid_music_step(asset.steps[index])) {
            return false;
        }
    }
    return true;
}

bool is_valid_tracker_asset(const TrackerAsset& asset) {
    if (asset.patterns == nullptr || asset.pattern_count == 0 || asset.order == nullptr || asset.order_count == 0) {
        return false;
    }
    for (size_t order_index = 0; order_index < asset.order_count; ++order_index) {
        if (asset.order[order_index] >= asset.pattern_count) {
            return false;
        }
    }
    for (size_t pattern_index = 0; pattern_index < asset.pattern_count; ++pattern_index) {
        const TrackerPattern& pattern = asset.patterns[pattern_index];
        if (pattern.steps == nullptr || pattern.step_count == 0) {
            return false;
        }
        bool pattern_waits = false;
        for (size_t step_index = 0; step_index < pattern.step_count; ++step_index) {
            if (!is_valid_tracker_step(pattern.steps[step_index])) {
                return false;
            }
            const TrackerStep& step = pattern.steps[step_index];
            if (step.sample_only && (step.sample_index < 0 || asset.samples == nullptr ||
                static_cast<size_t>(step.sample_index) >= asset.sample_count ||
                !is_valid_pcm_asset(asset.samples[step.sample_index]) || step.sample_rate_hz > 2097152)) return false;
            pattern_waits = pattern_waits || step.duration_frames > 0;
        }
        if (!pattern_waits) {
            return false;
        }
    }
    return true;
}

bool is_valid_pcm_asset(const PcmAsset& asset) {
    return asset.samples != nullptr &&
           asset.sample_count > 0 &&
           asset.sample_count <= 0xFFFFu &&
           is_valid_pcm_sample_rate(asset.sample_rate_hz) &&
           is_valid_pcm_loop(asset);
}

void audio_init() {
    [[maybe_unused]] const AudioStateLock lock;
    reset_sfx_state();
    reset_music_state();
    reset_tracker_state();
    reset_pcm_sfx_state();
    reset_pcm_music_state();
    pcm_output_active = false;
    pcm_submitted_blocks = 0;
    pcm_voice_age = 1;
    reset_audio_mutes();
    reset_audio_volumes();
    gbs_hw_audio_init();
}

void audio_vblank_update() {
    update_audio_volume_fades();
    update_sfx();
    update_music();
    update_tracker();
    update_pcm_mixer();
}

void audio_update() {
#if !defined(__arm__) && !defined(__thumb__)
    audio_vblank_update();
#endif
}

void set_audio_channel_muted(AudioChannel channel, bool muted) {
    [[maybe_unused]] const AudioStateLock lock;
    switch (channel) {
    case AudioChannel::Music:
        music_muted = muted;
        if (muted) {
            stop_music();
            stop_tracker_music();
            stop_pcm_music();
        }
        break;
    case AudioChannel::Sfx:
        sfx_muted = muted;
        if (muted) {
            stop_sfx();
            stop_pcm_sfx();
        }
        break;
    case AudioChannel::PcmMusic:
        pcm_music_muted = muted;
        if (muted) {
            stop_pcm_music();
        }
        break;
    case AudioChannel::PcmSfx:
        pcm_sfx_muted = muted;
        if (muted) {
            stop_pcm_sfx();
        }
        break;
    case AudioChannel::All:
        set_audio_channel_muted(AudioChannel::Music, muted);
        set_audio_channel_muted(AudioChannel::Sfx, muted);
        set_audio_channel_muted(AudioChannel::PcmMusic, muted);
        set_audio_channel_muted(AudioChannel::PcmSfx, muted);
        break;
    }
}

bool audio_is_channel_muted(AudioChannel channel) {
    switch (channel) {
    case AudioChannel::Music:
        return music_muted;
    case AudioChannel::Sfx:
        return sfx_muted;
    case AudioChannel::PcmMusic:
        return pcm_music_muted;
    case AudioChannel::PcmSfx:
        return pcm_sfx_muted;
    case AudioChannel::All:
        return music_muted && sfx_muted && pcm_music_muted && pcm_sfx_muted;
    }
    return false;
}

bool set_audio_channel_volume(AudioChannel channel, uint8_t volume) {
    if (!is_valid_audio_volume(volume)) {
        return false;
    }
    [[maybe_unused]] const AudioStateLock lock;
    if (channel == AudioChannel::All) {
        for (size_t index = 0; index < 4; ++index) {
            channel_volumes[index] = AudioVolumeState { volume, volume, volume, 0, 0 };
        }
        refresh_active_psg_outputs(true, true);
        return true;
    }
    AudioVolumeState& state = channel_volumes[audio_channel_index(channel)];
    state = AudioVolumeState { volume, volume, volume, 0, 0 };
    refresh_active_psg_outputs(channel == AudioChannel::Music, channel == AudioChannel::Sfx);
    return true;
}

bool fade_audio_channel_volume(AudioChannel channel, uint8_t target_volume, uint16_t frames) {
    if (!is_valid_audio_volume(target_volume)) {
        return false;
    }
    [[maybe_unused]] const AudioStateLock lock;
    if (frames == 0) {
        return set_audio_channel_volume(channel, target_volume);
    }
    if (channel == AudioChannel::All) {
        for (size_t index = 0; index < 4; ++index) {
            AudioVolumeState& state = channel_volumes[index];
            state = AudioVolumeState { state.current, state.current, target_volume, frames, frames };
        }
        return true;
    }
    AudioVolumeState& state = channel_volumes[audio_channel_index(channel)];
    state = AudioVolumeState { state.current, state.current, target_volume, frames, frames };
    return true;
}

uint8_t audio_channel_volume(AudioChannel channel) {
    if (channel != AudioChannel::All) {
        return channel_volume(channel);
    }
    uint8_t volume = 15;
    for (size_t index = 0; index < 4; ++index) {
        if (channel_volumes[index].current < volume) {
            volume = channel_volumes[index].current;
        }
    }
    return volume;
}

uint16_t audio_channel_fade_remaining(AudioChannel channel) {
    if (channel != AudioChannel::All) {
        return channel_volumes[audio_channel_index(channel)].remaining_frames;
    }
    uint16_t remaining = 0;
    for (size_t index = 0; index < 4; ++index) {
        if (channel_volumes[index].remaining_frames > remaining) {
            remaining = channel_volumes[index].remaining_frames;
        }
    }
    return remaining;
}

bool play_sfx(const SfxAsset& asset) {
    if (sfx_muted) {
        return false;
    }
    if (!is_valid_sfx_asset(asset)) {
        return false;
    }

    [[maybe_unused]] const AudioStateLock lock;
    sfx.tones = asset.tones;
    sfx.tone_count = asset.tone_count;
    sfx.index = 0;
    sfx.playing = true;
    start_sfx_tone(sfx.tones[0]);
    return true;
}

void stop_sfx() {
    [[maybe_unused]] const AudioStateLock lock;
    reset_sfx_state();
    gbs_hw_audio_stop_square(1);
    gbs_hw_audio_stop_noise();
}

bool play_music(const MusicAsset& asset) {
    if (music_muted) {
        return false;
    }
    if (!is_valid_music_asset(asset)) {
        return false;
    }

    [[maybe_unused]] const AudioStateLock lock;
    if (tracker.playing) {
        stop_tracker_music();
    }
    music.steps = asset.steps;
    music.step_count = asset.step_count;
    music.index = 0;
    music.loop = asset.loop;
    music.playing = true;
    start_music_step(music.steps[0]);
    return true;
}

void stop_music() {
    [[maybe_unused]] const AudioStateLock lock;
    reset_music_state();
    gbs_hw_audio_stop_square(2);
}

bool play_tracker_music(const TrackerAsset& asset) {
    if (music_muted) {
        return false;
    }
    if (!is_valid_tracker_asset(asset)) {
        return false;
    }

    [[maybe_unused]] const AudioStateLock lock;
    if (music.playing) {
        stop_music();
    }
    tracker.asset = &asset;
    tracker.order_index = 0;
    tracker.step_index = 0;
    tracker.playing = true;

    const TrackerPattern* pattern = current_tracker_pattern();
    if (pattern == nullptr) {
        reset_tracker_state();
        return false;
    }
    start_tracker_row();
    return true;
}

void stop_tracker_music() {
    [[maybe_unused]] const AudioStateLock lock;
    reset_tracker_state();
    gbs_hw_audio_stop_square(1);
    gbs_hw_audio_stop_square(2);
    gbs_hw_audio_stop_wave();
    gbs_hw_audio_stop_noise();
}

bool play_pcm_sfx(const PcmAsset& asset) {
    return play_pcm_sfx(asset, PcmSfxOptions {});
}

bool play_pcm_sfx(const PcmAsset& asset, const PcmSfxOptions& options) {
    if (sfx_muted || pcm_sfx_muted) {
        return false;
    }
    if (!is_valid_pcm_asset(asset)) {
        return false;
    }
    if (!is_valid_pcm_volume(options.volume) || !is_valid_pcm_pan(options.pan)) {
        return false;
    }

    [[maybe_unused]] const AudioStateLock lock;
    PcmPlayback* slot = find_pcm_sfx_slot(options.priority);
    if (slot == nullptr) {
        return false;
    }

    start_pcm_playback(*slot, asset, options.priority, options.volume, options.sample_rate_hz, options.pan);
    return true;
}

bool play_pcm_sfx(const PcmAsset& asset, uint8_t priority, uint8_t volume) {
    return play_pcm_sfx(asset, PcmSfxOptions { volume, priority });
}

void stop_pcm_sfx() {
    [[maybe_unused]] const AudioStateLock lock;
    reset_pcm_sfx_state();
    if (!any_pcm_playing() && pcm_output_active) {
        gbs_hw_audio_stop_pcm8_stream();
        pcm_output_active = false;
    }
}

bool play_pcm_music(const PcmAsset& asset) {
    return play_pcm_music(asset, 15);
}

bool play_pcm_music(const PcmAsset& asset, uint8_t volume) {
    if (music_muted || pcm_music_muted) {
        return false;
    }
    if (!is_valid_pcm_asset(asset)) {
        return false;
    }
    if (!is_valid_pcm_volume(volume)) {
        return false;
    }

    [[maybe_unused]] const AudioStateLock lock;
    start_pcm_playback(pcm_music, asset, 0, volume);
    enforce_pcm_voice_budget();
    return true;
}

void stop_pcm_music() {
    [[maybe_unused]] const AudioStateLock lock;
    reset_pcm_music_state();
    if (!any_pcm_playing() && pcm_output_active) {
        gbs_hw_audio_stop_pcm8_stream();
        pcm_output_active = false;
    }
}

void stop_all_pcm_sfx() {
    stop_pcm_sfx();
}

bool audio_is_sfx_playing() {
    return sfx.playing;
}

bool audio_is_music_playing() {
    return music.playing;
}

bool audio_is_tracker_music_playing() {
    return tracker.playing;
}

bool audio_is_pcm_sfx_playing() {
    for (size_t index = 0; index < PCM_MIXER_MAX_SFX_VOICES; ++index) {
        if (pcm_sfx[index].playing) {
            return true;
        }
    }
    return false;
}

bool audio_is_pcm_music_playing() {
    return pcm_music.playing;
}

size_t audio_pcm_active_sfx_count() {
    size_t count = 0;
    for (size_t index = 0; index < PCM_MIXER_MAX_SFX_VOICES; ++index) {
        if (pcm_sfx[index].playing) {
            ++count;
        }
    }
    return count;
}

size_t audio_pcm_mixer_capacity() {
    return PCM_MIXER_MAX_SFX_VOICES;
}

bool audio_is_pcm_streaming() {
    return pcm_output_active;
}

uint32_t audio_pcm_submitted_block_count() {
    return pcm_submitted_blocks;
}

AudioRuntimeUsage audio_runtime_usage() {
    [[maybe_unused]] const AudioStateLock lock;
    const PcmAsset* active_assets[PCM_MIXER_MAX_ACTIVE_VOICES] = {};
    size_t active_asset_count = 0;
    uint32_t pcm_source_bytes = 0;
    uint8_t active_voice_count = 0;

    const auto add_playback = [&](const PcmPlayback& playback) {
        if (!playback.playing || playback.asset == nullptr) {
            return;
        }
        ++active_voice_count;
        for (size_t index = 0; index < active_asset_count; ++index) {
            if (active_assets[index] == playback.asset) {
                return;
            }
        }
        if (active_asset_count < sizeof(active_assets) / sizeof(active_assets[0])) {
            active_assets[active_asset_count++] = playback.asset;
        }
        const uint64_t next_bytes = static_cast<uint64_t>(pcm_source_bytes) + playback.asset->sample_count;
        pcm_source_bytes = next_bytes > 0xFFFFFFFFu ? 0xFFFFFFFFu : static_cast<uint32_t>(next_bytes);
    };

    add_playback(pcm_music);
    for (size_t index = 0; index < PCM_MIXER_MAX_SFX_VOICES; ++index) {
        add_playback(pcm_sfx[index]);
    }
    for (size_t index = 0; index < sizeof(pcm_tracker) / sizeof(pcm_tracker[0]); ++index) {
        add_playback(pcm_tracker[index]);
    }

    const uint32_t mixer_buffer_bytes = static_cast<uint32_t>(sizeof(pcm_mix_buffers) + sizeof(pcm_mix_accumulator) + sizeof(pcm_mix_voices) + sizeof(pcm_gain_left));
    const uint64_t total_bytes = static_cast<uint64_t>(pcm_source_bytes) + mixer_buffer_bytes;
    return AudioRuntimeUsage {
        total_bytes > 0xFFFFFFFFu ? 0xFFFFFFFFu : static_cast<uint32_t>(total_bytes),
        pcm_source_bytes,
        mixer_buffer_bytes,
        active_voice_count,
        gbs_hw_audio_pcm_underrun_count(),
        pcm_submitted_blocks
    };
}

} // namespace gbs

extern "C" void gbs_audio_vblank_update(void) {
    gbs::audio_vblank_update();
}
