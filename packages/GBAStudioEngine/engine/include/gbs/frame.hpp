#pragma once

#include <stdint.h>
#include "gbs/input.hpp"

namespace gbs {

constexpr uint32_t frame_counter_ticks_per_second = 262144u;
constexpr uint32_t default_frame_budget_ticks = 4370u;

enum class FrameSkipPolicy : uint8_t {
    Disabled = 0,
    Adaptive = 1,
};

struct FrameSchedulerConfig {
    FrameSkipPolicy skip_policy;
    uint32_t cpu_budget_ticks;
    uint8_t max_consecutive_render_skips;
};

struct FrameTiming {
    uint32_t frame;
    uint32_t cpu_work_ticks;
    uint32_t vblank_wait_ticks;
    uint32_t peak_cpu_work_ticks;
    uint32_t peak_vblank_wait_ticks;
    uint32_t missed_frames;
    uint32_t total_missed_frames;
    uint32_t total_render_skips;
    bool rendered;
};

struct FrameContext {
    uint32_t frame;
    InputState input;
    FrameTiming previous_timing;
    bool render_enabled;
};

using FrameUpdateCallback = void (*)(const FrameContext& context, void* user_data);
using FrameRenderCallback = void (*)(const FrameContext& context, void* user_data);

struct FrameCallbacks {
    FrameUpdateCallback update;
    FrameRenderCallback render;
};

void configure_frame_scheduler(FrameSchedulerConfig config);
FrameSchedulerConfig frame_scheduler_config();
const FrameContext& begin_frame();
void end_frame();
void run_frame(FrameUpdateCallback callback, void* user_data = nullptr);
void run_frame(FrameCallbacks callbacks, void* user_data = nullptr);
const FrameContext& frame_context();
FrameTiming frame_timing();

} // namespace gbs
