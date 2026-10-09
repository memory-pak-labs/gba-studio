#include "gbs/input.hpp"
#include "gbs_hw.h"

namespace {
uint16_t previous_keys = 0;
}

namespace gbs {

void reset_input() {
    previous_keys = 0;
    gbs_hw_clear_keypad_irq();
}

InputState poll_input() {
    uint16_t held = gbs_hw_read_keys();
    InputState state {
        held,
        static_cast<uint16_t>(held & ~previous_keys),
        static_cast<uint16_t>(~held & previous_keys)
    };
    previous_keys = held;
    return state;
}

bool keypad_irq_pending() {
    return gbs_hw_keypad_irq_pending() != 0;
}

bool consume_keypad_irq() {
    return gbs_hw_consume_keypad_irq() != 0;
}

} // namespace gbs
