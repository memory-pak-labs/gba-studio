"""Exercise editor-exported presets in real runtime templates with procedural QA pixels."""
import argparse
import importlib.util
from importlib.machinery import SourceFileLoader
import json
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('pack', type=Path)
parser.add_argument('output', type=Path)
parser.add_argument('contract', type=Path)
parser.add_argument('--mode', choices=['resident', 'paged', 'platformer'], default='resident')
args = parser.parse_args()
subprocess.run([sys.executable, str(Path(__file__).with_name('replace_tile_rom_fixture.py')), str(args.pack), str(args.output), '--mode', args.mode], check=True)
spec = importlib.util.spec_from_loader('assetc', SourceFileLoader('assetc', str(args.pack/'tools/assetc')))
assetc = importlib.util.module_from_spec(spec); spec.loader.exec_module(assetc)
contract = json.loads(args.contract.read_text())
lines = []
refs = [assetc.emit_event_script(lines, 'visibility_action_'+str(i), script['script'], 'visibility ROM') for i, script in enumerate(contract['scripts'])]
boot = assetc.emit_event_script(lines, 'visibility_boot', contract['boot'], 'visibility entry ROM')
lines.append('const gbs::EventScript visibility_scripts[]={' + ','.join(refs) + '};')
platformer = args.mode == 'platformer'
room_type = 'PlatformerRoomData' if platformer else 'TopDownRoomData'
npc_type = 'PlatformerNpcData' if platformer else 'TopDownNpcData'
project_type = 'PlatformerProjectData' if platformer else 'TopDownProjectData'
meta = 'fixture_base::project.player_metasprite' if platformer else 'fixture_base::project.player.metasprite'
lines.append(f'const gbs::{npc_type} visibility_npcs[]={{[]{{gbs::{npc_type} n{{}};n.position_pixels={{128,96}};n.size_pixels={{16,16}};n.metasprite={meta};n.name="Guide";return n;}}()}};')
lines.append('constexpr FixtureBytes<width*height> free_collision{};')
header = args.output/('platformer_project_data.hpp' if platformer else 'gbastudio_project_data.hpp')
source = header.read_text()
source = source.replace('const gbs::TileAsset tiles[]=', '\n'.join(lines)+'\nconst gbs::TileAsset tiles[]=', 1)
source = source.replace('r.collision_flags=collision.values;', 'r.collision_flags=free_collision.values;', 1)
source = source.replace('r.npcs=nullptr;r.npc_count=0;', 'r.npcs=visibility_npcs;r.npc_count=1;', 1)
source = source.replace('r.config.max_run_speed_x256=256;', 'r.config.air_deceleration_x256=256;r.config.max_run_speed_x256=256;', 1)
source = source.replace('return r;}();', f'r.on_enter={boot};'+('r.on_interact=gbs::empty_event_script();' if not platformer else '')+'return r;}();', 1)
room_source = f'const gbs::{room_type} visibility_rooms[]={{test_room,test_room}};\n'
source = source.replace(f'const gbs::{project_type} project=', room_source+f'const gbs::{project_type} project=', 1)
source = source.replace('p.rooms=&test_room;p.room_count=1;', 'p.rooms=visibility_rooms;p.room_count=2;', 1)
source = source.replace('return p;}();', f'p.scripts=visibility_scripts;p.script_count={len(refs)};return p;}}();', 1)
header.write_text(source)
# This moving procedural sprite is a regression probe, not a product asset.
# Reusing one OAM slot across normal/blended/window modes catches stale mode bits.
probe = '''
static_assert(sizeof(gbs::VisibilityEffectController)==16);
static_assert(offsetof(gbs::VisibilityEffectController,width)==2);
static_assert(offsetof(gbs::VisibilityEffectController,intensity)==12);
void draw_graphics_probe() {
    // DMA consumes these sources at VBlank, after this function returns.
    static constexpr uint8_t pixels[32]={PIXELS};
    static constexpr uint16_t colors[16]={0,gbs::rgb15(31,0,0)};
    const gbs::PaletteAsset palette{colors,16,240};
    const gbs::TileAsset tile{pixels,1,960,true,gbs::ColorDepth::Bpp4};
    gbs::load_palette(palette,true);
    gbs::load_tiles(tile);
    gbs::Sprite sprite{24+static_cast<int>((gbs::frame_count()/2)%40)*2,32,960,15,false,false,true};
    sprite.width=8;sprite.height=8;
    sprite.mode=static_cast<gbs::SpriteRenderMode>(event_state.variables[VARIABLE]);
    gbs::set_sprite(120,sprite);
}

'''.replace('PIXELS', ','.join(['0x11']*32)).replace('VARIABLE', str(contract['modeVariable']))
main = args.output/'main.cpp'
source = main.read_text()
marker = 'void render_'+('platformer' if platformer else 'topdown')+'_runtime('
a = source.index(marker); b = source.index('\nvoid leave_', a)
body = source[a:b]
assert '        gbs::wait_vblank();' in body
body = body.replace('        gbs::wait_vblank();', '        draw_graphics_probe();\n        gbs::wait_vblank();', 1)
source = source[:a]+probe+body+source[b:]
main.write_text(source)
(args.output/'visibility-fixture.json').write_text(json.dumps({'mode':args.mode,'modeVariable':contract['modeVariable'],'proceduralProbeOamIndex':120},indent=2))
