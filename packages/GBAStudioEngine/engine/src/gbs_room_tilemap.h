#pragma once
#include <stdint.h>

/* Preserve complete 32x32 maps, including palette/flip bits and zero padding. */
static inline void gbs_stage_room_tilemap16(uint16_t* shadow, const uint16_t* tiles,
    int width, int height, int camera_x, int camera_y) {
    const int tile_x = camera_x / 8;
    const int tile_y = camera_y / 8;
    const int source_x = tile_x < 0 ? 0 : tile_x;
    int left = tile_x < 0 ? -tile_x : 0;
    if (left > 32) left = 32;
    int count = width > source_x ? width - source_x : 0;
    if (count > 32 - left) count = 32 - left;
    for (int y = 0; y < 32; ++y) {
        uint16_t* target = shadow + y * 32;
        const int world_y = tile_y + y;
        if (tiles == 0 || world_y < 0 || world_y >= height || count == 0) {
            for (int x = 0; x < 32; ++x) target[x] = 0;
            continue;
        }
        for (int x = 0; x < left; ++x) target[x] = 0;
        const uint16_t* source = tiles + world_y * width + source_x;
        for (int x = 0; x < count; ++x) target[left + x] = source[x];
        for (int x = left + count; x < 32; ++x) target[x] = 0;
    }
}
