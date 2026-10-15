"""Authored directions keep their orientation and composed OBJ drawing."""
from pathlib import Path
import subprocess
import tempfile
root=Path(__file__).resolve().parents[2]
source=(root/'examples/topdown_basic/src/main.cpp').read_text()
start=source.index('bool topdown_direction_uses_horizontal_flip(')
end=source.index('\n}',start)+2
code='''#include <cassert>
#include <initializer_list>
#include <cstdint>
#include <cstddef>
namespace gbs { enum class TopDownActorDirection : uint8_t {Down,Up,Left,Right,DownLeft,DownRight,UpLeft,UpRight}; }
''' + source[start:end] + '''
int main() {
    for(uint8_t direction=0;direction<8;++direction)
        assert(!topdown_direction_uses_horizontal_flip(direction,1));
    // Directional exports already carry authored or exporter-generated hflip.
    for(size_t count : {size_t(4),size_t(8)})
        for(uint8_t direction=0;direction<8;++direction)
            assert(!topdown_direction_uses_horizontal_flip(direction,count));
    assert(!topdown_direction_uses_horizontal_flip(2,8));
}
'''
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory);(path/'check.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17',str(path/'check.cpp'),'-o',str(path/'check')],check=True)
    subprocess.run([str(path/'check')],check=True)
print('Topdown authored directions avoid a second horizontal flip: PASS')

start=source.index('void set_actor_metasprite(');end=source.index('\n}',start)+2
code='''#include <cassert>
#include "gbs/project.hpp"
#include "gbs/render.hpp"
#include "gbs/visual_effects.hpp"
gbs::VisualEffectsController visual_effects {};
int drawn_priority=-1, drawn_x=0; bool drawn_flip=false;
namespace gbs {
uint32_t frame_count() { return 0; }
void set_sprite(int, const Sprite& sprite) { drawn_priority=sprite.priority; drawn_flip=sprite.hflip; drawn_x=sprite.x; }
bool set_affine_sprite_transform(uint8_t, const AffineSpriteTransform&) { return false; }
bool visual_effect_sprite_mosaic_enabled(const VisualEffectsController&) { return false; }
bool sample_affine_matrix(AffineMatrix&,const AffineMatrixKeyframe*,size_t,uint32_t,Easing) { return false; }
}
''' + source[source.index('bool topdown_direction_uses_horizontal_flip('):source.index('\n}',source.index('bool topdown_direction_uses_horizontal_flip('))+2] + source[start:end] + '''
int main() {
    const gbs::MetaSpritePart part {0,0,0,0,false,false,16,16};
    const gbs::MetaSprite sprite {&part,1};
    set_actor_metasprite(0,sprite,{10,20},{16,16},false);
    assert(drawn_priority==2); // Below HUD images at 0/1 and foreground BG1.
    const gbs::MetaSpritePart authored_left {-8,-40,0,0,false,false,32,32};
    const gbs::MetaSprite left {&authored_left,1};
    set_actor_metasprite(0,left,{10,20},{16,16},topdown_direction_uses_horizontal_flip(3,8));
    assert(drawn_x==2 && !drawn_flip);
    const gbs::MetaSpritePart exported_mirror {-8,-40,0,0,true,false,32,32};
    const gbs::MetaSprite mirrored {&exported_mirror,1};
    set_actor_metasprite(0,mirrored,{10,20},{16,16},topdown_direction_uses_horizontal_flip(3,8));
    assert(drawn_x==2 && drawn_flip); // Preserve exporter mirroring exactly once.
}
'''
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory);(path/'check.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(path/'check.cpp'),'-o',str(path/'check')],check=True)
    subprocess.run([str(path/'check')],check=True)
print('Topdown world actors remain behind the HUD: PASS')

start=source.index('    gbs::init_dialogue(dialogue);')
end=source.index('    gbs::init_hud(hud);',start)
code='''#include <cassert>
int dialogue=0, base_font=1, hud_font=2; const int* selected_font=nullptr;
namespace gbastudio_project { const int* dialogue_font=&base_font; }
namespace gbs {
void init_dialogue(int&) {}
void configure_dialogue_font(const int* font) { selected_font=font; }
}
void configure_dialogue_ui_for_active_room(bool) { gbs::configure_dialogue_font(&hud_font); }
int main() {
''' + '\n'.join(line for line in source[start:end].splitlines() if 'configure_dialogue_font(' in line or 'configure_dialogue_ui_for_active_room(' in line) + '''
assert(selected_font==&hud_font);
}
'''
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory);(path/'check.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17',str(path/'check.cpp'),'-o',str(path/'check')],check=True)
    subprocess.run([str(path/'check')],check=True)
print('Topdown initialization keeps the authored scene font: PASS')

# A slow patrol keeps its walk cycle between discrete movement updates.
start=source.index('void refresh_npc_directional_animation(size_t index, bool moving) {')
end=source.index('\n}',start)+2
code='''#include <cassert>
#include "gbs/project.hpp"
struct FakeProject { const gbs::TopDownRoomData* rooms; };
gbs::TopDownRoomData room_data {};
FakeProject project { &room_data };
int current_room=0;
gbs::TopDownActorRuntime npc_runtimes[1] {};
gbs::SpriteAnimatorState animator {};
const gbs::MetaSpritePart part {0,0,0,0,false,false,16,16};
const gbs::MetaSprite meta {&part,1};
const gbs::SpriteAnimationFrame idle_frames[] {{meta,60}};
const gbs::SpriteAnimationFrame walk_frames[] {{meta,8},{meta,8},{meta,8},{meta,8}};
const gbs::SpriteAnimation idle {idle_frames,1,true}, walk {walk_frames,4,true};
namespace gbs {
const TopDownActorSpriteData* topdown_actor_sprite_for_index(const FakeProject&, int) { return nullptr; }
}
bool topdown_has_idle_directional_animations(size_t count) { return count>=4; }
int topdown_directional_animation_index(size_t,uint8_t,bool moving) { return moving?4:0; }
void refresh_npc_runtime_animation(size_t index,bool playing) {
    const auto& next=npc_runtimes[index].animation_index==4?walk:idle;
    if (animator.animation!=&next) gbs::play_sprite_animation(animator,next);
    if(!playing) gbs::stop_sprite_animation(animator);
}
''' + source[start:end] + '''
int main() {
    gbs::TopDownNpcData npc {};
    npc.movement.kind=gbs::TopDownNpcMovementKind::WanderBox;
    npc.movement.step_interval_frames=2; npc.animation_count=8;
    room_data.npcs=&npc; room_data.npc_count=1;
    npc_runtimes[0].active=true; npc_runtimes[0].visible=true;
    npc_runtimes[0].movement_speed_x100=100;
    unsigned visited=0;
    gbs::init_sprite_animator(animator);
    for(int frame=0;frame<32;++frame) {
        npc_runtimes[0].movement_frame_counter=frame%2==0?0:1;
        refresh_npc_directional_animation(0,frame%2==0);
        assert(animator.animation==&walk);
        visited|=1u<<animator.frame_index;
        gbs::update_sprite_animator(animator);
    }
    assert(visited==15u);
    npc_runtimes[0].movement_cancelled=true;
    refresh_npc_directional_animation(0,false);
    assert(animator.animation==&idle);
}
''';
with tempfile.TemporaryDirectory() as directory:
    path=Path(directory);(path/'check.cpp').write_text(code)
    subprocess.run(['c++','-std=c++17','-I'+str(root/'engine/include'),str(path/'check.cpp'),str(root/'engine/src/gbs_animation.cpp'),'-o',str(path/'check')],check=True)
    subprocess.run([str(path/'check')],check=True)
print('Slow NPC patrols keep all four walk frames and stop when cancelled: PASS')
