#include "gbs/dungeon_crawler.hpp"

namespace gbs {

Vec2i dungeon_forward_delta(DungeonDirection direction) {
    switch (direction) {
    case DungeonDirection::North: return Vec2i { 0, -1 };
    case DungeonDirection::East: return Vec2i { 1, 0 };
    case DungeonDirection::South: return Vec2i { 0, 1 };
    case DungeonDirection::West: return Vec2i { -1, 0 };
    }
    return Vec2i { 0, 0 };
}

Vec2i dungeon_right_delta(DungeonDirection direction) {
    const Vec2i forward = dungeon_forward_delta(direction);
    return Vec2i { -forward.y, forward.x };
}

void turn_dungeon_left(DungeonCrawlerRuntimeState& state) {
    const uint8_t direction = static_cast<uint8_t>(state.direction);
    state.direction = static_cast<DungeonDirection>((direction + 3) % 4);
}

void turn_dungeon_right(DungeonCrawlerRuntimeState& state) {
    const uint8_t direction = static_cast<uint8_t>(state.direction);
    state.direction = static_cast<DungeonDirection>((direction + 1) % 4);
}

bool try_dungeon_step_forward(DungeonCrawlerRuntimeState& state, const DungeonCrawlerRoomData& room) {
    const Vec2i delta = dungeon_forward_delta(state.direction);
    const Vec2i target { state.position.x + delta.x, state.position.y + delta.y };
    if (dungeon_cell_blocked(room, target)) {
        return false;
    }
    state.position = target;
    return true;
}

bool try_dungeon_step_backward(DungeonCrawlerRuntimeState& state, const DungeonCrawlerRoomData& room) {
    if (!room.config.allow_backstep) {
        return false;
    }
    const Vec2i delta = dungeon_forward_delta(state.direction);
    const Vec2i target { state.position.x - delta.x, state.position.y - delta.y };
    if (dungeon_cell_blocked(room, target)) {
        return false;
    }
    state.position = target;
    return true;
}

DungeonViewCell dungeon_view_cell(
    const DungeonCrawlerRoomData& room,
    const DungeonCrawlerRuntimeState& state,
    int distance,
    int lateral
) {
    const Vec2i forward = dungeon_forward_delta(state.direction);
    const Vec2i right = dungeon_right_delta(state.direction);
    const Vec2i position {
        state.position.x + forward.x * distance + right.x * lateral,
        state.position.y + forward.y * distance + right.y * lateral
    };
    return DungeonViewCell { position, distance, lateral, dungeon_cell_blocked(room, position) };
}

} // namespace gbs
