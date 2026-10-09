#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/audio.hpp"
#include "gbs/assets.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/trigger.hpp"
#include "gbs/types.hpp"

namespace gbs {

struct IsoGridConfig {
    int tile_width_pixels;
    int tile_height_pixels;
    Vec2i origin_pixels;
    int height_step_pixels = 8;
};

constexpr IsoGridConfig default_iso_grid_config() {
    return IsoGridConfig { 32, 16, Vec2i { 120, 16 }, 8 };
}

struct IsoCoord {
    int x;
    int y;
    int z;
};

struct IsoCamera {
    Vec2i position_pixels;
    Rect bounds_pixels;
    bool bounds_enabled;
    int32_t zoom_x256 = 256;
    int32_t target_zoom_x256 = 256;
    bool follow_enabled = true;
    uint16_t smoothing_x256 = 256;
    Rect dead_zone_screen_pixels = Rect { 120, 80, 0, 0 };
    Vec2i pan_offset_pixels = Vec2i { 0, 0 };
    Vec2i shake_offset_pixels = Vec2i { 0, 0 };
    uint16_t shake_strength_pixels = 0;
    uint16_t shake_frames_remaining = 0;
    uint32_t shake_seed = 1;
};

struct IsoCameraZone {
    Rect area_tiles;
    Rect bounds_pixels;
    Vec2i offset_pixels;
    bool lock_x;
    bool lock_y;
};

struct IsoActor {
    IsoCoord tile;
    Vec2i screen_offset_pixels;
    uint16_t tile_index;
    uint16_t palette;
    bool visible;
    bool hflip;
    uint8_t priority;
    uint8_t width = 16;
    uint8_t height = 16;
    bool follow_player = true;
    const MetaSprite* metasprite = nullptr;
    const TileAsset* streamed_tile_asset = nullptr;
    int32_t position_x256 = 0;
    int32_t position_y256 = 0;
    bool position_initialized = false;
    uint8_t collision_group = 0;
    ColorDepth color_depth = ColorDepth::Bpp4;
};

enum class IsoActorDirection : uint8_t {
    Down = 0,
    Up = 1,
    Left = 2,
    Right = 3
};

inline int iso_actor_direction_value(IsoActorDirection direction) {
    return static_cast<int>(direction);
}

struct IsoActorAnimationSet {
    const SpriteAnimation* idle_down = nullptr;
    const SpriteAnimation* idle_up = nullptr;
    const SpriteAnimation* idle_left = nullptr;
    const SpriteAnimation* idle_right = nullptr;
    const SpriteAnimation* walk_down = nullptr;
    const SpriteAnimation* walk_up = nullptr;
    const SpriteAnimation* walk_left = nullptr;
    const SpriteAnimation* walk_right = nullptr;
    const SpriteAnimation* move_down = nullptr;
    const SpriteAnimation* move_up = nullptr;
    const SpriteAnimation* move_left = nullptr;
    const SpriteAnimation* move_right = nullptr;
    const SpriteAnimation* attack_down = nullptr;
    const SpriteAnimation* attack_up = nullptr;
    const SpriteAnimation* attack_left = nullptr;
    const SpriteAnimation* attack_right = nullptr;
    const SpriteAnimation* hurt_down = nullptr;
    const SpriteAnimation* hurt_up = nullptr;
    const SpriteAnimation* hurt_left = nullptr;
    const SpriteAnimation* hurt_right = nullptr;
    const SpriteAnimation* defeat_down = nullptr;
    const SpriteAnimation* defeat_up = nullptr;
    const SpriteAnimation* defeat_left = nullptr;
    const SpriteAnimation* defeat_right = nullptr;
};

enum class IsoActorAnimationMode : uint8_t {
    Idle = 0,
    Move = 1,
    Attack = 2,
    Hurt = 3,
    Defeat = 4
};

struct IsoActorAnimationState {
    IsoActorDirection direction = IsoActorDirection::Down;
    bool walking = false;
    uint8_t frame_index = 0;
    uint8_t frame_elapsed = 0;
    IsoActorAnimationMode mode = IsoActorAnimationMode::Idle;
    bool completed = false;
};

struct IsoActorEventData {
    size_t actor_index;
    EventScript script;
};

struct IsoTileEventData {
    IsoCoord tile;
    EventScript script;
    int width_tiles = 1;
    int height_tiles = 1;
};

enum IsoTileFlags : uint8_t {
    IsoTileEmpty = 0,
    IsoTileBlocked = 1 << 0,
    IsoTileWater = 1 << 1,
    IsoTileDamage = 1 << 2,
};

enum IsoRampFlags : uint8_t {
    IsoRampNone = 0,
    IsoRampUpRight = 1 << 1,
    IsoRampUpLeft = 1 << 2,
};

enum class IsoWorldMode : uint8_t {
    ScrollableTiledWorld = 0,
    StaticComposition = 1,
};

enum class IsoGameplayMode : uint8_t {
    Adventure = 0,
    Tactical = 1,
};

enum class IsoMovementModel : uint8_t {
    Free = 0,
    Tile = 1,
};

constexpr int32_t iso_position_scale = 256;
constexpr int32_t iso_free_movement_step_x256 = 16;

struct IsoTacticalUnitData {
    size_t actor_index;
    uint8_t team;
    uint8_t move_range;
    uint8_t attack_range;
    uint8_t max_hp;
    uint8_t attack_power;
};

struct IsoTacticalRoomData {
    const IsoTacticalUnitData* units;
    size_t unit_count;
    size_t active_unit_index;
    uint8_t active_team;
};

enum class IsoTacticalCapability : uint8_t {
    Surface = 0,
    GridOverlay = 1,
    Hud = 2,
    Units = 3,
    Props = 4,
    Feedback = 5,
    Audio = 6
};

enum class IsoTacticalAudioCue : uint8_t {
    Cursor = 0,
    Select = 1,
    Cancel = 2,
    Move = 3,
    Attack = 4,
    Hit = 5,
    Turn = 6,
    Victory = 7,
    Defeat = 8
};

constexpr size_t iso_tactical_audio_cue_count = 9;

constexpr uint16_t iso_tactical_capability_bit(IsoTacticalCapability capability) {
    return static_cast<uint16_t>(1u << static_cast<uint8_t>(capability));
}

struct IsoTacticalUnitPresentationData {
    size_t actor_index;
    const IsoActorAnimationSet* animations;
};

struct IsoTacticalPropData {
    const MetaSprite* metasprite;
    IsoCoord tile;
    uint8_t kind;
    bool animated;
};

struct IsoTacticalSurfacePage {
    const TileMapAsset* surface;
    const char* resource_bank_group_name;
    Rect world_pixels;
};

constexpr size_t iso_tactical_surface_page_none = static_cast<size_t>(-1);

constexpr size_t select_iso_tactical_surface_page(
    const IsoTacticalSurfacePage* pages,
    size_t page_count,
    Vec2i camera_position_pixels,
    Vec2i viewport_size_pixels = Vec2i { 240, 160 }
) {
    if (pages == nullptr || page_count == 0) {
        return iso_tactical_surface_page_none;
    }
    const int center_x = camera_position_pixels.x + viewport_size_pixels.x / 2;
    const int center_y = camera_position_pixels.y + viewport_size_pixels.y / 2;
    for (size_t index = 0; index < page_count; ++index) {
        const Rect& world = pages[index].world_pixels;
        if (center_x >= world.x && center_x < world.x + world.width &&
            center_y >= world.y && center_y < world.y + world.height) {
            return index;
        }
    }
    return 0;
}

constexpr Vec2i iso_tactical_surface_page_scroll(
    const IsoTacticalSurfacePage& page,
    Vec2i camera_position_pixels
) {
    return Vec2i {
        camera_position_pixels.x - page.world_pixels.x,
        camera_position_pixels.y - page.world_pixels.y
    };
}

struct IsoTacticalPresentationData {
    uint16_t capability_mask;
    const TileMapAsset* surface;
    const IsoTacticalSurfacePage* surface_pages;
    size_t surface_page_count;
    uint8_t max_resident_surface_groups;
    uint16_t surface_prefetch_margin_pixels;
    const TileMapAsset* grid;
    const TileMapAsset* hud;
    const IsoTacticalUnitPresentationData* units;
    size_t unit_count;
    const IsoTacticalPropData* props;
    size_t prop_count;
    const MetaSprite* cursor;
    const MetaSprite* range;
    const MetaSprite* target;
    const MetaSprite* emotes;
    const MetaSprite* feedback;
    const TrackerAsset* music;
    const SfxAsset* audio_cues;
    size_t audio_cue_count;
};

constexpr bool iso_tactical_capability_enabled(
    const IsoTacticalPresentationData& presentation,
    IsoTacticalCapability capability
) {
    return (presentation.capability_mask & iso_tactical_capability_bit(capability)) != 0;
}

constexpr Vec2i iso_tactical_surface_camera_position(
    const IsoTacticalPresentationData& presentation,
    Vec2i camera_position_pixels,
    Vec2i viewport_size_pixels = Vec2i { 240, 160 }
) {
    if (presentation.surface_pages == nullptr ||
        presentation.surface_page_count == 0 ||
        presentation.max_resident_surface_groups != 1) {
        return camera_position_pixels;
    }
    const size_t page_index = select_iso_tactical_surface_page(
        presentation.surface_pages,
        presentation.surface_page_count,
        camera_position_pixels,
        viewport_size_pixels
    );
    if (page_index == iso_tactical_surface_page_none) {
        return camera_position_pixels;
    }
    const Rect& page = presentation.surface_pages[page_index].world_pixels;
    if (page.width != viewport_size_pixels.x || page.height != viewport_size_pixels.y) {
        return camera_position_pixels;
    }
    return Vec2i { page.x, page.y };
}

/*
 * A tactical surface page owns the BG tile slots used by the visible arena.
 * Keep the camera on the last committed page while the next page is still
 * being uploaded. This makes the page change a single observable commit for
 * the surface, grid, HUD, cursor and actors instead of exposing a frame with
 * mismatched tile graphics and tilemap entries.
 */
constexpr Vec2i iso_tactical_surface_camera_position_with_page_lock(
    const IsoTacticalPresentationData& presentation,
    Vec2i camera_position_pixels,
    size_t visible_page_index,
    bool requested_page_ready,
    Vec2i viewport_size_pixels = Vec2i { 240, 160 }
) {
    if (presentation.surface_pages == nullptr ||
        presentation.surface_page_count == 0 ||
        presentation.max_resident_surface_groups != 1) {
        return camera_position_pixels;
    }
    const size_t requested_page_index = select_iso_tactical_surface_page(
        presentation.surface_pages,
        presentation.surface_page_count,
        camera_position_pixels,
        viewport_size_pixels
    );
    if (requested_page_index == iso_tactical_surface_page_none) {
        return camera_position_pixels;
    }
    const bool has_visible_page = visible_page_index < presentation.surface_page_count;
    const size_t committed_page_index = has_visible_page &&
            requested_page_index != visible_page_index &&
            !requested_page_ready
        ? visible_page_index
        : requested_page_index;
    const Rect& page = presentation.surface_pages[committed_page_index].world_pixels;
    if (page.width != viewport_size_pixels.x || page.height != viewport_size_pixels.y) {
        return camera_position_pixels;
    }
    return Vec2i { page.x, page.y };
}

struct IsoTileMap {
    const uint8_t* flags;
    int width;
    int height;
    const uint8_t* height_levels = nullptr;
    const uint8_t* ramp_flags = nullptr;
};

struct IsoPickResult {
    bool hit;
    IsoCoord tile;
};

struct IsoPathStep {
    bool found;
    IsoCoord next_tile;
    Vec2i delta_tile;
};

constexpr uint8_t max_iso_tactical_move_steps = 15;

struct IsoTacticalMovePath {
    bool found = false;
    uint8_t length = 0;
    IsoCoord tiles[max_iso_tactical_move_steps] = {};
};

struct IsoCursorState {
    IsoCoord tile;
    bool active;
};

struct IsoDrawItem {
    Vec2i screen_pixels;
    uint16_t tile_index;
    uint16_t palette;
    uint16_t depth;
    uint16_t source_index;
    bool visible;
    bool hflip;
    uint8_t priority;
    uint8_t width = 16;
    uint8_t height = 16;
    bool vflip = false;
    ColorDepth color_depth = ColorDepth::Bpp4;
};

// The adventure renderer keeps a 320x192 circular surface so the hardware
// scroll can cover several movement steps before the CPU composes again.
constexpr size_t iso_surface_hardware_tile_capacity = 40u * 24u;

struct IsoSurfaceTileRun {
    size_t first_tile;
    size_t tile_count;
};

struct IsoSurfaceTileCache {
    uint32_t hashes[iso_surface_hardware_tile_capacity];
    bool initialized;
};

struct IsoBakedComposition {
    const uint8_t* tiles;
    uint16_t tile_count;
    const uint16_t* background;
    const uint16_t* foreground;
    uint16_t width;
    uint16_t height;
    Vec2i origin;
    const PaletteAsset* palette = nullptr;
    uint16_t paged_foreground_first_tile = 0;
};

struct IsometricRoomData {
    const uint8_t* visual_tiles;
    const uint8_t* collision_flags;
    int width_tiles;
    int height_tiles;
    const IsoActor* actors;
    size_t actor_count;
    IsoGridConfig grid;
    IsoCamera camera_start;
    const char* name = nullptr;
    EventScript on_enter = empty_event_script();
    EventScript on_exit = empty_event_script();
    EventScript on_update = empty_event_script();
    const IsoActorEventData* actor_interact_events = nullptr;
    size_t actor_interact_event_count = 0;
    const IsoActorEventData* actor_start_events = nullptr;
    size_t actor_start_event_count = 0;
    const IsoActorEventData* actor_update_events = nullptr;
    size_t actor_update_event_count = 0;
    const char* resource_bank_group_name = nullptr;
    const IsoTileEventData* tile_events = nullptr;
    size_t tile_event_count = 0;
    IsoCoord cursor_start = IsoCoord { 0, 0, 0 };
    bool cursor_start_enabled = false;
    const RuntimeTriggerData* triggers = nullptr;
    size_t trigger_count = 0;
    const uint8_t* bg3_tiles = nullptr;
    const uint8_t* bg2_tiles = nullptr;
    const uint8_t* bg1_tiles = nullptr;
    const uint8_t* bg0_tiles = nullptr;
    const TileMapAsset* tileset_tilemap = nullptr;
    int tileset_tile_width_pixels = 0;
    int tileset_tile_height_pixels = 0;
    int tileset_tile_offset_x_pixels = 0;
    int tileset_tile_offset_y_pixels = 0;
    const IsoCameraZone* camera_zones = nullptr;
    size_t camera_zone_count = 0;
    const uint8_t* height_levels = nullptr;
    const IsoActorAnimationSet* actor_animations = nullptr;
    const uint8_t* ramp_flags = nullptr;
    const TileAsset* tileset_tiles = nullptr;
    const TileMapAsset* authored_background_tilemap = nullptr;
    int tileset_render_width_pixels = 0;
    int tileset_render_height_pixels = 0;
    IsoWorldMode world_mode = IsoWorldMode::ScrollableTiledWorld;
    IsoGameplayMode gameplay_mode = IsoGameplayMode::Adventure;
    const IsoTacticalRoomData* tactical = nullptr;
    VideoComposition video = default_video_composition();
    const IsoTacticalPresentationData* tactical_presentation = nullptr;
    IsoMovementModel movement_model = IsoMovementModel::Free;
    int tileset_render_offset_y_pixels = 0;
    const IsoBakedComposition* baked_composition = nullptr;
    EventScript on_hit_group1 = empty_event_script();
    EventScript on_hit_group2 = empty_event_script();
    EventScript on_hit_group3 = empty_event_script();
};

constexpr bool is_tactical_isometric_room(const IsometricRoomData& room) {
    return room.gameplay_mode == IsoGameplayMode::Tactical && room.tactical != nullptr;
}

constexpr bool uses_authored_isometric_background(const IsometricRoomData& room) {
    return room.world_mode == IsoWorldMode::StaticComposition &&
        room.authored_background_tilemap != nullptr &&
        room.authored_background_tilemap->entries != nullptr;
}

constexpr bool uses_authored_isometric_background_as_tactical_surface_fallback(
    const IsometricRoomData& room,
    const IsoTacticalPresentationData& presentation
) {
    return uses_authored_isometric_background(room) &&
        !iso_tactical_capability_enabled(presentation, IsoTacticalCapability::Surface);
}

struct IsometricProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const PaletteAsset* obj_palettes;
    size_t obj_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const IsometricRoomData* rooms;
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
    VideoComposition video = default_video_composition();
};

constexpr size_t max_isometric_save_actors = 16;
constexpr size_t no_iso_actor_index = static_cast<size_t>(-1);

bool iso_coord_in_bounds(const IsoTileMap& map, IsoCoord tile);
bool iso_coord_blocked(const IsoTileMap& map, IsoCoord tile);

struct IsometricSaveActorData {
    int16_t tile_x;
    int16_t tile_y;
    int16_t tile_z;
    int16_t screen_offset_x;
    int16_t screen_offset_y;
    uint16_t tile_index;
    uint16_t palette;
    uint8_t visible;
    uint8_t hflip;
    uint8_t priority;
    uint8_t follow_player;
};

struct IsometricSaveData {
    uint16_t room_index;
    uint16_t actor_count;
    IsometricSaveActorData actors[max_isometric_save_actors];
    int32_t camera_x;
    int32_t camera_y;
    int32_t camera_zoom_x256;
    int32_t camera_target_zoom_x256;
    int32_t camera_pan_x;
    int32_t camera_pan_y;
    uint8_t player_position_sub_x256 = 0;
    uint8_t player_position_sub_y256 = 0;
    uint8_t player_position_initialized = 0;
    uint32_t play_time_frames;
    uint16_t flags;
    int16_t cursor_tile_x;
    int16_t cursor_tile_y;
    int16_t cursor_tile_z;
    uint8_t cursor_active;
};

constexpr bool is_valid_iso_grid(const IsoGridConfig& config) {
    return config.tile_width_pixels > 0 &&
        config.tile_height_pixels > 0 &&
        (config.tile_width_pixels % 2) == 0 &&
        (config.tile_height_pixels % 2) == 0;
}

constexpr bool iso_movement_step_due(bool pressed, bool held, uint32_t frame, uint8_t repeat_interval_frames = 8) {
    return pressed ||
        (held && repeat_interval_frames > 0 && (frame % repeat_interval_frames) == 0);
}

constexpr IsoTileMap iso_tilemap_from_room(const IsometricRoomData& room) {
    return IsoTileMap { room.collision_flags, room.width_tiles, room.height_tiles, room.height_levels, room.ramp_flags };
}

inline void sync_iso_actor_position_from_tile(IsoActor& actor) {
    actor.position_x256 = static_cast<int32_t>(actor.tile.x * iso_position_scale);
    actor.position_y256 = static_cast<int32_t>(actor.tile.y * iso_position_scale);
    actor.position_initialized = true;
}

inline void initialize_iso_actor_position(IsoActor& actor) {
    if (!actor.position_initialized) {
        sync_iso_actor_position_from_tile(actor);
    }
}

inline Vec2i iso_actor_world_position_pixels(const IsoActor& actor, const IsoGridConfig& config = default_iso_grid_config()) {
    const int32_t world_x256 = actor.position_initialized
        ? actor.position_x256
        : static_cast<int32_t>(actor.tile.x * iso_position_scale);
    const int32_t world_y256 = actor.position_initialized
        ? actor.position_y256
        : static_cast<int32_t>(actor.tile.y * iso_position_scale);
    const int64_t diagonal_x256 = static_cast<int64_t>(world_x256) - world_y256;
    const int64_t diagonal_y256 = static_cast<int64_t>(world_x256) + world_y256;
    return Vec2i {
        config.origin_pixels.x + static_cast<int>(diagonal_x256 * config.tile_width_pixels / (2 * iso_position_scale)),
        config.origin_pixels.y + static_cast<int>(diagonal_y256 * config.tile_height_pixels / (2 * iso_position_scale)) - actor.tile.z * config.height_step_pixels
    };
}

constexpr bool is_valid_isometric_room_index(const IsometricProjectData& project, int room_index) {
    return project.rooms != nullptr &&
        room_index >= 0 &&
        static_cast<size_t>(room_index) < project.room_count;
}

constexpr bool is_valid_isometric_dialogue_line_index(const IsometricProjectData& project, int line_index) {
    return line_index < 0 ||
        (project.dialogue_lines != nullptr &&
            static_cast<size_t>(line_index) < project.dialogue_line_count &&
            project.dialogue_lines[line_index].text != nullptr);
}

constexpr bool is_valid_isometric_resource_banks(const IsometricProjectData& project) {
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

constexpr bool is_valid_isometric_resource_bank_groups(const IsometricProjectData& project) {
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

constexpr ResourceBankBatch resource_bank_batch_from_isometric_project(const IsometricProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_isometric_project(const IsometricProjectData& project, size_t group_index) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_isometric_resource_bank_group_index(const IsometricProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr ResourceBankGroup resource_bank_group_from_isometric_project(const IsometricProjectData& project, const char* name) {
    return resource_bank_group_by_name(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr const char* resource_bank_group_name_for_isometric_room(const IsometricRoomData& room) {
    return room.resource_bank_group_name != nullptr ? room.resource_bank_group_name : room.name;
}

constexpr int find_isometric_room_resource_bank_group_index(const IsometricProjectData& project, const IsometricRoomData& room) {
    return find_isometric_resource_bank_group_index(project, resource_bank_group_name_for_isometric_room(room));
}

constexpr ResourceBankGroup resource_bank_group_from_isometric_room(const IsometricProjectData& project, const IsometricRoomData& room) {
    return resource_bank_group_from_isometric_project(project, resource_bank_group_name_for_isometric_room(room));
}

constexpr bool is_valid_isometric_project_data(const IsometricProjectData& project) {
    return project.rooms != nullptr &&
        project.room_count > 0 &&
        is_valid_isometric_room_index(project, project.initial_room) &&
        is_valid_isometric_resource_banks(project) &&
        is_valid_isometric_resource_bank_groups(project) &&
        (project.dialogue_line_count == 0 || project.dialogue_lines != nullptr);
}

constexpr bool is_valid_isometric_save_data(const IsometricProjectData& project, const IsometricSaveData& save_data) {
    return is_valid_isometric_room_index(project, save_data.room_index) &&
        save_data.actor_count <= max_isometric_save_actors &&
        save_data.camera_zoom_x256 >= 128 &&
        save_data.camera_zoom_x256 <= 1024 &&
        save_data.camera_target_zoom_x256 >= 128 &&
        save_data.camera_target_zoom_x256 <= 1024;
}

inline IsometricSaveActorData capture_isometric_save_actor(const IsoActor& actor) {
    return IsometricSaveActorData {
        static_cast<int16_t>(actor.tile.x),
        static_cast<int16_t>(actor.tile.y),
        static_cast<int16_t>(actor.tile.z),
        static_cast<int16_t>(actor.screen_offset_pixels.x),
        static_cast<int16_t>(actor.screen_offset_pixels.y),
        actor.tile_index,
        actor.palette,
        static_cast<uint8_t>(actor.visible ? 1 : 0),
        static_cast<uint8_t>(actor.hflip ? 1 : 0),
        actor.priority,
        static_cast<uint8_t>(actor.follow_player ? 1 : 0)
    };
}

inline IsoActor isometric_actor_from_save_data(const IsometricSaveActorData& save_actor) {
    IsoActor actor {
        IsoCoord { save_actor.tile_x, save_actor.tile_y, save_actor.tile_z },
        Vec2i { save_actor.screen_offset_x, save_actor.screen_offset_y },
        save_actor.tile_index,
        save_actor.palette,
        save_actor.visible != 0,
        save_actor.hflip != 0,
        save_actor.priority,
        16,
        16,
        save_actor.follow_player != 0
    };
    return actor;
}

inline uint8_t iso_save_position_subcell(int32_t position_x256, int tile) {
    const int32_t tile_position_x256 = static_cast<int32_t>(tile * iso_position_scale);
    const int32_t remainder = position_x256 - tile_position_x256;
    return static_cast<uint8_t>(remainder < 0 ? 0 : (remainder >= iso_position_scale ? iso_position_scale - 1 : remainder));
}

inline size_t capture_isometric_save_data(
    IsometricSaveData& save_data,
    int room_index,
    const IsoActor* actors,
    size_t actor_count,
    const IsoCamera& camera,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0,
    const IsoCursorState* cursor = nullptr
) {
    save_data.room_index = static_cast<uint16_t>(room_index < 0 ? 0 : room_index);
    size_t saved_actor_count = actors == nullptr ? 0 : (actor_count < max_isometric_save_actors ? actor_count : max_isometric_save_actors);
    save_data.actor_count = static_cast<uint16_t>(saved_actor_count);
    for (size_t index = 0; index < max_isometric_save_actors; ++index) {
        save_data.actors[index] = IsometricSaveActorData {};
    }
    if (actors != nullptr) {
        for (size_t index = 0; index < saved_actor_count; ++index) {
            save_data.actors[index] = capture_isometric_save_actor(actors[index]);
        }
    }
    save_data.camera_x = camera.position_pixels.x;
    save_data.camera_y = camera.position_pixels.y;
    save_data.camera_zoom_x256 = camera.zoom_x256;
    save_data.camera_target_zoom_x256 = camera.target_zoom_x256;
    save_data.camera_pan_x = camera.pan_offset_pixels.x;
    save_data.camera_pan_y = camera.pan_offset_pixels.y;
    save_data.player_position_sub_x256 = 0;
    save_data.player_position_sub_y256 = 0;
    save_data.player_position_initialized = 0;
    if (actors != nullptr && saved_actor_count > 0) {
        const IsoActor& player = actors[0];
        const int32_t player_position_x256 = player.position_initialized
            ? player.position_x256
            : static_cast<int32_t>(player.tile.x * iso_position_scale);
        const int32_t player_position_y256 = player.position_initialized
            ? player.position_y256
            : static_cast<int32_t>(player.tile.y * iso_position_scale);
        save_data.player_position_sub_x256 = iso_save_position_subcell(player_position_x256, player.tile.x);
        save_data.player_position_sub_y256 = iso_save_position_subcell(player_position_y256, player.tile.y);
        save_data.player_position_initialized = static_cast<uint8_t>(player.position_initialized ? 1 : 0);
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
    IsoCoord cursor_tile = cursor != nullptr ? cursor->tile : IsoCoord { 0, 0, 0 };
    save_data.cursor_tile_x = static_cast<int16_t>(cursor_tile.x);
    save_data.cursor_tile_y = static_cast<int16_t>(cursor_tile.y);
    save_data.cursor_tile_z = static_cast<int16_t>(cursor_tile.z);
    save_data.cursor_active = static_cast<uint8_t>(cursor != nullptr && cursor->active ? 1 : 0);
    return saved_actor_count;
}

inline bool apply_isometric_save_data(
    const IsometricProjectData& project,
    const IsometricSaveData& save_data,
    IsoActor* actors,
    size_t actor_capacity,
    size_t& actor_count,
    IsoCamera& camera,
    EventState& event_state,
    IsoCursorState* cursor = nullptr
) {
    if (!is_valid_isometric_save_data(project, save_data) || actors == nullptr || save_data.actor_count > actor_capacity) {
        return false;
    }
    for (size_t index = 0; index < save_data.actor_count; ++index) {
        actors[index] = isometric_actor_from_save_data(save_data.actors[index]);
    }
    for (size_t index = save_data.actor_count; index < actor_capacity; ++index) {
        actors[index] = IsoActor {};
    }
    actor_count = save_data.actor_count;
    camera.position_pixels = Vec2i { save_data.camera_x, save_data.camera_y };
    camera.zoom_x256 = save_data.camera_zoom_x256;
    camera.target_zoom_x256 = save_data.camera_target_zoom_x256;
    camera.pan_offset_pixels = Vec2i { save_data.camera_pan_x, save_data.camera_pan_y };
    event_state.current_room = save_data.room_index;
    if (actor_count > 0) {
        event_state.player_x = actors[0].tile.x;
        event_state.player_y = actors[0].tile.y;
        if (save_data.player_position_initialized != 0) {
            actors[0].position_x256 = static_cast<int32_t>(actors[0].tile.x * iso_position_scale) + save_data.player_position_sub_x256;
            actors[0].position_y256 = static_cast<int32_t>(actors[0].tile.y * iso_position_scale) + save_data.player_position_sub_y256;
            actors[0].position_initialized = true;
        } else {
            initialize_iso_actor_position(actors[0]);
        }
    }
    if (cursor != nullptr) {
        cursor->tile = IsoCoord { save_data.cursor_tile_x, save_data.cursor_tile_y, save_data.cursor_tile_z };
        cursor->active = save_data.cursor_active != 0;
    }
    return true;
}

constexpr EventScript iso_actor_event_script_for(const IsoActorEventData* events, size_t event_count, size_t actor_index) {
    if (events == nullptr) {
        return empty_event_script();
    }
    for (size_t index = 0; index < event_count; ++index) {
        if (events[index].actor_index == actor_index) {
            return events[index].script;
        }
    }
    return empty_event_script();
}

constexpr EventScript iso_actor_interact_event_script_for(const IsometricRoomData& room, size_t actor_index) {
    return iso_actor_event_script_for(room.actor_interact_events, room.actor_interact_event_count, actor_index);
}

constexpr EventScript iso_actor_start_event_script_for(const IsometricRoomData& room, size_t actor_index) {
    return iso_actor_event_script_for(room.actor_start_events, room.actor_start_event_count, actor_index);
}

constexpr EventScript iso_actor_update_event_script_for(const IsometricRoomData& room, size_t actor_index) {
    return iso_actor_event_script_for(room.actor_update_events, room.actor_update_event_count, actor_index);
}

constexpr EventScript iso_room_hit_script_for_collision_group(
    const IsometricRoomData& room,
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

constexpr bool iso_coord_equals(IsoCoord a, IsoCoord b) {
    return a.x == b.x && a.y == b.y && a.z == b.z;
}

constexpr bool is_valid_iso_actor_index(size_t actor_count, int actor_index) {
    return actor_index >= 0 && static_cast<size_t>(actor_index) < actor_count;
}

constexpr void apply_iso_actor_event_command(
    IsoActor* actors,
    size_t actor_count,
    const EventActorCommand& command
) {
    if (actors == nullptr || !is_valid_iso_actor_index(actor_count, command.actor_index)) {
        return;
    }

    IsoActor& actor = actors[command.actor_index];
    switch (command.op) {
    case EventActorOp::None:
        break;
    case EventActorOp::SetVisible:
    case EventActorOp::SetActive:
        actor.visible = command.a != 0;
        break;
    case EventActorOp::SetPosition:
        actor.tile.x = command.a;
        actor.tile.y = command.b;
        sync_iso_actor_position_from_tile(actor);
        break;
    case EventActorOp::MoveRelative:
        actor.tile.x += command.a;
        actor.tile.y += command.b;
        sync_iso_actor_position_from_tile(actor);
        break;
    case EventActorOp::SetDirection:
        actor.hflip = command.a < 0;
        break;
    case EventActorOp::SetSpeed:
        break;
    case EventActorOp::SetAnimation:
        actor.tile_index = static_cast<uint16_t>(command.a < 0 ? 0 : command.a);
        break;
    case EventActorOp::SetAnimationSpeed:
        break;
    case EventActorOp::SetAnimationFrame:
        break;
    case EventActorOp::SetCollisionEnabled:
        break;
    case EventActorOp::SetCollisionBox:
        break;
    case EventActorOp::SetSprite:
    case EventActorOp::PushFacing:
    case EventActorOp::Push:
    case EventActorOp::CancelMovement: // Export currently restricts cancellation to topdown.
        break;
    }
}

constexpr bool iso_actor_event_command_targets_actor(size_t actor_count, const EventActorCommand& command) {
    return command.op != EventActorOp::None && is_valid_iso_actor_index(actor_count, command.actor_index);
}

constexpr size_t apply_iso_actor_event_commands(
    IsoActor* actors,
    size_t actor_count,
    const EventActorCommand* commands,
    size_t command_count
) {
    if (commands == nullptr) {
        return 0;
    }

    size_t applied_count = 0;
    for (size_t index = 0; index < command_count; ++index) {
        if (iso_actor_event_command_targets_actor(actor_count, commands[index])) {
            ++applied_count;
        }
        apply_iso_actor_event_command(actors, actor_count, commands[index]);
    }
    return applied_count;
}

inline size_t consume_iso_actor_event_commands(
    IsoActor* actors,
    size_t actor_count,
    EventState& state
) {
    size_t applied_count = apply_iso_actor_event_commands(
        actors,
        actor_count,
        state.actor_commands,
        state.actor_command_count
    );
    reset_event_actor_commands(state);
    return applied_count;
}

constexpr size_t find_iso_actor_at_tile(
    const IsoActor* actors,
    size_t actor_count,
    IsoCoord tile,
    size_t first_actor_index = 0,
    bool visible_only = true
) {
    if (actors == nullptr || first_actor_index >= actor_count) {
        return no_iso_actor_index;
    }
    for (size_t index = first_actor_index; index < actor_count; ++index) {
        if ((!visible_only || actors[index].visible) && iso_coord_equals(actors[index].tile, tile)) {
            return index;
        }
    }
    return no_iso_actor_index;
}

constexpr size_t find_iso_actor_at_cursor(
    const IsoCursorState& cursor,
    const IsoActor* actors,
    size_t actor_count,
    size_t first_actor_index = 0,
    bool visible_only = true
) {
    return cursor.active
        ? find_iso_actor_at_tile(actors, actor_count, cursor.tile, first_actor_index, visible_only)
        : no_iso_actor_index;
}

constexpr EventScript iso_cursor_actor_interact_event_script_for(
    const IsometricRoomData& room,
    const IsoCursorState& cursor,
    const IsoActor* actors,
    size_t actor_count,
    size_t first_actor_index = 1
) {
    size_t actor_index = find_iso_actor_at_cursor(cursor, actors, actor_count, first_actor_index);
    return actor_index != no_iso_actor_index
        ? iso_actor_interact_event_script_for(room, actor_index)
        : empty_event_script();
}

constexpr bool iso_tile_event_contains(const IsoTileEventData& event, IsoCoord tile) {
    const int width = event.width_tiles > 0 ? event.width_tiles : 1;
    const int height = event.height_tiles > 0 ? event.height_tiles : 1;
    return tile.z == event.tile.z &&
        tile.x >= event.tile.x &&
        tile.y >= event.tile.y &&
        tile.x < event.tile.x + width &&
        tile.y < event.tile.y + height;
}

constexpr IsoCursorState iso_cursor_from_tile(IsoCoord tile, bool active = false) {
    return IsoCursorState { tile, active };
}

constexpr IsoCursorState iso_cursor_from_actor(const IsoActor& actor, bool active = false) {
    return iso_cursor_from_tile(actor.tile, active);
}

constexpr IsoCoord iso_coord_with_delta(IsoCoord tile, Vec2i delta_tile) {
    return IsoCoord { tile.x + delta_tile.x, tile.y + delta_tile.y, tile.z };
}

uint8_t iso_tile_height_at(const IsoTileMap& map, int x, int y);

inline bool move_iso_cursor_by_delta(
    const IsoTileMap& map,
    IsoCursorState& cursor,
    Vec2i delta_tile,
    bool allow_blocked_tiles = true
) {
    IsoCoord next = iso_coord_with_delta(cursor.tile, delta_tile);
    if (!iso_coord_in_bounds(map, next)) {
        return false;
    }
    if (!allow_blocked_tiles && iso_coord_blocked(map, next)) {
        return false;
    }
    next.z = iso_tile_height_at(map, next.x, next.y);
    cursor.tile = next;
    return true;
}

constexpr IsoCoord iso_selected_tile(const IsoCursorState& cursor, const IsoActor& fallback_actor) {
    return cursor.active ? cursor.tile : fallback_actor.tile;
}

constexpr IsoCoord iso_room_cursor_start(
    const IsometricRoomData& room,
    const IsoActor* actors = nullptr,
    size_t actor_count = 0
) {
    if (room.cursor_start_enabled) {
        return room.cursor_start;
    }
    if (actors != nullptr && actor_count > 0) {
        return actors[0].tile;
    }
    return IsoCoord { 0, 0, 0 };
}

constexpr IsoCursorState iso_cursor_from_room(
    const IsometricRoomData& room,
    const IsoActor* actors = nullptr,
    size_t actor_count = 0,
    bool active = false
) {
    return IsoCursorState { iso_room_cursor_start(room, actors, actor_count), active };
}

constexpr EventScript iso_tile_event_script_for(const IsometricRoomData& room, IsoCoord tile) {
    if (room.tile_events == nullptr) {
        return empty_event_script();
    }
    for (size_t index = 0; index < room.tile_event_count; ++index) {
        if (iso_tile_event_contains(room.tile_events[index], tile)) {
            return room.tile_events[index].script;
        }
    }
    return empty_event_script();
}

Vec2i iso_tile_to_screen(IsoCoord tile, const IsoGridConfig& config = default_iso_grid_config());
IsoCoord iso_screen_to_tile(Vec2i screen_pixels, const IsoGridConfig& config = default_iso_grid_config());
bool iso_point_in_tile_diamond(Vec2i screen_pixels, IsoCoord tile, const IsoGridConfig& config = default_iso_grid_config());
IsoPickResult iso_pick_tile(Vec2i screen_pixels, const IsoTileMap& map, const IsoGridConfig& config = default_iso_grid_config());
uint16_t iso_depth_key(IsoCoord tile, const IsoGridConfig& config = default_iso_grid_config());
uint8_t iso_tile_flags_at(const IsoTileMap& map, int x, int y);
uint8_t iso_tile_ramp_at(const IsoTileMap& map, int x, int y);
bool iso_coord_in_bounds(const IsoTileMap& map, IsoCoord tile);
bool iso_coord_blocked(const IsoTileMap& map, IsoCoord tile);
bool iso_actor_occupies_tile(const IsoActor& actor, IsoCoord tile);
bool iso_coord_blocked_by_actors(IsoCoord tile, const IsoActor* actors, size_t actor_count, size_t ignore_actor_index = static_cast<size_t>(-1));
bool move_iso_actor_by_delta(const IsoTileMap& map, IsoActor& actor, Vec2i delta_tile, const IsoActor* blockers = nullptr, size_t blocker_count = 0, size_t ignore_actor_index = static_cast<size_t>(-1));
bool move_iso_actor_by_free_delta(
    const IsoTileMap& map,
    IsoActor& actor,
    Vec2i delta_axis,
    const IsoActor* blockers = nullptr,
    size_t blocker_count = 0,
    size_t ignore_actor_index = static_cast<size_t>(-1),
    int32_t step_x256 = iso_free_movement_step_x256
);
const SpriteAnimation* iso_actor_animation_for(const IsoActorAnimationSet& animations, const IsoActorAnimationState& state);
void set_iso_actor_animation_mode(IsoActorAnimationState& state, IsoActorAnimationMode mode);
void set_iso_actor_motion(IsoActorAnimationState& state, Vec2i delta_tile, bool walking);
void tick_iso_actor_animation(IsoActorAnimationState& state, const IsoActorAnimationSet& animations);
bool apply_iso_actor_animation(IsoActor& actor, const IsoActorAnimationSet& animations, const IsoActorAnimationState& state);
IsoPathStep find_iso_path_step_greedy(const IsoTileMap& map, IsoCoord start, IsoCoord target, const IsoActor* blockers = nullptr, size_t blocker_count = 0, size_t ignore_actor_index = static_cast<size_t>(-1));
IsoPathStep find_iso_path_step_bfs(
    const IsoTileMap& map,
    IsoCoord start,
    IsoCoord target,
    const IsoActor* blockers = nullptr,
    size_t blocker_count = 0,
    size_t ignore_actor_index = static_cast<size_t>(-1),
    uint8_t max_search_tiles = 64
);
IsoPathStep find_iso_path_step_astar(
    const IsoTileMap& map,
    IsoCoord start,
    IsoCoord target,
    const IsoActor* blockers = nullptr,
    size_t blocker_count = 0,
    size_t ignore_actor_index = static_cast<size_t>(-1),
    uint8_t max_search_tiles = 64
);
IsoTacticalMovePath plan_iso_tactical_move(
    const IsoTileMap& map,
    IsoCoord start,
    IsoCoord target,
    const IsoActor* blockers,
    size_t blocker_count,
    size_t ignore_actor_index,
    uint8_t max_steps
);
bool iso_tactical_can_attack(IsoCoord from, IsoCoord target, uint8_t range);
bool iso_tactical_can_attack(IsoCoord from, IsoCoord target, uint8_t range, const IsoTileMap* map);
IsoTacticalMovePath plan_iso_tactical_approach(
    const IsoTileMap& map, const IsoActor* actors, size_t actor_count,
    size_t actor_index, size_t target_index, uint8_t move_range, uint8_t attack_range
);
void clamp_iso_camera(IsoCamera& camera);
IsoCamera iso_surface_render_camera(const IsoCamera& camera);
void update_iso_camera_follow(IsoCamera& camera, IsoCoord focus, const IsoGridConfig& config = default_iso_grid_config());
Vec2i iso_camera_world_to_screen(const IsoCamera& camera, Vec2i world_pixels);
Vec2i iso_camera_screen_to_world(const IsoCamera& camera, Vec2i screen_pixels);
void tick_iso_camera(IsoCamera& camera, Vec2i focus_world_pixels);
void restore_iso_camera_bounds(IsoCamera& camera, const IsoCamera& base_camera);
bool apply_iso_camera_zones(IsoCamera& camera, IsoCoord focus, const IsoGridConfig& config, const IsoCameraZone* zones, size_t zone_count, const Vec2i* world_focus = nullptr);
void set_iso_camera_zoom(IsoCamera& camera, int32_t zoom_x256, bool immediate = false);
void set_iso_camera_pan(IsoCamera& camera, Vec2i offset_pixels);
void start_iso_camera_shake(IsoCamera& camera, uint16_t strength_pixels, uint16_t duration_frames, uint32_t seed = 1);
// Composes the 240x160 viewport in 8x8 tile order (64 bytes/tile). Preserves
// source tilemap palette banks; index zero remains transparent. CPU output
// only: the caller must reserve an 8bpp-compatible VRAM layout before upload.
bool render_iso_room_surface_indexed(
    const IsometricRoomData& room,
    const IsoCamera& camera,
    uint8_t* pixels,
    size_t capacity
);

bool render_iso_room_surface(
    const IsometricRoomData& room,
    const IsoCamera& camera,
    uint8_t* out_tile_pixels,
    size_t out_capacity
);
void reset_iso_surface_tile_cache(IsoSurfaceTileCache& cache);
// Requires a successful composition of the same immutable room in tile_pixels.
// Unsupported camera transforms are recomposed in full.
bool scroll_iso_room_surface(
    const IsometricRoomData& room,
    const IsoCamera& previous_camera,
    const IsoCamera& camera,
    uint8_t* tile_pixels,
    size_t capacity
);
size_t collect_iso_surface_dirty_tile_runs(
    IsoSurfaceTileCache& cache,
    const uint8_t* tile_pixels,
    size_t tile_count,
    IsoSurfaceTileRun* out_runs,
    size_t out_capacity
);
size_t compact_iso_surface_tiles(
    const uint8_t* source_tiles,
    size_t source_tile_count,
    uint8_t* out_unique_tiles,
    size_t out_unique_capacity,
    uint16_t* out_tilemap
);
size_t build_iso_draw_list(
    const IsoActor* actors,
    size_t actor_count,
    const IsoCamera& camera,
    IsoDrawItem* out_items,
    size_t out_capacity,
    const IsoGridConfig& config = default_iso_grid_config()
);
Vec2i iso_metasprite_center_offset(const MetaSprite& metasprite);
Vec2i iso_metasprite_diamond_center_offset(const MetaSprite& metasprite, const IsoGridConfig& grid);
size_t build_iso_metasprite_draw_list(
    const MetaSprite& metasprite,
    IsoCoord tile,
    Vec2i screen_offset,
    const IsoCamera& camera,
    IsoDrawItem* out_items,
    size_t out_capacity,
    uint16_t source_index,
    uint8_t priority = 0,
    const IsoGridConfig& config = default_iso_grid_config()
);
void sort_iso_draw_list(IsoDrawItem* items, size_t item_count);
void draw_iso_sprites(const IsoDrawItem* items, size_t item_count, int first_oam_index = 0, bool mosaic = false);

} // namespace gbs
