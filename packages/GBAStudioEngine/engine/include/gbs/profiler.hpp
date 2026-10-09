#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

// ============================================================
// Lightweight Profiler
// ============================================================

constexpr size_t profiler_max_regions = 16;
constexpr size_t profiler_label_length = 24;

struct ProfilerRegion {
    char label[profiler_label_length];
    uint32_t samples;
    uint32_t total_ticks;
    uint32_t min_ticks;
    uint32_t max_ticks;
    uint32_t last_ticks;
};

// Reset all profiler data.
void profiler_reset();
// Begin timing a region. Returns the region index (0..profiler_max_regions-1).
uint8_t profiler_begin(const char* label);
// End timing the most recently started region. Call with the index from begin.
void profiler_end(uint8_t region);
// Call once per frame. Tracks frame-level totals.
void profiler_frame_begin();
void profiler_frame_end();
// Number of regions ever started.
size_t profiler_region_count();
// Read a region's aggregate stats (nullptr if out of range).
const ProfilerRegion* profiler_region(uint8_t index);
// Frame-level totals from the last completed frame.
uint32_t profiler_last_frame_total_ticks();
uint32_t profiler_frame_count();

// ============================================================
// Emulator / Host Logging
// ============================================================

enum class LogLevel : uint8_t {
    Debug = 0,
    Info = 1,
    Warn = 2,
    Error = 3,
    Fatal = 4
};

// Log a plain message. On ARM this targets the mGBA/VBA emulator debug output
// when available; on host it prints to stdout.
void log_message(LogLevel level, const char* message);
// Log a labeled integer value without heap allocation.
void log_value(LogLevel level, const char* label, int32_t value);
// Convenience helpers.
void log_debug(const char* message);
void log_info(const char* message);
void log_warn(const char* message);
void log_error(const char* message);
// Enable/disable host console output (default on for host builds).
void log_set_host_output_enabled(bool enabled);
bool log_host_output_enabled();

#if !defined(__arm__) && !defined(__thumb__)
// Host-only: number of log messages emitted (for tests).
size_t log_host_message_count();
LogLevel log_host_last_level();
#endif

} // namespace gbs