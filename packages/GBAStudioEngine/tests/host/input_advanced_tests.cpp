#include <cassert>
#include "gbs/input_advanced.hpp"

using namespace gbs;

void test_repeat_initial_delay() {
    InputRepeatState rep;
    input_repeat_init(rep);

    // Hold A continuously. initial_delay = 18, repeat_rate = 6.
    InputState input;
    input.held = ButtonA;
    input.pressed = ButtonA;
    input.released = 0;

    for (int frame = 1; frame <= 18; ++frame) {
        input.pressed = 0;  // only the first frame reports pressed
        input_update_repeat(rep, input);
        // No repeat before held_frames reaches initial_delay + 1 (19).
        assert((rep.repeated & ButtonA) == 0);
    }

    // Frame 19: initial_delay (18) elapsed -> first repeat fires.
    input_update_repeat(rep, input);
    assert((rep.repeated & ButtonA) != 0);
}

void test_repeat_rate() {
    InputRepeatState rep;
    input_repeat_init(rep);

    InputState input;
    input.held = ButtonA;
    input.pressed = ButtonA;
    input.released = 0;
    input_update_repeat(rep, input);  // frame 1, fresh press

    // Advance to the first repeat (frame 19).
    for (int frame = 2; frame <= 19; ++frame) {
        input.pressed = 0;
        input_update_repeat(rep, input);
    }
    assert((rep.repeated & ButtonA) != 0);  // first repeat at frame 19

    // Next repeat should fire after 6 more frames (frame 25).
    for (int frame = 20; frame <= 24; ++frame) {
        input_update_repeat(rep, input);
        assert((rep.repeated & ButtonA) == 0);
    }
    input_update_repeat(rep, input);  // frame 25
    assert((rep.repeated & ButtonA) != 0);
}

void test_repeat_releases_on_release() {
    InputRepeatState rep;
    input_repeat_init(rep);

    InputState input;
    input.held = ButtonA;
    input.pressed = ButtonA;
    input.released = 0;
    input_update_repeat(rep, input);  // frame 1

    // Release the button.
    input.held = 0;
    input.pressed = 0;
    input.released = ButtonA;
    input_update_repeat(rep, input);
    assert((rep.repeated & ButtonA) == 0);

    // Re-hold: repeat delay resets.
    input.held = ButtonA;
    input.pressed = ButtonA;
    input.released = 0;
    input_update_repeat(rep, input);  // fresh press again, no repeat
    assert((rep.repeated & ButtonA) == 0);
}

void test_combos() {
    InputState input;
    input.held = 0;
    input.pressed = 0;
    input.released = 0;

    // Combo pressed: A+B in same frame.
    input.pressed = ButtonA | ButtonB;
    assert(input_combo_pressed(input, ButtonA | ButtonB));
    assert(!input_combo_pressed(input, ButtonA | ButtonB | ButtonStart));

    // Combo held.
    input.held = ButtonA | ButtonB;
    input.pressed = 0;
    assert(input_combo_held(input, ButtonA | ButtonB));
    assert(!input_combo_held(input, ButtonA | ButtonB | ButtonL));

    // Repeat combo tracking.
    InputRepeatState rep;
    input_repeat_init(rep);
    input.held = ButtonA | ButtonB;
    input.pressed = ButtonA | ButtonB;
    input_update_repeat(rep, input);  // fresh press
    assert(!input_combo_repeated(rep, ButtonA | ButtonB));
}

int main() {
    test_repeat_initial_delay();
    test_repeat_rate();
    test_repeat_releases_on_release();
    test_combos();
    return 0;
}