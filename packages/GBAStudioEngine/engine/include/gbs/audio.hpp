#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

struct SfxTone {
    uint16_t frequency_hz;
    uint8_t duration_frames;
    uint8_t volume;
    uint8_t duty;
    bool noise;
    uint8_t attack_frames = 0;
    uint8_t release_frames = 0;
    uint8_t waveform = 0;
    int8_t pan = 0;
    uint8_t sweep_shifts = 0;
    uint8_t sweep_time = 0;
    bool sweep_negative = false;
};

struct SfxAsset {
    const SfxTone* tones;
    size_t tone_count;
};

struct MusicStep {
    uint16_t frequency_hz;
    uint8_t duration_frames;
    uint8_t volume;
    uint8_t duty;
    int8_t pan = 0;
    uint8_t sweep_shifts = 0;
    uint8_t sweep_time = 0;
    bool sweep_negative = false;
};

struct MusicAsset {
    const MusicStep* steps;
    size_t step_count;
    bool loop;
};

struct PcmAsset {
    // Source samples are signed int8_t centered at zero.
    // The mixer biases them to unsigned FIFO bytes (centered at 0x80) when submitting.
    const int8_t* samples;
    size_t sample_count;
    uint32_t sample_rate_hz;
    bool loop;
    size_t loop_start_sample = 0;
    size_t loop_end_sample = 0;
};

struct TrackerStep {
    uint8_t channel;
    uint16_t frequency_hz;
    uint8_t duration_frames;
    uint8_t volume;
    uint8_t duty;
    uint8_t attack_frames = 0;
    uint8_t release_frames = 0;
    uint8_t waveform = 0;
    int16_t sample_index = -1;
    uint32_t sample_rate_hz = 0;
    int8_t pan = 0;
    uint8_t sweep_shifts = 0;
    uint8_t sweep_time = 0;
    bool sweep_negative = false;
    bool sample_only = false;
};

struct TrackerPattern {
    const TrackerStep* steps;
    size_t step_count;
};

struct TrackerAsset {
    const TrackerPattern* patterns;
    size_t pattern_count;
    const uint8_t* order;
    size_t order_count;
    bool loop;
    const PcmAsset* samples = nullptr;
    size_t sample_count = 0;
};

// 532 timer ticks * 528 samples = 280896 GBA cycles per video frame.
// The block is also a multiple of the FIFO DMA's 16-byte burst.
constexpr uint32_t PCM_MIXER_SAMPLE_RATE_HZ = 31536;
constexpr uint16_t PCM_MIXER_SAMPLES_PER_FRAME = 528;
constexpr size_t PCM_MIXER_MAX_SFX_VOICES = 4;
// Music keeps its channels; SFX share the remaining measured mixer budget.
constexpr size_t PCM_MIXER_MAX_ACTIVE_VOICES = 5;

struct PcmSfxOptions {
    uint8_t volume = 15;
    uint8_t priority = 8;
    uint32_t sample_rate_hz = 0;
    int8_t pan = 0;
};

struct PcmPanGains {
    uint8_t left;
    uint8_t right;
};

constexpr bool is_valid_pcm_pan(int pan) {
    return pan >= -127 && pan <= 127;
}

constexpr PcmPanGains pcm_pan_gains(int pan) {
    const int bounded = pan < -127 ? -127 : (pan > 127 ? 127 : pan);
    return bounded < 0
        ? PcmPanGains { 15, static_cast<uint8_t>((15 * (127 + bounded)) / 127) }
        : PcmPanGains { static_cast<uint8_t>((15 * (127 - bounded)) / 127), 15 };
}

enum class AudioChannel : uint8_t {
    Music = 0,
    Sfx = 1,
    PcmMusic = 2,
    PcmSfx = 3,
    All = 4
};

constexpr AudioChannel audio_channel_from_event_value(int channel) {
    switch (channel) {
    case 1: return AudioChannel::Sfx;
    case 2: return AudioChannel::PcmMusic;
    case 3: return AudioChannel::PcmSfx;
    case 4: return AudioChannel::All;
    default: return AudioChannel::Music;
    }
}

struct AudioMixCost {
    bool valid;
    uint32_t pcm_bytes;
    uint32_t pcm_source_samples;
    uint32_t frame_count;
    uint32_t estimated_mixer_frames;
    uint16_t psg_steps;
    uint16_t tracker_steps;
    uint16_t noise_steps;
    uint8_t pcm_sfx_voices;
    uint8_t pcm_music_voices;
    uint8_t mixer_voices;
    uint16_t mixer_output_samples_per_frame;
    uint8_t looping_assets;
};

struct AudioRuntimeUsage {
    uint32_t bytes;
    uint32_t pcm_source_bytes;
    uint32_t mixer_buffer_bytes;
    uint8_t active_voice_count;
    uint32_t pcm_underrun_count;
    uint32_t pcm_submitted_blocks;
};

constexpr bool is_valid_audio_frequency(uint16_t frequency_hz) {
    return frequency_hz >= 64 && frequency_hz <= 4095;
}

constexpr bool is_valid_audio_volume(uint8_t volume) {
    return volume <= 15;
}

constexpr bool is_valid_audio_duty(uint8_t duty) {
    return duty <= 3;
}

constexpr bool is_valid_sfx_tone(const SfxTone& tone) {
    return is_valid_audio_frequency(tone.frequency_hz) &&
           tone.duration_frames > 0 &&
           is_valid_audio_volume(tone.volume) &&
           is_valid_audio_duty(tone.duty) &&
           is_valid_pcm_pan(tone.pan);
}

constexpr bool is_valid_music_step(const MusicStep& step) {
    return is_valid_audio_frequency(step.frequency_hz) &&
           step.duration_frames > 0 &&
           is_valid_audio_volume(step.volume) &&
           is_valid_audio_duty(step.duty) &&
           is_valid_pcm_pan(step.pan);
}

constexpr bool is_valid_tracker_channel(uint8_t channel) {
    return channel >= 1 && channel <= 4;
}

constexpr bool is_valid_tracker_step(const TrackerStep& step) {
    return is_valid_tracker_channel(step.channel) &&
           is_valid_audio_frequency(step.frequency_hz) &&
           is_valid_audio_volume(step.volume) &&
           is_valid_audio_duty(step.duty) &&
           is_valid_pcm_pan(step.pan);
}

constexpr bool is_valid_pcm_sample_rate(uint32_t sample_rate_hz) {
    return sample_rate_hz >= 4000 && sample_rate_hz <= 32768;
}

constexpr bool is_valid_pcm_volume(uint8_t volume) {
    return volume <= 15;
}

constexpr size_t pcm_loop_end_sample(const PcmAsset& asset) {
    return asset.loop_end_sample == 0 ? asset.sample_count : asset.loop_end_sample;
}

constexpr bool is_valid_pcm_loop(const PcmAsset& asset) {
    return !asset.loop ||
           (asset.loop_start_sample < pcm_loop_end_sample(asset) &&
            pcm_loop_end_sample(asset) <= asset.sample_count);
}

constexpr bool is_valid_pcm_asset_constexpr(const PcmAsset& asset) {
    return asset.samples != nullptr &&
           asset.sample_count > 0 &&
           asset.sample_count <= 0xFFFFu &&
           is_valid_pcm_sample_rate(asset.sample_rate_hz) &&
           is_valid_pcm_loop(asset);
}

bool is_valid_sfx_asset(const SfxAsset& asset);
bool is_valid_music_asset(const MusicAsset& asset);
bool is_valid_tracker_asset(const TrackerAsset& asset);
bool is_valid_pcm_asset(const PcmAsset& asset);

constexpr uint16_t pcm_mixer_output_samples_per_frame() {
    return PCM_MIXER_SAMPLES_PER_FRAME;
}

constexpr AudioMixCost invalid_audio_mix_cost() {
    return AudioMixCost {
        false,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        pcm_mixer_output_samples_per_frame(),
        0
    };
}

constexpr AudioMixCost estimate_sfx_asset_cost(const SfxAsset& asset) {
    if (asset.tones == nullptr || asset.tone_count == 0 || asset.tone_count > 0xFFFFu) {
        return invalid_audio_mix_cost();
    }
    uint32_t frames = 0;
    uint16_t noise_steps = 0;
    for (size_t index = 0; index < asset.tone_count; ++index) {
        if (!is_valid_sfx_tone(asset.tones[index])) {
            return invalid_audio_mix_cost();
        }
        frames += asset.tones[index].duration_frames;
        if (asset.tones[index].noise) {
            ++noise_steps;
        }
    }
    return AudioMixCost {
        true,
        0,
        0,
        frames,
        0,
        static_cast<uint16_t>(asset.tone_count),
        0,
        noise_steps,
        0,
        0,
        0,
        pcm_mixer_output_samples_per_frame(),
        0
    };
}

constexpr AudioMixCost estimate_music_asset_cost(const MusicAsset& asset) {
    if (asset.steps == nullptr || asset.step_count == 0 || asset.step_count > 0xFFFFu) {
        return invalid_audio_mix_cost();
    }
    uint32_t frames = 0;
    for (size_t index = 0; index < asset.step_count; ++index) {
        if (!is_valid_music_step(asset.steps[index])) {
            return invalid_audio_mix_cost();
        }
        frames += asset.steps[index].duration_frames;
    }
    return AudioMixCost {
        true,
        0,
        0,
        frames,
        0,
        static_cast<uint16_t>(asset.step_count),
        0,
        0,
        0,
        0,
        0,
        pcm_mixer_output_samples_per_frame(),
        asset.loop ? static_cast<uint8_t>(1) : static_cast<uint8_t>(0)
    };
}

constexpr AudioMixCost estimate_tracker_asset_cost(const TrackerAsset& asset) {
    if (asset.patterns == nullptr || asset.pattern_count == 0 || asset.order == nullptr || asset.order_count == 0) {
        return invalid_audio_mix_cost();
    }
    uint32_t frames = 0;
    uint32_t steps = 0;
    uint16_t noise_steps = 0;
    for (size_t order_index = 0; order_index < asset.order_count; ++order_index) {
        if (asset.order[order_index] >= asset.pattern_count) {
            return invalid_audio_mix_cost();
        }
    }
    for (size_t pattern_index = 0; pattern_index < asset.pattern_count; ++pattern_index) {
        const TrackerPattern& pattern = asset.patterns[pattern_index];
        if (pattern.steps == nullptr || pattern.step_count == 0) {
            return invalid_audio_mix_cost();
        }
        bool pattern_waits = false;
        for (size_t step_index = 0; step_index < pattern.step_count; ++step_index) {
            if (!is_valid_tracker_step(pattern.steps[step_index]) || steps >= 0xFFFFu) {
                return invalid_audio_mix_cost();
            }
            frames += pattern.steps[step_index].duration_frames;
            pattern_waits = pattern_waits || pattern.steps[step_index].duration_frames > 0;
            ++steps;
            if (pattern.steps[step_index].channel == 4) {
                ++noise_steps;
            }
        }
        if (!pattern_waits) {
            return invalid_audio_mix_cost();
        }
    }
    return AudioMixCost {
        true,
        0,
        0,
        frames,
        0,
        static_cast<uint16_t>(steps),
        static_cast<uint16_t>(steps),
        noise_steps,
        0,
        0,
        0,
        pcm_mixer_output_samples_per_frame(),
        asset.loop ? static_cast<uint8_t>(1) : static_cast<uint8_t>(0)
    };
}

constexpr uint32_t estimate_pcm_output_sample_count(const PcmAsset& asset) {
    return static_cast<uint32_t>(
        (static_cast<uint64_t>(asset.sample_count) * PCM_MIXER_SAMPLE_RATE_HZ + asset.sample_rate_hz - 1u) /
        asset.sample_rate_hz
    );
}

constexpr uint32_t estimate_pcm_mixer_frame_count(const PcmAsset& asset) {
    const uint32_t output_samples = estimate_pcm_output_sample_count(asset);
    return (output_samples + pcm_mixer_output_samples_per_frame() - 1u) / pcm_mixer_output_samples_per_frame();
}

constexpr AudioMixCost estimate_pcm_asset_cost(const PcmAsset& asset) {
    return !is_valid_pcm_asset_constexpr(asset)
        ? invalid_audio_mix_cost()
        : AudioMixCost {
            true,
            static_cast<uint32_t>(asset.sample_count),
            static_cast<uint32_t>(asset.sample_count),
            0,
            estimate_pcm_mixer_frame_count(asset),
            0,
            0,
            0,
            0,
            asset.loop ? static_cast<uint8_t>(1) : static_cast<uint8_t>(0),
            asset.loop ? static_cast<uint8_t>(1) : static_cast<uint8_t>(0),
            pcm_mixer_output_samples_per_frame(),
            asset.loop ? static_cast<uint8_t>(1) : static_cast<uint8_t>(0)
        };
}

constexpr AudioMixCost estimate_pcm_mix_runtime_cost(uint8_t sfx_voice_count, bool music_voice) {
    return sfx_voice_count > PCM_MIXER_MAX_SFX_VOICES
        ? invalid_audio_mix_cost()
        : AudioMixCost {
            true,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            sfx_voice_count,
            music_voice ? static_cast<uint8_t>(1) : static_cast<uint8_t>(0),
            static_cast<uint8_t>(sfx_voice_count + (music_voice ? 1 : 0)),
            pcm_mixer_output_samples_per_frame(),
            0
        };
}

constexpr AudioMixCost add_audio_mix_cost(AudioMixCost lhs, AudioMixCost rhs) {
    return AudioMixCost {
        lhs.valid && rhs.valid,
        lhs.pcm_bytes + rhs.pcm_bytes,
        lhs.pcm_source_samples + rhs.pcm_source_samples,
        lhs.frame_count + rhs.frame_count,
        lhs.estimated_mixer_frames + rhs.estimated_mixer_frames,
        static_cast<uint16_t>(lhs.psg_steps + rhs.psg_steps),
        static_cast<uint16_t>(lhs.tracker_steps + rhs.tracker_steps),
        static_cast<uint16_t>(lhs.noise_steps + rhs.noise_steps),
        static_cast<uint8_t>(lhs.pcm_sfx_voices + rhs.pcm_sfx_voices),
        static_cast<uint8_t>(lhs.pcm_music_voices + rhs.pcm_music_voices),
        static_cast<uint8_t>(lhs.mixer_voices + rhs.mixer_voices),
        lhs.mixer_output_samples_per_frame > rhs.mixer_output_samples_per_frame
            ? lhs.mixer_output_samples_per_frame
            : rhs.mixer_output_samples_per_frame,
        static_cast<uint8_t>(lhs.looping_assets + rhs.looping_assets)
    };
}

void audio_init();
// GBA playback advances on VBlank, independently of game/render frames.
// Host tests advance one audio frame by calling audio_update().
void audio_update();
void set_audio_channel_muted(AudioChannel channel, bool muted);
bool audio_is_channel_muted(AudioChannel channel);
bool set_audio_channel_volume(AudioChannel channel, uint8_t volume);
bool fade_audio_channel_volume(AudioChannel channel, uint8_t target_volume, uint16_t frames);
uint8_t audio_channel_volume(AudioChannel channel);
uint16_t audio_channel_fade_remaining(AudioChannel channel);
bool play_sfx(const SfxAsset& asset);
void stop_sfx();
bool play_music(const MusicAsset& asset);
void stop_music();
bool play_tracker_music(const TrackerAsset& asset);
void stop_tracker_music();
bool play_pcm_sfx(const PcmAsset& asset);
bool play_pcm_sfx(const PcmAsset& asset, const PcmSfxOptions& options);
bool play_pcm_sfx(const PcmAsset& asset, uint8_t priority, uint8_t volume);
void stop_pcm_sfx();
bool play_pcm_music(const PcmAsset& asset);
bool play_pcm_music(const PcmAsset& asset, uint8_t volume);
void stop_pcm_music();
void stop_all_pcm_sfx();
bool audio_is_sfx_playing();
bool audio_is_music_playing();
bool audio_is_tracker_music_playing();
bool audio_is_pcm_sfx_playing();
bool audio_is_pcm_music_playing();
size_t audio_pcm_active_sfx_count();
size_t audio_pcm_mixer_capacity();
bool audio_is_pcm_streaming();
uint32_t audio_pcm_submitted_block_count();
AudioRuntimeUsage audio_runtime_usage();

} // namespace gbs
