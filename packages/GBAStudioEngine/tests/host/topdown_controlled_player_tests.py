"""Verify the per-room controlled-player contract consumed by the runtime."""
from pathlib import Path
import importlib.util
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location("assetc", root / "tools/assetc/assetc.py")
assetc = importlib.util.module_from_spec(spec)
spec.loader.exec_module(assetc)
assert assetc.emit_topdown_room_metadata({"metadata": {"player_enabled": False}}, 0).rstrip().endswith("false\n        }")
assert assetc.emit_topdown_room_metadata({"metadata": {"player_enabled": True}}, 0).rstrip().endswith("true\n        }")
assert assetc.emit_topdown_room_metadata({}, 0).rstrip().endswith("true\n        }")

runtime = (root / "examples/topdown_basic/src/main.cpp").read_text()
match = re.search(r"void consume_actor_push_commands\([^;{]*\{", runtime)
assert match
end = runtime.index("{", match.start()) + 1
depth = 1
while depth:
    depth += (runtime[end] == "{") - (runtime[end] == "}")
    end += 1
push_consumer = runtime[match.start():end]
code = r'''
#include <cassert>
#include "gbs/project.hpp"
gbs::TopDownProjectData project {};
gbs::TopDownRoomData rooms[1] {};
int current_room = 0;
gbs::EventState event_state {};
gbs::Room room {};
gbs::Actor player {};
constexpr size_t max_npc_slots = 2;
gbs::Actor push_blocking_actors[max_npc_slots] {};
gbs::TopDownActorRuntime npc_runtimes[max_npc_slots] {};
size_t current_npc_count() { return 1; }
size_t observed_blockers = 99;
namespace gbs {
int push_actor_by_delta_until_collision(const TileMap&, Actor&, Vec2i, const Actor*, size_t count) {
    observed_blockers = count;
    return 0;
}
}
''' + push_consumer + r'''
int main() {
    project.rooms = rooms;
    assert(gbs::topdown_controlled_player_active(rooms[0], true));
    assert(!gbs::topdown_controlled_player_active(rooms[0], false));
    rooms[0].metadata.player_enabled = false;
    assert(!gbs::topdown_controlled_player_active(rooms[0], true));
    assert(!gbs::topdown_controlled_player_active(rooms[0], false));
    event_state.actor_command_count = 1;
    event_state.actor_commands[0] = {gbs::EventActorOp::Push, 0, 4, 0, 0};
    consume_actor_push_commands();
    assert(observed_blockers == 0); // The absent player cannot block an NPC push.
    rooms[0].metadata.player_enabled = true;
    assert(gbs::topdown_controlled_player_active(rooms[0], true));
    consume_actor_push_commands();
    assert(observed_blockers == 1);
}
'''
with tempfile.TemporaryDirectory(prefix="gbs-controlled-player-") as directory:
    source = Path(directory) / "test.cpp"
    source.write_text(code)
    exe = Path(directory) / "test"
    subprocess.run(["c++", "-std=c++17", "-I", str(root / "engine/include"), str(source), "-o", str(exe)], check=True)
    subprocess.run([str(exe)], check=True)
print("Top-down per-room controlled-player metadata and active state: PASS")
