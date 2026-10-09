#pragma once

#include <stddef.h>
#include <stdint.h>

#include "gbs/audio.hpp"
#include "gbs/assets.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"

namespace gbs {

constexpr int BattleRpgMaxParty = 4;
constexpr int BattleRpgMaxEnemies = 8;

struct BattleRpgConfig {
    int max_party_size;
    int max_enemies;
    int turn_delay_frames;
    bool active_time_battle;
    bool escape_enabled;
};

struct BattleRpgUnitData {
    int max_hp;
    int attack;
    int defense;
    int speed;
};

enum class BattleRpgAbilityKind : uint8_t { Attack, Magic, Heal, Defend };

struct BattleRpgAbilityData {
    BattleRpgAbilityKind kind;
    int power;
};

struct BattleRpgParticipantData {
    const char* name;
    BattleRpgUnitData unit;
    const BattleRpgAbilityData* abilities;
    int ability_count;
    const MetaSprite* metasprite = nullptr;
    uint8_t sprite_scale = 1;
};

struct BattleRpgBackgroundData {
    const char* name;
    BackgroundLayer layer;
    TileMapAsset tilemap;
    uint16_t backdrop_color;
};

struct BattleRpgRewards {
    int gold;
    int experience;
};

struct BattleRpgEncounterData {
    const char* name;
    BattleRpgConfig config;
    const BattleRpgParticipantData* party;
    int party_count;
    const BattleRpgParticipantData* enemies;
    int enemy_count;
    BattleRpgRewards rewards;
    EventScript on_enter = empty_event_script();
    EventScript on_victory = empty_event_script();
    EventScript on_defeat = empty_event_script();
    EventScript on_escape = empty_event_script();
    int background_index = -1;
    const char* resource_bank_group_name = nullptr;
};

struct BattleRpgProjectData {
    const BattleRpgEncounterData* encounters;
    size_t encounter_count;
    int initial_encounter;
    const DialogueLine* dialogue_lines = nullptr;
    size_t dialogue_line_count = 0;
    const SfxAsset* sfx_assets = nullptr;
    size_t sfx_asset_count = 0;
    const MusicAsset* music_assets = nullptr;
    size_t music_asset_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
    const PaletteAsset* bg_palettes = nullptr;
    size_t bg_palette_count = 0;
    const PaletteAsset* obj_palettes = nullptr;
    size_t obj_palette_count = 0;
    const TileAsset* tile_assets = nullptr;
    size_t tile_asset_count = 0;
    const BattleRpgBackgroundData* backgrounds = nullptr;
    size_t background_count = 0;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
};

enum class BattleRpgOutcome : uint8_t { InProgress, Victory, Defeat, Escaped };

struct BattleRpgRuntimeState {
    int party_hp[BattleRpgMaxParty];
    int enemy_hp[BattleRpgMaxEnemies];
    bool party_defending[BattleRpgMaxParty];
    bool enemy_defending[BattleRpgMaxEnemies];
    int selected_party;
    int selected_ally;
    int selected_enemy;
    int selected_ability;
    int next_enemy_actor;
    int turn_delay_remaining;
    int active_time_gauge;
    bool enemy_turn_pending;
    BattleRpgAbilityKind last_enemy_ability;
    int last_enemy_actor;
    int last_enemy_target;
    int reward_gold;
    int reward_experience;
    BattleRpgOutcome outcome;
};

struct BattleRpgSaveData {
    uint16_t encounter_index;
    BattleRpgRuntimeState runtime_state;
    int32_t variables[event_variable_count];
    uint32_t play_time_frames;
    uint16_t flags;
};

constexpr bool is_valid_battle_rpg_config(const BattleRpgConfig& config) {
    return config.max_party_size > 0 && config.max_party_size <= BattleRpgMaxParty &&
        config.max_enemies > 0 && config.max_enemies <= BattleRpgMaxEnemies &&
        config.turn_delay_frames > 0;
}

constexpr bool is_valid_battle_rpg_unit(const BattleRpgUnitData& unit) {
    return unit.max_hp > 0 && unit.attack > 0 && unit.defense >= 0 && unit.speed > 0;
}

constexpr bool is_valid_battle_rpg_participant(const BattleRpgParticipantData& participant) {
    if (participant.name == nullptr || !is_valid_battle_rpg_unit(participant.unit) ||
        participant.abilities == nullptr || participant.ability_count <= 0 || participant.ability_count > 4 ||
        participant.sprite_scale < 1 || participant.sprite_scale > 2) return false;
    for (int index = 0; index < participant.ability_count; ++index) {
        const BattleRpgAbilityData& ability = participant.abilities[index];
        if (ability.kind < BattleRpgAbilityKind::Attack || ability.kind > BattleRpgAbilityKind::Defend || ability.power < 0) return false;
    }
    return true;
}

constexpr bool is_valid_battle_rpg_encounter(const BattleRpgEncounterData& encounter) {
    const bool valid = encounter.name != nullptr && is_valid_battle_rpg_config(encounter.config) &&
        encounter.party_count > 0 && encounter.party_count <= encounter.config.max_party_size &&
        encounter.enemy_count > 0 && encounter.enemy_count <= encounter.config.max_enemies &&
        encounter.party != nullptr && encounter.enemies != nullptr &&
        encounter.rewards.gold >= 0 && encounter.rewards.experience >= 0;
    if (!valid) return false;
    for (int index = 0; index < encounter.party_count; ++index) {
        if (!is_valid_battle_rpg_participant(encounter.party[index])) return false;
    }
    for (int index = 0; index < encounter.enemy_count; ++index) {
        if (!is_valid_battle_rpg_participant(encounter.enemies[index])) return false;
    }
    return true;
}

constexpr bool is_valid_battle_rpg_project_data(const BattleRpgProjectData& project) {
    if (project.encounters == nullptr || project.encounter_count == 0 || project.initial_encounter < 0 ||
        static_cast<size_t>(project.initial_encounter) >= project.encounter_count) return false;
    for (size_t index = 0; index < project.encounter_count; ++index) {
        if (!is_valid_battle_rpg_encounter(project.encounters[index])) return false;
    }
    return true;
}

constexpr const BattleRpgBackgroundData* battle_rpg_background_for(
    const BattleRpgProjectData& project,
    const BattleRpgEncounterData& encounter
) {
    return encounter.background_index >= 0 &&
            project.backgrounds != nullptr &&
            static_cast<size_t>(encounter.background_index) < project.background_count
        ? &project.backgrounds[encounter.background_index]
        : nullptr;
}

constexpr const MetaSprite* battle_rpg_participant_metasprite_for(
    const BattleRpgParticipantData& participant
) {
    return participant.metasprite;
}

constexpr ResourceBankBatch resource_bank_batch_from_battle_rpg_project(
    const BattleRpgProjectData& project
) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_battle_rpg_project(
    const BattleRpgProjectData& project,
    size_t group_index
) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_battle_rpg_resource_bank_group_index(
    const BattleRpgProjectData& project,
    const char* name
) {
    return find_resource_bank_group_index(
        project.resource_bank_groups,
        project.resource_bank_group_count,
        name
    );
}

constexpr ResourceBankGroup resource_bank_group_from_battle_rpg_encounter(
    const BattleRpgProjectData& project,
    const BattleRpgEncounterData& encounter
) {
    const int index = find_battle_rpg_resource_bank_group_index(
        project,
        encounter.resource_bank_group_name
    );
    return index >= 0
        ? resource_bank_group_from_battle_rpg_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr BattleRpgRuntimeState make_battle_rpg_runtime_state(const BattleRpgEncounterData& encounter) {
    BattleRpgRuntimeState state {};
    state.last_enemy_actor = -1;
    state.last_enemy_target = -1;
    state.outcome = BattleRpgOutcome::InProgress;
    for (int index = 0; index < BattleRpgMaxParty; ++index) {
        state.party_hp[index] = index < encounter.party_count ? encounter.party[index].unit.max_hp : 0;
    }
    for (int index = 0; index < BattleRpgMaxEnemies; ++index) {
        state.enemy_hp[index] = index < encounter.enemy_count ? encounter.enemies[index].unit.max_hp : 0;
    }
    return state;
}

constexpr EventScript battle_rpg_outcome_script(
    const BattleRpgEncounterData& encounter,
    BattleRpgOutcome outcome
) {
    return outcome == BattleRpgOutcome::Victory ? encounter.on_victory :
        outcome == BattleRpgOutcome::Defeat ? encounter.on_defeat :
        outcome == BattleRpgOutcome::Escaped ? encounter.on_escape :
        empty_event_script();
}

constexpr bool is_valid_battle_rpg_save_data(
    const BattleRpgProjectData& project,
    const BattleRpgSaveData& save_data
) {
    return save_data.encounter_index < project.encounter_count &&
        save_data.runtime_state.outcome >= BattleRpgOutcome::InProgress &&
        save_data.runtime_state.outcome <= BattleRpgOutcome::Escaped;
}

inline void capture_battle_rpg_save_data(
    BattleRpgSaveData& save_data,
    int encounter_index,
    const BattleRpgRuntimeState& runtime_state,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    save_data.encounter_index = static_cast<uint16_t>(encounter_index < 0 ? 0 : encounter_index);
    save_data.runtime_state = runtime_state;
    for (size_t index = 0; index < event_variable_count; ++index) {
        save_data.variables[index] = event_state.variables[index];
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
}

inline bool apply_battle_rpg_save_data(
    const BattleRpgProjectData& project,
    const BattleRpgSaveData& save_data,
    int& encounter_index,
    BattleRpgRuntimeState& runtime_state,
    EventState& event_state
) {
    if (!is_valid_battle_rpg_save_data(project, save_data)) {
        return false;
    }
    encounter_index = save_data.encounter_index;
    runtime_state = save_data.runtime_state;
    for (size_t index = 0; index < event_variable_count; ++index) {
        event_state.variables[index] = save_data.variables[index];
    }
    return true;
}

void select_next_battle_enemy(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int direction);
void select_next_battle_party(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int direction);
void select_next_battle_ally(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int direction);
void select_next_battle_ability(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int direction);
bool battle_player_attack(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter);
bool use_battle_ability(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter, int party_index, int ability_index, int target_index);
bool use_selected_battle_ability(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter);
void tick_battle_rpg(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter);
bool try_escape_battle(BattleRpgRuntimeState& state, const BattleRpgEncounterData& encounter);
bool consume_battle_rpg_runtime_transition(
    const BattleRpgProjectData& project,
    EventState& event_state,
    int& encounter_index,
    BattleRpgRuntimeState& runtime_state
);

} // namespace gbs
