#include "gbs/input_advanced.hpp"

namespace gbs {

namespace {

} // namespace

void input_repeat_init(InputRepeatState& state) {
    for (int i = 0; i < 10; ++i) {
        state.slots[i] = InputRepeatSlot {};
    }
    state.repeated = 0;
    state.initial_delay_frames = input_default_initial_delay;
    state.repeat_rate_frames = input_default_repeat_rate;
    state.frame_counter = 0;
}

void input_update_repeat(InputRepeatState& state, const InputState& input) {
    state.repeated = 0;
    ++state.frame_counter;

    uint16_t button_bit = 1;
    for (int i = 0; i < 10; ++i) {
        const bool held = (input.held & button_bit) != 0;
        InputRepeatSlot& slot = state.slots[i];

        if (!held) {
            slot = InputRepeatSlot {};
            button_bit <<= 1;
            continue;
        }

        ++slot.held_frames;

        // Fresh press: never fires a repeat on the same frame as `pressed`.
        if (slot.held_frames == 1) {
            button_bit <<= 1;
            continue;
        }

        // First repeat fires once the initial delay elapses.
        if (slot.held_frames == static_cast<uint16_t>(state.initial_delay_frames + 1)) {
            state.repeated |= button_bit;
            slot.last_repeat = state.frame_counter;
            button_bit <<= 1;
            continue;
        }

        // Subsequent repeats fire every repeat_rate frames.
        if (slot.last_repeat != 0 &&
            static_cast<uint16_t>(state.frame_counter - slot.last_repeat) >= state.repeat_rate_frames) {
            state.repeated |= button_bit;
            slot.last_repeat = state.frame_counter;
        }

        button_bit <<= 1;
    }
}

} // namespace gbs