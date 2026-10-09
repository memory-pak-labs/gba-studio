#pragma once

#include <stdint.h>

namespace gbs {

enum class HardwareModel : uint8_t {
    Unknown = 0,
    GbaAgb = 1
};

enum class CartridgeSaveDevice : uint8_t {
    Unknown = 0,
    Sram32K = 1,
    Flash = 2,
    Eeprom = 3
};

struct HardwareInfo {
    HardwareModel model;
    uint32_t cpu_frequency_hz;
    uint16_t screen_width;
    uint16_t screen_height;
    bool cartridge_save_probe_available;
};

struct CartridgeSaveCapabilities {
    uint32_t capacity_bytes;
    uint16_t write_granularity_bytes;
    uint16_t erase_granularity_bytes;
    bool runtime_backend_available;
    bool runtime_probe_safe;
};

// The Flash1M backend uses only bank zero's first 32 KiB and validates the ID
// before save operations. EEPROM remains unavailable without a selected backend.

constexpr HardwareInfo target_hardware_info() {
    return HardwareInfo { HardwareModel::GbaAgb, 16777216u, 240, 160, false };
}

constexpr CartridgeSaveCapabilities cartridge_save_capabilities(CartridgeSaveDevice device) {
    switch (device) {
        case CartridgeSaveDevice::Sram32K:
            return CartridgeSaveCapabilities { 32u * 1024u, 1, 0, true, false };
        case CartridgeSaveDevice::Flash:
            return CartridgeSaveCapabilities { 32u * 1024u, 1, 4096, true, false };
        case CartridgeSaveDevice::Eeprom:
            return CartridgeSaveCapabilities { 0, 8, 0, false, false };
        case CartridgeSaveDevice::Unknown:
        default:
            return CartridgeSaveCapabilities { 0, 0, 0, false, false };
    }
}

HardwareInfo hardware_info();
CartridgeSaveDevice configured_cartridge_save_device();
CartridgeSaveCapabilities configured_cartridge_save_capabilities();
CartridgeSaveDevice detected_cartridge_save_device();

} // namespace gbs
