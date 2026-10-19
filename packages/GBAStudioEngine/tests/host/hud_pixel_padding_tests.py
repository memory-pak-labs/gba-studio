"""Opaque glyph backgrounds must not paint unoccupied cells in an OBJ text group."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
s=(root/'engine/src/gbs_hw.c').read_text();a=s.index('static void gbs_hw_draw_hud_pixel_text(');b=s.index('\nstatic void ',a+15);fn=s[a:b]
code=r'''
#include <stdint.h>
#include <assert.h>
#include <string.h>
uint16_t palette[512],obj[16384],hud_pixel_text_glyphs[124];
#define MEM_PALETTE palette
#define MEM_OBJ_TILES obj
#define HUD_PALETTE_BASE 224
#define HUD_PALETTE 14
#define DIALOGUE_COLOR_TEXT 4
#define DYNAMIC_TEXT_OBJ_TILE_BASE 900
#define DYNAMIC_TEXT_OBJ_OAM_COUNT 31
#define DYNAMIC_TEXT_OBJ_OAM_BASE 96
uint8_t fonts[256*32],gbs_font_rows[256][8];
const uint8_t* configured_hud_font_tiles=fonts;
const uint8_t* configured_dialogue_font_tiles=0;
const uint8_t* cached_hud_pixel_font=0;
int configured_hud_text_color=0x5fbe,configured_hud_shadow_color=0x1881;
unsigned hud_pixel_text_obj_count;
unsigned gbs_text_next_codepoint(const char** s){return (unsigned char)*(*s)++;}
unsigned gbs_text_glyph_index(unsigned ch){return ch-32;}
uint16_t pack_font_pixels(unsigned a,unsigned b,unsigned c,unsigned d){return 0;}
void gbs_hw_set_sprite(int a,...){}
'''+fn+r'''
int main(void){
 memset(fonts,0x55,sizeof(fonts));memset(hud_pixel_text_glyphs,255,sizeof(hud_pixel_text_glyphs));
 gbs_hw_draw_hud_pixel_text(12,4,64,8,"A",1);
 assert(hud_pixel_text_obj_count==1);
 assert(obj[900*16]==0x5555); // actual glyph keeps its approved opaque background
 assert(obj[901*16]==0 && obj[902*16]==0 && obj[903*16]==0); // group padding stays transparent
 hud_pixel_text_obj_count=0;gbs_hw_draw_hud_pixel_text(12,4,64,8,"A ",1);
 assert(obj[901*16]==0x5555 && obj[902*16]==0); // authored spaces remain opaque
}
'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d);(p/'test.c').write_text(code)
 subprocess.run(['cc','-std=c11',str(p/'test.c'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Opaque font padding: PASS')
