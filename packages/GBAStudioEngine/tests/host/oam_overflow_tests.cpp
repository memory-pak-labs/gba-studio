#include <cassert>
#include <cstdint>

// Stubs for gbs_hw.c dependencies needed by OAM functions.
extern "C" {
    static uint16_t shadow_oam[128 * 4] = {};
    static uint8_t shadow_oam_dirty_first = 128;
    static uint8_t shadow_oam_dirty_last = 0;
    static uint32_t oam_overflow_count = 0;

    static void mark_shadow_oam_dirty(int first, int count) {
        if (first >= 128 || count <= 0) return;
        if (first + count > 128) count = 128 - first;
        int last = first + count;
        if (shadow_oam_dirty_last == 0 || first < shadow_oam_dirty_first) {
            shadow_oam_dirty_first = (uint8_t)first;
        }
        if (last > shadow_oam_dirty_last) {
            shadow_oam_dirty_last = (uint8_t)last;
        }
    }

    void gbs_hw_set_sprite(int index, int x, int y, uint16_t tile_index, uint16_t palette,
                           int hflip, int vflip, int visible, uint16_t priority,
                           uint16_t mode, int mosaic, uint16_t shape, uint16_t size) {
        if (index < 0 || index >= 128) {
            ++oam_overflow_count;
            return;
        }
        if (!visible) {
            shadow_oam[index * 4 + 0] = (2u << 8);
            shadow_oam[index * 4 + 1] = 0;
            shadow_oam[index * 4 + 2] = 0;
            shadow_oam[index * 4 + 3] = 0;
            mark_shadow_oam_dirty(index, 1);
            return;
        }
        shadow_oam[index * 4 + 0] = (uint16_t)((y & 0x00FF) | ((mode & 3u) << 10) | (mosaic ? (1u << 12) : 0) | ((shape & 3u) << 14));
        shadow_oam[index * 4 + 1] = (uint16_t)((x & 0x01FF) | (hflip ? (1u << 12) : 0) | (vflip ? (1u << 13) : 0) | ((size & 3u) << 14));
        shadow_oam[index * 4 + 2] = (uint16_t)(tile_index | ((priority & 3u) << 10) | ((palette & 15u) << 12));
        mark_shadow_oam_dirty(index, 1);
    }

    void gbs_hw_set_sprite_color_depth(int index, int eight_bpp) {
        if (index < 0 || index >= 128) {
            ++oam_overflow_count;
            return;
        }
        if (eight_bpp) {
            shadow_oam[index * 4 + 0] = (uint16_t)(shadow_oam[index * 4 + 0] | (1u << 13));
        } else {
            shadow_oam[index * 4 + 0] = (uint16_t)(shadow_oam[index * 4 + 0] & ~(1u << 13));
        }
        mark_shadow_oam_dirty(index, 1);
    }

    void gbs_hw_set_sprite_affine(int index, int enabled, int double_size, uint16_t matrix_index) {
        if (index < 0 || index >= 128 || matrix_index >= 32) {
            ++oam_overflow_count;
            return;
        }
        uint16_t attr0 = shadow_oam[index * 4 + 0];
        uint16_t attr1 = shadow_oam[index * 4 + 1];
        if (enabled) {
            attr0 = (uint16_t)(attr0 & ~((1u << 8) | (1u << 9)));
            attr1 = (uint16_t)(attr1 & ~(31u << 9));
            attr0 = (uint16_t)(attr0 | (1u << 8) | (double_size ? (1u << 9) : 0));
            attr1 = (uint16_t)(attr1 | ((matrix_index & 31u) << 9));
        } else {
            attr0 = (uint16_t)(attr0 & ~(1u << 8));
        }
        shadow_oam[index * 4 + 0] = attr0;
        shadow_oam[index * 4 + 1] = attr1;
        mark_shadow_oam_dirty(index, 1);
    }

    uint32_t gbs_hw_oam_overflow_count(void) {
        return oam_overflow_count;
    }

    void gbs_hw_reset_oam_overflow_count(void) {
        oam_overflow_count = 0;
    }
}

void test_oam_valid_indices() {
    gbs_hw_reset_oam_overflow_count();
    // Indices 0-127 should not overflow.
    for (int i = 0; i < 128; ++i) {
        gbs_hw_set_sprite(i, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0);
    }
    assert(gbs_hw_oam_overflow_count() == 0);
}

void test_oam_overflow_index_128() {
    gbs_hw_reset_oam_overflow_count();
    gbs_hw_set_sprite(128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0);
    assert(gbs_hw_oam_overflow_count() == 1);
}

void test_oam_overflow_negative_index() {
    gbs_hw_reset_oam_overflow_count();
    gbs_hw_set_sprite(-1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0);
    assert(gbs_hw_oam_overflow_count() == 1);
}

void test_oam_overflow_color_depth() {
    gbs_hw_reset_oam_overflow_count();
    gbs_hw_set_sprite_color_depth(200, 1);
    assert(gbs_hw_oam_overflow_count() == 1);
}

void test_oam_overflow_affine() {
    gbs_hw_reset_oam_overflow_count();
    gbs_hw_set_sprite_affine(150, 1, 0, 0);
    assert(gbs_hw_oam_overflow_count() == 1);
}

void test_oam_overflow_cumulative() {
    gbs_hw_reset_oam_overflow_count();
    gbs_hw_set_sprite(128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0);
    gbs_hw_set_sprite(-1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0);
    gbs_hw_set_sprite_color_depth(200, 1);
    gbs_hw_set_sprite_affine(150, 1, 0, 0);
    assert(gbs_hw_oam_overflow_count() == 4);
}

void test_oam_overflow_reset() {
    gbs_hw_reset_oam_overflow_count();
    gbs_hw_set_sprite(128, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0);
    assert(gbs_hw_oam_overflow_count() == 1);
    gbs_hw_reset_oam_overflow_count();
    assert(gbs_hw_oam_overflow_count() == 0);
}

int main() {
    test_oam_valid_indices();
    test_oam_overflow_index_128();
    test_oam_overflow_negative_index();
    test_oam_overflow_color_depth();
    test_oam_overflow_affine();
    test_oam_overflow_cumulative();
    test_oam_overflow_reset();
    return 0;
}