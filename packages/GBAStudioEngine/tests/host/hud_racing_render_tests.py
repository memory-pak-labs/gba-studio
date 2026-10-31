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
#include "gbs/profiler.hpp"
#include "gbs/dialogue.hpp"
int dialogue_draws=0, portrait_draws=0;
namespace gbs { struct RuntimeFrameContext {}; void draw_dialogue(const DialogueState&) {++dialogue_draws;} void draw_dialogue_portrait(const DialogueState&) { assert(dialogue_draws>portrait_draws); ++portrait_draws; } void wait_vblank() {} }
gbs::DialogueState dialogue {}; gbs::RacingRoomData rooms[1] {}; gbs::RacingProjectData project {};
struct { bool frame_valid=false; } racing_minimap_cache;
bool racing_dialogue_was_drawn=true;
int current_room_index=0; bool racing_controls_active=false, actors_drawn=false, hud_visible=false;
struct { int seen_tile_effects; } runtime_telemetry;
void draw_track() {} void draw_actors(bool) { actors_drawn=true; hud_visible=false; }
void draw_racing_hud(const gbs::RacingRoomData&) { assert(actors_drawn); hud_visible=true; }
void draw_pseudo3d_hud(const gbs::RacingRoomData&) { assert(hud_visible); }
void sync_runtime_telemetry() {}
''' + render + '''
int main() { project.rooms=rooms; rooms[0].config.pseudo3d.presentation=gbs::RacingPresentation::Pseudo3D; render_racing_runtime({}); assert(hud_visible && dialogue_draws==1);
render_racing_runtime({});assert(dialogue_draws==1);
dialogue.visible=true;render_racing_runtime({});assert(dialogue_draws==2 && portrait_draws==1 && racing_dialogue_was_drawn);
dialogue.visible=false;render_racing_runtime({});assert(dialogue_draws==3 && portrait_draws==1 && !racing_dialogue_was_drawn);
render_racing_runtime({});assert(dialogue_draws==3); }
'''
with tempfile.TemporaryDirectory() as directory:
    directory=Path(directory)
    (directory/'test.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(directory/'test.cpp'),'-o',str(directory/'test')],check=True)
    subprocess.run([str(directory/'test')],check=True)
print('Racing HUD survives actor clearing: PASS')
