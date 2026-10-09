#pragma once

#include "gbs/cutscene.hpp"
#include "gbs/save.hpp"

namespace gbastudio_cutscene_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveBank save_bank {
    0,
    1024,
    1,
    gbs::make_save_signature('G', 'B', 'C', 'S'),
    1
};

constexpr gbs::DialogueLine dialogue_lines[] = {
    { "Cutscene inicial." },
    { "A camera mostra a cena." },
    { "Fim da cutscene." },
    { "Rota alternativa liberada." },
};

constexpr gbs::EventCommand step_1_commands[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 },
};

constexpr gbs::EventCommand skip_commands[] = {
    { gbs::EventOp::SetVariable, 1, 1, 0 },
};

constexpr gbs::CutsceneStepData intro_steps[] = {
    { 0, 80, gbs::empty_event_script(), -1, true },
    { 1, 80, { step_1_commands, 1 }, -1, true },
    {
        3,
        0,
        gbs::empty_event_script(),
        -1,
        false,
        false,
        { skip_commands, 1 },
        gbs::CutsceneBranchData { 0, 1, 1, -1 },
        true
    },
};

constexpr gbs::CutsceneStepData end_steps[] = {
    { 2, 0, gbs::empty_event_script(), -1, false },
};

constexpr gbs::CutsceneSceneData scenes[] = {
    {
        "intro",
        -1,
        intro_steps,
        sizeof(intro_steps) / sizeof(intro_steps[0]),
        -1,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr
    },
    {
        "end",
        -1,
        end_steps,
        sizeof(end_steps) / sizeof(end_steps[0]),
        -1,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr
    },
};

constexpr const gbs::DialoguePortraitEntry* dialogue_portrait_assets = nullptr;
constexpr size_t dialogue_portrait_asset_count = 0;

constexpr gbs::CutsceneProjectData project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    scenes,
    sizeof(scenes) / sizeof(scenes[0]),
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

} // namespace gbastudio_cutscene_project
