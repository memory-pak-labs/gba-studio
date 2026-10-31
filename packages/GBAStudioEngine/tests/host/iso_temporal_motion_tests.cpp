#include <cassert>
#include "gbs/iso_temporal_motion.hpp"

int main() {
    uint8_t tiles[16]{}; gbs::IsoTileMap map{tiles,4,4};
    gbs::IsoActor actors[2]{};
    actors[0].tile={0,0,0}; actors[0].visible=true;
    actors[1].tile={3,3,0}; actors[1].visible=true;
    gbs::IsoActorAnimationState anim[2]{};
    gbs::EventState state{}; gbs::init_event_state(state);state.supports_temporal_actor_motion=true;
    gbs::EventRunner runner{};
    const gbs::EventCommand commands[]={{gbs::EventOp::MoveActorTo,0,1,0},{gbs::EventOp::SetVariable,0,73,0}};
    gbs::start_event_runner(runner,{commands,2});
    assert(gbs::update_event_runner(runner,state));
    gbs::IsoTemporalMotionPool pool{};
    assert(gbs::begin_iso_temporal_motion(pool,state.actor_commands[0],2));
    gbs::clear_event_actor_commands(state);
    for(int frame=0;frame<16;++frame) {
        assert(runner.actor_motion_pending && state.variables[0]==0);
        gbs::tick_iso_temporal_motion(pool,0,map,actors,anim,2,100);
        assert(actors[0].position_x256==(frame+1)*16);
    }
    assert(actors[0].tile.x==1 && !runner.actor_motion_pending);
    assert(!gbs::update_event_runner(runner,state) && state.variables[0]==73);

    actors[0].tile={0,0,0};gbs::sync_iso_actor_position_from_tile(actors[0]);tiles[1]=gbs::IsoTileBlocked;
    gbs::start_event_runner(runner,{commands,2});assert(gbs::update_event_runner(runner,state));
    assert(gbs::begin_iso_temporal_motion(pool,state.actor_commands[0],2));gbs::clear_event_actor_commands(state);
    for(int frame=0;frame<16;++frame) gbs::tick_iso_temporal_motion(pool,0,map,actors,anim,2,100);
    assert(actors[0].tile.x==0 && actors[0].position_x256==240 && !runner.actor_motion_pending);
}
