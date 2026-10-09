#pragma once
#include <cstdint>
#include <cstddef>
#include "engine.hpp"
#include "animation.hpp"
#include "dialogue.hpp"
#include "event.hpp"
#include "render.hpp"
#include "resource_manager.hpp"
#include "save.hpp"

namespace gbs {

struct EventState;
struct MetaSprite;
struct ResourceBankGroup;
struct EventScript;

enum class LutaIsmStyle : uint8_t {
    AIsm = 0,
    XIsm = 1,
    VIsm = 2
};

enum class LutaRoundState : uint8_t {
    InProgress = 0,
    RoundEnd = 1,
    MatchEnd = 2,
    P1Win = 3,
    P2Win = 4,
    Draw = 5
};

enum class LutaAttackStrength : uint8_t {
    Light = 0,
    Medium = 1,
    Heavy = 2
};

enum class LutaAttackType : uint8_t {
    Punch = 0,
    Kick = 1
};

enum class LutaVisualState : uint8_t {
    Idle = 0,
    Attack = 1,
    Special = 2,
    Guard = 3,
    Hurt = 4
};

enum class LutaVisualFallback : uint8_t {
    None = 0,
    IdleAnimation = 1,
    StaticMetasprite = 2
};

struct LutaAnimationSet {
    const SpriteAnimation* idle;
    const SpriteAnimation* attack;
    const SpriteAnimation* special;
    const SpriteAnimation* guard;
    const SpriteAnimation* hurt;
};

struct LutaVisualStateData {
    LutaVisualState state;
    SpriteAnimatorState animator;
    LutaVisualFallback fallback;
};

struct LutaSpecialMove {
    const char* id;
    const char* name;
    const char* input;
    const uint8_t* buttonSequence;
    size_t buttonSequenceLength;
    uint8_t strength;
    uint8_t superLevel;
    uint16_t startupFrames;
    uint16_t activeFrames;
    uint16_t recoveryFrames;
    int16_t damage;
    int16_t stun;
    const char* description;
};

struct LutaCharacter {
    const char* id;
    const char* name;
    const char* portraitFront;
    const char* portraitBack;
    const char* spriteFront;
    const char* spriteBack;
    uint16_t maxHp;
    uint16_t attack;
    uint16_t defense;
    uint16_t walkSpeed;
    uint16_t jumpSpeed;
    uint16_t weight;
    uint16_t guardPower;
    uint16_t superGaugeMax;
    const LutaSpecialMove* specialMoves;
    size_t specialMoveCount;
    uint16_t throwRange;
    const char* description;
    const MetaSprite* metasprite = nullptr;
    const LutaAnimationSet* animation_set = nullptr;
};

using LutaFighterData = LutaCharacter;

struct LutaBackgroundData {
    uint16_t backdrop_color;
    gbs::BackgroundLayer layer;
    gbs::TileMapAsset tilemap;
};

struct LutaStageData {
    const char* id;
    uint16_t roundTime;
    uint8_t roundsToWin;
    uint16_t maxSuperGauge;
    uint8_t superGaugeGainOnHit;
    uint8_t superGaugeGainOnReceive;
    uint8_t guardPowerRecovery;
    bool chipDamageEnabled;
    bool airBlockingEnabled;
    bool alphaCounterEnabled;
    uint8_t throwEscapeWindow;
    uint8_t parryWindow;
    float hitstunDecay;
    uint8_t comboLimit;
    uint16_t vismCustomComboGauge;
    LutaIsmStyle defaultStyle;
    const char* stageId;
    uint16_t player1StartX;
    uint16_t player2StartX;
    const LutaCharacter* characters;
    size_t characterCount;
    const LutaFighterData* p1_fighters;
    size_t p1_fighter_count;
    const LutaFighterData* p2_fighters;
    size_t p2_fighter_count;
    const LutaSpecialMove* sharedSpecialMoves;
    size_t sharedSpecialMoveCount;
    const LutaBackgroundData* backgrounds;
    size_t backgroundCount;
    EventScript on_enter = empty_event_script();
    EventScript on_victory = empty_event_script();
    EventScript on_defeat = empty_event_script();
    int background_index = -1;
    const char* resource_bank_group_name = nullptr;
};

struct LutaProjectData {
    const LutaStageData* stages;
    size_t stage_count;
    size_t initial_stage;
    const gbs::ResourceBankGroup* resource_bank_groups;
    size_t resource_bank_group_count;
    const gbs::ResourceBankUploadSource* resource_bank_upload_sources;
    size_t resource_bank_upload_source_count;
    const gbs::PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const gbs::PaletteAsset* obj_palettes;
    size_t obj_palette_count;
    const gbs::TileAsset* tile_assets;
    size_t tile_asset_count;
    const gbs::SfxAsset* sfx_assets;
    size_t sfx_asset_count;
    const gbs::MusicAsset* music_assets;
    size_t music_asset_count;
    const gbs::PcmAsset* pcm_assets;
    size_t pcm_asset_count;
    const gbs::TrackerAsset* tracker_assets;
    size_t tracker_asset_count;
    const gbs::DialogueLine* dialogue_lines;
    size_t dialogue_line_count;
    const gbs::SaveBank* save_bank;
    bool save_enabled;
    bool save_autosave;
    const LutaBackgroundData* hud;
};

struct LutaRuntimeState {
    uint16_t p1_hp;
    uint16_t p2_hp;
    uint16_t p1_max_hp;
    uint16_t p2_max_hp;
    uint16_t p1_super_gauge;
    uint16_t p2_super_gauge;
    uint16_t super_gauge_max;
    uint16_t p1_guard_power;
    uint16_t p2_guard_power;
    uint16_t p1_guard_max;
    uint16_t p2_guard_max;
    uint8_t rounds_to_win;
    uint16_t round_time_frames;
    bool p1_alpha_counter_enabled;
    bool p2_alpha_counter_enabled;
    uint8_t round;
    uint8_t p1_wins;
    uint8_t p2_wins;
    uint16_t round_timer;
    LutaRoundState round_state;
    LutaIsmStyle p1_ism_style;
    LutaIsmStyle p2_ism_style;
    uint8_t p1_combo_count;
    uint8_t p2_combo_count;
    uint16_t p1_hitstun;
    uint16_t p2_hitstun;
    bool p1_airborne;
    bool p2_airborne;
    bool p1_guarding;
    bool p2_guarding;
    int16_t p1_x;
    int16_t p1_y;
    int16_t p2_x;
    int16_t p2_y;
    int16_t p1_vertical_velocity;
    int16_t p2_vertical_velocity;
    uint8_t p1_attack_cooldown;
    uint8_t p2_attack_cooldown;
    uint8_t p1_input_buffer;
    uint8_t p2_input_buffer;
};

struct LutaSaveData {
    uint16_t p1_hp;
    uint16_t p2_hp;
    uint16_t p1_super_gauge;
    uint16_t p2_super_gauge;
    uint16_t p1_guard_power;
    uint16_t p2_guard_power;
    uint8_t round;
    uint8_t p1_wins;
    uint8_t p2_wins;
    uint16_t round_timer;
    uint8_t round_state;
    uint8_t p1_ism_style;
    uint8_t p2_ism_style;
    int16_t p1_x;
    int16_t p1_y;
    int16_t p2_x;
    int16_t p2_y;
    bool p1_guarding;
    bool p2_guarding;
    uint32_t frame_count;
    uint16_t current_stage;
    uint8_t event_state_variables[16];
};

struct LutaSavePayload {
    LutaRuntimeState runtime_state;
};

const LutaBackgroundData* luta_background_for(const LutaProjectData& project, const LutaStageData& stage);
const gbs::MetaSprite* luta_fighter_metasprite_for(const LutaCharacter& fighter);
const SpriteAnimation* luta_animation_for(const LutaAnimationSet* animation_set, LutaVisualState state);
const MetaSprite* luta_visual_metasprite_for(const LutaCharacter& fighter, const LutaVisualStateData& state);

constexpr int find_luta_resource_bank_group_index(
    const LutaProjectData& project,
    const char* name
) {
    return find_resource_bank_group_index(
        project.resource_bank_groups,
        project.resource_bank_group_count,
        name
    );
}

constexpr ResourceBankGroup resource_bank_group_from_luta_stage(
    const LutaProjectData& project,
    const LutaStageData& stage
) {
    return resource_bank_group_by_name(
        project.resource_bank_groups,
        project.resource_bank_group_count,
        stage.resource_bank_group_name
    );
}

LutaRuntimeState make_luta_runtime_state(const LutaStageData& stage);

void init_luta_visual_state(LutaVisualStateData& state);
void set_luta_visual_state(LutaVisualStateData& state, const LutaAnimationSet* animation_set, LutaVisualState visual_state);
void tick_luta_visual_state(LutaVisualStateData& state, const LutaAnimationSet* animation_set);
void sync_luta_visual_state(LutaVisualStateData& state, const LutaRuntimeState& runtime_state, bool player_one, const LutaAnimationSet* animation_set);

void tick_luta(LutaRuntimeState& state, const LutaStageData& stage);

void luta_p1_attack(LutaRuntimeState& state, LutaAttackStrength strength, LutaAttackType type);
void luta_p1_attack(LutaRuntimeState& state, const LutaStageData& stage, LutaAttackStrength strength, LutaAttackType type);
void luta_p2_attack(LutaRuntimeState& state, LutaAttackStrength strength, LutaAttackType type);
void luta_p2_attack(LutaRuntimeState& state, const LutaStageData& stage, LutaAttackStrength strength, LutaAttackType type);
void luta_p1_move(LutaRuntimeState& state, const LutaStageData& stage, int16_t direction);
void luta_p2_move(LutaRuntimeState& state, const LutaStageData& stage, int16_t direction);
void luta_p1_jump(LutaRuntimeState& state, const LutaStageData& stage);
void luta_p2_jump(LutaRuntimeState& state, const LutaStageData& stage);
void luta_p1_set_guard(LutaRuntimeState& state, bool guarding);
void luta_p2_set_guard(LutaRuntimeState& state, bool guarding);
void luta_p1_super(LutaRuntimeState& state);
void luta_p2_super(LutaRuntimeState& state);
void luta_p1_alpha_counter(LutaRuntimeState& state);
void luta_p2_alpha_counter(LutaRuntimeState& state);
void luta_pause(LutaRuntimeState& state);
// Consumes ordered commands; true requests a scene visual refresh after StartMatch.
bool consume_luta_event_commands(const LutaProjectData& project, EventState& events,
    int& stage_index, LutaRuntimeState& state);

void capture_luta_save_data(LutaSaveData& save_data, size_t stage_index, const LutaRuntimeState& state, const gbs::EventState& event_state, uint32_t frame_count);
bool apply_luta_save_data(const LutaProjectData& project, const LutaSaveData& save_data, int& stage_index, LutaRuntimeState& state, gbs::EventState& event_state);

bool consume_luta_runtime_transition(const LutaProjectData& project, gbs::EventState& event_state, int& stage_index, LutaRuntimeState& state);
gbs::EventScript luta_outcome_script(const LutaStageData& stage, LutaRoundState round_state);

constexpr bool is_valid_luta_project_data(const LutaProjectData& project) {
    if (project.stages == nullptr || project.stage_count == 0 || project.initial_stage >= project.stage_count) {
        return false;
    }
    for (size_t index = 0; index < project.stage_count; ++index) {
        const LutaStageData& stage = project.stages[index];
        if (stage.id == nullptr || stage.roundTime == 0 || stage.roundsToWin == 0 ||
            stage.characters == nullptr || stage.characterCount < 2 ||
            stage.p1_fighters == nullptr || stage.p1_fighter_count == 0 ||
            stage.p2_fighters == nullptr || stage.p2_fighter_count == 0 ||
            (stage.resource_bank_group_name != nullptr &&
                find_luta_resource_bank_group_index(project, stage.resource_bank_group_name) < 0)) {
            return false;
        }
    }
    return true;
}

inline bool capture_luta_universal_save_data(
    UniversalSaveData& save_data,
    int room_index,
    const LutaRuntimeState& runtime_state,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    static_assert(
        sizeof(LutaSavePayload) <= universal_save_payload_capacity,
        "luta save payload exceeds the universal envelope"
    );
    const LutaSavePayload payload { runtime_state };
    return make_universal_save_data(
        save_data,
        UniversalSaveRuntime::Luta,
        room_index,
        runtime_state.p1_x,
        runtime_state.p1_y,
        0,
        0,
        event_state.variables,
        universal_save_variable_count,
        event_state.inventory,
        universal_save_inventory_count,
        event_state.equipped_items,
        universal_save_equipment_slot_count,
        play_time_frames,
        flags,
        &payload,
        sizeof(payload),
        event_state.text_variables,
        text_variable_count
    );
}

inline bool apply_luta_universal_save_data(
    const UniversalSaveData& save_data,
    int& room_index,
    LutaRuntimeState& runtime_state,
    EventState& event_state
) {
    if (!is_valid_universal_save_data(save_data) ||
        save_data.runtime != UniversalSaveRuntime::Luta) {
        return false;
    }
    LutaSavePayload payload {};
    if (!read_universal_save_payload(
            save_data,
            UniversalSaveRuntime::Luta,
            &payload,
            sizeof(payload))) {
        return false;
    }
    if (!read_universal_save_common_state(
            save_data,
            event_state.variables,
            universal_save_variable_count,
            event_state.inventory,
            universal_save_inventory_count,
            event_state.equipped_items,
            universal_save_equipment_slot_count,
            event_state.text_variables,
            text_variable_count)) {
        return false;
    }
    room_index = save_data.room_index;
    runtime_state = payload.runtime_state;
    event_state.current_room = room_index;
    event_state.player_x = runtime_state.p1_x;
    event_state.player_y = runtime_state.p1_y;
    return true;
}

} // namespace gbs
