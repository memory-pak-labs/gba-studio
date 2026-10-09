#include "gbs/audio_engine.hpp"
#include <stddef.h>

namespace gbs {

void audio_engine_init(AudioEngineState& engine) {
    engine.playing = false;
    engine.frame_count = 0;
    engine.current_track = nullptr;
    engine.loop_count = 0;
    engine.master_volume = 80;
}

void audio_engine_update(AudioEngineState& engine) {
    ++engine.frame_count;
}

bool audio_engine_is_playing(const AudioEngineState& engine) {
    return engine.playing;
}

void audio_engine_stop(AudioEngineState& engine) {
    engine.playing = false;
}

void audio_engine_set_master_volume(AudioEngineState& engine, uint8_t volume) {
    if (volume > 100) {
        volume = 100;
    }
    engine.master_volume = volume;
}

uint8_t audio_engine_get_master_volume(const AudioEngineState& engine) {
    return engine.master_volume;
}

} // namespace gbs