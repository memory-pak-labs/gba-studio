#!/usr/bin/env python3
"""Exercise the real cursor mapping, input cadence, visual motion and tile rules."""
from pathlib import Path
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'examples/isometric_basic/src/main.cpp').read_text()

def block(marker, suffix=''):
    start = source.index(marker)
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end] + suffix + '\n'

code = '#include <cassert>\n#include "gbs/isometric.hpp"\n#include "gbs/input.hpp"\n'
for name in ['struct IsoTacticalCursorInput', 'struct IsoTacticalCursorVisual']:
    code += block(name, ';')
for name in ['gbs::Vec2i input_to_tactical_cursor_delta(', 'gbs::Vec2i step_iso_tactical_cursor_input(',
             'void set_iso_tactical_cursor_visual(', 'void tick_iso_tactical_cursor_visual(',
             'gbs::Vec2i iso_tactical_cursor_draw_offset(', 'void move_iso_tactical_cursor(']:
    code += block(name)
code += '''
bool equal(gbs::Vec2i a,gbs::Vec2i b) { return a.x==b.x && a.y==b.y; }
gbs::InputState keys(uint16_t held,uint16_t pressed=0) { return {held,pressed,0}; }
int main() {
    const uint16_t U=gbs::ButtonUp,D=gbs::ButtonDown,L=gbs::ButtonLeft,R=gbs::ButtonRight;
    const uint16_t masks[]={U,uint16_t(U|R),R,uint16_t(D|R),D,uint16_t(D|L),L,uint16_t(U|L)};
    const gbs::Vec2i expected[]={{-1,-1},{0,-1},{1,-1},{1,0},{1,1},{0,1},{-1,1},{-1,0}};
    for(int i=0;i<8;++i) {
        auto delta=input_to_tactical_cursor_delta(keys(masks[i]));
        auto opposite=input_to_tactical_cursor_delta(keys(masks[(i+4)%8]));
        assert(equal(delta,expected[i]));
        assert(delta.x+opposite.x==0 && delta.y+opposite.y==0);
    }
    assert(equal(input_to_tactical_cursor_delta(keys(U|D)),{0,0}));
    assert(equal(input_to_tactical_cursor_delta(keys(L|R)),{0,0}));
    assert(equal(input_to_tactical_cursor_delta(keys(U|D|L|R)),{0,0}));
    assert(equal(input_to_tactical_cursor_delta(keys(U|D|R)),{1,-1}));

    for(int offset=0;offset<8;++offset) {
        IsoTacticalCursorInput s {};
        for(int i=0;i<offset;++i) assert(equal(step_iso_tactical_cursor_input(keys(0),s),{0,0}));
        assert(equal(step_iso_tactical_cursor_input(keys(U,U),s),{0,0}));
        // A tap released in the next logical tick still commits exactly once.
        assert(equal(step_iso_tactical_cursor_input(keys(0),s),{-1,-1}));
        assert(equal(step_iso_tactical_cursor_input(keys(0),s),{0,0}));
    }
    IsoTacticalCursorInput s {};
    step_iso_tactical_cursor_input(keys(U,U),s);
    assert(equal(step_iso_tactical_cursor_input(keys(U|R,R),s),{0,-1})); // One combined step.
    for(int i=1;i<8;++i) assert(equal(step_iso_tactical_cursor_input(keys(U|R),s),{0,0}));
    assert(equal(step_iso_tactical_cursor_input(keys(U|R),s),{0,-1}));
    for(int i=1;i<3;++i) assert(equal(step_iso_tactical_cursor_input(keys(U|R),s),{0,0}));
    assert(equal(step_iso_tactical_cursor_input(keys(U|R),s),{0,-1}));
    assert(equal(step_iso_tactical_cursor_input(keys(U),s),{0,0})); // Releasing chord is not another tap.
    s={};step_iso_tactical_cursor_input(keys(U,U),s);
    assert(equal(step_iso_tactical_cursor_input(keys(U|D,D),s),{0,0})); // Opposites cancel pending tap.
    s={};step_iso_tactical_cursor_input(keys(U,U),s);
    assert(equal(step_iso_tactical_cursor_input(keys(U),s,true),{-1,-1})); // A flushes current destination.
    assert(!s.pending);
    assert(equal(step_iso_tactical_cursor_input(keys(D,D),s),{0,0}));
    assert(equal(step_iso_tactical_cursor_input(keys(D),s),{1,1})); // Direction change restarts delay.
    for(int i=1;i<8;++i) assert(equal(step_iso_tactical_cursor_input(keys(D),s),{0,0}));

    gbs::IsoGridConfig grid {32,16,{120,40},8};
    IsoTacticalCursorVisual v {};
    set_iso_tactical_cursor_visual(v,{2,2,0},grid,false);
    const auto before=v.current;
    set_iso_tactical_cursor_visual(v,{3,2,1},grid,true);
    assert(equal(v.current,before));
    tick_iso_tactical_cursor_visual(v,{3,2,1},grid);
    assert(v.current.x>before.x && v.current.x<v.target.x);
    assert(v.current.y==before.y); // +8 projection and -8 elevation cancel.
    assert(iso_tactical_cursor_draw_offset(v,{3,2,1},grid).x<0);
    tick_iso_tactical_cursor_visual(v,{3,2,1},grid);
    tick_iso_tactical_cursor_visual(v,{3,2,1},grid);
    assert(equal(v.current,gbs::iso_tile_to_screen({3,2,1},grid)));
    assert(equal(iso_tactical_cursor_draw_offset(v,{3,2,1},grid),{0,0}));
    set_iso_tactical_cursor_visual(v,{2,2,0},grid,true);
    set_iso_tactical_cursor_visual(v,{2,2,0},grid,false); // Confirmation/cancel snaps to logical selection.
    assert(equal(v.current,gbs::iso_tile_to_screen({2,2,0},grid)));
    tick_iso_tactical_cursor_visual(v,{1,1,0},grid); // New room / auto-target snaps.
    assert(equal(v.current,gbs::iso_tile_to_screen({1,1,0},grid)));

    uint8_t flags[36] {},heights[36] {}; heights[15]=1;
    gbs::IsometricRoomData room {};room.width_tiles=room.height_tiles=6;
    room.grid=grid;room.collision_flags=flags;room.height_levels=heights;
    room.world_mode=gbs::IsoWorldMode::StaticComposition;
    gbs::IsoCamera camera {};
    for(int i=0;i<8;++i) {
        gbs::IsoCursorState c {{3,3,0},true};
        move_iso_tactical_cursor(room,camera,c,expected[i]);
        assert(c.tile.x==3+expected[i].x && c.tile.y==3+expected[i].y);
        move_iso_tactical_cursor(room,camera,c,expected[(i+4)%8]);
        assert(c.tile.x==3 && c.tile.y==3);
    }
    gbs::IsoCursorState edge {{0,2,0},true};
    move_iso_tactical_cursor(room,camera,edge,{-1,-1});
    assert(edge.tile.x==0 && edge.tile.y==2); // Reject, do not clamp into a different direction.
    gbs::IsoCursorState elevated {{2,2,0},true};
    move_iso_tactical_cursor(room,camera,elevated,{1,0});
    assert(elevated.tile.z==1);
    auto map=gbs::iso_tilemap_from_room(room);
    auto path=gbs::plan_iso_tactical_move(map,{1,1,0},{2,2,0},nullptr,0,0,1);
    assert(!path.found); // Cursor diagonal never discounts movement cost.
    path=gbs::plan_iso_tactical_move(map,{1,1,0},{2,2,0},nullptr,0,0,2);
    assert(path.found && path.length==2);
    flags[1*6+2]=flags[2*6+1]=1;
    path=gbs::plan_iso_tactical_move(map,{1,1,0},{2,2,0},nullptr,0,0,2);
    assert(!path.found); // No corner cutting.
}
'''
with tempfile.TemporaryDirectory(prefix='gba-iso-cursor-') as tmp:
    cpp = Path(tmp) / 'cursor.cpp'; exe = Path(tmp) / 'cursor'
    cpp.write_text(code)
    subprocess.run(['c++','-std=c++17','-O2','-ffunction-sections','-fdata-sections',
                    '-I'+str(root/'engine/include'),str(cpp),str(root/'engine/src/gbs_isometric.cpp'),
                    '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections','-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
print('isometric cursor: PASS')
