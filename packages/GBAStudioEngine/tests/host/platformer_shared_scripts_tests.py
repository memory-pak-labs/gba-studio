"""Exercise production shared-script dispatch with the real event runner and queue."""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "examples/platformer_basic/src/main.cpp").read_text()


def function(signature):
    start = source.index(signature)
    return source[start:source.index("\n}", start) + 2]


dispatch = function("void consume_platformer_script_request(")
assert "consume_platformer_script_request(event_state);" in function("void consume_event_state("), \
    "scene, actor and interaction outputs must dispatch their shared-script requests"
code = r'''
#include <cassert>
#include "gbs/platformer.hpp"
gbs::EventScriptQueue platformer_event_queue {};
constexpr gbs::EventCommand animation_commands[] = {
    {gbs::EventOp::SetActorAnimation, 0, -2, 0},
    {gbs::EventOp::SetActorAnimation, 1, -2, 0},
    {gbs::EventOp::AddVariable, 0, 1, 0}
};
constexpr gbs::EventCommand nested_commands[] = {{gbs::EventOp::CallScript, 0, 0, 0}};
constexpr gbs::EventScript scripts[] = {{animation_commands, 3}, {nested_commands, 1}};
gbs::PlatformerProjectData project {};
''' + function("void queue_platformer_script(") + "\n" + dispatch + r'''
void drain(gbs::EventState& state) {
    gbs::EventScriptQueueEntry entry {};
    while(gbs::dequeue_event_script(platformer_event_queue, entry)) {
        gbs::EventRunner runner {};
        gbs::init_event_runner(runner);
        gbs::start_event_runner(runner,entry.script);
        while(gbs::event_runner_is_active(runner))gbs::update_event_runner(runner,state);
        consume_platformer_script_request(state);
    }
}
int main() {
    project.scripts=scripts; project.script_count=2;
    gbs::EventState state {}; gbs::init_event_state(state);
    gbs::init_event_script_queue(platformer_event_queue);
    // Same request comes from a scene runner, an NPC runner or interaction runner.
    for(int origin=0;origin<3;++origin) {
        state.actor_command_count=0;
        gbs::run_event_script(state,scripts[1]);
        consume_platformer_script_request(state);
        assert(state.last_script==-1);
        drain(state);
        assert(state.variables[0]==origin+1 && state.actor_command_count==2);
        assert(state.actor_commands[0].actor_index==0 && state.actor_commands[0].a==-2);
        assert(state.actor_commands[1].actor_index==1 && state.actor_commands[1].a==-2);
        consume_platformer_script_request(state);
        assert(gbs::event_script_queue_is_empty(platformer_event_queue));
    }
    state.last_script=99; consume_platformer_script_request(state);
    assert(state.last_script==-1 && gbs::event_script_queue_is_empty(platformer_event_queue));
    state.last_script=1; consume_platformer_script_request(state); drain(state);
    assert(state.variables[0]==4); // nested shared request also reaches the queue
}
'''
sources = ["engine/src/gbs_event.cpp", "engine/src/gbs_dialogue_locale.cpp",
           "engine/src/gbs_runtime.cpp", "engine/src/gbs_rtc.cpp", "engine/src/gbs_link.cpp", "engine/src/gbs_multiplayer.cpp", "engine/src/gbs_multiplayer_events.cpp",
           "engine/src/rumble.cpp", "engine/src/deferred_work.cpp",
           "engine/src/gbs_engine_global.cpp", "tests/host/hw_stubs.cpp"]
with tempfile.TemporaryDirectory(prefix="gbs-platformer-shared-") as directory:
    path = Path(directory)
    (path / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-Iengine/include", str(path / "test.cpp"), *sources, "-o", str(path / "test")],
                   cwd=root, check=True)
    subprocess.run([str(path / "test")], check=True)
print("Platformer shared scripts: production dispatch, real queue, nested calls and named actor targets: PASS")
