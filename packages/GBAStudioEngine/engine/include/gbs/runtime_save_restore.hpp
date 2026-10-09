#pragma once

#include <stdint.h>

#include "gbs/event.hpp"
#include "gbs/save.hpp"

namespace gbs {

using RuntimeAvailabilityMask = uint16_t;

// The universal runtime owns one save service for all scene adapters. The
// generated project provides the bank and capability manifest; the service
// only advances its in-memory sequence and delegates bytes to save.cpp.
struct RuntimeSaveService {
    SaveBank bank;
    const SaveMenuConfig* menu;
    const RuntimeCapabilityManifest* capabilities;
    uint32_t next_sequence;
};

constexpr RuntimeAvailabilityMask runtime_availability(RuntimeKind runtime) {
    return static_cast<RuntimeAvailabilityMask>(
        static_cast<RuntimeAvailabilityMask>(1u) << static_cast<uint8_t>(runtime)
    );
}

bool request_universal_save_restore(
    SaveBank bank,
    int slot_index,
    RuntimeAvailabilityMask available_runtimes
);

// Snapshot lives outside runtime overlays; opening a menu must not write SRAM.
void clear_suspended_runtime_save();
constexpr size_t suspended_runtime_transient_capacity = 1024;
bool capture_suspended_runtime_save(const UniversalSaveData& data, const void* transient = nullptr, size_t transient_size = 0);
void request_suspended_runtime_resume(const EventState& menu);
bool consume_suspended_runtime_resume(UniversalSaveRuntime runtime, int room_index, UniversalSaveData& data, void* transient = nullptr, size_t transient_size = 0);
bool restore_suspended_common_state(const UniversalSaveData& data, EventState& state);
SaveStatus write_suspended_runtime_save(RuntimeSaveService& service, int slot_index, const EventState& menu);

bool runtime_save_service_enabled(const RuntimeSaveService& service);
SaveStatus write_runtime_save(
    RuntimeSaveService& service,
    int slot_index,
    const UniversalSaveData& data,
    const SaveMetadata& metadata
);
SaveStatus read_runtime_save(
    const RuntimeSaveService& service,
    int slot_index,
    UniversalSaveData& data,
    SaveMetadata* metadata = nullptr
);
SaveStatus clear_runtime_save(RuntimeSaveService& service, int slot_index);
int latest_runtime_save_slot(const RuntimeSaveService& service);

} // namespace gbs
