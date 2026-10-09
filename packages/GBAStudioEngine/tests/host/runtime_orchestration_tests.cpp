#include "gbs/runtime.hpp"

#include <cassert>

namespace {

struct FakeRuntimeState {
    int initialize_calls = 0;
    int topdown_runs = 0;
    int platformer_runs = 0;
    int transition_hooks = 0;
    int service_initialize_calls = 0;
    int service_frame_calls = 0;
    int update_calls = 0;
    int render_calls = 0;
    gbs::RuntimeFrameContext last_frame {};
    gbs::RuntimeAdapterFrameResult next_frame_result = gbs::RuntimeAdapterFrameResult::Continue;
    gbs::RuntimeAdapterFrameResult frame_results[4] {};
    int frame_result_count = 0;
    int frame_result_index = 0;
    char phase_trace[16] {};
    int phase_count = 0;
    bool transition_pending = true;
};

FakeRuntimeState* fake_state = nullptr;

void record_phase(char phase) {
    if (fake_state->phase_count < static_cast<int>(sizeof(fake_state->phase_trace))) {
        fake_state->phase_trace[fake_state->phase_count++] = phase;
    }
}

void initialize_adapter(const gbs::RuntimeAdapter&) {
    ++fake_state->initialize_calls;
    record_phase('I');
}

void enter_adapter(const gbs::RuntimeAdapter&) {
    record_phase('E');
}

void leave_adapter(const gbs::RuntimeAdapter&) {
    record_phase('L');
}

int run_topdown() {
    ++fake_state->topdown_runs;
    record_phase('T');
    return 0;
}

int run_platformer() {
    ++fake_state->platformer_runs;
    record_phase('P');
    return 7;
}

bool transition_pending() {
    return fake_state->transition_pending;
}

bool transition_route(gbs::RuntimeTransitionRoute& route) {
    if (!fake_state->transition_pending) return false;
    fake_state->transition_pending = false;
    route = gbs::RuntimeTransitionRoute { gbs::RuntimeKind::Platformer, 0 };
    return true;
}

void on_transition() {
    ++fake_state->transition_hooks;
    record_phase('H');
}

void initialize_services(const gbs::RuntimeServices&) {
    ++fake_state->service_initialize_calls;
}

void on_service_frame(const gbs::RuntimeFrameContext& context) {
    ++fake_state->service_frame_calls;
    fake_state->last_frame = context;
}

gbs::RuntimeAdapterFrameResult update_frame(const gbs::RuntimeFrameContext& context) {
    ++fake_state->update_calls;
    record_phase('U');
    fake_state->last_frame = context;
    if (fake_state->frame_result_index < fake_state->frame_result_count) {
        return fake_state->frame_results[fake_state->frame_result_index++];
    }
    return fake_state->next_frame_result;
}

void render_frame(const gbs::RuntimeFrameContext& context) {
    ++fake_state->render_calls;
    record_phase('V');
    fake_state->last_frame = context;
}

void test_registry_finds_scene_by_runtime_and_local_index() {
    static constexpr gbs::RuntimeSceneDescriptor scenes[] = {
        { "title", gbs::RuntimeKind::Menu, 0 },
        { "town", gbs::RuntimeKind::TopDown, 0 },
        { "stage", gbs::RuntimeKind::Platformer, 0 }
    };
    static constexpr gbs::RuntimeSceneRegistry registry {
        scenes,
        3,
        0
    };

    const gbs::RuntimeSceneDescriptor* scene = gbs::find_runtime_scene(
        registry,
        gbs::RuntimeKind::Platformer,
        0
    );
    assert(scene != nullptr);
    assert(scene->name[0] == 's');
    assert(gbs::runtime_scene_index(registry, *scene) == 2);
    assert(gbs::find_runtime_scene(registry, gbs::RuntimeKind::Luta, 0) == nullptr);
}

void test_project_runtime_dispatches_adapters_and_transition() {
    static constexpr gbs::RuntimeSceneDescriptor scenes[] = {
        { "town", gbs::RuntimeKind::TopDown, 0 },
        { "stage", gbs::RuntimeKind::Platformer, 0 }
    };
    static constexpr gbs::RuntimeSceneRegistry registry {
        scenes,
        2,
        0
    };
    const gbs::RuntimeAdapter adapters[] = {
        {
            gbs::RuntimeKind::TopDown,
            initialize_adapter,
            run_topdown,
            enter_adapter,
            nullptr,
            nullptr,
            leave_adapter
        },
        {
            gbs::RuntimeKind::Platformer,
            initialize_adapter,
            run_platformer,
            enter_adapter,
            nullptr,
            nullptr,
            leave_adapter
        }
    };
    FakeRuntimeState state;
    fake_state = &state;
    gbs::RuntimeServices services {
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        initialize_services,
        on_service_frame
    };
    gbs::ProjectRuntime runtime {
        &registry,
        adapters,
        2,
        { transition_pending, transition_route, on_transition },
        &services,
        gbs::RuntimeKind::TopDown,
        0,
        nullptr
    };

    assert(gbs::run_project_runtime(runtime) == 7);
    assert(state.initialize_calls == 2);
    assert(state.topdown_runs == 1);
    assert(state.platformer_runs == 1);
    assert(state.transition_hooks == 1);
    assert(state.phase_count == 9);
    const char expected_phases[] = { 'I', 'E', 'T', 'L', 'H', 'I', 'E', 'P', 'L' };
    for (int index = 0; index < state.phase_count; ++index) {
        assert(state.phase_trace[index] == expected_phases[index]);
    }
    assert(state.service_initialize_calls == 1);
    assert(runtime.active_runtime == gbs::RuntimeKind::Platformer);
    assert(runtime.active_scene == 1);
    assert(gbs::active_runtime_services() == &services);

    gbs::FrameContext frame_state {};
    gbs::runtime_frame_tick(10, frame_state);
    gbs::runtime_frame_tick(11, frame_state);
    assert(state.service_frame_calls == 2);
    assert(state.last_frame.active_runtime == gbs::RuntimeKind::Platformer);
    assert(state.last_frame.active_scene == 1);
    assert(state.last_frame.frame_state != nullptr);
}

void test_runtime_adapter_frame_dispatches_update_and_render() {
    FakeRuntimeState state;
    fake_state = &state;
    const gbs::RuntimeAdapter adapter {
        gbs::RuntimeKind::TopDown,
        nullptr,
        nullptr,
        nullptr,
        update_frame,
        render_frame,
        nullptr
    };
    gbs::FrameContext frame_state {};
    frame_state.render_enabled = true;
    const gbs::RuntimeFrameContext context {
        4,
        gbs::RuntimeKind::TopDown,
        0,
        &frame_state,
        0
    };

    assert(gbs::run_runtime_adapter_frame(adapter, context) == gbs::RuntimeAdapterFrameResult::Continue);
    assert(state.update_calls == 1);
    assert(state.render_calls == 1);
    assert(state.last_frame.frame == 4);
}

void test_runtime_adapter_frame_rejects_missing_update_and_skips_disabled_render() {
    FakeRuntimeState state;
    fake_state = &state;
    const gbs::RuntimeAdapter missing_update {
        gbs::RuntimeKind::TopDown,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        render_frame,
        nullptr
    };
    const gbs::RuntimeFrameContext context_without_update {
        0,
        gbs::RuntimeKind::TopDown,
        0,
        nullptr,
        0
    };
    assert(gbs::run_runtime_adapter_frame(missing_update, context_without_update) == gbs::RuntimeAdapterFrameResult::Error);
    assert(state.update_calls == 0);
    assert(state.render_calls == 0);

    const gbs::RuntimeAdapter disabled_render {
        gbs::RuntimeKind::TopDown,
        nullptr,
        nullptr,
        nullptr,
        update_frame,
        render_frame,
        nullptr
    };
    gbs::FrameContext frame_state {};
    frame_state.render_enabled = false;
    const gbs::RuntimeFrameContext disabled_context {
        1,
        gbs::RuntimeKind::TopDown,
        0,
        &frame_state,
        0
    };
    assert(gbs::run_runtime_adapter_frame(disabled_render, disabled_context) == gbs::RuntimeAdapterFrameResult::Continue);
    assert(state.update_calls == 1);
    assert(state.render_calls == 0);
}

void test_runtime_adapter_frame_preserves_results_and_allows_render_without_frame_state() {
    FakeRuntimeState state;
    fake_state = &state;
    const gbs::RuntimeAdapter adapter {
        gbs::RuntimeKind::TopDown,
        nullptr,
        nullptr,
        nullptr,
        update_frame,
        render_frame,
        nullptr
    };
    const gbs::RuntimeAdapterFrameResult expected_results[] = {
        gbs::RuntimeAdapterFrameResult::Continue,
        gbs::RuntimeAdapterFrameResult::Transition,
        gbs::RuntimeAdapterFrameResult::Complete,
        gbs::RuntimeAdapterFrameResult::Error
    };

    for (const gbs::RuntimeAdapterFrameResult expected : expected_results) {
        state.update_calls = 0;
        state.render_calls = 0;
        state.next_frame_result = expected;
        const gbs::RuntimeFrameContext context {
            2,
            gbs::RuntimeKind::TopDown,
            0,
            nullptr,
            0
        };
        assert(gbs::run_runtime_adapter_frame(adapter, context) == expected);
        assert(state.update_calls == 1);
        assert(state.render_calls == (expected == gbs::RuntimeAdapterFrameResult::Error ? 0 : 1));
    }
}

void test_project_runtime_pumps_frame_adapter_before_legacy_transition() {
    static constexpr gbs::RuntimeSceneDescriptor scenes[] = {
        { "town", gbs::RuntimeKind::TopDown, 0 },
        { "stage", gbs::RuntimeKind::Platformer, 0 }
    };
    static constexpr gbs::RuntimeSceneRegistry registry { scenes, 2, 0 };
    const gbs::RuntimeAdapter adapters[] = {
        {
            gbs::RuntimeKind::TopDown,
            initialize_adapter,
            run_topdown,
            enter_adapter,
            update_frame,
            render_frame,
            leave_adapter
        },
        { gbs::RuntimeKind::Platformer, initialize_adapter, run_platformer }
    };
    FakeRuntimeState state;
    state.frame_results[0] = gbs::RuntimeAdapterFrameResult::Continue;
    state.frame_results[1] = gbs::RuntimeAdapterFrameResult::Transition;
    state.frame_result_count = 2;
    fake_state = &state;
    gbs::RuntimeServices services {
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        initialize_services,
        on_service_frame
    };
    gbs::ProjectRuntime runtime {
        &registry,
        adapters,
        2,
        { transition_pending, transition_route, on_transition },
        &services,
        gbs::RuntimeKind::TopDown,
        0,
        nullptr
    };

    assert(gbs::run_project_runtime(runtime) == 7);
    assert(state.initialize_calls == 2);
    assert(state.update_calls == 2);
    assert(state.render_calls == 2);
    assert(state.topdown_runs == 0);
    assert(state.platformer_runs == 1);
    assert(state.transition_hooks == 1);
    assert(state.phase_count == 10);
    const char expected_phases[] = { 'I', 'E', 'U', 'V', 'U', 'V', 'L', 'H', 'I', 'P' };
    for (int index = 0; index < state.phase_count; ++index) {
        assert(state.phase_trace[index] == expected_phases[index]);
    }
    assert(state.last_frame.active_runtime == gbs::RuntimeKind::TopDown);
}

void test_project_runtime_rejects_unknown_transition_route() {
    static constexpr gbs::RuntimeSceneDescriptor scenes[] = {
        { "town", gbs::RuntimeKind::TopDown, 0 }
    };
    static constexpr gbs::RuntimeSceneRegistry registry { scenes, 1, 0 };
    const gbs::RuntimeAdapter adapters[] = {
        { gbs::RuntimeKind::TopDown, initialize_adapter, run_topdown }
    };
    FakeRuntimeState state;
    fake_state = &state;
    gbs::RuntimeServices services {
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        initialize_services,
        on_service_frame
    };
    gbs::ProjectRuntime runtime {
        &registry,
        adapters,
        1,
        {
            transition_pending,
            [](gbs::RuntimeTransitionRoute& route) {
                route = gbs::RuntimeTransitionRoute { gbs::RuntimeKind::Platformer, 99 };
                return true;
            },
            on_transition
        },
        &services,
        gbs::RuntimeKind::TopDown,
        0,
        nullptr
    };

    assert(gbs::run_project_runtime(runtime) == -1);
    assert(state.initialize_calls == 1);
    assert(state.topdown_runs == 1);
}

void test_project_runtime_rejects_missing_shared_services() {
    static constexpr gbs::RuntimeSceneDescriptor scenes[] = {
        { "town", gbs::RuntimeKind::TopDown, 0 }
    };
    static constexpr gbs::RuntimeSceneRegistry registry { scenes, 1, 0 };
    const gbs::RuntimeAdapter adapters[] = {
        { gbs::RuntimeKind::TopDown, initialize_adapter, run_topdown }
    };
    FakeRuntimeState state;
    fake_state = &state;
    gbs::ProjectRuntime runtime {
        &registry,
        adapters,
        1,
        { transition_pending, transition_route, on_transition },
        nullptr,
        gbs::RuntimeKind::TopDown,
        0,
        nullptr
    };

    assert(gbs::run_project_runtime(runtime) == -1);
    assert(state.initialize_calls == 0);
}

} // namespace

int main() {
    test_registry_finds_scene_by_runtime_and_local_index();
    test_project_runtime_dispatches_adapters_and_transition();
    test_runtime_adapter_frame_dispatches_update_and_render();
    test_runtime_adapter_frame_rejects_missing_update_and_skips_disabled_render();
    test_runtime_adapter_frame_preserves_results_and_allows_render_without_frame_state();
    test_project_runtime_pumps_frame_adapter_before_legacy_transition();
    test_project_runtime_rejects_unknown_transition_route();
    test_project_runtime_rejects_missing_shared_services();
    return 0;
}
