"""Run production damage dispatchers and generated hooks with a fake rumble motor."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(root / 'tools/assetc'))
import assetc


def function(source, signature):
    start = source.index(signature)
    end = source.index('\n}', start) + 2
    return source[start:end]


sources = ['engine/src/gbs_event.cpp', 'engine/src/gbs_dialogue_locale.cpp',
           'engine/src/gbs_runtime.cpp', 'engine/src/gbs_rtc.cpp',
           'engine/src/gbs_link.cpp', 'engine/src/rumble.cpp',
           'engine/src/deferred_work.cpp', 'engine/src/gbs_engine_global.cpp',
           'tests/host/hw_stubs.cpp']
common = '''
#include <cassert>
#include "gbs/rumble.hpp"
#include "gbs/runtime_checkpoint.hpp"
bool motor = false;
int pulses = 0;
bool available(void*) { return true; }
void enabled(void*, bool value) { motor = value; if(value) ++pulses; }
void init_motor() {
    gbs::rumble_init();
    gbs::rumble_set_provider({available, enabled, nullptr});
}
'''

shmup = (root / 'templates/exported_shmup/main.cpp').read_text()
shmup_header = assetc.emit_shmup_project_data_header({
    'enemy_projectile': {'on_hit_player': [{'op': 'set_variable', 'variable': 2, 'value': 7}]},
    'waves': [{'on_hit_player': [{'op': 'rumble_on_for', 'frames': 12},
                                {'op': 'add_variable', 'variable': 0, 'amount': 1}],
               'enemies': [{'on_hit_player': [{'op': 'wait', 'frames': 2},
                                             {'op': 'set_variable', 'variable': 1, 'value': 9},
                                             {'op': 'end'}]}]}]})
shmup_code = common + '''
#include "shmup_project_data.hpp"
const auto& project = gbastudio_shmup_project::project;
gbs::ShmupRuntimeState shmup_state = gbs::shmup_runtime_from_project(project);
gbs::EventState event_state{};
gbs::EventRunner shmup_event_runner{};
int shmup_event_wait_frames = 0;
constexpr int player_hit_invulnerability_frames = 45;
bool player_damaged_this_frame = false;
struct { bool visible = false; } dialogue;
void consume_event_state() {}
void refresh_hud() {}
void persist_shmup_runtime_state() {}
''' + '\n'.join(function(shmup, signature) for signature in (
    'gbs::EventScript checkpoint_script_for(', 'int current_checkpoint_script_index(',
    'void run_shmup_event_script(', 'void damage_player(', 'bool update_shmup_event_script(')) + '''
void finish_script() {
    for(int i=0;i<100 && update_shmup_event_script();++i) {}
    assert(!shmup_event_runner.active);
}
int main() {
    init_motor(); gbs::init_event_state(event_state); shmup_state.lives=2;
    const auto& wave=project.waves[0];
    damage_player(wave.enemies[0].on_hit_player);
    assert(shmup_state.lives==1 && !motor && shmup_event_wait_frames==2);
    assert(current_checkpoint_script_index()==200);
    const auto bookmark=gbs::capture_checkpoint_script(shmup_event_runner,200,event_state);
    gbs::EventRunner restored{};
    assert(gbs::restore_checkpoint_script(bookmark,checkpoint_script_for(0,200),restored));
    assert(restored.command_index==shmup_event_runner.command_index);
    shmup_event_runner=restored;
    damage_player(wave.enemies[0].on_hit_player); // invulnerable contact
    assert(shmup_state.lives==1 && event_state.variables[0]==0);
    finish_script();
    assert(motor && pulses==1 && event_state.variables[0]==1 && event_state.variables[1]==9);
    for(int i=0;i<12;++i)gbs::rumble_update();
    assert(!motor);
    shmup_state.invulnerability_frames_remaining=0;
    damage_player(wave.on_projectile_hit_player); // fatal projectile
    assert(current_checkpoint_script_index()==5);
    finish_script();
    assert(shmup_state.lives==0 && motor && pulses==2);
    assert(event_state.variables[0]==2 && event_state.variables[2]==7);
    shmup_state.invulnerability_frames_remaining=0;
    damage_player(wave.on_projectile_hit_player); finish_script();
    assert(pulses==2 && event_state.variables[0]==2); // already dead
}
'''

battle = (root / 'templates/exported_battle_rpg/main.cpp').read_text()
unit = {'name': 'unit', 'unit': {'max_hp': 20, 'attack': 7, 'defense': 2, 'speed': 5},
        'abilities': [{'kind': 'attack', 'power': 0}]}
battle_header = assetc.emit_battle_rpg_project_data_header({'encounters': [{
    'name': 'arena', 'party': [unit], 'enemies': [unit],
    'config': {'max_party_size': 1, 'max_enemies': 1, 'turn_delay_frames': 1},
    'on_hit_player': [{'op': 'rumble_on_for', 'frames': 12},
                      {'op': 'add_variable', 'variable': 0, 'amount': 1}]}]})
battle_code = common + '''
#include "battle_rpg_project_data.hpp"
const auto& project = gbastudio_battle_rpg_project::project;
int encounter_index=0;
auto state=gbs::make_battle_rpg_runtime_state(project.encounters[0]);
gbs::EventState event_state{};
gbs::EventRunner battle_event_runner{};
int battle_event_wait_frames=0;
bool battle_script_controls_dialogue=false;
void present_battle_action(bool,int,int,gbs::BattleRpgAbilityKind) {}
''' + '\n'.join(function(battle, signature) for signature in (
    'gbs::EventScript checkpoint_script_for(', 'int current_checkpoint_script_index(',
    'bool start_battle_event_script(', 'void tick_battle_turn(')) + '''
void finish_script() {
    while(battle_event_runner.active)gbs::update_event_runner(battle_event_runner,event_state);
}
int main() {
    init_motor(); gbs::init_event_state(event_state);
    tick_battle_turn(); finish_script(); assert(pulses==0);
    state.enemy_turn_pending=true; state.turn_delay_remaining=0;
    tick_battle_turn();
    assert(current_checkpoint_script_index()==4);
    const auto bookmark=gbs::capture_checkpoint_script(battle_event_runner,4,event_state);
    gbs::EventRunner restored{};
    assert(gbs::restore_checkpoint_script(bookmark,checkpoint_script_for(0,4),restored));
    battle_event_runner=restored; finish_script();
    assert(pulses==1 && state.party_hp[0]<20 && event_state.variables[0]==1);
    tick_battle_turn(); finish_script(); assert(pulses==1);
    state.party_hp[0]=1;state.enemy_turn_pending=true;state.turn_delay_remaining=0;
    tick_battle_turn(); finish_script();
    assert(state.outcome==gbs::BattleRpgOutcome::Defeat && pulses==2);
    tick_battle_turn(); finish_script(); assert(pulses==2);
}
'''

with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    for name, header, code, extra in [('shmup', shmup_header, shmup_code, []),
                                      ('battle_rpg', battle_header, battle_code, ['engine/src/gbs_battle_rpg.cpp'])]:
        (directory / f'{name}_project_data.hpp').write_text(header)
        cpp = directory / f'{name}.cpp'
        cpp.write_text(code)
        binary = directory / name
        subprocess.run(['c++', '-std=c++17', '-Wall', '-Wextra', '-Werror',
                        '-I'+str(root/'engine/include'), '-I'+str(directory), str(cpp),
                        *[str(root/s) for s in sources+extra], '-o', str(binary)], check=True)
        subprocess.run([str(binary)], check=True)
print('Player damage: production dispatch, generated hooks, waits, invulnerability, fatal hit and simulated rumble: PASS')
