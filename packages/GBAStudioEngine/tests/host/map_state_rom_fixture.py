"""Use editor-exported map-state commands in the existing procedural ROM fixture."""
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
parser.add_argument('--replay-inputs', action='store_true')
parser.add_argument('--restore-actors', action='store_true')
parser.add_argument('--mode', choices=['resident', 'paged', 'platformer'], default='resident')
args = parser.parse_args()
subprocess.run([sys.executable, str(Path(__file__).with_name('replace_tile_rom_fixture.py')), str(args.pack), str(args.output), '--mode', args.mode], check=True)
spec = importlib.util.spec_from_loader('assetc', SourceFileLoader('assetc', str(args.pack/'tools/assetc')))
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)
contract = json.loads(args.contract.read_text())
lines = []
by_name = {script['name']: script['script'] for script in contract['scripts']}
scripts = [by_name['open'], [{'op': 'save_game', 'slot': 0}], by_name['closed'], [{'op': 'load_game', 'slot': 0}], [
    {'op': 'jump_if_room_equals', 'room': 0, 'offset': 3},
    {'op': 'warp', 'room': 0, 'x': 80, 'y': 96}, {'op': 'end'},
    {'op': 'warp', 'room': 1, 'x': 80, 'y': 96}, {'op': 'end'}]]
refs = [assetc.emit_event_script(lines, 'map_action_'+str(i), script, 'map state ROM') for i, script in enumerate(scripts)]
restore = assetc.emit_event_script(lines, 'map_restore', contract['restore'], 'map state restore ROM')
bindings = [{'op': 'attach_button_event', 'button': key, 'index': i, 'override': True} for i, key in enumerate(['a', 'start', 'b', 'select', 'r'] if args.replay_inputs else ['a', 'b', 'l', 'select', 'r'])]
boot = assetc.emit_event_script(lines, 'map_boot', contract['restore']+[{'op': 'wait', 'frames': 1}]+bindings, 'map state entry ROM')
other_boot = assetc.emit_event_script(lines, 'map_other_boot', bindings, 'other room entry ROM')
lines.append('const gbs::EventScript map_scripts[]={' + ','.join(refs) + '};')
header_name = 'platformer_project_data.hpp' if args.mode == 'platformer' else 'gbastudio_project_data.hpp'
file = args.output/header_name
source = file.read_text()
source = source.replace('r.config.max_run_speed_x256=256;', 'r.config.air_deceleration_x256=256;r.config.max_run_speed_x256=256;', 1)
source = source.replace('using namespace fixture_base;', "using namespace fixture_base;\nconstexpr gbs::SaveBank save_bank{0,2048,3,gbs::make_save_signature('G','B','M','S'),1};", 1)
anchor = 'const gbs::TileAsset tiles[]='
source = source.replace(anchor, '\n'.join(lines)+'\n'+anchor, 1)
source = source.replace('return r;}();', f'r.on_enter={boot};r.on_restore={restore};'+('r.on_interact=gbs::empty_event_script();' if args.mode != 'platformer' else '')+'return r;}();', 1)
room_type = 'PlatformerRoomData' if args.mode == 'platformer' else 'TopDownRoomData'
project_type = 'PlatformerProjectData' if args.mode == 'platformer' else 'TopDownProjectData'
rooms_source = f"const gbs::{room_type} map_rooms[]={{test_room, []{{auto r=test_room;r.on_enter={other_boot};r.on_restore=gbs::empty_event_script();return r;}}()}};\n"
source = source.replace(f'const gbs::{project_type} project=', rooms_source + f'const gbs::{project_type} project=', 1)
source = source.replace('p.rooms=&test_room;p.room_count=1;', 'p.rooms=map_rooms;p.room_count=2;', 1)
source = source.replace('return p;}();', 'p.scripts=map_scripts;p.script_count=5;return p;}();', 1)
if args.restore_actors:
    if args.mode == 'platformer':
        raise SystemExit('restore-actors requires topdown')
    npcs = """
struct ReplayNpcs { gbs::TopDownNpcData values[12]; ReplayNpcs() {
    for (int i=0;i<12;++i) { auto& n=values[i];n=fixture_base::room_0_npcs[0];
        n.position_pixels={80+i*16,160};n.movement={};n.on_start=gbs::empty_event_script();
        n.on_update=gbs::empty_event_script();n.on_interact=gbs::empty_event_script(); }
} }; const ReplayNpcs replay_npcs{};
"""
    source = source.replace('const gbs::TopDownRoomData test_room=', npcs+'const gbs::TopDownRoomData test_room=', 1)
    source = source.replace('r.npcs=nullptr;r.npc_count=0;', 'r.npcs=replay_npcs.values;r.npc_count=12;', 1)
file.write_text(source)
