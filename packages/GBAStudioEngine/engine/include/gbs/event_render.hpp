#pragma once
#include "gbs/event.hpp"
#include "gbs/render.hpp"

namespace gbs {
// A short-lived copy preserves the source shared by other actors and animations.
inline MetaSprite event_scaled_metasprite(const EventState& state, int actor_index, const MetaSprite& source) {
    MetaSprite result = source;
    if (actor_index < -1 || actor_index >= static_cast<int>(max_event_actor_state_slots)) return result;
    const auto& scale = state.actor_scales[actor_index + 1];
    result.scale_x256 = static_cast<uint16_t>(source.scale_x256 * scale.x256 / 256);
    result.scale_y256 = static_cast<uint16_t>(source.scale_y256 * scale.y256 / 256);
    return result;
}
}
