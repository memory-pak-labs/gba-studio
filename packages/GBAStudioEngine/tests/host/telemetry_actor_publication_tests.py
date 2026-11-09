"""Exercise the production publication stores, including observers between them."""
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


def publication_fragment(runtime):
    source = (ROOT / "examples" / f"{runtime}_basic" / "src" / "main.cpp").read_text()
    start = source.index("    runtime_telemetry.actor_count =", source.index("void sync_runtime_telemetry("))
    return source[start:source.index("    runtime_telemetry.last_music =", start)]


class ActorTelemetryPublication(unittest.TestCase):
    def test_visible_actors_never_publish_an_intermediate_hidden_value(self):
        source = r'''
#include <cassert>
#include <cstdint>
#include <cstddef>
#include <cstdio>
#include <cstdlib>
#include <vector>
struct Visibility {
    uint32_t value = 1;
    std::vector<uint32_t> observed;
    Visibility& operator=(uint32_t next) { value = next; observed.push_back(next); return *this; }
};
struct Telemetry {
    uint32_t actor_count = 0;
    int first_actor_x = -1, first_actor_y = -1, first_actor_direction = -1;
    Visibility first_actor_visible;
} runtime_telemetry;
struct Vec { int x = 40, y = 50; };
struct Actor { Vec position_pixels; int direction = 3; };
struct Npc { Actor actor; bool visible = true; } npc_runtimes[1], platformer_npc_runtimes[1];
struct Enemy { Vec bounds_pixels; bool facing_right = true, active = true; } active_enemies[1];
size_t actor_count = 1, platformer_npc_count = 1, active_enemy_count = 0;
void topdown() { TOPDOWN }
void platformer() { PLATFORMER }
void check(void (*publish)(), bool visible, int x, int y) {
    runtime_telemetry.first_actor_visible.value = 1;
    runtime_telemetry.first_actor_visible.observed.clear();
    publish();
    // An emulator can stop at a video boundary between any two stores. The
    // logical visibility must be written once, rather than cleared then filled.
    if (runtime_telemetry.first_actor_visible.observed != std::vector<uint32_t>{visible ? 1u : 0u}) {
        std::fputs("Visibility is cleared while the actor remains visible\n", stderr);
        std::exit(1);
    }
    if (runtime_telemetry.first_actor_x != x || runtime_telemetry.first_actor_y != y) std::exit(2);
}
int main() {
    check(topdown, true, 40, 50);
    npc_runtimes[0].visible = false; check(topdown, false, 40, 50);
    actor_count = 0; check(topdown, false, -1, -1);
    check(platformer, true, 40, 50);
    platformer_npc_runtimes[0].visible = false; check(platformer, false, 40, 50);
    platformer_npc_count = 0; active_enemy_count = 1;
    check(platformer, true, 40, 50);
    active_enemies[0].active = false; check(platformer, false, 40, 50);
    active_enemy_count = 0; check(platformer, false, -1, -1);
}
'''.replace("TOPDOWN", publication_fragment("topdown")).replace("PLATFORMER", publication_fragment("platformer"))
        compiler = shutil.which("c++") or shutil.which("g++")
        self.assertIsNotNone(compiler, "A host C++ compiler is required")
        with tempfile.TemporaryDirectory(prefix="gbs-actor-telemetry-") as directory:
            cpp = Path(directory) / "publication.cpp"
            binary = Path(directory) / "publication"
            cpp.write_text(source)
            subprocess.run([compiler, "-std=c++17", str(cpp), "-o", str(binary)], check=True)
            subprocess.run([str(binary)], check=True)


if __name__ == "__main__":
    unittest.main()
