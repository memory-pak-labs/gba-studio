"""Exercise the actual dungeon fill helper without painting the HUD plane."""
from pathlib import Path
import subprocess
import tempfile
root = Path(__file__).resolve().parents[2]
source = (root / 'templates/exported_dungeon_crawler/main.cpp').read_text()
start = source.index('void fill_rect(')
helper = source[start:source.index('\nvoid draw_view()', start)]
code = '''#include <cassert>
#include <cstdint>
namespace gbs {
enum class BackgroundLayer { BG0, BG1 };
uint16_t ui[1024], world[1024];
void set_bg_tile(BackgroundLayer layer, int x, int y, int, int, uint16_t tile) {
    (layer == BackgroundLayer::BG0 ? ui : world)[y * 32 + x] = tile;
}
}
''' + helper + '''
int main() {
    gbs::ui[18 * 32 + 2] = 42;
    fill_rect(0, 18, 30, 20, 1);
    assert(gbs::ui[18 * 32 + 2] == 42);
    assert(gbs::world[18 * 32 + 2] == 1);
    fill_rect(0, 0, 30, 20, 0, gbs::BackgroundLayer::BG0);
    assert(gbs::ui[18 * 32 + 2] == 0);
    assert(gbs::world[18 * 32 + 2] == 1);
}
'''
with tempfile.TemporaryDirectory() as directory:
    directory = Path(directory)
    (directory / 'test.cpp').write_text(code)
    subprocess.run(['c++', '-std=c++17', str(directory / 'test.cpp'), '-o', str(directory / 'test')], check=True)
    subprocess.run([str(directory / 'test')], check=True)
print('Dungeon world rendering preserves the HUD plane: PASS')
