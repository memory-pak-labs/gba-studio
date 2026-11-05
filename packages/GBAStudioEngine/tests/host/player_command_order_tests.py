"""Run real scripts and Player consumers with ordered sprite/clip/frame requests."""
from pathlib import Path
import os
import re
import subprocess
import sys
import tempfile

root = Path(__file__).resolve().parents[2]
sources = ["gbs_event.cpp", "gbs_dialogue_locale.cpp", "gbs_runtime.cpp", "gbs_rtc.cpp",
           "gbs_link.cpp", "rumble.cpp", "deferred_work.cpp", "gbs_engine_global.cpp", "gbs_animation.cpp"]


def block(text, start):
    brace = text.index("{", start)
    end, depth = brace + 1, 1
    while depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    return text[start:end]


def function(text, signature):
    found = re.search(re.escape(signature) + r"[^;{]*\{", text)
    assert found, signature
    return block(text, found.start())


common = r'''
#include <cassert>
#include <initializer_list>
#include "gbs/project.hpp"
#include "gbs/platformer.hpp"
#include "gbs/animation.hpp"
#include "gbs/event_animation.hpp"
#include "gbs/topdown_run.hpp"
#include "gbs/visual_effects.hpp"
// Visibility hardware is outside the command/animator test boundary.
namespace gbs { void consume_visibility_event_commands(const EventState&) {} }
gbs::EventState event_state {};
gbs::EventPlayerRuntimeState player_event_runtime {true, 0, 0, 0};
gbs::SpriteAnimatorState player_animator {};
int player_animation_speed_percent = 100;
bool player_script_animation_active = false;
'''
clips = r'''
    const gbs::MetaSpritePart parts[] = {{0, 0, 0, 0, false, false}};
    const gbs::SpriteAnimationFrame frames[] = {
        {gbs::MetaSprite {parts, 1}, 1}, {gbs::MetaSprite {parts, 1}, 1},
        {gbs::MetaSprite {parts, 1}, 1}, {gbs::MetaSprite {parts, 1}, 1}
    };
    const gbs::SpriteAnimation idle_a {frames, 1, true, 1};
    const gbs::SpriteAnimation idle_b {frames, 1, true, 2};
    const gbs::SpriteAnimation custom_a {frames, 4, true, 99};
    const gbs::SpriteAnimation custom_b {frames, 4, true, 99};
    const gbs::SpriteAnimation other {frames, 4, true, 100};
'''


def topdown():
    text = (root / "examples/topdown_basic/src/main.cpp").read_text()
    constants = text[text.index("constexpr int topdown_directional_idle_down_index"):
                     text.index("bool topdown_has_walk_directional_animations")]
    output = function(text, "void consume_event_outputs(")
    legacy = block(output, output.index("if (event_state.player_animation_changed)")) if "if (event_state.player_animation_changed)" in output else ""
    before = legacy if legacy and output.index(legacy) < output.index("consume_player_event_commands();") else ""
    after = legacy if legacy and not before else ""
    code = common + r'''
gbs::TopDownProjectData project {};
gbs::Actor player {};
gbs::InputState current_input {};
gbs::Vec2i player_animation_travelled_pixels {};
bool player_walk_clip_active = false;
const gbs::TileAsset* player_streamed_tile_asset_loaded = nullptr;
// Rendering uploads are irrelevant to command ordering; animator and core are real.
bool load_streamed_animation_frame_tiles(const gbs::SpriteAnimatorState&, const gbs::TileAsset*&) { return true; }
''' + constants + "\n" + "\n".join(function(text, signature) for signature in [
        "bool topdown_has_walk_directional_animations(", "bool topdown_has_idle_directional_animations(",
        "int topdown_directional_animation_index(", "const gbs::TopDownActorSpriteData* selected_player_sprite_data(",
        "void refresh_player_runtime_animation(", "void refresh_player_directional_animation(",
        "void update_player_runtime_animation(", "void apply_player_sprite_variant(",
        "void consume_player_event_commands(",
    ]) + "\nvoid consume() {\n" + before + "\nconsume_player_event_commands();\n" + after + r'''
    gbs::reset_event_actor_commands(event_state);
}
int main() {
''' + clips + r'''
    const gbs::SpriteAnimation* clips_a[] = {&idle_a, &idle_a, &idle_a, &idle_a, &custom_a, &custom_a, &custom_a, &custom_a, &other};
    const gbs::SpriteAnimation* clips_b[] = {&idle_b, &idle_b, &idle_b, &idle_b, &custom_b, &custom_b, &custom_b, &custom_b, &other};
    const gbs::TopDownActorSpriteData variants[] = {{nullptr, &idle_a, clips_a, 9}, {nullptr, &idle_b, clips_b, 9}};
    project.actor_sprites = variants; project.actor_sprite_count = 2;
    project.player.animation = &idle_a; project.player.animations = clips_a;
    project.player.animation_count = 9; project.player.animation_speed_percent = 100;
    const auto reset = [&] {
        gbs::init_event_state(event_state); player = {};
        player_event_runtime = {true, 0, 0, 0}; player_event_runtime.sprite_index = 0;
        apply_player_sprite_variant();
    };
    const auto run = [&](std::initializer_list<gbs::EventCommand> commands) {
        gbs::run_event_script(event_state, commands.begin(), commands.size()); consume();
    };
    reset();
    run({{gbs::EventOp::SetActorSprite, -1, 1, 0}, {gbs::EventOp::SetPlayerAnimation, -99, 0, 0},
         {gbs::EventOp::SetActorAnimationFrame, -1, 2, 0}, {gbs::EventOp::SetActorAnimationSpeed, -1, 25, 0}});
    assert(player_animator.animation == &custom_b && player_script_animation_active);
    assert(player_animator.frame_index == 2 && player_animation_speed_percent == 25);
    assert(!event_state.player_animation_changed);
    for (int i = 0; i < 3; ++i) update_player_runtime_animation(false);
    assert(player_animator.frame_index == 2);
    update_player_runtime_animation(false);
    assert(player_animator.frame_index == 3);
    consume();
    assert(player_animator.frame_index == 3); // A cleared batch is not replayed.

    reset();
    run({{gbs::EventOp::SetPlayerAnimation, -99, 0, 0}, {gbs::EventOp::SetActorSprite, -1, 1, 0}});
    assert(player_animator.animation == &idle_b && !player_script_animation_active);
    assert(player_animation_speed_percent == 100 && player_animator.frame_index == 0);

    reset();
    run({{gbs::EventOp::SetActorSprite, -1, 1, 0}, {gbs::EventOp::SetActorAnimationSpeed, -1, 25, 0},
         {gbs::EventOp::SetActorSprite, -1, 0, 0}, {gbs::EventOp::SetPlayerAnimation, -99, 0, 0}});
    assert(player_animator.animation == &custom_a && player_script_animation_active);
    assert(player_animation_speed_percent == 100); // The later sprite resets its defaults.

    run({{gbs::EventOp::SetActorAnimationFrame, -1, 2, 0}, {gbs::EventOp::SetPlayerAnimation, -100, 0, 0}});
    assert(player_animator.animation == &other && player_animator.frame_index == 0);
    run({{gbs::EventOp::SetActorAnimationFrame, -1, 2, 0}, {gbs::EventOp::SetPlayerAnimation, -404, 0, 0},
         {gbs::EventOp::SetActorAnimation, 0, -99, 0}});
    assert(player_animator.animation == &other && player_animator.frame_index == 2);
}
'''
    return code


def platformer():
    text = (root / "examples/platformer_basic/src/main.cpp").read_text()
    whole = function(text, "void consume_platformer_actor_commands(")
    start = whole.index("for (size_t index = 0; index < event_state.actor_command_count; ++index)")
    loop = block(whole, start)
    request = "consume_platformer_player_animation_request();"
    before = request if whole.find(request) < start else ""
    after = request if whole.rfind(request) >= start + len(loop) else ""
    code = common + "\ngbs::PlatformerProjectData project {};\ngbs::PlatformerActor player {};\n" + function(text, "void consume_platformer_player_animation_request(") + "\nvoid consume() {\n" + before + "\n" + loop + "\n" + after + r'''
    gbs::reset_event_actor_commands(event_state);
}
int main() {
''' + clips.replace("    const gbs::SpriteAnimation idle_b {frames, 1, true, 2};\n", "").replace("    const gbs::SpriteAnimation custom_b {frames, 4, true, 99};\n", "") + r'''
    const gbs::SpriteAnimation* animations[] = {&idle_a, &custom_a, &other};
    project.player_script_animations = animations; project.player_script_animation_count = 3;
    gbs::init_event_state(event_state); gbs::play_sprite_animation(player_animator, idle_a);
    const auto run = [&](std::initializer_list<gbs::EventCommand> commands) {
        gbs::run_event_script(event_state, commands.begin(), commands.size()); consume();
    };
    run({{gbs::EventOp::SetPlayerAnimation, -99, 0, 0}, {gbs::EventOp::SetActorAnimationFrame, -1, 2, 0},
         {gbs::EventOp::SetPlayerAnimation, -100, 0, 0}});
    assert(player_animator.animation == &other && player_animator.frame_index == 0);
    run({{gbs::EventOp::SetPlayerAnimation, -99, 0, 0}, {gbs::EventOp::SetActorAnimationFrame, -1, 2, 0},
         {gbs::EventOp::SetActorAnimationSpeed, -1, 25, 0}});
    assert(player_animator.animation == &custom_a && player_animator.frame_index == 2);
    assert(player_script_animation_active && player_animation_speed_percent == 25);
    run({{gbs::EventOp::SetPlayerAnimation, -404, 0, 0}, {gbs::EventOp::SetActorAnimation, 0, -100, 0}});
    assert(player_animator.animation == &custom_a && player_animator.frame_index == 2);
    consume();
    assert(player_animator.frame_index == 2 && !event_state.player_animation_changed);
}
'''
    return code


for profile in (sys.argv[1:] or ("topdown", "platformer")):
    code = {"topdown": topdown, "platformer": platformer}[profile]()
    with tempfile.TemporaryDirectory(prefix=f"gbs-{profile}-player-order-", dir=os.environ.get("TMPDIR")) as directory:
        temp = Path(directory); (temp / "test.cpp").write_text(code)
        subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                        "-Iengine/include", str(temp / "test.cpp"), *["engine/src/" + name for name in sources],
                        "tests/host/hw_stubs.cpp", "-o", str(temp / "test")], cwd=root, check=True)
        subprocess.run([str(temp / "test")], check=True)
    print(f"{profile}: real script and Player clip/frame/speed ordering PASS")
