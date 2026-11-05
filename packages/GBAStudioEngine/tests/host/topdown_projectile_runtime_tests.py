"""Exercise the production top-down projectile launch and collision code on the host."""
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


def extract_function(source, marker):
    start = source.index(marker)
    end = source.index('{', start) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[start:end] + '\n'


class TopdownProjectileRuntimeTests(unittest.TestCase):
    def test_projectile_does_not_hit_its_shooter_and_applies_slot_damage(self):
        source = (ROOT / 'examples/topdown_basic/src/main.cpp').read_text()
        start = source.index('struct RuntimeProjectile {')
        end = source.index('\n};', start) + len('\n};')
        code = r'''
#include <cassert>
#include <cstddef>
#include <cstdint>
using std::size_t;
namespace gbs {
struct Vec2i { int x, y; };
struct Rect { int x, y, w, h; };
struct SpriteAnimatorState {};
struct TileAsset {};
struct Actor { Vec2i position_pixels; Vec2i size_pixels; uint8_t collision_group; };
struct EventScript { int id; };
struct Npc { EventScript on_hit_actor, on_hit_group1, on_hit_group2, on_hit_group3, on_defeated; };
struct TopDownRoomData { Npc npcs[2]; };
struct Project { TopDownRoomData rooms[1]; };
struct TopDownActorSpriteData { const int* animation; };
constexpr size_t max_event_projectile_slots = 4;
EventScript empty_event_script() { return {0}; }
bool has_event_script(EventScript s) { return s.id != 0; }
Rect actor_rect(Actor a) { return {a.position_pixels.x, a.position_pixels.y, a.size_pixels.x, a.size_pixels.y}; }
bool intersects(Rect a, Rect b) { return a.x < b.x+b.w && b.x < a.x+a.w && a.y < b.y+b.h && b.y < a.y+a.h; }
void init_sprite_animator(SpriteAnimatorState&) {}
const TopDownActorSpriteData* topdown_actor_sprite_for_index(const Project&, int) { return nullptr; }
void play_sprite_animation(SpriteAnimatorState&, int) {}
}
constexpr size_t max_npc_slots = 2, max_runtime_projectiles = 8;
''' + source[start:end] + r'''
RuntimeProjectile runtime_projectiles[max_runtime_projectiles]{};
struct NpcRuntime { gbs::Actor actor; bool active, visible; } npc_runtimes[2];
gbs::Actor player{};
int npc_health[2]; bool npc_defeat_pending_despawn[2]{};
gbs::Project project{}; int current_room = 0;
struct EventState { bool projectile_slot_loaded[4]{}; int projectile_slot_damage[4]{}, projectile_slot_speed[4]{}, projectile_slot_sprite[4]{}; } event_state;
size_t current_npc_count() { return 2; }
int queued[10]{}, queue_order[10]{}; size_t queue_count = 0;
void queue_script(gbs::EventScript script) { ++queued[script.id]; queue_order[queue_count++] = script.id; }
'''
        for marker in ('int next_runtime_projectile_index()', 'gbs::Vec2i projectile_direction_delta(int direction) {',
                       'bool projectile_spawn_position(', 'uint8_t projectile_source_collision_group(',
                       'bool spawn_runtime_projectile_from_event(', 'gbs::Rect projectile_rect_for(',
                       'gbs::EventScript hit_group_script_for_projectile(', 'bool apply_projectile_hit_to_npc(',
                       'bool apply_projectile_hits('):
            code += extract_function(source, marker)
        code += r'''
int main() {
    npc_runtimes[0] = {{{0, 0}, {16, 16}, 1}, true, true};
    npc_runtimes[1] = {{{40, 0}, {16, 16}, 2}, true, true};
    npc_health[0] = npc_health[1] = 3;
    project.rooms[0].npcs[1].on_hit_actor = {1};
    project.rooms[0].npcs[1].on_hit_group1 = {2};
    project.rooms[0].npcs[1].on_defeated = {3};
    event_state.projectile_slot_loaded[2] = true;
    event_state.projectile_slot_damage[2] = 2;
    event_state.projectile_slot_speed[2] = 200;
    assert(spawn_runtime_projectile_from_event(1, 2, 3));
    auto& shot = runtime_projectiles[0];
    assert(shot.damage == 2 && shot.speed_x100 == 200 && shot.dx == 1);
    assert(!apply_projectile_hits(shot)); // spawning inside the shooter must not hurt it
    assert(npc_health[0] == 3 && shot.active);
    shot.x = 48; shot.y = 8;
    assert(apply_projectile_hits(shot));
    assert(npc_health[1] == 1 && !shot.active && npc_runtimes[1].active);
    assert(queued[1] == 1 && queued[2] == 1 && queued[3] == 0);
    assert(queue_count == 2 && queue_order[0] == 1 && queue_order[1] == 2);
    assert(spawn_runtime_projectile_from_event(1, 2, 3));
    shot.x = 48; shot.y = 8;
    assert(apply_projectile_hits(shot));
    assert(npc_health[1] == -1 && !npc_runtimes[1].active && npc_defeat_pending_despawn[1]);
    assert(queued[1] == 2 && queued[2] == 2 && queued[3] == 1);
    assert(queue_count == 5 && queue_order[2] == 1 && queue_order[3] == 2 && queue_order[4] == 3);
    player = {{0, 0}, {16, 16}, 0};
    assert(spawn_runtime_projectile_from_event(0, 2, 3));
    assert(apply_projectile_hits(shot)); // player shots can still hit NPC index zero
    assert(npc_health[0] == 1);
}
'''
        with tempfile.TemporaryDirectory(prefix='gba-projectile-test-') as directory:
            cpp = Path(directory) / 'test.cpp'
            binary = Path(directory) / 'test'
            cpp.write_text(code)
            subprocess.run(['c++', '-std=c++17', '-O2', str(cpp), '-o', str(binary)], check=True)
            subprocess.run([str(binary)], check=True)


if __name__ == '__main__':
    unittest.main()
