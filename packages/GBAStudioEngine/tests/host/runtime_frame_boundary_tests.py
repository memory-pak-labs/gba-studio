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
        (temp / 'test.cpp').write_text('#include "gbs/profiler.hpp"\n' + code)
        executable = temp / 'test'
        subprocess.run(['c++', '-std=c++17', '-O2', '-ffunction-sections', '-fdata-sections',
                        '-I' + str(ROOT / 'engine/include'), '-I' + str(ROOT / 'engine/src'),
                        str(temp / 'test.cpp'), *[str(ROOT / s) for s in sources],
                        '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections',
                        '-o', str(executable)], check=True)
        subprocess.run([str(executable)], check=True)


class RuntimeFrameBoundaryTests(unittest.TestCase):
    def test_platformer_button_script_waits_between_cover_and_reveal(self):
        source = (ROOT / 'examples/platformer_basic/src/main.cpp').read_text()
        code = '''
#include <cassert>
#include "gbs/event.hpp"
namespace gbs {
struct PlatformerActor {};
struct PlatformerRoomData { int config; };
struct VisualEffectsController { int phase = 0; };
void consume_visual_effect_event(EventState& state, VisualEffectsController& effect) {
    if (!state.visual_effect_changed) return;
    effect.phase = state.visual_effect_phase;
    state.visual_effect_changed = false;
}
template<class T> bool is_valid_platformer_project_script_index(const T& p, int i) {
    return i >= 0 && static_cast<size_t>(i) < p.script_count;
}
}
gbs::EventState event_state {};
gbs::EventRunner platformer_event_runner {};
gbs::EventScriptQueue platformer_event_queue {};
int platformer_event_wait_frames = 0;
gbs::VisualEffectsController visual_effects;
struct { bool visible; } dialogue {false};
struct { const gbs::EventScript* scripts; size_t script_count; } project {};
void consume_event_state(gbs::EventState& state) {
    platformer_event_wait_frames += state.wait_frames; state.wait_frames = 0;
}
void consume_platformer_actor_commands(gbs::EventState&,gbs::PlatformerActor&,const gbs::PlatformerRoomData&,bool&) {}
void consume_platformer_state_request(gbs::EventState&,gbs::PlatformerActor&,int,bool&,int&) {}
'''
        code += function(source, 'void queue_platformer_script(')
        code += function(source, 'bool run_button_event_binding(')
        code += function(source, 'void update_platformer_event_script(')
        code += '''
int main() {
    gbs::init_event_state(event_state);
    gbs::init_event_runner(platformer_event_runner);
    gbs::init_event_script_queue(platformer_event_queue);
    const gbs::EventCommand commands[] = {
        {gbs::EventOp::VisualEffect,9,4,100,1},
        {gbs::EventOp::SetVariable,0,1,0}, {gbs::EventOp::Wait,8,0,0},
        {gbs::EventOp::VisualEffect,9,4,100,2},
        {gbs::EventOp::SetVariable,0,2,0}, {gbs::EventOp::Warp,1,24,32}
    };
    const gbs::EventScript scripts[] = {{commands,6}};
    project = {scripts,1};
    const gbs::EventCommand binding[] = {{gbs::EventOp::AttachButtonEvent,1,0,1}};
    gbs::run_event_script(event_state,{binding,1});
    gbs::set_event_input_state(event_state,1,1,0);
    assert(run_button_event_binding());
    assert(event_state.variables[0] == 0 && event_state.current_room == 0);
    gbs::PlatformerActor player; gbs::PlatformerRoomData room{};
    bool active=true; int active_state=0;
    update_platformer_event_script(event_state,player,room,active,active_state);
    assert(event_state.variables[0] == 1 && platformer_event_wait_frames == 8);
    assert(visual_effects.phase == 1);
    for (int frame=0; frame<8; ++frame) {
        gbs::tick_event_frame_counter(event_state);
        update_platformer_event_script(event_state,player,room,active,active_state);
        assert(event_state.variables[0] == 1 && event_state.current_room == 0);
        assert(visual_effects.phase == 1);
    }
    update_platformer_event_script(event_state,player,room,active,active_state);
    assert(event_state.variables[0] == 2 && event_state.current_room == 1);
    assert(visual_effects.phase == 2);
    assert(event_state.player_x == 24 && event_state.player_y == 32);
}
'''
        run_cpp(code, ['engine/src/gbs_event.cpp', 'engine/src/gbs_dialogue_locale.cpp',
                      'engine/src/gbs_runtime.cpp', 'engine/src/gbs_rtc.cpp',
                      'engine/src/gbs_link.cpp', 'engine/src/rumble.cpp',
                      'engine/src/deferred_work.cpp', 'engine/src/gbs_engine_global.cpp',
                      'tests/host/hw_stubs.cpp'])

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
void consume_visual_effect_event(EventState&, int&) {}
}
int visual_effects = 0;
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


    def test_visual_novel_cancelled_choice_stays_interactive_without_effects(self):
        source = (ROOT / 'templates/exported_visual_novel/main.cpp').read_text()
        code = r'''
#include <cassert>
#include "gbs/visual_novel.hpp"
gbs::VisualNovelProjectData project {};
gbs::DialogueState dialogue {};
gbs::EventState event_state {};
int current_scene_index=0, reopened=0, effects=0, saves=0;
bool pending_scene_advance=false;
int pending_next_scene_index=-1;
size_t runtime_choice_count=2;
int runtime_choice_source_indices[] {0,1};
bool show_choice_group(const gbs::VisualNovelChoiceGroupData&) {
    ++reopened; dialogue.visible=true; dialogue.choice_mode=true; return true;
}
void run_visual_novel_event_script(gbs::EventScript) {++effects;}
void consume_event_state() {}
void refresh_hud() {}
void persist_visual_novel_runtime_state() {++saves;}
'''
        code += function(source, 'void finish_scene_choice_if_needed(')
        code += r'''
int main() {
    const gbs::DialogueChoice choices[] {{"Protect",1,0},{"Explore",2,1}};
    const gbs::VisualNovelChoiceOptionData options[] {
        {-1,1,false,1,{}}, {-1,1,false,1,{}}
    };
    const gbs::VisualNovelChoiceGroupData group {0,choices,2,0,options};
    const gbs::VisualNovelSceneData scenes[] {
        {"council",-1,-1,0,-1,{},{},false,nullptr},
        {"exit",-1,-1,-1,-1,{},{},false,nullptr}
    };
    project.scenes=scenes;project.scene_count=2;
    project.choice_groups=&group;project.choice_group_count=1;
    event_state.variables[0]=77;
    dialogue.visible=false;dialogue.last_choice_index=-1;
    dialogue.last_choice_script=-1;dialogue.last_choice_value=-1;
    finish_scene_choice_if_needed(true);
    assert(dialogue.visible && dialogue.choice_mode);
    assert(reopened==1 && event_state.variables[0]==77);
    assert(!pending_scene_advance && effects==0 && saves==0);
    dialogue.visible=false;dialogue.last_choice_index=1;
    dialogue.last_choice_script=1;dialogue.last_choice_value=2;
    finish_scene_choice_if_needed(true);
    assert(event_state.variables[0]==2 && effects==1 && saves==1);
    assert(pending_scene_advance && pending_next_scene_index==1);
}
'''
        run_cpp(code)

    def test_visual_novel_reveals_text_and_plays_only_valid_character_cues(self):
        source = (ROOT / 'templates/exported_visual_novel/main.cpp').read_text()
        code = r'''
#include <cassert>
#include <cstddef>
namespace gbs {
struct RuntimeFrameContext {};
struct SfxAsset { int id; };
struct DialogueState { bool visible, revealed_char_this_frame; int text_sfx_index; };
int updates=0, cues=0;
void update_dialogue(DialogueState& d) { ++updates; d.revealed_char_this_frame=d.visible; }
void play_sfx(const SfxAsset&) { ++cues; }
void hide_hud(int&) {} void draw_hud(int&) {} void draw_dialogue(const DialogueState&) {}
constexpr int runtime_telemetry_variable_count=16;
struct Telemetry { int current_room; int variables[16]; } telemetry;
Telemetry& runtime_telemetry_block() { return telemetry; }
template<class A,class B> void publish_runtime_physical_telemetry(A&,B&) {}
void wait_vblank() {}
}
int hud=0,resource_manager=0,current_scene_index=0;
struct { int variables[16]; } event_state {};
gbs::DialogueState dialogue {};
gbs::SfxAsset assets[] {{1}};
struct { const gbs::SfxAsset* sfx_assets; size_t sfx_asset_count; } project {assets,1};
void draw_dialogue_portrait() {}
'''
        code += function(source, 'void render_visual_novel_runtime(')
        code += r'''
int main() {
    for (bool visible : {false,true}) for (int index : {-1,0,1}) {
        dialogue={visible,false,index};gbs::updates=gbs::cues=0;
        render_visual_novel_runtime({});
        assert(gbs::updates==1);
        assert(gbs::cues==(visible && index==0 ? 1 : 0));
    }
}
'''
        run_cpp('#include <initializer_list>\n'+code)


if __name__ == '__main__':
    unittest.main()
