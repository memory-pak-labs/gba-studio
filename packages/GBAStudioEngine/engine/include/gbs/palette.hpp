#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

// ============================================================
// RGB555 color math and palette effects
// ============================================================

constexpr uint16_t rgb555_r_mask = 0x001Fu;
constexpr uint16_t rgb555_g_mask = 0x03E0u;
constexpr uint16_t rgb555_b_mask = 0x7C00u;

inline int rgb555_red(uint16_t color) {
    return color & rgb555_r_mask;
}

inline int rgb555_green(uint16_t color) {
    return (color >> 5) & 0x1Fu;
}

inline int rgb555_blue(uint16_t color) {
    return (color >> 10) & 0x1Fu;
}

// Build an RGB555 value, clamping each channel to 0..31.
inline uint16_t rgb555_pack(int r, int g, int b) {
    if (r < 0) r = 0; else if (r > 31) r = 31;
    if (g < 0) g = 0; else if (g > 31) g = 31;
    if (b < 0) b = 0; else if (b > 31) b = 31;
    return static_cast<uint16_t>((r & 0x1F) | ((g & 0x1F) << 5) | ((b & 0x1F) << 10));
}

// Blend two RGB555 colors by amount_16 (0..16). 0 = fully `from`, 16 = fully `to`.
uint16_t rgb555_blend(uint16_t from, uint16_t to, uint16_t amount_16);

// Grayscale blend: amount_16 = 0 keeps the color, 16 = full grayscale.
uint16_t rgb555_grayscale(uint16_t color, uint16_t amount_16);

// Invert all three channels.
uint16_t rgb555_invert(uint16_t color);

// Approximate hue rotation. amount_16 maps to a 0..~360 degree rotation:
// 0 = none, 16 = full rotation (identity). Intermediate values rotate hues.
uint16_t rgb555_hue_shift(uint16_t color, uint16_t amount_16);

// Brightness: amount_16 in 0..32, where 16 = unchanged, 0 = black, 32 = white.
uint16_t rgb555_brightness(uint16_t color, uint16_t amount_16);

// ------------------------------------------------------------------
// In-place palette transforms over an array of RGB555 entries.
// ------------------------------------------------------------------

void palette_fade(uint16_t* colors, size_t count, uint16_t target, uint16_t amount_16);
void palette_grayscale(uint16_t* colors, size_t count, uint16_t amount_16);
void palette_invert(uint16_t* colors, size_t count);
void palette_hue_shift(uint16_t* colors, size_t count, uint16_t amount_16);
void palette_brightness(uint16_t* colors, size_t count, uint16_t amount_16);

// Rotate palette entries to the right by `steps` (wraps). Used for color cycling.
void palette_rotate(uint16_t* colors, size_t count, int steps);

} // namespace gbs