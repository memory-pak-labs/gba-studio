#include "gbs/platformer.hpp"
#include <cassert>

int main(){
 const gbs::SpriteAnimationFrame frames[]={{gbs::MetaSprite{nullptr,0},2},{gbs::MetaSprite{nullptr,0},2},{gbs::MetaSprite{nullptr,0},2}};
 const gbs::SpriteAnimation idle{frames,2,true},walk{frames,2,true},attack{frames,3,false},hurt{frames,1,false},land{frames,1,false};
 gbs::PlatformerPlayerAnimationSet clips{};clips.idle=&idle;clips.walk=&walk;clips.attack=&attack;clips.hurt=&hurt;clips.land=&land;
 auto actor=gbs::platformer_actor_from_rect({80,232,16,24});actor.on_ground=true;
 gbs::PlatformerPlayerPresentation state{};
 const gbs::InputState none{0,0,0},press{gbs::ButtonL,gbs::ButtonL,0},held{gbs::ButtonL,0,0};
 assert(gbs::update_platformer_player_presentation(state,clips,actor,none,false,false)==&idle);
 assert(gbs::update_platformer_player_presentation(state,clips,actor,press,false,false)==&attack);
 for(int i=0;i<5;++i)assert(gbs::update_platformer_player_presentation(state,clips,actor,held,false,false)==&attack);
 assert(gbs::update_platformer_player_presentation(state,clips,actor,held,false,false)==&idle); // held does not retrigger
 assert(gbs::update_platformer_player_presentation(state,clips,actor,none,true,false)==&land);
 assert(gbs::update_platformer_player_presentation(state,clips,actor,press,false,true)==&hurt); // hurt preempts action
 assert(gbs::update_platformer_player_presentation(state,clips,actor,none,false,false)==&hurt);
 assert(gbs::update_platformer_player_presentation(state,clips,actor,none,false,false)==&idle);
 clips.attack=nullptr;assert(gbs::update_platformer_player_presentation(state,clips,actor,press,false,false)==&idle);
 assert(gbs::platformer_callback_state_for_actor(actor)==1);
 actor.velocity_x256.x=512;assert(gbs::platformer_callback_state_for_actor(actor)==1); // walking is still grounded
 actor.on_ground=false;actor.velocity_x256.y=-256;assert(gbs::platformer_callback_state_for_actor(actor)==2);
 actor.velocity_x256.y=256;assert(gbs::platformer_callback_state_for_actor(actor)==0);
 actor.dashing=true;assert(gbs::platformer_callback_state_for_actor(actor)==3);
 return 0;
}
