#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/audio.hpp"
#include "gbs/assets.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"

namespace gbs {

struct CutsceneBackgroundData {
    const char* name;
    BackgroundLayer layer;
    TileMapAsset tilemap;
    uint16_t backdrop_color;
};

struct CutsceneBranchData {
    int variable_index;
    int equals_value;
    int target_scene_index;
    int target_step_index;
};

constexpr CutsceneBranchData no_cutscene_branch() {
    return CutsceneBranchData { -1, 0, -1, -1 };
}

struct CutsceneActorMotionData {
    int actor_index;
    Vec2i from_position_pixels;
    Vec2i to_position_pixels;
    uint16_t duration_frames;
};

struct CutsceneStepData {
    int line_index;
    uint16_t duration_frames;
    EventScript script;
    int target_scene_index;
    bool auto_advance;
    bool skippable = true;
    EventScript on_skip = empty_event_script();
    CutsceneBranchData branch = no_cutscene_branch();
    bool wait_for_dialogue = false;
    int background_index = -1;
    const char* resource_bank_group_name = nullptr;
    const CutsceneActorMotionData* actor_motions = nullptr;
    size_t actor_motion_count = 0;
};

struct CutsceneActorData {
    const char* name;
    const MetaSprite* metasprite;
    Vec2i position_pixels;
};

struct CutsceneSceneData {
    const char* name;
    int background_index;
    const CutsceneStepData* steps;
    size_t step_count;
    int next_scene_index;
    EventScript on_enter;
    EventScript on_exit;
    const char* resource_bank_group_name;
    const CutsceneActorData* actors = nullptr;
    size_t actor_count = 0;
};

struct CutsceneProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const CutsceneBackgroundData* backgrounds;
    size_t background_count;
    const CutsceneSceneData* scenes;
    size_t scene_count;
    int initial_scene;
    const DialogueLine* dialogue_lines;
    size_t dialogue_line_count;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
    const SfxAsset* sfx_assets = nullptr;
    size_t sfx_asset_count = 0;
    const MusicAsset* music_assets = nullptr;
    size_t music_asset_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    const PaletteAsset* obj_palettes = nullptr;
    size_t obj_palette_count = 0;
    const DialoguePortraitEntry* dialogue_portrait_assets = nullptr;
    size_t dialogue_portrait_asset_count = 0;
    const ResourceBankUploadSource* resource_bank_upload_sources = nullptr;
    size_t resource_bank_upload_source_count = 0;
};

struct CutsceneRuntimeState {
    int scene_index;
    int step_index;
    uint16_t frame_counter;
};

struct CutsceneSaveData {
    uint16_t scene_index;
    uint16_t step_index;
    uint16_t frame_counter;
    int32_t variables[event_variable_count];
    uint32_t play_time_frames;
    uint16_t flags;
    uint16_t reserved = 0; // Preserve the legacy record padding before appended text.
    char text_variables[text_variable_count][text_variable_max_length + 1] {};
};

constexpr size_t legacy_cutscene_save_size = offsetof(CutsceneSaveData, text_variables);

constexpr bool is_valid_cutscene_scene_index(const CutsceneProjectData& project, int scene_index) {
    return project.scenes != nullptr &&
        scene_index >= 0 &&
        static_cast<size_t>(scene_index) < project.scene_count;
}

constexpr bool is_valid_cutscene_background_index(const CutsceneProjectData& project, int background_index) {
    return background_index < 0 ||
        (project.backgrounds != nullptr &&
            static_cast<size_t>(background_index) < project.background_count);
}

constexpr bool is_valid_cutscene_dialogue_line_index(const CutsceneProjectData& project, int line_index) {
    return line_index < 0 ||
        (project.dialogue_lines != nullptr &&
            static_cast<size_t>(line_index) < project.dialogue_line_count &&
            project.dialogue_lines[line_index].text != nullptr);
}

constexpr bool is_valid_cutscene_step_index(const CutsceneSceneData& scene, int step_index) {
    return step_index < 0 ||
        (scene.steps != nullptr &&
            static_cast<size_t>(step_index) < scene.step_count);
}

constexpr bool cutscene_branch_is_empty(const CutsceneBranchData& branch) {
    return branch.variable_index < 0 &&
        branch.target_scene_index < 0 &&
        branch.target_step_index < 0;
}

constexpr bool is_valid_cutscene_branch(
    const CutsceneProjectData& project,
    const CutsceneBranchData& branch
) {
    if (cutscene_branch_is_empty(branch)) {
        return true;
    }
    if (!is_valid_event_variable(branch.variable_index)) {
        return false;
    }
    if (branch.target_scene_index >= 0 && !is_valid_cutscene_scene_index(project, branch.target_scene_index)) {
        return false;
    }
    if (branch.target_step_index >= 0) {
        int scene_index = branch.target_scene_index >= 0 ? branch.target_scene_index : project.initial_scene;
        if (!is_valid_cutscene_scene_index(project, scene_index)) {
            return false;
        }
        return is_valid_cutscene_step_index(project.scenes[scene_index], branch.target_step_index);
    }
    return branch.target_scene_index >= 0;
}

constexpr bool is_valid_cutscene_step(const CutsceneProjectData& project, const CutsceneStepData& step) {
    return is_valid_cutscene_dialogue_line_index(project, step.line_index) &&
        is_valid_cutscene_background_index(project, step.background_index) &&
        (step.target_scene_index < 0 || is_valid_cutscene_scene_index(project, step.target_scene_index)) &&
        is_valid_cutscene_branch(project, step.branch);
}

constexpr bool is_valid_cutscene_actor(const CutsceneActorData& actor) {
    return actor.name != nullptr &&
        actor.metasprite != nullptr &&
        is_valid_metasprite(*actor.metasprite);
}

constexpr bool is_valid_cutscene_actor_motion(
    const CutsceneSceneData& scene,
    const CutsceneActorMotionData& motion
) {
    return scene.actors != nullptr &&
        motion.actor_index >= 0 &&
        static_cast<size_t>(motion.actor_index) < scene.actor_count &&
        motion.duration_frames > 0;
}

constexpr bool is_valid_cutscene_resource_banks(const CutsceneProjectData& project) {
    if (project.resource_bank_count == 0) {
        return true;
    }
    return project.resource_banks != nullptr;
}

constexpr bool is_valid_cutscene_resource_bank_groups(const CutsceneProjectData& project) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    return project.resource_bank_groups != nullptr;
}

constexpr const CutsceneSceneData* cutscene_scene_for(const CutsceneProjectData& project, int scene_index) {
    return is_valid_cutscene_scene_index(project, scene_index)
        ? &project.scenes[scene_index]
        : nullptr;
}

constexpr const char* cutscene_scene_name(const CutsceneProjectData& project, int scene_index) {
    const CutsceneSceneData* scene = cutscene_scene_for(project, scene_index);
    return scene != nullptr ? scene->name : nullptr;
}

constexpr int cutscene_scene_number(const CutsceneProjectData& project, int scene_index) {
    return is_valid_cutscene_scene_index(project, scene_index) ? scene_index + 1 : 0;
}

constexpr const CutsceneStepData* cutscene_step_for(const CutsceneSceneData& scene, int step_index) {
    return scene.steps != nullptr &&
            step_index >= 0 &&
            static_cast<size_t>(step_index) < scene.step_count
        ? &scene.steps[step_index]
        : nullptr;
}

constexpr int cutscene_actor_motion_position_component(
    int from,
    int to,
    uint16_t frame_counter,
    uint16_t duration_frames
) {
    if (frame_counter >= duration_frames) {
        return to;
    }
    const int64_t delta = static_cast<int64_t>(to) - static_cast<int64_t>(from);
    return from + static_cast<int>((delta * frame_counter) / duration_frames);
}

constexpr Vec2i cutscene_actor_position_at(
    const CutsceneSceneData& scene,
    const CutsceneStepData& step,
    size_t actor_index,
    uint16_t frame_counter
) {
    if (scene.actors == nullptr || actor_index >= scene.actor_count) {
        return Vec2i { 0, 0 };
    }
    for (size_t motion_index = 0; motion_index < step.actor_motion_count; ++motion_index) {
        const CutsceneActorMotionData& motion = step.actor_motions[motion_index];
        if (motion.actor_index != static_cast<int>(actor_index) || motion.duration_frames == 0) {
            continue;
        }
        return Vec2i {
            cutscene_actor_motion_position_component(
                motion.from_position_pixels.x,
                motion.to_position_pixels.x,
                frame_counter,
                motion.duration_frames
            ),
            cutscene_actor_motion_position_component(
                motion.from_position_pixels.y,
                motion.to_position_pixels.y,
                frame_counter,
                motion.duration_frames
            )
        };
    }
    return scene.actors[actor_index].position_pixels;
}

constexpr bool is_valid_cutscene_runtime_step_index(
    const CutsceneProjectData& project,
    int scene_index,
    int step_index
) {
    const CutsceneSceneData* scene = cutscene_scene_for(project, scene_index);
    return scene != nullptr && cutscene_step_for(*scene, step_index) != nullptr;
}

constexpr CutsceneRuntimeState cutscene_runtime_from_project(const CutsceneProjectData& project) {
    return CutsceneRuntimeState { project.initial_scene, 0, 0 };
}

constexpr bool cutscene_step_is_skippable(const CutsceneStepData& step) {
    return step.skippable;
}

constexpr bool cutscene_step_waits_for_dialogue(const CutsceneStepData& step) {
    return step.wait_for_dialogue;
}

constexpr bool cutscene_branch_matches(const CutsceneBranchData& branch, int variable_value) {
    return !cutscene_branch_is_empty(branch) && variable_value == branch.equals_value;
}

constexpr int cutscene_branch_target_scene(
    const CutsceneProjectData& project,
    const CutsceneBranchData& branch
) {
    if (!is_valid_cutscene_branch(project, branch)) {
        return -1;
    }
    return branch.target_scene_index;
}

constexpr int cutscene_branch_target_step(
    const CutsceneProjectData& project,
    const CutsceneBranchData& branch
) {
    return is_valid_cutscene_branch(project, branch) ? branch.target_step_index : -1;
}

constexpr int cutscene_next_step_index(const CutsceneSceneData& scene, int step_index) {
    int next_step = step_index + 1;
    return is_valid_cutscene_step_index(scene, next_step) ? next_step : -1;
}

constexpr int cutscene_step_background_index(const CutsceneSceneData& scene, const CutsceneStepData& step) {
    return step.background_index >= 0 ? step.background_index : scene.background_index;
}

constexpr const char* cutscene_step_resource_bank_group_name(
    const CutsceneSceneData& scene,
    const CutsceneStepData& step
) {
    return step.resource_bank_group_name != nullptr && step.resource_bank_group_name[0] != '\0'
        ? step.resource_bank_group_name
        : scene.resource_bank_group_name;
}

constexpr EventScript cutscene_scene_enter_script(const CutsceneProjectData& project, int scene_index) {
    const CutsceneSceneData* scene = cutscene_scene_for(project, scene_index);
    return scene != nullptr ? scene->on_enter : empty_event_script();
}

constexpr EventScript cutscene_scene_exit_script(const CutsceneProjectData& project, int scene_index) {
    const CutsceneSceneData* scene = cutscene_scene_for(project, scene_index);
    return scene != nullptr ? scene->on_exit : empty_event_script();
}

constexpr bool is_valid_cutscene_save_data(
    const CutsceneProjectData& project,
    const CutsceneSaveData& save_data
) {
    return is_valid_cutscene_runtime_step_index(project, save_data.scene_index, save_data.step_index);
}

inline void capture_cutscene_save_data(
    CutsceneSaveData& save_data,
    const CutsceneRuntimeState& cutscene_state,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    save_data.scene_index = static_cast<uint16_t>(cutscene_state.scene_index < 0 ? 0 : cutscene_state.scene_index);
    save_data.step_index = static_cast<uint16_t>(cutscene_state.step_index < 0 ? 0 : cutscene_state.step_index);
    save_data.frame_counter = cutscene_state.frame_counter;
    for (size_t index = 0; index < event_variable_count; ++index) {
        save_data.variables[index] = event_state.variables[index];
    }
    for (size_t variable = 0; variable < text_variable_count; ++variable) {
        for (size_t character = 0; character < text_variable_max_length; ++character) {
            save_data.text_variables[variable][character] = event_state.text_variables[variable][character];
        }
        save_data.text_variables[variable][text_variable_max_length] = '\0';
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
}

inline bool apply_cutscene_save_data(
    const CutsceneProjectData& project,
    const CutsceneSaveData& save_data,
    CutsceneRuntimeState& cutscene_state,
    EventState& event_state
) {
    if (!is_valid_cutscene_save_data(project, save_data)) {
        return false;
    }
    cutscene_state.scene_index = save_data.scene_index;
    cutscene_state.step_index = save_data.step_index;
    cutscene_state.frame_counter = save_data.frame_counter;
    for (size_t index = 0; index < event_variable_count; ++index) {
        event_state.variables[index] = save_data.variables[index];
    }
    for (size_t variable = 0; variable < text_variable_count; ++variable) {
        for (size_t character = 0; character < text_variable_max_length; ++character) {
            event_state.text_variables[variable][character] = save_data.text_variables[variable][character];
        }
        event_state.text_variables[variable][text_variable_max_length] = '\0';
    }
    return true;
}

constexpr ResourceBankBatch resource_bank_batch_from_cutscene_project(const CutsceneProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_cutscene_project(
    const CutsceneProjectData& project,
    size_t group_index
) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_cutscene_resource_bank_group_index(const CutsceneProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr int find_cutscene_scene_resource_bank_group_index(
    const CutsceneProjectData& project,
    const CutsceneSceneData& scene
) {
    return find_cutscene_resource_bank_group_index(project, scene.resource_bank_group_name);
}

constexpr ResourceBankGroup resource_bank_group_from_cutscene_scene(
    const CutsceneProjectData& project,
    const CutsceneSceneData& scene
) {
    int index = find_cutscene_scene_resource_bank_group_index(project, scene);
    return index >= 0
        ? resource_bank_group_from_cutscene_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr bool is_valid_cutscene_project_data(const CutsceneProjectData& project) {
    if (project.scenes == nullptr ||
        project.scene_count == 0 ||
        !is_valid_cutscene_scene_index(project, project.initial_scene) ||
        !is_valid_cutscene_resource_banks(project) ||
        !is_valid_cutscene_resource_bank_groups(project)) {
        return false;
    }
    if (project.background_count > 0 && project.backgrounds == nullptr) {
        return false;
    }
    if (project.dialogue_line_count > 0 && project.dialogue_lines == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.background_count; ++index) {
        if (!is_valid_tilemap_asset(project.backgrounds[index].tilemap)) {
            return false;
        }
    }
    for (size_t index = 0; index < project.scene_count; ++index) {
        const CutsceneSceneData& scene = project.scenes[index];
        if (!is_valid_cutscene_background_index(project, scene.background_index) ||
            (scene.next_scene_index >= 0 && !is_valid_cutscene_scene_index(project, scene.next_scene_index)) ||
            scene.step_count == 0 ||
            scene.steps == nullptr ||
            (scene.actor_count > 0 && scene.actors == nullptr)) {
            return false;
        }
        for (size_t actor_index = 0; actor_index < scene.actor_count; ++actor_index) {
            if (!is_valid_cutscene_actor(scene.actors[actor_index])) {
                return false;
            }
        }
        for (size_t step_index = 0; step_index < scene.step_count; ++step_index) {
            const CutsceneStepData& step = scene.steps[step_index];
            if (!is_valid_cutscene_step(project, step) ||
                (step.actor_motion_count > 0 && step.actor_motions == nullptr)) {
                return false;
            }
            for (size_t motion_index = 0; motion_index < step.actor_motion_count; ++motion_index) {
                if (!is_valid_cutscene_actor_motion(scene, step.actor_motions[motion_index])) {
                    return false;
                }
            }
        }
    }
    return true;
}

} // namespace gbs
