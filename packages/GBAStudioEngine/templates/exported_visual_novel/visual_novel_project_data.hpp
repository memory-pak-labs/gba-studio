#pragma once

#include "gbs/save.hpp"
#include "gbs/visual_novel.hpp"

namespace gbastudio_visual_novel_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveBank save_bank {
    0,
    1024,
    1,
    gbs::make_save_signature('G', 'B', 'V', 'N'),
    1
};

constexpr gbs::DialogueLine dialogue_lines[] = {
    { "Visual Novel" },
    { "Projeto exportado pronto." },
    { "Escolha um caminho." },
    { "Voce encontrou a rota secreta." },
};

constexpr gbs::DialogueChoice intro_choices[] = {
    { "Continuar", 1, 0 },
    { "Segredo", 2, 1 },
    { "Fim", 3, 2 },
};

constexpr gbs::EventCommand intro_secret_commands[] = {
    { gbs::EventOp::SetVariable, 2, 1, 0 },
};

constexpr gbs::VisualNovelChoiceOptionData intro_choice_options[] = {
    { -1, 0, true, 1, gbs::empty_event_script() },
    { 1, 1, true, 2, { intro_secret_commands, 1 } },
    { -1, 0, true, 1, gbs::empty_event_script() },
};

constexpr gbs::VisualNovelChoiceGroupData choice_groups[] = {
    { 2, intro_choices, 3, 0, intro_choice_options },
};

constexpr const gbs::DialoguePortraitEntry* dialogue_portrait_assets = nullptr;
constexpr size_t dialogue_portrait_asset_count = 0;

constexpr gbs::EventCommand scene_0_enter_commands[] = {
    { gbs::EventOp::ShowDialogue, 0, 0, 0 },
    { gbs::EventOp::SetVariable, 1, 1, 0 },
};

constexpr gbs::EventCommand scene_1_enter_commands[] = {
    { gbs::EventOp::ShowDialogue, 1, 0, 0 },
};

constexpr gbs::EventCommand scene_2_enter_commands[] = {
    { gbs::EventOp::ShowDialogue, 3, 0, 0 },
};

constexpr gbs::VisualNovelSceneData scenes[] = {
    {
        "intro",
        -1,
        -1,
        0,
        1,
        { scene_0_enter_commands, 2 },
        gbs::empty_event_script(),
        true,
        nullptr
    },
    {
        "end",
        -1,
        -1,
        -1,
        -1,
        { scene_1_enter_commands, 1 },
        gbs::empty_event_script(),
        false,
        nullptr
    },
    {
        "secret",
        -1,
        -1,
        -1,
        -1,
        { scene_2_enter_commands, 1 },
        gbs::empty_event_script(),
        false,
        nullptr
    },
};

constexpr gbs::VisualNovelProjectData project = {
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
    choice_groups,
    sizeof(choice_groups) / sizeof(choice_groups[0]),
    nullptr,
    0,
    nullptr,
    0
};

} // namespace gbastudio_visual_novel_project
