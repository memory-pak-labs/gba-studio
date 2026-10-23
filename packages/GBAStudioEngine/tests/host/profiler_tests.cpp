#include <cassert>
#include "gbs/profiler.hpp"

namespace {

uint32_t ticks = 0;

extern "C" uint32_t gbs_hw_frame_counter_ticks() {
    return ticks;
}

} // namespace

extern "C" void gbs_profiler_record_irq(uint32_t ticks);

void test_compact_native_subsystems() {
    using gbs::ProfilerSubsystem;
    gbs::profiler_reset();
    gbs::subsystem_profiler_reset();
    for (uint32_t frame = 0; frame < 1500; ++frame) {
        ticks = frame * 1000;
        gbs::subsystem_profiler_frame_begin();
        gbs::subsystem_profiler_frame_begin();
        {
            gbs::SubsystemProfilerScope render(ProfilerSubsystem::Render);
            ticks += 10;
            { gbs::SubsystemProfilerScope nested(ProfilerSubsystem::Render); ticks += 5; }
            { gbs::SubsystemProfilerScope scripts(ProfilerSubsystem::Scripts); ticks += 7; }
            { gbs::SubsystemProfilerScope audio(ProfilerSubsystem::Audio); ticks += 3; }
            gbs::subsystem_profiler_pause();
            ticks += 700; // VBlank wait is outside active scopes.
            gbs_profiler_record_irq(2);
            gbs::subsystem_profiler_frame_end();
        }
        assert(gbs::subsystem_profiler_frame_ticks(ProfilerSubsystem::Render) == 25);
        assert(gbs::subsystem_profiler_frame_ticks(ProfilerSubsystem::Scripts) == 7);
        assert(gbs::subsystem_profiler_frame_ticks(ProfilerSubsystem::Audio) == 3);
        assert(gbs::subsystem_profiler_frame_ticks(ProfilerSubsystem::Interrupts) == 2);
        assert(gbs::subsystem_profiler_peak_ticks(ProfilerSubsystem::Render) == 25);
        assert(gbs::subsystem_profiler_valid_bits() == (1u | 2u | 4u | 16u));
    }
    ticks = UINT32_MAX - 4;
    gbs::subsystem_profiler_frame_begin();
    gbs::subsystem_profiler_begin(ProfilerSubsystem::Render);
    ticks = 3;
    gbs::subsystem_profiler_end(ProfilerSubsystem::Render);
    gbs::subsystem_profiler_end(ProfilerSubsystem::Render);
    gbs::subsystem_profiler_frame_end();
    assert(gbs::subsystem_profiler_frame_ticks(ProfilerSubsystem::Render) == 8);
    assert(gbs::subsystem_profiler_peak_ticks(ProfilerSubsystem::Render) == 25);
    gbs::subsystem_profiler_reset_peaks();
    assert(gbs::subsystem_profiler_peak_ticks(ProfilerSubsystem::Render) == 8);
    assert(gbs::profiler_region_count() == 0);
    gbs::subsystem_profiler_reset();
    gbs::subsystem_profiler_frame_begin();
    gbs::subsystem_profiler_record_audio(42);
    gbs_profiler_record_irq(50);
    gbs::subsystem_profiler_frame_end();
    assert(gbs::subsystem_profiler_frame_ticks(ProfilerSubsystem::Audio) == 42);
    assert(gbs::subsystem_profiler_frame_ticks(ProfilerSubsystem::Interrupts) == 50);
}

void test_profiler_regions() {
    gbs::profiler_reset();
    ticks = 100;

    const uint8_t r1 = gbs::profiler_begin("update");
    ticks = 150;
    gbs::profiler_end(r1);

    const uint8_t r2 = gbs::profiler_begin("render");
    ticks = 180;
    gbs::profiler_end(r2);

    assert(gbs::profiler_region_count() == 2);

    const gbs::ProfilerRegion* u = gbs::profiler_region(r1);
    const gbs::ProfilerRegion* d = gbs::profiler_region(r2);
    assert(u != nullptr);
    assert(d != nullptr);
    assert(u->samples == 1);
    assert(u->total_ticks == 50);  // 150 - 100
    assert(d->total_ticks == 30);  // 180 - 150
    assert(u->min_ticks == 50);
    assert(u->max_ticks == 50);
}

void test_profiler_frame_totals() {
    gbs::profiler_reset();
    ticks = 0;
    gbs::profiler_frame_begin();

    const uint8_t a = gbs::profiler_begin("a");
    ticks = 20;
    gbs::profiler_end(a);
    const uint8_t b = gbs::profiler_begin("b");
    ticks = 35;
    gbs::profiler_end(b);

    gbs::profiler_frame_end();
    assert(gbs::profiler_last_frame_total_ticks() == 35);
    assert(gbs::profiler_frame_count() == 1);
}

void test_repeated_regions_and_counter_wrap() {
    gbs::profiler_reset();
    for (uint32_t frame = 0; frame < 1000; ++frame) {
        ticks = frame * 100;
        const uint8_t region = gbs::profiler_begin("scripts");
        assert(region == 0);
        ticks += 7;
        gbs::profiler_end(region);
        gbs::profiler_end(region); // A completed scope cannot be counted twice.
    }
    assert(gbs::profiler_region_count() == 1);
    assert(gbs::profiler_region(0)->samples == 1000);
    assert(gbs::profiler_region(0)->last_ticks == 7);
    ticks = UINT32_MAX - 4;
    const uint8_t region = gbs::profiler_begin("scripts");
    ticks = 3;
    gbs::profiler_end(region);
    assert(gbs::profiler_region(region)->last_ticks == 8);
}

void test_frame_peaks_nested_scopes_and_idle_wait() {
    gbs::profiler_reset();
    ticks = 100;
    gbs::profiler_frame_begin();
    const auto render = gbs::profiler_begin("render");
    ticks = 110;
    const auto nested = gbs::profiler_begin("render");
    ticks = 120;
    gbs::profiler_end(nested);
    ticks = 130;
    gbs::profiler_pause();
    ticks = 900; // Idle VBlank time must not inflate rendering cost.
    gbs::profiler_frame_end();
    gbs::profiler_end(render);
    assert(gbs::profiler_region(render)->samples == 1);
    assert(gbs::profiler_region_frame_ticks(render) == 30);
    assert(gbs::profiler_region_peak_frame_ticks(render) == 30);
    gbs::profiler_frame_begin();
    gbs::profiler_frame_begin(); // Nested callers share a single frame.
    ticks = 910;
    const auto next = gbs::profiler_begin("render");
    ticks = 915;
    gbs::profiler_end(next);
    gbs::profiler_frame_end();
    assert(gbs::profiler_region_frame_ticks(render) == 5);
    assert(gbs::profiler_region_peak_frame_ticks(render) == 30);
    assert(gbs::profiler_frame_count() == 2);
}

void test_logging() {
    gbs::log_set_host_output_enabled(false); // silence test output
    const size_t before = gbs::log_host_message_count();

    gbs::log_debug("hello");
    gbs::log_info("world");
    gbs::log_error("boom");

    assert(gbs::log_host_message_count() == before + 3);
    assert(gbs::log_host_last_level() == gbs::LogLevel::Error);

    // log_value uses the same path
    gbs::log_value(gbs::LogLevel::Info, "score", 12345);
    assert(gbs::log_host_message_count() == before + 4);

    gbs::log_set_host_output_enabled(true);
}

int main() {
    test_compact_native_subsystems();
    test_profiler_regions();
    test_profiler_frame_totals();
    test_repeated_regions_and_counter_wrap();
    test_frame_peaks_nested_scopes_and_idle_wait();
    test_logging();
    return 0;
}
