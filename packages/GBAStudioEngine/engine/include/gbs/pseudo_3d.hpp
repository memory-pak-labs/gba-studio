#pragma once

#include <stdint.h>

#include "gbs/types.hpp"

namespace gbs {

// ============================================================
// Pseudo-3D Road Renderer (Varooom / OutRun style)
// ============================================================
// Renders a perspective road using per-scanline horizontal offset
// and width, creating the illusion of a 3D road on 2D hardware.
//
// The road is defined by an array of segments, each specifying:
// - curve: horizontal curvature (positive = right, negative = left)
// - hill: vertical elevation change
// - sprite: optional roadside object
//
// Usage:
//   1. Fill a RoadSegment array with your track data
//   2. Call road_init() with the segment array
//   3. Each frame: update road position, call road_render()

constexpr uint16_t road_max_segments = 256;
constexpr uint16_t road_screen_height = 160;
constexpr uint16_t road_segment_length = 200; // world units per segment

struct RoadSprite {
    int16_t offset_x;      // horizontal offset from road center (-128..128)
    int16_t scale;         // sprite scale (256 = 1.0x)
    uint8_t tile_id;       // which sprite tile to draw
    uint8_t palette;       // palette index
    bool active;           // is there a sprite on this segment?
};

struct RoadSegment {
    int16_t curve;         // curvature: positive = right turn
    int16_t hill;          // elevation change per segment
    RoadSprite sprite;     // optional roadside object
};

struct RoadCamera {
    int32_t position;      // position along the road (world units)
    int16_t player_x;      // player horizontal offset (-256..256)
    int16_t player_y;      // player vertical offset (for hills)
    int16_t speed;         // current speed
    int16_t steer;         // steering input (-128..128)
};

struct RoadRenderState {
    // Per-scanline output (for HBE or direct rendering).
    int16_t offset[road_screen_height];   // horizontal offset per scanline
    uint16_t width[road_screen_height];   // road width per scanline
    uint8_t color[road_screen_height];    // road color/pattern per scanline
    uint8_t sprite_tile[road_screen_height]; // sprite tile to draw (0 = none)
    int16_t sprite_x[road_screen_height];    // sprite screen X
    uint8_t sprite_scale_log[road_screen_height]; // log2(scale)
};

// Initialize the road renderer with track data.
void road_init(const RoadSegment* segments, uint16_t segment_count);

// Update camera position based on speed and steering.
void road_update_camera(RoadCamera& camera);

// Render the road from the current camera position into the render state.
void road_render(const RoadCamera& camera, RoadRenderState& state);

// Project a world Z coordinate to screen Y. Returns -1 if behind camera.
int16_t road_project_z(int32_t world_z, const RoadCamera& camera);

// Get the road segment index at a given world position.
uint16_t road_segment_at(int32_t world_position, uint16_t segment_count);

} // namespace gbs