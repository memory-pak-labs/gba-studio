#include "gbs/debug.hpp"
#include "gbs_hw.h"

namespace {

gbs::DebugAssertion assertion_state {};
gbs::DebugFrameStats frame_stats {};
gbs::DebugCounter counters[gbs::debug_counter_count] {};
char overlay_buffer[26 * 7 + 1] {};
int32_t active_runtime_kind = -1;
#if defined(__arm__) || defined(__thumb__)
volatile gbs::RuntimeTelemetryBlock shared_runtime_telemetry __attribute__((section(".ewram_bss"), used));
volatile gbs::RuntimeTelemetryLegacyBlock shared_runtime_telemetry_legacy __attribute__((section(".ewram_bss"), used));
#else
volatile gbs::RuntimeTelemetryBlock shared_runtime_telemetry {};
volatile gbs::RuntimeTelemetryLegacyBlock shared_runtime_telemetry_legacy {};
#endif

void copy_label(char* destination, const char* source) {
    if (destination == nullptr) {
        return;
    }
    size_t index = 0;
    if (source != nullptr) {
        while (index + 1 < gbs::debug_label_length && source[index] != '\0' && source[index] != '\n') {
            destination[index] = source[index];
            ++index;
        }
    }
    destination[index] = '\0';
    while (++index < gbs::debug_label_length) {
        destination[index] = '\0';
    }
}

void append_char(char*& out, char* end, char value) {
    if (out < end) {
        *out = value;
        ++out;
    }
}

void append_text(char*& out, char* end, const char* text, size_t max_chars) {
    if (text == nullptr) {
        return;
    }
    size_t count = 0;
    while (*text != '\0' && *text != '\n' && count < max_chars) {
        append_char(out, end, *text);
        ++text;
        ++count;
    }
}

void append_uint(char*& out, char* end, uint32_t value) {
    char digits[10] = {};
    size_t count = 0;
    do {
        digits[count] = static_cast<char>('0' + (value % 10u));
        value /= 10u;
        ++count;
    } while (value != 0 && count < sizeof(digits));

    while (count > 0) {
        --count;
        append_char(out, end, digits[count]);
    }
}

void append_counter_line(char*& out, char* end, const gbs::DebugCounter& counter) {
    append_text(out, end, counter.label[0] != '\0' ? counter.label : "counter", 10);
    append_char(out, end, ':');
    append_uint(out, end, counter.value);
    append_char(out, end, '/');
    append_uint(out, end, counter.peak);
}

} // namespace

namespace gbs {

volatile RuntimeTelemetryBlock& runtime_telemetry_block() {
    return shared_runtime_telemetry;
}

volatile RuntimeTelemetryLegacyBlock& runtime_telemetry_legacy_block() {
    return shared_runtime_telemetry_legacy;
}

void debug_set_runtime_kind(int32_t runtime_kind) {
    active_runtime_kind = runtime_kind;
}

int32_t debug_runtime_kind() {
    return active_runtime_kind;
}

void reset_runtime_telemetry() {
    volatile RuntimeTelemetryBlock& telemetry = runtime_telemetry_block();
    uint32_t* words = const_cast<uint32_t*>(reinterpret_cast<const volatile uint32_t*>(&telemetry));
    for (size_t index = 0; index < sizeof(RuntimeTelemetryBlock) / sizeof(uint32_t); ++index) {
        words[index] = 0;
    }
    telemetry.magic = runtime_telemetry_magic;
    telemetry.schema = runtime_telemetry_schema;
    telemetry.word_count = sizeof(RuntimeTelemetryBlock) / sizeof(uint32_t);
    telemetry.current_room = -1;
    telemetry.first_actor_x = -1;
    telemetry.first_actor_y = -1;
    telemetry.first_actor_direction = -1;
    telemetry.last_music = -1;
    telemetry.last_sfx = -1;

    volatile RuntimeTelemetryLegacyBlock& legacy = runtime_telemetry_legacy_block();
    uint32_t* legacy_words = const_cast<uint32_t*>(reinterpret_cast<const volatile uint32_t*>(&legacy));
    for (size_t index = 0; index < sizeof(RuntimeTelemetryLegacyBlock) / sizeof(uint32_t); ++index) {
        legacy_words[index] = 0;
    }
    legacy.magic = runtime_telemetry_magic;
    legacy.schema = runtime_telemetry_legacy_schema;
    legacy.word_count = sizeof(RuntimeTelemetryLegacyBlock) / sizeof(uint32_t);
    legacy.current_room = -1;
    legacy.first_actor_x = -1;
    legacy.first_actor_y = -1;
    legacy.first_actor_direction = -1;
    legacy.last_music = -1;
    legacy.last_sfx = -1;
}

void sync_legacy_runtime_telemetry() {
    const volatile RuntimeTelemetryBlock& telemetry = runtime_telemetry_block();
    volatile RuntimeTelemetryLegacyBlock& legacy = runtime_telemetry_legacy_block();
    const volatile uint32_t* source = reinterpret_cast<const volatile uint32_t*>(&telemetry);
    uint32_t* destination = const_cast<uint32_t*>(reinterpret_cast<const volatile uint32_t*>(&legacy));
    for (size_t index = 0; index < sizeof(RuntimeTelemetryLegacyBlock) / sizeof(uint32_t); ++index) {
        destination[index] = source[index];
    }
    legacy.schema = runtime_telemetry_legacy_schema;
    legacy.word_count = sizeof(RuntimeTelemetryLegacyBlock) / sizeof(uint32_t);
}

void debug_begin_runtime_physical_sample() {
    volatile RuntimeTelemetryBlock& telemetry = runtime_telemetry_block();
    telemetry.physical_valid_bits = 0;
    telemetry.physical_bg_tiles = 0;
    telemetry.physical_obj_tiles = 0;
    telemetry.physical_oam = 0;
    telemetry.physical_palette_colors = 0;
    telemetry.physical_vram_bytes = 0;
    telemetry.physical_event_bytes = 0;
    telemetry.physical_audio_bytes = 0;
    telemetry.physical_dma_bytes = 0;
}

void debug_set_runtime_physical_telemetry(const RuntimePhysicalTelemetry& sample) {
    volatile RuntimeTelemetryBlock& telemetry = runtime_telemetry_block();
    telemetry.physical_valid_bits =
        (telemetry.physical_valid_bits & runtime_physical_timing_bits) |
        (sample.valid_bits & runtime_physical_non_timing_bits);
    telemetry.physical_bg_tiles = sample.bg_tiles;
    telemetry.physical_obj_tiles = sample.obj_tiles;
    telemetry.physical_oam = sample.oam;
    telemetry.physical_palette_colors = sample.palette_colors;
    telemetry.physical_vram_bytes = sample.vram_bytes;
    telemetry.physical_event_bytes = sample.event_bytes;
    telemetry.physical_audio_bytes = sample.audio_bytes;
    telemetry.physical_dma_bytes = sample.dma_bytes;
}

void debug_reset() {
    assertion_state = DebugAssertion {};
    frame_stats = DebugFrameStats {};
    for (size_t index = 0; index < debug_counter_count; ++index) {
        counters[index] = DebugCounter {};
    }
}

bool debug_assert(bool condition, const char* label, uint16_t code) {
    if (condition) {
        return true;
    }
    assertion_state.failed = true;
    assertion_state.frame = frame_stats.frame;
    assertion_state.code = code;
    copy_label(assertion_state.label, label);
    return false;
}

bool debug_assertion_failed() {
    return assertion_state.failed;
}

DebugAssertion debug_last_assertion() {
    return assertion_state;
}

void debug_set_frame_budget(uint32_t budget_units) {
    frame_stats.budget_units = budget_units;
}

void debug_begin_frame(uint32_t frame) {
    frame_stats.frame = frame;
}

void debug_end_frame(uint32_t work_units) {
    frame_stats.last_work_units = work_units;
    if (work_units > frame_stats.peak_work_units) {
        frame_stats.peak_work_units = work_units;
    }
    if (frame_stats.budget_units > 0 && work_units > frame_stats.budget_units) {
        ++frame_stats.over_budget_count;
    }
    ++frame_stats.frame_count;
}

DebugFrameStats debug_frame_stats() {
    return frame_stats;
}

bool debug_set_counter(size_t index, const char* label, uint32_t value) {
    if (index >= debug_counter_count) {
        return false;
    }
    copy_label(counters[index].label, label);
    counters[index].value = value;
    if (value > counters[index].peak) {
        counters[index].peak = value;
    }
    return true;
}

bool debug_add_counter(size_t index, uint32_t delta) {
    if (index >= debug_counter_count) {
        return false;
    }
    counters[index].value += delta;
    if (counters[index].value > counters[index].peak) {
        counters[index].peak = counters[index].value;
    }
    return true;
}

DebugCounter debug_counter(size_t index) {
    if (index >= debug_counter_count) {
        return DebugCounter {};
    }
    return counters[index];
}

const char* debug_overlay_text() {
    char* out = overlay_buffer;
    char* end = overlay_buffer + sizeof(overlay_buffer) - 1;

    append_text(out, end, "DBG F", 5);
    append_uint(out, end, frame_stats.frame);
    append_text(out, end, " W", 2);
    append_uint(out, end, frame_stats.last_work_units);
    append_char(out, end, '/');
    append_uint(out, end, frame_stats.peak_work_units);
    append_text(out, end, " O", 2);
    append_uint(out, end, frame_stats.over_budget_count);

    if (assertion_state.failed) {
        append_char(out, end, '\n');
        append_text(out, end, "ASSERT ", 7);
        append_uint(out, end, assertion_state.code);
        append_char(out, end, ' ');
        append_text(out, end, assertion_state.label, 14);
    }

    for (size_t index = 0; index < debug_counter_count; index += 2) {
        const DebugCounter& left = counters[index];
        if (index + 1 >= debug_counter_count) {
            if (left.label[0] != '\0') {
                append_char(out, end, '\n');
                append_counter_line(out, end, left);
            }
            break;
        }
        const DebugCounter& right = counters[index + 1];
        if (left.label[0] == '\0' && right.label[0] == '\0') {
            continue;
        }
        append_char(out, end, '\n');
        if (left.label[0] != '\0') {
            append_counter_line(out, end, left);
        }
        if (right.label[0] != '\0') {
            append_char(out, end, ' ');
            append_counter_line(out, end, right);
        }
    }

    *out = '\0';
    return overlay_buffer;
}

void draw_debug_overlay(bool visible) {
    gbs_hw_draw_text_box(1, 1, 30, 9, visible ? debug_overlay_text() : nullptr, visible ? 1 : 0);
}

} // namespace gbs
