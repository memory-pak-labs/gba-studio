#include <cassert>
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/project.hpp"
#include "gbs/topdown.hpp"

namespace {

void test_player_stops_on_solid_tile() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, gbs::TileSolid, 0,
        0, 0, 0
    };
    gbs::TileMap map { flags, 3, 3 };
    gbs::Actor player { gbs::Vec2i { 7, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::update_player(map, player, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 });

    assert(player.position_pixels.x == 7);
    assert(player.position_pixels.y == 8);
}

void test_player_moves_when_clear() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, 0, 0,
        0, 0, 0
    };
    gbs::TileMap map { flags, 3, 3 };
    gbs::Actor player { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 2 };

    gbs::update_player(map, player, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 });

    assert(player.position_pixels.x == 8);
    assert(player.position_pixels.y == 10);
}

void test_directional_collision_blocks_only_matching_direction() {
    const uint8_t top_flags[] = {
        0, 0, 0,
        0, gbs::TileBlockTop, 0,
        0, 0, 0
    };
    gbs::TileMap top_map { top_flags, 3, 3 };
    gbs::Actor down_player { gbs::Vec2i { 8, 7 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::update_player(top_map, down_player, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 });
    assert(down_player.position_pixels.y == 7);

    gbs::Actor up_player { gbs::Vec2i { 8, 9 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::update_player(top_map, up_player, gbs::InputState { gbs::ButtonUp, gbs::ButtonUp, 0 });
    assert(up_player.position_pixels.y == 8);

    const uint8_t bottom_flags[] = {
        0, 0, 0,
        0, gbs::TileBlockBottom, 0,
        0, 0, 0
    };
    gbs::TileMap bottom_map { bottom_flags, 3, 3 };
    gbs::Actor bottom_player { gbs::Vec2i { 8, 9 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::update_player(bottom_map, bottom_player, gbs::InputState { gbs::ButtonUp, gbs::ButtonUp, 0 });
    assert(bottom_player.position_pixels.y == 9);
}

void test_horizontal_directional_collision() {
    const uint8_t left_flags[] = {
        0, 0, 0,
        0, gbs::TileBlockLeft, 0,
        0, 0, 0
    };
    gbs::TileMap left_map { left_flags, 3, 3 };
    gbs::Actor right_player { gbs::Vec2i { 7, 8 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::update_player(left_map, right_player, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 });
    assert(right_player.position_pixels.x == 7);

    const uint8_t right_flags[] = {
        0, 0, 0,
        0, gbs::TileBlockRight, 0,
        0, 0, 0
    };
    gbs::TileMap right_map { right_flags, 3, 3 };
    gbs::Actor left_player { gbs::Vec2i { 9, 8 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::update_player(right_map, left_player, gbs::InputState { gbs::ButtonLeft, gbs::ButtonLeft, 0 });
    assert(left_player.position_pixels.x == 9);
}

void test_tile_effect_flags_do_not_block_movement() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, static_cast<uint8_t>(gbs::TileWater | gbs::TileDamage), 0,
        0, 0, 0
    };
    gbs::TileMap map { flags, 3, 3 };
    gbs::Actor player { gbs::Vec2i { 7, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::update_player(map, player, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 });

    assert(player.position_pixels.x == 8);
    uint8_t tile_flags = gbs::tile_flags_at(map, 1, 1);
    assert(gbs::tile_flags_have_effect(tile_flags, gbs::TileWater));
    assert(gbs::tile_flags_have_effect(tile_flags, gbs::TileDamage));
    assert(!gbs::tile_flags_block_movement(tile_flags, gbs::Vec2i { 1, 0 }));
}

void test_tile_effects_for_actor_collects_overlapped_flags() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, gbs::TileWater, gbs::TileDamage, 0,
        0, gbs::TileLadder, 0, 0,
        0, 0, 0, 0
    };
    gbs::TileMap map { flags, 4, 4 };
    gbs::Actor actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 16, 16 }, 1 };

    uint8_t effects = gbs::tile_effects_for_actor(
        map,
        actor,
        static_cast<uint8_t>(gbs::TileWater | gbs::TileDamage | gbs::TileLadder)
    );

    assert((effects & gbs::TileWater) != 0);
    assert((effects & gbs::TileDamage) != 0);
    assert((effects & gbs::TileLadder) != 0);
    assert((effects & gbs::TileSolid) == 0);
}

void test_tile_flags_at_treats_null_or_out_of_bounds_as_solid() {
    gbs::TileMap empty_map { nullptr, 4, 4 };
    assert(gbs::tile_flags_at(empty_map, 1, 1) == gbs::TileSolid);

    const uint8_t flags[] = { 0, 0, 0, 0 };
    gbs::TileMap map { flags, 2, 2 };
    assert(gbs::tile_flags_at(map, -1, 0) == gbs::TileSolid);
    assert(gbs::tile_flags_at(map, 2, 1) == gbs::TileSolid);
}

void test_slope_tiles_block_only_their_solid_half() {
    const uint8_t flags[] = {
        0, 0,
        0, 0
    };
    const gbs::TileSlope slopes[] = {
        gbs::TileSlope::None,
        gbs::TileSlope::BlockAboveRising,
        gbs::TileSlope::None,
        gbs::TileSlope::None
    };
    gbs::TileMap map { flags, 2, 2, slopes };

    assert(gbs::tile_slope_at(map, 1, 0) == gbs::TileSlope::BlockAboveRising);
    assert(gbs::tile_slope_at(map, 0, 0) == gbs::TileSlope::None);
    assert(gbs::tile_slope_blocks_pixel(gbs::TileSlope::BlockAboveRising, 6, 0));
    assert(!gbs::tile_slope_blocks_pixel(gbs::TileSlope::BlockAboveRising, 1, 7));
    assert(gbs::rect_hits_blocking_tile(map, gbs::Rect { 14, 0, 1, 1 }, gbs::Vec2i { 1, 0 }));
    assert(!gbs::rect_hits_blocking_tile(map, gbs::Rect { 9, 7, 1, 1 }, gbs::Vec2i { 1, 0 }));
}

void test_player_stops_on_slope_half_and_moves_through_open_half() {
    const uint8_t flags[] = {
        0, 0,
        0, 0
    };
    const gbs::TileSlope slopes[] = {
        gbs::TileSlope::None,
        gbs::TileSlope::BlockAboveFalling,
        gbs::TileSlope::None,
        gbs::TileSlope::None
    };
    gbs::TileMap map { flags, 2, 2, slopes };
    gbs::Actor blocked_player { gbs::Vec2i { 7, 0 }, gbs::Vec2i { 1, 1 }, 1 };
    gbs::Actor clear_player { gbs::Vec2i { 7, 6 }, gbs::Vec2i { 1, 1 }, 1 };

    gbs::update_player(map, blocked_player, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 });
    gbs::update_player(map, clear_player, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 });

    assert(blocked_player.position_pixels.x == 7);
    assert(clear_player.position_pixels.x == 8);
}

void test_camera_follows_and_clamps() {
    gbs::Actor player { gbs::Vec2i { 500, 220 }, gbs::Vec2i { 16, 16 }, 1 };
    gbs::Camera camera { gbs::Vec2i { 0, 0 }, true };

    gbs::update_camera(camera, player, 512, 256);

    assert(camera.position_pixels.x == 272);
    assert(camera.position_pixels.y == 96);
}

void test_topdown_viewport_scales_from_zoom_without_fractional_pixels() {
    assert(gbs::topdown_camera_zoom_clamped_x256(64) == gbs::topdown_camera_zoom_min_x256);
    assert(gbs::topdown_camera_zoom_clamped_x256(2048) == gbs::topdown_camera_zoom_max_x256);
    assert(gbs::topdown_camera_viewport_width_pixels(256) == 240);
    assert(gbs::topdown_camera_viewport_height_pixels(256) == 160);
    assert(gbs::topdown_camera_viewport_width_pixels(512) == 120);
    assert(gbs::topdown_camera_viewport_height_pixels(512) == 80);
    assert(gbs::topdown_camera_viewport_width_pixels(128) == 480);
    assert(gbs::topdown_camera_viewport_height_pixels(128) == 320);
}

void test_camera_follows_and_clamps_using_zoomed_viewport() {
    gbs::Actor player { gbs::Vec2i { 500, 220 }, gbs::Vec2i { 16, 16 }, 1 };
    gbs::Camera camera { gbs::Vec2i { 0, 0 }, true };
    camera.zoom_x256 = 512;

    gbs::update_camera(camera, player, 512, 256);

    assert(camera.position_pixels.x == 392);
    assert(camera.position_pixels.y == 176);
}

void test_topdown_camera_zone_applies_bounds_offset_and_axis_locks() {
    gbs::Actor player { gbs::Vec2i { 64, 48 }, gbs::Vec2i { 16, 16 }, 1 };
    gbs::Camera camera { gbs::Vec2i { 0, 0 }, true };
    const gbs::CameraZone zones[] = {
        gbs::CameraZone {
            gbs::Rect { 48, 32, 64, 64 },
            gbs::Rect { 32, 16, 320, 192 },
            gbs::Vec2i { 8, -4 },
            true,
            true
        }
    };

    assert(gbs::apply_camera_zones(camera, player, zones, 1, 640, 320));
    assert(camera.bounds_enabled);
    assert(camera.position_pixels.x == 40);
    assert(camera.position_pixels.y == 16);
}

void test_collects_only_visible_actor_runtime_slots_with_stable_order() {
    gbs::TopDownActorRuntime actors[5] = {};
    actors[0].actor = gbs::Actor { gbs::Vec2i { 12, 24 }, gbs::Vec2i { 16, 16 }, 0 };
    actors[1].actor = gbs::Actor { gbs::Vec2i { 224, 24 }, gbs::Vec2i { 16, 16 }, 0 };
    actors[2].actor = gbs::Actor { gbs::Vec2i { 240, 24 }, gbs::Vec2i { 16, 16 }, 0 };
    actors[3].actor = gbs::Actor { gbs::Vec2i { 12, 160 }, gbs::Vec2i { 16, 16 }, 0 };
    actors[4].actor = gbs::Actor { gbs::Vec2i { 36, 24 }, gbs::Vec2i { 16, 16 }, 0 };
    for (gbs::TopDownActorRuntime& actor : actors) {
        actor.active = true;
        actor.visible = true;
    }
    actors[4].visible = false;

    size_t indices[2] = {};
    const size_t count = gbs::collect_visible_actor_runtime_slots(
        actors,
        5,
        gbs::Vec2i { 0, 0 },
        240,
        160,
        0,
        indices,
        2
    );

    assert(count == 2);
    assert(indices[0] == 0);
    assert(indices[1] == 1);

    size_t margin_indices[3] = {};
    const size_t margin_count = gbs::collect_visible_actor_runtime_slots(
        actors,
        5,
        gbs::Vec2i { 0, 0 },
        240,
        160,
        16,
        margin_indices,
        3
    );
    assert(margin_count == 3);
    assert(margin_indices[0] == 0);
    assert(margin_indices[1] == 1);
    assert(margin_indices[2] == 2);
}

void test_collects_visible_topdown_draw_slots_front_to_back_by_actor_feet() {
    const gbs::Actor player {
        gbs::Vec2i { 40, 40 },
        gbs::Vec2i { 16, 24 },
        0
    };
    gbs::TopDownActorRuntime actors[4] = {};
    actors[0].actor = gbs::Actor { gbs::Vec2i { 12, 24 }, gbs::Vec2i { 16, 16 }, 0 };
    actors[1].actor = gbs::Actor { gbs::Vec2i { 72, 64 }, gbs::Vec2i { 16, 16 }, 0 };
    actors[2].actor = gbs::Actor { gbs::Vec2i { 96, 48 }, gbs::Vec2i { 16, 16 }, 0 };
    actors[3].actor = gbs::Actor { gbs::Vec2i { 240, 24 }, gbs::Vec2i { 16, 16 }, 0 };
    for (gbs::TopDownActorRuntime& actor : actors) {
        actor.active = true;
        actor.visible = true;
    }

    gbs::TopDownActorDrawSlot slots[5] = {};
    const size_t count = gbs::collect_visible_topdown_actor_draw_slots(
        player,
        true,
        actors,
        4,
        gbs::Vec2i { 0, 0 },
        240,
        160,
        0,
        slots,
        5
    );

    assert(count == 4);
    assert(!slots[0].is_player);
    assert(slots[0].actor_index == 1);
    assert(slots[1].is_player);
    assert(!slots[2].is_player);
    assert(slots[2].actor_index == 2);
    assert(!slots[3].is_player);
    assert(slots[3].actor_index == 0);

    gbs::TopDownActorDrawSlot limited_slots[2] = {};
    const size_t limited_count = gbs::collect_visible_topdown_actor_draw_slots(
        player,
        true,
        actors,
        4,
        gbs::Vec2i { 0, 0 },
        240,
        160,
        0,
        limited_slots,
        2
    );
    assert(limited_count == 2);
    assert(!limited_slots[0].is_player);
    assert(limited_slots[0].actor_index == 1);
    assert(limited_slots[1].is_player);
}

void test_portal_warp() {
    const uint16_t visual_tiles[] = { 0, 0, 0, 0 };
    const uint8_t flags[] = { 0, 0, 0, 0 };
    const gbs::Portal portals[] = {
        { gbs::Rect { 8, 8, 8, 8 }, 2, gbs::Vec2i { 32, 40 }, 3, true }
    };
    gbs::Room room {
        visual_tiles,
        gbs::TileMap { flags, 2, 2 },
        portals,
        1,
        2,
        2
    };
    gbs::Actor player { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::WarpResult result = gbs::check_portals(room, player, 0);
    gbs::PortalHit hit = gbs::check_portal_hits(room, player, 0);

    assert(result.did_warp);
    assert(result.room_index == 2);
    assert(result.player_position_pixels.x == 32);
    assert(result.player_position_pixels.y == 40);
    assert(result.player_direction == 3);
    assert(hit.did_hit);
    assert(hit.portal_index == 0);
    assert(hit.warp.room_index == 2);
}

void test_portals_can_stream_between_multiple_rooms() {
    const uint16_t visual_tiles[] = { 0, 0, 0, 0 };
    const uint8_t flags[] = { 0, 0, 0, 0 };
    const gbs::Portal room_0_portals[] = {
        { gbs::Rect { 8, 8, 8, 8 }, 1, gbs::Vec2i { 24, 8 } }
    };
    const gbs::Portal room_1_portals[] = {
        { gbs::Rect { 24, 8, 8, 8 }, 0, gbs::Vec2i { 8, 8 } }
    };
    const gbs::Room rooms[] = {
        { visual_tiles, gbs::TileMap { flags, 2, 2 }, room_0_portals, 1, 2, 2 },
        { visual_tiles, gbs::TileMap { flags, 2, 2 }, room_1_portals, 1, 2, 2 }
    };
    int current_room = 0;
    gbs::Actor player { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::WarpResult first = gbs::check_portals(rooms[current_room], player, current_room);
    assert(first.did_warp);
    current_room = first.room_index;
    player.position_pixels = first.player_position_pixels;
    assert(current_room == 1);
    assert(player.position_pixels.x == 24);

    gbs::WarpResult second = gbs::check_portals(rooms[current_room], player, current_room);
    assert(second.did_warp);
    current_room = second.room_index;
    player.position_pixels = second.player_position_pixels;
    assert(current_room == 0);
    assert(player.position_pixels.x == 8);
}

void test_straight_smoke_route_reaches_portal() {
    constexpr int room_w = 64;
    constexpr int room_h = 32;
    uint16_t visual_tiles[room_w * room_h] = {};
    uint8_t collision[room_w * room_h] = {};

    for (int y = 0; y < room_h; ++y) {
        for (int x = 0; x < room_w; ++x) {
            bool border = x == 0 || y == 0 || x == room_w - 1 || y == room_h - 1;
            bool pillar = (x == 20 || x == 21) && y > 5 && y < 24;
            bool pillar_gap = pillar && y >= 13 && y <= 15;
            bool portal_gap = x == 56 && y >= 13 && y <= 15;
            bool solid = (border || (pillar && !pillar_gap)) && !portal_gap;
            collision[y * room_w + x] = solid ? gbs::TileSolid : gbs::TileEmpty;
        }
    }

    const gbs::Portal portals[] = {
        { gbs::Rect { 56 * 8, 13 * 8, 8, 24 }, 0, gbs::Vec2i { 5 * 8, 14 * 8 } }
    };
    gbs::Room room {
        visual_tiles,
        gbs::TileMap { collision, room_w, room_h },
        portals,
        1,
        room_w,
        room_h
    };
    gbs::Actor player { gbs::Vec2i { 8 * 8, 14 * 8 }, gbs::Vec2i { 16, 16 }, 1 };

    bool did_warp = false;
    for (int frame = 0; frame < 500; ++frame) {
        gbs::update_player(room.collision, player, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 });
        gbs::WarpResult result = gbs::check_portals(room, player, 0);
        if (result.did_warp) {
            player.position_pixels = result.player_position_pixels;
            did_warp = true;
            break;
        }
    }

    assert(did_warp);
    assert(player.position_pixels.x == 5 * 8);
    assert(player.position_pixels.y == 14 * 8);
}

void test_actor_path_step_routes_around_solid_tile() {
    const uint8_t flags[] = {
        1, 1, 1, 1, 1,
        1, 0, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
    };
    gbs::TileMap map { flags, 5, 4 };
    gbs::Actor actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::PathStep step = gbs::find_actor_path_step(map, actor, gbs::Vec2i { 28, 12 }, 16);

    assert(step.found);
    assert(step.delta_pixels.x == 0);
    assert(step.delta_pixels.y == 1);
}

void test_move_actor_towards_uses_path_step_and_collision() {
    const uint8_t flags[] = {
        1, 1, 1, 1, 1,
        1, 0, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
    };
    gbs::TileMap map { flags, 5, 4 };
    gbs::Actor actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    assert(gbs::move_actor_towards(map, actor, gbs::Vec2i { 28, 12 }, 16));
    assert(actor.position_pixels.x == 8);
    assert(actor.position_pixels.y == 9);
    assert(actor.direction == 0);

    assert(!gbs::move_actor_by_delta(map, actor, gbs::Vec2i { 1, 0 }));
    assert(actor.position_pixels.x == 8);
}

void test_actor_path_step_respects_search_budget() {
    const uint8_t flags[] = {
        1, 1, 1, 1, 1,
        1, 0, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
    };
    gbs::TileMap map { flags, 5, 4 };
    gbs::Actor actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::PathStep step = gbs::find_actor_path_step(map, actor, gbs::Vec2i { 28, 12 }, 1);

    assert(!step.found);
    assert(step.delta_pixels.x == 0);
    assert(step.delta_pixels.y == 0);
}

void test_actor_path_step_can_route_around_blocking_actor() {
    const uint8_t flags[] = {
        1, 1, 1, 1, 1,
        1, 0, 0, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
    };
    gbs::TileMap map { flags, 5, 4 };
    gbs::Actor actor {
        gbs::Vec2i { 8, 8 },
        gbs::Vec2i { 8, 8 },
        1,
        0,
        1,
        gbs::actor_collision_group_bit(2)
    };
    const gbs::Actor blockers[] = {
        {
            gbs::Vec2i { 16, 8 },
            gbs::Vec2i { 8, 8 },
            1,
            0,
            2,
            gbs::actor_collision_group_bit(1)
        }
    };

    gbs::PathStep blocked_step = gbs::find_actor_path_step_with_actor_collisions(
        map,
        actor,
        gbs::Vec2i { 28, 12 },
        blockers,
        1,
        16,
        false
    );

    assert(blocked_step.found);
    assert(blocked_step.delta_pixels.x == 0);
    assert(blocked_step.delta_pixels.y == 1);
}

void test_actor_path_step_nearest_reachable_when_target_blocked() {
    const uint8_t flags[] = {
        1, 1, 1, 1, 1,
        1, 0, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
    };
    gbs::TileMap map { flags, 5, 4 };
    gbs::Actor actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::PathStep exact_step = gbs::find_actor_path_step_with_actor_collisions(
        map,
        actor,
        gbs::Vec2i { 20, 12 },
        nullptr,
        0,
        16,
        false
    );
    gbs::PathStep nearest_step = gbs::find_actor_path_step_with_actor_collisions(
        map,
        actor,
        gbs::Vec2i { 20, 12 },
        nullptr,
        0,
        16,
        true
    );

    assert(!exact_step.found);
    assert(nearest_step.found);
    assert(nearest_step.delta_pixels.x == 0);
    assert(nearest_step.delta_pixels.y == 1);
}

void test_actor_overlap_and_rect_hits_actor() {
    gbs::Actor first { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::Actor second { gbs::Vec2i { 15, 8 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::Actor far { gbs::Vec2i { 32, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    assert(gbs::actor_overlaps_actor(first, second));
    assert(!gbs::actor_overlaps_actor(first, far));
    assert(gbs::rect_hits_actor(gbs::Rect { 14, 8, 2, 8 }, second));
    assert(!gbs::rect_hits_actor(gbs::Rect { 0, 0, 4, 4 }, second));
}

void test_actor_collision_box_offset_and_size_affect_runtime_hits() {
    gbs::TopDownActorRuntime runtime {
        gbs::Actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 16, 16 }, 1 },
        nullptr,
        nullptr,
        true,
        true,
        0,
        100,
        false,
        0
    };
    const gbs::EventActorCommand commands[] = {
        { gbs::EventActorOp::SetCollisionBox, 0, 4, 6, 8, 5 }
    };

    size_t applied = gbs::apply_actor_event_commands(&runtime, 1, commands, 1);

    assert(applied == 1);
    assert(runtime.actor.collision_offset_pixels.x == 4);
    assert(runtime.actor.collision_offset_pixels.y == 6);
    assert(runtime.actor.size_pixels.x == 8);
    assert(runtime.actor.size_pixels.y == 5);
    assert(gbs::rect_hits_actor(gbs::Rect { 12, 14, 1, 1 }, runtime.actor));
    assert(!gbs::rect_hits_actor(gbs::Rect { 8, 8, 2, 2 }, runtime.actor));
}

void test_player_stops_on_blocking_actor() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    };
    gbs::TileMap map { flags, 4, 3 };
    gbs::Actor player { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };
    const gbs::Actor blockers[] = {
        { gbs::Vec2i { 16, 8 }, gbs::Vec2i { 8, 8 }, 1 }
    };

    gbs::update_player_with_actor_collisions(map, player, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 }, blockers, 1);

    assert(player.position_pixels.x == 8);
    assert(player.direction == 3);
}

void test_actor_collision_groups_filter_blockers() {
    gbs::Actor mover {
        gbs::Vec2i { 8, 8 },
        gbs::Vec2i { 8, 8 },
        1,
        0,
        1,
        gbs::actor_collision_group_bit(2)
    };
    gbs::Actor blocker {
        gbs::Vec2i { 15, 8 },
        gbs::Vec2i { 8, 8 },
        1,
        0,
        2,
        gbs::actor_collision_group_bit(1)
    };
    gbs::Actor ghost {
        gbs::Vec2i { 15, 8 },
        gbs::Vec2i { 8, 8 },
        1,
        0,
        3,
        gbs::actor_collision_group_bit(1)
    };

    assert(gbs::actor_collision_group_bit(1) == 0x0002);
    assert(gbs::actor_collision_groups_overlap(mover, blocker));
    assert(!gbs::actor_collision_groups_overlap(mover, ghost));
    assert(gbs::rect_hits_any_actor(gbs::Rect { 14, 8, 2, 8 }, &ghost, 1));
    assert(!gbs::rect_hits_any_blocking_actor(gbs::Rect { 14, 8, 2, 8 }, mover, &ghost, 1));
    assert(gbs::rect_hits_any_blocking_actor(gbs::Rect { 14, 8, 2, 8 }, mover, &blocker, 1));
}

void test_player_ignores_blocker_outside_collision_mask() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    };
    gbs::TileMap map { flags, 4, 3 };
    gbs::Actor player {
        gbs::Vec2i { 8, 8 },
        gbs::Vec2i { 8, 8 },
        1,
        0,
        1,
        gbs::actor_collision_group_bit(3)
    };
    const gbs::Actor blockers[] = {
        {
            gbs::Vec2i { 16, 8 },
            gbs::Vec2i { 8, 8 },
            1,
            0,
            2,
            gbs::actor_collision_group_bit(1)
        }
    };

    gbs::update_player_with_actor_collisions(map, player, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 }, blockers, 1);

    assert(player.position_pixels.x == 9);
}

void test_actor_move_stops_on_blocking_actor() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    };
    gbs::TileMap map { flags, 4, 3 };
    gbs::Actor actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };
    const gbs::Actor blockers[] = {
        { gbs::Vec2i { 16, 8 }, gbs::Vec2i { 8, 8 }, 1 }
    };

    assert(!gbs::move_actor_by_delta_with_actor_collisions(map, actor, gbs::Vec2i { 1, 0 }, blockers, 1));
    assert(actor.position_pixels.x == 8);

    assert(gbs::move_actor_by_delta_with_actor_collisions(map, actor, gbs::Vec2i { 0, 1 }, blockers, 1));
    assert(actor.position_pixels.y == 9);
}

void test_event_bytecode() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::SetVariable, 3, 42, 0 },
        { gbs::EventOp::ShowDialogue, 7, 0, 0 },
        { gbs::EventOp::PlaySfx, 2, 0, 0 },
        { gbs::EventOp::Warp, 4, 80, 96 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 5);

    assert(state.variables[3] == 42);
    assert(state.last_dialogue == 7);
    assert(state.last_sfx == 2);
    assert(state.current_room == 4);
    assert(state.player_x == 80);
    assert(state.player_y == 96);
}

void test_event_bytecode_v2_variables_and_dialogue_if() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::SetVariable, 1, 3, 0 },
        { gbs::EventOp::AddVariable, 1, 4, 0 },
        { gbs::EventOp::ShowDialogueIf, 9, 1, 7 },
        { gbs::EventOp::ClearVariable, 1, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 5);

    assert(state.last_dialogue == 9);
    assert(state.variables[1] == 0);
}

void test_event_bytecode_v2_branches() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::ShowDialogue, 1, 0, 0 },
        { gbs::EventOp::SetVariable, 2, 5, 0 },
        { gbs::EventOp::JumpIfVariableEquals, 2, 5, 2 },
        { gbs::EventOp::ShowDialogue, 2, 0, 0 },
        { gbs::EventOp::JumpIfVariableNotEquals, 2, 4, 2 },
        { gbs::EventOp::ShowDialogue, 3, 0, 0 },
        { gbs::EventOp::ShowDialogue, 4, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 9);

    assert(state.variables[2] == 5);
    assert(state.last_dialogue == 4);
}

void test_event_bytecode_v2_flag_branch() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::SetVariable, 3, 1, 0 },
        { gbs::EventOp::JumpIfVariableSet, 3, 0, 2 },
        { gbs::EventOp::ShowDialogue, 5, 0, 0 },
        { gbs::EventOp::PlaySfx, 8, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 5);

    assert(state.last_dialogue == -1);
    assert(state.last_sfx == 8);
}

void test_event_bytecode_app_subset_outputs() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::PlayMusic, 2, 0, 0 },
        { gbs::EventOp::Wait, 12, 0, 0 },
        { gbs::EventOp::SetCameraPosition, 32, 48, 0 },
        { gbs::EventOp::LockCamera, 0, 0, 0 },
        { gbs::EventOp::CloseDialogue, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 6);

    assert(state.last_music == 2);
    assert(state.wait_frames == 12);
    assert(state.camera_changed);
    assert(!state.camera_follow_player);
    assert(state.camera_x == 32);
    assert(state.camera_y == 48);
    assert(state.close_dialogue);

    const gbs::EventCommand stop_script[] = {
        { gbs::EventOp::StopMusic, 0, 0, 0 },
        { gbs::EventOp::FollowCamera, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, stop_script, 3);
    assert(state.stop_music);
    assert(state.last_music == -1);
    assert(state.camera_follow_player);
}

void test_event_bytecode_actor_command_queue() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::SetActorPosition, 1, 24, 32 },
        { gbs::EventOp::MoveActor, 1, 8, -4 },
        { gbs::EventOp::SetActorVisible, 1, 0, 0 },
        { gbs::EventOp::SetActorActive, 1, 0, 0 },
        { gbs::EventOp::SetActorDirection, 1, 3, 0 },
        { gbs::EventOp::SetActorSpeed, 1, 2, 0 },
        { gbs::EventOp::SetActorAnimation, 1, 4, 0 },
        { gbs::EventOp::SetActorAnimationFrame, 1, 2, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 9);

    assert(state.actor_command_count == 8);
    assert(state.actor_commands[0].op == gbs::EventActorOp::SetPosition);
    assert(state.actor_commands[0].actor_index == 1);
    assert(state.actor_commands[0].a == 24);
    assert(state.actor_commands[0].b == 32);
    assert(state.actor_commands[1].op == gbs::EventActorOp::MoveRelative);
    assert(state.actor_commands[2].op == gbs::EventActorOp::SetVisible);
    assert(state.actor_commands[3].op == gbs::EventActorOp::SetActive);
    assert(state.actor_commands[6].op == gbs::EventActorOp::SetAnimation);
    assert(state.actor_commands[7].op == gbs::EventActorOp::SetAnimationFrame);
    assert(state.actor_commands[7].a == 2);

    gbs::clear_event_actor_commands(state);
    assert(state.actor_command_count == 0);
    assert(state.actor_commands[0].op == gbs::EventActorOp::None);
}

void test_event_bytecode_actor_collision_toggle_queues_actor_command() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::SetActorCollisionEnabled, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 2);

    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].op == gbs::EventActorOp::SetCollisionEnabled);
    assert(state.actor_commands[0].actor_index == 2);
    assert(state.actor_commands[0].a == 0);
}

void test_event_bytecode_actor_collision_box_queues_actor_command() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::SetActorCollisionBox, 2, static_cast<int16_t>(0xFE01), 0x060A },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 2);

    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].op == gbs::EventActorOp::SetCollisionBox);
    assert(state.actor_commands[0].actor_index == 2);
    assert(state.actor_commands[0].a == -2);
    assert(state.actor_commands[0].b == 1);
    assert(state.actor_commands[0].c == 6);
    assert(state.actor_commands[0].d == 10);
}

void test_event_bytecode_push_actor_away_from_player_uses_player_direction() {
    gbs::EventState state;
    gbs::init_event_state(state);
    state.player_x = 16;
    state.player_y = 16;
    state.player_direction = 1;
    state.actor_x[2] = 40;
    state.actor_y[2] = 24;

    const gbs::EventCommand script[] = {
        { gbs::EventOp::PushActorAwayFromPlayer, 2, 2, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 2);

    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].op == gbs::EventActorOp::Push);
    assert(state.actor_commands[0].actor_index == 2);
    assert(state.actor_commands[0].a == 0);
    assert(state.actor_commands[0].b == -16);
}

void test_push_actor_stops_at_first_blocking_tile() {
    const uint8_t flags[] = {
        0, 0, 0, gbs::TileSolid, 0,
        0, 0, 0, gbs::TileSolid, 0,
        0, 0, 0, gbs::TileSolid, 0
    };
    gbs::TileMap map { flags, 5, 3 };
    gbs::Actor actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    const int moved_pixels = gbs::push_actor_by_delta_until_collision(
        map,
        actor,
        gbs::Vec2i { 32, 0 },
        nullptr,
        0
    );

    assert(moved_pixels == 8);
    assert(actor.position_pixels.x == 16);
    assert(actor.position_pixels.y == 8);
}

void test_push_actor_stops_at_first_blocking_actor() {
    const uint8_t flags[] = {
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0
    };
    gbs::TileMap map { flags, 5, 3 };
    gbs::Actor actor { gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1 };
    const gbs::Actor blocker { gbs::Vec2i { 24, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    const int moved_pixels = gbs::push_actor_by_delta_until_collision(
        map,
        actor,
        gbs::Vec2i { 32, 0 },
        &blocker,
        1
    );

    assert(moved_pixels == 8);
    assert(actor.position_pixels.x == 16);
    assert(actor.position_pixels.y == 8);
}

void test_actor_push_priority_moves_only_lower_priority_pushable_blockers() {
    const uint8_t flags[] = {
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0
    };
    gbs::TileMap map { flags, 5, 3 };
    gbs::Actor mover {
        gbs::Vec2i { 8, 8 }, gbs::Vec2i { 8, 8 }, 1, 3, 1, 0xFFFFu,
        gbs::Vec2i { 0, 0 }, 10, false
    };
    gbs::Actor blockers[] = {
        gbs::Actor {
            gbs::Vec2i { 16, 8 }, gbs::Vec2i { 8, 8 }, 0, 3, 2, 0xFFFFu,
            gbs::Vec2i { 0, 0 }, 2, true
        }
    };

    assert(gbs::move_actor_by_delta_with_actor_push(map, mover, gbs::Vec2i { 1, 0 }, blockers, 1));
    assert(mover.position_pixels.x == 9);
    assert(blockers[0].position_pixels.x == 17);

    blockers[0].position_pixels.x = 24;
    blockers[0].push_priority = 10;
    mover.position_pixels.x = 16;
    assert(!gbs::move_actor_by_delta_with_actor_push(map, mover, gbs::Vec2i { 1, 0 }, blockers, 1));
    assert(mover.position_pixels.x == 16);
    assert(blockers[0].position_pixels.x == 24);
}

void test_event_actor_command_queue_saturates_safely() {
    gbs::EventState state;
    gbs::init_event_state(state);

    gbs::EventCommand script[gbs::max_event_actor_commands + 2] = {};
    for (size_t index = 0; index < gbs::max_event_actor_commands + 1; ++index) {
        script[index] = gbs::EventCommand {
            gbs::EventOp::MoveActor,
            static_cast<int16_t>(index),
            1,
            0
        };
    }
    script[gbs::max_event_actor_commands + 1] = gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 };

    gbs::run_event_script(state, script, gbs::max_event_actor_commands + 2);

    assert(state.actor_command_count == gbs::max_event_actor_commands);
    assert(state.actor_commands[gbs::max_event_actor_commands - 1].actor_index == static_cast<int>(gbs::max_event_actor_commands - 1));
}

void test_event_bytecode_call_script_output() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::CallScript, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 2);

    assert(state.last_script == 3);
}

void test_event_bytecode_show_choice_output() {
    gbs::EventState state;
    gbs::init_event_state(state);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::ShowChoice, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, script, 2);

    assert(state.last_choice_group == 2);
}

void test_event_runner_pauses_on_wait_and_resumes_later() {
    gbs::EventState state;
    gbs::init_event_state(state);
    gbs::EventRunner runner;
    gbs::init_event_runner(runner);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::SetVariable, 1, 7, 0 },
        { gbs::EventOp::Wait, 3, 0, 0 },
        { gbs::EventOp::ShowDialogue, 4, 0, 0 },
        { gbs::EventOp::PlaySfx, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::start_event_runner(runner, gbs::EventScript { script, 5 });
    assert(gbs::event_runner_is_active(runner));
    bool paused = gbs::update_event_runner(runner, state);

    assert(paused);
    assert(gbs::event_runner_is_active(runner));
    assert(state.variables[1] == 7);
    assert(state.wait_frames == 3);
    assert(state.last_dialogue == -1);
    assert(state.last_sfx == -1);

    state.wait_frames = 0;
    bool still_active = gbs::update_event_runner(runner, state);
    assert(still_active);
    assert(gbs::event_runner_is_active(runner));
    assert(state.last_dialogue == 4);
    assert(state.last_sfx == -1);

    state.last_dialogue = -1;
    assert(!gbs::update_event_runner(runner, state));
    assert(!gbs::event_runner_is_active(runner));
    assert(state.last_sfx == 2);
}

void test_event_runner_handles_jumps_with_step_budget() {
    gbs::EventState state;
    gbs::init_event_state(state);
    gbs::EventRunner runner;
    gbs::init_event_runner(runner);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::SetVariable, 0, 1, 0 },
        { gbs::EventOp::JumpIfVariableSet, 0, 0, 2 },
        { gbs::EventOp::ShowDialogue, 1, 0, 0 },
        { gbs::EventOp::ShowDialogue, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::start_event_runner(runner, gbs::EventScript { script, 5 });
    assert(gbs::update_event_runner(runner, state));
    assert(gbs::event_runner_is_active(runner));
    assert(state.last_dialogue == 2);

    state.last_dialogue = -1;
    assert(!gbs::update_event_runner(runner, state));
    assert(!gbs::event_runner_is_active(runner));
}

void test_event_script_queue_preserves_order_flags_and_capacity() {
    gbs::EventScriptQueue queue;
    gbs::init_event_script_queue(queue);

    const gbs::EventCommand first_commands[] = {
        { gbs::EventOp::ShowDialogue, 1, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventCommand second_commands[] = {
        { gbs::EventOp::ShowDialogue, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    assert(gbs::event_script_queue_is_empty(queue));
    assert(gbs::enqueue_event_script(queue, gbs::EventScript { first_commands, 2 }, 3));
    assert(gbs::enqueue_event_script(queue, gbs::EventScript { second_commands, 2 }, 7));
    assert(!gbs::event_script_queue_is_empty(queue));

    gbs::EventScriptQueueEntry entry {};
    assert(gbs::dequeue_event_script(queue, entry));
    assert(entry.script.commands == first_commands);
    assert(entry.flags == 3);
    assert(gbs::dequeue_event_script(queue, entry));
    assert(entry.script.commands == second_commands);
    assert(entry.flags == 7);
    assert(!gbs::dequeue_event_script(queue, entry));

    for (size_t index = 0; index < gbs::max_event_script_queue_entries; ++index) {
        assert(gbs::enqueue_event_script(queue, gbs::EventScript { first_commands, 2 }, 0));
    }
    assert(gbs::event_script_queue_is_full(queue));
    assert(!gbs::enqueue_event_script(queue, gbs::EventScript { first_commands, 2 }, 0));
}

void test_event_script_queue_front_priority_and_clear() {
    gbs::EventScriptQueue queue;
    gbs::init_event_script_queue(queue);

    const gbs::EventCommand normal_commands[] = {
        { gbs::EventOp::ShowDialogue, 1, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventCommand priority_commands[] = {
        { gbs::EventOp::ShowDialogue, 9, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    assert(gbs::enqueue_event_script(queue, gbs::EventScript { normal_commands, 2 }, 1));
    assert(gbs::enqueue_event_script_front(queue, gbs::EventScript { priority_commands, 2 }, 5));

    gbs::EventScriptQueueEntry entry {};
    assert(gbs::dequeue_event_script(queue, entry));
    assert(entry.script.commands == priority_commands);
    assert(entry.flags == 5);

    gbs::clear_event_script_queue(queue);
    assert(gbs::event_script_queue_is_empty(queue));
    assert(!gbs::dequeue_event_script(queue, entry));
}

void test_event_runner_can_be_stopped() {
    gbs::EventState state;
    gbs::init_event_state(state);
    gbs::EventRunner runner;
    gbs::init_event_runner(runner);

    const gbs::EventCommand script[] = {
        { gbs::EventOp::Wait, 3, 0, 0 },
        { gbs::EventOp::ShowDialogue, 4, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::start_event_runner(runner, gbs::EventScript { script, 3 });
    assert(gbs::update_event_runner(runner, state));
    assert(gbs::event_runner_is_active(runner));

    gbs::stop_event_runner(runner);
    assert(!gbs::event_runner_is_active(runner));
    assert(!gbs::update_event_runner(runner, state));
    assert(state.last_dialogue == -1);
}

void test_trigger_leave_fires_on_leave_script() {
    const gbs::EventCommand leave_command { gbs::EventOp::SetVariable, 3, 9, 0 };
    const gbs::EventScript leave_script { &leave_command, 1 };
    const gbs::TopDownTriggerData trigger {
        gbs::Rect { 0, 0, 16, 16 },
        gbs::empty_event_script(),
        leave_script
    };
    gbs::TopDownTriggerState state {};
    gbs::Actor inside_player { gbs::Vec2i { 4, 4 }, gbs::Vec2i { 8, 8 }, 0 };
    gbs::Actor outside_player { gbs::Vec2i { 24, 24 }, gbs::Vec2i { 8, 8 }, 0 };

    const gbs::TopDownTriggerResult enter_result = gbs::update_trigger_state(trigger, state, inside_player);
    assert(enter_result == gbs::TopDownTriggerResult::Enter);
    assert(state.inside);

    const gbs::TopDownTriggerResult leave_result = gbs::update_trigger_state(trigger, state, outside_player);
    assert(leave_result == gbs::TopDownTriggerResult::Leave);
    assert(!state.inside);
    assert(gbs::trigger_event_script_for_result(trigger, leave_result).command_count == 1);
    assert(gbs::trigger_event_script_for_result(trigger, leave_result).commands[0].op == gbs::EventOp::SetVariable);
}

void test_topdown_quest_and_shop_modules_mutate_event_state_safely() {
    const gbs::TopDownQuestData quest {
        "find-crystal",
        4,
        1,
        2,
        2,
        3,
        3,
        1,
        gbs::empty_event_script()
    };
    gbs::EventState state {};
    gbs::init_event_state(state);
    state.variables[4] = 1;
    state.inventory[2] = 3;
    assert(gbs::complete_topdown_quest(quest, state));
    assert(state.variables[4] == 2);
    assert(state.inventory[2] == 0);
    assert(state.inventory[3] == 1);
    assert(!gbs::complete_topdown_quest(quest, state));

    const gbs::TopDownShopItemData shop_item {
        "POTION",
        5,
        1,
        7,
        -1,
        0,
        gbs::empty_event_script()
    };
    state.inventory[1] = 7;
    assert(gbs::topdown_shop_item_can_purchase(shop_item, state));
    assert(gbs::purchase_topdown_shop_item(shop_item, state));
    assert(state.inventory[1] == 0);
    assert(state.inventory[5] == 1);
    assert(!gbs::purchase_topdown_shop_item(shop_item, state));
}

} // namespace

int main() {
    test_player_stops_on_solid_tile();
    test_player_moves_when_clear();
    test_directional_collision_blocks_only_matching_direction();
    test_horizontal_directional_collision();
    test_tile_effect_flags_do_not_block_movement();
    test_tile_effects_for_actor_collects_overlapped_flags();
    test_tile_flags_at_treats_null_or_out_of_bounds_as_solid();
    test_slope_tiles_block_only_their_solid_half();
    test_player_stops_on_slope_half_and_moves_through_open_half();
    test_camera_follows_and_clamps();
    test_topdown_viewport_scales_from_zoom_without_fractional_pixels();
    test_camera_follows_and_clamps_using_zoomed_viewport();
    test_topdown_camera_zone_applies_bounds_offset_and_axis_locks();
    test_collects_only_visible_actor_runtime_slots_with_stable_order();
    test_collects_visible_topdown_draw_slots_front_to_back_by_actor_feet();
    test_portal_warp();
    test_portals_can_stream_between_multiple_rooms();
    test_straight_smoke_route_reaches_portal();
    test_actor_path_step_routes_around_solid_tile();
    test_move_actor_towards_uses_path_step_and_collision();
    test_actor_path_step_respects_search_budget();
    test_actor_path_step_can_route_around_blocking_actor();
    test_actor_path_step_nearest_reachable_when_target_blocked();
    test_actor_overlap_and_rect_hits_actor();
    test_actor_collision_box_offset_and_size_affect_runtime_hits();
    test_player_stops_on_blocking_actor();
    test_trigger_leave_fires_on_leave_script();
    test_actor_collision_groups_filter_blockers();
    test_player_ignores_blocker_outside_collision_mask();
    test_actor_move_stops_on_blocking_actor();
    test_event_bytecode();
    test_event_bytecode_v2_variables_and_dialogue_if();
    test_event_bytecode_v2_branches();
    test_event_bytecode_v2_flag_branch();
    test_event_bytecode_app_subset_outputs();
    test_event_bytecode_actor_command_queue();
    test_event_bytecode_actor_collision_toggle_queues_actor_command();
    test_event_bytecode_actor_collision_box_queues_actor_command();
    test_event_bytecode_push_actor_away_from_player_uses_player_direction();
    test_push_actor_stops_at_first_blocking_tile();
    test_push_actor_stops_at_first_blocking_actor();
    test_actor_push_priority_moves_only_lower_priority_pushable_blockers();
    test_event_actor_command_queue_saturates_safely();
    test_event_bytecode_call_script_output();
    test_event_bytecode_show_choice_output();
    test_event_runner_pauses_on_wait_and_resumes_later();
    test_event_runner_handles_jumps_with_step_budget();
    test_event_script_queue_preserves_order_flags_and_capacity();
    test_event_script_queue_front_priority_and_clear();
    test_event_runner_can_be_stopped();
    test_topdown_quest_and_shop_modules_mutate_event_state_safely();
    return 0;
}
