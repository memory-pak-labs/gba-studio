"""A missing named clip preserves the real NPC consumer's pose and clock."""
from pathlib import Path
import os
import re
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
topdown = (root / "examples/topdown_basic/src/main.cpp").read_text()
platformer = (root / "examples/platformer_basic/src/main.cpp").read_text()


def block(source, start):
    end = source.index("{", start) + 1
    depth = 1
    while depth:
        depth += (source[end] == "{") - (source[end] == "}")
        end += 1
    return source[start:end]


match = re.search(r"void refresh_npc_runtime_animation\([^;{]*\{", topdown)
assert match
refresh_topdown = block(topdown, match.start())
next_animation = platformer.index("const gbs::SpriteAnimation* next_animation")
start = platformer.rindex("for (size_t index = 0; index < platformer_npc_count; ++index)", 0, next_animation)
refresh_platformer = block(platformer, start)
code = r'''
#include <cassert>
#include "gbs/project.hpp"
#include "gbs/platformer.hpp"
#include "gbs/animation.hpp"
gbs::TopDownProjectData project {};
int current_room = 0;
gbs::TopDownActorRuntime npc_runtimes[1] {};
gbs::SpriteAnimatorState npc_animators[1] {};
size_t platformer_npc_count = 1;
gbs::PlatformerNpcRuntime platformer_npc_runtimes[1] {};
gbs::SpriteAnimatorState platformer_npc_animators[1] {};
gbs::EventState event_state {};
''' + refresh_topdown + r'''
void refresh_platformer_animation(const gbs::PlatformerRoomData& room_data) {
const uint32_t animation_sync = 1;
''' + refresh_platformer + r'''
}
int main() {
    const gbs::MetaSpritePart parts[] = {{0, 0, 0, 0, false, false}};
    const gbs::SpriteAnimationFrame frames[] = {
        {gbs::MetaSprite {parts, 1}, 1}, {gbs::MetaSprite {parts, 1}, 1}
    };
    const gbs::SpriteAnimation idle {frames, 1, true, 1};
    const gbs::SpriteAnimation custom {frames, 2, true, 2};
    const gbs::SpriteAnimation* clips[] = {&idle, &custom};
    gbs::TopDownNpcData npc {};
    npc.animation = &idle; npc.animations = clips; npc.animation_count = 2;
    gbs::TopDownRoomData room {};
    room.npcs = &npc; room.npc_count = 1;
    project.rooms = &room; project.room_count = 1;
    npc_runtimes[0].sprite_index = -1;
    npc_runtimes[0].animation = &custom;
    npc_runtimes[0].animation_index = -3; // exists in another bank only
    gbs::play_sprite_animation(npc_animators[0], custom);
    gbs::update_sprite_animator(npc_animators[0]);
    assert(npc_animators[0].frame_index == 1);
    refresh_npc_runtime_animation(0, true);
    assert(npc_runtimes[0].animation == &custom);
    assert(npc_animators[0].animation == &custom && npc_animators[0].frame_index == 1);
    assert(npc_animators[0].playing);
    gbs::update_sprite_animator(npc_animators[0]);
    assert(npc_animators[0].frame_index == 0);
    refresh_npc_runtime_animation(0, false);
    assert(!npc_animators[0].playing && npc_animators[0].animation == &custom);
    npc_runtimes[0].animation_index = -1;
    refresh_npc_runtime_animation(0, true);
    assert(npc_animators[0].animation == &idle);

    gbs::PlatformerNpcData platformer_npc {};
    platformer_npc.animation = &idle;
    platformer_npc.animations = clips; platformer_npc.animation_count = 2;
    gbs::PlatformerRoomData platformer_room {};
    platformer_room.npcs = &platformer_npc; platformer_room.npc_count = 1;
    platformer_npc_runtimes[0].animation = &custom;
    platformer_npc_runtimes[0].animation_index = -3;
    gbs::play_sprite_animation(platformer_npc_animators[0], custom);
    gbs::update_sprite_animator(platformer_npc_animators[0]);
    event_state.actor_animation_playing[0] = true;
    refresh_platformer_animation(platformer_room);
    assert(platformer_npc_runtimes[0].animation == &custom);
    assert(platformer_npc_animators[0].animation == &custom);
    assert(platformer_npc_animators[0].frame_index == 1 && platformer_npc_animators[0].playing);
    platformer_npc_runtimes[0].animation_frame_changed = true;
    platformer_npc_runtimes[0].animation_frame_index = 0;
    event_state.actor_animation_playing[0] = false;
    refresh_platformer_animation(platformer_room);
    assert(!platformer_npc_animators[0].playing);
    assert(platformer_npc_animators[0].animation == &custom);
    assert(platformer_npc_animators[0].frame_index == 0);
    assert(!platformer_npc_runtimes[0].animation_frame_changed);
    platformer_npc_runtimes[0].animation_index = -1;
    event_state.actor_animation_playing[0] = true;
    refresh_platformer_animation(platformer_room);
    assert(platformer_npc_animators[0].animation == &idle && platformer_npc_animators[0].playing);
}
'''
with tempfile.TemporaryDirectory(prefix="gbs-npc-missing-animation-",
                                 dir=os.environ.get("TMPDIR")) as directory:
    path = Path(directory)
    (path / "test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX", "clang++"), "-std=c++17", "-Wall", "-Wextra", "-Werror",
                    "-Iengine/include", str(path / "test.cpp"), "engine/src/gbs_animation.cpp",
                    "-o", str(path / "test")], cwd=root, check=True)
    subprocess.run([str(path / "test")], check=True)
print("Topdown/Platformer NPC: absent clip preserves active pose/phase, stop/frame and valid clips: PASS")
