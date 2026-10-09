#include <cassert>
#include "gbs/assets.hpp"
#include "gbs/compression.hpp"
#include "gbs/render.hpp"

namespace {

void test_palette_asset_validation() {
    const uint16_t colors[] = { 0, 1, 2, 3 };

    assert(gbs::is_valid_palette_asset(gbs::PaletteAsset { colors, 4, 0 }));
    assert(gbs::is_valid_palette_asset(gbs::PaletteAsset { colors, 1, 255 }));
    assert(!gbs::is_valid_palette_asset(gbs::PaletteAsset { nullptr, 4, 0 }));
    assert(!gbs::is_valid_palette_asset(gbs::PaletteAsset { colors, 0, 0 }));
    assert(!gbs::is_valid_palette_asset(gbs::PaletteAsset { colors, 2, 255 }));
}

void test_tile_asset_validation() {
    const uint8_t data[] = { 0, 1, 2, 3 };

    assert(gbs::is_valid_tile_asset(gbs::TileAsset { data, 1, 0, false }));
    assert(gbs::is_valid_tile_asset(gbs::TileAsset { data, 4, 100, true }));
    assert(!gbs::is_valid_tile_asset(gbs::TileAsset { nullptr, 1, 0, false }));
    assert(!gbs::is_valid_tile_asset(gbs::TileAsset { data, 0, 0, false }));
    assert(!gbs::is_valid_tile_asset(gbs::TileAsset { data, 1, 1024, false }));
    assert(!gbs::is_valid_tile_asset(gbs::TileAsset { data, 2, 1023, false }));

    assert(gbs::is_valid_tile_asset(gbs::TileAsset { data, 1, 2, true, gbs::ColorDepth::Bpp8 }));
    assert(!gbs::is_valid_tile_asset(gbs::TileAsset { data, 1, 1, true, gbs::ColorDepth::Bpp8 }));
    assert(!gbs::is_valid_tile_asset(gbs::TileAsset { data, 513, 0, true, gbs::ColorDepth::Bpp8 }));
    assert(!gbs::is_valid_tile_asset(gbs::TileAsset { data, 1, 0, false, gbs::ColorDepth::Bpp8 }));
}

void test_tilemap_asset_validation() {
    const uint16_t entries[] = { 0, 1, 2, 3 };
    const uint8_t affine_entries[] = { 0, 1, 2, 3 };
    const uint8_t affine_tiles[64] = {};

    assert(gbs::is_valid_tilemap_asset(gbs::TileMapAsset { entries, 2, 2 }));
    assert(gbs::is_valid_tilemap_asset(gbs::TileMapAsset { entries, 64, 64 }));
    assert(!gbs::is_valid_tilemap_asset(gbs::TileMapAsset { nullptr, 2, 2 }));
    assert(!gbs::is_valid_tilemap_asset(gbs::TileMapAsset { entries, 0, 2 }));
    assert(!gbs::is_valid_tilemap_asset(gbs::TileMapAsset { entries, 65, 2 }));

    assert(gbs::is_valid_affine_tile_asset(gbs::AffineTileAsset { affine_tiles, 1, 0 }));
    assert(gbs::is_valid_affine_tile_asset(gbs::AffineTileAsset { affine_tiles, 16, 240 }));
    assert(!gbs::is_valid_affine_tile_asset(gbs::AffineTileAsset { nullptr, 1, 0 }));
    assert(!gbs::is_valid_affine_tile_asset(gbs::AffineTileAsset { affine_tiles, 0, 0 }));
    assert(!gbs::is_valid_affine_tile_asset(gbs::AffineTileAsset { affine_tiles, 2, 255 }));
    assert(gbs::is_valid_affine_tilemap_asset(gbs::AffineTileMapAsset { affine_entries, 16, 16 }));
    assert(gbs::is_valid_affine_tilemap_asset(gbs::AffineTileMapAsset { affine_entries, 128, 128 }));
    assert(!gbs::is_valid_affine_tilemap_asset(gbs::AffineTileMapAsset { nullptr, 16, 16 }));
    assert(!gbs::is_valid_affine_tilemap_asset(gbs::AffineTileMapAsset { affine_entries, 16, 32 }));
    assert(!gbs::is_valid_affine_tilemap_asset(gbs::AffineTileMapAsset { affine_entries, 8, 8 }));
}

void test_metasprite_validation() {
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false },
        { 8, 0, 1, 0, false, false }
    };

    assert(gbs::is_valid_metasprite(gbs::MetaSprite { parts, 2 }));
    assert(!gbs::is_valid_metasprite(gbs::MetaSprite { nullptr, 2 }));
    assert(!gbs::is_valid_metasprite(gbs::MetaSprite { parts, 0 }));

    const gbs::MetaSpritePart bpp8_part { 0, 0, 2, 0, false, false, 16, 16, gbs::ColorDepth::Bpp8 };
    assert(gbs::is_valid_metasprite(gbs::MetaSprite { &bpp8_part, 1 }));
    const gbs::MetaSpritePart odd_bpp8_part { 0, 0, 3, 0, false, false, 16, 16, gbs::ColorDepth::Bpp8 };
    assert(!gbs::is_valid_metasprite(gbs::MetaSprite { &odd_bpp8_part, 1 }));
    const gbs::MetaSpritePart large_part { 0, 0, 0, 0, false, false, 64, 64 };
    assert(gbs::is_valid_metasprite(gbs::MetaSprite { &large_part, 1 }));
    const gbs::MetaSpritePart invalid_dimension_part { 0, 0, 0, 0, false, false, 24, 24 };
    assert(!gbs::is_valid_metasprite(gbs::MetaSprite { &invalid_dimension_part, 1 }));
}

void test_sprite_animation_validation() {
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { parts, 1 }, 4 }
    };

    assert(gbs::is_valid_sprite_animation(gbs::SpriteAnimation { frames, 1, true }));
    assert(!gbs::is_valid_sprite_animation(gbs::SpriteAnimation { nullptr, 1, true }));
}

void test_render_asset_cost_estimates() {
    const uint16_t colors[] = { 0, 1, 2, 3 };
    const uint8_t tile_data[64] = {};
    const uint16_t tilemap_entries[64] = {};
    const uint8_t affine_entries[256] = {};
    const uint16_t pixels16[8] = {};
    const uint8_t pixels8[8] = {};
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false },
        { 8, 0, 1, 0, false, false }
    };

    gbs::RenderAssetCost palette_cost = gbs::estimate_palette_asset_cost(gbs::PaletteAsset { colors, 4, 16 });
    assert(palette_cost.valid);
    assert(palette_cost.palette_colors == 4);
    assert(palette_cost.palette_bytes == 8);

    gbs::RenderAssetCost bg_tile_cost = gbs::estimate_tile_asset_cost(gbs::TileAsset { tile_data, 2, 32, false });
    assert(bg_tile_cost.valid);
    assert(bg_tile_cost.bg_tiles == 2);
    assert(bg_tile_cost.tile_bytes == 64);

    gbs::RenderAssetCost obj_tile_cost = gbs::estimate_tile_asset_cost(gbs::TileAsset { tile_data, 2, 32, true });
    assert(obj_tile_cost.valid);
    assert(obj_tile_cost.obj_tiles == 2);
    assert(obj_tile_cost.tile_bytes == 64);

    gbs::RenderAssetCost obj_8bpp_cost = gbs::estimate_tile_asset_cost(
        gbs::TileAsset { tile_data, 2, 32, true, gbs::ColorDepth::Bpp8 }
    );
    assert(obj_8bpp_cost.valid);
    assert(obj_8bpp_cost.obj_tiles == 2);
    assert(obj_8bpp_cost.tile_bytes == 128);

    gbs::RenderAssetCost tilemap_cost = gbs::estimate_tilemap_asset_cost(gbs::TileMapAsset { tilemap_entries, 8, 8 });
    assert(tilemap_cost.valid);
    assert(tilemap_cost.tilemap_entries == 64);
    assert(tilemap_cost.tilemap_bytes == 128);
    assert(tilemap_cost.screenblocks == 1);

    gbs::RenderAssetCost affine_cost = gbs::estimate_affine_tilemap_asset_cost(gbs::AffineTileMapAsset { affine_entries, 16, 16 });
    assert(affine_cost.valid);
    assert(affine_cost.tilemap_entries == 256);
    assert(affine_cost.tilemap_bytes == 256);
    assert(affine_cost.screenblocks == 1);

    gbs::RenderAssetCost bitmap16_cost = gbs::estimate_bitmap16_asset_cost(gbs::DisplayMode::Mode3Bitmap, gbs::Bitmap16Asset { pixels16, 4, 2 });
    assert(bitmap16_cost.valid);
    assert(bitmap16_cost.bitmap_pixels == 8);
    assert(bitmap16_cost.bitmap_bytes == 16);

    gbs::RenderAssetCost bitmap8_cost = gbs::estimate_bitmap8_asset_cost(gbs::DisplayMode::Mode4Bitmap, gbs::Bitmap8Asset { pixels8, 4, 2 });
    assert(bitmap8_cost.valid);
    assert(bitmap8_cost.bitmap_pixels == 8);
    assert(bitmap8_cost.bitmap_bytes == 8);

    gbs::RenderAssetCost metasprite_cost = gbs::estimate_metasprite_cost(gbs::MetaSprite { parts, 2 });
    assert(metasprite_cost.valid);
    assert(metasprite_cost.oam_sprites == 2);

    gbs::RenderAssetCost combined = gbs::add_render_asset_cost(bg_tile_cost, tilemap_cost);
    assert(combined.valid);
    assert(combined.bg_tiles == 2);
    assert(combined.tilemap_bytes == 128);

    assert(!gbs::estimate_tilemap_asset_cost(gbs::TileMapAsset { nullptr, 8, 8 }).valid);
}

void test_background_layer_validation() {
    assert(gbs::is_valid_background_layer(gbs::BackgroundLayer::BG0));
    assert(gbs::is_valid_background_layer(gbs::BackgroundLayer::BG3));
    assert(!gbs::is_valid_affine_background_layer(gbs::BackgroundLayer::BG0));
    assert(!gbs::is_valid_affine_background_layer(gbs::BackgroundLayer::BG1));
    assert(gbs::is_valid_affine_background_layer(gbs::BackgroundLayer::BG2));
    assert(gbs::is_valid_affine_background_layer(gbs::BackgroundLayer::BG3));
    assert(gbs::is_valid_display_mode(gbs::DisplayMode::Mode0Text));
    assert(gbs::is_valid_display_mode(gbs::DisplayMode::Mode1TextAffine));
    assert(gbs::is_valid_display_mode(gbs::DisplayMode::Mode2Affine));
    assert(gbs::is_valid_display_mode(gbs::DisplayMode::Mode3Bitmap));
    assert(gbs::is_valid_display_mode(gbs::DisplayMode::Mode4Bitmap));
    assert(gbs::is_valid_display_mode(gbs::DisplayMode::Mode5Bitmap));
    assert(!gbs::is_valid_display_mode(static_cast<gbs::DisplayMode>(6)));
    assert(gbs::is_valid_render_priority(0));
    assert(gbs::is_valid_render_priority(3));
    assert(!gbs::is_valid_render_priority(4));
    assert(gbs::is_valid_sprite_render_mode(gbs::SpriteRenderMode::Normal));
    assert(gbs::is_valid_sprite_render_mode(gbs::SpriteRenderMode::Alpha));
    assert(gbs::is_valid_sprite_render_mode(gbs::SpriteRenderMode::Window));
    assert(!gbs::is_valid_sprite_render_mode(static_cast<gbs::SpriteRenderMode>(3)));
}

void test_bitmap_mode_validation() {
    const uint16_t pixels16[] = { 0x001F, 0x03E0, 0x7C00, 0x7FFF };
    const uint8_t pixels8[] = { 1, 2, 3, 4 };

    assert(gbs::is_bitmap_display_mode(gbs::DisplayMode::Mode3Bitmap));
    assert(gbs::is_bitmap_display_mode(gbs::DisplayMode::Mode4Bitmap));
    assert(gbs::is_bitmap_display_mode(gbs::DisplayMode::Mode5Bitmap));
    assert(!gbs::is_bitmap_display_mode(gbs::DisplayMode::Mode0Text));
    assert(gbs::bitmap_mode_width(gbs::DisplayMode::Mode3Bitmap) == 240);
    assert(gbs::bitmap_mode_height(gbs::DisplayMode::Mode3Bitmap) == 160);
    assert(gbs::bitmap_mode_width(gbs::DisplayMode::Mode5Bitmap) == 160);
    assert(gbs::bitmap_mode_height(gbs::DisplayMode::Mode5Bitmap) == 128);

    assert(gbs::is_valid_bitmap_page(gbs::DisplayMode::Mode3Bitmap, 0));
    assert(!gbs::is_valid_bitmap_page(gbs::DisplayMode::Mode3Bitmap, 1));
    assert(gbs::is_valid_bitmap_page(gbs::DisplayMode::Mode4Bitmap, 1));
    assert(gbs::is_valid_bitmap_page(gbs::DisplayMode::Mode5Bitmap, 1));
    assert(!gbs::is_valid_bitmap_page(gbs::DisplayMode::Mode5Bitmap, 2));

    assert(gbs::is_valid_bitmap16_asset(gbs::DisplayMode::Mode3Bitmap, gbs::Bitmap16Asset { pixels16, 2, 2 }));
    assert(gbs::is_valid_bitmap16_asset(gbs::DisplayMode::Mode5Bitmap, gbs::Bitmap16Asset { pixels16, 160, 128 }));
    assert(!gbs::is_valid_bitmap16_asset(gbs::DisplayMode::Mode4Bitmap, gbs::Bitmap16Asset { pixels16, 2, 2 }));
    assert(!gbs::is_valid_bitmap16_asset(gbs::DisplayMode::Mode5Bitmap, gbs::Bitmap16Asset { pixels16, 161, 1 }));
    assert(!gbs::is_valid_bitmap16_asset(gbs::DisplayMode::Mode3Bitmap, gbs::Bitmap16Asset { nullptr, 2, 2 }));

    assert(gbs::is_valid_bitmap8_asset(gbs::DisplayMode::Mode4Bitmap, gbs::Bitmap8Asset { pixels8, 2, 2 }));
    assert(!gbs::is_valid_bitmap8_asset(gbs::DisplayMode::Mode3Bitmap, gbs::Bitmap8Asset { pixels8, 2, 2 }));
    assert(!gbs::is_valid_bitmap8_asset(gbs::DisplayMode::Mode4Bitmap, gbs::Bitmap8Asset { pixels8, 241, 1 }));
    assert(!gbs::is_valid_bitmap8_asset(gbs::DisplayMode::Mode4Bitmap, gbs::Bitmap8Asset { nullptr, 2, 2 }));
}

void test_background_map_size_selection() {
    assert(gbs::background_map_size_for_dimensions(32, 32) == gbs::BackgroundMapSize::Size32x32);
    assert(gbs::background_map_size_for_dimensions(64, 32) == gbs::BackgroundMapSize::Size64x32);
    assert(gbs::background_map_size_for_dimensions(32, 64) == gbs::BackgroundMapSize::Size32x64);
    assert(gbs::background_map_size_for_dimensions(64, 64) == gbs::BackgroundMapSize::Size64x64);
    assert(gbs::background_map_size_for_dimensions(65, 32) == gbs::BackgroundMapSize::Invalid);
    assert(gbs::background_screenblock_count(gbs::BackgroundMapSize::Size32x32) == 1);
    assert(gbs::background_screenblock_count(gbs::BackgroundMapSize::Size64x32) == 2);
    assert(gbs::background_screenblock_count(gbs::BackgroundMapSize::Size32x64) == 2);
    assert(gbs::background_screenblock_count(gbs::BackgroundMapSize::Size64x64) == 4);
    assert(gbs::background_screenblock_count(gbs::BackgroundMapSize::Invalid) == 0);

    assert(gbs::affine_background_map_size_for_dimensions(16, 16) == gbs::AffineBackgroundMapSize::Size16x16);
    assert(gbs::affine_background_map_size_for_dimensions(32, 32) == gbs::AffineBackgroundMapSize::Size32x32);
    assert(gbs::affine_background_map_size_for_dimensions(64, 64) == gbs::AffineBackgroundMapSize::Size64x64);
    assert(gbs::affine_background_map_size_for_dimensions(128, 128) == gbs::AffineBackgroundMapSize::Size128x128);
    assert(gbs::affine_background_map_size_for_dimensions(64, 32) == gbs::AffineBackgroundMapSize::Invalid);
    assert(gbs::affine_background_screenblock_count(gbs::AffineBackgroundMapSize::Size16x16) == 1);
    assert(gbs::affine_background_screenblock_count(gbs::AffineBackgroundMapSize::Size32x32) == 1);
    assert(gbs::affine_background_screenblock_count(gbs::AffineBackgroundMapSize::Size64x64) == 2);
    assert(gbs::affine_background_screenblock_count(gbs::AffineBackgroundMapSize::Size128x128) == 8);
}

void test_rle16_validation_and_decode() {
    const gbs::Rle16Run runs[] = {
        { 7, 2 },
        { 9, 3 }
    };
    uint16_t decoded[] = { 0, 0, 0, 0, 0 };

    gbs::Rle16Asset valid { runs, 2, 5 };
    assert(gbs::is_valid_rle16_asset(valid));
    assert(gbs::rle16_run_total(valid) == 5);
    assert(gbs::decode_rle16(valid, decoded, 5));
    assert(decoded[0] == 7);
    assert(decoded[1] == 7);
    assert(decoded[2] == 9);
    assert(decoded[4] == 9);

    const gbs::Rle16Run zero_count_runs[] = {
        { 1, 0 }
    };
    assert(!gbs::is_valid_rle16_asset(gbs::Rle16Asset { zero_count_runs, 1, 1 }));
    assert(!gbs::decode_rle16(valid, decoded, 4));
}

void test_rle16_tilemap_validation() {
    const gbs::Rle16Run runs[] = {
        { 1, 4 }
    };
    assert(gbs::is_valid_rle16_tilemap_asset(gbs::Rle16TileMapAsset {
        gbs::Rle16Asset { runs, 1, 4 },
        2,
        2
    }));
    assert(!gbs::is_valid_rle16_tilemap_asset(gbs::Rle16TileMapAsset {
        gbs::Rle16Asset { runs, 1, 4 },
        65,
        1
    }));
}

void test_lz77_validation_and_decode() {
    const uint8_t compressed[] = {
        0x10, 0x08, 0x00, 0x00,
        0x08,
        'A', 'B', 'C', 'D',
        0x10, 0x03
    };
    uint8_t decoded[8] = {};

    gbs::Lz77Asset valid { compressed, sizeof(compressed), 8 };
    assert(gbs::is_valid_lz77_asset(valid));
    assert(gbs::decode_lz77(valid, decoded, sizeof(decoded)));
    assert(decoded[0] == 'A');
    assert(decoded[3] == 'D');
    assert(decoded[4] == 'A');
    assert(decoded[7] == 'D');

    const uint8_t bad_header[] = { 0x11, 0x01, 0x00, 0x00, 0x00, 0x00 };
    assert(!gbs::is_valid_lz77_asset(gbs::Lz77Asset { bad_header, sizeof(bad_header), 1 }));

    const uint8_t bad_reference[] = {
        0x10, 0x03, 0x00, 0x00,
        0x80,
        0x00, 0x00
    };
    assert(!gbs::decode_lz77(gbs::Lz77Asset { bad_reference, sizeof(bad_reference), 3 }, decoded, sizeof(decoded)));
}

void test_huffman_validation_and_decode() {
    alignas(4) const uint8_t compressed[] = {
        0x28, 0x04, 0x00, 0x00,
        0x01, 0xC0, 'A', 'B',
        0x00, 0x00, 0x00, 0x50
    };
    uint8_t decoded[4] = {};

    gbs::HuffmanAsset valid { compressed, sizeof(compressed), 4 };
    assert(gbs::is_valid_huffman_asset(valid));
    assert(gbs::decode_huffman(valid, decoded, sizeof(decoded)));
    assert(decoded[0] == 'A');
    assert(decoded[1] == 'B');
    assert(decoded[2] == 'A');
    assert(decoded[3] == 'B');

    assert(gbs::is_valid_huffman_tilemap_asset(gbs::HuffmanTileMapAsset {
        valid,
        2,
        1
    }));
    assert(gbs::is_valid_huffman_palette_asset(gbs::HuffmanPaletteAsset {
        valid,
        2,
        0
    }));
    assert(!gbs::is_valid_huffman_asset(gbs::HuffmanAsset { compressed, sizeof(compressed), 5 }));
    assert(!gbs::decode_huffman(valid, decoded, sizeof(decoded) - 1));
}

void test_lz77_tilemap_validation() {
    const uint8_t compressed[] = {
        0x10, 0x08, 0x00, 0x00,
        0x00,
        0x01, 0x20, 0x02, 0x20, 0x03, 0x20, 0x04, 0x20
    };

    assert(gbs::is_valid_lz77_tilemap_asset(gbs::Lz77TileMapAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 8 },
        2,
        2
    }));
    assert(!gbs::is_valid_lz77_tilemap_asset(gbs::Lz77TileMapAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 8 },
        3,
        2
    }));
}

void test_lz77_tile_asset_validation() {
    const uint8_t compressed[] = {
        0x10, 0x20, 0x00, 0x00,
        0x00,
        0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08,
        0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f, 0x10,
        0x11, 0x12, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18,
        0x19, 0x1a, 0x1b, 0x1c, 0x1d, 0x1e, 0x1f, 0x20
    };

    assert(gbs::is_valid_lz77_tile_asset(gbs::Lz77TileAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 32 },
        1,
        7,
        false
    }));
    assert(!gbs::is_valid_lz77_tile_asset(gbs::Lz77TileAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 31 },
        1,
        7,
        false
    }));
    assert(!gbs::is_valid_lz77_tile_asset(gbs::Lz77TileAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 32 },
        2,
        7,
        false
    }));
    assert(!gbs::is_valid_lz77_tile_asset(gbs::Lz77TileAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 32 },
        1,
        1024,
        false
    }));

    const uint8_t compressed_8bpp[] = {
        0x10, 0x40, 0x00, 0x00,
        0x00,
    };
    assert(gbs::is_valid_lz77_tile_asset(gbs::Lz77TileAsset {
        gbs::Lz77Asset { compressed_8bpp, sizeof(compressed_8bpp), 64 },
        1,
        2,
        true,
        gbs::ColorDepth::Bpp8
    }));
}

void test_lz77_palette_asset_validation() {
    const uint8_t compressed[] = {
        0x10, 0x04, 0x00, 0x00,
        0x00,
        0x01, 0x00, 0xff, 0x7f
    };

    assert(gbs::is_valid_lz77_palette_asset(gbs::Lz77PaletteAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 4 },
        2,
        14
    }));
    assert(!gbs::is_valid_lz77_palette_asset(gbs::Lz77PaletteAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 3 },
        2,
        14
    }));
    assert(!gbs::is_valid_lz77_palette_asset(gbs::Lz77PaletteAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 4 },
        3,
        14
    }));
    assert(!gbs::is_valid_lz77_palette_asset(gbs::Lz77PaletteAsset {
        gbs::Lz77Asset { compressed, sizeof(compressed), 4 },
        2,
        255
    }));
}

void test_background_parallax() {
    gbs::BackgroundParallax parallax {
        gbs::BackgroundLayer::BG1,
        128,
        64,
        gbs::Vec2i { 3, 5 }
    };
    gbs::Vec2i scroll = gbs::parallax_scroll_for_camera(gbs::Vec2i { 40, 80 }, parallax);

    assert(gbs::is_valid_background_parallax(parallax));
    assert(scroll.x == 23);
    assert(scroll.y == 25);

    gbs::BackgroundParallax invalid {
        gbs::BackgroundLayer::BG2,
        2048,
        0,
        gbs::Vec2i { 0, 0 }
    };
    assert(!gbs::is_valid_background_parallax(invalid));
}

void test_render_effect_validation() {
    assert(gbs::is_valid_render_layer_mask(gbs::RenderLayerBG0 | gbs::RenderLayerOBJ));
    assert(gbs::is_valid_render_layer_mask(gbs::RenderLayerBG1 | gbs::RenderLayerSpecial));
    assert(!gbs::is_valid_render_layer_mask(1u << 7));

    assert(gbs::is_valid_blend_config(gbs::BlendConfig {
        static_cast<uint16_t>(gbs::RenderLayerBG1 | gbs::RenderLayerOBJ),
        gbs::RenderLayerBackdrop,
        gbs::BlendMode::Alpha,
        8,
        8,
        0
    }));
    assert(gbs::is_valid_blend_config(gbs::BlendConfig {
        gbs::RenderLayerBG0,
        0,
        gbs::BlendMode::Brighten,
        0,
        0,
        16
    }));
    assert(!gbs::is_valid_blend_config(gbs::BlendConfig {
        gbs::RenderLayerBG0,
        0,
        gbs::BlendMode::Darken,
        17,
        0,
        0
    }));

    assert(gbs::is_valid_mosaic_config(gbs::MosaicConfig { 0, 1, 14, 15 }));
    assert(!gbs::is_valid_mosaic_config(gbs::MosaicConfig { 16, 0, 0, 0 }));

    assert(gbs::is_valid_window_rect(gbs::WindowRect { 8, 120, 16, 100 }));
    assert(!gbs::is_valid_window_rect(gbs::WindowRect { 120, 8, 16, 100 }));
    assert(gbs::is_valid_window_config(gbs::WindowConfig {
        gbs::WindowRect { 0, 240, 0, 160 },
        static_cast<uint16_t>(gbs::RenderLayerBG0 | gbs::RenderLayerOBJ | gbs::RenderLayerSpecial),
        gbs::RenderLayerBG1,
        true
    }));
    assert(gbs::is_valid_window_config(gbs::WindowConfig {
        gbs::WindowRect { 24, 216, 32, 128 },
        static_cast<uint16_t>(gbs::RenderLayerBG1 | gbs::RenderLayerBG2 | gbs::RenderLayerOBJ),
        static_cast<uint16_t>(gbs::RenderLayerBG0 | gbs::RenderLayerBackdrop),
        true
    }));
    assert(gbs::is_valid_render_layer_mask(gbs::RenderLayerBG0 | gbs::RenderLayerSpecial));
    assert(!gbs::is_valid_render_layer_mask(0x40));
}

} // namespace

int main() {
    test_palette_asset_validation();
    test_tile_asset_validation();
    test_tilemap_asset_validation();
    test_metasprite_validation();
    test_sprite_animation_validation();
    test_render_asset_cost_estimates();
    test_background_layer_validation();
    test_bitmap_mode_validation();
    test_background_map_size_selection();
    test_rle16_validation_and_decode();
    test_rle16_tilemap_validation();
    test_lz77_validation_and_decode();
    test_huffman_validation_and_decode();
    test_lz77_tilemap_validation();
    test_lz77_tile_asset_validation();
    test_lz77_palette_asset_validation();
    test_background_parallax();
    test_render_effect_validation();
    return 0;
}
