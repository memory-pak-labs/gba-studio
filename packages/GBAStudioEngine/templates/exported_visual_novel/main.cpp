#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/save.hpp"
#include "gbs/runtime_checkpoint.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#include "gbs/visual_novel.hpp"
#ifndef GBS_VISUAL_NOVEL_PROJECT_DATA_HEADER
#define GBS_VISUAL_NOVEL_PROJECT_DATA_HEADER "visual_novel_project_data.hpp"
#endif
#include GBS_VISUAL_NOVEL_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_VISUAL_NOVEL_RUNTIME_ENTRY
#define GBS_VISUAL_NOVEL_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_VISUAL_NOVEL_RUNTIME_ENTER
#define GBS_VISUAL_NOVEL_RUNTIME_ENTER gbs_enter_visual_novel
#endif
#ifndef GBS_VISUAL_NOVEL_RUNTIME_UPDATE
#define GBS_VISUAL_NOVEL_RUNTIME_UPDATE gbs_update_visual_novel
#endif
#ifndef GBS_VISUAL_NOVEL_RUNTIME_RENDER
#define GBS_VISUAL_NOVEL_RUNTIME_RENDER gbs_render_visual_novel
#endif
#ifndef GBS_VISUAL_NOVEL_RUNTIME_LEAVE
#define GBS_VISUAL_NOVEL_RUNTIME_LEAVE gbs_leave_visual_novel
#endif

#ifdef GBS_MULTI_RUNTIME
#include "mixed_project_data.hpp"
#endif

namespace {

const gbs::VisualNovelProjectData& project = gbastudio_visual_novel_project::project;

gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::HudState hud;
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
gbs::VisualNovelHistoryState history;
int current_scene_index = 0;
bool scene_started = false;
bool scene_content_pending = false;
bool pending_scene_advance = false;
bool pending_exit_done = false;
int pending_next_scene_index = -1;
uint32_t visual_novel_save_sequence = 0;
int visual_novel_initialization_result = -1;
char hud_left_buffer[16] = {};
char hud_right_buffer[16] = {};

constexpr size_t max_resource_bank_reservations = 16;
gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations] = {};
gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations] = {};
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

constexpr size_t max_runtime_choices = 6;
gbs::DialogueChoice runtime_choices[max_runtime_choices];
int runtime_choice_source_indices[max_runtime_choices];
size_t runtime_choice_count = 0;

#if GBS_MULTI_RUNTIME
int checkpoint_music_index = -1;
int checkpoint_tracker_index = -1;
gbs::EventRunner visual_novel_event_runner {};
int visual_novel_event_wait_frames = 0;
struct VisualNovelRuntimeCheckpoint {
    uint32_t version;
    int32_t history_lines[gbs::visual_novel_history_capacity];
    uint32_t history_count;
    gbs::CheckpointScript script;
    gbs::CheckpointDialogue dialogue;
    gbs::CheckpointEvents events;
    int32_t music_index;
    int32_t tracker_index;
    int32_t wait_frames;
    int32_t next_scene_index;
    bool content_pending;
    bool scene_advance;
    bool exit_done;
};
static_assert(sizeof(VisualNovelRuntimeCheckpoint) <= gbs::universal_save_payload_capacity);

gbs::EventScript checkpoint_script_for(int room, int script_index) {
    const auto* scene = gbs::visual_novel_scene_for(project, room);
    if (scene == nullptr) return gbs::empty_event_script();
    if (script_index == 0) return scene->on_enter;
    if (script_index == 1) return scene->on_exit;
    const auto* group = gbs::visual_novel_choice_group_for(project, scene->choice_group_index);
    if (group != nullptr && script_index >= 2 && static_cast<size_t>(script_index - 2) < group->choice_count)
        return gbs::visual_novel_choice_script(*group, script_index - 2);
    return gbs::empty_event_script();
}

int current_checkpoint_script_index() {
    if (!gbs::has_event_script(visual_novel_event_runner.script)) return -1;
    const auto* scene = gbs::visual_novel_scene_for(project, current_scene_index);
    const auto* group = gbs::visual_novel_choice_group_for(project, scene->choice_group_index);
    const int count = 2 + (group == nullptr ? 0 : static_cast<int>(group->choice_count));
    for (int index = 0; index < count; ++index) {
        const auto script = checkpoint_script_for(current_scene_index, index);
        if (script.commands == visual_novel_event_runner.script.commands &&
            script.command_count == visual_novel_event_runner.script.command_count) return index;
    }
    return -1;
}

bool capture_visual_novel_checkpoint(gbs::UniversalSaveData& data) {
    if (gbs::checkpoint_dialogue_is_feedback(dialogue)) return false;
    const int script_index = current_checkpoint_script_index();
    if (visual_novel_event_runner.active && script_index < 0) return false;
    VisualNovelRuntimeCheckpoint snapshot {};
    snapshot.version = 1;
    for (size_t index = 0; index < history.count; ++index) snapshot.history_lines[index] = history.line_indices[index];
    snapshot.history_count = static_cast<uint32_t>(history.count);
    snapshot.script = gbs::capture_checkpoint_script(visual_novel_event_runner, script_index);
    snapshot.dialogue = gbs::capture_checkpoint_dialogue(dialogue);
    snapshot.events = gbs::capture_checkpoint_events(event_state);
    snapshot.music_index = checkpoint_music_index;
    snapshot.tracker_index = checkpoint_tracker_index;
    snapshot.wait_frames = visual_novel_event_wait_frames;
    snapshot.next_scene_index = pending_next_scene_index;
    snapshot.content_pending = scene_content_pending;
    snapshot.scene_advance = pending_scene_advance;
    snapshot.exit_done = pending_exit_done;
    return gbs::capture_runtime_checkpoint(data, gbs::UniversalSaveRuntime::VisualNovel, current_scene_index,
        0, 0, event_state, &snapshot, sizeof(snapshot), gbs::frame_count());
}

void consume_visual_novel_checkpoint_request() {
    if (event_state.save_request == 0) return;
    gbs::UniversalSaveData data {};
    const bool captured = event_state.save_request != 1 || capture_visual_novel_checkpoint(data);
    const bool saving = event_state.save_request == 1;
    const auto status = gbs::consume_checkpoint_request(event_state, data, captured, "VISUAL NOVEL", gbs::RuntimeKind::VisualNovel);
    if (saving && status != gbs::SaveStatus::Ok) {
        gbs::show_checkpoint_save_failure(dialogue);
    }
}
#endif

void append_char(char*& cursor, const char* end, char value) {
    if (cursor < end) {
        *cursor = value;
        ++cursor;
        *cursor = '\0';
    }
}

void append_text(char*& cursor, const char* end, const char* text) {
    if (text == nullptr) {
        return;
    }
    while (*text != '\0' && cursor < end) {
        append_char(cursor, end, *text);
        ++text;
    }
}

void append_uint(char*& cursor, const char* end, uint16_t value) {
    char digits[6] = {};
    int count = 0;
    do {
        digits[count++] = static_cast<char>('0' + (value % 10));
        value = static_cast<uint16_t>(value / 10);
    } while (value > 0 && count < static_cast<int>(sizeof(digits)));
    while (count > 0) {
        append_char(cursor, end, digits[--count]);
    }
}

void refresh_hud() {
    char* left = hud_left_buffer;
    const char* left_end = hud_left_buffer + sizeof(hud_left_buffer) - 1;
    hud_left_buffer[0] = '\0';
    const char* scene_name = gbs::visual_novel_scene_name(project, current_scene_index);
    append_text(left, left_end, scene_name != nullptr ? scene_name : "SCENE");

    char* right = hud_right_buffer;
    const char* right_end = hud_right_buffer + sizeof(hud_right_buffer) - 1;
    hud_right_buffer[0] = '\0';
    append_char(right, right_end, 'S');
    append_uint(right, right_end, static_cast<uint16_t>(gbs::visual_novel_scene_number(project, current_scene_index)));
    append_char(right, right_end, ' ');
    append_char(right, right_end, 'H');
    append_uint(right, right_end, static_cast<uint16_t>(history.count));
    gbs::set_hud_text(hud, hud_left_buffer, hud_right_buffer);
}

void stream_scene_resource_group(const gbs::VisualNovelSceneData& scene) {
    if (project.resource_bank_group_count == 0) {
        return;
    }

    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_visual_novel_scene(project, scene);
    if (group.bank_count == 0) {
        return;
    }

    const gbs::ResourceStreamResult stream_result = gbs::stream_resource_bank_group_with_uploads(
        resource_manager,
        active_resource_bank_group,
        scratch_resource_bank_group,
        group,
        project.resource_bank_upload_sources,
        project.resource_bank_upload_source_count
    );
    if (stream_result.success && stream_result.uploaded_count > 0) {
        gbs::wait_vblank();
    }
}

void apply_background(const gbs::VisualNovelSceneData& scene) {
    if (!gbs::is_valid_visual_novel_background_index(project, scene.background_index) || scene.background_index < 0) {
        return;
    }

    const gbs::VisualNovelBackgroundData& background = project.backgrounds[scene.background_index];
    gbs::set_backdrop_color(background.backdrop_color);
    for (size_t index = 0; index < project.bg_palette_count; ++index) {
        gbs::load_palette(project.bg_palettes[index], false);
    }
    const bool streamed_assets_are_uploaded = project.resource_bank_upload_source_count > 0;
    for (size_t index = 0; index < project.tile_asset_count; ++index) {
        if (streamed_assets_are_uploaded && project.tile_assets[index].object_tiles) {
            continue;
        }
        gbs::load_tiles(project.tile_assets[index]);
    }
    gbs::load_tilemap(background.layer, background.tilemap);
}

void draw_dialogue_portrait() {
    gbs::hide_all_sprites();
    if (!gbs::dialogue_should_show_portrait(dialogue)) {
        return;
    }
    const gbs::MetaSprite* portrait = gbs::dialogue_portrait_metasprite(dialogue.portrait);
    if (portrait == nullptr || !gbs::is_valid_metasprite(*portrait)) {
        return;
    }
    gbs::set_metasprite(
        gbs::dialogue_portrait_oam_index,
        *portrait,
        gbs::dialogue_portrait_position_pixels(dialogue)
    );
}

void consume_event_state() {
    gbs::consume_scene_transition_visual_effect_event(event_state);
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        nullptr,
        0
    );
    if (event_state.last_dialogue >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, event_state.last_dialogue);
        gbs::visual_novel_push_history(history, event_state.last_dialogue);
        event_state.last_dialogue = -1;
        refresh_hud();
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
    if (event_state.close_dialogue) {
        gbs::hide_dialogue(dialogue);
        event_state.close_dialogue = false;
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
#if GBS_MULTI_RUNTIME
    if (event_state.wait_frames > 0) {
        visual_novel_event_wait_frames = event_state.wait_frames;
        event_state.wait_frames = 0;
    }
    consume_visual_novel_checkpoint_request();
#endif
}

void show_line(int line_index, bool record_history = true) {
    if (gbs::is_valid_visual_novel_dialogue_line_index(project, line_index) && line_index >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, line_index);
        if (record_history) {
            gbs::visual_novel_push_history(history, line_index);
        }
        refresh_hud();
    }
}

void persist_visual_novel_runtime_state() {
#if GBS_MULTI_RUNTIME
    // Local narrative snapshots cannot overwrite shared campaign slots.
    return;
#else
    if (!gbastudio_visual_novel_project::save_enabled) {
        return;
    }
    gbs::VisualNovelSaveData save_data {};
    gbs::capture_visual_novel_save_data(save_data, current_scene_index, history, event_state, gbs::frame_count());
    ++visual_novel_save_sequence;
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "VISUAL NOVEL",
        gbs::frame_count(),
        visual_novel_save_sequence,
        static_cast<uint16_t>(current_scene_index < 0 ? 0 : current_scene_index),
        0
    );
    gbs::write_save_slot_record(
        gbastudio_visual_novel_project::save_bank,
        0,
        &save_data,
        sizeof(save_data),
        metadata,
        visual_novel_save_sequence
    );
#endif
}

bool restore_visual_novel_runtime_state() {
    if (!gbastudio_visual_novel_project::save_enabled) {
        return false;
    }
    int latest_slot = gbs::find_latest_save_slot(gbastudio_visual_novel_project::save_bank);
    if (latest_slot < 0) {
        return false;
    }
    gbs::VisualNovelSaveData save_data {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_visual_novel_project::save_bank,
        static_cast<size_t>(latest_slot),
        &save_data,
        sizeof(save_data),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok || bytes_read != sizeof(save_data)) {
        return false;
    }
    if (!gbs::apply_visual_novel_save_data(project, save_data, current_scene_index, history, event_state)) {
        return false;
    }
    gbs::SaveInfo info = gbs::inspect_save_slot(gbastudio_visual_novel_project::save_bank, static_cast<size_t>(latest_slot));
    visual_novel_save_sequence = info.sequence;
    refresh_hud();
    return true;
}

bool show_choice_group(const gbs::VisualNovelChoiceGroupData& group) {
    runtime_choice_count = 0;
    for (size_t index = 0; index < group.choice_count && runtime_choice_count < max_runtime_choices; ++index) {
        const gbs::VisualNovelChoiceOptionData* option = gbs::visual_novel_choice_option_for(group, index);
        const bool available = gbs::visual_novel_choice_option_is_available(event_state, option);
        if (!available && option != nullptr && option->hide_when_unavailable) {
            continue;
        }

        runtime_choices[runtime_choice_count] = group.choices[index];
        if (option != nullptr) {
            runtime_choices[runtime_choice_count].script_index = static_cast<int>(index);
        }
        runtime_choice_source_indices[runtime_choice_count] = static_cast<int>(index);
        ++runtime_choice_count;
    }

    if (runtime_choice_count == 0) {
        show_line(group.line_index);
        return false;
    }

    gbs::show_dialogue_choices(
        dialogue,
        project.dialogue_lines,
        project.dialogue_line_count,
        group.line_index,
        runtime_choices,
        runtime_choice_count
    );
    gbs::visual_novel_push_history(history, group.line_index);
    refresh_hud();
    return true;
}

#if GBS_MULTI_RUNTIME
bool restore_visual_novel_checkpoint(int slot) {
    auto* service = gbs::active_runtime_save_service();
    gbs::UniversalSaveData data {};
    VisualNovelRuntimeCheckpoint snapshot {};
    if (service == nullptr || gbs::read_runtime_save(*service, slot, data) != gbs::SaveStatus::Ok ||
        !gbs::read_universal_save_payload(data, gbs::UniversalSaveRuntime::VisualNovel, &snapshot, sizeof(snapshot)) ||
        snapshot.version != 1 || !gbs::is_valid_visual_novel_scene_index(project, data.room_index) ||
        snapshot.history_count > gbs::visual_novel_history_capacity || snapshot.wait_frames < 0 ||
        (snapshot.next_scene_index != -1 && !gbs::is_valid_visual_novel_scene_index(project, snapshot.next_scene_index)) ||
        snapshot.music_index < -1 || snapshot.tracker_index < -1 ||
        (snapshot.music_index >= 0 && static_cast<size_t>(snapshot.music_index) >= project.music_asset_count) ||
        (snapshot.tracker_index >= 0 && static_cast<size_t>(snapshot.tracker_index) >= project.tracker_asset_count) ||
        !gbs::valid_checkpoint_dialogue(snapshot.dialogue, project.dialogue_line_count)) return false;
    for (size_t index = 0; index < snapshot.history_count; ++index)
        if (snapshot.history_lines[index] < 0 || static_cast<size_t>(snapshot.history_lines[index]) >= project.dialogue_line_count) return false;
    gbs::EventRunner restored_runner {};
    if (!gbs::restore_checkpoint_script(snapshot.script,
            checkpoint_script_for(data.room_index, snapshot.script.script_index), restored_runner) ||
        !gbs::restore_checkpoint_events(snapshot.events, event_state) ||
        !gbs::restore_suspended_common_state(data, event_state)) return false;
    current_scene_index = data.room_index;
    visual_novel_event_runner = restored_runner;
    visual_novel_event_wait_frames = snapshot.wait_frames;
    scene_started = true;
    scene_content_pending = snapshot.content_pending;
    pending_scene_advance = snapshot.scene_advance;
    pending_exit_done = snapshot.exit_done;
    pending_next_scene_index = snapshot.next_scene_index;
    checkpoint_music_index = snapshot.music_index;
    checkpoint_tracker_index = snapshot.tracker_index;
    if (snapshot.dialogue.visible && snapshot.dialogue.choice_mode) {
        const auto* scene = gbs::visual_novel_scene_for(project, current_scene_index);
        const auto* group = gbs::visual_novel_choice_group_for(project, scene->choice_group_index);
        if (group == nullptr || !show_choice_group(*group)) return false;
    }
    history = gbs::visual_novel_empty_history();
    history.count = snapshot.history_count;
    for (size_t index = 0; index < history.count; ++index) history.line_indices[index] = snapshot.history_lines[index];
    event_state.current_room = current_scene_index;
    event_state.player_x = data.player_x;
    event_state.player_y = data.player_y;
    return gbs::restore_checkpoint_dialogue(snapshot.dialogue, dialogue, project.dialogue_lines,
        project.dialogue_line_count, runtime_choices, runtime_choice_count);
}
#endif

void run_visual_novel_event_script(gbs::EventScript script) {
#if GBS_MULTI_RUNTIME
    gbs::start_event_runner(visual_novel_event_runner, script);
    visual_novel_event_wait_frames = 0;
    gbs::update_checkpoint_event_runner(visual_novel_event_runner, event_state);
#else
    gbs::run_event_script(event_state, script);
#endif
}

void show_scene_content_if_ready() {
    if (!scene_content_pending || dialogue.visible
#if GBS_MULTI_RUNTIME
        || gbs::event_runner_is_active(visual_novel_event_runner)
#endif
    ) {
        return;
    }
    const gbs::VisualNovelSceneData* scene = gbs::visual_novel_scene_for(project, current_scene_index);
    if (scene == nullptr) {
        scene_content_pending = false;
        return;
    }

    if (scene->choice_group_index >= 0) {
        const gbs::VisualNovelChoiceGroupData* group = gbs::visual_novel_choice_group_for(project, scene->choice_group_index);
        if (group != nullptr) {
            show_choice_group(*group);
        }
    } else if (scene->dialogue_line_index >= 0) {
        show_line(scene->dialogue_line_index);
    }
    scene_content_pending = false;
}

void start_scene(int scene_index) {
    const gbs::VisualNovelSceneData* scene = gbs::visual_novel_scene_for(project, scene_index);
    if (scene == nullptr) {
        return;
    }

    current_scene_index = scene_index;
    scene_content_pending = true;
    pending_scene_advance = false;
    pending_exit_done = false;
    pending_next_scene_index = -1;
    stream_scene_resource_group(*scene);
    apply_background(*scene);
    refresh_hud();
    scene_started = true;
    run_visual_novel_event_script(scene->on_enter);
    consume_event_state();
    show_scene_content_if_ready();
    scene_started = true;
}

void finish_scene_choice_if_needed(bool was_choice_mode) {
    if (!was_choice_mode || dialogue.visible) {
        return;
    }
    const gbs::VisualNovelSceneData* scene = gbs::visual_novel_scene_for(project, current_scene_index);
    if (scene == nullptr || scene->choice_group_index < 0) {
        return;
    }
    const gbs::VisualNovelChoiceGroupData* group = gbs::visual_novel_choice_group_for(project, scene->choice_group_index);
    if (group == nullptr) {
        return;
    }
    if (gbs::is_valid_event_variable(group->variable_index)) {
        event_state.variables[group->variable_index] = dialogue.last_choice_value;
    }

    size_t source_choice_index = static_cast<size_t>(dialogue.last_choice_index);
    if (group->options != nullptr && dialogue.last_choice_script >= 0) {
        source_choice_index = static_cast<size_t>(dialogue.last_choice_script);
    } else if (dialogue.last_choice_index >= 0 &&
        static_cast<size_t>(dialogue.last_choice_index) < runtime_choice_count) {
        source_choice_index = static_cast<size_t>(runtime_choice_source_indices[dialogue.last_choice_index]);
    }

    int next_scene = -1;
    if (group->options != nullptr && source_choice_index < group->choice_count) {
        next_scene = gbs::visual_novel_choice_next_scene_index(
            project,
            *group,
            source_choice_index,
            -1
        );
    } else if (gbs::is_valid_visual_novel_scene_index(project, dialogue.last_choice_script)) {
        next_scene = dialogue.last_choice_script;
    }
    if (next_scene >= 0) {
        pending_scene_advance = true;
        pending_next_scene_index = next_scene;

    }
    if (source_choice_index < group->choice_count) {
        const gbs::VisualNovelChoiceOptionData* option = gbs::visual_novel_choice_option_for(*group, source_choice_index);
        if (!gbs::visual_novel_choice_option_is_available(event_state, option)) {
            return;
        }
        run_visual_novel_event_script(gbs::visual_novel_choice_script(*group, source_choice_index));
        consume_event_state();
        refresh_hud();
    }

    if (next_scene >= 0) persist_visual_novel_runtime_state();
}

void advance_scene_if_ready() {
    const gbs::VisualNovelSceneData* scene = gbs::visual_novel_scene_for(project, current_scene_index);
    if (scene == nullptr || dialogue.visible
#if GBS_MULTI_RUNTIME
        || gbs::event_runner_is_active(visual_novel_event_runner)
#endif
    ) {
        return;
    }
    int next_scene = pending_scene_advance ? pending_next_scene_index : gbs::visual_novel_next_scene_index(project, *scene);
    if (next_scene < 0) {
        return;
    }
    if (!pending_exit_done) {
        pending_exit_done = true;
        run_visual_novel_event_script(scene->on_exit);
        consume_event_state();
        pending_exit_done = true;
        if (dialogue.visible) {
            pending_scene_advance = true;
            pending_next_scene_index = next_scene;
            return;
        }
    }
#if GBS_MULTI_RUNTIME
    if (gbs::event_runner_is_active(visual_novel_event_runner)) return;
#endif
    start_scene(next_scene);
    persist_visual_novel_runtime_state();
}

} // namespace

int initialize_visual_novel_runtime() {
    gbs::init();
    /* Visual novel scenes do not render room actors through this runtime;
     * the active dialogue portrait is the only OAM element used here. */
    gbs::hide_all_sprites();
    /* Visual novel scenes use the tilemap on BG1; unused optional layers
     * must stay disabled or their uninitialized maps leak through color-0
     * pixels of the authored background. */
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);
    gbs::init_dialogue(dialogue);
    gbs::init_event_state(event_state);
    gbs::init_hud(hud);
    gbs::init_resource_manager(resource_manager);
    gbs::set_backdrop_color(gbs::rgb15(1, 1, 6));

    if (!gbs::is_valid_visual_novel_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    history = gbs::visual_novel_empty_history();
    current_scene_index = project.initial_scene;
    refresh_hud();
#if GBS_MULTI_RUNTIME
    int restore_slot = -1;
    bool restored = false;
    if (gbs::consume_runtime_save_restore(gbs::RuntimeKind::VisualNovel, restore_slot)) {
        restored = restore_visual_novel_checkpoint(restore_slot);
        if (!restored) return -1;
    } else {
        int transition_x = 0;
        int transition_y = 0;
        gbs::consume_runtime_transition(gbs::RuntimeKind::VisualNovel, event_state,
            current_scene_index, transition_x, transition_y);
    }
    if (restored) {
        const auto& scene = project.scenes[current_scene_index];
        stream_scene_resource_group(scene);
        apply_background(scene);
        refresh_hud();
        if (checkpoint_music_index >= 0) gbs::play_music(project.music_assets[checkpoint_music_index]);
        if (checkpoint_tracker_index >= 0) gbs::play_tracker_music(project.tracker_assets[checkpoint_tracker_index]);
    } else start_scene(current_scene_index);
#else
    restore_visual_novel_runtime_state();
    start_scene(current_scene_index);
#endif
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(gbs::visual_novel_scene_name(project, current_scene_index));
    gbs::configure_dialogue_portraits(
        gbastudio_visual_novel_project::dialogue_portrait_assets,
        gbastudio_visual_novel_project::dialogue_portrait_asset_count
    );

    return 0;
}

gbs::RuntimeAdapterFrameResult update_visual_novel_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        gbastudio_dialogue_ui::configure_for_scene(gbs::visual_novel_scene_name(project, current_scene_index));
        const gbs::InputState input = gbs::begin_frame().input;
        gbs::set_event_input_state(event_state, input.held, input.pressed, input.released);
        gbs::update_hud_behavior(event_state, hud.visible);
        gbs::tick_event_frame_counter(event_state);
#if GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_requested()) {
            gbs::consume_scene_transition_visual_effect_event(event_state);
            return gbs::runtime_transition_pending()
                ? gbs::RuntimeAdapterFrameResult::Transition
                : gbs::RuntimeAdapterFrameResult::Continue;
        }
#endif
#if GBS_MULTI_RUNTIME
        if (!dialogue.visible && gbs::event_runner_is_active(visual_novel_event_runner)) {
            if (visual_novel_event_wait_frames > 0) --visual_novel_event_wait_frames;
            else {
                gbs::update_checkpoint_event_runner(visual_novel_event_runner, event_state);
                consume_event_state();
            }
            show_scene_content_if_ready();
        } else
#endif
        if (dialogue.visible) {
            bool was_choice_mode = dialogue.choice_mode;
            gbs::advance_dialogue(dialogue, input);
            finish_scene_choice_if_needed(was_choice_mode);
            show_scene_content_if_ready();
            if (!dialogue.visible) {
                advance_scene_if_ready();
            }
        } else if (input.was_pressed(gbs::ButtonB)) {
            show_line(gbs::visual_novel_previous_history_line(history), false);
        } else if (input.was_pressed(gbs::ButtonA)) {
            show_scene_content_if_ready();
            advance_scene_if_ready();
        } else if (scene_started && gbs::visual_novel_scene_for(project, current_scene_index)->auto_advance) {
            show_scene_content_if_ready();
            advance_scene_if_ready();
        }

#ifdef GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_pending()) {
            return gbs::RuntimeAdapterFrameResult::Transition;
        }
#endif

        return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_visual_novel_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        /* The scene title/history bar is runtime diagnostics, not authored
         * scene content. Keep the UI layer clear so a mixed-runtime handoff
         * cannot leak a HUD from the previous scene. */
        gbs::hide_hud(hud);
        gbs::draw_hud(hud);
        gbs::draw_dialogue(dialogue);
        /* Advanced HUD text uses OAM 96-127. Draw fixed dialogue portraits
         * after it so the HUD cleanup cannot hide the active portrait. */
        draw_dialogue_portrait();
        gbs::runtime_telemetry_block().current_room = current_scene_index;
        for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index)
            gbs::runtime_telemetry_block().variables[index] = event_state.variables[index];
        gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
        gbs::wait_vblank();
}

void leave_visual_novel_runtime() {
    gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);
}

extern "C" void GBS_VISUAL_NOVEL_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    visual_novel_initialization_result = initialize_visual_novel_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_VISUAL_NOVEL_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    if (visual_novel_initialization_result != 0) return gbs::RuntimeAdapterFrameResult::Error;
    return update_visual_novel_runtime(context);
}

extern "C" void GBS_VISUAL_NOVEL_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_visual_novel_runtime(context);
}

extern "C" void GBS_VISUAL_NOVEL_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_visual_novel_runtime();
}

extern "C" int GBS_VISUAL_NOVEL_RUNTIME_ENTRY() {
    visual_novel_initialization_result = initialize_visual_novel_runtime();
    if (visual_novel_initialization_result != 0) {
        leave_visual_novel_runtime();
        return visual_novel_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::VisualNovel,
            current_scene_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_visual_novel_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_visual_novel_runtime();
            return -1;
        }
        render_visual_novel_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_visual_novel_runtime();
            return 0;
        }
    }
}
