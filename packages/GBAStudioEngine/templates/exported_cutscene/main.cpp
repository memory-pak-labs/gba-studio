#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/cutscene.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_save_restore.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/save.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#ifndef GBS_CUTSCENE_PROJECT_DATA_HEADER
#define GBS_CUTSCENE_PROJECT_DATA_HEADER "cutscene_project_data.hpp"
#endif
#include GBS_CUTSCENE_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_CUTSCENE_RUNTIME_ENTRY
#define GBS_CUTSCENE_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_CUTSCENE_RUNTIME_ENTER
#define GBS_CUTSCENE_RUNTIME_ENTER gbs_enter_cutscene
#endif
#ifndef GBS_CUTSCENE_RUNTIME_UPDATE
#define GBS_CUTSCENE_RUNTIME_UPDATE gbs_update_cutscene
#endif
#ifndef GBS_CUTSCENE_RUNTIME_RENDER
#define GBS_CUTSCENE_RUNTIME_RENDER gbs_render_cutscene
#endif
#ifndef GBS_CUTSCENE_RUNTIME_LEAVE
#define GBS_CUTSCENE_RUNTIME_LEAVE gbs_leave_cutscene
#endif

#ifdef GBS_MULTI_RUNTIME
#include "mixed_project_data.hpp"
#endif

namespace {

const gbs::CutsceneProjectData& project = gbastudio_cutscene_project::project;

gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::CutsceneRuntimeState cutscene_state;
gbs::HudState hud;
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
uint32_t cutscene_save_sequence = 0;
int cutscene_initialization_result = -1;

// A full-screen BG and five independently paletted actors need 17 banks.
constexpr size_t max_resource_bank_reservations = 24;
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

void consume_event_state();
void show_current_step(bool reset_counter = true, bool run_script = true, bool prepare_visual = true);
void persist_cutscene_runtime_state();

#if GBS_MULTI_RUNTIME
bool restore_universal_cutscene_runtime_state(int slot_index) {
    gbs::RuntimeSaveService* service = gbs::active_runtime_save_service();
    if (service == nullptr) return false;
    gbs::UniversalSaveData data {};
    gbs::CutsceneRuntimeState restored {};
    if (gbs::read_runtime_save(*service, slot_index, data) != gbs::SaveStatus::Ok ||
        !gbs::read_universal_save_payload(data, gbs::UniversalSaveRuntime::Cutscene,
            &restored, sizeof(restored)) || data.room_index != restored.scene_index) return false;
    const auto* scene = gbs::cutscene_scene_for(project, restored.scene_index);
    if (scene == nullptr || gbs::cutscene_step_for(*scene, restored.step_index) == nullptr ||
        !gbs::restore_suspended_common_state(data, event_state)) return false;
    cutscene_state = restored;
    event_state.current_room = restored.scene_index;
    return true;
}

void consume_cutscene_save_request() {
    const int request = event_state.save_request;
    if (request == 0) return;
    const int slot_index = event_state.save_request_slot;
    event_state.save_request = 0;
    event_state.save_request_slot = -1;
    gbs::RuntimeSaveService* service = gbs::active_runtime_save_service();
    if (service == nullptr) return;
    if (request == 1) {
        gbs::UniversalSaveData data {};
        if (gbs::make_universal_save_data(data, gbs::UniversalSaveRuntime::Cutscene,
                cutscene_state.scene_index, 0, 0, 0, 0,
                event_state.variables, gbs::universal_save_variable_count,
                event_state.inventory, gbs::universal_save_inventory_count,
                event_state.equipped_items, gbs::universal_save_equipment_slot_count,
                gbs::frame_count(), 0, &cutscene_state, sizeof(cutscene_state),
                event_state.text_variables, gbs::text_variable_count)) {
            const auto metadata = gbs::make_save_metadata("CUTSCENE", gbs::frame_count(), 0,
                static_cast<uint16_t>(cutscene_state.scene_index),
                static_cast<uint16_t>(cutscene_state.step_index));
            gbs::write_runtime_save(*service, slot_index, data, metadata);
        }
    } else if (request == 2) {
        gbs::request_universal_save_restore(service->bank, slot_index,
            gbs::runtime_availability(gbs::RuntimeKind::Cutscene));
    } else if (request == 3) {
        gbs::clear_runtime_save(*service, slot_index);
    }
}
#endif

void refresh_hud() {
    gbs::hide_hud(hud);
}

void publish_runtime_telemetry() {
    volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
    runtime_telemetry.current_room = cutscene_state.scene_index;
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    runtime_telemetry.actor_count = scene != nullptr ? static_cast<uint32_t>(scene->actor_count) : 0;
    runtime_telemetry.first_actor_x = -1;
    runtime_telemetry.first_actor_y = -1;
    runtime_telemetry.first_actor_direction = -1;
    runtime_telemetry.first_actor_visible = 0;
    if (scene != nullptr && scene->actors != nullptr && scene->actor_count > 0) {
        const gbs::CutsceneActorData& actor = scene->actors[0];
        const gbs::CutsceneStepData* step = gbs::cutscene_step_for(*scene, cutscene_state.step_index);
        const gbs::Vec2i position = step != nullptr
            ? gbs::cutscene_actor_position_at(*scene, *step, 0, cutscene_state.frame_counter)
            : actor.position_pixels;
        runtime_telemetry.first_actor_x = position.x;
        runtime_telemetry.first_actor_y = position.y;
        runtime_telemetry.first_actor_visible = actor.metasprite != nullptr && gbs::is_valid_metasprite(*actor.metasprite) ? 1 : 0;
    }
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
    }
    gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
}

void stream_current_step_resource_group() {
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr || project.resource_bank_group_count == 0) {
        return;
    }

    const gbs::CutsceneStepData* step = gbs::cutscene_step_for(*scene, cutscene_state.step_index);
    const char* group_name = step != nullptr
        ? gbs::cutscene_step_resource_bank_group_name(*scene, *step)
        : scene->resource_bank_group_name;
    int group_index = gbs::find_cutscene_resource_bank_group_index(project, group_name);
    if (group_index < 0 && group_name != scene->resource_bank_group_name) {
        group_index = gbs::find_cutscene_resource_bank_group_index(project, scene->resource_bank_group_name);
    }
    if (group_index < 0) {
        return;
    }

    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_cutscene_project(
        project,
        static_cast<size_t>(group_index)
    );
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

void apply_background(const gbs::CutsceneSceneData& scene, int background_index = -1) {
    const int resolved_background_index = background_index >= 0 ? background_index : scene.background_index;
    if (!gbs::is_valid_cutscene_background_index(project, resolved_background_index) || resolved_background_index < 0) {
        return;
    }

    const gbs::CutsceneBackgroundData& background = project.backgrounds[resolved_background_index];
    gbs::set_backdrop_color(background.backdrop_color);
    // Keep the authored world behind a clean, transparent HUD/dialogue plane.
    for (int y = 0; y < 32; ++y) {
        for (int x = 0; x < 32; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, y, 32, 32, 0);
        }
    }
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    gbs::set_bg_priority(background.layer, 2);
    for (int layer = 1; layer < 4; ++layer) {
        const auto candidate = static_cast<gbs::BackgroundLayer>(layer);
        gbs::set_bg_enabled(candidate, candidate == background.layer);
    }
    if (resolved_background_index < static_cast<int>(project.bg_palette_count)) {
        gbs::load_palette(project.bg_palettes[resolved_background_index], false);
    }
    const bool streamed_assets_are_uploaded = project.resource_bank_upload_source_count > 0;
    if (!streamed_assets_are_uploaded) {
        for (size_t index = 0; index < project.obj_palette_count; ++index) {
            gbs::load_palette(project.obj_palettes[index], true);
        }
    }
    if (resolved_background_index < static_cast<int>(project.tile_asset_count)) {
        gbs::load_tiles(project.tile_assets[resolved_background_index]);
    }
    for (size_t index = 0; index < project.tile_asset_count; ++index) {
        if (project.tile_assets[index].object_tiles && !streamed_assets_are_uploaded) {
            gbs::load_tiles(project.tile_assets[index]);
        }
    }
    gbs::load_tilemap(background.layer, background.tilemap);
}

void draw_scene_actors() {
    gbs::hide_all_sprites();
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr || scene->actors == nullptr) {
        return;
    }

    constexpr int max_oam_sprites = 128;
    int sprite_index = 0;
    for (size_t actor_index = 0; actor_index < scene->actor_count; ++actor_index) {
        const gbs::CutsceneActorData& actor = scene->actors[actor_index];
        if (actor.metasprite == nullptr || !gbs::is_valid_metasprite(*actor.metasprite)) {
            continue;
        }
        if (sprite_index + actor.metasprite->part_count > max_oam_sprites) {
            break;
        }
        const gbs::CutsceneStepData* step = gbs::cutscene_step_for(*scene, cutscene_state.step_index);
        const gbs::Vec2i position = step != nullptr
            ? gbs::cutscene_actor_position_at(*scene, *step, actor_index, cutscene_state.frame_counter)
            : actor.position_pixels;
        gbs::set_metasprite(sprite_index, *actor.metasprite, position);
        sprite_index += actor.metasprite->part_count;
    }
}

void draw_dialogue_portrait() {
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

void apply_current_step_background() {
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr) {
        return;
    }
    const gbs::CutsceneStepData* step = gbs::cutscene_step_for(*scene, cutscene_state.step_index);
    apply_background(*scene, step != nullptr ? gbs::cutscene_step_background_index(*scene, *step) : -1);
}

void consume_event_state() {
    if (event_state.background_request_index >= 0) {
        const int index = event_state.background_request_index;
        event_state.background_request_index = -1;
        const auto* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
        if (scene != nullptr && index < static_cast<int>(project.background_count)) {
            char group_name[192];
            const char* background_name = project.backgrounds[index].name;
            size_t group_length = 0;
            const char* group_parts[] = { scene->resource_bank_group_name, "_background_", background_name };
            for (const char* part : group_parts) {
                if (part == nullptr) continue;
                while (*part != '\0' && group_length + 1 < sizeof(group_name)) group_name[group_length++] = *part++;
            }
            group_name[group_length] = '\0';
            const int group_index = gbs::find_cutscene_resource_bank_group_index(project, group_name);
            bool ready = project.resource_bank_group_count == 0;
            if (group_index >= 0) {
                const auto group = gbs::resource_bank_group_from_cutscene_project(project, static_cast<size_t>(group_index));
                ready = gbs::stream_resource_bank_group_with_uploads(resource_manager, active_resource_bank_group,
                    scratch_resource_bank_group, group, project.resource_bank_upload_sources, project.resource_bank_upload_source_count).success;
            }
            if (ready) { gbs::wait_vblank(); apply_background(*scene, index); }
        }
    }

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
    }
#if GBS_MULTI_RUNTIME
    consume_cutscene_save_request();
#endif
}

void start_step(int step_index) {
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr || gbs::cutscene_step_for(*scene, step_index) == nullptr) {
        return;
    }
    cutscene_state.step_index = step_index;
    show_current_step();
    refresh_hud();
}

void show_current_step(bool reset_counter, bool run_script, bool prepare_visual) {
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr) {
        return;
    }
    const gbs::CutsceneStepData* step = gbs::cutscene_step_for(*scene, cutscene_state.step_index);
    if (step == nullptr) {
        return;
    }
    if (reset_counter) {
        cutscene_state.frame_counter = 0;
    }
    if (prepare_visual) {
        stream_current_step_resource_group();
        apply_current_step_background();
    }
    if (run_script) {
        gbs::run_event_script(event_state, step->script);
        consume_event_state();
    }
    if (step->line_index >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, step->line_index);
    }
    refresh_hud();
}

void persist_cutscene_runtime_state() {
#if GBS_MULTI_RUNTIME
    // Mixed projects share universal campaign slots. Entering the opening or
    // advancing its frames must not replace a gameplay save with local data.
    return;
#else
    if (!gbastudio_cutscene_project::save_enabled) {
        return;
    }
    gbs::CutsceneSaveData save_data {};
    gbs::capture_cutscene_save_data(save_data, cutscene_state, event_state, gbs::frame_count());
    ++cutscene_save_sequence;
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "CUTSCENE",
        gbs::frame_count(),
        cutscene_save_sequence,
        static_cast<uint16_t>(cutscene_state.scene_index < 0 ? 0 : cutscene_state.scene_index),
        static_cast<uint16_t>(cutscene_state.step_index < 0 ? 0 : cutscene_state.step_index)
    );
    gbs::write_save_slot_record(
        gbastudio_cutscene_project::save_bank,
        0,
        &save_data,
        sizeof(save_data),
        metadata,
        cutscene_save_sequence
    );
#endif
}

bool restore_cutscene_runtime_state() {
    if (!gbastudio_cutscene_project::save_enabled) {
        return false;
    }
    int latest_slot = gbs::find_latest_save_slot(gbastudio_cutscene_project::save_bank);
    if (latest_slot < 0) {
        return false;
    }
    gbs::CutsceneSaveData save_data {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_cutscene_project::save_bank,
        static_cast<size_t>(latest_slot),
        &save_data,
        sizeof(save_data),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok ||
        (bytes_read != sizeof(save_data) && bytes_read != gbs::legacy_cutscene_save_size)) {
        return false;
    }
    if (!gbs::apply_cutscene_save_data(project, save_data, cutscene_state, event_state)) {
        return false;
    }
    gbs::SaveInfo info = gbs::inspect_save_slot(gbastudio_cutscene_project::save_bank, static_cast<size_t>(latest_slot));
    cutscene_save_sequence = info.sequence;
    return true;
}

void run_scene_exit() {
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr) {
        return;
    }
    gbs::run_event_script(event_state, scene->on_exit);
    consume_event_state();
}

void start_scene(int scene_index) {
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, scene_index);
    if (scene == nullptr) {
        return;
    }
    cutscene_state.scene_index = scene_index;
    cutscene_state.step_index = 0;
    cutscene_state.frame_counter = 0;
    stream_current_step_resource_group();
    apply_current_step_background();
    gbs::run_event_script(event_state, scene->on_enter);
    consume_event_state();
    show_current_step(true, true, false);
    refresh_hud();
    persist_cutscene_runtime_state();
}

bool advance_branch_if_needed(const gbs::CutsceneStepData& step) {
    if (gbs::cutscene_branch_is_empty(step.branch) ||
        !gbs::is_valid_event_variable(step.branch.variable_index) ||
        !gbs::cutscene_branch_matches(step.branch, event_state.variables[step.branch.variable_index])) {
        return false;
    }

    int target_scene = gbs::cutscene_branch_target_scene(project, step.branch);
    int target_step = gbs::cutscene_branch_target_step(project, step.branch);
    if (target_scene >= 0) {
        run_scene_exit();
        start_scene(target_scene);
        if (target_step >= 0) {
            start_step(target_step);
        }
        persist_cutscene_runtime_state();
        return true;
    }
    if (target_step >= 0) {
        start_step(target_step);
        persist_cutscene_runtime_state();
        return true;
    }
    return false;
}

void advance_step() {
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_requested()) return;
#endif
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr) {
        return;
    }
    const gbs::CutsceneStepData* step = gbs::cutscene_step_for(*scene, cutscene_state.step_index);
    if (step != nullptr && advance_branch_if_needed(*step)) {
        return;
    }
    if (step != nullptr && step->target_scene_index >= 0) {
        run_scene_exit();
        start_scene(step->target_scene_index);
        persist_cutscene_runtime_state();
        return;
    }

    const int next_step = gbs::cutscene_next_step_index(*scene, cutscene_state.step_index);
    if (gbs::cutscene_step_for(*scene, next_step) != nullptr) {
        cutscene_state.step_index = next_step;
        show_current_step();
        persist_cutscene_runtime_state();
        return;
    }

    if (scene->next_scene_index >= 0) {
        run_scene_exit();
        start_scene(scene->next_scene_index);
        persist_cutscene_runtime_state();
    }
}

void skip_step() {
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr) {
        return;
    }
    const gbs::CutsceneStepData* step = gbs::cutscene_step_for(*scene, cutscene_state.step_index);
    if (step == nullptr || !gbs::cutscene_step_is_skippable(*step)) {
        return;
    }
    gbs::run_event_script(event_state, step->on_skip);
    consume_event_state();
    advance_step();
    persist_cutscene_runtime_state();
}

void update_cutscene(gbs::InputState input) {
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_requested()) return;
#endif
    const gbs::CutsceneSceneData* scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
    if (scene == nullptr) {
        return;
    }
    const gbs::CutsceneStepData* step = gbs::cutscene_step_for(*scene, cutscene_state.step_index);
    if (step == nullptr) {
        return;
    }

    if (step->wait_for_dialogue && dialogue.visible) {
        if (input.was_pressed(gbs::ButtonA) || input.was_pressed(gbs::ButtonB) || input.was_pressed(gbs::ButtonStart)) {
            gbs::hide_dialogue(dialogue);
        }
        return;
    }

    if (input.was_pressed(gbs::ButtonA)) {
        advance_step();
        return;
    }
    if (input.was_pressed(gbs::ButtonB)) {
        skip_step();
        return;
    }
    if (input.was_pressed(gbs::ButtonStart)) {
        skip_step();
        return;
    }
    if (step->auto_advance && step->duration_frames > 0) {
        ++cutscene_state.frame_counter;
        if ((cutscene_state.frame_counter % 30) == 0) {
            refresh_hud();
            persist_cutscene_runtime_state();
        }
        if (cutscene_state.frame_counter >= step->duration_frames) {
            advance_step();
        }
    }
}

} // namespace

int initialize_cutscene_runtime() {
    gbs::init();
    gbs::init_dialogue(dialogue);
    gbs::init_hud(hud);
    gbs::init_event_state(event_state);
    gbs::init_resource_manager(resource_manager);
    gbs::set_backdrop_color(gbs::rgb15(2, 1, 6));

    if (!gbs::is_valid_cutscene_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    cutscene_state = gbs::cutscene_runtime_from_project(project);
#ifdef GBS_MULTI_RUNTIME
    int restore_slot_index = -1;
    if (gbs::consume_runtime_save_restore(gbs::RuntimeKind::Cutscene, restore_slot_index)) {
        if (!restore_universal_cutscene_runtime_state(restore_slot_index)) return -1;
        stream_current_step_resource_group();
        apply_current_step_background();
        show_current_step(false, false, false);
        refresh_hud();
    } else {
        int transition_scene = project.initial_scene;
        int transition_x = 0;
        int transition_y = 0;
        const bool resumed_from_transition = gbs::consume_runtime_transition(
            gbs::RuntimeKind::Cutscene,
            event_state,
            transition_scene,
            transition_x,
            transition_y
        );
        start_scene(resumed_from_transition ? transition_scene : project.initial_scene);
    }
#else
    if (restore_cutscene_runtime_state()) {
        const gbs::CutsceneSceneData* restored_scene = gbs::cutscene_scene_for(project, cutscene_state.scene_index);
        if (restored_scene != nullptr) {
            stream_current_step_resource_group();
            apply_current_step_background();
        }
        show_current_step(false, false);
        refresh_hud();
    } else {
        start_scene(project.initial_scene);
    }
#endif
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(gbs::cutscene_scene_name(project, cutscene_state.scene_index));
    gbs::configure_dialogue_portraits(
        gbastudio_cutscene_project::dialogue_portrait_assets,
        gbastudio_cutscene_project::dialogue_portrait_asset_count
    );

    return 0;
}

gbs::RuntimeAdapterFrameResult update_cutscene_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        gbastudio_dialogue_ui::configure_for_scene(gbs::cutscene_scene_name(project, cutscene_state.scene_index));
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
        update_cutscene(input);
#ifdef GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_pending()) {
            return gbs::RuntimeAdapterFrameResult::Transition;
        }
#endif
        return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_cutscene_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        publish_runtime_telemetry();
        refresh_hud();
        draw_scene_actors();
        gbs::draw_hud(hud);
        gbs::draw_dialogue(dialogue);
        /* Advanced HUD text uses OAM 96-127. Draw fixed dialogue portraits
         * after it so the HUD cleanup cannot hide the active portrait. */
        draw_dialogue_portrait();
        gbs::wait_vblank();
}

void leave_cutscene_runtime() {
    gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);
}

extern "C" void GBS_CUTSCENE_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    cutscene_initialization_result = initialize_cutscene_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_CUTSCENE_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_cutscene_runtime(context);
}

extern "C" void GBS_CUTSCENE_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_cutscene_runtime(context);
}

extern "C" void GBS_CUTSCENE_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_cutscene_runtime();
}

extern "C" int GBS_CUTSCENE_RUNTIME_ENTRY() {
    cutscene_initialization_result = initialize_cutscene_runtime();
    if (cutscene_initialization_result != 0) {
        leave_cutscene_runtime();
        return cutscene_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::Cutscene,
            cutscene_state.scene_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_cutscene_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_cutscene_runtime();
            return -1;
        }
        render_cutscene_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_cutscene_runtime();
            return 0;
        }
    }
}
