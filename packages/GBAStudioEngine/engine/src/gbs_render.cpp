#include "gbs/render.hpp"
#include "gbs/bios.hpp"
#include "gbs/event.hpp"
#include "gbs/interrupt.hpp"
#include "gbs_hw.h"

namespace gbs {

namespace {

#if defined(__arm__) || defined(__thumb__)
#define GBS_RENDER_EWRAM __attribute__((section(".ewram_bss")))
#else
#define GBS_RENDER_EWRAM
#endif

uint16_t tilemap_decode_buffer[max_rle16_tilemap_entries] GBS_RENDER_EWRAM;
uint8_t lz77_tilemap_decode_buffer[max_lz77_tilemap_bytes] GBS_RENDER_EWRAM;
uint8_t lz77_tile_decode_buffer[max_lz77_tile_asset_bytes] GBS_RENDER_EWRAM;
uint8_t lz77_palette_decode_buffer[max_lz77_palette_bytes] GBS_RENDER_EWRAM;
alignas(4) uint8_t huffman_tilemap_decode_buffer[max_lz77_tilemap_bytes] GBS_RENDER_EWRAM;
alignas(4) uint8_t huffman_tile_decode_buffer[max_huffman_tile_asset_bytes] GBS_RENDER_EWRAM;
alignas(4) uint8_t huffman_palette_decode_buffer[max_huffman_palette_bytes] GBS_RENDER_EWRAM;
uint16_t palette_decode_buffer[max_lz77_palette_colors] GBS_RENDER_EWRAM;
uint16_t dynamic_palette_buffer[256] GBS_RENDER_EWRAM;
int background_scroll_x[4] {};
int16_t hblank_composed_scroll[160] {};
#undef GBS_RENDER_EWRAM

void clear_hblank_affine_raster() {
    // DMA0 is shared by the exclusive affine/scroll raster transports.
    gbs_hw_disable_hblank_effects();
}

uint16_t blend_rgb15(uint16_t source, uint16_t target, uint8_t amount_16) {
    const uint32_t amount = amount_16 > 16 ? 16 : amount_16;
    const uint32_t inverse = 16u - amount;
    const uint32_t red = (((source & 31u) * inverse) + ((target & 31u) * amount)) / 16u;
    const uint32_t green = ((((source >> 5) & 31u) * inverse) + (((target >> 5) & 31u) * amount)) / 16u;
    const uint32_t blue = ((((source >> 10) & 31u) * inverse) + (((target >> 10) & 31u) * amount)) / 16u;
    return static_cast<uint16_t>(red | (green << 5) | (blue << 10));
}

bool decode_lz77_runtime(const Lz77Asset& asset, uint8_t* output, size_t output_count) {
    if (bios_lz77_uncomp_wram(asset.data, asset.data_size, output, output_count)) {
        return true;
    }
    return decode_lz77(asset, output, output_count);
}

bool decode_huffman_runtime(const HuffmanAsset& asset, uint8_t* output, size_t output_count) {
    if (bios_huff_uncomp(asset.data, asset.data_size, output, output_count)) {
        return true;
    }
    return decode_huffman(asset, output, output_count);
}

} // namespace

void render_init() {
    gbs_hw_demo_tiles();
    hide_all_sprites();
}

void render_demo_tiles() {
    gbs_hw_demo_tiles();
}

void render_ui_assets() {
    gbs_hw_restore_ui_assets();
}

bool load_palette(const PaletteAsset& asset, bool object_palette) {
    if (asset.compression == AssetCompression::Lz77) {
        return load_palette(Lz77PaletteAsset {
            Lz77Asset {
                static_cast<const uint8_t*>(asset.compressed_data),
                asset.compressed_data_size,
                asset.compressed_decoded_count
            },
            asset.color_count,
            asset.start_index
        }, object_palette);
    }
    if (asset.compression == AssetCompression::Huffman) {
        return load_palette(HuffmanPaletteAsset {
            HuffmanAsset {
                static_cast<const uint8_t*>(asset.compressed_data),
                asset.compressed_data_size,
                asset.compressed_decoded_count
            },
            asset.color_count,
            asset.start_index
        }, object_palette);
    }
    if (!is_valid_palette_asset(asset)) {
        return false;
    }

    if (object_palette) {
        gbs_hw_load_obj_palette(asset.colors, asset.start_index, asset.color_count);
    } else {
        gbs_hw_load_bg_palette(asset.colors, asset.start_index, asset.color_count);
    }
    return true;
}

bool load_palette(const Lz77PaletteAsset& asset, bool object_palette) {
    if (!is_valid_lz77_palette_asset(asset)) {
        return false;
    }
    if (!decode_lz77_runtime(asset.data, lz77_palette_decode_buffer, max_lz77_palette_bytes)) {
        return false;
    }

    for (size_t index = 0; index < asset.color_count; ++index) {
        palette_decode_buffer[index] = static_cast<uint16_t>(
            lz77_palette_decode_buffer[index * 2] |
            (static_cast<uint16_t>(lz77_palette_decode_buffer[index * 2 + 1]) << 8));
    }

    if (object_palette) {
        gbs_hw_load_obj_palette(palette_decode_buffer, asset.start_index, asset.color_count);
    } else {
        gbs_hw_load_bg_palette(palette_decode_buffer, asset.start_index, asset.color_count);
    }
    return true;
}

bool load_palette(const HuffmanPaletteAsset& asset, bool object_palette) {
    if (!is_valid_huffman_palette_asset(asset)) {
        return false;
    }
    if (!decode_huffman_runtime(asset.data, huffman_palette_decode_buffer, max_huffman_palette_bytes)) {
        return false;
    }

    for (size_t index = 0; index < asset.color_count; ++index) {
        palette_decode_buffer[index] = static_cast<uint16_t>(
            huffman_palette_decode_buffer[index * 2] |
            (static_cast<uint16_t>(huffman_palette_decode_buffer[index * 2 + 1]) << 8));
    }

    if (object_palette) {
        gbs_hw_load_obj_palette(palette_decode_buffer, asset.start_index, asset.color_count);
    } else {
        gbs_hw_load_bg_palette(palette_decode_buffer, asset.start_index, asset.color_count);
    }
    return true;
}

bool consume_event_palette_changes(
    EventState& state,
    const PaletteAsset* bg_palettes,
    size_t bg_palette_count,
    const PaletteAsset* obj_palettes,
    size_t obj_palette_count
) {
    bool loaded = false;
    if (state.background_palette_changed) {
        if (bg_palettes != nullptr &&
            state.background_palette_index >= 0 &&
            static_cast<size_t>(state.background_palette_index) < bg_palette_count) {
            loaded = load_palette(bg_palettes[state.background_palette_index], false) || loaded;
        }
        state.background_palette_changed = false;
    }
    if (state.sprite_palette_changed) {
        if (obj_palettes != nullptr &&
            state.sprite_palette_index >= 0 &&
            static_cast<size_t>(state.sprite_palette_index) < obj_palette_count) {
            loaded = load_palette(obj_palettes[state.sprite_palette_index], true) || loaded;
        }
        state.sprite_palette_changed = false;
    }
    return loaded;
}

bool load_palette_cycled(const PaletteAsset& asset, bool object_palette, uint16_t offset) {
    if (!is_valid_palette_asset(asset) || asset.colors == nullptr) {
        return false;
    }
    const uint16_t normalized = static_cast<uint16_t>(offset % asset.color_count);
    for (uint16_t index = 0; index < asset.color_count; ++index) {
        dynamic_palette_buffer[index] = asset.colors[(index + normalized) % asset.color_count];
    }
    const PaletteAsset cycled { dynamic_palette_buffer, asset.color_count, asset.start_index };
    return load_palette(cycled, object_palette);
}

bool load_palette_blended(const PaletteAsset& asset, bool object_palette, uint16_t target_rgb15, uint8_t amount_16) {
    if (!is_valid_palette_asset(asset) || asset.colors == nullptr) {
        return false;
    }
    for (uint16_t index = 0; index < asset.color_count; ++index) {
        dynamic_palette_buffer[index] = blend_rgb15(asset.colors[index], target_rgb15, amount_16);
    }
    const PaletteAsset blended { dynamic_palette_buffer, asset.color_count, asset.start_index };
    return load_palette(blended, object_palette);
}

bool load_tiles(const TileAsset& asset) {
    if (asset.compression == AssetCompression::Lz77) {
        return load_tiles(Lz77TileAsset {
            Lz77Asset {
                static_cast<const uint8_t*>(asset.compressed_data),
                asset.compressed_data_size,
                asset.compressed_decoded_count
            },
            asset.tile_count,
            asset.destination_tile,
            asset.object_tiles,
            asset.color_depth
        });
    }
    if (asset.compression == AssetCompression::Huffman) {
        return load_tiles(HuffmanTileAsset {
            HuffmanAsset {
                static_cast<const uint8_t*>(asset.compressed_data),
                asset.compressed_data_size,
                asset.compressed_decoded_count
            },
            asset.tile_count,
            asset.destination_tile,
            asset.object_tiles,
            asset.color_depth
        });
    }
    if (!is_valid_tile_asset(asset)) {
        return false;
    }

    if (asset.object_tiles) {
        if (asset.color_depth == ColorDepth::Bpp8) {
            gbs_hw_load_obj_tiles_8bpp(asset.data, asset.destination_tile, asset.tile_count);
        } else {
            gbs_hw_load_obj_tiles(asset.data, asset.destination_tile, asset.tile_count);
        }
    } else {
        gbs_hw_load_bg_tiles(asset.data, asset.destination_tile, asset.tile_count);
    }
    return true;
}

bool load_tiles(const Lz77TileAsset& asset) {
    if (!is_valid_lz77_tile_asset(asset)) {
        return false;
    }
    if (!decode_lz77_runtime(asset.data, lz77_tile_decode_buffer, max_lz77_tile_asset_bytes)) {
        return false;
    }

    if (asset.object_tiles) {
        if (asset.color_depth == ColorDepth::Bpp8) {
            gbs_hw_load_obj_tiles_8bpp(lz77_tile_decode_buffer, asset.destination_tile, asset.tile_count);
        } else {
            gbs_hw_load_obj_tiles(lz77_tile_decode_buffer, asset.destination_tile, asset.tile_count);
        }
    } else {
        gbs_hw_load_bg_tiles(lz77_tile_decode_buffer, asset.destination_tile, asset.tile_count);
    }
    return true;
}

bool load_tiles(const HuffmanTileAsset& asset) {
    if (!is_valid_huffman_tile_asset(asset)) {
        return false;
    }
    if (!decode_huffman_runtime(asset.data, huffman_tile_decode_buffer, max_huffman_tile_asset_bytes)) {
        return false;
    }

    if (asset.object_tiles) {
        if (asset.color_depth == ColorDepth::Bpp8) {
            gbs_hw_load_obj_tiles_8bpp(huffman_tile_decode_buffer, asset.destination_tile, asset.tile_count);
        } else {
            gbs_hw_load_obj_tiles(huffman_tile_decode_buffer, asset.destination_tile, asset.tile_count);
        }
    } else {
        gbs_hw_load_bg_tiles(huffman_tile_decode_buffer, asset.destination_tile, asset.tile_count);
    }
    return true;
}

bool load_affine_tiles(const AffineTileAsset& asset) {
    return load_affine_tiles(BackgroundLayer::BG2, asset);
}

bool load_affine_tiles(BackgroundLayer layer, const AffineTileAsset& asset) {
    if (!is_valid_affine_background_layer(layer)) {
        return false;
    }
    if (!is_valid_affine_tile_asset(asset)) {
        return false;
    }
    gbs_hw_load_affine_bg_tiles_for_layer(
        static_cast<int>(layer),
        asset.data,
        asset.destination_tile,
        asset.tile_count
    );
    return true;
}

bool load_tilemap(BackgroundLayer layer, const TileMapAsset& asset) {
    if (asset.compression == AssetCompression::Rle16) {
        return load_tilemap(layer, Rle16TileMapAsset {
            Rle16Asset {
                static_cast<const Rle16Run*>(asset.compressed_data),
                asset.compressed_data_size,
                asset.compressed_decoded_count
            },
            asset.width,
            asset.height
        });
    }
    if (asset.compression == AssetCompression::Lz77) {
        return load_tilemap(layer, Lz77TileMapAsset {
            Lz77Asset {
                static_cast<const uint8_t*>(asset.compressed_data),
                asset.compressed_data_size,
                asset.compressed_decoded_count
            },
            asset.width,
            asset.height
        });
    }
    if (asset.compression == AssetCompression::Huffman) {
        return load_tilemap(layer, HuffmanTileMapAsset {
            HuffmanAsset {
                static_cast<const uint8_t*>(asset.compressed_data),
                asset.compressed_data_size,
                asset.compressed_decoded_count
            },
            asset.width,
            asset.height
        });
    }
    BackgroundMapSize size = background_map_size_for_dimensions(asset.width, asset.height);
    if (!is_valid_background_layer(layer) || !is_valid_tilemap_asset(asset) || !is_valid_background_map_size(size)) {
        return false;
    }

    gbs_hw_load_bg_tilemap(static_cast<int>(layer), asset.entries, asset.width, asset.height, static_cast<uint32_t>(size));
    return true;
}

bool load_affine_tilemap(BackgroundLayer layer, const AffineTileMapAsset& asset) {
    AffineBackgroundMapSize size = affine_background_map_size_for_dimensions(asset.width, asset.height);
    if (!is_valid_affine_background_layer(layer) || !is_valid_affine_tilemap_asset(asset) || !is_valid_affine_background_map_size(size)) {
        return false;
    }

    gbs_hw_load_affine_bg_tilemap(static_cast<int>(layer), asset.entries, asset.width, asset.height, static_cast<uint32_t>(size));
    return true;
}

bool load_tilemap(BackgroundLayer layer, const Rle16TileMapAsset& asset) {
    BackgroundMapSize size = background_map_size_for_dimensions(asset.width, asset.height);
    if (!is_valid_background_layer(layer) || !is_valid_rle16_tilemap_asset(asset) || !is_valid_background_map_size(size)) {
        return false;
    }
    if (!decode_rle16(asset.data, tilemap_decode_buffer, max_rle16_tilemap_entries)) {
        return false;
    }

    gbs_hw_load_bg_tilemap(static_cast<int>(layer), tilemap_decode_buffer, asset.width, asset.height, static_cast<uint32_t>(size));
    return true;
}

bool load_tilemap(BackgroundLayer layer, const Lz77TileMapAsset& asset) {
    BackgroundMapSize size = background_map_size_for_dimensions(asset.width, asset.height);
    if (!is_valid_background_layer(layer) || !is_valid_lz77_tilemap_asset(asset) || !is_valid_background_map_size(size)) {
        return false;
    }
    if (!decode_lz77_runtime(asset.data, lz77_tilemap_decode_buffer, max_lz77_tilemap_bytes)) {
        return false;
    }

    size_t entry_count = static_cast<size_t>(asset.width) * asset.height;
    for (size_t index = 0; index < entry_count; ++index) {
        tilemap_decode_buffer[index] = static_cast<uint16_t>(
            lz77_tilemap_decode_buffer[index * 2] |
            (static_cast<uint16_t>(lz77_tilemap_decode_buffer[index * 2 + 1]) << 8));
    }

    gbs_hw_load_bg_tilemap(static_cast<int>(layer), tilemap_decode_buffer, asset.width, asset.height, static_cast<uint32_t>(size));
    return true;
}

bool load_tilemap(BackgroundLayer layer, const HuffmanTileMapAsset& asset) {
    BackgroundMapSize size = background_map_size_for_dimensions(asset.width, asset.height);
    if (!is_valid_background_layer(layer) || !is_valid_huffman_tilemap_asset(asset) || !is_valid_background_map_size(size)) {
        return false;
    }
    if (!decode_huffman_runtime(asset.data, huffman_tilemap_decode_buffer, max_lz77_tilemap_bytes)) {
        return false;
    }

    const size_t entry_count = static_cast<size_t>(asset.width) * asset.height;
    for (size_t index = 0; index < entry_count; ++index) {
        tilemap_decode_buffer[index] = static_cast<uint16_t>(
            huffman_tilemap_decode_buffer[index * 2] |
            (static_cast<uint16_t>(huffman_tilemap_decode_buffer[index * 2 + 1]) << 8));
    }

    gbs_hw_load_bg_tilemap(static_cast<int>(layer), tilemap_decode_buffer, asset.width, asset.height, static_cast<uint32_t>(size));
    return true;
}

bool load_tilemap_bg0(const TileMapAsset& asset) {
    return load_tilemap(BackgroundLayer::BG0, asset);
}

bool set_bg_tile(BackgroundLayer layer, int x, int y, int width, int height, uint16_t tile) {
    if (!is_valid_background_layer(layer) || x < 0 || y < 0 || width <= 0 || height <= 0 || x >= width || y >= height) {
        return false;
    }
    BackgroundMapSize size = background_map_size_for_dimensions(width, height);
    if (!is_valid_background_map_size(size)) {
        return false;
    }
    gbs_hw_set_bg_tilemap_entry(
        static_cast<int>(layer),
        static_cast<uint32_t>(x),
        static_cast<uint32_t>(y),
        static_cast<uint32_t>(width),
        static_cast<uint32_t>(height),
        tile
    );
    return true;
}

void set_bg_scroll(BackgroundLayer layer, int x, int y) {
    if (!is_valid_background_layer(layer)) {
        return;
    }
    background_scroll_x[static_cast<int>(layer)] = x;
    gbs_hw_set_bg_scroll(static_cast<int>(layer), x, y);
}

void set_bg_character_base(BackgroundLayer layer, uint8_t character_base) {
    if (!is_valid_background_layer(layer) || character_base > 3) {
        return;
    }
    gbs_hw_set_bg_character_base(static_cast<int>(layer), character_base);
}

void set_bg_screen_base(BackgroundLayer layer, uint8_t screen_base) {
    if (!is_valid_background_layer(layer) || screen_base > 31) return;
    gbs_hw_set_bg_screen_base(static_cast<int>(layer), screen_base);
}

void set_bg_color_depth(BackgroundLayer layer, ColorDepth depth) {
    if (!is_valid_background_layer(layer)) return;
    gbs_hw_set_bg_color_depth(static_cast<int>(layer), depth == ColorDepth::Bpp8);
}

void set_ui_character_base(uint8_t base) {
    if (base <= 2) gbs_hw_set_ui_character_base(base);
}

bool load_bg_tiles_at_character_base(const TileAsset& asset, uint8_t character_base) {
    if (asset.color_depth == ColorDepth::Bpp8) {
        if (asset.data == nullptr || asset.tile_count == 0 || asset.object_tiles ||
            asset.compression != AssetCompression::None || character_base > 2 ||
            asset.destination_tile >= 768u || asset.tile_count > 768u - asset.destination_tile ||
            character_base * 256u + asset.destination_tile + asset.tile_count > 768u) return false;
        gbs_hw_load_bg_tiles_8bpp(asset.data, asset.destination_tile, asset.tile_count, character_base);
        return true;
    }
    if (!is_valid_tile_asset(asset) || asset.object_tiles ||
        asset.compression != AssetCompression::None || character_base > 2 ||
        character_base * 512u + asset.destination_tile + asset.tile_count > 1536u) return false;
    gbs_hw_load_bg_tiles_at_character_base(asset.data, asset.destination_tile, asset.tile_count, character_base);
    return true;
}

void set_bg_enabled(BackgroundLayer layer, bool enabled) {
    if (!is_valid_background_layer(layer)) {
        return;
    }
    gbs_hw_set_bg_enabled(static_cast<int>(layer), enabled ? 1 : 0);
}

void set_bg_scroll(int x, int y) {
    set_bg_scroll(BackgroundLayer::BG0, x, y);
}

void set_bg_parallax(Vec2i camera_pixels, const BackgroundParallax& parallax) {
    if (!is_valid_background_parallax(parallax)) {
        return;
    }
    Vec2i scroll = parallax_scroll_for_camera(camera_pixels, parallax);
    set_bg_scroll(parallax.layer, scroll.x, scroll.y);
}

void set_display_mode(DisplayMode mode) {
    if (!is_valid_display_mode(mode)) {
        return;
    }
    gbs_hw_set_display_mode(static_cast<uint16_t>(mode));
}

void set_affine_bg_wrap(BackgroundLayer layer, bool enabled) {
    if (!is_valid_affine_background_layer(layer)) {
        return;
    }
    gbs_hw_set_affine_bg_wrap(static_cast<int>(layer), enabled ? 1 : 0);
}

void set_affine_bg_transform(BackgroundLayer layer, const AffineBgTransform& transform) {
    if (!is_valid_affine_background_layer(layer)) {
        return;
    }
    gbs_hw_set_affine_bg_transform(
        static_cast<int>(layer),
        transform.pa,
        transform.pb,
        transform.pc,
        transform.pd,
        transform.reference_x_8,
        transform.reference_y_8);
}

bool load_bitmap16(DisplayMode mode, const Bitmap16Asset& asset, uint8_t page) {
    if (!is_valid_bitmap16_asset(mode, asset) || !is_valid_bitmap_page(mode, page)) {
        return false;
    }
    gbs_hw_load_bitmap16(static_cast<uint16_t>(mode), asset.pixels, asset.width, asset.height, page);
    return true;
}

bool load_bitmap8(DisplayMode mode, const Bitmap8Asset& asset, uint8_t page) {
    if (!is_valid_bitmap8_asset(mode, asset) || !is_valid_bitmap_page(mode, page)) {
        return false;
    }
    gbs_hw_load_bitmap8(asset.pixels, asset.width, asset.height, page);
    return true;
}

bool apply_video_composition(const VideoComposition& composition) {
    if (!is_valid_display_mode(composition.display_mode)) {
        return false;
    }
    if (composition.affine_enabled) {
        const bool layer_supported = composition.affine_layer == BackgroundLayer::BG2 ||
            (composition.display_mode == DisplayMode::Mode2Affine && composition.affine_layer == BackgroundLayer::BG3);
        const bool mode_supported = composition.display_mode == DisplayMode::Mode1TextAffine ||
            composition.display_mode == DisplayMode::Mode2Affine;
        if (!mode_supported || !layer_supported) {
            return false;
        }
        if (composition.affine_palette != nullptr && !load_palette(*composition.affine_palette, false)) {
            return false;
        }
        if (composition.affine_tiles != nullptr && !load_affine_tiles(composition.affine_layer, *composition.affine_tiles)) {
            return false;
        }
        if (composition.affine_tilemap != nullptr && !load_affine_tilemap(composition.affine_layer, *composition.affine_tilemap)) {
            return false;
        }
    }

    set_display_mode(composition.display_mode);
    if (composition.affine_enabled) {
        set_affine_bg_wrap(composition.affine_layer, composition.affine_wrap);
        set_affine_bg_transform(composition.affine_layer, composition.affine_transform);
    }

    bool bitmap_loaded = true;
    if (composition.bitmap_palette != nullptr && !load_palette(*composition.bitmap_palette, false)) {
        return false;
    }
    if (composition.bitmap16 != nullptr) {
        bitmap_loaded = load_bitmap16(composition.display_mode, *composition.bitmap16, composition.bitmap_page);
    } else if (composition.bitmap8 != nullptr) {
        bitmap_loaded = load_bitmap8(composition.display_mode, *composition.bitmap8, composition.bitmap_page);
    } else if (is_bitmap_display_mode(composition.display_mode)) {
        bitmap_loaded = false;
    }
    if (bitmap_loaded && is_bitmap_display_mode(composition.display_mode)) {
        set_display_frame_page(composition.bitmap_page);
    }
    return bitmap_loaded;
}

void fill_bitmap16(DisplayMode mode, uint16_t color, uint8_t page) {
    if (!is_bitmap_display_mode(mode) || mode == DisplayMode::Mode4Bitmap || !is_valid_bitmap_page(mode, page)) {
        return;
    }
    gbs_hw_fill_bitmap16(static_cast<uint16_t>(mode), color, page);
}

bool update_bitmap16_rect(DisplayMode mode, uint8_t page, uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint16_t* pixels, uint16_t stride) {
    if ((mode != DisplayMode::Mode3Bitmap && mode != DisplayMode::Mode5Bitmap) ||
        !is_valid_bitmap_page(mode, page) || pixels == nullptr || width == 0 || height == 0 || stride < width ||
        x + width > bitmap_mode_width(mode) || y + height > bitmap_mode_height(mode)) {
        return false;
    }
    gbs_hw_update_bitmap16_rect(static_cast<uint16_t>(mode), page, x, y, width, height, pixels, stride);
    return true;
}

bool update_bitmap8_rect(uint8_t page, uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint8_t* pixels, uint16_t stride) {
    if (!is_valid_bitmap_page(DisplayMode::Mode4Bitmap, page) || pixels == nullptr || width == 0 || height == 0 || stride < width ||
        x + width > bitmap_mode_width(DisplayMode::Mode4Bitmap) || y + height > bitmap_mode_height(DisplayMode::Mode4Bitmap)) {
        return false;
    }
    gbs_hw_update_bitmap8_rect(page, x, y, width, height, pixels, stride);
    return true;
}

void set_display_frame_page(uint8_t page) {
    if (page > 1) {
        return;
    }
    gbs_hw_set_display_frame_page(page);
}

void set_bg_priority(BackgroundLayer layer, uint8_t priority) {
    if (!is_valid_background_layer(layer) || !is_valid_render_priority(priority)) {
        return;
    }
    gbs_hw_set_bg_priority(static_cast<int>(layer), priority);
}

void set_bg_mosaic(BackgroundLayer layer, bool enabled) {
    if (!is_valid_background_layer(layer)) {
        return;
    }
    gbs_hw_set_bg_mosaic(static_cast<int>(layer), enabled ? 1 : 0);
}

void set_blending(const BlendConfig& config) {
    if (!is_valid_blend_config(config)) {
        return;
    }
    gbs_hw_set_blending(
        config.first_targets,
        config.second_targets,
        static_cast<uint16_t>(config.mode),
        config.eva,
        config.evb,
        config.intensity);
}

void disable_blending() {
    gbs_hw_disable_blending();
}

void set_mosaic(const MosaicConfig& config) {
    if (!is_valid_mosaic_config(config)) {
        return;
    }
    gbs_hw_set_mosaic(config.bg_x, config.bg_y, config.obj_x, config.obj_y);
}

void disable_mosaic() {
    gbs_hw_disable_mosaic();
}

void set_window0(const WindowConfig& config) {
    if (!is_valid_window_config(config)) {
        return;
    }
    gbs_hw_set_window0(
        config.rect.left,
        config.rect.right,
        config.rect.top,
        config.rect.bottom,
        config.inside_mask,
        config.outside_mask,
        config.enabled ? 1 : 0);
}

void disable_window0() {
    gbs_hw_set_window0(0, 240, 0, 160, 0x3F, 0x3F, 0);
}

void set_window1(const WindowConfig& config) {
    if (!is_valid_window_config(config)) {
        return;
    }
    gbs_hw_set_window1(
        config.rect.left,
        config.rect.right,
        config.rect.top,
        config.rect.bottom,
        config.inside_mask,
        config.outside_mask,
        config.enabled ? 1 : 0);
}

void disable_window1() {
    gbs_hw_set_window1(0, 240, 0, 160, 0x3F, 0x3F, 0);
}

void set_obj_window_masks(uint16_t inside_mask, uint16_t outside_mask) {
    if (!is_valid_render_layer_mask(inside_mask) || !is_valid_render_layer_mask(outside_mask)) {
        return;
    }
    gbs_hw_set_obj_window(inside_mask, outside_mask, 1);
}

void disable_obj_window() {
    gbs_hw_set_obj_window(0x3F, 0x3F, 0);
}

void draw_room_to_bg0(const uint8_t* tiles, int width, int height, int camera_x, int camera_y) {
    gbs_hw_draw_room_to_bg0(tiles, width, height, camera_x, camera_y);
}

void draw_room_to_bg0(const uint16_t* tiles, int width, int height, int camera_x, int camera_y) {
    gbs_hw_draw_room16_to_bg0(tiles, width, height, camera_x, camera_y);
}

void draw_room_to_bg(BackgroundLayer layer, const uint8_t* tiles, int width, int height, int camera_x, int camera_y) {
    if (!is_valid_background_layer(layer)) {
        return;
    }
    gbs_hw_draw_room_to_bg(static_cast<int>(layer), tiles, width, height, camera_x, camera_y);
}

void draw_room_to_bg(BackgroundLayer layer, const uint16_t* tiles, int width, int height, int camera_x, int camera_y) {
    if (!is_valid_background_layer(layer)) {
        return;
    }
    gbs_hw_draw_room16_to_bg(static_cast<int>(layer), tiles, width, height, camera_x, camera_y);
}

void draw_room_to_bg_cached(BackgroundLayer layer, const uint16_t* tiles, int width, int height,
    int camera_x, int camera_y, RoomTilemapCache& cache) {
    if (!is_valid_background_layer(layer)) return;
    const int tile_x = camera_x / 8, tile_y = camera_y / 8;
    if (cache.valid && cache.tiles == tiles && cache.width == width && cache.height == height &&
        cache.layer == layer && cache.tile_x == tile_x && cache.tile_y == tile_y) return;
    draw_room_to_bg(layer, tiles, width, height, camera_x, camera_y);
    cache = RoomTilemapCache { tiles, width, height, tile_x, tile_y, layer, true };
}

void draw_text_at(int x, int y, int width, const char* text) { gbs_hw_draw_text_at(x,y,width,text); }

void draw_text_overlay(int x, int y, int width, const char* text, bool visible) {
    gbs_hw_draw_text_overlay(x, y, width, text, visible ? 1 : 0);
}

void draw_text_overlay_slot(int x, int y, int width, const char* text, int oam_offset, bool visible) {
    gbs_hw_draw_text_overlay_slot(x, y, width, text, oam_offset, visible ? 1 : 0);
}

void draw_text_overlay_light(int x, int y, int width, const char* text, bool visible) {
    gbs_hw_draw_text_overlay_light(x, y, width, text, visible ? 1 : 0);
}

void draw_text_input_surface(int x, int y, int width, int height, bool visible) {
    gbs_hw_draw_text_input_surface(x, y, width, height, visible ? 1 : 0);
}

void draw_text_input_keyboard(int x, int y, int width, int height, int selected_index, bool lowercase, bool visible) {
    gbs_hw_draw_text_input_keyboard(x, y, width, height, selected_index, lowercase ? 1 : 0, visible ? 1 : 0);
}

void draw_text_input_keyboard_with_controls(int x, int y, int width, int height, int selected_index, bool lowercase, bool visible, int control_layout, int controls_x, int controls_y, int controls_width, int controls_height, int surface) {
    gbs_hw_draw_text_input_keyboard_with_controls(x, y, width, height, selected_index, lowercase ? 1 : 0, visible ? 1 : 0, control_layout, controls_x, controls_y, controls_width, controls_height, surface);
}

void set_sprite(int index, const Sprite& sprite) {
    if (!is_valid_render_priority(sprite.priority) ||
        !is_valid_sprite_render_mode(sprite.mode) ||
        !is_valid_sprite_dimensions(sprite.width, sprite.height) ||
        !is_valid_color_depth(sprite.color_depth) ||
        (sprite.color_depth == ColorDepth::Bpp8 && (sprite.tile_index % 2u) != 0)) {
        return;
    }
    gbs_hw_set_sprite(
        index,
        sprite.x,
        sprite.y,
        sprite.tile_index,
        sprite.palette,
        sprite.hflip ? 1 : 0,
        sprite.vflip ? 1 : 0,
        sprite.visible ? 1 : 0,
        sprite.priority,
        static_cast<uint16_t>(sprite.mode),
        sprite.mosaic ? 1 : 0,
        sprite_shape_for_dimensions(sprite.width, sprite.height),
        sprite_size_for_dimensions(sprite.width, sprite.height));
    gbs_hw_set_sprite_color_depth(index, sprite.color_depth == ColorDepth::Bpp8 ? 1 : 0);
    gbs_hw_set_sprite_affine(
        index,
        sprite.affine ? 1 : 0,
        sprite.double_size ? 1 : 0,
        sprite.affine_matrix
    );
}

bool set_affine_sprite_transform(uint8_t matrix_index, const AffineSpriteTransform& transform) {
    if (matrix_index >= 32) {
        return false;
    }
    gbs_hw_set_sprite_affine_matrix(matrix_index, transform.pa, transform.pb, transform.pc, transform.pd);
    return true;
}

bool set_affine_sprite_transform_at_frame(
    uint8_t matrix_index,
    const AffineMatrixKeyframe* keyframes,
    size_t count,
    uint32_t frame,
    Easing easing
) {
    AffineMatrix transform {};
    if (!sample_affine_matrix(transform, keyframes, count, frame, easing)) {
        return false;
    }
    return set_affine_sprite_transform(matrix_index, transform);
}

bool set_affine_bg_transform_at_frame(
    BackgroundLayer layer,
    const AffineTransformKeyframe* keyframes,
    size_t count,
    uint32_t frame,
    Easing easing
) {
    AffineTransform transform {};
    if (!sample_affine_transform(transform, keyframes, count, frame, easing) ||
        !is_valid_affine_background_layer(layer)) {
        return false;
    }
    set_affine_bg_transform(layer, AffineBgTransform {
        transform.matrix.pa,
        transform.matrix.pb,
        transform.matrix.pc,
        transform.matrix.pd,
        transform.reference_x_8,
        transform.reference_y_8
    });
    return true;
}

void set_metasprite(int first_index, const MetaSprite& metasprite, Vec2i position) {
    if (!is_valid_metasprite(metasprite)) {
        return;
    }

    for (uint8_t part_index = 0; part_index < metasprite.part_count; ++part_index) {
        const MetaSpritePart& part = metasprite.parts[part_index];
        Sprite sprite {
            position.x + part.x,
            position.y + part.y,
            part.tile_index,
            part.palette,
            part.hflip,
            part.vflip,
            true,
            0,
            SpriteRenderMode::Normal,
            false,
            part.width,
            part.height
        };
        sprite.color_depth = part.color_depth;
        set_sprite(first_index + part_index, sprite);
    }
}

void hide_all_sprites() {
    gbs_hw_hide_all_sprites();
}

void hide_sprites(int first_index, int count) {
    gbs_hw_hide_sprites(first_index, count);
}

bool set_hblank_bg_scroll(BackgroundLayer layer, const int16_t* offsets, size_t count) {
    if (!is_valid_background_layer(layer) || offsets == nullptr || count != 160) {
        return false;
    }
    clear_hblank_affine_raster();
    const int base_scroll = background_scroll_x[static_cast<int>(layer)];
    for (size_t scanline = 0; scanline < count; ++scanline) {
        hblank_composed_scroll[scanline] = static_cast<int16_t>(base_scroll + offsets[scanline]);
    }
    gbs_hw_start_hblank_bg_scroll(static_cast<int>(layer), hblank_composed_scroll);
    return true;
}

bool set_hblank_affine_raster(
    BackgroundLayer layer,
    const HBlankAffineRasterLine* lines,
    size_t count
) {
    if (!is_valid_affine_background_layer(layer) || lines == nullptr || count != hblank_affine_raster_line_count) {
        return false;
    }
    uint32_t* hblank_affine_dma_words=gbs_hw_hblank_affine_buffer();
    for(size_t index=0;index<count;++index) {
        const auto& line=lines[index];
        hblank_affine_dma_words[index*4]=static_cast<uint16_t>(line.pa);
        hblank_affine_dma_words[index*4+1]=static_cast<uint16_t>(line.pc);
        hblank_affine_dma_words[index*4+2]=static_cast<uint32_t>(line.reference_x_8);
        hblank_affine_dma_words[index*4+3]=static_cast<uint32_t>(line.reference_y_8);
    }
    gbs_hw_start_hblank_affine(static_cast<int>(layer),hblank_affine_dma_words);
    return true;
}

void disable_hblank_effects() {
    clear_hblank_affine_raster();
}

} // namespace gbs
