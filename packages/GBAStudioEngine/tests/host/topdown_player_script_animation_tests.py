"""Exercise the production Player animation consumer and automatic presentation."""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "examples/topdown_basic/src/main.cpp").read_text()


def block(start):
    brace = source.index("{", start)
    depth, end = 1, brace + 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


def function(signature):
    match = re.search(re.escape(signature) + r"[^;{]*\{", source)
    assert match, signature
    return block(match.start())


constants = source[source.index("constexpr int topdown_directional_idle_down_index"):
                   source.index("bool topdown_has_walk_directional_animations")]
manual_state = re.search(r"^bool player_script_animation_active[^\n]*", source, re.M)
consumer = block(source.index("if (event_state.player_animation_changed)"))
if "void update_player_runtime_animation(" in source:
    tick = function("void update_player_runtime_animation(")
    assert "update_player_runtime_animation(player_moved_this_frame);" in source
else:
    tick = "void update_player_runtime_animation(bool player_moved_this_frame) {\n" + block(
        source.index("if (player_moved_this_frame) {\n            gbs::update_sprite_animator_travel")
    ) + "\n}"

code = r'''
#include <cassert>
#include "gbs/project.hpp"
#include "gbs/animation.hpp"
#include "gbs/topdown_run.hpp"
gbs::TopDownProjectData project {};
gbs::Actor player {};
gbs::EventState event_state {};
gbs::InputState current_input {};
gbs::SpriteAnimatorState player_animator {};
gbs::Vec2i player_animation_travelled_pixels {};
bool player_walk_clip_active = false;
int player_animation_speed_percent = 100;
const gbs::TopDownActorSpriteData* selected_player_sprite_data() { return nullptr; }
''' + (manual_state.group(0) if manual_state else "") + "\n" + constants + "\n" + "\n".join([
    function("bool topdown_has_walk_directional_animations("),
    function("bool topdown_has_idle_directional_animations("),
    function("int topdown_directional_animation_index("),
    function("void refresh_player_runtime_animation("),
    function("void refresh_player_directional_animation("),
    tick,
]) + "\nvoid consume_animation_request() {\n" + consumer + r'''
}
int main() {
    const gbs::MetaSpritePart parts[] = {{0, 0, 0, 0, false, false}};
    const gbs::SpriteAnimationFrame frames[] = {
        {gbs::MetaSprite {parts, 1}, 1}, {gbs::MetaSprite {parts, 1}, 1}
    };
    const gbs::SpriteAnimation idle {frames, 1, true, 1};
    const gbs::SpriteAnimation walk {frames, 2, true, 2};
    const gbs::SpriteAnimation custom {frames, 2, true, 99};
    const gbs::SpriteAnimation once {frames, 2, false, 100};
    const gbs::SpriteAnimation* clips[] = {
        &idle, &idle, &idle, &idle, &walk, &walk, &walk, &walk, &custom, &once
    };
    project.player.animation = &idle;
    project.player.animations = clips;
    project.player.animation_count = 10;
    project.player.animation_speed_percent = 100;
    gbs::init_sprite_animator(player_animator);
    event_state.player_animation_changed = true;
    event_state.player_animation_index = -99;
    consume_animation_request();
    assert(!event_state.player_animation_changed);
    assert(player_animator.animation == &custom);
    refresh_player_directional_animation(false);
    assert(player_animator.animation == &custom);
    update_player_runtime_animation(false);
    assert(player_animator.frame_index == 1);
    event_state.player_animation_changed = true;
    event_state.player_animation_index = -99;
    consume_animation_request();
    assert(player_animator.frame_index == 1);
    refresh_player_directional_animation(false);
    assert(player_animator.animation == &custom);
    update_player_runtime_animation(false);
    assert(player_animator.frame_index == 0);

    // An absent named clip must not unexpectedly replace the active clip.
    event_state.player_animation_changed = true;
    event_state.player_animation_index = -101;
    consume_animation_request();
    assert(player_animator.animation == &custom);

    // Movement returns presentation to the normal directional walk.
    refresh_player_directional_animation(true);
    assert(player_animator.animation == &walk);
    assert(player_walk_clip_active);
    event_state.player_animation_changed = true;
    event_state.player_animation_index = -101;
    consume_animation_request();
    assert(player_animator.animation == &walk && player_walk_clip_active);
    player_animation_travelled_pixels = {1, 0};
    update_player_runtime_animation(true);
    assert(player_animator.frame_index == 1);
    refresh_player_directional_animation(false);
    assert(player_animator.animation == &idle);
    update_player_runtime_animation(false);
    assert(player_animator.frame_index == 0);

    // A non-looping scripted clip finishes in time, then returns to idle.
    event_state.player_animation_changed = true;
    event_state.player_animation_index = -100;
    consume_animation_request();
    refresh_player_directional_animation(false);
    update_player_runtime_animation(false);
    assert(player_animator.animation == &once && player_animator.frame_index == 1);
    update_player_runtime_animation(false);
    assert(!player_animator.playing);
    refresh_player_directional_animation(false);
    assert(player_animator.animation == &idle);
}
'''
with tempfile.TemporaryDirectory(prefix="gbs-player-script-animation-",
                                 dir=os.environ.get("TMPDIR")) as directory:
    path = Path(directory)
    (path / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-Iengine/include", str(path / "test.cpp"), "engine/src/gbs_animation.cpp",
                    "-o", str(path / "test")], cwd=root, check=True)
    subprocess.run([str(path / "test")], check=True)
print("Topdown Player: scripted clip, idle, clock ticks, absent clip, movement and completion: PASS")
