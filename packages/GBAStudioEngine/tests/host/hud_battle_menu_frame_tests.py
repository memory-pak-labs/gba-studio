"""Clear the old battle menu footprint before switching to a wider notice."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_battle_rpg/main.cpp').read_text()
start = source.index('void set_battle_menu_frame(')
helper = source[start:source.index('\nvoid show_battle_prompt()', start)]
code = '''#include <cassert>
namespace gbs {
struct DialogueState { int frame_index; bool visible; };
int cleared = 0;
void draw_dialogue(const DialogueState& state) {
    assert(!state.visible && state.frame_index == 4); ++cleared;
}
void set_dialogue_frame(DialogueState& state, int frame) { state.frame_index = frame; }
}
gbs::DialogueState battle_menu_dialogue {4,true};
''' + helper + '''
int main() {
    set_battle_menu_frame(4); assert(gbs::cleared == 0);
    set_battle_menu_frame(0); assert(gbs::cleared == 1);
    assert(battle_menu_dialogue.visible && battle_menu_dialogue.frame_index == 0);
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    (directory / 'test.cpp').write_text(code)
    subprocess.run(['c++', '-std=c++17', str(directory / 'test.cpp'), '-o', str(directory / 'test')], check=True)
    subprocess.run([str(directory / 'test')], check=True)
print('Battle menu frame changes clear the old footprint and preserve visibility: PASS')
