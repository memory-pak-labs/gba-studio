#pragma once
#include "gbs/event.hpp"
#include "gbs/input.hpp"

namespace gbs {
inline bool topdown_profile_running(const EventState& state, const InputState& input) {
    return state.player_run_button != 0 && (input.held & state.player_run_button) != 0 &&
        state.player_run_speed > state.player_walk_speed;
}

// Profiles are percentages of the authored movement speed, preserving fractional
// steps and the collision solver shared by walking, diagonal movement and running.
inline int topdown_profile_speed_x100(const EventState& state, const InputState& input, int authored_speed) {
    if (state.player_run_button == 0 || authored_speed <= 0) return authored_speed;
    const int percent = topdown_profile_running(state,input) ? state.player_run_speed : state.player_walk_speed;
    return authored_speed * percent / 100;
}

inline int topdown_run_animation_index(size_t animation_count, uint8_t direction, bool running) {
    if (!running || animation_count < 12) return -1;
    const int directions[] {8,10,11,9,8,8,10,10};
    return directions[direction < 8 ? direction : 0];
}
}
