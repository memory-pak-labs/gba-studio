#!/usr/bin/env python3
"""Compile the actual tactical controller with hardware audio stubbed out."""
from pathlib import Path
import os
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'examples/isometric_basic/src/main.cpp').read_text()
assert source.index('gbs::draw_hud(hud);') < source.index('gbs::draw_dialogue(dialogue);'), 'scene HUD must render below dialogue'
assert 'configure_isometric_hud(project.rooms[current_room].name);' in source

def block(marker, suffix=''):
    start = source.index(marker)
    brace = source.index('{', start)
    depth = 1
    end = brace + 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end] + suffix + '\n'

code = '''
#include <cassert>
#include <cstring>
#include <cstddef>
#include <string>
#include <vector>
#include "gbs/isometric.hpp"
#include "gbs/input.hpp"
constexpr size_t max_actor_count = gbs::max_isometric_save_actors;
constexpr size_t no_tactical_unit_index = static_cast<size_t>(-1);
template<typename... T> void play_iso_tactical_sfx(T...) {}
template<typename... T> void schedule_iso_tactical_sfx(T...) {}
uint8_t test_locale = 1;
std::vector<std::string> hud_lines;
namespace gbs {
uint8_t active_dialogue_locale_id() { return test_locale; }
void draw_text_overlay_slot(int x, int y, int width, const char* text, int offset, bool visible) {
    assert(offset >= 0 && offset + width <= 32);
    assert(x >= 0 && x + width <= 32 && y >= 0 && y < 20);
    if (visible) { assert(std::strlen(text) <= static_cast<size_t>(width)); hud_lines.emplace_back(text); }
}
}
'''
for name in ['struct IsoTacticalRuntimeUnit', 'struct IsoTacticalCursorInput',
             'struct IsoTacticalCursorVisual', 'struct IsoTacticalRuntimeState',
             'enum IsoTacticalOutcome', 'enum IsoTacticalFeedbackKind']:
    code += block(name, ';')
for name in ['void set_iso_tactical_feedback(', 'void face_iso_actor_toward(',
             'void initialize_iso_tactical_facing(',
             'size_t first_iso_tactical_unit_for_team(', 'void advance_iso_tactical_turn(',
             'void tick_iso_tactical_move(', 'bool has_iso_tactical_unit_for_team(',
             'size_t iso_tactical_unit_for_actor(', 'const char* iso_tactical_phase_label(',
             'void handle_iso_tactical_action(', 'void tick_iso_tactical_enemy(']:
    code += block(name)
code += block('void draw_iso_tactical_hud_status(')
code += block('struct IsometricTacticalSaveData', ';')
code += 'IsoTacticalRuntimeState tactical_state {};\n'
code += block('IsometricTacticalSaveData capture_tactical_save(')
code += block('void apply_tactical_save(')
code += block('void set_iso_entry_position(')
code += block('void initialize_iso_tactical_cursor(')
code += block('void move_iso_tactical_cursor(')
assert source.count('initialize_iso_tactical_cursor(tactical_state, actors, actor_count, cursor);') == 2, 'direct start and room transition must activate the tactical cursor'
entry = source[source.index('int initialize_isometric_runtime('):source.index('gbs::RuntimeAdapterFrameResult update_isometric_runtime(')]
assert 'initialize_iso_tactical_facing(tactical_state, actors, actor_animation_states, actor_count);' in entry, 'direct boot must face the opposing units after loading actors'
code += '''
int main() {
    // ICT1 binary offsets must remain readable after adding move/action phases.
    static_assert(sizeof(IsometricTacticalSaveData) == 148);
    static_assert(offsetof(IsometricTacticalSaveData, hp) == 11);
    uint8_t flags[18] {};
    gbs::IsoTileMap map {flags, 6, 3};
    gbs::IsoActor actors[2] {};
    actors[0].visible = actors[1].visible = true;
    actors[0].tile = {1,1,0}; actors[1].tile = {5,1,0};
    IsoTacticalRuntimeState s {};
    s.enabled = true; s.active_unit_index = 0;
    assert(std::strcmp(iso_tactical_phase_label(s,1),"SUA VEZ") == 0);
    assert(std::strcmp(iso_tactical_phase_label(s,2),"YOUR TURN") == 0);
    assert(std::strcmp(iso_tactical_phase_label(s,3),"TU TURNO") == 0);
    s.units[0] = {true,0,0,2,1,5,5,2};
    s.units[1] = {true,1,1,2,1,4,4,1};
    gbs::IsoActorAnimationState facing[2] {};
    initialize_iso_tactical_facing(s, actors, facing, 2);
    assert(facing[0].direction == gbs::IsoActorDirection::Right);
    assert(facing[1].direction == gbs::IsoActorDirection::Down);
    s.enabled = false;
    actors[1].tile = {0,1,0};
    initialize_iso_tactical_facing(s, actors, facing, 2);
    assert(facing[0].direction == gbs::IsoActorDirection::Right); // Exploration is unaffected.
    s.enabled = true; actors[1].tile = {5,1,0};
    gbs::IsoCursorState cursor {{1,1,0},true};
    // A campaign transition must activate the tactical cursor just like a direct launch.
    cursor.active = false;
    initialize_iso_tactical_cursor(s,actors,2,cursor);
    assert(cursor.active && cursor.tile.x == 1 && cursor.tile.y == 1);
    // A return warp lands on the authored deck, not on the room's original Z0 spawn.
    gbs::IsometricRoomData elevated {};
    uint8_t heights[18] {}; heights[8] = 2;
    elevated.width_tiles = 6; elevated.height_tiles = 3; elevated.height_levels = heights;
    auto arriving = actors[0];
    set_iso_entry_position(arriving,elevated,2,1);
    assert(arriving.tile.x == 2 && arriving.tile.y == 1 && arriving.tile.z == 2);
    gbs::IsometricRoomData fixed {};
    uint8_t fixed_flags[96] {}; fixed.collision_flags=fixed_flags;
    fixed.width_tiles=12; fixed.height_tiles=8; fixed.world_mode=gbs::IsoWorldMode::StaticComposition;
    fixed.grid={32,16,{128,15},8};
    gbs::IsoCamera camera {};
    gbs::IsoCursorState edge {{7,1,0},true};
    move_iso_tactical_cursor(fixed,camera,edge,{1,0});
    assert(edge.tile.x==7); // The next diamond would extend beyond the fixed screen.
    move_iso_tactical_cursor(fixed,camera,edge,{-1,0});
    assert(edge.tile.x==6);
    const gbs::InputState a {gbs::ButtonA,gbs::ButtonA,0};
    const gbs::InputState b {gbs::ButtonB,gbs::ButtonB,0};
    const gbs::InputState end {gbs::ButtonSelect,gbs::ButtonSelect,0};
    const gbs::InputState right {gbs::ButtonRight,gbs::ButtonRight,0};
    const gbs::InputState left {gbs::ButtonLeft,gbs::ButtonLeft,0};
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,b,nullptr);
    assert(s.turn_number == 1); // Cancel must never spend a turn.
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(s.menu_open && s.menu_index == 0); // Selecting a unit exposes actions.
    for (test_locale = 1; test_locale <= 3; ++test_locale) {
        hud_lines.clear(); draw_iso_tactical_hud_status(s);
        assert(hud_lines.size() == 2 && hud_lines[0][0] == '!');
        assert(hud_lines[0].find(test_locale == 2 ? "ATTACK" : "ATACAR") != std::string::npos);
        assert(hud_lines[1] == "N5/5 S4/4");
    }
    test_locale = 1;
    const auto menu_cursor = cursor.tile;
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,right,nullptr);
    assert(s.menu_index == 1 && cursor.tile.x == menu_cursor.x);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(s.menu_open && s.message == 1 && s.active_team == 0); // No target: explain, do not spend turn.
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,left,nullptr);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(!s.menu_open && !s.attack_mode);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,b,nullptr);
    assert(s.menu_open && !s.moved_this_turn); // Cancel movement returns to commands.
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    cursor.tile = {2,1,0};
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    for(int frame=0;frame<30;++frame) tick_iso_tactical_move(s,actors,nullptr,2,map,nullptr);
    assert(actors[0].tile.x == 2 && s.active_team == 0 && s.moved_this_turn);
    assert(s.menu_open && s.menu_index == 1); // Moving returns to actions, default Attack.
    tactical_state = s;
    const auto saved = capture_tactical_save(actors,2);
    tactical_state = IsoTacticalRuntimeState{};
    apply_tactical_save(saved,actors,2);
    assert(tactical_state.moved_this_turn && tactical_state.selected == s.selected && tactical_state.menu_open && tactical_state.menu_index == 1);
    auto legacy = saved;
    legacy.selected = 1; // Old ICT1 used only a boolean in this byte.
    apply_tactical_save(legacy,actors,2);
    assert(tactical_state.selected && !tactical_state.moved_this_turn);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,left,nullptr);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(s.menu_open && s.message == 2); // Used movement is explicitly unavailable.
    cursor.tile = {3,1,0};
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(!s.moving); // A second move cannot bypass the movement allowance.
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,right,nullptr);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,right,nullptr);
    assert(s.menu_index == 2);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr); // Esperar actually ends turn.
    assert(s.active_team == 1);
    for(int frame=0;frame<200 && s.active_team==1;++frame) {
        tick_iso_tactical_move(s,actors,nullptr,2,map,nullptr);
        tick_iso_tactical_enemy(s,cursor,actors,nullptr,2,map,nullptr);
    }
    assert(s.active_team == 0 && s.turn_number == 3);
    assert(s.units[0].hp == 4); // Enemy moves and attacks without user input.
    assert(actors[1].tile.x == 3 && actors[1].tile.y == 1);
    assert(cursor.tile.x == actors[0].tile.x && cursor.tile.y == actors[0].tile.y);
    // A defeated unit ends combat rather than starting another enemy turn.
    s.units[1].hp = 2;
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(s.menu_open);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,right,nullptr);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(s.attack_mode && !s.menu_open && cursor.tile.x == actors[1].tile.x);
    cursor.tile = {2,2,0};
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(s.message == 3 && !s.moving && s.active_team == 0 && s.units[1].hp == 2);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,b,nullptr);
    assert(s.menu_open && s.active_team == 0);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    cursor.tile = actors[1].tile;
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,map,a,nullptr);
    assert(s.outcome == IsoTacticalOutcomeVictory && s.units[1].hp == 0);
    // Both actors occupy the two ends of a stair: neither can move through
    // the other, so melee must remain possible across this traversable edge.
    uint8_t stair_flags[2] {}, stair_heights[2] {0,1}, stair_ramps[2] {0,2};
    gbs::IsoTileMap stairs {stair_flags,2,1,stair_heights,stair_ramps};
    actors[0].tile={0,0,0}; actors[1].tile={1,0,1};
    s=IsoTacticalRuntimeState{}; s.enabled=true; s.active_unit_index=0;
    s.units[0]={true,0,0,2,1,5,5,2}; s.units[1]={true,1,1,2,1,2,2,1};
    cursor.tile=actors[0].tile;
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,stairs,a,nullptr);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,stairs,right,nullptr);
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,stairs,a,nullptr);
    cursor.tile=actors[1].tile;
    handle_iso_tactical_action(s,cursor,actors,nullptr,2,stairs,a,nullptr);
    assert(s.outcome == IsoTacticalOutcomeVictory);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-iso-turns-') as tmp:
    cpp = Path(tmp) / 'turns.cpp'; exe = Path(tmp) / 'turns'
    cpp.write_text(code)
    subprocess.run([os.environ.get('HOST_CXX', 'clang++'),'-std=c++17','-O2','-ffunction-sections','-fdata-sections',
                    '-I'+str(root/'engine/include'),str(cpp),
                    str(root/'engine/src/gbs_isometric.cpp'),
                    '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections','-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
print('isometric turn flow: PASS (menu, no target, move/attack/wait, cancel, save, 32 HUD slots, PT/EN/ES, enemy, victory)')
