#include "gbs/profiler.hpp"
#include "gbs/audio.hpp"
#include "gbs_hw.h"

#if !defined(__arm__) && !defined(__thumb__)
extern "C" __attribute__((weak)) uint32_t gbs_hw_audio_pcm_underrun_count(void) {
    return 0;
}
#endif

// Exported projects override this hook; standalone SDK users keep the default.
extern "C" __attribute__((weak)) uint32_t gbs_project_audio_mixing_rate(void) {
    return gbs::PCM_MIXER_SAMPLE_RATE_HZ;
}

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
    uint32_t step_reciprocal;
    uint8_t volume;
    uint8_t priority;
    int8_t pan;
    uint16_t age;
    bool playing;
    bool native_sfx = false;
    uint8_t sample_gain = 255;
    bool sample_linear_pan = false;
    const gbs::PcmInterpolationMap* prepared_mix_map = nullptr;
    uint32_t source_rate_hz = 0;
};

struct AudioVolumeState {
    uint8_t current;
    uint8_t start;
    uint8_t target;
    uint16_t total_frames;
    uint16_t remaining_frames;
};

uint32_t pcm_mix_rate_hz = gbs::PCM_MIXER_SAMPLE_RATE_HZ;
uint16_t pcm_mix_sample_count = gbs::PCM_MIXER_SAMPLES_PER_FRAME;

SfxPlayback sfx {};
MusicPlayback music {};
TrackerPlayback tracker {};
#if defined(__arm__) || defined(__thumb__)
#define GBS_AUDIO_EWRAM __attribute__((section(".ewram_bss")))
#define GBS_AUDIO_FAST_RAM __attribute__((section(".iwram.audio_scratch")))
#define GBS_AUDIO_HOT_CODE __attribute__((section(".iwram"), target("arm"), optimize("O2"), noinline, noclone, long_call))
#define GBS_AUDIO_BLOCK_CODE __attribute__((target("arm"), optimize("O2"), noinline, long_call))
#else
#define GBS_AUDIO_EWRAM
#define GBS_AUDIO_FAST_RAM
#define GBS_AUDIO_HOT_CODE
#define GBS_AUDIO_BLOCK_CODE __attribute__((noinline))
#endif
PcmPlayback pcm_sfx[gbs::PCM_MIXER_MAX_SFX_VOICES] GBS_AUDIO_EWRAM {};
PcmPlayback pcm_music GBS_AUDIO_EWRAM {};
// Expanded tracker state stays out of the scarce IWRAM used by hot code.
TrackerChannelPlayback tracker_channels[gbs::TRACKER_MAX_SAMPLE_CHANNELS] GBS_AUDIO_EWRAM {};
PcmPlayback pcm_tracker[gbs::TRACKER_MAX_SAMPLE_CHANNELS] GBS_AUDIO_EWRAM {};
struct MixVoice {
    PcmPlayback* playback;
    gbs::AudioChannel primary;
    gbs::AudioChannel pcm;
    gbs::PcmPanGains pan;
};
// The IRQ stack is small; scratch voices live in EWRAM, like the mix buffers.
MixVoice pcm_mix_voices[gbs::PCM_MIXER_MAX_ACTIVE_VOICES] GBS_AUDIO_EWRAM {};
// One packed stereo accumulator shares resampling and accumulation; a small
// source window avoids repeated byte reads from ROM without changing samples.
uint32_t pcm_mix_accumulator[gbs::PCM_MIXER_SAMPLES_PER_FRAME] GBS_AUDIO_FAST_RAM {};
alignas(4) uint8_t pcm_mix_buffers[2][2][gbs::PCM_MIXER_SAMPLES_PER_FRAME + 32] GBS_AUDIO_EWRAM {};
uint32_t pcm_stereo_gain[256] GBS_AUDIO_FAST_RAM {};
alignas(4) int8_t pcm_source_window[512] GBS_AUDIO_FAST_RAM {};
const int8_t* pcm_cached_source = nullptr;
const int8_t* pcm_cached_data = nullptr;
size_t pcm_cached_count = 0;
uint16_t pcm_cached_loop_start = 0, pcm_cached_loop_end = 0;
bool pcm_cache_padded = false;
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
    int8_t pan = 0,
    const gbs::TrackerStep* prepared_step = nullptr
);
GBS_AUDIO_BLOCK_CODE void start_tracker_sample(const gbs::TrackerStep& step);
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

// Observing all voices can span scanlines. Block audio/game mutations while
// letting the hardware's bounded, audio-independent raster service continue.
class AudioObserverLock {
#if defined(__arm__) || defined(__thumb__)
    uint32_t previous_;
public:
    AudioObserverLock() : previous_(gbs_hw_audio_lock_observer_state()) {}
    ~AudioObserverLock() { gbs_hw_audio_unlock_observer_state(previous_); }
#else
public:
    AudioObserverLock() = default;
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

void stop_previous_sfx_channel_if_changed(const gbs::SfxTone& previous, const gbs::SfxTone& next) {
    if (previous.noise == next.noise) return;
    if (previous.noise) gbs_hw_audio_stop_noise();
    else gbs_hw_audio_stop_square(1);
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

GBS_AUDIO_BLOCK_CODE void start_tracker_step(const gbs::TrackerStep& step) {
    TrackerChannelPlayback& channel = tracker_channels[step.channel - 1u];
    if (step.sample_only && step.attack_frames == 0 && step.release_frames == 0) channel.step = nullptr;
    else channel = TrackerChannelPlayback { &step, 0, step.duration_frames };
    // PSG envelope registers latch their initial volume when the channel is
    // triggered. Starting at zero silences the DAC and later writes cannot
    // reproduce a software attack reliably on real GBA hardware.
    if (step.sample_only) {
        if (step.channel == 4) gbs_hw_audio_stop_noise();
        else if (step.channel == 3) gbs_hw_audio_stop_wave();
        else if (step.channel <= 2) gbs_hw_audio_stop_square(step.channel);
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
    playback.source_rate_hz = 0;
    playback.position_fp = 0;
    playback.step_fp = 0;
    playback.step_reciprocal = 0;
    playback.volume = 0;
    playback.priority = 0;
    playback.pan = 0;
    playback.age = 0;
    playback.playing = false;
    playback.native_sfx = false;
    playback.sample_gain = 255;
    playback.sample_linear_pan = false;
    playback.prepared_mix_map = nullptr;
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

#if defined(__arm__) || defined(__thumb__)
__attribute__((target("arm"), optimize("O2"), noinline, long_call))
#endif
uint32_t pcm_step_for_asset(const gbs::PcmAsset& asset, uint32_t sample_rate_hz) {
    const uint32_t playback_rate_hz = sample_rate_hz == 0 ? asset.sample_rate_hz : sample_rate_hz;
    static_assert(gbs::PCM_MIXER_SAMPLE_RATE_HZ == 31536, "PCM rate reduction");
    // 65536/31536 == 4096/1971. Split the quotient so both exact divisions
    // stay in 32 bits, avoiding a 64-bit division for every tracker control.
    uint32_t step;
    if (pcm_mix_rate_hz == 10512) step = (playback_rate_hz / 657u) * 4096u + ((playback_rate_hz % 657u) * 4096u) / 657u;
    else if (pcm_mix_rate_hz == 21024) step = (playback_rate_hz / 657u) * 2048u + ((playback_rate_hz % 657u) * 2048u) / 657u;
    else step = (playback_rate_hz / 1971u) * 4096u + ((playback_rate_hz % 1971u) * 4096u) / 1971u;
    if (step == 0) {
        step = 1;
    }
    return step;
}

void start_pcm_playback(PcmPlayback& playback, const gbs::PcmAsset& asset, uint8_t priority, uint8_t volume, uint32_t sample_rate_hz, int8_t pan, const gbs::TrackerStep* prepared_step) {
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
    playback.source_rate_hz = sample_rate_hz ? sample_rate_hz : asset.sample_rate_hz;
    playback.position_fp = 0;
    playback.step_fp = prepared_step && prepared_step->sample_step_fp && pcm_mix_rate_hz == gbs::PCM_MIXER_SAMPLE_RATE_HZ ? prepared_step->sample_step_fp : pcm_step_for_asset(asset, sample_rate_hz);
    playback.step_reciprocal = prepared_step && prepared_step->sample_step_fp && pcm_mix_rate_hz == gbs::PCM_MIXER_SAMPLE_RATE_HZ ? prepared_step->sample_step_reciprocal : 0xFFFFFFFFu / playback.step_fp;
    playback.volume = volume;
    playback.priority = priority;
    playback.pan = pan;
    playback.age = pcm_voice_age++;
    playback.playing = true;
    playback.sample_gain = 255;
    playback.sample_linear_pan = false;
    playback.prepared_mix_map = nullptr;
}

GBS_AUDIO_BLOCK_CODE void start_tracker_sample(const gbs::TrackerStep& step) {
    // assetc represents an empty imported pattern with a silent timing step.
    if (step.sample_index < 0 && step.volume == 0 && tracker.asset != nullptr &&
        tracker.asset->sustain_sample_channels) return;
    PcmPlayback& playback = pcm_tracker[step.channel - 1u];
    if (step.sample_continue) {
        if (!playback.playing || playback.asset == nullptr) return;
        playback.source_rate_hz = step.sample_rate_hz ? step.sample_rate_hz : playback.asset->sample_rate_hz;
        const uint32_t next_step = step.sample_step_fp && pcm_mix_rate_hz == gbs::PCM_MIXER_SAMPLE_RATE_HZ ? step.sample_step_fp : pcm_step_for_asset(*playback.asset, step.sample_rate_hz);
        if (next_step != playback.step_fp) {
            playback.step_fp = next_step;
            playback.step_reciprocal = step.sample_step_fp && pcm_mix_rate_hz == gbs::PCM_MIXER_SAMPLE_RATE_HZ ? step.sample_step_reciprocal : 0xFFFFFFFFu / next_step;
        }
        playback.volume = step.volume;
        playback.pan = step.pan;
        playback.sample_gain = step.sample_gain;
        playback.sample_linear_pan = step.sample_linear_pan;
        playback.prepared_mix_map = step.prepared_mix_map;
        return;
    }
    if (step.volume == 0 || step.sample_index < 0 || tracker.asset == nullptr || tracker.asset->samples == nullptr ||
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
        step.pan,
        &step
    );
    playback.sample_gain = step.sample_gain;
    playback.sample_linear_pan = step.sample_linear_pan;
    playback.prepared_mix_map = step.prepared_mix_map;
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

    const gbs::SfxTone& previous = sfx.tones[sfx.index];
    ++sfx.index;
    if (sfx.index >= sfx.tone_count) {
        gbs::stop_sfx();
        return;
    }

    stop_previous_sfx_channel_if_changed(previous, sfx.tones[sfx.index]);
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

GBS_AUDIO_BLOCK_CODE void start_tracker_row() {
    uint32_t active_channels = 0;
    const gbs::TrackerPattern* pattern = current_tracker_pattern();
    while (tracker.playing) {
        if (pattern == nullptr || tracker.step_index >= pattern->step_count) {
            gbs::stop_tracker_music();
            return;
        }
        const gbs::TrackerStep& step = pattern->steps[tracker.step_index];
        active_channels |= 1u << (step.channel - 1u);
        start_tracker_step(step);
        if (tracker.frames_remaining > 0) {
            for (size_t channel_index = 0; channel_index < gbs::TRACKER_MAX_SAMPLE_CHANNELS; ++channel_index) {
                if ((active_channels & (1u << channel_index)) != 0) {
                    if (tracker_channels[channel_index].step != nullptr) tracker_channels[channel_index].duration_frames = tracker.frames_remaining;
                } else if (!tracker.asset->sustain_sample_channels) {
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
        if (tracker.step_index + 1u < pattern->step_count) ++tracker.step_index;
        else {
            if (!advance_tracker_position()) return;
            pattern = current_tracker_pattern();
        }
    }
}

void advance_tracker_step() {
    if (advance_tracker_position()) {
        start_tracker_row();
    }
}

GBS_AUDIO_BLOCK_CODE void update_tracker() {
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

// A biased pair of 16-bit lanes accumulates stereo with one 32-bit add. The
// left-negative correction cancels its carry into the right lane. Seventeen
// signed 8-bit voices cannot cross either lane's bias or overflow its range.
static_assert(gbs::PCM_MIXER_MAX_ACTIVE_VOICES * 128 < 32768, "packed PCM lane budget");
constexpr uint32_t pcm_stereo_bias = 0x80008000u;
uint8_t pcm_gain_key[7] {};
bool pcm_gain_key_valid = false;
GBS_AUDIO_HOT_CODE void prepare_pcm_gain_table(uint8_t volume, uint8_t primary, uint8_t pcm, gbs::PcmPanGains pan, uint8_t fine_gain, bool linear_pan) {
    if (pcm_gain_key_valid && pcm_gain_key[0] == volume && pcm_gain_key[1] == primary && pcm_gain_key[2] == pcm &&
        pcm_gain_key[3] == pan.left && pcm_gain_key[4] == pan.right && pcm_gain_key[5] == fine_gain && pcm_gain_key[6] == linear_pan) return;
    for (int source = -128; source <= 127; ++source) {
        const int32_t fine = fine_gain == 255 ? source : source * fine_gain / 255;
        const int32_t sample = scale_pcm_sample(scale_pcm_sample(scale_pcm_sample(fine, volume), primary), pcm);
        const int32_t left = linear_pan ? sample * pan.left / 255 : scale_pcm_sample(sample, pan.left);
        const int32_t right = linear_pan ? sample * pan.right / 255 : scale_pcm_sample(sample, pan.right);
        pcm_stereo_gain[source + 128] = static_cast<uint16_t>(left) |
            (static_cast<uint32_t>(static_cast<uint16_t>(right - (left < 0 ? 1 : 0))) << 16);
    }
    pcm_gain_key[0] = volume; pcm_gain_key[1] = primary; pcm_gain_key[2] = pcm;
    pcm_gain_key[3] = pan.left; pcm_gain_key[4] = pan.right; pcm_gain_key[5] = fine_gain; pcm_gain_key[6] = linear_pan;
    pcm_gain_key_valid = true;
}

GBS_AUDIO_HOT_CODE void mix_pcm_native_run(const int8_t* samples, uint32_t* output, size_t count, [[maybe_unused]] bool unity = false) {
    while (count && (reinterpret_cast<uintptr_t>(samples) & 3u)) {
        *output++ += pcm_stereo_gain[*samples++ + 128]; --count;
    }
    if (count == 0) return;
    const auto* words = static_cast<const uint32_t*>(__builtin_assume_aligned(samples, 4));
#if defined(__arm__) || defined(__thumb__)
    size_t groups = count / 4;
    if (groups && unity) {
        // Legacy centered PCM retains its no-LUT fast path. s + (s << 16)
        // encodes both signed lanes, including the left-negative carry fix.
        asm volatile(
            "1: ldr r4, [%[input]], #4\n" "ldmia %[output], {r5-r8}\n"
            "mov r9, r4, lsl #24\n" "mov r9, r9, asr #24\n" "add r5, r5, r9\n" "add r5, r5, r9, lsl #16\n"
            "mov r9, r4, lsl #16\n" "mov r9, r9, asr #24\n" "add r6, r6, r9\n" "add r6, r6, r9, lsl #16\n"
            "mov r9, r4, lsl #8\n" "mov r9, r9, asr #24\n" "add r7, r7, r9\n" "add r7, r7, r9, lsl #16\n"
            "mov r9, r4, asr #24\n" "add r8, r8, r9\n" "add r8, r8, r9, lsl #16\n"
            "stmia %[output]!, {r5-r8}\n" "subs %[groups], %[groups], #1\n" "bne 1b\n"
            : [input] "+&r" (words), [output] "+&r" (output), [groups] "+&r" (groups)
            : : "r4", "r5", "r6", "r7", "r8", "r9", "cc", "memory");
    } else if (groups) {
        // Block transfers amortize IWRAM read/write cycles over four outputs.
        // Bias all source bytes once, retaining the exact signed LUT indices.
        asm volatile(
            "1: ldr r4, [%[input]], #4\n"
            "eor r4, r4, %[bias]\n"
            "ldmia %[output], {r5-r8}\n"
            "and r9, r4, #255\n" "ldr r10, [%[gain], r9, lsl #2]\n" "add r5, r5, r10\n"
            "mov r9, r4, lsr #8\n" "and r9, r9, #255\n" "ldr r10, [%[gain], r9, lsl #2]\n" "add r6, r6, r10\n"
            "mov r9, r4, lsr #16\n" "and r9, r9, #255\n" "ldr r10, [%[gain], r9, lsl #2]\n" "add r7, r7, r10\n"
            "mov r9, r4, lsr #24\n" "ldr r10, [%[gain], r9, lsl #2]\n" "add r8, r8, r10\n"
            "stmia %[output]!, {r5-r8}\n"
            "subs %[groups], %[groups], #1\n" "bne 1b\n"
            : [input] "+&r" (words), [output] "+&r" (output), [groups] "+&r" (groups)
            : [gain] "r" (pcm_stereo_gain), [bias] "r" (0x80808080u)
            : "r4", "r5", "r6", "r7", "r8", "r9", "r10", "cc", "memory");
    }
    count %= 4;
#else
    for (; count >= 4; count -= 4, output += 4) {
        uint32_t packed; __builtin_memcpy(&packed, words++, sizeof(packed));
        output[0] += pcm_stereo_gain[(packed & 255u) ^ 128u];
        output[1] += pcm_stereo_gain[((packed >> 8) & 255u) ^ 128u];
        output[2] += pcm_stereo_gain[((packed >> 16) & 255u) ^ 128u];
        output[3] += pcm_stereo_gain[(packed >> 24) ^ 128u];
    }
#endif
    samples = reinterpret_cast<const int8_t*>(words);
    for (size_t i = 0; i < count; ++i) output[i] += pcm_stereo_gain[samples[i] + 128];
}

GBS_AUDIO_HOT_CODE uint32_t mix_pcm_interpolated_run(const int8_t* samples, uint32_t position, uint32_t step, uint32_t* output, size_t count, uint32_t wrap_end = 0xFFFFFFFFu, uint32_t wrap_length = 0) {
    const auto mix = [&](size_t i) {
        const uint32_t index = position >> 16;
        const int32_t current = samples[index];
        const int32_t sample = current + (((samples[index + 1u] - current) * static_cast<int32_t>(position & 0xFFFFu)) >> 16);
        output[i] += pcm_stereo_gain[sample + 128];
        position += step;
        if (position >= wrap_end) position -= wrap_length;
    };
    for (; count >= 4; count -= 4, output += 4) { mix(0); mix(1); mix(2); mix(3); }
    for (size_t i = 0; i < count; ++i) mix(i);
    return position;
}

GBS_AUDIO_HOT_CODE int8_t* cache_pcm_source_window(const int8_t* source, size_t count) {
    // Match alignment without reading before/after the source asset.
    auto* begin = pcm_source_window + (reinterpret_cast<uintptr_t>(source) & 3u);
    auto* destination = begin;
    while (count && (reinterpret_cast<uintptr_t>(source) & 3u)) { *destination++ = *source++; --count; }
    if (count == 0) return begin;
    auto* aligned_source = static_cast<const int8_t*>(__builtin_assume_aligned(source, 4));
    auto* aligned_destination = static_cast<int8_t*>(__builtin_assume_aligned(destination, 4));
    for (; count >= 4; count -= 4, aligned_source += 4, aligned_destination += 4) {
        uint32_t packed; __builtin_memcpy(&packed, aligned_source, 4); __builtin_memcpy(aligned_destination, &packed, 4);
    }
    for (size_t i = 0; i < count; ++i) aligned_destination[i] = aligned_source[i];
    return begin;
}

// Maps are generated at export time from exact integer interpolation and
// gain arithmetic. A binary search selects the current mix without rebuilding
// tables in the VBlank IRQ; missing configurations retain the normal resampler.
const gbs::PcmInterpolationMap* find_pcm_interpolation_map(const gbs::PcmAsset& asset, uint32_t key) {
    uint32_t lo = 0, hi = asset.interpolation_map_count;
    while (lo < hi) {
        const uint32_t mid = (lo + hi) / 2u;
        if (asset.interpolation_maps[mid].mix_key < key) lo = mid + 1u; else hi = mid;
    }
    return lo < asset.interpolation_map_count && asset.interpolation_maps[lo].mix_key == key ? &asset.interpolation_maps[lo] : nullptr;
}

__attribute__((always_inline)) inline void mix_pcm_constant_run(uint32_t* output, size_t count, uint32_t gain) {
    if (gain == 0) return;
#if defined(__arm__) || defined(__thumb__)
    size_t groups = count / 4;
    if (groups) {
        asm volatile(
            "1: ldmia %[output], {r4-r7}\n"
            "add r4, r4, %[gain]\n" "add r5, r5, %[gain]\n" "add r6, r6, %[gain]\n" "add r7, r7, %[gain]\n"
            "stmia %[output]!, {r4-r7}\n" "subs %[groups], %[groups], #1\n" "bne 1b\n"
            : [output] "+&r" (output), [groups] "+&r" (groups)
            : [gain] "r" (gain) : "r4", "r5", "r6", "r7", "cc", "memory");
    }
    count %= 4;
#else
    for (; count >= 4; count -= 4, output += 4) {
        output[0] += gain; output[1] += gain; output[2] += gain; output[3] += gain;
    }
#endif
    for (size_t i = 0; i < count; ++i) output[i] += gain;
}

GBS_AUDIO_HOT_CODE void mix_pcm_prepared_block(PcmPlayback& playback, const gbs::PcmInterpolationMap& cache) {
    const size_t output_count = pcm_mix_sample_count;
    const uint32_t step = playback.step_fp, reciprocal = playback.step_reciprocal;
    const bool pre_pan = (cache.mix_key & gbs::PCM_INTERPOLATION_PRE_PAN) != 0;
    const uint32_t loop_end = static_cast<uint32_t>(gbs::pcm_loop_end_sample(*playback.asset)) << 16;
    const uint32_t loop_length = loop_end - (static_cast<uint32_t>(playback.asset->loop_start_sample) << 16);
    const auto* const intervals = cache.intervals;
    const uint32_t loop_index = cache.loop_index;
    uint32_t position = playback.position_fp;
    uint32_t lo = 0, hi = cache.interval_count;
    while (lo < hi) {
        const uint32_t mid = (lo + hi) / 2u;
        if (intervals[mid].end <= position) lo = mid + 1u; else hi = mid;
    }
    uint32_t interval = lo;
    uint32_t interval_end = intervals[interval].end;
    size_t output = 0;
    while (output < output_count) {
        const uint32_t raw_gain = intervals[interval].gain;
        const uint32_t gain = pre_pan ? pcm_stereo_gain[static_cast<int16_t>(raw_gain) + 128] : raw_gain;
        // floor((distance-1)/step)+1, using a downward reciprocal.
        // The product cannot overflow, even at the 65535-sample boundary;
        // one remainder correction gives the exact ceiling.
        const uint32_t distance = interval_end - position - 1u;
        uint32_t run = static_cast<uint32_t>((static_cast<uint64_t>(distance) * reciprocal) >> 32);
        run += (distance - run * step >= step) + 1u;
        const size_t remaining = output_count - output;
        if (run > remaining) run = static_cast<uint32_t>(remaining);
        mix_pcm_constant_run(pcm_mix_accumulator + output, run, gain);
        const uint32_t next = position + run * step;
        const bool wrapped = next < position || next >= loop_end;
        position = next; output += run;
        if (wrapped) position -= loop_length;
        if (output == output_count) break;
        // An unclamped run has crossed its interval by construction.
        interval = wrapped ? loop_index : interval + 1u;
        interval_end = intervals[interval].end;
        while (interval_end <= position) interval_end = intervals[++interval].end;
    }
    playback.position_fp = position;
}

// Only the per-sample kernels occupy IWRAM. Boundary/state work stays in ROM.
GBS_AUDIO_BLOCK_CODE void mix_pcm_voice_samples(PcmPlayback& playback, const int8_t* prepared_samples, bool unity) {
    const size_t output_count = pcm_mix_sample_count;
    const gbs::PcmAsset& asset = *playback.asset;
    const int8_t* samples = prepared_samples != nullptr ? prepared_samples : asset.samples;
    const uint32_t count = static_cast<uint32_t>(asset.sample_count);
    const uint32_t loop_start = static_cast<uint32_t>(asset.loop_start_sample);
    const uint32_t loop_end = static_cast<uint32_t>(gbs::pcm_loop_end_sample(asset));
    const uint32_t boundary = asset.loop ? loop_end : count;
    const uint32_t step = playback.step_fp;
    uint32_t position = playback.position_fp;
    size_t output = 0;
    if (step == 65536u && (position & 0xFFFFu) == 0) {
        uint32_t index = position >> 16;
        while (output < output_count) {
            if (index >= count) { playback.playing = false; break; }
            const size_t remaining = output_count - output;
            const size_t run = boundary - index < remaining ? boundary - index : remaining;
            mix_pcm_native_run(samples + index, pcm_mix_accumulator + output, run, unity);
            index += run; output += run;
            if (asset.loop && index == loop_end) index = loop_start;
        }
        playback.position_fp = index << 16;
        return;
    }
    // A short loop can stay in fast RAM for the entire block. Pad its seam
    // once, then wrap with one conditional subtraction instead of dispatching
    // back through the generic boundary machinery for every cycle.
    if (asset.loop && count <= sizeof(pcm_source_window) - 4u && step <= ((loop_end - loop_start) << 16) && position < (loop_end << 16)) {
        if (pcm_cached_source != samples || pcm_cached_count != count || !pcm_cache_padded ||
            pcm_cached_loop_start != loop_start || pcm_cached_loop_end != loop_end) {
            auto* cached = cache_pcm_source_window(samples, count);
            cached[loop_end] = cached[loop_start];
            pcm_cached_data = cached; pcm_cached_source = samples; pcm_cached_count = count;
            pcm_cached_loop_start = static_cast<uint16_t>(loop_start); pcm_cached_loop_end = static_cast<uint16_t>(loop_end); pcm_cache_padded = true;
        }
        playback.position_fp = mix_pcm_interpolated_run(pcm_cached_data, position, step, pcm_mix_accumulator, output_count, loop_end << 16, (loop_end - loop_start) << 16);
        return;
    }
    while (output < output_count) {
        if ((position >> 16) >= count) { playback.playing = false; break; }
        const bool terminal = (position >> 16) == boundary - 1u;
        const uint32_t run_boundary = terminal ? boundary : boundary - 1u;
        const uint32_t distance = (run_boundary << 16) - position;
        // The reciprocal underestimates floor(distance/step) by at most one.
        // Two bounded corrections give the exact ceiling without a divide.
        uint32_t until_boundary = static_cast<uint32_t>((static_cast<uint64_t>(distance) * playback.step_reciprocal) >> 32);
        const uint32_t remainder = distance - until_boundary * step;
        until_boundary += (remainder != 0) + (remainder > step);
        const size_t remaining = output_count - output;
        size_t run = until_boundary < remaining ? until_boundary : remaining;
        const uint32_t start = position;
        if (!terminal) {
            const uint32_t first = position >> 16;
            const int8_t* input;
            uint32_t input_position;
            if (count <= sizeof(pcm_source_window) - 3u) {
                if (pcm_cached_source != samples || pcm_cached_count != count || pcm_cache_padded) {
                    pcm_cached_data = cache_pcm_source_window(samples, count);
                    pcm_cached_source = samples; pcm_cached_count = count;
                    pcm_cache_padded = false;
                }
                input = pcm_cached_data; input_position = position;
            } else {
                pcm_cached_source = nullptr;
                const auto span_for = [&](size_t length) { return ((static_cast<uint64_t>(position) + static_cast<uint64_t>(length - 1u) * step) >> 16) - first + 2u; };
                while (run > 1 && span_for(run) > sizeof(pcm_source_window) - 3u) run = (run + 1u) / 2u;
                input = cache_pcm_source_window(samples + first, span_for(run)); input_position = position - (first << 16);
            }
            mix_pcm_interpolated_run(input, input_position, step, pcm_mix_accumulator + output, run);
            output += run;
        } else {
            const int32_t current = samples[boundary - 1u];
            const int32_t difference = asset.loop ? samples[loop_start] - current : 0;
            for (size_t end = output + run; output < end; ++output) {
                const int32_t sample = current + ((difference * static_cast<int32_t>(position & 0xFFFFu)) >> 16);
                pcm_mix_accumulator[output] += pcm_stereo_gain[sample + 128];
                position += step;
            }
        }
        // The validated <= 2,097,152 Hz override times one block fits in
        // 32 bits. Detect the addition carry explicitly at the 65535 boundary.
        static_assert((2097152ull * 65536 / 10512) * 176u < (1ull << 32), "PCM block advance");
        const uint32_t next = start + static_cast<uint32_t>(run) * step;
        const uint32_t next_index = (next >> 16) + (next < start ? 65536u : 0u);
        if (asset.loop && next_index >= loop_end) {
            uint32_t overflow = next_index - loop_end;
            const uint32_t loop_length = loop_end - loop_start;
            if (overflow >= loop_length) overflow %= loop_length;
            position = ((loop_start + overflow) << 16) | (next & 0xFFFFu);
        } else {
            position = next_index < count ? next : count << 16;
        }
    }
    playback.position_fp = position;
}

uint16_t pcm_mix_peak_bound = 0;
uint32_t pcm_peak_key = 0;
uint8_t pcm_peak_value = 0;
bool pcm_peak_valid = false;
uint8_t pcm_voice_peak_bound(const PcmPlayback& playback, uint8_t primary, uint8_t pcm, gbs::PcmPanGains pan) {
    const uint32_t key = gbs::pcm_interpolation_mix_key(playback.volume, primary, pcm, playback.sample_gain, playback.pan, playback.sample_linear_pan);
    if (pcm_peak_valid && pcm_peak_key == key) return pcm_peak_value;
    // Every stage is a nonnegative contraction with truncation toward zero.
    // The magnitude at signed -128 therefore bounds every interpolated sample.
    int32_t peak = 128 * playback.sample_gain / 255;
    peak = scale_pcm_sample(scale_pcm_sample(scale_pcm_sample(peak, playback.volume), primary), pcm);
    const uint8_t pan_gain = pan.left > pan.right ? pan.left : pan.right;
    peak = playback.sample_linear_pan ? peak * pan_gain / 255 : scale_pcm_sample(peak, pan_gain);
    pcm_peak_key = key; pcm_peak_value = static_cast<uint8_t>(peak); pcm_peak_valid = true;
    return pcm_peak_value;
}

void mix_pcm_voice_block(const MixVoice& voice) {
    auto& playback = *voice.playback;
    if (!playback.playing || playback.asset == nullptr) return;
    const auto primary = channel_volume(voice.primary), pcm = channel_volume(voice.pcm);
    const bool prepared = playback.sample_gain == 255 && playback.volume == 15 && pcm == 15 &&
        playback.step_fp == 65536u && (playback.position_fp & 0xFFFFu) == 0 &&
        playback.asset->native_gain_samples != nullptr && playback.asset->native_gain_primary_volume == primary;
    pcm_mix_peak_bound += pcm_voice_peak_bound(playback, prepared ? 15 : primary, pcm, voice.pan);
    if (playback.asset->interpolation_maps != nullptr && playback.asset->interpolation_map_count &&
        playback.step_fp <= ((gbs::pcm_loop_end_sample(*playback.asset) - playback.asset->loop_start_sample) << 16)) {
        const uint32_t key = gbs::pcm_interpolation_mix_key(playback.volume, primary, pcm, playback.sample_gain, playback.pan, playback.sample_linear_pan);
        const uint32_t mono_key = (key & 0x0fff00ffu) | gbs::PCM_INTERPOLATION_PRE_PAN;
        const auto* map = playback.prepared_mix_map;
        if (map == nullptr || (map->mix_key != key && map->mix_key != mono_key)) {
            map = find_pcm_interpolation_map(*playback.asset, key);
            if (map == nullptr) map = find_pcm_interpolation_map(*playback.asset, mono_key);
        }
        if (map != nullptr) {
            if (map->mix_key & gbs::PCM_INTERPOLATION_PRE_PAN) prepare_pcm_gain_table(15, 15, 15, voice.pan, 255, playback.sample_linear_pan);
            mix_pcm_prepared_block(playback, *map); return;
        }
    }
    prepare_pcm_gain_table(playback.volume, prepared ? 15 : primary, pcm, voice.pan, playback.sample_gain, playback.sample_linear_pan);
    const bool unity = playback.sample_gain == 255 && playback.volume == 15 && pcm == 15 &&
        (prepared || primary == 15) && !playback.sample_linear_pan && voice.pan.left == 15 && voice.pan.right == 15;
    mix_pcm_voice_samples(playback, prepared ? playback.asset->native_gain_samples : nullptr, unity);
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
    if (magnitude <= 96) return static_cast<int8_t>(sample);
    const int32_t limited = pcm_limiter.values[magnitude > pcm_max_mixed_magnitude ? pcm_max_mixed_magnitude : magnitude];
    return static_cast<int8_t>(sample < 0 ? -limited : limited);
}

constexpr uint8_t encode_pcm_fifo_sample(int8_t sample) {
    return static_cast<uint8_t>(sample);
}

GBS_AUDIO_HOT_CODE void clear_pcm_accumulator() {
    for (size_t i = 0; i < pcm_mix_sample_count; ++i) pcm_mix_accumulator[i] = pcm_stereo_bias;
}

GBS_AUDIO_HOT_CODE void write_pcm_mix_stereo(uint8_t* left_buffer, uint8_t* right_buffer, bool mono) {
    const size_t output_count = pcm_mix_sample_count;
    if (pcm_mix_peak_bound <= 96) {
        // Both biased lanes are inside the limiter's exact identity region.
        // Their low bytes are already signed FIFO values; publish four at once.
        auto* left_words = static_cast<uint8_t*>(__builtin_assume_aligned(left_buffer, 4));
        auto* right_words = static_cast<uint8_t*>(__builtin_assume_aligned(right_buffer, 4));
        for (size_t i = 0; i < output_count; i += 4) {
            const uint32_t a = pcm_mix_accumulator[i], b = pcm_mix_accumulator[i + 1];
            const uint32_t c = pcm_mix_accumulator[i + 2], d = pcm_mix_accumulator[i + 3];
            const uint32_t left = (a & 255u) | ((b & 255u) << 8) | ((c & 255u) << 16) | (d << 24);
            const uint32_t right = mono ? left : ((a >> 16) & 255u) | ((b >> 8) & 0xff00u) | (c & 0xff0000u) | ((d << 8) & 0xff000000u);
            __builtin_memcpy(left_words + i, &left, 4); __builtin_memcpy(right_words + i, &right, 4);
        }
        return;
    }

    if (mono) {
        for (size_t i = 0; i < output_count; ++i) {
            const int32_t left = static_cast<int32_t>(pcm_mix_accumulator[i] & 65535u) - 32768;
            const uint8_t value = encode_pcm_fifo_sample(clamp_pcm_sample(left));
            left_buffer[i] = value; right_buffer[i] = value;
        }
        return;
    }
    for (size_t i = 0; i < output_count; ++i) {
        const uint32_t value = pcm_mix_accumulator[i];
        const int32_t left = static_cast<int32_t>(value & 65535u) - 32768;
        const int32_t right = static_cast<int32_t>(value >> 16) - 32768;
        left_buffer[i] = encode_pcm_fifo_sample(clamp_pcm_sample(left));
        right_buffer[i] = encode_pcm_fifo_sample(clamp_pcm_sample(right));
    }
}

gbs::PcmPanGains pcm_playback_pan(const PcmPlayback& playback) {
    const int pan = playback.pan;
    if (playback.sample_linear_pan) {
        // Exact round(255*x/254), x in [0,254], without a software divide.
        return { static_cast<uint8_t>(127 - pan + (pan <= 0)), static_cast<uint8_t>(127 + pan + (pan >= 0)) };
    }
    const uint32_t numerator = static_cast<uint32_t>(15 * (127 - (pan < 0 ? -pan : pan)));
    // Exact floor(n/127) for n in [0,1905].
    const uint8_t opposite = static_cast<uint8_t>((numerator + 1u + (numerator >> 7)) >> 7);
    return pan < 0 ? gbs::PcmPanGains { 15, opposite } : gbs::PcmPanGains { opposite, 15 };
}

void update_pcm_mixer() {
    const size_t output_count = pcm_mix_sample_count;
    // Cache asset bytes only within this block. Mutable source buffers remain
    // observable on the next update, and all voices can share a short sample.
    pcm_cached_source = nullptr;
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
    if (pcm_music.playing) voices[voice_count++] = { &pcm_music, gbs::AudioChannel::Music, gbs::AudioChannel::PcmMusic, { 15, 15 } };
    for (PcmPlayback& playback : pcm_sfx) {
        if (playback.playing) voices[voice_count++] = { &playback, gbs::AudioChannel::Sfx, gbs::AudioChannel::PcmSfx, pcm_playback_pan(playback) };
    }
    for (PcmPlayback& playback : pcm_tracker) {
        if (playback.playing) {
            const auto pan = pcm_playback_pan(playback);
            voices[voice_count++] = { &playback, gbs::AudioChannel::Music, gbs::AudioChannel::PcmMusic, pan };
        }
    }
    clear_pcm_accumulator();
    pcm_mix_peak_bound = 0;
    bool mono = true;
    for (size_t i = 0; i < voice_count; ++i) {
        if (voices[i].pan.left != voices[i].pan.right) mono = false;
        mix_pcm_voice_block(voices[i]);
    }
    write_pcm_mix_stereo(left_buffer, right_buffer, mono);

    // FIFO can prefetch one burst beyond the frame boundary. Hold the final
    // value in owned padding; the VBlank handler bounds each DMA to one frame.
    for (size_t index = output_count; index < output_count + 32; ++index) {
        left_buffer[index] = left_buffer[output_count - 1];
        right_buffer[index] = right_buffer[output_count - 1];
    }
    if (!pcm_output_active) {
        gbs_hw_audio_start_pcm8_stereo_stream(pcm_mix_rate_hz);
        pcm_output_active = true;
    }
    gbs_hw_audio_submit_pcm8_stereo_stream_block(
        left_buffer,
        right_buffer,
        static_cast<uint32_t>(output_count)
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
    bool extended_tracker = false;
    for (size_t index = 4; index < gbs::TRACKER_MAX_SAMPLE_CHANNELS; ++index) {
        extended_tracker = extended_tracker || pcm_playback_has_sample(pcm_tracker[index]);
    }
    const size_t requested_budget = extended_tracker && music_voices + 1 > gbs::PCM_MIXER_BASE_VOICE_BUDGET
        ? music_voices + 1 : gbs::PCM_MIXER_BASE_VOICE_BUDGET;
    const size_t budget = requested_budget < gbs::PCM_MIXER_MAX_ACTIVE_VOICES
        ? requested_budget : gbs::PCM_MIXER_MAX_ACTIVE_VOICES;
    const size_t remaining = budget > music_voices ? budget - music_voices : 0u;
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
    if (asset.pcm != nullptr) return asset.pcm_volume <= 15 && is_valid_pcm_asset(*asset.pcm);
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
    int16_t checked_samples[16] {};
    size_t checked_count = 0, checked_next = 0;
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
            if (step.sample_only) {
                if (step.sample_index < 0 || asset.samples == nullptr || static_cast<size_t>(step.sample_index) >= asset.sample_count || step.sample_rate_hz > 2097152) return false;
                if (step.prepared_mix_map != nullptr) {
                    const auto& sample = asset.samples[step.sample_index];
                    const uintptr_t pointer = reinterpret_cast<uintptr_t>(step.prepared_mix_map);
                    const uintptr_t base = reinterpret_cast<uintptr_t>(sample.interpolation_maps);
                    if (sample.interpolation_maps == nullptr || pointer < base || pointer - base >= sample.interpolation_map_count * sizeof(PcmInterpolationMap) ||
                        (pointer - base) % sizeof(PcmInterpolationMap) != 0) return false;
                    const uint32_t mask = (step.prepared_mix_map->mix_key & gbs::PCM_INTERPOLATION_PRE_PAN) ? 0x000f00ffu : 0x100fffffu;
                    if ((step.prepared_mix_map->mix_key & mask) != (pcm_interpolation_mix_key(step.volume, 0, 0, step.sample_gain, step.pan, step.sample_linear_pan) & mask)) return false;
                }
                bool checked = false;
                for (size_t i = 0; i < checked_count; ++i) if (checked_samples[i] == step.sample_index) checked = true;
                if (!checked) {
                    if (!is_valid_pcm_asset(asset.samples[step.sample_index])) return false;
                    checked_samples[checked_next] = step.sample_index; checked_next = (checked_next + 1u) % 16u;
                    if (checked_count < 16) ++checked_count;
                }
            }
            pattern_waits = pattern_waits || step.duration_frames > 0;
        }
        if (!pattern_waits) {
            return false;
        }
    }
    return true;
}

bool is_valid_pcm_asset(const PcmAsset& asset) {
    return is_valid_pcm_asset_constexpr(asset);
}

bool set_audio_mixing_rate(uint32_t rate_hz) {
    if (!is_valid_audio_mixing_rate(rate_hz)) return false;
    [[maybe_unused]] const AudioStateLock lock;
    if (rate_hz == pcm_mix_rate_hz) return true;
    pcm_mix_rate_hz = rate_hz;
    pcm_mix_sample_count = static_cast<uint16_t>(rate_hz / 10512u * 176u);
    const auto retune = [](PcmPlayback& voice) {
        if (!voice.playing || voice.asset == nullptr) return;
        voice.step_fp = pcm_step_for_asset(*voice.asset, voice.source_rate_hz);
        voice.step_reciprocal = 0xffffffffu / voice.step_fp;
    };
    retune(pcm_music);
    for (auto& voice : pcm_sfx) retune(voice);
    for (auto& voice : pcm_tracker) retune(voice);
    return true;
}

uint32_t audio_mixing_rate_hz() { return pcm_mix_rate_hz; }
uint16_t audio_mixer_output_samples_per_frame() { return pcm_mix_sample_count; }

void audio_init(bool preserve_mix) {
    [[maybe_unused]] const AudioStateLock lock;
    reset_sfx_state();
    reset_music_state();
    reset_tracker_state();
    reset_pcm_sfx_state();
    reset_pcm_music_state();
    pcm_output_active = false;
    pcm_submitted_blocks = 0;
    pcm_voice_age = 1;
    if (!preserve_mix) {
        const uint32_t configured_rate = gbs_project_audio_mixing_rate();
        pcm_mix_rate_hz = is_valid_audio_mixing_rate(configured_rate) ? configured_rate : PCM_MIXER_SAMPLE_RATE_HZ;
        pcm_mix_sample_count = static_cast<uint16_t>(pcm_mix_rate_hz / 10512 * 176);
        reset_audio_mutes();
        reset_audio_volumes();
    }
    gbs_hw_audio_init();
}

void audio_vblank_update() {
#if defined(__arm__) || defined(__thumb__) || defined(GBS_ENABLE_PROFILER_SCOPES)
    const uint32_t profiler_start = gbs_hw_frame_counter_ticks();
#endif
    update_audio_volume_fades();
    update_sfx();
    update_music();
    update_tracker();
    update_pcm_mixer();
#if defined(__arm__) || defined(__thumb__) || defined(GBS_ENABLE_PROFILER_SCOPES)
    subsystem_profiler_record_audio(gbs_hw_frame_counter_ticks() - profiler_start);
#endif
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

bool fade_audio_channel_volume(AudioChannel channel, uint8_t target_volume, uint16_t frames, uint8_t ceiling) {
    if (!is_valid_audio_volume(target_volume) || !is_valid_audio_volume(ceiling)) {
        return false;
    }
    [[maybe_unused]] const AudioStateLock lock;
    if (target_volume > ceiling) target_volume = ceiling;
    if (frames == 0) {
        return set_audio_channel_volume(channel, target_volume);
    }
    if (channel == AudioChannel::All) {
        for (size_t index = 0; index < 4; ++index) {
            AudioVolumeState& state = channel_volumes[index];
            if (state.current > ceiling) state.current = ceiling;
            state = AudioVolumeState { state.current, state.current, target_volume, frames, frames };
        }
        return true;
    }
    AudioVolumeState& state = channel_volumes[audio_channel_index(channel)];
    if (state.current > ceiling) state.current = ceiling;
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
    if (asset.pcm != nullptr) {
        if (pcm_sfx_muted) return false;
        PcmPlayback* slot = find_pcm_sfx_slot(8);
        if (slot == nullptr) return false;
        stop_sfx();
        start_pcm_playback(*slot, *asset.pcm, 8, asset.pcm_volume);
        slot->native_sfx = true;
        return true;
    }
    for (auto& voice : pcm_sfx) if (voice.native_sfx) reset_pcm_playback(voice);
    if (sfx.playing) stop_previous_sfx_channel_if_changed(sfx.tones[sfx.index], asset.tones[0]);
    sfx.tones = asset.tones;
    sfx.tone_count = asset.tone_count;
    sfx.index = 0;
    sfx.playing = true;
    start_sfx_tone(sfx.tones[0]);
    return true;
}

void stop_sfx() {
    [[maybe_unused]] const AudioStateLock lock;
    for (auto& voice : pcm_sfx) if (voice.native_sfx) reset_pcm_playback(voice);
    const bool had_psg_sfx = sfx.playing;
    reset_sfx_state();
    if (had_psg_sfx) {
        gbs_hw_audio_stop_square(1);
        gbs_hw_audio_stop_noise();
    }
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
    slot->native_sfx = false;
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
    for (const auto& voice : pcm_sfx) if (voice.native_sfx && voice.playing) return true;
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
    [[maybe_unused]] const AudioObserverLock lock;
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
        const uint64_t next_bytes = static_cast<uint64_t>(pcm_source_bytes) + pcm_asset_source_bytes(*playback.asset);
        pcm_source_bytes = next_bytes > 0xFFFFFFFFu ? 0xFFFFFFFFu : static_cast<uint32_t>(next_bytes);
    };

    add_playback(pcm_music);
    for (size_t index = 0; index < PCM_MIXER_MAX_SFX_VOICES; ++index) {
        add_playback(pcm_sfx[index]);
    }
    for (size_t index = 0; index < sizeof(pcm_tracker) / sizeof(pcm_tracker[0]); ++index) {
        add_playback(pcm_tracker[index]);
    }

    const uint32_t mixer_buffer_bytes = static_cast<uint32_t>(sizeof(pcm_mix_buffers) + sizeof(pcm_mix_accumulator) + sizeof(pcm_source_window) + sizeof(pcm_mix_voices) + sizeof(pcm_stereo_gain));
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
