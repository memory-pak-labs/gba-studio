"""Run the exported battle status producer against selected combatants and live HP."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_battle_rpg/main.cpp').read_text()
start = source.index('void append_hud_number(')
helper = source[start:source.index('\nvoid set_battle_menu_frame(', start)]
prompt_start = source.index('void show_battle_prompt()')
prompt = source[prompt_start:source.index('\nvoid hide_battle_prompt()', prompt_start)]
code = '''#include <cassert>
#include <cstdint>
#include <cstring>
#include "gbs/text.h"
namespace gbs {
enum class HudValueSource { None = -1, P1Health, P2Health };
struct HudLayoutComponent { const char* id; HudValueSource value_source = HudValueSource::None; };
struct HudLayout { const char* id; const HudLayoutComponent* components = nullptr; size_t component_count = 0; };
const HudLayout* current = nullptr;
const HudLayout* active_hud_layout() { return current; }
struct Unit { int max_hp; };
struct Participant { const char* name; Unit unit; };
struct BattleRpgEncounterData { int party_count, enemy_count; Participant party[4], enemies[4]; };
struct HudState { const char* text_slots[8]; size_t text_slot_count; uint32_t hp[2], maximum[2]; };
struct DialogueLine { const char* text; };
struct DialogueState {};
constexpr int dialogue_frame_battle_prompt = 3;
void show_dialogue(DialogueState&, const DialogueLine*, int, int) {}
void set_dialogue_frame(DialogueState&, int frame) { assert(frame==3); }
void set_hud_text_slots(HudState& hud, const char* const* text, size_t count) {
    hud.text_slot_count = count; for(size_t i=0;i<count;++i) hud.text_slots[i]=text[i];
}
void set_hud_value(HudState& hud, HudValueSource source, uint32_t value, uint32_t maximum) {
    hud.hp[static_cast<int>(source)]=value; hud.maximum[static_cast<int>(source)]=maximum;
}
}
struct { gbs::BattleRpgEncounterData encounters[1]; } project;
int encounter_index = 0;
struct { int party_hp[4], enemy_hp[4], selected_party, selected_enemy; } state;
gbs::HudState battle_hud {};
char battle_party_hud_text[48], battle_enemy_hud_text[48], battle_enemy_hp_hud_text[16], battle_party_hp_hud_text[16];
char battle_prompt_text[96];
gbs::DialogueState battle_prompt_dialogue;
gbs::DialogueLine battle_prompt_line { battle_prompt_text };
''' + helper + prompt + '''
int main() {
    auto& encounter = project.encounters[0]; encounter.party_count = encounter.enemy_count = 2;
    encounter.party[0] = {"NARA", {24}}; encounter.party[1] = {"MATEUS", {999}};
    encounter.enemies[0] = {"ENEMY", {12}}; encounter.enemies[1] = {"DRAGON", {999}};
    state.party_hp[0]=24; state.party_hp[1]=999; state.enemy_hp[0]=12; state.enemy_hp[1]=0;
    const gbs::HudLayoutComponent components[] = {{"battle-party-name"}, {"battle-enemy-name"}};
    gbs::HudLayout compact {"personalized-hud", components, 2}; gbs::current = &compact;
    update_battle_hud();
    assert(battle_hud.text_slot_count == 4);
    assert(std::strcmp(battle_hud.text_slots[0],"NARA") == 0);
    assert(std::strcmp(battle_hud.text_slots[1],"ENEMY") == 0);
    assert(std::strcmp(battle_hud.text_slots[2],"24") == 0);
    assert(std::strcmp(battle_hud.text_slots[3],"12") == 0);
    assert(battle_hud.hp[0]==24 && battle_hud.maximum[0]==24);
    assert(battle_hud.hp[1]==12 && battle_hud.maximum[1]==12);
    state.party_hp[0]=6; update_battle_hud(); assert(battle_hud.hp[0]==6);
    state.selected_party=state.selected_enemy=1; update_battle_hud();
    assert(std::strcmp(battle_hud.text_slots[0],"MATEUS") == 0);
    assert(std::strcmp(battle_hud.text_slots[1],"DRAGON") == 0);
    assert(std::strcmp(battle_hud.text_slots[2],"999") == 0);
    assert(std::strcmp(battle_hud.text_slots[3],"0") == 0);
    assert(battle_hud.hp[1]==0 && battle_hud.maximum[1]==999);
    show_battle_prompt(); assert(std::strcmp(battle_prompt_line.text,"O QUE FARA\\nMATEUS?")==0);
    state.selected_party=state.selected_enemy=-1; update_battle_hud();
    assert(std::strcmp(battle_hud.text_slots[0],"NARA") == 0);
    gbs::current=nullptr; update_battle_hud();
    assert(battle_hud.text_slot_count==3);
    assert(std::strcmp(battle_hud.text_slots[0],"NARA 6/24")==0);
    assert(std::strcmp(battle_hud.text_slots[2],"12/12")==0);
    gbs::current=&compact; encounter.party_count=encounter.enemy_count=0; update_battle_hud();
    assert(battle_hud.text_slots[0][0]=='\\0' && battle_hud.text_slots[1][0]=='\\0');
    assert(battle_hud.text_slots[2][0]=='\\0' && battle_hud.text_slots[3][0]=='\\0');
    assert(battle_hud.hp[0]==0 && battle_hud.hp[1]==0);
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    (directory / 'test.cpp').write_text(code)
    subprocess.run(['c++', '-std=c++17', '-I'+str(root/'engine/include'), '-x','c++', str(directory / 'test.cpp'), str(root/'engine/src/gbs_text.c'), '-o', str(directory / 'test')], check=True)
    subprocess.run([str(directory / 'test')], check=True)
print('Battle status names, selected combatants, live/zero HP and legacy text: PASS')
