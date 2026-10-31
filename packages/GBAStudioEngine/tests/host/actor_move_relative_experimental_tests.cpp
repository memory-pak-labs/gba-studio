#include <cassert>
#include "gbs/event.hpp"
#include "gbs/scripted_movement.hpp"
#include <climits>
int main() {
    const auto relative = static_cast<gbs::EventOp>(165);
    const gbs::EventCommand commands[] = {{relative, 0, -16, 8}, {gbs::EventOp::SetVariable, 0, 73, 0}};
    gbs::EventState state {}; gbs::init_event_state(state);
    state.supports_temporal_actor_motion = true;
    gbs::EventRunner runner {}; gbs::start_event_runner(runner, {commands, 2});
    assert(gbs::update_event_runner(runner, state));
    assert(state.variables[0] == 0 && state.actor_command_count == 1);
    assert(state.actor_commands[0].op == gbs::EventActorOp::MoveTo);
    assert(state.actor_commands[0].a == -16 && state.actor_commands[0].b == 8 && state.actor_commands[0].c == 1);
    gbs::EventActorCommand resolved {};
    assert(gbs::resolve_scripted_movement_destination(state.actor_commands[0], {24, 16}, resolved));
    assert(resolved.a == 8 && resolved.b == 24 && resolved.c == 0);
    assert(resolved.motion_owner == &runner && resolved.motion_token == runner.actor_motion_token);
    assert(!gbs::resolve_scripted_movement_destination(state.actor_commands[0], {INT_MIN, 16}, resolved));
    gbs::complete_event_actor_movement(runner, runner.actor_motion_token);
    assert(!gbs::update_event_runner(runner, state) && state.variables[0] == 73);
    gbs::init_event_state(state); gbs::run_event_script(state, commands, 2);
    assert(state.actor_command_count == 1 && state.actor_commands[0].op == gbs::EventActorOp::MoveRelative);
    assert(state.variables[0] == 73);
}
