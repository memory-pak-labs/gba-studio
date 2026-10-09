#include <cassert>
#include "gbs/racing_animation.hpp"
int main() {
    static constexpr gbs::MetaSpritePart parts[]={{0,0,0,0,false,false}};
    constexpr gbs::SpriteAnimationFrame frames[]={{{parts,1},2},{{parts,1},2}};
    const gbs::SpriteAnimation idle{frames,1,false},drive{frames,2,true},left{frames,2,true},right{frames,2,true},brake{frames,1,false},hurt{frames,2,false};
    const gbs::RacingVehicleAnimationSet clips{&idle,&drive,&left,&right,&brake,&hurt};
    gbs::SpriteAnimatorState animator{};gbs::init_sprite_animator(animator);
    gbs::update_racing_vehicle_animator(animator,clips,0,{false,false,0},false);
    assert(animator.animation==&idle && animator.frame_index==0);
    for(int i=0;i<3;++i) gbs::update_racing_vehicle_animator(animator,clips,256,{true,false,0},false);
    assert(animator.animation==&drive && animator.frame_index==1);
    gbs::update_racing_vehicle_animator(animator,clips,256,{true,false,-1},false);assert(animator.animation==&left);
    gbs::update_racing_vehicle_animator(animator,clips,256,{true,false,1},false);assert(animator.animation==&right);
    gbs::update_racing_vehicle_animator(animator,clips,256,{false,true,1},false);assert(animator.animation==&brake);
    gbs::update_racing_vehicle_animator(animator,clips,0,{false,false,0},true);assert(animator.animation==&hurt);
    const gbs::SpriteAnimation brake_left{frames,1,false},brake_right{frames,1,false};
    const gbs::RacingVehicleAnimationSet complete{&idle,&drive,&left,&right,&brake,&hurt,&brake_left,&brake_right};
    gbs::update_racing_vehicle_animator(animator,complete,256,{false,true,-1},false);assert(animator.animation==&brake_left);
    gbs::update_racing_vehicle_animator(animator,complete,256,{false,true,1},false);assert(animator.animation==&brake_right);
    gbs::update_racing_vehicle_animator(animator,complete,256,{false,true,0},false);assert(animator.animation==&brake);
    gbs::update_racing_vehicle_animator(animator,complete,256,{false,true,1},true);assert(animator.animation==&hurt);
    const gbs::SpriteAnimation idle_right{frames,1,true},drive_right{frames,2,true},hurt_right{frames,1,false};
    const gbs::RacingVehicleAnimationSet directional{&idle,&drive,&left,&right,&brake,&hurt,nullptr,nullptr,
        {{&idle,&drive,&hurt},{&idle_right,&drive_right,&hurt_right},{&idle,&drive,&hurt},{&idle,&drive,&hurt}}};
    gbs::update_racing_vehicle_animator(animator,directional,0,{false,false,0},false,4);assert(animator.animation==&idle_right);
    gbs::update_racing_vehicle_animator(animator,directional,256,{true,false,1},false,5);assert(animator.animation==&drive_right);
    gbs::update_racing_vehicle_animator(animator,directional,0,{false,false,0},true,4);assert(animator.animation==&hurt_right);
    assert(gbs::racing_vehicle_sprite_heading(directional,4)==0);
    assert(gbs::racing_vehicle_sprite_heading(directional,5)==1);
    assert(gbs::racing_vehicle_sprite_heading(directional,3)==15);
    assert(gbs::racing_vehicle_sprite_heading(directional,15)==15);
    assert(gbs::racing_vehicle_sprite_heading(clips,4)==4);
    gbs::update_racing_vehicle_animator(animator,{},0,{false,false,0},false);assert(animator.animation==nullptr);
}
