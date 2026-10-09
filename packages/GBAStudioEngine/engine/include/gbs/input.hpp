#pragma once

#include <stdint.h>

namespace gbs {

enum Button : uint16_t {
    ButtonA = 1u << 0,
    ButtonB = 1u << 1,
    ButtonSelect = 1u << 2,
    ButtonStart = 1u << 3,
    ButtonRight = 1u << 4,
    ButtonLeft = 1u << 5,
    ButtonUp = 1u << 6,
    ButtonDown = 1u << 7,
    ButtonR = 1u << 8,
    ButtonL = 1u << 9
};

struct InputState {
    uint16_t held;
    uint16_t pressed;
    uint16_t released;

    constexpr bool is_held(Button button) const { return (held & button) != 0; }
    constexpr bool was_pressed(Button button) const { return (pressed & button) != 0; }
};

InputState poll_input();
void reset_input();
bool keypad_irq_pending();
bool consume_keypad_irq();

} // namespace gbs
