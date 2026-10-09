#include <cassert>
#include "gbs/audio.hpp"

namespace {

int last_pcm_right_first_sample = 0;
int square_starts = 0;
int wave_starts = 0;
int noise_starts = 0;
int square_stops = 0;
int wave_stops = 0;
int noise_stops = 0;
int pcm_starts = 0;
int pcm_stops = 0;
int pcm_stream_starts = 0;
uint32_t last_pcm_sample_rate = 0;
uint32_t last_pcm_sample_count = 0;
int last_pcm_loop = 0;
int last_pcm_first_sample = 0;
int last_square_volume = -1;
int last_noise_volume = -1;
int last_wave_waveform = -1;
int last_noise_duty = -1;
int psg_pan_calls = 0;
int last_psg_pan_channel = 0;
int last_psg_pan = 0;
int8_t last_pcm_samples[gbs::PCM_MIXER_SAMPLES_PER_FRAME] = {};
int8_t last_pcm_right_samples[gbs::PCM_MIXER_SAMPLES_PER_FRAME] = {};
uint8_t last_pcm_raw_samples[gbs::PCM_MIXER_SAMPLES_PER_FRAME] = {};
uint32_t hardware_pcm_underrun_count = 0;

void reset_hw_counts() {
    square_starts = 0;
    wave_starts = 0;
    noise_starts = 0;
    square_stops = 0;
    wave_stops = 0;
    noise_stops = 0;
    pcm_starts = 0;
    pcm_stops = 0;
    pcm_stream_starts = 0;
    last_pcm_sample_rate = 0;
    last_pcm_sample_count = 0;
    last_pcm_loop = 0;
    last_pcm_first_sample = 0;
    last_square_volume = -1;
    last_noise_volume = -1;
    last_wave_waveform = -1;
    last_noise_duty = -1;
    psg_pan_calls = 0;
    last_psg_pan_channel = 0;
    last_psg_pan = 0;
    for (int8_t& sample : last_pcm_samples) {
        sample = 0;
    }
    for (uint8_t& sample : last_pcm_raw_samples) {
        sample = 0;
    }
    hardware_pcm_underrun_count = 0;
}

} // namespace

extern "C" void gbs_hw_audio_init(void) {
    reset_hw_counts();
}

extern "C" void gbs_hw_audio_play_square(int, uint16_t, uint8_t volume, uint8_t) {
    ++square_starts;
    last_square_volume = volume;
}

extern "C" void gbs_hw_audio_set_square_volume(int, uint8_t volume, uint8_t) {
    last_square_volume = volume;
}

extern "C" void gbs_hw_audio_stop_square(int) {
    ++square_stops;
}

extern "C" void gbs_hw_audio_play_wave(uint16_t, uint8_t, uint8_t waveform) {
    ++wave_starts;
    last_wave_waveform = waveform;
}

extern "C" void gbs_hw_audio_set_wave_volume(uint8_t) {}

extern "C" void gbs_hw_audio_stop_wave(void) {
    ++wave_stops;
}

extern "C" void gbs_hw_audio_play_noise(uint16_t, uint8_t volume, uint8_t duty) {
    ++noise_starts;
    last_noise_volume = volume;
    last_noise_duty = duty;
}

extern "C" void gbs_hw_audio_set_noise_volume(uint8_t volume) {
    last_noise_volume = volume;
}

extern "C" void gbs_hw_audio_stop_noise(void) {
    ++noise_stops;
}

extern "C" void gbs_hw_audio_set_psg_pan(int channel, int pan) {
    ++psg_pan_calls;
    last_psg_pan_channel = channel;
    last_psg_pan = pan;
}

extern "C" void gbs_hw_audio_play_pcm8(const uint8_t* samples, uint32_t sample_count, uint32_t sample_rate_hz, int loop) {
    ++pcm_stream_starts;
    ++pcm_starts;
    last_pcm_sample_count = sample_count;
    last_pcm_sample_rate = sample_rate_hz;
    last_pcm_loop = loop;
    last_pcm_first_sample = samples != nullptr && sample_count > 0 ? samples[0] : 0;
}

extern "C" void gbs_hw_audio_stop_pcm(void) {
    ++pcm_stops;
}

extern "C" void gbs_hw_audio_start_pcm8_stream(uint32_t sample_rate_hz) {
    ++pcm_stream_starts;
    last_pcm_sample_rate = sample_rate_hz;
}

extern "C" void gbs_hw_audio_submit_pcm8_stream_block(const uint8_t* samples, uint32_t sample_count) {
    ++pcm_starts;
    last_pcm_sample_count = sample_count;
    last_pcm_first_sample = samples != nullptr && sample_count > 0 ? static_cast<int8_t>(samples[0]) : 0;
    for (uint32_t index = 0; index < sample_count && index < gbs::PCM_MIXER_SAMPLES_PER_FRAME; ++index) {
        last_pcm_samples[index] = static_cast<int8_t>(samples[index]);
        last_pcm_raw_samples[index] = samples[index];
    }
}

extern "C" void gbs_hw_audio_start_pcm8_stereo_stream(uint32_t sample_rate_hz) {
    ++pcm_stream_starts;
    last_pcm_sample_rate = sample_rate_hz;
}

extern "C" void gbs_hw_audio_submit_pcm8_stereo_stream_block(
    const uint8_t* left_samples,
    const uint8_t* right_samples,
    uint32_t sample_count
) {
    ++pcm_starts;
    last_pcm_sample_count = sample_count;
    last_pcm_right_first_sample = right_samples != nullptr && sample_count > 0 ? static_cast<int8_t>(right_samples[0]) : 0;
    last_pcm_first_sample = left_samples != nullptr && sample_count > 0 ? static_cast<int8_t>(left_samples[0]) : 0;
    for (uint32_t index = 0; index < sample_count && index < gbs::PCM_MIXER_SAMPLES_PER_FRAME; ++index) {
        last_pcm_right_samples[index] = static_cast<int8_t>(right_samples[index]);
        last_pcm_samples[index] = static_cast<int8_t>(left_samples[index]);
        last_pcm_raw_samples[index] = left_samples[index];
    }
}

extern "C" void gbs_hw_audio_finish_pcm8_stereo_stream(void) { ++pcm_stops; }

extern "C" void gbs_hw_audio_stop_pcm8_stream(void) {
    ++pcm_stops;
}

extern "C" uint32_t gbs_hw_audio_pcm_underrun_count(void) {
    return hardware_pcm_underrun_count;
}

namespace {

void test_tone_validation() {
    assert(gbs::is_valid_sfx_tone(gbs::SfxTone { 440, 2, 15, 3, false }));
    assert(!gbs::is_valid_sfx_tone(gbs::SfxTone { 40, 2, 15, 3, false }));
    assert(!gbs::is_valid_sfx_tone(gbs::SfxTone { 440, 0, 15, 3, false }));
    assert(!gbs::is_valid_sfx_tone(gbs::SfxTone { 440, 2, 16, 3, false }));
    assert(!gbs::is_valid_sfx_tone(gbs::SfxTone { 440, 2, 15, 4, false }));
}

void test_psg_pan_is_forwarded_to_hardware() {
    const gbs::SfxTone tone { 440, 2, 15, 2, false, 0, 0, 0, -127 };
    gbs::audio_init();
    assert(gbs::play_sfx(gbs::SfxAsset { &tone, 1 }));
    assert(psg_pan_calls == 1);
    assert(last_psg_pan_channel == 1);
    assert(last_psg_pan == -127);
}

void test_sfx_playback_lifetime() {
    gbs::audio_init();
    const gbs::SfxTone tones[] = {
        { 440, 2, 10, 1, false },
        { 880, 1, 8, 2, false }
    };
    const gbs::SfxAsset asset { tones, 2 };

    assert(gbs::play_sfx(asset));
    assert(gbs::audio_is_sfx_playing());
    assert(square_starts == 1);

    gbs::audio_update();
    assert(gbs::audio_is_sfx_playing());
    assert(square_starts == 1);

    gbs::audio_update();
    assert(gbs::audio_is_sfx_playing());
    assert(square_starts == 2);

    gbs::audio_update();
    assert(!gbs::audio_is_sfx_playing());
    assert(square_stops >= 1);
}

void test_noise_sfx_uses_noise_channel() {
    gbs::audio_init();
    const gbs::SfxTone tones[] = {
        { 1000, 1, 9, 0, true }
    };

    assert(gbs::play_sfx(gbs::SfxAsset { tones, 1 }));
    assert(noise_starts == 1);
}

void test_sfx_envelope_and_noise_duty_are_rendered() {
    gbs::audio_init();
    const gbs::SfxTone tones[] = {
        { 1000, 4, 12, 1, true, 2, 2, 0 }
    };

    assert(gbs::play_sfx(gbs::SfxAsset { tones, 1 }));
    // A zero initial PSG envelope disables the DAC; later volume writes
    // cannot make an attack audible without another trigger.
    assert(last_noise_volume == 12);
    assert(last_noise_duty == 1);
    gbs::audio_update();
    assert(last_noise_volume == 6);
    assert(noise_starts == 1);
    gbs::audio_update();
    assert(last_noise_volume == 12);
    assert(noise_starts == 1);
    gbs::audio_update();
    assert(last_noise_volume == 6);
    assert(noise_starts == 1);
}

void test_invalid_assets_are_silent() {
    gbs::audio_init();

    assert(!gbs::play_sfx(gbs::SfxAsset { nullptr, 0 }));
    assert(!gbs::audio_is_sfx_playing());
    assert(square_starts == 0);
    assert(noise_starts == 0);

    assert(!gbs::play_music(gbs::MusicAsset { nullptr, 0, false }));
    assert(!gbs::audio_is_music_playing());
}

void test_square_sfx_attack_keeps_the_dac_enabled() {
    gbs::audio_init();
    const gbs::SfxTone tones[] = {
        { 523, 12, 13, 2, false, 2, 4, 0 }
    };
    assert(gbs::play_sfx(gbs::SfxAsset { tones, 1 }));
    assert(last_square_volume == 13);
    assert(square_starts == 1);
    gbs::audio_update();
    assert(square_starts == 1);
}

void test_music_loop_and_stop() {
    gbs::audio_init();
    const gbs::MusicStep steps[] = {
        { 262, 1, 4, 1 },
        { 330, 1, 4, 1 }
    };

    assert(gbs::play_music(gbs::MusicAsset { steps, 2, true }));
    assert(gbs::audio_is_music_playing());
    assert(square_starts == 1);
    gbs::audio_update();
    assert(square_starts == 2);
    gbs::audio_update();
    assert(gbs::audio_is_music_playing());
    assert(square_starts == 3);

    gbs::stop_music();
    assert(!gbs::audio_is_music_playing());
}

void test_music_without_loop_finishes() {
    gbs::audio_init();
    const gbs::MusicStep steps[] = {
        { 262, 1, 4, 1 }
    };

    assert(gbs::play_music(gbs::MusicAsset { steps, 1, false }));
    gbs::audio_update();
    assert(!gbs::audio_is_music_playing());
}

void test_tracker_asset_validation() {
    const gbs::TrackerStep steps[] = {
        { 2, 262, 2, 5, 1 },
        { 3, 880, 1, 8, 0 }
    };
    const gbs::TrackerPattern patterns[] = {
        { steps, 2 }
    };
    const uint8_t order[] = { 0 };

    assert(gbs::is_valid_tracker_channel(1));
    assert(gbs::is_valid_tracker_channel(4));
    assert(!gbs::is_valid_tracker_channel(5));
    assert(gbs::is_valid_tracker_step(steps[0]));
    assert(!gbs::is_valid_tracker_step(gbs::TrackerStep { 0, 262, 2, 5, 1 }));
    assert(gbs::is_valid_tracker_asset(gbs::TrackerAsset { patterns, 1, order, 1, true }));
    assert(!gbs::is_valid_tracker_asset(gbs::TrackerAsset { nullptr, 0, order, 1, true }));
}

void test_tracker_music_order_loop_and_stop() {
    gbs::audio_init();
    const gbs::TrackerStep pattern_a_steps[] = {
        { 2, 262, 1, 5, 1 },
        { 4, 900, 1, 6, 0 }
    };
    const gbs::TrackerStep pattern_b_steps[] = {
        { 1, 330, 1, 7, 2 }
    };
    const gbs::TrackerPattern patterns[] = {
        { pattern_a_steps, 2 },
        { pattern_b_steps, 1 }
    };
    const uint8_t order[] = { 0, 1 };

    assert(gbs::play_tracker_music(gbs::TrackerAsset { patterns, 2, order, 2, true }));
    assert(gbs::audio_is_tracker_music_playing());
    assert(square_starts == 1);

    gbs::audio_update();
    assert(noise_starts == 1);
    gbs::audio_update();
    assert(square_starts == 2);
    gbs::audio_update();
    assert(gbs::audio_is_tracker_music_playing());
    assert(square_starts == 3);

    gbs::stop_tracker_music();
    assert(!gbs::audio_is_tracker_music_playing());
    assert(square_stops >= 2);
    assert(noise_stops >= 1);
}

void test_tracker_row_starts_all_channels_before_waiting() {
    gbs::audio_init();
    const gbs::TrackerStep steps[] = {
        { 1, 262, 0, 6, 2 },
        { 2, 330, 0, 5, 1 },
        { 3, 131, 0, 5, 0 },
        { 4, 900, 4, 7, 0 },
        { 1, 294, 4, 6, 2 }
    };
    const gbs::TrackerPattern patterns[] = {
        { steps, 5 }
    };
    const uint8_t order[] = { 0 };

    assert(gbs::is_valid_tracker_step(steps[0]));
    assert(gbs::is_valid_tracker_asset(gbs::TrackerAsset { patterns, 1, order, 1, true }));
    assert(gbs::play_tracker_music(gbs::TrackerAsset { patterns, 1, order, 1, true }));
    assert(square_starts == 2);
    assert(wave_starts == 1);
    assert(noise_starts == 1);

    gbs::audio_update();
    gbs::audio_update();
    gbs::audio_update();
    assert(square_starts == 2);
    assert(noise_starts == 1);
    gbs::audio_update();
    assert(square_starts == 3);
    assert(square_stops >= 1);
    assert(wave_stops >= 1);
    assert(noise_stops >= 1);

    gbs::audio_update();
    gbs::audio_update();
    gbs::audio_update();
    gbs::audio_update();
    assert(square_starts == 5);
    assert(wave_starts == 2);
    assert(noise_starts == 2);

    const gbs::TrackerStep invalid_steps[] = {
        { 1, 262, 0, 6, 2 },
        { 2, 330, 0, 5, 1 }
    };
    const gbs::TrackerPattern invalid_patterns[] = {
        { invalid_steps, 2 }
    };
    assert(!gbs::is_valid_tracker_asset(gbs::TrackerAsset { invalid_patterns, 1, order, 1, true }));
}

void test_tracker_timbre_envelope_and_sample_trigger_are_rendered() {
    gbs::audio_init();
    const int8_t sample_data[] = { 0, 32, -32, 0 };
    const gbs::PcmAsset samples[] = {
        { sample_data, 4, 8000, true }
    };
    const gbs::TrackerStep steps[] = {
        { 3, 220, 0, 10, 0, 0, 0, 3, -1, 0 },
        { 4, 900, 0, 8, 1, 0, 0, 0, -1, 0 },
        { 1, 262, 4, 12, 2, 2, 2, 0, 0, 16000 }
    };
    const gbs::TrackerPattern patterns[] = {
        { steps, 3 }
    };
    const uint8_t order[] = { 0 };
    const gbs::TrackerAsset asset { patterns, 1, order, 1, false, samples, 1 };

    assert(gbs::play_tracker_music(asset));
    assert(last_wave_waveform == 3);
    assert(last_noise_duty == 1);
    assert(last_square_volume == 12);
    assert(gbs::audio_pcm_active_sfx_count() == 0);
    gbs::audio_update();
    assert(last_square_volume == 6);
    assert(square_starts == 1);
    gbs::audio_update();
    assert(last_square_volume == 12);
    assert(square_starts == 1);
    gbs::audio_update();
    assert(last_square_volume == 6);
    assert(square_starts == 1);
    gbs::audio_update();
    assert(!gbs::audio_is_tracker_music_playing());
    assert(!gbs::audio_is_pcm_streaming());
}

void test_sample_instrument_uses_pcm_only_and_applies_envelope() {
    reset_hw_counts();
    gbs::audio_init();
    const int8_t sample_data[] = { 60, 60, 60, 60 };
    const gbs::PcmAsset samples[] = { { sample_data, 4, 32768, true } };
    gbs::TrackerStep step { 1, 262, 4, 12, 2, 2, 2, 0, 0, 65536 };
    step.sample_only = true;
    const gbs::TrackerPattern patterns[] = { { &step, 1 } };
    const uint8_t order[] = { 0 };
    const gbs::TrackerAsset asset { patterns, 1, order, 1, false, samples, 1 };
    assert(gbs::play_tracker_music(asset));
    assert(square_starts == 0 && wave_starts == 0 && noise_starts == 0);
    gbs::audio_update();
    assert(last_pcm_first_sample == 24);
    gbs::audio_update();
    assert(last_pcm_first_sample == 48);
    gbs::audio_update();
    assert(last_pcm_first_sample == 24);
    gbs::audio_update();
    assert(!gbs::audio_is_tracker_music_playing());
    assert(!gbs::audio_is_pcm_streaming());
    step.sample_index = -1;
    assert(!gbs::is_valid_tracker_asset(asset));
}

void test_block_resampler_matches_scalar_reference_at_loop_and_carry_boundaries() {
    static int8_t samples[65535];
    for (size_t i = 0; i < 65535; ++i) samples[i] = static_cast<int8_t>((i * 37) % 161 - 80);
    const uint32_t rates[] = { 4000, 12000, gbs::PCM_MIXER_SAMPLE_RATE_HZ, 32768 };
    const size_t lengths[] = { 4, 3277, 65535 };
    for (uint32_t rate : rates) for (size_t length : lengths) for (int loop = 0; loop <= 1; ++loop) {
        gbs::audio_init();
        const size_t loop_start = length > 4 ? 2 : 0;
        const size_t loop_end = length;
        const gbs::PcmAsset asset { samples, length, rate, loop != 0, loop_start, loop_end };
        assert(gbs::set_audio_channel_volume(gbs::AudioChannel::Sfx, 11));
        assert(gbs::set_audio_channel_volume(gbs::AudioChannel::PcmSfx, 9));
        assert(gbs::play_pcm_sfx(asset, gbs::PcmSfxOptions { 12, 8, 0, 63 }));
        const auto gains = gbs::pcm_pan_gains(63);
        const uint32_t step = static_cast<uint32_t>((static_cast<uint64_t>(rate) << 16) / gbs::PCM_MIXER_SAMPLE_RATE_HZ);
        uint64_t position = 0;
        for (size_t block = 0; block < 132; ++block) {
            for (int8_t& sample : last_pcm_samples) sample = 0;
            for (int8_t& sample : last_pcm_right_samples) sample = 0;
            gbs::audio_update();
            for (size_t i = 0; i < gbs::PCM_MIXER_SAMPLES_PER_FRAME; ++i) {
                int sample = 0;
                if ((position >> 16) < length) {
                    const size_t index = position >> 16;
                    const size_t next = index + 1 < length ? index + 1 : loop ? loop_start : index;
                    sample = samples[index] + (((samples[next] - samples[index]) * static_cast<int32_t>(position & 65535u)) >> 16);
                    sample = (((sample * 12) / 15 * 11) / 15 * 9) / 15;
                    position += step;
                    if (loop && (position >> 16) >= loop_end) position = ((loop_start + ((position >> 16) - loop_end) % (loop_end - loop_start)) << 16) | (position & 65535u);
                }
                assert(last_pcm_samples[i] == sample * gains.left / 15);
                assert(last_pcm_right_samples[i] == sample * gains.right / 15);
            }
        }
    }
}

void test_tracker_sample_pan_and_music_sfx_overlap() {
    gbs::audio_init();
    const int8_t sample_data[] = { 60, 60, 60, 60 };
    const gbs::PcmAsset sample { sample_data, 4, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true };
    gbs::TrackerStep step { 1, 262, 4, 15, 2, 0, 0, 0, 0, gbs::PCM_MIXER_SAMPLE_RATE_HZ };
    step.sample_only = true; step.pan = -127;
    const gbs::TrackerPattern pattern { &step, 1 };
    const uint8_t order[] = { 0 };
    const gbs::TrackerAsset music { &pattern, 1, order, 1, true, &sample, 1 };
    assert(gbs::play_tracker_music(music));
    assert(gbs::play_pcm_sfx(sample, gbs::PcmSfxOptions { 15, 8, 0, 127 }));
    gbs::audio_update();
    assert(last_pcm_first_sample == 60 && last_pcm_right_first_sample == 60);
    assert(gbs::audio_is_tracker_music_playing());
    assert(gbs::audio_pcm_active_sfx_count() == 1);
    gbs::stop_pcm_sfx();
    gbs::audio_update();
    assert(last_pcm_first_sample == 60 && last_pcm_right_first_sample == 0);
}

void test_tracker_music_without_loop_finishes() {
    gbs::audio_init();
    const gbs::TrackerStep steps[] = {
        { 2, 262, 1, 5, 1 }
    };
    const gbs::TrackerPattern patterns[] = {
        { steps, 1 }
    };
    const uint8_t order[] = { 0 };

    assert(gbs::play_tracker_music(gbs::TrackerAsset { patterns, 1, order, 1, false }));
    gbs::audio_update();
    assert(!gbs::audio_is_tracker_music_playing());
}

void test_simple_music_stops_tracker_music() {
    gbs::audio_init();
    const gbs::TrackerStep tracker_steps[] = {
        { 2, 262, 4, 5, 1 }
    };
    const gbs::TrackerPattern patterns[] = {
        { tracker_steps, 1 }
    };
    const uint8_t order[] = { 0 };
    const gbs::MusicStep music_steps[] = {
        { 440, 1, 4, 1 }
    };

    assert(gbs::play_tracker_music(gbs::TrackerAsset { patterns, 1, order, 1, true }));
    assert(gbs::audio_is_tracker_music_playing());
    assert(gbs::play_music(gbs::MusicAsset { music_steps, 1, false }));
    assert(!gbs::audio_is_tracker_music_playing());
    assert(gbs::audio_is_music_playing());
}

void test_music_channel_mute_blocks_and_unblocks_music_sources() {
    gbs::audio_init();
    const gbs::MusicStep music_steps[] = {
        { 262, 4, 4, 1 }
    };
    const gbs::TrackerStep tracker_steps[] = {
        { 2, 330, 4, 5, 1 }
    };
    const gbs::TrackerPattern patterns[] = {
        { tracker_steps, 1 }
    };
    const uint8_t order[] = { 0 };
    const int8_t pcm_samples[] = { 0, 32, -32, 0 };

    assert(gbs::play_music(gbs::MusicAsset { music_steps, 1, true }));
    gbs::set_audio_channel_muted(gbs::AudioChannel::Music, true);

    assert(gbs::audio_is_channel_muted(gbs::AudioChannel::Music));
    assert(!gbs::audio_is_music_playing());
    assert(!gbs::audio_is_tracker_music_playing());
    assert(!gbs::audio_is_pcm_music_playing());
    assert(!gbs::play_music(gbs::MusicAsset { music_steps, 1, true }));
    assert(!gbs::play_tracker_music(gbs::TrackerAsset { patterns, 1, order, 1, true }));
    assert(!gbs::play_pcm_music(gbs::PcmAsset { pcm_samples, 4, 8000, true }));

    gbs::set_audio_channel_muted(gbs::AudioChannel::Music, false);
    assert(!gbs::audio_is_channel_muted(gbs::AudioChannel::Music));
    assert(gbs::play_music(gbs::MusicAsset { music_steps, 1, true }));
}

void test_audio_bus_volume_and_timed_fade_apply_to_psg_and_pcm() {
    gbs::audio_init();
    const gbs::MusicStep music_steps[] = {
        { 262, 8, 15, 1 }
    };
    assert(gbs::set_audio_channel_volume(gbs::AudioChannel::Music, 10));
    assert(gbs::audio_channel_volume(gbs::AudioChannel::Music) == 10);
    assert(gbs::play_music(gbs::MusicAsset { music_steps, 1, true }));
    assert(last_square_volume == 10);

    assert(gbs::fade_audio_channel_volume(gbs::AudioChannel::Music, 0, 2));
    assert(gbs::audio_channel_fade_remaining(gbs::AudioChannel::Music) == 2);
    gbs::audio_update();
    assert(gbs::audio_channel_volume(gbs::AudioChannel::Music) == 5);
    assert(last_square_volume == 5);
    gbs::audio_update();
    assert(gbs::audio_channel_volume(gbs::AudioChannel::Music) == 0);
    assert(gbs::audio_channel_fade_remaining(gbs::AudioChannel::Music) == 0);
    assert(last_square_volume == 0);

    const int8_t pcm_samples[400] = { 120 };
    assert(gbs::set_audio_channel_volume(gbs::AudioChannel::Music, 15));
    assert(gbs::set_audio_channel_volume(gbs::AudioChannel::PcmMusic, 8));
    assert(gbs::play_pcm_music(gbs::PcmAsset { pcm_samples, 400, 12000, true }, 15));
    gbs::audio_update();
    assert(last_pcm_first_sample == 64);

    assert(!gbs::set_audio_channel_volume(gbs::AudioChannel::Sfx, 16));
    assert(!gbs::fade_audio_channel_volume(gbs::AudioChannel::Sfx, 16, 10));
}

void test_pcm_asset_validation() {
    const int8_t samples[] = { 0, 12, -12, 0 };
    assert(gbs::is_valid_pcm_sample_rate(16384));
    assert(!gbs::is_valid_pcm_sample_rate(2000));
    assert(!gbs::is_valid_pcm_sample_rate(40000));
    assert(gbs::is_valid_pcm_volume(15));
    assert(!gbs::is_valid_pcm_volume(16));
    assert(gbs::is_valid_pcm_asset(gbs::PcmAsset { samples, 4, gbs::PCM_MIXER_SAMPLE_RATE_HZ / 2, false }));
    assert(gbs::is_valid_pcm_asset(gbs::PcmAsset { samples, 4, 16384, true }));
    assert(gbs::is_valid_pcm_asset(gbs::PcmAsset { samples, 4, 16384, true, 1, 3 }));
    assert(!gbs::is_valid_pcm_asset(gbs::PcmAsset { samples, 4, 16384, true, 3, 3 }));
    assert(!gbs::is_valid_pcm_asset(gbs::PcmAsset { samples, 4, 16384, true, 1, 5 }));
    assert(!gbs::is_valid_pcm_asset(gbs::PcmAsset { nullptr, 4, 16384, false }));
    assert(!gbs::is_valid_pcm_asset(gbs::PcmAsset { samples, 0, 16384, false }));
}

void test_pcm_sfx_playback_lifetime() {
    gbs::audio_init();
    const int8_t samples[600] = {};
    const gbs::PcmAsset asset { samples, 600, 22050, false };

    assert(gbs::play_pcm_sfx(asset));
    assert(gbs::audio_is_pcm_sfx_playing());
    assert(!gbs::audio_is_pcm_streaming());
    assert(pcm_starts == 0);

    gbs::audio_update();
    assert(gbs::audio_is_pcm_sfx_playing());
    assert(gbs::audio_is_pcm_streaming());
    assert(gbs::audio_pcm_submitted_block_count() == 1);
    assert(pcm_stream_starts == 1);
    assert(pcm_starts == 1);
    assert(last_pcm_sample_count == gbs::PCM_MIXER_SAMPLES_PER_FRAME);
    assert(last_pcm_sample_rate == gbs::PCM_MIXER_SAMPLE_RATE_HZ);

    gbs::audio_update();
    assert(!gbs::audio_is_pcm_sfx_playing());
    assert(!gbs::audio_is_pcm_streaming());
    assert(pcm_stops >= 1);
}

void test_pcm_music_loop_and_stop() {
    gbs::audio_init();
    const int8_t samples[400] = {};
    const gbs::PcmAsset asset { samples, 400, 12000, true };

    assert(gbs::play_pcm_music(asset));
    assert(gbs::audio_is_pcm_music_playing());
    assert(pcm_starts == 0);
    for (int frame = 0; frame < 4; ++frame) {
        gbs::audio_update();
    }
    assert(pcm_stream_starts == 1);
    assert(pcm_starts == 4);
    assert(gbs::audio_pcm_submitted_block_count() == 4);
    assert(gbs::audio_is_pcm_streaming());
    assert(gbs::audio_is_pcm_music_playing());
    gbs::stop_pcm_music();
    assert(!gbs::audio_is_pcm_music_playing());
    assert(!gbs::audio_is_pcm_streaming());
    assert(pcm_stops >= 1);
}

void test_pcm_music_uses_partial_loop_points() {
    gbs::audio_init();
    const int8_t samples[] = { 10, 20, 30, 40, 50 };
    const gbs::PcmAsset asset { samples, 5, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true, 1, 3 };

    assert(gbs::play_pcm_music(asset));
    gbs::audio_update();
    assert(last_pcm_first_sample == 10);
    gbs::audio_update();
    assert(last_pcm_first_sample == 20 || last_pcm_first_sample == 30);
    assert(gbs::audio_is_pcm_music_playing());
}

void test_pcm_sfx_mixes_with_pcm_music_channel() {
    gbs::audio_init();
    const int8_t music_samples[480] = { 24 };
    const int8_t sfx_samples[240] = { 48 };
    const gbs::PcmAsset music { music_samples, 480, 12000, true };
    const gbs::PcmAsset sfx { sfx_samples, 240, 12000, false };

    assert(gbs::play_pcm_music(music));
    assert(gbs::play_pcm_sfx(sfx));
    assert(pcm_starts == 0);

    gbs::audio_update();
    assert(pcm_stream_starts == 1);
    assert(pcm_starts == 1);
    assert(gbs::audio_is_pcm_sfx_playing());
    assert(gbs::audio_is_pcm_music_playing());
    assert(last_pcm_first_sample == 72);
}

void test_pcm_mixer_accepts_multiple_sfx_voices() {
    gbs::audio_init();
    const int8_t samples_a[400] = { 80 };
    const int8_t samples_b[400] = { 80 };
    const gbs::PcmAsset asset_a { samples_a, 400, 12000, false };
    const gbs::PcmAsset asset_b { samples_b, 400, 12000, false };

    assert(gbs::audio_pcm_mixer_capacity() == gbs::PCM_MIXER_MAX_SFX_VOICES);
    assert(gbs::play_pcm_sfx(asset_a, gbs::PcmSfxOptions { 15, 4 }));
    assert(gbs::play_pcm_sfx(asset_b, gbs::PcmSfxOptions { 15, 4 }));
    assert(gbs::audio_pcm_active_sfx_count() == 2);
    gbs::audio_update();
    assert(last_pcm_first_sample > 96);
    assert(last_pcm_first_sample < 127);
}

void test_pcm_mixer_uses_linear_interpolation_at_hardware_frame_rate() {
    gbs::audio_init();
    const int8_t samples[] = { 0, 100, 0, -100 };
    const gbs::PcmAsset asset { samples, 4, gbs::PCM_MIXER_SAMPLE_RATE_HZ / 2, false };

    assert(gbs::PCM_MIXER_SAMPLE_RATE_HZ == 31536);
    assert(gbs::PCM_MIXER_SAMPLES_PER_FRAME == 528);
    assert(gbs::play_pcm_sfx(asset));
    gbs::audio_update();
    assert(last_pcm_samples[0] == 0);
    assert(last_pcm_samples[1] == 50);
    assert(last_pcm_samples[2] == 99);
    assert(last_pcm_samples[3] == 50);
}

void test_pcm_mixer_preserves_signed_samples_for_fifo_bytes() {
    gbs::audio_init();
    const int8_t samples[] = { 0, 32, -32 };
    const gbs::PcmAsset asset { samples, 3, gbs::PCM_MIXER_SAMPLE_RATE_HZ, false };

    assert(gbs::play_pcm_sfx(asset));
    gbs::audio_update();
    assert(last_pcm_raw_samples[0] == 0x00);
    assert(last_pcm_raw_samples[1] == 0x20);
    assert(last_pcm_raw_samples[2] == 0xE0);
}

void test_pcm_volume_rounding_matches_integer_gains() {
    const int values[] = { -96, -60, -1, 0, 1, 60, 96 };
    for (int source : values) {
        const int8_t samples[] = { static_cast<int8_t>(source) };
        const gbs::PcmAsset asset { samples, 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true };
        for (uint8_t voice = 0; voice <= 15; ++voice) {
            for (uint8_t master = 0; master <= 15; ++master) {
                gbs::audio_init();
                assert(gbs::set_audio_channel_volume(gbs::AudioChannel::Music, master));
                assert(gbs::set_audio_channel_volume(gbs::AudioChannel::PcmMusic, 11));
                assert(gbs::play_pcm_music(asset, voice));
                gbs::audio_update();
                assert(last_pcm_first_sample == (((source * voice) / 15 * master) / 15 * 11) / 15);
            }
        }
    }
}

void test_pcm_soft_limiter_preserves_gain_curve_and_stereo_pan() {
    for (int source = -128; source <= 127; ++source) {
        gbs::audio_init();
        const int8_t samples[] = { static_cast<int8_t>(source) };
        const gbs::PcmAsset asset { samples, 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true };
        assert(gbs::play_pcm_music(asset));
        assert(gbs::play_pcm_sfx(asset));
        gbs::audio_update();
        const int mixed = source * 2;
        const int magnitude = mixed < 0 ? -mixed : mixed;
        const int excess = magnitude > 96 ? magnitude - 96 : 0;
        const int limited = magnitude <= 96 ? magnitude : 96 + (excess * 31) / (excess + 32);
        assert(last_pcm_first_sample == (mixed < 0 ? -limited : limited));
    }
    gbs::audio_init();
    const int8_t samples[] = { 60 };
    const gbs::PcmAsset asset { samples, 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true };
    assert(gbs::play_pcm_sfx(asset, gbs::PcmSfxOptions { 15, 8, 0, -127 }));
    gbs::audio_update();
    assert(last_pcm_first_sample == 60 && last_pcm_right_first_sample == 0);
    gbs::stop_pcm_sfx();
    assert(gbs::play_pcm_sfx(asset, gbs::PcmSfxOptions { 15, 8, 0, 127 }));
    gbs::audio_update();
    assert(last_pcm_first_sample == 0 && last_pcm_right_first_sample == 60);
}

void test_pcm_mixer_rejects_low_priority_when_full() {
    gbs::audio_init();
    const int8_t samples[800] = { 4 };
    const gbs::PcmAsset asset { samples, 800, 12000, false };

    for (size_t index = 0; index < gbs::PCM_MIXER_MAX_SFX_VOICES; ++index) {
        assert(gbs::play_pcm_sfx(asset, gbs::PcmSfxOptions { 15, 7 }));
    }
    assert(gbs::audio_pcm_active_sfx_count() == gbs::PCM_MIXER_MAX_SFX_VOICES);
    assert(!gbs::play_pcm_sfx(asset, gbs::PcmSfxOptions { 15, 3 }));
    assert(gbs::audio_pcm_active_sfx_count() == gbs::PCM_MIXER_MAX_SFX_VOICES);
    assert(gbs::play_pcm_sfx(asset, gbs::PcmSfxOptions { 15, 9 }));
    assert(gbs::audio_pcm_active_sfx_count() == gbs::PCM_MIXER_MAX_SFX_VOICES);
}

void test_shared_pcm_budget_preserves_music_and_prioritizes_effects() {
    gbs::audio_init();
    const int8_t silence[] = { 0 };
    const int8_t effect_samples[][1] = { { 10 }, { 20 }, { 30 }, { 40 }, { 50 } };
    const gbs::PcmAsset music_samples[] = { { silence, 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true } };
    gbs::PcmAsset effects[5];
    for (size_t i = 0; i < 5; ++i) effects[i] = { effect_samples[i], 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true };
    const uint8_t priorities[] = { 1, 4, 9, 7 };
    for (size_t i = 0; i < 4; ++i) assert(gbs::play_pcm_sfx(effects[i], priorities[i], 15));
    gbs::TrackerStep steps[] = {
        { 1, 262, 0, 15, 2 }, { 2, 262, 0, 15, 2 }, { 3, 262, 60, 15, 2 }
    };
    for (auto& step : steps) { step.sample_index = 0; step.sample_only = true; }
    const gbs::TrackerPattern patterns[] = { { steps, 3 } };
    const uint8_t order[] = { 0 };
    const gbs::TrackerAsset song { patterns, 1, order, 1, true, music_samples, 1 };
    assert(gbs::play_tracker_music(song));
    assert(gbs::audio_pcm_active_sfx_count() == 2);
    assert(gbs::audio_runtime_usage().active_voice_count == 5);
    gbs::audio_update();
    assert(last_pcm_first_sample == 70); // Only priority 9 and 7 effects survive.
    assert(!gbs::play_pcm_sfx(effects[4], 6, 15));
    assert(gbs::play_pcm_sfx(effects[4], 9, 15));
    gbs::audio_update();
    assert(last_pcm_first_sample == 80); // Replace priority 7 before priority 9.
    assert(gbs::play_pcm_sfx(effects[3], 9, 15));
    gbs::audio_update();
    assert(last_pcm_first_sample == 90); // Equal priority replaces the oldest effect.
    gbs::stop_tracker_music();
    assert(gbs::play_pcm_sfx(effects[0], 1, 15));
    assert(gbs::play_pcm_sfx(effects[1], 1, 15));
    assert(gbs::audio_pcm_active_sfx_count() == 4);
}

void test_shared_pcm_budget_reclaims_effects_when_tracker_adds_channels() {
    gbs::audio_init();
    const int8_t samples[] = { 20 };
    const gbs::PcmAsset pcm[] = { { samples, 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true } };
    gbs::TrackerStep steps[] = {
        { 1, 262, 0, 15, 2 }, { 2, 262, 0, 15, 2 }, { 3, 262, 2, 15, 2 },
        { 1, 262, 0, 15, 2 }, { 2, 262, 0, 15, 2 }, { 3, 262, 0, 15, 2 }, { 4, 262, 60, 15, 2 }
    };
    for (auto& step : steps) { step.sample_index = 0; step.sample_only = true; }
    const gbs::TrackerPattern patterns[] = { { steps, 7 } };
    const uint8_t order[] = { 0 };
    const gbs::TrackerAsset song { patterns, 1, order, 1, true, pcm, 1 };
    assert(gbs::play_tracker_music(song));
    assert(gbs::play_pcm_sfx(pcm[0], 8, 15));
    assert(gbs::play_pcm_sfx(pcm[0], 9, 15));
    assert(!gbs::play_pcm_sfx(pcm[0], 7, 15));
    gbs::audio_update();
    gbs::audio_update();
    assert(gbs::audio_is_tracker_music_playing());
    assert(gbs::audio_pcm_active_sfx_count() == 1);
    assert(gbs::audio_runtime_usage().active_voice_count == 5);
    assert(gbs::play_pcm_music(pcm[0]));
    assert(gbs::audio_pcm_active_sfx_count() == 0);
    assert(gbs::audio_runtime_usage().active_voice_count == 5);
    assert(!gbs::play_pcm_sfx(pcm[0], 15, 15));
}

void test_equal_priority_pcm_effect_age_survives_counter_rollover() {
    gbs::audio_init();
    const int8_t silence[] = { 0 };
    const gbs::PcmAsset music { silence, 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true };
    const int8_t samples[][1] = { { 1 }, { 2 }, { 3 }, { 4 }, { 5 }, { 6 } };
    gbs::PcmAsset effects[6];
    for (size_t i = 0; i < 6; ++i) effects[i] = { samples[i], 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true };
    assert(gbs::play_pcm_music(music));
    for (size_t i = 0; i < 4; ++i) assert(gbs::play_pcm_sfx(effects[i], 7, 15));
    // Music/sample triggers share the serial counter, while effects may loop.
    for (size_t i = 0; i < 65530; ++i) assert(gbs::play_pcm_music(music));
    assert(gbs::play_pcm_sfx(effects[4], 7, 15));
    assert(gbs::play_pcm_sfx(effects[5], 7, 15));
    gbs::audio_update();
    assert(last_pcm_first_sample == 18); // Keep 3+4+5+6; neither new effect is oldest.
    assert(gbs::audio_runtime_usage().active_voice_count == 5);
    for (size_t i = 0; i < 65536; ++i) assert(gbs::play_pcm_music(music));
    assert(gbs::play_pcm_sfx(effects[0], 7, 15));
    assert(gbs::play_pcm_sfx(effects[1], 7, 15));
    gbs::audio_update();
    assert(last_pcm_first_sample == 14); // Keep 5+6+1+2 after another rollover.
}

void test_pcm_mixer_rejects_invalid_volume() {
    gbs::audio_init();
    const int8_t samples[32] = {};
    const gbs::PcmAsset asset { samples, 32, 12000, false };

    assert(!gbs::play_pcm_sfx(asset, gbs::PcmSfxOptions { 16, 8 }));
    assert(!gbs::play_pcm_music(asset, 16));
    assert(gbs::audio_pcm_active_sfx_count() == 0);
    assert(!gbs::audio_is_pcm_music_playing());
}

void test_stopping_pcm_effect_or_music_keeps_sample_tracker_stream_running() {
    gbs::audio_init();
    const int8_t samples[] = { 20 };
    const gbs::PcmAsset pcm[] = { { samples, 1, gbs::PCM_MIXER_SAMPLE_RATE_HZ, true } };
    gbs::TrackerStep step { 1, 262, 60, 15, 2 };
    step.sample_index = 0;
    step.sample_only = true;
    const gbs::TrackerPattern patterns[] = { { &step, 1 } };
    const uint8_t order[] = { 0 };
    const gbs::TrackerAsset song { patterns, 1, order, 1, true, pcm, 1 };
    assert(gbs::play_tracker_music(song));
    assert(gbs::play_pcm_sfx(pcm[0]));
    gbs::audio_update();
    const int initial_stream_starts = pcm_stream_starts;
    const int initial_stream_stops = pcm_stops;
    gbs::stop_pcm_sfx();
    assert(pcm_stops == initial_stream_stops);
    gbs::audio_update();
    assert(last_pcm_first_sample == 20);
    assert(pcm_stream_starts == initial_stream_starts);
    assert(gbs::play_pcm_music(pcm[0]));
    gbs::audio_update();
    gbs::stop_pcm_music();
    assert(pcm_stops == initial_stream_stops);
    gbs::audio_update();
    assert(last_pcm_first_sample == 20);
    assert(pcm_stream_starts == initial_stream_starts);
    assert(gbs::audio_is_tracker_music_playing());
}

void test_pcm_pan_exposes_center_and_channel_extremes() {
    assert(gbs::is_valid_pcm_pan(-127));
    assert(gbs::is_valid_pcm_pan(127));
    assert(!gbs::is_valid_pcm_pan(-128));
    assert(gbs::pcm_pan_gains(0).left == 15);
    assert(gbs::pcm_pan_gains(0).right == 15);
    assert(gbs::pcm_pan_gains(-127).left == 15);
    assert(gbs::pcm_pan_gains(-127).right == 0);
    assert(gbs::pcm_pan_gains(127).left == 0);
    assert(gbs::pcm_pan_gains(127).right == 15);
}

void test_audio_runtime_usage_reports_active_pcm_memory() {
    gbs::audio_init();
    const int8_t samples[600] = {};
    const gbs::PcmAsset asset { samples, 600, 12000, true };

    const gbs::AudioRuntimeUsage empty = gbs::audio_runtime_usage();
    assert(empty.pcm_source_bytes == 0);
    assert(empty.active_voice_count == 0);
    assert(empty.bytes == empty.mixer_buffer_bytes);
    assert(empty.pcm_underrun_count == 0);
    // Keep mixer scratch below 3.8 KB on both the ARM and 64-bit host ABI.
    assert(empty.mixer_buffer_bytes <= 3800);

    assert(gbs::play_pcm_music(asset));
    assert(gbs::play_pcm_sfx(asset));
    hardware_pcm_underrun_count = 3;
    const gbs::AudioRuntimeUsage active = gbs::audio_runtime_usage();
    assert(active.pcm_source_bytes == 600);
    assert(active.active_voice_count == 2);
    assert(active.bytes == active.mixer_buffer_bytes + 600);
    assert(active.pcm_underrun_count == 3);
}

void test_audio_mix_cost_estimates_assets_and_mix_budget() {
    const gbs::SfxTone tones[] = {
        { 440, 3, 10, 1, false },
        { 880, 2, 8, 2, true }
    };
    const gbs::MusicStep music_steps[] = {
        { 262, 4, 5, 1 },
        { 330, 5, 5, 1 }
    };
    const gbs::TrackerStep tracker_steps[] = {
        { 1, 262, 2, 5, 1 },
        { 2, 330, 2, 5, 1 },
        { 4, 900, 1, 6, 0 }
    };
    const gbs::TrackerPattern patterns[] = {
        { tracker_steps, 3 }
    };
    const uint8_t order[] = { 0 };
    const int8_t pcm_samples[600] = {};

    gbs::AudioMixCost sfx_cost = gbs::estimate_sfx_asset_cost(gbs::SfxAsset { tones, 2 });
    assert(sfx_cost.valid);
    assert(sfx_cost.psg_steps == 2);
    assert(sfx_cost.frame_count == 5);
    assert(sfx_cost.noise_steps == 1);

    gbs::AudioMixCost music_cost = gbs::estimate_music_asset_cost(gbs::MusicAsset { music_steps, 2, true });
    assert(music_cost.valid);
    assert(music_cost.psg_steps == 2);
    assert(music_cost.frame_count == 9);
    assert(music_cost.looping_assets == 1);

    gbs::AudioMixCost tracker_cost = gbs::estimate_tracker_asset_cost(gbs::TrackerAsset { patterns, 1, order, 1, true });
    assert(tracker_cost.valid);
    assert(tracker_cost.tracker_steps == 3);
    assert(tracker_cost.psg_steps == 3);
    assert(tracker_cost.noise_steps == 1);
    assert(tracker_cost.frame_count == 5);

    gbs::AudioMixCost pcm_cost = gbs::estimate_pcm_asset_cost(gbs::PcmAsset { pcm_samples, 600, 12000, false });
    assert(pcm_cost.valid);
    assert(pcm_cost.pcm_bytes == 600);
    assert(pcm_cost.pcm_source_samples == 600);
    // 50 ms fits in three GBA frames (about 59.73 Hz).
    assert(pcm_cost.estimated_mixer_frames == 3);
    assert(pcm_cost.mixer_output_samples_per_frame == gbs::PCM_MIXER_SAMPLES_PER_FRAME);

    gbs::AudioMixCost mix_cost = gbs::estimate_pcm_mix_runtime_cost(4, true);
    assert(mix_cost.valid);
    assert(mix_cost.pcm_sfx_voices == 4);
    assert(mix_cost.pcm_music_voices == 1);
    assert(mix_cost.mixer_voices == 5);
    assert(mix_cost.mixer_output_samples_per_frame == gbs::PCM_MIXER_SAMPLES_PER_FRAME);
    assert(!gbs::estimate_pcm_mix_runtime_cost(5, false).valid);

    gbs::AudioMixCost combined = gbs::add_audio_mix_cost(sfx_cost, pcm_cost);
    assert(combined.valid);
    assert(combined.psg_steps == 2);
    assert(combined.pcm_bytes == 600);
}

} // namespace

int main() {
    test_equal_priority_pcm_effect_age_survives_counter_rollover();
    test_stopping_pcm_effect_or_music_keeps_sample_tracker_stream_running();
    test_shared_pcm_budget_preserves_music_and_prioritizes_effects();
    test_shared_pcm_budget_reclaims_effects_when_tracker_adds_channels();
    test_tone_validation();
    test_psg_pan_is_forwarded_to_hardware();
    test_sfx_playback_lifetime();
    test_noise_sfx_uses_noise_channel();
    test_sfx_envelope_and_noise_duty_are_rendered();
    test_square_sfx_attack_keeps_the_dac_enabled();
    test_invalid_assets_are_silent();
    test_music_loop_and_stop();
    test_music_without_loop_finishes();
    test_tracker_asset_validation();
    test_tracker_music_order_loop_and_stop();
    test_tracker_row_starts_all_channels_before_waiting();
    test_tracker_timbre_envelope_and_sample_trigger_are_rendered();
    test_sample_instrument_uses_pcm_only_and_applies_envelope();
    test_block_resampler_matches_scalar_reference_at_loop_and_carry_boundaries();
    test_tracker_sample_pan_and_music_sfx_overlap();
    test_tracker_music_without_loop_finishes();
    test_simple_music_stops_tracker_music();
    test_music_channel_mute_blocks_and_unblocks_music_sources();
    test_audio_bus_volume_and_timed_fade_apply_to_psg_and_pcm();
    test_pcm_asset_validation();
    test_pcm_sfx_playback_lifetime();
    test_pcm_music_loop_and_stop();
    test_pcm_music_uses_partial_loop_points();
    test_pcm_sfx_mixes_with_pcm_music_channel();
    test_pcm_mixer_accepts_multiple_sfx_voices();
    test_pcm_mixer_uses_linear_interpolation_at_hardware_frame_rate();
    test_pcm_mixer_preserves_signed_samples_for_fifo_bytes();
    test_pcm_volume_rounding_matches_integer_gains();
    test_pcm_soft_limiter_preserves_gain_curve_and_stereo_pan();
    test_pcm_mixer_rejects_low_priority_when_full();
    test_pcm_mixer_rejects_invalid_volume();
    test_pcm_pan_exposes_center_and_channel_extremes();
    test_audio_runtime_usage_reports_active_pcm_memory();
    test_audio_mix_cost_estimates_assets_and_mix_budget();
    return 0;
}
