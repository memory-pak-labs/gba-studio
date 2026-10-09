#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

// ============================================================
// Simplified Audio Engine
// ============================================================

struct AudioEngineState {
    uint32_t frame_count = 0;
    uint32_t loop_count = 0;
    const void* current_track = nullptr;
    bool playing = false;
    uint8_t master_volume = 80;  // stored integer range 0-100
};

void audio_engine_init(AudioEngineState& engine);
void audio_engine_update(AudioEngineState& engine);
bool audio_engine_is_playing(const AudioEngineState& engine);
void audio_engine_stop(AudioEngineState& engine);
void audio_engine_set_master_volume(AudioEngineState& engine, uint8_t volume);  // 0..100
uint8_t audio_engine_get_master_volume(const AudioEngineState& engine);

} // namespace gbs