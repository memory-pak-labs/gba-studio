#include <cassert>
#include "gbs/camera.hpp"

namespace {

int last_bg_scroll_layer = -1;
int last_bg_scroll_x = 0;
int last_bg_scroll_y = 0;

extern "C" void gbs_hw_set_bg_scroll(int layer, int x, int y) {
    last_bg_scroll_layer = layer;
    last_bg_scroll_x = x;
    last_bg_scroll_y = y;
}

void reset_hw() {
    last_bg_scroll_layer = -1;
    last_bg_scroll_x = 0;
    last_bg_scroll_y = 0;
}

} // namespace

namespace gbs {
void set_bg_scroll(BackgroundLayer layer, int x, int y) {
    gbs_hw_set_bg_scroll(static_cast<int>(layer), x, y);
}
} // namespace gbs

void test_init_and_set() {
    gbs::Camera2D cam;
    gbs::camera_init(cam);
    assert(cam.x.raw() == 0);
    assert(cam.y.raw() == 0);

    gbs::camera_set_position_pixels(cam, 120, 80);
    assert(gbs::camera_x(cam).to_int() == 120);
    assert(gbs::camera_y(cam).to_int() == 80);

    const gbs::Vec2i off = gbs::camera_offset_pixels(cam);
    assert(off.x == 120);
    assert(off.y == 80);
}

void test_bounds() {
    gbs::Camera2D cam;
    gbs::camera_init(cam);
    gbs::camera_set_position_pixels(cam, 500, 500);
    gbs::camera_set_bounds(cam, 0, 240, 0, 160);
    gbs::camera_update(cam);
    assert(gbs::camera_x(cam).to_int() == 240);
    assert(gbs::camera_y(cam).to_int() == 160);

    gbs::camera_set_position_pixels(cam, -50, -50);
    gbs::camera_update(cam);
    assert(gbs::camera_x(cam).to_int() == 0);
    assert(gbs::camera_y(cam).to_int() == 0);

    gbs::camera_disable_bounds(cam);
    gbs::camera_update(cam);
    assert(gbs::camera_x(cam).to_int() == 0);
}

void test_follow_instant() {
    gbs::Camera2D cam;
    gbs::camera_init(cam);
    gbs::camera_follow(cam, gbs::Fixed::from_int(100), gbs::Fixed::from_int(50), 100);
    gbs::camera_update(cam);
    assert(gbs::camera_x(cam).to_int() == 100);
    assert(gbs::camera_y(cam).to_int() == 50);
}

void test_follow_smooth() {
    gbs::Camera2D cam;
    gbs::camera_init(cam);
    gbs::camera_set_position_pixels(cam, 0, 0);
    gbs::camera_follow(cam, gbs::Fixed::from_int(100), gbs::Fixed::from_int(100), 50);
    // Each update moves halfway toward the target (factor 0.5).
    gbs::camera_update(cam);
    assert(gbs::camera_x(cam).to_int() == 50);
    gbs::camera_update(cam);
    assert(gbs::camera_x(cam).to_int() == 75);
}

void test_shake() {
    gbs::Camera2D cam;
    gbs::camera_init(cam);
    gbs::camera_set_position_pixels(cam, 0, 0);
    gbs::camera_shake(cam, 4, 3);
    assert(gbs::camera_is_shaking(cam));

    gbs::camera_update(cam);
    assert(gbs::camera_is_shaking(cam));
    gbs::camera_update(cam);
    assert(gbs::camera_is_shaking(cam));
    gbs::camera_update(cam);
    // After the 3rd update the shake count reached 0.
    assert(!gbs::camera_is_shaking(cam));

    // Once stopped, offset has no shake contribution.
    const gbs::Vec2i off = gbs::camera_offset_pixels(cam);
    assert(off.x == 0 && off.y == 0);
}

void test_apply_to_bg() {
    reset_hw();
    gbs::Camera2D cam;
    gbs::camera_init(cam);
    gbs::camera_set_position_pixels(cam, 30, 40);

    gbs::camera_apply_to_bg(cam, gbs::BackgroundLayer::BG1);
    assert(last_bg_scroll_layer == 1);
    assert(last_bg_scroll_x == 30);
    assert(last_bg_scroll_y == 40);

    // With parallax factor 2x on X only.
    const gbs::BackgroundParallax parallax {
        gbs::BackgroundLayer::BG2, 512, 256, { 0, 0 }
    };
    gbs::camera_apply_to_bg(cam, gbs::BackgroundLayer::BG2, &parallax);
    assert(last_bg_scroll_layer == 2);
    assert(last_bg_scroll_x == 60);
    assert(last_bg_scroll_y == 40);
}

int main() {
    test_init_and_set();
    test_bounds();
    test_follow_instant();
    test_follow_smooth();
    test_shake();
    test_apply_to_bg();
    return 0;
}