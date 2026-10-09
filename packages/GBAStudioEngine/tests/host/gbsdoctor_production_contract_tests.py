#!/usr/bin/env python3
import importlib.util
import json
from pathlib import Path


REPO = Path(__file__).resolve().parents[2]
GBSDOCTOR = REPO / "tools" / "gbsdoctor" / "gbsdoctor.py"


def load_gbsdoctor():
    spec = importlib.util.spec_from_file_location("gbsdoctor", GBSDOCTOR)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_resource_pool_readiness_contract_is_actionable():
    gbsdoctor = load_gbsdoctor()
    manifest = {
        "capabilities": {
            "resource_managers": [
                "resource_pool_usage_report",
                "resource_largest_free_block",
                "resource_free_block_count",
                "assetc_fragmentation_report",
                "assetc_pool_reports",
                "assetc_room_pressure_report",
                "assetc_group_pressure_report",
                "assetc_split_recommendations",
                "assetc_compression_candidates",
                "assetc_optional_asset_fallback",
                "assetc_production_profile_report",
                "assetc_template_pressure_limits",
                "assetc_ui_action_plan",
                "resource_bank_group_upload_streaming",
            ],
            "compression": ["lz77", "rle16"],
        }
    }

    readiness = gbsdoctor.build_resource_pool_readiness(manifest)

    assert readiness["ok"] is True
    assert readiness["items"]
    assert readiness["items"][0]["pool"] == "bg_tiles"
    assert readiness["items"][0]["actionable_report_fields"]
    assert "production_profile.pressure_gates" in readiness["items"][0]["actionable_report_fields"]
    assert "production_profile.ui_actions" in readiness["items"][0]["actionable_report_fields"]
    assert readiness["next_actions"] == []


def test_scene_capability_manifest_requires_explicit_states_and_supported_features():
    gbsdoctor = load_gbsdoctor()
    budget = {
        "bgTiles": 896,
        "objTiles": 192,
        "oam": 48,
        "paletteColors": 512,
        "vramBytes": 65536,
        "eventBytes": 8192,
        "audioBytes": 65535,
        "dmaBytes": 32768,
        "vblankTicks": 4370,
        "cpuWorkTicks": 4370,
    }
    payload = {
        "schema": 1,
        "registry": "gba-studio-scene-capabilities",
        "scenes": [{
            "name": "Arena",
            "scene_type": "shmup",
            "runtime_profile": "shmup",
            "profile_budget": {
                **budget,
            },
            "capabilities": [{
                "id": "score",
                "label": "Pontuação",
                "scene_profiles": ["shmup"],
                "status": {"available": True, "enabled": True, "required": False, "verified": True},
                "assets": [{"kind": "actor_sprite", "required": True, "reason": "O score acompanha os atores da cena."}],
                "editor_tools": ["actor"],
                "budget": {
                    "bgTiles": 0,
                    "objTiles": 0,
                    "oam": 0,
                    "paletteColors": 0,
                    "vramBytes": 0,
                    "eventBytes": 64,
                    "audioBytes": 0,
                    "dmaBytes": 0,
                    "vblankTicks": 0,
                    "cpuWorkTicks": 80,
                },
                "engine_features": ["shmup_runtime.feature_modules", "shmup_runtime.score"],
                "fallback": "desabilitar score",
                "verification": {"tests": ["sceneTypeProfiles.test.ts"], "evidence": ["smoke:exemplo-scenes"]},
                "settings": {}
            }],
            "issues": [],
            "preflight": {
                "schema": 1,
                "registry": "gba-studio-scene-preflight",
                "sceneName": "Arena",
                "sceneType": "shmup",
                "profileId": "shmup",
                "status": "review",
                "layers": [],
                "assets": [],
                "checklist": [],
                "issues": [],
                "editorTools": [],
                "requiredEditorTools": [],
                "enabledCapabilities": [],
                "fallback": "manter o perfil regular",
                "verification": {"tests": ["scenePreflight.test.ts"], "evidence": ["smoke"]},
                "collision": {"independentOfArt": True},
                "budget": {"source": "profile", "safeLimit": budget},
            }
        }]
    }

    assert gbsdoctor.validate_scene_capability_manifest(payload, {
        "shmup_runtime.feature_modules",
        "shmup_runtime.score",
    }) == []

    invalid_preflight = json.loads(json.dumps(payload))
    invalid_preflight["scenes"][0]["preflight"]["collision"]["independentOfArt"] = False
    errors = gbsdoctor.validate_scene_capability_manifest(invalid_preflight, {
        "shmup_runtime.feature_modules",
        "shmup_runtime.score",
    })
    assert any(error["path"].endswith("preflight.collision.independentOfArt") for error in errors)

    incompatible_preflight = json.loads(json.dumps(payload))
    incompatible_preflight["scenes"][0]["preflight"]["profileId"] = "puzzle"
    errors = gbsdoctor.validate_scene_capability_manifest(incompatible_preflight, {
        "shmup_runtime.feature_modules",
        "shmup_runtime.score",
    })
    assert any(error["path"].endswith("preflight.profileId") and "compativ" in error["message"] for error in errors)

    invalid = json.loads(json.dumps(payload))
    invalid["scenes"][0]["capabilities"][0]["status"]["enabled"] = False
    invalid["scenes"][0]["capabilities"][0]["status"]["required"] = True
    errors = gbsdoctor.validate_scene_capability_manifest(invalid, {"shmup_runtime.feature_modules"})

    assert any(error["path"].endswith("status.required") for error in errors)

    invalid["scenes"][0]["capabilities"][0]["status"] = {
        "available": True,
        "enabled": True,
        "required": False,
        "verified": True,
    }
    errors = gbsdoctor.validate_scene_capability_manifest(invalid, {"shmup_runtime.feature_modules"})
    assert any(error["path"].endswith("engine_features") for error in errors)

    unknown = json.loads(json.dumps(payload))
    unknown["scenes"][0]["capabilities"][0]["id"] = "not-registered"
    errors = gbsdoctor.validate_scene_capability_manifest(unknown, {"shmup_runtime.feature_modules", "shmup_runtime.score"})
    assert any(error["path"].endswith(".id") and "registry" in error["message"] for error in errors)


def test_scene_capability_registry_is_closed_in_public_export_schema():
    gbsdoctor = load_gbsdoctor()
    schema = json.loads((REPO / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    capability_id_schema = schema["properties"]["capability_manifest"]["properties"]["scenes"]["items"]["properties"]["capabilities"]["items"]["properties"]["id"]

    assert set(capability_id_schema["enum"]) == gbsdoctor.SCENE_CAPABILITY_IDS


def test_tactical_capability_asset_index_is_closed_and_safe():
    gbsdoctor = load_gbsdoctor()
    schema = json.loads((REPO / "schemas" / "asset_pack.schema.json").read_text(encoding="utf-8"))
    capability_asset_schema = schema["properties"]["capability_assets"]["items"]
    expected_ids = {
        "tactical_surface",
        "tactical_grid_overlay",
        "tactical_hud",
        "tactical_units",
        "tactical_props",
        "tactical_feedback",
        "tactical_audio",
    }

    assert set(capability_asset_schema["properties"]["capability"]["enum"]) == expected_ids
    assert gbsdoctor.SCENE_CAPABILITY_ASSET_IDS == expected_ids
    assert gbsdoctor.validate_asset_pack_payload({
        "assets": [],
        "capability_assets": [{
            "scene": "arena_tatica",
            "capability": "tactical_surface",
            "references": ["arena", "arena#palette"],
        }],
    }) == []

    invalid = {
        "assets": [],
        "capability_assets": [{
            "scene": "arena_tatica",
            "capability": "tactical_surface",
            "references": ["/tmp/arena.png"],
        }],
    }
    errors = gbsdoctor.validate_asset_pack_payload(invalid)
    assert any(error["path"].endswith("references[0]") for error in errors)

    invalid["capability_assets"][0]["capability"] = "not-registered"
    errors = gbsdoctor.validate_asset_pack_payload(invalid)
    assert any(error["path"].endswith("capability") for error in errors)


def tactical_presentation_payload():
    animation_names = (
        "idle_down", "idle_up", "idle_left", "idle_right",
        "move_down", "move_up", "move_left", "move_right",
        "attack_down", "attack_up", "attack_left", "attack_right",
        "hurt_down", "hurt_up", "hurt_left", "hurt_right",
        "defeat_down", "defeat_up", "defeat_left", "defeat_right",
    )
    audio_cues = ("cursor", "select", "cancel", "move", "attack", "hit", "turn", "victory", "defeat")
    return {
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
            "id": "arena-surface",
            "reference": "arena-surface",
            "consumer": "bg",
            "required": True,
            "status": "candidate",
        }],
        "surface_asset": "arena-surface",
        "grid_asset": "arena-grid",
        "hud_layout": "arena-hud",
        "units": [{
            "actor_id": "nara",
            "sheet": "nara",
            "animations": {name: f"nara-{name}" for name in animation_names},
        }],
        "props": [{
            "id": "beacon",
            "asset": "beacon",
            "kind": "objective",
            "tile": {"x": 1, "y": 1, "z": 0},
            "animated": True,
        }],
        "cursor_asset": "cursor",
        "range_asset": "range",
        "target_asset": "target",
        "emotes": {"asset": "emotes", "index": 0},
        "feedback": {"asset": "feedback", "index": 1},
        "audio": {
            "format": "COMPOSED",
            "music": "arena-music",
            "cues": {cue: f"arena-{cue}" for cue in audio_cues},
            "cue_indices": {cue: index for index, cue in enumerate(audio_cues)},
        },
        "indices": {
            "markers": {"cursor": 0, "range": 1, "target": 2},
            "props": [{"id": "beacon", "index": 0}],
            "audio_cues": {cue: index for index, cue in enumerate(audio_cues)},
        },
    }


def test_isometric_tactical_presentation_contract_is_closed_and_actionable():
    gbsdoctor = load_gbsdoctor()
    payload = tactical_presentation_payload()

    assert gbsdoctor.validate_isometric_tactical_presentation(payload) == []

    invalid = json.loads(json.dumps(payload))
    invalid["capabilities"].append("not-registered")
    errors = gbsdoctor.validate_isometric_tactical_presentation(invalid)
    assert any(error["path"].endswith("capabilities[7]") for error in errors)

    invalid = json.loads(json.dumps(payload))
    invalid["layers"]["hud"] = "BG1"
    errors = gbsdoctor.validate_isometric_tactical_presentation(invalid)
    assert any(error["path"].endswith("layers.hud") for error in errors)

    invalid = json.loads(json.dumps(payload))
    del invalid["units"][0]["animations"]["attack_right"]
    errors = gbsdoctor.validate_isometric_tactical_presentation(invalid)
    assert any(error["path"].endswith("animations.attack_right") for error in errors)

    invalid = json.loads(json.dumps(payload))
    invalid["audio"]["cue_indices"]["hit"] = 0
    errors = gbsdoctor.validate_isometric_tactical_presentation(invalid)
    assert any(error["path"].endswith("audio.cue_indices.hit") for error in errors)

    invalid = json.loads(json.dumps(payload))
    invalid["audio"]["format"] = "PCM"
    errors = gbsdoctor.validate_isometric_tactical_presentation(invalid)
    assert any(error["path"].endswith("audio.format") for error in errors)


def test_export_project_validates_tactical_presentation_inside_isometric_rooms():
    gbsdoctor = load_gbsdoctor()
    presentation = tactical_presentation_payload()
    payload = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "isometric",
        "template_dir": "templates/exported_mixed",
        "entry": "export_project.json",
        "project_data": "project.json",
        "generated_assets": [],
        "capability_manifest": {
            "schema": 1,
            "registry": "gba-studio-scene-capabilities",
            "scenes": [],
        },
        "build": {"command": "make", "working_dir": "."},
        "runtime_dispatch": {
            "initial_runtime": "isometric",
            "initial_room": 0,
            "runtimes": ["isometric", "topdown"],
        },
        "requires": {"features": []},
        "isometric_project": {
            "rooms": [{
                "name": "tactical",
                "grid": {"gameplay_mode": "tactical"},
                "tactical_presentation": presentation,
            }],
        },
    }

    assert gbsdoctor.validate_export_project_payload(payload) == []
    invalid = json.loads(json.dumps(payload))
    del invalid["isometric_project"]["rooms"][0]["tactical_presentation"]["hud_layout"]
    errors = gbsdoctor.validate_export_project_payload(invalid)
    assert any("tactical_presentation.hud_layout" in error["path"] for error in errors)


def test_scene_preflight_registry_is_closed_in_public_export_schema():
    gbsdoctor = load_gbsdoctor()
    schema = json.loads((REPO / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    preflight_schema = schema["$defs"]["scene_preflight_report"]
    profile_schema = preflight_schema["properties"]["profileId"]
    scene_schema = schema["properties"]["capability_manifest"]["properties"]["scenes"]["items"]

    assert set(profile_schema["enum"]) == gbsdoctor.SCENE_PREFLIGHT_PROFILE_IDS
    assert scene_schema["properties"]["preflight"]["$ref"] == "#/$defs/scene_preflight_report"


def test_scene_preflight_fixture_context_is_explicit_and_non_production():
    gbsdoctor = load_gbsdoctor()
    preflight = {
        "schema": 1,
        "registry": "gba-studio-scene-preflight",
        "sceneName": "Arena",
        "sceneType": "shmup",
        "profileId": "shmup",
        "status": "review",
        "layers": [],
        "assets": [],
        "checklist": [],
        "issues": [],
        "editorTools": [],
        "requiredEditorTools": [],
        "enabledCapabilities": [],
        "fallback": "manter o perfil regular",
        "verification": {"tests": ["scenePreflight.test.ts"], "evidence": ["smoke"]},
        "collision": {"independentOfArt": True},
        "budget": {"source": "profile", "safeLimit": {
            "bgTiles": 0,
            "objTiles": 0,
            "oam": 0,
            "paletteColors": 0,
            "vramBytes": 0,
            "eventBytes": 0,
            "audioBytes": 0,
            "dmaBytes": 0,
            "vblankTicks": 0,
            "cpuWorkTicks": 0,
        }},
        "fixture": {
            "registry": "gba-studio-complete-structural-fixture",
            "mode": "structural",
            "productionReady": False,
        },
    }

    assert gbsdoctor.validate_scene_preflight_report(preflight) == []

    invalid = json.loads(json.dumps(preflight))
    invalid["fixture"]["productionReady"] = True
    errors = gbsdoctor.validate_scene_preflight_report(invalid)
    assert any(error["path"].endswith("fixture.productionReady") for error in errors)

    schema = json.loads((REPO / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    fixture_schema = schema["$defs"]["scene_preflight_report"]["properties"]["fixture"]
    assert fixture_schema["properties"]["mode"]["const"] == "structural"
    assert fixture_schema["properties"]["productionReady"]["const"] is False


def test_structural_fixture_manifest_is_explicit_and_never_production():
    gbsdoctor = load_gbsdoctor()
    manifest = {
        "schema": 1,
        "registry": "gba-studio-complete-structural-fixture",
        "mode": "structural",
        "source": "canonical-template",
        "production_ready": False,
        "status": "complete",
        "scene_count": 1,
        "scenes": [{
            "name": "arena",
            "scene_type": "luta",
            "profile_id": "luta",
            "production_status": "review",
            "structural_status": "complete",
            "production_ready": False,
            "placeholder_roles": ["hud"],
            "resolved_layers": ["background", "collision", "actors", "hud"],
            "resolved_assets": [{
                "role": "background",
                "reference": "arena.png",
                "kind": "regular_bg",
                "source": "existing-project",
                "production_ready": False,
            }],
            "verification": {"tests": ["fixture.test.ts"], "evidence": ["smoke fixture"]},
            "issues": [],
        }],
    }

    assert gbsdoctor.validate_structural_fixture_manifest(manifest) == []

    invalid = json.loads(json.dumps(manifest))
    invalid["production_ready"] = True
    errors = gbsdoctor.validate_structural_fixture_manifest(invalid)
    assert any(error["path"].endswith("production_ready") for error in errors)

    schema = json.loads((REPO / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    assert schema["properties"]["structural_fixture"]["$ref"] == "#/$defs/complete_structural_fixture"


def test_scene_contract_validates_composition_and_typed_resources():
    gbsdoctor = load_gbsdoctor()
    budget = {
        "bgTiles": 64,
        "objTiles": 0,
        "oam": 0,
        "paletteColors": 16,
        "vramBytes": 4096,
        "eventBytes": 0,
        "audioBytes": 0,
        "dmaBytes": 2048,
        "vblankTicks": 0,
        "cpuWorkTicks": 120,
    }
    contract = {
        "name": "Arena",
        "scene_type": "shmup",
        "runtime_profile": "shmup",
        "composition": {
            "schema": 1,
            "enabled": True,
            "mode": "affine",
            "display_mode": 1,
            "default_tiled": False,
            "fallback": "error",
            "layers": [{
                "id": "storm",
                "kind": "affine_bg",
                "role": "decorative",
                "layer": "BG2",
                "asset": "storm",
                "priority": 2,
                "parallax_x256": 128,
                "parallax_y256": 256,
                "scroll_x": 0,
                "scroll_y": 0,
                "bitmap_page": 0,
                "affine": {
                    "rotation_degrees": 0,
                    "scale_x": 1,
                    "scale_y": 1,
                    "pivot_x": 120,
                    "pivot_y": 80,
                    "wrap": True,
                },
            }],
            "effects": {
                "blend": {
                    "enabled": False,
                    "mode": "none",
                    "first_targets": [],
                    "second_targets": [],
                    "eva": 8,
                    "evb": 8,
                    "intensity": 0,
                },
                "mosaic": {"enabled": False, "bgX": 0, "bgY": 0, "objX": 0, "objY": 0},
                "window0": {
                    "enabled": False,
                    "left": 0,
                    "right": 240,
                    "top": 0,
                    "bottom": 160,
                    "insideTargets": [],
                    "outsideTargets": [],
                },
                "window1": {
                    "enabled": False,
                    "left": 0,
                    "right": 240,
                    "top": 0,
                    "bottom": 160,
                    "insideTargets": [],
                    "outsideTargets": [],
                },
                "hblank": {"enabled": False, "layer": "BG2", "hdma": False, "scroll_offsets": []},
            },
            "budget": budget,
        },
        "resources": {
            "schema": 1,
            "resources": [{
                "id": "storm",
                "asset": "storm",
                "kind": "affine_bg",
                "enabled": True,
                "required": True,
                "bpp": 8,
                "palette": {"id": "storm_palette", "slot": "background", "colors": 256},
                "compression": "lz77",
                "tile_limit": 256,
                "resource_group": "arena",
                "prefetch": "scene",
                "cache": "resident",
                "eviction_priority": 0,
                "dependencies": ["storm_palette"],
                "fallback": {"mode": "error"},
                "budget": budget,
            }],
            "dependencies": ["storm_palette"],
        },
    }

    assert gbsdoctor.validate_scene_contracts([contract]) == []

    contract["metatiles"] = {
        "schema": 1,
        "enabled": True,
        "contract": "gba-authored-metatile-2x2-v1",
        "fallback": "error",
        "block_width": 2,
        "block_height": 2,
        "logical_width": 1,
        "logical_height": 1,
        "library": [{
            "id": "grass",
            "label": "Grama",
            "tiles": [1, 2, 3, 4],
            "semantic": {
                "collision": "free",
                "terrain": "grass",
                "damage": 0,
                "speed_percent": 100,
                "animation": "",
                "on_enter_event": "",
                "step_sound": "",
                "tags": [],
            },
        }],
        "map": [0],
        "physical": {
            "width_tiles": 2,
            "height_tiles": 2,
            "visual_tiles": [1, 2, 3, 4],
            "collision_types": ["free", "free", "free", "free"],
        },
        "export_cost": budget,
    }
    assert gbsdoctor.validate_scene_contracts([contract]) == []

    invalid_metatiles = json.loads(json.dumps(contract))
    del invalid_metatiles["metatiles"]["export_cost"]["vramBytes"]
    errors = gbsdoctor.validate_scene_contracts([invalid_metatiles])
    assert any(error["path"].endswith("metatiles.export_cost.vramBytes") for error in errors)

    invalid = json.loads(json.dumps(contract))
    invalid["composition"]["effects"]["hblank"]["enabled"] = True
    errors = gbsdoctor.validate_scene_contracts([invalid])
    assert any(error["path"].endswith("effects.hblank") for error in errors)

    invalid = json.loads(json.dumps(contract))
    invalid["resources"]["resources"][0]["bpp"] = 4
    errors = gbsdoctor.validate_scene_contracts([invalid])
    assert any(error["path"].endswith("resources[0].bpp") for error in errors)


def test_asset_banking_diagnostic_requires_production_profile_contract():
    gbsdoctor = load_gbsdoctor()
    manifest = {
        "capabilities": {
            "resource_managers": [
                "resource_bank_descriptor",
                "resource_bank_group_upload_streaming",
                "resource_bank_named_upload_sources",
                "resource_stream_diagnostics",
                "resource_bank_camera_prefetch",
                "resource_bank_camera_prefetch_uploads",
                "resource_bank_area_window_prefetch",
                "resource_bank_prefetch_budget_policy",
                "resource_bank_cache_prune_policy",
                "resource_bank_cache_prune_preview",
                "resource_free_block_count",
                "resource_next_range_preview",
                "resource_bank_reservation_preview",
                "resource_bank_batch_preview",
                "resource_bank_group_preview",
                "resource_bank_cache_group_promotion",
                "resource_bank_cache_group_hot_swap",
                "template_room_resource_bank_prefetch_promotion",
                "template_room_resource_bank_prefetch_budget",
                "assetc_resource_bank_plan",
                "assetc_resource_bank_groups",
                "assetc_group_pressure_report",
                "assetc_pool_reports",
                "assetc_room_pressure_report",
                "assetc_template_pressure_report",
                "assetc_split_recommendations",
                "assetc_compression_candidates",
                "asset_export_resource_bank_upload_sources",
                "template_room_resource_bank_group_upload_streaming",
            ],
        }
    }

    diagnostics = gbsdoctor.build_capability_diagnostics(manifest)

    assert diagnostics["asset_banking"]["ok"] is False
    assert "assetc_production_profile_report" in diagnostics["asset_banking"]["missing"]
    assert "assetc_template_pressure_limits" in diagnostics["asset_banking"]["missing"]
    assert "assetc_ui_action_plan" in diagnostics["asset_banking"]["missing"]


def test_asset_pack_report_public_schema_contract_is_actionable():
    gbsdoctor = load_gbsdoctor()
    payload = {
        "schema": 11,
        "kind": "GBAStudioAssetPackReport",
        "ok": True,
        "stress_profile": "host_contract",
        "asset_count": 1,
        "budgets": {},
        "production_summary": {
            "ready_for_large_project": True,
            "required_asset_count": 1,
            "required_failed_count": 0,
            "optional_asset_count": 0,
            "optional_omitted_count": 0,
            "split_recommendation_count": 0,
            "compression_candidate_count": 0,
            "blocking_overflow_count": 0,
        },
        "production_profile": {
            "id": "topdown_small",
            "schema": 1,
            "severity": "ok",
            "ready_for_beta_export": True,
            "ready_for_primary_backend": False,
            "backend_policy": "parallel_until_manual_promotion",
            "templates": ["topdown_basic"],
            "template_limits": {"topdown_basic": {"bg_tiles_percent": 70}},
            "pressure_gates": [
                {
                    "scope": "template",
                    "name": "topdown_basic",
                    "template": "topdown_basic",
                    "severity": "ok",
                    "risk_score": 0,
                    "pressure": [],
                }
            ],
            "ui_actions": [
                {
                    "id": "split_room_bg",
                    "severity": "info",
                    "scope": "room",
                    "action": "split_large_background",
                }
            ],
            "ui_action_count": 1,
            "manual_validation_required": ["manual_mgba_stress_smoke"],
        },
        "asset_reports": {},
        "pool_reports": {},
        "room_pressure_report": [],
        "template_pressure_report": [],
        "split_recommendations": [],
        "compression_candidates": [],
        "diagnostics": [],
        "errors": [],
    }

    assert gbsdoctor.infer_public_schema_key(payload) == "asset_pack_report"
    assert gbsdoctor.validate_asset_pack_report_payload(payload) == []

    invalid = dict(payload)
    invalid["production_profile"] = dict(payload["production_profile"])
    invalid["production_profile"]["ui_action_count"] = 2

    errors = gbsdoctor.validate_asset_pack_report_payload(invalid)

    assert any(error["path"] == "$.production_profile.ui_action_count" for error in errors)


def test_readiness_evidence_public_schema_requires_provenance_for_true_gates():
    gbsdoctor = load_gbsdoctor()
    schema = json.loads((REPO / "schemas" / "readiness_evidence.schema.json").read_text())

    manual_gate = schema["properties"]["manual_mgba_stress_smoke"]
    hardware_gate = schema["properties"]["hardware_or_ci_validation"]
    rollout_gate = schema["properties"]["gba_studio_engine_primary_rollout"]

    assert manual_gate["$ref"] == "#/$defs/manual_mgba_stress_smoke_gate"
    assert hardware_gate["$ref"] == "#/$defs/hardware_or_ci_validation_gate"
    assert rollout_gate["$ref"] == "#/$defs/gba_studio_engine_primary_rollout_gate"

    manual_true_contract = schema["$defs"]["manual_mgba_stress_smoke_gate"]["oneOf"][1]["allOf"][1]["then"]
    assert set(manual_true_contract["required"]) == {"source", "checked_at", "evidence_type", "review_environment"}
    assert manual_true_contract["properties"]["evidence_type"]["const"] == "manual_mgba_stress_smoke"
    assert schema["$defs"]["gate_object"]["properties"]["review_environment"]["minLength"] == 1

    hardware_true_contract = schema["$defs"]["hardware_or_ci_validation_gate"]["oneOf"][1]["allOf"][1]["then"]
    assert set(hardware_true_contract["required"]) == {"source", "checked_at", "evidence_type"}
    assert set(hardware_true_contract["properties"]["evidence_type"]["enum"]) == {
        "hardware_real",
        "cross_platform_ci",
        "local_cross_platform_dry_run",
    }

    errors = gbsdoctor.validate_readiness_evidence_payload({
        "manual_mgba_stress_smoke": {"ok": True, "source": "log"},
        "hardware_or_ci_validation": {"ok": True, "source": "ci"},
        "gba_studio_engine_primary_rollout": {"ok": True, "source": "rollout"},
    })
    assert any(error["path"] == "$.manual_mgba_stress_smoke" and "evidence_type" in error["message"] for error in errors)

    missing_environment_errors = gbsdoctor.validate_readiness_evidence_payload({
        "manual_mgba_stress_smoke": {
            "ok": True,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "manual approval note",
            "checked_at": "2026-06-25T12:00:00Z",
        },
        "hardware_or_ci_validation": {"ok": False},
        "gba_studio_engine_primary_rollout": {"ok": False},
    })
    assert any(error["path"] == "$.manual_mgba_stress_smoke" and "review_environment" in error["message"] for error in missing_environment_errors)


def test_cross_platform_ci_evidence_rejects_local_simulation_provenance():
    gbsdoctor = load_gbsdoctor()

    errors = gbsdoctor.validate_readiness_evidence_payload({
        "manual_mgba_stress_smoke": {"ok": False},
        "hardware_or_ci_validation": {
            "ok": True,
            "evidence_type": "cross_platform_ci",
            "source": "build/ci-local-merge/cross-platform-macos-report.json",
            "checked_at": "2026-06-26T12:00:00Z",
            "message": "Local simulation of GitHub Actions macos platform evidence.",
            "validated_platforms": ["macos", "windows", "linux"],
        },
        "gba_studio_engine_primary_rollout": {"ok": False},
    })

    assert any(
        error["path"] == "$.hardware_or_ci_validation"
        and "cross_platform_ci" in error["message"]
        and "real" in error["message"]
        for error in errors
    )

    generic_merge_errors = gbsdoctor.validate_readiness_evidence_payload({
        "manual_mgba_stress_smoke": {"ok": False},
        "hardware_or_ci_validation": {
            "ok": True,
            "evidence_type": "cross_platform_ci",
            "source": "multiple cross-platform CI inputs",
            "checked_at": "2026-06-26T12:00:00Z",
            "message": "Cross-platform CI evidence merged from multiple platform runs.",
            "validated_platforms": ["macos", "windows", "linux"],
        },
        "gba_studio_engine_primary_rollout": {"ok": False},
    })

    assert any(
        error["path"] == "$.hardware_or_ci_validation"
        and "cross_platform_ci" in error["message"]
        and "real" in error["message"]
        for error in generic_merge_errors
    )


def test_docs_do_not_present_butano_as_primary_backend():
    docs = {
        "CHANGELOG.md": REPO / "CHANGELOG.md",
        "docs/ELECTRON_COMPATIBILITY.md": REPO / "docs" / "ELECTRON_COMPATIBILITY.md",
        "docs/INTEGRATION_CONTRACT.md": REPO / "docs" / "INTEGRATION_CONTRACT.md",
        "docs/SMOKE_TEST.md": REPO / "docs" / "SMOKE_TEST.md",
    }
    forbidden = [
        "Butano continua como backend padrao",
        "manter Butano como backend padrao",
        "Manter `butano` e `gbastudio_engine` como backends paralelos",
        "substituir Butano como backend principal",
        "substituir Butano automaticamente",
    ]

    for name, path in docs.items():
        text = path.read_text(encoding="utf-8")
        for phrase in forbidden:
            assert phrase not in text, f"{name} still presents Butano as primary: {phrase}"

    integration_contract = docs["docs/INTEGRATION_CONTRACT.md"].read_text(encoding="utf-8")
    assert "Butano apenas como backend legado/manual" in integration_contract
    assert "gbastudio_engine` como backend primario privado" in integration_contract


def test_sdk_template_diagnostics_rejects_empty_requirements_and_tracks_current_docs():
    gbsdoctor = load_gbsdoctor()
    manifest = {
        "capabilities": {"topdown_runtime": ["camera_zones"]},
        "sdk": {
            "templates": [{
                "id": "topdown_basic",
                "name": "Top-down",
                "genre": "topdown",
                "entry": "engine/include/gbs/engine.hpp",
                "project_data": "engine/include/gbs/engine.hpp",
                "supports_export_fixture": True,
                "requires": [],
            }]
        },
    }

    diagnostics = gbsdoctor.sdk_template_diagnostics(REPO, manifest)

    assert diagnostics[0]["requirements_ok"] is False
    assert diagnostics[0]["requirement_errors"]
    assert diagnostics[0]["ok"] is False
    assert (REPO / "docs" / "ROADMAP.md").read_text(encoding="utf-8").startswith(
        "# Roadmap\n\n## Estado Atual Do Engine Pack\n\nStatus: v2.25.0"
    )
    assert "RuntimeServices" in (REPO / "docs" / "BUTANO_PARITY_MATRIX.md").read_text(encoding="utf-8")


def test_engine_primary_milestone_tracks_current_private_readiness_state():
    milestone = (REPO / "docs" / "ENGINE_PRIMARY_BACKEND_MILESTONE.md").read_text(encoding="utf-8")

    assert "stage: beta_candidate" in milestone
    assert "ready_for_primary_backend: false" in milestone
    assert "manual_mgba_stress_smoke` esta `ok: true`" in milestone
    assert "`gba_studio_engine_primary_rollout` como `ok: true`" in milestone
    assert "mGBA 0.10.5" in milestone
    assert "hardware_or_ci_validation" in milestone
    assert "Bloqueio restante:" in milestone
    assert "Engine Pack local do checkout ainda nao tem todos os caminhos finais" not in milestone
    assert "`stress_readiness` ainda esta falso" not in milestone
    assert "hardware/CI e rollout privado no app" not in milestone


def test_exported_templates_declare_engine_runtime_without_butano_dependency():
    template_root = REPO / "templates"
    exported_templates = sorted(path for path in template_root.glob("exported_*") if path.is_dir())

    assert exported_templates

    for template_dir in exported_templates:
        readme = template_dir / "README.md"
        assert readme.exists(), f"{template_dir.name} precisa documentar o contrato runtime"

        readme_text = readme.read_text(encoding="utf-8")
        assert "lib/libgbastudio_engine.a" in readme_text, f"{template_dir.name} nao declara a lib da engine propria"
        assert "sem depender do Butano" in readme_text, f"{template_dir.name} nao bloqueia dependencia Butano no contrato"

        for source in template_dir.rglob("*"):
            if not source.is_file() or source.suffix not in {".cpp", ".hpp", ".json"}:
                continue
            text = source.read_text(encoding="utf-8")
            assert "Butano" not in text
            assert "butano" not in text
            assert "libgba.a" not in text

    makefile = template_root / "Makefile.gba"
    makefile_text = makefile.read_text(encoding="utf-8")
    assert "lib/libgbastudio_engine.a" in makefile_text
    assert "Butano" not in makefile_text
    assert "butano" not in makefile_text
    assert "libgba.a" not in makefile_text


def test_shmup_project_validates_affine_world_and_collision_planes():
    gbsdoctor = load_gbsdoctor()
    project = {
        "backgrounds": [{
            "name": "day",
            "width_tiles": 90,
            "height_tiles": 20,
            "layers": [],
            "video": {
                "display_mode": 1,
                "affine": {"asset": "day_bg", "layer": "BG2"},
            },
            "collision_flags": [0, 1, 0, 1],
            "collision_width_tiles": 2,
            "collision_height_tiles": 2,
            "world_width_pixels": 720,
            "world_height_pixels": 160,
        }],
    }

    assert gbsdoctor.validate_shmup_project_contract(project) == []

    invalid = json.loads(json.dumps(project))
    invalid["backgrounds"][0]["width_tiles"] = 60
    errors = gbsdoctor.validate_shmup_project_contract(invalid)
    assert any(error["path"].endswith(".width_tiles") and "90x20" in error["message"] for error in errors)

    invalid = json.loads(json.dumps(project))
    invalid["backgrounds"][0]["collision_flags"] = [0]
    errors = gbsdoctor.validate_shmup_project_contract(invalid)
    assert any("collision_flags" in error["path"] and "dimensoes" in error["message"] for error in errors)


def test_asset_pack_accepts_native_affine_bpp_and_rejects_it_for_regular_assets():
    gbsdoctor = load_gbsdoctor()
    affine_asset = {"name": "day_bg", "kind": "affine_bg", "background_bpp": 8}
    regular_asset = {"name": "day_bg", "kind": "bg", "background_bpp": 8}

    assert gbsdoctor.validate_asset_pack_payload({"assets": [affine_asset]}) == []
    errors = gbsdoctor.validate_asset_pack_payload({"assets": [regular_asset]})
    assert any(error["path"].endswith(".background_bpp") for error in errors)


def test_asset_pack_public_schema_matches_native_affine_bpp_contract():
    schema = json.loads((REPO / "schemas" / "asset_pack.schema.json").read_text(encoding="utf-8"))
    asset_schema = schema["properties"]["assets"]["items"]

    assert asset_schema["properties"]["background_bpp"]["enum"] == [4, 8]
    affine_rule = next(
        rule for rule in asset_schema["allOf"]
        if rule["if"]["properties"]["kind"].get("const") == "affine_bg"
    )
    assert affine_rule["then"]["properties"]["background_bpp"]["const"] == 8


def test_asset_pack_compression_policy_accepts_auto_and_manual_huffman_contracts():
    gbsdoctor = load_gbsdoctor()
    schema = json.loads((REPO / "schemas" / "asset_pack.schema.json").read_text(encoding="utf-8"))
    policy_schema = schema["properties"]["assets"]["items"]["properties"]["compression_policy"]
    assert policy_schema["oneOf"][0]["const"] == "auto"
    assert policy_schema["oneOf"][1]["required"] == ["strategy", "tiles", "tilemap", "palette"]

    assert gbsdoctor.validate_asset_pack_payload({
        "assets": [{"name": "forest", "kind": "bg", "compression_policy": "auto"}]
    }) == []
    assert gbsdoctor.validate_asset_pack_payload({
        "assets": [{
            "name": "forest",
            "kind": "bg",
            "compression_policy": {
                "strategy": "manual",
                "tiles": "huffman",
                "tilemap": "lz77",
                "palette": "none",
            },
        }]
    }) == []

    errors = gbsdoctor.validate_asset_pack_payload({
        "assets": [{
            "name": "portrait",
            "kind": "obj",
            "compression_policy": {
                "strategy": "manual",
                "tiles": "huffman",
                "tilemap": "none",
                "palette": "none",
            },
        }]
    })
    assert any(error["path"].endswith("compression_policy.tiles") for error in errors)


def test_exported_shmup_template_consumes_per_background_affine_and_collision_contract():
    template = REPO / "templates" / "exported_shmup" / "main.cpp"
    source = template.read_text(encoding="utf-8")

    assert "background->video.affine_enabled" in source
    assert "refresh_affine_background" in source
    assert "gbs::shmup_background_collision_at" in source
    assert "gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true)" in source


def main():
    test_resource_pool_readiness_contract_is_actionable()
    test_asset_banking_diagnostic_requires_production_profile_contract()
    test_scene_contract_validates_composition_and_typed_resources()
    test_asset_pack_report_public_schema_contract_is_actionable()
    test_readiness_evidence_public_schema_requires_provenance_for_true_gates()
    test_cross_platform_ci_evidence_rejects_local_simulation_provenance()
    test_scene_capability_manifest_requires_explicit_states_and_supported_features()
    test_scene_capability_registry_is_closed_in_public_export_schema()
    test_tactical_capability_asset_index_is_closed_and_safe()
    test_isometric_tactical_presentation_contract_is_closed_and_actionable()
    test_export_project_validates_tactical_presentation_inside_isometric_rooms()
    test_scene_preflight_registry_is_closed_in_public_export_schema()
    test_scene_preflight_fixture_context_is_explicit_and_non_production()
    test_structural_fixture_manifest_is_explicit_and_never_production()
    test_shmup_project_validates_affine_world_and_collision_planes()
    test_asset_pack_accepts_native_affine_bpp_and_rejects_it_for_regular_assets()
    test_asset_pack_public_schema_matches_native_affine_bpp_contract()
    test_exported_shmup_template_consumes_per_background_affine_and_collision_contract()
    test_docs_do_not_present_butano_as_primary_backend()
    test_sdk_template_diagnostics_rejects_empty_requirements_and_tracks_current_docs()
    test_engine_primary_milestone_tracks_current_private_readiness_state()
    test_exported_templates_declare_engine_runtime_without_butano_dependency()


if __name__ == "__main__":
    main()
