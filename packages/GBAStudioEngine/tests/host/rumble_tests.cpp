#include <cassert>
#include "gbs/rumble.hpp"

using namespace gbs;

namespace {
bool motor_enabled = false;
bool fake_available(void*) { return true; }
void fake_set_enabled(void*, bool enabled) { motor_enabled = enabled; }
const RumbleProvider fake_provider { fake_available, fake_set_enabled, nullptr };
}

void test_init() {
    rumble_init();
    assert(!rumble_active());
    assert(!rumble_available());
}

void test_on_off() {
    rumble_init();
    rumble_set_provider(fake_provider);
    rumble_on();
    assert(rumble_active());
    assert(motor_enabled);
    rumble_off();
    assert(!rumble_active());
    assert(!motor_enabled);
}

void test_on_for_auto_stops() {
    rumble_init();
    rumble_set_provider(fake_provider);
    rumble_on_for(3);
    assert(rumble_active());

    rumble_update(); // frame 1
    assert(rumble_active());

    rumble_update(); // frame 2
    assert(rumble_active());

    rumble_update(); // frame 3 -> timer reaches 0
    assert(!rumble_active());
}

void test_on_for_zero() {
    rumble_init();
    rumble_on_for(0);
    assert(!rumble_active());
}

void test_update_when_inactive() {
    rumble_init();
    rumble_update(); // no-op when not active
    assert(!rumble_active());
}

void test_gpio_pin_config() {
    rumble_init();
    assert(!rumble_available());
}

int main() {
    test_init();
    test_on_off();
    test_on_for_auto_stops();
    test_on_for_zero();
    test_update_when_inactive();
    test_gpio_pin_config();
    return 0;
}
