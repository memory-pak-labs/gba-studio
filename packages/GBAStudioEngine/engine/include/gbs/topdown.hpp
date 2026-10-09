#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/input.hpp"
#include "gbs/types.hpp"

namespace gbs {

enum TileFlags : uint8_t {
    TileEmpty = 0,
    TileSolid = 1u << 0,
    TileBlockTop = 1u << 1,
    TileBlockBottom = 1u << 2,
    TileBlockLeft = 1u << 3,
    TileBlockRight = 1u << 4,
    TileWater = 1u << 5,
    TileDamage = 1u << 6,
    TileLadder = 1u << 7
};

enum class TileSlope : uint8_t {
    None = 0,
    BlockAboveRising = 1,
    BlockBelowRising = 2,
    BlockAboveFalling = 3,
    BlockBelowFalling = 4
};

struct TileMap {
    const uint8_t* flags;
    int width;
    int height;
    const TileSlope* slopes = nullptr;
};

struct Portal {
    Rect area_pixels;
    int target_room;
    Vec2i target_position_pixels;
    uint8_t target_direction = 0;
    bool has_target_direction = false;
};

struct Room {
    const uint16_t* visual_tiles;
    TileMap collision;
    const Portal* portals;
    size_t portal_count;
    int width_tiles;
    int height_tiles;
};

struct Actor {
    Vec2i position_pixels;
    Vec2i size_pixels;
    int speed_pixels;
    uint8_t direction = 0;
    uint8_t collision_group = 0;
    uint16_t collision_mask = 0xFFFFu;
    Vec2i collision_offset_pixels = Vec2i { 0, 0 };
    uint8_t push_priority = 0;
    bool pushable = false;
};

struct Camera {
    Vec2i position_pixels;
    bool follow_player;
    bool bounds_enabled = false;
    Rect bounds_pixels = Rect { 0, 0, 0, 0 };
    // 8.8 fixed-point scale. The top-down renderer currently uses 256 (100%);
    // keeping the value on the camera makes viewport math share one contract
    // with the future scaled renderer.
    int32_t zoom_x256 = 256;
};

struct CameraZone {
    Rect area_pixels;
    Rect bounds_pixels;
    Vec2i offset_pixels;
    bool lock_x;
    bool lock_y;
};

struct WarpResult {
    bool did_warp;
    int room_index;
    Vec2i player_position_pixels;
    uint8_t player_direction = 0;
    bool has_player_direction = false;
};

struct PortalHit {
    bool did_hit;
    size_t portal_index;
    WarpResult warp;
};

struct PathStep {
    bool found;
    Vec2i delta_pixels;
};

constexpr int topdown_camera_zoom_min_x256 = 128;
constexpr int topdown_camera_zoom_max_x256 = 1024;
constexpr int topdown_camera_default_zoom_x256 = 256;

constexpr int topdown_camera_zoom_clamped_x256(int zoom_x256) {
    return clamp_int(zoom_x256, topdown_camera_zoom_min_x256, topdown_camera_zoom_max_x256);
}

constexpr int topdown_camera_viewport_width_pixels(int zoom_x256) {
    const int zoom = topdown_camera_zoom_clamped_x256(zoom_x256);
    return (gba_screen_width * 256 + zoom - 1) / zoom;
}

constexpr int topdown_camera_viewport_height_pixels(int zoom_x256) {
    const int zoom = topdown_camera_zoom_clamped_x256(zoom_x256);
    return (gba_screen_height * 256 + zoom - 1) / zoom;
}

constexpr Vec2i topdown_camera_viewport_center_pixels(int zoom_x256) {
    return Vec2i {
        topdown_camera_viewport_width_pixels(zoom_x256) / 2,
        topdown_camera_viewport_height_pixels(zoom_x256) / 2
    };
}

bool rect_hits_solid_tile(const TileMap& map, Rect rect);
bool rect_hits_blocking_tile(const TileMap& map, Rect rect, Vec2i delta);
bool actor_overlaps_actor(const Actor& a, const Actor& b);
bool rect_hits_actor(Rect rect, const Actor& actor);
bool rect_hits_any_actor(Rect rect, const Actor* actors, size_t actor_count);
constexpr uint16_t actor_collision_group_bit(uint8_t group) {
    return group < 16 ? static_cast<uint16_t>(1u << group) : 0;
}
constexpr bool actor_collision_groups_overlap(const Actor& mover, const Actor& blocker) {
    uint16_t mover_group = actor_collision_group_bit(mover.collision_group);
    uint16_t blocker_group = actor_collision_group_bit(blocker.collision_group);
    return mover_group != 0 &&
        blocker_group != 0 &&
        (mover.collision_mask & blocker_group) != 0 &&
        (blocker.collision_mask & mover_group) != 0;
}
bool rect_hits_any_blocking_actor(Rect rect, const Actor& mover, const Actor* actors, size_t actor_count);
uint8_t tile_flags_at(const TileMap& map, int tile_x, int tile_y);
TileSlope tile_slope_at(const TileMap& map, int tile_x, int tile_y);
uint8_t tile_flags_in_rect(const TileMap& map, Rect rect);
uint8_t tile_effects_in_rect(const TileMap& map, Rect rect, uint8_t effect_mask);
uint8_t tile_effects_for_actor(const TileMap& map, const Actor& actor, uint8_t effect_mask);
bool tile_flags_block_movement(uint8_t flags, Vec2i delta);
bool tile_flags_have_effect(uint8_t flags, uint8_t effect_mask);
bool tile_slope_blocks_pixel(TileSlope slope, int local_x, int local_y);
void update_player(const TileMap& map, Actor& player, InputState input);
void update_player_with_actor_collisions(const TileMap& map, Actor& player, InputState input, const Actor* blocking_actors, size_t blocking_actor_count);
void update_player_with_actor_push(const TileMap& map, Actor& player, InputState input, Actor* blocking_actors, size_t blocking_actor_count);
PathStep find_actor_path_step(const TileMap& map, const Actor& actor, Vec2i target_pixels, uint8_t max_search_tiles = 64);
PathStep find_actor_path_step_with_actor_collisions(
    const TileMap& map,
    const Actor& actor,
    Vec2i target_pixels,
    const Actor* blocking_actors,
    size_t blocking_actor_count,
    uint8_t max_search_tiles = 64,
    bool allow_nearest_reachable = true
);
bool move_actor_by_delta(const TileMap& map, Actor& actor, Vec2i delta);
bool move_actor_by_delta_with_actor_collisions(const TileMap& map, Actor& actor, Vec2i delta, const Actor* blocking_actors, size_t blocking_actor_count);
bool move_actor_by_delta_with_actor_push(const TileMap& map, Actor& actor, Vec2i delta, Actor* blocking_actors, size_t blocking_actor_count);
int push_actor_by_delta_until_collision(const TileMap& map, Actor& actor, Vec2i delta, const Actor* blocking_actors, size_t blocking_actor_count);
bool move_actor_towards(const TileMap& map, Actor& actor, Vec2i target_pixels, uint8_t max_search_tiles = 64);
bool move_actor_towards_with_actor_collisions(const TileMap& map, Actor& actor, Vec2i target_pixels, const Actor* blocking_actors, size_t blocking_actor_count, uint8_t max_search_tiles = 64);
void update_camera(Camera& camera, const Actor& player, int room_width_pixels, int room_height_pixels);
bool apply_camera_zones(Camera& camera, const Actor& player, const CameraZone* zones, size_t zone_count, int room_width_pixels, int room_height_pixels);
void clamp_camera_to_bounds(Camera& camera, int room_width_pixels, int room_height_pixels);
PortalHit check_portal_hits(const Room& room, const Actor& player, int current_room_index);
WarpResult check_portals(const Room& room, const Actor& player, int current_room_index);

} // namespace gbs
