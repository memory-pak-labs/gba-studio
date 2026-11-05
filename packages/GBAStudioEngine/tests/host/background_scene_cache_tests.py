"""Exercise the production Menu backdrop cache with scene-owned compositions."""
from pathlib import Path
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_menu/main.cpp').read_text()
start = source.index('void apply_background(const gbs::MenuScreenData& screen)')
end = source.index('\nvoid draw_screen_actors()', start)
fixture = r'''
#include <cassert>
#include "gbs/menu.hpp"
int video_uploads = 0;
namespace gbs {
bool apply_scene_background_video(const VideoComposition&) { ++video_uploads; return true; }
void set_bg_enabled(BackgroundLayer, bool) {}
void disable_blending() {}
void set_bg_priority(BackgroundLayer, uint8_t) {}
void set_backdrop_color(uint16_t) {}
bool load_palette(const PaletteAsset&, bool) { return true; }
bool load_tiles(const TileAsset&) { return true; }
bool load_tilemap(BackgroundLayer, const TileMapAsset&) { return true; }
}
gbs::MenuProjectData project {};
bool active_background_applied = false;
int active_background_index = -1;
const gbs::VideoComposition* active_background_video = nullptr;
uint32_t screen_elapsed_frames = 0;
bool menu_screen_uses_ui(const gbs::MenuScreenData*) { return true; }
''' + source[start:end] + r'''
int main() {
    // A prepared scene is valid without a regular background index.
    gbs::MenuScreenData first {}; first.background_index = -1;
    apply_background(first); assert(video_uploads == 1);
    apply_background(first); assert(video_uploads == 1);
    // A second screen can reuse the same image but owns a different base pose.
    gbs::MenuScreenData second {}; second.background_index = -1;
    apply_background(second); assert(video_uploads == 2);
    apply_background(second); assert(video_uploads == 2);
    // Re-selecting an animated background frame must update the base only once.
    const gbs::MenuBackgroundData images[] = {
        {"one", gbs::BackgroundLayer::BG2, {}, 0},
        {"two", gbs::BackgroundLayer::BG2, {}, 0}
    };
    project.backgrounds = images; project.background_count = 2;
    const int frames[] = {0,1};
    second.background_animation_frames = frames;
    second.background_animation_frame_count = 2;
    second.background_animation_frame_duration = 4;
    apply_background(second); assert(video_uploads == 3);
    screen_elapsed_frames = 4;
    apply_background(second); assert(video_uploads == 4);
    apply_background(second); assert(video_uploads == 4);
}
'''
with tempfile.TemporaryDirectory() as directory:
    cpp = Path(directory) / 'test.cpp'; cpp.write_text(fixture)
    binary = Path(directory) / 'test'
    subprocess.run(['c++', '-std=c++17', '-Wall', '-Wextra', '-Werror', '-I'+str(root/'engine/include'), str(cpp), '-o', str(binary)], check=True)
    subprocess.run([str(binary)], check=True)
print('Scene backdrop cache: PASS')
