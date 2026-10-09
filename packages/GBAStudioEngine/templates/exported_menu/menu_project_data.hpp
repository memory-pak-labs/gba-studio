#pragma once

#include "gbs/menu.hpp"
#include "gbs/save.hpp"

namespace gbastudio_menu_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveBank save_bank {
    0,
    1024,
    1,
    gbs::make_save_signature('G', 'B', 'M', 'N'),
    1
};

constexpr gbs::DialogueLine dialogue_lines[] = {
    { "GBAStudio Menu" },
    { "> Continuar" },
    { "> Novo jogo" },
    { "> Opcoes" },
    { "Novo jogo selecionado." },
    { "Tela de opcoes." },
    { "> Voltar" },
    { "> Som" },
    { "> Volume" },
};

constexpr gbs::EventCommand start_commands[] = {
    { gbs::EventOp::ShowDialogue, 4, 0, 0 },
    { gbs::EventOp::SetVariable, 0, 1, 0 },
};

constexpr gbs::EventCommand options_enter_commands[] = {
    { gbs::EventOp::ShowDialogue, 5, 0, 0 },
};

constexpr gbs::MenuItemData main_items[] = {
    {
        "continue",
        1,
        gbs::empty_event_script(),
        -1,
        true,
        gbs::MenuItemAction::Select,
        gbs::MenuItemConditionData { 0, 1, true },
        gbs::menu_item_no_value()
    },
    {
        "new_game",
        2,
        { start_commands, 2 },
        -1,
        true,
        gbs::MenuItemAction::Select,
        gbs::menu_item_always_available(),
        gbs::menu_item_no_value()
    },
    {
        "options",
        3,
        gbs::empty_event_script(),
        1,
        true,
        gbs::MenuItemAction::PushScreen,
        gbs::menu_item_always_available(),
        gbs::menu_item_no_value()
    },
};

constexpr gbs::MenuItemData options_items[] = {
    {
        "sound",
        7,
        gbs::empty_event_script(),
        -1,
        true,
        gbs::MenuItemAction::ToggleVariable,
        gbs::menu_item_always_available(),
        gbs::MenuItemValueData { 1, 0, 1, 1 }
    },
    {
        "volume",
        8,
        gbs::empty_event_script(),
        -1,
        true,
        gbs::MenuItemAction::AdjustVariable,
        gbs::menu_item_always_available(),
        gbs::MenuItemValueData { 2, 0, 10, 1 }
    },
    {
        "back",
        6,
        gbs::empty_event_script(),
        -1,
        true,
        gbs::MenuItemAction::PopScreen,
        gbs::menu_item_always_available(),
        gbs::menu_item_no_value()
    },
};

constexpr gbs::MenuScreenData screens[] = {
    {
        "main",
        -1,
        0,
        main_items,
        sizeof(main_items) / sizeof(main_items[0]),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr
    },
    {
        "options",
        -1,
        5,
        options_items,
        sizeof(options_items) / sizeof(options_items[0]),
        { options_enter_commands, 1 },
        gbs::empty_event_script(),
        nullptr
    },
};

constexpr gbs::MenuProjectData project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    screens,
    sizeof(screens) / sizeof(screens[0]),
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

} // namespace gbastudio_menu_project
