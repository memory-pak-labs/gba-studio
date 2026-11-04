"""The production platformer layer renderer must preserve prepared affine maps."""
from pathlib import Path
import subprocess
import tempfile
root=Path(__file__).resolve().parents[2]
source=(root/'examples/platformer_basic/src/main.cpp').read_text()
start=source.index('void draw_platformer_room_layers(')
end=source.index('\n} // namespace',start)
fixture=r'''#include <cassert>
#include "gbs/platformer.hpp"
#include "gbs/camera.hpp"
#include "gbs/visual_effects.hpp"
#include "gbs/tile_edits.hpp"
int regular_draws[4]{}; bool enabled[4]{};
namespace gbs {
Vec2i visual_effect_scroll_offset(const VisualEffectsController&) { return {0,0}; }
bool visual_effect_targets_background(const VisualEffectsController&, BackgroundLayer) { return false; }
void set_bg_enabled(BackgroundLayer layer,bool value) { enabled[int(layer)]=value; }
void set_bg_scroll(BackgroundLayer,int,int) {}
void draw_room_to_bg_cached(BackgroundLayer layer,const uint16_t*,int,int,int,int,RoomTilemapCache&,const RoomTileEdits&) { ++regular_draws[int(layer)]; }
}
gbs::RoomTilemapCache room_layer_cache[4]{};gbs::RoomTileEdits room_tile_edits{};
''' + source[start:end] + r'''
int main() {
 gbs::PlatformerRoomData room{};uint16_t tiles[1024]{};
 room.width_tiles=32;room.height_tiles=32;room.visual_tiles=tiles;
 room.video.display_mode=gbs::DisplayMode::Mode1TextAffine;
 room.video.affine_enabled=true;room.video.affine_layer=gbs::BackgroundLayer::BG2;
 draw_platformer_room_layers(room,gbs::Camera{},gbs::VisualEffectsController{});
 assert(regular_draws[2]==0);assert(enabled[2]);
 room.video.affine_enabled=false;room.video.display_mode=gbs::DisplayMode::Mode0Text;
 draw_platformer_room_layers(room,gbs::Camera{},gbs::VisualEffectsController{});
 assert(regular_draws[2]==1 && enabled[2]);
}
'''
with tempfile.TemporaryDirectory() as temp:
 cpp=Path(temp)/'test.cpp';cpp.write_text(fixture);exe=Path(temp)/'test'
 subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror','-I'+str(root/'engine/include'),str(cpp),'-o',str(exe)],check=True)
 subprocess.run([str(exe)],check=True)
print('Platformer preserves affine maps: PASS')
