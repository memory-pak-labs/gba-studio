#include "gbs/topdown.hpp"

namespace {

constexpr uint8_t max_path_nodes = 64;

gbs::Rect actor_rect(const gbs::Actor& actor, gbs::Vec2i position);

bool tile_blocks_for_delta(const gbs::TileMap& map, int tile_x, int tile_y, gbs::Vec2i delta) {
    if (tile_x < 0 || tile_y < 0 || tile_x >= map.width || tile_y >= map.height) {
        return true;
    }
    return gbs::tile_flags_block_movement(gbs::tile_flags_at(map, tile_x, tile_y), delta);
}

bool slope_blocks_rect(const gbs::TileMap& map, int tile_x, int tile_y, gbs::Rect rect) {
    gbs::TileSlope slope = gbs::tile_slope_at(map, tile_x, tile_y);
    if (slope == gbs::TileSlope::None) {
        return false;
    }

    int tile_left = tile_x * gbs::gba_tile_size;
    int tile_top = tile_y * gbs::gba_tile_size;
    int local_left = gbs::clamp_int(rect.x - tile_left, 0, gbs::gba_tile_size - 1);
    int local_top = gbs::clamp_int(rect.y - tile_top, 0, gbs::gba_tile_size - 1);
    int local_right = gbs::clamp_int(rect.right() - 1 - tile_left, 0, gbs::gba_tile_size - 1);
    int local_bottom = gbs::clamp_int(rect.bottom() - 1 - tile_top, 0, gbs::gba_tile_size - 1);

    for (int y = local_top; y <= local_bottom; ++y) {
        for (int x = local_left; x <= local_right; ++x) {
            if (gbs::tile_slope_blocks_pixel(slope, x, y)) {
                return true;
            }
        }
    }
    return false;
}

bool can_move_to(const gbs::TileMap& map, const gbs::Actor& actor, gbs::Vec2i position, gbs::Vec2i delta) {
    return !gbs::rect_hits_blocking_tile(
        map,
        actor_rect(actor, position),
        delta
    );
}

gbs::Rect actor_rect(const gbs::Actor& actor, gbs::Vec2i position) {
    return gbs::Rect {
        position.x + actor.collision_offset_pixels.x,
        position.y + actor.collision_offset_pixels.y,
        actor.size_pixels.x,
        actor.size_pixels.y
    };
}

bool can_move_to_without_actor_collision(
    const gbs::TileMap& map,
    const gbs::Actor& actor,
    gbs::Vec2i position,
    gbs::Vec2i delta,
    const gbs::Actor* blocking_actors,
    size_t blocking_actor_count
) {
    return can_move_to(map, actor, position, delta) &&
        !gbs::rect_hits_any_blocking_actor(actor_rect(actor, position), actor, blocking_actors, blocking_actor_count);
}

bool blocker_can_be_pushed(
    const gbs::TileMap& map,
    const gbs::Actor& blocker,
    gbs::Vec2i delta,
    const gbs::Actor* actors,
    size_t actor_count,
    size_t blocker_index
) {
    const gbs::Vec2i position {
        blocker.position_pixels.x + delta.x,
        blocker.position_pixels.y + delta.y
    };
    if (!can_move_to(map, blocker, position, delta)) {
        return false;
    }

    const gbs::Rect destination = actor_rect(blocker, position);
    for (size_t index = 0; index < actor_count; ++index) {
        if (index == blocker_index || !gbs::actor_collision_groups_overlap(blocker, actors[index])) {
            continue;
        }
        if (gbs::rect_hits_actor(destination, actors[index])) {
            return false;
        }
    }
    return true;
}

bool move_actor_axis_with_push(
    const gbs::TileMap& map,
    gbs::Actor& actor,
    gbs::Vec2i delta,
    gbs::Actor* blocking_actors,
    size_t blocking_actor_count
) {
    if (delta.x == 0 && delta.y == 0) {
        return false;
    }
    const gbs::Vec2i position {
        actor.position_pixels.x + delta.x,
        actor.position_pixels.y + delta.y
    };
    if (!can_move_to(map, actor, position, delta)) {
        return false;
    }

    const gbs::Rect destination = actor_rect(actor, position);
    for (size_t index = 0; index < blocking_actor_count; ++index) {
        const gbs::Actor& blocker = blocking_actors[index];
        if (!gbs::actor_collision_groups_overlap(actor, blocker) || !gbs::rect_hits_actor(destination, blocker)) {
            continue;
        }
        if (!blocker.pushable || actor.push_priority <= blocker.push_priority ||
            !blocker_can_be_pushed(map, blocker, delta, blocking_actors, blocking_actor_count, index)) {
            return false;
        }
    }

    for (size_t index = 0; index < blocking_actor_count; ++index) {
        gbs::Actor& blocker = blocking_actors[index];
        if (gbs::actor_collision_groups_overlap(actor, blocker) && gbs::rect_hits_actor(destination, blocker)) {
            blocker.position_pixels.x += delta.x;
            blocker.position_pixels.y += delta.y;
        }
    }
    actor.position_pixels = position;
    if (delta.x != 0) actor.direction = delta.x < 0 ? 2 : 3;
    if (delta.y != 0) actor.direction = delta.y < 0 ? 1 : 0;
    return true;
}

gbs::Vec2i actor_tile_center(const gbs::Actor& actor) {
    return gbs::Vec2i {
        (actor.position_pixels.x + actor.size_pixels.x / 2) / gbs::gba_tile_size,
        (actor.position_pixels.y + actor.size_pixels.y / 2) / gbs::gba_tile_size
    };
}

bool path_node_exists(const int* xs, const int* ys, int count, int x, int y) {
    for (int index = 0; index < count; ++index) {
        if (xs[index] == x && ys[index] == y) {
            return true;
        }
    }
    return false;
}

gbs::Vec2i actor_position_for_tile_center(const gbs::Actor& actor, int tile_x, int tile_y) {
    return gbs::Vec2i {
        tile_x * gbs::gba_tile_size + gbs::gba_tile_size / 2 - actor.size_pixels.x / 2,
        tile_y * gbs::gba_tile_size + gbs::gba_tile_size / 2 - actor.size_pixels.y / 2
    };
}

bool tile_step_is_clear_with_actor_collisions(
    const gbs::TileMap& map,
    const gbs::Actor& actor,
    int from_x,
    int from_y,
    int to_x,
    int to_y,
    const gbs::Actor* blocking_actors,
    size_t blocking_actor_count
) {
    if (to_x < 0 || to_y < 0 || to_x >= map.width || to_y >= map.height) {
        return false;
    }
    gbs::Vec2i delta {
        (to_x - from_x) * gbs::gba_tile_size,
        (to_y - from_y) * gbs::gba_tile_size
    };
    gbs::Vec2i position = actor_position_for_tile_center(actor, to_x, to_y);
    return can_move_to_without_actor_collision(map, actor, position, delta, blocking_actors, blocking_actor_count);
}

int path_target_distance(int x, int y, gbs::Vec2i target) {
    int dx = x > target.x ? x - target.x : target.x - x;
    int dy = y > target.y ? y - target.y : target.y - y;
    return dx + dy;
}

gbs::PathStep build_path_step_from_node(
    const gbs::Actor& actor,
    const int* xs,
    const int* ys,
    const int* parents,
    int node_index,
    gbs::Vec2i start
) {
    if (node_index < 0) {
        return gbs::PathStep { false, gbs::Vec2i { 0, 0 } };
    }

    int step_index = node_index;
    while (parents[step_index] > 0) {
        step_index = parents[step_index];
    }

    return gbs::PathStep {
        true,
        gbs::Vec2i {
            (xs[step_index] - start.x) * actor.speed_pixels,
            (ys[step_index] - start.y) * actor.speed_pixels
        }
    };
}

gbs::PathStep find_actor_path_step_internal(
    const gbs::TileMap& map,
    const gbs::Actor& actor,
    gbs::Vec2i target_pixels,
    const gbs::Actor* blocking_actors,
    size_t blocking_actor_count,
    uint8_t max_search_tiles,
    bool allow_nearest_reachable
) {
    if (map.flags == nullptr || map.width <= 0 || map.height <= 0 || max_search_tiles == 0) {
        return gbs::PathStep { false, gbs::Vec2i { 0, 0 } };
    }

    gbs::Vec2i start = actor_tile_center(actor);
    gbs::Vec2i target {
        target_pixels.x / gbs::gba_tile_size,
        target_pixels.y / gbs::gba_tile_size
    };
    if (start.x == target.x && start.y == target.y) {
        return gbs::PathStep { true, gbs::Vec2i { 0, 0 } };
    }

    int xs[max_path_nodes] = {};
    int ys[max_path_nodes] = {};
    int parents[max_path_nodes] = {};
    int head = 0;
    int count = 1;
    int found_index = -1;
    int best_index = -1;
    int best_distance = path_target_distance(start.x, start.y, target);
    const int limit = max_search_tiles < max_path_nodes ? max_search_tiles : max_path_nodes;

    xs[0] = start.x;
    ys[0] = start.y;
    parents[0] = -1;

    const int neighbor_dx[] = { 1, -1, 0, 0 };
    const int neighbor_dy[] = { 0, 0, 1, -1 };
    while (head < count && count < limit && found_index < 0) {
        int current_x = xs[head];
        int current_y = ys[head];
        for (int direction = 0; direction < 4; ++direction) {
            int next_x = current_x + neighbor_dx[direction];
            int next_y = current_y + neighbor_dy[direction];
            if (path_node_exists(xs, ys, count, next_x, next_y)) {
                continue;
            }
            if (!tile_step_is_clear_with_actor_collisions(map, actor, current_x, current_y, next_x, next_y, blocking_actors, blocking_actor_count)) {
                continue;
            }

            xs[count] = next_x;
            ys[count] = next_y;
            parents[count] = head;
            if (next_x == target.x && next_y == target.y) {
                found_index = count;
                break;
            }
            int distance = path_target_distance(next_x, next_y, target);
            if (allow_nearest_reachable && distance <= best_distance) {
                best_distance = distance;
                best_index = count;
            }
            ++count;
            if (count >= limit) {
                break;
            }
        }
        ++head;
    }

    if (found_index >= 0) {
        return build_path_step_from_node(actor, xs, ys, parents, found_index, start);
    }
    if (allow_nearest_reachable && best_index >= 0) {
        return build_path_step_from_node(actor, xs, ys, parents, best_index, start);
    }
    return gbs::PathStep { false, gbs::Vec2i { 0, 0 } };
}

gbs::Rect effective_camera_bounds(const gbs::Camera& camera, int room_width_pixels, int room_height_pixels) {
    if (camera.bounds_enabled && camera.bounds_pixels.width > 0 && camera.bounds_pixels.height > 0) {
        return camera.bounds_pixels;
    }
    return gbs::Rect { 0, 0, room_width_pixels, room_height_pixels };
}

} // namespace

namespace gbs {

uint8_t tile_flags_at(const TileMap& map, int tile_x, int tile_y) {
    if (map.flags == nullptr || tile_x < 0 || tile_y < 0 || tile_x >= map.width || tile_y >= map.height) {
        return TileSolid;
    }
    return map.flags[tile_y * map.width + tile_x];
}

TileSlope tile_slope_at(const TileMap& map, int tile_x, int tile_y) {
    if (map.slopes == nullptr || tile_x < 0 || tile_y < 0 || tile_x >= map.width || tile_y >= map.height) {
        return TileSlope::None;
    }
    return map.slopes[tile_y * map.width + tile_x];
}

uint8_t tile_flags_in_rect(const TileMap& map, Rect rect) {
    int left = rect.x / gbs::gba_tile_size;
    int top = rect.y / gbs::gba_tile_size;
    int right = (rect.right() - 1) / gbs::gba_tile_size;
    int bottom = (rect.bottom() - 1) / gbs::gba_tile_size;
    uint8_t flags = TileEmpty;

    for (int y = top; y <= bottom; ++y) {
        for (int x = left; x <= right; ++x) {
            flags |= tile_flags_at(map, x, y);
        }
    }
    return flags;
}

uint8_t tile_effects_in_rect(const TileMap& map, Rect rect, uint8_t effect_mask) {
    return static_cast<uint8_t>(tile_flags_in_rect(map, rect) & effect_mask);
}

uint8_t tile_effects_for_actor(const TileMap& map, const Actor& actor, uint8_t effect_mask) {
    return tile_effects_in_rect(
        map,
        actor_rect(actor, actor.position_pixels),
        effect_mask
    );
}

bool tile_flags_block_movement(uint8_t flags, Vec2i delta) {
    if ((flags & TileSolid) != 0) {
        return true;
    }
    if ((flags & TileBlockTop) != 0 && delta.y > 0) {
        return true;
    }
    if ((flags & TileBlockBottom) != 0 && delta.y < 0) {
        return true;
    }
    if ((flags & TileBlockLeft) != 0 && delta.x > 0) {
        return true;
    }
    if ((flags & TileBlockRight) != 0 && delta.x < 0) {
        return true;
    }
    return false;
}

bool tile_flags_have_effect(uint8_t flags, uint8_t effect_mask) {
    return (flags & effect_mask) != 0;
}

bool tile_slope_blocks_pixel(TileSlope slope, int local_x, int local_y) {
    if (local_x < 0 || local_y < 0 || local_x >= gbs::gba_tile_size || local_y >= gbs::gba_tile_size) {
        return false;
    }

    switch (slope) {
    case TileSlope::None:
        return false;
    case TileSlope::BlockAboveRising:
        return local_y <= gbs::gba_tile_size - 1 - local_x;
    case TileSlope::BlockBelowRising:
        return local_y >= gbs::gba_tile_size - 1 - local_x;
    case TileSlope::BlockAboveFalling:
        return local_y <= local_x;
    case TileSlope::BlockBelowFalling:
        return local_y >= local_x;
    }
    return false;
}

bool rect_hits_solid_tile(const TileMap& map, Rect rect) {
    return rect_hits_blocking_tile(map, rect, Vec2i { 1, 1 });
}

bool rect_hits_blocking_tile(const TileMap& map, Rect rect, Vec2i delta) {
    int left = rect.x / gbs::gba_tile_size;
    int top = rect.y / gbs::gba_tile_size;
    int right = (rect.right() - 1) / gbs::gba_tile_size;
    int bottom = (rect.bottom() - 1) / gbs::gba_tile_size;

    for (int y = top; y <= bottom; ++y) {
        for (int x = left; x <= right; ++x) {
            if (tile_blocks_for_delta(map, x, y, delta)) {
                return true;
            }
            if (slope_blocks_rect(map, x, y, rect)) {
                return true;
            }
        }
    }
    return false;
}

bool actor_overlaps_actor(const Actor& a, const Actor& b) {
    if (a.size_pixels.x <= 0 || a.size_pixels.y <= 0 || b.size_pixels.x <= 0 || b.size_pixels.y <= 0) {
        return false;
    }
    return intersects(
        actor_rect(a, a.position_pixels),
        actor_rect(b, b.position_pixels)
    );
}

bool rect_hits_actor(Rect rect, const Actor& actor) {
    if (rect.width <= 0 || rect.height <= 0 || actor.size_pixels.x <= 0 || actor.size_pixels.y <= 0) {
        return false;
    }
    return intersects(
        rect,
        actor_rect(actor, actor.position_pixels)
    );
}

bool rect_hits_any_actor(Rect rect, const Actor* actors, size_t actor_count) {
    if (actors == nullptr || actor_count == 0) {
        return false;
    }
    for (size_t index = 0; index < actor_count; ++index) {
        if (rect_hits_actor(rect, actors[index])) {
            return true;
        }
    }
    return false;
}

bool rect_hits_any_blocking_actor(Rect rect, const Actor& mover, const Actor* actors, size_t actor_count) {
    if (actors == nullptr || actor_count == 0) {
        return false;
    }
    for (size_t index = 0; index < actor_count; ++index) {
        if (!actor_collision_groups_overlap(mover, actors[index])) {
            continue;
        }
        if (rect_hits_actor(rect, actors[index])) {
            return true;
        }
    }
    return false;
}

void update_player(const TileMap& map, Actor& player, InputState input) {
    update_player_with_actor_collisions(map, player, input, nullptr, 0);
}

void update_player_with_actor_collisions(
    const TileMap& map,
    Actor& player,
    InputState input,
    const Actor* blocking_actors,
    size_t blocking_actor_count
) {
    Vec2i delta { 0, 0 };
    if (input.is_held(ButtonLeft)) {
        delta.x -= player.speed_pixels;
        player.direction = 2;
    }
    if (input.is_held(ButtonRight)) {
        delta.x += player.speed_pixels;
        player.direction = 3;
    }
    if (input.is_held(ButtonUp)) {
        delta.y -= player.speed_pixels;
        player.direction = 1;
    }
    if (input.is_held(ButtonDown)) {
        delta.y += player.speed_pixels;
        player.direction = 0;
    }

    Vec2i next_x { player.position_pixels.x + delta.x, player.position_pixels.y };
    if (can_move_to_without_actor_collision(map, player, next_x, Vec2i { delta.x, 0 }, blocking_actors, blocking_actor_count)) {
        player.position_pixels = next_x;
    }

    Vec2i next_y { player.position_pixels.x, player.position_pixels.y + delta.y };
    if (can_move_to_without_actor_collision(map, player, next_y, Vec2i { 0, delta.y }, blocking_actors, blocking_actor_count)) {
        player.position_pixels = next_y;
    }
}

void update_player_with_actor_push(
    const TileMap& map,
    Actor& player,
    InputState input,
    Actor* blocking_actors,
    size_t blocking_actor_count
) {
    Vec2i delta { 0, 0 };
    if (input.is_held(ButtonLeft)) {
        delta.x -= player.speed_pixels;
        player.direction = 2;
    }
    if (input.is_held(ButtonRight)) {
        delta.x += player.speed_pixels;
        player.direction = 3;
    }
    if (input.is_held(ButtonUp)) {
        delta.y -= player.speed_pixels;
        player.direction = 1;
    }
    if (input.is_held(ButtonDown)) {
        delta.y += player.speed_pixels;
        player.direction = 0;
    }
    move_actor_by_delta_with_actor_push(
        map,
        player,
        delta,
        blocking_actors,
        blocking_actor_count
    );
}

PathStep find_actor_path_step(const TileMap& map, const Actor& actor, Vec2i target_pixels, uint8_t max_search_tiles) {
    return find_actor_path_step_internal(map, actor, target_pixels, nullptr, 0, max_search_tiles, false);
}

PathStep find_actor_path_step_with_actor_collisions(
    const TileMap& map,
    const Actor& actor,
    Vec2i target_pixels,
    const Actor* blocking_actors,
    size_t blocking_actor_count,
    uint8_t max_search_tiles,
    bool allow_nearest_reachable
) {
    return find_actor_path_step_internal(
        map,
        actor,
        target_pixels,
        blocking_actors,
        blocking_actor_count,
        max_search_tiles,
        allow_nearest_reachable
    );
}

bool move_actor_by_delta(const TileMap& map, Actor& actor, Vec2i delta) {
    return move_actor_by_delta_with_actor_collisions(map, actor, delta, nullptr, 0);
}

bool move_actor_by_delta_with_actor_collisions(
    const TileMap& map,
    Actor& actor,
    Vec2i delta,
    const Actor* blocking_actors,
    size_t blocking_actor_count
) {
    bool moved = false;
    if (delta.x != 0) {
        Vec2i next_x { actor.position_pixels.x + delta.x, actor.position_pixels.y };
        if (can_move_to_without_actor_collision(map, actor, next_x, Vec2i { delta.x, 0 }, blocking_actors, blocking_actor_count)) {
            actor.position_pixels = next_x;
            actor.direction = delta.x < 0 ? 2 : 3;
            moved = true;
        }
    }
    if (delta.y != 0) {
        Vec2i next_y { actor.position_pixels.x, actor.position_pixels.y + delta.y };
        if (can_move_to_without_actor_collision(map, actor, next_y, Vec2i { 0, delta.y }, blocking_actors, blocking_actor_count)) {
            actor.position_pixels = next_y;
            actor.direction = delta.y < 0 ? 1 : 0;
            moved = true;
        }
    }
    return moved;
}

bool move_actor_by_delta_with_actor_push(
    const TileMap& map,
    Actor& actor,
    Vec2i delta,
    Actor* blocking_actors,
    size_t blocking_actor_count
) {
    bool moved = false;
    if (blocking_actors == nullptr || blocking_actor_count == 0) {
        return move_actor_by_delta(map, actor, delta);
    }
    if (delta.x != 0) {
        moved = move_actor_axis_with_push(
            map,
            actor,
            Vec2i { delta.x, 0 },
            blocking_actors,
            blocking_actor_count
        ) || moved;
    }
    if (delta.y != 0) {
        moved = move_actor_axis_with_push(
            map,
            actor,
            Vec2i { 0, delta.y },
            blocking_actors,
            blocking_actor_count
        ) || moved;
    }
    return moved;
}

int push_actor_by_delta_until_collision(
    const TileMap& map,
    Actor& actor,
    Vec2i delta,
    const Actor* blocking_actors,
    size_t blocking_actor_count
) {
    const Vec2i step {
        delta.x < 0 ? -1 : (delta.x > 0 ? 1 : 0),
        delta.y < 0 ? -1 : (delta.y > 0 ? 1 : 0)
    };
    const int distance = delta.x != 0
        ? (delta.x < 0 ? -delta.x : delta.x)
        : (delta.y < 0 ? -delta.y : delta.y);
    int moved_pixels = 0;
    for (int index = 0; index < distance; ++index) {
        if (!move_actor_by_delta_with_actor_collisions(
            map,
            actor,
            step,
            blocking_actors,
            blocking_actor_count
        )) {
            break;
        }
        ++moved_pixels;
    }
    return moved_pixels;
}

bool move_actor_towards(const TileMap& map, Actor& actor, Vec2i target_pixels, uint8_t max_search_tiles) {
    return move_actor_towards_with_actor_collisions(map, actor, target_pixels, nullptr, 0, max_search_tiles);
}

bool move_actor_towards_with_actor_collisions(
    const TileMap& map,
    Actor& actor,
    Vec2i target_pixels,
    const Actor* blocking_actors,
    size_t blocking_actor_count,
    uint8_t max_search_tiles
) {
    PathStep step = find_actor_path_step_with_actor_collisions(
        map,
        actor,
        target_pixels,
        blocking_actors,
        blocking_actor_count,
        max_search_tiles,
        true
    );
    if (!step.found || (step.delta_pixels.x == 0 && step.delta_pixels.y == 0)) {
        return false;
    }
    return move_actor_by_delta_with_actor_collisions(map, actor, step.delta_pixels, blocking_actors, blocking_actor_count);
}

void update_camera(Camera& camera, const Actor& player, int room_width_pixels, int room_height_pixels) {
    const int viewport_width_pixels = topdown_camera_viewport_width_pixels(camera.zoom_x256);
    const int viewport_height_pixels = topdown_camera_viewport_height_pixels(camera.zoom_x256);
    if (!camera.follow_player) {
        clamp_camera_to_bounds(camera, room_width_pixels, room_height_pixels);
        return;
    }

    int desired_x = player.position_pixels.x + player.size_pixels.x / 2 - viewport_width_pixels / 2;
    int desired_y = player.position_pixels.y + player.size_pixels.y / 2 - viewport_height_pixels / 2;
    Rect bounds = effective_camera_bounds(camera, room_width_pixels, room_height_pixels);
    int max_x = bounds.width > viewport_width_pixels ? bounds.x + bounds.width - viewport_width_pixels : bounds.x;
    int max_y = bounds.height > viewport_height_pixels ? bounds.y + bounds.height - viewport_height_pixels : bounds.y;

    camera.position_pixels.x = clamp_int(desired_x, bounds.x, max_x);
    camera.position_pixels.y = clamp_int(desired_y, bounds.y, max_y);
}

bool apply_camera_zones(
    Camera& camera,
    const Actor& player,
    const CameraZone* zones,
    size_t zone_count,
    int room_width_pixels,
    int room_height_pixels
) {
    update_camera(camera, player, room_width_pixels, room_height_pixels);
    if (zones == nullptr) return false;

    const Rect player_bounds {
        player.position_pixels.x,
        player.position_pixels.y,
        player.size_pixels.x,
        player.size_pixels.y
    };
    for (size_t index = 0; index < zone_count; ++index) {
        const CameraZone& zone = zones[index];
        if (!intersects(player_bounds, zone.area_pixels)) continue;
        if (zone.bounds_pixels.width > 0 && zone.bounds_pixels.height > 0) {
            camera.bounds_enabled = true;
            camera.bounds_pixels = zone.bounds_pixels;
        }
        if (zone.lock_x) camera.position_pixels.x = zone.bounds_pixels.x + zone.offset_pixels.x;
        else camera.position_pixels.x += zone.offset_pixels.x;
        if (zone.lock_y) camera.position_pixels.y = zone.bounds_pixels.y + zone.offset_pixels.y;
        else camera.position_pixels.y += zone.offset_pixels.y;
        clamp_camera_to_bounds(camera, room_width_pixels, room_height_pixels);
        return true;
    }
    return false;
}

void clamp_camera_to_bounds(Camera& camera, int room_width_pixels, int room_height_pixels) {
    const int viewport_width_pixels = topdown_camera_viewport_width_pixels(camera.zoom_x256);
    const int viewport_height_pixels = topdown_camera_viewport_height_pixels(camera.zoom_x256);
    Rect bounds = effective_camera_bounds(camera, room_width_pixels, room_height_pixels);
    int max_x = bounds.width > viewport_width_pixels ? bounds.x + bounds.width - viewport_width_pixels : bounds.x;
    int max_y = bounds.height > viewport_height_pixels ? bounds.y + bounds.height - viewport_height_pixels : bounds.y;
    camera.position_pixels.x = clamp_int(camera.position_pixels.x, bounds.x, max_x);
    camera.position_pixels.y = clamp_int(camera.position_pixels.y, bounds.y, max_y);
}

PortalHit check_portal_hits(const Room& room, const Actor& player, int current_room_index) {
    Rect player_rect {
        player.position_pixels.x,
        player.position_pixels.y,
        player.size_pixels.x,
        player.size_pixels.y
    };

    for (size_t index = 0; index < room.portal_count; ++index) {
        const Portal& portal = room.portals[index];
        if (intersects(player_rect, portal.area_pixels)) {
            return PortalHit {
                true,
                index,
                WarpResult {
                    true,
                    portal.target_room,
                    portal.target_position_pixels,
                    portal.target_direction,
                    portal.has_target_direction
                }
            };
        }
    }

    return PortalHit {
        false,
        0,
        WarpResult { false, current_room_index, player.position_pixels }
    };
}

WarpResult check_portals(const Room& room, const Actor& player, int current_room_index) {
    return check_portal_hits(room, player, current_room_index).warp;
}

} // namespace gbs
