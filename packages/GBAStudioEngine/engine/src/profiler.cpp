#include "gbs/profiler.hpp"
#include "gbs_hw.h"

#include <stdio.h>
#include <string.h>

namespace gbs {

// ============================================================
// Profiler
// ============================================================

namespace {

ProfilerRegion s_regions[profiler_max_regions] = {};
size_t s_region_count = 0;
uint32_t s_region_start[profiler_max_regions] = {};
uint32_t s_region_frame[profiler_max_regions] = {};
uint32_t s_region_last_frame[profiler_max_regions] = {};
uint32_t s_region_peak_frame[profiler_max_regions] = {};
uint16_t s_region_depth[profiler_max_regions] = {};
volatile uint32_t s_irq_ticks = 0;
volatile uint32_t s_audio_ticks = 0;
volatile bool s_audio_measured = false;
uint32_t s_audio_frame_start = 0;
uint32_t s_frame_irq_start = 0;
bool s_frame_active = false;
struct SubsystemTiming {
    uint32_t start, current, last, peak;
    uint16_t depth;
};
struct SubsystemProfiler {
    SubsystemTiming regions[static_cast<size_t>(ProfilerSubsystem::Count)];
    uint32_t irq_start, valid_bits;
    bool active;
};
static_assert(sizeof(SubsystemProfiler) <= 128, "native subsystem profiler RAM budget");
SubsystemProfiler s_subsystems {};
uint32_t s_frame_total_ticks = 0;
uint32_t s_last_frame_total_ticks = 0;
uint32_t s_frame_count = 0;

uint32_t read_ticks() {
    return gbs_hw_frame_counter_ticks();
}

#if !defined(__arm__) && !defined(__thumb__)
// Host logging state (test observable).
size_t s_host_message_count = 0;
LogLevel s_host_last_level = LogLevel::Debug;
bool s_host_output_enabled = true;
#endif

} // namespace

void subsystem_profiler_reset() { s_subsystems = {}; s_irq_ticks = s_audio_ticks = 0; s_audio_measured = false; s_audio_frame_start = 0; }

void subsystem_profiler_record_audio(uint32_t ticks) { s_audio_ticks += ticks; s_audio_measured = true; }

void subsystem_profiler_begin(ProfilerSubsystem subsystem) {
    const size_t index = static_cast<size_t>(subsystem);
    if (index >= static_cast<size_t>(ProfilerSubsystem::Count)) return;
    s_subsystems.valid_bits |= 1u << index;
    SubsystemTiming& region = s_subsystems.regions[index];
    if (region.depth++ == 0) region.start = read_ticks();
}

void subsystem_profiler_end(ProfilerSubsystem subsystem) {
    const size_t index = static_cast<size_t>(subsystem);
    if (index >= static_cast<size_t>(ProfilerSubsystem::Count)) return;
    SubsystemTiming& region = s_subsystems.regions[index];
    if (region.depth == 0 || --region.depth != 0) return;
    region.current += read_ticks() - region.start;
}

void subsystem_profiler_frame_begin() {
    if (s_subsystems.active) return;
    s_subsystems.active = true;
    s_subsystems.irq_start = s_irq_ticks;
    s_audio_frame_start = s_audio_ticks;
    for (auto& region : s_subsystems.regions) region.current = 0;
}

void subsystem_profiler_pause() {
    for (size_t i = 0; i < static_cast<size_t>(ProfilerSubsystem::Count); ++i) {
        if (s_subsystems.regions[i].depth == 0) continue;
        s_subsystems.regions[i].depth = 1;
        subsystem_profiler_end(static_cast<ProfilerSubsystem>(i));
    }
}

void subsystem_profiler_frame_end() {
    if (!s_subsystems.active) return;
    subsystem_profiler_pause();
    if (s_audio_measured) {
        s_subsystems.regions[static_cast<size_t>(ProfilerSubsystem::Audio)].current += s_audio_ticks - s_audio_frame_start;
        s_subsystems.valid_bits |= 1u << static_cast<size_t>(ProfilerSubsystem::Audio);
    }
    s_subsystems.regions[static_cast<size_t>(ProfilerSubsystem::Interrupts)].current = s_irq_ticks - s_subsystems.irq_start;
    s_subsystems.valid_bits |= 1u << static_cast<size_t>(ProfilerSubsystem::Interrupts);
    for (auto& region : s_subsystems.regions) {
        region.last = region.current;
        if (region.last > region.peak) region.peak = region.last;
    }
    s_subsystems.active = false;
}

void subsystem_profiler_reset_peaks() {
    for (auto& region : s_subsystems.regions) region.peak = region.last;
}
uint32_t subsystem_profiler_valid_bits() { return s_subsystems.valid_bits; }
uint32_t subsystem_profiler_frame_ticks(ProfilerSubsystem subsystem) {
    const size_t index = static_cast<size_t>(subsystem);
    return index < static_cast<size_t>(ProfilerSubsystem::Count) ? s_subsystems.regions[index].last : 0;
}
uint32_t subsystem_profiler_peak_ticks(ProfilerSubsystem subsystem) {
    const size_t index = static_cast<size_t>(subsystem);
    return index < static_cast<size_t>(ProfilerSubsystem::Count) ? s_subsystems.regions[index].peak : 0;
}

void profiler_reset() {
    for (size_t i = 0; i < profiler_max_regions; ++i) {
        s_regions[i] = ProfilerRegion {};
        s_region_start[i] = s_region_frame[i] = s_region_last_frame[i] = s_region_peak_frame[i] = 0;
        s_region_depth[i] = 0;
    }
    s_region_count = 0;
    s_frame_total_ticks = s_last_frame_total_ticks = s_frame_count = 0;
    s_irq_ticks = s_frame_irq_start = 0;
    s_frame_active = false;
}

uint8_t profiler_begin(const char* label) {
    if (label == nullptr || label[0] == '\0') return 0xFF;
    size_t index = 0;
    while (index < s_region_count && strncmp(s_regions[index].label, label, profiler_label_length - 1) != 0) ++index;
    if (index == s_region_count) {
        if (s_region_count == profiler_max_regions) return 0xFF;
        strncpy(s_regions[index].label, label, profiler_label_length - 1);
        ++s_region_count;
    }
    if (s_region_depth[index]++ == 0) s_region_start[index] = read_ticks();
    return static_cast<uint8_t>(index);
}

void profiler_end(uint8_t index) {
    if (index >= s_region_count || s_region_depth[index] == 0) return;
    if (--s_region_depth[index] != 0) return;
    ProfilerRegion& region = s_regions[index];
    const uint32_t delta = read_ticks() - s_region_start[index];
    region.last_ticks = delta;
    ++region.samples;
    region.total_ticks += delta;
    if (region.samples == 1 || delta < region.min_ticks) region.min_ticks = delta;
    if (delta > region.max_ticks) region.max_ticks = delta;
    s_region_frame[index] += delta;
    s_frame_total_ticks += delta;
}

void profiler_frame_begin() {
    if (s_frame_active) return;
    s_frame_active = true;
    s_frame_total_ticks = 0;
    s_frame_irq_start = s_irq_ticks;
    for (size_t i = 0; i < profiler_max_regions; ++i) s_region_frame[i] = 0;
}

void profiler_pause() {
    // Render callbacks may wait for VBlank internally. Close before that wait,
    // so idle time and the following frame never become rendering work.
    for (size_t i = 0; i < s_region_count; ++i) {
        if (s_region_depth[i] != 0) {
            s_region_depth[i] = 1;
            profiler_end(static_cast<uint8_t>(i));
        }
    }
}

void profiler_frame_end() {
    if (!s_frame_active) return;
    profiler_pause();
    const uint8_t irq = profiler_begin("interrupts");
    if (irq != 0xFF) {
        s_region_depth[irq] = 0;
        const uint32_t delta = s_irq_ticks - s_frame_irq_start;
        s_region_frame[irq] = delta;
        ProfilerRegion& region = s_regions[irq];
        region.last_ticks = delta;
        ++region.samples;
        region.total_ticks += delta;
        if (region.samples == 1 || delta < region.min_ticks) region.min_ticks = delta;
        if (delta > region.max_ticks) region.max_ticks = delta;
    }
    for (size_t i = 0; i < s_region_count; ++i) {
        s_region_last_frame[i] = s_region_frame[i];
        if (s_region_frame[i] > s_region_peak_frame[i]) s_region_peak_frame[i] = s_region_frame[i];
    }
    s_last_frame_total_ticks = s_frame_total_ticks;
    ++s_frame_count;
    s_frame_active = false;
}

uint32_t profiler_region_frame_ticks(uint8_t index) {
    return index < s_region_count ? s_region_last_frame[index] : 0;
}

uint32_t profiler_region_peak_frame_ticks(uint8_t index) {
    return index < s_region_count ? s_region_peak_frame[index] : 0;
}

void profiler_reset_frame_peaks() {
    for (size_t i = 0; i < s_region_count; ++i) s_region_peak_frame[i] = s_region_last_frame[i];
}

size_t profiler_region_count() {
    return s_region_count;
}

const ProfilerRegion* profiler_region(uint8_t index) {
    if (index >= s_region_count) {
        return nullptr;
    }
    return &s_regions[index];
}

uint32_t profiler_last_frame_total_ticks() {
    return s_last_frame_total_ticks;
}

uint32_t profiler_frame_count() {
    return s_frame_count;
}

// ============================================================
// Logging
// ============================================================

void log_message(LogLevel level, const char* message) {
    if (message == nullptr) {
        return;
    }
#if defined(__arm__) || defined(__thumb__)
    // mGBA/VBA debug output: write the string to the emulator log buffer.
    volatile uint32_t* debug_enable = (volatile uint32_t*)0x04FFF600u;
    volatile uint32_t* debug_flags = (volatile uint32_t*)0x04FFF604u;
    volatile char* debug_string = (volatile char*)0x04FFF608u;
    *debug_enable = 0x4142676Du; // "mGBA"
    *debug_flags = 1u;           // enable string output
    size_t i = 0;
    while (message[i] != '\0' && i < 64) {
        debug_string[i] = message[i];
        ++i;
    }
    debug_string[i] = '\0';
    (void)level;
#else
    s_host_message_count++;
    s_host_last_level = level;
    if (s_host_output_enabled) {
        switch (level) {
        case LogLevel::Debug:
            printf("[DEBUG] %s\n", message);
            break;
        case LogLevel::Info:
            printf("[INFO] %s\n", message);
            break;
        case LogLevel::Warn:
            printf("[WARN] %s\n", message);
            break;
        case LogLevel::Error:
            printf("[ERROR] %s\n", message);
            break;
        case LogLevel::Fatal:
            printf("[FATAL] %s\n", message);
            break;
        }
    }
#endif
}

void log_value(LogLevel level, const char* label, int32_t value) {
#if defined(__arm__) || defined(__thumb__)
    // On ARM, format into a small stack buffer then forward to log_message.
    char buffer[64];
    size_t n = 0;
    if (label != nullptr) {
        size_t i = 0;
        while (label[i] != '\0' && n < 63) {
            buffer[n++] = label[i++];
        }
        buffer[n++] = '=';
    }
    // Minimal integer formatting (no libc dependency).
    char digits[12];
    int dcount = 0;
    uint32_t u = static_cast<uint32_t>(value < 0 ? -value : value);
    do {
        digits[dcount++] = static_cast<char>('0' + (u % 10));
        u /= 10;
    } while (u != 0);
    if (value < 0) {
        digits[dcount++] = '-';
    }
    while (dcount > 0 && n < 63) {
        buffer[n++] = digits[--dcount];
    }
    buffer[n] = '\0';
    log_message(level, buffer);
#else
    char buffer[64];
    size_t n = 0;
    if (label != nullptr) {
        size_t i = 0;
        while (label[i] != '\0' && n < 40) {
            buffer[n++] = label[i++];
        }
        buffer[n++] = '=';
    }
    char digits[12];
    int dcount = 0;
    uint32_t u = static_cast<uint32_t>(value < 0 ? -value : value);
    do {
        digits[dcount++] = static_cast<char>('0' + (u % 10));
        u /= 10;
    } while (u != 0);
    if (value < 0) {
        digits[dcount++] = '-';
    }
    while (dcount > 0 && n < 63) {
        buffer[n++] = digits[--dcount];
    }
    buffer[n] = '\0';
    log_message(level, buffer);
#endif
}

void log_debug(const char* message) {
    log_message(LogLevel::Debug, message);
}

void log_info(const char* message) {
    log_message(LogLevel::Info, message);
}

void log_warn(const char* message) {
    log_message(LogLevel::Warn, message);
}

void log_error(const char* message) {
    log_message(LogLevel::Error, message);
}

void log_set_host_output_enabled(bool enabled) {
#if defined(__arm__) || defined(__thumb__)
    (void)enabled;
#else
    s_host_output_enabled = enabled;
#endif
}

bool log_host_output_enabled() {
#if defined(__arm__) || defined(__thumb__)
    return false;
#else
    return s_host_output_enabled;
#endif
}

#if !defined(__arm__) && !defined(__thumb__)
size_t log_host_message_count() {
    return s_host_message_count;
}

LogLevel log_host_last_level() {
    return s_host_last_level;
}
#endif

} // namespace gbs

extern "C" void gbs_profiler_record_irq(uint32_t ticks) { gbs::s_irq_ticks += ticks; }
