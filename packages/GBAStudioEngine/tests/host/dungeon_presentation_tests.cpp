#include <cassert>
#include "gbs/dungeon_presentation.hpp"

int main() {
    const auto far_actor=gbs::dungeon_actor_view_anchor(4,0,0);
    assert(far_actor.x==120 && far_actor.y==70);
    const auto side_actor=gbs::dungeon_actor_view_anchor(2,1,0);
    assert(side_actor.x==170 && side_actor.y==82);
    assert(gbs::dungeon_actor_view_anchor(1,0,2).y==107);
    const gbs::SpriteAnimationFrame hand_frames[] = {{{nullptr,0},2},{{nullptr,0},3}};
    gbs::SpriteAnimation hand_animation {hand_frames,2,true};
    const gbs::DungeonCrawlerPlayerView hand {nullptr,&hand_animation,{200,120}};
    assert(gbs::dungeon_player_view_frame(hand,0)==&hand_frames[0]);
    assert(gbs::dungeon_player_view_frame(hand,2)==&hand_frames[1]);
    assert(gbs::dungeon_player_view_frame(hand,5)==&hand_frames[0]);
    hand_animation.loop=false;
    assert(gbs::dungeon_player_view_frame(hand,100)==&hand_frames[1]);
    const gbs::DungeonCrawlerPlayerView static_hand {nullptr,nullptr,{200,120}};
    assert(gbs::dungeon_player_view_frame(static_hand,100)==nullptr);
    const uint16_t cells[] = {5, 0x3400, 8, 0x1000, 5, 0x3800, 0, 0};
    const uint8_t tiles[9 * 32] = {};
    const uint16_t palette[64] = {};
    const gbs::DungeonViewEntry views[] = {{2, 3, 1, 0, 0, 64}};
    const gbs::DungeonViewCache cache {tiles, sizeof(tiles), cells, 8, palette, 64, views, 1};
    assert(gbs::find_dungeon_view(cache, 2, 3, 1) == views);
    assert(gbs::find_dungeon_view(cache, 2, 3, 2) == nullptr);
    uint16_t map[4] {}, resident[4] {};
    const int count = gbs::prepare_dungeon_view(cache, views[0], map, 4, resident, 4);
    assert(count == 2);
    assert(resident[0] == 5 && resident[1] == 8);
    assert(map[0] == (0x3400 | 1) && map[1] == (0x1000 | 2));
    assert(map[2] == (0x3800 | 1) && map[3] == 0); // flips and palette survive; transparent tile stays zero
    assert(gbs::prepare_dungeon_view(cache, views[0], map, 4, resident, 1) == -1);
    auto bad = views[0]; bad.map_offset = 1;
    assert(gbs::prepare_dungeon_view(cache, bad, map, 4, resident, 4) == -1);
    const uint16_t invalid[] = {9, 0, 0, 0, 0, 0, 0, 0};
    auto invalid_cache = cache; invalid_cache.maps = invalid;
    assert(gbs::prepare_dungeon_view(invalid_cache, views[0], map, 4, resident, 4) == -1);
    assert(gbs::dungeon_pose_frame(gbs::DungeonPose::Attack, 0) == 2);
    assert(gbs::dungeon_pose_frame(gbs::DungeonPose::Attack, 7) == 3);
    assert(gbs::dungeon_pose_frame(gbs::DungeonPose::Hurt, 0) == 4);
    assert(gbs::dungeon_pose_frame(gbs::DungeonPose::Defeat, 100) == 6);
    assert(gbs::dungeon_pose_frame(gbs::DungeonPose::CellActive, 15) == 1);
    assert(gbs::dungeon_camera_bob(0) == 0 && gbs::dungeon_camera_bob(2) == 1);
    assert(gbs::dungeon_camera_bob(7) == -1 && gbs::dungeon_camera_bob(11) == 0);
}
