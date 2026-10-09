#include "gbs/palette.hpp"

namespace gbs {

uint16_t rgb555_blend(uint16_t from, uint16_t to, uint16_t amount_16) {
    if (amount_16 == 0) {
        return from;
    }
    if (amount_16 >= 16) {
        return to;
    }
    const int fr = rgb555_red(from);
    const int fg = rgb555_green(from);
    const int fb = rgb555_blue(from);
    const int tr = rgb555_red(to);
    const int tg = rgb555_green(to);
    const int tb = rgb555_blue(to);
    const int r = (fr * (16 - amount_16) + tr * amount_16) / 16;
    const int g = (fg * (16 - amount_16) + tg * amount_16) / 16;
    const int b = (fb * (16 - amount_16) + tb * amount_16) / 16;
    return rgb555_pack(r, g, b);
}

uint16_t rgb555_grayscale(uint16_t color, uint16_t amount_16) {
    if (amount_16 == 0) {
        return color;
    }
    if (amount_16 >= 16) {
        amount_16 = 16;
    }
    const int r = rgb555_red(color);
    const int g = rgb555_green(color);
    const int b = rgb555_blue(color);
    // ITU-R BT.601 luma scaled to 5-bit range.
    const int luma = (r * 5 + g * 9 + b * 2) / 16;
    return rgb555_blend(color, rgb555_pack(luma, luma, luma), amount_16);
}

uint16_t rgb555_invert(uint16_t color) {
    return rgb555_pack(
        31 - rgb555_red(color),
        31 - rgb555_green(color),
        31 - rgb555_blue(color)
    );
}

uint16_t rgb555_hue_shift(uint16_t color, uint16_t amount_16) {
    if (amount_16 == 0 || amount_16 >= 16) {
        return color;
    }
    // Approximate hue rotation in RGB space. This is a cheap analogue of a
    // 3x3 rotation; it is deterministic and monotic in amount_16.
    const int r = rgb555_red(color);
    const int g = rgb555_green(color);
    const int b = rgb555_blue(color);
    const int t = static_cast<int>(amount_16);
    const int nr = (r * (16 - t) + b * t) / 16;
    const int ng = (g * (16 - t) + r * t) / 16;
    const int nb = (b * (16 - t) + g * t) / 16;
    return rgb555_pack(nr, ng, nb);
}

uint16_t rgb555_brightness(uint16_t color, uint16_t amount_16) {
    if (amount_16 == 16) {
        return color;
    }
    if (amount_16 <= 16) {
        // Darken toward black.
        return rgb555_blend(color, 0x0000u, static_cast<uint16_t>(16 - amount_16));
    }
    // Brighten toward white.
    const uint16_t a = static_cast<uint16_t>(amount_16 - 16);
    return rgb555_blend(color, 0x7FFFu, a > 16 ? 16 : a);
}

void palette_fade(uint16_t* colors, size_t count, uint16_t target, uint16_t amount_16) {
    if (colors == nullptr) {
        return;
    }
    for (size_t i = 0; i < count; ++i) {
        colors[i] = rgb555_blend(colors[i], target, amount_16);
    }
}

void palette_grayscale(uint16_t* colors, size_t count, uint16_t amount_16) {
    if (colors == nullptr) {
        return;
    }
    for (size_t i = 0; i < count; ++i) {
        colors[i] = rgb555_grayscale(colors[i], amount_16);
    }
}

void palette_invert(uint16_t* colors, size_t count) {
    if (colors == nullptr) {
        return;
    }
    for (size_t i = 0; i < count; ++i) {
        colors[i] = rgb555_invert(colors[i]);
    }
}

void palette_hue_shift(uint16_t* colors, size_t count, uint16_t amount_16) {
    if (colors == nullptr) {
        return;
    }
    for (size_t i = 0; i < count; ++i) {
        colors[i] = rgb555_hue_shift(colors[i], amount_16);
    }
}

void palette_brightness(uint16_t* colors, size_t count, uint16_t amount_16) {
    if (colors == nullptr) {
        return;
    }
    for (size_t i = 0; i < count; ++i) {
        colors[i] = rgb555_brightness(colors[i], amount_16);
    }
}

void palette_rotate(uint16_t* colors, size_t count, int steps) {
    if (colors == nullptr || count == 0) {
        return;
    }
    if (steps < 0) {
        steps = static_cast<int>(count) - ((-steps) % static_cast<int>(count));
    }
    steps %= static_cast<int>(count);
    if (steps == 0) {
        return;
    }
    // Rotate right by `steps`.
    uint16_t tmp[256];
    const size_t step = static_cast<size_t>(steps);
    for (size_t i = 0; i < count; ++i) {
        tmp[i] = colors[i];
    }
    for (size_t i = 0; i < count; ++i) {
        colors[(i + step) % count] = tmp[i];
    }
}

} // namespace gbs