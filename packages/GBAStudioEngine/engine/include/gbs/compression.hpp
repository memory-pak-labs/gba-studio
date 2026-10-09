#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/assets.hpp"

namespace gbs {

struct Rle16Run {
    uint16_t value;
    uint16_t count;
};

struct Rle16Asset {
    const Rle16Run* runs;
    size_t run_count;
    size_t decoded_count;
};

struct Rle16TileMapAsset {
    Rle16Asset data;
    uint16_t width;
    uint16_t height;
};

struct Lz77Asset {
    const uint8_t* data;
    size_t data_size;
    size_t decoded_count;
};

struct Lz77TileMapAsset {
    Lz77Asset data;
    uint16_t width;
    uint16_t height;
};

struct Lz77TileAsset {
    Lz77Asset data;
    uint16_t tile_count;
    uint16_t destination_tile;
    bool object_tiles;
    ColorDepth color_depth = ColorDepth::Bpp4;
};

struct Lz77PaletteAsset {
    Lz77Asset data;
    uint16_t color_count;
    uint16_t start_index;
};

struct HuffmanAsset {
    const uint8_t* data;
    size_t data_size;
    size_t decoded_count;
};

struct HuffmanTileMapAsset {
    HuffmanAsset data;
    uint16_t width;
    uint16_t height;
};

struct HuffmanTileAsset {
    HuffmanAsset data;
    uint16_t tile_count;
    uint16_t destination_tile;
    bool object_tiles;
    ColorDepth color_depth = ColorDepth::Bpp4;
};

struct HuffmanPaletteAsset {
    HuffmanAsset data;
    uint16_t color_count;
    uint16_t start_index;
};

constexpr size_t max_rle16_tilemap_entries = 64 * 64;
constexpr size_t max_lz77_tilemap_bytes = max_rle16_tilemap_entries * 2;
constexpr size_t lz77_tile_asset_bytes_per_tile = 32;
constexpr size_t lz77_8bpp_tile_asset_bytes_per_tile = 64;
constexpr size_t max_lz77_tile_asset_bytes = 1024 * lz77_tile_asset_bytes_per_tile;
constexpr size_t max_lz77_palette_colors = 256;
constexpr size_t max_lz77_palette_bytes = max_lz77_palette_colors * 2;
constexpr size_t max_huffman_tile_asset_bytes = max_lz77_tile_asset_bytes;
constexpr size_t max_huffman_palette_bytes = max_lz77_palette_bytes;

constexpr size_t rle16_run_total(const Rle16Asset& asset) {
    size_t total = 0;
    for (size_t index = 0; index < asset.run_count; ++index) {
        total += asset.runs[index].count;
    }
    return total;
}

constexpr bool is_valid_rle16_asset(const Rle16Asset& asset) {
    if (asset.runs == nullptr || asset.run_count == 0 || asset.decoded_count == 0) {
        return false;
    }

    size_t total = 0;
    for (size_t index = 0; index < asset.run_count; ++index) {
        if (asset.runs[index].count == 0) {
            return false;
        }
        total += asset.runs[index].count;
        if (total > asset.decoded_count) {
            return false;
        }
    }
    return total == asset.decoded_count;
}

constexpr bool is_valid_rle16_tilemap_asset(const Rle16TileMapAsset& asset) {
    return asset.width > 0 &&
           asset.height > 0 &&
           asset.width <= 64 &&
           asset.height <= 64 &&
           static_cast<size_t>(asset.width) * asset.height <= max_rle16_tilemap_entries &&
           is_valid_rle16_asset(asset.data) &&
           asset.data.decoded_count == static_cast<size_t>(asset.width) * asset.height;
}

constexpr bool is_valid_lz77_asset(const Lz77Asset& asset) {
    return asset.data != nullptr &&
           asset.data_size >= 4 &&
           asset.decoded_count > 0 &&
           asset.decoded_count <= 0xFFFFFFu &&
           asset.data[0] == 0x10 &&
           (static_cast<size_t>(asset.data[1]) |
            (static_cast<size_t>(asset.data[2]) << 8) |
            (static_cast<size_t>(asset.data[3]) << 16)) == asset.decoded_count;
}

constexpr bool is_valid_lz77_tilemap_asset(const Lz77TileMapAsset& asset) {
    return asset.width > 0 &&
           asset.height > 0 &&
           asset.width <= 64 &&
           asset.height <= 64 &&
           static_cast<size_t>(asset.width) * asset.height <= max_rle16_tilemap_entries &&
           is_valid_lz77_asset(asset.data) &&
           asset.data.decoded_count == static_cast<size_t>(asset.width) * asset.height * 2;
}

constexpr bool is_valid_lz77_tile_asset(const Lz77TileAsset& asset) {
    const uint16_t tile_limit = 1024;
    return asset.tile_count > 0 &&
           is_valid_color_depth(asset.color_depth) &&
           (asset.color_depth == ColorDepth::Bpp4 || asset.object_tiles) &&
           asset.tile_count <= tile_limit &&
           asset.destination_tile < tile_limit &&
           (asset.color_depth == ColorDepth::Bpp4
                ? static_cast<uint32_t>(asset.destination_tile) + asset.tile_count <= tile_limit
                : (asset.destination_tile % 2u) == 0 &&
                  static_cast<uint32_t>(asset.destination_tile) + static_cast<uint32_t>(asset.tile_count) * 2u <= tile_limit) &&
           is_valid_lz77_asset(asset.data) &&
           asset.data.decoded_count == static_cast<size_t>(asset.tile_count) *
               (asset.color_depth == ColorDepth::Bpp8 ? lz77_8bpp_tile_asset_bytes_per_tile : lz77_tile_asset_bytes_per_tile) &&
           asset.data.decoded_count <= max_lz77_tile_asset_bytes;
}

constexpr bool is_valid_lz77_palette_asset(const Lz77PaletteAsset& asset) {
    return asset.color_count > 0 &&
           asset.color_count <= max_lz77_palette_colors &&
           asset.start_index < max_lz77_palette_colors &&
           static_cast<uint32_t>(asset.start_index) + asset.color_count <= max_lz77_palette_colors &&
           is_valid_lz77_asset(asset.data) &&
           asset.data.decoded_count == static_cast<size_t>(asset.color_count) * 2 &&
           asset.data.decoded_count <= max_lz77_palette_bytes;
}

constexpr size_t huffman_decoded_size(const HuffmanAsset& asset) {
    if (asset.data == nullptr || asset.data_size < 4) {
        return 0;
    }
    return static_cast<size_t>(asset.data[1]) |
           (static_cast<size_t>(asset.data[2]) << 8) |
           (static_cast<size_t>(asset.data[3]) << 16);
}

constexpr uint8_t huffman_element_bits(const HuffmanAsset& asset) {
    if (asset.data == nullptr || asset.data_size < 1) {
        return 0;
    }
    const uint8_t bits = asset.data[0] & 0x0F;
    return bits == 0 ? 8 : bits;
}

constexpr bool is_valid_huffman_asset(const HuffmanAsset& asset) {
    if (asset.data == nullptr || asset.data_size < 9 || asset.decoded_count == 0 ||
        asset.decoded_count > 0xFFFFFFu || (asset.data[0] & 0xF0u) != 0x20u ||
        (huffman_element_bits(asset) != 4 && huffman_element_bits(asset) != 8) ||
        (asset.decoded_count % 4u) != 0 || huffman_decoded_size(asset) != asset.decoded_count) {
        return false;
    }

    const size_t tree_size = static_cast<size_t>(asset.data[4]) * 2u + 1u;
    const size_t tree_end = 5u + tree_size;
    const size_t bitstream_size = (asset.decoded_count + 3u) & ~static_cast<size_t>(3u);
    return tree_end <= asset.data_size && tree_end + bitstream_size <= asset.data_size;
}

constexpr bool is_valid_huffman_tilemap_asset(const HuffmanTileMapAsset& asset) {
    return asset.width > 0 &&
           asset.height > 0 &&
           asset.width <= 64 &&
           asset.height <= 64 &&
           static_cast<size_t>(asset.width) * asset.height <= max_rle16_tilemap_entries &&
           is_valid_huffman_asset(asset.data) &&
           huffman_element_bits(asset.data) == 8 &&
           asset.data.decoded_count == static_cast<size_t>(asset.width) * asset.height * 2;
}

constexpr bool is_valid_huffman_tile_asset(const HuffmanTileAsset& asset) {
    const uint16_t tile_limit = 1024;
    return asset.tile_count > 0 &&
           is_valid_color_depth(asset.color_depth) &&
           (asset.color_depth == ColorDepth::Bpp4 || asset.object_tiles) &&
           asset.tile_count <= tile_limit &&
           asset.destination_tile < tile_limit &&
           (asset.color_depth == ColorDepth::Bpp4
                ? static_cast<uint32_t>(asset.destination_tile) + asset.tile_count <= tile_limit
                : (asset.destination_tile % 2u) == 0 &&
                  static_cast<uint32_t>(asset.destination_tile) + static_cast<uint32_t>(asset.tile_count) * 2u <= tile_limit) &&
           is_valid_huffman_asset(asset.data) &&
           huffman_element_bits(asset.data) == 8 &&
           asset.data.decoded_count == static_cast<size_t>(asset.tile_count) *
               (asset.color_depth == ColorDepth::Bpp8 ? lz77_8bpp_tile_asset_bytes_per_tile : lz77_tile_asset_bytes_per_tile) &&
           asset.data.decoded_count <= max_huffman_tile_asset_bytes;
}

constexpr bool is_valid_huffman_palette_asset(const HuffmanPaletteAsset& asset) {
    return asset.color_count > 0 &&
           asset.color_count <= max_lz77_palette_colors &&
           asset.start_index < max_lz77_palette_colors &&
           static_cast<uint32_t>(asset.start_index) + asset.color_count <= max_lz77_palette_colors &&
           is_valid_huffman_asset(asset.data) &&
           huffman_element_bits(asset.data) == 8 &&
           asset.data.decoded_count == ((static_cast<size_t>(asset.color_count) * 2u + 3u) & ~static_cast<size_t>(3u)) &&
           asset.data.decoded_count <= max_huffman_palette_bytes;
}

bool decode_rle16(const Rle16Asset& asset, uint16_t* output, size_t output_count);
bool decode_lz77(const Lz77Asset& asset, uint8_t* output, size_t output_count);
bool decode_huffman(const HuffmanAsset& asset, uint8_t* output, size_t output_count);

} // namespace gbs
