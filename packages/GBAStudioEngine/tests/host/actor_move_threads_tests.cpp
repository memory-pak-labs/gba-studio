#include <cassert>
#include "gbs/event.hpp"
#include "gbs/event_threads.hpp"

int main() {
    const gbs::EventCommand main_code[] = {
        {gbs::EventOp::MoveActorTo, -1, 10, 11}, {gbs::EventOp::SetVariable, 0, 10, 0}
    };
    const gbs::EventCommand first_code[] = {
        {gbs::EventOp::MoveActorTo, 0, 20, 21}, {gbs::EventOp::SetVariable, 1, 20, 0}
    };
    const gbs::EventCommand second_code[] = {
        {gbs::EventOp::MoveActorTo, 1, 30, 31}, {gbs::EventOp::SetVariable, 2, 30, 0}
    };
    const gbs::EventScript scripts[] = {{first_code, 2}, {second_code, 2}};
    gbs::EventState state {}; gbs::init_event_state(state); state.supports_temporal_actor_motion = true;
    gbs::EventRunner main_runner {}; gbs::start_event_runner(main_runner, {main_code, 2});
    assert(gbs::update_event_runner(main_runner, state));
    gbs::EventThreadPool pool {}; gbs::reset_event_threads(pool, state);
    state.segment_active[0] = true; state.segment_script[0] = 0; state.segment_revision[0] = 1;
    state.segment_active[1] = true; state.segment_script[1] = 1; state.segment_revision[1] = 1;
    gbs::tick_event_threads(pool, state, scripts, 2);
    assert(state.actor_command_count == 3);
    assert(state.actor_commands[0].motion_owner == &main_runner);
    assert(state.actor_commands[1].motion_owner == &pool.threads[0].runner);
    assert(state.actor_commands[2].motion_owner == &pool.threads[1].runner);
    const auto first_request = state.actor_commands[1];
    gbs::clear_event_actor_commands(state);
    gbs::complete_event_actor_movement(*first_request.motion_owner, first_request.motion_token);
    gbs::tick_event_threads(pool, state, scripts, 2);
    assert(state.variables[0] == 0 && state.variables[1] == 20 && state.variables[2] == 0);
    assert(main_runner.actor_motion_pending && pool.threads[1].runner.actor_motion_pending);

    // A stopped and restarted thread reuses the same address. A completion
    // from its old movement must not unlock the new movement.
    gbs::clear_event_actor_commands(state);
    state.segment_revision[1] = 2;
    gbs::tick_event_threads(pool, state, scripts, 2);
    assert(state.actor_command_count == 1);
    const auto old_request = state.actor_commands[0];
    assert(old_request.motion_owner == &pool.threads[1].runner);
    gbs::clear_event_actor_commands(state);
    state.segment_revision[1] = 3;
    gbs::tick_event_threads(pool, state, scripts, 2);
    assert(state.actor_command_count == 1 && pool.threads[1].runner.actor_motion_pending);
    gbs::complete_event_actor_movement(*old_request.motion_owner, old_request.motion_token);
    assert(pool.threads[1].runner.actor_motion_pending);
}
