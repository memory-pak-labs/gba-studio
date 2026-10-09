#pragma once

#include <stdint.h>

#include "gbs/input.hpp"

namespace gbs {

// ============================================================
// Advanced Input: key repeat detection and button combos
// ============================================================

// Per-button repeat tracking. There is one slot per GBA button bit (10).
struct InputRepeatSlot {
    uint16_t held_frames;   // frames the button has been held
    uint16_t repeat_accum;  // frames accumulated toward the next repeat event
    uint16_t last_repeat;   // frame count when the last repeat fired
};

struct InputRepeatState {
    InputRepeatSlot slots[10];
    uint16_t repeated;            // buttons that repeated on this frame
    uint16_t initial_delay_frames; // delay before first repeat (default 18)
    uint16_t repeat_rate_frames;   // frames between repeats (default 6)
    uint16_t frame_counter;        // current frame counter (for last_repeat bookkeeping)
};

constexpr uint16_t input_default_initial_delay = 18;
constexpr uint16_t input_default_repeat_rate = 6;

// Initialize a repeat state with default timings.
void input_repeat_init(InputRepeatState& state);

// Advance the repeat tracker by one frame given the latest raw input.
// Fills state.repeated with buttons that fired a repeat event this frame.
void input_update_repeat(InputRepeatState& state, const InputState& input);

// True if every button in `mask` was pressed in the same frame.
constexpr bool input_combo_pressed(const InputState& input, uint16_t mask) {
    return (input.pressed & mask) == mask;
}

// True if every button in `mask` is currently held.
constexpr bool input_combo_held(const InputState& input, uint16_t mask) {
    return (input.held & mask) == mask;
}

// True if the combo mask was fully pressed or fully held-with-repeat this frame.
constexpr bool input_combo_repeated(const InputRepeatState& state, uint16_t mask) {
    return (state.repeated & mask) == mask;
}

} // namespace gbs