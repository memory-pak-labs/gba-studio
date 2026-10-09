#include <cassert>
#include "gbs/action.hpp"

namespace {

extern "C" void gbs_hw_set_bg_scroll(int, int, int) {}
extern "C" uint16_t gbs_hw_timer_value(int) { return 0; }
extern "C" void gbs_hw_set_backdrop(uint16_t) {}

// Custom apply that records values into a test array.
int32_t custom_records[100];
int custom_record_count = 0;

void record_apply(gbs::ActionTarget, uint8_t, int32_t value, void*) {
    custom_records[custom_record_count++] = value;
}

} // namespace

void test_animate_from_to() {
    gbs::action_clear();
    const uint8_t h = gbs::action_animate(
        gbs::ActionTarget::SpriteX,
        0,
        0, 100, 10,
        gbs::Easing::Linear
    );
    assert(h != 0);
    assert(gbs::action_active_count() == 1);

    // frame 0 -> 0
    gbs::action_update_frame();
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 0);

    // frame 5 -> ~50
    gbs::action_update_frame(); // 1
    gbs::action_update_frame(); // 2
    gbs::action_update_frame(); // 3
    gbs::action_update_frame(); // 4
    gbs::action_update_frame(); // 5
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 50);

    // advance to completion
    for (int i = 6; i <= 10; ++i) {
        gbs::action_update_frame();
    }
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 100);
    assert(!gbs::action_active(h));
    assert(gbs::action_active_count() == 0);

    gbs::action_clear();
}

void test_loop() {
    gbs::action_clear();
    const uint8_t h = gbs::action_animate(
        gbs::ActionTarget::SpriteY,
        1,
        0, 10, 5,
        gbs::Easing::Linear,
        true // loop
    );
    assert(h != 0);

    for (int i = 0; i < 10; ++i) {
        gbs::action_update_frame();
    }
    // Should still be active after looping
    assert(gbs::action_active(h));

    gbs::action_clear();
}

void test_custom_apply() {
    gbs::action_clear();
    custom_record_count = 0;

    gbs::Action action;
    action.target = gbs::ActionTarget::Custom;
    action.index = 0;
    action.provider = gbs::ActionValueProvider { 0, 40, 0, 4, 0, gbs::Easing::Linear, false };
    action.apply = record_apply;
    action.enabled = true;

    const uint8_t h = gbs::action_start(action);
    assert(h != 0);

    gbs::action_update_frame(); // 0
    gbs::action_update_frame(); // 1
    gbs::action_update_frame(); // 2
    gbs::action_update_frame(); // 3
    gbs::action_update_frame(); // 4 -> complete

    assert(custom_record_count == 5);
    assert(custom_records[0] == 0);
    assert(custom_records[1] == 10);
    assert(custom_records[2] == 20);
    assert(custom_records[3] == 30);
    assert(custom_records[4] == 40);

    gbs::action_clear();
}

void test_delay() {
    gbs::action_clear();
    const uint8_t h = gbs::action_delay(5);
    assert(h != 0);

    for (int i = 0; i < 4; ++i) {
        gbs::action_update_frame();
        assert(gbs::action_active(h));
    }
    gbs::action_update_frame();
    assert(!gbs::action_active(h));

    gbs::action_clear();
}

void test_animate_by_delta() {
    gbs::action_clear();
    const uint8_t h = gbs::action_animate_by(
        gbs::ActionTarget::BgScrollX,
        2,
        50, 5,
        gbs::Easing::Linear
    );
    assert(h != 0);

    gbs::action_update_frame(); // 0 -> 0
    assert(gbs::action_host_last_value(gbs::ActionTarget::BgScrollX, 2) == 0);

    gbs::action_update_frame(); // 1 -> 10
    gbs::action_update_frame(); // 2 -> 20
    gbs::action_update_frame(); // 3 -> 30
    gbs::action_update_frame(); // 4 -> 40
    gbs::action_update_frame(); // 5 -> 50 complete
    assert(gbs::action_host_last_value(gbs::ActionTarget::BgScrollX, 2) == 50);
    assert(!gbs::action_active(h));

    gbs::action_clear();
}

void test_sequence() {
    gbs::action_clear();
    // a1: 0..8 over 4 frames (steps 2). a2: 100..108 over 4 frames.
    const uint8_t a1 = gbs::action_animate(gbs::ActionTarget::SpriteX, 0, 0, 8, 4, gbs::Easing::Linear);
    const uint8_t a2 = gbs::action_animate(gbs::ActionTarget::SpriteX, 0, 100, 108, 4, gbs::Easing::Linear);
    assert(a1 != 0);
    assert(a2 != 0);

    const uint8_t handles[] = { a1, a2 };
    const uint8_t seq = gbs::action_sequence_start(handles, 2);
    assert(seq != 0);
    assert(gbs::action_sequence_running(seq));

    // a2 paused initially; a1 advances: u1=0, u2=2, u3=4
    for (int i = 0; i < 3; ++i) {
        gbs::action_update_frame();
    }
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 4);

    // complete a1: u4=6 then final 8 -> sequence advances to a2
    gbs::action_update_frame();
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 8);
    assert(gbs::action_sequence_running(seq));

    // a2 first frame: u5=100
    gbs::action_update_frame();
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 100);

    // complete a2: u7=102, u8=104, u9=106, u10=108
    for (int i = 0; i < 4; ++i) {
        gbs::action_update_frame();
    }
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 108);
    assert(!gbs::action_sequence_running(seq));

    gbs::action_clear();
}

void test_parallel() {
    gbs::action_clear();
    // both 0..16 over 8 frames (steps 2)
    const uint8_t a1 = gbs::action_animate(gbs::ActionTarget::SpriteY, 1, 0, 16, 8, gbs::Easing::Linear);
    const uint8_t a2 = gbs::action_animate(gbs::ActionTarget::SpriteY, 2, 0, 16, 8, gbs::Easing::Linear);
    assert(a1 != 0);
    assert(a2 != 0);

    const uint8_t handles[] = { a1, a2 };
    const uint8_t par = gbs::action_parallel_start(handles, 2);
    assert(par != 0);

    // After 5 updates: elapsed=4 -> 8
    for (int i = 0; i < 5; ++i) {
        gbs::action_update_frame();
    }
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteY, 1) == 8);
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteY, 2) == 8);

    // Complete both: 9 more updates (frames 6..8 for value, completion at 8)
    for (int i = 0; i < 9; ++i) {
        gbs::action_update_frame();
    }
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteY, 1) == 16);
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteY, 2) == 16);

    gbs::action_clear();
}

void test_loop_composition() {
    gbs::action_clear();
    // inner: 0..8 over 4 frames; loop 3 times
    const uint8_t inner = gbs::action_animate(gbs::ActionTarget::SpriteX, 0, 0, 8, 4, gbs::Easing::Linear);
    assert(inner != 0);
    const uint8_t loop = gbs::action_loop_start(inner, 3);
    assert(loop != 0);
    assert(gbs::action_loop_running(loop));

    // 1st pass: 4 updates complete inner -> value 8
    for (int i = 0; i < 4; ++i) gbs::action_update_frame();
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 8);
    // After composition update, loop restarts inner on next frame
    gbs::action_update_frame(); // triggers restart, inner at 0
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 0);

    // Complete passes 2 and 3: pass2 (4 updates) + pass3 start + 3 more
    for (int i = 0; i < 4; ++i) gbs::action_update_frame(); // pass2 -> 8
    gbs::action_update_frame(); // restart pass3, value 0
    for (int i = 0; i < 3; ++i) gbs::action_update_frame(); // pass3 value 6
    // pass 3 completes at the 4th update -> 8, loop ends
    gbs::action_update_frame();
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteX, 0) == 8);
    assert(!gbs::action_loop_running(loop));

    gbs::action_clear();
}

void test_sprite_affine_actions() {
    gbs::action_clear();

    // SpriteRotation: animate from 0 to 0x4000 (90 degrees) over 4 frames.
    const uint8_t rot_h = gbs::action_animate_sprite_rotation(
        0, 0, 0x4000, 4, gbs::Easing::Linear);
    assert(rot_h != 0);

    // Frame 0: angle = 0
    gbs::action_update_frame();
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteRotation, 0) == 0);

    // Frame 2: angle = 0x2000 (45 degrees)
    gbs::action_update_frame();
    gbs::action_update_frame();
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteRotation, 0) == 0x2000);

    // Complete.
    gbs::action_update_frame();
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteRotation, 0) == 0x4000);

    gbs::action_clear();

    // SpriteScaleX: animate from 256 (1.0x) to 512 (2.0x) over 4 frames.
    const uint8_t sx_h = gbs::action_animate_sprite_scale_x(
        1, 256, 512, 4, gbs::Easing::Linear);
    assert(sx_h != 0);

    gbs::action_update_frame(); // frame 0
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteScaleX, 1) == 256);

    gbs::action_update_frame(); // frame 1
    gbs::action_update_frame(); // frame 2
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteScaleX, 1) == 384);

    gbs::action_update_frame(); // frame 3
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteScaleX, 1) == 512);

    gbs::action_clear();

    // SpriteScaleY: animate from 256 to 128 (0.5x) over 2 frames.
    gbs::action_animate_sprite_scale_y(
        2, 256, 128, 2, gbs::Easing::Linear);
    gbs::action_update_frame(); // frame 0
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteScaleY, 2) == 256);
    gbs::action_update_frame(); // frame 1
    assert(gbs::action_host_last_value(gbs::ActionTarget::SpriteScaleY, 2) == 128);
}

int main() {
    test_animate_from_to();
    test_loop();
    test_custom_apply();
    test_delay();
    test_animate_by_delta();
    test_sequence();
    test_parallel();
    test_loop_composition();
    test_sprite_affine_actions();
    return 0;
}