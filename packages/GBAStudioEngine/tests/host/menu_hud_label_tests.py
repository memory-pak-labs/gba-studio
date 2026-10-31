#!/usr/bin/env python3
"""Exercise menu HUD labels for selection, toggles and unavailable items."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_menu/main.cpp').read_text()
start = source.index('void format_hud_menu_item_label(')
end = source.index('{', start) + 1
depth = 1
while depth:
    depth += (source[end] == '{') - (source[end] == '}')
    end += 1

program = r'''
#include <cassert>
#include <algorithm>
#include <cstdint>
#include <cstring>
#include <cstddef>
using std::size_t;
namespace gbs {
enum class MenuItemAction { Select, ToggleVariable, AdjustVariable };
struct MenuItemData { const char* label; MenuItemAction action; int audio_channel = -1; struct { int variable_index = 0; } value; bool available = true; };
struct MenuScreenData { bool hud_transparent_text = false; };
MenuScreenData screen;
const MenuScreenData* menu_screen_for(int, int) { return &screen; }
bool is_valid_event_variable(int) { return true; }
template <typename T> bool menu_item_is_available(const T&, const MenuItemData& item) { return item.available; }
}
int project = 0;
struct { int screen_index = 0; int selected_item_index = 0; } menu_state;
struct { int variables[1] {}; } event_state;
char menu_item_label_buffers[16][64] {};
bool menu_screen_uses_actor_options(const gbs::MenuScreenData*) { return false; }
char* append_text(char* p, char* end, const char* s) { while (*s && p < end) *p++ = *s++; return p; }
char* append_uint(char* p, char*, unsigned) { return p; }
char* append_hud_audio_bar(char* p, char*, const gbs::MenuItemData&) { return p; }
char* append_menu_item_details(char* p, char* end, const gbs::MenuItemData& item) {
    return append_text(p, end, item.action == gbs::MenuItemAction::ToggleVariable ? " OFF" : "");
}
''' + source[start:end] + r'''
int main() {
    gbs::MenuItemData toggle {"Alternar", gbs::MenuItemAction::ToggleVariable};
    format_hud_menu_item_label(toggle, 0, 0);
    assert(std::strcmp(menu_item_label_buffers[0], " Alternar OFF") == 0);
    format_hud_menu_item_label(toggle, 1, 0);
    assert(std::strcmp(menu_item_label_buffers[0], " Alternar OFF") == 0);
    gbs::MenuItemData normal {"Executar", gbs::MenuItemAction::Select};
    format_hud_menu_item_label(normal, 0, 0);
    assert(std::strcmp(menu_item_label_buffers[0], "  Executar") == 0);
    gbs::MenuItemData unavailable {"Carregar", gbs::MenuItemAction::Select};
    unavailable.available = false;
    format_hud_menu_item_label(unavailable, 1, 0);
    assert(std::strcmp(menu_item_label_buffers[0], "- Carregar") == 0);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-menu-label-') as tmp:
    cpp = Path(tmp) / 'test.cpp'
    exe = Path(tmp) / 'test'
    cpp.write_text(program)
    subprocess.run(['c++', '-std=c++17', str(cpp), '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('Menu HUD labels passed')
