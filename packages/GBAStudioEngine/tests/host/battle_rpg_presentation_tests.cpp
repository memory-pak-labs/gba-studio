#include "gbs/battle_rpg_presentation.hpp"
#include <cassert>

int main() {
    const gbs::MetaSpritePart parts[]={{0,0,0,0,false,false}};
    const gbs::SpriteAnimationFrame frames[] = {{gbs::MetaSprite{parts,1},2}, {gbs::MetaSprite{parts,1},2}};
    const gbs::SpriteAnimation idle{frames,2,true}, attack{frames,2,false}, hurt{frames,1,false};
    gbs::BattleRpgAnimationSet clips{}; clips.idle=&idle; clips.attack=&attack; clips.hurt=&hurt;
    gbs::BattleRpgActorPresentation p{};
    gbs::reset_battle_rpg_actor_presentation(p);
    gbs::update_battle_rpg_actor_presentation(p,clips,false,false);
    assert(p.animator.animation==&idle);
    gbs::play_battle_rpg_action(p,clips,gbs::BattleRpgAbilityKind::Attack);
    assert(p.animator.animation==&attack && gbs::battle_rpg_actor_busy(p));
    for(int i=0;i<3;++i)gbs::update_battle_rpg_actor_presentation(p,clips,false,false);
    assert(p.animator.animation==&attack);
    for(int i=0;i<2;++i)gbs::update_battle_rpg_actor_presentation(p,clips,false,false);
    assert(p.animator.animation==&idle && !gbs::battle_rpg_actor_busy(p));
    gbs::play_battle_rpg_action(p,clips,gbs::BattleRpgAbilityKind::Magic); // missing clip falls back, never locks combat
    assert(!gbs::battle_rpg_actor_busy(p));
    clips.defeat=&hurt;
    gbs::update_battle_rpg_actor_presentation(p,clips,true,false);
    for(int i=0;i<5;++i)gbs::update_battle_rpg_actor_presentation(p,clips,true,false);
    assert(p.animator.animation==&hurt && !p.animator.playing); // dead pose holds, never restarts
    gbs::reset_battle_rpg_actor_presentation(p);
    assert(p.loaded_tiles==nullptr && p.animator.animation==nullptr);
}
