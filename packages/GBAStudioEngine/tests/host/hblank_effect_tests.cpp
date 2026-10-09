#include <cassert>
#include "gbs/hblank_effect.hpp"
#include "gbs/interrupt.hpp"

namespace {

int enable_interrupt_calls = 0;
int disable_interrupt_calls = 0;
int last_interrupt_source = -1;
gbs::InterruptCallback installed_hblank_callback = nullptr;
gbs::InternalInterruptHandle installed_hblank_handle = gbs::invalid_internal_interrupt_handle;
bool internal_hblank_enabled = false;

extern "C" void gbs_hw_enable_interrupt_source(int source) {
    ++enable_interrupt_calls;
    last_interrupt_source = source;
}

extern "C" void gbs_hw_disable_interrupt_source(int source) {
    ++disable_interrupt_calls;
    last_interrupt_source = source;
}

extern "C" int gbs_hw_get_vcount() {
    return 7;
}

} // namespace

namespace gbs {
InternalInterruptHandle add_internal_interrupt_callback(InterruptSource source, InterruptCallback callback) {
    assert(source == InterruptSource::HBlank);
    installed_hblank_callback = callback;
    installed_hblank_handle = 1;
    return installed_hblank_handle;
}
void remove_internal_interrupt_callback(InterruptSource source, InternalInterruptHandle handle) {
    assert(source == InterruptSource::HBlank);
    assert(handle == installed_hblank_handle);
    installed_hblank_callback = nullptr;
    installed_hblank_handle = invalid_internal_interrupt_handle;
}
void enable_internal_interrupt(InterruptSource source) {
    assert(source == InterruptSource::HBlank);
    internal_hblank_enabled = true;
    gbs_hw_enable_interrupt_source(6);
}
void disable_internal_interrupt(InterruptSource source) {
    assert(source == InterruptSource::HBlank);
    internal_hblank_enabled = false;
    gbs_hw_disable_interrupt_source(6);
}
}

namespace {

void reset_hw() {
    enable_interrupt_calls = 0;
    disable_interrupt_calls = 0;
    last_interrupt_source = -1;
    installed_hblank_callback = nullptr;
    installed_hblank_handle = gbs::invalid_internal_interrupt_handle;
    internal_hblank_enabled = false;
}

// Callback-based effect that produces a ramp 0..160 per scanline.
bool ramp_callback(uint16_t scanline, gbs::HbeValue* out, void* user_data) {
    *out = gbs::HbeValue(static_cast<int32_t>(scanline) + *static_cast<int32_t*>(user_data));
    return true;
}

int ramp_offset = 0;

} // namespace

void test_register_and_clear() {
    reset_hw();
    assert(gbs::hbe_active_count() == 0);

    gbs::HbeEffect effect;
    effect.target = gbs::hbe_target_bg_position_x(gbs::BackgroundLayer::BG0);
    effect.priority = gbs::HbePriority::Normal;
    effect.enabled = true;

    const uint8_t handle = gbs::hbe_register(effect);
    assert(handle != 0);
    assert(gbs::hbe_active_count() == 1);

    gbs::hbe_unregister(handle);
    assert(gbs::hbe_active_count() == 0);

    // Capacity limit
    for (int i = 0; i < 32; ++i) {
        assert(gbs::hbe_register(effect) != 0);
    }
    assert(gbs::hbe_register(effect) == 0);
    assert(gbs::hbe_active_count() == 32);

    gbs::hbe_clear();
    assert(gbs::hbe_active_count() == 0);
}

void test_constant_effect() {
    reset_hw();
    const uint8_t handle = gbs::hbe_create_constant(
        gbs::hbe_target_bg_position_x(gbs::BackgroundLayer::BG0),
        gbs::HbeValue(static_cast<uint8_t>(120))
    );
    assert(handle != 0);

    gbs::hbe_precompute_frame();
    gbs::hbe_execute_scanline(0);
    assert(gbs::hbe_host_register_read(0x04000010u) == 120);
    gbs::hbe_execute_scanline(80);
    assert(gbs::hbe_host_register_read(0x04000010u) == 120);
    gbs::hbe_execute_scanline(160);
    assert(gbs::hbe_host_register_read(0x04000010u) == 120);

    gbs::hbe_clear();
}

void test_callback_effect() {
    reset_hw();
    ramp_offset = 10;
    const uint8_t handle = gbs::hbe_create_from_callback(
        gbs::hbe_target_bg_position_y(gbs::BackgroundLayer::BG1),
        ramp_callback,
        &ramp_offset
    );
    assert(handle != 0);

    gbs::hbe_execute_scanline(5);
    assert(gbs::hbe_host_register_read(0x04000016u) == 15); // BG1 VOFS

    gbs::hbe_clear();
}

void test_keyframe_interpolation() {
    reset_hw();
    // Keyframes: scanline 0 = 0, scanline 80 = 80, scanline 160 = 0 (triangle wave)
    const gbs::HbeKeyframe keyframes[] = {
        { 0, gbs::HbeValue(static_cast<int16_t>(0)), gbs::HbeInterpolation::Linear },
        { 80, gbs::HbeValue(static_cast<int16_t>(80)), gbs::HbeInterpolation::Linear },
        { 160, gbs::HbeValue(static_cast<int16_t>(0)), gbs::HbeInterpolation::Linear },
    };
    const uint8_t handle = gbs::hbe_create_from_keyframes(
        gbs::hbe_target_bg_position_x(gbs::BackgroundLayer::BG0),
        keyframes,
        3
    );
    assert(handle != 0);

    gbs::hbe_precompute_frame();

    gbs::hbe_execute_scanline(0);
    assert(gbs::hbe_host_register_read(0x04000010u) == 0);

    gbs::hbe_execute_scanline(40);
    assert(gbs::hbe_host_register_read(0x04000010u) == 40);

    gbs::hbe_execute_scanline(80);
    assert(gbs::hbe_host_register_read(0x04000010u) == 80);

    gbs::hbe_execute_scanline(120);
    assert(gbs::hbe_host_register_read(0x04000010u) == 40);

    gbs::hbe_execute_scanline(160);
    assert(gbs::hbe_host_register_read(0x04000010u) == 0);

    gbs::hbe_clear();
}

void test_affine_bg_effect() {
    reset_hw();
    // Affine PA for BG2 through the whole frame
    int32_t pa_values[gbs::hbe_screen_height + 1];
    for (int i = 0; i <= gbs::hbe_screen_height; ++i) {
        pa_values[i] = 256 + i; // ramp from 256
    }
    const uint8_t handle = gbs::hbe_create_from_array(
        gbs::hbe_target_bg_affine(gbs::BackgroundLayer::BG2, gbs::HbeType::BgAffinePa),
        pa_values
    );
    assert(handle != 0);

    gbs::hbe_execute_scanline(0);
    assert(gbs::hbe_host_register_read(0x04000020u) == 256);

    gbs::hbe_execute_scanline(64);
    assert(gbs::hbe_host_register_read(0x04000020u) == 320);

    gbs::hbe_clear();
}

void test_obj_position_effect() {
    reset_hw();
    // OBJ 3 X position via array
    int32_t x_values[gbs::hbe_screen_height + 1];
    for (int i = 0; i <= gbs::hbe_screen_height; ++i) {
        x_values[i] = i % 240;
    }
    const uint8_t handle = gbs::hbe_create_from_array(
        gbs::hbe_target_obj_position_x(3),
        x_values
    );
    assert(handle != 0);

    gbs::hbe_execute_scanline(10);
    // X belongs to ATTR1 and uses 9 bits; ATTR0 must remain untouched.
    assert(gbs::hbe_host_register_read(0x07000000u + 3 * 8u) == 0);
    assert((gbs::hbe_host_register_read(0x07000002u + 3 * 8u) & 0x01FFu) == 10);

    gbs::hbe_clear();
}

void test_obj_y_and_affine_targets_use_oam_layout() {
    reset_hw();
    const uint8_t y_handle = gbs::hbe_create_constant(
        gbs::hbe_target_obj_position_y(2),
        gbs::HbeValue(static_cast<int32_t>(77))
    );
    const uint8_t pa_handle = gbs::hbe_create_constant(
        gbs::hbe_target_obj_affine(3, gbs::HbeType::ObjAffinePa),
        gbs::HbeValue(static_cast<int32_t>(0x1234))
    );
    assert(y_handle != 0 && pa_handle != 0);
    gbs::hbe_precompute_frame();
    gbs::hbe_execute_scanline(0);
    assert((gbs::hbe_host_register_read(0x07000000u + 2 * 8u) & 0x00FFu) == 77);
    assert(gbs::hbe_host_register_read(0x07000006u + 3 * 32u) == 0x1234);
    gbs::hbe_clear();
}

void test_packed_effect_registers_preserve_sibling_fields() {
    reset_hw();
    assert(gbs::hbe_create_constant(
        gbs::hbe_target_window(false, gbs::HbeType::Window0Left),
        gbs::HbeValue(static_cast<int32_t>(12)), gbs::HbePriority::Low) != 0);
    assert(gbs::hbe_create_constant(
        gbs::hbe_target_window(false, gbs::HbeType::Window0Right),
        gbs::HbeValue(static_cast<int32_t>(200)), gbs::HbePriority::High) != 0);
    assert(gbs::hbe_register(gbs::HbeEffect {
        { gbs::HbeType::BlendEva, 0, 0 }, gbs::HbePriority::Low, true,
        nullptr, 0, ramp_callback, &ramp_offset
    }) != 0);
    ramp_offset = 4;
    assert(gbs::hbe_create_constant(
        { gbs::HbeType::BlendEvb, 0, 0 },
        gbs::HbeValue(static_cast<int32_t>(9)), gbs::HbePriority::High) != 0);
    assert(gbs::hbe_create_constant(
        { gbs::HbeType::MosaicBgH, 0, 0 },
        gbs::HbeValue(static_cast<int32_t>(2)), gbs::HbePriority::Low) != 0);
    assert(gbs::hbe_create_constant(
        { gbs::HbeType::MosaicObjV, 0, 0 },
        gbs::HbeValue(static_cast<int32_t>(7)), gbs::HbePriority::High) != 0);

    gbs::hbe_precompute_frame();
    gbs::hbe_execute_scanline(0);
    assert(gbs::hbe_host_register_read(0x04000040u) == 0xC80C);
    assert(gbs::hbe_host_register_read(0x04000052u) == 0x0904);
    assert(gbs::hbe_host_register_read(0x0400004Cu) == 0x7002);
    gbs::hbe_clear();
}

void test_handles_survive_compaction_and_constant_storage_recycles() {
    reset_hw();
    const auto target = gbs::hbe_target_bg_position_x(gbs::BackgroundLayer::BG0);
    const uint8_t first = gbs::hbe_create_constant(target, gbs::HbeValue(static_cast<int32_t>(1)));
    const uint8_t second = gbs::hbe_create_constant(target, gbs::HbeValue(static_cast<int32_t>(2)));
    const uint8_t third = gbs::hbe_create_constant(target, gbs::HbeValue(static_cast<int32_t>(3)));
    assert(first != 0 && second != 0 && third != 0);
    gbs::hbe_unregister(second);
    gbs::hbe_set_enabled(third, false);
    gbs::hbe_precompute_frame();
    gbs::hbe_execute_scanline(0);
    assert(gbs::hbe_host_register_read(0x04000010u) == 1);

    for (int cycle = 0; cycle < 2; ++cycle) {
        gbs::hbe_clear();
        for (size_t index = 0; index < gbs::hbe_max_entries; ++index) {
            assert(gbs::hbe_create_constant(target, gbs::HbeValue(static_cast<int32_t>(index))) != 0);
        }
    }
    gbs::hbe_clear();
}

void test_backdrop_color_effect() {
    reset_hw();
    const uint8_t handle = gbs::hbe_create_constant(
        gbs::hbe_target_backdrop_color(),
        gbs::HbeValue(static_cast<uint16_t>(0x7FFF))
    );
    assert(handle != 0);

    gbs::hbe_precompute_frame();
    gbs::hbe_execute_scanline(50);
    assert(gbs::hbe_host_register_read(0x05000000u) == 0x7FFF);

    gbs::hbe_clear();
}

void test_enable_disable() {
    reset_hw();
    const uint8_t handle = gbs::hbe_create_constant(
        gbs::hbe_target_bg_position_x(gbs::BackgroundLayer::BG2),
        gbs::HbeValue(static_cast<uint8_t>(99))
    );
    assert(handle != 0);

    gbs::hbe_precompute_frame();
    gbs::hbe_set_enabled(handle, false);
    gbs::hbe_execute_scanline(0);
    // Should NOT have written 99 (register keeps 0)
    assert(gbs::hbe_host_register_read(0x04000018u) != 99);

    gbs::hbe_set_enabled(handle, true);
    gbs::hbe_execute_scanline(0);
    assert(gbs::hbe_host_register_read(0x04000018u) == 99);

    gbs::hbe_clear();
}

void test_init_cleanup() {
    reset_hw();
    gbs::hbe_init();
    gbs::hbe_init();
    assert(enable_interrupt_calls == 2);
    assert(disable_interrupt_calls == 1);
    assert(last_interrupt_source == 6); // HBlank
    assert(internal_hblank_enabled);
    assert(installed_hblank_callback != nullptr);
    assert(gbs::hbe_create_constant(
        gbs::hbe_target_bg_position_x(gbs::BackgroundLayer::BG0),
        gbs::HbeValue(static_cast<int32_t>(77))) != 0);
    installed_hblank_callback();
    assert(gbs::hbe_host_register_read(0x04000010u) == 77);
    gbs::hbe_cleanup();
    assert(gbs::hbe_active_count() == 0);
    assert(disable_interrupt_calls == 2);
    assert(last_interrupt_source == 6);
    assert(!internal_hblank_enabled);
    assert(installed_hblank_callback == nullptr);
}

int main() {
    test_register_and_clear();
    test_constant_effect();
    test_callback_effect();
    test_keyframe_interpolation();
    test_affine_bg_effect();
    test_obj_position_effect();
    test_obj_y_and_affine_targets_use_oam_layout();
    test_packed_effect_registers_preserve_sibling_fields();
    test_handles_survive_compaction_and_constant_storage_recycles();
    test_backdrop_color_effect();
    test_enable_disable();
    test_init_cleanup();
    return 0;
}
