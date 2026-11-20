#pragma once
#include "gbs/event.hpp"
#include "gbs/render.hpp"

namespace gbs {
inline void stage_event_actor_wave(const EventState& state, int actor, int first, int count) {
    if (const int amplitude = event_actor_wave_amplitude(state, actor); amplitude > 0) {
        stage_actor_scanline_wave(first, count, amplitude, static_cast<uint32_t>(state.event_frame_counter));
    }
}

// A short-lived copy preserves the source shared by other actors and animations.
inline MetaSprite event_scaled_metasprite(const EventState& state, int actor_index, const MetaSprite& source) {
    MetaSprite result = source;
    if (actor_index < -1 || actor_index >= static_cast<int>(max_event_actor_state_slots)) return result;
    const auto& scale = state.actor_scales[actor_index + 1];
    if (scale.x256 == 256 && scale.y256 == 256) return result;
    result.scale_x256 = static_cast<uint16_t>(source.scale_x256 * scale.x256 / 256);
    result.scale_y256 = static_cast<uint16_t>(source.scale_y256 * scale.y256 / 256);
    return result;
}
}
