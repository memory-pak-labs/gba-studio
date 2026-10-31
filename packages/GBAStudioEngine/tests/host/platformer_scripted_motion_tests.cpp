#include <cassert>
#include "gbs/platformer.hpp"
#include "gbs/scripted_movement.hpp"

int main() {
    uint8_t tiles[64]{};
    gbs::TileMap map{tiles,8,8};
    gbs::Actor actor{{8,8},{8,8},1};
    tiles[1*8+2]=gbs::TileSolid;
    assert(!gbs::move_platformer_scripted_step(map,actor,{1,0},nullptr,0));
    assert(actor.position_pixels.x==8);
    tiles[1*8+2]=0;
    tiles[2*8+1]=gbs::TileBlockTop;
    actor.position_pixels={8,24};
    assert(gbs::move_platformer_scripted_step(map,actor,{0,-1},nullptr,0));
    assert(actor.position_pixels.y==23);
    actor.position_pixels={8,8};
    assert(!gbs::move_platformer_scripted_step(map,actor,{0,1},nullptr,0));
    assert(actor.position_pixels.y==8);
    tiles[2*8+1]=0;
    gbs::Actor blocker{{16,8},{8,8},1};
    assert(!gbs::move_platformer_scripted_step(map,actor,{1,0},&blocker,1));
    actor.collision_mask=0;
    assert(gbs::move_platformer_scripted_step(map,actor,{1,0},&blocker,1));
    assert(actor.position_pixels.x==9);

    // A runner's next command waits until the platformer consumer reaches its target.
    const gbs::EventCommand events[] = {{gbs::EventOp::MoveActorTo,-1,12,8},
        {gbs::EventOp::SetVariable,0,73,0}};
    gbs::EventState state{}; gbs::init_event_state(state);
    state.supports_temporal_actor_motion = true;
    gbs::EventRunner runner{}; gbs::start_event_runner(runner,{events,2});
    assert(gbs::update_event_runner(runner,state));
    gbs::ScriptedMovementPool motions{};
    assert(gbs::start_scripted_movement(motions,state.actor_commands[0]));
    gbs::clear_event_actor_commands(state);
    gbs::PlatformerActor player=gbs::platformer_actor_from_rect({8,8,8,8},{2,0});
    for(int frame=0;frame<4;++frame) {
        const auto anchor=gbs::platformer_actor_anchor_position(player);
        gbs::Actor proxy{anchor,{player.bounds_pixels.width,player.bounds_pixels.height},1};
        proxy.collision_offset_pixels=player.collision_offset_pixels;
        assert(state.variables[0]==0 && runner.actor_motion_pending);
        const auto result=gbs::tick_scripted_movement(motions,-1,proxy,map,100,nullptr,0,gbs::move_platformer_scripted_step);
        gbs::set_platformer_actor_anchor_position(player,proxy.position_pixels);
        assert(gbs::platformer_actor_anchor_position(player).x==9+frame);
        assert(frame<3 ? result==gbs::ScriptedMovementResult::Moving : result==gbs::ScriptedMovementResult::Reached);
    }
    gbs::complete_event_actor_movement(runner, runner.actor_motion_token);
    assert(!gbs::update_event_runner(runner,state) && state.variables[0]==73);
}
