#include <cassert>
#include "gbs/resource_manager.hpp"

extern "C" void gbs_hw_dma_copy(int, const void*, volatile void*, uint32_t, int) {
}

extern "C" void gbs_hw_hdma_start(int, const void*, volatile void*, uint32_t, int) {
}

extern "C" void gbs_hw_hdma_stop(int) {
}

namespace {

void test_fixed_range_reservation() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 16);

    gbs::ResourceReservation first = gbs::reserve_resource_range(pool, 4, 4);
    gbs::ResourceReservation overlap = gbs::reserve_resource_range(pool, 6, 2);
    gbs::ResourceReservation after = gbs::reserve_resource_range(pool, 8, 4);

    assert(gbs::resource_reservation_ok(first));
    assert(first.start == 4);
    assert(!overlap.success);
    assert(gbs::resource_reservation_ok(after));
    assert(gbs::resource_pool_used_count(pool) == 8);
    assert(gbs::resource_pool_remaining_count(pool) == 8);
}

void test_overflow_fails_safely() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 8);

    assert(!gbs::reserve_resource_range(pool, 7, 2).success);
    assert(!gbs::reserve_resource_range(pool, 8, 1).success);
    assert(!gbs::reserve_resource_range(pool, 0, 0).success);
    assert(gbs::resource_pool_used_count(pool) == 0);
}

void test_next_range_respects_alignment() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 16);

    assert(gbs::reserve_resource_range(pool, 0, 3).success);
    gbs::ResourceReservation next = gbs::reserve_next_resource_range(pool, 4, 4);

    assert(next.success);
    assert(next.start == 4);
    assert(next.count == 4);
}

void test_find_next_range_reports_fit_without_mutation() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 16);

    assert(gbs::reserve_resource_range(pool, 0, 3).success);
    assert(gbs::reserve_resource_range(pool, 8, 2).success);

    const gbs::ResourceReservation fit = gbs::find_next_resource_range(pool, 4, 4);
    assert(fit.success);
    assert(fit.start == 4);
    assert(fit.count == 4);
    assert(gbs::resource_pool_used_count(pool) == 5);
    assert(!gbs::find_next_resource_range(pool, 20, 1).success);
    assert(gbs::resource_pool_used_count(pool) == 5);
}

void test_reset_clears_pool() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 8);

    assert(gbs::reserve_resource_range(pool, 0, 8).success);
    assert(gbs::resource_pool_remaining_count(pool) == 0);
    gbs::reset_resource_pool(pool);
    assert(gbs::resource_pool_used_count(pool) == 0);
    assert(gbs::reserve_resource_range(pool, 0, 8).success);
}

void test_release_range_reclaims_capacity() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 16);

    gbs::ResourceReservation reservation = gbs::reserve_resource_range(pool, 4, 4);
    assert(reservation.success);
    assert(gbs::resource_pool_used_count(pool) == 4);
    assert(gbs::release_resource_range(pool, reservation));
    assert(gbs::resource_pool_used_count(pool) == 0);
    assert(gbs::reserve_resource_range(pool, 4, 4).success);
}

void test_release_rejects_unreserved_or_invalid_ranges() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 8);

    gbs::ResourceReservation reservation = gbs::reserve_resource_range(pool, 2, 2);
    assert(reservation.success);
    assert(!gbs::release_resource_range(pool, gbs::ResourceReservation { 1, 2, true }));
    assert(gbs::resource_pool_used_count(pool) == 2);
    assert(!gbs::release_resource_range(pool, gbs::ResourceReservation { 7, 2, true }));
    assert(!gbs::release_resource_range(pool, gbs::ResourceReservation { 0, 0, false }));
    assert(gbs::release_resource_range(pool, reservation));
    assert(!gbs::release_resource_range(pool, reservation));
}

void test_engine_resource_manager_defaults() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(manager.bg_tiles.capacity == gbs::max_bg_tiles);
    assert(manager.obj_tiles.capacity == gbs::max_obj_tiles);
    assert(manager.bg_palette.capacity == gbs::max_palette_colors);
    assert(manager.oam_sprites.capacity == gbs::max_oam_sprites);
    assert(gbs::reserve_bg_tiles(manager, 0, 4).success);
    assert(gbs::reserve_obj_tiles(manager, 16, 8).success);
    assert(gbs::reserve_bg_palette_colors(manager, 0, 16).success);
    assert(gbs::reserve_obj_palette_colors(manager, 16, 16).success);
    assert(gbs::reserve_oam_sprites(manager, 8, 4).success);
    assert(!gbs::reserve_oam_sprites(manager, 127, 2).success);
}

void test_next_resource_manager_helpers() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(gbs::reserve_bg_tiles(manager, 0, 3).success);
    gbs::ResourceReservation bg = gbs::reserve_next_bg_tiles(manager, 4, 4);
    gbs::ResourceReservation obj = gbs::reserve_next_obj_tiles(manager, 8, 8);
    gbs::ResourceReservation bg_palette = gbs::reserve_next_bg_palette_colors(manager, 16, 16);
    gbs::ResourceReservation obj_palette = gbs::reserve_next_obj_palette_colors(manager, 16, 16);
    gbs::ResourceReservation sprites = gbs::reserve_next_oam_sprites(manager, 2, 2);

    assert(bg.success && bg.start == 4);
    assert(obj.success && obj.start == 0);
    assert(bg_palette.success && bg_palette.start == 0);
    assert(obj_palette.success && obj_palette.start == 0);
    assert(sprites.success && sprites.start == 0);
}

void test_asset_reservations_follow_asset_ranges() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[] = { 0, 1, 2, 3 };
    const uint16_t colors[] = { 0, 1, 2, 3 };

    gbs::TileAsset bg_tile_asset { tile_data, 4, 12, false };
    gbs::TileAsset obj_tile_asset { tile_data, 2, 20, true };
    gbs::PaletteAsset bg_palette_asset { colors, 4, 32 };
    gbs::PaletteAsset obj_palette_asset { colors, 4, 48 };

    gbs::ResourceReservation bg_tiles = gbs::reserve_tile_asset(manager, bg_tile_asset);
    gbs::ResourceReservation obj_tiles = gbs::reserve_tile_asset(manager, obj_tile_asset);
    gbs::ResourceReservation bg_palette = gbs::reserve_palette_asset(manager, bg_palette_asset, false);
    gbs::ResourceReservation obj_palette = gbs::reserve_palette_asset(manager, obj_palette_asset, true);

    assert(bg_tiles.success && bg_tiles.start == 12 && bg_tiles.count == 4);
    assert(obj_tiles.success && obj_tiles.start == 20 && obj_tiles.count == 2);
    assert(bg_palette.success && bg_palette.start == 32 && bg_palette.count == 4);
    assert(obj_palette.success && obj_palette.start == 48 && obj_palette.count == 4);
    assert(!gbs::reserve_tile_asset(manager, bg_tile_asset).success);
    assert(gbs::release_bg_tiles(manager, bg_tiles));
    assert(gbs::reserve_tile_asset(manager, bg_tile_asset).success);
}

void test_pool_snapshot_restores_previous_usage() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 16);

    assert(gbs::reserve_resource_range(pool, 2, 3).success);
    gbs::ResourcePoolSnapshot snapshot = gbs::capture_resource_pool_snapshot(pool);
    assert(snapshot.valid);
    assert(snapshot.capacity == 16);

    assert(gbs::reserve_resource_range(pool, 8, 4).success);
    assert(gbs::resource_pool_used_count(pool) == 7);
    assert(gbs::restore_resource_pool_snapshot(pool, snapshot));
    assert(gbs::resource_pool_used_count(pool) == 3);
    assert(gbs::reserve_resource_range(pool, 8, 4).success);
    assert(!gbs::reserve_resource_range(pool, 2, 1).success);
}

void test_pool_snapshot_rejects_invalid_snapshot_without_mutation() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 8);
    assert(gbs::reserve_resource_range(pool, 0, 2).success);

    gbs::ResourcePoolSnapshot invalid {};
    invalid.valid = false;
    invalid.capacity = 8;
    assert(!gbs::restore_resource_pool_snapshot(pool, invalid));
    assert(gbs::resource_pool_used_count(pool) == 2);

    invalid.valid = true;
    invalid.capacity = 2048;
    assert(!gbs::restore_resource_pool_snapshot(pool, invalid));
    assert(gbs::resource_pool_used_count(pool) == 2);
}

void test_manager_snapshot_rolls_back_multiple_pools() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(gbs::reserve_bg_tiles(manager, 0, 4).success);
    assert(gbs::reserve_obj_palette_colors(manager, 16, 8).success);
    gbs::EngineResourceSnapshot snapshot = gbs::capture_resource_manager_snapshot(manager);
    assert(snapshot.valid);

    assert(gbs::reserve_bg_tiles(manager, 16, 4).success);
    assert(gbs::reserve_obj_tiles(manager, 0, 6).success);
    assert(gbs::reserve_oam_sprites(manager, 8, 2).success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 6);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 2);

    assert(gbs::restore_resource_manager_snapshot(manager, snapshot));
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 4);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.obj_palette) == 8);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 0);
}

void test_manager_snapshot_rejects_invalid_snapshot_without_mutation() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(gbs::reserve_bg_tiles(manager, 4, 4).success);
    gbs::EngineResourceSnapshot invalid {};
    invalid.valid = false;

    assert(!gbs::restore_resource_manager_snapshot(manager, invalid));
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 4);
}

void test_resource_batch_reserves_room_assets() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[] = { 0, 1, 2, 3 };
    const uint16_t colors[] = { 0, 1, 2, 3 };
    const gbs::TileAsset tiles[] = {
        gbs::TileAsset { tile_data, 4, 12, false },
        gbs::TileAsset { tile_data, 2, 20, true },
    };
    const gbs::PaletteAsset bg_palettes[] = {
        gbs::PaletteAsset { colors, 4, 32 },
    };
    const gbs::PaletteAsset obj_palettes[] = {
        gbs::PaletteAsset { colors, 4, 48 },
    };

    gbs::ResourceReservation tile_reservations[2] = {};
    gbs::ResourceReservation bg_palette_reservations[1] = {};
    gbs::ResourceReservation obj_palette_reservations[1] = {};
    gbs::ResourceBatchReservation reservation {
        tile_reservations,
        2,
        0,
        bg_palette_reservations,
        1,
        0,
        obj_palette_reservations,
        1,
        0,
        gbs::ResourceReservation {},
        false,
    };

    const gbs::ResourceBatch batch {
        tiles,
        2,
        bg_palettes,
        1,
        obj_palettes,
        1,
        3,
        2,
    };

    assert(gbs::reserve_resource_batch(manager, batch, reservation));
    assert(reservation.success);
    assert(reservation.tile_reservation_count == 2);
    assert(reservation.bg_palette_reservation_count == 1);
    assert(reservation.obj_palette_reservation_count == 1);
    assert(reservation.oam_sprites.success && reservation.oam_sprites.start == 0 && reservation.oam_sprites.count == 3);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 4);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 2);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 4);
    assert(gbs::resource_pool_used_count(manager.obj_palette) == 4);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 3);
}

void test_resource_batch_rolls_back_on_failure() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(gbs::reserve_bg_tiles(manager, 0, 4).success);
    assert(gbs::reserve_obj_palette_colors(manager, 0, 8).success);

    const uint8_t tile_data[] = { 0, 1, 2, 3 };
    const uint16_t colors[] = { 0, 1, 2, 3 };
    const gbs::TileAsset tiles[] = {
        gbs::TileAsset { tile_data, 4, 16, false },
        gbs::TileAsset { tile_data, 4, 2, false },
    };
    const gbs::PaletteAsset bg_palettes[] = {
        gbs::PaletteAsset { colors, 4, 32 },
    };

    gbs::ResourceReservation tile_reservations[2] = {};
    gbs::ResourceReservation bg_palette_reservations[1] = {};
    gbs::ResourceBatchReservation reservation {
        tile_reservations,
        2,
        0,
        bg_palette_reservations,
        1,
        0,
        nullptr,
        0,
        0,
        gbs::ResourceReservation {},
        false,
    };

    const gbs::ResourceBatch batch {
        tiles,
        2,
        bg_palettes,
        1,
        nullptr,
        0,
        0,
        1,
    };

    assert(!gbs::reserve_resource_batch(manager, batch, reservation));
    assert(!reservation.success);
    assert(reservation.tile_reservation_count == 0);
    assert(reservation.bg_palette_reservation_count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 4);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);
    assert(gbs::resource_pool_used_count(manager.obj_palette) == 8);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 0);
}

void test_resource_batch_rejects_small_output_buffers() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[] = { 0, 1, 2, 3 };
    const gbs::TileAsset tiles[] = {
        gbs::TileAsset { tile_data, 1, 8, false },
        gbs::TileAsset { tile_data, 1, 9, false },
    };
    gbs::ResourceReservation tile_reservations[1] = {};
    gbs::ResourceBatchReservation reservation {
        tile_reservations,
        1,
        0,
        nullptr,
        0,
        0,
        nullptr,
        0,
        0,
        gbs::ResourceReservation {},
        false,
    };
    const gbs::ResourceBatch batch {
        tiles,
        2,
        nullptr,
        0,
        nullptr,
        0,
        0,
        1,
    };

    assert(!gbs::reserve_resource_batch(manager, batch, reservation));
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
}

void test_resource_batch_release_reclaims_all_pools() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[] = { 0, 1, 2, 3 };
    const uint16_t colors[] = { 0, 1, 2, 3 };
    const gbs::TileAsset tiles[] = {
        gbs::TileAsset { tile_data, 4, 12, false },
        gbs::TileAsset { tile_data, 2, 20, true },
    };
    const gbs::PaletteAsset bg_palettes[] = {
        gbs::PaletteAsset { colors, 4, 32 },
    };
    const gbs::PaletteAsset obj_palettes[] = {
        gbs::PaletteAsset { colors, 4, 48 },
    };
    const gbs::ResourceBatch batch {
        tiles,
        2,
        bg_palettes,
        1,
        obj_palettes,
        1,
        3,
        1,
    };

    gbs::ResourceReservation tile_reservations[2] = {};
    gbs::ResourceReservation bg_palette_reservations[1] = {};
    gbs::ResourceReservation obj_palette_reservations[1] = {};
    gbs::ResourceBatchReservation reservation {
        tile_reservations,
        2,
        0,
        bg_palette_reservations,
        1,
        0,
        obj_palette_reservations,
        1,
        0,
        gbs::ResourceReservation {},
        false,
    };

    assert(gbs::reserve_resource_batch(manager, batch, reservation));
    assert(gbs::release_resource_batch(manager, batch, reservation));
    assert(!reservation.success);
    assert(reservation.tile_reservation_count == 0);
    assert(reservation.bg_palette_reservation_count == 0);
    assert(reservation.obj_palette_reservation_count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);
    assert(gbs::resource_pool_used_count(manager.obj_palette) == 0);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 0);
}

void test_resource_batch_release_rolls_back_on_failure() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[] = { 0, 1, 2, 3 };
    const uint16_t colors[] = { 0, 1, 2, 3 };
    const gbs::TileAsset tiles[] = {
        gbs::TileAsset { tile_data, 4, 12, false },
    };
    const gbs::PaletteAsset bg_palettes[] = {
        gbs::PaletteAsset { colors, 4, 32 },
    };
    const gbs::ResourceBatch batch {
        tiles,
        1,
        bg_palettes,
        1,
        nullptr,
        0,
        0,
        1,
    };

    gbs::ResourceReservation tile_reservations[1] = {};
    gbs::ResourceReservation bg_palette_reservations[1] = {};
    gbs::ResourceBatchReservation reservation {
        tile_reservations,
        1,
        0,
        bg_palette_reservations,
        1,
        0,
        nullptr,
        0,
        0,
        gbs::ResourceReservation {},
        false,
    };

    assert(gbs::reserve_resource_batch(manager, batch, reservation));
    assert(gbs::release_bg_palette_colors(manager, reservation.bg_palette_reservations[0]));
    assert(!gbs::release_resource_batch(manager, batch, reservation));
    assert(reservation.success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 4);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);
}

void test_resource_batch_release_rejects_mismatched_counts() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[] = { 0, 1, 2, 3 };
    const gbs::TileAsset tiles[] = {
        gbs::TileAsset { tile_data, 1, 8, false },
    };
    const gbs::ResourceBatch batch {
        tiles,
        1,
        nullptr,
        0,
        nullptr,
        0,
        0,
        1,
    };

    gbs::ResourceReservation tile_reservations[1] = {};
    gbs::ResourceBatchReservation reservation {
        tile_reservations,
        1,
        0,
        nullptr,
        0,
        0,
        nullptr,
        0,
        0,
        gbs::ResourceReservation {},
        false,
    };

    assert(gbs::reserve_resource_batch(manager, batch, reservation));
    reservation.tile_reservation_count = 0;
    assert(!gbs::release_resource_batch(manager, batch, reservation));
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 1);
}

void test_resource_usage_reports_largest_free_block() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 16);

    assert(gbs::reserve_resource_range(pool, 0, 2).success);
    assert(gbs::reserve_resource_range(pool, 6, 2).success);
    assert(gbs::reserve_resource_range(pool, 14, 2).success);

    gbs::ResourcePoolUsage usage = gbs::capture_resource_pool_usage(pool);
    assert(usage.capacity == 16);
    assert(usage.used == 6);
    assert(usage.remaining == 10);
    assert(usage.largest_free_block == 6);
}

void test_resource_usage_reports_free_block_count() {
    gbs::StaticResourcePool pool;
    gbs::init_resource_pool(pool, 16);

    assert(gbs::reserve_resource_range(pool, 0, 2).success);
    assert(gbs::reserve_resource_range(pool, 5, 2).success);
    assert(gbs::reserve_resource_range(pool, 10, 1).success);

    gbs::ResourcePoolUsage usage = gbs::capture_resource_pool_usage(pool);
    assert(gbs::resource_pool_free_block_count(pool) == 3);
    assert(usage.free_block_count == 3);
    assert(usage.largest_free_block == 5);
}

void test_engine_usage_reports_all_pools() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(gbs::reserve_bg_tiles(manager, 0, 8).success);
    assert(gbs::reserve_obj_tiles(manager, 16, 4).success);
    assert(gbs::reserve_bg_palette_colors(manager, 0, 16).success);
    assert(gbs::reserve_oam_sprites(manager, 0, 3).success);

    gbs::EngineResourceUsage usage = gbs::capture_engine_resource_usage(manager);
    assert(usage.bg_tiles.used == 8);
    assert(usage.obj_tiles.used == 4);
    assert(usage.bg_palette.used == 16);
    assert(usage.obj_palette.used == 0);
    assert(usage.oam_sprites.used == 3);
}

void test_engine_resident_usage_reports_counts_without_fragmentation_scan() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(gbs::reserve_bg_tiles(manager, 0, 8).success);
    assert(gbs::reserve_obj_tiles(manager, 16, 4).success);
    assert(gbs::reserve_bg_palette_colors(manager, 0, 16).success);
    assert(gbs::reserve_oam_sprites(manager, 0, 3).success);

    const gbs::EngineResourceUsage usage = gbs::capture_engine_resident_resource_usage(manager);
    assert(usage.bg_tiles.capacity == gbs::max_bg_tiles);
    assert(usage.bg_tiles.used == 8);
    assert(usage.bg_tiles.remaining == gbs::max_bg_tiles - 8);
    assert(usage.bg_tiles.largest_free_block == 0);
    assert(usage.bg_tiles.free_block_count == 0);
    assert(usage.obj_tiles.used == 4);
    assert(usage.bg_palette.used == 16);
    assert(usage.oam_sprites.used == 3);
}

void test_resource_bank_fixed_and_auto_reservation() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank fixed {
        gbs::ResourcePoolKind::BgTiles,
        64,
        16,
        8,
        "room_bg",
    };
    const gbs::ResourceBank automatic {
        gbs::ResourcePoolKind::ObjTiles,
        gbs::automatic_resource_bank_start,
        12,
        8,
        "player_obj",
    };

    assert(gbs::is_valid_resource_bank(fixed));
    assert(gbs::is_valid_resource_bank(automatic));
    assert(gbs::is_auto_resource_bank_start(automatic.start));

    gbs::ResourceBankReservation fixed_reservation = gbs::reserve_resource_bank(manager, fixed);
    gbs::ResourceBankReservation auto_reservation = gbs::reserve_resource_bank(manager, automatic);

    assert(fixed_reservation.success);
    assert(fixed_reservation.reservation.start == 64);
    assert(fixed_reservation.reservation.count == 16);
    assert(auto_reservation.success);
    assert(auto_reservation.reservation.start == 0);
    assert(auto_reservation.reservation.count == 12);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 12);
    assert(gbs::release_resource_bank(manager, fixed_reservation));
    assert(!fixed_reservation.success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
}

void test_resource_bank_preview_reports_fit_without_mutation() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(gbs::reserve_obj_tiles(manager, 0, 3).success);
    assert(gbs::reserve_obj_tiles(manager, 16, 4).success);

    const gbs::ResourceBank automatic {
        gbs::ResourcePoolKind::ObjTiles,
        gbs::automatic_resource_bank_start,
        8,
        8,
        "preview_obj",
    };
    const gbs::ResourceBank fixed {
        gbs::ResourcePoolKind::ObjTiles,
        32,
        8,
        8,
        "fixed_obj",
    };
    const gbs::ResourceBank overlap {
        gbs::ResourcePoolKind::ObjTiles,
        16,
        2,
        1,
        "overlap_obj",
    };

    const gbs::ResourceBankReservation auto_preview = gbs::preview_resource_bank_reservation(manager, automatic);
    const gbs::ResourceBankReservation fixed_preview = gbs::preview_resource_bank_reservation(manager, fixed);
    const gbs::ResourceBankReservation overlap_preview = gbs::preview_resource_bank_reservation(manager, overlap);

    assert(auto_preview.success);
    assert(auto_preview.reservation.start == 8);
    assert(auto_preview.reservation.count == 8);
    assert(fixed_preview.success);
    assert(fixed_preview.reservation.start == 32);
    assert(!overlap_preview.success);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 7);
}

void test_resource_bank_rejects_bad_alignment_without_mutation() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank unaligned {
        gbs::ResourcePoolKind::BgPalette,
        3,
        8,
        4,
        "bad_palette",
    };

    assert(!gbs::is_valid_resource_bank(unaligned));
    gbs::ResourceBankReservation reservation = gbs::reserve_resource_bank(manager, unaligned);
    assert(!reservation.success);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);
}

void test_resource_bank_batch_rolls_back_on_failure() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    assert(gbs::reserve_bg_tiles(manager, 32, 8).success);
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 10, 2, "actor_obj" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 36, 4, 1, "overlap_bg" },
    };
    gbs::ResourceBankReservation reservations[2] = {};
    gbs::ResourceBankBatchReservation batch_reservation {
        reservations,
        2,
        0,
        nullptr,
        false,
    };

    const gbs::ResourceBankBatch batch { banks, 2 };
    assert(!gbs::reserve_resource_banks(manager, batch, batch_reservation));
    assert(!batch_reservation.success);
    assert(batch_reservation.reservation_count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);
}

void test_resource_bank_batch_preview_reports_transient_conflicts_without_mutation() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 8, 8, "actors_a" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 8, 8, "actors_b" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 32, 8, 8, "room_bg" },
    };
    gbs::ResourceBankReservation reservations[3] = {};
    gbs::ResourceBankBatchReservation preview {
        reservations,
        3,
        0,
        nullptr,
        false,
    };

    assert(gbs::preview_resource_banks(manager, gbs::ResourceBankBatch { banks, 3 }, preview));
    assert(preview.success);
    assert(preview.reservation_count == 3);
    assert(preview.reservations[0].reservation.start == 0);
    assert(preview.reservations[1].reservation.start == 8);
    assert(preview.reservations[2].reservation.start == 32);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);

    const gbs::ResourceBank conflicting[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 16, 8, 8, "first_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 20, 4, 4, "overlap_bg" },
    };
    assert(!gbs::preview_resource_banks(manager, gbs::ResourceBankBatch { conflicting, 2 }, preview));
    assert(!preview.success);
    assert(preview.reservation_count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
}

void test_resource_bank_batch_release_reclaims_all_pools() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 128, 32, 16, "large_room_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 16, 8, "actors_obj" },
        gbs::ResourceBank { gbs::ResourcePoolKind::OamSprites, 0xFFFF, 12, 4, "actors_oam" },
    };
    gbs::ResourceBankReservation reservations[3] = {};
    gbs::ResourceBankBatchReservation batch_reservation {
        reservations,
        3,
        0,
        nullptr,
        false,
    };

    const gbs::ResourceBankBatch batch { banks, 3 };
    assert(gbs::reserve_resource_banks(manager, batch, batch_reservation));
    assert(batch_reservation.success);
    assert(batch_reservation.reservation_count == 3);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 32);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 16);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 12);
    assert(gbs::release_resource_banks(manager, batch_reservation));
    assert(!batch_reservation.success);
    assert(batch_reservation.reservation_count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 0);
}

void test_resource_bank_hot_swap_releases_active_and_reserves_next() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank active_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 128, 32, 16, "room_a_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 8, 4, "room_a_obj" },
    };
    gbs::ResourceBankReservation active_reservations[2] = {};
    gbs::ResourceBankBatchReservation active {
        active_reservations,
        2,
        0,
        nullptr,
        false,
    };
    assert(gbs::reserve_resource_banks(manager, gbs::ResourceBankBatch { active_banks, 2 }, active));

    const gbs::ResourceBank next_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 256, 48, 16, "room_b_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 32, 12, 4, "room_b_obj" },
    };
    gbs::ResourceBankReservation next_reservations[2] = {};
    gbs::ResourceBankBatchReservation next {
        next_reservations,
        2,
        0,
        nullptr,
        false,
    };

    assert(gbs::hot_swap_resource_banks(manager, active, gbs::ResourceBankBatch { next_banks, 2 }, next));
    assert(!active.success);
    assert(active.reservation_count == 0);
    assert(next.success);
    assert(next.reservation_count == 2);
    assert(next.reservations[0].reservation.start == 256);
    assert(next.reservations[1].reservation.start == 32);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 48);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 12);
}

void test_resource_bank_hot_swap_rolls_back_when_next_fails() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank active_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 16, 8, 1, "room_a_bg" },
    };
    gbs::ResourceBankReservation active_reservations[1] = {};
    gbs::ResourceBankBatchReservation active {
        active_reservations,
        1,
        0,
        nullptr,
        false,
    };
    assert(gbs::reserve_resource_banks(manager, gbs::ResourceBankBatch { active_banks, 1 }, active));

    const gbs::ResourceBank next_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 0xFFFF, 2000, 1, "too_large" },
    };
    gbs::ResourceBankReservation next_reservations[1] = {};
    gbs::ResourceBankBatchReservation next {
        next_reservations,
        1,
        0,
        nullptr,
        false,
    };

    assert(!gbs::hot_swap_resource_banks(manager, active, gbs::ResourceBankBatch { next_banks, 1 }, next));
    assert(active.success);
    assert(active.reservation_count == 1);
    assert(active.reservations[0].reservation.start == 16);
    assert(next.reservation_count == 0);
    assert(!next.success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
}

void test_resource_bank_group_reserves_and_releases_named_group() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 64, 16, 16, "room_bg_tiles" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgPalette, 32, 16, 16, "room_bg_palette" },
    };
    const gbs::ResourceBankGroup group { "room_0", banks, 2 };
    gbs::ResourceBankReservation reservations[2] = {};
    gbs::ResourceBankBatchReservation group_reservation {
        reservations,
        2,
        0,
        nullptr,
        false,
    };

    assert(gbs::reserve_resource_bank_group(manager, group, group_reservation));
    assert(group_reservation.success);
    assert(group_reservation.group_name == group.name);
    assert(group_reservation.reservation_count == 2);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 16);
    assert(gbs::release_resource_bank_group(manager, group_reservation));
    assert(!group_reservation.success);
    assert(group_reservation.group_name == nullptr);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);
}

void test_resource_bank_group_preview_preserves_name_without_mutation() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 0xFFFF, 16, 16, "room_bg_tiles" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgPalette, 32, 16, 16, "room_bg_palette" },
    };
    const gbs::ResourceBankGroup group { "room_preview", banks, 2 };
    gbs::ResourceBankReservation reservations[2] = {};
    gbs::ResourceBankBatchReservation preview {
        reservations,
        2,
        0,
        nullptr,
        false,
    };

    assert(gbs::preview_resource_bank_group(manager, group, preview));
    assert(preview.success);
    assert(preview.group_name == group.name);
    assert(preview.reservation_count == 2);
    assert(preview.reservations[0].reservation.start == 0);
    assert(preview.reservations[1].reservation.start == 32);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);

    const gbs::ResourceBank conflicting[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 32, 8, 8, "first_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 36, 4, 4, "overlap_bg" },
    };
    const gbs::ResourceBankGroup bad_group { "bad_preview", conflicting, 2 };
    assert(!gbs::preview_resource_bank_group(manager, bad_group, preview));
    assert(!preview.success);
    assert(preview.group_name == nullptr);
    assert(preview.reservation_count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
}

void test_resource_bank_group_rolls_back_on_failure() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    assert(gbs::reserve_bg_tiles(manager, 32, 8).success);

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 8, 4, "actors_obj" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 36, 4, 1, "overlap_bg" },
    };
    const gbs::ResourceBankGroup group { "room_bad", banks, 2 };
    gbs::ResourceBankReservation reservations[2] = {};
    gbs::ResourceBankBatchReservation group_reservation {
        reservations,
        2,
        0,
        nullptr,
        false,
    };

    assert(!gbs::reserve_resource_bank_group(manager, group, group_reservation));
    assert(!group_reservation.success);
    assert(group_reservation.group_name == nullptr);
    assert(group_reservation.reservation_count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);
}

void test_resource_bank_group_hot_swap_preserves_group_name() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank active_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 16, 8, 8, "room_a_bg" },
    };
    const gbs::ResourceBankGroup active_group { "room_a", active_banks, 1 };
    gbs::ResourceBankReservation active_reservations[1] = {};
    gbs::ResourceBankBatchReservation active {
        active_reservations,
        1,
        0,
        nullptr,
        false,
    };
    assert(gbs::reserve_resource_bank_group(manager, active_group, active));

    const gbs::ResourceBank next_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 80, 16, 16, "room_b_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 4, 4, "room_b_obj" },
    };
    const gbs::ResourceBankGroup next_group { "room_b", next_banks, 2 };
    gbs::ResourceBankReservation next_reservations[2] = {};
    gbs::ResourceBankBatchReservation next {
        next_reservations,
        2,
        0,
        nullptr,
        false,
    };

    assert(gbs::hot_swap_resource_bank_group(manager, active, next_group, next));
    assert(!active.success);
    assert(active.group_name == nullptr);
    assert(next.success);
    assert(next.group_name == next_group.name);
    assert(next.reservation_count == 2);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 4);
}

void test_resource_bank_group_stream_reserves_initial_group() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 32, 8, 8, "room_bg" },
    };
    const gbs::ResourceBankGroup group { "room_a", banks, 1 };
    gbs::ResourceBankReservation active_reservations[1] = {};
    gbs::ResourceBankReservation scratch_reservations[1] = {};
    gbs::ResourceBankBatchReservation active {
        active_reservations,
        1,
        0,
        nullptr,
        false,
    };
    gbs::ResourceBankBatchReservation scratch {
        scratch_reservations,
        1,
        0,
        nullptr,
        false,
    };

    assert(gbs::stream_resource_bank_group(manager, active, scratch, group));
    assert(active.success);
    assert(active.group_name == group.name);
    assert(active.reservations == active_reservations);
    assert(scratch.reservations == scratch_reservations);
    assert(!scratch.success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
}

void test_resource_bank_group_stream_skips_same_group() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 64, 8, 8, "room_bg" },
    };
    const gbs::ResourceBankGroup group { "room_a", banks, 1 };
    gbs::ResourceBankReservation active_reservations[1] = {};
    gbs::ResourceBankReservation scratch_reservations[1] = {};
    gbs::ResourceBankBatchReservation active { active_reservations, 1, 0, nullptr, false };
    gbs::ResourceBankBatchReservation scratch { scratch_reservations, 1, 0, nullptr, false };

    assert(gbs::stream_resource_bank_group(manager, active, scratch, group));
    assert(gbs::stream_resource_bank_group(manager, active, scratch, group));
    assert(active.success);
    assert(active.group_name == group.name);
    assert(active.reservation_count == 1);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
}

void test_resource_bank_group_stream_hot_swaps_between_groups() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank room_a_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 16, 8, 8, "room_a_bg" },
    };
    const gbs::ResourceBank room_b_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 96, 16, 16, "room_b_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 4, 4, "room_b_obj" },
    };
    const gbs::ResourceBankGroup room_a { "room_a", room_a_banks, 1 };
    const gbs::ResourceBankGroup room_b { "room_b", room_b_banks, 2 };
    gbs::ResourceBankReservation buffer_a[2] = {};
    gbs::ResourceBankReservation buffer_b[2] = {};
    gbs::ResourceBankBatchReservation active { buffer_a, 2, 0, nullptr, false };
    gbs::ResourceBankBatchReservation scratch { buffer_b, 2, 0, nullptr, false };

    assert(gbs::stream_resource_bank_group(manager, active, scratch, room_a));
    assert(active.reservations == buffer_a);
    assert(gbs::stream_resource_bank_group(manager, active, scratch, room_b));
    assert(active.success);
    assert(active.group_name == room_b.name);
    assert(active.reservations == buffer_b);
    assert(scratch.reservations == buffer_a);
    assert(!scratch.success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 4);
}

void test_resource_bank_group_stream_rolls_back_on_failure() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank room_a_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 16, 8, 8, "room_a_bg" },
    };
    const gbs::ResourceBank room_bad_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 0xFFFF, 2000, 1, "too_large" },
    };
    const gbs::ResourceBankGroup room_a { "room_a", room_a_banks, 1 };
    const gbs::ResourceBankGroup room_bad { "room_bad", room_bad_banks, 1 };
    gbs::ResourceBankReservation buffer_a[1] = {};
    gbs::ResourceBankReservation buffer_b[1] = {};
    gbs::ResourceBankBatchReservation active { buffer_a, 1, 0, nullptr, false };
    gbs::ResourceBankBatchReservation scratch { buffer_b, 1, 0, nullptr, false };

    assert(gbs::stream_resource_bank_group(manager, active, scratch, room_a));
    assert(!gbs::stream_resource_bank_group(manager, active, scratch, room_bad));
    assert(active.success);
    assert(active.group_name == room_a.name);
    assert(active.reservations == buffer_a);
    assert(!scratch.success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
}

void test_resource_bank_group_name_lookup_returns_expected_group() {
    const gbs::ResourceBank room_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 16, 8, 8, "room_bg" },
    };
    const gbs::ResourceBank shared_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 4, 4, "shared_obj" },
    };
    const gbs::ResourceBankGroup groups[] = {
        gbs::ResourceBankGroup { "room_0", room_banks, 1 },
        gbs::ResourceBankGroup { "shared", shared_banks, 1 },
    };

    assert(gbs::resource_bank_name_equals("room_0", "room_0"));
    assert(!gbs::resource_bank_name_equals("room_0", "room_1"));
    assert(!gbs::resource_bank_name_equals(nullptr, "room_0"));
    assert(gbs::find_resource_bank_group_index(groups, 2, "room_0") == 0);
    assert(gbs::find_resource_bank_group_index(groups, 2, "shared") == 1);
    assert(gbs::find_resource_bank_group_index(groups, 2, "missing") == -1);
    assert(gbs::find_resource_bank_group_index(nullptr, 2, "room_0") == -1);
    gbs::ResourceBankGroup group = gbs::resource_bank_group_by_name(groups, 2, "shared");
    assert(group.name == groups[1].name);
    assert(group.banks == shared_banks);
    assert(group.bank_count == 1);
    assert(gbs::resource_bank_group_by_name(groups, 2, "missing").bank_count == 0);
}

void test_resource_bank_cache_evicts_lower_priority_bank() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[2] = {};
    gbs::ResourceBankCache cache { entries, 2, 0 };

    const gbs::ResourceBank low {
        gbs::ResourcePoolKind::BgTiles,
        0,
        8,
        1,
        "low_bg",
    };
    const gbs::ResourceBank high {
        gbs::ResourcePoolKind::BgTiles,
        4,
        8,
        1,
        "high_bg",
    };

    gbs::ResourceBankCacheResult low_result = gbs::reserve_resource_bank_cached(manager, cache, low, 1, 10);
    assert(low_result.success);
    assert(low_result.entry_index == 0);
    assert(cache.count == 1);
    assert(cache.entries[0].active);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);

    gbs::ResourceBankCacheResult high_result = gbs::reserve_resource_bank_cached(manager, cache, high, 5, 20);
    assert(high_result.success);
    assert(high_result.evicted_count == 1);
    assert(cache.count == 1);
    assert(cache.entries[0].active);
    assert(cache.entries[0].priority == 5);
    assert(cache.entries[0].last_used_tick == 20);
    assert(cache.entries[0].reservation.reservation.start == 4);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
    assert(!manager.bg_tiles.used[0]);
    assert(manager.bg_tiles.used[4]);
}

void test_resource_bank_cache_respects_locked_and_higher_priority_banks() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[2] = {};
    gbs::ResourceBankCache cache { entries, 2, 0 };

    const gbs::ResourceBank locked {
        gbs::ResourcePoolKind::ObjTiles,
        0,
        8,
        1,
        "locked_obj",
    };
    const gbs::ResourceBank incoming {
        gbs::ResourcePoolKind::ObjTiles,
        4,
        8,
        1,
        "incoming_obj",
    };

    gbs::ResourceBankCacheResult locked_result = gbs::reserve_resource_bank_cached(manager, cache, locked, 1, 10);
    assert(locked_result.success);
    assert(gbs::set_resource_bank_cache_locked(cache, locked_result.entry_index, true));

    gbs::ResourceBankCacheResult incoming_result = gbs::reserve_resource_bank_cached(manager, cache, incoming, 9, 20);
    assert(!incoming_result.success);
    assert(incoming_result.evicted_count == 0);
    assert(cache.count == 1);
    assert(cache.entries[0].active);
    assert(cache.entries[0].locked);
    assert(cache.entries[0].reservation.reservation.start == 0);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 8);
}

void test_resource_bank_cache_rolls_back_when_eviction_cannot_fit() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[3] = {};
    gbs::ResourceBankCache cache { entries, 3, 0 };

    const gbs::ResourceBank old_a {
        gbs::ResourcePoolKind::OamSprites,
        0,
        4,
        1,
        "old_a",
    };
    const gbs::ResourceBank old_b {
        gbs::ResourcePoolKind::OamSprites,
        8,
        4,
        1,
        "old_b",
    };
    const gbs::ResourceBank too_large {
        gbs::ResourcePoolKind::OamSprites,
        0,
        16,
        1,
        "too_large",
    };

    assert(gbs::reserve_resource_bank_cached(manager, cache, old_a, 1, 10).success);
    assert(gbs::reserve_resource_bank_cached(manager, cache, old_b, 2, 20).success);
    assert(gbs::set_resource_bank_cache_locked(cache, 1, true));

    gbs::ResourceBankCacheResult result = gbs::reserve_resource_bank_cached(manager, cache, too_large, 9, 30);
    assert(!result.success);
    assert(result.evicted_count == 0);
    assert(cache.count == 2);
    assert(cache.entries[0].active);
    assert(cache.entries[1].active);
    assert(cache.entries[1].locked);
    assert(cache.entries[0].reservation.reservation.start == 0);
    assert(cache.entries[1].reservation.reservation.start == 8);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 8);
}

void test_resource_bank_cache_prune_releases_stale_unlocked_entries() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[4] = {};
    gbs::ResourceBankCache cache { entries, 4, 0 };

    const gbs::ResourceBank stale {
        gbs::ResourcePoolKind::BgTiles,
        0,
        8,
        1,
        "stale_bg",
    };
    const gbs::ResourceBank fresh {
        gbs::ResourcePoolKind::BgTiles,
        16,
        8,
        1,
        "fresh_bg",
    };
    const gbs::ResourceBank locked {
        gbs::ResourcePoolKind::BgTiles,
        32,
        8,
        1,
        "locked_bg",
    };

    assert(gbs::reserve_resource_bank_cached(manager, cache, stale, 4, 10).success);
    assert(gbs::reserve_resource_bank_cached(manager, cache, fresh, 4, 90).success);
    gbs::ResourceBankCacheResult locked_result = gbs::reserve_resource_bank_cached(manager, cache, locked, 1, 5);
    assert(locked_result.success);
    assert(gbs::set_resource_bank_cache_locked(cache, locked_result.entry_index, true));

    const gbs::ResourceBankCachePrunePolicy policy {
        100,
        50,
        255,
        gbs::ResourcePoolKind::BgTiles,
        false,
        true,
    };
    gbs::ResourceBankCachePruneResult result = gbs::prune_resource_bank_cache(manager, cache, policy);

    assert(result.success);
    assert(result.pruned_count == 1);
    assert(result.released_count == 8);
    assert(!cache.entries[0].active);
    assert(cache.entries[1].active);
    assert(cache.entries[2].active);
    assert(cache.entries[2].locked);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(!manager.bg_tiles.used[0]);
    assert(manager.bg_tiles.used[16]);
    assert(manager.bg_tiles.used[32]);
}

void test_resource_bank_cache_prune_filters_by_kind_and_priority() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[3] = {};
    gbs::ResourceBankCache cache { entries, 3, 0 };

    const gbs::ResourceBank low_obj {
        gbs::ResourcePoolKind::ObjTiles,
        0,
        8,
        1,
        "low_obj",
    };
    const gbs::ResourceBank high_obj {
        gbs::ResourcePoolKind::ObjTiles,
        16,
        8,
        1,
        "high_obj",
    };
    const gbs::ResourceBank low_palette {
        gbs::ResourcePoolKind::ObjPalette,
        0,
        16,
        16,
        "low_palette",
    };

    assert(gbs::reserve_resource_bank_cached(manager, cache, low_obj, 2, 10).success);
    assert(gbs::reserve_resource_bank_cached(manager, cache, high_obj, 9, 10).success);
    assert(gbs::reserve_resource_bank_cached(manager, cache, low_palette, 1, 10).success);

    const gbs::ResourceBankCachePrunePolicy policy {
        100,
        0,
        5,
        gbs::ResourcePoolKind::ObjTiles,
        true,
        true,
    };
    gbs::ResourceBankCachePruneResult result = gbs::prune_resource_bank_cache(manager, cache, policy);

    assert(result.success);
    assert(result.pruned_count == 1);
    assert(result.released_count == 8);
    assert(!cache.entries[0].active);
    assert(cache.entries[1].active);
    assert(cache.entries[2].active);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 8);
    assert(gbs::resource_pool_used_count(manager.obj_palette) == 16);
}

void test_resource_bank_cache_prune_preview_does_not_mutate_cache_or_manager() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    gbs::ResourceBankCacheEntry entries[4] = {};
    gbs::ResourceBankCache cache { entries, 4, 0 };

    const gbs::ResourceBank stale {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        8,
        1,
        "stale_bg",
    };
    const gbs::ResourceBank fresh {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        8,
        1,
        "fresh_bg",
    };
    const gbs::ResourceBank locked {
        gbs::ResourcePoolKind::ObjTiles,
        0xFFFF,
        4,
        1,
        "locked_obj",
    };

    assert(gbs::reserve_resource_bank_cached(manager, cache, stale, 2, 10).success);
    assert(gbs::reserve_resource_bank_cached(manager, cache, fresh, 2, 90).success);
    gbs::ResourceBankCacheResult locked_result = gbs::reserve_resource_bank_cached(manager, cache, locked, 1, 5);
    assert(locked_result.success);
    assert(gbs::set_resource_bank_cache_locked(cache, locked_result.entry_index, true));

    const gbs::ResourceBankCachePrunePolicy policy {
        100,
        50,
        5,
        gbs::ResourcePoolKind::BgTiles,
        false,
        true,
    };

    const gbs::ResourceBankCachePrunePreview preview = gbs::preview_resource_bank_cache_prune(cache, policy);
    assert(preview.valid);
    assert(preview.active_count == 3);
    assert(preview.locked_count == 1);
    assert(preview.prunable_count == 1);
    assert(preview.releasable_count == 8);
    assert(cache.entries[0].active);
    assert(cache.entries[1].active);
    assert(cache.entries[2].active);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 4);
}

void test_resource_prefetch_priority_tracks_camera_distance() {
    const gbs::Rect near_area { 96, 96, 32, 32 };
    const gbs::Rect far_area { 512, 96, 32, 32 };
    const gbs::Vec2i camera { 112, 112 };

    const uint8_t near_priority = gbs::resource_bank_prefetch_priority_for_area(near_area, camera, 220, 20, 256);
    const uint8_t far_priority = gbs::resource_bank_prefetch_priority_for_area(far_area, camera, 220, 20, 256);
    const uint8_t zero_falloff = gbs::resource_bank_prefetch_priority_for_area(far_area, camera, 180, 10, 0);

    assert(near_priority == 220);
    assert(far_priority == 20);
    assert(zero_falloff == 180);
}

void test_resource_prefetch_window_detects_expanded_overlap() {
    const gbs::ResourceBankPrefetchWindow window {
        gbs::Rect { 64, 64, 128, 96 },
        16,
        true,
    };

    assert(gbs::resource_bank_prefetch_area_overlaps_window(gbs::Rect { 40, 80, 16, 16 }, window));
    assert(gbs::resource_bank_prefetch_area_overlaps_window(gbs::Rect { 192, 160, 8, 8 }, window));
    assert(!gbs::resource_bank_prefetch_area_overlaps_window(gbs::Rect { 0, 0, 16, 16 }, window));
    assert(!gbs::resource_bank_prefetch_area_overlaps_window(gbs::Rect { 240, 200, 16, 16 }, window));

    const gbs::ResourceBankPrefetchWindow disabled {
        gbs::Rect { 64, 64, 128, 96 },
        0,
        false,
    };
    assert(gbs::resource_bank_prefetch_area_overlaps_window(gbs::Rect { 0, 0, 16, 16 }, disabled));
}

void test_resource_prefetch_reserves_reuses_and_locks_cache_entries() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[3] = {};
    gbs::ResourceBankCache cache { entries, 3, 0 };

    const gbs::ResourceBank room_bg {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        16,
        8,
        "room_bg",
    };
    const gbs::ResourceBank actor_obj {
        gbs::ResourcePoolKind::ObjTiles,
        0xFFFF,
        8,
        4,
        "actor_obj",
    };
    const gbs::ResourceBankPrefetchRequest requests[] = {
        gbs::ResourceBankPrefetchRequest { &room_bg, gbs::Rect { 0, 0, 240, 160 }, 220, 32, 256, true },
        gbs::ResourceBankPrefetchRequest { &actor_obj, gbs::Rect { 256, 0, 64, 64 }, 180, 24, 512, false },
        gbs::ResourceBankPrefetchRequest { nullptr, gbs::Rect { 0, 0, 0, 0 }, 180, 24, 512, false },
    };

    gbs::ResourceBankPrefetchResult first = gbs::prefetch_resource_banks_for_camera(
        manager,
        cache,
        requests,
        3,
        gbs::Vec2i { 120, 80 },
        10
    );

    assert(first.success);
    assert(first.reserved_count == 2);
    assert(first.reused_count == 0);
    assert(first.skipped_count == 1);
    assert(first.uploaded_count == 0);
    assert(cache.count == 2);
    assert(cache.entries[0].locked);
    assert(cache.entries[0].last_used_tick == 10);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 8);

    gbs::ResourceBankPrefetchResult second = gbs::prefetch_resource_banks_for_camera(
        manager,
        cache,
        requests,
        2,
        gbs::Vec2i { 120, 80 },
        20
    );

    assert(second.success);
    assert(second.reserved_count == 0);
    assert(second.reused_count == 2);
    assert(second.uploaded_count == 0);
    assert(cache.count == 2);
    assert(cache.entries[0].last_used_tick == 20);
    assert(cache.entries[1].last_used_tick == 20);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 8);
}

void test_resource_prefetch_window_skips_outside_requests() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[3] = {};
    gbs::ResourceBankCache cache { entries, 3, 0 };

    const gbs::ResourceBank visible_bank {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        8,
        4,
        "visible_bg",
    };
    const gbs::ResourceBank outside_bank {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        8,
        4,
        "outside_bg",
    };
    const gbs::ResourceBankPrefetchRequest requests[] = {
        gbs::ResourceBankPrefetchRequest { &visible_bank, gbs::Rect { 80, 80, 32, 32 }, 220, 32, 256, false },
        gbs::ResourceBankPrefetchRequest { &outside_bank, gbs::Rect { 640, 640, 32, 32 }, 220, 32, 256, false },
    };
    const gbs::ResourceBankPrefetchWindow window {
        gbs::Rect { 64, 64, 160, 112 },
        16,
        true,
    };

    gbs::ResourceBankPrefetchResult result = gbs::prefetch_resource_banks_for_camera_window(
        manager,
        cache,
        requests,
        2,
        gbs::Vec2i { 120, 80 },
        10,
        window
    );

    assert(result.success);
    assert(result.reserved_count == 1);
    assert(result.reused_count == 0);
    assert(result.skipped_count == 1);
    assert(cache.count == 1);
    assert(gbs::resource_bank_name_equals(cache.entries[0].reservation.name, "visible_bg"));
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
}

void test_resource_prefetch_policy_limits_new_reservations_without_blocking_reuse() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[4] = {};
    gbs::ResourceBankCache cache { entries, 4, 0 };

    const gbs::ResourceBank resident {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        4,
        4,
        "resident_bg",
    };
    const gbs::ResourceBank first_new {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        4,
        4,
        "first_new_bg",
    };
    const gbs::ResourceBank second_new {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        4,
        4,
        "second_new_bg",
    };
    assert(gbs::reserve_resource_bank_cached(manager, cache, resident, 100, 1).success);

    const gbs::ResourceBankPrefetchRequest requests[] = {
        gbs::ResourceBankPrefetchRequest { &resident, gbs::Rect { 0, 0, 32, 32 }, 220, 32, 256, false },
        gbs::ResourceBankPrefetchRequest { &first_new, gbs::Rect { 32, 0, 32, 32 }, 220, 32, 256, false },
        gbs::ResourceBankPrefetchRequest { &second_new, gbs::Rect { 64, 0, 32, 32 }, 220, 32, 256, false },
    };
    const gbs::ResourceBankPrefetchPolicy policy {
        1,
        0,
        true,
    };

    gbs::ResourceBankPrefetchResult result = gbs::prefetch_resource_banks_for_camera_policy(
        manager,
        cache,
        requests,
        3,
        gbs::Vec2i { 16, 16 },
        10,
        policy
    );

    assert(result.success);
    assert(result.reused_count == 1);
    assert(result.reserved_count == 1);
    assert(result.skipped_count == 1);
    assert(cache.count == 2);
    assert(cache.entries[0].last_used_tick == 10);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
    assert(gbs::resource_bank_name_equals(cache.entries[1].reservation.name, "first_new_bg"));
}

void test_resource_prefetch_fails_without_mutating_cache_when_priority_cannot_evict() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[1] = {};
    gbs::ResourceBankCache cache { entries, 1, 0 };

    const gbs::ResourceBank resident {
        gbs::ResourcePoolKind::BgTiles,
        0,
        16,
        1,
        "resident",
    };
    const gbs::ResourceBank incoming {
        gbs::ResourcePoolKind::BgTiles,
        8,
        16,
        1,
        "incoming",
    };

    assert(gbs::reserve_resource_bank_cached(manager, cache, resident, 200, 1).success);
    const gbs::ResourceBankPrefetchRequest request {
        &incoming,
        gbs::Rect { 1024, 0, 16, 16 },
        180,
        20,
        128,
        false,
    };

    gbs::ResourceBankPrefetchResult result = gbs::prefetch_resource_banks_for_camera(
        manager,
        cache,
        &request,
        1,
        gbs::Vec2i { 0, 0 },
        2
    );

    assert(!result.success);
    assert(result.request_index == 0);
    assert(result.reserved_count == 0);
    assert(result.uploaded_count == 0);
    assert(cache.count == 1);
    assert(cache.entries[0].active);
    assert(cache.entries[0].priority == 200);
    assert(gbs::resource_bank_name_equals(cache.entries[0].reservation.name, "resident"));
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 16);
    assert(manager.bg_tiles.used[0]);
    assert(!manager.bg_tiles.used[16]);
}

void test_resource_prefetch_with_uploads_enqueues_only_new_banks() {
    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[3] = {};
    gbs::ResourceBankCache cache { entries, 3, 0 };

    const uint8_t tile_data[32] = {};
    const uint16_t palette_data[16] = {};
    const gbs::ResourceBank room_tiles {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        1,
        1,
        "room_tiles",
    };
    const gbs::ResourceBank room_palette {
        gbs::ResourcePoolKind::BgPalette,
        0xFFFF,
        16,
        16,
        "room_palette",
    };
    const gbs::ResourceBankPrefetchRequest requests[] = {
        gbs::ResourceBankPrefetchRequest { &room_tiles, gbs::Rect { 0, 0, 240, 160 }, 220, 32, 256, true },
        gbs::ResourceBankPrefetchRequest { &room_palette, gbs::Rect { 0, 0, 240, 160 }, 220, 32, 256, false },
    };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "room_tiles", tile_data },
        gbs::ResourceBankUploadSource { "room_palette", palette_data },
    };

    gbs::ResourceBankPrefetchResult first = gbs::prefetch_resource_banks_for_camera_with_uploads(
        manager,
        cache,
        requests,
        2,
        gbs::Vec2i { 120, 80 },
        10,
        sources,
        2
    );

    assert(first.success);
    assert(first.reserved_count == 2);
    assert(first.reused_count == 0);
    assert(first.uploaded_count == 2);
    assert(gbs::dma_vblank_queue_count() == 2);
    assert(cache.entries[0].locked);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 1);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 16);

    gbs::ResourceBankPrefetchResult second = gbs::prefetch_resource_banks_for_camera_with_uploads(
        manager,
        cache,
        requests,
        2,
        gbs::Vec2i { 120, 80 },
        20,
        sources,
        2
    );

    assert(second.success);
    assert(second.reserved_count == 0);
    assert(second.reused_count == 2);
    assert(second.uploaded_count == 0);
    assert(gbs::dma_vblank_queue_count() == 2);
    assert(cache.entries[0].last_used_tick == 20);
    assert(cache.entries[1].last_used_tick == 20);
}

void test_resource_prefetch_window_with_uploads_ignores_missing_source_outside_window() {
    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[2] = {};
    gbs::ResourceBankCache cache { entries, 2, 0 };

    const uint8_t tile_data[32] = {};
    const gbs::ResourceBank visible_bank {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        1,
        1,
        "visible_tiles",
    };
    const gbs::ResourceBank outside_missing_source {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        1,
        1,
        "outside_missing_tiles",
    };
    const gbs::ResourceBankPrefetchRequest requests[] = {
        gbs::ResourceBankPrefetchRequest { &visible_bank, gbs::Rect { 80, 80, 32, 32 }, 220, 32, 256, false },
        gbs::ResourceBankPrefetchRequest { &outside_missing_source, gbs::Rect { 640, 640, 32, 32 }, 220, 32, 256, false },
    };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "visible_tiles", tile_data },
    };
    const gbs::ResourceBankPrefetchWindow window {
        gbs::Rect { 64, 64, 160, 112 },
        16,
        true,
    };

    gbs::ResourceBankPrefetchResult result = gbs::prefetch_resource_banks_for_camera_window_with_uploads(
        manager,
        cache,
        requests,
        2,
        gbs::Vec2i { 120, 80 },
        10,
        window,
        sources,
        1
    );

    assert(result.success);
    assert(result.reserved_count == 1);
    assert(result.skipped_count == 1);
    assert(result.uploaded_count == 1);
    assert(gbs::dma_vblank_queue_count() == 1);
    assert(cache.count == 1);
    assert(gbs::resource_bank_name_equals(cache.entries[0].reservation.name, "visible_tiles"));
}

void test_resource_prefetch_policy_limits_uploads_and_ignores_missing_sources_after_budget() {
    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[3] = {};
    gbs::ResourceBankCache cache { entries, 3, 0 };

    const uint8_t tile_data[32] = {};
    const gbs::ResourceBank first {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        1,
        1,
        "first_tiles",
    };
    const gbs::ResourceBank second_missing_source {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        1,
        1,
        "second_missing_tiles",
    };
    const gbs::ResourceBankPrefetchRequest requests[] = {
        gbs::ResourceBankPrefetchRequest { &first, gbs::Rect { 0, 0, 32, 32 }, 220, 32, 256, false },
        gbs::ResourceBankPrefetchRequest { &second_missing_source, gbs::Rect { 32, 0, 32, 32 }, 220, 32, 256, false },
    };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "first_tiles", tile_data },
    };
    const gbs::ResourceBankPrefetchPolicy policy {
        2,
        1,
        true,
    };

    gbs::ResourceBankPrefetchResult result = gbs::prefetch_resource_banks_for_camera_with_uploads_policy(
        manager,
        cache,
        requests,
        2,
        gbs::Vec2i { 16, 16 },
        10,
        sources,
        1,
        policy
    );

    assert(result.success);
    assert(result.reserved_count == 1);
    assert(result.uploaded_count == 1);
    assert(result.skipped_count == 1);
    assert(cache.count == 1);
    assert(gbs::resource_bank_name_equals(cache.entries[0].reservation.name, "first_tiles"));
    assert(gbs::dma_vblank_queue_count() == 1);
}

void test_resource_prefetch_with_uploads_rejects_missing_source_without_mutation() {
    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[1] = {};
    gbs::ResourceBankCache cache { entries, 1, 0 };

    const uint8_t tile_data[32] = {};
    const gbs::ResourceBank missing {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        1,
        1,
        "missing_tiles",
    };
    const gbs::ResourceBankPrefetchRequest request {
        &missing,
        gbs::Rect { 0, 0, 240, 160 },
        220,
        32,
        256,
        false,
    };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "other_tiles", tile_data },
    };

    gbs::ResourceBankPrefetchResult result = gbs::prefetch_resource_banks_for_camera_with_uploads(
        manager,
        cache,
        &request,
        1,
        gbs::Vec2i { 120, 80 },
        10,
        sources,
        1
    );

    assert(!result.success);
    assert(result.request_index == 0);
    assert(result.reserved_count == 0);
    assert(result.uploaded_count == 0);
    assert(cache.count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::dma_vblank_queue_count() == 0);
}

void test_resource_prefetch_with_uploads_rejects_full_dma_queue_before_mutation() {
    gbs::dma_reset_vblank_queue();
    for (size_t index = 0; index < gbs::dma_vblank_queue_capacity; ++index) {
        const uint16_t value = 0;
        assert(gbs::dma_enqueue_vblank(gbs::DmaTransfer { &value, reinterpret_cast<volatile void*>(0x06000000), 1, gbs::DmaWidth::Halfword }));
    }

    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[1] = {};
    gbs::ResourceBankCache cache { entries, 1, 0 };

    const uint8_t tile_data[32] = {};
    const gbs::ResourceBank bank {
        gbs::ResourcePoolKind::BgTiles,
        0xFFFF,
        1,
        1,
        "room_tiles",
    };
    const gbs::ResourceBankPrefetchRequest request {
        &bank,
        gbs::Rect { 0, 0, 240, 160 },
        220,
        32,
        256,
        false,
    };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "room_tiles", tile_data },
    };

    gbs::ResourceBankPrefetchResult result = gbs::prefetch_resource_banks_for_camera_with_uploads(
        manager,
        cache,
        &request,
        1,
        gbs::Vec2i { 120, 80 },
        10,
        sources,
        1
    );

    assert(!result.success);
    assert(result.reserved_count == 0);
    assert(result.uploaded_count == 0);
    assert(cache.count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::dma_vblank_queue_count() == gbs::dma_vblank_queue_capacity);
    gbs::dma_reset_vblank_queue();
}

void test_resource_bank_cache_promotes_group_to_active_reservation() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[2] = {};
    gbs::ResourceBankCache cache { entries, 2, 0 };

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 0xFFFF, 4, 4, "room_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgPalette, 0xFFFF, 16, 16, "room_palette" },
    };
    const gbs::ResourceBankGroup group { "room_cached", banks, 2 };
    assert(gbs::reserve_resource_bank_cached(manager, cache, banks[0], 200, 10).success);
    assert(gbs::reserve_resource_bank_cached(manager, cache, banks[1], 200, 10).success);
    assert(gbs::resource_bank_cache_contains_group(cache, group));

    gbs::ResourceBankReservation active_buffer[2] = {};
    gbs::ResourceBankBatchReservation active { active_buffer, 2, 0, nullptr, false };
    gbs::ResourceBankCacheGroupResult result = gbs::promote_resource_bank_group_from_cache(cache, group, active);

    assert(result.success);
    assert(result.promoted_count == 2);
    assert(result.group_name == group.name);
    assert(result.missing_bank_name == nullptr);
    assert(active.success);
    assert(active.group_name == group.name);
    assert(active.reservation_count == 2);
    assert(!cache.entries[0].active);
    assert(!cache.entries[1].active);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 4);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 16);
    assert(gbs::release_resource_bank_group(manager, active));
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);
}

void test_resource_bank_cache_promotion_fails_without_mutation_when_missing_bank() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    gbs::ResourceBankCacheEntry entries[2] = {};
    gbs::ResourceBankCache cache { entries, 2, 0 };

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 8, 8, "actors_obj" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjPalette, 0xFFFF, 16, 16, "actors_palette" },
    };
    const gbs::ResourceBankGroup group { "actors", banks, 2 };
    assert(gbs::reserve_resource_bank_cached(manager, cache, banks[0], 200, 10).success);

    gbs::ResourceBankReservation active_buffer[2] = {};
    gbs::ResourceBankBatchReservation active { active_buffer, 2, 0, nullptr, false };
    gbs::ResourceBankCacheGroupResult result = gbs::promote_resource_bank_group_from_cache(cache, group, active);

    assert(!result.success);
    assert(gbs::resource_bank_name_equals(result.missing_bank_name, "actors_palette"));
    assert(result.promoted_count == 0);
    assert(!active.success);
    assert(active.reservation_count == 0);
    assert(cache.entries[0].active);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 8);
    assert(gbs::resource_pool_used_count(manager.obj_palette) == 0);
}

void test_resource_bank_cache_hot_swap_promotes_cached_group() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank active_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 16, 4, 4, "room_a_bg" },
    };
    const gbs::ResourceBankGroup active_group { "room_a", active_banks, 1 };
    gbs::ResourceBankReservation active_buffer[2] = {};
    gbs::ResourceBankBatchReservation active { active_buffer, 2, 0, nullptr, false };
    assert(gbs::reserve_resource_bank_group(manager, active_group, active));

    gbs::ResourceBankCacheEntry entries[2] = {};
    gbs::ResourceBankCache cache { entries, 2, 0 };
    const gbs::ResourceBank cached_banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 64, 8, 8, "room_b_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, 6, 2, "room_b_obj" },
    };
    const gbs::ResourceBankGroup cached_group { "room_b", cached_banks, 2 };
    assert(gbs::reserve_resource_bank_cached(manager, cache, cached_banks[0], 220, 20).success);
    assert(gbs::reserve_resource_bank_cached(manager, cache, cached_banks[1], 220, 20).success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 12);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 6);

    gbs::ResourceBankCacheGroupResult result = gbs::hot_swap_resource_bank_group_from_cache(manager, active, cache, cached_group);

    assert(result.success);
    assert(result.promoted_count == 2);
    assert(active.success);
    assert(active.group_name == cached_group.name);
    assert(active.reservation_count == 2);
    assert(active.reservations[0].reservation.start == 64);
    assert(active.reservations[1].reservation.count == 6);
    assert(!cache.entries[0].active);
    assert(!cache.entries[1].active);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 6);
    assert(!manager.bg_tiles.used[16]);
    assert(manager.bg_tiles.used[64]);
}

void test_release_resource_bank_cache_reclaims_all_active_reservations() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    gbs::ResourceBankCacheEntry entries[3] = {};
    gbs::ResourceBankCache cache { entries, 3, 0 };
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 32, 8, 8, "cached_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 16, 4, 4, "cached_obj" },
    };
    assert(gbs::reserve_resource_bank_cached(manager, cache, banks[0], 100, 1).success);
    assert(gbs::reserve_resource_bank_cached(manager, cache, banks[1], 100, 1).success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 8);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 4);

    assert(gbs::release_resource_bank_cache(manager, cache));
    assert(cache.count == 0);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);
    assert(!entries[0].active);
    assert(!entries[1].active);
}

void test_resource_bank_stream_with_uploads_enqueues_dma_sources() {
    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[32] = {};
    const uint16_t palette_data[16] = {};
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 32, 1, 1, "room_bg_tiles" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgPalette, 16, 16, 16, "room_bg_palette" },
    };
    const gbs::ResourceBankGroup group { "room_0", banks, 2 };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "room_bg_tiles", tile_data },
        gbs::ResourceBankUploadSource { "room_bg_palette", palette_data },
    };
    gbs::ResourceBankReservation active_buffer[2] = {};
    gbs::ResourceBankReservation scratch_buffer[2] = {};
    gbs::ResourceBankBatchReservation active { active_buffer, 2, 0, nullptr, false };
    gbs::ResourceBankBatchReservation scratch { scratch_buffer, 2, 0, nullptr, false };

    gbs::ResourceStreamResult result = gbs::stream_resource_bank_group_with_uploads(
        manager,
        active,
        scratch,
        group,
        sources,
        2
    );

    assert(result.success);
    assert(result.status == gbs::ResourceStreamStatus::Ok);
    assert(result.group_name == group.name);
    assert(result.uploaded_count == 2);
    assert(result.changed_group);
    assert(active.success);
    assert(active.group_name == group.name);
    assert(gbs::dma_vblank_queue_count() == 2);
    assert(gbs::dma_vblank_queue_stats().submitted == 2);

    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager wide_scene_manager;
    gbs::init_resource_manager(wide_scene_manager);
    constexpr size_t wide_scene_upload_count = 24;
    gbs::ResourceBank wide_scene_banks[wide_scene_upload_count] = {};
    for (size_t index = 0; index < wide_scene_upload_count; ++index) {
        wide_scene_banks[index] = gbs::ResourceBank {
            gbs::ResourcePoolKind::BgTiles,
            static_cast<uint16_t>(index),
            1,
            1,
            "wide_scene_bg_tiles"
        };
    }
    const gbs::ResourceBankGroup wide_scene_group {
        "wide_scene",
        wide_scene_banks,
        wide_scene_upload_count
    };
    const gbs::ResourceBankUploadSource wide_scene_sources[] = {
        gbs::ResourceBankUploadSource { "wide_scene_bg_tiles", tile_data },
    };
    gbs::ResourceBankReservation wide_scene_active_buffer[wide_scene_upload_count] = {};
    gbs::ResourceBankReservation wide_scene_scratch_buffer[wide_scene_upload_count] = {};
    gbs::ResourceBankBatchReservation wide_scene_active {
        wide_scene_active_buffer,
        wide_scene_upload_count,
        0,
        nullptr,
        false
    };
    gbs::ResourceBankBatchReservation wide_scene_scratch {
        wide_scene_scratch_buffer,
        wide_scene_upload_count,
        0,
        nullptr,
        false
    };

    gbs::ResourceStreamResult wide_scene_result = gbs::stream_resource_bank_group_with_uploads(
        wide_scene_manager,
        wide_scene_active,
        wide_scene_scratch,
        wide_scene_group,
        wide_scene_sources,
        1
    );

    assert(wide_scene_result.success);
    assert(wide_scene_result.uploaded_count == wide_scene_upload_count);
    assert(gbs::dma_vblank_queue_count() == wide_scene_upload_count);
}

void test_resource_bank_stream_with_uploads_skips_oam_upload_source() {
    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[64] = {};
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::OamSprites, 0, 4, 4, "player_oam_sprites" },
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0, 2, 1, "player_obj_tiles" },
    };
    const gbs::ResourceBankGroup group { "room_0", banks, 2 };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "player_obj_tiles", tile_data },
    };
    gbs::ResourceBankReservation active_buffer[2] = {};
    gbs::ResourceBankReservation scratch_buffer[2] = {};
    gbs::ResourceBankBatchReservation active { active_buffer, 2, 0, nullptr, false };
    gbs::ResourceBankBatchReservation scratch { scratch_buffer, 2, 0, nullptr, false };

    gbs::ResourceStreamResult result = gbs::stream_resource_bank_group_with_uploads(
        manager,
        active,
        scratch,
        group,
        sources,
        1
    );

    assert(result.success);
    assert(result.status == gbs::ResourceStreamStatus::Ok);
    assert(result.uploaded_count == 1);
    assert(active.success);
    assert(gbs::resource_pool_used_count(manager.oam_sprites) == 4);
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 2);
    assert(gbs::dma_vblank_queue_count() == 1);
}

void test_resource_bank_stream_rejects_missing_upload_source_without_mutation() {
    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[32] = {};
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 64, 1, 1, "room_bg_tiles" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgPalette, 32, 16, 16, "room_bg_palette" },
    };
    const gbs::ResourceBankGroup group { "room_missing", banks, 2 };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "room_bg_tiles", tile_data },
    };
    gbs::ResourceBankReservation active_buffer[2] = {};
    gbs::ResourceBankReservation scratch_buffer[2] = {};
    gbs::ResourceBankBatchReservation active { active_buffer, 2, 0, nullptr, false };
    gbs::ResourceBankBatchReservation scratch { scratch_buffer, 2, 0, nullptr, false };

    gbs::ResourceStreamResult result = gbs::stream_resource_bank_group_with_uploads(
        manager,
        active,
        scratch,
        group,
        sources,
        1
    );

    assert(!result.success);
    assert(result.status == gbs::ResourceStreamStatus::MissingUploadSource);
    assert(gbs::resource_bank_name_equals(result.bank_name, "room_bg_palette"));
    assert(result.requested_count == 16);
    assert(!active.success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);
    assert(gbs::dma_vblank_queue_count() == 0);
}

void test_resource_bank_stream_rejects_full_dma_queue_before_swap() {
    gbs::dma_reset_vblank_queue();
    const uint16_t filler_source = 0;
    volatile uint16_t filler_destination = 0;
    for (size_t index = 0; index < gbs::dma_vblank_queue_capacity - 1; ++index) {
        assert(gbs::dma_enqueue_vblank16(&filler_source, &filler_destination, 1));
    }

    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const uint8_t tile_data[32] = {};
    const uint16_t palette_data[16] = {};
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 80, 1, 1, "room_bg_tiles" },
        gbs::ResourceBank { gbs::ResourcePoolKind::BgPalette, 48, 16, 16, "room_bg_palette" },
    };
    const gbs::ResourceBankGroup group { "room_queue_full", banks, 2 };
    const gbs::ResourceBankUploadSource sources[] = {
        gbs::ResourceBankUploadSource { "room_bg_tiles", tile_data },
        gbs::ResourceBankUploadSource { "room_bg_palette", palette_data },
    };
    gbs::ResourceBankReservation active_buffer[2] = {};
    gbs::ResourceBankReservation scratch_buffer[2] = {};
    gbs::ResourceBankBatchReservation active { active_buffer, 2, 0, nullptr, false };
    gbs::ResourceBankBatchReservation scratch { scratch_buffer, 2, 0, nullptr, false };

    gbs::ResourceStreamResult result = gbs::stream_resource_bank_group_with_uploads(
        manager,
        active,
        scratch,
        group,
        sources,
        2
    );

    assert(!result.success);
    assert(result.status == gbs::ResourceStreamStatus::DmaQueueFull);
    assert(!active.success);
    assert(gbs::resource_pool_used_count(manager.bg_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.bg_palette) == 0);
    assert(gbs::dma_vblank_queue_count() == gbs::dma_vblank_queue_capacity - 1);
}

void test_resource_bank_stream_reports_overflow_bank_and_usage() {
    gbs::dma_reset_vblank_queue();
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);

    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjTiles, 0xFFFF, gbs::max_obj_tiles + 1, 1, "too_many_obj_tiles" },
    };
    const gbs::ResourceBankGroup group { "room_overflow", banks, 1 };
    gbs::ResourceBankReservation active_buffer[1] = {};
    gbs::ResourceBankReservation scratch_buffer[1] = {};
    gbs::ResourceBankBatchReservation active { active_buffer, 1, 0, nullptr, false };
    gbs::ResourceBankBatchReservation scratch { scratch_buffer, 1, 0, nullptr, false };

    gbs::ResourceStreamResult result = gbs::stream_resource_bank_group_with_uploads(
        manager,
        active,
        scratch,
        group,
        nullptr,
        0
    );

    assert(!result.success);
    assert(result.status == gbs::ResourceStreamStatus::ReservationFailed);
    assert(gbs::resource_bank_name_equals(result.bank_name, "too_many_obj_tiles"));
    assert(result.kind == gbs::ResourcePoolKind::ObjTiles);
    assert(result.requested_count == gbs::max_obj_tiles + 1);
    assert(result.usage.capacity == gbs::max_obj_tiles);
    assert(result.usage.remaining == gbs::max_obj_tiles);
    assert(!active.success);
}

void test_resource_leases_release_banks_and_groups_automatically() {
    gbs::EngineResourceManager manager;
    gbs::init_resource_manager(manager);
    const gbs::ResourceBank bank {
        gbs::ResourcePoolKind::ObjTiles,
        gbs::automatic_resource_bank_start,
        4,
        2,
        "lease_obj_tiles",
    };
    {
        gbs::ResourceBankLease lease(manager, bank);
        assert(lease.valid());
        assert(gbs::resource_pool_used_count(manager.obj_tiles) == 4);
    }
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);

    const gbs::ResourceBank banks[] = {
        bank,
        gbs::ResourceBank { gbs::ResourcePoolKind::ObjPalette, 32, 16, 16, "lease_obj_palette" },
    };
    const gbs::ResourceBankGroup group { "lease_group", banks, 2 };
    gbs::ResourceBankReservation reservations[2] = {};
    {
        gbs::ResourceBankGroupLease lease(manager, group, reservations, 2);
        assert(lease.valid());
        assert(gbs::resource_pool_used_count(manager.obj_tiles) == 4);
        assert(gbs::resource_pool_used_count(manager.obj_palette) == 16);
        assert(lease.release());
        assert(lease.release());
    }
    assert(gbs::resource_pool_used_count(manager.obj_tiles) == 0);
    assert(gbs::resource_pool_used_count(manager.obj_palette) == 0);
}

} // namespace

int main() {
    test_fixed_range_reservation();
    test_overflow_fails_safely();
    test_next_range_respects_alignment();
    test_find_next_range_reports_fit_without_mutation();
    test_reset_clears_pool();
    test_release_range_reclaims_capacity();
    test_release_rejects_unreserved_or_invalid_ranges();
    test_engine_resource_manager_defaults();
    test_next_resource_manager_helpers();
    test_asset_reservations_follow_asset_ranges();
    test_pool_snapshot_restores_previous_usage();
    test_pool_snapshot_rejects_invalid_snapshot_without_mutation();
    test_manager_snapshot_rolls_back_multiple_pools();
    test_manager_snapshot_rejects_invalid_snapshot_without_mutation();
    test_resource_batch_reserves_room_assets();
    test_resource_batch_rolls_back_on_failure();
    test_resource_batch_rejects_small_output_buffers();
    test_resource_batch_release_reclaims_all_pools();
    test_resource_batch_release_rolls_back_on_failure();
    test_resource_batch_release_rejects_mismatched_counts();
    test_resource_usage_reports_largest_free_block();
    test_resource_usage_reports_free_block_count();
    test_engine_usage_reports_all_pools();
    test_engine_resident_usage_reports_counts_without_fragmentation_scan();
    test_resource_bank_fixed_and_auto_reservation();
    test_resource_bank_preview_reports_fit_without_mutation();
    test_resource_bank_rejects_bad_alignment_without_mutation();
    test_resource_bank_batch_rolls_back_on_failure();
    test_resource_bank_batch_preview_reports_transient_conflicts_without_mutation();
    test_resource_bank_batch_release_reclaims_all_pools();
    test_resource_bank_hot_swap_releases_active_and_reserves_next();
    test_resource_bank_hot_swap_rolls_back_when_next_fails();
    test_resource_bank_group_reserves_and_releases_named_group();
    test_resource_bank_group_preview_preserves_name_without_mutation();
    test_resource_bank_group_rolls_back_on_failure();
    test_resource_bank_group_hot_swap_preserves_group_name();
    test_resource_bank_group_stream_reserves_initial_group();
    test_resource_bank_group_stream_skips_same_group();
    test_resource_bank_group_stream_hot_swaps_between_groups();
    test_resource_bank_group_stream_rolls_back_on_failure();
    test_resource_bank_group_name_lookup_returns_expected_group();
    test_resource_bank_cache_evicts_lower_priority_bank();
    test_resource_bank_cache_respects_locked_and_higher_priority_banks();
    test_resource_bank_cache_rolls_back_when_eviction_cannot_fit();
    test_resource_bank_cache_prune_releases_stale_unlocked_entries();
    test_resource_bank_cache_prune_filters_by_kind_and_priority();
    test_resource_bank_cache_prune_preview_does_not_mutate_cache_or_manager();
    test_resource_prefetch_priority_tracks_camera_distance();
    test_resource_prefetch_window_detects_expanded_overlap();
    test_resource_prefetch_reserves_reuses_and_locks_cache_entries();
    test_resource_prefetch_window_skips_outside_requests();
    test_resource_prefetch_policy_limits_new_reservations_without_blocking_reuse();
    test_resource_prefetch_fails_without_mutating_cache_when_priority_cannot_evict();
    test_resource_prefetch_with_uploads_enqueues_only_new_banks();
    test_resource_prefetch_window_with_uploads_ignores_missing_source_outside_window();
    test_resource_prefetch_policy_limits_uploads_and_ignores_missing_sources_after_budget();
    test_resource_prefetch_with_uploads_rejects_missing_source_without_mutation();
    test_resource_prefetch_with_uploads_rejects_full_dma_queue_before_mutation();
    test_resource_bank_cache_promotes_group_to_active_reservation();
    test_resource_bank_cache_promotion_fails_without_mutation_when_missing_bank();
    test_resource_bank_cache_hot_swap_promotes_cached_group();
    test_release_resource_bank_cache_reclaims_all_active_reservations();
    test_resource_bank_stream_with_uploads_enqueues_dma_sources();
    test_resource_bank_stream_with_uploads_skips_oam_upload_source();
    test_resource_bank_stream_rejects_missing_upload_source_without_mutation();
    test_resource_bank_stream_rejects_full_dma_queue_before_swap();
    test_resource_bank_stream_reports_overflow_bank_and_usage();
    test_resource_leases_release_banks_and_groups_automatically();
    return 0;
}
