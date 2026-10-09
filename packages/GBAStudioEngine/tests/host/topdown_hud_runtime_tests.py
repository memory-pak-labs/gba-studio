#!/usr/bin/env python3
"""Run the top-down HUD refresh with the generated scene contract and real UI state."""
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'examples/topdown_basic/src/main.cpp').read_text()


def function(marker):
    start = source.index(marker)
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end] + '\n'


spec = importlib.util.spec_from_file_location('assetc_topdown_hud', ROOT / 'tools/assetc/assetc.py')
assetc = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = assetc
spec.loader.exec_module(assetc)
project = {'topdown_project': {'dialogue_ui': {
    'hud_presets': [{'id': 'authored-hud'}],
    'hud_scene_bindings': [{'scene_name': 'authored', 'preset_id': 'authored-hud'}],
}}}
parsed = assetc.shared_dialogue_ui_assets_from_project(project, ROOT)
header = assetc.emit_shared_dialogue_ui_assets_header(*parsed[:10], scene_skins=parsed[10])
code = r'''
#include <cassert>
#include <cstring>
#include "gbs/ui.hpp"
#include "generated.hpp"
struct Room { const char* name; };
const Room rooms[] = {{"blank"}, {"authored"}, {"no-hud"}, {nullptr}};
struct Project { const Room* rooms; } project {rooms};
int current_room = 0;
uint32_t save_sequence = 0;
gbs::HudState hud {};
char hud_left_buffer[16] {};
char hud_right_buffer[16] {};
'''
code += function('void write_small_number(') + function('void refresh_hud(')
code += r'''
void assert_hidden() {
    assert(!hud.visible);
    assert(hud.text_slot_count == 0);
    assert(hud.left_text == nullptr && hud.right_text == nullptr);
    for (const char* slot : hud.text_slots) assert(slot == nullptr);
}
int main() {
    gbs::init_hud(hud);
    refresh_hud();
    assert_hidden(); // A fresh blank scene must respect Sem HUD.
    current_room = 1;
    refresh_hud();
    assert(hud.visible && hud.text_slot_count == 2);
    assert(std::strcmp(hud.left_text, "ROOM 2") == 0);
    assert(std::strcmp(hud.right_text, "SAVE 0") == 0);
    save_sequence = 7;
    refresh_hud();
    assert(std::strcmp(hud.right_text, "SAVE 7") == 0);
    current_room = 2;
    refresh_hud();
    assert_hidden(); // Entering an unbound scene clears the previous HUD.
    current_room = 1;
    refresh_hud();
    assert(hud.visible); // Returning to an authored scene restores its HUD.
    current_room = 3;
    refresh_hud();
    assert_hidden();
    current_room = 0;
    save_sequence = 8;
    refresh_hud();
    assert_hidden(); // Saving does not resurrect a disabled HUD.
}
'''
with tempfile.TemporaryDirectory(prefix='gba-topdown-hud-') as directory:
    temp = Path(directory)
    (temp / 'generated.hpp').write_text(header)
    cpp = temp / 'check.cpp'
    cpp.write_text(code)
    exe = temp / 'check'
    subprocess.run(['c++', '-std=c++17', '-O2', '-ffunction-sections', '-fdata-sections',
                    '-I' + str(ROOT / 'engine/include'), str(cpp), str(ROOT / 'engine/src/gbs_ui.cpp'),
                    '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections',
                    '-o', str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print('top-down HUD scene visibility: PASS')
