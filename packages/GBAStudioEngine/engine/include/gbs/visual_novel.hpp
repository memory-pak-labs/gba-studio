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

struct VisualNovelBackgroundData {
    const char* name;
    BackgroundLayer layer;
    TileMapAsset tilemap;
    uint16_t backdrop_color;
};

struct VisualNovelChoiceOptionData {
    int required_variable_index;
    int required_value;
    bool hide_when_unavailable;
    int next_scene_index;
    EventScript on_select;
};

struct VisualNovelChoiceGroupData {
    int line_index;
    const DialogueChoice* choices;
    size_t choice_count;
    int variable_index;
    const VisualNovelChoiceOptionData* options = nullptr;
};

struct VisualNovelSceneData {
    const char* name;
    int background_index;
    int dialogue_line_index;
    int choice_group_index;
    int next_scene_index;
    EventScript on_enter;
    EventScript on_exit;
    bool auto_advance;
    const char* resource_bank_group_name;
};

struct VisualNovelProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const VisualNovelBackgroundData* backgrounds;
    size_t background_count;
    const VisualNovelSceneData* scenes;
    size_t scene_count;
    int initial_scene;
    const DialogueLine* dialogue_lines;
    size_t dialogue_line_count;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
    const VisualNovelChoiceGroupData* choice_groups = nullptr;
    size_t choice_group_count = 0;
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
    const ResourceBankUploadSource* resource_bank_upload_sources = nullptr;
    size_t resource_bank_upload_source_count = 0;
};

constexpr size_t visual_novel_history_capacity = 8;

struct VisualNovelHistoryState {
    int line_indices[visual_novel_history_capacity];
    size_t count;
};

struct VisualNovelSaveData {
    uint16_t scene_index;
    uint8_t history_count;
    int16_t last_line_index;
    int16_t previous_line_index;
    int16_t history_line_indices[visual_novel_history_capacity];
    int32_t variables[event_variable_count];
    uint32_t play_time_frames;
    uint16_t flags;
};

constexpr VisualNovelHistoryState visual_novel_empty_history() {
    return VisualNovelHistoryState { { -1, -1, -1, -1, -1, -1, -1, -1 }, 0 };
}

constexpr void visual_novel_push_history(VisualNovelHistoryState& history, int line_index) {
    if (line_index < 0) {
        return;
    }
    if (history.count < visual_novel_history_capacity) {
        history.line_indices[history.count] = line_index;
        ++history.count;
        return;
    }
    for (size_t index = 1; index < visual_novel_history_capacity; ++index) {
        history.line_indices[index - 1] = history.line_indices[index];
    }
    history.line_indices[visual_novel_history_capacity - 1] = line_index;
}

constexpr int visual_novel_previous_history_line(const VisualNovelHistoryState& history) {
    return history.count >= 2 ? history.line_indices[history.count - 2] : -1;
}

constexpr int visual_novel_last_history_line(const VisualNovelHistoryState& history) {
    return history.count >= 1 ? history.line_indices[history.count - 1] : -1;
}

constexpr bool is_valid_visual_novel_scene_index(const VisualNovelProjectData& project, int scene_index) {
    return project.scenes != nullptr &&
        scene_index >= 0 &&
        static_cast<size_t>(scene_index) < project.scene_count;
}

constexpr bool is_valid_visual_novel_background_index(const VisualNovelProjectData& project, int background_index) {
    return background_index < 0 ||
        (project.backgrounds != nullptr &&
            static_cast<size_t>(background_index) < project.background_count);
}

constexpr bool is_valid_visual_novel_dialogue_line_index(const VisualNovelProjectData& project, int line_index) {
    return line_index < 0 ||
        (project.dialogue_lines != nullptr &&
            static_cast<size_t>(line_index) < project.dialogue_line_count &&
            project.dialogue_lines[line_index].text != nullptr);
}

constexpr bool is_valid_visual_novel_choice_group_index(const VisualNovelProjectData& project, int choice_group_index) {
    return choice_group_index < 0 ||
        (project.choice_groups != nullptr &&
            static_cast<size_t>(choice_group_index) < project.choice_group_count);
}

constexpr bool is_valid_visual_novel_choice_option(
    const VisualNovelProjectData& project,
    const VisualNovelChoiceOptionData& option
) {
    return (option.required_variable_index < 0 || is_valid_event_variable(option.required_variable_index)) &&
        (option.next_scene_index < 0 || is_valid_visual_novel_scene_index(project, option.next_scene_index));
}

constexpr bool is_valid_visual_novel_resource_banks(const VisualNovelProjectData& project) {
    if (project.resource_bank_count == 0) {
        return true;
    }
    return project.resource_banks != nullptr;
}

constexpr bool is_valid_visual_novel_resource_bank_groups(const VisualNovelProjectData& project) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    return project.resource_bank_groups != nullptr;
}

constexpr const VisualNovelChoiceOptionData* visual_novel_choice_option_for(
    const VisualNovelChoiceGroupData& group,
    size_t choice_index
) {
    return group.options != nullptr && choice_index < group.choice_count
        ? &group.options[choice_index]
        : nullptr;
}

constexpr bool visual_novel_choice_option_is_available(
    const EventState& state,
    const VisualNovelChoiceOptionData* option
) {
    return option == nullptr ||
        option->required_variable_index < 0 ||
        state.variables[option->required_variable_index] == option->required_value;
}

constexpr int visual_novel_choice_next_scene_index(
    const VisualNovelProjectData& project,
    const VisualNovelChoiceGroupData& group,
    size_t choice_index,
    int fallback_scene_index
) {
    const VisualNovelChoiceOptionData* option = visual_novel_choice_option_for(group, choice_index);
    if (option != nullptr && is_valid_visual_novel_scene_index(project, option->next_scene_index)) {
        return option->next_scene_index;
    }
    return is_valid_visual_novel_scene_index(project, fallback_scene_index)
        ? fallback_scene_index
        : -1;
}

constexpr EventScript visual_novel_choice_script(
    const VisualNovelChoiceGroupData& group,
    size_t choice_index
) {
    const VisualNovelChoiceOptionData* option = visual_novel_choice_option_for(group, choice_index);
    return option != nullptr ? option->on_select : empty_event_script();
}

constexpr const VisualNovelSceneData* visual_novel_scene_for(const VisualNovelProjectData& project, int scene_index) {
    return is_valid_visual_novel_scene_index(project, scene_index)
        ? &project.scenes[scene_index]
        : nullptr;
}

constexpr const char* visual_novel_scene_name(
    const VisualNovelProjectData& project,
    int scene_index
) {
    const VisualNovelSceneData* scene = visual_novel_scene_for(project, scene_index);
    return scene != nullptr ? scene->name : nullptr;
}

constexpr int visual_novel_scene_number(
    const VisualNovelProjectData& project,
    int scene_index
) {
    return is_valid_visual_novel_scene_index(project, scene_index) ? scene_index + 1 : 0;
}

constexpr const VisualNovelChoiceGroupData* visual_novel_choice_group_for(
    const VisualNovelProjectData& project,
    int choice_group_index
) {
    return is_valid_visual_novel_choice_group_index(project, choice_group_index)
        ? &project.choice_groups[choice_group_index]
        : nullptr;
}

constexpr int visual_novel_next_scene_index(const VisualNovelProjectData& project, const VisualNovelSceneData& scene) {
    return is_valid_visual_novel_scene_index(project, scene.next_scene_index)
        ? scene.next_scene_index
        : -1;
}

constexpr EventScript visual_novel_scene_enter_script(const VisualNovelProjectData& project, int scene_index) {
    const VisualNovelSceneData* scene = visual_novel_scene_for(project, scene_index);
    return scene != nullptr ? scene->on_enter : empty_event_script();
}

constexpr EventScript visual_novel_scene_exit_script(const VisualNovelProjectData& project, int scene_index) {
    const VisualNovelSceneData* scene = visual_novel_scene_for(project, scene_index);
    return scene != nullptr ? scene->on_exit : empty_event_script();
}

constexpr bool is_valid_visual_novel_history_state(
    const VisualNovelProjectData& project,
    const VisualNovelHistoryState& history
) {
    if (history.count > visual_novel_history_capacity) {
        return false;
    }
    for (size_t index = 0; index < history.count; ++index) {
        if (!is_valid_visual_novel_dialogue_line_index(project, history.line_indices[index])) {
            return false;
        }
    }
    return true;
}

constexpr bool is_valid_visual_novel_save_data(
    const VisualNovelProjectData& project,
    const VisualNovelSaveData& save_data
) {
    if (!is_valid_visual_novel_scene_index(project, save_data.scene_index) ||
        save_data.history_count > visual_novel_history_capacity ||
        !is_valid_visual_novel_dialogue_line_index(project, save_data.last_line_index) ||
        !is_valid_visual_novel_dialogue_line_index(project, save_data.previous_line_index)) {
        return false;
    }
    for (size_t index = 0; index < save_data.history_count; ++index) {
        if (!is_valid_visual_novel_dialogue_line_index(project, save_data.history_line_indices[index])) {
            return false;
        }
    }
    return true;
}

inline void capture_visual_novel_save_data(
    VisualNovelSaveData& save_data,
    int scene_index,
    const VisualNovelHistoryState& history,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    save_data.scene_index = static_cast<uint16_t>(scene_index < 0 ? 0 : scene_index);
    save_data.history_count = static_cast<uint8_t>(
        history.count < visual_novel_history_capacity ? history.count : visual_novel_history_capacity
    );
    save_data.last_line_index = static_cast<int16_t>(visual_novel_last_history_line(history));
    save_data.previous_line_index = static_cast<int16_t>(visual_novel_previous_history_line(history));
    for (size_t index = 0; index < visual_novel_history_capacity; ++index) {
        save_data.history_line_indices[index] = static_cast<int16_t>(
            index < save_data.history_count ? history.line_indices[index] : -1
        );
    }
    for (size_t index = 0; index < event_variable_count; ++index) {
        save_data.variables[index] = event_state.variables[index];
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
}

inline bool apply_visual_novel_save_data(
    const VisualNovelProjectData& project,
    const VisualNovelSaveData& save_data,
    int& scene_index,
    VisualNovelHistoryState& history,
    EventState& event_state
) {
    if (!is_valid_visual_novel_save_data(project, save_data)) {
        return false;
    }
    scene_index = save_data.scene_index;
    history = visual_novel_empty_history();
    history.count = save_data.history_count;
    for (size_t index = 0; index < visual_novel_history_capacity; ++index) {
        history.line_indices[index] = index < history.count ? save_data.history_line_indices[index] : -1;
    }
    for (size_t index = 0; index < event_variable_count; ++index) {
        event_state.variables[index] = save_data.variables[index];
    }
    return true;
}

constexpr ResourceBankBatch resource_bank_batch_from_visual_novel_project(const VisualNovelProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_visual_novel_project(
    const VisualNovelProjectData& project,
    size_t group_index
) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_visual_novel_resource_bank_group_index(const VisualNovelProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr ResourceBankGroup resource_bank_group_from_visual_novel_project(
    const VisualNovelProjectData& project,
    const char* name
) {
    int index = find_visual_novel_resource_bank_group_index(project, name);
    return index >= 0
        ? resource_bank_group_from_visual_novel_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr int find_visual_novel_scene_resource_bank_group_index(
    const VisualNovelProjectData& project,
    const VisualNovelSceneData& scene
) {
    return find_visual_novel_resource_bank_group_index(project, scene.resource_bank_group_name);
}

constexpr ResourceBankGroup resource_bank_group_from_visual_novel_scene(
    const VisualNovelProjectData& project,
    const VisualNovelSceneData& scene
) {
    int index = find_visual_novel_scene_resource_bank_group_index(project, scene);
    return index >= 0
        ? resource_bank_group_from_visual_novel_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr bool is_valid_visual_novel_project_data(const VisualNovelProjectData& project) {
    if (project.scenes == nullptr ||
        project.scene_count == 0 ||
        !is_valid_visual_novel_scene_index(project, project.initial_scene) ||
        !is_valid_visual_novel_resource_banks(project) ||
        !is_valid_visual_novel_resource_bank_groups(project)) {
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
        const VisualNovelSceneData& scene = project.scenes[index];
        if (!is_valid_visual_novel_background_index(project, scene.background_index) ||
            !is_valid_visual_novel_dialogue_line_index(project, scene.dialogue_line_index) ||
            !is_valid_visual_novel_choice_group_index(project, scene.choice_group_index) ||
            (scene.next_scene_index >= 0 && !is_valid_visual_novel_scene_index(project, scene.next_scene_index))) {
            return false;
        }
    }
    for (size_t index = 0; index < project.choice_group_count; ++index) {
        const VisualNovelChoiceGroupData& group = project.choice_groups[index];
        if (!is_valid_visual_novel_dialogue_line_index(project, group.line_index) ||
            group.choices == nullptr ||
            group.choice_count == 0 ||
            (group.variable_index >= 0 && !is_valid_event_variable(group.variable_index))) {
            return false;
        }
        if (group.options != nullptr) {
            for (size_t choice_index = 0; choice_index < group.choice_count; ++choice_index) {
                if (!is_valid_visual_novel_choice_option(project, group.options[choice_index])) {
                    return false;
                }
            }
        }
    }
    return true;
}

} // namespace gbs
