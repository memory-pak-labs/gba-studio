"""Run the real racing render order and protect image HUDs from actor clearing."""
from pathlib import Path
import subprocess
import tempfile
root = Path(__file__).resolve().parents[2]
source = (root/'templates/exported_racing/main.cpp').read_text()
start = source.index('void render_racing_runtime(')
render = source[start:source.index('\nvoid leave_racing_runtime()', start)]
code = '''#include <cassert>
#include "gbs/racing.hpp"
#include "gbs/dialogue.hpp"
namespace gbs { struct RuntimeFrameContext {}; void draw_dialogue(const DialogueState&) {} void wait_vblank() {} }
gbs::DialogueState dialogue {}; gbs::RacingRoomData rooms[1] {}; gbs::RacingProjectData project {};
int current_room_index=0; bool racing_controls_active=false, actors_drawn=false, hud_visible=false;
struct { int seen_tile_effects; } runtime_telemetry;
void draw_track() {} void draw_actors(bool) { actors_drawn=true; hud_visible=false; }
void draw_racing_hud(const gbs::RacingRoomData&) { assert(actors_drawn); hud_visible=true; }
void sync_runtime_telemetry() {}
''' + render + '''
int main() { project.rooms=rooms; render_racing_runtime({}); assert(hud_visible); }
'''
with tempfile.TemporaryDirectory() as directory:
    directory=Path(directory)
    (directory/'test.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(directory/'test.cpp'),'-o',str(directory/'test')],check=True)
    subprocess.run([str(directory/'test')],check=True)
print('Racing HUD survives actor clearing: PASS')
