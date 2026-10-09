#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

constexpr size_t debug_label_length = 24u;
constexpr size_t debug_counter_count = 8u;
constexpr uint32_t runtime_telemetry_magic = 0x47535452u;
constexpr uint32_t runtime_telemetry_legacy_schema = 2u;
constexpr uint32_t runtime_telemetry_previous_schema = 3u;
constexpr uint32_t runtime_telemetry_schema = 4u;
constexpr size_t runtime_telemetry_variable_count = 16u;

enum class RuntimePhysicalMetric : uint8_t {
    BgTiles = 0,
    ObjTiles = 1,
    Oam = 2,
    PaletteColors = 3,
    VramBytes = 4,
    EventBytes = 5,
    AudioBytes = 6,
    DmaBytes = 7,
    VblankTicks = 8,
    CpuWorkTicks = 9,
};

constexpr uint32_t runtime_physical_metric_bit(RuntimePhysicalMetric metric) {
    return 1u << static_cast<uint8_t>(metric);
}

constexpr uint32_t runtime_physical_non_timing_bits =
    runtime_physical_metric_bit(RuntimePhysicalMetric::BgTiles) |
    runtime_physical_metric_bit(RuntimePhysicalMetric::ObjTiles) |
    runtime_physical_metric_bit(RuntimePhysicalMetric::Oam) |
    runtime_physical_metric_bit(RuntimePhysicalMetric::PaletteColors) |
    runtime_physical_metric_bit(RuntimePhysicalMetric::VramBytes) |
    runtime_physical_metric_bit(RuntimePhysicalMetric::EventBytes) |
    runtime_physical_metric_bit(RuntimePhysicalMetric::AudioBytes) |
    runtime_physical_metric_bit(RuntimePhysicalMetric::DmaBytes);

constexpr uint32_t runtime_physical_timing_bits =
    runtime_physical_metric_bit(RuntimePhysicalMetric::VblankTicks) |
    runtime_physical_metric_bit(RuntimePhysicalMetric::CpuWorkTicks);

struct RuntimePhysicalTelemetry {
    uint32_t valid_bits;
    uint32_t bg_tiles;
    uint32_t obj_tiles;
    uint32_t oam;
    uint32_t palette_colors;
    uint32_t vram_bytes;
    uint32_t event_bytes;
    uint32_t audio_bytes;
    uint32_t dma_bytes;
    uint32_t vblank_ticks;
    uint32_t cpu_work_ticks;
};

struct DebugAssertion {
    bool failed;
    char label[debug_label_length];
    uint32_t frame;
    uint16_t code;
};

struct DebugCounter {
    char label[debug_label_length];
    uint32_t value;
    uint32_t peak;
};

struct DebugFrameStats {
    uint32_t frame;
    uint32_t frame_count;
    uint32_t budget_units;
    uint32_t last_work_units;
    uint32_t peak_work_units;
    uint32_t over_budget_count;
};

struct RuntimeTelemetryBlock {
    uint32_t magic;
    uint32_t schema;
    uint32_t word_count;
    uint32_t frame;
    int32_t current_room;
    int32_t variables[runtime_telemetry_variable_count];
    uint32_t flag_bits;
    int32_t player_x;
    int32_t player_y;
    int32_t player_direction;
    uint32_t actor_count;
    int32_t first_actor_x;
    int32_t first_actor_y;
    int32_t first_actor_direction;
    uint32_t first_actor_visible;
    int32_t last_music;
    int32_t last_sfx;
    uint32_t current_tile_flags;
    uint32_t current_tile_slope;
    uint32_t seen_tile_effects;
    uint32_t seen_slope_bits;
    uint32_t trigger_enter_count;
    uint32_t trigger_leave_count;
    uint32_t room_change_count;
    uint32_t blocked_direction_bits;
    uint32_t cpu_work_ticks;
    uint32_t vblank_wait_ticks;
    uint32_t peak_cpu_work_ticks;
    uint32_t peak_vblank_wait_ticks;
    uint32_t missed_frame_count;
    uint32_t render_skip_count;
    uint32_t frame_skip_policy;
    uint32_t input_held;
    uint32_t input_pressed;
    uint32_t input_released;
    uint32_t physical_valid_bits;
    uint32_t physical_bg_tiles;
    uint32_t physical_obj_tiles;
    uint32_t physical_oam;
    uint32_t physical_palette_colors;
    uint32_t physical_vram_bytes;
    uint32_t physical_event_bytes;
    uint32_t physical_audio_bytes;
    uint32_t physical_dma_bytes;
    uint32_t audio_pcm_source_bytes;
    uint32_t audio_mixer_buffer_bytes;
    uint32_t audio_active_voice_count;
    uint32_t audio_pcm_underrun_count;
    uint32_t audio_pcm_submitted_blocks;
};

static_assert(sizeof(RuntimeTelemetryBlock) == 64 * sizeof(uint32_t), "runtime telemetry layout must remain stable");

struct RuntimeTelemetryLegacyBlock {
    uint32_t magic;
    uint32_t schema;
    uint32_t word_count;
    uint32_t frame;
    int32_t current_room;
    int32_t variables[runtime_telemetry_variable_count];
    uint32_t flag_bits;
    int32_t player_x;
    int32_t player_y;
    int32_t player_direction;
    uint32_t actor_count;
    int32_t first_actor_x;
    int32_t first_actor_y;
    int32_t first_actor_direction;
    uint32_t first_actor_visible;
    int32_t last_music;
    int32_t last_sfx;
    uint32_t current_tile_flags;
    uint32_t current_tile_slope;
    uint32_t seen_tile_effects;
    uint32_t seen_slope_bits;
    uint32_t trigger_enter_count;
    uint32_t trigger_leave_count;
    uint32_t room_change_count;
    uint32_t blocked_direction_bits;
    uint32_t cpu_work_ticks;
    uint32_t vblank_wait_ticks;
    uint32_t peak_cpu_work_ticks;
    uint32_t peak_vblank_wait_ticks;
    uint32_t missed_frame_count;
    uint32_t render_skip_count;
    uint32_t frame_skip_policy;
    uint32_t input_held;
    uint32_t input_pressed;
    uint32_t input_released;
};

static_assert(sizeof(RuntimeTelemetryLegacyBlock) == 50 * sizeof(uint32_t), "legacy runtime telemetry layout must remain stable");

void debug_reset();
volatile RuntimeTelemetryBlock& runtime_telemetry_block();
volatile RuntimeTelemetryLegacyBlock& runtime_telemetry_legacy_block();
void debug_set_runtime_kind(int32_t runtime_kind);
int32_t debug_runtime_kind();
void reset_runtime_telemetry();
void sync_legacy_runtime_telemetry();
void debug_begin_runtime_physical_sample();
void debug_set_runtime_physical_telemetry(const RuntimePhysicalTelemetry& telemetry);
bool debug_assert(bool condition, const char* label, uint16_t code = 0);
bool debug_assertion_failed();
DebugAssertion debug_last_assertion();
void debug_set_frame_budget(uint32_t budget_units);
void debug_begin_frame(uint32_t frame);
void debug_end_frame(uint32_t work_units);
DebugFrameStats debug_frame_stats();
bool debug_set_counter(size_t index, const char* label, uint32_t value);
bool debug_add_counter(size_t index, uint32_t delta);
DebugCounter debug_counter(size_t index);
const char* debug_overlay_text();
void draw_debug_overlay(bool visible);

} // namespace gbs
