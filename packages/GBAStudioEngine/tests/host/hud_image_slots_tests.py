"""Compile the real hardware image allocator and check simultaneous HUD modules."""
from pathlib import Path
import re
import subprocess
import tempfile
ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'engine/src/gbs_hw.c').read_text()
topdown = (ROOT / 'examples/topdown_basic/src/main.cpp').read_text()
render = topdown[topdown.index('void render_topdown_runtime('):]
assert render.index('gbs::hide_all_sprites();') < render.index('gbs::draw_hud(hud);'), 'World clearing erases the HUD images'
def function(name):
    start = re.search(r'^(?:static )?(?:void|int|uint16_t) ' + name + r'\(', source, re.M).start()
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]
structs = '\n'.join(re.findall(r'struct gbs_hw_metasprite(?:_part)? \{.*?\n\};', source, re.S))
globals = '\n'.join(re.findall(r'static (?:uint8_t|int) hud_icon_obj_(?:count|write)[^;]*;', source))
constants = ', '.join(re.findall(r'HUD_ICON_OBJ_OAM_(?:BASE|COUNT) = \d+', source))
code = '#include <stdint.h>\n#include <assert.h>\n#include <string.h>\n' + structs + '\n' + globals
code += '\nenum { ' + constants + ', DIALOGUE_PALETTE = 15 };\n'
code += r'''
uint16_t shadow_oam[512];
int oam_overflow_count;
void mark_shadow_oam_dirty(int first, int count) { (void)first; (void)count; }
'''
code += '\n'.join(function(name) for name in (
    'gbs_hw_hud_icon_slot','gbs_hw_hud_icon_owns_slot','gbs_hw_hide_sprites',
    'gbs_hw_hide_all_sprites','gbs_hw_set_sprite','gbs_hw_set_sprite_color_depth',
    'gbs_hw_set_sprite_affine','gbs_hw_clear_hud_icon_slots',
    'gbs_hw_hud_icon_shape','gbs_hw_hud_icon_size','gbs_hw_draw_hud_icon'))
code += r'''
int main() {
    struct gbs_hw_metasprite_part a = {0}, b = {0};
    a.width=a.height=b.width=b.height=8; a.tile_index=11; b.tile_index=22;
    struct gbs_hw_metasprite first={&a,1}, second={&b,1};
    gbs_hw_hide_all_sprites();
    gbs_hw_clear_hud_icon_slots();
    assert(gbs_hw_draw_hud_icon(&first,8,8,1,1));
    assert(gbs_hw_draw_hud_icon(&second,16,8,1,0));
    assert((shadow_oam[88*4+2]&1023)==11 && (shadow_oam[89*4+2]&1023)==22);
    for(int n=2;n<32;n++) assert(gbs_hw_draw_hud_icon(&second,16,8,1,0));
    assert(!gbs_hw_draw_hud_icon(&first,8,8,1,1));
    assert((shadow_oam[88*4+2]&1023)==11);
    // Every occupied image slot survives world sprite, depth, affine and hide calls.
    for(int n=64;n<96;n++) {
        uint16_t previous[4]; memcpy(previous,shadow_oam+n*4,sizeof(previous));
        gbs_hw_set_sprite(n,0,0,99,1,0,0,1,0,0,0,0,0);
        gbs_hw_set_sprite_color_depth(n,1); gbs_hw_set_sprite_affine(n,1,1,0);
        gbs_hw_hide_sprites(n,1);
        assert(memcmp(previous,shadow_oam+n*4,sizeof(previous))==0);
    }
    // An unreserved world slot remains usable.
    gbs_hw_set_sprite(63,0,0,99,1,0,0,1,0,0,0,0,0);
    assert((shadow_oam[63*4+2]&1023)==99);
    gbs_hw_clear_hud_icon_slots();
    assert(gbs_hw_draw_hud_icon(&second,16,8,1,0));
    assert((shadow_oam[88*4+2]&1023)==22 && shadow_oam[89*4+2]==0);
    // A new frame releases the borrowed ranges, including the original first slot.
    gbs_hw_hide_all_sprites();
    gbs_hw_set_sprite(88,0,0,99,1,0,0,1,0,0,0,0,0);
    assert((shadow_oam[88*4+2]&1023)==99);
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory=Path(directory)
    (directory/'test.c').write_text(code)
    subprocess.run(['cc','-std=c11',str(directory/'test.c'),'-o',str(directory/'test')],check=True)
    subprocess.run([str(directory/'test')],check=True)
print('HUD simultaneous image slots and world isolation: PASS')
