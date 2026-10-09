#!/usr/bin/env python3
"""Exercise the real exploration input and interaction rules."""
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
code += block('gbs::Vec2i input_to_tactical_cursor_delta(')
code += block('gbs::Vec2i input_to_iso_delta(')
for name in ['int32_t iso_exploration_step(', 'bool iso_tiles_adjacent_or_same(',
             'gbs::EventScript iso_exploration_candidate_script(', 'void cycle_iso_exploration_target(',
             'gbs::EventScript iso_exploration_interact_script(']:
    code += block(name)
code += r"""
int main() {
    const uint16_t U=gbs::ButtonUp,D=gbs::ButtonDown,L=gbs::ButtonLeft,R=gbs::ButtonRight;
    const uint16_t masks[]={U,uint16_t(U|R),R,uint16_t(D|R),D,uint16_t(D|L),L,uint16_t(U|L)};
    const gbs::Vec2i expected[]={{-1,-1},{0,-1},{1,-1},{1,0},{1,1},{0,1},{-1,1},{-1,0}};
    for(int i=0;i<8;++i) {
        auto delta=input_to_iso_delta({masks[i],0,0});
        assert(delta.x==expected[i].x && delta.y==expected[i].y);
    }
    const gbs::IsoGridConfig grid {32,16,{0,0},8};
    assert(iso_exploration_step({1,0},grid)==16);
    assert(iso_exploration_step({1,-1},grid)==9);
    assert(iso_exploration_step({1,1},grid)==18);
    const gbs::EventCommand commands[]={{gbs::EventOp::SetVariable,0,1,0}};
    const gbs::EventScript script {commands,1};
    gbs::IsoActor actors[4] {}; for(auto& a:actors) a.visible=true;
    actors[0].tile={2,2,0}; actors[1].tile={2,1,0}; actors[2].tile={3,2,0}; actors[3].tile={8,8,0};
    const gbs::IsoActorEventData events[]={{1,script},{2,script},{3,script}};
    const gbs::IsoTileEventData tiles[]={{{2,2,0},script},{{8,7,0},script}};
    gbs::IsometricRoomData room {}; room.actor_interact_events=events;room.actor_interact_event_count=3;
    room.tile_events=tiles;room.tile_event_count=2;
    gbs::IsoCursorState c {{8,8,0},true};
    assert(!gbs::has_event_script(iso_exploration_interact_script(room,actors,4,c)));
    c.tile={8,7,0};
    assert(!gbs::has_event_script(iso_exploration_interact_script(room,actors,4,c)));
    c.active=false;
    assert(gbs::has_event_script(iso_exploration_interact_script(room,actors,4,c)));
    cycle_iso_exploration_target(room,actors,4,c); assert(c.active && c.tile.y==1);
    cycle_iso_exploration_target(room,actors,4,c); assert(c.tile.x==3);
    cycle_iso_exploration_target(room,actors,4,c); assert(c.tile.x==2 && c.tile.y==2);
    actors[1].visible=false; actors[2].tile.z=1;
    cycle_iso_exploration_target(room,actors,4,c); assert(c.tile.x==2 && c.tile.y==2);
    room.tile_event_count=0;cycle_iso_exploration_target(room,actors,4,c); assert(!c.active);
    assert(!gbs::has_event_script(iso_exploration_interact_script(room,actors,4,c)));
    cycle_iso_exploration_target(room,nullptr,0,c);assert(!c.active);
    auto delta=input_to_iso_delta({uint16_t(U|D|L|R),0,0});
    assert(delta.x==0 && delta.y==0);
}
"""
with tempfile.TemporaryDirectory(prefix='gba-iso-exploration-') as tmp:
    cpp = Path(tmp) / 'exploration.cpp'; exe = Path(tmp) / 'exploration'
    cpp.write_text(code)
    subprocess.run(['c++','-std=c++17','-O2','-ffunction-sections','-fdata-sections',
                    '-I'+str(root/'engine/include'),str(cpp),str(root/'engine/src/gbs_isometric.cpp'),
                    '-Wl,-dead_strip' if sys.platform == 'darwin' else '-Wl,--gc-sections','-o',str(exe)],check=True)
    subprocess.run([str(exe)],check=True)
print('isometric exploration: PASS')
