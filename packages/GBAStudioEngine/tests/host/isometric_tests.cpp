#include <cassert>
#include <cstdlib>
#include <initializer_list>
#include "gbs/event.hpp"
#include "gbs/isometric.hpp"

namespace gbs {

Sprite last_test_sprite {};
void set_sprite(int, const Sprite& sprite) { last_test_sprite = sprite; }
bool load_tiles(const TileAsset&) { return true; }

} // namespace gbs

namespace {

constexpr gbs::IsoGridConfig grid { 32, 16, gbs::Vec2i { 120, 16 } };

void test_iso_tile_to_screen_uses_2_to_1_projection() {
    gbs::Vec2i origin = gbs::iso_tile_to_screen(gbs::IsoCoord { 0, 0, 0 }, grid);
    gbs::Vec2i east = gbs::iso_tile_to_screen(gbs::IsoCoord { 1, 0, 0 }, grid);
    gbs::Vec2i south = gbs::iso_tile_to_screen(gbs::IsoCoord { 0, 1, 0 }, grid);
    gbs::Vec2i raised = gbs::iso_tile_to_screen(gbs::IsoCoord { 1, 1, 1 }, grid);

    assert(origin.x == 120 && origin.y == 16);
    assert(east.x == 136 && east.y == 24);
    assert(south.x == 104 && south.y == 24);
    assert(raised.x == 120 && raised.y == 24);
}

void test_iso_screen_to_tile_inverts_tile_centers() {
    gbs::Vec2i screen = gbs::iso_tile_to_screen(gbs::IsoCoord { 3, 2, 0 }, grid);
    gbs::IsoCoord tile = gbs::iso_screen_to_tile(screen, grid);

    assert(tile.x == 3);
    assert(tile.y == 2);
    assert(tile.z == 0);
}

void test_iso_depth_key_orders_back_to_front() {
    assert(gbs::iso_depth_key(gbs::IsoCoord { 0, 0, 0 }) < gbs::iso_depth_key(gbs::IsoCoord { 1, 0, 0 }));
    assert(gbs::iso_depth_key(gbs::IsoCoord { 1, 0, 0 }) == gbs::iso_depth_key(gbs::IsoCoord { 0, 1, 0 }));
    assert(gbs::iso_depth_key(gbs::IsoCoord { 1, 1, 4 }, grid) < gbs::iso_depth_key(gbs::IsoCoord { 1, 1, 0 }, grid));
    assert(gbs::iso_depth_key(gbs::IsoCoord { 2, 1, 1 }, grid) == gbs::iso_depth_key(gbs::IsoCoord { 1, 1, 0 }, grid));
}

void test_draw_iso_sprites_can_enable_object_mosaic() {
    const gbs::IsoDrawItem item {
        gbs::Vec2i { 8, 12 },
        3,
        1,
        0,
        0,
        true,
        false,
        0
    };
    gbs::draw_iso_sprites(&item, 1, 0, true);
    assert(gbs::last_test_sprite.mosaic);
}

void test_iso_metasprite_preserves_8bpp_through_draw_list() {
    const gbs::MetaSpritePart part { 0, 0, 2, 0, false, false, 8, 8, gbs::ColorDepth::Bpp8 };
    const gbs::MetaSprite metasprite { &part, 1 };
    gbs::IsoActor actor { gbs::IsoCoord { 0, 0, 0 }, gbs::Vec2i { 0, 0 }, 2, 0, true, false, 0 };
    actor.metasprite = &metasprite;
    const gbs::IsoCamera camera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false };
    gbs::IsoDrawItem item {};
    assert(gbs::build_iso_draw_list(&actor, 1, camera, &item, 1, grid) == 1);
    gbs::draw_iso_sprites(&item, 1);
    assert(gbs::last_test_sprite.color_depth == gbs::ColorDepth::Bpp8);
    assert(gbs::last_test_sprite.width == 8 && gbs::last_test_sprite.height == 8);
}

void test_iso_camera_follow_and_clamp() {
    gbs::IsoCamera camera {
        gbs::Vec2i { 0, 0 },
        gbs::Rect { 0, 0, 512, 256 },
        true
    };

    gbs::update_iso_camera_follow(camera, gbs::IsoCoord { 20, 8, 0 }, grid);

    assert(camera.position_pixels.x == 192);
    assert(camera.position_pixels.y == 96);

    gbs::update_iso_camera_follow(camera, gbs::IsoCoord { 0, 0, 0 }, grid);
    assert(camera.position_pixels.x == 0);
    assert(camera.position_pixels.y == 0);
}

void test_iso_tactical_surface_page_selection_uses_camera_center() {
    const gbs::IsoTacticalSurfacePage pages[] = {
        { nullptr, "arena-r0c0", gbs::Rect { 0, 0, 240, 160 } },
        { nullptr, "arena-r0c1", gbs::Rect { 240, 0, 240, 160 } },
        { nullptr, "arena-r1c0", gbs::Rect { 0, 160, 240, 160 } },
        { nullptr, "arena-r1c1", gbs::Rect { 240, 160, 240, 160 } },
    };

    assert(gbs::select_iso_tactical_surface_page(pages, 4, gbs::Vec2i { 0, 0 }, gbs::Vec2i { 240, 160 }) == 0);
    assert(gbs::select_iso_tactical_surface_page(pages, 4, gbs::Vec2i { 240, 0 }, gbs::Vec2i { 240, 160 }) == 1);
    assert(gbs::select_iso_tactical_surface_page(pages, 4, gbs::Vec2i { 0, 160 }, gbs::Vec2i { 240, 160 }) == 2);
    assert(gbs::iso_tactical_surface_page_scroll(pages[3], gbs::Vec2i { 300, 200 }).x == 60);
    assert(gbs::iso_tactical_surface_page_scroll(pages[3], gbs::Vec2i { 300, 200 }).y == 40);

    const gbs::IsoTacticalPresentationData presentation {
        0,
        nullptr,
        pages,
        4,
        1,
        32,
        nullptr,
        nullptr,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        0
    };
    const gbs::Vec2i aligned_camera = gbs::iso_tactical_surface_camera_position(
        presentation,
        gbs::Vec2i { 300, 200 }
    );
    assert(aligned_camera.x == 240 && aligned_camera.y == 160);
}

void test_iso_tactical_surface_camera_locks_visible_page_until_ready() {
    const gbs::IsoTacticalSurfacePage pages[] = {
        { nullptr, "arena-r0c0", gbs::Rect { 0, 0, 240, 160 } },
        { nullptr, "arena-r0c1", gbs::Rect { 240, 0, 240, 160 } },
    };
    const gbs::IsoTacticalPresentationData presentation {
        0,
        nullptr,
        pages,
        2,
        1,
        32,
        nullptr,
        nullptr,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        0
    };

    const gbs::Vec2i locked_camera = gbs::iso_tactical_surface_camera_position_with_page_lock(
        presentation,
        gbs::Vec2i { 240, 0 },
        0,
        false
    );
    assert(locked_camera.x == 0 && locked_camera.y == 0);

    const gbs::Vec2i committed_camera = gbs::iso_tactical_surface_camera_position_with_page_lock(
        presentation,
        gbs::Vec2i { 240, 0 },
        0,
        true
    );
    assert(committed_camera.x == 240 && committed_camera.y == 0);

    const gbs::Vec2i same_page_camera = gbs::iso_tactical_surface_camera_position_with_page_lock(
        presentation,
        gbs::Vec2i { 32, 16 },
        0,
        false
    );
    assert(same_page_camera.x == 0 && same_page_camera.y == 0);
}

void test_iso_camera_zone_uses_tile_area_and_pixel_camera_constraints() {
    const gbs::IsoGridConfig grid { 32, 16, gbs::Vec2i { 120, 16 } };
    gbs::IsoCamera camera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false };
    const gbs::IsoCameraZone zones[] = {
        gbs::IsoCameraZone {
            gbs::Rect { 2, 3, 4, 2 },
            gbs::Rect { 16, 24, 320, 192 },
            gbs::Vec2i { 6, -2 },
            true,
            true
        }
    };

    assert(gbs::apply_iso_camera_zones(camera, gbs::IsoCoord { 3, 4, 0 }, grid, zones, 1));
    assert(camera.bounds_enabled);
    assert(camera.position_pixels.x == 22);
    assert(camera.position_pixels.y == 24);
    camera = gbs::IsoCamera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false };
    camera.follow_enabled = true;
    camera.smoothing_x256 = 256;
    const gbs::Vec2i fractional_focus { 231, 111 };
    gbs::IsoCamera expected = camera;
    gbs::tick_iso_camera(expected, fractional_focus);
    gbs::apply_iso_camera_zones(camera, { 3, 4, 0 }, grid, nullptr, 0, &fractional_focus);
    assert(camera.position_pixels.x == expected.position_pixels.x);
    assert(camera.position_pixels.y == expected.position_pixels.y);
}

void test_iso_camera_zone_bounds_can_restore_base_room_bounds() {
    const gbs::IsoCamera base_camera {
        gbs::Vec2i { 96, 72 },
        gbs::Rect { -64, 32, 704, 384 },
        true
    };
    gbs::IsoCamera camera = base_camera;
    camera.bounds_enabled = true;
    camera.bounds_pixels = gbs::Rect { 120, 128, 160, 120 };
    camera.position_pixels = gbs::Vec2i { 184, 208 };

    gbs::restore_iso_camera_bounds(camera, base_camera);

    assert(camera.bounds_enabled == base_camera.bounds_enabled);
    assert(camera.bounds_pixels.x == base_camera.bounds_pixels.x);
    assert(camera.bounds_pixels.y == base_camera.bounds_pixels.y);
    assert(camera.bounds_pixels.width == base_camera.bounds_pixels.width);
    assert(camera.bounds_pixels.height == base_camera.bounds_pixels.height);
    assert(camera.position_pixels.x == 184);
    assert(camera.position_pixels.y == 208);
}

void test_iso_actor_direction_values_match_runtime_telemetry_contract() {
    assert(gbs::iso_actor_direction_value(gbs::IsoActorDirection::Down) == 0);
    assert(gbs::iso_actor_direction_value(gbs::IsoActorDirection::Up) == 1);
    assert(gbs::iso_actor_direction_value(gbs::IsoActorDirection::Left) == 2);
    assert(gbs::iso_actor_direction_value(gbs::IsoActorDirection::Right) == 3);
}

void test_iso_camera_projection_applies_zoom_around_viewport_center() {
    gbs::IsoCamera camera {
        gbs::Vec2i { 40, 20 },
        gbs::Rect { 0, 0, 0, 0 },
        false
    };
    camera.zoom_x256 = 512;
    camera.target_zoom_x256 = 512;

    const gbs::Vec2i world_center { 160, 100 };
    const gbs::Vec2i world_offset { 176, 108 };

    assert(gbs::iso_camera_world_to_screen(camera, world_center).x == 120);
    assert(gbs::iso_camera_world_to_screen(camera, world_center).y == 80);
    assert(gbs::iso_camera_world_to_screen(camera, world_offset).x == 152);
    assert(gbs::iso_camera_world_to_screen(camera, world_offset).y == 96);
    const gbs::Vec2i roundtrip = gbs::iso_camera_screen_to_world(
        camera,
        gbs::iso_camera_world_to_screen(camera, world_offset)
    );
    assert(roundtrip.x == world_offset.x);
    assert(roundtrip.y == world_offset.y);
}

void test_iso_camera_tick_supports_dead_zone_smoothing_pan_and_shake() {
    gbs::IsoCamera camera {
        gbs::Vec2i { 0, 0 },
        gbs::Rect { 0, 0, 640, 480 },
        true
    };
    camera.follow_enabled = true;
    camera.dead_zone_screen_pixels = gbs::Rect { 100, 60, 40, 40 };
    camera.smoothing_x256 = 128;
    camera.pan_offset_pixels = gbs::Vec2i { 8, -4 };
    camera.shake_strength_pixels = 3;
    camera.shake_frames_remaining = 2;
    camera.shake_seed = 7;

    gbs::tick_iso_camera(camera, gbs::Vec2i { 240, 120 });

    assert(camera.position_pixels.x == 50);
    assert(camera.position_pixels.y == 10);
    assert(camera.shake_frames_remaining == 1);
    assert(camera.shake_offset_pixels.x >= -3 && camera.shake_offset_pixels.x <= 3);
    assert(camera.shake_offset_pixels.y >= -3 && camera.shake_offset_pixels.y <= 3);

    const gbs::Vec2i projected = gbs::iso_camera_world_to_screen(camera, gbs::Vec2i { 170, 90 });
    assert(projected.x == 128 + camera.shake_offset_pixels.x);
    assert(projected.y == 76 + camera.shake_offset_pixels.y);
}

void test_build_iso_draw_list_applies_camera_and_offsets() {
    const gbs::IsoActor actors[] = {
        { gbs::IsoCoord { 2, 1, 0 }, gbs::Vec2i { -8, -16 }, 4, 1, true, false, 2 }
    };
    gbs::IsoCamera camera { gbs::Vec2i { 16, 8 }, gbs::Rect { 0, 0, 0, 0 }, false };
    gbs::IsoDrawItem items[1] = {};

    size_t count = gbs::build_iso_draw_list(actors, 1, camera, items, 1, grid);

    assert(count == 1);
    assert(items[0].screen_pixels.x == 112);
    assert(items[0].screen_pixels.y == 16);
    assert(items[0].tile_index == 4);
    assert(items[0].palette == 1);
    assert(items[0].priority == 2);
    assert(items[0].visible);
}

void test_build_iso_draw_list_expands_composite_actor_metasprite() {
    static constexpr gbs::MetaSpritePart parts[] = {
        gbs::MetaSpritePart { -16, -24, 10, 1, false, false, 32, 32 },
        gbs::MetaSpritePart { 16, -24, 26, 1, true, false, 16, 32 },
        gbs::MetaSpritePart { -16, 8, 42, 2, false, true, 32, 16 }
    };
    static constexpr gbs::MetaSprite metasprite { parts, 3 };
    const gbs::IsoActor actors[] = {
        { gbs::IsoCoord { 2, 1, 0 }, gbs::Vec2i { -24, -40 }, 10, 1, true, false, 2, 48, 48, true, &metasprite }
    };
    gbs::IsoDrawItem items[3] = {};

    const size_t count = gbs::build_iso_draw_list(actors, 1, gbs::IsoCamera { gbs::Vec2i { 16, 8 }, gbs::Rect { 0, 0, 0, 0 }, false }, items, 3, grid);

    assert(count == 3);
    assert(items[0].screen_pixels.x == 96 && items[0].screen_pixels.y == -8);
    assert(items[0].tile_index == 10 && items[0].width == 32 && items[0].height == 32);
    assert(!items[0].hflip && !items[0].vflip);
    assert(items[1].screen_pixels.x == 128 && items[1].screen_pixels.y == -8);
    assert(items[1].tile_index == 26 && items[1].hflip && !items[1].vflip);
    assert(items[2].screen_pixels.x == 96 && items[2].screen_pixels.y == 24);
    assert(items[2].tile_index == 42 && !items[2].hflip && items[2].vflip);
    assert(items[0].source_index == 0 && items[1].source_index == 0 && items[2].source_index == 0);
}

void test_build_iso_draw_list_culls_fully_offscreen_sprites() {
    const gbs::IsoActor actors[] = {
        { gbs::IsoCoord { 0, 0, 0 }, gbs::Vec2i { -152, -32 }, 4, 1, true, false, 2, 32, 32 }
    };
    gbs::IsoDrawItem items[1] = {};

    assert(gbs::build_iso_draw_list(
        actors,
        1,
        gbs::IsoCamera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false },
        items,
        1,
        grid
    ) == 0);

    const gbs::IsoActor partially_visible[] = {
        { gbs::IsoCoord { 0, 0, 0 }, gbs::Vec2i { -128, -32 }, 4, 1, true, false, 2, 32, 32 }
    };
    assert(gbs::build_iso_draw_list(
        partially_visible,
        1,
        gbs::IsoCamera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false },
        items,
        1,
        grid
    ) == 1);
}

void test_iso_surface_camera_snaps_only_at_native_scale_without_offsets() {
    gbs::IsoCamera camera { gbs::Vec2i { 17, -1 }, gbs::Rect { 0, 0, 0, 0 }, false };
    gbs::IsoCamera snapped = gbs::iso_surface_render_camera(camera);
    assert(snapped.position_pixels.x == 0);
    assert(snapped.position_pixels.y == -32);

    camera.position_pixels = gbs::Vec2i { 63, 31 };
    snapped = gbs::iso_surface_render_camera(camera);
    assert(snapped.position_pixels.x == 0);
    assert(snapped.position_pixels.y == 0);

    camera.position_pixels = gbs::Vec2i { 64, 32 };
    snapped = gbs::iso_surface_render_camera(camera);
    assert(snapped.position_pixels.x == 64);
    assert(snapped.position_pixels.y == 32);

    camera.position_pixels = gbs::Vec2i { 17, -1 };
    camera.zoom_x256 = 512;
    snapped = gbs::iso_surface_render_camera(camera);
    assert(snapped.position_pixels.x == 17);
    assert(snapped.position_pixels.y == -1);

    camera.zoom_x256 = 256;
    camera.pan_offset_pixels = gbs::Vec2i { 1, 0 };
    snapped = gbs::iso_surface_render_camera(camera);
    assert(snapped.position_pixels.x == 17);
    assert(snapped.position_pixels.y == -1);
}

uint8_t iso_surface_pixel(const uint8_t* surface, int x, int y) {
    const int tile_x = x / 8;
    const int tile_y = y / 8;
    const int pixel_x = x & 7;
    const int pixel_y = y & 7;
    const int tile_index = tile_y * 40 + tile_x;
    const uint8_t packed = surface[tile_index * 32 + pixel_y * 4 + pixel_x / 2];
    return (pixel_x & 1) == 0 ? packed & 0x0f : packed >> 4;
}

void test_authored_isometric_background_mode_is_explicit() {
    const uint16_t entries[] = { 0 };
    const gbs::TileMapAsset tilemap { entries, 1, 1 };
    gbs::IsometricRoomData room {};

    assert(!gbs::uses_authored_isometric_background(room));
    room.authored_background_tilemap = &tilemap;
    assert(!gbs::uses_authored_isometric_background(room));
    room.world_mode = gbs::IsoWorldMode::StaticComposition;
    assert(gbs::uses_authored_isometric_background(room));
}

void test_tactical_surface_can_fall_back_to_authored_background() {
    const uint16_t entries[] = { 0 };
    const gbs::TileMapAsset tilemap { entries, 1, 1 };
    gbs::IsometricRoomData room {};
    room.authored_background_tilemap = &tilemap;
    room.world_mode = gbs::IsoWorldMode::StaticComposition;
    gbs::IsoTacticalPresentationData presentation {};

    assert(gbs::uses_authored_isometric_background_as_tactical_surface_fallback(room, presentation));
    presentation.capability_mask = gbs::iso_tactical_capability_bit(gbs::IsoTacticalCapability::Surface);
    assert(!gbs::uses_authored_isometric_background_as_tactical_surface_fallback(room, presentation));
}

void test_render_iso_room_surface_scales_tiles_with_camera_zoom() {
    uint8_t unrelated_tile[32];
    uint8_t source_tile[32];
    for (uint8_t& value : unrelated_tile) {
        value = 0x11;
    }
    for (uint8_t& value : source_tile) {
        value = 0x22;
    }
    const uint16_t source_entries[] = { 0 };
    const gbs::TileMapAsset source_tilemap { source_entries, 1, 1 };
    const uint8_t visual_tiles[] = { 1 };
    const uint8_t collision[] = { 0 };
    gbs::IsometricRoomData room {};
    room.visual_tiles = visual_tiles;
    room.collision_flags = collision;
    room.width_tiles = 1;
    room.height_tiles = 1;
    room.grid = gbs::IsoGridConfig { 8, 8, gbs::Vec2i { 120, 80 } };
    room.tileset_tilemap = &source_tilemap;
    const gbs::TileAsset tiles[] = {
        gbs::TileAsset { unrelated_tile, 1, 0, false },
        gbs::TileAsset { source_tile, 1, 0, false }
    };
    room.tileset_tiles = &tiles[1];
    room.tileset_tile_width_pixels = 8;
    room.tileset_tile_height_pixels = 8;
    gbs::IsoCamera camera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false };
    camera.zoom_x256 = 512;
    camera.target_zoom_x256 = 512;
    uint8_t surface[40 * 24 * 32] = {};

    assert(gbs::render_iso_room_surface(room, camera, surface, sizeof(surface)));
    assert(iso_surface_pixel(surface, 112, 80) == 2);
    assert(iso_surface_pixel(surface, 127, 95) == 2);
    assert(iso_surface_pixel(surface, 111, 80) == 0);
    assert(iso_surface_pixel(surface, 128, 95) == 0);
}

void test_render_iso_room_surface_decodes_real_32x16_4bpp_diamond() {
    constexpr int logical_width = 32;
    constexpr int logical_height = 16;
    constexpr int subtiles_wide = logical_width / 8;
    constexpr int subtile_count = subtiles_wide * (logical_height / 8);
    uint8_t source_tiles[subtile_count * 32] = {};

    for (int y = 0; y < logical_height; ++y) {
        for (int x = 0; x < logical_width; ++x) {
            const int diamond_distance = std::abs((x * 2) - 31) + (2 * std::abs((y * 2) - 15));
            if (diamond_distance > 32) {
                continue;
            }
            const int subtile_x = x / 8;
            const int subtile_y = y / 8;
            const int subtile_index = subtile_y * subtiles_wide + subtile_x;
            const int pixel_x = x & 7;
            const int tile_offset = subtile_index * 32 + (y & 7) * 4 + pixel_x / 2;
            const uint8_t color = static_cast<uint8_t>(1 + subtile_index);
            if ((pixel_x & 1) == 0) {
                source_tiles[tile_offset] = static_cast<uint8_t>(source_tiles[tile_offset] | color);
            } else {
                source_tiles[tile_offset] = static_cast<uint8_t>(source_tiles[tile_offset] | (color << 4));
            }
        }
    }

    const uint16_t source_entries[] = { 1, 2, 3, 4, 5, 6, 7, 8 };
    const gbs::TileMapAsset source_tilemap { source_entries, 4, 2 };
    const gbs::TileAsset source_tile_asset { source_tiles, subtile_count, 1, false };
    const uint8_t visual_tiles[] = { 1 };
    const uint8_t collision[] = { 0 };
    gbs::IsometricRoomData room {};
    room.visual_tiles = visual_tiles;
    room.collision_flags = collision;
    room.width_tiles = 1;
    room.height_tiles = 1;
    room.grid = gbs::IsoGridConfig { logical_width, logical_height, gbs::Vec2i { 120, 64 } };
    room.tileset_tilemap = &source_tilemap;
    room.tileset_tiles = &source_tile_asset;
    room.tileset_tile_width_pixels = logical_width;
    room.tileset_tile_height_pixels = logical_height;
    gbs::IsoCamera camera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false };
    uint8_t surface[40 * 24 * 32] = {};

    assert(gbs::render_iso_room_surface(room, camera, surface, sizeof(surface)));
    assert(iso_surface_pixel(surface, 120, 64) == 3);
    assert(iso_surface_pixel(surface, 105, 72) == 5);
    assert(iso_surface_pixel(surface, 134, 72) == 8);
    assert(iso_surface_pixel(surface, 120, 79) == 7);
    assert(iso_surface_pixel(surface, 104, 64) == 0);
    assert(iso_surface_pixel(surface, 135, 64) == 0);
}

void test_render_iso_room_surface_uses_visual_32x32_atlas_slots() {
    constexpr int logical_width = 32;
    constexpr int logical_height = 16;
    constexpr int visual_height = 32;
    constexpr int subtile_count = (logical_width / 8) * (visual_height / 8);
    uint8_t source_tiles[subtile_count * 32] = {};
    for (uint8_t& value : source_tiles) value = 0x22;

    const uint16_t source_entries[] = {
        1, 2, 3, 4,
        5, 6, 7, 8,
        9, 10, 11, 12,
        13, 14, 15, 16
    };
    const gbs::TileMapAsset source_tilemap { source_entries, 4, 4 };
    const gbs::TileAsset source_tile_asset { source_tiles, subtile_count, 1, false };
    const uint8_t visual_tiles[] = { 1 };
    const uint8_t collision[] = { 0 };
    gbs::IsometricRoomData room {};
    room.visual_tiles = visual_tiles;
    room.collision_flags = collision;
    room.width_tiles = 1;
    room.height_tiles = 1;
    room.grid = gbs::IsoGridConfig { logical_width, logical_height, gbs::Vec2i { 120, 64 } };
    room.tileset_tilemap = &source_tilemap;
    room.tileset_tiles = &source_tile_asset;
    room.tileset_tile_width_pixels = logical_width;
    room.tileset_tile_height_pixels = logical_height;
    room.tileset_render_width_pixels = logical_width;
    room.tileset_render_height_pixels = visual_height;
    gbs::IsoCamera camera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false };
    uint8_t surface[40 * 24 * 32] = {};

    assert(gbs::render_iso_room_surface(room, camera, surface, sizeof(surface)));
    assert(iso_surface_pixel(surface, 120, 64) == 2);
    assert(iso_surface_pixel(surface, 120, 88) == 2);
    // A scrolled cache must be indistinguishable from a fresh composition,
    // including artwork entering at each edge and non-aligned grid origins.
    uint8_t expected[sizeof(surface)] {};
    for (size_t index = 0; index < sizeof(source_tiles); ++index) {
        source_tiles[index] = static_cast<uint8_t>(((index & 15u) << 4) | ((index + 1u) & 15u));
    }
    alignas(4) uint8_t unaligned_storage[sizeof(surface) + 4] {};
    assert(gbs::render_iso_room_surface(room, camera, surface, sizeof(surface)));
    assert(gbs::render_iso_room_surface(room, camera, unaligned_storage + 1, sizeof(surface)));
    for (size_t index = 0; index < sizeof(surface); ++index) assert(surface[index] == unaligned_storage[index + 1]);
    for (int offset : { 0, 3 }) {
        room.grid.origin_pixels.x = 120 + offset;
        room.grid.origin_pixels.y = 64 + offset;
        for (int start_x : { -128, 0, 112 }) {
            for (int start_y : { -96, 0, 80 }) {
                for (int dx : { -64, -8, 0, 8, 64 }) {
                    for (int dy : { -32, -8, 0, 8, 32 }) {
                        camera.position_pixels = { start_x, start_y };
                        assert(gbs::render_iso_room_surface(room, camera, surface, sizeof(surface)));
                        gbs::IsoCamera next = camera;
                        next.position_pixels = { start_x + dx, start_y + dy };
                        assert(gbs::scroll_iso_room_surface(room, camera, next, surface, sizeof(surface)));
                        assert(gbs::render_iso_room_surface(room, camera, unaligned_storage + 1, sizeof(surface)));
                        assert(gbs::scroll_iso_room_surface(room, camera, next, unaligned_storage + 1, sizeof(surface)));
                        for (size_t index = 0; index < sizeof(surface); ++index) assert(surface[index] == unaligned_storage[index + 1]);
                        assert(gbs::render_iso_room_surface(room, next, expected, sizeof(expected)));
                        for (size_t index = 0; index < sizeof(surface); ++index) assert(surface[index] == expected[index]);
                    }
                }
            }
        }
    }
}

void test_sort_iso_draw_list_assigns_front_items_to_lower_oam_indices() {
    gbs::IsoDrawItem items[] = {
        { gbs::Vec2i { 0, 0 }, 0, 0, 32, 2, true, false, 0 },
        { gbs::Vec2i { 0, 0 }, 0, 0, 16, 1, true, false, 0 },
        { gbs::Vec2i { 0, 0 }, 0, 0, 16, 0, true, false, 0 }
    };

    gbs::sort_iso_draw_list(items, 3);

    assert(items[0].depth == 32 && items[0].source_index == 2);
    assert(items[1].depth == 16 && items[1].source_index == 1);
    assert(items[2].depth == 16 && items[2].source_index == 0);
}

void test_iso_surface_tile_cache_only_reports_changed_hardware_tiles() {
    uint8_t tile_pixels[3 * 32] = {};
    gbs::IsoSurfaceTileCache cache {};
    gbs::IsoSurfaceTileRun runs[4] = {};

    size_t run_count = gbs::collect_iso_surface_dirty_tile_runs(
        cache,
        tile_pixels,
        3,
        runs,
        4
    );
    assert(run_count == 1);
    assert(runs[0].first_tile == 0 && runs[0].tile_count == 3);

    run_count = gbs::collect_iso_surface_dirty_tile_runs(cache, tile_pixels, 3, runs, 4);
    assert(run_count == 0);

    tile_pixels[32 + 7] = 1;
    run_count = gbs::collect_iso_surface_dirty_tile_runs(cache, tile_pixels, 3, runs, 4);
    assert(run_count == 1);
    assert(runs[0].first_tile == 1 && runs[0].tile_count == 1);

    // Distinct changes in the high byte of adjacent words must not cancel.
    tile_pixels[3] = 0;
    tile_pixels[7] = 119;
    gbs::collect_iso_surface_dirty_tile_runs(cache, tile_pixels, 3, runs, 4);
    tile_pixels[3] = 1;
    tile_pixels[7] = 0;
    assert(gbs::collect_iso_surface_dirty_tile_runs(cache, tile_pixels, 3, runs, 4) == 1);
    assert(runs[0].first_tile == 0 && runs[0].tile_count == 1);

    // Every byte contributes, with identical fingerprints for aligned and
    // unaligned buffers. Changing storage alignment alone must not dirty tiles.
    alignas(4) uint8_t unaligned[sizeof(tile_pixels) + 4] {};
    for (size_t index = 0; index < sizeof(tile_pixels); ++index) unaligned[index + 1] = tile_pixels[index];
    assert(gbs::collect_iso_surface_dirty_tile_runs(cache, unaligned + 1, 3, runs, 4) == 0);
    for (size_t byte = 0; byte < 32; ++byte) {
        for (uint8_t bit = 1; bit != 0; bit = static_cast<uint8_t>(bit << 1)) {
            unaligned[33 + byte] ^= bit;
            assert(gbs::collect_iso_surface_dirty_tile_runs(cache, unaligned + 1, 3, runs, 4) == 1);
            assert(runs[0].first_tile == 1 && runs[0].tile_count == 1);
            unaligned[33 + byte] ^= bit;
            assert(gbs::collect_iso_surface_dirty_tile_runs(cache, unaligned + 1, 3, runs, 4) == 1);
        }
    }
}

void test_iso_actor_uses_one_level_height_map_as_a_ramp() {
    const uint8_t flags[] = { 0, 0, 0 };
    const uint8_t height_levels[] = { 0, 1, 3 };
    const uint8_t ramp_flags[] = { gbs::IsoRampNone, gbs::IsoRampUpRight, gbs::IsoRampNone };
    const gbs::IsoTileMap map { flags, 3, 1, height_levels, ramp_flags };
    gbs::IsoActor actor {
        gbs::IsoCoord { 0, 0, 0 },
        gbs::Vec2i { 0, 0 },
        0,
        0,
        true,
        false,
        0
    };

    assert(gbs::move_iso_actor_by_delta(map, actor, gbs::Vec2i { 1, 0 }));
    assert(actor.tile.x == 1 && actor.tile.z == 1);
    assert(!gbs::move_iso_actor_by_delta(map, actor, gbs::Vec2i { 1, 0 }));
    assert(actor.tile.x == 1 && actor.tile.z == 1);
    assert(gbs::move_iso_actor_by_delta(map, actor, gbs::Vec2i { -1, 0 }));
    assert(actor.tile.x == 0 && actor.tile.z == 0);

    const uint8_t wrong_ramp_flags[] = { gbs::IsoRampNone, gbs::IsoRampUpLeft, gbs::IsoRampNone };
    const gbs::IsoTileMap wrong_ramp_map { flags, 3, 1, height_levels, wrong_ramp_flags };
    assert(!gbs::move_iso_actor_by_delta(wrong_ramp_map, actor, gbs::Vec2i { 1, 0 }));
}

void test_iso_movement_repeat_is_immediate_then_continuous_while_held() {
    assert(gbs::iso_movement_step_due(true, true, 1, 8));
    assert(!gbs::iso_movement_step_due(false, true, 7, 8));
    assert(gbs::iso_movement_step_due(false, true, 8, 8));
    assert(!gbs::iso_movement_step_due(false, false, 8, 8));
}

void test_iso_free_movement_preserves_subtile_position_until_crossing_cell() {
    const uint8_t flags[] = { 0, 0, 0 };
    const gbs::IsoTileMap map { flags, 3, 1 };
    gbs::IsoActor actor {
        gbs::IsoCoord { 0, 0, 0 },
        gbs::Vec2i { 0, 0 },
        0,
        0,
        true,
        false,
        0
    };

    assert(gbs::move_iso_actor_by_free_delta(map, actor, gbs::Vec2i { 1, 0 }, nullptr, 0, static_cast<size_t>(-1), 64));
    assert(actor.position_initialized);
    assert(actor.position_x256 == 64);
    assert(actor.tile.x == 0 && actor.tile.y == 0);

    for (int step = 0; step < 3; ++step) {
        assert(gbs::move_iso_actor_by_free_delta(map, actor, gbs::Vec2i { 1, 0 }, nullptr, 0, static_cast<size_t>(-1), 64));
    }
    assert(actor.position_x256 == 256);
    assert(actor.tile.x == 1 && actor.tile.y == 0);
}

void test_iso_free_movement_respects_blocked_destination_and_height_ramps() {
    const uint8_t blocked_flags[] = { 0, gbs::IsoTileBlocked };
    const gbs::IsoTileMap blocked_map { blocked_flags, 2, 1 };
    gbs::IsoActor actor {
        gbs::IsoCoord { 0, 0, 0 },
        gbs::Vec2i { 0, 0 },
        0,
        0,
        true,
        false,
        0
    };

    for (int step = 0; step < 15; ++step) {
        assert(gbs::move_iso_actor_by_free_delta(blocked_map, actor, gbs::Vec2i { 1, 0 }));
    }
    assert(actor.position_x256 == 240);
    assert(!gbs::move_iso_actor_by_free_delta(blocked_map, actor, gbs::Vec2i { 1, 0 }));
    assert(actor.position_x256 == 240);
    assert(actor.tile.x == 0);

    const uint8_t ramp_collision_flags[] = { 0, 0 };
    const uint8_t ramp_flags[] = { gbs::IsoRampNone, gbs::IsoRampUpRight };
    const uint8_t heights[] = { 0, 1 };
    const gbs::IsoTileMap ramp_map { ramp_collision_flags, 2, 1, heights, ramp_flags };
    gbs::sync_iso_actor_position_from_tile(actor);
    assert(gbs::move_iso_actor_by_free_delta(ramp_map, actor, gbs::Vec2i { 1, 0 }, nullptr, 0, static_cast<size_t>(-1), 256));
    assert(actor.tile.x == 1 && actor.tile.z == 1);
}

void test_iso_free_movement_diagonals_do_not_cut_corners_or_tunnel() {
    uint8_t flags[25] {};
    uint8_t heights[25] {};
    uint8_t ramps[25] {};
    const gbs::IsoTileMap map {flags, 5, 5, heights, ramps};
    gbs::IsoActor actor {}; actor.tile={2,2,0};
    const gbs::Vec2i directions[]={{1,1},{-1,-1},{1,-1},{-1,1}};
    for (const auto delta : directions) {
        const auto before=actor.tile;
        assert(gbs::move_iso_actor_by_free_delta(map, actor, delta, nullptr, 0, size_t(-1), 256));
        assert(actor.tile.x==before.x+delta.x && actor.tile.y==before.y+delta.y);
    }
    assert(actor.tile.x==2 && actor.tile.y==2);
    flags[2*5+3]=gbs::IsoTileBlocked;
    assert(!gbs::move_iso_actor_by_free_delta(map, actor, {1,1}, nullptr, 0, size_t(-1), 256));
    assert(!gbs::move_iso_actor_by_free_delta(map, actor, {1,0}, nullptr, 0, size_t(-1), 512));
    flags[2*5+3]=0;
    gbs::IsoActor blocker {}; blocker.tile={2,3,0}; blocker.visible=true;
    assert(!gbs::move_iso_actor_by_free_delta(map, actor, {1,1}, &blocker, 1, size_t(-1), 256));
    heights[3*5+3]=1; ramps[3*5+3]=gbs::IsoRampUpRight;
    assert(!gbs::move_iso_actor_by_free_delta(map, actor, {1,1}, nullptr, 0, size_t(-1), 256));
    // A diagonal input can cross ONE valid ramp edge without skipping the other axis.
    actor.position_initialized=true; actor.position_x256=2*256+240; actor.position_y256=2*256+64;
    heights[2*5+3]=1; ramps[2*5+3]=gbs::IsoRampUpRight;
    assert(gbs::move_iso_actor_by_free_delta(map, actor, {1,1}, nullptr, 0, size_t(-1), 16));
    assert(actor.tile.x==3 && actor.tile.y==2 && actor.tile.z==1);
    assert(gbs::move_iso_actor_by_free_delta(map, actor, {-1,-1}, nullptr, 0, size_t(-1), 16));
    assert(actor.tile.x==2 && actor.tile.y==2 && actor.tile.z==0);
}

void test_iso_free_movement_projects_subtile_position_for_rendering() {
    const gbs::IsoActor actors[] = {
        { gbs::IsoCoord { 0, 0, 0 }, gbs::Vec2i { -8, -16 }, 4, 1, true, false, 2 }
    };
    gbs::IsoActor actor = actors[0];
    actor.position_x256 = 128;
    actor.position_y256 = 0;
    actor.position_initialized = true;
    gbs::IsoDrawItem items[1] = {};

    assert(gbs::build_iso_draw_list(
        &actor,
        1,
        gbs::IsoCamera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false },
        items,
        1,
        grid
    ) == 1);
    assert(items[0].screen_pixels.x == 120);
    assert(items[0].screen_pixels.y == 4);
}

void test_iso_surface_compaction_deduplicates_transparent_foreground_tiles() {
    uint8_t source[3 * 32] = {};
    source[32] = 5;
    source[64] = 5;
    uint8_t compacted[2 * 32] = {};
    uint16_t tilemap[3] = {};

    const size_t unique_count = gbs::compact_iso_surface_tiles(
        source,
        3,
        compacted,
        2,
        tilemap
    );

    assert(unique_count == 1);
    assert(tilemap[0] == 0 && tilemap[1] == 1 && tilemap[2] == 1);
    assert(compacted[0] == 5);
}

void test_iso_pick_tile_uses_diamond_mask_and_bounds() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, 0, 0,
        0, 0, 0
    };
    gbs::IsoTileMap map { flags, 3, 3 };
    gbs::Vec2i center = gbs::iso_tile_to_screen(gbs::IsoCoord { 1, 1, 0 }, grid);
    gbs::IsoPickResult hit = gbs::iso_pick_tile(center, map, grid);
    gbs::IsoPickResult miss = gbs::iso_pick_tile(gbs::Vec2i { -200, -200 }, map, grid);

    assert(hit.hit);
    assert(hit.tile.x == 1);
    assert(hit.tile.y == 1);
    assert(!miss.hit);
}

void test_iso_collision_blocks_tiles_and_actors() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, gbs::IsoTileBlocked, 0,
        0, 0, 0
    };
    gbs::IsoTileMap map { flags, 3, 3 };
    const gbs::IsoActor blockers[] = {
        { gbs::IsoCoord { 2, 1, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, true, false, 0 }
    };

    assert(gbs::iso_coord_blocked(map, gbs::IsoCoord { 1, 1, 0 }));
    assert(gbs::iso_coord_blocked(map, gbs::IsoCoord { -1, 0, 0 }));
    assert(gbs::iso_coord_blocked_by_actors(gbs::IsoCoord { 2, 1, 0 }, blockers, 1));
    assert(!gbs::iso_coord_blocked_by_actors(gbs::IsoCoord { 2, 1, 0 }, blockers, 1, 0));
}

void test_move_iso_actor_respects_map_and_actor_blockers() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, gbs::IsoTileBlocked, 0,
        0, 0, 0
    };
    gbs::IsoTileMap map { flags, 3, 3 };
    gbs::IsoActor actor { gbs::IsoCoord { 0, 1, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, true, false, 0 };
    const gbs::IsoActor blockers[] = {
        { gbs::IsoCoord { 0, 2, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, true, false, 0 }
    };

    assert(!gbs::move_iso_actor_by_delta(map, actor, gbs::Vec2i { 1, 0 }));
    assert(actor.tile.x == 0 && actor.tile.y == 1);
    assert(!gbs::move_iso_actor_by_delta(map, actor, gbs::Vec2i { 0, 1 }, blockers, 1));
    assert(gbs::move_iso_actor_by_delta(map, actor, gbs::Vec2i { 0, -1 }, blockers, 1));
    assert(actor.tile.x == 0 && actor.tile.y == 0);
}

void test_iso_greedy_path_step_prefers_open_axis() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, gbs::IsoTileBlocked, 0,
        0, 0, 0
    };
    gbs::IsoTileMap map { flags, 3, 3 };
    gbs::IsoPathStep step = gbs::find_iso_path_step_greedy(
        map,
        gbs::IsoCoord { 0, 1, 0 },
        gbs::IsoCoord { 2, 1, 0 }
    );

    assert(step.found);
    assert(step.next_tile.x == 0);
    assert(step.next_tile.y == 2);
    assert(step.delta_tile.x == 0);
    assert(step.delta_tile.y == 1);
}

void test_iso_bfs_path_step_routes_around_blocked_tiles() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, gbs::IsoTileBlocked, gbs::IsoTileBlocked, 0,
        0, 0, 0, 0
    };
    gbs::IsoTileMap map { flags, 4, 3 };
    gbs::IsoPathStep step = gbs::find_iso_path_step_bfs(
        map,
        gbs::IsoCoord { 0, 1, 0 },
        gbs::IsoCoord { 3, 1, 0 },
        nullptr,
        0,
        static_cast<size_t>(-1),
        16
    );

    assert(step.found);
    assert(step.next_tile.x == 0);
    assert(step.next_tile.y == 2);
    assert(step.delta_tile.x == 0);
    assert(step.delta_tile.y == 1);
}

void test_iso_astar_path_step_routes_around_blocked_tiles_and_actors() {
    const uint8_t flags[] = {
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, gbs::IsoTileBlocked, gbs::IsoTileBlocked, gbs::IsoTileBlocked, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0
    };
    gbs::IsoTileMap map { flags, 5, 5 };
    gbs::IsoPathStep step = gbs::find_iso_path_step_astar(
        map,
        gbs::IsoCoord { 0, 2, 0 },
        gbs::IsoCoord { 4, 2, 0 },
        nullptr,
        0,
        static_cast<size_t>(-1),
        32
    );

    assert(step.found);
    assert(step.next_tile.x == 0);
    assert(step.next_tile.y == 3);
    assert(step.delta_tile.x == 0);
    assert(step.delta_tile.y == 1);

    const gbs::IsoActor blockers[] = {
        gbs::IsoActor { gbs::IsoCoord { 0, 3, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, true, false, 0 }
    };
    step = gbs::find_iso_path_step_astar(
        map,
        gbs::IsoCoord { 0, 2, 0 },
        gbs::IsoCoord { 4, 2, 0 },
        blockers,
        1,
        static_cast<size_t>(-1),
        32
    );
    assert(step.found);
    assert(step.next_tile.x == 0);
    assert(step.next_tile.y == 1);
    assert(step.delta_tile.y == -1);

    step = gbs::find_iso_path_step_astar(
        map,
        gbs::IsoCoord { 0, 2, 0 },
        gbs::IsoCoord { 4, 2, 0 },
        nullptr,
        0,
        static_cast<size_t>(-1),
        2
    );
    assert(!step.found);
}

void test_iso_tactical_move_requires_reachable_steps_and_ramp() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, gbs::IsoTileBlocked, 0,
        0, 0, 0
    };
    const gbs::IsoTileMap map { flags, 3, 3 };
    const gbs::IsoCoord start { 0, 1, 0 };
    const gbs::IsoCoord target { 2, 1, 0 };
    assert(!gbs::plan_iso_tactical_move(map, start, target, nullptr, 0, 0, 3).found);
    const gbs::IsoTacticalMovePath detour = gbs::plan_iso_tactical_move(map, start, target, nullptr, 0, 0, 4);
    assert(detour.found && detour.length == 4);
    assert(detour.tiles[0].x == 0 && detour.tiles[0].y != 1);
    assert(detour.tiles[3].x == 2 && detour.tiles[3].y == 1);

    const uint8_t flat_flags[] = { 0, 0, 0 };
    const uint8_t heights[] = { 0, 1, 1 };
    const uint8_t ramps[] = { 0, gbs::IsoRampUpRight, 0 };
    const gbs::IsoTileMap stepped { flat_flags, 3, 1, heights, ramps };
    const gbs::IsoTacticalMovePath climb = gbs::plan_iso_tactical_move(
        stepped, gbs::IsoCoord { 0, 0, 0 }, gbs::IsoCoord { 2, 0, 1 }, nullptr, 0, 0, 2
    );
    assert(climb.found && climb.length == 2);
    assert(climb.tiles[0].z == 1 && climb.tiles[1].z == 1);
    const gbs::IsoTileMap no_ramp { flat_flags, 3, 1, heights, nullptr };
    assert(!gbs::plan_iso_tactical_move(
        no_ramp, gbs::IsoCoord { 0, 0, 0 }, gbs::IsoCoord { 2, 0, 1 }, nullptr, 0, 0, 2
    ).found);
}

void test_iso_cursor_moves_inside_bounds_and_can_reject_blocked_tiles() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, gbs::IsoTileBlocked, 0,
        0, 0, 0
    };
    gbs::IsoTileMap map { flags, 3, 3 };
    gbs::IsoCursorState cursor = gbs::iso_cursor_from_tile(gbs::IsoCoord { 0, 1, 0 }, true);

    assert(cursor.active);
    assert(gbs::move_iso_cursor_by_delta(map, cursor, gbs::Vec2i { 1, 0 }));
    assert(cursor.tile.x == 1 && cursor.tile.y == 1);
    assert(!gbs::move_iso_cursor_by_delta(map, cursor, gbs::Vec2i { -2, 0 }));
    assert(cursor.tile.x == 1 && cursor.tile.y == 1);
    assert(!gbs::move_iso_cursor_by_delta(map, cursor, gbs::Vec2i { 0, 0 }, false));
    assert(cursor.tile.x == 1 && cursor.tile.y == 1);

    gbs::IsoActor actor { gbs::IsoCoord { 2, 2, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, true, false, 0 };
    cursor.active = false;
    assert(gbs::iso_selected_tile(cursor, actor).x == 2);
    cursor.active = true;
    assert(gbs::iso_selected_tile(cursor, actor).x == 1);
}

void test_iso_cursor_tracks_tile_height_when_crossing_a_step() {
    const uint8_t flags[] = { 0, 0, 0 };
    const uint8_t heights[] = { 0, 1, 0 };
    const gbs::IsoTileMap map { flags, 3, 1, heights };
    gbs::IsoCursorState cursor = gbs::iso_cursor_from_tile(gbs::IsoCoord { 0, 0, 0 }, true);

    assert(gbs::move_iso_cursor_by_delta(map, cursor, gbs::Vec2i { 1, 0 }));
    assert(cursor.tile.x == 1 && cursor.tile.y == 0 && cursor.tile.z == 1);
    assert(gbs::move_iso_cursor_by_delta(map, cursor, gbs::Vec2i { 1, 0 }));
    assert(cursor.tile.x == 2 && cursor.tile.y == 0 && cursor.tile.z == 0);
}

void test_iso_room_cursor_start_uses_room_data_then_actor_fallback() {
    gbs::IsoActor actors[] = {
        gbs::IsoActor { gbs::IsoCoord { 1, 2, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, true, false, 0 }
    };
    gbs::IsometricRoomData room {};
    room.cursor_start = gbs::IsoCoord { 2, 1, 0 };
    room.cursor_start_enabled = true;

    gbs::IsoCursorState cursor = gbs::iso_cursor_from_room(room, actors, 1, true);
    assert(cursor.active);
    assert(cursor.tile.x == 2);
    assert(cursor.tile.y == 1);

    room.cursor_start_enabled = false;
    cursor = gbs::iso_cursor_from_room(room, actors, 1);
    assert(!cursor.active);
    assert(cursor.tile.x == 1);
    assert(cursor.tile.y == 2);

    cursor = gbs::iso_cursor_from_room(room);
    assert(cursor.tile.x == 0);
    assert(cursor.tile.y == 0);
}

void test_iso_cursor_actor_lookup_resolves_visible_actor_script() {
    static constexpr gbs::EventCommand actor_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetVariable, 7, 21, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::IsoActor actors[] = {
        gbs::IsoActor { gbs::IsoCoord { 1, 1, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, true, false, 0 },
        gbs::IsoActor { gbs::IsoCoord { 2, 1, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, true, false, 0 },
        gbs::IsoActor { gbs::IsoCoord { 3, 1, 0 }, gbs::Vec2i { 0, 0 }, 0, 0, false, false, 0 }
    };
    static constexpr gbs::IsoActorEventData interact_events[] = {
        gbs::IsoActorEventData { 1, gbs::EventScript { actor_commands, 2 } }
    };

    gbs::IsometricRoomData room {};
    room.actor_interact_events = interact_events;
    room.actor_interact_event_count = 1;
    gbs::IsoCursorState cursor = gbs::iso_cursor_from_tile(gbs::IsoCoord { 2, 1, 0 }, true);

    assert(gbs::find_iso_actor_at_cursor(cursor, actors, 3, 1) == 1);
    gbs::EventScript script = gbs::iso_cursor_actor_interact_event_script_for(room, cursor, actors, 3);
    assert(gbs::has_event_script(script));

    gbs::EventState event_state;
    gbs::init_event_state(event_state);
    gbs::run_event_script(event_state, script);
    assert(event_state.variables[7] == 21);

    cursor.tile = gbs::IsoCoord { 3, 1, 0 };
    assert(gbs::find_iso_actor_at_cursor(cursor, actors, 3, 1) == gbs::no_iso_actor_index);
    assert(gbs::find_iso_actor_at_cursor(cursor, actors, 3, 1, false) == 2);
    assert(!gbs::has_event_script(gbs::iso_cursor_actor_interact_event_script_for(room, cursor, actors, 3)));

    cursor.active = false;
    assert(gbs::find_iso_actor_at_cursor(cursor, actors, 3, 1) == gbs::no_iso_actor_index);
}

void test_iso_actor_event_command_batch_consumes_event_state() {
    gbs::IsoActor actors[] = {
        gbs::IsoActor { gbs::IsoCoord { 1, 1, 0 }, gbs::Vec2i { 0, 0 }, 4, 0, true, false, 0 },
        gbs::IsoActor { gbs::IsoCoord { 2, 1, 0 }, gbs::Vec2i { 0, 0 }, 8, 0, true, false, 0 }
    };

    gbs::EventState state {};
    gbs::reset_event_actor_commands(state);
    state.actor_commands[0] = gbs::EventActorCommand { gbs::EventActorOp::MoveRelative, 0, 2, -1 };
    state.actor_commands[1] = gbs::EventActorCommand { gbs::EventActorOp::SetVisible, 1, 0, 0 };
    state.actor_commands[2] = gbs::EventActorCommand { gbs::EventActorOp::SetPosition, 7, 9, 9 };
    state.actor_commands[3] = gbs::EventActorCommand { gbs::EventActorOp::SetDirection, 0, -1, 0 };
    state.actor_commands[4] = gbs::EventActorCommand { gbs::EventActorOp::SetAnimation, 0, 12, 0 };
    state.actor_commands[5] = gbs::EventActorCommand { gbs::EventActorOp::SetCollisionEnabled, 0, 0, 0 };
    state.actor_command_count = 6;

    size_t applied = gbs::consume_iso_actor_event_commands(actors, 2, state);

    assert(applied == 5);
    assert(actors[0].tile.x == 3);
    assert(actors[0].tile.y == 0);
    assert(actors[0].hflip);
    assert(actors[0].tile_index == 12);
    assert(!actors[1].visible);
    assert(state.actor_command_count == 0);
    assert(state.actor_commands[0].op == gbs::EventActorOp::None);

    gbs::apply_iso_actor_event_command(nullptr, 2, gbs::EventActorCommand { gbs::EventActorOp::SetVisible, 0, 1, 0 });
    assert(gbs::apply_iso_actor_event_commands(actors, 2, nullptr, 1) == 0);
}

void test_iso_actor_event_script_lookup_executes_runtime_effects() {
    static constexpr gbs::EventCommand interact_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetVariable, 1, 5, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::EventCommand start_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetActorVisible, 2, 0, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::EventCommand update_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetCameraPosition, 12, 20, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::EventCommand tile_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetVariable, 4, 11, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::EventCommand tile_area_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetVariable, 5, 13, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::IsoActorEventData interact_events[] = {
        gbs::IsoActorEventData { 1, gbs::EventScript { interact_commands, 2 } }
    };
    static constexpr gbs::IsoActorEventData start_events[] = {
        gbs::IsoActorEventData { 2, gbs::EventScript { start_commands, 2 } }
    };
    static constexpr gbs::IsoActorEventData update_events[] = {
        gbs::IsoActorEventData { 1, gbs::EventScript { update_commands, 2 } }
    };
    static constexpr gbs::IsoTileEventData tile_events[] = {
        gbs::IsoTileEventData { gbs::IsoCoord { 2, 3, 0 }, gbs::EventScript { tile_commands, 2 } },
        gbs::IsoTileEventData { gbs::IsoCoord { 4, 2, 0 }, gbs::EventScript { tile_area_commands, 2 }, 2, 3 }
    };
    gbs::IsometricRoomData room {};
    room.actor_interact_events = interact_events;
    room.actor_interact_event_count = 1;
    room.actor_start_events = start_events;
    room.actor_start_event_count = 1;
    room.actor_update_events = update_events;
    room.actor_update_event_count = 1;
    room.tile_events = tile_events;
    room.tile_event_count = 2;

    gbs::EventState event_state;
    gbs::init_event_state(event_state);
    gbs::run_event_script(event_state, gbs::iso_actor_interact_event_script_for(room, 1));
    assert(event_state.variables[1] == 5);
    gbs::run_event_script(event_state, gbs::iso_actor_start_event_script_for(room, 2));
    assert(event_state.actor_command_count == 1);
    assert(event_state.actor_commands[0].op == gbs::EventActorOp::SetVisible);
    assert(event_state.actor_commands[0].actor_index == 2);
    gbs::clear_event_actor_commands(event_state);
    gbs::run_event_script(event_state, gbs::iso_actor_update_event_script_for(room, 1));
    assert(event_state.camera_changed);
    assert(event_state.camera_x == 12);
    assert(event_state.camera_y == 20);
    gbs::run_event_script(event_state, gbs::iso_tile_event_script_for(room, gbs::IsoCoord { 2, 3, 0 }));
    assert(event_state.variables[4] == 11);
    assert(gbs::iso_tile_event_contains(tile_events[1], gbs::IsoCoord { 5, 4, 0 }));
    assert(!gbs::iso_tile_event_contains(tile_events[1], gbs::IsoCoord { 6, 4, 0 }));
    gbs::run_event_script(event_state, gbs::iso_tile_event_script_for(room, gbs::IsoCoord { 5, 4, 0 }));
    assert(event_state.variables[5] == 13);
    assert(!gbs::has_event_script(gbs::iso_actor_interact_event_script_for(room, 0)));
    assert(!gbs::has_event_script(gbs::iso_actor_start_event_script_for(room, 0)));
    assert(!gbs::has_event_script(gbs::iso_actor_update_event_script_for(room, 0)));
    assert(!gbs::has_event_script(gbs::iso_tile_event_script_for(room, gbs::IsoCoord { 6, 4, 0 })));
}

void test_iso_actor_animation_selects_idle_walk_direction_and_frames() {
    static constexpr gbs::MetaSpritePart idle_part { 0, 0, 10, 1, false, false, 32, 32 };
    static constexpr gbs::MetaSpritePart walk_right_parts[] = {
        gbs::MetaSpritePart { 0, 0, 17, 2, false, false, 32, 32 },
        gbs::MetaSpritePart { 0, 0, 18, 2, false, false, 32, 32 }
    };
    static constexpr gbs::SpriteAnimationFrame idle_frames[] = {
        gbs::SpriteAnimationFrame { gbs::MetaSprite { &idle_part, 1 }, 4 }
    };
    static constexpr gbs::SpriteAnimationFrame walk_right_frames[] = {
        gbs::SpriteAnimationFrame { gbs::MetaSprite { &walk_right_parts[0], 1 }, 1 },
        gbs::SpriteAnimationFrame { gbs::MetaSprite { &walk_right_parts[1], 1 }, 1 }
    };
    static constexpr gbs::SpriteAnimation idle { idle_frames, 1, true };
    static constexpr gbs::SpriteAnimation walk_right { walk_right_frames, 2, true };
    static constexpr gbs::IsoActorAnimationSet animations {
        &idle, &idle, &idle, &idle,
        &idle, &idle, &idle, &walk_right
    };

    gbs::IsoActor actor { gbs::IsoCoord { 1, 1, 0 }, gbs::Vec2i { -16, -16 }, 0, 0, true, false, 0, 32, 32 };
    gbs::IsoActorAnimationState state {};
    assert(gbs::apply_iso_actor_animation(actor, animations, state));
    assert(actor.tile_index == 10);
    assert(actor.palette == 1);
    assert(actor.metasprite == &idle_frames[0].metasprite);

    gbs::set_iso_actor_motion(state, gbs::Vec2i { 1, 0 }, true);
    assert(state.direction == gbs::IsoActorDirection::Right);
    assert(state.walking);
    assert(gbs::apply_iso_actor_animation(actor, animations, state));
    assert(actor.tile_index == 17);
    assert(actor.palette == 2);
    assert(actor.metasprite == &walk_right_frames[0].metasprite);

    gbs::tick_iso_actor_animation(state, animations);
    assert(state.frame_index == 1);
    assert(gbs::apply_iso_actor_animation(actor, animations, state));
    assert(actor.tile_index == 18);
    assert(actor.metasprite == &walk_right_frames[1].metasprite);

    gbs::set_iso_actor_motion(state, gbs::Vec2i { 0, 0 }, false);
    assert(!state.walking);
    assert(state.frame_index == 0);
    assert(gbs::apply_iso_actor_animation(actor, animations, state));
    assert(actor.tile_index == 10);
    assert(actor.metasprite == &idle_frames[0].metasprite);
}

void test_iso_actor_animation_supports_tactical_states_without_looping() {
    static constexpr gbs::MetaSpritePart idle_part { 0, 0, 10, 1, false, false, 32, 32 };
    static constexpr gbs::MetaSpritePart attack_parts[] = {
        gbs::MetaSpritePart { 0, 0, 20, 2, false, false, 32, 32 },
        gbs::MetaSpritePart { 0, 0, 21, 2, false, false, 32, 32 }
    };
    static constexpr gbs::MetaSpritePart hurt_part { 0, 0, 30, 3, false, false, 32, 32 };
    static constexpr gbs::MetaSpritePart defeat_part { 0, 0, 40, 4, false, false, 32, 32 };
    static constexpr gbs::SpriteAnimationFrame idle_frames[] = {
        gbs::SpriteAnimationFrame { gbs::MetaSprite { &idle_part, 1 }, 1 }
    };
    static constexpr gbs::SpriteAnimationFrame attack_frames[] = {
        gbs::SpriteAnimationFrame { gbs::MetaSprite { &attack_parts[0], 1 }, 1 },
        gbs::SpriteAnimationFrame { gbs::MetaSprite { &attack_parts[1], 1 }, 1 }
    };
    static constexpr gbs::SpriteAnimationFrame hurt_frames[] = {
        gbs::SpriteAnimationFrame { gbs::MetaSprite { &hurt_part, 1 }, 1 }
    };
    static constexpr gbs::SpriteAnimationFrame defeat_frames[] = {
        gbs::SpriteAnimationFrame { gbs::MetaSprite { &defeat_part, 1 }, 1 }
    };
    static constexpr gbs::SpriteAnimation idle { idle_frames, 1, true };
    static constexpr gbs::SpriteAnimation attack { attack_frames, 2, false };
    static constexpr gbs::SpriteAnimation hurt { hurt_frames, 1, false };
    static constexpr gbs::SpriteAnimation defeat { defeat_frames, 1, false };
    gbs::IsoActorAnimationSet animations {};
    animations.idle_right = &idle;
    animations.attack_right = &attack;
    animations.hurt_right = &hurt;
    animations.defeat_right = &defeat;

    gbs::IsoActor actor { gbs::IsoCoord { 1, 1, 0 }, gbs::Vec2i { -16, -16 }, 0, 0, true, false, 0, 32, 32 };
    gbs::IsoActorAnimationState state {};
    gbs::set_iso_actor_animation_mode(state, gbs::IsoActorAnimationMode::Attack);
    state.direction = gbs::IsoActorDirection::Right;
    assert(gbs::iso_actor_animation_for(animations, state) == &attack);
    assert(gbs::apply_iso_actor_animation(actor, animations, state));
    assert(actor.tile_index == 20);

    gbs::tick_iso_actor_animation(state, animations);
    assert(state.frame_index == 1);
    gbs::tick_iso_actor_animation(state, animations);
    assert(state.completed);
    assert(state.frame_index == 1);
    assert(gbs::iso_actor_animation_for(animations, state) == &attack);
    assert(gbs::apply_iso_actor_animation(actor, animations, state));
    assert(actor.tile_index == 21);

    gbs::set_iso_actor_animation_mode(state, gbs::IsoActorAnimationMode::Hurt);
    assert(!state.completed);
    assert(gbs::iso_actor_animation_for(animations, state) == &hurt);
    gbs::set_iso_actor_animation_mode(state, gbs::IsoActorAnimationMode::Defeat);
    assert(gbs::iso_actor_animation_for(animations, state) == &defeat);
}

void test_iso_tactical_markers_use_independent_metasprites() {
    static constexpr gbs::MetaSpritePart actor_part { 0, 0, 10, 1, false, false, 32, 32 };
    static constexpr gbs::MetaSpritePart cursor_part { -8, -8, 90, 5, false, false, 16, 16 };
    static constexpr gbs::MetaSprite actor_metasprite { &actor_part, 1 };
    static constexpr gbs::MetaSprite cursor_metasprite { &cursor_part, 1 };
    const gbs::IsoActor actor {
        gbs::IsoCoord { 2, 2, 0 }, gbs::Vec2i { -16, -24 }, 10, 1, true, false, 0, 32, 32, true, &actor_metasprite
    };
    gbs::IsoDrawItem actor_items[1] = {};
    gbs::IsoDrawItem marker_items[1] = {};
    const gbs::IsoCamera camera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 0, 0 }, false };

    assert(gbs::build_iso_draw_list(&actor, 1, camera, actor_items, 1, grid) == 1);
    assert(gbs::build_iso_metasprite_draw_list(
        cursor_metasprite,
        actor.tile,
        gbs::Vec2i { 0, 0 },
        camera,
        marker_items,
        1,
        77,
        0,
        grid
    ) == 1);
    assert(marker_items[0].tile_index == 90);
    assert(marker_items[0].palette == 5);
    assert(marker_items[0].source_index == 77);
    assert(marker_items[0].tile_index != actor_items[0].tile_index);
}

void test_iso_tactical_marker_center_offset_matches_native_frame() {
    static constexpr gbs::MetaSpritePart part { 0, 0, 0, 0, false, false, 16, 16 };
    static constexpr gbs::MetaSprite marker { &part, 1 };
    const gbs::Vec2i offset = gbs::iso_metasprite_center_offset(marker);
    assert(offset.x == -8);
    assert(offset.y == -8);

    static constexpr gbs::MetaSpritePart wide_parts[] = {
        { 0, 0, 0, 0, false, false, 16, 16 },
        { 16, 0, 0, 0, false, false, 8, 16 },
    };
    static constexpr gbs::MetaSprite wide_marker { wide_parts, 2 };
    const gbs::Vec2i wide_offset = gbs::iso_metasprite_center_offset(wide_marker);
    assert(wide_offset.x == -12);
    assert(wide_offset.y == -8);

    static constexpr gbs::MetaSpritePart diamond_part { 0, 0, 0, 0, false, false, 32, 16 };
    static constexpr gbs::MetaSprite diamond { &diamond_part, 1 };
    const gbs::Vec2i diamond_offset = gbs::iso_metasprite_diamond_center_offset(
        diamond, gbs::default_iso_grid_config()
    );
    assert(diamond_offset.x == -16);
    assert(diamond_offset.y == 0);
}

void test_iso_tactical_presentation_tracks_explicit_capabilities_and_layers() {
    const gbs::IsoTacticalPresentationData presentation {
        gbs::iso_tactical_capability_bit(gbs::IsoTacticalCapability::Surface) |
            gbs::iso_tactical_capability_bit(gbs::IsoTacticalCapability::GridOverlay) |
            gbs::iso_tactical_capability_bit(gbs::IsoTacticalCapability::Hud) |
        gbs::iso_tactical_capability_bit(gbs::IsoTacticalCapability::Feedback),
        nullptr,
        nullptr,
        0,
        0,
        0,
        nullptr,
        nullptr,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        0
    };

    assert(gbs::iso_tactical_capability_enabled(presentation, gbs::IsoTacticalCapability::Surface));
    assert(gbs::iso_tactical_capability_enabled(presentation, gbs::IsoTacticalCapability::GridOverlay));
    assert(gbs::iso_tactical_capability_enabled(presentation, gbs::IsoTacticalCapability::Hud));
    assert(gbs::iso_tactical_capability_enabled(presentation, gbs::IsoTacticalCapability::Feedback));
    assert(!gbs::iso_tactical_capability_enabled(presentation, gbs::IsoTacticalCapability::Audio));
}

void test_iso_tactical_audio_cues_have_stable_native_indices() {
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Cursor) == 0);
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Select) == 1);
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Cancel) == 2);
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Move) == 3);
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Attack) == 4);
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Hit) == 5);
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Turn) == 6);
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Victory) == 7);
    assert(static_cast<size_t>(gbs::IsoTacticalAudioCue::Defeat) == 8);
    assert(gbs::iso_tactical_audio_cue_count == 9);
}

} // namespace

int main() {
    {
        // Enemy navigation must use the traversable route, not slide towards
        // the target through a wall, and must stop before the occupied tile.
        const uint8_t walls[] = { 0,0,0,0,0, 0,1,1,1,0, 0,0,0,0,0 };
        const gbs::IsoTileMap map { walls, 5, 3 };
        gbs::IsoActor units[2] {};
        units[0].tile = { 0,1,0 }; units[0].visible = true;
        units[1].tile = { 4,1,0 }; units[1].visible = true;
        const auto path = gbs::plan_iso_tactical_approach(map, units, 2, 0, 1, 2, 1);
        assert(path.found && path.length == 2);
        assert(path.tiles[0].x == 0 && path.tiles[0].y != 1);
        assert(path.tiles[1].x == 1 && path.tiles[1].y == path.tiles[0].y);
        units[0].tile = { 4,0,0 };
        assert(gbs::iso_tactical_can_attack(units[0].tile, units[1].tile, 1));
        assert(!gbs::plan_iso_tactical_approach(map, units, 2, 0, 1, 2, 1).found);
        assert(!gbs::iso_tactical_can_attack({4,0,1}, units[1].tile, 1));
        assert(!gbs::iso_tactical_can_attack(units[1].tile, units[1].tile, 1));
        units[1].visible = false;
        assert(!gbs::plan_iso_tactical_approach(map, units, 2, 0, 1, 2, 1).found);
    }
    {
        // The AI can climb a authored ramp to reach the opponent's level.
        const uint8_t flags[] = {0,0,0,0};
        const uint8_t heights[] = {0,1,1,1};
        const uint8_t ramps[] = {0,2,0,0};
        const gbs::IsoTileMap map {flags,4,1,heights,ramps};
        assert(gbs::iso_tactical_can_attack({0,0,0}, {1,0,1}, 1, &map));
        assert(gbs::iso_tactical_can_attack({1,0,1}, {0,0,0}, 1, &map));
        const uint8_t no_ramps[] = {0,0,0,0};
        const gbs::IsoTileMap cliff {flags,4,1,heights,no_ramps};
        assert(!gbs::iso_tactical_can_attack({0,0,0}, {1,0,1}, 1, &cliff));
        gbs::IsoActor units[2] {};
        units[0].tile = {0,0,0}; units[0].visible = true;
        units[1].tile = {3,0,1}; units[1].visible = true;
        const auto path = gbs::plan_iso_tactical_approach(map,units,2,0,1,2,1);
        assert(path.found && path.length == 2);
        assert(path.tiles[1].x == 2 && path.tiles[1].z == 1);
        assert(gbs::iso_tactical_can_attack(path.tiles[1], units[1].tile, 1));
    }
    {
        uint8_t source[64] {};
        source[0] = 0x21;
        source[32] = 0x43;
        uint16_t entries[] = { 0x2000, 0x5001 };
        const gbs::TileMapAsset map { entries, 2, 1 };
        const gbs::TileAsset tiles { source, 2, 0, false };
        const uint8_t visual[] = { 1 };
        gbs::IsometricRoomData room {};
        room.width_tiles = room.height_tiles = 1;
        room.visual_tiles = visual;
        room.grid = gbs::IsoGridConfig { 16, 8, gbs::Vec2i { 8, 0 } };
        room.tileset_tilemap = &map;
        room.tileset_tiles = &tiles;
        room.tileset_tile_width_pixels = 16;
        room.tileset_tile_height_pixels = 8;
        gbs::IsoCamera camera {};
        uint8_t output[30 * 20 * 64];
        for (auto& pixel : output) pixel = 0xff;
        assert(!gbs::render_iso_room_surface_indexed(room, camera, output, sizeof(output) - 1));
        assert(output[0] == 0xff);
        assert(gbs::render_iso_room_surface_indexed(room, camera, output, sizeof(output)));
        assert(output[0] == 0x21 && output[1] == 0x22);
        assert(output[64] == 0x53 && output[65] == 0x54);
        assert(output[2] == 0); // index zero stays transparent in every bank
        entries[0] |= (1u << 10) | (1u << 11);
        assert(gbs::render_iso_room_surface_indexed(room, camera, output, sizeof(output)));
        assert(output[63] == 0x21 && output[62] == 0x22);
        assert(output[0] == 0);
        entries[0] = 0x2000;
        room.grid.origin_pixels = gbs::Vec2i { 120, 80 };
        camera.zoom_x256 = camera.target_zoom_x256 = 512;
        assert(gbs::render_iso_room_surface_indexed(room, camera, output, sizeof(output)));
        const auto pixel_at = [&](int x, int y) {
            return output[((y / 8) * 30 + x / 8) * 64 + (y & 7) * 8 + (x & 7)];
        };
        assert(pixel_at(104, 80) == 0x21 && pixel_at(105, 81) == 0x21);
        assert(pixel_at(120, 80) == 0x53 && pixel_at(121, 81) == 0x53);
        room.tileset_render_offset_y_pixels = -8;
        assert(gbs::render_iso_room_surface_indexed(room, camera, output, sizeof(output)));
        assert(pixel_at(104, 64) == 0x21 && pixel_at(104, 80) == 0);
    }
    {
        uint8_t source[128] {};
        source[0] = 1;
        source[64] = 29;
        uint16_t entries[] = { 0, 1 };
        const gbs::TileMapAsset map { entries, 2, 1 };
        const gbs::TileAsset tiles { source, 2, 0, false, gbs::ColorDepth::Bpp8 };
        const uint8_t visual[] = { 1 };
        gbs::IsometricRoomData room {};
        room.width_tiles = room.height_tiles = 1;
        room.visual_tiles = visual;
        room.grid = gbs::IsoGridConfig { 16, 8, gbs::Vec2i { 8, 0 } };
        room.tileset_tilemap = &map;
        room.tileset_tiles = &tiles;
        room.tileset_tile_width_pixels = 16;
        room.tileset_tile_height_pixels = 8;
        gbs::IsoCamera camera {};
        uint8_t output[30 * 20 * 64] {};
        assert(gbs::render_iso_room_surface_indexed(room, camera, output, sizeof(output)));
        assert(output[0] == 1 && output[64] == 29);
    }
    test_iso_tile_to_screen_uses_2_to_1_projection();
    test_iso_screen_to_tile_inverts_tile_centers();
    test_iso_depth_key_orders_back_to_front();
    test_draw_iso_sprites_can_enable_object_mosaic();
    test_iso_metasprite_preserves_8bpp_through_draw_list();
    test_iso_camera_follow_and_clamp();
    test_iso_tactical_surface_page_selection_uses_camera_center();
    test_iso_tactical_surface_camera_locks_visible_page_until_ready();
    test_iso_camera_zone_uses_tile_area_and_pixel_camera_constraints();
    test_iso_camera_zone_bounds_can_restore_base_room_bounds();
    test_iso_actor_direction_values_match_runtime_telemetry_contract();
    test_iso_camera_projection_applies_zoom_around_viewport_center();
    test_iso_camera_tick_supports_dead_zone_smoothing_pan_and_shake();
    test_build_iso_draw_list_applies_camera_and_offsets();
    test_build_iso_draw_list_expands_composite_actor_metasprite();
    test_build_iso_draw_list_culls_fully_offscreen_sprites();
    test_iso_surface_camera_snaps_only_at_native_scale_without_offsets();
    test_authored_isometric_background_mode_is_explicit();
    test_tactical_surface_can_fall_back_to_authored_background();
    test_render_iso_room_surface_scales_tiles_with_camera_zoom();
    test_render_iso_room_surface_decodes_real_32x16_4bpp_diamond();
    test_render_iso_room_surface_uses_visual_32x32_atlas_slots();
    test_sort_iso_draw_list_assigns_front_items_to_lower_oam_indices();
    test_iso_surface_tile_cache_only_reports_changed_hardware_tiles();
    test_iso_actor_uses_one_level_height_map_as_a_ramp();
    test_iso_movement_repeat_is_immediate_then_continuous_while_held();
    test_iso_free_movement_diagonals_do_not_cut_corners_or_tunnel();
    test_iso_free_movement_preserves_subtile_position_until_crossing_cell();
    test_iso_free_movement_respects_blocked_destination_and_height_ramps();
    test_iso_free_movement_projects_subtile_position_for_rendering();
    test_iso_surface_compaction_deduplicates_transparent_foreground_tiles();
    test_iso_pick_tile_uses_diamond_mask_and_bounds();
    test_iso_collision_blocks_tiles_and_actors();
    test_move_iso_actor_respects_map_and_actor_blockers();
    test_iso_greedy_path_step_prefers_open_axis();
    test_iso_bfs_path_step_routes_around_blocked_tiles();
    test_iso_astar_path_step_routes_around_blocked_tiles_and_actors();
    test_iso_tactical_move_requires_reachable_steps_and_ramp();
    test_iso_cursor_moves_inside_bounds_and_can_reject_blocked_tiles();
    test_iso_cursor_tracks_tile_height_when_crossing_a_step();
    test_iso_room_cursor_start_uses_room_data_then_actor_fallback();
    test_iso_cursor_actor_lookup_resolves_visible_actor_script();
    test_iso_actor_animation_supports_tactical_states_without_looping();
    test_iso_tactical_markers_use_independent_metasprites();
    test_iso_tactical_marker_center_offset_matches_native_frame();
    test_iso_tactical_presentation_tracks_explicit_capabilities_and_layers();
    test_iso_tactical_audio_cues_have_stable_native_indices();
    test_iso_actor_event_command_batch_consumes_event_state();
    test_iso_actor_event_script_lookup_executes_runtime_effects();
    test_iso_actor_animation_selects_idle_walk_direction_and_frames();
    return 0;
}
