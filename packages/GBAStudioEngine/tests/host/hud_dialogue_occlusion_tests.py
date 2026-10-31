"""Exercise real HUD rendering with and without the dialogue exclusion band."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
code = r'''
#include <cassert>
#include "gbs/ui.hpp"
int status_visible = -1, prompt_visible = -1, command_visible = -1;
int status_draws = 0;
extern "C" {
void gbs_hw_begin_hud_layout(int) {}
void gbs_hw_end_hud_layout() {}
void gbs_hw_invalidate_hud_layout() {}
int gbs_hw_hud_layout_retained() { return 0; }
void gbs_hw_clear_hud_background_rect(int,int,int,int) {}
void gbs_hw_refresh_hud_text_palette(int) {}
void gbs_hw_draw_hud_layout_component(int,int x,int y,int,int,const char*,int,const void*,int visible) {
  if (y==4) {status_visible=visible; ++status_draws;}
  if (y==128) prompt_visible=visible;
  if (x==172 && y==124) command_visible=visible;
}
void gbs_hw_draw_hud_bar(const char*,const char*,int) {}
void gbs_hw_draw_overlay_rect(int,int,int,int,int) {}
void gbs_hw_draw_text_box(int,int,int,int,const char*,int) {}
void gbs_hw_load_obj_tiles(const uint8_t*,uint32_t,uint32_t) {}
void gbs_hw_set_hud_font(const uint8_t*,int) {}
void gbs_hw_set_hud_font_shadow(int) {}
}
int main() {
  const gbs::HudLayoutComponent components[] = {
    {"status", "text", "", "HP", "", 8, 4, 80, 16, 0, true},
    {"prompt", "text", "", "", "", 8, 128, 128, 24, 0, true},
    {"commands", "text", "", "", "", 172, 124, 56, 32, 0, true},
  };
  const gbs::HudLayout layout {"battle", "advanced", components, 3};
  gbs::configure_hud_layouts(&layout, 1);
  assert(gbs::configure_hud_layout("battle"));
  gbs::HudState hud {}; gbs::init_hud(hud);
  const char* slots[] = {"", "NARA?", "ATACAR"};
  gbs::set_hud_text_slots(hud,slots,3);
  gbs::draw_hud(hud);
  assert(status_visible==1 && prompt_visible==1 && command_visible==1);
  gbs::draw_hud_excluding(hud, 0, 112, 240, 48);
  assert(status_visible==1 && prompt_visible==0 && command_visible==0);
  assert(hud.visible && hud.text_slot_count==3); // no mutation of battle state
  gbs::draw_hud(hud);
  assert(status_visible==1 && prompt_visible==1 && command_visible==1);
  assert(status_draws >= 3); // HUD is refreshed after the exclusion is removed
}
'''
with tempfile.TemporaryDirectory(prefix='gba-hud-dialogue-') as directory:
    temp = Path(directory)
    (temp / 'test.cpp').write_text(code)
    command = ['c++', '-std=c++17', '-O2', '-ffunction-sections', '-fdata-sections',
               '-I' + str(root / 'engine/include'), str(temp / 'test.cpp'),
               str(root / 'engine/src/gbs_ui.cpp'),
               '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections',
               '-o', str(temp / 'test')]
    subprocess.run(command, check=True)
    subprocess.run([str(temp / 'test')], check=True)
print('Dialogue excludes overlapping HUD components and restores them: PASS')
