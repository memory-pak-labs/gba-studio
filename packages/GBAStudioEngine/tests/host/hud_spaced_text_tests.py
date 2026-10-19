"""Execute the actual hardware text routine; unchanged groups reuse their VRAM data."""
from pathlib import Path
import subprocess,tempfile
root=Path(__file__).resolve().parents[2]
s=(root/'engine/src/gbs_hw.c').read_text();a=s.index('static void gbs_hw_draw_hud_spaced_text(');b=s.index('\nvoid gbs_hw_draw_hud_layout_component',a);fn=s[a:b]
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
#define DYNAMIC_TEXT_OBJ_OAM_COUNT 32
uint8_t fonts[2][256*32],gbs_font_rows[256][8];
const uint8_t* configured_hud_font_tiles=fonts[0];
const uint8_t* configured_dialogue_font_tiles=0;
const uint8_t* hud_spaced_fonts[31];
int configured_hud_text_color=0x5fbe,compositions;
unsigned hud_pixel_text_obj_count;
int hud_icon_obj_write;
int gbs_hw_allocate_hud_compact_slot(void){return 88;}
unsigned gbs_text_next_codepoint(const char** s){return (unsigned char)*(*s)++;}
unsigned gbs_text_glyph_index(unsigned ch){return ch-32;}
uint16_t pack_font_pixels(unsigned a,unsigned b,unsigned c,unsigned d){return 0;}
void gbs_compose_spaced_hud_text(const uint8_t* in,unsigned n,unsigned advance,uint8_t* out){++compositions;memset(out,4,128);}
void gbs_hw_set_sprite(int a,int b,int c,int d,int e,int f,int g,int h,int i,int j,int k,int l,int m){}
'''+fn+r'''
int main(void){
 memset(hud_pixel_text_glyphs,255,sizeof(hud_pixel_text_glyphs));
 gbs_hw_draw_hud_spaced_text(29,12,56,"SUA VEZ",1);assert(compositions==2);
 hud_pixel_text_obj_count=0;
 gbs_hw_draw_hud_spaced_text(29,12,56,"SUA VEZ",1);assert(compositions==2);
 hud_pixel_text_obj_count=0;
 gbs_hw_draw_hud_spaced_text(29,12,56,"SUA VE!",1);assert(compositions==3);
 configured_hud_font_tiles=fonts[1];hud_pixel_text_obj_count=0;
 gbs_hw_draw_hud_spaced_text(29,12,56,"SUA VE!",1);assert(compositions==5);
 memset(hud_pixel_text_glyphs,255,sizeof(hud_pixel_text_glyphs));hud_pixel_text_obj_count=0;
 gbs_hw_draw_hud_spaced_text(29,12,56,"SUA VE!",1);assert(compositions==7);
 assert(palette[256+HUD_PALETTE_BASE+DIALOGUE_COLOR_TEXT]==0x5fbe);
}
'''
with tempfile.TemporaryDirectory() as d:
 p=Path(d);(p/'test.c').write_text(code)
 subprocess.run(['cc','-std=c11',str(p/'test.c'),'-o',str(p/'test')],check=True)
 subprocess.run([str(p/'test')],check=True)
print('Spaced HUD text cache, invalidation, font switch and exact ink: PASS')
