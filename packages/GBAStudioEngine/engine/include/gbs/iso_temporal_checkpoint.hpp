#pragma once
#include "gbs/iso_checkpoint_scheduler.hpp"
#include "gbs/iso_temporal_motion.hpp"

namespace gbs {
struct IsoCheckpointExit { bool active = false; int target_room = -1; int target_x = 0; int target_y = 0; };
struct IsoTemporalRestore {
    uint16_t motion_mask = 0;
    uint16_t relative_mask = 0;
    int32_t target_x[max_isometric_save_actors]{};
    int32_t target_y[max_isometric_save_actors]{};
    int32_t x256[max_isometric_save_actors]{};
    int32_t y256[max_isometric_save_actors]{};
    uint8_t remainder[max_isometric_save_actors]{};
    uint8_t owner_slot[max_isometric_save_actors]{};
    int speeds[max_isometric_save_actors]{};
    IsoCheckpointExit exit{};
};
inline const EventCommand* iso_runner_current_command(const EventRunner& runner, const EventState& state) {
    EventScript script = runner.script;
    size_t index = runner.command_index;
    if (runner.call_depth > 0) {
        const auto& call = runner.calls[runner.call_depth - 1];
        if (!state.project_scripts || call.script_index >= state.project_script_count) return nullptr;
        script = state.project_scripts[call.script_index]; index = call.command_index;
    }
    if (!has_event_script(script) || index >= script.command_count) return nullptr;
    return &script.commands[index];
}
inline bool iso_motion_matches_runner(const IsoTemporalMotion& move, size_t actor, const EventState& state,
    const IsoEventScheduler& scheduler) {
    for (const auto& slot : scheduler.slots) {
        if (&slot.runner != move.owner || !slot.runner.active) continue;
        const auto* command = iso_runner_current_command(slot.runner, state);
        return command && command->a == static_cast<int>(actor) &&
            (command->op == EventOp::MoveActorRelative ||
             (command->op == EventOp::MoveActorTo && command->b == move.target_x && command->c == move.target_y));
    }
    return false;
}
inline bool write_iso_temporal_extension(CheckpointPayloadWriter& writer, const IsometricProjectData& project,
    int room, const EventState& state, const IsoEventScheduler& scheduler, const IsoTemporalMotionPool& motions,
    const IsoActor* actors, size_t actor_count, const int* speeds, const IsoCheckpointExit& exit,
    bool relative_format = false) {
    if (!actors || !speeds || actor_count > max_isometric_save_actors) return false;
    uint16_t motion_mask = 0, speed_mask = 0, relative_mask = 0;
    for (size_t i = 0; i < actor_count; ++i) {
        if (speeds[i] != 100) speed_mask |= static_cast<uint16_t>(1u << i);
        const auto& move = motions.moves[i];
        if (!iso_temporal_motion_is_live(move)) continue;
        if (move.remainder < 0 || move.remainder >= 100 || !iso_motion_matches_runner(move, i, state, scheduler)) return false;
        motion_mask |= static_cast<uint16_t>(1u << i);
        const EventCommand* command = iso_runner_current_command(*move.owner, state);
        if (command && command->op == EventOp::MoveActorRelative) relative_mask |= static_cast<uint16_t>(1u << i);
    }
    if (relative_mask && !relative_format) return false;
    if (!writer.write(motion_mask) || !writer.write(speed_mask) ||
        (relative_format && !writer.write(relative_mask))) return false;
    for (size_t i = 0; i < actor_count; ++i) if (speed_mask & (1u << i))
        if (!writer.write(static_cast<int32_t>(speeds[i]))) return false;
    for (size_t i = 0; i < actor_count; ++i) if (motion_mask & (1u << i)) {
        const auto& actor = actors[i];
        const int32_t x = actor.position_initialized ? actor.position_x256 : actor.tile.x * iso_position_scale;
        const int32_t y = actor.position_initialized ? actor.position_y256 : actor.tile.y * iso_position_scale;
        const uint8_t rem = static_cast<uint8_t>(motions.moves[i].remainder);
        uint8_t ordinal = 0; bool found = false;
        for (const auto& slot : scheduler.slots) {
            if (!slot.runner.active) continue;
            if (&slot.runner == motions.moves[i].owner) { found = true; break; }
            ++ordinal;
        }
        if (!found || !writer.write(x) || !writer.write(y) || !writer.write(rem) || !writer.write(ordinal)) return false;
        if ((relative_mask & (1u << i)) &&
            (!writer.write(static_cast<int32_t>(motions.moves[i].target_x)) ||
             !writer.write(static_cast<int32_t>(motions.moves[i].target_y)))) return false;
    }
    const uint8_t pending = exit.active ? 1 : 0;
    if (!writer.write(pending)) return false;
    if (pending && (!is_valid_isometric_room_index(project, exit.target_room) ||
        !writer.write(static_cast<int32_t>(exit.target_room)) || !writer.write(static_cast<int32_t>(exit.target_x)) ||
        !writer.write(static_cast<int32_t>(exit.target_y)))) return false;
    return write_iso_event_scheduler(writer, project, room, state, scheduler);
}
inline bool read_iso_temporal_extension(CheckpointPayloadReader& reader, const IsometricProjectData& project,
    int room, const EventState& state, size_t actor_count, IsoEventScheduler& scheduler, IsoTemporalRestore& result,
    const IsoActor* actors = nullptr, bool validate_only = false, bool relative_format = false) {
    if (actor_count > max_isometric_save_actors) return false;
    auto cursor = reader;
    IsoTemporalRestore restored{};
    for (auto& speed : restored.speeds) speed = 100;
    uint16_t speed_mask = 0;
    if (!cursor.read(restored.motion_mask) || !cursor.read(speed_mask) ||
        (relative_format && !cursor.read(restored.relative_mask))) return false;
    const uint32_t valid_mask = actor_count == 16 ? 0xffffu : ((1u << actor_count) - 1u);
    if ((restored.motion_mask & ~valid_mask) || (speed_mask & ~valid_mask) ||
        (restored.relative_mask & ~restored.motion_mask)) return false;
    for (size_t i = 0; i < actor_count; ++i) if (speed_mask & (1u << i)) {
        int32_t speed = 0; if (!cursor.read(speed)) return false; restored.speeds[i] = speed;
    }
    for (size_t i = 0; i < actor_count; ++i) if (restored.motion_mask & (1u << i)) {
        if (!cursor.read(restored.x256[i]) || !cursor.read(restored.y256[i]) || !cursor.read(restored.remainder[i]) || !cursor.read(restored.owner_slot[i]) ||
            restored.remainder[i] >= 100 || restored.owner_slot[i] >= max_iso_scheduled_scripts) return false;
        if (restored.relative_mask & (1u << i)) {
            if (!cursor.read(restored.target_x[i]) || !cursor.read(restored.target_y[i]) ||
                !is_valid_isometric_room_index(project, room) || restored.target_x[i] < 0 || restored.target_y[i] < 0 ||
                restored.target_x[i] >= project.rooms[room].width_tiles || restored.target_y[i] >= project.rooms[room].height_tiles) return false;
        }
        if (actors && (restored.x256[i] < 0 || restored.y256[i] < 0 ||
            restored.x256[i] / iso_position_scale != actors[i].tile.x ||
            restored.y256[i] / iso_position_scale != actors[i].tile.y)) return false;
    }
    uint8_t pending = 0;
    if (!cursor.read(pending) || pending > 1) return false;
    restored.exit.active = pending != 0;
    if (pending) {
        int32_t room_index = 0, x = 0, y = 0;
        if (!cursor.read(room_index) || !cursor.read(x) || !cursor.read(y) ||
            !is_valid_isometric_room_index(project, room_index)) return false;
        restored.exit.target_room = room_index; restored.exit.target_x = x; restored.exit.target_y = y;
    }
    auto probe = cursor;
    auto count_cursor = cursor;
    uint8_t slot_count = 0;
    if (!count_cursor.read(slot_count)) return false;
    for (size_t i = 0; i < actor_count; ++i) if (restored.motion_mask & (1u << i)) {
        if (restored.owner_slot[i] >= slot_count) return false;
    }
    bool exit_found = !restored.exit.active;
    for (size_t slot = 0; slot < slot_count; ++slot) {
        CheckpointScript saved{}; uint32_t wait = 0; IsoScheduledScript scheduled{};
        if (!read_checkpoint_script(count_cursor, saved) || !saved.active || !count_cursor.read(wait) ||
            wait > 0x7fffffffu || !restore_checkpoint_script(saved,
                iso_checkpoint_script_at(project, room, saved.script_index), scheduled.runner, &state)) return false;
        const auto* command = iso_runner_current_command(scheduled.runner, state);
        for (size_t actor = 0; actor < actor_count; ++actor) {
            if (!(restored.motion_mask & (1u << actor)) || restored.owner_slot[actor] != slot) continue;
            const bool relative = (restored.relative_mask & (1u << actor)) != 0;
            if (!command || command->a != static_cast<int>(actor) ||
                command->op != (relative ? EventOp::MoveActorRelative : EventOp::MoveActorTo)) return false;
        }
        if (restored.exit.active && is_valid_isometric_room_index(project, room)) {
            const auto on_exit = project.rooms[room].on_exit;
            if (has_event_script(on_exit) && scheduled.runner.script.commands == on_exit.commands &&
                scheduled.runner.script.command_count == on_exit.command_count) exit_found = true;
        }
    }
    if (!exit_found) return false;
    if (!parse_iso_event_scheduler(probe, project, room, state, nullptr) || !probe.complete()) return false;
    if (validate_only) {
        result = restored;
        return reader.commit(probe);
    }
    if (!read_iso_event_scheduler(cursor, project, room, state, scheduler) || !cursor.complete()) return false;
    result = restored;
    return reader.commit(cursor);
}
}
