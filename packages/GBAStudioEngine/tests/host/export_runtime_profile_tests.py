#!/usr/bin/env python3
import json
import re
import runpy
import shutil
import subprocess
import struct
import sys
import zlib
from pathlib import Path


PROFILES = (
    ("pointAndClick", "point_click", "point_click_project"),
    ("shmup", "shmup", "shmup_project"),
    ("visualNovel", "visual_novel", "visual_novel_project"),
    ("menu", "menu", "menu_project"),
    ("cutscene", "cutscene", "cutscene_project"),
    ("worldMap", "world_map", "world_map_project"),
)


def topdown_like_project(name):
    return {
        "initial_room": 0,
        "rooms": [
            {
                "name": f"{name}_room",
                "width_tiles": 2,
                "height_tiles": 2,
                "visual_tiles": [0, 1, 1, 0],
                "collision_flags": [1, 0, 0, 1],
                "metadata": {
                    "camera_mode": "fixed",
                    "camera_position": {"x": 0, "y": 0},
                    "player_start": {"x": 8, "y": 8},
                    "backdrop_color": 31,
                },
                "on_enter": [
                    {"op": "show_dialogue", "line": 0},
                    {"op": "mute_audio_channel", "channel": "music", "muted": True},
                ],
                "interactions": [
                    {
                        "area": {"x": 8, "y": 8, "width": 8, "height": 8},
                        "script": [{"op": "set_variable", "variable": 1, "value": 1}],
                    }
                ],
            }
        ],
        "player": {
            "position": {"x": 8, "y": 8},
            "size": {"x": 16, "y": 16},
            "speed": 1,
            "emit_animation_fallback": True,
        },
        "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        "dialogue_lines": [f"{name} export"],
    }


def assert_flash1m_save_export(repo_root, build_dir):
    source_dir = build_dir / "flash1m_save" / "source"
    output_dir = build_dir / "flash1m_save" / "exported"
    source_dir.mkdir(parents=True, exist_ok=True)
    project = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "build": {"target": "flash_save", "make_target": "all"},
        "topdown_project": {
            **topdown_like_project("flash_save"),
            "save": {"enabled": True, "save_type": "flash1m", "slot_capacity": 4096, "slot_count": 3},
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(project), encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    assert manifest["build"]["sources"] == ["main.cpp", "save_type.cpp"]
    assert "FLASH1M_V103" in (output_dir / "save_type.cpp").read_text(encoding="utf-8")
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "static_cast<uint32_t>(4096)" in header

    assetc = runpy.run_path(str(repo_root / "tools" / "assetc" / "assetc.py"))
    try:
        assetc["save_config_from_json"](
            {"enabled": True, "save_type": "flash1m", "slot_capacity": 2048},
            "flash_test", "GBTD", 0,
        )
    except SystemExit:
        pass
    else:
        raise AssertionError("Flash1M deve rejeitar slots menores que um setor")


def assert_enginepack_declares_ready_event_capabilities(repo_root):
    manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    event_capabilities = set(manifest.get("capabilities", {}).get("events", []))
    required_event_capabilities = {
        "add_inventory_item",
        "add_variable_flags",
        "attach_button_event",
        "attach_timer_event",
        "clear_variable_flags",
        "divide_variable",
        "end",
        "fade_in",
        "fade_out",
        "jump_if_actor_at_position",
        "jump_if_actor_direction",
        "jump_if_actor_distance",
        "jump_if_actor_relative",
        "jump_if_button_pressed",
        "jump_if_engine_field_equals",
        "jump_if_engine_field_equals_variable",
        "if_rtc",
        "jump_if_inventory_at_least",
        "jump_if_room_equals",
        "jump_if_save_exists",
        "read_rtc",
        "jump_if_variable_equals",
        "jump_if_variable_equals_variable",
        "jump_if_variable_greater_than",
        "jump_if_variable_less_than",
        "jump_if_variable_not_equals",
        "link_close",
        "link_host",
        "link_join",
        "link_transfer",
        "rumble_on",
        "rumble_on_for",
        "rumble_off",
        "multiplayer_open",
        "multiplayer_close",
        "multiplayer_set_data",
        "multiplayer_transfer",
        "multiplayer_get_data",
        "launch_projectile",
        "launch_projectile_slot",
        "load_game",
        "lock_script",
        "mod_variable",
        "move_camera",
        "multiply_variable",
        "mute_audio_channel",
        "overlay_hide",
        "overlay_line",
        "overlay_move",
        "overlay_show",
        "player_bounce",
        "projectile_load_slot",
        "push_actor_away_from_player",
        "random_variable",
        "rate_limit",
        "remove_button_event",
        "remove_inventory_item",
        "remove_save_game",
        "remove_timer_event",
        "replace_tile",
        "reset_variables_false",
        "restart_timer_event",
        "run_audio_routine",
        "save_game",
        "scene_stack_clear",
        "scene_stack_first",
        "scene_stack_previous",
        "scene_stack_push",
        "set_actor_animation_frame",
        "set_actor_animation_speed",
        "set_actor_collision_box",
        "set_actor_collision_enabled",
        "set_all_sprites_visible",
        "set_background_palette",
        "set_camera_bounds_x",
        "set_camera_bounds_y",
        "set_camera_property",
        "set_camera_shake",
        "set_dialogue_frame",
        "set_dialogue_language",
        "set_dialogue_text_speed",
        "set_player_animation",
        "set_random_seed",
        "set_sprite_palette",
        "set_text_sfx",
        "set_variable_flags",
        "show_actor_gesture",
        "start_actor_update_script",
        "start_segment",
        "stop_actor_update_script",
        "stop_segment",
        "store_actor_direction",
        "store_actor_position",
        "store_engine_field",
        "store_save_exists",
        "unlock_script",
        "wait_actor_animation",
        "wait_button_pressed",
        "visual_effect",
    }
    missing = sorted(required_event_capabilities - event_capabilities)
    if missing:
        raise AssertionError(f"enginepack.json nao declara eventos nativos prontos: {missing}")


def assert_enginepack_declares_link_runtime_capabilities(repo_root):
    manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    link_capabilities = set(manifest.get("capabilities", {}).get("link", []))
    required_link_capabilities = {
        "gba_sio_normal8",
        "gba_sio_normal32",
        "link_session_host",
        "link_session_join",
        "link_session_multiplayer4",
        "link_transfer_byte",
        "link_transfer_multiplayer16",
        "link_timeout",
    }
    missing = sorted(required_link_capabilities - link_capabilities)
    if missing:
        raise AssertionError(f"enginepack.json nao declara runtime link cable pronto: {missing}")


def assert_enginepack_declares_visual_effect_runtime_capabilities(repo_root):
    manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    render_capabilities = set(manifest.get("capabilities", {}).get("render_runtime", []))
    required_render_capabilities = {
        "visual_effect_controller",
        "visual_effect_letterbox",
        "visual_effect_mosaic",
        "visual_effect_palette_flash",
        "visual_effect_runtime_isometric",
        "visual_effect_runtime_platformer",
        "visual_effect_runtime_topdown",
        "visual_effect_scroll_wave",
        "visual_effect_target_layers",
    }
    missing = sorted(required_render_capabilities - render_capabilities)
    if missing:
        raise AssertionError(f"enginepack.json nao declara efeitos visuais prontos: {missing}")


def assert_enginepack_declares_shmup_composition_capabilities(repo_root):
    manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    shmup_capabilities = set(manifest.get("capabilities", {}).get("shmup_runtime", []))
    required_shmup_capabilities = {
        "shmup_hud_bg0",
        "shmup_actor_obj",
        "shmup_collision_data",
        "affine_background",
    }
    missing = sorted(required_shmup_capabilities - shmup_capabilities)
    if missing:
        raise AssertionError(f"enginepack.json nao declara a composicao SHMUP pronta: {missing}")


def assert_enginepack_declares_luta_runtime_contract(repo_root):
    manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    capabilities = manifest.get("capabilities", {})
    luta_capabilities = set(capabilities.get("luta_runtime", []))
    required_luta_capabilities = {
        "luta_project_data_contract",
        "fighter_selection",
        "round_progression",
        "super_gauge",
        "luta_export_template",
    }
    missing = sorted(required_luta_capabilities - luta_capabilities)
    if missing:
        raise AssertionError(f"enginepack.json nao declara runtime luta pronto: {missing}")

    runtime_profiles = set(capabilities.get("runtime_profiles", []))
    required_runtime_profiles = {"luta_export_contract", "luta_native_contract"}
    missing_profiles = sorted(required_runtime_profiles - runtime_profiles)
    if missing_profiles:
        raise AssertionError(f"enginepack.json nao declara perfil luta: {missing_profiles}")

    luta_template = next((item for item in manifest.get("sdk", {}).get("templates", []) if item.get("id") == "luta_basic"), None)
    if luta_template is None:
        raise AssertionError("enginepack.json nao declara o template SDK luta_basic")
    if "luta_runtime" not in luta_template.get("requires", []):
        raise AssertionError("template luta_basic nao exige luta_runtime")

    fixtures = set(capabilities.get("export_fixtures", []))
    if "exported_luta" not in fixtures:
        raise AssertionError("enginepack.json nao declara exported_luta como fixture de exportacao")

    mixed_template = repo_root / "templates" / "exported_mixed"
    if not (mixed_template / "luta_runtime.cpp").is_file():
        raise AssertionError("template mixed nao possui ponte luta_runtime.cpp")
    if "luta_runtime.cpp" not in (mixed_template / "gbastudio_project.json").read_text(encoding="utf-8"):
        raise AssertionError("manifesto do template mixed nao compila luta_runtime.cpp")


def assert_luta_draw_does_not_overwrite_stage_backdrop(repo_root):
    runtime_source = (repo_root / "templates" / "exported_luta" / "main.cpp").read_text(encoding="utf-8")
    draw_body = runtime_source.split("void draw_luta()", 1)[1].split("void", 1)[0]
    if "set_backdrop_color" in draw_body:
        raise AssertionError("draw_luta sobrescreve a cor 0 do background carregado pelo estagio")


def assert_luta_stage_enables_background_layer(repo_root):
    runtime_source = (repo_root / "templates" / "exported_luta" / "main.cpp").read_text(encoding="utf-8")
    apply_body = runtime_source.rsplit("void apply_luta_visuals", 1)[1].split("void draw_luta", 1)[0]
    if "gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);" not in apply_body:
        raise AssertionError("runtime luta nao reabilita BG0 para a HUD ao entrar na arena")
    if "gbs::set_bg_enabled(background->layer, true);" not in apply_body:
        raise AssertionError("runtime luta nao habilita a camada de background do estagio")


def assert_luta_stage_palette_survives_ui_configuration(repo_root):
    runtime_source = (repo_root / "templates" / "exported_luta" / "main.cpp").read_text(encoding="utf-8")
    initialize_body = runtime_source.split("int initialize_luta_runtime()", 1)[1].split("gbs::RuntimeAdapterFrameResult update_luta_runtime", 1)[0]
    configure_pos = initialize_body.find("gbastudio_dialogue_ui::configure();")
    visuals_pos = initialize_body.find("apply_luta_visuals(project.stages[stage_index]);")
    if configure_pos < 0 or visuals_pos < 0 or configure_pos > visuals_pos:
        raise AssertionError("runtime luta deve carregar a paleta da arena depois das paletas da UI global")

    transition_body = runtime_source.split("bool restart_standalone_luta_from_transition()", 1)[1].split("#endif", 1)[0]
    configure_pos = transition_body.find("gbastudio_dialogue_ui::configure_for_scene(project.stages[stage_index].id);")
    visuals_pos = transition_body.find("apply_luta_visuals(project.stages[stage_index]);")
    if configure_pos < 0 or visuals_pos < 0 or configure_pos > visuals_pos:
        raise AssertionError("transicao para arena deve configurar a UI antes de carregar a paleta da arena")


def assert_luta_cpu_allows_initial_reaction(repo_root):
    runtime_source = (repo_root / "templates" / "exported_luta" / "main.cpp").read_text(encoding="utf-8")
    if "luta_cpu_initial_reaction_frames" not in runtime_source:
        raise AssertionError("CPU da luta nao concede tempo inicial para reagir")
    if runtime_source.count("luta_cpu_attack_wait_frames = luta_cpu_initial_reaction_frames;") < 2:
        raise AssertionError("CPU da luta nao reinicia a espera ao entrar e ao trocar de estagio")
    cpu_body = runtime_source.split("void update_luta_cpu()", 1)[1].split("#if !GBS_MULTI_RUNTIME", 1)[0]
    if "--luta_cpu_attack_wait_frames" not in cpu_body or "luta_cpu_attack_wait_frames = luta_cpu_attack_interval_frames;" not in cpu_body:
        raise AssertionError("CPU da luta nao respeita intervalo entre golpes")


def assert_battle_notice_back_preserves_enemy_turn(repo_root):
    runtime_source = (repo_root / "templates" / "exported_battle_rpg" / "main.cpp").read_text(encoding="utf-8")
    menu_body = runtime_source.split("bool update_battle_menu(const gbs::InputState& input)", 1)[1].split("bool stream_encounter_resource_group", 1)[0]
    if "const bool dismiss_notice = battle_menu_page == BattleMenuPage::Notice &&" not in menu_body:
        raise AssertionError("B deve fechar o aviso de batalha sem cancelar o turno inimigo")
    if "if (input.was_pressed(gbs::ButtonB) && !dismiss_notice)" not in menu_body:
        raise AssertionError("B no aviso nao pode voltar diretamente ao menu raiz")
    if "if (!input.was_pressed(gbs::ButtonA) && !dismiss_notice) return false;" not in menu_body:
        raise AssertionError("B no aviso deve seguir o mesmo fluxo de confirmacao que A")


def assert_battle_hud_exposes_compact_enemy_hp(repo_root):
    runtime_source = (repo_root / "templates" / "exported_battle_rpg" / "main.cpp").read_text(encoding="utf-8")
    hud_body = runtime_source.split("void update_battle_hud()", 1)[1].split("void set_battle_menu_frame", 1)[0]
    if "append_hud_number(battle_enemy_hp_hud_text, hp_cursor, state.enemy_hp[enemy_index]);" not in hud_body:
        raise AssertionError("HUD da batalha nao atualiza a vida compacta do inimigo")
    if "gbs::set_hud_text_slots(battle_hud, hud_text_slots, 3);" not in hud_body:
        raise AssertionError("HUD da batalha nao expõe o terceiro campo de texto dinâmico")


def assert_dungeon_streamed_resources_are_not_overwritten(repo_root):
    runtime_source = (repo_root / "templates" / "exported_dungeon_crawler" / "main.cpp").read_text(encoding="utf-8")
    apply_body = runtime_source.split("void apply_room_visuals()", 1)[1].split("void", 1)[0]
    if "streamed_assets_are_uploaded" not in apply_body or "if (!streamed_assets_are_uploaded)" not in apply_body:
        raise AssertionError("runtime dungeon deve preservar os assets ja carregados pelo streaming da sala")
    if "gbs::load_palette(project.obj_palettes[index], true);" not in apply_body:
        raise AssertionError("runtime dungeon perdeu o fallback de paletas para projetos sem streaming")
    if "gbs::load_tiles(project.tile_assets[index]);" not in apply_body:
        raise AssertionError("runtime dungeon perdeu o fallback de tiles para projetos sem streaming")
    if "gbs::stream_resource_bank_group_with_uploads" not in runtime_source:
        raise AssertionError("runtime dungeon nao transfere assets com fontes de upload por sala")
    if "project.resource_bank_upload_sources" not in runtime_source:
        raise AssertionError("runtime dungeon nao referencia as fontes de upload do projeto")


def assert_shmup_streamed_resources_are_not_overwritten(repo_root):
    runtime_source = (repo_root / "templates" / "exported_shmup" / "main.cpp").read_text(encoding="utf-8")
    load_body = runtime_source.split("void load_assets()", 1)[1].split("bool stream_resources_for_wave", 1)[0]
    if "const bool assets_are_streamed = project.resource_bank_group_count > 0;" not in load_body:
        raise AssertionError("runtime shmup nao identifica assets carregados por streaming")
    if "if (!assets_are_streamed) {" not in load_body:
        raise AssertionError("runtime shmup sobrescreve assets dinamicos com o fallback")
    for fallback_load in (
        "gbs::load_palette(obj_palette_asset, true);",
        "gbs::load_tiles(player_tile_asset);",
        "gbs::load_tiles(enemy_tile_asset);",
        "gbs::load_tiles(bullet_tile_asset);",
    ):
        if load_body.index(fallback_load) < load_body.index("if (!assets_are_streamed) {"):
            raise AssertionError(f"fallback shmup {fallback_load} nao esta protegido do streaming")
    if "gbs::stream_resource_bank_group_with_uploads" not in runtime_source:
        raise AssertionError("runtime shmup nao transfere assets com fontes de upload por wave")


def assert_dungeon_initial_room_seeds_event_context(repo_root):
    runtime_source = (repo_root / "templates" / "exported_dungeon_crawler" / "main.cpp").read_text(encoding="utf-8")
    seed = "event_state.current_room = current_room_index;"
    if seed not in runtime_source:
        raise AssertionError("runtime dungeon nao sincroniza o contexto de eventos com a sala inicial")
    if "event_state.player_x = runtime_state.position.x;" not in runtime_source:
        raise AssertionError("runtime dungeon nao sincroniza a posicao inicial no contexto de eventos")
    if runtime_source.index(seed) > runtime_source.index("start_runtime_event_script(project.rooms[current_room_index].on_enter);"):
        raise AssertionError("runtime dungeon sincroniza a sala depois de iniciar o on_enter")


def assert_enginepack_declares_topdown_racing_contract(repo_root):
    manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    racing_capabilities = set(manifest.get("capabilities", {}).get("racing_runtime", []))
    if "topdown_track" not in racing_capabilities:
        raise AssertionError("enginepack.json nao declara racing_runtime.topdown_track")


def assert_export_project_schema_declares_ready_event_ops(repo_root):
    schema = json.loads((repo_root / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    event_op_enum = set(
        schema["properties"]["topdown_project"]["properties"]["event_command"]["properties"]["op"]["enum"]
    )
    ready_event_ops = {
        "add_inventory_item",
        "add_variable",
        "add_variable_flags",
        "advance_time",
        "attach_adventure_callback",
        "attach_button_event",
        "attach_platform_callback",
        "attach_timer_event",
        "call_script",
        "clear_variable",
        "clear_variable_flags",
        "close_dialogue",
        "divide_variable",
        "end",
        "fade_in",
        "fade_out",
        "follow_camera",
        "jump",
        "jump_if_actor_at_position",
        "jump_if_actor_direction",
        "jump_if_actor_distance",
        "jump_if_actor_relative",
        "jump_if_button_pressed",
        "jump_if_engine_field_equals",
        "jump_if_engine_field_equals_variable",
        "if_rtc",
        "jump_if_inventory_at_least",
        "jump_if_room_equals",
        "jump_if_save_exists",
        "read_rtc",
        "jump_if_variable_equals",
        "jump_if_variable_equals_variable",
        "jump_if_variable_greater_than",
        "jump_if_variable_less_than",
        "jump_if_variable_not_equals",
        "launch_projectile",
        "launch_projectile_slot",
        "load_game",
        "lock_camera",
        "lock_script",
        "mod_variable",
        "modify_stat",
        "modify_wallet",
        "move_actor",
        "move_camera",
        "multiply_variable",
        "mute_audio_channel",
        "open_code_lock",
        "open_equip_menu",
        "open_text_input",
        "overlay_hide",
        "overlay_line",
        "overlay_move",
        "overlay_show",
        "pause_scene_type",
        "player_bounce",
        "play_music",
        "play_pcm_sfx",
        "play_sfx",
        "projectile_load_slot",
        "push_actor",
        "push_actor_away_from_player",
        "random_variable",
        "rate_limit",
        "remove_adventure_callback",
        "remove_button_event",
        "remove_inventory_item",
        "remove_platform_callback",
        "remove_save_game",
        "remove_timer_event",
        "replace_tile",
        "replace_tile_sequence",
        "reset_variables_false",
        "restart_timer_event",
        "resume_scene_type",
        "run_audio_routine",
        "save_game",
        "scene_stack_clear",
        "scene_stack_first",
        "scene_stack_previous",
        "scene_stack_push",
        "set_actor_active",
        "set_actor_animation",
        "set_actor_animation_frame",
        "set_actor_animation_speed",
        "set_actor_collision_box",
        "set_actor_collision_enabled",
        "set_actor_direction",
        "set_actor_position",
        "set_actor_speed",
        "set_actor_visible",
        "set_all_sprites_visible",
        "set_background_palette",
        "set_camera_bounds_x",
        "set_camera_bounds_y",
        "set_camera_position",
        "set_camera_property",
        "set_camera_shake",
        "set_dialogue_frame",
        "set_dialogue_language",
        "set_dialogue_text_speed",
        "set_engine_field",
        "set_equipped_item",
        "set_player_animation",
        "set_player_movement_state",
        "set_player_speed_profile",
        "set_random_seed",
        "set_sprite_palette",
        "set_stat",
        "set_text_sfx",
        "set_variable",
        "set_variable_flags",
        "show_actor_gesture",
        "show_choice",
        "show_dialogue",
        "show_dialogue_if",
        "show_hearts",
        "show_number_hud",
        "show_stat_bar",
        "start_actor_update_script",
        "start_game_clock",
        "start_segment",
        "stop_actor_update_script",
        "stop_music",
        "stop_segment",
        "store_actor_direction",
        "store_actor_position",
        "store_engine_field",
        "store_save_exists",
        "unlock_script",
        "wait",
        "wait_actor_animation",
        "wait_button_pressed",
        "visual_effect",
        "warp",
    }
    missing = sorted(ready_event_ops - event_op_enum)
    if missing:
        raise AssertionError(f"export_project.schema.json nao declara eventos nativos prontos: {missing}")


def point_click_project():
    return {
        "initial_scene": 0,
        "cursor_start": {"x": 120, "y": 80},
        "cursor_speed": 2,
        "save": {"enabled": True, "signature": "GBPC", "slot_capacity": 1024, "slot_count": 1},
        "dialogue_lines": [
            {
                "key": "intro",
                "text": "Point click export",
                "speaker": "Guide",
                "portrait": "guide.png",
            },
            "Hotspot ativado.",
            "Cena final.",
            "Item coletado.",
            "Precisa do item.",
            "Item selecionado.",
        ],
        "inventory_items": [
            {"id": "key", "name": "key", "variable": 2, "line": 5},
        ],
        "scripts": [
            {
                "name": "open_menu",
                "script": [
                    {"op": "scene_stack_push", "runtime": "point_click"},
                    {"op": "warp_runtime", "runtime": "topdown", "room": 0, "x": 0, "y": 0},
                ],
            },
        ],
        "scenes": [
            {
                "name": "room",
                "background": -1,
                "cursor_speed": 4,
                "on_enter": [
                    {"op": "attach_button_event", "button": "start", "script": 0, "override": True},
                    {"op": "show_dialogue", "line": 0},
                ],
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
            },
        ],
    }


def shmup_project():
    return {
        "initial_wave": 0,
        "save": {"enabled": True, "signature": "GBSH", "slot_capacity": 1024, "slot_count": 1},
        "dialogue_lines": [
            "Shmup export",
            "Enemy destroyed",
        ],
        "player": {
            "position": {"x": 112, "y": 128},
            "size": {"x": 16, "y": 16},
            "speed": 2,
            "fire_cooldown": 8,
            "projectile_offset": {"x": 6, "y": -4},
            "on_fire": [{"op": "play_sfx", "index": 0}],
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
                "player_speed": 4,
                "fire_cooldown": 6,
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


def visual_novel_project():
    return {
        "initial_scene": 0,
        "save": {"enabled": True, "signature": "GBVN", "slot_capacity": 1024, "slot_count": 1},
        "dialogue_lines": [
            "Visual novel export",
            "Escolha uma resposta.",
            "Cena final.",
            "Cena secreta.",
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
            },
            {
                "name": "choice",
                "background": -1,
                "line": -1,
                "choice_group": 0,
                "next_scene": 2,
            },
            {
                "name": "end",
                "background": -1,
                "line": 2,
                "choice_group": -1,
                "next_scene": -1,
                "on_enter": [{"op": "show_dialogue", "line": 2}],
            },
            {
                "name": "secret",
                "background": -1,
                "line": 3,
                "choice_group": -1,
                "next_scene": -1,
                "on_enter": [{"op": "show_dialogue", "line": 3}],
            },
        ],
    }


def menu_project():
    return {
        "initial_screen": 0,
        "start_menu_screen": 1,
        "menu_profiles": [
            {"id": "initial", "label": "Menu inicial", "entry_screen": 0, "return_policy": "title", "suspends_gameplay": False},
            {"id": "in_game", "label": "Menu durante o jogo", "entry_screen": 1, "return_policy": "resume", "suspends_gameplay": True},
        ],
        "save": {
            "enabled": True,
            "signature": "GBMN",
            "slot_capacity": 1024,
            "slot_count": 1,
        },
        "dialogue_lines": [
            "Menu export",
            "> Continue",
            "> Start",
            "> Options",
            "Start selected",
            "Options screen",
            "> Sound",
            "> Volume",
            "> Back",
        ],
        "screens": [
            {
                "name": "main",
                "screen_type": "title",
                "menu_profile": "initial",
                "entry_policy": "title",
                "return_policy": "title",
                "suspends_gameplay": False,
                "title": "Sample Game",
                "allow_skip": True,
                "background": -1,
                "title_overlay_background": -1,
                "title_fade_frames": 24,
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
                        "binding": {"source": "variable", "index": 0, "format": "percent"},
                        "click_box": {"x": 72, "y": 104, "width": 96, "height": 24},
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
                "menu_profile": "in_game",
                "entry_policy": "gameplay",
                "return_policy": "resume",
                "suspends_gameplay": True,
                "presentation_mode": "both",
                "background": -1,
                "title_line": 5,
                "on_enter": [{"op": "show_dialogue", "line": 5}],
                "text_input": {
                    "variable_index": 0,
                    "max_length": 8,
                    "x": 12,
                    "y": 6,
                    "width": 8,
                    "keyboard_layout": "grid",
                    "keyboard_x": 4,
                    "keyboard_y": 8,
                    "keyboard_width": 22,
                    "keyboard_height": 6,
                    "keyboard_allow_lowercase": True,
                },
                "items": [
                    {
                        "label": "sound",
                        "line": 6,
                        "action": "toggle_variable",
                        "toggle_variable": 1,
                        "checked_value": 1,
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
                    {"label": "back", "line": 8, "action": "pop_screen"},
                ],
            },
        ],
    }


def cutscene_project():
    return {
        "initial_scene": 0,
        "save": {
            "enabled": True,
            "signature": "GBCS",
            "slot_capacity": 1024,
            "slot_count": 1,
        },
        "dialogue_lines": [
            "Cutscene export",
            "A cena avanca sozinha.",
            "Fim.",
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


def world_map_project():
    return {
        "initial_node": 0,
        "save": {
            "enabled": True,
            "signature": "GBWM",
            "slot_capacity": 1024,
            "slot_count": 1,
        },
        "dialogue_lines": [
            "World map export",
            "Forest selected",
            "Castle locked",
        ],
        "nodes": [
            {
                "name": "start",
                "position": {"x": 32, "y": 96},
                "line": 0,
                "connections": ["forest", "castle"],
                "target_level": 0,
                "on_select": [{"op": "set_variable", "variable": 0, "value": 1}],
            },
            {
                "name": "forest",
                "position": {"x": 96, "y": 64},
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
                "position": {"x": 168, "y": 96},
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
                "position": {"x": 208, "y": 48},
                "line": 2,
                "connections": ["castle"],
                "target_level": 3,
                "unlock_variable": 3,
                "unlock_value": 1,
                "hide_when_locked": True,
            },
        ],
    }


def run_assetc(repo_root, manifest_path, output_dir, capture_output=False):
    subprocess.run(
        [
            str(repo_root / "tools" / "assetc" / "assetc.py"),
            str(manifest_path),
            "-o",
            str(output_dir),
            "--export-project-json",
        ],
        check=True,
        capture_output=capture_output,
        text=capture_output,
    )


def assert_warp_runtime_signed_encoding(repo_root):
    assetc = runpy.run_path(str(repo_root / "tools" / "assetc" / "assetc.py"))
    encode = assetc["event_command_from_json"]
    assert encode({"op": "warp_runtime", "runtime": "visual_novel", "room": 0}, "visual novel") == (
        "WarpRuntime", -28672, 0, 0
    )
    assert encode({"op": "warp_runtime", "runtime": "world_map", "room": 4095}, "world map") == (
        "WarpRuntime", -20481, 0, 0
    )
    assert encode({"op": "warp_runtime", "runtime": "battle_rpg", "room": 0}, "battle RPG") == (
        "WarpRuntime", -20480, 0, 0
    )


def assert_world_map_and_battle_rpg_authored_visual_contract(repo_root):
    assetc = runpy.run_path(str(repo_root / "tools" / "assetc" / "assetc.py"))

    world_project = world_map_project()
    world_project.update({
        "background": 0,
        "backgrounds": [{
            "name": "archipelago",
            "layer": "bg3",
            "tilemap": "archipelago_tilemap_asset",
            "backdrop_color": 7,
        }],
        "cursor": {"metasprite": "airship_cursor_metasprite"},
        "marker": {"metasprite": "lighthouse_marker_metasprite"},
    })
    world_header = assetc["emit_world_map_project_data_header"](world_project)
    assert "gbs::WorldMapBackgroundData" in world_header
    assert "&airship_cursor_metasprite" in world_header
    assert "&lighthouse_marker_metasprite" in world_header

    battle_project = json.loads(
        (repo_root / "tests" / "fixtures" / "export_battle_rpg_project.json").read_text(encoding="utf-8")
    )["battle_rpg_project"]
    battle_project.update({
        "backgrounds": [{
            "name": "lighthouse_arena",
            "layer": "bg2",
            "tilemap": "lighthouse_arena_tilemap_asset",
            "backdrop_color": 3,
        }],
        "resource_banks": [{
            "name": "battle_scene_tiles",
            "pool": "bg_tiles",
            "start": 0,
            "count": 32,
            "group": "arena_bank",
        }],
    })
    battle_project["encounters"][0]["background"] = 0
    battle_project["encounters"][0]["resource_bank_group"] = "arena_bank"
    battle_project["encounters"][0]["party"][0]["metasprite"] = "lia_battle_metasprite"
    battle_project["encounters"][0]["enemies"][0]["metasprite"] = "automaton_battle_metasprite"
    battle_header = assetc["emit_battle_rpg_project_data_header"](battle_project)
    assert "gbs::BattleRpgBackgroundData" in battle_header
    assert "&lia_battle_metasprite" in battle_header
    assert "&automaton_battle_metasprite" in battle_header
    assert '"arena_bank"' in battle_header


def assert_asset_bank_can_belong_to_multiple_scene_groups(repo_root, build_dir):
    source_dir = build_dir / "scene_bank_membership" / "source"
    output_dir = build_dir / "scene_bank_membership" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    write_indexed_png(assets_dir / "hero.png", 16, 16, [(0, 0, 0), (255, 255, 255)], [1] * 256)

    room = {
        "width_tiles": 2,
        "height_tiles": 2,
        "visual_tiles": [0, 0, 0, 0],
        "collision_flags": [0, 0, 0, 0],
    }
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "scene_bank_membership", "make_target": "all"},
        "asset_pack": {
            "assets": [{
                "name": "hero",
                "id": "hero_sprite",
                "kind": "obj",
                "png": "assets/hero.png",
                "sprite_width": 16,
                "sprite_height": 16,
                "header": "hero_sprite.hpp",
                "symbol": "hero_sprite",
                "bank_group": "global",
                "bank_groups": ["scene_field", "scene_cave"],
            }]
        },
        "topdown_project": {
            "resource_banks": "asset_pack",
            "rooms": [
                {**room, "name": "field", "resource_bank_group": "scene_field"},
                {**room, "name": "cave", "resource_bank_group": "scene_cave"},
            ],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "animation": {"asset": "hero_sprite"},
                "emit_animation_fallback": False,
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)

    report = json.loads((output_dir / "asset_pack_report.json").read_text(encoding="utf-8"))
    bank_indexes = list(range(len(report["resource_bank_plan"])))
    groups = {group["name"]: group for group in report["resource_bank_groups"]}
    assert len(report["allocations"]) == 1
    assert groups["global"]["bank_indexes"] == bank_indexes
    assert groups["scene_field"]["bank_indexes"] == bank_indexes
    assert groups["scene_cave"]["bank_indexes"] == bank_indexes

    run_assetc(repo_root, manifest_path, output_dir)
    incremental_report = json.loads((output_dir / "asset_pack_report.json").read_text(encoding="utf-8"))
    assert incremental_report["rebuild_plan"]["generate"] == 0
    assert incremental_report["rebuild_plan"]["skip"] == 1
    assert incremental_report["rebuild_plan"]["assets"]["skip"] == ["hero_sprite"]


def assert_scene_banks_reuse_vram_ranges(repo_root, build_dir):
    source_dir = build_dir / "scene_bank_reuse"
    source_dir.mkdir(parents=True)
    pack_path = source_dir / "asset_pack.json"
    report_path = source_dir / "asset_pack_report.json"
    pack_path.write_text(json.dumps({
        "assets": [
            {"name": "wide_field", "kind": "bg", "bank_group": "scene_field", "resources": {"bg_tiles": 700, "bg_palette_colors": 16}},
            {"name": "wide_cave", "kind": "bg", "bank_group": "scene_cave", "resources": {"bg_tiles": 700, "bg_palette_colors": 16}},
        ]
    }, indent=2) + "\n", encoding="utf-8")
    subprocess.run([
        str(repo_root / "tools" / "assetc" / "assetc.py"),
        str(pack_path),
        "-o",
        str(report_path),
        "--pack-json",
    ], check=True)

    report = json.loads(report_path.read_text(encoding="utf-8"))
    assert report["ok"] is True
    assert report["allocations"][0]["allocations"]["bg_tiles"]["start"] == 1
    assert report["allocations"][1]["allocations"]["bg_tiles"]["start"] == 1


def assert_mixed_runtime_dispatch_export(repo_root, build_dir):
    source_dir = build_dir / "mixed_runtime" / "source"
    output_dir = build_dir / "mixed_runtime" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    dialogue_palette = [(0, 0, 0), (80, 80, 80), (240, 240, 240)]
    write_indexed_png(
        assets_dir / "dialogue_box.png",
        24,
        24,
        dialogue_palette,
        [0] * (24 * 24),
    )
    write_indexed_png(
        assets_dir / "dialogue_selector.png",
        8,
        8,
        dialogue_palette,
        [2] * (8 * 8),
    )
    write_indexed_png(
        assets_dir / "hud_market.png",
        24,
        24,
        dialogue_palette,
        [1] * (24 * 24),
    )
    write_indexed_png(
        assets_dir / "hud_sigil.png",
        16,
        16,
        dialogue_palette,
        [2] * (16 * 16),
    )
    write_indexed_png(
        assets_dir / "dialogue_font.png",
        128,
        112,
        dialogue_palette,
        [1] * (128 * 112),
    )
    shared_dialogue_ui = {
        "box_skin": "assets/dialogue_box.png",
        "hud_skin": "assets/hud_market.png",
        "selector_skin": "assets/dialogue_selector.png",
        "font_image": "assets/dialogue_font.png",
        "hud_presets": [{
            "id": "hud-market",
            "hud_skin": "assets/hud_market.png",
            "font_image": "assets/dialogue_font.png",
            "hud_position": "Inferior",
            "hud_width": 208,
            "hud_height": 32,
        }],
        "hud_scene_bindings": [{"scene_name": "market", "preset_id": "hud-market"}],
        "hud_layouts": [{
            "id": "hud-market",
            "mode": "advanced",
            "components": [{
                "id": "market-status",
                "kind": "text",
                "label": "Status",
                "text": "HP 03",
                "asset": "",
                "x": 8,
                "y": 136,
                "width": 64,
                "height": 8,
                "z_index": 1,
                "visible": True,
            }, {
                "id": "market-sigil",
                "kind": "icon",
                "label": "Nara",
                "text": "",
                "asset": "hud_sigil",
                "x": 8,
                "y": 128,
                "width": 16,
                "height": 16,
                "z_index": 2,
                "visible": True,
            }],
        }],
    }
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "mixed",
        "runtime_profile": "mixed",
        "template_dir": str(repo_root / "templates" / "exported_mixed"),
        "entry": "main.cpp",
        "project_data": "mixed_project_data.hpp",
        "generated_assets": [],
        "capability_manifest": {
            "schema": 1,
            "registry": "gba-studio-scene-capabilities",
            "scenes": [],
        },
        "asset_pack": {
            "assets": [{
                "id": "hud_sigil",
                "name": "hud_sigil",
                "kind": "obj",
                "png": "assets/hud_sigil.png",
                "sprite_width": 16,
                "sprite_height": 16,
                "header": "hud_sigil.hpp",
                "symbol": "hud_sigil",
            }]
        },
        "build": {
            "target": "mixed_runtime",
            "make_target": "all",
            "sources": ["main.cpp", "menu_runtime.cpp", "cutscene_runtime.cpp", "visual_novel_runtime.cpp", "world_map_runtime.cpp", "battle_rpg_runtime.cpp", "luta_runtime.cpp", "topdown_runtime.cpp", "platformer_runtime.cpp", "isometric_runtime.cpp", "dungeon_crawler_runtime.cpp", "racing_runtime.cpp", "shmup_runtime.cpp", "point_click_runtime.cpp"],
        },
        "runtime_dispatch": {
            "initial_runtime": "menu",
            "initial_room": 0,
            "runtimes": ["menu", "cutscene", "visual_novel", "world_map", "battle_rpg", "luta", "topdown", "platformer", "isometric", "dungeon_crawler", "racing", "shmup", "point_click"],
            "save": {
                "enabled": True,
                "autosave": True,
                "signature": "GBUS",
                "slot_capacity": 1024,
                "slot_count": 3,
                "offset": 0,
                "version": 1,
            },
        },
        "menu_project": {
            "initial_screen": 0,
            "dialogue_lines": [],
            "screens": [{
                "name": "title",
                "screen_type": "menu",
                "title": "Mixed Menu",
                "items": [{
                    "label": "start",
                    "line": -1,
                    "on_select": [{"op": "warp_runtime", "runtime": "topdown", "room": 0, "x": 8, "y": 8}],
                }],
            }],
        },
        "cutscene_project": {
            "initial_scene": 0,
            "scenes": [{
                "name": "intro",
                "steps": [{
                    "line": -1,
                    "duration_frames": 1,
                    "auto_advance": True,
                    "script": [{"op": "warp_runtime", "runtime": "topdown", "room": 0, "x": 8, "y": 8}],
                }],
            }],
            "dialogue_lines": [],
            "scripts": [],
        },
        "visual_novel_project": visual_novel_project(),
        "world_map_project": world_map_project(),
        "battle_rpg_project": {
            "initial_encounter": 0,
            "save": {"enabled": True, "autosave": True, "signature": "GBUS", "slot_capacity": 1024, "slot_count": 3},
            "dialogue_lines": ["Battle", "Victory"],
            "encounters": [{
                "name": "arena",
                "config": {"max_party_size": 1, "max_enemies": 1, "turn_delay_frames": 1, "active_time_battle": False, "escape_enabled": True},
                "party": [{"name": "Hero", "unit": {"max_hp": 10, "attack": 10, "defense": 0, "speed": 4}, "abilities": [{"kind": "attack", "power": 0}]}],
                "enemies": [{"name": "Slime", "unit": {"max_hp": 1, "attack": 1, "defense": 0, "speed": 1}, "abilities": [{"kind": "attack", "power": 0}]}],
                "rewards": {"gold": 1, "experience": 1},
                "on_enter": [{"op": "show_dialogue", "dialogue": 0}],
                "on_victory": [{"op": "show_dialogue", "dialogue": 1}, {"op": "warp_runtime", "runtime": "topdown", "room": 0, "x": 8, "y": 8}],
            }],
        },
        "luta_project": {
            "initial_stage": 0,
            "dialogue_lines": ["Arena", "Vitoria"],
            "stages": [{
                "name": "arena",
                "config": {
                    "round_time": 99,
                    "rounds_to_win": 1,
                    "max_super_gauge": 100,
                    "super_gauge_gain_on_hit": 8,
                    "super_gauge_gain_on_receive": 4,
                    "guard_power_recovery": 2,
                    "chip_damage_enabled": True,
                    "air_blocking_enabled": True,
                    "alpha_counter_enabled": True,
                    "throw_escape_window": 8,
                    "parry_window": 4,
                    "hitstun_decay": 0.85,
                    "combo_limit": 60,
                    "vism_custom_combo_gauge": 100,
                    "default_style": "a-ism",
                    "stage_id": "arena",
                    "player1_start_x": 64,
                    "player2_start_x": 176,
                },
                "player1": [{
                    "name": "Nara",
                    "unit": {"max_hp": 100, "attack": 12, "defense": 8, "speed": 10, "weight": 70},
                    "combo_stats": {"super_level": 1, "throw_range": 16, "guard_power": 48},
                }],
                "player2": [{
                    "name": "Rival",
                    "unit": {"max_hp": 100, "attack": 12, "defense": 8, "speed": 10, "weight": 70},
                    "combo_stats": {"super_level": 1, "throw_range": 16, "guard_power": 48},
                }],
                "on_victory": [{"op": "show_dialogue", "dialogue": 1}],
                "on_defeat": [{"op": "warp_runtime", "runtime": "topdown", "room": 0, "x": 8, "y": 8}],
            }],
        },
        "topdown_project": {
            "rooms": [{
                "name": "town",
                "width_tiles": 80,
                "height_tiles": 18,
                "visual_tiles": [0] * (80 * 18),
                "collision_flags": [0] * (80 * 18),
                "collision_slopes": [0, 2, 4] + [0] * (80 * 18 - 3),
                "npcs": [{
                    "name": "elephant",
                    "position": {"x": 80, "y": 64},
                    "size": {"x": 47, "y": 39},
                    "collision_offset": {"x": -21, "y": -31},
                }],
            }],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "collision_offset": {"x": -8, "y": -16},
                "speed": 1,
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
            "dialogue_lines": [],
            "scripts": [{
                "name": "to_stage",
                "script": [{"op": "warp_runtime", "runtime": "platformer", "room": 0, "x": 16, "y": 24}],
            }],
        },
        "platformer_project": {
            "initial_room": 0,
            "rooms": [{
                "name": "stage",
                "width_tiles": 161,
                "height_tiles": 18,
                "visual_tiles": [0] * (161 * 18),
                "collision_flags": [0] * (161 * 18),
                "collision_slopes": [0] * (161 * 18),
                "player_start": {"x": 8, "y": 8, "width": 16, "height": 16},
                "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
                "triggers": [{
                    "area": {"x": 8, "y": 8, "width": 16, "height": 16},
                    "on_enter": [{"op": "set_variable", "variable": 1, "value": 1}],
                    "on_leave": [{"op": "warp_runtime", "runtime": "isometric", "room": 0, "x": 1, "y": 1}],
                }],
            }],
            "dialogue_lines": [],
            "scripts": [],
        },
        "isometric_project": {
            "initial_room": 0,
            "rooms": [{
                "name": "cave",
                "width_tiles": 2,
                "height_tiles": 2,
                "visual_tiles": [0, 0, 0, 0],
                "collision_flags": [0, 0, 0, 0],
                "background_layers": {
                    "bg3": [3, 3, 3, 3],
                    "bg2": [2, 2, 2, 2],
                    "bg1": [1, 1, 1, 1],
                    "bg0": [4, 4, 4, 4],
                },
                "actors": [{"tile": {"x": 1, "y": 1, "z": 0}, "screen_offset": {"x": -8, "y": -16}}],
                "triggers": [{
                    "area": {"x": 0, "y": 0, "width": 1, "height": 1},
                    "on_enter": [{"op": "set_variable", "variable": 2, "value": 1}],
                    "on_leave": [{"op": "warp_runtime", "runtime": "topdown", "room": 0, "x": 8, "y": 8}],
                }],
            }],
            "dialogue_lines": [],
            "scripts": [],
        },
        "dungeon_crawler_project": {
            "initial_room": 0,
            "save": {"enabled": True, "signature": "GBUS", "slot_capacity": 1024, "slot_count": 3},
            "resource_banks": [{
                "name": "dungeon_bg",
                "kind": "bg_tiles",
                "start": 64,
                "count": 8,
                "alignment": 8,
            }],
            "resource_bank_groups": [{
                "name": "dungeon_crypt",
                "bank_indexes": [0],
            }],
            "rooms": [{
                "name": "crypt",
                "width_tiles": 3,
                "height_tiles": 3,
                "collision_flags": [1, 1, 1, 1, 0, 1, 1, 1, 1],
                "config": {"step_duration_frames": 12, "turn_duration_frames": 6, "allow_backstep": True, "view_distance": 5},
                "player_start": {"x": 1, "y": 1, "direction": "north"},
                "resource_bank_group": "dungeon_crypt",
                "triggers": [{
                    "area": {"x": 1, "y": 1, "width": 1, "height": 1},
                    "on_enter": [{"op": "warp_runtime", "runtime": "racing", "room": 0, "x": 16, "y": 16}],
                }],
            }],
            "dialogue_lines": [],
        },
        "racing_project": {
            "initial_room": 0,
            "save": {"enabled": True, "signature": "GBUS", "slot_capacity": 1024, "slot_count": 3},
            "resource_banks": [{
                "name": "racing_bg",
                "kind": "bg_tiles",
                "start": 96,
                "count": 8,
                "alignment": 8,
            }],
            "resource_bank_groups": [{
                "name": "racing_track",
                "bank_indexes": [0],
            }],
            "rooms": [{
                "name": "track",
                "width_tiles": 4,
                "height_tiles": 4,
                "collision_flags": [1, 1, 1, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 1, 1, 1],
                "config": {"max_speed_x256": 1024, "acceleration_x256_per_second": 2048, "brake_power_x256_per_second": 3072, "steering_speed_x256": 512},
                "player_start_pixels": {"x": 16, "y": 16},
                "resource_bank_group": "racing_track",
                "triggers": [{
                    "area": {"x": 8, "y": 8, "width": 16, "height": 16},
                    "on_enter": [{"op": "warp_runtime", "runtime": "topdown", "room": 0, "x": 8, "y": 8}],
                }],
            }],
        },
        "shmup_project": {
            "initial_wave": 0,
            "player": {
                "position": {"x": 32, "y": 72},
                "size": {"x": 16, "y": 16},
                "speed": 2,
                "fire_cooldown": 8,
                "projectile_offset": {"x": 16, "y": 4},
            },
            "projectile": {"size": {"x": 4, "y": 4}, "velocity": {"x": 4, "y": 0}, "max_active": 4},
            "waves": [{"name": "space", "start_frame": 0, "enemies": []}],
            "dialogue_lines": [],
        },
        "point_click_project": {
            "initial_scene": 0,
            "cursor_start": {"x": 120, "y": 80},
            "cursor_speed": 2,
            "scenes": [{"name": "console", "background": -1, "hotspots": []}],
            "dialogue_lines": [],
            "scripts": [],
        },
    }
    for project_key in (
        "topdown_project",
        "platformer_project",
        "isometric_project",
        "menu_project",
        "shmup_project",
        "point_click_project",
        "dungeon_crawler_project",
        "racing_project",
        "cutscene_project",
        "visual_novel_project",
        "world_map_project",
        "battle_rpg_project",
    ):
        manifest[project_key]["dialogue_ui"] = dict(shared_dialogue_ui)
    assert manifest["menu_project"]["screens"][0]["screen_type"] == "menu"
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    run_assetc(repo_root, manifest_path, output_dir)

    dialogue_ui_header_path = output_dir / "dialogue_ui_assets.hpp"
    assert dialogue_ui_header_path.exists()
    dialogue_ui_header = dialogue_ui_header_path.read_text(encoding="utf-8")
    assert "namespace gbastudio_dialogue_ui" in dialogue_ui_header
    assert "constexpr uint8_t dialogue_box_skin_tiles[9][32]" in dialogue_ui_header
    assert "constexpr uint8_t dialogue_choice_selector_tile[32]" in dialogue_ui_header
    assert "constexpr uint8_t hud_preset_hud_market_font_tiles[128][32]" in dialogue_ui_header
    assert "constexpr uint8_t dialogue_font_tiles[128][32]" in dialogue_ui_header
    assert "constexpr const gbs::DialogueFont* dialogue_font = &dialogue_font_value;" in dialogue_ui_header
    assert "hud_market" in dialogue_ui_header
    assert "hud_scene_bindings" in dialogue_ui_header
    assert "hud_layouts" in dialogue_ui_header
    assert "market-status" in dialogue_ui_header
    assert "gbs::HudLayoutComponent" in dialogue_ui_header
    assert "gbs::HudLayout" in dialogue_ui_header
    assert '#include "hud_sigil.hpp"' in dialogue_ui_header
    assert "&hud_sigil_metasprites[0]" in dialogue_ui_header
    assert "gbs::configure_hud_layouts(hud_layouts, hud_layout_count);" in dialogue_ui_header
    assert "gbs::configure_hud_layout(preset->id);" in dialogue_ui_header
    assert "struct HudLayoutComponent" not in dialogue_ui_header
    assert "configure_for_scene" in dialogue_ui_header
    assert "gbs::configure_dialogue_font(dialogue_font);" in dialogue_ui_header
    assert "gbs::configure_dialogue_font(preset->font != nullptr ? preset->font : dialogue_font);" in dialogue_ui_header

    runtime_sources = (
        repo_root / "examples" / "topdown_basic" / "src" / "main.cpp",
        repo_root / "examples" / "platformer_basic" / "src" / "main.cpp",
        repo_root / "examples" / "isometric_basic" / "src" / "main.cpp",
        repo_root / "templates" / "exported_menu" / "main.cpp",
        repo_root / "templates" / "exported_shmup" / "main.cpp",
        repo_root / "templates" / "exported_point_click" / "main.cpp",
        repo_root / "templates" / "exported_dungeon_crawler" / "main.cpp",
        repo_root / "templates" / "exported_racing" / "main.cpp",
        repo_root / "templates" / "exported_cutscene" / "main.cpp",
        repo_root / "templates" / "exported_visual_novel" / "main.cpp",
        repo_root / "templates" / "exported_world_map" / "main.cpp",
        repo_root / "templates" / "exported_battle_rpg" / "main.cpp",
        repo_root / "templates" / "exported_luta" / "main.cpp",
    )
    for runtime_source_path in runtime_sources:
        runtime_source = runtime_source_path.read_text(encoding="utf-8")
        assert '#include "gbs/runtime.hpp"' in runtime_source
        assert '#include "dialogue_ui_assets.hpp"' in runtime_source
        assert "gbastudio_dialogue_ui::configure_for_scene" in runtime_source

    assert (output_dir / "mixed_project_data.hpp").exists()
    assert (output_dir / "topdown_project_data.hpp").exists()
    assert (output_dir / "platformer_project_data.hpp").exists()
    assert (output_dir / "isometric_project_data.hpp").exists()
    assert (output_dir / "dungeon_crawler_project_data.hpp").exists()
    assert (output_dir / "racing_project_data.hpp").exists()
    assert (output_dir / "menu_project_data.hpp").exists()
    assert (output_dir / "cutscene_project_data.hpp").exists()
    assert (output_dir / "visual_novel_project_data.hpp").exists()
    assert (output_dir / "world_map_project_data.hpp").exists()
    assert (output_dir / "battle_rpg_project_data.hpp").exists()
    assert (output_dir / "luta_project_data.hpp").exists()
    assert (output_dir / "shmup_project_data.hpp").exists()
    assert (output_dir / "point_click_project_data.hpp").exists()
    mixed_header = (output_dir / "mixed_project_data.hpp").read_text(encoding="utf-8")
    topdown_header = (output_dir / "topdown_project_data.hpp").read_text(encoding="utf-8")
    platformer_header = (output_dir / "platformer_project_data.hpp").read_text(encoding="utf-8")
    isometric_header = (output_dir / "isometric_project_data.hpp").read_text(encoding="utf-8")
    dungeon_header = (output_dir / "dungeon_crawler_project_data.hpp").read_text(encoding="utf-8")
    racing_header = (output_dir / "racing_project_data.hpp").read_text(encoding="utf-8")
    menu_header = (output_dir / "menu_project_data.hpp").read_text(encoding="utf-8")
    shmup_header = (output_dir / "shmup_project_data.hpp").read_text(encoding="utf-8")
    topdown_runtime = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    platformer_runtime = (repo_root / "examples" / "platformer_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    isometric_runtime = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    menu_runtime = (repo_root / "templates" / "exported_menu" / "main.cpp").read_text(encoding="utf-8")
    cutscene_runtime = (repo_root / "templates" / "exported_cutscene" / "main.cpp").read_text(encoding="utf-8")
    visual_novel_runtime = (repo_root / "templates" / "exported_visual_novel" / "main.cpp").read_text(encoding="utf-8")
    world_map_runtime = (repo_root / "templates" / "exported_world_map" / "main.cpp").read_text(encoding="utf-8")
    point_click_runtime = (repo_root / "templates" / "exported_point_click" / "main.cpp").read_text(encoding="utf-8")
    shmup_runtime = (repo_root / "templates" / "exported_shmup" / "main.cpp").read_text(encoding="utf-8")
    dungeon_runtime = (repo_root / "templates" / "exported_dungeon_crawler" / "main.cpp").read_text(encoding="utf-8")
    racing_runtime = (repo_root / "templates" / "exported_racing" / "main.cpp").read_text(encoding="utf-8")
    luta_runtime = (repo_root / "templates" / "exported_luta" / "main.cpp").read_text(encoding="utf-8")
    dungeon_contract = (repo_root / "engine" / "include" / "gbs" / "dungeon_crawler.hpp").read_text(encoding="utf-8")
    racing_contract = (repo_root / "engine" / "include" / "gbs" / "racing.hpp").read_text(encoding="utf-8")
    mixed_runtime = (repo_root / "templates" / "exported_mixed" / "main.cpp").read_text(encoding="utf-8")
    core_runtime = (repo_root / "engine" / "src" / "gbs_core.cpp").read_text(encoding="utf-8")
    assert "gbs::EventOp::WarpRuntime" in topdown_header
    assert "gbs::make_save_signature('G', 'B', 'U', 'S')" in topdown_header
    assert "constexpr gbs::TileSlope town_collision_slopes[]" in topdown_header
    assert "gbs::TileSlope::BlockBelowRising" in topdown_header
    assert "gbs::TileSlope::BlockBelowFalling" in topdown_header
    assert "gbs::Vec2i { -8, -16 }" in topdown_header
    assert "gbs::Vec2i { -21, -31 }" in topdown_header
    assert "gbs::RuntimeTriggerData" in platformer_header
    assert "gbs::EventOp::WarpRuntime" in platformer_header
    assert "gbs::make_save_signature('G', 'B', 'U', 'S')" in platformer_header
    assert "gbs::RuntimeTriggerData" in isometric_header
    assert "gbs::EventOp::WarpRuntime" in isometric_header
    assert "gbs::RuntimeTriggerData" in dungeon_header
    assert "gbs::EventOp::WarpRuntime" in dungeon_header
    assert "constexpr bool save_enabled = true;" in dungeon_header
    assert "gbs::make_save_signature('G', 'B', 'U', 'S')" in dungeon_header
    assert '"dungeon_crypt"' in dungeon_header
    assert "constexpr gbs::ResourceBank resource_banks[]" in dungeon_header
    assert "gbs::RuntimeTriggerData" in racing_header
    assert "gbs::EventOp::WarpRuntime" in racing_header
    assert "constexpr bool save_enabled = true;" in racing_header
    assert "gbs::make_save_signature('G', 'B', 'U', 'S')" in racing_header
    assert '"racing_track"' in racing_header
    assert "constexpr gbs::ResourceBank resource_banks[]" in racing_header
    assert "gbs::make_save_signature('G', 'B', 'U', 'S')" in isometric_header
    assert "gbs::EventOp::WarpRuntime" in menu_header
    assert "gbs::RuntimeAdapterFrameResult update_menu_runtime(const gbs::RuntimeFrameContext& context)" in menu_runtime
    assert "void render_menu_runtime(const gbs::RuntimeFrameContext& context)" in menu_runtime
    assert "void leave_menu_runtime()" in menu_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in menu_runtime
    assert "GBS_MENU_RUNTIME_UPDATE" in menu_runtime
    assert "#if GBS_MULTI_RUNTIME" in menu_runtime
    assert "#ifdef GBS_MULTI_RUNTIME" not in menu_runtime
    assert "gbs::end_frame();" not in menu_runtime
    assert "const bool assets_are_streamed = project.resource_bank_group_count > 0;" in topdown_runtime
    assert "gbs::RuntimeAdapterFrameResult update_topdown_runtime(const gbs::RuntimeFrameContext& context)" in topdown_runtime
    assert "void render_topdown_runtime(const gbs::RuntimeFrameContext& context)" in topdown_runtime
    assert "void leave_topdown_runtime()" in topdown_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in topdown_runtime
    assert "GBS_TOPDOWN_RUNTIME_UPDATE" in topdown_runtime
    assert 'gbs::ResourceBankReservation project_bank_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));' in topdown_runtime
    assert 'gbs::ResourceBankReservation project_bank_scratch_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));' in topdown_runtime
    assert 'gbs::ResourceBankCacheEntry project_bank_cache_entries[max_project_resource_banks] __attribute__((section(".ewram_bss")));' in topdown_runtime
    assert "gbs::release_resource_bank_group(resources, project_bank_reservation);" in topdown_runtime
    assert "gbs::release_resource_bank_cache(resources, project_bank_cache);" in topdown_runtime
    assert "const bool assets_are_streamed = project.resource_bank_group_count > 0;" in platformer_runtime
    assert 'gbs::ResourceBankReservation bank_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));' in platformer_runtime
    assert 'gbs::ResourceBankReservation bank_scratch_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));' in platformer_runtime
    assert 'gbs::ResourceBankCacheEntry bank_cache_entries[gbs::max_resource_bank_cache_entries] __attribute__((section(".ewram_bss")));' in platformer_runtime
    assert "gbs::release_resource_bank_group(resources, bank_reservation);" in platformer_runtime
    assert "gbs::release_resource_bank_cache(resources, bank_cache);" in platformer_runtime
    assert "gbs::set_event_input_state(event_state, input.held, input.pressed, input.released);" in platformer_runtime
    assert "gbs::update_timer_event_bindings(event_state)" in platformer_runtime
    assert "gbs::enqueue_event_script(platformer_event_queue, project.scripts[script_index])" in platformer_runtime
    assert "constexpr int platform_callback_ground_start = 2;" in platformer_runtime
    assert "constexpr int platform_callback_blank_start = 15;" in platformer_runtime
    assert "consume_platformer_state_request(" in platformer_runtime
    assert "const bool assets_are_streamed = project.resource_bank_group_count > 0;" in isometric_runtime
    assert "constexpr size_t max_project_resource_banks = 64;" in isometric_runtime
    assert 'gbs::ResourceBankReservation bank_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));' in isometric_runtime
    assert 'gbs::ResourceBankReservation bank_scratch_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));' in isometric_runtime
    assert 'gbs::ResourceBankCacheEntry bank_cache_entries[max_project_resource_banks] __attribute__((section(".ewram_bss")));' in isometric_runtime
    assert "gbs::release_resource_bank_group(resources, bank_reservation);" in isometric_runtime
    assert "gbs::release_resource_bank_cache(resources, bank_cache);" in isometric_runtime
    assert "gbs::RuntimeAdapterFrameResult update_isometric_runtime(const gbs::RuntimeFrameContext& context)" in isometric_runtime
    assert "void render_isometric_runtime(const gbs::RuntimeFrameContext& context)" in isometric_runtime
    assert "void leave_isometric_runtime()" in isometric_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in isometric_runtime
    assert "GBS_ISOMETRIC_RUNTIME_UPDATE" in isometric_runtime
    assert "gbs::RuntimeAdapterFrameResult update_world_map_runtime(const gbs::RuntimeFrameContext& context)" in world_map_runtime
    assert "void render_world_map_runtime(const gbs::RuntimeFrameContext& context)" in world_map_runtime
    assert "void leave_world_map_runtime()" in world_map_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in world_map_runtime
    assert "GBS_WORLD_MAP_RUNTIME_UPDATE" in world_map_runtime
    assert "gbs::RuntimeAdapterFrameResult update_visual_novel_runtime(const gbs::RuntimeFrameContext& context)" in visual_novel_runtime
    assert "void render_visual_novel_runtime(const gbs::RuntimeFrameContext& context)" in visual_novel_runtime
    assert "void leave_visual_novel_runtime()" in visual_novel_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in visual_novel_runtime
    assert "GBS_VISUAL_NOVEL_RUNTIME_UPDATE" in visual_novel_runtime
    assert "gbs::RuntimeAdapterFrameResult update_cutscene_runtime(const gbs::RuntimeFrameContext& context)" in cutscene_runtime
    assert "void render_cutscene_runtime(const gbs::RuntimeFrameContext& context)" in cutscene_runtime
    assert "void leave_cutscene_runtime()" in cutscene_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in cutscene_runtime
    assert "GBS_CUTSCENE_RUNTIME_UPDATE" in cutscene_runtime
    assert "gbs::RuntimeAdapterFrameResult update_luta_runtime(const gbs::RuntimeFrameContext& context)" in luta_runtime
    assert "void render_luta_runtime(const gbs::RuntimeFrameContext& context)" in luta_runtime
    assert "void leave_luta_runtime()" in luta_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in luta_runtime
    assert "GBS_LUTA_RUNTIME_UPDATE" in luta_runtime
    assert "gbs::RuntimeAdapterFrameResult update_point_click_runtime(const gbs::RuntimeFrameContext& context)" in point_click_runtime
    assert "void render_point_click_runtime(const gbs::RuntimeFrameContext& context)" in point_click_runtime
    assert "void leave_point_click_runtime()" in point_click_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in point_click_runtime
    assert "GBS_POINT_CLICK_RUNTIME_UPDATE" in point_click_runtime
    assert "gbs::RuntimeAdapterFrameResult update_racing_runtime(const gbs::RuntimeFrameContext& context)" in racing_runtime
    assert "void render_racing_runtime(const gbs::RuntimeFrameContext& context)" in racing_runtime
    assert "void leave_racing_runtime()" in racing_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in racing_runtime
    assert "GBS_RACING_RUNTIME_UPDATE" in racing_runtime
    assert "gbs::RuntimeAdapterFrameResult update_dungeon_crawler_runtime(const gbs::RuntimeFrameContext& context)" in dungeon_runtime
    assert "void render_dungeon_crawler_runtime(const gbs::RuntimeFrameContext& context)" in dungeon_runtime
    assert "void leave_dungeon_crawler_runtime()" in dungeon_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in dungeon_runtime
    assert "GBS_DUNGEON_CRAWLER_RUNTIME_UPDATE" in dungeon_runtime
    assert "gbs::RuntimeAdapterFrameResult update_shmup_runtime(const gbs::RuntimeFrameContext& context)" in shmup_runtime
    assert "void render_shmup_runtime(const gbs::RuntimeFrameContext& context)" in shmup_runtime
    assert "void leave_shmup_runtime()" in shmup_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in shmup_runtime
    assert "GBS_SHMUP_RUNTIME_UPDATE" in shmup_runtime
    for runtime_source in (
        menu_runtime,
        cutscene_runtime,
        visual_novel_runtime,
        world_map_runtime,
        shmup_runtime,
        point_click_runtime,
    ):
        assert "gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);" in runtime_source
    assert "const bool assets_are_streamed = project.resource_bank_group_count > 0;" in point_click_runtime
    assert "constexpr size_t max_resource_bank_reservations = 64;" in point_click_runtime
    assert 'gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};' in point_click_runtime
    assert 'gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};' in point_click_runtime
    assert "stream_resources_for_wave" in shmup_runtime
    assert "const bool assets_are_streamed = project.resource_bank_group_count > 0;" in shmup_runtime
    assert 'gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};' in shmup_runtime
    assert 'gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};' in shmup_runtime
    assert "gbs::load_tilemap" in dungeon_runtime
    assert "gbs::set_metasprite" in dungeon_runtime
    assert "gbs::dungeon_runtime_metasprite" in dungeon_runtime
    assert "gbs::dungeon_project_actor" in dungeon_runtime
    assert "bool apply_dungeon_event_warp()" in dungeon_runtime
    assert "apply_dungeon_event_warp();" in dungeon_runtime
    assert "event_state.current_room = current_room_index;" in dungeon_runtime
    assert "gbs::draw_hud(hud)" in dungeon_runtime
    assert "gbs::init_hud(hud)" in dungeon_runtime
    hud_render_index = dungeon_runtime.find("gbs::draw_hud(hud);")
    hidden_dialogue_index = dungeon_runtime.find("if (!dialogue.visible) gbs::draw_dialogue(dialogue);")
    hidden_map_index = dungeon_runtime.find("if (!map_dialogue.visible) gbs::draw_dialogue(map_dialogue);")
    hidden_interaction_index = dungeon_runtime.find("if (!interaction_dialogue.visible) gbs::draw_dialogue(interaction_dialogue);")
    visible_dialogue_index = dungeon_runtime.find("if (dialogue.visible) gbs::draw_dialogue(dialogue);")
    visible_map_index = dungeon_runtime.find("if (map_dialogue.visible) gbs::draw_dialogue(map_dialogue);")
    visible_interaction_index = dungeon_runtime.find("if (interaction_dialogue.visible) gbs::draw_dialogue(interaction_dialogue);")
    assert -1 not in (hidden_dialogue_index, hidden_map_index, hidden_interaction_index, hud_render_index,
                      visible_dialogue_index, visible_map_index, visible_interaction_index)
    assert hidden_dialogue_index < hidden_map_index < hidden_interaction_index < hud_render_index
    assert hud_render_index < visible_dialogue_index < visible_map_index < visible_interaction_index
    assert "gbs::set_dialogue_frame(interaction_dialogue, gbs::dialogue_frame_default);" in dungeon_runtime
    assert "gbs::set_dialogue_frame(interaction_dialogue, gbs::dialogue_frame_battle_menu);" in dungeon_runtime
    battle_start_index = dungeon_runtime.find("bool start_dungeon_battle(size_t actor_index)")
    battle_update_index = dungeon_runtime.find("bool update_dungeon_interaction(", battle_start_index)
    assert battle_start_index >= 0 and battle_update_index > battle_start_index
    battle_start_runtime = dungeon_runtime[battle_start_index:battle_update_index]
    assert "gbs::hide_dialogue(dialogue);" in battle_start_runtime
    assert "runtime_script_controls_dialogue = false;" in battle_start_runtime
    assert "gbs::set_dialogue_frame(dialogue, gbs::dialogue_frame_default);" in dungeon_runtime
    assert "gbs::update_runtime_trigger" in dungeon_runtime
    assert "const bool assets_are_streamed = project.resource_bank_group_count > 0;" in dungeon_runtime
    assert "stream_resources_for_room" in dungeon_runtime
    assert "gbs::release_resource_bank_group(resource_manager, active_resource_banks);" in dungeon_runtime
    assert 'gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));' in dungeon_runtime
    assert 'gbs::EventState event_state __attribute__((section(".ewram_bss")));' in dungeon_runtime
    assert "sync_runtime_telemetry();" in dungeon_runtime
    assert "gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music]);" in dungeon_runtime
    assert "event_state.last_tracker_music = -1;" in dungeon_runtime
    assert "const TrackerAsset* tracker_assets = nullptr;" in dungeon_contract
    assert "size_t tracker_asset_count = 0;" in dungeon_contract
    assert "gbs::load_tilemap" in racing_runtime
    assert "gbs::set_metasprite" in racing_runtime
    assert "gbs::update_runtime_trigger" in racing_runtime
    assert "const bool assets_are_streamed = project.resource_bank_group_count > 0;" in racing_runtime
    assert "stream_resources_for_room" in racing_runtime
    assert "gbs::release_resource_bank_group(resource_manager, active_resource_banks);" in racing_runtime
    assert 'gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));' in racing_runtime
    assert 'gbs::EventState event_state __attribute__((section(".ewram_bss")));' in racing_runtime
    assert "sync_runtime_telemetry();" in racing_runtime
    assert "gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music]);" in racing_runtime
    assert "event_state.last_tracker_music = -1;" in racing_runtime
    assert "const TrackerAsset* tracker_assets = nullptr;" in racing_contract
    assert "size_t tracker_asset_count = 0;" in racing_contract
    assert "#define GBS_MIXED_HAS_MENU 1" in mixed_header
    assert "#define GBS_MIXED_HAS_CUTSCENE 1" in mixed_header
    assert "#define GBS_MIXED_HAS_VISUAL_NOVEL 1" in mixed_header
    assert "#define GBS_MIXED_HAS_WORLD_MAP 1" in mixed_header
    assert "#define GBS_MIXED_HAS_BATTLE_RPG 1" in mixed_header
    assert "#define GBS_MIXED_HAS_LUTA 1" in mixed_header
    assert "#define GBS_MIXED_HAS_SHMUP 1" in mixed_header
    assert "#define GBS_MIXED_HAS_POINT_CLICK 1" in mixed_header
    assert "#define GBS_MIXED_HAS_DUNGEON_CRAWLER 1" in mixed_header
    assert "#define GBS_MIXED_HAS_RACING 1" in mixed_header
    assert "resource_bank_upload_source_count" in shmup_header
    assert '#include "gbs/audio.hpp"' in mixed_runtime
    assert '#include "gbs/dma.hpp"' in mixed_runtime
    assert "gbs::audio_init();" not in mixed_runtime
    assert "gbs::audio_init();" not in topdown_runtime
    assert "audio_init();" in core_runtime
    assert "audio_update();" in core_runtime
    assert "gbs::dma_reset_vblank_queue();" in mixed_runtime
    assert "gbs::RuntimeKind::Menu" in mixed_header
    cutscene_runtime = (repo_root / "templates" / "exported_cutscene" / "main.cpp").read_text(encoding="utf-8")
    assert "GBS_CUTSCENE_RUNTIME_ENTRY" in cutscene_runtime
    assert "gbs::runtime_transition_pending()" in cutscene_runtime
    assert 'gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));' in cutscene_runtime
    assert 'gbs::EventState event_state __attribute__((section(".ewram_bss")));' in cutscene_runtime
    assert 'gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));' in cutscene_runtime
    assert "gbs::cutscene_step_background_index(*scene, *step)" in cutscene_runtime
    assert "apply_current_step_background();" in cutscene_runtime
    assert "if (input.was_pressed(gbs::ButtonA)) {\n        advance_step();" in cutscene_runtime
    assert "if (input.was_pressed(gbs::ButtonB)) {\n        skip_step();" in cutscene_runtime
    assert "if (input.was_pressed(gbs::ButtonStart)) {\n        skip_step();" in cutscene_runtime
    assert "gbs::RuntimeKind::Cutscene" in mixed_runtime
    assert "gbs_run_cutscene" in mixed_runtime
    visual_novel_runtime = (repo_root / "templates" / "exported_visual_novel" / "main.cpp").read_text(encoding="utf-8")
    world_map_runtime = (repo_root / "templates" / "exported_world_map" / "main.cpp").read_text(encoding="utf-8")
    assert "GBS_VISUAL_NOVEL_RUNTIME_ENTRY" in visual_novel_runtime
    assert "gbs::runtime_transition_pending()" in visual_novel_runtime
    assert "gbs::hide_hud(hud);\n        gbs::draw_hud(hud);" in visual_novel_runtime
    assert "GBS_WORLD_MAP_RUNTIME_ENTRY" in world_map_runtime
    assert "gbs::runtime_transition_pending()" in world_map_runtime
    assert "const auto focus = journey.active ? journey.position : selected->position_pixels;" in world_map_runtime
    assert "camera_x = gbs::world_map_clamp(focus.x - 120" in world_map_runtime
    assert "node.position_pixels.x-camera_x" in world_map_runtime
    assert "gbs::set_bg_scroll(background->layer,camera_x % 256,camera_y % 256)" in world_map_runtime
    assert "gbs_run_visual_novel" in mixed_runtime
    assert "gbs_run_world_map" in mixed_runtime
    battle_rpg_runtime = (repo_root / "templates" / "exported_battle_rpg" / "main.cpp").read_text(encoding="utf-8")
    for snippet in (
        "GBS_BATTLE_RPG_RUNTIME_ENTRY",
        "gbs::runtime_transition_pending()",
        "encounter.on_enter",
        "gbs::battle_rpg_outcome_script",
        "persist_battle_rpg_runtime_state",
        "gbs::show_dialogue",
        "gbs::play_sfx",
        "sync_runtime_telemetry",
    ):
        assert snippet in battle_rpg_runtime
    dialogue_render_index = battle_rpg_runtime.rfind("gbs::draw_dialogue(battle_menu_dialogue);")
    hud_render_index = battle_rpg_runtime.rfind("gbs::draw_hud(battle_hud);")
    assert dialogue_render_index >= 0 and hud_render_index > dialogue_render_index
    assert "gbs::hide_sprites(0, 88);" in battle_rpg_runtime
    assert "gbs::RuntimeAdapterFrameResult update_battle_rpg_runtime(const gbs::RuntimeFrameContext& context)" in battle_rpg_runtime
    assert "void render_battle_rpg_runtime(const gbs::RuntimeFrameContext& context)" in battle_rpg_runtime
    assert "void leave_battle_rpg_runtime()" in battle_rpg_runtime
    assert "return gbs::RuntimeAdapterFrameResult::Transition;" in battle_rpg_runtime
    assert "GBS_BATTLE_RPG_RUNTIME_UPDATE" in battle_rpg_runtime
    assert "gbs_run_battle_rpg" in mixed_runtime
    assert "gbs_run_luta" in mixed_runtime
    assert "cave_bg3_tiles" in isometric_header
    assert "cave_bg2_tiles" in isometric_header
    assert "cave_bg1_tiles" in isometric_header
    assert "cave_bg0_tiles" in isometric_header
    assert "constexpr bool save_enabled = true;" in mixed_header
    assert "gbs::make_save_signature('G', 'B', 'U', 'S')" in mixed_header
    assert "gbs::RuntimeSceneDescriptor runtime_scene_registry[]" in mixed_header
    assert "gbs::RuntimeSceneRegistry runtime_registry" in mixed_header
    output_manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    assert output_manifest["runtime_adapter"]["base_runtime"] == "mixed"
    assert output_manifest["build"]["sources"] == manifest["build"]["sources"]

    export_schema = json.loads((repo_root / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    project_schema = json.loads((repo_root / "schemas" / "gbastudio_project.schema.json").read_text(encoding="utf-8"))
    assert "mixed" in export_schema["properties"]["kind"]["enum"]
    assert "mixed" in project_schema["properties"]["kind"]["enum"]

    engine_manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    runtime_capabilities = engine_manifest["capabilities"]["runtime_profiles"]
    event_capabilities = engine_manifest["capabilities"]["events"]
    assert "mixed_runtime_dispatch" in runtime_capabilities
    assert "warp_runtime" in event_capabilities

    for schema_document in (manifest_path, output_dir / "gbastudio_project.json"):
        validation = subprocess.run(
            [
                sys.executable,
                str(repo_root / "tools" / "gbsdoctor" / "gbsdoctor.py"),
                "--engine-pack",
                str(repo_root),
                "--validate-public-schema",
                "auto",
                "--schema-document",
                str(schema_document),
                "--json",
            ],
            check=False,
            capture_output=True,
            text=True,
        )
        assert validation.returncode == 0, validation.stdout + validation.stderr
        assert json.loads(validation.stdout)["ok"] is True


def write_indexed_png(path, width, height, palette, indices, transparent_index=None):
    def chunk(kind, payload):
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    rows = []
    for y in range(height):
        start = y * width
        rows.append(bytes([0]) + bytes(indices[start:start + width]))
    data = b"\x89PNG\r\n\x1a\n"
    data += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 3, 0, 0, 0))
    data += chunk(b"PLTE", b"".join(bytes(color) for color in palette))
    if transparent_index is not None:
        transparency = bytes(0 if index == transparent_index else 255 for index in range(len(palette)))
        data += chunk(b"tRNS", transparency)
    data += chunk(b"IDAT", zlib.compress(b"".join(rows)))
    data += chunk(b"IEND", b"")
    path.write_bytes(data)


def assert_topdown_visual_tiles_can_follow_asset_tilemap(repo_root, build_dir):
    source_dir = build_dir / "topdown_asset_tilemap_visuals" / "source"
    output_dir = build_dir / "topdown_asset_tilemap_visuals" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    # Four source tiles where tile 1 duplicates tile 0. Raw visual IDs [2, 3, 1, 0]
    # must become the deduped asset tilemap IDs [1, 2, 0, 0].
    palette = [
        (0, 0, 0),
        (255, 0, 0),
        (0, 255, 0),
        (0, 0, 255),
    ]
    indices = []
    for _ in range(8):
        indices.extend([1] * 8)
        indices.extend([1] * 8)
        indices.extend([2] * 8)
        indices.extend([3] * 8)
    write_indexed_png(assets_dir / "tiles.png", 32, 8, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "topdown_asset_tilemap_visuals", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": [
                "topdown_project_data",
                "asset_export_topdown_visual_tilemap_refs",
            ],
        },
        "topdown_project": {
            "assets": {
                "bg_palettes": ["room_bg"],
                "tile_assets": ["room_bg"],
            },
            "backgrounds": [
                {"layer": "bg1", "tilemap": "room_bg"}
            ],
            "rooms": [
                {
                    "name": "remap_room",
                    "width_tiles": 2,
                    "height_tiles": 2,
                    "visual_tiles": [2, 3, 1, 0],
                    "foreground_tiles": [-1, 3, -1, 2],
                    "visual_tilemap": "room_bg",
                    "collision_flags": [0, 0, 0, 0],
                    "metadata": {
                        "camera_mode": "fixed",
                        "camera_position": {"x": 0, "y": 0},
                        "player_start": {"x": 8, "y": 8},
                    },
                }
            ],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "emit_animation_fallback": True,
                "on_start": [{"op": "set_variable", "variable": 16, "value": 1}],
                "on_update": [{"op": "set_variable", "variable": 17, "value": 1}],
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        },
        "asset_pack": {
            "assets": [
                {
                    "name": "room_bg",
                    "id": "room_bg",
                    "bank_group": "room_0",
                    "kind": "bg",
                    "png": "assets/tiles.png",
                    "header": "generated_room_bg.hpp",
                    "symbol": "generated_room_bg",
                }
            ]
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr uint16_t remap_room_visual_tiles[] = {\n    2, 3, 1, 1\n};" in header
    assert "constexpr uint16_t remap_room_foreground_tiles[] = {\n    0, 3, 0, 2\n};" in header
    first_report = json.loads((output_dir / "asset_pack_report.json").read_text(encoding="utf-8"))
    first_allocation = first_report["allocations"][0]
    first_header = first_report["export_plan"]["headers"][0]
    assert first_allocation["resource_cache"] == "computed"
    assert first_allocation["resource_config_fingerprint"]
    assert first_header["derived"]["tilemap_values"] == [1, 1, 2, 3]
    assert first_header["derived_cache"] == "computed"

    run_assetc(repo_root, manifest_path, output_dir)
    incremental_header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    incremental_report = json.loads((output_dir / "asset_pack_report.json").read_text(encoding="utf-8"))
    incremental_allocation = incremental_report["allocations"][0]
    incremental_plan_header = incremental_report["export_plan"]["headers"][0]
    assert incremental_header == header
    assert incremental_allocation["resource_cache"] == "reused"
    assert incremental_plan_header["derived_cache"] == "reused"
    assert incremental_plan_header["derived"]["tilemap_values"] == [1, 1, 2, 3]


def assert_source_asset_tilemaps_repeat_for_wider_rooms(repo_root, build_dir):
    source_dir = build_dir / "source_asset_tilemap_repeat" / "source"
    output_dir = build_dir / "source_asset_tilemap_repeat" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    # A 2x2 source tilemap is intentionally used by a 3x2 room. The source
    # asset layout must repeat complete rows instead of rejecting the wider
    # viewport, which is how GBA scenes keep a viewport-sized background.
    palette = [(0, 0, 0), (255, 0, 0), (0, 255, 0), (0, 0, 255), (255, 255, 0)]
    indices = []
    for y in range(16):
        for x in range(16):
            indices.append(1 + (y // 8) * 2 + (x // 8))
    write_indexed_png(assets_dir / "room.png", 16, 16, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "source_asset_tilemap_repeat", "make_target": "all"},
        "requires": {"engine_pack": ">=2.25.0", "features": ["topdown_project_data"]},
        "topdown_project": {
            "assets": {"bg_palettes": ["room_bg"], "tile_assets": ["room_bg"]},
            "rooms": [{
                "name": "repeat_room",
                "width_tiles": 3,
                "height_tiles": 2,
                "visual_tiles": [0, 0, 0, 0, 0, 0],
                "visual_tilemap": "room_bg",
                "visual_tilemap_layout": "source_asset",
                "collision_flags": [0, 0, 0, 0, 0, 0],
                "metadata": {"camera_mode": "fixed", "camera_position": {"x": 0, "y": 0}, "player_start": {"x": 8, "y": 8}}
            }],
            "player": {"position": {"x": 8, "y": 8}, "size": {"x": 16, "y": 16}, "speed": 1},
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True}
        },
        "asset_pack": {"assets": [{
            "name": "room_bg",
            "id": "room_bg",
            "bank_group": "room_0",
            "kind": "bg",
            "png": "assets/room.png",
            "header": "generated_room_bg.hpp",
            "symbol": "generated_room_bg"
        }]}
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr uint16_t repeat_room_visual_tiles[] = {\n    1, 2, 1, 3, 4, 3\n};" in header


def assert_incremental_export_regenerates_headers_after_contract_revision(repo_root, build_dir):
    source_dir = build_dir / "incremental_header_contract_revision" / "source"
    output_dir = build_dir / "incremental_header_contract_revision" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    write_indexed_png(
        assets_dir / "room.png",
        8,
        8,
        [(0, 0, 0), (255, 0, 0)],
        [index % 2 for index in range(64)],
    )

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "topdown_project": {
            "assets": {"bg_palettes": ["room_bg"], "tile_assets": ["room_bg"]},
            "rooms": [{
                "name": "contract_revision_room",
                "width_tiles": 1,
                "height_tiles": 1,
                "visual_tiles": [0],
                "collision_flags": [0],
                "metadata": {
                    "camera_mode": "fixed",
                    "camera_position": {"x": 0, "y": 0},
                    "player_start": {"x": 8, "y": 8},
                },
            }],
            "player": {"position": {"x": 8, "y": 8}, "size": {"x": 8, "y": 8}, "speed": 1},
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        },
        "asset_pack": {"assets": [{
            "name": "room_bg",
            "id": "room_bg",
            "kind": "bg",
            "png": "assets/room.png",
            "header": "generated_room_bg.hpp",
            "symbol": "generated_room_bg",
        }]},
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)

    header_path = output_dir / "generated_room_bg.hpp"
    current_header = header_path.read_text(encoding="utf-8")
    stale_header = current_header.replace(
        "generated_room_bg_tile_count, 1, false };",
        "generated_room_bg_tile_count, 1, false, 4 };",
    ).replace(
        "generated_room_bg_tilemap_height };",
        "generated_room_bg_tilemap_height, 4 };",
    )
    assert stale_header != current_header
    header_path.write_text(stale_header, encoding="utf-8")

    report_path = output_dir / "asset_pack_report.json"
    legacy_report = json.loads(report_path.read_text(encoding="utf-8"))
    legacy_report["export_plan"]["schema"] = 1
    report_path.write_text(json.dumps(legacy_report, indent=2) + "\n", encoding="utf-8")

    run_assetc(repo_root, manifest_path, output_dir)
    regenerated_header = header_path.read_text(encoding="utf-8")
    assert "generated_room_bg_tile_count, 1, false, 4" not in regenerated_header
    assert "generated_room_bg_tilemap_height, 4" not in regenerated_header


def assert_topdown_player_animation_frame_subsets_export(repo_root, build_dir):
    source_dir = build_dir / "topdown_animation_frames" / "source"
    output_dir = build_dir / "topdown_animation_frames" / "exported"
    assets_dir = source_dir / "assets"
    source_dir.mkdir(parents=True)
    assets_dir.mkdir(parents=True)
    shutil.copyfile(repo_root / "examples" / "topdown_basic" / "src" / "player_sprite_asset.hpp", assets_dir / "player_sprite_asset.hpp")
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "topdown_animation_frames", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "asset-export-topdown-animation-frame-subsets"],
        },
        "topdown_project": {
            "includes": ["assets/player_sprite_asset.hpp"],
            "rooms": [
                {
                    "name": "anim_room",
                    "width_tiles": 2,
                    "height_tiles": 2,
                    "visual_tiles": [0, 0, 0, 0],
                    "collision_flags": [0, 0, 0, 0],
                    "metadata": {"player_start": {"x": 8, "y": 8}},
                }
            ],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "metasprite": {"symbol": "player_sprite_metasprites[1]"},
                "animation": "idle_down",
                "animations": [
                    {
                        "name": "idle_down",
                        "asset": {"symbol": "player_sprite"},
                        "frame_indices": [1],
                        "durations": [9],
                    },
                    {
                        "name": "walk_down",
                        "asset": {"symbol": "player_sprite"},
                        "frame_indices": [1, 0],
                        "durations": [4, 5],
                    },
                ],
                "emit_animation_fallback": False,
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr gbs::SpriteAnimationFrame player_idle_down_animation_frames[] = {" in header
    assert "{ player_sprite_metasprites[1], 9 }" in header
    assert "constexpr gbs::SpriteAnimationFrame player_walk_down_animation_frames[] = {" in header
    assert "{ player_sprite_metasprites[1], 4 }" in header
    assert "{ player_sprite_metasprites[0], 5 }" in header
    assert "&player_idle_down_animation" in header
    assert "&player_walk_down_animation" in header


def assert_adapter_profile_output(output_dir, canonical, project_block):
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest.get("runtime_adapter", {})
    assert manifest["kind"] == canonical
    assert manifest["runtime_profile"] == canonical
    assert adapter["base_runtime"] == "topdown"
    assert adapter["adapter"] == "topdown_adapter"
    assert adapter["project_block"] == project_block
    assert adapter["native"] is False
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "const gbs::TopDownProjectData project" in header
    assert "gbs::EventOp::ShowDialogue" in header


def assert_ready_system_event_ops_export(repo_root, build_dir):
    source_dir = build_dir / "ready_system_events" / "source"
    output_dir = build_dir / "ready_system_events" / "exported"
    source_dir.mkdir(parents=True)
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "ready_system_events", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.24.0",
            "features": [
                "topdown_project_data",
                "events.ready_system_ops",
            ],
        },
        "topdown_project": {
            "initial_room": 0,
            "scripts": [
                {
                    "name": "ready_global",
                    "script": [{"op": "set_variable", "variable": 3, "value": 1}],
                }
            ],
            "rooms": [
                {
                    "name": "ready_room",
                    "width_tiles": 2,
                    "height_tiles": 2,
                    "visual_tiles": [0, 1, 1, 0],
                    "collision_flags": [0, 0, 0, 0],
                    "metadata": {
                        "camera_mode": "fixed",
                        "camera_position": {"x": 0, "y": 0},
                        "player_start": {"x": 8, "y": 8},
                    },
                    "on_enter": [
                        {"op": "open_text_input", "variable": 0, "max_length": 8, "charset": "latin_upper"},
                        {"op": "open_code_lock", "variable": 1, "digits": 4, "code": "4321"},
                        {"op": "open_equip_menu", "slots": 5, "pause": True},
                        {"op": "set_equipped_item", "slot": 0, "item": "sword"},
                        {"op": "push_actor", "actor": 1, "value": True},
                        {"op": "set_player_speed_profile", "walk_speed": 100, "run_speed": 160, "stamina_cost": 2},
                        {"op": "set_player_movement_state", "state": "swimming", "tile_tag": "water"},
                        {"op": "start_game_clock", "minutes_per_tick": 10, "frames_per_tick": 180, "hud": "hud"},
                        {"op": "advance_time", "minutes": 60},
                        {"op": "set_stat", "stat": "hp", "current": 16, "max": 16},
                        {"op": "modify_stat", "stat": "hp", "delta": -1},
                        {"op": "multiply_variable", "variable": 2, "value": 3},
                        {"op": "divide_variable", "variable": 2, "value": 3},
                        {"op": "mod_variable", "variable": 2, "value": 5},
                        {"op": "add_variable_flags", "variable": 2, "mask": 2},
                        {"op": "set_variable_flags", "variable": 3, "mask": 5},
                        {"op": "clear_variable_flags", "variable": 3, "mask": 1},
                        {"op": "reset_variables_false"},
                        {"op": "random_variable", "variable": 2, "min": 1, "max": 6},
                        {"op": "set_random_seed", "variable": 2},
                        {"op": "show_stat_bar", "stat": "hp", "x": 8, "width": 64},
                        {"op": "show_hearts", "stat": "hp", "units_per_heart": 4, "hearts": 4},
                        {"op": "modify_wallet", "variable": 2, "delta": 25, "max": 999},
                        {"op": "show_number_hud", "variable": 2, "x": 200, "digits": 3},
                        {"op": "fade_out", "frames": 24},
                        {"op": "fade_in", "frames": 12},
                        {"op": "visual_effect", "effect": "palette_flash", "layer": "bg0", "frames": 18, "intensity": 70},
                        {"op": "set_camera_shake", "frames": 6, "magnitude": 2},
                        {"op": "set_camera_property", "property": "x", "value": 32},
                        {"op": "set_camera_property", "property": "camera_y", "value": 48},
                        {"op": "set_camera_property", "property": "follow_player", "value": 1},
                        {"op": "set_camera_property", "property": "delta_x", "value": -8},
                        {"op": "move_camera", "dx": -12, "dy": 6},
                        {"op": "set_camera_bounds_x", "min": 0, "max": 320},
                        {"op": "set_camera_bounds_y", "min": 0, "max": 240},
                        {"op": "replace_tile", "x": 4, "y": 6, "tile": 12, "layer": "bg0"},
                    {"op": "replace_tile_sequence", "x": 5, "y": 6, "tile": 20, "count": 3, "layer": "bg2"},
                    {"op": "overlay_line", "line": 72},
                        {"op": "overlay_show", "x": 8, "y": 104, "width": 144, "height": 32},
                        {"op": "overlay_move", "x": 16, "y": 96, "frames": 24},
                        {"op": "overlay_hide", "frames": 12},
                        {"op": "set_background_palette", "index": 2, "frames": 10},
                        {"op": "set_sprite_palette", "index": 3, "frames": 6},
                        {"op": "mute_audio_channel", "channel": "music", "muted": True},
                        {"op": "set_audio_volume", "channel": "sfx", "volume": 12},
                        {"op": "fade_audio_volume", "channel": "pcm_music", "volume": 4, "frames": 90},
                        {"op": "run_audio_routine", "index": 0},
                        {"op": "play_pcm_sfx", "index": 1, "volume": 9, "priority": 12},
                        {"op": "set_text_sfx", "index": 0},
                        {"op": "set_dialogue_frame", "index": 2},
                        {"op": "set_dialogue_text_speed", "frames": 3},
                        {"op": "set_dialogue_language", "locale": 3},
                        {"op": "read_rtc", "field": "hour", "variable": 8},
                        {"op": "if_rtc", "field": "weekday", "value": 6, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_variable_equals", "variable": 2, "value": 1, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "warp", "room": 0, "x": 1, "y": 1},
                        {"op": "jump_if_variable_greater_than", "variable": 2, "value": 1, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_variable_less_than", "variable": 2, "value": 9, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_variable_equals_variable", "variable": 2, "other_variable": 3, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_variable_not_equals", "variable": 2, "value": 9, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_room_equals", "room": 0, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "store_engine_field", "field": "player_x", "variable": 4},
                        {"op": "jump_if_engine_field_equals", "field": "player_y", "value": 8, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_engine_field_equals_variable", "field": "camera_y", "variable": 3, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "store_actor_position", "actor": 1, "variable_x": 5, "variable_y": 6},
                        {"op": "store_actor_direction", "actor": 1, "variable": 7},
                        {"op": "set_actor_collision_enabled", "actor": 1, "value": False},
                        {"op": "set_actor_collision_box", "actor": 1, "offset_x": -2, "offset_y": 1, "width": 6, "height": 10},
                        {"op": "set_all_sprites_visible", "value": False},
                        {"op": "push_actor_away_from_player", "actor": 1, "tiles": 2},
                        {"op": "jump_if_button_pressed", "button": "start", "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "wait_button_pressed", "button": "start"},
                        {"op": "rate_limit", "slot": 4, "frames": 45, "offset": 2},
                        {"op": "save_game", "slot": 2},
                        {"op": "load_game", "slot": 1},
                        {"op": "remove_save_game", "slot": 2},
                        {"op": "jump_if_save_exists", "slot": 1, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "store_save_exists", "slot": 1, "variable": 4},
                        {"op": "projectile_load_slot", "slot": 3, "damage": 2, "speed": 180},
                        {"op": "launch_projectile", "actor": 1, "direction": "right"},
                        {"op": "launch_projectile_slot", "actor": 1, "slot": 3, "direction": "up_left"},
                        {"op": "show_actor_gesture", "actor": 1, "gesture": "shock", "index": 5, "frames": 45},
                        {"op": "lock_script", "script": 0},
                        {"op": "unlock_script", "script": 0},
                        {"op": "scene_stack_push", "runtime": "platformer"},
                        {"op": "scene_stack_previous", "runtime": "topdown"},
                        {"op": "scene_stack_first", "runtime": "point_click"},
                        {"op": "scene_stack_clear"},
                        {"op": "start_actor_update_script", "actor": 1},
                        {"op": "stop_actor_update_script", "actor": 1},
                        {"op": "start_segment", "segment": 7, "script": 0},
                        {"op": "stop_segment", "segment": 7},
                        {"op": "pause_scene_type", "scene_type": "topdown"},
                        {"op": "resume_scene_type", "scene_type": "topdown"},
                        {"op": "attach_adventure_callback", "callback": "on_interact", "script": 0},
                        {"op": "remove_adventure_callback", "callback": "on_room_enter"},
                        {"op": "attach_button_event", "button": "start", "script": 0, "override": True},
                        {"op": "remove_button_event", "button": "select"},
                        {"op": "attach_timer_event", "frames": 90, "script": 0},
                        {"op": "restart_timer_event", "script": 0},
                        {"op": "remove_timer_event", "script": 0},
                        {"op": "add_inventory_item", "item": 0, "quantity": 3},
                        {"op": "remove_inventory_item", "item": 0, "quantity": 1},
                        {"op": "jump_if_inventory_at_least", "item": 0, "quantity": 2, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_actor_direction", "actor": 1, "direction": "right", "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_actor_at_position", "actor": 1, "x": 4, "y": 3, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_actor_distance", "actor": 1, "other_actor": 0, "distance": 4, "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "jump_if_actor_relative", "actor": 1, "other_actor": 0, "relation": "right", "offset": 2},
                        {"op": "jump", "offset": 2},
                        {"op": "call_script", "script": 0},
                        {"op": "call_script", "script": 0},
                    ],
                }
            ],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "on_start": [{"op": "set_variable", "variable": 16, "value": 1}],
                "on_update": [{"op": "set_variable", "variable": 17, "value": 1}],
                "emit_animation_fallback": True,
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    for op_name in [
        "OpenTextInput",
        "OpenCodeLock",
        "OpenEquipMenu",
        "SetEquippedItem",
        "PushActor",
        "SetPlayerSpeedProfile",
        "SetPlayerMovementState",
        "StartGameClock",
        "AdvanceTime",
        "SetStat",
        "ModifyStat",
        "MultiplyVariable",
        "DivideVariable",
        "ModuloVariable",
        "AddVariableFlags",
        "SetVariableFlags",
        "ClearVariableFlags",
        "ResetVariablesFalse",
        "RandomVariable",
        "SetRandomSeed",
        "ShowStatBar",
        "ShowHearts",
        "ModifyWallet",
        "ShowNumberHud",
        "FadeOut",
        "FadeIn",
        "VisualEffect",
        "SetCameraShake",
        "SetCameraProperty",
        "MoveCamera",
        "SetCameraBoundsX",
        "SetCameraBoundsY",
        "ReplaceTile",
        "OverlayLine",
        "OverlayShow",
        "OverlayMove",
        "OverlayHide",
        "MuteAudioChannel",
        "SetAudioVolume",
        "FadeAudioVolume",
        "RunAudioRoutine",
        "PlayPcmSfx",
        "SetTextSfx",
        "SetDialogueFrame",
        "SetDialogueTextSpeed",
        "SetDialogueLanguage",
        "ReadRtc",
        "JumpIfRtcEquals",
        "JumpIfVariableEquals",
        "JumpIfVariableGreaterThan",
        "JumpIfVariableLessThan",
        "JumpIfVariableEqualsVariable",
        "JumpIfVariableNotEquals",
        "JumpIfRoomEquals",
        "StoreEngineField",
        "JumpIfEngineFieldEquals",
        "JumpIfEngineFieldEqualsVariable",
        "StoreActorPosition",
        "StoreActorDirection",
        "SetActorCollisionEnabled",
        "SetActorCollisionBox",
        "SetAllSpritesVisible",
        "PushActorAwayFromPlayer",
        "JumpIfButtonPressed",
        "WaitButtonPressed",
        "RateLimit",
        "SaveGame",
        "LoadGame",
        "RemoveSaveGame",
        "JumpIfSaveExists",
        "StoreSaveExists",
        "ProjectileLoadSlot",
        "LaunchProjectile",
        "LaunchProjectileSlot",
        "ShowActorGesture",
        "LockScript",
        "UnlockScript",
        "SceneStackPush",
        "SceneStackPrevious",
        "SceneStackFirst",
        "SceneStackClear",
        "StartActorUpdateScript",
        "StopActorUpdateScript",
        "StartSegment",
        "StopSegment",
        "PauseSceneType",
        "ResumeSceneType",
        "AttachAdventureCallback",
        "RemoveAdventureCallback",
        "AttachButtonEvent",
        "RemoveButtonEvent",
        "AttachTimerEvent",
        "RestartTimerEvent",
        "RemoveTimerEvent",
        "AddInventoryItem",
        "RemoveInventoryItem",
        "JumpIfInventoryAtLeast",
        "JumpIfActorDirection",
        "JumpIfActorAtPosition",
        "JumpIfActorDistance",
        "JumpIfActorRelative",
        "Jump",
        "CallScript",
    ]:
        assert f"gbs::EventOp::{op_name}" in header
    assert "constexpr gbs::EventScript project_scripts[]" in header
    assert "gbs::EventOp::SetVariable, 3, 1, 0" in header
    assert "gbs::EventOp::ReadRtc, 4, 8, 0" in header
    assert "gbs::EventOp::JumpIfRtcEquals, 3, 6, 2" in header
    assert "gbs::EventOp::StoreEngineField, 3, 4, 0" in header
    assert "gbs::EventOp::JumpIfEngineFieldEquals, 4, 8, 2" in header
    assert "gbs::EventOp::JumpIfEngineFieldEqualsVariable, 2, 3, 2" in header
    assert "gbs::EventOp::StoreActorPosition, 1, 5, 6" in header
    assert "gbs::EventOp::StoreActorDirection, 1, 7, 0" in header
    assert "gbs::EventOp::SetActorCollisionEnabled, 1, 0, 0" in header
    assert "gbs::EventOp::SetActorCollisionBox, 1, -511, 1546" in header
    assert "gbs::EventOp::SetAllSpritesVisible, 0, 0, 0" in header
    assert "gbs::EventOp::PushActorAwayFromPlayer, 1, 2, 0" in header
    assert "gbs::EventOp::FadeOut, 24, 0, 0" in header
    assert "gbs::EventOp::FadeIn, 12, 0, 0" in header
    assert "gbs::EventOp::VisualEffect, 257, 18, 70" in header
    assert "gbs::EventOp::SetAudioVolume, 1, 12, 0" in header
    assert "gbs::EventOp::FadeAudioVolume, 2, 4, 90" in header
    assert "gbs::EventOp::PlayPcmSfx, 1, 9, 12" in header
    assert "gbs::EventOp::SetCameraProperty, 0, 32, 0" in header
    assert "gbs::EventOp::SetCameraProperty, 1, 48, 0" in header
    assert "gbs::EventOp::SetCameraProperty, 2, 1, 0" in header
    assert "gbs::EventOp::SetCameraProperty, 3, -8, 0" in header
    assert "gbs::EventOp::AddVariableFlags, 2, 2, 0" in header
    assert "gbs::EventOp::SetVariableFlags, 3, 5, 0" in header
    assert "gbs::EventOp::ClearVariableFlags, 3, 1, 0" in header
    assert "gbs::EventOp::ResetVariablesFalse, 0, 0, 0" in header
    assert "gbs::EventOp::JumpIfButtonPressed, 8, 0, 2" in header
    assert "gbs::EventOp::WaitButtonPressed, 8, 0, 0" in header
    assert "gbs::EventOp::RateLimit, 4, 45, 2" in header
    assert "gbs::EventOp::SaveGame, 2, 0, 0" in header
    assert "gbs::EventOp::LoadGame, 1, 0, 0" in header
    assert "gbs::EventOp::RemoveSaveGame, 2, 0, 0" in header
    assert "gbs::EventOp::JumpIfSaveExists, 1, 0, 2" in header
    assert "gbs::EventOp::StoreSaveExists, 1, 4, 0" in header
    assert "gbs::EventOp::ProjectileLoadSlot, 3, 2, 180" in header
    assert "gbs::EventOp::LaunchProjectile, 1, 0, 3" in header
    assert "gbs::EventOp::LaunchProjectileSlot, 1, 3, 6" in header
    assert "gbs::EventOp::ShowActorGesture, 1, 5, 45" in header
    assert "gbs::EventOp::LockScript, 0, 0, 0" in header
    assert "gbs::EventOp::UnlockScript, 0, 0, 0" in header
    assert "gbs::EventOp::SceneStackPush, 1, 0, 0" in header
    assert "gbs::EventOp::SceneStackPrevious, 0, 0, 0" in header
    assert "gbs::EventOp::SceneStackFirst, 5, 0, 0" in header
    assert "gbs::EventOp::SceneStackClear, 0, 0, 0" in header
    assert "gbs::EventOp::StartActorUpdateScript, 1, 0, 0" in header
    assert "gbs::EventOp::StopActorUpdateScript, 1, 0, 0" in header
    assert "gbs::EventOp::StartSegment, 7, 0, 0" in header
    assert "gbs::EventOp::StopSegment, 7, 0, 0" in header
    assert "gbs::EventOp::AttachButtonEvent, 8, 0, 1" in header
    assert "gbs::EventOp::RemoveButtonEvent, 4, 0, 0" in header
    assert "gbs::EventOp::AttachTimerEvent, 90, 0, 0" in header
    assert "gbs::EventOp::RestartTimerEvent, 0, 0, 0" in header
    assert "gbs::EventOp::RemoveTimerEvent, 0, 0, 0" in header
    assert "gbs::EventOp::AddInventoryItem, 0, 3, 0" in header
    assert "gbs::EventOp::RemoveInventoryItem, 0, 1, 0" in header
    assert "gbs::EventOp::JumpIfInventoryAtLeast, 0, 2, 2" in header
    assert "gbs::EventOp::JumpIfActorDirection, 1, 3, 2" in header
    assert "gbs::EventOp::JumpIfActorAtPosition, 1, 196, 2" in header
    assert "gbs::EventOp::JumpIfActorDistance, 1, 0, 516" in header
    assert "gbs::EventOp::JumpIfActorRelative, 1, 0, 515" in header


def assert_topdown_npc_collision_event_slots_export(repo_root, build_dir):
    source_dir = build_dir / "topdown_npc_collision_events" / "source"
    output_dir = build_dir / "topdown_npc_collision_events" / "exported"
    source_dir.mkdir(parents=True)
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "topdown_npc_collision_events", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": [
                "topdown_project_data",
                "topdown_npc_collision_event_slots",
            ],
        },
        "topdown_project": {
            "initial_room": 0,
            "rooms": [
                {
                    "name": "npc_events",
                    "width_tiles": 2,
                    "height_tiles": 2,
                    "visual_tiles": [0, 1, 1, 0],
                    "collision_flags": [0, 0, 0, 0],
                    "metadata": {
                        "camera_mode": "fixed",
                        "camera_position": {"x": 0, "y": 0},
                        "player_start": {"x": 8, "y": 8},
                    },
                    "on_hit_group1": [{"op": "set_variable", "variable": 18, "value": 1}],
                    "on_hit_group2": [{"op": "set_variable", "variable": 19, "value": 1}],
                    "on_hit_group3": [{"op": "set_variable", "variable": 20, "value": 1}],
                    "npcs": [
                        {
                            "name": "Guide",
                            "position": {"x": 16, "y": 16},
                            "size": {"x": 16, "y": 16},
                            "health": 3,
                            "on_hit_actor": [{"op": "set_variable", "variable": 10, "value": 1}],
                            "on_hit_player": [{"op": "set_variable", "variable": 11, "value": 1}],
                            "on_hit_group1": [{"op": "set_variable", "variable": 12, "value": 1}],
                            "on_hit_group2": [{"op": "set_variable", "variable": 13, "value": 1}],
                            "on_hit_group3": [{"op": "set_variable", "variable": 14, "value": 1}],
                            "on_defeated": [{"op": "set_variable", "variable": 15, "value": 1}],
                        }
                    ],
                }
            ],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "on_start": [{"op": "set_variable", "variable": 16, "value": 1}],
                "on_update": [{"op": "set_variable", "variable": 17, "value": 1}],
                "emit_animation_fallback": True,
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_actor.command_count == 2 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_actor.commands[0].op == gbs::EventOp::SetVariable && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_actor.commands[0].a == 10 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_player.command_count == 2 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_player.commands[0].a == 11 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_group1.command_count == 2 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_group1.commands[0].a == 12 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_group2.command_count == 2 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_group2.commands[0].a == 13 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_group3.command_count == 2 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_hit_group3.commands[0].a == 14 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_defeated.command_count == 2 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_defeated.commands[0].a == 15 && "
        "gbastudio_project::project.rooms[0].npcs[0].health == 3 && "
        "gbastudio_project::project.player.on_start.commands[0].a == 16 && "
        "gbastudio_project::project.player.on_update.commands[0].a == 17 && "
        "gbastudio_project::project.rooms[0].on_hit_group1.commands[0].a == 18 && "
        "gbastudio_project::project.rooms[0].on_hit_group2.commands[0].a == 19 && "
        "gbastudio_project::project.rooms[0].on_hit_group3.commands[0].a == 20",
        "topdown_npc_collision_events_compile",
    )


def assert_topdown_npc_animation_commands_export(repo_root, build_dir):
    source_dir = build_dir / "topdown_npc_animation_commands" / "source"
    output_dir = build_dir / "topdown_npc_animation_commands" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    palette = [
        (0, 0, 0),
        (255, 0, 0),
        (0, 255, 0),
    ]
    indices = []
    for _ in range(16):
        indices.extend([1] * 16)
        indices.extend([2] * 16)
    write_indexed_png(assets_dir / "guide.png", 32, 16, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "topdown_npc_animation_commands", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": [
                "topdown_project_data",
                "topdown_actor_animation_event_commands",
            ],
        },
        "asset_pack": {
            "assets": [
                {
                    "name": "guide",
                    "id": "guide_sprite",
                    "bank_group": "actors",
                    "kind": "obj",
                    "png": "assets/guide.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "frame_duration": 5,
                    "header": "guide_sprite.hpp",
                    "symbol": "guide_sprite",
                }
            ]
        },
        "topdown_project": {
            "rooms": [
                {
                    "name": "animation_room",
                    "width_tiles": 2,
                    "height_tiles": 2,
                    "visual_tiles": [0, 1, 1, 0],
                    "collision_flags": [0, 0, 0, 0],
                    "npcs": [
                        {
                            "name": "Guide",
                            "position": {"x": 16, "y": 16},
                            "size": {"x": 16, "y": 16},
                            "animation": "idle",
                            "animations": [
                                {"name": "idle", "asset": "guide_sprite"},
                                {"name": "wave", "asset": "guide_sprite"},
                            ],
                            "on_interact": [
                                {"op": "set_actor_animation", "actor": 0, "animation": "wave"},
                                {"op": "wait_actor_animation", "actor": 0},
                                {"op": "set_actor_animation_speed", "actor": 0, "percent": 175},
                                {"op": "set_actor_animation_frame", "actor": 0, "frame": 1},
                            ],
                            "on_update": [
                                {"op": "add_variable", "variable": 0, "amount": 1},
                            ],
                        }
                    ],
                }
            ],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "emit_animation_fallback": True,
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::project.rooms[0].npcs[0].animation == &guide_sprite_animation && "
        "gbastudio_project::project.rooms[0].npcs[0].animation_count == 2 && "
        "gbastudio_project::project.rooms[0].npcs[0].animations[1] == &guide_sprite_animation && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[0].op == gbs::EventOp::SetActorAnimation && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[0].a == 0 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[0].b == 1 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[1].op == gbs::EventOp::WaitActorAnimation && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[1].a == 0 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[2].op == gbs::EventOp::SetActorAnimationSpeed && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[2].a == 0 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[2].b == 175 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[3].op == gbs::EventOp::SetActorAnimationFrame && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[3].a == 0 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_interact.commands[3].b == 1 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_update.command_count == 2 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_update.commands[0].op == gbs::EventOp::AddVariable && "
        "gbastudio_project::project.rooms[0].npcs[0].on_update.commands[0].a == 0 && "
        "gbastudio_project::project.rooms[0].npcs[0].on_update.commands[0].b == 1",
        "topdown_npc_animation_commands_compile",
    )


def assert_topdown_player_animation_commands_export(repo_root, build_dir):
    source_dir = build_dir / "topdown_player_animation_commands" / "source"
    output_dir = build_dir / "topdown_player_animation_commands" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    palette = [
        (0, 0, 0),
        (255, 255, 255),
        (0, 128, 255),
    ]
    indices = []
    for _ in range(16):
        indices.extend([1] * 16)
        indices.extend([2] * 16)
    write_indexed_png(assets_dir / "hero.png", 32, 16, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "topdown_player_animation_commands", "make_target": "all"},
        "asset_pack": {
            "assets": [
                {
                    "name": "hero",
                    "id": "hero_sprite",
                    "bank_group": "actors",
                    "kind": "obj",
                    "png": "assets/hero.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "frame_duration": 5,
                    "header": "hero_sprite.hpp",
                    "symbol": "hero_sprite",
                }
            ]
        },
        "topdown_project": {
            "rooms": [
                {
                    "name": "player_animation_room",
                    "width_tiles": 2,
                    "height_tiles": 2,
                    "visual_tiles": [0, 1, 1, 0],
                    "collision_flags": [0, 0, 0, 0],
                    "on_enter": [
                        {"op": "set_player_animation", "animation": "costume"}
                    ],
                }
            ],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "animation": "idle",
                "animations": [
                    {"name": "idle", "asset": "hero_sprite"},
                    {"name": "costume", "asset": "hero_sprite"},
                ],
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::project.player.animation == &hero_sprite_animation && "
        "gbastudio_project::project.player.animation_count == 2 && "
        "gbastudio_project::project.player.animations[1] == &hero_sprite_animation && "
        "gbastudio_project::project.rooms[0].on_enter.commands[0].op == gbs::EventOp::SetPlayerAnimation && "
        "gbastudio_project::project.rooms[0].on_enter.commands[0].a == 1",
        "topdown_player_animation_commands_compile",
    )


def assert_platformer_custom_player_metasprite_export(repo_root, build_dir):
    source_dir = build_dir / "platformer_custom_player" / "source"
    output_dir = build_dir / "platformer_custom_player" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    palette = [(0, 0, 0), (255, 255, 255), (0, 128, 255)]
    indices = [1 if (x // 16 + y // 16) % 2 == 0 else 2 for y in range(32) for x in range(64)]
    write_indexed_png(assets_dir / "hero.png", 64, 32, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "platformer",
        "template_dir": str(repo_root / "templates" / "exported_platformer"),
        "entry": "main.cpp",
        "project_data": "platformer_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "platformer_custom_player", "make_target": "all"},
        "asset_pack": {
            "assets": [{
                "name": "hero",
                "id": "hero_sprite",
                "bank_group": "platform_room",
                "kind": "obj",
                "png": "assets/hero.png",
                "sprite_width": 16,
                "sprite_height": 32,
                "frame_duration": 8,
                "header": "hero_sprite.hpp",
                "symbol": "hero_sprite",
            }]
        },
        "platformer_project": {
            "initial_room": 0,
            "config": {
                "max_air_jumps": 1,
                "wall_jump_enabled": True,
                "wall_slide_enabled": False,
                "jump_min_height_x256": 320,
                "jump_hold_frames": 12,
                "jump_height_reduction_x256": 128,
                "air_control_enabled": False,
                "turn_in_air_enabled": False,
                "air_deceleration_x256": 32,
                "drop_through_mode": 2,
                "camera_follow_directions": 5,
                "camera_deadzone_x_pixels": 24,
                "camera_lock_edge": 2,
                "wall_slide_speed_x256": 320,
                "wall_jump_speed_x256": 1344,
                "wall_jump_push_x256": 896,
                "dash_enabled": True,
                "dash_style": 1,
                "dash_momentum": 2,
                "dash_through": 2,
                "dash_recharge_frames": 30,
                "dash_speed_x256": 1792,
                "dash_frames": 10,
                "glide_enabled": True,
                "glide_fall_speed_x256": 288,
                "platform_actor_collision_group": 2,
                "solid_actor_collision_group": 4,
                "actor_gravity_enabled": True,
            },
            "player": {
                "metasprite": {"asset": "hero_sprite", "index": 0},
                "animation": {"asset": "hero_sprite"},
                "animations": {
                    "idle": {"asset": "hero_sprite", "frame_indices": [0], "durations": [8]},
                    "walk": {"asset": "hero_sprite", "frame_indices": [1, 2], "durations": [5, 5]},
                    "jump": {"asset": "hero_sprite", "frame_indices": [2], "durations": [8]},
                    "fall": {"asset": "hero_sprite", "frame_indices": [3], "durations": [8]},
                    "climb": {"asset": "hero_sprite", "frame_indices": [1, 2], "durations": [6, 6]},
                    "wall_slide": {"asset": "hero_sprite", "frame_indices": [2], "durations": [8]},
                    "dash": {"asset": "hero_sprite", "frame_indices": [3], "durations": [5]},
                    "glide": {"asset": "hero_sprite", "frame_indices": [1], "durations": [8]},
                },
                "on_start": [{"op": "set_variable", "variable": 0, "value": 1}],
                "on_update": [{"op": "add_variable", "variable": 0, "amount": 1}],
            },
            "rooms": [{
                "name": "stage",
                "width_tiles": 2,
                "height_tiles": 2,
                "visual_tiles": [0, 0, 0, 0],
                "collision_flags": [0, 0, 1, 1],
                "collision_slopes": [0, 2, 4, 0],
                "player_start": {"x": 8, "y": 8, "width": 16, "height": 16},
                "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
            }],
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)

    header = (output_dir / "platformer_project_data.hpp").read_text(encoding="utf-8")
    assert '#include "hero_sprite.hpp"' in header
    assert "&hero_sprite_metasprites[0]" in header
    assert "platformer_player_idle_animation" in header
    assert "platformer_player_walk_animation" in header
    assert "platformer_player_on_start" in header
    assert "platformer_player_on_update" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "platformer_project_data.hpp",
        "gbastudio_platformer_project::project.player_metasprite == &hero_sprite_metasprites[0] && "
        "gbastudio_platformer_project::project.rooms[0].config.max_air_jumps == 1 && "
        "gbastudio_platformer_project::project.rooms[0].config.wall_jump_enabled && "
        "!gbastudio_platformer_project::project.rooms[0].config.wall_slide_enabled && "
        "gbastudio_platformer_project::project.rooms[0].config.jump_min_height_x256 == 320 && "
        "gbastudio_platformer_project::project.rooms[0].config.jump_hold_frames == 12 && "
        "gbastudio_platformer_project::project.rooms[0].config.jump_height_reduction_x256 == 128 && "
        "!gbastudio_platformer_project::project.rooms[0].config.air_control_enabled && "
        "!gbastudio_platformer_project::project.rooms[0].config.turn_in_air_enabled && "
        "gbastudio_platformer_project::project.rooms[0].config.air_deceleration_x256 == 32 && "
        "gbastudio_platformer_project::project.rooms[0].config.drop_through_mode == 2 && "
        "gbastudio_platformer_project::project.rooms[0].config.camera_follow_directions == 5 && "
        "gbastudio_platformer_project::project.rooms[0].config.camera_deadzone_x_pixels == 24 && "
        "gbastudio_platformer_project::project.rooms[0].config.camera_lock_edge == 2 && "
        "gbastudio_platformer_project::project.rooms[0].config.wall_slide_speed_x256 == 320 && "
        "gbastudio_platformer_project::project.rooms[0].config.wall_jump_speed_x256 == 1344 && "
        "gbastudio_platformer_project::project.rooms[0].config.wall_jump_push_x256 == 896 && "
        "gbastudio_platformer_project::project.rooms[0].config.dash_enabled && "
        "gbastudio_platformer_project::project.rooms[0].config.dash_style == 1 && "
        "gbastudio_platformer_project::project.rooms[0].config.dash_momentum == 2 && "
        "gbastudio_platformer_project::project.rooms[0].config.dash_through == 2 && "
        "gbastudio_platformer_project::project.rooms[0].config.dash_recharge_frames == 30 && "
        "gbastudio_platformer_project::project.rooms[0].config.dash_speed_x256 == 1792 && "
        "gbastudio_platformer_project::project.rooms[0].config.dash_frames == 10 && "
        "gbastudio_platformer_project::project.rooms[0].config.glide_enabled && "
        "gbastudio_platformer_project::project.rooms[0].config.glide_fall_speed_x256 == 288 && "
        "gbastudio_platformer_project::project.rooms[0].config.platform_actor_collision_group == 2 && "
        "gbastudio_platformer_project::project.rooms[0].config.solid_actor_collision_group == 4 && "
        "gbastudio_platformer_project::project.rooms[0].config.actor_gravity_enabled && "
        "gbastudio_platformer_project::project.player_metasprite->part_count == 1 && "
        "gbastudio_platformer_project::project.player_metasprite->parts[0].width == 16 && "
        "gbastudio_platformer_project::project.player_metasprite->parts[0].height == 32 && "
        "gbastudio_platformer_project::project.player_animations.idle == &gbastudio_platformer_project::platformer_player_idle_animation && "
        "gbastudio_platformer_project::project.player_animations.walk == &gbastudio_platformer_project::platformer_player_walk_animation && "
        "gbastudio_platformer_project::project.player_animations.jump == &gbastudio_platformer_project::platformer_player_jump_animation && "
        "gbastudio_platformer_project::project.player_animations.fall == &gbastudio_platformer_project::platformer_player_fall_animation && "
        "gbastudio_platformer_project::project.player_animations.climb == &gbastudio_platformer_project::platformer_player_climb_animation && "
        "gbastudio_platformer_project::project.player_animations.wall_slide == &gbastudio_platformer_project::platformer_player_wall_slide_animation && "
        "gbastudio_platformer_project::project.player_animations.dash == &gbastudio_platformer_project::platformer_player_dash_animation && "
        "gbastudio_platformer_project::project.player_animations.glide == &gbastudio_platformer_project::platformer_player_glide_animation && "
        "gbastudio_platformer_project::project.player_on_start.command_count == 2 && "
        "gbastudio_platformer_project::project.player_on_update.command_count == 2 && "
        "gbastudio_platformer_project::project.rooms[0].collision_slopes[1] == gbs::TileSlope::BlockBelowRising && "
        "gbastudio_platformer_project::project.rooms[0].collision_slopes[2] == gbs::TileSlope::BlockBelowFalling",
        "platformer_custom_player_compile",
    )

    template = (repo_root / "examples" / "platformer_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    assert "project.player_metasprite" in template
    assert "project.player_animations" in template
    assert "project.player_on_start" in template
    assert "project.player_on_update" in template
    assert "platformer_player_animation_for_state" in template
    assert "current_metasprite" in template
    assert "gbs::set_metasprite" in template
    assert "input.was_pressed(gbs::ButtonStart)" in template
    assert "gbs::show_menu(" in template
    assert "pause_menu," in template
    assert "gbs::draw_menu(pause_menu)" in template
    assert "load_assets(current_room);\n    gbs::render_ui_assets();" in template
    assert "platformer_actor_anchor_position(player)" in template
    assert "set_platformer_metasprite(" in template
    assert "anchor_position.x + mirror_width - static_cast<int>(part.x) - part.width" in template
    assert "player_visual_min_x" not in template

    schema = json.loads((repo_root / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    player_schema = schema["properties"]["platformer_project"]["properties"]["player"]
    assert player_schema["required"] == ["metasprite"]
    assert player_schema["properties"]["metasprite"]["type"] == "object"
    assert player_schema["properties"]["animations"]["type"] == "object"

    engine_manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    assert "player_metasprite" in engine_manifest["capabilities"]["platformer_runtime"]
    assert "player_animations" in engine_manifest["capabilities"]["platformer_runtime"]
    platformer_template = next(item for item in engine_manifest["sdk"]["templates"] if item["id"] == "platformer_basic")
    assert "platformer_runtime.player_metasprite" in platformer_template["requires"]
    assert "platformer_runtime.player_animations" in platformer_template["requires"]


def assert_platformer_layered_background_export(repo_root, build_dir):
    source_dir = build_dir / "platformer_layered_background" / "source"
    output_dir = build_dir / "platformer_layered_background" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    layers = [
        ("sky", [(0, 0, 0), (32, 160, 240), (112, 200, 232)], [1, 1, 2, 2]),
        ("terrain", [(0, 0, 0), (96, 64, 48), (216, 176, 88)], [1, 2, 1, 2]),
        ("details", [(0, 0, 0), (48, 136, 48), (240, 232, 208)], [0, 1, 2, 0]),
    ]
    for name, palette, tile_pattern in layers:
        indices = [tile_pattern[(x // 8) + (y // 8) * 2] for y in range(16) for x in range(16)]
        write_indexed_png(assets_dir / f"{name}.png", 16, 16, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "platformer",
        "template_dir": str(repo_root / "templates" / "exported_platformer"),
        "entry": "main.cpp",
        "project_data": "platformer_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "platformer_layered_background", "make_target": "all"},
        "asset_pack": {
            "assets": [{
                "id": name,
                "name": name,
                "bank_group": "platform_room",
                "kind": "bg",
                "png": f"assets/{name}.png",
                "header": f"{name}.hpp",
                "symbol": name,
            } for name, _palette, _pattern in layers]
        },
        "platformer_project": {
            "initial_room": 0,
            "rooms": [{
                "name": "stage",
                "width_tiles": 2,
                "height_tiles": 2,
                "visual_tiles": [0, 0, 0, 0],
                "background_layers": [
                    {"layer": "bg3", "tiles": [0, 0, 0, 0], "tilemap": "sky", "tilemap_layout": "source_asset", "parallax": {"x": 128, "y": 192}},
                    {"layer": "bg2", "tiles": [0, 0, 0, 0], "tilemap": "terrain", "tilemap_layout": "source_asset", "parallax": {"x": 256, "y": 256}},
                    {"layer": "bg1", "tiles": [0, 0, 0, 0], "tilemap": "details", "tilemap_layout": "source_asset", "parallax": {"x": 256, "y": 256}},
                ],
                "collision_flags": [0, 0, 1, 1],
                "player_start": {"x": 8, "y": 8, "width": 16, "height": 16},
                "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
            }],
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)

    header = (output_dir / "platformer_project_data.hpp").read_text(encoding="utf-8")
    assert "stage_bg3_tiles" in header
    assert "stage_bg2_tiles" in header
    assert "stage_bg1_tiles" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "platformer_project_data.hpp",
        "gbastudio_platformer_project::project.rooms[0].bg3_tiles != nullptr && "
        "gbastudio_platformer_project::project.rooms[0].bg2_tiles != nullptr && "
        "gbastudio_platformer_project::project.rooms[0].bg1_tiles != nullptr && "
        "gbastudio_platformer_project::project.rooms[0].bg3_parallax_x256.x == 128 && "
        "gbastudio_platformer_project::project.rooms[0].bg3_parallax_x256.y == 192",
        "platformer_layered_background_compile",
    )

    template = (repo_root / "examples" / "platformer_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    assert "draw_platformer_room_layers" in template
    assert "gbs::BackgroundLayer::BG3" in template
    assert "gbs::BackgroundLayer::BG2" in template
    assert "gbs::BackgroundLayer::BG1" in template

    schema = json.loads((repo_root / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    room_schema = schema["properties"]["platformer_project"]["properties"]["rooms"]["items"]
    assert room_schema["properties"]["background_layers"]["type"] == "array"


def assert_point_click_layered_visual_schema(repo_root):
    schema = json.loads((repo_root / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    scene_schema = schema["properties"]["point_click_project"]["properties"]["scenes"]["items"]
    backgrounds_schema = scene_schema["properties"]["backgrounds"]
    props_schema = scene_schema["properties"]["props"]

    assert backgrounds_schema["type"] == "array"
    assert backgrounds_schema["maxItems"] == 3
    assert backgrounds_schema["items"]["minimum"] == -1
    assert props_schema["type"] == "array"
    assert props_schema["maxItems"] == 6
    assert props_schema["items"]["properties"]["metasprite"] == {"type": ["object", "string"]}
    assert props_schema["items"]["properties"]["position"] == {"type": "object"}


def assert_platformer_npcs_survive_wide_room_export(repo_root, build_dir):
    source_dir = build_dir / "platformer_wide_npcs" / "source"
    output_dir = build_dir / "platformer_wide_npcs" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    palette = [(0, 0, 0), (255, 255, 255), (64, 160, 64)]
    indices = [1 if (x + y) % 2 == 0 else 2 for y in range(16) for x in range(16)]
    write_indexed_png(assets_dir / "npc.png", 16, 16, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "platformer",
        "template_dir": str(repo_root / "templates" / "exported_platformer"),
        "entry": "main.cpp",
        "project_data": "platformer_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "platformer_wide_npcs", "make_target": "all"},
        "asset_pack": {
            "assets": [{
                "name": "npc",
                "id": "npc_sprite",
                "bank_group": "wide_room",
                "kind": "obj",
                "png": "assets/npc.png",
                "sprite_width": 16,
                "sprite_height": 16,
                "frame_duration": 8,
                "header": "npc_sprite.hpp",
                "symbol": "npc_sprite",
            }]
        },
        "platformer_project": {
            "initial_room": 0,
            "rooms": [{
                "name": "wide_room",
                "width_tiles": 161,
                "height_tiles": 18,
                "visual_tiles": [0] * (161 * 18),
                "collision_flags": [0] * (161 * 18),
                "player_start": {"x": 64, "y": 104, "width": 16, "height": 24},
                "player_collision_offset": {"x": 0, "y": -16},
                "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
                "npcs": [{
                    "name": "Far Gardener",
                    "position": {"x": 1072, "y": 104},
                    "size": {"x": 16, "y": 16},
                    "collision_offset": {"x": -8, "y": -16},
                    "metasprite": {"asset": "npc_sprite", "index": 0},
                    "animation": {"asset": "npc_sprite"},
                    "on_interact": [{"op": "set_variable", "variable": 7, "value": 1}],
                    "on_update": [{"op": "move_actor", "actor": 0, "x": -1, "y": 0}],
                }],
            }],
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)

    compile_generated_header(
        repo_root,
        output_dir,
        "platformer_project_data.hpp",
        "gbastudio_platformer_project::project.rooms[0].width_tiles == 161 && "
        "gbastudio_platformer_project::project.rooms[0].npc_count == 1 && "
        "gbastudio_platformer_project::project.rooms[0].player_start.height == 24 && "
        "gbastudio_platformer_project::project.rooms[0].player_collision_offset_pixels.y == -16 && "
        "gbastudio_platformer_project::project.rooms[0].npcs[0].position_pixels.x == 1072 && "
        "gbastudio_platformer_project::project.rooms[0].npcs[0].collision_offset_pixels.x == -8 && "
        "gbastudio_platformer_project::project.rooms[0].npcs[0].collision_offset_pixels.y == -16 && "
        "gbastudio_platformer_project::project.rooms[0].npcs[0].on_interact.commands[0].op == gbs::EventOp::SetVariable && "
        "gbastudio_platformer_project::project.rooms[0].npcs[0].on_update.commands[0].op == gbs::EventOp::MoveActor",
        "platformer_wide_npcs_compile",
    )

    template = (repo_root / "examples" / "platformer_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for required in (
        "constexpr size_t max_project_resource_banks = 64;",
        "stream_resource_bank_group_in_upload_batches",
        "gbs::dma_vblank_queue_capacity",
        "load_platformer_room_npcs",
        "platformer_npc_interaction_script_for",
        "consume_actor_event_commands(platformer_npc_runtimes",
        "platformer_npc_is_visible_in_camera",
        "platformer_npc_animators",
        "gbs::select_sprite_animation(platformer_npc_animators[index]",
        "event_state.actor_animation_playing[index] = platformer_npc_animators[index].playing;",
        "player_animation_should_advance",
    ):
        assert required in template

    schema = json.loads((repo_root / "schemas" / "export_project.schema.json").read_text(encoding="utf-8"))
    room_schema = schema["properties"]["platformer_project"]["properties"]["rooms"]["items"]
    assert "maximum" not in room_schema["properties"]["width_tiles"]
    assert "maximum" not in room_schema["properties"]["height_tiles"]
    assert room_schema["properties"]["npcs"]["type"] == "array"

    engine_manifest = json.loads((repo_root / "enginepack.json").read_text(encoding="utf-8"))
    assert "viewport_tilemap_streaming" in engine_manifest["capabilities"]["platformer_runtime"]
    assert "npcs" in engine_manifest["capabilities"]["platformer_runtime"]
    platformer_template = next(item for item in engine_manifest["sdk"]["templates"] if item["id"] == "platformer_basic")
    assert "platformer_runtime.viewport_tilemap_streaming" in platformer_template["requires"]
    assert "platformer_runtime.npcs" in platformer_template["requires"]


def compile_generated_header(repo_root, output_dir, header_name, expression, output_name):
    compile_source = output_dir / f"{output_name}.cpp"
    compile_source.write_text(
        f'#include "{header_name}"\n'
        "int main() {\n"
        f"    return {expression} ? 0 : 1;\n"
        "}\n",
        encoding="utf-8",
    )
    binary = output_dir / output_name
    subprocess.run(
        [
            "c++",
            "-std=c++17",
            "-Wall",
            "-Wextra",
            "-Werror",
            "-I",
            str(repo_root / "engine" / "include"),
            "-I",
            str(output_dir),
            str(compile_source),
            "-o",
            str(binary),
        ],
        check=True,
    )
    subprocess.run([str(binary)], check=True)


def compile_exported_runtime_source(repo_root, output_dir, source_name, output_name):
    subprocess.run(
        [
            "c++",
            "-std=c++17",
            "-Wall",
            "-Wextra",
            "-D__attribute__(x)=",
            "-I",
            str(repo_root / "engine" / "include"),
            "-I",
            str(output_dir),
            "-c",
            str(output_dir / source_name),
            "-o",
            str(output_dir / output_name),
        ],
        check=True,
    )


def assert_topdown_template_consumes_projectile_event_outputs(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "runtime_projectiles",
        "consume_projectile_event_outputs()",
        "event_state.projectile_launch_requested",
        "event_state.projectile_launch_requested = false",
        "event_state.projectile_slot_loaded",
        "render_runtime_projectiles(",
        "gbs::set_metasprite(first_oam",
        "runtime_projectile_oam_cost()",
        "projectile.sprite_index",
        "update_runtime_projectiles()",
        "npc_health",
        "npc_defeat_pending_despawn",
        "finalize_defeated_npc_scripts()",
        "room_data.npcs[index].health",
        "projectile_rect_for(",
        "apply_projectile_hit_to_npc(",
        "room_data.npcs[npc_index].on_hit_actor",
        "queue_script(hit_script)",
        "source_collision_group",
        "projectile_source_collision_group(",
        "hit_group_script_for_projectile(",
        "room_data.npcs[npc_index].on_hit_group1",
        "room_data.npcs[npc_index].on_hit_group2",
        "room_data.npcs[npc_index].on_hit_group3",
        "queue_script(group_script)",
        "room_data.npcs[npc_index].on_defeated",
        "queue_script(defeated_script)",
        "npc_defeat_pending_despawn[npc_index] = true",
        "projectile.active = false",
        "npc_runtimes[npc_index].active = false",
        "npc_runtimes[npc_index].visible = true",
        "npc_runtimes[index].active || npc_defeat_pending_despawn[index]",
        "gbs::event_script_queue_is_empty(event_queue)",
        "npc_touching_player",
        "room_hit_script_for_collision_group(",
        "room_data.on_hit_group1",
        "room_data.on_hit_group2",
        "room_data.on_hit_group3",
        "queue_npc_player_hit_script(",
        "room_data.npcs[npc_index].on_hit_player",
        "update_npc_player_hit_scripts()",
    ]:
        assert snippet in template


def assert_topdown_template_animates_player_only_while_moving(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "bool player_moved_this_frame = false;",
        "const gbs::Vec2i player_position_before_update = player.position_pixels;",
        "player_moved_this_frame = player.position_pixels.x != player_position_before_update.x ||",
        "if (player_moved_this_frame) {",
        "gbs::update_sprite_animator_scaled(player_animator, project.player.animation_speed_percent);",
        "gbs::select_sprite_animation(npc_animators[index], *npc_runtimes[index].animation);",
        "room_data.npcs[index].movement.kind == gbs::TopDownNpcMovementKind::None",
        "refresh_npc_runtime_animation(index, moving);",
    ]:
        assert snippet in template


def assert_topdown_template_queues_npc_on_update_scripts(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "event_state.actor_update_script_enabled[index] = gbs::has_event_script(room_data.npcs[index].on_update);",
        "void queue_actor_update_scripts() {",
        "if (!gbs::event_actor_update_script_enabled(event_state, static_cast<int>(index))) {",
        "queue_script(room_data.npcs[index].on_update, false);",
        "queue_actor_update_scripts();",
    ]:
        assert snippet in template


def assert_topdown_template_queues_actor_start_scripts(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "void queue_actor_start_scripts() {",
        "queue_script(project.player.on_start, false);",
        "queue_script(room_data.npcs[index].on_start, false);",
        "queue_actor_start_scripts();",
        "void queue_player_update_script() {",
        "queue_script(project.player.on_update, false);",
        "queue_player_update_script();",
    ]:
        assert snippet in template


def assert_topdown_template_hides_world_sprites_during_pause_menu(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in (
        "if (!pause_menu.visible) {",
        "gbs::draw_dialogue(dialogue);",
        "const bool draw_world_sprites = all_sprites_visible && !pause_menu.visible;",
        "draw_active_dialogue_portrait(dialogue);",
        "capture_pause_render_camera();",
        "pause_render_camera_ready",
        "const gbs::Vec2i render_camera = pause_menu.visible && pause_render_camera_ready",
        # Ground on BG2, foreground on BG1; UI (menu/dialogue/HUD) stays on BG0.
        "gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2, active_room_visual_tiles(), room.width_tiles, room.height_tiles, render_camera.x, render_camera.y);",
        "gbs::draw_room_to_bg(gbs::BackgroundLayer::BG1, project.rooms[current_room].foreground_tiles, room.width_tiles, room.height_tiles, render_camera.x, render_camera.y);",
        "gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, render_camera.x & 7, render_camera.y & 7)",
        "const bool affine_room = active_room_data.video.affine_enabled || project.video.affine_enabled;",
        "const int bg2_scroll_x = affine_room ? 0 : (active_room_data.uses_visual_tilemap ? render_camera.x : (render_camera.x & 7));",
        "const int bg2_scroll_y = affine_room ? 0 : (active_room_data.uses_visual_tilemap ? render_camera.y : (render_camera.y & 7));",
        "gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, bg2_scroll_x, bg2_scroll_y);",
        "gbs::set_bg_scroll(gbs::BackgroundLayer::BG0, 0, 0)",
        "gbs::draw_menu(pause_menu);",
        "const int confirm_sfx = dialogue.confirm_sfx_index;",
        "gbs::play_sfx(project.sfx_assets[confirm_sfx]);",
    ):
        assert snippet in template
    assert "pause_scene_frozen" not in template


def assert_topdown_template_exposes_native_runtime_telemetry(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in (
        "volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();",
        "gbs::reset_runtime_telemetry();",
        "runtime_telemetry.variables[index] = event_state.variables[index];",
        "runtime_telemetry.current_room = current_room;",
        "runtime_telemetry.first_actor_direction = npc_runtimes[0].actor.direction;",
        "runtime_telemetry.seen_tile_effects |= current_effects;",
        "runtime_telemetry.seen_slope_bits |= static_cast<uint32_t>(1u << current_slope);",
        "uint32_t runtime_slope_bits_in_rect(const gbs::TileMap& map, gbs::Rect rect)",
        "runtime_telemetry.seen_slope_bits |= runtime_slope_bits_in_rect(room.collision, attempted_rect);",
        "++runtime_trigger_enter_count;",
        "++runtime_trigger_leave_count;",
        "runtime_blocked_direction_bits |= runtime_input_direction_bits(player_input);",
        "sync_runtime_telemetry();",
    ):
        assert snippet in template


def assert_topdown_template_persists_text_variables(repo_root):
    runtime_source = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    capture_body = runtime_source.split("bool capture_topdown_runtime_state", 1)[1].split("void persist_runtime_state", 1)[0]
    persist_body = runtime_source.split("void persist_runtime_state", 1)[1].split("bool restore_runtime_state", 1)[0]
    restore_body = runtime_source.split("bool restore_runtime_state", 1)[1].split("bool restore_latest_runtime_state", 1)[0]
    expected_capture = "event_state.text_variables,\n            gbs::text_variable_count"
    if expected_capture not in capture_body or "capture_topdown_runtime_state(data)" not in persist_body:
        raise AssertionError("save topdown nao captura variaveis de texto")
    if expected_capture not in restore_body:
        raise AssertionError("load topdown nao restaura variaveis de texto")


def assert_native_runtimes_use_one_central_frame_input_snapshot(repo_root):
    runtime_paths = (
        repo_root / "examples" / "topdown_basic" / "src" / "main.cpp",
        repo_root / "examples" / "platformer_basic" / "src" / "main.cpp",
        repo_root / "examples" / "isometric_basic" / "src" / "main.cpp",
        repo_root / "templates" / "exported_battle_rpg" / "main.cpp",
        repo_root / "templates" / "exported_cutscene" / "main.cpp",
        repo_root / "templates" / "exported_dungeon_crawler" / "main.cpp",
        repo_root / "templates" / "exported_menu" / "main.cpp",
        repo_root / "templates" / "exported_point_click" / "main.cpp",
        repo_root / "templates" / "exported_racing" / "main.cpp",
        repo_root / "templates" / "exported_shmup" / "main.cpp",
        repo_root / "templates" / "exported_visual_novel" / "main.cpp",
        repo_root / "templates" / "exported_world_map" / "main.cpp",
    )
    for runtime_path in runtime_paths:
        runtime = runtime_path.read_text(encoding="utf-8")
        assert "gbs::begin_frame().input" in runtime, runtime_path
        assert "gbs::poll_input()" not in runtime, runtime_path

    for runtime_name in ():
        runtime = (repo_root / "templates" / runtime_name / "main.cpp").read_text(encoding="utf-8")
        pending = runtime.index("if (gbs::runtime_transition_pending())")
        end_frame = runtime.index("gbs::end_frame();", pending)
        returned = runtime.index("return 0;", pending)
        assert pending < end_frame < returned

    frame_contract = (repo_root / "engine" / "include" / "gbs" / "frame.hpp").read_text(encoding="utf-8")
    core_runtime = (repo_root / "engine" / "src" / "gbs_core.cpp").read_text(encoding="utf-8")
    assert "using FrameUpdateCallback = void (*)(const FrameContext& context, void* user_data);" in frame_contract
    assert "const FrameContext& context = begin_frame();" in core_runtime
    assert "callback(context, user_data);" in core_runtime


def assert_menu_runtime_progresses_event_scripts_across_frames(repo_root):
    runtime = (repo_root / "templates" / "exported_menu" / "main.cpp").read_text(encoding="utf-8")
    for snippet in (
        "gbs::EventRunner menu_event_runner {};",
        "int menu_event_wait_frames = 0;",
        "bool menu_actor_init_pending = false;",
        "bool menu_actor_update_pending = false;",
        "enum class MenuPendingActionKind",
        "gbs::start_event_runner(menu_event_runner, script);",
        "bool start_next_menu_actor_script(bool init)",
        "gbs::has_event_script(actor.on_interact)",
        "gbs::has_event_script(script)",
        "gbs::update_event_runner(menu_event_runner, event_state);",
        "gbs::set_event_input_state(event_state, input.held, input.pressed, input.released);",
        "if (menu_event_wait_frames > 0)",
        "if (menu_script_controls_dialogue && dialogue.visible)",
        "complete_pending_menu_action();",
    ):
        assert snippet in runtime
    assert "gbs::run_event_script(event_state, screen->on_enter);" not in runtime
    assert "gbs::run_event_script(event_state, screen->on_exit);" not in runtime
    assert "gbs::run_event_script(event_state, item->on_select);" not in runtime


def assert_menu_actor_event_scripts_are_emitted(repo_root):
    assetc = runpy.run_path(str(repo_root / "tools" / "assetc" / "assetc.py"))
    output = []
    actors_name, actor_count = assetc["emit_menu_actors"](
        output,
        {
            "actors": [{
                "name": "Start",
                "metasprite": "menu_actor_art",
                "position": {"x": 48, "y": 40},
                "role": "option",
                "menu_item_index": 0,
                "on_init": [{"op": "set_variable", "variable": 0, "value": 1}],
                "on_interact": [{"op": "set_variable", "variable": 1, "value": 1}],
                "on_update": [{"op": "set_variable", "variable": 2, "value": 1}],
            }]
        },
        0,
        {
            "export_plan": {
                "headers": [{"id": "menu_actor_art", "symbol": "menu_actor_art"}]
            }
        },
    )
    header = "\n".join(output)
    assert actors_name == "menu_screen_0_actors"
    assert actor_count == 1
    assert "menu_screen_0_actor_0_on_init_commands" in header
    assert "menu_screen_0_actor_0_on_interact_commands" in header
    assert "menu_screen_0_actor_0_on_update_commands" in header
    assert "gbs::EventScript { menu_screen_0_actor_0_on_init_commands, 2 }" in header
    assert "gbs::EventScript { menu_screen_0_actor_0_on_interact_commands, 2 }" in header
    assert "gbs::EventScript { menu_screen_0_actor_0_on_update_commands, 2 }" in header


def assert_menu_runtime_loads_only_the_active_screen_background(repo_root):
    runtime = (repo_root / "templates" / "exported_menu" / "main.cpp").read_text(encoding="utf-8")
    uses_ui_start = runtime.index("bool menu_screen_uses_ui")
    uses_ui = runtime[uses_ui_start:runtime.index("bool menu_screen_uses_actor_options", uses_ui_start)]
    for snippet in (
        "bool has_actor_option = false;",
        "gbs::MenuActorRole::Option",
        "return screen->text_input.variable_index >= 0 || menu_scene_has_hud_binding;",
    ):
        assert snippet in uses_ui
    start = runtime.index("void apply_background")
    apply_background = runtime[start:runtime.index("void draw_screen_actors", start)]
    assert "const int background_index = gbs::menu_screen_background_index(screen, screen_elapsed_frames);" in apply_background
    assert "background_index < static_cast<int>(project.bg_palette_count)" in apply_background
    assert "gbs::load_palette(project.bg_palettes[background_index], false);" in apply_background
    assert "background_index < static_cast<int>(project.tile_asset_count)" in apply_background
    assert "gbs::load_tiles(project.tile_assets[background_index]);" in apply_background
    assert "for (size_t index = 0; index < project.bg_palette_count; ++index)" not in apply_background
    assert "for (size_t index = 0; index < project.tile_asset_count; ++index)" not in apply_background
    assert "screen.title_overlay_background_index" in apply_background
    assert "gbs::BackgroundLayer::BG0" in apply_background
    assert "gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, menu_screen_uses_ui(&screen));" in apply_background
    refresh_hud_start = runtime.index("void refresh_hud")
    refresh_hud = runtime[refresh_hud_start:runtime.index("void stream_screen_resource_group", refresh_hud_start)]
    assert "screen->screen_type == gbs::MenuScreenType::Title" in refresh_hud
    refresh_menu_text_start = runtime.index("void refresh_menu_text")
    refresh_menu_text = runtime[refresh_menu_text_start:runtime.index("void move_selection", refresh_menu_text_start)]
    assert "screen->screen_type == gbs::MenuScreenType::Title" in refresh_menu_text
    assert "gbs::hide_dialogue(dialogue);" in refresh_menu_text
    generic_menu_start = runtime.index("bool menu_screen_uses_generic_menu")
    generic_menu = runtime[generic_menu_start:runtime.index("gbs::EventScript menu_actor_interact_script_for", generic_menu_start)]
    assert "gbs::MenuScenePresentationMode::Both" in generic_menu
    start_screen_start = runtime.index("void start_screen")
    start_screen = runtime[start_screen_start:runtime.index("bool menu_save_is_enabled", start_screen_start)]
    assert "screen->screen_type != gbs::MenuScreenType::Title" in start_screen
    assert "gbs::hide_dialogue(dialogue);" in start_screen
    assert start_screen.index("gbastudio_dialogue_ui::configure_for_scene") < start_screen.index("apply_background(*screen);")
    assert "gbs::menu_title_fade_alpha(*screen, screen_elapsed_frames)" in runtime
    assert "gbs::RenderLayerBG0" in runtime
    assert "gbs::RenderLayerBG1" in runtime
    draw_start = runtime.index("void draw_screen_actors")
    draw_screen_actors = runtime[draw_start:runtime.index("void update_title_overlay_fade", draw_start)]
    actor_loader_start = runtime.index("void load_screen_actor_resources")
    actor_loader = runtime[actor_loader_start:runtime.index("void apply_background", actor_loader_start)]
    assert "actor.tile_asset != nullptr" in actor_loader
    assert "gbs::load_tiles(*actor.tile_asset);" in actor_loader
    assert "actor.palette_asset != nullptr" in actor_loader
    assert "gbs::load_palette(*actor.palette_asset, true);" in actor_loader
    assert "gbs::load_tiles(*actor.tile_asset);" not in draw_screen_actors
    assert "gbs::load_palette(*actor.palette_asset, true);" not in draw_screen_actors
    assert "gbs::menu_cursor_position_at(" in draw_screen_actors
    assert "project.obj_palette_count" not in draw_screen_actors
    start_screen_start = runtime.index("void start_screen")
    start_screen = runtime[start_screen_start:runtime.index("bool menu_save_is_enabled", start_screen_start)]
    assert "stream_screen_resource_group(*screen);" in start_screen
    assert "load_screen_actor_resources(*screen);" in start_screen


def assert_cutscene_runtime_loads_only_the_active_background(repo_root):
    runtime = (repo_root / "templates" / "exported_cutscene" / "main.cpp").read_text(encoding="utf-8")
    assert "void stream_current_step_resource_group()" in runtime
    assert "gbs::cutscene_step_resource_bank_group_name(*scene, *step)" in runtime
    show_step_start = runtime.index("void show_current_step")
    show_step = runtime[show_step_start:runtime.index("void run_scene_exit", show_step_start)]
    assert "stream_current_step_resource_group();" in show_step
    start = runtime.index("void apply_background")
    apply_background = runtime[start:runtime.index("void draw_scene_actors", start)]
    assert "resolved_background_index < static_cast<int>(project.bg_palette_count)" in apply_background
    assert "gbs::load_palette(project.bg_palettes[resolved_background_index], false);" in apply_background
    assert "resolved_background_index < static_cast<int>(project.tile_asset_count)" in apply_background
    assert "gbs::load_tiles(project.tile_assets[resolved_background_index]);" in apply_background
    assert "for (size_t index = 0; index < project.bg_palette_count; ++index)" not in apply_background
    assert "for (size_t index = 0; index < project.obj_palette_count; ++index)" in apply_background
    assert "for (size_t index = 0; index < project.tile_asset_count; ++index)" in apply_background
    assert "gbs::load_tiles(project.tile_assets[index]);" in apply_background
    assert "const bool streamed_assets_are_uploaded = project.resource_bank_upload_source_count > 0;" in apply_background
    assert "if (project.tile_assets[index].object_tiles && !streamed_assets_are_uploaded)" in apply_background
    assert "if (streamed_assets_are_uploaded && project.tile_assets[index].object_tiles)" not in apply_background
    refresh_hud_start = runtime.index("void refresh_hud")
    refresh_hud = runtime[refresh_hud_start:runtime.index("void stream_current_step_resource_group", refresh_hud_start)]
    assert "gbs::hide_hud(hud);" in refresh_hud
    assert "gbs::set_hud_text(hud" not in refresh_hud
    assert "gbs::configure_dialogue_portraits(" in runtime
    assert "gbastudio_cutscene_project::dialogue_portrait_assets" in runtime
    assert "void draw_dialogue_portrait()" in runtime
    assert "gbs::dialogue_portrait_oam_index" in runtime


def assert_cutscene_runtime_publishes_scene_telemetry(repo_root):
    runtime = (repo_root / "templates" / "exported_cutscene" / "main.cpp").read_text(encoding="utf-8")
    assert "volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();" in runtime
    assert "runtime_telemetry.current_room = cutscene_state.scene_index;" in runtime
    assert "runtime_telemetry.variables[index] = event_state.variables[index];" in runtime
    assert "publish_runtime_telemetry();" in runtime


def assert_native_mixed_runtimes_publish_shared_telemetry(repo_root):
    templates = {
        "platformer": (repo_root / "examples" / "platformer_basic" / "src" / "main.cpp").read_text(encoding="utf-8"),
        "isometric": (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8"),
        "shmup": (repo_root / "templates" / "exported_shmup" / "main.cpp").read_text(encoding="utf-8"),
        "point_click": (repo_root / "templates" / "exported_point_click" / "main.cpp").read_text(encoding="utf-8"),
    }
    for runtime, template in templates.items():
        assert "volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();" in template, runtime
        assert "gbs::reset_runtime_telemetry();" in template, runtime
        assert "runtime_telemetry.current_room" in template, runtime
        assert "runtime_telemetry.player_x" in template, runtime
        assert "runtime_telemetry.actor_count" in template, runtime
    assert "sync_runtime_telemetry(player, room, event_state);" in templates["platformer"]
    assert "const gbs::IsoActorAnimationState* actor_animation_states," in templates["isometric"]
    assert "sync_runtime_telemetry(current_room, actors, actor_count, actor_animation_states, *room_data, event_state, cursor, &tactical_state);" in templates["isometric"]
    assert "iso_tactical_telemetry_bits(tactical_state, cursor)" in templates["isometric"]
    assert "runtime_telemetry.frame = gbs::frame_count();" in templates["isometric"]
    assert "runtime_telemetry.current_tile_flags = current_flags;" in templates["isometric"]
    assert "runtime_telemetry.seen_slope_bits |= current_ramp;" in templates["isometric"]
    assert "sync_runtime_telemetry();" in templates["shmup"]
    assert "sync_runtime_telemetry();" in templates["point_click"]
    dispatcher = (repo_root / "templates" / "exported_mixed" / "main.cpp").read_text(encoding="utf-8")
    assert "gbs::debug_set_runtime_kind(static_cast<int32_t>(adapter.runtime));" in dispatcher
    assert "const gbs::RuntimeAdapter runtime_adapters[]" in dispatcher
    assert "gbs::run_project_runtime(project_runtime)" in dispatcher
    assert "++runtime_trigger_enter_count;" in templates["platformer"]
    assert "++runtime_trigger_leave_count;" in templates["platformer"]
    enter_increment = templates["platformer"].index("++runtime_trigger_enter_count;")
    enter_publish = templates["platformer"].index(
        "runtime_telemetry.trigger_enter_count = runtime_trigger_enter_count;",
        enter_increment,
    )
    trigger_script = templates["platformer"].index("gbs::run_event_script(", enter_increment)
    assert enter_increment < enter_publish < trigger_script
    pending_transition = templates["platformer"].index("if (gbs::runtime_transition_pending())")
    pending_return = templates["platformer"].index("return 0;", pending_transition)
    pending_sync = templates["platformer"].index(
        "sync_runtime_telemetry(player, room, event_state);",
        pending_transition,
    )
    assert pending_transition < pending_sync < pending_return
    changed_room = templates["platformer"].index("if (room_changed)")
    overflow_guard = templates["platformer"].index(
        "if (room_data->trigger_count > max_room_triggers || room_data->npc_count > max_room_npcs)",
        changed_room,
    )
    overflow_return = templates["platformer"].index("return -1;", overflow_guard)
    overflow_sync = templates["platformer"].index(
        "sync_runtime_telemetry(player, room, event_state);",
        overflow_guard,
    )
    assert overflow_guard < overflow_sync < overflow_return


def assert_advanced_native_runtimes_consume_full_audio_contract(repo_root):
    templates = {
        "dungeon_crawler": (repo_root / "templates" / "exported_dungeon_crawler" / "main.cpp").read_text(encoding="utf-8"),
        "racing": (repo_root / "templates" / "exported_racing" / "main.cpp").read_text(encoding="utf-8"),
    }
    required = (
        "gbs::play_pcm_sfx(",
        "gbs::play_tracker_music(",
        "gbs::set_audio_channel_muted(",
        "gbs::set_audio_channel_volume(",
        "gbs::fade_audio_channel_volume(",
        "gbs::stop_pcm_music();",
    )
    for runtime, template in templates.items():
        for snippet in required:
            assert snippet in template, f"{runtime}: {snippet}"


def assert_player_event_commands_reach_mixed_runtimes(repo_root):
    templates = {
        "topdown": (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8"),
        "platformer": (repo_root / "examples" / "platformer_basic" / "src" / "main.cpp").read_text(encoding="utf-8"),
        "shmup": (repo_root / "templates" / "exported_shmup" / "main.cpp").read_text(encoding="utf-8"),
    }
    for runtime, template in templates.items():
        assert "apply_event_player_command" in template, runtime
    assert "player_event_runtime.active" in templates["topdown"]
    assert "player_event_runtime.active" in templates["shmup"]
    assert "player_event_active" in templates["platformer"]
    assert "gbs::InputState { 0, 0, 0 }" in templates["topdown"]
    assert "gbs::InputState { 0, 0, 0 }" in templates["platformer"]
    assert "gbs::collect_visible_topdown_actor_draw_slots(" in templates["topdown"]
    assert "player_event_runtime.active," in templates["topdown"]
    assert "if (player_event_active && player_metasprite" in templates["platformer"]
    assert "else if (player_event_active && player_metasprite == nullptr)" in templates["platformer"]
    assert "gbs::set_sprite(0, gbs::Sprite" not in templates["platformer"]
    assert "shmup_state.lives > 0 && player_event_runtime.active" in templates["shmup"]
    assert "consume_event_player_movement_step" in templates["topdown"]
    assert "consume_event_player_movement_step" in templates["shmup"]
    assert "push_actor_by_delta_until_collision" in templates["topdown"]
    assert "update_player_with_actor_push" in templates["topdown"]
    assert "player_blocker_indices" in templates["topdown"]
    assert "push_actor_by_delta_until_collision" in templates["platformer"]
    assert "case gbs::EventActorOp::Push:" in templates["shmup"]


def assert_topdown_template_exposes_hierarchical_start_menu(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in (
        "enum class PauseMenuPage",
        "PauseMenuPage::Root",
        "PauseMenuPage::Inventory",
        "PauseMenuPage::Map",
        "PauseMenuPage::System",
        "save_menu_config.continue_label",
        '"ITENS"',
        '"MAPA"',
        '"SISTEMA"',
        '"SALVAR"',
        "save_menu_config.load_label",
        "pause_menu_delete",
        "show_pause_menu_page(PauseMenuPage::Root)",
        "show_pause_menu_page(PauseMenuPage::System)",
        "input.was_pressed(gbs::ButtonStart)",
    ):
        assert snippet in template
    ui_runtime = (repo_root / "engine" / "src" / "gbs_ui.cpp").read_text(encoding="utf-8")
    hardware_runtime = (repo_root / "engine" / "src" / "gbs_hw.c").read_text(encoding="utf-8")
    assert "gbs_hw_draw_text_box(2, 5, 26, 7" in ui_runtime
    assert "static_cast<int>(item_index) == state.selected_index ? '!' : '-'" in ui_runtime
    assert "DIALOGUE_TILE_SELECTOR = DIALOGUE_TILE_GLYPH_BASE + GBS_TEXT_RESIDENT_GLYPHS" in hardware_runtime
    assert "dialogue_choice_selector_active" in hardware_runtime


def assert_save_menu_visual_builder_export(repo_root, build_dir):
    source_dir = build_dir / "save_menu_builder" / "source"
    output_dir = build_dir / "save_menu_builder" / "exported"
    source_dir.mkdir(parents=True, exist_ok=True)
    project = topdown_like_project("save_menu_builder")
    project["save"] = {
        "enabled": True,
        "signature": "GBSM",
        "slot_capacity": 1024,
        "slot_count": 3,
        "ui": {
            "selectedSlot": 1,
            "continueLabel": "CONTINUAR",
            "loadLabel": "CARREGAR",
            "deleteLabel": "APAGAR",
            "menuLayout": "cards",
            "confirmDelete": True,
            "showPlayerName": True,
            "showPlayTime": False,
            "showLocation": True,
        },
    }
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "runtime_profile": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "topdown_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "save_menu_builder", "make_target": "all"},
        "topdown_project": project,
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "topdown_project_data.hpp").read_text(encoding="utf-8")
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in (
        '"CONTINUAR"',
        '"CARREGAR"',
        '"APAGAR"',
        "gbs::SaveMenuLayout::Cards",
        "constexpr gbs::SaveMenuConfig save_menu_config",
        "static_cast<uint8_t>(1)",
        "true, false, true",
    ):
        assert snippet in header
    for snippet in (
        "gbastudio_project::save_menu_config",
        "pause_menu_delete_base",
        "gbs::clear_save_slot",
        "show_play_time",
        "show_location",
    ):
        assert snippet in template


def assert_advanced_video_composition_export(repo_root, build_dir):
    source_dir = build_dir / "advanced_video" / "source"
    output_dir = build_dir / "advanced_video" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)
    write_indexed_png(assets_dir / "panorama.png", 128, 128, [(0, 0, 0), (80, 160, 240)], [1] * (128 * 128))
    project = topdown_like_project("advanced_video")
    project["video"] = {
        "display_mode": 5,
        "affine": None,
        "bitmap": {"asset": "panorama_bitmap", "page": 1, "width": 160, "height": 128, "color_depth": 15},
    }
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "runtime_profile": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "topdown_project_data.hpp",
        "generated_assets": ["panorama_bitmap.hpp"],
        "build": {"target": "advanced_video", "make_target": "all"},
        "asset_pack": {"assets": [{
            "id": "panorama_bitmap",
            "name": "panorama_bitmap",
            "kind": "bitmap5",
            "png": "assets/panorama.png",
            "header": "panorama_bitmap.hpp",
            "symbol": "panorama_bitmap",
        }]},
        "topdown_project": project,
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "topdown_project_data.hpp").read_text(encoding="utf-8")
    assert "gbs::DisplayMode::Mode5Bitmap" in (output_dir / "panorama_bitmap.hpp").read_text(encoding="utf-8")
    assert "&panorama_bitmap_bitmap_asset" in header
    assert "static_cast<uint8_t>(1)" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "topdown_project_data.hpp",
        "gbastudio_project::project.video.display_mode == gbs::DisplayMode::Mode5Bitmap && "
        "gbastudio_project::project.video.bitmap16 != nullptr",
        "advanced_video_compile_test",
    )

    affine_output_dir = build_dir / "advanced_video" / "affine_exported"
    affine_project = topdown_like_project("advanced_affine")
    affine_project["video"] = {
        "display_mode": 2,
        "affine": {
            "asset": "terrain_affine",
            "layer": "BG3",
            "pa": 0,
            "pb": -256,
            "pc": 256,
            "pd": 0,
            "reference_x_8": 30720,
            "reference_y_8": 20480,
        },
        "bitmap": None,
    }
    manifest["topdown_project"] = affine_project
    manifest["asset_pack"]["assets"] = [{
        "id": "terrain_affine",
        "name": "terrain_affine",
        "kind": "affine_bg",
        "png": "assets/panorama.png",
        "header": "terrain_affine.hpp",
        "symbol": "terrain_affine",
    }]
    manifest["generated_assets"] = ["terrain_affine.hpp"]
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, affine_output_dir)
    affine_header = (affine_output_dir / "topdown_project_data.hpp").read_text(encoding="utf-8")
    for snippet in (
        "&terrain_affine_tile_asset",
        "&terrain_affine_tilemap_asset",
        "&terrain_affine_palette_asset",
    ):
        assert snippet in affine_header
    compile_generated_header(
        repo_root,
        affine_output_dir,
        "topdown_project_data.hpp",
        "gbastudio_project::project.video.display_mode == gbs::DisplayMode::Mode2Affine && "
        "gbastudio_project::project.video.affine_tiles != nullptr && "
        "gbastudio_project::project.video.affine_tilemap != nullptr",
        "advanced_affine_compile_test",
    )

    room_affine_output_dir = build_dir / "advanced_video" / "room_affine_exported"
    room_affine_project = topdown_like_project("room_affine")
    room_affine_project["rooms"][0]["video"] = {
        "display_mode": 1,
        "affine": {
            "asset": "terrain_affine",
            "layer": "BG2",
            "pa": 256,
            "pb": 0,
            "pc": 0,
            "pd": 256,
            "reference_x_8": 30720,
            "reference_y_8": 20480,
        },
        "bitmap": None,
    }
    manifest["topdown_project"] = room_affine_project
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, room_affine_output_dir)
    room_affine_header = (room_affine_output_dir / "topdown_project_data.hpp").read_text(encoding="utf-8")
    for snippet in (
        "static_cast<gbs::DisplayMode>(1)",
        "&terrain_affine_tile_asset",
        "&terrain_affine_tilemap_asset",
        "&terrain_affine_palette_asset",
    ):
        assert snippet in room_affine_header
    compile_generated_header(
        repo_root,
        room_affine_output_dir,
        "topdown_project_data.hpp",
        "gbastudio_project::project.rooms[0].video.affine_enabled && "
        "gbastudio_project::project.rooms[0].video.affine_tiles != nullptr",
        "advanced_room_affine_compile_test",
    )


def assert_topdown_template_keeps_ui_on_bg0_and_room_on_bg1(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in (
        "gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0)",
        "gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 1)",
        "gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, render_camera.x & 7, render_camera.y & 7)",
        "gbs::set_bg_scroll(gbs::BackgroundLayer::BG0, 0, 0)",
        "gbs::draw_menu(pause_menu);",
    ):
        assert snippet in template
    # Room scroll must not use the BG0 overload (that would move the UI layer).
    assert "gbs::set_bg_scroll(render_camera.x & 7, render_camera.y & 7)" not in template


def assert_topdown_streaming_accepts_large_resource_bank_groups(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    assert "constexpr size_t max_project_resource_banks = 64;" in template
    assert "stream_resource_bank_group_in_upload_batches" in template
    assert "stream_result.status != gbs::ResourceStreamStatus::DmaQueueFull" in template
    assert "gbs::dma_vblank_queue_count() >= gbs::dma_vblank_queue_capacity" in template
    assert "gbs::enqueue_resource_bank_upload_vblank(reservation, source)" in template
    assert template.count("queue_script(project.rooms[current_room].on_enter, true);") == 2
    assert "queue_script(project.rooms[current_room].on_enter, false);" not in template


def assert_dialogue_lines_emit_confirm_sound_metadata(repo_root, build_dir):
    source_dir = build_dir / "dialogue_confirm_sound" / "source"
    output_dir = build_dir / "dialogue_confirm_sound" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    palette = [
        (0, 0, 0),
        (255, 0, 0),
        (0, 255, 0),
    ]
    indices = [1] * 256
    write_indexed_png(assets_dir / "shock.png", 16, 16, palette, indices)
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "dialogue_confirm_sound", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data"],
        },
        "asset_pack": {
            "assets": [
                {
                    "id": "shock",
                    "name": "shock",
                    "kind": "obj",
                    "png": "assets/shock.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "header": "shock.hpp",
                    "symbol": "shock",
                }
            ]
        },
        "topdown_project": {
            **topdown_like_project("dialogue_confirm_sound"),
            "dialogue_lines": [
                {
                    "text": "Confirma?",
                    "speaker": "Ana",
                    "key": "confirm_line",
                    "text_sound": "text_blip.wav",
                    "confirm_sound": "confirm.wav",
                    "confirm_sfx": 0,
                    "confirm_pcm": -1,
                    "source_locale": "en",
                    "default_locale": "pt-BR",
                    "translations": [
                        {"locale": "pt-BR", "text": "Confirma?"},
                        {"locale": "es", "text": "Confirmar?"},
                    ],
                }
            ],
            "choice_groups": [{
                "line": 0,
                "choices": [{
                    "text": "Continue",
                    "value": 1,
                    "source_locale": "en",
                    "default_locale": "pt-BR",
                    "translations": [
                        {"locale": "pt-BR", "text": "Continuar"},
                        {"locale": "es", "text": "Seguir"},
                    ],
                }],
            }],
            "assets": {
                "obj_palettes": ["shock"],
                "tile_assets": ["shock"],
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert '"confirm.wav"' in header
    assert '"text_blip.wav"' in header
    assert '"pt-BR", "Confirma?"' in header
    assert '"es", "Confirmar?"' in header
    assert '"es", "Seguir"' in header
    assert ", 0, -1," in header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::dialogue_lines[0].confirm_sound != nullptr && "
        "gbastudio_project::dialogue_lines[0].text_sound != nullptr && "
        "gbastudio_project::dialogue_lines[0].confirm_sfx == 0 && "
        "gbastudio_project::dialogue_lines[0].confirm_pcm == -1 && "
        "gbastudio_project::dialogue_lines[0].translation_count == 2 && "
        "gbastudio_project::dialogue_choices[0].choices[0].translation_count == 2",
        "dialogue_confirm_sound_compile_test",
    )


def assert_topdown_template_switches_directional_animations(repo_root):
    template = (repo_root / "examples" / "topdown_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "int topdown_directional_animation_index(size_t animation_count, uint8_t direction, bool moving)",
        "constexpr int topdown_directional_idle_left_index = 3;",
        "constexpr int topdown_directional_walk_left_index = 7;",
        "constexpr size_t topdown_directional_animation_count = 8;",
        "topdown_idle_directional_animation_count",
        "topdown_has_idle_directional_animations",
        "bool topdown_direction_uses_horizontal_flip(uint8_t direction)",
        "refresh_player_directional_animation(player_wants_to_move);",
        "refresh_npc_directional_animation(index, npc_moved);",
        "set_actor_metasprite(",
        "position.x + size.x - static_cast<int>(part.x) - part.width",
        "position.y + part.y",
        "part.width,",
        "part.height",
        "constexpr size_t max_npc_slots = 96;",
        "constexpr size_t max_visible_npc_slots = 26;",
        "constexpr size_t max_visible_world_actor_slots = max_visible_npc_slots + 1;",
        "gbs::collect_visible_topdown_actor_draw_slots(",
        "draw_slots[slot_index].is_player",
        "npc_oam_start + static_cast<uint16_t>((slot_index - 1) * oam_sprites_per_actor)",
    ]:
        assert snippet in template
    assert template.index("gbs::draw_debug_overlay(false);") < template.index("gbs::draw_hud(hud);")
    assert template.index("gbs::draw_hud(hud);") < template.index("gbs::draw_debug_overlay(true);")
    assert template.index("gbs::draw_debug_overlay(true);") < template.index("gbs::draw_menu(pause_menu);")


def assert_topdown_template_consumes_link_event_outputs(repo_root):
    for runtime in ("topdown", "platformer", "isometric"):
        template = (repo_root / "examples" / f"{runtime}_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
        for snippet in [
            "#include \"gbs/link.hpp\"",
            "gbs::LinkSession link_session",
            "consume_link_event_outputs",
            "event_state.link_request",
            "gbs::LinkRole::Host",
            "gbs::LinkRole::Join",
            "gbs::link_transfer(",
            "gbs::link_close(link_session)",
            "event_state.link_last_transfer_ok",
            "event_state.link_last_received_value",
            "event_state.link_request = 0",
        ]:
            assert snippet in template


def assert_native_templates_consume_visual_effect_outputs(repo_root):
    for runtime in ("topdown", "platformer", "isometric"):
        template = (repo_root / "examples" / f"{runtime}_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
        assert '#include "gbs/visual_effects.hpp"' in template
        assert "gbs::VisualEffectsController visual_effects;" in template
        assert "gbs::init_visual_effects(visual_effects);" in template
        assert "gbs::consume_visual_effect_event(event_state, visual_effects);" in template
        assert "gbs::render_visual_effects(visual_effects);" in template
        assert "gbs::tick_visual_effects(visual_effects);" in template


def assert_all_exported_runtimes_forward_scene_transition_compositor(repo_root):
    runtime_templates = [
        repo_root / "templates" / "exported_menu" / "main.cpp",
        repo_root / "templates" / "exported_shmup" / "main.cpp",
        repo_root / "templates" / "exported_point_click" / "main.cpp",
        repo_root / "templates" / "exported_dungeon_crawler" / "main.cpp",
        repo_root / "templates" / "exported_racing" / "main.cpp",
        repo_root / "templates" / "exported_cutscene" / "main.cpp",
        repo_root / "templates" / "exported_visual_novel" / "main.cpp",
        repo_root / "templates" / "exported_world_map" / "main.cpp",
        repo_root / "templates" / "exported_battle_rpg" / "main.cpp",
        repo_root / "templates" / "exported_luta" / "main.cpp",
    ]
    for path in runtime_templates:
        template = path.read_text(encoding="utf-8")
        assert '#include "gbs/visual_effects.hpp"' in template
        assert "gbs::consume_scene_transition_visual_effect_event(event_state);" in template

    core = (repo_root / "engine" / "src" / "gbs_core.cpp").read_text(encoding="utf-8")
    assert "render_scene_transition_visual_effects();" in core
    assert "tick_scene_transition_visual_effects();" in core


def assert_isometric_template_switches_directional_animations(repo_root):
    template = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "gbs::IsoActorAnimationState actor_animation_states[max_actor_count]",
        "bool update_player_tile(gbs::IsoActor* actors, const gbs::IsometricRoomData& room_data, gbs::InputState input)",
        "room_data->movement_model == gbs::IsoMovementModel::Free",
        "? update_player_free(actors, *room_data, input)",
        ": movement_step_due && update_player_tile(actors, *room_data, input);",
        "gbs::set_iso_actor_motion(actor_animation_states[0], input_delta, player_moved);",
        "gbs::set_iso_actor_motion(actor_animation_states[0], input_delta, false);",
        "gbs::set_iso_actor_motion(actor_animation_states[1], step.delta_tile, moved)",
        "gbs::apply_iso_actor_animation(",
        "gbs::tick_iso_actor_animation(",
        "room_data->actor_animations[index]",
    ]:
        assert snippet in template
    runtime = (repo_root / "engine" / "src" / "gbs_isometric.cpp").read_text(encoding="utf-8")
    assert "if (!state.walking)" in runtime


def assert_isometric_template_honors_stationary_actors(repo_root):
    template = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    header = (repo_root / "engine" / "include" / "gbs" / "isometric.hpp").read_text(encoding="utf-8")
    assert "if (room_data.actor_count < 2 || !actors[1].follow_player)" in template
    assert "bool follow_player = true;" in header
    assert "static_cast<uint8_t>(actor.follow_player ? 1 : 0)" in header


def assert_isometric_template_reserves_multi_asset_pilot_resources(repo_root):
    template = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "constexpr size_t max_project_tile_assets = 8;",
        "constexpr size_t max_project_bg_palettes = 4;",
        "constexpr size_t max_project_obj_palettes = 4;",
        "gbs::ResourceReservation tile_reservations[max_project_tile_assets];",
        "gbs::ResourceReservation bg_palette_reservations[max_project_bg_palettes];",
        "gbs::ResourceReservation obj_palette_reservations[max_project_obj_palettes];",
    ]:
        assert snippet in template


def assert_isometric_template_supports_full_save_actor_capacity(repo_root):
    template = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "constexpr size_t max_actor_count = gbs::max_isometric_save_actors;",
        "gbs::IsoActor actors[max_actor_count]",
        "gbs::IsoActorAnimationState actor_animation_states[max_actor_count]",
        "room_data->actor_count > max_actor_count",
    ]:
        assert snippet in template


def assert_isometric_authored_background_does_not_prefetch_other_scene_banks_during_play(repo_root):
    template = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    start = template.index("void prefetch_room_resource_groups")
    prefetch = template[start:template.index("bool reserve_resources", start)]

    assert "const gbs::IsometricRoomData& active_room_data = project.rooms[active_room];" in prefetch
    assert "if (gbs::uses_authored_isometric_background(active_room_data)) {" in prefetch
    assert prefetch.index("if (gbs::uses_authored_isometric_background(active_room_data)) {") < prefetch.index(
        "const gbs::ResourceBankUploadSource* upload_sources"
    )


def assert_isometric_template_updates_surfaces_inside_vblank(repo_root):
    template = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "constexpr size_t iso_foreground_tile_base = 513;",
        "constexpr size_t iso_foreground_tilemap_base = 0;",
        "constexpr size_t max_iso_foreground_unique_tiles = 211;",
        "uint8_t iso_transparent_tile[32] __attribute__((section(\".ewram_bss\")));",
        "if (dirty_run_count > 0) {",
        "offset_iso_foreground_tilemap(iso_foreground_map, iso_surface_tile_count);",
        "static_cast<uint16_t>(iso_foreground_tile_base)",
        "gbs::TileAsset { iso_transparent_tile, 1, 512, false }",
        "gbs::set_bg_character_base(gbs::BackgroundLayer::BG3, 1);",
        "if (room_data->tileset_tilemap != nullptr) {\n            camera.smoothing_x256 = 256;",
        "const gbs::IsoCamera surface_camera = indexed_surface ? camera : gbs::iso_surface_render_camera(camera);",
        "!iso_surface_camera_matches(iso_surface_camera, surface_camera)",
        "gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, surface_scroll_x, surface_scroll_y);",
        "gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, surface_scroll_x, -96 + surface_scroll_y);",
        "rendered_iso_surface && layer == 3",
        "const bool authored_background = gbs::uses_authored_isometric_background(*room_data);",
        "gbs::load_tilemap(gbs::BackgroundLayer::BG2, *room_data->authored_background_tilemap);",
        "gbs::wait_vblank();",
    ]:
        assert snippet in template
    dirty_upload_region = template[template.index("if (dirty_run_count > 0) {"):template.index("iso_surface_room = room_data;", template.index("if (dirty_run_count > 0) {"))]
    assert "gbs::wait_vblank();" not in dirty_upload_region
    assert template.index("gbs::wait_vblank();", template.index("if (dirty_run_count > 0) {")) > template.index(
        "publish_iso_tactical_draw_witness"
    )


def assert_isometric_template_restores_backdrop_after_palette_upload(repo_root):
    template = (repo_root / "examples" / "isometric_basic" / "src" / "main.cpp").read_text(encoding="utf-8")
    palette_upload = "load_assets(room_data->video.affine_enabled ? room_data->video : project.video);\n    // load_assets uploads the room palettes, including palette entry 0. The\n    // backdrop must be applied after that upload to remain visible through\n    // transparent atlas corners.\n    gbs::set_backdrop_color(project.backdrop_color);"
    assert palette_upload in template
    palette_changes = "    gbs::consume_event_palette_changes(\n        event_state,\n        project.bg_palettes,\n        project.bg_palette_count,\n        project.obj_palettes,\n        project.obj_palette_count\n    );\n    // Palette uploads may replace BG palette entry 0. Restore the isometric\n    // backdrop afterwards so transparent diamond corners do not become black.\n    gbs::set_backdrop_color(project.backdrop_color);"
    assert palette_changes in template


def assert_native_template_consumes_audio_outputs(output_dir, project_header, prefix):
    header = (output_dir / project_header).read_text(encoding="utf-8")
    main_cpp = (output_dir / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        f"{prefix}_sfx_assets",
        f"{prefix}_music_assets",
        f"{prefix}_pcm_assets",
        "gbs::EventOp::PlaySfx",
        "gbs::EventOp::PlayMusic",
        "gbs::EventOp::PlayPcmSfx",
    ]:
        assert snippet in header
    for snippet in [
        "gbs::play_sfx(project.sfx_assets[event_state.last_sfx])",
        "event_state.last_pcm_sfx_priority",
        "event_state.last_pcm_sfx_volume",
        "gbs::play_music(project.music_assets[event_state.last_music])",
        "gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music])",
        "gbs::set_audio_channel_muted(",
        "gbs::set_audio_channel_volume(",
        "gbs::fade_audio_channel_volume(",
        "gbs::stop_music()",
        "gbs::stop_tracker_music()",
        "gbs::stop_pcm_music()",
    ]:
        assert snippet in main_cpp


def assert_point_click_profile_output(repo_root, output_dir):
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest.get("runtime_adapter", {})
    assert manifest["kind"] == "point_click"
    assert manifest["runtime_profile"] == "point_click"
    assert manifest["project_data"] == "point_click_project_data.hpp"
    assert adapter["base_runtime"] == "point_click"
    assert adapter["adapter"] == "native"
    assert adapter["project_block"] == "point_click_project"
    assert adapter["native"] is True
    header = (output_dir / "point_click_project_data.hpp").read_text(encoding="utf-8")
    main_cpp = (output_dir / "main.cpp").read_text(encoding="utf-8")
    assert "const gbs::PointClickProjectData project" in header
    assert "constexpr gbs::PointClickInventoryItemData point_click_inventory_items" in header
    assert "point_click_scene_0_hotspot_1_on_use_item" in header
    assert 'gbs::PointClickSceneData { "room", -1, point_click_scene_0_hotspots, 2' in header
    assert 'nullptr, 4, nullptr, 0, nullptr, 0 },' in header
    assert "scene->cursor_speed_pixels > 0" in main_cpp
    assert "gbs::EventOp::ShowDialogue" in header
    assert "gbs::EventOp::SetVariable" in header
    assert "gbs::EventOp::SceneStackPush, 5, 0, 0" in header
    assert "constexpr gbs::EventScript project_scripts[]" in header
    assert "constexpr bool save_enabled = true;" in header
    assert "gbs::make_save_signature('G', 'B', 'P', 'C')" in header
    assert "resource_bank_upload_sources" in header
    assert "resource_bank_upload_source_count" in header
    assert "gbs::stream_resource_bank_group_with_uploads(" in main_cpp
    assert "reset_resource_bank_groups();" in main_cpp
    assert "gbs::set_bg_scroll(background.layer, 0, 0);" in main_cpp
    assert "gbs::set_event_input_state(event_state, input.held, input.pressed, input.released)" in main_cpp
    assert "gbs::update_button_event_bindings(event_state)" in main_cpp
    assert "gbs::run_event_script(event_state, project.scripts[script_index])" in main_cpp
    assert "gbastudio_point_click_project::resource_bank_upload_sources" in main_cpp
    assert_native_template_consumes_audio_outputs(output_dir, "point_click_project_data.hpp", "point_click_project")
    compile_generated_header(
        repo_root,
        output_dir,
        "point_click_project_data.hpp",
        "gbs::is_valid_point_click_project_data(gbastudio_point_click_project::project) && "
        "gbastudio_point_click_project::project.dialogue_lines[0].speaker[0] == 'G' && "
        "gbastudio_point_click_project::project.dialogue_lines[0].portrait[0] == 'g' && "
        "gbastudio_point_click_project::project.dialogue_lines[0].key[0] == 'i' && "
        "gbastudio_point_click_project::project.script_count == 1",
        "point_click_compile_test",
    )


def assert_point_click_template_supports_layers_and_props(repo_root):
    template = (repo_root / "templates" / "exported_point_click" / "main.cpp").read_text(encoding="utf-8")
    for snippet in (
        "void apply_backgrounds(const gbs::PointClickSceneData& scene)",
        "gbs::point_click_scene_background_at(scene, index)",
        "void draw_point_click_props(const gbs::PointClickSceneData& scene)",
        "point_click_prop_is_visible(prop, event_state)",
        "gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);",
        "draw_point_click_props(*scene);",
        "gbastudio_dialogue_ui::has_hud_scene_binding(scene_name)",
        "gbs::hide_hud(hud);",
    ):
        assert snippet in template


def assert_shmup_profile_output(repo_root, output_dir):
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest["runtime_adapter"]
    assert manifest["kind"] == "shmup"
    assert manifest["runtime_profile"] == "shmup"
    assert manifest["project_data"] == "shmup_project_data.hpp"
    assert adapter["base_runtime"] == "shmup"
    assert adapter["adapter"] == "native"
    assert adapter["project_block"] == "shmup_project"
    header = (output_dir / "shmup_project_data.hpp").read_text(encoding="utf-8")
    assert "namespace gbastudio_shmup_project" in header
    assert "gbs::ShmupProjectData project" in header
    assert "shmup_wave_0_enemies" in header
    assert "shmup_wave_1_enemies" in header
    assert "shmup_player_on_fire" in header
    assert "shmup_project_sfx_assets" in header
    assert "shmup_project_music_assets" in header
    assert "shmup_project_pcm_assets" in header
    assert "shmup_enemy_projectile_on_hit_player" in header
    assert "static_cast<uint8_t>(4), static_cast<uint8_t>(6)" in header
    assert "constexpr size_t max_enemy_count = 2;" in header
    assert "constexpr bool save_enabled = true;" in header
    assert "gbs::make_save_signature('G', 'B', 'S', 'H')" in header
    main_cpp = (output_dir / "main.cpp").read_text(encoding="utf-8")
    maybe_advance_wave_start = main_cpp.index("void maybe_advance_wave")
    maybe_advance_wave_end = main_cpp.index("\nvoid update_shmup", maybe_advance_wave_start)
    maybe_advance_wave_body = main_cpp[maybe_advance_wave_start:maybe_advance_wave_end]
    assert "advance_cleared_wave();" in maybe_advance_wave_body
    advance_cleared_wave_start = main_cpp.index("void advance_cleared_wave")
    advance_cleared_wave_end = main_cpp.index("void finish_restored_shmup_script", advance_cleared_wave_start)
    advance_cleared_wave_body = main_cpp[advance_cleared_wave_start:advance_cleared_wave_end]
    assert "start_wave(next_wave);" in advance_cleared_wave_body
    assert "gbastudio_dialogue_ui::configure_for_scene(project.waves[shmup_state.wave_index].name);" in advance_cleared_wave_body
    assert "apply_background();" in advance_cleared_wave_body
    restored_script_start = advance_cleared_wave_end
    restored_script_body = main_cpp[restored_script_start:maybe_advance_wave_start]
    assert "if (script_index == 1) advance_cleared_wave();" in restored_script_body
    shmup_background_start = main_cpp.index("void apply_background")
    shmup_background_body = main_cpp[shmup_background_start:main_cpp.index("const gbs::MetaSprite* actor_sprite_for_index", shmup_background_start)]
    assert "if (background->video.affine_enabled)" in shmup_background_body
    assert "gbs::set_bg_enabled(background->video.affine_layer, true);" in shmup_background_body
    assert "gbs::set_bg_priority(background->video.affine_layer, 2);" in shmup_background_body
    assert "gbs::set_bg_scroll(background->video.affine_layer, 0, 0);" in shmup_background_body
    assert "gbs::play_sfx(project.sfx_assets[event_state.last_sfx])" in main_cpp
    assert "event_state.last_pcm_sfx_priority" in main_cpp
    assert "event_state.last_pcm_sfx_volume" in main_cpp
    assert "gbs::play_music(project.music_assets[event_state.last_music])" in main_cpp
    assert "wave->player_speed_pixels_per_frame" in main_cpp
    assert "wave->fire_cooldown_frames" in main_cpp
    assert "bool wave_spawned = false;" in main_cpp
    assert "gbs::shmup_wave_spawn_ready(wave, shmup_state.frame_counter)" in main_cpp
    assert "if (!wave_spawned)" in main_cpp
    assert "gbs::shmup_add_score(shmup_state.score, enemy.score_value)" in main_cpp
    assert "gbastudio_shmup_project::max_enemy_count" in main_cpp
    assert "gbs::shmup_world_to_viewport" in main_cpp
    assert "gbs::set_event_input_state(event_state, input.held, input.pressed, input.released)" in main_cpp
    assert "gbs::update_button_event_bindings(event_state)" in main_cpp
    assert "gbs::button_event_binding_overrides_default(event_state, input.held)" in main_cpp
    assert "consume_projectile_event_request()" in main_cpp
    assert "wave->enemy_count < max_runtime_enemies" not in main_cpp
    compile_generated_header(
        repo_root,
        output_dir,
        "shmup_project_data.hpp",
        "gbs::is_valid_shmup_project_data(gbastudio_shmup_project::project) && "
        "gbastudio_shmup_project::project.sfx_asset_count == 1 && "
        "gbastudio_shmup_project::project.music_asset_count == 1 && "
        "gbastudio_shmup_project::project.pcm_asset_count == 1 && "
        "gbastudio_shmup_project::project.tracker_asset_count == 0 && "
        "gbastudio_shmup_project::project.player.on_fire.commands[0].op == gbs::EventOp::PlaySfx",
        "shmup_compile_test",
    )


def assert_shmup_affine_scene_fixture_export(repo_root, build_dir):
    """Exercise the complete Affine SHMUP export without promoting visual art."""
    source_dir = build_dir / "shmup_affine_scene" / "source"
    output_dir = build_dir / "shmup_affine_scene" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    palette = [
        (0, 0, 0),
        (40, 96, 160),
        (112, 176, 208),
        (224, 224, 176),
    ]
    affine_indices = [
        ((x // 8) + (y // 8)) % len(palette)
        for y in range(1024)
        for x in range(1024)
    ]
    write_indexed_png(assets_dir / "day_bg.png", 1024, 1024, palette, affine_indices)

    obstacle_indices = [
        1 if 34 <= (x // 8) < 42 and 6 <= (y // 8) < 14 else 0
        for y in range(160)
        for x in range(720)
    ]
    write_indexed_png(
        assets_dir / "obstacles.png",
        720,
        160,
        palette,
        obstacle_indices,
        transparent_index=0,
    )

    collision_flags = [
        1 if 34 <= x < 42 and 6 <= y < 14 else 0
        for y in range(20)
        for x in range(90)
    ]
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "shmup",
        "runtime_profile": "shmup",
        "template_dir": str(repo_root / "templates" / "exported_shmup"),
        "entry": "main.cpp",
        "project_data": "shmup_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "shmup_affine_scene", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": [
                "shmup_runtime",
                "shmup_runtime.affine_background",
                "render_runtime.affine_bg_transform",
                "render_runtime.affine_bg_tilemap_load",
            ],
        },
        "asset_pack": {
            "assets": [
                {
                    "id": "day_bg",
                    "name": "day_bg",
                    "kind": "affine_bg",
                    "png": "assets/day_bg.png",
                    "background_bpp": 8,
                    "header": "day_bg.hpp",
                    "symbol": "day_bg",
                },
                {
                    "id": "obstacle_tiles",
                    "name": "obstacle_tiles",
                    "kind": "bg",
                    "png": "assets/obstacles.png",
                    "header": "obstacle_tiles.hpp",
                    "symbol": "obstacle_tiles",
                },
            ]
        },
        "shmup_project": {
            "background": 0,
            "resource_banks": "asset_pack",
            "backgrounds": [{
                "name": "day",
                "backdrop_color": 0,
                "width_tiles": 90,
                "height_tiles": 20,
                "layers": [{
                    "layer": "BG1",
                    "tilemap": "obstacle_tiles",
                    "scroll": {"x": 0, "y": 0},
                }],
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
                    "bitmap": None,
                },
                "collision_flags": collision_flags,
                "collision_width_tiles": 90,
                "collision_height_tiles": 20,
                "world_width_pixels": 720,
                "world_height_pixels": 160,
                "affine_scroll_pixels_per_frame": {"x": 2, "y": 0},
            }],
            "player": {
                "position": {"x": 80, "y": 64},
                "size": {"x": 32, "y": 32},
                "speed": 2,
                "fire_cooldown": 8,
                "projectile_offset": {"x": 24, "y": 12},
            },
            "projectile": {
                "size": {"x": 4, "y": 8},
                "velocity": {"x": 4, "y": 0},
                "max_active": 6,
            },
            "enemy_projectile": {
                "size": {"x": 4, "y": 8},
                "velocity": {"x": -2, "y": 0},
                "max_active": 6,
            },
            "waves": [{
                "name": "opening",
                "start_frame": 0,
                "resource_bank_group": "global",
                "enemies": [],
            }],
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")

    run_assetc(repo_root, manifest_path, output_dir)

    output_manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    assert output_manifest["runtime_adapter"]["base_runtime"] == "shmup"
    assert output_manifest["runtime_adapter"]["project_block"] == "shmup_project"
    assert "day_bg.hpp" in output_manifest["generated_assets"]
    assert "obstacle_tiles.hpp" in output_manifest["generated_assets"]

    header = (output_dir / "shmup_project_data.hpp").read_text(encoding="utf-8")
    affine_asset_header = (output_dir / "day_bg.hpp").read_text(encoding="utf-8")
    obstacle_asset_header = (output_dir / "obstacle_tiles.hpp").read_text(encoding="utf-8")
    for snippet in (
        '#include "day_bg.hpp"',
        '#include "obstacle_tiles.hpp"',
        "gbs::BackgroundLayer::BG1",
        "gbs::DisplayMode>(1)",
        "constexpr gbs::ResourceBank resource_banks[]",
        "constexpr gbs::ResourceBankGroup resource_bank_groups[]",
        'gbs::ShmupWaveData { "opening"',
        '"global"',
        "&day_bg_tile_asset",
        "&day_bg_tilemap_asset",
        "&day_bg_palette_asset",
        "obstacle_tiles_tilemap_asset",
        "shmup_background_0_collision_flags[1800]",
        "static_cast<uint16_t>(720), static_cast<uint16_t>(160)",
    ):
        assert snippet in header
    assert "gbs::AffineTileMapAsset day_bg_tilemap_asset" in affine_asset_header
    assert "gbs::TileMapAsset obstacle_tiles_tilemap_asset" in obstacle_asset_header
    obstacle_tilemap_entries = [
        int(value, 16)
        for value in re.findall(
            r"0x[0-9a-f]+",
            re.findall(
                r"obstacle_tiles_tilemap_entries\[1800\] = \{(.*?)\};",
                obstacle_asset_header,
                re.S,
            )[0],
        )
    ]
    assert 1 in obstacle_tilemap_entries
    assert 2 in obstacle_tilemap_entries
    obstacle_tiles = re.findall(
        r"\{([^{}]+)\},",
        re.search(r"obstacle_tiles_tiles\[2\]\[32\] = \{(.*?)\n\};", obstacle_asset_header, re.S)[1],
    )
    assert len(obstacle_tiles) == 2
    assert set(re.findall(r"0x[0-9a-f]+", obstacle_tiles[0])) == {"0x0"}
    assert set(re.findall(r"0x[0-9a-f]+", obstacle_tiles[1])) == {"0x11"}

    compile_generated_header(
        repo_root,
        output_dir,
        "shmup_project_data.hpp",
        "gbs::is_valid_shmup_project_data(gbastudio_shmup_project::project) && "
        "gbastudio_shmup_project::project.player.size_pixels.x == 32 && "
        "gbastudio_shmup_project::project.player.size_pixels.y == 32 && "
        "gbastudio_shmup_project::project.backgrounds[0].video.affine_enabled && "
        "gbastudio_shmup_project::project.backgrounds[0].video.affine_layer == gbs::BackgroundLayer::BG2 && "
        "gbastudio_shmup_project::project.backgrounds[0].layer_count == 1 && "
        "gbastudio_shmup_project::project.backgrounds[0].layers[0].layer == gbs::BackgroundLayer::BG1 && "
        "gbastudio_shmup_project::project.backgrounds[0].collision_count == 1800 && "
        "gbastudio_shmup_project::project.backgrounds[0].world_width_pixels == 720 && "
        "gbastudio_shmup_project::project.backgrounds[0].world_height_pixels == 160 && "
        "gbastudio_shmup_project::project.backgrounds[0].video.affine_tilemap != nullptr && "
        "gbastudio_shmup_project::project.backgrounds[0].video.affine_tilemap->width == 128 && "
        "gbastudio_shmup_project::project.backgrounds[0].video.affine_tilemap->height == 128 && "
        "gbastudio_shmup_project::project.resource_bank_count == 2 && "
        "gbastudio_shmup_project::project.resource_bank_group_count == 1 && "
        "gbastudio_shmup_project::project.waves[0].resource_bank_group_name[0] == 'g'",
        "shmup_affine_scene_compile_test",
    )
    runtime_source = (output_dir / "main.cpp").read_text(encoding="utf-8")
    assert "refresh_affine_background" in runtime_source
    assert "shmup_background_collision_at" in runtime_source
    compile_exported_runtime_source(
        repo_root,
        output_dir,
        "main.cpp",
        "shmup_affine_scene_runtime_compile_test.o",
    )


def assert_shmup_affine_background_export(repo_root, build_dir):
    source_dir = build_dir / "shmup_affine_background" / "source"
    output_dir = build_dir / "shmup_affine_background" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True, exist_ok=True)

    # The source is deliberately a physical 128x128-tile canvas.  The
    # logical SHMUP world exposes only 90x20 tiles (720x160 pixels), while
    # the remaining texels are padding required by the GBA affine map.
    width = 1024
    height = 1024
    palette = [
        (118, 198, 224),
        (220, 239, 238),
        (244, 196, 112),
        (79, 145, 176),
        (31, 83, 121),
        (15, 48, 76),
        (236, 146, 83),
        (47, 111, 124),
    ]
    indices = [
        ((x // 64) + (y // 64) + ((x // 8) % 4) + ((y // 8) % 3)) % len(palette)
        for y in range(height)
        for x in range(width)
    ]
    write_indexed_png(assets_dir / "day.png", width, height, palette, indices)

    project = shmup_project()
    project["background"] = 0
    project["player"]["size"] = {"x": 32, "y": 32}
    project["composition"] = {
        "enabled": True,
        "layers": [
            {"layer": "BG0", "kind": "hud", "role": "hud", "priority": 0},
            {"layer": "OBJ", "kind": "actors", "role": "gameplay", "priority": 1},
            {"layer": "BG1", "kind": "obstacles", "role": "gameplay", "priority": 1},
            {"layer": "BG2", "kind": "affine_bg", "role": "decorative", "priority": 2},
            {"layer": "scene_data", "kind": "collision", "role": "gameplay"},
        ],
    }
    project["backgrounds"] = [{
        "name": "daylight",
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
            "bitmap": None,
        },
        "collision_flags": [0] * (90 * 20),
        "collision_width_tiles": 90,
        "collision_height_tiles": 20,
        "world_width_pixels": 720,
        "world_height_pixels": 160,
        "affine_scroll_pixels_per_frame": {"x": 2, "y": 0},
    }]

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "shmup",
        "runtime_profile": "shmup",
        "template_dir": str(repo_root / "templates" / "exported_shmup"),
        "entry": "main.cpp",
        "project_data": "shmup_project_data.hpp",
        "generated_assets": ["day_bg.hpp"],
        "build": {"target": "shmup_affine_background", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["shmup_project_data", "shmup_runtime.affine_background"],
        },
        "shmup_project": project,
        "asset_pack": {"assets": [{
            "id": "day_bg",
            "name": "day_bg",
            "kind": "affine_bg",
            "png": "assets/day.png",
            "header": "day_bg.hpp",
            "symbol": "day_bg",
            "background_bpp": 8,
        }]},
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)

    asset_header = (output_dir / "day_bg.hpp").read_text(encoding="utf-8")
    assert "constexpr int day_bg_tilemap_width = 128;" in asset_header
    assert "constexpr int day_bg_tilemap_height = 128;" in asset_header
    for snippet in (
        "day_bg_tile_asset",
        "day_bg_tilemap_asset",
        "day_bg_palette_asset",
    ):
        assert snippet in asset_header

    project_header = (output_dir / "shmup_project_data.hpp").read_text(encoding="utf-8")
    assert "&day_bg_tile_asset" in project_header
    assert "&day_bg_tilemap_asset" in project_header
    assert "static_cast<uint16_t>(720)" in project_header
    assert "static_cast<uint16_t>(160)" in project_header
    assert "gbs::Vec2i { 32, 32 }" in project_header
    assert "shmup_background_0_layers" not in project_header

    compile_generated_header(
        repo_root,
        output_dir,
        "shmup_project_data.hpp",
        "gbs::is_valid_shmup_project_data(gbastudio_shmup_project::project) && "
        "gbastudio_shmup_project::project.backgrounds[0].video.affine_enabled && "
        "gbastudio_shmup_project::project.backgrounds[0].video.affine_tiles != nullptr && "
        "gbastudio_shmup_project::project.backgrounds[0].video.affine_tilemap != nullptr && "
        "gbastudio_shmup_project::project.backgrounds[0].world_width_pixels == 720 && "
        "gbastudio_shmup_project::project.player.size_pixels.x == 32",
        "shmup_affine_compile_test",
    )


def assert_shmup_dynamic_actor_sprites_and_emotes_export(repo_root, build_dir):
    source_dir = build_dir / "shmup_dynamic_actor_sprites" / "source"
    output_dir = build_dir / "shmup_dynamic_actor_sprites" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    palette = [(0, 0, 0), (255, 96, 0), (255, 255, 255)]
    write_indexed_png(assets_dir / "explosion.png", 16, 16, palette, [1] * 256)
    write_indexed_png(assets_dir / "alert.png", 16, 16, palette, [2] * 256)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "shmup",
        "template_dir": str(repo_root / "templates" / "exported_shmup"),
        "entry": "main.cpp",
        "project_data": "shmup_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "shmup_dynamic_actor_sprites", "make_target": "all"},
        "requires": {"engine_pack": ">=2.25.0", "features": ["shmup_project_data"]},
        "asset_pack": {
            "assets": [
                {"id": "explosion", "name": "explosion", "kind": "obj", "png": "assets/explosion.png", "sprite_width": 16, "sprite_height": 16, "header": "explosion.hpp", "symbol": "explosion"},
                {"id": "alert", "name": "alert", "kind": "obj", "png": "assets/alert.png", "sprite_width": 16, "sprite_height": 16, "header": "alert.hpp", "symbol": "alert"},
            ]
        },
        "shmup_project": {
            "player": {"position": {"x": 16, "y": 72}, "size": {"x": 16, "y": 16}, "speed": 2, "fire_cooldown": 8, "projectile_offset": {"x": 16, "y": 8}},
            "projectile": {"size": {"x": 4, "y": 8}, "velocity": {"x": 4, "y": 0}, "max_active": 6},
            "actor_sprites": [{"name": "explosion.png", "metasprite": {"asset": "explosion", "index": 0}}],
            "emote_assets": [{"name": "alert.png", "metasprite": {"asset": "alert", "index": 0}}],
            "waves": [{
                "name": "wave0",
                "enemies": [{
                    "name": "drone",
                    "position": {"x": 80, "y": 72},
                    "size": {"x": 16, "y": 16},
                    "velocity": {"x": -1, "y": 0},
                    "health": 1,
                    "score": 100,
                    "fire_interval": 0,
                    "on_destroy": [
                        {"op": "set_actor_sprite", "actor": 0, "sprite": 0},
                        {"op": "show_actor_gesture", "actor": 0, "index": 0, "frames": 60},
                    ],
                }],
            }],
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "shmup_project_data.hpp").read_text(encoding="utf-8")
    main_cpp = (output_dir / "main.cpp").read_text(encoding="utf-8")
    assert "constexpr gbs::DialogueEmoteEntry dialogue_emote_assets[]" in header
    assert "constexpr const gbs::MetaSprite* shmup_actor_sprites[]" in header
    assert "gbs::EventOp::SetActorSprite, 0, 0, 0" in header
    assert "event_state.actor_gesture_changed" in main_cpp
    assert "runtime_enemy.sprite_index" in main_cpp
    compile_generated_header(
        repo_root,
        output_dir,
        "shmup_project_data.hpp",
        "gbastudio_shmup_project::project.actor_sprite_count == 1 && "
        "gbastudio_shmup_project::project.actor_sprites[0] == &explosion_metasprites[0] && "
        "gbastudio_shmup_project::project.waves[0].enemies[0].on_destroy.commands[0].op == gbs::EventOp::SetActorSprite",
        "shmup_dynamic_actor_sprites_compile_test",
    )


def assert_visual_novel_profile_output(repo_root, output_dir):
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest.get("runtime_adapter", {})
    assert manifest["kind"] == "visual_novel"
    assert manifest["runtime_profile"] == "visual_novel"
    assert manifest["project_data"] == "visual_novel_project_data.hpp"
    assert adapter["base_runtime"] == "visual_novel"
    assert adapter["adapter"] == "native"
    assert adapter["project_block"] == "visual_novel_project"
    assert adapter["native"] is True
    header = (output_dir / "visual_novel_project_data.hpp").read_text(encoding="utf-8")
    assert "const gbs::VisualNovelProjectData project" in header
    assert "constexpr gbs::VisualNovelChoiceOptionData visual_novel_choice_group_0_options" in header
    assert "visual_novel_choice_group_0_choice_0_on_select" in header
    assert "gbs::EventOp::ShowDialogue" in header
    assert "constexpr bool save_enabled = true;" in header
    assert "gbs::make_save_signature('G', 'B', 'V', 'N')" in header
    assert "constexpr const gbs::DialoguePortraitEntry* dialogue_portrait_assets = nullptr;" in header
    assert "constexpr size_t dialogue_portrait_asset_count = 0;" in header
    assert "constexpr const gbs::ResourceBankUploadSource* resource_bank_upload_sources = nullptr;" in header
    assert "constexpr size_t resource_bank_upload_source_count = 0;" in header
    runtime = (repo_root / "templates" / "exported_visual_novel" / "main.cpp").read_text(encoding="utf-8")
    assert "gbs::stream_resource_bank_group_with_uploads(" in runtime
    assert "project.resource_bank_upload_sources" in runtime
    assert_native_template_consumes_audio_outputs(output_dir, "visual_novel_project_data.hpp", "visual_novel_project")

    compile_generated_header(
        repo_root,
        output_dir,
        "visual_novel_project_data.hpp",
        "gbs::is_valid_visual_novel_project_data(gbastudio_visual_novel_project::project)",
        "visual_novel_compile_test",
    )


def assert_menu_profile_output(repo_root, output_dir):
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest.get("runtime_adapter", {})
    assert manifest["kind"] == "menu"
    assert manifest["runtime_profile"] == "menu"
    assert manifest["project_data"] == "menu_project_data.hpp"
    assert adapter["base_runtime"] == "menu"
    assert adapter["adapter"] == "native"
    assert adapter["project_block"] == "menu_project"
    assert adapter["native"] is True
    header = (output_dir / "menu_project_data.hpp").read_text(encoding="utf-8")
    assert "const gbs::MenuProjectData project" in header
    assert "gbs::EventOp::ShowDialogue" in header
    assert "gbs::EventOp::SetVariable" in header
    assert "gbs::MenuItemAction::PushScreen" in header
    assert "gbs::MenuItemAction::ToggleVariable" in header
    assert "gbs::MenuItemAction::AdjustVariable" in header
    assert "gbs::MenuItemAction::PopScreen" in header
    assert "gbs::MenuItemBindingSource::Variable" in header
    assert "gbs::MenuItemBindingFormat::Percent" in header
    assert "gbs::MenuSceneProfile::InGame" in header
    assert "gbs::MenuSceneReturnPolicy::Resume" in header
    assert "gbs::MenuScenePresentationMode::Both" in header
    assert "gbs::MenuItemConditionData { 0, 1, true }" in header
    assert "gbs::MenuScreenType::Title" in header
    assert '"Sample Game"' in header
    assert "gbs::MenuClickBox { 72, 104, 96, 24 }" in header
    assert "gbs::MenuItemValueData { 1, 0, 1, 1 }, gbs::MenuClickBox { 0, 0, 240, 160 }, 1" in header
    assert "gbs::MenuTextInputKeyboardLayout::Grid" in header
    assert "gbs::MenuTextInputKeyboardData { gbs::MenuTextInputKeyboardLayout::Grid, 4, 8, 22, 6, true }" in header
    assert "constexpr bool save_enabled = true;" in header
    assert "gbs::make_save_signature('G', 'B', 'M', 'N')" in header
    assert_native_template_consumes_audio_outputs(output_dir, "menu_project_data.hpp", "menu_project")

    compile_generated_header(
        repo_root,
        output_dir,
        "menu_project_data.hpp",
        "gbs::is_valid_menu_project_data(gbastudio_menu_project::project)",
        "menu_compile_test",
    )


def assert_cutscene_profile_output(repo_root, output_dir):
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest.get("runtime_adapter", {})
    assert manifest["kind"] == "cutscene"
    assert manifest["runtime_profile"] == "cutscene"
    assert manifest["project_data"] == "cutscene_project_data.hpp"
    assert adapter["base_runtime"] == "cutscene"
    assert adapter["adapter"] == "native"
    assert adapter["project_block"] == "cutscene_project"
    assert adapter["native"] is True
    header = (output_dir / "cutscene_project_data.hpp").read_text(encoding="utf-8")
    assert "const gbs::CutsceneProjectData project" in header
    assert "gbs::EventOp::SetVariable" in header
    assert "gbs::CutsceneBranchData { 0, 1, 1, -1 }" in header
    assert "cutscene_scene_0_step_2_on_skip" in header
    assert "false, false, gbs::EventScript { cutscene_scene_0_step_2_on_skip_commands" in header
    assert "constexpr bool save_enabled = true;" in header
    assert "gbs::make_save_signature('G', 'B', 'C', 'S')" in header
    assert "resource_bank_upload_sources" in header
    assert "resource_bank_upload_source_count" in header
    assert "gbs::stream_resource_bank_group_with_uploads(" in (repo_root / "templates" / "exported_cutscene" / "main.cpp").read_text(encoding="utf-8")
    assert_native_template_consumes_audio_outputs(output_dir, "cutscene_project_data.hpp", "cutscene_project")

    compile_generated_header(
        repo_root,
        output_dir,
        "cutscene_project_data.hpp",
        "gbs::is_valid_cutscene_project_data(gbastudio_cutscene_project::project)",
        "cutscene_compile_test",
    )


def assert_world_map_profile_output(repo_root, output_dir):
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest.get("runtime_adapter", {})
    assert manifest["kind"] == "world_map"
    assert manifest["runtime_profile"] == "world_map"
    assert manifest["project_data"] == "world_map_project_data.hpp"
    assert adapter["base_runtime"] == "world_map"
    assert adapter["adapter"] == "native"
    assert adapter["project_block"] == "world_map_project"
    assert adapter["native"] is True
    header = (output_dir / "world_map_project_data.hpp").read_text(encoding="utf-8")
    assert "const gbs::WorldMapProjectData project" in header
    assert "world_map_node_0_connections" in header
    assert "gbs::EventOp::SetVariable" in header
    assert "world_map_node_2_on_locked" in header
    assert "2, 1, false, 2, gbs::EventScript { world_map_node_2_on_locked_commands" in header
    assert "nullptr, 3, 1, true, -1, gbs::empty_event_script()" in header
    assert "constexpr bool save_enabled = true;" in header
    assert "gbs::make_save_signature('G', 'B', 'W', 'M')" in header
    assert_native_template_consumes_audio_outputs(output_dir, "world_map_project_data.hpp", "world_map_project")

    compile_generated_header(
        repo_root,
        output_dir,
        "world_map_project_data.hpp",
        "gbs::is_valid_world_map_project_data(gbastudio_world_map_project::project)",
        "world_map_compile_test",
    )


def assert_dungeon_crawler_native_export(repo_root, build_dir):
    output_dir = build_dir / "dungeon_crawler_native"
    source_dir = build_dir / "dungeon_crawler_native_source"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    palette = [(0, 0, 0), (36, 72, 96), (124, 168, 156), (232, 196, 108)]
    indices = [1 + ((x // 8 + y // 8) % 3) for y in range(64) for x in range(192)]
    write_indexed_png(assets_dir / "sentinel.png", 192, 64, palette, indices)
    fixture = json.loads((repo_root / "tests" / "fixtures" / "export_dungeon_crawler_project.json").read_text(encoding="utf-8"))
    fixture["template_dir"] = str(repo_root / "templates" / "exported_dungeon_crawler")
    fixture["asset_pack"] = {"assets": [{
        "id": "sentinel",
        "name": "sentinel",
        "kind": "obj",
        "png": "assets/sentinel.png",
        "sprite_width": 64,
        "sprite_height": 64,
        "header": "sentinel.hpp",
        "symbol": "sentinel"
    }]}
    fixture["dungeon_crawler_project"]["rooms"][0]["actors"] = [{
        "name": "Sentinel",
        "position": {"x": 1, "y": 3},
        "metasprite": {"asset": "sentinel", "index": 0},
        "depth_metasprites": {
            "far": {"asset": "sentinel", "index": 0},
            "mid": {"asset": "sentinel", "index": 1},
            "near": {"asset": "sentinel", "index": 2}
        }
    }]
    fixture["dungeon_crawler_project"]["inventory_items"] = [{
        "label": "CELL",
        "item": 2,
        "initial_quantity": 1,
        "heal_amount": 1,
    }]
    fixture["dungeon_crawler_project"]["battle"] = {
        "enemy_name": "SENTINEL",
        "enemy_actor_index": 0,
        "max_hp": 3,
        "player_damage": 1,
        "enemy_damage": 1,
        "reward_item": 3,
        "reward_quantity": 1,
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    run_assetc(
        repo_root,
        manifest_path,
        output_dir,
    )
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest["runtime_adapter"]
    assert manifest["kind"] == "dungeon_crawler"
    assert manifest["runtime_profile"] == "dungeon_crawler"
    assert manifest["project_data"] == "dungeon_crawler_project_data.hpp"
    assert adapter["base_runtime"] == "dungeon_crawler"
    assert adapter["project_block"] == "dungeon_crawler_project"
    assert adapter["native"] is True
    header = (output_dir / "dungeon_crawler_project_data.hpp").read_text(encoding="utf-8")
    assert "gbs::DungeonCrawlerConfig { 12, 6, false, 7 }" in header
    assert "gbs::DungeonDirection::East" in header
    assert "gbs::DungeonCrawlerDepthSprites dungeon_room_0_actor_0_depth_sprites" in header
    assert "&sentinel_metasprites[0], &sentinel_metasprites[1], &sentinel_metasprites[2]" in header
    assert "&sentinel_metasprite, dungeon_room_0_actor_0_depth_sprites" not in header
    assert "&dungeon_room_0_actor_0_depth_sprites" in header
    assert "gbs::DungeonCrawlerInventoryItemData dungeon_inventory_items[]" in header
    assert 'gbs::DungeonCrawlerInventoryItemData { "CELL", 2, 1, 1 }' in header
    assert 'gbs::DungeonCrawlerBattleData { "SENTINEL", 0, 3, 1, 1, 3, 1 }' in header
    runtime_template = (repo_root / "templates" / "exported_dungeon_crawler" / "main.cpp").read_text(encoding="utf-8")
    assert "project.compass_enabled ? dungeon_compass_hp_text" in runtime_template
    assert "if (input.was_pressed(gbs::ButtonSelect))" in runtime_template
    assert "gbs::dungeon_exploration_mark" in runtime_template
    assert "gbs::draw_dialogue(map_dialogue)" in runtime_template
    compile_generated_header(
        repo_root,
        output_dir,
        "dungeon_crawler_project_data.hpp",
        "gbs::is_valid_dungeon_crawler_project_data(gbastudio_dungeon_crawler_project::project)",
        "dungeon_crawler_compile_test",
    )


def assert_racing_native_export(repo_root, build_dir):
    source_dir = build_dir / "racing_native" / "source"
    output_dir = build_dir / "racing_native" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    write_indexed_png(
        assets_dir / "rival.png",
        16,
        16,
        [(0, 0, 0), (224, 80, 48)],
        [1] * (16 * 16),
    )
    fixture = json.loads((repo_root / "tests" / "fixtures" / "export_racing_project.json").read_text(encoding="utf-8"))
    fixture["template_dir"] = str(repo_root / "templates" / "exported_racing")
    fixture["asset_pack"] = {"assets": [{
        "id": "rival",
        "name": "rival",
        "kind": "obj",
        "png": "assets/rival.png",
        "sprite_width": 16,
        "sprite_height": 16,
        "header": "rival.hpp",
        "symbol": "rival",
    }]}
    fixture["racing_project"]["assets"] = {"obj_palettes": ["rival"], "tile_assets": ["rival"]}
    fixture["racing_project"]["player"] = {
        "idle_metasprite": {"asset": "rival", "index": 0},
        "drive_metasprite": {"asset": "rival", "index": 0},
    }
    fixture["racing_project"]["rooms"][0]["actors"] = [{
        "name": "Rival",
        "position_pixels": {"x": 40, "y": 80},
        "metasprite": {"asset": "rival", "index": 0},
    }]
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    run_assetc(
        repo_root,
        manifest_path,
        output_dir,
    )
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest["runtime_adapter"]
    assert manifest["kind"] == "racing"
    assert manifest["runtime_profile"] == "racing"
    assert manifest["project_data"] == "racing_project_data.hpp"
    assert adapter["base_runtime"] == "racing"
    assert adapter["project_block"] == "racing_project"
    assert adapter["native"] is True
    header = (output_dir / "racing_project_data.hpp").read_text(encoding="utf-8")
    assert (
        "gbs::RacingConfig { 1536, 2560, 3584, 640, "
        "gbs::RacingPseudo3DConfig { gbs::RacingPresentation::Pseudo3D, 2, 3, 2, 896, 14, true } }"
    ) in header
    assert "constexpr gbs::RacingTrackSegment racing_room_0_track_segments[]" in header
    assert "racing_room_0_track_segments, 3" in header
    assert "constexpr gbs::RacingTopdownCheckpoint racing_room_0_topdown_checkpoints[]" in header
    assert "constexpr gbs::Vec2i racing_room_0_topdown_path[]" in header
    assert "racing_room_0_topdown_track { 16, 24, racing_room_0_topdown_checkpoints, 2, 4, racing_room_0_topdown_path, 4 }" in header
    assert "racing_room_0_track_segments, 3, &racing_room_0_topdown_track" in header
    assert "gbs::Vec2i { 32, 80 }" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "racing_project_data.hpp",
        "gbs::is_valid_racing_project_data(gbastudio_racing_project::project)",
        "racing_compile_test",
    )


def assert_racing_pseudo3d_visual_asset_export(repo_root, build_dir):
    source_dir = build_dir / "racing_pseudo3d_visual" / "source"
    output_dir = build_dir / "racing_pseudo3d_visual" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    palette = [(12, 20, 36), (48, 104, 148), (224, 178, 92), (240, 232, 184)]
    write_indexed_png(assets_dir / "sky.png", 256, 256, palette, [1] * (256 * 256))
    write_indexed_png(assets_dir / "floor.png", 128, 128, palette, [index % 4 for index in range(128 * 128)])
    write_indexed_png(assets_dir / "minimap.png", 256, 256, palette, [2] * (256 * 256))
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "racing",
        "runtime_profile": "racing",
        "template_dir": str(repo_root / "templates" / "exported_racing"),
        "entry": "main.cpp",
        "project_data": "racing_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "racing_pseudo3d_visual", "make_target": "all"},
        "asset_pack": {"assets": [
            {"id": "track_sky", "name": "track_sky", "kind": "bg", "png": "assets/sky.png", "header": "track_sky.hpp", "symbol": "track_sky"},
            {"id": "track_floor", "name": "track_floor", "kind": "affine_bg", "png": "assets/floor.png", "header": "track_floor.hpp", "symbol": "track_floor"},
            {"id": "track_minimap", "name": "track_minimap", "kind": "bg", "png": "assets/minimap.png", "header": "track_minimap.hpp", "symbol": "track_minimap"},
        ]},
        "racing_project": {
            "initial_room": 0,
            "assets": {
                "bg_palettes": ["track_sky", "track_floor", "track_minimap"],
                "tile_assets": ["track_sky", "track_minimap"],
            },
            "pseudo3d_visuals": [{
                "horizon_y": 48,
                "panorama": "track_sky",
                "floor": "track_floor",
                "minimap": "track_minimap",
            }],
            "rooms": [{
                "name": "track",
                "width_tiles": 4,
                "height_tiles": 4,
                "collision_flags": [0] * 16,
                "config": {
                    "max_speed_x256": 1024,
                    "acceleration_x256_per_second": 2048,
                    "brake_power_x256_per_second": 3072,
                    "steering_speed_x256": 512,
                    "presentation": "pseudo3d",
                },
                "player_start_pixels": {"x": 16, "y": 16},
                "pseudo3d_visual": 0,
            }],
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "racing_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr gbs::RacingPseudo3DVisualData racing_pseudo3d_visuals[]" in header
    assert "&track_floor_tile_asset" in header
    assert "&racing_pseudo3d_visuals[0]" in header
    pack_report = json.loads((output_dir / "asset_pack_report.json").read_text(encoding="utf-8"))
    sky_palette = pack_report["asset_reports"]["track_sky"]["allocations"]["bg_palette_colors"]
    floor_palette = pack_report["asset_reports"]["track_floor"]["allocations"]["bg_palette_colors"]
    minimap_palette = pack_report["asset_reports"]["track_minimap"]["allocations"]["bg_palette_colors"]
    assert sky_palette["start"] == floor_palette["start"] == minimap_palette["start"]
    assert floor_palette["shared_with"] == "track_sky"
    assert minimap_palette["shared_with"] == "track_sky"
    compile_generated_header(
        repo_root,
        output_dir,
        "racing_project_data.hpp",
        "gbs::racing_pseudo3d_visual_for_room(gbastudio_racing_project::project.rooms[0]) != nullptr",
        "racing_pseudo3d_visual_compile_test",
    )


def assert_battle_rpg_native_export(repo_root, build_dir):
    output_dir = build_dir / "battle_rpg_native"
    run_assetc(repo_root, repo_root / "tests" / "fixtures" / "export_battle_rpg_project.json", output_dir)
    manifest = json.loads((output_dir / "gbastudio_project.json").read_text(encoding="utf-8"))
    adapter = manifest["runtime_adapter"]
    assert manifest["kind"] == "battle_rpg"
    assert manifest["project_data"] == "battle_rpg_project_data.hpp"
    assert adapter["project_block"] == "battle_rpg_project"
    assert adapter["native"] is True
    header = (output_dir / "battle_rpg_project_data.hpp").read_text(encoding="utf-8")
    main_cpp = (output_dir / "main.cpp").read_text(encoding="utf-8")
    assert "gbs::BattleRpgConfig { 3, 4, 12, false, true }" in header
    assert 'gbs::BattleRpgParticipantData { "Hero"' in header
    assert "gbs::BattleRpgAbilityKind::Magic, 7" in header
    assert "gbs::BattleRpgRewards { 25, 10 }" in header
    assert "gbs::EventOp::ShowDialogue" in header
    assert "gbs::EventOp::WarpRuntime" in header
    assert "gbs::make_save_signature('G', 'B', 'B', 'R')" in header
    assert "constexpr bool save_autosave = true;" in header
    assert 'gbs::DialogueLine { "Battle start"' in header
    assert "resource_bank_upload_sources" in header
    assert "resource_bank_upload_source_count" in header
    assert "constexpr size_t max_resource_bank_reservations = 64;" in main_cpp
    assert "gbs::stream_resource_bank_group_with_uploads(" in main_cpp
    assert "gbastudio_battle_rpg_project::resource_bank_upload_sources" in main_cpp
    compile_generated_header(
        repo_root,
        output_dir,
        "battle_rpg_project_data.hpp",
        "gbs::is_valid_battle_rpg_project_data(gbastudio_battle_rpg_project::project)",
        "battle_rpg_compile_test",
    )


def assert_luta_native_export(repo_root, build_dir):
    source_dir = build_dir / "luta_native" / "source"
    output_dir = build_dir / "luta_native" / "exported"
    source_dir.mkdir(parents=True)
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    write_indexed_png(
        assets_dir / "fighter.png",
        64,
        64,
        [(0, 0, 0), (255, 255, 255), (255, 64, 64)],
        [1 if (x // 8 + y // 8) % 2 == 0 else 2 for y in range(64) for x in range(64)],
    )
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "luta",
        "runtime_profile": "luta",
        "template_dir": str(repo_root / "templates" / "exported_luta"),
        "entry": "main.cpp",
        "project_data": "luta_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "luta_native", "make_target": "all"},
        "asset_pack": {
            "assets": [{
                "name": "arena_fighter",
                "id": "arena_fighter",
                "kind": "obj",
                "png": "assets/fighter.png",
                "sprite_width": 32,
                "sprite_height": 64,
                "header": "arena_fighter.hpp",
                "symbol": "arena_fighter",
            }]
        },
        "luta_project": {
            "initial_stage": 0,
            "dialogue_lines": ["Arena", "Vitoria"],
            "stages": [{
                "name": "arena",
                "config": {
                    "round_time": 99,
                    "rounds_to_win": 1,
                    "max_super_gauge": 100,
                    "super_gauge_gain_on_hit": 8,
                    "super_gauge_gain_on_receive": 4,
                    "guard_power_recovery": 2,
                    "chip_damage_enabled": True,
                    "air_blocking_enabled": True,
                    "alpha_counter_enabled": True,
                    "throw_escape_window": 8,
                    "parry_window": 4,
                    "hitstun_decay": 0.85,
                    "combo_limit": 60,
                    "vism_custom_combo_gauge": 100,
                    "default_style": "a-ism",
                    "stage_id": "arena",
                    "player1_start_x": 64,
                    "player2_start_x": 176,
                },
                "player1": [{
                    "name": "Nara",
                    "unit": {"max_hp": 100, "attack": 12, "defense": 8, "speed": 10, "weight": 70},
                    "combo_stats": {"super_level": 1, "throw_range": 16, "guard_power": 48},
                    "animation_set": {
                        "fallback": "static_metasprite",
                        "idle": {
                            "asset": "arena_fighter",
                            "frame_indices": [0],
                            "durations": [8],
                            "frame_metasprites": [{
                                "parts": [{
                                    "x": 0,
                                    "y": -56,
                                    "slice_x": 0,
                                    "slice_y": 0,
                                    "width": 32,
                                    "height": 64,
                                }],
                            }],
                        },
                        "attack": {"asset": "arena_fighter", "frame_indices": [0, 1], "durations": [3, 3], "loops": False},
                        "special": {"asset": "arena_fighter", "frame_indices": [1, 0], "durations": [4, 4], "loops": False},
                        "guard": {"asset": "arena_fighter", "frame_indices": [0], "durations": [6]},
                        "hurt": {"asset": "arena_fighter", "frame_indices": [1], "durations": [6]},
                    },
                }],
                "player2": [{
                    "name": "Rival",
                    "unit": {"max_hp": 100, "attack": 12, "defense": 8, "speed": 10, "weight": 70},
                    "combo_stats": {"super_level": 1, "throw_range": 16, "guard_power": 48},
                    "animation_set": {
                        "fallback": "static_metasprite",
                        "idle": {"asset": "arena_fighter", "frame_indices": [0], "durations": [8]},
                        "attack": {"asset": "arena_fighter", "frame_indices": [0, 1], "durations": [3, 3], "loops": False},
                        "special": {"asset": "arena_fighter", "frame_indices": [1, 0], "durations": [4, 4], "loops": False},
                        "guard": {"asset": "arena_fighter", "frame_indices": [0], "durations": [6]},
                        "hurt": {"asset": "arena_fighter", "frame_indices": [1], "durations": [6]},
                    },
                }],
                "on_victory": [{"op": "show_dialogue", "dialogue": 1}],
                "on_defeat": [{"op": "warp_runtime", "runtime": "topdown", "room": 0, "x": 8, "y": 8}],
            }],
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "luta_project_data.hpp").read_text(encoding="utf-8")
    assert "gbs::LutaStageData" in header
    assert "gbs::EventOp::WarpRuntime" in header
    assert "gbs::LutaIsmStyle::AIsm" in header
    assert "gbs::LutaAnimationSet luta_stage_0_player1_0_animation_set" in header
    assert "gbs::LutaAnimationSet luta_stage_0_player2_0_animation_set" in header
    assert "luta_stage_0_player1_0_attack_animation" in header
    assert "luta_stage_0_player2_0_hurt_animation" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "luta_project_data.hpp",
        "gbs::is_valid_luta_project_data(gbastudio_luta_project::project)",
        "luta_compile_test",
    )
    compile_exported_runtime_source(
        repo_root,
        output_dir,
        "main.cpp",
        "luta_runtime_compile_test.o",
    )

    invalid_manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    invalid_manifest["luta_project"]["stages"][0]["player1"][0]["animation_set"]["fallback"] = "enable_all"
    invalid_manifest_path = source_dir / "invalid_fallback_export_project.json"
    invalid_manifest_path.write_text(json.dumps(invalid_manifest, indent=2) + "\n", encoding="utf-8")
    invalid_result = subprocess.run(
        [
            str(repo_root / "tools" / "assetc" / "assetc.py"),
            str(invalid_manifest_path),
            "-o",
            str(build_dir / "luta_native" / "invalid-export"),
            "--export-project-json",
        ],
        capture_output=True,
        text=True,
    )
    assert invalid_result.returncode != 0
    assert "fallback" in f"{invalid_result.stdout}\n{invalid_result.stderr}"


def assert_luta_template_consumes_animation_states(repo_root):
    template = (repo_root / "templates" / "exported_luta" / "main.cpp").read_text(encoding="utf-8")
    for snippet in [
        "gbs::LutaVisualStateData p1_visual_state",
        "gbs::LutaVisualStateData p2_visual_state",
        "gbs::luta_visual_metasprite_for(",
        "gbs::sync_luta_visual_state(",
        "gbs::tick_luta_visual_state(",
        "gbs::LutaVisualState::Attack",
        "gbs::LutaVisualState::Special",
        "gbs::LutaVisualState::Guard",
    ]:
        assert snippet in template

    header = (repo_root / "engine" / "include" / "gbs" / "luta.hpp").read_text(encoding="utf-8")
    for snippet in [
        "struct LutaAnimationSet",
        "struct LutaVisualStateData",
        "const LutaAnimationSet* animation_set = nullptr;",
    ]:
        assert snippet in header


def write_native_audio_fixture(source_dir, audio_id):
    audio_path = source_dir / f"{audio_id}.json"
    audio_path.write_text(
        json.dumps(
            {
                "sfx": [
                    {
                        "name": "confirm",
                        "tones": [
                            {"frequency_hz": 660, "duration_frames": 4, "volume": 10}
                        ],
                    }
                ],
                "music": [
                    {
                        "name": "theme",
                        "loop": True,
                        "steps": [
                            {"frequency_hz": 220, "duration_frames": 12, "volume": 7}
                        ],
                    }
                ],
                "tracker": [
                    {
                        "name": "cue",
                        "loop": False,
                        "order": [0],
                        "patterns": [
                            {
                                "steps": [
                                    {
                                        "channel": 2,
                                        "frequency_hz": 330,
                                        "duration_frames": 4,
                                        "volume": 5,
                                    }
                                ]
                            }
                        ],
                    }
                ],
                "pcm": [
                    {
                        "name": "hit",
                        "sample_rate_hz": 8000,
                        "loop": False,
                        "samples": [0, 12, -12, 0],
                    }
                ],
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return {
        "assets": [
            {
                "id": audio_id,
                "name": audio_id,
                "kind": "audio",
                "audio_json": f"{audio_id}.json",
                "header": f"{audio_id}.hpp",
                "symbol": audio_id,
            }
        ]
    }


def assert_platformer_isometric_audio_dialogue_exports(repo_root, build_dir):
    event_script = [
        {"op": "show_dialogue", "line": 0},
        {"op": "play_sfx", "index": 0},
        {"op": "play_music", "index": 0},
        {"op": "play_pcm_sfx", "index": 0},
        {"op": "stop_music"},
    ]
    cases = [
        {
            "kind": "platformer",
            "template": ("examples", "platformer_basic", "src"),
            "project_data": "platformer_project_data.hpp",
            "block": "platformer_project",
            "namespace": "gbastudio_platformer_project",
            "validator": "gbs::is_valid_platformer_project_data",
            "project": {
                "initial_room": 0,
                "dialogue_lines": ["Platformer audio dialogue"],
                "assets": {
                    "sfx_assets": ["platformer_audio"],
                    "music_assets": ["platformer_audio"],
                    "pcm_assets": ["platformer_audio"],
                    "tracker_assets": ["platformer_audio"],
                },
                "rooms": [
                    {
                        "name": "platformer_audio_room",
                        "width_tiles": 2,
                        "height_tiles": 2,
                        "visual_tiles": [0, 1, 1, 0],
                        "collision_flags": [0, 0, 0, 0],
                        "player_start": {"x": 8, "y": 8, "width": 16, "height": 16},
                        "on_enter": event_script,
                    }
                ],
            },
        },
        {
            "kind": "isometric",
            "template": ("examples", "isometric_basic", "src"),
            "project_data": "isometric_project_data.hpp",
            "block": "isometric_project",
            "namespace": "gbastudio_isometric_project",
            "validator": "gbs::is_valid_isometric_project_data",
            "project": {
                "initial_room": 0,
                "dialogue_lines": ["Isometric audio dialogue"],
                "assets": {
                    "sfx_assets": ["isometric_audio"],
                    "music_assets": ["isometric_audio"],
                    "pcm_assets": ["isometric_audio"],
                    "tracker_assets": ["isometric_audio"],
                },
                "rooms": [
                    {
                        "name": "isometric_audio_room",
                        "width_tiles": 2,
                        "height_tiles": 2,
                        "visual_tiles": [0, 1, 1, 0],
                        "collision_flags": [0, 0, 0, 0],
                        "on_enter": event_script,
                        "actors": [
                            {
                                "tile": {"x": 0, "y": 0, "z": 0},
                                "screen_offset": {"x": 0, "y": 0},
                                "tile_index": 0,
                                "palette": 0,
                            }
                        ],
                    }
                ],
            },
        },
    ]

    for case in cases:
        kind = case["kind"]
        source_dir = build_dir / f"{kind}_audio_dialogue" / "source"
        output_dir = build_dir / f"{kind}_audio_dialogue" / "exported"
        source_dir.mkdir(parents=True)
        audio_id = f"{kind}_audio"
        manifest = {
            "schema": 1,
            "backend": "gbastudio_engine",
            "kind": kind,
            "template_dir": str(repo_root.joinpath(*case["template"])),
            "entry": "main.cpp",
            "project_data": case["project_data"],
            "generated_assets": [],
            "build": {"target": f"{kind}_audio_dialogue", "make_target": "all"},
            "requires": {
                "engine_pack": ">=2.25.0",
                "features": [
                    f"{kind}_runtime",
                    f"asset-export-{kind}-project-data",
                    "asset_export_semantic_audio_refs",
                    "dialogue.visual_box",
                ],
            },
            case["block"]: case["project"],
            "asset_pack": write_native_audio_fixture(source_dir, audio_id),
        }
        manifest_path = source_dir / "export_project.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        run_assetc(repo_root, manifest_path, output_dir)

        header = (output_dir / case["project_data"]).read_text(encoding="utf-8")
        for snippet in [
            '#include "',
            f"{audio_id}.hpp",
            "gbs::EventOp::ShowDialogue",
            "gbs::EventOp::PlaySfx",
            "gbs::EventOp::PlayMusic",
            "gbs::EventOp::PlayPcmSfx",
            "gbs::EventOp::StopMusic",
            "project_sfx_assets",
            "project_music_assets",
            "project_pcm_assets",
            "project_tracker_assets",
        ]:
            assert snippet in header
        assert_native_template_consumes_audio_outputs(output_dir, case["project_data"], "project")
        compile_generated_header(
            repo_root,
            output_dir,
            case["project_data"],
            f"{case['validator']}({case['namespace']}::project) && "
            f"{case['namespace']}::project.dialogue_line_count == 1 && "
            f"{case['namespace']}::project.sfx_asset_count == 1 && "
            f"{case['namespace']}::project.music_asset_count == 1 && "
            f"{case['namespace']}::project.pcm_asset_count == 1 && "
            f"{case['namespace']}::project.tracker_asset_count == 1 && "
            f"{case['namespace']}::project.rooms[0].on_enter.commands[0].op == gbs::EventOp::ShowDialogue && "
            f"{case['namespace']}::project.rooms[0].on_enter.commands[1].op == gbs::EventOp::PlaySfx && "
            f"{case['namespace']}::project.rooms[0].on_enter.commands[2].op == gbs::EventOp::PlayMusic && "
            f"{case['namespace']}::project.rooms[0].on_enter.commands[3].op == gbs::EventOp::PlayPcmSfx && "
            f"{case['namespace']}::project.rooms[0].on_enter.commands[4].op == gbs::EventOp::StopMusic",
            f"{kind}_audio_dialogue_compile_test",
        )


def assert_dialogue_ui_config_export(repo_root, build_dir):
    source_dir = build_dir / "dialogue_ui" / "source"
    output_dir = build_dir / "dialogue_ui" / "exported"
    source_dir.mkdir(parents=True)
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "dialogue_ui", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "dialogue_ui_config"],
        },
        "topdown_project": {
            **topdown_like_project("dialogue_ui"),
            "dialogue_ui": {
                "frame_index": 1,
                "wrap_columns": 24,
                "wrap_lines": 4,
                "box_width": 24,
                "box_height": 5,
                "show_portrait": False,
                "show_character_name": True,
                "portrait_layout": "fixed_slots",
                "name_label_mode": "above",
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "gbs::DialogueUiConfig { 1, 24, 4, false, true, false, true, true, 24, 5 }" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::project.dialogue_ui.wrap_columns == 24 && "
        "gbastudio_project::project.dialogue_ui.wrap_lines == 4 && "
        "gbastudio_project::project.dialogue_ui.frame_index == 1 && "
        "!gbastudio_project::project.dialogue_ui.show_portrait && "
        "gbastudio_project::project.dialogue_ui.show_character_name && "
        "gbastudio_project::project.dialogue_ui.fixed_portrait_slots && "
        "gbastudio_project::project.dialogue_ui.name_label_above",
        "dialogue_ui_config_compile_test",
    )


def assert_dialogue_box_skin_export(repo_root, build_dir):
    source_dir = build_dir / "dialogue_box_skin" / "source"
    output_dir = build_dir / "dialogue_box_skin" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    # 24x24 PNG (3x3 grid of 8x8 tiles). Color index of each 8x8 block equals
    # its raster zone index (0=top-left ... 4=fill ... 8=bottom-right), so the
    # packed nibble bytes double as a deterministic fingerprint per zone.
    palette = [(zone * 20, zone * 20, zone * 20) for zone in range(9)]
    indices = [0] * (24 * 24)
    for tile_y in range(3):
        for tile_x in range(3):
            zone = tile_y * 3 + tile_x
            for y in range(8):
                for x in range(8):
                    indices[(tile_y * 8 + y) * 24 + tile_x * 8 + x] = zone
    write_indexed_png(assets_dir / "dialogue_box.png", 24, 24, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "dialogue_box_skin", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "dialogue_box_skin"],
        },
        "topdown_project": {
            **topdown_like_project("dialogue_box_skin"),
            "dialogue_ui": {
                "box_skin": "assets/dialogue_box.png",
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr uint8_t dialogue_box_skin_tiles[9][32]" in header
    assert "constexpr gbs::DialogueBoxSkin dialogue_box_skin_value" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::dialogue_box_skin->tiles == &gbastudio_project::dialogue_box_skin_tiles[0][0] && "
        "gbastudio_project::dialogue_box_skin_tiles[0][0] == static_cast<uint8_t>(2 | (2 << 4)) && "
        "gbastudio_project::dialogue_box_skin_tiles[4][0] == static_cast<uint8_t>(1 | (1 << 4)) && "
        "gbastudio_project::dialogue_box_skin_tiles[8][0] == static_cast<uint8_t>(10 | (10 << 4)) && "
        "gbastudio_project::dialogue_box_skin_palette[1] == 10570 && "
        "gbastudio_project::dialogue_box_skin_palette[4] == 21140",
        "dialogue_box_skin_compile_test",
    )


def assert_shared_hud_skin_falls_back_to_dialogue_box(repo_root, build_dir):
    source_dir = build_dir / "shared_hud_skin_fallback" / "source"
    output_dir = build_dir / "shared_hud_skin_fallback" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    palette = [(0, 0, 0), (240, 240, 240)]
    write_indexed_png(assets_dir / "dialogue_box.png", 24, 24, palette, [0] * (24 * 24))
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "shared_hud_skin_fallback", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "dialogue_box_skin"],
        },
        "topdown_project": {
            **topdown_like_project("shared_hud_skin_fallback"),
            "dialogue_ui": {
                "box_skin": "assets/dialogue_box.png",
                "hud_presets": [{
                    "id": "shmup-default",
                    "hud_position": "Superior",
                    "hud_width": 208,
                    "hud_height": 16,
                }],
                "hud_scene_bindings": [{
                    "scene_name": "storm",
                    "preset_id": "shmup-default",
                }],
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)

    header = (output_dir / "dialogue_ui_assets.hpp").read_text(encoding="utf-8")
    assert "constexpr uint8_t dialogue_box_skin_tiles[9][32]" in header
    assert "constexpr uint8_t hud_box_skin_tiles[9][32]" in header
    assert "constexpr uint8_t hud_preset_shmup_default_skin_tiles[9][32]" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "dialogue_ui_assets.hpp",
        "gbastudio_dialogue_ui::hud_box_skin_tiles[0][0] == "
        "gbastudio_dialogue_ui::dialogue_box_skin_tiles[0][0] && "
        "gbastudio_dialogue_ui::hud_preset_shmup_default_skin_tiles[0][0] == "
        "gbastudio_dialogue_ui::dialogue_box_skin_tiles[0][0] && "
        "gbastudio_dialogue_ui::hud_preset_configs[0].skin == "
        "gbastudio_dialogue_ui::hud_preset_shmup_default_skin",
        "shared_hud_skin_fallback_compile_test",
    )


def assert_dialogue_font_export(repo_root, build_dir):
    source_dir = build_dir / "dialogue_font" / "source"
    output_dir = build_dir / "dialogue_font" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    # Atlas U+0020..U+00FF in a 16x14 grid. Only the "A" cell is filled,
    # proving assetc reorders Unicode cells into gbs_text_glyph_index order.
    palette = [(0, 0, 0), (255, 255, 255)]
    indices = [0] * (128 * 112)
    glyph_index = ord("A") - 0x20
    tile_x = (glyph_index % 16) * 8
    tile_y = (glyph_index // 16) * 8
    for y in range(8):
        for x in range(8):
            indices[(tile_y + y) * 128 + tile_x + x] = 1
    write_indexed_png(assets_dir / "dialogue_font.png", 128, 112, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "dialogue_font", "make_target": "all"},
        "requires": {"engine_pack": ">=2.25.0", "features": ["topdown_project_data", "dialogue_font"]},
        "topdown_project": {
            **topdown_like_project("dialogue_font"),
            "dialogue_ui": {"font_image": "assets/dialogue_font.png"},
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr uint8_t dialogue_font_tiles[128][32]" in header
    assert "constexpr gbs::DialogueFont dialogue_font_value" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::dialogue_font->tiles == &gbastudio_project::dialogue_font_tiles[0][0] && "
        "gbastudio_project::dialogue_font_tiles[0][0] == 0 && "
        "gbastudio_project::dialogue_font_tiles[1][0] == static_cast<uint8_t>(4 | (4 << 4))",
        "dialogue_font_compile_test",
    )


def assert_dialogue_choice_selector_export(repo_root, build_dir):
    source_dir = build_dir / "dialogue_choice_selector" / "source"
    output_dir = build_dir / "dialogue_choice_selector" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    palette = [(0, 0, 0), (80, 80, 80), (240, 240, 240)]
    write_indexed_png(assets_dir / "dialogue_box.png", 24, 24, palette, [0] * (24 * 24))
    write_indexed_png(assets_dir / "dialogue_selector.png", 8, 8, palette, [2] * (8 * 8))
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "dialogue_choice_selector", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "dialogue_box_skin", "dialogue_choice_selector"],
        },
        "topdown_project": {
            **topdown_like_project("dialogue_choice_selector"),
            "dialogue_ui": {
                "box_skin": "assets/dialogue_box.png",
                "selector_skin": "assets/dialogue_selector.png",
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr uint8_t dialogue_choice_selector_tile[32]" in header
    assert "constexpr gbs::DialogueChoiceSelector dialogue_choice_selector_value" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::dialogue_choice_selector->tile == gbastudio_project::dialogue_choice_selector_tile && "
        "gbastudio_project::dialogue_choice_selector_tile[0] == static_cast<uint8_t>(3 | (3 << 4))",
        "dialogue_choice_selector_compile_test",
    )


def assert_dialogue_box_skin_rejects_wrong_size(repo_root, build_dir):
    source_dir = build_dir / "dialogue_box_skin_wrong_size" / "source"
    output_dir = build_dir / "dialogue_box_skin_wrong_size" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    write_indexed_png(assets_dir / "dialogue_box.png", 16, 16, [(0, 0, 0), (255, 255, 255)], [0] * 256)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "dialogue_box_skin_wrong_size", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "dialogue_box_skin"],
        },
        "topdown_project": {
            **topdown_like_project("dialogue_box_skin_wrong_size"),
            "dialogue_ui": {
                "box_skin": "assets/dialogue_box.png",
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    try:
        run_assetc(repo_root, manifest_path, output_dir, capture_output=True)
        raise AssertionError("assetc deveria rejeitar PNG de skin com dimensoes diferentes de 24x24")
    except subprocess.CalledProcessError as error:
        assert "PNG precisa ter 24x24 pixels" in (error.stderr or "")


def assert_custom_dialogue_skin_keeps_text_box_interior_opaque(repo_root):
    hardware_source = (repo_root / "engine" / "src" / "gbs_hw.c").read_text(encoding="utf-8")
    assert "if (skin_active) {" in hardware_source
    assert "skin_base + dialogue_box_skin_zone_index(x, y, box_w, box_h)" in hardware_source
    assert "} else if (y == 0 || y == box_h - 1 || x == 0 || x == box_w - 1) {" in hardware_source
    assert "tile = DIALOGUE_TILE_BORDER;" in hardware_source
    assert "tile = DIALOGUE_TILE_BLANK;" in hardware_source


def assert_dialogue_portrait_assets_export(repo_root, build_dir):
    source_dir = build_dir / "dialogue_portrait" / "source"
    output_dir = build_dir / "dialogue_portrait" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    palette = [
        (0, 0, 0),
        (255, 0, 0),
        (0, 255, 0),
    ]
    indices = [1] * 256
    write_indexed_png(assets_dir / "guide.png", 16, 16, palette, indices)
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "dialogue_portrait", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "dialogue_portrait_assets"],
        },
        "asset_pack": {
            "assets": [
                {
                    "id": "guide",
                    "name": "guide",
                    "kind": "obj",
                    "png": "assets/guide.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "header": "guide.hpp",
                    "symbol": "guide",
                }
            ]
        },
        "topdown_project": {
            **topdown_like_project("dialogue_portrait"),
            "dialogue_lines": [
                {"text": "Ola", "speaker": "Guia", "portrait": "guide.png", "key": "intro"}
            ],
            "portrait_assets": [
                {"name": "guide.png", "metasprite": {"asset": "guide", "index": 0}}
            ],
            "assets": {
                "obj_palettes": ["guide"],
                "tile_assets": ["guide"],
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr gbs::DialoguePortraitEntry dialogue_portrait_assets[]" in header
    assert '"guide.png"' in header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::dialogue_portrait_asset_count == 1 && "
        "gbastudio_project::dialogue_portrait_assets[0].metasprite == &guide_metasprites[0]",
        "dialogue_portrait_assets_compile_test",
    )


def assert_topdown_custom_metasprite_animation_export(repo_root, build_dir):
    source_dir = build_dir / "topdown_custom_metasprites" / "source"
    output_dir = build_dir / "topdown_custom_metasprites" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)

    palette = [
        (0, 0, 0),
        (255, 0, 0),
        (0, 255, 0),
        (0, 0, 255),
    ]
    indices = []
    for column in range(2):
        indices.extend([(column % 3) + 1] * (16 * 16))
    write_indexed_png(assets_dir / "wide.png", 32, 16, palette, indices)

    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "topdown_custom_metasprites", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "asset-export-topdown-animation-frame-subsets"],
        },
        "asset_pack": {
            "assets": [
                {
                    "name": "wide",
                    "id": "wide_sprite",
                    "bank_group": "actors",
                    "kind": "obj",
                    "png": "assets/wide.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "frame_duration": 5,
                    "header": "wide_sprite.hpp",
                    "symbol": "wide_sprite",
                }
            ]
        },
        "topdown_project": {
            "rooms": [
                {
                    "name": "wide_room",
                    "width_tiles": 2,
                    "height_tiles": 2,
                    "visual_tiles": [0, 0, 0, 0],
                    "collision_flags": [0, 0, 0, 0],
                    "metadata": {"player_start": {"x": 8, "y": 8}},
                }
            ],
            "player": {
                "position": {"x": 8, "y": 8},
                "size": {"x": 16, "y": 16},
                "speed": 1,
                "animation": "walk_wide",
                "animations": [
                    {
                        "name": "walk_wide",
                        "asset": "wide_sprite",
                        "frame_indices": [0],
                        "durations": [6],
                        "frame_metasprites": [
                            {
                                "parts": [
                                    {"x": -8, "y": 0, "slice_x": 0, "slice_y": 0},
                                    {"x": 0, "y": 0, "slice_x": 16, "slice_y": 0},
                                ]
                            }
                        ],
                    }
                ],
                "emit_animation_fallback": False,
            },
            "camera": {"position": {"x": 0, "y": 0}, "follow_player": True},
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "player_walk_wide_custom_metasprites" in header
    assert "player_walk_wide_custom_metasprites_frame_0_parts" in header
    assert "player_walk_wide_animation_frames" in header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::project.player.animation == &gbastudio_project::player_walk_wide_animation && "
        "gbastudio_project::project.player.animation_count == 1",
        "topdown_custom_metasprites_compile",
    )


def assert_dialogue_emote_assets_export(repo_root, build_dir):
    source_dir = build_dir / "dialogue_emote" / "source"
    output_dir = build_dir / "dialogue_emote" / "exported"
    assets_dir = source_dir / "assets"
    assets_dir.mkdir(parents=True)
    palette = [
        (0, 0, 0),
        (255, 0, 0),
        (0, 255, 0),
    ]
    indices = [1] * 256
    write_indexed_png(assets_dir / "shock.png", 16, 16, palette, indices)
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "examples" / "topdown_basic" / "src"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "dialogue_emote", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.25.0",
            "features": ["topdown_project_data", "dialogue_emote_assets"],
        },
        "asset_pack": {
            "assets": [
                {
                    "id": "shock",
                    "name": "shock",
                    "kind": "obj",
                    "png": "assets/shock.png",
                    "sprite_width": 16,
                    "sprite_height": 16,
                    "header": "shock.hpp",
                    "symbol": "shock",
                }
            ]
        },
        "topdown_project": {
            **topdown_like_project("dialogue_emote"),
            "dialogue_lines": [
                {"text": "Nossa!", "speaker": "Ana", "emote": "shock.png", "key": "surprise"}
            ],
            "emote_assets": [
                {"name": "shock.png", "metasprite": {"asset": "shock", "index": 0}}
            ],
            "assets": {
                "obj_palettes": ["shock"],
                "tile_assets": ["shock"],
            },
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)
    header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert "constexpr gbs::DialogueEmoteEntry dialogue_emote_assets[]" in header
    assert '"shock.png"' in header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_project::dialogue_emote_asset_count == 1 && "
        "gbastudio_project::dialogue_emote_assets[0].metasprite == &shock_metasprites[0] && "
        "gbastudio_project::dialogue_lines[0].emote[0] == 's'",
        "dialogue_emote_assets_compile_test",
    )


def assert_advanced_tools_data_export(repo_root, build_dir):
    source_dir = build_dir / "advanced_tools" / "source"
    output_dir = build_dir / "advanced_tools" / "exported"
    source_dir.mkdir(parents=True)
    manifest = {
        "schema": 1,
        "backend": "gbastudio_engine",
        "kind": "topdown",
        "template_dir": str(repo_root / "templates" / "exported_topdown"),
        "entry": "main.cpp",
        "project_data": "gbastudio_project_data.hpp",
        "generated_assets": [],
        "build": {"target": "advanced_tools_data", "make_target": "all"},
        "requires": {
            "engine_pack": ">=2.24.0",
            "features": ["topdown_project_data", "advanced_tools_data"],
        },
        "topdown_project": topdown_like_project("advanced_tools"),
        "advanced_tools": {
            "schema": 1,
            "replays": [{
                "id": "route-1",
                "seed": 7,
                "initial_save_slot": 1,
                "frame_count": 4,
                "runs": [{"held": ["RIGHT"], "pressed": [], "frames": 4}],
            }],
            "save_snapshots": [{
                "id": "save-boss",
                "name": "Antes do chefe",
                "slot": 2,
                "variables": {"boss": 0},
                "inventory": {"potion": 3},
                "corruption": "none",
            }],
            "state_machines": [{"id": "slime", "initial_state": "idle", "state_count": 2, "transition_count": 1}],
            "timelines": [{"id": "intro", "duration_frames": 120, "keyframe_count": 1}],
            "effects": [{"id": "flash", "duration_frames": 20, "keyframe_count": 2}],
            "particles": [{
                "id": "dust",
                "preset": "dust",
                "max_particles": 16,
                "max_per_scanline": 8,
                "lifetime_frames": 20,
            }],
            "fonts": [{"id": "ui", "glyph_width": 8, "glyph_height": 8, "variable_width": True, "glyph_count": 1}],
            "localization": [{"id": "main", "source_locale": "pt-BR", "target_locales": ["en"], "entry_count": 1}],
            "gameplay_components": ["checkpoint", "inventory"],
        },
    }
    manifest_path = source_dir / "export_project.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    run_assetc(repo_root, manifest_path, output_dir)

    advanced_header = output_dir / "advanced_tools_project_data.hpp"
    assert advanced_header.exists()
    header = advanced_header.read_text(encoding="utf-8")
    assert "namespace gbastudio_advanced_tools" in header
    assert "constexpr std::size_t replay_count = 1;" in header
    assert "constexpr std::size_t save_snapshot_count = 1;" in header
    assert "constexpr std::size_t particle_count = 1;" in header
    assert "route-1" in header
    project_header = (output_dir / "gbastudio_project_data.hpp").read_text(encoding="utf-8")
    assert '#include "advanced_tools_project_data.hpp"' in project_header
    compile_generated_header(
        repo_root,
        output_dir,
        "gbastudio_project_data.hpp",
        "gbastudio_advanced_tools::replay_count == 1 && "
        "gbastudio_advanced_tools::save_snapshot_count == 1 && "
        "gbastudio_advanced_tools::particle_count == 1 && "
        "gbastudio_advanced_tools::contract_json_size > 100",
        "advanced_tools_data_compile_test",
    )


def main():
    if len(sys.argv) != 2:
        raise SystemExit("uso: export_runtime_profile_tests.py <build-dir>")
    repo_root = Path(__file__).resolve().parents[2]
    build_dir = Path(sys.argv[1]).resolve()
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir(parents=True)
    assert_flash1m_save_export(repo_root, build_dir)
    assert_warp_runtime_signed_encoding(repo_root)
    assert_world_map_and_battle_rpg_authored_visual_contract(repo_root)
    assert_asset_bank_can_belong_to_multiple_scene_groups(repo_root, build_dir)
    assert_scene_banks_reuse_vram_ranges(repo_root, build_dir)
    assert_mixed_runtime_dispatch_export(repo_root, build_dir)
    assert_dungeon_crawler_native_export(repo_root, build_dir)
    assert_racing_native_export(repo_root, build_dir)
    assert_racing_pseudo3d_visual_asset_export(repo_root, build_dir)
    assert_battle_rpg_native_export(repo_root, build_dir)
    assert_luta_native_export(repo_root, build_dir)
    assert_luta_template_consumes_animation_states(repo_root)
    assert_topdown_template_animates_player_only_while_moving(repo_root)
    assert_topdown_template_queues_npc_on_update_scripts(repo_root)
    assert_topdown_template_queues_actor_start_scripts(repo_root)
    assert_source_asset_tilemaps_repeat_for_wider_rooms(repo_root, build_dir)
    assert_dungeon_initial_room_seeds_event_context(repo_root)

    for input_kind, canonical, block in PROFILES:
        source_dir = build_dir / canonical / "source"
        output_dir = build_dir / canonical / "exported"
        source_dir.mkdir(parents=True)
        is_point_click = canonical == "point_click"
        is_shmup = canonical == "shmup"
        is_visual_novel = canonical == "visual_novel"
        is_menu = canonical == "menu"
        is_cutscene = canonical == "cutscene"
        is_world_map = canonical == "world_map"
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
        manifest = {
            "schema": 1,
            "backend": "gbastudio_engine",
            "kind": input_kind,
            "template_dir": str(repo_root / "templates" / (native_template if is_native_runtime else "exported_topdown")),
            "entry": "main.cpp",
            "project_data": native_project_data if is_native_runtime else "gbastudio_project_data.hpp",
            "generated_assets": [],
            "build": {"target": f"{canonical}_adapter", "make_target": "all"},
            "requires": {
                "engine_pack": ">=1.43.0" if is_shmup else (">=1.44.0" if is_world_map else (">=1.59.0" if is_cutscene else (">=1.59.0" if is_menu else (">=1.45.0" if is_point_click else (">=1.59.0" if is_visual_novel else ">=1.24.0"))))),
                "features": (
                    native_features
                    if is_native_runtime
                    else [
                        "topdown_project_data",
                        "asset-export-runtime-profile-manifest",
                        f"runtime_profiles.{canonical}_topdown_adapter",
                    ]
                ),
            },
            block: (
                point_click_project()
                if is_point_click
                else (shmup_project() if is_shmup else (visual_novel_project() if is_visual_novel else (menu_project() if is_menu else (cutscene_project() if is_cutscene else (world_map_project() if is_world_map else topdown_like_project(canonical))))))
            ),
        }
        if is_shmup:
            audio_path = source_dir / "shmup_audio.json"
            audio_path.write_text(
                json.dumps(
                    {
                        "sfx": [
                            {
                                "name": "laser",
                                "tones": [
                                    {"frequency_hz": 880, "duration_frames": 4, "volume": 10}
                                ],
                            }
                        ],
                        "music": [
                            {
                                "name": "stage",
                                "loop": True,
                                "steps": [
                                    {"frequency_hz": 220, "duration_frames": 12, "volume": 7}
                                ],
                            }
                        ],
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            manifest["asset_pack"] = {
                "assets": [
                    {
                        "id": "shmup_audio",
                        "name": "shmup_audio",
                        "kind": "audio",
                        "audio_json": "shmup_audio.json",
                        "header": "shmup_audio.hpp",
                        "symbol": "shmup_audio",
                    }
                ]
            }
            manifest[block]["assets"] = {
                "sfx_assets": ["shmup_audio"],
                "music_assets": ["shmup_audio"],
                "pcm_assets": ["shmup_audio"],
            }
        elif is_native_runtime:
            audio_id = f"{canonical}_audio"
            audio_path = source_dir / f"{audio_id}.json"
            audio_path.write_text(
                json.dumps(
                    {
                        "sfx": [
                            {
                                "name": "confirm",
                                "tones": [
                                    {"frequency_hz": 660, "duration_frames": 4, "volume": 10}
                                ],
                            }
                        ],
                        "music": [
                            {
                                "name": "theme",
                                "loop": True,
                                "steps": [
                                    {"frequency_hz": 220, "duration_frames": 12, "volume": 7}
                                ],
                            }
                        ],
                    },
                    indent=2,
                )
                + "\n",
                encoding="utf-8",
            )
            manifest["asset_pack"] = {
                "assets": [
                    {
                        "id": audio_id,
                        "name": audio_id,
                        "kind": "audio",
                        "audio_json": f"{audio_id}.json",
                        "header": f"{audio_id}.hpp",
                        "symbol": audio_id,
                    }
                ]
            }
            manifest[block]["assets"] = {
                "sfx_assets": [audio_id],
                "music_assets": [audio_id],
                "pcm_assets": [audio_id],
            }
            first_script = [{"op": "play_sfx", "index": 0}, {"op": "play_music", "index": 0}, {"op": "play_pcm_sfx", "index": 0}]
            if is_point_click:
                manifest[block]["scenes"][0]["on_enter"] = first_script + manifest[block]["scenes"][0].get("on_enter", [])
            elif is_visual_novel:
                manifest[block]["scenes"][0]["on_enter"] = first_script + manifest[block]["scenes"][0].get("on_enter", [])
            elif is_menu:
                manifest[block]["screens"][0]["on_enter"] = first_script + manifest[block]["screens"][0].get("on_enter", [])
            elif is_cutscene:
                manifest[block]["scenes"][0]["on_enter"] = first_script + manifest[block]["scenes"][0].get("on_enter", [])
            elif is_world_map:
                manifest[block]["nodes"][0]["on_select"] = first_script + manifest[block]["nodes"][0].get("on_select", [])
        manifest_path = source_dir / "export_project.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        run_assetc(repo_root, manifest_path, output_dir)
        if is_point_click:
            assert_point_click_profile_output(repo_root, output_dir)
        elif is_shmup:
            assert_shmup_profile_output(repo_root, output_dir)
        elif is_visual_novel:
            assert_visual_novel_profile_output(repo_root, output_dir)
        elif is_menu:
            assert_menu_profile_output(repo_root, output_dir)
        elif is_cutscene:
            assert_cutscene_profile_output(repo_root, output_dir)
        elif is_world_map:
            assert_world_map_profile_output(repo_root, output_dir)
        else:
            assert_adapter_profile_output(output_dir, canonical, block)

    assert_ready_system_event_ops_export(repo_root, build_dir)
    assert_topdown_npc_collision_event_slots_export(repo_root, build_dir)
    assert_topdown_npc_animation_commands_export(repo_root, build_dir)
    assert_shmup_dynamic_actor_sprites_and_emotes_export(repo_root, build_dir)
    assert_topdown_player_animation_commands_export(repo_root, build_dir)
    assert_platformer_custom_player_metasprite_export(repo_root, build_dir)
    assert_platformer_layered_background_export(repo_root, build_dir)
    assert_point_click_layered_visual_schema(repo_root)
    assert_platformer_npcs_survive_wide_room_export(repo_root, build_dir)
    assert_topdown_template_consumes_projectile_event_outputs(repo_root)
    assert_topdown_template_consumes_link_event_outputs(repo_root)
    assert_shmup_affine_scene_fixture_export(repo_root, build_dir)
    assert_shmup_affine_background_export(repo_root, build_dir)
    assert_native_templates_consume_visual_effect_outputs(repo_root)
    assert_all_exported_runtimes_forward_scene_transition_compositor(repo_root)
    assert_isometric_template_switches_directional_animations(repo_root)
    assert_isometric_template_honors_stationary_actors(repo_root)
    assert_isometric_template_reserves_multi_asset_pilot_resources(repo_root)
    assert_isometric_authored_background_does_not_prefetch_other_scene_banks_during_play(repo_root)
    assert_isometric_template_supports_full_save_actor_capacity(repo_root)
    assert_isometric_template_updates_surfaces_inside_vblank(repo_root)
    assert_isometric_template_restores_backdrop_after_palette_upload(repo_root)
    assert_topdown_template_hides_world_sprites_during_pause_menu(repo_root)
    assert_topdown_template_exposes_native_runtime_telemetry(repo_root)
    assert_topdown_template_persists_text_variables(repo_root)
    assert_native_runtimes_use_one_central_frame_input_snapshot(repo_root)
    assert_menu_runtime_progresses_event_scripts_across_frames(repo_root)
    assert_menu_actor_event_scripts_are_emitted(repo_root)
    assert_menu_runtime_loads_only_the_active_screen_background(repo_root)
    assert_cutscene_runtime_loads_only_the_active_background(repo_root)
    assert_cutscene_runtime_publishes_scene_telemetry(repo_root)
    assert_native_mixed_runtimes_publish_shared_telemetry(repo_root)
    assert_advanced_native_runtimes_consume_full_audio_contract(repo_root)
    assert_player_event_commands_reach_mixed_runtimes(repo_root)
    assert_topdown_template_exposes_hierarchical_start_menu(repo_root)
    assert_save_menu_visual_builder_export(repo_root, build_dir)
    assert_advanced_video_composition_export(repo_root, build_dir)
    assert_topdown_template_keeps_ui_on_bg0_and_room_on_bg1(repo_root)
    assert_topdown_streaming_accepts_large_resource_bank_groups(repo_root)
    assert_topdown_template_switches_directional_animations(repo_root)
    assert_topdown_visual_tiles_can_follow_asset_tilemap(repo_root, build_dir)
    assert_incremental_export_regenerates_headers_after_contract_revision(repo_root, build_dir)
    assert_topdown_player_animation_frame_subsets_export(repo_root, build_dir)
    assert_topdown_custom_metasprite_animation_export(repo_root, build_dir)
    assert_platformer_isometric_audio_dialogue_exports(repo_root, build_dir)
    assert_dialogue_ui_config_export(repo_root, build_dir)
    assert_dialogue_box_skin_export(repo_root, build_dir)
    assert_shared_hud_skin_falls_back_to_dialogue_box(repo_root, build_dir)
    assert_dialogue_font_export(repo_root, build_dir)
    assert_dialogue_choice_selector_export(repo_root, build_dir)
    assert_dialogue_box_skin_rejects_wrong_size(repo_root, build_dir)
    assert_custom_dialogue_skin_keeps_text_box_interior_opaque(repo_root)
    assert_dialogue_portrait_assets_export(repo_root, build_dir)
    assert_dialogue_emote_assets_export(repo_root, build_dir)
    assert_advanced_tools_data_export(repo_root, build_dir)
    assert_dialogue_lines_emit_confirm_sound_metadata(repo_root, build_dir)
    assert_enginepack_declares_ready_event_capabilities(repo_root)
    assert_point_click_template_supports_layers_and_props(repo_root)
    assert_enginepack_declares_link_runtime_capabilities(repo_root)
    assert_enginepack_declares_visual_effect_runtime_capabilities(repo_root)
    assert_enginepack_declares_shmup_composition_capabilities(repo_root)
    assert_enginepack_declares_luta_runtime_contract(repo_root)
    assert_luta_draw_does_not_overwrite_stage_backdrop(repo_root)
    assert_luta_stage_enables_background_layer(repo_root)
    assert_luta_stage_palette_survives_ui_configuration(repo_root)
    assert_luta_cpu_allows_initial_reaction(repo_root)
    assert_battle_notice_back_preserves_enemy_turn(repo_root)
    assert_battle_hud_exposes_compact_enemy_hp(repo_root)
    assert_dungeon_streamed_resources_are_not_overwritten(repo_root)
    assert_shmup_streamed_resources_are_not_overwritten(repo_root)
    assert_enginepack_declares_topdown_racing_contract(repo_root)
    assert_export_project_schema_declares_ready_event_ops(repo_root)


if __name__ == "__main__":
    main()
