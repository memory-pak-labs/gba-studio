"""Exercise the real Top-down/Platformer Player command loops and clocks."""
from pathlib import Path
import os
import re
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]


def block(text, start):
    brace = text.index("{", start)
    end, depth = brace + 1, 1
    while depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    return text[start:end]


def player_loop(profile):
    text = (root / f"examples/{profile}_basic/src/main.cpp").read_text()
    signature = "void consume_player_event_commands()" if profile == "topdown" else "void consume_platformer_actor_commands("
    body = block(text, text.index(signature))
    loops = [block(body, m.start()) for m in re.finditer(
        r"for \(size_t index = 0; index < event_state.actor_command_count; \+\+index\)", body)]
    return next(loop for loop in loops if "apply_event_player_command" in loop)


for profile in (sys.argv[1:] or ("topdown", "platformer")):
    helper = root / "engine/include/gbs/event_animation.hpp"
    code = r'''
#include <cassert>
#include "gbs/platformer.hpp"
#include "gbs/project.hpp"
#include "gbs/animation.hpp"
''' + ('#include "gbs/event_animation.hpp"\n' if helper.exists() else "") + r'''
gbs::EventState event_state {};
gbs::EventPlayerRuntimeState player_event_runtime {true, 0, 0, 0};
''' + ("gbs::Actor player {};\n" if profile == "topdown" else "gbs::PlatformerActor player {};\n") + r'''
gbs::SpriteAnimatorState player_animator {};
int player_animation_speed_percent = 100;
bool player_script_animation_active = true;
gbs::TopDownProjectData project {};
gbs::Vec2i player_animation_travelled_pixels {};
gbs::PlatformerNpcRuntime platformer_npc_runtimes[1] {};
gbs::SpriteAnimatorState platformer_npc_animators[1] {};
size_t platformer_npc_count = 0;
void update_platformer_player_runtime_animation(gbs::InputState, bool) {}
void apply_player_sprite_variant() {}
void refresh_player_runtime_animation(int, bool, bool) {}
void consume_platformer_player_animation_request() {}
''' + block((root / f"examples/{profile}_basic/src/main.cpp").read_text(),
            (root / f"examples/{profile}_basic/src/main.cpp").read_text().index(
                "void update_player_runtime_animation(" if profile == "topdown" else "void advance_platformer_runtime_animations(")) + '''
void tick() { ''' + ("update_player_runtime_animation(false);" if profile == "topdown" else "advance_platformer_runtime_animations();") + r''' }
void consume() {
    [[maybe_unused]] bool direction_requested = false;
''' + player_loop(profile) + r'''
}
int main() {
    const gbs::MetaSpritePart parts[] = {{0, 0, 0, 0, false, false}};
    const gbs::SpriteAnimationFrame frames[] = {
        {gbs::MetaSprite {parts, 1}, 1}, {gbs::MetaSprite {parts, 1}, 1},
        {gbs::MetaSprite {parts, 1}, 1}, {gbs::MetaSprite {parts, 1}, 1}
    };
    const gbs::SpriteAnimation clip {frames, 4, true, 1};
    project.player.animation_speed_percent = 100;
    gbs::play_sprite_animation(player_animator, clip);
    event_state.actor_command_count = 2;
    event_state.actor_commands[0] = {gbs::EventActorOp::SetAnimationFrame, -1, 2, 0};
    event_state.actor_commands[1] = {gbs::EventActorOp::SetAnimationSpeed, -1, 25, 0};
    consume();
    assert(player_animator.frame_index == 2);
    assert(player_animation_speed_percent == 25);
    assert(player_animator.playing); // Frame changes preserve playback.
    for (int i = 0; i < 3; ++i) tick();
    assert(player_animator.frame_index == 2);
    tick();
    assert(player_animator.frame_index == 3);

    // NPC commands do not change the Player; invalid frames preserve phase.
    event_state.actor_commands[0] = {gbs::EventActorOp::SetAnimationFrame, 0, 0, 0};
    event_state.actor_commands[1] = {gbs::EventActorOp::SetAnimationSpeed, 0, 400, 0};
    consume();
    assert(player_animator.frame_index == 3 && player_animation_speed_percent == 25);
    event_state.actor_commands[0] = {gbs::EventActorOp::SetAnimationFrame, -1, 99, 0};
    event_state.actor_commands[1] = {gbs::EventActorOp::SetAnimationSpeed, -1, 900, 0};
    consume();
    assert(player_animator.frame_index == 3 && player_animation_speed_percent == 400);
    event_state.actor_commands[0] = {gbs::EventActorOp::SetAnimationFrame, -1, -1, 0};
    event_state.actor_commands[1] = {gbs::EventActorOp::SetAnimationSpeed, -1, 0, 0};
    consume();
    assert(player_animator.frame_index == 3 && player_animation_speed_percent == 1);
}
'''
    with tempfile.TemporaryDirectory(prefix=f"gbs-{profile}-player-controls-") as directory:
        path = Path(directory)
        (path / "test.cpp").write_text(code)
        subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                        "-Iengine/include", str(path / "test.cpp"), "engine/src/gbs_animation.cpp",
                        "-o", str(path / "test")], cwd=root, check=True)
        subprocess.run([str(path / "test")], check=True)
    print(f"{profile} Player real command loop: frame/speed/clamp/invalid frame/NPC isolation PASS")
