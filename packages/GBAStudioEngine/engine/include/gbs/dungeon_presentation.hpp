#pragma once
#include <stddef.h>
#include <stdint.h>
#include "gbs/assets.hpp"
#include "gbs/types.hpp"

namespace gbs {
// Offsets are in uint16_t elements. Pattern IDs belong to ROM, never VRAM.
struct DungeonViewEntry { uint8_t x, y, direction; uint32_t map_offset, palette_offset; uint16_t palette_colors; };
struct DungeonViewCache {
    const uint8_t* tiles; size_t tile_bytes;
    const uint16_t* maps; size_t map_words;
    const uint16_t* palettes; size_t palette_words;
    const DungeonViewEntry* views; size_t view_count;
};
inline const DungeonViewEntry* find_dungeon_view(const DungeonViewCache& cache, int x, int y, int direction) {
    for (size_t i=0;i<cache.view_count;++i) {
        const auto& v=cache.views[i]; if(v.x==x && v.y==y && v.direction==direction) return &v;
    }
    return nullptr;
}
// Prepare completely before uploading. A failure cannot partially update VRAM.
inline int prepare_dungeon_view(const DungeonViewCache& cache, const DungeonViewEntry& view,
    uint16_t* map, size_t cells, uint16_t* resident, size_t capacity) {
    if (!cache.tiles || !cache.maps || !cache.palettes || !map || !resident ||
        view.map_offset%2 || view.map_offset>cache.map_words || cells>(cache.map_words-view.map_offset)/2 ||
        !view.palette_colors || view.palette_colors>224 || view.palette_colors%16 ||
        view.palette_offset>cache.palette_words || view.palette_colors>cache.palette_words-view.palette_offset) return -1;
    size_t count=0;
    uint16_t lookup[1024] {};
    for(size_t c=0;c<cells;++c) {
        const uint16_t id=cache.maps[view.map_offset+c*2], flags=cache.maps[view.map_offset+c*2+1];
        if(size_t(id)*32+32>cache.tile_bytes || (flags&1023) || (flags>>12)*16>=view.palette_colors) return -1;
        if(!id) {map[c]=0;continue;}
        size_t slot=(unsigned(id)*40503u)&1023u;
        while(lookup[slot] && resident[lookup[slot]-1]!=id)slot=(slot+1)&1023u;
        size_t local=lookup[slot]?lookup[slot]-1:count;
        if(local==count) {if(count>=capacity || count>=511)return -1;resident[count++]=id;lookup[slot]=uint16_t(local+1);}
        map[c]=uint16_t(flags | (local+1));
    }
    return int(count);
}
enum class DungeonPose : uint8_t { Idle, Alert, Attack, Hurt, Defend, Defeat, Reactivate, CellActive, CellCharged };
constexpr int dungeon_camera_bob(unsigned age) { return age>=1 && age<=3 ? 1 : age>=6 && age<=8 ? -1 : 0; }
// World placement is independent from whether the actor supplies depth clips.
constexpr Vec2i dungeon_actor_view_anchor(int distance, int lateral, unsigned step_age) {
    return {120+lateral*100/distance,58+48/distance+dungeon_camera_bob(step_age)};
}
constexpr uint8_t dungeon_pose_frame(DungeonPose pose, unsigned age) {
    switch(pose) {
    case DungeonPose::Alert:return age<9?0:age<18?1:0;
    case DungeonPose::Attack:return age<7?2:age<14?3:0;
    case DungeonPose::Hurt:return age<7?4:0;
    case DungeonPose::Defend:return 5;
    case DungeonPose::Defeat:return 6;
    case DungeonPose::Reactivate:return age<10?6:age<20?1:7;
    case DungeonPose::CellActive:return (age/15)%2;
    case DungeonPose::CellCharged:return age<10?3:age<20?1:0;
    default:return 0;
    }
}
struct DungeonActorFrames { const SpriteAnimation* near; const SpriteAnimation* mid; const SpriteAnimation* far; bool cell=false; };
struct DungeonCrawlerPlayerView {
    const MetaSprite* metasprite;
    const SpriteAnimation* animation;
    Vec2i anchor;
};
inline const SpriteAnimationFrame* dungeon_player_view_frame(const DungeonCrawlerPlayerView& view, uint32_t age) {
    const auto* animation=view.animation;
    if(!animation || !animation->frames || !animation->frame_count)return nullptr;
    uint32_t duration=0;
    for(uint8_t i=0;i<animation->frame_count;++i)duration+=animation->frames[i].duration_frames?animation->frames[i].duration_frames:1;
    age=animation->loop?age%duration:(age<duration?age:duration-1);
    for(uint8_t i=0;i<animation->frame_count;++i){
        const auto& frame=animation->frames[i];
        const uint32_t ticks=frame.duration_frames?frame.duration_frames:1;
        if(age<ticks)return &frame;
        age-=ticks;
    }
    return nullptr;
}
struct DungeonPresentation {
    const DungeonViewCache* views;
    int hud_background_index=-1;
    const PaletteAsset* hud_palette=nullptr;
    int step_sfx=-1, turn_sfx=-1, blocked_sfx=-1, hit_sfx=-1, defeat_sfx=-1;
    const char* player_label="Player";
};
} // namespace gbs
