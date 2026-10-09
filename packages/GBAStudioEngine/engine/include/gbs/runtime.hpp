#pragma once

#include <stddef.h>
#include <stdint.h>

#include "gbs/event.hpp"
#include "gbs/frame.hpp"
#include "gbs/link.hpp"
#include "gbs/runtime_capabilities.hpp"
#include "gbs/runtime_save_restore.hpp"
#include "gbs/rtc.hpp"

namespace gbs {

struct RuntimeSceneDescriptor {
    const char* name;
    RuntimeKind runtime;
    int local_index;
};

struct RuntimeSceneRegistry {
    const RuntimeSceneDescriptor* scenes;
    size_t scene_count;
    int initial_scene;
};

struct RuntimeTransitionRoute {
    RuntimeKind runtime;
    int local_index;
};

struct RuntimeFrameContext {
    uint32_t frame;
    RuntimeKind active_runtime;
    int active_scene;
    const FrameContext* frame_state;
    uint32_t transition_count;
};

enum class RuntimeAdapterFrameResult : uint8_t {
    Continue = 0,
    Transition = 1,
    Complete = 2,
    Error = 3
};

struct RuntimeServices;
using RuntimeServicesInitialize = void (*)(const RuntimeServices& services);
using RuntimeServicesFrame = void (*)(const RuntimeFrameContext& context);

// These pointers are owned by the generated project. The runtime only keeps
// the references for the duration of the project and never allocates or frees
// service state. This lets adapters share the same audio/resource/save/debug
// contracts without changing their existing C entry points.
struct RuntimeServices {
    void* audio;
    void* resources;
    RuntimeSaveService* save;
    void* diagnostics;
    RuntimeServicesInitialize initialize;
    RuntimeServicesFrame on_frame;
    RtcProvider* rtc = nullptr;
    RuntimeLinkService* link = nullptr;
};

struct RuntimeAdapter;
using RuntimeAdapterInitialize = void (*)(const RuntimeAdapter& adapter);
using RuntimeAdapterEntry = int (*)();
using RuntimeAdapterEnter = void (*)(const RuntimeAdapter& adapter);
using RuntimeAdapterUpdate = RuntimeAdapterFrameResult (*)(const RuntimeFrameContext& context);
using RuntimeAdapterRender = void (*)(const RuntimeFrameContext& context);
using RuntimeAdapterLeave = void (*)(const RuntimeAdapter& adapter);

struct RuntimeAdapter {
    RuntimeKind runtime;
    RuntimeAdapterInitialize initialize;
    RuntimeAdapterEntry run;
    RuntimeAdapterEnter enter = nullptr;
    RuntimeAdapterUpdate update = nullptr;
    RuntimeAdapterRender render = nullptr;
    RuntimeAdapterLeave leave = nullptr;
};

struct ProjectRuntimeHooks {
    bool (*transition_pending)();
    bool (*transition_route)(RuntimeTransitionRoute& route);
    void (*on_transition)();
};

struct ProjectRuntime {
    const RuntimeSceneRegistry* registry;
    const RuntimeAdapter* adapters;
    size_t adapter_count;
    ProjectRuntimeHooks hooks;
    RuntimeServices* services;
    RuntimeKind active_runtime;
    int active_scene;
    const RuntimeCapabilityManifest* capabilities;
};

constexpr const RuntimeSceneDescriptor* find_runtime_scene(
    const RuntimeSceneRegistry& registry,
    RuntimeKind runtime,
    int local_index
) {
    if (registry.scenes == nullptr) return nullptr;
    for (size_t index = 0; index < registry.scene_count; ++index) {
        const RuntimeSceneDescriptor& scene = registry.scenes[index];
        if (scene.runtime == runtime && scene.local_index == local_index) {
            return &scene;
        }
    }
    return nullptr;
}

constexpr int runtime_scene_index(
    const RuntimeSceneRegistry& registry,
    const RuntimeSceneDescriptor& scene
) {
    if (registry.scenes == nullptr) return -1;
    for (size_t index = 0; index < registry.scene_count; ++index) {
        if (&registry.scenes[index] == &scene) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

constexpr bool is_valid_runtime_scene_registry(const RuntimeSceneRegistry& registry) {
    return registry.scenes != nullptr &&
           registry.scene_count > 0 &&
           registry.initial_scene >= 0 &&
           static_cast<size_t>(registry.initial_scene) < registry.scene_count;
}

int run_project_runtime(ProjectRuntime& runtime);
RuntimeAdapterFrameResult run_runtime_adapter_frame(
    const RuntimeAdapter& adapter,
    const RuntimeFrameContext& context
);
const RuntimeServices* active_runtime_services();
const RuntimeCapabilityManifest* active_runtime_capabilities();
RuntimeSaveService* active_runtime_save_service();
RuntimeAvailabilityMask active_runtime_availability();
RtcProvider* active_runtime_rtc_provider();
bool runtime_read_rtc_datetime(RtcDateTime& out);
RuntimeLinkService* active_runtime_link_service();
const RuntimeFrameContext& runtime_frame_context();
void runtime_frame_tick();
void runtime_frame_tick(uint32_t frame, const FrameContext& frame_state);

} // namespace gbs
