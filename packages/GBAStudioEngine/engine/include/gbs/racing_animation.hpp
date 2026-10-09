#pragma once
#include "gbs/racing.hpp"

namespace gbs {
inline bool racing_has_directional_vehicle_clips(const RacingVehicleAnimationSet& clips) {
    for (const auto& direction : clips.directions) {
        if (!direction.idle || !direction.drive) return false;
    }
    return true;
}
inline uint8_t racing_vehicle_direction(uint8_t heading) {
    return static_cast<uint8_t>(((heading + 2) / 4) & 3);
}
inline uint8_t racing_vehicle_sprite_heading(const RacingVehicleAnimationSet& clips, uint8_t heading) {
    return racing_has_directional_vehicle_clips(clips)
        ? static_cast<uint8_t>((heading + 16 - racing_vehicle_direction(heading) * 4) & 15) : heading;
}
inline void update_racing_vehicle_animator(SpriteAnimatorState& animator,
    const RacingVehicleAnimationSet& clips, int speed_x256, RacingInput input, bool collision, uint8_t heading = 0) {
    const SpriteAnimation* braking = input.steering < 0 && clips.brake_left ? clips.brake_left :
        input.steering > 0 && clips.brake_right ? clips.brake_right : clips.brake;
    const SpriteAnimation* selected = collision ? clips.hurt :
        speed_x256 == 0 ? clips.idle : input.brake ? braking :
        input.steering < 0 ? clips.steer_left : input.steering > 0 ? clips.steer_right : clips.drive;
    if (racing_has_directional_vehicle_clips(clips)) {
        const auto& direction = clips.directions[racing_vehicle_direction(heading)];
        selected = collision ? (direction.hurt ? direction.hurt : direction.idle) :
            speed_x256 == 0 ? direction.idle : direction.drive;
    }
    if(selected == nullptr) selected = speed_x256 > 0 && clips.drive != nullptr ? clips.drive : clips.idle;
    if(selected == nullptr) { init_sprite_animator(animator); return; }
    if(animator.animation != selected) play_sprite_animation(animator,*selected);
    else update_sprite_animator(animator);
}
} // namespace gbs
