#include "gbs/interrupt.hpp"

namespace {

constexpr int source_count = 7;
constexpr int internal_callback_count = 4;
gbs::InterruptCallback callbacks[source_count] = {};
struct InternalInterruptSlot {
    gbs::InternalInterruptHandle handle = gbs::invalid_internal_interrupt_handle;
    gbs::InterruptCallback callback = nullptr;
};
InternalInterruptSlot internal_callbacks[source_count][internal_callback_count] = {};
uint8_t internal_enable_counts[source_count] = {};
gbs::InternalInterruptHandle next_internal_callback_handle = 1;
uint16_t enabled_mask = 0;
uint16_t internal_enabled_mask = 0;

int index_for(gbs::InterruptSource source) {
    return static_cast<int>(source);
}

bool source_has_enabled_handler(gbs::InterruptSource source) {
    const uint16_t mask = gbs::interrupt_mask(source);
    return (enabled_mask & mask) != 0 || (internal_enabled_mask & mask) != 0;
}

bool internal_callback_handle_in_use(gbs::InterruptSource source, gbs::InternalInterruptHandle handle) {
    const int index = index_for(source);
    for (int slot = 0; slot < internal_callback_count; ++slot) {
        if (internal_callbacks[index][slot].handle == handle) {
            return true;
        }
    }
    return false;
}

#if defined(__arm__) || defined(__thumb__)
extern "C" void gbs_hw_enable_interrupt_source(int source);
extern "C" void gbs_hw_disable_interrupt_source(int source);
#else
void gbs_hw_enable_interrupt_source(int) {
}

void gbs_hw_disable_interrupt_source(int) {
}
#endif

void synchronize_hardware_interrupt(gbs::InterruptSource source) {
    if (source_has_enabled_handler(source)) {
        gbs_hw_enable_interrupt_source(index_for(source));
    } else {
        gbs_hw_disable_interrupt_source(index_for(source));
    }
}

} // namespace

namespace gbs {

void set_interrupt_callback(InterruptSource source, InterruptCallback callback) {
    if (!interrupt_source_available_to_game(source)) {
        return;
    }
    callbacks[index_for(source)] = callback;
}

void enable_interrupt(InterruptSource source) {
    if (!interrupt_source_available_to_game(source)) {
        return;
    }
    enabled_mask = static_cast<uint16_t>(enabled_mask | interrupt_mask(source));
    synchronize_hardware_interrupt(source);
}

void disable_interrupt(InterruptSource source) {
    if (!interrupt_source_available_to_game(source)) {
        return;
    }
    enabled_mask = static_cast<uint16_t>(enabled_mask & ~interrupt_mask(source));
    synchronize_hardware_interrupt(source);
}

bool interrupt_enabled(InterruptSource source) {
    return interrupt_source_available_to_game(source) && (enabled_mask & interrupt_mask(source)) != 0;
}

void emit_interrupt(InterruptSource source) {
    if (!interrupt_source_available_to_game(source) || !source_has_enabled_handler(source)) {
        return;
    }

    const int index = index_for(source);
    if ((internal_enabled_mask & interrupt_mask(source)) != 0) {
        for (int slot = 0; slot < internal_callback_count; ++slot) {
            InterruptCallback internal_callback = internal_callbacks[index][slot].callback;
            if (internal_callback != nullptr) {
                internal_callback();
            }
        }
    }
    if ((enabled_mask & interrupt_mask(source)) != 0) {
        InterruptCallback callback = callbacks[index];
        if (callback != nullptr) {
            callback();
        }
    }
}

InternalInterruptHandle add_internal_interrupt_callback(InterruptSource source, InterruptCallback callback) {
    if (!interrupt_source_available_to_game(source) || callback == nullptr) {
        return invalid_internal_interrupt_handle;
    }
    const int index = index_for(source);
    for (int slot = 0; slot < internal_callback_count; ++slot) {
        if (internal_callbacks[index][slot].callback == nullptr) {
            InternalInterruptHandle candidate = next_internal_callback_handle;
            for (int attempt = 0; attempt < 255 && internal_callback_handle_in_use(source, candidate); ++attempt) {
                candidate = candidate == UINT8_MAX ? 1 : static_cast<InternalInterruptHandle>(candidate + 1);
            }
            if (candidate == invalid_internal_interrupt_handle || internal_callback_handle_in_use(source, candidate)) {
                return invalid_internal_interrupt_handle;
            }
            next_internal_callback_handle = candidate == UINT8_MAX
                ? 1
                : static_cast<InternalInterruptHandle>(candidate + 1);
            internal_callbacks[index][slot] = InternalInterruptSlot { candidate, callback };
            return candidate;
        }
    }
    return invalid_internal_interrupt_handle;
}

void remove_internal_interrupt_callback(InterruptSource source, InternalInterruptHandle handle) {
    if (!interrupt_source_available_to_game(source) || handle == invalid_internal_interrupt_handle) {
        return;
    }
    const int index = index_for(source);
    for (int slot = 0; slot < internal_callback_count; ++slot) {
        if (internal_callbacks[index][slot].handle == handle) {
            internal_callbacks[index][slot] = InternalInterruptSlot {};
            return;
        }
    }
}

void set_internal_interrupt_callback(InterruptSource source, InterruptCallback callback) {
    if (!interrupt_source_available_to_game(source)) {
        return;
    }
    const int index = index_for(source);
    for (int slot = 0; slot < internal_callback_count; ++slot) {
        internal_callbacks[index][slot] = InternalInterruptSlot {};
    }
    add_internal_interrupt_callback(source, callback);
}

void enable_internal_interrupt(InterruptSource source) {
    if (!interrupt_source_available_to_game(source)) {
        return;
    }
    const int index = index_for(source);
    if (internal_enable_counts[index] < UINT8_MAX) {
        ++internal_enable_counts[index];
    }
    internal_enabled_mask = static_cast<uint16_t>(internal_enabled_mask | interrupt_mask(source));
    synchronize_hardware_interrupt(source);
}

void disable_internal_interrupt(InterruptSource source) {
    if (!interrupt_source_available_to_game(source)) {
        return;
    }
    const int index = index_for(source);
    if (internal_enable_counts[index] > 0) {
        --internal_enable_counts[index];
    }
    if (internal_enable_counts[index] == 0) {
        internal_enabled_mask = static_cast<uint16_t>(internal_enabled_mask & ~interrupt_mask(source));
    }
    synchronize_hardware_interrupt(source);
}

void dispatch_hardware_interrupts(uint16_t hardware_mask) {
    const InterruptSource sources[] = {
        InterruptSource::VBlank,
        InterruptSource::Timer0,
        InterruptSource::Timer1,
        InterruptSource::Timer2,
        InterruptSource::Timer3,
        InterruptSource::Keypad,
        InterruptSource::HBlank
    };

    for (InterruptSource source : sources) {
        if ((hardware_mask & hardware_interrupt_mask(source)) != 0) {
            emit_interrupt(source);
        }
    }
}

} // namespace gbs

extern "C" void gbs_dispatch_hardware_interrupts(uint16_t hardware_mask) {
    gbs::dispatch_hardware_interrupts(hardware_mask);
}

extern "C" void gbs_emit_vblank_interrupt() {
    gbs::emit_interrupt(gbs::InterruptSource::VBlank);
}

extern "C" void gbs_emit_keypad_interrupt() {
    gbs::emit_interrupt(gbs::InterruptSource::Keypad);
}
