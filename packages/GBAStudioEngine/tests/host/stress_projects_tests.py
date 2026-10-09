#!/usr/bin/env python3
import importlib.util
import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("stress_projects", REPO_ROOT / "scripts" / "stress_projects.py")
STRESS = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(STRESS)


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def main():
    profiles = STRESS.load_profiles(
        REPO_ROOT,
        REPO_ROOT / "tests" / "stress" / "stress_profiles.json",
    )
    expected = {
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
    }
    require(set(STRESS.TARGET_IDS) == expected, "a matriz de stress deve cobrir todos os runtimes prioritarios")
    require(set(profiles) == expected, "todos os alvos devem possuir perfil versionado")
    progressive_targets = {
        "topdown_large",
        "platformer_large",
        "isometric_large",
        "sprites_oam_heavy",
        "tilesets_vram_heavy",
        "audio_heavy",
        "hardware_contention",
    }
    for target_id, profile in profiles.items():
        policy = profile.get("streaming_policy")
        require(isinstance(policy, dict), f"{target_id}: politica de streaming ausente")
        if target_id in progressive_targets:
            require(policy.get("mode") == "progressive_prefetch", f"{target_id}: deve usar prefetch progressivo")
            require(policy.get("max_new_banks_per_frame") == 2, f"{target_id}: orçamento de bancos divergente do runtime")
            require(policy.get("max_uploads_per_frame") == 2, f"{target_id}: orçamento de uploads divergente do runtime")

    calibration = STRESS.streaming_calibration(
        profiles["topdown_large"],
        {
            "bank_usage_by_group": [{
                "name": "room_0",
                "bank_count": 6,
                "resources": {
                    "bg_tiles": {"count": 720},
                    "obj_tiles": {"count": 128},
                    "bg_palette_colors": {"count": 128},
                    "obj_palette_colors": {"count": 64},
                    "oam_sprites": {"count": 96},
                },
            }],
        },
    )
    require(calibration["max_group_bank_count"] == 6, "calibracao deve medir o maior grupo")
    require(calibration["max_group_dma_bytes"] == 28288, "calibracao deve converter recursos em bytes DMA")
    require(calibration["prefetch_frames"] == 3, "dois bancos por frame devem distribuir seis bancos em tres frames")
    require(calibration["estimated_dma_bytes_per_frame"] == 9430, "calibracao deve estimar a carga por frame")
    require(calibration["within_editorial_dma_budget"] is True, "perfil calibrado deve respeitar o orçamento editorial")

    contracts = {
        "shmup_large": ("exported_shmup", "shmup_project_data.hpp", "shmup_project", "waves"),
        "point_click_large": ("exported_point_click", "point_click_project_data.hpp", "point_click_project", "scenes"),
        "dungeon_crawler_large": ("exported_dungeon_crawler", "dungeon_crawler_project_data.hpp", "dungeon_crawler_project", "rooms"),
        "racing_large": ("exported_racing", "racing_project_data.hpp", "racing_project", "rooms"),
    }
    for target_id, (template, header, block, collection) in contracts.items():
        manifest = STRESS.project_manifest(REPO_ROOT, target_id, profiles[target_id])
        require(Path(manifest["template_dir"]).name == template, f"{target_id}: template nativo incorreto")
        require(manifest["project_data"] == header, f"{target_id}: header de projeto incorreto")
        require(block in manifest, f"{target_id}: bloco de projeto ausente")
        require(len(manifest[block][collection]) >= 6, f"{target_id}: projeto pequeno demais para stress")

    hardware = STRESS.project_manifest(REPO_ROOT, "hardware_contention", profiles["hardware_contention"])
    assets = hardware["asset_pack"]["assets"]
    resources = [asset.get("resources", {}) for asset in assets]
    require(any(item.get("oam_sprites", 0) >= 96 for item in resources), "stress combinado deve pressionar OAM")
    require(any(item.get("bg_tiles", 0) >= 700 for item in resources), "stress combinado deve pressionar VRAM de BG")
    require(any(item.get("pcm_bytes", 0) >= 50000 for item in resources), "stress combinado deve pressionar PCM")
    require(any(asset.get("kind") == "audio" for asset in assets), "stress combinado deve gerar audio real")
    first_room = hardware["topdown_project"]["rooms"][0]
    require(
        any(command.get("op") == "visual_effect" and command.get("effect") == "wave" for command in first_room["on_enter"]),
        "stress combinado deve manter HDMA de HBlank ativo",
    )
    require("audio_heavy.hpp" in hardware["topdown_project"].get("includes", []), "stress combinado deve ligar mixer e PCM")
    print("stress_projects_tests: OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
