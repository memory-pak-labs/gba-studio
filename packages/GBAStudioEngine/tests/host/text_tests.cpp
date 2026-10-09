#include <cassert>
#include <cstring>
#include <string>

#include "gbs/text.h"

namespace {

unsigned reference_glyph_index(uint32_t codepoint) {
    for (const auto& alias : gbs_font_aliases) {
        if (alias[0] == codepoint) { codepoint = alias[1]; break; }
    }
    for (unsigned i = 0; i < GBS_TEXT_GLYPH_COUNT; ++i) {
        if (gbs_font_codepoints[i] == codepoint) return i;
    }
    return 42;
}

void test_glyph_lookup_preserves_the_complete_unicode_contract() {
    for (uint32_t cp = 0; cp < 65536; ++cp)
        assert(gbs_text_glyph_index(cp) == reference_glyph_index(cp));
    for (uint32_t cp : {65536u, 0x1f642u, 0x10ffffu, 0x110000u, 0xffffffffu})
        assert(gbs_text_glyph_index(cp) == reference_glyph_index(cp));
}

void test_utf8_decoder_counts_portuguese_and_spanish_characters() {
    const char* text = u8"Olá, ação! ¿Qué? Ñandú";
    assert(gbs_text_codepoint_count(text) == 22);

    const char* cursor = text;
    assert(gbs_text_next_codepoint(&cursor) == 'O');
    assert(gbs_text_next_codepoint(&cursor) == 'l');
    assert(gbs_text_next_codepoint(&cursor) == 0x00E1u);
    assert(gbs_text_next_codepoint(&cursor) == ',');
}

void test_latin_glyph_map_covers_built_in_locales() {
    const uint32_t required[] = {
        0x00C1u, 0x00C0u, 0x00C2u, 0x00C3u,
        0x00C9u, 0x00CAu, 0x00CDu,
        0x00D3u, 0x00D4u, 0x00D5u,
        0x00DAu, 0x00DCu, 0x00C7u, 0x00D1u,
        0x00E1u, 0x00E0u, 0x00E2u, 0x00E3u,
        0x00E9u, 0x00EAu, 0x00EDu,
        0x00F3u, 0x00F4u, 0x00F5u,
        0x00FAu, 0x00FCu, 0x00E7u, 0x00F1u,
        0x00A1u, 0x00BFu
    };
    for (uint32_t codepoint : required) {
        assert(gbs_text_glyph_index(codepoint) != 0u);
        assert(gbs_text_glyph_index(codepoint) < GBS_TEXT_GLYPH_COUNT);
    }
    assert(gbs_text_glyph_index(0x00E1u) != gbs_text_glyph_index(0x00C1u));
    assert(gbs_text_glyph_index(0x00E7u) != gbs_text_glyph_index(0x00C7u));
    assert(gbs_text_glyph_index(0x00F1u) != gbs_text_glyph_index(0x00D1u));
}

void test_latin_font_is_shared_and_preserves_case() {
    assert(gbs_text_glyph_index('a') != gbs_text_glyph_index('A'));
    assert(gbs_text_glyph_index('+') != gbs_text_glyph_index(' '));
    assert(gbs_text_glyph_index(0x1f642) == gbs_text_glyph_index('?'));
}

void test_word_wrap_keeps_utf8_words_and_long_words_progress() {
    const char* text = u8"Olá ação agora";
    auto first = gbs_text_wrap_line(text, 8);
    assert(std::string(text, first.end) == u8"Olá ação");
    assert(std::strcmp(first.next, "agora") == 0);
    text = "manutencao\nfim";
    first = gbs_text_wrap_line(text, 5);
    assert(std::string(text, first.end) == "manut");
    assert(std::strcmp(first.next, "encao\nfim") == 0);
}

void test_font_cache_preserves_visible_glyphs_and_question_fallback() {
    uint16_t glyphs[GBS_TEXT_RESIDENT_GLYPHS];
    uint8_t pinned[GBS_TEXT_RESIDENT_GLYPHS];
    for (int i = 0; i < GBS_TEXT_RESIDENT_GLYPHS; ++i) { glyphs[i] = i; pinned[i] = 1; }
    assert(gbs_text_cache_slot(glyphs, pinned, 128 - 1) == -1);
    pinned[42] = 0; // ? remains available even under pressure.
    assert(gbs_text_cache_slot(glyphs, pinned, 127) == -1);
    pinned[7] = 0;
    assert(gbs_text_cache_slot(glyphs, pinned, 127) == 7);
    assert(glyphs[7] == 127 && glyphs[42] == 42);
    pinned[7] = 1;
    assert(gbs_text_cache_slot(glyphs, pinned, 127) == 7);
    for (int i = 0; i < GBS_TEXT_RESIDENT_GLYPHS; ++i) {
        if (i != 7) assert(glyphs[i] == i);
        pinned[i] = 0;
    }
    for (unsigned glyph = 0; glyph < GBS_TEXT_GLYPH_COUNT; ++glyph)
        assert(gbs_text_cache_slot(glyphs, pinned, glyph) >= 0);
}

void test_invalid_utf8_advances_with_replacement_glyph() {
    const char invalid[] = { static_cast<char>(0xC3), 'A', '\0' };
    const char* cursor = invalid;
    assert(gbs_text_next_codepoint(&cursor) == 0xFFFDu);
    assert(*cursor == 'A');
    assert(gbs_text_glyph_index(0xFFFDu) == gbs_text_glyph_index('?'));

    const char truncated[] = { static_cast<char>(0xE2), '\0' };
    cursor = truncated;
    assert(gbs_text_next_codepoint(&cursor) == 0xFFFDu);
    assert(*cursor == '\0');
}

} // namespace

int main() {
    test_glyph_lookup_preserves_the_complete_unicode_contract();
    test_font_cache_preserves_visible_glyphs_and_question_fallback();
    test_utf8_decoder_counts_portuguese_and_spanish_characters();
    test_latin_glyph_map_covers_built_in_locales();
    test_invalid_utf8_advances_with_replacement_glyph();
    test_latin_font_is_shared_and_preserves_case();
    test_word_wrap_keeps_utf8_words_and_long_words_progress();
    return 0;
}
