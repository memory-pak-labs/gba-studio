from pathlib import Path
import subprocess, tempfile
root=Path(__file__).resolve().parents[2]
source=(root/'templates/exported_luta/main.cpp').read_text()
start=source.index('void draw_luta() {')
prefix=source[start:source.index('    int sprite_index = 0;',start)]
code='''#include <cassert>
#include "gbs/luta.hpp"
#include "gbs/ui.hpp"
int writes=0; const gbs::HudLayout* selected=nullptr;
namespace gbs {
void hide_all_sprites() {}
const HudLayout* active_hud_layout() {return selected;}
bool set_bg_tile(BackgroundLayer,int,int,int,int,uint16_t) {++writes;return true;}
}
gbs::LutaStageData stages[1] {};
gbs::LutaProjectData project {};
gbs::LutaRuntimeState state {};
int stage_index=0;
'''+prefix+'''}
int main(){
 project.stages=stages; state.p1_hp=state.p2_hp=100;
 gbs::HudLayout layout {"approved","advanced",nullptr,0}; selected=&layout;
 draw_luta(); assert(writes==0);
 selected=nullptr; draw_luta(); assert(writes>0);
}
'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d);(p/'test.cpp').write_text(code)
 subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(p/'test.cpp'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Luta authored HUD replaces procedural fallback: PASS')
