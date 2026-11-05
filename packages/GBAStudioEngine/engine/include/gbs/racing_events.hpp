#pragma once
#include "gbs/racing.hpp"

namespace gbs {
// A cursor over native progress keeps hook order without a bounded script queue.
struct RacingProgressEvents {
    unsigned int cursor = 0;
    unsigned int target = 0;
    bool lap_pending = false;
};
inline void capture_racing_progress_events(RacingProgressEvents& pending,
    const RacingRuntimeState& before, const RacingRuntimeState& after) {
    pending = {before.checkpoint_count, after.checkpoint_count, false};
}
inline bool next_racing_progress_event(RacingProgressEvents& pending,
    const RacingRoomData& room, EventScript& script) {
    const auto* track=room.topdown_track;
    const unsigned count=track ? static_cast<unsigned>(track->checkpoint_count) : room.config.pseudo3d.checkpoints_per_lap;
    if (!count) return false;
    while (pending.cursor < pending.target || pending.lap_pending) {
        if (pending.lap_pending) {
            pending.lap_pending=false;
            script=room.on_lap_complete;
        } else {
            const unsigned index=(pending.cursor+(track && track->finish_at_zero && count>1 ? 1u : 0u))%count;
            ++pending.cursor;
            pending.lap_pending=pending.cursor%count==0;
            script=track && track->checkpoint_events ? track->checkpoint_events[index] : empty_event_script();
        }
        if (has_event_script(script)) return true;
    }
    return false;
}
}
