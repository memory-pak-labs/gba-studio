#!/usr/bin/env python3
"""Compile the exported menu's input rendering policy against real menu data."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "templates/exported_menu/main.cpp").read_text()


def function(signature):
    start = source.index(signature + " {")
    end = source.index("{", start) + 1
    depth = 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


policy = "bool menu_screen_uses_text_input_presentation(const gbs::MenuScreenData* screen)"
program = r'''
#include "gbs/menu.hpp"
#include <algorithm>
#include <cassert>
gbs::MenuScreenData screen {};
gbs::MenuProjectData project {};
struct { int screen_index = 0; } menu_state;
struct { bool editing = false; int keyboard_index = 0; bool lowercase = false;
    int max_length = 3, cursor_index = 0; char value[17] {}; } menu_text_input;
bool menu_text_input_overlay_visible = false;
int surfaces = 0, fields = 0, keyboards = 0;
int restored_ui_assets = 0;
namespace gbs {
void render_ui_assets() { ++restored_ui_assets; }
void draw_text_input_surface(int, int, int, int, bool) { ++surfaces; }
void draw_text_overlay_light(int, int, int, const char*, bool) { ++fields; }
void draw_text_input_keyboard(int, int, int, int, int, bool, bool) {}
void draw_text_input_keyboard_with_controls(int, int, int, int, int, bool, bool,
    int, int, int, int, int, int) { ++keyboards; }
}
''' + function("const gbs::MenuTextInputData* menu_text_input_config(const gbs::MenuScreenData* screen)")
if policy + " {" in source:
    program += function(policy)
program += function("bool menu_screen_uses_actor_options(const gbs::MenuScreenData* screen)")
program += function("bool menu_text_input_uses_keyboard(const gbs::MenuTextInputData* config)")
program += function("void build_menu_text_input_display(char* output, size_t capacity)")
program += function("void draw_menu_text_input()")
program += function("void clear_menu_text_input_overlay(const gbs::MenuScreenData* screen)")
program += r'''
int main() {
    project.screens = &screen;
    project.screen_count = 1;
    screen.screen_type = gbs::MenuScreenType::Menu;
    screen.text_input = {0, 3, 10, 5, 8,
        {gbs::MenuTextInputKeyboardLayout::Grid, 4, 8, 22, 6, true}};
    screen.hud_list_rows = 3;
    // A regular list keeps its own focus and does not expose the keyboard yet.
    assert(!menu_screen_uses_actor_options(&screen));
    draw_menu_text_input();
    assert(surfaces == 0 && fields == 0 && keyboards == 0);
    // Opening the text item gives the keyboard exclusive presentation.
    menu_text_input.editing = true;
    char display[4] {};
    build_menu_text_input_display(display, sizeof(display));
    assert(display[0] == '-'); // Cursor uses a glyph present in the bundled font.
    assert(menu_screen_uses_actor_options(&screen));
    draw_menu_text_input();
    assert(surfaces == 1 && fields == 1 && keyboards == 1);
    menu_text_input.editing = false;
    draw_menu_text_input();
    assert(surfaces == 1 && fields == 1 && keyboards == 1);
    // Dedicated name screens retain their existing always-visible keyboard.
    screen.hud_list_rows = 0;
    assert(menu_screen_uses_actor_options(&screen));
    draw_menu_text_input();
    assert(surfaces == 2 && fields == 2 && keyboards == 2);
    screen.text_input = gbs::menu_no_text_input();
    assert(!menu_screen_uses_actor_options(&screen));
    draw_menu_text_input();
    assert(keyboards == 2);
    menu_text_input_overlay_visible = true;
    clear_menu_text_input_overlay(&screen);
    assert(restored_ui_assets == 1); // Next dialogue recovers its own palette.
    clear_menu_text_input_overlay(&screen);
    assert(restored_ui_assets == 1);
}
'''
with tempfile.TemporaryDirectory(prefix="gba-menu-input-presentation-") as tmp:
    cpp, exe = Path(tmp) / "test.cpp", Path(tmp) / "test"
    cpp.write_text(program)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-I", str(root / "engine/include"), str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print("Menu text input presentation passed")
