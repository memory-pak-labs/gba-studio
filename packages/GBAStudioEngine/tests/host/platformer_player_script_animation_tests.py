"""Production Platformer Player consumer, presentation and named export regressions."""
from pathlib import Path
import argparse
import importlib.util
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "examples/platformer_basic/src/main.cpp").read_text()
header = (root / "engine/include/gbs/platformer.hpp").read_text()


def function(signature, text=source):
    match = re.search(re.escape(signature) + r"[^;{]*\{", text)
    if not match:
        return None
    end, depth = match.end(), 1
    while depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    return text[match.start():end]


def compile_run(code, extra_sources=()):
    with tempfile.TemporaryDirectory(prefix="gbs-platformer-player-") as directory:
        path = Path(directory)
        (path / "test.cpp").write_text(code)
        subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                        "-Iengine/include", str(path / "test.cpp"), *extra_sources,
                        "-o", str(path / "test")], cwd=root, check=True)
        subprocess.run([str(path / "test")], check=True)


def consumer_test():
    consume = function("void consume_platformer_player_animation_request(")
    # Before this regression there is no Player request consumer in the runtime.
    if consume is None:
        assert "event_state.player_animation_changed" not in source
        consume = "void consume_platformer_player_animation_request() {}"
    else:
        assert "consume_platformer_player_animation_request();" in function("void consume_platformer_actor_commands(")
    tick = function("void update_platformer_player_runtime_animation(")
    if tick is None:
        start = source.index("const gbs::SpriteAnimation* player_animation = gbs::update_platformer_player_presentation(")
        body = source[start:source.index("gbs::run_event_script(event_state, room_data->on_update)", start)]
        tick = "void update_platformer_player_runtime_animation(gbs::InputState player_input, bool landed) {\n" + body.replace("!was_on_ground && player.on_ground", "landed") + "\n}"
    else:
        assert "update_platformer_player_runtime_animation(player_input, !was_on_ground && player.on_ground);" in source
    manual = re.search(r"^bool player_script_animation_active[^\n]*", source, re.M)
    advance = function("void advance_platformer_runtime_animations(") or "void advance_platformer_runtime_animations() {}"
    if "void advance_platformer_runtime_animations(" in source:
        runtime = function("gbs::RuntimeAdapterFrameResult update_platformer_runtime(")
        call = runtime.index("advance_platformer_runtime_animations();")
        assert runtime[:call].count("{") - runtime[:call].count("}") == 2, "Animation clock must be outside the world/script-wait branch"
    reset = function("void reset_platformer_player_runtime_animation(") or "void reset_platformer_player_runtime_animation() {}"
    data = "project.player_script_animations = clips; project.player_script_animation_count = 3;" if "player_script_animation_count" in header else "project.player_animations.walk = &custom;"
    core = (root / "engine/src/gbs_platformer.cpp").read_text()
    automatic = "\nnamespace gbs {\nconstexpr int abs_int(int x) { return x < 0 ? -x : x; }\n" + "\n".join(
        function(signature, core) for signature in ["PlatformerActorAnimationState platformer_actor_animation_state(",
            "const SpriteAnimation* platformer_player_animation_for_state(",
            "const SpriteAnimation* update_platformer_player_presentation("]
    ) + "\n}\n"
    code = r'''
#include <cassert>
#include "gbs/platformer.hpp"
#include "gbs/animation.hpp"
gbs::PlatformerProjectData project {};
gbs::PlatformerActor player {};
gbs::EventState event_state {};
gbs::SpriteAnimatorState player_animator {};
gbs::PlatformerPlayerPresentation player_presentation {};
bool player_hurt_presentation_requested = false;
int player_animation_speed_percent = 100;
const gbs::TileAsset* player_streamed_tile_asset_loaded = nullptr;
size_t platformer_npc_count = 1;
gbs::PlatformerNpcRuntime platformer_npc_runtimes[1] {};
gbs::SpriteAnimatorState platformer_npc_animators[1] {};
''' + (manual.group(0) if manual else "bool player_script_animation_active = false;") + automatic + "\n" + reset + "\n" + consume + "\n" + tick + "\n" + advance + r'''
void present(gbs::InputState input = {}) {
    update_platformer_player_runtime_animation(input, false);
    advance_platformer_runtime_animations();
}
int main() {
    const gbs::MetaSpritePart parts[] = {{0, 0, 0, 0, false, false}};
    const gbs::SpriteAnimationFrame frames[] = {{gbs::MetaSprite {parts, 1}, 1}, {gbs::MetaSprite {parts, 1}, 1}};
    const gbs::SpriteAnimation idle {frames, 1, true, 1};
    const gbs::SpriteAnimation walk {frames, 2, true, 4};
    const gbs::SpriteAnimation custom {frames, 2, true, 2};
    const gbs::SpriteAnimation once {frames, 2, false, 3};
    [[maybe_unused]] const gbs::SpriteAnimation* clips[] = {&idle, &custom, &once};
    project.player_animations.idle = &idle; project.player_animations.walk = &walk;
    player.on_ground = true;
''' + data + r'''
    gbs::play_sprite_animation(player_animator, idle);
    event_state.player_animation_changed = true; event_state.player_animation_index = -2;
    consume_platformer_player_animation_request();
    assert(!event_state.player_animation_changed);
    assert(player_animator.animation == &custom && player_script_animation_active);
    platformer_npc_runtimes[0].active = true;
    platformer_npc_runtimes[0].visible = true;
    platformer_npc_runtimes[0].animation_speed_percent = 100;
    gbs::play_sprite_animation(platformer_npc_animators[0], custom);
    // A scene Wait bypasses physics/presentation; both clocks still run once.
    advance_platformer_runtime_animations();
    assert(player_animator.animation == &custom && player_animator.frame_index == 1);
    assert(platformer_npc_animators[0].frame_index == 1);
    event_state.player_animation_changed = true; event_state.player_animation_index = -2;
    consume_platformer_player_animation_request();
    assert(player_animator.frame_index == 1); // Repeated request preserves phase.
    event_state.player_animation_changed = true; event_state.player_animation_index = -99;
    consume_platformer_player_animation_request();
    assert(player_animator.animation == &custom && player_animator.frame_index == 1);
    advance_platformer_runtime_animations();
    assert(player_animator.frame_index == 0); // Time advances without locomotion.
    player.velocity_x256.x = 256;
    present({gbs::ButtonRight, gbs::ButtonRight, 0});
    assert(!player_script_animation_active && player_animator.animation == &walk);
    player.velocity_x256.x = 0;
    event_state.player_animation_changed = true; event_state.player_animation_index = -3;
    consume_platformer_player_animation_request();
    present();
    assert(player_animator.animation == &once && player_animator.frame_index == 1);
    present();
    assert(!player_animator.playing);
    advance_platformer_runtime_animations();
    assert(player_animator.animation == &idle && !player_script_animation_active);
    event_state.player_animation_changed = true; event_state.player_animation_index = -2;
    consume_platformer_player_animation_request();
    project.player_animations.hurt = &once; player_hurt_presentation_requested = true;
    present();
    assert(!player_script_animation_active && player_animator.animation == &once);
    reset_platformer_player_runtime_animation();
    assert(!player_script_animation_active && player_animator.animation == &idle);
    assert(player_animation_speed_percent == 100);
}
'''
    compile_run(code, ["engine/src/gbs_animation.cpp"])
    print("Platformer Player: request, clock, missing key, phase, input, completion and reset: PASS")


def export_test():
    spec = importlib.util.spec_from_file_location("assetc_platformer_animation", root / "tools/assetc/assetc.py")
    assetc = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(assetc)
    project = {"player": {"animation": "idle_clip", "animations": {"idle": "idle_clip"},
                          "script_animations": [{"name": "idle_right", "animation": {"symbol": "idle_clip"}},
                                                {"name": "salute", "animation": {"symbol": "custom_clip"}}]},
               "rooms": [{"name": "room", "width_tiles": 4, "height_tiles": 3,
                          "visual_tiles": [0] * 12, "collision_flags": [0] * 12,
                          "player_start": {"x": 0, "y": 0, "width": 8, "height": 8}}],
               "scripts": [[{"op": "set_player_animation", "animation": "salute"}]]}
    try:
        emitted = assetc.emit_platformer_project_data_header(project)
    except SystemExit as error:
        raise AssertionError("An authored Player clip outside automatic states must be exported") from error
    assert "platformer_player_script_animations" in emitted
    with tempfile.TemporaryDirectory(prefix="gbs-platformer-export-") as directory:
        path = Path(directory); (path / "generated.hpp").write_text(emitted)
        code = r'''
#include <cassert>
#include "gbs/platformer.hpp"
constexpr gbs::MetaSpritePart part {0,0,0,0,false,false};
constexpr gbs::SpriteAnimationFrame frame {gbs::MetaSprite {&part,1},1};
constexpr gbs::SpriteAnimation idle_clip {&frame,1,true};
constexpr gbs::SpriteAnimation custom_clip {&frame,1,true};
''' + '#include "' + str(path / "generated.hpp") + r'''"
int main() {
 const auto& p = gbastudio_platformer_project::project;
 assert(p.player_script_animation_count == 2);
 const auto& command = p.scripts[0].commands[0];
 assert(command.op == gbs::EventOp::SetPlayerAnimation && command.a < 0);
 assert(gbs::platformer_player_animation_for_index(p, command.a) == p.player_script_animations[1]);
 assert(gbs::platformer_player_animation_for_index(p, -99) == nullptr);
}
'''
        compile_run(code)
    print("Platformer Player named clip table survives assetc and compiled lookup: PASS")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(); parser.add_argument("--case", choices=["consumer", "export"])
    case = parser.parse_args().case
    if case in (None, "consumer"): consumer_test()
    if case in (None, "export"): export_test()
