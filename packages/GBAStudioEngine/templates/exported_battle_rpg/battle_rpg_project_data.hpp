#pragma once
#include "gbs/battle_rpg.hpp"
namespace gbastudio_battle_rpg_project {
constexpr gbs::BattleRpgAbilityData attack[] = {{ gbs::BattleRpgAbilityKind::Attack, 0 }};
constexpr gbs::BattleRpgParticipantData party[] = {
    { "Hero", { 24, 7, 2, 5 }, attack, 1 },
    { "Mage", { 18, 5, 1, 7 }, attack, 1 },
    { "Guard", { 30, 5, 5, 3 }, attack, 1 }
};
constexpr gbs::BattleRpgParticipantData enemies[] = {
    { "Slime A", { 12, 4, 1, 3 }, attack, 1 },
    { "Slime B", { 12, 4, 1, 3 }, attack, 1 },
    { "Slime C", { 12, 4, 1, 3 }, attack, 1 },
    { "Slime D", { 12, 4, 1, 3 }, attack, 1 }
};
constexpr gbs::BattleRpgEncounterData encounters[] = {
    { "arena", { 3, 4, 12, false, true }, party, 3, enemies, 4, { 25, 10 } }
};
constexpr gbs::BattleRpgProjectData project { encounters, 1, 0 };
}
