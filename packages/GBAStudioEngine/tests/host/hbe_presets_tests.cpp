#include <cassert>
#include "gbs/hbe_presets.hpp"
#include "gbs/hblank_effect.hpp"

// Stubs for hardware functions referenced by hblank_effect.cpp.
extern "C" {
    void gbs_hw_enable_interrupt_source(int) {}
    void gbs_hw_disable_interrupt_source(int) {}
}

using namespace gbs;

void test_water_ripple_register() {
    hbe_clear();
    WaterRippleConfig config;
    config.layer = BackgroundLayer::BG2;
    config.amplitude = 8;
    config.wavelength = 16;
    config.base_scroll_x = 100;
    const uint8_t h = hbe_create_water_ripple(config);
    assert(h != 0);
    assert(hbe_active_count() >= 1);
}

void test_wave_distortion_register() {
    hbe_clear();
    WaveDistortionConfig config;
    config.sprite_index = 5;
    config.amplitude = 4;
    config.wavelength = 20;
    config.base_y = 80;
    const uint8_t h = hbe_create_wave_distortion(config);
    assert(h != 0);
    assert(hbe_active_count() >= 1);
}

void test_mode7_registers_multiple() {
    hbe_clear();
    Mode7Config config;
    config.layer = BackgroundLayer::BG2;
    config.horizon_line = 80;
    config.base_scale = 128;
    config.scale_step = 3;
    config.rotation = 0;
    const uint8_t h = hbe_create_mode7(config);
    assert(h != 0);
    // Mode 7 registers 6 effects (PA, PB, PC, PD, RefX, RefY).
    assert(hbe_active_count() >= 6);
}

void test_crt_scanline_register() {
    hbe_clear();
    CrtScanlineConfig config;
    config.dark_alpha = 20;
    config.bright_alpha = 31;
    const uint8_t h = hbe_create_crt_scanline(config);
    assert(h != 0);
    assert(hbe_active_count() >= 1);
}

void test_parallax_apply() {
    ParallaxConfig config;
    config.layer = BackgroundLayer::BG1;
    config.scroll_factor_x = Fixed::from_raw(128); // 0.5x
    config.scroll_factor_y = Fixed::from_raw(192); // 0.75x

    int32_t out_x = 0, out_y = 0;
    parallax_apply(config, 200, 100, out_x, out_y);
    assert(out_x == 100); // 200 * 0.5
    assert(out_y == 75);  // 100 * 0.75
}

void test_parallax_full_speed() {
    ParallaxConfig config;
    config.scroll_factor_x = Fixed::from_raw(256); // 1.0x
    config.scroll_factor_y = Fixed::from_raw(256);

    int32_t out_x = 0, out_y = 0;
    parallax_apply(config, 300, 150, out_x, out_y);
    assert(out_x == 300);
    assert(out_y == 150);
}

void test_parallax_zero() {
    ParallaxConfig config;
    config.scroll_factor_x = Fixed::from_raw(0);
    config.scroll_factor_y = Fixed::from_raw(0);

    int32_t out_x = 0, out_y = 0;
    parallax_apply(config, 300, 150, out_x, out_y);
    assert(out_x == 0);
    assert(out_y == 0);
}

int main() {
    test_water_ripple_register();
    test_wave_distortion_register();
    test_mode7_registers_multiple();
    test_crt_scanline_register();
    test_parallax_apply();
    test_parallax_full_speed();
    test_parallax_zero();
    return 0;
}