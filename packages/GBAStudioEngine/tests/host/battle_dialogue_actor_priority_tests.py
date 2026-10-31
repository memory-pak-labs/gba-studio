"""Check the real actor draw path keeps dialogue labels above combatants."""
from pathlib import Path
import subprocess
import tempfile

root=Path(__file__).resolve().parents[2]
source=(root/'templates/exported_battle_rpg/main.cpp').read_text()
start=source.index('void draw_battle_participant_metasprite(')
draw=source[start:source.index('\nvoid draw_battle_meters(', start)]
code=r'''
#include <cassert>
#include "gbs/dialogue.hpp"
#include "gbs/render.hpp"
gbs::DialogueState dialogue {};
int observed_priority=-1;
namespace gbs {
void set_sprite(int, const Sprite& sprite) { observed_priority=sprite.priority; }
void set_metasprite(int, const MetaSprite&, Vec2i) { observed_priority=0; }
}
''' + draw + r'''
int main() {
  const gbs::MetaSpritePart parts[]={{0,0,0,0,false,false,16,16}};
  const gbs::MetaSprite sprite {parts,1};
  dialogue.visible=false;
  draw_battle_participant_metasprite(0,sprite,{32,32},1);
  assert(observed_priority==1);
  dialogue.visible=true;
  draw_battle_participant_metasprite(0,sprite,{32,32},1);
  assert(observed_priority==1);
  draw_battle_participant_metasprite(0,sprite,{32,32},2);
  assert(observed_priority==1);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-battle-priority-') as directory:
    temp=Path(directory)
    (temp/'test.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(temp/'test.cpp'),'-o',str(temp/'test')],check=True)
    subprocess.run([str(temp/'test')],check=True)
print('Combatants stay behind HUD and dialogue at both sprite scales: PASS')
