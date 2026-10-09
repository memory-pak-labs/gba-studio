#include <assert.h>

#include "gbs/battle_rpg.hpp"

namespace {

constexpr gbs::BattleRpgAbilityData hero_abilities[] = {
    { gbs::BattleRpgAbilityKind::Attack, 0 },
    { gbs::BattleRpgAbilityKind::Magic, 12 },
    { gbs::BattleRpgAbilityKind::Heal, 8 },
    { gbs::BattleRpgAbilityKind::Defend, 0 }
};
constexpr gbs::BattleRpgAbilityData attack_only[] = {{ gbs::BattleRpgAbilityKind::Attack, 0 }};
constexpr gbs::BattleRpgAbilityData enemy_tactics[] = {
    { gbs::BattleRpgAbilityKind::Attack, 0 },
    { gbs::BattleRpgAbilityKind::Magic, 9 },
    { gbs::BattleRpgAbilityKind::Heal, 5 },
    { gbs::BattleRpgAbilityKind::Defend, 0 }
};
constexpr gbs::BattleRpgAbilityData enemy_guard[] = {
    { gbs::BattleRpgAbilityKind::Defend, 0 },
    { gbs::BattleRpgAbilityKind::Attack, 0 }
};
constexpr uint16_t battle_map_entries[30 * 20] = {};
constexpr gbs::TileMapAsset battle_tilemap { battle_map_entries, 30, 20 };
constexpr gbs::BattleRpgBackgroundData battle_backgrounds[] = {
    { "arena", gbs::BackgroundLayer::BG2, battle_tilemap, 0 },
};
constexpr uint16_t battle_obj_colors[] = { 0x0000, 0x7fff };
constexpr gbs::PaletteAsset battle_obj_palettes[] = {
    { battle_obj_colors, 2, 0 },
};
constexpr gbs::MetaSpritePart hero_parts[] = {
    { 0, 0, 0, 0, false, false, 16, 32 },
};
constexpr gbs::MetaSpritePart slime_parts[] = {
    { 0, 0, 2, 0, false, false, 16, 16 },
};
constexpr gbs::MetaSprite hero_metasprite { hero_parts, 1 };
constexpr gbs::MetaSprite slime_metasprite { slime_parts, 1 };
constexpr gbs::BattleRpgParticipantData party[] = {
    { "Hero", { 24, 7, 2, 5 }, hero_abilities, 4, &hero_metasprite },
    { "Mage", { 18, 4, 1, 7 }, hero_abilities, 4 },
    { "Guard", { 30, 5, 5, 3 }, attack_only, 1 }
};
constexpr gbs::BattleRpgParticipantData enemies[] = {
    { "Slime A", { 12, 4, 1, 3 }, enemy_tactics, 4, &slime_metasprite },
    { "Slime B", { 14, 5, 2, 4 }, attack_only, 1 },
    { "Slime C", { 16, 6, 2, 5 }, attack_only, 1 },
    { "Slime D", { 18, 7, 3, 6 }, attack_only, 1 }
};
constexpr gbs::BattleRpgEncounterData encounters[] = {
    { "arena", { 3, 4, 12, false, true }, party, 3, enemies, 4, { 25, 10 }, gbs::empty_event_script(), gbs::empty_event_script(), gbs::empty_event_script(), gbs::empty_event_script(), 0, "arena_bank" }
};
constexpr gbs::BattleRpgParticipantData boss_party[] = {{ "Hero", { 10, 10, 0, 1 }, attack_only, 1 }};
constexpr gbs::BattleRpgParticipantData boss_enemy[] = {{ "Boss", { 1, 1, 0, 1 }, attack_only, 1 }};
constexpr gbs::BattleRpgEncounterData boss {
    "boss", { 1, 1, 1, false, false }, boss_party, 1, boss_enemy, 1, { 100, 50 }
};
constexpr gbs::BattleRpgParticipantData tactical_enemy[] = {{ "Shaman", { 20, 6, 1, 5 }, enemy_tactics, 4 }};
constexpr gbs::BattleRpgEncounterData tactical {
    "tactical", { 3, 1, 1, false, false }, party, 3, tactical_enemy, 1, { 0, 0 }
};
constexpr gbs::BattleRpgParticipantData guard_enemy[] = {{ "Sentinel", { 20, 6, 1, 5 }, enemy_guard, 2 }};
constexpr gbs::BattleRpgEncounterData guarded {
    "guarded", { 3, 1, 1, false, false }, party, 3, guard_enemy, 1, { 0, 0 }
};
constexpr gbs::BattleRpgProjectData project { encounters, 1, 0 };
constexpr gbs::BattleRpgProjectData visual_project = [] {
    gbs::BattleRpgProjectData result = project;
    result.obj_palettes = battle_obj_palettes;
    result.obj_palette_count = 1;
    result.backgrounds = battle_backgrounds;
    result.background_count = 1;
    return result;
}();
constexpr gbs::EventCommand enter_commands[] = {{ gbs::EventOp::SetVariable, 0, 1, 0 }};
constexpr gbs::EventCommand victory_commands[] = {{ gbs::EventOp::SetVariable, 1, 1, 0 }};
constexpr gbs::EventCommand defeat_commands[] = {{ gbs::EventOp::SetVariable, 2, 1, 0 }};
constexpr gbs::EventCommand escape_commands[] = {{ gbs::EventOp::SetVariable, 3, 1, 0 }};
constexpr gbs::BattleRpgEncounterData scripted_battle {
    "scripted",
    { 1, 1, 1, false, true },
    boss_party,
    1,
    boss_enemy,
    1,
    { 100, 50 },
    { enter_commands, 1 },
    { victory_commands, 1 },
    { defeat_commands, 1 },
    { escape_commands, 1 }
};
constexpr gbs::BattleRpgEncounterData scripted_encounters[] = { scripted_battle };
constexpr gbs::BattleRpgProjectData scripted_project { scripted_encounters, 1, 0 };

} // namespace

int main() {
    static_assert(gbs::is_valid_battle_rpg_project_data(project));
    static_assert(gbs::battle_rpg_background_for(visual_project, encounters[0]) == &battle_backgrounds[0]);
    static_assert(gbs::battle_rpg_participant_metasprite_for(party[0]) == &hero_metasprite);
    static_assert(gbs::battle_rpg_participant_metasprite_for(enemies[0]) == &slime_metasprite);
    gbs::BattleRpgRuntimeState state = gbs::make_battle_rpg_runtime_state(encounters[0]);
    assert(state.outcome == gbs::BattleRpgOutcome::InProgress);
    assert(state.reward_gold == 0 && state.reward_experience == 0);
    assert(state.selected_party == 0);
    assert(state.selected_ally == 0);
    assert(state.selected_enemy == 0);
    assert(state.selected_ability == 0);
    gbs::select_next_battle_party(state, encounters[0], 1);
    assert(state.selected_party == 1);
    gbs::select_next_battle_ability(state, encounters[0], 1);
    gbs::select_next_battle_ability(state, encounters[0], 1);
    assert(state.selected_ability == 2);
    state.party_hp[2] = 10;
    gbs::select_next_battle_ally(state, encounters[0], 1);
    gbs::select_next_battle_ally(state, encounters[0], 1);
    assert(state.selected_ally == 2);
    assert(gbs::use_selected_battle_ability(state, encounters[0]));
    assert(state.party_hp[2] == 18);
    state.enemy_turn_pending = false;
    gbs::select_next_battle_enemy(state, encounters[0], 1);
    assert(state.selected_enemy == 1);
    assert(gbs::battle_player_attack(state, encounters[0]));
    assert(state.enemy_hp[1] < encounters[0].enemies[1].unit.max_hp);
    for (int frame = 0; frame < encounters[0].config.turn_delay_frames; ++frame) {
        gbs::tick_battle_rpg(state, encounters[0]);
    }
    assert(state.party_hp[2] < 18);

    gbs::BattleRpgRuntimeState abilities = gbs::make_battle_rpg_runtime_state(encounters[0]);
    assert(gbs::use_battle_ability(abilities, encounters[0], 0, 1, 0));
    assert(abilities.enemy_hp[0] < encounters[0].enemies[0].unit.max_hp);
    abilities.enemy_turn_pending = false;
    abilities.party_hp[0] = 8;
    assert(gbs::use_battle_ability(abilities, encounters[0], 0, 2, 0));
    assert(abilities.party_hp[0] == 16);
    abilities.enemy_turn_pending = false;
    assert(gbs::use_battle_ability(abilities, encounters[0], 0, 3, 0));
    assert(abilities.party_defending[0]);
    const int hp_before_defended_hit = abilities.party_hp[0];
    for (int frame = 0; frame < encounters[0].config.turn_delay_frames; ++frame) {
        gbs::tick_battle_rpg(abilities, encounters[0]);
    }
    assert(abilities.party_hp[0] > hp_before_defended_hit - 3);
    assert(!abilities.party_defending[0]);

    gbs::BattleRpgRuntimeState ai = gbs::make_battle_rpg_runtime_state(tactical);
    ai.enemy_hp[0] = 5;
    ai.enemy_turn_pending = true;
    ai.turn_delay_remaining = 1;
    gbs::tick_battle_rpg(ai, tactical);
    assert(ai.enemy_hp[0] == 10);
    assert(ai.last_enemy_ability == gbs::BattleRpgAbilityKind::Heal);
    assert(ai.last_enemy_actor == 0 && ai.last_enemy_target == 0);
    ai.enemy_hp[0] = tactical.enemies[0].unit.max_hp;
    ai.party_hp[0] = 4;
    ai.enemy_turn_pending = true;
    ai.turn_delay_remaining = 1;
    gbs::tick_battle_rpg(ai, tactical);
    assert(ai.party_hp[0] < 4);
    assert(ai.last_enemy_ability == gbs::BattleRpgAbilityKind::Magic);
    assert(ai.last_enemy_target == 0);

    gbs::BattleRpgRuntimeState defensive_ai = gbs::make_battle_rpg_runtime_state(guarded);
    defensive_ai.enemy_hp[0] = 5;
    defensive_ai.enemy_turn_pending = true;
    defensive_ai.turn_delay_remaining = 1;
    gbs::tick_battle_rpg(defensive_ai, guarded);
    assert(defensive_ai.enemy_defending[0]);
    assert(defensive_ai.last_enemy_ability == gbs::BattleRpgAbilityKind::Defend);
    assert(gbs::battle_player_attack(defensive_ai, guarded));
    assert(defensive_ai.enemy_hp[0] == 2);
    assert(!defensive_ai.enemy_defending[0]);
    assert(gbs::try_escape_battle(state, encounters[0]));
    assert(state.outcome == gbs::BattleRpgOutcome::Escaped);

    gbs::BattleRpgRuntimeState locked = gbs::make_battle_rpg_runtime_state(boss);
    assert(!gbs::try_escape_battle(locked, boss));
    assert(gbs::battle_player_attack(locked, boss));
    assert(locked.outcome == gbs::BattleRpgOutcome::Victory);
    assert(locked.reward_gold == 100 && locked.reward_experience == 50);

    assert(gbs::battle_rpg_outcome_script(scripted_battle, gbs::BattleRpgOutcome::Victory).commands == victory_commands);
    assert(gbs::battle_rpg_outcome_script(scripted_battle, gbs::BattleRpgOutcome::Defeat).commands == defeat_commands);
    assert(gbs::battle_rpg_outcome_script(scripted_battle, gbs::BattleRpgOutcome::Escaped).commands == escape_commands);
    assert(!gbs::has_event_script(gbs::battle_rpg_outcome_script(scripted_battle, gbs::BattleRpgOutcome::InProgress)));

    gbs::EventState event_state {};
    event_state.variables[5] = 42;
    event_state.variables[gbs::event_variable_count - 1] = 905;
    locked.selected_ability = 0;
    gbs::BattleRpgSaveData save_data {};
    gbs::capture_battle_rpg_save_data(save_data, 0, locked, event_state, 1234, 7);
    gbs::BattleRpgRuntimeState restored = gbs::make_battle_rpg_runtime_state(scripted_battle);
    gbs::EventState restored_events {};
    int restored_encounter = -1;
    assert(gbs::apply_battle_rpg_save_data(scripted_project, save_data, restored_encounter, restored, restored_events));
    assert(restored_encounter == 0);
    assert(restored.outcome == gbs::BattleRpgOutcome::Victory);
    assert(restored.reward_gold == 100 && restored.reward_experience == 50);
    assert(restored_events.variables[5] == 42);
    assert(restored_events.variables[gbs::event_variable_count - 1] == 905);

    gbs::EventState transition_source {};
    gbs::init_event_state(transition_source);
    transition_source.variables[5] = 77;
    constexpr int packed_battle_target =
        (static_cast<int>(gbs::RuntimeKind::BattleRpg) << 12);
    constexpr gbs::EventCommand restart_commands[] = {
        { gbs::EventOp::WarpRuntime, static_cast<int16_t>(packed_battle_target), 0, 0 }
    };
    gbs::run_event_script(transition_source, { restart_commands, 1 });
    assert(gbs::runtime_transition_pending());

    int restarted_encounter = -1;
    gbs::BattleRpgRuntimeState restarted = gbs::make_battle_rpg_runtime_state(scripted_battle);
    restarted.outcome = gbs::BattleRpgOutcome::Defeat;
    restarted.party_hp[0] = 0;
    gbs::EventState restarted_events {};
    assert(gbs::consume_battle_rpg_runtime_transition(
        scripted_project,
        restarted_events,
        restarted_encounter,
        restarted
    ));
    assert(!gbs::runtime_transition_pending());
    assert(restarted_encounter == 0);
    assert(restarted.outcome == gbs::BattleRpgOutcome::InProgress);
    assert(restarted.party_hp[0] == scripted_battle.party[0].unit.max_hp);
    assert(restarted_events.variables[5] == 77);
    return 0;
}
