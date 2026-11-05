#include "gbs/topdown_run.hpp"
#include "gbs/topdown.hpp"
#include <cassert>
#include <cmath>

int main() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    const gbs::InputState walking {gbs::ButtonRight, 0, 0};
    const gbs::InputState running {gbs::ButtonRight | gbs::ButtonR, 0, 0};
    assert(gbs::topdown_profile_speed_x100(state, running, 75) == 75);
    const gbs::EventCommand command {gbs::EventOp::SetPlayerSpeedProfile, 100, 170, 0, gbs::ButtonR};
    gbs::run_event_script(state, &command, 1);
    assert(state.player_run_button == gbs::ButtonR);
    assert(gbs::topdown_profile_speed_x100(state, walking, 75) == 75);
    assert(gbs::topdown_profile_speed_x100(state, running, 75) == 127);
    assert(gbs::topdown_profile_speed_x100(state, walking, 0) == 0);
    assert(gbs::topdown_profile_speed_x100(state, {gbs::ButtonL,0,0}, 100) == 100);
    for (int direction=0; direction<8; ++direction) {
        const int expected[] {8,10,11,9,8,8,10,10};
        assert(gbs::topdown_run_animation_index(12,direction,true) == expected[direction]);
        assert(gbs::topdown_run_animation_index(8,direction,true) == -1);
        assert(gbs::topdown_run_animation_index(12,direction,false) == -1);
    }
    gbs::EventPlayerRuntimeState player {true,0,0,0,75};
    int distance=0;
    for(int frame=0; frame<100; ++frame) {
        player.movement_speed_x100=gbs::topdown_profile_speed_x100(state,frame<50?running:walking,75);
        distance+=gbs::consume_event_player_movement_step(player,true);
    }
    assert(distance==101); // Fractional steps survive switching back to walk.
    uint8_t flags[32*32] {};
    const gbs::TileMap map {flags,32,32};
    auto travel=[&](uint16_t keys, int frames) {
        gbs::Actor actor {{64,64},{8,8},1};
        gbs::EventPlayerRuntimeState fraction {true,0,0,0,75};
        const gbs::InputState input {keys,0,0};
        for(int frame=0;frame<frames;++frame) {
            fraction.movement_speed_x100=gbs::topdown_profile_speed_x100(state,input,75);
            actor.speed_pixels=gbs::consume_event_player_movement_step(fraction,true);
            gbs::update_player(map,actor,input);
        }
        return actor;
    };
    const auto walk=travel(gbs::ButtonRight,100),run=travel(gbs::ButtonRight|gbs::ButtonR,100);
    const auto diagonal=travel(gbs::ButtonRight|gbs::ButtonDown|gbs::ButtonR,100);
    assert(walk.position_pixels.x==139 && run.position_pixels.x==191);
    assert(std::abs(std::hypot(diagonal.position_pixels.x-64,diagonal.position_pixels.y-64)-127)<2);
    for(int row=0;row<32;++row) flags[row*32+26]=gbs::TileSolid;
    assert(travel(gbs::ButtonRight|gbs::ButtonR,300).position_pixels.x==200);
}
