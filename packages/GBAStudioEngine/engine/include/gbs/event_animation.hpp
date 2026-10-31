#pragma once

#include "gbs/animation.hpp"
#include "gbs/event.hpp"

namespace gbs {

inline bool apply_event_player_animation_command(
    SpriteAnimatorState& animator,
    int& speed_percent,
    const EventActorCommand& command
) {
    if (command.actor_index != event_player_actor_index) return false;
    switch (command.op) {
    case EventActorOp::SetAnimationFrame:
        return set_sprite_animation_frame(animator, command.a);
    case EventActorOp::SetAnimationSpeed:
        speed_percent = command.a < 1 ? 1 : (command.a > 400 ? 400 : command.a);
        return true;
    default:
        return false;
    }
}

} // namespace gbs
