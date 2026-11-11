#include <cassert>
#include "gbs/rumble.hpp"

static unsigned prepares=0,writes=0;
static bool motor=false,prepare_ok=true;
extern "C" int gbs_hw_chisflash_rumble_prepare() {++prepares;motor=false;return prepare_ok;}
extern "C" void gbs_hw_chisflash_rumble_set(int enabled) {++writes;motor=enabled!=0;}

int main() {
    using namespace gbs;
    rumble_init();rumble_on_for(10);rumble_update();rumble_off();
    assert(prepares==0 && writes==0 && !rumble_available());
    assert(rumble_configure_cartridge(RumbleCartridge::None));
    assert(prepares==0 && writes==0);
    assert(!rumble_configure_cartridge(static_cast<RumbleCartridge>(99)));
    assert(prepares==0 && writes==0);
    assert(rumble_configure_cartridge(RumbleCartridge::ChisFlashV12));
    assert(prepares==1 && rumble_available() && !rumble_active());
    rumble_on_for(2);assert(motor && rumble_active());
    rumble_update();assert(motor);
    rumble_update();assert(!motor && !rumble_active());
    rumble_on();assert(motor);
    assert(rumble_configure_cartridge(RumbleCartridge::None));
    assert(!motor && !rumble_available());
    auto before=writes;rumble_on();rumble_update();assert(writes==before);
    assert(rumble_configure_cartridge(RumbleCartridge::ChisFlashV12));
    rumble_on();rumble_init();assert(!motor && !rumble_available());
    prepare_ok=false;
    assert(!rumble_configure_cartridge(RumbleCartridge::ChisFlashV12));
    assert(!rumble_available() && !rumble_active());
}
