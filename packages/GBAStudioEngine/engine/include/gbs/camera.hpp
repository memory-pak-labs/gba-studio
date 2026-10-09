#pragma once

#include <stddef.h>
#include <stdint.h>

#include "gbs/random.hpp"
#include "gbs/render.hpp"
#include "gbs/types.hpp"

namespace gbs {

// ============================================================
// 2D Camera
// ============================================================

struct Camera2D {
    Fixed x;
    Fixed y;
    Fixed target_x;
    Fixed target_y;
    bool following = false;

    // Bounds (in pixels); disabled by default.
    bool bounds_enabled = false;
    int16_t min_x = -32768;
    int16_t max_x = 32767;
    int16_t min_y = -32768;
    int16_t max_y = 32767;

    // Follow smoothing: 100 = instant, lower = laggy.
    uint16_t follow_speed_x100 = 100;

    // Shake state.
    uint16_t shake_intensity = 0;
    uint16_t shake_frames_remaining = 0;
    uint16_t shake_total_frames = 0;
    RandomState shake_random { 12345 };
};

constexpr bool is_valid_camera_bounds(const Camera2D& camera) {
    return camera.min_x <= camera.max_x && camera.min_y <= camera.max_y;
}

void camera_init(Camera2D& camera);
void camera_set_position(Camera2D& camera, Fixed x, Fixed y);
void camera_set_position_pixels(Camera2D& camera, int x, int y);
// Set world bounds that clamp the camera center.
void camera_set_bounds(Camera2D& camera, int min_x, int max_x, int min_y, int max_y);
void camera_disable_bounds(Camera2D& camera);
// Start following a target with optional smoothing (speed_x100).
void camera_follow(Camera2D& camera, Fixed target_x, Fixed target_y, uint16_t speed_x100 = 100);
void camera_stop_follow(Camera2D& camera);
// Trigger a shake with the given intensity (pixels) for the given number of frames.
void camera_shake(Camera2D& camera, uint16_t intensity, uint16_t frames);
// Advance follow, bounds and shake. Call once per frame.
void camera_update(Camera2D& camera);
// Camera center in pixels (includes shake offset).
Vec2i camera_offset_pixels(Camera2D& camera);
Fixed camera_x(const Camera2D& camera);
Fixed camera_y(const Camera2D& camera);
// Apply the camera to a background layer, optionally honoring parallax.
void camera_apply_to_bg(
    Camera2D& camera,
    BackgroundLayer layer,
    const BackgroundParallax* parallax = nullptr
);
bool camera_is_shaking(const Camera2D& camera);

} // namespace gbs