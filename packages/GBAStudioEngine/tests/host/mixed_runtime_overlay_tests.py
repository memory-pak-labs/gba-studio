#!/usr/bin/env python3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
LINKER_SCRIPT = ROOT / "engine" / "startup" / "gba.ld"
MIXED_RUNTIME = ROOT / "templates" / "exported_mixed" / "main.cpp"
PLATFORMER_RUNTIME = ROOT / "templates" / "exported_mixed" / "platformer_runtime.cpp"
ISOMETRIC_RUNTIME = ROOT / "templates" / "exported_mixed" / "isometric_runtime.cpp"
WORLD_MAP_RUNTIME = ROOT / "templates" / "exported_mixed" / "world_map_runtime.cpp"
VISUAL_NOVEL_RUNTIME = ROOT / "templates" / "exported_mixed" / "visual_novel_runtime.cpp"
CUTSCENE_RUNTIME = ROOT / "templates" / "exported_mixed" / "cutscene_runtime.cpp"
LUTA_RUNTIME = ROOT / "templates" / "exported_mixed" / "luta_runtime.cpp"
POINT_CLICK_RUNTIME = ROOT / "templates" / "exported_mixed" / "point_click_runtime.cpp"
RACING_RUNTIME = ROOT / "templates" / "exported_mixed" / "racing_runtime.cpp"
BATTLE_RPG_RUNTIME = ROOT / "templates" / "exported_mixed" / "battle_rpg_runtime.cpp"
DUNGEON_CRAWLER_RUNTIME = ROOT / "templates" / "exported_mixed" / "dungeon_crawler_runtime.cpp"
SHMUP_RUNTIME = ROOT / "templates" / "exported_mixed" / "shmup_runtime.cpp"
MENU_RUNTIME = ROOT / "templates" / "exported_mixed" / "menu_runtime.cpp"

RUNTIMES = (
    "menu",
    "topdown",
    "platformer",
    "isometric",
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


def main() -> None:
    linker = LINKER_SCRIPT.read_text(encoding="utf-8")
    mixed_runtime = MIXED_RUNTIME.read_text(encoding="utf-8")
    platformer_runtime = PLATFORMER_RUNTIME.read_text(encoding="utf-8")
    isometric_runtime = ISOMETRIC_RUNTIME.read_text(encoding="utf-8")
    world_map_runtime = WORLD_MAP_RUNTIME.read_text(encoding="utf-8")
    visual_novel_runtime = VISUAL_NOVEL_RUNTIME.read_text(encoding="utf-8")
    cutscene_runtime = CUTSCENE_RUNTIME.read_text(encoding="utf-8")
    luta_runtime = LUTA_RUNTIME.read_text(encoding="utf-8")
    point_click_runtime = POINT_CLICK_RUNTIME.read_text(encoding="utf-8")
    racing_runtime = RACING_RUNTIME.read_text(encoding="utf-8")
    battle_rpg_runtime = BATTLE_RPG_RUNTIME.read_text(encoding="utf-8")
    dungeon_crawler_runtime = DUNGEON_CRAWLER_RUNTIME.read_text(encoding="utf-8")
    shmup_runtime = SHMUP_RUNTIME.read_text(encoding="utf-8")
    menu_runtime = MENU_RUNTIME.read_text(encoding="utf-8")

    assert "EXCLUDE_FILE (" in linker
    assert ") .init_array*)" in linker
    assert "void initialize_runtime_overlay(" in mixed_runtime
    assert "clear_runtime_overlay();" in mixed_runtime
    assert "const gbs::RuntimeAdapter runtime_adapters[]" in mixed_runtime
    assert "gbs::begin_runtime_handoff();" in mixed_runtime
    assert "extern \"C\" void gbs_enter_topdown" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_topdown" in mixed_runtime
    assert "extern \"C\" void gbs_render_topdown" in mixed_runtime
    assert "extern \"C\" void gbs_leave_topdown" in mixed_runtime
    assert "gbs_enter_topdown," in mixed_runtime
    assert "gbs_update_topdown," in mixed_runtime
    assert "gbs_render_topdown," in mixed_runtime
    assert "gbs_leave_topdown" in mixed_runtime
    assert "extern \"C\" void gbs_enter_platformer" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_platformer" in mixed_runtime
    assert "extern \"C\" void gbs_render_platformer" in mixed_runtime
    assert "extern \"C\" void gbs_leave_platformer" in mixed_runtime
    assert "gbs_enter_platformer," in mixed_runtime
    assert "gbs_update_platformer," in mixed_runtime
    assert "gbs_render_platformer," in mixed_runtime
    assert "gbs_leave_platformer" in mixed_runtime
    assert """        gbs::RuntimeKind::Platformer,
        initialize_runtime_adapter_platformer,
        gbs_run_platformer,
        gbs_enter_platformer,
        gbs_update_platformer,
        gbs_render_platformer,
        gbs_leave_platformer
""" in mixed_runtime
    assert "#define GBS_PLATFORMER_RUNTIME_ENTER gbs_enter_platformer" in platformer_runtime
    assert "#define GBS_PLATFORMER_RUNTIME_UPDATE gbs_update_platformer" in platformer_runtime
    assert "#define GBS_PLATFORMER_RUNTIME_RENDER gbs_render_platformer" in platformer_runtime
    assert "#define GBS_PLATFORMER_RUNTIME_LEAVE gbs_leave_platformer" in platformer_runtime
    assert "#define GBS_ISOMETRIC_RUNTIME_ENTER gbs_enter_isometric" in isometric_runtime
    assert "#define GBS_ISOMETRIC_RUNTIME_UPDATE gbs_update_isometric" in isometric_runtime
    assert "#define GBS_ISOMETRIC_RUNTIME_RENDER gbs_render_isometric" in isometric_runtime
    assert "#define GBS_ISOMETRIC_RUNTIME_LEAVE gbs_leave_isometric" in isometric_runtime
    assert "extern \"C\" void gbs_enter_isometric" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_isometric" in mixed_runtime
    assert "extern \"C\" void gbs_render_isometric" in mixed_runtime
    assert "extern \"C\" void gbs_leave_isometric" in mixed_runtime
    assert "gbs_enter_isometric," in mixed_runtime
    assert "gbs_update_isometric," in mixed_runtime
    assert "gbs_render_isometric," in mixed_runtime
    assert "gbs_leave_isometric" in mixed_runtime
    assert """        gbs::RuntimeKind::Isometric,
        initialize_runtime_adapter_isometric,
        gbs_run_isometric,
        gbs_enter_isometric,
        gbs_update_isometric,
        gbs_render_isometric,
        gbs_leave_isometric
""" in mixed_runtime
    assert "extern \"C\" void gbs_enter_world_map" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_world_map" in mixed_runtime
    assert "extern \"C\" void gbs_render_world_map" in mixed_runtime
    assert "extern \"C\" void gbs_leave_world_map" in mixed_runtime
    assert "gbs_enter_world_map," in mixed_runtime
    assert "gbs_update_world_map," in mixed_runtime
    assert "gbs_render_world_map," in mixed_runtime
    assert "gbs_leave_world_map" in mixed_runtime
    assert """        gbs::RuntimeKind::WorldMap,
        initialize_runtime_adapter_world_map,
        gbs_run_world_map,
        gbs_enter_world_map,
        gbs_update_world_map,
        gbs_render_world_map,
        gbs_leave_world_map
""" in mixed_runtime
    assert "#define GBS_WORLD_MAP_RUNTIME_ENTER gbs_enter_world_map" in world_map_runtime
    assert "#define GBS_WORLD_MAP_RUNTIME_UPDATE gbs_update_world_map" in world_map_runtime
    assert "#define GBS_WORLD_MAP_RUNTIME_RENDER gbs_render_world_map" in world_map_runtime
    assert "#define GBS_WORLD_MAP_RUNTIME_LEAVE gbs_leave_world_map" in world_map_runtime
    assert "extern \"C\" void gbs_enter_visual_novel" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_visual_novel" in mixed_runtime
    assert "extern \"C\" void gbs_render_visual_novel" in mixed_runtime
    assert "extern \"C\" void gbs_leave_visual_novel" in mixed_runtime
    assert "gbs_enter_visual_novel," in mixed_runtime
    assert "gbs_update_visual_novel," in mixed_runtime
    assert "gbs_render_visual_novel," in mixed_runtime
    assert "gbs_leave_visual_novel" in mixed_runtime
    assert """        gbs::RuntimeKind::VisualNovel,
        initialize_runtime_adapter_visual_novel,
        gbs_run_visual_novel,
        gbs_enter_visual_novel,
        gbs_update_visual_novel,
        gbs_render_visual_novel,
        gbs_leave_visual_novel
""" in mixed_runtime
    assert "#define GBS_VISUAL_NOVEL_RUNTIME_ENTER gbs_enter_visual_novel" in visual_novel_runtime
    assert "#define GBS_VISUAL_NOVEL_RUNTIME_UPDATE gbs_update_visual_novel" in visual_novel_runtime
    assert "#define GBS_VISUAL_NOVEL_RUNTIME_RENDER gbs_render_visual_novel" in visual_novel_runtime
    assert "#define GBS_VISUAL_NOVEL_RUNTIME_LEAVE gbs_leave_visual_novel" in visual_novel_runtime
    assert "extern \"C\" void gbs_enter_cutscene" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_cutscene" in mixed_runtime
    assert "extern \"C\" void gbs_render_cutscene" in mixed_runtime
    assert "extern \"C\" void gbs_leave_cutscene" in mixed_runtime
    assert "gbs_enter_cutscene," in mixed_runtime
    assert "gbs_update_cutscene," in mixed_runtime
    assert "gbs_render_cutscene," in mixed_runtime
    assert "gbs_leave_cutscene" in mixed_runtime
    assert """        gbs::RuntimeKind::Cutscene,
        initialize_runtime_adapter_cutscene,
        gbs_run_cutscene,
        gbs_enter_cutscene,
        gbs_update_cutscene,
        gbs_render_cutscene,
        gbs_leave_cutscene
""" in mixed_runtime
    assert "#define GBS_CUTSCENE_RUNTIME_ENTER gbs_enter_cutscene" in cutscene_runtime
    assert "#define GBS_CUTSCENE_RUNTIME_UPDATE gbs_update_cutscene" in cutscene_runtime
    assert "#define GBS_CUTSCENE_RUNTIME_RENDER gbs_render_cutscene" in cutscene_runtime
    assert "#define GBS_CUTSCENE_RUNTIME_LEAVE gbs_leave_cutscene" in cutscene_runtime
    assert "extern \"C\" void gbs_enter_luta" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_luta" in mixed_runtime
    assert "extern \"C\" void gbs_render_luta" in mixed_runtime
    assert "extern \"C\" void gbs_leave_luta" in mixed_runtime
    assert "gbs_enter_luta," in mixed_runtime
    assert "gbs_update_luta," in mixed_runtime
    assert "gbs_render_luta," in mixed_runtime
    assert "gbs_leave_luta" in mixed_runtime
    assert """        gbs::RuntimeKind::Luta,
        initialize_runtime_adapter_luta,
        gbs_run_luta,
        gbs_enter_luta,
        gbs_update_luta,
        gbs_render_luta,
        gbs_leave_luta
""" in mixed_runtime
    assert "#define GBS_LUTA_RUNTIME_ENTER gbs_enter_luta" in luta_runtime
    assert "#define GBS_LUTA_RUNTIME_UPDATE gbs_update_luta" in luta_runtime
    assert "#define GBS_LUTA_RUNTIME_RENDER gbs_render_luta" in luta_runtime
    assert "#define GBS_LUTA_RUNTIME_LEAVE gbs_leave_luta" in luta_runtime
    assert "extern \"C\" void gbs_enter_point_click" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_point_click" in mixed_runtime
    assert "extern \"C\" void gbs_render_point_click" in mixed_runtime
    assert "extern \"C\" void gbs_leave_point_click" in mixed_runtime
    assert "gbs_enter_point_click," in mixed_runtime
    assert "gbs_update_point_click," in mixed_runtime
    assert "gbs_render_point_click," in mixed_runtime
    assert "gbs_leave_point_click" in mixed_runtime
    assert """        gbs::RuntimeKind::PointClick,
        initialize_runtime_adapter_point_click,
        gbs_run_point_click,
        gbs_enter_point_click,
        gbs_update_point_click,
        gbs_render_point_click,
        gbs_leave_point_click
""" in mixed_runtime
    assert "#define GBS_POINT_CLICK_RUNTIME_ENTER gbs_enter_point_click" in point_click_runtime
    assert "#define GBS_POINT_CLICK_RUNTIME_UPDATE gbs_update_point_click" in point_click_runtime
    assert "#define GBS_POINT_CLICK_RUNTIME_RENDER gbs_render_point_click" in point_click_runtime
    assert "#define GBS_POINT_CLICK_RUNTIME_LEAVE gbs_leave_point_click" in point_click_runtime
    assert "extern \"C\" void gbs_enter_racing" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_racing" in mixed_runtime
    assert "extern \"C\" void gbs_render_racing" in mixed_runtime
    assert "extern \"C\" void gbs_leave_racing" in mixed_runtime
    assert "gbs_enter_racing," in mixed_runtime
    assert "gbs_update_racing," in mixed_runtime
    assert "gbs_render_racing," in mixed_runtime
    assert "gbs_leave_racing" in mixed_runtime
    assert """        gbs::RuntimeKind::Racing,
        initialize_runtime_adapter_racing,
        gbs_run_racing,
        gbs_enter_racing,
        gbs_update_racing,
        gbs_render_racing,
        gbs_leave_racing
""" in mixed_runtime
    assert "#define GBS_RACING_RUNTIME_ENTER gbs_enter_racing" in racing_runtime
    assert "#define GBS_RACING_RUNTIME_UPDATE gbs_update_racing" in racing_runtime
    assert "#define GBS_RACING_RUNTIME_RENDER gbs_render_racing" in racing_runtime
    assert "#define GBS_RACING_RUNTIME_LEAVE gbs_leave_racing" in racing_runtime
    assert "extern \"C\" void gbs_enter_battle_rpg" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_battle_rpg" in mixed_runtime
    assert "extern \"C\" void gbs_render_battle_rpg" in mixed_runtime
    assert "extern \"C\" void gbs_leave_battle_rpg" in mixed_runtime
    assert "gbs_enter_battle_rpg," in mixed_runtime
    assert "gbs_update_battle_rpg," in mixed_runtime
    assert "gbs_render_battle_rpg," in mixed_runtime
    assert "gbs_leave_battle_rpg" in mixed_runtime
    assert """        gbs::RuntimeKind::BattleRpg,
        initialize_runtime_adapter_battle_rpg,
        gbs_run_battle_rpg,
        gbs_enter_battle_rpg,
        gbs_update_battle_rpg,
        gbs_render_battle_rpg,
        gbs_leave_battle_rpg
""" in mixed_runtime
    assert "#define GBS_BATTLE_RPG_RUNTIME_ENTER gbs_enter_battle_rpg" in battle_rpg_runtime
    assert "#define GBS_BATTLE_RPG_RUNTIME_UPDATE gbs_update_battle_rpg" in battle_rpg_runtime
    assert "#define GBS_BATTLE_RPG_RUNTIME_RENDER gbs_render_battle_rpg" in battle_rpg_runtime
    assert "#define GBS_BATTLE_RPG_RUNTIME_LEAVE gbs_leave_battle_rpg" in battle_rpg_runtime
    assert "extern \"C\" void gbs_enter_dungeon_crawler" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_dungeon_crawler" in mixed_runtime
    assert "extern \"C\" void gbs_render_dungeon_crawler" in mixed_runtime
    assert "extern \"C\" void gbs_leave_dungeon_crawler" in mixed_runtime
    assert "gbs_enter_dungeon_crawler," in mixed_runtime
    assert "gbs_update_dungeon_crawler," in mixed_runtime
    assert "gbs_render_dungeon_crawler," in mixed_runtime
    assert "gbs_leave_dungeon_crawler" in mixed_runtime
    assert """        gbs::RuntimeKind::DungeonCrawler,
        initialize_runtime_adapter_dungeon_crawler,
        gbs_run_dungeon_crawler,
        gbs_enter_dungeon_crawler,
        gbs_update_dungeon_crawler,
        gbs_render_dungeon_crawler,
        gbs_leave_dungeon_crawler
""" in mixed_runtime
    assert "#define GBS_DUNGEON_CRAWLER_RUNTIME_ENTER gbs_enter_dungeon_crawler" in dungeon_crawler_runtime
    assert "#define GBS_DUNGEON_CRAWLER_RUNTIME_UPDATE gbs_update_dungeon_crawler" in dungeon_crawler_runtime
    assert "#define GBS_DUNGEON_CRAWLER_RUNTIME_RENDER gbs_render_dungeon_crawler" in dungeon_crawler_runtime
    assert "#define GBS_DUNGEON_CRAWLER_RUNTIME_LEAVE gbs_leave_dungeon_crawler" in dungeon_crawler_runtime
    assert "extern \"C\" void gbs_enter_shmup" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_shmup" in mixed_runtime
    assert "extern \"C\" void gbs_render_shmup" in mixed_runtime
    assert "extern \"C\" void gbs_leave_shmup" in mixed_runtime
    assert "gbs_enter_shmup," in mixed_runtime
    assert "gbs_update_shmup," in mixed_runtime
    assert "gbs_render_shmup," in mixed_runtime
    assert "gbs_leave_shmup" in mixed_runtime
    assert """        gbs::RuntimeKind::Shmup,
        initialize_runtime_adapter_shmup,
        gbs_run_shmup,
        gbs_enter_shmup,
        gbs_update_shmup,
        gbs_render_shmup,
        gbs_leave_shmup
""" in mixed_runtime
    assert "#define GBS_SHMUP_RUNTIME_ENTER gbs_enter_shmup" in shmup_runtime
    assert "#define GBS_SHMUP_RUNTIME_UPDATE gbs_update_shmup" in shmup_runtime
    assert "#define GBS_SHMUP_RUNTIME_RENDER gbs_render_shmup" in shmup_runtime
    assert "#define GBS_SHMUP_RUNTIME_LEAVE gbs_leave_shmup" in shmup_runtime
    assert "extern \"C\" void gbs_enter_menu" in mixed_runtime
    assert "extern \"C\" gbs::RuntimeAdapterFrameResult gbs_update_menu" in mixed_runtime
    assert "extern \"C\" void gbs_render_menu" in mixed_runtime
    assert "extern \"C\" void gbs_leave_menu" in mixed_runtime
    assert "gbs_enter_menu," in mixed_runtime
    assert "gbs_update_menu," in mixed_runtime
    assert "gbs_render_menu," in mixed_runtime
    assert "gbs_leave_menu" in mixed_runtime
    assert """        gbs::RuntimeKind::Menu,
        initialize_runtime_adapter_menu,
        gbs_run_menu,
        gbs_enter_menu,
        gbs_update_menu,
        gbs_render_menu,
        gbs_leave_menu
""" in mixed_runtime
    assert "#define GBS_MENU_RUNTIME_ENTER gbs_enter_menu" in menu_runtime
    assert "#define GBS_MENU_RUNTIME_UPDATE gbs_update_menu" in menu_runtime
    assert "#define GBS_MENU_RUNTIME_RENDER gbs_render_menu" in menu_runtime
    assert "#define GBS_MENU_RUNTIME_LEAVE gbs_leave_menu" in menu_runtime
    assert "gbs::run_project_runtime(project_runtime)" in mixed_runtime
    assert "case gbs::RuntimeKind::PointClick:" not in mixed_runtime

    for runtime in RUNTIMES:
        section = f".init_array_runtime_{runtime}"
        start = f"__init_array_runtime_{runtime}_start"
        end = f"__init_array_runtime_{runtime}_end"

        assert f"*{runtime}_runtime.o" in linker
        assert section in linker
        assert start in linker
        assert end in linker
        assert start in mixed_runtime
        assert end in mixed_runtime
        assert f"initialize_runtime_overlay(adapter, {start}, {end});" in mixed_runtime
        assert f"*{runtime}_runtime.o(.bss*)" in linker

    assert ") .bss*)" in linker


if __name__ == "__main__":
    main()
