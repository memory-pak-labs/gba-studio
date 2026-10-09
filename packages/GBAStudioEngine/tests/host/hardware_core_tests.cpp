#include <cassert>
#include "gbs/dma.hpp"
#include "gbs/audio.hpp"
#include "gbs/engine.hpp"
#include "gbs/interrupt.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/timer.hpp"

namespace {

int vblank_hits = 0;
int keypad_hits = 0;
int timer0_hits = 0;
int hblank_hits = 0;
int internal_affine_hblank_hits = 0;
int internal_hbe_hblank_hits = 0;
int dma_copy_calls = 0;
int hdma_start_calls = 0;
int hdma_stop_calls = 0;
int last_dma_channel = -1;
uint32_t last_dma_units = 0;
int last_dma_word_sized = 0;
volatile void* last_dma_destination = nullptr;
int hardware_init_calls = 0;
int render_init_calls = 0;
int audio_init_calls = 0;
int audio_update_calls = 0;
int hardware_vblank_wait_calls = 0;
int hardware_publication_blocked = 0;
int hardware_vblank_publication_blocked = -1;
int hardware_handoff_fallback_calls = 0;
int call_sequence = 0;
int audio_update_sequence = 0;
int hardware_vblank_wait_sequence = 0;
int dma_copy_sequence = 0;
uint16_t hardware_backdrop_color = 0;
uint16_t hardware_keys = 0;
uint32_t hardware_performance_ticks = 0;
int hardware_key_read_calls = 0;
int hardware_performance_counter_init_calls = 0;
int frame_update_calls = 0;
int frame_render_calls = 0;
int hardware_timer_start_calls = 0;
int hardware_timer_stop_calls = 0;
int hardware_timer_value_calls = 0;
int last_hardware_timer = -1;
gbs::FrameContext last_frame_context {};

extern "C" void gbs_hw_init() {
    ++hardware_init_calls;
}

extern "C" void gbs_hw_wait_vblank() {
    ++hardware_vblank_wait_calls;
    hardware_vblank_wait_sequence = ++call_sequence;
    hardware_vblank_publication_blocked = hardware_publication_blocked;
    hardware_performance_ticks += 20;
}

extern "C" void gbs_hw_set_render_publication_blocked(int blocked) {
    hardware_publication_blocked = blocked != 0 ? 1 : 0;
}

extern "C" void gbs_hw_set_render_handoff_fallback() {
    ++hardware_handoff_fallback_calls;
}

extern "C" void gbs_hw_frame_counter_init() {
    ++hardware_performance_counter_init_calls;
}

extern "C" uint32_t gbs_hw_frame_counter_ticks() {
    return hardware_performance_ticks;
}

extern "C" uint16_t gbs_hw_read_keys() {
    ++hardware_key_read_calls;
    return hardware_keys;
}

extern "C" int gbs_hw_consume_keypad_irq() {
    return 0;
}

extern "C" int gbs_hw_keypad_irq_pending() {
    return 0;
}

extern "C" void gbs_hw_clear_keypad_irq() {
}

extern "C" void gbs_hw_audio_set_psg_pan(int, int) {
}

extern "C" void gbs_hw_timer_start(int timer, uint16_t, uint16_t, int, int) {
    ++hardware_timer_start_calls;
    last_hardware_timer = timer;
}

extern "C" void gbs_hw_timer_stop(int timer) {
    ++hardware_timer_stop_calls;
    last_hardware_timer = timer;
}

extern "C" uint16_t gbs_hw_timer_value(int timer) {
    ++hardware_timer_value_calls;
    last_hardware_timer = timer;
    return 0x1234;
}

extern "C" void gbs_hw_set_backdrop(uint16_t) {
}

extern "C" uint16_t gbs_hw_get_backdrop() {
    return hardware_backdrop_color;
}

extern "C" int gbs_main() {
    return 0;
}

} // namespace

namespace gbs {

void render_init() {
    ++render_init_calls;
}

void audio_init() {
    ++audio_init_calls;
}

void audio_update() {
    ++audio_update_calls;
    audio_update_sequence = ++call_sequence;
}

AudioRuntimeUsage audio_runtime_usage() {
    return AudioRuntimeUsage {};
}

} // namespace gbs

namespace {

extern "C" void gbs_hw_dma_copy(int channel, const void*, volatile void* destination, uint32_t units, int word_sized) {
    ++dma_copy_calls;
    dma_copy_sequence = ++call_sequence;
    last_dma_channel = channel;
    last_dma_units = units;
    last_dma_word_sized = word_sized;
    last_dma_destination = destination;
}

extern "C" void gbs_hw_hdma_start(int, const void*, volatile void*, uint32_t, int) {
    ++hdma_start_calls;
}

extern "C" void gbs_hw_hdma_stop(int) {
    ++hdma_stop_calls;
}

extern "C" void gbs_hw_draw_text_box(int, int, int, int, const char*, int) {
}

void on_vblank() {
    ++vblank_hits;
}

void on_keypad() {
    ++keypad_hits;
}

void on_timer0() {
    ++timer0_hits;
}

void on_hblank() {
    ++hblank_hits;
}

void on_internal_affine_hblank() {
    ++internal_affine_hblank_hits;
}

void on_internal_hbe_hblank() {
    ++internal_hbe_hblank_hits;
}

void capture_frame_update(const gbs::FrameContext& context, void*) {
    ++frame_update_calls;
    last_frame_context = context;
}

void capture_frame_render(const gbs::FrameContext&, void*) {
    ++frame_render_calls;
}

void test_dma_validation() {
    int source = 1;
    int destination = 0;

    assert(gbs::is_valid_dma_transfer(gbs::DmaTransfer { &source, &destination, 1, gbs::DmaWidth::Halfword }));
    assert(gbs::is_valid_dma_transfer(gbs::DmaTransfer { &source, &destination, 0x3FFF, gbs::DmaWidth::Word }));
    assert(!gbs::is_valid_dma_transfer(gbs::DmaTransfer { nullptr, &destination, 1, gbs::DmaWidth::Halfword }));
    assert(!gbs::is_valid_dma_transfer(gbs::DmaTransfer { &source, nullptr, 1, gbs::DmaWidth::Halfword }));
    assert(!gbs::is_valid_dma_transfer(gbs::DmaTransfer { &source, &destination, 0, gbs::DmaWidth::Halfword }));
    assert(!gbs::is_valid_dma_transfer(gbs::DmaTransfer { &source, &destination, 0x4000, gbs::DmaWidth::Halfword }));
}

void test_unaligned_affine_map_upload_preserves_byte_pairs_and_budget() {
    alignas(2) const uint8_t first[] = {0, 1, 2, 3, 4, 5, 6};
    alignas(2) const uint8_t second[] = {0, 9, 8, 7, 6};
    volatile uint16_t output[3] = {}, other[2] = {};
    gbs::dma_reset_vblank_queue();
    dma_copy_calls = 0;
    assert(gbs::dma_enqueue_vblank16(first+1, output, 3));
    assert(gbs::dma_enqueue_vblank16(second+1, other, 2));
    assert(output[0] == 0 && other[0] == 0);
    assert(gbs::dma_flush_vblank_queue_budget(gbs::DmaChannel::Channel3, 4) == 1);
    assert(output[0] == 0x0201 && output[1] == 0x0403 && output[2] == 0);
    assert(other[0] == 0 && gbs::dma_vblank_queue_stats().queued_bytes == 6);
    gbs::dma_flush_vblank_queue();
    assert(output[2] == 0x0605 && other[0] == 0x0809 && other[1] == 0x0607);
    assert(dma_copy_calls == 0 && gbs::dma_vblank_queue_count() == 0);
}

void test_hblank_dma_lifecycle_is_explicit() {
    uint16_t scanlines[160] = {};
    volatile uint16_t destination = 0;
    hdma_start_calls = 0;
    hdma_stop_calls = 0;
    const gbs::HBlankDmaTransfer transfer {
        scanlines,
        &destination,
        1,
        gbs::DmaWidth::Halfword,
    };
    assert(gbs::is_valid_hblank_dma_transfer(transfer));
    assert(gbs::dma_start_hblank(gbs::DmaChannel::Channel0, transfer));
    assert(hdma_start_calls == 1);
    gbs::dma_stop_hblank(gbs::DmaChannel::Channel0);
    assert(hdma_stop_calls == 1);
}

void test_dma_copy_rejects_a_channel_owned_by_hblank_dma() {
    int source = 1;
    volatile int destination = 0;
    uint16_t scanlines[160] = {};
    const gbs::HBlankDmaTransfer transfer {
        scanlines,
        &destination,
        1,
        gbs::DmaWidth::Halfword,
    };

    gbs::dma_stop_hblank(gbs::DmaChannel::Channel0);
    dma_copy_calls = 0;
    assert(gbs::dma_start_hblank(gbs::DmaChannel::Channel0, transfer));
    assert(!gbs::dma_copy16(gbs::DmaChannel::Channel0, &source, &destination, 1));
    assert(dma_copy_calls == 0);
    assert(gbs::dma_copy16(gbs::DmaChannel::Channel1, &source, &destination, 1));
    assert(dma_copy_calls == 1);

    gbs::dma_stop_hblank(gbs::DmaChannel::Channel0);
    assert(gbs::dma_copy16(gbs::DmaChannel::Channel0, &source, &destination, 1));
    assert(dma_copy_calls == 2);
}

void test_dma_vblank_queue_flushes_in_order_and_tracks_stats() {
    int source_a = 1;
    int source_b = 2;
    int destination_a = 0;
    int destination_b = 0;
    dma_copy_calls = 0;
    last_dma_channel = -1;
    last_dma_units = 0;
    last_dma_word_sized = 0;
    gbs::dma_reset_vblank_queue();

    assert(gbs::dma_enqueue_vblank16(&source_a, &destination_a, 2));
    assert(gbs::dma_enqueue_vblank32(&source_b, &destination_b, 3));
    assert(gbs::dma_vblank_queue_count() == 2);

    gbs::DmaQueueStats before = gbs::dma_vblank_queue_stats();
    assert(before.queued == 2);
    assert(before.submitted == 2);
    assert(before.flushed == 0);
    assert(before.dropped == 0);
    assert(before.peak_queued == 2);
    assert(before.queued_bytes == 16);
    assert(before.submitted_bytes == 16);
    assert(before.flushed_bytes == 0);
    assert(before.dropped_bytes == 0);
    assert(before.peak_queued_bytes == 16);

    assert(gbs::dma_flush_vblank_queue(gbs::DmaChannel::Channel2) == 2);
    assert(dma_copy_calls == 2);
    assert(last_dma_channel == 2);
    assert(last_dma_units == 3);
    assert(last_dma_word_sized == 1);
    assert(gbs::dma_vblank_queue_count() == 0);

    gbs::DmaQueueStats after = gbs::dma_vblank_queue_stats();
    assert(after.queued == 0);
    assert(after.submitted == 2);
    assert(after.flushed == 2);
    assert(after.dropped == 0);
    assert(after.peak_queued == 2);
    assert(after.queued_bytes == 0);
    assert(after.submitted_bytes == 16);
    assert(after.flushed_bytes == 16);
    assert(after.dropped_bytes == 0);
    assert(after.peak_queued_bytes == 16);
}

void test_dma_vblank_budget_splits_large_transfers_without_discarding_the_queue() {
    uint16_t source_a[8] = {};
    uint16_t source_b[4] = {};
    volatile uint16_t destination_a[8] = {};
    volatile uint16_t destination_b[4] = {};
    dma_copy_calls = 0;
    last_dma_units = 0;
    gbs::dma_reset_vblank_queue();

    assert(gbs::dma_enqueue_vblank16(source_a, destination_a, 8));
    assert(gbs::dma_enqueue_vblank16(source_b, destination_b, 4));

    // 20 bytes copy all of the first transfer and two halfwords of the next.
    assert(gbs::dma_flush_vblank_queue_budget(gbs::DmaChannel::Channel3, 20) == 2);
    assert(dma_copy_calls == 2);
    assert(last_dma_units == 2);
    const gbs::DmaQueueStats partial = gbs::dma_vblank_queue_stats();
    assert(partial.queued == 1);
    assert(partial.queued_bytes == 4);
    assert(partial.flushed == 2);
    assert(partial.flushed_bytes == 20);

    assert(gbs::dma_flush_vblank_queue_budget(gbs::DmaChannel::Channel3, 32) == 1);
    const gbs::DmaQueueStats complete = gbs::dma_vblank_queue_stats();
    assert(complete.queued == 0);
    assert(complete.queued_bytes == 0);
    assert(complete.flushed == 3);
    assert(complete.flushed_bytes == 24);
}

void test_dma_vblank_queue_rejects_invalid_and_overflow() {
    int source = 1;
    int destination = 0;
    gbs::dma_reset_vblank_queue();

    assert(!gbs::dma_enqueue_vblank16(nullptr, &destination, 1));
    for (size_t index = 0; index < gbs::dma_vblank_queue_capacity; ++index) {
        assert(gbs::dma_enqueue_vblank16(&source, &destination, 1));
    }
    assert(!gbs::dma_enqueue_vblank16(&source, &destination, 1));

    gbs::DmaQueueStats stats = gbs::dma_vblank_queue_stats();
    assert(stats.queued == gbs::dma_vblank_queue_capacity);
    assert(stats.submitted == gbs::dma_vblank_queue_capacity);
    assert(stats.dropped == 2);
    assert(stats.peak_queued == gbs::dma_vblank_queue_capacity);

    gbs::dma_reset_vblank_queue_stats();
    stats = gbs::dma_vblank_queue_stats();
    assert(stats.queued == gbs::dma_vblank_queue_capacity);
    assert(stats.submitted == 0);
    assert(stats.dropped == 0);
    assert(stats.peak_queued == gbs::dma_vblank_queue_capacity);

    gbs::dma_reset_vblank_queue();
    stats = gbs::dma_vblank_queue_stats();
    assert(stats.queued == 0);
    assert(stats.submitted == 0);
    assert(stats.dropped == 0);
    assert(stats.peak_queued == 0);
}

void test_runtime_boot_resets_pending_dma_uploads() {
    int source = 1;
    int destination = 0;
    hardware_init_calls = 0;
    hardware_performance_counter_init_calls = 0;
    render_init_calls = 0;
    audio_init_calls = 0;
    hardware_backdrop_color = 0x63BF;
    gbs::dma_reset_vblank_queue();
    assert(gbs::dma_enqueue_vblank16(&source, &destination, 1));
    assert(gbs::dma_vblank_queue_count() == 1);

    gbs::init();

    assert(gbs::dma_vblank_queue_count() == 0);
    const gbs::DmaQueueStats stats = gbs::dma_vblank_queue_stats();
    assert(stats.submitted == 0);
    assert(stats.flushed == 0);
    assert(stats.dropped == 0);
    assert(stats.peak_queued == 0);
    assert(hardware_init_calls == 1);
    assert(hardware_performance_counter_init_calls == 1);
    assert(render_init_calls == 1);
    assert(audio_init_calls == 1);
    assert(gbs::backdrop_color() == 0x63BF);
}

void test_render_publication_transaction_waits_for_dma_queue() {
    int source = 1;
    int destination = 0;
    gbs::init();
    gbs::dma_reset_vblank_queue();
    hardware_publication_blocked = 0;
    hardware_vblank_publication_blocked = -1;
    assert(gbs::dma_enqueue_vblank16(&source, &destination, 1));

    gbs::begin_render_publication_transaction();
    assert(gbs::render_publication_transaction_active());
    gbs::wait_vblank();

    assert(hardware_vblank_publication_blocked == 1);
    assert(gbs::dma_vblank_queue_count() == 0);
    assert(!gbs::render_publication_transaction_active());
    assert(hardware_publication_blocked == 0);

    gbs::wait_vblank();
    assert(hardware_vblank_publication_blocked == 0);
}

void test_runtime_handoff_keeps_publication_blocked_across_reinitialization() {
    hardware_handoff_fallback_calls = 0;
    gbs::init();
    gbs::begin_runtime_handoff();

    assert(hardware_handoff_fallback_calls == 1);
    assert(gbs::render_publication_transaction_active());
    assert(hardware_publication_blocked == 1);

    gbs::init();

    assert(gbs::render_publication_transaction_active());
    assert(hardware_publication_blocked == 1);
    gbs::wait_vblank();
    assert(!gbs::render_publication_transaction_active());
    assert(hardware_publication_blocked == 0);
}

void test_frame_wait_advances_audio_once_before_vblank_commits() {
    int source = 1;
    int destination = 0;
    audio_update_calls = 0;
    hardware_vblank_wait_calls = 0;
    dma_copy_calls = 0;
    call_sequence = 0;
    audio_update_sequence = 0;
    hardware_vblank_wait_sequence = 0;
    dma_copy_sequence = 0;
    gbs::dma_reset_vblank_queue();
    assert(gbs::dma_enqueue_vblank16(&source, &destination, 1));
    const uint32_t previous_frame = gbs::frame_count();

    gbs::wait_vblank();

    assert(audio_update_calls == 1);
    assert(hardware_vblank_wait_calls == 1);
    assert(dma_copy_calls == 1);
    assert(audio_update_sequence < hardware_vblank_wait_sequence);
    assert(hardware_vblank_wait_sequence < dma_copy_sequence);
    assert(gbs::frame_count() == previous_frame + 1);
}

void test_frame_context_snapshots_input_once_and_tracks_real_ticks() {
    hardware_keys = 0;
    hardware_key_read_calls = 0;
    hardware_performance_ticks = 1000;
    hardware_performance_counter_init_calls = 0;
    gbs::debug_set_runtime_kind(1);
    gbs::init();
    gbs::configure_frame_scheduler(gbs::FrameSchedulerConfig {
        gbs::FrameSkipPolicy::Adaptive,
        100,
        2,
    });

    hardware_keys = gbs::ButtonA;
    const gbs::FrameContext& first = gbs::begin_frame();
    const gbs::FrameContext& repeated = gbs::begin_frame();
    assert(&first == &repeated);
    assert(hardware_key_read_calls == 1);
    assert(first.input.was_pressed(gbs::ButtonA));
    assert(first.render_enabled);

    hardware_performance_ticks += 120;
    gbs::end_frame();
    const gbs::FrameTiming first_timing = gbs::frame_timing();
    assert(first_timing.cpu_work_ticks == 120);
    assert(first_timing.vblank_wait_ticks == 20);
    assert(first_timing.missed_frames == 1);
    assert(first_timing.total_missed_frames == 1);

    hardware_keys = static_cast<uint16_t>(gbs::ButtonA | gbs::ButtonRight);
    const gbs::FrameContext& second = gbs::begin_frame();
    assert(hardware_key_read_calls == 2);
    assert(second.input.is_held(gbs::ButtonA));
    assert(second.input.was_pressed(gbs::ButtonRight));
    assert(!second.render_enabled);
    hardware_performance_ticks += 40;
    gbs::end_frame();
    assert(gbs::frame_timing().total_render_skips == 1);

    volatile gbs::RuntimeTelemetryBlock& telemetry = gbs::runtime_telemetry_block();
    assert(telemetry.schema == 4);
    assert(telemetry.word_count == 64);
    assert(telemetry.cpu_work_ticks == 40);
    assert(telemetry.vblank_wait_ticks == 20);
    assert(telemetry.peak_cpu_work_ticks == 120);
    assert(telemetry.missed_frame_count == 1);
    assert(telemetry.render_skip_count == 1);
    assert((telemetry.physical_valid_bits & gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::CpuWorkTicks)) != 0);
    assert((telemetry.physical_valid_bits & gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::VblankTicks)) != 0);
    assert((telemetry.physical_valid_bits & gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::AudioBytes)) != 0);
    assert((telemetry.physical_valid_bits & (gbs::runtime_physical_non_timing_bits & ~gbs::runtime_physical_metric_bit(gbs::RuntimePhysicalMetric::AudioBytes))) == 0);
    assert((telemetry.frame_skip_policy & 0xFFu) == 1u);
    assert(((telemetry.frame_skip_policy >> 8u) & 0xFFu) == 2u);
    assert(telemetry.input_held == static_cast<uint16_t>(gbs::ButtonA | gbs::ButtonRight));
    assert(telemetry.input_pressed == gbs::ButtonRight);
    volatile gbs::RuntimeTelemetryLegacyBlock& legacy = gbs::runtime_telemetry_legacy_block();
    assert(legacy.schema == gbs::runtime_telemetry_legacy_schema);
    assert(legacy.word_count == 50);
    assert(legacy.frame == telemetry.frame);
    assert(legacy.cpu_work_ticks == telemetry.cpu_work_ticks);
    assert(legacy.input_pressed == telemetry.input_pressed);
    assert(legacy.current_room == telemetry.current_room);
}

void test_run_frame_invokes_one_central_update_with_immutable_context() {
    frame_update_calls = 0;
    hardware_key_read_calls = 0;
    hardware_keys = gbs::ButtonStart;
    hardware_performance_ticks += 10;

    gbs::run_frame(capture_frame_update, nullptr);

    assert(frame_update_calls == 1);
    assert(hardware_key_read_calls == 1);
    assert(last_frame_context.input.is_held(gbs::ButtonStart));
    assert(gbs::frame_count() == last_frame_context.frame + 1);
}

void test_central_frame_callbacks_keep_simulation_and_skip_only_rendering() {
    gbs::configure_frame_scheduler(gbs::FrameSchedulerConfig {
        gbs::FrameSkipPolicy::Adaptive,
        100,
        1,
    });
    hardware_performance_ticks += 10;
    gbs::begin_frame();
    hardware_performance_ticks += 120;
    gbs::end_frame();

    frame_update_calls = 0;
    frame_render_calls = 0;
    gbs::run_frame(gbs::FrameCallbacks { capture_frame_update, capture_frame_render }, nullptr);
    assert(frame_update_calls == 1);
    assert(frame_render_calls == 0);
    assert(!last_frame_context.render_enabled);

    gbs::run_frame(gbs::FrameCallbacks { capture_frame_update, capture_frame_render }, nullptr);
    assert(frame_update_calls == 2);
    assert(frame_render_calls == 1);
}

void test_resource_bank_uploads_enqueue_dma_transfers() {
    uint8_t bg_tiles[64] = {};
    uint8_t obj_tiles[32] = {};
    uint16_t bg_palette[16] = {};
    uint16_t obj_palette[16] = {};
    uint16_t oam_data[8] = {};

    gbs::dma_reset_vblank_queue();
    assert(gbs::enqueue_resource_bank_upload_vblank(
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::BgTiles,
            gbs::ResourceReservation { 2, 2, true },
            "bg",
            true,
        },
        bg_tiles
    ));
    assert(gbs::enqueue_resource_bank_upload_vblank(
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::ObjTiles,
            gbs::ResourceReservation { 4, 1, true },
            "obj",
            true,
        },
        obj_tiles
    ));
    assert(gbs::enqueue_resource_bank_upload_vblank(
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::BgPalette,
            gbs::ResourceReservation { 16, 16, true },
            "bg_palette",
            true,
        },
        bg_palette
    ));
    assert(gbs::enqueue_resource_bank_upload_vblank(
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::ObjPalette,
            gbs::ResourceReservation { 32, 16, true },
            "obj_palette",
            true,
        },
        obj_palette
    ));
    assert(gbs::enqueue_resource_bank_upload_vblank(
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::OamSprites,
            gbs::ResourceReservation { 2, 2, true },
            "oam",
            true,
        },
        oam_data
    ));

    assert(gbs::dma_vblank_queue_count() == 5);
    assert(gbs::dma_flush_vblank_queue(gbs::DmaChannel::Channel1) == 5);
    assert(last_dma_channel == 1);
    assert(last_dma_units == 8);
    assert(last_dma_word_sized == 0);
    assert(last_dma_destination == reinterpret_cast<volatile void*>(0x07000000u + 2u * 8u));
}

void test_resource_bank_upload_batch_rejects_missing_sources() {
    gbs::ResourceBankReservation reservations[2] = {
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::BgTiles,
            gbs::ResourceReservation { 0, 1, true },
            "bg",
            true,
        },
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::ObjTiles,
            gbs::ResourceReservation { 0, 1, true },
            "obj",
            true,
        },
    };
    gbs::ResourceBankBatchReservation batch {
        reservations,
        2,
        2,
        nullptr,
        true,
    };
    uint8_t tile_data[32] = {};
    const void* sources[1] = { tile_data };

    gbs::dma_reset_vblank_queue();
    assert(!gbs::enqueue_resource_bank_uploads_vblank(batch, sources, 1));
    assert(gbs::dma_vblank_queue_count() == 0);
}

void test_resource_bank_upload_sources_match_reservations_by_name() {
    gbs::ResourceBankReservation reservations[2] = {
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::BgPalette,
            gbs::ResourceReservation { 16, 16, true },
            "room_palette",
            true,
        },
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::BgTiles,
            gbs::ResourceReservation { 8, 2, true },
            "room_tiles",
            true,
        },
    };
    gbs::ResourceBankBatchReservation batch {
        reservations,
        2,
        2,
        "room_0",
        true,
    };
    uint8_t tile_data[64] = {};
    uint16_t palette_data[16] = {};
    const gbs::ResourceBankUploadSource sources[2] = {
        gbs::ResourceBankUploadSource { "room_tiles", tile_data },
        gbs::ResourceBankUploadSource { "room_palette", palette_data },
    };

    assert(gbs::resource_bank_upload_source_by_name(sources, 2, "room_tiles") == tile_data);
    assert(gbs::resource_bank_upload_source_by_name(sources, 2, "missing") == nullptr);
    gbs::dma_reset_vblank_queue();
    assert(gbs::enqueue_resource_bank_upload_sources_vblank(batch, sources, 2));
    assert(gbs::dma_vblank_queue_count() == 2);
    assert(gbs::dma_flush_vblank_queue(gbs::DmaChannel::Channel2) == 2);
    assert(last_dma_channel == 2);
    assert(last_dma_units == 32);
    assert(last_dma_destination == reinterpret_cast<volatile void*>(0x06000000u + 8u * 32u));
}

void test_resource_bank_upload_sources_reject_missing_name_without_partial_enqueue() {
    gbs::ResourceBankReservation reservations[2] = {
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::BgPalette,
            gbs::ResourceReservation { 0, 16, true },
            "room_palette",
            true,
        },
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::BgTiles,
            gbs::ResourceReservation { 0, 1, true },
            "missing_tiles",
            true,
        },
    };
    gbs::ResourceBankBatchReservation batch {
        reservations,
        2,
        2,
        "room_0",
        true,
    };
    uint16_t palette_data[16] = {};
    const gbs::ResourceBankUploadSource sources[1] = {
        gbs::ResourceBankUploadSource { "room_palette", palette_data },
    };

    gbs::dma_reset_vblank_queue();
    assert(!gbs::enqueue_resource_bank_upload_sources_vblank(batch, sources, 1));
    assert(gbs::dma_vblank_queue_count() == 0);
}

void test_resource_bank_upload_sources_skip_oam_without_named_source() {
    gbs::ResourceBankReservation reservations[2] = {
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::OamSprites,
            gbs::ResourceReservation { 0, 4, true },
            "player_oam_sprites",
            true,
        },
        gbs::ResourceBankReservation {
            gbs::ResourcePoolKind::ObjTiles,
            gbs::ResourceReservation { 0, 2, true },
            "player_obj_tiles",
            true,
        },
    };
    gbs::ResourceBankBatchReservation batch {
        reservations,
        2,
        2,
        "room_0",
        true,
    };
    uint8_t tile_data[64] = {};
    const gbs::ResourceBankUploadSource sources[1] = {
        gbs::ResourceBankUploadSource { "player_obj_tiles", tile_data },
    };

    gbs::dma_reset_vblank_queue();
    assert(gbs::enqueue_resource_bank_upload_sources_vblank(batch, sources, 1));
    assert(gbs::dma_vblank_queue_count() == 1);
    assert(gbs::dma_flush_vblank_queue(gbs::DmaChannel::Channel2) == 1);
    assert(last_dma_units == 32);
    assert(last_dma_destination == reinterpret_cast<volatile void*>(0x06010000u));
}

void test_timer_validation_and_reload() {
    assert(gbs::is_valid_timer_config(gbs::TimerConfig { 0, gbs::TimerFrequency::Cpu1, false, false }));
    assert(gbs::is_valid_timer_config(gbs::TimerConfig { 0, gbs::TimerFrequency::Cpu1, true, true }));
    assert(!gbs::is_valid_timer_config(gbs::TimerConfig { 0, gbs::TimerFrequency::Cpu64, false, true }));
    assert(gbs::timer_reload_for_ticks(1) == 0xFFFF);
    assert(gbs::timer_reload_for_ticks(1024) == 0xFC00);
    assert(gbs::timer_owner(gbs::TimerId::Timer0) == gbs::TimerOwner::Game);
    assert(gbs::timer_owner(gbs::TimerId::Timer1) == gbs::TimerOwner::Audio);
    assert(gbs::timer_owner(gbs::TimerId::Timer2) == gbs::TimerOwner::FrameTelemetry);
    assert(gbs::timer_owner(gbs::TimerId::Timer3) == gbs::TimerOwner::FrameTelemetry);

    hardware_timer_start_calls = 0;
    hardware_timer_stop_calls = 0;
    hardware_timer_value_calls = 0;
    const gbs::TimerConfig config { 0, gbs::TimerFrequency::Cpu64, false, false };
    gbs::timer_start(gbs::TimerId::Timer0, config);
    assert(hardware_timer_start_calls == 1);
    assert(last_hardware_timer == 0);
    gbs::timer_start(gbs::TimerId::Timer1, config);
    gbs::timer_start(gbs::TimerId::Timer2, config);
    gbs::timer_start(gbs::TimerId::Timer3, config);
    assert(hardware_timer_start_calls == 1);
    assert(gbs::timer_value(gbs::TimerId::Timer0) == 0x1234);
    assert(gbs::timer_value(gbs::TimerId::Timer2) == 0);
    assert(hardware_timer_value_calls == 1);
    gbs::timer_stop(gbs::TimerId::Timer0);
    gbs::timer_stop(gbs::TimerId::Timer1);
    assert(hardware_timer_stop_calls == 1);
}

void test_interrupt_callbacks() {
    vblank_hits = 0;
    keypad_hits = 0;
    timer0_hits = 0;

    gbs::set_interrupt_callback(gbs::InterruptSource::VBlank, on_vblank);
    gbs::set_interrupt_callback(gbs::InterruptSource::Keypad, on_keypad);
    gbs::set_interrupt_callback(gbs::InterruptSource::Timer0, on_timer0);
    gbs::disable_interrupt(gbs::InterruptSource::VBlank);
    gbs::disable_interrupt(gbs::InterruptSource::Keypad);
    gbs::disable_interrupt(gbs::InterruptSource::Timer0);

    gbs::emit_interrupt(gbs::InterruptSource::VBlank);
    assert(vblank_hits == 0);

    gbs::enable_interrupt(gbs::InterruptSource::VBlank);
    gbs::emit_interrupt(gbs::InterruptSource::VBlank);
    assert(vblank_hits == 1);
    assert(keypad_hits == 0);

    gbs::enable_interrupt(gbs::InterruptSource::Keypad);
    gbs::emit_interrupt(gbs::InterruptSource::Keypad);
    assert(keypad_hits == 1);

    gbs::disable_interrupt(gbs::InterruptSource::VBlank);
    gbs::emit_interrupt(gbs::InterruptSource::VBlank);
    assert(vblank_hits == 1);
}

void test_engine_owned_timer_interrupts_cannot_be_enabled_by_game_code() {
    timer0_hits = 0;
    assert(gbs::interrupt_source_available_to_game(gbs::InterruptSource::Timer0));
    assert(!gbs::interrupt_source_available_to_game(gbs::InterruptSource::Timer1));
    assert(!gbs::interrupt_source_available_to_game(gbs::InterruptSource::Timer2));
    assert(!gbs::interrupt_source_available_to_game(gbs::InterruptSource::Timer3));
    gbs::set_interrupt_callback(gbs::InterruptSource::Timer1, on_timer0);
    gbs::enable_interrupt(gbs::InterruptSource::Timer1);
    gbs::emit_interrupt(gbs::InterruptSource::Timer1);
    assert(timer0_hits == 0);
}

void test_hardware_interrupt_masks_and_dispatch() {
    vblank_hits = 0;
    keypad_hits = 0;
    timer0_hits = 0;

    assert(gbs::hardware_interrupt_mask(gbs::InterruptSource::VBlank) == (1u << 0));
    assert(gbs::hardware_interrupt_mask(gbs::InterruptSource::Timer0) == (1u << 3));
    assert(gbs::hardware_interrupt_mask(gbs::InterruptSource::Keypad) == (1u << 12));

    gbs::set_interrupt_callback(gbs::InterruptSource::VBlank, on_vblank);
    gbs::set_interrupt_callback(gbs::InterruptSource::Timer0, on_timer0);
    gbs::set_interrupt_callback(gbs::InterruptSource::Keypad, on_keypad);
    gbs::enable_interrupt(gbs::InterruptSource::VBlank);
    gbs::enable_interrupt(gbs::InterruptSource::Timer0);
    gbs::disable_interrupt(gbs::InterruptSource::Keypad);

    gbs::dispatch_hardware_interrupts(
        gbs::hardware_interrupt_mask(gbs::InterruptSource::VBlank) |
        gbs::hardware_interrupt_mask(gbs::InterruptSource::Timer0) |
        gbs::hardware_interrupt_mask(gbs::InterruptSource::Keypad)
    );

    assert(vblank_hits == 1);
    assert(timer0_hits == 1);
    assert(keypad_hits == 0);
}

void test_hblank_interrupt_callback_and_mask() {
    hblank_hits = 0;
    gbs::set_interrupt_callback(gbs::InterruptSource::HBlank, on_hblank);
    gbs::enable_interrupt(gbs::InterruptSource::HBlank);
    assert(gbs::hardware_interrupt_mask(gbs::InterruptSource::HBlank) == (1u << 1));
    gbs::dispatch_hardware_interrupts(1u << 1);
    assert(hblank_hits == 1);
    gbs::disable_interrupt(gbs::InterruptSource::HBlank);
}

void test_internal_hblank_callbacks_can_coexist_and_be_removed_independently() {
    internal_affine_hblank_hits = 0;
    internal_hbe_hblank_hits = 0;

    const gbs::InternalInterruptHandle affine_handle = gbs::add_internal_interrupt_callback(
        gbs::InterruptSource::HBlank,
        on_internal_affine_hblank
    );
    const gbs::InternalInterruptHandle hbe_handle = gbs::add_internal_interrupt_callback(
        gbs::InterruptSource::HBlank,
        on_internal_hbe_hblank
    );
    assert(affine_handle != 0);
    assert(hbe_handle != 0);
    assert(affine_handle != hbe_handle);

    gbs::enable_internal_interrupt(gbs::InterruptSource::HBlank);
    gbs::enable_internal_interrupt(gbs::InterruptSource::HBlank);
    gbs::emit_interrupt(gbs::InterruptSource::HBlank);
    assert(internal_affine_hblank_hits == 1);
    assert(internal_hbe_hblank_hits == 1);

    gbs::remove_internal_interrupt_callback(gbs::InterruptSource::HBlank, affine_handle);
    gbs::disable_internal_interrupt(gbs::InterruptSource::HBlank);
    gbs::emit_interrupt(gbs::InterruptSource::HBlank);
    assert(internal_affine_hblank_hits == 1);
    assert(internal_hbe_hblank_hits == 2);

    gbs::remove_internal_interrupt_callback(gbs::InterruptSource::HBlank, hbe_handle);
    gbs::disable_internal_interrupt(gbs::InterruptSource::HBlank);
}

void test_global_input_repeat_fires_after_initial_delay() {
    hardware_keys = 0;
    gbs::init();
    assert(gbs::input_repeat_state().repeated == 0);

    hardware_keys = gbs::ButtonA;
    for (int i = 0; i < gbs::input_default_initial_delay; ++i) {
        gbs::begin_frame();
        gbs::end_frame();
    }
    assert(gbs::input_repeat_state().repeated == 0);

    gbs::begin_frame();
    gbs::end_frame();
    assert((gbs::input_repeat_state().repeated & gbs::ButtonA) != 0u);

    hardware_keys = 0;
    gbs::begin_frame();
    gbs::end_frame();
    assert(gbs::input_repeat_state().repeated == 0);
}

} // namespace

int main() {
    test_dma_validation();
    test_unaligned_affine_map_upload_preserves_byte_pairs_and_budget();
    test_hblank_dma_lifecycle_is_explicit();
    test_dma_copy_rejects_a_channel_owned_by_hblank_dma();
    test_dma_vblank_queue_flushes_in_order_and_tracks_stats();
    test_dma_vblank_budget_splits_large_transfers_without_discarding_the_queue();
    test_dma_vblank_queue_rejects_invalid_and_overflow();
    test_runtime_boot_resets_pending_dma_uploads();
    test_render_publication_transaction_waits_for_dma_queue();
    test_runtime_handoff_keeps_publication_blocked_across_reinitialization();
    test_frame_wait_advances_audio_once_before_vblank_commits();
    test_frame_context_snapshots_input_once_and_tracks_real_ticks();
    test_global_input_repeat_fires_after_initial_delay();
    test_run_frame_invokes_one_central_update_with_immutable_context();
    test_central_frame_callbacks_keep_simulation_and_skip_only_rendering();
    test_resource_bank_uploads_enqueue_dma_transfers();
    test_resource_bank_upload_batch_rejects_missing_sources();
    test_resource_bank_upload_sources_match_reservations_by_name();
    test_resource_bank_upload_sources_reject_missing_name_without_partial_enqueue();
    test_resource_bank_upload_sources_skip_oam_without_named_source();
    test_timer_validation_and_reload();
    test_interrupt_callbacks();
    test_engine_owned_timer_interrupts_cannot_be_enabled_by_game_code();
    test_hardware_interrupt_masks_and_dispatch();
    test_hblank_interrupt_callback_and_mask();
    test_internal_hblank_callbacks_can_coexist_and_be_removed_independently();
    return 0;
}
