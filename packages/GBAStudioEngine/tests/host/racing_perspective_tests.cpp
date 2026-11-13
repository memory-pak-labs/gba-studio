#include <assert.h>
#include <initializer_list>
#include "gbs/racing.hpp"
#include "gbs/racing_camera.hpp"

int main() {
    static constexpr uint8_t panorama_pixels[64] {};
    static constexpr uint16_t panorama_entries[32*8] {}, colors[224] {};
    static constexpr uint8_t floor_pixels[64] {}, floor_entries[64*64] {};
    const gbs::TileAsset panorama {panorama_pixels,233,0,false,gbs::ColorDepth::Bpp8};
    const gbs::TileMapAsset panorama_map {panorama_entries,32,8};
    const gbs::AffineTileAsset floor {floor_pixels,236,0};
    const gbs::AffineTileMapAsset floor_map {floor_entries,64,64};
    const gbs::PaletteAsset palette {colors,224,0};
    const gbs::RacingPseudo3DVisualData visual {48,&panorama,&panorama_map,&palette,&floor,&floor_map,&palette};
    assert(gbs::is_valid_racing_pseudo3d_visual_data(visual));
    assert(gbs::racing_panorama_base_tile(visual)==64);
    const auto relocated=gbs::racing_panorama_map_entry(17,visual);
    assert(relocated==81);
    assert(gbs::racing_panorama_map_entry(0x4011,visual)==0x4051);
    constexpr gbs::RacingCameraConfig camera {};
    const gbs::Vec2i player { 256 * 256, 256 * 256 };
    auto north = gbs::racing_camera_pose(player, 0, camera);
    auto east = gbs::racing_camera_pose(player, 1024, camera);
    assert(north.y_x256 > player.y && north.x_x256 == player.x);
    assert(east.x_x256 < player.x && east.y_x256 == player.y);
    auto origin = gbs::racing_camera_project(north, player, camera, 48);
    assert(origin.visible && origin.x == 120 && origin.y == 120 && origin.scale_x256 == 256);
    // A fixed follow-camera distance must keep the player's screen anchor
    // stable throughout a turn, including interpolated compass angles.
    for (const auto config : {gbs::RacingCameraConfig {48,64,96}, gbs::RacingCameraConfig {56,80,96}}) {
        const int expected_y = 48 + config.height * config.focal_length / config.distance;
        for (uint16_t angle = 0; angle < 4096; ++angle) {
            const auto pose = gbs::racing_camera_pose(player, angle, config);
            const auto projected = gbs::racing_camera_project(pose, player, config, 48);
            assert(projected.visible && projected.x == 120 && projected.y == expected_y);
            assert(projected.depth_x256 == config.distance * 256 && projected.scale_x256 == 256);
        }
    }
    assert(!gbs::racing_camera_project({0,0,0,0}, player, camera, 48).visible);
    auto ahead = gbs::racing_camera_project(north, { player.x, player.y - 64 * 256 }, camera, 48);
    assert(ahead.visible && ahead.x == 120 && ahead.y < origin.y && ahead.scale_x256 < origin.scale_x256);
    auto behind = gbs::racing_camera_project(north, { player.x, player.y + 128 * 256 }, camera, 48);
    assert(!behind.visible);
    auto row = gbs::racing_camera_floor_line(east, camera, 48, 120);
    assert(row.pa == 0 && row.pc > 0);
    assert(row.reference_x_8 == player.x);
    assert(row.reference_y_8 + row.pc * 120 == player.y);
    const auto basis=gbs::racing_camera_floor_basis(camera,48,120);
    const auto cached=gbs::racing_camera_floor_from_basis(east,basis);
    assert(cached.pa==row.pa && cached.pc==row.pc);
    assert(cached.reference_x_8==row.reference_x_8 && cached.reference_y_8==row.reference_y_8);

    static uint8_t flags[64 * 64] = {};
    static constexpr gbs::RacingTopdownCheckpoint gates[] = {
        { "finish", { 256, 256 }, 24, 24 }
    };
    static constexpr gbs::Vec2i path[] = {{256,256},{384,256},{384,384},{256,384}};
    constexpr gbs::RacingTopdownTrackData track {0,0,gates,1,4,path,4};
    gbs::RacingRoomData room { "circuit", flags,64,64,{1024,2048,3072,512}, {256,256} };
    room.config.pseudo3d = {gbs::RacingPresentation::Pseudo3D,9,1,0,1,0,false};
    room.topdown_track=&track;
    auto state=gbs::make_racing_runtime_state(room);
    const auto minimap=gbs::racing_circuit_minimap_position({256,256},room,{200,8},{32,32});
    assert(minimap.x==216 && minimap.y==24);
    state.speed_x256=1024;
    assert(gbs::tick_racing_vehicle(state,room,{true,false,0}));
    assert(state.position_x256 > 256*256 && state.position_y256==256*256);
    const auto before=state.heading_x256;
    gbs::tick_racing_vehicle(state,room,{true,false,1});
    assert(state.heading_x256 > before);
    // Standing inside a one-gate finish must not create a lap every frame.
    state=gbs::make_racing_runtime_state(room);
    for(int i=0;i<30;++i) gbs::tick_racing_vehicle(state,room,{false,false,0});
    assert(state.lap_count==0);
    // The front of the chassis hits a wall before its center enters that tile.
    flags[32*64+34]=1;
    state=gbs::make_racing_runtime_state(room);state.speed_x256=1024;
    bool blocked=false;
    for(int i=0;i<8;++i) if(!gbs::tick_racing_vehicle(state,room,{true,false,0})) blocked=true;
    assert(blocked && state.position_x256 < 272*256 && state.collision_frames>0);
    while (state.speed_x256 > 0) gbs::tick_racing_vehicle(state,room,{false,true,0});
    const int crashed_x=state.position_x256;
    const int distance_before_reverse=state.distance_x256;
    for(int i=0;i<30;++i) assert(gbs::tick_racing_vehicle(state,room,{false,true,0}));
    assert(state.speed_x256 < 0 && state.position_x256 < crashed_x-256);
    assert(state.speed_x256 >= -room.config.max_speed_x256/2);
    assert(state.distance_x256 == distance_before_reverse);
    const auto reverse_heading=state.heading_x256;
    assert(gbs::tick_racing_vehicle(state,room,{false,true,1}));
    assert(state.heading_x256 < reverse_heading); // steering reverses while backing up
    for(int i=0;i<60 && state.speed_x256<0;++i) gbs::tick_racing_vehicle(state,room,{true,false,0});
    assert(state.speed_x256 == 0); // accelerate first stops reverse motion
    gbs::tick_racing_vehicle(state,room,{true,false,0});
    assert(state.speed_x256 > 0);
    flags[32*64+34]=0;
    static constexpr gbs::RacingTopdownCheckpoint reverse_gate[] = {
        {"reverse-gate",{250,256},4,8}
    };
    constexpr gbs::RacingTopdownTrackData reverse_track {0,0,reverse_gate,1,4,path,4};
    room.topdown_track=&reverse_track;
    state=gbs::make_racing_runtime_state(room);
    for(int i=0;i<30;++i) gbs::tick_racing_vehicle(state,room,{false,true,0});
    assert(state.position_x256 < 248*256 && state.checkpoint_count == 0 && state.lap_count == 0);
    for(int i=0;i<120 && state.speed_x256<0;++i) gbs::tick_racing_vehicle(state,room,{});
    assert(state.speed_x256 == 0); // releasing reverse slows the car to a stop
    flags[32*64+30]=1;
    room.topdown_track=&track;
    state=gbs::make_racing_runtime_state(room);
    state.last_checkpoint=-1;
    assert(!gbs::tick_racing_vehicle(state,room,{false,true,0}));
    assert(state.speed_x256 == 0 && state.position_x256 == 256*256);
    assert(state.checkpoint_count == 0 && state.lap_count == 0);
    flags[32*64+30]=0;
    static constexpr gbs::RacingTopdownCheckpoint narrow_gates[]={
        {"finish",{256,256},1,1},{"gate",{265,256},1,1}
    };
    constexpr gbs::RacingTopdownTrackData narrow_track{0,0,narrow_gates,2,4,path,4,true};
    room.topdown_track=&narrow_track;room.config.max_speed_x256=4096;
    state=gbs::make_racing_runtime_state(room);state.speed_x256=4096;
    gbs::tick_racing_vehicle(state,room,{true,false,0});
    assert(state.checkpoint_count==1 && state.lap_count==0);
}
