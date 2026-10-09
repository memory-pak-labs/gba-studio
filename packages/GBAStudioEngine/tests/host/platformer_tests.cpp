#include <cassert>
#include "gbs/platformer.hpp"
#include "gbs/trigger.hpp"

namespace {

constexpr gbs::PlatformerConfig test_config {
    0x0200,
    0x0100,
    0x0100,
    0x0100,
    0x0400,
    0x0400,
    3,
    3,
    true
};

constexpr gbs::PlatformerConfig advanced_test_config {
    0x0200,
    0x0100,
    0x0100,
    0x0100,
    0x0400,
    0x0400,
    3,
    3,
    true,
    1,
    true,
    0x0180,
    0x0500,
    0x0300,
    true,
    0x0600,
    8,
    true,
    0x0140
};

void update_frames(const gbs::TileMap& map, gbs::PlatformerActor& actor, int frames, gbs::InputState input = gbs::InputState { 0, 0, 0 }) {
    for (int frame = 0; frame < frames; ++frame) {
        gbs::update_platformer_actor(map, actor, input, test_config);
        input.pressed = 0;
        input.released = 0;
    }
}

void test_platformer_falls_and_lands_on_solid_floor() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid, gbs::TileSolid
    };
    gbs::TileMap map { flags, 4, 4 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 8, 8, 8 });

    update_frames(map, actor, 16);

    assert(actor.on_ground);
    assert(actor.bounds_pixels.y == 16);
    assert(actor.velocity_x256.y == 0);
}

void test_platformer_blank_gravity_moves_without_player_input() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    };
    gbs::TileMap map { flags, 4, 4 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 0, 8, 8 });

    for (int frame = 0; frame < 4; ++frame) {
        gbs::update_platformer_blank_actor(map, actor, 1802, test_config.max_fall_speed_x256);
    }

    assert(actor.bounds_pixels.x == 8);
    assert(actor.bounds_pixels.y == 4);
    assert(actor.velocity_x256.x == 0);
    assert(actor.velocity_x256.y == 448);

    const int frozen_y = actor.bounds_pixels.y;
    actor.velocity_x256.y = 0;
    gbs::update_platformer_blank_actor(map, actor, 0, test_config.max_fall_speed_x256);
    assert(actor.bounds_pixels.y == frozen_y);
}

void test_platformer_preserves_fractional_velocity_between_frames() {
    const uint8_t flags[64] = {};
    gbs::TileMap map { flags, 8, 8 };
    constexpr gbs::PlatformerConfig fractional_config {
        0x0180,
        0,
        0,
        0,
        0x0400,
        0x0580,
        0,
        0,
        false
    };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 16, 16, 8, 8 });
    actor.velocity_x256 = gbs::Vec2i { 0x0180, 0x0180 };

    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, fractional_config);
    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, fractional_config);

    assert(actor.bounds_pixels.x == 19);
    assert(actor.bounds_pixels.y == 19);
}

void test_platformer_actor_preserves_gb_studio_anchor_and_local_collision_bounds() {
    uint8_t flags[64 * 18] = {};
    for (int x = 0; x < 64; ++x) {
        flags[14 * 64 + x] = gbs::TileSolid;
    }
    gbs::TileMap map { flags, 64, 18 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(
        gbs::Rect { 400, 104, 16, 24 },
        gbs::Vec2i { 0, -16 }
    );

    assert(actor.bounds_pixels.x == 400);
    assert(actor.bounds_pixels.y == 88);
    assert(actor.bounds_pixels.width == 16);
    assert(actor.bounds_pixels.height == 24);
    assert(gbs::platformer_actor_anchor_position(actor).x == 400);
    assert(gbs::platformer_actor_anchor_position(actor).y == 104);

    actor.on_ground = true;
    gbs::update_platformer_actor(
        map,
        actor,
        gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 },
        test_config
    );

    assert(actor.bounds_pixels.x > 400);
    assert(!actor.hit_wall);
    gbs::set_platformer_actor_anchor_position(actor, gbs::Vec2i { 416, 104 });
    assert(actor.bounds_pixels.x == 416);
    assert(actor.bounds_pixels.y == 88);
}

void test_platformer_collision_clears_fractional_remainder() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, gbs::TileSolid, 0,
        0, 0, gbs::TileSolid, 0,
        0, 0, gbs::TileSolid, 0
    };
    gbs::TileMap map { flags, 4, 4 };
    constexpr gbs::PlatformerConfig fractional_config {
        0x0140,
        0,
        0,
        0,
        0x0400,
        0x0580,
        0,
        0,
        false
    };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 7, 8, 8, 8 });
    actor.velocity_x256.x = 0x0140;

    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, fractional_config);
    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, fractional_config);

    assert(actor.hit_wall);
    assert(actor.bounds_pixels.x == 8);
    actor.bounds_pixels.x = 0;
    actor.velocity_x256.x = 0x0080;
    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, fractional_config);
    assert(actor.bounds_pixels.x == 0);
}

void test_platformer_runs_and_stops_on_wall() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, gbs::TileSolid, 0,
        0, 0, gbs::TileSolid, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid, gbs::TileSolid
    };
    gbs::TileMap map { flags, 4, 4 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 8, 8, 8 });

    update_frames(map, actor, 8, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 });

    assert(actor.hit_wall);
    assert(actor.bounds_pixels.x == 8);
}

void test_platformer_jumps_from_ground() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, 0, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid
    };
    gbs::TileMap map { flags, 3, 3 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 8, 8, 8 });
    actor.on_ground = true;

    gbs::update_platformer_actor(map, actor, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 }, test_config);

    assert(!actor.on_ground);
    assert(actor.velocity_x256.y < 0);
    assert(actor.bounds_pixels.y < 8);
}

void test_platformer_coyote_jump_after_leaving_edge() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        gbs::TileSolid, 0, 0, 0
    };
    gbs::TileMap map { flags, 4, 3 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 8, 8, 8 });
    actor.on_ground = true;

    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, test_config);
    gbs::update_platformer_actor(map, actor, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 }, test_config);

    assert(actor.velocity_x256.y < 0);
}

void test_platformer_advanced_air_jump_consumes_single_charge() {
    const uint8_t flags[64] = {};
    gbs::TileMap map { flags, 8, 8 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 16, 16, 8, 8 });
    actor.velocity_x256.y = 0x0200;

    gbs::update_platformer_actor(
        map,
        actor,
        gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 },
        advanced_test_config
    );

    assert(actor.velocity_x256.y < 0);
    assert(actor.air_jumps_used == 1);
    const int first_jump_velocity = actor.velocity_x256.y;
    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, gbs::ButtonA }, advanced_test_config);
    gbs::update_platformer_actor(
        map,
        actor,
        gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 },
        advanced_test_config
    );
    assert(actor.air_jumps_used == 1);
    assert(actor.velocity_x256.y > first_jump_velocity);
}

void test_platformer_advanced_wall_slide_and_wall_jump() {
    const uint8_t flags[64] = {};
    gbs::TileMap map { flags, 8, 8 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 16, 16, 8, 8 });
    actor.hit_wall = true;
    actor.facing = gbs::PlatformerFacing::Right;
    actor.velocity_x256.y = 0x0400;

    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, advanced_test_config);
    assert(actor.wall_sliding);
    assert(actor.velocity_x256.y <= advanced_test_config.wall_slide_speed_x256);

    actor.hit_wall = true;
    gbs::update_platformer_actor(
        map,
        actor,
        gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 },
        advanced_test_config
    );
    assert(actor.velocity_x256.y < 0);
    assert(actor.velocity_x256.x < 0);
    assert(!actor.wall_sliding);
}

void test_platformer_advanced_dash_and_glide_use_dedicated_buttons() {
    const uint8_t flags[64] = {};
    gbs::TileMap map { flags, 8, 8 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 16, 16, 8, 8 });
    actor.facing = gbs::PlatformerFacing::Right;
    actor.velocity_x256.y = 0x0200;

    gbs::update_platformer_actor(
        map,
        actor,
        gbs::InputState { gbs::ButtonB, gbs::ButtonB, 0 },
        advanced_test_config
    );
    assert(actor.dashing);
    assert(actor.velocity_x256.x == advanced_test_config.dash_speed_x256);
    assert(actor.velocity_x256.y == 0);
    assert(!actor.dash_available);

    actor.dash_timer = 0;
    actor.dashing = false;
    actor.velocity_x256.y = 0x0400;
    gbs::update_platformer_actor(
        map,
        actor,
        gbs::InputState { gbs::ButtonR, 0, 0 },
        advanced_test_config
    );
    assert(actor.gliding);
    assert(actor.velocity_x256.y <= advanced_test_config.glide_fall_speed_x256);
}

void test_platformer_lands_on_one_way_platform_from_above() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, 0, 0,
        0, gbs::TileBlockTop, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid
    };
    gbs::TileMap map { flags, 3, 4 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 4, 8, 8 });

    update_frames(map, actor, 12);

    assert(actor.on_ground);
    assert(actor.bounds_pixels.y == 8);
}

void test_platformer_can_jump_up_through_one_way_platform() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, gbs::TileBlockTop, 0,
        0, 0, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid
    };
    gbs::TileMap map { flags, 3, 4 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 16, 8, 8 });
    actor.velocity_x256.y = -0x0400;

    update_frames(map, actor, 2);

    assert(!actor.hit_ceiling);
    assert(actor.bounds_pixels.y < 16);
}

void test_platformer_snaps_to_sloped_floor() {
    const uint8_t flags[] = {
        0, 0, 0,
        0, 0, 0,
        0, 0, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid
    };
    const gbs::TileSlope slopes[] = {
        gbs::TileSlope::None, gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::BlockBelowRising, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None, gbs::TileSlope::None
    };
    gbs::TileMap map { flags, 3, 4, slopes };
    int floor_y = 0;
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 11, 8, 8 });

    assert(gbs::platformer_slope_floor_y_at(map, 12, 2, &floor_y));
    assert(floor_y == 19);
    assert(gbs::snap_platformer_actor_to_slope_floor(map, actor));
    assert(actor.on_ground);
    assert(actor.bounds_pixels.y == 11);

    actor.bounds_pixels.y = 10;
    actor.on_ground = false;
    actor.velocity_x256.y = 0;
    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, test_config);
    assert(actor.on_ground);
    assert(actor.bounds_pixels.y == 11);
    assert(actor.velocity_x256.y == 0);

    actor.bounds_pixels.y = 8;
    actor.on_ground = false;
    assert(!gbs::snap_platformer_actor_to_slope_floor(map, actor, 1));
    assert(!actor.on_ground);
}

void test_platformer_update_accepts_eight_pixel_slope_handoff() {
    const uint8_t flags[16] = {};
    const gbs::TileSlope slopes[] = {
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::BlockBelowFalling,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None
    };
    gbs::TileMap map { flags, 4, 4, slopes };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 11, 0, 8, 8 });
    gbs::PlatformerConfig slope_config = test_config;
    slope_config.gravity_x256 = 0;

    gbs::update_platformer_actor(map, actor, gbs::InputState { 0, 0, 0 }, slope_config);

    assert(actor.on_ground);
    assert(actor.bounds_pixels.y == 7);
    assert(actor.velocity_x256.y == 0);
}

void test_platformer_snaps_to_diagonal_slope_in_adjacent_tile_row() {
    const uint8_t flags[16] = {};
    const gbs::TileSlope slopes[] = {
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::BlockBelowFalling,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None,
        gbs::TileSlope::None, gbs::TileSlope::None
    };
    gbs::TileMap map { flags, 4, 4, slopes };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 11, 8, 8, 8 });

    assert(gbs::snap_platformer_actor_to_slope_floor(map, actor));
    assert(actor.on_ground);
    assert(actor.bounds_pixels.y == 7);
}

void test_platformer_enters_ladder_approach_lane_before_wall() {
    uint8_t flags[80 * 30] = {};
    for (int y = 11; y <= 23; ++y) {
        for (int x = 62; x <= 65; ++x) flags[y * 80 + x] = gbs::TileLadder;
        flags[y * 80 + 66] = gbs::TileSolid;
    }
    for (int x = 46; x < 80; ++x) flags[24 * 80 + x] = gbs::TileSolid;
    gbs::TileMap map { flags, 80, 30 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 496, 168, 16, 16 });
    actor.on_ground = true;

    update_frames(map, actor, 8, gbs::InputState { gbs::ButtonRight, gbs::ButtonRight, 0 });

    assert(actor.bounds_pixels.x > 496);
    assert(actor.bounds_pixels.x <= 512);
    assert(gbs::platformer_actor_on_ladder(map, actor));
}

void test_platformer_derives_animation_state() {
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 16, 8, 8 });

    actor.on_ground = true;
    actor.velocity_x256 = gbs::Vec2i { 0, 0 };
    assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Idle);

    actor.velocity_x256.x = 0x0100;
    assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Run);
    assert(gbs::platformer_actor_animation_state(actor, 0x0200) == gbs::PlatformerActorAnimationState::Idle);

    actor.on_ground = false;
    actor.velocity_x256.y = -0x0100;
    assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Jump);

    actor.velocity_x256.y = 0x0100;
    assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Fall);

    actor.on_ladder = true;
    assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Climb);

    actor.on_ladder = false;
    actor.wall_sliding = true;
    assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::WallSlide);
    actor.wall_sliding = false;
    actor.dashing = true;
    assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Dash);
    actor.dashing = false;
    actor.gliding = true;
    assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Glide);

    const gbs::MetaSpritePart part { 0, 0, 0, 0, false, false };
    const gbs::MetaSprite metasprite { &part, 1 };
    const gbs::SpriteAnimationFrame frame { metasprite, 1 };
    const gbs::SpriteAnimation idle { &frame, 1, true };
    const gbs::SpriteAnimation walk { &frame, 1, true };
    const gbs::SpriteAnimation jump { &frame, 1, false };
    const gbs::SpriteAnimation fall { &frame, 1, false };
    const gbs::SpriteAnimation climb { &frame, 1, true };
    const gbs::SpriteAnimation wall_slide { &frame, 1, true };
    const gbs::SpriteAnimation dash { &frame, 1, true };
    const gbs::SpriteAnimation glide { &frame, 1, true };
    const gbs::PlatformerPlayerAnimationSet animations {
        &idle, &walk, &jump, &fall, &climb, &wall_slide, &dash, &glide
    };

    assert(gbs::platformer_player_animation_for_state(animations, gbs::PlatformerActorAnimationState::Idle) == &idle);
    assert(gbs::platformer_player_animation_for_state(animations, gbs::PlatformerActorAnimationState::Run) == &walk);
    assert(gbs::platformer_player_animation_for_state(animations, gbs::PlatformerActorAnimationState::Jump) == &jump);
    assert(gbs::platformer_player_animation_for_state(animations, gbs::PlatformerActorAnimationState::Fall) == &fall);
    assert(gbs::platformer_player_animation_for_state(animations, gbs::PlatformerActorAnimationState::Climb) == &climb);
    assert(gbs::platformer_player_animation_for_state(animations, gbs::PlatformerActorAnimationState::WallSlide) == &wall_slide);
    assert(gbs::platformer_player_animation_for_state(animations, gbs::PlatformerActorAnimationState::Dash) == &dash);
    assert(gbs::platformer_player_animation_for_state(animations, gbs::PlatformerActorAnimationState::Glide) == &glide);

    const gbs::PlatformerPlayerAnimationSet idle_only { &idle, nullptr, nullptr, nullptr };
    assert(gbs::platformer_player_animation_for_state(idle_only, gbs::PlatformerActorAnimationState::Run) == &idle);
}

void test_platformer_climbs_ladder_without_gravity() {
    const uint8_t flags[] = {
        0, gbs::TileLadder, 0,
        0, gbs::TileLadder, 0,
        0, gbs::TileLadder, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid
    };
    gbs::TileMap map { flags, 3, 4 };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 16, 8, 8 });

    gbs::update_platformer_actor(map, actor, gbs::InputState { gbs::ButtonUp, gbs::ButtonUp, 0 }, test_config);

    assert(actor.on_ladder);
    assert(actor.bounds_pixels.y < 16);
    assert(actor.velocity_x256.y < 0);
}

void test_platformer_plus_supports_variable_jump_and_air_control() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid, gbs::TileSolid
    };
    gbs::TileMap map { flags, 4, 4 };
    gbs::PlatformerConfig config = test_config;
    config.jump_min_height_x256 = 0x0200;
    config.jump_hold_frames = 4;
    config.air_control_enabled = false;
    config.turn_in_air_enabled = false;
    config.air_deceleration_x256 = 0;

    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 16, 8, 8 });
    actor.on_ground = true;
    gbs::update_platformer_actor(map, actor, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 }, config);
    assert(actor.velocity_x256.y < 0);
    assert(actor.velocity_x256.y >= -config.jump_speed_x256);
    assert(actor.jump_hold_timer > 0);

    actor.velocity_x256.x = 0x0100;
    actor.on_ground = false;
    actor.facing = gbs::PlatformerFacing::Right;
    gbs::update_platformer_actor(map, actor, gbs::InputState { gbs::ButtonLeft, 0, 0 }, config);
    assert(actor.velocity_x256.x == 0x0100);
    assert(actor.facing == gbs::PlatformerFacing::Right);
}

void test_platformer_plus_can_drop_through_one_way_platforms() {
    const uint8_t flags[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        gbs::TileBlockTop, gbs::TileBlockTop, gbs::TileBlockTop, gbs::TileBlockTop,
        0, 0, 0, 0
    };
    gbs::TileMap map { flags, 4, 4 };
    gbs::PlatformerConfig config = test_config;
    config.drop_through_mode = 2;
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 8, 8, 8 });
    actor.on_ground = true;

    gbs::update_platformer_actor(map, actor, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }, config);

    assert(actor.bounds_pixels.y > 8);
    assert(!actor.on_ground);
}

void test_platformer_plus_restricts_dash_style_to_airborne_state() {
    const uint8_t flags[64] = {};
    gbs::TileMap map { flags, 8, 8 };
    gbs::PlatformerConfig config = advanced_test_config;
    config.dash_style = 1;
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 8, 8, 8 });
    actor.on_ground = true;

    gbs::update_platformer_actor(map, actor, gbs::InputState { gbs::ButtonB, gbs::ButtonB, 0 }, config);
    assert(!actor.dashing);

    actor.on_ground = false;
    gbs::update_platformer_actor(map, actor, gbs::InputState { gbs::ButtonB, gbs::ButtonB, 0 }, config);
    assert(actor.dashing);
    assert(actor.dash_timer > 0);
}

void test_platformer_camera_follows_and_clamps() {
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 300, 120, 16, 16 });
    gbs::Camera camera { gbs::Vec2i { 0, 0 }, true };

    gbs::update_platformer_camera(camera, actor, 512, 256);

    assert(camera.position_pixels.x == 188);
    assert(camera.position_pixels.y == 48);

    gbs::PlatformerConfig config = gbs::default_platformer_config();
    config.camera_follow_directions = 1;
    config.camera_deadzone_x_pixels = 8;
    camera = gbs::Camera { gbs::Vec2i { 0, 0 }, true };
    gbs::update_platformer_camera(camera, actor, 512, 256, config);
    assert(camera.position_pixels.x == 180);
    assert(camera.position_pixels.y == 0);
}

void test_platformer_checkpoint_updates_respawn_once() {
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 32, 40, 16, 16 });
    gbs::PlatformerRuntimeState state = gbs::platformer_state_from_spawn(gbs::Vec2i { 8, 8 }, 0);
    const gbs::PlatformerCheckpoint checkpoints[] = {
        gbs::PlatformerCheckpoint { gbs::Rect { 24, 32, 32, 32 }, gbs::Vec2i { 40, 48 }, 7 }
    };

    assert(gbs::update_platformer_checkpoints(actor, checkpoints, 1, state));
    assert(state.checkpoint_changed);
    assert(state.active_checkpoint_id == 7);
    assert(state.respawn_position_pixels.x == 40);
    assert(state.respawn_position_pixels.y == 48);
    assert(!gbs::update_platformer_checkpoints(actor, checkpoints, 1, state));
    assert(!state.checkpoint_changed);
}

void test_platformer_hazard_respawns_and_counts_damage() {
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 32, 40, 16, 16 });
    actor.velocity_x256 = gbs::Vec2i { 0x0200, 0x0300 };
    actor.on_ground = true;
    gbs::PlatformerRuntimeState state = gbs::platformer_state_from_spawn(gbs::Vec2i { 8, 16 }, 1);
    const gbs::PlatformerHazard hazards[] = {
        gbs::PlatformerHazard { gbs::Rect { 30, 36, 24, 24 }, 2, true }
    };

    assert(gbs::update_platformer_hazards(actor, hazards, 1, state));
    assert(state.hazard_hit);
    assert(state.hazard_index == 0);
    assert(state.damage_taken == 2);
    assert(actor.bounds_pixels.x == 8);
    assert(actor.bounds_pixels.y == 16);
    assert(actor.velocity_x256.x == 0);
    assert(actor.velocity_x256.y == 0);
    assert(!actor.on_ground);
}

void test_platformer_hazard_reports_hit_index() {
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 48, 40, 16, 16 });
    gbs::PlatformerRuntimeState state = gbs::platformer_state_from_spawn(gbs::Vec2i { 8, 16 }, 1);
    const gbs::PlatformerHazard hazards[] = {
        gbs::PlatformerHazard { gbs::Rect { 8, 8, 8, 8 }, 1, false },
        gbs::PlatformerHazard { gbs::Rect { 44, 36, 24, 24 }, 3, false }
    };

    assert(gbs::update_platformer_hazards(actor, hazards, 2, state));
    assert(state.hazard_hit);
    assert(state.hazard_index == 1);
    assert(state.damage_taken == 3);
}

void test_platformer_hazard_can_damage_without_respawn() {
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 32, 40, 16, 16 });
    gbs::PlatformerRuntimeState state = gbs::platformer_state_from_spawn(gbs::Vec2i { 8, 16 }, 1);
    const gbs::PlatformerHazard hazards[] = {
        gbs::PlatformerHazard { gbs::Rect { 30, 36, 24, 24 }, 3, false }
    };

    assert(gbs::update_platformer_hazards(actor, hazards, 1, state));
    assert(state.damage_taken == 3);
    assert(actor.bounds_pixels.x == 32);
    assert(actor.bounds_pixels.y == 40);
}

void test_platformer_camera_zone_locks_and_reports_state() {
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 320, 96, 16, 16 });
    gbs::Camera camera { gbs::Vec2i { 0, 0 }, true };
    gbs::PlatformerRuntimeState state = gbs::platformer_state_from_spawn(gbs::Vec2i { 0, 0 }, 0);
    const gbs::PlatformerCameraZone zones[] = {
        gbs::PlatformerCameraZone {
            gbs::Rect { 300, 80, 80, 80 },
            gbs::Rect { 256, 32, 320, 192 },
            gbs::Vec2i { 16, 0 },
            true,
            false
        }
    };

    assert(gbs::apply_platformer_camera_zones(camera, actor, zones, 1, 640, 320, &state));
    assert(state.camera_zone_active);
    assert(state.camera_zone_index == 0);
    assert(camera.bounds_enabled);
    assert(camera.position_pixels.x == 272);
    assert(camera.position_pixels.y >= 32);
    assert(camera.position_pixels.y <= 64);
}

void test_runtime_trigger_reports_enter_and_leave_once_per_crossing() {
    constexpr gbs::RuntimeTriggerData trigger {
        gbs::Rect { 32, 16, 16, 16 },
        gbs::empty_event_script(),
        gbs::empty_event_script()
    };
    gbs::RuntimeTriggerState state {};

    assert(gbs::update_runtime_trigger(trigger, state, gbs::Rect { 0, 0, 16, 16 }) == gbs::RuntimeTriggerResult::None);
    assert(gbs::update_runtime_trigger(trigger, state, gbs::Rect { 32, 16, 16, 16 }) == gbs::RuntimeTriggerResult::Enter);
    assert(gbs::update_runtime_trigger(trigger, state, gbs::Rect { 36, 20, 8, 8 }) == gbs::RuntimeTriggerResult::None);
    assert(gbs::update_runtime_trigger(trigger, state, gbs::Rect { 0, 0, 16, 16 }) == gbs::RuntimeTriggerResult::Leave);
    assert(gbs::update_runtime_trigger(trigger, state, gbs::Rect { 0, 0, 16, 16 }) == gbs::RuntimeTriggerResult::None);
}

void test_platformer_enemy_patrol_turns_at_bounds() {
    gbs::PlatformerEnemy enemy {
        gbs::Rect { 23, 32, 16, 16 },
        gbs::Rect { 16, 32, 24, 16 },
        gbs::Vec2i { 0x0100, 0 },
        true,
        true,
        0,
        0
    };

    assert(gbs::update_platformer_enemy(enemy));
    assert(enemy.bounds_pixels.x == 24);
    assert(enemy.facing_right);
    assert(gbs::update_platformer_enemy(enemy));
    assert(enemy.bounds_pixels.x == 24);
    assert(!enemy.facing_right);
}

void test_platformer_enemy_patrol_turns_at_wall_and_ledge() {
    const uint8_t wall_flags[] = {
        0, 0, 0, 0, 0,
        0, 0, gbs::TileSolid, 0, 0,
        gbs::TileSolid, gbs::TileSolid, gbs::TileSolid, 0, 0
    };
    gbs::TileMap wall_map { wall_flags, 5, 3 };
    gbs::PlatformerEnemy wall_enemy {
        gbs::Rect { 15, 8, 8, 8 },
        gbs::Rect { 0, 0, 0, 0 },
        gbs::Vec2i { 0x0100, 0 },
        true,
        true,
        0,
        0
    };

    assert(gbs::update_platformer_enemy_patrol(wall_enemy, wall_map));
    assert(wall_enemy.bounds_pixels.x == 15);
    assert(!wall_enemy.facing_right);

    const uint8_t ledge_flags[] = {
        0, 0, 0, 0, 0,
        0, 0, 0, 0, 0,
        gbs::TileSolid, gbs::TileSolid, 0, 0, 0
    };
    gbs::TileMap ledge_map { ledge_flags, 5, 3 };
    gbs::PlatformerEnemy ledge_enemy {
        gbs::Rect { 7, 8, 8, 8 },
        gbs::Rect { 0, 0, 0, 0 },
        gbs::Vec2i { 0x0100, 0 },
        true,
        true,
        0,
        0
    };

    assert(gbs::update_platformer_enemy_patrol(ledge_enemy, ledge_map));
    assert(ledge_enemy.bounds_pixels.x == 7);
    assert(!ledge_enemy.facing_right);

    ledge_enemy.facing_right = true;
    assert(gbs::update_platformer_enemy_patrol(ledge_enemy, ledge_map, false));
    assert(ledge_enemy.bounds_pixels.x == 8);
    assert(ledge_enemy.facing_right);
}

void test_platformer_enemy_contact_distinguishes_stomp_and_damage() {
    gbs::PlatformerEnemy enemies[] = {
        gbs::PlatformerEnemy {
            gbs::Rect { 16, 24, 16, 16 },
            gbs::Rect { 0, 0, 0, 0 },
            gbs::Vec2i { 0, 0 },
            true,
            true,
            2,
            0
        }
    };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 20, 20, 8, 8 });
    actor.velocity_x256.y = 0x0200;
    size_t enemy_index = 99;

    assert(gbs::resolve_platformer_enemy_contact(actor, enemies, 1, &enemy_index) == gbs::PlatformerEnemyContactResult::StompEnemy);
    assert(enemy_index == 0);
    assert(!enemies[0].active);
    assert(actor.bounds_pixels.y == 16);
    assert(actor.velocity_x256.y < 0);
    assert(!actor.on_ground);

    enemies[0].active = true;
    actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 24, 16, 16 });
    actor.velocity_x256.y = 0x0100;
    enemy_index = 99;

    assert(gbs::resolve_platformer_enemy_contact(actor, enemies, 1, &enemy_index) == gbs::PlatformerEnemyContactResult::HurtActor);
    assert(enemy_index == 0);
    assert(enemies[0].active);
    assert(actor.bounds_pixels.x == 8);
}

void test_platformer_moving_platform_carries_actor() {
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 16, 24, 16, 16 });
    gbs::PlatformerMovingPlatform platform {
        gbs::Rect { 16, 40, 32, 8 },
        gbs::Vec2i { 16, 40 },
        gbs::Vec2i { 24, 40 },
        gbs::Vec2i { 0x0100, 0 },
        true,
        true,
        0,
        0
    };

    gbs::Vec2i delta = gbs::update_platformer_moving_platform(platform);
    assert(delta.x == 1);
    assert(delta.y == 0);
    assert(gbs::platformer_actor_stands_on_platform(actor, platform));
    assert(gbs::apply_platformer_moving_platform_delta(actor, platform, delta));
    assert(actor.bounds_pixels.x == 17);
    assert(actor.bounds_pixels.y == 24);
}

void test_platformer_snaps_to_moving_platform_from_above() {
    const gbs::PlatformerMovingPlatform platforms[] = {
        gbs::PlatformerMovingPlatform {
            gbs::Rect { 16, 40, 32, 8 },
            gbs::Vec2i { 16, 40 },
            gbs::Vec2i { 24, 40 },
            gbs::Vec2i { 0x0100, 0 },
            true,
            true,
            0,
            0
        }
    };
    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 20, 25, 16, 16 });
    actor.velocity_x256.y = 0x0200;
    size_t platform_index = 99;

    assert(gbs::snap_platformer_actor_to_moving_platforms(actor, platforms, 1, &platform_index));
    assert(platform_index == 0);
    assert(actor.bounds_pixels.y == 24);
    assert(actor.velocity_x256.y == 0);
    assert(actor.on_ground);

    actor = gbs::platformer_actor_from_rect(gbs::Rect { 20, 39, 16, 16 });
    actor.velocity_x256.y = -0x0200;
    platform_index = 99;
    assert(!gbs::snap_platformer_actor_to_moving_platforms(actor, platforms, 1, &platform_index));
    assert(platform_index == 99);
}

void test_platformer_event_script_lookup_executes_runtime_effects() {
    static constexpr gbs::EventCommand hazard_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetVariable, 1, 9, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::EventCommand checkpoint_commands[] = {
        gbs::EventCommand { gbs::EventOp::PlaySfx, 2, 0, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::EventCommand camera_zone_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetCameraPosition, 24, 32, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::EventCommand enemy_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetVariable, 4, 12, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::EventCommand moving_platform_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetVariable, 6, 13, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::PlatformerHazardEventData hazard_events[] = {
        gbs::PlatformerHazardEventData {
            3,
            gbs::EventScript { hazard_commands, 2 }
        }
    };
    static constexpr gbs::PlatformerCheckpointEventData checkpoint_events[] = {
        gbs::PlatformerCheckpointEventData {
            7,
            gbs::EventScript { checkpoint_commands, 2 }
        }
    };
    static constexpr gbs::PlatformerCameraZoneEventData camera_zone_events[] = {
        gbs::PlatformerCameraZoneEventData {
            1,
            gbs::EventScript { camera_zone_commands, 2 }
        }
    };
    static constexpr gbs::PlatformerEnemyEventData enemy_events[] = {
        gbs::PlatformerEnemyEventData {
            2,
            gbs::EventScript { enemy_commands, 2 }
        }
    };
    static constexpr gbs::PlatformerMovingPlatformEventData moving_platform_events[] = {
        gbs::PlatformerMovingPlatformEventData {
            5,
            gbs::EventScript { moving_platform_commands, 2 }
        }
    };
    gbs::PlatformerRoomData room {};
    room.hazard_events = hazard_events;
    room.hazard_event_count = 1;
    room.checkpoint_events = checkpoint_events;
    room.checkpoint_event_count = 1;
    room.camera_zone_events = camera_zone_events;
    room.camera_zone_event_count = 1;
    room.enemy_events = enemy_events;
    room.enemy_event_count = 1;
    room.moving_platform_events = moving_platform_events;
    room.moving_platform_event_count = 1;

    gbs::EventState event_state;
    gbs::init_event_state(event_state);
    gbs::run_event_script(event_state, gbs::platformer_hazard_event_script_for(room, 3));
    assert(event_state.variables[1] == 9);
    gbs::run_event_script(event_state, gbs::platformer_checkpoint_event_script_for(room, 7));
    assert(event_state.last_sfx == 2);
    gbs::run_event_script(event_state, gbs::platformer_camera_zone_event_script_for(room, 1));
    assert(event_state.camera_changed);
    assert(event_state.camera_x == 24);
    assert(event_state.camera_y == 32);
    gbs::run_event_script(event_state, gbs::platformer_enemy_event_script_for(room, 2));
    assert(event_state.variables[4] == 12);
    gbs::run_event_script(event_state, gbs::platformer_moving_platform_event_script_for(room, 5));
    assert(event_state.variables[6] == 13);
    assert(!gbs::has_event_script(gbs::platformer_hazard_event_script_for(room, 0)));
    assert(!gbs::has_event_script(gbs::platformer_checkpoint_event_script_for(room, 8)));
    assert(!gbs::has_event_script(gbs::platformer_camera_zone_event_script_for(room, 0)));
    assert(!gbs::has_event_script(gbs::platformer_enemy_event_script_for(room, 0)));
    assert(!gbs::has_event_script(gbs::platformer_moving_platform_event_script_for(room, 0)));
}

void test_platformer_npc_interaction_and_collision_use_runtime_bounds() {
    static constexpr gbs::EventCommand interact_commands[] = {
        gbs::EventCommand { gbs::EventOp::SetVariable, 7, 1, 0 },
        gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
    };
    static constexpr gbs::PlatformerNpcData npcs[] = {
        gbs::PlatformerNpcData {
            gbs::Vec2i { 1072, 104 },
            gbs::Vec2i { 16, 16 },
            nullptr,
            nullptr,
            gbs::EventScript { interact_commands, 2 }
        }
    };
    gbs::PlatformerRoomData room {};
    room.npcs = npcs;
    room.npc_count = 1;
    gbs::PlatformerNpcRuntime runtimes[] = { gbs::platformer_npc_runtime_from_data(npcs[0]) };
    gbs::Rect player_bounds { 1070, 104, 16, 16 };

    const gbs::EventScript interaction = gbs::platformer_npc_interaction_script_for(
        room,
        runtimes,
        1,
        player_bounds
    );
    assert(gbs::has_event_script(interaction));
    assert(gbs::platformer_actor_intersects_npcs(player_bounds, runtimes, 1));

    gbs::apply_platformer_npc_event_command(
        runtimes,
        1,
        gbs::EventActorCommand { gbs::EventActorOp::SetCollisionEnabled, 0, 0, 0, 0, 0 }
    );
    assert(!gbs::platformer_actor_intersects_npcs(player_bounds, runtimes, 1));
    assert(gbs::has_event_script(gbs::platformer_npc_interaction_script_for(room, runtimes, 1, player_bounds)));

    runtimes[0].active = false;
    assert(!gbs::has_event_script(gbs::platformer_npc_interaction_script_for(room, runtimes, 1, player_bounds)));
    assert(!gbs::platformer_actor_intersects_npcs(player_bounds, runtimes, 1));
}

void test_platformer_npc_collision_uses_local_offset_from_gb_studio_anchor() {
    static constexpr gbs::PlatformerNpcData npc {
        gbs::Vec2i { 360, 104 },
        gbs::Vec2i { 16, 16 },
        nullptr,
        nullptr,
        gbs::empty_event_script(),
        nullptr,
        gbs::PlatformerFacing::Right,
        100,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::Vec2i { -8, -16 }
    };
    gbs::PlatformerNpcRuntime runtime = gbs::platformer_npc_runtime_from_data(npc);
    const gbs::Rect collision = gbs::platformer_npc_actor_rect(runtime);

    assert(runtime.actor.position_pixels.x == 360);
    assert(runtime.actor.position_pixels.y == 104);
    assert(collision.x == 352);
    assert(collision.y == 88);
    assert(collision.width == 16);
    assert(collision.height == 16);
}

} // namespace

void test_fractional_gravity_keeps_grounded_animation_stable() {
    const uint8_t floors[] = { gbs::TileSolid, gbs::TileBlockTop };
    for (const uint8_t floor : floors) {
        uint8_t flags[16] = {};
        for (int x = 0; x < 4; ++x) flags[12 + x] = floor;
        const gbs::TileMap map { flags, 4, 4 };
        auto config = test_config;
        config.gravity_x256 = 96;
        auto actor = gbs::platformer_actor_from_rect(gbs::Rect { 8, 16, 8, 8 });
        actor.on_ground = true;
        for (int frame = 0; frame < 120; ++frame) {
            gbs::update_platformer_actor(map, actor, { 0, 0, 0 }, config);
            assert(actor.on_ground);
            assert(actor.bounds_pixels.y == 16);
            assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Idle);
        }
        gbs::update_platformer_actor(map, actor, { gbs::ButtonA, gbs::ButtonA, 0 }, config);
        assert(!actor.on_ground);
        assert(gbs::platformer_actor_animation_state(actor) == gbs::PlatformerActorAnimationState::Jump);
    }
}

void test_platformer_walks_off_platform_group_npc() {
    gbs::PlatformerNpcRuntime npc {};
    npc.active = npc.visible = true;
    npc.collision_group = 2;
    npc.actor.position_pixels = { 936, 120 };
    npc.actor.collision_offset_pixels = { 8, -8 };
    npc.actor.size_pixels = { 16, 16 };
    npc.actor.collision_mask = 0xFFFF;
    const gbs::Rect before { 933, 96, 16, 16 };
    auto actor = gbs::platformer_actor_from_rect({ 935, 97, 16, 16 });
    actor.velocity_x256 = { 512, 96 };
    assert(gbs::snap_platformer_actor_to_npcs(actor, before, &npc, 1, 2));
    assert(actor.bounds_pixels.x == 935 && actor.bounds_pixels.y == 96);
    assert(actor.on_ground && actor.velocity_x256.x == 512);
    assert(!gbs::platformer_actor_intersects_npcs(actor.bounds_pixels, &npc, 1));
    actor.bounds_pixels = { 960, 97, 16, 16 };
    assert(!gbs::snap_platformer_actor_to_npcs(actor, before, &npc, 1, 2));
    actor.bounds_pixels = { 935, 97, 16, 16 };
    assert(!gbs::snap_platformer_actor_to_npcs(actor, before, &npc, 1, 1));
    actor.velocity_x256.y = -512;
    assert(!gbs::snap_platformer_actor_to_npcs(actor, before, &npc, 1, 2));
}

int main() {
    test_platformer_walks_off_platform_group_npc();
    test_fractional_gravity_keeps_grounded_animation_stable();
    test_platformer_falls_and_lands_on_solid_floor();
    test_platformer_blank_gravity_moves_without_player_input();
    test_platformer_preserves_fractional_velocity_between_frames();
    test_platformer_actor_preserves_gb_studio_anchor_and_local_collision_bounds();
    test_platformer_collision_clears_fractional_remainder();
    test_platformer_runs_and_stops_on_wall();
    test_platformer_jumps_from_ground();
    test_platformer_coyote_jump_after_leaving_edge();
    test_platformer_advanced_air_jump_consumes_single_charge();
    test_platformer_advanced_wall_slide_and_wall_jump();
    test_platformer_advanced_dash_and_glide_use_dedicated_buttons();
    test_platformer_lands_on_one_way_platform_from_above();
    test_platformer_can_jump_up_through_one_way_platform();
    test_platformer_snaps_to_sloped_floor();
    test_platformer_update_accepts_eight_pixel_slope_handoff();
    test_platformer_snaps_to_diagonal_slope_in_adjacent_tile_row();
    test_platformer_enters_ladder_approach_lane_before_wall();
    test_platformer_derives_animation_state();
    test_platformer_climbs_ladder_without_gravity();
    test_platformer_plus_supports_variable_jump_and_air_control();
    test_platformer_plus_can_drop_through_one_way_platforms();
    test_platformer_plus_restricts_dash_style_to_airborne_state();
    test_platformer_camera_follows_and_clamps();
    test_platformer_checkpoint_updates_respawn_once();
    test_platformer_hazard_respawns_and_counts_damage();
    test_platformer_hazard_reports_hit_index();
    test_platformer_hazard_can_damage_without_respawn();
    test_platformer_camera_zone_locks_and_reports_state();
    test_runtime_trigger_reports_enter_and_leave_once_per_crossing();
    test_platformer_enemy_patrol_turns_at_bounds();
    test_platformer_enemy_patrol_turns_at_wall_and_ledge();
    test_platformer_enemy_contact_distinguishes_stomp_and_damage();
    test_platformer_moving_platform_carries_actor();
    test_platformer_snaps_to_moving_platform_from_above();
    test_platformer_event_script_lookup_executes_runtime_effects();
    test_platformer_npc_interaction_and_collision_use_runtime_bounds();
    test_platformer_npc_collision_uses_local_offset_from_gb_studio_anchor();
    return 0;
}
