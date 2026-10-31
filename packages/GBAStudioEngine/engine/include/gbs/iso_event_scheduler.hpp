#pragma once
#include "gbs/event.hpp"

namespace gbs {
// Experimental scheduler; capacity failures must be surfaced by the caller.
constexpr size_t max_iso_scheduled_scripts = 32;
struct IsoScheduledScript { EventRunner runner{}; int wait_frames = 0; };
struct IsoEventScheduler { IsoScheduledScript slots[max_iso_scheduled_scripts]{}; };
inline bool iso_script_contains_motion(EventScript script, const EventState& state, size_t depth = 0) {
    if (!has_event_script(script)) return false;
    if (depth >= max_event_script_call_depth) return true;
    for (size_t i = 0; i < script.command_count; ++i) {
        const auto& command = script.commands[i];
        if ((command.op == EventOp::MoveActorTo || command.op == EventOp::MoveActorRelative)) return true;
        if (command.op == EventOp::CallScript && command.a >= 0 && state.project_scripts &&
            static_cast<size_t>(command.a) < state.project_script_count &&
            iso_script_contains_motion(state.project_scripts[command.a], state, depth + 1)) return true;
    }
    return false;
}
inline void advance_iso_scheduled_script(IsoScheduledScript& slot, EventState& state) {
    const int previous_wait = state.wait_frames;
    state.wait_frames = 0;
    update_event_runner(slot.runner, state);
    slot.wait_frames = state.wait_frames;
    state.wait_frames = previous_wait;
}
inline bool run_iso_scheduled_script(IsoEventScheduler& scheduler, EventState& state, EventScript script) {
    if (!has_event_script(script)) return true;
    if (!iso_script_contains_motion(script, state)) { run_event_script(state, script); return true; }
    for (const auto& slot : scheduler.slots)
        if (slot.runner.active && slot.runner.script.commands == script.commands &&
            slot.runner.script.command_count == script.command_count) return true;
    for (auto& slot : scheduler.slots) {
        if (slot.runner.active) continue;
        slot.wait_frames = 0;
        start_event_runner(slot.runner, script);
        advance_iso_scheduled_script(slot, state);
        return true;
    }
    return false;
}
inline void tick_iso_event_scheduler(IsoEventScheduler& scheduler, EventState& state, bool paused) {
    if (paused) return;
    for (auto& slot : scheduler.slots) {
        if (!slot.runner.active) continue;
        if (slot.wait_frames > 0) { --slot.wait_frames; continue; }
        advance_iso_scheduled_script(slot, state);
    }
}
inline bool iso_scheduled_script_is_active(const IsoEventScheduler& scheduler, EventScript script) {
    if (!has_event_script(script)) return false;
    for (const auto& slot : scheduler.slots)
        if (slot.runner.active && slot.runner.script.commands == script.commands &&
            slot.runner.script.command_count == script.command_count) return true;
    return false;
}
inline void clear_iso_event_scheduler(IsoEventScheduler& scheduler) {
    for (auto& slot : scheduler.slots) { stop_event_runner(slot.runner); slot.wait_frames = 0; }
}
}
