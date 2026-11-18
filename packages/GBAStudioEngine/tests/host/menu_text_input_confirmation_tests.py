"""Exercise the production keyboard handler, including the authored completion action."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "templates/exported_menu/main.cpp").read_text()


def function(signature):
    start = source.index(signature + " {")
    end, depth = source.index("{", start) + 1, 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


program = r'''
#include "gbs/menu.hpp"
#include <cassert>
#include <cstring>
gbs::MenuScreenData screen {};
gbs::MenuProjectData project {};
gbs::EventState event_state {};
struct { int screen_index = 0, selected_item_index = 0; } menu_state;
struct { bool editing = true; int keyboard_index = 0, cursor_index = 0, max_length = 8;
    bool lowercase = false; char value[17] = "NARA"; } menu_text_input;
int activations = 0;
char confirmed_name[17] {};
void copy_menu_text_input_to_event_state() {
    std::strcpy(event_state.text_variables[0], menu_text_input.value);
}
void activate_selection() {
    ++activations;
    assert(!menu_text_input.editing);
    assert(menu_state.selected_item_index == 2);
    std::strcpy(confirmed_name, event_state.text_variables[0]);
}
void move_menu_text_input_keyboard(int, int) {}
void select_menu_text_input_character() {}
void backspace_menu_text_input_character() {}
void cycle_menu_text_input_character(int) {}
''' + function("const gbs::MenuTextInputData* menu_text_input_config(const gbs::MenuScreenData* screen)")
program += function("bool menu_text_input_uses_keyboard(const gbs::MenuTextInputData* config)")
if "void confirm_menu_text_input() {" in source:
    program += function("void confirm_menu_text_input()")
program += function("bool update_menu_text_input(const gbs::InputState& input)")
program += r'''
int main() {
    gbs::MenuItemData items[3] {};
    for (auto& item : items) item.enabled = true;
    items[1].enabled = false; // Unavailable actions do not consume completion.
    screen.items = items; screen.item_count = 3;
    screen.text_input = {0, 8, 15, 5, 8,
        {gbs::MenuTextInputKeyboardLayout::Grid, 11, 8, 16, 10, true,
         gbs::MenuTextInputKeyboardControlLayout::BottomGrid}};
    project.screens = &screen; project.screen_count = 1;
    const gbs::InputState start {gbs::ButtonStart, gbs::ButtonStart, 0};
    assert(update_menu_text_input(start));
    assert(activations == 1 && std::strcmp(confirmed_name, "NARA") == 0);
    // A held Start cannot confirm twice or reopen the editor.
    assert(!update_menu_text_input({gbs::ButtonStart, 0, 0}));
    assert(activations == 1);
    menu_text_input.editing = true; menu_state.selected_item_index = 0;
    menu_text_input.keyboard_index = 28;
    std::strcpy(menu_text_input.value, "LIA");
    assert(update_menu_text_input({gbs::ButtonA, gbs::ButtonA, 0}));
    assert(activations == 2 && std::strcmp(confirmed_name, "LIA") == 0);
    menu_text_input.editing = true; menu_state.selected_item_index = 0;
    assert(update_menu_text_input({gbs::ButtonB, gbs::ButtonB, 0}));
    assert(!menu_text_input.editing && activations == 2);
    // Start also confirms the character-cycling input without a grid.
    screen.text_input.keyboard.layout = gbs::MenuTextInputKeyboardLayout::Hidden;
    menu_text_input.editing = true;
    assert(update_menu_text_input(start)); assert(activations == 3);
}
'''
with tempfile.TemporaryDirectory(prefix="gba-name-confirm-") as directory:
    cpp, exe = Path(directory) / "test.cpp", Path(directory) / "test"
    cpp.write_text(program)
    subprocess.run(["c++", "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-I", str(root / "engine/include"), str(cpp), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print("Menu text input confirmation passed")
