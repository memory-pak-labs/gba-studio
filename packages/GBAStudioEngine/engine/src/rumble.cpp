#include "gbs/rumble.hpp"

namespace gbs {

namespace {

bool s_rumble_available = false;
bool s_rumble_active = false;
uint16_t s_rumble_timer = 0;
RumbleProvider s_provider {};

} // namespace

void rumble_set_provider(const RumbleProvider& provider) {
    if (s_rumble_active && s_provider.set_enabled != nullptr) {
        s_provider.set_enabled(s_provider.user_data, false);
    }
    s_provider = provider;
    s_rumble_active = false;
    s_rumble_timer = 0;
    s_rumble_available = provider.available != nullptr && provider.set_enabled != nullptr &&
        provider.available(provider.user_data);
}

void rumble_init() {
    s_rumble_active = false;
    s_rumble_timer = 0;

    s_provider = RumbleProvider {};
    s_rumble_available = false;
}

void rumble_on() {
    if (!s_rumble_available) return;
    s_rumble_active = true;
    // Don't reset timer here; rumble_on_for sets it before calling this.
    s_provider.set_enabled(s_provider.user_data, true);
}

void rumble_off() {
    s_rumble_active = false;
    s_rumble_timer = 0;
    if (s_rumble_available && s_provider.set_enabled != nullptr) {
        s_provider.set_enabled(s_provider.user_data, false);
    }
}

void rumble_on_for(uint16_t frames) {
    if (frames == 0) {
        rumble_off();
        return;
    }
    s_rumble_timer = frames;
    rumble_on();
}

void rumble_update() {
    if (s_rumble_timer > 0) {
        --s_rumble_timer;
        if (s_rumble_timer == 0) {
            rumble_off();
        }
    }
}

bool rumble_active() {
    return s_rumble_active;
}

bool rumble_available() {
    return s_rumble_available;
}

} // namespace gbs
