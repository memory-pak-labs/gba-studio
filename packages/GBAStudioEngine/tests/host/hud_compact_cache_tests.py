"""Exercise the native six-pixel HUD renderer, its pixels and reuse of OBJ tiles."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'engine/src/gbs_hw.c').read_text()
start = source.index('static void gbs_hw_draw_hud_compact_text(')
cache_start = source.find('static const uint8_t* hud_compact_fonts')
if 0 <= cache_start < start:
    start = cache_start
end = source.index('\nstatic const uint8_t* hud_spaced_fonts', start)
code = r'''
#include <stdint.h>
#include <assert.h>
#include <string.h>
#define gbs_compose_compact_hud_text reference_compact
#define gbs_compose_spaced_hud_text reference_spaced
#include "gbs/hud_compact_text.h"
#undef gbs_compose_compact_hud_text
#undef gbs_compose_spaced_hud_text
uint16_t palette[512], obj[16384], hud_pixel_text_glyphs[124];
#define MEM_PALETTE palette
#define MEM_OBJ_TILES obj
#define HUD_PALETTE_BASE 224
#define HUD_PALETTE 14
#define DIALOGUE_COLOR_TEXT 4
#define DYNAMIC_TEXT_OBJ_TILE_BASE 900
#define DYNAMIC_TEXT_OBJ_OAM_COUNT 31
uint8_t fonts[2][256*32], gbs_font_rows[256][8];
const uint8_t* configured_hud_font_tiles = fonts[0];
const uint8_t* configured_dialogue_font_tiles = fonts[0];
int configured_hud_text_color = 0x2506, configured_hud_shadow_color = -1;
unsigned hud_pixel_text_obj_count;
int hud_icon_obj_write, compositions, sprites;
int gbs_hw_allocate_hud_compact_slot(void) { return 64; }
unsigned gbs_text_next_codepoint(const char** s) { return (unsigned char)*(*s)++; }
unsigned gbs_text_glyph_index(unsigned ch) { return ch - 32; }
uint16_t pack_font_pixels(unsigned a, unsigned b, unsigned c, unsigned d) { return 0; }
void gbs_compose_compact_hud_text(const uint8_t* in, unsigned n, uint8_t* out) {
    ++compositions; reference_compact(in, n, out);
}
void gbs_compose_spaced_hud_text(const uint8_t* in, unsigned n, unsigned advance, uint8_t* out) {
    ++compositions; reference_spaced(in, n, advance, out);
}
void gbs_hw_set_sprite(int a,int b,int c,int d,int e,int f,int g,int h,int i,int j,int k,int l,int m) {
    assert(hud_icon_obj_write); ++sprites;
}
''' + source[start:end].replace('__attribute__((section(".ewram_bss")))', '') + r'''
static void draw(const char* text) {
    hud_pixel_text_obj_count = 0;
    gbs_hw_draw_hud_compact_text(204, 10, 30, text, 1);
}
static void check_pixels(const char* text) {
    uint8_t glyphs[160] = {0}, expected[128]; unsigned count = 0;
    for (; *text && count < 5; ++text, ++count)
        memcpy(glyphs + count * 32, configured_hud_font_tiles + (*text - 32) * 32, 32);
    reference_spaced(glyphs, count, 6, expected);
    assert(memcmp(obj + 900 * 16, expected, 128) == 0);
}
int main(void) {
    for (unsigned f=0; f<2; ++f) for (unsigned g=0; g<256; ++g)
        for (unsigned i=0; i<32; ++i) fonts[f][g*32+i]=(g+i+f)%16 * 17;
    memset(hud_pixel_text_glyphs, 255, sizeof(hud_pixel_text_glyphs));
    draw("01234"); check_pixels("01234"); assert(compositions == 1);
    draw("01234"); check_pixels("01234");
    assert(compositions == 1 && sprites == 2); // Re-publish OAM, reuse pixels.
    draw("01235"); check_pixels("01235"); assert(compositions == 2); // Fifth glyph matters.
    draw("0"); check_pixels("0"); assert(compositions == 3); // Erase trailing digits.
    configured_hud_text_color = 0x1234;
    draw("0"); assert(compositions == 3);
    assert(palette[256+HUD_PALETTE_BASE+DIALOGUE_COLOR_TEXT] == 0x1234);
    configured_hud_font_tiles = fonts[1];
    draw("0"); check_pixels("0"); assert(compositions == 4);
    // Dialogue/scene uploads invalidate the shared tile arena, even for the same text.
    memset(hud_pixel_text_glyphs, 255, sizeof(hud_pixel_text_glyphs));
    memset(obj + 900*16, 0, 128);
    draw("0"); check_pixels("0"); assert(compositions == 5);
    // A different text renderer used the same OBJ group in the preceding frame.
    for (unsigned i=0; i<4; ++i) hud_pixel_text_glyphs[i] = 16;
    draw("0"); check_pixels("0"); assert(compositions == 6);
    configured_hud_font_tiles = fonts[0]; draw("0"); assert(compositions == 7);
    configured_hud_font_tiles = 0; draw("0"); assert(compositions == 8);
    draw("0"); assert(compositions == 8); // Fallback font also caches.
    unsigned previous_sprites = sprites;
    gbs_hw_draw_hud_compact_text(0,0,30,"0",0);
    gbs_hw_draw_hud_compact_text(0,0,30,0,1);
    assert(compositions == 8 && sprites == previous_sprites);
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    (directory / 'test.c').write_text(code)
    subprocess.run(['cc', '-std=c11', '-I', str(root / 'engine/include'),
                    str(directory / 'test.c'), '-o', str(directory / 'test')], check=True)
    subprocess.run([str(directory / 'test')], check=True)
print('Compact HUD pixels, stable reuse, digit/font changes and tile invalidation: PASS')
