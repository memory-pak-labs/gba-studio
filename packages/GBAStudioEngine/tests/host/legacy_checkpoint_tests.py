"""Read the pre-call-stack checkpoint wire format through production readers."""
from pathlib import Path
import os
import re
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
header = (root / "engine/include/gbs/runtime_checkpoint.hpp").read_text()


def structure(source, name):
    match = re.search(r"struct " + name + r" \{", source)
    assert match, name
    end, depth = source.index("{", match.start()) + 1, 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[match.start():end + 1]


def function(source, name):
    match = re.search(r"bool " + name + r"\([^;{]*\{", source)
    assert match, name
    end, depth = source.index("{", match.start()) + 1, 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[match.start():end]


common = r'''
#include <cassert>
#include <cstring>
#include "gbs/engine.hpp"
#include "gbs/luta.hpp"
#include "gbs/runtime_checkpoint.hpp"
// Frozen v1 wire record: the three bytes after active are padding, not a depth.
struct LegacyScript {
    int32_t script_index;
    uint32_t command_index;
    uint32_t script_hash;
    uint8_t active;
    uint8_t padding[3];
};
static_assert(sizeof(LegacyScript) == 16);
constexpr gbs::EventCommand root_commands[] = {
    {gbs::EventOp::SetVariable, 0, 7, 0}, {gbs::EventOp::SaveGame, 0, 0, 0},
    {gbs::EventOp::AddVariable, 0, 9, 0}, {gbs::EventOp::End, 0, 0, 0}
};
LegacyScript old_script() {
    return {0, 2, gbs::checkpoint_script_hash({root_commands, 4}), 1, {0x35, 0xA7, 0xFF}};
}
gbs::UniversalSaveData envelope(gbs::UniversalSaveRuntime runtime, const void* payload, size_t size) {
    gbs::UniversalSaveData data {};
    gbs::EventState state {}; gbs::init_event_state(state); state.variables[0] = 7;
    assert(gbs::capture_runtime_checkpoint(data, runtime, 0, 20, 30, state, payload, size, 120));
    return data;
}
'''
codes = {}
for kind, name, family, old_size in [
    ("battle_rpg", "BattleRpgRuntimeCheckpoint", "BattleRpg", 400),
    ("luta", "LutaRuntimeCheckpoint", "Luta", 360),
    ("visual_novel", "VisualNovelRuntimeCheckpoint", "VisualNovel", 328),
]:
    source = (root / f"templates/exported_{kind}/main.cpp").read_text()
    declaration = structure(source, name)
    legacy = declaration.replace(name, "LegacySnapshot").replace("gbs::CheckpointScript script", "LegacyScript script")
    assert "gbs::read_checkpoint_snapshot(data," in source, "runtime must use the versioned reader"
    read = "gbs::read_checkpoint_snapshot(data, family, output)"
    codes[kind] = common + declaration + "\n" + legacy + f'''
static_assert(sizeof(LegacySnapshot) == {old_size});
bool load(const gbs::UniversalSaveData& data, gbs::UniversalSaveRuntime family, {name}& output) {{
    return {read};
}}
int main() {{
    LegacySnapshot old {{}}; old.version = 1; old.script = old_script();
    old.wait_frames = 17; old.music_index = -1; old.tracker_index = -1;
    auto data = envelope(gbs::UniversalSaveRuntime::{family}, &old, sizeof(old));
    {name} current {{}};
    assert(load(data, gbs::UniversalSaveRuntime::{family}, current) && current.version == 2);
    assert(current.script.call_depth == 0 && current.script.active && current.script.command_index == 2);
    assert(current.wait_frames == 17 && current.music_index == -1 && current.tracker_index == -1);
    gbs::EventRunner runner {{}};
    assert(gbs::restore_checkpoint_script(current.script, {{root_commands, 4}}, runner));
    gbs::EventState state {{}}; gbs::init_event_state(state); state.variables[0] = data.variables[0];
    while (runner.active) gbs::update_checkpoint_event_runner(runner, state);
    assert(state.variables[0] == 16); // The reward before Save is not repeated.
    auto modern = envelope(gbs::UniversalSaveRuntime::{family}, &current, sizeof(current));
    {name} again {{}};
    assert(load(modern, gbs::UniversalSaveRuntime::{family}, again));
    assert(again.wait_frames == 17 && again.script.command_index == 2);
    const auto stable = current;
    auto invalid = data; --invalid.payload_size;
    assert(!load(invalid, gbs::UniversalSaveRuntime::{family}, current));
    assert(current.version == stable.version && current.wait_frames == stable.wait_frames && current.script.script_hash == stable.script.script_hash);
    invalid = data; invalid.payload[0] = 99;
    assert(!load(invalid, gbs::UniversalSaveRuntime::{family}, current));
    invalid = data; invalid.payload[offsetof(LegacySnapshot, script) + 12] = 2;
    assert(!load(invalid, gbs::UniversalSaveRuntime::{family}, current));
    assert(!load(data, gbs::UniversalSaveRuntime::Menu, current));
}}
'''

source = (root / "templates/exported_shmup/main.cpp").read_text()
declarations = "\n".join(structure(source, name) for name in [
    "RuntimeActorGesture", "ShmupRuntimeCheckpoint", "ShmupEnemyCheckpoint", "ShmupProjectileCheckpoint"
])
legacy_header = structure(source, "ShmupRuntimeCheckpoint").replace("ShmupRuntimeCheckpoint", "LegacyHeader").replace(
    "gbs::CheckpointScript script", "LegacyScript script")
legacy_enemy = structure(source, "ShmupEnemyCheckpoint").replace("ShmupEnemyCheckpoint", "LegacyEnemy").replace(
    "gbs::CheckpointScript script", "LegacyScript script")
readers = "\n".join(function(source, name) for name in ["read_shmup_checkpoint", "read_shmup_enemy_checkpoint"])
has_version = "uint32_t* source_version" in readers
read_header = "read_shmup_checkpoint(reader, current, &wire_version)" if has_version else "read_shmup_checkpoint(reader, current)"
read_enemy = "read_shmup_enemy_checkpoint(reader, enemy, wire_version)" if has_version else "read_shmup_enemy_checkpoint(reader, enemy)"
codes["shmup"] = common + declarations + "\n" + legacy_header + "\n" + legacy_enemy + "\n" + readers + f'''
int main() {{
    LegacyHeader old {{}}; old.version = 1; old.script = old_script(); old.wait_frames = 17;
    old.music_index = -1; old.tracker_index = -1; old.high_score = 321;
    old.enemy_count = 2; old.projectile_count = 1;
    gbs::UniversalSaveData data {{}}; gbs::CheckpointPayloadWriter writer(data);
    assert(writer.write(old));
    gbs::CheckpointEvents events {{}}; events.random_seed = 19;
    assert(gbs::write_checkpoint_events(writer, events));
    for (int index = 0; index < 2; ++index) {{
        LegacyEnemy enemy {{}}; enemy.script.script_index = -1; enemy.sprite = -1;
        enemy.position = {{11 + index, 25 + index}}; enemy.health = 3 - index; enemy.active = true;
        assert(writer.write(enemy));
    }}
    ShmupProjectileCheckpoint projectile {{74, 88, 1, 0}}; assert(writer.write(projectile));
    gbs::CheckpointPayloadReader reader(data); ShmupRuntimeCheckpoint current {{}}; uint32_t wire_version = 0;
    (void)wire_version;
    assert({read_header} && current.version == 2);
    assert(current.wait_frames == 17 && current.high_score == 321 && current.script.call_depth == 0);
    gbs::CheckpointEvents restored {{}}; assert(gbs::read_checkpoint_events(reader, restored));
    assert(restored.random_seed == 19);
    for (int index = 0; index < 2; ++index) {{
        ShmupEnemyCheckpoint enemy {{}}; assert({read_enemy});
        assert(enemy.position.x == 11 + index && enemy.position.y == 25 + index && enemy.health == 3 - index);
        assert(enemy.script.script_index == -1 && enemy.script.call_depth == 0 && enemy.active);
    }}
    ShmupProjectileCheckpoint read {{}}; assert(reader.read(read));
    assert(read.x == 74 && read.y == 88 && read.pool == 1 && read.index == 0 && reader.complete());
}}
'''

sources = ["engine/src/gbs_event.cpp", "engine/src/gbs_dialogue_locale.cpp", "engine/src/gbs_save.cpp",
           "engine/src/gbs_info.cpp", "engine/src/gbs_runtime_save_restore.cpp", "engine/src/gbs_runtime.cpp",
           "engine/src/gbs_rtc.cpp", "engine/src/gbs_link.cpp", "engine/src/rumble.cpp",
           "engine/src/deferred_work.cpp", "engine/src/gbs_engine_global.cpp", "tests/host/hw_stubs.cpp"]
selected = sys.argv[1:] or list(codes)
for kind in selected:
    with tempfile.TemporaryDirectory(prefix=f"gbs-legacy-{kind}-") as directory:
        path = Path(directory); (path / "test.cpp").write_text(codes[kind])
        subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                        "-Iengine/include", str(path / "test.cpp"), *sources, "-o", str(path / "test")],
                       cwd=root, check=True)
        subprocess.run([str(path / "test")], check=True)
    print(f"{kind}: legacy checkpoint fields and continuation preserved: PASS")
