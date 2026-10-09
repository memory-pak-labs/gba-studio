#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

enum class RuntimeCapabilityID : uint8_t {
    Save = 0,
    Rtc = 1,
    Link = 2,
    Affine = 3
};

struct RuntimeCapabilityDescriptor {
    RuntimeCapabilityID id;
    bool enabled;
    bool required;
};

struct RuntimeCapabilityManifest {
    uint16_t schema;
    const RuntimeCapabilityDescriptor* capabilities;
    size_t capability_count;
};

constexpr bool is_valid_runtime_capability_manifest(const RuntimeCapabilityManifest& manifest) {
    return manifest.schema == 1 &&
           manifest.capabilities != nullptr &&
           manifest.capability_count > 0;
}

constexpr const RuntimeCapabilityDescriptor* find_runtime_capability(
    const RuntimeCapabilityManifest& manifest,
    RuntimeCapabilityID id
) {
    if (manifest.capabilities == nullptr) return nullptr;
    for (size_t index = 0; index < manifest.capability_count; ++index) {
        if (manifest.capabilities[index].id == id) {
            return &manifest.capabilities[index];
        }
    }
    return nullptr;
}

constexpr bool runtime_capability_enabled(
    const RuntimeCapabilityManifest& manifest,
    RuntimeCapabilityID id
) {
    const RuntimeCapabilityDescriptor* capability = find_runtime_capability(manifest, id);
    return capability != nullptr && capability->enabled;
}

} // namespace gbs
