#include <cassert>
#include <cstring>
#include "gbs/dialogue.hpp"
#include "gbs/runtime_checkpoint.hpp"

extern "C" void gbs_hw_draw_dialogue_box(const char*, int) {
}

struct DrawCall {
    int x;
    int y;
    int width;
    int height;
    char text[128];
    int visible;
};

DrawCall draw_calls[4] = {};
int draw_call_count = 0;

extern "C" void gbs_hw_draw_text_box(int x, int y, int width, int height, const char* text, int visible) {
    if (draw_call_count >= static_cast<int>(sizeof(draw_calls) / sizeof(draw_calls[0]))) return;
    DrawCall& call = draw_calls[draw_call_count++];
    call.x = x;
    call.y = y;
    call.width = width;
    call.height = height;
    call.visible = visible;
    if (text != nullptr) {
        std::strncpy(call.text, text, sizeof(call.text) - 1);
        call.text[sizeof(call.text) - 1] = '\0';
    }
}

void reset_draw_calls() {
    draw_call_count = 0;
    std::memset(draw_calls, 0, sizeof(draw_calls));
}

extern "C" void gbs_hw_configure_dialogue_box_skin(const uint8_t*, const uint16_t*) {
}

extern "C" void gbs_hw_configure_hud_box_skin(const uint8_t*, const uint16_t*) {
}

extern "C" void gbs_hw_configure_hud_box(int, int, int, int) {
}

extern "C" void gbs_hw_configure_dialogue_font(const uint8_t*) {
}
extern "C" void gbs_hw_configure_dialogue_choice_selector(const uint8_t*) {
}

namespace {

void test_show_dialogue_selects_line() {
    const gbs::DialogueLine lines[] = {
        { "OLA" },
        { "PORTAL ATIVADO" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);

    bool shown = gbs::show_dialogue(state, lines, 2, 1);

    assert(shown);
    assert(state.visible);
    assert(state.line_index == 1);
    assert(state.text == lines[1].text);
    assert(state.page_text == lines[1].text);
    assert(state.page_index == 0);
    assert(!state.has_next_page);
}

void test_show_dialogue_preserves_speaker_and_portrait() {
    const gbs::DialogueLine lines[] = {
        { "OLA", "Guide", "guide.png", "intro" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);

    bool shown = gbs::show_dialogue(state, lines, 1, 0);

    assert(shown);
    assert(state.speaker == lines[0].speaker);
    assert(state.portrait == lines[0].portrait);
    assert(state.key == lines[0].key);
}

void test_show_dialogue_copies_confirm_sound_indices() {
    const gbs::DialogueLine lines[] = {
        gbs::DialogueLine {
            "OLA",
            "Guide",
            nullptr,
            nullptr,
            "intro",
            "text_blip.wav",
            "confirm.wav",
            2,
            1
        }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);

    bool shown = gbs::show_dialogue(state, lines, 1, 0);

    assert(shown);
    assert(state.confirm_sfx_index == 2);
    assert(state.confirm_pcm_index == 1);
}

void test_show_dialogue_rejects_bad_index() {
    const gbs::DialogueLine lines[] = {
        { "OLA" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);

    bool shown = gbs::show_dialogue(state, lines, 1, 4);

    assert(!shown);
    assert(!state.visible);
    assert(state.line_index == -1);
    assert(state.page_text == nullptr);
}

void test_show_dialogue_selects_configured_locale_with_default_fallback() {
    const gbs::DialogueTranslation translations[] = {
        { "pt-BR", "OLA {player}" },
        { "es", "HOLA {player}" }
    };
    const gbs::DialogueLine lines[] = {
        gbs::DialogueLine {
            "HELLO {player}", nullptr, nullptr, nullptr, "welcome", nullptr, nullptr, -1, -1,
            "en", "pt-BR", translations, 2
        }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);

    gbs::configure_dialogue_locale("es");
    assert(gbs::show_dialogue(state, lines, 1, 0));
    assert(state.text == translations[1].text);

    gbs::configure_dialogue_locale("fr");
    assert(gbs::show_dialogue(state, lines, 1, 0));
    assert(state.text == translations[0].text);

    gbs::configure_dialogue_locale("en");
    assert(gbs::show_dialogue(state, lines, 1, 0));
    assert(state.text == lines[0].text);
}

void test_choice_dialogue_renders_configured_locale() {
    const gbs::DialogueTranslation choice_translations[] = {
        { "pt-BR", "Continuar" },
        { "es", "Seguir" }
    };
    const gbs::DialogueLine lines[] = { { "Choose" } };
    const gbs::DialogueChoice choices[] = {
        gbs::DialogueChoice { "Continue", 1, -1, "en", "pt-BR", choice_translations, 2 }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::configure_dialogue_locale("es");

    assert(gbs::show_dialogue_choices(state, lines, 1, 0, choices, 1));
    assert(std::strstr(state.page_text, "Seguir") != nullptr);
    gbs::configure_dialogue_locale("en");
}

void test_advance_hides_on_button_press() {
    const gbs::DialogueLine lines[] = {
        { "OLA" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::show_dialogue(state, lines, 1, 0);

    bool closed = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 });

    assert(closed);
    assert(!state.visible);
    assert(state.text == nullptr);
    assert(state.page_text == nullptr);
}

void test_dialogue_text_speed_reveals_page_over_updates() {
    const gbs::DialogueLine lines[] = {
        { "ABC" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::set_dialogue_text_speed(state, 2);

    gbs::show_dialogue(state, lines, 1, 0);

    assert(!state.page_complete);
    assert(state.visible_text[0] == '\0');

    gbs::update_dialogue(state);
    assert(state.visible_text[0] == '\0');

    gbs::update_dialogue(state);
    assert(state.visible_text[0] == 'A');
    assert(state.visible_text[1] == '\0');
    assert(!state.page_complete);
}

void test_utf8_dialogue_reveals_whole_accented_characters() {
    const gbs::DialogueLine lines[] = {
        { u8"Olá, ação!" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::set_dialogue_text_speed(state, 1);
    gbs::show_dialogue(state, lines, 1, 0);

    assert(state.page_char_count == 10);
    gbs::update_dialogue(state);
    gbs::update_dialogue(state);
    gbs::update_dialogue(state);
    assert(state.visible_char_count == 3);
    assert(std::strcmp(state.visible_text, u8"Olá") == 0);
}

void test_localized_choice_keeps_accented_line_and_choice_text() {
    const gbs::DialogueTranslation line_translations[] = {
        { "pt-BR", u8"Você está pronto?" },
        { "es", u8"¿Estás listo?" }
    };
    const gbs::DialogueTranslation choice_translations[] = {
        { "pt-BR", u8"Sim, ação!" },
        { "es", u8"Sí, acción!" }
    };
    const gbs::DialogueLine lines[] = {
        gbs::DialogueLine {
            "Are you ready?", nullptr, nullptr, nullptr, "ready", nullptr, nullptr, -1, -1,
            "en", "pt-BR", line_translations, 2
        }
    };
    const gbs::DialogueChoice choices[] = {
        gbs::DialogueChoice { "Yes", 1, -1, "en", "pt-BR", choice_translations, 2 }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::configure_dialogue_locale("es");

    assert(gbs::show_dialogue_choices(state, lines, 1, 0, choices, 1));
    assert(std::strstr(state.page_text, u8"¿Estás listo?") != nullptr);
    assert(std::strstr(state.page_text, u8"Sí, acción!") != nullptr);
    gbs::configure_dialogue_locale("en");
}

void test_dialogue_marks_revealed_character_for_text_sfx() {
    const gbs::DialogueLine lines[] = {
        { "AB" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::set_dialogue_text_sfx(state, 1);
    gbs::set_dialogue_text_speed(state, 1);
    gbs::show_dialogue(state, lines, 1, 0);

    assert(!state.revealed_char_this_frame);

    gbs::update_dialogue(state);

    assert(state.revealed_char_this_frame);
    assert(state.text_sfx_index == 1);

    gbs::update_dialogue(state);

    assert(state.revealed_char_this_frame);
    assert(state.page_complete);
}

void test_dialogue_frame_can_be_changed_before_showing_text() {
    const gbs::DialogueLine lines[] = {
        { "OLA" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::set_dialogue_frame(state, 2);

    gbs::show_dialogue(state, lines, 1, 0);

    assert(state.frame_index == 2);
    assert(state.visible);
}

void test_dialogue_box_layout_matches_export_frame_positions() {
    const gbs::DialogueBoxLayout inferior = gbs::dialogue_box_layout_for_frame(0);
    const gbs::DialogueBoxLayout superior = gbs::dialogue_box_layout_for_frame(1);
    const gbs::DialogueBoxLayout center = gbs::dialogue_box_layout_for_frame(2);

    assert(inferior.y == 14);
    assert(superior.y == 0);
    assert(center.y == 7);
    assert(inferior.w == 28);
    assert(inferior.h == 5);
    assert(superior.h == 5);
    assert(center.h == 5);
}

void test_dialogue_name_label_layout_attaches_to_each_frame() {
    const gbs::DialogueBoxLayout inferior = gbs::dialogue_name_label_layout_for_frame(0, 8);
    const gbs::DialogueBoxLayout superior = gbs::dialogue_name_label_layout_for_frame(1, 8);
    const gbs::DialogueBoxLayout center = gbs::dialogue_name_label_layout_for_frame(2, 8);

    assert(inferior.x == 1);
    assert(inferior.y == 11);
    assert(inferior.w == 8);
    assert(inferior.h == gbs::dialogue_name_label_height);
    assert(superior.y == 5);
    assert(center.y == 4);
}

void test_dialogue_separate_portrait_and_name_boxes_do_not_overlap() {
    const gbs::DialogueBoxLayout inferior_portrait = gbs::dialogue_portrait_slot_layout_for_frame(0, false);
    const gbs::DialogueBoxLayout inferior_name = gbs::dialogue_name_label_layout_for_frame(0, 8, true, false);
    assert(inferior_portrait.x == 1);
    assert(inferior_portrait.y == 6);
    assert(inferior_portrait.w == 8);
    assert(inferior_portrait.h == 8);
    assert(inferior_portrait.y + inferior_portrait.h == 14);
    assert(inferior_name.x == 9);
    assert(inferior_name.y + inferior_name.h == 14);
    assert(inferior_portrait.x + inferior_portrait.w <= inferior_name.x);

    const gbs::DialogueBoxLayout superior_portrait = gbs::dialogue_portrait_slot_layout_for_frame(1, true);
    const gbs::DialogueBoxLayout superior_name = gbs::dialogue_name_label_layout_for_frame(1, 8, true, true);
    assert(superior_portrait.x == 21);
    assert(superior_portrait.y == 9);
    assert(superior_name.y == 5);
    assert(superior_name.y + superior_name.h <= superior_portrait.y);

    const gbs::DialogueBoxLayout center_portrait = gbs::dialogue_portrait_slot_layout_for_frame(2, false);
    const gbs::DialogueBoxLayout center_name = gbs::dialogue_name_label_layout_for_frame(2, 8, true, false);
    assert(center_portrait.y == 0);
    assert(center_portrait.h == 7);
    assert(center_portrait.y + center_portrait.h <= center_name.y);
    assert(center_name.y == 12);
}

void test_battle_dialogue_layout_splits_the_lower_ui_band() {
    const gbs::DialogueBoxLayout prompt = gbs::dialogue_box_layout_for_frame(3);
    const gbs::DialogueBoxLayout menu = gbs::dialogue_box_layout_for_frame(4);

    assert(prompt.x == 1);
    assert(prompt.y == 15);
    assert(prompt.w == 18);
    assert(prompt.h == 5);
    assert(menu.x == 19);
    assert(menu.y == 15);
    assert(menu.w == 11);
    assert(menu.h == 5);
    assert(prompt.y + prompt.h == 20);
    assert(menu.y + menu.h == 20);
    assert(prompt.x + prompt.w == menu.x);
    assert(menu.h - 2 >= 1 + static_cast<int>(gbs::dialogue_max_visible_choices));
}

void test_battle_choices_fit_the_narrow_panel_after_changing_frame() {
    const gbs::DialogueLine lines[] = {{ "COMANDO" }};
    const gbs::DialogueChoice choices[] = {{ "DEFENDER",0 },{ "ATAQUE DO GELO",1 },{ "TERCEIRA",2 },{ "QUARTA",3 }};
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    assert(gbs::show_dialogue_choices(state,lines,1,0,choices,4));
    gbs::set_dialogue_frame(state,gbs::dialogue_frame_battle_menu);
    char display[256];
    gbs::format_dialogue_display_text(state,display,sizeof(display));
    assert(std::strcmp(display,"COMANDO\n! DEFENDE\n- ATAQUE ")==0);
    assert(gbs::advance_dialogue(state,gbs::InputState {gbs::ButtonDown,gbs::ButtonDown,0}));
    assert(gbs::advance_dialogue(state,gbs::InputState {gbs::ButtonDown,gbs::ButtonDown,0}));
    gbs::format_dialogue_display_text(state,display,sizeof(display));
    assert(std::strstr(display,"! TERCEI")!=nullptr);
}

void test_advance_completes_text_speed_page_before_closing() {
    const gbs::DialogueLine lines[] = {
        { "ABC" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::set_dialogue_text_speed(state, 2);
    gbs::show_dialogue(state, lines, 1, 0);

    bool completed = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 });

    assert(completed);
    assert(state.visible);
    assert(state.page_complete);
    assert(state.visible_text[0] == 'A');
    assert(state.visible_text[1] == 'B');
    assert(state.visible_text[2] == 'C');
    assert(state.visible_text[3] == '\0');
}

void test_advance_pages_before_closing() {
    const gbs::DialogueLine lines[] = {
        { "LINHA 1\nLINHA 2\nLINHA 3\nLINHA 4" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::show_dialogue(state, lines, 1, 0);

    assert(state.visible);
    assert(state.has_next_page);

    bool advanced = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 });

    assert(advanced);
    assert(state.visible);
    assert(state.page_index == 1);
    assert(state.page_text[0] == 'L');
    assert(state.page_text[6] == '4');
    assert(!state.has_next_page);

    bool closed = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 });

    assert(closed);
    assert(!state.visible);
}

void test_advance_pages_by_wrapped_columns() {
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 26, 3, true, true, false });
    const gbs::DialogueLine lines[] = {
        { "ABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZABCDEFGHIJKLMNOPQRSTUVWXYZ!" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::show_dialogue(state, lines, 1, 0);

    assert(state.has_next_page);
    bool advanced = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonStart, gbs::ButtonStart, 0 });

    assert(advanced);
    assert(state.visible);
    assert(state.page_index == 1);
    assert(state.page_text[0] == '!');
    assert(!state.has_next_page);
}

void test_choice_dialogue_selects_value() {
    const gbs::DialogueLine lines[] = {
        { "ESCOLHA" }
    };
    const gbs::DialogueChoice choices[] = {
        { "SIM", 1 },
        { "NAO", 2 }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);

    bool shown = gbs::show_dialogue_choices(state, lines, 1, 0, choices, 2);

    assert(shown);
    assert(state.visible);
    assert(state.choice_mode);
    assert(state.selected_choice == 0);
    assert(state.last_choice_value == -1);
    assert(state.last_choice_index == -1);
    assert(state.last_choice_script == -1);
    assert(state.page_text != nullptr);

    bool moved = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 });
    assert(moved);
    assert(state.selected_choice == 1);
    assert(state.visible);

    bool accepted = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 });
    assert(accepted);
    assert(!state.visible);
    assert(state.last_choice_value == 2);
    assert(state.last_choice_index == 1);
    assert(state.last_choice_script == -1);
}

void test_choice_dialogue_scrolls_beyond_visible_options() {
    const gbs::DialogueLine lines[] = {
        { "ESCOLHA" }
    };
    const gbs::DialogueChoice choices[] = {
        { "UM", 1 },
        { "DOIS", 2 },
        { "TRES", 3 },
        { "QUATRO", 4 }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);

    bool shown = gbs::show_dialogue_choices(state, lines, 1, 0, choices, 4);

    assert(shown);
    assert(state.choice_count == 4);
    assert(state.selected_choice == 0);
    assert(state.has_next_page);

    assert(gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }));
    assert(state.selected_choice == 1);
    assert(gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }));
    assert(state.selected_choice == 2);
    assert(state.has_next_page);
    assert(gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }));
    assert(state.selected_choice == 3);
    assert(!state.has_next_page);

    bool accepted = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 });
    assert(accepted);
    assert(!state.visible);
    assert(state.last_choice_value == 4);
    assert(state.last_choice_index == 3);
    assert(state.last_choice_script == -1);
}

void test_choice_dialogue_outputs_optional_script() {
    const gbs::DialogueLine lines[] = {
        { "ESCOLHA" }
    };
    const gbs::DialogueChoice choices[] = {
        { "SIM", 1, 7 },
        { "NAO", 2, 9 }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);

    bool shown = gbs::show_dialogue_choices(state, lines, 1, 0, choices, 2);

    assert(shown);
    assert(gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }));
    assert(gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 }));
    assert(!state.visible);
    assert(state.last_choice_value == 2);
    assert(state.last_choice_index == 1);
    assert(state.last_choice_script == 9);
}

void test_choice_dialogue_cancel_has_no_value() {
    const gbs::DialogueLine lines[] = {
        { "ESCOLHA" }
    };
    const gbs::DialogueChoice choices[] = {
        { "SIM", 1 }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::show_dialogue_choices(state, lines, 1, 0, choices, 1);

    bool cancelled = gbs::advance_dialogue(state, gbs::InputState { gbs::ButtonB, gbs::ButtonB, 0 });

    assert(cancelled);
    assert(!state.visible);
    assert(state.last_choice_value == -1);
    assert(state.last_choice_index == -1);
    assert(state.last_choice_script == -1);
}

void test_dialogue_display_text_includes_speaker_when_enabled() {
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, true, false });
    const gbs::DialogueLine lines[] = {
        { "Ola mundo", "Guia" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::show_dialogue(state, lines, 1, 0);

    char buffer[128] = {};
    const size_t length = gbs::format_dialogue_display_text(state, buffer, sizeof(buffer));
    assert(length > 0);
    assert(buffer[0] == 'G');
    assert(buffer[4] == ':');
    assert(buffer[5] == '\n');
    assert(buffer[6] == 'O');

    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, false, false });
    buffer[0] = '\0';
    gbs::format_dialogue_display_text(state, buffer, sizeof(buffer));
    assert(buffer[0] == 'O');
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_dialogue_name_label_mode_draws_speaker_above_box() {
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, true, false, false, true });
    const gbs::DialogueLine lines[] = {
        { "Ola mundo", "Guia" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    assert(gbs::show_dialogue(state, lines, 1, 0));

    char buffer[128] = {};
    gbs::format_dialogue_display_text(state, buffer, sizeof(buffer));
    assert(std::strcmp(buffer, "Ola mundo") == 0);

    reset_draw_calls();
    gbs::draw_dialogue(state);
    assert(draw_call_count == 3);
    assert(draw_calls[0].x == 1);
    assert(draw_calls[0].y == 11);
    assert(draw_calls[0].width == 28);
    assert(draw_calls[0].height == gbs::dialogue_name_label_height);
    assert(draw_calls[0].text[0] == '\0');
    assert(draw_calls[0].visible == 0);
    assert(draw_calls[1].x == 1);
    assert(draw_calls[1].y == 11);
    assert(draw_calls[1].width == 6);
    assert(draw_calls[1].height == gbs::dialogue_name_label_height);
    assert(std::strcmp(draw_calls[1].text, "Guia") == 0);
    assert(draw_calls[1].visible == 1);
    assert(draw_calls[2].x == 1);
    assert(draw_calls[2].y == 14);
    assert(draw_calls[2].width == 28);
    assert(draw_calls[2].height == 5);
    assert(std::strcmp(draw_calls[2].text, "Ola mundo") == 0);

    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_dialogue_separate_portrait_box_uses_dialogue_skin_frame() {
    gbs::MetaSprite portrait_sprite { nullptr, 0 };
    const gbs::DialoguePortraitEntry entries[] = {
        { "guide.png", &portrait_sprite }
    };
    gbs::configure_dialogue_portraits(entries, 1);
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, true, false, true, true });
    const gbs::DialogueLine lines[] = {
        { "Ola mundo", "Guia", "guide.png" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    assert(gbs::show_dialogue(state, lines, 1, 0));

    reset_draw_calls();
    gbs::draw_dialogue(state);
    assert(draw_call_count == 4);
    assert(draw_calls[0].x == 1);
    assert(draw_calls[0].y == 11);
    assert(draw_calls[0].width == 28);
    assert(draw_calls[0].visible == 0);
    assert(draw_calls[1].x == 1);
    assert(draw_calls[1].y == 11);
    assert(draw_calls[1].width == 3);
    assert(draw_calls[1].height == 3);
    assert(std::strcmp(draw_calls[1].text, "") == 0);
    assert(draw_calls[1].visible == 1);
    assert(draw_calls[2].x == 4);
    assert(draw_calls[2].y == 11);
    assert(draw_calls[2].width == 6);
    assert(draw_calls[2].height == gbs::dialogue_name_label_height);
    assert(std::strcmp(draw_calls[2].text, "Guia") == 0);
    assert(draw_calls[3].x == 1);
    assert(draw_calls[3].y == 14);
    assert(draw_calls[3].width == 28);
    assert(draw_calls[3].height == 5);

    gbs::configure_dialogue_portraits(nullptr, 0);
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_word_wrap_pagination_and_typewriter_preserve_accented_words() {
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 8, 1, true, false, false });
    const gbs::DialogueLine lines[] = {{ u8"Olá ação agora" }};
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::set_dialogue_text_speed(state, 1);
    gbs::show_dialogue(state, lines, 1, 0);
    char buffer[128];
    for (int i = 0; i < 8; ++i) gbs::update_dialogue(state);
    gbs::format_dialogue_display_text(state, buffer, sizeof(buffer));
    assert(std::strcmp(buffer, u8"Olá ação") == 0);
    assert(state.has_next_page);
    // Complete a page, advance, reveal the next word, and close normally.
    const gbs::InputState confirm { gbs::ButtonA, gbs::ButtonA, 0 };
    if (!state.page_complete) gbs::advance_dialogue(state, confirm);
    gbs::advance_dialogue(state, confirm);
    assert(std::strcmp(state.page_text, "agora") == 0);
    for (int i = 0; i < 5; ++i) gbs::update_dialogue(state);
    gbs::format_dialogue_display_text(state, buffer, sizeof(buffer));
    assert(std::strcmp(buffer, "agora") == 0);
    gbs::advance_dialogue(state, confirm);
    assert(!state.visible);
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_configure_dialogue_ui_wrap_columns() {
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 20, 2, true, true, false });
    assert(gbs::active_dialogue_ui_config().wrap_columns == 20);
    assert(gbs::active_dialogue_ui_config().wrap_lines == 2);

    const gbs::DialogueLine lines[] = {
        { "ABCDEFGHIJKLMNOPQRST" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::show_dialogue(state, lines, 1, 0);
    assert(state.page_char_count == 20);
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_dialogue_emote_lookup_and_position() {
    gbs::MetaSprite emote_sprite { nullptr, 0 };
    const gbs::DialogueEmoteEntry entries[] = {
        { "Smile.png", &emote_sprite }
    };
    gbs::configure_dialogue_emotes(entries, 1);
    assert(gbs::dialogue_emote_metasprite("Smile.png") == &emote_sprite);

    const gbs::DialogueLine lines[] = {
        { "Ola", "Guide", nullptr, "Smile.png", "intro" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::show_dialogue(state, lines, 1, 0);
    assert(gbs::dialogue_should_show_emote(state));
    gbs::Vec2i position = gbs::dialogue_emote_position_pixels(gbs::Vec2i { 80, 96 });
    assert(position.x == 80);
    assert(position.y == 80);
    gbs::configure_dialogue_emotes(nullptr, 0);
}

void test_dialogue_portrait_lookup_and_position() {
    gbs::MetaSprite portrait_sprite { nullptr, 0 };
    const gbs::DialoguePortraitEntry entries[] = {
        { "guide.png", &portrait_sprite }
    };
    gbs::configure_dialogue_portraits(entries, 1);
    assert(gbs::dialogue_portrait_metasprite("guide.png") == &portrait_sprite);
    assert(gbs::dialogue_portrait_metasprite("missing.png") == nullptr);

    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, true, false });
    const gbs::DialogueLine lines[] = {
        { "Ola", "Guide", "guide.png", "intro" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    gbs::show_dialogue(state, lines, 1, 0);
    assert(gbs::dialogue_should_show_portrait(state));
    char display_buffer[128] = {};
    gbs::format_dialogue_display_text(state, display_buffer, sizeof(display_buffer));
    assert(strncmp(display_buffer, "   Guide:\n   Ola", 16) == 0);
    gbs::Vec2i left_position = gbs::dialogue_portrait_position_pixels(state);
    assert(left_position.x == 16);
    assert(left_position.y == 128);
    assert(gbs::dialogue_portrait_oam_index < 112);

    const gbs::MetaSpritePart large_portrait_part { 0, 0, 0, 0, false, false, 32, 32 };
    const gbs::MetaSprite large_portrait { &large_portrait_part, 1 };
    const gbs::DialoguePortraitEntry large_portrait_entries[] = {
        { "large.png", &large_portrait }
    };
    gbs::configure_dialogue_portraits(large_portrait_entries, 1);
    const gbs::DialogueLine large_portrait_line[] = {
        { "Ola", "Guide", "large.png", "large" }
    };
    gbs::DialogueState large_portrait_state;
    gbs::init_dialogue(large_portrait_state);
    gbs::show_dialogue(large_portrait_state, large_portrait_line, 1, 0);
    gbs::Vec2i large_portrait_position = gbs::dialogue_portrait_position_pixels(large_portrait_state);
    assert(large_portrait_position.x == 16);
    assert(large_portrait_position.y == 120);
    char large_portrait_display[128] = {};
    gbs::format_dialogue_display_text(large_portrait_state, large_portrait_display, sizeof(large_portrait_display));
    assert(strncmp(large_portrait_display, "    Guide:\n    Ola", 18) == 0);

    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, true, true });
    display_buffer[0] = '\0';
    gbs::format_dialogue_display_text(state, display_buffer, sizeof(display_buffer));
    assert(strncmp(display_buffer, "Guide:\nOla", 10) == 0);
    gbs::Vec2i right_position = gbs::dialogue_portrait_position_pixels(state);
    assert(right_position.x > left_position.x);

    gbs::configure_dialogue_portraits(nullptr, 0);
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_dialogue_choices_keep_portrait_text_inside_box() {
    gbs::MetaSprite portrait_sprite { nullptr, 0 };
    const gbs::DialoguePortraitEntry entries[] = {
        { "guide.png", &portrait_sprite }
    };
    gbs::configure_dialogue_portraits(entries, 1);
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 4, true, true, false });

    const gbs::DialogueLine lines[] = {
        { "A rota exige coragem e precisao. Voce aceita o pacto?", "Guia", "guide.png" }
    };
    const gbs::DialogueChoice choices[] = {
        { "Aceitar", 1 }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    assert(gbs::show_dialogue_choices(state, lines, 1, 0, choices, 1));

    char display_buffer[128] = {};
    gbs::format_dialogue_display_text(state, display_buffer, sizeof(display_buffer));
    const char* line_start = display_buffer;
    while (*line_start != '\0') {
        const char* line_end = strchr(line_start, '\n');
        const size_t line_length = line_end == nullptr
            ? strlen(line_start)
            : static_cast<size_t>(line_end - line_start);
        assert(line_length <= 26);
        assert(strncmp(line_start, "   ", 3) == 0);
        if (line_end == nullptr) {
            break;
        }
        line_start = line_end + 1;
    }

    gbs::configure_dialogue_portraits(nullptr, 0);
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_dialogue_fixed_portrait_slots_keep_text_full_width_and_follow_line_slot() {
    gbs::MetaSprite portrait_sprite { nullptr, 0 };
    const gbs::DialoguePortraitEntry entries[] = {
        { "guide.png", &portrait_sprite }
    };
    gbs::configure_dialogue_portraits(entries, 1);
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, true, false, true });

    gbs::DialogueLine line { "Ola", "Guide", "guide.png", "intro" };
    line.portrait_slot = "right";
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    assert(gbs::show_dialogue(state, &line, 1, 0));
    assert(gbs::dialogue_portrait_position_pixels(state).x == 208);
    assert(gbs::dialogue_portrait_position_pixels(state).y == 88);

    char display_buffer[128] = {};
    gbs::format_dialogue_display_text(state, display_buffer, sizeof(display_buffer));
    assert(strncmp(display_buffer, "Guide:\nOla", 10) == 0);

    gbs::configure_dialogue_portraits(nullptr, 0);
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_dialogue_fixed_frame_fits_portrait_and_name() {
    const gbs::MetaSpritePart part { 0, 0, 0, 0, false, false, 32, 32 };
    const gbs::MetaSprite sprite { &part, 1 };
    const gbs::DialoguePortraitEntry entries[] = {{ "portrait.png", &sprite }};
    gbs::configure_dialogue_portraits(entries, 1);
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, true, false, true, true });
    gbs::DialogueLine line { "Ola", "Nara", "portrait.png", "intro" };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    assert(gbs::show_dialogue(state, &line, 1, 0));
    reset_draw_calls();
    gbs::draw_dialogue(state);
    assert(draw_calls[1].width == 4);
    assert(draw_calls[1].height == 4);
    assert(draw_calls[1].x == 1 && draw_calls[1].y == 10);
    assert(draw_calls[2].x == 5);
    const gbs::Vec2i left = gbs::dialogue_portrait_position_pixels(state);
    assert(left.x == 8 && left.y == 80);
    state.portrait_slot = "right";
    reset_draw_calls();
    gbs::draw_dialogue(state);
    assert(draw_calls[1].x == 25 && draw_calls[1].y == 10);
    const gbs::Vec2i right = gbs::dialogue_portrait_position_pixels(state);
    assert(right.x == 200 && right.y == 80);
    assert(draw_calls[2].x + draw_calls[2].width == draw_calls[1].x);
    const gbs::DialogueBoxLayout portrait48 = gbs::dialogue_portrait_slot_layout_for_frame(0, true, 48, 48);
    const gbs::DialogueBoxLayout guardian48 = gbs::dialogue_name_label_layout_for_frame(0, 9, true, true, true, 48, 48);
    assert(portrait48.w == 6 && portrait48.h == 6);
    assert(guardian48.x == 14 && guardian48.w == 9);
    assert(guardian48.x + guardian48.w == portrait48.x);
    assert(guardian48.y + guardian48.h == portrait48.y + portrait48.h);
    gbs::configure_dialogue_portraits(nullptr, 0);
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_dialogue_missing_portrait_does_not_reserve_slot_and_aligns_name() {
    gbs::MetaSprite portrait_sprite { nullptr, 0 };
    const gbs::DialoguePortraitEntry entries[] = {
        { "guide.png", &portrait_sprite }
    };
    gbs::configure_dialogue_portraits(entries, 1);
    gbs::configure_dialogue_ui(gbs::DialogueUiConfig { 0, 28, 3, true, true, true, true, true });
    const gbs::DialogueLine line[] = {
        { "Ola mundo", "Guia", "missing.png" }
    };
    gbs::DialogueState state;
    gbs::init_dialogue(state);
    assert(gbs::show_dialogue(state, line, 1, 0));
    assert(!gbs::dialogue_should_show_portrait(state));
    const gbs::DialogueBoxLayout name_layout = gbs::dialogue_name_label_layout_for_frame(0, 6, true, true, false);
    assert(name_layout.x == 23);
    assert(name_layout.y == 11);

    reset_draw_calls();
    gbs::draw_dialogue(state);
    assert(draw_call_count == 3);
    assert(draw_calls[1].x == 23);
    assert(draw_calls[1].y == 11);
    assert(draw_calls[1].width == 6);
    assert(draw_calls[1].height == gbs::dialogue_name_label_height);
    assert(std::strcmp(draw_calls[1].text, "Guia") == 0);
    assert(draw_calls[2].x == 1);
    assert(draw_calls[2].y == 14);
    assert(draw_calls[2].width == 28);
    assert(draw_calls[2].height == 5);

    gbs::configure_dialogue_portraits(nullptr, 0);
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
}

void test_dialogue_box_skin_configure_and_clear() {
    assert(gbs::active_dialogue_box_skin() == nullptr);

    static const uint8_t tiles[9 * 32] = { 0 };
    static const uint16_t palette[16] = { 0 };
    const gbs::DialogueBoxSkin skin { tiles, palette };

    gbs::configure_dialogue_box_skin(&skin);
    assert(gbs::active_dialogue_box_skin() == &skin);

    gbs::configure_dialogue_box_skin(nullptr);
    assert(gbs::active_dialogue_box_skin() == nullptr);
}

void test_hud_box_skin_configure_and_clear() {
    assert(gbs::active_hud_box_skin() == nullptr);
    static const uint8_t tiles[9 * 32] = {};
    static const uint16_t palette[16] = {};
    const gbs::DialogueBoxSkin skin { tiles, palette };

    gbs::configure_hud_box_skin(&skin);
    assert(gbs::active_hud_box_skin() == &skin);

    gbs::configure_hud_box_skin(nullptr);
    assert(gbs::active_hud_box_skin() == nullptr);
}

void test_hud_box_configure_and_clear() {
    assert(gbs::active_hud_box_config().width == 32);
    const gbs::HudBoxConfig config { 1, 17, 30, 3 };
    gbs::configure_hud_box(config);
    assert(gbs::active_hud_box_config().x == 1);
    assert(gbs::active_hud_box_config().y == 17);
    assert(gbs::active_hud_box_config().width == 30);
    assert(gbs::active_hud_box_config().height == 3);
}

void test_dialogue_font_configure_and_clear() {
    assert(gbs::active_dialogue_font() == nullptr);

    static const uint8_t tiles[gbs::dialogue_font_tile_count * 32] = { 0 };
    const gbs::DialogueFont font { tiles };

    gbs::configure_dialogue_font(&font);
    assert(gbs::active_dialogue_font() == &font);

    gbs::configure_dialogue_font(nullptr);
    assert(gbs::active_dialogue_font() == nullptr);
}

void test_dialogue_choice_selector_configure_and_clear() {
    assert(gbs::active_dialogue_choice_selector() == nullptr);

    static const uint8_t tile[32] = { 0 };
    const gbs::DialogueChoiceSelector selector { tile };

    gbs::configure_dialogue_choice_selector(&selector);
    assert(gbs::active_dialogue_choice_selector() == &selector);

    gbs::configure_dialogue_choice_selector(nullptr);
    assert(gbs::active_dialogue_choice_selector() == nullptr);
}

} // namespace

void test_checkpoint_restores_dialogue_page_and_reveal_progress() {
    gbs::configure_dialogue_ui(gbs::default_dialogue_ui_config());
    const gbs::DialogueLine lines[] = {{"UMA LINHA DE TESTE PARA RETOMAR O TEXTO."}};
    gbs::DialogueState original {};
    gbs::show_dialogue(original, lines, 1, 0);
    gbs::set_dialogue_text_speed(original, 2);
    for (int frame = 0; frame < 12; ++frame) gbs::update_dialogue(original);
    const auto saved = gbs::capture_checkpoint_dialogue(original);
    gbs::DialogueState loaded {};
    assert(gbs::restore_checkpoint_dialogue(saved, loaded, lines, 1));
    assert(loaded.visible_char_count == original.visible_char_count);
    assert(std::strcmp(loaded.visible_text, original.visible_text) == 0);
    assert(loaded.text_speed_frames == original.text_speed_frames);
    auto invalid = saved;
    invalid.page_index = 100;
    assert(!gbs::restore_checkpoint_dialogue(invalid, loaded, lines, 1));
}

int main() {
    test_checkpoint_restores_dialogue_page_and_reveal_progress();
    test_show_dialogue_selects_line();
    test_show_dialogue_preserves_speaker_and_portrait();
    test_show_dialogue_copies_confirm_sound_indices();
    test_show_dialogue_rejects_bad_index();
    test_show_dialogue_selects_configured_locale_with_default_fallback();
    test_choice_dialogue_renders_configured_locale();
    test_advance_hides_on_button_press();
    test_dialogue_text_speed_reveals_page_over_updates();
    test_utf8_dialogue_reveals_whole_accented_characters();
    test_localized_choice_keeps_accented_line_and_choice_text();
    test_dialogue_marks_revealed_character_for_text_sfx();
    test_dialogue_frame_can_be_changed_before_showing_text();
    test_dialogue_box_layout_matches_export_frame_positions();
    test_dialogue_name_label_layout_attaches_to_each_frame();
    test_dialogue_separate_portrait_and_name_boxes_do_not_overlap();
    test_battle_dialogue_layout_splits_the_lower_ui_band();
    test_dialogue_display_text_includes_speaker_when_enabled();
    test_dialogue_name_label_mode_draws_speaker_above_box();
    test_dialogue_separate_portrait_box_uses_dialogue_skin_frame();
    test_configure_dialogue_ui_wrap_columns();
    test_word_wrap_pagination_and_typewriter_preserve_accented_words();
    test_dialogue_emote_lookup_and_position();
    test_dialogue_portrait_lookup_and_position();
    test_dialogue_choices_keep_portrait_text_inside_box();
    test_dialogue_fixed_frame_fits_portrait_and_name();
    test_dialogue_fixed_portrait_slots_keep_text_full_width_and_follow_line_slot();
    test_dialogue_missing_portrait_does_not_reserve_slot_and_aligns_name();
    test_dialogue_box_skin_configure_and_clear();
    test_hud_box_skin_configure_and_clear();
    test_hud_box_configure_and_clear();
    test_dialogue_font_configure_and_clear();
    test_dialogue_choice_selector_configure_and_clear();
    test_advance_completes_text_speed_page_before_closing();
    test_advance_pages_before_closing();
    test_advance_pages_by_wrapped_columns();
    test_choice_dialogue_selects_value();
    test_battle_choices_fit_the_narrow_panel_after_changing_frame();
    test_choice_dialogue_scrolls_beyond_visible_options();
    test_choice_dialogue_outputs_optional_script();
    test_choice_dialogue_cancel_has_no_value();
    return 0;
}
