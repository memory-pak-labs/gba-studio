"""Compile the real stationary NPC direction consumer and presentation."""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "examples/topdown_basic/src/main.cpp").read_text()


def function(signature):
    match = re.search(re.escape(signature) + r"[^;{]*\{", source)
    if match is None:
        return None
    end = source.index("{", match.start()) + 1
    depth = 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[match.start():end]


consumer = function("void consume_npc_event_commands(")
if consumer is None:
    assert "gbs::consume_actor_event_commands(npc_runtimes, npc_count, event_state);" in source
    consumer = "void consume_npc_event_commands() { gbs::consume_actor_event_commands(npc_runtimes, current_npc_count(), event_state); }"
constants = source[source.index("constexpr int topdown_directional_idle_down_index"):
                   source.index("bool topdown_has_walk_directional_animations")]
code = r'''
#include <cassert>
#include "gbs/project.hpp"
#include "gbs/animation.hpp"
#include "gbs/event_animation.hpp"
#include "gbs/topdown_run.hpp"
gbs::TopDownProjectData project {};
gbs::TopDownActorRuntime npc_runtimes[1] {};
gbs::SpriteAnimatorState npc_animators[1] {};
gbs::EventState event_state {};
gbs::Actor player {};
gbs::EventPlayerRuntimeState player_event_runtime {true, 0, 0, 2};
gbs::SpriteAnimatorState player_animator {};
gbs::InputState current_input {};
bool player_script_animation_active = false;
bool player_walk_clip_active = false;
int player_animation_speed_percent = 100;
const gbs::TopDownActorSpriteData* selected_player_sprite_data() { return nullptr; }
void apply_player_sprite_variant() {}
int current_room = 0;
size_t current_npc_count() { return 1; }
void refresh_npc_directional_animation(size_t index, bool moving, bool force = false);
''' + constants + "\n" + "\n".join(function(signature) for signature in [
    "bool topdown_has_walk_directional_animations(",
    "bool topdown_has_idle_directional_animations(",
    "int topdown_directional_animation_index(",
    "void refresh_npc_runtime_animation(",
    "void refresh_npc_directional_animation(",
    "void refresh_player_runtime_animation(",
    "void refresh_player_directional_animation(",
]) + "\n" + function("void consume_player_event_commands(").replace(
    "gbs::consume_visibility_event_commands(event_state);", "") + "\n" + consumer + r'''
void consume() {
    consume_npc_event_commands();
    refresh_npc_runtime_animation(0, event_state.actor_animation_playing[0]);
}
int main() {
    const gbs::MetaSpritePart parts[] = {{0, 0, 0, 0, false, false}};
    const gbs::SpriteAnimationFrame frames[] = {{gbs::MetaSprite {parts, 1}, 1}};
    const gbs::SpriteAnimation down {frames, 1, true, 1};
    const gbs::SpriteAnimation right {frames, 1, true, 2};
    const gbs::SpriteAnimation up {frames, 1, true, 3};
    const gbs::SpriteAnimation left {frames, 1, true, 4};
    const gbs::SpriteAnimation wave {frames, 1, true, 5};
    const gbs::SpriteAnimation* clips[] = {&down, &right, &up, &left, &wave, &wave, &wave, &wave};
    gbs::TopDownNpcData npc {};
    npc.animation = &left; npc.animations = clips; npc.animation_count = 8;
    npc.direction = gbs::TopDownActorDirection::Left;
    npc.movement.kind = gbs::TopDownNpcMovementKind::None;
    gbs::TopDownRoomData room {};
    room.npcs = &npc; room.npc_count = 1;
    project.rooms = &room; project.room_count = 1;
    npc_runtimes[0] = gbs::actor_runtime_from_npc(npc);
    gbs::select_sprite_animation(npc_animators[0], left);
    event_state.actor_command_count = 1;
    event_state.actor_commands[0] = {gbs::EventActorOp::SetDirection, 0, 3, 0};
    consume();
    assert(npc_runtimes[0].actor.direction == 3);
    assert(npc_animators[0].animation == &right);
    assert(!npc_animators[0].playing && event_state.actor_command_count == 0);

    // Ordinary stationary presentation must preserve a manually selected clip.
    npc_runtimes[0].animation_index = -5;
    refresh_npc_runtime_animation(0, true);
    refresh_npc_directional_animation(0, false);
    assert(npc_animators[0].animation == &wave && npc_animators[0].playing);

    // Requests in the same frame retain their authored order.
    event_state.actor_command_count = 2;
    event_state.actor_commands[0] = {gbs::EventActorOp::SetDirection, 0, 2, 0};
    event_state.actor_commands[1] = {gbs::EventActorOp::SetAnimation, 0, -5, 0};
    consume();
    assert(npc_runtimes[0].actor.direction == 2);
    assert(npc_animators[0].animation == &wave && npc_animators[0].playing);
    event_state.actor_command_count = 2;
    event_state.actor_commands[0] = {gbs::EventActorOp::SetAnimation, 0, -5, 0};
    event_state.actor_commands[1] = {gbs::EventActorOp::SetDirection, 0, 1, 0};
    consume();
    assert(npc_animators[0].animation == &up && !npc_animators[0].playing);

    // An explicit turn does not wait for the next slow patrol movement tick.
    npc.movement.kind = gbs::TopDownNpcMovementKind::WanderBox;
    npc_runtimes[0].active = true; npc_runtimes[0].visible = true;
    npc_runtimes[0].movement_frame_counter = 7;
    event_state.actor_command_count = 1;
    event_state.actor_commands[0] = {gbs::EventActorOp::SetDirection, 0, 2, 0};
    consume();
    assert(npc_animators[0].animation == &left);
    event_state.actor_command_count = 1;
    event_state.actor_commands[0] = {gbs::EventActorOp::SetDirection, 99, 3, 0};
    consume();
    assert(npc_runtimes[0].actor.direction == 2 && npc_animators[0].animation == &left);

    // A scripted turn must update the Player pose even while a scene Wait blocks locomotion.
    project.player.animation = &left; project.player.animations = clips; project.player.animation_count = 8;
    player.direction = 2;
    gbs::select_sprite_animation(player_animator, left);
    event_state.actor_command_count = 1;
    event_state.actor_commands[0] = {gbs::EventActorOp::SetDirection, -1, 1, 0};
    consume_player_event_commands();
    assert(player.direction == 1 && player_animator.animation == &up);
    player_script_animation_active = true;
    gbs::play_sprite_animation(player_animator, wave);
    consume_player_event_commands();
    assert(player_script_animation_active && player_animator.animation == &wave);
}
'''
# The legacy two-argument presentation needs its original declaration in RED.
if "bool force" not in function("void refresh_npc_directional_animation("):
    code = code.replace("void refresh_npc_directional_animation(size_t index, bool moving, bool force = false);", "")
with tempfile.TemporaryDirectory(prefix="gbs-npc-direction-") as directory:
    path = Path(directory)
    (path / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-Iengine/include", str(path / "test.cpp"), "engine/src/gbs_animation.cpp",
                    "-o", str(path / "test")], cwd=root, check=True)
    subprocess.run([str(path / "test")], check=True)
print("Topdown stationary NPC: explicit turn updates the real pose and facing: PASS")
