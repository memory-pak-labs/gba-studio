#ifndef GBS_PAGED_AFFINE_H
#define GBS_PAGED_AFFINE_H

#include <stdint.h>

enum { GBS_AFFINE_PAGE_TILES = 128 };

typedef struct GbsAffinePageRect {
    int32_t left, top, right, bottom;
} GbsAffinePageRect;

typedef struct GbsPagedAffineFrame {
    const uint8_t* entries;
    uint16_t map_tiles;
    uint8_t layer, wrap, blank;
    int16_t pa, pb, pc, pd;
    int32_t x8, y8;
    GbsAffinePageRect visible;
} GbsPagedAffineFrame;

static inline int32_t gbs_affine_min(int32_t a, int32_t b) { return a < b ? a : b; }
static inline int32_t gbs_affine_max(int32_t a, int32_t b) { return a > b ? a : b; }

static inline int32_t gbs_affine_floor_tile(int64_t position) {
    // Floor is required for subpixel samples just outside the world.
    return (int32_t)(position >= 0 ? position / 2048 : (position - 2047) / 2048);
}

static inline GbsAffinePageRect gbs_affine_page_bounds(
    int16_t pa, int16_t pb, int16_t pc, int16_t pd, int32_t x8, int32_t y8
) {
    const int32_t ax = pa * 239, bx = pb * 159, ay = pc * 239, by = pd * 159;
    const GbsAffinePageRect bounds = {
        gbs_affine_floor_tile((int64_t)x8 + gbs_affine_min(0, ax) + gbs_affine_min(0, bx)),
        gbs_affine_floor_tile((int64_t)y8 + gbs_affine_min(0, ay) + gbs_affine_min(0, by)),
        gbs_affine_floor_tile((int64_t)x8 + gbs_affine_max(0, ax) + gbs_affine_max(0, bx)) + 1,
        gbs_affine_floor_tile((int64_t)y8 + gbs_affine_max(0, ay) + gbs_affine_max(0, by)) + 1
    };
    return bounds;
}

static inline GbsAffinePageRect gbs_affine_page_aligned(GbsAffinePageRect bounds) {
    bounds.left &= ~1; // The GBA writes adjacent byte entries in halfwords.
    bounds.right = (bounds.right + 1) & ~1;
    return bounds;
}

static inline int gbs_affine_page_fits(GbsAffinePageRect bounds) {
    bounds = gbs_affine_page_aligned(bounds);
    return bounds.right - bounds.left <= GBS_AFFINE_PAGE_TILES &&
        bounds.bottom - bounds.top <= GBS_AFFINE_PAGE_TILES;
}

static inline int gbs_affine_page_contains(GbsAffinePageRect outer, GbsAffinePageRect inner) {
    return outer.left <= inner.left && outer.top <= inner.top &&
           outer.right >= inner.right && outer.bottom >= inner.bottom;
}

static inline GbsAffinePageRect gbs_affine_page_with_margin(GbsAffinePageRect bounds) {
    const GbsAffinePageRect padded = {
        bounds.left - 4, bounds.top - 4, bounds.right + 4, bounds.bottom + 4
    };
    return gbs_affine_page_aligned(gbs_affine_page_fits(padded) ? padded : bounds);
}

static inline uint32_t gbs_affine_wrap_tile(int32_t tile, uint32_t dimension) {
    return (uint32_t)tile & (dimension - 1u);
}

#endif
