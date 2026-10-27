"""Exercise actual battle render order as a scripted dialogue opens and closes."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_battle_rpg/main.cpp').read_text()
start = source.index('void render_battle_rpg_runtime(')
render = source[start:source.index('\nvoid leave_battle_rpg_runtime()', start)]
code = r'''
#include <cassert>
#include <string>
std::string calls;
namespace gbs {
struct RuntimeFrameContext {};
enum class ProfilerSubsystem { Render };
struct SubsystemProfilerScope { explicit SubsystemProfilerScope(ProfilerSubsystem) {} };
struct DialogueState { bool visible = false; int frame_index=0; const char* speaker="Nara"; };
struct HudState {};
struct DialogueBoxLayout { int x,y,w,h; };
struct DialogueUiConfig { bool name_label_above=true, show_character_name=true; };
DialogueBoxLayout dialogue_box_layout_for_frame(int) { return {1,14,28,5}; }
DialogueBoxLayout dialogue_name_label_layout_for_frame(int,int) { return {1,11,8,3}; }
const DialogueUiConfig& active_dialogue_ui_config() { static DialogueUiConfig value; return value; }
void draw_dialogue(const DialogueState& d) { calls += d.visible ? 'D' : 'C'; }
void draw_hud(HudState&) { calls += 'H'; }
void draw_hud_excluding(HudState&,int x,int y,int w,int h) {
  assert(x==0 && y==88 && w==240 && h==72); calls += 'M';
}
void wait_vblank() {}
void render_ui_assets() {}
void load_palette(int, bool) {}
}
gbs::DialogueState dialogue {}, battle_prompt_dialogue {}, battle_menu_dialogue {};
gbs::HudState battle_hud {};
bool battle_ui_restore_pending = false;
bool battle_dialogue_was_drawn = false;
struct Presentation { int* hud_palette = nullptr; } presentation;
struct Encounter { Presentation* presentation; };
struct Project { Encounter encounters[1] {{&presentation}}; } project;
int encounter_index=0;
void draw_battle() {}
void update_battle_hud() {}
void ensure_battle_prompt_visible() {}
void sync_runtime_telemetry() {}
bool authored_battle_ui() { return true; }
''' + render + r'''
int main() {
  dialogue.visible=true; render_battle_rpg_runtime({});
  assert(calls == "MD"); // Lower HUD is suppressed; the dialogue owns its band.
  calls.clear(); dialogue.visible=false; render_battle_rpg_runtime({});
  assert(calls == "CH"); // Clear the old box before restoring the HUD.
  calls.clear(); render_battle_rpg_runtime({});
  assert(calls == "H"); // Do not erase HUD tiles on subsequent frames.
}
'''
with tempfile.TemporaryDirectory(prefix='gba-battle-dialogue-') as directory:
    temp = Path(directory)
    (temp / 'test.cpp').write_text(code)
    subprocess.run(['c++', '-std=c++17', str(temp / 'test.cpp'), '-o', str(temp / 'test')], check=True)
    subprocess.run([str(temp / 'test')], check=True)
print('Battle dialogue opening, closing and HUD restoration: PASS')
