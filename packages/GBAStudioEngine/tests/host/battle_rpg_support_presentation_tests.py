"""Exercise the production template's support targeting, without GBA hardware."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_battle_rpg/main.cpp').read_text()
start = source.index('void present_battle_action(')
helper = source[start:source.index('\nvoid update_battle_presentation()', start)]
code = '''#include <cassert>
namespace gbs {
enum class BattleRpgAbilityKind { Attack,Magic,Heal,Defend };
struct Vec2i { int x,y; };
struct Animation {};
struct AnimationSet { const Animation* hurt=nullptr; };
struct Visual {};
struct Ability { BattleRpgAbilityKind kind; };
struct Participant { const AnimationSet* animation_set=nullptr; Ability abilities[2]; bool use_authored_position=true; Vec2i position; };
struct Presentation { const Animation* effects[4]; };
struct BattleRpgEncounterData { Participant party[4],enemies[8]; int party_count=2,enemy_count=1; Presentation* presentation; };
const Animation* played=nullptr;
int hurts=0;
void play_battle_rpg_action(Visual&,const AnimationSet&,BattleRpgAbilityKind) {}
void play_battle_rpg_pose(Visual&,const Animation*) { ++hurts; }
void play_sprite_animation(int&,const Animation& animation) { played=&animation; }
template<class State> bool use_selected_battle_ability(State&,const BattleRpgEncounterData&) { return true; }
}
struct { gbs::BattleRpgEncounterData encounters[1]; } project;
struct { int selected_party=1,selected_enemy=0,selected_ally=0,selected_ability=0; } state;
int encounter_index=0,effect_animator=0,hurt_sound_delay=0,cue=-1;
gbs::Visual party_visuals[4],enemy_visuals[8];
gbs::Vec2i effect_position{};
void battle_sound(int value) { cue=value; }
''' + helper + '''
int main() {
    gbs::Animation fx[4];gbs::AnimationSet clips{};
    gbs::Presentation presentation{{&fx[0],&fx[1],&fx[2],&fx[3]}};
    auto& e=project.encounters[0];e.presentation=&presentation;
    e.party[0].position={56,112};e.party[1].position={104,88};
    e.party[0].animation_set=e.party[1].animation_set=e.enemies[0].animation_set=&clips;
    e.party[1].abilities[0].kind=gbs::BattleRpgAbilityKind::Heal;
    e.party[1].abilities[1].kind=gbs::BattleRpgAbilityKind::Defend;
    assert(use_presented_battle_ability(e));
    assert(effect_position.x==56 && effect_position.y==84);
    assert(cue==5 && gbs::played==&fx[2] && gbs::hurts==0);
    state.selected_ally=1;assert(use_presented_battle_ability(e));
    assert(effect_position.x==104 && effect_position.y==60);
    state.selected_ability=1;assert(use_presented_battle_ability(e));
    assert(effect_position.x==104 && effect_position.y==60);
    present_battle_action(false,0,0,gbs::BattleRpgAbilityKind::Attack);
    assert(effect_position.x==180 && effect_position.y==86 && cue==2 && gbs::played==&fx[0]);
    present_battle_action(false,0,0,gbs::BattleRpgAbilityKind::Magic);
    assert(effect_position.x==182 && effect_position.y==82 && cue==3 && gbs::played==&fx[1]);
    present_battle_action(true,0,0,gbs::BattleRpgAbilityKind::Defend);
    assert(effect_position.x==166 && effect_position.y==81);
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    (directory / 'test.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17',str(directory/'test.cpp'),'-o',str(directory/'test')],check=True)
    subprocess.run([str(directory/'test')],check=True)
print('Battle support targets, effects, sound and approved offensive presentation: PASS')
