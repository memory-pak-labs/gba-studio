#include "gbs/rumble.hpp"
#include "gbs_hw.h"

namespace gbs {
namespace {
bool selected_available(void*) { return true; }
void chisflash_set_enabled(void*, bool enabled) { gbs_hw_chisflash_rumble_set(enabled ? 1 : 0); }
}

bool rumble_configure_cartridge(RumbleCartridge cartridge) {
    if (cartridge != RumbleCartridge::None && cartridge != RumbleCartridge::ChisFlashV12) return false;
    rumble_set_provider(RumbleProvider{});
    if (cartridge == RumbleCartridge::None) return true;
    if (!gbs_hw_chisflash_rumble_prepare()) return false;
    rumble_set_provider(RumbleProvider{selected_available, chisflash_set_enabled, nullptr});
    return true;
}
} // namespace gbs
