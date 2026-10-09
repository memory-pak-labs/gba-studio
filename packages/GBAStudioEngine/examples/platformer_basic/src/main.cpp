#include "gbs/engine.hpp"
#include "gbs/event_ui.hpp"
#include "gbs/animation.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/input.hpp"
#include "gbs/link.hpp"
#include "gbs/platformer.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/save.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#ifndef GBS_PLATFORMER_PROJECT_DATA_HEADER
#define GBS_PLATFORMER_PROJECT_DATA_HEADER "platformer_project_data.hpp"
#endif
#include GBS_PLATFORMER_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_PLATFORMER_RUNTIME_ENTRY
#define GBS_PLATFORMER_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_PLATFORMER_RUNTIME_ENTER
#define GBS_PLATFORMER_RUNTIME_ENTER gbs_enter_platformer
#endif
#ifndef GBS_PLATFORMER_RUNTIME_UPDATE
#define GBS_PLATFORMER_RUNTIME_UPDATE gbs_update_platformer
#endif
#ifndef GBS_PLATFORMER_RUNTIME_RENDER
#define GBS_PLATFORMER_RUNTIME_RENDER gbs_render_platformer
#endif
#ifndef GBS_PLATFORMER_RUNTIME_LEAVE
#define GBS_PLATFORMER_RUNTIME_LEAVE gbs_leave_platformer
#endif

namespace {

const gbs::PlatformerProjectData& project = gbastudio_platformer_project::project;
uint32_t platformer_save_sequence = 0;
constexpr size_t max_project_resource_banks = 64;
constexpr size_t max_prefetch_new_banks_per_frame = 2;
constexpr size_t max_prefetch_uploads_per_frame = 2;
constexpr size_t max_room_enemies = 8;
constexpr size_t max_room_moving_platforms = 8;
constexpr size_t max_room_triggers = 16;
constexpr size_t max_room_npcs = 16;

gbs::EngineResourceManager resources __attribute__((section(".ewram_bss")));
gbs::ResourceReservation tile_reservations[2];
gbs::ResourceReservation bg_palette_reservations[1];
gbs::ResourceReservation obj_palette_reservations[1];
gbs::ResourceBatchReservation resource_reservation {
    tile_reservations,
    2,
    0,
    bg_palette_reservations,
    1,
    0,
    obj_palette_reservations,
    1,
    0,
    gbs::ResourceReservation {},
    false
};
gbs::ResourceBankReservation bank_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::ResourceBankBatchReservation bank_reservation {
    bank_reservations,
    max_project_resource_banks,
    0,
    nullptr,
    false
};
gbs::ResourceBankReservation bank_scratch_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::ResourceBankBatchReservation bank_scratch_reservation {
    bank_scratch_reservations,
    max_project_resource_banks,
    0,
    nullptr,
    false
};
gbs::ResourceBankCacheEntry bank_cache_entries[gbs::max_resource_bank_cache_entries] __attribute__((section(".ewram_bss")));
gbs::ResourceBankCache bank_cache {
    bank_cache_entries,
    gbs::max_resource_bank_cache_entries,
    0
};
gbs::ResourceBankPrefetchRequest platformer_prefetch_requests[gbs::max_resource_bank_cache_entries] __attribute__((section(".ewram_bss")));
gbs::PlatformerEnemy active_enemies[max_room_enemies];
size_t active_enemy_count = 0;
gbs::PlatformerMovingPlatform active_moving_platforms[max_room_moving_platforms];
size_t active_moving_platform_count = 0;
gbs::PlatformerNpcRuntime platformer_npc_runtimes[max_room_npcs];
gbs::SpriteAnimatorState platformer_npc_animators[max_room_npcs];
gbs::EventRunner platformer_npc_runners[max_room_npcs];
bool platformer_npc_start_complete[max_room_npcs];
bool platformer_npc_touching_player[max_room_npcs];
int platformer_npc_wait_frames[max_room_npcs];
size_t platformer_npc_count = 0;
gbs::EventRunner platformer_npc_interaction_runner;
gbs::EventRunner platformer_event_runner;
gbs::EventScriptQueue platformer_event_queue;
gbs::EventState platformer_event_state __attribute__((section(".ewram_bss")));
int platformer_event_wait_frames = 0;
gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::HudState hud;
gbs::LinkSession link_session;

bool open_link(gbs::LinkRole role, uint16_t timeout_frames) {
    gbs::RuntimeLinkService* service = gbs::active_runtime_link_service();
    if (service != nullptr) return gbs::runtime_link_open(*service, role, timeout_frames);
    gbs::link_open(link_session, role, timeout_frames);
    return link_session.active;
}

void close_link() {
    gbs::RuntimeLinkService* service = gbs::active_runtime_link_service();
    if (service != nullptr) {
        gbs::runtime_link_close(*service);
        return;
    }
    gbs::link_close(link_session);
}

bool transfer_link(uint8_t value) {
    gbs::RuntimeLinkService* service = gbs::active_runtime_link_service();
    if (service != nullptr) return gbs::runtime_link_transfer(*service, value);
    return gbs::link_transfer(link_session, value);
}

uint8_t received_link_value() {
    gbs::RuntimeLinkService* service = gbs::active_runtime_link_service();
    return service != nullptr && service->session != nullptr
        ? service->session->last_received
        : link_session.last_received;
}
gbs::MenuState pause_menu;
gbs::VisualEffectsController visual_effects;
const gbs::PlatformerRoomData* room_data = nullptr;
gbs::RoomTilemapCache room_layer_cache[4] {};
gbs::PlatformerRoom room {};
gbs::PlatformerActor player {};
bool player_event_active = true;
gbs::SpriteAnimatorState player_animator;
const gbs::TileAsset* player_streamed_tile_asset_loaded = nullptr;
const gbs::TileAsset* npc_streamed_tile_assets_loaded[max_room_npcs] = {};
gbs::PlatformerRuntimeState runtime_state {};
int current_room = 0;
int active_platformer_state = 0;
gbs::Camera camera {};
bool previous_camera_zone_active = false;
size_t previous_camera_zone_index = 0;
gbs::RuntimeTriggerState trigger_states[max_room_triggers] __attribute__((section(".ewram_bss")));
gbs::InputState current_input { 0, 0, 0 };
int platformer_initialization_result = 0;
gbs::EventState& event_state = platformer_event_state;
volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
uint32_t runtime_trigger_enter_count = 0;
uint32_t runtime_trigger_leave_count = 0;
uint32_t runtime_room_change_count = 0;
uint32_t runtime_blocked_direction_bits = 0;

constexpr int pause_menu_resume = 1;
constexpr int pause_menu_save = 2;
constexpr int pause_menu_load = 3;
gbs::MenuItem pause_menu_items[] = {
    { "CONTINUAR", pause_menu_resume, true },
    { "SALVAR", pause_menu_save, gbastudio_platformer_project::save_enabled },
    { "CARREGAR", pause_menu_load, gbastudio_platformer_project::save_enabled }
};

void configure_platformer_hud(const char* scene_name, gbs::HudState& state, bool force = false) {
    gbastudio_dialogue_ui::configure_for_scene(scene_name, force);
    if (gbastudio_dialogue_ui::has_hud_scene_binding(scene_name)) {
        // Scene-authored layouts carry their own static labels; an empty slot
        // list keeps those labels visible while leaving room for dynamic text.
        gbs::set_hud_text_slots(state, nullptr, 0);
    } else {
        gbs::hide_hud(state);
    }
}

constexpr int platform_callback_fall_start = 0;
constexpr int platform_callback_fall_end = 1;
constexpr int platform_callback_ground_start = 2;
constexpr int platform_callback_ground_end = 3;
constexpr int platform_callback_jump_start = 4;
constexpr int platform_callback_jump_end = 5;
constexpr int platform_callback_dash_start = 6;
constexpr int platform_callback_dash_end = 8;
constexpr int platform_callback_ladder_start = 9;
constexpr int platform_callback_ladder_end = 10;
constexpr int platform_callback_wall_start = 11;
constexpr int platform_callback_wall_end = 12;
constexpr int platform_callback_knockback_start = 13;
constexpr int platform_callback_knockback_end = 14;
constexpr int platform_callback_blank_start = 15;
constexpr int platform_callback_blank_end = 16;
constexpr int platform_callback_run_start = 17;
constexpr int platform_callback_run_end = 18;
constexpr int platform_callback_float_start = 19;
constexpr int platform_callback_float_end = 20;
constexpr int scene_type_platformer = 1;

void queue_platformer_script(gbs::EventScript script) {
    if (gbs::has_event_script(script)) {
        gbs::enqueue_event_script(platformer_event_queue, script);
    }
}

void queue_platformer_player_start_script() {
    queue_platformer_script(project.player_on_start);
}

void queue_platformer_player_update_script() {
    queue_platformer_script(project.player_on_update);
}

void run_platform_callback(gbs::EventState& event_state, int callback_index) {
    int script_index = -1;
    if (gbs::platform_callback_script(event_state, callback_index, script_index) &&
        gbs::is_valid_platformer_project_script_index(project, script_index)) {
        gbs::enqueue_event_script(platformer_event_queue, project.scripts[script_index]);
    }
}

void sync_runtime_telemetry(
    const gbs::PlatformerActor& player,
    const gbs::PlatformerRoom& room,
    const gbs::EventState& event_state
) {
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = event_state.current_room;
    runtime_telemetry.flag_bits = 0;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) {
            runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
        }
    }
    runtime_telemetry.player_x = player.bounds_pixels.x;
    runtime_telemetry.player_y = player.bounds_pixels.y;
    runtime_telemetry.player_direction = player.facing == gbs::PlatformerFacing::Left ? 2 : 3;
    runtime_telemetry.actor_count = static_cast<uint32_t>(platformer_npc_count + active_enemy_count);
    runtime_telemetry.first_actor_x = -1;
    runtime_telemetry.first_actor_y = -1;
    runtime_telemetry.first_actor_direction = -1;
    runtime_telemetry.first_actor_visible = 0;
    if (platformer_npc_count > 0) {
        runtime_telemetry.first_actor_x = platformer_npc_runtimes[0].actor.position_pixels.x;
        runtime_telemetry.first_actor_y = platformer_npc_runtimes[0].actor.position_pixels.y;
        runtime_telemetry.first_actor_direction = platformer_npc_runtimes[0].actor.direction;
        runtime_telemetry.first_actor_visible = platformer_npc_runtimes[0].visible ? 1u : 0u;
    } else if (active_enemy_count > 0) {
        runtime_telemetry.first_actor_x = active_enemies[0].bounds_pixels.x;
        runtime_telemetry.first_actor_y = active_enemies[0].bounds_pixels.y;
        runtime_telemetry.first_actor_direction = active_enemies[0].facing_right ? 3 : 2;
        runtime_telemetry.first_actor_visible = active_enemies[0].active ? 1u : 0u;
    }
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    const int center_tile_x = (player.bounds_pixels.x + player.bounds_pixels.width / 2) / 8;
    const int center_tile_y = (player.bounds_pixels.y + player.bounds_pixels.height / 2) / 8;
    const uint32_t current_flags = gbs::tile_flags_at(
        room.collision,
        center_tile_x,
        center_tile_y
    );
    const uint32_t current_slope = static_cast<uint32_t>(gbs::tile_slope_at(room.collision, center_tile_x, center_tile_y));
    runtime_telemetry.current_tile_flags = current_flags;
    runtime_telemetry.current_tile_slope = current_slope;
    runtime_telemetry.seen_tile_effects |= current_flags & static_cast<uint32_t>(gbs::TileWater | gbs::TileDamage | gbs::TileLadder);
    if (current_slope != 0) {
        runtime_telemetry.seen_slope_bits |= static_cast<uint32_t>(1u << current_slope);
    }
    if (player.hit_wall) {
        runtime_blocked_direction_bits |= player.facing == gbs::PlatformerFacing::Left
            ? (1u << 1)
            : (1u << 0);
    }
    runtime_telemetry.blocked_direction_bits = runtime_blocked_direction_bits;
    runtime_telemetry.trigger_enter_count = runtime_trigger_enter_count;
    runtime_telemetry.trigger_leave_count = runtime_trigger_leave_count;
    runtime_telemetry.room_change_count = runtime_room_change_count;
    gbs::publish_runtime_physical_telemetry(resources, event_state);
}

void set_platformer_metasprite(
    int first_index,
    const gbs::MetaSprite& metasprite,
    gbs::Vec2i anchor_position,
    int mirror_width,
    bool hflip,
    bool mosaic
) {
    if (!gbs::is_valid_metasprite(metasprite)) {
        return;
    }
    for (uint8_t part_index = 0; part_index < metasprite.part_count; ++part_index) {
        const gbs::MetaSpritePart& part = metasprite.parts[part_index];
        const int part_x = hflip
            ? anchor_position.x + mirror_width - static_cast<int>(part.x) - part.width
            : anchor_position.x + part.x;
        gbs::set_sprite(first_index + part_index, gbs::Sprite {
            part_x,
            anchor_position.y + part.y,
            part.tile_index,
            part.palette,
            hflip ? !part.hflip : part.hflip,
            part.vflip,
            true,
            0,
            gbs::SpriteRenderMode::Normal,
            mosaic,
            part.width,
            part.height,
            false,
            false,
            0,
            part.color_depth
        });
    }
}

void load_platformer_room_npcs(const gbs::PlatformerRoomData& room_data) {
    platformer_npc_count = room_data.npcs == nullptr
        ? 0
        : (room_data.npc_count < max_room_npcs ? room_data.npc_count : max_room_npcs);
    for (size_t index = 0; index < max_room_npcs; ++index) {
        gbs::init_sprite_animator(platformer_npc_animators[index]);
        gbs::init_event_runner(platformer_npc_runners[index]);
        platformer_npc_start_complete[index] = false;
        platformer_npc_touching_player[index] = false;
        platformer_npc_wait_frames[index] = 0;
        platformer_npc_runtimes[index] = gbs::PlatformerNpcRuntime {
            gbs::Actor { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 0, 0 }, 0 },
            nullptr,
            nullptr,
            false,
            false,
            0,
            100,
            false,
            0
        };
    }
    for (size_t index = 0; index < platformer_npc_count; ++index) {
        platformer_npc_runtimes[index] = gbs::platformer_npc_runtime_from_data(room_data.npcs[index]);
        if (platformer_npc_runtimes[index].animation != nullptr) {
            gbs::select_sprite_animation(platformer_npc_animators[index], *platformer_npc_runtimes[index].animation);
        }
    }
    gbs::init_event_runner(platformer_npc_interaction_runner);
}

void load_platformer_room_runtime_objects(const gbs::PlatformerRoomData& room_data) {
    active_enemy_count = room_data.enemies == nullptr ? 0 : (room_data.enemy_count < max_room_enemies ? room_data.enemy_count : max_room_enemies);
    for (size_t index = 0; index < active_enemy_count; ++index) {
        active_enemies[index] = room_data.enemies[index];
    }

    active_moving_platform_count = room_data.moving_platforms == nullptr ? 0 : (room_data.moving_platform_count < max_room_moving_platforms ? room_data.moving_platform_count : max_room_moving_platforms);
    for (size_t index = 0; index < active_moving_platform_count; ++index) {
        active_moving_platforms[index] = room_data.moving_platforms[index];
    }
    load_platformer_room_npcs(room_data);
}

bool stream_resource_bank_group_in_upload_batches(const gbs::ResourceBankGroup& group) {
    const gbs::ResourceBankUploadSource* sources =
        gbastudio_platformer_project::resource_bank_upload_source_count == 0
            ? nullptr
            : gbastudio_platformer_project::resource_bank_upload_sources;
    for (size_t index = 0; index < group.bank_count; ++index) {
        if (gbs::resource_bank_requires_upload_source(group.banks[index].kind) &&
            gbs::resource_bank_upload_source_by_name(
                sources,
                gbastudio_platformer_project::resource_bank_upload_source_count,
                group.banks[index].name
            ) == nullptr) {
            return false;
        }
    }

    const gbs::ResourceStreamResult stream_result = gbs::stream_resource_bank_group_with_uploads(
        resources,
        bank_reservation,
        bank_scratch_reservation,
        group,
        sources,
        gbastudio_platformer_project::resource_bank_upload_source_count
    );
    if (stream_result.success) {
        if (stream_result.uploaded_count > 0) {
            gbs::wait_vblank();
        }
        return true;
    }
    if (stream_result.status != gbs::ResourceStreamStatus::DmaQueueFull) {
        return false;
    }

    // Grupos excepcionalmente grandes continuam sendo enviados em lotes; o
    // caminho comum permanece transacional e compartilhado com o Top-down.
    if (!gbs::stream_resource_bank_group(
            resources,
            bank_reservation,
            bank_scratch_reservation,
            group)) {
        return false;
    }

    bool queued_upload = false;
    for (size_t index = 0; index < bank_reservation.reservation_count; ++index) {
        const gbs::ResourceBankReservation& reservation = bank_reservation.reservations[index];
        if (!gbs::resource_bank_requires_upload_source(reservation.kind)) {
            continue;
        }
        if (gbs::dma_vblank_queue_count() >= gbs::dma_vblank_queue_capacity) {
            gbs::wait_vblank();
            queued_upload = false;
        }
        const void* source = gbs::resource_bank_upload_source_by_name(
            sources,
            gbastudio_platformer_project::resource_bank_upload_source_count,
            reservation.name
        );
        if (!gbs::enqueue_resource_bank_upload_vblank(reservation, source)) {
            return false;
        }
        queued_upload = true;
    }
    if (queued_upload) {
        gbs::wait_vblank();
    }
    return true;
}

bool stream_resources_for_room(int room_index) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    if (!gbs::is_valid_platformer_room_index(project, room_index)) {
        return false;
    }

    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_platformer_room(project, project.rooms[room_index]);
    if (group.name == nullptr || group.bank_count > max_project_resource_banks) {
        return false;
    }
    if (gbs::resource_bank_cache_contains_group(bank_cache, group)) {
        const gbs::ResourceBankCacheGroupResult result = gbs::hot_swap_resource_bank_group_from_cache(
            resources,
            bank_reservation,
            bank_cache,
            group
        );
        if (result.success) {
            return true;
        }
    }

    return stream_resource_bank_group_in_upload_batches(group);
}

void prefetch_room_resource_groups(int active_room, gbs::Vec2i camera_center_pixels) {
    const gbs::ResourceBankUploadSource* upload_sources =
        gbastudio_platformer_project::resource_bank_upload_source_count == 0
            ? nullptr
            : gbastudio_platformer_project::resource_bank_upload_sources;

    if (project.resource_bank_group_count == 0 ||
        project.room_count <= 1 ||
        upload_sources == nullptr) {
        return;
    }

    size_t request_count = 0;
    for (size_t room_index = 0; room_index < project.room_count && request_count < gbs::max_resource_bank_cache_entries; ++room_index) {
        if (static_cast<int>(room_index) == active_room) {
            continue;
        }
        const gbs::PlatformerRoomData& room_data = project.rooms[room_index];
        const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_platformer_room(project, room_data);
        if (group.name == nullptr ||
            group.bank_count == 0 ||
            group.bank_count > gbs::max_resource_bank_cache_entries ||
            gbs::resource_bank_name_equals(group.name, bank_reservation.group_name)) {
            continue;
        }

        const gbs::Rect area {
            0,
            0,
            room_data.width_tiles * 8,
            room_data.height_tiles * 8
        };
        for (size_t bank_index = 0; bank_index < group.bank_count && request_count < gbs::max_resource_bank_cache_entries; ++bank_index) {
            platformer_prefetch_requests[request_count++] = gbs::ResourceBankPrefetchRequest {
                &group.banks[bank_index],
                area,
                192,
                48,
                512,
                false
            };
        }
    }

    if (request_count == 0) {
        return;
    }

    const gbs::ResourceBankPrefetchPolicy prefetch_policy {
        max_prefetch_new_banks_per_frame,
        max_prefetch_uploads_per_frame,
        true
    };
    gbs::prefetch_resource_banks_for_camera_with_uploads_policy(
        resources,
        bank_cache,
        platformer_prefetch_requests,
        request_count,
        camera_center_pixels,
        gbs::frame_count(),
        upload_sources,
        gbastudio_platformer_project::resource_bank_upload_source_count,
        prefetch_policy
    );
}

bool reserve_resources(int initial_room) {
    gbs::init_resource_manager(resources);
    if (project.resource_bank_group_count > 0) {
        return stream_resources_for_room(initial_room);
    }

    if (project.resource_bank_count > 0) {
        if (project.resource_bank_count > max_project_resource_banks) {
            return false;
        }
        return gbs::reserve_resource_banks(
            resources,
            gbs::resource_bank_batch_from_platformer_project(project),
            bank_reservation
        );
    }

    const gbs::ResourceBatch batch {
        project.tile_assets,
        project.tile_asset_count,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count,
        1,
        1
    };
    return gbs::reserve_resource_batch(resources, batch, resource_reservation);
}

void apply_active_room_video(const gbs::PlatformerProjectData& project_data, int room_index) {
    for (auto& cache : room_layer_cache) cache = {};
    player_streamed_tile_asset_loaded = nullptr;
    for (auto& asset : npc_streamed_tile_assets_loaded) asset = nullptr;
    if (!gbs::is_valid_platformer_room_index(project_data, room_index)) {
        return;
    }
    gbs::apply_video_composition(project_data.rooms[room_index].video);
}

void load_assets(int room_index) {
    const bool assets_are_streamed = project.resource_bank_group_count > 0;
    if (!assets_are_streamed) {
        for (size_t index = 0; index < project.bg_palette_count; ++index) {
            gbs::load_palette(project.bg_palettes[index], false);
        }
        for (size_t index = 0; index < project.obj_palette_count; ++index) {
            gbs::load_palette(project.obj_palettes[index], true);
        }
        for (size_t index = 0; index < project.tile_asset_count; ++index) {
            gbs::load_tiles(project.tile_assets[index]);
        }
    }
    apply_active_room_video(project, room_index);
}

void apply_event_camera(gbs::Camera& camera, const gbs::EventState& event_state) {
    if (!event_state.camera_changed) {
        return;
    }
    camera.follow_player = event_state.camera_follow_player;
    if (!event_state.camera_follow_player) {
        camera.position_pixels = gbs::Vec2i { event_state.camera_x, event_state.camera_y };
    }
}

void consume_link_event_outputs(gbs::EventState& event_state) {
    const int request = event_state.link_request;
    if (request == 0) {
        return;
    }
    event_state.link_request = 0;
    if (request == 1 || request == 2) {
        if (open_link(
                request == 1 ? gbs::LinkRole::Host : gbs::LinkRole::Join,
                static_cast<uint16_t>(event_state.link_timeout_frames)
            ) && gbs::is_valid_platformer_project_script_index(project, event_state.link_script)) {
            gbs::run_event_script(event_state, project.scripts[event_state.link_script]);
        }
        return;
    }
    if (request == 3) {
        close_link();
        return;
    }
    if (request == 4) {
        event_state.link_last_transfer_ok = transfer_link(static_cast<uint8_t>(event_state.link_transfer_value));
        event_state.link_last_received_value = received_link_value();
        if (event_state.link_last_transfer_ok && event_state.link_transfer_variable >= 0 && event_state.link_transfer_variable < 16) {
            event_state.variables[event_state.link_transfer_variable] = event_state.link_last_received_value;
        }
    }
}

void consume_event_state(gbs::EventState& event_state, int* local_wait_frames = nullptr) {
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count
    );
    consume_link_event_outputs(event_state);
    if (event_state.last_dialogue >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, event_state.last_dialogue);
        event_state.last_dialogue = -1;
    }
    if (event_state.last_sfx >= 0) {
        if (static_cast<size_t>(event_state.last_sfx) < project.sfx_asset_count) {
            gbs::play_sfx(project.sfx_assets[event_state.last_sfx]);
        }
        event_state.last_sfx = -1;
    }
    if (event_state.last_pcm_sfx >= 0) {
        if (static_cast<size_t>(event_state.last_pcm_sfx) < project.pcm_asset_count) {
            gbs::play_pcm_sfx(
                project.pcm_assets[event_state.last_pcm_sfx],
                static_cast<uint8_t>(event_state.last_pcm_sfx_priority),
                static_cast<uint8_t>(event_state.last_pcm_sfx_volume)
            );
        }
        event_state.last_pcm_sfx = -1;
    }
    if (event_state.last_music >= 0) {
        if (static_cast<size_t>(event_state.last_music) < project.music_asset_count) {
            gbs::play_music(project.music_assets[event_state.last_music]);
        }
        event_state.last_music = -1;
    }
    if (event_state.last_tracker_music >= 0) {
        if (static_cast<size_t>(event_state.last_tracker_music) < project.tracker_asset_count) {
            gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music]);
        }
        event_state.last_tracker_music = -1;
    }
    if (event_state.audio_mute_changed) {
        gbs::set_audio_channel_muted(
            gbs::audio_channel_from_event_value(event_state.audio_mute_channel),
            event_state.audio_mute_enabled
        );
        event_state.audio_mute_changed = false;
    }
    if (event_state.audio_volume_changed) {
        gbs::set_audio_channel_volume(
            gbs::audio_channel_from_event_value(event_state.audio_volume_channel),
            static_cast<uint8_t>(event_state.audio_volume)
        );
        event_state.audio_volume_changed = false;
    }
    if (event_state.audio_fade_changed) {
        gbs::fade_audio_channel_volume(
            gbs::audio_channel_from_event_value(event_state.audio_fade_channel),
            static_cast<uint8_t>(event_state.audio_fade_target_volume),
            static_cast<uint16_t>(event_state.audio_fade_frames)
        );
        event_state.audio_fade_changed = false;
    }
    if (event_state.close_dialogue) {
        gbs::hide_dialogue(dialogue);
        event_state.close_dialogue = false;
    }
    if (event_state.fade_changed) {
        gbs::start_visual_effect_phase(
            visual_effects,
            gbs::VisualEffectKind::Fade,
            gbs::VisualEffectTarget::Screen,
            event_state.fade_frames,
            100,
            event_state.fade_direction > 0
        );
        event_state.fade_changed = false;
        event_state.fade_direction = 0;
        event_state.fade_frames = 0;
    }
    if (event_state.stop_music) {
        gbs::stop_music();
        gbs::stop_tracker_music();
        gbs::stop_pcm_music();
        event_state.stop_music = false;
    }
    if (event_state.wait_frames > 0) {
        if (local_wait_frames != nullptr) {
            *local_wait_frames += event_state.wait_frames;
        } else {
            platformer_event_wait_frames = event_state.wait_frames;
        }
        event_state.wait_frames = 0;
    }
}

bool run_button_event_binding() {
    if (!gbs::update_button_event_bindings(event_state)) {
        return false;
    }
    const int script_index = event_state.last_script;
    const bool overrides_default = event_state.last_button_binding_overrides_default;
    event_state.last_script = -1;
    event_state.last_button_binding_overrides_default = false;
    if (gbs::is_valid_platformer_project_script_index(project, script_index)) {
        gbs::run_event_script(event_state, project.scripts[script_index]);
        consume_event_state(event_state);
    }
    return overrides_default;
}

void consume_platformer_actor_commands(
    gbs::EventState& event_state,
    gbs::PlatformerActor& player,
    const gbs::PlatformerRoomData& room_data,
    bool& player_event_active
) {
    const gbs::TileMap collision = gbs::platformer_collision_map_from_room(room_data);
    for (size_t command_index = 0; command_index < event_state.actor_command_count; ++command_index) {
        const gbs::EventActorCommand& command = event_state.actor_commands[command_index];
        if (command.op != gbs::EventActorOp::Push ||
            command.actor_index < 0 ||
            static_cast<size_t>(command.actor_index) >= platformer_npc_count) {
            continue;
        }
        const size_t npc_index = static_cast<size_t>(command.actor_index);
        gbs::Actor blockers[max_room_npcs + 1] = {};
        size_t blocker_count = 0;
        blockers[blocker_count++] = gbs::Actor {
            gbs::Vec2i { player.bounds_pixels.x, player.bounds_pixels.y },
            gbs::Vec2i { player.bounds_pixels.width, player.bounds_pixels.height },
            0
        };
        for (size_t index = 0; index < platformer_npc_count && blocker_count < max_room_npcs + 1; ++index) {
            if (index != npc_index && platformer_npc_runtimes[index].active && platformer_npc_runtimes[index].visible) {
                blockers[blocker_count++] = platformer_npc_runtimes[index].actor;
            }
        }
        platformer_npc_runtimes[npc_index].active = true;
        gbs::push_actor_by_delta_until_collision(
            collision,
            platformer_npc_runtimes[npc_index].actor,
            gbs::Vec2i { command.a, command.b },
            blockers,
            blocker_count
        );
    }
    const gbs::Vec2i player_anchor_before_commands = gbs::platformer_actor_anchor_position(player);
    gbs::EventPlayerRuntimeState player_event_runtime {
        player_event_active,
        player_anchor_before_commands.x,
        player_anchor_before_commands.y,
        player.facing == gbs::PlatformerFacing::Left ? 2 : 3
    };
    for (size_t index = 0; index < event_state.actor_command_count; ++index) {
        gbs::apply_event_player_command(player_event_runtime, event_state.actor_commands[index]);
        const gbs::EventActorCommand& command = event_state.actor_commands[index];
        if (command.actor_index == gbs::event_player_actor_index &&
            command.op == gbs::EventActorOp::SetPosition) {
            // Absolute positioning is a teleport, not a continuation of the fall/dash.
            player.velocity_x256 = gbs::Vec2i { 0, 0 };
            player.movement_remainder_x256 = gbs::Vec2i { 0, 0 };
            player.dash_timer = 0;
            player.dashing = false;
            player.jump_hold_timer = 0;
        }
    }
    player_event_active = player_event_runtime.active;
    gbs::set_platformer_actor_anchor_position(
        player,
        gbs::Vec2i { player_event_runtime.x, player_event_runtime.y }
    );
    if (player_event_runtime.x != player_anchor_before_commands.x) {
        player.movement_remainder_x256.x = 0;
    }
    if (player_event_runtime.y != player_anchor_before_commands.y) {
        player.movement_remainder_x256.y = 0;
    }
    player.facing = player_event_runtime.direction == 2
        ? gbs::PlatformerFacing::Left
        : gbs::PlatformerFacing::Right;
    event_state.player_x = player.bounds_pixels.x;
    event_state.player_y = player.bounds_pixels.y;
    event_state.player_direction = player_event_runtime.direction;
    gbs::consume_actor_event_commands(platformer_npc_runtimes, platformer_npc_count, event_state);
    for (size_t index = 0; index < platformer_npc_count; ++index) {
        const gbs::SpriteAnimation* next_animation = gbs::platformer_npc_animation_for_index(
            room_data.npcs[index],
            platformer_npc_runtimes[index].animation_index
        );
        if (next_animation != platformer_npc_runtimes[index].animation) {
            platformer_npc_runtimes[index].animation = next_animation;
            gbs::init_sprite_animator(platformer_npc_animators[index]);
            if (next_animation != nullptr) {
                gbs::select_sprite_animation(platformer_npc_animators[index], *next_animation);
            }
        }
        if (platformer_npc_runtimes[index].animation_frame_changed) {
            gbs::set_sprite_animation_frame(platformer_npc_animators[index], platformer_npc_runtimes[index].animation_frame_index);
            platformer_npc_runtimes[index].animation_frame_changed = false;
        }
        const bool animation_requested = index < gbs::max_event_actor_state_slots
            && event_state.actor_animation_playing[index];
        if (next_animation != nullptr && animation_requested && !platformer_npc_animators[index].playing) {
            gbs::play_sprite_animation(platformer_npc_animators[index], *next_animation);
        } else if (!animation_requested) {
            gbs::stop_sprite_animation(platformer_npc_animators[index]);
        }
    }
}

int platform_callback_start_for_state(int state) {
    switch (state) {
    case 0: return platform_callback_fall_start;
    case 1: return platform_callback_ground_start;
    case 2: return platform_callback_jump_start;
    case 3: return platform_callback_dash_start;
    case 4: return platform_callback_ladder_start;
    case 5: return platform_callback_wall_start;
    case 6: return platform_callback_knockback_start;
    case 7: return platform_callback_blank_start;
    case 8: return platform_callback_run_start;
    case 9: return platform_callback_float_start;
    default: return -1;
    }
}

int platform_callback_end_for_state(int state) {
    switch (state) {
    case 0: return platform_callback_fall_end;
    case 1: return platform_callback_ground_end;
    case 2: return platform_callback_jump_end;
    case 3: return platform_callback_dash_end;
    case 4: return platform_callback_ladder_end;
    case 5: return platform_callback_wall_end;
    case 6: return platform_callback_knockback_end;
    case 7: return platform_callback_blank_end;
    case 8: return platform_callback_run_end;
    case 9: return platform_callback_float_end;
    default: return -1;
    }
}

void transition_platformer_callback_state(
    gbs::EventState& event_state,
    int& active_state,
    int next_state
) {
    if (next_state < 0 || next_state > 9 || next_state == active_state) {
        return;
    }
    run_platform_callback(event_state, platform_callback_end_for_state(active_state));
    active_state = next_state;
    run_platform_callback(event_state, platform_callback_start_for_state(active_state));
}

bool consume_platformer_state_request(
    gbs::EventState& event_state,
    gbs::PlatformerActor& player,
    const gbs::PlatformerConfig& config,
    bool& player_event_active,
    int& active_state
) {
    if (!event_state.platformer_state_changed) {
        return false;
    }
    event_state.platformer_state_changed = false;
    const int next_state = event_state.platformer_next_state;
    if (next_state < 0 || next_state > 9) {
        return false;
    }

    transition_platformer_callback_state(event_state, active_state, next_state);
    player_event_active = next_state != 7;
    switch (next_state) {
    case 0: // fall
        player.on_ground = false;
        player.on_ladder = false;
        break;
    case 1: // ground
    case 8: // run
        player.on_ground = true;
        player.on_ladder = false;
        player.velocity_x256.y = 0;
        player.movement_remainder_x256.y = 0;
        break;
    case 2: // jump
        player.on_ground = false;
        player.on_ladder = false;
        player.velocity_x256.y = -config.jump_speed_x256;
        player.movement_remainder_x256.y = 0;
        break;
    case 4: // ladder
        player.on_ground = false;
        player.on_ladder = true;
        player.velocity_x256 = gbs::Vec2i { 0, 0 };
        player.movement_remainder_x256 = gbs::Vec2i { 0, 0 };
        break;
    case 7: // blank
        player.velocity_x256 = gbs::Vec2i { 0, 0 };
        player.movement_remainder_x256 = gbs::Vec2i { 0, 0 };
        break;
    case 9: // float
        player.on_ground = false;
        player.on_ladder = false;
        player.velocity_x256.y = 0;
        player.movement_remainder_x256.y = 0;
        break;
    default:
        player.on_ladder = false;
        break;
    }
    return true;
}

void update_platformer_event_script(
    gbs::EventState& event_state,
    gbs::PlatformerActor& player,
    const gbs::PlatformerRoomData& room_data,
    bool& player_event_active,
    int& active_state
) {
    if (platformer_event_wait_frames > 0) {
        --platformer_event_wait_frames;
        return;
    }
    if (dialogue.visible) {
        return;
    }
    if (!gbs::event_runner_is_active(platformer_event_runner)) {
        gbs::EventScriptQueueEntry entry {};
        if (!gbs::dequeue_event_script(platformer_event_queue, entry)) {
            return;
        }
        gbs::start_event_runner(platformer_event_runner, entry.script);
    }
    if (!gbs::event_runner_is_active(platformer_event_runner)) {
        return;
    }
    gbs::update_event_runner(platformer_event_runner, event_state);
    consume_event_state(event_state);
    consume_platformer_actor_commands(event_state, player, room_data, player_event_active);
    consume_platformer_state_request(
        event_state,
        player,
        room_data.config,
        player_event_active,
        active_state
    );
}

void sync_platformer_npc_event_state(gbs::EventState& event_state) {
    event_state.actor_condition_tile_size = 8;
    for (size_t index = 0; index < platformer_npc_count && index < gbs::max_event_actor_state_slots; ++index) {
        event_state.actor_x[index] = platformer_npc_runtimes[index].actor.position_pixels.x;
        event_state.actor_y[index] = platformer_npc_runtimes[index].actor.position_pixels.y;
        event_state.actor_direction[index] = platformer_npc_runtimes[index].actor.direction;
        event_state.actor_animation_playing[index] = platformer_npc_animators[index].playing;
    }
}

void update_platformer_npc_scripts(
    const gbs::PlatformerRoomData& room_data,
    gbs::EventState& event_state,
    gbs::PlatformerActor& player,
    bool& player_event_active
) {
    sync_platformer_npc_event_state(event_state);
    for (size_t index = 0; index < platformer_npc_count; ++index) {
        if (platformer_npc_wait_frames[index] > 0) {
            --platformer_npc_wait_frames[index];
            continue;
        }
        gbs::EventRunner& runner = platformer_npc_runners[index];
        if (!platformer_npc_start_complete[index]) {
            if (!gbs::event_runner_is_active(runner)) {
                gbs::start_event_runner(runner, room_data.npcs[index].on_start);
                if (!gbs::event_runner_is_active(runner)) {
                    platformer_npc_start_complete[index] = true;
                }
            }
            if (gbs::event_runner_is_active(runner) && !gbs::update_event_runner(runner, event_state)) {
                platformer_npc_start_complete[index] = true;
            }
        } else {
            if (!gbs::event_runner_is_active(runner)) {
                gbs::start_event_runner(runner, room_data.npcs[index].on_update);
            }
            gbs::update_event_runner(runner, event_state);
        }
        consume_event_state(event_state, &platformer_npc_wait_frames[index]);
        consume_platformer_actor_commands(event_state, player, room_data, player_event_active);
    }
}

void update_platformer_npc_player_hit_scripts(
    const gbs::PlatformerRoomData& room_data,
    gbs::EventState& event_state,
    gbs::Rect player_bounds
) {
    for (size_t index = 0; index < platformer_npc_count; ++index) {
        const bool touching = gbs::platformer_actor_intersects_npc(
            player_bounds,
            platformer_npc_runtimes[index]
        );
        if (!touching) {
            platformer_npc_touching_player[index] = false;
            continue;
        }
        if (platformer_npc_touching_player[index]) {
            continue;
        }
        platformer_npc_touching_player[index] = true;
        gbs::run_event_script(
            event_state,
            gbs::platformer_room_hit_script_for_collision_group(
                room_data,
                room_data.npcs[index].collision_group
            )
        );
    }
    for (size_t index = platformer_npc_count; index < max_room_npcs; ++index) {
        platformer_npc_touching_player[index] = false;
    }
}

bool platformer_npc_is_visible_in_camera(const gbs::PlatformerNpcRuntime& npc, const gbs::Camera& camera) {
    return npc.active && npc.visible && gbs::intersects(
        gbs::platformer_npc_actor_rect(npc),
        gbs::Rect { camera.position_pixels.x - 16, camera.position_pixels.y - 16, 272, 192 }
    );
}

bool capture_platformer_runtime_state(gbs::UniversalSaveData& universal_save, int current_room, const gbs::PlatformerActor& player,
    const gbs::PlatformerRuntimeState& runtime_state, const gbs::Camera& camera,
    const gbs::EventState& event_state) {
    gbs::PlatformerSaveData save_data {};
    gbs::capture_platformer_save_data(
        save_data,
        current_room,
        player,
        runtime_state,
        camera,
        event_state,
        gbs::frame_count()
    );
    static_assert(sizeof(gbs::PlatformerSaveData) <= gbs::universal_save_payload_capacity, "platformer save payload exceeds the universal envelope");
    if (!gbs::make_universal_save_data(
            universal_save,
            gbs::UniversalSaveRuntime::Platformer,
            current_room,
            player.bounds_pixels.x,
            player.bounds_pixels.y,
            camera.position_pixels.x,
            camera.position_pixels.y,
            event_state.variables,
            gbs::universal_save_variable_count,
            event_state.inventory,
            gbs::universal_save_inventory_count,
            event_state.equipped_items,
            gbs::universal_save_equipment_slot_count,
            save_data.play_time_frames,
            save_data.flags,
            &save_data,
            sizeof(save_data))) {
        return false;
    }
    return true;
}

void persist_platformer_runtime_state(int current_room, const gbs::PlatformerActor& player,
    const gbs::PlatformerRuntimeState& runtime_state, const gbs::Camera& camera,
    const gbs::EventState& event_state, int slot_index = 0) {
    if (!gbastudio_platformer_project::save_enabled || slot_index < 0 ||
        static_cast<size_t>(slot_index) >= gbastudio_platformer_project::save_bank.slot_count) return;
    gbs::UniversalSaveData universal_save {};
    if (!capture_platformer_runtime_state(universal_save, current_room, player, runtime_state, camera, event_state)) return;
    ++platformer_save_sequence;
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "PLATFORMER",
        gbs::frame_count(),
        platformer_save_sequence,
        static_cast<uint16_t>(current_room),
        0
    );
    gbs::write_save_slot_record(gbastudio_platformer_project::save_bank, static_cast<size_t>(slot_index), &universal_save, sizeof(universal_save), metadata, platformer_save_sequence);
}

bool restore_platformer_runtime_state(
    int& current_room,
    const gbs::PlatformerRoomData*& room_data,
    gbs::PlatformerRoom& room,
    gbs::PlatformerActor& player,
    gbs::PlatformerRuntimeState& runtime_state,
    gbs::Camera& camera,
    gbs::EventState& event_state,
    int slot_index = -1
) {
    if (!gbastudio_platformer_project::save_enabled) {
        return false;
    }
    if (slot_index < 0) {
        slot_index = gbs::find_latest_save_slot(gbastudio_platformer_project::save_bank);
    }
    if (slot_index < 0 || static_cast<size_t>(slot_index) >= gbastudio_platformer_project::save_bank.slot_count) {
        return false;
    }
    gbs::UniversalSaveData universal_save {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_platformer_project::save_bank,
        static_cast<size_t>(slot_index),
        &universal_save,
        sizeof(universal_save),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok ||
        bytes_read != sizeof(universal_save) ||
        !gbs::is_valid_universal_save_data(universal_save)) {
        return false;
    }
    gbs::PlatformerSaveData save_data {};
    if (!gbs::read_universal_save_payload(
            universal_save,
            gbs::UniversalSaveRuntime::Platformer,
            &save_data,
            sizeof(save_data))) {
        return false;
    }
    if (!gbs::apply_platformer_save_data(project, save_data, player, runtime_state, camera, event_state)) {
        return false;
    }
    if (!gbs::read_universal_save_common_state(
            universal_save,
            event_state.variables,
            gbs::universal_save_variable_count,
            event_state.inventory,
            gbs::universal_save_inventory_count,
            event_state.equipped_items,
            gbs::universal_save_equipment_slot_count)) {
        return false;
    }
    if (!stream_resources_for_room(event_state.current_room)) {
        return false;
    }
    current_room = event_state.current_room;
    room_data = &project.rooms[current_room];
    apply_active_room_video(project, current_room);
    room = gbs::platformer_room_from_data(*room_data);
    load_platformer_room_runtime_objects(*room_data);
    player.collision_offset_pixels = room_data->player_collision_offset_pixels;
    player.bounds_pixels.width = room_data->player_start.width;
    player.bounds_pixels.height = room_data->player_start.height;
    gbs::SaveInfo info = gbs::inspect_save_slot(gbastudio_platformer_project::save_bank, static_cast<size_t>(slot_index));
    platformer_save_sequence = info.sequence;
    return true;
}

bool apply_event_room_change(
    const gbs::PlatformerProjectData& project_data,
    int& current_room,
    const gbs::PlatformerRoomData*& room_data,
    gbs::PlatformerRoom& room,
    gbs::PlatformerActor& player,
    gbs::PlatformerRuntimeState& runtime_state,
    gbs::Camera& camera,
    gbs::EventState& event_state,
    bool& previous_camera_zone_active,
    size_t& previous_camera_zone_index
) {
    if (event_state.current_room == current_room) {
        return false;
    }
    if (!gbs::is_valid_platformer_room_index(project_data, event_state.current_room)) {
        event_state.current_room = current_room;
        return false;
    }

    int target_room = event_state.current_room;
    int target_player_x = event_state.player_x;
    int target_player_y = event_state.player_y;
    int target_player_direction = event_state.player_direction;
    if (!stream_resources_for_room(target_room)) {
        event_state.current_room = current_room;
        return false;
    }
    gbs::run_event_script(event_state, room_data->on_exit);
    current_room = target_room;
    room_data = &project_data.rooms[current_room];
    apply_active_room_video(project_data, current_room);
    room = gbs::platformer_room_from_data(*room_data);
    load_platformer_room_runtime_objects(*room_data);
    player = gbs::platformer_actor_from_rect(
        room_data->player_start,
        room_data->player_collision_offset_pixels
    );
    if (target_player_x != 0 || target_player_y != 0) {
        gbs::set_platformer_actor_anchor_position(
            player,
            gbs::Vec2i { target_player_x, target_player_y }
        );
    }
    runtime_state = gbs::platformer_state_from_spawn(
        gbs::Vec2i { player.bounds_pixels.x, player.bounds_pixels.y },
        0
    );
    player.facing = target_player_direction == 2
        ? gbs::PlatformerFacing::Left
        : gbs::PlatformerFacing::Right;
    camera = room_data->camera_start;
    previous_camera_zone_active = false;
    previous_camera_zone_index = 0;
    event_state.current_room = current_room;
    const gbs::Vec2i player_anchor = gbs::platformer_actor_anchor_position(player);
    event_state.player_x = player_anchor.x;
    event_state.player_y = player_anchor.y;
    event_state.player_direction = player.facing == gbs::PlatformerFacing::Left ? 2 : 3;
    apply_event_camera(camera, event_state);
    return true;
}

void draw_platformer_room_layers(
    const gbs::PlatformerRoomData& room,
    const gbs::Camera& camera,
    const gbs::VisualEffectsController& visual_effects
) {
    const gbs::Vec2i visual_scroll = gbs::visual_effect_scroll_offset(visual_effects);
    const bool legacy_world_effect = gbs::visual_effect_targets_background(
        visual_effects,
        gbs::BackgroundLayer::BG0
    );
    const int bg3_camera_x = (camera.position_pixels.x * room.bg3_parallax_x256.x) / 256;
    const int bg3_camera_y = (camera.position_pixels.y * room.bg3_parallax_x256.y) / 256;
    const bool bg3_effect = legacy_world_effect || gbs::visual_effect_targets_background(
        visual_effects,
        gbs::BackgroundLayer::BG3
    );
    if (room.bg3_tiles != nullptr) gbs::draw_room_to_bg_cached(
        gbs::BackgroundLayer::BG3,
        room.bg3_tiles,
        room.width_tiles,
        room.height_tiles,
        bg3_camera_x,
        bg3_camera_y,
        room_layer_cache[3]
    );
    gbs::set_bg_scroll(
        gbs::BackgroundLayer::BG3,
        (bg3_camera_x & 7) + (bg3_effect ? visual_scroll.x : 0),
        (bg3_camera_y & 7) + (bg3_effect ? visual_scroll.y : 0)
    );

    const uint16_t* bg2_tiles = room.bg2_tiles != nullptr ? room.bg2_tiles : room.visual_tiles;
    const bool bg2_effect = legacy_world_effect || gbs::visual_effect_targets_background(
        visual_effects,
        gbs::BackgroundLayer::BG2
    );
    // The hardware bootstrap leaves optional BG2/BG3 disabled. Platformer
    // rooms can arrive from another runtime in a mixed ROM, so make the
    // layer visibility match the room data on every frame.
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, room.bg1_tiles != nullptr);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, bg2_tiles != nullptr);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, room.bg3_tiles != nullptr);
    if (bg2_tiles != nullptr) gbs::draw_room_to_bg_cached(
        gbs::BackgroundLayer::BG2,
        bg2_tiles,
        room.width_tiles,
        room.height_tiles,
        camera.position_pixels.x,
        camera.position_pixels.y,
        room_layer_cache[2]
    );
    gbs::set_bg_scroll(
        gbs::BackgroundLayer::BG2,
        (camera.position_pixels.x & 7) + (bg2_effect ? visual_scroll.x : 0),
        (camera.position_pixels.y & 7) + (bg2_effect ? visual_scroll.y : 0)
    );

    const bool bg1_effect = legacy_world_effect || gbs::visual_effect_targets_background(
        visual_effects,
        gbs::BackgroundLayer::BG1
    );
    if (room.bg1_tiles != nullptr) gbs::draw_room_to_bg_cached(
        gbs::BackgroundLayer::BG1,
        room.bg1_tiles,
        room.width_tiles,
        room.height_tiles,
        camera.position_pixels.x,
        camera.position_pixels.y,
        room_layer_cache[1]
    );
    gbs::set_bg_scroll(
        gbs::BackgroundLayer::BG1,
        (camera.position_pixels.x & 7) + (bg1_effect ? visual_scroll.x : 0),
        (camera.position_pixels.y & 7) + (bg1_effect ? visual_scroll.y : 0)
    );
}

} // namespace

int initialize_platformer_runtime() {
    gbs::init();
    gbs::reset_runtime_telemetry();
    runtime_trigger_enter_count = 0;
    runtime_trigger_leave_count = 0;
    runtime_room_change_count = 0;
    runtime_blocked_direction_bits = 0;
    gbs::set_backdrop_color(project.backdrop_color);
    if (!gbs::is_valid_platformer_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    gbs::init_event_state(event_state);
    gbs::init_event_runner(platformer_event_runner);
    gbs::init_event_script_queue(platformer_event_queue);
    platformer_event_wait_frames = 0;
    gbs::init_visual_effects(visual_effects);
    current_room = project.initial_room;
    int entry_x = 0;
    int entry_y = 0;
    bool runtime_entry = false;
    bool restore_entry = false;
    int restore_slot_index = -1;
#ifdef GBS_MULTI_RUNTIME
    restore_entry = gbs::consume_runtime_save_restore(gbs::RuntimeKind::Platformer, restore_slot_index);
    if (!restore_entry) {
        runtime_entry = gbs::consume_runtime_transition(
            gbs::RuntimeKind::Platformer,
            event_state,
            current_room,
            entry_x,
            entry_y
        );
    }
#endif
    if (!gbs::is_valid_platformer_room_index(project, current_room) || !reserve_resources(current_room)) {
        return -1;
    }

    // Asset uploads may reuse palette/tile ranges initialized by the hardware
    // bootstrap. Restore only the built-in UI glyphs; restoring demo OBJ tiles
    // here would overwrite the exported player sprite.
    load_assets(current_room);
    gbs::render_ui_assets();
    room_data = &project.rooms[current_room];
    if (room_data->trigger_count > max_room_triggers || room_data->npc_count > max_room_npcs) {
        return -1;
    }
    room = gbs::platformer_room_from_data(*room_data);
    load_platformer_room_runtime_objects(*room_data);
    player = gbs::platformer_actor_from_rect(
        room_data->player_start,
        room_data->player_collision_offset_pixels
    );
    player_event_active = true;
    gbs::init_sprite_animator(player_animator);
    if (runtime_entry) {
        gbs::set_platformer_actor_anchor_position(player, gbs::Vec2i { entry_x, entry_y });
        player.facing = event_state.player_direction == 2
            ? gbs::PlatformerFacing::Left
            : gbs::PlatformerFacing::Right;
    }
    runtime_state = gbs::platformer_state_from_spawn(
        gbs::Vec2i { player.bounds_pixels.x, player.bounds_pixels.y },
        0
    );
    active_platformer_state = player.on_ground ? 1 : 0;
    camera = room_data->camera_start;
    gbs::init_dialogue(dialogue);
    gbs::init_menu(pause_menu);
    gbs::configure_dialogue_ui(project.dialogue_ui);
    gbs::set_dialogue_frame(dialogue, project.dialogue_ui.frame_index);
    gbs::configure_dialogue_portraits(
        gbastudio_platformer_project::dialogue_portrait_assets,
        gbastudio_platformer_project::dialogue_portrait_asset_count
    );
    gbs::configure_dialogue_emotes(
        gbastudio_platformer_project::dialogue_emote_assets,
        gbastudio_platformer_project::dialogue_emote_asset_count
    );
    gbastudio_dialogue_ui::configure();
    gbs::init_hud(hud);
    configure_platformer_hud(project.rooms[current_room].name, hud, true);
    event_state.current_room = current_room;
    const gbs::Vec2i initial_player_anchor = gbs::platformer_actor_anchor_position(player);
    event_state.player_x = initial_player_anchor.x;
    event_state.player_y = initial_player_anchor.y;
    event_state.player_direction = player.facing == gbs::PlatformerFacing::Left ? 2 : 3;
    bool restored_save = false;
    if (restore_entry || !runtime_entry) {
        restored_save = restore_platformer_runtime_state(
            current_room,
            room_data,
            room,
            player,
            runtime_state,
            camera,
            event_state,
            restore_entry ? restore_slot_index : -1
        );
    }
    if (restore_entry && !restored_save) {
        return -1;
    }
    gbs::UniversalSaveData paused_data {};
    const bool resumed_pause = runtime_entry && gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::Platformer, current_room, paused_data);
    if (resumed_pause) {
        gbs::PlatformerSaveData state {};
        if (!gbs::read_universal_save_payload(paused_data, gbs::UniversalSaveRuntime::Platformer, &state, sizeof(state)) ||
            !gbs::apply_platformer_save_data(project, state, player, runtime_state, camera, event_state) ||
            !gbs::restore_suspended_common_state(paused_data, event_state)) return -1;
    } else {
        queue_platformer_script(room_data->on_enter);
        queue_platformer_player_start_script();
    }
    apply_event_camera(camera, event_state);
    consume_event_state(event_state);
    consume_platformer_actor_commands(event_state, player, *room_data, player_event_active);
    consume_platformer_state_request(
        event_state,
        player,
        room_data->config,
        player_event_active,
        active_platformer_state
    );
    gbs::consume_visual_effect_event(event_state, visual_effects);
    previous_camera_zone_active = false;
    previous_camera_zone_index = 0;
    for (size_t index = 0; index < max_room_triggers; ++index) {
        trigger_states[index] = gbs::RuntimeTriggerState {};
    }
    prefetch_room_resource_groups(current_room, gbs::Vec2i { camera.position_pixels.x + 120, camera.position_pixels.y + 80 });

    return 0;
}

gbs::RuntimeAdapterFrameResult update_platformer_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    if (platformer_initialization_result != 0) {
        return gbs::RuntimeAdapterFrameResult::Error;
    }

        // Reconfigure assets on room entry; stable frames retain the scene UI.
        configure_platformer_hud(project.rooms[current_room].name, hud);
#ifdef GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_pending()) {
            sync_runtime_telemetry(player, room, event_state);
            return gbs::RuntimeAdapterFrameResult::Transition;
        }
#endif
        current_input = gbs::begin_frame().input;
        const gbs::InputState input = current_input;
        const bool dialogue_was_visible = dialogue.visible;
        gbs::tick_event_frame_counter(event_state);
#if GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_requested()) {
            gbs::consume_scene_transition_visual_effect_event(event_state);
            return gbs::runtime_transition_pending()
                ? gbs::RuntimeAdapterFrameResult::Transition
                : gbs::RuntimeAdapterFrameResult::Continue;
        }
#endif
        gbs::set_event_input_state(event_state, input.held, input.pressed, input.released);
    gbs::update_hud_behavior(event_state, hud.visible);
        const bool button_binding_overrides_default =
            !pause_menu.visible &&
            !dialogue.visible &&
            platformer_event_wait_frames <= 0 &&
            !gbs::event_runner_is_active(platformer_event_runner) &&
            gbs::event_script_queue_is_empty(platformer_event_queue) &&
            run_button_event_binding();
#ifdef GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_pending()) {
            sync_runtime_telemetry(player, room, event_state);
            return gbs::RuntimeAdapterFrameResult::Transition;
        }
#endif
        if (gbs::update_timer_event_bindings(event_state)) {
            const int script_index = event_state.last_script;
            event_state.last_script = -1;
            if (gbs::is_valid_platformer_project_script_index(project, script_index)) {
                queue_platformer_script(project.scripts[script_index]);
            }
        }
        if (button_binding_overrides_default) {
            // An authored button event owns this frame, including Start's
            // transition to the scene-based in-game menu.
        } else if (pause_menu.visible) {
            if (gbs::advance_menu(pause_menu, input) && pause_menu.accepted) {
                const int selected_value = pause_menu.last_value;
                pause_menu.accepted = false;
                if (selected_value == pause_menu_save) {
                    persist_platformer_runtime_state(current_room, player, runtime_state, camera, event_state);
                } else if (selected_value == pause_menu_load) {
                    restore_platformer_runtime_state(current_room, room_data, room, player, runtime_state, camera, event_state);
                }
            }
        } else if (input.was_pressed(gbs::ButtonStart)) {
            gbs::show_menu(
                pause_menu,
                "MENU",
                pause_menu_items,
                sizeof(pause_menu_items) / sizeof(pause_menu_items[0])
            );
        } else if (dialogue.visible ||
            platformer_event_wait_frames > 0 ||
            gbs::event_runner_is_active(platformer_event_runner) ||
            !gbs::event_script_queue_is_empty(platformer_event_queue)) {
            update_platformer_event_script(
                event_state,
                player,
                *room_data,
                player_event_active,
                active_platformer_state
            );
        } else if (!gbs::event_scene_type_is_paused(event_state, scene_type_platformer)) {
            update_platformer_npc_scripts(*room_data, event_state, player, player_event_active);
            if (player_event_active && input.was_pressed(gbs::ButtonA) && !gbs::event_runner_is_active(platformer_npc_interaction_runner)) {
                const gbs::Rect interaction_bounds {
                    player.bounds_pixels.x - 8,
                    player.bounds_pixels.y - 8,
                    player.bounds_pixels.width + 16,
                    player.bounds_pixels.height + 16
                };
                gbs::start_event_runner(
                    platformer_npc_interaction_runner,
                    gbs::platformer_npc_interaction_script_for(
                        *room_data,
                        platformer_npc_runtimes,
                        platformer_npc_count,
                        interaction_bounds
                    )
                );
            }
            if (gbs::event_runner_is_active(platformer_npc_interaction_runner)) {
                gbs::update_event_runner(platformer_npc_interaction_runner, event_state);
                consume_event_state(event_state);
                consume_platformer_actor_commands(event_state, player, *room_data, player_event_active);
            }
        for (size_t index = 0; index < active_moving_platform_count; ++index) {
            bool carries_player = gbs::platformer_actor_stands_on_platform(player, active_moving_platforms[index]);
            gbs::Vec2i delta = gbs::update_platformer_moving_platform(active_moving_platforms[index]);
            if (carries_player) {
                gbs::run_event_script(
                    event_state,
                    gbs::platformer_moving_platform_event_script_for(*room_data, index)
                );
                player.bounds_pixels.x += delta.x;
                player.bounds_pixels.y += delta.y;
            }
        }
        for (size_t index = 0; index < active_enemy_count; ++index) {
            gbs::update_platformer_enemy_patrol(active_enemies[index], room.collision);
        }
        const bool was_on_ground = player.on_ground;
        const gbs::Rect player_bounds_before_update = player.bounds_pixels;
        const gbs::Vec2i player_remainder_before_update = player.movement_remainder_x256;
        const gbs::InputState player_input = player_event_active && !dialogue.visible
            ? input
            : gbs::InputState { 0, 0, 0 };
        if (player_event_active) {
            gbs::update_platformer_actor(room.collision, player, player_input, room_data->config);
        } else if (active_platformer_state == 7) {
            gbs::update_platformer_blank_actor(
                room.collision,
                player,
                event_state.platformer_blank_gravity,
                room_data->config.max_fall_speed_x256
            );
        }
        // Contact events must see the attempted position, before solid actors roll it back.
        update_platformer_npc_player_hit_scripts(*room_data, event_state, player.bounds_pixels);
        if (player_event_active) {
            gbs::snap_platformer_actor_to_npcs(player, player_bounds_before_update,
                platformer_npc_runtimes, platformer_npc_count, room_data->config.platform_actor_collision_group);
        }
        if (player_event_active && !(player.dashing && room_data->config.dash_through >= 1) &&
            gbs::platformer_actor_intersects_npcs(player.bounds_pixels, platformer_npc_runtimes, platformer_npc_count)) {
            player.bounds_pixels = player_bounds_before_update;
            player.movement_remainder_x256 = player_remainder_before_update;
            player.velocity_x256.x = 0;
            player.movement_remainder_x256.x = 0;
            player.hit_wall = true;
        }
        size_t landed_platform_index = 0;
        if (gbs::snap_platformer_actor_to_moving_platforms(player, active_moving_platforms, active_moving_platform_count, &landed_platform_index)) {
            gbs::run_event_script(
                event_state,
                gbs::platformer_moving_platform_event_script_for(*room_data, landed_platform_index)
            );
        }
        if (!was_on_ground && player.on_ground) {
            transition_platformer_callback_state(event_state, active_platformer_state, 1);
        } else if (was_on_ground && !player.on_ground) {
            transition_platformer_callback_state(event_state, active_platformer_state, 0);
        }
        const gbs::PlatformerActorAnimationState player_animation_state = gbs::platformer_actor_animation_state(player);
        const bool player_animation_should_advance = player_animation_state != gbs::PlatformerActorAnimationState::Idle;
        const gbs::SpriteAnimation* player_animation = gbs::platformer_player_animation_for_state(
            project.player_animations,
            player_animation_state
        );
        if (player_animation != player_animator.animation) {
            if (player_animation != nullptr) {
                if (player_animation_should_advance) {
                    gbs::play_sprite_animation(player_animator, *player_animation);
                } else {
                    gbs::select_sprite_animation(player_animator, *player_animation);
                }
            } else {
                gbs::init_sprite_animator(player_animator);
            }
        } else if (!player_animation_should_advance && player_animation != nullptr && player_animator.playing) {
            gbs::select_sprite_animation(player_animator, *player_animation);
        }
        if (player_animation_should_advance) {
            gbs::update_sprite_animator(player_animator);
        }
        gbs::run_event_script(event_state, room_data->on_update);
        queue_platformer_player_update_script();
        if (!player.dashing || room_data->config.dash_through < 2) {
            for (size_t index = 0; index < room_data->trigger_count; ++index) {
                const gbs::RuntimeTriggerResult result = gbs::update_runtime_trigger(
                    room_data->triggers[index],
                    trigger_states[index],
                    player.bounds_pixels
                );
                if (result == gbs::RuntimeTriggerResult::Enter) {
                    ++runtime_trigger_enter_count;
                    runtime_telemetry.trigger_enter_count = runtime_trigger_enter_count;
                } else if (result == gbs::RuntimeTriggerResult::Leave) {
                    ++runtime_trigger_leave_count;
                    runtime_telemetry.trigger_leave_count = runtime_trigger_leave_count;
                }
                gbs::run_event_script(
                    event_state,
                    gbs::runtime_trigger_script_for_result(room_data->triggers[index], result)
                );
            }
        }
        gbs::update_platformer_checkpoints(
            player,
            room_data->checkpoints,
            room_data->checkpoint_count,
            runtime_state
        );
        if (runtime_state.checkpoint_changed) {
            gbs::run_event_script(
                event_state,
                gbs::platformer_checkpoint_event_script_for(*room_data, runtime_state.active_checkpoint_id)
            );
            persist_platformer_runtime_state(current_room, player, runtime_state, camera, event_state);
        }
        gbs::update_platformer_hazards(
            player,
            room_data->hazards,
            room_data->hazard_count,
            runtime_state
        );
        if (runtime_state.hazard_hit) {
            gbs::run_event_script(
                event_state,
                gbs::platformer_hazard_event_script_for(*room_data, runtime_state.hazard_index)
            );
        }
        size_t enemy_hit_index = 0;
        const gbs::PlatformerEnemyContactResult enemy_contact = player.dashing && room_data->config.dash_through >= 1
            ? gbs::PlatformerEnemyContactResult::None
            : gbs::resolve_platformer_enemy_contact(
                player,
                active_enemies,
                active_enemy_count,
                &enemy_hit_index
            );
        if (enemy_contact != gbs::PlatformerEnemyContactResult::None) {
            gbs::run_event_script(
                event_state,
                gbs::platformer_enemy_event_script_for(*room_data, enemy_hit_index)
            );
            if (enemy_contact == gbs::PlatformerEnemyContactResult::HurtActor) {
                runtime_state.damage_taken = static_cast<uint16_t>(runtime_state.damage_taken + active_enemies[enemy_hit_index].damage);
                player.bounds_pixels.x = runtime_state.respawn_position_pixels.x;
                player.bounds_pixels.y = runtime_state.respawn_position_pixels.y;
                player.velocity_x256 = gbs::Vec2i { 0, 0 };
                player.movement_remainder_x256 = gbs::Vec2i { 0, 0 };
            }
        }
        gbs::apply_platformer_camera_zones(
            camera,
            player,
            room_data->camera_zones,
            room_data->camera_zone_count,
            room.width_tiles * 8,
            room.height_tiles * 8,
            &runtime_state,
            room_data->config
        );
        if (runtime_state.camera_zone_active &&
            (!previous_camera_zone_active || previous_camera_zone_index != runtime_state.camera_zone_index)) {
            gbs::run_event_script(
                event_state,
                gbs::platformer_camera_zone_event_script_for(*room_data, runtime_state.camera_zone_index)
            );
        }
        previous_camera_zone_active = runtime_state.camera_zone_active;
        previous_camera_zone_index = runtime_state.camera_zone_index;
        bool room_changed = apply_event_room_change(
            project,
            current_room,
            room_data,
            room,
            player,
            runtime_state,
            camera,
            event_state,
            previous_camera_zone_active,
            previous_camera_zone_index
        );
        if (room_changed) {
            player_event_active = true;
            active_platformer_state = player.on_ground ? 1 : 0;
            ++runtime_room_change_count;
            runtime_blocked_direction_bits = 0;
            if (room_data->trigger_count > max_room_triggers || room_data->npc_count > max_room_npcs) {
                sync_runtime_telemetry(player, room, event_state);
                return gbs::RuntimeAdapterFrameResult::Error;
            }
            for (size_t index = 0; index < max_room_triggers; ++index) {
                trigger_states[index] = gbs::RuntimeTriggerState {};
            }
            gbs::stop_event_runner(platformer_event_runner);
            gbs::clear_event_script_queue(platformer_event_queue);
            platformer_event_wait_frames = 0;
            queue_platformer_script(room_data->on_enter);
            queue_platformer_player_start_script();
            persist_platformer_runtime_state(current_room, player, runtime_state, camera, event_state);
        }
        const gbs::Vec2i player_anchor = gbs::platformer_actor_anchor_position(player);
        event_state.player_x = player_anchor.x;
        event_state.player_y = player_anchor.y;
        event_state.player_direction = player.facing == gbs::PlatformerFacing::Left ? 2 : 3;
        apply_event_camera(camera, event_state);
        consume_event_state(event_state);
        consume_platformer_actor_commands(event_state, player, *room_data, player_event_active);
        consume_platformer_state_request(
            event_state,
            player,
            room_data->config,
            player_event_active,
            active_platformer_state
        );
        gbs::consume_visual_effect_event(event_state, visual_effects);
        for (size_t index = 0; index < platformer_npc_count; ++index) {
            if (platformer_npc_runtimes[index].active && platformer_npc_runtimes[index].visible) {
                gbs::update_sprite_animator_scaled(
                    platformer_npc_animators[index],
                    platformer_npc_runtimes[index].animation_speed_percent
                );
            }
        }
        }
        gbs::update_dialogue(dialogue);
        if (event_state.save_request == 1) {
            const int slot = event_state.save_request_slot;
            persist_platformer_runtime_state(current_room, player, runtime_state, camera, event_state, slot);
            if (slot >= 0 && static_cast<size_t>(slot) < gbastudio_platformer_project::save_bank.slot_count &&
                static_cast<size_t>(slot) < gbs::max_event_save_slots) {
                event_state.save_slot_exists[slot] = gbs::inspect_save_slot(
                    gbastudio_platformer_project::save_bank, static_cast<size_t>(slot)).status == gbs::SaveStatus::Ok;
            }
            event_state.save_request = 0;
            event_state.save_request_slot = -1;
        }
        if (dialogue_was_visible) {
            gbs::advance_dialogue(dialogue, current_input);
        }
        if ((gbs::frame_count() & 31u) == 0) {
            prefetch_room_resource_groups(current_room, gbs::Vec2i { camera.position_pixels.x + 120, camera.position_pixels.y + 80 });
        }

        return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_platformer_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        draw_platformer_room_layers(*room_data, camera, visual_effects);
        gbs::render_visual_effects(visual_effects);
        gbs::hide_all_sprites();
        int next_world_sprite_index = 1;
        const gbs::MetaSprite* player_metasprite = gbs::current_metasprite(player_animator);
        if (!gbs::sync_sprite_animation_tiles(player_animator, player_streamed_tile_asset_loaded)) return;
        if (player_metasprite == nullptr) {
            player_metasprite = project.player_metasprite;
        }
        if (player_event_active && player_metasprite != nullptr && player_metasprite->part_count > 0) {
            const gbs::Vec2i player_anchor = gbs::platformer_actor_anchor_position(player);
            set_platformer_metasprite(
                0,
                *player_metasprite,
                gbs::Vec2i {
                    player_anchor.x - camera.position_pixels.x,
                    player_anchor.y - camera.position_pixels.y
                },
                player.collision_offset_pixels.x * 2 + player.bounds_pixels.width,
                player.facing == gbs::PlatformerFacing::Left,
                gbs::visual_effect_sprite_mosaic_enabled(visual_effects)
            );
            next_world_sprite_index = player_metasprite->part_count;
        } else if (player_event_active && player_metasprite == nullptr) {
            // Keep player physics and camera behavior active without rendering a
            // black tile placeholder when the project intentionally has no player art.
        }
        for (size_t index = 0; index < active_enemy_count; ++index) {
            gbs::set_sprite(static_cast<int>(next_world_sprite_index + index), gbs::Sprite {
                active_enemies[index].bounds_pixels.x - camera.position_pixels.x,
                active_enemies[index].bounds_pixels.y - camera.position_pixels.y,
                active_enemies[index].tile_index,
                active_enemies[index].palette,
                !active_enemies[index].facing_right,
                false,
                active_enemies[index].active,
                0,
                gbs::SpriteRenderMode::Normal,
                gbs::visual_effect_sprite_mosaic_enabled(visual_effects)
            });
        }
        for (size_t index = 0; index < active_moving_platform_count; ++index) {
            gbs::set_sprite(static_cast<int>(next_world_sprite_index + active_enemy_count + index), gbs::Sprite {
                active_moving_platforms[index].bounds_pixels.x - camera.position_pixels.x,
                active_moving_platforms[index].bounds_pixels.y - camera.position_pixels.y,
                active_moving_platforms[index].tile_index,
                active_moving_platforms[index].palette,
                false,
                false,
                active_moving_platforms[index].active,
                0,
                gbs::SpriteRenderMode::Normal,
                gbs::visual_effect_sprite_mosaic_enabled(visual_effects)
            });
        }
        next_world_sprite_index += static_cast<int>(active_enemy_count + active_moving_platform_count);
        for (size_t index = 0; index < platformer_npc_count; ++index) {
            if (!platformer_npc_is_visible_in_camera(platformer_npc_runtimes[index], camera)) {
                continue;
            }
            const gbs::MetaSprite* npc_metasprite = gbs::current_metasprite(platformer_npc_animators[index]);
            if (!gbs::sync_sprite_animation_tiles(platformer_npc_animators[index], npc_streamed_tile_assets_loaded[index])) continue;
            if (npc_metasprite == nullptr) {
                npc_metasprite = platformer_npc_runtimes[index].metasprite;
            }
            if (npc_metasprite == nullptr || !gbs::is_valid_metasprite(*npc_metasprite) ||
                next_world_sprite_index + npc_metasprite->part_count > 128) {
                continue;
            }
            set_platformer_metasprite(
                next_world_sprite_index,
                *npc_metasprite,
                gbs::Vec2i {
                    platformer_npc_runtimes[index].actor.position_pixels.x - camera.position_pixels.x,
                    platformer_npc_runtimes[index].actor.position_pixels.y - camera.position_pixels.y
                },
                platformer_npc_runtimes[index].actor.collision_offset_pixels.x * 2 +
                    platformer_npc_runtimes[index].actor.size_pixels.x,
                platformer_npc_runtimes[index].actor.direction == 2, // Event direction: left.
                gbs::visual_effect_sprite_mosaic_enabled(visual_effects)
            );
            next_world_sprite_index += npc_metasprite->part_count;
        }
        gbs::draw_dialogue(dialogue);
        gbs::draw_menu(pause_menu);
        if (gbs::dialogue_should_show_emote(dialogue)) {
            const gbs::MetaSprite* emote = gbs::dialogue_emote_metasprite(dialogue.emote);
            if (emote != nullptr) {
                gbs::set_metasprite(
                    gbs::dialogue_emote_oam_index,
                    *emote,
                    gbs::dialogue_emote_position_pixels(gbs::Vec2i {
                        player.bounds_pixels.x - camera.position_pixels.x,
                        player.bounds_pixels.y - camera.position_pixels.y
                    })
                );
            }
        }
        if (gbs::dialogue_should_show_portrait(dialogue)) {
            const gbs::MetaSprite* portrait = gbs::dialogue_portrait_metasprite(dialogue.portrait);
            if (portrait != nullptr) {
                gbs::set_metasprite(
                    gbs::dialogue_portrait_oam_index,
                    *portrait,
                    gbs::dialogue_portrait_position_pixels(dialogue)
                );
            }
        }
        // Draw the scene HUD last so dialogue and portrait cleanup cannot mask it.
        gbs::draw_hud(hud);
        gbs::draw_event_clock(event_state);
        gbs::tick_visual_effects(visual_effects);
        sync_runtime_telemetry(player, room, event_state);
        gbs::wait_vblank();
}

void leave_platformer_runtime() {
#ifdef GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_target() == gbs::RuntimeKind::Menu && event_state.scene_stack_count > 0) {
        gbs::UniversalSaveData data {};
        gbs::clear_suspended_runtime_save();
        if (capture_platformer_runtime_state(data, current_room, player, runtime_state, camera, event_state)) gbs::capture_suspended_runtime_save(data);
    }
#endif
    gbs::release_resource_bank_group(resources, bank_reservation);
    gbs::release_resource_bank_cache(resources, bank_cache);
}

extern "C" void GBS_PLATFORMER_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    platformer_initialization_result = initialize_platformer_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_PLATFORMER_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_platformer_runtime(context);
}

extern "C" void GBS_PLATFORMER_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_platformer_runtime(context);
}

extern "C" void GBS_PLATFORMER_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_platformer_runtime();
}

extern "C" int GBS_PLATFORMER_RUNTIME_ENTRY() {
    platformer_initialization_result = initialize_platformer_runtime();
    if (platformer_initialization_result != 0) {
        leave_platformer_runtime();
        return platformer_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::Platformer,
            current_room,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_platformer_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_platformer_runtime();
            return -1;
        }
        render_platformer_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_platformer_runtime();
            return 0;
        }
    }
}
