#include <cassert>
#include "gbs/pseudo_3d.hpp"

using namespace gbs;

void test_road_init() {
    RoadSegment segments[4] = {};
    road_init(segments, 4);
    // No crash = pass.
}

void test_road_update_camera() {
    RoadCamera cam = {};
    cam.speed = 10;
    cam.steer = 0;
    cam.position = 0;
    cam.player_x = 0;

    road_update_camera(cam);
    assert(cam.position == 10);
    assert(cam.player_x == 0);
}

void test_road_update_camera_steer() {
    RoadCamera cam = {};
    cam.speed = 10;
    cam.steer = 64; // steer right
    cam.position = 0;
    cam.player_x = 0;

    road_update_camera(cam);
    assert(cam.player_x > 0); // moved right
}

void test_road_update_camera_clamp() {
    RoadCamera cam = {};
    cam.speed = 10;
    cam.steer = 128;
    cam.position = 0;
    cam.player_x = 250;

    road_update_camera(cam);
    assert(cam.player_x <= 256); // clamped
}

void test_road_project_z_near() {
    RoadCamera cam = {};
    cam.position = 0;
    int16_t screen_y = road_project_z(100, cam);
    assert(screen_y >= 0);
    assert(screen_y < 160);
}

void test_road_project_z_far() {
    RoadCamera cam = {};
    cam.position = 0;
    int16_t screen_y = road_project_z(10000, cam);
    // Very far = screen_y close to 0 or negative.
    assert(screen_y < 160);
}

void test_road_project_z_behind() {
    RoadCamera cam = {};
    cam.position = 0;
    int16_t screen_y = road_project_z(-10, cam);
    assert(screen_y == -1); // behind camera
}

void test_road_segment_at() {
    RoadSegment segments[4] = {};
    road_init(segments, 4);

    uint16_t idx = road_segment_at(0, 4);
    assert(idx == 0);

    idx = road_segment_at(200, 4); // one full segment
    assert(idx == 1);

    idx = road_segment_at(800, 4); // wraps around
    assert(idx == 0);
}

void test_road_render_empty() {
    road_init(nullptr, 0); // reset to empty
    RoadCamera cam = {};
    RoadRenderState state = {};
    road_render(cam, state);
    // No crash, all zeros.
    assert(state.width[159] == 0);
}

void test_road_render_with_track() {
    RoadSegment segments[8] = {};
    segments[0].curve = 10;
    segments[1].curve = -5;
    segments[2].sprite.active = true;
    segments[2].sprite.tile_id = 3;
    segments[2].sprite.offset_x = 50;
    road_init(segments, 8);

    RoadCamera cam = {};
    cam.speed = 0;
    cam.position = 0;
    cam.player_x = 0;

    RoadRenderState state = {};
    road_render(cam, state);

    // Bottom scanline should have non-zero width.
    assert(state.width[159] > 0);
    // Sprite should appear on the segment with active sprite.
    bool found_sprite = false;
    for (uint16_t y = 0; y < 160; ++y) {
        if (state.sprite_tile[y] == 3) {
            found_sprite = true;
            break;
        }
    }
    assert(found_sprite);
}

void test_road_render_curve_offset() {
    RoadSegment segments[8] = {};
    for (int i = 0; i < 8; ++i) {
        segments[i].curve = 20; // strong right curve
    }
    road_init(segments, 8);

    RoadCamera cam = {};
    cam.speed = 0;
    cam.position = 0;
    cam.player_x = 0;

    RoadRenderState state = {};
    road_render(cam, state);

    // Far scanlines (top) should have larger curve offset than near (bottom).
    assert(state.offset[10] != state.offset[159]);
}

int main() {
    test_road_init();
    test_road_update_camera();
    test_road_update_camera_steer();
    test_road_update_camera_clamp();
    test_road_project_z_near();
    test_road_project_z_far();
    test_road_project_z_behind();
    test_road_segment_at();
    test_road_render_empty();
    test_road_render_with_track();
    test_road_render_curve_offset();
    return 0;
}