"""Image gauges remain visible over a BG frame while later HUD text stays above them."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'engine/src/gbs_hw.c').read_text()
start = source.index('void gbs_hw_draw_hud_layout_component(')
helper = source[start:source.index('\nvoid gbs_hw_end_hud_layout(', start)]
code = '''#include <assert.h>
enum { GBS_HW_HUD_COMPONENT_FRAME, GBS_HW_HUD_COMPONENT_BAR, GBS_HW_HUD_COMPONENT_ICON, GBS_HW_HUD_COMPONENT_TEXT };
int clears, fills, icons, text_calls;
int gbs_hw_draw_hud_icon(const void* image,int x,int y,int visible,int behind) {
    assert(image && behind==1); ++icons; return 1;
}
void gbs_hw_draw_hud_surface(int x,int y,int w,int h,int skin,int visible) {
    if(!visible) ++clears; else ++fills;
}
void gbs_hw_remember_hud_layout_rect(int x,int y,int w,int h) {}
void gbs_hw_draw_hud_pixel_text(int x,int y,int w,int h,const char* text,int visible) { ++text_calls; }
void gbs_hw_draw_hud_text_at(int x,int y,int w,int h,const char* text,int visible) { ++text_calls; }
''' + helper + '''
int main() {
    gbs_hw_draw_hud_layout_component(GBS_HW_HUD_COMPONENT_FRAME,8,80,104,32,"",0,0,1);
    assert(fills==1 && clears==0);
    int image;
    gbs_hw_draw_hud_layout_component(GBS_HW_HUD_COMPONENT_BAR,16,96,72,8,"",0,&image,1);
    assert(icons==1 && clears==1 && fills==1);
    gbs_hw_draw_hud_layout_component(GBS_HW_HUD_COMPONENT_TEXT,16,88,56,8,"PARTY 1",0,0,1);
    assert(text_calls==1 && clears==1);
    gbs_hw_draw_hud_layout_component(GBS_HW_HUD_COMPONENT_BAR,16,96,72,8,"",0,&image,0);
    assert(clears==1);
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    (directory / 'test.c').write_text(code)
    subprocess.run(['cc','-std=c11',str(directory/'test.c'),'-o',str(directory/'test')],check=True)
    subprocess.run([str(directory/'test')],check=True)
print('Image bars release the BG cells below their OBJ pixels: PASS')
