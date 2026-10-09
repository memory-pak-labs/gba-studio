#include "gbs/runtime_save_restore.hpp"
#include "gbs/dialogue.hpp"

namespace gbs {

namespace {

UniversalSaveData suspended_save {};
bool suspended_save_valid = false;
bool suspended_resume_requested = false;
uint8_t suspended_transient[suspended_runtime_transient_capacity] = {};
size_t suspended_transient_size = 0;

uint32_t sequence_for_write(uint32_t sequence) {
    return sequence == 0 ? 1u : sequence;
}

uint32_t next_sequence_after(uint32_t sequence) {
    return sequence == 0xFFFFFFFFu ? 1u : sequence + 1u;
}

bool runtime_kind_for_save(UniversalSaveRuntime saved_runtime, RuntimeKind& runtime) {
    switch (saved_runtime) {
    case UniversalSaveRuntime::TopDown:
        runtime = RuntimeKind::TopDown;
        return true;
    case UniversalSaveRuntime::Platformer:
        runtime = RuntimeKind::Platformer;
        return true;
    case UniversalSaveRuntime::Isometric:
        runtime = RuntimeKind::Isometric;
        return true;
    case UniversalSaveRuntime::Menu:
        runtime = RuntimeKind::Menu;
        return true;
    case UniversalSaveRuntime::Shmup:
        runtime = RuntimeKind::Shmup;
        return true;
    case UniversalSaveRuntime::PointClick:
        runtime = RuntimeKind::PointClick;
        return true;
    case UniversalSaveRuntime::DungeonCrawler:
        runtime = RuntimeKind::DungeonCrawler;
        return true;
    case UniversalSaveRuntime::Racing:
        runtime = RuntimeKind::Racing;
        return true;
    case UniversalSaveRuntime::Cutscene:
        runtime = RuntimeKind::Cutscene;
        return true;
    case UniversalSaveRuntime::VisualNovel:
        runtime = RuntimeKind::VisualNovel;
        return true;
    case UniversalSaveRuntime::WorldMap:
        runtime = RuntimeKind::WorldMap;
        return true;
    case UniversalSaveRuntime::BattleRpg:
        runtime = RuntimeKind::BattleRpg;
        return true;
    case UniversalSaveRuntime::Luta:
        runtime = RuntimeKind::Luta;
        return true;
    default:
        return false;
    }
}

} // namespace

void clear_suspended_runtime_save() {
    suspended_save_valid = false;
    suspended_resume_requested = false;
    suspended_transient_size = 0;
}

bool capture_suspended_runtime_save(const UniversalSaveData& data, const void* transient, size_t transient_size) {
    clear_suspended_runtime_save();
    suspended_save_valid = is_valid_universal_save_data(data) && data.runtime != UniversalSaveRuntime::Menu &&
        transient_size <= suspended_runtime_transient_capacity && (transient_size == 0 || transient != nullptr);
    if (suspended_save_valid) {
        suspended_save = data;
        suspended_transient_size = transient_size;
        for (size_t i = 0; i < transient_size; ++i) suspended_transient[i] = static_cast<const uint8_t*>(transient)[i];
    }
    return suspended_save_valid;
}

void update_suspended_common_state(const EventState& menu) {
    // Keep the gameplay payload and coordinates, but include changes made in Settings.
    suspended_save.dialogue_locale = active_dialogue_locale_id();
    for (size_t i = 0; i < universal_save_variable_count; ++i) suspended_save.variables[i] = menu.variables[i];
    for (size_t i = 0; i < universal_save_inventory_count; ++i) suspended_save.inventory[i] = menu.inventory[i];
    for (size_t i = 0; i < universal_save_equipment_slot_count; ++i) suspended_save.equipped_items[i] = menu.equipped_items[i];
    for (size_t i = 0; i < text_variable_count; ++i) {
        for (size_t j = 0; j <= text_variable_max_length; ++j) suspended_save.text_variables[i][j] = menu.text_variables[i][j];
    }
}

void request_suspended_runtime_resume(const EventState& menu) {
    suspended_resume_requested = suspended_save_valid;
    if (suspended_save_valid) update_suspended_common_state(menu);
}

bool consume_suspended_runtime_resume(UniversalSaveRuntime runtime, int room_index, UniversalSaveData& data, void* transient, size_t transient_size) {
    if (!suspended_resume_requested || !suspended_save_valid ||
        suspended_save.runtime != runtime || suspended_save.room_index != room_index ||
        transient_size != suspended_transient_size || (transient_size > 0 && transient == nullptr)) return false;
    data = suspended_save;
    for (size_t i = 0; i < transient_size; ++i) static_cast<uint8_t*>(transient)[i] = suspended_transient[i];
    clear_suspended_runtime_save();
    return true;
}

bool restore_suspended_common_state(const UniversalSaveData& data, EventState& state) {
    return read_universal_save_common_state(data, state.variables, universal_save_variable_count,
        state.inventory, universal_save_inventory_count, state.equipped_items, universal_save_equipment_slot_count,
        state.text_variables, text_variable_count);
}

SaveStatus write_suspended_runtime_save(RuntimeSaveService& service, int slot_index, const EventState& menu) {
    if (!suspended_save_valid) return SaveStatus::InvalidData;
    update_suspended_common_state(menu);
    for (size_t i = 0; i < service.bank.slot_count; ++i) {
        const SaveInfo info = inspect_save_slot(service.bank, i);
        if (info.status == SaveStatus::Ok && info.sequence >= service.next_sequence) service.next_sequence = next_sequence_after(info.sequence);
    }
    const SaveMetadata metadata = make_save_metadata("MANUAL", suspended_save.play_time_frames,
        service.next_sequence, suspended_save.room_index, 0);
    return write_runtime_save(service, slot_index, suspended_save, metadata);
}

bool runtime_save_service_enabled(const RuntimeSaveService& service) {
    return is_valid_save_bank(service.bank) &&
        service.capabilities != nullptr &&
        runtime_capability_enabled(*service.capabilities, RuntimeCapabilityID::Save);
}

SaveStatus write_runtime_save(
    RuntimeSaveService& service,
    int slot_index,
    const UniversalSaveData& data,
    const SaveMetadata& metadata
) {
    if (!runtime_save_service_enabled(service)) {
        return SaveStatus::UnsupportedDevice;
    }
    if (slot_index < 0 || static_cast<size_t>(slot_index) >= service.bank.slot_count) {
        return SaveStatus::InvalidSlot;
    }
    if (!is_valid_universal_save_data(data)) {
        return SaveStatus::InvalidData;
    }

    // Services are recreated on boot, but slot ordering belongs to the bank.
    for (size_t index = 0; index < service.bank.slot_count; ++index) {
        const SaveInfo info = inspect_save_slot(service.bank, index);
        if (info.status == SaveStatus::Ok && info.sequence >= service.next_sequence)
            service.next_sequence = next_sequence_after(info.sequence);
    }
    const uint32_t sequence = sequence_for_write(service.next_sequence);
    const SaveStatus status = write_save_slot_record(
        service.bank,
        static_cast<size_t>(slot_index),
        &data,
        sizeof(data),
        metadata,
        sequence
    );
    if (status == SaveStatus::Ok) {
        service.next_sequence = next_sequence_after(sequence);
    }
    return status;
}

SaveStatus read_runtime_save(
    const RuntimeSaveService& service,
    int slot_index,
    UniversalSaveData& data,
    SaveMetadata* metadata
) {
    if (!runtime_save_service_enabled(service)) {
        return SaveStatus::UnsupportedDevice;
    }
    if (slot_index < 0 || static_cast<size_t>(slot_index) >= service.bank.slot_count) {
        return SaveStatus::InvalidSlot;
    }

    size_t bytes_read = 0;
    const SaveStatus status = read_save_slot_record(
        service.bank,
        static_cast<size_t>(slot_index),
        &data,
        sizeof(data),
        metadata,
        &bytes_read
    );
    if (status != SaveStatus::Ok) {
        return status;
    }
    return bytes_read == sizeof(data) && is_valid_universal_save_data(data)
        ? SaveStatus::Ok
        : SaveStatus::InvalidData;
}

SaveStatus clear_runtime_save(RuntimeSaveService& service, int slot_index) {
    if (!runtime_save_service_enabled(service)) {
        return SaveStatus::UnsupportedDevice;
    }
    if (slot_index < 0 || static_cast<size_t>(slot_index) >= service.bank.slot_count) {
        return SaveStatus::InvalidSlot;
    }
    return clear_save_slot(service.bank, static_cast<size_t>(slot_index));
}

int latest_runtime_save_slot(const RuntimeSaveService& service) {
    return runtime_save_service_enabled(service) ? find_latest_save_slot(service.bank) : -1;
}

bool request_universal_save_restore(
    SaveBank bank,
    int slot_index,
    RuntimeAvailabilityMask available_runtimes
) {
    if (!is_valid_save_bank(bank) ||
        slot_index < 0 ||
        static_cast<size_t>(slot_index) >= bank.slot_count) {
        return false;
    }

    UniversalSaveData data {};
    size_t bytes_read = 0;
    if (read_save_slot_record(
            bank,
            static_cast<size_t>(slot_index),
            &data,
            sizeof(data),
            nullptr,
            &bytes_read) != SaveStatus::Ok ||
        bytes_read != sizeof(data) ||
        !is_valid_universal_save_data(data)) {
        return false;
    }

    RuntimeKind runtime = RuntimeKind::TopDown;
    if (!runtime_kind_for_save(data.runtime, runtime) ||
        (available_runtimes & runtime_availability(runtime)) == 0) {
        return false;
    }
    return request_runtime_save_restore(runtime, slot_index);
}

} // namespace gbs
