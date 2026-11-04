"""Check the real actor draw path keeps HUD and dialogue above combatants."""
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
gbs::Sprite observed {};
namespace gbs {
void set_sprite(int, const Sprite& sprite) { observed_priority=sprite.priority; observed=sprite; }
void set_metasprite(int, const MetaSprite&, Vec2i) { observed_priority=0; }
}
''' + draw + r'''
int main() {
  const gbs::MetaSpritePart parts[]={{2,3,7,2,true,false,16,16}};
  const gbs::MetaSprite sprite {parts,1};
  dialogue.visible=false;
  draw_battle_participant_metasprite(0,sprite,{32,32},1);
  assert(observed_priority==1); // HUD frames stay above idle combatants too.
  assert(observed.x==34 && observed.y==35 && observed.tile_index==7 && observed.palette==2);
  assert(observed.hflip && observed.width==16 && observed.height==16 && !observed.affine);
  draw_battle_participant_metasprite(0,sprite,{32,32},2);
  assert(observed_priority==1 && observed.affine && observed.double_size);
  dialogue.visible=true;
  draw_battle_participant_metasprite(0,sprite,{32,32},1);
  assert(observed_priority==1);
  draw_battle_participant_metasprite(0,sprite,{32,32},2);
  assert(observed_priority==1);
  const gbs::MetaSpritePart wide[]={{1,2,9,3,false,true,64,32,gbs::ColorDepth::Bpp8}};
  const gbs::MetaSprite fallback {wide,1};
  dialogue.visible=false;
  draw_battle_participant_metasprite(0,fallback,{12,20},2);
  assert(observed_priority==1 && !observed.affine && observed.width==64 && observed.height==32);
  assert(observed.x==13 && observed.y==22 && observed.vflip && observed.color_depth==gbs::ColorDepth::Bpp8);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-battle-priority-') as directory:
    temp=Path(directory)
    (temp/'test.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(temp/'test.cpp'),'-o',str(temp/'test')],check=True)
    subprocess.run([str(temp/'test')],check=True)
print('Combatants stay behind HUD/dialogue and preserve normal/affine attributes: PASS')

# Flight uses the same BG0 dialogue plane, including when wind carries the
# aircraft into the lower panel. Exercise its real sprite draw functions too.
source=(root/'templates/exported_shmup/main.cpp').read_text()
start=source.index('void draw_shmup_sprite(')
draw=source[start:source.index('\nvoid draw_scene()',start)]
code=r'''
#include <cassert>
#include "gbs/dialogue.hpp"
#include "gbs/render.hpp"
gbs::DialogueState dialogue {};
gbs::Sprite observed[8] {};
int metasprite_calls=0;
namespace gbs {
void set_sprite(int index, const Sprite& sprite) { observed[index]=sprite; }
void set_metasprite(int, const MetaSprite&, Vec2i) { ++metasprite_calls; }
}
''' + draw + r'''
int main() {
  const gbs::MetaSpritePart parts[]={{2,3,7,2,true,false,16,16}};
  const gbs::MetaSprite metasprite {parts,1};
  dialogue.visible=false;
  draw_shmup_metasprite(0,metasprite,{40,128});
  assert(metasprite_calls==1);
  dialogue.visible=true;
  draw_shmup_metasprite(0,metasprite,{40,128});
  assert(observed[0].priority==1);
  assert(observed[0].x==42 && observed[0].y==131);
  assert(observed[0].tile_index==7 && observed[0].palette==2 && observed[0].hflip);
  assert(observed[0].width==16 && observed[0].height==16);
  gbs::Sprite bullet {40,128,9,2,false,false,true,0,gbs::SpriteRenderMode::Normal};
  draw_shmup_sprite(1,bullet);
  assert(observed[1].priority==1 && bullet.priority==0);
  bullet.priority=2;
  draw_shmup_sprite(1,bullet);
  assert(observed[1].priority==2);
  dialogue.visible=false;
  bullet.priority=0;
  draw_shmup_sprite(1,bullet);
  assert(observed[1].priority==0);
  draw_shmup_metasprite(0,metasprite,{40,128});
  assert(metasprite_calls==2);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-flight-priority-') as directory:
    temp=Path(directory)
    (temp/'test.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(temp/'test.cpp'),'-o',str(temp/'test')],check=True)
    subprocess.run([str(temp/'test')],check=True)
print('Aircraft and projectiles stay behind dialogue and restore their priority: PASS')
