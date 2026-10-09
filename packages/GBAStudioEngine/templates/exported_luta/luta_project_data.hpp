#pragma once
#include "gbs/luta.hpp"
#include "gbs/save.hpp"

namespace gbastudio_luta_project {

constexpr gbs::LutaCharacter player1_fighters[] = {
    { "fighter_1", "Fighter 1", nullptr, nullptr, nullptr, nullptr, 100, 12, 8, 10, 10, 70, 48, 100, nullptr, 0, 16, nullptr, nullptr },
};

constexpr gbs::LutaCharacter player2_fighters[] = {
    { "fighter_2", "Fighter 2", nullptr, nullptr, nullptr, nullptr, 100, 12, 8, 10, 10, 70, 48, 100, nullptr, 0, 16, nullptr, nullptr },
};

constexpr gbs::LutaCharacter characters[] = {
    player1_fighters[0],
    player2_fighters[0],
};

constexpr gbs::LutaStageData stages[] = {
    {
        "dojo", 99, 2, 100, 8, 4, 2, true, true, true, 8, 4, 0.85f, 60, 100,
        gbs::LutaIsmStyle::AIsm, "dojo", 80, 200,
        characters, 2, player1_fighters, 1, player2_fighters, 1,
        nullptr, 0, nullptr, 0,
        gbs::empty_event_script(), gbs::empty_event_script(), gbs::empty_event_script(), -1, nullptr,
    },
};

constexpr gbs::LutaProjectData project {
    stages,
    1, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr, 0,
    nullptr,
    false,
    false,
    nullptr
};

constexpr gbs::SaveBank save_bank = {
    0u, 0u, 0u, 0u, 0u
};

constexpr bool save_enabled = false;
constexpr bool save_autosave = false;

}
