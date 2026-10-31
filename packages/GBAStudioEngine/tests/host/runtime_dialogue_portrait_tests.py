"""Exercise portrait registry generation in the audited runtime profiles."""
import copy
from pathlib import Path
import runpy
import subprocess
import tempfile
import unittest

root = Path(__file__).resolve().parents[2]
assetc = runpy.run_path(str(root / "tools/assetc/assetc.py"))


def function_body(source, signature):
    start = source.index(signature)
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end]


class RuntimePortraitTests(unittest.TestCase):
    def test_affine_vehicle_stays_below_modal_and_restores_priority(self):
        source = (root / 'templates/exported_racing/main.cpp').read_text()
        helpers = ''.join(function_body(source, signature) for signature in
                          ['void draw_racing_sprite(', 'void draw_racing_metasprite(']
                          if signature in source)
        draw = function_body(source, 'bool draw_topdown_vehicle(')
        code = r'''
#include <cassert>
#include "gbs/dialogue.hpp"
#include "gbs/racing.hpp"
#include "gbs/render.hpp"
gbs::DialogueState dialogue {};
gbs::Sprite observed {};
int metasprite_calls = 0;
namespace gbs {
void set_sprite(int, const Sprite& value) { observed = value; }
void set_metasprite(int, const MetaSprite&, Vec2i) { ++metasprite_calls; }
bool set_affine_sprite_transform(uint8_t, const AffineSpriteTransform&) { return true; }
}
''' + helpers + draw + r'''
int main() {
    const gbs::MetaSpritePart parts[] = {{0,0,7,2,false,false,32,32}};
    const gbs::MetaSprite vehicle {parts,1};
    assert(draw_topdown_vehicle(0,vehicle,{72,54},0,0));
    assert(observed.priority==0 && observed.affine && observed.tile_index==7);
    dialogue.visible=true;
    assert(draw_topdown_vehicle(0,vehicle,{72,54},0,0));
    assert(observed.priority==1 && observed.affine && observed.palette==2);
    dialogue.visible=false;
    assert(draw_topdown_vehicle(0,vehicle,{72,54},0,0));
    assert(observed.priority==0);
    const gbs::MetaSpritePart small_parts[] = {{2,3,9,3,true,false,16,16}};
    const gbs::MetaSprite small_vehicle {small_parts,1};
    draw_racing_metasprite(1,small_vehicle,{72,54});
    assert(metasprite_calls==1);
    dialogue.visible=true;
    draw_racing_metasprite(1,small_vehicle,{72,54});
    assert(metasprite_calls==1 && observed.priority==1);
    assert(observed.x==74 && observed.y==57 && observed.tile_index==9);
    assert(observed.palette==3 && observed.hflip && observed.width==16 && observed.height==16);
    observed.priority=2;
    draw_racing_sprite(1,observed);
    assert(observed.priority==2);
    dialogue.visible=false;
    draw_racing_metasprite(1,small_vehicle,{72,54});
    assert(metasprite_calls==2);
}
'''
        with tempfile.TemporaryDirectory(prefix='gba-racing-dialogue-depth-') as directory:
            cpp = Path(directory) / 'test.cpp'
            binary = Path(directory) / 'test'
            cpp.write_text(code)
            subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(cpp),'-o',str(binary)],check=True)
            subprocess.run([str(binary)],check=True)

    def test_generated_registry_keeps_named_metasprite(self):
        room = {"name": "room", "width_tiles": 2, "height_tiles": 2,
                "visual_tiles": [0] * 4, "collision_flags": [0] * 4,
                "config": {}, "player_start_pixels": {"x": 0, "y": 0}}
        profiles = {
            "isometric": {"rooms": [{**room, "actors": [{"tile": {"x": 0, "y": 0, "z": 0}}]}]},
            "racing": {"rooms": [room]},
            "shmup": {"waves": [{"name": "wave", "enemies": []}]},
            "point_click": {"scenes": [{"name": "room", "hotspots": []}]},
            "battle_rpg": {"encounters": [{"name": "battle", "config": {},
                "party": [{"name": "Hero", "unit": {}, "abilities": [{"kind": "attack"}]}],
                "enemies": [{"name": "Enemy", "unit": {}, "abilities": [{"kind": "attack"}]}]}]},
        }
        for profile, fixture in profiles.items():
            with self.subTest(profile=profile):
                data = copy.deepcopy(fixture)
                data["portrait_assets"] = [{"name": "guide.png", "metasprite": "guide_metasprite"}]
                data["dialogue_lines"] = [{"text": "Hello", "portrait": "guide.png"}]
                emit = assetc[f"emit_{profile}_project_data_header"]
                header = emit(data)
                self.assertIn('gbs::DialoguePortraitEntry dialogue_portrait_assets[]', header)
                self.assertIn('{ "guide.png", &guide_metasprite }', header)
                self.assertIn('dialogue_portrait_asset_count = 1;', header)
                data.pop("portrait_assets")
                empty = emit(data)
                self.assertIn('dialogue_portrait_assets = nullptr;', empty)
                self.assertIn('dialogue_portrait_asset_count = 0;', empty)


if __name__ == "__main__":
    unittest.main()
