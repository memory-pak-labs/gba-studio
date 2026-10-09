#include "gbs/info.hpp"

#if defined(__arm__) || defined(__thumb__)
#define GBS_SAVE_SIGNATURE_SECTION __attribute__((section(".gbs.save_signature")))
#else
#define GBS_SAVE_SIGNATURE_SECTION
#endif
extern "C" GBS_SAVE_SIGNATURE_SECTION __attribute__((weak, used))
const char gbs_save_type_signature[] = "SRAM_V113";

namespace gbs {

HardwareInfo hardware_info() {
    return target_hardware_info();
}

CartridgeSaveDevice configured_cartridge_save_device() {
    return gbs_save_type_signature[0] == 'F' &&
        gbs_save_type_signature[1] == 'L' &&
        gbs_save_type_signature[2] == 'A' &&
        gbs_save_type_signature[3] == 'S' &&
        gbs_save_type_signature[4] == 'H'
        ? CartridgeSaveDevice::Flash
        : CartridgeSaveDevice::Sram32K;
}

CartridgeSaveCapabilities configured_cartridge_save_capabilities() {
    return cartridge_save_capabilities(configured_cartridge_save_device());
}

CartridgeSaveDevice detected_cartridge_save_device() {
    return CartridgeSaveDevice::Unknown;
}

} // namespace gbs
