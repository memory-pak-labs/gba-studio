#include "gbs/luta.hpp"

#include <cassert>
#include <cstdlib>
#include <initializer_list>

namespace {

gbs::LutaStageData make_stage(gbs::LutaCharacter* characters) {
    gbs::LutaStageData stage{};
    stage.id = "arena";
    stage.roundTime = 99;
    stage.roundsToWin = 2;
    stage.maxSuperGauge = 100;
    stage.superGaugeGainOnHit = 8;
    stage.superGaugeGainOnReceive = 4;
    stage.guardPowerRecovery = 2;
    stage.chipDamageEnabled = true;
    stage.airBlockingEnabled = true;
    stage.alphaCounterEnabled = true;
    stage.throwEscapeWindow = 8;
    stage.parryWindow = 4;
    stage.hitstunDecay = 0.85f;
    stage.comboLimit = 60;
    stage.vismCustomComboGauge = 100;
    stage.defaultStyle = gbs::LutaIsmStyle::AIsm;
    stage.stageId = "arena";
    stage.player1StartX = 80;
    stage.player2StartX = 200;
    stage.characters = characters;
    stage.characterCount = 2;
    stage.p1_fighters = characters;
    stage.p1_fighter_count = 1;
    stage.p2_fighters = characters + 1;
    stage.p2_fighter_count = 1;
    return stage;
}

void test_player_movement_jump_and_guard() {
    gbs::LutaCharacter characters[2]{};
    characters[0].id = "p1";
    characters[0].name = "Nara";
    characters[0].maxHp = 100;
    characters[0].attack = 14;
    characters[0].defense = 10;
    characters[0].walkSpeed = 10;
    characters[0].guardPower = 48;
    characters[0].throwRange = 16;
    characters[1] = characters[0];
    characters[1].id = "p2";
    characters[1].name = "Rival";

    const gbs::LutaStageData stage = make_stage(characters);
    gbs::LutaRuntimeState state = gbs::make_luta_runtime_state(stage);
    assert(state.p1_x == 80);
    assert(state.p2_x == 200);

    gbs::luta_p1_move(state, stage, 1);
    assert(state.p1_x > 80);
    gbs::luta_p1_jump(state, stage);
    assert(state.p1_airborne);
    const int16_t jump_y = state.p1_y;
    gbs::tick_luta(state, stage);
    assert(state.p1_y != jump_y);

    const uint16_t hp_before_range_test = state.p2_hp;
    gbs::luta_p1_attack(state, stage, gbs::LutaAttackStrength::Light, gbs::LutaAttackType::Punch);
    assert(state.p2_hp == hp_before_range_test);
    for (int frame = 0; frame < 8; ++frame) gbs::tick_luta(state, stage);

    while (state.p1_x + 48 < state.p2_x) {
        gbs::luta_p1_move(state, stage, 1);
    }
    gbs::luta_p2_set_guard(state, true);
    const uint16_t guard_before_hit = state.p2_guard_power;
    const uint16_t hp_before_guarded_hit = state.p2_hp;
    gbs::luta_p1_attack(state, stage, gbs::LutaAttackStrength::Medium, gbs::LutaAttackType::Punch);
    assert(state.p2_guarding);
    assert(state.p2_guard_power < guard_before_hit);
    assert(state.p2_hp < hp_before_guarded_hit);
}

void test_round_progression() {
    gbs::LutaCharacter characters[2]{};
    for (gbs::LutaCharacter& character : characters) {
        character.maxHp = 100;
        character.guardPower = 48;
        character.throwRange = 16;
    }
    const gbs::LutaStageData stage = make_stage(characters);
    gbs::LutaRuntimeState state = gbs::make_luta_runtime_state(stage);

    state.p2_hp = 0;
    gbs::tick_luta(state, stage);
    assert(state.round_state == gbs::LutaRoundState::InProgress);
    assert(state.p1_wins == 1);
    assert(state.round == 2);
    assert(state.p1_hp == state.p1_max_hp);
    assert(state.p2_hp == state.p2_max_hp);

    state.p2_hp = 0;
    gbs::tick_luta(state, stage);
    assert(state.round_state == gbs::LutaRoundState::P1Win);
    assert(state.p1_wins == 2);
}

void test_visual_state_animation_contract() {
    const gbs::MetaSpritePart static_parts[] = {
        { 0, 0, 1, 0, false, false }
    };
    const gbs::MetaSpritePart idle_parts[] = {
        { 0, 0, 2, 0, false, false }
    };
    const gbs::MetaSpritePart attack_first_parts[] = {
        { 0, 0, 3, 0, false, false }
    };
    const gbs::MetaSpritePart attack_second_parts[] = {
        { 0, 0, 4, 0, false, false }
    };
    const gbs::MetaSpritePart guard_parts[] = {
        { 0, 0, 5, 0, false, false }
    };
    const gbs::MetaSpritePart hurt_parts[] = {
        { 0, 0, 6, 0, false, false }
    };
    const gbs::SpriteAnimationFrame idle_frames[] = {
        { gbs::MetaSprite { idle_parts, 1 }, 2 }
    };
    const gbs::SpriteAnimationFrame attack_frames[] = {
        { gbs::MetaSprite { attack_first_parts, 1 }, 1 },
        { gbs::MetaSprite { attack_second_parts, 1 }, 1 }
    };
    const gbs::SpriteAnimationFrame guard_frames[] = {
        { gbs::MetaSprite { guard_parts, 1 }, 1 }
    };
    const gbs::SpriteAnimationFrame hurt_frames[] = {
        { gbs::MetaSprite { hurt_parts, 1 }, 1 }
    };
    const gbs::SpriteAnimation idle { idle_frames, 1, true };
    const gbs::SpriteAnimation attack { attack_frames, 2, false };
    const gbs::SpriteAnimation guard { guard_frames, 1, true };
    const gbs::SpriteAnimation hurt { hurt_frames, 1, true };
    const gbs::LutaAnimationSet animation_set {
        &idle,
        &attack,
        nullptr,
        &guard,
        &hurt
    };
    const gbs::MetaSprite static_metasprite { static_parts, 1 };
    gbs::LutaCharacter fighter{};
    fighter.metasprite = &static_metasprite;
    fighter.animation_set = &animation_set;

    gbs::LutaVisualStateData visual{};
    gbs::init_luta_visual_state(visual);
    assert(visual.state == gbs::LutaVisualState::Idle);
    assert(visual.fallback == gbs::LutaVisualFallback::None);

    gbs::set_luta_visual_state(visual, fighter.animation_set, gbs::LutaVisualState::Attack);
    assert(visual.state == gbs::LutaVisualState::Attack);
    assert(visual.fallback == gbs::LutaVisualFallback::None);
    assert(gbs::luta_visual_metasprite_for(fighter, visual)->parts[0].tile_index == 3);
    gbs::tick_luta_visual_state(visual, fighter.animation_set);
    assert(gbs::luta_visual_metasprite_for(fighter, visual)->parts[0].tile_index == 4);
    gbs::tick_luta_visual_state(visual, fighter.animation_set);
    assert(visual.state == gbs::LutaVisualState::Idle);
    assert(gbs::luta_visual_metasprite_for(fighter, visual)->parts[0].tile_index == 2);

    gbs::set_luta_visual_state(visual, fighter.animation_set, gbs::LutaVisualState::Special);
    assert(visual.fallback == gbs::LutaVisualFallback::IdleAnimation);
    assert(gbs::luta_visual_metasprite_for(fighter, visual)->parts[0].tile_index == 2);
    gbs::tick_luta_visual_state(visual, fighter.animation_set);
    assert(visual.state == gbs::LutaVisualState::Idle);

    gbs::set_luta_visual_state(visual, fighter.animation_set, gbs::LutaVisualState::Guard);
    assert(visual.state == gbs::LutaVisualState::Guard);
    gbs::LutaStageData stage = make_stage(&fighter);
    gbs::LutaRuntimeState runtime = gbs::make_luta_runtime_state(stage);
    runtime.p1_guarding = true;
    gbs::sync_luta_visual_state(visual, runtime, true, fighter.animation_set);
    assert(visual.state == gbs::LutaVisualState::Guard);
    runtime.p1_hitstun = 4;
    gbs::sync_luta_visual_state(visual, runtime, true, fighter.animation_set);
    assert(visual.state == gbs::LutaVisualState::Hurt);
    runtime.p1_hitstun = 0;
    runtime.p1_guarding = false;
    gbs::sync_luta_visual_state(visual, runtime, true, fighter.animation_set);
    assert(visual.state == gbs::LutaVisualState::Idle);

    gbs::LutaCharacter fallback_fighter{};
    fallback_fighter.metasprite = &static_metasprite;
    gbs::set_luta_visual_state(visual, nullptr, gbs::LutaVisualState::Special);
    assert(visual.fallback == gbs::LutaVisualFallback::StaticMetasprite);
    assert(gbs::luta_visual_metasprite_for(fallback_fighter, visual) == &static_metasprite);
}

} // namespace

void test_authored_luta_events() {
    gbs::LutaCharacter fighters[2]{};
    fighters[0].maxHp = fighters[1].maxHp = 100;
    fighters[0].guardPower = fighters[1].guardPower = 48;
    gbs::LutaStageData stages[] = { make_stage(fighters), make_stage(fighters) };
    stages[1].roundTime = 30;
    gbs::LutaProjectData project{};
    project.stages = stages;
    project.stage_count = 2;
    int stage_index = 0;
    auto runtime = gbs::make_luta_runtime_state(stages[0]);
    gbs::EventState events{};
    gbs::init_event_state(events);
    const auto apply = [&](gbs::LutaEventAction action, int target, int value = 0) {
        const gbs::EventCommand command{gbs::EventOp::LutaControl,
            static_cast<int16_t>(action), static_cast<int16_t>(target), static_cast<int16_t>(value)};
        gbs::run_event_script(events, &command, 1);
        return gbs::consume_luta_event_commands(project, events, stage_index, runtime);
    };
    assert(apply(gbs::LutaEventAction::StartMatch, 1));
    assert(stage_index == 1 && runtime.round_timer == 1800 && runtime.p1_hp == 100);
    apply(gbs::LutaEventAction::SetSuperGauge, 0, 500);
    assert(runtime.p1_super_gauge == 100);
    apply(gbs::LutaEventAction::AddSuperGauge, 0, -25);
    assert(runtime.p1_super_gauge == 75);
    apply(gbs::LutaEventAction::SetGuardPower, 1, 80);
    runtime.p2_guard_power = 10;
    gbs::tick_luta(runtime, stages[1]);
    assert(runtime.p2_guard_power == 12 && runtime.p2_guard_max == 80);
    apply(gbs::LutaEventAction::SetIsmStyle, 1, 2);
    assert(runtime.p2_ism_style == gbs::LutaIsmStyle::VIsm);
    apply(gbs::LutaEventAction::EnableAlphaCounter, 0, 0);
    runtime.p1_hitstun = 30;
    gbs::luta_p1_alpha_counter(runtime);
    assert(runtime.p1_hitstun == 30 && runtime.p1_super_gauge == 75);
    apply(gbs::LutaEventAction::EnableAlphaCounter, 0, 1);
    gbs::luta_p1_alpha_counter(runtime);
    // Counter spends 50 and the existing damage path rewards 8 for the hit.
    assert(runtime.p1_hitstun == 0 && runtime.p1_super_gauge == 33);
    apply(gbs::LutaEventAction::SetSuperGauge, 0, 100);
    const auto hp_before = runtime.p2_hp;
    apply(gbs::LutaEventAction::TriggerSuper, 0, 1);
    assert(runtime.p2_hp < hp_before && runtime.p1_super_gauge == stages[1].superGaugeGainOnHit);
    apply(gbs::LutaEventAction::SetRoundsToWin, 3);
    apply(gbs::LutaEventAction::SetRoundTimer, 600);
    assert(runtime.rounds_to_win == 3 && runtime.round_timer == 600);
    apply(gbs::LutaEventAction::EndMatch, 1);
    assert(runtime.round_state == gbs::LutaRoundState::P2Win && runtime.p2_wins == 3);
    apply(gbs::LutaEventAction::EndMatch, 2);
    assert(runtime.round_state == gbs::LutaRoundState::Draw);
    assert(events.luta_command_count == 0);
    auto authored_stage = stages[0];
    authored_stage.characters = nullptr;
    authored_stage.characterCount = 0;
    fighters[0].maxHp = 123;
    assert(gbs::make_luta_runtime_state(authored_stage).p1_hp == 123);
}

void test_locomotion_and_action_feedback() {
    gbs::LutaCharacter fighters[2]{};
    for (auto& fighter : fighters) {
        fighter.maxHp = 100; fighter.guardPower = 48; fighter.walkSpeed = 12;
    }
    const auto stage = make_stage(fighters);
    auto runtime = gbs::make_luta_runtime_state(stage);
    gbs::LutaVisualStateData visual{};
    gbs::init_luta_visual_state(visual);
    gbs::sync_luta_visual_state(visual, runtime, true, nullptr);
    gbs::luta_p1_move(runtime, stage, 1);
    gbs::sync_luta_visual_state(visual, runtime, true, nullptr);
    assert(visual.state == gbs::LutaVisualState::Walk);
    gbs::sync_luta_visual_state(visual, runtime, true, nullptr);
    assert(visual.state == gbs::LutaVisualState::Idle);
    gbs::luta_p1_jump(runtime, stage);
    gbs::sync_luta_visual_state(visual, runtime, true, nullptr);
    assert(visual.state == gbs::LutaVisualState::Jump);
    runtime.p1_hitstun = 2;
    gbs::sync_luta_visual_state(visual, runtime, true, nullptr);
    assert(visual.state == gbs::LutaVisualState::Hurt);
    runtime.p1_hitstun = 0;
    gbs::set_luta_visual_state(visual, nullptr, gbs::LutaVisualState::Attack);
    gbs::sync_luta_visual_state(visual, runtime, true, nullptr);
    assert(visual.state == gbs::LutaVisualState::Attack);

    // A whiff is an accepted action with recovery; rejected inputs are silent.
    gbs::luta_p1_attack(runtime, stage, gbs::LutaAttackStrength::Light, gbs::LutaAttackType::Punch);
    assert(gbs::consume_luta_action_feedback(runtime, true) == gbs::LutaActionFeedback::Miss);
    assert(runtime.p1_attack_cooldown == 8);
    gbs::luta_p1_attack(runtime, stage, gbs::LutaAttackStrength::Light, gbs::LutaAttackType::Punch);
    assert(gbs::consume_luta_action_feedback(runtime, true) == gbs::LutaActionFeedback::None);
    runtime.p1_attack_cooldown = 0; runtime.p2_x = runtime.p1_x + 24;
    gbs::luta_p1_attack(runtime, stage, gbs::LutaAttackStrength::Light, gbs::LutaAttackType::Punch);
    assert(gbs::consume_luta_action_feedback(runtime, true) == gbs::LutaActionFeedback::Hit);
    assert(runtime.p1_super_gauge == 8 && runtime.p2_super_gauge == 4);
    runtime.p1_attack_cooldown = runtime.p2_hitstun = 0;
    gbs::luta_p2_set_guard(runtime, true);
    gbs::luta_p1_attack(runtime, stage, gbs::LutaAttackStrength::Light, gbs::LutaAttackType::Kick);
    assert(gbs::consume_luta_action_feedback(runtime, true) == gbs::LutaActionFeedback::Guard);
    runtime.p1_super_gauge = 100;
    gbs::luta_p1_super(runtime);
    assert(gbs::consume_luta_action_feedback(runtime, true) == gbs::LutaActionFeedback::Special);
    assert(gbs::consume_luta_action_feedback(runtime, true) == gbs::LutaActionFeedback::None);
}

void test_jump_phases_and_walk_do_not_restart() {
    const gbs::MetaSpritePart part {0,0,0,0,false,false,8,8};
    const gbs::SpriteAnimationFrame frames[] = {
        {{&part,1},2}, {{&part,1},2}, {{&part,1},2}, {{&part,1},2}
    };
    const gbs::SpriteAnimation walk {frames,4,true}, jump {frames,4,false};
    const gbs::LutaAnimationSet animations {&walk,nullptr,nullptr,nullptr,nullptr,&walk,&jump};
    const gbs::SpriteAnimation short_jump {frames,2,false};
    const gbs::LutaAnimationSet short_set {nullptr,nullptr,nullptr,nullptr,nullptr,nullptr,&short_jump};
    gbs::LutaVisualStateData short_visual{};gbs::init_luta_visual_state(short_visual);
    gbs::set_luta_visual_state(short_visual,&short_set,gbs::LutaVisualState::Jump);
    gbs::tick_luta_visual_state(short_visual,&short_set);gbs::tick_luta_visual_state(short_visual,&short_set);
    assert(short_visual.animator.frame_index==1);
    for (const bool p1 : {true,false}) {
        gbs::LutaRuntimeState runtime{};
        gbs::LutaVisualStateData visual{};gbs::init_luta_visual_state(visual);
        gbs::sync_luta_visual_state(visual,runtime,p1,&animations);
        auto& x=p1?runtime.p1_x:runtime.p2_x;
        for (int n=0;n<3;++n) {++x;gbs::sync_luta_visual_state(visual,runtime,p1,&animations);gbs::tick_luta_visual_state(visual,&animations);}
        assert(visual.state==gbs::LutaVisualState::Walk && visual.animator.frame_index==1);
        auto& airborne=p1?runtime.p1_airborne:runtime.p2_airborne;
        auto& velocity=p1?runtime.p1_vertical_velocity:runtime.p2_vertical_velocity;
        airborne=true;velocity=-6;gbs::sync_luta_visual_state(visual,runtime,p1,&animations);
        assert(visual.state==gbs::LutaVisualState::Jump && visual.animator.frame_index==0);
        velocity=-2;gbs::sync_luta_visual_state(visual,runtime,p1,&animations);assert(visual.animator.frame_index==1);
        velocity=1;gbs::sync_luta_visual_state(visual,runtime,p1,&animations);assert(visual.animator.frame_index==2);
        for(int n=0;n<30;++n)gbs::tick_luta_visual_state(visual,&animations);
        assert(visual.animator.frame_index==2);
        airborne=false;gbs::sync_luta_visual_state(visual,runtime,p1,&animations);assert(visual.animator.frame_index==3);
        for(int n=0;n<4;++n)gbs::tick_luta_visual_state(visual,&animations);
        gbs::sync_luta_visual_state(visual,runtime,p1,&animations);assert(visual.state==gbs::LutaVisualState::Idle);
    }
}

int main() {
    test_locomotion_and_action_feedback();
    test_jump_phases_and_walk_do_not_restart();
    test_authored_luta_events();
    test_player_movement_jump_and_guard();
    test_round_progression();
    test_visual_state_animation_contract();
    return EXIT_SUCCESS;
}
