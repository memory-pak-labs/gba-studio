#include <assert.h>

#include "gbs/runtime.hpp"
#include "gbs/runtime_capabilities.hpp"

namespace {

int finish_runtime() {
    return 0;
}

void no_adapter_enter(const gbs::RuntimeAdapter&) {}
void no_adapter_leave(const gbs::RuntimeAdapter&) {}
void no_adapter_render(const gbs::RuntimeFrameContext&) {}
gbs::RuntimeAdapterFrameResult complete_frame(const gbs::RuntimeFrameContext&) {
    return gbs::RuntimeAdapterFrameResult::Complete;
}

bool no_transition() {
    return false;
}

bool no_route(gbs::RuntimeTransitionRoute&) {
    return false;
}

void no_transition_hook() {}

} // namespace

int main() {
    static constexpr gbs::RuntimeCapabilityDescriptor capabilities[] = {
        { gbs::RuntimeCapabilityID::Save, true, true },
        { gbs::RuntimeCapabilityID::Rtc, true, true },
        { gbs::RuntimeCapabilityID::Link, false, false },
        { gbs::RuntimeCapabilityID::Affine, true, true }
    };
    constexpr gbs::RuntimeCapabilityManifest manifest {
        1,
        capabilities,
        sizeof(capabilities) / sizeof(capabilities[0])
    };

    static_assert(gbs::is_valid_runtime_capability_manifest(manifest));
    static_assert(gbs::runtime_capability_enabled(manifest, gbs::RuntimeCapabilityID::Rtc));
    static_assert(!gbs::runtime_capability_enabled(manifest, gbs::RuntimeCapabilityID::Link));
    assert(gbs::find_runtime_capability(manifest, gbs::RuntimeCapabilityID::Affine) != nullptr);
    assert(gbs::find_runtime_capability(manifest, gbs::RuntimeCapabilityID::Affine)->required);

    gbs::RuntimeServices services {
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr
    };
    gbs::RtcDateTime value { 2001, 1, 1, 1, 0, 0, 0 };
    gbs::RtcProvider provider {
        [](void*, gbs::RtcDateTime& out) {
            out = gbs::RtcDateTime { 2026, 9, 1, 2, 3, 4, 5 };
            return true;
        },
        nullptr
    };
    services.rtc = &provider;
    gbs::RuntimeAdapter adapter {
        gbs::RuntimeKind::TopDown,
        nullptr,
        finish_runtime,
        no_adapter_enter,
        complete_frame,
        no_adapter_render,
        no_adapter_leave
    };
    static constexpr gbs::RuntimeSceneDescriptor scenes[] = {
        { "start", gbs::RuntimeKind::TopDown, 0 }
    };
    static constexpr gbs::RuntimeSceneRegistry registry { scenes, 1, 0 };
    gbs::ProjectRuntime runtime {
        &registry,
        &adapter,
        1,
        { no_transition, no_route, no_transition_hook },
        &services,
        gbs::RuntimeKind::TopDown,
        0,
        &manifest
    };
    assert(gbs::run_project_runtime(runtime) == 0);
    assert(gbs::active_runtime_rtc_provider() == &provider);
    assert(gbs::runtime_read_rtc_datetime(value));
    assert(value.year == 2026 && value.hour == 3 && value.second == 5);

    static constexpr gbs::RuntimeCapabilityDescriptor disabled_capabilities[] = {
        { gbs::RuntimeCapabilityID::Save, true, true },
        { gbs::RuntimeCapabilityID::Rtc, false, false },
        { gbs::RuntimeCapabilityID::Link, false, false },
        { gbs::RuntimeCapabilityID::Affine, false, false }
    };
    static constexpr gbs::RuntimeCapabilityManifest disabled_manifest {
        1,
        disabled_capabilities,
        sizeof(disabled_capabilities) / sizeof(disabled_capabilities[0])
    };
    runtime.capabilities = &disabled_manifest;
    assert(gbs::run_project_runtime(runtime) == 0);
    assert(!gbs::runtime_read_rtc_datetime(value));
    return 0;
}
