#pragma once

#include <stdint.h>
#include "gbs/hblank_effect.hpp"
#include "gbs/math.hpp"

namespace gbs {

// ============================================================
// HBE Presets — ready-made per-scanline effects
// ============================================================

// --- Water Ripple ---
// Sine-wave displacement on BG position X per scanline.
// amplitude: max pixel displacement (typical 4-12)
// wavelength: scanlines per full wave (typical 8-32)
// phase_offset: starting phase in GBA angle turns (0 = top)
struct WaterRippleConfig {
    BackgroundLayer layer = BackgroundLayer::BG2;
    int16_t amplitude = 6;
    uint16_t wavelength = 16;
    Angle phase_offset = 0;
    int16_t base_scroll_x = 0;
};

// Register a water ripple HBE effect. Returns handle (0 on failure).
uint8_t hbe_create_water_ripple(const WaterRippleConfig& config);

// --- Wave Distortion ---
// Vertical sine displacement on OBJ position Y per scanline.
// Useful for wavy sprite effects (flags, characters in heat).
struct WaveDistortionConfig {
    uint8_t sprite_index = 0;
    int16_t amplitude = 4;
    uint16_t wavelength = 20;
    Angle phase_offset = 0;
    int16_t base_y = 0;
};

uint8_t hbe_create_wave_distortion(const WaveDistortionConfig& config);

// --- Mode 7 ---
// Per-scanline affine rotation+scale for a BG layer, producing the
// classic SNES Mode 7 floor/ceiling effect.
// horizon_line: scanline where the effect begins (0 = full screen)
// base_scale: initial scale at horizon_line (256 = 1.0x)
// scale_step: scale increment per scanline below horizon (Q8.8)
// rotation: rotation angle applied uniformly
struct Mode7Config {
    BackgroundLayer layer = BackgroundLayer::BG2;
    uint16_t horizon_line = 80;
    int16_t base_scale = 128;     // 0.5x at horizon
    int16_t scale_step = 3;       // +3/256 per scanline
    Angle rotation = 0;
    int32_t ref_x = 120;          // center X in texture coords (Q8.8)
    int32_t ref_y = 80;           // center Y in texture coords (Q8.8)
};

uint8_t hbe_create_mode7(const Mode7Config& config);

// --- Parallax ---
// Multiplies BG scroll by a per-layer factor relative to camera.
// This is a convenience wrapper; the actual parallax is computed in
// the render update, not per-scanline. Returns the parallax factor
// that should be applied to the layer's scroll in the game loop.
struct ParallaxConfig {
    BackgroundLayer layer = BackgroundLayer::BG1;
    Fixed scroll_factor_x = Fixed::from_raw(128); // 0.5x
    Fixed scroll_factor_y = Fixed::from_raw(128); // 0.5x
};

// Compute parallax-adjusted scroll values. Call from game loop.
constexpr void parallax_apply(
    const ParallaxConfig& config,
    int32_t camera_x,
    int32_t camera_y,
    int32_t& out_scroll_x,
    int32_t& out_scroll_y
) {
    out_scroll_x = static_cast<int32_t>(
        (static_cast<int64_t>(camera_x) * config.scroll_factor_x.raw()) >> 8
    );
    out_scroll_y = static_cast<int32_t>(
        (static_cast<int64_t>(camera_y) * config.scroll_factor_y.raw()) >> 8
    );
}

// --- CRT Scanline ---
// Alternates brightness per scanline to simulate CRT scanlines.
struct CrtScanlineConfig {
    uint8_t dark_alpha = 24;   // Eva for dark lines (0-31)
    uint8_t bright_alpha = 31; // Eva for bright lines (0-31)
};

uint8_t hbe_create_crt_scanline(const CrtScanlineConfig& config);

} // namespace gbs