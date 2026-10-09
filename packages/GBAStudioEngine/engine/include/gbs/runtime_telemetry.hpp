#pragma once

#include <stdint.h>

#include "gbs/audio.hpp"
#include "gbs/debug.hpp"
#include "gbs/dma.hpp"
#include "gbs/event.hpp"
#include "gbs/resource_manager.hpp"

namespace gbs {

constexpr uint32_t runtime_event_state_bytes(const EventState&) {
    // EventState is the bounded, resident event workspace used by every
    // exported runtime. It is the physical event footprint, not a guess from
    // the editor's command count.
    return static_cast<uint32_t>(sizeof(EventState));
}

inline RuntimePhysicalTelemetry capture_runtime_physical_telemetry(
    const EngineResourceManager& resource_manager,
    const EventState& event_state
) {
    const EngineResourceUsage resources = capture_engine_resident_resource_usage(resource_manager);
    const DmaQueueStats dma = dma_vblank_queue_stats();
    const AudioRuntimeUsage audio = audio_runtime_usage();
    const uint32_t bg_tiles = resources.bg_tiles.used;
    const uint32_t obj_tiles = resources.obj_tiles.used;
    const uint32_t vram_bytes = (bg_tiles + obj_tiles) * static_cast<uint32_t>(bytes_per_4bpp_tile);
    const uint32_t palette_colors = resources.bg_palette.used + resources.obj_palette.used;

    return RuntimePhysicalTelemetry {
        runtime_physical_non_timing_bits,
        bg_tiles,
        obj_tiles,
        resources.oam_sprites.used,
        palette_colors,
        vram_bytes,
        runtime_event_state_bytes(event_state),
        audio.bytes,
        static_cast<uint32_t>(dma.queued_bytes),
        0,
        0
    };
}

inline void publish_runtime_physical_telemetry(
    const EngineResourceManager& resource_manager,
    const EventState& event_state
) {
    debug_set_runtime_physical_telemetry(
        capture_runtime_physical_telemetry(resource_manager, event_state)
    );
}

} // namespace gbs
