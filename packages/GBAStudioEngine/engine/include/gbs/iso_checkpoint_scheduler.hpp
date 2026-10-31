#pragma once
#include "gbs/iso_checkpoint_catalog.hpp"
#include "gbs/iso_event_scheduler.hpp"
#include "gbs/runtime_checkpoint.hpp"

namespace gbs {
// Experimental variable-size scheduler checkpoint; caller owns the versioned envelope.
inline bool write_iso_event_scheduler(CheckpointPayloadWriter& writer, const IsometricProjectData& project,
    int room_index, const EventState& state, const IsoEventScheduler& scheduler) {
    uint8_t count = 0;
    for (const auto& slot : scheduler.slots) if (slot.runner.active) ++count;
    if (!writer.write(count)) return false;
    for (const auto& slot : scheduler.slots) {
        if (!slot.runner.active) continue;
        int32_t id = -1;
        if (slot.wait_frames < 0 || !iso_checkpoint_find_script(project, room_index, slot.runner.script, id)) return false;
        const auto saved = capture_checkpoint_script(slot.runner, id, state);
        if (!write_checkpoint_script(writer, saved) || !writer.write(static_cast<uint32_t>(slot.wait_frames))) return false;
    }
    return true;
}
inline bool parse_iso_event_scheduler(CheckpointPayloadReader& reader, const IsometricProjectData& project,
    int room_index, const EventState& state, IsoEventScheduler* output) {
    uint8_t count = 0;
    if (!reader.read(count) || count > max_iso_scheduled_scripts) return false;
    for (size_t index = 0; index < count; ++index) {
        CheckpointScript saved{}; uint32_t wait = 0;
        if (!read_checkpoint_script(reader, saved) || !saved.active || !reader.read(wait) || wait > 0x7fffffffu) return false;
        const auto script = iso_checkpoint_script_at(project, room_index, saved.script_index);
        IsoScheduledScript restored{};
        if (!restore_checkpoint_script(saved, script, restored.runner, &state)) return false;
        restored.wait_frames = static_cast<int>(wait);
        if (output) output->slots[index] = restored;
    }
    return true;
}
inline bool read_iso_event_scheduler(CheckpointPayloadReader& reader, const IsometricProjectData& project,
    int room_index, const EventState& state, IsoEventScheduler& scheduler) {
    // Validate first, so corrupt saves never partially replace the live scheduler.
    auto probe = reader;
    if (!parse_iso_event_scheduler(probe, project, room_index, state, nullptr)) return false;
    clear_iso_event_scheduler(scheduler);
    return parse_iso_event_scheduler(reader, project, room_index, state, &scheduler);
}
}
