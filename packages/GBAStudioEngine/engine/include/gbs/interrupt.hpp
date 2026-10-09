#pragma once

#include <stdint.h>

namespace gbs {

enum class InterruptSource : uint8_t {
    VBlank = 0,
    Timer0 = 1,
    Timer1 = 2,
    Timer2 = 3,
    Timer3 = 4,
    Keypad = 5,
    HBlank = 6
};

using InterruptCallback = void (*)();
using InternalInterruptHandle = uint8_t;

constexpr InternalInterruptHandle invalid_internal_interrupt_handle = 0;

constexpr uint16_t interrupt_mask(InterruptSource source) {
    return static_cast<uint16_t>(1u << static_cast<uint8_t>(source));
}

constexpr uint16_t hardware_interrupt_mask(InterruptSource source) {
    switch (source) {
    case InterruptSource::VBlank:
        return 1u << 0;
    case InterruptSource::Timer0:
        return 1u << 3;
    case InterruptSource::Timer1:
        return 1u << 4;
    case InterruptSource::Timer2:
        return 1u << 5;
    case InterruptSource::Timer3:
        return 1u << 6;
    case InterruptSource::Keypad:
        return 1u << 12;
    case InterruptSource::HBlank:
        return 1u << 1;
    }
    return 0;
}

constexpr bool is_valid_interrupt_source(InterruptSource source) {
    return static_cast<uint8_t>(source) <= static_cast<uint8_t>(InterruptSource::HBlank);
}

constexpr bool interrupt_source_available_to_game(InterruptSource source) {
    return is_valid_interrupt_source(source) &&
        source != InterruptSource::Timer1 &&
        source != InterruptSource::Timer2 &&
        source != InterruptSource::Timer3;
}

void set_interrupt_callback(InterruptSource source, InterruptCallback callback);
void enable_interrupt(InterruptSource source);
void disable_interrupt(InterruptSource source);
bool interrupt_enabled(InterruptSource source);
void emit_interrupt(InterruptSource source);
void dispatch_hardware_interrupts(uint16_t hardware_mask);

// Engine services may share a hardware interrupt with game callbacks. These
// callbacks run first and are intentionally managed separately from the game API.
InternalInterruptHandle add_internal_interrupt_callback(InterruptSource source, InterruptCallback callback);
void remove_internal_interrupt_callback(InterruptSource source, InternalInterruptHandle handle);
void set_internal_interrupt_callback(InterruptSource source, InterruptCallback callback);
// Each enable acquires one source reference and each disable releases one.
// This lets independent engine services share the same hardware interrupt.
void enable_internal_interrupt(InterruptSource source);
void disable_internal_interrupt(InterruptSource source);

} // namespace gbs
