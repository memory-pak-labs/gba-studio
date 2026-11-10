#pragma once

#include <stdint.h>

namespace gbs {

using RumbleAvailable = bool (*)(void* user_data);
using RumbleSetEnabled = void (*)(void* user_data, bool enabled);

struct RumbleProvider {
    RumbleAvailable available = nullptr;
    RumbleSetEnabled set_enabled = nullptr;
    void* user_data = nullptr;
};

void rumble_set_provider(const RumbleProvider& provider);

enum class RumbleCartridge : uint8_t { None, ChisFlashV12 };
// Explicit hardware selection; never probes an unknown cartridge. None is the
// default. ChisFlashV12 is experimental until validated on the physical board.
bool rumble_configure_cartridge(RumbleCartridge cartridge);

// ============================================================
// Rumble / Vibration Support
// ============================================================
// Cartridge rumble is hardware-specific. The engine only drives a provider
// explicitly installed by the cartridge/runtime integration.
//
// Usage:
//   rumble_init();
//   rumble_on();          // start rumbling
//   rumble_on_for(60);    // rumble for 60 frames
//   rumble_update();      // call each frame to decrement timer
//   rumble_off();         // stop rumbling

// Initialize the rumble subsystem.
void rumble_init();

// Start rumbling (continuous until rumble_off or rumble_on_for).
void rumble_on();

// Stop rumbling immediately.
void rumble_off();

// Rumble for a specified number of frames. Automatically stops when done.
void rumble_on_for(uint16_t frames);

// Call once per frame to update the rumble timer.
void rumble_update();

// Returns true if the rumble motor is currently active.
bool rumble_active();

// Provider availability, not proof of physical hardware detection.
bool rumble_available();

} // namespace gbs
