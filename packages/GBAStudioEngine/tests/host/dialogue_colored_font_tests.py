"""Exercise real dialogue glyph conversion and palette restoration on host."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'engine/src/gbs_hw.c').read_text()
start = source.index('static uint8_t dialogue_font_bg_byte(')
glyph = source[start:source.index('\nstatic void load_resident_font_glyph(', start)]
start = source.index('void gbs_hw_restore_ui_assets(')
restore = source[start:source.index('\nvoid gbs_hw_load_bg_palette(', start)]
code = r'''
#include <assert.h>
#include <stdint.h>
#define DIALOGUE_COLOR_BACKGROUND 1
#define DIALOGUE_COLOR_TEXT 4
#define DIALOGUE_PALETTE_BASE 240
#define HUD_PALETTE_BASE 224
static uint16_t palette[512];
#define MEM_PALETTE palette
static int bg_font_transparent=0;
static const uint8_t *configured_dialogue_font_tiles=0;
static const uint16_t *configured_dialogue_skin_palette=0;
void write_name_input_palette(void) {}
void write_dialogue_tiles(void) {}
void load_custom_dialogue_font(const uint8_t* tiles) { (void)tiles; }
void write_name_input_tiles(void) {}
void write_obj_dialogue_tiles(void) {}
void gbs_hw_load_bg_palette(const uint16_t* src, uint32_t start, uint32_t count) {
  for (uint32_t i=0;i<count;++i) palette[start+i]=src[i];
}
void gbs_hw_load_obj_palette(const uint16_t* src, uint32_t start, uint32_t count) {
  for (uint32_t i=0;i<count;++i) palette[256+start+i]=src[i];
}
''' + glyph + '\n' + restore + r'''
int main() {
  assert(dialogue_font_bg_byte(0x00)==0x11);
  assert(dialogue_font_bg_byte(0x44)==0x44);
  assert(dialogue_font_bg_byte(0x55)==0x11); // opaque HUD shadow is not glyph ink
  assert(dialogue_font_bg_byte(0x45)==0x41);
  bg_font_transparent=1;
  assert(dialogue_font_bg_byte(0x50)==0x00);
  uint16_t skin[16]={}; skin[1]=0x1234;skin[4]=0x5678;
  configured_dialogue_skin_palette=skin;
  gbs_hw_restore_ui_assets();
  assert(palette[241]==0x1234 && palette[244]==0x5678);
  assert(palette[256+241]==0x1234 && palette[256+244]==0x5678);
}
'''
with tempfile.TemporaryDirectory(prefix='gba-dialogue-font-') as directory:
    temp=Path(directory)
    (temp/'test.c').write_text(code)
    subprocess.run(['cc','-std=c11',str(temp/'test.c'),'-o',str(temp/'test')],check=True)
    subprocess.run([str(temp/'test')],check=True)
print('Colored HUD font and active dialogue skin palette: PASS')
