#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/assets.hpp"
#include "gbs/hud_behavior.hpp"
#include "gbs/hud_gauge.hpp"
#include "gbs/input.hpp"
#include "gbs/types.hpp"
#include "gbs/text.h"

namespace gbs {

constexpr int dialogue_wrap_columns_default = 28;
constexpr int dialogue_wrap_rows_default = 3;
constexpr int dialogue_wrap_columns_max = 40;
constexpr int dialogue_wrap_rows_max = 6;
constexpr int dialogue_box_width_tiles_default = 28;
constexpr int dialogue_box_height_tiles_default = 5;
constexpr int dialogue_box_width_tiles_max = 29;
constexpr int dialogue_box_height_tiles_max = 16;
constexpr int dialogue_box_tiles_min = 3;
constexpr int dialogue_text_columns = dialogue_wrap_columns_default;
constexpr int dialogue_text_rows = dialogue_wrap_rows_default;
constexpr size_t dialogue_max_visible_choices = 2;
constexpr int dialogue_frame_default = 0;
constexpr int dialogue_frame_top = 1;
constexpr int dialogue_frame_center = 2;
constexpr int dialogue_frame_battle_prompt = 3;
constexpr int dialogue_frame_battle_menu = 4;
constexpr size_t dialogue_font_tile_count = GBS_TEXT_GLYPH_COUNT;
constexpr size_t dialogue_page_character_capacity =
    dialogue_wrap_columns_max * dialogue_wrap_rows_max + dialogue_wrap_rows_max + 1;
constexpr size_t dialogue_page_buffer_capacity = dialogue_page_character_capacity * 4;

struct DialogueUiConfig {
    int frame_index = 0;
    int wrap_columns = dialogue_wrap_columns_default;
    int wrap_lines = dialogue_wrap_rows_default;
    bool show_portrait = true;
    bool show_character_name = true;
    bool portrait_on_right = false;
    bool fixed_portrait_slots = false;
    /** Draw the speaker as a compact name plate attached to the dialogue box. */
    bool name_label_above = false;
    /** Dialogue box dimensions in 8px tiles; one tile remains as bottom margin. */
    int box_width_tiles = dialogue_box_width_tiles_default;
    int box_height_tiles = dialogue_box_height_tiles_default;
};

struct DialoguePortraitEntry {
    const char* name;
    const MetaSprite* metasprite;
};

struct DialogueEmoteEntry {
    const char* name;
    const MetaSprite* metasprite;
};

/**
 * 9-slice skin for the dialogue box background (custom PNG replacing the
 * built-in procedural blank/border tiles). Tiles are 9 entries of 32 bytes
 * each (8x8 px, 4bpp), in raster order over a fixed 3x3 grid:
 * top-left, top-edge, top-right, left-edge, fill, right-edge,
 * bottom-left, bottom-edge, bottom-right. Palette has 16 BG colors.
 */
struct DialogueBoxSkin {
    const uint8_t* tiles;
    const uint16_t* palette;
};

struct HudBoxConfig {
    uint8_t x;
    uint8_t y;
    uint8_t width;
    uint8_t height;
};

enum class HudValueSource : int8_t { None = -1, P1Health, P2Health, RoundTime, P1Rounds, P2Rounds, Score, Lives };
constexpr size_t hud_value_source_count = 7;

/** Author-authored HUD composition exported for the native runtime. Positions
 * and dimensions are expressed in viewport pixels and snapped to 8px tiles. */
struct HudLayoutComponent {
    const char* id;
    const char* kind;
    const char* label;
    const char* text;
    const char* asset;
    int x;
    int y;
    int width;
    int height;
    int z_index;
    bool visible;
    const MetaSprite* metasprite = nullptr;
    HudElementBehavior behavior {};
    HudValueSource value_source = HudValueSource::None;
    HudGauge gauge {};
    const MetaSprite* state_assets[2] = {nullptr,nullptr};
};

struct HudLayout {
    const char* id;
    const char* mode;
    const HudLayoutComponent* components;
    size_t component_count;
};

constexpr HudBoxConfig default_hud_box_config() {
    return { 0, 0, 32, 3 };
}

/** Custom 8x8, 4bpp glyph tiles in the public gbs_text_glyph_index order. */
struct DialogueFont {
    const uint8_t* tiles;
};

/** Custom 8x8 choice marker, already remapped to the active dialogue skin palette. */
struct DialogueChoiceSelector {
    const uint8_t* tile;
};

struct DialogueTranslation {
    const char* locale;
    const char* text;
};

constexpr int dialogue_emote_oam_index = 123;
/* OAM 112-127 is reserved for the dialogue text glyph sprites. */
constexpr int dialogue_portrait_oam_index = 110;
constexpr int dialogue_portrait_slot_width_pixels = 64;
constexpr int dialogue_portrait_slot_height_pixels = 64;
constexpr int dialogue_portrait_slot_y_pixels = 48;
constexpr int dialogue_portrait_left_slot_x_pixels = 8;
constexpr int dialogue_portrait_right_slot_x_pixels = 168;
constexpr int dialogue_name_label_height = 3;

constexpr DialogueUiConfig default_dialogue_ui_config() {
    return DialogueUiConfig {};
}

struct DialogueLine {
    const char* text;
    const char* speaker = nullptr;
    const char* portrait = nullptr;
    const char* emote = nullptr;
    const char* key = nullptr;
    const char* text_sound = nullptr;
    const char* confirm_sound = nullptr;
    int confirm_sfx = -1;
    int confirm_pcm = -1;
    const char* source_locale = nullptr;
    const char* default_locale = nullptr;
    const DialogueTranslation* translations = nullptr;
    size_t translation_count = 0;
    const char* portrait_slot = nullptr;
    const char* actor_id = nullptr;
};

struct DialogueChoice {
    const char* text;
    int result_value;
    int script_index = -1;
    const char* source_locale = nullptr;
    const char* default_locale = nullptr;
    const DialogueTranslation* translations = nullptr;
    size_t translation_count = 0;
};

struct DialogueBoxLayout {
    int x;
    int y;
    int w;
    int h;
};

struct DialogueState {
    bool visible;
    int line_index;
    const char* text;
    const char* speaker;
    const char* portrait;
    const char* portrait_slot;
    const char* emote;
    const char* key;
    const char* actor_id;
    const char* page_text;
    char visible_text[dialogue_page_buffer_capacity];
    int page_index;
    bool has_next_page;
    int text_speed_frames;
    int reveal_frame_counter;
    int visible_char_count;
    int page_char_count;
    bool page_complete;
    int text_sfx_index;
    int confirm_sfx_index;
    int confirm_pcm_index;
    bool revealed_char_this_frame;
    int frame_index;
    const DialogueChoice* choices;
    size_t choice_count;
    int selected_choice;
    int last_choice_value;
    int last_choice_index;
    int last_choice_script;
    bool choice_mode;
};

void configure_dialogue_ui(const DialogueUiConfig& config);
void configure_dialogue_locale(const char* locale);
void configure_dialogue_locale_id(uint8_t locale_id);
const char* active_dialogue_locale();
uint8_t active_dialogue_locale_id();
const DialogueUiConfig& active_dialogue_ui_config();
void configure_dialogue_portraits(const DialoguePortraitEntry* entries, size_t count);
const MetaSprite* dialogue_portrait_metasprite(const char* portrait_name);
bool dialogue_should_show_portrait(const DialogueState& state);
Vec2i dialogue_portrait_position_pixels(const DialogueState& state);
void configure_dialogue_box_skin(const DialogueBoxSkin* skin);
const DialogueBoxSkin* active_dialogue_box_skin();
void configure_hud_box_skin(const DialogueBoxSkin* skin);
const DialogueBoxSkin* active_hud_box_skin();
void configure_hud_box(const HudBoxConfig& config);
const HudBoxConfig& active_hud_box_config();
void configure_hud_layouts(const HudLayout* layouts, size_t count);
bool configure_hud_layout(const char* layout_id);
const HudLayout* active_hud_layout();
void configure_dialogue_font(const DialogueFont* font);
const DialogueFont* active_dialogue_font();
void configure_dialogue_choice_selector(const DialogueChoiceSelector* selector);
const DialogueChoiceSelector* active_dialogue_choice_selector();
void configure_dialogue_emotes(const DialogueEmoteEntry* entries, size_t count);
const MetaSprite* dialogue_emote_metasprite(const char* emote_name);
bool dialogue_should_show_emote(const DialogueState& state);
Vec2i dialogue_emote_position_pixels(Vec2i actor_screen_position);
void init_dialogue(DialogueState& state);
bool show_dialogue(DialogueState& state, const DialogueLine* lines, size_t line_count, int line_index);
bool show_dialogue_choices(
    DialogueState& state,
    const DialogueLine* lines,
    size_t line_count,
    int line_index,
    const DialogueChoice* choices,
    size_t choice_count
);
void hide_dialogue(DialogueState& state);
void set_dialogue_frame(DialogueState& state, int frame_index);
void set_dialogue_text_sfx(DialogueState& state, int sfx_index);
void set_dialogue_text_speed(DialogueState& state, int frames);
DialogueBoxLayout dialogue_box_layout_for_frame(int frame_index);
DialogueBoxLayout dialogue_portrait_slot_layout_for_frame(
    int frame_index, bool portrait_on_right, int portrait_width = 0, int portrait_height = 0
);
DialogueBoxLayout dialogue_name_label_layout_for_frame(
    int frame_index,
    int label_width,
    bool avoid_portrait_slots = false,
    bool portrait_on_right = false,
    bool portrait_visible = true,
    int portrait_width = 0,
    int portrait_height = 0
);
void update_dialogue(DialogueState& state);
bool advance_dialogue(DialogueState& state, InputState input);
size_t format_dialogue_display_text(const DialogueState& state, char* out, size_t capacity);
void draw_dialogue(const DialogueState& state);

} // namespace gbs
