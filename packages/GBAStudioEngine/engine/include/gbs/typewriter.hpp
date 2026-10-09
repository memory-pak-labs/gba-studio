#pragma once

#include <stddef.h>
#include <stdint.h>

namespace gbs {

// ============================================================
// Typewriter - reveals text progressively, frame by frame
// ============================================================

constexpr size_t typewriter_max_text_length = 256;

struct TypewriterState {
    const char* text;                 // full source text (may be longer than buffer)
    char buffer[typewriter_max_text_length + 1]; // revealed portion (NUL-terminated)
    size_t total_length;              // codepoint count of source text
    size_t revealed_count;            // how many codepoints revealed so far
    uint8_t chars_per_second;         // reveal rate
    uint16_t delay_frames;            // initial delay before revealing starts
    uint16_t frames_remaining;        // internal per-char counter
    bool done;                        // true once fully revealed
    bool paused;
};

// Initialize/start a typewriter session for the given text.
// chars_per_second: 0 means "instant" (reveal everything).
// delay_frames: optional initial pause before the first character.
void typewriter_start(TypewriterState& state, const char* text, uint8_t chars_per_second = 20, uint16_t delay_frames = 0);

// Advance the typewriter by one frame. Call once per frame.
void typewriter_update(TypewriterState& state);

// Reveal the entire remaining text immediately.
void typewriter_skip(TypewriterState& state);

// Pause/resume the typewriter.
void typewriter_set_paused(TypewriterState& state, bool paused);

// Query helpers.
bool typewriter_is_done(const TypewriterState& state);
bool typewriter_is_active(const TypewriterState& state);
size_t typewriter_revealed_count(const TypewriterState& state);
const char* typewriter_text(const TypewriterState& state);

// How many codepoints in the source text (uses gbs_text codepoint counting).
size_t typewriter_source_length(const char* text);

} // namespace gbs