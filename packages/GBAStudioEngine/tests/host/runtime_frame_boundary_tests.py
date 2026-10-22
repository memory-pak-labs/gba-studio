"""Execute exported scheduling paths: entry waits and UI publication boundaries."""
from pathlib import Path
import re
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


def function(source, marker):
    start = source.index(marker)
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end] + '\n'


def run_cpp(code, sources=()):
    with tempfile.TemporaryDirectory(prefix='gba-frame-boundary-') as directory:
        temp = Path(directory)
        (temp / 'test.cpp').write_text(code)
        executable = temp / 'test'
        subprocess.run(['c++', '-std=c++17', '-O2', '-ffunction-sections', '-fdata-sections',
                        '-I' + str(ROOT / 'engine/include'), '-I' + str(ROOT / 'engine/src'),
                        str(temp / 'test.cpp'), *[str(ROOT / s) for s in sources],
                        '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections',
                        '-o', str(executable)], check=True)
        subprocess.run([str(executable)], check=True)


class RuntimeFrameBoundaryTests(unittest.TestCase):
    def test_platformer_initial_and_room_entry_wait_before_warp_and_player_start(self):
        source = (ROOT / 'examples/platformer_basic/src/main.cpp').read_text()
        entries = re.findall(r'(?:[^\n]*gbs::stop_event_runner\(platformer_event_runner\);\s*gbs::clear_event_script_queue\(platformer_event_queue\);\s*platformer_event_wait_frames = 0;\s*)?[^\n]*\((?:event_state, )?room_data->on_enter\);\s*queue_platformer_player_start_script\(\);', source)
        self.assertEqual(len(entries), 2, 'Cover initial entry and same-runtime room entry')
        for entry_index, entry in enumerate(entries):
            with self.subTest(entry=entry.strip()):
                code = '''
#include <cassert>
#include "gbs/event.hpp"
namespace gbs {
struct PlatformerActor {};
struct PlatformerRoomData { int config; EventScript on_enter; };
}
gbs::EventState event_state {};
gbs::EventRunner platformer_event_runner {};
gbs::EventScriptQueue platformer_event_queue {};
int platformer_event_wait_frames = 0;
struct { bool visible; } dialogue {false};
const gbs::EventCommand boot[] = {{gbs::EventOp::SetVariable,2,1,0}};
struct {gbs::EventScript player_on_start;} project {{boot,1}};
void consume_event_state(gbs::EventState& state) {
    platformer_event_wait_frames += state.wait_frames; state.wait_frames = 0;
}
void consume_platformer_actor_commands(gbs::EventState&,gbs::PlatformerActor&,const gbs::PlatformerRoomData&,bool&) {}
void consume_platformer_state_request(gbs::EventState&,gbs::PlatformerActor&,int,bool&,int&) {}
'''
                code += function(source, 'void queue_platformer_script(')
                code += function(source, 'void queue_platformer_player_start_script(')
                code += function(source, 'void update_platformer_event_script(')
                code += '''
int main() {
    gbs::init_event_state(event_state);
    gbs::init_event_runner(platformer_event_runner);
    gbs::init_event_script_queue(platformer_event_queue);
    const gbs::EventCommand commands[] = {
        {gbs::EventOp::SetVariable,0,1,0}, {gbs::EventOp::Wait,90,0,0},
        {gbs::EventOp::Warp,3,12,16}, {gbs::EventOp::SetVariable,1,1,0}
    };
    gbs::PlatformerRoomData room {0,{commands,4}};
    auto* room_data = &room;
'''
                if entry_index == 1:
                    code += '''
    // A same-runtime warp must discard work queued in the departed room.
    const gbs::EventCommand old[] = {{gbs::EventOp::SetVariable,3,99,0}};
    queue_platformer_script({old,1});
    gbs::start_event_runner(platformer_event_runner,{old,1});
    platformer_event_wait_frames = 5;
'''
                code += entry + '''
    consume_event_state(event_state);
    assert(event_state.current_room == 0 && event_state.variables[1] == 0);
    gbs::PlatformerActor player; bool active = true; int active_state = 0;
    update_platformer_event_script(event_state,player,room,active,active_state);
    assert(event_state.variables[0] == 1 && platformer_event_wait_frames == 90);
    assert(event_state.variables[2] == 0);
    for (int frame = 0; frame < 90; ++frame) {
        gbs::tick_event_frame_counter(event_state);
        update_platformer_event_script(event_state,player,room,active,active_state);
        assert(event_state.current_room == 0 && event_state.variables[1] == 0);
        assert(event_state.variables[2] == 0);
    }
    update_platformer_event_script(event_state,player,room,active,active_state);
    assert(event_state.current_room == 3 && event_state.variables[1] == 1);
    assert(event_state.player_x == 12 && event_state.player_y == 16);
    update_platformer_event_script(event_state,player,room,active,active_state);
    assert(event_state.variables[2] == 1);
    assert(event_state.variables[3] == 0);
}
'''
                run_cpp(code, ['engine/src/gbs_event.cpp', 'engine/src/gbs_dialogue_locale.cpp',
                               'engine/src/gbs_runtime.cpp', 'engine/src/gbs_rtc.cpp',
                               'engine/src/gbs_link.cpp', 'engine/src/rumble.cpp',
                               'engine/src/deferred_work.cpp', 'engine/src/gbs_engine_global.cpp',
                               'tests/host/hw_stubs.cpp'])

    def test_menu_ui_restore_is_hidden_until_its_own_uploads_complete(self):
        source = (ROOT / 'templates/exported_menu/main.cpp').read_text()
        render = function(source, 'void render_menu_runtime(')
        restore = function(render, 'if (menu_ui_assets_restore_pending &&')
        code = '''
#include <cassert>
#include <cstddef>
bool blocked = false;
int restores = 0, transactions = 0;
namespace gbs {
enum class MenuScreenType {Logo, Title, Menu};
struct MenuScreenData {MenuScreenType screen_type;};
struct PaletteAsset {};
bool render_publication_transaction_active() {return blocked;}
void begin_render_publication_transaction() {blocked = true; ++transactions;}
void render_ui_assets() {assert(blocked); ++restores;}
int active_dialogue_box_skin() {return 0;}
int active_hud_box_skin() {return 0;}
void configure_dialogue_box_skin(int) {assert(blocked);}
void configure_hud_box_skin(int) {assert(blocked);}
const MenuScreenData* menu_screen_for(int, int) {
    static MenuScreenData screen {MenuScreenType::Menu}; return &screen;
}
const char* menu_screen_name(int, int) {return "missoes";}
void load_palette(const PaletteAsset&, bool) {assert(blocked);}
}
namespace gbastudio_dialogue_ui {void configure_for_scene(const char*) {assert(blocked);}}
struct {int screen_index = 0;} menu_state;
struct {int bg_palette_count = 0; gbs::PaletteAsset bg_palettes[1]; operator int() const {return 0;}} project;
int active_background_index = -1;
bool menu_ui_assets_restore_pending = true;
bool menu_screen_uses_ui(const gbs::MenuScreenData*) {return true;}
void restore_menu() {
'''
        code += restore + '''
}
int main() {
    // Background DMA just drained. Restoring font/skin queues another upload.
    restore_menu();
    assert(restores == 1 && transactions == 1 && blocked);
    assert(!menu_ui_assets_restore_pending);
    restore_menu();
    assert(restores == 1 && transactions == 1);
}
'''
        run_cpp(code)

    def test_battle_ui_is_staged_before_final_vblank_and_restore_happens_once(self):
        source = (ROOT / 'templates/exported_battle_rpg/main.cpp').read_text()
        code = '''
#include <cassert>
#include <string>
#include <vector>
std::vector<std::string> calls;
namespace gbs {
struct RuntimeFrameContext {};
struct DialogueState {bool visible;};
struct HudState {};
void wait_vblank() {calls.push_back("wait");}
void render_ui_assets() {calls.push_back("restore");}
void draw_dialogue(const DialogueState&) {calls.push_back("dialogue");}
void draw_hud(const HudState&) {calls.push_back("hud");}
struct PaletteAsset {};
void load_palette(const PaletteAsset&,bool){calls.push_back("palette");}
}
gbs::DialogueState dialogue {false}, battle_prompt_dialogue {}, battle_menu_dialogue {};
gbs::HudState battle_hud;
bool battle_ui_restore_pending = true;
struct { struct Encounter {struct Presentation {const gbs::PaletteAsset* hud_palette=nullptr;} *presentation=nullptr;} encounters[1];} project;
int encounter_index=0;
bool custom_ui=false;
bool authored_battle_ui(){return custom_ui;}
void draw_battle() {calls.push_back("actors");}
void update_battle_hud() {}
void ensure_battle_prompt_visible() {}
void sync_runtime_telemetry() {}
'''
        code += function(source, 'void render_battle_rpg_runtime(')
        code += '''
int main() {
    render_battle_rpg_runtime({});
    assert(!battle_ui_restore_pending && calls.back() == "wait");
    bool upload_completed = false, restored = false;
    for (auto& call : calls) {
        if (call == "wait") upload_completed = true;
        if (call == "restore") {assert(upload_completed);restored = true;}
    }
    assert(restored);
    for (bool custom : {false,true}) for (bool visible : {false,true}) {
        custom_ui=custom;
        calls.clear(); dialogue.visible = visible;
        render_battle_rpg_runtime({});
        assert(calls.back() == "wait");
        int waits = 0;
        for (auto& call : calls) {waits += call == "wait"; assert(call != "restore");}
        assert(waits == 1);
    }
}
'''
        run_cpp(code)


if __name__ == '__main__':
    unittest.main()
