#include "gbs/battle_rpg.hpp"

namespace gbs {
namespace {

int damage_for(const BattleRpgUnitData& attacker, const BattleRpgUnitData& defender) {
    const int damage = attacker.attack - defender.defense;
    return damage > 0 ? damage : 1;
}

bool any_alive(const int* hp, int count) {
    for (int index = 0; index < count; ++index) if (hp[index] > 0) return true;
    return false;
}

int first_alive(const int* hp, int count) {
    for (int index = 0; index < count; ++index) if (hp[index] > 0) return index;
    return -1;
}

int next_alive(const int* hp, int count, int current, int direction) {
    if (count <= 0) return -1;
    const int step = direction < 0 ? -1 : 1;
    for (int offset = 0; offset < count; ++offset) {
        const int index = (current + step * (offset + 1) + count * 2) % count;
        if (hp[index] > 0) return index;
    }
    return -1;
}

int lowest_health_ratio(const int* hp, const BattleRpgParticipantData* participants, int count) {
    int selected = -1;
    for (int index = 0; index < count; ++index) {
        if (hp[index] <= 0) continue;
        if (selected < 0 || hp[index] * participants[selected].unit.max_hp < hp[selected] * participants[index].unit.max_hp) {
            selected = index;
        }
    }
    return selected;
}

int ability_index_for(const BattleRpgParticipantData& participant, BattleRpgAbilityKind kind) {
    for (int index = 0; index < participant.ability_count; ++index) {
        if (participant.abilities[index].kind == kind) return index;
    }
    return -1;
}

int ability_damage(const BattleRpgParticipantData& attacker, const BattleRpgUnitData& defender, const BattleRpgAbilityData& ability) {
    if (ability.kind != BattleRpgAbilityKind::Magic) return damage_for(attacker.unit, defender);
    const int damage = ability.power + attacker.unit.attack - (defender.defense / 2);
    return damage > 0 ? damage : 1;
}

void refresh_outcome(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter) {
    if (!any_alive(state.enemy_hp, encounter.enemy_count)) {
        state.outcome = BattleRpgOutcome::Victory;
        state.reward_gold = encounter.rewards.gold;
        state.reward_experience = encounter.rewards.experience;
    }
    else if (!any_alive(state.party_hp, encounter.party_count)) state.outcome = BattleRpgOutcome::Defeat;
}

void normalize_selections(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter) {
    if (state.selected_party < 0 || state.selected_party >= encounter.party_count || state.party_hp[state.selected_party] <= 0) {
        state.selected_party = first_alive(state.party_hp, encounter.party_count);
        state.selected_ability = 0;
    }
    if (state.selected_ally < 0 || state.selected_ally >= encounter.party_count || state.party_hp[state.selected_ally] <= 0) {
        state.selected_ally = first_alive(state.party_hp, encounter.party_count);
    }
    if (state.selected_enemy < 0 || state.selected_enemy >= encounter.enemy_count || state.enemy_hp[state.selected_enemy] <= 0) {
        state.selected_enemy = first_alive(state.enemy_hp, encounter.enemy_count);
    }
    if (state.selected_party >= 0) {
        const int ability_count = encounter.party[state.selected_party].ability_count;
        if (state.selected_ability < 0 || state.selected_ability >= ability_count) state.selected_ability = 0;
    }
}

void enemy_take_turn(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter) {
    int enemy_index = state.next_enemy_actor - 1;
    enemy_index = next_alive(state.enemy_hp, encounter.enemy_count, enemy_index, 1);
    if (enemy_index < 0) return;
    state.next_enemy_actor = (enemy_index + 1) % encounter.enemy_count;

    const BattleRpgParticipantData& enemy = encounter.enemies[enemy_index];
    const bool at_risk = state.enemy_hp[enemy_index] * 2 <= enemy.unit.max_hp;
    int ability_index = -1;
    if (at_risk) ability_index = ability_index_for(enemy, BattleRpgAbilityKind::Heal);
    if (at_risk && ability_index < 0 && !state.enemy_defending[enemy_index]) {
        ability_index = ability_index_for(enemy, BattleRpgAbilityKind::Defend);
    }
    if (ability_index < 0) ability_index = ability_index_for(enemy, BattleRpgAbilityKind::Magic);
    if (ability_index < 0) ability_index = ability_index_for(enemy, BattleRpgAbilityKind::Attack);
    if (ability_index < 0) ability_index = ability_index_for(enemy, BattleRpgAbilityKind::Defend);
    if (ability_index < 0) ability_index = ability_index_for(enemy, BattleRpgAbilityKind::Heal);
    if (ability_index < 0) return;

    const BattleRpgAbilityData& ability = enemy.abilities[ability_index];
    int target_index = enemy_index;
    if (ability.kind == BattleRpgAbilityKind::Heal) {
        target_index = lowest_health_ratio(state.enemy_hp, encounter.enemies, encounter.enemy_count);
        if (target_index >= 0) {
            state.enemy_hp[target_index] += ability.power > 0 ? ability.power : 1;
            if (state.enemy_hp[target_index] > encounter.enemies[target_index].unit.max_hp) {
                state.enemy_hp[target_index] = encounter.enemies[target_index].unit.max_hp;
            }
        }
    } else if (ability.kind == BattleRpgAbilityKind::Defend) {
        state.enemy_defending[enemy_index] = true;
    } else {
        target_index = lowest_health_ratio(state.party_hp, encounter.party, encounter.party_count);
        if (target_index >= 0) {
            int damage = ability_damage(enemy, encounter.party[target_index].unit, ability);
            if (state.party_defending[target_index]) {
                damage = (damage + 1) / 2;
                state.party_defending[target_index] = false;
            }
            state.party_hp[target_index] -= damage;
            if (state.party_hp[target_index] < 0) state.party_hp[target_index] = 0;
        }
    }
    state.last_enemy_ability = ability.kind;
    state.last_enemy_actor = enemy_index;
    state.last_enemy_target = target_index;
    state.enemy_turn_pending = false;
    state.active_time_gauge = 0;
    refresh_outcome(state, encounter);
    normalize_selections(state, encounter);
}

void complete_player_action(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter) {
    refresh_outcome(state, encounter);
    if (state.outcome == BattleRpgOutcome::InProgress) {
        state.enemy_turn_pending = true;
        state.turn_delay_remaining = encounter.config.turn_delay_frames;
    }
}

} // namespace

void select_next_battle_enemy(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int direction) {
    if (state.outcome != BattleRpgOutcome::InProgress || encounter.enemy_count <= 0) return;
    const int selected = next_alive(state.enemy_hp, encounter.enemy_count, state.selected_enemy, direction);
    if (selected >= 0) state.selected_enemy = selected;
}

void select_next_battle_party(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int direction) {
    if (state.outcome != BattleRpgOutcome::InProgress || encounter.party_count <= 0) return;
    const int selected = next_alive(state.party_hp, encounter.party_count, state.selected_party, direction);
    if (selected >= 0) {
        state.selected_party = selected;
        state.selected_ability = 0;
    }
}

void select_next_battle_ally(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int direction) {
    if (state.outcome != BattleRpgOutcome::InProgress || encounter.party_count <= 0) return;
    const int selected = next_alive(state.party_hp, encounter.party_count, state.selected_ally, direction);
    if (selected >= 0) state.selected_ally = selected;
}

void select_next_battle_ability(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int direction) {
    if (state.outcome != BattleRpgOutcome::InProgress || state.selected_party < 0 || state.selected_party >= encounter.party_count) return;
    const int count = encounter.party[state.selected_party].ability_count;
    if (count <= 0) return;
    state.selected_ability = (state.selected_ability + (direction < 0 ? -1 : 1) + count) % count;
}

bool use_battle_ability(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int party_index, int ability_index, int target_index) {
    if (state.outcome != BattleRpgOutcome::InProgress || state.enemy_turn_pending) return false;
    if (party_index < 0 || party_index >= encounter.party_count || state.party_hp[party_index] <= 0) return false;
    const BattleRpgParticipantData& participant = encounter.party[party_index];
    if (ability_index < 0 || ability_index >= participant.ability_count) return false;
    const BattleRpgAbilityData& ability = participant.abilities[ability_index];

    if (ability.kind == BattleRpgAbilityKind::Heal) {
        if (target_index < 0 || target_index >= encounter.party_count || state.party_hp[target_index] <= 0 ||
            state.party_hp[target_index] >= encounter.party[target_index].unit.max_hp) return false;
        state.party_hp[target_index] += ability.power > 0 ? ability.power : 1;
        if (state.party_hp[target_index] > encounter.party[target_index].unit.max_hp) {
            state.party_hp[target_index] = encounter.party[target_index].unit.max_hp;
        }
    } else if (ability.kind == BattleRpgAbilityKind::Defend) {
        state.party_defending[party_index] = true;
    } else {
        if (target_index < 0 || target_index >= encounter.enemy_count || state.enemy_hp[target_index] <= 0) return false;
        int damage = ability_damage(participant, encounter.enemies[target_index].unit, ability);
        if (state.enemy_defending[target_index]) {
            damage = (damage + 1) / 2;
            state.enemy_defending[target_index] = false;
        }
        state.enemy_hp[target_index] -= damage;
        if (state.enemy_hp[target_index] < 0) state.enemy_hp[target_index] = 0;
    }
    complete_player_action(state, encounter);
    normalize_selections(state, encounter);
    return true;
}

bool use_selected_battle_ability(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter) {
    normalize_selections(state, encounter);
    if (state.selected_party < 0) return false;
    const BattleRpgParticipantData& participant = encounter.party[state.selected_party];
    if (state.selected_ability < 0 || state.selected_ability >= participant.ability_count) return false;
    const int target = participant.abilities[state.selected_ability].kind == BattleRpgAbilityKind::Heal
        ? state.selected_ally
        : state.selected_enemy;
    return use_battle_ability(state, encounter, state.selected_party, state.selected_ability, target);
}

bool battle_player_attack(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter) {
    normalize_selections(state, encounter);
    const int party_index = state.selected_party;
    if (party_index < 0) return false;
    const BattleRpgParticipantData& participant = encounter.party[party_index];
    for (int ability_index = 0; ability_index < participant.ability_count; ++ability_index) {
        if (participant.abilities[ability_index].kind == BattleRpgAbilityKind::Attack) {
            return use_battle_ability(state, encounter, party_index, ability_index, state.selected_enemy);
        }
    }
    return false;
}

void tick_battle_rpg(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter) {
    if (state.outcome != BattleRpgOutcome::InProgress) return;
    if (state.enemy_turn_pending) {
        if (state.turn_delay_remaining > 0) --state.turn_delay_remaining;
        if (state.turn_delay_remaining == 0) enemy_take_turn(state, encounter);
    } else if (encounter.config.active_time_battle) {
        const int enemy_index = first_alive(state.enemy_hp, encounter.enemy_count);
        if (enemy_index < 0) return;
        state.active_time_gauge += encounter.enemies[enemy_index].unit.speed;
        if (state.active_time_gauge >= 60) enemy_take_turn(state, encounter);
    }
}

bool try_escape_battle(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter) {
    if (state.outcome != BattleRpgOutcome::InProgress || !encounter.config.escape_enabled) return false;
    state.outcome = BattleRpgOutcome::Escaped;
    return true;
}

bool consume_battle_rpg_runtime_transition(
    const BattleRpgProjectData& project,
    EventState& event_state,
    int& encounter_index,
    BattleRpgRuntimeState& runtime_state
) {
    int player_x = 0;
    int player_y = 0;
    if (!consume_runtime_transition(
            RuntimeKind::BattleRpg,
            event_state,
            encounter_index,
            player_x,
            player_y)) {
        return false;
    }
    if (encounter_index < 0 || static_cast<size_t>(encounter_index) >= project.encounter_count) {
        encounter_index = project.initial_encounter;
    }
    runtime_state = make_battle_rpg_runtime_state(project.encounters[encounter_index]);
    return true;
}

} // namespace gbs
