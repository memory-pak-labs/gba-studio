#pragma once
#include "gbs/racing.hpp"
#include <cstring>
namespace gbs {
constexpr bool racing_uses_generated_minimap(const RacingRoomData& room) {
    return room.config.pseudo3d.show_minimap && racing_uses_circuit_track(room) &&
        (room.pseudo3d_visual==nullptr || room.pseudo3d_visual->minimap_tilemap==nullptr);
}
constexpr int racing_minimap_width=64;
constexpr int racing_minimap_height=40;
constexpr int racing_minimap_bytes=racing_minimap_width*racing_minimap_height/2;
constexpr Vec2i racing_minimap_point(Vec2i point,const RacingRoomData& room) {
    return {5+racing_clamp_int(point.x,0,room.width_tiles*8-1)*54/(room.width_tiles*8),
        5+racing_clamp_int(point.y,0,room.height_tiles*8-1)*30/(room.height_tiles*8)};
}
inline int racing_minimap_offset(int x,int y) {return ((y/8)*8+x/8)*32+(y%8)*4+(x%8)/2;}
inline uint8_t racing_minimap_pixel(const uint8_t* data,int x,int y) {
    const uint8_t packed=data[racing_minimap_offset(x,y)];return (packed>>((x&1)*4))&15;
}
inline void racing_minimap_plot(uint8_t* data,int x,int y,uint8_t color) {
    if(x<0||x>=64||y<0||y>=40)return;
    uint8_t& packed=data[racing_minimap_offset(x,y)];
    const int shift=(x&1)*4;packed=static_cast<uint8_t>((packed&~(15<<shift))|(color<<shift));
}
inline void racing_minimap_line(uint8_t* data,Vec2i a,Vec2i b) {
    const int dx=a.x<b.x?b.x-a.x:a.x-b.x, sx=a.x<b.x?1:-1;
    const int dy=a.y<b.y?a.y-b.y:b.y-a.y, sy=a.y<b.y?1:-1;
    int error=dx+dy;
    for(;;) {
        for(int oy=-1;oy<=1;++oy)for(int ox=-1;ox<=1;++ox)racing_minimap_plot(data,a.x+ox,a.y+oy,8);
        if(a.x==b.x&&a.y==b.y)break;
        const int twice=error*2;
        if(twice>=dy){error+=dy;a.x+=sx;}if(twice<=dx){error+=dx;a.y+=sy;}
    }
}
inline void rasterize_racing_minimap_background(uint8_t* data,const RacingRoomData& room) {
    for(int i=0;i<racing_minimap_bytes;++i)data[i]=0x66;
    for(int x=0;x<64;++x){racing_minimap_plot(data,x,0,7);racing_minimap_plot(data,x,39,7);}
    for(int y=0;y<40;++y){racing_minimap_plot(data,0,y,7);racing_minimap_plot(data,63,y,7);}
    if(room.topdown_track && room.topdown_track->path_points && room.topdown_track->path_point_count>=2) {
        const auto& track=*room.topdown_track;
        for(size_t i=0;i<track.path_point_count;++i)racing_minimap_line(data,racing_minimap_point(track.path_points[i],room),racing_minimap_point(track.path_points[(i+1)%track.path_point_count],room));
    }
}
inline void rasterize_racing_minimap(uint8_t* data,const RacingRoomData& room,const RacingRuntimeState& state) {
    rasterize_racing_minimap_background(data,room);
    if(room.topdown_track && room.topdown_track->path_points && room.topdown_track->path_point_count>=2) {
        const auto& track=*room.topdown_track;
        if(track.checkpoints && track.checkpoint_count) {
            const auto point=racing_minimap_point(track.checkpoints[(state.checkpoint_count+(track.finish_at_zero?1:0))%track.checkpoint_count].center_pixels,room);
            for(int y=-1;y<=1;++y)for(int x=-1;x<=1;++x)racing_minimap_plot(data,point.x+x,point.y+y,11);
        }
        for(size_t i=0;i<room.actor_count && i<8;++i) {
            const auto point=racing_minimap_point(racing_topdown_rival_pose(state,room,i).position_pixels,room);
            for(int y=0;y<2;++y)for(int x=0;x<2;++x)racing_minimap_plot(data,point.x+x,point.y+y,10);
        }
    }
    const auto player=racing_minimap_point({state.position_x256/256,state.position_y256/256},room);
    for(int y=-1;y<=1;++y)for(int x=-1;x<=1;++x)racing_minimap_plot(data,player.x+x,player.y+y,9);
}

// The route is immutable room data. Repainting its thick lines every frame
// costs more than one GBA frame by itself; only marker pixels change in play.
struct RacingMinimapCache {
    const RacingRoomData* room=nullptr;
    const RacingTopdownTrackData* track=nullptr;
    int width=0,height=0;
    uint8_t background[racing_minimap_bytes] {};
    uint16_t markers[10] {};
    uint8_t marker_count=0;
    bool frame_valid=false;
};
static_assert(sizeof(RacingMinimapCache)<=1536,"bounded racing minimap cache");

inline bool update_racing_minimap(RacingMinimapCache& cache,uint8_t* data,
    const RacingRoomData& room,const RacingRuntimeState& state,const Vec2i* rival_positions=nullptr) {
    if(cache.room!=&room || cache.track!=room.topdown_track ||
       cache.width!=room.width_tiles || cache.height!=room.height_tiles) {
        rasterize_racing_minimap_background(cache.background,room);
        cache.room=&room;cache.track=room.topdown_track;
        cache.width=room.width_tiles;cache.height=room.height_tiles;
        cache.frame_valid=false;
    }
    uint16_t markers[10] {};uint8_t count=0;
    const auto append=[&](Vec2i point,int color) {
        markers[count++]=static_cast<uint16_t>(point.x|(point.y<<6)|(color<<12));
    };
    if(room.topdown_track && room.topdown_track->path_points && room.topdown_track->path_point_count>=2) {
        const auto& track=*room.topdown_track;
        if(track.checkpoints && track.checkpoint_count)append(racing_minimap_point(
            track.checkpoints[(state.checkpoint_count+(track.finish_at_zero?1:0))%track.checkpoint_count].center_pixels,room),11);
        for(size_t i=0;i<room.actor_count && i<8;++i)
            append(racing_minimap_point(rival_positions?rival_positions[i]:racing_topdown_rival_pose(state,room,i,false).position_pixels,room),10);
    }
    append(racing_minimap_point({state.position_x256/256,state.position_y256/256},room),9);
    bool changed=!cache.frame_valid || count!=cache.marker_count;
    for(uint8_t i=0;i<count;++i)changed=changed || markers[i]!=cache.markers[i];
    if(!changed)return false;
    std::memcpy(data,cache.background,racing_minimap_bytes);
    for(uint8_t i=0;i<count;++i) {
        const int x=markers[i]&63,y=(markers[i]>>6)&63,color=markers[i]>>12;
        const int first=color==10?0:-1;
        for(int oy=first;oy<=1;++oy)for(int ox=first;ox<=1;++ox)
            racing_minimap_plot(data,x+ox,y+oy,static_cast<uint8_t>(color));
        cache.markers[i]=markers[i];
    }
    cache.marker_count=count;cache.frame_valid=true;
    return true;
}
} // namespace gbs
