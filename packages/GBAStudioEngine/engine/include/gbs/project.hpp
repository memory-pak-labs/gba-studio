#pragma once

#include <stddef.h>
#include "gbs/animation.hpp"
#include "gbs/assets.hpp"
#include "gbs/audio.hpp"
#include "gbs/compression.hpp"
#include "gbs/cutscene.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/isometric.hpp"
#include "gbs/menu.hpp"
#include "gbs/platformer.hpp"
#include "gbs/point_click.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/shmup.hpp"
#include "gbs/topdown.hpp"
#include "gbs/types.hpp"
#include "gbs/visual_novel.hpp"
#include "gbs/world_map.hpp"

namespace gbs {

enum class TopDownActorDirection : uint8_t {
    Down = 0,
    Up = 1,
    Left = 2,
    Right = 3,
    DownLeft = 4,
    DownRight = 5,
    UpLeft = 6,
    UpRight = 7
};

enum class TopDownNpcMovementKind : uint8_t {
    None = 0,
    PatrolHorizontal = 1,
    PatrolVertical = 2,
    WanderBox = 3,
    FollowPlayer = 4,
    PathToPoint = 5
};

struct TopDownNpcMovementData {
    TopDownNpcMovementKind kind = TopDownNpcMovementKind::None;
    Rect bounds_pixels = Rect { 0, 0, 0, 0 };
    Vec2i target_pixels = Vec2i { 0, 0 };
    uint8_t max_search_tiles = 32;
    uint8_t step_interval_frames = 1;
};

struct TopDownPortalEventData {
    size_t portal_index;
    EventScript script;
};

struct TopDownInteractionData {
    Rect area_pixels;
    EventScript script;
};

struct TopDownAffineObjectData {
    bool enabled = false;
    bool double_size = false;
    uint8_t matrix_index = 0;
    AffineSpriteTransform transform = AffineSpriteTransform { 256, 0, 0, 256 };
    Easing keyframe_easing = Easing::Linear;
    const AffineMatrixKeyframe* keyframes = nullptr;
    size_t keyframe_count = 0;
};

struct TopDownNpcData {
    Vec2i position_pixels;
    Vec2i size_pixels;
    const MetaSprite* metasprite;
    const SpriteAnimation* animation;
    EventScript on_interact;
    const char* name = nullptr;
    TopDownActorDirection direction = TopDownActorDirection::Down;
    uint8_t collision_group = 0;
    int movement_speed_x100 = 100;
    int animation_speed_percent = 100;
    int health = 1;
    EventScript on_start = empty_event_script();
    EventScript on_update = empty_event_script();
    EventScript on_hit_actor = empty_event_script();
    EventScript on_hit_player = empty_event_script();
    EventScript on_hit_group1 = empty_event_script();
    EventScript on_hit_group2 = empty_event_script();
    EventScript on_hit_group3 = empty_event_script();
    EventScript on_defeated = empty_event_script();
    TopDownNpcMovementData movement = TopDownNpcMovementData {};
    uint16_t collision_mask = 0xFFFFu;
    const SpriteAnimation* const* animations = nullptr;
    size_t animation_count = 0;
    Vec2i collision_offset_pixels = Vec2i { 0, 0 };
    uint8_t push_priority = 0;
    bool pushable = false;
    TopDownAffineObjectData affine_obj = TopDownAffineObjectData {};
};

enum class TopDownTriggerKind : uint8_t {
    Standard = 0,
    Water = 1,
    Damage = 2
};

struct TopDownTriggerData {
    Rect area_pixels;
    EventScript on_enter;
    EventScript on_leave = empty_event_script();
    bool run_once = false;
    uint16_t cooldown_frames = 0;
    EventScript condition = empty_event_script();
    TopDownTriggerKind kind = TopDownTriggerKind::Standard;
};

struct TopDownTriggerState {
    bool inside = false;
    bool fired = false;
    uint16_t cooldown_remaining = 0;
};

enum class TopDownTriggerResult : uint8_t {
    None = 0,
    Enter = 1,
    Leave = 2
};

enum class TopDownCameraMode : uint8_t {
    ProjectDefault = 0,
    Follow = 1,
    Fixed = 2
};

struct TopDownTileEffectEventData {
    uint8_t effect_mask;
    EventScript on_enter;
    EventScript on_leave = empty_event_script();
    bool run_once = false;
    uint16_t cooldown_frames = 0;
};

struct TopDownNamedScriptData {
    const char* name;
    EventScript script;
};

struct TopDownRoomMetadata {
    TopDownCameraMode camera_mode;
    Vec2i camera_position_pixels;
    bool has_player_start;
    Vec2i player_start_pixels;
    bool has_music;
    int music_index;
    bool stop_music;
    bool has_backdrop_color;
    uint16_t backdrop_color;
    bool has_camera_bounds = false;
    Rect camera_bounds_pixels = Rect { 0, 0, 0, 0 };
};

constexpr TopDownRoomMetadata default_room_metadata() {
    return TopDownRoomMetadata {
        TopDownCameraMode::ProjectDefault,
        Vec2i { 0, 0 },
        false,
        Vec2i { 0, 0 },
        false,
        -1,
        false,
        false,
        0,
        false,
        Rect { 0, 0, 0, 0 }
    };
}

struct TopDownRoomData {
    const uint16_t* visual_tiles;
    const uint8_t* collision_flags;
    int width_tiles;
    int height_tiles;
    const Portal* portals;
    size_t portal_count;
    EventScript on_enter;
    EventScript on_exit;
    const TopDownPortalEventData* portal_events;
    size_t portal_event_count;
    EventScript on_interact;
    const TopDownInteractionData* interactions;
    size_t interaction_count;
    const TopDownNpcData* npcs;
    size_t npc_count;
    TopDownRoomMetadata metadata;
    const TopDownTriggerData* triggers = nullptr;
    size_t trigger_count = 0;
    const TopDownTileEffectEventData* tile_effect_events = nullptr;
    size_t tile_effect_event_count = 0;
    const char* name = nullptr;
    const TileSlope* slope_tiles = nullptr;
    const char* resource_bank_group_name = nullptr;
    const CameraZone* camera_zones = nullptr;
    size_t camera_zone_count = 0;
    const uint16_t* foreground_tiles = nullptr;
    bool uses_visual_tilemap = false;
    const TileMapAsset* visual_tilemap = nullptr;
    const TileAsset* visual_tile_asset = nullptr;
    const PaletteAsset* visual_palette = nullptr;
    VideoComposition video = default_video_composition();
    EventScript on_hit_group1 = empty_event_script();
    EventScript on_hit_group2 = empty_event_script();
    EventScript on_hit_group3 = empty_event_script();
};

struct TopDownActorData {
    Vec2i position_pixels;
    Vec2i size_pixels;
    int speed_pixels;
    const MetaSprite* metasprite;
    const SpriteAnimation* animation = nullptr;
    const char* name = nullptr;
    TopDownActorDirection direction = TopDownActorDirection::Down;
    uint8_t collision_group = 0;
    int movement_speed_x100 = 100;
    int animation_speed_percent = 100;
    EventScript on_start = empty_event_script();
    EventScript on_update = empty_event_script();
    EventScript on_hit_actor = empty_event_script();
    EventScript on_hit_player = empty_event_script();
    EventScript on_hit_group1 = empty_event_script();
    EventScript on_hit_group2 = empty_event_script();
    EventScript on_hit_group3 = empty_event_script();
    EventScript on_defeated = empty_event_script();
    uint16_t collision_mask = 0xFFFFu;
    const SpriteAnimation* const* animations = nullptr;
    size_t animation_count = 0;
    Vec2i collision_offset_pixels = Vec2i { 0, 0 };
    uint8_t push_priority = 0;
    bool pushable = false;
    TopDownAffineObjectData affine_obj = TopDownAffineObjectData {};
};

struct TopDownActorSpriteData {
    const MetaSprite* metasprite = nullptr;
    const SpriteAnimation* animation = nullptr;
    const SpriteAnimation* const* animations = nullptr;
    size_t animation_count = 0;
};

struct TopDownActorRuntime {
    Actor actor;
    const MetaSprite* metasprite;
    const SpriteAnimation* animation;
    bool visible;
    bool active;
    int animation_index;
    int animation_speed_percent;
    bool animation_frame_changed;
    int animation_frame_index;
    int movement_phase = 0;
    uint8_t movement_frame_counter = 0;
    int movement_speed_x100 = -1;
    int movement_step_accumulator = 0;
    TopDownAffineObjectData affine_obj = TopDownAffineObjectData {};
    int sprite_index = -1;
    bool movement_cancelled = false;
};

struct TopDownBackgroundData {
    BackgroundLayer layer;
    TileMapAsset tilemap;
    const Rle16TileMapAsset* compressed_tilemap;
    Vec2i scroll_pixels;
    Vec2i parallax_256;
};

struct TopDownDialogueChoiceData {
    int line_index;
    const DialogueChoice* choices;
    size_t choice_count;
    int variable_index;
};

struct TopDownQuestData {
    const char* id;
    int state_variable;
    int active_value;
    int completed_value;
    int objective_item;
    int objective_quantity;
    int reward_item;
    int reward_quantity;
    EventScript on_complete = empty_event_script();
};

struct TopDownShopItemData {
    const char* label;
    int item;
    int currency_item;
    int price;
    int stock_variable;
    int stock;
    EventScript on_purchase = empty_event_script();
};

struct TopDownProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const PaletteAsset* obj_palettes;
    size_t obj_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const TopDownBackgroundData* backgrounds;
    size_t background_count;
    const TopDownRoomData* rooms;
    size_t room_count;
    const DialogueLine* dialogue_lines;
    size_t dialogue_line_count;
    const SfxAsset* sfx_assets;
    size_t sfx_asset_count;
    const MusicAsset* music_assets;
    size_t music_asset_count;
    TopDownActorData player;
    Camera camera;
    uint16_t backdrop_color;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
    const TopDownDialogueChoiceData* dialogue_choices = nullptr;
    size_t dialogue_choice_count = 0;
    const TopDownNamedScriptData* named_scripts = nullptr;
    size_t named_script_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
    DialogueUiConfig dialogue_ui = default_dialogue_ui_config();
    int initial_room = 0;
    VideoComposition video = default_video_composition();
    bool inventory_enabled = true;
    bool quests_enabled = true;
    bool shop_enabled = true;
    const TopDownQuestData* quests = nullptr;
    size_t quest_count = 0;
    const TopDownShopItemData* shop_items = nullptr;
    size_t shop_item_count = 0;
    const TopDownActorSpriteData* actor_sprites = nullptr;
    size_t actor_sprite_count = 0;
};

constexpr const TopDownActorSpriteData* topdown_actor_sprite_for_index(
    const TopDownProjectData& project,
    int sprite_index
) {
    if (project.actor_sprites == nullptr || sprite_index < 0 ||
        static_cast<size_t>(sprite_index) >= project.actor_sprite_count) {
        return nullptr;
    }
    return &project.actor_sprites[sprite_index];
}

constexpr bool topdown_quest_is_ready(const TopDownQuestData& quest, const EventState& state) {
    return is_valid_event_variable(quest.state_variable) &&
        is_valid_inventory_item_index(quest.objective_item) &&
        is_valid_inventory_item_index(quest.reward_item) &&
        quest.objective_quantity > 0 &&
        quest.reward_quantity > 0 &&
        state.variables[quest.state_variable] == quest.active_value &&
        state.inventory[quest.objective_item] >= quest.objective_quantity;
}

inline bool complete_topdown_quest(const TopDownQuestData& quest, EventState& state) {
    if (!topdown_quest_is_ready(quest, state)) {
        return false;
    }
    state.inventory[quest.objective_item] -= quest.objective_quantity;
    state.inventory[quest.reward_item] = clamp_int(
        state.inventory[quest.reward_item] + quest.reward_quantity,
        0,
        999
    );
    state.variables[quest.state_variable] = quest.completed_value;
    return true;
}

constexpr bool topdown_shop_item_can_purchase(const TopDownShopItemData& item, const EventState& state) {
    return is_valid_inventory_item_index(item.item) &&
        is_valid_inventory_item_index(item.currency_item) &&
        item.item != item.currency_item &&
        item.price > 0 &&
        (item.stock_variable < 0 || is_valid_event_variable(item.stock_variable)) &&
        (item.stock_variable < 0 || state.variables[item.stock_variable] < item.stock) &&
        state.inventory[item.currency_item] >= item.price;
}

inline bool purchase_topdown_shop_item(const TopDownShopItemData& item, EventState& state) {
    if (!topdown_shop_item_can_purchase(item, state)) {
        return false;
    }
    state.inventory[item.currency_item] -= item.price;
    state.inventory[item.item] = clamp_int(state.inventory[item.item] + 1, 0, 999);
    if (item.stock_variable >= 0) {
        state.variables[item.stock_variable] += 1;
    }
    return true;
}

constexpr TileMap collision_map_from_room(const TopDownRoomData& room) {
    return TileMap { room.collision_flags, room.width_tiles, room.height_tiles, room.slope_tiles };
}

constexpr Room room_from_data(const TopDownRoomData& room) {
    return Room {
        room.visual_tiles,
        collision_map_from_room(room),
        room.portals,
        room.portal_count,
        room.width_tiles,
        room.height_tiles
    };
}

constexpr Actor actor_from_data(const TopDownActorData& actor) {
    return Actor {
        actor.position_pixels,
        actor.size_pixels,
        actor.speed_pixels,
        static_cast<uint8_t>(actor.direction),
        actor.collision_group,
        actor.collision_mask,
        actor.collision_offset_pixels,
        actor.push_priority,
        actor.pushable
    };
}

constexpr TopDownActorRuntime actor_runtime_from_data(const TopDownActorData& actor) {
    return TopDownActorRuntime {
        actor_from_data(actor),
        actor.metasprite,
        actor.animation,
        true,
        true,
        0,
        actor.animation_speed_percent,
        false,
        0,
        0,
        0,
        -1,
        0,
        actor.affine_obj
    };
}

constexpr const SpriteAnimation* topdown_actor_animation_for_index(const TopDownActorData& actor, int animation_index) {
    if (actor.animations != nullptr &&
        animation_index >= 0 &&
        static_cast<size_t>(animation_index) < actor.animation_count) {
        return actor.animations[animation_index];
    }
    return actor.animation;
}

constexpr const SpriteAnimation* topdown_actor_animation_for_index(
    const TopDownActorSpriteData& actor_sprite,
    int animation_index
) {
    if (actor_sprite.animations != nullptr && animation_index >= 0 &&
        static_cast<size_t>(animation_index) < actor_sprite.animation_count) {
        return actor_sprite.animations[animation_index];
    }
    return actor_sprite.animation;
}

constexpr Actor actor_from_npc(const TopDownNpcData& npc) {
    return Actor {
        npc.position_pixels,
        npc.size_pixels,
        0,
        static_cast<uint8_t>(npc.direction),
        npc.collision_group,
        npc.collision_mask,
        npc.collision_offset_pixels,
        npc.push_priority,
        npc.pushable
    };
}

constexpr Rect actor_rect(const Actor& actor) {
    return Rect {
        actor.position_pixels.x,
        actor.position_pixels.y,
        actor.size_pixels.x,
        actor.size_pixels.y
    };
}

constexpr Rect actor_interaction_rect(const Actor& actor) {
    Rect interaction = actor_rect(actor);
    const int reach_x = actor.size_pixels.x > 0 ? actor.size_pixels.x : 1;
    const int reach_y = actor.size_pixels.y > 0 ? actor.size_pixels.y : 1;
    switch (static_cast<TopDownActorDirection>(actor.direction)) {
        case TopDownActorDirection::Down:
            interaction.height += reach_y;
            break;
        case TopDownActorDirection::Up:
            interaction.y -= reach_y;
            interaction.height += reach_y;
            break;
        case TopDownActorDirection::Left:
            interaction.x -= reach_x;
            interaction.width += reach_x;
            break;
        case TopDownActorDirection::Right:
            interaction.width += reach_x;
            break;
        case TopDownActorDirection::DownLeft:
            interaction.x -= reach_x;
            interaction.width += reach_x;
            interaction.height += reach_y;
            break;
        case TopDownActorDirection::DownRight:
            interaction.width += reach_x;
            interaction.height += reach_y;
            break;
        case TopDownActorDirection::UpLeft:
            interaction.x -= reach_x;
            interaction.y -= reach_y;
            interaction.width += reach_x;
            interaction.height += reach_y;
            break;
        case TopDownActorDirection::UpRight:
            interaction.y -= reach_y;
            interaction.width += reach_x;
            interaction.height += reach_y;
            break;
    }
    return interaction;
}

constexpr TopDownActorRuntime actor_runtime_from_npc(const TopDownNpcData& npc) {
    return TopDownActorRuntime {
        actor_from_npc(npc),
        npc.metasprite,
        npc.animation,
        true,
        true,
        0,
        npc.animation_speed_percent,
        false,
        0,
        0,
        0,
        -1,
        0,
        npc.affine_obj
    };
}

constexpr bool actor_intersects_camera_viewport(
    const Actor& actor,
    Vec2i camera_position_pixels,
    int viewport_width_pixels,
    int viewport_height_pixels,
    int margin_pixels = 0
) {
    const Rect viewport {
        camera_position_pixels.x - margin_pixels,
        camera_position_pixels.y - margin_pixels,
        viewport_width_pixels + margin_pixels * 2,
        viewport_height_pixels + margin_pixels * 2
    };
    return intersects(actor_rect(actor), viewport);
}

inline size_t collect_visible_actor_runtime_slots(
    const TopDownActorRuntime* actors,
    size_t actor_count,
    Vec2i camera_position_pixels,
    int viewport_width_pixels,
    int viewport_height_pixels,
    int margin_pixels,
    size_t* out_indices,
    size_t capacity
) {
    if (actors == nullptr || out_indices == nullptr || capacity == 0) {
        return 0;
    }

    size_t count = 0;
    for (size_t index = 0; index < actor_count && count < capacity; ++index) {
        const TopDownActorRuntime& actor = actors[index];
        if (!actor.active || !actor.visible || !actor_intersects_camera_viewport(
            actor.actor,
            camera_position_pixels,
            viewport_width_pixels,
            viewport_height_pixels,
            margin_pixels
        )) {
            continue;
        }
        out_indices[count] = index;
        ++count;
    }
    return count;
}

struct TopDownActorDrawSlot {
    bool is_player = false;
    size_t actor_index = 0;
};

inline size_t collect_visible_topdown_actor_draw_slots(
    const Actor& player,
    bool player_active,
    const TopDownActorRuntime* actors,
    size_t actor_count,
    Vec2i camera_position_pixels,
    int viewport_width_pixels,
    int viewport_height_pixels,
    int margin_pixels,
    TopDownActorDrawSlot* out_slots,
    size_t capacity
) {
    if (out_slots == nullptr || capacity == 0) {
        return 0;
    }

    size_t count = 0;
    const auto actor_for_slot = [&](const TopDownActorDrawSlot& slot) -> const Actor& {
        return slot.is_player ? player : actors[slot.actor_index].actor;
    };
    const auto stable_order_for_slot = [](const TopDownActorDrawSlot& slot) {
        return slot.is_player ? static_cast<size_t>(0) : slot.actor_index + 1;
    };
    const auto insert_slot = [&](TopDownActorDrawSlot candidate) {
        const Actor& candidate_actor = actor_for_slot(candidate);
        const int candidate_feet_y = candidate_actor.position_pixels.y + candidate_actor.size_pixels.y;
        const size_t candidate_stable_order = stable_order_for_slot(candidate);
        size_t insert_at = 0;
        while (insert_at < count) {
            const Actor& existing_actor = actor_for_slot(out_slots[insert_at]);
            const int existing_feet_y = existing_actor.position_pixels.y + existing_actor.size_pixels.y;
            if (candidate_feet_y > existing_feet_y ||
                (candidate_feet_y == existing_feet_y &&
                 candidate_stable_order < stable_order_for_slot(out_slots[insert_at]))) {
                break;
            }
            ++insert_at;
        }
        if (insert_at >= capacity) {
            return;
        }
        if (count < capacity) {
            ++count;
        }
        for (size_t index = count - 1; index > insert_at; --index) {
            out_slots[index] = out_slots[index - 1];
        }
        out_slots[insert_at] = candidate;
    };

    if (player_active) {
        insert_slot(TopDownActorDrawSlot { true, 0 });
    }
    if (actors == nullptr) {
        return count;
    }
    for (size_t index = 0; index < actor_count; ++index) {
        const TopDownActorRuntime& actor = actors[index];
        if (!actor.active || !actor.visible || !actor_intersects_camera_viewport(
            actor.actor,
            camera_position_pixels,
            viewport_width_pixels,
            viewport_height_pixels,
            margin_pixels
        )) {
            continue;
        }
        insert_slot(TopDownActorDrawSlot { false, index });
    }
    return count;
}

constexpr const SpriteAnimation* topdown_npc_animation_for_index(const TopDownNpcData& npc, int animation_index) {
    if (npc.animations != nullptr &&
        animation_index >= 0 &&
        static_cast<size_t>(animation_index) < npc.animation_count) {
        return npc.animations[animation_index];
    }
    return npc.animation;
}

constexpr int actor_runtime_movement_speed_x100(const TopDownNpcData& npc, const TopDownActorRuntime& runtime) {
    return runtime.movement_speed_x100 >= 0
        ? runtime.movement_speed_x100
        : (npc.movement_speed_x100 < 0 ? 0 : npc.movement_speed_x100);
}

constexpr int actor_runtime_movement_speed(const TopDownNpcData& npc, const TopDownActorRuntime& runtime) {
    const int speed_x100 = actor_runtime_movement_speed_x100(npc, runtime);
    return speed_x100 <= 0 ? 0 : ((speed_x100 + 99) / 100);
}

constexpr int consume_actor_runtime_movement_step(
    const TopDownNpcData& npc,
    TopDownActorRuntime& runtime
) {
    const int speed_x100 = actor_runtime_movement_speed_x100(npc, runtime);
    if (speed_x100 <= 0) {
        return 0;
    }
    runtime.movement_step_accumulator += speed_x100;
    const int pixels = runtime.movement_step_accumulator / 100;
    runtime.movement_step_accumulator %= 100;
    return pixels;
}

constexpr Vec2i direction_delta_for_phase(int phase, int speed) {
    switch (phase & 3) {
    case 0:
        return Vec2i { speed, 0 };
    case 1:
        return Vec2i { 0, speed };
    case 2:
        return Vec2i { -speed, 0 };
    default:
        return Vec2i { 0, -speed };
    }
}

inline bool update_actor_runtime_ai(
    const TopDownNpcData& npc,
    TopDownActorRuntime& runtime,
    const TileMap& map,
    const Actor& player,
    const Actor* blocking_actors,
    size_t blocking_actor_count
) {
    if (runtime.movement_cancelled || !runtime.active || !runtime.visible || npc.movement.kind == TopDownNpcMovementKind::None) {
        return false;
    }

    uint8_t interval = npc.movement.step_interval_frames == 0 ? 1 : npc.movement.step_interval_frames;
    runtime.movement_frame_counter = static_cast<uint8_t>(runtime.movement_frame_counter + 1);
    if (runtime.movement_frame_counter < interval) {
        return false;
    }
    runtime.movement_frame_counter = 0;

    runtime.actor.speed_pixels = consume_actor_runtime_movement_step(npc, runtime);
    if (runtime.actor.speed_pixels <= 0) {
        return false;
    }

    if (npc.movement.kind == TopDownNpcMovementKind::FollowPlayer) {
        Vec2i target {
            player.position_pixels.x + player.size_pixels.x / 2,
            player.position_pixels.y + player.size_pixels.y / 2
        };
        return move_actor_towards_with_actor_collisions(
            map,
            runtime.actor,
            target,
            blocking_actors,
            blocking_actor_count,
            npc.movement.max_search_tiles
        );
    }

    if (npc.movement.kind == TopDownNpcMovementKind::PathToPoint) {
        return move_actor_towards_with_actor_collisions(
            map,
            runtime.actor,
            npc.movement.target_pixels,
            blocking_actors,
            blocking_actor_count,
            npc.movement.max_search_tiles
        );
    }

    Vec2i delta { 0, 0 };
    if (npc.movement.kind == TopDownNpcMovementKind::PatrolHorizontal) {
        delta = runtime.movement_phase == 0
            ? Vec2i { runtime.actor.speed_pixels, 0 }
            : Vec2i { -runtime.actor.speed_pixels, 0 };
    } else if (npc.movement.kind == TopDownNpcMovementKind::PatrolVertical) {
        delta = runtime.movement_phase == 0
            ? Vec2i { 0, runtime.actor.speed_pixels }
            : Vec2i { 0, -runtime.actor.speed_pixels };
    } else {
        delta = direction_delta_for_phase(runtime.movement_phase, runtime.actor.speed_pixels);
    }

    Rect next_rect {
        runtime.actor.position_pixels.x + delta.x,
        runtime.actor.position_pixels.y + delta.y,
        runtime.actor.size_pixels.x,
        runtime.actor.size_pixels.y
    };
    Rect bounds = npc.movement.bounds_pixels;
    const bool has_bounds = bounds.width > 0 && bounds.height > 0;
    const bool outside_bounds = has_bounds &&
        (next_rect.x < bounds.x ||
         next_rect.y < bounds.y ||
         next_rect.right() > bounds.right() ||
         next_rect.bottom() > bounds.bottom());

    if (outside_bounds || !move_actor_by_delta_with_actor_collisions(map, runtime.actor, delta, blocking_actors, blocking_actor_count)) {
        if (npc.movement.kind == TopDownNpcMovementKind::WanderBox) {
            runtime.movement_phase = (runtime.movement_phase + 1) & 3;
        } else {
            runtime.movement_phase = runtime.movement_phase == 0 ? 1 : 0;
        }
        return false;
    }
    return true;
}

inline bool update_actor_runtime_ai(
    const TopDownNpcData& npc,
    TopDownActorRuntime& runtime,
    const TileMap& map,
    const Actor& player
) {
    return update_actor_runtime_ai(npc, runtime, map, player, nullptr, 0);
}

constexpr bool is_valid_actor_runtime_index(size_t actor_count, int actor_index) {
    return actor_index >= 0 && static_cast<size_t>(actor_index) < actor_count;
}

constexpr int clamp_actor_animation_speed_percent(int speed_percent) {
    if (speed_percent < 1) {
        return 1;
    }
    if (speed_percent > 400) {
        return 400;
    }
    return speed_percent;
}

constexpr bool string_equals(const char* lhs, const char* rhs) {
    if (lhs == nullptr || rhs == nullptr) {
        return false;
    }
    while (*lhs != '\0' && *rhs != '\0') {
        if (*lhs != *rhs) {
            return false;
        }
        ++lhs;
        ++rhs;
    }
    return *lhs == '\0' && *rhs == '\0';
}

constexpr void apply_actor_event_command(
    TopDownActorRuntime* actors,
    size_t actor_count,
    const EventActorCommand& command
) {
    if (actors == nullptr || !is_valid_actor_runtime_index(actor_count, command.actor_index)) {
        return;
    }

    TopDownActorRuntime& runtime = actors[command.actor_index];
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
        runtime.movement_cancelled = false;
        runtime.actor.position_pixels.x += command.a;
        runtime.actor.position_pixels.y += command.b;
        break;
    case EventActorOp::SetDirection:
        runtime.actor.direction = static_cast<uint8_t>(command.a);
        break;
    case EventActorOp::SetSpeed:
        runtime.movement_cancelled = false;
        runtime.movement_speed_x100 = command.a < 0 ? 0 : command.a;
        runtime.movement_step_accumulator = 0;
        runtime.actor.speed_pixels = runtime.movement_speed_x100 <= 0
            ? 0
            : ((runtime.movement_speed_x100 + 99) / 100);
        break;
    case EventActorOp::SetAnimation:
        runtime.animation_index = command.a;
        break;
    case EventActorOp::SetSprite:
        runtime.sprite_index = command.a;
        runtime.animation_index = 0;
        runtime.animation_frame_changed = false;
        break;
    case EventActorOp::SetAnimationSpeed:
        runtime.animation_speed_percent = clamp_actor_animation_speed_percent(command.a);
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
    case EventActorOp::CancelMovement:
        runtime.movement_cancelled = true;
        runtime.movement_step_accumulator = 0;
        runtime.movement_frame_counter = 0;
        break;
    case EventActorOp::PushFacing:
    case EventActorOp::Push:
        break;
    }
}

constexpr bool actor_event_command_targets_runtime(size_t actor_count, const EventActorCommand& command) {
    return command.op != EventActorOp::None && is_valid_actor_runtime_index(actor_count, command.actor_index);
}

constexpr size_t apply_actor_event_commands(
    TopDownActorRuntime* actors,
    size_t actor_count,
    const EventActorCommand* commands,
    size_t command_count
) {
    if (commands == nullptr) {
        return 0;
    }

    size_t applied_count = 0;
    for (size_t index = 0; index < command_count; ++index) {
        if (actor_event_command_targets_runtime(actor_count, commands[index])) {
            ++applied_count;
        }
        apply_actor_event_command(actors, actor_count, commands[index]);
    }
    return applied_count;
}

inline size_t consume_actor_event_commands(
    TopDownActorRuntime* actors,
    size_t actor_count,
    EventState& state
) {
    size_t applied_count = apply_actor_event_commands(
        actors,
        actor_count,
        state.actor_commands,
        state.actor_command_count
    );
    reset_event_actor_commands(state);
    return applied_count;
}

constexpr EventScript actor_runtime_interaction_script_for(
    const TopDownRoomData& room,
    const TopDownActorRuntime* actors,
    size_t actor_count,
    const Actor& player
) {
    if (room.npcs == nullptr || actors == nullptr) {
        return empty_event_script();
    }

    Rect player_rect = actor_interaction_rect(player);
    const size_t count = room.npc_count < actor_count ? room.npc_count : actor_count;
    for (size_t index = 0; index < count; ++index) {
        if (!actors[index].visible || !actors[index].active) {
            continue;
        }
        if (intersects(player_rect, actor_rect(actors[index].actor))) {
            return room.npcs[index].on_interact;
        }
    }

    return empty_event_script();
}

constexpr EventScript portal_event_script_for(const TopDownRoomData& room, size_t portal_index) {
    for (size_t index = 0; index < room.portal_event_count; ++index) {
        if (room.portal_events[index].portal_index == portal_index) {
            return room.portal_events[index].script;
        }
    }
    return empty_event_script();
}

constexpr EventScript interaction_event_script_for(const TopDownRoomData& room, const Actor& player) {
    Rect player_rect {
        player.position_pixels.x,
        player.position_pixels.y,
        player.size_pixels.x,
        player.size_pixels.y
    };

    for (size_t index = 0; index < room.interaction_count; ++index) {
        if (intersects(player_rect, room.interactions[index].area_pixels)) {
            return room.interactions[index].script;
        }
    }
    return empty_event_script();
}

constexpr EventScript npc_event_script_for(const TopDownRoomData& room, const Actor& player) {
    if (room.npcs == nullptr) {
        return empty_event_script();
    }

    Rect player_rect {
        player.position_pixels.x,
        player.position_pixels.y,
        player.size_pixels.x,
        player.size_pixels.y
    };

    for (size_t index = 0; index < room.npc_count; ++index) {
        const TopDownNpcData& npc = room.npcs[index];
        Rect npc_rect {
            npc.position_pixels.x,
            npc.position_pixels.y,
            npc.size_pixels.x,
            npc.size_pixels.y
        };
        if (intersects(player_rect, npc_rect)) {
            return npc.on_interact;
        }
    }
    return empty_event_script();
}

constexpr TopDownTriggerResult update_trigger_state(
    const TopDownTriggerData& trigger,
    TopDownTriggerState& state,
    const Actor& player
) {
    if (state.cooldown_remaining > 0) {
        --state.cooldown_remaining;
    }

    const bool is_inside = intersects(actor_rect(player), trigger.area_pixels);
    if (is_inside && !state.inside) {
        state.inside = true;
        if (trigger.run_once && state.fired) {
            return TopDownTriggerResult::None;
        }
        if (state.cooldown_remaining > 0) {
            return TopDownTriggerResult::None;
        }
        state.fired = true;
        state.cooldown_remaining = trigger.cooldown_frames;
        return TopDownTriggerResult::Enter;
    }

    if (!is_inside && state.inside) {
        state.inside = false;
        return TopDownTriggerResult::Leave;
    }

    return TopDownTriggerResult::None;
}

constexpr EventScript trigger_event_script_for_result(
    const TopDownTriggerData& trigger,
    TopDownTriggerResult result
) {
    if (result == TopDownTriggerResult::Enter) {
        return trigger.on_enter;
    }
    if (result == TopDownTriggerResult::Leave) {
        return trigger.on_leave;
    }
    return empty_event_script();
}

constexpr TopDownTriggerResult update_tile_effect_state(
    const TopDownTileEffectEventData& effect_event,
    TopDownTriggerState& state,
    uint8_t active_effects
) {
    if (state.cooldown_remaining > 0) {
        --state.cooldown_remaining;
    }

    const bool is_inside = (active_effects & effect_event.effect_mask) != 0;
    if (is_inside && !state.inside) {
        state.inside = true;
        if (effect_event.run_once && state.fired) {
            return TopDownTriggerResult::None;
        }
        if (state.cooldown_remaining > 0) {
            return TopDownTriggerResult::None;
        }
        state.fired = true;
        state.cooldown_remaining = effect_event.cooldown_frames;
        return TopDownTriggerResult::Enter;
    }

    if (!is_inside && state.inside) {
        state.inside = false;
        return TopDownTriggerResult::Leave;
    }

    return TopDownTriggerResult::None;
}

constexpr EventScript tile_effect_event_script_for_result(
    const TopDownTileEffectEventData& effect_event,
    TopDownTriggerResult result
) {
    if (result == TopDownTriggerResult::Enter) {
        return effect_event.on_enter;
    }
    if (result == TopDownTriggerResult::Leave) {
        return effect_event.on_leave;
    }
    return empty_event_script();
}

constexpr bool is_valid_room_index(const TopDownProjectData& project, int room_index) {
    return room_index >= 0 && static_cast<size_t>(room_index) < project.room_count;
}

constexpr bool is_valid_project_script_index(const TopDownProjectData& project, int script_index) {
    return project.scripts != nullptr &&
           script_index >= 0 &&
           static_cast<size_t>(script_index) < project.script_count;
}

constexpr bool is_valid_dialogue_choice_index(const TopDownProjectData& project, int choice_index) {
    return project.dialogue_choices != nullptr &&
           choice_index >= 0 &&
           static_cast<size_t>(choice_index) < project.dialogue_choice_count;
}

constexpr int find_room_index_by_name(const TopDownProjectData& project, const char* name) {
    if (project.rooms == nullptr || name == nullptr) {
        return -1;
    }
    for (size_t index = 0; index < project.room_count; ++index) {
        if (string_equals(project.rooms[index].name, name)) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

constexpr int find_npc_index_by_name(const TopDownRoomData& room, const char* name) {
    if (room.npcs == nullptr || name == nullptr) {
        return -1;
    }
    for (size_t index = 0; index < room.npc_count; ++index) {
        if (string_equals(room.npcs[index].name, name)) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

constexpr int find_named_script_index(const TopDownProjectData& project, const char* name) {
    if (project.named_scripts == nullptr || name == nullptr) {
        return -1;
    }
    for (size_t index = 0; index < project.named_script_count; ++index) {
        if (string_equals(project.named_scripts[index].name, name)) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

constexpr EventScript named_script_for(const TopDownProjectData& project, const char* name) {
    int index = find_named_script_index(project, name);
    if (index < 0) {
        return empty_event_script();
    }
    return project.named_scripts[index].script;
}

constexpr Camera camera_from_room_metadata(const TopDownProjectData& project, const TopDownRoomData& room) {
    Camera camera = project.camera;
    if (room.metadata.camera_mode == TopDownCameraMode::Follow) {
        camera.follow_player = true;
        camera.position_pixels = room.metadata.camera_position_pixels;
    } else if (room.metadata.camera_mode == TopDownCameraMode::Fixed) {
        camera.follow_player = false;
        camera.position_pixels = room.metadata.camera_position_pixels;
    }
    if (room.metadata.has_camera_bounds) {
        camera.bounds_enabled = true;
        camera.bounds_pixels = room.metadata.camera_bounds_pixels;
    } else {
        camera.bounds_enabled = false;
    }
    return camera;
}

constexpr bool room_has_player_start(const TopDownRoomData& room) {
    return room.metadata.has_player_start;
}

constexpr bool room_has_valid_music(const TopDownProjectData& project, const TopDownRoomData& room) {
    return room.metadata.has_music &&
           room.metadata.music_index >= 0 &&
           static_cast<size_t>(room.metadata.music_index) < project.music_asset_count;
}

constexpr uint16_t backdrop_color_for_room(const TopDownProjectData& project, const TopDownRoomData& room) {
    return room.metadata.has_backdrop_color ? room.metadata.backdrop_color : project.backdrop_color;
}

constexpr bool background_uses_compressed_tilemap(const TopDownBackgroundData& background) {
    return background.compressed_tilemap != nullptr;
}

constexpr bool is_valid_topdown_background_data(const TopDownBackgroundData& background) {
    return is_valid_background_layer(background.layer) &&
        (is_valid_streaming_tilemap_asset(background.tilemap) ||
         (background.compressed_tilemap != nullptr && is_valid_rle16_tilemap_asset(*background.compressed_tilemap)));
}

constexpr RenderAssetCost estimate_topdown_project_tile_asset_cost(const TileAsset& asset, bool mixed_resource_banks) {
    // A mixed project's shared table may contain 8bpp BG tiles for another runtime.
    // Top-down rooms only stream their own banks and cannot use those tiles.
    if (mixed_resource_banks && !asset.object_tiles && asset.color_depth == ColorDepth::Bpp8) {
        return RenderAssetCost { true, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 };
    }
    return estimate_tile_asset_cost(asset);
}

constexpr BackgroundParallax parallax_from_background(const TopDownBackgroundData& background) {
    return BackgroundParallax {
        background.layer,
        static_cast<int16_t>(background.parallax_256.x),
        static_cast<int16_t>(background.parallax_256.y),
        background.scroll_pixels
    };
}

constexpr bool is_valid_topdown_resource_banks(const TopDownProjectData& project) {
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

constexpr bool is_valid_topdown_resource_bank_groups(const TopDownProjectData& project) {
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

constexpr ResourceBankBatch resource_bank_batch_from_topdown_project(const TopDownProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_topdown_project(const TopDownProjectData& project, size_t group_index) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_topdown_resource_bank_group_index(const TopDownProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr ResourceBankGroup resource_bank_group_from_topdown_project(const TopDownProjectData& project, const char* name) {
    return resource_bank_group_by_name(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr const char* resource_bank_group_name_for_topdown_room(const TopDownRoomData& room) {
    return room.resource_bank_group_name != nullptr ? room.resource_bank_group_name : room.name;
}

constexpr int find_topdown_room_resource_bank_group_index(const TopDownProjectData& project, const TopDownRoomData& room) {
    return find_topdown_resource_bank_group_index(project, resource_bank_group_name_for_topdown_room(room));
}

constexpr ResourceBankGroup resource_bank_group_from_topdown_room(const TopDownProjectData& project, const TopDownRoomData& room) {
    return resource_bank_group_from_topdown_project(project, resource_bank_group_name_for_topdown_room(room));
}

constexpr bool is_valid_topdown_project_data(const TopDownProjectData& project) {
    if (project.rooms == nullptr ||
        project.room_count == 0 ||
        !is_valid_room_index(project, project.initial_room) ||
        project.player.metasprite == nullptr ||
        !is_valid_topdown_resource_banks(project) ||
        !is_valid_topdown_resource_bank_groups(project)) {
        return false;
    }
    if (project.background_count > 0 && project.backgrounds == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.background_count; ++index) {
        if (!is_valid_topdown_background_data(project.backgrounds[index])) {
            return false;
        }
    }
    return true;
}

} // namespace gbs
