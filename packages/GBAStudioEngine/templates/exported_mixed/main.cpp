#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/dma.hpp"
#include "gbs/event.hpp"
#include "gbs/runtime.hpp"
#include "mixed_project_data.hpp"

#if GBS_MIXED_HAS_TOPDOWN
extern "C" int gbs_run_topdown();
extern "C" void gbs_enter_topdown(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_topdown(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_topdown(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_topdown(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_PLATFORMER
extern "C" int gbs_run_platformer();
extern "C" void gbs_enter_platformer(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_platformer(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_platformer(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_platformer(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_ISOMETRIC
extern "C" int gbs_run_isometric();
extern "C" void gbs_enter_isometric(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_isometric(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_isometric(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_isometric(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_MENU
extern "C" int gbs_run_menu();
extern "C" void gbs_enter_menu(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_menu(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_menu(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_menu(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_SHMUP
extern "C" int gbs_run_shmup();
extern "C" void gbs_enter_shmup(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_shmup(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_shmup(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_shmup(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_POINT_CLICK
extern "C" int gbs_run_point_click();
extern "C" void gbs_enter_point_click(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_point_click(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_point_click(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_point_click(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_DUNGEON_CRAWLER
extern "C" int gbs_run_dungeon_crawler();
extern "C" void gbs_enter_dungeon_crawler(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_dungeon_crawler(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_dungeon_crawler(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_dungeon_crawler(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_RACING
extern "C" int gbs_run_racing();
extern "C" void gbs_enter_racing(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_racing(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_racing(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_racing(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_CUTSCENE
extern "C" int gbs_run_cutscene();
extern "C" void gbs_enter_cutscene(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_cutscene(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_cutscene(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_cutscene(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_VISUAL_NOVEL
extern "C" int gbs_run_visual_novel();
extern "C" void gbs_enter_visual_novel(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_visual_novel(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_visual_novel(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_visual_novel(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_WORLD_MAP
extern "C" int gbs_run_world_map();
extern "C" void gbs_enter_world_map(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_world_map(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_world_map(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_world_map(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_BATTLE_RPG
extern "C" int gbs_run_battle_rpg();
extern "C" void gbs_enter_battle_rpg(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_battle_rpg(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_battle_rpg(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_battle_rpg(const gbs::RuntimeAdapter& adapter);
#endif
#if GBS_MIXED_HAS_LUTA
extern "C" int gbs_run_luta();
extern "C" void gbs_enter_luta(const gbs::RuntimeAdapter& adapter);
extern "C" gbs::RuntimeAdapterFrameResult gbs_update_luta(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_render_luta(const gbs::RuntimeFrameContext& context);
extern "C" void gbs_leave_luta(const gbs::RuntimeAdapter& adapter);
#endif

extern "C" uint32_t __ewram_runtime_start;
extern "C" uint32_t __ewram_runtime_end;

using RuntimeInitializer = void (*)();

extern "C" RuntimeInitializer __init_array_runtime_menu_start[];
extern "C" RuntimeInitializer __init_array_runtime_menu_end[];
extern "C" RuntimeInitializer __init_array_runtime_topdown_start[];
extern "C" RuntimeInitializer __init_array_runtime_topdown_end[];
extern "C" RuntimeInitializer __init_array_runtime_platformer_start[];
extern "C" RuntimeInitializer __init_array_runtime_platformer_end[];
extern "C" RuntimeInitializer __init_array_runtime_isometric_start[];
extern "C" RuntimeInitializer __init_array_runtime_isometric_end[];
extern "C" RuntimeInitializer __init_array_runtime_shmup_start[];
extern "C" RuntimeInitializer __init_array_runtime_shmup_end[];
extern "C" RuntimeInitializer __init_array_runtime_point_click_start[];
extern "C" RuntimeInitializer __init_array_runtime_point_click_end[];
extern "C" RuntimeInitializer __init_array_runtime_dungeon_crawler_start[];
extern "C" RuntimeInitializer __init_array_runtime_dungeon_crawler_end[];
extern "C" RuntimeInitializer __init_array_runtime_racing_start[];
extern "C" RuntimeInitializer __init_array_runtime_racing_end[];
extern "C" RuntimeInitializer __init_array_runtime_cutscene_start[];
extern "C" RuntimeInitializer __init_array_runtime_cutscene_end[];
extern "C" RuntimeInitializer __init_array_runtime_visual_novel_start[];
extern "C" RuntimeInitializer __init_array_runtime_visual_novel_end[];
extern "C" RuntimeInitializer __init_array_runtime_world_map_start[];
extern "C" RuntimeInitializer __init_array_runtime_world_map_end[];
extern "C" RuntimeInitializer __init_array_runtime_battle_rpg_start[];
extern "C" RuntimeInitializer __init_array_runtime_battle_rpg_end[];
extern "C" RuntimeInitializer __init_array_runtime_luta_start[];
extern "C" RuntimeInitializer __init_array_runtime_luta_end[];

namespace {

void clear_runtime_overlay() {
    volatile uint32_t* cursor = &__ewram_runtime_start;
    volatile uint32_t* const end = &__ewram_runtime_end;
    while (cursor != end) {
        *cursor++ = 0;
    }
}

void run_runtime_initializers(RuntimeInitializer* start, RuntimeInitializer* end) {
    while (start != end) {
        (*start++)();
    }
}

void initialize_runtime_overlay(
    const gbs::RuntimeAdapter& adapter,
    RuntimeInitializer* start,
    RuntimeInitializer* end
) {
    gbs::debug_set_runtime_kind(static_cast<int32_t>(adapter.runtime));
    clear_runtime_overlay();
    run_runtime_initializers(start, end);
}

#if GBS_MIXED_HAS_TOPDOWN
void initialize_runtime_adapter_topdown(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_topdown_start, __init_array_runtime_topdown_end);
}
#endif
#if GBS_MIXED_HAS_PLATFORMER
void initialize_runtime_adapter_platformer(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_platformer_start, __init_array_runtime_platformer_end);
}
#endif
#if GBS_MIXED_HAS_ISOMETRIC
void initialize_runtime_adapter_isometric(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_isometric_start, __init_array_runtime_isometric_end);
}
#endif
#if GBS_MIXED_HAS_MENU
void initialize_runtime_adapter_menu(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_menu_start, __init_array_runtime_menu_end);
}
#endif
#if GBS_MIXED_HAS_SHMUP
void initialize_runtime_adapter_shmup(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_shmup_start, __init_array_runtime_shmup_end);
}
#endif
#if GBS_MIXED_HAS_POINT_CLICK
void initialize_runtime_adapter_point_click(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_point_click_start, __init_array_runtime_point_click_end);
}
#endif
#if GBS_MIXED_HAS_DUNGEON_CRAWLER
void initialize_runtime_adapter_dungeon_crawler(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_dungeon_crawler_start, __init_array_runtime_dungeon_crawler_end);
}
#endif
#if GBS_MIXED_HAS_RACING
void initialize_runtime_adapter_racing(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_racing_start, __init_array_runtime_racing_end);
}
#endif
#if GBS_MIXED_HAS_CUTSCENE
void initialize_runtime_adapter_cutscene(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_cutscene_start, __init_array_runtime_cutscene_end);
}
#endif
#if GBS_MIXED_HAS_VISUAL_NOVEL
void initialize_runtime_adapter_visual_novel(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_visual_novel_start, __init_array_runtime_visual_novel_end);
}
#endif
#if GBS_MIXED_HAS_WORLD_MAP
void initialize_runtime_adapter_world_map(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_world_map_start, __init_array_runtime_world_map_end);
}
#endif
#if GBS_MIXED_HAS_BATTLE_RPG
void initialize_runtime_adapter_battle_rpg(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_battle_rpg_start, __init_array_runtime_battle_rpg_end);
}
#endif
#if GBS_MIXED_HAS_LUTA
void initialize_runtime_adapter_luta(const gbs::RuntimeAdapter& adapter) {
    initialize_runtime_overlay(adapter, __init_array_runtime_luta_start, __init_array_runtime_luta_end);
}
#endif

const gbs::RuntimeAdapter runtime_adapters[] = {
#if GBS_MIXED_HAS_TOPDOWN
    {
        gbs::RuntimeKind::TopDown,
        initialize_runtime_adapter_topdown,
        gbs_run_topdown,
        gbs_enter_topdown,
        gbs_update_topdown,
        gbs_render_topdown,
        gbs_leave_topdown
    },
#endif
#if GBS_MIXED_HAS_PLATFORMER
    {
        gbs::RuntimeKind::Platformer,
        initialize_runtime_adapter_platformer,
        gbs_run_platformer,
        gbs_enter_platformer,
        gbs_update_platformer,
        gbs_render_platformer,
        gbs_leave_platformer
    },
#endif
#if GBS_MIXED_HAS_ISOMETRIC
    {
        gbs::RuntimeKind::Isometric,
        initialize_runtime_adapter_isometric,
        gbs_run_isometric,
        gbs_enter_isometric,
        gbs_update_isometric,
        gbs_render_isometric,
        gbs_leave_isometric
    },
#endif
#if GBS_MIXED_HAS_MENU
    {
        gbs::RuntimeKind::Menu,
        initialize_runtime_adapter_menu,
        gbs_run_menu,
        gbs_enter_menu,
        gbs_update_menu,
        gbs_render_menu,
        gbs_leave_menu
    },
#endif
#if GBS_MIXED_HAS_SHMUP
    {
        gbs::RuntimeKind::Shmup,
        initialize_runtime_adapter_shmup,
        gbs_run_shmup,
        gbs_enter_shmup,
        gbs_update_shmup,
        gbs_render_shmup,
        gbs_leave_shmup
    },
#endif
#if GBS_MIXED_HAS_POINT_CLICK
    {
        gbs::RuntimeKind::PointClick,
        initialize_runtime_adapter_point_click,
        gbs_run_point_click,
        gbs_enter_point_click,
        gbs_update_point_click,
        gbs_render_point_click,
        gbs_leave_point_click
    },
#endif
#if GBS_MIXED_HAS_DUNGEON_CRAWLER
    {
        gbs::RuntimeKind::DungeonCrawler,
        initialize_runtime_adapter_dungeon_crawler,
        gbs_run_dungeon_crawler,
        gbs_enter_dungeon_crawler,
        gbs_update_dungeon_crawler,
        gbs_render_dungeon_crawler,
        gbs_leave_dungeon_crawler
    },
#endif
#if GBS_MIXED_HAS_RACING
    {
        gbs::RuntimeKind::Racing,
        initialize_runtime_adapter_racing,
        gbs_run_racing,
        gbs_enter_racing,
        gbs_update_racing,
        gbs_render_racing,
        gbs_leave_racing
    },
#endif
#if GBS_MIXED_HAS_CUTSCENE
    {
        gbs::RuntimeKind::Cutscene,
        initialize_runtime_adapter_cutscene,
        gbs_run_cutscene,
        gbs_enter_cutscene,
        gbs_update_cutscene,
        gbs_render_cutscene,
        gbs_leave_cutscene
    },
#endif
#if GBS_MIXED_HAS_VISUAL_NOVEL
    {
        gbs::RuntimeKind::VisualNovel,
        initialize_runtime_adapter_visual_novel,
        gbs_run_visual_novel,
        gbs_enter_visual_novel,
        gbs_update_visual_novel,
        gbs_render_visual_novel,
        gbs_leave_visual_novel
    },
#endif
#if GBS_MIXED_HAS_WORLD_MAP
    {
        gbs::RuntimeKind::WorldMap,
        initialize_runtime_adapter_world_map,
        gbs_run_world_map,
        gbs_enter_world_map,
        gbs_update_world_map,
        gbs_render_world_map,
        gbs_leave_world_map
    },
#endif
#if GBS_MIXED_HAS_BATTLE_RPG
    {
        gbs::RuntimeKind::BattleRpg,
        initialize_runtime_adapter_battle_rpg,
        gbs_run_battle_rpg,
        gbs_enter_battle_rpg,
        gbs_update_battle_rpg,
        gbs_render_battle_rpg,
        gbs_leave_battle_rpg
    },
#endif
#if GBS_MIXED_HAS_LUTA
    {
        gbs::RuntimeKind::Luta,
        initialize_runtime_adapter_luta,
        gbs_run_luta,
        gbs_enter_luta,
        gbs_update_luta,
        gbs_render_luta,
        gbs_leave_luta
    },
#endif
};

bool mixed_runtime_transition_pending() {
    return gbs::runtime_transition_pending();
}

bool mixed_runtime_transition_route(gbs::RuntimeTransitionRoute& route) {
    return gbs::runtime_transition_route(route);
}

void mixed_runtime_on_transition() {
    gbs::dma_reset_vblank_queue();
    gbs::begin_runtime_handoff();
}

} // namespace

extern "C" int gbs_main() {
    if (!gbs::is_valid_runtime_scene_registry(gbastudio_mixed_project::runtime_registry) ||
        gbastudio_mixed_project::runtime_registry.scenes[gbastudio_mixed_project::runtime_registry.initial_scene].runtime != gbastudio_mixed_project::initial_runtime) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    const gbs::RuntimeSceneDescriptor& initial_scene = gbastudio_mixed_project::runtime_registry.scenes[
        gbastudio_mixed_project::runtime_registry.initial_scene
    ];
    gbs::RtcProvider runtime_rtc_provider = gbs::gba_rtc_provider();
    gbs::RuntimeServices runtime_services {
        nullptr,
        nullptr,
        &gbastudio_mixed_project::runtime_save_service,
        nullptr,
        nullptr,
        nullptr,
        &runtime_rtc_provider,
        &gbastudio_mixed_project::runtime_link_service
    };
    gbs::ProjectRuntime project_runtime {
        &gbastudio_mixed_project::runtime_registry,
        runtime_adapters,
        sizeof(runtime_adapters) / sizeof(runtime_adapters[0]),
        {
            mixed_runtime_transition_pending,
            mixed_runtime_transition_route,
            mixed_runtime_on_transition
        },
        &runtime_services,
        initial_scene.runtime,
        gbastudio_mixed_project::runtime_registry.initial_scene,
        &gbastudio_mixed_project::runtime_capability_manifest
    };

    if (gbs::run_project_runtime(project_runtime) != 0) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    return 0;
}
