#pragma once

#include "gbs/runtime_checkpoint.hpp"

namespace gbs {

// Transient event execution for a scene; callers own checkpoint persistence.
struct SceneScriptRunner {
    EventRunner runner {};
    EventScriptQueue queue {};
    int wait_frames = 0;
};

inline void init_scene_script_runner(SceneScriptRunner& state) {
    init_event_runner(state.runner);
    init_event_script_queue(state.queue);
    state.wait_frames = 0;
}

inline bool enqueue_scene_script(SceneScriptRunner& state, EventScript script) {
    return !has_event_script(script) || enqueue_event_script(state.queue, script);
}

inline bool scene_script_runner_active(const SceneScriptRunner& state) {
    return state.wait_frames > 0 || event_runner_is_active(state.runner) ||
        !event_script_queue_is_empty(state.queue);
}

inline void tick_scene_script_runner(SceneScriptRunner& state, EventState& events,
    bool paused, EventCommandConsumer consumer, void* context) {
    if (paused) return;
    if (state.wait_frames > 0 && --state.wait_frames > 0) return;
    if (!event_runner_is_active(state.runner)) {
        EventScriptQueueEntry next {};
        if (!dequeue_event_script(state.queue, next)) return;
        start_event_runner(state.runner, next.script);
    }
    update_checkpoint_event_runner(state.runner, events);
    if (events.wait_frames > 0) {
        state.wait_frames = events.wait_frames;
        events.wait_frames = 0;
    }
    if (consumer != nullptr) consumer(events, context);
}

} // namespace gbs
