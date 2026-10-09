#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/assets.hpp"
#include "gbs/compression.hpp"
#include "gbs/math.hpp"
#include "gbs/types.hpp"

namespace gbs {

struct EventState;

enum class BackgroundLayer : uint8_t {
    BG0 = 0,
    BG1 = 1,
    BG2 = 2,
    BG3 = 3
};

enum class BackgroundMapSize : uint8_t {
    Size32x32 = 0,
    Size64x32 = 1,
    Size32x64 = 2,
    Size64x64 = 3,
    Invalid = 255
};

enum class AffineBackgroundMapSize : uint8_t {
    Size16x16 = 0,
    Size32x32 = 1,
    Size64x64 = 2,
    Size128x128 = 3,
    Invalid = 255
};

enum class DisplayMode : uint8_t {
    Mode0Text = 0,
    Mode1TextAffine = 1,
    Mode2Affine = 2,
    Mode3Bitmap = 3,
    Mode4Bitmap = 4,
    Mode5Bitmap = 5
};

enum RenderLayerMask : uint16_t {
    RenderLayerBG0 = 1u << 0,
    RenderLayerBG1 = 1u << 1,
    RenderLayerBG2 = 1u << 2,
    RenderLayerBG3 = 1u << 3,
    RenderLayerOBJ = 1u << 4,
    RenderLayerBackdrop = 1u << 5,
    RenderLayerSpecial = 1u << 5,
};

enum class BlendMode : uint8_t {
    None = 0,
    Alpha = 1,
    Brighten = 2,
    Darken = 3
};

enum class SpriteRenderMode : uint8_t {
    Normal = 0,
    Alpha = 1,
    Window = 2
};

struct BlendConfig {
    uint16_t first_targets;
    uint16_t second_targets;
    BlendMode mode;
    uint8_t eva;
    uint8_t evb;
    uint8_t intensity;
};

struct MosaicConfig {
    uint8_t bg_x;
    uint8_t bg_y;
    uint8_t obj_x;
    uint8_t obj_y;
};

struct WindowRect {
    uint8_t left;
    uint8_t right;
    uint8_t top;
    uint8_t bottom;
};

struct WindowConfig {
    WindowRect rect;
    uint16_t inside_mask;
    uint16_t outside_mask;
    bool enabled;
};

struct Sprite {
    int x;
    int y;
    uint16_t tile_index;
    uint16_t palette;
    bool hflip;
    bool vflip;
    bool visible;
    uint8_t priority = 0;
    SpriteRenderMode mode = SpriteRenderMode::Normal;
    bool mosaic = false;
    uint8_t width = 16;
    uint8_t height = 16;
    bool affine = false;
    bool double_size = false;
    uint8_t affine_matrix = 0;
    ColorDepth color_depth = ColorDepth::Bpp4;
};

using AffineSpriteTransform = AffineMatrix;

constexpr uint16_t invalid_sprite_shape = 3;

constexpr uint16_t sprite_shape_for_dimensions(int width, int height) {
    if (width == height && (width == 8 || width == 16 || width == 32 || width == 64)) {
        return 0;
    }
    if ((width == 16 && height == 8) ||
        (width == 32 && height == 8) ||
        (width == 32 && height == 16) ||
        (width == 64 && height == 32)) {
        return 1;
    }
    if ((width == 8 && height == 16) ||
        (width == 8 && height == 32) ||
        (width == 16 && height == 32) ||
        (width == 32 && height == 64)) {
        return 2;
    }
    return invalid_sprite_shape;
}

constexpr uint16_t sprite_size_for_dimensions(int width, int height) {
    if ((width == 8 && height == 8) || (width == 16 && height == 8) || (width == 8 && height == 16)) {
        return 0;
    }
    if ((width == 16 && height == 16) || (width == 32 && height == 8) || (width == 8 && height == 32)) {
        return 1;
    }
    if ((width == 32 && height == 32) || (width == 32 && height == 16) || (width == 16 && height == 32)) {
        return 2;
    }
    if ((width == 64 && height == 64) || (width == 64 && height == 32) || (width == 32 && height == 64)) {
        return 3;
    }
    return 0;
}

constexpr bool is_valid_sprite_dimensions(int width, int height) {
    return sprite_shape_for_dimensions(width, height) != invalid_sprite_shape;
}

struct BackgroundParallax {
    BackgroundLayer layer;
    int16_t factor_x_256;
    int16_t factor_y_256;
    Vec2i offset_pixels;
};

struct AffineBgTransform {
    int16_t pa;
    int16_t pb;
    int16_t pc;
    int16_t pd;
    int32_t reference_x_8;
    int32_t reference_y_8;
};

constexpr size_t hblank_affine_raster_line_count = 161;

struct HBlankAffineRasterLine {
    int16_t pa;
    int16_t pc;
    int32_t reference_x_8;
    int32_t reference_y_8;
    bool visible;
};

struct Bitmap16Asset {
    const uint16_t* pixels;
    uint16_t width;
    uint16_t height;
};

struct Bitmap8Asset {
    const uint8_t* pixels;
    uint16_t width;
    uint16_t height;
};

struct VideoComposition {
    DisplayMode display_mode;
    bool affine_enabled;
    BackgroundLayer affine_layer;
    AffineBgTransform affine_transform;
    const AffineTileAsset* affine_tiles;
    const AffineTileMapAsset* affine_tilemap;
    const PaletteAsset* affine_palette;
    const Bitmap16Asset* bitmap16;
    const Bitmap8Asset* bitmap8;
    const PaletteAsset* bitmap_palette;
    uint8_t bitmap_page;
    bool affine_wrap = true;
};

constexpr VideoComposition default_video_composition() {
    return VideoComposition {
        DisplayMode::Mode0Text,
        false,
        BackgroundLayer::BG2,
        AffineBgTransform { 256, 0, 0, 256, 0, 0 },
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        0,
        true
    };
}

constexpr bool is_valid_background_layer(BackgroundLayer layer) {
    return static_cast<uint8_t>(layer) <= static_cast<uint8_t>(BackgroundLayer::BG3);
}

constexpr bool is_valid_affine_background_layer(BackgroundLayer layer) {
    return layer == BackgroundLayer::BG2 || layer == BackgroundLayer::BG3;
}

constexpr bool is_valid_display_mode(DisplayMode mode) {
    return static_cast<uint8_t>(mode) <= static_cast<uint8_t>(DisplayMode::Mode5Bitmap);
}

constexpr bool is_bitmap_display_mode(DisplayMode mode) {
    return mode == DisplayMode::Mode3Bitmap ||
           mode == DisplayMode::Mode4Bitmap ||
           mode == DisplayMode::Mode5Bitmap;
}

constexpr uint16_t bitmap_mode_width(DisplayMode mode) {
    return mode == DisplayMode::Mode5Bitmap ? 160 : 240;
}

constexpr uint16_t bitmap_mode_height(DisplayMode mode) {
    return mode == DisplayMode::Mode5Bitmap ? 128 : 160;
}

constexpr bool is_valid_bitmap_page(DisplayMode mode, uint8_t page) {
    if (mode == DisplayMode::Mode4Bitmap || mode == DisplayMode::Mode5Bitmap) {
        return page <= 1;
    }
    return mode == DisplayMode::Mode3Bitmap && page == 0;
}

constexpr bool is_valid_bitmap16_asset(DisplayMode mode, const Bitmap16Asset& asset) {
    return (mode == DisplayMode::Mode3Bitmap || mode == DisplayMode::Mode5Bitmap) &&
           asset.pixels != nullptr &&
           asset.width > 0 &&
           asset.height > 0 &&
           asset.width <= bitmap_mode_width(mode) &&
           asset.height <= bitmap_mode_height(mode);
}

constexpr bool is_valid_bitmap8_asset(DisplayMode mode, const Bitmap8Asset& asset) {
    return mode == DisplayMode::Mode4Bitmap &&
           asset.pixels != nullptr &&
           asset.width > 0 &&
           asset.height > 0 &&
           asset.width <= bitmap_mode_width(mode) &&
           asset.height <= bitmap_mode_height(mode);
}

constexpr RenderAssetCost estimate_bitmap16_asset_cost(DisplayMode mode, const Bitmap16Asset& asset) {
    const uint32_t pixels = static_cast<uint32_t>(asset.width) * asset.height;
    return !is_valid_bitmap16_asset(mode, asset)
        ? invalid_render_asset_cost()
        : RenderAssetCost {
            true,
            0,
            0,
            0,
            static_cast<uint32_t>(pixels * sizeof(uint16_t)),
            0,
            0,
            0,
            0,
            0,
            static_cast<uint16_t>(pixels),
            0,
            0
        };
}

constexpr RenderAssetCost estimate_bitmap8_asset_cost(DisplayMode mode, const Bitmap8Asset& asset) {
    const uint32_t pixels = static_cast<uint32_t>(asset.width) * asset.height;
    return !is_valid_bitmap8_asset(mode, asset)
        ? invalid_render_asset_cost()
        : RenderAssetCost {
            true,
            0,
            0,
            0,
            pixels,
            0,
            0,
            0,
            0,
            0,
            static_cast<uint16_t>(pixels),
            0,
            0
        };
}

constexpr bool is_valid_render_priority(uint8_t priority) {
    return priority <= 3;
}

constexpr bool is_valid_render_layer_mask(uint16_t mask) {
    return (mask & ~0x3Fu) == 0;
}

constexpr bool is_valid_blend_mode(BlendMode mode) {
    return static_cast<uint8_t>(mode) <= static_cast<uint8_t>(BlendMode::Darken);
}

constexpr bool is_valid_sprite_render_mode(SpriteRenderMode mode) {
    return static_cast<uint8_t>(mode) <= static_cast<uint8_t>(SpriteRenderMode::Window);
}

constexpr bool is_valid_blend_config(const BlendConfig& config) {
    return is_valid_render_layer_mask(config.first_targets) &&
           is_valid_render_layer_mask(config.second_targets) &&
           is_valid_blend_mode(config.mode) &&
           config.eva <= 16 &&
           config.evb <= 16 &&
           config.intensity <= 16;
}

constexpr bool is_valid_mosaic_config(const MosaicConfig& config) {
    return config.bg_x <= 15 &&
           config.bg_y <= 15 &&
           config.obj_x <= 15 &&
           config.obj_y <= 15;
}

constexpr bool is_valid_window_rect(const WindowRect& rect) {
    return rect.left <= 240 &&
           rect.right <= 240 &&
           rect.top <= 160 &&
           rect.bottom <= 160 &&
           rect.left < rect.right &&
           rect.top < rect.bottom;
}

constexpr bool is_valid_window_config(const WindowConfig& config) {
    return is_valid_window_rect(config.rect) &&
           is_valid_render_layer_mask(config.inside_mask) &&
           is_valid_render_layer_mask(config.outside_mask);
}

constexpr BackgroundMapSize background_map_size_for_dimensions(uint16_t width, uint16_t height) {
    if (width == 0 || height == 0 || width > 64 || height > 64) {
        return BackgroundMapSize::Invalid;
    }
    if (width > 32 && height > 32) {
        return BackgroundMapSize::Size64x64;
    }
    if (width > 32) {
        return BackgroundMapSize::Size64x32;
    }
    if (height > 32) {
        return BackgroundMapSize::Size32x64;
    }
    return BackgroundMapSize::Size32x32;
}

constexpr bool is_valid_background_map_size(BackgroundMapSize size) {
    return size != BackgroundMapSize::Invalid;
}

constexpr uint8_t background_screenblock_count(BackgroundMapSize size) {
    switch (size) {
    case BackgroundMapSize::Size32x32:
        return 1;
    case BackgroundMapSize::Size64x32:
    case BackgroundMapSize::Size32x64:
        return 2;
    case BackgroundMapSize::Size64x64:
        return 4;
    case BackgroundMapSize::Invalid:
        return 0;
    }
    return 0;
}

constexpr AffineBackgroundMapSize affine_background_map_size_for_dimensions(uint16_t width, uint16_t height) {
    if (width != height) {
        return AffineBackgroundMapSize::Invalid;
    }
    if (width == 16) {
        return AffineBackgroundMapSize::Size16x16;
    }
    if (width == 32) {
        return AffineBackgroundMapSize::Size32x32;
    }
    if (width == 64) {
        return AffineBackgroundMapSize::Size64x64;
    }
    if (width == 128) {
        return AffineBackgroundMapSize::Size128x128;
    }
    return AffineBackgroundMapSize::Invalid;
}

constexpr bool is_valid_affine_background_map_size(AffineBackgroundMapSize size) {
    return size != AffineBackgroundMapSize::Invalid;
}

constexpr uint8_t affine_background_screenblock_count(AffineBackgroundMapSize size) {
    switch (size) {
    case AffineBackgroundMapSize::Size16x16:
    case AffineBackgroundMapSize::Size32x32:
        return 1;
    case AffineBackgroundMapSize::Size64x64:
        return 2;
    case AffineBackgroundMapSize::Size128x128:
        return 8;
    case AffineBackgroundMapSize::Invalid:
        return 0;
    }
    return 0;
}

constexpr bool is_valid_background_parallax(const BackgroundParallax& parallax) {
    return is_valid_background_layer(parallax.layer) &&
           parallax.factor_x_256 >= -1024 &&
           parallax.factor_x_256 <= 1024 &&
           parallax.factor_y_256 >= -1024 &&
           parallax.factor_y_256 <= 1024;
}

constexpr Vec2i parallax_scroll_for_camera(Vec2i camera_pixels, const BackgroundParallax& parallax) {
    return Vec2i {
        parallax.offset_pixels.x + (camera_pixels.x * parallax.factor_x_256) / 256,
        parallax.offset_pixels.y + (camera_pixels.y * parallax.factor_y_256) / 256
    };
}

void render_init();
void render_demo_tiles();
void render_ui_assets();
bool load_palette(const PaletteAsset& asset, bool object_palette);
bool load_palette(const Lz77PaletteAsset& asset, bool object_palette);
bool load_palette(const HuffmanPaletteAsset& asset, bool object_palette);
bool load_palette_cycled(const PaletteAsset& asset, bool object_palette, uint16_t offset);
bool load_palette_blended(const PaletteAsset& asset, bool object_palette, uint16_t target_rgb15, uint8_t amount_16);
bool consume_event_palette_changes(
    EventState& state,
    const PaletteAsset* bg_palettes,
    size_t bg_palette_count,
    const PaletteAsset* obj_palettes,
    size_t obj_palette_count
);
bool load_tiles(const TileAsset& asset);
bool load_tiles(const Lz77TileAsset& asset);
bool load_tiles(const HuffmanTileAsset& asset);
bool load_tilemap(BackgroundLayer layer, const TileMapAsset& asset);
bool load_tilemap(BackgroundLayer layer, const Rle16TileMapAsset& asset);
bool load_tilemap(BackgroundLayer layer, const Lz77TileMapAsset& asset);
bool load_tilemap(BackgroundLayer layer, const HuffmanTileMapAsset& asset);
bool load_affine_tiles(const AffineTileAsset& asset);
bool load_affine_tiles(BackgroundLayer layer, const AffineTileAsset& asset);
bool load_affine_tilemap(BackgroundLayer layer, const AffineTileMapAsset& asset);
bool load_tilemap_bg0(const TileMapAsset& asset);
bool set_bg_tile(BackgroundLayer layer, int x, int y, int width, int height, uint16_t tile);
void set_bg_scroll(BackgroundLayer layer, int x, int y);
void set_bg_character_base(BackgroundLayer layer, uint8_t character_base);
void set_bg_color_depth(BackgroundLayer layer, ColorDepth depth);
void set_ui_character_base(uint8_t character_base);
void set_bg_screen_base(BackgroundLayer layer, uint8_t screen_base);
bool load_bg_tiles_at_character_base(const TileAsset& asset, uint8_t character_base);
void set_bg_enabled(BackgroundLayer layer, bool enabled);
void set_bg_scroll(int x, int y);
void set_bg_parallax(Vec2i camera_pixels, const BackgroundParallax& parallax);
void set_display_mode(DisplayMode mode);
void set_affine_bg_wrap(BackgroundLayer layer, bool enabled);
void set_affine_bg_transform(BackgroundLayer layer, const AffineBgTransform& transform);
bool load_bitmap16(DisplayMode mode, const Bitmap16Asset& asset, uint8_t page = 0);
bool load_bitmap8(DisplayMode mode, const Bitmap8Asset& asset, uint8_t page = 0);
bool apply_video_composition(const VideoComposition& composition);
void fill_bitmap16(DisplayMode mode, uint16_t color, uint8_t page = 0);
bool update_bitmap16_rect(DisplayMode mode, uint8_t page, uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint16_t* pixels, uint16_t stride);
bool update_bitmap8_rect(uint8_t page, uint16_t x, uint16_t y, uint16_t width, uint16_t height, const uint8_t* pixels, uint16_t stride);
void set_display_frame_page(uint8_t page);
void set_bg_priority(BackgroundLayer layer, uint8_t priority);
void set_bg_mosaic(BackgroundLayer layer, bool enabled);
void set_blending(const BlendConfig& config);
void disable_blending();
void set_mosaic(const MosaicConfig& config);
void disable_mosaic();
void set_window0(const WindowConfig& config);
void disable_window0();
void set_window1(const WindowConfig& config);
void disable_window1();
void set_obj_window_masks(uint16_t inside_mask, uint16_t outside_mask);
void disable_obj_window();
void draw_room_to_bg0(const uint8_t* tiles, int width, int height, int camera_x, int camera_y);
void draw_room_to_bg0(const uint16_t* tiles, int width, int height, int camera_x, int camera_y);
void draw_room_to_bg(BackgroundLayer layer, const uint8_t* tiles, int width, int height, int camera_x, int camera_y);
void draw_room_to_bg(BackgroundLayer layer, const uint16_t* tiles, int width, int height, int camera_x, int camera_y);

// Opt-in streaming for immutable room maps. Reset on room entry, video mode
// changes or any other writer replacing this layer's tilemap.
struct RoomTilemapCache {
    const uint16_t* tiles = nullptr;
    int width = 0, height = 0, tile_x = 0, tile_y = 0;
    BackgroundLayer layer = BackgroundLayer::BG0;
    bool valid = false;
};
void draw_room_to_bg_cached(BackgroundLayer layer, const uint16_t* tiles, int width, int height,
    int camera_x, int camera_y, RoomTilemapCache& cache);
void draw_text_at(int x, int y, int width, const char* text);
void draw_text_overlay(int x, int y, int width, const char* text, bool visible = true);
void draw_text_overlay_slot(int x, int y, int width, const char* text, int oam_offset, bool visible = true);
void draw_text_overlay_light(int x, int y, int width, const char* text, bool visible = true);
void draw_text_input_surface(int x, int y, int width, int height, bool visible = true);
void draw_text_input_keyboard(int x, int y, int width, int height, int selected_index, bool lowercase, bool visible = true);
void draw_text_input_keyboard_with_controls(int x, int y, int width, int height, int selected_index, bool lowercase, bool visible, int control_layout, int controls_x, int controls_y, int controls_width, int controls_height, int surface = 0);
void set_sprite(int index, const Sprite& sprite);
bool set_affine_sprite_transform(uint8_t matrix_index, const AffineSpriteTransform& transform);
bool set_affine_sprite_transform_at_frame(
    uint8_t matrix_index,
    const AffineMatrixKeyframe* keyframes,
    size_t count,
    uint32_t frame,
    Easing easing = Easing::Linear
);
bool set_affine_bg_transform_at_frame(
    BackgroundLayer layer,
    const AffineTransformKeyframe* keyframes,
    size_t count,
    uint32_t frame,
    Easing easing = Easing::Linear
);
void set_metasprite(int first_index, const MetaSprite& metasprite, Vec2i position);
void hide_all_sprites();
void hide_sprites(int first_index, int count);
bool set_hblank_bg_scroll(BackgroundLayer layer, const int16_t* offsets, size_t count);
bool set_hblank_affine_raster(
    BackgroundLayer layer,
    const HBlankAffineRasterLine* lines,
    size_t count
);
void disable_hblank_effects();

} // namespace gbs
