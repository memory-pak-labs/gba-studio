"""Keep idle NPCs cheap without skipping startup, running scripts or waits."""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "examples/platformer_basic/src/main.cpp").read_text()
start = source.index("void update_platformer_npc_scripts(")
update = source[start:source.index("\n}", start) + 2]
code = r'''
#include <cassert>
#include "gbs/platformer.hpp"
constexpr size_t platformer_npc_count = 4;
int platformer_npc_wait_frames[platformer_npc_count] {};
bool platformer_npc_start_complete[platformer_npc_count] {};
gbs::EventRunner platformer_npc_runners[platformer_npc_count] {};
int consumed = 0, actor_syncs = 0;
void sync_platformer_npc_event_state(gbs::EventState&) { ++actor_syncs; }
void consume_event_state(gbs::EventState& state, int* wait_frames) {
    ++consumed;
    if (state.wait_frames > 0) {
        *wait_frames += state.wait_frames;
        state.wait_frames = 0;
    }
}
void consume_platformer_actor_commands(gbs::EventState&, gbs::PlatformerActor&,
    const gbs::PlatformerRoomData&, bool&) {}
''' + update + r'''
int main() {
    gbs::PlatformerNpcData npcs[platformer_npc_count] {};
    gbs::PlatformerRoomData room {};
    room.npcs = npcs; room.npc_count = platformer_npc_count;
    gbs::EventState state {}; gbs::init_event_state(state);
    gbs::PlatformerActor player {}; bool player_active = true;
    for (size_t i = 0; i < platformer_npc_count; ++i) {
        gbs::init_event_runner(platformer_npc_runners[i]);
        platformer_npc_start_complete[i] = true;
    }
    update_platformer_npc_scripts(room, state, player, player_active);
    assert(actor_syncs == 1);
    assert(consumed == 0); // No full-world output processing for an empty lifecycle.

    constexpr gbs::EventCommand startup[] = {{gbs::EventOp::AddVariable, 0, 1, 0}};
    npcs[0].on_start = {startup, 1};
    platformer_npc_start_complete[0] = false;
    update_platformer_npc_scripts(room, state, player, player_active);
    assert(state.variables[0] == 1 && platformer_npc_start_complete[0]);
    assert(consumed == 1);
    update_platformer_npc_scripts(room, state, player, player_active);
    assert(state.variables[0] == 1 && consumed == 1);

    constexpr gbs::EventCommand tick[] = {{gbs::EventOp::AddVariable, 1, 1, 0}};
    npcs[1].on_update = {tick, 1};
    update_platformer_npc_scripts(room, state, player, player_active);
    update_platformer_npc_scripts(room, state, player, player_active);
    assert(state.variables[1] == 2 && consumed == 3);
    npcs[1].on_update = {};

    // A runner already in flight must drain even with no recurring script.
    constexpr gbs::EventCommand active[] = {{gbs::EventOp::AddVariable, 2, 1, 0}};
    gbs::start_event_runner(platformer_npc_runners[2], {active, 1});
    update_platformer_npc_scripts(room, state, player, player_active);
    assert(state.variables[2] == 1 && consumed == 4);

    // The wait clock must still progress for actors without a recurring script.
    platformer_npc_wait_frames[3] = 2;
    update_platformer_npc_scripts(room, state, player, player_active);
    assert(platformer_npc_wait_frames[3] == 1);
    update_platformer_npc_scripts(room, state, player, player_active);
    assert(platformer_npc_wait_frames[3] == 0 && consumed == 4);
}
'''
sources = ["engine/src/gbs_event.cpp", "engine/src/gbs_dialogue_locale.cpp",
           "engine/src/gbs_runtime.cpp", "engine/src/gbs_rtc.cpp", "engine/src/gbs_link.cpp", "engine/src/gbs_multiplayer.cpp", "engine/src/gbs_multiplayer_events.cpp",
           "engine/src/rumble.cpp", "engine/src/deferred_work.cpp",
           "engine/src/gbs_engine_global.cpp", "tests/host/hw_stubs.cpp"]
with tempfile.TemporaryDirectory(prefix="gbs-platformer-idle-") as directory:
    path = Path(directory)
    (path / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-Iengine/include", str(path / "test.cpp"), *sources, "-o", str(path / "test")],
                   cwd=root, check=True)
    subprocess.run([str(path / "test")], check=True)
print("Platformer empty lifecycles skip world synchronization; startup, updates, active runners and waits preserved: PASS")
