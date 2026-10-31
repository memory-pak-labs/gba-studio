#include <cassert>
#include <cstring>
#include "gbs/runtime_checkpoint.hpp"

void test_failed_save_preserves_the_previous_checkpoint_and_cross_family_load() {
    constexpr gbs::SaveBank bank {4096, 2048, 2, gbs::make_save_signature('C', 'H', 'K', 'P'), 1};
    constexpr gbs::RuntimeCapabilityDescriptor descriptor[] = {{gbs::RuntimeCapabilityID::Save, true, true}};
    const gbs::RuntimeCapabilityManifest capabilities {1, descriptor, 1};
    gbs::RuntimeSaveService save_service {bank, nullptr, &capabilities, 0};
    gbs::RuntimeServices services {nullptr, nullptr, &save_service, nullptr, nullptr, nullptr};
    const gbs::RuntimeSceneDescriptor scenes[] = {
        {"battle", gbs::RuntimeKind::BattleRpg, 0}, {"fight", gbs::RuntimeKind::Luta, 0}
    };
    const gbs::RuntimeSceneRegistry registry {scenes, 2, 0};
    const gbs::RuntimeAdapter adapters[] = {
        {gbs::RuntimeKind::BattleRpg, nullptr, []() {return 42;}},
        {gbs::RuntimeKind::Luta, nullptr, []() {return 42;}}
    };
    gbs::ProjectRuntime runtime {&registry, adapters, 2,
        {[]() {return false;}, [](gbs::RuntimeTransitionRoute&) {return false;}, nullptr},
        &services, gbs::RuntimeKind::BattleRpg, 0, &capabilities};
    assert(gbs::run_project_runtime(runtime) == 42);
    assert(gbs::active_runtime_availability() ==
        (gbs::runtime_availability(gbs::RuntimeKind::BattleRpg) | gbs::runtime_availability(gbs::RuntimeKind::Luta)));
    gbs::format_save_memory();
    gbs::EventState events {};
    gbs::init_event_state(events);
    gbs::UniversalSaveData previous {};
    assert(gbs::capture_runtime_checkpoint(previous, gbs::UniversalSaveRuntime::Luta, 0, 40, 100,
        events, nullptr, 0, 60));
    assert(gbs::write_runtime_save(save_service, 0, previous, gbs::make_save_metadata("FIGHT")) == gbs::SaveStatus::Ok);
    const auto sequence = save_service.next_sequence;
    events.save_request = 1;
    events.save_request_slot = 0;
    assert(gbs::consume_checkpoint_request(events, previous, false, "TOO LARGE", gbs::RuntimeKind::BattleRpg) == gbs::SaveStatus::InvalidData);
    gbs::UniversalSaveData read {};
    assert(gbs::read_runtime_save(save_service, 0, read) == gbs::SaveStatus::Ok);
    assert(std::memcmp(&read, &previous, sizeof(read)) == 0 && save_service.next_sequence == sequence);
    save_service.next_sequence = 1; // Fresh-core service, existing cartridge records.
    events.save_request = 1;
    events.save_request_slot = 1;
    assert(gbs::consume_checkpoint_request(events, previous, true, "NEW SLOT", gbs::RuntimeKind::BattleRpg) == gbs::SaveStatus::Ok);
    assert(gbs::inspect_save_slot(bank, 1).sequence == 2 && gbs::latest_runtime_save_slot(save_service) == 1);
    events.save_request = 2;
    events.save_request_slot = 0;
    assert(gbs::consume_checkpoint_request(events, previous, true, "LOAD", gbs::RuntimeKind::BattleRpg) == gbs::SaveStatus::Ok);
    int slot = -1;
    assert(gbs::consume_runtime_save_restore(gbs::RuntimeKind::Luta, slot) && slot == 0);
}

void test_legacy_record_read_is_transactional() {
    struct OldRecord {
        uint32_t version;
        int32_t before;
        gbs::CheckpointScriptV1 script;
        int32_t after;
    };
    struct Record {
        uint32_t version;
        int32_t before;
        gbs::CheckpointScript script;
        int32_t after;
    };
    const OldRecord old {1, 137, {-1, 0, 0, 0, {0x35, 0xA7, 0xFF}}, 9111};
    gbs::UniversalSaveData data {};
    gbs::CheckpointPayloadWriter writer(data); assert(writer.write(old));
    gbs::CheckpointPayloadReader reader(data);
    Record output {};
    assert(gbs::read_legacy_checkpoint_record(reader, output));
    assert(output.before == 137 && output.after == 9111 && output.script.call_depth == 0 && reader.complete());
    --data.payload_size;
    gbs::CheckpointPayloadReader truncated(data);
    output.before = 99;
    assert(!gbs::read_legacy_checkpoint_record(truncated, output));
    assert(output.before == 99);
    uint32_t first = 0;
    assert(truncated.read(first) && first == 1); // Failed reads do not consume the prefix.
    auto foreign_data = data;
    gbs::CheckpointPayloadReader foreign(foreign_data);
    assert(!truncated.commit(foreign));
    int32_t second = 0;
    assert(truncated.read(second) && second == 137);
}

void test_nested_script_checkpoint_resumes_all_callers_once() {
    const gbs::EventCommand leaf[] = {
        {gbs::EventOp::SaveGame, 0, 0, 0}, {gbs::EventOp::AddVariable, 0, 10, 0}
    };
    const gbs::EventCommand child[] = {
        {gbs::EventOp::AddVariable, 0, 1, 0}, {gbs::EventOp::CallScript, 1, 0, 0},
        {gbs::EventOp::AddVariable, 0, 100, 0}
    };
    const gbs::EventScript scripts[] = {{child, 3}, {leaf, 2}};
    const gbs::EventCommand parent[] = {
        {gbs::EventOp::CallScript, 0, 0, 0}, {gbs::EventOp::AddVariable, 0, 1000, 0}
    };
    gbs::EventState events {}; gbs::init_event_state(events);
    gbs::bind_event_scripts(events, scripts, 2);
    gbs::EventRunner runner {}; gbs::start_event_runner(runner, {parent, 2});
    for (int frame = 0; frame < 20 && events.save_request == 0; ++frame)
        gbs::update_checkpoint_event_runner(runner, events);
    assert(events.save_request == 1 && events.variables[0] == 1 && runner.call_depth == 2);
    const auto bookmark = gbs::capture_checkpoint_script(runner, 7, events);
    gbs::EventRunner restored {};
    assert(gbs::restore_checkpoint_script(bookmark, {parent, 2}, restored, &events));
    events.save_request = 0;
    for (int frame = 0; frame < 20 && restored.active; ++frame)
        gbs::update_checkpoint_event_runner(restored, events);
    assert(!restored.active && events.variables[0] == 1111);

    const auto stable_runner = restored;
    auto invalid = bookmark;
    invalid.call_depth = gbs::max_event_script_call_depth + 1;
    assert(!gbs::restore_checkpoint_script(invalid, {parent, 2}, restored, &events));
    invalid = bookmark; invalid.calls[0].script_hash ^= 1;
    assert(!gbs::restore_checkpoint_script(invalid, {parent, 2}, restored, &events));
    invalid = bookmark; invalid.calls[1].command_index = 999;
    assert(!gbs::restore_checkpoint_script(invalid, {parent, 2}, restored, &events));
    invalid = bookmark; invalid.calls[1].script_index = 999;
    assert(!gbs::restore_checkpoint_script(invalid, {parent, 2}, restored, &events));
    assert(restored.command_index == stable_runner.command_index && restored.active == stable_runner.active);

    // Relocated tables with the same commands are valid; changed callees are not.
    gbs::EventCommand relocated_child[3], relocated_leaf[2];
    std::memcpy(relocated_child, child, sizeof(child));
    std::memcpy(relocated_leaf, leaf, sizeof(leaf));
    const gbs::EventScript relocated[] = {{relocated_child, 3}, {relocated_leaf, 2}};
    gbs::bind_event_scripts(events, relocated, 2);
    assert(gbs::restore_checkpoint_script(bookmark, {parent, 2}, restored, &events));
    relocated_leaf[1].b = 20;
    assert(!gbs::restore_checkpoint_script(bookmark, {parent, 2}, restored, &events));

    gbs::UniversalSaveData data {};
    gbs::CheckpointPayloadWriter writer(data);
    assert(gbs::write_checkpoint_script(writer, bookmark));
    assert(data.payload_size == 14 + 2 * sizeof(gbs::CheckpointScriptCall));
    const auto nested_size = data.payload_size;
    for (int index = 0; index < 16; ++index)
        assert(gbs::write_checkpoint_script(writer, gbs::CheckpointScript {}));
    assert(data.payload_size == nested_size + 16 * 14);
    gbs::CheckpointPayloadReader reader(data);
    gbs::CheckpointScript read {};
    assert(gbs::read_checkpoint_script(reader, read));
    assert(read.call_depth == bookmark.call_depth && read.calls[1].script_hash == bookmark.calls[1].script_hash);
    for (int index = 0; index < 16; ++index) assert(gbs::read_checkpoint_script(reader, read));
    assert(reader.complete());
    --data.payload_size;
    gbs::CheckpointPayloadReader truncated(data);
    assert(gbs::read_checkpoint_script(truncated, read));
    for (int index = 0; index < 15; ++index) assert(gbs::read_checkpoint_script(truncated, read));
    assert(!gbs::read_checkpoint_script(truncated, read));
}

int main() {
    test_legacy_record_read_is_transactional();
    test_nested_script_checkpoint_resumes_all_callers_once();
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::AddVariable, 0, 7, 0 },
        { gbs::EventOp::SaveGame, 0, 0, 0 },
        { gbs::EventOp::AddVariable, 0, 9, 0 }
    };
    const gbs::EventScript script { commands, 3 };
    gbs::EventState events {};
    gbs::init_event_state(events);
    gbs::EventRunner runner {};
    gbs::start_event_runner(runner, script);
    assert(gbs::update_checkpoint_event_runner(runner, events));
    assert(events.variables[0] == 7);
    assert(events.save_request == 1 && runner.command_index == 2);
    const auto bookmark = gbs::capture_checkpoint_script(runner, 4, events);
    gbs::EventRunner restored {};
    assert(gbs::restore_checkpoint_script(bookmark, script, restored));
    events.save_request = 0;
    assert(!gbs::update_checkpoint_event_runner(restored, events));
    assert(events.variables[0] == 16); // The first reward never runs twice.
    auto invalid = bookmark;
    invalid.command_index = 99;
    assert(!gbs::restore_checkpoint_script(invalid, script, restored));
    invalid = bookmark;
    invalid.script_hash ^= 1;
    assert(!gbs::restore_checkpoint_script(invalid, script, restored));

    gbs::UniversalSaveData data {};
    gbs::CheckpointPayloadWriter writer(data);
    const uint32_t value = 123456;
    assert(writer.write(value));
    uint8_t remaining[gbs::universal_save_payload_capacity - sizeof(value)] = {};
    assert(writer.write_bytes(remaining, sizeof(remaining)));
    const auto size = data.payload_size;
    assert(!writer.write(value));
    assert(data.payload_size == size); // Overflow cannot truncate a save silently.
    gbs::CheckpointPayloadReader reader(data);
    uint32_t read = 0;
    assert(reader.read(read) && read == value);
    assert(reader.read_bytes(remaining, sizeof(remaining)) && reader.complete());
    assert(!reader.read(read));

    events.button_bindings[0] = {gbs::ButtonR, 3, true};
    events.button_binding_count = 1;
    events.timer_bindings[0] = {4, 90, 17};
    events.timer_binding_count = 1;
    events.script_locks[127] = true;
    gbs::CheckpointPayloadWriter events_writer(data);
    assert(gbs::write_checkpoint_events(events_writer, gbs::capture_checkpoint_events(events)));
    gbs::CheckpointPayloadReader events_reader(data);
    gbs::CheckpointEvents saved_events {};
    assert(gbs::read_checkpoint_events(events_reader, saved_events) && events_reader.complete());
    gbs::EventState rebound {};
    gbs::init_event_state(rebound);
    assert(gbs::restore_checkpoint_events(saved_events, rebound));
    assert(rebound.button_binding_count == 1 && rebound.button_bindings[0].override_default);
    assert(rebound.timer_bindings[0].remaining_frames == 17 && rebound.script_locks[127]);
    saved_events.timer_count = 9;
    assert(!gbs::restore_checkpoint_events(saved_events, rebound));

    events.variables[63] = 1234;
    events.inventory[15] = 8;
    events.equipped_items[7] = 3;
    std::strcpy(events.text_variables[0], "Nara");
    assert(gbs::capture_runtime_checkpoint(data, gbs::UniversalSaveRuntime::BattleRpg,
        2, 10, 20, events, &value, sizeof(value), 60));
    gbs::EventState loaded {};
    gbs::init_event_state(loaded);
    assert(gbs::restore_suspended_common_state(data, loaded));
    assert(loaded.variables[63] == 1234 && loaded.inventory[15] == 8);
    assert(loaded.equipped_items[7] == 3 && std::strcmp(loaded.text_variables[0], "Nara") == 0);
    test_failed_save_preserves_the_previous_checkpoint_and_cross_family_load();
}
