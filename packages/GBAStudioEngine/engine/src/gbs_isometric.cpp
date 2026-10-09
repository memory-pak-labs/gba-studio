#include "gbs/isometric.hpp"

namespace {

#if defined(__arm__) || defined(__thumb__)
#define GBS_IWRAM_CODE __attribute__((section(".iwram"), target("arm"), noinline, long_call))
#else
#define GBS_IWRAM_CODE
#endif
constexpr int camera_scale_one = 256;
constexpr int camera_zoom_min_x256 = 128;
constexpr int camera_zoom_max_x256 = 1024;
constexpr int iso_surface_tile_columns = 40;
constexpr int iso_surface_tile_rows = 24;
constexpr int iso_surface_width = iso_surface_tile_columns * gbs::gba_tile_size;
constexpr int iso_surface_height = iso_surface_tile_rows * gbs::gba_tile_size;
constexpr size_t iso_surface_bytes = iso_surface_tile_columns * iso_surface_tile_rows * 32;
constexpr uint8_t max_iso_path_nodes = 64;

int div_floor(int value, int divisor) {
    if (divisor == 0) {
        return 0;
    }
    if (value >= 0) {
        return value / divisor;
    }
    return -((-value + divisor - 1) / divisor);
}

int abs_int(int value) {
    return value < 0 ? -value : value;
}

int sign_int(int value) {
    if (value > 0) {
        return 1;
    }
    if (value < 0) {
        return -1;
    }
    return 0;
}

int scale_camera_value(int value, int32_t zoom_x256) {
    return static_cast<int>((static_cast<int64_t>(value) * zoom_x256) / camera_scale_one);
}

int unscale_camera_value(int value, int32_t zoom_x256) {
    if (zoom_x256 <= 0) {
        return value;
    }
    return static_cast<int>((static_cast<int64_t>(value) * camera_scale_one) / zoom_x256);
}

int move_camera_value_toward(int current, int target, uint16_t smoothing_x256) {
    if (current == target) {
        return current;
    }
    const int amount = smoothing_x256 >= camera_scale_one
        ? target - current
        : static_cast<int>((static_cast<int64_t>(target - current) * smoothing_x256) / camera_scale_one);
    if (amount == 0) {
        return current + (target > current ? 1 : -1);
    }
    return current + amount;
}

int next_camera_shake_value(uint32_t& seed, int strength) {
    seed = seed * 1664525u + 1013904223u;
    const uint32_t span = static_cast<uint32_t>(strength * 2 + 1);
    return static_cast<int>((seed >> 16) % span) - strength;
}

void set_iso_surface_pixel(uint8_t* surface, int x, int y, uint8_t color, bool indexed = false) {
    if (surface == nullptr || x < 0 || y < 0 || x >= (indexed ? 240 : iso_surface_width) || y >= (indexed ? 160 : iso_surface_height)) {
        return;
    }
    const int tile_x = x / 8;
    const int tile_y = y / 8;
    const int pixel_x = x & 7;
    const int pixel_y = y & 7;
    const int tile_index = tile_y * (indexed ? 30 : iso_surface_tile_columns) + tile_x;
    if (indexed) {
        surface[tile_index * 64 + pixel_y * 8 + pixel_x] = color;
        return;
    }
    uint8_t& packed = surface[tile_index * 32 + pixel_y * 4 + pixel_x / 2];
    if ((pixel_x & 1) == 0) {
        packed = static_cast<uint8_t>((packed & 0xf0u) | (color & 0x0fu));
    } else {
        packed = static_cast<uint8_t>((packed & 0x0fu) | ((color & 0x0fu) << 4));
    }
}

GBS_IWRAM_CODE void merge_iso_surface_tile_unscaled(
    uint8_t* surface,
    int x,
    int y,
    const uint8_t* tile_data,
    bool flip_x,
    bool flip_y,
    const bool* redraw_tiles
) {
    if (surface == nullptr || tile_data == nullptr || x >= iso_surface_width || y >= iso_surface_height ||
        x + 8 <= 0 || y + 8 <= 0) {
        return;
    }
    if (x >= 0 && y >= 0 && x + 8 <= iso_surface_width && y + 8 <= iso_surface_height &&
        (x & 7) == 0 && (y & 7) == 0) {
        const size_t destination_tile = static_cast<size_t>(y >> 3) * iso_surface_tile_columns + static_cast<size_t>(x >> 3);
        if (redraw_tiles != nullptr && !redraw_tiles[destination_tile]) return;
        uint8_t* destination = surface + destination_tile * 32u;
        if (((reinterpret_cast<uintptr_t>(tile_data) | reinterpret_cast<uintptr_t>(destination)) & 3u) == 0) {
            typedef uint32_t AliasWord __attribute__((may_alias));
            const AliasWord* source_words = reinterpret_cast<const AliasWord*>(tile_data);
            AliasWord* destination_words = reinterpret_cast<AliasWord*>(destination);
            for (int pixel_y = 0; pixel_y < 8; ++pixel_y) {
                const int source_y = flip_y ? 7 - pixel_y : pixel_y;
                uint32_t packed = source_words[source_y];
                if (packed == 0) continue;
                if (flip_x) {
                    packed = ((packed & 0x0f0f0f0fu) << 4) | ((packed >> 4) & 0x0f0f0f0fu);
                    packed = __builtin_bswap32(packed);
                }
                uint32_t mask = (((packed & 0x77777777u) + 0x77777777u) | packed) & 0x88888888u;
                mask |= mask >> 1;
                mask |= mask >> 2;
                destination_words[pixel_y] = mask == 0xffffffffu
                    ? packed
                    : (destination_words[pixel_y] & ~mask) | packed;
            }
            return;
        }
        if (!flip_x) {
            for (int pixel_y = 0; pixel_y < 8; ++pixel_y) {
                const int source_y = flip_y ? 7 - pixel_y : pixel_y;
                const uint8_t* source = tile_data + source_y * 4;
                uint8_t* target = destination + pixel_y * 4;
                for (int byte_index = 0; byte_index < 4; ++byte_index) {
                    const uint8_t packed = source[byte_index];
                    const uint8_t low = packed & 0x0fu;
                    const uint8_t high = packed >> 4;
                    if (low != 0) {
                        target[byte_index] = static_cast<uint8_t>((target[byte_index] & 0xf0u) | low);
                    }
                    if (high != 0) {
                        target[byte_index] = static_cast<uint8_t>((target[byte_index] & 0x0fu) | (high << 4));
                    }
                }
            }
            return;
        }
    }
    for (int pixel_y = 0; pixel_y < 8; ++pixel_y) {
        const int destination_y = y + pixel_y;
        if (destination_y < 0 || destination_y >= iso_surface_height) continue;
        const int source_y = flip_y ? 7 - pixel_y : pixel_y;
        const uint8_t* source = tile_data + source_y * 4;
        uint8_t* target_row = surface + (destination_y >> 3) * iso_surface_tile_columns * 32 + (destination_y & 7) * 4;
        for (int pixel_x = 0; pixel_x < 8; ++pixel_x) {
            const int destination_x = x + pixel_x;
            if (destination_x < 0 || destination_x >= iso_surface_width) continue;
            if (redraw_tiles != nullptr && !redraw_tiles[(destination_y >> 3) * iso_surface_tile_columns + (destination_x >> 3)]) continue;
            const int source_x = flip_x ? 7 - pixel_x : pixel_x;
            const uint8_t source_packed = source[source_x >> 1];
            const uint8_t color = (source_x & 1) == 0 ? source_packed & 0x0fu : source_packed >> 4;
            if (color == 0) continue;
            uint8_t& target = target_row[(destination_x >> 3) * 32 + (destination_x & 7) / 2];
            if ((destination_x & 1) == 0) {
                target = static_cast<uint8_t>((target & 0xf0u) | color);
            } else {
                target = static_cast<uint8_t>((target & 0x0fu) | (color << 4));
            }
        }
    }
}

const uint8_t* iso_source_tile_data(
    const gbs::TileAsset& tile_asset,
    uint16_t tile_index
) {
    if (tile_asset.object_tiles || tile_asset.data == nullptr ||
        tile_index < tile_asset.destination_tile ||
        tile_index >= tile_asset.destination_tile + tile_asset.tile_count) {
        return nullptr;
    }
    const size_t local_tile = tile_index - tile_asset.destination_tile;
    const size_t bytes_per_tile = tile_asset.color_depth == gbs::ColorDepth::Bpp8
        ? gbs::bytes_per_8bpp_tile
        : gbs::bytes_per_4bpp_tile;
    return tile_asset.data + local_tile * bytes_per_tile;
}

bool iso_source_tile_pixel(
    const uint8_t* tile_data,
    gbs::ColorDepth color_depth,
    int x,
    int y,
    uint8_t& out_color
) {
    if (tile_data == nullptr || x < 0 || x >= 8 || y < 0 || y >= 8) {
        return false;
    }
    if (color_depth == gbs::ColorDepth::Bpp8) {
        out_color = tile_data[y * 8 + x];
        return true;
    }
    const uint8_t packed = tile_data[y * 4 + x / 2];
    out_color = (x & 1) == 0 ? packed & 0x0fu : packed >> 4;
    return true;
}

bool iso_draw_item_less(const gbs::IsoDrawItem& left, const gbs::IsoDrawItem& right) {
    if (left.depth != right.depth) {
        return left.depth > right.depth;
    }
    return left.source_index > right.source_index;
}

bool iso_draw_item_intersects_viewport(const gbs::IsoDrawItem& item) {
    const int right = item.screen_pixels.x + static_cast<int>(item.width);
    const int bottom = item.screen_pixels.y + static_cast<int>(item.height);
    return item.screen_pixels.x < gbs::gba_screen_width &&
        item.screen_pixels.y < gbs::gba_screen_height &&
        right > 0 &&
        bottom > 0;
}

bool iso_path_node_exists(const int* xs, const int* ys, int count, int x, int y) {
    for (int index = 0; index < count; ++index) {
        if (xs[index] == x && ys[index] == y) {
            return true;
        }
    }
    return false;
}

int iso_path_node_index(const int* xs, const int* ys, int count, int x, int y) {
    for (int index = 0; index < count; ++index) {
        if (xs[index] == x && ys[index] == y) {
            return index;
        }
    }
    return -1;
}

int iso_path_manhattan(int x, int y, gbs::IsoCoord target) {
    return abs_int(target.x - x) + abs_int(target.y - y);
}

gbs::IsoPathStep build_iso_path_step_from_node(
    gbs::IsoCoord start,
    const int* xs,
    const int* ys,
    const int* parents,
    int node_index
) {
    int cursor = node_index;
    int parent = parents[cursor];
    while (parent > 0) {
        cursor = parent;
        parent = parents[cursor];
    }
    gbs::IsoCoord next { xs[cursor], ys[cursor], start.z };
    return gbs::IsoPathStep {
        true,
        next,
        gbs::Vec2i { next.x - start.x, next.y - start.y }
    };
}

} // namespace

namespace gbs {

GBS_IWRAM_CODE Vec2i iso_tile_to_screen(IsoCoord tile, const IsoGridConfig& config) {
    if (!is_valid_iso_grid(config)) {
        return config.origin_pixels;
    }

    int half_width = config.tile_width_pixels / 2;
    int half_height = config.tile_height_pixels / 2;
    return Vec2i {
        config.origin_pixels.x + (tile.x - tile.y) * half_width,
        config.origin_pixels.y + (tile.x + tile.y) * half_height - tile.z * config.height_step_pixels
    };
}

IsoCoord iso_screen_to_tile(Vec2i screen_pixels, const IsoGridConfig& config) {
    if (!is_valid_iso_grid(config)) {
        return IsoCoord { 0, 0, 0 };
    }

    int half_width = config.tile_width_pixels / 2;
    int half_height = config.tile_height_pixels / 2;
    int local_x = screen_pixels.x - config.origin_pixels.x;
    int local_y = screen_pixels.y - config.origin_pixels.y;
    int diagonal_x = div_floor(local_x, half_width);
    int diagonal_y = div_floor(local_y, half_height);
    return IsoCoord {
        div_floor(diagonal_y + diagonal_x, 2),
        div_floor(diagonal_y - diagonal_x, 2),
        0
    };
}

bool iso_point_in_tile_diamond(Vec2i screen_pixels, IsoCoord tile, const IsoGridConfig& config) {
    if (!is_valid_iso_grid(config)) {
        return false;
    }
    Vec2i center = iso_tile_to_screen(tile, config);
    int half_width = config.tile_width_pixels / 2;
    int half_height = config.tile_height_pixels / 2;
    int dx = abs_int(screen_pixels.x - center.x);
    int dy = abs_int(screen_pixels.y - center.y);
    return dx * half_height + dy * half_width <= half_width * half_height;
}

IsoPickResult iso_pick_tile(Vec2i screen_pixels, const IsoTileMap& map, const IsoGridConfig& config) {
    IsoCoord base = iso_screen_to_tile(screen_pixels, config);
    for (int y = base.y - 1; y <= base.y + 1; ++y) {
        for (int x = base.x - 1; x <= base.x + 1; ++x) {
            IsoCoord candidate { x, y, 0 };
            if (iso_coord_in_bounds(map, candidate) && iso_point_in_tile_diamond(screen_pixels, candidate, config)) {
                return IsoPickResult { true, candidate };
            }
        }
    }
    return IsoPickResult { false, IsoCoord { 0, 0, 0 } };
}

uint16_t iso_depth_key(IsoCoord tile, const IsoGridConfig& config) {
    const Vec2i projected = iso_tile_to_screen(tile, config);
    int depth = 32768 + projected.y + config.tile_height_pixels / 2;
    if (depth < 0) {
        return 0;
    }
    if (depth > 65535) {
        return 65535;
    }
    return static_cast<uint16_t>(depth);
}

uint8_t iso_tile_flags_at(const IsoTileMap& map, int x, int y) {
    if (map.flags == nullptr || x < 0 || y < 0 || x >= map.width || y >= map.height) {
        return IsoTileBlocked;
    }
    return map.flags[y * map.width + x];
}

uint8_t iso_tile_height_at(const IsoTileMap& map, int x, int y) {
    if (map.height_levels == nullptr || x < 0 || y < 0 || x >= map.width || y >= map.height) {
        return 0;
    }
    return map.height_levels[y * map.width + x];
}

uint8_t iso_tile_ramp_at(const IsoTileMap& map, int x, int y) {
    if (map.ramp_flags == nullptr || x < 0 || y < 0 || x >= map.width || y >= map.height) {
        return IsoRampNone;
    }
    return map.ramp_flags[y * map.width + x];
}

bool iso_coord_in_bounds(const IsoTileMap& map, IsoCoord tile) {
    return map.flags != nullptr &&
        tile.x >= 0 &&
        tile.y >= 0 &&
        tile.x < map.width &&
        tile.y < map.height;
}

bool iso_coord_blocked(const IsoTileMap& map, IsoCoord tile) {
    return (iso_tile_flags_at(map, tile.x, tile.y) & IsoTileBlocked) != 0;
}

bool iso_actor_occupies_tile(const IsoActor& actor, IsoCoord tile) {
    return actor.visible && actor.tile.x == tile.x && actor.tile.y == tile.y && actor.tile.z == tile.z;
}

bool iso_coord_blocked_by_actors(IsoCoord tile, const IsoActor* actors, size_t actor_count, size_t ignore_actor_index) {
    if (actors == nullptr) {
        return false;
    }
    for (size_t index = 0; index < actor_count; ++index) {
        if (index == ignore_actor_index) {
            continue;
        }
        if (iso_actor_occupies_tile(actors[index], tile)) {
            return true;
        }
    }
    return false;
}

bool move_iso_actor_by_delta(const IsoTileMap& map, IsoActor& actor, Vec2i delta_tile, const IsoActor* blockers, size_t blocker_count, size_t ignore_actor_index) {
    if (delta_tile.x == 0 && delta_tile.y == 0) {
        return false;
    }
    IsoCoord next {
        actor.tile.x + delta_tile.x,
        actor.tile.y + delta_tile.y,
        actor.tile.z
    };
    if (map.height_levels != nullptr) {
        next.z = iso_tile_height_at(map, next.x, next.y);
        const int height_delta = next.z - actor.tile.z;
        if (height_delta < -1 || height_delta > 1) {
            return false;
        }
        if (height_delta != 0) {
            const IsoCoord higher_tile = height_delta > 0 ? next : actor.tile;
            const uint8_t ramp = iso_tile_ramp_at(map, higher_tile.x, higher_tile.y);
            const int transition_sign = height_delta > 0 ? 1 : -1;
            const bool uses_up_right = (ramp & IsoRampUpRight) != 0 && delta_tile.x == transition_sign && delta_tile.y == 0;
            const bool uses_up_left = (ramp & IsoRampUpLeft) != 0 && delta_tile.y == transition_sign && delta_tile.x == 0;
            if (!uses_up_right && !uses_up_left) {
                return false;
            }
        }
    }
    if (iso_coord_blocked(map, next) || iso_coord_blocked_by_actors(next, blockers, blocker_count, ignore_actor_index)) {
        return false;
    }
    actor.tile = next;
    sync_iso_actor_position_from_tile(actor);
    return true;
}

bool move_iso_actor_by_free_delta(
    const IsoTileMap& map,
    IsoActor& actor,
    Vec2i delta_axis,
    const IsoActor* blockers,
    size_t blocker_count,
    size_t ignore_actor_index,
    int32_t step_x256
) {
    // One bounded cell crossing per tick: large displacements must be swept by the caller.
    if ((delta_axis.x == 0 && delta_axis.y == 0) ||
        delta_axis.x < -1 || delta_axis.x > 1 || delta_axis.y < -1 || delta_axis.y > 1 ||
        step_x256 <= 0 || step_x256 > iso_position_scale) {
        return false;
    }

    initialize_iso_actor_position(actor);
    const int32_t next_x256 = actor.position_x256 + delta_axis.x * step_x256;
    const int32_t next_y256 = actor.position_y256 + delta_axis.y * step_x256;
    const int next_tile_x = div_floor(next_x256, iso_position_scale);
    const int next_tile_y = div_floor(next_y256, iso_position_scale);
    const Vec2i crossing {next_tile_x - actor.tile.x, next_tile_y - actor.tile.y};
    const bool changed_tile = crossing.x != 0 || crossing.y != 0;
    IsoCoord next_tile = actor.tile;

    if (changed_tile) {
        IsoActor probe = actor;
        if (crossing.x != 0 && crossing.y != 0) {
            // Both routes around a corner must be open. A diagonal never bypasses a
            // blocker or jumps across the end of a staircase / ledge.
            const int height = actor.tile.z;
            if (!move_iso_actor_by_delta(map, probe, {crossing.x, 0}, blockers, blocker_count, ignore_actor_index) ||
                probe.tile.z != height ||
                !move_iso_actor_by_delta(map, probe, {0, crossing.y}, blockers, blocker_count, ignore_actor_index) ||
                probe.tile.z != height) return false;
            probe = actor;
            if (!move_iso_actor_by_delta(map, probe, {0, crossing.y}, blockers, blocker_count, ignore_actor_index) ||
                probe.tile.z != height ||
                !move_iso_actor_by_delta(map, probe, {crossing.x, 0}, blockers, blocker_count, ignore_actor_index) ||
                probe.tile.z != height) return false;
        } else if (!move_iso_actor_by_delta(map, probe, crossing, blockers, blocker_count, ignore_actor_index)) {
            return false;
        }
        next_tile = probe.tile;
    }

    actor.position_x256 = next_x256;
    actor.position_y256 = next_y256;
    actor.position_initialized = true;
    if (changed_tile) {
        actor.tile = next_tile;
    }
    return true;
}

const SpriteAnimation* iso_actor_animation_for(const IsoActorAnimationSet& animations, const IsoActorAnimationState& state) {
    const IsoActorAnimationMode mode = state.mode == IsoActorAnimationMode::Idle && state.walking
        ? IsoActorAnimationMode::Move
        : state.mode;
    const SpriteAnimation* selected = nullptr;
    switch (mode) {
        case IsoActorAnimationMode::Idle:
            switch (state.direction) {
                case IsoActorDirection::Down: selected = animations.idle_down; break;
                case IsoActorDirection::Up: selected = animations.idle_up; break;
                case IsoActorDirection::Left: selected = animations.idle_left; break;
                case IsoActorDirection::Right: selected = animations.idle_right; break;
            }
            break;
        case IsoActorAnimationMode::Move:
            switch (state.direction) {
                case IsoActorDirection::Down: selected = animations.move_down != nullptr ? animations.move_down : animations.walk_down; break;
                case IsoActorDirection::Up: selected = animations.move_up != nullptr ? animations.move_up : animations.walk_up; break;
                case IsoActorDirection::Left: selected = animations.move_left != nullptr ? animations.move_left : animations.walk_left; break;
                case IsoActorDirection::Right: selected = animations.move_right != nullptr ? animations.move_right : animations.walk_right; break;
            }
            break;
        case IsoActorAnimationMode::Attack:
            switch (state.direction) {
                case IsoActorDirection::Down: selected = animations.attack_down; break;
                case IsoActorDirection::Up: selected = animations.attack_up; break;
                case IsoActorDirection::Left: selected = animations.attack_left; break;
                case IsoActorDirection::Right: selected = animations.attack_right; break;
            }
            break;
        case IsoActorAnimationMode::Hurt:
            switch (state.direction) {
                case IsoActorDirection::Down: selected = animations.hurt_down; break;
                case IsoActorDirection::Up: selected = animations.hurt_up; break;
                case IsoActorDirection::Left: selected = animations.hurt_left; break;
                case IsoActorDirection::Right: selected = animations.hurt_right; break;
            }
            break;
        case IsoActorAnimationMode::Defeat:
            switch (state.direction) {
                case IsoActorDirection::Down: selected = animations.defeat_down; break;
                case IsoActorDirection::Up: selected = animations.defeat_up; break;
                case IsoActorDirection::Left: selected = animations.defeat_left; break;
                case IsoActorDirection::Right: selected = animations.defeat_right; break;
            }
            break;
    }
    if (selected != nullptr || (mode != IsoActorAnimationMode::Idle && mode != IsoActorAnimationMode::Move)) {
        return selected;
    }
    const SpriteAnimation* fallbacks[] = {
        animations.idle_down, animations.idle_up, animations.idle_left, animations.idle_right,
        animations.move_down, animations.move_up, animations.move_left, animations.move_right,
        animations.walk_down, animations.walk_up, animations.walk_left, animations.walk_right
    };
    for (const SpriteAnimation* fallback : fallbacks) {
        if (fallback != nullptr) {
            return fallback;
        }
    }
    return nullptr;
}

void set_iso_actor_animation_mode(IsoActorAnimationState& state, IsoActorAnimationMode mode) {
    if (state.mode != mode || (mode == IsoActorAnimationMode::Move && !state.walking)) {
        state.frame_index = 0;
        state.frame_elapsed = 0;
        state.completed = false;
    }
    state.mode = mode;
    state.walking = mode == IsoActorAnimationMode::Move;
}

void set_iso_actor_motion(IsoActorAnimationState& state, Vec2i delta_tile, bool walking) {
    IsoActorDirection direction = state.direction;
    if (delta_tile.x > 0) {
        direction = IsoActorDirection::Right;
    } else if (delta_tile.x < 0) {
        direction = IsoActorDirection::Down;
    } else if (delta_tile.y > 0) {
        direction = IsoActorDirection::Left;
    } else if (delta_tile.y < 0) {
        direction = IsoActorDirection::Up;
    }
    const IsoActorAnimationMode mode = walking ? IsoActorAnimationMode::Move : IsoActorAnimationMode::Idle;
    if (direction != state.direction || walking != state.walking || state.mode != mode) {
        state.frame_index = 0;
        state.frame_elapsed = 0;
        state.completed = false;
    }
    state.direction = direction;
    state.walking = walking;
    state.mode = mode;
}

void tick_iso_actor_animation(IsoActorAnimationState& state, const IsoActorAnimationSet& animations) {
    const SpriteAnimation* animation = iso_actor_animation_for(animations, state);
    // Keep static idle poses pinned while allowing an explicitly animated idle
    // state to advance just like the tactical presentation states.
    if (!state.walking) {
        if (state.mode == IsoActorAnimationMode::Idle &&
            animation != nullptr && animation->frame_count <= 1) {
            state.frame_index = 0;
            state.frame_elapsed = 0;
            state.completed = false;
            return;
        }
    }
    if (animation == nullptr || animation->frames == nullptr || animation->frame_count == 0) {
        state.frame_index = 0;
        state.frame_elapsed = 0;
        state.completed = state.mode == IsoActorAnimationMode::Attack ||
            state.mode == IsoActorAnimationMode::Hurt ||
            state.mode == IsoActorAnimationMode::Defeat;
        return;
    }
    if (state.completed && !animation->loop) {
        return;
    }
    if (state.frame_index >= animation->frame_count) {
        state.frame_index = 0;
    }
    const uint8_t duration = animation->frames[state.frame_index].duration_frames > 0
        ? animation->frames[state.frame_index].duration_frames
        : 1;
    ++state.frame_elapsed;
    if (state.frame_elapsed < duration) {
        return;
    }
    state.frame_elapsed = 0;
    if (state.frame_index + 1 < animation->frame_count) {
        ++state.frame_index;
    } else if (animation->loop) {
        state.frame_index = 0;
        state.completed = false;
    } else {
        state.completed = true;
    }
}

bool apply_iso_actor_animation(IsoActor& actor, const IsoActorAnimationSet& animations, const IsoActorAnimationState& state) {
    const SpriteAnimation* animation = iso_actor_animation_for(animations, state);
    if (animation == nullptr || animation->frames == nullptr || animation->frame_count == 0) {
        actor.metasprite = nullptr;
        actor.streamed_tile_asset = nullptr;
        return false;
    }
    const uint8_t frame_index = state.frame_index < animation->frame_count ? state.frame_index : 0;
    const SpriteAnimationFrame& frame = animation->frames[frame_index];
    const MetaSprite& metasprite = frame.metasprite;
    if (metasprite.parts == nullptr || metasprite.part_count == 0) {
        actor.metasprite = nullptr;
        actor.streamed_tile_asset = nullptr;
        return false;
    }
    if (frame.streamed_tile_asset != nullptr && actor.streamed_tile_asset != frame.streamed_tile_asset) {
        if (!load_tiles(*frame.streamed_tile_asset)) {
            actor.metasprite = nullptr;
            return false;
        }
        actor.streamed_tile_asset = frame.streamed_tile_asset;
    } else if (frame.streamed_tile_asset == nullptr) {
        actor.streamed_tile_asset = nullptr;
    }
    actor.metasprite = &metasprite;
    const MetaSpritePart& part = metasprite.parts[0];
    actor.tile_index = part.tile_index;
    actor.palette = part.palette;
    actor.hflip = part.hflip;
    actor.width = part.width;
    actor.height = part.height;
    actor.color_depth = part.color_depth;
    return true;
}

IsoPathStep find_iso_path_step_greedy(const IsoTileMap& map, IsoCoord start, IsoCoord target, const IsoActor* blockers, size_t blocker_count, size_t ignore_actor_index) {
    const int dx = target.x - start.x;
    const int dy = target.y - start.y;
    const Vec2i candidates[] = {
        abs_int(dx) >= abs_int(dy) ? Vec2i { sign_int(dx), 0 } : Vec2i { 0, sign_int(dy) },
        abs_int(dx) >= abs_int(dy) ? Vec2i { 0, sign_int(dy) } : Vec2i { sign_int(dx), 0 },
        Vec2i { sign_int(dx), sign_int(dy) },
        Vec2i { -sign_int(dx), 0 },
        Vec2i { 0, -sign_int(dy) },
        Vec2i { 0, 1 },
        Vec2i { 1, 0 },
        Vec2i { 0, -1 },
        Vec2i { -1, 0 },
    };

    for (const Vec2i& delta : candidates) {
        if (delta.x == 0 && delta.y == 0) {
            continue;
        }
        IsoCoord next { start.x + delta.x, start.y + delta.y, start.z };
        if (!iso_coord_blocked(map, next) && !iso_coord_blocked_by_actors(next, blockers, blocker_count, ignore_actor_index)) {
            return IsoPathStep { true, next, delta };
        }
    }
    return IsoPathStep { false, start, Vec2i { 0, 0 } };
}

IsoPathStep find_iso_path_step_bfs(
    const IsoTileMap& map,
    IsoCoord start,
    IsoCoord target,
    const IsoActor* blockers,
    size_t blocker_count,
    size_t ignore_actor_index,
    uint8_t max_search_tiles
) {
    if (!iso_coord_in_bounds(map, start) || !iso_coord_in_bounds(map, target)) {
        return IsoPathStep { false, start, Vec2i { 0, 0 } };
    }
    if (start.x == target.x && start.y == target.y) {
        return IsoPathStep { false, start, Vec2i { 0, 0 } };
    }

    int xs[max_iso_path_nodes] = {};
    int ys[max_iso_path_nodes] = {};
    int parents[max_iso_path_nodes] = {};
    int read_index = 0;
    int count = 1;
    int found_index = -1;
    const int limit = max_search_tiles < max_iso_path_nodes ? max_search_tiles : max_iso_path_nodes;
    const Vec2i directions[] = {
        Vec2i { 1, 0 },
        Vec2i { 0, 1 },
        Vec2i { -1, 0 },
        Vec2i { 0, -1 },
    };

    xs[0] = start.x;
    ys[0] = start.y;
    parents[0] = -1;

    while (read_index < count && count < limit && found_index < 0) {
        for (const Vec2i& direction : directions) {
            int next_x = xs[read_index] + direction.x;
            int next_y = ys[read_index] + direction.y;
            if (iso_path_node_exists(xs, ys, count, next_x, next_y)) {
                continue;
            }
            IsoCoord next { next_x, next_y, start.z };
            if (iso_coord_blocked(map, next) || iso_coord_blocked_by_actors(next, blockers, blocker_count, ignore_actor_index)) {
                continue;
            }
            xs[count] = next_x;
            ys[count] = next_y;
            parents[count] = read_index;
            if (next_x == target.x && next_y == target.y) {
                found_index = count;
                break;
            }
            ++count;
            if (count >= limit) {
                break;
            }
        }
        ++read_index;
    }

    if (found_index < 0) {
        return IsoPathStep { false, start, Vec2i { 0, 0 } };
    }
    return build_iso_path_step_from_node(start, xs, ys, parents, found_index);
}

IsoTacticalMovePath plan_iso_tactical_move(
    const IsoTileMap& map,
    IsoCoord start,
    IsoCoord target,
    const IsoActor* blockers,
    size_t blocker_count,
    size_t ignore_actor_index,
    uint8_t max_steps
) {
    IsoTacticalMovePath path {};
    if (max_steps == 0 || !iso_coord_in_bounds(map, start) || !iso_coord_in_bounds(map, target) ||
        iso_coord_blocked(map, target) || (start.x == target.x && start.y == target.y) ||
        (map.height_levels != nullptr && iso_tile_height_at(map, target.x, target.y) != target.z)) {
        return path;
    }

    const uint8_t step_limit = max_steps < max_iso_tactical_move_steps
        ? max_steps : max_iso_tactical_move_steps;
    IsoCoord nodes[max_iso_path_nodes] = {};
    uint8_t parents[max_iso_path_nodes] = {};
    uint8_t depths[max_iso_path_nodes] = {};
    uint8_t count = 1;
    uint8_t read_index = 0;
    int found_index = -1;
    nodes[0] = start;
    const Vec2i directions[] = {
        Vec2i { 1, 0 }, Vec2i { 0, 1 }, Vec2i { -1, 0 }, Vec2i { 0, -1 }
    };

    while (read_index < count && found_index < 0) {
        if (depths[read_index] >= step_limit) {
            ++read_index;
            continue;
        }
        for (const Vec2i& direction : directions) {
            IsoActor probe {};
            probe.tile = nodes[read_index];
            probe.visible = true;
            if (!move_iso_actor_by_delta(map, probe, direction, blockers, blocker_count, ignore_actor_index)) {
                continue;
            }
            bool visited = false;
            for (uint8_t index = 0; index < count; ++index) {
                if (nodes[index].x == probe.tile.x && nodes[index].y == probe.tile.y &&
                    nodes[index].z == probe.tile.z) {
                    visited = true;
                    break;
                }
            }
            if (visited || count >= max_iso_path_nodes) {
                continue;
            }
            const uint8_t next_index = count++;
            nodes[next_index] = probe.tile;
            parents[next_index] = read_index;
            depths[next_index] = static_cast<uint8_t>(depths[read_index] + 1);
            if (probe.tile.x == target.x && probe.tile.y == target.y && probe.tile.z == target.z) {
                found_index = next_index;
                break;
            }
        }
        ++read_index;
    }
    if (found_index < 0) {
        return path;
    }
    path.found = true;
    path.length = depths[found_index];
    for (int index = path.length - 1; index >= 0; --index) {
        path.tiles[index] = nodes[found_index];
        found_index = parents[found_index];
    }
    return path;
}

bool iso_tactical_can_attack(IsoCoord from, IsoCoord target, uint8_t range) {
    if (from.z != target.z) return false;
    const int distance = abs_int(from.x - target.x) + abs_int(from.y - target.y);
    return distance > 0 && distance <= range;
}

bool iso_tactical_can_attack(IsoCoord from, IsoCoord target, uint8_t range, const IsoTileMap* map) {
    if (from.z == target.z) return iso_tactical_can_attack(from, target, range);
    if (map == nullptr || range == 0 ||
        abs_int(from.x - target.x) + abs_int(from.y - target.y) != 1) return false;
    // Adjacent fighters can reach across an authored stair, but not through a
    // cliff. Occupancy is deliberately ignored: the target owns that cell.
    IsoActor probe {};
    probe.tile = from;
    return move_iso_actor_by_delta(*map, probe, {target.x - from.x, target.y - from.y})
        && probe.tile.z == target.z;
}

IsoTacticalMovePath plan_iso_tactical_approach(
    const IsoTileMap& map, const IsoActor* actors, size_t actor_count,
    size_t actor_index, size_t target_index, uint8_t move_range, uint8_t attack_range
) {
    IsoTacticalMovePath best {};
    if (actors == nullptr || actor_index >= actor_count || target_index >= actor_count ||
        actor_index == target_index || !actors[actor_index].visible || !actors[target_index].visible ||
        move_range == 0 || attack_range == 0) return best;
    const auto start = actors[actor_index].tile;
    const auto target = actors[target_index].tile;
    if (iso_tactical_can_attack(start, target, attack_range, &map)) return best;
    // Search attack positions, not the occupied target. Use the actual map
    // path so a lower platform can approach via its authored stairs.
    const int range = attack_range < max_iso_tactical_move_steps ? attack_range : max_iso_tactical_move_steps;
    for (int y = target.y - range; y <= target.y + range; ++y) {
        for (int x = target.x - range; x <= target.x + range; ++x) {
            const IsoCoord candidate {x, y, target.z};
            if (!iso_tactical_can_attack(candidate, target, attack_range, &map)) continue;
            auto path = plan_iso_tactical_move(map, start, candidate, actors, actor_count,
                actor_index, max_iso_tactical_move_steps);
            if (path.found && (!best.found || path.length < best.length)) best = path;
        }
    }
    if (best.length > move_range) best.length = move_range;
    return best;
}

IsoPathStep find_iso_path_step_astar(
    const IsoTileMap& map,
    IsoCoord start,
    IsoCoord target,
    const IsoActor* blockers,
    size_t blocker_count,
    size_t ignore_actor_index,
    uint8_t max_search_tiles
) {
    if (!iso_coord_in_bounds(map, start) || !iso_coord_in_bounds(map, target)) {
        return IsoPathStep { false, start, Vec2i { 0, 0 } };
    }
    if (start.x == target.x && start.y == target.y) {
        return IsoPathStep { false, start, Vec2i { 0, 0 } };
    }

    int xs[max_iso_path_nodes] = {};
    int ys[max_iso_path_nodes] = {};
    int parents[max_iso_path_nodes] = {};
    int costs[max_iso_path_nodes] = {};
    bool open[max_iso_path_nodes] = {};
    bool closed[max_iso_path_nodes] = {};
    int count = 1;
    const int limit = max_search_tiles < max_iso_path_nodes ? max_search_tiles : max_iso_path_nodes;
    const Vec2i directions[] = {
        Vec2i { 1, 0 },
        Vec2i { 0, 1 },
        Vec2i { -1, 0 },
        Vec2i { 0, -1 },
    };

    xs[0] = start.x;
    ys[0] = start.y;
    parents[0] = -1;
    costs[0] = 0;
    open[0] = true;

    const int max_iterations = limit * 2;
    int iterations = 0;

    while (iterations < max_iterations) {
        ++iterations;
        int current = -1;
        int best_score = 0x7fffffff;
        for (int index = 0; index < count; ++index) {
            if (!open[index] || closed[index]) {
                continue;
            }
            const int score = costs[index] + iso_path_manhattan(xs[index], ys[index], target);
            if (score < best_score) {
                best_score = score;
                current = index;
            }
        }

        if (current < 0) {
            return IsoPathStep { false, start, Vec2i { 0, 0 } };
        }
        if (xs[current] == target.x && ys[current] == target.y) {
            return build_iso_path_step_from_node(start, xs, ys, parents, current);
        }

        open[current] = false;
        closed[current] = true;

        for (const Vec2i& direction : directions) {
            const int next_x = xs[current] + direction.x;
            const int next_y = ys[current] + direction.y;
            IsoCoord next { next_x, next_y, start.z };
            if (iso_coord_blocked(map, next) || iso_coord_blocked_by_actors(next, blockers, blocker_count, ignore_actor_index)) {
                continue;
            }

            int node_index = iso_path_node_index(xs, ys, count, next_x, next_y);
            const int next_cost = costs[current] + 1;
            if (node_index >= 0) {
                if (closed[node_index] || next_cost >= costs[node_index]) {
                    continue;
                }
                costs[node_index] = next_cost;
                parents[node_index] = current;
                open[node_index] = true;
                continue;
            }

            if (count >= limit) {
                continue;
            }
            xs[count] = next_x;
            ys[count] = next_y;
            parents[count] = current;
            costs[count] = next_cost;
            open[count] = true;
            ++count;
        }
    }

    return IsoPathStep { false, start, Vec2i { 0, 0 } };
}

int floor_to_surface_pixel(int value, int alignment) {
    if (value >= 0) {
        return (value / alignment) * alignment;
    }
    return -(((-value + alignment - 1) / alignment) * alignment);
}

IsoCamera iso_surface_render_camera(const IsoCamera& camera) {
    if (camera.zoom_x256 != camera_scale_one ||
        camera.pan_offset_pixels.x != 0 || camera.pan_offset_pixels.y != 0 ||
        camera.shake_offset_pixels.x != 0 || camera.shake_offset_pixels.y != 0) {
        return camera;
    }
    IsoCamera snapped = camera;
    // The 320 px wide surface leaves 80 px of horizontal margin around the
    // 240 px viewport. Keep that margin available before recomposing.
    snapped.position_pixels.x = floor_to_surface_pixel(camera.position_pixels.x, 64);
    snapped.position_pixels.y = floor_to_surface_pixel(camera.position_pixels.y, 32);
    return snapped;
}

void clamp_iso_camera(IsoCamera& camera) {
    if (!camera.bounds_enabled || camera.bounds_pixels.width <= 0 || camera.bounds_pixels.height <= 0) {
        return;
    }
    camera.zoom_x256 = clamp_int(camera.zoom_x256, camera_zoom_min_x256, camera_zoom_max_x256);
    const int half_visible_width = unscale_camera_value(gbs::gba_screen_width / 2, camera.zoom_x256);
    const int half_visible_height = unscale_camera_value(gbs::gba_screen_height / 2, camera.zoom_x256);
    int min_x = camera.bounds_pixels.x - (gbs::gba_screen_width / 2 - half_visible_width);
    int min_y = camera.bounds_pixels.y - (gbs::gba_screen_height / 2 - half_visible_height);
    int max_x = camera.bounds_pixels.right() - (gbs::gba_screen_width / 2 + half_visible_width);
    int max_y = camera.bounds_pixels.bottom() - (gbs::gba_screen_height / 2 + half_visible_height);
    if (max_x < min_x) {
        min_x = max_x = camera.bounds_pixels.x + camera.bounds_pixels.width / 2 - gbs::gba_screen_width / 2;
    }
    if (max_y < min_y) {
        min_y = max_y = camera.bounds_pixels.y + camera.bounds_pixels.height / 2 - gbs::gba_screen_height / 2;
    }
    camera.position_pixels.x = clamp_int(camera.position_pixels.x, min_x, max_x);
    camera.position_pixels.y = clamp_int(camera.position_pixels.y, min_y, max_y);
}

void update_iso_camera_follow(IsoCamera& camera, IsoCoord focus, const IsoGridConfig& config) {
    Vec2i screen = iso_tile_to_screen(focus, config);
    camera.position_pixels.x = screen.x - gbs::gba_screen_width / 2;
    camera.position_pixels.y = screen.y - gbs::gba_screen_height / 2;
    clamp_iso_camera(camera);
}

GBS_IWRAM_CODE Vec2i iso_camera_world_to_screen(const IsoCamera& camera, Vec2i world_pixels) {
    const int32_t zoom = clamp_int(camera.zoom_x256, camera_zoom_min_x256, camera_zoom_max_x256);
    const Vec2i unscaled_screen {
        world_pixels.x - camera.position_pixels.x,
        world_pixels.y - camera.position_pixels.y
    };
    if (zoom == camera_scale_one) {
        return Vec2i {
            unscaled_screen.x + camera.pan_offset_pixels.x + camera.shake_offset_pixels.x,
            unscaled_screen.y + camera.pan_offset_pixels.y + camera.shake_offset_pixels.y
        };
    }
    return Vec2i {
        gbs::gba_screen_width / 2 + scale_camera_value(unscaled_screen.x - gbs::gba_screen_width / 2, zoom) +
            camera.pan_offset_pixels.x + camera.shake_offset_pixels.x,
        gbs::gba_screen_height / 2 + scale_camera_value(unscaled_screen.y - gbs::gba_screen_height / 2, zoom) +
            camera.pan_offset_pixels.y + camera.shake_offset_pixels.y
    };
}

Vec2i iso_camera_screen_to_world(const IsoCamera& camera, Vec2i screen_pixels) {
    const int32_t zoom = clamp_int(camera.zoom_x256, camera_zoom_min_x256, camera_zoom_max_x256);
    const int local_x = screen_pixels.x - camera.pan_offset_pixels.x - camera.shake_offset_pixels.x - gbs::gba_screen_width / 2;
    const int local_y = screen_pixels.y - camera.pan_offset_pixels.y - camera.shake_offset_pixels.y - gbs::gba_screen_height / 2;
    return Vec2i {
        camera.position_pixels.x + gbs::gba_screen_width / 2 + unscale_camera_value(local_x, zoom),
        camera.position_pixels.y + gbs::gba_screen_height / 2 + unscale_camera_value(local_y, zoom)
    };
}

void tick_iso_camera(IsoCamera& camera, Vec2i focus_world_pixels) {
    camera.zoom_x256 = move_camera_value_toward(
        clamp_int(camera.zoom_x256, camera_zoom_min_x256, camera_zoom_max_x256),
        clamp_int(camera.target_zoom_x256, camera_zoom_min_x256, camera_zoom_max_x256),
        camera.smoothing_x256
    );

    if (camera.follow_enabled) {
        Vec2i focus_screen = iso_camera_world_to_screen(camera, focus_world_pixels);
        focus_screen.x -= camera.pan_offset_pixels.x + camera.shake_offset_pixels.x;
        focus_screen.y -= camera.pan_offset_pixels.y + camera.shake_offset_pixels.y;
        const int dead_left = camera.dead_zone_screen_pixels.x;
        const int dead_top = camera.dead_zone_screen_pixels.y;
        const int dead_right = dead_left + camera.dead_zone_screen_pixels.width;
        const int dead_bottom = dead_top + camera.dead_zone_screen_pixels.height;
        int screen_delta_x = 0;
        int screen_delta_y = 0;
        if (focus_screen.x < dead_left) {
            screen_delta_x = focus_screen.x - dead_left;
        } else if (focus_screen.x > dead_right) {
            screen_delta_x = focus_screen.x - dead_right;
        }
        if (focus_screen.y < dead_top) {
            screen_delta_y = focus_screen.y - dead_top;
        } else if (focus_screen.y > dead_bottom) {
            screen_delta_y = focus_screen.y - dead_bottom;
        }
        const Vec2i target_position {
            camera.position_pixels.x + unscale_camera_value(screen_delta_x, camera.zoom_x256),
            camera.position_pixels.y + unscale_camera_value(screen_delta_y, camera.zoom_x256)
        };
        camera.position_pixels.x = move_camera_value_toward(
            camera.position_pixels.x,
            target_position.x,
            camera.smoothing_x256
        );
        camera.position_pixels.y = move_camera_value_toward(
            camera.position_pixels.y,
            target_position.y,
            camera.smoothing_x256
        );
    }
    clamp_iso_camera(camera);

    if (camera.shake_frames_remaining > 0 && camera.shake_strength_pixels > 0) {
        camera.shake_offset_pixels = Vec2i {
            next_camera_shake_value(camera.shake_seed, camera.shake_strength_pixels),
            next_camera_shake_value(camera.shake_seed, camera.shake_strength_pixels)
        };
        --camera.shake_frames_remaining;
    } else {
        camera.shake_offset_pixels = Vec2i { 0, 0 };
        camera.shake_frames_remaining = 0;
    }
}

void restore_iso_camera_bounds(IsoCamera& camera, const IsoCamera& base_camera) {
    camera.bounds_enabled = base_camera.bounds_enabled;
    camera.bounds_pixels = base_camera.bounds_pixels;
    clamp_iso_camera(camera);
}

bool apply_iso_camera_zones(
    IsoCamera& camera,
    IsoCoord focus,
    const IsoGridConfig& config,
    const IsoCameraZone* zones,
    size_t zone_count,
    const Vec2i* world_focus
) {
    tick_iso_camera(camera, world_focus != nullptr ? *world_focus : iso_tile_to_screen(focus, config));
    if (zones == nullptr) return false;
    for (size_t index = 0; index < zone_count; ++index) {
        const IsoCameraZone& zone = zones[index];
        if (focus.x < zone.area_tiles.x || focus.y < zone.area_tiles.y ||
            focus.x >= zone.area_tiles.x + zone.area_tiles.width ||
            focus.y >= zone.area_tiles.y + zone.area_tiles.height) {
            continue;
        }
        if (zone.bounds_pixels.width > 0 && zone.bounds_pixels.height > 0) {
            camera.bounds_enabled = true;
            camera.bounds_pixels = zone.bounds_pixels;
        }
        if (zone.lock_x) camera.position_pixels.x = zone.bounds_pixels.x + zone.offset_pixels.x;
        else camera.position_pixels.x += zone.offset_pixels.x;
        if (zone.lock_y) camera.position_pixels.y = zone.bounds_pixels.y + zone.offset_pixels.y;
        else camera.position_pixels.y += zone.offset_pixels.y;
        clamp_iso_camera(camera);
        return true;
    }
    return false;
}

void set_iso_camera_zoom(IsoCamera& camera, int32_t zoom_x256, bool immediate) {
    camera.target_zoom_x256 = clamp_int(zoom_x256, camera_zoom_min_x256, camera_zoom_max_x256);
    if (immediate) {
        camera.zoom_x256 = camera.target_zoom_x256;
        clamp_iso_camera(camera);
    }
}

void set_iso_camera_pan(IsoCamera& camera, Vec2i offset_pixels) {
    camera.pan_offset_pixels = offset_pixels;
}

void start_iso_camera_shake(IsoCamera& camera, uint16_t strength_pixels, uint16_t duration_frames, uint32_t seed) {
    camera.shake_strength_pixels = strength_pixels;
    camera.shake_frames_remaining = duration_frames;
    camera.shake_seed = seed == 0 ? 1 : seed;
    if (duration_frames == 0 || strength_pixels == 0) {
        camera.shake_offset_pixels = Vec2i { 0, 0 };
    }
}

static GBS_IWRAM_CODE bool render_iso_room_surface_masked(
    const IsometricRoomData& room,
    const IsoCamera& camera,
    uint8_t* out_tile_pixels,
    size_t out_capacity,
    const bool* redraw_tiles,
    bool indexed = false
) {
    if (out_tile_pixels == nullptr || out_capacity < (indexed ? 240u * 160u : iso_surface_bytes) || room.visual_tiles == nullptr ||
        room.tileset_tilemap == nullptr || room.tileset_tilemap->entries == nullptr || room.tileset_tiles == nullptr ||
        room.tileset_tile_width_pixels <= 0 || room.tileset_tile_height_pixels <= 0 ||
        (room.tileset_tile_width_pixels % 8) != 0 || (room.tileset_tile_height_pixels % 8) != 0) {
        return false;
    }
    const int render_width = room.tileset_render_width_pixels > 0
        ? room.tileset_render_width_pixels
        : room.tileset_tile_width_pixels;
    const int render_height = room.tileset_render_height_pixels > 0
        ? room.tileset_render_height_pixels
        : room.tileset_tile_height_pixels;
    if (render_width <= 0 || render_height <= 0 || (render_width % 8) != 0 || (render_height % 8) != 0) {
        return false;
    }
    int redraw_left = iso_surface_width;
    int redraw_top = iso_surface_height;
    int redraw_right = 0;
    int redraw_bottom = 0;
    // Test the redraw mask once per tile, not once for each of its 32 bytes.
    // memset preserves unaligned output support and uses word stores on GBA.
    for (size_t tile = 0; tile < (indexed ? 600u : iso_surface_bytes / 32u); ++tile) {
        if (redraw_tiles == nullptr || redraw_tiles[tile]) {
            const size_t tile_bytes = indexed ? 64u : 32u;
            __builtin_memset(out_tile_pixels + tile * tile_bytes, 0, tile_bytes);
        }
    }
    if (redraw_tiles != nullptr) {
        for (int tile_y = 0; tile_y < iso_surface_tile_rows; ++tile_y) {
            for (int tile_x = 0; tile_x < iso_surface_tile_columns; ++tile_x) {
                if (!redraw_tiles[tile_y * iso_surface_tile_columns + tile_x]) continue;
                if (tile_x * 8 < redraw_left) redraw_left = tile_x * 8;
                if (tile_y * 8 < redraw_top) redraw_top = tile_y * 8;
                if ((tile_x + 1) * 8 > redraw_right) redraw_right = (tile_x + 1) * 8;
                if ((tile_y + 1) * 8 > redraw_bottom) redraw_bottom = (tile_y + 1) * 8;
            }
        }
    }

    const int visible_left = redraw_tiles != nullptr ? redraw_left : 0;
    const int visible_top = redraw_tiles != nullptr ? redraw_top : 0;
    const int visible_right = redraw_tiles != nullptr ? redraw_right : (indexed ? 240 : iso_surface_width);
    const int visible_bottom = redraw_tiles != nullptr ? redraw_bottom : (indexed ? 160 : iso_surface_height);

    const TileMapAsset& tileset = *room.tileset_tilemap;
    const int subtiles_wide = render_width / 8;
    const int subtiles_high = render_height / 8;
    const int offset_tile_x = room.tileset_tile_offset_x_pixels / 8;
    const int offset_tile_y = room.tileset_tile_offset_y_pixels / 8;
    const int logical_columns = (tileset.width - offset_tile_x) / subtiles_wide;
    if (logical_columns <= 0) return true;
    const bool power_of_two_columns = (logical_columns & (logical_columns - 1)) == 0;
    int column_shift = 0;
    if (power_of_two_columns) {
        for (int columns = logical_columns; columns > 1; columns >>= 1) ++column_shift;
    }

    const int max_depth = room.width_tiles + room.height_tiles - 2;
    const bool unscaled_grid = camera.zoom_x256 == camera_scale_one && is_valid_iso_grid(room.grid) && room.grid.height_step_pixels >= 0;

    int max_height = 0;
    if (unscaled_grid && room.height_levels != nullptr) {
        for (int index = 0; index < room.width_tiles * room.height_tiles; ++index) {
            if (room.height_levels[index] > max_height) max_height = room.height_levels[index];
        }
    }
    for (int depth = 0; depth <= max_depth; ++depth) {
        int first_y = 0;
        int last_y = room.height_tiles - 1;
        if (unscaled_grid) {
            const int screen_y = room.grid.origin_pixels.y + depth * (room.grid.tile_height_pixels / 2) -
                camera.position_pixels.y + camera.pan_offset_pixels.y + camera.shake_offset_pixels.y + room.tileset_render_offset_y_pixels;
            if (screen_y + render_height <= visible_top ||
                screen_y - max_height * room.grid.height_step_pixels >= visible_bottom) continue;
            const int screen_x = room.grid.origin_pixels.x + depth * (room.grid.tile_width_pixels / 2) -
                camera.position_pixels.x + camera.pan_offset_pixels.x + camera.shake_offset_pixels.x;
            const auto divide_grid_width = [&](int value) {
                // Native 16/32 px grids need shifts, not software division on ARM7.
                if (room.grid.tile_width_pixels == 32) return div_floor(value, 32);
                if (room.grid.tile_width_pixels == 16) return div_floor(value, 16);
                return div_floor(value, room.grid.tile_width_pixels);
            };
            const int lower = divide_grid_width(screen_x - render_width / 2 - visible_right) + 1;
            const int upper = divide_grid_width(screen_x + render_width / 2 - visible_left - 1);
            if (lower > first_y) first_y = lower;
            if (upper < last_y) last_y = upper;
        }
        for (int tile_y = first_y; tile_y <= last_y; ++tile_y) {
            const int tile_x = depth - tile_y;
            if (tile_x < 0 || tile_x >= room.width_tiles) {
                continue;
            }
            const int visual_tile = room.visual_tiles[tile_y * room.width_tiles + tile_x];
            if (visual_tile <= 0) {
                continue;
            }
            const uint8_t tile_height = iso_tile_height_at(
                iso_tilemap_from_room(room),
                tile_x,
                tile_y
            );
            const Vec2i center = iso_tile_to_screen(IsoCoord { tile_x, tile_y, tile_height }, room.grid);
            const Vec2i top_left {
                center.x - render_width / 2,
                center.y + room.tileset_render_offset_y_pixels
            };
            const Vec2i screen_top_left = iso_camera_world_to_screen(camera, top_left);
            const Vec2i screen_bottom_right = iso_camera_world_to_screen(
                camera,
                Vec2i {
                    top_left.x + render_width,
                    top_left.y + render_height
                }
            );
            if (screen_bottom_right.x <= 0 || screen_bottom_right.y <= 0 ||
                screen_top_left.x >= iso_surface_width || screen_top_left.y >= iso_surface_height) {
                continue;
            }
            if (redraw_tiles != nullptr &&
                (screen_bottom_right.x <= redraw_left || screen_bottom_right.y <= redraw_top ||
                 screen_top_left.x >= redraw_right || screen_top_left.y >= redraw_bottom)) {
                continue;
            }
            const int logical_tile_index = visual_tile - 1;
            const int source_column = power_of_two_columns
                ? logical_tile_index & (logical_columns - 1)
                : logical_tile_index % logical_columns;
            const int source_row = power_of_two_columns
                ? logical_tile_index >> column_shift
                : logical_tile_index / logical_columns;
            const int source_base_x = offset_tile_x + source_column * subtiles_wide;
            const int source_base_y = offset_tile_y + source_row * subtiles_high;
            const bool unscaled = camera.zoom_x256 == camera_scale_one;
            const int unscaled_origin_x = top_left.x - camera.position_pixels.x +
                camera.pan_offset_pixels.x + camera.shake_offset_pixels.x;
            const int unscaled_origin_y = top_left.y - camera.position_pixels.y +
                camera.pan_offset_pixels.y + camera.shake_offset_pixels.y;

            for (int subtile_y = 0; subtile_y < subtiles_high; ++subtile_y) {
                for (int subtile_x = 0; subtile_x < subtiles_wide; ++subtile_x) {
                    const int source_tile_x = source_base_x + subtile_x;
                    const int source_tile_y = source_base_y + subtile_y;
                    if (source_tile_x < 0 || source_tile_y < 0 ||
                        source_tile_x >= tileset.width || source_tile_y >= tileset.height) {
                        continue;
                    }
                    const uint16_t entry = tileset.entries[source_tile_y * tileset.width + source_tile_x];
                    const uint8_t* tile_data = iso_source_tile_data(
                        *room.tileset_tiles,
                        entry & 0x03ffu
                    );
                    if (tile_data == nullptr) {
                        continue;
                    }
                    const bool flip_x = (entry & (1u << 10)) != 0;
                    const bool flip_y = (entry & (1u << 11)) != 0;
                    const int destination_x = unscaled_origin_x + subtile_x * 8;
                    const int destination_y = unscaled_origin_y + subtile_y * 8;
                    if (unscaled && indexed) {
                        if (destination_x >= 240 || destination_y >= 160 || destination_x <= -8 || destination_y <= -8) continue;
                        const bool source_is_indexed = room.tileset_tiles->color_depth == gbs::ColorDepth::Bpp8;
                        const uint8_t bank = source_is_indexed ? 0 : static_cast<uint8_t>((entry >> 8) & 0xf0u);
                        for (int py = 0; py < 8; ++py) {
                            const int y = destination_y + py;
                            if (y < 0 || y >= 160) continue;
                            if (source_is_indexed) {
                                for (int px = 0; px < 8; ++px) {
                                    const int x = destination_x + px;
                                    if (x < 0 || x >= 240) continue;
                                    const int sx = flip_x ? 7 - px : px;
                                    const uint8_t color = tile_data[(flip_y ? 7 - py : py) * 8 + sx];
                                    if (color != 0) out_tile_pixels[(y >> 3) * 30 * 64 + (y & 7) * 8 + (x >> 3) * 64 + (x & 7)] = color;
                                }
                                continue;
                            }
                            const uint8_t* row = tile_data + (flip_y ? 7 - py : py) * 4;
                            const uint32_t packed_row = static_cast<uint32_t>(row[0]) |
                                (static_cast<uint32_t>(row[1]) << 8) |
                                (static_cast<uint32_t>(row[2]) << 16) |
                                (static_cast<uint32_t>(row[3]) << 24);
                            if (packed_row == 0) continue;
                            const size_t row_offset = static_cast<size_t>(y >> 3) * 30 * 64 + (y & 7) * 8;
                            for (int px = 0; px < 8; ++px) {
                                const int x = destination_x + px;
                                if (x < 0 || x >= 240) continue;
                                const int sx = flip_x ? 7 - px : px;
                                const uint8_t color = (packed_row >> (sx * 4)) & 15;
                                if (color != 0) out_tile_pixels[row_offset + (x >> 3) * 64 + (x & 7)] = color | bank;
                            }
                        }
                        continue;
                    }
                    if (unscaled && !indexed) {
                        merge_iso_surface_tile_unscaled(
                            out_tile_pixels,
                            destination_x,
                            destination_y,
                            tile_data,
                            flip_x,
                            flip_y,
                            redraw_tiles
                        );
                        continue;
                    }
                    for (int pixel_y = 0; pixel_y < 8; ++pixel_y) {
                        const int local_y = flip_y ? 7 - pixel_y : pixel_y;
                        const int source_y = subtile_y * 8 + pixel_y;
                        for (int pixel_x = 0; pixel_x < 8; ++pixel_x) {
                            const int local_x = flip_x ? 7 - pixel_x : pixel_x;
                            uint8_t color = 0;
                            if (!iso_source_tile_pixel(tile_data, room.tileset_tiles->color_depth, local_x, local_y, color)) {
                                return false;
                            }
                            if (color == 0) {
                                continue;
                            }
                            if (indexed && room.tileset_tiles->color_depth != gbs::ColorDepth::Bpp8) {
                                color = static_cast<uint8_t>(color | ((entry >> 8) & 0xf0u));
                            }
                            const int source_x = subtile_x * 8 + pixel_x;
                            if (unscaled) {
                                set_iso_surface_pixel(
                                    out_tile_pixels,
                                    unscaled_origin_x + source_x,
                                    unscaled_origin_y + source_y,
                                    color,
                                    indexed
                                );
                                continue;
                            }
                            const Vec2i start = iso_camera_world_to_screen(
                                camera,
                                Vec2i { top_left.x + source_x, top_left.y + source_y }
                            );
                            const Vec2i end = iso_camera_world_to_screen(
                                camera,
                                Vec2i { top_left.x + source_x + 1, top_left.y + source_y + 1 }
                            );
                            for (int screen_y = start.y; screen_y < end.y; ++screen_y) {
                                for (int screen_x = start.x; screen_x < end.x; ++screen_x) {
                                    set_iso_surface_pixel(out_tile_pixels, screen_x, screen_y, color, indexed);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    return true;
}

bool render_iso_room_surface(const IsometricRoomData& room, const IsoCamera& camera, uint8_t* pixels, size_t capacity) {
    return render_iso_room_surface_masked(room, camera, pixels, capacity, nullptr);
}

bool render_iso_room_surface_indexed(const IsometricRoomData& room, const IsoCamera& camera, uint8_t* pixels, size_t capacity) {
    return render_iso_room_surface_masked(room, camera, pixels, capacity, nullptr, true);
}

GBS_IWRAM_CODE bool scroll_iso_room_surface(const IsometricRoomData& room, const IsoCamera& previous, const IsoCamera& camera, uint8_t* pixels, size_t capacity) {
    const int dx = camera.position_pixels.x - previous.position_pixels.x;
    const int dy = camera.position_pixels.y - previous.position_pixels.y;
    if (pixels == nullptr || capacity < iso_surface_bytes) return false;
    if (camera.zoom_x256 != camera_scale_one || previous.zoom_x256 != camera_scale_one ||
        camera.pan_offset_pixels.x != previous.pan_offset_pixels.x || camera.pan_offset_pixels.y != previous.pan_offset_pixels.y ||
        camera.shake_offset_pixels.x != previous.shake_offset_pixels.x || camera.shake_offset_pixels.y != previous.shake_offset_pixels.y ||
        dx % 8 != 0 || dy % 8 != 0 || abs_int(dx) >= iso_surface_width || abs_int(dy) >= iso_surface_height) {
        return render_iso_room_surface(room, camera, pixels, capacity);
    }
    if (dx == 0 && dy == 0) return true;
    const int tile_dx = dx / 8;
    const int tile_dy = dy / 8;
    constexpr int count = iso_surface_tile_columns * iso_surface_tile_rows;
    bool redraw[count] {};
    const int horizontal_shift = abs_int(tile_dx);
    const int vertical_shift = abs_int(tile_dy);
    const int copied_columns = iso_surface_tile_columns - horizontal_shift;
    const int copied_rows = iso_surface_tile_rows - vertical_shift;
    if (copied_columns <= 0 || copied_rows <= 0) {
        for (int index = 0; index < count; ++index) redraw[index] = true;
    } else {
        const int destination_x = tile_dx < 0 ? horizontal_shift : 0;
        const int source_x = tile_dx > 0 ? horizontal_shift : 0;
        const int destination_y = tile_dy < 0 ? vertical_shift : 0;
        const int row_bytes = copied_columns * static_cast<int>(gbs::bytes_per_4bpp_tile);
        for (int row = 0; row < copied_rows; ++row) {
            const int destination_row = tile_dy < 0
                ? iso_surface_tile_rows - 1 - row
                : row;
            const int source_row = destination_row + tile_dy;
            uint8_t* destination = pixels +
                (destination_row * iso_surface_tile_columns + destination_x) * gbs::bytes_per_4bpp_tile;
            const uint8_t* source = pixels +
                (source_row * iso_surface_tile_columns + source_x) * gbs::bytes_per_4bpp_tile;
            if (((reinterpret_cast<uintptr_t>(destination) | reinterpret_cast<uintptr_t>(source)) & 3u) == 0) {
                typedef uint32_t AliasWord __attribute__((may_alias));
                AliasWord* target_words = reinterpret_cast<AliasWord*>(destination);
                const AliasWord* source_words = reinterpret_cast<const AliasWord*>(source);
                const int words = row_bytes / 4;
                if (destination < source) {
                    for (int word = 0; word < words; ++word) target_words[word] = source_words[word];
                } else {
                    for (int word = words; word > 0; --word) target_words[word - 1] = source_words[word - 1];
                }
            } else {
                __builtin_memmove(destination, source, static_cast<size_t>(row_bytes));
            }
        }
        for (int row = 0; row < iso_surface_tile_rows; ++row) {
            for (int column = 0; column < iso_surface_tile_columns; ++column) {
                if (column < destination_x || column >= destination_x + copied_columns ||
                    row < destination_y || row >= destination_y + copied_rows) {
                    redraw[row * iso_surface_tile_columns + column] = true;
                }
            }
        }
    }
    return render_iso_room_surface_masked(room, camera, pixels, capacity, redraw);
}

void reset_iso_surface_tile_cache(IsoSurfaceTileCache& cache) {
    for (size_t index = 0; index < iso_surface_hardware_tile_capacity; ++index) {
        cache.hashes[index] = 0;
    }
    cache.initialized = false;
}

GBS_IWRAM_CODE size_t collect_iso_surface_dirty_tile_runs(
    IsoSurfaceTileCache& cache,
    const uint8_t* tile_pixels,
    size_t tile_count,
    IsoSurfaceTileRun* out_runs,
    size_t out_capacity
) {
    if (tile_pixels == nullptr || out_runs == nullptr || out_capacity == 0 ||
        tile_count > iso_surface_hardware_tile_capacity) {
        return 0;
    }

    size_t run_count = 0;
    for (size_t tile_index = 0; tile_index < tile_count; ++tile_index) {
        const uint8_t* tile = tile_pixels + tile_index * 32u;
        uint32_t hash = 2166136261u;
        // This is a transient dirty-cache fingerprint, never a persisted hash.
        // Read 32-bit words when aligned to avoid 32 EWRAM byte loads per tile.
        for (size_t word_index = 0; word_index < 8u; ++word_index) {
            uint32_t word;
            if ((reinterpret_cast<uintptr_t>(tile) & 3u) == 0) {
                typedef uint32_t AliasWord __attribute__((may_alias));
                word = reinterpret_cast<const AliasWord*>(tile)[word_index];
            } else {
                const uint8_t* bytes = tile + word_index * 4u;
                word = static_cast<uint32_t>(bytes[0]) |
                    (static_cast<uint32_t>(bytes[1]) << 8u) |
                    (static_cast<uint32_t>(bytes[2]) << 16u) |
                    (static_cast<uint32_t>(bytes[3]) << 24u);
            }
            // Fold high bytes down before multiplication: a word-wise FNV
            // step alone leaves upper-byte pixel changes with only 8-bit entropy.
            word ^= word >> 16u;
            word ^= word >> 8u;
            hash ^= word;
            hash *= 16777619u;
        }
        const bool changed = !cache.initialized || cache.hashes[tile_index] != hash;
        cache.hashes[tile_index] = hash;
        if (!changed) {
            continue;
        }

        if (run_count > 0 &&
            out_runs[run_count - 1].first_tile + out_runs[run_count - 1].tile_count == tile_index) {
            ++out_runs[run_count - 1].tile_count;
        } else if (run_count < out_capacity) {
            out_runs[run_count++] = IsoSurfaceTileRun { tile_index, 1 };
        } else {
            IsoSurfaceTileRun& last = out_runs[out_capacity - 1];
            last.tile_count = tile_index - last.first_tile + 1;
        }
    }
    cache.initialized = true;
    return run_count;
}

size_t compact_iso_surface_tiles(
    const uint8_t* source_tiles,
    size_t source_tile_count,
    uint8_t* out_unique_tiles,
    size_t out_unique_capacity,
    uint16_t* out_tilemap
) {
    if (source_tiles == nullptr || out_unique_tiles == nullptr || out_tilemap == nullptr ||
        source_tile_count > iso_surface_hardware_tile_capacity || out_unique_capacity > 511) {
        return out_unique_capacity + 1;
    }

    // The surface is rebuilt as the adventure camera scrolls. A linear search
    // through every previously emitted tile stalls the GBA for many frames.
    // Open addressing bounds the lookup while retaining exact byte comparison
    // (a hash collision must never change the rendered tile).
    constexpr size_t bucket_count = 1024;
    uint16_t buckets[bucket_count] {};
    size_t unique_count = 0;
    for (size_t source_index = 0; source_index < source_tile_count; ++source_index) {
        const uint8_t* source = source_tiles + source_index * 32u;
        bool transparent = true;
        if ((reinterpret_cast<uintptr_t>(source) & 3u) == 0) {
            typedef uint32_t AliasWord __attribute__((may_alias));
            const AliasWord* words = reinterpret_cast<const AliasWord*>(source);
            for (size_t word = 0; word < 8; ++word) {
                if (words[word] != 0) {
                    transparent = false;
                    break;
                }
            }
        } else {
            for (size_t byte_index = 0; byte_index < 32u; ++byte_index) {
                if (source[byte_index] != 0) {
                    transparent = false;
                    break;
                }
            }
        }
        if (transparent) {
            out_tilemap[source_index] = 0;
            continue;
        }

        uint32_t hash = 2166136261u;
        for (size_t byte_index = 0; byte_index < 32u; ++byte_index) {
            hash = (hash ^ source[byte_index]) * 16777619u;
        }
        size_t match = unique_count;
        size_t bucket = (hash ^ (hash >> 16)) & (bucket_count - 1);
        while (buckets[bucket] != 0) {
            const size_t candidate = buckets[bucket] - 1;
            bool equal = true;
            const uint8_t* existing = out_unique_tiles + candidate * 32u;
            for (size_t byte_index = 0; byte_index < 32u; ++byte_index) {
                if (existing[byte_index] != source[byte_index]) {
                    equal = false;
                    break;
                }
            }
            if (equal) {
                match = candidate;
                break;
            }
            bucket = (bucket + 1) & (bucket_count - 1);
        }
        if (match == unique_count) {
            if (unique_count >= out_unique_capacity) {
                return out_unique_capacity + 1;
            }
            uint8_t* destination = out_unique_tiles + unique_count * 32u;
            for (size_t byte_index = 0; byte_index < 32u; ++byte_index) {
                destination[byte_index] = source[byte_index];
            }
            ++unique_count;
            buckets[bucket] = static_cast<uint16_t>(unique_count);
        }
        out_tilemap[source_index] = static_cast<uint16_t>(match + 1);
    }
    return unique_count;
}

size_t build_iso_draw_list(
    const IsoActor* actors,
    size_t actor_count,
    const IsoCamera& camera,
    IsoDrawItem* out_items,
    size_t out_capacity,
    const IsoGridConfig& config
) {
    if (actors == nullptr || out_items == nullptr || out_capacity == 0) {
        return 0;
    }

    size_t count = 0;
    for (size_t actor_index = 0; actor_index < actor_count && count < out_capacity; ++actor_index) {
        const IsoActor& actor = actors[actor_index];
        Vec2i actor_screen = iso_actor_world_position_pixels(actor, config);
        actor_screen.x += actor.screen_offset_pixels.x;
        actor_screen.y += actor.screen_offset_pixels.y;
        actor_screen = iso_camera_world_to_screen(camera, actor_screen);

        const MetaSprite* metasprite = actor.metasprite;
        const bool has_metasprite = metasprite != nullptr && is_valid_metasprite(*metasprite);
        const MetaSpritePart* first_part = has_metasprite ? &metasprite->parts[0] : nullptr;
        const size_t part_count = has_metasprite ? metasprite->part_count : 1;
        for (size_t part_index = 0; part_index < part_count && count < out_capacity; ++part_index) {
            if (!has_metasprite) {
                const IsoDrawItem item {
                    actor_screen,
                    actor.tile_index,
                    actor.palette,
                    iso_depth_key(actor.tile, config),
                    static_cast<uint16_t>(actor_index),
                    actor.visible,
                    actor.hflip,
                    actor.priority,
                    actor.width,
                    actor.height,
                    false,
                    actor.color_depth
                };
                if (iso_draw_item_intersects_viewport(item)) {
                    out_items[count++] = item;
                }
                continue;
            }

            const MetaSpritePart& part = metasprite->parts[part_index];
            const Vec2i part_screen {
                actor_screen.x + part.x - first_part->x,
                actor_screen.y + part.y - first_part->y
            };
            const IsoDrawItem item {
                part_screen,
                part.tile_index,
                part.palette,
                iso_depth_key(actor.tile, config),
                static_cast<uint16_t>(actor_index),
                actor.visible,
                part.hflip,
                actor.priority,
                part.width,
                part.height,
                part.vflip,
                part.color_depth
            };
            if (iso_draw_item_intersects_viewport(item)) {
                out_items[count++] = item;
            }
        }
    }
    return count;
}

Vec2i iso_metasprite_center_offset(const MetaSprite& metasprite) {
    if (!is_valid_metasprite(metasprite)) {
        return Vec2i { 0, 0 };
    }
    int min_x = metasprite.parts[0].x;
    int min_y = metasprite.parts[0].y;
    int max_x = min_x + metasprite.parts[0].width;
    int max_y = min_y + metasprite.parts[0].height;
    for (uint8_t index = 1; index < metasprite.part_count; ++index) {
        const MetaSpritePart& part = metasprite.parts[index];
        if (part.x < min_x) min_x = part.x;
        if (part.y < min_y) min_y = part.y;
        if (part.x + part.width > max_x) max_x = part.x + part.width;
        if (part.y + part.height > max_y) max_y = part.y + part.height;
    }
    return Vec2i { -(min_x + max_x) / 2, -(min_y + max_y) / 2 };
}

Vec2i iso_metasprite_diamond_center_offset(const MetaSprite& metasprite, const IsoGridConfig& grid) {
    Vec2i offset = iso_metasprite_center_offset(metasprite);
    offset.y += grid.tile_height_pixels / 2;
    return offset;
}

size_t build_iso_metasprite_draw_list(
    const MetaSprite& metasprite,
    IsoCoord tile,
    Vec2i screen_offset,
    const IsoCamera& camera,
    IsoDrawItem* out_items,
    size_t out_capacity,
    uint16_t source_index,
    uint8_t priority,
    const IsoGridConfig& config
) {
    if (!is_valid_metasprite(metasprite) || out_items == nullptr || out_capacity == 0) {
        return 0;
    }
    IsoActor marker {};
    marker.tile = tile;
    marker.screen_offset_pixels = screen_offset;
    marker.visible = true;
    marker.priority = priority;
    marker.metasprite = &metasprite;
    const size_t count = build_iso_draw_list(&marker, 1, camera, out_items, out_capacity, config);
    for (size_t index = 0; index < count; ++index) {
        out_items[index].source_index = source_index;
    }
    return count;
}

void sort_iso_draw_list(IsoDrawItem* items, size_t item_count) {
    if (items == nullptr) {
        return;
    }

    for (size_t index = 1; index < item_count; ++index) {
        IsoDrawItem item = items[index];
        size_t cursor = index;
        while (cursor > 0 && iso_draw_item_less(item, items[cursor - 1])) {
            items[cursor] = items[cursor - 1];
            --cursor;
        }
        items[cursor] = item;
    }
}

void draw_iso_sprites(const IsoDrawItem* items, size_t item_count, int first_oam_index, bool mosaic) {
    if (items == nullptr) {
        return;
    }

    for (size_t index = 0; index < item_count; ++index) {
        const IsoDrawItem& item = items[index];
        set_sprite(first_oam_index + static_cast<int>(index), Sprite {
            item.screen_pixels.x,
            item.screen_pixels.y,
            item.tile_index,
            item.palette,
            item.hflip,
            item.vflip,
            item.visible,
            item.priority,
            SpriteRenderMode::Normal,
            mosaic,
            item.width,
            item.height,
            false,
            false,
            0,
            item.color_depth
        });
    }
}

} // namespace gbs
