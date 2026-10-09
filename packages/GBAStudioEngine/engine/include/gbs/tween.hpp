#pragma once

#include "gbs/types.hpp"

namespace gbs {

enum class Easing : uint8_t {
    Linear = 0,
    EaseIn = 1,
    EaseOut = 2,
    EaseInOut = 3,
    Sine = 4,
    EaseInBack = 5,
    EaseOutBack = 6,
    EaseInOutBack = 7,
    EaseInBounce = 8,
    EaseOutBounce = 9
};

// Back ease overshoot constant (Q8.8).
constexpr int32_t tween_back_overshoot_q8 = 436; // ~1.70158 in Q8.8

constexpr bool is_valid_easing(Easing easing) {
    return static_cast<uint8_t>(easing) <= static_cast<uint8_t>(Easing::EaseOutBounce);
}

Fixed tween_progress(uint16_t elapsed_frames, uint16_t duration_frames, Easing easing = Easing::Linear);
Fixed tween_value(
    Fixed from,
    Fixed to,
    uint16_t elapsed_frames,
    uint16_t duration_frames,
    Easing easing = Easing::Linear
);

} // namespace gbs
