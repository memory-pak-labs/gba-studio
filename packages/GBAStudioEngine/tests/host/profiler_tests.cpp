#include <cassert>
#include "gbs/profiler.hpp"

namespace {

uint32_t ticks = 0;

extern "C" uint32_t gbs_hw_frame_counter_ticks() {
    return ticks;
}

} // namespace

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
    test_profiler_regions();
    test_profiler_frame_totals();
    test_logging();
    return 0;
}