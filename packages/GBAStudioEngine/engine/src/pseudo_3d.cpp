#include "gbs/pseudo_3d.hpp"

namespace gbs {

namespace {

const RoadSegment* s_segments = nullptr;
uint16_t s_segment_count = 0;

// Fixed-point math for perspective projection.
// Camera sits at a fixed height above the road.
constexpr int32_t camera_height = 100;     // height above road
constexpr int32_t camera_depth = 128;      // projection depth factor
constexpr int32_t road_width_base = 200;   // base road width at camera

} // namespace

void road_init(const RoadSegment* segments, uint16_t segment_count) {
    s_segments = segments;
    s_segment_count = segment_count > road_max_segments ? road_max_segments : segment_count;
}

void road_update_camera(RoadCamera& camera) {
    // Apply steering to player position.
    const int32_t dx = (static_cast<int32_t>(camera.steer) * camera.speed) >> 8;
    camera.player_x = static_cast<int16_t>(camera.player_x + dx);

    // Clamp player position to road bounds.
    if (camera.player_x > 256) camera.player_x = 256;
    if (camera.player_x < -256) camera.player_x = -256;

    // Advance position.
    camera.position += camera.speed;

    // Wrap around track.
    const int32_t track_length = static_cast<int32_t>(s_segment_count) * road_segment_length;
    if (track_length > 0) {
        while (camera.position >= track_length) {
            camera.position -= track_length;
        }
        while (camera.position < 0) {
            camera.position += track_length;
        }
    }
}

int16_t road_project_z(int32_t world_z, const RoadCamera& /*camera*/) {
    if (world_z <= 0) {
        return -1;
    }
    const int32_t screen_y = (camera_height * camera_depth) / world_z;
    if (screen_y < 0 || screen_y >= road_screen_height) {
        return -1;
    }
    return static_cast<int16_t>(screen_y);
}

uint16_t road_segment_at(int32_t world_position, uint16_t segment_count) {
    if (segment_count == 0) return 0;
    int32_t pos = world_position;
    const int32_t total = static_cast<int32_t>(segment_count) * road_segment_length;
    while (pos < 0) pos += total;
    while (pos >= total) pos -= total;
    return static_cast<uint16_t>(pos / road_segment_length);
}

void road_render(const RoadCamera& camera, RoadRenderState& state) {
    if (s_segments == nullptr || s_segment_count == 0) {
        for (uint16_t y = 0; y < road_screen_height; ++y) {
            state.offset[y] = 0;
            state.width[y] = 0;
            state.color[y] = 0;
            state.sprite_tile[y] = 0;
            state.sprite_x[y] = 0;
            state.sprite_scale_log[y] = 0;
        }
        return;
    }

    // Accumulated curve offset (cumulative sum of curvature).
    int32_t curve_accum = 0;

    // Render from bottom (near) to top (far).
    for (uint16_t y = road_screen_height; y > 0; --y) {
        const uint16_t screen_y = y - 1;

        // Calculate the Z distance for this scanline.
        // Z = camera_depth * camera_height / (screen_y - horizon)
        // For simplicity, use linear mapping: bottom = near, top = far.
        const uint16_t row_from_bottom = road_screen_height - 1 - screen_y;
        const int32_t z = camera_depth + row_from_bottom * 8;

        if (z <= 0) {
            state.offset[screen_y] = 0;
            state.width[screen_y] = 0;
            state.color[screen_y] = 0;
            state.sprite_tile[screen_y] = 0;
            state.sprite_x[screen_y] = 0;
            state.sprite_scale_log[screen_y] = 0;
            continue;
        }

        // Road width scales inversely with distance.
        const int32_t road_w = (road_width_base * camera_depth) / z;
        state.width[screen_y] = static_cast<uint16_t>(road_w > 0 ? road_w : 0);

        // Horizontal offset from curve accumulation + player position.
        const int32_t curve_offset = (curve_accum * camera_depth) / z;
        state.offset[screen_y] = static_cast<int16_t>(
            curve_offset - camera.player_x + 120 // center at 120
        );

        // Determine which segment this scanline belongs to.
        const int32_t seg_z = camera.position + z;
        const uint16_t seg_idx = road_segment_at(seg_z, s_segment_count);
        const RoadSegment& seg = s_segments[seg_idx];

        // Color: alternate between light/dark for road stripes.
        state.color[screen_y] = ((seg_idx & 1) != 0) ? 1 : 0;

        // Accumulate curve.
        curve_accum += seg.curve;

        // Roadside sprite.
        if (seg.sprite.active) {
            state.sprite_tile[screen_y] = seg.sprite.tile_id;
            state.sprite_x[screen_y] = static_cast<int16_t>(
                state.offset[screen_y] + seg.sprite.offset_x
            );
            // Scale: closer = larger. Use log2 for shift-based scaling.
            const int32_t sprite_scale = (seg.sprite.scale * camera_depth) / z;
            uint8_t log2_scale = 0;
            int32_t tmp = sprite_scale;
            while (tmp > 1 && log2_scale < 8) {
                tmp >>= 1;
                ++log2_scale;
            }
            state.sprite_scale_log[screen_y] = log2_scale;
        } else {
            state.sprite_tile[screen_y] = 0;
            state.sprite_x[screen_y] = 0;
            state.sprite_scale_log[screen_y] = 0;
        }
    }
}

} // namespace gbs