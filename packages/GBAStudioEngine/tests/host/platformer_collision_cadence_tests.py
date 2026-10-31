"""Compare subpixel collision stepping with the previous pixel-by-pixel oracle."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'engine/src/gbs_platformer.cpp').read_text()
helpers = source[source.index('namespace {'):source.index('} // namespace')]
code = r'''
#include <cassert>
#include <cstdint>
#include "gbs/platformer.hpp"
#define GBS_PLATFORMER_COLLISION_HOT
unsigned reads=0;
namespace gbs {
uint8_t tile_flags_at(const TileMap& map,int x,int y) {
    ++reads;
    return x<0 || y<0 || x>=map.width || y>=map.height ? TileSolid : map.flags[y*map.width+x];
}
TileSlope tile_slope_at(const TileMap&,int,int) {return TileSlope::None;}
uint8_t tile_flags_in_rect(const TileMap&,Rect) {return 0;}
}
''' + helpers + r'''
// Independent previous behavior: query every tile touched by every candidate pixel.
int reference(const gbs::TileMap& map,gbs::Rect& rect,int delta,bool horizontal,
              bool& hit,bool& landed,bool ignore_one_way,bool ignore_all) {
    const int direction=delta<0 ? -1 : delta>0 ? 1 : 0;
    int moved=0;hit=landed=false;
    for(int n=0;n<(delta<0?-delta:delta);++n) {
        auto next=rect;
        if(horizontal)next.x+=direction;else next.y+=direction;
        bool blocked=false;
        for(int y=next.y/8;y<=(next.bottom()-1)/8 && !blocked;++y)
            for(int x=next.x/8;x<=(next.right()-1)/8 && !blocked;++x) {
                const auto flags=gbs::tile_flags_at(map,x,y);
                blocked=(flags&gbs::TileSolid)!=0;
                if(horizontal)blocked|=direction>0 ? (flags&gbs::TileBlockLeft)!=0 : (flags&gbs::TileBlockRight)!=0;
                else {
                    blocked|=direction<0 && (flags&gbs::TileBlockBottom)!=0;
                    blocked|=!ignore_one_way && direction>0 && (flags&gbs::TileBlockTop)!=0 && rect.bottom()<=y*8 && next.bottom()>=y*8;
                }
            }
        if(ignore_all)blocked=false;
        if(blocked){hit=true;landed=!horizontal && direction>0;break;}
        rect=next;moved+=direction;
    }
    return moved;
}
} // namespace
int main() {
    uint8_t tiles[256]{};gbs::TileMap map{tiles,16,16};
    gbs::Rect rect{32,32,16,24};bool hit,landed;
    reads=0;move_axis(map,rect,7,true,hit,landed);const auto optimized=reads;
    rect={32,32,16,24};reads=0;reference(map,rect,7,true,hit,landed,false,false);
    assert(optimized<reads); // Repeated pixels in the same tile span need one query.
    uint32_t random=12345;
    const auto next=[&](){random=random*1664525u+1013904223u;return random;};
    const uint8_t flags[]={0,gbs::TileSolid,gbs::TileBlockTop,gbs::TileBlockBottom,gbs::TileBlockLeft,gbs::TileBlockRight};
    for(int trial=0;trial<40000;++trial) {
        if(trial%100==0)for(auto& tile:tiles)tile=flags[next()%6] | flags[(next()>>16)%6];
        gbs::Rect expected{int(next()%180)-25,int(next()%180)-25,int(next()%33)+1,int(next()%49)+1};
        auto actual=expected;
        const int delta=int(next()%25)-12;const bool horizontal=(next()>>16)&1,ignore_one_way=(next()>>16)&1,ignore_all=(next()%9)==0;
        bool a,b,c,d;
        const auto wanted=reference(map,expected,delta,horizontal,a,b,ignore_one_way,ignore_all);
        const auto got=move_axis(map,actual,delta,horizontal,c,d,ignore_one_way,ignore_all);
        assert(got==wanted && a==c && b==d);
        assert(actual.x==expected.x && actual.y==expected.y && actual.width==expected.width && actual.height==expected.height);
    }
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    (directory / 'test.cpp').write_text(code)
    subprocess.run(['c++', '-std=c++17', '-O2', '-I', str(root / 'engine/include'),
                    str(directory / 'test.cpp'), '-o', str(directory / 'test')], check=True)
    subprocess.run([str(directory / 'test')], check=True)
print('Platformer collision stepping: fewer tile reads, 40000 equivalent cases: PASS')
