"""Execute the actual native compact HUD path with independent HUD/dialogue fonts."""
from pathlib import Path
import subprocess, tempfile
root=Path(__file__).resolve().parents[2]
s=(root/'engine/src/gbs_hw.c').read_text();a=s.index('static void gbs_hw_draw_hud_compact_text(');b=s.index('\nstatic const uint8_t* hud_spaced_fonts',a)
code=r'''
#include <stdint.h>
#include <assert.h>
#include <string.h>
#include "gbs/hud_compact_text.h"
uint16_t palette[512],obj[16384],hud_pixel_text_glyphs[124];
#define MEM_PALETTE palette
#define MEM_OBJ_TILES obj
#define HUD_PALETTE_BASE 224
#define HUD_PALETTE 14
#define DIALOGUE_COLOR_TEXT 4
#define DYNAMIC_TEXT_OBJ_TILE_BASE 900
#define DYNAMIC_TEXT_OBJ_OAM_COUNT 31
uint8_t fonts[2][256*32],gbs_font_rows[256][8];
const uint8_t* configured_hud_font_tiles=fonts[0];
const uint8_t* configured_dialogue_font_tiles=fonts[1];
int configured_hud_text_color=0x2506,configured_hud_shadow_color=-1;
unsigned hud_pixel_text_obj_count;
int hud_icon_obj_write;
int gbs_hw_allocate_hud_compact_slot(void){return 64;}
unsigned gbs_text_next_codepoint(const char** s){return (unsigned char)*(*s)++;}
unsigned gbs_text_glyph_index(unsigned ch){return ch-32;}
uint16_t pack_font_pixels(unsigned a,unsigned b,unsigned c,unsigned d){return 0;}
void gbs_hw_set_sprite(int a,int b,int c,int d,int e,int f,int g,int h,int i,int j,int k,int l,int m){}
'''+s[a:b]+r'''
int main(void){
 fonts[0][('A'-32)*32]=4;
 fonts[0][('A'-32)*32+3]=0x40;
 palette[HUD_PALETTE_BASE+DIALOGUE_COLOR_TEXT]=0x7fff;
 gbs_hw_draw_hud_compact_text(30,131,144,"A",1);
 assert(palette[256+HUD_PALETTE_BASE+DIALOGUE_COLOR_TEXT]==0x2506);
 assert(obj[900*16]==4);
 assert((obj[900*16+1]&0xf000)==0x4000);
 configured_hud_font_tiles=0;configured_hud_text_color=-1;hud_pixel_text_obj_count=0;
 fonts[1][('A'-32)*32]=0x40;
 fonts[1][('A'-32)*32+3]=0x40;
 gbs_hw_draw_hud_compact_text(30,131,144,"A",1);
 assert(obj[900*16]==0x40);
 assert((obj[900*16+1]&0xf000)==0);
 assert(palette[256+HUD_PALETTE_BASE+DIALOGUE_COLOR_TEXT]==0x7fff);
}
'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d);(p/'test.c').write_text(code)
 subprocess.run(['cc','-std=c11','-I',str(root/'engine/include'),str(p/'test.c'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Compact HUD: selected font, exact ink, full glyph and default fallback: PASS')
