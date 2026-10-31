#include <cassert>
#include <cstring>
#include "gbs/racing_minimap.hpp"
int main() {
    constexpr uint8_t flags[64*64] {};
    constexpr gbs::Vec2i path[]={{80,80},{432,80},{432,432},{80,432}};
    constexpr gbs::RacingTopdownCheckpoint gates[]={{"finish",{240,80},16,72}};
    const gbs::RacingTopdownTrackData track{0,0,gates,1,4,path,4};
    gbs::RacingRoomData room{"map",flags,64,64,{1024,2048,3072,512},{240,80}};
    room.topdown_track=&track;room.actor_count=2;
    room.config.pseudo3d.show_minimap=true;
    assert(gbs::racing_uses_generated_minimap(room));
    gbs::RacingPseudo3DVisualData custom {};
    constexpr uint16_t map_entries[1] {};
    const gbs::TileMapAsset map {map_entries,1,1};custom.minimap_tilemap=&map;room.pseudo3d_visual=&custom;
    assert(!gbs::racing_uses_generated_minimap(room));
    room.pseudo3d_visual=nullptr;
    auto state=gbs::make_racing_runtime_state(room);
    uint8_t tiles[gbs::racing_minimap_bytes] {};
    gbs::rasterize_racing_minimap(tiles,room,state);
    assert(gbs::racing_minimap_pixel(tiles,0,0)==7);
    assert(gbs::racing_minimap_pixel(tiles,32,20)==6);
    const auto player=gbs::racing_minimap_point({240,80},room);
    assert(gbs::racing_minimap_pixel(tiles,player.x,player.y)==9);
    assert(player.x>5&&player.x<59&&player.y>=5&&player.y<35);
    for(int i=0;i<gbs::racing_minimap_bytes;++i) assert((tiles[i]&15)>=6 && (tiles[i]&15)<12 && (tiles[i]>>4)>=6 && (tiles[i]>>4)<12);

    // Cache reuse must preserve the exact image, including overlapping markers,
    // stale marker restoration, checkpoint changes and re-entering a room.
    gbs::RacingMinimapCache cache {};
    uint8_t cached[gbs::racing_minimap_bytes] {};
    assert(gbs::update_racing_minimap(cache,cached,room,state));
    assert(std::memcmp(cached,tiles,sizeof(tiles))==0);
    assert(!gbs::update_racing_minimap(cache,cached,room,state));
    for(int frame=0;frame<300;++frame) {
        state.position_x256=((frame*17)%512)*256;
        state.position_y256=((frame*29)%512)*256;
        state.rival_distance_x256=frame*13*256;
        state.checkpoint_count=frame/40;
        gbs::update_racing_minimap(cache,cached,room,state);
        gbs::rasterize_racing_minimap(tiles,room,state);
        assert(std::memcmp(cached,tiles,sizeof(tiles))==0);
    }
    cache.frame_valid=false; // A dialogue may overwrite the UI tile storage.
    assert(gbs::update_racing_minimap(cache,cached,room,state));
    gbs::RacingRoomData other=room;
    other.width_tiles=48;other.height_tiles=40;
    assert(gbs::update_racing_minimap(cache,cached,other,state));
    gbs::rasterize_racing_minimap(tiles,other,state);
    assert(std::memcmp(cached,tiles,sizeof(tiles))==0);
}
