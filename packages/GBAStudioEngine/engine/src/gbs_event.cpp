#include "gbs/event.hpp"
#include "gbs/runtime.hpp"
#include "gbs/assets.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/link.hpp"
#include "gbs/rumble.hpp"

namespace gbs {

namespace {

enum class RuntimeTransitionMode {
    Warp,
    SaveRestore
};

struct RuntimeTransitionState {
    bool pending;
    int cover_wait_frames;
    RuntimeTransitionMode mode;
    gbs::RuntimeKind target;
    int room;
    int player_x;
    int player_y;
    int save_slot_index;
    bool deferred_fade_in;
    int deferred_fade_frames;
    bool deferred_visual_effect;
    int deferred_visual_effect_kind;
    int deferred_visual_effect_target;
    int deferred_visual_effect_frames;
    int deferred_visual_effect_intensity;
    int deferred_visual_effect_phase;
    gbs::EventState event_state;
};

#if defined(__arm__) || defined(__thumb__)
#define GBS_EVENT_EWRAM __attribute__((section(".ewram_bss")))
#else
#define GBS_EVENT_EWRAM
#endif

RuntimeTransitionState runtime_transition GBS_EVENT_EWRAM {};

#undef GBS_EVENT_EWRAM

void request_runtime_transition(
    const gbs::EventState& state,
    int packed_target,
    int player_x,
    int player_y
) {
    const uint16_t encoded_target = static_cast<uint16_t>(packed_target);
    const int runtime_value = (encoded_target >> 12) & 0xF;
    const int room = encoded_target & 0x0FFF;
    if (runtime_value < static_cast<int>(gbs::RuntimeKind::TopDown) ||
        runtime_value > static_cast<int>(gbs::RuntimeKind::Luta)) {
        return;
    }
    runtime_transition.pending = true;
    runtime_transition.mode = RuntimeTransitionMode::Warp;
    runtime_transition.target = static_cast<gbs::RuntimeKind>(runtime_value);
    runtime_transition.room = room;
    runtime_transition.player_x = player_x;
    runtime_transition.player_y = player_y;
    runtime_transition.save_slot_index = -1;
    runtime_transition.deferred_fade_in = false;
    runtime_transition.deferred_fade_frames = 0;
    runtime_transition.deferred_visual_effect = false;
    runtime_transition.deferred_visual_effect_kind = static_cast<int>(gbs::VisualEffectKind::Clear);
    runtime_transition.deferred_visual_effect_target = static_cast<int>(gbs::VisualEffectTarget::All);
    runtime_transition.deferred_visual_effect_frames = 0;
    runtime_transition.deferred_visual_effect_intensity = 0;
    runtime_transition.deferred_visual_effect_phase = 0;
    runtime_transition.event_state = state;
    // Synchronous scripts accumulate Wait instead of yielding. Keep the source
    // runtime alive while its cover is drawn, as queued scripts already do.
    runtime_transition.cover_wait_frames = state.visual_effect_phase == 1
        ? state.wait_frames : 0;
    if (runtime_transition.cover_wait_frames > 0) runtime_transition.event_state.wait_frames = 0;
}

enum class EventStepResult {
    Continue,
    Stop,
    Pause
};

bool jump_relative(size_t& index, int16_t offset, size_t count) {
    if (offset == 0) {
        return false;
    }

    int target = static_cast<int>(index) + offset;
    if (target < 0 || static_cast<size_t>(target) >= count) {
        return false;
    }

    index = static_cast<size_t>(target);
    return true;
}

int clamp_int(int value, int minimum, int maximum) {
    if (value < minimum) {
        return minimum;
    }
    if (value > maximum) {
        return maximum;
    }
    return value;
}

bool read_runtime_rtc_field(int encoded_field, int& value) {
    if (encoded_field < static_cast<int>(RtcField::Year) ||
        encoded_field > static_cast<int>(RtcField::Second)) {
        return false;
    }
    RtcDateTime date_time {};
    return runtime_read_rtc_datetime(date_time) &&
        rtc_field_value(date_time, static_cast<RtcField>(encoded_field), value);
}

bool is_valid_inventory_item(int index) {
    return index >= 0 && static_cast<size_t>(index) < max_event_inventory_items;
}

bool is_valid_actor_state_slot(int index) {
    return index >= 0 && static_cast<size_t>(index) < max_event_actor_state_slots;
}

bool is_valid_actor_condition_index(int index) {
    return index == event_player_actor_index || is_valid_actor_state_slot(index);
}

int actor_condition_x(const EventState& state, int index) {
    return index == event_player_actor_index ? state.player_x : state.actor_x[index];
}

int actor_condition_y(const EventState& state, int index) {
    return index == event_player_actor_index ? state.player_y : state.actor_y[index];
}

int actor_condition_direction(const EventState& state, int index) {
    return index == event_player_actor_index ? state.player_direction : state.actor_direction[index];
}

int actor_condition_tile_size(const EventState& state) {
    return state.actor_condition_tile_size > 0 ? state.actor_condition_tile_size : 1;
}

bool is_valid_button_mask(int button) {
    return button > 0 && button <= 0x3FF;
}

bool is_valid_rate_limit_slot(int slot) {
    return slot >= 0 && static_cast<size_t>(slot) < max_event_rate_limit_slots;
}

bool is_valid_save_slot_index(int slot) {
    return slot >= 0 && static_cast<size_t>(slot) < max_event_save_slots;
}

bool is_valid_projectile_slot_index(int slot) {
    return slot >= 0 && static_cast<size_t>(slot) < max_event_projectile_slots;
}

bool is_valid_segment_index(int segment_index) {
    return segment_index >= 0 && static_cast<size_t>(segment_index) < max_event_segments;
}

bool is_valid_platform_callback_index(int callback_index) {
    return callback_index >= 0 && static_cast<size_t>(callback_index) < max_event_platform_callbacks;
}

bool is_valid_adventure_callback_index(int callback_index) {
    return callback_index >= 0 && static_cast<size_t>(callback_index) < max_event_adventure_callbacks;
}

bool is_valid_scene_type_index(int scene_type_index) {
    return scene_type_index >= 0 && static_cast<size_t>(scene_type_index) < max_event_scene_types;
}

void push_scene_stack(EventState& state, RuntimeKind runtime) {
    if (state.current_room < 0) {
        return;
    }
    const EventSceneStackEntry entry {
        runtime,
        state.current_room,
        state.player_x,
        state.player_y,
        state.player_direction
    };
    if (state.scene_stack_count < max_event_scene_stack_entries) {
        state.scene_stack[state.scene_stack_count++] = entry;
        return;
    }
    for (size_t index = 1; index < max_event_scene_stack_entries; ++index) {
        state.scene_stack[index - 1] = state.scene_stack[index];
    }
    state.scene_stack[max_event_scene_stack_entries - 1] = entry;
}

void clear_scene_stack(EventState& state) {
    for (size_t index = 0; index < max_event_scene_stack_entries; ++index) {
        state.scene_stack[index] = EventSceneStackEntry { RuntimeKind::TopDown, -1, 0, 0, 0 };
    }
    state.scene_stack_count = 0;
}

bool pop_previous_scene(EventState& state, EventSceneStackEntry& entry) {
    if (state.scene_stack_count == 0) {
        return false;
    }
    entry = state.scene_stack[state.scene_stack_count - 1];
    state.scene_stack[--state.scene_stack_count] = EventSceneStackEntry { RuntimeKind::TopDown, -1, 0, 0, 0 };
    return entry.room >= 0;
}

bool pop_first_scene(EventState& state, EventSceneStackEntry& entry) {
    if (state.scene_stack_count == 0) {
        return false;
    }
    entry = state.scene_stack[0];
    clear_scene_stack(state);
    return entry.room >= 0;
}

void restore_scene_stack_entry(EventState& state, const EventSceneStackEntry& entry, RuntimeKind current_runtime) {
    state.current_room = entry.room;
    state.player_x = entry.player_x;
    state.player_y = entry.player_y;
    state.player_direction = entry.player_direction;
    if (entry.runtime != current_runtime) {
        const int packed_target = (static_cast<int>(entry.runtime) << 12) | (entry.room & 0x0FFF);
        request_runtime_transition(state, packed_target, entry.player_x, entry.player_y);
    }
}

int packed_low_byte(int value) {
    return value & 0xFF;
}

int packed_high_byte_signed(int value) {
    int high = (value >> 8) & 0xFF;
    if (high >= 128) {
        high -= 256;
    }
    return high;
}

int packed_tile_x(int value) {
    return (value & 0x3F) | ((static_cast<uint16_t>(value) >> 6) & 0xC0);
}

int packed_tile_y(int value) {
    return ((static_cast<uint16_t>(value) >> 6) & 0x3F) | ((static_cast<uint16_t>(value) >> 8) & 0xC0);
}

int absolute_value(int value) {
    return value < 0 ? -value : value;
}

bool actor_relative_matches(const EventState& state, int actor, int other_actor, int relation) {
    const int dx = actor_condition_x(state, actor) - actor_condition_x(state, other_actor);
    const int dy = actor_condition_y(state, actor) - actor_condition_y(state, other_actor);
    switch (relation) {
    case 0:
        return dy > 0;
    case 1:
        return dy < 0;
    case 2:
        return dx < 0;
    case 3:
        return dx > 0;
    case 4:
        return dx < 0 && dy > 0;
    case 5:
        return dx > 0 && dy > 0;
    case 6:
        return dx < 0 && dy < 0;
    case 7:
        return dx > 0 && dy < 0;
    default:
        return false;
    }
}

void push_actor_command(
    gbs::EventState& state,
    gbs::EventActorOp op,
    int actor_index,
    int a,
    int b,
    int c = 0,
    int d = 0
);

void push_actor_away_from_player(EventState& state, int actor_index, int tiles) {
    if (!is_valid_actor_state_slot(actor_index)) {
        return;
    }

    const int distance_pixels = (tiles > 0 ? tiles : 1) * 8;
    switch (state.player_direction) {
    case 1:
        push_actor_command(state, EventActorOp::Push, actor_index, 0, -distance_pixels);
        break;
    case 2:
        push_actor_command(state, EventActorOp::Push, actor_index, -distance_pixels, 0);
        break;
    case 3:
        push_actor_command(state, EventActorOp::Push, actor_index, distance_pixels, 0);
        break;
    default:
        push_actor_command(state, EventActorOp::Push, actor_index, 0, distance_pixels);
        break;
    }
}

int random_range(EventState& state, int minimum, int maximum) {
    const int low = maximum >= minimum ? minimum : maximum;
    const int high = maximum >= minimum ? maximum : minimum;
    const int span = high - low + 1;
    state.random_seed = state.random_seed * 1103515245u + 12345u;
    return low + static_cast<int>((state.random_seed >> 16) % static_cast<uint32_t>(span > 0 ? span : 1));
}

int engine_field_value(const EventState& state, int field) {
    switch (field) {
    case 0:
        return state.current_room;
    case 1:
        return state.camera_x;
    case 2:
        return state.camera_y;
    case 3:
        return state.player_x;
    case 4:
        return state.player_y;
    case 5:
        return state.platformer_blank_gravity;
    default:
        return 0;
    }
}

void set_engine_field_value(EventState& state, int field, int value) {
    switch (field) {
    case 0:
        state.current_room = value;
        break;
    case 1:
        state.camera_x = value;
        break;
    case 2:
        state.camera_y = value;
        break;
    case 3:
        state.player_x = value;
        break;
    case 4:
        state.player_y = value;
        break;
    case 5:
        state.platformer_blank_gravity = value;
        break;
    default:
        break;
    }
}

void push_actor_command(
    gbs::EventState& state,
    gbs::EventActorOp op,
    int actor_index,
    int a,
    int b,
    int c,
    int d
) {
    if (state.actor_command_count >= gbs::max_event_actor_commands) {
        return;
    }

    state.actor_commands[state.actor_command_count] = gbs::EventActorCommand {
        op,
        actor_index,
        a,
        b,
        c,
        d
    };
    ++state.actor_command_count;
}

int event_signed_byte(int value, int shift) {
    int byte = (value >> shift) & 0xFF;
    return byte >= 128 ? byte - 256 : byte;
}

int event_unsigned_byte(int value, int shift) {
    return (value >> shift) & 0xFF;
}

void push_tile_command(
    gbs::EventState& state,
    int packed_location,
    int tile,
    int count,
    int tile_asset = -1
) {
    if (state.tile_command_count >= gbs::max_event_tile_commands) {
        return;
    }

    state.tile_commands[state.tile_command_count] = gbs::EventTileCommand {
        (packed_location >> 12) & 0x3,
        packed_location & 0x3F,
        (packed_location >> 6) & 0x3F,
        tile,
        clamp_int(count, 1, 64),
        tile_asset
    };
    ++state.tile_command_count;
}

void attach_button_binding(EventState& state, int button, int script, bool override_default) {
    if (!is_valid_button_mask(button) || script < 0) {
        return;
    }
    for (size_t index = 0; index < state.button_binding_count; ++index) {
        if (state.button_bindings[index].button == static_cast<uint16_t>(button)) {
            state.button_bindings[index].script = script;
            state.button_bindings[index].override_default = override_default;
            return;
        }
    }
    if (state.button_binding_count >= max_event_button_bindings) {
        return;
    }
    state.button_bindings[state.button_binding_count] = EventButtonBinding {
        static_cast<uint16_t>(button),
        script,
        override_default
    };
    ++state.button_binding_count;
}

void attach_platform_callback(EventState& state, int callback_index, int script) {
    if (!is_valid_platform_callback_index(callback_index) || script < 0) {
        return;
    }
    state.platform_callback_scripts[callback_index] = script;
}

void remove_platform_callback(EventState& state, int callback_index) {
    if (!is_valid_platform_callback_index(callback_index)) {
        return;
    }
    state.platform_callback_scripts[callback_index] = -1;
}

void attach_adventure_callback(EventState& state, int callback_index, int script) {
    if (!is_valid_adventure_callback_index(callback_index) || script < 0) {
        return;
    }
    state.adventure_callback_scripts[callback_index] = script;
}

void remove_adventure_callback(EventState& state, int callback_index) {
    if (!is_valid_adventure_callback_index(callback_index)) {
        return;
    }
    state.adventure_callback_scripts[callback_index] = -1;
}

void remove_button_binding(EventState& state, int button) {
    if (!is_valid_button_mask(button)) {
        return;
    }
    for (size_t index = 0; index < state.button_binding_count; ++index) {
        if (state.button_bindings[index].button != static_cast<uint16_t>(button)) {
            continue;
        }
        for (size_t move_index = index + 1; move_index < state.button_binding_count; ++move_index) {
            state.button_bindings[move_index - 1] = state.button_bindings[move_index];
        }
        --state.button_binding_count;
        state.button_bindings[state.button_binding_count] = EventButtonBinding { 0, -1, false };
        return;
    }
}

void attach_timer_binding(EventState& state, int frames, int script) {
    if (frames <= 0 || script < 0) {
        return;
    }
    for (size_t index = 0; index < state.timer_binding_count; ++index) {
        if (state.timer_bindings[index].script == script) {
            state.timer_bindings[index].frames = frames;
            state.timer_bindings[index].remaining_frames = frames;
            return;
        }
    }
    if (state.timer_binding_count >= max_event_timer_bindings) {
        return;
    }
    state.timer_bindings[state.timer_binding_count] = EventTimerBinding {
        script,
        frames,
        frames
    };
    ++state.timer_binding_count;
}

void restart_timer_binding(EventState& state, int script) {
    if (script < 0) {
        return;
    }
    for (size_t index = 0; index < state.timer_binding_count; ++index) {
        if (state.timer_bindings[index].script == script) {
            state.timer_bindings[index].remaining_frames = state.timer_bindings[index].frames;
            return;
        }
    }
}

void remove_timer_binding(EventState& state, int script) {
    if (script < 0) {
        return;
    }
    for (size_t index = 0; index < state.timer_binding_count; ++index) {
        if (state.timer_bindings[index].script != script) {
            continue;
        }
        for (size_t move_index = index + 1; move_index < state.timer_binding_count; ++move_index) {
            state.timer_bindings[move_index - 1] = state.timer_bindings[move_index];
        }
        --state.timer_binding_count;
        state.timer_bindings[state.timer_binding_count] = EventTimerBinding { -1, 0, 0 };
        return;
    }
}

bool rate_limit_passed(EventState& state, int slot, int frames) {
    if (!is_valid_rate_limit_slot(slot)) {
        return true;
    }
    const int frame_interval = frames > 0 ? frames : 1;
    const bool passed = !state.rate_limit_has_run[slot] ||
        state.event_frame_counter - state.rate_limit_last_frame[slot] >= frame_interval;
    if (passed) {
        state.rate_limit_has_run[slot] = true;
        state.rate_limit_last_frame[slot] = state.event_frame_counter;
    }
    return passed;
}

EventStepResult execute_event_command(
    EventState& state,
    const EventCommand& command,
    size_t& index,
    size_t count,
    bool pause_on_wait
) {
    switch (command.op) {
    case EventOp::End:
        return EventStepResult::Stop;
    case EventOp::ShowDialogue:
        state.last_dialogue = command.a;
        if (pause_on_wait) {
            ++index;
            return EventStepResult::Pause;
        }
        break;
    case EventOp::Warp:
        state.current_room = command.a;
        state.player_x = command.b;
        state.player_y = command.c;
        break;
    case EventOp::WarpRuntime:
        request_runtime_transition(state, command.a, command.b, command.c);
        break;
    case EventOp::SetPlayerDirection:
        state.player_direction = clamp_int(command.a, 0, 7);
        break;
    case EventOp::SetVariable:
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] = command.b;
        }
        break;
    case EventOp::PlaySfx:
        state.last_sfx = command.a;
        break;
    case EventOp::PlayPcmSfx:
        state.last_pcm_sfx = command.a;
        state.last_pcm_sfx_volume = clamp_int(command.b, 0, 15);
        state.last_pcm_sfx_priority = clamp_int(command.c, 0, 255);
        break;
    case EventOp::ClearVariable:
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] = 0;
        }
        break;
    case EventOp::AddVariable:
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] += command.b;
        }
        break;
    case EventOp::MultiplyVariable:
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] *= command.b;
        }
        break;
    case EventOp::DivideVariable:
        if (is_valid_event_variable(command.a) && command.b != 0) {
            state.variables[command.a] /= command.b;
        }
        break;
    case EventOp::ModuloVariable:
        if (is_valid_event_variable(command.a) && command.b != 0) {
            state.variables[command.a] %= command.b;
        }
        break;
    case EventOp::AddVariableFlags:
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] |= command.b;
        }
        break;
    case EventOp::SetVariableFlags:
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] = command.b;
        }
        break;
    case EventOp::ClearVariableFlags:
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] &= ~command.b;
        }
        break;
    case EventOp::ResetVariablesFalse:
        for (int& variable : state.variables) {
            variable = 0;
        }
        break;
    case EventOp::RandomVariable:
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] = random_range(state, command.b, command.c);
        }
        break;
    case EventOp::SetRandomSeed:
        if (is_valid_event_variable(command.a)) {
            const int seed = state.variables[command.a];
            state.random_seed = static_cast<uint32_t>(seed != 0 ? seed : 1);
        }
        break;
    case EventOp::SeedRandom: {
        const uint32_t frame_entropy = static_cast<uint32_t>(state.event_frame_counter + 1) * 747796405u;
        const uint32_t input_entropy = static_cast<uint32_t>(state.input_held) |
            (static_cast<uint32_t>(state.input_pressed) << 16);
        state.random_seed = (state.random_seed ^ frame_entropy ^ input_entropy) * 2891336453u + 1u;
        if (state.random_seed == 0) state.random_seed = 1;
        break;
    }
    case EventOp::RateLimit:
        if (!rate_limit_passed(state, command.a, command.b)) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::SaveGame:
        if (is_valid_save_slot_index(command.a)) {
            state.save_request = 1;
            state.save_request_slot = command.a;
        }
        break;
    case EventOp::LoadGame:
        if (is_valid_save_slot_index(command.a)) {
            state.save_request = 2;
            state.save_request_slot = command.a;
        }
        break;
    case EventOp::RemoveSaveGame:
        if (is_valid_save_slot_index(command.a)) {
            state.save_request = 3;
            state.save_request_slot = command.a;
        }
        break;
    case EventOp::SetDialogueLanguage:
        configure_dialogue_locale_id(static_cast<uint8_t>(command.a));
        break;
    case EventOp::JumpIfSaveExists:
        if (is_valid_save_slot_index(command.a) && state.save_slot_exists[command.a]) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::StoreSaveExists:
        if (is_valid_save_slot_index(command.a) && is_valid_event_variable(command.b)) {
            state.variables[command.b] = state.save_slot_exists[command.a] ? 1 : 0;
        }
        break;
    case EventOp::LutaControl:
        if (state.luta_command_count >= max_event_luta_commands) {
            return pause_on_wait ? EventStepResult::Pause : EventStepResult::Stop;
        }
        state.luta_commands[state.luta_command_count++] = command;
        if (pause_on_wait) {
            ++index;
            return EventStepResult::Pause;
        }
        break;
    case EventOp::ActorEffects:
        if (command.a >= -1 && command.a < static_cast<int>(max_event_actor_state_slots)) {
            const int slot = command.a + 1;
            state.actor_effect_kind[slot] = static_cast<uint8_t>(command.b);
            state.actor_effect_frames[slot] = command.c;
            state.actor_effect_intensity[slot] = clamp_int(command.d, 0, 100);
        }
        break;
    case EventOp::CancelActorMovement:
        push_actor_command(state, EventActorOp::CancelMovement, command.a, 0, 0);
        break;
    case EventOp::ProjectileLoadSlot:
        if (is_valid_projectile_slot_index(command.a)) {
            state.projectile_slot_loaded[command.a] = true;
            state.projectile_slot_damage[command.a] = command.b > 0 ? command.b : 1;
            state.projectile_slot_speed[command.a] = command.c > 0 ? command.c : 1;
            state.projectile_slot_sprite[command.a] = command.d;
        }
        break;
    case EventOp::LaunchProjectile:
        if (is_valid_actor_state_slot(command.a) && is_valid_projectile_slot_index(command.b)) {
            state.projectile_launch_requested = true;
            state.projectile_launch_actor = command.a;
            state.projectile_launch_slot = command.b;
            state.projectile_launch_direction = clamp_int(command.c, 0, 7);
        }
        if(pause_on_wait) { ++index;return EventStepResult::Pause; }
        break;
    case EventOp::LaunchProjectileSlot:
        if (is_valid_actor_state_slot(command.a) && is_valid_projectile_slot_index(command.b)) {
            state.projectile_launch_requested = true;
            state.projectile_launch_actor = command.a;
            state.projectile_launch_slot = command.b;
            state.projectile_launch_direction = clamp_int(command.c, 0, 7);
        }
        if(pause_on_wait) { ++index;return EventStepResult::Pause; }
        break;
    case EventOp::Jump:
        if (jump_relative(index, command.a, count)) {
            return EventStepResult::Continue;
        }
        return EventStepResult::Stop;
    case EventOp::JumpIfVariableEquals:
        if (is_valid_event_variable(command.a) && state.variables[command.a] == command.b) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfVariableNotEquals:
        if (is_valid_event_variable(command.a) && state.variables[command.a] != command.b) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfVariableSet:
        if (is_valid_event_variable(command.a) && state.variables[command.a] != 0) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfVariableGreaterThan:
        if (is_valid_event_variable(command.a) && state.variables[command.a] > command.b) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfVariableLessThan:
        if (is_valid_event_variable(command.a) && state.variables[command.a] < command.b) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfVariableEqualsVariable:
        if (is_valid_event_variable(command.a) &&
                is_valid_event_variable(command.b) &&
                state.variables[command.a] == state.variables[command.b]) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfRoomEquals:
        if (state.current_room == command.a) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::StoreEngineField:
        if (is_valid_event_variable(command.b)) {
            state.variables[command.b] = engine_field_value(state, command.a);
        }
        break;
    case EventOp::ReadRtc:
        state.rtc_read_ok = false;
        if (is_valid_event_variable(command.b)) {
            int value = 0;
            state.rtc_read_ok = read_runtime_rtc_field(command.a, value);
            if (state.rtc_read_ok) {
                state.variables[command.b] = value;
            }
        }
        break;
    case EventOp::JumpIfRtcEquals: {
        int value = 0;
        state.rtc_read_ok = read_runtime_rtc_field(command.a, value);
        if (state.rtc_read_ok && value == command.b) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    }
    case EventOp::SetEngineField:
        set_engine_field_value(state, command.a, command.b);
        break;
    case EventOp::StoreActorPosition:
        if (is_valid_actor_state_slot(command.a) &&
                is_valid_event_variable(command.b) &&
                is_valid_event_variable(command.c)) {
            state.variables[command.b] = state.actor_x[command.a];
            state.variables[command.c] = state.actor_y[command.a];
        }
        break;
    case EventOp::StoreActorDirection:
        if (is_valid_actor_state_slot(command.a) && is_valid_event_variable(command.b)) {
            state.variables[command.b] = state.actor_direction[command.a];
        }
        break;
    case EventOp::JumpIfEngineFieldEquals:
        if (engine_field_value(state, command.a) == command.b) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfEngineFieldEqualsVariable:
        if (is_valid_event_variable(command.b) && engine_field_value(state, command.a) == state.variables[command.b]) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfButtonPressed:
        if ((state.input_pressed & static_cast<uint16_t>(command.a)) != 0) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::WaitButtonPressed:
        if ((state.input_pressed & static_cast<uint16_t>(command.a)) == 0) {
            return pause_on_wait ? EventStepResult::Pause : EventStepResult::Stop;
        }
        break;
    case EventOp::WaitActorAnimation:
        if (is_valid_actor_state_slot(command.a) && state.actor_animation_playing[command.a]) {
            return pause_on_wait ? EventStepResult::Pause : EventStepResult::Stop;
        }
        break;
    case EventOp::AddInventoryItem:
        if (is_valid_inventory_item(command.a)) {
            state.inventory[command.a] = clamp_int(state.inventory[command.a] + command.b, 0, 999);
        }
        break;
    case EventOp::RemoveInventoryItem:
        if (is_valid_inventory_item(command.a)) {
            state.inventory[command.a] = clamp_int(state.inventory[command.a] - (command.b > 0 ? command.b : 1), 0, 999);
        }
        break;
    case EventOp::JumpIfInventoryAtLeast:
        if (is_valid_inventory_item(command.a) && state.inventory[command.a] >= command.b) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfActorDirection:
        if (is_valid_actor_condition_index(command.a) && actor_condition_direction(state, command.a) == command.b) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfActorAtPosition:
        if (is_valid_actor_condition_index(command.a) &&
                actor_condition_x(state, command.a) / actor_condition_tile_size(state) == packed_tile_x(command.b) &&
                actor_condition_y(state, command.a) / actor_condition_tile_size(state) == packed_tile_y(command.b)) {
            if (jump_relative(index, command.c, count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::JumpIfActorDistance:
        if (is_valid_actor_condition_index(command.a) && is_valid_actor_condition_index(command.b)) {
            const int distance = absolute_value(actor_condition_x(state, command.a) - actor_condition_x(state, command.b)) +
                absolute_value(actor_condition_y(state, command.a) - actor_condition_y(state, command.b));
            if (distance <= packed_low_byte(command.c) * actor_condition_tile_size(state)) {
                if (jump_relative(index, packed_high_byte_signed(command.c), count)) {
                    return EventStepResult::Continue;
                }
                return EventStepResult::Stop;
            }
        }
        break;
    case EventOp::JumpIfActorRelative:
        if (is_valid_actor_condition_index(command.a) &&
                is_valid_actor_condition_index(command.b) &&
                actor_relative_matches(state, command.a, command.b, packed_low_byte(command.c))) {
            if (jump_relative(index, packed_high_byte_signed(command.c), count)) {
                return EventStepResult::Continue;
            }
            return EventStepResult::Stop;
        }
        break;
    case EventOp::ShowDialogueIf:
        if (is_valid_event_variable(command.b) && state.variables[command.b] == command.c) {
            state.last_dialogue = command.a;
            if (pause_on_wait) {
                ++index;
                return EventStepResult::Pause;
            }
        }
        break;
    case EventOp::PlayMusic:
        state.last_music = command.a;
        state.last_tracker_music = -1;
        state.stop_music = false;
        break;
    case EventOp::RunAudioRoutine:
        state.last_tracker_music = command.a;
        state.last_music = -1;
        state.stop_music = false;
        break;
    case EventOp::SetDialogueTextSpeed:
        state.dialogue_text_speed_changed = true;
        state.dialogue_text_speed_frames = clamp_int(command.a, 0, 10);
        break;
    case EventOp::SetTextSfx:
        state.dialogue_text_sfx_changed = true;
        state.dialogue_text_sfx_index = command.a;
        break;
    case EventOp::SetDialogueFrame:
        state.dialogue_frame_changed = true;
        state.dialogue_frame_index = command.a < 0 ? 0 : command.a;
        break;
    case EventOp::StopMusic:
        state.stop_music = true;
        state.last_music = -1;
        state.last_tracker_music = -1;
        break;
    case EventOp::CloseDialogue:
        state.close_dialogue = true;
        break;
    case EventOp::Wait:
        if (command.a > 0) {
            state.wait_frames += command.a;
            if (pause_on_wait) {
                ++index;
                return EventStepResult::Pause;
            }
        }
        break;
    case EventOp::SetCameraPosition:
        state.camera_changed = true;
        state.camera_follow_player = false;
        state.camera_x = command.a;
        state.camera_y = command.b;
        break;
    case EventOp::FollowCamera:
        state.camera_changed = true;
        state.camera_follow_player = true;
        break;
    case EventOp::LockCamera:
        state.camera_changed = true;
        state.camera_follow_player = false;
        break;
    case EventOp::SetCameraShake:
        state.camera_shake_frames = command.a < 0 ? 0 : command.a;
        state.camera_shake_magnitude = clamp_int(command.b, 0, 8);
        break;
    case EventOp::SetCameraProperty:
        state.camera_property_changed = true;
        state.camera_property = command.a;
        state.camera_property_value = command.b;
        break;
    case EventOp::AttachButtonEvent:
        attach_button_binding(state, command.a, command.b, command.c != 0);
        break;
    case EventOp::RemoveButtonEvent:
        remove_button_binding(state, command.a);
        break;
    case EventOp::AttachTimerEvent:
        attach_timer_binding(state, command.a, command.b);
        break;
    case EventOp::RestartTimerEvent:
        restart_timer_binding(state, command.a);
        break;
    case EventOp::RemoveTimerEvent:
        remove_timer_binding(state, command.a);
        break;
    case EventOp::MoveCamera:
        state.camera_move_changed = true;
        state.camera_delta_x += command.a;
        state.camera_delta_y += command.b;
        break;
    case EventOp::SetCameraBoundsX:
        state.camera_bounds_x_changed = true;
        state.camera_bounds_min_x = command.a;
        state.camera_bounds_max_x = command.b;
        break;
    case EventOp::SetCameraBoundsY:
        state.camera_bounds_y_changed = true;
        state.camera_bounds_min_y = command.a;
        state.camera_bounds_max_y = command.b;
        break;
    case EventOp::ReplaceTile:
        push_tile_command(state, command.a, command.b, command.c);
        break;
    case EventOp::ReplaceTileSequence: {
        const int variable = command.c & 0xFF;
        const int frame_count = clamp_int((command.c >> 8) & 0xFF, 1, 255);
        const uint16_t packed_tile = static_cast<uint16_t>(command.b);
        const int base_tile = packed_tile & 0x03FF;
        const int tile_asset = static_cast<int>(packed_tile >> 10) - 1;
        if (!is_valid_event_variable(variable)) {
            break;
        }
        int tile = state.variables[variable];
        if (tile < base_tile || tile >= base_tile + frame_count) {
            tile = base_tile;
        }
        push_tile_command(state, command.a, tile, 1, tile_asset);
        state.variables[variable] = tile + 1;
        if (state.variables[variable] >= base_tile + frame_count) {
            state.variables[variable] = base_tile;
        }
        break;
    }
    case EventOp::OverlayLine:
        state.overlay_line = clamp_int(command.a, 0, 160);
        state.overlay_height = state.overlay_line;
        state.overlay_line_changed = true;
        break;
    case EventOp::OverlayShow:
        state.overlay_visible = true;
        state.overlay_x = clamp_int(command.a, 0, 240);
        state.overlay_y = clamp_int(command.b, 0, 160);
        state.overlay_width = clamp_int(((command.c >> 8) & 0xFF) * 8, 0, 240);
        state.overlay_height = clamp_int((command.c & 0xFF) * 8, 0, 160);
        state.overlay_transition_frames = 0;
        state.overlay_show_requested = true;
        state.overlay_show_x = state.overlay_x;
        state.overlay_show_y = state.overlay_y;
        state.overlay_show_width = state.overlay_width;
        state.overlay_show_height = state.overlay_height;
        break;
    case EventOp::OverlayMove:
        state.overlay_x = clamp_int(command.a, 0, 240);
        state.overlay_y = clamp_int(command.b, 0, 160);
        state.overlay_transition_frames = clamp_int(command.c, 0, 600);
        state.overlay_move_requested = true;
        break;
    case EventOp::OverlayHide:
        state.overlay_visible = false;
        state.overlay_transition_frames = clamp_int(command.a, 0, 600);
        state.overlay_hide_requested = true;
        break;
    case EventOp::SetBackground:
        if (command.a >= 0) state.background_request_index = command.a;
        break;
    case EventOp::SetBackgroundPalette:
        state.background_palette_changed = true;
        state.background_palette_index = command.a < 0 ? 0 : command.a;
        state.background_palette_frames = clamp_int(command.b, 0, 600);
        break;
    case EventOp::SetSpritePalette:
        state.sprite_palette_changed = true;
        state.sprite_palette_index = command.a < 0 ? 0 : command.a;
        state.sprite_palette_frames = clamp_int(command.b, 0, 600);
        break;
    case EventOp::MuteAudioChannel:
        state.audio_mute_changed = true;
        state.audio_mute_channel = clamp_int(command.a, 0, 4);
        state.audio_mute_enabled = command.b != 0;
        break;
    case EventOp::SetAudioVolume:
        state.audio_volume_changed = true;
        state.audio_volume_channel = clamp_int(command.a, 0, 4);
        state.audio_volume = clamp_int(command.b, 0, 15);
        break;
    case EventOp::FadeAudioVolume:
        state.audio_fade_changed = true;
        state.audio_fade_channel = clamp_int(command.a, 0, 4);
        state.audio_fade_target_volume = clamp_int(command.b, 0, 15);
        state.audio_fade_frames = clamp_int(command.c, 0, 3600);
        break;
    case EventOp::SetAllSpritesVisible:
        state.all_sprites_visible_changed = true;
        state.all_sprites_visible = command.a != 0;
        break;
    case EventOp::SetPlayerAnimation:
        state.player_animation_changed = true;
        state.player_animation_index = command.a < 0 ? 0 : command.a;
        break;
    case EventOp::PlayerBounce:
        state.player_bounce_requested = true;
        state.player_bounce_height_tiles = clamp_int(command.a, 1, 8);
        state.player_bounce_frames = clamp_int(command.b, 1, 120);
        break;
    case EventOp::LinkHost:
        state.link_request = 1;
        state.link_script = command.a < 0 ? -1 : command.a;
        state.link_timeout_frames = clamp_int(command.b, 1, 600);
        break;
    case EventOp::LinkJoin:
        state.link_request = 2;
        state.link_script = command.a < 0 ? -1 : command.a;
        state.link_timeout_frames = clamp_int(command.b, 1, 600);
        break;
    case EventOp::LinkClose:
        state.link_request = 3;
        state.link_script = -1;
        state.link_timeout_frames = 0;
        break;
    case EventOp::LinkTransfer:
        state.link_request = 4;
        state.link_transfer_variable = clamp_int(command.a, 0, 15);
        state.link_transfer_value = clamp_int(command.b, 0, 255);
        state.link_timeout_frames = clamp_int(command.c, 1, 600);
        break;
    case EventOp::ShowActorGesture:
        if (is_valid_actor_condition_index(command.a)) {
            state.actor_gesture_changed = true;
            state.actor_gesture_actor = command.a;
            state.actor_gesture_index = command.b < 0 ? 0 : command.b;
            state.actor_gesture_frames = clamp_int(command.c, 1, 600);
        }
        break;
    case EventOp::LockScript:
        if (is_valid_event_script_lock_slot(command.a)) {
            state.script_locks[command.a] = true;
        }
        break;
    case EventOp::UnlockScript:
        if (is_valid_event_script_lock_slot(command.a)) {
            state.script_locks[command.a] = false;
        }
        break;
    case EventOp::SceneStackPush:
        if (command.a >= static_cast<int>(RuntimeKind::TopDown) &&
            command.a <= static_cast<int>(RuntimeKind::Luta)) {
            push_scene_stack(state, static_cast<RuntimeKind>(command.a));
        }
        break;
    case EventOp::SceneStackClear:
        clear_scene_stack(state);
        break;
    case EventOp::SceneStackPrevious: {
        EventSceneStackEntry entry { RuntimeKind::TopDown, -1, 0, 0, 0 };
        if (pop_previous_scene(state, entry) &&
            command.a >= static_cast<int>(RuntimeKind::TopDown) &&
            command.a <= static_cast<int>(RuntimeKind::Luta)) {
            restore_scene_stack_entry(state, entry, static_cast<RuntimeKind>(command.a));
        }
        break;
    }
    case EventOp::SceneStackFirst: {
        EventSceneStackEntry entry { RuntimeKind::TopDown, -1, 0, 0, 0 };
        if (pop_first_scene(state, entry) &&
            command.a >= static_cast<int>(RuntimeKind::TopDown) &&
            command.a <= static_cast<int>(RuntimeKind::Luta)) {
            restore_scene_stack_entry(state, entry, static_cast<RuntimeKind>(command.a));
        }
        break;
    }
    case EventOp::StartActorUpdateScript:
        if (is_valid_actor_state_slot(command.a)) {
            state.actor_update_script_enabled[command.a] = true;
        }
        break;
    case EventOp::StopActorUpdateScript:
        if (is_valid_actor_state_slot(command.a)) {
            state.actor_update_script_enabled[command.a] = false;
        }
        break;
    case EventOp::StartSegment:
        if (is_valid_segment_index(command.a)) {
            state.segment_active[command.a] = true;
            state.segment_script[command.a]=command.b;
            ++state.segment_revision[command.a];
        }
        break;
    case EventOp::StopSegment:
        if (is_valid_segment_index(command.a)) {
            state.segment_active[command.a] = false;
        }
        break;
    case EventOp::AttachPlatformCallback:
        attach_platform_callback(state, command.a, command.b);
        break;
    case EventOp::RemovePlatformCallback:
        remove_platform_callback(state, command.a);
        break;
    case EventOp::AttachAdventureCallback:
        attach_adventure_callback(state, command.a, command.b);
        break;
    case EventOp::RemoveAdventureCallback:
        remove_adventure_callback(state, command.a);
        break;
    case EventOp::PauseSceneType:
        if (is_valid_scene_type_index(command.a)) {
            state.scene_type_paused[command.a] = true;
        }
        break;
    case EventOp::ResumeSceneType:
        if (is_valid_scene_type_index(command.a)) {
            state.scene_type_paused[command.a] = false;
        }
        break;
    case EventOp::FadeOut:
        state.fade_changed = true;
        state.fade_direction = 1;
        state.fade_frames = clamp_int(command.a, 1, 600);
        break;
    case EventOp::FadeIn:
        if (runtime_transition.pending && runtime_transition.mode == RuntimeTransitionMode::Warp) {
            runtime_transition.deferred_fade_in = true;
            runtime_transition.deferred_fade_frames = clamp_int(command.a, 1, 600);
            break;
        }
        state.fade_changed = true;
        state.fade_direction = -1;
        state.fade_frames = clamp_int(command.a, 1, 600);
        break;
    case EventOp::VisualEffect:
        if (runtime_transition.pending &&
            runtime_transition.mode == RuntimeTransitionMode::Warp &&
            command.d == 2) {
            runtime_transition.deferred_visual_effect = true;
            runtime_transition.deferred_visual_effect_kind = static_cast<int>(unpack_visual_effect_kind(command.a));
            runtime_transition.deferred_visual_effect_target = static_cast<int>(unpack_visual_effect_target(command.a));
            runtime_transition.deferred_visual_effect_frames = clamp_int(command.b, 0, 3600);
            runtime_transition.deferred_visual_effect_intensity = clamp_int(command.c, 0, 100);
            runtime_transition.deferred_visual_effect_phase = 2;
            break;
        }
        state.visual_effect_changed = true;
        state.visual_effect_kind = static_cast<int>(unpack_visual_effect_kind(command.a));
        state.visual_effect_target = static_cast<int>(unpack_visual_effect_target(command.a));
        state.visual_effect_frames = clamp_int(command.b, 0, 3600);
        state.visual_effect_intensity = clamp_int(command.c, 0, 100);
        state.visual_effect_phase = clamp_int(command.d, 0, 2);
        break;
    case EventOp::SetActorVisible:
        push_actor_command(state, EventActorOp::SetVisible, command.a, command.b, 0);
        break;
    case EventOp::SetActorActive:
        push_actor_command(state, EventActorOp::SetActive, command.a, command.b, 0);
        break;
    case EventOp::SetActorCollisionEnabled:
        push_actor_command(state, EventActorOp::SetCollisionEnabled, command.a, command.b, 0);
        break;
    case EventOp::SetActorCollisionBox:
        push_actor_command(
            state,
            EventActorOp::SetCollisionBox,
            command.a,
            event_signed_byte(command.b, 8),
            event_signed_byte(command.b, 0),
            event_unsigned_byte(command.c, 8),
            event_unsigned_byte(command.c, 0)
        );
        break;
    case EventOp::SetActorPosition:
        push_actor_command(state, EventActorOp::SetPosition, command.a, command.b, command.c);
        break;
    case EventOp::MoveActor:
        push_actor_command(state, EventActorOp::MoveRelative, command.a, command.b, command.c);
        break;
    case EventOp::SetActorDirection:
        push_actor_command(state, EventActorOp::SetDirection, command.a, command.b, 0);
        break;
    case EventOp::SetActorSpeed:
        push_actor_command(state, EventActorOp::SetSpeed, command.a, command.b, 0);
        break;
    case EventOp::SetActorAnimation:
        if (is_valid_actor_state_slot(command.a)) {
            state.actor_animation_playing[command.a] = true;
        }
        push_actor_command(state, EventActorOp::SetAnimation, command.a, command.b, 0);
        break;
    case EventOp::SetActorAnimationSpeed:
        push_actor_command(state, EventActorOp::SetAnimationSpeed, command.a, command.b, 0);
        break;
    case EventOp::SetActorAnimationFrame:
        push_actor_command(state, EventActorOp::SetAnimationFrame, command.a, command.b, 0);
        break;
    case EventOp::SetActorSprite:
        if (is_valid_actor_state_slot(command.a)) {
            state.actor_animation_playing[command.a] = true;
        }
        push_actor_command(state, EventActorOp::SetSprite, command.a, command.b, 0);
        break;
    case EventOp::CallScript:
        if (!event_script_is_locked(state, command.a)) {
            state.last_script = command.a;
        }
        break;
    case EventOp::OpenShop:
        state.last_shop_actor=command.a;
        if(pause_on_wait) { ++index;return EventStepResult::Pause; }
        break;
    case EventOp::OpenMenu:
        state.menu_response_variable=command.b;
        state.last_choice_group=command.a;
        if(pause_on_wait) { ++index;return EventStepResult::Pause; }
        break;
    case EventOp::ShowChoice:
        state.menu_response_variable=-1;
        state.last_choice_group = command.a;
        if (pause_on_wait) {
            ++index;
            return EventStepResult::Pause;
        }
        break;
    case EventOp::OpenTextInput:
        if (is_valid_event_variable(command.a)) {
            state.last_text_input_variable = command.a;
            state.text_input_max_length = command.b > 0 ? command.b : 8;
            state.text_input_charset = command.c;
        }
        break;
    case EventOp::OpenCodeLock:
        if (is_valid_event_variable(command.a)) {
            state.last_code_lock_variable = command.a;
            state.code_lock_digits = clamp_int(command.b, 1, 4);
            state.code_lock_code = command.c;
        }
        if(pause_on_wait) { ++index;return EventStepResult::Pause; }
        break;
    case EventOp::OpenEquipMenu:
        state.equip_menu_slots = clamp_int(command.a, 1, static_cast<int>(max_event_equipment_slots));
        state.equip_menu_pause = command.b != 0;
        state.equip_menu_requested=true;
        if(pause_on_wait) { ++index;return EventStepResult::Pause; }
        break;
    case EventOp::SetEquippedItem:
        if (is_valid_event_equipment_slot(command.a)) {
            state.equipped_items[command.a] = command.b;
        }
        break;
    case EventOp::PushActor:
        push_actor_command(state, EventActorOp::PushFacing, command.a, command.b, 0);
        break;
    case EventOp::PushActorAwayFromPlayer:
        push_actor_away_from_player(state, command.a, command.b);
        break;
    case EventOp::DrawText: {
        size_t slot=0;
        for(;slot<max_event_draw_text_entries;++slot) if(state.draw_text[slot].line<0 || (state.draw_text[slot].x==command.b && state.draw_text[slot].y==command.c && state.draw_text[slot].overlay==(command.d!=0))) break;
        if(slot<max_event_draw_text_entries) state.draw_text[slot]={command.a,command.b,command.c,command.d!=0};
        break;
    }
    case EventOp::SetAdventureState:
        state.adventure_state=clamp_int(command.a,0,5);
        state.adventure_frames=state.adventure_state==5 ? 8 : 12;
        break;
    case EventOp::SetPlayerSpeedProfile:
        state.player_walk_speed = command.a > 0 ? command.a : 100;
        state.player_run_speed = command.b >= state.player_walk_speed ? command.b : state.player_walk_speed;
        state.player_stamina_cost = command.c >= 0 ? command.c : 0;
        break;
    case EventOp::SetPlayerMovementState:
        state.player_movement_state = command.a;
        state.player_movement_tile_tag = command.b;
        break;
    case EventOp::SetPlatformerState:
        state.platformer_next_state = clamp_int(command.a, 0, 9);
        state.platformer_state_changed = true;
        break;
    case EventOp::StartGameClock:
        state.clock_minutes_per_tick = command.a > 0 ? command.a : 10;
        state.clock_frames_per_tick = command.b > 0 ? command.b : 180;
        state.clock_hud_enabled = command.c != 0;
        state.clock_minute = 0;
        state.clock_frame_accumulator = 0;
        break;
    case EventOp::AdvanceTime:
        state.clock_minute = ((state.clock_minute + command.a) % 1440 + 1440) % 1440;
        break;
    case EventOp::SetStat:
        if (is_valid_event_stat(command.a)) {
            const int max_value = command.c > 0 ? command.c : command.b;
            state.stat_max[command.a] = max_value;
            state.stats[command.a] = clamp_int(command.b, 0, max_value);
        }
        break;
    case EventOp::ModifyStat:
        if (is_valid_event_stat(command.a)) {
            const int max_value = state.stat_max[command.a] > 0 ? state.stat_max[command.a] : 999;
            state.stats[command.a] = clamp_int(state.stats[command.a] + command.b, 0, max_value);
        }
        break;
    case EventOp::ShowStatBar:
        if (is_valid_event_stat(command.a)) {
            state.hud_stat_bar_stat = command.a;
            state.hud_stat_bar_x = command.b;
            state.hud_stat_bar_width = command.c > 0 ? command.c : 64;
        }
        break;
    case EventOp::ShowHearts:
        if (is_valid_event_stat(command.a)) {
            state.hud_hearts_stat = command.a;
            state.hud_units_per_heart = command.b > 0 ? command.b : 4;
            state.hud_heart_count = command.c > 0 ? command.c : 4;
        }
        break;
    case EventOp::ModifyWallet:
        if (is_valid_event_variable(command.a)) {
            const int max_value = command.c > 0 ? command.c : 999;
            state.variables[command.a] = clamp_int(state.variables[command.a] + command.b, 0, max_value);
        }
        break;
    case EventOp::ShowNumberHud:
        if (is_valid_event_variable(command.a)) {
            state.hud_number_variable = command.a;
            state.hud_number_x = command.b;
            state.hud_number_digits = command.c > 0 ? command.c : 3;
        }
        break;
    case EventOp::RumbleOn:
        rumble_on();
        break;
    case EventOp::RumbleOnFor:
        rumble_on_for(clamp_int(command.a, 1, 255));
        break;
    case EventOp::RumbleOff:
        rumble_off();
        break;
    case EventOp::MultiplayerOpen:
        multiplayer_open(state.multiplayer_session, static_cast<uint8_t>(clamp_int(command.a, 2, 4)));
        break;
    case EventOp::MultiplayerClose:
        multiplayer_close(state.multiplayer_session);
        break;
    case EventOp::MultiplayerSetData:
        multiplayer_set_data(state.multiplayer_session, static_cast<uint16_t>(command.a & 0xFFFF));
        break;
    case EventOp::MultiplayerTransfer:
        multiplayer_transfer(state.multiplayer_session);
        break;
    case EventOp::MultiplayerGetData: {
        const uint8_t player_id = state.multiplayer_session.player_id;
        const uint8_t count = multiplayer_connected_count(state.multiplayer_session);
        if (is_valid_event_variable(command.a)) {
            state.variables[command.a] = static_cast<int>(player_id);
        }
        if (is_valid_event_variable(command.b)) {
            state.variables[command.b] = static_cast<int>(count);
        }
        for (uint8_t i = 0; i < count && i < 4; ++i) {
            const int var_idx = command.c + static_cast<int>(i);
            if (is_valid_event_variable(var_idx)) {
                state.variables[var_idx] = static_cast<int>(multiplayer_get_data(state.multiplayer_session, i));
            }
        }
        break;
    }
    }
    ++index;
    return EventStepResult::Continue;
}

} // namespace

uint16_t resolve_event_tile(const EventTileCommand& command, const TileAsset* assets, size_t asset_count) {
    if (command.tile_asset < 0 || assets == nullptr || static_cast<size_t>(command.tile_asset) >= asset_count) {
        return static_cast<uint16_t>(command.tile);
    }
    const TileAsset& asset = assets[command.tile_asset];
    if (command.tile < 0 || static_cast<uint32_t>(command.tile) >= asset.tile_count) {
        return static_cast<uint16_t>(command.tile);
    }
    return static_cast<uint16_t>(asset.destination_tile + command.tile);
}

bool runtime_transition_requested() {
    return runtime_transition.pending;
}

bool runtime_transition_pending() {
    return runtime_transition.pending && runtime_transition.cover_wait_frames == 0;
}

RuntimeKind runtime_transition_target() {
    return runtime_transition.target;
}

bool runtime_transition_route(RuntimeTransitionRoute& route) {
    if (!runtime_transition_pending()) {
        return false;
    }
    route.runtime = runtime_transition.target;
    route.local_index = runtime_transition.room;
    return true;
}

bool request_runtime_save_restore(RuntimeKind runtime, int slot_index) {
    const int runtime_value = static_cast<int>(runtime);
    if (slot_index < 0 ||
        runtime_value < static_cast<int>(RuntimeKind::TopDown) ||
        runtime_value > static_cast<int>(RuntimeKind::Luta)) {
        return false;
    }
    runtime_transition.pending = true;
    runtime_transition.cover_wait_frames = 0;
    runtime_transition.mode = RuntimeTransitionMode::SaveRestore;
    runtime_transition.target = runtime;
    runtime_transition.room = 0;
    runtime_transition.player_x = 0;
    runtime_transition.player_y = 0;
    runtime_transition.save_slot_index = slot_index;
    runtime_transition.deferred_fade_in = false;
    runtime_transition.deferred_fade_frames = 0;
    runtime_transition.deferred_visual_effect = false;
    return true;
}

bool consume_runtime_save_restore(RuntimeKind runtime, int& slot_index) {
    if (!runtime_transition.pending ||
        runtime_transition.mode != RuntimeTransitionMode::SaveRestore ||
        runtime_transition.target != runtime) {
        return false;
    }
    slot_index = runtime_transition.save_slot_index;
    runtime_transition.pending = false;
    return true;
}

bool consume_runtime_transition(
    RuntimeKind runtime,
    EventState& state,
    int& room,
    int& player_x,
    int& player_y
) {
    if (!runtime_transition_pending() ||
        runtime_transition.mode != RuntimeTransitionMode::Warp ||
        runtime_transition.target != runtime) {
        return false;
    }
    state = runtime_transition.event_state;
    room = runtime_transition.room;
    player_x = runtime_transition.player_x;
    player_y = runtime_transition.player_y;
    state.current_room = room;
    state.player_x = player_x;
    state.player_y = player_y;
    if (runtime_transition.deferred_fade_in) {
        state.fade_changed = true;
        state.fade_direction = -1;
        state.fade_frames = runtime_transition.deferred_fade_frames;
    }
    if (runtime_transition.deferred_visual_effect) {
        state.visual_effect_changed = true;
        state.visual_effect_kind = runtime_transition.deferred_visual_effect_kind;
        state.visual_effect_target = runtime_transition.deferred_visual_effect_target;
        state.visual_effect_frames = runtime_transition.deferred_visual_effect_frames;
        state.visual_effect_intensity = runtime_transition.deferred_visual_effect_intensity;
        state.visual_effect_phase = runtime_transition.deferred_visual_effect_phase;
    }
    runtime_transition.deferred_fade_in = false;
    runtime_transition.deferred_fade_frames = 0;
    runtime_transition.deferred_visual_effect = false;
    runtime_transition.pending = false;
    return true;
}

void init_event_state(EventState& state) {
    state.luta_command_count = 0;
    for (size_t i = 0; i <= max_event_actor_state_slots; ++i) { state.actor_effect_frames[i]=0; state.actor_effect_intensity[i]=0; state.actor_effect_kind[i]=0; }
    state.current_room = 0;
    state.player_x = 0;
    state.player_y = 0;
    state.player_direction = 0;
    state.actor_condition_tile_size = 1;
    state.input_held = 0;
    state.input_pressed = 0;
    state.input_released = 0;
    for (size_t variable_index = 0; variable_index < text_variable_count; ++variable_index) {
        for (size_t character_index = 0; character_index <= text_variable_max_length; ++character_index) {
            state.text_variables[variable_index][character_index] = '\0';
        }
    }
    state.last_dialogue = -1;
    state.last_sfx = -1;
    state.last_pcm_sfx = -1;
    state.last_pcm_sfx_volume = 15;
    state.last_pcm_sfx_priority = 8;
    state.last_music = -1;
    state.last_tracker_music = -1;
    state.stop_music = false;
    state.close_dialogue = false;
    state.wait_frames = 0;
    state.camera_changed = false;
    state.camera_follow_player = true;
    state.camera_x = 0;
    state.camera_y = 0;
    state.camera_shake_frames = 0;
    state.camera_shake_magnitude = 0;
    state.camera_move_changed = false;
    state.camera_delta_x = 0;
    state.camera_delta_y = 0;
    state.camera_bounds_x_changed = false;
    state.camera_bounds_min_x = 0;
    state.camera_bounds_max_x = 0;
    state.camera_bounds_y_changed = false;
    state.camera_bounds_min_y = 0;
    state.camera_bounds_max_y = 0;
    state.camera_property_changed = false;
    state.camera_property = 0;
    state.camera_property_value = 0;
    clear_event_actor_commands(state);
    clear_event_tile_commands(state);
    state.last_text_input_variable = -1;
    state.text_input_max_length = 0;
    state.text_input_charset = 0;
    state.last_code_lock_variable = -1;
    state.code_lock_digits = 0;
    state.code_lock_code = 0;
    state.equip_menu_slots = 0;
    state.equip_menu_pause = false;
    state.equip_menu_requested=false;state.menu_response_variable=-1;state.last_shop_actor=-2;
    for (int& item : state.equipped_items) {
        item = -1;
    }
    for (int& item : state.inventory) {
        item = 0;
    }
    for (size_t index = 0; index < max_event_actor_state_slots; ++index) {
        state.actor_x[index] = 0;
        state.actor_y[index] = 0;
        state.actor_direction[index] = 0;
        state.actor_animation_playing[index] = false;
        state.actor_update_script_enabled[index] = false;
    }
    for (size_t index = 0; index < max_event_segments; ++index) {
        state.segment_active[index] = false;
        state.segment_script[index]=-1;state.segment_revision[index]=0;
    }
    for (size_t index = 0; index < max_event_platform_callbacks; ++index) {
        state.platform_callback_scripts[index] = -1;
    }
    for (size_t index = 0; index < max_event_adventure_callbacks; ++index) {
        state.adventure_callback_scripts[index] = -1;
    }
    for (size_t index = 0; index < max_event_scene_types; ++index) {
        state.scene_type_paused[index] = false;
    }
    state.player_walk_speed = 1;
    state.player_run_speed = 1;
    state.player_stamina_cost = 0;
    state.adventure_state=0;state.adventure_frames=0;
    for(auto& text:state.draw_text) text=EventDrawText{};
    state.player_movement_state = 0;
    state.player_movement_tile_tag = 0;
    state.platformer_state_changed = false;
    state.platformer_next_state = 0;
    state.platformer_blank_gravity = 0;
    state.clock_minute = 0;
    state.clock_frame_accumulator = 0;
    state.clock_minutes_per_tick = 0;
    state.clock_frames_per_tick = 0;
    state.clock_hud_enabled = false;
    for (size_t index = 0; index < max_event_stats; ++index) {
        state.stats[index] = 0;
        state.stat_max[index] = 0;
    }
    state.hud_stat_bar_stat = -1;
    state.hud_stat_bar_x = 0;
    state.hud_stat_bar_width = 0;
    state.hud_hearts_stat = -1;
    state.hud_units_per_heart = 0;
    state.hud_heart_count = 0;
    state.hud_number_variable = -1;
    state.hud_number_x = 0;
    state.hud_number_digits = 0;
    state.overlay_visible = false;
    state.overlay_x = 0;
    state.overlay_y = 0;
    state.overlay_width = 160;
    state.overlay_height = 40;
    state.overlay_line = 0;
    state.overlay_line_changed = false;
    state.overlay_transition_frames = 0;
    state.overlay_show_requested = false;
    state.overlay_show_x = 0;
    state.overlay_show_y = 0;
    state.overlay_show_width = 160;
    state.overlay_show_height = 40;
    state.overlay_move_requested = false;
    state.overlay_hide_requested = false;
    state.audio_mute_changed = false;
    state.audio_mute_channel = 0;
    state.audio_mute_enabled = false;
    state.audio_volume_changed = false;
    state.audio_volume_channel = 0;
    state.audio_volume = 15;
    state.audio_fade_changed = false;
    state.audio_fade_channel = 0;
    state.audio_fade_target_volume = 15;
    state.audio_fade_frames = 0;
    state.all_sprites_visible_changed = false;
    state.all_sprites_visible = true;
    state.player_animation_changed = false;
    state.player_animation_index = 0;
    state.player_bounce_requested = false;
    state.player_bounce_height_tiles = 0;
    state.player_bounce_frames = 0;
    state.link_request = 0;
    state.link_script = -1;
    state.link_transfer_variable = -1;
    state.link_transfer_value = 0;
    state.link_timeout_frames = 4;
    state.link_last_transfer_ok = false;
    state.link_last_received_value = 0;
    state.rtc_read_ok = false;
    state.actor_gesture_changed = false;
    state.actor_gesture_actor = -1;
    state.actor_gesture_index = 0;
    state.actor_gesture_frames = 0;
    state.fade_changed = false;
    state.fade_direction = 0;
    state.fade_frames = 0;
    state.visual_effect_changed = false;
    state.visual_effect_kind = static_cast<int>(VisualEffectKind::Clear);
    state.visual_effect_target = static_cast<int>(VisualEffectTarget::All);
    state.visual_effect_frames = 0;
    state.visual_effect_intensity = 0;
    state.visual_effect_phase = 0;
    state.dialogue_text_speed_changed = false;
    state.dialogue_text_speed_frames = 0;
    state.dialogue_text_sfx_changed = false;
    state.dialogue_text_sfx_index = -1;
    state.dialogue_frame_changed = false;
    state.dialogue_frame_index = 0;
    state.background_request_index = -1;
    state.background_palette_changed = false;
    state.background_palette_index = 0;
    state.background_palette_frames = 0;
    state.sprite_palette_changed = false;
    state.sprite_palette_index = 0;
    state.sprite_palette_frames = 0;
    state.last_script = -1;
    state.last_button_binding_overrides_default = false;
    state.last_choice_group = -1;
    state.event_frame_counter = 0;
    for (size_t index = 0; index < max_event_rate_limit_slots; ++index) {
        state.rate_limit_last_frame[index] = 0;
        state.rate_limit_has_run[index] = false;
    }
    for (size_t index = 0; index < max_event_save_slots; ++index) {
        state.save_slot_exists[index] = false;
    }
    state.save_request = 0;
    state.save_request_slot = -1;
    for (size_t index = 0; index < max_event_projectile_slots; ++index) {
        state.projectile_slot_loaded[index] = false;
        state.projectile_slot_damage[index] = 1;
        state.projectile_slot_speed[index] = 1;
        state.projectile_slot_sprite[index]=-1;
    }
    state.projectile_launch_requested = false;
    state.projectile_launch_actor = -1;
    state.projectile_launch_slot = -1;
    state.projectile_launch_direction = 0;
    state.button_binding_count = 0;
    for (size_t index = 0; index < max_event_button_bindings; ++index) {
        state.button_bindings[index] = EventButtonBinding { 0, -1, false };
    }
    state.timer_binding_count = 0;
    for (size_t index = 0; index < max_event_timer_bindings; ++index) {
        state.timer_bindings[index] = EventTimerBinding { -1, 0, 0 };
    }
    for (size_t index = 0; index < max_event_script_locks; ++index) {
        state.script_locks[index] = false;
    }
    clear_scene_stack(state);
    for (int& variable : state.variables) {
        variable = 0;
    }
    state.random_seed = 0x1234abcd;
}

void set_event_player_actor_state(EventState& state, int x, int y, int direction, int tile_size) {
    state.player_x = x;
    state.player_y = y;
    state.player_direction = direction;
    state.actor_condition_tile_size = tile_size > 0 ? tile_size : 1;
}

void set_event_input_state(EventState& state, uint16_t held, uint16_t pressed, uint16_t released) {
    state.input_held = held;
    state.input_pressed = pressed;
    state.input_released = released;
}

void set_event_actor_animation_state(EventState& state, int actor_index, bool playing) {
    if (is_valid_actor_state_slot(actor_index)) {
        state.actor_animation_playing[actor_index] = playing;
    }
}

void tick_event_frame_counter(EventState& state) {
    for (size_t i = 0; i <= max_event_actor_state_slots; ++i) if (state.actor_effect_frames[i] > 0) --state.actor_effect_frames[i];
    if (state.clock_frames_per_tick > 0 && state.clock_minutes_per_tick > 0) {
        if (++state.clock_frame_accumulator >= state.clock_frames_per_tick) {
            state.clock_frame_accumulator = 0;
            state.clock_minute = (state.clock_minute + state.clock_minutes_per_tick) % 1440;
        }
    }
    if (runtime_transition.pending && runtime_transition.cover_wait_frames > 0) {
        --runtime_transition.cover_wait_frames;
    }
    if (state.event_frame_counter < 0x3fffffff) {
        ++state.event_frame_counter;
        return;
    }
    state.event_frame_counter = 0;
    for (size_t index = 0; index < max_event_rate_limit_slots; ++index) {
        state.rate_limit_last_frame[index] = 0;
        state.rate_limit_has_run[index] = false;
    }
}

bool event_actor_effect_visible(const EventState& state, int actor_index) {
    const int slot=actor_index+1;
    if (slot < 0 || slot > static_cast<int>(max_event_actor_state_slots) || state.actor_effect_frames[slot] <= 0 || state.actor_effect_kind[slot] != 0) return true;
    return (state.event_frame_counter * 50 % 100) >= state.actor_effect_intensity[slot];
}
int event_actor_effect_offset_x(const EventState& state, int actor_index) {
    const int slot=actor_index+1;
    if (slot < 0 || slot > static_cast<int>(max_event_actor_state_slots) || state.actor_effect_frames[slot] <= 0 || state.actor_effect_kind[slot] != 1) return 0;
    const int distance=state.actor_effect_intensity[slot]/25;
    return state.event_frame_counter%2 == 0 ? distance : -distance;
}

void format_event_clock(const EventState& state, char (&display)[6]) {
    const int minute = ((state.clock_minute % 1440) + 1440) % 1440;
    display[0] = static_cast<char>('0' + minute / 600);
    display[1] = static_cast<char>('0' + (minute / 60) % 10);
    display[2] = ':';
    display[3] = static_cast<char>('0' + (minute % 60) / 10);
    display[4] = static_cast<char>('0' + minute % 10);
    display[5] = '\0';
}

bool event_script_is_locked(const EventState& state, int script_index) {
    return is_valid_event_script_lock_slot(script_index) && state.script_locks[script_index];
}

bool event_actor_update_script_enabled(const EventState& state, int actor_index) {
    return is_valid_actor_state_slot(actor_index) && state.actor_update_script_enabled[actor_index];
}

bool event_segment_is_active(const EventState& state, int segment_index) {
    return is_valid_segment_index(segment_index) && state.segment_active[segment_index];
}

bool event_scene_type_is_paused(const EventState& state, int scene_type_index) {
    return is_valid_scene_type_index(scene_type_index) && state.scene_type_paused[scene_type_index];
}

bool platform_callback_script(const EventState& state, int callback_index, int& script_index) {
    if (!is_valid_platform_callback_index(callback_index)) {
        return false;
    }
    const int script = state.platform_callback_scripts[callback_index];
    if (script < 0 || event_script_is_locked(state, script)) {
        return false;
    }
    script_index = script;
    return true;
}

bool adventure_callback_script(const EventState& state, int callback_index, int& script_index) {
    if (!is_valid_adventure_callback_index(callback_index)) {
        return false;
    }
    const int script = state.adventure_callback_scripts[callback_index];
    if (script < 0 || event_script_is_locked(state, script)) {
        return false;
    }
    script_index = script;
    return true;
}

bool update_button_event_bindings(EventState& state) {
    state.last_button_binding_overrides_default = false;
    for (size_t index = 0; index < state.button_binding_count; ++index) {
        const EventButtonBinding& binding = state.button_bindings[index];
        if (binding.button != 0 &&
            (state.input_pressed & binding.button) != 0 &&
            !event_script_is_locked(state, binding.script)) {
            state.last_script = binding.script;
            state.last_button_binding_overrides_default = binding.override_default;
            return true;
        }
    }
    return false;
}

bool button_event_binding_overrides_default(const EventState& state, uint16_t buttons) {
    for (size_t index = 0; index < state.button_binding_count; ++index) {
        const EventButtonBinding& binding = state.button_bindings[index];
        if (binding.override_default && (binding.button & buttons) != 0) {
            return true;
        }
    }
    return false;
}

bool update_timer_event_bindings(EventState& state) {
    for (size_t index = 0; index < state.timer_binding_count; ++index) {
        EventTimerBinding& binding = state.timer_bindings[index];
        if (binding.script < 0 || binding.frames <= 0) {
            continue;
        }
        if (event_script_is_locked(state, binding.script)) {
            continue;
        }
        if (binding.remaining_frames > 1) {
            --binding.remaining_frames;
            continue;
        }
        state.last_script = binding.script;
        binding.remaining_frames = binding.frames;
        return true;
    }
    return false;
}

void clear_event_actor_commands(EventState& state) {
    reset_event_actor_commands(state);
}

void clear_event_tile_commands(EventState& state) {
    reset_event_tile_commands(state);
}

void run_event_script(EventState& state, EventScript script) {
    run_event_script(state, script.commands, script.command_count);
}

void run_event_script(EventState& state, const EventCommand* commands, size_t count) {
    if (commands == nullptr || count == 0) {
        return;
    }

    size_t index = 0;
    size_t steps = 0;
    const size_t max_steps = count * 8 + 8;
    while (index < count && steps < max_steps) {
        ++steps;
        const EventCommand& command = commands[index];
        EventStepResult result = execute_event_command(state, command, index, count, false);
        if (result == EventStepResult::Stop) {
            return;
        }
    }
}

void init_event_runner(EventRunner& runner) {
    runner.script = empty_event_script();
    runner.command_index = 0;
    runner.active = false;
    runner.step_budget = 0;
}

void start_event_runner(EventRunner& runner, EventScript script) {
    runner.script = script;
    runner.command_index = 0;
    runner.active = has_event_script(script);
    runner.step_budget = 0;
}

void stop_event_runner(EventRunner& runner) {
    runner.script = empty_event_script();
    runner.command_index = 0;
    runner.active = false;
    runner.step_budget = 0;
}

bool update_event_runner(EventRunner& runner, EventState& state) {
    if (!runner.active) {
        return false;
    }
    if (!has_event_script(runner.script) || runner.command_index >= runner.script.command_count) {
        runner.active = false;
        return false;
    }

    size_t steps = 0;
    const size_t max_steps = runner.step_budget > 0 ? runner.step_budget : runner.script.command_count * 8 + 8;
    while (runner.command_index < runner.script.command_count && steps < max_steps) {
        ++steps;
        size_t index = runner.command_index;
        const EventCommand& command = runner.script.commands[index];
        EventStepResult result = execute_event_command(state, command, index, runner.script.command_count, true);
        runner.command_index = index;
        if (result == EventStepResult::Pause) {
            return true;
        }
        if (result == EventStepResult::Stop) {
            runner.active = false;
            return false;
        }
    }

    if (runner.command_index >= runner.script.command_count) {
        runner.active = false;
        return false;
    }
    return true;
}

void init_event_script_queue(EventScriptQueue& queue) {
    queue.head = 0;
    queue.count = 0;
    for (size_t index = 0; index < max_event_script_queue_entries; ++index) {
        queue.entries[index] = EventScriptQueueEntry { empty_event_script(), 0 };
    }
}

void clear_event_script_queue(EventScriptQueue& queue) {
    init_event_script_queue(queue);
}

bool enqueue_event_script(EventScriptQueue& queue, EventScript script, uint8_t flags) {
    if (!has_event_script(script) || event_script_queue_is_full(queue)) {
        return false;
    }

    size_t tail = (queue.head + queue.count) % max_event_script_queue_entries;
    queue.entries[tail] = EventScriptQueueEntry { script, flags };
    ++queue.count;
    return true;
}

bool enqueue_event_script_front(EventScriptQueue& queue, EventScript script, uint8_t flags) {
    if (!has_event_script(script) || event_script_queue_is_full(queue)) {
        return false;
    }

    queue.head = queue.head == 0 ? max_event_script_queue_entries - 1 : queue.head - 1;
    queue.entries[queue.head] = EventScriptQueueEntry { script, flags };
    ++queue.count;
    return true;
}

bool dequeue_event_script(EventScriptQueue& queue, EventScriptQueueEntry& entry) {
    if (event_script_queue_is_empty(queue)) {
        entry = EventScriptQueueEntry { empty_event_script(), 0 };
        return false;
    }

    entry = queue.entries[queue.head];
    queue.entries[queue.head] = EventScriptQueueEntry { empty_event_script(), 0 };
    queue.head = (queue.head + 1) % max_event_script_queue_entries;
    --queue.count;
    return true;
}

} // namespace gbs
