"""Exercise the actual Top-down gesture consumer, target and lifetime."""
from pathlib import Path
import re, subprocess, tempfile
root = Path(__file__).resolve().parents[2]
source = (root / 'examples/topdown_basic/src/main.cpp').read_text()
def function(signature):
    m = re.search(re.escape(signature) + r'[^;{]*\{', source)
    assert m, f'Top-down is missing the gesture consumer: {signature}'
    end = source.index('{', m.start()) + 1
    depth = 1
    while depth:
        depth += (source[end] == '{') - (source[end] == '}')
        end += 1
    return source[m.start():end]
parts = [function(s) for s in ['void consume_topdown_actor_gesture(', 'void tick_topdown_actor_gesture(', 'void draw_topdown_actor_gesture(']]
assert 'consume_topdown_actor_gesture();' in source
assert 'tick_topdown_actor_gesture();' in source
assert 'draw_topdown_actor_gesture(render_camera);' in source
code = r'''
#include <cassert>
#include "gbs/project.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/render.hpp"
gbs::EventState event_state {};
gbs::EventPlayerRuntimeState player_event_runtime {true,0,0,0};
bool scene_player_enabled=true;
bool controlled_player_active() { return player_event_runtime.active && scene_player_enabled; }
gbs::Actor player {};
gbs::TopDownActorRuntime npc_runtimes[2] {};
size_t current_npc_count() { return 2; }
int drawn = 0; gbs::Vec2i drawn_at {};
namespace gbastudio_project {
gbs::MetaSpritePart part {0,0,0,0,false,false};
gbs::MetaSprite sprite {&part,1};
gbs::DialogueEmoteEntry dialogue_emote_assets[] = {{"spark", &sprite}};
size_t dialogue_emote_asset_count = 1;
}
namespace gbs {
bool event_actor_effect_visible(const EventState&, int) { return true; }
Vec2i dialogue_emote_position_pixels(Vec2i p) { return {p.x,p.y-16}; }
void set_metasprite(int index,const MetaSprite&,Vec2i p) { assert(index==dialogue_emote_oam_index); ++drawn; drawn_at=p; }
}
'''+'\n'.join(parts)+r'''
int main() {
    player.position_pixels = {120,80}; npc_runtimes[1].actor.position_pixels={72,112};
    npc_runtimes[1].active=true; npc_runtimes[1].visible=true;
    event_state.actor_gesture_changed=true; event_state.actor_gesture_actor=1;
    event_state.actor_gesture_index=0; event_state.actor_gesture_frames=3;
    consume_topdown_actor_gesture(); assert(!event_state.actor_gesture_changed);
    draw_topdown_actor_gesture({8,4}); assert(drawn==1 && drawn_at.x==64 && drawn_at.y==76);
    tick_topdown_actor_gesture(); tick_topdown_actor_gesture(); draw_topdown_actor_gesture({8,4}); assert(drawn==2);
    tick_topdown_actor_gesture(); draw_topdown_actor_gesture({8,4}); assert(drawn==2);
    event_state.actor_gesture_changed=true; event_state.actor_gesture_actor=-1;
    event_state.actor_gesture_index=0; event_state.actor_gesture_frames=2; consume_topdown_actor_gesture();
    draw_topdown_actor_gesture({8,4}); assert(drawn==3 && drawn_at.x==112 && drawn_at.y==44);
    player_event_runtime.active=false; draw_topdown_actor_gesture({8,4}); assert(drawn==3);
    player_event_runtime.active=true; scene_player_enabled=false; draw_topdown_actor_gesture({8,4}); assert(drawn==3);
    scene_player_enabled=true; event_state.actor_gesture_index=9; draw_topdown_actor_gesture({8,4}); assert(drawn==3);
    event_state.actor_gesture_index=0; event_state.actor_gesture_actor=7; draw_topdown_actor_gesture({8,4}); assert(drawn==3);
    event_state.actor_gesture_actor=1; npc_runtimes[1].visible=false; draw_topdown_actor_gesture({8,4}); assert(drawn==3);
}
'''
with tempfile.TemporaryDirectory(prefix='gbs-gesture-') as d:
    p=Path(d); (p/'test.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17','-I',str(root/'engine/include'),str(p/'test.cpp'),'-o',str(p/'test')],check=True)
    subprocess.run([str(p/'test')],check=True)
print('Top-down actor gesture targets, visibility and lifetime PASS')
