"""Execute production entry loaders, including their physical BG choices."""
from pathlib import Path
import subprocess
import tempfile
root=Path(__file__).resolve().parents[2]
def function(path, signature):
    source=(root/path).read_text();start=source.index(signature);brace=source.index('{',start);end=brace+1;depth=1
    while depth:
        if source[end]=='{':depth+=1
        elif source[end]=='}':depth-=1
        end+=1
    return source[start:end]
common=r'''
#include <cassert>
#include "gbs/engine.hpp"
#include "gbs/render.hpp"
#include "gbs/isometric.hpp"
#include "gbs/racing.hpp"
#include "gbs/point_click.hpp"
#include "gbs/battle_rpg_presentation.hpp"
#include "gbs/dungeon_crawler.hpp"
#include "gbs/dungeon_presentation.hpp"
#include "gbs/scene_script_runner.hpp"
bool selected_affine=false, wrapped=false;
uint16_t observed_backdrop=17;
int map_uploads=0,raster_calls=0;bool bg1_enabled=false,gradient_observed=false;
namespace gbs {
bool apply_video_composition(const VideoComposition&) { return true; }
bool set_scene_raster_effects(const SceneRasterEffects& effects, DisplayMode) { ++raster_calls;gradient_observed=effects.gradient.enabled;return true; }
bool apply_scene_background_video(const VideoComposition& video) { selected_affine=video.affine_enabled;if(selected_affine)bg1_enabled=false; return true; }
bool load_palette(const PaletteAsset&,bool) { return true; }
bool load_tiles(const TileAsset&) { return true; }
bool load_bg_tiles_at_character_base(const TileAsset&,uint8_t) { return true; }
bool load_affine_tiles(BackgroundLayer,const AffineTileAsset&) { return true; }
bool load_affine_tilemap(BackgroundLayer,const AffineTileMapAsset&) { return true; }
bool load_tilemap(BackgroundLayer,const TileMapAsset&) { ++map_uploads;return true; }
void set_backdrop_color(uint16_t color) { ::observed_backdrop=color; }
bool consume_event_palette_changes(EventState&, const PaletteAsset*, size_t, const PaletteAsset*, size_t) { return true; }
void set_display_mode(DisplayMode) {}
void set_ui_character_base(uint8_t) {}
void set_bg_character_base(BackgroundLayer,uint8_t) {}
void set_bg_screen_base(BackgroundLayer,uint8_t) {}
void set_bg_color_depth(BackgroundLayer,ColorDepth) {}
void set_bg_priority(BackgroundLayer,uint8_t) {}
void set_bg_enabled(BackgroundLayer layer,bool enabled) { if(layer==BackgroundLayer::BG1)bg1_enabled=enabled; }
void render_ui_assets() {}
void init_sprite_animator(SpriteAnimatorState& state) {state={};}
uint32_t frame_count() {return 0;}
void set_bg_scroll(BackgroundLayer,int,int) {}
void set_affine_bg_wrap(BackgroundLayer,bool wrap) { wrapped=wrap; }
void disable_hblank_effects() {}
void disable_window0() {}
void set_window0(const WindowConfig&) {}
}
'''
isometric=common+r'''
gbs::IsometricProjectData project {};
gbs::IsometricRoomData room {};
const gbs::IsometricRoomData* room_data=&room;
'''+function('examples/isometric_basic/src/main.cpp','void load_assets(const gbs::VideoComposition& video)')+'\n'+function('examples/isometric_basic/src/main.cpp','void consume_event_state(gbs::EventState& event_state)').split('    consume_link_event_outputs(event_state);')[0]+'}\n'+r'''
int main() { auto video=gbs::default_video_composition();video.affine_enabled=true;load_assets(video);assert(selected_affine);
 gbs::EventState state{};room.video=video;consume_event_state(state);assert(observed_backdrop==17);
 room.video.affine_enabled=false;project.backdrop_color=23;consume_event_state(state);assert(observed_backdrop==23); }
'''
racing=common+r'''
gbs::RacingProjectData project {};
int current_room_index=0,racing_minimap_cache=0;
bool racing_dialogue_was_drawn=false,assets_are_streamed=false;
gbs::Vec2i previous_pseudo3d_player_marker{},previous_pseudo3d_rival_marker{};
uint16_t relocated_panorama_map[4096]{};
'''+function('templates/exported_racing/main.cpp','bool has_authored_background(')+function('templates/exported_racing/main.cpp','const gbs::RacingPseudo3DVisualData* pseudo3d_visual(')+function('templates/exported_racing/main.cpp','void apply_room_visuals()')+r'''
int main() {
 const uint8_t tiles[64]{}, map[256]{};const uint16_t colors[1]{};
 const gbs::AffineTileAsset floor{tiles,1,0};const gbs::AffineTileMapAsset tilemap{map,16,16};const gbs::PaletteAsset palette{colors,1,0};
 const gbs::RacingPseudo3DVisualData visual{48,nullptr,nullptr,nullptr,&floor,&tilemap,&palette,nullptr,nullptr,nullptr};
 gbs::RacingRoomData room{};room.config.pseudo3d.presentation=gbs::RacingPresentation::Pseudo3D;room.pseudo3d_visual=&visual;
 room.video.raster.gradient.enabled=true;
 project.rooms=&room;project.room_count=1;
 assert(gbs::is_valid_racing_pseudo3d_visual_data(visual));
 apply_room_visuals();assert(wrapped);assert(raster_calls==1 && gradient_observed); // a linear course starts at negative texture Y
 gbs::RacingTopdownTrackData circuit{};circuit.checkpoint_count=1;room.topdown_track=&circuit;
 apply_room_visuals();assert(!wrapped); // circuit source coordinates retain finite map edges
}
'''
point_click=common+r'''
gbs::PointClickProjectData project {};
gbs::DialogueState dialogue {};
gbs::SceneScriptRunner scene_scripts {};
int pending_scene_index=-1, started_scene_index=-1;
bool run_scene_script(gbs::EventScript script) { scene_scripts.wait_frames=gbs::has_event_script(script)?10:0;return true; }
void consume_event_state() {}
void start_scene(int index) { started_scene_index=index; }
void persist_point_click_runtime_state() {}
'''+function('templates/exported_point_click/main.cpp','void queue_scene_transition(')+r'''
int main() {
 gbs::PointClickSceneData scenes[2]{};project.scenes=scenes;project.scene_count=2;
 const gbs::EventCommand commands[]={{gbs::EventOp::Wait,10,0,0}};
 scenes[0].on_exit={commands,1};
 scene_scripts={};queue_scene_transition(scenes[0],1);
 assert(pending_scene_index==1 && started_scene_index==-1);
 scene_scripts={};scenes[0].on_exit={};pending_scene_index=-1;
 queue_scene_transition(scenes[0],1);assert(started_scene_index==1);
}
'''
battle=common+r'''
gbs::BattleRpgProjectData project {};
bool battle_ui_restore_pending=false,outcome_visual_started=false;
gbs::BattleRpgActorPresentation party_visuals[1]{},enemy_visuals[1]{};
gbs::SpriteAnimatorState effect_animator {};
const gbs::TileAsset* effect_loaded_tiles=nullptr;
int outcome_visual_frames=0,hurt_sound_delay=0;
bool stream_encounter_resource_group(const gbs::BattleRpgEncounterData&) {return true;}
'''+function('templates/exported_battle_rpg/main.cpp','void apply_battle_visuals(')+r'''
int main() {
 gbs::BattleRpgBackgroundData hud{};hud.layer=gbs::BackgroundLayer::BG1;
 project.backgrounds=&hud;project.background_count=1;
 gbs::BattleRpgPresentationData presentation{};presentation.hud_background_index=0;
 gbs::BattleRpgEncounterData encounter{};encounter.background_index=-1;encounter.presentation=&presentation;encounter.video.affine_enabled=true;
 apply_battle_visuals(encounter);assert(selected_affine && map_uploads==1 && bg1_enabled);
}
'''
dungeon=common+r'''
gbs::DungeonCrawlerProjectData project{};int current_room_index=0;
uint32_t dungeon_player_view_started_at=0,dungeon_step_at=0,dungeon_cell_collected_at=0;
const gbs::TileAsset* dungeon_player_uploaded_tiles=nullptr;
bool assets_are_streamed=false,dungeon_cell_interacting=false;
void invalidate_dungeon_view_cache() {}
void dungeon_set_pose(gbs::DungeonPose) {}
'''+function('templates/exported_dungeon_crawler/main.cpp','void apply_room_visuals()')+r'''
int main() {
 gbs::DungeonCrawlerRoomData room{};room.background_index=-1;room.video.affine_enabled=true;
 project.rooms=&room;project.room_count=1;
 apply_room_visuals();assert(selected_affine && !bg1_enabled);
}
'''
with tempfile.TemporaryDirectory() as directory:
    for name,source in [('isometric',isometric),('racing',racing),('point_click',point_click),('battle',battle),('dungeon',dungeon)]:
        cpp=Path(directory)/(name+'.cpp');cpp.write_text(source);binary=Path(directory)/name
        subprocess.run(['c++','-std=c++17','-Wall','-Wextra','-Werror','-I'+str(root/'engine/include'),str(cpp),'-o',str(binary)],check=True)
        subprocess.run([str(binary)],check=True)
print('Isometric and racing prepared-background consumers: PASS')
