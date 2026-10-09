#!/usr/bin/env python3
import argparse
from datetime import datetime, timezone
import json
import shutil
import subprocess
import sys
from pathlib import Path


RUNTIME_PROFILE_TARGETS = {
    "point_click": "point_click_project",
    "shmup": "shmup_project",
    "visual_novel": "visual_novel_project",
    "menu": "menu_project",
    "cutscene": "cutscene_project",
    "world_map": "world_map_project",
}

SMOKE_TARGETS = (
    "topdown",
    "platformer",
    "isometric",
    "exported",
    "point_click",
    "shmup",
    "visual_novel",
    "menu",
    "cutscene",
    "world_map",
)


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


def utc_now():
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def write_readiness_evidence(path, checked_at, source, message):
    payload = {
        "manual_mgba_stress_smoke": {
            "ok": False,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "mGBA stress smoke report path",
            "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
            "message": "Confirm stress ROMs manually with scripts/smoke_mgba.sh --stress --manual-pass.",
        },
        "hardware_or_ci_validation": {
            "ok": False,
            "evidence_type": "hardware_real",
            "source": "hardware test log, CI run URL, or CI job id",
            "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
            "message": "Validate on real hardware or cross-platform CI.",
            "validated_platforms": [],
        },
        "gba_studio_engine_primary_rollout": {
            "ok": True,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": source,
            "checked_at": checked_at,
            "message": message,
        },
    }
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return payload


def copy_tree_contents(source, destination):
    destination.mkdir(parents=True, exist_ok=True)
    for item in source.iterdir():
        target = destination / item.name
        if item.is_dir():
            if target.exists():
                shutil.rmtree(target)
            shutil.copytree(item, target)
        else:
            shutil.copy2(item, target)


def prepare_template_project(engine_pack, build_root, target):
    template_id = {
        "topdown": "topdown_basic",
        "platformer": "platformer_basic",
        "isometric": "isometric_basic",
    }[target]
    project_dir = build_root / target
    if project_dir.exists():
        shutil.rmtree(project_dir)
    copy_tree_contents(engine_pack / "templates" / template_id, project_dir)
    return project_dir


def write_export_project_manifest(engine_pack, build_root):
    project_dir = build_root / "exported"
    source_dir = build_root / "export_source"
    if project_dir.exists():
        shutil.rmtree(project_dir)
    if source_dir.exists():
        shutil.rmtree(source_dir)
    source_dir.mkdir(parents=True, exist_ok=True)
    manifest_path = source_dir / "export_project.json"
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(engine_pack / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {
            "target": "production_exported_smoke",
            "make_target": "all",
        },
        "requires": {
            "engine_pack": ">=1.22.0",
            "features": [
                "topdown_project_data",
                "dialogue",
                "asset-export-topdown-project-data",
                "template_production_cost_smoke",
            ],
        },
        "topdown_project": {
            "initial_room": 0,
            "rooms": [
                {
                    "name": "production_smoke_room",
                    "width_tiles": 4,
                    "height_tiles": 4,
                    "visual_tiles": [
                        0, 0, 0, 0,
                        0, 1, 1, 0,
                        0, 1, 1, 0,
                        0, 0, 0, 0,
                    ],
                    "collision_flags": [
                        1, 1, 1, 1,
                        1, 0, 0, 1,
                        1, 0, 0, 1,
                        1, 1, 1, 1,
                    ],
                    "metadata": {
                        "camera_mode": "follow",
                        "player_start": {"x": 16, "y": 16},
                        "backdrop_color": 31,
                    },
                    "on_enter": [{"op": "show_dialogue", "line": 0}],
                    "interactions": [
                        {
                            "area": {"x": 16, "y": 16, "width": 16, "height": 16},
                            "script": [{"op": "set_variable", "variable": 1, "value": 7}],
                        }
                    ],
                    "portals": [
                        {
                            "area": {"x": 24, "y": 16, "width": 8, "height": 16},
                            "target_room": 0,
                            "target_position": {"x": 16, "y": 16},
                            "script": [{"op": "warp", "room": 0, "x": 16, "y": 16}],
                        }
                    ],
                }
            ],
            "player": {
                "position": {"x": 16, "y": 16},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "emit_animation_fallback": True,
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
            "dialogue_lines": ["Production smoke"],
        },
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest_path, project_dir


def runtime_profile_project_payload(target):
    return {
        "initial_room": 0,
        "rooms": [
            {
                "name": f"production_{target}_room",
                "width_tiles": 4,
                "height_tiles": 4,
                "visual_tiles": [
                    0, 0, 0, 0,
                    0, 1, 1, 0,
                    0, 1, 1, 0,
                    0, 0, 0, 0,
                ],
                "collision_flags": [
                    1, 1, 1, 1,
                    1, 0, 0, 1,
                    1, 0, 0, 1,
                    1, 1, 1, 1,
                ],
                "metadata": {
                    "camera_mode": "fixed",
                    "camera_position": {"x": 0, "y": 0},
                    "player_start": {"x": 16, "y": 16},
                    "backdrop_color": 31,
                },
                "on_enter": [{"op": "show_dialogue", "line": 0}],
                "interactions": [
                    {
                        "area": {"x": 16, "y": 16, "width": 16, "height": 16},
                        "script": [{"op": "set_variable", "variable": 1, "value": 7}],
                    }
                ],
            }
        ],
        "player": {
            "position": {"x": 16, "y": 16},
            "size": {"x": 16, "y": 16},
            "speed": 1,
            "emit_animation_fallback": True,
        },
        "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        "dialogue_lines": [f"Production {target} smoke"],
    }


def point_click_project_payload():
    return {
        "initial_scene": 0,
        "cursor_start": {"x": 120, "y": 80},
        "cursor_speed": 2,
        "save": {"enabled": True, "signature": "GBPC", "slot_capacity": 1024, "slot_count": 1},
        "dialogue_lines": [
            "Production point click smoke",
            "Hotspot acionado.",
            "Cena final point click.",
            "Item coletado.",
            "Precisa do item.",
            "Item selecionado.",
        ],
        "inventory_items": [
            {"id": "key", "name": "key", "variable": 2, "line": 5},
        ],
        "scenes": [
            {
                "name": "room",
                "background": -1,
                "on_enter": [{"op": "show_dialogue", "line": 0}],
                "hotspots": [
                    {
                        "name": "key",
                        "area": {"x": 48, "y": 96, "width": 16, "height": 16},
                        "line": 3,
                        "give_item": "key",
                    },
                    {
                        "name": "door",
                        "area": {"x": 112, "y": 72, "width": 24, "height": 32},
                        "line": 1,
                        "target_scene": 1,
                        "required_item": "key",
                        "unavailable_line": 4,
                        "on_use_item": [{"op": "set_variable", "variable": 0, "value": 1}],
                    }
                ],
            },
            {
                "name": "inside",
                "background": -1,
                "on_enter": [{"op": "show_dialogue", "line": 2}],
                "hotspots": [],
            },
        ],
    }


def shmup_project_payload():
    return {
        "initial_wave": 0,
        "save": {"enabled": True, "signature": "GBSH", "slot_capacity": 1024, "slot_count": 1},
        "dialogue_lines": [
            "Production shmup smoke",
            "Enemy destroyed",
        ],
        "player": {
            "position": {"x": 112, "y": 128},
            "size": {"x": 16, "y": 16},
            "speed": 2,
            "fire_cooldown": 8,
            "projectile_offset": {"x": 6, "y": -4},
        },
        "projectile": {
            "size": {"x": 4, "y": 8},
            "velocity": {"x": 0, "y": -4},
            "max_active": 6,
        },
        "enemy_projectile": {
            "size": {"x": 4, "y": 8},
            "velocity": {"x": 0, "y": 2},
            "max_active": 8,
            "on_hit_player": [{"op": "set_variable", "variable": 2, "value": 1}],
        },
        "waves": [
            {
                "name": "wave0",
                "start_frame": 0,
                "next_wave": 1,
                "on_clear": [{"op": "set_variable", "variable": 3, "value": 1}],
                "on_start": [{"op": "show_dialogue", "line": 0}],
                "enemies": [
                    {
                        "name": "scout",
                        "position": {"x": 48, "y": 16},
                        "size": {"x": 16, "y": 16},
                        "velocity": {"x": 0, "y": 1},
                        "movement": "linear",
                        "health": 1,
                        "score": 100,
                        "fire_interval": 24,
                        "projectile_offset": {"x": 6, "y": 12},
                        "on_destroy": [{"op": "show_dialogue", "line": 1}],
                    },
                    {
                        "name": "dive",
                        "position": {"x": 160, "y": 20},
                        "size": {"x": 16, "y": 16},
                        "velocity": {"x": -1, "y": 1},
                        "movement": "dive",
                        "health": 2,
                        "score": 150,
                        "fire_interval": 0,
                    },
                ],
            },
            {
                "name": "wave1",
                "start_frame": 0,
                "enemies": [
                    {
                        "name": "sine",
                        "position": {"x": 100, "y": 12},
                        "size": {"x": 16, "y": 16},
                        "velocity": {"x": 0, "y": 1},
                        "movement": "sine",
                        "health": 1,
                        "score": 200,
                        "fire_interval": 30,
                    },
                ],
            }
        ],
    }


def visual_novel_project_payload():
    return {
        "initial_scene": 0,
        "save": {"enabled": True, "signature": "GBVN", "slot_capacity": 1024, "slot_count": 1},
        "dialogue_lines": [
            "Production visual novel smoke",
            "Escolha um caminho.",
            "Cena final pronta.",
            "Cena secreta pronta.",
        ],
        "choice_groups": [
            {
                "line": 1,
                "variable": 0,
                "choices": [
                    {
                        "text": "OK",
                        "value": 1,
                        "next_scene": 2,
                        "on_select": [{"op": "set_variable", "variable": 2, "value": 1}],
                    },
                    {
                        "text": "Segredo",
                        "value": 2,
                        "required_variable": 1,
                        "required_value": 1,
                        "next_scene": 3,
                    },
                    {"text": "Fim", "value": 3, "next_scene": 2},
                ],
            }
        ],
        "scenes": [
            {
                "name": "intro",
                "background": -1,
                "line": 0,
                "choice_group": -1,
                "next_scene": 1,
                "on_enter": [
                    {"op": "show_dialogue", "line": 0},
                    {"op": "set_variable", "variable": 1, "value": 1},
                ],
                "auto_advance": False,
            },
            {
                "name": "choice",
                "background": -1,
                "line": -1,
                "choice_group": 0,
                "next_scene": 2,
                "auto_advance": False,
            },
            {
                "name": "end",
                "background": -1,
                "line": 2,
                "choice_group": -1,
                "next_scene": -1,
                "on_enter": [{"op": "show_dialogue", "line": 2}],
                "auto_advance": False,
            },
            {
                "name": "secret",
                "background": -1,
                "line": 3,
                "choice_group": -1,
                "next_scene": -1,
                "on_enter": [{"op": "show_dialogue", "line": 3}],
                "auto_advance": False,
            },
        ],
    }


def menu_project_payload():
    return {
        "initial_screen": 0,
        "save": {
            "enabled": True,
            "signature": "GBMN",
            "slot_capacity": 1024,
            "slot_count": 1,
        },
        "dialogue_lines": [
            "Production menu smoke",
            "> Continue",
            "> Start",
            "> Options",
            "Start selecionado.",
            "Options screen.",
            "> Sound",
            "> Volume",
            "> Back",
        ],
        "screens": [
            {
                "name": "main",
                "background": -1,
                "title_line": 0,
                "items": [
                    {
                        "label": "continue",
                        "line": 1,
                        "required_variable": 0,
                        "required_value": 1,
                        "hide_when_unavailable": True,
                    },
                    {
                        "label": "start",
                        "line": 2,
                        "on_select": [
                            {"op": "show_dialogue", "line": 4},
                            {"op": "set_variable", "variable": 0, "value": 1},
                        ],
                    },
                    {
                        "label": "options",
                        "line": 3,
                        "target_screen": 1,
                        "action": "push_screen",
                        "on_select": [{"op": "set_variable", "variable": 0, "value": 1}],
                    },
                ],
            },
            {
                "name": "options",
                "background": -1,
                "title_line": 5,
                "on_enter": [{"op": "show_dialogue", "line": 5}],
                "items": [
                    {
                        "label": "sound",
                        "line": 6,
                        "action": "toggle_variable",
                        "toggle_variable": 1,
                    },
                    {
                        "label": "volume",
                        "line": 7,
                        "action": "adjust_variable",
                        "adjust_variable": 2,
                        "min": 0,
                        "max": 10,
                        "step": 2,
                    },
                    {
                        "label": "back",
                        "line": 8,
                        "action": "pop_screen",
                    },
                ],
            },
        ],
    }


def cutscene_project_payload():
    return {
        "initial_scene": 0,
        "save": {
            "enabled": True,
            "signature": "GBCS",
            "slot_capacity": 1024,
            "slot_count": 1,
        },
        "dialogue_lines": [
            "Production cutscene smoke",
            "Step com script executado.",
            "Cutscene finalizada.",
            "Branch secreto.",
        ],
        "scenes": [
            {
                "name": "intro",
                "background": -1,
                "next_scene": -1,
                "steps": [
                    {
                        "line": 0,
                        "duration_frames": 8,
                        "auto_advance": True,
                    },
                    {
                        "line": 1,
                        "duration_frames": 8,
                        "script": [{"op": "set_variable", "variable": 0, "value": 1}],
                    },
                    {
                        "line": 3,
                        "duration_frames": 0,
                        "auto_advance": False,
                        "skippable": False,
                        "wait_for_dialogue": True,
                        "on_skip": [{"op": "set_variable", "variable": 1, "value": 1}],
                        "branch": {
                            "variable": 0,
                            "equals": 1,
                            "target_scene": 1,
                        },
                    },
                ],
            },
            {
                "name": "end",
                "background": -1,
                "steps": [
                    {
                        "line": 2,
                        "duration_frames": 0,
                        "auto_advance": False,
                    },
                ],
            },
        ],
    }


def world_map_project_payload():
    return {
        "initial_node": 0,
        "save": {
            "enabled": True,
            "signature": "GBWM",
            "slot_capacity": 1024,
            "slot_count": 1,
        },
        "dialogue_lines": [
            "Production world map smoke",
            "Forest selected",
            "Castle locked",
        ],
        "nodes": [
            {
                "name": "start",
                "position": {"x": 40, "y": 96},
                "line": 0,
                "connections": ["forest", "castle"],
                "target_level": 0,
                "on_select": [{"op": "set_variable", "variable": 0, "value": 1}],
            },
            {
                "name": "forest",
                "position": {"x": 112, "y": 64},
                "line": 1,
                "connections": ["start", "castle"],
                "target_level": 1,
                "on_select": [
                    {"op": "set_variable", "variable": 2, "value": 1},
                    {"op": "show_dialogue", "line": 1},
                ],
            },
            {
                "name": "castle",
                "position": {"x": 184, "y": 96},
                "line": 2,
                "connections": [0, 1],
                "target_level": 2,
                "required_variable": 2,
                "required_value": 1,
                "locked_line": 2,
                "on_locked": [{"op": "show_dialogue", "line": 2}],
            },
            {
                "name": "secret",
                "position": {"x": 212, "y": 48},
                "line": 2,
                "connections": ["castle"],
                "target_level": 3,
                "unlock_variable": 3,
                "unlock_value": 1,
                "hide_when_locked": True,
            },
        ],
    }


def write_runtime_profile_manifest(engine_pack, build_root, target):
    project_dir = build_root / target
    source_dir = build_root / f"{target}_source"
    if project_dir.exists():
        shutil.rmtree(project_dir)
    if source_dir.exists():
        shutil.rmtree(source_dir)
    source_dir.mkdir(parents=True, exist_ok=True)
    block = RUNTIME_PROFILE_TARGETS[target]
    is_point_click = target == "point_click"
    is_shmup = target == "shmup"
    is_visual_novel = target == "visual_novel"
    is_menu = target == "menu"
    is_cutscene = target == "cutscene"
    is_world_map = target == "world_map"
    is_native_runtime = is_point_click or is_shmup or is_visual_novel or is_menu or is_cutscene or is_world_map
    native_template = (
        "exported_point_click"
        if is_point_click
        else ("exported_shmup" if is_shmup else ("exported_visual_novel" if is_visual_novel else ("exported_menu" if is_menu else ("exported_cutscene" if is_cutscene else "exported_world_map"))))
    )
    native_project_data = (
        "point_click_project_data.hpp"
        if is_point_click
        else ("shmup_project_data.hpp" if is_shmup else ("visual_novel_project_data.hpp" if is_visual_novel else ("menu_project_data.hpp" if is_menu else ("cutscene_project_data.hpp" if is_cutscene else "world_map_project_data.hpp"))))
    )
    native_features = (
        [
            "point_click_runtime",
            "engine_sdk.point_click_project_data_contract",
            "asset-export-point-click-project-data",
            "point_click_inventory_items",
            "point_click_hotspot_item_requirements",
            "point_click_pending_scene_transition",
            "point_click_save_data",
            "point_click_autosave_slot0",
            "point_click_hud_scene_item",
            "save.export_project_config",
            "asset-export-runtime-profile-manifest",
            "runtime_profiles.point_click_native_contract",
            "dialogue.visual_box",
            "events.interaction",
        ]
        if is_point_click
        else ([
            "shmup_runtime",
            "engine_sdk.shmup_project_data_contract",
            "asset-export-shmup-project-data",
            "shmup_save_data",
            "shmup_autosave_slot0",
            "shmup_hud_score_lives_high_score",
            "save.export_project_config",
            "asset-export-runtime-profile-manifest",
            "runtime_profiles.shmup_native_contract",
            "events.interaction",
            "audio.direct_sound_pcm8",
        ] if is_shmup
        else ([
            "visual_novel_runtime",
            "engine_sdk.visual_novel_project_data_contract",
            "asset-export-visual-novel-project-data",
            "visual_novel_choice_conditions",
            "visual_novel_choice_scene_targets",
            "visual_novel_choice_scripts",
            "visual_novel_line_history",
            "visual_novel_save_data",
            "visual_novel_autosave_slot0",
            "visual_novel_hud_scene_history",
            "save.export_project_config",
            "asset-export-runtime-profile-manifest",
            "runtime_profiles.visual_novel_native_contract",
            "dialogue.choice_prompt",
            "events.choice_groups",
        ] if is_visual_novel else [
            "menu_runtime",
            "engine_sdk.menu_project_data_contract",
            "asset-export-menu-project-data",
            "menu_screen_stack",
            "menu_item_conditions",
            "menu_toggle_items",
            "menu_slider_items",
            "menu_save_data",
            "menu_autosave_slot0",
            "menu_hud_screen_stack",
            "save.export_project_config",
            "asset-export-runtime-profile-manifest",
            "runtime_profiles.menu_native_contract",
            "dialogue.visual_box",
            "ui.menu_selection",
            "events.interaction",
        ] if is_menu else [
            "cutscene_runtime",
            "engine_sdk.cutscene_project_data_contract",
            "asset-export-cutscene-project-data",
            "cutscene_branch_steps",
            "cutscene_step_skip_control",
            "cutscene_wait_for_dialogue",
            "cutscene_save_data",
            "cutscene_autosave_slot0",
            "cutscene_hud_scene_step",
            "save.export_project_config",
            "asset-export-runtime-profile-manifest",
            "runtime_profiles.cutscene_native_contract",
            "dialogue.visual_box",
            "events.progressive_event_runner",
        ] if is_cutscene else [
            "world_map_runtime",
            "engine_sdk.world_map_project_data_contract",
            "asset-export-world-map-project-data",
            "asset-export-runtime-profile-manifest",
            "runtime_profiles.world_map_native_contract",
            "world_map_conditional_nodes",
            "world_map_locked_feedback",
            "world_map_hidden_nodes",
            "world_map_save_data",
            "world_map_hud_node_status",
            "save.export_project_config",
            "dialogue.visual_box",
            "events.interaction",
        ]))
    )
    manifest_path = source_dir / "export_project.json"
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": target,
        "template_dir": str(engine_pack / "templates" / (native_template if is_native_runtime else "exported_topdown")),
        "entry": "main.cpp",
        "project_data": native_project_data if is_native_runtime else "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {
            "target": f"production_{target}_smoke",
            "make_target": "all",
        },
        "requires": {
            "engine_pack": ">=1.43.0" if is_shmup else (">=1.44.0" if is_world_map else (">=1.59.0" if is_cutscene else (">=1.59.0" if is_menu else (">=1.45.0" if is_point_click else (">=1.59.0" if is_visual_novel else ">=1.24.0"))))),
            "features": (
                native_features
                if is_native_runtime
                else [
                    "topdown_project_data",
                    "asset-export-runtime-profile-manifest",
                    f"runtime_profiles.{target}_topdown_adapter",
                ]
            ),
        },
        block: (
            point_click_project_payload()
            if is_point_click
            else (shmup_project_payload() if is_shmup else (visual_novel_project_payload() if is_visual_novel else (menu_project_payload() if is_menu else (cutscene_project_payload() if is_cutscene else (world_map_project_payload() if is_world_map else runtime_profile_project_payload(target))))))
        ),
    }
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    return manifest_path, project_dir


def prepare_exported_project(engine_pack, build_root):
    assetc = engine_pack / "tools" / "assetc"
    manifest_path, project_dir = write_export_project_manifest(engine_pack, build_root)
    result = run_command([str(assetc), str(manifest_path), "-o", str(project_dir), "--export-project-json"])
    return project_dir, result


def prepare_runtime_profile_project(engine_pack, build_root, target):
    assetc = engine_pack / "tools" / "assetc"
    manifest_path, project_dir = write_runtime_profile_manifest(engine_pack, build_root, target)
    result = run_command([str(assetc), str(manifest_path), "-o", str(project_dir), "--export-project-json"])
    return project_dir, result


def smoke_project(engine_pack, project_dir, target, skip_build):
    doctor = engine_pack / "tools" / "gbsdoctor"
    builder = engine_pack / "tools" / "gbsbuild"
    target_name = f"production_{target}_smoke"
    doctor_result = run_command([
        str(doctor),
        "--engine-pack",
        str(engine_pack),
        "--project-dir",
        str(project_dir),
        "--json",
    ])
    dry_run_result = run_command([
        str(builder),
        "--engine-pack",
        str(engine_pack),
        "--project-dir",
        str(project_dir),
        "--target",
        target_name,
        "--dry-run",
        "--json",
    ])
    build_result = None
    rom_path = project_dir / "build" / f"{target_name}.gba"
    if not skip_build:
        build_result = run_command([
            str(builder),
            "--engine-pack",
            str(engine_pack),
            "--project-dir",
            str(project_dir),
            "--target",
            target_name,
        ])
    rom_ok = skip_build or rom_path.exists()
    return {
        "target": target,
        "project_dir": str(project_dir),
        "rom": str(rom_path),
        "ok": doctor_result["ok"] and dry_run_result["ok"] and (skip_build or (build_result is not None and build_result["ok"])) and rom_ok,
        "doctor_ok": doctor_result["ok"],
        "dry_run_ok": dry_run_result["ok"],
        "build_ok": None if skip_build else bool(build_result and build_result["ok"]),
        "rom_exists": rom_path.exists(),
        "doctor": doctor_result["json"],
        "build_dry_run": dry_run_result["json"],
        "errors": [
            item["stderr"]
            for item in (doctor_result, dry_run_result, build_result)
            if item is not None and item.get("stderr")
        ],
    }


def resolve_engine_pack(value):
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = Path.cwd() / path
    return path.resolve()


def main():
    parser = argparse.ArgumentParser(description="Run production smoke builds for GBAStudio Engine Pack templates")
    parser.add_argument("--engine-pack", default=None)
    parser.add_argument("--build-root", default="build/production-smoke")
    parser.add_argument("--output", default=None)
    parser.add_argument("--only", action="append", choices=SMOKE_TARGETS)
    parser.add_argument("--skip-build", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--engine-primary-rollout-pass", action="store_true", help="Confirma explicitamente que este smoke conta como evidencia de rollout privado da engine primaria.")
    parser.add_argument("--write-readiness-evidence", help="Grava readiness_evidence.json parcial para o gate gba_studio_engine_primary_rollout.")
    parser.add_argument("--evidence-source", help="Origem registrada na evidencia de rollout privado da engine primaria.")
    parser.add_argument("--evidence-message", help="Mensagem registrada na evidencia de rollout privado da engine primaria.")
    args = parser.parse_args()
    if args.write_readiness_evidence and not args.engine_primary_rollout_pass:
        parser.error("--write-readiness-evidence exige --engine-primary-rollout-pass.")
    if args.write_readiness_evidence and args.skip_build:
        parser.error("--write-readiness-evidence nao pode ser usado com --skip-build.")

    if args.engine_pack:
        engine_pack = resolve_engine_pack(args.engine_pack)
    else:
        script_path = Path(__file__).resolve()
        engine_pack = script_path.parents[1] if script_path.parent.name == "tools" else (Path.cwd() / "dist" / "GBAStudioEnginePack").resolve()

    build_root = Path(args.build_root).expanduser()
    if not build_root.is_absolute():
        build_root = (Path.cwd() / build_root).resolve()
    output_path = Path(args.output).expanduser().resolve() if args.output else build_root / "production_smoke_report.json"
    evidence_path = Path(args.write_readiness_evidence).expanduser().resolve() if args.write_readiness_evidence else None
    selected_targets = tuple(args.only) if args.only else SMOKE_TARGETS

    build_root.mkdir(parents=True, exist_ok=True)
    results = []
    for target in selected_targets:
        setup = None
        if target == "exported":
            project_dir, setup = prepare_exported_project(engine_pack, build_root)
        elif target in RUNTIME_PROFILE_TARGETS:
            project_dir, setup = prepare_runtime_profile_project(engine_pack, build_root, target)
        else:
            project_dir = prepare_template_project(engine_pack, build_root, target)
        result = smoke_project(engine_pack, project_dir, target, args.skip_build)
        if setup is not None:
            result["assetc_export_ok"] = setup["ok"]
            if setup.get("stderr"):
                result["errors"].append(setup["stderr"])
            result["ok"] = result["ok"] and setup["ok"]
        results.append(result)

    report = {
        "ok": all(item["ok"] for item in results),
        "engine_pack": str(engine_pack),
        "build_root": str(build_root),
        "skip_build": args.skip_build,
        "targets": list(selected_targets),
        "results": results,
    }
    if evidence_path:
        report["readiness_evidence"] = {
            "requested": True,
            "path": str(evidence_path),
            "gate": "gba_studio_engine_primary_rollout",
            "written": False,
        }
        if report["ok"]:
            source = args.evidence_source or str(output_path)
            message = args.evidence_message or (
                "Production smoke passed for private engine-primary rollout while Butano remains only as legacy rollback."
            )
            write_readiness_evidence(evidence_path, utc_now(), source, message)
            report["readiness_evidence"]["written"] = True
            report["readiness_evidence"]["source"] = source
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(report, indent=2, sort_keys=True) + "\n", encoding="utf-8")

    if args.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        status = "OK" if report["ok"] else "FAIL"
        print(f"production_smoke: {status}")
        for result in results:
            marker = "OK" if result["ok"] else "FAIL"
            print(f"[{marker}] {result['target']}: {result['rom']}")
        print(f"Relatorio: {output_path}")
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
