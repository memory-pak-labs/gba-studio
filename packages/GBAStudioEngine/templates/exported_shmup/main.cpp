#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/render.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/runtime.hpp"
#include "gbs/save.hpp"
#include "gbs/runtime_checkpoint.hpp"
#include "gbs/shmup.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#include "shmup_project_data.hpp"
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_SHMUP_RUNTIME_ENTRY
#define GBS_SHMUP_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_SHMUP_RUNTIME_ENTER
#define GBS_SHMUP_RUNTIME_ENTER gbs_enter_shmup
#endif
#ifndef GBS_SHMUP_RUNTIME_UPDATE
#define GBS_SHMUP_RUNTIME_UPDATE gbs_update_shmup
#endif
#ifndef GBS_SHMUP_RUNTIME_RENDER
#define GBS_SHMUP_RUNTIME_RENDER gbs_render_shmup
#endif
#ifndef GBS_SHMUP_RUNTIME_LEAVE
#define GBS_SHMUP_RUNTIME_LEAVE gbs_leave_shmup
#endif
#ifndef GBS_MULTI_RUNTIME
#define GBS_MULTI_RUNTIME 0
#endif

namespace {

constexpr int screen_width = 240;
constexpr int screen_height = 160;
constexpr size_t max_runtime_enemies = gbastudio_shmup_project::max_enemy_count > 0
    ? gbastudio_shmup_project::max_enemy_count
    : 1;
constexpr size_t max_runtime_projectiles = 8;
constexpr size_t max_runtime_enemy_projectiles = 12;
constexpr size_t max_resource_bank_reservations = 64;
constexpr uint8_t player_hit_invulnerability_frames = 60;

const gbs::ShmupProjectData& project = gbastudio_shmup_project::project;

gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::HudState hud;
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::ShmupRuntimeState shmup_state;
gbs::RoomTilemapCache background_layer_cache[4] {};
gbs::ShmupPlayerAnimator player_animator;
const gbs::TileAsset* player_streamed_tile_asset_loaded = nullptr;
bool player_fired_this_frame = false;
bool player_damaged_this_frame = false;
gbs::EventPlayerRuntimeState player_event_runtime { true, 0, 0, 3 };
volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankBatchReservation active_resource_bank_group {
    active_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false
};
gbs::ResourceBankBatchReservation scratch_resource_bank_group {
    scratch_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false
};
uint32_t shmup_save_sequence = 0;
uint16_t shmup_high_score = 0;
int shmup_initialization_result = -1;
char hud_left_buffer[16] = {};
char hud_right_buffer[16] = {};
char hud_score_buffer[16] = {};
char hud_lives_buffer[16] = {};
char hud_wave_buffer[16] = {};

void refresh_high_score();

struct RuntimeEnemy {
    gbs::Vec2i position_pixels;
    uint8_t health;
    uint8_t fire_cooldown_frames;
    bool active;
    int sprite_index = -1;
    bool destroying = false;
    gbs::EventRunner destroy_runner {};
    uint16_t destroy_wait_frames = 0;
};

struct RuntimeActorGesture {
    int actor_index = -1;
    int emote_index = -1;
    uint16_t frames_remaining = 0;
};

struct RuntimeProjectile {
    gbs::Vec2i position_pixels;
    bool active;
};

RuntimeEnemy runtime_enemies[max_runtime_enemies];
RuntimeProjectile runtime_projectiles[max_runtime_projectiles];
RuntimeProjectile runtime_enemy_projectiles[max_runtime_enemy_projectiles];
RuntimeActorGesture runtime_actor_gesture;
int player_sprite_index = -1;
bool wave_clear_consumed = false;
bool wave_spawned = false;
bool run_wave_spawn_scripts = true;
int runtime_last_wave = -1;
uint32_t runtime_wave_change_count = 0;

#if GBS_MULTI_RUNTIME
gbs::EventRunner shmup_event_runner {};
int shmup_event_wait_frames = 0;
int checkpoint_resume_script_index = -1;
bool checkpoint_resuming_script = false;
bool wave_start_pending = false;
int checkpoint_music_index = -1;
int checkpoint_tracker_index = -1;
struct ShmupRuntimeCheckpoint {
    uint32_t version;
    gbs::ShmupRuntimeState state;
    gbs::EventPlayerRuntimeState player;
    gbs::CheckpointScript script;
    gbs::CheckpointDialogue dialogue;
    RuntimeActorGesture gesture;
    int32_t player_sprite;
    int32_t music_index;
    int32_t tracker_index;
    int32_t wait_frames;
    uint16_t high_score;
    uint16_t enemy_count;
    uint8_t projectile_count;
    bool clear_consumed;
    bool spawned;
    bool spawn_scripts;
    bool start_pending;
};
struct ShmupEnemyCheckpoint {
    gbs::Vec2i position;
    gbs::CheckpointScript script;
    int32_t sprite;
    uint16_t wait_frames;
    uint8_t health;
    uint8_t cooldown;
    bool active;
    bool destroying;
};
struct ShmupProjectileCheckpoint { int16_t x; int16_t y; uint8_t pool; uint8_t index; };

gbs::EventScript checkpoint_script_for(int room, int index) {
    const auto* wave = gbs::shmup_wave_for(project, room);
    if (wave == nullptr) return gbs::empty_event_script();
    if (index == 0) return wave->on_start;
    if (index == 1) return wave->on_clear;
    if (index == 2) return project.player.on_fire;
    if (index == 3) return project.enemy_projectile.on_hit_player;
    if (index >= 100 && index < 100 + static_cast<int>(wave->enemy_count)) return wave->enemies[index - 100].on_spawn;
    if (index >= 1000 && static_cast<size_t>(index - 1000) < project.script_count) return project.scripts[index - 1000];
    for (size_t enemy = 0; enemy < wave->enemy_count; ++enemy)
        if (index == 200 + static_cast<int>(enemy)) return wave->enemies[enemy].on_hit_player;
    return gbs::empty_event_script();
}
int current_checkpoint_script_index() {
    if (!gbs::has_event_script(shmup_event_runner.script)) return -1;
    const auto* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    for (size_t candidate = 0; candidate < 4 + wave->enemy_count * 2 + project.script_count; ++candidate) {
        const int index = candidate < 4 ? static_cast<int>(candidate)
            : candidate < 4 + wave->enemy_count ? 100 + static_cast<int>(candidate - 4)
            : candidate < 4 + wave->enemy_count * 2 ? 200 + static_cast<int>(candidate - 4 - wave->enemy_count)
            : 1000 + static_cast<int>(candidate - 4 - wave->enemy_count * 2);
        const auto script = checkpoint_script_for(shmup_state.wave_index, index);
        if (script.commands == shmup_event_runner.script.commands && script.command_count == shmup_event_runner.script.command_count) return index;
    }
    return -1;
}

bool capture_shmup_checkpoint(gbs::UniversalSaveData& data) {
    if (gbs::checkpoint_dialogue_is_feedback(dialogue)) return false;
    const auto* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    if (wave == nullptr || wave->enemy_count > 65535) return false;
    const int script_index = current_checkpoint_script_index();
    if (shmup_event_runner.active && script_index < 0) return false;
    uint8_t projectile_count = 0;
    for (const auto& projectile : runtime_projectiles) if (projectile.active) ++projectile_count;
    for (const auto& projectile : runtime_enemy_projectiles) if (projectile.active) ++projectile_count;
    const ShmupRuntimeCheckpoint snapshot {
        1, shmup_state, player_event_runtime, gbs::capture_checkpoint_script(shmup_event_runner, script_index),
        gbs::capture_checkpoint_dialogue(dialogue), runtime_actor_gesture, player_sprite_index,
        checkpoint_music_index, checkpoint_tracker_index, shmup_event_wait_frames, shmup_high_score,
        static_cast<uint16_t>(wave->enemy_count), projectile_count, wave_clear_consumed, wave_spawned, run_wave_spawn_scripts, wave_start_pending
    };
    gbs::CheckpointPayloadWriter writer(data);
    if (!writer.write(snapshot) || !gbs::write_checkpoint_events(writer, gbs::capture_checkpoint_events(event_state))) return false;
    for (size_t index = 0; index < wave->enemy_count; ++index) {
        const auto& enemy = runtime_enemies[index];
        const auto bookmark = enemy.destroying ? gbs::capture_checkpoint_script(enemy.destroy_runner, static_cast<int>(index)) : gbs::CheckpointScript {};
        const ShmupEnemyCheckpoint saved { enemy.position_pixels, bookmark, enemy.sprite_index,
            enemy.destroy_wait_frames, enemy.health, enemy.fire_cooldown_frames, enemy.active, enemy.destroying };
        if (!writer.write(saved)) return false;
    }
    for (uint8_t pool = 0; pool < 2; ++pool) {
        const auto* projectiles = pool == 0 ? runtime_projectiles : runtime_enemy_projectiles;
        const size_t count = pool == 0 ? max_runtime_projectiles : max_runtime_enemy_projectiles;
        for (size_t index = 0; index < count; ++index) if (projectiles[index].active) {
            const auto position = projectiles[index].position_pixels;
            if (position.x < -32768 || position.x > 32767 || position.y < -32768 || position.y > 32767) return false;
            const ShmupProjectileCheckpoint saved { static_cast<int16_t>(position.x), static_cast<int16_t>(position.y), pool, static_cast<uint8_t>(index) };
            if (!writer.write(saved)) return false;
        }
    }
    return gbs::capture_runtime_checkpoint(data, gbs::UniversalSaveRuntime::Shmup, shmup_state.wave_index,
        shmup_state.player_position_pixels.x, shmup_state.player_position_pixels.y, event_state,
        data.payload, data.payload_size, gbs::frame_count());
}
void consume_shmup_checkpoint_request() {
    if (event_state.save_request == 0) return;
    gbs::UniversalSaveData data {};
    const bool captured = event_state.save_request != 1 || capture_shmup_checkpoint(data);
    const bool saving = event_state.save_request == 1;
    const auto status = gbs::consume_checkpoint_request(event_state, data, captured, "SHMUP", gbs::RuntimeKind::Shmup);
    if (saving && status != gbs::SaveStatus::Ok) {
        gbs::show_checkpoint_save_failure(dialogue);
    }
}
void consume_event_state();
#endif

void run_shmup_event_script(gbs::EventScript script) {
#if GBS_MULTI_RUNTIME
    gbs::start_event_runner(shmup_event_runner, script);
    // Existing synchronous hooks keep their timing. Split only at Save so its
    // continuation is captured before subsequent rewards/warps.
    const size_t budget = script.command_count * 8 + 8;
    for (size_t step = 0; step < budget && shmup_event_runner.active; ++step) {
        const auto previous_index = shmup_event_runner.command_index;
        gbs::update_checkpoint_event_runner(shmup_event_runner, event_state);
        consume_event_state();
        if (previous_index == shmup_event_runner.command_index || gbs::runtime_transition_requested()) break;
    }
#else
    gbs::run_event_script(event_state, script);
#endif
}

constexpr uint16_t obj_palette_colors[] = {
    gbs::rgb15(0, 0, 0),
    gbs::rgb15(6, 20, 31),
    gbs::rgb15(31, 7, 5),
    gbs::rgb15(31, 31, 31),
};

constexpr uint8_t player_tile_data[] = {
    0x00, 0x11, 0x11, 0x00,
    0x01, 0x11, 0x11, 0x10,
    0x11, 0x11, 0x11, 0x11,
    0x11, 0x11, 0x11, 0x11,
    0x11, 0x11, 0x11, 0x11,
    0x01, 0x11, 0x11, 0x10,
    0x00, 0x11, 0x11, 0x00,
    0x00, 0x01, 0x10, 0x00,
};

constexpr uint8_t enemy_tile_data[] = {
    0x00, 0x22, 0x22, 0x00,
    0x02, 0x22, 0x22, 0x20,
    0x22, 0x02, 0x20, 0x22,
    0x22, 0x22, 0x22, 0x22,
    0x02, 0x22, 0x22, 0x20,
    0x00, 0x22, 0x22, 0x00,
    0x02, 0x20, 0x02, 0x20,
    0x20, 0x00, 0x00, 0x02,
};

constexpr uint8_t bullet_tile_data[] = {
    0x00, 0x03, 0x30, 0x00,
    0x00, 0x33, 0x33, 0x00,
    0x00, 0x33, 0x33, 0x00,
    0x00, 0x03, 0x30, 0x00,
    0x00, 0x03, 0x30, 0x00,
    0x00, 0x33, 0x33, 0x00,
    0x00, 0x33, 0x33, 0x00,
    0x00, 0x03, 0x30, 0x00,
};

constexpr gbs::PaletteAsset obj_palette_asset = {
    obj_palette_colors,
    static_cast<uint16_t>(sizeof(obj_palette_colors) / sizeof(obj_palette_colors[0])),
    0
};

constexpr gbs::TileAsset player_tile_asset = { player_tile_data, 1, 0, true };
constexpr gbs::TileAsset enemy_tile_asset = { enemy_tile_data, 1, 1, true };
constexpr gbs::TileAsset bullet_tile_asset = { bullet_tile_data, 1, 2, true };

gbs::ResourceReservation builtin_obj_tiles {};
gbs::ResourceReservation builtin_obj_palette {};
uint16_t builtin_tile_start = 0;
uint8_t builtin_palette_bank = 0;

void release_streamed_builtin_assets() {
    if (builtin_obj_tiles.success) gbs::release_resource_range(resource_manager.obj_tiles, builtin_obj_tiles);
    if (builtin_obj_palette.success) gbs::release_resource_range(resource_manager.obj_palette, builtin_obj_palette);
    builtin_obj_tiles = {};
    builtin_obj_palette = {};
}

bool load_streamed_builtin_assets(int wave_index) {
    // Streamed project banks may own tiles 0..2 and palette 0. Keep the
    // engine's unchanged fallback artwork in independent, managed ranges.
    const auto uses_builtin = [](const gbs::MetaSprite* sprite) {
        return sprite == nullptr || !gbs::is_valid_metasprite(*sprite);
    };
    bool needs_builtin = uses_builtin(project.player.metasprite) ||
        uses_builtin(project.player_projectile.metasprite) || uses_builtin(project.enemy_projectile.metasprite);
    const auto* wave = gbs::shmup_wave_for(project, wave_index);
    if (wave != nullptr) {
        for (size_t index = 0; index < wave->enemy_count; ++index) {
            needs_builtin = needs_builtin || uses_builtin(wave->enemies[index].metasprite);
        }
    }
    if (!needs_builtin) return true;
    bool has_shared_obj_master = false;
    for (size_t index = 0; index < project.obj_palette_count; ++index) {
        const gbs::PaletteAsset& palette = project.obj_palettes[index];
        has_shared_obj_master = has_shared_obj_master || (palette.start_index == 0 && palette.color_count == 208);
    }
    builtin_obj_tiles = gbs::reserve_next_obj_tiles(resource_manager, 3);
    if (!builtin_obj_tiles.success) return false;
    builtin_tile_start = builtin_obj_tiles.start;
    if (has_shared_obj_master) {
        // The mixed master owns bank 12 with these exact fallback colors.
        // Banks 13-15 and tiles 900-1023 belong to runtime text/UI.
        if (builtin_tile_start + 3 > 900) {
            release_streamed_builtin_assets();
            return false;
        }
        builtin_palette_bank = 12;
    } else {
        builtin_obj_palette = gbs::reserve_next_obj_palette_colors(resource_manager, 16, 16);
        if (!builtin_obj_palette.success) {
            release_streamed_builtin_assets();
            return false;
        }
        builtin_palette_bank = static_cast<uint8_t>(builtin_obj_palette.start / 16);
        gbs::load_palette(gbs::PaletteAsset { obj_palette_colors, obj_palette_asset.color_count, builtin_obj_palette.start }, true);
    }
    gbs::load_tiles(gbs::TileAsset { player_tile_data, 1, builtin_tile_start, true });
    gbs::load_tiles(gbs::TileAsset { enemy_tile_data, 1, static_cast<uint16_t>(builtin_tile_start + 1), true });
    gbs::load_tiles(gbs::TileAsset { bullet_tile_data, 1, static_cast<uint16_t>(builtin_tile_start + 2), true });
    return true;
}

void append_char(char*& out, char* end, char value) {
    if (out < end) {
        *out = value;
        ++out;
    }
}

void append_uint(char*& out, char* end, uint16_t value) {
    char digits[6] = {};
    int cursor = 0;
    do {
        digits[cursor++] = static_cast<char>('0' + (value % 10));
        value = static_cast<uint16_t>(value / 10);
    } while (value > 0 && cursor < static_cast<int>(sizeof(digits)));
    while (cursor > 0) {
        append_char(out, end, digits[--cursor]);
    }
}

void refresh_hud() {
    refresh_high_score();

    char* left = hud_left_buffer;
    char* left_end = hud_left_buffer + sizeof(hud_left_buffer) - 1;
    append_char(left, left_end, 'S');
    if (project.score_enabled) {
        append_uint(left, left_end, shmup_state.score);
    } else {
        append_char(left, left_end, '-');
    }
    append_char(left, left_end, ' ');
    append_char(left, left_end, 'H');
    if (project.high_score_enabled) {
        append_uint(left, left_end, shmup_high_score);
    } else {
        append_char(left, left_end, '-');
    }
    *left = '\0';

    char* right = hud_right_buffer;
    char* right_end = hud_right_buffer + sizeof(hud_right_buffer) - 1;
    append_char(right, right_end, 'L');
    append_uint(right, right_end, shmup_state.lives);
    append_char(right, right_end, ' ');
    append_char(right, right_end, 'W');
    if (project.waves_enabled) {
        append_uint(right, right_end, static_cast<uint16_t>(shmup_state.wave_index < 0 ? 0 : shmup_state.wave_index + 1));
    } else {
        append_char(right, right_end, '-');
    }
    *right = '\0';

    char* score = hud_score_buffer;
    char* score_end = hud_score_buffer + sizeof(hud_score_buffer) - 1;
    append_char(score, score_end, 'S');
    append_char(score, score_end, 'C');
    append_char(score, score_end, 'O');
    append_char(score, score_end, 'R');
    append_char(score, score_end, 'E');
    append_char(score, score_end, ' ');
    if (project.score_enabled) {
        append_uint(score, score_end, shmup_state.score);
    } else {
        append_char(score, score_end, '-');
    }
    *score = '\0';

    char* lives = hud_lives_buffer;
    char* lives_end = hud_lives_buffer + sizeof(hud_lives_buffer) - 1;
    append_char(lives, lives_end, 'V');
    append_char(lives, lives_end, 'I');
    append_char(lives, lives_end, 'D');
    append_char(lives, lives_end, 'A');
    append_char(lives, lives_end, 'S');
    append_char(lives, lives_end, ' ');
    append_uint(lives, lives_end, shmup_state.lives);
    *lives = '\0';

    char* wave = hud_wave_buffer;
    char* wave_end = hud_wave_buffer + sizeof(hud_wave_buffer) - 1;
    append_char(wave, wave_end, 'W');
    append_char(wave, wave_end, 'A');
    append_char(wave, wave_end, 'V');
    append_char(wave, wave_end, 'E');
    append_char(wave, wave_end, ' ');
    if (project.waves_enabled) {
        append_uint(wave, wave_end, static_cast<uint16_t>(shmup_state.wave_index < 0 ? 0 : shmup_state.wave_index + 1));
    } else {
        append_char(wave, wave_end, '-');
    }
    *wave = '\0';

    const char* text_slots[] = { hud_score_buffer, hud_lives_buffer, hud_wave_buffer };
    gbs::set_hud_text_slots(hud, text_slots, 3);
    gbs::set_hud_value(hud,gbs::HudValueSource::Score,project.score_enabled ? shmup_state.score : 0);
    gbs::set_hud_value(hud,gbs::HudValueSource::Lives,shmup_state.lives,project.initial_lives);
}

void load_assets() {
    const bool assets_are_streamed = project.resource_bank_group_count > 0;
    if (!assets_are_streamed) {
        gbs::load_palette(obj_palette_asset, true);
        gbs::load_tiles(player_tile_asset);
        gbs::load_tiles(enemy_tile_asset);
        gbs::load_tiles(bullet_tile_asset);
        for (size_t index = 0; index < project.obj_palette_count; ++index) {
            gbs::load_palette(project.obj_palettes[index], true);
        }
        for (size_t index = 0; index < project.tile_asset_count; ++index) {
            gbs::load_tiles(project.tile_assets[index]);
        }
    }
}

bool stream_resources_for_wave(int wave_index) {
    player_streamed_tile_asset_loaded = nullptr;
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    const gbs::ShmupWaveData* wave = gbs::shmup_wave_for(project, wave_index);
    if (wave == nullptr) {
        return false;
    }
    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_shmup_wave(project, *wave);
    if (group.name == nullptr || group.bank_count == 0 || group.bank_count > max_resource_bank_reservations) {
        return false;
    }
    release_streamed_builtin_assets();
    const bool streamed = gbs::stream_resource_bank_group_with_uploads(
        resource_manager,
        active_resource_bank_group,
        scratch_resource_bank_group,
        group,
        gbastudio_shmup_project::resource_bank_upload_sources,
        gbastudio_shmup_project::resource_bank_upload_source_count
    ).success;
    return streamed && load_streamed_builtin_assets(wave_index);
}

const gbs::ShmupBackgroundData* active_background() {
    if (project.backgrounds == nullptr || project.background_count == 0) {
        return nullptr;
    }
    if (project.background_count == project.wave_count &&
        shmup_state.wave_index >= 0 &&
        static_cast<size_t>(shmup_state.wave_index) < project.background_count) {
        return &project.backgrounds[shmup_state.wave_index];
    }
    return gbs::shmup_background_for(project);
}

gbs::Vec2i active_background_camera() {
    const gbs::ShmupBackgroundData* background = active_background();
    return background != nullptr
        ? gbs::shmup_background_camera_pixels(*background, shmup_state.frame_counter)
        : gbs::Vec2i { 0, 0 };
}

gbs::Vec2i enemy_screen_position(const RuntimeEnemy& enemy) {
    return gbs::shmup_world_to_viewport(enemy.position_pixels, active_background_camera());
}

void sync_runtime_telemetry() {
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = shmup_state.wave_index;
    runtime_telemetry.flag_bits = 0;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) {
            runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
        }
    }
    runtime_telemetry.player_x = shmup_state.player_position_pixels.x;
    runtime_telemetry.player_y = shmup_state.player_position_pixels.y;
    runtime_telemetry.player_direction = 3;
    runtime_telemetry.actor_count = 0;
    runtime_telemetry.first_actor_x = -1;
    runtime_telemetry.first_actor_y = -1;
    runtime_telemetry.first_actor_direction = -1;
    runtime_telemetry.first_actor_visible = 0;
    for (size_t index = 0; index < max_runtime_enemies; ++index) {
        if (!runtime_enemies[index].active) continue;
        if (runtime_telemetry.actor_count == 0) {
            runtime_telemetry.first_actor_x = runtime_enemies[index].position_pixels.x;
            runtime_telemetry.first_actor_y = runtime_enemies[index].position_pixels.y;
            runtime_telemetry.first_actor_direction = runtime_enemies[index].position_pixels.x >= shmup_state.player_position_pixels.x ? 2 : 3;
            runtime_telemetry.first_actor_visible = 1;
        }
        ++runtime_telemetry.actor_count;
    }
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    runtime_telemetry.current_tile_flags = 0;
    runtime_telemetry.current_tile_slope = 0;
    if (runtime_last_wave < 0) {
        runtime_last_wave = shmup_state.wave_index;
    } else if (runtime_last_wave != shmup_state.wave_index) {
        ++runtime_wave_change_count;
        runtime_last_wave = shmup_state.wave_index;
    }
    runtime_telemetry.room_change_count = runtime_wave_change_count;
    gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
}

void stream_background() {
    const gbs::ShmupBackgroundData* background = active_background();
    if (background == nullptr) return;
    for (size_t layer_index = 0; layer_index < background->layer_count; ++layer_index) {
        const gbs::ShmupBackgroundLayerData& layer = background->layers[layer_index];
        if (background->video.affine_enabled && layer.layer == background->video.affine_layer) {
            continue;
        }
        const gbs::Vec2i camera = gbs::shmup_background_layer_render_camera_pixels(layer, shmup_state.frame_counter);
        const int layer_number = static_cast<int>(layer.layer);
        // BG0 shares its map with dynamic UI writers; only world layers are immutable.
        if (layer_number > 0 && layer_number < 4) gbs::draw_room_to_bg_cached(
            layer.layer,
            layer.tilemap.entries,
            layer.tilemap.width,
            layer.tilemap.height,
            camera.x,
            camera.y,
            background_layer_cache[layer_number]
        );
        else gbs::draw_room_to_bg(layer.layer, layer.tilemap.entries,
            layer.tilemap.width, layer.tilemap.height, camera.x, camera.y);
        gbs::set_bg_scroll(layer.layer, camera.x & 7, camera.y & 7);
    }
}

const gbs::ShmupHBlankTimelineKeyframe* hblank_keyframe_for_frame(
    const gbs::ShmupSceneComposition& composition,
    uint32_t frame
) {
    const gbs::ShmupHBlankTimelineKeyframe* selected_keyframe = nullptr;
    for (size_t index = 0; index < composition.hblank_timeline_count; ++index) {
        if (composition.hblank_timeline[index].frame <= frame) {
            selected_keyframe = &composition.hblank_timeline[index];
        } else {
            break;
        }
    }
    return selected_keyframe;
}

void apply_scene_composition_hblank(const gbs::ShmupSceneComposition& composition, uint32_t frame) {
    if (!composition.hblank_enabled) {
        gbs::disable_hblank_effects();
        return;
    }
    const gbs::ShmupHBlankTimelineKeyframe* selected_keyframe = hblank_keyframe_for_frame(composition, frame);
    if (selected_keyframe != nullptr) {
        gbs::set_hblank_bg_scroll(
            composition.hblank_layer,
            selected_keyframe->scroll_offsets,
            selected_keyframe->scroll_count
        );
        return;
    }
    gbs::set_hblank_bg_scroll(
        composition.hblank_layer,
        composition.hblank_scroll_offsets,
        composition.hblank_scroll_count
    );
}

void configure_scene_composition_effects() {
    const gbs::ShmupSceneComposition& composition = project.composition;
    gbs::disable_blending();
    gbs::disable_mosaic();
    gbs::disable_window0();
    gbs::disable_window1();
    gbs::disable_obj_window();
    if (!composition.enabled) {
        gbs::disable_hblank_effects();
        return;
    }
    if (composition.blend_enabled) {
        gbs::set_blending(composition.blend);
    }
    if (composition.mosaic_enabled) {
        gbs::set_mosaic(composition.mosaic);
    }
    gbs::set_window0(composition.window0);
    gbs::set_window1(composition.window1);
    if (composition.hblank_enabled) {
        apply_scene_composition_hblank(composition, 0);
    } else {
        gbs::disable_hblank_effects();
    }
}

void refresh_scene_composition_hblank(uint32_t frame) {
    const gbs::ShmupSceneComposition& composition = project.composition;
    if (composition.enabled && composition.hblank_enabled) {
        apply_scene_composition_hblank(composition, frame);
    }
}

void refresh_affine_background() {
    const gbs::ShmupBackgroundData* background = active_background();
    if (background == nullptr || !background->video.affine_enabled) {
        return;
    }
    gbs::AffineBgTransform transform = background->video.affine_transform;
    const gbs::Vec2i camera = active_background_camera();
    transform.reference_x_8 += camera.x * transform.pa + camera.y * transform.pb;
    transform.reference_y_8 += camera.x * transform.pc + camera.y * transform.pd;
    gbs::set_affine_bg_transform(background->video.affine_layer, transform);
}

void apply_scene_composition() {
    const gbs::ShmupSceneComposition& composition = project.composition;
    if (!composition.enabled) {
        gbs::set_display_mode(gbs::DisplayMode::Mode0Text);
        configure_scene_composition_effects();
        return;
    }
    if (!gbs::apply_video_composition(composition.video)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        return;
    }
    configure_scene_composition_effects();
}

void apply_background() {
    for (auto& cache : background_layer_cache) cache = {};
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    gbs::set_bg_scroll(gbs::BackgroundLayer::BG0, 0, 0);
    gbs::set_bg_mosaic(gbs::BackgroundLayer::BG0, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);
    gbs::set_bg_mosaic(gbs::BackgroundLayer::BG1, false);
    gbs::set_bg_mosaic(gbs::BackgroundLayer::BG2, false);
    gbs::set_bg_mosaic(gbs::BackgroundLayer::BG3, false);
    const gbs::ShmupBackgroundData* background = active_background();
    if (background == nullptr) {
        gbs::set_backdrop_color(gbs::rgb15(0, 0, 7));
        apply_scene_composition();
        return;
    }
    for (size_t layer_index = 0; layer_index < background->layer_count; ++layer_index) {
        const gbs::ShmupBackgroundLayerData& layer = background->layers[layer_index];
        gbs::set_bg_enabled(layer.layer, true);
        gbs::set_bg_priority(layer.layer, layer.priority);
        gbs::set_bg_mosaic(layer.layer, layer.mosaic);
    }
    gbs::set_backdrop_color(background->backdrop_color);
    const bool assets_are_streamed = project.resource_bank_group_count > 0;
    if (!assets_are_streamed) {
        for (size_t index = 0; index < project.bg_palette_count; ++index) {
            gbs::load_palette(project.bg_palettes[index], false);
        }
    }
    stream_background();
    if (background->video.affine_enabled) {
        gbs::set_bg_enabled(background->video.affine_layer, true);
        gbs::set_bg_priority(background->video.affine_layer, 2);
        gbs::set_bg_scroll(background->video.affine_layer, 0, 0);
        if (!gbs::apply_video_composition(background->video)) {
            gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
            return;
        }
        configure_scene_composition_effects();
        refresh_affine_background();
    } else {
        apply_scene_composition();
    }
}

const gbs::MetaSprite* actor_sprite_for_index(int sprite_index, const gbs::MetaSprite* fallback) {
    if (project.actor_sprites == nullptr || sprite_index < 0 ||
        static_cast<size_t>(sprite_index) >= project.actor_sprite_count) {
        return fallback;
    }
    return project.actor_sprites[sprite_index];
}

void consume_actor_event_commands() {
    player_event_runtime.x = shmup_state.player_position_pixels.x;
    player_event_runtime.y = shmup_state.player_position_pixels.y;
    for (size_t command_index = 0; command_index < event_state.actor_command_count; ++command_index) {
        const gbs::EventActorCommand& command = event_state.actor_commands[command_index];
        if (command.actor_index == gbs::event_player_actor_index) {
            if (command.op == gbs::EventActorOp::SetSprite) {
                player_sprite_index = command.a;
            } else {
                gbs::apply_event_player_command(player_event_runtime, command);
            }
            continue;
        }
        if (command.actor_index < 0 || static_cast<size_t>(command.actor_index) >= max_runtime_enemies) {
            continue;
        }
        RuntimeEnemy& enemy = runtime_enemies[command.actor_index];
        switch (command.op) {
        case gbs::EventActorOp::SetVisible:
        case gbs::EventActorOp::SetActive:
            enemy.active = command.a != 0;
            break;
        case gbs::EventActorOp::SetPosition:
            enemy.position_pixels = { command.a, command.b };
            break;
        case gbs::EventActorOp::MoveRelative:
            enemy.position_pixels.x += command.a;
            enemy.position_pixels.y += command.b;
            break;
        case gbs::EventActorOp::Push:
            enemy.active = true;
            enemy.position_pixels.x = gbs::clamp_int(enemy.position_pixels.x + command.a, 0, screen_width);
            enemy.position_pixels.y = gbs::clamp_int(enemy.position_pixels.y + command.b, 0, screen_height);
            break;
        case gbs::EventActorOp::SetSprite:
            enemy.sprite_index = command.a;
            break;
        case gbs::EventActorOp::None:
        case gbs::EventActorOp::SetDirection:
        case gbs::EventActorOp::SetSpeed:
        case gbs::EventActorOp::SetAnimation:
        case gbs::EventActorOp::SetAnimationSpeed:
        case gbs::EventActorOp::SetAnimationFrame:
        case gbs::EventActorOp::SetCollisionEnabled:
        case gbs::EventActorOp::CancelMovement:
        case gbs::EventActorOp::PushFacing:
        case gbs::EventActorOp::SetCollisionBox:
            break;
        }
    }
    shmup_state.player_position_pixels = { player_event_runtime.x, player_event_runtime.y };
    event_state.player_x = shmup_state.player_position_pixels.x;
    event_state.player_y = shmup_state.player_position_pixels.y;
    event_state.player_direction = player_event_runtime.direction;
    gbs::reset_event_actor_commands(event_state);
}

void consume_event_state() {
    gbs::consume_scene_transition_visual_effect_event(event_state);
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count
    );
    consume_actor_event_commands();
    if (event_state.actor_gesture_changed) {
        runtime_actor_gesture.actor_index = event_state.actor_gesture_actor;
        runtime_actor_gesture.emote_index = event_state.actor_gesture_index;
        runtime_actor_gesture.frames_remaining = static_cast<uint16_t>(event_state.actor_gesture_frames);
        event_state.actor_gesture_changed = false;
    }
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
#if GBS_MULTI_RUNTIME
            checkpoint_music_index = event_state.last_music;
            checkpoint_tracker_index = -1;
#endif
        }
        event_state.last_music = -1;
    }
    if (event_state.last_tracker_music >= 0) {
        if (static_cast<size_t>(event_state.last_tracker_music) < project.tracker_asset_count) {
            gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music]);
#if GBS_MULTI_RUNTIME
            checkpoint_tracker_index = event_state.last_tracker_music;
            checkpoint_music_index = -1;
#endif
        }
        event_state.last_tracker_music = -1;
    }
    if (event_state.audio_mute_changed) {
        gbs::set_audio_channel_muted(gbs::audio_channel_from_event_value(event_state.audio_mute_channel), event_state.audio_mute_enabled);
        event_state.audio_mute_changed = false;
    }
    if (event_state.audio_volume_changed) {
        gbs::set_audio_channel_volume(gbs::audio_channel_from_event_value(event_state.audio_volume_channel), static_cast<uint8_t>(event_state.audio_volume));
        event_state.audio_volume_changed = false;
    }
    if (event_state.audio_fade_changed) {
        gbs::fade_audio_channel_volume(gbs::audio_channel_from_event_value(event_state.audio_fade_channel), static_cast<uint8_t>(event_state.audio_fade_target_volume), static_cast<uint16_t>(event_state.audio_fade_frames));
        event_state.audio_fade_changed = false;
    }
    if (event_state.stop_music) {
        gbs::stop_music();
        gbs::stop_tracker_music();
        gbs::stop_pcm_music();
        event_state.stop_music = false;
#if GBS_MULTI_RUNTIME
        checkpoint_music_index = checkpoint_tracker_index = -1;
#endif
    }
    if (event_state.close_dialogue) {
        gbs::hide_dialogue(dialogue);
        event_state.close_dialogue = false;
    }
#if GBS_MULTI_RUNTIME
    consume_shmup_checkpoint_request();
#endif
}

void refresh_high_score() {
    if (!project.high_score_enabled) {
        shmup_high_score = 0;
        return;
    }
    if (shmup_state.score > shmup_high_score) {
        shmup_high_score = shmup_state.score;
    }
}

void persist_shmup_runtime_state() {
#if GBS_MULTI_RUNTIME
    // Runtime-local snapshots cannot overwrite a shared campaign checkpoint.
    return;
#else
    if (!gbastudio_shmup_project::save_enabled) {
        return;
    }
    refresh_high_score();
    gbs::ShmupSaveData save_data {};
    gbs::capture_shmup_save_data(save_data, shmup_state, event_state, shmup_high_score, gbs::frame_count());
    if (!project.high_score_enabled) {
        save_data.high_score = 0;
    }
    ++shmup_save_sequence;
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "SHMUP",
        gbs::frame_count(),
        shmup_save_sequence,
        static_cast<uint16_t>(shmup_state.wave_index < 0 ? 0 : shmup_state.wave_index),
        shmup_high_score
    );
    gbs::write_save_slot_record(
        gbastudio_shmup_project::save_bank,
        0,
        &save_data,
        sizeof(save_data),
        metadata,
        shmup_save_sequence
    );
#endif
}

void clear_runtime_objects() {
    gbs::init_shmup_player_animator(player_animator);
    player_streamed_tile_asset_loaded = nullptr;
    for (size_t index = 0; index < max_runtime_enemies; ++index) {
        runtime_enemies[index] = RuntimeEnemy { { 0, 0 }, 0, 0, false };
    }
    for (size_t index = 0; index < max_runtime_projectiles; ++index) {
        runtime_projectiles[index] = RuntimeProjectile { { 0, 0 }, false };
    }
    for (size_t index = 0; index < max_runtime_enemy_projectiles; ++index) {
        runtime_enemy_projectiles[index] = RuntimeProjectile { { 0, 0 }, false };
    }
    runtime_actor_gesture = RuntimeActorGesture {};
    player_sprite_index = -1;
}

void spawn_wave_enemies(const gbs::ShmupWaveData& wave) {
    if (wave_spawned || !gbs::shmup_wave_spawn_ready(wave, shmup_state.frame_counter)) {
        return;
    }
    wave_spawned = true;
    for (size_t index = 0; index < wave.enemy_count; ++index) {
        const gbs::ShmupEnemyData& enemy = wave.enemies[index];
        runtime_enemies[index] = RuntimeEnemy {
            enemy.start_pixels,
            enemy.health,
            enemy.fire_interval_frames,
            true
        };
    }
    if (run_wave_spawn_scripts) {
        for (size_t index = 0; index < wave.enemy_count; ++index)
            run_shmup_event_script(wave.enemies[index].on_spawn);
    }
    consume_event_state();
}

void start_wave(int wave_index, bool run_scripts = true) {
    const gbs::ShmupWaveData* wave = gbs::shmup_wave_for(project, wave_index);
    if (wave == nullptr) {
        return;
    }
    shmup_state.wave_index = wave_index;
    if (!stream_resources_for_wave(wave_index)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        return;
    }
    load_assets();
    shmup_state.frame_counter = 0;
    const int player_speed = wave->player_speed_pixels_per_frame > 0
        ? wave->player_speed_pixels_per_frame
        : project.player.speed_pixels_per_frame;
    player_event_runtime.movement_speed_x100 = player_speed * 100;
    player_event_runtime.movement_step_accumulator = 0;
    wave_clear_consumed = false;
    wave_spawned = false;
#if GBS_MULTI_RUNTIME
    wave_start_pending = run_scripts;
#endif
    run_wave_spawn_scripts = run_scripts;
    clear_runtime_objects();
    spawn_wave_enemies(*wave);
    if (run_scripts) {
        run_shmup_event_script(wave->on_start);
        consume_event_state();
#if GBS_MULTI_RUNTIME
        wave_start_pending = false;
#endif
    }
}

#if GBS_MULTI_RUNTIME
bool restore_shmup_checkpoint(int slot) {
    auto* service = gbs::active_runtime_save_service();
    gbs::UniversalSaveData data {};
    if (service == nullptr || gbs::read_runtime_save(*service, slot, data) != gbs::SaveStatus::Ok ||
        data.runtime != gbs::UniversalSaveRuntime::Shmup || !gbs::is_valid_shmup_wave_index(project, data.room_index)) return false;
    gbs::CheckpointPayloadReader reader(data);
    ShmupRuntimeCheckpoint snapshot {};
    gbs::CheckpointEvents saved_events {};
    const auto& wave = project.waves[data.room_index];
    if (!reader.read(snapshot) || snapshot.version != 1 || snapshot.state.wave_index != data.room_index ||
        snapshot.enemy_count != wave.enemy_count || snapshot.enemy_count > max_runtime_enemies ||
        snapshot.projectile_count > max_runtime_projectiles + max_runtime_enemy_projectiles || snapshot.wait_frames < 0 ||
        snapshot.music_index < -1 || snapshot.tracker_index < -1 ||
        (snapshot.music_index >= 0 && static_cast<size_t>(snapshot.music_index) >= project.music_asset_count) ||
        (snapshot.tracker_index >= 0 && static_cast<size_t>(snapshot.tracker_index) >= project.tracker_asset_count) ||
        !gbs::valid_checkpoint_dialogue(snapshot.dialogue, project.dialogue_line_count) ||
        !gbs::read_checkpoint_events(reader, saved_events)) return false;
    gbs::EventRunner restored_runner {};
    if (!gbs::restore_checkpoint_script(snapshot.script,
            checkpoint_script_for(data.room_index, snapshot.script.script_index), restored_runner)) return false;
    // Validate the complete variable-sized payload before touching live actors.
    const auto enemy_reader = reader;
    for (size_t index = 0; index < snapshot.enemy_count; ++index) {
        ShmupEnemyCheckpoint enemy {};
        gbs::EventRunner runner {};
        if (!reader.read(enemy) || enemy.health > wave.enemies[index].health || enemy.sprite < -1 ||
            (enemy.sprite >= 0 && static_cast<size_t>(enemy.sprite) >= project.actor_sprite_count) ||
            !gbs::restore_checkpoint_script(enemy.script, wave.enemies[index].on_destroy, runner)) return false;
    }
    uint32_t projectile_slots[2] = {};
    for (size_t index = 0; index < snapshot.projectile_count; ++index) {
        ShmupProjectileCheckpoint projectile {};
        if (!reader.read(projectile) || projectile.pool > 1 ||
            projectile.index >= (projectile.pool == 0 ? max_runtime_projectiles : max_runtime_enemy_projectiles) ||
            (projectile_slots[projectile.pool] & (1u << projectile.index)) != 0) return false;
        projectile_slots[projectile.pool] |= 1u << projectile.index;
    }
    if (!reader.complete()) return false;
    start_wave(data.room_index, false);
    if (!gbs::restore_checkpoint_events(saved_events, event_state) ||
        !gbs::restore_suspended_common_state(data, event_state)) return false;
    shmup_state = snapshot.state;
    player_event_runtime = snapshot.player;
    shmup_event_runner = restored_runner;
    checkpoint_resume_script_index = snapshot.script.script_index;
    checkpoint_resuming_script = restored_runner.active;
    wave_start_pending = snapshot.start_pending;
    shmup_event_wait_frames = snapshot.wait_frames;
    runtime_actor_gesture = snapshot.gesture;
    player_sprite_index = snapshot.player_sprite;
    checkpoint_music_index = snapshot.music_index;
    checkpoint_tracker_index = snapshot.tracker_index;
    shmup_high_score = snapshot.high_score;
    wave_clear_consumed = snapshot.clear_consumed;
    wave_spawned = snapshot.spawned;
    run_wave_spawn_scripts = snapshot.spawn_scripts;
    auto replay = enemy_reader;
    for (size_t index = 0; index < snapshot.enemy_count; ++index) {
        ShmupEnemyCheckpoint saved {};
        replay.read(saved);
        auto& enemy = runtime_enemies[index];
        enemy.position_pixels = saved.position;
        enemy.health = saved.health;
        enemy.fire_cooldown_frames = saved.cooldown;
        enemy.active = saved.active;
        enemy.destroying = saved.destroying;
        enemy.sprite_index = saved.sprite;
        enemy.destroy_wait_frames = saved.wait_frames;
        gbs::restore_checkpoint_script(saved.script, wave.enemies[index].on_destroy, enemy.destroy_runner);
    }
    for (auto& projectile : runtime_projectiles) projectile.active = false;
    for (auto& projectile : runtime_enemy_projectiles) projectile.active = false;
    for (size_t index = 0; index < snapshot.projectile_count; ++index) {
        ShmupProjectileCheckpoint saved {};
        replay.read(saved);
        auto& projectile = saved.pool == 0 ? runtime_projectiles[saved.index] : runtime_enemy_projectiles[saved.index];
        projectile = RuntimeProjectile { { saved.x, saved.y }, true };
    }
    event_state.current_room = shmup_state.wave_index;
    event_state.player_x = shmup_state.player_position_pixels.x;
    event_state.player_y = shmup_state.player_position_pixels.y;
    return gbs::restore_checkpoint_dialogue(snapshot.dialogue, dialogue, project.dialogue_lines, project.dialogue_line_count);
}
#endif

bool restore_shmup_runtime_state() {
    if (!gbastudio_shmup_project::save_enabled) {
        return false;
    }
    int latest_slot = gbs::find_latest_save_slot(gbastudio_shmup_project::save_bank);
    if (latest_slot < 0) {
        return false;
    }
    gbs::ShmupSaveData save_data {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_shmup_project::save_bank,
        static_cast<size_t>(latest_slot),
        &save_data,
        sizeof(save_data),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok || bytes_read != sizeof(save_data)) {
        return false;
    }

    gbs::ShmupRuntimeState restored_state = gbs::shmup_runtime_from_project(project);
    uint16_t restored_high_score = shmup_high_score;
    if (!gbs::apply_shmup_save_data(project, save_data, restored_state, event_state, restored_high_score)) {
        return false;
    }
    start_wave(restored_state.wave_index, false);
    shmup_state = restored_state;
    shmup_high_score = restored_high_score;
    gbs::SaveInfo info = gbs::inspect_save_slot(gbastudio_shmup_project::save_bank, static_cast<size_t>(latest_slot));
    shmup_save_sequence = info.sequence;
    refresh_hud();
    return true;
}

void move_player(gbs::InputState input) {
    gbs::Vec2i next = shmup_state.player_position_pixels;
    const bool movement_requested = input.is_held(gbs::ButtonLeft) ||
        input.is_held(gbs::ButtonRight) ||
        input.is_held(gbs::ButtonUp) ||
        input.is_held(gbs::ButtonDown);
    const int speed = gbs::shmup_player_movement_speed(
        gbs::consume_event_player_movement_step(player_event_runtime, movement_requested),
        input.is_held(gbs::ButtonB)
    );
    if (input.is_held(gbs::ButtonLeft)) {
        next.x -= speed;
    }
    if (input.is_held(gbs::ButtonRight)) {
        next.x += speed;
    }
    if (input.is_held(gbs::ButtonUp)) {
        next.y -= speed;
    }
    if (input.is_held(gbs::ButtonDown)) {
        next.y += speed;
    }
    next.x = gbs::clamp_int(next.x, 0, screen_width - project.player.size_pixels.x);
    next.y = gbs::clamp_int(next.y, 0, screen_height - project.player.size_pixels.y);
    const gbs::ShmupBackgroundData* background = active_background();
    if (background != nullptr && background->collision_flags != nullptr) {
        const gbs::Vec2i camera = active_background_camera();
        const int world_x = next.x + camera.x;
        const int world_y = next.y + camera.y;
        bool blocked = false;
        for (int y = world_y; y < world_y + project.player.size_pixels.y && !blocked; y += gbs::gba_tile_size) {
            for (int x = world_x; x < world_x + project.player.size_pixels.x; x += gbs::gba_tile_size) {
                if (gbs::shmup_background_collision_at(*background, x / gbs::gba_tile_size, y / gbs::gba_tile_size)) {
                    blocked = true;
                    break;
                }
            }
        }
        if (blocked) {
            return;
        }
    }
    shmup_state.player_position_pixels = next;
}

void fire_projectile() {
    if (shmup_state.lives == 0 || !gbs::shmup_can_fire(shmup_state)) {
        return;
    }
    for (size_t index = 0; index < max_runtime_projectiles; ++index) {
        if (!runtime_projectiles[index].active) {
            runtime_projectiles[index] = RuntimeProjectile {
                {
                    shmup_state.player_position_pixels.x + project.player.projectile_offset_pixels.x,
                    shmup_state.player_position_pixels.y + project.player.projectile_offset_pixels.y
                },
                true
            };
            const gbs::ShmupWaveData* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
            shmup_state.fire_cooldown_remaining = wave != nullptr && wave->fire_cooldown_frames > 0
                ? wave->fire_cooldown_frames
                : project.player.fire_cooldown_frames;
            run_shmup_event_script(gbs::shmup_player_fire_script(project));
            consume_event_state();
            player_fired_this_frame = true;
            return;
        }
    }
}

void consume_projectile_event_request() {
    const bool should_fire = event_state.projectile_launch_requested
        && event_state.projectile_launch_actor == 0;
    event_state.projectile_launch_requested = false;
    event_state.projectile_launch_actor = -1;
    event_state.projectile_launch_slot = -1;
    event_state.projectile_launch_direction = 0;
    if (should_fire) {
        fire_projectile();
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
    if (script_index >= 0 && static_cast<size_t>(script_index) < project.script_count) {
        run_shmup_event_script(project.scripts[script_index]);
        consume_event_state();
        consume_projectile_event_request();
    }
    return overrides_default;
}

void update_projectiles() {
    for (size_t index = 0; index < max_runtime_projectiles; ++index) {
        RuntimeProjectile& projectile = runtime_projectiles[index];
        if (!projectile.active) {
            continue;
        }
        projectile.position_pixels.x += project.player_projectile.velocity_pixels_per_frame.x;
        projectile.position_pixels.y += project.player_projectile.velocity_pixels_per_frame.y;
        if (projectile.position_pixels.x < -project.player_projectile.size_pixels.x ||
            projectile.position_pixels.x > screen_width ||
            projectile.position_pixels.y < -project.player_projectile.size_pixels.y ||
            projectile.position_pixels.y > screen_height) {
            projectile.active = false;
        }
    }
}

void fire_enemy_projectile(const gbs::ShmupEnemyData& enemy, const RuntimeEnemy& runtime_enemy) {
    if (enemy.fire_interval_frames == 0) {
        return;
    }
    const gbs::Vec2i screen_position = enemy_screen_position(runtime_enemy);
    if (screen_position.x + enemy.size_pixels.x <= 0 || screen_position.x >= screen_width ||
        screen_position.y + enemy.size_pixels.y <= 0 || screen_position.y >= screen_height) {
        return;
    }
    for (size_t index = 0; index < max_runtime_enemy_projectiles; ++index) {
        if (!runtime_enemy_projectiles[index].active) {
            runtime_enemy_projectiles[index] = RuntimeProjectile {
                {
                    screen_position.x + enemy.projectile_offset_pixels.x,
                    screen_position.y + enemy.projectile_offset_pixels.y
                },
                true
            };
            return;
        }
    }
}

void update_enemy_projectiles() {
    for (size_t index = 0; index < max_runtime_enemy_projectiles; ++index) {
        RuntimeProjectile& projectile = runtime_enemy_projectiles[index];
        if (!projectile.active) {
            continue;
        }
        projectile.position_pixels.x += project.enemy_projectile.velocity_pixels_per_frame.x;
        projectile.position_pixels.y += project.enemy_projectile.velocity_pixels_per_frame.y;
        if (projectile.position_pixels.y < -project.enemy_projectile.size_pixels.y ||
            projectile.position_pixels.y > screen_height ||
            projectile.position_pixels.x < -project.enemy_projectile.size_pixels.x ||
            projectile.position_pixels.x > screen_width) {
            projectile.active = false;
        }
    }
}

void update_destroying_enemy(RuntimeEnemy& runtime_enemy) {
    if (!runtime_enemy.destroying || !runtime_enemy.active) {
        return;
    }
    if (runtime_enemy.destroy_wait_frames > 0) {
        --runtime_enemy.destroy_wait_frames;
        return;
    }
#if GBS_MULTI_RUNTIME
    const bool still_active = gbs::update_checkpoint_event_runner(runtime_enemy.destroy_runner, event_state);
#else
    const bool still_active = gbs::update_event_runner(runtime_enemy.destroy_runner, event_state);
#endif
    consume_event_state();
    if (event_state.wait_frames > 0) {
        runtime_enemy.destroy_wait_frames = static_cast<uint16_t>(event_state.wait_frames);
        event_state.wait_frames = 0;
    }
    if (!still_active && runtime_enemy.destroy_wait_frames == 0) {
        runtime_enemy.active = false;
        runtime_enemy.destroying = false;
    }
}

void update_enemies() {
    const gbs::ShmupWaveData* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    if (wave == nullptr) {
        return;
    }
    for (size_t index = 0; index < wave->enemy_count; ++index) {
        RuntimeEnemy& runtime_enemy = runtime_enemies[index];
        if (!runtime_enemy.active) {
            continue;
        }
        if (runtime_enemy.destroying) {
            update_destroying_enemy(runtime_enemy);
            continue;
        }
        const gbs::ShmupEnemyData& enemy = wave->enemies[index];
        runtime_enemy.position_pixels.x += enemy.velocity_pixels_per_frame.x;
        runtime_enemy.position_pixels.y += enemy.velocity_pixels_per_frame.y;
        if (enemy.movement == gbs::ShmupEnemyMovementKind::Sine) {
            runtime_enemy.position_pixels.x += (shmup_state.frame_counter & 16) ? 1 : -1;
        } else if (enemy.movement == gbs::ShmupEnemyMovementKind::Dive && runtime_enemy.position_pixels.y > 40) {
            runtime_enemy.position_pixels.y += 1;
        }
        if (enemy.fire_interval_frames > 0) {
            if (runtime_enemy.fire_cooldown_frames > 0) {
                --runtime_enemy.fire_cooldown_frames;
            }
            if (runtime_enemy.fire_cooldown_frames == 0) {
                fire_enemy_projectile(enemy, runtime_enemy);
                runtime_enemy.fire_cooldown_frames = enemy.fire_interval_frames;
            }
        }
        const gbs::Vec2i screen_position = enemy_screen_position(runtime_enemy);
        if (screen_position.x + enemy.size_pixels.x < 0 ||
            screen_position.y > screen_height ||
            screen_position.y + enemy.size_pixels.y < 0) {
            runtime_enemy.active = false;
        }
    }
}

void damage_player(gbs::EventScript script) {
    if (!gbs::shmup_player_is_vulnerable(shmup_state)) {
        return;
    }
    --shmup_state.lives;
    player_damaged_this_frame = true;
    shmup_state.invulnerability_frames_remaining = player_hit_invulnerability_frames;
    run_shmup_event_script(script);
    consume_event_state();
    refresh_hud();
    persist_shmup_runtime_state();
}

void handle_collisions() {
    const gbs::ShmupWaveData* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    if (wave == nullptr) {
        return;
    }
    const size_t enemy_count = wave->enemy_count;
    for (size_t projectile_index = 0; projectile_index < max_runtime_projectiles; ++projectile_index) {
        RuntimeProjectile& projectile = runtime_projectiles[projectile_index];
        if (!projectile.active) {
            continue;
        }
        const gbs::Rect projectile_rect = {
            projectile.position_pixels.x,
            projectile.position_pixels.y,
            project.player_projectile.size_pixels.x,
            project.player_projectile.size_pixels.y
        };
        for (size_t enemy_index = 0; enemy_index < enemy_count; ++enemy_index) {
            RuntimeEnemy& runtime_enemy = runtime_enemies[enemy_index];
            if (!runtime_enemy.active) {
                continue;
            }
            const gbs::ShmupEnemyData& enemy = wave->enemies[enemy_index];
            const gbs::Vec2i screen_position = enemy_screen_position(runtime_enemy);
            const gbs::Rect enemy_rect = {
                screen_position.x,
                screen_position.y,
                enemy.size_pixels.x,
                enemy.size_pixels.y
            };
            if (!gbs::intersects(projectile_rect, enemy_rect)) {
                continue;
            }
            projectile.active = false;
            if (runtime_enemy.health > 0) {
                --runtime_enemy.health;
            }
            if (runtime_enemy.health == 0) {
                if (project.score_enabled) {
                    shmup_state.score = gbs::shmup_add_score(shmup_state.score, enemy.score_value);
                }
                refresh_high_score();
                refresh_hud();
                if (gbs::has_event_script(enemy.on_destroy)) {
                    runtime_enemy.destroying = true;
                    gbs::start_event_runner(runtime_enemy.destroy_runner, enemy.on_destroy);
                    update_destroying_enemy(runtime_enemy);
                } else {
                    runtime_enemy.active = false;
                }
                persist_shmup_runtime_state();
            }
            break;
        }
    }

    const gbs::Rect player_rect = gbs::shmup_player_rect(project, shmup_state);
    for (size_t projectile_index = 0; projectile_index < max_runtime_enemy_projectiles; ++projectile_index) {
        RuntimeProjectile& projectile = runtime_enemy_projectiles[projectile_index];
        if (!projectile.active) {
            continue;
        }
        const gbs::Rect projectile_rect = {
            projectile.position_pixels.x,
            projectile.position_pixels.y,
            project.enemy_projectile.size_pixels.x,
            project.enemy_projectile.size_pixels.y
        };
        if (gbs::intersects(projectile_rect, player_rect)) {
            projectile.active = false;
            damage_player(project.enemy_projectile.on_hit_player);
        }
    }

    for (size_t enemy_index = 0; enemy_index < enemy_count; ++enemy_index) {
        RuntimeEnemy& runtime_enemy = runtime_enemies[enemy_index];
        if (!runtime_enemy.active) {
            continue;
        }
        const gbs::ShmupEnemyData& enemy = wave->enemies[enemy_index];
        const gbs::Vec2i screen_position = enemy_screen_position(runtime_enemy);
        const gbs::Rect enemy_rect = {
            screen_position.x,
            screen_position.y,
            enemy.size_pixels.x,
            enemy.size_pixels.y
        };
        if (gbs::intersects(enemy_rect, player_rect)) {
            damage_player(enemy.on_hit_player);
            runtime_enemy.active = false;
        }
    }
}

bool wave_is_clear() {
    if (!wave_spawned) {
        return false;
    }
    for (size_t index = 0; index < max_runtime_enemies; ++index) {
        if (runtime_enemies[index].active) {
            return false;
        }
    }
    return true;
}

void advance_cleared_wave() {
    const auto* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    if (wave == nullptr) return;
    if (!project.waves_enabled) {
        return;
    }
    int next_wave = wave->next_wave_index;
    if (next_wave < 0 && project.loop_waves) {
        next_wave = project.initial_wave;
    }
    if (next_wave >= 0 && next_wave < project.max_waves) {
        start_wave(next_wave);
        gbastudio_dialogue_ui::configure_for_scene(project.waves[shmup_state.wave_index].name);
        apply_background();
        refresh_hud();
        persist_shmup_runtime_state();
    }
}

#if GBS_MULTI_RUNTIME
void finish_restored_shmup_script() {
    if (!checkpoint_resuming_script || gbs::event_runner_is_active(shmup_event_runner)) return;
    checkpoint_resuming_script = false;
    if (gbs::runtime_transition_requested()) return;
    const auto* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    if (wave == nullptr) return;
    const int script_index = checkpoint_resume_script_index;
    if (script_index == 1) advance_cleared_wave();
    else if (script_index >= 100 && script_index < 100 + static_cast<int>(wave->enemy_count)) {
        for (size_t index = static_cast<size_t>(script_index - 100 + 1); index < wave->enemy_count; ++index)
            run_shmup_event_script(wave->enemies[index].on_spawn);
        if (wave_start_pending) {
            run_shmup_event_script(wave->on_start);
            consume_event_state();
            wave_start_pending = false;
        }
    } else if (script_index == 0) wave_start_pending = false;
}
#endif

void maybe_advance_wave() {
    if (shmup_state.lives == 0) return;
    const gbs::ShmupWaveData* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    if (wave == nullptr || wave_clear_consumed || !wave_is_clear()) {
        return;
    }
    wave_clear_consumed = true;
    run_shmup_event_script(wave->on_clear);
    consume_event_state();
    advance_cleared_wave();
}

void update_shmup(gbs::InputState input, bool allow_default_fire) {
    const gbs::Vec2i previous_position = shmup_state.player_position_pixels;
    if (shmup_state.fire_cooldown_remaining > 0) {
        --shmup_state.fire_cooldown_remaining;
    }
    if (shmup_state.invulnerability_frames_remaining > 0) {
        --shmup_state.invulnerability_frames_remaining;
    }
    if (runtime_actor_gesture.frames_remaining > 0) {
        --runtime_actor_gesture.frames_remaining;
    }
    if (player_event_runtime.active && shmup_state.lives > 0) {
        move_player(input);
    }
    if (player_event_runtime.active && allow_default_fire && input.is_held(gbs::ButtonA)) {
        fire_projectile();
    }
    const gbs::ShmupWaveData* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    if (wave != nullptr) {
        spawn_wave_enemies(*wave);
    }
    update_projectiles();
    update_enemy_projectiles();
    update_enemies();
    handle_collisions();
    gbs::update_shmup_player_animator(player_animator, project.player.animations,
        { shmup_state.player_position_pixels.x - previous_position.x,
          shmup_state.player_position_pixels.y - previous_position.y },
        player_fired_this_frame, player_damaged_this_frame, shmup_state.lives > 0);
    maybe_advance_wave();
    ++shmup_state.frame_counter;
    if ((shmup_state.frame_counter % 60) == 0) {
        persist_shmup_runtime_state();
    }
}

void draw_scene() {
    gbs::hide_sprites(0, 64);

    int sprite_index = 0;
    const bool exploding = player_animator.action == gbs::ShmupPlayerAnimationAction::Explosion &&
        player_animator.animator.playing;
    const bool player_visible = exploding || (shmup_state.lives > 0 && player_event_runtime.active &&
        ((shmup_state.invulnerability_frames_remaining & 4) == 0));
    const gbs::MetaSprite* animated_metasprite = gbs::current_metasprite(player_animator.animator);
    const gbs::MetaSprite* player_metasprite = actor_sprite_for_index(player_sprite_index,
        animated_metasprite != nullptr ? animated_metasprite : project.player.metasprite);
    if (player_visible && player_sprite_index < 0 && animated_metasprite != nullptr) {
        const auto& frame = player_animator.animator.animation->frames[player_animator.animator.frame_index];
        if (frame.streamed_tile_asset != nullptr && frame.streamed_tile_asset != player_streamed_tile_asset_loaded) {
            if (gbs::load_tiles(*frame.streamed_tile_asset)) player_streamed_tile_asset_loaded = frame.streamed_tile_asset;
        }
    }
    if (player_visible && player_metasprite != nullptr && gbs::is_valid_metasprite(*player_metasprite)) {
        gbs::set_metasprite(sprite_index, *player_metasprite, shmup_state.player_position_pixels);
        sprite_index += player_metasprite->part_count;
    } else if (player_visible) {
        gbs::set_sprite(sprite_index++, gbs::Sprite {
            shmup_state.player_position_pixels.x,
            shmup_state.player_position_pixels.y,
            static_cast<uint16_t>(builtin_tile_start + player_tile_asset.destination_tile),
            builtin_palette_bank,
            false,
            false,
            true,
            1,
            gbs::SpriteRenderMode::Normal
        });
    }
    const gbs::ShmupWaveData* wave = gbs::shmup_wave_for(project, shmup_state.wave_index);
    if (wave != nullptr) {
        const size_t enemy_count = wave->enemy_count;
        for (size_t index = 0; index < enemy_count && sprite_index < 40; ++index) {
            const RuntimeEnemy& runtime_enemy = runtime_enemies[index];
            if (!runtime_enemy.active) {
                continue;
            }
            const gbs::ShmupEnemyData& enemy = wave->enemies[index];
            const gbs::Vec2i screen_position = enemy_screen_position(runtime_enemy);
            if (screen_position.x + enemy.size_pixels.x <= 0 || screen_position.x >= screen_width ||
                screen_position.y + enemy.size_pixels.y <= 0 || screen_position.y >= screen_height) {
                continue;
            }
            const gbs::MetaSprite* enemy_metasprite = actor_sprite_for_index(runtime_enemy.sprite_index, enemy.metasprite);
            if (enemy_metasprite != nullptr && gbs::is_valid_metasprite(*enemy_metasprite)) {
                gbs::set_metasprite(sprite_index, *enemy_metasprite, screen_position);
                sprite_index += enemy_metasprite->part_count;
            } else {
                gbs::set_sprite(sprite_index++, gbs::Sprite {
                    screen_position.x,
                    screen_position.y,
                    static_cast<uint16_t>(builtin_tile_start + enemy_tile_asset.destination_tile),
                    builtin_palette_bank,
                    false,
                    false,
                    true,
                    1,
                    gbs::SpriteRenderMode::Normal
                });
            }
        }
    }

    if (runtime_actor_gesture.frames_remaining > 0 && project.emote_assets != nullptr &&
        runtime_actor_gesture.emote_index >= 0 &&
        static_cast<size_t>(runtime_actor_gesture.emote_index) < project.emote_asset_count) {
        const gbs::MetaSprite* emote = project.emote_assets[runtime_actor_gesture.emote_index].metasprite;
        gbs::Vec2i actor_position = shmup_state.player_position_pixels;
        if (runtime_actor_gesture.actor_index >= 0 &&
            static_cast<size_t>(runtime_actor_gesture.actor_index) < max_runtime_enemies) {
            actor_position = enemy_screen_position(runtime_enemies[runtime_actor_gesture.actor_index]);
        }
        if (emote != nullptr && gbs::is_valid_metasprite(*emote) && sprite_index + emote->part_count <= 64) {
            const gbs::Vec2i emote_position = gbs::dialogue_emote_position_pixels(actor_position);
            gbs::set_metasprite(sprite_index, *emote, emote_position);
            sprite_index += emote->part_count;
        }
    }

    for (size_t index = 0; index < max_runtime_projectiles && sprite_index < 64; ++index) {
        const RuntimeProjectile& projectile = runtime_projectiles[index];
        if (!projectile.active) {
            continue;
        }
        if (project.player_projectile.metasprite != nullptr && gbs::is_valid_metasprite(*project.player_projectile.metasprite)) {
            gbs::set_metasprite(sprite_index, *project.player_projectile.metasprite, projectile.position_pixels);
            sprite_index += project.player_projectile.metasprite->part_count;
        } else {
            gbs::set_sprite(sprite_index++, gbs::Sprite {
                projectile.position_pixels.x,
                projectile.position_pixels.y,
                static_cast<uint16_t>(builtin_tile_start + bullet_tile_asset.destination_tile),
                builtin_palette_bank,
                false,
                false,
                true,
                0,
                gbs::SpriteRenderMode::Normal
            });
        }
    }

    for (size_t index = 0; index < max_runtime_enemy_projectiles && sprite_index < 64; ++index) {
        const RuntimeProjectile& projectile = runtime_enemy_projectiles[index];
        if (!projectile.active) {
            continue;
        }
        if (project.enemy_projectile.metasprite != nullptr &&
            gbs::is_valid_metasprite(*project.enemy_projectile.metasprite)) {
            gbs::set_metasprite(sprite_index, *project.enemy_projectile.metasprite, projectile.position_pixels);
            sprite_index += project.enemy_projectile.metasprite->part_count;
        } else {
            gbs::set_sprite(sprite_index++, gbs::Sprite {
                projectile.position_pixels.x,
                projectile.position_pixels.y,
                static_cast<uint16_t>(builtin_tile_start + bullet_tile_asset.destination_tile),
                builtin_palette_bank,
                false,
                false,
                true,
                0,
                gbs::SpriteRenderMode::Normal
            });
        }
    }
}

} // namespace

int initialize_shmup_runtime() {
    gbs::init();
    gbs::reset_runtime_telemetry();
    runtime_last_wave = -1;
    runtime_wave_change_count = 0;
    gbs::init_dialogue(dialogue);
    gbs::init_shmup_player_animator(player_animator);
    player_streamed_tile_asset_loaded = nullptr;
    gbs::configure_dialogue_emotes(project.emote_assets, project.emote_asset_count);
    gbs::init_hud(hud);
    gbs::init_event_state(event_state);
    player_event_runtime = gbs::EventPlayerRuntimeState {
        true,
        0,
        0,
        3,
        project.player.speed_pixels_per_frame * 100,
        0
    };
    gbs::init_resource_manager(resource_manager);
    builtin_obj_tiles = {};
    builtin_obj_palette = {};
    builtin_tile_start = 0;
    builtin_palette_bank = 0;
    gbs::set_backdrop_color(gbs::rgb15(0, 0, 7));

    if (!gbs::is_valid_shmup_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    shmup_state = gbs::shmup_runtime_from_project(project);
#if GBS_MULTI_RUNTIME
    int restore_slot = -1;
    if (gbs::consume_runtime_save_restore(gbs::RuntimeKind::Shmup, restore_slot)) {
        if (!restore_shmup_checkpoint(restore_slot)) return -1;
        if (checkpoint_music_index >= 0) gbs::play_music(project.music_assets[checkpoint_music_index]);
        if (checkpoint_tracker_index >= 0) gbs::play_tracker_music(project.tracker_assets[checkpoint_tracker_index]);
    } else {
    int transition_wave = project.initial_wave;
    int transition_x = 0;
    int transition_y = 0;
    const bool resumed_from_transition = gbs::consume_runtime_transition(
        gbs::RuntimeKind::Shmup,
        event_state,
        transition_wave,
        transition_x,
        transition_y
    );
    start_wave(resumed_from_transition ? transition_wave : project.initial_wave);
    }
    refresh_hud();
#else
    if (!restore_shmup_runtime_state()) {
        start_wave(project.initial_wave);
        refresh_hud();
        persist_shmup_runtime_state();
    }
#endif
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(project.waves[shmup_state.wave_index].name);
    apply_background();

    return 0;
}

gbs::RuntimeAdapterFrameResult update_shmup_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    gbastudio_dialogue_ui::configure_for_scene(project.waves[shmup_state.wave_index].name);
    const gbs::InputState input = gbs::begin_frame().input;
    player_fired_this_frame = false;
    player_damaged_this_frame = false;
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
#if GBS_MULTI_RUNTIME
    if (!dialogue.visible && gbs::event_runner_is_active(shmup_event_runner)) {
        if (shmup_event_wait_frames > 0) --shmup_event_wait_frames;
        else {
            gbs::update_checkpoint_event_runner(shmup_event_runner, event_state);
            if (event_state.wait_frames > 0) {
                shmup_event_wait_frames = event_state.wait_frames;
                event_state.wait_frames = 0;
            }
            consume_event_state();
            finish_restored_shmup_script();
        }
    } else
#endif
    if (dialogue.visible && input.was_pressed(gbs::ButtonA)) {
        gbs::advance_dialogue(dialogue, input);
    } else {
        const bool overrides_default = gbs::button_event_binding_overrides_default(event_state, input.held);
        run_button_event_binding();
        update_shmup(input, !overrides_default);
    }
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        return gbs::RuntimeAdapterFrameResult::Transition;
    }
#endif
    return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_shmup_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    stream_background();
    refresh_affine_background();
    refresh_scene_composition_hblank(shmup_state.frame_counter);
    draw_scene();
    refresh_hud();
    gbs::draw_hud(hud);
    gbs::draw_dialogue(dialogue);
    sync_runtime_telemetry();
    gbs::wait_vblank();
}

void leave_shmup_runtime() {
    gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);
}

extern "C" void GBS_SHMUP_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    shmup_initialization_result = initialize_shmup_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_SHMUP_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    if (shmup_initialization_result != 0) return gbs::RuntimeAdapterFrameResult::Error;
    return update_shmup_runtime(context);
}

extern "C" void GBS_SHMUP_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_shmup_runtime(context);
}

extern "C" void GBS_SHMUP_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_shmup_runtime();
}

extern "C" int GBS_SHMUP_RUNTIME_ENTRY() {
    shmup_initialization_result = initialize_shmup_runtime();
    if (shmup_initialization_result != 0) {
        leave_shmup_runtime();
        return shmup_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::Shmup,
            shmup_state.wave_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_shmup_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_shmup_runtime();
            return -1;
        }
        render_shmup_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_shmup_runtime();
            return 0;
        }
    }
}
