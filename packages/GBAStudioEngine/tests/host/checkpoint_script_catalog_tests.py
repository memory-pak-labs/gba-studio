"""Resolve shared scripts started directly as roots of a runtime checkpoint."""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]


def function(source, signature):
    match = re.search(re.escape(signature) + r"[^;{]*\{", source)
    assert match
    start = match.start()
    end = source.index("{", start) + 1
    depth = 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


for kind, project_type, room_type, rooms, count, room_index, runner, expected in [
    ("battle_rpg", "BattleRpgProjectData", "BattleRpgEncounterData", "encounters", "encounter_count",
     "encounter_index", "battle_event_runner", 5),
    ("visual_novel", "VisualNovelProjectData", "VisualNovelSceneData", "scenes", "scene_count",
     "current_scene_index", "visual_novel_event_runner", 2),
]:
    source = (root / f"templates/exported_{kind}/main.cpp").read_text()
    code = f'''
#include <cassert>
#include "gbs/{kind}.hpp"
gbs::{project_type} project {{}};
int {room_index} = 0;
gbs::EventRunner {runner} {{}};
''' + function(source, "gbs::EventScript checkpoint_script_for(") + "\n" + function(
        source, "int current_checkpoint_script_index(") + f'''
int main() {{
    gbs::{room_type} room {{}};
    project.{rooms} = &room; project.{count} = 1;
    const gbs::EventCommand commands[] = {{{{gbs::EventOp::SaveGame, 0, 0, 0}}}};
    const gbs::EventScript scripts[] = {{{{commands, 1}}}};
    project.scripts = scripts; project.script_count = 1;
    {runner}.script = scripts[0]; {runner}.active = true;
    assert(current_checkpoint_script_index() == {expected});
    assert(checkpoint_script_for(0, {expected}).commands == commands);
    assert(!gbs::has_event_script(checkpoint_script_for(0, {expected + 1})));
}}
'''
    with tempfile.TemporaryDirectory(prefix=f"gbs-{kind}-checkpoint-catalog-") as directory:
        path = Path(directory)
        (path / "test.cpp").write_text(code)
        subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                        "-Iengine/include", str(path / "test.cpp"), "-o", str(path / "test")],
                       cwd=root, check=True)
        subprocess.run([str(path / "test")], check=True)
    print(f"{kind}: directly started shared script has a stable checkpoint root: PASS")
