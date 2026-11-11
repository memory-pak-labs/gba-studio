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
    def test_dungeon_inventory_consumes_only_when_it_restores_the_current_health(self):
        source = (ROOT / 'templates/exported_dungeon_crawler/main.cpp').read_text()
        update = function(source, 'bool update_dungeon_interaction(')
        inventory = function(update, 'if (interaction_mode == DungeonInteractionMode::Inventory)')
        code = r'''
#include <cassert>
#include <cstring>
#include "gbs/dungeon_crawler.hpp"
gbs::DungeonCrawlerProjectData project {};
gbs::DungeonCrawlerBattleState battle_state {};
gbs::EventState event_state {};
int exploration_player_hp=3;
enum class DungeonInteractionMode { None, Inventory };
DungeonInteractionMode interaction_mode=DungeonInteractionMode::Inventory;
bool dungeon_lateral_hud_visible=true;
const char* notice="";
void show_dungeon_notice(const char* text, bool) { notice=text; }
''' + function(source, 'int dungeon_player_hp()') + r'''
bool use(int selected) {
''' + inventory + r'''
    return false;
}
int main() {
    gbs::DungeonCrawlerInventoryItemData item {"Item",0,7,1};
    project.inventory_items=&item; project.inventory_item_count=1; event_state.inventory[0]=7;
    assert(use(0)); assert(exploration_player_hp==3 && event_state.inventory[0]==7);
    assert(std::strcmp(notice,"VIDA CHEIA.")==0);
    exploration_player_hp=2;
    assert(use(0)); assert(exploration_player_hp==3 && event_state.inventory[0]==6);
    assert(std::strcmp(notice,"CELULA USADA.")==0);
    battle_state.active=true; battle_state.player_hp=2;
    assert(use(0)); assert(battle_state.player_hp==3 && event_state.inventory[0]==5);
    assert(use(0)); assert(battle_state.player_hp==3 && event_state.inventory[0]==5);
    event_state.inventory[0]=0; battle_state.player_hp=1;
    assert(use(0)); assert(battle_state.player_hp==1 && event_state.inventory[0]==0);
    assert(std::strcmp(notice,"SEM CELULA.")==0);
    event_state.inventory[0]=2;
    assert(use(1)); assert(battle_state.player_hp==1 && event_state.inventory[0]==2);
}
'''
        run_cpp(code)

    def test_neutral_dungeon_hud_tracks_live_values_without_replacing_custom_slots(self):
        source = (ROOT / 'templates/exported_dungeon_crawler/main.cpp').read_text()
        render = function(source, 'void render_dungeon_crawler_runtime(')
        start = render.index('    // The dungeon HUD is fixed chrome.')
        block = render[start:render.index('    // Hidden dialogues', start)]
        code = r'''
#include <cassert>
#include <cstring>
#include <string>
#include <vector>
#include "gbs/dungeon_crawler.hpp"
#include "gbs/ui.hpp"
gbs::HudState hud {};
gbs::HudLayout layout {};
std::vector<std::string> captured;
bool scene_has_hud=true;
namespace gbastudio_dialogue_ui {
bool has_hud_scene_binding(const char*) { return scene_has_hud; }
}
namespace gbs {
const HudLayout* active_hud_layout() { return &layout; }
void set_hud_text_slots(HudState&, const char* const* slots, size_t count) {
    captured.clear(); for(size_t i=0;i<count;++i)captured.emplace_back(slots[i]);
}
void set_hud_text(HudState&, const char* left, const char* right) { captured={left,right}; }
void set_hud_value(HudState& state, HudValueSource source, uint32_t value, uint32_t maximum) {
    state.values[int(source)]=value; state.maximums[int(source)]=maximum;
}
void hide_hud(HudState&) { captured={"hidden"}; }
}
gbs::DungeonCrawlerProjectData project {};
gbs::DungeonCrawlerRuntimeState runtime_state {};
gbs::DungeonCrawlerBattleState battle_state {};
gbs::EventState event_state {};
gbs::DungeonPresentation presentation {};
bool presented=true, dungeon_enemy_defeated=false;
const gbs::DungeonPresentation* dungeon_presentation() { return presented?&presentation:nullptr; }
int current_room_index=0, hp=3;
int dungeon_player_hp() { return hp; }
char dungeon_direction_text[2] {}, dungeon_quantity_text[3] {};
enum class DungeonInteractionMode { None, Map };
DungeonInteractionMode interaction_mode=DungeonInteractionMode::None;
bool dungeon_lateral_hud_visible=false;
void rebuild_dungeon_sidebar_text() {}
const char* dungeon_sidebar_map_rows[5]={"","","","",""};
const char *dungeon_sidebar_hp_text="",*dungeon_sidebar_item_text="",*dungeon_sidebar_count_text="";
''' + function(source, 'const char* dungeon_hp_text(') + function(source, 'bool dungeon_string_equals(') + function(source, 'bool dungeon_lateral_hud_active(') + r'''
const char* dungeon_compass_hp_text(int value) { return dungeon_hp_text(value); }
void publish() {
''' + block + r'''
}
int main() {
    gbs::DungeonCrawlerRoomData room {}; room.battle_enabled=true;
    gbs::DungeonCrawlerInventoryItemData item {"Key",4,0,1};
    project.rooms=&room; project.room_count=1; project.inventory_items=&item; project.inventory_item_count=1;
    project.battle.max_hp=5; presentation.player_label="CUSTOM HERO";
    layout.id="user-copy"; layout.text_profile="dungeon-status"; runtime_state.direction=gbs::DungeonDirection::North;
    publish();
    assert((captured==std::vector<std::string>{"HP 03","N","00","A: INTERACT"}));
    assert(hud.values[int(gbs::HudValueSource::P1Health)]==3);
    assert(hud.maximums[int(gbs::HudValueSource::P1Health)]==3);
    hp=2; battle_state.active=true; battle_state.enemy_hp=4;
    event_state.inventory[4]=7; runtime_state.direction=gbs::DungeonDirection::East;
    publish();
    assert((captured==std::vector<std::string>{"HP 02","L","07","A: ATACAR"}));
    assert(hud.values[int(gbs::HudValueSource::P1Health)]==2);
    dungeon_enemy_defeated=true;
    publish(); assert(captured[3]=="A: INTERACT");
    dungeon_enemy_defeated=false;
    // The neutral HUD must also work without the optional presentation artwork.
    presented=false; project.inventory_item_count=0; hp=0;
    publish(); assert(captured[0]=="HP 00" && captured[2]=="00");
    assert(hud.values[int(gbs::HudValueSource::P1Health)]==0);
    // Existing custom six-slot presentations retain their contract.
    presented=true; layout.id="hud-neutral-dungeon-crawler"; layout.text_profile="standard"; project.inventory_item_count=1;
    publish();
    assert((captured==std::vector<std::string>{"CUSTOM HERO","L","MAPA","07","A","ATACAR"}));
    // Authored sidebar contracts also survive a new ID and override optional artwork.
    layout.id="my-sidebar"; layout.text_profile="dungeon-sidebar";
    dungeon_lateral_hud_visible=false; publish(); assert(captured.size()==8);
    layout.text_profile="dungeon-sidebar-contextual";
    publish(); assert(captured==std::vector<std::string>{"hidden"});
    dungeon_lateral_hud_visible=true; publish(); assert(captured.size()==8);
    // Removing the scene binding must also suppress the procedural fallback.
    scene_has_hud=false;
    for(const char* profile:{"dungeon-status","dungeon-sidebar","standard"}) {
        layout.text_profile=profile; publish(); assert(captured==std::vector<std::string>{"hidden"});
    }
}
'''
        run_cpp(code)

    def test_isometric_interaction_press_keeps_new_dialogue_open(self):
        source = (ROOT / 'examples/isometric_basic/src/main.cpp').read_text()
        frame = source[source.index('gbs::RuntimeAdapterFrameResult update_isometric_runtime('):]
        start = frame.index('        const gbs::InputState captured_input = gbs::begin_frame().input;')
        prefix = frame[start:frame.index('        gbs::tick_event_frame_counter(event_state);', start)]
        end = frame.index('        if (room_data->tileset_tilemap != nullptr)')
        start = frame.rindex('        consume_event_state(event_state);', 0, end)
        publication = frame[start:end]
        code = r'''
#include <cassert>
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
gbs::DialogueState dialogue {};
gbs::EventState event_state {};
gbs::DialogueLine lines[] = {{ "Conversa confirmada." }};
gbs::InputState next_input {};
struct { bool active = false; } iso_pending_exit;
int visual_effects = 0;
namespace gbs {
struct TestFrame { InputState input; };
TestFrame begin_frame() { return {next_input}; }
void consume_visual_effect_event(EventState&, int&) {}
}
void consume_event_state(gbs::EventState& events) {
    if (events.last_dialogue >= 0) {
        gbs::show_dialogue(dialogue, lines, 1, events.last_dialogue);
        events.last_dialogue = -1;
    }
}
void frame(bool interaction) {
''' + prefix + r'''
    // The adjacent actor publishes its dialogue on the same A press.
    if (interaction && input.was_pressed(gbs::ButtonA)) event_state.last_dialogue = 0;
''' + publication + r'''
}
int main() {
    gbs::init_event_state(event_state);
    gbs::init_dialogue(dialogue);
    gbs::set_dialogue_text_speed(dialogue, 0);
    next_input = {gbs::ButtonA, gbs::ButtonA, 0};
    frame(true);
    assert(dialogue.visible); // Opening A must not also confirm the new page.
    next_input = {};
    frame(false);
    assert(dialogue.visible);
    next_input = {gbs::ButtonA, gbs::ButtonA, 0};
    frame(false);
    assert(!dialogue.visible); // A later press still closes an existing page.
}
'''
        run_cpp(code, ['engine/src/gbs_event.cpp', 'engine/src/gbs_dialogue.cpp', 'engine/src/gbs_dialogue_locale.cpp',
                       'engine/src/gbs_text.c'])

    def test_dungeon_map_uploads_survive_until_vblank(self):
        source = (ROOT / 'templates/exported_dungeon_crawler/main.cpp').read_text()
        render = function(source, 'void draw_presented_dungeon_map()')
        code = r'''
#include <cassert>
#include <cstdint>
#include <cstring>
#include "gbs/engine.hpp"
#include "gbs/dungeon_crawler.hpp"
#include "gbs/render.hpp"
const uint8_t* pending_tiles = nullptr;
const uint16_t* pending_palette = nullptr;
const gbs::DialogueBoxSkin* selected_skin = nullptr;
uint16_t map_entries[32 * 32] {};
namespace gbs {
const DialogueBoxSkin* active_hud_box_skin() { return selected_skin; }
bool load_palette(const PaletteAsset& asset, bool) { pending_palette=asset.colors; return true; }
bool load_tiles(const TileAsset& asset) { pending_tiles=asset.data; return true; }
bool set_bg_tile(BackgroundLayer, int x, int y, int, int, uint16_t tile) {
    map_entries[y*32+x]=tile; return true;
}
}
enum class DungeonInteractionMode { None, Map };
DungeonInteractionMode interaction_mode = DungeonInteractionMode::Map;
struct Presentation { const gbs::PaletteAsset* hud_palette=nullptr; } presentation;
const Presentation* dungeon_presentation() { return &presentation; }
gbs::DungeonCrawlerProjectData project {};
gbs::DungeonCrawlerRuntimeState runtime_state {};
int current_room_index=0, map_scroll_x=0, map_scroll_y=0;
''' + '__attribute__((noinline)) ' + render + r'''
__attribute__((noinline)) void overwrite_stack() {
    volatile uint8_t scratch[4096];
    for (unsigned i=0;i<sizeof(scratch);++i) scratch[i]=0xa5;
}
int main() {
    uint8_t collision[121] {};
    gbs::DungeonCrawlerRoomData room {};
    room.width_tiles=11; room.height_tiles=11; room.collision_flags=collision;
    project.rooms=&room; project.room_count=1;
    runtime_state.position={5,9};
    draw_presented_dungeon_map();
    overwrite_stack(); // DMA reads the queued pointers after the renderer returns.
    assert(pending_tiles && pending_palette);
    assert(pending_palette[1] == gbs::rgb15(1,4,6));
    assert(pending_tiles[0] == 0x11);
    assert(pending_tiles[32] == 0x22);
    assert(pending_tiles[64] == 0x33);
    assert(pending_tiles[96] == 0x44);
    assert(map_entries[10*32+6] == uint16_t(803+(14<<12)));
    // A different authored palette must replace the old packed color bits.
    uint16_t custom_colors[16] {};
    custom_colors[1]=gbs::rgb15(30,22,7); custom_colors[2]=gbs::rgb15(25,24,20);
    custom_colors[3]=gbs::rgb15(6,10,11); custom_colors[4]=gbs::rgb15(1,4,6);
    gbs::PaletteAsset custom {custom_colors,16,224};
    presentation.hud_palette=&custom;
    draw_presented_dungeon_map(); overwrite_stack();
    assert(pending_tiles[0] == 0x44 && pending_tiles[32] == 0x33);
    assert(pending_tiles[64] == 0x22 && pending_tiles[96] == 0x11);
    // A modular HUD already owns this palette bank; the map must reuse it.
    gbs::DialogueBoxSkin skin {nullptr,custom_colors};
    selected_skin=&skin; presentation.hud_palette=nullptr; pending_palette=nullptr;
    draw_presented_dungeon_map(); overwrite_stack();
    assert(pending_palette==nullptr);
    assert(pending_tiles[0] == 0x44 && pending_tiles[32] == 0x33);
    assert(pending_tiles[64] == 0x22 && pending_tiles[96] == 0x11);
    const uint16_t purple[16]={0,6212,3074,22962,26199,26199};
    skin.palette=purple;
    draw_presented_dungeon_map(); overwrite_stack();
    for(int n=0;n<4;++n)for(int previous=0;previous<n;++previous)
        assert(purple[pending_tiles[n*32]&15] != purple[pending_tiles[previous*32]&15]);
    uint16_t monochrome[16];
    for(auto& color:monochrome)color=gbs::rgb15(4,2,6);
    skin.palette=monochrome;
    draw_presented_dungeon_map(); overwrite_stack();
    for(int n=0;n<4;++n)assert(pending_tiles[n*32]==0x11);
}
'''
        run_cpp(code)

    def test_dungeon_map_close_restores_the_authored_hud(self):
        source = (ROOT / 'templates/exported_dungeon_crawler/main.cpp').read_text()
        update = function(source, 'bool update_dungeon_map(')
        presented = function(update, 'if(dungeon_presentation())')
        code = r'''
#include <cassert>
#include "gbs/engine.hpp"
int hud_color=7, cleared_tiles=0;
namespace gbs {
void render_ui_assets() { hud_color=0; } // Hardware restores the default font color.
bool set_bg_tile(BackgroundLayer, int, int, int, int, uint16_t tile) {
    assert(tile==0); ++cleared_tiles; return true;
}
}
namespace gbastudio_dialogue_ui {
void configure_for_scene(const char* name, bool force=false) {
    assert(name && name[0]=='Q');
    if(force)hud_color=7; // The same scene is cached unless explicitly refreshed.
}
}
enum class DungeonInteractionMode { None, Map };
DungeonInteractionMode interaction_mode=DungeonInteractionMode::Map;
struct Room { int width_tiles=11, height_tiles=11; const char* name="QA"; } room;
struct Project { const Room* rooms=&room; } project;
int current_room_index=0, map_scroll_x=0, map_scroll_y=0;
bool dungeon_presentation() { return true; }
bool update(const gbs::InputState& input) {
''' + presented + r'''
    return false;
}
int main() {
    assert(update({gbs::ButtonStart,gbs::ButtonStart,0}));
    assert(interaction_mode==DungeonInteractionMode::None);
    assert(cleared_tiles==13*13);
    assert(hud_color==7);
}
'''
        run_cpp(code)

    def test_hidden_pause_menu_does_not_erase_dialogue_or_hud(self):
        source = (ROOT / 'examples/topdown_basic/src/main.cpp').read_text()
        start = source.index('        const bool show_debug_overlay = current_input.is_held(gbs::ButtonSelect);')
        end = source.index('        const size_t npc_count = current_npc_count();', start)
        render = source[start:end]
        code = r'''
#include <cassert>
int tiles[32 * 32] = {};
void paint(int x, int y, int w, int h, int value) {
    for (int row=y; row<y+h; ++row) for (int col=x; col<x+w; ++col) tiles[row*32+col]=value;
}
namespace gbs {
enum {ButtonSelect};
struct Menu {bool visible = false;};
struct Dialogue {bool visible = true;};
struct Hud {};
void draw_debug_overlay(bool) {} void hide_all_sprites() {} void clear_event_text() {}
void draw_hud(const Hud&) {paint(15, 6, 2, 2, 3);}
void draw_dialogue(const Dialogue& d) {
    if (d.visible) {paint(1, 6, 9, 8, 1); paint(10, 11, 10, 3, 1); paint(1, 14, 28, 5, 1);}
}
void tick_overlay(int&) {} void draw_overlay(int&) {}
void draw_menu(const Menu& m) {paint(2, 5, 26, 7, m.visible ? 2 : 0);}
}
struct {bool is_held(int) const {return false;}} current_input;
gbs::Menu pause_menu, event_interaction_menu;
gbs::Dialogue dialogue; gbs::Hud hud; int overlay = 0;
struct {bool active = false;} event_interaction;
void render() {
''' + render + r'''
}
int main() {
    render();
    assert(tiles[6*32+2] == 1);  // portrait top border
    assert(tiles[11*32+10] == 1); // speaker label top border
    assert(tiles[6*32+15] == 3);  // HUD outside the dialogue
    pause_menu.visible = true; render();
    assert(tiles[6*32+2] == 2);  // visible menu is on top
    pause_menu.visible = false; render();
    assert(tiles[5*32+20] == 0);  // closing the menu removes its old pixels
    assert(tiles[6*32+2] == 1 && tiles[11*32+10] == 1 && tiles[6*32+15] == 3);
}
'''
        run_cpp(code)

    def test_platformer_hidden_pause_menu_preserves_dialogue(self):
        source = (ROOT / 'examples/platformer_basic/src/main.cpp').read_text()
        start = source.index('        // Clear a closed menu before drawing overlapping dialogue regions.')
        end = source.index('        if (gbs::dialogue_should_show_emote(dialogue))', start)
        render = source[start:end]
        code = r'''
#include <cassert>
int tile = 0;
namespace gbs {
struct Menu {bool visible = false;}; struct Dialogue {bool visible=true;};
void draw_menu(const Menu& m) {tile = m.visible ? 2 : 0;}
void draw_dialogue(const Dialogue& d) {tile = d.visible ? 1 : 0;}
void draw_hud(int) {tile = 3;}
}
gbs::Menu pause_menu; gbs::Dialogue dialogue; int hud=0;
void render() {
''' + render + r'''
}
int main() {
    render(); assert(tile == 1);
    pause_menu.visible = true; render(); assert(tile == 2);
    pause_menu.visible = false; render(); assert(tile == 1);
    dialogue.visible = false; render(); assert(tile == 3);
}
'''
        run_cpp(code)

    def test_platformer_dialogue_portrait_survives_hud_refresh(self):
        source = (ROOT / 'examples/platformer_basic/src/main.cpp').read_text()
        start = source.index('        // Clear a closed menu before drawing overlapping dialogue regions.')
        end = source.index('        gbs::draw_event_clock(event_state);', start)
        render = source[start:end]
        code = r'''
#include <cassert>
bool portrait_drawn = false;
namespace gbs {
struct Vec2i {int x, y;}; struct MetaSprite {};
struct Menu {bool visible = false;}; struct Dialogue {bool visible=true; const char* emote = nullptr; const char* portrait = "portrait";};
constexpr int dialogue_emote_oam_index=123, dialogue_portrait_oam_index=110;
void draw_menu(const Menu&) {} void draw_dialogue(const Dialogue&) {}
bool dialogue_should_show_emote(const Dialogue&) {return false;}
bool dialogue_should_show_portrait(const Dialogue&) {return true;}
const MetaSprite* dialogue_emote_metasprite(const char*) {return nullptr;}
const MetaSprite* dialogue_portrait_metasprite(const char*) {static MetaSprite p; return &p;}
Vec2i dialogue_emote_position_pixels(Vec2i p) {return p;}
Vec2i dialogue_portrait_position_pixels(const Dialogue&) {return {8,48};}
void set_metasprite(int, const MetaSprite&, Vec2i) {portrait_drawn = true;}
void draw_hud(int) {portrait_drawn = false;} // HUD can clear its overlapping OAM slots
}
gbs::Menu pause_menu; gbs::Dialogue dialogue; int hud=0;
struct {struct {int x=0,y=0;} bounds_pixels;} player;
struct {gbs::Vec2i position_pixels{0,0};} camera;
void render() {
''' + render + r'''
}
int main() {render(); assert(portrait_drawn);}
'''
        run_cpp(code)

    def test_platformer_world_sprite_priority_yields_to_dialogue(self):
        source = (ROOT / 'examples/platformer_basic/src/main.cpp').read_text()
        code = r'''
#include <cassert>
#include "gbs/render.hpp"
#include "gbs/assets.hpp"
gbs::Sprite observed {};
namespace gbs {
void set_sprite(int, const Sprite& s) {observed=s;}
}
struct {bool visible=false;} dialogue;
''' + function(source, 'void set_platformer_metasprite(') + r'''
int main() {
    const gbs::MetaSpritePart part {0,0,0,0,false,false};
    const gbs::MetaSprite sprite {&part,1};
    set_platformer_metasprite(0,sprite,{0,0},16,false,false);
    assert(observed.priority == 0);
    dialogue.visible=true;
    set_platformer_metasprite(0,sprite,{0,0},16,false,false);
    assert(observed.priority > 0);
}
'''
        run_cpp(code)

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
                      'engine/src/gbs_link.cpp', 'engine/src/gbs_multiplayer.cpp', 'engine/src/gbs_multiplayer_events.cpp', 'engine/src/rumble.cpp',
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
                               'engine/src/gbs_link.cpp', 'engine/src/gbs_multiplayer.cpp', 'engine/src/gbs_multiplayer_events.cpp', 'engine/src/rumble.cpp',
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
bool menu_scene_has_hud_binding = true;
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
#include <algorithm>
#include <string>
#include <vector>
std::vector<std::string> calls;
int last_clip_top = -1;
namespace gbs {
struct RuntimeFrameContext {};
struct EventState {};
bool render_event_background_scale(const EventState&) {return true;}
struct DialogueState {bool visible=false; int frame_index=0; const char* speaker=nullptr;};
struct DialogueBoxLayout {int x,y,w,h;};
struct DialogueUiConfig {bool name_label_above=true,show_character_name=true;};
struct Vec2i {int x,y;};
DialogueBoxLayout dialogue_box_layout_for_frame(int) {return {1,14,28,5};}
DialogueBoxLayout dialogue_name_label_layout_for_frame(int,int) {return {1,11,8,3};}
DialogueUiConfig ui_config;
const DialogueUiConfig& active_dialogue_ui_config() {return ui_config;}
bool dialogue_should_show_portrait(const DialogueState&) {return false;}
Vec2i dialogue_portrait_position_pixels(const DialogueState&) {return {0,64};}
struct HudState {};
void wait_vblank() {calls.push_back("wait");}
void render_ui_assets() {calls.push_back("restore");}
void draw_dialogue(const DialogueState&) {calls.push_back("dialogue");}
void draw_dialogue_portrait(const DialogueState& d) {assert(d.visible);calls.push_back("portrait");}
void draw_hud(const HudState&) {calls.push_back("hud");}
void draw_hud_excluding(const HudState&, int x, int y, int w, int h) {
    assert(x == 0 && w == 240 && h == 160 - y);
    last_clip_top = y;
    calls.push_back("hud_excluding");
}
struct PaletteAsset {};
void load_palette(const PaletteAsset&,bool){calls.push_back("palette");}
}
gbs::DialogueState dialogue {false}, battle_prompt_dialogue {}, battle_menu_dialogue {};
gbs::HudState battle_hud;
gbs::EventState event_state;
bool battle_ui_restore_pending = true;
bool battle_dialogue_was_drawn = false;
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
        assert((std::find(calls.begin(), calls.end(), "hud_excluding") != calls.end()) == visible);
        const auto portrait = std::find(calls.begin(), calls.end(), "portrait");
        assert((portrait != calls.end()) == visible);
        if (visible) assert(std::find(calls.begin(), calls.end(), "dialogue") < portrait);
        assert(battle_dialogue_was_drawn == visible);
    }
    dialogue.speaker = "Nara";
    gbs::ui_config.name_label_above = true;
    gbs::ui_config.show_character_name = true;
    render_battle_rpg_runtime({});
    assert(last_clip_top == 88);
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
void hide_all_sprites() {}
void hide_hud(int&) {} void draw_hud(int&) {} void draw_dialogue(const DialogueState&) {}
template<class T> bool render_event_background_scale(const T&) {return true;}
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
void refresh_hud() {}
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
