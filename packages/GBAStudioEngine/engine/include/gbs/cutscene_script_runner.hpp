#pragma once

#include "gbs/cutscene.hpp"
#include "gbs/runtime_checkpoint.hpp"

namespace gbs {

// Transient event execution for a cutscene; callers own checkpoint persistence.
struct CutsceneScriptRunner {
    EventRunner runner {};
    EventScriptQueue queue {};
    int wait_frames = 0;
};

inline void init_cutscene_script_runner(CutsceneScriptRunner& state) {
    init_event_runner(state.runner);
    init_event_script_queue(state.queue);
    state.wait_frames = 0;
}

inline bool enqueue_cutscene_script(CutsceneScriptRunner& state, EventScript script) {
    return !has_event_script(script) || enqueue_event_script(state.queue, script);
}

inline bool cutscene_script_runner_active(const CutsceneScriptRunner& state) {
    return state.wait_frames > 0 || event_runner_is_active(state.runner) ||
        !event_script_queue_is_empty(state.queue);
}

struct CutsceneQueuedScriptCheckpoint {
    int32_t index = -1;
    uint32_t hash = 0;
};

struct CutsceneScriptCheckpoint {
    CheckpointScript active {};
    int32_t wait_frames = 0;
    uint32_t queue_count = 0;
    CutsceneQueuedScriptCheckpoint queued[max_event_script_queue_entries] {};
};

inline EventScript cutscene_checkpoint_script(const CutsceneProjectData& project, int index) {
    if (index < 0 || project.scenes == nullptr) return empty_event_script();
    for (size_t scene_index = 0; scene_index < project.scene_count; ++scene_index) {
        const CutsceneSceneData& scene = project.scenes[scene_index];
        if (index-- == 0) return scene.on_enter;
        if (index-- == 0) return scene.on_exit;
        for (size_t step = 0; scene.steps != nullptr && step < scene.step_count; ++step) {
            if (index-- == 0) return scene.steps[step].script;
            if (index-- == 0) return scene.steps[step].on_skip;
        }
    }
    return project.scripts != nullptr && static_cast<size_t>(index) < project.script_count
        ? project.scripts[index] : empty_event_script();
}

inline int cutscene_checkpoint_script_index(const CutsceneProjectData& project, EventScript script) {
    if (!has_event_script(script)) return -1;
    int count = static_cast<int>(project.script_count);
    for (size_t index = 0; project.scenes != nullptr && index < project.scene_count; ++index)
        count += 2 + static_cast<int>(project.scenes[index].step_count) * 2;
    for (int index = 0; index < count; ++index) {
        const EventScript candidate = cutscene_checkpoint_script(project, index);
        if (candidate.commands == script.commands && candidate.command_count == script.command_count) return index;
    }
    return -1;
}

inline bool capture_cutscene_script_checkpoint(const CutsceneProjectData& project,
    const CutsceneScriptRunner& runtime, const EventState& events, CutsceneScriptCheckpoint& saved) {
    saved = CutsceneScriptCheckpoint {};
    if (event_runner_is_active(runtime.runner)) {
        const int index = cutscene_checkpoint_script_index(project, runtime.runner.script);
        if (index < 0) return false;
        saved.active = capture_checkpoint_script(runtime.runner, index, events);
    }
    saved.wait_frames = runtime.wait_frames;
    saved.queue_count = static_cast<uint32_t>(runtime.queue.count);
    for (size_t index = 0; index < runtime.queue.count; ++index) {
        const EventScript script = runtime.queue.entries[(runtime.queue.head + index) % max_event_script_queue_entries].script;
        const int script_index = cutscene_checkpoint_script_index(project, script);
        if (script_index < 0) return false;
        saved.queued[index] = {script_index, checkpoint_script_hash(script)};
    }
    return true;
}

inline bool restore_cutscene_script_checkpoint(const CutsceneProjectData& project,
    const CutsceneScriptCheckpoint& saved, const EventState& events, CutsceneScriptRunner& runtime) {
    if (saved.wait_frames < 0 || saved.queue_count > max_event_script_queue_entries) return false;
    CutsceneScriptRunner restored {};
    init_cutscene_script_runner(restored);
    const EventScript script = cutscene_checkpoint_script(project, saved.active.script_index);
    if (!restore_checkpoint_script(saved.active, script, restored.runner, &events)) return false;
    restored.wait_frames = saved.wait_frames;
    for (size_t index = 0; index < saved.queue_count; ++index) {
        const EventScript queued = cutscene_checkpoint_script(project, saved.queued[index].index);
        if (!has_event_script(queued) || checkpoint_script_hash(queued) != saved.queued[index].hash ||
            !enqueue_cutscene_script(restored, queued)) return false;
    }
    runtime = restored;
    return true;
}

inline void tick_cutscene_script_runner(CutsceneScriptRunner& state, EventState& events,
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
