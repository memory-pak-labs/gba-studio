#pragma once
#include "gbs/assets.hpp"

namespace gbs {
struct HudGauge {
    const TileAsset* full = nullptr;
    const TileAsset* empty = nullptr;
    uint8_t x = 0, y = 0, width = 0, height = 0;
    bool reverse = false;
};

/** Preserve authored borders and shades; replace only the unfilled pixels.
 * The two assets must have identical uncompressed 4bpp metasprite layouts. */
inline bool compose_hud_gauge(const MetaSprite& sprite, const HudGauge& gauge,
    uint32_t value, uint32_t maximum, uint8_t* output, size_t capacity) {
    if (!gauge.full || !gauge.empty || !output || !sprite.parts || !gauge.full->data || !gauge.empty->data ||
        !gauge.full->object_tiles || !gauge.empty->object_tiles ||
        gauge.full->color_depth != ColorDepth::Bpp4 || gauge.empty->color_depth != ColorDepth::Bpp4 ||
        gauge.full->compression != AssetCompression::None || gauge.empty->compression != AssetCompression::None ||
        gauge.full->tile_count != gauge.empty->tile_count || capacity < gauge.full->tile_count * 32u) return false;
    const uint32_t filled = maximum ? static_cast<uint32_t>((static_cast<uint64_t>(value < maximum ? value : maximum) * gauge.width) / maximum) : 0;
    for (size_t n = 0; n < sprite.part_count; ++n) {
        const auto& part = sprite.parts[n];
        if (part.tile_index < gauge.full->destination_tile || part.hflip || part.vflip ||
            part.color_depth != ColorDepth::Bpp4 || !part.width || !part.height) return false;
        const size_t first = part.tile_index - gauge.full->destination_tile;
        if (first + (part.width / 8u) * (part.height / 8u) > gauge.full->tile_count) return false;
    }
    if (output != gauge.full->data) __builtin_memcpy(output, gauge.full->data, gauge.full->tile_count * 32u);
    const int empty_left = gauge.x + (gauge.reverse ? 0 : filled);
    const int empty_right = gauge.x + gauge.width - (gauge.reverse ? filled : 0);
    for (size_t n = 0; n < sprite.part_count; ++n) {
        const auto& part = sprite.parts[n];
        const size_t first = part.tile_index - gauge.full->destination_tile;
        const int left = empty_left > part.x ? empty_left : part.x;
        const int right = empty_right < part.x + part.width ? empty_right : part.x + part.width;
        const int top = gauge.y > part.y ? gauge.y : part.y;
        const int bottom = gauge.y + gauge.height < part.y + part.height ? gauge.y + gauge.height : part.y + part.height;
        if (left >= right || top >= bottom) continue;
        const unsigned end_x = right - part.x;
        for (unsigned py = top - part.y; py < static_cast<unsigned>(bottom - part.y); ++py) {
            unsigned px = left - part.x;
            while (px < end_x) {
                const unsigned tile_end = ((px / 8u) + 1u) * 8u;
                const unsigned end = tile_end < end_x ? tile_end : end_x;
                const size_t tile = first + (py / 8u) * (part.width / 8u) + px / 8u;
                size_t offset = tile * 32u + (py % 8u) * 4u + (px % 8u) / 2u;
                // Copy complete 4bpp bytes inside the empty span; only its
                // unaligned edges need masks. Borders never enter this loop.
                if (px & 1u) {
                    output[offset] = (output[offset] & 15u) | (gauge.empty->data[offset] & 240u);
                    ++px; ++offset;
                }
                while (px + 1u < end) {
                    output[offset] = gauge.empty->data[offset];
                    px += 2u; ++offset;
                }
                if (px < end) {
                    output[offset] = (output[offset] & 240u) | (gauge.empty->data[offset] & 15u);
                    ++px;
                }
            }
        }
    }
    return true;
}
} // namespace gbs
