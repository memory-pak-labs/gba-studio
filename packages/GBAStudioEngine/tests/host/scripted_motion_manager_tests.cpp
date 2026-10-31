#include <cassert>
#include "gbs/scripted_movement.hpp"

static void begin(gbs::EventState& state, gbs::EventRunner& runner, gbs::EventScript script) {
    gbs::start_event_runner(runner, script);
    assert(gbs::update_event_runner(runner, state));
}
int main() {
    const gbs::EventCommand a[] = {{gbs::EventOp::MoveActorTo, 0, 12, 8}, {gbs::EventOp::SetVariable, 0, 1, 0}};
    const gbs::EventCommand b[] = {{gbs::EventOp::MoveActorTo, 0, 8, 12}, {gbs::EventOp::SetVariable, 1, 1, 0}};
    gbs::EventState state{}; gbs::init_event_state(state);
    state.supports_temporal_actor_motion = true;
    gbs::EventRunner first{}, second{};
    gbs::ScriptedMovementPool pool{};
    uint8_t tiles[32]{}; gbs::TileMap map{tiles, 8, 4};
    gbs::Actor actor{{8,8},{8,8},1};
    begin(state, first, {a, 2});
    assert(gbs::start_scripted_movement(pool, state.actor_commands[0]));
    gbs::clear_event_actor_commands(state);
    assert(gbs::tick_scripted_movement(pool, 0, actor, map, 50, nullptr, 0) == gbs::ScriptedMovementResult::Moving);
    assert(actor.position_pixels.x == 8 && first.actor_motion_pending);
    assert(gbs::tick_scripted_movement(pool, 0, actor, map, 50, nullptr, 0) == gbs::ScriptedMovementResult::Moving);
    assert(actor.position_pixels.x == 9 && first.actor_motion_pending);
    // A second request for the same actor cancels the first and unblocks only its owner.
    begin(state, second, {b, 2});
    assert(gbs::start_scripted_movement(pool, state.actor_commands[0]));
    assert(!first.actor_motion_pending && second.actor_motion_pending);
    gbs::clear_event_actor_commands(state);
    assert(!gbs::update_event_runner(first, state) && state.variables[0] == 1);
    assert(state.variables[1] == 0);
    // Zero speed terminates the request rather than freezing the script forever.
    assert(gbs::tick_scripted_movement(pool, 0, actor, map, 0, nullptr, 0) == gbs::ScriptedMovementResult::Stopped);
    assert(!second.actor_motion_pending);
    assert(!gbs::update_event_runner(second, state) && state.variables[1] == 1);
    // Obstruction must also finish, without crossing the tile.
    actor.position_pixels={8,8}; tiles[1*8+2]=gbs::TileSolid;
    begin(state, first, {a, 2});
    assert(gbs::start_scripted_movement(pool, state.actor_commands[0]));
    gbs::clear_event_actor_commands(state);
    assert(gbs::tick_scripted_movement(pool, 0, actor, map, 100, nullptr, 0) == gbs::ScriptedMovementResult::Stopped);
    assert(actor.position_pixels.x==8 && !first.actor_motion_pending);
}
