#include "gbs/typewriter.hpp"
#include "gbs/text.h"

namespace gbs {

namespace {

// Number of UTF-8 bytes needed to encode a codepoint (0 for invalid).
unsigned utf8_sequence_length(unsigned char lead) {
    if (lead < 0x80) return 1;
    if (lead >= 0xC2 && lead <= 0xDF) return 2;
    if (lead >= 0xE0 && lead <= 0xEF) return 3;
    if (lead >= 0xF0 && lead <= 0xF4) return 4;
    return 0;
}

// Copy the first `revealed_count` codepoints of `source` into `state.buffer`.
void rebuild_buffer(TypewriterState& state) {
    size_t written = 0;
    size_t revealed = 0;
    const char* cursor = state.text;
    if (cursor == nullptr) {
        state.buffer[0] = '\0';
        return;
    }
    while (*cursor != '\0' && written < typewriter_max_text_length) {
        if (revealed >= state.revealed_count) {
            break;
        }
        const unsigned len = utf8_sequence_length(static_cast<unsigned char>(*cursor));
        if (len == 0) {
            state.buffer[written++] = *cursor++;
            ++revealed;
            continue;
        }
        for (unsigned i = 0; i < len && *cursor != '\0' && written < typewriter_max_text_length; ++i) {
            state.buffer[written++] = *cursor++;
        }
        ++revealed;
    }
    state.buffer[written] = '\0';
}

} // namespace

size_t typewriter_source_length(const char* text) {
    return gbs_text_codepoint_count(text);
}

void typewriter_start(TypewriterState& state, const char* text, uint8_t chars_per_second, uint16_t delay_frames) {
    state.text = text;
    state.total_length = typewriter_source_length(text);
    state.revealed_count = 0;
    state.chars_per_second = chars_per_second;
    state.delay_frames = delay_frames;
    state.frames_remaining = 0;
    state.done = chars_per_second == 0;
    state.paused = false;

    if (state.done) {
        state.revealed_count = state.total_length;
    }

    // Copy the source into the buffer so callers always have a NUL-terminated view.
    size_t i = 0;
    if (text != nullptr) {
        while (text[i] != '\0' && i < typewriter_max_text_length) {
            state.buffer[i] = text[i];
            ++i;
        }
    }
    state.buffer[i] = '\0';

    if (chars_per_second == 0) {
        // Reveal everything now; buffer is already complete.
        return;
    }
    // Start with an empty buffer (nothing revealed yet).
    state.buffer[0] = '\0';
}

void typewriter_update(TypewriterState& state) {
    if (state.done || state.paused) {
        return;
    }

    // Consume initial delay.
    if (state.delay_frames > 0) {
        --state.delay_frames;
        return;
    }

    // If chars_per_second is 0 it's instant; otherwise advance the per-char clock.
    if (state.chars_per_second == 0) {
        state.revealed_count = state.total_length;
        state.done = true;
        return;
    }

    // Reveal one char every (60 / chars_per_second) frames.
    if (state.frames_remaining == 0) {
        state.frames_remaining = static_cast<uint16_t>(60 / state.chars_per_second);
    }
    if (state.frames_remaining > 0) {
        --state.frames_remaining;
    }
    if (state.frames_remaining == 0 && state.revealed_count < state.total_length) {
        ++state.revealed_count;
        rebuild_buffer(state);
        if (state.revealed_count >= state.total_length) {
            state.done = true;
        }
    }
}

void typewriter_skip(TypewriterState& state) {
    state.revealed_count = state.total_length;
    state.done = true;
    state.paused = false;
    state.delay_frames = 0;
    rebuild_buffer(state);
}

void typewriter_set_paused(TypewriterState& state, bool paused) {
    state.paused = paused;
}

bool typewriter_is_done(const TypewriterState& state) {
    return state.done;
}

bool typewriter_is_active(const TypewriterState& state) {
    return state.text != nullptr && !state.done;
}

size_t typewriter_revealed_count(const TypewriterState& state) {
    return state.revealed_count;
}

const char* typewriter_text(const TypewriterState& state) {
    return state.buffer;
}

} // namespace gbs