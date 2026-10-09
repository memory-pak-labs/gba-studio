#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/audio.hpp"
#include "gbs/assets.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/types.hpp"

namespace gbs {

struct WorldMapBackgroundData {
    const char* name;
    BackgroundLayer layer;
    TileMapAsset tilemap;
    uint16_t backdrop_color;
    const TileAsset* source_tiles = nullptr;
};

struct WorldMapNodeData {
    const char* name;
    Vec2i position_pixels;
    int line_index;
    const int* connections;
    size_t connection_count;
    int target_level_index;
    bool unlocked;
    EventScript on_focus;
    EventScript on_select;
    const char* resource_bank_group_name;
    int required_variable = -1;
    int required_value = 0;
    bool hide_when_locked = false;
    int locked_line_index = -1;
    EventScript on_locked = empty_event_script();
    const char* label = nullptr;
};

struct WorldMapProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const WorldMapBackgroundData* backgrounds;
    size_t background_count;
    int background_index;
    const WorldMapNodeData* nodes;
    size_t node_count;
    int initial_node;
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
    const MetaSprite* cursor_metasprite = nullptr;
    const MetaSprite* marker_metasprite = nullptr;
    const char* scene_name = nullptr;
    EventScript on_enter = empty_event_script();
    EventScript on_cancel = empty_event_script();
    EventScript on_start = empty_event_script();
    int journey_frames = 120;
    bool cursor_affine = false;
    bool embedded_nodes = false;
};

struct WorldMapRuntimeState {
    int node_index;
    int previous_node_index;
    int selected_level_index;
};

enum class WorldMapNodeStatus : uint8_t {
    Invalid,
    Hidden,
    Locked,
    Available,
};

struct WorldMapSaveData {
    uint16_t node_index;
    int16_t previous_node_index;
    int16_t selected_level_index;
    int32_t variables[event_variable_count];
    uint32_t play_time_frames;
    uint16_t flags;
};

constexpr int world_map_abs(int value) {
    return value < 0 ? -value : value;
}

constexpr bool world_map_strings_equal(const char* lhs, const char* rhs) {
    if (lhs == nullptr || rhs == nullptr) {
        return lhs == rhs;
    }
    while (*lhs != '\0' && *rhs != '\0') {
        if (*lhs != *rhs) {
            return false;
        }
        ++lhs;
        ++rhs;
    }
    return *lhs == *rhs;
}

constexpr bool is_valid_world_map_node_index(const WorldMapProjectData& project, int node_index) {
    return project.nodes != nullptr &&
        node_index >= 0 &&
        static_cast<size_t>(node_index) < project.node_count;
}

constexpr bool is_valid_world_map_background_index(const WorldMapProjectData& project, int background_index) {
    return background_index < 0 ||
        (project.backgrounds != nullptr &&
            static_cast<size_t>(background_index) < project.background_count);
}

constexpr bool is_valid_world_map_dialogue_line_index(const WorldMapProjectData& project, int line_index) {
    return line_index < 0 ||
        (project.dialogue_lines != nullptr &&
            static_cast<size_t>(line_index) < project.dialogue_line_count &&
            project.dialogue_lines[line_index].text != nullptr);
}

constexpr bool is_valid_world_map_resource_banks(const WorldMapProjectData& project) {
    if (project.resource_bank_count == 0) {
        return true;
    }
    return project.resource_banks != nullptr;
}

constexpr bool is_valid_world_map_resource_bank_groups(const WorldMapProjectData& project) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    return project.resource_bank_groups != nullptr;
}

constexpr const WorldMapNodeData* world_map_node_for(const WorldMapProjectData& project, int node_index) {
    return is_valid_world_map_node_index(project, node_index)
        ? &project.nodes[node_index]
        : nullptr;
}

constexpr const WorldMapBackgroundData* world_map_background_for(const WorldMapProjectData& project) {
    return is_valid_world_map_background_index(project, project.background_index) && project.background_index >= 0
        ? &project.backgrounds[project.background_index]
        : nullptr;
}

constexpr const MetaSprite* world_map_cursor_metasprite_for(const WorldMapProjectData& project) {
    return project.cursor_metasprite;
}

constexpr const MetaSprite* world_map_marker_metasprite_for(const WorldMapProjectData& project) {
    return project.marker_metasprite;
}

constexpr int world_map_clamp(int value, int minimum, int maximum) {
    return value < minimum ? minimum : (value > maximum ? maximum : value);
}

constexpr Vec2i world_map_camera_for_node(
    const WorldMapProjectData& project,
    int node_index,
    int viewport_width = 240,
    int viewport_height = 160
) {
    const WorldMapBackgroundData* background = world_map_background_for(project);
    const WorldMapNodeData* node = world_map_node_for(project, node_index);
    if (background == nullptr || node == nullptr) {
        return Vec2i { 0, 0 };
    }
    const int map_width = static_cast<int>(background->tilemap.width) * 8;
    const int map_height = static_cast<int>(background->tilemap.height) * 8;
    const int maximum_x = map_width > viewport_width ? map_width - viewport_width : 0;
    const int maximum_y = map_height > viewport_height ? map_height - viewport_height : 0;
    return Vec2i {
        world_map_clamp(node->position_pixels.x - viewport_width / 2, 0, maximum_x),
        world_map_clamp(node->position_pixels.y - viewport_height / 2, 0, maximum_y)
    };
}

constexpr bool world_map_node_has_connection(const WorldMapProjectData& project, const WorldMapNodeData& node, int target_node_index) {
    if (!is_valid_world_map_node_index(project, target_node_index)) {
        return false;
    }
    if (node.connection_count == 0) {
        return false;
    }
    if (node.connections == nullptr) {
        return false;
    }
    for (size_t index = 0; index < node.connection_count; ++index) {
        if (node.connections[index] == target_node_index) {
            return true;
        }
    }
    return false;
}

constexpr bool world_map_node_unlock_condition_matches(const WorldMapNodeData& node, const int* variables) {
    if (node.required_variable < 0) {
        return true;
    }
    return variables != nullptr &&
        is_valid_event_variable(node.required_variable) &&
        variables[node.required_variable] == node.required_value;
}

constexpr bool world_map_node_unlock_condition_matches(const WorldMapNodeData& node, const EventState& event_state) {
    return world_map_node_unlock_condition_matches(node, event_state.variables);
}

constexpr bool world_map_node_is_available(const WorldMapNodeData& node, const int* variables = nullptr) {
    return node.unlocked && world_map_node_unlock_condition_matches(node, variables);
}

constexpr bool world_map_node_is_available(const WorldMapNodeData& node, const EventState& event_state) {
    return world_map_node_is_available(node, event_state.variables);
}

constexpr bool world_map_node_is_visible(const WorldMapNodeData& node, const int* variables = nullptr) {
    return world_map_node_is_available(node, variables) || !node.hide_when_locked;
}

constexpr bool world_map_node_is_visible(const WorldMapNodeData& node, const EventState& event_state) {
    return world_map_node_is_visible(node, event_state.variables);
}

constexpr bool world_map_node_has_locked_feedback(const WorldMapNodeData& node) {
    return node.locked_line_index >= 0 || has_event_script(node.on_locked);
}

constexpr WorldMapNodeStatus world_map_node_status(
    const WorldMapProjectData& project,
    int node_index,
    const int* variables = nullptr
) {
    const WorldMapNodeData* node = world_map_node_for(project, node_index);
    if (node == nullptr) {
        return WorldMapNodeStatus::Invalid;
    }
    if (!world_map_node_is_visible(*node, variables)) {
        return WorldMapNodeStatus::Hidden;
    }
    if (!world_map_node_is_available(*node, variables)) {
        return WorldMapNodeStatus::Locked;
    }
    return WorldMapNodeStatus::Available;
}

constexpr WorldMapNodeStatus world_map_node_status(
    const WorldMapProjectData& project,
    int node_index,
    const EventState& event_state
) {
    return world_map_node_status(project, node_index, event_state.variables);
}

constexpr const char* world_map_node_status_label(WorldMapNodeStatus status) {
    switch (status) {
    case WorldMapNodeStatus::Available:
        return "OPEN";
    case WorldMapNodeStatus::Locked:
        return "LOCKED";
    case WorldMapNodeStatus::Hidden:
        return "HIDDEN";
    case WorldMapNodeStatus::Invalid:
    default:
        return "INVALID";
    }
}

constexpr int world_map_connection_at(const WorldMapProjectData& project, const WorldMapNodeData& node, size_t connection_index) {
    return node.connections != nullptr &&
            connection_index < node.connection_count &&
            is_valid_world_map_node_index(project, node.connections[connection_index])
        ? node.connections[connection_index]
        : -1;
}

constexpr int find_world_map_node_index_by_name(const WorldMapProjectData& project, const char* name) {
    if (name == nullptr || project.nodes == nullptr) {
        return -1;
    }
    for (size_t index = 0; index < project.node_count; ++index) {
        if (world_map_strings_equal(project.nodes[index].name, name)) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

constexpr int find_world_map_connected_node_in_direction(
    const WorldMapProjectData& project,
    int node_index,
    int direction_x,
    int direction_y,
    const int* variables
) {
    const WorldMapNodeData* node = world_map_node_for(project, node_index);
    if (node == nullptr || node->connections == nullptr || node->connection_count == 0) {
        return -1;
    }

    int best_index = -1;
    int best_score = 0x7fffffff;
    for (size_t index = 0; index < node->connection_count; ++index) {
        const int candidate_index = world_map_connection_at(project, *node, index);
        const WorldMapNodeData* candidate = world_map_node_for(project, candidate_index);
        if (candidate == nullptr || !world_map_node_is_visible(*candidate, variables)) {
            continue;
        }

        const int dx = candidate->position_pixels.x - node->position_pixels.x;
        const int dy = candidate->position_pixels.y - node->position_pixels.y;
        const bool matches_horizontal =
            (direction_x < 0 && dx < 0) ||
            (direction_x > 0 && dx > 0);
        const bool matches_vertical =
            (direction_y < 0 && dy < 0) ||
            (direction_y > 0 && dy > 0);
        if ((direction_x != 0 && !matches_horizontal) ||
            (direction_y != 0 && !matches_vertical)) {
            continue;
        }

        const int score =
            (direction_x != 0 ? world_map_abs(dx) + world_map_abs(dy) * 2 : world_map_abs(dy) + world_map_abs(dx) * 2);
        if (score < best_score) {
            best_score = score;
            best_index = candidate_index;
        }
    }
    return best_index;
}

constexpr int find_world_map_connected_node_in_direction(
    const WorldMapProjectData& project,
    int node_index,
    int direction_x,
    int direction_y
) {
    return find_world_map_connected_node_in_direction(project, node_index, direction_x, direction_y, nullptr);
}

constexpr int find_world_map_connected_node_in_direction(
    const WorldMapProjectData& project,
    int node_index,
    int direction_x,
    int direction_y,
    const EventState& event_state
) {
    return find_world_map_connected_node_in_direction(project, node_index, direction_x, direction_y, event_state.variables);
}

constexpr WorldMapRuntimeState world_map_runtime_from_project(const WorldMapProjectData& project) {
    return WorldMapRuntimeState { project.initial_node, -1, -1 };
}

constexpr EventScript world_map_node_focus_script(const WorldMapProjectData& project, int node_index) {
    const WorldMapNodeData* node = world_map_node_for(project, node_index);
    return node != nullptr ? node->on_focus : empty_event_script();
}

constexpr EventScript world_map_node_select_script(const WorldMapProjectData& project, int node_index) {
    const WorldMapNodeData* node = world_map_node_for(project, node_index);
    return node != nullptr ? node->on_select : empty_event_script();
}

constexpr EventScript world_map_node_locked_script(const WorldMapProjectData& project, int node_index) {
    const WorldMapNodeData* node = world_map_node_for(project, node_index);
    return node != nullptr ? node->on_locked : empty_event_script();
}

constexpr bool is_valid_world_map_save_data(const WorldMapProjectData& project, const WorldMapSaveData& save_data) {
    return is_valid_world_map_node_index(project, save_data.node_index) &&
        (save_data.previous_node_index < 0 || is_valid_world_map_node_index(project, save_data.previous_node_index));
}

inline void capture_world_map_save_data(
    WorldMapSaveData& save_data,
    const WorldMapRuntimeState& runtime_state,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    save_data.node_index = static_cast<uint16_t>(runtime_state.node_index < 0 ? 0 : runtime_state.node_index);
    save_data.previous_node_index = static_cast<int16_t>(runtime_state.previous_node_index);
    save_data.selected_level_index = static_cast<int16_t>(runtime_state.selected_level_index);
    for (size_t index = 0; index < event_variable_count; ++index) {
        save_data.variables[index] = event_state.variables[index];
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
}

inline bool apply_world_map_save_data(
    const WorldMapProjectData& project,
    const WorldMapSaveData& save_data,
    WorldMapRuntimeState& runtime_state,
    EventState& event_state
) {
    if (!is_valid_world_map_save_data(project, save_data)) {
        return false;
    }
    runtime_state.node_index = save_data.node_index;
    runtime_state.previous_node_index = save_data.previous_node_index;
    runtime_state.selected_level_index = save_data.selected_level_index;
    for (size_t index = 0; index < event_variable_count; ++index) {
        event_state.variables[index] = save_data.variables[index];
    }
    return true;
}

constexpr ResourceBankBatch resource_bank_batch_from_world_map_project(const WorldMapProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_world_map_project(
    const WorldMapProjectData& project,
    size_t group_index
) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_world_map_resource_bank_group_index(const WorldMapProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr int find_world_map_node_resource_bank_group_index(
    const WorldMapProjectData& project,
    const WorldMapNodeData& node
) {
    return find_world_map_resource_bank_group_index(project, node.resource_bank_group_name);
}

constexpr ResourceBankGroup resource_bank_group_from_world_map_node(
    const WorldMapProjectData& project,
    const WorldMapNodeData& node
) {
    int index = find_world_map_node_resource_bank_group_index(project, node);
    return index >= 0
        ? resource_bank_group_from_world_map_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr bool is_valid_world_map_project_data(const WorldMapProjectData& project) {
    if (project.nodes == nullptr ||
        project.node_count == 0 ||
        !is_valid_world_map_node_index(project, project.initial_node) ||
        !is_valid_world_map_background_index(project, project.background_index) ||
        !is_valid_world_map_resource_banks(project) ||
        !is_valid_world_map_resource_bank_groups(project)) {
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
    for (size_t index = 0; index < project.node_count; ++index) {
        const WorldMapNodeData& node = project.nodes[index];
        if (!is_valid_world_map_dialogue_line_index(project, node.line_index)) {
            return false;
        }
        if (!is_valid_world_map_dialogue_line_index(project, node.locked_line_index)) {
            return false;
        }
        if (node.required_variable >= 0 && !is_valid_event_variable(node.required_variable)) {
            return false;
        }
        if (node.connection_count > 0 && node.connections == nullptr) {
            return false;
        }
        for (size_t connection_index = 0; connection_index < node.connection_count; ++connection_index) {
            if (!is_valid_world_map_node_index(project, node.connections[connection_index])) {
                return false;
            }
        }
    }
    return true;
}

} // namespace gbs
