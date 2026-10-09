#include "gbs/hblank_effect.hpp"
#include "gbs/interrupt.hpp"
#include "gbs_hw.h"

namespace gbs {

// ============================================================
// Hardware access
// ============================================================

#if defined(__arm__) || defined(__thumb__)

#define REG16(address) (*(volatile uint16_t*)(address))
#define REG32(address) (*(volatile uint32_t*)(address))

#define HBE_REG_BG0HOFS REG16(0x04000010)
#define HBE_REG_BG0VOFS REG16(0x04000012)
#define HBE_REG_BG2PA REG16(0x04000020)
#define HBE_REG_BG2PB REG16(0x04000022)
#define HBE_REG_BG2PC REG16(0x04000024)
#define HBE_REG_BG2PD REG16(0x04000026)
#define HBE_REG_BG2X REG32(0x04000028)
#define HBE_REG_BG2Y REG32(0x0400002C)
#define HBE_REG_BG3PA REG16(0x04000030)
#define HBE_REG_BG3PB REG16(0x04000032)
#define HBE_REG_BG3PC REG16(0x04000034)
#define HBE_REG_BG3PD REG16(0x04000036)
#define HBE_REG_BG3X REG32(0x04000038)
#define HBE_REG_BG3Y REG32(0x0400003C)
#define HBE_REG_WIN0H REG16(0x04000040)
#define HBE_REG_WIN1H REG16(0x04000042)
#define HBE_REG_WIN0V REG16(0x04000044)
#define HBE_REG_WIN1V REG16(0x04000046)
#define HBE_REG_BLDALPHA REG16(0x04000052)
#define HBE_REG_BLDY REG16(0x04000054)
#define HBE_REG_MOSAIC REG16(0x0400004C)
#define HBE_REG_BG_COLOR REG16(0x05000000)

#define HBE_MEM_OAM ((volatile uint16_t*)0x07000000)
#define HBE_MEM_PALETTE ((volatile uint16_t*)0x05000000)

namespace {
void hbe_write_register(uint32_t address, uint16_t value) {
    *(volatile uint16_t*)(address) = value;
}
void hbe_write_register32(uint32_t address, uint32_t value) {
    *(volatile uint32_t*)(address) = value;
}
uint16_t hbe_read_register(uint32_t address) {
    return *(volatile uint16_t*)(address);
}
}

#else

// Host test environment: keep a shadow copy of written registers so tests can
// verify that effects target the correct hardware state.
namespace {
volatile uint16_t g_host_registers[0x100] = {};
volatile uint32_t g_host_registers32[0x100] = {};
volatile uint16_t g_host_oam[128 * 4] = {};
volatile uint16_t g_host_palette[512] = {};

void hbe_write_register(uint32_t address, uint16_t value) {
    if (address >= 0x05000000u && address < 0x05000400u) {
        const uint32_t pal_index = (address - 0x05000000u) / 2u;
        if (pal_index < 512u) {
            g_host_palette[pal_index] = value;
        }
        return;
    }
    if (address >= 0x07000000u && address < 0x07000400u) {
        const uint32_t oam_index = (address - 0x07000000u) / 2u;
        if (oam_index < 128 * 4u) {
            g_host_oam[oam_index] = value;
        }
        return;
    }
    const uint32_t offset = (address - 0x04000000u) / 2u;
    if (offset < 0x100u) {
        g_host_registers[offset] = value;
    }
}

void hbe_write_register32(uint32_t address, uint32_t value) {
    const uint32_t offset = (address - 0x04000000u) / 4u;
    if (offset < 0x100u) {
        g_host_registers32[offset] = value;
    }
}

uint16_t hbe_read_register(uint32_t address) {
    if (address >= 0x05000000u && address < 0x05000400u) {
        const uint32_t pal_index = (address - 0x05000000u) / 2u;
        if (pal_index < 512u) {
            return g_host_palette[pal_index];
        }
        return 0;
    }
    if (address >= 0x07000000u && address < 0x07000400u) {
        const uint32_t oam_index = (address - 0x07000000u) / 2u;
        if (oam_index < 128 * 4u) {
            return g_host_oam[oam_index];
        }
        return 0;
    }
    const uint32_t offset = (address - 0x04000000u) / 2u;
    if (offset < 0x100u) {
        return g_host_registers[offset];
    }
    return 0;
}
}

#endif

// ============================================================
// Internal state
// ============================================================

namespace {

HbeEffect s_effects[hbe_max_entries] = {};
uint8_t s_handles[hbe_max_entries] = {};
uint8_t s_effect_count = 0;
uint8_t s_next_handle = 1;
bool s_precomputed_valid[hbe_max_entries] = {};
int32_t s_precomputed_values[hbe_max_entries][hbe_screen_height + 1] = {};
InternalInterruptHandle s_hblank_callback_handle = invalid_internal_interrupt_handle;

// Array-backed effect data (owned here so callers only pass const arrays).
int32_t s_owned_arrays[hbe_max_entries][hbe_screen_height + 1] = {};
bool s_owns_array[hbe_max_entries] = {};

int hbe_index_for_handle(uint8_t handle) {
    if (handle == 0) return -1;
    for (uint8_t index = 0; index < s_effect_count; ++index) {
        if (s_handles[index] == handle) return index;
    }
    return -1;
}

void hbe_hblank_callback() {
    const int current_scanline = gbs_hw_get_vcount();
    if (current_scanline >= 0 && current_scanline < hbe_screen_height) {
        hbe_execute_scanline(static_cast<uint16_t>((current_scanline + 1) % hbe_screen_height));
    }
}

int32_t hbe_interpolate(int32_t a, int32_t b, uint16_t t, uint16_t max_t, HbeInterpolation mode) {
    if (max_t == 0 || t >= max_t) {
        return b;
    }
    if (t == 0 || mode == HbeInterpolation::None) {
        return a;
    }
    switch (mode) {
    case HbeInterpolation::Linear:
        return a + ((static_cast<int64_t>(b - a) * t) / max_t);
    case HbeInterpolation::Quadratic: {
        // ease-in-out quadratic
        const uint16_t half = max_t / 2;
        if (t <= half) {
            const int64_t u = static_cast<int64_t>(t) * 2;
            const int64_t f = (u * u) / (static_cast<int64_t>(max_t) * 2);
            return a + static_cast<int32_t>((static_cast<int64_t>(b - a) * f) / max_t);
        }
        const int64_t u = static_cast<int64_t>(max_t - t) * 2;
        const int64_t f = (u * u) / (static_cast<int64_t>(max_t) * 2);
        return b - static_cast<int32_t>((static_cast<int64_t>(b - a) * f) / max_t);
    }
    case HbeInterpolation::Cubic: {
        const int64_t t64 = t;
        const int64_t m = max_t;
        const int64_t f = (t64 * t64 * (3 * m - 2 * t64)) / (m * m * m);
        return a + static_cast<int32_t>((static_cast<int64_t>(b - a) * f) / max_t);
    }
    case HbeInterpolation::Sine: {
        // approximate sin over the segment using the engine LUT
        const Angle angle = static_cast<Angle>(
            (static_cast<uint32_t>(t) * angle_quarter_turn * 2u) / max_t
        );
        const int32_t sine = fixed_sin(angle).raw();
        return a + static_cast<int32_t>(
            (static_cast<int64_t>(b - a) * (sine + 65536)) / 131072
        );
    }
    case HbeInterpolation::Custom:
    default:
        return a + ((static_cast<int64_t>(b - a) * t) / max_t);
    }
}

} // namespace

// ============================================================
// Public API
// ============================================================

uint8_t hbe_register(const HbeEffect& effect) {
    if (s_effect_count >= hbe_max_entries) {
        return 0;
    }
    if (s_next_handle == 0) {
        s_next_handle = 1;
    }
    const uint8_t handle = s_next_handle++;
    HbeEffect& slot = s_effects[s_effect_count];
    slot = effect;
    s_handles[s_effect_count] = handle;
    slot.enabled = true;
    s_precomputed_valid[s_effect_count] = false;
    s_owns_array[s_effect_count] = false;
    ++s_effect_count;
    return handle;
}

void hbe_unregister(uint8_t handle) {
    if (handle == 0) {
        return;
    }
    for (size_t i = 0; i < s_effect_count; ++i) {
        if (s_handles[i] == handle) {
            for (size_t j = i; j + 1 < s_effect_count; ++j) {
                s_effects[j] = s_effects[j + 1];
                s_handles[j] = s_handles[j + 1];
                s_precomputed_valid[j] = s_precomputed_valid[j + 1];
                s_owns_array[j] = s_owns_array[j + 1];
                for (uint16_t scanline = 0; scanline <= hbe_screen_height; ++scanline) {
                    s_precomputed_values[j][scanline] = s_precomputed_values[j + 1][scanline];
                    s_owned_arrays[j][scanline] = s_owned_arrays[j + 1][scanline];
                }
            }
            --s_effect_count;
            s_effects[s_effect_count] = HbeEffect {};
            s_handles[s_effect_count] = 0;
            s_precomputed_valid[s_effect_count] = false;
            s_owns_array[s_effect_count] = false;
            return;
        }
    }
}

void hbe_set_enabled(uint8_t handle, bool enabled) {
    const int index = hbe_index_for_handle(handle);
    if (index >= 0) s_effects[index].enabled = enabled;
}

void hbe_clear() {
    for (size_t i = 0; i < hbe_max_entries; ++i) {
        s_effects[i] = HbeEffect {};
        s_handles[i] = 0;
        s_precomputed_valid[i] = false;
        s_owns_array[i] = false;
    }
    s_effect_count = 0;
    s_next_handle = 1;
}

size_t hbe_active_count() {
    return s_effect_count;
}

void hbe_update_frame() {
    // No per-frame lifecycle state beyond keyframes; hook reserved for later
    // frame-duration bookkeeping if a persistent model is added.
}

void hbe_precompute_frame() {
    for (size_t i = 0; i < s_effect_count; ++i) {
        const HbeEffect& effect = s_effects[i];
        if (!effect.enabled || effect.keyframes == nullptr || effect.keyframe_count == 0) {
            s_precomputed_valid[i] = false;
            continue;
        }

        const HbeKeyframe* kf = effect.keyframes;
        const size_t count = effect.keyframe_count;
        if (count == 1) {
            for (uint16_t sl = 0; sl <= hbe_screen_height; ++sl) {
                s_precomputed_values[i][sl] = kf[0].value.i32;
            }
            s_precomputed_valid[i] = true;
            continue;
        }

        size_t current = 0;
        for (uint16_t sl = 0; sl <= hbe_screen_height; ++sl) {
            while (current + 1 < count && kf[current + 1].scanline <= sl) {
                ++current;
            }
            if (current + 1 >= count) {
                s_precomputed_values[i][sl] = kf[count - 1].value.i32;
                continue;
            }
            const HbeKeyframe& start = kf[current];
            const HbeKeyframe& end = kf[current + 1];
            const uint16_t seg_len = end.scanline - start.scanline;
            const uint16_t t = (sl >= start.scanline) ? (sl - start.scanline) : 0;
            s_precomputed_values[i][sl] = hbe_interpolate(
                start.value.i32, end.value.i32, t, seg_len, start.interpolation
            );
        }
        s_precomputed_valid[i] = true;
    }
}

void hbe_execute_scanline(uint16_t scanline) {
    if (scanline > hbe_screen_height) {
        return;
    }
    for (uint8_t priority = static_cast<uint8_t>(HbePriority::Low);
         priority <= static_cast<uint8_t>(HbePriority::Critical); ++priority) {
    for (size_t i = 0; i < s_effect_count; ++i) {
        const HbeEffect& effect = s_effects[i];
        if (!effect.enabled || static_cast<uint8_t>(effect.priority) != priority) {
            continue;
        }

        int32_t value = 0;
        bool has_value = false;
        if (s_precomputed_valid[i]) {
            value = s_precomputed_values[i][scanline];
            has_value = true;
        } else if (s_owns_array[i]) {
            value = s_owned_arrays[i][scanline];
            has_value = true;
        } else if (effect.callback != nullptr) {
            HbeValue out;
            if (effect.callback(scanline, &out, effect.user_data)) {
                value = out.i32;
                has_value = true;
            }
        }
        if (!has_value) {
            continue;
        }

        const HbeTarget& target = effect.target;
        switch (target.type) {
        case HbeType::ObjPositionX:
            if (target.index < 128) {
                const uint32_t addr = 0x07000002u + target.index * 8u;
                const uint16_t attr1 = hbe_read_register(addr);
                hbe_write_register(
                    addr,
                    static_cast<uint16_t>((attr1 & ~0x01FFu) | (static_cast<uint16_t>(value) & 0x01FFu))
                );
            }
            break;
        case HbeType::ObjPositionY:
            if (target.index < 128) {
                const uint32_t addr = 0x07000000u + target.index * 8u;
                const uint16_t attr0 = hbe_read_register(addr);
                hbe_write_register(
                    addr,
                    static_cast<uint16_t>((attr0 & ~0x00FFu) | (static_cast<uint16_t>(value) & 0x00FFu))
                );
            }
            break;
        case HbeType::ObjAffinePa:
            if (target.index < 32) {
                hbe_write_register(0x07000006u + target.index * 32u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::ObjAffinePb:
            if (target.index < 32) {
                hbe_write_register(0x0700000Eu + target.index * 32u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::ObjAffinePc:
            if (target.index < 32) {
                hbe_write_register(0x07000016u + target.index * 32u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::ObjAffinePd:
            if (target.index < 32) {
                hbe_write_register(0x0700001Eu + target.index * 32u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::BgPositionX:
            if (target.index <= 3) {
                hbe_write_register(0x04000010u + target.index * 4u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::BgPositionY:
            if (target.index <= 3) {
                hbe_write_register(0x04000012u + target.index * 4u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::BgAffinePa:
            if (target.index == 2) {
                hbe_write_register(0x04000020u, static_cast<uint16_t>(value));
            } else if (target.index == 3) {
                hbe_write_register(0x04000030u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::BgAffinePb:
            if (target.index == 2) {
                hbe_write_register(0x04000022u, static_cast<uint16_t>(value));
            } else if (target.index == 3) {
                hbe_write_register(0x04000032u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::BgAffinePc:
            if (target.index == 2) {
                hbe_write_register(0x04000024u, static_cast<uint16_t>(value));
            } else if (target.index == 3) {
                hbe_write_register(0x04000034u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::BgAffinePd:
            if (target.index == 2) {
                hbe_write_register(0x04000026u, static_cast<uint16_t>(value));
            } else if (target.index == 3) {
                hbe_write_register(0x04000034u + 2u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::BgAffineRefX:
            if (target.index == 2) {
                hbe_write_register32(0x04000028u, static_cast<uint32_t>(value));
            } else if (target.index == 3) {
                hbe_write_register32(0x04000038u, static_cast<uint32_t>(value));
            }
            break;
        case HbeType::BgAffineRefY:
            if (target.index == 2) {
                hbe_write_register32(0x0400002Cu, static_cast<uint32_t>(value));
            } else if (target.index == 3) {
                hbe_write_register32(0x0400003Cu, static_cast<uint32_t>(value));
            }
            break;
        case HbeType::BgPaletteColor:
            {
                hbe_write_register(0x05000000u + target.index * 2u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::ObjPaletteColor:
            {
                hbe_write_register(0x05000000u + 0x200u + target.index * 2u, static_cast<uint16_t>(value));
            }
            break;
        case HbeType::BackdropColor:
            hbe_write_register(0x05000000u, static_cast<uint16_t>(value));
            break;
        case HbeType::Window0Left:
            hbe_write_register(0x04000040u, static_cast<uint16_t>((hbe_read_register(0x04000040u) & 0xFF00u) | (value & 0xFF)));
            break;
        case HbeType::Window0Right:
            hbe_write_register(0x04000040u, static_cast<uint16_t>((hbe_read_register(0x04000040u) & 0x00FFu) | ((value & 0xFF) << 8)));
            break;
        case HbeType::Window0Top:
            hbe_write_register(0x04000044u, static_cast<uint16_t>((hbe_read_register(0x04000044u) & 0xFF00u) | (value & 0xFF)));
            break;
        case HbeType::Window0Bottom:
            hbe_write_register(0x04000044u, static_cast<uint16_t>((hbe_read_register(0x04000044u) & 0x00FFu) | ((value & 0xFF) << 8)));
            break;
        case HbeType::Window1Left:
            hbe_write_register(0x04000042u, static_cast<uint16_t>((hbe_read_register(0x04000042u) & 0xFF00u) | (value & 0xFF)));
            break;
        case HbeType::Window1Right:
            hbe_write_register(0x04000042u, static_cast<uint16_t>((hbe_read_register(0x04000042u) & 0x00FFu) | ((value & 0xFF) << 8)));
            break;
        case HbeType::Window1Top:
            hbe_write_register(0x04000046u, static_cast<uint16_t>((hbe_read_register(0x04000046u) & 0xFF00u) | (value & 0xFF)));
            break;
        case HbeType::Window1Bottom:
            hbe_write_register(0x04000046u, static_cast<uint16_t>((hbe_read_register(0x04000046u) & 0x00FFu) | ((value & 0xFF) << 8)));
            break;
        case HbeType::BlendEva:
            hbe_write_register(0x04000052u, static_cast<uint16_t>((hbe_read_register(0x04000052u) & ~0x001Fu) | (value & 0x1F)));
            break;
        case HbeType::BlendEvb:
            hbe_write_register(0x04000052u, static_cast<uint16_t>((hbe_read_register(0x04000052u) & ~0x1F00u) | ((value & 0x1F) << 8)));
            break;
        case HbeType::BlendIntensity:
            hbe_write_register(0x04000054u, static_cast<uint16_t>(value));
            break;
        case HbeType::MosaicBgH:
        case HbeType::MosaicBgV:
        case HbeType::MosaicObjH:
        case HbeType::MosaicObjV: {
            const uint8_t shift = target.type == HbeType::MosaicBgH ? 0 :
                target.type == HbeType::MosaicBgV ? 4 :
                target.type == HbeType::MosaicObjH ? 8 : 12;
            const uint16_t mask = static_cast<uint16_t>(0xFu << shift);
            hbe_write_register(0x0400004Cu, static_cast<uint16_t>(
                (hbe_read_register(0x0400004Cu) & ~mask) | ((value & 0xF) << shift)));
            break;
        }
        case HbeType::Custom:
        default:
            break;
        }
    }
    }
}

// ============================================================
// Convenience creators
// ============================================================

uint8_t hbe_create_constant(const HbeTarget& target, HbeValue value, HbePriority priority) {
    HbeEffect effect;
    effect.target = target;
    effect.priority = priority;
    effect.enabled = true;

    const uint8_t handle = hbe_register(effect);
    const int index = hbe_index_for_handle(handle);
    if (index < 0) return 0;
    for (uint16_t scanline = 0; scanline <= hbe_screen_height; ++scanline) {
        s_owned_arrays[index][scanline] = value.i32;
    }
    s_owns_array[index] = true;
    return handle;
}

uint8_t hbe_create_from_array(const HbeTarget& target, const int32_t* values, HbePriority priority) {
    if (values == nullptr) {
        return 0;
    }
    HbeEffect effect;
    effect.target = target;
    effect.priority = priority;
    effect.enabled = true;
    const uint8_t handle = hbe_register(effect);
    const int index = hbe_index_for_handle(handle);
    if (index < 0) return 0;
    for (uint16_t scanline = 0; scanline <= hbe_screen_height; ++scanline) {
        s_owned_arrays[index][scanline] = values[scanline];
    }
    s_owns_array[index] = true;
    return handle;
}

uint8_t hbe_create_from_keyframes(
    const HbeTarget& target,
    const HbeKeyframe* keyframes,
    size_t keyframe_count,
    HbePriority priority
) {
    if (keyframes == nullptr || keyframe_count == 0) {
        return 0;
    }
    HbeEffect effect;
    effect.target = target;
    effect.priority = priority;
    effect.enabled = true;
    effect.keyframes = keyframes;
    effect.keyframe_count = keyframe_count;
    return hbe_register(effect);
}

uint8_t hbe_create_from_callback(
    const HbeTarget& target,
    bool (*callback)(uint16_t scanline, HbeValue* out_value, void* user_data),
    void* user_data,
    HbePriority priority
) {
    if (callback == nullptr) {
        return 0;
    }
    HbeEffect effect;
    effect.target = target;
    effect.priority = priority;
    effect.enabled = true;
    effect.callback = callback;
    effect.user_data = user_data;
    return hbe_register(effect);
}

// ============================================================
// Lifecycle
// ============================================================

void hbe_init() {
    if (s_hblank_callback_handle != invalid_internal_interrupt_handle) {
        disable_internal_interrupt(InterruptSource::HBlank);
        remove_internal_interrupt_callback(InterruptSource::HBlank, s_hblank_callback_handle);
        s_hblank_callback_handle = invalid_internal_interrupt_handle;
    }
    hbe_clear();
    s_hblank_callback_handle = add_internal_interrupt_callback(InterruptSource::HBlank, hbe_hblank_callback);
    if (s_hblank_callback_handle != invalid_internal_interrupt_handle) {
        enable_internal_interrupt(InterruptSource::HBlank);
    }
}

void hbe_cleanup() {
    hbe_clear();
    if (s_hblank_callback_handle != invalid_internal_interrupt_handle) {
        disable_internal_interrupt(InterruptSource::HBlank);
        remove_internal_interrupt_callback(InterruptSource::HBlank, s_hblank_callback_handle);
        s_hblank_callback_handle = invalid_internal_interrupt_handle;
    }
}

#if !defined(__arm__) && !defined(__thumb__)
uint16_t hbe_host_register_read(uint32_t address) {
    if (address >= 0x05000000u && address < 0x05000400u) {
        const uint32_t pal_index = (address - 0x05000000u) / 2u;
        if (pal_index < 512u) {
            return g_host_palette[pal_index];
        }
        return 0;
    }
    if (address >= 0x07000000u && address < 0x07000400u) {
        const uint32_t oam_index = (address - 0x07000000u) / 2u;
        if (oam_index < 128 * 4u) {
            return g_host_oam[oam_index];
        }
        return 0;
    }
    const uint32_t offset = (address - 0x04000000u) / 2u;
    if (offset < 0x100u) {
        return g_host_registers[offset];
    }
    return 0;
}

uint32_t hbe_host_register_read32(uint32_t address) {
    const uint32_t offset = (address - 0x04000000u) / 4u;
    if (offset < 0x100u) {
        return g_host_registers32[offset];
    }
    return 0;
}
#endif

} // namespace gbs
