#include "gbs/profiler.hpp"
#include "gbs_hw.h"

#include <stdio.h>

namespace gbs {

// ============================================================
// Profiler
// ============================================================

namespace {

ProfilerRegion s_regions[profiler_max_regions] = {};
size_t s_region_count = 0;
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

void profiler_reset() {
    for (size_t i = 0; i < profiler_max_regions; ++i) {
        s_regions[i] = ProfilerRegion {};
    }
    s_region_count = 0;
    s_frame_total_ticks = 0;
    s_last_frame_total_ticks = 0;
    s_frame_count = 0;
}

uint8_t profiler_begin(const char* label) {
    if (s_region_count >= profiler_max_regions) {
        return 0xFF;
    }
    const uint8_t index = static_cast<uint8_t>(s_region_count);
    ProfilerRegion& region = s_regions[index];
    for (size_t i = 0; i < profiler_label_length - 1 && label != nullptr && label[i] != '\0'; ++i) {
        region.label[i] = label[i];
    }
    s_region_count++;
    region.last_ticks = read_ticks();
    return index;
}

void profiler_end(uint8_t region) {
    if (region >= s_region_count) {
        return;
    }
    ProfilerRegion& r = s_regions[region];
    const uint32_t now = read_ticks();
    const uint32_t delta = (now >= r.last_ticks) ? (now - r.last_ticks) : 0;
    r.last_ticks = now;
    r.samples++;
    r.total_ticks += delta;
    if (r.samples == 1 || delta < r.min_ticks) {
        r.min_ticks = delta;
    }
    if (delta > r.max_ticks) {
        r.max_ticks = delta;
    }
    s_frame_total_ticks += delta;
}

void profiler_frame_begin() {
    s_frame_total_ticks = 0;
}

void profiler_frame_end() {
    s_last_frame_total_ticks = s_frame_total_ticks;
    ++s_frame_count;
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
