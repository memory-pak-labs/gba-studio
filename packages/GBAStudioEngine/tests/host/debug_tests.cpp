#include <cassert>
#include <cstring>
#include "gbs/debug.hpp"

namespace {

int draw_text_box_calls = 0;
int last_draw_visible = -1;
const char* last_draw_text = nullptr;

void test_debug_assertion_records_first_order_state() {
    gbs::debug_reset();
    gbs::debug_begin_frame(12);

    assert(gbs::debug_assert(true, "ok"));
    assert(!gbs::debug_assertion_failed());
    assert(!gbs::debug_assert(false, "missing room", 7));
    assert(gbs::debug_assertion_failed());

    gbs::DebugAssertion assertion = gbs::debug_last_assertion();
    assert(assertion.failed);
    assert(assertion.frame == 12);
    assert(assertion.code == 7);
    assert(assertion.label[0] == 'm');
}

void test_debug_frame_budget_tracks_peak_and_over_budget() {
    gbs::debug_reset();
    gbs::debug_set_frame_budget(10);

    gbs::debug_begin_frame(1);
    gbs::debug_end_frame(7);
    gbs::debug_begin_frame(2);
    gbs::debug_end_frame(12);
    gbs::debug_begin_frame(3);
    gbs::debug_end_frame(9);

    gbs::DebugFrameStats stats = gbs::debug_frame_stats();
    assert(stats.frame == 3);
    assert(stats.frame_count == 3);
    assert(stats.budget_units == 10);
    assert(stats.last_work_units == 9);
    assert(stats.peak_work_units == 12);
    assert(stats.over_budget_count == 1);
}

void test_debug_counters_track_values_and_peaks() {
    gbs::debug_reset();

    assert(gbs::debug_set_counter(0, "npc", 2));
    assert(gbs::debug_add_counter(0, 3));
    assert(gbs::debug_set_counter(0, "npc", 1));
    assert(!gbs::debug_set_counter(gbs::debug_counter_count, "bad", 1));
    assert(!gbs::debug_add_counter(gbs::debug_counter_count, 1));

    gbs::DebugCounter counter = gbs::debug_counter(0);
    assert(counter.label[0] == 'n');
    assert(counter.value == 1);
    assert(counter.peak == 5);
    assert(gbs::debug_counter(gbs::debug_counter_count).value == 0);
}

void test_debug_overlay_text_summarizes_stats_asserts_and_counters() {
    gbs::debug_reset();
    gbs::debug_set_frame_budget(10);
    gbs::debug_begin_frame(42);
    gbs::debug_set_counter(0, "npc", 3);
    gbs::debug_set_counter(1, "trigger", 2);
    gbs::debug_add_counter(0, 4);
    gbs::debug_assert(false, "missing room", 9);
    gbs::debug_end_frame(14);

    const char* text = gbs::debug_overlay_text();
    assert(std::strstr(text, "DBG F42") != nullptr);
    assert(std::strstr(text, "W14/14") != nullptr);
    assert(std::strstr(text, "O1") != nullptr);
    assert(std::strstr(text, "ASSERT 9 missing room") != nullptr);
    assert(std::strstr(text, "npc:7/7") != nullptr);
    assert(std::strstr(text, "trigger:2/2") != nullptr);
}

void test_draw_debug_overlay_uses_hardware_text_box() {
    gbs::debug_reset();
    gbs::debug_begin_frame(3);
    draw_text_box_calls = 0;
    last_draw_visible = -1;
    last_draw_text = nullptr;

    gbs::draw_debug_overlay(true);
    assert(draw_text_box_calls == 1);
    assert(last_draw_visible == 1);
    assert(last_draw_text != nullptr);
    assert(std::strstr(last_draw_text, "DBG F3") != nullptr);

    gbs::draw_debug_overlay(false);
    assert(draw_text_box_calls == 2);
    assert(last_draw_visible == 0);
    assert(last_draw_text == nullptr);
}

void test_runtime_telemetry_block_is_shared_and_reset_to_schema_four() {
    static_assert(
        sizeof(gbs::RuntimeTelemetryBlock) == 64 * sizeof(uint32_t),
        "runtime telemetry layout must remain stable"
    );

    gbs::debug_set_runtime_kind(1);
    gbs::reset_runtime_telemetry();
    volatile gbs::RuntimeTelemetryBlock& first = gbs::runtime_telemetry_block();
    assert(first.magic == gbs::runtime_telemetry_magic);
    assert(first.schema == 4);
    assert(first.word_count == 64);
    assert(first.current_room == -1);
    assert(gbs::debug_runtime_kind() == 1);
    assert(first.first_actor_x == -1);
    assert(first.first_actor_y == -1);
    assert(first.first_actor_direction == -1);
    assert(first.last_music == -1);
    assert(first.last_sfx == -1);
    assert(first.cpu_work_ticks == 0);
    assert(first.vblank_wait_ticks == 0);
    assert(first.missed_frame_count == 0);
    assert(first.render_skip_count == 0);
    assert(first.physical_valid_bits == 0);
    assert(first.audio_pcm_source_bytes == 0);
    assert(first.audio_mixer_buffer_bytes == 0);
    assert(first.audio_active_voice_count == 0);
    assert(first.audio_pcm_underrun_count == 0);
    assert(first.audio_pcm_submitted_blocks == 0);

    volatile gbs::RuntimeTelemetryLegacyBlock& legacy = gbs::runtime_telemetry_legacy_block();
    assert(legacy.magic == gbs::runtime_telemetry_magic);
    assert(legacy.schema == gbs::runtime_telemetry_legacy_schema);
    assert(legacy.word_count == 50);
    assert(legacy.current_room == -1);
    assert(legacy.first_actor_x == -1);

    const gbs::RuntimePhysicalTelemetry physical {
        gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::BgTiles) |
            gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::ObjTiles) |
            gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::Oam) |
            gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::PaletteColors) |
            gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::VramBytes) |
            gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::EventBytes) |
            gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::AudioBytes) |
            gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::DmaBytes),
        31,
        12,
        7,
        64,
        1536,
        320,
        2048,
        768,
        0,
        0
    };
    gbs::debug_set_runtime_physical_telemetry(physical);
    assert(first.physical_valid_bits == physical.valid_bits);
    assert(first.physical_bg_tiles == 31);
    assert(first.physical_obj_tiles == 12);
    assert(first.physical_oam == 7);
    assert(first.physical_palette_colors == 64);
    assert(first.physical_vram_bytes == 1536);
    assert(first.physical_event_bytes == 320);
    assert(first.physical_audio_bytes == 2048);
    assert(first.physical_dma_bytes == 768);

    first.current_room = 7;
    gbs::sync_legacy_runtime_telemetry();
    volatile gbs::RuntimeTelemetryBlock& second = gbs::runtime_telemetry_block();
    assert(&first == &second);
    assert(second.current_room == 7);
    assert(legacy.current_room == 7);
}

} // namespace

extern "C" void gbs_hw_draw_text_box(int, int, int, int, const char* text, int visible) {
    ++draw_text_box_calls;
    last_draw_text = text;
    last_draw_visible = visible;
}

int main() {
    test_debug_assertion_records_first_order_state();
    test_debug_frame_budget_tracks_peak_and_over_budget();
    test_debug_counters_track_values_and_peaks();
    test_debug_overlay_text_summarizes_stats_asserts_and_counters();
    test_draw_debug_overlay_uses_hardware_text_box();
    test_runtime_telemetry_block_is_shared_and_reset_to_schema_four();
    return 0;
}
