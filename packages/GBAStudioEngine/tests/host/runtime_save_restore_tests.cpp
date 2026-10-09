#include <cassert>

#include "gbs/runtime_save_restore.hpp"

namespace {

constexpr gbs::SaveBank save_bank {
    4096,
    2048,
    2,
    gbs::make_save_signature('R', 'S', 'R', 'T'),
    1
};

constexpr gbs::RuntimeCapabilityDescriptor runtime_capabilities[] {
    { gbs::RuntimeCapabilityID::Save, true, true },
    { gbs::RuntimeCapabilityID::Rtc, false, false },
    { gbs::RuntimeCapabilityID::Link, false, false },
    { gbs::RuntimeCapabilityID::Affine, false, false }
};

constexpr gbs::RuntimeCapabilityManifest runtime_capability_manifest {
    1,
    runtime_capabilities,
    sizeof(runtime_capabilities) / sizeof(runtime_capabilities[0])
};

gbs::UniversalSaveData make_save(gbs::UniversalSaveRuntime runtime) {
    gbs::UniversalSaveData data {};
    assert(gbs::make_universal_save_data(
        data,
        runtime,
        2,
        48,
        72,
        0,
        0,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        180,
        0,
        nullptr,
        0
    ));
    return data;
}

void write_runtime_save(int slot_index, gbs::UniversalSaveRuntime runtime) {
    const gbs::UniversalSaveData data = make_save(runtime);
    assert(gbs::write_save_slot_record(
        save_bank,
        static_cast<size_t>(slot_index),
        &data,
        sizeof(data),
        gbs::make_save_metadata("CONTINUE"),
        static_cast<uint32_t>(slot_index + 1)
    ) == gbs::SaveStatus::Ok);
}

void test_continue_routes_dungeon_and_racing_saves() {
    gbs::format_save_memory();
    write_runtime_save(0, gbs::UniversalSaveRuntime::DungeonCrawler);
    write_runtime_save(1, gbs::UniversalSaveRuntime::Racing);
    const gbs::RuntimeAvailabilityMask available =
        gbs::runtime_availability(gbs::RuntimeKind::DungeonCrawler) |
        gbs::runtime_availability(gbs::RuntimeKind::Racing);

    assert(gbs::request_universal_save_restore(save_bank, 0, available));
    int restored_slot = -1;
    assert(gbs::consume_runtime_save_restore(gbs::RuntimeKind::DungeonCrawler, restored_slot));
    assert(restored_slot == 0);

    assert(gbs::request_universal_save_restore(save_bank, 1, available));
    restored_slot = -1;
    assert(gbs::consume_runtime_save_restore(gbs::RuntimeKind::Racing, restored_slot));
    assert(restored_slot == 1);
}

void test_continue_rejects_a_runtime_absent_from_the_rom() {
    gbs::format_save_memory();
    write_runtime_save(0, gbs::UniversalSaveRuntime::Racing);

    assert(!gbs::request_universal_save_restore(
        save_bank,
        0,
        gbs::runtime_availability(gbs::RuntimeKind::DungeonCrawler)
    ));
    assert(!gbs::runtime_transition_pending());
}

void test_runtime_save_service_uses_the_universal_save_bank() {
    gbs::format_save_memory();
    gbs::RuntimeSaveService service {
        save_bank,
        nullptr,
        &runtime_capability_manifest,
        0
    };
    assert(gbs::runtime_save_service_enabled(service));

    gbs::UniversalSaveData data = make_save(gbs::UniversalSaveRuntime::TopDown);
    data.room_index = 9;
    const gbs::SaveMetadata metadata = gbs::make_save_metadata("UNIVERSAL", 120, 42, 9, 3);
    assert(gbs::write_runtime_save(service, 1, data, metadata) == gbs::SaveStatus::Ok);
    assert(service.next_sequence == 2);
    assert(gbs::latest_runtime_save_slot(service) == 1);

    gbs::UniversalSaveData loaded {};
    gbs::SaveMetadata loaded_metadata {};
    assert(gbs::read_runtime_save(service, 1, loaded, &loaded_metadata) == gbs::SaveStatus::Ok);
    assert(loaded.room_index == 9);
    assert(loaded_metadata.room_index == 9);
    assert(loaded_metadata.title[0] == 'U');

    assert(gbs::clear_runtime_save(service, 1) == gbs::SaveStatus::Ok);
    assert(gbs::latest_runtime_save_slot(service) == -1);
}

void test_runtime_save_service_requires_the_save_capability() {
    static constexpr gbs::RuntimeCapabilityDescriptor disabled_capabilities[] {
        { gbs::RuntimeCapabilityID::Save, false, false },
        { gbs::RuntimeCapabilityID::Rtc, false, false },
        { gbs::RuntimeCapabilityID::Link, false, false },
        { gbs::RuntimeCapabilityID::Affine, false, false }
    };
    static constexpr gbs::RuntimeCapabilityManifest disabled_manifest {
        1,
        disabled_capabilities,
        sizeof(disabled_capabilities) / sizeof(disabled_capabilities[0])
    };
    gbs::RuntimeSaveService service { save_bank, nullptr, &disabled_manifest, 1 };
    const gbs::UniversalSaveData data = make_save(gbs::UniversalSaveRuntime::TopDown);
    assert(!gbs::runtime_save_service_enabled(service));
    assert(gbs::write_runtime_save(service, 0, data, gbs::make_save_metadata("DISABLED")) == gbs::SaveStatus::UnsupportedDevice);
}

void test_menu_saves_the_suspended_gameplay_payload_and_current_preferences() {
    gbs::format_save_memory();
    gbs::RuntimeSaveService service { save_bank, nullptr, &runtime_capability_manifest, 1 };
    gbs::EventState menu {};
    gbs::init_event_state(menu);
    gbs::clear_suspended_runtime_save();
    assert(gbs::write_suspended_runtime_save(service, 1, menu) == gbs::SaveStatus::InvalidData);
    auto paused = make_save(gbs::UniversalSaveRuntime::Isometric);
    paused.payload_size = 2;
    paused.payload[0] = 37;
    paused.payload[1] = 91;
    const uint8_t transient[] = { 7, 2, 19 };
    assert(gbs::capture_suspended_runtime_save(paused, transient, sizeof(transient)));
    menu.variables[18] = 40;
    menu.inventory[2] = 3;
    menu.text_variables[0][0] = 'L';
    menu.text_variables[0][1] = '\0';
    assert(gbs::write_suspended_runtime_save(service, 1, menu) == gbs::SaveStatus::Ok);
    gbs::UniversalSaveData loaded {};
    assert(gbs::read_runtime_save(service, 1, loaded) == gbs::SaveStatus::Ok);
    assert(loaded.runtime == gbs::UniversalSaveRuntime::Isometric);
    assert(loaded.room_index == paused.room_index && loaded.player_x == paused.player_x);
    assert(loaded.payload_size == 2 && loaded.payload[0] == 37 && loaded.payload[1] == 91);
    assert(loaded.variables[18] == 40 && loaded.inventory[2] == 3);
    assert(loaded.text_variables[0][0] == 'L');
    assert(gbs::inspect_save_slot(save_bank, 0).status != gbs::SaveStatus::Ok);
    gbs::UniversalSaveData resumed {};
    assert(!gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::Isometric, 2, resumed));
    gbs::request_suspended_runtime_resume(menu);
    assert(!gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::TopDown, 2, resumed));
    uint8_t restored_transient[3] = {};
    assert(gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::Isometric, 2, resumed, restored_transient, sizeof(restored_transient)));
    assert(restored_transient[0] == 7 && restored_transient[1] == 2 && restored_transient[2] == 19);
    assert(resumed.payload[1] == 91 && resumed.variables[18] == 40);
    assert(!gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::Isometric, 2, resumed));
    gbs::clear_suspended_runtime_save();
    assert(gbs::write_suspended_runtime_save(service, 0, menu) == gbs::SaveStatus::InvalidData);
}

} // namespace

void test_fresh_save_service_continues_existing_slot_sequences() {
    gbs::format_save_memory();
    gbs::RuntimeSaveService first {save_bank, nullptr, &runtime_capability_manifest, 1};
    const auto data = make_save(gbs::UniversalSaveRuntime::Racing);
    assert(gbs::write_runtime_save(first, 0, data, gbs::make_save_metadata("OLD")) == gbs::SaveStatus::Ok);
    gbs::RuntimeSaveService restarted {save_bank, nullptr, &runtime_capability_manifest, 1};
    assert(gbs::write_runtime_save(restarted, 1, data, gbs::make_save_metadata("NEW")) == gbs::SaveStatus::Ok);
    assert(gbs::inspect_save_slot(save_bank, 1).sequence == 2);
    assert(gbs::latest_runtime_save_slot(restarted) == 1);
}

int main() {
    test_fresh_save_service_continues_existing_slot_sequences();
    test_menu_saves_the_suspended_gameplay_payload_and_current_preferences();
    test_continue_routes_dungeon_and_racing_saves();
    test_continue_rejects_a_runtime_absent_from_the_rom();
    test_runtime_save_service_uses_the_universal_save_bank();
    test_runtime_save_service_requires_the_save_capability();
    return 0;
}
