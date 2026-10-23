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
// Close active scopes before waiting for VBlank.
void profiler_pause();
void profiler_frame_end();
// Ticks use the engine timer: 262144 ticks per second (64 CPU cycles per tick).
// Timings are inclusive; nested subsystem costs must not be added together.
uint32_t profiler_region_frame_ticks(uint8_t index);
uint32_t profiler_region_peak_frame_ticks(uint8_t index);
void profiler_reset_frame_peaks();

// Fixed subsystem measurements avoid allocating the optional 16-label registry
// in every ROM. The generic ProfilerScope API remains available independently.
enum class ProfilerSubsystem : uint8_t { Scripts, Audio, Render, Streaming, Interrupts, Count };
void subsystem_profiler_reset();
void subsystem_profiler_begin(ProfilerSubsystem subsystem);
void subsystem_profiler_end(ProfilerSubsystem subsystem);
void subsystem_profiler_frame_begin();
void subsystem_profiler_pause();
void subsystem_profiler_frame_end();
void subsystem_profiler_reset_peaks();
// IRQ-safe: records elapsed audio work without touching scope/registry state.
void subsystem_profiler_record_audio(uint32_t ticks);
uint32_t subsystem_profiler_valid_bits();
uint32_t subsystem_profiler_frame_ticks(ProfilerSubsystem subsystem);
uint32_t subsystem_profiler_peak_ticks(ProfilerSubsystem subsystem);

class SubsystemProfilerScope {
public:
    explicit SubsystemProfilerScope(ProfilerSubsystem subsystem) {
#if defined(__arm__) || defined(__thumb__) || defined(GBS_ENABLE_PROFILER_SCOPES)
        subsystem_ = subsystem;
        subsystem_profiler_begin(subsystem_);
#else
        (void)subsystem;
#endif
    }
    ~SubsystemProfilerScope() {
#if defined(__arm__) || defined(__thumb__) || defined(GBS_ENABLE_PROFILER_SCOPES)
        subsystem_profiler_end(subsystem_);
#endif
    }
    SubsystemProfilerScope(const SubsystemProfilerScope&) = delete;
    SubsystemProfilerScope& operator=(const SubsystemProfilerScope&) = delete;
private:
#if defined(__arm__) || defined(__thumb__) || defined(GBS_ENABLE_PROFILER_SCOPES)
    ProfilerSubsystem subsystem_;
#endif
};
// Number of distinct labels registered.
size_t profiler_region_count();
// Read a region's aggregate stats (nullptr if out of range).
const ProfilerRegion* profiler_region(uint8_t index);
// Frame-level totals from the last completed frame.
uint32_t profiler_last_frame_total_ticks();
uint32_t profiler_frame_count();

// Native instrumentation is enabled in ROM builds. Focused host tests can
// opt in with GBS_ENABLE_PROFILER_SCOPES and link the hardware clock stub.
class ProfilerScope {
public:
    explicit ProfilerScope(const char* label) {
#if defined(__arm__) || defined(__thumb__) || defined(GBS_ENABLE_PROFILER_SCOPES)
        region_ = profiler_begin(label);
#else
        (void)label;
#endif
    }
    ~ProfilerScope() {
#if defined(__arm__) || defined(__thumb__) || defined(GBS_ENABLE_PROFILER_SCOPES)
        profiler_end(region_);
#endif
    }
    ProfilerScope(const ProfilerScope&) = delete;
    ProfilerScope& operator=(const ProfilerScope&) = delete;
private:
#if defined(__arm__) || defined(__thumb__) || defined(GBS_ENABLE_PROFILER_SCOPES)
    uint8_t region_;
#endif
};

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
