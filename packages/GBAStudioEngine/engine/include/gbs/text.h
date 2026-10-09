#pragma once

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#include "gbs/text_font_data.h"

struct FontProfile {
    uint8_t width[128];  // width per codepoint (0x00-0x7F), in pixels
    uint8_t advance[128]; // advance width in 1/256ths of a pixel
    uint8_t fallback_glyph; // glyph index to use for unsupported codepoints
};

uint32_t gbs_text_next_codepoint(const char** cursor);
size_t gbs_text_codepoint_count(const char* text);
unsigned gbs_text_glyph_index(uint32_t codepoint);
/* Preserve the existing UI VRAM footprint; the full atlas lives in ROM. */
#define GBS_TEXT_RESIDENT_GLYPHS 101
int gbs_text_cache_slot(uint16_t* glyphs, const uint8_t* pinned, unsigned glyph);
struct GbsTextLine { const char* end; const char* next; };
struct GbsTextLine gbs_text_wrap_line(const char* text, int columns);
size_t gbs_text_width(const char* text, const struct FontProfile* profile);

#ifdef __cplusplus
}
#endif
