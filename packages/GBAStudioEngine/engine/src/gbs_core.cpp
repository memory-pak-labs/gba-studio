#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/deferred_work.hpp"
#include "gbs/dma.hpp"
#include "gbs/render.hpp"
#include "gbs/rumble.hpp"
#include "gbs/runtime.hpp"
#include "gbs/visual_effects.hpp"
#include "gbs_hw.h"

namespace {
uint32_t g_frame_count = 0;
gbs::FrameSchedulerConfig scheduler_config {
    gbs::FrameSkipPolicy::Disabled,
    gbs::default_frame_budget_ticks,
    1,
};
gbs::FrameTiming last_timing {};
gbs::FrameContext current_context {};
uint32_t frame_start_ticks = 0;
uint8_t pending_render_skips = 0;
bool frame_active = false;
bool render_publication_transaction = false;
bool runtime_handoff_active = false;

uint32_t elapsed_ticks(uint32_t start, uint32_t end) {
    return end - start;
}

uint32_t missed_frames_for(uint32_t work_ticks) {
    if (scheduler_config.cpu_budget_ticks == 0 || work_ticks <= scheduler_config.cpu_budget_ticks) {
        return 0;
    }
    return (work_ticks - 1u) / scheduler_config.cpu_budget_ticks;
}

void publish_frame_telemetry() {
    volatile gbs::RuntimeTelemetryBlock& telemetry = gbs::runtime_telemetry_block();
    telemetry.magic = gbs::runtime_telemetry_magic;
    telemetry.schema = gbs::runtime_telemetry_schema;
    telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    telemetry.frame = g_frame_count;
    telemetry.cpu_work_ticks = last_timing.cpu_work_ticks;
    telemetry.vblank_wait_ticks = last_timing.vblank_wait_ticks;
    telemetry.peak_cpu_work_ticks = last_timing.peak_cpu_work_ticks;
    telemetry.peak_vblank_wait_ticks = last_timing.peak_vblank_wait_ticks;
    telemetry.missed_frame_count = last_timing.total_missed_frames;
    telemetry.render_skip_count = last_timing.total_render_skips;
    telemetry.physical_valid_bits |=
        gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::CpuWorkTicks) |
        gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::VblankTicks);
    const gbs::AudioRuntimeUsage audio = gbs::audio_runtime_usage();
    telemetry.physical_audio_bytes = audio.bytes;
    telemetry.physical_valid_bits |=
        gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::AudioBytes);
    telemetry.audio_pcm_source_bytes = audio.pcm_source_bytes;
    telemetry.audio_mixer_buffer_bytes = audio.mixer_buffer_bytes;
    telemetry.audio_active_voice_count = audio.active_voice_count;
    telemetry.audio_pcm_underrun_count = audio.pcm_underrun_count;
    telemetry.audio_pcm_submitted_blocks = audio.pcm_submitted_blocks;
    const int32_t runtime_kind = gbs::debug_runtime_kind();
    const uint32_t encoded_runtime_kind = runtime_kind >= 0
        ? static_cast<uint32_t>(runtime_kind + 1)
        : 0u;
    telemetry.frame_skip_policy =
        (static_cast<uint32_t>(scheduler_config.skip_policy) & 0xFFu) |
        ((encoded_runtime_kind & 0xFFu) << 8u);
    telemetry.input_held = current_context.input.held;
    telemetry.input_pressed = current_context.input.pressed;
    telemetry.input_released = current_context.input.released;
    gbs::sync_legacy_runtime_telemetry();
}
}

namespace gbs {

// The host core tests intentionally do not link the visual-effects module.
// The packaged engine provides strong implementations; these weak fallbacks
// keep the frame scheduler linkable in focused non-rendering tests.
void __attribute__((weak)) reset_scene_transition_visual_effects() {}
void __attribute__((weak)) render_scene_transition_visual_effects() {}
void __attribute__((weak)) tick_scene_transition_visual_effects() {}

void init() {
    const bool preserve_runtime_handoff = runtime_handoff_active;
    dma_reset_vblank_queue();
    gbs_hw_init();
    gbs_hw_frame_counter_init();
    render_init();
    audio_init();
    reset_scene_transition_visual_effects();
    reset_input();
    reset_runtime_telemetry();
    deferred_work_init(deferred_work_queue());
    input_repeat_init(input_repeat_state());
    rumble_init();
    g_frame_count = 0;
    last_timing = FrameTiming {};
    current_context = FrameContext {};
    pending_render_skips = 0;
    frame_active = false;
    render_publication_transaction = preserve_runtime_handoff;
    runtime_handoff_active = preserve_runtime_handoff;
    gbs_hw_set_render_publication_blocked(preserve_runtime_handoff ? 1 : 0);
    frame_start_ticks = gbs_hw_frame_counter_ticks();
}

void wait_vblank() {
    if (!frame_active) {
        debug_begin_runtime_physical_sample();
        current_context.frame = g_frame_count;
        current_context.input = InputState {};
        current_context.previous_timing = last_timing;
        current_context.render_enabled = true;
        frame_active = true;
        input_update_repeat(input_repeat_state(), current_context.input);
    }
    deferred_work_drain(deferred_work_queue());
    rumble_update();
    audio_update();
    render_scene_transition_visual_effects();
    const uint32_t before_vblank = gbs_hw_frame_counter_ticks();
    gbs_hw_set_render_publication_blocked(render_publication_transaction ? 1 : 0);
    gbs_hw_wait_vblank();
    const uint32_t after_vblank_wait = gbs_hw_frame_counter_ticks();
    dma_flush_vblank_queue_budget(DmaChannel::Channel3, dma_default_vblank_budget_bytes);
    if (render_publication_transaction && dma_vblank_queue_count() == 0) {
        render_publication_transaction = false;
        runtime_handoff_active = false;
    }
    gbs_hw_set_render_publication_blocked(render_publication_transaction ? 1 : 0);
    tick_scene_transition_visual_effects();
    const uint32_t frame_end_ticks = gbs_hw_frame_counter_ticks();
    const uint32_t work_ticks = elapsed_ticks(frame_start_ticks, before_vblank);
    const uint32_t vblank_ticks = elapsed_ticks(before_vblank, after_vblank_wait);
    const uint32_t missed_frames = missed_frames_for(work_ticks);
    ++g_frame_count;

    last_timing.frame = current_context.frame;
    last_timing.cpu_work_ticks = work_ticks;
    last_timing.vblank_wait_ticks = vblank_ticks;
    if (work_ticks > last_timing.peak_cpu_work_ticks) {
        last_timing.peak_cpu_work_ticks = work_ticks;
    }
    if (vblank_ticks > last_timing.peak_vblank_wait_ticks) {
        last_timing.peak_vblank_wait_ticks = vblank_ticks;
    }
    last_timing.missed_frames = missed_frames;
    last_timing.total_missed_frames += missed_frames;
    last_timing.rendered = current_context.render_enabled;
    if (!current_context.render_enabled) {
        ++last_timing.total_render_skips;
    }

    if (scheduler_config.skip_policy == FrameSkipPolicy::Adaptive && missed_frames > 0) {
        uint32_t requested_skips = missed_frames;
        if (requested_skips > scheduler_config.max_consecutive_render_skips) {
            requested_skips = scheduler_config.max_consecutive_render_skips;
        }
        if (requested_skips > pending_render_skips) {
            pending_render_skips = static_cast<uint8_t>(requested_skips);
        }
    }

    publish_frame_telemetry();
    runtime_frame_tick(g_frame_count, current_context);
    frame_active = false;
    frame_start_ticks = frame_end_ticks;
}

void configure_frame_scheduler(FrameSchedulerConfig config) {
    if (config.cpu_budget_ticks == 0) {
        config.cpu_budget_ticks = default_frame_budget_ticks;
    }
    scheduler_config = config;
    pending_render_skips = 0;
}

FrameSchedulerConfig frame_scheduler_config() {
    return scheduler_config;
}

const FrameContext& begin_frame() {
    if (frame_active) {
        return current_context;
    }
    frame_active = true;
    debug_begin_runtime_physical_sample();
    frame_start_ticks = gbs_hw_frame_counter_ticks();
    current_context.frame = g_frame_count;
    current_context.input = poll_input();
    input_update_repeat(input_repeat_state(), current_context.input);
    current_context.previous_timing = last_timing;
    current_context.render_enabled = pending_render_skips == 0;
    if (pending_render_skips > 0) {
        --pending_render_skips;
    }
    return current_context;
}

void end_frame() {
    wait_vblank();
}

void run_frame(FrameUpdateCallback callback, void* user_data) {
    const FrameContext& context = begin_frame();
    if (callback != nullptr) {
        callback(context, user_data);
    }
    end_frame();
}

void run_frame(FrameCallbacks callbacks, void* user_data) {
    const FrameContext& context = begin_frame();
    if (callbacks.update != nullptr) {
        callbacks.update(context, user_data);
    }
    if (context.render_enabled && callbacks.render != nullptr) {
        callbacks.render(context, user_data);
    }
    end_frame();
}

const FrameContext& frame_context() {
    return current_context;
}

FrameTiming frame_timing() {
    return last_timing;
}

void set_backdrop_color(uint16_t rgb15) {
    gbs_hw_set_backdrop(rgb15);
}

uint16_t backdrop_color() {
    return gbs_hw_get_backdrop();
}

uint32_t frame_count() {
    return g_frame_count;
}

void begin_runtime_handoff() {
    runtime_handoff_active = true;
    render_publication_transaction = true;
    gbs_hw_set_render_handoff_fallback();
    gbs_hw_set_render_publication_blocked(1);
}

void begin_render_publication_transaction() {
    render_publication_transaction = true;
    gbs_hw_set_render_publication_blocked(1);
}

bool render_publication_transaction_active() {
    return render_publication_transaction;
}

} // namespace gbs

extern "C" void gbs_start() {
    gbs::init();
    (void)gbs_main();
    while (true) {
        gbs::wait_vblank();
    }
}
