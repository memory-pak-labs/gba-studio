#include "gbs/dialogue.hpp"

#include <string.h>
#include "gbs_hw.h"
#include "gbs/text.h"

namespace gbs {

DialogueUiConfig active_dialogue_ui = default_dialogue_ui_config();
const DialoguePortraitEntry* active_portrait_entries = nullptr;
size_t active_portrait_entry_count = 0;
const DialogueEmoteEntry* active_emote_entries = nullptr;
size_t active_emote_entry_count = 0;
const DialogueBoxSkin* active_box_skin = nullptr;
const DialogueBoxSkin* active_hud_skin = nullptr;
HudBoxConfig active_hud_config = default_hud_box_config();
const DialogueFont* active_font = nullptr;
const DialogueChoiceSelector* active_choice_selector = nullptr;

namespace {

bool string_equals(const char* left, const char* right) {
    if (left == nullptr || right == nullptr) {
        return false;
    }
    while (*left != '\0' && *right != '\0') {
        if (*left != *right) {
            return false;
        }
        ++left;
        ++right;
    }
    return *left == '\0' && *right == '\0';
}

char choice_page_buffer[dialogue_page_buffer_capacity];
constexpr int dialogue_box_text_columns = 26;

struct DialoguePortraitDimensions {
    int width;
    int height;
};

DialoguePortraitDimensions dialogue_portrait_dimensions(const DialogueState& state) {
    DialoguePortraitDimensions dimensions { 24, 24 };
    const MetaSprite* portrait = dialogue_portrait_metasprite(state.portrait);
    if (portrait == nullptr || !is_valid_metasprite(*portrait)) {
        return dimensions;
    }

    int max_right = 0;
    int max_bottom = 0;
    for (uint8_t part_index = 0; part_index < portrait->part_count; ++part_index) {
        const MetaSpritePart& part = portrait->parts[part_index];
        const int right = static_cast<int>(part.x) + static_cast<int>(part.width);
        const int bottom = static_cast<int>(part.y) + static_cast<int>(part.height);
        if (right > max_right) max_right = right;
        if (bottom > max_bottom) max_bottom = bottom;
    }
    if (max_right > 0) dimensions.width = max_right;
    if (max_bottom > 0) dimensions.height = max_bottom;
    return dimensions;
}

int dialogue_wrap_columns(const DialogueState& state) {
    const int portrait_columns = dialogue_should_show_portrait(state) && !active_dialogue_ui.fixed_portrait_slots
        ? (dialogue_portrait_dimensions(state).width + 7) / 8
        : 0;
    int box_columns = active_dialogue_ui.wrap_columns < dialogue_box_text_columns
        ? active_dialogue_ui.wrap_columns
        : dialogue_box_text_columns;
    if (state.frame_index == dialogue_frame_battle_prompt || state.frame_index == dialogue_frame_battle_menu) {
        const int inner_columns = dialogue_box_layout_for_frame(state.frame_index).w - 2;
        if (box_columns > inner_columns) box_columns = inner_columns;
    }
    const int available_columns = box_columns - portrait_columns;
    return available_columns < 8 ? 8 : available_columns;
}

const char* translated_dialogue_text(const DialogueLine& line) {
    const char* requested_locale = active_dialogue_locale();
    if (requested_locale != nullptr && line.source_locale != nullptr && strcmp(requested_locale, line.source_locale) == 0) {
        return line.text;
    }
    if (requested_locale != nullptr && line.translations != nullptr) {
        for (size_t index = 0; index < line.translation_count; ++index) {
            const DialogueTranslation& translation = line.translations[index];
            if (translation.locale != nullptr && translation.text != nullptr && strcmp(requested_locale, translation.locale) == 0) {
                return translation.text;
            }
        }
    }
    if (line.default_locale != nullptr && line.source_locale != nullptr && strcmp(line.default_locale, line.source_locale) == 0) {
        return line.text;
    }
    if (line.default_locale != nullptr && line.translations != nullptr) {
        for (size_t index = 0; index < line.translation_count; ++index) {
            const DialogueTranslation& translation = line.translations[index];
            if (translation.locale != nullptr && translation.text != nullptr && strcmp(line.default_locale, translation.locale) == 0) {
                return translation.text;
            }
        }
    }
    return line.text;
}

const char* translated_choice_text(const DialogueChoice& choice) {
    const char* requested_locale = active_dialogue_locale();
    if (requested_locale != nullptr && choice.source_locale != nullptr && strcmp(requested_locale, choice.source_locale) == 0) {
        return choice.text;
    }
    if (requested_locale != nullptr && choice.translations != nullptr) {
        for (size_t index = 0; index < choice.translation_count; ++index) {
            const DialogueTranslation& translation = choice.translations[index];
            if (translation.locale != nullptr && translation.text != nullptr && strcmp(requested_locale, translation.locale) == 0) {
                return translation.text;
            }
        }
    }
    if (choice.default_locale != nullptr && choice.source_locale != nullptr && strcmp(choice.default_locale, choice.source_locale) == 0) {
        return choice.text;
    }
    if (choice.default_locale != nullptr && choice.translations != nullptr) {
        for (size_t index = 0; index < choice.translation_count; ++index) {
            const DialogueTranslation& translation = choice.translations[index];
            if (translation.locale != nullptr && translation.text != nullptr && strcmp(choice.default_locale, translation.locale) == 0) {
                return translation.text;
            }
        }
    }
    return choice.text;
}

int dialogue_wrap_rows() {
    return active_dialogue_ui.wrap_lines;
}

const char* next_dialogue_page(const DialogueState& state, const char* text) {
    if (text == nullptr) {
        return nullptr;
    }

    const char* cursor = text;
    for (int row = 0; row < dialogue_wrap_rows() && *cursor; ++row) {
        cursor = gbs_text_wrap_line(cursor, dialogue_wrap_columns(state)).next;
    }
    if (*cursor) return cursor;

    return nullptr;
}

int dialogue_page_char_count(const DialogueState& state, const char* page_text) {
    if (page_text == nullptr) {
        return 0;
    }

    const char* next_page = next_dialogue_page(state, page_text);
    const char* cursor = page_text;
    int count = 0;
    while (*cursor != '\0' && cursor != next_page && count < static_cast<int>(dialogue_page_character_capacity) - 1) {
        ++count;
        gbs_text_next_codepoint(&cursor);
    }
    return count;
}

void rebuild_visible_text(DialogueState& state, int visible_count) {
    state.visible_char_count = gbs::clamp_int(visible_count, 0, state.page_char_count);
    if (state.page_text == nullptr || state.visible_char_count <= 0) {
        state.visible_text[0] = '\0';
    } else {
        const char* source = state.page_text;
        char* destination = state.visible_text;
        char* end = state.visible_text + dialogue_page_buffer_capacity - 1;
        int count = 0;
        while (*source != '\0' && count < state.visible_char_count) {
            const char* character_start = source;
            gbs_text_next_codepoint(&source);
            const size_t bytes = static_cast<size_t>(source - character_start);
            if (destination + bytes > end) break;
            memcpy(destination, character_start, bytes);
            destination += bytes;
            ++count;
        }
        *destination = '\0';
    }
    state.page_complete = state.visible_char_count >= state.page_char_count;
}

void set_dialogue_page(DialogueState& state, const char* page_text) {
    state.page_text = page_text;
    state.has_next_page = next_dialogue_page(state, page_text) != nullptr;
    state.page_char_count = dialogue_page_char_count(state, page_text);
    state.reveal_frame_counter = 0;
    rebuild_visible_text(state, state.text_speed_frames <= 0 ? state.page_char_count : 0);
}

void append_char(char*& out, char* end, char value) {
    if (out < end) {
        *out = value;
        ++out;
    }
}

void append_limited_text(char*& out, char* end, const char* text, int max_chars) {
    if (text == nullptr) {
        return;
    }
    int count = 0;
    while (*text != '\0' && *text != '\n' && count < max_chars) {
        const char* character_start = text;
        gbs_text_next_codepoint(&text);
        const size_t bytes = static_cast<size_t>(text - character_start);
        if (out + bytes > end) {
            break;
        }
        memcpy(out, character_start, bytes);
        out += bytes;
        ++count;
    }
}

void append_dialogue_text(
    char*& out, char* end, const char* text, int content_columns, int left_margin,
    int visible_chars = 0x7fffffff
) {
    if (text == nullptr) return;
    const char* visible_end = text;
    while (*visible_end && visible_chars-- > 0) gbs_text_next_codepoint(&visible_end);
    while (*text && text < visible_end) {
        const GbsTextLine line = gbs_text_wrap_line(text, content_columns);
        for (int i = 0; i < left_margin; ++i) append_char(out, end, ' ');
        while (text < line.end && text < visible_end) {
            const char* start = text;
            gbs_text_next_codepoint(&text);
            size_t bytes = static_cast<size_t>(text - start);
            if (out + bytes > end) return;
            memcpy(out, start, bytes);
            out += bytes;
        }
        text = line.next;
        if (*text && text < visible_end) append_char(out, end, '\n');
    }
}

void rebuild_choice_page(DialogueState& state) {
    char* out = choice_page_buffer;
    char* end = choice_page_buffer + sizeof(choice_page_buffer) - 1;
    append_dialogue_text(out, end, state.text, dialogue_wrap_columns(state), 0);

    size_t first_choice = 0;
    if (state.selected_choice >= static_cast<int>(dialogue_max_visible_choices)) {
        first_choice = static_cast<size_t>(state.selected_choice + 1) - dialogue_max_visible_choices;
    }

    size_t remaining_count = state.choice_count > first_choice ? state.choice_count - first_choice : 0;
    size_t visible_count = remaining_count < dialogue_max_visible_choices
        ? remaining_count
        : dialogue_max_visible_choices;
    for (size_t index = 0; index < visible_count; ++index) {
        size_t choice_index = first_choice + index;
        append_char(out, end, '\n');
        append_char(out, end, static_cast<int>(choice_index) == state.selected_choice ? '!' : '-');
        append_char(out, end, ' ');
        append_limited_text(out, end, translated_choice_text(state.choices[choice_index]), dialogue_wrap_columns(state) - 2);
    }

    *out = '\0';
    state.page_text = choice_page_buffer;
    state.has_next_page = state.choice_count > first_choice + visible_count;
    state.page_char_count = dialogue_page_char_count(state, choice_page_buffer);
    state.reveal_frame_counter = 0;
    rebuild_visible_text(state, state.page_char_count);
}

} // namespace

void configure_dialogue_ui(const DialogueUiConfig& config) {
    const int frame_index = config.frame_index < 0 ? 0 : config.frame_index;
    int wrap_columns = config.wrap_columns;
    int wrap_lines = config.wrap_lines;
    if (wrap_columns < 8) {
        wrap_columns = 8;
    } else if (wrap_columns > dialogue_wrap_columns_max) {
        wrap_columns = dialogue_wrap_columns_max;
    }
    if (wrap_lines < 1) {
        wrap_lines = 1;
    } else if (wrap_lines > dialogue_wrap_rows_max) {
        wrap_lines = dialogue_wrap_rows_max;
    }
    const int box_width_tiles = clamp_int(
        config.box_width_tiles,
        dialogue_box_tiles_min,
        dialogue_box_width_tiles_max
    );
    const int box_height_tiles = clamp_int(
        config.box_height_tiles,
        dialogue_box_tiles_min,
        dialogue_box_height_tiles_max
    );
    active_dialogue_ui.frame_index = frame_index;
    active_dialogue_ui.wrap_columns = wrap_columns;
    active_dialogue_ui.wrap_lines = wrap_lines;
    active_dialogue_ui.show_portrait = config.show_portrait;
    active_dialogue_ui.show_character_name = config.show_character_name;
    active_dialogue_ui.portrait_on_right = config.portrait_on_right;
    active_dialogue_ui.fixed_portrait_slots = config.fixed_portrait_slots;
    active_dialogue_ui.name_label_above = config.name_label_above;
    active_dialogue_ui.box_width_tiles = box_width_tiles;
    active_dialogue_ui.box_height_tiles = box_height_tiles;
}

const DialogueUiConfig& active_dialogue_ui_config() {
    return active_dialogue_ui;
}

void configure_dialogue_portraits(const DialoguePortraitEntry* entries, size_t count) {
    active_portrait_entries = entries;
    active_portrait_entry_count = count;
}

void configure_dialogue_box_skin(const DialogueBoxSkin* skin) {
    active_box_skin = skin;
    gbs_hw_configure_dialogue_box_skin(
        skin != nullptr ? skin->tiles : nullptr,
        skin != nullptr ? skin->palette : nullptr
    );
}

const DialogueBoxSkin* active_dialogue_box_skin() {
    return active_box_skin;
}

void configure_hud_box_skin(const DialogueBoxSkin* skin) {
    active_hud_skin = skin;
    gbs_hw_configure_hud_box_skin(
        skin != nullptr ? skin->tiles : nullptr,
        skin != nullptr ? skin->palette : nullptr
    );
}

const DialogueBoxSkin* active_hud_box_skin() {
    return active_hud_skin;
}

void configure_hud_box(const HudBoxConfig& config) {
    active_hud_config = config;
    gbs_hw_configure_hud_box(config.x, config.y, config.width, config.height);
}

const HudBoxConfig& active_hud_box_config() {
    return active_hud_config;
}

void configure_dialogue_font(const DialogueFont* font) {
    active_font = font;
    gbs_hw_configure_dialogue_font(font != nullptr ? font->tiles : nullptr);
    if (active_choice_selector != nullptr) {
        gbs_hw_configure_dialogue_choice_selector(active_choice_selector->tile);
    }
}

const DialogueFont* active_dialogue_font() {
    return active_font;
}

void configure_dialogue_choice_selector(const DialogueChoiceSelector* selector) {
    active_choice_selector = selector;
    if (selector != nullptr) {
        gbs_hw_configure_dialogue_choice_selector(selector->tile);
    } else {
        gbs_hw_configure_dialogue_choice_selector(nullptr);
        gbs_hw_configure_dialogue_font(active_font != nullptr ? active_font->tiles : nullptr);
    }
}

const DialogueChoiceSelector* active_dialogue_choice_selector() {
    return active_choice_selector;
}

const MetaSprite* dialogue_portrait_metasprite(const char* portrait_name) {
    if (portrait_name == nullptr || portrait_name[0] == '\0' || active_portrait_entries == nullptr) {
        return nullptr;
    }
    for (size_t index = 0; index < active_portrait_entry_count; ++index) {
        if (string_equals(active_portrait_entries[index].name, portrait_name)) {
            return active_portrait_entries[index].metasprite;
        }
    }
    return nullptr;
}

bool dialogue_should_show_portrait(const DialogueState& state) {
    return state.visible &&
        active_dialogue_ui.show_portrait &&
        state.portrait != nullptr &&
        state.portrait[0] != '\0' &&
        dialogue_portrait_metasprite(state.portrait) != nullptr;
}

Vec2i dialogue_portrait_position_pixels(const DialogueState& state) {
    const DialoguePortraitDimensions dimensions = dialogue_portrait_dimensions(state);
    bool portrait_on_right = active_dialogue_ui.portrait_on_right;
    if (state.portrait_slot != nullptr && state.portrait_slot[0] != '\0') {
        portrait_on_right = string_equals(state.portrait_slot, "right")
            || string_equals(state.portrait_slot, "direita");
    }
    if (active_dialogue_ui.fixed_portrait_slots) {
        const DialogueBoxLayout slot = dialogue_portrait_slot_layout_for_frame(
            state.frame_index, portrait_on_right, dimensions.width, dimensions.height);
        const int slot_x = slot.x * 8;
        const int slot_y = slot.y * 8;
        const int slot_width = slot.w * 8;
        const int slot_height = slot.h * 8;
        const int centered_x = (slot_width - dimensions.width) / 2;
        const int centered_y = (slot_height - dimensions.height) / 2;
        return Vec2i {
            slot_x + (centered_x > 0 ? centered_x : 0),
            slot_y + (centered_y > 0 ? centered_y : 0)
        };
    }
    const DialogueBoxLayout layout = dialogue_box_layout_for_frame(state.frame_index);
    const int box_x = layout.x * 8;
    const int box_y = layout.y * 8;
    const int box_w = layout.w * 8;
    const int portrait_y = box_y + layout.h * 8 - dimensions.height;
    if (portrait_on_right) {
        return Vec2i { box_x + box_w - dimensions.width, portrait_y };
    }
    return Vec2i { box_x + 8, portrait_y };
}

void configure_dialogue_emotes(const DialogueEmoteEntry* entries, size_t count) {
    active_emote_entries = entries;
    active_emote_entry_count = count;
}

const MetaSprite* dialogue_emote_metasprite(const char* emote_name) {
    if (emote_name == nullptr || emote_name[0] == '\0' || active_emote_entries == nullptr) {
        return nullptr;
    }
    for (size_t index = 0; index < active_emote_entry_count; ++index) {
        if (string_equals(active_emote_entries[index].name, emote_name)) {
            return active_emote_entries[index].metasprite;
        }
    }
    return nullptr;
}

bool dialogue_should_show_emote(const DialogueState& state) {
    return state.visible &&
        state.emote != nullptr &&
        state.emote[0] != '\0' &&
        dialogue_emote_metasprite(state.emote) != nullptr;
}

Vec2i dialogue_emote_position_pixels(Vec2i actor_screen_position) {
    return Vec2i { actor_screen_position.x, actor_screen_position.y - 16 };
}

void init_dialogue(DialogueState& state) {
    state.visible = false;
    state.line_index = -1;
    state.text = nullptr;
    state.speaker = nullptr;
    state.portrait = nullptr;
    state.portrait_slot = nullptr;
    state.emote = nullptr;
    state.key = nullptr;
    state.page_text = nullptr;
    state.visible_text[0] = '\0';
    state.page_index = 0;
    state.has_next_page = false;
    state.text_speed_frames = 0;
    state.reveal_frame_counter = 0;
    state.visible_char_count = 0;
    state.page_char_count = 0;
    state.page_complete = true;
    state.text_sfx_index = -1;
    state.confirm_sfx_index = -1;
    state.confirm_pcm_index = -1;
    state.revealed_char_this_frame = false;
    state.frame_index = active_dialogue_ui.frame_index;
    state.choices = nullptr;
    state.choice_count = 0;
    state.selected_choice = 0;
    state.last_choice_value = -1;
    state.last_choice_index = -1;
    state.last_choice_script = -1;
    state.choice_mode = false;
}

bool show_dialogue(DialogueState& state, const DialogueLine* lines, size_t line_count, int line_index) {
    if (lines == nullptr || line_index < 0 || static_cast<size_t>(line_index) >= line_count || lines[line_index].text == nullptr) {
        return false;
    }

    state.visible = true;
    state.line_index = line_index;
    state.text = translated_dialogue_text(lines[line_index]);
    state.speaker = lines[line_index].speaker;
    state.portrait = lines[line_index].portrait;
    state.portrait_slot = lines[line_index].portrait_slot;
    state.emote = lines[line_index].emote;
    state.key = lines[line_index].key;
    state.actor_id = lines[line_index].actor_id;
    state.confirm_sfx_index = lines[line_index].confirm_sfx;
    state.confirm_pcm_index = lines[line_index].confirm_pcm;
    state.page_index = 0;
    state.choices = nullptr;
    state.choice_count = 0;
    state.selected_choice = 0;
    state.last_choice_value = -1;
    state.last_choice_index = -1;
    state.last_choice_script = -1;
    state.choice_mode = false;
    set_dialogue_page(state, state.text);
    return true;
}

bool show_dialogue_choices(
    DialogueState& state,
    const DialogueLine* lines,
    size_t line_count,
    int line_index,
    const DialogueChoice* choices,
    size_t choice_count
) {
    if (choices == nullptr || choice_count == 0) {
        return show_dialogue(state, lines, line_count, line_index);
    }
    if (lines == nullptr || line_index < 0 || static_cast<size_t>(line_index) >= line_count || lines[line_index].text == nullptr) {
        return false;
    }

    state.visible = true;
    state.line_index = line_index;
    state.text = translated_dialogue_text(lines[line_index]);
    state.speaker = lines[line_index].speaker;
    state.portrait = lines[line_index].portrait;
    state.portrait_slot = lines[line_index].portrait_slot;
    state.emote = lines[line_index].emote;
    state.key = lines[line_index].key;
    state.confirm_sfx_index = lines[line_index].confirm_sfx;
    state.confirm_pcm_index = lines[line_index].confirm_pcm;
    state.page_index = 0;
    state.choices = choices;
    state.choice_count = choice_count;
    state.selected_choice = 0;
    state.last_choice_value = -1;
    state.last_choice_index = -1;
    state.last_choice_script = -1;
    state.choice_mode = true;
    rebuild_choice_page(state);
    return true;
}

void hide_dialogue(DialogueState& state) {
    state.visible = false;
    state.line_index = -1;
    state.text = nullptr;
    state.speaker = nullptr;
    state.portrait = nullptr;
    state.portrait_slot = nullptr;
    state.emote = nullptr;
    state.key = nullptr;
    state.page_text = nullptr;
    state.visible_text[0] = '\0';
    state.page_index = 0;
    state.has_next_page = false;
    state.reveal_frame_counter = 0;
    state.visible_char_count = 0;
    state.page_char_count = 0;
    state.page_complete = true;
    state.revealed_char_this_frame = false;
    state.choices = nullptr;
    state.choice_count = 0;
    state.selected_choice = 0;
    state.choice_mode = false;
}

void set_dialogue_frame(DialogueState& state, int frame_index) {
    const int next_frame = frame_index < 0 ? 0 : frame_index;
    if (state.frame_index == next_frame) return;
    state.frame_index = next_frame;
    if (state.visible && state.choice_mode) {
        rebuild_choice_page(state);
    } else if (state.visible && state.page_text != nullptr) {
        set_dialogue_page(state, state.page_text);
    }
}

void set_dialogue_text_sfx(DialogueState& state, int sfx_index) {
    state.text_sfx_index = sfx_index;
}

void set_dialogue_text_speed(DialogueState& state, int frames) {
    state.text_speed_frames = gbs::clamp_int(frames, 0, 10);
    if (state.visible && !state.choice_mode && state.page_text != nullptr) {
        set_dialogue_page(state, state.page_text);
    }
}

DialogueBoxLayout dialogue_box_layout_for_frame(int frame_index) {
    DialogueBoxLayout layout {
        1,
        20 - 1 - active_dialogue_ui.box_height_tiles,
        active_dialogue_ui.box_width_tiles,
        active_dialogue_ui.box_height_tiles
    };
    if (frame_index == dialogue_frame_top) {
        layout.y = 0;
    } else if (frame_index == dialogue_frame_center) {
        layout.y = (20 - layout.h) / 2;
    } else if (frame_index == dialogue_frame_battle_prompt) {
        layout.y = 15;
        layout.w = 18;
        layout.h = 5;
    } else if (frame_index == dialogue_frame_battle_menu) {
        /* Keep the right battle panel inside the visible 240px framebuffer:
         * x=19 plus 11 tiles ends exactly at column 30 (240px). */
        layout.x = 19;
        layout.y = 15;
        layout.w = 11;
        layout.h = 5;
    }
    return layout;
}

DialogueBoxLayout dialogue_portrait_slot_layout_for_frame(int frame_index, bool portrait_on_right, int portrait_width, int portrait_height) {
    const int width = portrait_width > 0 ? (portrait_width < 24 ? 3 : (portrait_width + 7) / 8) : 8;
    const int height = portrait_height > 0 ? (portrait_height < 24 ? 3 : (portrait_height + 7) / 8) : 8;
    DialogueBoxLayout layout {
        portrait_on_right ? 29 - width : 1,
        dialogue_portrait_slot_y_pixels / 8,
        width,
        height
    };
    if (frame_index == dialogue_frame_top) {
        layout.y = 9;
    } else if (frame_index == dialogue_frame_center) {
        /* The center frame leaves 56px above the dialogue box. Keep the
         * portrait frame inside that band so it cannot touch the box below. */
        layout.y = 0;
        if (layout.h > 7) layout.h = 7;
    } else if (frame_index == dialogue_frame_default) {
        const DialogueBoxLayout box = dialogue_box_layout_for_frame(frame_index);
        layout.y = box.y - layout.h;
        if (layout.y < 0) layout.y = 0;
    }
    return layout;
}

DialogueBoxLayout dialogue_name_label_layout_for_frame(
    int frame_index,
    int label_width,
    bool avoid_portrait_slots,
    bool portrait_on_right,
    bool portrait_visible,
    int portrait_width,
    int portrait_height
) {
    const DialogueBoxLayout box = dialogue_box_layout_for_frame(frame_index);
    int x = box.x;
    int available_width = box.w;
    if (avoid_portrait_slots && portrait_visible && frame_index == dialogue_frame_default) {
        const DialogueBoxLayout portrait = dialogue_portrait_slot_layout_for_frame(
            frame_index, portrait_on_right, portrait_width, portrait_height);
        if (!portrait_on_right && portrait.x == box.x) {
            x = portrait.x + portrait.w;
            available_width = box.x + box.w - x;
        } else if (portrait_on_right && portrait.x > box.x) {
            available_width = portrait.x - box.x;
        }
    }
    if (available_width < 3) {
        x = box.x;
        available_width = box.w;
    }
    const int width = label_width < 3
        ? 3
        : (label_width > available_width ? available_width : label_width);
    if (portrait_on_right && (!portrait_visible ||
        (avoid_portrait_slots && frame_index == dialogue_frame_default))) {
        x = box.x + available_width - width;
    }
    int y = box.y - dialogue_name_label_height;
    if (avoid_portrait_slots && portrait_visible && frame_index == dialogue_frame_center) {
        /* The portrait frame occupies the upper band in the center layout;
         * move the name plate below the dialogue box instead. */
        y = box.y + box.h;
    }
    if (y < 0) {
        y = box.y + box.h;
    }
    if (y + dialogue_name_label_height > 32) {
        y = box.y;
    }
    if (x + width > 32) {
        x = 32 - width;
    }
    return DialogueBoxLayout { x, y, width, dialogue_name_label_height };
}

int dialogue_name_label_width(const char* speaker, const DialogueBoxLayout& box) {
    if (speaker == nullptr || speaker[0] == '\0') {
        return 3;
    }
    const int max_characters = box.w > 2 ? box.w - 2 : 1;
    int characters = 0;
    const char* cursor = speaker;
    while (*cursor != '\0' && characters < max_characters) {
        gbs_text_next_codepoint(&cursor);
        ++characters;
    }
    const int width = characters + 2;
    return width < 3 ? 3 : (width > box.w ? box.w : width);
}

void update_dialogue(DialogueState& state) {
    state.revealed_char_this_frame = false;
    if (!state.visible || state.choice_mode || state.page_complete || state.text_speed_frames <= 0) {
        return;
    }

    ++state.reveal_frame_counter;
    if (state.reveal_frame_counter < state.text_speed_frames) {
        return;
    }

    state.reveal_frame_counter = 0;
    rebuild_visible_text(state, state.visible_char_count + 1);
    state.revealed_char_this_frame = true;
}

bool advance_dialogue(DialogueState& state, InputState input) {
    if (!state.visible) {
        return false;
    }

    if (state.choice_mode) {
        if ((input.was_pressed(ButtonUp) || input.was_pressed(ButtonLeft)) && state.selected_choice > 0) {
            --state.selected_choice;
            rebuild_choice_page(state);
            return true;
        }
        if ((input.was_pressed(ButtonDown) || input.was_pressed(ButtonRight)) &&
            static_cast<size_t>(state.selected_choice + 1) < state.choice_count) {
            ++state.selected_choice;
            rebuild_choice_page(state);
            return true;
        }
        if (input.was_pressed(ButtonA) || input.was_pressed(ButtonStart)) {
            const int choice_index = state.selected_choice;
            state.last_choice_value = state.choices[choice_index].result_value;
            state.last_choice_index = choice_index;
            state.last_choice_script = state.choices[choice_index].script_index;
            hide_dialogue(state);
            return true;
        }
        if (input.was_pressed(ButtonB)) {
            state.last_choice_value = -1;
            state.last_choice_index = -1;
            state.last_choice_script = -1;
            hide_dialogue(state);
            return true;
        }
        return false;
    }

    if (input.was_pressed(ButtonA) || input.was_pressed(ButtonB) || input.was_pressed(ButtonStart)) {
        if (!state.page_complete) {
            rebuild_visible_text(state, state.page_char_count);
            return true;
        }

        const char* next_page = next_dialogue_page(state, state.page_text);
        if (next_page != nullptr) {
            ++state.page_index;
            set_dialogue_page(state, next_page);
            return true;
        }
        hide_dialogue(state);
        return true;
    }

    return false;
}

size_t format_dialogue_display_text(const DialogueState& state, char* out, size_t capacity) {
    if (out == nullptr || capacity == 0) {
        return 0;
    }

    out[0] = '\0';
    if (!state.visible) {
        return 0;
    }

    char* cursor = out;
    char* end = out + capacity - 1;
    const bool show_portrait = dialogue_should_show_portrait(state);
    const int left_margin = show_portrait && !active_dialogue_ui.fixed_portrait_slots && !active_dialogue_ui.portrait_on_right
        ? (dialogue_portrait_dimensions(state).width + 7) / 8
        : 0;
    const int content_columns = dialogue_wrap_columns(state);
    if (active_dialogue_ui.show_character_name &&
        !active_dialogue_ui.name_label_above &&
        state.speaker != nullptr &&
        state.speaker[0] != '\0') {
        for (int index = 0; index < left_margin; ++index) {
            append_char(cursor, end, ' ');
        }
        append_limited_text(cursor, end, state.speaker, content_columns - 1);
        append_char(cursor, end, ':');
        append_char(cursor, end, '\n');
    }
    append_dialogue_text(cursor, end, state.page_text, content_columns, left_margin, state.visible_char_count);
    *cursor = '\0';
    return static_cast<size_t>(cursor - out);
}

void draw_dialogue(const DialogueState& state) {
    const DialogueBoxLayout layout = dialogue_box_layout_for_frame(state.frame_index);
    const DialoguePortraitDimensions dimensions = dialogue_portrait_dimensions(state);
    bool portrait_on_right = active_dialogue_ui.portrait_on_right;
    if (state.portrait_slot != nullptr && state.portrait_slot[0] != '\0') {
        portrait_on_right = string_equals(state.portrait_slot, "right")
            || string_equals(state.portrait_slot, "direita");
    }
    DialogueBoxLayout label_clear_layout = dialogue_name_label_layout_for_frame(
        state.frame_index,
        layout.w,
        active_dialogue_ui.fixed_portrait_slots,
        portrait_on_right,
        dialogue_should_show_portrait(state),
        dimensions.width,
        dimensions.height
    );
    label_clear_layout.x = layout.x;
    label_clear_layout.w = layout.w;
    gbs_hw_draw_text_box(
        label_clear_layout.x,
        label_clear_layout.y,
        label_clear_layout.w,
        label_clear_layout.h,
        nullptr,
        0
    );
    const bool portrait_visible = dialogue_should_show_portrait(state);
    if (active_dialogue_ui.fixed_portrait_slots && portrait_visible) {
        const DialogueBoxLayout portrait_box = dialogue_portrait_slot_layout_for_frame(
            state.frame_index, portrait_on_right, dimensions.width, dimensions.height);
        gbs_hw_draw_text_box(
            portrait_box.x,
            portrait_box.y,
            portrait_box.w,
            portrait_box.h,
            portrait_visible ? "" : nullptr,
            portrait_visible ? 1 : 0
        );
    }
    if (active_dialogue_ui.name_label_above &&
        active_dialogue_ui.show_character_name &&
        state.visible &&
        state.speaker != nullptr &&
        state.speaker[0] != '\0') {
        const int label_width = dialogue_name_label_width(state.speaker, layout);
        const DialogueBoxLayout label_layout = dialogue_name_label_layout_for_frame(
            state.frame_index,
            label_width,
            active_dialogue_ui.fixed_portrait_slots,
            portrait_on_right,
            portrait_visible,
            dimensions.width,
            dimensions.height
        );
        char label_buffer[dialogue_page_buffer_capacity];
        char* cursor = label_buffer;
        char* end = label_buffer + sizeof(label_buffer) - 1;
        append_limited_text(cursor, end, state.speaker, label_layout.w - 2);
        *cursor = '\0';
        gbs_hw_draw_text_box(
            label_layout.x,
            label_layout.y,
            label_layout.w,
            label_layout.h,
            label_buffer,
            1
        );
    }
    char display_buffer[dialogue_page_buffer_capacity];
    format_dialogue_display_text(state, display_buffer, sizeof(display_buffer));
    gbs_hw_draw_text_box(
        layout.x,
        layout.y,
        layout.w,
        layout.h,
        display_buffer,
        state.visible ? 1 : 0
    );
}

} // namespace gbs
