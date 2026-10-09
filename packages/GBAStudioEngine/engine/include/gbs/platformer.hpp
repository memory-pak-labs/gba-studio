#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/audio.hpp"
#include "gbs/assets.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/topdown.hpp"
#include "gbs/trigger.hpp"
#include "gbs/types.hpp"

namespace gbs {

enum class PlatformerFacing : uint8_t {
    Right = 0,
    Left = 1
};

enum class PlatformerActorAnimationState : uint8_t {
    Idle = 0,
    Run = 1,
    Jump = 2,
    Fall = 3,
    Climb = 4,
    WallSlide = 5,
    Dash = 6,
    Glide = 7
};

struct PlatformerPlayerAnimationSet {
    const SpriteAnimation* idle = nullptr;
    const SpriteAnimation* walk = nullptr;
    const SpriteAnimation* jump = nullptr;
    const SpriteAnimation* fall = nullptr;
    const SpriteAnimation* climb = nullptr;
    const SpriteAnimation* wall_slide = nullptr;
    const SpriteAnimation* dash = nullptr;
    const SpriteAnimation* glide = nullptr;
};

enum class PlatformerEnemyContactResult : uint8_t {
    None = 0,
    HurtActor = 1,
    StompEnemy = 2
};

struct PlatformerConfig {
    int max_run_speed_x256;
    int acceleration_x256;
    int friction_x256;
    int gravity_x256;
    int max_fall_speed_x256;
    int jump_speed_x256;
    int coyote_frames;
    int jump_buffer_frames;
    bool ladders_enabled;
    int max_air_jumps = 0;
    bool wall_jump_enabled = false;
    int wall_slide_speed_x256 = 0x0180;
    int wall_jump_speed_x256 = 0x0500;
    int wall_jump_push_x256 = 0x0300;
    bool dash_enabled = false;
    int dash_speed_x256 = 0x0600;
    int dash_frames = 8;
    bool glide_enabled = false;
    int glide_fall_speed_x256 = 0x0140;
    bool wall_slide_enabled = true;
    int jump_min_height_x256 = 0;
    uint8_t jump_hold_frames = 1;
    int jump_height_reduction_x256 = 0;
    bool air_control_enabled = true;
    bool turn_in_air_enabled = true;
    int air_deceleration_x256 = 0;
    uint8_t drop_through_mode = 0;
    uint8_t camera_follow_directions = 15;
    int camera_deadzone_x_pixels = 0;
    uint8_t camera_lock_edge = 0;
    uint8_t dash_style = 2;
    uint8_t dash_momentum = 0;
    uint8_t dash_through = 0;
    uint8_t dash_recharge_frames = 0;
    uint8_t platform_actor_collision_group = 0;
    uint8_t solid_actor_collision_group = 0;
    bool actor_gravity_enabled = false;
};

constexpr PlatformerConfig default_platformer_config() {
    return PlatformerConfig {
        0x0180,
        0x0040,
        0x0030,
        0x0030,
        0x0400,
        0x0580,
        4,
        5,
        true,
        0,
        false,
        0x0180,
        0x0500,
        0x0300,
        false,
        0x0600,
        8,
        false,
        0x0140,
        true,
        0,
        1,
        0,
        true,
        true,
        0,
        0,
        15,
        0,
        0,
        2,
        0,
        0,
        0,
        0,
        0,
        false
    };
}

struct PlatformerActor {
    Rect bounds_pixels;
    Vec2i velocity_x256;
    PlatformerFacing facing;
    bool on_ground;
    bool on_ladder;
    bool hit_ceiling;
    bool hit_wall;
    uint8_t coyote_timer;
    uint8_t jump_buffer_timer;
    Vec2i movement_remainder_x256 { 0, 0 };
    Vec2i collision_offset_pixels { 0, 0 };
    uint8_t air_jumps_used = 0;
    uint8_t dash_timer = 0;
    bool dash_available = true;
    bool wall_sliding = false;
    bool dashing = false;
    bool gliding = false;
    uint8_t jump_hold_timer = 0;
    uint8_t dash_recharge_timer = 0;
    uint8_t drop_through_timer = 0;
};

struct PlatformerRoom {
    const uint16_t* visual_tiles;
    TileMap collision;
    int width_tiles;
    int height_tiles;
};

struct PlatformerHazard {
    Rect area_pixels;
    uint8_t damage;
    bool respawn;
};

struct PlatformerCheckpoint {
    Rect area_pixels;
    Vec2i respawn_position_pixels;
    uint16_t id;
};

struct PlatformerCameraZone {
    Rect area_pixels;
    Rect bounds_pixels;
    Vec2i offset_pixels;
    bool lock_x;
    bool lock_y;
};

struct PlatformerEnemy {
    Rect bounds_pixels;
    Rect patrol_bounds_pixels;
    Vec2i velocity_x256;
    bool active;
    bool facing_right;
    uint16_t damage;
    uint16_t script_index;
    uint16_t tile_index = 0;
    uint8_t palette = 0;
};

struct PlatformerMovingPlatform {
    Rect bounds_pixels;
    Vec2i start_pixels;
    Vec2i end_pixels;
    Vec2i velocity_x256;
    bool active;
    bool forward;
    uint16_t flags;
    uint16_t script_index;
    uint16_t tile_index = 0;
    uint8_t palette = 0;
};

struct PlatformerNpcData {
    Vec2i position_pixels;
    Vec2i size_pixels;
    const MetaSprite* metasprite;
    const SpriteAnimation* animation;
    EventScript on_interact;
    const char* name = nullptr;
    PlatformerFacing facing = PlatformerFacing::Right;
    int animation_speed_percent = 100;
    EventScript on_start = empty_event_script();
    EventScript on_update = empty_event_script();
    const SpriteAnimation* const* animations = nullptr;
    size_t animation_count = 0;
    Vec2i collision_offset_pixels = Vec2i { 0, 0 };
    uint8_t collision_group = 0;
};

struct PlatformerNpcRuntime {
    Actor actor;
    const MetaSprite* metasprite;
    const SpriteAnimation* animation;
    bool visible;
    bool active;
    int animation_index;
    int animation_speed_percent;
    bool animation_frame_changed;
    int animation_frame_index;
    uint8_t collision_group = 0;
};

struct PlatformerHazardEventData {
    size_t hazard_index;
    EventScript script;
};

struct PlatformerCheckpointEventData {
    uint16_t checkpoint_id;
    EventScript script;
};

struct PlatformerCameraZoneEventData {
    size_t camera_zone_index;
    EventScript script;
};

struct PlatformerEnemyEventData {
    size_t enemy_index;
    EventScript script;
};

struct PlatformerMovingPlatformEventData {
    size_t platform_index;
    EventScript script;
};

struct PlatformerRoomData {
    const uint16_t* visual_tiles;
    const uint8_t* collision_flags;
    const TileSlope* collision_slopes;
    int width_tiles;
    int height_tiles;
    Rect player_start;
    Camera camera_start;
    PlatformerConfig config;
    const PlatformerHazard* hazards = nullptr;
    size_t hazard_count = 0;
    const PlatformerCheckpoint* checkpoints = nullptr;
    size_t checkpoint_count = 0;
    const PlatformerCameraZone* camera_zones = nullptr;
    size_t camera_zone_count = 0;
    const char* name = nullptr;
    EventScript on_enter = empty_event_script();
    EventScript on_exit = empty_event_script();
    EventScript on_update = empty_event_script();
    const PlatformerHazardEventData* hazard_events = nullptr;
    size_t hazard_event_count = 0;
    const PlatformerCheckpointEventData* checkpoint_events = nullptr;
    size_t checkpoint_event_count = 0;
    const PlatformerCameraZoneEventData* camera_zone_events = nullptr;
    size_t camera_zone_event_count = 0;
    const char* resource_bank_group_name = nullptr;
    const PlatformerEnemy* enemies = nullptr;
    size_t enemy_count = 0;
    const PlatformerMovingPlatform* moving_platforms = nullptr;
    size_t moving_platform_count = 0;
    const PlatformerEnemyEventData* enemy_events = nullptr;
    size_t enemy_event_count = 0;
    const PlatformerMovingPlatformEventData* moving_platform_events = nullptr;
    size_t moving_platform_event_count = 0;
    const RuntimeTriggerData* triggers = nullptr;
    size_t trigger_count = 0;
    const PlatformerNpcData* npcs = nullptr;
    size_t npc_count = 0;
    Vec2i player_collision_offset_pixels = Vec2i { 0, 0 };
    const uint16_t* bg3_tiles = nullptr;
    const uint16_t* bg2_tiles = nullptr;
    const uint16_t* bg1_tiles = nullptr;
    Vec2i bg3_parallax_x256 = Vec2i { 256, 256 };
    VideoComposition video = default_video_composition();
    EventScript on_hit_group1 = empty_event_script();
    EventScript on_hit_group2 = empty_event_script();
    EventScript on_hit_group3 = empty_event_script();
};

struct PlatformerProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const PaletteAsset* obj_palettes;
    size_t obj_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const PlatformerRoomData* rooms;
    size_t room_count;
    int initial_room;
    uint16_t backdrop_color;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
    const DialogueLine* dialogue_lines = nullptr;
    size_t dialogue_line_count = 0;
    const SfxAsset* sfx_assets = nullptr;
    size_t sfx_asset_count = 0;
    const MusicAsset* music_assets = nullptr;
    size_t music_asset_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    DialogueUiConfig dialogue_ui = default_dialogue_ui_config();
    const MetaSprite* player_metasprite = nullptr;
    PlatformerPlayerAnimationSet player_animations {};
    EventScript player_on_start = empty_event_script();
    EventScript player_on_update = empty_event_script();
};

struct PlatformerRuntimeState {
    Vec2i respawn_position_pixels;
    uint16_t active_checkpoint_id;
    uint16_t damage_taken;
    bool hazard_hit;
    bool checkpoint_changed;
    bool camera_zone_active;
    size_t camera_zone_index;
    size_t hazard_index;
};

constexpr PlatformerNpcRuntime platformer_npc_runtime_from_data(const PlatformerNpcData& npc) {
    return PlatformerNpcRuntime {
        Actor {
            npc.position_pixels,
            npc.size_pixels,
            0,
            static_cast<uint8_t>(npc.facing == PlatformerFacing::Left ? 2 : 3),
            0,
            0xFFFFu,
            npc.collision_offset_pixels
        },
        npc.metasprite,
        npc.animation,
        true,
        true,
        0,
        npc.animation_speed_percent,
        false,
        0,
        npc.collision_group
    };
}

constexpr const SpriteAnimation* platformer_npc_animation_for_index(const PlatformerNpcData& npc, int animation_index) {
    if (npc.animations == nullptr || animation_index < 0 || static_cast<size_t>(animation_index) >= npc.animation_count) {
        return npc.animation;
    }
    return npc.animations[animation_index];
}

constexpr Rect platformer_npc_actor_rect(const PlatformerNpcRuntime& npc) {
    return Rect {
        npc.actor.position_pixels.x + npc.actor.collision_offset_pixels.x,
        npc.actor.position_pixels.y + npc.actor.collision_offset_pixels.y,
        npc.actor.size_pixels.x,
        npc.actor.size_pixels.y
    };
}

constexpr bool platformer_actor_intersects_npcs(
    Rect actor_bounds,
    const PlatformerNpcRuntime* npcs,
    size_t npc_count
) {
    if (npcs == nullptr) {
        return false;
    }
    for (size_t index = 0; index < npc_count; ++index) {
        if (npcs[index].active && npcs[index].visible && npcs[index].actor.collision_mask != 0 &&
            intersects(actor_bounds, platformer_npc_actor_rect(npcs[index]))) {
            return true;
        }
    }
    return false;
}

constexpr bool platformer_actor_intersects_npc(
    Rect actor_bounds,
    const PlatformerNpcRuntime& npc
) {
    return npc.active && npc.visible && npc.actor.collision_mask != 0 &&
        intersects(actor_bounds, platformer_npc_actor_rect(npc));
}

constexpr EventScript platformer_room_hit_script_for_collision_group(
    const PlatformerRoomData& room,
    uint8_t collision_group
) {
    switch (collision_group) {
    case 1:
        return room.on_hit_group1;
    case 2:
        return room.on_hit_group2;
    case 3:
        return room.on_hit_group3;
    default:
        return empty_event_script();
    }
}

constexpr EventScript platformer_npc_interaction_script_for(
    const PlatformerRoomData& room,
    const PlatformerNpcRuntime* npcs,
    size_t npc_count,
    Rect player_bounds
) {
    if (room.npcs == nullptr || npcs == nullptr) {
        return empty_event_script();
    }
    const size_t count = room.npc_count < npc_count ? room.npc_count : npc_count;
    for (size_t index = 0; index < count; ++index) {
        if (npcs[index].active && npcs[index].visible && intersects(player_bounds, platformer_npc_actor_rect(npcs[index]))) {
            return room.npcs[index].on_interact;
        }
    }
    return empty_event_script();
}

constexpr int clamp_platformer_npc_animation_speed_percent(int speed_percent) {
    return speed_percent < 1 ? 1 : (speed_percent > 400 ? 400 : speed_percent);
}

constexpr bool platformer_npc_event_command_targets_runtime(size_t npc_count, const EventActorCommand& command) {
    return command.op != EventActorOp::None && command.actor_index >= 0 && static_cast<size_t>(command.actor_index) < npc_count;
}

constexpr void apply_platformer_npc_event_command(
    PlatformerNpcRuntime* npcs,
    size_t npc_count,
    const EventActorCommand& command
) {
    if (npcs == nullptr || !platformer_npc_event_command_targets_runtime(npc_count, command)) {
        return;
    }
    PlatformerNpcRuntime& runtime = npcs[command.actor_index];
    switch (command.op) {
    case EventActorOp::None:
        break;
    case EventActorOp::SetVisible:
        runtime.visible = command.a != 0;
        break;
    case EventActorOp::SetActive:
        runtime.active = command.a != 0;
        break;
    case EventActorOp::SetPosition:
        runtime.actor.position_pixels = Vec2i { command.a, command.b };
        break;
    case EventActorOp::MoveRelative:
        runtime.actor.position_pixels.x += command.a;
        runtime.actor.position_pixels.y += command.b;
        break;
    case EventActorOp::SetDirection:
        runtime.actor.direction = static_cast<uint8_t>(command.a);
        break;
    case EventActorOp::SetSpeed:
        runtime.actor.speed_pixels = command.a;
        break;
    case EventActorOp::SetAnimation:
        runtime.animation_index = command.a;
        break;
    case EventActorOp::SetAnimationSpeed:
        runtime.animation_speed_percent = clamp_platformer_npc_animation_speed_percent(command.a);
        break;
    case EventActorOp::SetAnimationFrame:
        runtime.animation_frame_changed = true;
        runtime.animation_frame_index = command.a < 0 ? 0 : command.a;
        break;
    case EventActorOp::SetCollisionEnabled:
        runtime.actor.collision_mask = command.a != 0 ? 0xFFFFu : 0;
        break;
    case EventActorOp::SetCollisionBox:
        runtime.actor.collision_offset_pixels = Vec2i { command.a, command.b };
        runtime.actor.size_pixels = Vec2i { command.c, command.d };
        break;
    case EventActorOp::SetSprite:
    case EventActorOp::PushFacing:
    case EventActorOp::Push:
    case EventActorOp::CancelMovement: // Export currently restricts cancellation to topdown.
        break;
    }
}

inline size_t consume_actor_event_commands(
    PlatformerNpcRuntime* npcs,
    size_t npc_count,
    EventState& state
) {
    size_t applied_count = 0;
    for (size_t index = 0; index < state.actor_command_count; ++index) {
        if (platformer_npc_event_command_targets_runtime(npc_count, state.actor_commands[index])) {
            ++applied_count;
        }
        apply_platformer_npc_event_command(npcs, npc_count, state.actor_commands[index]);
    }
    reset_event_actor_commands(state);
    return applied_count;
}

struct PlatformerSaveData {
    uint16_t room_index;
    int32_t player_x;
    int32_t player_y;
    int32_t velocity_x256;
    int32_t velocity_y256;
    int32_t respawn_x;
    int32_t respawn_y;
    uint16_t active_checkpoint_id;
    uint16_t damage_taken;
    uint16_t actor_flags;
    uint8_t coyote_timer;
    uint8_t jump_buffer_timer;
    int32_t camera_x;
    int32_t camera_y;
    uint8_t camera_follow_player;
    int32_t variables[event_variable_count];
    uint32_t play_time_frames;
    uint16_t flags;
};

constexpr PlatformerRoom platformer_room_from_tilemap(const uint16_t* visual_tiles, TileMap collision) {
    return PlatformerRoom { visual_tiles, collision, collision.width, collision.height };
}

constexpr TileMap platformer_collision_map_from_room(const PlatformerRoomData& room) {
    return TileMap { room.collision_flags, room.width_tiles, room.height_tiles, room.collision_slopes };
}

constexpr PlatformerRoom platformer_room_from_data(const PlatformerRoomData& room) {
    return PlatformerRoom {
        room.visual_tiles,
        platformer_collision_map_from_room(room),
        room.width_tiles,
        room.height_tiles
    };
}

constexpr bool is_valid_platformer_room_index(const PlatformerProjectData& project, int room_index) {
    return project.rooms != nullptr &&
        room_index >= 0 &&
        static_cast<size_t>(room_index) < project.room_count;
}

constexpr bool is_valid_platformer_project_script_index(const PlatformerProjectData& project, int script_index) {
    return project.scripts != nullptr &&
        script_index >= 0 &&
        static_cast<size_t>(script_index) < project.script_count;
}

constexpr bool is_valid_platformer_dialogue_line_index(const PlatformerProjectData& project, int line_index) {
    return line_index < 0 ||
        (project.dialogue_lines != nullptr &&
            static_cast<size_t>(line_index) < project.dialogue_line_count &&
            project.dialogue_lines[line_index].text != nullptr);
}

constexpr bool is_valid_platformer_resource_banks(const PlatformerProjectData& project) {
    if (project.resource_bank_count == 0) {
        return true;
    }
    if (project.resource_banks == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.resource_bank_count; ++index) {
        if (!is_valid_resource_bank(project.resource_banks[index])) {
            return false;
        }
    }
    return true;
}

constexpr bool is_valid_platformer_resource_bank_groups(const PlatformerProjectData& project) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    if (project.resource_bank_groups == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.resource_bank_group_count; ++index) {
        if (!is_valid_resource_bank_group(project.resource_bank_groups[index])) {
            return false;
        }
    }
    return true;
}

constexpr ResourceBankBatch resource_bank_batch_from_platformer_project(const PlatformerProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_platformer_project(const PlatformerProjectData& project, size_t group_index) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_platformer_resource_bank_group_index(const PlatformerProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr ResourceBankGroup resource_bank_group_from_platformer_project(const PlatformerProjectData& project, const char* name) {
    return resource_bank_group_by_name(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr const char* resource_bank_group_name_for_platformer_room(const PlatformerRoomData& room) {
    return room.resource_bank_group_name != nullptr ? room.resource_bank_group_name : room.name;
}

constexpr int find_platformer_room_resource_bank_group_index(const PlatformerProjectData& project, const PlatformerRoomData& room) {
    return find_platformer_resource_bank_group_index(project, resource_bank_group_name_for_platformer_room(room));
}

constexpr ResourceBankGroup resource_bank_group_from_platformer_room(const PlatformerProjectData& project, const PlatformerRoomData& room) {
    return resource_bank_group_from_platformer_project(project, resource_bank_group_name_for_platformer_room(room));
}

constexpr bool is_valid_platformer_project_data(const PlatformerProjectData& project) {
    return project.rooms != nullptr &&
        project.room_count > 0 &&
        is_valid_platformer_room_index(project, project.initial_room) &&
        is_valid_platformer_resource_banks(project) &&
        is_valid_platformer_resource_bank_groups(project) &&
        (project.dialogue_line_count == 0 || project.dialogue_lines != nullptr);
}

constexpr bool is_valid_platformer_save_data(const PlatformerProjectData& project, const PlatformerSaveData& save_data) {
    return is_valid_platformer_room_index(project, save_data.room_index);
}

inline void capture_platformer_save_data(
    PlatformerSaveData& save_data,
    int room_index,
    const PlatformerActor& actor,
    const PlatformerRuntimeState& runtime_state,
    const Camera& camera,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    save_data.room_index = static_cast<uint16_t>(room_index < 0 ? 0 : room_index);
    save_data.player_x = actor.bounds_pixels.x;
    save_data.player_y = actor.bounds_pixels.y;
    save_data.velocity_x256 = actor.velocity_x256.x;
    save_data.velocity_y256 = actor.velocity_x256.y;
    save_data.respawn_x = runtime_state.respawn_position_pixels.x;
    save_data.respawn_y = runtime_state.respawn_position_pixels.y;
    save_data.active_checkpoint_id = runtime_state.active_checkpoint_id;
    save_data.damage_taken = runtime_state.damage_taken;
    save_data.actor_flags = 0;
    save_data.actor_flags |= actor.facing == PlatformerFacing::Left ? 1u : 0u;
    save_data.actor_flags |= actor.on_ground ? 2u : 0u;
    save_data.actor_flags |= actor.on_ladder ? 4u : 0u;
    save_data.coyote_timer = actor.coyote_timer;
    save_data.jump_buffer_timer = actor.jump_buffer_timer;
    save_data.camera_x = camera.position_pixels.x;
    save_data.camera_y = camera.position_pixels.y;
    save_data.camera_follow_player = static_cast<uint8_t>(camera.follow_player ? 1 : 0);
    for (size_t index = 0; index < event_variable_count; ++index) {
        save_data.variables[index] = event_state.variables[index];
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
}

inline bool apply_platformer_save_data(
    const PlatformerProjectData& project,
    const PlatformerSaveData& save_data,
    PlatformerActor& actor,
    PlatformerRuntimeState& runtime_state,
    Camera& camera,
    EventState& event_state
) {
    if (!is_valid_platformer_save_data(project, save_data)) {
        return false;
    }
    actor.bounds_pixels.x = save_data.player_x;
    actor.bounds_pixels.y = save_data.player_y;
    actor.velocity_x256.x = save_data.velocity_x256;
    actor.velocity_x256.y = save_data.velocity_y256;
    actor.movement_remainder_x256 = Vec2i { 0, 0 };
    actor.facing = (save_data.actor_flags & 1u) != 0 ? PlatformerFacing::Left : PlatformerFacing::Right;
    actor.on_ground = (save_data.actor_flags & 2u) != 0;
    actor.on_ladder = (save_data.actor_flags & 4u) != 0;
    actor.coyote_timer = save_data.coyote_timer;
    actor.jump_buffer_timer = save_data.jump_buffer_timer;
    runtime_state.respawn_position_pixels = Vec2i { save_data.respawn_x, save_data.respawn_y };
    runtime_state.active_checkpoint_id = save_data.active_checkpoint_id;
    runtime_state.damage_taken = save_data.damage_taken;
    runtime_state.hazard_hit = false;
    runtime_state.checkpoint_changed = false;
    runtime_state.camera_zone_active = false;
    runtime_state.camera_zone_index = 0;
    runtime_state.hazard_index = 0;
    camera.position_pixels = Vec2i { save_data.camera_x, save_data.camera_y };
    camera.follow_player = save_data.camera_follow_player != 0;
    event_state.current_room = save_data.room_index;
    event_state.player_x = save_data.player_x;
    event_state.player_y = save_data.player_y;
    for (size_t index = 0; index < event_variable_count; ++index) {
        event_state.variables[index] = save_data.variables[index];
    }
    return true;
}

constexpr EventScript platformer_hazard_event_script_for(const PlatformerRoomData& room, size_t hazard_index) {
    if (room.hazard_events == nullptr) {
        return empty_event_script();
    }
    for (size_t index = 0; index < room.hazard_event_count; ++index) {
        if (room.hazard_events[index].hazard_index == hazard_index) {
            return room.hazard_events[index].script;
        }
    }
    return empty_event_script();
}

constexpr EventScript platformer_checkpoint_event_script_for(const PlatformerRoomData& room, uint16_t checkpoint_id) {
    if (room.checkpoint_events == nullptr) {
        return empty_event_script();
    }
    for (size_t index = 0; index < room.checkpoint_event_count; ++index) {
        if (room.checkpoint_events[index].checkpoint_id == checkpoint_id) {
            return room.checkpoint_events[index].script;
        }
    }
    return empty_event_script();
}

constexpr EventScript platformer_camera_zone_event_script_for(const PlatformerRoomData& room, size_t camera_zone_index) {
    if (room.camera_zone_events == nullptr) {
        return empty_event_script();
    }
    for (size_t index = 0; index < room.camera_zone_event_count; ++index) {
        if (room.camera_zone_events[index].camera_zone_index == camera_zone_index) {
            return room.camera_zone_events[index].script;
        }
    }
    return empty_event_script();
}

constexpr EventScript platformer_enemy_event_script_for(const PlatformerRoomData& room, size_t enemy_index) {
    if (room.enemy_events == nullptr) {
        return empty_event_script();
    }
    for (size_t index = 0; index < room.enemy_event_count; ++index) {
        if (room.enemy_events[index].enemy_index == enemy_index) {
            return room.enemy_events[index].script;
        }
    }
    return empty_event_script();
}

constexpr EventScript platformer_moving_platform_event_script_for(const PlatformerRoomData& room, size_t platform_index) {
    if (room.moving_platform_events == nullptr) {
        return empty_event_script();
    }
    for (size_t index = 0; index < room.moving_platform_event_count; ++index) {
        if (room.moving_platform_events[index].platform_index == platform_index) {
            return room.moving_platform_events[index].script;
        }
    }
    return empty_event_script();
}

PlatformerActor platformer_actor_from_rect(Rect anchor_bounds_pixels, Vec2i collision_offset_pixels = Vec2i { 0, 0 });
PlatformerRuntimeState platformer_state_from_spawn(Vec2i respawn_position_pixels, uint16_t checkpoint_id = 0);
Rect platformer_actor_rect(const PlatformerActor& actor);
Vec2i platformer_actor_anchor_position(const PlatformerActor& actor);
void set_platformer_actor_anchor_position(PlatformerActor& actor, Vec2i anchor_position_pixels);
bool platformer_actor_on_ladder(const TileMap& map, const PlatformerActor& actor);
bool platformer_actor_on_ground(const TileMap& map, const PlatformerActor& actor);
bool platformer_slope_floor_y_at(const TileMap& map, int pixel_x, int tile_y, int* floor_y);
bool snap_platformer_actor_to_slope_floor(const TileMap& map, PlatformerActor& actor, int max_snap_pixels = 4);
PlatformerActorAnimationState platformer_actor_animation_state(const PlatformerActor& actor, int run_threshold_x256 = 0x0080);
const SpriteAnimation* platformer_player_animation_for_state(
    const PlatformerPlayerAnimationSet& animations,
    PlatformerActorAnimationState state
);
void update_platformer_actor(const TileMap& map, PlatformerActor& actor, InputState input, const PlatformerConfig& config = default_platformer_config());
void update_platformer_blank_actor(const TileMap& map, PlatformerActor& actor, int gravity_subpixels, int max_fall_speed_x256);
void update_platformer_camera(Camera& camera, const PlatformerActor& actor, int room_width_pixels, int room_height_pixels);
void update_platformer_camera(Camera& camera, const PlatformerActor& actor, int room_width_pixels, int room_height_pixels, const PlatformerConfig& config);
bool platformer_actor_hits_hazard(const PlatformerActor& actor, const PlatformerHazard* hazards, size_t hazard_count, size_t* hazard_index = nullptr);
bool update_platformer_checkpoints(PlatformerActor& actor, const PlatformerCheckpoint* checkpoints, size_t checkpoint_count, PlatformerRuntimeState& state);
bool update_platformer_hazards(PlatformerActor& actor, const PlatformerHazard* hazards, size_t hazard_count, PlatformerRuntimeState& state);
bool apply_platformer_camera_zones(Camera& camera, const PlatformerActor& actor, const PlatformerCameraZone* zones, size_t zone_count, int room_width_pixels, int room_height_pixels, PlatformerRuntimeState* state = nullptr);
bool apply_platformer_camera_zones(Camera& camera, const PlatformerActor& actor, const PlatformerCameraZone* zones, size_t zone_count, int room_width_pixels, int room_height_pixels, PlatformerRuntimeState* state, const PlatformerConfig& config);
bool platformer_actor_hits_enemy(const PlatformerActor& actor, const PlatformerEnemy* enemies, size_t enemy_count, size_t* enemy_index = nullptr);
PlatformerEnemyContactResult resolve_platformer_enemy_contact(PlatformerActor& actor, PlatformerEnemy* enemies, size_t enemy_count, size_t* enemy_index = nullptr, int stomp_bounce_speed_x256 = 0x0300, int stomp_tolerance_pixels = 6);
bool update_platformer_enemy(PlatformerEnemy& enemy);
bool update_platformer_enemy_patrol(PlatformerEnemy& enemy, const TileMap& map, bool turn_at_ledge = true);
Vec2i update_platformer_moving_platform(PlatformerMovingPlatform& platform);
bool platformer_actor_stands_on_platform(const PlatformerActor& actor, const PlatformerMovingPlatform& platform);
bool snap_platformer_actor_to_moving_platforms(PlatformerActor& actor, const PlatformerMovingPlatform* platforms, size_t platform_count, size_t* platform_index = nullptr, int max_snap_pixels = 4);
bool snap_platformer_actor_to_npcs(PlatformerActor& actor, Rect previous_bounds, const PlatformerNpcRuntime* npcs, size_t npc_count, uint8_t platform_group);
bool apply_platformer_moving_platform_delta(PlatformerActor& actor, const PlatformerMovingPlatform& platform, Vec2i delta_pixels);

} // namespace gbs
