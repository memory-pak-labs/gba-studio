#pragma once

#include <string.h>
#include "gbs/assets.hpp"
#include "gbs/world_map_journey.hpp"
#include "gbs/tile_edits.hpp"

namespace gbs {

// ROM map indices may exceed 1023. Only this 31x21 8bpp viewport and one
// 32x32 screenblock are resident. UI glyphs at CBB1 + tile 896 start at
// byte 45056, beyond the 41664-byte cache; BG2 uses screenblock 27.
constexpr int paged_background_slot_count = 31 * 21;
struct PagedBackgroundCache {
    PagedBackgroundWindow window;
    alignas(4) uint8_t tiles[paged_background_slot_count * 64] = {};
    uint16_t map[1024] = {};
    bool dirty[paged_background_slot_count] = {};
    uint32_t edits_revision = 0;
};

constexpr Vec2i paged_background_camera(const TileMapAsset& map, Vec2i camera) {
    const int max_x = map.width * 8 > 240 ? map.width * 8 - 240 : 0;
    const int max_y = map.height * 8 > 160 ? map.height * 8 - 160 : 0;
    return {clamp_int(camera.x, 0, max_x), clamp_int(camera.y, 0, max_y)};
}

inline int stage_paged_background(PagedBackgroundCache& cache, const TileMapAsset& map,
                                 const TileAsset& atlas, Vec2i camera, const RoomTileEdits* edits = nullptr) {
    camera = paged_background_camera(map, camera);
    memset(cache.dirty, 0, sizeof(cache.dirty));
    int changed = 0;
    auto upload = [&](int x, int y, int slot) {
        const int original = x < map.width && y < map.height ? map.entries[y * map.width + x] : -1;
        const int index = edits != nullptr && original >= 0
            ? room_tile_value(*edits, 2, x, y, static_cast<uint16_t>(original)) : original;
        auto* destination = cache.tiles + slot * 64;
        if (index >= 0 && index < atlas.tile_count) memcpy(destination, atlas.data + index * 64, 64);
        else memset(destination, 0, 64);
        cache.dirty[slot] = true;
        cache.map[(y % 32) * 32 + x % 32] = static_cast<uint16_t>(slot);
        ++changed;
    };
    update_paged_background_window(cache.window, camera.x, camera.y, upload);
    if (edits != nullptr && cache.edits_revision != edits->revision) {
        for (size_t i = 0; i < edits->count; ++i) {
            const auto& edit = edits->entries[i];
            if ((edit.key >> 28) != 2) continue;
            const int x = edit.key & 0x3FFF, y = (edit.key >> 14) & 0x3FFF;
            if (x < cache.window.tile_x || y < cache.window.tile_y ||
                x >= cache.window.tile_x + 31 || y >= cache.window.tile_y + 21) continue;
            const int slot = (y % 21) * 31 + x % 31;
            if (!cache.dirty[slot]) upload(x, y, slot);
        }
        cache.edits_revision = edits->revision;
    }
    return changed;
}

} // namespace gbs
