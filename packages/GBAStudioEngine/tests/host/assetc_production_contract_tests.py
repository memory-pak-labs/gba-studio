#!/usr/bin/env python3
import json
import importlib.util
import struct
import subprocess
import tempfile
import zlib
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
ASSETC = REPO / "tools" / "assetc" / "assetc.py"


def load_assetc_module():
    spec = importlib.util.spec_from_file_location("gbastudio_assetc", ASSETC)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def sprite_asset_report(*asset_ids):
    return {
        "export_plan": {
            "headers": [
                {"id": asset_id, "symbol": asset_id, "header": f"{asset_id}.hpp", "generate": True}
                for asset_id in asset_ids
            ]
        }
    }


def run_assetc_pack(payload):
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        pack_path = tmp_path / "pack.json"
        report_path = tmp_path / "report.json"
        pack_path.write_text(json.dumps(payload), encoding="utf-8")
        result = subprocess.run(
            [str(ASSETC), str(pack_path), "-o", str(report_path), "--pack-json"],
            cwd=REPO,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        return json.loads(report_path.read_text(encoding="utf-8"))


def run_assetc_export(payload, header_name):
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        project_path = tmp_path / "project.json"
        output_path = tmp_path / "output"
        project_path.write_text(json.dumps(payload), encoding="utf-8")
        result = subprocess.run(
            [str(ASSETC), str(project_path), "-o", str(output_path), "--export-project-json"],
            cwd=REPO,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        return (output_path / header_name).read_text(encoding="utf-8")


def run_assetc_audio(payload):
    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        input_path = tmp_path / "audio.json"
        output_path = tmp_path / "audio.hpp"
        input_path.write_text(json.dumps(payload), encoding="utf-8")
        result = subprocess.run(
            [str(ASSETC), str(input_path), "-o", str(output_path), "-n", "audio", "--audio-json"],
            cwd=REPO,
            text=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=False,
        )
        assert result.returncode == 0, result.stderr
        return output_path.read_text(encoding="utf-8")


def write_indexed_png(path, width, height, palette, indices):
    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    rows = b"".join(
        b"\x00" + bytes(indices[row * width:(row + 1) * width])
        for row in range(height)
    )
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 3, 0, 0, 0))
    data += chunk(b"PLTE", b"".join(bytes(color) for color in palette))
    data += chunk(b"IDAT", zlib.compress(rows))
    data += chunk(b"IEND", b"")
    path.write_bytes(data)


def test_identical_global_obj_palettes_share_one_hardware_bank():
    assetc = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette = [
            (0, 0, 0),
            (248, 184, 112),
            (16, 88, 104),
            (104, 56, 32),
        ]
        indices = [0, 1, 2, 3] * 64
        write_indexed_png(root / "lia.png", 16, 16, palette, indices)
        write_indexed_png(root / "mara.png", 16, 16, palette, indices)

        report = assetc.emit_pack_report({
            "assets": [
                {
                    "id": "lia",
                    "name": "lia",
                    "kind": "obj",
                    "png": "lia.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "bank_group": "global",
                    "bank_groups": ["global", "scene_topdown"],
                },
                {
                    "id": "mara",
                    "name": "mara",
                    "kind": "obj",
                    "png": "mara.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "bank_group": "global",
                    "bank_groups": ["global", "scene_topdown"],
                },
            ],
        }, root)

    lia_palette = report["asset_reports"]["lia"]["allocations"]["obj_palette_colors"]
    mara_palette = report["asset_reports"]["mara"]["allocations"]["obj_palette_colors"]
    assert report["usage"]["obj_palette_colors"]["used"] == 16
    assert lia_palette["start"] == mara_palette["start"]
    assert mara_palette["shared_with"] == "lia"
    assert len([
        entry
        for entry in report["resource_bank_plan"]
        if entry["resource"] == "obj_palette_colors"
    ]) == 1


def test_identical_scene_obj_palettes_share_one_hardware_bank():
    assetc = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette = [
            (0, 0, 0),
            (248, 184, 112),
            (16, 88, 104),
            (104, 56, 32),
        ]
        indices = [0, 1, 2, 3] * 64
        write_indexed_png(root / "title_a.png", 16, 16, palette, indices)
        write_indexed_png(root / "title_b.png", 16, 16, palette, indices)

        report = assetc.emit_pack_report({
            "assets": [
                {
                    "id": "title_a",
                    "name": "title_a",
                    "kind": "obj",
                    "png": "title_a.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "bank_group": "scene_title",
                    "bank_groups": ["scene_title"],
                },
                {
                    "id": "title_b",
                    "name": "title_b",
                    "kind": "obj",
                    "png": "title_b.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "bank_group": "scene_title",
                    "bank_groups": ["scene_title"],
                },
            ],
        }, root)

    title_a_palette = report["asset_reports"]["title_a"]["allocations"]["obj_palette_colors"]
    title_b_palette = report["asset_reports"]["title_b"]["allocations"]["obj_palette_colors"]
    assert report["usage"]["obj_palette_colors"]["used"] == 16
    assert title_a_palette["start"] == title_b_palette["start"]
    assert title_b_palette["shared_with"] == "title_a"
    assert len([
        entry
        for entry in report["resource_bank_plan"]
        if entry["resource"] == "obj_palette_colors"
    ]) == 1


def test_background_palette_reference_shares_tile_and_palette_ranges():
    assetc = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette = [
            (0, 0, 0),
            (248, 184, 112),
            (16, 88, 104),
            (104, 56, 32),
        ]
        base_indices = [0, 1, 2, 3] * 16
        derived_indices = [3, 2, 1, 0] * 16
        write_indexed_png(root / "base.png", 8, 8, palette, base_indices)
        write_indexed_png(root / "frame.png", 8, 8, palette, derived_indices)

        report = assetc.emit_pack_report({
            "assets": [
                {
                    "id": "base",
                    "name": "base",
                    "kind": "bg",
                    "png": "base.png",
                    "bank_group": "scene_title",
                },
                {
                    "id": "frame",
                    "name": "frame",
                    "kind": "bg",
                    "png": "frame.png",
                    "background_palette_reference": "base.png",
                    "bank_group": "scene_title",
                },
            ],
        }, root)

    base = report["asset_reports"]["base"]["allocations"]
    frame = report["asset_reports"]["frame"]["allocations"]
    assert frame["bg_tiles"]["start"] == base["bg_tiles"]["start"]
    assert frame["bg_tiles"]["shared_with"] == "base"
    assert frame["bg_palette_colors"]["start"] == base["bg_palette_colors"]["start"]
    assert frame["bg_palette_colors"]["shared_with"] == "base"
    # O pool de cena também contabiliza o tile 0 reservado para a superfície
    # transparente de UI/HUD; o frame compartilhado não adiciona outro tile.
    assert report["usage"]["bg_tiles"]["used"] == base["bg_tiles"]["count"] + 1
    assert report["usage"]["bg_palette_colors"]["used"] == base["bg_palette_colors"]["count"]


def test_pack_json_schema_11_reports_production_pressure():
    report = run_assetc_pack({
        "stress_profile": "production_contract",
        "assets": [
            {
                "id": "room_a_bg",
                "name": "room_a_bg",
                "kind": "bg",
                "room": "room_a",
                "template": "topdown",
                "resources": {"bg_tiles": 300, "bg_palette_colors": 16},
            },
            {
                "id": "room_a_actor",
                "name": "room_a_actor",
                "kind": "obj",
                "room": "room_a",
                "template": "topdown",
                "resources": {"obj_tiles": 96, "obj_palette_colors": 16, "oam_sprites": 8},
            },
            {
                "id": "bonus_music",
                "name": "bonus_music",
                "kind": "audio",
                "group": "bonus",
                "template": "topdown",
                "optional": True,
                "resources": {"pcm_bytes": 70000},
            },
        ],
    })

    assert report["schema"] == 11
    assert report["production_summary"]["ready_for_large_project"] is True
    assert report["production_summary"]["required_asset_count"] == 2
    assert report["production_summary"]["optional_omitted_count"] == 1
    assert report["production_profile"]["schema"] == 1
    assert report["production_profile"]["id"] == "production_contract"
    assert report["production_profile"]["severity"] == "warning"
    assert report["production_profile"]["ready_for_beta_export"] is True
    assert report["production_profile"]["ready_for_primary_backend"] is False
    assert report["production_profile"]["backend_policy"] == "parallel_until_manual_promotion"
    assert report["production_profile"]["template_limits"]["topdown"]["bg_tiles"]["warning_percent"] == 65
    assert report["production_profile"]["pressure_gates"]
    assert report["production_profile"]["ui_action_count"] == len(report["production_profile"]["ui_actions"])
    assert any(action["id"].startswith("asset_overflow_bonus_music_pcm_bytes") for action in report["production_profile"]["ui_actions"])
    assert any(action["id"].startswith("split_asset_room_a_bg_bg_tiles") for action in report["production_profile"]["ui_actions"])
    assert "manual_mgba_stress_smoke" in report["production_profile"]["manual_validation_required"]
    assert report["required_asset_summary"]["ok"] is True
    assert report["optional_asset_summary"]["omitted"] == ["bonus_music"]
    assert report["asset_reports"]["room_a_bg"]["room"] == "room_a"
    assert report["room_pressure_report"][0]["name"] == "room_a"
    assert report["template_pressure_report"][0]["name"] == "topdown"
    assert report["pool_reports"]["bg_tiles"]["largest_free_block"] >= 595
    assert report["split_recommendations"]
    assert report["compression_candidates"]
    assert report["overflow_report"][0]["fallback"] == "omit_optional_asset"
    assert report["overflow_report"][0]["overflow_reason"] in ("count_exceeds_capacity", "no_contiguous_block")


def test_exclusive_resident_sets_separate_catalog_from_peak_residency():
    groups = [f"arena_page_{index}" for index in range(4)]
    assets = [{
        "id": "arena_shared_grid",
        "name": "arena_shared_grid",
        "kind": "bg",
        "room": "arena",
        "template": "isometric_tactical",
        "bank_group": groups[0],
        "bank_groups": groups,
        "resources": {"bg_tiles": 128},
    }]
    for index in range(4):
        assets.append({
            "id": f"arena_page_{index}",
            "name": f"arena_page_{index}",
            "kind": "bg",
            "room": "arena",
            "template": "isometric_tactical",
            "bank_group": f"arena_page_{index}",
            "resources": {"bg_tiles": 500, "bg_palette_colors": 256},
        })
    report = run_assetc_pack({
        "stress_profile": "tactical_streaming",
        "resident_sets": [{
            "id": "arena_surface_pages",
            "room": "arena",
            "groups": [f"arena_page_{index}" for index in range(4)],
            "max_resident_groups": 1,
        }],
        "assets": assets,
    })

    assert report["catalog_pressure_report"][0]["resources"]["bg_tiles"] == 2128
    resident = report["resident_pressure_report"][0]
    assert resident["id"] == "arena_surface_pages"
    assert resident["max_resident_groups"] == 1
    assert report["group_pressure_report"]
    assert all(
        item["resources"]["bg_tiles"]["requested"] == 628
        for item in report["group_pressure_report"]
        if item["name"] in groups
    )
    assert resident["resources"]["bg_tiles"]["requested"] == 628
    assert resident["resources"]["bg_palette_colors"]["requested"] == 256
    assert report["production_profile"]["ready_for_beta_export"] is True


def test_pack_report_preserves_exporter_physical_audio_budget():
    report = run_assetc_pack({
        "assets": [],
        "physical_budget": {
            "schema": 1,
            "audio_bytes_by_item": {
                "audio:0": 69,
                "theme-id": 69,
            },
        },
    })

    assert report["physical_budget"] == {
        "schema": 1,
        "audio_bytes_by_item": {
            "audio:0": 69,
            "theme-id": 69,
        },
    }


def test_audio_export_serializes_psg_pan_for_all_step_kinds():
    header = run_assetc_audio({
        "sfx": [{
            "name": "left_sfx",
            "tones": [{"frequency_hz": 440, "duration_frames": 2, "volume": 15, "pan": -127}],
        }],
        "music": [{
            "name": "right_music",
            "steps": [{"frequency_hz": 660, "duration_frames": 3, "volume": 12, "pan": 127}],
        }],
        "tracker": [{
            "name": "center_tracker",
            "patterns": [{
                "steps": [{"channel": 2, "frequency_hz": 880, "duration_frames": 1, "volume": 10, "pan": 0}],
            }],
            "order": [0],
        }],
        "pcm": [],
    })

    assert "{ 440, 2, 15, 2, false, 0, 0, 0, -127 }" in header
    assert "{ 660, 3, 12, 2, 127 }" in header
    assert "{ 2, 880, 1, 10, 2, 0, 0, 0, -1, 0, 0 }" in header


def test_oam_sprite_allocations_honor_pack_alignment():
    report = run_assetc_pack({
        "stress_profile": "production_contract",
        "assets": [
            {
                "id": "player_sprite",
                "name": "player_sprite",
                "kind": "obj",
                "resources": {"obj_tiles": 24, "obj_palette_colors": 16, "oam_sprites": 1},
            },
            {
                "id": "portrait_sprite",
                "name": "portrait_sprite",
                "kind": "obj",
                "resources": {"obj_tiles": 4, "obj_palette_colors": 16, "oam_sprites": 1},
            },
        ],
    })

    player_oam = report["asset_reports"]["player_sprite"]["allocations"]["oam_sprites"]
    portrait_oam = report["asset_reports"]["portrait_sprite"]["allocations"]["oam_sprites"]
    assert player_oam["start"] == 0
    assert portrait_oam["start"] % 4 == 0
    assert portrait_oam["start"] == 4


def test_bg_budget_reserves_ui_tiles_for_pause_menu_and_dialogue():
    report = run_assetc_pack({
        "stress_profile": "production_contract",
        "assets": [{
            "id": "dense_topdown_background",
            "name": "dense_topdown_background",
            "kind": "bg",
            "resources": {"bg_tiles": 895},
        }],
    })

    assert report["budgets"]["bg_tiles"] == 896
    assert report["budget_summary"]["bg_tiles"]["capacity"] == 896
    assert report["budget_summary"]["bg_tiles"]["remaining"] == 0


def test_asset_pack_reserves_bg_tile_zero_for_transparent_ui():
    report = run_assetc_pack({
        "assets": [{
            "id": "room_tiles",
            "name": "room_tiles",
            "kind": "bg",
            "resources": {"bg_tiles": 4},
        }],
    })

    allocation = report["asset_reports"]["room_tiles"]["allocations"]["bg_tiles"]
    assert allocation["start"] == 1
    assert allocation["end"] == 5


def test_cutscene_steps_emit_resource_bank_groups():
    header = run_assetc_export({
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "cutscene",
        "template_dir": str(REPO / "templates" / "exported_cutscene"),
        "entry": "main.cpp",
        "project_data": "cutscene_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "cutscene_step_bank_test", "make_target": "all"},
        "requires": {"engine_pack": ">=1.0.0", "features": []},
        "cutscene_project": {
            "initial_scene": 0,
            "scenes": [{
                "name": "prologue",
                "resource_bank_group": "scene_prologue",
                "steps": [{
                    "line": -1,
                    "resource_bank_group": "scene_prologue_step_0",
                    "duration_frames": 1,
                }],
            }],
            "dialogue_lines": [],
        },
    }, "cutscene_project_data.hpp")

    assert '"scene_prologue_step_0"' in header


def test_cutscene_actor_motions_emit_native_contract():
    assetc = load_assetc_module()
    header = assetc.emit_cutscene_project_data_header({
        "initial_scene": 0,
        "scenes": [{
            "name": "opening",
            "actors": [{
                "name": "airship",
                "position": {"x": 88, "y": 64},
                "metasprite": {"asset": "airship", "index": 0},
            }],
            "steps": [{
                "line": -1,
                "duration_frames": 30,
                "actor_motions": [{
                    "actor_index": 0,
                    "from_position": {"x": 240, "y": 48},
                    "to_position": {"x": 88, "y": 64},
                    "duration_frames": 30,
                }],
            }],
        }],
        "dialogue_lines": [],
    }, sprite_asset_report("airship"))

    assert "constexpr gbs::CutsceneActorMotionData cutscene_scene_0_step_0_actor_motions[]" in header
    assert "gbs::Vec2i { 240, 48 }, gbs::Vec2i { 88, 64 }" in header
    assert "cutscene_scene_0_step_0_actor_motions, 1" in header


def test_camera_zones_are_emitted_for_topdown_and_isometric_rooms():
    base = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "template_dir": str(REPO / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "generated_assets": [],
        "build": {"target": "camera_zone_test", "make_target": "all"},
        "requires": {"engine_pack": ">=1.0.0", "features": []},
    }
    topdown_header = run_assetc_export({
        **base,
        "kind": "topdown",
        "project_data": "gbastudio_project_data.hpp",
        "topdown_project": {
            "rooms": [{
                "name": "camera_room",
                "width_tiles": 2,
                "height_tiles": 2,
                "visual_tiles": [0, 0, 0, 0],
                "collision_flags": [0, 0, 0, 0],
                "height_levels": [0, 1, 0, 0],
                "camera_zones": [{
                    "area": {"x": 0, "y": 0, "width": 16, "height": 16},
                    "bounds": {"x": 0, "y": 0, "width": 240, "height": 160},
                    "offset": {"x": 4, "y": -2},
                    "lock_x": True,
                    "lock_y": False,
                }],
            }],
            "player": {"position": {"x": 0, "y": 0}, "size": {"x": 16, "y": 16}, "speed": 1},
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
            "dialogue_lines": [],
            "inventory_enabled": True,
            "quests_enabled": True,
            "shop_enabled": True,
            "quests": [{
                "id": "find-crystal",
                "state_variable": 4,
                "active_value": 1,
                "completed_value": 2,
                "objective_item": 2,
                "objective_quantity": 3,
                "reward_item": 3,
                "reward_quantity": 1,
            }],
            "shop_items": [{
                "label": "POTION",
                "item": 5,
                "currency_item": 1,
                "price": 7,
                "stock_variable": -1,
                "stock": 0,
            }],
        },
    }, "gbastudio_project_data.hpp")
    assert "constexpr gbs::CameraZone camera_room_camera_zones" in topdown_header
    assert "constexpr gbs::TopDownQuestData topdown_quests" in topdown_header
    assert "constexpr gbs::TopDownShopItemData topdown_shop_items" in topdown_header

    isometric_header = run_assetc_export({
        **base,
        "kind": "isometric",
        "template_dir": str(REPO / "templates" / "exported_isometric"),
        "project_data": "isometric_project_data.hpp",
        "isometric_project": {
            "rooms": [{
                "name": "iso_camera_room",
                "width_tiles": 2,
                "height_tiles": 2,
                "visual_tiles": [0, 0, 0, 0],
                "collision_flags": [0, 0, 0, 0],
                "actors": [{"tile": {"x": 0, "y": 0, "z": 0}, "tile_index": 0, "palette": 0}],
                "camera_zones": [{
                    "area": {"x": 0, "y": 0, "width": 2, "height": 2},
                    "bounds": {"x": 0, "y": 0, "width": 240, "height": 160},
                }],
            }],
        },
    }, "isometric_project_data.hpp")
    assert "constexpr gbs::IsoCameraZone iso_camera_room_camera_zones" in isometric_header
    assert "constexpr uint8_t iso_camera_room_height_levels[]" in isometric_header


def test_dungeon_crawler_emits_feature_module_runtime_flags():
    assetc = load_assetc_module()
    header = assetc.emit_dungeon_crawler_project_data_header({
        "rooms": [{
            "name": "crypt",
            "width_tiles": 2,
            "height_tiles": 2,
            "collision_flags": [1, 1, 1, 1],
            "config": {"step_duration_frames": 12, "turn_duration_frames": 6, "view_distance": 5},
            "player_start": {"x": 0, "y": 0, "direction": "north"},
        }],
        "inventory_enabled": False,
        "battle_enabled": True,
        "depth_sprites_enabled": False,
        "compass_enabled": True,
        "map_enabled": True,
    })
    assert "    false,\n    true,\n    false,\n    nullptr,\n    0," in header
    assert "gbs::DungeonCrawlerBattleData { nullptr, -1, 0, 0, 0, -1, 0 }" in header
    assert "gbs::DungeonCrawlerBattleData { nullptr, -1, 0, 0, 0, -1, 0 },\n    true,\n    true" in header


def test_topdown_rooms_emit_a_fixed_4bpp_background_contract():
    header = run_assetc_export({
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(REPO / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "topdown_bpp_test", "make_target": "all"},
        "requires": {"engine_pack": ">=1.0.0", "features": []},
        "topdown_project": {
            "rooms": [
                {
                    "name": "rich_room",
                    "width_tiles": 1,
                    "height_tiles": 1,
                    "visual_tiles": [0],
                    "collision_flags": [0],
                    "background_bits_per_pixel": 4,
                },
                {
                    "name": "banked_room",
                    "width_tiles": 1,
                    "height_tiles": 1,
                    "visual_tiles": [0],
                    "collision_flags": [0],
                },
            ],
            "player": {"position": {"x": 0, "y": 0}, "size": {"x": 16, "y": 16}, "speed": 1},
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
            "dialogue_lines": [],
        },
    }, "gbastudio_project_data.hpp")

    assert "background_bits_per_pixel" not in header
    assert "gbs::Camera { gbs::Vec2i { 0, 0 }, true, false, gbs::Rect { 0, 0, 0, 0 }, 256 }," in header


def test_topdown_dynamic_actor_sprites_emit_animation_tables():
    assetc = load_assetc_module()
    report = sprite_asset_report("player_male", "player_female")
    header = assetc.emit_topdown_project_data_header({
        "rooms": [{
            "name": "port",
            "width_tiles": 1,
            "height_tiles": 1,
            "visual_tiles": [0],
            "collision_flags": [0],
        }],
        "player": {
            "position": {"x": 0, "y": 0},
            "size": {"x": 16, "y": 32},
            "animation": "idle_down",
            "animations": [{"name": "idle_down", "asset": "player_male"}],
        },
        "actor_sprites": [
            {
                "name": "player-male.png",
                "metasprite": {"asset": "player_male", "index": 0},
                "animation": "idle_down",
                "animations": [{"name": "idle_down", "asset": "player_male"}],
            },
            {
                "name": "player-female.png",
                "metasprite": {"asset": "player_female", "index": 0},
                "animation": "idle_down",
                "animations": [{"name": "idle_down", "asset": "player_female"}],
            },
        ],
        "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        "dialogue_lines": [],
    }, report)

    assert '#include "player_male.hpp"' in header
    assert '#include "player_female.hpp"' in header
    assert "constexpr gbs::TopDownActorSpriteData topdown_actor_sprites[] = {" in header
    assert "gbs::TopDownActorSpriteData { &player_male_metasprites[0], topdown_actor_sprite_0_animations[0]," in header
    assert "gbs::TopDownActorSpriteData { &player_female_metasprites[0], topdown_actor_sprite_1_animations[0]," in header
    assert "    topdown_actor_sprites,\n    2" in header


def test_topdown_affine_obj_emits_keyframe_contract():
    header = run_assetc_export({
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(REPO / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "topdown_affine_animation_test", "make_target": "all"},
        "requires": {"engine_pack": ">=1.0.0", "features": []},
        "topdown_project": {
            "rooms": [{
                "name": "affine_room",
                "width_tiles": 1,
                "height_tiles": 1,
                "visual_tiles": [0],
                "collision_flags": [0],
            }],
            "player": {
                "position": {"x": 0, "y": 0},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "affine_obj": {
                    "enabled": True,
                    "matrix_index": 2,
                    "easing": "ease_in",
                    "keyframes": [
                        {"frame": 0, "pa": 256, "pb": 0, "pc": 0, "pd": 256},
                        {"frame": 30, "pa": 128, "pb": 64, "pc": -64, "pd": 512},
                    ],
                },
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
            "dialogue_lines": [],
        },
    }, "gbastudio_project_data.hpp")

    assert "constexpr gbs::AffineMatrixKeyframe topdown_player_affine_keyframes[]" in header
    assert "gbs::Easing::EaseIn" in header
    assert "topdown_player_affine_keyframes, 2" in header


def test_isometric_and_shmup_emit_native_sprite_visuals():
    assetc = load_assetc_module()
    report = sprite_asset_report(
        "actor_isometric",
        "player_shmup",
        "projectile_shmup",
        "enemy_projectile_shmup",
        "enemy_shmup",
    )
    isometric_header = assetc.emit_isometric_project_data_header({
        "rooms": [{
            "name": "market",
            "width_tiles": 1,
            "height_tiles": 1,
            "visual_tiles": [0],
            "collision_flags": [0],
            "ramp_flags": [2],
            "actors": [{
                "tile": {"x": 0, "y": 0, "z": 0},
                "size": {"x": 32, "y": 32},
                "follow_player": False,
                "metasprite": {"asset": "actor_isometric", "index": 0},
                "animations": [
                    {"name": name, "asset": "actor_isometric", "frame_indices": [0]}
                    for name in (
                        "idle_down", "idle_up", "idle_left", "idle_right",
                        "walk_down", "walk_up", "walk_left", "walk_right",
                    )
                ],
            }],
        }],
    }, report)
    assert "actor_isometric_metasprites[0].parts[0].tile_index" in isometric_header
    assert "static_cast<uint8_t>(32), static_cast<uint8_t>(32)" in isometric_header
    assert "static_cast<uint8_t>(32), false" in isometric_header
    assert "constexpr gbs::IsoActorAnimationSet market_actor_0_animation_set" in isometric_header
    assert "&market_actor_0_idle_down_animation" in isometric_header
    assert "&market_actor_0_walk_right_animation" in isometric_header
    assert "market_actor_animations" in isometric_header
    assert "constexpr uint8_t market_ramp_flags[]" in isometric_header
    assert "market_ramp_flags,\n        nullptr,\n        nullptr,\n        0,\n        0,\n        gbs::IsoWorldMode::ScrollableTiledWorld,\n        gbs::IsoGameplayMode::Adventure,\n        nullptr,\n        gbs::VideoComposition { static_cast<gbs::DisplayMode>(0), false" in isometric_header

    shmup_header = assetc.emit_shmup_project_data_header({
        "player": {
            "position": {"x": 16, "y": 64},
            "size": {"x": 32, "y": 32},
            "metasprite": {"asset": "player_shmup", "index": 0},
        },
        "projectile": {
            "size": {"x": 16, "y": 8},
            "velocity": {"x": 4, "y": 0},
            "metasprite": {"asset": "projectile_shmup", "index": 0},
        },
        "enemy_projectile": {
            "size": {"x": 16, "y": 8},
            "velocity": {"x": -4, "y": 0},
            "metasprite": {"asset": "enemy_projectile_shmup", "index": 0},
        },
        "waves": [{
            "name": "wave_1",
            "enemies": [{
                "name": "scout",
                "position": {"x": 160, "y": 64},
                "size": {"x": 32, "y": 32},
                "metasprite": {"asset": "enemy_shmup", "index": 0},
                }],
        }],
        "score_enabled": True,
        "high_score_enabled": False,
        "initial_score": 250,
        "initial_lives": 5,
        "waves_enabled": True,
        "max_waves": 3,
        "loop_waves": True,
    }, report)
    assert "&player_shmup_metasprites[0]" in shmup_header
    assert "&projectile_shmup_metasprites[0]" in shmup_header
    assert "&enemy_projectile_shmup_metasprites[0]" in shmup_header
    assert "&enemy_shmup_metasprites[0]" in shmup_header
    assert "    true,\n    false,\n    static_cast<uint16_t>(250),\n    static_cast<uint8_t>(5),\n    true,\n    static_cast<uint8_t>(3),\n    true,\n    gbs::ShmupSceneComposition { false" in shmup_header


def test_isometric_emits_explicit_tactical_presentation_data():
    assetc = load_assetc_module()
    report = sprite_asset_report("actor_isometric", "surface", "grid", "hud")
    animation_names = (
        "idle_down", "idle_up", "idle_left", "idle_right",
        "move_down", "move_up", "move_left", "move_right",
        "attack_down", "attack_up", "attack_left", "attack_right",
        "hurt_down", "hurt_up", "hurt_left", "hurt_right",
        "defeat_down", "defeat_up", "defeat_left", "defeat_right",
    )
    header = assetc.emit_isometric_project_data_header({
        "rooms": [{
            "name": "tactical",
            "width_tiles": 2,
            "height_tiles": 2,
            "visual_tiles": [0, 0, 0, 0],
            "collision_flags": [0, 0, 0, 0],
            "grid": {"gameplay_mode": "tactical"},
            "tactical": {
                "enabled": True,
                "active_team": "player",
                "units": [{"actor_index": 0, "team": "player"}],
            },
            "actors": [{
                "id": "unit-nara",
                "tile": {"x": 0, "y": 0, "z": 0},
                "size": {"x": 32, "y": 32},
                "metasprite": {"asset": "actor_isometric", "index": 0},
                "animations": [
                    {"name": name, "asset": "actor_isometric", "frame_indices": [0]}
                    for name in animation_names
                ],
            }],
            "tactical_presentation": {
                "schema": 1,
                "capabilities": [
                    "tactical_surface", "tactical_grid_overlay", "tactical_hud",
                    "tactical_units", "tactical_props", "tactical_feedback", "tactical_audio",
                ],
                "layers": {
                    "surface": "BG2", "grid": "BG1", "hud": "BG0",
                    "objects": "OBJ", "collision": "scene_data",
                },
                "assets": [{
                    "id": "surface",
                    "reference": "surface",
                    "consumer": "bg",
                    "required": True,
                }],
                "surface_asset": "surface",
                "grid_asset": "grid",
                "hud_layout": "hud",
                "units": [{
                    "actor_id": "unit-nara",
                    "sheet": "actor_isometric",
                    "animations": {name: f"{name}_animation" for name in animation_names},
                }],
                "props": [{
                    "id": "beacon",
                    "asset": {"symbol": "beacon_sprite"},
                    "kind": "objective",
                    "tile": {"x": 1, "y": 1, "z": 0},
                    "animated": True,
                }],
                "cursor_asset": {"symbol": "cursor_sprite"},
                "range_asset": {"symbol": "range_sprite"},
                "target_asset": {"symbol": "target_sprite"},
                "emotes": {"asset": {"symbol": "emote_sprite"}, "index": 3},
                "feedback": {"asset": {"symbol": "feedback_sprite"}, "index": 5},
                "audio": {
                    "music": {"symbol": "tactical_music_tracker"},
                    "cues": {
                        cue: {"symbol": f"sfx_{cue}"}
                        for cue in ("cursor", "select", "cancel", "move", "attack", "hit", "turn", "victory", "defeat")
                    },
                    "cue_indices": {cue: index for index, cue in enumerate(("cursor", "select", "cancel", "move", "attack", "hit", "turn", "victory", "defeat"))},
                },
                "indices": {
                    "markers": {"cursor": 0, "range": 1, "target": 2},
                    "props": [{"id": "beacon", "index": 0}],
                },
            },
        }],
    }, report)

    assert "constexpr gbs::IsoTacticalUnitPresentationData tactical_tactical_presentation_units[]" in header
    assert "constexpr gbs::IsoActorAnimationSet tactical_tactical_unit_0_animation_set" in header
    assert "gbs::IsoTacticalUnitPresentationData { 0, &tactical_tactical_unit_0_animation_set }" in header
    assert "constexpr gbs::IsoTacticalPropData tactical_tactical_presentation_props[]" in header
    assert "constexpr gbs::IsoTacticalPresentationData tactical_tactical_presentation" in header
    assert "&surface_tilemap_asset" in header
    assert "&grid_tilemap_asset" in header
    assert "&hud_tilemap_asset" in header
    assert "&cursor_sprite" in header
    assert "&tactical_music_tracker" in header
    assert "gbs::VideoComposition { static_cast<gbs::DisplayMode>(0), false" in header
    assert "        &tactical_tactical_presentation,\n        gbs::IsoMovementModel::Tile,\n" in header


def test_shmup_composition_emits_hblank_timeline_keyframes():
    assetc = load_assetc_module()
    report = sprite_asset_report("player_shmup")
    offsets = [0] * 160
    timeline_offsets = [index % 8 for index in range(160)]
    header = assetc.emit_shmup_project_data_header({
        "player": {
            "position": {"x": 16, "y": 64},
            "size": {"x": 32, "y": 32},
            "metasprite": {"asset": "player_shmup", "index": 0},
        },
        "projectile": {"size": {"x": 16, "y": 8}, "velocity": {"x": 4, "y": 0}},
        "enemy_projectile": {"size": {"x": 16, "y": 8}, "velocity": {"x": -4, "y": 0}},
        "waves": [{"name": "wave_1", "enemies": []}],
        "composition": {
            "enabled": True,
            "effects": {
                "hblank": {
                    "enabled": True,
                    "hdma": True,
                    "layer": "BG2",
                    "scroll_offsets": offsets,
                    "timeline": [
                        {"frame": 0, "scroll_offsets": offsets},
                        {"frame": 30, "scroll_offsets": timeline_offsets},
                    ],
                },
            },
        },
    }, report)

    assert "shmup_scene_hblank_timeline_0_scroll_offsets[160]" in header
    assert "shmup_scene_hblank_timeline_1_scroll_offsets[160]" in header
    assert "gbs::ShmupHBlankTimelineKeyframe shmup_scene_hblank_timeline[]" in header
    assert "shmup_scene_hblank_timeline, 2" in header


def test_shmup_background_emits_each_parallax_plane_in_one_scene_group():
    assetc = load_assetc_module()
    report = sprite_asset_report("storm_sky", "storm_mid", "storm_foreground")
    header = assetc.emit_shmup_project_data_header({
        "backgrounds": [{
            "name": "storm",
            "backdrop_color": 7,
            "layers": [
                {"layer": "bg3", "tilemap": "storm_sky", "scroll": {"x": 1, "y": 0}},
                {"layer": "bg2", "tilemap": "storm_mid", "scroll": {"x": 2, "y": 0}},
                {"layer": "bg1", "tilemap": "storm_foreground", "scroll": {"x": 4, "y": 0}},
            ],
        }],
        "background": 0,
        "waves": [{"name": "storm", "enemies": []}],
    }, report)

    assert "constexpr gbs::ShmupBackgroundLayerData shmup_background_0_layers[]" in header
    assert "gbs::BackgroundLayer::BG3" in header
    assert "gbs::BackgroundLayer::BG2" in header
    assert "gbs::BackgroundLayer::BG1" in header
    assert "{ \"storm\", shmup_background_0_layers, 3, static_cast<uint16_t>(7) }" in header


def test_shmup_affine_background_emits_video_and_collision_contract():
    assetc = load_assetc_module()
    report = sprite_asset_report("day_bg")
    project = {
        "backgrounds": [{
            "name": "day",
            "backdrop_color": 0,
            "width_tiles": 90,
            "height_tiles": 20,
            "layers": [],
            "video": {
                "display_mode": 1,
                "affine": {
                    "asset": "day_bg",
                    "layer": "BG2",
                    "wrap": False,
                    "pa": 256,
                    "pb": 0,
                    "pc": 0,
                    "pd": 256,
                    "reference_x_8": 0,
                    "reference_y_8": 0,
                },
            },
            "collision_flags": [0, 1, 0, 1],
            "collision_width_tiles": 2,
            "collision_height_tiles": 2,
            "world_width_pixels": 720,
            "world_height_pixels": 160,
            "affine_scroll_pixels_per_frame": {"x": 2, "y": 0},
        }],
        "background": 0,
        "waves": [{"name": "day", "enemies": []}],
    }
    assert assetc.project_auto_includes(project, report) == ["day_bg.hpp"]
    header = assetc.emit_shmup_project_data_header(project, report)

    assert "constexpr gbs::ShmupBackgroundLayerData shmup_background_0_layers[]" not in header
    assert "gbs::ShmupBackgroundData { \"day\", nullptr, 0" in header
    assert "shmup_background_0_collision_flags[4]" in header
    assert "gbs::DisplayMode>(1)" in header
    assert "&day_bg_tile_asset" in header
    assert "static_cast<uint16_t>(720), static_cast<uint16_t>(160)" in header


def test_assetc_accepts_native_8bpp_affine_pack_contract():
    assetc = load_assetc_module()
    args = assetc.pack_assetc_args_for_asset(
        {"name": "day_bg", "kind": "affine_bg", "background_bpp": 8},
        "day_bg",
        "day_bg.hpp",
    )
    assert "--affine-tilemap" in args


def test_assetc_accepts_indexed_8bpp_isometric_source_contract():
    assetc = load_assetc_module()
    args = assetc.pack_assetc_args_for_asset(
        {"name": "market_source", "kind": "indexed_bg", "background_bpp": 8},
        "market_source",
        "market_source.hpp",
    )
    assert "--indexed-tilemap" in args
    assert args[args.index("--background-bpp") + 1] == "8"


def test_isometric_room_emits_authored_background_separately_from_tileset_atlas():
    assetc = load_assetc_module()
    report = sprite_asset_report("isometric_background")
    header = assetc.emit_isometric_project_data_header({
        "rooms": [{
            "name": "authored_room",
            "width_tiles": 40,
            "height_tiles": 30,
            "visual_tiles": [0] * (40 * 30),
            "collision_flags": [0] * (40 * 30),
            "actors": [{"tile": {"x": 19, "y": 18, "z": 0}, "tile_index": 0, "palette": 0}],
            "tileset": "isometric_background",
            "authored_background": "isometric_background",
            "world_mode": "static_composition",
        }],
    }, report)

    assert "isometric_background_tile_asset,\n        &isometric_background_tilemap_asset" in header
    assert "gbs::IsoWorldMode::StaticComposition" in header


def test_advanced_runtime_background_uses_tilemap_palette_zero_as_backdrop():
    assetc = load_assetc_module()
    output = []
    assetc.emit_advanced_runtime_backgrounds(
        output,
        {
            "backgrounds": [{
                "layer": "bg2",
                "tilemap": "opaque_background",
                "backdrop_from_tilemap_palette": True,
            }],
        },
        "dungeon_crawler_project",
        "gbs::DungeonCrawlerBackgroundData",
        "dungeon_crawler_backgrounds",
        sprite_asset_report("opaque_background"),
    )

    header = "\n".join(output)
    assert "opaque_background_palette_asset.colors[0]" in header
    assert "static_cast<uint16_t>(0)" not in header


def test_world_map_background_uses_tilemap_palette_zero_as_backdrop():
    assetc = load_assetc_module()
    output = []
    assetc.emit_world_map_backgrounds(
        output,
        {
            "backgrounds": [{
                "name": "archipelago",
                "layer": "bg2",
                "tilemap": "opaque_background",
                "backdrop_from_tilemap_palette": True,
            }],
        },
        sprite_asset_report("opaque_background"),
    )

    header = "\n".join(output)
    assert "opaque_background_palette_asset.colors[0]" in header
    assert "static_cast<uint16_t>(0)" not in header


def test_point_click_emits_custom_cursor_animations():
    assetc = load_assetc_module()
    header = assetc.emit_point_click_project_data_header({
        "assets": {
            "obj_palettes": ["cursor"],
            "tile_assets": ["cursor"],
        },
        "cursor": {
            "metasprite": {"asset": "cursor", "index": 0},
            "animations": [
                {"name": "idle", "asset": "cursor", "frame_indices": [0]},
                {"name": "hover", "asset": "cursor", "frame_indices": [1, 2]},
            ],
        },
        "scenes": [{"name": "room", "background": -1}],
    }, sprite_asset_report("cursor"))
    assert "constexpr gbs::SpriteAnimation point_click_cursor_idle_animation" in header
    assert "constexpr gbs::SpriteAnimation point_click_cursor_hover_animation" in header
    assert "&cursor_metasprites[0]" in header
    assert "&point_click_cursor_idle_animation" in header
    assert "&point_click_cursor_hover_animation" in header
    assert header.count("point_click_project_obj_palette_assets") == 2
    point_click_template = (REPO / "templates" / "exported_point_click" / "main.cpp").read_text(encoding="utf-8")
    assert "project.obj_palette_count" in point_click_template


def test_point_click_emits_layered_backgrounds_and_props():
    assetc = load_assetc_module()
    header = assetc.emit_point_click_project_data_header({
        "assets": {
            "bg_palettes": ["sky", "bench", "foreground"],
            "obj_palettes": ["coupler"],
            "tile_assets": ["sky", "bench", "foreground", "coupler"],
        },
        "backgrounds": [
            {"name": "sky", "layer": "bg3", "tilemap": "sky"},
            {"name": "bench", "layer": "bg2", "tilemap": "bench"},
            {"name": "foreground", "layer": "bg1", "tilemap": "foreground"},
        ],
        "scenes": [{
            "name": "workshop",
            "backgrounds": [0, 1, 2],
            "props": [{
                "name": "coupler",
                "metasprite": {"asset": "coupler", "index": 0},
                "position": {"x": 112, "y": 96},
                "visible_variable": 3,
                "visible_value": 1,
                "animation": "idle_down",
                "animations": [{"name": "idle_down", "asset": "coupler", "frame_indices": [0, 1]}],
            }],
        }],
    }, sprite_asset_report("sky", "bench", "foreground", "coupler"))

    assert "constexpr int point_click_scene_0_backgrounds[] = { 0, 1, 2 };" in header
    assert "constexpr gbs::PointClickPropData point_click_scene_0_props[]" in header
    assert "&coupler_metasprites[0]" in header
    assert "&point_click_scene_0_prop_0_idle_down_animation" in header
    assert "gbs::Vec2i { 112, 96 }, 3, 1" in header



def test_point_click_prop_preserves_the_authored_initial_animation():
    assetc = load_assetc_module()
    header = assetc.emit_point_click_project_data_header({
        "scenes": [{"name": "own-scene", "props": [{
            "name": "own-prop", "metasprite": {"asset": "coupler", "index": 0},
            "position": {"x": 40, "y": 80}, "animation": "click",
            "animations": [
                {"name": "idle", "asset": "coupler", "frame_indices": [0]},
                {"name": "click", "asset": "coupler", "frame_indices": [0, 1]},
            ],
        }]}],
    }, sprite_asset_report("coupler"))
    assert 'gbs::PointClickPropData { "own-prop", &coupler_metasprites[0], &point_click_scene_0_prop_0_click_animation' in header


def test_point_click_project_background_count_is_not_overwritten_by_scene_layers():
    assetc = load_assetc_module()
    header = assetc.emit_point_click_project_data_header({
        "assets": {
            "bg_palettes": ["workshop"],
            "tile_assets": ["workshop"],
        },
        "backgrounds": [{"name": "workshop", "layer": "bg1", "tilemap": "workshop"}],
        "scenes": [
            {"name": "workshop", "background": 0},
            {"name": "empty", "background": -1},
        ],
    }, sprite_asset_report("workshop"))

    assert "    point_click_backgrounds,\n    1,\n    scenes," in header


def test_replace_tile_sequence_packs_tile_asset_index():
    assetc = load_assetc_module()
    command = assetc.event_command_from_json({
        "op": "replace_tile_sequence",
        "x": 22,
        "y": 6,
        "tile": 3,
        "frames": 4,
        "variable": 1,
        "tile_asset": 2,
    }, "event")
    assert command == ("ReplaceTileSequence", (6 << 6) | 22, (3 << 10) | 3, (4 << 8) | 1)


def test_set_player_direction_emits_native_event_command():
    assetc = load_assetc_module()
    command = assetc.event_command_from_json({
        "op": "set_player_direction",
        "direction": 7,
    }, "event")
    assert command == ("SetPlayerDirection", 7, 0, 0)
    named_command = assetc.event_command_from_json({
        "op": "set_player_direction",
        "direction": "right",
    }, "event")
    assert named_command == ("SetPlayerDirection", 3, 0, 0)


def test_streaming_sprite_reserves_only_largest_frame_and_emits_frame_assets():
    assetc = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette = [(0, 0, 0)] + [((index * 31) % 256, (index * 47) % 256, (index * 61) % 256) for index in range(1, 16)]
        indices = []
        for frame in range(6):
            frame_pixels = [0] * (16 * 16)
            for tile in range(4):
                tile_x = (tile % 2) * 8
                tile_y = (tile // 2) * 8
                for local_y in range(8):
                    for local_x in range(8):
                        frame_pixels[(tile_y + local_y) * 16 + tile_x + local_x] = (
                            1 + ((frame * 4 + tile + local_x * 3 + local_y * 5) % 15)
                        )
            indices.extend(frame_pixels)
        write_indexed_png(root / "hero.png", 16, 96, palette, indices)
        asset = {
            "id": "stream_hero",
            "name": "stream_hero",
            "kind": "obj",
            "png": "hero.png",
            "sprite_width": 16,
            "sprite_height": 16,
            "stream_frames": True,
        }

        resources = assetc.pack_asset_resources(asset, root)
        assert resources["obj_tiles"] == 4
        header = assetc.emit_asset_header_from_pack_entry(
            asset,
            root,
            "stream_hero",
            {"obj_tiles": {"start": 32}},
        )

    assert "constexpr int stream_hero_tile_count = 4;" in header
    assert "stream_hero_frame_0_tile_asset" in header
    assert "stream_hero_frame_5_tile_asset" in header
    assert "{ stream_hero_metasprites[0], 8, &stream_hero_frame_0_tile_asset }" in header


def test_streamed_custom_animation_uses_resident_frame_tiles():
    assetc = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        palette = [(0, 0, 0), (255, 0, 0), (0, 255, 0)]
        pixels = []
        for y in range(16):
            for x in range(32):
                pixels.append(1 if x < 16 else 2)
        write_indexed_png(root / "hero.png", 32, 16, palette, pixels)
        report = {"export_plan": {"headers": [{
            "id": "stream_hero",
            "symbol": "stream_hero",
            "inputs": ["hero.png"],
            "assetc_args": ["--destination-tile", "32", "--palette-bank", "0",
                            "--sprite-width", "16", "--sprite-height", "16", "--stream-frames"],
        }]}}
        output = []
        assetc.emit_topdown_animation_frame_subset(output, "actor", "move_right", {
            "name": "move_right",
            "asset": "stream_hero",
            "frame_indices": [0],
            "durations": [8],
            "frame_metasprites": [{"parts": [{
                "x": 0, "y": 0, "slice_x": 16, "slice_y": 0,
                "width": 16, "height": 16,
            }]}],
        }, report, "actor.move_right", root)
        generated = "\n".join(output)
        assert "{ 0, 0, 32, 0, false, false, 16, 16 }" in generated
        assert "&stream_hero_frame_1_tile_asset" in generated
        direct_output = []
        assetc.emit_topdown_animation_frame_subset(direct_output, "actor", "idle_right", {
            "name": "idle_right", "asset": "stream_hero", "frame_indices": [1], "durations": [8],
        }, report, "actor.idle_right", root)
        assert "{ stream_hero_metasprites[1], 8, &stream_hero_frame_1_tile_asset }" in "\n".join(direct_output)


def test_referenced_asset_ids_cover_nested_references_and_raw_cpp_symbols():
    assetc = load_assetc_module()
    report = sprite_asset_report("cursor", "marker", "bitmap", "sound", "unused")
    report["export_plan"]["headers"][0]["symbol"] = "map_cursor"
    project = {
        "cursor": {"metasprite": {"asset": "cursor"}},
        "marker": "marker_metasprites[1]",
        "rooms": [{"video": {"bitmap": {"asset": "bitmap"}}}],
        "sfx_assets": [{"symbol": "sound_sfx_assets[2]"}],
        "description": "not_unused_extra_symbol_is_not_an_asset_reference",
    }
    assert set(assetc.project_referenced_asset_ids(project, report)) == {
        "cursor", "marker", "bitmap", "sound",
    }
    assert assetc.project_referenced_asset_ids({"cursor": "&map_cursor_metasprites[0]"}, report) == ["cursor"]
    palette_report = {"export_plan": {"headers": [{
        "id": "inline_palette", "symbol": "inline_palette", "header": "inline_palette.hpp",
        "kind": "palette", "generate": False, "inputs": [], "omitted": False,
    }]}}
    assert assetc.project_referenced_asset_ids({"assets": {"bg_palettes": ["inline_palette"]}}, palette_report) == ["inline_palette"]


def test_generated_asset_includes_keep_required_and_explicit_headers():
    assetc = load_assetc_module()
    report = sprite_asset_report("cursor", "unused")
    generated = ["cursor.hpp", "unused.hpp", "dialogue_ui_assets.hpp"]
    project = {"cursor": {"asset": "cursor"}, "includes": ["unused.hpp", "manual.hpp"]}
    selected = assetc.project_generated_asset_includes(project, generated, report, include_all_pack_assets=False)
    assert selected == generated
    assert assetc.project_generated_asset_includes(
        {"cursor": {"asset": "cursor"}}, generated, report, include_all_pack_assets=False,
    ) == ["cursor.hpp", "dialogue_ui_assets.hpp"]
    assert assetc.merge_includes(project["includes"], selected) == [
        "unused.hpp", "manual.hpp", "cursor.hpp", "dialogue_ui_assets.hpp",
    ]
    assert assetc.project_generated_asset_includes(project, generated, report) == generated
    assert assetc.project_generated_asset_includes(project, generated, None, include_all_pack_assets=False) == generated
    assert project["includes"] == ["unused.hpp", "manual.hpp"]
    # A custom generated or manually included header may depend on pack symbols.
    assert assetc.project_generated_asset_includes(
        {}, generated + ["custom.hpp"], report, include_all_pack_assets=False,
    ) == generated + ["custom.hpp"]
    assert assetc.project_generated_asset_includes(
        {"includes": ["custom.hpp"]}, generated, report, include_all_pack_assets=False,
    ) == generated


def test_export_racing_omits_unreferenced_asset_header_without_omitting_asset():
    assetc = load_assetc_module()
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp)
        manifest = json.loads((REPO / "tests/fixtures/export_racing_project.json").read_text())
        manifest["template_dir"] = str(REPO / "templates/exported_racing")
        manifest["generated_assets"] = ["extra_palette.hpp"]
        manifest["asset_pack"] = {"assets": [{
            "id": "extra_palette", "kind": "palette", "symbol": "extra_palette",
            "header": "extra_palette.hpp", "palette_values": [0, 31], "palette_slot": "background",
        }]}
        output = root / "output"
        assetc.emit_export_project(manifest, root, output)
        assert (output / "extra_palette.hpp").exists()
        header = (output / manifest["project_data"]).read_text()
        assert '#include "extra_palette.hpp"' not in header
        assert '#include "dialogue_ui_assets.hpp"' in header
        palette_before = (output / "extra_palette.hpp").read_text()
        manifest["asset_pack"]["assets"][0]["palette_values"][1] = 1024
        assetc.emit_export_project(manifest, root, output)
        assert (output / manifest["project_data"]).read_text() == header
        assert (output / "extra_palette.hpp").read_text() != palette_before
        # Adding a consumer restores the dependency and exposes the fresh data.
        manifest["racing_project"]["assets"] = {"bg_palettes": ["extra_palette"]}
        assetc.emit_export_project(manifest, root, output)
        assert '#include "extra_palette.hpp"' in (output / manifest["project_data"]).read_text()
        binary = root / "check"
        subprocess.run([
            "clang++", "-std=c++17", "-I", str(REPO / "engine/include"), "-I", str(output),
            "-x", "c++", "-", "-o", str(binary),
        ], input='#include "racing_project_data.hpp"\nint main() { return extra_palette_palette[1] == 1024 ? 0 : 1; }\n',
            text=True, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        subprocess.run([str(binary)], check=True)



def test_racing_upload_sources_are_scoped_to_referenced_assets():
    assetc = load_assetc_module()
    report = sprite_asset_report("road", "other_scene", "required_hit")
    report["resource_bank_plan"] = [
        {"name": "road_bg_tiles", "asset": "road", "resource": "bg_tiles"},
        {"name": "road_bg_palette_colors", "asset": "road", "resource": "bg_palette_colors"},
        {"name": "other_scene_bg_tiles", "asset": "other_scene", "resource": "bg_tiles"},
        {"name": "required_hit_obj_tiles", "asset": "required_hit", "resource": "obj_tiles", "groups": ["race"]},
    ]
    project = json.loads((REPO / "tests/fixtures/export_racing_project.json").read_text())["racing_project"]
    project["assets"] = {"tile_assets": ["road"]}
    project["rooms"][0]["resource_bank_group"] = "race"
    header = assetc.emit_racing_project_data_header(project, report)
    assert '#include "road.hpp"' in header
    assert '#include "required_hit.hpp"' in header
    assert '"required_hit_obj_tiles", required_hit_tiles' in header
    assert '"road_bg_tiles", road_tiles' in header
    assert '"road_bg_palette_colors", road_palette' in header
    assert '"other_scene_bg_tiles"' not in header
    assert '#include "other_scene.hpp"' not in header
    assert "resource_bank_upload_sources," in header

def main():
    test_referenced_asset_ids_cover_nested_references_and_raw_cpp_symbols()
    test_generated_asset_includes_keep_required_and_explicit_headers()
    test_export_racing_omits_unreferenced_asset_header_without_omitting_asset()
    test_racing_upload_sources_are_scoped_to_referenced_assets()
    test_identical_global_obj_palettes_share_one_hardware_bank()
    test_identical_scene_obj_palettes_share_one_hardware_bank()
    test_background_palette_reference_shares_tile_and_palette_ranges()
    test_pack_json_schema_11_reports_production_pressure()
    test_exclusive_resident_sets_separate_catalog_from_peak_residency()
    test_pack_report_preserves_exporter_physical_audio_budget()
    test_audio_export_serializes_psg_pan_for_all_step_kinds()
    test_oam_sprite_allocations_honor_pack_alignment()
    test_bg_budget_reserves_ui_tiles_for_pause_menu_and_dialogue()
    test_asset_pack_reserves_bg_tile_zero_for_transparent_ui()
    test_cutscene_steps_emit_resource_bank_groups()
    test_camera_zones_are_emitted_for_topdown_and_isometric_rooms()
    test_dungeon_crawler_emits_feature_module_runtime_flags()
    test_topdown_rooms_emit_a_fixed_4bpp_background_contract()
    test_topdown_affine_obj_emits_keyframe_contract()
    test_isometric_and_shmup_emit_native_sprite_visuals()
    test_isometric_emits_explicit_tactical_presentation_data()
    test_shmup_composition_emits_hblank_timeline_keyframes()
    test_shmup_background_emits_each_parallax_plane_in_one_scene_group()
    test_shmup_affine_background_emits_video_and_collision_contract()
    test_assetc_accepts_native_8bpp_affine_pack_contract()
    test_assetc_accepts_indexed_8bpp_isometric_source_contract()
    test_isometric_room_emits_authored_background_separately_from_tileset_atlas()
    test_advanced_runtime_background_uses_tilemap_palette_zero_as_backdrop()
    test_world_map_background_uses_tilemap_palette_zero_as_backdrop()
    test_point_click_emits_custom_cursor_animations()
    test_point_click_emits_layered_backgrounds_and_props()
    test_point_click_prop_preserves_the_authored_initial_animation()
    test_point_click_project_background_count_is_not_overwritten_by_scene_layers()
    test_replace_tile_sequence_packs_tile_asset_index()
    test_set_player_direction_emits_native_event_command()
    test_streaming_sprite_reserves_only_largest_frame_and_emits_frame_assets()
    test_streamed_custom_animation_uses_resident_frame_tiles()


if __name__ == "__main__":
    main()
