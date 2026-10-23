#include <cassert>
#include "gbs/tile_edits.hpp"
#include "gbs/topdown.hpp"
#include "gbs/paged_background.hpp"

int main() {
    gbs::RoomTileEdits edits {};
    uint8_t flags[4] = {gbs::TileSolid, gbs::TileWater, 0, 0};
    gbs::TileSlope slopes[4] = {gbs::TileSlope::BlockBelowRising};
    gbs::TileMap collision {flags, 2, 2, slopes, &edits};
    assert(gbs::set_room_tile_edit(edits, 2, 0, 0, 2, 2, 7));
    assert(gbs::tile_flags_at(collision, 0, 0) == gbs::TileSolid);
    assert(gbs::tile_slope_at(collision, 0, 0) == slopes[0]);
    assert(gbs::set_room_tile_edit(edits, 2, 0, 0, 2, 2, 8, 0));
    assert(gbs::tile_flags_at(collision, 0, 0) == 0);
    assert(gbs::tile_slope_at(collision, 0, 0) == gbs::TileSlope::None);
    assert(gbs::set_room_tile_edit(edits, 2, 0, 0, 2, 2, 9));
    assert(edits.count == 1 && gbs::tile_flags_at(collision, 0, 0) == 0);
    assert(gbs::set_room_tile_edit(edits, 1, 1, 0, 2, 2, 10, 1));
    assert(gbs::tile_flags_at(collision, 1, 0) == gbs::TileWater);
    assert(!gbs::set_room_tile_edit(edits, 2, -1, 1, 2, 2, 1));
    assert(!gbs::set_room_tile_edit(edits, 2, 2, 0, 2, 2, 1));
    assert(gbs::set_room_tile_edit(edits, 2, 125, 85, 126, 86, 6000));
    assert(gbs::room_tile_value(edits, 2, 125, 85, 1) == 6000);
    assert(gbs::room_tile_value(edits, 2, 124, 85, 1) == 1);

    // A stationary camera must see edits, and scrolling away/back must retain them.
    gbs::RoomTileEdits paged_edits {};
    static uint16_t map_data[64 * 32] {};
    static uint8_t atlas_data[3 * 64] {};
    for (int i = 64; i < 128; ++i) atlas_data[i] = 1;
    const gbs::TileMapAsset map {map_data, 64, 32};
    const gbs::TileAsset atlas {atlas_data, 3, 0, false, gbs::ColorDepth::Bpp8};
    static gbs::PagedBackgroundCache cache {};
    gbs::stage_paged_background(cache, map, atlas, {0, 0}, &paged_edits);
    assert(gbs::set_room_tile_edit(paged_edits, 2, 2, 2, 64, 32, 1));
    assert(gbs::stage_paged_background(cache, map, atlas, {0, 0}, &paged_edits) == 1);
    const int slot = 2 * 31 + 2;
    assert(cache.dirty[slot] && cache.tiles[slot * 64] == 1);
    assert(gbs::stage_paged_background(cache, map, atlas, {0, 0}, &paged_edits) == 0);
    gbs::stage_paged_background(cache, map, atlas, {264, 0}, &paged_edits);
    gbs::stage_paged_background(cache, map, atlas, {0, 0}, &paged_edits);
    assert(cache.tiles[slot * 64] == 1);
    // Saturation rejects a new cell, but updating an existing one still works.
    gbs::RoomTileEdits full {};
    for (int x = 0; x < static_cast<int>(gbs::max_room_tile_edits); ++x)
        assert(gbs::set_room_tile_edit(full, 2, x, 0, 512, 1, 1));
    assert(!gbs::set_room_tile_edit(full, 2, 300, 0, 512, 1, 2));
    assert(gbs::set_room_tile_edit(full, 2, 0, 0, 512, 1, 3));
    assert(gbs::room_tile_value(full, 2, 0, 0, 1) == 3);
}
