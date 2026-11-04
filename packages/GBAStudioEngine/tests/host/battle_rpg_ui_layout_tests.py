"""Run real battle drawing and menu producers against editable HUD compositions."""
from pathlib import Path
import re
import unittest

from runtime_frame_boundary_tests import function, run_cpp

ROOT = Path(__file__).resolve().parents[2]
SOURCE = (ROOT / 'templates/exported_battle_rpg/main.cpp').read_text()


def optional_helpers(*markers):
    return ''.join(function(SOURCE[SOURCE.rindex(marker):], marker) for marker in markers if marker in SOURCE)


LABEL_HELPERS = optional_helpers('void append_battle_label(', 'void format_battle_participant_choice(')
CHOICES = '\n'.join(re.findall(
    r'^(?:gbs::DialogueChoice|char) battle_(?:party|target)_(?:choices|labels)[^;]*;', SOURCE, re.M))
LABEL_FIXTURE = r'''
#include <cassert>
#include <cstring>
#include <string>
#include "gbs/battle_rpg.hpp"
#include "gbs/text.h"
''' + CHOICES + LABEL_HELPERS


class BattleUiLayoutTests(unittest.TestCase):
    def test_rosters_have_distinct_prefixes_aliases_and_eight_enemy_slots(self):
        code = LABEL_FIXTURE + function(SOURCE, 'void prepare_battle_party_choices(') + function(
            SOURCE, 'void prepare_battle_target_choices(') + r'''
int main() {
    assert(sizeof(battle_target_choices)/sizeof(battle_target_choices[0]) >= gbs::BattleRpgMaxEnemies);
    gbs::BattleRpgParticipantData party[2] {}, enemies[gbs::BattleRpgMaxEnemies] {};
    party[0].name="Actor 8"; party[1].name="Actor 8 copy";
    for(auto& enemy:enemies)enemy.name="Guard with a long repeated name";
    gbs::BattleRpgEncounterData encounter {};
    encounter.party=party;encounter.party_count=2;encounter.enemies=enemies;encounter.enemy_count=gbs::BattleRpgMaxEnemies;
    prepare_battle_party_choices(encounter);
    assert(std::string(battle_party_choices[0].text).rfind("1 Actor 8",0)==0);
    assert(std::string(battle_party_choices[1].text).rfind("2 Actor 8 copy",0)==0);
    assert(battle_party_choices[1].result_value==1);
    party[0].hud_label="Árvore";
    prepare_battle_target_choices(encounter,true);
    assert(std::strcmp(battle_target_choices[0].text,"1 Árvore")==0);
    prepare_battle_target_choices(encounter,false);
    for(int i=0;i<gbs::BattleRpgMaxEnemies;++i) {
        assert(battle_target_choices[i].text[0]=='1'+i);
        assert(battle_target_choices[i].result_value==i);
    }
    encounter.party_count=1;prepare_battle_party_choices(encounter);
    assert(std::strcmp(battle_party_choices[0].text,"Árvore")==0);
}
'''
        run_cpp(code, ['engine/src/gbs_text.c'])

    def test_authored_target_rows_keep_the_correct_side_utf8_and_visible_page(self):
        update = function(SOURCE, 'void update_battle_hud()')
        start = update.index('        const bool root=')
        rows = update[start:update.index('        const char* slots[]', start)]
        code = LABEL_FIXTURE + r'''
enum class BattleMenuPage {Root,Notice,Party,Targets};
BattleMenuPage battle_menu_page=BattleMenuPage::Targets;
bool battle_menu_target_is_ally=true;
gbs::DialogueChoice battle_root_choices[4] {};
gbs::DialogueState battle_menu_dialogue {};
char authored_commands[128] {};
void build_rows(const gbs::BattleRpgEncounterData& encounter) {
    authored_commands[0]='\0';
''' + rows + r'''
}
int main() {
    gbs::BattleRpgParticipantData party[2] {}, enemies[8] {};
    for(auto& enemy:enemies)enemy.hud_label="WRONG SIDE";
    gbs::BattleRpgEncounterData encounter {};
    encounter.party=party;encounter.party_count=2;encounter.enemies=enemies;encounter.enemy_count=8;
    gbs::DialogueChoice choices[8] {};
    choices[0]={"1 Árvore comprida",0};choices[1]={"2 Árvore comprida",1};
    choices[4]={"5 Coração",4};choices[5]={"6 Coração",5};choices[6]={"7 Coração",6};choices[7]={"8 Coração",7};
    battle_menu_dialogue.visible=true;battle_menu_dialogue.choices=choices;battle_menu_dialogue.choice_count=2;
    build_rows(encounter);
    assert(std::strcmp(authored_commands,"1 Árvor\n2 Árvor")==0); // Seven glyphs, never seven UTF-8 bytes.
    battle_menu_target_is_ally=false;battle_menu_dialogue.choice_count=8;battle_menu_dialogue.selected_choice=7;
    build_rows(encounter);
    assert(std::strcmp(authored_commands,"5 Coraç\n6 Coraç\n7 Coraç\n8 Coraç")==0);
}
'''
        run_cpp(code, ['engine/src/gbs_text.c'])

    def test_automatic_formations_avoid_status_panels_and_preserve_authored_positions(self):
        helpers = optional_helpers('bool battle_has_status_hud()', 'gbs::Vec2i battle_participant_position(')
        code = r'''
#include <cassert>
#include <vector>
#include "gbs/battle_rpg.hpp"
#include "gbs/event_render.hpp"
#include "gbs/ui.hpp"
struct Visual {int animator=0,loaded_tiles=0;};
struct Effect {bool playing=false;} effect_animator;
int effect_loaded_tiles=0,hurt_sound_delay=0;
gbs::Vec2i effect_position {};
Visual party_visuals[4],enemy_visuals[8];
gbs::BattleRpgRuntimeState state {};
gbs::EventState event_state {};
gbs::BattleRpgProjectData project {};
int encounter_index=0;
gbs::HudLayout* selected_layout=nullptr;
gbs::DialogueState dialogue {},battle_menu_dialogue {};
enum class BattleMenuPage {Root,Notice,Targets};
BattleMenuPage battle_menu_page=BattleMenuPage::Root;
std::vector<gbs::Vec2i> positions;
gbs::Vec2i cursor_position {};
namespace gbs {
const HudLayout* active_hud_layout(){return selected_layout;}
void sync_sprite_animation_tiles(int&,int&){}
void sync_sprite_animation_tiles(Effect&,int&){}
const MetaSprite* current_metasprite(int){return nullptr;}
const MetaSprite* current_metasprite(Effect&){return nullptr;}
void hide_sprites(int,int){}
bool set_affine_sprite_transform(uint8_t,const AffineSpriteTransform&){return true;}
void set_metasprite(int i,const MetaSprite&,Vec2i p){if(i==86)cursor_position=p;}
template<class T>void play_battle_rpg_action(Visual&,const T&,BattleRpgAbilityKind){}
template<class T>void play_battle_rpg_pose(Visual&,const T*){}
template<class T>void play_sprite_animation(Effect&,const T&){}
}
void battle_sound(int){}
void draw_battle_meters(const gbs::BattleRpgEncounterData&){}
void draw_battle_participant_metasprite(int,const gbs::MetaSprite&,gbs::Vec2i position,uint8_t){positions.push_back(position);}
''' + helpers + function(SOURCE, 'void present_battle_action(') + function(SOURCE, 'void draw_battle()') + r'''
bool intersects(gbs::Vec2i p,int x,int y,int w,int h) {
    return p.x<x+w && p.x+32>x && p.y<y+h && p.y+32>y;
}
int main(){
    const gbs::MetaSpritePart parts[]={{0,0,0,0,false,false,32,32}};
    const gbs::MetaSprite sprite {parts,1};
    gbs::BattleRpgParticipantData party[4] {},enemies[8] {};
    for(auto& p:party)p.metasprite=&sprite;
    for(auto& p:enemies)p.metasprite=&sprite;
    gbs::BattleRpgEncounterData encounter {};encounter.party=party;encounter.enemies=enemies;
    project.encounters=&encounter;project.encounter_count=1;
    gbs::HudLayoutComponent components[2] {};
    components[0].value_source=gbs::HudValueSource::P1Health;components[1].value_source=gbs::HudValueSource::P2Health;
    gbs::HudLayout hud {"editable-copied-hud","advanced",components,2};selected_layout=&hud;
    gbs::BattleRpgPresentationData presentation {};encounter.presentation=&presentation;
    for(auto& hp:state.party_hp)hp=10;for(auto& hp:state.enemy_hp)hp=10;
    for(int count=1;count<=8;++count){
        encounter.party_count=count>4?4:count;encounter.enemy_count=count;positions.clear();draw_battle();
        assert(positions.size()==static_cast<size_t>(encounter.party_count+encounter.enemy_count));
        for(auto p:positions){
            assert(p.x>=0 && p.y>=0 && p.x+32<=240 && p.y+32<=120);
            assert(!intersects(p,8,72,104,32));assert(!intersects(p,128,8,104,32));
        }
        present_battle_action(false,0,encounter.party_count-1,gbs::BattleRpgAbilityKind::Heal);
        const auto ally=positions[encounter.party_count-1];
        assert(effect_position.x==ally.x+16 && effect_position.y==ally.y+16);
        present_battle_action(false,0,count-1,gbs::BattleRpgAbilityKind::Attack);
        const auto target=positions[encounter.party_count+count-1];
        assert(effect_position.x==target.x+16 && effect_position.y==target.y+16);
    }
    encounter.party_count=encounter.enemy_count=1;
    party[0].use_authored_position=true;party[0].position={13,17};enemies[0].use_authored_position=true;enemies[0].position={99,111};
    positions.clear();draw_battle();assert(positions[0].x==13 && positions[0].y==17);assert(positions[1].x==99 && positions[1].y==111);
    party[0].use_authored_position=enemies[0].use_authored_position=false;selected_layout=nullptr;
    positions.clear();draw_battle();assert(positions[0].x==48 && positions[0].y==32);assert(positions[1].x==176 && positions[1].y==24);
    presentation.cursor=&sprite;encounter.config.escape_enabled=true;
    battle_menu_dialogue.visible=true;battle_menu_dialogue.selected_choice=7;battle_menu_page=BattleMenuPage::Targets;
    draw_battle();assert(cursor_position.y==148);
}
'''
        run_cpp(code)


if __name__ == '__main__':
    unittest.main()
