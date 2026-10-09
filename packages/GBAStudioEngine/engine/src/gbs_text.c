#include "gbs/text.h"

static int continuation(unsigned char value) {
    return (value & 0xC0u) == 0x80u;
}

uint32_t gbs_text_next_codepoint(const char** cursor) {
    if (cursor == 0 || *cursor == 0 || **cursor == '\0') {
        return 0;
    }

    const unsigned char* text = (const unsigned char*)*cursor;
    const unsigned char first = text[0];
    if (first < 0x80u) {
        *cursor += 1;
        return first;
    }
    if (first >= 0xC2u && first <= 0xDFu && text[1] != '\0' && continuation(text[1])) {
        *cursor += 2;
        return ((uint32_t)(first & 0x1Fu) << 6) | (uint32_t)(text[1] & 0x3Fu);
    }
    if (first >= 0xE0u && first <= 0xEFu && text[1] != '\0' && text[2] != '\0' &&
        continuation(text[1]) && continuation(text[2]) &&
        !(first == 0xE0u && text[1] < 0xA0u) && !(first == 0xEDu && text[1] >= 0xA0u)) {
        *cursor += 3;
        return ((uint32_t)(first & 0x0Fu) << 12) |
            ((uint32_t)(text[1] & 0x3Fu) << 6) |
            (uint32_t)(text[2] & 0x3Fu);
    }
    if (first >= 0xF0u && first <= 0xF4u && text[1] != '\0' && text[2] != '\0' && text[3] != '\0' &&
        continuation(text[1]) && continuation(text[2]) && continuation(text[3]) &&
        !(first == 0xF0u && text[1] < 0x90u) && !(first == 0xF4u && text[1] >= 0x90u)) {
        *cursor += 4;
        return ((uint32_t)(first & 0x07u) << 18) |
            ((uint32_t)(text[1] & 0x3Fu) << 12) |
            ((uint32_t)(text[2] & 0x3Fu) << 6) |
            (uint32_t)(text[3] & 0x3Fu);
    }

    *cursor += 1;
    return 0xFFFDu;
}

size_t gbs_text_codepoint_count(const char* text) {
    size_t count = 0;
    if (text == 0) {
        return 0;
    }
    while (*text != '\0') {
        gbs_text_next_codepoint(&text);
        ++count;
    }
    return count;
}

unsigned gbs_text_glyph_index(uint32_t codepoint) {
    if (codepoint < 256u) return gbs_font_latin_glyphs[codepoint];
    for (unsigned i = 0; i < sizeof(gbs_font_aliases) / sizeof(gbs_font_aliases[0]); ++i) {
        if (codepoint == gbs_font_aliases[i][0]) { codepoint = gbs_font_aliases[i][1]; break; }
    }
    for (unsigned i = 0; i < GBS_TEXT_GLYPH_COUNT; ++i) {
        if (gbs_font_codepoints[i] == codepoint) return i;
    }
    return 42; /* Visible question mark; unsupported text must not disappear. */
}

int gbs_text_cache_slot(uint16_t* glyphs, const uint8_t* pinned, unsigned glyph) {
    for (int i = 0; i < GBS_TEXT_RESIDENT_GLYPHS; ++i) {
        if (glyphs[i] == glyph) return i;
    }
    for (int i = 0; i < GBS_TEXT_RESIDENT_GLYPHS; ++i) {
        /* Keep ? available if a surface exceeds the simultaneous glyph budget. */
        if (!pinned[i] && glyphs[i] != 42) { glyphs[i] = (uint16_t)glyph; return i; }
    }
    return -1;
}

struct GbsTextLine gbs_text_wrap_line(const char* text, int columns) {
    const char* cursor = text;
    const char* last_space = 0;
    int column = 0;
    if (columns < 1) columns = 1;
    while (*cursor) {
        const char* start = cursor;
        uint32_t cp = gbs_text_next_codepoint(&cursor);
        if (cp == '\n') { struct GbsTextLine line = {start, cursor}; return line; }
        if (column >= columns) {
            const char* end = cp == ' ' ? start : (last_space ? last_space : start);
            const char* next = end;
            while (*next == ' ') ++next;
            struct GbsTextLine line = {end, next};
            return line;
        }
        if (cp == ' ' && start != text && start[-1] != ' ') last_space = start;
        ++column;
    }
    struct GbsTextLine line = {cursor, cursor};
    return line;
}

size_t gbs_text_width(const char* text, const struct FontProfile* profile) {
    size_t width = 0;
    if (text == 0) {
        return 0;
    }
    const char* cursor = text;
    while (*cursor != '\0') {
        const uint32_t codepoint = gbs_text_next_codepoint(&cursor);
        if (profile != 0 && codepoint < 128u) {
            width += profile->width[codepoint];
        } else {
            width += 8;
        }
    }
    return width;
}
