#include <cassert>
#include <vector>
#include "gbs/paged_background.hpp"
#include "gbs/project.hpp"

int main() {
    constexpr int width = 126, height = 86, count = 3000;
    std::vector<uint8_t> pixels(count * 64);
    std::vector<uint16_t> entries(width * height);
    for (int i = 0; i < count * 64; ++i) pixels[i] = static_cast<uint8_t>((i / 64 + i % 64) % 199);
    for (int i = 0; i < width * height; ++i) entries[i] = static_cast<uint16_t>(i % count);
    const gbs::TileAsset atlas { pixels.data(), count, 0, false, gbs::ColorDepth::Bpp8 };
    const gbs::TileMapAsset map { entries.data(), width, height };
    const uint16_t colors[199] = {};
    const gbs::PaletteAsset palette { colors, 199, 0 };
    gbs::TopDownRoomData room {};
    room.width_tiles = width; room.height_tiles = height;
    room.uses_visual_tilemap = true;
    room.visual_tilemap = &map; room.visual_tile_asset = &atlas;
    room.visual_palette = &palette; room.paged_source_tiles = &atlas;
    assert(gbs::is_valid_topdown_paged_background(room));
    room.width_tiles = 60;
    assert(!gbs::is_valid_topdown_paged_background(room));
    room.width_tiles = width; room.visual_palette = nullptr;
    assert(!gbs::is_valid_topdown_paged_background(room));
    gbs::PagedBackgroundCache cache {};
    auto check = [&](gbs::Vec2i camera) {
        const auto bounded = gbs::paged_background_camera(map, camera);
        const int changed = gbs::stage_paged_background(cache, map, atlas, bounded);
        assert(changed >= 0 && changed <= 651);
        for (int y = 0; y < 160; ++y) for (int x = 0; x < 240; ++x) {
            const int sx = x + bounded.x, sy = y + bounded.y;
            const auto slot = cache.map[((sy / 8) % 32) * 32 + (sx / 8) % 32];
            assert(slot < 651);
            const auto source = entries[(sy / 8) * width + sx / 8];
            assert(cache.tiles[slot * 64 + (sy % 8) * 8 + sx % 8] == pixels[source * 64 + (sy % 8) * 8 + sx % 8]);
        }
        return changed;
    };
    assert(check({0, 0}) == 651);
    assert(check({7, 7}) == 0);
    assert(check({8, 0}) == 21);
    for (int i = 0; i < 384; ++i) check({i * 2, i});
    check({768, 528});
    check({0, 528});
    check({768, 0});
    check({625, 290});
    check({-12, -8}); // Camera shake at the edge cannot address negative slots.
    cache.window = {};
    assert(check({625, 290}) == 651); // Re-entering a room refills every reused slot.
    entries[0] = 65535;
    cache.window = {};
    gbs::stage_paged_background(cache, map, atlas, {0, 0});
    for (int i = 0; i < 64; ++i) assert(cache.tiles[i] == 0);
}
