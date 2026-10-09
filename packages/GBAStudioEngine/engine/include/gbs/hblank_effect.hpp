#pragma once

#include <stddef.h>
#include <stdint.h>

#include "gbs/render.hpp"

namespace gbs {

// ============================================================
// H-Blank Effect Infrastructure
// ============================================================

// GBA screen has 160 visible scanlines (0-159); scanline 160 is VBlank.
constexpr uint16_t hbe_screen_height = 160;
constexpr size_t hbe_max_entries = 32;

// HBE priority (higher = applied later during HBlank, wins over lower).
enum class HbePriority : uint8_t {
    Low = 0,
    Normal = 1,
    High = 2,
    Critical = 3
};

// HBE effect types - which hardware register is modified.
enum class HbeType : uint8_t {
    ObjPositionX = 0,
    ObjPositionY = 1,
    ObjAffinePa = 2,
    ObjAffinePb = 3,
    ObjAffinePc = 4,
    ObjAffinePd = 5,
    ObjPaletteColor = 6,

    BgPositionX = 10,
    BgPositionY = 11,
    BgAffinePa = 12,
    BgAffinePb = 13,
    BgAffinePc = 14,
    BgAffinePd = 15,
    BgAffineRefX = 16,
    BgAffineRefY = 17,

    BgPaletteColor = 20,
    BackdropColor = 21,

    Window0Left = 30,
    Window0Right = 31,
    Window0Top = 32,
    Window0Bottom = 33,
    Window1Left = 34,
    Window1Right = 35,
    Window1Top = 36,
    Window1Bottom = 37,

    BlendEva = 40,
    BlendEvb = 41,
    BlendIntensity = 42,

    MosaicBgH = 50,
    MosaicBgV = 51,
    MosaicObjH = 52,
    MosaicObjV = 53,

    Custom = 100
};

// Identifies the hardware target of an HBE effect.
struct HbeTarget {
    HbeType type;
    uint8_t index;      // sprite index, BG layer, palette index, etc.
    uint8_t sub_index;  // affine mat index, color component, etc.
};

// Interpolation between keyframes.
enum class HbeInterpolation : uint8_t {
    None = 0,
    Linear = 1,
    Quadratic = 2,
    Cubic = 3,
    Sine = 4,
    Custom = 255
};

// Value used for an HBE at a given scanline.
union HbeValue {
    int32_t i32;
    uint32_t u32;
    int16_t i16;
    uint16_t u16;
    int8_t i8;
    uint8_t u8;

    constexpr HbeValue() : i32(0) {}
    constexpr HbeValue(int32_t v) : i32(v) {}
    constexpr HbeValue(uint32_t v) : i32(static_cast<int32_t>(v)) {}
    constexpr HbeValue(int16_t v) : i32(v) {}
    constexpr HbeValue(uint16_t v) : i32(v) {}
    constexpr HbeValue(int8_t v) : i32(v) {}
    constexpr HbeValue(uint8_t v) : i32(v) {}
};

// Keyframe for timeline-based HBE effects.
struct HbeKeyframe {
    uint16_t scanline;           // 0..160
    HbeValue value;              // value at this scanline
    HbeInterpolation interpolation; // how to reach the next keyframe
};

// Descriptor for a registered HBE effect.
struct HbeEffect {
    HbeTarget target;
    HbePriority priority = HbePriority::Normal;
    bool enabled = true;

    // Keyframe timeline (alternative to callback).
    const HbeKeyframe* keyframes = nullptr;
    size_t keyframe_count = 0;

    // Callback-driven value (alternative to keyframes).
    // Returns false to auto-disable the effect.
    bool (*callback)(uint16_t scanline, HbeValue* out_value, void* user_data) = nullptr;
    void* user_data = nullptr;
};

// Register a new HBE effect. Returns a handle (1..hbe_max_entries) or 0.
uint8_t hbe_register(const HbeEffect& effect);
// Unregister an effect by handle.
void hbe_unregister(uint8_t handle);
// Enable/disable an effect by handle.
void hbe_set_enabled(uint8_t handle, bool enabled);
// Clear all effects.
void hbe_clear();
// Call once per frame before rendering.
void hbe_update_frame();
// Pre-compute per-scanline values for all keyframe effects. Call once per frame.
void hbe_precompute_frame();
// Execute all enabled effects for a given scanline. Called from HBlank ISR.
void hbe_execute_scanline(uint16_t scanline);
// Number of registered effects.
size_t hbe_active_count();

// Convenience creator: single constant value for every scanline.
uint8_t hbe_create_constant(const HbeTarget& target, HbeValue value, HbePriority priority = HbePriority::Normal);
// Convenience creator: per-scanline array of raw values (size 161).
uint8_t hbe_create_from_array(const HbeTarget& target, const int32_t* values, HbePriority priority = HbePriority::Normal);
// Convenience creator: keyframe timeline with interpolation.
uint8_t hbe_create_from_keyframes(
    const HbeTarget& target,
    const HbeKeyframe* keyframes,
    size_t keyframe_count,
    HbePriority priority = HbePriority::Normal
);
// Convenience creator: callback-driven.
uint8_t hbe_create_from_callback(
    const HbeTarget& target,
    bool (*callback)(uint16_t scanline, HbeValue* out_value, void* user_data),
    void* user_data,
    HbePriority priority = HbePriority::Normal
);

// Builders for common targets.
constexpr HbeTarget hbe_target_obj_position_x(uint8_t sprite_index) {
    return HbeTarget { HbeType::ObjPositionX, sprite_index, 0 };
}
constexpr HbeTarget hbe_target_obj_position_y(uint8_t sprite_index) {
    return HbeTarget { HbeType::ObjPositionY, sprite_index, 0 };
}
constexpr HbeTarget hbe_target_obj_affine(uint8_t affine_mat_index, HbeType type) {
    return HbeTarget { type, affine_mat_index, 0 };
}
constexpr HbeTarget hbe_target_bg_position_x(BackgroundLayer layer) {
    return HbeTarget { HbeType::BgPositionX, static_cast<uint8_t>(layer), 0 };
}
constexpr HbeTarget hbe_target_bg_position_y(BackgroundLayer layer) {
    return HbeTarget { HbeType::BgPositionY, static_cast<uint8_t>(layer), 0 };
}
constexpr HbeTarget hbe_target_bg_affine(BackgroundLayer layer, HbeType type) {
    return HbeTarget { type, static_cast<uint8_t>(layer), 0 };
}
constexpr HbeTarget hbe_target_backdrop_color() {
    return HbeTarget { HbeType::BackdropColor, 0, 0 };
}
constexpr HbeTarget hbe_target_window(bool window1, HbeType type) {
    return HbeTarget { type, static_cast<uint8_t>(window1 ? 1 : 0), 0 };
}

// Initialize the HBE system (registers HBlank interrupt, clears effects).
void hbe_init();
// Shut down the HBE system.
void hbe_cleanup();

#if !defined(__arm__) && !defined(__thumb__)
// Host-only: read back the shadow register state written by effects. Used by
// host tests to verify effect targeting without real hardware.
uint16_t hbe_host_register_read(uint32_t address);
uint32_t hbe_host_register_read32(uint32_t address);
#endif

} // namespace gbs