#include <cassert>
#include <cstdio>
#include <cstring>
#include "gbs/event.hpp"

constexpr gbs::EventCommand first[] = {
    {gbs::EventOp::MultiplyVariable, 0, 10, 0}, {gbs::EventOp::AddVariable, 0, 1, 0}
};
constexpr gbs::EventCommand second[] = {
    {gbs::EventOp::MultiplyVariable, 0, 10, 0}, {gbs::EventOp::AddVariable, 0, 2, 0}
};
constexpr gbs::EventCommand parent[] = {
    {gbs::EventOp::CallScript, 0, 0, 0}, {gbs::EventOp::CallScript, 1, 0, 0},
    {gbs::EventOp::MultiplyVariable, 0, 10, 0}, {gbs::EventOp::AddVariable, 0, 3, 0},
    {gbs::EventOp::End, 0, 0, 0}
};
constexpr gbs::EventCommand leaf[] = {
    {gbs::EventOp::Wait, 1, 0, 0},
    {gbs::EventOp::MultiplyVariable, 0, 10, 0}, {gbs::EventOp::AddVariable, 0, 1, 0}
};
constexpr gbs::EventCommand child[] = {
    {gbs::EventOp::Wait, 2, 0, 0}, {gbs::EventOp::CallScript, 1, 0, 0},
    {gbs::EventOp::MultiplyVariable, 0, 10, 0}, {gbs::EventOp::AddVariable, 0, 2, 0},
    {gbs::EventOp::End, 0, 0, 0}
};
constexpr gbs::EventCommand nested_parent[] = {
    {gbs::EventOp::CallScript, 0, 0, 0},
    {gbs::EventOp::MultiplyVariable, 0, 10, 0}, {gbs::EventOp::AddVariable, 0, 3, 0}
};

void drain(gbs::EventRunner& runner, gbs::EventState& state,
           const gbs::EventScript* scripts, size_t count) {
    gbs::EventScriptQueue queue {};
    gbs::init_event_script_queue(queue);
    for (int frame = 0; frame < 100; ++frame) {
        if (state.wait_frames > 0) { --state.wait_frames; continue; }
        if (!runner.active) {
            gbs::EventScriptQueueEntry entry {};
            if (!gbs::dequeue_event_script(queue, entry)) return;
            gbs::start_event_runner(runner, entry.script);
        }
        gbs::update_event_runner(runner, state);
        if (state.last_script >= 0 && static_cast<size_t>(state.last_script) < count)
            assert(gbs::enqueue_event_script(queue, scripts[state.last_script]));
        state.last_script = -1;
    }
    assert(false && "shared script must finish within the frame budget");
}

void consecutive_calls() {
    constexpr gbs::EventScript scripts[] = {{first, 2}, {second, 2}};
    gbs::EventState state {}; gbs::init_event_state(state);
    gbs::bind_event_scripts(state, scripts, 2);
    gbs::EventRunner runner {}; gbs::start_event_runner(runner, {parent, 5});
    drain(runner, state, scripts, 2);
    std::printf("consecutive calls: expected 123, observed %d\n", state.variables[0]);
    assert(state.variables[0] == 123);
}

void nested_calls_and_waits() {
    constexpr gbs::EventScript scripts[] = {{child, 5}, {leaf, 3}};
    gbs::EventState state {}; gbs::init_event_state(state);
    gbs::bind_event_scripts(state, scripts, 2);
    gbs::EventRunner runner {}; gbs::start_event_runner(runner, {nested_parent, 3});
    assert(gbs::update_event_runner(runner, state));
    assert(state.wait_frames == 2 && state.variables[0] == 0);
    state.wait_frames = 0; // The runtime has waited the requested two frames.
    assert(gbs::update_event_runner(runner, state));
    assert(state.wait_frames == 1 && state.variables[0] == 0);
    state.wait_frames = 0;
    drain(runner, state, scripts, 2);
    assert(state.variables[0] == 123);
}

void synchronous_calls() {
    constexpr gbs::EventScript scripts[] = {{first, 2}, {second, 2}};
    gbs::EventState state {}; gbs::init_event_state(state);
    gbs::bind_event_scripts(state, scripts, 2);
    gbs::run_event_script(state, {parent, 5});
    assert(state.variables[0] == 123 && state.last_script == -1);
}

void locked_and_invalid_calls() {
    constexpr gbs::EventScript scripts[] = {{first, 2}, {second, 2}};
    constexpr gbs::EventCommand commands[] = {
        {gbs::EventOp::LockScript, 0, 0, 0}, {gbs::EventOp::CallScript, 0, 0, 0},
        {gbs::EventOp::CallScript, -1, 0, 0}, {gbs::EventOp::CallScript, 99, 0, 0},
        {gbs::EventOp::CallScript, 1, 0, 0}
    };
    gbs::EventState state {}; gbs::init_event_state(state);
    gbs::bind_event_scripts(state, scripts, 2);
    gbs::EventRunner runner {}; gbs::start_event_runner(runner, {commands, 5});
    drain(runner, state, scripts, 2);
    assert(state.variables[0] == 2 && state.last_script == -1);
}

void synchronous_long_child() {
    gbs::EventCommand commands[100] {};
    for (auto& command : commands) command = {gbs::EventOp::AddVariable, 0, 1, 0};
    const gbs::EventScript scripts[] = {{commands, 100}};
    const gbs::EventCommand caller[] = {
        {gbs::EventOp::CallScript, 0, 0, 0}, {gbs::EventOp::CallScript, 0, 0, 0},
        {gbs::EventOp::SetVariable, 1, 1, 0}
    };
    gbs::EventState state {}; gbs::init_event_state(state);
    gbs::bind_event_scripts(state, scripts, 1);
    gbs::run_event_script(state, {caller, 3});
    assert(state.variables[0] == 200 && state.variables[1] == 1);
}

void step_budget_and_recursion_limit() {
    constexpr gbs::EventScript scripts[] = {{first, 2}, {second, 2}};
    gbs::EventState state {}; gbs::init_event_state(state);
    gbs::bind_event_scripts(state, scripts, 2);
    gbs::EventRunner runner {}; gbs::start_event_runner(runner, {parent, 5});
    runner.step_budget = 1;
    assert(gbs::update_event_runner(runner, state));
    assert(state.variables[0] == 0 && runner.call_depth == 1 && runner.command_index == 1);
    drain(runner, state, scripts, 2);
    assert(state.variables[0] == 123 && !state.script_call_overflow);

    constexpr gbs::EventCommand recursive[] = {{gbs::EventOp::CallScript, 0, 0, 0}};
    const gbs::EventScript recursive_scripts[] = {{recursive, 1}};
    gbs::bind_event_scripts(state, recursive_scripts, 1);
    gbs::start_event_runner(runner, {recursive, 1});
    gbs::update_event_runner(runner, state);
    assert(!runner.active && state.script_call_overflow && runner.call_depth == 0);
    gbs::stop_event_runner(runner);
    assert(runner.call_depth == 0);
}

int main(int argc, char** argv) {
    const char* selected = argc > 1 ? argv[1] : "all";
    if (!std::strcmp(selected, "all") || !std::strcmp(selected, "order")) consecutive_calls();
    if (!std::strcmp(selected, "all") || !std::strcmp(selected, "wait")) nested_calls_and_waits();
    if (!std::strcmp(selected, "all") || !std::strcmp(selected, "sync")) synchronous_calls();
    if (!std::strcmp(selected, "all") || !std::strcmp(selected, "invalid")) locked_and_invalid_calls();
    if (!std::strcmp(selected, "all") || !std::strcmp(selected, "long")) synchronous_long_child();
    if (!std::strcmp(selected, "all") || !std::strcmp(selected, "budget")) step_budget_and_recursion_limit();
}
