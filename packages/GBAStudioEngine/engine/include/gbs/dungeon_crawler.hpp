#pragma once

#include <stddef.h>
#include <stdint.h>

#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/assets.hpp"
#include "gbs/audio.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/save.hpp"
#include "gbs/trigger.hpp"
#include "gbs/types.hpp"

namespace gbs {

enum class DungeonDirection : uint8_t {
    North = 0,
    East = 1,
    South = 2,
    West = 3
};

struct DungeonCrawlerConfig {
    uint8_t step_duration_frames;
    uint8_t turn_duration_frames;
    bool allow_backstep;
    uint8_t view_distance;
};

struct DungeonCrawlerBackgroundData {
    BackgroundLayer layer;
    TileMapAsset tilemap;
    uint16_t backdrop_color = 0;
};

enum class DungeonDepthVariant : uint8_t {
    Far = 0,
    Mid = 1,
    Near = 2,
};

struct DungeonCrawlerDepthSprites {
    const MetaSprite* far;
    const MetaSprite* mid;
    const MetaSprite* near;
};

struct DungeonCrawlerActorData {
    const char* name;
    Vec2i position;
    const MetaSprite* metasprite;
    EventScript on_interact = empty_event_script();
    const DungeonCrawlerDepthSprites* depth_sprites = nullptr;
};

struct DungeonCrawlerRoomData {
    const char* name;
    const uint8_t* collision_flags;
    int width_tiles;
    int height_tiles;
    DungeonCrawlerConfig config;
    Vec2i player_start;
    DungeonDirection player_direction;
    EventScript on_enter = empty_event_script();
    int background_index = -1;
    const RuntimeTriggerData* triggers = nullptr;
    size_t trigger_count = 0;
    const DungeonCrawlerActorData* actors = nullptr;
    size_t actor_count = 0;
    const char* resource_bank_group_name = nullptr;
    bool battle_enabled = false;
    VideoComposition video = default_video_composition();
};

struct DungeonCrawlerInventoryItemData {
    const char* label;
    int item_index;
    int initial_quantity;
    int heal_amount;
};

struct DungeonCrawlerBattleData {
    const char* enemy_name;
    int enemy_actor_index;
    int max_hp;
    int player_damage;
    int enemy_damage;
    int reward_item;
    int reward_quantity;
};

struct DungeonCrawlerBattleState {
    bool active;
    int enemy_hp;
    int player_hp;
};

struct DungeonCrawlerProjectData {
    const DungeonCrawlerRoomData* rooms;
    size_t room_count;
    int initial_room;
    const DialogueLine* dialogue_lines = nullptr;
    size_t dialogue_line_count = 0;
    const PaletteAsset* bg_palettes = nullptr;
    size_t bg_palette_count = 0;
    const PaletteAsset* obj_palettes = nullptr;
    size_t obj_palette_count = 0;
    const TileAsset* tile_assets = nullptr;
    size_t tile_asset_count = 0;
    const DungeonCrawlerBackgroundData* backgrounds = nullptr;
    size_t background_count = 0;
    const SfxAsset* sfx_assets = nullptr;
    size_t sfx_asset_count = 0;
    const MusicAsset* music_assets = nullptr;
    size_t music_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
    const ResourceBankUploadSource* resource_bank_upload_sources = nullptr;
    size_t resource_bank_upload_source_count = 0;
    bool inventory_enabled = true;
    bool battle_enabled = true;
    bool depth_sprites_enabled = true;
    const DungeonCrawlerInventoryItemData* inventory_items = nullptr;
    size_t inventory_item_count = 0;
    DungeonCrawlerBattleData battle { nullptr, -1, 0, 0, 0, -1, 0 };
    bool compass_enabled = false;
    bool map_enabled = false;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
};

constexpr size_t dungeon_exploration_cell_capacity = 1024;
constexpr size_t dungeon_exploration_byte_capacity = dungeon_exploration_cell_capacity / 8;

struct DungeonCrawlerRuntimeState {
    Vec2i position;
    DungeonDirection direction;
    uint8_t action_frames_remaining;
    uint8_t explored_cells[dungeon_exploration_byte_capacity];
};

constexpr size_t dungeon_actor_visibility_capacity = 128;

struct DungeonCrawlerPersistentState {
    uint8_t hidden_actor_bits[dungeon_actor_visibility_capacity / 8] {};
    int exploration_player_hp = 3;
    DungeonCrawlerBattleState battle_state {};
    bool enemy_defeated = false;
};

struct DungeonCrawlerSavePayload {
    DungeonCrawlerRuntimeState runtime_state;
    DungeonCrawlerPersistentState persistent;
};

struct DungeonViewCell {
    Vec2i position;
    int distance;
    int lateral;
    bool blocked;
};

struct DungeonActorProjection {
    int x;
    int y;
};

constexpr DungeonDepthVariant dungeon_depth_variant_for_distance(int distance, int view_distance) {
    if (distance <= 1) {
        return DungeonDepthVariant::Near;
    }
    if (distance >= (view_distance > 2 ? view_distance - 1 : 2)) {
        return DungeonDepthVariant::Far;
    }
    return DungeonDepthVariant::Mid;
}

constexpr const MetaSprite* dungeon_depth_metasprite(
    const DungeonCrawlerActorData& actor,
    int distance,
    int view_distance
) {
    if (actor.depth_sprites == nullptr) {
        return actor.metasprite;
    }
    switch (dungeon_depth_variant_for_distance(distance, view_distance)) {
    case DungeonDepthVariant::Far:
        return actor.depth_sprites->far != nullptr ? actor.depth_sprites->far : actor.metasprite;
    case DungeonDepthVariant::Mid:
        return actor.depth_sprites->mid != nullptr ? actor.depth_sprites->mid : actor.metasprite;
    case DungeonDepthVariant::Near:
        return actor.depth_sprites->near != nullptr ? actor.depth_sprites->near : actor.metasprite;
    }
    return actor.metasprite;
}

constexpr const MetaSprite* dungeon_runtime_metasprite(
    const DungeonCrawlerProjectData& project,
    const DungeonCrawlerActorData& actor,
    int distance,
    int view_distance
) {
    return project.depth_sprites_enabled
        ? dungeon_depth_metasprite(actor, distance, view_distance)
        : actor.metasprite;
}

constexpr bool dungeon_actor_is_visible_in_view(int distance, int lateral, int view_distance) {
    return distance > 0 && distance <= view_distance && lateral >= -1 && lateral <= 1;
}

constexpr DungeonActorProjection dungeon_project_actor(int distance, int lateral) {
    // Dungeon depth sprites are authored as 64x64 OBJ frames. The renderer
    // receives the frame's top-left position, while the authored projection
    // is centered on the 240px viewport. Keep the actor's feet two 8px tiles
    // above the default dialogue box at y=112px.
    constexpr int viewport_center_x = 120;
    constexpr int depth_sprite_size = 64;
    constexpr int dialogue_top_y = 14 * 8;
    constexpr int dialogue_clearance = 2 * 8;
    constexpr int actor_floor_y = dialogue_top_y - dialogue_clearance;
    constexpr int actor_projection_y = actor_floor_y - depth_sprite_size;
    const int lateral_span = distance <= 1
        ? 48
        : distance == 2
            ? 38
            : distance == 3
                ? 30
                : 22;
    return DungeonActorProjection {
        viewport_center_x - depth_sprite_size / 2 + lateral * lateral_span,
        actor_projection_y - (distance - 1) * 8,
    };
}

constexpr bool is_valid_dungeon_direction(DungeonDirection direction) {
    return static_cast<uint8_t>(direction) <= static_cast<uint8_t>(DungeonDirection::West);
}

constexpr char dungeon_direction_glyph(DungeonDirection direction) {
    switch (direction) {
    case DungeonDirection::North:
        return 'N';
    case DungeonDirection::East:
        return 'E';
    case DungeonDirection::South:
        return 'S';
    case DungeonDirection::West:
        return 'W';
    }
    return '?';
}

constexpr bool dungeon_position_in_bounds(const DungeonCrawlerRoomData& room, Vec2i position) {
    return position.x >= 0 && position.y >= 0 &&
        position.x < room.width_tiles && position.y < room.height_tiles;
}

constexpr bool dungeon_cell_blocked(const DungeonCrawlerRoomData& room, Vec2i position) {
    return !dungeon_position_in_bounds(room, position) || room.collision_flags == nullptr ||
        room.collision_flags[position.y * room.width_tiles + position.x] != 0;
}

inline size_t dungeon_exploration_cell_index(const DungeonCrawlerRoomData& room, Vec2i position) {
    if (!dungeon_position_in_bounds(room, position)) {
        return dungeon_exploration_cell_capacity;
    }
    const size_t index = static_cast<size_t>(position.y) * static_cast<size_t>(room.width_tiles) +
        static_cast<size_t>(position.x);
    return index < dungeon_exploration_cell_capacity ? index : dungeon_exploration_cell_capacity;
}

inline bool dungeon_exploration_is_marked(
    const DungeonCrawlerRuntimeState& state,
    const DungeonCrawlerRoomData& room,
    Vec2i position
) {
    const size_t index = dungeon_exploration_cell_index(room, position);
    return index < dungeon_exploration_cell_capacity &&
        (state.explored_cells[index / 8] & static_cast<uint8_t>(1u << (index % 8))) != 0;
}

inline bool dungeon_exploration_mark(
    DungeonCrawlerRuntimeState& state,
    const DungeonCrawlerRoomData& room,
    Vec2i position
) {
    const size_t index = dungeon_exploration_cell_index(room, position);
    if (index >= dungeon_exploration_cell_capacity) {
        return false;
    }
    state.explored_cells[index / 8] |= static_cast<uint8_t>(1u << (index % 8));
    return true;
}

constexpr bool is_valid_dungeon_crawler_config(const DungeonCrawlerConfig& config) {
    return config.step_duration_frames > 0 && config.turn_duration_frames > 0 &&
        config.view_distance > 0 && config.view_distance <= 16;
}

constexpr bool is_valid_dungeon_crawler_inventory_item(
    const DungeonCrawlerInventoryItemData& item
) {
    return item.label != nullptr && is_valid_inventory_item_index(item.item_index) &&
        item.initial_quantity >= 0 && item.heal_amount >= 0;
}

constexpr bool is_valid_dungeon_crawler_battle_data(
    const DungeonCrawlerBattleData& battle,
    size_t actor_count
) {
    return battle.enemy_name != nullptr && battle.enemy_actor_index >= 0 &&
        static_cast<size_t>(battle.enemy_actor_index) < actor_count &&
        battle.max_hp > 0 && battle.max_hp <= 99 && battle.player_damage > 0 &&
        battle.enemy_damage > 0 && is_valid_inventory_item_index(battle.reward_item) &&
        battle.reward_quantity >= 0;
}

constexpr DungeonCrawlerBattleState make_dungeon_crawler_battle_state(
    const DungeonCrawlerBattleData& battle
) {
    return DungeonCrawlerBattleState { true, battle.max_hp, 3 };
}

constexpr bool dungeon_battle_player_attack(
    DungeonCrawlerBattleState& state,
    const DungeonCrawlerBattleData& battle
) {
    if (!state.active || state.enemy_hp <= 0 || state.player_hp <= 0) {
        return false;
    }
    state.enemy_hp = state.enemy_hp > battle.player_damage
        ? state.enemy_hp - battle.player_damage
        : 0;
    return true;
}

constexpr bool dungeon_battle_enemy_turn(
    DungeonCrawlerBattleState& state,
    const DungeonCrawlerBattleData& battle
) {
    if (!state.active || state.enemy_hp <= 0 || state.player_hp <= 0) {
        return false;
    }
    state.player_hp = state.player_hp > battle.enemy_damage
        ? state.player_hp - battle.enemy_damage
        : 0;
    return true;
}

constexpr bool dungeon_battle_is_victory(const DungeonCrawlerBattleState& state) {
    return state.active && state.enemy_hp <= 0;
}

constexpr bool dungeon_battle_is_defeat(const DungeonCrawlerBattleState& state) {
    return state.active && state.player_hp <= 0 && state.enemy_hp > 0;
}

constexpr bool is_valid_dungeon_crawler_room_data(const DungeonCrawlerRoomData& room) {
    return room.name != nullptr && room.collision_flags != nullptr &&
        room.width_tiles > 0 && room.height_tiles > 0 &&
        is_valid_dungeon_crawler_config(room.config) &&
        is_valid_dungeon_direction(room.player_direction) &&
        dungeon_position_in_bounds(room, room.player_start) &&
        !dungeon_cell_blocked(room, room.player_start);
}

constexpr bool is_valid_dungeon_crawler_resource_banks(const DungeonCrawlerProjectData& project) {
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

constexpr bool is_valid_dungeon_crawler_resource_bank_groups(const DungeonCrawlerProjectData& project) {
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

constexpr ResourceBankBatch resource_bank_batch_from_dungeon_crawler_project(
    const DungeonCrawlerProjectData& project
) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_dungeon_crawler_project(
    const DungeonCrawlerProjectData& project,
    size_t group_index
) {
    return project.resource_bank_groups != nullptr && group_index < project.resource_bank_group_count
        ? project.resource_bank_groups[group_index]
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr int find_dungeon_crawler_resource_bank_group_index(
    const DungeonCrawlerProjectData& project,
    const char* name
) {
    return find_resource_bank_group_index(
        project.resource_bank_groups,
        project.resource_bank_group_count,
        name
    );
}

constexpr ResourceBankGroup resource_bank_group_from_dungeon_crawler_room(
    const DungeonCrawlerProjectData& project,
    const DungeonCrawlerRoomData& room
) {
    const int index = find_dungeon_crawler_resource_bank_group_index(
        project,
        room.resource_bank_group_name
    );
    return index >= 0
        ? resource_bank_group_from_dungeon_crawler_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr bool is_valid_dungeon_crawler_project_data(const DungeonCrawlerProjectData& project) {
    if (project.rooms == nullptr || project.room_count == 0 || project.initial_room < 0 ||
        static_cast<size_t>(project.initial_room) >= project.room_count ||
        !is_valid_dungeon_crawler_resource_banks(project) ||
        !is_valid_dungeon_crawler_resource_bank_groups(project)) {
        return false;
    }
    for (size_t index = 0; index < project.room_count; ++index) {
        const DungeonCrawlerRoomData& room = project.rooms[index];
        if (!is_valid_dungeon_crawler_room_data(room) ||
            (room.resource_bank_group_name != nullptr &&
                find_dungeon_crawler_resource_bank_group_index(
                    project,
                    room.resource_bank_group_name
                ) < 0)) {
            return false;
        }
    }
    return true;
}

constexpr bool is_valid_dungeon_crawler_project_script_index(const DungeonCrawlerProjectData& project, int script_index) {
    return project.scripts != nullptr &&
        script_index >= 0 &&
        static_cast<size_t>(script_index) < project.script_count;
}

inline DungeonCrawlerRuntimeState make_dungeon_crawler_runtime_state(const DungeonCrawlerRoomData& room) {
    DungeonCrawlerRuntimeState state { room.player_start, room.player_direction, 0, {} };
    dungeon_exploration_mark(state, room, state.position);
    return state;
}

inline bool capture_dungeon_crawler_save_data(
    UniversalSaveData& save_data,
    int room_index,
    const DungeonCrawlerRuntimeState& runtime_state,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0,
    const DungeonCrawlerPersistentState* persistent = nullptr
) {
    static_assert(
        sizeof(DungeonCrawlerSavePayload) <= universal_save_payload_capacity,
        "dungeon crawler save payload exceeds the universal envelope"
    );
    const DungeonCrawlerSavePayload payload {
        runtime_state, persistent != nullptr ? *persistent : DungeonCrawlerPersistentState {}
    };
    return make_universal_save_data(
        save_data,
        UniversalSaveRuntime::DungeonCrawler,
        room_index,
        runtime_state.position.x,
        runtime_state.position.y,
        0,
        0,
        event_state.variables,
        universal_save_variable_count,
        event_state.inventory,
        universal_save_inventory_count,
        event_state.equipped_items,
        universal_save_equipment_slot_count,
        play_time_frames,
        flags,
        &payload,
        sizeof(payload),
        event_state.text_variables,
        text_variable_count
    );
}

inline bool apply_dungeon_crawler_save_data(
    const DungeonCrawlerProjectData& project,
    const UniversalSaveData& save_data,
    int& room_index,
    DungeonCrawlerRuntimeState& runtime_state,
    EventState& event_state,
    DungeonCrawlerPersistentState* persistent = nullptr
) {
    if (!is_valid_universal_save_data(save_data) ||
        save_data.runtime != UniversalSaveRuntime::DungeonCrawler ||
        save_data.room_index < 0 ||
        static_cast<size_t>(save_data.room_index) >= project.room_count) {
        return false;
    }
    DungeonCrawlerSavePayload payload {};
    if (!read_universal_save_payload(
            save_data,
            UniversalSaveRuntime::DungeonCrawler,
            &payload,
            sizeof(payload))) {
        return false;
    }
    const DungeonCrawlerRoomData& room = project.rooms[save_data.room_index];
    if (dungeon_cell_blocked(room, payload.runtime_state.position) ||
        !is_valid_dungeon_direction(payload.runtime_state.direction) ||
        payload.persistent.exploration_player_hp < 0 || payload.persistent.exploration_player_hp > 3 ||
        payload.persistent.battle_state.player_hp < 0 || payload.persistent.battle_state.player_hp > 3 ||
        payload.persistent.battle_state.enemy_hp < 0 ||
        payload.persistent.battle_state.enemy_hp > project.battle.max_hp) {
        return false;
    }
    if (!read_universal_save_common_state(
            save_data,
            event_state.variables,
            universal_save_variable_count,
            event_state.inventory,
            universal_save_inventory_count,
            event_state.equipped_items,
            universal_save_equipment_slot_count,
            event_state.text_variables,
            text_variable_count)) {
        return false;
    }
    room_index = save_data.room_index;
    runtime_state = payload.runtime_state;
    if (persistent != nullptr) *persistent = payload.persistent;
    event_state.current_room = room_index;
    event_state.player_x = runtime_state.position.x;
    event_state.player_y = runtime_state.position.y;
    event_state.player_direction = static_cast<int>(runtime_state.direction);
    return true;
}

Vec2i dungeon_forward_delta(DungeonDirection direction);
Vec2i dungeon_right_delta(DungeonDirection direction);
void turn_dungeon_left(DungeonCrawlerRuntimeState& state);
void turn_dungeon_right(DungeonCrawlerRuntimeState& state);
bool try_dungeon_step_forward(DungeonCrawlerRuntimeState& state, const DungeonCrawlerRoomData& room);
bool try_dungeon_step_backward(DungeonCrawlerRuntimeState& state, const DungeonCrawlerRoomData& room);
DungeonViewCell dungeon_view_cell(
    const DungeonCrawlerRoomData& room,
    const DungeonCrawlerRuntimeState& state,
    int distance,
    int lateral
);

} // namespace gbs
