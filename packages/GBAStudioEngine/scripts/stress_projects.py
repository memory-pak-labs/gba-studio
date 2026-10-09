#!/usr/bin/env python3
import argparse
import json
import math
import shutil
import subprocess
import sys
from pathlib import Path


TARGET_IDS = (
    "topdown_large",
    "platformer_large",
    "isometric_large",
    "sprites_oam_heavy",
    "tilesets_vram_heavy",
    "audio_heavy",
    "shmup_large",
    "point_click_large",
    "dungeon_crawler_large",
    "racing_large",
    "hardware_contention",
)

STREAMING_POLICY_MODES = {"progressive_prefetch", "transition_atomic", "resident"}
DMA_RESOURCE_BYTES = {
    "bg_tiles": 32,
    "affine_bg_tiles": 32,
    "obj_tiles": 32,
    "bg_palette_colors": 2,
    "obj_palette_colors": 2,
    "oam_sprites": 8,
}


def run_command(command):
    result = subprocess.run(command, check=False, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    payload = None
    if result.stdout.strip():
        try:
            payload = json.loads(result.stdout)
        except json.JSONDecodeError:
            payload = None
    return {
        "ok": result.returncode == 0,
        "returncode": result.returncode,
        "command": command,
        "stdout": result.stdout,
        "stderr": result.stderr,
        "json": payload,
    }


def resolve_engine_pack(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def load_profiles(engine_pack, explicit_path=None):
    if explicit_path:
        path = Path(explicit_path).expanduser()
        if not path.is_absolute():
            path = Path.cwd() / path
    else:
        path = engine_pack / "stress" / "stress_profiles.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    targets = data.get("targets", [])
    profiles = {target["id"]: target for target in targets if isinstance(target, dict) and target.get("id") in TARGET_IDS}
    for target_id, profile in profiles.items():
        policy = profile.get("streaming_policy")
        if not isinstance(policy, dict) or policy.get("mode") not in STREAMING_POLICY_MODES:
            raise ValueError(f"{target_id}: streaming_policy invalida")
        if policy["mode"] == "progressive_prefetch":
            if int(policy.get("max_new_banks_per_frame", 0)) <= 0 or int(policy.get("max_uploads_per_frame", 0)) <= 0:
                raise ValueError(f"{target_id}: prefetch progressivo requer orcamentos positivos")
        if int(policy.get("editorial_dma_budget_bytes", 0)) <= 0:
            raise ValueError(f"{target_id}: editorial_dma_budget_bytes deve ser positivo")
    return profiles


def streaming_calibration(profile, asset_pack_report):
    policy = profile["streaming_policy"]
    groups = asset_pack_report.get("bank_usage_by_group", []) if isinstance(asset_pack_report, dict) else []
    max_group_bank_count = 0
    max_group_dma_bytes = 0
    max_group_name = None
    for group in groups:
        if not isinstance(group, dict):
            continue
        bank_count = max(0, int(group.get("bank_count", 0)))
        resources = group.get("resources", {})
        dma_bytes = 0
        if isinstance(resources, dict):
            for resource, bytes_per_unit in DMA_RESOURCE_BYTES.items():
                usage = resources.get(resource, {})
                count = usage.get("count", 0) if isinstance(usage, dict) else 0
                dma_bytes += max(0, int(count)) * bytes_per_unit
        max_group_bank_count = max(max_group_bank_count, bank_count)
        if dma_bytes > max_group_dma_bytes:
            max_group_dma_bytes = dma_bytes
            max_group_name = group.get("name")

    if policy["mode"] == "progressive_prefetch" and max_group_bank_count > 0:
        prefetch_frames = math.ceil(max_group_bank_count / int(policy["max_new_banks_per_frame"]))
    else:
        prefetch_frames = 1 if max_group_bank_count > 0 else 0
    estimated_dma_bytes_per_frame = math.ceil(max_group_dma_bytes / prefetch_frames) if prefetch_frames > 0 else 0
    editorial_budget = int(policy["editorial_dma_budget_bytes"])
    return {
        "policy": policy,
        "max_group_name": max_group_name,
        "max_group_bank_count": max_group_bank_count,
        "max_group_dma_bytes": max_group_dma_bytes,
        "prefetch_frames": prefetch_frames,
        "estimated_dma_bytes_per_frame": estimated_dma_bytes_per_frame,
        "within_editorial_dma_budget": estimated_dma_bytes_per_frame <= editorial_budget,
    }


def tiled_values(width, height, variant=0):
    values = []
    for y in range(height):
        for x in range(width):
            edge = x == 0 or y == 0 or x == width - 1 or y == height - 1
            values.append(1 if edge else ((x + y + variant) % 4))
    return values


def collision_values(width, height, platformer=False):
    values = []
    for y in range(height):
        for x in range(width):
            if x == 0 or x == width - 1 or y == height - 1:
                values.append(1)
            elif platformer and y == height - 2 and x % 5 == 0:
                values.append(4)
            else:
                values.append(0)
    return values


def resource_asset(name, group, resources, optional=False):
    return {
        "name": name,
        "id": name,
        "bank_group": group,
        "kind": "bank",
        "optional": optional,
        "resources": resources,
    }


def base_asset_pack(profile_name, target_id, room_count):
    assets = []
    for index in range(room_count):
        group = f"room_{index}"
        assets.append(resource_asset(f"{target_id}_room_{index}_bg", group, {
            "bg_tiles": 24 + (index % 4) * 8,
            "bg_palette_colors": 16,
        }))
        assets.append(resource_asset(f"{target_id}_room_{index}_obj", group, {
            "obj_tiles": 8 + (index % 3) * 4,
            "obj_palette_colors": 16,
            "oam_sprites": 8,
        }))
    if profile_name == "sprites_oam_heavy":
        assets.append(resource_asset("sprites_oam_heavy_actor_bank", "room_0", {
            "obj_tiles": 880,
            "obj_palette_colors": 224,
            "oam_sprites": 104,
        }))
        assets.append(resource_asset("sprites_oam_optional_overflow", "room_1", {
            "oam_sprites": 200,
        }, optional=True))
    elif profile_name == "tilesets_vram_heavy":
        assets.append(resource_asset("tilesets_vram_heavy_bg_bank", "room_0", {
            # BG 896..1023 pertence a UI; com os tres bancos-base (96 tiles),
            # 792 pressiona 99% dos 896 tiles realmente disponiveis sem invadir UI.
            "bg_tiles": 792,
            "bg_palette_colors": 192,
        }))
        assets.append(resource_asset("tilesets_vram_heavy_obj_bank", "room_1", {
            "obj_tiles": 640,
            "obj_palette_colors": 128,
        }))
        assets.append(resource_asset("tilesets_vram_optional_palette_overflow", "room_2", {
            "bg_palette_colors": 80,
        }, optional=True))
    elif profile_name in ("audio_heavy", "hardware_contention"):
        assets.append({
            "name": "audio_heavy",
            "id": "audio_heavy",
            "bank_group": "audio",
            "kind": "audio",
            "audio_json": "audio_heavy.json",
        })
        assets.append(resource_asset("audio_heavy_pcm_budget", "audio", {
            "pcm_bytes": 60000,
        }))
        assets.append(resource_asset("audio_heavy_optional_pcm_overflow", "audio", {
            "pcm_bytes": 8000,
        }, optional=True))
        if profile_name == "hardware_contention":
            assets.append(resource_asset("hardware_contention_bg", "room_0", {
                "bg_tiles": 720,
                "bg_palette_colors": 176,
            }))
            assets.append(resource_asset("hardware_contention_obj", "room_0", {
                "obj_tiles": 544,
                "obj_palette_colors": 112,
                "oam_sprites": 100,
            }))
    return {
        "stress_profile": profile_name,
        "assets": assets,
    }


def build_topdown_project(profile):
    room_count = int(profile.get("rooms", 2))
    npcs_per_room = int(profile.get("npcs_per_room", 2))
    width = 12
    height = 10
    rooms = []
    for index in range(room_count):
        npcs = []
        for npc in range(npcs_per_room):
            npcs.append({
                "name": f"npc_{index}_{npc}",
                "position": {"x": 24 + npc * 16, "y": 24 + (npc % 2) * 16},
                "size": {"x": 16, "y": 16},
                "direction": "down",
                "collision_group": 1,
                "movement": {
                    "kind": "patrol_horizontal" if npc % 2 == 0 else "wander_box",
                    "bounds": {"x": 16, "y": 16, "width": 96, "height": 48},
                    "step_interval_frames": 8,
                },
                "on_interact": [
                    {"op": "show_dialogue", "line": index % 3},
                    {"op": "set_variable", "variable": npc, "value": index + npc},
                ],
            })
        portals = []
        for portal in range(int(profile.get("portals_per_room", 1))):
            target_room = (index + portal + 1) % room_count
            portals.append({
                "area": {"x": 8 + portal * 16, "y": 8, "width": 8, "height": 16},
                "target_room": target_room,
                "target_position": {"x": 24, "y": 40},
                "script": [
                    {"op": "play_sfx", "index": 0},
                    {"op": "warp", "room": target_room, "x": 24, "y": 40},
                ],
            })
        metadata = {
            "camera_mode": "follow",
            "player_start": {"x": 24, "y": 40},
            "backdrop_color": 31 + index,
        }
        if profile.get("stress_profile") in ("audio_heavy", "hardware_contention") and index == 0:
            metadata["music_index"] = 0
        on_enter = [{"op": "show_dialogue_if", "line": index % 3, "variable": 0, "value": 0}]
        if profile.get("stress_profile") == "hardware_contention" and index == 0:
            on_enter.append({
                "op": "visual_effect",
                "effect": "wave",
                "layer": "bg0",
                "frames": 3600,
                "intensity": 80,
            })
        rooms.append({
            "name": f"stress_room_{index}",
            "resource_bank_group": f"room_{index}",
            "width_tiles": width,
            "height_tiles": height,
            "visual_tiles": tiled_values(width, height, index),
            "collision_flags": collision_values(width, height),
            "metadata": metadata,
            "on_enter": on_enter,
            "interactions": [{
                "area": {"x": 32, "y": 32, "width": 16, "height": 16},
                "script": [{"op": "add_variable", "variable": 1, "value": 1}],
            }],
            "triggers": [{
                "area": {"x": 48, "y": 48, "width": 16, "height": 16},
                "kind": "damage",
                "cooldown_frames": 30,
                "on_enter": [{"op": "set_variable", "variable": 2, "value": index}],
            }],
            "npcs": npcs,
            "portals": portals,
        })
    project = {
        "initial_room": 0,
        "resource_banks": "asset_pack",
        "save": {"enabled": True, "signature": "GBST", "offset": 0, "slot_capacity": 768, "slot_count": 3, "version": 1},
        "rooms": rooms,
        "player": {"position": {"x": 24, "y": 40}, "size": {"x": 16, "y": 16}, "speed": 1, "emit_animation_fallback": True},
        "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        "dialogue_lines": ["Stress hello", "Stress NPC", "Stress portal"],
        "choice_groups": [{"line": 0, "variable": 4, "choices": [{"text": "OK", "value": 1}, {"text": "NEXT", "value": 2}]}],
    }
    if profile.get("stress_profile") in ("audio_heavy", "hardware_contention"):
        project["includes"] = ["audio_heavy.hpp"]
        project["assets"] = {
            "sfx_assets": [{"symbol": "audio_heavy_sfx_assets[0]"}],
            "music_assets": [{"symbol": "audio_heavy_music_assets[0]"}],
            "pcm_assets": [{"symbol": "audio_heavy_pcm_assets[0]"}],
        }
    return project


def write_audio_heavy_json(path):
    payload = {
        "sfx": [{
            "name": "portal",
            "tones": [
                {"frequency_hz": 988, "duration_frames": 8, "volume": 15, "duty": 2, "noise": False},
                {"frequency_hz": 1319, "duration_frames": 8, "volume": 13, "duty": 2, "noise": False},
                {"frequency_hz": 1760, "duration_frames": 12, "volume": 12, "duty": 1, "noise": False},
            ],
        }],
        "music": [{
            "name": "stress_loop",
            "loop": True,
            "steps": [
                {"frequency_hz": 262, "duration_frames": 12, "volume": 8, "duty": 2},
                {"frequency_hz": 330, "duration_frames": 12, "volume": 8, "duty": 2},
                {"frequency_hz": 392, "duration_frames": 12, "volume": 8, "duty": 2},
                {"frequency_hz": 523, "duration_frames": 24, "volume": 7, "duty": 1},
            ],
        }],
        "pcm": [{
            "name": "click",
            "sample_rate_hz": 8000,
            "loop": False,
            "samples": [0, 32, 64, 32, 0, -32, -64, -32, 0, 24, 48, 24, 0, -24, -48, -24],
        }],
    }
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def build_platformer_project(profile):
    room_count = int(profile.get("rooms", 3))
    width = 14
    height = 8
    rooms = []
    for index in range(room_count):
        next_room = (index + 1) % room_count
        rooms.append({
            "name": f"stress_platformer_{index}",
            "resource_bank_group": f"room_{index}",
            "width_tiles": width,
            "height_tiles": height,
            "visual_tiles": tiled_values(width, height, index),
            "collision_flags": collision_values(width, height, platformer=True),
            "player_start": {"x": 16, "y": 32, "width": 16, "height": 16},
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
            "on_enter": [{"op": "set_variable", "variable": index, "value": 1}],
            "hazards": [{
                "area": {"x": 64, "y": 64, "width": 16, "height": 8},
                "damage": 1,
                "respawn": True,
                "on_hit": [{"op": "warp", "room": next_room, "x": 16, "y": 32}],
            }],
            "checkpoints": [{
                "area": {"x": 32, "y": 40, "width": 16, "height": 16},
                "respawn_position": {"x": 32, "y": 40},
                "id": index + 1,
                "on_activate": [{"op": "set_variable", "variable": 10 + index, "value": 1}],
            }],
            "camera_zones": [{
                "area": {"x": 0, "y": 0, "width": 160, "height": 96},
                "bounds": {"x": 0, "y": 0, "width": 224, "height": 128},
                "offset": {"x": index, "y": 0},
                "lock_x": False,
                "lock_y": index % 2 == 0,
                "on_enter": [{"op": "set_camera_position", "x": index, "y": 0}],
            }],
            "enemies": [{
                "bounds": {"x": 48, "y": 32, "width": 16, "height": 16},
                "patrol_bounds": {"x": 32, "y": 32, "width": 64, "height": 16},
                "velocity_x256": {"x": 256, "y": 0},
                "damage": 1,
                "active": True,
                "facing_right": True,
            }],
            "moving_platforms": [{
                "bounds": {"x": 40, "y": 56, "width": 32, "height": 8},
                "start": {"x": 40, "y": 56},
                "end": {"x": 96, "y": 56},
                "velocity_x256": {"x": 256, "y": 0},
                "active": True,
                "forward": True,
            }],
        })
    return {
        "initial_room": 0,
        "backdrop_color": 99,
        "resource_banks": "asset_pack",
        "save": {"enabled": True, "signature": "GBPF", "offset": 0, "slot_capacity": 512, "slot_count": 2, "version": 1},
        "config": {"gravity_x256": 56, "jump_speed_x256": 1280, "ladders_enabled": True},
        "rooms": rooms,
    }


def build_isometric_project(profile):
    room_count = int(profile.get("rooms", 3))
    actor_count = int(profile.get("actors_per_room", 4))
    width = 8
    height = 8
    rooms = []
    for index in range(room_count):
        actors = []
        for actor in range(actor_count):
            actors.append({
                "tile": {"x": 1 + (actor % 4), "y": 1 + (actor // 4), "z": actor % 2},
                "screen_offset": {"x": -8, "y": -16 - (actor % 2) * 4},
                "tile_index": 0,
                "palette": 0,
                "visible": True,
                "priority": actor % 4,
                "on_interact": [{"op": "show_dialogue", "line": actor % 2}],
            })
        rooms.append({
            "name": f"stress_iso_{index}",
            "resource_bank_group": f"room_{index}",
            "width_tiles": width,
            "height_tiles": height,
            "visual_tiles": tiled_values(width, height, index),
            "collision_flags": collision_values(width, height),
            "camera": {
                "position": {"x": 0, "y": 0},
                "bounds": {"x": 0, "y": 0, "width": 256, "height": 160},
                "bounds_enabled": True,
            },
            "on_enter": [{"op": "set_variable", "variable": index, "value": 4}],
            "actors": actors,
        })
    return {
        "initial_room": 0,
        "backdrop_color": 123,
        "resource_banks": "asset_pack",
        "save": {"enabled": True, "signature": "GBIS", "offset": 1024, "slot_capacity": 512, "slot_count": 2, "version": 1},
        "grid": {"tile_width_pixels": 32, "tile_height_pixels": 16, "origin": {"x": 120, "y": 24}},
        "rooms": rooms,
    }


def build_shmup_project(profile):
    wave_count = int(profile.get("waves", 8))
    enemies_per_wave = int(profile.get("enemies_per_wave", 12))
    waves = []
    for wave_index in range(wave_count):
        enemies = []
        for enemy_index in range(enemies_per_wave):
            enemies.append({
                "name": f"wave_{wave_index}_enemy_{enemy_index}",
                "position": {
                    "x": 8 + ((enemy_index * 19 + wave_index * 7) % 216),
                    "y": 8 + (enemy_index % 3) * 12,
                },
                "size": {"x": 16, "y": 16},
                "velocity": {"x": (enemy_index % 3) - 1, "y": 1 + (wave_index % 2)},
                "movement": ("linear", "sine", "dive")[enemy_index % 3],
                "health": 1 + (enemy_index % 4),
                "score": 100 + wave_index * 25 + enemy_index * 10,
                "fire_interval": 18 + (enemy_index % 5) * 6,
                "projectile_offset": {"x": 6, "y": 12},
                "on_destroy": [{"op": "add_variable", "variable": 1, "value": 1}],
            })
        waves.append({
            "name": f"stress_wave_{wave_index}",
            "start_frame": 0,
            "player_speed": 3 + (wave_index % 2),
            "fire_cooldown": max(3, 8 - (wave_index % 5)),
            "next_wave": (wave_index + 1) % wave_count,
            "on_start": [{"op": "set_variable", "variable": 0, "value": wave_index}],
            "on_clear": [{"op": "add_variable", "variable": 2, "value": 1}],
            "enemies": enemies,
        })
    return {
        "initial_wave": 0,
        "save": {"enabled": True, "signature": "GBSH", "slot_capacity": 1024, "slot_count": 1},
        "dialogue_lines": ["Stress SHMUP", "Wave clear"],
        "player": {
            "position": {"x": 112, "y": 128},
            "size": {"x": 16, "y": 16},
            "speed": 3,
            "fire_cooldown": 6,
            "projectile_offset": {"x": 6, "y": -4},
            "on_fire": [{"op": "add_variable", "variable": 3, "value": 1}],
        },
        "projectile": {"size": {"x": 4, "y": 8}, "velocity": {"x": 0, "y": -4}, "max_active": 12},
        "enemy_projectile": {
            "size": {"x": 4, "y": 8},
            "velocity": {"x": 0, "y": 2},
            "max_active": 24,
            "on_hit_player": [{"op": "set_variable", "variable": 4, "value": 1}],
        },
        "waves": waves,
    }


def build_point_click_project(profile):
    scene_count = int(profile.get("scenes", 8))
    hotspots_per_scene = int(profile.get("hotspots_per_scene", 12))
    scenes = []
    for scene_index in range(scene_count):
        hotspots = []
        for hotspot_index in range(hotspots_per_scene):
            hotspots.append({
                "name": f"scene_{scene_index}_hotspot_{hotspot_index}",
                "area": {
                    "x": 8 + (hotspot_index % 6) * 36,
                    "y": 24 + (hotspot_index // 6) * 48,
                    "width": 24,
                    "height": 32,
                },
                "line": hotspot_index % 3,
                "target_scene": (scene_index + 1) % scene_count if hotspot_index == 0 else -1,
                "on_click": [{"op": "add_variable", "variable": hotspot_index % 8, "value": 1}],
            })
        scenes.append({
            "name": f"stress_point_click_{scene_index}",
            "background": -1,
            "cursor_speed": 3 + (scene_index % 2),
            "on_enter": [{"op": "set_variable", "variable": 0, "value": scene_index}],
            "hotspots": hotspots,
        })
    return {
        "initial_scene": 0,
        "cursor_start": {"x": 120, "y": 80},
        "cursor_speed": 3,
        "save": {"enabled": True, "signature": "GBPC", "slot_capacity": 1024, "slot_count": 1},
        "dialogue_lines": ["Stress point click", "Hotspot", "Next scene"],
        "inventory_items": [],
        "scenes": scenes,
    }


def build_dungeon_crawler_project(profile):
    room_count = int(profile.get("rooms", 6))
    width = int(profile.get("width_tiles", 15))
    height = int(profile.get("height_tiles", 15))
    rooms = []
    for room_index in range(room_count):
        rooms.append({
            "name": f"stress_dungeon_{room_index}",
            "width_tiles": width,
            "height_tiles": height,
            "collision_flags": collision_values(width, height),
            "config": {
                "step_duration_frames": 6 + (room_index % 4),
                "turn_duration_frames": 4 + (room_index % 3),
                "allow_backstep": room_index % 2 == 0,
                "view_distance": 10,
            },
            "player_start": {"x": 1, "y": 1, "direction": "east"},
        })
    return {"initial_room": 0, "rooms": rooms, "dialogue_lines": []}


def build_racing_project(profile):
    room_count = int(profile.get("rooms", 6))
    width = int(profile.get("width_tiles", 30))
    height = int(profile.get("height_tiles", 80))
    rooms = []
    for room_index in range(room_count):
        rooms.append({
            "name": f"stress_track_{room_index}",
            "width_tiles": width,
            "height_tiles": height,
            "collision_flags": collision_values(width, height),
            "config": {
                "max_speed_x256": 1536 + room_index * 64,
                "acceleration_x256_per_second": 2560,
                "brake_power_x256_per_second": 3584,
                "steering_speed_x256": 640,
            },
            "player_start_pixels": {"x": (width * 8) // 2, "y": (height * 8) - 32},
        })
    return {"initial_room": 0, "rooms": rooms}


def project_manifest(engine_pack, target_id, profile):
    kind = profile.get("kind", "topdown")
    template = {
        "topdown": "exported_topdown",
        "platformer": "exported_platformer",
        "isometric": "exported_isometric",
        "shmup": "exported_shmup",
        "point_click": "exported_point_click",
        "dungeon_crawler": "exported_dungeon_crawler",
        "racing": "exported_racing",
    }[kind]
    project_data = {
        "topdown": "gbastudio_project_data.hpp",
        "platformer": "platformer_project_data.hpp",
        "isometric": "isometric_project_data.hpp",
        "shmup": "shmup_project_data.hpp",
        "point_click": "point_click_project_data.hpp",
        "dungeon_crawler": "dungeon_crawler_project_data.hpp",
        "racing": "racing_project_data.hpp",
    }[kind]
    profile_name = profile.get("stress_profile", target_id)
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": kind,
        "template_dir": str(engine_pack / "templates" / template),
        "entry": "main.cpp",
        "project_data": project_data,
        "generated_assets": [],
        "build": {"target": f"stress_{target_id}", "make_target": "all"},
        "requires": {
            "engine_pack": ">=1.23.0",
            "features": [
                "diagnostics.stress_projects_cli",
                "resource_managers.assetc_bank_usage_report",
                "resource_managers.resource_stream_diagnostics",
                "resource_managers.resource_bank_group_upload_streaming",
            ],
        },
        "asset_pack": base_asset_pack(profile_name, target_id, int(profile.get("rooms", 2))),
    }
    if kind == "topdown":
        manifest["requires"]["features"].extend(["topdown_project_data", "room_streaming.multiple_rooms", "dialogue.visual_box"])
        manifest["topdown_project"] = build_topdown_project(profile)
    elif kind == "platformer":
        manifest["requires"]["features"].extend(["platformer_runtime", "platformer_runtime.enemies", "platformer_runtime.moving_platforms"])
        manifest["platformer_project"] = build_platformer_project(profile)
    elif kind == "isometric":
        manifest["requires"]["features"].extend(["isometric_runtime", "isometric_runtime.iso_bfs_path_step", "isometric_runtime.iso_diamond_picking"])
        manifest["isometric_project"] = build_isometric_project(profile)
    elif kind == "shmup":
        manifest["requires"]["features"].extend(["shmup_runtime", "engine_sdk.shmup_project_data_contract"])
        manifest["shmup_project"] = build_shmup_project(profile)
    elif kind == "point_click":
        manifest["requires"]["features"].extend(["point_click_runtime", "engine_sdk.point_click_project_data_contract"])
        manifest["point_click_project"] = build_point_click_project(profile)
    elif kind == "dungeon_crawler":
        manifest["requires"]["features"].extend(["dungeon_crawler_runtime", "engine_sdk.dungeon_crawler_project_data_contract"])
        manifest["dungeon_crawler_project"] = build_dungeon_crawler_project(profile)
    else:
        manifest["requires"]["features"].extend(["racing_runtime", "engine_sdk.racing_project_data_contract"])
        manifest["racing_project"] = build_racing_project(profile)
    return manifest


def run_stress_target(engine_pack, build_root, target_id, profile, skip_build):
    assetc = engine_pack / "tools" / "assetc"
    doctor = engine_pack / "tools" / "gbsdoctor"
    builder = engine_pack / "tools" / "gbsbuild"
    source_dir = build_root / f"{target_id}_source"
    project_dir = build_root / target_id
    if source_dir.exists():
        shutil.rmtree(source_dir)
    if project_dir.exists():
        shutil.rmtree(project_dir)
    source_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = source_dir / "export_project.json"
    if profile.get("stress_profile") in ("audio_heavy", "hardware_contention"):
        write_audio_heavy_json(source_dir / "audio_heavy.json")
    manifest_path.write_text(json.dumps(project_manifest(engine_pack, target_id, profile), indent=2, sort_keys=True) + "\n", encoding="utf-8")

    assetc_result = run_command([str(assetc), str(manifest_path), "-o", str(project_dir), "--export-project-json"])
    doctor_result = run_command([str(doctor), "--engine-pack", str(engine_pack), "--project-dir", str(project_dir), "--json"]) if assetc_result["ok"] else None
    dry_run_result = run_command([str(builder), "--engine-pack", str(engine_pack), "--project-dir", str(project_dir), "--dry-run", "--json"]) if assetc_result["ok"] else None
    build_result = None
    if assetc_result["ok"] and not skip_build:
        build_result = run_command([str(builder), "--engine-pack", str(engine_pack), "--project-dir", str(project_dir)])

    target_name = f"stress_{target_id}"
    rom_path = project_dir / "build" / f"{target_name}.gba"
    asset_pack_report_path = project_dir / "asset_pack_report.json"
    asset_pack_report = None
    if asset_pack_report_path.exists():
        asset_pack_report = json.loads(asset_pack_report_path.read_text(encoding="utf-8"))
    ok = assetc_result["ok"] and (doctor_result is not None and doctor_result["ok"]) and (dry_run_result is not None and dry_run_result["ok"]) and (skip_build or (build_result is not None and build_result["ok"] and rom_path.exists()))
    errors = []
    for result in (assetc_result, doctor_result, dry_run_result, build_result):
        if result is not None and result.get("stderr"):
            errors.append(result["stderr"])
    return {
        "target": target_id,
        "kind": profile.get("kind", "topdown"),
        "project_dir": str(project_dir),
        "source_manifest": str(manifest_path),
        "rom": str(rom_path),
        "ok": ok,
        "assetc_ok": assetc_result["ok"],
        "doctor_ok": bool(doctor_result and doctor_result["ok"]),
        "dry_run_ok": bool(dry_run_result and dry_run_result["ok"]),
        "build_ok": None if skip_build else bool(build_result and build_result["ok"]),
        "rom_exists": rom_path.exists(),
        "asset_pack_report": asset_pack_report,
        "streaming_calibration": streaming_calibration(profile, asset_pack_report),
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser(description="Run large stress projects against a GBAStudio Engine Pack")
    parser.add_argument("--engine-pack", default=None)
    parser.add_argument("--build-root", default="build/stress-projects")
    parser.add_argument("--profiles", default=None)
    parser.add_argument("--only", action="append", choices=TARGET_IDS)
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--output", default=None)
    args = parser.parse_args()

    if args.engine_pack:
        engine_pack = resolve_engine_pack(args.engine_pack)
    else:
        script_path = Path(__file__).resolve()
        engine_pack = script_path.parents[1] if script_path.parent.name == "tools" else (Path.cwd() / "dist" / "GBAStudioEnginePack").resolve()
    build_root = Path(args.build_root).expanduser()
    if not build_root.is_absolute():
        build_root = (Path.cwd() / build_root).resolve()
    output_path = Path(args.output).expanduser().resolve() if args.output else build_root / "stress_report.json"
    profiles = load_profiles(engine_pack, args.profiles)
    selected = tuple(args.only) if args.only else TARGET_IDS
    missing = [target for target in selected if target not in profiles]
    if missing:
        raise SystemExit(f"stress profile ausente: {', '.join(missing)}")

    build_root.mkdir(parents=True, exist_ok=True)
    results = [run_stress_target(engine_pack, build_root, target, profiles[target], args.skip_build) for target in selected]
    report = {
        "ok": all(result["ok"] for result in results),
        "engine_pack": str(engine_pack),
        "build_root": str(build_root),
        "skip_build": args.skip_build,
        "targets": list(selected),
        "results": results,
    }
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        status = "OK" if report["ok"] else "FAIL"
        print(f"stress_projects: {status}")
        for result in results:
            marker = "OK" if result["ok"] else "FAIL"
            print(f"[{marker}] {result['target']}: {result['rom']}")
        print(f"Relatorio: {output_path}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
