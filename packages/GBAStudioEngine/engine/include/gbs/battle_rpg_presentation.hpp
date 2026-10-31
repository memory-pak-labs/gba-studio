#pragma once
#include "gbs/battle_rpg.hpp"

namespace gbs {
// Transient visual state deliberately stays outside persistent combat checkpoints.
struct BattleRpgActorPresentation {
    SpriteAnimatorState animator {};
    const TileAsset* loaded_tiles = nullptr;
    bool action = false;
    bool dead = false;
};
inline void reset_battle_rpg_actor_presentation(BattleRpgActorPresentation& state) {
    state = {};
    init_sprite_animator(state.animator);
}
inline bool battle_rpg_actor_busy(const BattleRpgActorPresentation& state) {
    return state.action && state.animator.playing;
}
inline void play_battle_rpg_pose(BattleRpgActorPresentation& state, const SpriteAnimation* clip) {
    if (clip == nullptr) return;
    play_sprite_animation(state.animator,*clip);
    state.action = !clip->loop;
}
inline void play_battle_rpg_action(BattleRpgActorPresentation& state, const BattleRpgAnimationSet& clips, BattleRpgAbilityKind kind) {
    const SpriteAnimation* clip = kind==BattleRpgAbilityKind::Magic ? clips.magic :
        kind==BattleRpgAbilityKind::Heal ? clips.heal : kind==BattleRpgAbilityKind::Defend ? clips.defend : clips.attack;
    play_battle_rpg_pose(state,clip);
}
inline void update_battle_rpg_actor_presentation(BattleRpgActorPresentation& state, const BattleRpgAnimationSet& clips, bool dead, bool defending) {
    update_sprite_animator(state.animator);
    if (dead) {
        if (!state.dead) {
            if(clips.defeat)play_battle_rpg_pose(state,clips.defeat);
            else if(clips.hurt){select_sprite_animation(state.animator,*clips.hurt);state.action=false;}
        }
        state.dead = true;
        return; // Keep the last defeat frame instead of hiding/restarting the actor.
    }
    if (battle_rpg_actor_busy(state)) return;
    state.action = false;
    const auto* clip = defending && clips.defend ? clips.defend : clips.idle;
    if (clip && state.animator.animation != clip) play_sprite_animation(state.animator,*clip);
}
}
