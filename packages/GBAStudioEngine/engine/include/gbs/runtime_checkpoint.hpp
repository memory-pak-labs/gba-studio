#pragma once

#include "gbs/dialogue.hpp"
#include "gbs/runtime.hpp"

namespace gbs {

inline void checkpoint_copy_bytes(void* destination, const void* source, size_t size) {
    auto* target = static_cast<uint8_t*>(destination);
    const auto* input = static_cast<const uint8_t*>(source);
    for (size_t index = 0; index < size; ++index) target[index] = input[index];
}

inline constexpr DialogueLine checkpoint_failure_dialogue {
    "FALHA AO SALVAR. CHECKPOINT ANTERIOR MANTIDO.", nullptr, nullptr, nullptr, "gbs:checkpoint:error"
};

inline bool checkpoint_dialogue_is_feedback(const DialogueState& dialogue) {
    return dialogue.visible && dialogue.key == checkpoint_failure_dialogue.key;
}

inline void show_checkpoint_save_failure(DialogueState& dialogue) {
    show_dialogue(dialogue, &checkpoint_failure_dialogue, 1, 0);
    set_dialogue_text_speed(dialogue, 0);
}

// Persist indices and command contents, never addresses from an overlay/ROM.
struct CheckpointScript {
    int32_t script_index = -1;
    uint32_t command_index = 0;
    uint32_t script_hash = 0;
    bool active = false;
};

inline uint32_t checkpoint_script_hash(EventScript script) {
    uint32_t hash = 2166136261u;
    for (size_t index = 0; index < script.command_count; ++index) {
        const EventCommand& command = script.commands[index];
        const uint16_t values[] = { static_cast<uint16_t>(command.op),
            static_cast<uint16_t>(command.a), static_cast<uint16_t>(command.b),
            static_cast<uint16_t>(command.c), static_cast<uint16_t>(command.d) };
        for (uint16_t value : values) {
            hash = (hash ^ (value & 255u)) * 16777619u;
            hash = (hash ^ (value >> 8)) * 16777619u;
        }
    }
    return hash;
}

inline CheckpointScript capture_checkpoint_script(const EventRunner& runner, int script_index) {
    return { script_index, static_cast<uint32_t>(runner.command_index),
        has_event_script(runner.script) ? checkpoint_script_hash(runner.script) : 0,
        runner.active };
}

inline bool restore_checkpoint_script(const CheckpointScript& saved, EventScript script, EventRunner& runner) {
    if (saved.script_index < 0) {
        if (saved.active || saved.command_index != 0 || saved.script_hash != 0) return false;
        init_event_runner(runner);
        return true;
    }
    if (!has_event_script(script) || saved.command_index > script.command_count ||
        (saved.active && saved.command_index >= script.command_count) ||
        saved.script_hash != checkpoint_script_hash(script)) return false;
    start_event_runner(runner, script);
    runner.command_index = saved.command_index;
    runner.active = saved.active;
    return true;
}

// Preserve the usual per-frame budget and dialogue/wait yields, adding a yield
// at Save/Load/Remove so later rewards and warps cannot leak into the checkpoint.
inline bool update_checkpoint_event_runner(EventRunner& runner, EventState& state) {
    const size_t original_budget = runner.step_budget;
    const size_t budget = original_budget > 0 ? original_budget : runner.script.command_count * 8 + 8;
    runner.step_budget = 1;
    for (size_t step = 0; step < budget && runner.active; ++step) {
        const size_t previous_index = runner.command_index;
        update_event_runner(runner, state);
        if (state.save_request != 0 || state.last_dialogue >= 0 || state.last_choice_group >= 0 ||
            state.wait_frames > 0 || runner.command_index == previous_index) break;
    }
    runner.step_budget = original_budget;
    return runner.active;
}

struct CheckpointDialogue {
    int32_t line_index = -1;
    int32_t page_index = 0;
    int32_t visible_char_count = 0;
    int32_t selected_choice = 0;
    int32_t text_speed_frames = 0;
    int32_t frame_index = 0;
    bool visible = false;
    bool choice_mode = false;
};

inline CheckpointDialogue capture_checkpoint_dialogue(const DialogueState& dialogue) {
    return { dialogue.line_index, dialogue.page_index, dialogue.visible_char_count,
        dialogue.selected_choice, dialogue.text_speed_frames, dialogue.frame_index,
        dialogue.visible, dialogue.choice_mode };
}

inline bool valid_checkpoint_dialogue(const CheckpointDialogue& saved, size_t line_count) {
    return (!saved.visible || (saved.line_index >= 0 && static_cast<size_t>(saved.line_index) < line_count)) &&
        saved.page_index >= 0 && saved.visible_char_count >= 0 &&
        saved.text_speed_frames >= 0 && saved.text_speed_frames <= 10 && saved.selected_choice >= 0;
}

inline bool restore_checkpoint_dialogue(const CheckpointDialogue& saved, DialogueState& dialogue,
    const DialogueLine* lines, size_t line_count, const DialogueChoice* choices = nullptr, size_t choice_count = 0) {
    if (!valid_checkpoint_dialogue(saved, line_count) ||
        (saved.visible && saved.choice_mode && (choices == nullptr ||
            static_cast<size_t>(saved.selected_choice) >= choice_count))) return false;
    init_dialogue(dialogue);
    if (!saved.visible) return true;
    if (saved.choice_mode) show_dialogue_choices(dialogue, lines, line_count, saved.line_index, choices, choice_count);
    else show_dialogue(dialogue, lines, line_count, saved.line_index);
    set_dialogue_text_speed(dialogue, 0);
    // Advance pages through the public API so localized text is rebuilt.
    while (dialogue.page_index < saved.page_index && dialogue.has_next_page) {
        dialogue.page_complete = true;
        advance_dialogue(dialogue, InputState { ButtonA, ButtonA, 0 });
    }
    if (dialogue.page_index != saved.page_index) return false;
    dialogue.selected_choice = saved.selected_choice;
    if (!saved.choice_mode) {
        if (saved.visible_char_count > dialogue.page_char_count) return false;
        set_dialogue_text_speed(dialogue, 1);
        for (int index = 0; index < saved.visible_char_count; ++index) update_dialogue(dialogue);
    }
    dialogue.text_speed_frames = saved.text_speed_frames;
    set_dialogue_frame(dialogue, saved.frame_index);
    return true;
}

struct CheckpointEvents {
    uint32_t frame_counter = 0;
    uint32_t random_seed = 1;
    int32_t player_direction = 0;
    uint8_t button_count = 0;
    uint8_t timer_count = 0;
    uint8_t script_locks[max_event_script_locks / 8] = {};
    EventButtonBinding buttons[max_event_button_bindings] = {};
    EventTimerBinding timers[max_event_timer_bindings] = {};
};

inline CheckpointEvents capture_checkpoint_events(const EventState& events) {
    CheckpointEvents saved {};
    saved.frame_counter = events.event_frame_counter;
    saved.random_seed = events.random_seed;
    saved.player_direction = events.player_direction;
    saved.button_count = static_cast<uint8_t>(events.button_binding_count);
    saved.timer_count = static_cast<uint8_t>(events.timer_binding_count);
    checkpoint_copy_bytes(saved.buttons, events.button_bindings, sizeof(saved.buttons));
    checkpoint_copy_bytes(saved.timers, events.timer_bindings, sizeof(saved.timers));
    for (size_t index = 0; index < max_event_script_locks; ++index)
        if (events.script_locks[index]) saved.script_locks[index / 8] |= 1u << (index % 8);
    return saved;
}

inline bool restore_checkpoint_events(const CheckpointEvents& saved, EventState& events) {
    if (saved.button_count > max_event_button_bindings || saved.timer_count > max_event_timer_bindings) return false;
    for (size_t index = 0; index < saved.timer_count; ++index)
        if (saved.timers[index].frames <= 0 || saved.timers[index].remaining_frames < 0) return false;
    events.event_frame_counter = saved.frame_counter;
    events.random_seed = saved.random_seed;
    events.player_direction = saved.player_direction;
    events.button_binding_count = saved.button_count;
    events.timer_binding_count = saved.timer_count;
    checkpoint_copy_bytes(events.button_bindings, saved.buttons, sizeof(saved.buttons));
    checkpoint_copy_bytes(events.timer_bindings, saved.timers, sizeof(saved.timers));
    for (size_t index = 0; index < max_event_script_locks; ++index)
        events.script_locks[index] = (saved.script_locks[index / 8] & (1u << (index % 8))) != 0;
    const auto* service = active_runtime_save_service();
    for (size_t index = 0; index < max_event_save_slots; ++index)
        events.save_slot_exists[index] = service != nullptr && index < service->bank.slot_count &&
            inspect_save_slot(service->bank, index).status == SaveStatus::Ok;
    return true;
}

class CheckpointPayloadWriter {
    UniversalSaveData& data;
public:
    explicit CheckpointPayloadWriter(UniversalSaveData& target) : data(target) { data.payload_size = 0; }
    bool write_bytes(const void* source, size_t size) {
        if (size > universal_save_payload_capacity - data.payload_size) return false;
        checkpoint_copy_bytes(data.payload + data.payload_size, source, size);
        data.payload_size = static_cast<uint16_t>(data.payload_size + size);
        return true;
    }
    template<typename T> bool write(const T& value) { return write_bytes(&value, sizeof(value)); }
};

class CheckpointPayloadReader {
    const UniversalSaveData& data;
    size_t offset = 0;
public:
    explicit CheckpointPayloadReader(const UniversalSaveData& source) : data(source) {}
    bool read_bytes(void* target, size_t size) {
        if (data.payload_size > universal_save_payload_capacity || offset > data.payload_size ||
            size > data.payload_size - offset) return false;
        checkpoint_copy_bytes(target, data.payload + offset, size);
        offset += size;
        return true;
    }
    template<typename T> bool read(T& value) { return read_bytes(&value, sizeof(value)); }
    bool complete() const { return offset == data.payload_size; }
};

// Shmup needs room for moving actors/projectiles. Store only active bindings.
inline bool write_checkpoint_events(CheckpointPayloadWriter& writer, const CheckpointEvents& events) {
    return events.button_count <= max_event_button_bindings && events.timer_count <= max_event_timer_bindings &&
        writer.write(events.frame_counter) && writer.write(events.random_seed) &&
        writer.write(events.player_direction) &&
        writer.write(events.button_count) && writer.write(events.timer_count) &&
        writer.write_bytes(events.script_locks, sizeof(events.script_locks)) &&
        writer.write_bytes(events.buttons, events.button_count * sizeof(EventButtonBinding)) &&
        writer.write_bytes(events.timers, events.timer_count * sizeof(EventTimerBinding));
}

inline bool read_checkpoint_events(CheckpointPayloadReader& reader, CheckpointEvents& events) {
    events = CheckpointEvents {};
    return reader.read(events.frame_counter) && reader.read(events.random_seed) &&
        reader.read(events.player_direction) &&
        reader.read(events.button_count) && reader.read(events.timer_count) &&
        events.button_count <= max_event_button_bindings && events.timer_count <= max_event_timer_bindings &&
        reader.read_bytes(events.script_locks, sizeof(events.script_locks)) &&
        reader.read_bytes(events.buttons, events.button_count * sizeof(EventButtonBinding)) &&
        reader.read_bytes(events.timers, events.timer_count * sizeof(EventTimerBinding));
}

inline bool capture_runtime_checkpoint(UniversalSaveData& data, UniversalSaveRuntime runtime, int room,
    int player_x, int player_y, const EventState& events, const void* payload, size_t size, uint32_t frames) {
    if (size > universal_save_payload_capacity) return false;
    uint8_t copy[universal_save_payload_capacity];
    checkpoint_copy_bytes(copy, payload, size); // Payload may already be in data.payload.
    return make_universal_save_data(data, runtime, room, player_x, player_y, 0, 0,
        events.variables, event_variable_count, events.inventory, max_event_inventory_items,
        events.equipped_items, max_event_equipment_slots, frames, 0, copy, size,
        events.text_variables, text_variable_count);
}

inline SaveStatus consume_checkpoint_request(EventState& events, const UniversalSaveData& data,
    bool captured, const char* title, RuntimeKind runtime) {
    const int request = events.save_request;
    const int slot = events.save_request_slot;
    events.save_request = 0;
    events.save_request_slot = -1;
    RuntimeSaveService* service = active_runtime_save_service();
    if (service == nullptr || !runtime_save_service_enabled(*service)) return SaveStatus::UnsupportedDevice;
    SaveStatus status = SaveStatus::InvalidData;
    if (request == 1 && captured) {
        status = write_runtime_save(*service, slot, data,
            make_save_metadata(title, data.play_time_frames, service->next_sequence,
                static_cast<uint16_t>(data.room_index), data.flags));
    }
    else if (request == 2) status = request_universal_save_restore(service->bank, slot,
        active_runtime_availability() != 0 ? active_runtime_availability() : runtime_availability(runtime))
        ? SaveStatus::Ok : SaveStatus::InvalidData;
    else if (request == 3) status = clear_runtime_save(*service, slot);
    if (slot >= 0 && static_cast<size_t>(slot) < max_event_save_slots)
        events.save_slot_exists[slot] = inspect_save_slot(service->bank, slot).status == SaveStatus::Ok;
    return status;
}

} // namespace gbs
