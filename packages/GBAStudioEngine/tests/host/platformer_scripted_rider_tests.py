"""Exercise the actual Platformer temporal-movement consumer with a rider."""
from pathlib import Path
import os
import subprocess
import tempfile

root = Path(__file__).resolve().parents[2]
source = (root / "examples/platformer_basic/src/main.cpp").read_text()
start = source.index("void tick_platformer_scripted_movements()")
brace = source.index("{", start)
end, depth = brace + 1, 1
while depth:
    depth += (source[end] == "{") - (source[end] == "}")
    end += 1
consumer = source[start:end]
code = r'''
#include <cassert>
#include "gbs/project.hpp"
#include "gbs/platformer.hpp"
#include "gbs/scripted_movement.hpp"
constexpr size_t max_room_npcs = 2;
gbs::ScriptedMovementPool platformer_scripted_movements{};
gbs::PlatformerNpcRuntime platformer_npc_runtimes[max_room_npcs]{};
size_t platformer_npc_count = 1;
gbs::PlatformerActor player{};
bool player_event_active = true;
int platformer_player_script_speed = 100;
int platformer_npc_script_speeds[max_room_npcs] = {100,100};
gbs::EventState event_state{};
gbs::PlatformerRoom room{};
gbs::PlatformerRoomData room_data[1]{};
gbs::PlatformerProjectData project{};
int current_room=0;
''' + consumer + r'''
int main() {
    uint8_t tiles[16*16]{};room.collision={tiles,16,16};
    project.rooms=room_data;project.room_count=1;room_data[0].config.platform_actor_collision_group=2;
    auto& npc=platformer_npc_runtimes[0];
    npc.active=npc.visible=true;npc.collision_group=2;
    npc.actor={{32,64},{32,4},1};npc.actor.collision_offset_pixels={-16,-4};
    player=gbs::platformer_actor_from_rect({24,44,8,16},{});player.on_ground=true;
    gbs::init_event_state(event_state);event_state.supports_temporal_actor_motion=true;
    auto move=[&](int dx,int dy){
        const gbs::EventCommand commands[]={{gbs::EventOp::MoveActorTo,0,
            static_cast<int16_t>(npc.actor.position_pixels.x+dx),static_cast<int16_t>(npc.actor.position_pixels.y+dy)}};
        gbs::EventRunner runner{};gbs::start_event_runner(runner,{commands,1});
        assert(gbs::update_event_runner(runner,event_state));
        assert(gbs::start_scripted_movement(platformer_scripted_movements,event_state.actor_commands[0]));
        gbs::clear_event_actor_commands(event_state);
        for(int i=0;i<16&&runner.actor_motion_pending;i++)tick_platformer_scripted_movements();
        assert(!runner.actor_motion_pending);
        gbs::stop_event_runner(runner);
    };
    move(0,-4);
    assert(npc.actor.position_pixels.y==60); // The rider cannot block its own platform.
    assert(player.bounds_pixels.y==40 && player.on_ground);
    move(0,4);assert(npc.actor.position_pixels.y==64 && player.bounds_pixels.y==44);
    move(3,0);assert(npc.actor.position_pixels.x==35 && player.bounds_pixels.x==27);
    // Jumping away stops the ride; the platform may descend without dragging it.
    player.velocity_x256.y=-256;move(0,4);
    assert(npc.actor.position_pixels.y==68 && player.bounds_pixels.y==44);
    // An ordinary NPC still collides with the player instead of lifting it.
    player=gbs::platformer_actor_from_rect({27,48,8,16},{});player.on_ground=true;
    npc.collision_group=0;move(0,-1);
    assert(npc.actor.position_pixels.y==68 && player.bounds_pixels.y==48);
}
'''
sources = ["gbs_event.cpp", "gbs_dialogue_locale.cpp", "gbs_platformer.cpp", "gbs_topdown.cpp",
           "gbs_isometric.cpp", "gbs_runtime.cpp", "gbs_rtc.cpp", "gbs_link.cpp", "rumble.cpp",
           "deferred_work.cpp", "gbs_engine_global.cpp"]
with tempfile.TemporaryDirectory(prefix="gbs-scripted-rider-") as directory:
    temp=Path(directory);(temp/"test.cpp").write_text(code)
    subprocess.run([os.environ.get("CXX","clang++"),"-std=c++17","-Wall","-Wextra","-Werror",
                    "-Iengine/include",str(temp/"test.cpp"),
                    *["engine/src/"+name for name in sources],"tests/host/hw_stubs.cpp",
                    "tests/host/motion_render_stubs.cpp","-o",str(temp/"test")],cwd=root,check=True)
    subprocess.run([str(temp/"test")],check=True)
print("Platformer temporal platform: rider carries up/down/sideways; jumping and ordinary NPC collision PASS")
