#include "gbs/luta.hpp"

namespace gbs {

const LutaBackgroundData* luta_background_for(const LutaProjectData& project, const LutaStageData& stage) {
    (void)project;
    if (stage.background_index >= 0 &&
        stage.backgrounds != nullptr &&
        static_cast<size_t>(stage.background_index) < stage.backgroundCount) {
        return &stage.backgrounds[stage.background_index];
    }
    return nullptr;
}

const MetaSprite* luta_fighter_metasprite_for(const LutaCharacter& fighter) {
    return fighter.metasprite;
}

const SpriteAnimation* luta_animation_for(const LutaAnimationSet* animation_set, LutaVisualState state) {
    if (animation_set == nullptr) return nullptr;
    switch (state) {
        case LutaVisualState::Idle: return animation_set->idle;
        case LutaVisualState::Attack: return animation_set->attack;
        case LutaVisualState::Special: return animation_set->special;
        case LutaVisualState::Guard: return animation_set->guard;
        case LutaVisualState::Hurt: return animation_set->hurt;
    }
    return nullptr;
}

const MetaSprite* luta_visual_metasprite_for(const LutaCharacter& fighter, const LutaVisualStateData& state) {
    const MetaSprite* animated = current_metasprite(state.animator);
    return animated != nullptr ? animated : fighter.metasprite;
}

void init_luta_visual_state(LutaVisualStateData& state) {
    state.state = LutaVisualState::Idle;
    init_sprite_animator(state.animator);
    state.fallback = LutaVisualFallback::None;
}

void set_luta_visual_state(
    LutaVisualStateData& state,
    const LutaAnimationSet* animation_set,
    LutaVisualState visual_state
) {
    state.state = visual_state;
    init_sprite_animator(state.animator);

    const SpriteAnimation* animation = luta_animation_for(animation_set, visual_state);
    if (animation != nullptr && is_valid_sprite_animation(*animation)) {
        play_sprite_animation(state.animator, *animation);
        state.fallback = LutaVisualFallback::None;
        return;
    }

    const SpriteAnimation* idle_animation = luta_animation_for(animation_set, LutaVisualState::Idle);
    if (visual_state != LutaVisualState::Idle &&
        idle_animation != nullptr &&
        is_valid_sprite_animation(*idle_animation)) {
        play_sprite_animation(state.animator, *idle_animation);
        state.fallback = LutaVisualFallback::IdleAnimation;
        return;
    }

    state.fallback = LutaVisualFallback::StaticMetasprite;
}

void tick_luta_visual_state(LutaVisualStateData& state, const LutaAnimationSet* animation_set) {
    const bool transient_action = state.state == LutaVisualState::Attack || state.state == LutaVisualState::Special;
    if (state.animator.animation == nullptr) {
        if (transient_action) set_luta_visual_state(state, animation_set, LutaVisualState::Idle);
        return;
    }

    update_sprite_animator(state.animator);
    if (transient_action &&
        (state.fallback == LutaVisualFallback::IdleAnimation || !state.animator.playing)) {
        set_luta_visual_state(state, animation_set, LutaVisualState::Idle);
    }
}

void sync_luta_visual_state(
    LutaVisualStateData& state,
    const LutaRuntimeState& runtime_state,
    bool player_one,
    const LutaAnimationSet* animation_set
) {
    const uint16_t hitstun = player_one ? runtime_state.p1_hitstun : runtime_state.p2_hitstun;
    const bool guarding = player_one ? runtime_state.p1_guarding : runtime_state.p2_guarding;
    if (hitstun > 0) {
        if (state.state != LutaVisualState::Hurt) {
            set_luta_visual_state(state, animation_set, LutaVisualState::Hurt);
        }
        return;
    }
    if (guarding) {
        if (state.state != LutaVisualState::Guard) {
            set_luta_visual_state(state, animation_set, LutaVisualState::Guard);
        }
        return;
    }
    if (state.state == LutaVisualState::Hurt || state.state == LutaVisualState::Guard) {
        set_luta_visual_state(state, animation_set, LutaVisualState::Idle);
    }
}

static const LutaCharacter* fighter_for(const LutaStageData* stage, bool player_one) {
    if (stage == nullptr) return nullptr;
    if (player_one) {
        return stage->p1_fighter_count > 0 && stage->p1_fighters != nullptr ? &stage->p1_fighters[0] : nullptr;
    }
    return stage->p2_fighter_count > 0 && stage->p2_fighters != nullptr ? &stage->p2_fighters[0] : nullptr;
}

static uint16_t saturating_add(uint16_t value, uint16_t amount, uint16_t maximum) {
    if (value >= maximum || amount >= maximum - value) return maximum;
    return static_cast<uint16_t>(value + amount);
}

static void reset_round(LutaRuntimeState& state, const LutaStageData& stage) {
    state.p1_hp = state.p1_max_hp;
    state.p2_hp = state.p2_max_hp;
    state.p1_super_gauge = 0;
    state.p2_super_gauge = 0;
    state.p1_guard_power = state.p1_guard_max;
    state.p2_guard_power = state.p2_guard_max;
    state.round_timer = state.round_time_frames;
    state.round_state = LutaRoundState::InProgress;
    state.p1_combo_count = 0;
    state.p2_combo_count = 0;
    state.p1_hitstun = 0;
    state.p2_hitstun = 0;
    state.p1_airborne = false;
    state.p2_airborne = false;
    state.p1_guarding = false;
    state.p2_guarding = false;
    state.p1_x = stage.player1StartX;
    state.p1_y = 80;
    state.p2_x = stage.player2StartX;
    state.p2_y = 80;
    state.p1_vertical_velocity = 0;
    state.p2_vertical_velocity = 0;
    state.p1_attack_cooldown = 0;
    state.p2_attack_cooldown = 0;
}

LutaRuntimeState make_luta_runtime_state(const LutaStageData& stage) {
    LutaRuntimeState state{};
    state.rounds_to_win = stage.roundsToWin;
    state.round_time_frames = static_cast<uint16_t>(stage.roundTime * 60u);
    state.p1_alpha_counter_enabled = state.p2_alpha_counter_enabled = stage.alphaCounterEnabled;
    state.super_gauge_max = stage.maxSuperGauge > 0 ? stage.maxSuperGauge : 100;

    const LutaCharacter* p1 = fighter_for(&stage, true);
    const LutaCharacter* p2 = fighter_for(&stage, false);
    if (!p1 && stage.characterCount >= 1 && stage.characters) p1 = &stage.characters[0];
    if (!p2 && stage.characterCount >= 2 && stage.characters) p2 = &stage.characters[1];
    if (p1) {
        state.p1_max_hp = p1->maxHp;
        state.p1_hp = p1->maxHp;
        state.p1_super_gauge = 0;
        state.p1_guard_power = p1->guardPower;
        state.p1_ism_style = stage.defaultStyle;
    } else {
        state.p1_max_hp = 100;
        state.p1_hp = 100;
        state.p1_super_gauge = 0;
        state.p1_guard_power = 50;
        state.p1_ism_style = LutaIsmStyle::AIsm;
    }

    if (p2) {
        state.p2_max_hp = p2->maxHp;
        state.p2_hp = p2->maxHp;
        state.p2_super_gauge = 0;
        state.p2_guard_power = p2->guardPower;
        state.p2_ism_style = stage.defaultStyle;
    } else {
        state.p2_max_hp = 100;
        state.p2_hp = 100;
        state.p2_super_gauge = 0;
        state.p2_guard_power = 50;
        state.p2_ism_style = LutaIsmStyle::AIsm;
    }

    state.p1_guard_max = state.p1_guard_power;
    state.p2_guard_max = state.p2_guard_power;
    state.round = 1;
    state.p1_wins = 0;
    state.p2_wins = 0;
    state.round_timer = stage.roundTime * 60;
    state.round_state = LutaRoundState::InProgress;
    state.p1_combo_count = 0;
    state.p2_combo_count = 0;
    state.p1_hitstun = 0;
    state.p2_hitstun = 0;
    state.p1_airborne = false;
    state.p2_airborne = false;
    state.p1_guarding = false;
    state.p2_guarding = false;
    state.p1_x = stage.player1StartX;
    state.p1_y = 80;
    state.p2_x = stage.player2StartX;
    state.p2_y = 80;
    state.p1_vertical_velocity = 0;
    state.p2_vertical_velocity = 0;
    state.p1_attack_cooldown = 0;
    state.p2_attack_cooldown = 0;
    state.p1_input_buffer = 0;
    state.p2_input_buffer = 0;

    return state;
}

static void apply_damage(
    LutaRuntimeState& state,
    const LutaStageData* stage,
    bool is_p1,
    int16_t damage,
    int16_t stun,
    uint16_t hitstun_frames,
    LutaAttackStrength strength
) {
    (void)stun;
    const bool guarded = is_p1 ? state.p1_guarding : state.p2_guarding;
    uint16_t* guard_power = is_p1 ? &state.p1_guard_power : &state.p2_guard_power;
    const bool chip_damage_enabled = stage == nullptr || stage->chipDamageEnabled;
    if (guarded && *guard_power > 0) {
        const uint16_t guard_cost = strength == LutaAttackStrength::Heavy ? 12 :
            (strength == LutaAttackStrength::Medium ? 8 : 4);
        const int16_t chip_damage = chip_damage_enabled ? static_cast<int16_t>(damage > 3 ? damage / 4 : 1) : 0;
        damage = chip_damage;
        *guard_power = *guard_power > guard_cost ? static_cast<uint16_t>(*guard_power - guard_cost) : 0;
        hitstun_frames = 4;
        if (*guard_power == 0) {
            if (is_p1) state.p1_guarding = false;
            else state.p2_guarding = false;
        }
    }
    if (is_p1) {
        if (state.p1_hp > damage) state.p1_hp -= damage;
        else state.p1_hp = 0;
        state.p1_hitstun = hitstun_frames;
        if (strength >= LutaAttackStrength::Medium) state.p1_combo_count++;
        else state.p1_combo_count = 0;
        const uint16_t receive_gain = stage != nullptr ? stage->superGaugeGainOnReceive : 8;
        state.p2_super_gauge = saturating_add(state.p2_super_gauge, receive_gain, state.super_gauge_max);
        if (stage != nullptr) {
            state.p1_super_gauge = saturating_add(state.p1_super_gauge, stage->superGaugeGainOnHit, state.super_gauge_max);
        }
    } else {
        if (state.p2_hp > damage) state.p2_hp -= damage;
        else state.p2_hp = 0;
        state.p2_hitstun = hitstun_frames;
        if (strength >= LutaAttackStrength::Medium) state.p2_combo_count++;
        else state.p2_combo_count = 0;
        const uint16_t receive_gain = stage != nullptr ? stage->superGaugeGainOnReceive : 8;
        state.p1_super_gauge = saturating_add(state.p1_super_gauge, receive_gain, state.super_gauge_max);
        if (stage != nullptr) {
            state.p2_super_gauge = saturating_add(state.p2_super_gauge, stage->superGaugeGainOnHit, state.super_gauge_max);
        }
    }
}

static void finish_round(LutaRuntimeState& state, const LutaStageData& stage) {
    if (state.p1_hp == state.p2_hp) {
        if (state.rounds_to_win <= 1) state.round_state = LutaRoundState::Draw;
        else {
            state.round++;
            reset_round(state, stage);
        }
        return;
    }
    const bool p1_won = state.p1_hp > state.p2_hp;
    if (p1_won) state.p1_wins++;
    else state.p2_wins++;
    const uint8_t wins = p1_won ? state.p1_wins : state.p2_wins;
    if (wins >= state.rounds_to_win) {
        state.round_state = p1_won ? LutaRoundState::P1Win : LutaRoundState::P2Win;
        return;
    }
    state.round++;
    reset_round(state, stage);
}

void tick_luta(LutaRuntimeState& state, const LutaStageData& stage) {
    if (state.round_state != LutaRoundState::InProgress) return;

    if (state.round_timer > 0) {
        state.round_timer--;
    }

    if (state.p1_hitstun > 0) state.p1_hitstun--;
    if (state.p2_hitstun > 0) state.p2_hitstun--;

    if (state.p1_attack_cooldown > 0) state.p1_attack_cooldown--;
    if (state.p2_attack_cooldown > 0) state.p2_attack_cooldown--;
    if (!state.p1_guarding) {
        state.p1_guard_power = saturating_add(state.p1_guard_power, stage.guardPowerRecovery, state.p1_guard_max);
    }
    if (!state.p2_guarding) {
        state.p2_guard_power = saturating_add(state.p2_guard_power, stage.guardPowerRecovery, state.p2_guard_max);
    }

    if (state.p1_airborne) {
        state.p1_y = static_cast<int16_t>(state.p1_y + state.p1_vertical_velocity);
        state.p1_vertical_velocity++;
        if (state.p1_y >= 80) {
            state.p1_y = 80;
            state.p1_vertical_velocity = 0;
            state.p1_airborne = false;
        }
    }
    if (state.p2_airborne) {
        state.p2_y = static_cast<int16_t>(state.p2_y + state.p2_vertical_velocity);
        state.p2_vertical_velocity++;
        if (state.p2_y >= 80) {
            state.p2_y = 80;
            state.p2_vertical_velocity = 0;
            state.p2_airborne = false;
        }
    }

    if (state.round_timer == 0) {
        finish_round(state, stage);
        return;
    }

    if (state.p1_hp == 0 && state.p2_hp == 0) {
        finish_round(state, stage);
    } else if (state.p1_hp == 0) {
        finish_round(state, stage);
    } else if (state.p2_hp == 0) {
        finish_round(state, stage);
    }
}

static void attack_luta(
    LutaRuntimeState& state,
    const LutaStageData* stage,
    bool player_one,
    LutaAttackStrength strength,
    LutaAttackType type
) {
    if (state.round_state != LutaRoundState::InProgress) return;
    if (player_one ? state.p1_hitstun > 0 || state.p1_attack_cooldown > 0 : state.p2_hitstun > 0 || state.p2_attack_cooldown > 0) return;

    int16_t damage = 0;
    int16_t stun = 0;
    uint16_t hitstun = 0;
    uint8_t recovery = 0;
    switch (strength) {
        case LutaAttackStrength::Light:
            damage = static_cast<int16_t>(4 + (type == LutaAttackType::Punch ? 1 : 0));
            stun = 8;
            hitstun = 12;
            recovery = 8;
            break;
        case LutaAttackStrength::Medium:
            damage = static_cast<int16_t>(8 + (type == LutaAttackType::Punch ? 2 : 1));
            stun = 16;
            hitstun = 20;
            recovery = 14;
            break;
        case LutaAttackStrength::Heavy:
            damage = static_cast<int16_t>(14 + (type == LutaAttackType::Punch ? 3 : 2));
            stun = 24;
            hitstun = 30;
            recovery = 22;
            break;
    }

    const LutaCharacter* attacker = fighter_for(stage, player_one);
    const LutaCharacter* defender = fighter_for(stage, !player_one);
    const int16_t attacker_x = player_one ? state.p1_x : state.p2_x;
    const int16_t defender_x = player_one ? state.p2_x : state.p1_x;
    const int16_t distance = attacker_x > defender_x
        ? static_cast<int16_t>(attacker_x - defender_x)
        : static_cast<int16_t>(defender_x - attacker_x);
    const int16_t reach = stage != nullptr
        ? static_cast<int16_t>((attacker != nullptr ? attacker->throwRange : 16) + 32)
        : 32767;
    if (distance > reach) return;

    if (attacker != nullptr && defender != nullptr) {
        damage = static_cast<int16_t>(damage + attacker->attack / 4 - defender->defense / 6);
        if (damage < 1) damage = 1;
    }
    if (player_one) state.p1_attack_cooldown = recovery;
    else state.p2_attack_cooldown = recovery;
    apply_damage(state, stage, !player_one, damage, stun, hitstun, strength);
}

void luta_p1_attack(LutaRuntimeState& state, LutaAttackStrength strength, LutaAttackType type) {
    attack_luta(state, nullptr, true, strength, type);
}

void luta_p1_attack(LutaRuntimeState& state, const LutaStageData& stage, LutaAttackStrength strength, LutaAttackType type) {
    attack_luta(state, &stage, true, strength, type);
}

void luta_p2_attack(LutaRuntimeState& state, LutaAttackStrength strength, LutaAttackType type) {
    attack_luta(state, nullptr, false, strength, type);
}

void luta_p2_attack(LutaRuntimeState& state, const LutaStageData& stage, LutaAttackStrength strength, LutaAttackType type) {
    attack_luta(state, &stage, false, strength, type);
}

static void move_luta(LutaRuntimeState& state, const LutaStageData& stage, bool player_one, int16_t direction) {
    if (state.round_state != LutaRoundState::InProgress || direction == 0) return;
    if (player_one ? state.p1_hitstun > 0 : state.p2_hitstun > 0) return;
    const LutaCharacter* fighter = fighter_for(&stage, player_one);
    const int16_t speed = static_cast<int16_t>(fighter != nullptr ? (fighter->walkSpeed < 4 ? 1 : fighter->walkSpeed / 4) : 2);
    const int16_t delta = direction < 0 ? static_cast<int16_t>(-speed) : speed;
    int16_t& x = player_one ? state.p1_x : state.p2_x;
    x = static_cast<int16_t>(x + delta);
    if (x < 16) x = 16;
    if (x > 224) x = 224;
}

void luta_p1_move(LutaRuntimeState& state, const LutaStageData& stage, int16_t direction) {
    move_luta(state, stage, true, direction);
}

void luta_p2_move(LutaRuntimeState& state, const LutaStageData& stage, int16_t direction) {
    move_luta(state, stage, false, direction);
}

static void jump_luta(LutaRuntimeState& state, const LutaStageData& stage, bool player_one) {
    if (state.round_state != LutaRoundState::InProgress) return;
    bool& airborne = player_one ? state.p1_airborne : state.p2_airborne;
    uint16_t hitstun = player_one ? state.p1_hitstun : state.p2_hitstun;
    if (airborne || hitstun > 0) return;
    const LutaCharacter* fighter = fighter_for(&stage, player_one);
    int16_t& velocity = player_one ? state.p1_vertical_velocity : state.p2_vertical_velocity;
    velocity = static_cast<int16_t>(-(fighter != nullptr && fighter->jumpSpeed > 8 ? fighter->jumpSpeed / 2 : 6));
    airborne = true;
}

void luta_p1_jump(LutaRuntimeState& state, const LutaStageData& stage) {
    jump_luta(state, stage, true);
}

void luta_p2_jump(LutaRuntimeState& state, const LutaStageData& stage) {
    jump_luta(state, stage, false);
}

void luta_p1_set_guard(LutaRuntimeState& state, bool guarding) {
    state.p1_guarding = guarding && state.p1_guard_power > 0 && state.p1_hitstun == 0;
}

void luta_p2_set_guard(LutaRuntimeState& state, bool guarding) {
    state.p2_guarding = guarding && state.p2_guard_power > 0 && state.p2_hitstun == 0;
}

void luta_p1_super(LutaRuntimeState& state) {
    if (state.round_state != LutaRoundState::InProgress) return;
    if (state.p1_super_gauge < state.super_gauge_max) return;

    state.p1_super_gauge = 0;
    apply_damage(state, nullptr, false, 25, 30, 40, LutaAttackStrength::Heavy);
}

void luta_p2_super(LutaRuntimeState& state) {
    if (state.round_state != LutaRoundState::InProgress) return;
    if (state.p2_super_gauge < state.super_gauge_max) return;

    state.p2_super_gauge = 0;
    apply_damage(state, nullptr, true, 25, 30, 40, LutaAttackStrength::Heavy);
}

void luta_p1_alpha_counter(LutaRuntimeState& state) {
    if (!state.p1_alpha_counter_enabled) return;
    if (state.round_state != LutaRoundState::InProgress) return;
    if (state.p1_super_gauge < state.super_gauge_max / 2) return;
    if (state.p1_hitstun == 0) return;

    state.p1_super_gauge -= state.super_gauge_max / 2;
    state.p1_hitstun = 0;
    apply_damage(state, nullptr, false, 8, 16, 18, LutaAttackStrength::Medium);
}

void luta_p2_alpha_counter(LutaRuntimeState& state) {
    if (!state.p2_alpha_counter_enabled) return;
    if (state.round_state != LutaRoundState::InProgress) return;
    if (state.p2_super_gauge < state.super_gauge_max / 2) return;
    if (state.p2_hitstun == 0) return;

    state.p2_super_gauge -= state.super_gauge_max / 2;
    state.p2_hitstun = 0;
    apply_damage(state, nullptr, true, 8, 16, 18, LutaAttackStrength::Medium);
}

void luta_pause(LutaRuntimeState& state) {
    if (state.round_state == LutaRoundState::InProgress) {
        state.round_state = LutaRoundState::RoundEnd;
    }
}

bool consume_luta_event_commands(const LutaProjectData& project, EventState& events,
    int& stage_index, LutaRuntimeState& state) {
    bool refresh = false;
    const auto bounded = [](int value, int maximum) {
        return value < 0 ? 0 : (value > maximum ? maximum : value);
    };
    for (size_t index = 0; index < events.luta_command_count; ++index) {
        const auto& command = events.luta_commands[index];
        const auto action = static_cast<LutaEventAction>(command.a);
        const bool p1 = command.b == 0;
        if (action >= LutaEventAction::SetSuperGauge && action <= LutaEventAction::EnableAlphaCounter &&
            command.b != 0 && command.b != 1) continue;
        auto& gauge = p1 ? state.p1_super_gauge : state.p2_super_gauge;
        auto& guard = p1 ? state.p1_guard_power : state.p2_guard_power;
        switch (action) {
        case LutaEventAction::StartMatch:
            if (command.b < 0 || static_cast<size_t>(command.b) >= project.stage_count) break;
            stage_index = command.b;
            state = make_luta_runtime_state(project.stages[stage_index]);
            events.current_room = stage_index;
            events.player_x = state.p1_x;
            events.player_y = state.p1_y;
            refresh = true;
            break;
        case LutaEventAction::EndMatch:
            if (command.b < 0 || command.b > 2) break;
            state.round_state = command.b == 0 ? LutaRoundState::P1Win :
                (command.b == 1 ? LutaRoundState::P2Win : LutaRoundState::Draw);
            if (command.b == 0) state.p1_wins = state.rounds_to_win;
            if (command.b == 1) state.p2_wins = state.rounds_to_win;
            break;
        case LutaEventAction::SetSuperGauge:
            gauge = static_cast<uint16_t>(bounded(command.c, state.super_gauge_max));
            break;
        case LutaEventAction::AddSuperGauge:
            gauge = static_cast<uint16_t>(bounded(static_cast<int>(gauge) + command.c, state.super_gauge_max));
            break;
        case LutaEventAction::SetGuardPower:
            guard = static_cast<uint16_t>(bounded(command.c, 255));
            (p1 ? state.p1_guard_max : state.p2_guard_max) = guard;
            break;
        case LutaEventAction::SetIsmStyle:
            if (command.c >= 0 && command.c <= 2)
                (p1 ? state.p1_ism_style : state.p2_ism_style) = static_cast<LutaIsmStyle>(command.c);
            break;
        case LutaEventAction::TriggerSuper:
            if (state.round_state != LutaRoundState::InProgress || gauge < state.super_gauge_max ||
                command.c < 0 || command.c > 1) break;
            gauge = 0;
            apply_damage(state, &project.stages[stage_index], !p1,
                command.c == 1 ? 40 : 25, 30, 40, LutaAttackStrength::Heavy);
            break;
        case LutaEventAction::EnableAlphaCounter:
            (p1 ? state.p1_alpha_counter_enabled : state.p2_alpha_counter_enabled) = command.c != 0;
            break;
        case LutaEventAction::SetRoundTimer:
            state.round_time_frames = static_cast<uint16_t>(command.b > 0 ? command.b : 1);
            state.round_timer = state.round_time_frames;
            break;
        case LutaEventAction::SetRoundsToWin:
            state.rounds_to_win = static_cast<uint8_t>(command.b < 1 ? 1 : (command.b > 255 ? 255 : command.b));
            break;
        }
    }
    events.luta_command_count = 0;
    return refresh;
}

void capture_luta_save_data(LutaSaveData& save_data, size_t stage_index, const LutaRuntimeState& state, const EventState& event_state, uint32_t frame_count) {
    save_data.p1_hp = state.p1_hp;
    save_data.p2_hp = state.p2_hp;
    save_data.p1_super_gauge = state.p1_super_gauge;
    save_data.p2_super_gauge = state.p2_super_gauge;
    save_data.p1_guard_power = state.p1_guard_power;
    save_data.p2_guard_power = state.p2_guard_power;
    save_data.round = state.round;
    save_data.p1_wins = state.p1_wins;
    save_data.p2_wins = state.p2_wins;
    save_data.round_timer = state.round_timer;
    save_data.round_state = static_cast<uint8_t>(state.round_state);
    save_data.p1_ism_style = static_cast<uint8_t>(state.p1_ism_style);
    save_data.p2_ism_style = static_cast<uint8_t>(state.p2_ism_style);
    save_data.p1_x = state.p1_x;
    save_data.p1_y = state.p1_y;
    save_data.p2_x = state.p2_x;
    save_data.p2_y = state.p2_y;
    save_data.p1_guarding = state.p1_guarding;
    save_data.p2_guarding = state.p2_guarding;
    save_data.frame_count = frame_count;
    save_data.current_stage = static_cast<uint16_t>(stage_index);

    for (size_t i = 0; i < 16; ++i) {
        save_data.event_state_variables[i] = event_state.variables[i];
    }
}

bool apply_luta_save_data(const LutaProjectData& project, const LutaSaveData& save_data, int& stage_index, LutaRuntimeState& state, EventState& event_state) {
    if (save_data.current_stage >= project.stage_count) return false;

    stage_index = save_data.current_stage;
    const LutaStageData& stage = project.stages[stage_index];

    state = make_luta_runtime_state(stage);

    state.p1_hp = save_data.p1_hp;
    state.p2_hp = save_data.p2_hp;
    state.p1_super_gauge = save_data.p1_super_gauge;
    state.p2_super_gauge = save_data.p2_super_gauge;
    state.p1_guard_power = save_data.p1_guard_power;
    state.p2_guard_power = save_data.p2_guard_power;
    state.round = save_data.round;
    state.p1_wins = save_data.p1_wins;
    state.p2_wins = save_data.p2_wins;
    state.round_timer = save_data.round_timer;
    state.round_state = static_cast<LutaRoundState>(save_data.round_state);
    state.p1_ism_style = static_cast<LutaIsmStyle>(save_data.p1_ism_style);
    state.p2_ism_style = static_cast<LutaIsmStyle>(save_data.p2_ism_style);
    state.p1_x = save_data.p1_x;
    state.p1_y = save_data.p1_y;
    state.p2_x = save_data.p2_x;
    state.p2_y = save_data.p2_y;
    state.p1_guarding = save_data.p1_guarding;
    state.p2_guarding = save_data.p2_guarding;

    for (size_t i = 0; i < 16; ++i) {
        event_state.variables[i] = save_data.event_state_variables[i];
    }

    return true;
}

bool consume_luta_runtime_transition(const LutaProjectData& project, EventState& event_state, int& stage_index, LutaRuntimeState& state) {
    if (event_state.variables[0] != 0x4C555441) return false;

    stage_index = static_cast<int>(event_state.variables[1]);
    if (stage_index < 0 || static_cast<size_t>(stage_index) >= project.stage_count) stage_index = 0;

    state = make_luta_runtime_state(project.stages[stage_index]);
    return true;
}

EventScript luta_outcome_script(const LutaStageData& stage, LutaRoundState round_state) {
    return round_state == LutaRoundState::P1Win ? stage.on_victory :
        (round_state == LutaRoundState::P2Win || round_state == LutaRoundState::Draw)
            ? stage.on_defeat
            : empty_event_script();
}

} // namespace gbs
