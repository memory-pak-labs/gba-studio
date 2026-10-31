#include <cassert>
#include "gbs/event.hpp"
int main() {
    gbs::EventState state {}; gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        {gbs::EventOp::MoveActorTo, 0, 56, 64},
        {gbs::EventOp::SetVariable, 0, 73, 0},
        {gbs::EventOp::End, 0, 0, 0}
    };
    gbs::run_event_script(state, commands, 3);
    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].op == gbs::EventActorOp::SetPosition);
    assert(state.actor_commands[0].a == 56 && state.actor_commands[0].b == 64);
    assert(state.variables[0] == 73);
    gbs::init_event_state(state);
    gbs::EventRunner runner {}; gbs::start_event_runner(runner, {commands, 3});
    assert(!gbs::update_event_runner(runner, state));
    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].op == gbs::EventActorOp::SetPosition);
    assert(state.variables[0] == 73);
}
