#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import platform
import re
import shutil
import sys
from pathlib import Path


VERSION = "gbsdoctor 2.25.0"

KIND_ALIASES = {
    "top_down": "topdown",
    "adventure_topdown": "topdown",
    "platform": "platformer",
    "iso": "isometric",
    "pointAndClick": "point_click",
    "point_and_click": "point_click",
    "point-and-click": "point_click",
    "shootEmUp": "shmup",
    "shoot_em_up": "shmup",
    "shoot-em-up": "shmup",
    "visualNovel": "visual_novel",
    "worldMap": "world_map",
}


def absolute_path(value):
    return Path(value).expanduser().resolve()


def check_path(checks, key, path, required=True, executable=False):
    exists = path.exists()
    ok = exists
    if exists and executable:
        ok = os.access(path, os.X_OK)
    checks.append({
        "key": key,
        "path": str(path),
        "required": required,
        "ok": ok,
        "exists": exists,
        "executable": bool(executable and ok),
    })


def executable_names(name):
    if name.endswith(".exe"):
        return [name]
    names = [name, f"{name}.exe"]
    if os.name == "nt":
        names.reverse()
    return names


def check_executable_candidates(checks, key, directory, name, required=True):
    candidates = [directory / candidate for candidate in executable_names(name)]
    selected = None
    for candidate in candidates:
        if candidate.exists() and os.access(candidate, os.X_OK):
            selected = candidate
            break

    checks.append({
        "key": key,
        "path": str(selected) if selected else str(candidates[0]),
        "candidates": [str(candidate) for candidate in candidates],
        "required": required,
        "ok": selected is not None,
        "exists": selected is not None,
        "executable": selected is not None,
    })


def check_command(checks, key, command, required=True):
    candidates = executable_names(command)
    resolved = None
    for candidate in candidates:
        resolved = shutil.which(candidate)
        if resolved:
            break
    checks.append({
        "key": key,
        "command": command,
        "candidates": candidates,
        "required": required,
        "ok": resolved is not None,
        "path": resolved,
    })


def append_check(checks, key, ok, required=True, path=None, message=None, value=None):
    check = {
        "key": key,
        "required": required,
        "ok": ok,
    }
    if path is not None:
        check["path"] = str(path)
    if message is not None:
        check["message"] = message
    if value is not None:
        check["value"] = value
    checks.append(check)


def parse_version_tuple(value):
    if not isinstance(value, str):
        return None
    parts = value.strip().split(".")
    if not parts:
        return None
    parsed = []
    for part in parts:
        digits = ""
        for character in part:
            if not character.isdigit():
                break
            digits += character
        if digits == "":
            return None
        parsed.append(int(digits))
    while len(parsed) < 3:
        parsed.append(0)
    return tuple(parsed[:3])


def version_satisfies(actual, requirement):
    if not isinstance(requirement, str) or not requirement:
        return False
    actual_tuple = parse_version_tuple(actual)
    if actual_tuple is None:
        return False
    requirement = requirement.strip()
    if requirement.startswith(">="):
        required_tuple = parse_version_tuple(requirement[2:].strip())
        return required_tuple is not None and actual_tuple >= required_tuple
    return actual == requirement


def capability_features(engine_manifest):
    features = set()
    if not isinstance(engine_manifest, dict):
        return features
    capabilities = engine_manifest.get("capabilities", {})
    if not isinstance(capabilities, dict):
        return features

    for key, value in capabilities.items():
        features.add(key)
        if isinstance(value, bool):
            continue
        if isinstance(value, str):
            features.add(value)
            features.add(f"{key}.{value}")
            continue
        if isinstance(value, list):
            for item in value:
                if isinstance(item, str):
                    features.add(item)
                    features.add(f"{key}.{item}")
    return features


def capability_status(engine_manifest, required_features):
    supported_features = capability_features(engine_manifest)
    items = []
    for feature in required_features:
        items.append({
            "feature": feature,
            "ok": feature in supported_features,
        })
    return {
        "ok": all(item["ok"] for item in items),
        "features": items,
        "missing": [item["feature"] for item in items if not item["ok"]],
    }


def engine_manifest_summary(engine_manifest):
    if not isinstance(engine_manifest, dict):
        return {
            "ok": False,
            "schema": None,
            "name": None,
            "version": None,
            "capability_groups": [],
            "capabilities": [],
            "capability_count": 0,
            "tools": {},
            "schemas": {},
            "templates": {},
            "sdk": {},
            "sdk_templates": [],
        }
    capabilities = engine_manifest.get("capabilities", {})
    capability_groups = sorted(capabilities.keys()) if isinstance(capabilities, dict) else []
    flattened = sorted(capability_features(engine_manifest))
    tools = engine_manifest.get("tools", {})
    schemas = engine_manifest.get("schemas", {})
    templates = engine_manifest.get("templates", {})
    sdk = engine_manifest.get("sdk", {})
    sdk_templates = []
    if isinstance(sdk, dict):
        raw_templates = sdk.get("templates", [])
        if isinstance(raw_templates, list):
            for template in raw_templates:
                if isinstance(template, dict):
                    sdk_templates.append(template)
    return {
        "ok": True,
        "schema": engine_manifest.get("schema"),
        "name": engine_manifest.get("name"),
        "version": engine_manifest.get("version"),
        "capability_groups": capability_groups,
        "capabilities": flattened,
        "capability_count": len(flattened),
        "tools": tools if isinstance(tools, dict) else {},
        "schemas": schemas if isinstance(schemas, dict) else {},
        "templates": templates if isinstance(templates, dict) else {},
        "sdk": sdk if isinstance(sdk, dict) else {},
        "sdk_templates": sdk_templates,
    }


def supported_project_kinds(engine_manifest):
    kinds = set()
    if not isinstance(engine_manifest, dict):
        return kinds
    sdk = engine_manifest.get("sdk", {})
    if not isinstance(sdk, dict):
        return kinds
    templates = sdk.get("templates", [])
    if not isinstance(templates, list):
        return kinds
    for template in templates:
        if not isinstance(template, dict):
            continue
        genre = template.get("genre")
        if isinstance(genre, str) and genre:
            kinds.add(genre)
    export_kinds = sdk.get("export_kinds", [])
    if isinstance(export_kinds, list):
        kinds.update(kind for kind in export_kinds if isinstance(kind, str) and kind)
    return kinds


def normalize_project_kind(value):
    if not isinstance(value, str) or not value:
        return None
    return KIND_ALIASES.get(value, value)


def template_path_status(engine_pack, template, key):
    value = template.get(key)
    path = engine_pack / value if isinstance(value, str) else None
    return {
        "path": str(path) if path is not None else None,
        "ok": path is not None and path.exists(),
    }


def template_requirement_diagnostics(template):
    required = template.get("requires")
    if not isinstance(required, list):
        return [], ["requires deve ser uma lista nao vazia de strings"]
    if not required:
        return [], ["requires deve declarar ao menos uma feature"]

    errors = []
    features = []
    for index, feature in enumerate(required):
        if not isinstance(feature, str) or not feature.strip():
            errors.append(f"requires[{index}] deve ser uma string nao vazia")
            continue
        features.append(feature)
    if len(features) != len(set(features)):
        errors.append("requires nao pode conter features duplicadas")
    return features, errors


def sdk_template_diagnostics(engine_pack, engine_manifest):
    diagnostics = []
    if not isinstance(engine_manifest, dict):
        return diagnostics
    sdk = engine_manifest.get("sdk", {})
    if not isinstance(sdk, dict):
        return diagnostics
    templates = sdk.get("templates", [])
    if not isinstance(templates, list):
        return diagnostics

    for template in templates:
        if not isinstance(template, dict):
            continue
        required, requirement_errors = template_requirement_diagnostics(template)
        entry = template_path_status(engine_pack, template, "entry")
        project_data = template_path_status(engine_pack, template, "project_data")
        requirements = capability_status(engine_manifest, [feature for feature in required if isinstance(feature, str)])
        requirements_ok = not requirement_errors
        diagnostics.append({
            "id": template.get("id"),
            "name": template.get("name"),
            "genre": template.get("genre"),
            "entry": entry,
            "project_data": project_data,
            "supports_export_fixture": bool(template.get("supports_export_fixture")),
            "required_feature_count": len(requirements["features"]),
            "missing_required_features": requirements["missing"],
            "requirements_ok": requirements_ok,
            "requirement_errors": requirement_errors,
            "ok": entry["ok"] and project_data["ok"] and requirements_ok and requirements["ok"],
        })
    return diagnostics


def genre_diagnostics(template_diagnostics):
    genres = {}
    for template in template_diagnostics:
        genre = template.get("genre") or "unknown"
        entry = genres.setdefault(genre, {
            "genre": genre,
            "ok": True,
            "template_ids": [],
            "missing_required_features": [],
            "template_count": 0,
        })
        entry["template_count"] += 1
        entry["template_ids"].append(template.get("id"))
        entry["ok"] = entry["ok"] and bool(template.get("ok"))
        entry["missing_required_features"].extend(template.get("missing_required_features", []))
    for entry in genres.values():
        entry["missing_required_features"] = sorted(set(entry["missing_required_features"]))
    return [genres[key] for key in sorted(genres.keys())]


def domain_diagnostic(engine_manifest, name, required_features, summary):
    status = capability_status(engine_manifest, required_features)
    return {
        "name": name,
        "ok": status["ok"],
        "summary": summary,
        "required_features": status["features"],
        "missing": status["missing"],
    }


def build_capability_diagnostics(engine_manifest):
    return {
        "asset_banking": domain_diagnostic(
            engine_manifest,
            "asset_banking",
            [
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
                "assetc_production_profile_report",
                "assetc_template_pressure_limits",
                "assetc_ui_action_plan",
                "asset_export_resource_bank_upload_sources",
                "template_room_resource_bank_group_upload_streaming",
            ],
            "Reserva, grupos, upload por DMA de VBlank e diagnostico de streaming de recursos.",
        ),
        "render_cost": domain_diagnostic(
            engine_manifest,
            "render_cost",
            [
                "render_asset_cost_diagnostics",
                "render_runtime.render_asset_cost_diagnostics",
                "template_production_cost_smoke",
            ],
            "Estimativa publica de custo de render antes de carregar VRAM/OAM.",
        ),
        "audio_cost": domain_diagnostic(
            engine_manifest,
            "audio_cost",
            [
                "audio_mix_cost_diagnostics",
                "audio.audio_mix_cost_diagnostics",
                "template_production_cost_smoke",
            ],
            "Estimativa publica de custo de audio antes de iniciar playback/mixer.",
        ),
    }


def check_lookup(checks):
    lookup = {}
    for check in checks:
        lookup.setdefault(check.get("key"), []).append(check)
    return lookup


def first_check(checks_by_key, key):
    values = checks_by_key.get(key, [])
    return values[0] if values else None


def build_toolchain_diagnostics(checks, skipped):
    checks_by_key = check_lookup(checks)
    keys = ["make", "devkitpro", "devkitarm", "gbafix", "arm_gcc", "arm_gxx", "arm_objcopy"]
    items = []
    for key in keys:
        check = first_check(checks_by_key, key)
        if check is not None:
            items.append({
                "key": key,
                "ok": bool(check.get("ok")),
                "path": check.get("path"),
                "command": check.get("command"),
                "message": check.get("message"),
            })
    return {
        "ok": skipped or all(item["ok"] for item in items),
        "skipped": skipped,
        "checks": items,
    }


def build_project_summary(project_dir, manifest):
    if not isinstance(manifest, dict):
        return None
    requires = manifest.get("requires") if isinstance(manifest.get("requires"), dict) else {}
    return {
        "project_dir": str(project_dir),
        "backend": manifest.get("backend"),
        "kind": manifest.get("kind"),
        "entry": manifest.get("entry"),
        "project_data": manifest.get("project_data"),
        "generated_asset_count": len(manifest.get("generated_assets", [])) if isinstance(manifest.get("generated_assets", []), list) else None,
        "required_engine_pack": requires.get("engine_pack") if isinstance(requires, dict) else None,
        "required_features": requires.get("features", []) if isinstance(requires, dict) and isinstance(requires.get("features", []), list) else [],
    }


def actionable_message_for_check(check):
    key = check.get("key")
    path = check.get("path")
    value = check.get("value")
    actions = {
        "engine_pack": "Selecione um diretorio valido do GBAStudioEnginePack.",
        "manifest": "Regenere ou reinstale o Engine Pack; enginepack.json esta ausente.",
        "manifest_json": "Corrija o JSON do enginepack.json antes de continuar.",
        "version": "Regenere o pacote para incluir VERSION.",
        "engine_lib": "Rode make package/verify-package para gerar libgbastudio_engine.a.",
        "assetc": "Garanta que tools/assetc exista e esteja executavel no Engine Pack.",
        "gbsbuild": "Garanta que tools/gbsbuild exista e esteja executavel no Engine Pack.",
        "gbsdoctor": "Garanta que tools/gbsdoctor exista e esteja executavel no Engine Pack.",
        "smoke_mgba": "Garanta que tools/smoke_mgba exista e esteja executavel no Engine Pack.",
        "production_smoke": "Garanta que tools/production_smoke exista e esteja executavel no Engine Pack.",
        "stress_projects": "Garanta que tools/stress_projects exista e esteja executavel no Engine Pack.",
        "verify_cross_platform": "Garanta que tools/verify_cross_platform exista e esteja executavel no Engine Pack.",
        "make": "Instale make ou configure a variavel MAKE para o executavel correto.",
        "devkitpro": "Configure DEVKITPRO ou passe --devkitpro apontando para a instalacao devkitPro.",
        "devkitarm": "Configure DEVKITARM ou instale devkitARM dentro de DEVKITPRO.",
        "gbafix": "Instale as ferramentas devkitPro para obter gbafix.",
        "arm_gcc": "Instale devkitARM ou corrija DEVKITARM/bin.",
        "arm_gxx": "Instale devkitARM ou corrija DEVKITARM/bin.",
        "arm_objcopy": "Instale devkitARM ou corrija DEVKITARM/bin.",
        "project_manifest_backend": "Exporte gbastudio_project.json com backend igual a gbastudio_engine.",
        "project_manifest_kind": "Escolha um genero publicado em engine_manifest.sdk_templates.",
        "project_manifest_entry": "Gere o arquivo main.cpp apontado pelo manifesto.",
        "project_manifest_project_data": "Gere o header de project_data apontado pelo manifesto.",
        "project_manifest_generated_assets": "Use uma lista de paths relativos em generated_assets.",
        "project_generated_asset": "Gere ou corrija o asset declarado em generated_assets.",
        "project_required_engine_pack": "Atualize o Engine Pack ou reduza requires.engine_pack no manifesto.",
        "project_required_features": "Use uma lista de strings em requires.features.",
        "project_required_feature": "Atualize o Engine Pack ou remova a feature ausente do manifesto.",
        "project_build_target": "Use target com letras, numeros, _ ou -, iniciando por letra ou _.",
        "project_build_make_target": "Use make_target all ou clean.",
        "readiness_evidence": "Informe um arquivo JSON existente com evidencias de promocao ou remova --readiness-evidence.",
        "readiness_evidence_json": "Corrija o JSON de evidencias antes de usar esse relatorio para promocao.",
        "readiness_evidence_gate": "Informe os gates obrigatorios manual_mgba_stress_smoke, hardware_or_ci_validation e gba_studio_engine_primary_rollout.",
        "readiness_evidence_gate_shape": "Cada gate de evidencia deve ser booleano ou objeto com campo ok booleano.",
        "readiness_evidence_gate_provenance": "Para gates ok=true, informe evidence_type, source e checked_at compativeis com o gate.",
        "readiness_evidence_extra_gate": "Remova gates desconhecidos do arquivo de evidencia de promocao.",
        "readiness_report_schema": "Regenere o Engine Pack para incluir o schema publico do artefato de readiness report.",
        "asset_pack_report_schema": "Regenere o Engine Pack para incluir o schema publico do asset pack report.",
        "promotion_bundle_schema": "Regenere o Engine Pack para incluir o schema publico do promotion bundle.",
        "promotion_bundle_validation_schema": "Regenere o Engine Pack para incluir o schema publico do resultado de validacao do promotion bundle.",
        "promotion_summary_schema": "Regenere o Engine Pack para incluir o schema publico do resumo de promocao.",
    }
    message = check.get("message")
    if not message:
        message = f"Falha no check {key}"
    details = []
    if value is not None:
        details.append(f"valor={value}")
    if path:
        details.append(f"path={path}")
    if details:
        message = f"{message} ({', '.join(details)})"
    return {
        "severity": "error" if check.get("required", True) else "warning",
        "code": f"GBS_DOCTOR_{str(key).upper()}",
        "check": key,
        "message": message,
        "action": actions.get(key, "Revise o check indicado e regenere o projeto/export se necessario."),
    }


def build_actionable_messages(checks, template_diagnostics, capability_diagnostics):
    messages = [actionable_message_for_check(check) for check in checks if not check.get("ok") and check.get("required", True)]
    for template in template_diagnostics:
        if template.get("ok"):
            continue
        if template.get("missing_required_features"):
            messages.append({
                "severity": "error",
                "code": "GBS_DOCTOR_TEMPLATE_REQUIRED_FEATURE",
                "check": "sdk_template",
                "message": f"Template {template.get('id')} exige features ausentes: {', '.join(template.get('missing_required_features', []))}",
                "action": "Atualize enginepack.json/capabilities ou ajuste o template antes de exportar esse genero.",
            })
        if template.get("requirement_errors"):
            messages.append({
                "severity": "error",
                "code": "GBS_DOCTOR_TEMPLATE_REQUIREMENTS",
                "check": "sdk_template",
                "message": f"Template {template.get('id')} possui requisitos invalidos: {'; '.join(template.get('requirement_errors', []))}",
                "action": "Declare em requires uma lista nao vazia de features unicas e publicadas no Engine Pack.",
            })
        if not template.get("entry", {}).get("ok") or not template.get("project_data", {}).get("ok"):
            messages.append({
                "severity": "error",
                "code": "GBS_DOCTOR_TEMPLATE_FILE",
                "check": "sdk_template",
                "message": f"Template {template.get('id')} aponta para arquivo ausente.",
                "action": "Regenere o Engine Pack para incluir todos os arquivos declarados em sdk.templates.",
            })
    for diagnostic in capability_diagnostics.values():
        if diagnostic.get("ok"):
            continue
        messages.append({
            "severity": "error",
            "code": f"GBS_DOCTOR_{diagnostic.get('name', 'CAPABILITY').upper()}",
            "check": diagnostic.get("name"),
            "message": f"Capacidades ausentes em {diagnostic.get('name')}: {', '.join(diagnostic.get('missing', []))}",
            "action": "Atualize o Engine Pack antes de habilitar esse fluxo no app.",
        })
    return messages


def build_stress_readiness(engine_manifest, checks):
    checks_by_key = check_lookup(checks)
    tool_ok = bool(first_check(checks_by_key, "stress_projects") and first_check(checks_by_key, "stress_projects").get("ok"))
    production_smoke_ok = bool(first_check(checks_by_key, "production_smoke") and first_check(checks_by_key, "production_smoke").get("ok"))
    stress_targets = [
        (
            "topdown_large",
            "topdown",
            [
                "topdown_project_data",
                "room_streaming.multiple_rooms",
                "actors.npc_interaction",
                "events.portal",
                "audio.pcm_sfx",
                "save.topdown_pause_save_load_slots",
                "resource_managers.resource_bank_group_upload_streaming",
            ],
        ),
        (
            "platformer_large",
            "platformer",
            [
                "platformer_runtime.enemies",
                "platformer_runtime.moving_platforms",
                "platformer_runtime.moving_platform_event_scripts",
                "platformer_runtime.slope_floor_snap",
                "platformer_runtime.actor_animation_state",
                "platformer_runtime.enemy_stomp_contact",
                "platformer_runtime.enemy_tile_patrol",
                "platformer_runtime.moving_platform_landing_snap",
                "platformer_runtime.hazard_regions",
                "platformer_runtime.checkpoint_respawn",
                "collision.diagonal_slope_tiles",
                "resource_managers.resource_bank_group_upload_streaming",
            ],
        ),
        (
            "isometric_large",
            "isometric",
            [
                "isometric_runtime.iso_bfs_path_step",
                "isometric_runtime.iso_astar_path_step",
                "isometric_runtime.iso_diamond_picking",
                "isometric_runtime.iso_actor_blockers",
                "isometric_runtime.tile_event_scripts",
                "isometric_runtime.tile_event_areas",
                "isometric_runtime.cursor_selection",
                "isometric_runtime.cursor_actor_interaction",
                "isometric_runtime.actor_command_apply",
                "isometric_runtime.room_cursor_start",
                "render_runtime.obj_priority",
                "resource_managers.resource_bank_group_upload_streaming",
            ],
        ),
        (
            "sprites_oam_heavy",
            "resource",
            [
                "resource_managers.static_oam_sprites",
                "resource_managers.resource_pool_usage_report",
                "resource_managers.resource_bank_cache_priority_eviction",
                "resource_managers.resource_free_block_count",
                "resource_managers.resource_next_range_preview",
                "resource_managers.resource_bank_group_preview",
                "dma.vblank_dma_queue",
            ],
        ),
        (
            "tilesets_vram_heavy",
            "resource",
            [
                "resource_managers.static_bg_tiles",
                "resource_managers.static_obj_tiles",
                "resource_managers.resource_largest_free_block",
                "resource_managers.resource_free_block_count",
                "resource_managers.resource_next_range_preview",
                "resource_managers.resource_bank_group_preview",
                "resource_managers.assetc_bank_usage_report",
                "resource_managers.assetc_group_pressure_report",
            ],
        ),
        (
            "audio_heavy",
            "audio",
            [
                "audio.psg_square_sfx",
                "audio.direct_sound_pcm8",
                "audio.pcm_mixer_4_sfx",
                "audio.tracker_asset",
                "audio.audio_mix_cost_diagnostics",
            ],
        ),
    ]
    items = []
    for target, genre, required in stress_targets:
        status = capability_status(engine_manifest, required)
        items.append({
            "target": target,
            "genre": genre,
            "ok": tool_ok and production_smoke_ok and status["ok"],
            "stress_projects_cli": tool_ok,
            "production_smoke_cli": production_smoke_ok,
            "missing": status["missing"],
            "required_features": status["features"],
        })
    return {
        "ok": all(item["ok"] for item in items),
        "tool_ok": tool_ok,
        "production_smoke_ok": production_smoke_ok,
        "items": items,
    }


def build_resource_pool_readiness(engine_manifest):
    pool_requirements = [
        (
            "bg_tiles",
            [
                "resource_pool_usage_report",
                "resource_largest_free_block",
                "resource_free_block_count",
                "assetc_fragmentation_report",
                "assetc_pool_reports",
                "assetc_room_pressure_report",
                "assetc_split_recommendations",
                "assetc_compression_candidates",
                "assetc_production_profile_report",
                "assetc_template_pressure_limits",
                "assetc_ui_action_plan",
            ],
        ),
        (
            "obj_tiles",
            [
                "resource_pool_usage_report",
                "resource_largest_free_block",
                "resource_free_block_count",
                "assetc_pool_reports",
                "assetc_group_pressure_report",
                "assetc_split_recommendations",
                "assetc_production_profile_report",
                "assetc_ui_action_plan",
            ],
        ),
        (
            "palette_colors",
            [
                "resource_pool_usage_report",
                "resource_largest_free_block",
                "resource_free_block_count",
                "assetc_pool_reports",
                "assetc_compression_candidates",
                "assetc_production_profile_report",
                "assetc_ui_action_plan",
            ],
        ),
        (
            "oam_sprites",
            [
                "resource_pool_usage_report",
                "resource_largest_free_block",
                "resource_free_block_count",
                "assetc_pool_reports",
                "assetc_group_pressure_report",
                "assetc_production_profile_report",
                "assetc_ui_action_plan",
            ],
        ),
        (
            "pcm_bytes",
            [
                "assetc_pool_reports",
                "assetc_compression_candidates",
                "assetc_optional_asset_fallback",
                "assetc_production_profile_report",
                "assetc_ui_action_plan",
            ],
        ),
    ]
    items = []
    for pool, required in pool_requirements:
        status = capability_status(engine_manifest, required)
        actionable_fields = [
            f"pool_reports.{pool}",
            "fragmentation_report",
            "overflow_report",
            "split_recommendations",
            "compression_candidates",
            "production_profile.pressure_gates",
            "production_profile.ui_actions",
        ]
        items.append({
            "pool": pool,
            "ok": status["ok"],
            "missing": status["missing"],
            "required_features": status["features"],
            "actionable_report_fields": actionable_fields,
        })
    next_actions = []
    for item in items:
        if item["ok"]:
            continue
        next_actions.append({
            "id": f"resource_pool_{item['pool']}",
            "message": f"Completar diagnosticos acionaveis para o pool {item['pool']}.",
            "missing": item["missing"],
        })
    return {
        "ok": all(item["ok"] for item in items),
        "items": items,
        "next_actions": next_actions,
    }


def readiness_gate_provenance_error(gate_id, raw_gate):
    if isinstance(raw_gate, bool):
        return None if raw_gate is False else "gate ok=true exige objeto com evidence_type, source e checked_at"
    if not isinstance(raw_gate, dict) or raw_gate.get("ok") is not True:
        return None
    evidence_type = raw_gate.get("evidence_type")
    if not isinstance(evidence_type, str) or not evidence_type:
        return "evidence_type obrigatorio para gate ok=true"
    if evidence_type not in READINESS_EVIDENCE_GATE_TYPES.get(gate_id, ()):
        return f"evidence_type {evidence_type} incompatível com gate {gate_id}"
    for key in ("source", "checked_at"):
        if not isinstance(raw_gate.get(key), str) or not raw_gate.get(key):
            return f"{key} obrigatorio para gate ok=true"
    if gate_id == "manual_mgba_stress_smoke":
        review_environment = str(raw_gate.get("review_environment") or "").strip()
        if not review_environment:
            return "review_environment obrigatorio para gate ok=true"
        if any(marker in review_environment.lower() for marker in ("todo", "placeholder", "unknown", "pending", "pendente", "desconhecido")):
            return "review_environment deve identificar o emulador ou suite real"
    if evidence_type in ("cross_platform_ci", "local_cross_platform_dry_run"):
        platforms = raw_gate.get("validated_platforms")
        if not isinstance(platforms, list) or not all(isinstance(item, str) and item for item in platforms):
            return f"validated_platforms obrigatorio para evidence_type {evidence_type}"
    if gate_id == "hardware_or_ci_validation" and evidence_type == "cross_platform_ci":
        provenance_text = " ".join(
            str(raw_gate.get(key) or "").lower()
            for key in ("source", "message")
        )
        simulated_markers = (
            "local simulation",
            "local_cross_platform_dry_run",
            "local cross-platform dry-run",
            "ci-local",
            "dry-run local",
            "multiple cross-platform ci inputs",
        )
        if any(marker in provenance_text for marker in simulated_markers):
            return "cross_platform_ci exige evidencia real de CI/hardware, nao simulacao local"
    return None


def readiness_gate_primary_error(gate_id, raw_gate):
    provenance_error = readiness_gate_provenance_error(gate_id, raw_gate)
    if provenance_error is not None:
        return provenance_error
    if not isinstance(raw_gate, dict) or raw_gate.get("ok") is not True:
        return None
    evidence_type = raw_gate.get("evidence_type")
    if evidence_type == "cross_platform_ci":
        platforms = raw_gate.get("validated_platforms", [])
        missing = sorted(READINESS_EVIDENCE_REQUIRED_PLATFORMS - set(platforms))
        if missing:
            return "cross_platform_ci exige validated_platforms com macos, windows e linux"
    if evidence_type == "local_cross_platform_dry_run":
        return "dry-run local nao libera promocao principal; rode hardware_real ou cross_platform_ci completo"
    return None


def readiness_gate_from_evidence(evidence, gate_id, message):
    raw_gate = evidence.get(gate_id) if isinstance(evidence, dict) else None
    if isinstance(raw_gate, dict):
        evidence_ok = bool(raw_gate.get("ok"))
        primary_error = readiness_gate_primary_error(gate_id, raw_gate)
        return {
            "id": gate_id,
            "ok": evidence_ok and primary_error is None,
            "evidence_ok": evidence_ok,
            "message": primary_error or (raw_gate.get("message") if isinstance(raw_gate.get("message"), str) else message),
            "source": raw_gate.get("source") if isinstance(raw_gate.get("source"), str) else None,
            "checked_at": raw_gate.get("checked_at") if isinstance(raw_gate.get("checked_at"), str) else None,
            "evidence_type": raw_gate.get("evidence_type") if isinstance(raw_gate.get("evidence_type"), str) else None,
            "validated_platforms": raw_gate.get("validated_platforms") if isinstance(raw_gate.get("validated_platforms"), list) else [],
        }
    if isinstance(raw_gate, bool):
        primary_error = readiness_gate_primary_error(gate_id, raw_gate)
        return {
            "id": gate_id,
            "ok": raw_gate and primary_error is None,
            "evidence_ok": raw_gate,
            "message": primary_error or message,
            "source": None,
            "checked_at": None,
            "evidence_type": None,
            "validated_platforms": [],
        }
    return {
        "id": gate_id,
        "ok": False,
        "evidence_ok": False,
        "message": message,
        "source": None,
        "checked_at": None,
        "evidence_type": None,
        "validated_platforms": [],
    }


def build_butano_replacement_readiness(template_diagnostics, capability_diagnostics, stress_readiness, toolchain_diagnostics, actionable_messages, readiness_evidence):
    required_genres = [
        "topdown",
        "platformer",
        "isometric",
        "point_click",
        "shmup",
        "visual_novel",
        "menu",
        "cutscene",
        "world_map",
    ]
    template_by_genre = {}
    for template in template_diagnostics:
        genre = template.get("genre")
        if isinstance(genre, str) and genre:
            template_by_genre.setdefault(genre, []).append(template)

    genre_items = []
    for genre in required_genres:
        templates = template_by_genre.get(genre, [])
        genre_items.append({
            "genre": genre,
            "ok": bool(templates) and all(bool(template.get("ok")) for template in templates),
            "template_ids": [template.get("id") for template in templates],
            "missing_required_features": sorted({
                feature
                for template in templates
                for feature in template.get("missing_required_features", [])
            }),
        })

    capability_items = [
        capability_diagnostics["asset_banking"],
        capability_diagnostics["render_cost"],
        capability_diagnostics["audio_cost"],
    ]
    automated_ok = (
        all(item["ok"] for item in genre_items)
        and all(item.get("ok") for item in capability_items)
        and bool(stress_readiness.get("ok"))
        and bool(toolchain_diagnostics.get("ok"))
        and not actionable_messages
    )
    manual_primary_gates = [
        readiness_gate_from_evidence(
            readiness_evidence,
            "manual_mgba_stress_smoke",
            "Abrir ROMs stress no mGBA e registrar comportamento visual/audio por genero.",
        ),
        readiness_gate_from_evidence(
            readiness_evidence,
            "hardware_or_ci_validation",
            "Validar em hardware real ou CI cross-platform antes de tornar backend principal.",
        ),
        readiness_gate_from_evidence(
            readiness_evidence,
            "gba_studio_engine_primary_rollout",
            "Validar gbastudio_engine no GBA Studio como backend primario privado, com Butano apenas como rollback legado.",
        ),
    ]
    primary_ready = automated_ok and all(gate["ok"] for gate in manual_primary_gates)
    stage = "primary_ready" if primary_ready else ("beta_candidate" if automated_ok else "blocked")

    blockers = []
    for item in genre_items:
        if not item["ok"]:
            blockers.append({
                "id": f"genre_{item['genre']}",
                "message": f"Genero {item['genre']} ainda nao tem template/capabilities completos.",
                "missing": item["missing_required_features"],
            })
    for item in capability_items:
        if not item.get("ok"):
            blockers.append({
                "id": item.get("name"),
                "message": f"Dominio {item.get('name')} ainda tem capacidades ausentes.",
                "missing": item.get("missing", []),
            })
    if not stress_readiness.get("ok"):
        blockers.append({
            "id": "stress_readiness",
            "message": "Stress projects ainda nao estao prontos em todos os alvos.",
            "missing": [
                item.get("target")
                for item in stress_readiness.get("items", [])
                if not item.get("ok")
            ],
        })
    if not toolchain_diagnostics.get("ok"):
        blockers.append({
            "id": "toolchain",
            "message": "Toolchain local/cross-platform ainda nao esta pronta.",
            "missing": [
                item.get("key")
                for item in toolchain_diagnostics.get("checks", [])
                if not item.get("ok")
            ],
        })
    for message in actionable_messages:
        blockers.append({
            "id": message.get("code"),
            "message": message.get("message"),
            "missing": [],
        })
    for gate in manual_primary_gates:
        if not gate.get("ok"):
            blockers.append({
                "id": gate.get("id"),
                "message": gate.get("message"),
                "missing": [],
            })

    missing_manual_gates = [gate["id"] for gate in manual_primary_gates if not gate.get("ok")]
    next_actions = []
    if not automated_ok:
        next_actions.extend([
            {
                "id": "verify_package",
                "command": "make verify-package",
                "message": "Validar Engine Pack, templates e builds externos antes da promocao.",
            },
            {
                "id": "verify_production_smoke",
                "command": "make verify-production-smoke",
                "message": "Validar smokes production para todos os generos exportaveis.",
            },
            {
                "id": "verify_stress",
                "command": "make verify-stress",
                "message": "Validar projetos stress e relatorios de asset/VRAM/audio.",
            },
        ])
    for gate in manual_primary_gates:
        if gate.get("ok"):
            continue
        next_actions.append({
            "id": f"update_{gate['id']}",
            "command": (
                "gbsdoctor --update-readiness-evidence readiness_evidence.json "
                f"--readiness-gate {gate['id']} --readiness-gate-ok true "
                "--readiness-gate-evidence-type <evidence-type> "
                "--readiness-gate-source <evidence-source> "
                "--readiness-gate-checked-at <timestamp> "
                "--readiness-gate-review-environment <emulator-or-suite> --json"
            ),
            "message": gate.get("message"),
        })

    return {
        "ok": automated_ok,
        "ready_for_primary_backend": primary_ready,
        "stage": stage,
        "backend_policy": "parallel_until_manual_promotion",
        "required_before_primary_backend": [
            "make test",
            "make verify-package",
            "make verify-production-smoke",
            "make verify-stress",
            "manual mGBA smoke for stress ROMs",
            "hardware real or CI validation",
            "GBA Studio private engine-primary rollout with Butano only as legacy rollback",
        ],
        "genres": genre_items,
        "capabilities": capability_items,
        "stress_readiness": stress_readiness,
        "manual_primary_gates": manual_primary_gates,
        "missing_manual_gates": missing_manual_gates,
        "next_actions": next_actions,
        "evidence_supplied": isinstance(readiness_evidence, dict) and bool(readiness_evidence),
        "blockers": blockers,
    }


def is_valid_build_target(value):
    if not isinstance(value, str) or not value:
        return False
    first = value[0]
    if not (first.isalpha() or first == "_"):
        return False
    for character in value:
        if not (character.isalnum() or character in ("_", "-")):
            return False
    return True


def check_project_build_config(checks, manifest, manifest_path):
    build_config = manifest.get("build")
    if build_config is None:
        return
    build_is_object = isinstance(build_config, dict)
    append_check(checks, "project_manifest_build", build_is_object, path=manifest_path)
    if not build_is_object:
        return

    target = build_config.get("target")
    if target is not None:
        append_check(
            checks,
            "project_build_target",
            is_valid_build_target(target),
            path=manifest_path,
            message=None if is_valid_build_target(target) else "target de build invalido",
            value=target,
        )

    make_target = build_config.get("make_target")
    if make_target is not None:
        make_target_ok = make_target in ("all", "clean")
        append_check(
            checks,
            "project_build_make_target",
            make_target_ok,
            path=manifest_path,
            message=None if make_target_ok else "make_target de build invalido",
            value=make_target,
        )


def check_project_requirements(checks, manifest, manifest_path, engine_manifest):
    requires = manifest.get("requires")
    if requires is None:
        return
    requires_is_object = isinstance(requires, dict)
    append_check(checks, "project_requires", requires_is_object, path=manifest_path)
    if not requires_is_object:
        return

    engine_requirement = requires.get("engine_pack")
    if engine_requirement is not None:
        engine_version = engine_manifest.get("version") if isinstance(engine_manifest, dict) else None
        append_check(
            checks,
            "project_required_engine_pack",
            version_satisfies(engine_version, engine_requirement),
            path=manifest_path,
            message=f"engine_pack {engine_requirement}",
            value=engine_version,
        )

    required_features = requires.get("features", [])
    features_are_list = isinstance(required_features, list)
    append_check(checks, "project_required_features", features_are_list, path=manifest_path)
    if not features_are_list:
        return

    supported_features = capability_features(engine_manifest)
    for feature in required_features:
        feature_ok = isinstance(feature, str) and feature in supported_features
        append_check(
            checks,
            "project_required_feature",
            feature_ok,
            path=manifest_path,
            message=None if feature_ok else "feature nao suportada pelo Engine Pack",
            value=feature,
        )


def load_json_file(path):
    try:
        with path.open("r", encoding="utf-8") as json_file:
            return json.load(json_file), None
    except (OSError, json.JSONDecodeError) as error:
        return None, str(error)


def check_project_manifest(checks, project_dir, manifest_path, engine_manifest):
    try:
        with manifest_path.open("r", encoding="utf-8") as manifest_file:
            manifest = json.load(manifest_file)
    except (OSError, json.JSONDecodeError) as error:
        append_check(checks, "project_manifest_json", False, path=manifest_path, message=str(error))
        return None

    is_object = isinstance(manifest, dict)
    append_check(checks, "project_manifest_json", is_object, path=manifest_path)
    if not is_object:
        return None

    backend = manifest.get("backend")
    append_check(
        checks,
        "project_manifest_backend",
        backend == "gbastudio_engine",
        path=manifest_path,
        value=backend,
    )

    kind = manifest.get("kind")
    if kind is not None:
        supported_kinds = supported_project_kinds(engine_manifest)
        normalized_kind = normalize_project_kind(kind)
        kind_ok = normalized_kind in supported_kinds
        append_check(
            checks,
            "project_manifest_kind",
            kind_ok,
            path=manifest_path,
            message=None if kind_ok else "genero de projeto nao suportado pelo Engine Pack",
            value=kind,
        )

    entry = manifest.get("entry")
    entry_ok = isinstance(entry, str) and bool(entry) and (project_dir / entry).exists()
    append_check(checks, "project_manifest_entry", entry_ok, path=(project_dir / entry) if isinstance(entry, str) else manifest_path, value=entry)

    project_data = manifest.get("project_data")
    project_data_ok = isinstance(project_data, str) and bool(project_data) and (project_dir / project_data).exists()
    append_check(
        checks,
        "project_manifest_project_data",
        project_data_ok,
        path=(project_dir / project_data) if isinstance(project_data, str) else manifest_path,
        value=project_data,
    )

    generated_assets = manifest.get("generated_assets", [])
    assets_are_list = isinstance(generated_assets, list)
    append_check(checks, "project_manifest_generated_assets", assets_are_list, path=manifest_path)
    if not assets_are_list:
        return manifest

    for asset in generated_assets:
        asset_ok = isinstance(asset, str) and bool(asset) and (project_dir / asset).exists()
        append_check(
            checks,
            "project_generated_asset",
            asset_ok,
            path=(project_dir / asset) if isinstance(asset, str) else manifest_path,
            value=asset,
        )

    check_project_build_config(checks, manifest, manifest_path)
    check_project_requirements(checks, manifest, manifest_path, engine_manifest)
    capability_manifest = manifest.get("capability_manifest")
    if capability_manifest is None:
        append_check(
            checks,
            "project_capability_manifest",
            True,
            path=manifest_path,
            required=False,
            message="manifesto legado sem capability_manifest; novas exportacoes devem inclui-lo",
        )
    else:
        supported_features = capability_features(engine_manifest)
        capability_errors = validate_scene_capability_manifest(capability_manifest, supported_features)
        append_check(
            checks,
            "project_capability_manifest",
            not capability_errors,
            path=manifest_path,
            message="; ".join(error["message"] for error in capability_errors) if capability_errors else None,
            value={"error_count": len(capability_errors)},
        )
    return manifest


READINESS_EVIDENCE_GATES = (
    "manual_mgba_stress_smoke",
    "hardware_or_ci_validation",
    "gba_studio_engine_primary_rollout",
)

READINESS_EVIDENCE_GATE_TYPES = {
    "manual_mgba_stress_smoke": ("manual_mgba_stress_smoke",),
    "hardware_or_ci_validation": ("hardware_real", "cross_platform_ci", "local_cross_platform_dry_run"),
    "gba_studio_engine_primary_rollout": ("gba_studio_engine_primary_rollout",),
}

READINESS_EVIDENCE_REQUIRED_PLATFORMS = {"macos", "windows", "linux"}


def is_valid_readiness_gate(value):
    if isinstance(value, bool):
        return True
    if not isinstance(value, dict):
        return False
    if not isinstance(value.get("ok"), bool):
        return False
    for key in ("source", "checked_at", "message", "evidence_type", "review_environment"):
        if key in value and not isinstance(value.get(key), str):
            return False
        if key in value and value.get(key) == "":
            return False
    if "validated_platforms" in value:
        platforms = value.get("validated_platforms")
        if not isinstance(platforms, list):
            return False
        if not all(isinstance(item, str) and item for item in platforms):
            return False
    return True


def check_readiness_evidence(checks, evidence, evidence_path):
    if not isinstance(evidence, dict):
        return
    for gate in READINESS_EVIDENCE_GATES:
        append_check(
            checks,
            "readiness_evidence_gate",
            gate in evidence,
            path=evidence_path,
            message=None if gate in evidence else "gate obrigatorio ausente",
            value=gate,
        )
        if gate in evidence:
            gate_is_valid = is_valid_readiness_gate(evidence.get(gate))
            append_check(
                checks,
                "readiness_evidence_gate_shape",
                gate_is_valid,
                path=evidence_path,
                message=None if gate_is_valid else "formato de gate invalido",
                value=gate,
            )
            provenance_error = readiness_gate_provenance_error(gate, evidence.get(gate)) if gate_is_valid else None
            append_check(
                checks,
                "readiness_evidence_gate_provenance",
                provenance_error is None,
                path=evidence_path,
                message=provenance_error,
                value=gate,
            )
    for gate in sorted(evidence.keys()):
        append_check(
            checks,
            "readiness_evidence_extra_gate",
            gate in READINESS_EVIDENCE_GATES,
            path=evidence_path,
            message=None if gate in READINESS_EVIDENCE_GATES else "gate desconhecido",
            value=gate,
        )


def validate_readiness_evidence_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "evidencias devem ser objeto JSON")
        return errors

    for gate in READINESS_EVIDENCE_GATES:
        if gate not in payload:
            validation_error(errors, f"$.{gate}", "gate obrigatorio ausente")
            continue
        if not is_valid_readiness_gate(payload.get(gate)):
            validation_error(errors, f"$.{gate}", "formato de gate invalido")
            continue
        provenance_error = readiness_gate_provenance_error(gate, payload.get(gate))
        if provenance_error is not None:
            validation_error(errors, f"$.{gate}", provenance_error)

    for gate in sorted(payload.keys()):
        if gate not in READINESS_EVIDENCE_GATES:
            validation_error(errors, f"$.{gate}", "gate desconhecido")
    return errors


def readiness_evidence_template():
    return {
        "manual_mgba_stress_smoke": {
            "ok": False,
            "evidence_type": "manual_mgba_stress_smoke",
            "source": "mGBA stress smoke log path or note",
            "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
            "review_environment": "mGBA, NanoBoyAdvance, hardware, or approved automated suite",
            "message": "Open stress ROMs in mGBA and record visual/audio behavior.",
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
            "ok": False,
            "evidence_type": "gba_studio_engine_primary_rollout",
            "source": "GBA Studio private engine-primary export smoke log path or note",
            "checked_at": "YYYY-MM-DDTHH:MM:SSZ",
            "message": "Keep gbastudio_engine as the private primary backend gate while preserving Butano only as legacy rollback.",
        },
    }


def write_json_file(path, data):
    output_path = absolute_path(path)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
    return output_path


def file_integrity_payload(path):
    data = Path(path).read_bytes()
    return {
        "sha256": hashlib.sha256(data).hexdigest(),
        "size_bytes": len(data),
    }


def parse_bool(value):
    if isinstance(value, bool):
        return value
    if not isinstance(value, str):
        return None
    normalized = value.strip().lower()
    if normalized in ("1", "true", "yes", "y", "ok"):
        return True
    if normalized in ("0", "false", "no", "n", "fail", "failed"):
        return False
    return None


def update_readiness_evidence_file(path, gate, ok, source=None, checked_at=None, message=None, evidence_type=None, validated_platforms=None, review_environment=None):
    if gate not in READINESS_EVIDENCE_GATES:
        return None, f"gate desconhecido: {gate}"
    parsed_ok = parse_bool(ok)
    if parsed_ok is None:
        return None, f"valor booleano invalido para gate {gate}: {ok}"

    output_path = absolute_path(path)
    if output_path.exists():
        evidence, error = load_json_file(output_path)
        if error is not None:
            return None, error
        if not isinstance(evidence, dict):
            return None, "arquivo de evidencias deve conter um objeto JSON"
    else:
        evidence = readiness_evidence_template()

    gate_value = {
        "ok": parsed_ok,
    }
    if source:
        gate_value["source"] = source
    if checked_at:
        gate_value["checked_at"] = checked_at
    if message:
        gate_value["message"] = message
    if evidence_type:
        gate_value["evidence_type"] = evidence_type
    if review_environment:
        gate_value["review_environment"] = review_environment
    if validated_platforms:
        gate_value["validated_platforms"] = validated_platforms
    provenance_error = readiness_gate_provenance_error(gate, gate_value)
    if provenance_error is not None:
        return None, provenance_error
    evidence[gate] = gate_value
    write_json_file(output_path, evidence)
    return {
        "path": str(output_path),
        "gate": gate,
        "value": gate_value,
        "evidence": evidence,
    }, None


def normalized_readiness_gate_value(value):
    if isinstance(value, bool):
        return {"ok": value}
    if isinstance(value, dict):
        normalized = {"ok": value.get("ok")}
        for key in ("source", "checked_at", "message", "evidence_type", "review_environment", "validated_platforms"):
            if key in value:
                normalized[key] = value[key]
        return normalized
    return None


def merge_readiness_gate_value(existing, incoming):
    if not (isinstance(existing, dict) and isinstance(incoming, dict)):
        return None
    if existing.get("ok") is not True or incoming.get("ok") is not True:
        return None
    if existing == incoming:
        return existing
    if existing.get("evidence_type") == incoming.get("evidence_type") == "cross_platform_ci":
        merged = dict(existing)
        platforms = sorted(set(existing.get("validated_platforms", [])) | set(incoming.get("validated_platforms", [])))
        merged["validated_platforms"] = platforms
        if existing.get("source") != incoming.get("source"):
            merged["source"] = "GitHub Actions cross-platform CI inputs"
        if existing.get("checked_at") != incoming.get("checked_at"):
            checked_values = [value for value in (existing.get("checked_at"), incoming.get("checked_at")) if isinstance(value, str)]
            if checked_values:
                merged["checked_at"] = max(checked_values)
        if existing.get("message") != incoming.get("message"):
            merged["message"] = "Cross-platform CI evidence merged from multiple platform runs."
        return merged
    return None


def merge_readiness_evidence_files(output_path, input_paths):
    if not input_paths:
        return None, "informe ao menos um --readiness-evidence-input"

    merged = readiness_evidence_template()
    merged_from = {}
    inputs = []
    for raw_input_path in input_paths:
        input_path = absolute_path(raw_input_path)
        payload, error = load_json_file(input_path)
        if error is not None:
            return None, f"{input_path}: {error}"
        if not isinstance(payload, dict):
            return None, f"{input_path}: arquivo de evidencias deve conter um objeto JSON"
        validation_errors = validate_readiness_evidence_payload(payload)
        if validation_errors:
            first_error = validation_errors[0]
            return None, f"{input_path}: {first_error['path']}: {first_error['message']}"

        applied_gates = []
        for gate in READINESS_EVIDENCE_GATES:
            gate_value = normalized_readiness_gate_value(payload.get(gate))
            if gate_value is None or gate_value.get("ok") is not True:
                continue
            if merged.get(gate, {}).get("ok") is True:
                merged_gate_value = merge_readiness_gate_value(merged.get(gate), gate_value)
                if merged_gate_value is None:
                    return None, f"{input_path}: evidencia conflitante para gate {gate}"
                merged[gate] = merged_gate_value
            else:
                merged[gate] = gate_value
            merged_from[gate] = str(input_path)
            applied_gates.append(gate)

        inputs.append({
            "path": str(input_path),
            "applied_gates": applied_gates,
        })

    output = write_json_file(output_path, merged)
    return {
        "path": str(output),
        "input_count": len(input_paths),
        "inputs": inputs,
        "merged_gates": [
            {
                "gate": gate,
                "ok": merged[gate]["ok"],
                "source_file": merged_from.get(gate),
            }
            for gate in READINESS_EVIDENCE_GATES
        ],
        "evidence": merged,
    }, None


def build_report(args):
    checks = []
    engine_pack = absolute_path(args.engine_pack)
    devkitpro = absolute_path(args.devkitpro) if args.devkitpro else None
    devkitarm = absolute_path(args.devkitarm) if args.devkitarm else (devkitpro / "devkitARM" if devkitpro else None)
    project_dir = None
    project_manifest_data = None
    readiness_evidence = None

    check_path(checks, "engine_pack", engine_pack)
    engine_manifest_path = engine_pack / "enginepack.json"
    check_path(checks, "manifest", engine_manifest_path)
    engine_manifest, engine_manifest_error = load_json_file(engine_manifest_path)
    append_check(
        checks,
        "manifest_json",
        engine_manifest_error is None and isinstance(engine_manifest, dict),
        path=engine_manifest_path,
        message=engine_manifest_error,
    )
    check_path(checks, "version", engine_pack / "VERSION")
    check_path(checks, "license", engine_pack / "LICENSE")
    check_path(checks, "changelog", engine_pack / "CHANGELOG.md")
    check_path(checks, "include_dir", engine_pack / "include" / "gbs")
    check_path(checks, "engine_header", engine_pack / "include" / "gbs" / "engine.hpp")
    check_path(checks, "engine_lib", engine_pack / "lib" / "libgbastudio_engine.a")
    check_path(checks, "makefile", engine_pack / "templates" / "Makefile.gba")
    check_path(checks, "linker_script", engine_pack / "templates" / "gba.ld")
    check_path(checks, "project_schema", engine_pack / "schemas" / "gbastudio_project.schema.json")
    check_path(checks, "asset_pack_schema", engine_pack / "schemas" / "asset_pack.schema.json")
    check_path(checks, "export_project_schema", engine_pack / "schemas" / "export_project.schema.json")
    check_path(checks, "readiness_evidence_schema", engine_pack / "schemas" / "readiness_evidence.schema.json")
    check_path(checks, "readiness_report_schema", engine_pack / "schemas" / "readiness_report.schema.json")
    check_path(checks, "asset_pack_report_schema", engine_pack / "schemas" / "asset_pack_report.schema.json")
    check_path(checks, "promotion_bundle_schema", engine_pack / "schemas" / "promotion_bundle.schema.json")
    check_path(checks, "promotion_bundle_validation_schema", engine_pack / "schemas" / "promotion_bundle_validation.schema.json")
    check_path(checks, "promotion_summary_schema", engine_pack / "schemas" / "promotion_summary.schema.json")
    check_path(checks, "public_schema_catalog_schema", engine_pack / "schemas" / "public_schema_catalog.schema.json")
    check_executable_candidates(checks, "assetc", engine_pack / "tools", "assetc")
    check_executable_candidates(checks, "gbsbuild", engine_pack / "tools", "gbsbuild")
    check_executable_candidates(checks, "gbsdoctor", engine_pack / "tools", "gbsdoctor")
    check_executable_candidates(checks, "smoke_mgba", engine_pack / "tools", "smoke_mgba")
    check_executable_candidates(checks, "production_smoke", engine_pack / "tools", "production_smoke")
    check_executable_candidates(checks, "stress_projects", engine_pack / "tools", "stress_projects")
    check_executable_candidates(checks, "verify_cross_platform", engine_pack / "tools", "verify_cross_platform")

    if args.project_dir:
        project_dir = absolute_path(args.project_dir)
        check_path(checks, "project_dir", project_dir)
        check_path(checks, "project_main", project_dir / "main.cpp")
        project_manifest = project_dir / "gbastudio_project.json"
        check_path(checks, "project_manifest", project_manifest, required=False)
        if project_manifest.exists():
            project_manifest_data = check_project_manifest(checks, project_dir, project_manifest, engine_manifest)

    if args.readiness_evidence:
        readiness_evidence_path = absolute_path(args.readiness_evidence)
        check_path(checks, "readiness_evidence", readiness_evidence_path)
        loaded_evidence, readiness_evidence_error = load_json_file(readiness_evidence_path)
        readiness_evidence = loaded_evidence if isinstance(loaded_evidence, dict) else None
        append_check(
            checks,
            "readiness_evidence_json",
            readiness_evidence_error is None and isinstance(loaded_evidence, dict),
            path=readiness_evidence_path,
            message=readiness_evidence_error,
        )
        check_readiness_evidence(checks, readiness_evidence, readiness_evidence_path)

    if not args.skip_toolchain:
        check_command(checks, "make", args.make)
        if devkitpro:
            check_path(checks, "devkitpro", devkitpro)
            check_executable_candidates(checks, "gbafix", devkitpro / "tools" / "bin", "gbafix")
        else:
            checks.append({
                "key": "devkitpro",
                "required": True,
                "ok": False,
                "path": None,
                "message": "DEVKITPRO nao informado",
            })

        if devkitarm:
            check_path(checks, "devkitarm", devkitarm)
            check_executable_candidates(checks, "arm_gcc", devkitarm / "bin", "arm-none-eabi-gcc")
            check_executable_candidates(checks, "arm_gxx", devkitarm / "bin", "arm-none-eabi-g++")
            check_executable_candidates(checks, "arm_objcopy", devkitarm / "bin", "arm-none-eabi-objcopy")
        else:
            checks.append({
                "key": "devkitarm",
                "required": True,
                "ok": False,
                "path": None,
                "message": "DEVKITARM nao informado",
            })

    required_checks = [check for check in checks if check.get("required", True)]
    ok = all(check["ok"] for check in required_checks)
    template_diagnostics = sdk_template_diagnostics(engine_pack, engine_manifest)
    ok = ok and all(template["ok"] for template in template_diagnostics)
    capability_diagnostics = build_capability_diagnostics(engine_manifest)
    actionable_messages = build_actionable_messages(checks, template_diagnostics, capability_diagnostics)
    stress_readiness = build_stress_readiness(engine_manifest, checks)
    resource_pool_readiness = build_resource_pool_readiness(engine_manifest)
    toolchain_diagnostics = build_toolchain_diagnostics(checks, args.skip_toolchain)
    butano_replacement_readiness = build_butano_replacement_readiness(
        template_diagnostics,
        capability_diagnostics,
        stress_readiness,
        toolchain_diagnostics,
        actionable_messages,
        readiness_evidence,
    )
    return {
        "ok": ok,
        "version": VERSION,
        "engine_pack": str(engine_pack),
        "platform": {
            "system": platform.system(),
            "machine": platform.machine(),
            "python": sys.version.split()[0],
            "path_separator": os.sep,
            "path_list_separator": os.pathsep,
        },
        "environment": {
            "DEVKITPRO": os.environ.get("DEVKITPRO"),
            "DEVKITARM": os.environ.get("DEVKITARM"),
            "MAKE": os.environ.get("MAKE"),
        },
        "engine_manifest": engine_manifest_summary(engine_manifest),
        "diagnostics": {
            "ok": ok and not actionable_messages,
            "project": build_project_summary(project_dir, project_manifest_data) if project_dir is not None else None,
            "readiness_evidence": readiness_evidence,
            "genres": genre_diagnostics(template_diagnostics),
            "templates": {
                "ok": all(template["ok"] for template in template_diagnostics),
                "items": template_diagnostics,
            },
            "asset_banking": capability_diagnostics["asset_banking"],
            "render_cost": capability_diagnostics["render_cost"],
            "audio_cost": capability_diagnostics["audio_cost"],
            "stress_readiness": stress_readiness,
            "resource_pool_readiness": resource_pool_readiness,
            "butano_replacement_readiness": butano_replacement_readiness,
            "toolchain": toolchain_diagnostics,
            "actionable_messages": actionable_messages,
        },
        "checks": checks,
    }


def print_report(report, as_json):
    if as_json:
        print(json.dumps(report, indent=2))
        return

    status = "OK" if report["ok"] else "FAIL"
    print(f"gbsdoctor: {status}")
    for check in report["checks"]:
        marker = "OK" if check["ok"] else "FAIL"
        target = check.get("path") or check.get("command") or ""
        print(f"[{marker}] {check['key']}: {target}")


def print_readiness_report(report, as_json):
    readiness = report["diagnostics"]["butano_replacement_readiness"]
    if as_json:
        print(json.dumps({
            "ok": readiness["ok"],
            "version": report["version"],
            "engine_pack": report["engine_pack"],
            "kind": "butano_replacement_readiness",
            "butano_replacement_readiness": readiness,
        }, indent=2))
        return

    print(f"stage: {readiness['stage']}")
    print(f"ready_for_primary_backend: {str(readiness['ready_for_primary_backend']).lower()}")
    print(f"backend_policy: {readiness['backend_policy']}")
    missing = readiness.get("missing_manual_gates", [])
    if missing:
        print("missing_manual_gates:")
        for gate in missing:
            print(f"- {gate}")
    next_actions = readiness.get("next_actions", [])
    if next_actions:
        print("next_actions:")
        for action in next_actions:
            command = action.get("command")
            print(f"- {action.get('id')}: {command}")


def readiness_report_payload(report):
    readiness = report["diagnostics"]["butano_replacement_readiness"]
    return {
        "ok": readiness["ok"],
        "version": report["version"],
        "engine_pack": report["engine_pack"],
        "kind": "butano_replacement_readiness",
        "butano_replacement_readiness": readiness,
    }


def validation_error(errors, path, message):
    errors.append({
        "path": path,
        "message": message,
    })


def require_key(errors, data, key, expected_type=None, path="$"):
    if not isinstance(data, dict) or key not in data:
        validation_error(errors, f"{path}.{key}", "campo obrigatorio ausente")
        return None
    value = data.get(key)
    if expected_type is not None and not isinstance(value, expected_type):
        validation_error(errors, f"{path}.{key}", f"tipo invalido, esperado {expected_type.__name__}")
        return None
    return value


def validate_string_array(errors, value, path):
    if not isinstance(value, list):
        validation_error(errors, path, "tipo invalido, esperado list")
        return
    seen = set()
    for index, item in enumerate(value):
        item_path = f"{path}[{index}]"
        if not isinstance(item, str) or not item:
            validation_error(errors, item_path, "item deve ser string nao vazia")
            continue
        if item in seen:
            validation_error(errors, item_path, "item duplicado")
        seen.add(item)


def validate_readiness_report_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "relatorio deve ser objeto JSON")
        return errors

    require_key(errors, payload, "ok", bool)
    require_key(errors, payload, "version", str)
    require_key(errors, payload, "engine_pack", str)
    kind = require_key(errors, payload, "kind", str)
    if kind is not None and kind != "butano_replacement_readiness":
        validation_error(errors, "$.kind", "valor esperado: butano_replacement_readiness")

    readiness = require_key(errors, payload, "butano_replacement_readiness", dict)
    if not isinstance(readiness, dict):
        return errors

    require_key(errors, readiness, "ok", bool, "$.butano_replacement_readiness")
    require_key(errors, readiness, "ready_for_primary_backend", bool, "$.butano_replacement_readiness")
    stage = require_key(errors, readiness, "stage", str, "$.butano_replacement_readiness")
    if stage is not None and stage not in ("blocked", "beta_candidate", "primary_ready"):
        validation_error(errors, "$.butano_replacement_readiness.stage", "valor esperado: blocked, beta_candidate ou primary_ready")
    backend_policy = require_key(errors, readiness, "backend_policy", str, "$.butano_replacement_readiness")
    if backend_policy is not None and backend_policy != "parallel_until_manual_promotion":
        validation_error(errors, "$.butano_replacement_readiness.backend_policy", "valor esperado: parallel_until_manual_promotion")

    manual_gates = require_key(errors, readiness, "manual_primary_gates", list, "$.butano_replacement_readiness")
    if isinstance(manual_gates, list):
        for index, gate in enumerate(manual_gates):
            gate_path = f"$.butano_replacement_readiness.manual_primary_gates[{index}]"
            if not isinstance(gate, dict):
                validation_error(errors, gate_path, "gate deve ser objeto")
                continue
            require_key(errors, gate, "id", str, gate_path)
            require_key(errors, gate, "ok", bool, gate_path)
            require_key(errors, gate, "message", str, gate_path)

    missing_manual_gates = require_key(errors, readiness, "missing_manual_gates", list, "$.butano_replacement_readiness")
    if isinstance(missing_manual_gates, list):
        validate_string_array(errors, missing_manual_gates, "$.butano_replacement_readiness.missing_manual_gates")

    next_actions = require_key(errors, readiness, "next_actions", list, "$.butano_replacement_readiness")
    if isinstance(next_actions, list):
        for index, action in enumerate(next_actions):
            action_path = f"$.butano_replacement_readiness.next_actions[{index}]"
            if not isinstance(action, dict):
                validation_error(errors, action_path, "next_action deve ser objeto")
                continue
            require_key(errors, action, "id", str, action_path)
            require_key(errors, action, "command", str, action_path)
            require_key(errors, action, "message", str, action_path)

    blockers = require_key(errors, readiness, "blockers", list, "$.butano_replacement_readiness")
    if isinstance(blockers, list):
        for index, blocker in enumerate(blockers):
            blocker_path = f"$.butano_replacement_readiness.blockers[{index}]"
            if not isinstance(blocker, dict):
                validation_error(errors, blocker_path, "blocker deve ser objeto")
                continue
            require_key(errors, blocker, "id", str, blocker_path)
            require_key(errors, blocker, "message", str, blocker_path)
            require_key(errors, blocker, "missing", list, blocker_path)

    return errors


def validate_readiness_report_file(path):
    report_path = absolute_path(path)
    payload, error = load_json_file(report_path)
    errors = []
    if error is not None:
        validation_error(errors, "$", error)
    else:
        errors.extend(validate_readiness_report_payload(payload))
    readiness = payload.get("butano_replacement_readiness") if isinstance(payload, dict) else {}
    return {
        "ok": not errors,
        "version": VERSION,
        "kind": "readiness_report_validation",
        "path": str(report_path),
        "ready_for_primary_backend": readiness.get("ready_for_primary_backend") if isinstance(readiness, dict) else None,
        "stage": readiness.get("stage") if isinstance(readiness, dict) else None,
        "errors": errors,
    }


def readiness_report_validation_result(payload, path):
    errors = validate_readiness_report_payload(payload)
    readiness = payload.get("butano_replacement_readiness") if isinstance(payload, dict) else {}
    return {
        "ok": not errors,
        "version": VERSION,
        "kind": "readiness_report_validation",
        "path": str(path),
        "ready_for_primary_backend": readiness.get("ready_for_primary_backend") if isinstance(readiness, dict) else None,
        "stage": readiness.get("stage") if isinstance(readiness, dict) else None,
        "errors": errors,
    }


def promotion_readiness_summary(readiness):
    if not isinstance(readiness, dict):
        return None
    return {
        "ok": readiness.get("ok"),
        "stage": readiness.get("stage"),
        "ready_for_primary_backend": readiness.get("ready_for_primary_backend"),
        "backend_policy": readiness.get("backend_policy"),
        "manual_primary_gates": readiness.get("manual_primary_gates", []),
        "missing_manual_gates": readiness.get("missing_manual_gates", []),
        "next_actions": readiness.get("next_actions", []),
        "blockers": readiness.get("blockers", []),
    }


def promotion_summary_text(decision, validation):
    readiness = decision["butano_replacement_readiness"]
    lines = [
        "GBAStudio Engine promotion bundle",
        f"stage: {readiness['stage']}",
        f"ready_for_primary_backend: {str(readiness['ready_for_primary_backend']).lower()}",
        f"backend_policy: {readiness['backend_policy']}",
        f"validation_ok: {str(validation['ok']).lower()}",
    ]
    missing = readiness.get("missing_manual_gates", [])
    if missing:
        lines.append("missing_manual_gates:")
        lines.extend(f"- {gate}" for gate in missing)
    next_actions = readiness.get("next_actions", [])
    if next_actions:
        lines.append("next_actions:")
        lines.extend(f"- {action.get('id')}: {action.get('command')}" for action in next_actions)
    return "\n".join(lines) + "\n"


def promotion_summary_payload(decision, validation, schema_catalog):
    readiness = decision["butano_replacement_readiness"]
    return {
        "ok": bool(validation.get("ok")),
        "version": VERSION,
        "kind": "promotion_summary",
        "stage": readiness.get("stage"),
        "ready_for_primary_backend": readiness.get("ready_for_primary_backend"),
        "backend_policy": readiness.get("backend_policy"),
        "missing_manual_gates": readiness.get("missing_manual_gates", []),
        "next_actions": readiness.get("next_actions", []),
        "public_schema_catalog_summary": {
            "ok": schema_catalog.get("ok") is True and not schema_catalog.get("missing_schemas"),
            "schema_count": schema_catalog.get("schema_count"),
            "missing_schemas": schema_catalog.get("missing_schemas", []),
            "accepted_schema_arguments": schema_catalog.get("accepted_schema_arguments", []),
        },
    }


def promotion_summary_summary(payload):
    if not isinstance(payload, dict):
        return None
    return {
        "ok": payload.get("ok"),
        "stage": payload.get("stage"),
        "ready_for_primary_backend": payload.get("ready_for_primary_backend"),
        "missing_manual_gates": payload.get("missing_manual_gates", []),
        "public_schema_catalog_summary": payload.get("public_schema_catalog_summary"),
    }


def write_promotion_bundle(path, report):
    output_dir = absolute_path(path)
    output_dir.mkdir(parents=True, exist_ok=True)
    decision = readiness_report_payload(report)
    decision_path = output_dir / "readiness_decision.json"
    validation_path = output_dir / "readiness_validation.json"
    evidence_template_path = output_dir / "readiness_evidence_template.json"
    evidence_path = output_dir / "readiness_evidence.json"
    public_schema_catalog_path = output_dir / "public_schema_catalog.json"
    doctor_report_path = output_dir / "gbsdoctor_report.json"
    summary_path = output_dir / "promotion_summary.txt"
    summary_json_path = output_dir / "promotion_summary.json"
    manifest_path = output_dir / "promotion_bundle.json"

    write_json_file(decision_path, decision)
    validation = readiness_report_validation_result(decision, decision_path)
    schema_catalog = public_schema_catalog(report["engine_pack"])
    write_json_file(validation_path, validation)
    write_json_file(evidence_template_path, readiness_evidence_template())
    readiness_evidence = report.get("diagnostics", {}).get("readiness_evidence")
    if isinstance(readiness_evidence, dict):
        write_json_file(evidence_path, readiness_evidence)
    write_json_file(public_schema_catalog_path, schema_catalog)
    write_json_file(doctor_report_path, report)
    summary_path.write_text(promotion_summary_text(decision, validation), encoding="utf-8")
    write_json_file(summary_json_path, promotion_summary_payload(decision, validation, schema_catalog))

    readiness = decision["butano_replacement_readiness"]
    files = {
        "promotion_bundle": str(manifest_path),
        "readiness_decision": str(decision_path),
        "readiness_validation": str(validation_path),
        "readiness_evidence_template": str(evidence_template_path),
        "public_schema_catalog": str(public_schema_catalog_path),
        "gbsdoctor_report": str(doctor_report_path),
        "promotion_summary": str(summary_path),
        "promotion_summary_json": str(summary_json_path),
    }
    if isinstance(readiness_evidence, dict):
        files["readiness_evidence"] = str(evidence_path)
    file_integrity = {
        key: file_integrity_payload(path)
        for key, path in files.items()
        if key != "promotion_bundle"
    }
    manifest = {
        "ok": validation["ok"],
        "version": VERSION,
        "kind": "promotion_bundle",
        "path": str(output_dir),
        "stage": readiness["stage"],
        "ready_for_primary_backend": readiness["ready_for_primary_backend"],
        "backend_policy": readiness["backend_policy"],
        "missing_manual_gates": readiness.get("missing_manual_gates", []),
        "files": files,
        "file_integrity": file_integrity,
    }
    write_json_file(manifest_path, manifest)
    return manifest


def validate_promotion_bundle_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "promotion bundle deve ser objeto JSON")
        return errors

    require_key(errors, payload, "ok", bool)
    require_key(errors, payload, "version", str)
    kind = require_key(errors, payload, "kind", str)
    if kind is not None and kind != "promotion_bundle":
        validation_error(errors, "$.kind", "valor esperado: promotion_bundle")
    stage = require_key(errors, payload, "stage", str)
    if stage is not None and stage not in ("blocked", "beta_candidate", "primary_ready"):
        validation_error(errors, "$.stage", "valor esperado: blocked, beta_candidate ou primary_ready")
    require_key(errors, payload, "ready_for_primary_backend", bool)
    backend_policy = require_key(errors, payload, "backend_policy", str)
    if backend_policy is not None and backend_policy != "parallel_until_manual_promotion":
        validation_error(errors, "$.backend_policy", "valor esperado: parallel_until_manual_promotion")
    missing = require_key(errors, payload, "missing_manual_gates", list)
    if isinstance(missing, list):
        validate_string_array(errors, missing, "$.missing_manual_gates")

    files = require_key(errors, payload, "files", dict)
    if isinstance(files, dict):
        for key in (
            "promotion_bundle",
            "readiness_decision",
            "readiness_validation",
            "readiness_evidence_template",
            "readiness_evidence",
            "public_schema_catalog",
            "gbsdoctor_report",
            "promotion_summary",
            "promotion_summary_json",
        ):
            if key == "readiness_evidence":
                if key in files:
                    require_key(errors, files, key, str, "$.files")
                continue
            require_key(errors, files, key, str, "$.files")

    file_integrity = require_key(errors, payload, "file_integrity", dict)
    if isinstance(file_integrity, dict):
        for key in (
            "readiness_decision",
            "readiness_validation",
            "readiness_evidence_template",
            "readiness_evidence",
            "public_schema_catalog",
            "gbsdoctor_report",
            "promotion_summary",
            "promotion_summary_json",
        ):
            if key == "readiness_evidence" and key not in file_integrity:
                continue
            integrity = require_key(errors, file_integrity, key, dict, "$.file_integrity")
            if not isinstance(integrity, dict):
                continue
            sha256 = require_key(errors, integrity, "sha256", str, f"$.file_integrity.{key}")
            if isinstance(sha256, str) and (len(sha256) != 64 or any(char not in "0123456789abcdef" for char in sha256)):
                validation_error(errors, f"$.file_integrity.{key}.sha256", "sha256 deve ter 64 caracteres hexadecimais em minusculas")
            size_bytes = require_key(errors, integrity, "size_bytes", int, f"$.file_integrity.{key}")
            if isinstance(size_bytes, bool) or (isinstance(size_bytes, int) and size_bytes < 0):
                validation_error(errors, f"$.file_integrity.{key}.size_bytes", "size_bytes deve ser inteiro nao negativo")
    return errors


def validate_promotion_bundle(path):
    bundle_path = absolute_path(path)
    manifest_path = bundle_path / "promotion_bundle.json" if bundle_path.is_dir() else bundle_path
    payload, error = load_json_file(manifest_path)
    errors = []
    if error is not None:
        validation_error(errors, "$", error)
        payload = None
    else:
        errors.extend(validate_promotion_bundle_payload(payload))

    files = payload.get("files", {}) if isinstance(payload, dict) else {}
    checked_files = {}
    readiness_summary = None
    public_schema_catalog_summary = None
    summary_json_summary = None
    if isinstance(files, dict):
        for key, raw_path in files.items():
            if not isinstance(raw_path, str) or not raw_path:
                continue
            file_path = Path(raw_path)
            if not file_path.is_absolute():
                file_path = manifest_path.parent / file_path
            exists = file_path.exists()
            checked_files[key] = {
                "path": str(file_path),
                "ok": exists,
            }
            if not exists:
                validation_error(errors, f"$.files.{key}", "arquivo declarado nao existe")

        integrity_map = payload.get("file_integrity", {}) if isinstance(payload, dict) else {}
        if isinstance(integrity_map, dict):
            for key, expected_integrity in integrity_map.items():
                file_info = checked_files.get(key)
                if not isinstance(file_info, dict) or not file_info.get("ok"):
                    continue
                if not isinstance(expected_integrity, dict):
                    continue
                file_path = Path(file_info["path"])
                actual_integrity = file_integrity_payload(file_path)
                expected_sha = expected_integrity.get("sha256")
                expected_size = expected_integrity.get("size_bytes")
                checked_files[key]["sha256"] = actual_integrity["sha256"]
                checked_files[key]["size_bytes"] = actual_integrity["size_bytes"]
                if isinstance(expected_sha, str) and actual_integrity["sha256"] != expected_sha:
                    validation_error(errors, f"$.file_integrity.{key}.sha256", "sha256 nao confere")
                if isinstance(expected_size, int) and not isinstance(expected_size, bool) and actual_integrity["size_bytes"] != expected_size:
                    validation_error(errors, f"$.file_integrity.{key}.size_bytes", "size_bytes nao confere")

        decision_path = checked_files.get("readiness_decision", {}).get("path")
        if decision_path:
            decision, decision_error = load_json_file(Path(decision_path))
            if decision_error is not None:
                validation_error(errors, "$.files.readiness_decision", decision_error)
            else:
                for error_item in validate_readiness_report_payload(decision):
                    validation_error(errors, f"$.files.readiness_decision{error_item['path'][1:]}", error_item["message"])
                if isinstance(decision, dict):
                    readiness_summary = promotion_readiness_summary(decision.get("butano_replacement_readiness"))

        validation_path = checked_files.get("readiness_validation", {}).get("path")
        if validation_path:
            validation_payload, validation_error_message = load_json_file(Path(validation_path))
            if validation_error_message is not None:
                validation_error(errors, "$.files.readiness_validation", validation_error_message)
            elif not isinstance(validation_payload, dict) or validation_payload.get("kind") != "readiness_report_validation" or validation_payload.get("ok") is not True:
                validation_error(errors, "$.files.readiness_validation", "validacao do readiness report deve estar ok")

        evidence_path = checked_files.get("readiness_evidence_template", {}).get("path")
        if evidence_path:
            evidence_payload, evidence_error = load_json_file(Path(evidence_path))
            if evidence_error is not None:
                validation_error(errors, "$.files.readiness_evidence_template", evidence_error)
            elif not isinstance(evidence_payload, dict):
                validation_error(errors, "$.files.readiness_evidence_template", "template de evidencia deve ser objeto JSON")

        actual_evidence_path = checked_files.get("readiness_evidence", {}).get("path")
        if actual_evidence_path:
            evidence_payload, evidence_error = load_json_file(Path(actual_evidence_path))
            if evidence_error is not None:
                validation_error(errors, "$.files.readiness_evidence", evidence_error)
            else:
                for error_item in validate_readiness_evidence_payload(evidence_payload):
                    validation_error(errors, f"$.files.readiness_evidence{error_item['path'][1:]}", error_item["message"])

        summary_json_path = checked_files.get("promotion_summary_json", {}).get("path")
        if summary_json_path:
            summary_payload, summary_error = load_json_file(Path(summary_json_path))
            if summary_error is not None:
                validation_error(errors, "$.files.promotion_summary_json", summary_error)
            elif not isinstance(summary_payload, dict):
                validation_error(errors, "$.files.promotion_summary_json", "resumo JSON deve ser objeto JSON")
            else:
                summary_errors = validate_promotion_summary_payload(summary_payload)
                for error_item in summary_errors:
                    validation_error(errors, f"$.files.promotion_summary_json{error_item['path'][1:]}", error_item["message"])
                if not summary_errors:
                    summary_json_summary = promotion_summary_summary(summary_payload)

        public_schema_catalog_path = checked_files.get("public_schema_catalog", {}).get("path")
        if public_schema_catalog_path:
            catalog_payload, catalog_error = load_json_file(Path(public_schema_catalog_path))
            if catalog_error is not None:
                validation_error(errors, "$.files.public_schema_catalog", catalog_error)
            else:
                for error_item in validate_public_schema_catalog_payload(catalog_payload):
                    validation_error(errors, f"$.files.public_schema_catalog{error_item['path'][1:]}", error_item["message"])
                if isinstance(catalog_payload, dict) and catalog_payload.get("missing_schemas"):
                    validation_error(errors, "$.files.public_schema_catalog.missing_schemas", "catalogo publico nao pode ter schemas ausentes no promotion bundle")
                if isinstance(catalog_payload, dict):
                    public_schema_catalog_summary = {
                        "ok": catalog_payload.get("ok") is True and not catalog_payload.get("missing_schemas"),
                        "schema_count": catalog_payload.get("schema_count"),
                        "missing_schemas": catalog_payload.get("missing_schemas", []),
                        "accepted_schema_arguments": catalog_payload.get("accepted_schema_arguments", []),
                    }

        doctor_report_path = checked_files.get("gbsdoctor_report", {}).get("path")
        if doctor_report_path:
            doctor_report_payload, doctor_report_error = load_json_file(Path(doctor_report_path))
            if doctor_report_error is not None:
                validation_error(errors, "$.files.gbsdoctor_report", doctor_report_error)
            elif not isinstance(doctor_report_payload, dict):
                validation_error(errors, "$.files.gbsdoctor_report", "relatorio completo deve ser objeto JSON")
            else:
                if not isinstance(doctor_report_payload.get("version"), str):
                    validation_error(errors, "$.files.gbsdoctor_report.version", "relatorio completo deve conter version")
                if not isinstance(doctor_report_payload.get("engine_manifest"), dict):
                    validation_error(errors, "$.files.gbsdoctor_report.engine_manifest", "relatorio completo deve conter engine_manifest")
                if not isinstance(doctor_report_payload.get("checks"), list):
                    validation_error(errors, "$.files.gbsdoctor_report.checks", "relatorio completo deve conter checks")
                if not isinstance(doctor_report_payload.get("diagnostics"), dict):
                    validation_error(errors, "$.files.gbsdoctor_report.diagnostics", "relatorio completo deve conter diagnostics")

    return {
        "ok": not errors,
        "version": VERSION,
        "kind": "promotion_bundle_validation",
        "path": str(manifest_path),
        "stage": payload.get("stage") if isinstance(payload, dict) else None,
        "ready_for_primary_backend": payload.get("ready_for_primary_backend") if isinstance(payload, dict) else None,
        "primary_ready_required": False,
        "readiness_summary": readiness_summary,
        "public_schema_catalog_summary": public_schema_catalog_summary,
        "promotion_summary_summary": summary_json_summary,
        "files": checked_files,
        "errors": errors,
    }


def require_primary_ready_for_promotion_validation(result):
    if result.get("ready_for_primary_backend") is True:
        result["primary_ready_required"] = True
        return result
    result["primary_ready_required"] = True
    result["ok"] = False
    validation_error(
        result["errors"],
        "$.ready_for_primary_backend",
        "bundle ainda nao esta liberado para backend principal",
    )
    return result


def validate_readiness_summary_payload(errors, readiness, path):
    if readiness is None:
        return
    if not isinstance(readiness, dict):
        validation_error(errors, path, "readiness_summary deve ser objeto ou null")
        return

    require_key(errors, readiness, "ok", bool, path)
    stage = require_key(errors, readiness, "stage", str, path)
    if stage is not None and stage not in ("blocked", "beta_candidate", "primary_ready"):
        validation_error(errors, f"{path}.stage", "valor esperado: blocked, beta_candidate ou primary_ready")
    require_key(errors, readiness, "ready_for_primary_backend", bool, path)
    backend_policy = require_key(errors, readiness, "backend_policy", str, path)
    if backend_policy is not None and backend_policy != "parallel_until_manual_promotion":
        validation_error(errors, f"{path}.backend_policy", "valor esperado: parallel_until_manual_promotion")

    manual_gates = require_key(errors, readiness, "manual_primary_gates", list, path)
    if isinstance(manual_gates, list):
        for index, gate in enumerate(manual_gates):
            gate_path = f"{path}.manual_primary_gates[{index}]"
            if not isinstance(gate, dict):
                validation_error(errors, gate_path, "gate deve ser objeto")
                continue
            require_key(errors, gate, "id", str, gate_path)
            require_key(errors, gate, "ok", bool, gate_path)
            require_key(errors, gate, "message", str, gate_path)

    missing_manual_gates = require_key(errors, readiness, "missing_manual_gates", list, path)
    if isinstance(missing_manual_gates, list):
        validate_string_array(errors, missing_manual_gates, f"{path}.missing_manual_gates")

    next_actions = require_key(errors, readiness, "next_actions", list, path)
    if isinstance(next_actions, list):
        for index, action in enumerate(next_actions):
            action_path = f"{path}.next_actions[{index}]"
            if not isinstance(action, dict):
                validation_error(errors, action_path, "next_action deve ser objeto")
                continue
            require_key(errors, action, "id", str, action_path)
            require_key(errors, action, "command", str, action_path)
            require_key(errors, action, "message", str, action_path)

    blockers = require_key(errors, readiness, "blockers", list, path)
    if isinstance(blockers, list):
        for index, blocker in enumerate(blockers):
            blocker_path = f"{path}.blockers[{index}]"
            if not isinstance(blocker, dict):
                validation_error(errors, blocker_path, "blocker deve ser objeto")
                continue
            require_key(errors, blocker, "id", str, blocker_path)
            require_key(errors, blocker, "message", str, blocker_path)
            require_key(errors, blocker, "missing", list, blocker_path)


def validate_public_schema_catalog_summary_payload(errors, summary, path, allow_null=False):
    if summary is None and allow_null:
        return
    if not isinstance(summary, dict):
        expected = "objeto ou null" if allow_null else "objeto"
        validation_error(errors, path, f"resumo do catalogo publico deve ser {expected}")
        return

    require_key(errors, summary, "ok", bool, path)
    schema_count = require_key(errors, summary, "schema_count", None, path)
    if schema_count is not None and (isinstance(schema_count, bool) or not isinstance(schema_count, int) or schema_count < 0):
        validation_error(errors, f"{path}.schema_count", "schema_count deve ser inteiro nao negativo ou null")
    missing_schemas = require_key(errors, summary, "missing_schemas", list, path)
    if isinstance(missing_schemas, list):
        validate_string_array(errors, missing_schemas, f"{path}.missing_schemas")
    accepted_schema_arguments = require_key(errors, summary, "accepted_schema_arguments", list, path)
    if isinstance(accepted_schema_arguments, list):
        validate_string_array(errors, accepted_schema_arguments, f"{path}.accepted_schema_arguments")


def validate_promotion_summary_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "promotion summary deve ser objeto JSON")
        return errors

    require_key(errors, payload, "ok", bool)
    require_key(errors, payload, "version", str)
    kind = require_key(errors, payload, "kind", str)
    if kind is not None and kind != "promotion_summary":
        validation_error(errors, "$.kind", "valor esperado: promotion_summary")
    stage = require_key(errors, payload, "stage", str)
    if stage is not None and stage not in ("blocked", "beta_candidate", "primary_ready"):
        validation_error(errors, "$.stage", "valor esperado: blocked, beta_candidate ou primary_ready")
    require_key(errors, payload, "ready_for_primary_backend", bool)
    backend_policy = require_key(errors, payload, "backend_policy", str)
    if backend_policy is not None and backend_policy != "parallel_until_manual_promotion":
        validation_error(errors, "$.backend_policy", "valor esperado: parallel_until_manual_promotion")

    missing_manual_gates = require_key(errors, payload, "missing_manual_gates", list)
    if isinstance(missing_manual_gates, list):
        validate_string_array(errors, missing_manual_gates, "$.missing_manual_gates")

    next_actions = require_key(errors, payload, "next_actions", list)
    if isinstance(next_actions, list):
        for index, action in enumerate(next_actions):
            action_path = f"$.next_actions[{index}]"
            if not isinstance(action, dict):
                validation_error(errors, action_path, "next_action deve ser objeto")
                continue
            require_key(errors, action, "id", str, action_path)
            require_key(errors, action, "command", str, action_path)
            require_key(errors, action, "message", str, action_path)

    summary = require_key(errors, payload, "public_schema_catalog_summary", dict)
    validate_public_schema_catalog_summary_payload(errors, summary, "$.public_schema_catalog_summary")
    return errors


def validate_promotion_summary_summary_payload(errors, summary, path, allow_null=False):
    if summary is None and allow_null:
        return
    if not isinstance(summary, dict):
        expected = "objeto ou null" if allow_null else "objeto"
        validation_error(errors, path, f"promotion_summary_summary deve ser {expected}")
        return

    require_key(errors, summary, "ok", bool, path)
    stage = require_key(errors, summary, "stage", str, path)
    if stage is not None and stage not in ("blocked", "beta_candidate", "primary_ready"):
        validation_error(errors, f"{path}.stage", "valor esperado: blocked, beta_candidate ou primary_ready")
    require_key(errors, summary, "ready_for_primary_backend", bool, path)
    missing_manual_gates = require_key(errors, summary, "missing_manual_gates", list, path)
    if isinstance(missing_manual_gates, list):
        validate_string_array(errors, missing_manual_gates, f"{path}.missing_manual_gates")
    public_summary = require_key(errors, summary, "public_schema_catalog_summary", dict, path)
    validate_public_schema_catalog_summary_payload(errors, public_summary, f"{path}.public_schema_catalog_summary")


def validate_promotion_bundle_validation_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "resultado de validacao deve ser objeto JSON")
        return errors

    require_key(errors, payload, "ok", bool)
    require_key(errors, payload, "version", str)
    kind = require_key(errors, payload, "kind", str)
    if kind is not None and kind != "promotion_bundle_validation":
        validation_error(errors, "$.kind", "valor esperado: promotion_bundle_validation")
    require_key(errors, payload, "path", str)
    stage = require_key(errors, payload, "stage")
    if stage is not None and (not isinstance(stage, str) or stage not in ("blocked", "beta_candidate", "primary_ready")):
        validation_error(errors, "$.stage", "valor esperado: blocked, beta_candidate, primary_ready ou null")
    ready = require_key(errors, payload, "ready_for_primary_backend")
    if ready is not None and not isinstance(ready, bool):
        validation_error(errors, "$.ready_for_primary_backend", "tipo invalido, esperado bool ou null")
    require_key(errors, payload, "primary_ready_required", bool)

    readiness_summary = require_key(errors, payload, "readiness_summary")
    validate_readiness_summary_payload(errors, readiness_summary, "$.readiness_summary")

    public_schema_catalog_summary = require_key(errors, payload, "public_schema_catalog_summary")
    validate_public_schema_catalog_summary_payload(errors, public_schema_catalog_summary, "$.public_schema_catalog_summary", allow_null=True)

    promotion_summary = require_key(errors, payload, "promotion_summary_summary")
    validate_promotion_summary_summary_payload(errors, promotion_summary, "$.promotion_summary_summary", allow_null=True)

    files = require_key(errors, payload, "files", dict)
    if isinstance(files, dict):
        for key, item in files.items():
            item_path = f"$.files.{key}"
            if not isinstance(key, str) or not key:
                validation_error(errors, "$.files", "chave de arquivo deve ser string nao vazia")
            if not isinstance(item, dict):
                validation_error(errors, item_path, "arquivo checado deve ser objeto")
                continue
            require_key(errors, item, "path", str, item_path)
            require_key(errors, item, "ok", bool, item_path)
            if "sha256" in item:
                sha256 = item.get("sha256")
                if not isinstance(sha256, str) or len(sha256) != 64 or any(char not in "0123456789abcdef" for char in sha256):
                    validation_error(errors, f"{item_path}.sha256", "sha256 deve ter 64 caracteres hexadecimais em minusculas")
            if "size_bytes" in item:
                size_bytes = item.get("size_bytes")
                if isinstance(size_bytes, bool) or not isinstance(size_bytes, int) or size_bytes < 0:
                    validation_error(errors, f"{item_path}.size_bytes", "size_bytes deve ser inteiro nao negativo")

    error_items = require_key(errors, payload, "errors", list)
    if isinstance(error_items, list):
        for index, error_item in enumerate(error_items):
            error_path = f"$.errors[{index}]"
            if not isinstance(error_item, dict):
                validation_error(errors, error_path, "erro deve ser objeto")
                continue
            require_key(errors, error_item, "path", str, error_path)
            require_key(errors, error_item, "message", str, error_path)
    return errors


PROJECT_KIND_VALUES = (
    "topdown",
    "platformer",
    "isometric",
    "dungeon_crawler",
    "racing",
    "battle_rpg",
    "luta",
    "mixed",
)

DISPATCH_RUNTIME_VALUES = (
    "topdown",
    "platformer",
    "isometric",
    "menu",
    "shmup",
    "point_click",
    "dungeon_crawler",
    "racing",
    "cutscene",
    "visual_novel",
    "world_map",
    "battle_rpg",
    "luta",
)


EXPORT_KIND_VALUES = (
    "topdown",
    "platformer",
    "isometric",
    "dungeon_crawler",
    "dungeonCrawler",
    "racing",
    "battle_rpg",
    "luta",
    "mixed",
    "point_click",
    "pointAndClick",
    "shmup",
    "shoot_em_up",
    "shootEmUp",
    "visual_novel",
    "visualNovel",
    "menu",
    "cutscene",
    "world_map",
    "worldMap",
)


ASSET_PACK_KIND_VALUES = (
    "bg",
    "obj",
    "affine_bg",
    "bitmap3",
    "bitmap4",
    "bitmap5",
    "audio",
    "bank",
)


def validate_positive_schema_version(errors, payload, path="$"):
    schema = require_key(errors, payload, "schema", int, path)
    if isinstance(schema, bool) or (isinstance(schema, int) and schema < 1):
        validation_error(errors, f"{path}.schema", "schema deve ser inteiro >= 1")


def validate_unique_string_array(errors, payload, key, path="$", required=True):
    value = require_key(errors, payload, key, list, path) if required else payload.get(key)
    if value is None:
        return
    validate_string_array(errors, value, f"{path}.{key}")


def validate_requires_object(errors, payload, path):
    if "requires" not in payload:
        return
    requires = payload.get("requires")
    if not isinstance(requires, dict):
        validation_error(errors, path, "requires deve ser objeto")
        return
    if "engine_pack" in requires and not isinstance(requires.get("engine_pack"), str):
        validation_error(errors, f"{path}.engine_pack", "engine_pack deve ser string")
    if "features" in requires:
        validate_string_array(errors, requires.get("features"), f"{path}.features")


def validate_build_object(errors, payload, path):
    if "build" not in payload:
        return
    build = payload.get("build")
    if not isinstance(build, dict):
        validation_error(errors, path, "build deve ser objeto")
        return
    if "target" in build and not is_valid_build_target(build.get("target")):
        validation_error(errors, f"{path}.target", "target de build invalido")
    if "make_target" in build and build.get("make_target") not in ("all", "clean"):
        validation_error(errors, f"{path}.make_target", "valor esperado: all ou clean")
    if "sources" in build:
        validate_unique_string_array(errors, build, "sources", path)
        sources = build.get("sources")
        if isinstance(sources, list):
            for index, source in enumerate(sources):
                if isinstance(source, str) and not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*\.cpp", source):
                    validation_error(errors, f"{path}.sources[{index}]", "source deve ser um arquivo .cpp simples")


def validate_runtime_dispatch_object(errors, payload, path="$.runtime_dispatch"):
    if "runtime_dispatch" not in payload:
        return
    dispatch = payload.get("runtime_dispatch")
    if not isinstance(dispatch, dict):
        validation_error(errors, path, "runtime_dispatch deve ser objeto")
        return
    initial_runtime = require_key(errors, dispatch, "initial_runtime", str, path)
    if initial_runtime is not None and initial_runtime not in DISPATCH_RUNTIME_VALUES:
        validation_error(errors, f"{path}.initial_runtime", "runtime inicial invalido")
    initial_room = require_key(errors, dispatch, "initial_room", int, path)
    if isinstance(initial_room, bool) or (isinstance(initial_room, int) and initial_room < 0):
        validation_error(errors, f"{path}.initial_room", "initial_room deve ser inteiro >= 0")
    validate_unique_string_array(errors, dispatch, "runtimes", path)
    runtimes = dispatch.get("runtimes")
    if isinstance(runtimes, list):
        if len(runtimes) < 2:
            validation_error(errors, f"{path}.runtimes", "runtimes deve conter pelo menos dois runtimes")
        for index, runtime in enumerate(runtimes):
            if isinstance(runtime, str) and runtime not in DISPATCH_RUNTIME_VALUES:
                validation_error(errors, f"{path}.runtimes[{index}]", "runtime invalido")
        if isinstance(initial_runtime, str) and initial_runtime not in runtimes:
            validation_error(errors, f"{path}.initial_runtime", "runtime inicial deve estar em runtimes")


def validate_gbastudio_project_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "manifesto de projeto deve ser objeto JSON")
        return errors

    validate_positive_schema_version(errors, payload)
    backend = require_key(errors, payload, "backend", str)
    if backend is not None and backend != "gbastudio_engine":
        validation_error(errors, "$.backend", "valor esperado: gbastudio_engine")
    kind = require_key(errors, payload, "kind", str)
    if kind is not None and kind not in PROJECT_KIND_VALUES:
        validation_error(errors, "$.kind", "valor esperado: topdown, platformer, isometric ou mixed")
    require_key(errors, payload, "entry", str)
    require_key(errors, payload, "project_data", str)
    validate_unique_string_array(errors, payload, "generated_assets")
    requires = require_key(errors, payload, "requires", dict)
    if isinstance(requires, dict):
        validate_requires_object(errors, payload, "$.requires")
    validate_build_object(errors, payload, "$.build")
    validate_runtime_dispatch_object(errors, payload)
    if "asset_pack_report" in payload and not isinstance(payload.get("asset_pack_report"), str):
        validation_error(errors, "$.asset_pack_report", "asset_pack_report deve ser string")
    asset_count = payload.get("asset_count")
    if asset_count is not None and (isinstance(asset_count, bool) or not isinstance(asset_count, int) or asset_count < 0):
        validation_error(errors, "$.asset_count", "asset_count deve ser inteiro >= 0")
    return errors


def validate_public_schema_catalog_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "catalogo de schemas deve ser objeto JSON")
        return errors

    require_key(errors, payload, "ok", bool)
    require_key(errors, payload, "version", str)
    kind = require_key(errors, payload, "kind", str)
    if kind is not None and kind != "public_schema_catalog":
        validation_error(errors, "$.kind", "valor esperado: public_schema_catalog")
    require_key(errors, payload, "engine_pack", str)
    schema_count = require_key(errors, payload, "schema_count", int)
    if isinstance(schema_count, bool) or (isinstance(schema_count, int) and schema_count < 0):
        validation_error(errors, "$.schema_count", "schema_count deve ser inteiro nao negativo")

    schemas = require_key(errors, payload, "schemas", list)
    seen_schema_ids = set()
    missing_from_entries = []
    if isinstance(schemas, list):
        if isinstance(schema_count, int) and not isinstance(schema_count, bool) and schema_count != len(schemas):
            validation_error(errors, "$.schema_count", "schema_count deve bater com o tamanho de schemas")
        for index, schema in enumerate(schemas):
            schema_path = f"$.schemas[{index}]"
            if not isinstance(schema, dict):
                validation_error(errors, schema_path, "schema deve ser objeto")
                continue
            schema_id = require_key(errors, schema, "id", str, schema_path)
            if isinstance(schema_id, str):
                if schema_id in seen_schema_ids:
                    validation_error(errors, f"{schema_path}.id", "item duplicado")
                seen_schema_ids.add(schema_id)
            require_key(errors, schema, "schema_path", str, schema_path)
            require_key(errors, schema, "absolute_path", str, schema_path)
            exists = require_key(errors, schema, "exists", bool, schema_path)
            size_bytes = require_key(errors, schema, "size_bytes", None, schema_path)
            if size_bytes is not None and (isinstance(size_bytes, bool) or not isinstance(size_bytes, int) or size_bytes < 0):
                validation_error(errors, f"{schema_path}.size_bytes", "size_bytes deve ser inteiro nao negativo ou null")
            sha256 = require_key(errors, schema, "sha256", None, schema_path)
            if sha256 is not None and (not isinstance(sha256, str) or len(sha256) != 64 or any(char not in "0123456789abcdef" for char in sha256)):
                validation_error(errors, f"{schema_path}.sha256", "sha256 deve ter 64 caracteres hexadecimais em minusculas ou null")
            require_key(errors, schema, "validator", bool, schema_path)
            if exists is False and isinstance(schema_id, str):
                missing_from_entries.append(schema_id)
            if exists is True:
                if size_bytes is None:
                    validation_error(errors, f"{schema_path}.size_bytes", "size_bytes e obrigatorio quando exists e true")
                if sha256 is None:
                    validation_error(errors, f"{schema_path}.sha256", "sha256 e obrigatorio quando exists e true")

    missing_schemas = require_key(errors, payload, "missing_schemas", list)
    if isinstance(missing_schemas, list):
        validate_string_array(errors, missing_schemas, "$.missing_schemas")
        if sorted(missing_schemas) != sorted(missing_from_entries):
            validation_error(errors, "$.missing_schemas", "missing_schemas deve bater com schemas[].exists == false")

    accepted_schema_arguments = require_key(errors, payload, "accepted_schema_arguments", list)
    if isinstance(accepted_schema_arguments, list):
        validate_string_array(errors, accepted_schema_arguments, "$.accepted_schema_arguments")
        if "auto" not in accepted_schema_arguments:
            validation_error(errors, "$.accepted_schema_arguments", "auto deve estar presente")
        missing_arguments = sorted(schema_id for schema_id in seen_schema_ids if schema_id not in accepted_schema_arguments)
        if missing_arguments:
            validation_error(errors, "$.accepted_schema_arguments", "todos os schemas devem estar presentes nos argumentos aceitos")

    require_key(errors, payload, "auto_detection", bool)
    return errors


def validate_asset_pack_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "asset pack deve ser objeto JSON")
        return errors
    if "stress_profile" in payload and (not isinstance(payload.get("stress_profile"), str) or not payload.get("stress_profile")):
        validation_error(errors, "$.stress_profile", "stress_profile deve ser string nao vazia")
    resident_sets = payload.get("resident_sets")
    if resident_sets is not None:
        if not isinstance(resident_sets, list):
            validation_error(errors, "$.resident_sets", "resident_sets deve ser lista")
        else:
            seen_sets = set()
            claimed_groups = set()
            for index, resident_set in enumerate(resident_sets):
                path = f"$.resident_sets[{index}]"
                if not isinstance(resident_set, dict):
                    validation_error(errors, path, "resident_set deve ser objeto")
                    continue
                set_id = require_key(errors, resident_set, "id", str, path)
                groups = require_key(errors, resident_set, "groups", list, path)
                maximum = require_key(errors, resident_set, "max_resident_groups", int, path)
                if isinstance(set_id, str):
                    if not set_id or set_id in seen_sets:
                        validation_error(errors, f"{path}.id", "id vazio ou duplicado")
                    seen_sets.add(set_id)
                if isinstance(groups, list):
                    if not groups or any(not isinstance(group, str) or not group for group in groups) or len(set(groups)) != len(groups):
                        validation_error(errors, f"{path}.groups", "groups deve conter strings unicas")
                    overlap = [group for group in groups if group in claimed_groups]
                    if overlap:
                        validation_error(errors, f"{path}.groups", "groups nao pode pertencer a mais de um resident_set")
                    claimed_groups.update(group for group in groups if isinstance(group, str))
                    if isinstance(maximum, int) and not isinstance(maximum, bool) and (maximum < 1 or maximum > len(groups)):
                        validation_error(errors, f"{path}.max_resident_groups", "max_resident_groups fora do intervalo")
    assets = require_key(errors, payload, "assets", list)
    if not isinstance(assets, list):
        return errors

    seen_ids = set()
    for index, asset in enumerate(assets):
        asset_path = f"$.assets[{index}]"
        if not isinstance(asset, dict):
            validation_error(errors, asset_path, "asset deve ser objeto")
            continue
        name = require_key(errors, asset, "name", str, asset_path)
        if isinstance(name, str) and not name:
            validation_error(errors, f"{asset_path}.name", "name deve ser string nao vazia")
        asset_id = asset.get("id", name)
        if isinstance(asset_id, str) and asset_id:
            if asset_id in seen_ids:
                validation_error(errors, f"{asset_path}.id", "id/name duplicado no asset pack")
            seen_ids.add(asset_id)
        elif "id" in asset:
            validation_error(errors, f"{asset_path}.id", "id deve ser string nao vazia")
        kind = asset.get("kind")
        if kind is not None and kind not in ASSET_PACK_KIND_VALUES:
            validation_error(errors, f"{asset_path}.kind", "kind de asset pack invalido")
        compression_policy = asset.get("compression_policy")
        if compression_policy is not None:
            if compression_policy == "auto":
                pass
            elif not isinstance(compression_policy, dict):
                validation_error(errors, f"{asset_path}.compression_policy", "compression_policy deve ser auto ou objeto manual")
            else:
                strategy = require_key(errors, compression_policy, "strategy", str, f"{asset_path}.compression_policy")
                if strategy != "manual":
                    validation_error(errors, f"{asset_path}.compression_policy.strategy", "strategy deve ser manual")
                for component in ("tiles", "tilemap", "palette"):
                    value = require_key(errors, compression_policy, component, str, f"{asset_path}.compression_policy")
                    if value not in SCENE_RESOURCE_COMPRESSION_STRATEGIES:
                        validation_error(errors, f"{asset_path}.compression_policy.{component}", "estrategia de compressao invalida")
                        continue
                    if value == "none":
                        continue
                    if value == "rle16" and not (kind == "bg" and component == "tilemap"):
                        validation_error(errors, f"{asset_path}.compression_policy.{component}", "rle16 so pode ser usado no tilemap de bg")
                    elif component == "tilemap" and kind != "bg":
                        validation_error(errors, f"{asset_path}.compression_policy.{component}", "tilemap comprimido so e suportado por bg")
                    elif component == "tiles" and kind != "bg":
                        validation_error(errors, f"{asset_path}.compression_policy.{component}", "tiles comprimidos so sao suportados por bg")
                    elif component == "palette" and kind not in ("bg", "affine_bg", "obj", "bitmap4", "palette"):
                        validation_error(errors, f"{asset_path}.compression_policy.{component}", "paleta comprimida nao e suportada por este asset")
        if "background_bpp" in asset:
            background_bpp = asset.get("background_bpp")
            if not isinstance(background_bpp, int) or isinstance(background_bpp, bool) or background_bpp not in (4, 8):
                validation_error(errors, f"{asset_path}.background_bpp", "background_bpp deve ser 4 ou 8")
            else:
                expected_bpp = 8 if kind == "affine_bg" else 4
                if background_bpp != expected_bpp:
                    validation_error(
                        errors,
                        f"{asset_path}.background_bpp",
                        f"{kind or 'bg'} deve usar background_bpp {expected_bpp}",
                    )
        if "optional" in asset and not isinstance(asset.get("optional"), bool):
            validation_error(errors, f"{asset_path}.optional", "optional deve ser booleano")
        if "bank_group" in asset and (not isinstance(asset.get("bank_group"), str) or not asset.get("bank_group")):
            validation_error(errors, f"{asset_path}.bank_group", "bank_group deve ser string nao vazia")
        if "sprite_width" in asset and asset.get("sprite_width") != 16:
            validation_error(errors, f"{asset_path}.sprite_width", "sprite_width deve ser 16")
        if "sprite_height" in asset and asset.get("sprite_height") not in (16, 32):
            validation_error(errors, f"{asset_path}.sprite_height", "sprite_height deve ser 16 ou 32")
        for key in ("png", "audio_json", "header", "symbol"):
            if key in asset and not isinstance(asset.get(key), str):
                validation_error(errors, f"{asset_path}.{key}", f"{key} deve ser string")
        for key in ("resources", "placement"):
            if key in asset and not isinstance(asset.get(key), dict):
                validation_error(errors, f"{asset_path}.{key}", f"{key} deve ser objeto")

    capability_assets = payload.get("capability_assets")
    if capability_assets is not None:
        if not isinstance(capability_assets, list):
            validation_error(errors, "$.capability_assets", "capability_assets deve ser lista")
        else:
            seen_capability_assets = set()
            for index, item in enumerate(capability_assets):
                item_path = f"$.capability_assets[{index}]"
                if not isinstance(item, dict):
                    validation_error(errors, item_path, "capability asset deve ser objeto")
                    continue
                scene = require_key(errors, item, "scene", str, item_path)
                if isinstance(scene, str) and not scene:
                    validation_error(errors, f"{item_path}.scene", "scene deve ser string nao vazia")
                capability = require_key(errors, item, "capability", str, item_path)
                if isinstance(capability, str) and capability not in SCENE_CAPABILITY_ASSET_IDS:
                    validation_error(errors, f"{item_path}.capability", "capability asset nao pertence ao registry tatico fechado")
                references = require_key(errors, item, "references", list, item_path)
                if isinstance(references, list):
                    seen_references = set()
                    for reference_index, reference in enumerate(references):
                        reference_path = f"{item_path}.references[{reference_index}]"
                        if not isinstance(reference, str) or not reference:
                            continue
                        if reference in seen_references:
                            validation_error(errors, reference_path, "reference duplicada no capability asset")
                        seen_references.add(reference)
                        if reference.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", reference) or any(
                            part == ".." for part in re.split(r"[\\/]", reference)
                        ):
                            validation_error(errors, reference_path, "reference deve ser relativa e nao pode atravessar diretorios")
                    validate_string_array(errors, references, f"{item_path}.references")
                key = (scene, capability)
                if isinstance(scene, str) and isinstance(capability, str) and key in seen_capability_assets:
                    validation_error(errors, item_path, "capability asset duplicado para a cena")
                if isinstance(scene, str) and isinstance(capability, str):
                    seen_capability_assets.add(key)
    return errors


def validate_non_negative_int(errors, payload, key, path):
    value = require_key(errors, payload, key, int, path)
    if isinstance(value, bool) or (isinstance(value, int) and value < 0):
        validation_error(errors, f"{path}.{key}", f"{key} deve ser inteiro >= 0")
    return value


def validate_severity(errors, value, path, allowed=("ok", "warning", "error")):
    if value not in allowed:
        validation_error(errors, path, f"valor esperado: {', '.join(allowed)}")


def validate_asset_pack_report_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "asset pack report deve ser objeto JSON")
        return errors

    schema = require_key(errors, payload, "schema", int)
    if schema is not None and schema != 11:
        validation_error(errors, "$.schema", "valor esperado: 11")
    kind = require_key(errors, payload, "kind", str)
    if kind is not None and kind != "GBAStudioAssetPackReport":
        validation_error(errors, "$.kind", "valor esperado: GBAStudioAssetPackReport")
    require_key(errors, payload, "ok", bool)
    stress_profile = require_key(errors, payload, "stress_profile", str)
    if isinstance(stress_profile, str) and not stress_profile:
        validation_error(errors, "$.stress_profile", "stress_profile deve ser string nao vazia")
    validate_non_negative_int(errors, payload, "asset_count", "$")

    for key in ("budgets", "production_summary", "production_profile", "asset_reports", "pool_reports"):
        require_key(errors, payload, key, dict)
    for key in ("room_pressure_report", "template_pressure_report", "split_recommendations", "compression_candidates", "diagnostics", "errors"):
        require_key(errors, payload, key, list)
    for key in ("catalog_pressure_report", "resident_sets", "resident_pressure_report"):
        if key in payload and not isinstance(payload.get(key), list):
            validation_error(errors, f"$.{key}", f"{key} deve ser lista")

    summary = payload.get("production_summary")
    if isinstance(summary, dict):
        require_key(errors, summary, "ready_for_large_project", bool, "$.production_summary")
        for key in (
            "required_asset_count",
            "required_failed_count",
            "optional_asset_count",
            "optional_omitted_count",
            "split_recommendation_count",
            "compression_candidate_count",
            "blocking_overflow_count",
        ):
            validate_non_negative_int(errors, summary, key, "$.production_summary")

    profile = payload.get("production_profile")
    if isinstance(profile, dict):
        profile_id = require_key(errors, profile, "id", str, "$.production_profile")
        if isinstance(profile_id, str) and not profile_id:
            validation_error(errors, "$.production_profile.id", "id deve ser string nao vazia")
        profile_schema = require_key(errors, profile, "schema", int, "$.production_profile")
        if isinstance(profile_schema, bool) or (isinstance(profile_schema, int) and profile_schema < 1):
            validation_error(errors, "$.production_profile.schema", "schema deve ser inteiro >= 1")
        severity = require_key(errors, profile, "severity", str, "$.production_profile")
        if severity is not None:
            validate_severity(errors, severity, "$.production_profile.severity")
        require_key(errors, profile, "ready_for_beta_export", bool, "$.production_profile")
        require_key(errors, profile, "ready_for_primary_backend", bool, "$.production_profile")
        backend_policy = require_key(errors, profile, "backend_policy", str, "$.production_profile")
        if backend_policy is not None and backend_policy != "parallel_until_manual_promotion":
            validation_error(errors, "$.production_profile.backend_policy", "valor esperado: parallel_until_manual_promotion")
        validate_unique_string_array(errors, profile, "templates", "$.production_profile")
        require_key(errors, profile, "template_limits", dict, "$.production_profile")

        pressure_gates = require_key(errors, profile, "pressure_gates", list, "$.production_profile")
        if isinstance(pressure_gates, list):
            for index, gate in enumerate(pressure_gates):
                gate_path = f"$.production_profile.pressure_gates[{index}]"
                if not isinstance(gate, dict):
                    validation_error(errors, gate_path, "pressure gate deve ser objeto")
                    continue
                require_key(errors, gate, "scope", str, gate_path)
                require_key(errors, gate, "name", str, gate_path)
                require_key(errors, gate, "template", str, gate_path)
                gate_severity = require_key(errors, gate, "severity", str, gate_path)
                if gate_severity is not None:
                    validate_severity(errors, gate_severity, f"{gate_path}.severity")
                validate_non_negative_int(errors, gate, "risk_score", gate_path)
                require_key(errors, gate, "pressure", list, gate_path)

        ui_actions = require_key(errors, profile, "ui_actions", list, "$.production_profile")
        if isinstance(ui_actions, list):
            for index, action in enumerate(ui_actions):
                action_path = f"$.production_profile.ui_actions[{index}]"
                if not isinstance(action, dict):
                    validation_error(errors, action_path, "ui action deve ser objeto")
                    continue
                action_id = require_key(errors, action, "id", str, action_path)
                if isinstance(action_id, str) and not action_id:
                    validation_error(errors, f"{action_path}.id", "id deve ser string nao vazia")
                action_severity = require_key(errors, action, "severity", str, action_path)
                if action_severity is not None:
                    validate_severity(errors, action_severity, f"{action_path}.severity", ("info", "warning", "error"))
                require_key(errors, action, "scope", str, action_path)
                require_key(errors, action, "action", str, action_path)
        ui_action_count = validate_non_negative_int(errors, profile, "ui_action_count", "$.production_profile")
        if isinstance(ui_actions, list) and isinstance(ui_action_count, int) and not isinstance(ui_action_count, bool) and ui_action_count != len(ui_actions):
            validation_error(errors, "$.production_profile.ui_action_count", "ui_action_count deve bater com ui_actions")
        validate_unique_string_array(errors, profile, "manual_validation_required", "$.production_profile")
    return errors


SCENE_CAPABILITY_BUDGET_FIELDS = (
    "bgTiles",
    "objTiles",
    "oam",
    "paletteColors",
    "vramBytes",
    "eventBytes",
    "audioBytes",
    "dmaBytes",
    "vblankTicks",
    "cpuWorkTicks",
)

SCENE_CAPABILITY_IDS = {
    "movement",
    "dialogue",
    "quests",
    "shop",
    "battle",
    "waves",
    "score",
    "inventory",
    "camera",
    "compass",
    "map",
    "affine_background",
    "affine_obj",
    "hblank_timeline",
    "animation_state_machine",
    "metatiles",
    "plugin_sdk",
    "link_multiplayer",
    "save_ui_profile",
    "tactical_surface",
    "tactical_grid_overlay",
    "tactical_hud",
    "tactical_units",
    "tactical_props",
    "tactical_feedback",
    "tactical_audio",
}

SCENE_CAPABILITY_ASSET_IDS = {
    "tactical_surface",
    "tactical_grid_overlay",
    "tactical_hud",
    "tactical_units",
    "tactical_props",
    "tactical_feedback",
    "tactical_audio",
}

ISOMETRIC_TACTICAL_CAPABILITY_IDS = (
    "tactical_surface",
    "tactical_grid_overlay",
    "tactical_hud",
    "tactical_units",
    "tactical_props",
    "tactical_feedback",
    "tactical_audio",
)

ISOMETRIC_TACTICAL_ANIMATION_BINDINGS = (
    "idle_down", "idle_up", "idle_left", "idle_right",
    "move_down", "move_up", "move_left", "move_right",
    "attack_down", "attack_up", "attack_left", "attack_right",
    "hurt_down", "hurt_up", "hurt_left", "hurt_right",
    "defeat_down", "defeat_up", "defeat_left", "defeat_right",
)

ISOMETRIC_TACTICAL_AUDIO_CUES = (
    "cursor", "select", "cancel", "move", "attack", "hit", "turn", "victory", "defeat",
)

SCENE_PREFLIGHT_PROFILE_IDS = {
    "topdown",
    "platformer",
    "isometric",
    "dungeonCrawler",
    "racing",
    "pointAndClick",
    "shmup",
    "visualNovel",
    "menu",
    "cutscene",
    "worldMap",
    "battleRpg",
    "luta",
    "puzzle",
    "bossBattle",
    "tacticalGrid",
    "hybrid",
    "custom",
}

SCENE_PREFLIGHT_PROFILE_SCENE_TYPES = {
    "topdown": {"topdown"},
    "platformer": {"platformer"},
    "isometric": {"isometric"},
    "dungeonCrawler": {"dungeonCrawler"},
    "racing": {"racing"},
    "pointAndClick": {"pointAndClick"},
    "shmup": {"shmup"},
    "visualNovel": {"visualNovel"},
    "menu": {"menu"},
    "cutscene": {"cutscene"},
    "worldMap": {"worldMap"},
    "battleRpg": {"battleRpg"},
    "luta": {"luta"},
    "puzzle": {"custom"},
    "bossBattle": {"custom", "battleRpg", "luta", "shmup"},
    "tacticalGrid": {"custom", "isometric"},
    "hybrid": {"custom"},
    "custom": {"custom"},
}

SCENE_PREFLIGHT_STATUSES = {"ready", "review", "blocked"}

COMPLETE_STRUCTURAL_FIXTURE_REGISTRY = "gba-studio-complete-structural-fixture"
COMPLETE_STRUCTURAL_FIXTURE_ROLES = {
    "background",
    "player",
    "actors",
    "hud",
    "obstacles",
    "collision",
    "dialogue_font",
    "tileset",
    "music",
}
COMPLETE_STRUCTURAL_FIXTURE_STATUSES = {"complete", "review", "blocked"}


def validate_structural_fixture_manifest(payload, path="$.structural_fixture"):
    """Validate the non-production structural fixture metadata exported with a project."""
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, path, "structural_fixture deve ser objeto")
        return errors

    if payload.get("schema") != 1:
        validation_error(errors, f"{path}.schema", "schema esperado: 1")
    if payload.get("registry") != COMPLETE_STRUCTURAL_FIXTURE_REGISTRY:
        validation_error(errors, f"{path}.registry", "registro da fixture estrutural invalido")
    if payload.get("mode") != "structural":
        validation_error(errors, f"{path}.mode", "mode esperado: structural")
    if payload.get("source") != "canonical-template":
        validation_error(errors, f"{path}.source", "source esperado: canonical-template")
    if payload.get("production_ready") is not False:
        validation_error(errors, f"{path}.production_ready", "fixture estrutural nunca pode estar pronta para producao")

    status = require_key(errors, payload, "status", str, path)
    if isinstance(status, str) and status not in COMPLETE_STRUCTURAL_FIXTURE_STATUSES:
        validation_error(errors, f"{path}.status", "status deve ser complete, review ou blocked")

    scene_count = require_key(errors, payload, "scene_count", int, path)
    if isinstance(scene_count, bool) or (isinstance(scene_count, int) and scene_count < 0):
        validation_error(errors, f"{path}.scene_count", "scene_count deve ser inteiro >= 0")

    scenes = require_key(errors, payload, "scenes", list, path)
    if not isinstance(scenes, list):
        return errors
    if isinstance(scene_count, int) and not isinstance(scene_count, bool) and scene_count != len(scenes):
        validation_error(errors, f"{path}.scene_count", "scene_count deve bater com scenes")

    seen_names = set()
    for scene_index, scene in enumerate(scenes):
        scene_path = f"{path}.scenes[{scene_index}]"
        if not isinstance(scene, dict):
            validation_error(errors, scene_path, "cena da fixture deve ser objeto")
            continue
        for key in ("name", "scene_type", "profile_id"):
            value = require_key(errors, scene, key, str, scene_path)
            if isinstance(value, str) and not value:
                validation_error(errors, f"{scene_path}.{key}", "valor nao pode ser vazio")
        name = scene.get("name")
        if isinstance(name, str):
            if name in seen_names:
                validation_error(errors, f"{scene_path}.name", "cena duplicada")
            seen_names.add(name)

        production_status = require_key(errors, scene, "production_status", str, scene_path)
        if isinstance(production_status, str) and production_status not in SCENE_PREFLIGHT_STATUSES:
            validation_error(errors, f"{scene_path}.production_status", "production_status invalido")
        structural_status = require_key(errors, scene, "structural_status", str, scene_path)
        if isinstance(structural_status, str) and structural_status not in COMPLETE_STRUCTURAL_FIXTURE_STATUSES:
            validation_error(errors, f"{scene_path}.structural_status", "structural_status invalido")
        if scene.get("production_ready") is not False:
            validation_error(errors, f"{scene_path}.production_ready", "cenas da fixture nunca estao prontas para producao")

        placeholder_roles = scene.get("placeholder_roles")
        validate_unique_string_array(errors, scene, "placeholder_roles", scene_path)
        if isinstance(placeholder_roles, list):
            for role_index, role in enumerate(placeholder_roles):
                if isinstance(role, str) and role not in COMPLETE_STRUCTURAL_FIXTURE_ROLES:
                    validation_error(errors, f"{scene_path}.placeholder_roles[{role_index}]", "papel de placeholder desconhecido")
        validate_unique_string_array(errors, scene, "resolved_layers", scene_path)

        resolved_assets = require_key(errors, scene, "resolved_assets", list, scene_path)
        if isinstance(resolved_assets, list):
            for asset_index, asset in enumerate(resolved_assets):
                asset_path = f"{scene_path}.resolved_assets[{asset_index}]"
                if not isinstance(asset, dict):
                    validation_error(errors, asset_path, "asset resolvido deve ser objeto")
                    continue
                role = require_key(errors, asset, "role", str, asset_path)
                if isinstance(role, str) and role not in COMPLETE_STRUCTURAL_FIXTURE_ROLES:
                    validation_error(errors, f"{asset_path}.role", "papel de asset desconhecido")
                require_key(errors, asset, "reference", str, asset_path)
                require_key(errors, asset, "kind", str, asset_path)
                source = require_key(errors, asset, "source", str, asset_path)
                if isinstance(source, str) and source not in ("existing-project", "fixture-data"):
                    validation_error(errors, f"{asset_path}.source", "source deve ser existing-project ou fixture-data")
                if asset.get("production_ready") is not False:
                    validation_error(errors, f"{asset_path}.production_ready", "assets da fixture nunca estao prontos para producao")

        verification = require_key(errors, scene, "verification", dict, scene_path)
        if isinstance(verification, dict):
            validate_unique_string_array(errors, verification, "tests", f"{scene_path}.verification")
            validate_unique_string_array(errors, verification, "evidence", f"{scene_path}.verification")

        issues_list = require_key(errors, scene, "issues", list, scene_path)
        if isinstance(issues_list, list):
            for issue_index, item in enumerate(issues_list):
                issue_path = f"{scene_path}.issues[{issue_index}]"
                if not isinstance(item, dict):
                    validation_error(errors, issue_path, "issue deve ser objeto")
                    continue
                require_key(errors, item, "code", str, issue_path)
                severity = require_key(errors, item, "severity", str, issue_path)
                if isinstance(severity, str):
                    validate_severity(errors, severity, f"{issue_path}.severity", ("info", "warning", "error"))
                require_key(errors, item, "message", str, issue_path)
    return errors


def validate_scene_preflight_report(payload, path="$.preflight"):
    """Validate the scene-preflight report embedded in a capability manifest."""
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, path, "preflight deve ser objeto")
        return errors

    if payload.get("schema") != 1:
        validation_error(errors, f"{path}.schema", "schema esperado: 1")
    if payload.get("registry") != "gba-studio-scene-preflight":
        validation_error(errors, f"{path}.registry", "registro de preflight invalido")
    for key in ("sceneName", "sceneType"):
        value = require_key(errors, payload, key, str, path)
        if isinstance(value, str) and not value:
            validation_error(errors, f"{path}.{key}", "valor nao pode ser vazio")

    profile_id = require_key(errors, payload, "profileId", str, path)
    if isinstance(profile_id, str) and profile_id not in SCENE_PREFLIGHT_PROFILE_IDS:
        validation_error(errors, f"{path}.profileId", "profileId nao pertence ao catalogo fechado de preflight")
    scene_type = payload.get("sceneType")
    compatible_scene_types = SCENE_PREFLIGHT_PROFILE_SCENE_TYPES.get(profile_id)
    if isinstance(profile_id, str) and isinstance(scene_type, str) and compatible_scene_types and scene_type not in compatible_scene_types:
        validation_error(errors, f"{path}.profileId", "profileId incompativel com sceneType")

    status = require_key(errors, payload, "status", str, path)
    if isinstance(status, str) and status not in SCENE_PREFLIGHT_STATUSES:
        validation_error(errors, f"{path}.status", "status deve ser ready, review ou blocked")

    fixture = payload.get("fixture")
    if fixture is not None:
        if not isinstance(fixture, dict):
            validation_error(errors, f"{path}.fixture", "fixture deve ser objeto")
        else:
            registry = require_key(errors, fixture, "registry", str, f"{path}.fixture")
            if registry != COMPLETE_STRUCTURAL_FIXTURE_REGISTRY:
                validation_error(errors, f"{path}.fixture.registry", "registro da fixture estrutural invalido")
            mode = require_key(errors, fixture, "mode", str, f"{path}.fixture")
            if mode != "structural":
                validation_error(errors, f"{path}.fixture.mode", "mode esperado: structural")
            production_ready = require_key(errors, fixture, "productionReady", bool, f"{path}.fixture")
            if production_ready is not False:
                validation_error(errors, f"{path}.fixture.productionReady", "fixture estrutural nunca pode estar pronta para producao")

    for key in ("layers", "assets", "checklist", "issues", "editorTools", "requiredEditorTools", "enabledCapabilities"):
        require_key(errors, payload, key, list, path)

    fallback = require_key(errors, payload, "fallback", str, path)
    if isinstance(fallback, str) and not fallback:
        validation_error(errors, f"{path}.fallback", "fallback nao pode ser vazio")
    verification = require_key(errors, payload, "verification", dict, path)
    if isinstance(verification, dict):
        validate_unique_string_array(errors, verification, "tests", f"{path}.verification")
        validate_unique_string_array(errors, verification, "evidence", f"{path}.verification")

    collision = require_key(errors, payload, "collision", dict, path)
    if isinstance(collision, dict):
        independent = require_key(errors, collision, "independentOfArt", bool, f"{path}.collision")
        if independent is not True:
            validation_error(errors, f"{path}.collision.independentOfArt", "colisao deve ser declarada independente da arte")
        actual_cells = collision.get("actualCellCount")
        if actual_cells is not None and (not isinstance(actual_cells, int) or isinstance(actual_cells, bool) or actual_cells < 0):
            validation_error(errors, f"{path}.collision.actualCellCount", "actualCellCount deve ser inteiro >= 0")
        coverage = collision.get("coverage")
        if coverage is not None and (not isinstance(coverage, (int, float)) or isinstance(coverage, bool) or coverage < 0 or coverage > 1):
            validation_error(errors, f"{path}.collision.coverage", "coverage deve estar entre 0 e 1")

    budget = require_key(errors, payload, "budget", dict, path)
    safe_limit = budget.get("safeLimit") if isinstance(budget, dict) else None
    safe_limit = require_key(errors, budget, "safeLimit", dict, f"{path}.budget") if isinstance(budget, dict) else safe_limit
    if isinstance(safe_limit, dict):
        for field in SCENE_CAPABILITY_BUDGET_FIELDS:
            value = require_key(errors, safe_limit, field, int, f"{path}.budget.safeLimit")
            if isinstance(value, bool) or (isinstance(value, int) and value < 0):
                validation_error(errors, f"{path}.budget.safeLimit.{field}", "budget deve ser inteiro >= 0")

    enabled_capabilities = payload.get("enabledCapabilities")
    if enabled_capabilities is not None:
        validate_string_array(errors, enabled_capabilities, f"{path}.enabledCapabilities")
    return errors


def validate_scene_capability_manifest(payload, supported_features=None):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$.capability_manifest", "manifesto de capabilities deve ser objeto JSON")
        return errors
    if payload.get("schema") != 1:
        validation_error(errors, "$.schema", "schema esperado: 1")
    if payload.get("registry") != "gba-studio-scene-capabilities":
        validation_error(errors, "$.registry", "registro de capabilities invalido")
    scenes = require_key(errors, payload, "scenes", list)
    if not isinstance(scenes, list):
        return errors
    for scene_index, scene in enumerate(scenes):
        scene_path = f"$.scenes[{scene_index}]"
        if not isinstance(scene, dict):
            validation_error(errors, scene_path, "cena deve ser objeto")
            continue
        for key in ("name", "scene_type", "runtime_profile"):
            value = require_key(errors, scene, key, str, scene_path)
            if isinstance(value, str) and not value:
                validation_error(errors, f"{scene_path}.{key}", "valor nao pode ser vazio")

        if "preflight" in scene:
            errors.extend(validate_scene_preflight_report(scene.get("preflight"), f"{scene_path}.preflight"))

        profile_budget = require_key(errors, scene, "profile_budget", dict, scene_path)
        if isinstance(profile_budget, dict):
            for field in SCENE_CAPABILITY_BUDGET_FIELDS:
                value = require_key(errors, profile_budget, field, int, f"{scene_path}.profile_budget")
                if isinstance(value, bool) or (isinstance(value, int) and value < 0):
                    validation_error(errors, f"{scene_path}.profile_budget.{field}", "budget deve ser inteiro >= 0")

        capabilities = require_key(errors, scene, "capabilities", list, scene_path)
        require_key(errors, scene, "issues", list, scene_path)
        if not isinstance(capabilities, list):
            continue
        seen_ids = set()
        for capability_index, capability in enumerate(capabilities):
            capability_path = f"{scene_path}.capabilities[{capability_index}]"
            if not isinstance(capability, dict):
                validation_error(errors, capability_path, "capability deve ser objeto")
                continue
            capability_id = require_key(errors, capability, "id", str, capability_path)
            require_key(errors, capability, "label", str, capability_path)
            if isinstance(capability_id, str):
                if capability_id not in SCENE_CAPABILITY_IDS:
                    validation_error(errors, f"{capability_path}.id", "capability nao pertence ao registry fechado")
                if capability_id in seen_ids:
                    validation_error(errors, f"{capability_path}.id", "capability duplicada na cena")
                seen_ids.add(capability_id)

            profiles = require_key(errors, capability, "scene_profiles", list, capability_path)
            scene_type = scene.get("scene_type")
            if isinstance(profiles, list) and isinstance(scene_type, str) and scene_type not in profiles:
                validation_error(errors, f"{capability_path}.scene_profiles", "capability nao declara compatibilidade com o perfil da cena")
            status = require_key(errors, capability, "status", dict, capability_path)
            capability_enabled = False
            capability_required = False
            if isinstance(status, dict):
                available = require_key(errors, status, "available", bool, f"{capability_path}.status")
                enabled = require_key(errors, status, "enabled", bool, f"{capability_path}.status")
                required = require_key(errors, status, "required", bool, f"{capability_path}.status")
                require_key(errors, status, "verified", bool, f"{capability_path}.status")
                capability_enabled = enabled is True
                capability_required = required is True
                if required is True and enabled is not True:
                    validation_error(errors, f"{capability_path}.status.required", "capability required precisa estar enabled")
                if enabled is True and available is not True:
                    validation_error(errors, f"{capability_path}.status.available", "capability enabled precisa estar available")

            assets = require_key(errors, capability, "assets", list, capability_path)
            if isinstance(assets, list):
                for asset_index, asset in enumerate(assets):
                    asset_path = f"{capability_path}.assets[{asset_index}]"
                    if not isinstance(asset, dict):
                        validation_error(errors, asset_path, "asset requirement deve ser objeto")
                        continue
                    require_key(errors, asset, "kind", str, asset_path)
                    require_key(errors, asset, "required", bool, asset_path)
                    require_key(errors, asset, "reason", str, asset_path)
            validate_string_array(errors, capability.get("editor_tools", []), f"{capability_path}.editor_tools")
            budget = require_key(errors, capability, "budget", dict, capability_path)
            if isinstance(budget, dict):
                for field in SCENE_CAPABILITY_BUDGET_FIELDS:
                    value = require_key(errors, budget, field, int, f"{capability_path}.budget")
                    if isinstance(value, bool) or (isinstance(value, int) and value < 0):
                        validation_error(errors, f"{capability_path}.budget.{field}", "budget deve ser inteiro >= 0")
                for field in budget:
                    if field not in SCENE_CAPABILITY_BUDGET_FIELDS:
                        validation_error(errors, f"{capability_path}.budget.{field}", "campo de budget desconhecido")
            fallback = require_key(errors, capability, "fallback", str, capability_path)
            if isinstance(fallback, str) and not fallback:
                validation_error(errors, f"{capability_path}.fallback", "fallback nao pode ser vazio")
            verification = require_key(errors, capability, "verification", dict, capability_path)
            if isinstance(verification, dict):
                validate_unique_string_array(errors, verification, "tests", f"{capability_path}.verification")
                validate_unique_string_array(errors, verification, "evidence", f"{capability_path}.verification")
            require_key(errors, capability, "settings", dict, capability_path)
            engine_features = require_key(errors, capability, "engine_features", list, capability_path)
            if isinstance(engine_features, list):
                validate_string_array(errors, engine_features, f"{capability_path}.engine_features")
                if supported_features is not None and (capability_enabled or capability_required):
                    missing = [feature for feature in engine_features if isinstance(feature, str) and feature not in supported_features]
                    if missing:
                        validation_error(
                            errors,
                            f"{capability_path}.engine_features",
                            f"feature(s) nao suportada(s) pelo Engine Pack: {', '.join(missing)}",
                        )
    return errors


def validate_tactical_reference(errors, value, path):
    if not isinstance(value, str) or not value:
        validation_error(errors, path, "reference tática deve ser string nao vazia")
        return
    if value.startswith("/") or re.match(r"^[A-Za-z]:[\\/]", value) or any(
        part == ".." for part in re.split(r"[\\/]", value)
    ):
        validation_error(errors, path, "reference tática deve ser relativa e nao pode atravessar diretorios")


def validate_tactical_uint8(errors, value, path, expected=None):
    if not isinstance(value, int) or isinstance(value, bool) or value < 0 or value > 255:
        validation_error(errors, path, "indice tático deve ser inteiro entre 0 e 255")
        return
    if expected is not None and value != expected:
        validation_error(errors, path, f"indice tático esperado: {expected}")


def validate_tactical_asset_field(errors, payload, key, path):
    value = require_key(errors, payload, key, str, path)
    if isinstance(value, str):
        if not value:
            validation_error(errors, f"{path}.{key}", "asset tático deve ser string nao vazia")
        else:
            validate_tactical_reference(errors, value, f"{path}.{key}")
    return value


def validate_isometric_tactical_presentation(payload, path="$.tactical_presentation"):
    """Validate the explicit tactical presentation emitted for an isometric room."""
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, path, "tactical_presentation deve ser objeto")
        return errors

    if payload.get("schema") != 1:
        validation_error(errors, f"{path}.schema", "schema esperado: 1")

    capabilities = require_key(errors, payload, "capabilities", list, path)
    enabled = set()
    if isinstance(capabilities, list):
        seen_capabilities = set()
        for index, capability in enumerate(capabilities):
            capability_path = f"{path}.capabilities[{index}]"
            if not isinstance(capability, str) or not capability:
                validation_error(errors, capability_path, "capability tática deve ser string nao vazia")
                continue
            if capability not in ISOMETRIC_TACTICAL_CAPABILITY_IDS:
                validation_error(errors, capability_path, "capability tática nao pertence ao registry fechado")
            if capability in seen_capabilities:
                validation_error(errors, capability_path, "capability tática duplicada")
            seen_capabilities.add(capability)
            enabled.add(capability)

    layers = require_key(errors, payload, "layers", dict, path)
    if isinstance(layers, dict):
        expected_layers = {
            "surface": "BG2",
            "grid": "BG1",
            "hud": "BG0",
            "objects": "OBJ",
            "collision": "scene_data",
        }
        for key in layers:
            if key not in expected_layers:
                validation_error(errors, f"{path}.layers.{key}", "camada tática desconhecida")
        for key, expected in expected_layers.items():
            if key in layers and layers.get(key) != expected:
                validation_error(errors, f"{path}.layers.{key}", f"camada esperada: {expected}")
        collision = require_key(errors, layers, "collision", str, f"{path}.layers")
        if collision is not None and collision != "scene_data":
            validation_error(errors, f"{path}.layers.collision", "colisao tática deve permanecer em scene_data")

    assets = require_key(errors, payload, "assets", list, path)
    if isinstance(assets, list):
        seen_asset_ids = set()
        for index, asset in enumerate(assets):
            asset_path = f"{path}.assets[{index}]"
            if not isinstance(asset, dict):
                validation_error(errors, asset_path, "asset tático deve ser objeto")
                continue
            asset_id = require_key(errors, asset, "id", str, asset_path)
            reference = require_key(errors, asset, "reference", str, asset_path)
            consumer = require_key(errors, asset, "consumer", str, asset_path)
            require_key(errors, asset, "required", bool, asset_path)
            if isinstance(asset_id, str):
                if not asset_id:
                    validation_error(errors, f"{asset_path}.id", "id nao pode ser vazio")
                if asset_id in seen_asset_ids:
                    validation_error(errors, f"{asset_path}.id", "id de asset tático duplicado")
                seen_asset_ids.add(asset_id)
            if isinstance(reference, str):
                validate_tactical_reference(errors, reference, f"{asset_path}.reference")
            if consumer not in ("bg", "obj", "ui", "audio"):
                validation_error(errors, f"{asset_path}.consumer", "consumer tático invalido")
            status = asset.get("status")
            if status is not None and status not in (
                "candidate", "palette-prepared", "pack-validated", "scene-verified", "approved", "attention", "impossible"
            ):
                validation_error(errors, f"{asset_path}.status", "status de asset tático invalido")

    if "tactical_surface" in enabled:
        surface_pages = payload.get("surface_pages")
        if surface_pages is None:
            validate_tactical_asset_field(errors, payload, "surface_asset", path)
        else:
            if not isinstance(surface_pages, list) or not surface_pages:
                validation_error(errors, f"{path}.surface_pages", "surface_pages deve ser lista nao vazia")
            else:
                page_groups = []
                page_ids = set()
                for index, page in enumerate(surface_pages):
                    page_path = f"{path}.surface_pages[{index}]"
                    if not isinstance(page, dict):
                        validation_error(errors, page_path, "pagina deve ser objeto")
                        continue
                    page_id = require_key(errors, page, "id", str, page_path)
                    asset = require_key(errors, page, "asset", str, page_path)
                    group = require_key(errors, page, "bank_group", str, page_path)
                    world = require_key(errors, page, "world", dict, page_path)
                    if isinstance(page_id, str):
                        if not page_id or page_id in page_ids:
                            validation_error(errors, f"{page_path}.id", "id de pagina vazio ou duplicado")
                        page_ids.add(page_id)
                    if isinstance(asset, str):
                        validate_tactical_reference(errors, asset, f"{page_path}.asset")
                    if isinstance(group, str):
                        if not group or group in page_groups:
                            validation_error(errors, f"{page_path}.bank_group", "bank_group vazio ou duplicado")
                        page_groups.append(group)
                    if isinstance(world, dict):
                        for field in ("x", "y", "width", "height"):
                            value = require_key(errors, world, field, int, f"{page_path}.world")
                            if isinstance(value, bool) or (field in ("width", "height") and isinstance(value, int) and value < 1):
                                validation_error(errors, f"{page_path}.world.{field}", "retangulo de pagina invalido")
                residency = require_key(errors, payload, "surface_residency", dict, path)
                if isinstance(residency, dict):
                    exclusive = require_key(errors, residency, "exclusive_bank_groups", list, f"{path}.surface_residency")
                    maximum = require_key(errors, residency, "max_resident_groups", int, f"{path}.surface_residency")
                    margin = require_key(errors, residency, "prefetch_margin_pixels", int, f"{path}.surface_residency")
                    if isinstance(exclusive, list) and (len(exclusive) != len(set(exclusive)) or set(exclusive) != set(page_groups)):
                        validation_error(errors, f"{path}.surface_residency.exclusive_bank_groups", "grupos exclusivos devem corresponder as paginas")
                    if isinstance(maximum, int) and not isinstance(maximum, bool) and (maximum < 1 or maximum > len(page_groups)):
                        validation_error(errors, f"{path}.surface_residency.max_resident_groups", "max_resident_groups fora do intervalo")
                    if not isinstance(margin, int) or isinstance(margin, bool) or margin < 0:
                        validation_error(errors, f"{path}.surface_residency.prefetch_margin_pixels", "margem deve ser inteira nao negativa")
        if isinstance(layers, dict) and layers.get("surface") != "BG2":
            validation_error(errors, f"{path}.layers.surface", "tactical_surface exige surface em BG2")
    if "tactical_grid_overlay" in enabled:
        validate_tactical_asset_field(errors, payload, "grid_asset", path)
        if isinstance(layers, dict) and layers.get("grid") != "BG1":
            validation_error(errors, f"{path}.layers.grid", "tactical_grid_overlay exige grid em BG1")
    if "tactical_hud" in enabled:
        validate_tactical_asset_field(errors, payload, "hud_layout", path)
        if isinstance(layers, dict) and layers.get("hud") != "BG0":
            validation_error(errors, f"{path}.layers.hud", "tactical_hud exige HUD em BG0")

    units = require_key(errors, payload, "units", list, path)
    if isinstance(units, list):
        for index, unit in enumerate(units):
            unit_path = f"{path}.units[{index}]"
            if not isinstance(unit, dict):
                validation_error(errors, unit_path, "unidade tática deve ser objeto")
                continue
            actor_id = require_key(errors, unit, "actor_id", str, unit_path)
            sheet = require_key(errors, unit, "sheet", str, unit_path)
            if isinstance(actor_id, str) and not actor_id:
                validation_error(errors, f"{unit_path}.actor_id", "actor_id nao pode ser vazio")
            if isinstance(sheet, str):
                validate_tactical_reference(errors, sheet, f"{unit_path}.sheet")
            animations = unit.get("animations")
            if animations is not None and not isinstance(animations, dict):
                validation_error(errors, f"{unit_path}.animations", "animations deve ser objeto")
            if isinstance(animations, dict):
                for animation_name, animation in animations.items():
                    animation_path = f"{unit_path}.animations.{animation_name}"
                    if animation_name not in ISOMETRIC_TACTICAL_ANIMATION_BINDINGS:
                        validation_error(errors, animation_path, "estado/direcao de animacao tática desconhecido")
                    validate_tactical_reference(errors, animation, animation_path)
                if "tactical_units" in enabled:
                    for animation_name in ISOMETRIC_TACTICAL_ANIMATION_BINDINGS:
                        if animation_name not in animations:
                            validation_error(errors, f"{unit_path}.animations.{animation_name}", "animacao tática obrigatoria ausente")
            elif "tactical_units" in enabled:
                validation_error(errors, f"{unit_path}.animations", "tactical_units exige animations completas")
        if "tactical_units" in enabled:
            if len(units) == 0:
                validation_error(errors, f"{path}.units", "tactical_units exige ao menos uma unidade")
            if isinstance(layers, dict) and layers.get("objects") != "OBJ":
                validation_error(errors, f"{path}.layers.objects", "tactical_units exige objetos em OBJ")

    props = require_key(errors, payload, "props", list, path)
    if isinstance(props, list):
        seen_prop_ids = set()
        for index, prop in enumerate(props):
            prop_path = f"{path}.props[{index}]"
            if not isinstance(prop, dict):
                validation_error(errors, prop_path, "prop tático deve ser objeto")
                continue
            prop_id = require_key(errors, prop, "id", str, prop_path)
            asset = require_key(errors, prop, "asset", str, prop_path)
            kind = require_key(errors, prop, "kind", str, prop_path)
            if isinstance(prop_id, str):
                if not prop_id:
                    validation_error(errors, f"{prop_path}.id", "id de prop nao pode ser vazio")
                if prop_id in seen_prop_ids:
                    validation_error(errors, f"{prop_path}.id", "id de prop duplicado")
                seen_prop_ids.add(prop_id)
            if isinstance(asset, str):
                validate_tactical_reference(errors, asset, f"{prop_path}.asset")
            if kind not in ("objective", "cover", "elevation"):
                validation_error(errors, f"{prop_path}.kind", "kind de prop tático invalido")
            tile = prop.get("tile")
            if tile is not None:
                if not isinstance(tile, dict):
                    validation_error(errors, f"{prop_path}.tile", "tile de prop deve ser objeto")
                else:
                    for coordinate in ("x", "y", "z"):
                        value = require_key(errors, tile, coordinate, int, f"{prop_path}.tile")
                        if isinstance(value, bool) or (isinstance(value, int) and value < 0):
                            validation_error(errors, f"{prop_path}.tile.{coordinate}", "coordenada de prop deve ser inteiro >= 0")
            if "animated" in prop and not isinstance(prop.get("animated"), bool):
                validation_error(errors, f"{prop_path}.animated", "animated deve ser booleano")
        if "tactical_props" in enabled:
            if len(props) == 0:
                validation_error(errors, f"{path}.props", "tactical_props exige ao menos um prop")
            if isinstance(layers, dict) and layers.get("objects") != "OBJ":
                validation_error(errors, f"{path}.layers.objects", "tactical_props exige objetos em OBJ")

    if "tactical_feedback" in enabled:
        for key in ("cursor_asset", "range_asset", "target_asset", "emotes", "feedback"):
            if key in ("emotes", "feedback"):
                continue
            validate_tactical_asset_field(errors, payload, key, path)
        for key in ("emotes", "feedback"):
            marker_path = f"{path}.{key}"
            marker = require_key(errors, payload, key, dict, path)
            if isinstance(marker, dict):
                asset = require_key(errors, marker, "asset", str, marker_path)
                index = require_key(errors, marker, "index", int, marker_path)
                if isinstance(asset, str):
                    validate_tactical_reference(errors, asset, f"{marker_path}.asset")
                validate_tactical_uint8(errors, index, f"{marker_path}.index")
        if isinstance(layers, dict) and layers.get("objects") != "OBJ":
            validation_error(errors, f"{path}.layers.objects", "tactical_feedback exige objetos em OBJ")

    indices = require_key(errors, payload, "indices", dict, path)
    if isinstance(indices, dict):
        props_indices = require_key(errors, indices, "props", list, f"{path}.indices")
        if isinstance(props_indices, list):
            seen_index_ids = set()
            for index, item in enumerate(props_indices):
                item_path = f"{path}.indices.props[{index}]"
                if not isinstance(item, dict):
                    validation_error(errors, item_path, "indice de prop deve ser objeto")
                    continue
                item_id = require_key(errors, item, "id", str, item_path)
                item_index = require_key(errors, item, "index", int, item_path)
                if isinstance(item_id, str) and item_id in seen_index_ids:
                    validation_error(errors, f"{item_path}.id", "id de indice de prop duplicado")
                if isinstance(item_id, str):
                    seen_index_ids.add(item_id)
                validate_tactical_uint8(errors, item_index, f"{item_path}.index")

        if "tactical_feedback" in enabled:
            markers = require_key(errors, indices, "markers", dict, f"{path}.indices")
            if isinstance(markers, dict):
                marker_values = []
                for marker_name, expected in (("cursor", 0), ("range", 1), ("target", 2)):
                    marker_index = require_key(errors, markers, marker_name, int, f"{path}.indices.markers")
                    validate_tactical_uint8(errors, marker_index, f"{path}.indices.markers.{marker_name}", expected)
                    if isinstance(marker_index, int) and not isinstance(marker_index, bool):
                        marker_values.append(marker_index)
                if len(marker_values) != len(set(marker_values)):
                    validation_error(errors, f"{path}.indices.markers", "indices de marcador tático devem ser distintos")

    if "tactical_audio" in enabled:
        audio = require_key(errors, payload, "audio", dict, path)
        if isinstance(audio, dict):
            audio_format = require_key(errors, audio, "format", str, f"{path}.audio")
            if isinstance(audio_format, str) and audio_format != "COMPOSED":
                validation_error(errors, f"{path}.audio.format", "audio tático deve usar format COMPOSED")
            validate_tactical_asset_field(errors, audio, "music", f"{path}.audio")
            cues = require_key(errors, audio, "cues", dict, f"{path}.audio")
            cue_indices = require_key(errors, audio, "cue_indices", dict, f"{path}.audio")
            if isinstance(cues, dict):
                for cue in ISOMETRIC_TACTICAL_AUDIO_CUES:
                    cue_value = require_key(errors, cues, cue, str, f"{path}.audio.cues")
                    if isinstance(cue_value, str):
                        validate_tactical_reference(errors, cue_value, f"{path}.audio.cues.{cue}")
                for cue in cues:
                    if cue not in ISOMETRIC_TACTICAL_AUDIO_CUES:
                        validation_error(errors, f"{path}.audio.cues.{cue}", "cue de áudio tático desconhecido")
            if isinstance(cue_indices, dict):
                for cue_index, cue in enumerate(ISOMETRIC_TACTICAL_AUDIO_CUES):
                    value = require_key(errors, cue_indices, cue, int, f"{path}.audio.cue_indices")
                    validate_tactical_uint8(errors, value, f"{path}.audio.cue_indices.{cue}", cue_index)
                for cue in cue_indices:
                    if cue not in ISOMETRIC_TACTICAL_AUDIO_CUES:
                        validation_error(errors, f"{path}.audio.cue_indices.{cue}", "indice de cue tático desconhecido")

        if not isinstance(indices, dict):
            pass
        else:
            audio_indices = require_key(errors, indices, "audio_cues", dict, f"{path}.indices")
            if isinstance(audio_indices, dict):
                for cue_index, cue in enumerate(ISOMETRIC_TACTICAL_AUDIO_CUES):
                    value = require_key(errors, audio_indices, cue, int, f"{path}.indices.audio_cues")
                    validate_tactical_uint8(errors, value, f"{path}.indices.audio_cues.{cue}", cue_index)
                for cue in audio_indices:
                    if cue not in ISOMETRIC_TACTICAL_AUDIO_CUES:
                        validation_error(errors, f"{path}.indices.audio_cues.{cue}", "indice de cue tático desconhecido")

    return errors


def validate_isometric_project_contract(payload, path="$.isometric_project"):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, path, "isometric_project deve ser objeto")
        return errors
    rooms = require_key(errors, payload, "rooms", list, path)
    if not isinstance(rooms, list):
        return errors
    for index, room in enumerate(rooms):
        room_path = f"{path}.rooms[{index}]"
        if not isinstance(room, dict):
            validation_error(errors, room_path, "sala isométrica deve ser objeto")
            continue
        presentation = room.get("tactical_presentation")
        if presentation is None:
            continue
        errors.extend(validate_isometric_tactical_presentation(presentation, f"{room_path}.tactical_presentation"))
        grid = room.get("grid")
        if isinstance(grid, dict) and grid.get("gameplay_mode") != "tactical":
            validation_error(errors, f"{room_path}.grid.gameplay_mode", "tactical_presentation exige gameplay_mode tactical")
    return errors


def validate_shmup_project_contract(payload, path="$.shmup_project"):
    """Validate the explicit SHMUP plane contract used by the native runtime."""
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, path, "shmup_project deve ser objeto")
        return errors

    backgrounds = payload.get("backgrounds")
    if backgrounds is None:
        return errors
    if not isinstance(backgrounds, list):
        validation_error(errors, f"{path}.backgrounds", "backgrounds deve ser lista")
        return errors

    for index, background in enumerate(backgrounds):
        background_path = f"{path}.backgrounds[{index}]"
        if not isinstance(background, dict):
            validation_error(errors, background_path, "background deve ser objeto")
            continue
        require_key(errors, background, "name", str, background_path)
        width = require_key(errors, background, "width_tiles", int, background_path)
        height = require_key(errors, background, "height_tiles", int, background_path)
        layers = require_key(errors, background, "layers", list, background_path)
        if isinstance(width, int) and (isinstance(width, bool) or width <= 0):
            validation_error(errors, f"{background_path}.width_tiles", "width_tiles deve ser inteiro positivo")
        if isinstance(height, int) and (isinstance(height, bool) or height <= 0):
            validation_error(errors, f"{background_path}.height_tiles", "height_tiles deve ser inteiro positivo")

        video = background.get("video")
        affine_declared = isinstance(video, dict) and isinstance(video.get("affine"), dict)
        display_mode = video.get("display_mode") if isinstance(video, dict) else None
        if video is not None and not isinstance(video, dict):
            validation_error(errors, f"{background_path}.video", "video deve ser objeto")
        if isinstance(video, dict) and display_mode is not None and (
            not isinstance(display_mode, int) or isinstance(display_mode, bool) or display_mode < 0 or display_mode > 5
        ):
            validation_error(errors, f"{background_path}.video.display_mode", "display_mode deve estar entre 0 e 5")
        if affine_declared and display_mode not in (1, 2):
            validation_error(errors, f"{background_path}.video.display_mode", "video Affine exige display_mode 1 ou 2")
        affine_enabled = affine_declared and display_mode in (1, 2)

        if affine_enabled:
            if width != 90 or height != 20:
                validation_error(
                    errors,
                    f"{background_path}.width_tiles",
                    "background Affine SHMUP exige mundo lógico 90x20 tiles (720x160 pixels)",
                )
            affine = video.get("affine")
            if not isinstance(affine.get("asset"), str) or not affine.get("asset"):
                validation_error(errors, f"{background_path}.video.affine.asset", "asset Affine deve ser string nao vazia")
            if affine.get("layer", "BG2") not in ("BG2", "BG3", "bg2", "bg3"):
                validation_error(errors, f"{background_path}.video.affine.layer", "camada Affine deve ser BG2 ou BG3")
            if display_mode == 1 and affine.get("layer", "BG2") not in ("BG2", "bg2"):
                validation_error(errors, f"{background_path}.video.affine.layer", "Mode 1 do SHMUP exige BG2 Affine")
        elif isinstance(layers, list) and len(layers) == 0:
            validation_error(errors, f"{background_path}.layers", "layers nao pode ser vazia sem video Affine")

        if isinstance(layers, list):
            for layer_index, layer in enumerate(layers):
                layer_path = f"{background_path}.layers[{layer_index}]"
                if not isinstance(layer, dict):
                    validation_error(errors, layer_path, "layer deve ser objeto")
                    continue
                layer_id = layer.get("layer", "bg2")
                if affine_enabled and layer_id in ("BG2", "bg2"):
                    validation_error(errors, f"{layer_path}.layer", "BG2 regular nao pode coexistir com o BG2 Affine ativo")
                tilemap = layer.get("tilemap", layer.get("tilemap_asset"))
                if not isinstance(tilemap, str) or not tilemap:
                    validation_error(errors, f"{layer_path}.tilemap", "tilemap deve ser string nao vazia")

        collision_fields = {key for key in ("collision_flags", "collision_width_tiles", "collision_height_tiles") if key in background}
        if collision_fields and collision_fields != {"collision_flags", "collision_width_tiles", "collision_height_tiles"}:
            validation_error(
                errors,
                f"{background_path}.collision_flags",
                "collision_flags precisa declarar dimensoes correspondentes",
            )
        collision_flags = background.get("collision_flags")
        collision_width = background.get("collision_width_tiles")
        collision_height = background.get("collision_height_tiles")
        if collision_flags is not None:
            if not isinstance(collision_flags, list):
                validation_error(errors, f"{background_path}.collision_flags", "collision_flags deve ser lista")
            else:
                for flag_index, flag in enumerate(collision_flags):
                    if not isinstance(flag, int) or isinstance(flag, bool) or flag < 0 or flag > 255:
                        validation_error(errors, f"{background_path}.collision_flags[{flag_index}]", "flag de colisao deve estar entre 0 e 255")
                if (
                    isinstance(collision_width, int) and not isinstance(collision_width, bool)
                    and isinstance(collision_height, int) and not isinstance(collision_height, bool)
                    and collision_width > 0 and collision_height > 0
                    and len(collision_flags) != collision_width * collision_height
                ):
                    validation_error(errors, f"{background_path}.collision_flags", "collision_flags precisa corresponder às dimensoes declaradas")
        for key in ("collision_width_tiles", "collision_height_tiles"):
            value = background.get(key)
            if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value <= 0):
                validation_error(errors, f"{background_path}.{key}", f"{key} deve ser inteiro positivo")

        world_fields = {key for key in ("world_width_pixels", "world_height_pixels") if key in background}
        if world_fields and world_fields != {"world_width_pixels", "world_height_pixels"}:
            validation_error(errors, f"{background_path}.world_width_pixels", "world precisa declarar largura e altura")
        for key in ("world_width_pixels", "world_height_pixels"):
            value = background.get(key)
            if value is not None and (not isinstance(value, int) or isinstance(value, bool) or value <= 0):
                validation_error(errors, f"{background_path}.{key}", f"{key} deve ser inteiro positivo")
        if affine_enabled and (
            background.get("world_width_pixels") != 720 or background.get("world_height_pixels") != 160
        ):
            validation_error(errors, f"{background_path}.world_width_pixels", "background Affine deve declarar mundo 720x160 pixels")
    return errors


SCENE_COMPOSITION_MODES = ("tilemap", "affine", "bitmap3", "bitmap4", "bitmap5")
SCENE_COMPOSITION_LAYER_KINDS = ("regular_bg", "affine_bg", "bitmap")
SCENE_COMPOSITION_ROLES = ("gameplay", "decorative")
SCENE_COMPOSITION_LAYERS = ("BG0", "BG1", "BG2", "BG3", "BITMAP")
SCENE_COMPOSITION_TARGETS = ("BG0", "BG1", "BG2", "BG3", "OBJ", "BACKDROP")
SCENE_RESOURCE_KINDS = (
    "regular_bg",
    "affine_bg",
    "bitmap3",
    "bitmap4",
    "bitmap5",
    "obj",
    "palette",
    "audio",
    "hblank_table",
)
SCENE_RESOURCE_COMPRESSION_STRATEGIES = ("none", "rle16", "lz77", "huffman")


def validate_scene_resource_compression(errors, compression, kind, path):
    if isinstance(compression, str):
        if compression not in ("auto",) + SCENE_RESOURCE_COMPRESSION_STRATEGIES:
            validation_error(errors, path, "compression invalida")
        elif compression == "rle16" and kind != "regular_bg":
            validation_error(errors, path, "rle16 so pode ser usado no tilemap de regular_bg")
        return
    if not isinstance(compression, dict):
        validation_error(errors, path, "compression deve ser auto ou objeto manual")
        return
    strategy = require_key(errors, compression, "strategy", str, path)
    if strategy == "auto":
        for component in ("tiles", "tilemap", "palette"):
            value = compression.get(component, "auto")
            if value != "auto":
                validation_error(errors, f"{path}.{component}", "componente deve ser auto quando strategy=auto")
        return
    if strategy != "manual":
        validation_error(errors, f"{path}.strategy", "strategy deve ser auto ou manual")
        return
    for component in ("tiles", "tilemap", "palette"):
        value = require_key(errors, compression, component, str, path)
        if value not in SCENE_RESOURCE_COMPRESSION_STRATEGIES:
            validation_error(errors, f"{path}.{component}", "estrategia de compressao invalida")
            continue
        if value == "none":
            continue
        if value == "rle16" and not (kind == "regular_bg" and component == "tilemap"):
            validation_error(errors, f"{path}.{component}", "rle16 so pode ser usado no tilemap de regular_bg")
        elif component == "tilemap" and kind != "regular_bg":
            validation_error(errors, f"{path}.{component}", "tilemap comprimido so e suportado por regular_bg")
        elif component == "tiles" and kind != "regular_bg":
            validation_error(errors, f"{path}.{component}", "tiles comprimidos so sao suportados por regular_bg")
        elif component == "palette" and kind not in ("regular_bg", "affine_bg", "bitmap4", "obj", "palette"):
            validation_error(errors, f"{path}.{component}", "paleta comprimida nao e suportada por este recurso")


def validate_scene_physical_budget(errors, payload, path):
    budget = require_key(errors, payload, "budget", dict, path)
    if not isinstance(budget, dict):
        return
    for field in SCENE_CAPABILITY_BUDGET_FIELDS:
        value = require_key(errors, budget, field, int, f"{path}.budget")
        if isinstance(value, bool) or (isinstance(value, int) and value < 0):
            validation_error(errors, f"{path}.budget.{field}", "budget deve ser inteiro >= 0")
    for field in budget:
        if field not in SCENE_CAPABILITY_BUDGET_FIELDS:
            validation_error(errors, f"{path}.budget.{field}", "campo de budget desconhecido")


def validate_scene_target_list(errors, value, path):
    if not isinstance(value, list):
        validation_error(errors, path, "alvos devem ser uma lista")
        return
    seen = set()
    for index, target in enumerate(value):
        target_path = f"{path}[{index}]"
        if target not in SCENE_COMPOSITION_TARGETS:
            validation_error(errors, target_path, "alvo de composição invalido")
        if target in seen:
            validation_error(errors, target_path, "alvo de composição duplicado")
        seen.add(target)


def validate_scene_composition_window(errors, value, path):
    if not isinstance(value, dict):
        validation_error(errors, path, "window deve ser objeto")
        return
    for key in ("enabled", "left", "right", "top", "bottom", "insideTargets", "outsideTargets"):
        require_key(errors, value, key, None, path)
    enabled = value.get("enabled")
    if not isinstance(enabled, bool):
        validation_error(errors, f"{path}.enabled", "enabled deve ser booleano")
    for key, maximum in (("left", 240), ("right", 240), ("top", 160), ("bottom", 160)):
        coordinate = value.get(key)
        if not isinstance(coordinate, int) or isinstance(coordinate, bool) or coordinate < 0 or coordinate > maximum:
            validation_error(errors, f"{path}.{key}", f"{key} deve ser inteiro entre 0 e {maximum}")
    validate_scene_target_list(errors, value.get("insideTargets"), f"{path}.insideTargets")
    validate_scene_target_list(errors, value.get("outsideTargets"), f"{path}.outsideTargets")
    if enabled is True and (
        not isinstance(value.get("left"), int)
        or not isinstance(value.get("right"), int)
        or not isinstance(value.get("top"), int)
        or not isinstance(value.get("bottom"), int)
        or value.get("left", 0) >= value.get("right", 0)
        or value.get("top", 0) >= value.get("bottom", 0)
        or not value.get("insideTargets")
    ):
        validation_error(errors, path, "window habilitada precisa de retangulo valido e alvos internos")


def validate_scene_composition_contract(payload, path="$.composition"):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, path, "composicao deve ser objeto")
        return errors
    schema = require_key(errors, payload, "schema", int, path)
    if schema is not None and schema != 1:
        validation_error(errors, f"{path}.schema", "schema esperado: 1")
    enabled = require_key(errors, payload, "enabled", bool, path)
    mode = require_key(errors, payload, "mode", str, path)
    display_mode = require_key(errors, payload, "display_mode", int, path)
    default_tiled = require_key(errors, payload, "default_tiled", bool, path)
    fallback = require_key(errors, payload, "fallback", str, path)
    layers = require_key(errors, payload, "layers", list, path)
    effects = require_key(errors, payload, "effects", dict, path)
    validate_scene_physical_budget(errors, payload, path)

    if isinstance(mode, str) and mode not in SCENE_COMPOSITION_MODES:
        validation_error(errors, f"{path}.mode", "modo de composição invalido")
    if isinstance(display_mode, int) and (isinstance(display_mode, bool) or display_mode < 0 or display_mode > 5):
        validation_error(errors, f"{path}.display_mode", "display_mode deve estar entre 0 e 5")
    if mode == "tilemap" and display_mode != 0:
        validation_error(errors, f"{path}.display_mode", "tilemap deve usar display_mode 0")
    if mode == "bitmap3" and display_mode != 3:
        validation_error(errors, f"{path}.display_mode", "bitmap3 deve usar display_mode 3")
    if mode == "bitmap4" and display_mode != 4:
        validation_error(errors, f"{path}.display_mode", "bitmap4 deve usar display_mode 4")
    if mode == "bitmap5" and display_mode != 5:
        validation_error(errors, f"{path}.display_mode", "bitmap5 deve usar display_mode 5")
    if enabled is False and default_tiled is not True:
        validation_error(errors, f"{path}.default_tiled", "composição desabilitada deve permanecer tiled por padrão")
    if mode == "tilemap" and default_tiled is not True:
        validation_error(errors, f"{path}.default_tiled", "modo tilemap deve declarar default_tiled=true")
    if isinstance(fallback, str) and fallback not in ("error", "tiled_default", "omit_decorative"):
        validation_error(errors, f"{path}.fallback", "fallback de composição invalido")

    if isinstance(layers, list):
        seen_ids = set()
        seen_physical_layers = set()
        for index, layer in enumerate(layers):
            layer_path = f"{path}.layers[{index}]"
            if not isinstance(layer, dict):
                validation_error(errors, layer_path, "camada deve ser objeto")
                continue
            layer_id = require_key(errors, layer, "id", str, layer_path)
            kind = require_key(errors, layer, "kind", str, layer_path)
            role = require_key(errors, layer, "role", str, layer_path)
            physical_layer = require_key(errors, layer, "layer", str, layer_path)
            asset = require_key(errors, layer, "asset", None, layer_path)
            priority = require_key(errors, layer, "priority", int, layer_path)
            for key in ("parallax_x256", "parallax_y256", "scroll_x", "scroll_y", "bitmap_page"):
                require_key(errors, layer, key, int, layer_path)
            require_key(errors, layer, "affine", None, layer_path)
            if isinstance(layer_id, str):
                if not layer_id:
                    validation_error(errors, f"{layer_path}.id", "id nao pode ser vazio")
                if layer_id in seen_ids:
                    validation_error(errors, f"{layer_path}.id", "camada duplicada")
                seen_ids.add(layer_id)
            if kind not in SCENE_COMPOSITION_LAYER_KINDS:
                validation_error(errors, f"{layer_path}.kind", "kind de camada invalido")
            if role not in SCENE_COMPOSITION_ROLES:
                validation_error(errors, f"{layer_path}.role", "role de camada invalido")
            if physical_layer not in SCENE_COMPOSITION_LAYERS:
                validation_error(errors, f"{layer_path}.layer", "camada física invalida")
            elif physical_layer != "BITMAP":
                if physical_layer in seen_physical_layers:
                    validation_error(errors, f"{layer_path}.layer", "camada física duplicada")
                seen_physical_layers.add(physical_layer)
            if asset is not None and (not isinstance(asset, str) or not asset):
                validation_error(errors, f"{layer_path}.asset", "asset deve ser string nao vazia ou null")
            if isinstance(priority, int) and (isinstance(priority, bool) or priority < 0 or priority > 3):
                validation_error(errors, f"{layer_path}.priority", "priority deve estar entre 0 e 3")
            for key, minimum, maximum in (
                ("parallax_x256", -1024, 1024),
                ("parallax_y256", -1024, 1024),
                ("scroll_x", -32768, 32767),
                ("scroll_y", -32768, 32767),
                ("bitmap_page", 0, 1),
            ):
                number = layer.get(key)
                if not isinstance(number, int) or isinstance(number, bool) or number < minimum or number > maximum:
                    validation_error(errors, f"{layer_path}.{key}", f"{key} fora do intervalo seguro")
            if mode == "tilemap" and (kind != "regular_bg" or physical_layer == "BITMAP"):
                validation_error(errors, f"{layer_path}.kind", "tilemap aceita apenas regular_bg em uma camada BG")
            if mode == "affine" and not (kind == "regular_bg" or (kind == "affine_bg" and physical_layer in ("BG2", "BG3"))):
                validation_error(errors, f"{layer_path}.kind", "modo affine aceita regular_bg ou affine_bg em BG2/BG3")
            if mode in ("bitmap3", "bitmap4", "bitmap5") and (kind != "bitmap" or physical_layer != "BITMAP"):
                validation_error(errors, f"{layer_path}.kind", "modo bitmap aceita apenas a camada BITMAP")
            if kind != "regular_bg" and role == "gameplay":
                validation_error(errors, f"{layer_path}.role", "camada não regular deve ser decorativa")
            if kind == "affine_bg" and physical_layer not in ("BG2", "BG3"):
                validation_error(errors, f"{layer_path}.layer", "affine_bg só pode usar BG2 ou BG3")
            if kind == "bitmap" and physical_layer != "BITMAP":
                validation_error(errors, f"{layer_path}.layer", "bitmap deve usar BITMAP")
            affine = layer.get("affine")
            if affine is not None:
                if not isinstance(affine, dict):
                    validation_error(errors, f"{layer_path}.affine", "affine deve ser objeto ou null")
                else:
                    for key in ("rotation_degrees", "scale_x", "scale_y", "pivot_x", "pivot_y", "wrap"):
                        require_key(errors, affine, key, None, f"{layer_path}.affine")
                    if not isinstance(affine.get("wrap"), bool):
                        validation_error(errors, f"{layer_path}.affine.wrap", "wrap deve ser booleano")

    if isinstance(effects, dict):
        blend = require_key(errors, effects, "blend", dict, f"{path}.effects")
        mosaic = require_key(errors, effects, "mosaic", dict, f"{path}.effects")
        window0 = require_key(errors, effects, "window0", dict, f"{path}.effects")
        window1 = require_key(errors, effects, "window1", dict, f"{path}.effects")
        hblank = require_key(errors, effects, "hblank", dict, f"{path}.effects")
        if isinstance(blend, dict):
            for key in ("enabled", "mode", "first_targets", "second_targets", "eva", "evb", "intensity"):
                require_key(errors, blend, key, None, f"{path}.effects.blend")
            if not isinstance(blend.get("enabled"), bool):
                validation_error(errors, f"{path}.effects.blend.enabled", "enabled deve ser booleano")
            if blend.get("mode") not in ("none", "alpha", "brighten", "darken"):
                validation_error(errors, f"{path}.effects.blend.mode", "modo de blending invalido")
            validate_scene_target_list(errors, blend.get("first_targets"), f"{path}.effects.blend.first_targets")
            validate_scene_target_list(errors, blend.get("second_targets"), f"{path}.effects.blend.second_targets")
            for key in ("eva", "evb", "intensity"):
                number = blend.get(key)
                if not isinstance(number, int) or isinstance(number, bool) or number < 0 or number > 16:
                    validation_error(errors, f"{path}.effects.blend.{key}", f"{key} deve estar entre 0 e 16")
            if blend.get("enabled") is True and (blend.get("mode") == "none" or not blend.get("first_targets")):
                validation_error(errors, f"{path}.effects.blend", "blending habilitado precisa de modo e alvos")
        if isinstance(mosaic, dict):
            for key in ("enabled", "bgX", "bgY", "objX", "objY"):
                require_key(errors, mosaic, key, None, f"{path}.effects.mosaic")
            if not isinstance(mosaic.get("enabled"), bool):
                validation_error(errors, f"{path}.effects.mosaic.enabled", "enabled deve ser booleano")
            for key in ("bgX", "bgY", "objX", "objY"):
                number = mosaic.get(key)
                if not isinstance(number, int) or isinstance(number, bool) or number < 0 or number > 15:
                    validation_error(errors, f"{path}.effects.mosaic.{key}", f"{key} deve estar entre 0 e 15")
        if isinstance(window0, dict):
            validate_scene_composition_window(errors, window0, f"{path}.effects.window0")
        if isinstance(window1, dict):
            validate_scene_composition_window(errors, window1, f"{path}.effects.window1")
        if isinstance(hblank, dict):
            for key in ("enabled", "layer", "hdma", "scroll_offsets"):
                require_key(errors, hblank, key, None, f"{path}.effects.hblank")
            if hblank.get("layer") not in ("BG1", "BG2", "BG3"):
                validation_error(errors, f"{path}.effects.hblank.layer", "layer de HBlank invalida")
            if not isinstance(hblank.get("enabled"), bool) or not isinstance(hblank.get("hdma"), bool):
                validation_error(errors, f"{path}.effects.hblank", "enabled e hdma devem ser booleanos")
            offsets = hblank.get("scroll_offsets")
            if not isinstance(offsets, list):
                validation_error(errors, f"{path}.effects.hblank.scroll_offsets", "scroll_offsets deve ser lista")
            else:
                if len(offsets) > 160:
                    validation_error(errors, f"{path}.effects.hblank.scroll_offsets", "scroll_offsets nao pode exceder 160 entradas")
                for index, offset in enumerate(offsets):
                    if not isinstance(offset, int) or isinstance(offset, bool) or offset < -32768 or offset > 32767:
                        validation_error(errors, f"{path}.effects.hblank.scroll_offsets[{index}]", "offset de HBlank fora do intervalo")
                if hblank.get("enabled") is True and (hblank.get("hdma") is not True or len(offsets) != 160):
                    validation_error(errors, f"{path}.effects.hblank", "HBlank habilitado precisa de hdma=true e 160 offsets")
            if "timeline" in hblank:
                timeline = hblank.get("timeline")
                if not isinstance(timeline, list):
                    validation_error(errors, f"{path}.effects.hblank.timeline", "timeline deve ser lista")
                else:
                    if timeline and (hblank.get("enabled") is not True or hblank.get("hdma") is not True):
                        validation_error(errors, f"{path}.effects.hblank.timeline", "timeline exige HBlank e HDMA habilitados")
                    previous_frame = -1
                    for index, keyframe in enumerate(timeline):
                        keyframe_path = f"{path}.effects.hblank.timeline[{index}]"
                        if not isinstance(keyframe, dict):
                            validation_error(errors, keyframe_path, "keyframe deve ser objeto")
                            continue
                        frame = require_key(errors, keyframe, "frame", int, keyframe_path)
                        keyframe_offsets = require_key(errors, keyframe, "scroll_offsets", list, keyframe_path)
                        if isinstance(frame, int) and not isinstance(frame, bool):
                            if frame < 0 or frame > 65535:
                                validation_error(errors, f"{keyframe_path}.frame", "frame fora do intervalo 0..65535")
                            if frame <= previous_frame:
                                validation_error(errors, f"{keyframe_path}.frame", "frames da timeline devem estar em ordem crescente")
                            previous_frame = frame
                        if isinstance(keyframe_offsets, list):
                            if len(keyframe_offsets) != 160:
                                validation_error(errors, f"{keyframe_path}.scroll_offsets", "keyframe deve conter exatamente 160 offsets")
                            for offset_index, offset in enumerate(keyframe_offsets):
                                if not isinstance(offset, int) or isinstance(offset, bool) or offset < -32768 or offset > 32767:
                                    validation_error(errors, f"{keyframe_path}.scroll_offsets[{offset_index}]", "offset fora do intervalo")
    return errors


def validate_scene_resource_manifest_contract(payload, path="$.resources"):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, path, "manifesto de recursos deve ser objeto")
        return errors
    schema = require_key(errors, payload, "schema", int, path)
    if schema is not None and schema != 1:
        validation_error(errors, f"{path}.schema", "schema esperado: 1")
    resources = require_key(errors, payload, "resources", list, path)
    dependencies = require_key(errors, payload, "dependencies", list, path)
    if isinstance(dependencies, list):
        validate_string_array(errors, dependencies, f"{path}.dependencies")
    if not isinstance(resources, list):
        return errors
    seen_ids = set()
    for index, resource in enumerate(resources):
        resource_path = f"{path}.resources[{index}]"
        if not isinstance(resource, dict):
            validation_error(errors, resource_path, "recurso deve ser objeto")
            continue
        resource_id = require_key(errors, resource, "id", str, resource_path)
        asset = require_key(errors, resource, "asset", str, resource_path)
        kind = require_key(errors, resource, "kind", str, resource_path)
        enabled = require_key(errors, resource, "enabled", bool, resource_path)
        required = require_key(errors, resource, "required", bool, resource_path)
        bpp = require_key(errors, resource, "bpp", int, resource_path)
        palette = require_key(errors, resource, "palette", dict, resource_path)
        compression = require_key(errors, resource, "compression", None, resource_path)
        tile_limit = require_key(errors, resource, "tile_limit", int, resource_path)
        resource_group = require_key(errors, resource, "resource_group", str, resource_path)
        prefetch = require_key(errors, resource, "prefetch", str, resource_path)
        cache = require_key(errors, resource, "cache", str, resource_path)
        eviction_priority = require_key(errors, resource, "eviction_priority", int, resource_path)
        resource_dependencies = require_key(errors, resource, "dependencies", list, resource_path)
        fallback = require_key(errors, resource, "fallback", dict, resource_path)
        if isinstance(resource_id, str):
            if not resource_id:
                validation_error(errors, f"{resource_path}.id", "id nao pode ser vazio")
            if resource_id in seen_ids:
                validation_error(errors, f"{resource_path}.id", "recurso duplicado")
            seen_ids.add(resource_id)
        if isinstance(asset, str) and not asset:
            validation_error(errors, f"{resource_path}.asset", "asset nao pode ser vazio")
        if kind not in SCENE_RESOURCE_KINDS:
            validation_error(errors, f"{resource_path}.kind", "kind de recurso invalido")
        if not isinstance(enabled, bool) or not isinstance(required, bool):
            validation_error(errors, resource_path, "enabled e required devem ser booleanos")
        if bpp not in (4, 8, 15):
            validation_error(errors, f"{resource_path}.bpp", "bpp deve ser 4, 8 ou 15")
        elif kind == "affine_bg" and bpp != 8:
            validation_error(errors, f"{resource_path}.bpp", "affine_bg deve usar 8bpp")
        elif kind in ("bitmap3", "bitmap5") and bpp != 15:
            validation_error(errors, f"{resource_path}.bpp", f"{kind} deve usar 15bpp")
        if isinstance(palette, dict):
            for key in ("id", "slot", "colors"):
                require_key(errors, palette, key, None, f"{resource_path}.palette")
            if palette.get("slot") not in ("background", "objects", "none"):
                validation_error(errors, f"{resource_path}.palette.slot", "slot de paleta invalido")
            colors = palette.get("colors")
            if not isinstance(colors, int) or isinstance(colors, bool) or colors < 0 or colors > 256:
                validation_error(errors, f"{resource_path}.palette.colors", "colors deve estar entre 0 e 256")
        validate_scene_resource_compression(errors, compression, kind, f"{resource_path}.compression")
        if tile_limit is not None and (isinstance(tile_limit, bool) or tile_limit < 0 or tile_limit > 1024):
            validation_error(errors, f"{resource_path}.tile_limit", "tile_limit fora do intervalo")
        if kind in ("regular_bg", "affine_bg", "obj") and isinstance(tile_limit, int):
            maximum = 256 if kind == "affine_bg" else 1024
            if tile_limit < 1 or tile_limit > maximum:
                validation_error(errors, f"{resource_path}.tile_limit", f"tile_limit deve estar entre 1 e {maximum}")
        if not isinstance(resource_group, str) or not resource_group:
            validation_error(errors, f"{resource_path}.resource_group", "resource_group nao pode ser vazio")
        if prefetch not in ("none", "scene", "camera", "manual"):
            validation_error(errors, f"{resource_path}.prefetch", "prefetch invalido")
        if cache not in ("resident", "evictable"):
            validation_error(errors, f"{resource_path}.cache", "cache invalido")
        if isinstance(eviction_priority, int) and (isinstance(eviction_priority, bool) or eviction_priority < 0 or eviction_priority > 255):
            validation_error(errors, f"{resource_path}.eviction_priority", "eviction_priority deve estar entre 0 e 255")
        if isinstance(resource_dependencies, list):
            validate_string_array(errors, resource_dependencies, f"{resource_path}.dependencies")
        if isinstance(fallback, dict):
            mode = require_key(errors, fallback, "mode", str, f"{resource_path}.fallback")
            if mode not in ("error", "omit_decorative", "tiled_default"):
                validation_error(errors, f"{resource_path}.fallback.mode", "fallback invalido")
        validate_scene_physical_budget(errors, resource, resource_path)
    return errors


def validate_scene_metatile_authoring_contract(payload, path="$.metatiles"):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, path, "autoria de metatiles deve ser objeto")
        return errors
    for key in (
        "schema",
        "enabled",
        "contract",
        "fallback",
        "block_width",
        "block_height",
        "logical_width",
        "logical_height",
        "library",
        "map",
        "physical",
        "export_cost",
    ):
        require_key(errors, payload, key, None, path)
    if payload.get("schema") != 1:
        validation_error(errors, f"{path}.schema", "schema esperado: 1")
    if payload.get("enabled") is not True:
        validation_error(errors, f"{path}.enabled", "autoria de metatiles exportada deve estar habilitada")
    if payload.get("contract") != "gba-authored-metatile-2x2-v1":
        validation_error(errors, f"{path}.contract", "contrato de metatile invalido")
    if payload.get("fallback") not in ("error", "tiled_default"):
        validation_error(errors, f"{path}.fallback", "fallback de metatile invalido")
    for key in ("block_width", "block_height"):
        if payload.get(key) != 2:
            validation_error(errors, f"{path}.{key}", f"{key} deve ser 2 para o contrato 2x2")
    logical_width = payload.get("logical_width")
    logical_height = payload.get("logical_height")
    if not isinstance(logical_width, int) or isinstance(logical_width, bool) or logical_width < 1:
        validation_error(errors, f"{path}.logical_width", "logical_width deve ser inteiro >= 1")
    if not isinstance(logical_height, int) or isinstance(logical_height, bool) or logical_height < 1:
        validation_error(errors, f"{path}.logical_height", "logical_height deve ser inteiro >= 1")

    library = payload.get("library")
    library_count = len(library) if isinstance(library, list) else 0
    if not isinstance(library, list) or not library:
        validation_error(errors, f"{path}.library", "library de metatiles nao pode ser vazia")
    seen_ids = set()
    if isinstance(library, list):
        for index, definition in enumerate(library):
            definition_path = f"{path}.library[{index}]"
            if not isinstance(definition, dict):
                validation_error(errors, definition_path, "metatile deve ser objeto")
                continue
            definition_id = require_key(errors, definition, "id", str, definition_path)
            require_key(errors, definition, "label", str, definition_path)
            tiles = require_key(errors, definition, "tiles", list, definition_path)
            semantic = require_key(errors, definition, "semantic", dict, definition_path)
            if isinstance(definition_id, str):
                if definition_id in seen_ids:
                    validation_error(errors, f"{definition_path}.id", "metatile duplicado")
                seen_ids.add(definition_id)
            if isinstance(tiles, list):
                if len(tiles) != 4:
                    validation_error(errors, f"{definition_path}.tiles", "metatile deve conter quatro tiles")
                for tile_index, tile in enumerate(tiles):
                    if not isinstance(tile, int) or isinstance(tile, bool) or tile < 0 or tile > 1023:
                        validation_error(errors, f"{definition_path}.tiles[{tile_index}]", "tile BG fora do intervalo 0..1023")
            if isinstance(semantic, dict):
                for key in ("collision", "terrain", "damage", "speed_percent", "animation", "on_enter_event", "step_sound", "tags"):
                    require_key(errors, semantic, key, None, f"{definition_path}.semantic")
                if not isinstance(semantic.get("collision"), str) or not semantic.get("collision"):
                    validation_error(errors, f"{definition_path}.semantic.collision", "collision deve ser string nao vazia")
                for key, minimum, maximum in (("damage", 0, 255), ("speed_percent", 0, 200)):
                    number = semantic.get(key)
                    if not isinstance(number, int) or isinstance(number, bool) or number < minimum or number > maximum:
                        validation_error(errors, f"{definition_path}.semantic.{key}", f"{key} fora do intervalo seguro")
                if not isinstance(semantic.get("tags"), list):
                    validation_error(errors, f"{definition_path}.semantic.tags", "tags deve ser lista")

    metatile_map = payload.get("map")
    expected_map_length = logical_width * logical_height if isinstance(logical_width, int) and isinstance(logical_height, int) else None
    if not isinstance(metatile_map, list):
        validation_error(errors, f"{path}.map", "map deve ser lista")
    elif expected_map_length is not None:
        if len(metatile_map) != expected_map_length:
            validation_error(errors, f"{path}.map", "map deve bater com logical_width * logical_height")
        for index, map_index in enumerate(metatile_map):
            if not isinstance(map_index, int) or isinstance(map_index, bool) or map_index < 0 or map_index >= library_count:
                validation_error(errors, f"{path}.map[{index}]", "indice de metatile fora da biblioteca")

    physical = payload.get("physical")
    if not isinstance(physical, dict):
        validation_error(errors, f"{path}.physical", "physical deve ser objeto")
    else:
        for key in ("width_tiles", "height_tiles", "visual_tiles", "collision_types"):
            require_key(errors, physical, key, None, f"{path}.physical")
        expected_width = logical_width * 2 if isinstance(logical_width, int) else None
        expected_height = logical_height * 2 if isinstance(logical_height, int) else None
        if expected_width is not None and physical.get("width_tiles") != expected_width:
            validation_error(errors, f"{path}.physical.width_tiles", "width_tiles deve ser logical_width * 2")
        if expected_height is not None and physical.get("height_tiles") != expected_height:
            validation_error(errors, f"{path}.physical.height_tiles", "height_tiles deve ser logical_height * 2")
        physical_count = expected_width * expected_height if expected_width is not None and expected_height is not None else None
        for key in ("visual_tiles", "collision_types"):
            values = physical.get(key)
            if not isinstance(values, list):
                validation_error(errors, f"{path}.physical.{key}", f"{key} deve ser lista")
            elif physical_count is not None and len(values) != physical_count:
                validation_error(errors, f"{path}.physical.{key}", f"{key} deve conter os tiles físicos expandidos")

    export_cost = payload.get("export_cost")
    if not isinstance(export_cost, dict):
        validation_error(errors, f"{path}.export_cost", "export_cost deve ser objeto")
    else:
        for field in SCENE_CAPABILITY_BUDGET_FIELDS:
            value = require_key(errors, export_cost, field, int, f"{path}.export_cost")
            if isinstance(value, bool) or (isinstance(value, int) and value < 0):
                validation_error(errors, f"{path}.export_cost.{field}", "budget deve ser inteiro >= 0")
        for field in export_cost:
            if field not in SCENE_CAPABILITY_BUDGET_FIELDS:
                validation_error(errors, f"{path}.export_cost.{field}", "campo de budget desconhecido")
    return errors


def validate_scene_contracts(payload, path="$.scene_contracts"):
    errors = []
    if not isinstance(payload, list):
        validation_error(errors, path, "scene_contracts deve ser lista")
        return errors
    seen_names = set()
    for index, scene in enumerate(payload):
        scene_path = f"{path}[{index}]"
        if not isinstance(scene, dict):
            validation_error(errors, scene_path, "contrato de cena deve ser objeto")
            continue
        name = require_key(errors, scene, "name", str, scene_path)
        require_key(errors, scene, "scene_type", str, scene_path)
        require_key(errors, scene, "runtime_profile", str, scene_path)
        composition = require_key(errors, scene, "composition", dict, scene_path)
        resources = require_key(errors, scene, "resources", dict, scene_path)
        if isinstance(name, str):
            if not name:
                validation_error(errors, f"{scene_path}.name", "name nao pode ser vazio")
            if name in seen_names:
                validation_error(errors, f"{scene_path}.name", "cena duplicada")
            seen_names.add(name)
        if isinstance(composition, dict):
            errors.extend(validate_scene_composition_contract(composition, f"{scene_path}.composition"))
        if isinstance(resources, dict):
            errors.extend(validate_scene_resource_manifest_contract(resources, f"{scene_path}.resources"))
        if "metatiles" in scene:
            errors.extend(validate_scene_metatile_authoring_contract(scene.get("metatiles"), f"{scene_path}.metatiles"))
    return errors


def validate_export_project_payload(payload):
    errors = []
    if not isinstance(payload, dict):
        validation_error(errors, "$", "entrada de export deve ser objeto JSON")
        return errors

    validate_positive_schema_version(errors, payload)
    backend = require_key(errors, payload, "backend", str)
    if backend is not None and backend != "gbastudio_engine":
        validation_error(errors, "$.backend", "valor esperado: gbastudio_engine")
    kind = require_key(errors, payload, "kind", str)
    if kind is not None and kind not in EXPORT_KIND_VALUES:
        validation_error(errors, "$.kind", "kind de export invalido")
    require_key(errors, payload, "template_dir", str)
    require_key(errors, payload, "entry", str)
    require_key(errors, payload, "project_data", str)
    validate_unique_string_array(errors, payload, "generated_assets")
    capability_manifest = require_key(errors, payload, "capability_manifest", dict)
    if isinstance(capability_manifest, dict):
        supported_features = None
        for feature in payload.get("requires", {}).get("features", []) if isinstance(payload.get("requires"), dict) else []:
            if isinstance(feature, str):
                supported_features = (supported_features or set()) | {feature}
        for error_item in validate_scene_capability_manifest(capability_manifest, supported_features):
            validation_error(errors, f"$.capability_manifest{error_item['path'][1:]}", error_item["message"])
    if "scene_contracts" in payload:
        errors.extend(validate_scene_contracts(payload.get("scene_contracts")))
    if "isometric_project" in payload:
        errors.extend(validate_isometric_project_contract(payload.get("isometric_project")))
    if "structural_fixture" in payload:
        errors.extend(validate_structural_fixture_manifest(payload.get("structural_fixture")))
    validate_build_object(errors, payload, "$.build")
    validate_runtime_dispatch_object(errors, payload)
    validate_requires_object(errors, payload, "$.requires")

    runtime_profile = payload.get("runtime_profile")
    if runtime_profile is not None:
        if isinstance(runtime_profile, str):
            if runtime_profile not in EXPORT_KIND_VALUES:
                validation_error(errors, "$.runtime_profile", "runtime_profile invalido")
        elif isinstance(runtime_profile, dict):
            profile_kind = require_key(errors, runtime_profile, "kind", str, "$.runtime_profile")
            if profile_kind is not None and profile_kind not in EXPORT_KIND_VALUES:
                validation_error(errors, "$.runtime_profile.kind", "runtime_profile.kind invalido")
            base_runtime = runtime_profile.get("base_runtime")
            if base_runtime is not None and base_runtime not in (
                "topdown",
                "platformer",
                "isometric",
                "dungeon_crawler",
                "racing",
                "battle_rpg",
                "luta",
                "point_click",
                "visual_novel",
                "menu",
                "cutscene",
                "world_map",
            ):
                validation_error(errors, "$.runtime_profile.base_runtime", "base_runtime invalido")
        else:
            validation_error(errors, "$.runtime_profile", "runtime_profile deve ser string ou objeto")

    if "asset_pack" in payload:
        for error_item in validate_asset_pack_payload(payload.get("asset_pack")):
            validation_error(errors, f"$.asset_pack{error_item['path'][1:]}", error_item["message"])

    project_blocks = [
        "topdown_project",
        "platformer_project",
        "isometric_project",
        "dungeon_crawler_project",
        "racing_project",
        "battle_rpg_project",
        "luta_project",
        "point_click_project",
        "shmup_project",
        "visual_novel_project",
        "menu_project",
        "cutscene_project",
        "world_map_project",
    ]
    for block in project_blocks:
        if block in payload and not isinstance(payload.get(block), dict):
            validation_error(errors, f"$.{block}", f"{block} deve ser objeto")
    if isinstance(payload.get("shmup_project"), dict):
        errors.extend(validate_shmup_project_contract(payload.get("shmup_project")))
    return errors


PUBLIC_SCHEMA_VALIDATORS = {
    "gbastudio_project": ("schemas/gbastudio_project.schema.json", validate_gbastudio_project_payload),
    "asset_pack": ("schemas/asset_pack.schema.json", validate_asset_pack_payload),
    "asset_pack_report": ("schemas/asset_pack_report.schema.json", validate_asset_pack_report_payload),
    "export_project": ("schemas/export_project.schema.json", validate_export_project_payload),
    "readiness_evidence": ("schemas/readiness_evidence.schema.json", validate_readiness_evidence_payload),
    "readiness_report": ("schemas/readiness_report.schema.json", validate_readiness_report_payload),
    "promotion_bundle": ("schemas/promotion_bundle.schema.json", validate_promotion_bundle_payload),
    "promotion_bundle_validation": ("schemas/promotion_bundle_validation.schema.json", validate_promotion_bundle_validation_payload),
    "promotion_summary": ("schemas/promotion_summary.schema.json", validate_promotion_summary_payload),
    "public_schema_catalog": ("schemas/public_schema_catalog.schema.json", validate_public_schema_catalog_payload),
}


def default_engine_pack_root():
    script_path = Path(__file__).resolve()
    if script_path.parent.name == "tools":
        return script_path.parent.parent
    if script_path.parent.parent.name == "tools":
        return script_path.parent.parent.parent
    return Path.cwd()


def public_schema_catalog(engine_pack_path=None):
    engine_pack = absolute_path(engine_pack_path) if engine_pack_path else default_engine_pack_root()
    schemas = []
    for schema_id, validator_entry in sorted(PUBLIC_SCHEMA_VALIDATORS.items()):
        schema_path, _validator = validator_entry
        absolute_schema_path = engine_pack / schema_path
        exists = absolute_schema_path.exists()
        size_bytes = None
        sha256 = None
        if exists and absolute_schema_path.is_file():
            data = absolute_schema_path.read_bytes()
            size_bytes = len(data)
            sha256 = hashlib.sha256(data).hexdigest()
        schemas.append({
            "id": schema_id,
            "schema_path": schema_path,
            "absolute_path": str(absolute_schema_path),
            "exists": exists,
            "size_bytes": size_bytes,
            "sha256": sha256,
            "validator": True,
        })
    return {
        "ok": all(schema["exists"] for schema in schemas),
        "version": VERSION,
        "kind": "public_schema_catalog",
        "engine_pack": str(engine_pack),
        "schema_count": len(schemas),
        "schemas": schemas,
        "missing_schemas": [schema["id"] for schema in schemas if not schema["exists"]],
        "accepted_schema_arguments": ["auto"] + [schema["id"] for schema in schemas],
        "auto_detection": True,
    }


def infer_public_schema_key(payload):
    if not isinstance(payload, dict):
        return None
    kind = payload.get("kind")
    if kind == "butano_replacement_readiness":
        return "readiness_report"
    if kind == "promotion_bundle":
        return "promotion_bundle"
    if kind == "promotion_bundle_validation":
        return "promotion_bundle_validation"
    if kind == "promotion_summary":
        return "promotion_summary"
    if kind == "public_schema_catalog":
        return "public_schema_catalog"
    if kind == "GBAStudioAssetPackReport":
        return "asset_pack_report"
    if payload.get("backend") == "gbastudio_engine":
        if "template_dir" in payload:
            return "export_project"
        return "gbastudio_project"
    if "assets" in payload and isinstance(payload.get("assets"), list):
        return "asset_pack"
    if all(gate in payload for gate in READINESS_EVIDENCE_GATES):
        return "readiness_evidence"
    return None


def validate_public_schema_document(schema_key, document_path):
    document = absolute_path(document_path)
    errors = []
    payload, error = load_json_file(document)
    resolved_schema = schema_key
    if error is None and schema_key == "auto":
        resolved_schema = infer_public_schema_key(payload)
        if resolved_schema is None:
            validation_error(errors, "$.schema", "nao foi possivel detectar o schema publico pelo documento")

    validator_entry = PUBLIC_SCHEMA_VALIDATORS.get(resolved_schema)
    if validator_entry is None:
        validation_error(errors, "$.schema", f"schema publico desconhecido: {schema_key}")
        return {
            "ok": False,
            "version": VERSION,
            "kind": "public_schema_validation",
            "schema": schema_key,
            "detected_schema": resolved_schema if resolved_schema != schema_key else None,
            "schema_path": None,
            "document_path": str(document),
            "errors": errors,
        }

    schema_path, validator = validator_entry
    if error is not None:
        validation_error(errors, "$", error)
    else:
        errors.extend(validator(payload))
    return {
        "ok": not errors,
        "version": VERSION,
        "kind": "public_schema_validation",
        "schema": resolved_schema,
        "requested_schema": schema_key,
        "detected_schema": resolved_schema if schema_key == "auto" else None,
        "schema_path": schema_path,
        "document_path": str(document),
        "errors": errors,
    }


def verify_public_schema_catalog_document(catalog_path, engine_pack_path=None):
    document = absolute_path(catalog_path)
    payload, error = load_json_file(document)
    errors = []
    if error is not None:
        validation_error(errors, "$", error)
        payload = {}
    else:
        errors.extend(validate_public_schema_catalog_payload(payload))

    current_catalog = public_schema_catalog(engine_pack_path)
    if isinstance(payload, dict):
        if payload.get("schema_count") != current_catalog["schema_count"]:
            validation_error(
                errors,
                "$.schema_count",
                f"schema_count esperado {current_catalog['schema_count']}, encontrado {payload.get('schema_count')}",
            )
        if payload.get("accepted_schema_arguments") != current_catalog["accepted_schema_arguments"]:
            validation_error(errors, "$.accepted_schema_arguments", "argumentos aceitos diferem do Engine Pack atual")
        if sorted(payload.get("missing_schemas", [])) != sorted(current_catalog["missing_schemas"]):
            validation_error(errors, "$.missing_schemas", "lista de schemas ausentes difere do Engine Pack atual")

        current_by_id = {schema["id"]: schema for schema in current_catalog["schemas"]}
        archived_schemas = payload.get("schemas", [])
        archived_by_id = {}
        if isinstance(archived_schemas, list):
            for index, schema in enumerate(archived_schemas):
                if not isinstance(schema, dict):
                    continue
                schema_id = schema.get("id")
                if not isinstance(schema_id, str):
                    continue
                if schema_id in archived_by_id:
                    validation_error(errors, f"$.schemas[{index}].id", f"schema duplicado: {schema_id}")
                    continue
                archived_by_id[schema_id] = (index, schema)

        for schema_id, current in current_by_id.items():
            archived_entry = archived_by_id.get(schema_id)
            if archived_entry is None:
                validation_error(errors, "$.schemas", f"schema ausente no catalogo arquivado: {schema_id}")
                continue
            index, archived = archived_entry
            for key in ("schema_path", "exists", "size_bytes", "sha256", "validator"):
                if archived.get(key) != current.get(key):
                    validation_error(
                        errors,
                        f"$.schemas[{index}].{key}",
                        f"{schema_id}: esperado {current.get(key)}, encontrado {archived.get(key)}",
                    )

        for schema_id, (index, _schema) in archived_by_id.items():
            if schema_id not in current_by_id:
                validation_error(errors, f"$.schemas[{index}].id", f"schema desconhecido no catalogo arquivado: {schema_id}")

    return {
        "ok": not errors,
        "version": VERSION,
        "kind": "public_schema_catalog_verification",
        "catalog_path": str(document),
        "engine_pack": current_catalog["engine_pack"],
        "schema_count": current_catalog["schema_count"],
        "missing_schemas": current_catalog["missing_schemas"],
        "errors": errors,
    }


def main():
    parser = argparse.ArgumentParser(description="Validate a GBAStudio Engine Pack and local build environment")
    parser.add_argument("--engine-pack", default=os.environ.get("GBS_ENGINE_PACK"))
    parser.add_argument("--project-dir", default=os.environ.get("GBS_PROJECT_DIR"))
    parser.add_argument("--devkitpro", default=os.environ.get("DEVKITPRO"))
    parser.add_argument("--devkitarm", default=os.environ.get("DEVKITARM"))
    parser.add_argument("--make", default=os.environ.get("MAKE", "make"))
    parser.add_argument("--readiness-evidence", default=os.environ.get("GBS_READINESS_EVIDENCE"))
    parser.add_argument("--print-readiness-evidence-template", action="store_true")
    parser.add_argument("--write-readiness-evidence-template")
    parser.add_argument("--update-readiness-evidence")
    parser.add_argument("--merge-readiness-evidence")
    parser.add_argument("--readiness-evidence-input", action="append", default=[])
    parser.add_argument("--readiness-gate")
    parser.add_argument("--readiness-gate-ok", default="true")
    parser.add_argument("--readiness-gate-source")
    parser.add_argument("--readiness-gate-checked-at")
    parser.add_argument("--readiness-gate-message")
    parser.add_argument("--readiness-gate-evidence-type")
    parser.add_argument("--readiness-gate-review-environment")
    parser.add_argument("--readiness-gate-validated-platform", action="append", default=[])
    parser.add_argument("--readiness-only", action="store_true")
    parser.add_argument("--write-readiness-report")
    parser.add_argument("--validate-readiness-report")
    parser.add_argument("--write-promotion-bundle")
    parser.add_argument("--validate-promotion-bundle")
    parser.add_argument("--validate-public-schema")
    parser.add_argument("--schema-document")
    parser.add_argument("--list-public-schemas", action="store_true")
    parser.add_argument("--write-public-schema-catalog")
    parser.add_argument("--verify-public-schema-catalog")
    parser.add_argument("--require-primary-ready", action="store_true")
    parser.add_argument("--skip-toolchain", action="store_true")
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--version", action="store_true")
    args = parser.parse_args()

    if args.version:
        print(VERSION)
        return 0
    if args.list_public_schemas:
        result = public_schema_catalog(args.engine_pack)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            status = "OK" if result["ok"] else "FAIL"
            print(f"public schema catalog: {status}")
            print(f"engine_pack: {result['engine_pack']}")
            for schema in result["schemas"]:
                marker = "OK" if schema["exists"] else "MISSING"
                print(f"- {schema['id']}: {schema['schema_path']} [{marker}]")
        return 0 if result["ok"] else 2
    if args.write_public_schema_catalog:
        catalog = public_schema_catalog(args.engine_pack)
        output_path = write_json_file(args.write_public_schema_catalog, catalog)
        if args.json:
            print(json.dumps({
                "ok": catalog["ok"],
                "version": VERSION,
                "kind": "public_schema_catalog_write",
                "path": str(output_path),
                "schema_count": catalog["schema_count"],
                "missing_schemas": catalog["missing_schemas"],
            }, indent=2))
        else:
            print(f"public schema catalog criado: {output_path}")
            if catalog["missing_schemas"]:
                print("missing_schemas:")
                for schema in catalog["missing_schemas"]:
                    print(f"- {schema}")
        return 0 if catalog["ok"] else 2
    if args.verify_public_schema_catalog:
        result = verify_public_schema_catalog_document(args.verify_public_schema_catalog, args.engine_pack)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            status = "OK" if result["ok"] else "FAIL"
            print(f"public schema catalog verification: {status}")
            print(f"catalog_path: {result['catalog_path']}")
            print(f"engine_pack: {result['engine_pack']}")
            for error in result["errors"]:
                print(f"- {error['path']}: {error['message']}")
        return 0 if result["ok"] else 2
    if args.print_readiness_evidence_template:
        print(json.dumps(readiness_evidence_template(), indent=2))
        return 0
    if args.write_readiness_evidence_template:
        output_path = write_json_file(args.write_readiness_evidence_template, readiness_evidence_template())
        if args.json:
            print(json.dumps({
                "ok": True,
                "version": VERSION,
                "path": str(output_path),
                "kind": "readiness_evidence_template",
            }, indent=2))
        else:
            print(f"readiness evidence template criado: {output_path}")
        return 0
    if args.update_readiness_evidence:
        if not args.readiness_gate:
            parser.error("--readiness-gate e obrigatorio com --update-readiness-evidence")
        result, error = update_readiness_evidence_file(
            args.update_readiness_evidence,
            args.readiness_gate,
            args.readiness_gate_ok,
            args.readiness_gate_source,
            args.readiness_gate_checked_at,
            args.readiness_gate_message,
            args.readiness_gate_evidence_type,
            args.readiness_gate_validated_platform,
            args.readiness_gate_review_environment,
        )
        if error is not None:
            if args.json:
                print(json.dumps({
                    "ok": False,
                    "version": VERSION,
                    "kind": "readiness_evidence_update",
                    "error": error,
                }, indent=2))
                return 2
            print(error, file=sys.stderr)
            return 2
        if args.json:
            print(json.dumps({
                "ok": True,
                "version": VERSION,
                "kind": "readiness_evidence_update",
                **result,
            }, indent=2))
        else:
            print(f"readiness evidence atualizado: {result['path']} ({result['gate']})")
        return 0
    if args.merge_readiness_evidence:
        result, error = merge_readiness_evidence_files(
            args.merge_readiness_evidence,
            args.readiness_evidence_input,
        )
        if error is not None:
            if args.json:
                print(json.dumps({
                    "ok": False,
                    "version": VERSION,
                    "kind": "readiness_evidence_merge",
                    "error": error,
                }, indent=2))
                return 2
            print(error, file=sys.stderr)
            return 2
        if args.json:
            print(json.dumps({
                "ok": True,
                "version": VERSION,
                "kind": "readiness_evidence_merge",
                **result,
            }, indent=2))
        else:
            print(f"readiness evidence mesclado: {result['path']} ({result['input_count']} entradas)")
        return 0
    if args.validate_readiness_report:
        result = validate_readiness_report_file(args.validate_readiness_report)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            status = "OK" if result["ok"] else "FAIL"
            print(f"readiness report validation: {status}")
            if result["stage"] is not None:
                print(f"stage: {result['stage']}")
            for error in result["errors"]:
                print(f"- {error['path']}: {error['message']}")
        return 0 if result["ok"] else 2
    if args.validate_promotion_bundle:
        result = validate_promotion_bundle(args.validate_promotion_bundle)
        if args.require_primary_ready:
            result = require_primary_ready_for_promotion_validation(result)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            status = "OK" if result["ok"] else "FAIL"
            print(f"promotion bundle validation: {status}")
            if result["stage"] is not None:
                print(f"stage: {result['stage']}")
            for error in result["errors"]:
                print(f"- {error['path']}: {error['message']}")
        return 0 if result["ok"] else 2
    if args.validate_public_schema:
        if not args.schema_document:
            parser.error("--schema-document e obrigatorio com --validate-public-schema")
        result = validate_public_schema_document(args.validate_public_schema, args.schema_document)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            status = "OK" if result["ok"] else "FAIL"
            print(f"public schema validation: {status}")
            print(f"schema: {result['schema']}")
            for error in result["errors"]:
                print(f"- {error['path']}: {error['message']}")
        return 0 if result["ok"] else 2
    if not args.engine_pack:
        parser.error("--engine-pack ou GBS_ENGINE_PACK e obrigatorio")

    report = build_report(args)
    if args.write_readiness_report:
        output_path = write_json_file(args.write_readiness_report, readiness_report_payload(report))
        if args.json:
            print(json.dumps({
                "ok": True,
                "version": VERSION,
                "path": str(output_path),
                "kind": "readiness_report",
                "ready_for_primary_backend": report["diagnostics"]["butano_replacement_readiness"]["ready_for_primary_backend"],
            }, indent=2))
        else:
            print(f"readiness report criado: {output_path}")
        if args.require_primary_ready and not report["diagnostics"]["butano_replacement_readiness"]["ready_for_primary_backend"]:
            return 3
        return 0 if report["ok"] else 1
    if args.write_promotion_bundle:
        result = write_promotion_bundle(args.write_promotion_bundle, report)
        if args.json:
            print(json.dumps(result, indent=2))
        else:
            print(f"promotion bundle criado: {result['path']}")
            print(f"stage: {result['stage']}")
            print(f"ready_for_primary_backend: {str(result['ready_for_primary_backend']).lower()}")
        if args.require_primary_ready and not report["diagnostics"]["butano_replacement_readiness"]["ready_for_primary_backend"]:
            return 3
        return 0 if report["ok"] and result["ok"] else 1
    if args.readiness_only or args.require_primary_ready:
        print_readiness_report(report, args.json)
        if args.require_primary_ready and not report["diagnostics"]["butano_replacement_readiness"]["ready_for_primary_backend"]:
            return 3
        return 0 if report["ok"] else 1
    print_report(report, args.json)
    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
