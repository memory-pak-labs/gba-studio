#include <cassert>
#include "gbs/palette.hpp"

void test_rgb555_components() {
    const uint16_t white = 0x7FFF;
    assert(gbs::rgb555_red(white) == 31);
    assert(gbs::rgb555_green(white) == 31);
    assert(gbs::rgb555_blue(white) == 31);

    const uint16_t red = gbs::rgb555_pack(31, 0, 0);
    assert(red == 0x001F);
    const uint16_t green = gbs::rgb555_pack(0, 31, 0);
    assert(green == 0x03E0);
    const uint16_t blue = gbs::rgb555_pack(0, 0, 31);
    assert(blue == 0x7C00);
}

void test_blend() {
    const uint16_t black = 0x0000;
    const uint16_t white = 0x7FFF;
    // amount 0 -> black, 16 -> white, 8 -> halfway
    assert(gbs::rgb555_blend(black, white, 0) == black);
    assert(gbs::rgb555_blend(black, white, 16) == white);
    const uint16_t half = gbs::rgb555_blend(black, white, 8);
    assert(gbs::rgb555_red(half) == 15);
    assert(gbs::rgb555_green(half) == 15);
    assert(gbs::rgb555_blue(half) == 15);
}

void test_grayscale() {
    const uint16_t pure_red = gbs::rgb555_pack(31, 0, 0);
    // Full grayscale of pure red: luma = (31*5)/16 = 9
    const uint16_t gray = gbs::rgb555_grayscale(pure_red, 16);
    const int luma = gbs::rgb555_red(gray);
    assert(gbs::rgb555_red(gray) == luma);
    assert(gbs::rgb555_green(gray) == luma);
    assert(gbs::rgb555_blue(gray) == luma);
    assert(luma == (31 * 5) / 16);

    // amount 0 keeps color
    assert(gbs::rgb555_grayscale(pure_red, 0) == pure_red);
}

void test_invert() {
    const uint16_t black = 0x0000;
    const uint16_t white = 0x7FFF;
    assert(gbs::rgb555_invert(black) == white);
    assert(gbs::rgb555_invert(white) == black);
}

void test_hue_shift() {
    const uint16_t red = gbs::rgb555_pack(31, 0, 0);
    // amount 0 -> unchanged
    assert(gbs::rgb555_hue_shift(red, 0) == red);
    // amount 16 -> identity (wraps full rotation)
    assert(gbs::rgb555_hue_shift(red, 16) == red);
    // intermediate: red rotates toward green (r->g, g->b, b->r)
    const uint16_t shifted = gbs::rgb555_hue_shift(red, 8);
    assert(gbs::rgb555_red(shifted) == 15);
    assert(gbs::rgb555_green(shifted) == 15);
    assert(gbs::rgb555_blue(shifted) == 0);
}

void test_brightness() {
    const uint16_t gray10 = gbs::rgb555_pack(10, 10, 10);
    // amount 16 -> unchanged
    assert(gbs::rgb555_brightness(gray10, 16) == gray10);
    // amount 0 -> black
    assert(gbs::rgb555_brightness(gray10, 0) == 0x0000);
    // amount 32 -> white
    assert(gbs::rgb555_brightness(gray10, 32) == 0x7FFF);
}

void test_palette_rotate() {
    uint16_t palette[4] = { 0, 1, 2, 3 };
    gbs::palette_rotate(palette, 4, 1);
    // rotate right by 1: [3, 0, 1, 2]
    assert(palette[0] == 3);
    assert(palette[1] == 0);
    assert(palette[2] == 1);
    assert(palette[3] == 2);

    gbs::palette_rotate(palette, 4, -1);
    assert(palette[0] == 0);
    assert(palette[1] == 1);
    assert(palette[2] == 2);
    assert(palette[3] == 3);
}

void test_palette_transforms() {
    uint16_t palette[2] = { gbs::rgb555_pack(31, 0, 0), gbs::rgb555_pack(0, 31, 0) };
    gbs::palette_invert(palette, 2);
    assert(gbs::rgb555_red(palette[0]) == 0);
    assert(gbs::rgb555_green(palette[0]) == 31);
    assert(gbs::rgb555_green(palette[1]) == 0);
    assert(gbs::rgb555_red(palette[1]) == 31);
}

int main() {
    test_rgb555_components();
    test_blend();
    test_grayscale();
    test_invert();
    test_hue_shift();
    test_brightness();
    test_palette_rotate();
    test_palette_transforms();
    return 0;
}