#!/usr/bin/env python3
"""Name-input UI must render independently from authored background palettes."""
from pathlib import Path
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "engine/src/gbs_hw.c").read_text()


def function(name):
    match = re.search(r"^(?:static )?(?:void|uint16_t) " + name + r"\([^;]*?\) \{", source, re.M)
    assert match, name
    end = match.end()
    depth = 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[match.start():end]


constants = {name: re.search(name + r" = (\d+)", source)[1] for name in
             ["NAME_INPUT_BG_PALETTE", "NAME_INPUT_TEXT_PALETTE"]}
palette = re.search(r"static const uint16_t name_input_palette_colors\[16\] = \{.*?\};", source, re.S)[0]
program = r'''
#include <assert.h>
#include <stdint.h>
static uint16_t palette[512], shadow_bg_tilemaps[1][1024];
#define MEM_PALETTE palette
#define UI_BACKGROUND_LAYER 0
#define NAME_INPUT_TILE_SURFACE 200
#define NAME_INPUT_TILE_BORDER 201
static void gbs_hw_mark_ui_tilemap_dirty(void) {}
static uint16_t ui_tile_entry(unsigned tile, unsigned bank) { return tile | (bank << 12); }
static void gbs_hw_enqueue_vblank_dma16(const uint16_t* src, uint16_t* dst, unsigned count) {
    for (unsigned i = 0; i < count; ++i) dst[i] = src[i];
}
''' + "\n".join(f"#define {name} {value}" for name, value in constants.items()) + "\n" + palette
helper = "queue_name_input_background_palette_restore"
if re.search(r"static void " + helper + r"\(", source):
    program += function(helper)
program += function("name_input_tile_entry")
program += function("gbs_hw_draw_name_input_surface")
program += function("gbs_hw_draw_text_input_surface")
letters_start = source.index("    const int keyboard_rows = side_controls ? 4 : 3;")
letters_end = source.index("    const char* control_labels[3]", letters_start)
program += r'''
static void gbs_hw_draw_text_input_keyboard_glyph(volatile uint16_t* screenblock, int x, int y, uint32_t codepoint) {
    (void)codepoint;
    screenblock[y * 32 + x] = 2;
}
static void draw_keyboard_letters(int selected_index) {
    const int side_controls = 0, box_x = 4, box_y = 8, lowercase = 0;
    const uint16_t selector_tile = 1, blank_tile = 0;
    volatile uint16_t* screenblock = shadow_bg_tilemaps[0];
''' + source[letters_start:letters_end] + "}\n"
program += r'''
int main(void) {
    for (unsigned i = 0; i < 512; ++i) palette[i] = 0x1111;
    gbs_hw_draw_text_input_surface(2, 2, 8, 4, 1);
    // The private UI bank must not depend on bank 4/11 in a game's background.
    assert((shadow_bg_tilemaps[0][2 * 32 + 2] >> 12) == 15);
    assert(NAME_INPUT_TEXT_PALETTE == 15);
    assert(palette[15 * 16 + 1] == name_input_palette_colors[1]);
    assert(palette[15 * 16 + 4] == name_input_palette_colors[4]);
    for (unsigned i = 0; i < 15 * 16; ++i) assert(palette[i] == 0x1111);
    for (unsigned i = 256; i < 512; ++i) assert(palette[i] == 0x1111);
    gbs_hw_draw_text_input_surface(0, 0, 0, 0, 0);
    assert(shadow_bg_tilemaps[0][2 * 32 + 2] == 0);
    for (int selected = 0; selected < 29; ++selected) {
        for (unsigned i = 0; i < 1024; ++i) shadow_bg_tilemaps[0][i] = 0;
        draw_keyboard_letters(selected);
        int markers = 0;
        for (unsigned i = 0; i < 1024; ++i) markers += shadow_bg_tilemaps[0][i] == 1;
        // DEL/case/confirm have their own focus; unused letter cells stay blank.
        assert(markers == (selected < 26 ? 1 : 0));
    }
}
'''
with tempfile.TemporaryDirectory(prefix="gba-name-input-palette-") as tmp:
    c, exe = Path(tmp) / "test.c", Path(tmp) / "test"
    c.write_text(program)
    subprocess.run(["cc", "-std=c11", str(c), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print("Name input private UI palette passed")
