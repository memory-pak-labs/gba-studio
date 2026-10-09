#pragma once

#include "gbs/save.hpp"
#include "gbs/world_map.hpp"

namespace gbastudio_world_map_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveBank save_bank {
    0,
    1024,
    1,
    gbs::make_save_signature('G', 'B', 'W', 'M'),
    1
};

constexpr gbs::DialogueLine dialogue_lines[] = {
    { "Inicio do mapa." },
    { "Floresta liberada." },
    { "Castelo bloqueado." },
};

constexpr gbs::EventCommand start_select_commands[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 },
    { gbs::EventOp::ShowDialogue, 0, 0, 0 },
};

constexpr gbs::EventCommand forest_select_commands[] = {
    { gbs::EventOp::SetVariable, 1, 1, 0 },
    { gbs::EventOp::SetVariable, 2, 1, 0 },
    { gbs::EventOp::ShowDialogue, 1, 0, 0 },
};

constexpr gbs::EventCommand castle_locked_commands[] = {
    { gbs::EventOp::ShowDialogue, 2, 0, 0 },
};

constexpr int start_connections[] = { 1, 2 };
constexpr int forest_connections[] = { 0, 2 };
constexpr int castle_connections[] = { 0, 1 };

constexpr gbs::WorldMapNodeData nodes[] = {
    {
        "start",
        { 40, 96 },
        0,
        start_connections,
        sizeof(start_connections) / sizeof(start_connections[0]),
        0,
        true,
        gbs::empty_event_script(),
        { start_select_commands, sizeof(start_select_commands) / sizeof(start_select_commands[0]) },
        nullptr
    },
    {
        "forest",
        { 112, 64 },
        1,
        forest_connections,
        sizeof(forest_connections) / sizeof(forest_connections[0]),
        1,
        true,
        gbs::empty_event_script(),
        { forest_select_commands, sizeof(forest_select_commands) / sizeof(forest_select_commands[0]) },
        nullptr,
        -1,
        0,
        false,
        -1,
        gbs::empty_event_script()
    },
    {
        "castle",
        { 184, 96 },
        2,
        castle_connections,
        sizeof(castle_connections) / sizeof(castle_connections[0]),
        2,
        true,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        2,
        1,
        false,
        2,
        { castle_locked_commands, sizeof(castle_locked_commands) / sizeof(castle_locked_commands[0]) }
    },
};

constexpr gbs::WorldMapProjectData project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    -1,
    nodes,
    sizeof(nodes) / sizeof(nodes[0]),
    0,
    dialogue_lines,
    sizeof(dialogue_lines) / sizeof(dialogue_lines[0]),
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0
};

} // namespace gbastudio_world_map_project
