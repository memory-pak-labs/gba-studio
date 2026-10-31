#pragma once
#include "gbs/racing.hpp"
namespace gbs {
/** At most one edge-triggered cue per frame; impacts/checkpoints take priority over controls. */
inline int racing_action_sound(const RacingRuntimeState& before, const RacingRuntimeState& after,
        RacingInput input, RacingInput previous, RacingActionSounds sounds) {
    if (racing_result(after) != RacingRaceResult::InProgress) return -1;
    if (after.collision_frames > before.collision_frames) return sounds.collision;
    if (after.checkpoint_count > before.checkpoint_count) return sounds.checkpoint;
    if (input.brake && !previous.brake && before.speed_x256 > 0) return sounds.brake;
    if (input.accelerate && !input.brake && !previous.accelerate) return sounds.accelerate;
    return -1;
}
}
