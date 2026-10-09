#include "gbs/world_map.hpp"

namespace {

constexpr gbs::DialogueLine lines[] = {
    { "Start" },
    { "Forest" },
    { "Castle" },
};

constexpr gbs::EventCommand select_commands[] = {
    { gbs::EventOp::SetVariable, 0, 7, 0 },
};

constexpr gbs::EventCommand locked_commands[] = {
    { gbs::EventOp::ShowDialogue, 2, 0, 0 },
};

constexpr int start_connections[] = { 1, 2 };
constexpr int forest_connections[] = { 0, 2 };
constexpr int castle_connections[] = { 0, 1 };

constexpr gbs::WorldMapNodeData nodes[] = {
    { "start", { 32, 96 }, 0, start_connections, 2, 0, true, gbs::empty_event_script(), { select_commands, 1 }, "overworld" },
    { "forest", { 96, 64 }, 1, forest_connections, 2, 1, true, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
    { "castle", { 168, 96 }, 2, castle_connections, 2, 2, true, gbs::empty_event_script(), gbs::empty_event_script(), nullptr, 2, 1, false, 2, { locked_commands, 1 } },
};

constexpr gbs::ResourceBank banks[] = {
    { gbs::ResourcePoolKind::BgTiles, 0, 4, 1, "world_bank" },
};
constexpr gbs::ResourceBankGroup groups[] = {
    { "overworld", banks, 1 },
};
constexpr uint16_t world_obj_colors[] = { 0x0000, 0x7fff };
constexpr gbs::PaletteAsset world_obj_palettes[] = {
    { world_obj_colors, 2, 0 },
};
constexpr gbs::MetaSpritePart world_cursor_parts[] = {
    { 0, 0, 0, 0, false, false, 16, 16 },
};
constexpr gbs::MetaSpritePart world_marker_parts[] = {
    { 0, 0, 1, 0, false, false, 16, 16 },
};
constexpr gbs::MetaSprite world_cursor { world_cursor_parts, 1 };
constexpr gbs::MetaSprite world_marker { world_marker_parts, 1 };

constexpr gbs::WorldMapProjectData project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    -1,
    nodes,
    3,
    0,
    lines,
    3,
    nullptr,
    0,
    banks,
    1,
    groups,
    1
};
constexpr gbs::WorldMapProjectData visual_project = [] {
    gbs::WorldMapProjectData result = project;
    result.obj_palettes = world_obj_palettes;
    result.obj_palette_count = 1;
    result.cursor_metasprite = &world_cursor;
    result.marker_metasprite = &world_marker;
    return result;
}();

static_assert(gbs::is_valid_world_map_project_data(project), "world map project should be valid");
static_assert(gbs::world_map_cursor_metasprite_for(visual_project) == &world_cursor, "world map uses the authored cursor");
static_assert(gbs::world_map_marker_metasprite_for(visual_project) == &world_marker, "world map uses the authored marker");
static_assert(gbs::world_map_runtime_from_project(project).node_index == 0, "runtime starts at initial node");
static_assert(gbs::world_map_node_has_connection(project, nodes[0], 1), "start connects to forest");
static_assert(gbs::find_world_map_node_index_by_name(project, "castle") == 2, "node lookup should work");
static_assert(gbs::find_world_map_connected_node_in_direction(project, 0, 1, 0) == 1, "right should choose unlocked forest");
static_assert(!gbs::world_map_node_is_available(nodes[2]), "castle starts locked by variable");
static_assert(gbs::world_map_node_is_visible(nodes[2]), "locked castle remains visible");
static_assert(gbs::world_map_node_has_locked_feedback(nodes[2]), "castle has locked feedback");
static_assert(gbs::world_map_node_status(project, 0) == gbs::WorldMapNodeStatus::Available, "start is available");
static_assert(gbs::world_map_node_status(project, 2) == gbs::WorldMapNodeStatus::Locked, "castle starts locked");
static_assert(gbs::world_map_node_status_label(gbs::WorldMapNodeStatus::Locked)[0] == 'L', "locked label is stable");

constexpr int unlocked_variables[] = { 0, 0, 1 };
static_assert(gbs::world_map_node_is_available(nodes[2], unlocked_variables), "castle unlocks when variable matches");
static_assert(gbs::world_map_node_status(project, 2, unlocked_variables) == gbs::WorldMapNodeStatus::Available, "castle status unlocks");

constexpr gbs::WorldMapNodeData hidden_node {
    "secret",
    { 0, 0 },
    -1,
    nullptr,
    0,
    -1,
    true,
    gbs::empty_event_script(),
    gbs::empty_event_script(),
    nullptr,
    3,
    1,
    true,
    -1,
    gbs::empty_event_script()
};
static_assert(!gbs::world_map_node_is_visible(hidden_node), "hidden locked node stays hidden");

constexpr gbs::WorldMapNodeData hidden_nodes[] = { hidden_node };
constexpr gbs::WorldMapProjectData hidden_project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    -1,
    hidden_nodes,
    1,
    0,
    lines,
    3,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0
};
static_assert(gbs::world_map_node_status(hidden_project, 0) == gbs::WorldMapNodeStatus::Hidden, "hidden node status is hidden");

constexpr uint16_t large_map_entries[64 * 64] = {};
constexpr gbs::TileMapAsset large_map_tilemap { large_map_entries, 64, 64 };
constexpr gbs::WorldMapBackgroundData large_map_backgrounds[] = {
    { "large_world", gbs::BackgroundLayer::BG3, large_map_tilemap, 0 },
};
constexpr gbs::WorldMapNodeData large_map_nodes[] = {
    { "north_west", { 32, 32 }, -1, nullptr, 0, 0, true, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
    { "center", { 256, 256 }, -1, nullptr, 0, 1, true, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
    { "south_east", { 500, 500 }, -1, nullptr, 0, 2, true, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
};
constexpr gbs::WorldMapProjectData large_map_project = {
    nullptr,
    0,
    nullptr,
    0,
    large_map_backgrounds,
    1,
    0,
    large_map_nodes,
    3,
    0,
    nullptr,
    0
};
static_assert(gbs::world_map_camera_for_node(large_map_project, 0).x == 0, "camera clamps at west edge");
static_assert(gbs::world_map_camera_for_node(large_map_project, 0).y == 0, "camera clamps at north edge");
static_assert(gbs::world_map_camera_for_node(large_map_project, 1).x == 136, "camera centers middle node horizontally");
static_assert(gbs::world_map_camera_for_node(large_map_project, 1).y == 176, "camera centers middle node vertically");
static_assert(gbs::world_map_camera_for_node(large_map_project, 2).x == 272, "camera clamps at east edge");
static_assert(gbs::world_map_camera_for_node(large_map_project, 2).y == 352, "camera clamps at south edge");

constexpr int invalid_connections[] = { 99 };
constexpr gbs::WorldMapNodeData invalid_nodes[] = {
    { "bad", { 0, 0 }, 0, invalid_connections, 1, 0, true, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
};
constexpr gbs::WorldMapProjectData invalid_project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    -1,
    invalid_nodes,
    1,
    0,
    lines,
    3,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0
};

static_assert(!gbs::is_valid_world_map_project_data(invalid_project), "invalid connection must fail");

constexpr gbs::WorldMapNodeData invalid_variable_nodes[] = {
    { "bad_var", { 0, 0 }, 0, nullptr, 0, 0, true, gbs::empty_event_script(), gbs::empty_event_script(), nullptr, gbs::event_variable_count, 1, false, -1, gbs::empty_event_script() },
};
constexpr gbs::WorldMapProjectData invalid_variable_project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    -1,
    invalid_variable_nodes,
    1,
    0,
    lines,
    3,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0
};

static_assert(!gbs::is_valid_world_map_project_data(invalid_variable_project), "invalid unlock variable must fail");

} // namespace

int main() {
    if (!gbs::is_valid_world_map_project_data(project)) {
        return 1;
    }
    const gbs::WorldMapNodeData* start = gbs::world_map_node_for(project, 0);
    if (start == nullptr || gbs::world_map_node_select_script(project, 0).command_count != 1) {
        return 2;
    }
    if (gbs::find_world_map_node_resource_bank_group_index(project, *start) != 0) {
        return 3;
    }
    if (gbs::find_world_map_connected_node_in_direction(project, 0, 1, 0) != 1) {
        return 4;
    }
    if (gbs::world_map_node_status(project, 99) != gbs::WorldMapNodeStatus::Invalid) {
        return 5;
    }
    int variables[16] = {};
    if (gbs::world_map_node_is_available(nodes[2], variables)) {
        return 6;
    }
    if (!gbs::world_map_node_is_visible(nodes[2], variables)) {
        return 7;
    }
    if (gbs::world_map_node_status(project, 2, variables) != gbs::WorldMapNodeStatus::Locked) {
        return 8;
    }
    variables[2] = 1;
    if (!gbs::world_map_node_is_available(nodes[2], variables)) {
        return 9;
    }
    if (gbs::world_map_node_status(project, 2, variables) != gbs::WorldMapNodeStatus::Available) {
        return 10;
    }
    gbs::EventState event_state {};
    event_state.variables[2] = 1;
    event_state.variables[7] = 99;
    event_state.variables[gbs::event_variable_count - 1] = 910;
    gbs::WorldMapRuntimeState runtime_state { 2, 1, 2 };
    gbs::WorldMapSaveData save_data {};
    gbs::capture_world_map_save_data(save_data, runtime_state, event_state, 3600, 4);
    if (!gbs::is_valid_world_map_save_data(project, save_data) ||
        save_data.node_index != 2 ||
        save_data.previous_node_index != 1 ||
        save_data.selected_level_index != 2 ||
        save_data.variables[7] != 99 ||
        save_data.variables[gbs::event_variable_count - 1] != 910 ||
        save_data.play_time_frames != 3600 ||
        save_data.flags != 4) {
        return 11;
    }
    gbs::WorldMapRuntimeState restored_runtime {};
    gbs::EventState restored_event_state {};
    if (!gbs::apply_world_map_save_data(project, save_data, restored_runtime, restored_event_state) ||
        restored_runtime.node_index != 2 ||
        restored_runtime.previous_node_index != 1 ||
        restored_runtime.selected_level_index != 2 ||
        restored_event_state.variables[7] != 99 ||
        restored_event_state.variables[gbs::event_variable_count - 1] != 910) {
        return 12;
    }
    save_data.node_index = 99;
    if (gbs::apply_world_map_save_data(project, save_data, restored_runtime, restored_event_state)) {
        return 13;
    }
    return 0;
}
