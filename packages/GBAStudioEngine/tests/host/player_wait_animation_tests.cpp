#include <cassert>
#include "gbs/event.hpp"

int main() {
    gbs::EventState state {};
    gbs::EventRunner runner {};
    gbs::init_event_state(state);
    const gbs::EventCommand wait[] = {
        {gbs::EventOp::WaitActorAnimation, gbs::event_player_actor_index, 0, 0},
        {gbs::EventOp::SetVariable, 0, 42, 0}, {gbs::EventOp::End, 0, 0, 0}
    };
    gbs::set_event_actor_animation_state(state, gbs::event_player_actor_index, true);
    gbs::start_event_runner(runner, {wait, 3});
    gbs::update_event_runner(runner, state);
    assert(runner.active && state.variables[0] == 0);
    gbs::set_event_actor_animation_state(state, gbs::event_player_actor_index, false);
    gbs::update_event_runner(runner, state);
    assert(!runner.active && state.variables[0] == 42);

    // The consumer has not yet seen the play request when the following wait runs.
    gbs::init_event_state(state);
    const gbs::EventCommand start_and_wait[] = {
        {gbs::EventOp::SetPlayerAnimation, 4, 0, 0},
        {gbs::EventOp::WaitActorAnimation, gbs::event_player_actor_index, 0, 0},
        {gbs::EventOp::SetVariable, 0, 7, 0}, {gbs::EventOp::End, 0, 0, 0}
    };
    gbs::start_event_runner(runner, {start_and_wait, 4});
    gbs::update_event_runner(runner, state);
    assert(runner.active && state.variables[0] == 0 && state.player_animation_changed);
    gbs::set_event_actor_animation_state(state, gbs::event_player_actor_index, false);
    gbs::update_event_runner(runner, state);
    assert(!runner.active && state.variables[0] == 7);

    gbs::init_event_state(state);
    const gbs::EventCommand invalid[] = {
        {gbs::EventOp::WaitActorAnimation, -2, 0, 0},
        {gbs::EventOp::SetVariable, 0, 3, 0}, {gbs::EventOp::End, 0, 0, 0}
    };
    gbs::set_event_actor_animation_state(state, gbs::event_player_actor_index, true);
    gbs::start_event_runner(runner, {invalid, 3});
    gbs::update_event_runner(runner, state);
    assert(!runner.active && state.variables[0] == 3);

    // NPC waits retain their own independent state.
    gbs::init_event_state(state);
    const gbs::EventCommand npc_wait[] = {
        {gbs::EventOp::WaitActorAnimation, 0, 0, 0},
        {gbs::EventOp::SetVariable, 0, 8, 0}, {gbs::EventOp::End, 0, 0, 0}
    };
    gbs::set_event_actor_animation_state(state, 0, true);
    gbs::set_event_actor_animation_state(state, gbs::event_player_actor_index, false);
    gbs::start_event_runner(runner, {npc_wait, 3});
    gbs::update_event_runner(runner, state);
    assert(runner.active && state.variables[0] == 0);
    gbs::set_event_actor_animation_state(state, 0, false);
    gbs::update_event_runner(runner, state);
    assert(!runner.active && state.variables[0] == 8);
}
