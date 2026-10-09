#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/ui.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/save.hpp"
#include "gbs/runtime_checkpoint.hpp"
#include "gbs/visual_effects.hpp"

#ifndef GBS_LUTA_PROJECT_DATA_HEADER
#define GBS_LUTA_PROJECT_DATA_HEADER "luta_project_data.hpp"
#endif
#include GBS_LUTA_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_LUTA_RUNTIME_ENTRY
#define GBS_LUTA_RUNTIME_ENTRY gbs_main
#endif

#ifndef GBS_LUTA_RUNTIME_ENTER
#define GBS_LUTA_RUNTIME_ENTER gbs_enter_luta
#endif

#ifndef GBS_LUTA_RUNTIME_UPDATE
#define GBS_LUTA_RUNTIME_UPDATE gbs_update_luta
#endif

#ifndef GBS_LUTA_RUNTIME_RENDER
#define GBS_LUTA_RUNTIME_RENDER gbs_render_luta
#endif

#ifndef GBS_LUTA_RUNTIME_LEAVE
#define GBS_LUTA_RUNTIME_LEAVE gbs_leave_luta
#endif

#ifndef GBS_MULTI_RUNTIME
#define GBS_MULTI_RUNTIME 0
#endif

namespace {

const gbs::LutaProjectData& project = gbastudio_luta_project::project;
int stage_index = 0;
gbs::LutaRuntimeState state {};
gbs::LutaVisualStateData p1_visual_state {};
const gbs::TileAsset* p1_streamed_tile_asset_loaded = nullptr;
const gbs::TileAsset* p2_streamed_tile_asset_loaded = nullptr;
gbs::LutaVisualStateData p2_visual_state {};
gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::EventRunner luta_event_runner {};
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
uint32_t luta_save_sequence = 0;
int luta_initialization_result = -1;
int luta_event_wait_frames = 0;
constexpr int luta_cpu_initial_reaction_frames = 120;
constexpr int luta_cpu_attack_interval_frames = 90;
int luta_cpu_attack_wait_frames = luta_cpu_initial_reaction_frames;
bool luta_script_controls_dialogue = false;
bool outcome_hook_started = false;
bool outcome_hook_handled = false;
volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
constexpr size_t max_resource_bank_reservations = 64;
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

#if GBS_MULTI_RUNTIME
int checkpoint_music_index = -1;
int checkpoint_tracker_index = -1;
struct LutaRuntimeCheckpoint {
    uint32_t version;
    gbs::LutaRuntimeState state;
    gbs::CheckpointScript script;
    gbs::CheckpointDialogue dialogue;
    gbs::CheckpointEvents events;
    int32_t music_index;
    int32_t tracker_index;
    int32_t wait_frames;
    int32_t cpu_wait_frames;
    bool script_controls_dialogue;
    bool outcome_started;
    bool outcome_handled;
};
static_assert(sizeof(LutaRuntimeCheckpoint) <= gbs::universal_save_payload_capacity);

gbs::EventScript checkpoint_script_for(int room, int script_index) {
    if (room < 0 || static_cast<size_t>(room) >= project.stage_count) return gbs::empty_event_script();
    const auto& room_data = project.stages[room];
    switch (script_index) {
    case 0: return room_data.on_enter;
    case 1: return room_data.on_victory;
    case 2: return room_data.on_defeat;
    default: return gbs::empty_event_script();
    }
}

int current_checkpoint_script_index() {
    if (!gbs::has_event_script(luta_event_runner.script)) return -1;
    for (int index = 0; index < 3; ++index) {
        const auto script = checkpoint_script_for(stage_index, index);
        if (script.commands == luta_event_runner.script.commands && script.command_count == luta_event_runner.script.command_count) return index;
    }
    return -1;
}

bool capture_luta_checkpoint(gbs::UniversalSaveData& data) {
    if (gbs::checkpoint_dialogue_is_feedback(dialogue)) return false;
    const int script_index = current_checkpoint_script_index();
    if (luta_event_runner.active && script_index < 0) return false;
    const LutaRuntimeCheckpoint snapshot {
        1, state, gbs::capture_checkpoint_script(luta_event_runner, script_index),
        gbs::capture_checkpoint_dialogue(dialogue), gbs::capture_checkpoint_events(event_state),
        checkpoint_music_index, checkpoint_tracker_index, luta_event_wait_frames,
        luta_cpu_attack_wait_frames,
        luta_script_controls_dialogue, outcome_hook_started, outcome_hook_handled
    };
    return gbs::capture_runtime_checkpoint(data, gbs::UniversalSaveRuntime::Luta, stage_index,
        state.p1_x, state.p1_y, event_state, &snapshot, sizeof(snapshot), gbs::frame_count());
}

bool restore_luta_checkpoint(int slot) {
    auto* service = gbs::active_runtime_save_service();
    gbs::UniversalSaveData data {};
    LutaRuntimeCheckpoint snapshot {};
    if (service == nullptr || gbs::read_runtime_save(*service, slot, data) != gbs::SaveStatus::Ok ||
        !gbs::read_universal_save_payload(data, gbs::UniversalSaveRuntime::Luta, &snapshot, sizeof(snapshot)) ||
        snapshot.version != 1 || data.room_index < 0 || static_cast<size_t>(data.room_index) >= project.stage_count ||
        snapshot.wait_frames < 0 || snapshot.music_index < -1 || snapshot.tracker_index < -1 ||
        (snapshot.music_index >= 0 && static_cast<size_t>(snapshot.music_index) >= project.music_asset_count) ||
        (snapshot.tracker_index >= 0 && static_cast<size_t>(snapshot.tracker_index) >= project.tracker_asset_count) ||
        !gbs::valid_checkpoint_dialogue(snapshot.dialogue, project.dialogue_line_count)) return false;
    gbs::EventRunner restored_runner {};
    if (!gbs::restore_checkpoint_script(snapshot.script,
            checkpoint_script_for(data.room_index, snapshot.script.script_index), restored_runner)) return false;
    if (snapshot.cpu_wait_frames < 0 || snapshot.state.round_state > gbs::LutaRoundState::Draw ||
        snapshot.state.p1_ism_style > gbs::LutaIsmStyle::VIsm || snapshot.state.p2_ism_style > gbs::LutaIsmStyle::VIsm ||
        snapshot.state.p1_hp > snapshot.state.p1_max_hp || snapshot.state.p2_hp > snapshot.state.p2_max_hp) return false;
    if (!gbs::restore_checkpoint_events(snapshot.events, event_state) ||
        !gbs::restore_suspended_common_state(data, event_state)) return false;
    stage_index = data.room_index;
    state = snapshot.state;
    luta_event_runner = restored_runner;
    luta_event_wait_frames = snapshot.wait_frames;
    luta_cpu_attack_wait_frames = snapshot.cpu_wait_frames;
    luta_script_controls_dialogue = snapshot.script_controls_dialogue;
    outcome_hook_started = snapshot.outcome_started;
    outcome_hook_handled = snapshot.outcome_handled;
    checkpoint_music_index = snapshot.music_index;
    checkpoint_tracker_index = snapshot.tracker_index;
    event_state.current_room = stage_index;
    event_state.player_x = state.p1_x;
    event_state.player_y = state.p1_y;
    return gbs::restore_checkpoint_dialogue(snapshot.dialogue, dialogue, project.dialogue_lines, project.dialogue_line_count);
}

void consume_luta_checkpoint_request() {
    if (event_state.save_request == 0) return;
    gbs::UniversalSaveData data {};
    const bool captured = event_state.save_request != 1 || capture_luta_checkpoint(data);
    const bool saving = event_state.save_request == 1;
    const auto status = gbs::consume_checkpoint_request(event_state, data, captured, "LUTA", gbs::RuntimeKind::Luta);
    if (saving && status != gbs::SaveStatus::Ok) {
        gbs::show_checkpoint_save_failure(dialogue);
        luta_script_controls_dialogue = true;
    }
}
#endif

void sync_runtime_telemetry() {
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = stage_index;
    runtime_telemetry.flag_bits = static_cast<uint32_t>(state.round_state) << 28;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) {
            runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
        }
    }
    runtime_telemetry.player_x = state.p1_super_gauge;
    runtime_telemetry.player_y = state.p2_super_gauge;
    runtime_telemetry.player_direction = state.round_timer;
    runtime_telemetry.actor_count = state.round;
    runtime_telemetry.first_actor_x = state.p1_hp;
    runtime_telemetry.first_actor_y = state.p2_hp;
    runtime_telemetry.first_actor_direction = static_cast<int>(state.p1_ism_style);
    runtime_telemetry.first_actor_visible = state.p2_hp > 0 ? 1 : 0;
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    runtime_telemetry.current_tile_flags = static_cast<uint32_t>(state.p1_wins);
    runtime_telemetry.current_tile_slope = static_cast<uint32_t>(state.p2_wins);
    runtime_telemetry.room_change_count = outcome_hook_handled ? 1u : 0u;
    gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
}

void apply_luta_visuals(const gbs::LutaStageData& stage);
void reset_luta_animation_states(const gbs::LutaStageData& stage);
void set_luta_action_visual(bool player_one, gbs::LutaVisualState visual_state, const gbs::LutaStageData& stage);

void consume_event_state() {
    const auto gauge1 = state.p1_super_gauge;
    const auto gauge2 = state.p2_super_gauge;
    const auto hp1 = state.p1_hp;
    const auto hp2 = state.p2_hp;
    if (gbs::consume_luta_event_commands(project, event_state, stage_index, state)) {
        gbastudio_dialogue_ui::configure_for_scene(project.stages[stage_index].id);
        apply_luta_visuals(project.stages[stage_index]);
        reset_luta_animation_states(project.stages[stage_index]);
        outcome_hook_started = outcome_hook_handled = false;
        luta_cpu_attack_wait_frames = luta_cpu_initial_reaction_frames;
    }
    if (state.p1_super_gauge < gauge1 && state.p2_hp < hp2)
        set_luta_action_visual(true, gbs::LutaVisualState::Special, project.stages[stage_index]);
    if (state.p2_super_gauge < gauge2 && state.p1_hp < hp1)
        set_luta_action_visual(false, gbs::LutaVisualState::Special, project.stages[stage_index]);
    gbs::consume_scene_transition_visual_effect_event(event_state);
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count
    );
    if (event_state.last_dialogue >= 0) {
        gbs::show_dialogue(
            dialogue,
            project.dialogue_lines,
            project.dialogue_line_count,
            event_state.last_dialogue
        );
        event_state.last_dialogue = -1;
        luta_script_controls_dialogue = dialogue.visible;
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
        luta_script_controls_dialogue = false;
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
    if (event_state.wait_frames > 0) {
        luta_event_wait_frames = event_state.wait_frames;
        event_state.wait_frames = 0;
    }
#if GBS_MULTI_RUNTIME
    consume_luta_checkpoint_request();
#endif
}

bool start_luta_event_script(gbs::EventScript script) {
    luta_event_wait_frames = 0;
    luta_script_controls_dialogue = false;
    if (!gbs::has_event_script(script)) {
        return false;
    }
    gbs::start_event_runner(luta_event_runner, script);
    return true;
}

bool update_luta_event_script(const gbs::InputState& input) {
    if (luta_script_controls_dialogue && dialogue.visible) {
        gbs::advance_dialogue(dialogue, input);
        if (!dialogue.visible) {
            luta_script_controls_dialogue = false;
        }
        return true;
    }
    if (luta_event_wait_frames > 0) {
        --luta_event_wait_frames;
        return true;
    }
    if (!gbs::event_runner_is_active(luta_event_runner)) {
        return false;
    }
#if GBS_MULTI_RUNTIME
    gbs::update_checkpoint_event_runner(luta_event_runner, event_state);
#else
    gbs::update_event_runner(luta_event_runner, event_state);
#endif
    consume_event_state();
    return true;
}

bool stream_stage_resource_group(const gbs::LutaStageData& stage) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_luta_stage(
        project,
        stage
    );
    if (group.bank_count == 0) {
        return false;
    }
    return gbs::stream_resource_bank_group_with_uploads(
        resource_manager,
        active_resource_bank_group,
        scratch_resource_bank_group,
        group,
        project.resource_bank_upload_sources,
        project.resource_bank_upload_source_count
    ).success;
}

void write_three_digits(char* text, uint16_t value) {
    if (value > 999) value = 999;
    text[0] = static_cast<char>('0' + (value / 100));
    text[1] = static_cast<char>('0' + ((value / 10) % 10));
    text[2] = static_cast<char>('0' + (value % 10));
}

void draw_luta_status_hud() {
    char p1_status[] = "NARA 100";
    char p2_status[] = "RIVAL096";
    char round_timer[] = "99";
    write_three_digits(&p1_status[5], state.p1_hp);
    write_three_digits(&p2_status[5], state.p2_hp);
    uint16_t seconds = static_cast<uint16_t>(state.round_timer / 60u);
    if (seconds > 99) seconds = 99;
    round_timer[0] = static_cast<char>('0' + (seconds / 10));
    round_timer[1] = static_cast<char>('0' + (seconds % 10));

    /* The approved HUD is a fixed BG0 shell. Its state text lives in separate
     * OAM slots so it can update without repainting the authored frame or
     * stealing OAM entries from either fighter. */
    gbs::draw_text_overlay(0, 0, 1, nullptr, false);
    gbs::draw_text_overlay_slot(4, 1, 8, p1_status, 0, true);
    gbs::draw_text_overlay_slot(18, 1, 8, p2_status, 10, true);
    gbs::draw_text_overlay_slot(14, 1, 2, round_timer, 20, true);
}

void apply_luta_visuals(const gbs::LutaStageData& stage) {
    p1_streamed_tile_asset_loaded = nullptr;
    p2_streamed_tile_asset_loaded = nullptr;
    const bool resources_ready = stream_stage_resource_group(stage);
    if (!resources_ready) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        return;
    }
    if (project.resource_bank_group_count == 0) {
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
    // Mixed ROMs can enter luta after a runtime that uses optional BG layers.
    // Keep BG0 available for the HUD and reset stale room layers before
    // enabling the stage layer below.
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);
    if (project.hud != nullptr) {
        gbs::load_tilemap(project.hud->layer, project.hud->tilemap);
        gbs::set_bg_enabled(project.hud->layer, true);
        gbs::set_bg_scroll(project.hud->layer, 0, 0);
    }
    const gbs::LutaBackgroundData* background = gbs::luta_background_for(
        project,
        stage
    );
    if (background == nullptr) {
        return;
    }
    gbs::set_backdrop_color(background->backdrop_color);
    gbs::load_tilemap(background->layer, background->tilemap);
    gbs::set_bg_enabled(background->layer, true);
    gbs::set_bg_scroll(background->layer, 0, 0);
}

const gbs::LutaCharacter* luta_stage_fighter(const gbs::LutaStageData& stage, bool player_one) {
    if (player_one) {
        return stage.p1_fighters != nullptr && stage.p1_fighter_count > 0
            ? &stage.p1_fighters[0]
            : nullptr;
    }
    return stage.p2_fighters != nullptr && stage.p2_fighter_count > 0
        ? &stage.p2_fighters[0]
        : nullptr;
}

void reset_luta_animation_states(const gbs::LutaStageData& stage) {
    gbs::init_luta_visual_state(p1_visual_state);
    gbs::init_luta_visual_state(p2_visual_state);
    const gbs::LutaCharacter* p1 = luta_stage_fighter(stage, true);
    const gbs::LutaCharacter* p2 = luta_stage_fighter(stage, false);
    gbs::set_luta_visual_state(p1_visual_state, p1 != nullptr ? p1->animation_set : nullptr, gbs::LutaVisualState::Idle);
    gbs::set_luta_visual_state(p2_visual_state, p2 != nullptr ? p2->animation_set : nullptr, gbs::LutaVisualState::Idle);
}

void set_luta_action_visual(bool player_one, gbs::LutaVisualState visual_state, const gbs::LutaStageData& stage) {
    const gbs::LutaCharacter* fighter = luta_stage_fighter(stage, player_one);
    gbs::LutaVisualStateData& state_for_fighter = player_one ? p1_visual_state : p2_visual_state;
    gbs::set_luta_visual_state(
        state_for_fighter,
        fighter != nullptr ? fighter->animation_set : nullptr,
        visual_state
    );
}

void tick_luta_animation_states(const gbs::LutaStageData& stage) {
    const gbs::LutaCharacter* p1 = luta_stage_fighter(stage, true);
    const gbs::LutaCharacter* p2 = luta_stage_fighter(stage, false);
    gbs::sync_luta_visual_state(
        p1_visual_state,
        state,
        true,
        p1 != nullptr ? p1->animation_set : nullptr
    );
    gbs::sync_luta_visual_state(
        p2_visual_state,
        state,
        false,
        p2 != nullptr ? p2->animation_set : nullptr
    );
    gbs::tick_luta_visual_state(
        p1_visual_state,
        p1 != nullptr ? p1->animation_set : nullptr
    );
    gbs::tick_luta_visual_state(
        p2_visual_state,
        p2 != nullptr ? p2->animation_set : nullptr
    );
}

void draw_luta() {
    const gbs::LutaStageData& stage = project.stages[stage_index];
    gbs::hide_all_sprites();
    const auto* layout = gbs::active_hud_layout();
    if (project.hud == nullptr && !(layout && layout->mode && layout->mode[0] == 'a')) {
        const uint16_t p1_hp_tiles = (state.p1_hp * 20) / 100;
        const uint16_t p2_hp_tiles = (state.p2_hp * 20) / 100;
        for (int x = 2; x < 22; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 1, 32, 32, 0);
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 18, 32, 32, 0);
        }
        for (int x = 2; x < 2 + p1_hp_tiles; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 1, 32, 32, 1);
        }
        for (int x = 20; x > 20 - p2_hp_tiles; --x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 18, 32, 32, 2);
        }

        gbs::set_bg_tile(gbs::BackgroundLayer::BG0, 14, 1, 32, 32, 3 + static_cast<int>(state.p1_ism_style));
        gbs::set_bg_tile(gbs::BackgroundLayer::BG0, 16, 18, 32, 32, 3 + static_cast<int>(state.p2_ism_style));

        const uint16_t p1_super_tiles = (state.p1_super_gauge * 10) / 100;
        const uint16_t p2_super_tiles = (state.p2_super_gauge * 10) / 100;
        for (int x = 2; x < 2 + p1_super_tiles; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 2, 32, 32, 6);
        }
        for (int x = 20; x > 20 - p2_super_tiles; --x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 17, 32, 32, 6);
        }

        gbs::set_bg_tile(gbs::BackgroundLayer::BG0, 14, 10, 32, 32, 8 + state.round);
        gbs::set_bg_tile(gbs::BackgroundLayer::BG0, 14, 12, 32, 32, 9 + state.round_timer / 10);
    }

    int sprite_index = 0;
    const gbs::LutaCharacter* p1_fighter = luta_stage_fighter(stage, true);
    const gbs::LutaCharacter* p2_fighter = luta_stage_fighter(stage, false);
    const gbs::MetaSprite* p1_metasprite = p1_fighter != nullptr
        ? gbs::luta_visual_metasprite_for(*p1_fighter, p1_visual_state)
        : nullptr;
    const gbs::MetaSprite* p2_metasprite = p2_fighter != nullptr
        ? gbs::luta_visual_metasprite_for(*p2_fighter, p2_visual_state)
        : nullptr;
    if (p1_metasprite && state.p1_hp > 0 && sprite_index < 128) {
        if (!gbs::sync_sprite_animation_tiles(p1_visual_state.animator, p1_streamed_tile_asset_loaded)) return;
        gbs::set_metasprite(sprite_index, *p1_metasprite, gbs::Vec2i { state.p1_x, state.p1_y });
        sprite_index += p1_metasprite->part_count;
    }
    if (p2_metasprite && state.p2_hp > 0 && sprite_index < 128) {
        if (!gbs::sync_sprite_animation_tiles(p2_visual_state.animator, p2_streamed_tile_asset_loaded)) return;
        gbs::set_metasprite(sprite_index, *p2_metasprite, gbs::Vec2i { state.p2_x, state.p2_y });
        sprite_index += p2_metasprite->part_count;
    }
    if (layout && layout->mode && layout->mode[0] == 'a') {
        gbs::HudState hud {};
        gbs::init_hud(hud);
        gbs::set_hud_text(hud, "", "");
        gbs::set_hud_value(hud,gbs::HudValueSource::P1Health,state.p1_hp,state.p1_max_hp);
        gbs::set_hud_value(hud,gbs::HudValueSource::P2Health,state.p2_hp,state.p2_max_hp);
        gbs::set_hud_value(hud,gbs::HudValueSource::RoundTime,state.round_timer / 60u);
        gbs::set_hud_value(hud,gbs::HudValueSource::P1Rounds,state.p1_wins);
        gbs::set_hud_value(hud,gbs::HudValueSource::P2Rounds,state.p2_wins);
        gbs::draw_hud(hud);
    } else {
        draw_luta_status_hud();
    }
}

bool persist_luta_runtime_state(int slot_index = 0) {
#if GBS_MULTI_RUNTIME
    // Runtime-local snapshots cannot overwrite a shared campaign checkpoint.
    (void)slot_index;
    return false;
#else
    if (!gbastudio_luta_project::save_enabled || slot_index < 0) {
        return false;
    }
    gbs::LutaSaveData save_data {};
    gbs::capture_luta_save_data(
        save_data,
        stage_index,
        state,
        event_state,
        gbs::frame_count()
    );
    ++luta_save_sequence;
    const gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "LUTA",
        gbs::frame_count(),
        luta_save_sequence,
        static_cast<uint16_t>(stage_index),
        static_cast<uint16_t>(state.round_state)
    );
    return gbs::write_save_slot_record(
        gbastudio_luta_project::save_bank,
        static_cast<size_t>(slot_index),
        &save_data,
        sizeof(save_data),
        metadata,
        luta_save_sequence
    ) == gbs::SaveStatus::Ok;
#endif
}

bool restore_luta_runtime_state(int slot_index) {
#if GBS_MULTI_RUNTIME
    return restore_luta_checkpoint(slot_index);
#else
    if (!gbastudio_luta_project::save_enabled) {
        return false;
    }
    if (slot_index < 0) {
        slot_index = gbs::find_latest_save_slot(gbastudio_luta_project::save_bank);
    }
    if (slot_index < 0) {
        return false;
    }
    gbs::LutaSaveData save_data {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_luta_project::save_bank,
        static_cast<size_t>(slot_index),
        &save_data,
        sizeof(save_data),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok || bytes_read != sizeof(save_data)) {
        return false;
    }
    if (!gbs::apply_luta_save_data(project, save_data, stage_index, state, event_state)) {
        return false;
    }
    luta_save_sequence = gbs::inspect_save_slot(
        gbastudio_luta_project::save_bank,
        static_cast<size_t>(slot_index)
    ).sequence;
    return true;
#endif
}

void update_luta_controls(const gbs::InputState& input) {
    const gbs::LutaStageData& stage = project.stages[stage_index];
    gbs::luta_p1_set_guard(state, input.is_held(gbs::ButtonDown));
    if (state.p1_guarding && p1_visual_state.state != gbs::LutaVisualState::Guard) {
        set_luta_action_visual(true, gbs::LutaVisualState::Guard, stage);
    } else if (p1_visual_state.state == gbs::LutaVisualState::Guard) {
        set_luta_action_visual(true, gbs::LutaVisualState::Idle, stage);
    }
    if (input.is_held(gbs::ButtonLeft)) {
        gbs::luta_p1_move(state, stage, -1);
    } else if (input.is_held(gbs::ButtonRight)) {
        gbs::luta_p1_move(state, stage, 1);
    }
    if (input.was_pressed(gbs::ButtonUp)) {
        gbs::luta_p1_jump(state, stage);
    }
    if (input.was_pressed(gbs::ButtonA)) {
        gbs::luta_p1_attack(state, stage, gbs::LutaAttackStrength::Light, gbs::LutaAttackType::Punch);
        set_luta_action_visual(true, gbs::LutaVisualState::Attack, stage);
    }
    if (input.was_pressed(gbs::ButtonB)) {
        gbs::luta_p1_attack(state, stage, gbs::LutaAttackStrength::Light, gbs::LutaAttackType::Kick);
        set_luta_action_visual(true, gbs::LutaVisualState::Attack, stage);
    }
    if (input.was_pressed(gbs::ButtonL)) {
        const uint16_t gauge_before = state.p1_super_gauge;
        gbs::luta_p1_super(state);
        if (state.p1_super_gauge != gauge_before) {
            set_luta_action_visual(true, gbs::LutaVisualState::Special, stage);
        }
    }
    if (input.was_pressed(gbs::ButtonR)) {
        const uint16_t gauge_before = state.p1_super_gauge;
        gbs::luta_p1_alpha_counter(state);
        if (state.p1_super_gauge != gauge_before) {
            set_luta_action_visual(true, gbs::LutaVisualState::Special, stage);
        }
    }
    if (input.was_pressed(gbs::ButtonStart)) {
        gbs::luta_pause(state);
    }
}

void update_luta_cpu() {
    if (state.round_state != gbs::LutaRoundState::InProgress || state.p2_hp == 0) return;
    if (luta_cpu_attack_wait_frames > 0) {
        --luta_cpu_attack_wait_frames;
    }
    const gbs::LutaStageData& stage = project.stages[stage_index];
    const int16_t distance = state.p1_x > state.p2_x
        ? static_cast<int16_t>(state.p1_x - state.p2_x)
        : static_cast<int16_t>(state.p2_x - state.p1_x);
    if (distance > 48) {
        gbs::luta_p2_move(state, stage, state.p2_x > state.p1_x ? -1 : 1);
        gbs::luta_p2_set_guard(state, false);
    } else if (luta_cpu_attack_wait_frames == 0) {
        gbs::luta_p2_set_guard(state, false);
        gbs::luta_p2_attack(state, stage, gbs::LutaAttackStrength::Light, gbs::LutaAttackType::Kick);
        set_luta_action_visual(false, gbs::LutaVisualState::Attack, stage);
        luta_cpu_attack_wait_frames = luta_cpu_attack_interval_frames;
    } else {
        gbs::luta_p2_set_guard(state, state.p1_hitstun > 0);
    }
}

#if !GBS_MULTI_RUNTIME
bool restart_standalone_luta_from_transition() {
    if (!gbs::consume_luta_runtime_transition(
            project,
            event_state,
            stage_index,
            state)) {
        return false;
    }
    gbs::init_dialogue(dialogue);
    gbs::init_event_runner(luta_event_runner);
    luta_event_wait_frames = 0;
    luta_cpu_attack_wait_frames = luta_cpu_initial_reaction_frames;
    luta_script_controls_dialogue = false;
    outcome_hook_started = false;
    outcome_hook_handled = false;
    gbastudio_dialogue_ui::configure_for_scene(project.stages[stage_index].id);
    apply_luta_visuals(project.stages[stage_index]);
    reset_luta_animation_states(project.stages[stage_index]);
    start_luta_event_script(project.stages[stage_index].on_enter);
    if (gbastudio_luta_project::save_autosave) {
        persist_luta_runtime_state();
    }
    return true;
}
#endif

} // namespace

int initialize_luta_runtime() {
    gbs::init();
    gbs::init_dialogue(dialogue);
    gbs::init_event_state(event_state);
    gbs::init_event_runner(luta_event_runner);
    gbs::init_resource_manager(resource_manager);
    gbs::reset_runtime_telemetry();
    gbs::set_backdrop_color(gbs::rgb15(2, 2, 7));

    if (!gbs::is_valid_luta_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    stage_index = project.initial_stage;
    int restore_slot_index = -1;
    bool restore_entry = false;
    bool runtime_entry = false;
#if GBS_MULTI_RUNTIME
    int entry_x = 0;
    int entry_y = 0;
    restore_entry = gbs::consume_runtime_save_restore(gbs::RuntimeKind::Luta, restore_slot_index);
    if (!restore_entry) {
        runtime_entry = gbs::consume_runtime_transition(
            gbs::RuntimeKind::Luta,
            event_state,
            stage_index,
            entry_x,
            entry_y
        );
    }
#endif
    if (stage_index < 0 || static_cast<size_t>(stage_index) >= project.stage_count) {
        stage_index = project.initial_stage;
    }
    state = gbs::make_luta_runtime_state(project.stages[stage_index]);
    luta_cpu_attack_wait_frames = luta_cpu_initial_reaction_frames;
    bool restored = false;
    if (restore_entry) {
        restored = restore_luta_runtime_state(restore_slot_index);
        if (!restored) {
            return -1;
        }
    }
#if !GBS_MULTI_RUNTIME
    if (!runtime_entry) {
        restored = restore_luta_runtime_state(-1);
    }
#endif
#if !GBS_MULTI_RUNTIME
    outcome_hook_started = restored && state.round_state != gbs::LutaRoundState::InProgress;
    outcome_hook_handled = outcome_hook_started;
#endif
    // UI skins reserve BG palette banks 14/15. Upload the authored arena/HUD
    // palette afterwards so those colors are not replaced by skin colors.
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(project.stages[stage_index].id);
    apply_luta_visuals(project.stages[stage_index]);
    reset_luta_animation_states(project.stages[stage_index]);
#if GBS_MULTI_RUNTIME
    if (restored) {
        if (checkpoint_music_index >= 0) gbs::play_music(project.music_assets[checkpoint_music_index]);
        if (checkpoint_tracker_index >= 0) gbs::play_tracker_music(project.tracker_assets[checkpoint_tracker_index]);
    }
#endif
    if (!restored) {
        const gbs::LutaStageData& stage = project.stages[stage_index];
        start_luta_event_script(stage.on_enter);
        if (gbastudio_luta_project::save_autosave) {
            persist_luta_runtime_state();
        }
    }
    return 0;
}

gbs::RuntimeAdapterFrameResult update_luta_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    gbastudio_dialogue_ui::configure_for_scene(project.stages[stage_index].id);
    const gbs::InputState input = gbs::begin_frame().input;
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
    gbs::update_hud_behavior(event_state, true);
    const bool script_active = update_luta_event_script(input);
    if (!script_active && !dialogue.visible && state.round_state == gbs::LutaRoundState::InProgress) {
        update_luta_controls(input);
        update_luta_cpu();
        gbs::tick_luta(state, project.stages[stage_index]);
    }
    tick_luta_animation_states(project.stages[stage_index]);

    if (state.round_state != gbs::LutaRoundState::InProgress && !outcome_hook_started) {
        outcome_hook_started = true;
        const gbs::EventScript outcome_script = gbs::luta_outcome_script(
            project.stages[stage_index],
            state.round_state
        );
        outcome_hook_handled = !start_luta_event_script(outcome_script);
        persist_luta_runtime_state();
    } else if (outcome_hook_started && !outcome_hook_handled &&
        !gbs::event_runner_is_active(luta_event_runner) &&
        !luta_script_controls_dialogue && luta_event_wait_frames == 0) {
        outcome_hook_handled = true;
    }

#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        return gbs::RuntimeAdapterFrameResult::Transition;
    }
#else
    if (gbs::runtime_transition_pending() &&
        !restart_standalone_luta_from_transition()) {
        return gbs::RuntimeAdapterFrameResult::Error;
    }
#endif

    return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_luta_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    draw_luta();
    sync_runtime_telemetry();
    gbs::draw_dialogue(dialogue);
    gbs::wait_vblank();
}

void leave_luta_runtime() {
    gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);
}

extern "C" void GBS_LUTA_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    luta_initialization_result = initialize_luta_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_LUTA_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    if (luta_initialization_result != 0) return gbs::RuntimeAdapterFrameResult::Error;
    return update_luta_runtime(context);
}

extern "C" void GBS_LUTA_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_luta_runtime(context);
}

extern "C" void GBS_LUTA_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_luta_runtime();
}

extern "C" int GBS_LUTA_RUNTIME_ENTRY() {
    luta_initialization_result = initialize_luta_runtime();
    if (luta_initialization_result != 0) {
        leave_luta_runtime();
        return luta_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::Luta,
            stage_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_luta_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_luta_runtime();
            return -1;
        }
        render_luta_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_luta_runtime();
            return 0;
        }
    }
}
