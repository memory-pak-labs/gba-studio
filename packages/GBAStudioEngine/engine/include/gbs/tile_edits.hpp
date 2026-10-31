#pragma once
#include <stddef.h>
#include <stdint.h>

namespace gbs {

// Sparse, room-local changes keep large ROM maps immutable and bound RAM use.
constexpr size_t max_room_tile_edits = 256;
struct RoomTileEdit {
    uint32_t key;
    uint16_t tile;
    int16_t collision_flags;
};
struct RoomTileEdits {
    RoomTileEdit entries[max_room_tile_edits] {};
    size_t count = 0;
    uint32_t revision = 0;
};
constexpr uint32_t room_tile_edit_key(int layer, int x, int y) {
    return (static_cast<uint32_t>(layer) << 28) |
        (static_cast<uint32_t>(y) << 14) | static_cast<uint32_t>(x);
}
inline size_t room_tile_edit_position(const RoomTileEdits& edits, uint32_t key) {
    size_t lo = 0, hi = edits.count;
    while (lo < hi) {
        const size_t mid = lo + (hi - lo) / 2;
        if (edits.entries[mid].key < key) lo = mid + 1;
        else hi = mid;
    }
    return lo;
}
inline const RoomTileEdit* find_room_tile_edit(const RoomTileEdits& edits, int layer, int x, int y) {
    if (x < 0 || y < 0 || layer < 0 || layer > 3) return nullptr;
    const uint32_t key = room_tile_edit_key(layer, x, y);
    const size_t at = room_tile_edit_position(edits, key);
    return at < edits.count && edits.entries[at].key == key ? &edits.entries[at] : nullptr;
}
inline uint16_t room_tile_value(const RoomTileEdits& edits, int layer, int x, int y, uint16_t original) {
    const auto* edit = find_room_tile_edit(edits, layer, x, y);
    return edit != nullptr ? edit->tile : original;
}
inline bool set_room_tile_edit(RoomTileEdits& edits, int layer, int x, int y,
    int width, int height, uint16_t tile, int collision_flags = -1) {
    if (layer < 0 || layer > 3 || x < 0 || y < 0 || x >= width || y >= height ||
        width > 16384 || height > 16384 || collision_flags < -1 || collision_flags > 255) return false;
    const uint32_t key = room_tile_edit_key(layer, x, y);
    const size_t at = room_tile_edit_position(edits, key);
    const bool found = at < edits.count && edits.entries[at].key == key;
    if (!found) {
        if (edits.count == max_room_tile_edits) return false;
        for (size_t i = edits.count; i > at; --i) edits.entries[i] = edits.entries[i - 1];
        edits.entries[at] = {key, tile, -1};
        ++edits.count;
    }
    auto& edit = edits.entries[at];
    const int next_collision = collision_flags < 0 ? edit.collision_flags : collision_flags;
    if (found && edit.tile == tile && edit.collision_flags == next_collision) return true;
    edit.tile = tile;
    edit.collision_flags = static_cast<int16_t>(next_collision);
    ++edits.revision;
    return true;
}
} // namespace gbs
