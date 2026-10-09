#include "gbs/runtime.hpp"

namespace gbs {

namespace {

const RuntimeServices* active_services = nullptr;
const RuntimeCapabilityManifest* active_capabilities = nullptr;
RuntimeAvailabilityMask active_availability = 0;
RuntimeFrameContext active_frame_context {};

const RuntimeAdapter* find_runtime_adapter(const ProjectRuntime& runtime, RuntimeKind kind) {
    if (runtime.adapters == nullptr) return nullptr;
    for (size_t index = 0; index < runtime.adapter_count; ++index) {
        if (runtime.adapters[index].runtime == kind) {
            return &runtime.adapters[index];
        }
    }
    return nullptr;
}

bool is_valid_active_scene(const ProjectRuntime& runtime) {
    if (runtime.registry == nullptr || !is_valid_runtime_scene_registry(*runtime.registry)) {
        return false;
    }
    if (runtime.active_scene < 0 || static_cast<size_t>(runtime.active_scene) >= runtime.registry->scene_count) {
        return false;
    }
    return runtime.registry->scenes[runtime.active_scene].runtime == runtime.active_runtime;
}

bool has_frame_lifecycle(const RuntimeAdapter& adapter) {
    return adapter.enter != nullptr &&
           adapter.update != nullptr &&
           adapter.render != nullptr &&
           adapter.leave != nullptr;
}

} // namespace

const RuntimeServices* active_runtime_services() {
    return active_services;
}

RuntimeAvailabilityMask active_runtime_availability() {
    return active_availability;
}

const RuntimeCapabilityManifest* active_runtime_capabilities() {
    return active_capabilities;
}

RuntimeSaveService* active_runtime_save_service() {
    return active_services == nullptr ? nullptr : active_services->save;
}

RtcProvider* active_runtime_rtc_provider() {
    return active_services == nullptr ? nullptr : active_services->rtc;
}

bool runtime_read_rtc_datetime(RtcDateTime& out) {
    if (active_services == nullptr || active_capabilities == nullptr ||
        !runtime_capability_enabled(*active_capabilities, RuntimeCapabilityID::Rtc) ||
        active_services->rtc == nullptr) {
        return false;
    }
    return rtc_read_datetime(*active_services->rtc, out);
}

RuntimeLinkService* active_runtime_link_service() {
    return active_services == nullptr ? nullptr : active_services->link;
}

const RuntimeFrameContext& runtime_frame_context() {
    return active_frame_context;
}

void runtime_frame_tick() {
    if (active_services == nullptr) {
        return;
    }
    ++active_frame_context.frame;
    active_frame_context.frame_state = nullptr;
    if (active_services->on_frame != nullptr) {
        active_services->on_frame(active_frame_context);
    }
}

void runtime_frame_tick(uint32_t frame, const FrameContext& frame_state) {
    if (active_services == nullptr) {
        return;
    }
    active_frame_context.frame = frame;
    active_frame_context.frame_state = &frame_state;
    if (active_services->on_frame != nullptr) {
        active_services->on_frame(active_frame_context);
    }
}

RuntimeAdapterFrameResult run_runtime_adapter_frame(
    const RuntimeAdapter& adapter,
    const RuntimeFrameContext& context
) {
    if (adapter.update == nullptr) {
        return RuntimeAdapterFrameResult::Error;
    }

    const RuntimeAdapterFrameResult result = adapter.update(context);
    if (result != RuntimeAdapterFrameResult::Error &&
        adapter.render != nullptr &&
        (context.frame_state == nullptr || context.frame_state->render_enabled)) {
        adapter.render(context);
    }
    return result;
}

int run_project_runtime(ProjectRuntime& runtime) {
    if (!is_valid_active_scene(runtime) ||
        runtime.adapters == nullptr ||
        runtime.adapter_count == 0 ||
        runtime.hooks.transition_pending == nullptr ||
        runtime.hooks.transition_route == nullptr ||
        runtime.services == nullptr ||
        (runtime.capabilities != nullptr && !is_valid_runtime_capability_manifest(*runtime.capabilities))) {
        return -1;
    }

    active_services = runtime.services;
    active_capabilities = runtime.capabilities;
    active_availability = 0;
    for (size_t index = 0; index < runtime.adapter_count; ++index)
        active_availability |= runtime_availability(runtime.adapters[index].runtime);
    active_frame_context = RuntimeFrameContext {
        0,
        runtime.active_runtime,
        runtime.active_scene,
        nullptr,
        0
    };
    if (active_services->initialize != nullptr) {
        active_services->initialize(*active_services);
    }

    while (true) {
        const RuntimeAdapter* adapter = find_runtime_adapter(runtime, runtime.active_runtime);
        if (adapter == nullptr) {
            return -1;
        }

        if (adapter->initialize != nullptr) {
            adapter->initialize(*adapter);
        }

        bool transition_requested = false;
        if (has_frame_lifecycle(*adapter)) {
            adapter->enter(*adapter);
            RuntimeAdapterFrameResult frame_result = RuntimeAdapterFrameResult::Continue;
            while (frame_result == RuntimeAdapterFrameResult::Continue) {
                frame_result = run_runtime_adapter_frame(*adapter, runtime_frame_context());
            }
            adapter->leave(*adapter);
            if (frame_result == RuntimeAdapterFrameResult::Error) {
                return -1;
            }
            if (frame_result == RuntimeAdapterFrameResult::Complete) {
                return 0;
            }
            transition_requested = frame_result == RuntimeAdapterFrameResult::Transition;
        } else {
            if (adapter->run == nullptr) {
                return -1;
            }
            if (adapter->enter != nullptr) {
                adapter->enter(*adapter);
            }

            const int result = adapter->run();
            if (adapter->leave != nullptr) {
                adapter->leave(*adapter);
            }
            if (result != 0) {
                return result;
            }
            transition_requested = true;
        }

        if (!transition_requested || !runtime.hooks.transition_pending()) {
            return -1;
        }

        RuntimeTransitionRoute route {};
        if (!runtime.hooks.transition_route(route) ||
            runtime.registry == nullptr) {
            return -1;
        }
        const RuntimeSceneDescriptor* next_scene = find_runtime_scene(
            *runtime.registry,
            route.runtime,
            route.local_index
        );
        if (next_scene == nullptr) {
            return -1;
        }

        runtime.active_runtime = route.runtime;
        runtime.active_scene = runtime_scene_index(*runtime.registry, *next_scene);
        if (runtime.active_scene < 0) {
            return -1;
        }
        ++active_frame_context.transition_count;
        active_frame_context.active_runtime = runtime.active_runtime;
        active_frame_context.active_scene = runtime.active_scene;
        if (runtime.hooks.on_transition != nullptr) {
            runtime.hooks.on_transition();
        }
    }
}

} // namespace gbs
