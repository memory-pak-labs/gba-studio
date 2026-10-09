#pragma once

#include "gbs/point_click.hpp"
#include "gbs/save.hpp"

namespace gbastudio_point_click_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveBank save_bank {
    0,
    1024,
    1,
    gbs::make_save_signature('G', 'B', 'P', 'C'),
    1
};

constexpr gbs::DialogueLine dialogue_lines[] = {
    { "Aponte para a porta e aperte A." },
    { "A porta abriu." },
    { "Voce entrou na outra cena." },
    { "Voce pegou a chave." },
    { "A porta esta trancada." },
    { "Chave selecionada." },
};

constexpr gbs::EventCommand scene_0_enter_commands[] = {
    { gbs::EventOp::ShowDialogue, 0, 0, 0 },
};

constexpr gbs::EventCommand door_click_commands[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 },
};

constexpr gbs::EventCommand door_unlock_commands[] = {
    { gbs::EventOp::SetVariable, 1, 1, 0 },
};

constexpr gbs::EventCommand scene_1_enter_commands[] = {
    { gbs::EventOp::ShowDialogue, 2, 0, 0 },
};

constexpr gbs::PointClickInventoryItemData inventory_items[] = {
    { "key", 2, 5 },
};

constexpr gbs::PointClickHotspotData scene_0_hotspots[] = {
    {
        "key",
        gbs::Rect { 56, 96, 16, 16 },
        3,
        gbs::empty_event_script(),
        -1,
        nullptr,
        -1,
        0,
        -1,
        gbs::empty_event_script()
    },
    {
        "door",
        gbs::Rect { 112, 72, 24, 32 },
        1,
        { door_click_commands, 1 },
        1,
        nullptr,
        0,
        -1,
        4,
        { door_unlock_commands, 1 }
    },
};

constexpr gbs::PointClickSceneData scenes[] = {
    {
        "room",
        -1,
        scene_0_hotspots,
        sizeof(scene_0_hotspots) / sizeof(scene_0_hotspots[0]),
        { scene_0_enter_commands, 1 },
        gbs::empty_event_script(),
        nullptr
    },
    {
        "inside",
        -1,
        nullptr,
        0,
        { scene_1_enter_commands, 1 },
        gbs::empty_event_script(),
        nullptr
    },
};

constexpr gbs::PointClickProjectData project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    scenes,
    sizeof(scenes) / sizeof(scenes[0]),
    0,
    gbs::Vec2i { 120, 80 },
    2,
    dialogue_lines,
    sizeof(dialogue_lines) / sizeof(dialogue_lines[0]),
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    inventory_items,
    sizeof(inventory_items) / sizeof(inventory_items[0])
};

} // namespace gbastudio_point_click_project
