"""Execute authored/legacy meter paths; do not paint BG bars over an image HUD."""
from pathlib import Path
import subprocess
import tempfile
root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_battle_rpg/main.cpp').read_text()
start = source.index('void draw_battle_meters(')
helper = source[start:source.index('\nvoid draw_battle()', start)]
code = '''#include <cassert>
#include <cstdint>
#include <cstring>
namespace gbs {
enum class BackgroundLayer { BG0 };
enum class HudValueSource { None = -1, P1Health, P2Health };
struct HudLayoutComponent { HudValueSource value_source; };
struct HudLayout { const char* id; const HudLayoutComponent* components = nullptr; size_t component_count = 0; };
const HudLayout* current = nullptr;
const HudLayout* active_hud_layout() { return current; }
struct Unit { int max_hp; };
struct Participant { Unit unit; };
struct BattleRpgEncounterData { int party_count, enemy_count; Participant party[4], enemies[4]; };
int painted = 0;
void set_bg_tile(BackgroundLayer, int, int, int, int, uint16_t tile) { if(tile) ++painted; }
}
struct { int party_hp[4], enemy_hp[4], selected_party, selected_ally, selected_enemy; } state;
int cleared = 0;
void clear_battle_meter_tiles(int, int, int) { ++cleared; }
''' + helper + '''
int main() {
    gbs::BattleRpgEncounterData encounter {}; encounter.party_count = 1; encounter.enemy_count = 1;
    encounter.party[0].unit.max_hp = 10; encounter.enemies[0].unit.max_hp = 10;
    state.party_hp[0] = state.enemy_hp[0] = 5;
    gbs::HudLayout approved { "hud-neutral-batalha-rpg" }; gbs::current = &approved;
    draw_battle_meters(encounter); assert(cleared == 0); assert(gbs::painted == 0);
    gbs::current = nullptr; draw_battle_meters(encounter); assert(gbs::painted > 0);
    gbs::painted = 0; gbs::HudLayout legacy { "hud-default" }; gbs::current = &legacy;
    draw_battle_meters(encounter); assert(gbs::painted > 0);
    gbs::painted = 0;
    const gbs::HudLayoutComponent meters[] = {{gbs::HudValueSource::P1Health}, {gbs::HudValueSource::P2Health}};
    gbs::HudLayout customized { "personalized", meters, 2 }; gbs::current = &customized;
    cleared = 0;
    draw_battle_meters(encounter); assert(cleared == 0); assert(gbs::painted == 0);
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    (directory / 'test.cpp').write_text(code)
    subprocess.run(['c++', '-std=c++17', str(directory / 'test.cpp'), '-o', str(directory / 'test')], check=True)
    subprocess.run([str(directory / 'test')], check=True)
print('Battle meters respect authored HUDs and preserve legacy mode: PASS')
