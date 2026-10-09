#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/assets.hpp"
#include "gbs/animation.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/types.hpp"

namespace gbs {

enum class ShmupEnemyMovementKind : uint8_t {
    Static = 0,
    Linear = 1,
    Sine = 2,
    Dive = 3
};

struct ShmupBackgroundLayerData {
    BackgroundLayer layer;
    TileMapAsset tilemap;
    Vec2i scroll_pixels_per_frame;
    uint8_t priority = 2;
    bool mosaic = false;
    int16_t parallax_x256 = 256;
    int16_t parallax_y256 = 256;
    Vec2i parallax_offset_pixels { 0, 0 };
    Vec2i scroll_offset_pixels { 0, 0 };
};

struct ShmupBackgroundData {
    const char* name;
    const ShmupBackgroundLayerData* layers;
    size_t layer_count;
    uint16_t backdrop_color;
    VideoComposition video = default_video_composition();
    const uint8_t* collision_flags = nullptr;
    size_t collision_count = 0;
    uint16_t collision_width_tiles = 0;
    uint16_t collision_height_tiles = 0;
    uint16_t world_width_pixels = 240;
    uint16_t world_height_pixels = 160;
    Vec2i affine_scroll_pixels_per_frame { 0, 0 };
};

constexpr int shmup_clamp_background_axis(int value, int extent_pixels, int viewport_pixels) {
    const int maximum = extent_pixels > viewport_pixels ? extent_pixels - viewport_pixels : 0;
    return value < 0 ? 0 : (value > maximum ? maximum : value);
}

constexpr Vec2i shmup_background_layer_camera_pixels(const ShmupBackgroundLayerData& layer, uint32_t frame) {
    return {
        shmup_clamp_background_axis(
            layer.scroll_pixels_per_frame.x * static_cast<int>(frame),
            static_cast<int>(layer.tilemap.width) * 8,
            240
        ),
        shmup_clamp_background_axis(
            layer.scroll_pixels_per_frame.y * static_cast<int>(frame),
            static_cast<int>(layer.tilemap.height) * 8,
            160
        )
    };
}

constexpr Vec2i shmup_background_layer_render_camera_pixels(const ShmupBackgroundLayerData& layer, uint32_t frame) {
    const Vec2i camera = shmup_background_layer_camera_pixels(layer, frame);
    return {
        shmup_clamp_background_axis(
            layer.parallax_offset_pixels.x + (camera.x * layer.parallax_x256) / 256 + layer.scroll_offset_pixels.x,
            static_cast<int>(layer.tilemap.width) * 8,
            240
        ),
        shmup_clamp_background_axis(
            layer.parallax_offset_pixels.y + (camera.y * layer.parallax_y256) / 256 + layer.scroll_offset_pixels.y,
            static_cast<int>(layer.tilemap.height) * 8,
            160
        )
    };
}

constexpr const ShmupBackgroundLayerData* shmup_background_primary_layer(const ShmupBackgroundData& background) {
    if (background.layers == nullptr || background.layer_count == 0) {
        return nullptr;
    }
    for (size_t index = 0; index < background.layer_count; ++index) {
        if (background.layers[index].layer == BackgroundLayer::BG2) {
            return &background.layers[index];
        }
    }
    return &background.layers[0];
}

constexpr Vec2i shmup_background_camera_pixels(const ShmupBackgroundData& background, uint32_t frame) {
    if (background.video.affine_enabled) {
        return {
            shmup_clamp_background_axis(
                background.affine_scroll_pixels_per_frame.x * static_cast<int>(frame),
                background.world_width_pixels > 0 ? background.world_width_pixels : 240,
                240
            ),
            shmup_clamp_background_axis(
                background.affine_scroll_pixels_per_frame.y * static_cast<int>(frame),
                background.world_height_pixels > 0 ? background.world_height_pixels : 160,
                160
            )
        };
    }
    const ShmupBackgroundLayerData* primary_layer = shmup_background_primary_layer(background);
    return primary_layer != nullptr
        ? shmup_background_layer_camera_pixels(*primary_layer, frame)
        : Vec2i { 0, 0 };
}

constexpr bool shmup_background_has_affine_video(const ShmupBackgroundData& background) {
    return background.video.affine_enabled;
}

constexpr bool shmup_background_collision_at(const ShmupBackgroundData& background, int tile_x, int tile_y) {
    if (background.collision_flags == nullptr ||
        background.collision_width_tiles == 0 ||
        background.collision_height_tiles == 0 ||
        tile_x < 0 ||
        tile_y < 0 ||
        tile_x >= static_cast<int>(background.collision_width_tiles) ||
        tile_y >= static_cast<int>(background.collision_height_tiles)) {
        return false;
    }
    const size_t index = static_cast<size_t>(tile_y) * background.collision_width_tiles + static_cast<size_t>(tile_x);
    return index < background.collision_count && (background.collision_flags[index] & 0x01u) != 0;
}

constexpr Vec2i shmup_world_to_viewport(Vec2i world_pixels, Vec2i camera_pixels) {
    return {
        world_pixels.x - camera_pixels.x,
        world_pixels.y - camera_pixels.y
    };
}

struct ShmupProjectileData {
    Vec2i size_pixels;
    Vec2i velocity_pixels_per_frame;
    uint8_t max_active;
    EventScript on_hit_enemy;
    const MetaSprite* metasprite = nullptr;
};

struct ShmupEnemyProjectileData {
    Vec2i size_pixels;
    Vec2i velocity_pixels_per_frame;
    uint8_t max_active;
    EventScript on_hit_player;
    const MetaSprite* metasprite = nullptr;
};

struct ShmupPlayerAnimationSet {
    const SpriteAnimation* idle = nullptr;
    const SpriteAnimation* fly = nullptr;
    const SpriteAnimation* bank_up = nullptr;
    const SpriteAnimation* bank_down = nullptr;
    const SpriteAnimation* shoot = nullptr;
    const SpriteAnimation* hurt = nullptr;
    const SpriteAnimation* explosion = nullptr;
};

constexpr bool is_valid_shmup_player_animation_set(const ShmupPlayerAnimationSet& clips) {
    const SpriteAnimation* animations[] = {
        clips.idle, clips.fly, clips.bank_up, clips.bank_down, clips.shoot, clips.hurt, clips.explosion
    };
    for (const auto* animation : animations) {
        if (animation != nullptr && !is_valid_sprite_animation(*animation)) return false;
    }
    return (clips.shoot == nullptr || !clips.shoot->loop) &&
        (clips.hurt == nullptr || !clips.hurt->loop) &&
        (clips.explosion == nullptr || !clips.explosion->loop);
}

enum class ShmupPlayerAnimationAction : uint8_t { Movement, Shoot, Hurt, Explosion };

struct ShmupPlayerAnimator {
    SpriteAnimatorState animator {};
    ShmupPlayerAnimationAction action = ShmupPlayerAnimationAction::Movement;
};

inline void init_shmup_player_animator(ShmupPlayerAnimator& player) {
    init_sprite_animator(player.animator);
    player.action = ShmupPlayerAnimationAction::Movement;
}

inline void update_shmup_player_animator(
    ShmupPlayerAnimator& player, const ShmupPlayerAnimationSet& clips,
    Vec2i movement, bool fired, bool damaged, bool alive
) {
    update_sprite_animator(player.animator);
    const SpriteAnimation* next = nullptr;
    auto action = ShmupPlayerAnimationAction::Movement;
    if (!alive) {
        // Keep a completed death clip stopped; the renderer hides it afterward.
        next = clips.explosion;
        action = ShmupPlayerAnimationAction::Explosion;
    } else if (damaged && clips.hurt != nullptr) {
        next = clips.hurt;
        action = ShmupPlayerAnimationAction::Hurt;
    } else if (player.animator.playing && player.action != ShmupPlayerAnimationAction::Movement) {
        next = player.animator.animation;
        action = player.action;
    } else if (fired && clips.shoot != nullptr) {
        next = clips.shoot;
        action = ShmupPlayerAnimationAction::Shoot;
    } else {
        next = movement.y < 0 ? clips.bank_up : movement.y > 0 ? clips.bank_down : nullptr;
        if (next == nullptr && (movement.x != 0 || movement.y != 0)) next = clips.fly;
        if (next == nullptr) next = clips.idle;
    }
    if (next != player.animator.animation || action != player.action ||
        (action == ShmupPlayerAnimationAction::Shoot && fired && !player.animator.playing)) {
        if (next != nullptr) play_sprite_animation(player.animator, *next);
        else init_sprite_animator(player.animator);
    }
    player.action = action;
}

struct ShmupPlayerData {
    Vec2i start_pixels;
    Vec2i size_pixels;
    uint8_t speed_pixels_per_frame;
    uint8_t fire_cooldown_frames;
    Vec2i projectile_offset_pixels;
    EventScript on_fire;
    const MetaSprite* metasprite;
    ShmupPlayerAnimationSet animations {};
};

struct ShmupEnemyData {
    const char* name;
    Vec2i start_pixels;
    Vec2i size_pixels;
    Vec2i velocity_pixels_per_frame;
    ShmupEnemyMovementKind movement;
    uint8_t health;
    uint16_t score_value;
    uint8_t fire_interval_frames;
    Vec2i projectile_offset_pixels;
    int line_index;
    EventScript on_spawn;
    EventScript on_destroy;
    EventScript on_hit_player;
    const char* resource_bank_group_name;
    const MetaSprite* metasprite = nullptr;
};

struct ShmupWaveData {
    const char* name;
    const ShmupEnemyData* enemies;
    size_t enemy_count;
    uint16_t start_frame;
    int next_wave_index;
    EventScript on_start;
    EventScript on_clear;
    const char* resource_bank_group_name;
    uint8_t player_speed_pixels_per_frame = 0;
    uint8_t fire_cooldown_frames = 0;
};

constexpr bool shmup_wave_spawn_ready(const ShmupWaveData& wave, uint16_t frame_counter) {
    return frame_counter >= wave.start_frame;
}

constexpr BlendConfig default_shmup_blend_config() {
    return BlendConfig {
        0,
        0,
        BlendMode::None,
        8,
        8,
        0
    };
}

constexpr WindowConfig default_shmup_window_config() {
    return WindowConfig {
        WindowRect { 0, 240, 0, 160 },
        0x3F,
        0x3F,
        false
    };
}

struct ShmupHBlankTimelineKeyframe {
    uint32_t frame = 0;
    const int16_t* scroll_offsets = nullptr;
    size_t scroll_count = 0;
};

struct ShmupSceneComposition {
    bool enabled = false;
    VideoComposition video = default_video_composition();
    bool blend_enabled = false;
    BlendConfig blend = default_shmup_blend_config();
    bool mosaic_enabled = false;
    MosaicConfig mosaic { 0, 0, 0, 0 };
    WindowConfig window0 = default_shmup_window_config();
    WindowConfig window1 = default_shmup_window_config();
    bool hblank_enabled = false;
    BackgroundLayer hblank_layer = BackgroundLayer::BG2;
    const int16_t* hblank_scroll_offsets = nullptr;
    size_t hblank_scroll_count = 0;
    const ShmupHBlankTimelineKeyframe* hblank_timeline = nullptr;
    size_t hblank_timeline_count = 0;
};

constexpr ShmupSceneComposition default_shmup_scene_composition() {
    return ShmupSceneComposition {};
}

constexpr bool is_valid_shmup_scene_composition(const ShmupSceneComposition& composition) {
    if (!is_valid_display_mode(composition.video.display_mode)) {
        return false;
    }
    if (composition.video.affine_enabled) {
        const bool mode_supported = composition.video.display_mode == DisplayMode::Mode1TextAffine ||
            composition.video.display_mode == DisplayMode::Mode2Affine;
        const bool layer_supported = is_valid_affine_background_layer(composition.video.affine_layer) &&
            (composition.video.display_mode == DisplayMode::Mode2Affine || composition.video.affine_layer == BackgroundLayer::BG2);
        if (!mode_supported || !layer_supported ||
            composition.video.affine_tiles == nullptr ||
            !is_valid_affine_tile_asset(*composition.video.affine_tiles) ||
            composition.video.affine_tilemap == nullptr ||
            !is_valid_affine_tilemap_asset(*composition.video.affine_tilemap) ||
            composition.video.affine_palette == nullptr ||
            !is_valid_palette_asset(*composition.video.affine_palette)) {
            return false;
        }
    }
    if (composition.blend_enabled && !is_valid_blend_config(composition.blend)) {
        return false;
    }
    if (composition.mosaic_enabled && !is_valid_mosaic_config(composition.mosaic)) {
        return false;
    }
    if (composition.window0.enabled && !is_valid_window_config(composition.window0)) {
        return false;
    }
    if (composition.window1.enabled && !is_valid_window_config(composition.window1)) {
        return false;
    }
    if (composition.hblank_enabled && (
        !is_valid_background_layer(composition.hblank_layer) ||
        composition.hblank_scroll_offsets == nullptr ||
        composition.hblank_scroll_count != 160
    )) {
        return false;
    }
    if (composition.hblank_timeline_count > 0) {
        if (!composition.hblank_enabled ||
            composition.hblank_timeline == nullptr) {
            return false;
        }
        uint32_t previous_frame = 0;
        for (size_t index = 0; index < composition.hblank_timeline_count; ++index) {
            const ShmupHBlankTimelineKeyframe& keyframe = composition.hblank_timeline[index];
            if (keyframe.scroll_offsets == nullptr || keyframe.scroll_count != 160 ||
                (index > 0 && keyframe.frame <= previous_frame)) {
                return false;
            }
            previous_frame = keyframe.frame;
        }
    }
    return true;
}

struct ShmupProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const ShmupBackgroundData* backgrounds;
    size_t background_count;
    int background_index;
    ShmupPlayerData player;
    ShmupProjectileData player_projectile;
    ShmupEnemyProjectileData enemy_projectile;
    const ShmupWaveData* waves;
    size_t wave_count;
    int initial_wave;
    const DialogueLine* dialogue_lines;
    size_t dialogue_line_count;
    const SfxAsset* sfx_assets;
    size_t sfx_asset_count;
    const MusicAsset* music_assets;
    size_t music_asset_count;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
    const PaletteAsset* obj_palettes = nullptr;
    size_t obj_palette_count = 0;
    const MetaSprite* const* actor_sprites = nullptr;
    size_t actor_sprite_count = 0;
    const DialogueEmoteEntry* emote_assets = nullptr;
    size_t emote_asset_count = 0;
    bool score_enabled = true;
    bool high_score_enabled = true;
    uint16_t initial_score = 0;
    uint8_t initial_lives = 3;
    bool waves_enabled = true;
    uint8_t max_waves = 64;
    bool loop_waves = false;
    ShmupSceneComposition composition = default_shmup_scene_composition();
};

struct ShmupRuntimeState {
    Vec2i player_position_pixels;
    int wave_index;
    uint16_t frame_counter;
    uint16_t score;
    uint8_t lives;
    uint8_t fire_cooldown_remaining;
    uint8_t invulnerability_frames_remaining;
};

constexpr uint16_t shmup_add_score(uint16_t score, uint16_t points) {
    const uint32_t total = static_cast<uint32_t>(score) + static_cast<uint32_t>(points);
    return total > 0xFFFFu ? 0xFFFFu : static_cast<uint16_t>(total);
}

struct ShmupSaveData {
    int16_t player_x;
    int16_t player_y;
    uint16_t wave_index;
    uint16_t frame_counter;
    uint16_t score;
    uint16_t high_score;
    uint8_t lives;
    uint8_t fire_cooldown_remaining;
    uint8_t invulnerability_frames_remaining;
    int32_t variables[event_variable_count];
    uint32_t play_time_frames;
    uint16_t flags;
};

constexpr bool is_valid_shmup_wave_index(const ShmupProjectData& project, int wave_index) {
    return project.waves != nullptr &&
        wave_index >= 0 &&
        static_cast<size_t>(wave_index) < project.wave_count;
}

constexpr bool is_valid_shmup_background_index(const ShmupProjectData& project, int background_index) {
    return background_index < 0 ||
        (project.backgrounds != nullptr &&
            static_cast<size_t>(background_index) < project.background_count);
}

constexpr bool is_valid_shmup_dialogue_line_index(const ShmupProjectData& project, int line_index) {
    return line_index < 0 ||
        (project.dialogue_lines != nullptr &&
            static_cast<size_t>(line_index) < project.dialogue_line_count &&
            project.dialogue_lines[line_index].text != nullptr);
}

constexpr bool is_valid_shmup_enemy_movement_kind(ShmupEnemyMovementKind movement) {
    return static_cast<uint8_t>(movement) <= static_cast<uint8_t>(ShmupEnemyMovementKind::Dive);
}

constexpr bool is_valid_shmup_player(const ShmupPlayerData& player) {
    return player.size_pixels.x > 0 &&
        player.size_pixels.y > 0 &&
        player.speed_pixels_per_frame > 0 &&
        is_valid_shmup_player_animation_set(player.animations);
}

constexpr bool is_valid_shmup_projectile(const ShmupProjectileData& projectile) {
    return projectile.size_pixels.x > 0 &&
        projectile.size_pixels.y > 0 &&
        projectile.max_active > 0;
}

constexpr bool is_valid_shmup_enemy_projectile(const ShmupEnemyProjectileData& projectile) {
    return projectile.size_pixels.x > 0 &&
        projectile.size_pixels.y > 0 &&
        projectile.max_active > 0;
}

constexpr bool is_valid_shmup_enemy(const ShmupProjectData& project, const ShmupEnemyData& enemy) {
    return enemy.size_pixels.x > 0 &&
        enemy.size_pixels.y > 0 &&
        enemy.health > 0 &&
        is_valid_shmup_enemy_movement_kind(enemy.movement) &&
        is_valid_shmup_dialogue_line_index(project, enemy.line_index);
}

constexpr bool is_valid_shmup_resource_banks(const ShmupProjectData& project) {
    if (project.resource_bank_count == 0) {
        return true;
    }
    return project.resource_banks != nullptr;
}

constexpr bool is_valid_shmup_resource_bank_groups(const ShmupProjectData& project) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    return project.resource_bank_groups != nullptr;
}

constexpr bool is_valid_shmup_feature_config(const ShmupProjectData& project) {
    return project.initial_lives <= 9 &&
        project.max_waves > 0 &&
        (!project.waves_enabled || project.initial_wave < static_cast<int>(project.max_waves));
}

constexpr const ShmupWaveData* shmup_wave_for(const ShmupProjectData& project, int wave_index) {
    return is_valid_shmup_wave_index(project, wave_index)
        ? &project.waves[wave_index]
        : nullptr;
}

constexpr const ShmupEnemyData* shmup_enemy_for(const ShmupWaveData& wave, size_t enemy_index) {
    return wave.enemies != nullptr && enemy_index < wave.enemy_count
        ? &wave.enemies[enemy_index]
        : nullptr;
}

constexpr const ShmupBackgroundData* shmup_background_for(const ShmupProjectData& project) {
    return is_valid_shmup_background_index(project, project.background_index) && project.background_index >= 0
        ? &project.backgrounds[project.background_index]
        : nullptr;
}

constexpr ShmupRuntimeState shmup_runtime_from_project(const ShmupProjectData& project) {
    return ShmupRuntimeState {
        project.player.start_pixels,
        project.initial_wave,
        0,
        project.initial_score,
        project.initial_lives,
        0,
        0
    };
}

constexpr Rect shmup_player_rect(const ShmupProjectData& project, const ShmupRuntimeState& state) {
    return Rect {
        state.player_position_pixels.x,
        state.player_position_pixels.y,
        project.player.size_pixels.x,
        project.player.size_pixels.y
    };
}

constexpr Rect shmup_enemy_rect(const ShmupEnemyData& enemy, uint16_t frame_counter) {
    return Rect {
        enemy.start_pixels.x + (enemy.velocity_pixels_per_frame.x * static_cast<int>(frame_counter)),
        enemy.start_pixels.y + (enemy.velocity_pixels_per_frame.y * static_cast<int>(frame_counter)),
        enemy.size_pixels.x,
        enemy.size_pixels.y
    };
}

constexpr bool shmup_can_fire(const ShmupRuntimeState& state) {
    return state.fire_cooldown_remaining == 0;
}

constexpr int shmup_player_movement_speed(int base_speed, bool air_brake) {
    if (base_speed <= 0) {
        return 0;
    }
    return air_brake ? (base_speed + 1) / 2 : base_speed;
}

constexpr EventScript shmup_player_fire_script(const ShmupProjectData& project) {
    return project.player.on_fire;
}

constexpr bool shmup_player_is_vulnerable(const ShmupRuntimeState& state) {
    return state.invulnerability_frames_remaining == 0 && state.lives > 0;
}

constexpr bool is_valid_shmup_save_data(const ShmupProjectData& project, const ShmupSaveData& save_data) {
    return is_valid_shmup_wave_index(project, save_data.wave_index) &&
        save_data.player_x >= 0 &&
        save_data.player_y >= 0 &&
        save_data.player_x <= 240 &&
        save_data.player_y <= 160 &&
        save_data.lives <= 9;
}

inline void capture_shmup_save_data(
    ShmupSaveData& save_data,
    const ShmupRuntimeState& shmup_state,
    const EventState& event_state,
    uint16_t high_score = 0,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    save_data.player_x = static_cast<int16_t>(shmup_state.player_position_pixels.x);
    save_data.player_y = static_cast<int16_t>(shmup_state.player_position_pixels.y);
    save_data.wave_index = static_cast<uint16_t>(shmup_state.wave_index < 0 ? 0 : shmup_state.wave_index);
    save_data.frame_counter = shmup_state.frame_counter;
    save_data.score = shmup_state.score;
    save_data.high_score = high_score > shmup_state.score ? high_score : shmup_state.score;
    save_data.lives = shmup_state.lives;
    save_data.fire_cooldown_remaining = shmup_state.fire_cooldown_remaining;
    save_data.invulnerability_frames_remaining = shmup_state.invulnerability_frames_remaining;
    for (size_t index = 0; index < event_variable_count; ++index) {
        save_data.variables[index] = event_state.variables[index];
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
}

inline bool apply_shmup_save_data(
    const ShmupProjectData& project,
    const ShmupSaveData& save_data,
    ShmupRuntimeState& shmup_state,
    EventState& event_state,
    uint16_t& high_score
) {
    if (!is_valid_shmup_save_data(project, save_data)) {
        return false;
    }
    shmup_state.player_position_pixels = Vec2i { save_data.player_x, save_data.player_y };
    shmup_state.wave_index = save_data.wave_index;
    shmup_state.frame_counter = save_data.frame_counter;
    shmup_state.score = save_data.score;
    shmup_state.lives = save_data.lives;
    shmup_state.fire_cooldown_remaining = save_data.fire_cooldown_remaining;
    shmup_state.invulnerability_frames_remaining = save_data.invulnerability_frames_remaining;
    high_score = save_data.high_score > save_data.score ? save_data.high_score : save_data.score;
    for (size_t index = 0; index < event_variable_count; ++index) {
        event_state.variables[index] = save_data.variables[index];
    }
    return true;
}

constexpr EventScript shmup_wave_start_script(const ShmupProjectData& project, int wave_index) {
    const ShmupWaveData* wave = shmup_wave_for(project, wave_index);
    return wave != nullptr ? wave->on_start : empty_event_script();
}

constexpr EventScript shmup_wave_clear_script(const ShmupProjectData& project, int wave_index) {
    const ShmupWaveData* wave = shmup_wave_for(project, wave_index);
    return wave != nullptr ? wave->on_clear : empty_event_script();
}

constexpr ResourceBankBatch resource_bank_batch_from_shmup_project(const ShmupProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_shmup_project(
    const ShmupProjectData& project,
    size_t group_index
) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_shmup_resource_bank_group_index(const ShmupProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr int find_shmup_wave_resource_bank_group_index(
    const ShmupProjectData& project,
    const ShmupWaveData& wave
) {
    return find_shmup_resource_bank_group_index(project, wave.resource_bank_group_name);
}

constexpr ResourceBankGroup resource_bank_group_from_shmup_wave(
    const ShmupProjectData& project,
    const ShmupWaveData& wave
) {
    int index = find_shmup_wave_resource_bank_group_index(project, wave);
    return index >= 0
        ? resource_bank_group_from_shmup_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr bool is_valid_shmup_project_data(const ShmupProjectData& project) {
    if (project.waves == nullptr ||
        project.wave_count == 0 ||
        !is_valid_shmup_wave_index(project, project.initial_wave) ||
        !is_valid_shmup_background_index(project, project.background_index) ||
        !is_valid_shmup_player(project.player) ||
        !is_valid_shmup_projectile(project.player_projectile) ||
        !is_valid_shmup_enemy_projectile(project.enemy_projectile) ||
        !is_valid_shmup_feature_config(project) ||
        !is_valid_shmup_scene_composition(project.composition) ||
        !is_valid_shmup_resource_banks(project) ||
        !is_valid_shmup_resource_bank_groups(project)) {
        return false;
    }
    if (project.background_count > 0 && project.backgrounds == nullptr) {
        return false;
    }
    if (project.dialogue_line_count > 0 && project.dialogue_lines == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.background_count; ++index) {
        const ShmupBackgroundData& background = project.backgrounds[index];
        ShmupSceneComposition background_composition = default_shmup_scene_composition();
        background_composition.enabled = true;
        background_composition.video = background.video;
        if (!is_valid_shmup_scene_composition(background_composition)) {
            return false;
        }
        if (background.collision_count > 0 && background.collision_flags == nullptr) {
            return false;
        }
        if (background.collision_count > 0 && (
            background.collision_width_tiles == 0 ||
            background.collision_height_tiles == 0 ||
            static_cast<size_t>(background.collision_width_tiles) * background.collision_height_tiles != background.collision_count
        )) {
            return false;
        }
        if (background.video.affine_enabled && (
            background.world_width_pixels != 720 ||
            background.world_height_pixels != 160
        )) {
            return false;
        }
        if (!background.video.affine_enabled && (background.layers == nullptr || background.layer_count == 0)) {
            return false;
        }
        if (background.video.affine_enabled && background.layers == nullptr && background.layer_count != 0) {
            return false;
        }
        for (size_t layer_index = 0; layer_index < background.layer_count; ++layer_index) {
            const ShmupBackgroundLayerData& layer = background.layers[layer_index];
            if (background.video.affine_enabled && layer.layer == background.video.affine_layer) {
                return false;
            }
            if (!is_valid_streaming_tilemap_asset(layer.tilemap) ||
                !is_valid_render_priority(layer.priority) ||
                layer.parallax_x256 < -1024 ||
                layer.parallax_x256 > 1024 ||
                layer.parallax_y256 < -1024 ||
                layer.parallax_y256 > 1024) {
                return false;
            }
        }
    }
    for (size_t wave_index = 0; wave_index < project.wave_count; ++wave_index) {
        const ShmupWaveData& wave = project.waves[wave_index];
        if (wave.enemy_count > 0 && wave.enemies == nullptr) {
            return false;
        }
        if (wave.next_wave_index >= 0 && !is_valid_shmup_wave_index(project, wave.next_wave_index)) {
            return false;
        }
        for (size_t enemy_index = 0; enemy_index < wave.enemy_count; ++enemy_index) {
            if (!is_valid_shmup_enemy(project, wave.enemies[enemy_index])) {
                return false;
            }
        }
    }
    return true;
}

} // namespace gbs
