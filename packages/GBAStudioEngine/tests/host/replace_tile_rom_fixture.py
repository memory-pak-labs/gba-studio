"""Build inputs for a real ReplaceTile ROM, using the selected Engine Pack."""
import argparse
import importlib.util
import json
from pathlib import Path
import shutil

parser = argparse.ArgumentParser()
parser.add_argument("pack", type=Path)
parser.add_argument("output", type=Path)
parser.add_argument("--mode", choices=["tiled", "resident", "paged", "paged-large", "platformer"], default="resident")
parser.add_argument("--keep-collision", action="store_true")
args = parser.parse_args()
spec = importlib.util.spec_from_file_location("assetc", args.pack / "tools/assetc")
if spec is None:
    from importlib.machinery import SourceFileLoader
    spec = importlib.util.spec_from_loader("assetc", SourceFileLoader("assetc", str(args.pack / "tools/assetc")))
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)
out = args.output
out.mkdir(parents=True, exist_ok=True)
platformer = args.mode == "platformer"
paged = args.mode.startswith("paged")
width, height = (126, 86) if paged else (64, 32)
x, y = (100, 70) if args.mode == "paged-large" else (12, 12)
template = "exported_platformer" if platformer else "exported_topdown"
header = "platformer_project_data.hpp" if platformer else "gbastudio_project_data.hpp"
namespace = "gbastudio_platformer_project" if platformer else "gbastudio_project"
shutil.copy(args.pack / "templates" / template / "main.cpp", out / "main.cpp")
base = (args.pack / "templates" / template / header).read_text()
(out / "base.hpp").write_text(base.replace("namespace " + namespace + " {", "namespace fixture_base {"))
if not platformer:
    shutil.copy(args.pack / "templates" / template / "player_sprite_asset.hpp", out / "player_sprite_asset.hpp")

def edit(row, tile, collision):
    return {"op": "replace_tile", "x": x, "y": row, "tile": tile, "layer": "bg2",
            **({} if collision is None else {"collision_flags": collision})}

commands = [
    {"op": "jump_if_variable_equals", "variable": 0, "value": 1, "offset": 5},
    edit(y, 1, None if args.keep_collision else 0),
    edit(y + 1, 1, None if args.keep_collision else 0),
    {"op": "set_variable", "variable": 0, "value": 1}, {"op": "end"},
    edit(y, 2, 1), edit(y + 1, 2, 1),
    {"op": "set_variable", "variable": 0, "value": 0}, {"op": "end"},
]
lines = []
script = assetc.emit_event_script(lines, "replacement", commands, "replace-tile ROM")
bytes_per_tile = 64 if paged else 32
fill = "1" if paged else "0x11"
fill2 = "2" if paged else "0x22"
common = f"""#pragma once
#include "base.hpp"
namespace {namespace} {{
using namespace fixture_base;
constexpr int width={width}, height={height}, target_x={x}, target_y={y};
template<int N> struct FixtureBytes {{ uint8_t values[N]; }};
template<int N> struct FixtureWords {{ uint16_t values[N]; }};
constexpr auto visuals=[] {{ FixtureWords<width*height> a{{}};for(int i=0;i<width*height;++i)a.values[i]=1;a.values[target_y*width+target_x]=2;a.values[(target_y+1)*width+target_x]=2;return a;}}();
constexpr auto collision=[] {{ FixtureBytes<width*height> a{{}};a.values[target_y*width+target_x]=1;a.values[(target_y+1)*width+target_x]=1;return a;}}();
constexpr auto image=[] {{ FixtureBytes<3*{bytes_per_tile}> a{{}};for(int i=0;i<{bytes_per_tile};++i){{a.values[{bytes_per_tile}+i]={fill};a.values[{2*bytes_per_tile}+i]={fill2};}}return a;}}();
constexpr uint16_t colors[16]={{0,gbs::rgb15(0,24,4),gbs::rgb15(28,1,1)}};
const gbs::PaletteAsset palettes[]={{{{colors,16,0}}}};
const gbs::TileAsset atlas{{image.values,3,0,false,gbs::ColorDepth::{'Bpp8' if paged else 'Bpp4'}}};
const gbs::TileMapAsset map{{visuals.values,width,height}};
""" + "\n".join(lines) + "\n"
if platformer:
    body = f"""
const gbs::TileAsset tiles[]={{atlas}};
const gbs::EventScript fixture_scripts[]={{{script}}};
const gbs::EventCommand bind_button[]={{{{gbs::EventOp::AttachButtonEvent,1,0,1}},{{gbs::EventOp::End,0,0,0}}}};
const gbs::PlatformerRoomData test_room=[] {{auto r=fixture_base::rooms[0];
 r.visual_tiles=visuals.values;r.collision_flags=collision.values;r.collision_slopes=nullptr;r.width_tiles=width;r.height_tiles=height;
 r.bg2_tiles=visuals.values;r.bg1_tiles=nullptr;r.bg3_tiles=nullptr;r.player_start={{(target_x-2)*8,target_y*8,16,16}};
 r.camera_start={{{{0,0}},true}};r.config=gbs::default_platformer_config();r.config.gravity_x256=0;r.config.max_fall_speed_x256=0;r.config.jump_speed_x256=0;
 r.config.max_run_speed_x256=256;r.config.acceleration_x256=256;r.config.friction_x256=256;
 r.hazards=nullptr;r.hazard_count=0;r.checkpoints=nullptr;r.checkpoint_count=0;r.camera_zones=nullptr;r.camera_zone_count=0;
 r.enemies=nullptr;r.enemy_count=0;r.moving_platforms=nullptr;r.moving_platform_count=0;r.triggers=nullptr;r.trigger_count=0;r.npcs=nullptr;r.npc_count=0;
 r.on_enter={{bind_button,2}};r.on_exit=gbs::empty_event_script();r.on_update=gbs::empty_event_script();return r;}}();
const gbs::PlatformerProjectData project=[] {{auto p=fixture_base::project;p.rooms=&test_room;p.room_count=1;p.initial_room=0;
 p.bg_palettes=palettes;p.bg_palette_count=1;p.tile_assets=tiles;p.tile_asset_count=1;p.music_asset_count=0;p.scripts=fixture_scripts;p.script_count=1;return p;}}();
"""
else:
    body = f"""
const gbs::TileAsset tiles[]={{{'fixture_base::tile_assets[1]' if paged else 'atlas,fixture_base::tile_assets[1]'}}};
const gbs::TopDownRoomData test_room=[] {{auto r=fixture_base::rooms[0];
 r.visual_tiles=visuals.values;r.collision_flags=collision.values;r.width_tiles=width;r.height_tiles=height;r.portals=nullptr;r.portal_count=0;
 r.portal_events=nullptr;r.portal_event_count=0;r.on_enter=gbs::empty_event_script();r.on_exit=gbs::empty_event_script();r.on_interact={script};
 r.interactions=nullptr;r.interaction_count=0;r.npcs=nullptr;r.npc_count=0;r.triggers=nullptr;r.trigger_count=0;r.tile_effect_events=nullptr;r.tile_effect_event_count=0;
 r.metadata=gbs::default_room_metadata();r.name="replace-tile";r.uses_visual_tilemap={'false' if args.mode == 'tiled' else 'true'};
 r.visual_tilemap=&map;r.visual_tile_asset=&atlas;r.visual_palette=&palettes[0];r.paged_source_tiles={'&atlas' if paged else 'nullptr'};return r;}}();
const gbs::TopDownProjectData project=[] {{auto p=fixture_base::project;p.rooms=&test_room;p.room_count=1;p.initial_room=0;p.bg_palettes=palettes;p.bg_palette_count=1;
 p.tile_assets=tiles;p.tile_asset_count={1 if paged else 2};p.backgrounds=nullptr;p.background_count=0;p.music_asset_count=0;
 p.player.position_pixels={{(target_x-2)*8,target_y*8}};p.player.direction=gbs::TopDownActorDirection::Right;p.player.speed_pixels=1;return p;}}();
"""
(out / header).write_text(common + body + "\n}\n")
(out / "gbastudio_project.json").write_text(json.dumps({"schema": 1, "backend": "gbastudio_engine",
    "kind": "platformer" if platformer else "topdown", "build": {"target": "replace_tile", "make_target": "all"},
    "entry": "main.cpp", "project_data": header, "generated_assets": []}, indent=2))
(out / "replace-tile-fixture.json").write_text(json.dumps({"mode": args.mode, "x": x, "y": y,
    "keepCollision": args.keep_collision, "width": width, "height": height}, indent=2))
