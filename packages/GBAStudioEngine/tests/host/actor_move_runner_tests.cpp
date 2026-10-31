#include <cassert>
#include "gbs/event.hpp"
#include "gbs/runtime_checkpoint.hpp"

int main() {
    constexpr auto temporal_move = static_cast<gbs::EventOp>(164);
    constexpr auto motion_request = static_cast<gbs::EventActorOp>(18);
    const gbs::EventCommand commands[] = {
        {temporal_move, 0, 56, 64},
        {gbs::EventOp::SetVariable, 0, 73, 0},
        {gbs::EventOp::End, 0, 0, 0}
    };
    gbs::EventState state {}; gbs::init_event_state(state); state.supports_temporal_actor_motion = true;
    gbs::EventRunner runner {}; gbs::start_event_runner(runner, {commands, 3});
    assert(gbs::update_event_runner(runner, state));
    assert(state.variables[0] == 0);
    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].op == motion_request);
    assert(state.actor_commands[0].actor_index == 0);
    assert(state.actor_commands[0].a == 56 && state.actor_commands[0].b == 64);
    auto checkpoint = gbs::capture_checkpoint_script(runner, 0, state);
    gbs::EventRunner restored {};
    assert(gbs::restore_checkpoint_script(checkpoint, {commands, 3}, restored, &state));
    gbs::clear_event_actor_commands(state);
    assert(gbs::update_event_runner(restored, state));
    assert(state.variables[0] == 0 && state.actor_command_count == 1);
    assert(state.actor_commands[0].op == motion_request);
    gbs::clear_event_actor_commands(state);
    for (int frame = 0; frame < 4; ++frame) {
        assert(gbs::update_event_runner(runner, state));
        assert(state.variables[0] == 0 && state.actor_command_count == 0);
    }
    gbs::complete_event_actor_movement(runner, runner.actor_motion_token);
    assert(!gbs::update_event_runner(runner, state));
    assert(state.variables[0] == 73);

    const gbs::EventCommand child[] = {{temporal_move, -1, 8, 9}, {gbs::EventOp::AddVariable, 1, 2, 0}};
    const gbs::EventScript scripts[] = {{child, 2}};
    const gbs::EventCommand parent[] = {{gbs::EventOp::CallScript, 0, 0, 0}, {gbs::EventOp::AddVariable, 1, 3, 0}};
    gbs::init_event_state(state); state.supports_temporal_actor_motion = true; gbs::bind_event_scripts(state, scripts, 1);
    gbs::start_event_runner(runner, {parent, 2});
    assert(gbs::update_event_runner(runner, state));
    assert(runner.call_depth == 1 && state.variables[1] == 0);
    assert(state.actor_commands[0].actor_index == -1);
    gbs::clear_event_actor_commands(state);
    assert(gbs::update_event_runner(runner, state));
    assert(state.variables[1] == 0 && state.actor_command_count == 0);
    gbs::complete_event_actor_movement(runner, runner.actor_motion_token);
    assert(!gbs::update_event_runner(runner, state));
    assert(state.variables[1] == 5);

    gbs::start_event_runner(runner, {commands, 3});
    assert(gbs::update_event_runner(runner, state));
    gbs::stop_event_runner(runner);
    assert(!runner.actor_motion_pending);
}
