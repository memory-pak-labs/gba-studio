#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/dialogue.hpp"
#include "gbs/input.hpp"

namespace gbs {

constexpr size_t hud_text_slot_capacity = 8;

struct HudState {
    bool visible;
    const char* left_text;
    const char* right_text;
    const char* text_slots[hud_text_slot_capacity];
    size_t text_slot_count;
    uint32_t values[hud_value_source_count] {};
    uint32_t maximums[hud_value_source_count] {};
    uint8_t value_sources = 0;
};

struct OverlayState {
    bool visible;
    int x;
    int y;
    int target_x;
    int target_y;
    int width;
    int height;
    int line;
    int transition_frames;
};

struct MenuItem {
    const char* text;
    int value;
    bool enabled = true;
};

struct MenuState {
    bool visible;
    const char* title;
    const MenuItem* items;
    size_t item_count;
    int selected_index;
    int last_value;
    int last_index;
    bool accepted;
    bool cancelled;
};

constexpr int hud_text_columns = 13;
constexpr size_t menu_max_visible_items = 4;

void init_hud(HudState& state);
void set_hud_text(HudState& state, const char* left_text, const char* right_text);
void set_hud_text_slots(HudState& state, const char* const* text_slots, size_t text_slot_count);
void set_hud_value(HudState& state, HudValueSource source, uint32_t value, uint32_t maximum = 100);
void hide_hud(HudState& state);
void draw_hud(const HudState& state);
void update_hud_behavior(EventState& state, bool visible);

void init_overlay(OverlayState& state);
void set_overlay_line(OverlayState& state, int line);
void show_overlay(OverlayState& state, int x, int y, int width, int height);
void move_overlay(OverlayState& state, int x, int y, int frames);
void tick_overlay(OverlayState& state);
void hide_overlay(OverlayState& state);
void draw_overlay(const OverlayState& state);

void init_menu(MenuState& state);
bool show_menu(MenuState& state, const char* title, const MenuItem* items, size_t item_count);
void hide_menu(MenuState& state);
size_t menu_first_visible_index(const MenuState& state);
size_t menu_visible_item_count(const MenuState& state);
bool menu_has_previous_page(const MenuState& state);
bool menu_has_next_page(const MenuState& state);
bool advance_menu(MenuState& state, InputState input);
void draw_menu(const MenuState& state);

} // namespace gbs
