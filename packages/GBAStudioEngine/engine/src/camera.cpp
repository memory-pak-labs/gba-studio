#include "gbs/camera.hpp"

namespace gbs {

namespace {

// Clamp a Fixed value to integer pixel bounds.
Fixed clamp_to_bounds(Fixed value, int16_t minimum, int16_t maximum) {
    const int32_t raw = value.raw();
    const int32_t min_raw = static_cast<int32_t>(minimum) * Fixed::scale;
    const int32_t max_raw = static_cast<int32_t>(maximum) * Fixed::scale;
    if (raw < min_raw) {
        return Fixed::from_raw(min_raw);
    }
    if (raw > max_raw) {
        return Fixed::from_raw(max_raw);
    }
    return value;
}

} // namespace

void camera_init(Camera2D& camera) {
    camera = Camera2D {};
}

void camera_set_position(Camera2D& camera, Fixed x, Fixed y) {
    camera.x = x;
    camera.y = y;
    camera.target_x = x;
    camera.target_y = y;
    camera.following = false;
}

void camera_set_position_pixels(Camera2D& camera, int x, int y) {
    camera_set_position(camera, Fixed::from_int(x), Fixed::from_int(y));
}

void camera_set_bounds(Camera2D& camera, int min_x, int max_x, int min_y, int max_y) {
    camera.min_x = static_cast<int16_t>(min_x);
    camera.max_x = static_cast<int16_t>(max_x);
    camera.min_y = static_cast<int16_t>(min_y);
    camera.max_y = static_cast<int16_t>(max_y);
    camera.bounds_enabled = true;
}

void camera_disable_bounds(Camera2D& camera) {
    camera.bounds_enabled = false;
}

void camera_follow(Camera2D& camera, Fixed target_x, Fixed target_y, uint16_t speed_x100) {
    camera.target_x = target_x;
    camera.target_y = target_y;
    camera.follow_speed_x100 = speed_x100 == 0 ? 100 : speed_x100;
    camera.following = true;
}

void camera_stop_follow(Camera2D& camera) {
    camera.following = false;
}

void camera_shake(Camera2D& camera, uint16_t intensity, uint16_t frames) {
    camera.shake_intensity = intensity;
    camera.shake_frames_remaining = frames;
    camera.shake_total_frames = frames;
    seed_random(camera.shake_random, 0x9E3779B9u);
}

void camera_update(Camera2D& camera) {
    // Follow target with smoothing.
    if (camera.following) {
        if (camera.follow_speed_x100 >= 100) {
            camera.x = camera.target_x;
            camera.y = camera.target_y;
        } else {
            const uint32_t factor = (static_cast<uint32_t>(camera.follow_speed_x100) * Fixed::scale) / 100u;
            const int64_t dx = static_cast<int64_t>(camera.target_x.raw() - camera.x.raw()) * factor / Fixed::scale;
            const int64_t dy = static_cast<int64_t>(camera.target_y.raw() - camera.y.raw()) * factor / Fixed::scale;
            camera.x = Fixed::from_raw(static_cast<int32_t>(camera.x.raw() + dx));
            camera.y = Fixed::from_raw(static_cast<int32_t>(camera.y.raw() + dy));
        }
    }

    // Clamp to bounds.
    if (camera.bounds_enabled && is_valid_camera_bounds(camera)) {
        camera.x = clamp_to_bounds(camera.x, camera.min_x, camera.max_x);
        camera.y = clamp_to_bounds(camera.y, camera.min_y, camera.max_y);
    }

    // Shake decay.
    if (camera.shake_frames_remaining > 0) {
        --camera.shake_frames_remaining;
    }
}

Vec2i camera_offset_pixels(Camera2D& camera) {
    int32_t ox = camera.x.to_int();
    int32_t oy = camera.y.to_int();
    if (camera.shake_frames_remaining > 0 && camera.shake_intensity > 0) {
        const int32_t range = static_cast<int32_t>(camera.shake_intensity) + 1;
        ox += random_range(camera.shake_random, -camera.shake_intensity, camera.shake_intensity) % range;
        oy += random_range(camera.shake_random, -camera.shake_intensity, camera.shake_intensity) % range;
    }
    return Vec2i { static_cast<int16_t>(ox), static_cast<int16_t>(oy) };
}

Fixed camera_x(const Camera2D& camera) {
    return camera.x;
}

Fixed camera_y(const Camera2D& camera) {
    return camera.y;
}

void camera_apply_to_bg(
    Camera2D& camera,
    BackgroundLayer layer,
    const BackgroundParallax* parallax
) {
    const Vec2i offset = camera_offset_pixels(camera);
    if (parallax != nullptr && is_valid_background_parallax(*parallax)) {
        const Vec2i scrolled = parallax_scroll_for_camera(offset, *parallax);
        set_bg_scroll(layer, scrolled.x, scrolled.y);
    } else {
        set_bg_scroll(layer, offset.x, offset.y);
    }
}

bool camera_is_shaking(const Camera2D& camera) {
    return camera.shake_frames_remaining > 0 && camera.shake_intensity > 0;
}

} // namespace gbs