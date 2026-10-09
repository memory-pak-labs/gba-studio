#include <cassert>
#include <stdint.h>
#include "../../engine/src/gbs_room_tilemap.h"
#include "gbs/event.hpp"
#include "gbs/interrupt.hpp"
#include "gbs/render.hpp"

namespace {

int affine_dma_layer=-1;
uint32_t affine_dma_words[644]{};
int bg_mosaic_calls = 0;
int based_bg_upload_calls = 0;
uint32_t based_bg_physical_tile = 0;
int screen_base_calls = 0;

void test_based_bg_upload_respects_tilemap_and_obj_memory() {
    const uint8_t data[32] {};
    assert(gbs::load_bg_tiles_at_character_base(gbs::TileAsset { data, 1, 511, false }, 2));
    assert(based_bg_upload_calls == 1 && based_bg_physical_tile == 1535);
    assert(!gbs::load_bg_tiles_at_character_base(gbs::TileAsset { data, 2, 511, false }, 2));
    assert(!gbs::load_bg_tiles_at_character_base(gbs::TileAsset { data, 1, 0, true }, 2));
    assert(!gbs::load_bg_tiles_at_character_base(gbs::TileAsset { data, 1, 0, false }, 3));
    assert(based_bg_upload_calls == 1);
    const uint8_t indexed[64] {};
    assert(gbs::load_bg_tiles_at_character_base(gbs::TileAsset { indexed, 1, 255, false, gbs::ColorDepth::Bpp8 }, 2));
    assert(based_bg_physical_tile == 1534);
    assert(!gbs::load_bg_tiles_at_character_base(gbs::TileAsset { indexed, 1, 256, false, gbs::ColorDepth::Bpp8 }, 2));
    gbs::set_bg_screen_base(gbs::BackgroundLayer::BG2, 26);
    gbs::set_bg_screen_base(gbs::BackgroundLayer::BG2, 32);
    gbs::set_bg_screen_base(static_cast<gbs::BackgroundLayer>(4), 26);
    assert(screen_base_calls == 1);
}
int last_bg_mosaic_layer = -1;
int last_bg_mosaic_enabled = -1;
int sprite_calls = 0;
int last_sprite_index = -1;
uint16_t last_sprite_mode = 0;
uint16_t last_sprite_priority = 0;
int last_sprite_mosaic = -1;
uint16_t last_sprite_shape = 0;
uint16_t last_sprite_size = 0;
int mosaic_calls = 0;
uint16_t last_mosaic_bg_x = 0;
uint16_t last_mosaic_obj_y = 0;
int room_draw_calls = 0;
int last_room_draw_layer = -1;
int scroll_calls = 0;
int last_scroll_layer = -1;
int last_scroll_x = 0;
int last_scroll_y = 0;
int display_mode_calls = 0;
uint16_t last_display_mode = 0;
int affine_transform_calls = 0;
int affine_wrap_calls = 0;
int last_affine_wrap_layer = -1;
int last_affine_wrap_enabled = -1;
int affine_sprite_calls = 0;
int affine_sprite_matrix_calls = 0;
int last_affine_sprite_index = -1;
int last_affine_matrix_index = -1;
int last_affine_double_size = -1;
gbs::AffineSpriteTransform last_affine_sprite_transform {};
int affine_tile_calls = 0;
int last_affine_tile_layer = -1;
int affine_tilemap_calls = 0;
int bitmap16_calls = 0;
int bitmap16_rect_calls = 0;
int bitmap8_rect_calls = 0;
int palette_calls = 0;
int bg_palette_calls = 0;
int obj_palette_calls = 0;
int bg4_tile_calls = 0;
int obj8_tile_calls = 0;
int sprite_color_depth_calls = 0;
int last_sprite_color_depth = -1;
uint8_t last_bg_tile_byte = 0;
uint16_t last_tilemap_entry = 0;
uint16_t last_palette_colors[16] = {};
uint16_t display_page_calls = 0;
int hblank_scroll_calls = 0;
int hblank_scroll_layer = -1;
int16_t first_hblank_scroll = 0;
int hblank_affine_calls = 0;
int internal_hblank_service_calls = 0;
int hblank_disable_calls = 0;
int hblank_affine_layer = -1;
int16_t hblank_affine_pa = 0;
int16_t hblank_affine_pc = 0;
int32_t hblank_affine_x = 0;
int32_t hblank_affine_y = 0;
int hblank_vcount = 0;
int text_input_keyboard_calls = 0;
int last_text_input_keyboard_x = 0;
int last_text_input_keyboard_y = 0;
int last_text_input_keyboard_width = 0;
int last_text_input_keyboard_height = 0;
int last_text_input_keyboard_selection = 0;
int last_text_input_keyboard_lowercase = 0;
int last_text_input_keyboard_visible = 0;
int text_overlay_light_calls = 0;
int last_text_overlay_light_x = 0;
int last_text_overlay_light_y = 0;
int last_text_overlay_light_width = 0;
int last_text_overlay_light_visible = 0;

void reset_spy() {
    bg_mosaic_calls = 0;
    last_bg_mosaic_layer = -1;
    last_bg_mosaic_enabled = -1;
    sprite_calls = 0;
    last_sprite_index = -1;
    last_sprite_mode = 0;
    last_sprite_priority = 0;
    last_sprite_mosaic = -1;
    last_sprite_shape = 0;
    last_sprite_size = 0;
    mosaic_calls = 0;
    last_mosaic_bg_x = 0;
    last_mosaic_obj_y = 0;
    room_draw_calls = 0;
    last_room_draw_layer = -1;
    scroll_calls = 0;
    last_scroll_layer = -1;
    last_scroll_x = 0;
    last_scroll_y = 0;
    display_mode_calls = 0;
    last_display_mode = 0;
    affine_transform_calls = 0;
    affine_wrap_calls = 0;
    last_affine_wrap_layer = -1;
    last_affine_wrap_enabled = -1;
    affine_sprite_calls = 0;
    affine_sprite_matrix_calls = 0;
    last_affine_sprite_index = -1;
    last_affine_matrix_index = -1;
    last_affine_double_size = -1;
    affine_tile_calls = 0;
    last_affine_tile_layer = -1;
    affine_tilemap_calls = 0;
    bitmap16_calls = 0;
    bitmap16_rect_calls = 0;
    bitmap8_rect_calls = 0;
    palette_calls = 0;
    bg_palette_calls = 0;
    obj_palette_calls = 0;
    bg4_tile_calls = 0;
    obj8_tile_calls = 0;
    sprite_color_depth_calls = 0;
    last_sprite_color_depth = -1;
    last_bg_tile_byte = 0;
    last_tilemap_entry = 0;
    display_page_calls = 0;
    hblank_scroll_calls = 0;
    hblank_scroll_layer = -1;
    first_hblank_scroll = 0;
    hblank_affine_calls = 0;
    internal_hblank_service_calls = 0;
    hblank_disable_calls = 0;
    hblank_affine_layer = -1;
    hblank_affine_pa = 0;
    hblank_affine_pc = 0;
    hblank_affine_x = 0;
    hblank_affine_y = 0;
    hblank_vcount = 0;
    text_input_keyboard_calls = 0;
    last_text_input_keyboard_x = 0;
    last_text_input_keyboard_y = 0;
    last_text_input_keyboard_width = 0;
    last_text_input_keyboard_height = 0;
    last_text_input_keyboard_selection = 0;
    last_text_input_keyboard_lowercase = 0;
    last_text_input_keyboard_visible = 0;
    text_overlay_light_calls = 0;
    last_text_overlay_light_x = 0;
    last_text_overlay_light_y = 0;
    last_text_overlay_light_width = 0;
    last_text_overlay_light_visible = 0;
}

void test_bg_mosaic_reaches_hardware_for_valid_layers() {
    reset_spy();

    gbs::set_bg_mosaic(gbs::BackgroundLayer::BG2, true);
    assert(bg_mosaic_calls == 1);
    assert(last_bg_mosaic_layer == 2);
    assert(last_bg_mosaic_enabled == 1);

    gbs::set_bg_mosaic(gbs::BackgroundLayer::BG2, false);
    assert(bg_mosaic_calls == 2);
    assert(last_bg_mosaic_layer == 2);
    assert(last_bg_mosaic_enabled == 0);

    gbs::set_bg_mosaic(static_cast<gbs::BackgroundLayer>(9), true);
    assert(bg_mosaic_calls == 2);
}

void test_sprite_mosaic_and_priority_reach_hardware() {
    reset_spy();

    gbs::set_sprite(4, gbs::Sprite {
        12,
        24,
        32,
        2,
        false,
        true,
        true,
        3,
        gbs::SpriteRenderMode::Alpha,
        true
    });

    assert(sprite_calls == 1);
    assert(last_sprite_index == 4);
    assert(last_sprite_priority == 3);
    assert(last_sprite_mode == static_cast<uint16_t>(gbs::SpriteRenderMode::Alpha));
    assert(last_sprite_mosaic == 1);

    gbs::set_sprite(5, gbs::Sprite {
        12,
        24,
        32,
        2,
        false,
        false,
        true,
        4,
        gbs::SpriteRenderMode::Normal,
        true
    });
    assert(sprite_calls == 1);
}

void test_native_sprite_dimensions_reach_hardware() {
    reset_spy();

    gbs::set_sprite(6, gbs::Sprite {
        12,
        24,
        32,
        2,
        false,
        false,
        true,
        0,
        gbs::SpriteRenderMode::Normal,
        false,
        32,
        8
    });

    assert(sprite_calls == 1);
    assert(last_sprite_shape == 1);
    assert(last_sprite_size == 1);

    assert(gbs::sprite_shape_for_dimensions(8, 8) == 0 && gbs::sprite_size_for_dimensions(8, 8) == 0);
    assert(gbs::sprite_shape_for_dimensions(16, 16) == 0 && gbs::sprite_size_for_dimensions(16, 16) == 1);
    assert(gbs::sprite_shape_for_dimensions(32, 32) == 0 && gbs::sprite_size_for_dimensions(32, 32) == 2);
    assert(gbs::sprite_shape_for_dimensions(64, 64) == 0 && gbs::sprite_size_for_dimensions(64, 64) == 3);
    assert(gbs::sprite_shape_for_dimensions(16, 8) == 1 && gbs::sprite_size_for_dimensions(16, 8) == 0);
    assert(gbs::sprite_shape_for_dimensions(32, 8) == 1 && gbs::sprite_size_for_dimensions(32, 8) == 1);
    assert(gbs::sprite_shape_for_dimensions(32, 16) == 1 && gbs::sprite_size_for_dimensions(32, 16) == 2);
    assert(gbs::sprite_shape_for_dimensions(64, 32) == 1 && gbs::sprite_size_for_dimensions(64, 32) == 3);
    assert(gbs::sprite_shape_for_dimensions(8, 16) == 2 && gbs::sprite_size_for_dimensions(8, 16) == 0);
    assert(gbs::sprite_shape_for_dimensions(8, 32) == 2 && gbs::sprite_size_for_dimensions(8, 32) == 1);
    assert(gbs::sprite_shape_for_dimensions(16, 32) == 2 && gbs::sprite_size_for_dimensions(16, 32) == 2);
    assert(gbs::sprite_shape_for_dimensions(32, 64) == 2 && gbs::sprite_size_for_dimensions(32, 64) == 3);
    assert(!gbs::is_valid_sprite_dimensions(24, 24));
}

void test_affine_sprite_matrix_and_flags_reach_hardware() {
    reset_spy();
    assert(gbs::set_affine_sprite_transform(5, gbs::AffineSpriteTransform { 256, 32, -32, 256 }));
    gbs::set_sprite(7, gbs::Sprite {
        40, 56, 12, 3, false, false, true,
        1, gbs::SpriteRenderMode::Normal, false, 32, 32,
        true, true, 5
    });

    assert(affine_sprite_matrix_calls == 1);
    assert(last_affine_matrix_index == 5);
    assert(last_affine_sprite_transform.pb == 32);
    assert(affine_sprite_calls == 1);
    assert(last_affine_sprite_index == 7);
    assert(last_affine_double_size == 1);
}

void test_affine_keyframes_apply_at_runtime_frame() {
    reset_spy();
    const gbs::AffineMatrixKeyframe sprite_keyframes[] = {
        { 0, gbs::AffineMatrix { 256, 0, 0, 256 } },
        { 10, gbs::AffineMatrix { 128, 64, -64, 512 } }
    };
    assert(gbs::set_affine_sprite_transform_at_frame(
        2,
        sprite_keyframes,
        2,
        5
    ));
    assert(affine_sprite_matrix_calls == 1);
    assert(last_affine_matrix_index == 2);
    assert(last_affine_sprite_transform.pa == 192);
    assert(last_affine_sprite_transform.pb == 32);
    assert(last_affine_sprite_transform.pc == -32);
    assert(last_affine_sprite_transform.pd == 384);

    const gbs::AffineTransformKeyframe background_keyframes[] = {
        { 0, gbs::AffineTransform { gbs::AffineMatrix { 256, 0, 0, 256 }, 0, 0 } },
        { 10, gbs::AffineTransform { gbs::AffineMatrix { 128, 0, 0, 512 }, 2560, 5120 } }
    };
    assert(gbs::set_affine_bg_transform_at_frame(
        gbs::BackgroundLayer::BG2,
        background_keyframes,
        2,
        5
    ));
    assert(affine_transform_calls == 1);
}

void test_dynamic_palette_and_bitmap_rect_updates() {
    reset_spy();
    const uint16_t colors[] = { 0x0000, 0x001F, 0x03E0, 0x7C00 };
    const gbs::PaletteAsset palette { colors, 4, 16 };
    assert(gbs::load_palette_cycled(palette, false, 1));
    assert(palette_calls == 1);
    assert(last_palette_colors[0] == 0x001F);
    assert(last_palette_colors[3] == 0x0000);
    assert(gbs::load_palette_blended(palette, false, 0x7FFF, 16));
    assert(last_palette_colors[0] == 0x7FFF);

    const uint16_t pixels16[4] = { 1, 2, 3, 4 };
    const uint8_t pixels8[4] = { 1, 2, 3, 4 };
    assert(gbs::update_bitmap16_rect(gbs::DisplayMode::Mode5Bitmap, 1, 2, 3, 2, 2, pixels16, 2));
    assert(gbs::update_bitmap8_rect(0, 2, 3, 2, 2, pixels8, 2));
    assert(bitmap16_rect_calls == 1);
    assert(bitmap8_rect_calls == 1);
}

void test_event_palette_commands_load_valid_assets_once() {
    reset_spy();
    const uint16_t bg_a[] = { 0x0000, 0x001F };
    const uint16_t bg_b[] = { 0x03E0, 0x7C00 };
    const uint16_t obj_a[] = { 0x0000, 0x7FFF };
    const uint16_t obj_b[] = { 0x4210, 0x03FF };
    const gbs::PaletteAsset bg_palettes[] = {
        { bg_a, 2, 0 },
        { bg_b, 2, 16 }
    };
    const gbs::PaletteAsset obj_palettes[] = {
        { obj_a, 2, 0 },
        { obj_b, 2, 32 }
    };
    gbs::EventState state {};
    state.background_palette_changed = true;
    state.background_palette_index = 1;
    state.background_palette_frames = 10;
    state.sprite_palette_changed = true;
    state.sprite_palette_index = 1;
    state.sprite_palette_frames = 6;

    assert(gbs::consume_event_palette_changes(state, bg_palettes, 2, obj_palettes, 2));
    assert(bg_palette_calls == 1);
    assert(obj_palette_calls == 1);
    assert(!state.background_palette_changed);
    assert(!state.sprite_palette_changed);
    assert(state.background_palette_frames == 10);
    assert(state.sprite_palette_frames == 6);

    assert(!gbs::consume_event_palette_changes(state, bg_palettes, 2, obj_palettes, 2));
    assert(bg_palette_calls == 1);
    assert(obj_palette_calls == 1);

    state.background_palette_changed = true;
    state.background_palette_index = 9;
    state.sprite_palette_changed = true;
    state.sprite_palette_index = -1;
    assert(!gbs::consume_event_palette_changes(state, bg_palettes, 2, nullptr, 0));
    assert(bg_palette_calls == 1);
    assert(obj_palette_calls == 1);
    assert(!state.background_palette_changed);
    assert(!state.sprite_palette_changed);
}

void test_regular_background_tile_depth_reaches_hardware() {
    reset_spy();
    const uint8_t tile_data[128] = {};

    assert(gbs::load_tiles(gbs::TileAsset { tile_data, 2, 0, false }));
    assert(bg4_tile_calls == 1);

    const uint16_t tilemap[] = { 0 };
    assert(gbs::load_tilemap(gbs::BackgroundLayer::BG2, gbs::TileMapAsset { tilemap, 1, 1 }));
}

void test_8bpp_object_tiles_and_sprite_depth_reach_hardware() {
    reset_spy();
    const uint8_t tile_data[64] = {};
    assert(gbs::load_tiles(gbs::TileAsset {
        tile_data,
        1,
        2,
        true,
        gbs::ColorDepth::Bpp8
    }));
    assert(obj8_tile_calls == 1);
    assert(bg4_tile_calls == 0);

    gbs::set_sprite(3, gbs::Sprite {
        16,
        24,
        2,
        0,
        false,
        false,
        true,
        0,
        gbs::SpriteRenderMode::Normal,
        false,
        16,
        16,
        false,
        false,
        0,
        gbs::ColorDepth::Bpp8
    });
    assert(sprite_color_depth_calls == 1);
    assert(last_sprite_color_depth == 1);

    gbs::set_sprite(4, gbs::Sprite {
        16,
        24,
        3,
        0,
        false,
        false,
        true,
        0,
        gbs::SpriteRenderMode::Normal,
        false,
        16,
        16,
        false,
        false,
        0,
        gbs::ColorDepth::Bpp8
    });
    assert(sprite_color_depth_calls == 1);
}

void test_huffman_assets_reach_hardware() {
    reset_spy();
    alignas(4) const uint8_t compressed[] = {
        0x28, 0x04, 0x00, 0x00,
        0x01, 0xC0, 'A', 'B',
        0x00, 0x00, 0x00, 0x50
    };

    assert(gbs::load_palette(gbs::HuffmanPaletteAsset {
        gbs::HuffmanAsset { compressed, sizeof(compressed), 4 },
        2,
        0
    }, false));
    assert(bg_palette_calls == 1);
    assert(last_palette_colors[0] == 0x4241);

    assert(gbs::load_tilemap(gbs::BackgroundLayer::BG2, gbs::HuffmanTileMapAsset {
        gbs::HuffmanAsset { compressed, sizeof(compressed), 4 },
        2,
        1
    }));
}

void test_primary_assets_consume_selected_compression() {
    reset_spy();

    alignas(4) const uint8_t palette_compressed[] = {
        0x28, 0x04, 0x00, 0x00,
        0x01, 0xC0, 'A', 'B',
        0x00, 0x00, 0x00, 0x50
    };
    const gbs::PaletteAsset compressed_palette {
        nullptr,
        2,
        0,
        gbs::AssetCompression::Huffman,
        palette_compressed,
        sizeof(palette_compressed),
        4
    };
    assert(gbs::load_palette(compressed_palette, false));
    assert(bg_palette_calls == 1);
    assert(last_palette_colors[0] == 0x4241);

    alignas(4) const uint8_t tile_compressed[] = {
        0x10, 0x20, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00
    };
    const gbs::TileAsset compressed_tiles {
        nullptr,
        1,
        0,
        false,
        gbs::ColorDepth::Bpp4,
        gbs::AssetCompression::Lz77,
        tile_compressed,
        sizeof(tile_compressed),
        32
    };
    assert(gbs::load_tiles(compressed_tiles));
    assert(bg4_tile_calls == 1);
    assert(last_bg_tile_byte == 0);

    const gbs::Rle16Run tilemap_runs[] = { { 0x1234, 2 } };
    const gbs::TileMapAsset compressed_tilemap {
        nullptr,
        2,
        1,
        gbs::AssetCompression::Rle16,
        tilemap_runs,
        1,
        2
    };
    assert(gbs::load_tilemap(gbs::BackgroundLayer::BG2, compressed_tilemap));
    assert(last_tilemap_entry == 0x1234);
}

void test_mosaic_size_config_reaches_hardware() {
    reset_spy();

    gbs::set_mosaic(gbs::MosaicConfig { 3, 4, 5, 6 });
    assert(mosaic_calls == 1);
    assert(last_mosaic_bg_x == 3);
    assert(last_mosaic_obj_y == 6);

    gbs::set_mosaic(gbs::MosaicConfig { 16, 0, 0, 0 });
    assert(mosaic_calls == 1);
}

void test_draw_room_targets_world_layer_bg1() {
    reset_spy();
    const uint8_t tiles[4] = {1, 2, 3, 4};
    gbs::draw_room_to_bg0(tiles, 2, 2, 0, 0);
    assert(room_draw_calls == 1);
    assert(last_room_draw_layer == 1);

    reset_spy();
    const uint16_t tiles16[4] = {1, 2, 3, 4};
    gbs::draw_room_to_bg0(tiles16, 2, 2, 8, 8);
    assert(room_draw_calls == 1);
    assert(last_room_draw_layer == 1);

    reset_spy();
    gbs::draw_room_to_bg(gbs::BackgroundLayer::BG3, tiles, 2, 2, 0, 0);
    assert(room_draw_calls == 1);
    assert(last_room_draw_layer == 3);

    reset_spy();
    gbs::draw_room_to_bg(gbs::BackgroundLayer::BG0, tiles16, 2, 2, 0, 0);
    assert(room_draw_calls == 1);
    assert(last_room_draw_layer == 0);
}

void test_default_scroll_overload_stays_on_ui_bg0() {
    reset_spy();
    gbs::set_bg_scroll(3, 5);
    assert(scroll_calls == 1);
    assert(last_scroll_layer == 0);
    assert(last_scroll_x == 3);
    assert(last_scroll_y == 5);

    gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, 7, 9);
    assert(scroll_calls == 2);
    assert(last_scroll_layer == 1);
    assert(last_scroll_x == 7);
    assert(last_scroll_y == 9);
}

void test_hblank_offsets_are_composed_with_camera_scroll() {
    reset_spy();
    int16_t offsets[160] = {};
    offsets[0] = -3;
    offsets[80] = 4;
    gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, 120, 9);
    assert(gbs::set_hblank_bg_scroll(gbs::BackgroundLayer::BG2, offsets, 160));
    assert(hblank_scroll_calls == 1);
    assert(hblank_scroll_layer == 2);
    assert(first_hblank_scroll == 117);
}

void test_hblank_affine_raster_applies_the_next_visible_line() {
    reset_spy();
    const auto handle=gbs::add_internal_interrupt_callback(gbs::InterruptSource::HBlank,[](){++internal_hblank_service_calls;});
    gbs::enable_internal_interrupt(gbs::InterruptSource::HBlank);
    gbs::HBlankAffineRasterLine lines[gbs::hblank_affine_raster_line_count]={};
    lines[1]={120,-24,1234,5678,true};
    assert(!gbs::set_hblank_affine_raster(gbs::BackgroundLayer::BG1,lines,gbs::hblank_affine_raster_line_count));
    assert(gbs::set_hblank_affine_raster(gbs::BackgroundLayer::BG2,lines,gbs::hblank_affine_raster_line_count));
    assert(affine_dma_layer==2 && affine_dma_words[4]==120u && affine_dma_words[5]==static_cast<uint16_t>(-24));
    assert(affine_dma_words[6]==1234u && affine_dma_words[7]==5678u);
    gbs::emit_interrupt(gbs::InterruptSource::HBlank);
    assert(internal_hblank_service_calls==1 && hblank_affine_calls==0);
    gbs::disable_hblank_effects();
    gbs::remove_internal_interrupt_callback(gbs::InterruptSource::HBlank,handle);
    gbs::disable_internal_interrupt(gbs::InterruptSource::HBlank);
}

void test_text_input_keyboard_reaches_hardware() {
    reset_spy();

    gbs::draw_text_input_keyboard(4, 8, 22, 6, 27, true, false);

    assert(text_input_keyboard_calls == 1);
    assert(last_text_input_keyboard_x == 4);
    assert(last_text_input_keyboard_y == 8);
    assert(last_text_input_keyboard_width == 22);
    assert(last_text_input_keyboard_height == 6);
    assert(last_text_input_keyboard_selection == 27);
    assert(last_text_input_keyboard_lowercase == 1);
    assert(last_text_input_keyboard_visible == 0);
}

void test_light_text_overlay_reaches_hardware() {
    reset_spy();

    gbs::draw_text_overlay_light(12, 6, 8, "NARA", true);

    assert(text_overlay_light_calls == 1);
    assert(last_text_overlay_light_x == 12);
    assert(last_text_overlay_light_y == 6);
    assert(last_text_overlay_light_width == 8);
    assert(last_text_overlay_light_visible == 1);
}

void test_video_composition_applies_affine_and_bitmap_paths() {
    reset_spy();
    gbs::VideoComposition affine = gbs::default_video_composition();
    affine.display_mode = gbs::DisplayMode::Mode2Affine;
    affine.affine_enabled = true;
    affine.affine_layer = gbs::BackgroundLayer::BG3;
    affine.affine_wrap = true;
    affine.affine_transform = gbs::AffineBgTransform { 0, -128, 256, 0, 120 * 256, 80 * 256 };
    const uint8_t affine_tiles[64] = {};
    const uint8_t affine_map[16 * 16] = {};
    const gbs::AffineTileAsset affine_tile_asset { affine_tiles, 1, 0 };
    const gbs::AffineTileMapAsset affine_map_asset { affine_map, 16, 16 };
    affine.affine_tiles = &affine_tile_asset;
    affine.affine_tilemap = &affine_map_asset;
    assert(gbs::apply_video_composition(affine));
    assert(display_mode_calls == 1);
    assert(last_display_mode == 2);
    assert(affine_transform_calls == 1);
    assert(affine_wrap_calls == 1);
    assert(last_affine_wrap_layer == 3);
    assert(last_affine_wrap_enabled == 1);
    assert(affine_tile_calls == 1);
    assert(last_affine_tile_layer == 3);
    assert(affine_tilemap_calls == 1);

    reset_spy();
    const uint16_t pixels[4] = { 1, 2, 3, 4 };
    const gbs::Bitmap16Asset bitmap_asset { pixels, 2, 2 };
    gbs::VideoComposition bitmap = gbs::default_video_composition();
    bitmap.display_mode = gbs::DisplayMode::Mode5Bitmap;
    bitmap.bitmap16 = &bitmap_asset;
    bitmap.bitmap_page = 1;
    assert(gbs::apply_video_composition(bitmap));
    assert(last_display_mode == 5);
    assert(bitmap16_calls == 1);
    assert(display_page_calls == 1);
}

} // namespace

extern "C" {

void gbs_hw_demo_tiles(void) {}
void gbs_hw_restore_ui_assets(void) {}
void gbs_hw_hide_all_sprites(void) {}
void gbs_hw_hide_sprites(int, int) {}
void gbs_hw_draw_text_at(int, int, int, const char*) {}
void gbs_hw_draw_text_overlay(int, int, int, const char*, int) {}
void gbs_hw_draw_text_overlay_slot(int, int, int, const char*, int, int) {}
void gbs_hw_draw_text_overlay_light(int x, int y, int width, const char*, int visible) {
    ++text_overlay_light_calls;
    last_text_overlay_light_x = x;
    last_text_overlay_light_y = y;
    last_text_overlay_light_width = width;
    last_text_overlay_light_visible = visible;
}
void gbs_hw_draw_text_input_surface(int, int, int, int, int) {}
void gbs_hw_draw_text_input_keyboard(int x, int y, int width, int height, int selected_index, int lowercase, int visible) {
    ++text_input_keyboard_calls;
    last_text_input_keyboard_x = x;
    last_text_input_keyboard_y = y;
    last_text_input_keyboard_width = width;
    last_text_input_keyboard_height = height;
    last_text_input_keyboard_selection = selected_index;
    last_text_input_keyboard_lowercase = lowercase;
    last_text_input_keyboard_visible = visible;
}

void gbs_hw_draw_text_input_keyboard_with_controls(int x, int y, int width, int height, int selected_index, int lowercase, int visible, int control_layout, int controls_x, int controls_y, int controls_width, int controls_height, int surface) {
    gbs_hw_draw_text_input_keyboard(x, y, width, height, selected_index, lowercase, visible);
    (void)control_layout;
    (void)controls_x;
    (void)controls_y;
    (void)controls_width;
    (void)controls_height;
    (void)surface;
}
void gbs_hw_load_bg_palette(const uint16_t* colors, uint32_t, uint32_t count) {
    ++palette_calls;
    ++bg_palette_calls;
    for (uint32_t index = 0; index < count && index < 16; ++index) last_palette_colors[index] = colors[index];
}
void gbs_hw_load_obj_palette(const uint16_t* colors, uint32_t, uint32_t count) {
    ++palette_calls;
    ++obj_palette_calls;
    for (uint32_t index = 0; index < count && index < 16; ++index) last_palette_colors[index] = colors[index];
}
void gbs_hw_load_bg_tiles(const uint8_t* data, uint32_t, uint32_t) {
    ++bg4_tile_calls;
    last_bg_tile_byte = data[0];
}
void gbs_hw_load_obj_tiles(const uint8_t*, uint32_t, uint32_t) {}
void gbs_hw_load_obj_tiles_8bpp(const uint8_t*, uint32_t, uint32_t) { ++obj8_tile_calls; }
void gbs_hw_set_sprite_color_depth(int, int eight_bpp) {
    ++sprite_color_depth_calls;
    last_sprite_color_depth = eight_bpp;
}
void gbs_hw_load_bg_tilemap(int, const uint16_t* entries, uint32_t, uint32_t, uint32_t) {
    last_tilemap_entry = entries[0];
}
void gbs_hw_set_bg_tilemap_entry(int, uint32_t, uint32_t, uint32_t, uint32_t, uint16_t) {}
void gbs_hw_load_affine_bg_tiles(const uint8_t*, uint32_t, uint32_t) {
    ++affine_tile_calls;
    last_affine_tile_layer = 2;
}
void gbs_hw_load_affine_bg_tiles_for_layer(int layer, const uint8_t*, uint32_t, uint32_t) {
    ++affine_tile_calls;
    last_affine_tile_layer = layer;
}
void gbs_hw_load_affine_bg_tilemap(int, const uint8_t*, uint32_t, uint32_t, uint32_t) { ++affine_tilemap_calls; }
void gbs_hw_set_display_mode(uint16_t mode) { ++display_mode_calls; last_display_mode = mode; }
void gbs_hw_set_affine_bg_wrap(int layer, int enabled) {
    ++affine_wrap_calls;
    last_affine_wrap_layer = layer;
    last_affine_wrap_enabled = enabled;
}
void gbs_hw_set_affine_bg_transform(int, int16_t, int16_t, int16_t, int16_t, int32_t, int32_t) { ++affine_transform_calls; }
void gbs_hw_load_bitmap16(uint16_t, const uint16_t*, uint16_t, uint16_t, uint16_t) { ++bitmap16_calls; }
void gbs_hw_load_bitmap8(const uint8_t*, uint16_t, uint16_t, uint16_t) {}
void gbs_hw_fill_bitmap16(uint16_t, uint16_t, uint16_t) {}
void gbs_hw_update_bitmap16_rect(uint16_t, uint16_t, uint16_t, uint16_t, uint16_t, uint16_t, const uint16_t*, uint16_t) { ++bitmap16_rect_calls; }
void gbs_hw_update_bitmap8_rect(uint16_t, uint16_t, uint16_t, uint16_t, uint16_t, const uint8_t*, uint16_t) { ++bitmap8_rect_calls; }
void gbs_hw_set_display_frame_page(uint16_t) { ++display_page_calls; }
void gbs_hw_set_bg_priority(int, uint16_t) {}
void gbs_hw_set_bg_character_base(int, uint16_t) {}
void gbs_hw_set_bg_color_depth(int, int) {}
void gbs_hw_set_ui_character_base(uint16_t) {}
void gbs_hw_load_bg_tiles_8bpp(const uint8_t*, uint32_t tile, uint32_t, uint16_t base) {
    ++based_bg_upload_calls;
    based_bg_physical_tile = base * 512u + tile * 2u;
}
void gbs_hw_set_bg_screen_base(int, uint16_t) { ++screen_base_calls; }
void gbs_hw_load_bg_tiles_at_character_base(const uint8_t*, uint32_t tile, uint32_t, uint16_t base) {
    ++based_bg_upload_calls;
    based_bg_physical_tile = base * 512u + tile;
}
void gbs_hw_set_bg_enabled(int, int) {}
void gbs_hw_set_blending(uint16_t, uint16_t, uint16_t, uint16_t, uint16_t, uint16_t) {}
void gbs_hw_disable_blending(void) {}
void gbs_hw_disable_mosaic(void) {}
void gbs_hw_set_window0(uint16_t, uint16_t, uint16_t, uint16_t, uint16_t, uint16_t, int) {}
void gbs_hw_set_window1(uint16_t, uint16_t, uint16_t, uint16_t, uint16_t, uint16_t, int) {}
void gbs_hw_set_obj_window(uint16_t, uint16_t, int) {}
void gbs_hw_start_hblank_bg_scroll(int layer, const int16_t* offsets) {
    ++hblank_scroll_calls;
    hblank_scroll_layer = layer;
    first_hblank_scroll = offsets[0];
}
void gbs_hw_disable_hblank_effects(void) { ++hblank_disable_calls; }
int gbs_hw_get_vcount(void) { return hblank_vcount; }
void gbs_hw_apply_affine_bg_raster_line(int layer, int16_t pa, int16_t pc, int32_t x, int32_t y) {
    ++hblank_affine_calls;
    hblank_affine_layer = layer;
    hblank_affine_pa = pa;
    hblank_affine_pc = pc;
    hblank_affine_x = x;
    hblank_affine_y = y;
}

void gbs_hw_set_bg_scroll(int layer, int x, int y) {
    ++scroll_calls;
    last_scroll_layer = layer;
    last_scroll_x = x;
    last_scroll_y = y;
}

void gbs_hw_draw_room_to_bg0(const uint8_t*, int, int, int, int) {
    ++room_draw_calls;
    last_room_draw_layer = 1; // production writes world room into BG1
}

void gbs_hw_draw_room16_to_bg0(const uint16_t*, int, int, int, int) {
    ++room_draw_calls;
    last_room_draw_layer = 1;
}

void gbs_hw_draw_room_to_bg(int layer, const uint8_t*, int, int, int, int) {
    ++room_draw_calls;
    last_room_draw_layer = layer;
}

void gbs_hw_draw_room16_to_bg(int layer, const uint16_t*, int, int, int, int) {
    ++room_draw_calls;
    last_room_draw_layer = layer;
}

void gbs_hw_set_bg_mosaic(int layer, int enabled) {
    ++bg_mosaic_calls;
    last_bg_mosaic_layer = layer;
    last_bg_mosaic_enabled = enabled;
}

void gbs_hw_set_sprite(int index, int, int, uint16_t, uint16_t, int, int, int, uint16_t priority, uint16_t mode, int mosaic, uint16_t shape, uint16_t size) {
    ++sprite_calls;
    last_sprite_index = index;
    last_sprite_priority = priority;
    last_sprite_mode = mode;
    last_sprite_mosaic = mosaic;
    last_sprite_shape = shape;
    last_sprite_size = size;
}

void gbs_hw_set_sprite_affine(int index, int enabled, int double_size, uint16_t matrix_index) {
    ++affine_sprite_calls;
    last_affine_sprite_index = index;
    last_affine_double_size = double_size;
    last_affine_matrix_index = enabled ? matrix_index : -1;
}

void gbs_hw_set_sprite_affine_matrix(uint16_t matrix_index, int16_t pa, int16_t pb, int16_t pc, int16_t pd) {
    ++affine_sprite_matrix_calls;
    last_affine_matrix_index = matrix_index;
    last_affine_sprite_transform = gbs::AffineSpriteTransform { pa, pb, pc, pd };
}

void gbs_hw_set_mosaic(uint16_t bg_x, uint16_t, uint16_t, uint16_t obj_y) {
    ++mosaic_calls;
    last_mosaic_bg_x = bg_x;
    last_mosaic_obj_y = obj_y;
}

}

void test_room_tilemap_cache_preserves_scroll_and_invalidates_sources() {
    const uint16_t map[4] { 1, 2, 3, 4 }, replacement[4] { 4, 3, 2, 1 };
    gbs::RoomTilemapCache cache {};
    room_draw_calls = 0;
    const auto draw = [&](const uint16_t* source, int width, int height, int x, int y,
        gbs::BackgroundLayer layer = gbs::BackgroundLayer::BG2) {
        gbs::draw_room_to_bg_cached(layer, source, width, height, x, y, cache);
    };
    draw(map, 2, 2, 0, 0);
    draw(map, 2, 2, 7, 7);
    assert(room_draw_calls == 1); // Pixel scroll does not change the tile window.
    draw(map, 2, 2, 8, 7);
    draw(map, 2, 2, 8, 8);
    assert(room_draw_calls == 3);
    draw(replacement, 2, 2, 8, 8);
    draw(replacement, 1, 2, 8, 8);
    draw(replacement, 1, 1, 8, 8);
    draw(replacement, 1, 1, 8, 8, gbs::BackgroundLayer::BG3);
    assert(room_draw_calls == 7);
    cache = {};
    draw(replacement, 1, 1, 8, 8, gbs::BackgroundLayer::BG3);
    assert(room_draw_calls == 8); // Re-entering a runtime must publish again.
    draw(replacement, 1, 1, 8, 8, static_cast<gbs::BackgroundLayer>(4));
    assert(room_draw_calls == 8);
    draw(nullptr, 1, 1, 8, 8);
    assert(room_draw_calls == 9); // Clearing a previously populated layer remains supported.
}

static void test_room_tilemap_rows_preserve_edges_and_full_entries() {
    const uint16_t source[] { 0x1801, 0x2C02, 0x3403, 0x4404 };
    uint16_t output[1024];
    gbs_stage_room_tilemap16(output, source, 2, 2, 0, 0);
    assert(output[0] == 0x1801 && output[1] == 0x2C02);
    assert(output[32] == 0x3403 && output[33] == 0x4404);
    assert(output[2] == 0 && output[64] == 0 && output[1023] == 0);
    gbs_stage_room_tilemap16(output, source, 2, 2, -8, -8);
    assert(output[0] == 0 && output[32] == 0);
    assert(output[33] == 0x1801 && output[34] == 0x2C02);
    assert(output[65] == 0x3403 && output[66] == 0x4404);
    gbs_stage_room_tilemap16(output, source, 2, 2, 8, 8);
    assert(output[0] == 0x4404 && output[1] == 0 && output[32] == 0);
    gbs_stage_room_tilemap16(output, source, 2, 2, -7, -7);
    assert(output[0] == 0x1801); // Preserve the room streaming division convention.
    gbs_stage_room_tilemap16(output, nullptr, 2, 2, 0, 0);
    for (const auto tile : output) assert(tile == 0);
    gbs_stage_room_tilemap16(output, source, 0, 2, 0, 0);
    for (const auto tile : output) assert(tile == 0);
    gbs_stage_room_tilemap16(output, source, INT32_MIN, 2, 8, 0);
    for (const auto tile : output) assert(tile == 0);
    gbs_stage_room_tilemap16(output, source, 2, 2, 16, 16);
    for (const auto tile : output) assert(tile == 0);
}

int main() {
    test_room_tilemap_rows_preserve_edges_and_full_entries();
    test_room_tilemap_cache_preserves_scroll_and_invalidates_sources();
    test_based_bg_upload_respects_tilemap_and_obj_memory();
    test_bg_mosaic_reaches_hardware_for_valid_layers();
    test_sprite_mosaic_and_priority_reach_hardware();
    test_native_sprite_dimensions_reach_hardware();
    test_affine_sprite_matrix_and_flags_reach_hardware();
    test_affine_keyframes_apply_at_runtime_frame();
    test_dynamic_palette_and_bitmap_rect_updates();
    test_event_palette_commands_load_valid_assets_once();
    test_regular_background_tile_depth_reaches_hardware();
    test_8bpp_object_tiles_and_sprite_depth_reach_hardware();
    test_huffman_assets_reach_hardware();
    test_primary_assets_consume_selected_compression();
    test_mosaic_size_config_reaches_hardware();
    test_draw_room_targets_world_layer_bg1();
    test_default_scroll_overload_stays_on_ui_bg0();
    test_hblank_offsets_are_composed_with_camera_scroll();
    test_hblank_affine_raster_applies_the_next_visible_line();
    test_text_input_keyboard_reaches_hardware();
    test_light_text_overlay_reaches_hardware();
    test_video_composition_applies_affine_and_bitmap_paths();
    return 0;
}

extern "C" void gbs_hw_start_hblank_affine(int layer,const uint32_t* words) {
    affine_dma_layer=layer;for(int i=0;i<644;++i)affine_dma_words[i]=words[i];
}
extern "C" uint32_t* gbs_hw_hblank_affine_buffer() { return affine_dma_words; }
