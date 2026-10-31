"""Exercise the actual built-in HUD marker without substituting a font glyph."""
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'engine/src/gbs_hw.c').read_text()
def function(name):
    start = re.search(r'static (?:void|uint16_t) ' + name + r'\([^;]*?\) \{', source).start()
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]

code = r'''
#include <stdint.h>
#include <assert.h>
#include <string.h>
#define DYNAMIC_TEXT_OBJ_TILE_BASE 900
#define DIALOGUE_COLOR_TEXT 4
#define HUD_PALETTE 14
uint16_t obj[16384], hud_pixel_text_glyphs[124];
#define MEM_OBJ_TILES obj
unsigned hud_pixel_text_obj_count;
int hud_icon_obj_write, configured_hud_text_color=0x1234;
int free_slot=71, sprite_calls, palette_calls;
int gbs_hw_allocate_hud_compact_slot(void) { return free_slot; }
void gbs_hw_refresh_hud_text_palette(int color) { assert(color==0x1234); ++palette_calls; }
void gbs_hw_set_sprite(int slot,int x,int y,uint16_t tile,uint16_t palette,int h,int v,int visible,uint16_t priority,uint16_t mode,int mosaic,uint16_t shape,uint16_t size) {
    assert(hud_icon_obj_write && slot==71 && x==80 && y==64 && tile==900 && palette==14);
    assert(!h && !v && visible && !priority && !mode && !mosaic && !shape && !size);
    ++sprite_calls;
}
''' + function('pack_font_pixels') + '\n' + function('gbs_hw_draw_hud_choice_selector') + r'''
int main(void) {
    gbs_hw_draw_hud_choice_selector(80,64);
    assert(hud_pixel_text_obj_count==1 && sprite_calls==1 && palette_calls==1 && !hud_icon_obj_write);
    const unsigned widths[8]={1,2,3,4,3,2,1,0};
    for(unsigned y=0;y<8;y++)for(unsigned x=0;x<8;x++) {
        const unsigned value=(obj[900*16+y*2+x/4]>>((x%4)*4))&15;
        assert(value==(x>=1 && x<1+widths[y] ? 4u : 0u));
    }
    for(unsigned i=0;i<4;i++)assert(hud_pixel_text_glyphs[i]==0xffff);
    hud_pixel_text_obj_count=31;gbs_hw_draw_hud_choice_selector(80,64);
    assert(hud_pixel_text_obj_count==31 && sprite_calls==1);
    hud_pixel_text_obj_count=0;free_slot=-1;gbs_hw_draw_hud_choice_selector(80,64);
    assert(hud_pixel_text_obj_count==0 && sprite_calls==1);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-hud-selector-') as directory:
    path=Path(directory);(path/'test.c').write_text(code)
    subprocess.run(['cc','-std=c11',str(path/'test.c'),'-o',str(path/'test')],check=True)
    subprocess.run([str(path/'test')],check=True)
    # Runtime-local HUD globals must remain zero-initialized: mixed builds place
    # their BSS in the shared EWRAM overlay, while nonzero .data uses IWRAM.
    (path/'zero.cpp').write_text(r'''
#include "gbs/ui.hpp"
#include <cassert>
static gbs::HudState hud_zero;
int main() {
    const auto* bytes = reinterpret_cast<const unsigned char*>(&hud_zero);
    for (unsigned i=0; i<sizeof(hud_zero); ++i) assert(bytes[i]==0);
}
''')
    subprocess.run(['c++','-std=c++17','-I',str(root/'engine/include'),str(path/'zero.cpp'),'-o',str(path/'zero')],check=True)
    subprocess.run([str(path/'zero')],check=True)
print('HUD selector pixels, OBJ ownership, palette, cache invalidation and capacity: PASS')
