#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

enum class ColorDepth : uint8_t {
    Bpp4 = 4,
    Bpp8 = 8
};

enum class AssetCompression : uint8_t {
    None = 0,
    Rle16 = 1,
    Lz77 = 2,
    Huffman = 3
};

constexpr bool is_valid_asset_compression(AssetCompression compression) {
    return compression == AssetCompression::None ||
           compression == AssetCompression::Rle16 ||
           compression == AssetCompression::Lz77 ||
           compression == AssetCompression::Huffman;
}

constexpr bool has_compressed_asset_payload(
    AssetCompression compression,
    const void* data,
    size_t data_size,
    size_t decoded_count
) {
    return compression != AssetCompression::None &&
           is_valid_asset_compression(compression) &&
           data != nullptr &&
           data_size > 0 &&
           decoded_count > 0;
}

struct PaletteAsset {
    const uint16_t* colors;
    uint16_t color_count;
    uint16_t start_index;
    AssetCompression compression = AssetCompression::None;
    const void* compressed_data = nullptr;
    size_t compressed_data_size = 0;
    size_t compressed_decoded_count = 0;
};

struct TileAsset {
    const uint8_t* data;
    uint16_t tile_count;
    uint16_t destination_tile;
    bool object_tiles;
    ColorDepth color_depth = ColorDepth::Bpp4;
    AssetCompression compression = AssetCompression::None;
    const void* compressed_data = nullptr;
    size_t compressed_data_size = 0;
    size_t compressed_decoded_count = 0;
};

struct TileMapAsset {
    const uint16_t* entries;
    uint16_t width;
    uint16_t height;
    AssetCompression compression = AssetCompression::None;
    const void* compressed_data = nullptr;
    size_t compressed_data_size = 0;
    size_t compressed_decoded_count = 0;
};

struct AffineTileAsset {
    const uint8_t* data;
    uint16_t tile_count;
    uint16_t destination_tile;
};

struct AffineTileMapAsset {
    const uint8_t* entries;
    uint16_t width;
    uint16_t height;
};

struct MetaSpritePart {
    int8_t x;
    int8_t y;
    uint16_t tile_index;
    uint8_t palette;
    bool hflip;
    bool vflip;
    uint8_t width = 16;
    uint8_t height = 16;
    ColorDepth color_depth = ColorDepth::Bpp4;
};

struct MetaSprite {
    const MetaSpritePart* parts;
    uint8_t part_count;
};

struct SpriteAnimationFrame {
    MetaSprite metasprite;
    uint8_t duration_frames;
    const TileAsset* streamed_tile_asset = nullptr;
};

struct SpriteAnimation {
    const SpriteAnimationFrame* frames;
    uint8_t frame_count;
    bool loop;
};

struct RenderAssetCost {
    bool valid;
    uint32_t tile_bytes;
    uint32_t tilemap_bytes;
    uint32_t palette_bytes;
    uint32_t bitmap_bytes;
    uint16_t bg_tiles;
    uint16_t obj_tiles;
    uint16_t affine_tiles;
    uint16_t palette_colors;
    uint16_t tilemap_entries;
    uint16_t bitmap_pixels;
    uint16_t oam_sprites;
    uint8_t screenblocks;
};

constexpr size_t bytes_per_4bpp_tile = 32;
constexpr size_t bytes_per_8bpp_tile = 64;
constexpr size_t bytes_per_affine_8bpp_tile = 64;
constexpr size_t bytes_per_palette_color = 2;
constexpr size_t tilemap_entry_bytes = 2;

constexpr bool is_valid_color_depth(ColorDepth depth) {
    return depth == ColorDepth::Bpp4 || depth == ColorDepth::Bpp8;
}

constexpr size_t bytes_per_tile(ColorDepth depth) {
    return depth == ColorDepth::Bpp8 ? bytes_per_8bpp_tile : bytes_per_4bpp_tile;
}

constexpr bool is_valid_palette_asset(const PaletteAsset& asset) {
    const bool valid_shape = asset.color_count > 0 &&
           asset.color_count <= 256 &&
           static_cast<uint16_t>(asset.start_index + asset.color_count) <= 256;
    if (!valid_shape || !is_valid_asset_compression(asset.compression)) {
        return false;
    }
    if (asset.compression == AssetCompression::None) {
        return asset.colors != nullptr;
    }
    return asset.compression != AssetCompression::Rle16 &&
           has_compressed_asset_payload(
               asset.compression,
               asset.compressed_data,
               asset.compressed_data_size,
               asset.compressed_decoded_count
           );
}

constexpr bool is_valid_tile_asset(const TileAsset& asset) {
    const uint16_t tile_limit = 1024;
    const bool valid_shape = is_valid_color_depth(asset.color_depth) &&
           (asset.color_depth == ColorDepth::Bpp4 || asset.object_tiles) &&
           asset.tile_count > 0 &&
           asset.tile_count <= tile_limit &&
           asset.destination_tile < tile_limit &&
           (asset.color_depth == ColorDepth::Bpp4
                ? static_cast<uint32_t>(asset.destination_tile) + asset.tile_count <= tile_limit
                : (asset.destination_tile % 2u) == 0 &&
                  static_cast<uint32_t>(asset.destination_tile) + static_cast<uint32_t>(asset.tile_count) * 2u <= tile_limit);
    if (!valid_shape || !is_valid_asset_compression(asset.compression)) {
        return false;
    }
    if (asset.compression == AssetCompression::None) {
        return asset.data != nullptr;
    }
    return asset.compression != AssetCompression::Rle16 &&
           has_compressed_asset_payload(
               asset.compression,
               asset.compressed_data,
               asset.compressed_data_size,
               asset.compressed_decoded_count
           );
}

constexpr bool is_valid_tilemap_asset(const TileMapAsset& asset) {
    const bool valid_shape = asset.width > 0 &&
           asset.height > 0 &&
           asset.width <= 64 &&
           asset.height <= 64;
    if (!valid_shape || !is_valid_asset_compression(asset.compression)) {
        return false;
    }
    if (asset.compression == AssetCompression::None) {
        return asset.entries != nullptr;
    }
    return has_compressed_asset_payload(
        asset.compression,
        asset.compressed_data,
        asset.compressed_data_size,
        asset.compressed_decoded_count
    );
}

constexpr bool is_valid_streaming_tilemap_asset(const TileMapAsset& asset) {
    return asset.entries != nullptr && asset.width > 0 && asset.height > 0;
}

constexpr bool is_valid_affine_tile_asset(const AffineTileAsset& asset) {
    return asset.data != nullptr &&
           asset.tile_count > 0 &&
           asset.tile_count <= 256 &&
           asset.destination_tile < 256 &&
           static_cast<uint32_t>(asset.destination_tile) + asset.tile_count <= 256;
}

constexpr bool is_valid_affine_tilemap_asset(const AffineTileMapAsset& asset) {
    return asset.entries != nullptr &&
           asset.width > 0 &&
           asset.height > 0 &&
           asset.width == asset.height &&
           (asset.width == 16 || asset.width == 32 || asset.width == 64 || asset.width == 128);
}

constexpr bool is_valid_gba_obj_dimensions(int width, int height) {
    return (width == height && (width == 8 || width == 16 || width == 32 || width == 64)) ||
           (width == 16 && height == 8) ||
           (width == 32 && height == 8) ||
           (width == 32 && height == 16) ||
           (width == 64 && height == 32) ||
           (width == 8 && height == 16) ||
           (width == 8 && height == 32) ||
           (width == 16 && height == 32) ||
           (width == 32 && height == 64);
}

constexpr bool is_valid_metasprite(const MetaSprite& metasprite) {
    if (metasprite.parts == nullptr || metasprite.part_count == 0 || metasprite.part_count > 32) {
        return false;
    }
    for (uint8_t index = 0; index < metasprite.part_count; ++index) {
        if (!is_valid_gba_obj_dimensions(metasprite.parts[index].width, metasprite.parts[index].height) ||
            !is_valid_color_depth(metasprite.parts[index].color_depth) ||
            (metasprite.parts[index].color_depth == ColorDepth::Bpp8 && (metasprite.parts[index].tile_index % 2u) != 0)) {
            return false;
        }
    }
    return true;
}

constexpr bool is_valid_sprite_animation(const SpriteAnimation& animation) {
    if (animation.frames == nullptr || animation.frame_count == 0) {
        return false;
    }
    for (uint8_t index = 0; index < animation.frame_count; ++index) {
        if (!is_valid_metasprite(animation.frames[index].metasprite) ||
            animation.frames[index].duration_frames == 0) {
            return false;
        }
    }
    return true;
}

constexpr RenderAssetCost invalid_render_asset_cost() {
    return RenderAssetCost {
        false,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
    };
}

constexpr RenderAssetCost estimate_palette_asset_cost(const PaletteAsset& asset) {
    return !is_valid_palette_asset(asset)
        ? invalid_render_asset_cost()
        : RenderAssetCost {
            true,
            0,
            0,
            static_cast<uint32_t>(static_cast<uint32_t>(asset.color_count) * bytes_per_palette_color),
            0,
            0,
            0,
            0,
            asset.color_count,
            0,
            0,
            0,
            0
        };
}

constexpr RenderAssetCost estimate_tile_asset_cost(const TileAsset& asset) {
    return !is_valid_tile_asset(asset)
        ? invalid_render_asset_cost()
        : RenderAssetCost {
            true,
            static_cast<uint32_t>(static_cast<uint32_t>(asset.tile_count) * bytes_per_tile(asset.color_depth)),
            0,
            0,
            0,
            asset.object_tiles ? static_cast<uint16_t>(0) : asset.tile_count,
            asset.object_tiles ? asset.tile_count : static_cast<uint16_t>(0),
            0,
            0,
            0,
            0,
            0,
            0
        };
}

constexpr RenderAssetCost estimate_affine_tile_asset_cost(const AffineTileAsset& asset) {
    return !is_valid_affine_tile_asset(asset)
        ? invalid_render_asset_cost()
        : RenderAssetCost {
            true,
            static_cast<uint32_t>(static_cast<uint32_t>(asset.tile_count) * bytes_per_affine_8bpp_tile),
            0,
            0,
            0,
            0,
            0,
            asset.tile_count,
            0,
            0,
            0,
            0,
            0
        };
}

constexpr uint8_t text_screenblock_count_for_dimensions(uint16_t width, uint16_t height) {
    if (width == 0 || height == 0 || width > 64 || height > 64) {
        return 0;
    }
    if (width > 32 && height > 32) {
        return 4;
    }
    return (width > 32 || height > 32) ? 2 : 1;
}

constexpr uint8_t affine_screenblock_count_for_dimensions(uint16_t width, uint16_t height) {
    if (width != height) {
        return 0;
    }
    if (width == 16 || width == 32) {
        return 1;
    }
    if (width == 64) {
        return 2;
    }
    if (width == 128) {
        return 8;
    }
    return 0;
}

constexpr RenderAssetCost estimate_tilemap_asset_cost(const TileMapAsset& asset) {
    const uint32_t entries = static_cast<uint32_t>(asset.width) * asset.height;
    return !is_valid_tilemap_asset(asset)
        ? invalid_render_asset_cost()
        : RenderAssetCost {
            true,
            0,
            static_cast<uint32_t>(entries * tilemap_entry_bytes),
            0,
            0,
            0,
            0,
            0,
            0,
            static_cast<uint16_t>(entries),
            0,
            0,
            text_screenblock_count_for_dimensions(asset.width, asset.height)
        };
}

constexpr RenderAssetCost estimate_affine_tilemap_asset_cost(const AffineTileMapAsset& asset) {
    const uint32_t entries = static_cast<uint32_t>(asset.width) * asset.height;
    return !is_valid_affine_tilemap_asset(asset)
        ? invalid_render_asset_cost()
        : RenderAssetCost {
            true,
            0,
            entries,
            0,
            0,
            0,
            0,
            0,
            0,
            static_cast<uint16_t>(entries),
            0,
            0,
            affine_screenblock_count_for_dimensions(asset.width, asset.height)
        };
}

constexpr RenderAssetCost estimate_metasprite_cost(const MetaSprite& metasprite) {
    return !is_valid_metasprite(metasprite)
        ? invalid_render_asset_cost()
        : RenderAssetCost {
            true,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            metasprite.part_count,
            0
        };
}

constexpr RenderAssetCost add_render_asset_cost(RenderAssetCost lhs, RenderAssetCost rhs) {
    return RenderAssetCost {
        lhs.valid && rhs.valid,
        lhs.tile_bytes + rhs.tile_bytes,
        lhs.tilemap_bytes + rhs.tilemap_bytes,
        lhs.palette_bytes + rhs.palette_bytes,
        lhs.bitmap_bytes + rhs.bitmap_bytes,
        static_cast<uint16_t>(lhs.bg_tiles + rhs.bg_tiles),
        static_cast<uint16_t>(lhs.obj_tiles + rhs.obj_tiles),
        static_cast<uint16_t>(lhs.affine_tiles + rhs.affine_tiles),
        static_cast<uint16_t>(lhs.palette_colors + rhs.palette_colors),
        static_cast<uint16_t>(lhs.tilemap_entries + rhs.tilemap_entries),
        static_cast<uint16_t>(lhs.bitmap_pixels + rhs.bitmap_pixels),
        static_cast<uint16_t>(lhs.oam_sprites + rhs.oam_sprites),
        static_cast<uint8_t>(lhs.screenblocks + rhs.screenblocks)
    };
}

} // namespace gbs
