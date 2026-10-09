#include "gbs/platformer.hpp"

namespace {

int abs_int(int value) {
    return value < 0 ? -value : value;
}

int sign_int(int value) {
    if (value > 0) {
        return 1;
    }
    if (value < 0) {
        return -1;
    }
    return 0;
}

int approach_zero(int value, int amount) {
    if (value > 0) {
        value -= amount;
        return value > 0 ? value : 0;
    }
    if (value < 0) {
        value += amount;
        return value < 0 ? value : 0;
    }
    return 0;
}

int consume_subpixel_delta(int velocity_x256, int& remainder_x256) {
    remainder_x256 += velocity_x256;
    const int delta_pixels = remainder_x256 / 256;
    remainder_x256 -= delta_pixels * 256;
    return delta_pixels;
}

bool rect_hits_ladder(const gbs::TileMap& map, gbs::Rect rect) {
    return (gbs::tile_flags_in_rect(map, rect) & gbs::TileLadder) != 0;
}

bool tile_blocks_platformer_horizontal(const gbs::TileMap& map, int tile_x, int tile_y, int direction) {
    uint8_t flags = gbs::tile_flags_at(map, tile_x, tile_y);
    if ((flags & gbs::TileSolid) != 0) {
        return true;
    }
    if (direction > 0 && (flags & gbs::TileBlockLeft) != 0) {
        return true;
    }
    if (direction < 0 && (flags & gbs::TileBlockRight) != 0) {
        return true;
    }
    return false;
}

bool tile_supports_platformer_floor(const gbs::TileMap& map, int tile_x, int tile_y) {
    uint8_t flags = gbs::tile_flags_at(map, tile_x, tile_y);
    return (flags & (gbs::TileSolid | gbs::TileBlockTop)) != 0 ||
        gbs::tile_slope_at(map, tile_x, tile_y) != gbs::TileSlope::None;
}

bool tile_blocks_platformer_vertical(
    const gbs::TileMap& map,
    int tile_x,
    int tile_y,
    int direction,
    int previous_bottom,
    int next_bottom,
    bool ignore_one_way
) {
    uint8_t flags = gbs::tile_flags_at(map, tile_x, tile_y);
    if ((flags & gbs::TileSolid) != 0) {
        return true;
    }
    if (direction < 0 && (flags & gbs::TileBlockBottom) != 0) {
        return true;
    }
    if (!ignore_one_way && direction > 0 && (flags & gbs::TileBlockTop) != 0) {
        int tile_top = tile_y * gbs::gba_tile_size;
        return previous_bottom <= tile_top && next_bottom >= tile_top;
    }
    return false;
}

bool rect_hits_platformer_horizontal(const gbs::TileMap& map, gbs::Rect rect, int direction) {
    int left = rect.x / gbs::gba_tile_size;
    int top = rect.y / gbs::gba_tile_size;
    int right = (rect.right() - 1) / gbs::gba_tile_size;
    int bottom = (rect.bottom() - 1) / gbs::gba_tile_size;

    for (int y = top; y <= bottom; ++y) {
        for (int x = left; x <= right; ++x) {
            if (tile_blocks_platformer_horizontal(map, x, y, direction)) {
                return true;
            }
        }
    }
    return false;
}

bool platformer_enemy_has_floor_ahead(const gbs::TileMap& map, const gbs::Rect& rect, int direction) {
    const int foot_x = direction > 0 ? rect.right() : rect.x - 1;
    const int tile_x = foot_x / gbs::gba_tile_size;
    const int tile_y = rect.bottom() / gbs::gba_tile_size;
    return tile_supports_platformer_floor(map, tile_x, tile_y);
}

int platformer_enemy_step_delta(const gbs::PlatformerEnemy& enemy) {
    int direction = enemy.facing_right ? 1 : -1;
    int delta_pixels = (abs_int(enemy.velocity_x256.x) / 256) * direction;
    if (delta_pixels == 0 && enemy.velocity_x256.x != 0) {
        delta_pixels = direction;
    }
    return delta_pixels;
}

bool clamp_platformer_enemy_to_patrol_bounds(gbs::PlatformerEnemy& enemy) {
    if (enemy.patrol_bounds_pixels.width <= 0) {
        return false;
    }

    const int min_x = enemy.patrol_bounds_pixels.x;
    const int max_x = enemy.patrol_bounds_pixels.right() - enemy.bounds_pixels.width;
    if (enemy.bounds_pixels.x > max_x) {
        enemy.bounds_pixels.x = max_x;
        enemy.facing_right = false;
        return true;
    }
    if (enemy.bounds_pixels.x < min_x) {
        enemy.bounds_pixels.x = min_x;
        enemy.facing_right = true;
        return true;
    }
    return false;
}

bool rect_hits_platformer_vertical(const gbs::TileMap& map, gbs::Rect rect, int direction, int previous_bottom, bool ignore_one_way) {
    int left = rect.x / gbs::gba_tile_size;
    int top = rect.y / gbs::gba_tile_size;
    int right = (rect.right() - 1) / gbs::gba_tile_size;
    int bottom = (rect.bottom() - 1) / gbs::gba_tile_size;

    for (int y = top; y <= bottom; ++y) {
        for (int x = left; x <= right; ++x) {
            if (tile_blocks_platformer_vertical(map, x, y, direction, previous_bottom, rect.bottom(), ignore_one_way)) {
                return true;
            }
        }
    }
    return false;
}

int move_axis(
    const gbs::TileMap& map,
    gbs::Rect& rect,
    int delta_pixels,
    bool horizontal,
    bool& hit,
    bool& landed,
    bool ignore_one_way = false,
    bool ignore_all_collisions = false
) {
    int remaining = abs_int(delta_pixels);
    int direction = sign_int(delta_pixels);
    int moved = 0;
    hit = false;
    landed = false;

    while (remaining > 0) {
        gbs::Rect next = rect;
        int previous_bottom = rect.bottom();
        if (horizontal) {
            next.x += direction;
        } else {
            next.y += direction;
        }

        bool blocked = horizontal
            ? rect_hits_platformer_horizontal(map, next, direction)
            : rect_hits_platformer_vertical(map, next, direction, previous_bottom, ignore_one_way);
        if (ignore_all_collisions) {
            blocked = false;
        }
        if (blocked) {
            hit = true;
            landed = !horizontal && direction > 0;
            break;
        }

        rect = next;
        moved += direction;
        --remaining;
    }

    return moved;
}

} // namespace

namespace gbs {

PlatformerActor platformer_actor_from_rect(Rect anchor_bounds_pixels, Vec2i collision_offset_pixels) {
    return PlatformerActor {
        Rect {
            anchor_bounds_pixels.x + collision_offset_pixels.x,
            anchor_bounds_pixels.y + collision_offset_pixels.y,
            anchor_bounds_pixels.width,
            anchor_bounds_pixels.height
        },
        Vec2i { 0, 0 },
        PlatformerFacing::Right,
        false,
        false,
        false,
        false,
        0,
        0,
        Vec2i { 0, 0 },
        collision_offset_pixels
    };
}

Rect platformer_actor_rect(const PlatformerActor& actor) {
    return actor.bounds_pixels;
}

Vec2i platformer_actor_anchor_position(const PlatformerActor& actor) {
    return Vec2i {
        actor.bounds_pixels.x - actor.collision_offset_pixels.x,
        actor.bounds_pixels.y - actor.collision_offset_pixels.y
    };
}

void set_platformer_actor_anchor_position(PlatformerActor& actor, Vec2i anchor_position_pixels) {
    actor.bounds_pixels.x = anchor_position_pixels.x + actor.collision_offset_pixels.x;
    actor.bounds_pixels.y = anchor_position_pixels.y + actor.collision_offset_pixels.y;
}

PlatformerRuntimeState platformer_state_from_spawn(Vec2i respawn_position_pixels, uint16_t checkpoint_id) {
    return PlatformerRuntimeState {
        respawn_position_pixels,
        checkpoint_id,
        0,
        false,
        false,
        false,
        0,
        0
    };
}

bool platformer_actor_on_ladder(const TileMap& map, const PlatformerActor& actor) {
    Rect probe = actor.bounds_pixels;
    probe.x += probe.width / 4;
    probe.width = probe.width / 2 > 0 ? probe.width / 2 : probe.width;
    return rect_hits_ladder(map, probe);
}

bool platformer_actor_on_ground(const TileMap& map, const PlatformerActor& actor) {
    int left = actor.bounds_pixels.x / gbs::gba_tile_size;
    int right = (actor.bounds_pixels.right() - 1) / gbs::gba_tile_size;
    int tile_y = actor.bounds_pixels.bottom() / gbs::gba_tile_size;
    for (int tile_x = left; tile_x <= right; ++tile_x) {
        uint8_t flags = tile_flags_at(map, tile_x, tile_y);
        if ((flags & (TileSolid | TileBlockTop)) != 0) {
            return true;
        }
    }
    return false;
}

bool platformer_slope_floor_y_at(const TileMap& map, int pixel_x, int tile_y, int* floor_y) {
    if (floor_y == nullptr) {
        return false;
    }
    const int tile_x = pixel_x / gbs::gba_tile_size;
    const TileSlope slope = tile_slope_at(map, tile_x, tile_y);
    const int local_x = clamp_int(pixel_x - tile_x * gbs::gba_tile_size, 0, gbs::gba_tile_size - 1);
    int local_floor_y = 0;

    switch (slope) {
    case TileSlope::BlockBelowRising:
        local_floor_y = gbs::gba_tile_size - 1 - local_x;
        break;
    case TileSlope::BlockBelowFalling:
        local_floor_y = local_x;
        break;
    case TileSlope::None:
    case TileSlope::BlockAboveRising:
    case TileSlope::BlockAboveFalling:
        return false;
    }

    *floor_y = tile_y * gbs::gba_tile_size + local_floor_y;
    return true;
}

bool snap_platformer_actor_to_slope_floor(const TileMap& map, PlatformerActor& actor, int max_snap_pixels) {
    if (max_snap_pixels < 0) {
        return false;
    }
    const int foot_x = actor.bounds_pixels.x + actor.bounds_pixels.width / 2;
    const int foot_y = actor.bounds_pixels.bottom();
    const int tile_y = foot_y / gbs::gba_tile_size;
    int best_delta_y = 0;
    bool found_slope = false;
    for (int candidate_tile_y = tile_y - 1; candidate_tile_y <= tile_y + 1; ++candidate_tile_y) {
        int candidate_floor_y = 0;
        if (!platformer_slope_floor_y_at(map, foot_x, candidate_tile_y, &candidate_floor_y)) {
            continue;
        }
        const int candidate_delta_y = candidate_floor_y - foot_y;
        if (candidate_delta_y < -max_snap_pixels || candidate_delta_y > max_snap_pixels) {
            continue;
        }
        if (!found_slope || abs_int(candidate_delta_y) < abs_int(best_delta_y)) {
            best_delta_y = candidate_delta_y;
            found_slope = true;
        }
    }
    if (!found_slope) {
        return false;
    }

    actor.bounds_pixels.y += best_delta_y;
    actor.on_ground = true;
    actor.velocity_x256.y = 0;
    actor.movement_remainder_x256.y = 0;
    return true;
}

PlatformerActorAnimationState platformer_actor_animation_state(const PlatformerActor& actor, int run_threshold_x256) {
    if (actor.dashing) {
        return PlatformerActorAnimationState::Dash;
    }
    if (actor.wall_sliding) {
        return PlatformerActorAnimationState::WallSlide;
    }
    if (actor.gliding) {
        return PlatformerActorAnimationState::Glide;
    }
    if (actor.on_ladder) {
        return PlatformerActorAnimationState::Climb;
    }
    if (!actor.on_ground) {
        return actor.velocity_x256.y < 0
            ? PlatformerActorAnimationState::Jump
            : PlatformerActorAnimationState::Fall;
    }
    if (abs_int(actor.velocity_x256.x) >= run_threshold_x256) {
        return PlatformerActorAnimationState::Run;
    }
    return PlatformerActorAnimationState::Idle;
}

const SpriteAnimation* platformer_player_animation_for_state(
    const PlatformerPlayerAnimationSet& animations,
    PlatformerActorAnimationState state
) {
    const SpriteAnimation* selected = nullptr;
    switch (state) {
        case PlatformerActorAnimationState::Run:
            selected = animations.walk;
            break;
        case PlatformerActorAnimationState::Jump:
            selected = animations.jump;
            break;
        case PlatformerActorAnimationState::Fall:
            selected = animations.fall;
            break;
        case PlatformerActorAnimationState::Climb:
            selected = animations.climb;
            break;
        case PlatformerActorAnimationState::WallSlide:
            selected = animations.wall_slide;
            break;
        case PlatformerActorAnimationState::Dash:
            selected = animations.dash;
            break;
        case PlatformerActorAnimationState::Glide:
            selected = animations.glide;
            break;
        case PlatformerActorAnimationState::Idle:
            selected = animations.idle;
            break;
    }
    return selected != nullptr ? selected : animations.idle;
}

void update_platformer_actor(const TileMap& map, PlatformerActor& actor, InputState input, const PlatformerConfig& config) {
    const bool touched_wall_last_frame = actor.hit_wall && !actor.on_ground;
    actor.hit_ceiling = false;
    actor.hit_wall = false;
    actor.wall_sliding = false;
    actor.dashing = false;
    actor.gliding = false;

    if (actor.dash_recharge_timer > 0) {
        --actor.dash_recharge_timer;
    }

    if (actor.on_ground || actor.on_ladder) {
        actor.air_jumps_used = 0;
        if (config.dash_recharge_frames == 0 || actor.dash_recharge_timer == 0) {
            actor.dash_available = true;
        }
    }

    if (input.was_pressed(ButtonA)) {
        actor.jump_buffer_timer = static_cast<uint8_t>(config.jump_buffer_frames > 255 ? 255 : config.jump_buffer_frames);
    } else if (actor.jump_buffer_timer > 0) {
        --actor.jump_buffer_timer;
    }

    const bool drop_through_input = config.drop_through_mode == 1
        ? input.is_held(ButtonDown)
        : config.drop_through_mode == 2
            ? input.was_pressed(ButtonDown)
            : config.drop_through_mode == 3
                ? input.is_held(ButtonDown) && input.is_held(ButtonA)
                : config.drop_through_mode == 4
                    ? input.was_pressed(ButtonDown) && input.was_pressed(ButtonA)
                    : false;
    if (actor.on_ground && drop_through_input) {
        actor.drop_through_timer = 8;
        actor.on_ground = false;
        actor.jump_buffer_timer = 0;
    }

    const bool dash_allowed_on_state = config.dash_style == 0
        ? actor.on_ground
        : config.dash_style == 1
            ? !actor.on_ground
            : true;
    if (config.dash_enabled && input.was_pressed(ButtonB) && actor.dash_available && dash_allowed_on_state && config.dash_frames > 0) {
        actor.dash_timer = static_cast<uint8_t>(config.dash_frames > 255 ? 255 : config.dash_frames);
        actor.dash_available = false;
        actor.dash_recharge_timer = config.dash_recharge_frames;
    }
    if (actor.dash_timer > 0) {
        actor.dashing = true;
        if (config.dash_momentum != 1) {
            actor.velocity_x256.x = actor.facing == PlatformerFacing::Left
                ? -config.dash_speed_x256
                : config.dash_speed_x256;
        } else {
            actor.velocity_x256.x = 0;
        }
        if (config.dash_momentum == 1) {
            actor.velocity_x256.y = input.is_held(ButtonDown)
                ? config.dash_speed_x256
                : -config.dash_speed_x256;
        } else if (config.dash_momentum == 0) {
            actor.velocity_x256.y = 0;
        }
        --actor.dash_timer;
    } else {
        const bool can_control_in_air = actor.on_ground || actor.on_ladder || config.air_control_enabled;
        if (input.is_held(ButtonLeft) && can_control_in_air) {
            actor.velocity_x256.x -= config.acceleration_x256;
            if (actor.on_ground || actor.on_ladder || config.turn_in_air_enabled) {
                actor.facing = PlatformerFacing::Left;
            }
        } else if (input.is_held(ButtonRight) && can_control_in_air) {
            actor.velocity_x256.x += config.acceleration_x256;
            if (actor.on_ground || actor.on_ladder || config.turn_in_air_enabled) {
                actor.facing = PlatformerFacing::Right;
            }
        } else if (actor.on_ground || actor.on_ladder) {
            actor.velocity_x256.x = approach_zero(actor.velocity_x256.x, config.friction_x256);
        } else if (config.air_deceleration_x256 > 0) {
            actor.velocity_x256.x = approach_zero(actor.velocity_x256.x, config.air_deceleration_x256);
        }
        actor.velocity_x256.x = clamp_int(actor.velocity_x256.x, -config.max_run_speed_x256, config.max_run_speed_x256);
    }

    actor.on_ladder = config.ladders_enabled && platformer_actor_on_ladder(map, actor);
    if (actor.dashing) {
        // Dash momentum owns the vertical component for this frame.
    } else if (actor.on_ladder && (input.is_held(ButtonUp) || input.is_held(ButtonDown))) {
        actor.velocity_x256.y = 0;
        if (input.is_held(ButtonUp)) {
            actor.velocity_x256.y = -config.max_run_speed_x256;
        } else if (input.is_held(ButtonDown)) {
            actor.velocity_x256.y = config.max_run_speed_x256;
        }
    } else {
        actor.velocity_x256.y += config.gravity_x256;
        if (actor.velocity_x256.y > config.max_fall_speed_x256) {
            actor.velocity_x256.y = config.max_fall_speed_x256;
        }
        if (config.wall_jump_enabled && config.wall_slide_enabled && touched_wall_last_frame && actor.velocity_x256.y > 0) {
            actor.wall_sliding = true;
            if (actor.velocity_x256.y > config.wall_slide_speed_x256) {
                actor.velocity_x256.y = config.wall_slide_speed_x256;
            }
        }
        if (config.glide_enabled && input.is_held(ButtonR) && actor.velocity_x256.y > 0) {
            actor.gliding = true;
            if (actor.velocity_x256.y > config.glide_fall_speed_x256) {
                actor.velocity_x256.y = config.glide_fall_speed_x256;
            }
        }
    }

    if (actor.on_ground) {
        actor.coyote_timer = static_cast<uint8_t>(config.coyote_frames > 255 ? 255 : config.coyote_frames);
    } else if (actor.coyote_timer > 0) {
        --actor.coyote_timer;
    }

    const int minimum_jump_speed = clamp_int(config.jump_min_height_x256, 0, config.jump_speed_x256);
    const int grounded_jump_speed = minimum_jump_speed > 0 ? minimum_jump_speed : config.jump_speed_x256;
    if (actor.jump_buffer_timer > 0 && (actor.on_ground || actor.coyote_timer > 0 || actor.on_ladder)) {
        actor.velocity_x256.y = -grounded_jump_speed;
        actor.jump_hold_timer = static_cast<uint8_t>(config.jump_hold_frames > 255 ? 255 : config.jump_hold_frames);
        actor.on_ground = false;
        actor.on_ladder = false;
        actor.coyote_timer = 0;
        actor.jump_buffer_timer = 0;
        actor.dash_timer = 0;
        actor.dashing = false;
    } else if (actor.jump_buffer_timer > 0 && config.wall_jump_enabled && touched_wall_last_frame) {
        actor.velocity_x256.y = -config.wall_jump_speed_x256;
        actor.velocity_x256.x = actor.facing == PlatformerFacing::Right
            ? -config.wall_jump_push_x256
            : config.wall_jump_push_x256;
        actor.facing = actor.facing == PlatformerFacing::Right
            ? PlatformerFacing::Left
            : PlatformerFacing::Right;
        actor.jump_buffer_timer = 0;
        actor.wall_sliding = false;
        actor.dash_timer = 0;
        actor.dashing = false;
    } else if (
        actor.jump_buffer_timer > 0 &&
        config.max_air_jumps > 0 &&
        actor.air_jumps_used < static_cast<uint8_t>(config.max_air_jumps > 255 ? 255 : config.max_air_jumps)
    ) {
        const int reduced_jump_speed = config.jump_speed_x256 - config.jump_height_reduction_x256 * static_cast<int>(actor.air_jumps_used);
        actor.velocity_x256.y = -(minimum_jump_speed > 0
            ? clamp_int(reduced_jump_speed, minimum_jump_speed, config.jump_speed_x256)
            : reduced_jump_speed);
        actor.jump_hold_timer = static_cast<uint8_t>(config.jump_hold_frames > 255 ? 255 : config.jump_hold_frames);
        ++actor.air_jumps_used;
        actor.jump_buffer_timer = 0;
        actor.dash_timer = 0;
        actor.dashing = false;
    }

    if (!actor.dashing && actor.jump_hold_timer > 0) {
        if (input.is_held(ButtonA) && actor.velocity_x256.y < 0 && config.jump_hold_frames > 0) {
            const int remaining_boost = config.jump_speed_x256 - minimum_jump_speed;
            const int boost_per_frame = (remaining_boost + config.jump_hold_frames - 1) / config.jump_hold_frames;
            actor.velocity_x256.y = clamp_int(actor.velocity_x256.y - boost_per_frame, -config.jump_speed_x256, 0);
            --actor.jump_hold_timer;
        } else {
            actor.jump_hold_timer = 0;
        }
    }

    Rect moved_rect = actor.bounds_pixels;
    bool hit = false;
    bool landed = false;
    move_axis(
        map,
        moved_rect,
        consume_subpixel_delta(actor.velocity_x256.x, actor.movement_remainder_x256.x),
        true,
        hit,
        landed,
        false,
        actor.dashing && config.dash_through >= 3
    );
    if (hit) {
        actor.hit_wall = true;
        actor.velocity_x256.x = 0;
        actor.movement_remainder_x256.x = 0;
    }

    hit = false;
    landed = false;
    move_axis(
        map,
        moved_rect,
        consume_subpixel_delta(actor.velocity_x256.y, actor.movement_remainder_x256.y),
        false,
        hit,
        landed,
        actor.drop_through_timer > 0,
        actor.dashing && config.dash_through >= 3
    );
    // Subpixel gravity may produce no integer movement this frame. Contact
    // must not alternate between grounded and falling until a pixel accrues.
    // Probe support at the new horizontal position without moving the actor;
    // this also releases ground immediately on walking off an edge.
    if (!hit && actor.velocity_x256.y >= 0) {
        Rect support_probe = moved_rect;
        bool probe_hit = false;
        bool probe_landed = false;
        move_axis(map, support_probe, 1, false, probe_hit, probe_landed,
            actor.drop_through_timer > 0, actor.dashing && config.dash_through >= 3);
        if (probe_hit && probe_landed) {
            hit = true;
            landed = true;
        }
    }
    if (hit) {
        if (landed) {
            actor.on_ground = true;
        } else {
            actor.hit_ceiling = true;
        }
        actor.velocity_x256.y = 0;
        actor.movement_remainder_x256.y = 0;
        actor.jump_hold_timer = 0;
    } else {
        PlatformerActor moved_actor = actor;
        moved_actor.bounds_pixels = moved_rect;
        // Adjacent diagonal slope cells can change their vertical handoff by
        // one tile between frames. The normal public snap budget remains 4px,
        // while the gameplay step accepts the full 8px GBA tile transition.
        actor.on_ground = snap_platformer_actor_to_slope_floor(map, moved_actor, gbs::gba_tile_size);
        moved_rect = moved_actor.bounds_pixels;
        actor.velocity_x256.y = moved_actor.velocity_x256.y;
        actor.movement_remainder_x256.y = moved_actor.movement_remainder_x256.y;
    }

    actor.bounds_pixels = moved_rect;
    if (actor.drop_through_timer > 0) {
        --actor.drop_through_timer;
    }
    if (actor.on_ladder && !input.is_held(ButtonUp) && !input.is_held(ButtonDown)) {
        actor.velocity_x256.y = 0;
    }
}

void update_platformer_blank_actor(
    const TileMap& map,
    PlatformerActor& actor,
    int gravity_subpixels,
    int max_fall_speed_x256
) {
    actor.hit_ceiling = false;
    actor.hit_wall = false;
    actor.velocity_x256.x = 0;
    actor.movement_remainder_x256.x = 0;
    actor.velocity_x256.y += gravity_subpixels > 0 ? gravity_subpixels / 16 : 0;
    if (actor.velocity_x256.y > max_fall_speed_x256) {
        actor.velocity_x256.y = max_fall_speed_x256;
    }

    Rect moved_rect = actor.bounds_pixels;
    bool hit = false;
    bool landed = false;
    move_axis(
        map,
        moved_rect,
        consume_subpixel_delta(actor.velocity_x256.y, actor.movement_remainder_x256.y),
        false,
        hit,
        landed
    );
    if (hit) {
        actor.on_ground = landed;
        actor.hit_ceiling = !landed;
        actor.velocity_x256.y = 0;
        actor.movement_remainder_x256.y = 0;
    } else {
        actor.on_ground = false;
    }
    actor.bounds_pixels = moved_rect;
}

void update_platformer_camera(Camera& camera, const PlatformerActor& actor, int room_width_pixels, int room_height_pixels) {
    update_platformer_camera(camera, actor, room_width_pixels, room_height_pixels, default_platformer_config());
}

void update_platformer_camera(
    Camera& camera,
    const PlatformerActor& actor,
    int room_width_pixels,
    int room_height_pixels,
    const PlatformerConfig& config
) {
    if (camera.follow_player) {
        const int center_x = actor.bounds_pixels.x + actor.bounds_pixels.width / 2;
        const int center_y = actor.bounds_pixels.y + actor.bounds_pixels.height / 2;
        if ((config.camera_follow_directions & 0x01) != 0 || (config.camera_follow_directions & 0x02) != 0) {
            const int deadzone = config.camera_deadzone_x_pixels;
            const int viewport_center_x = camera.position_pixels.x + gbs::gba_screen_width / 2;
            if (deadzone <= 0) {
                camera.position_pixels.x = center_x - gbs::gba_screen_width / 2;
            } else if ((config.camera_follow_directions & 0x01) != 0 && center_x > viewport_center_x + deadzone) {
                camera.position_pixels.x += center_x - (viewport_center_x + deadzone);
            } else if ((config.camera_follow_directions & 0x02) != 0 && center_x < viewport_center_x - deadzone) {
                camera.position_pixels.x -= (viewport_center_x - deadzone) - center_x;
            }
        }
        if ((config.camera_follow_directions & 0x04) != 0 || (config.camera_follow_directions & 0x08) != 0) {
            camera.position_pixels.y = center_y - gbs::gba_screen_height / 2;
        }
        if (config.camera_lock_edge == 1) {
            camera.position_pixels.x = 0;
        } else if (config.camera_lock_edge == 2) {
            camera.position_pixels.x = room_width_pixels - gbs::gba_screen_width;
        }
    }
    clamp_camera_to_bounds(camera, room_width_pixels, room_height_pixels);
}

bool platformer_actor_hits_hazard(const PlatformerActor& actor, const PlatformerHazard* hazards, size_t hazard_count, size_t* hazard_index) {
    if (hazards == nullptr) {
        return false;
    }

    Rect actor_bounds = platformer_actor_rect(actor);
    for (size_t index = 0; index < hazard_count; ++index) {
        if (intersects(actor_bounds, hazards[index].area_pixels)) {
            if (hazard_index != nullptr) {
                *hazard_index = index;
            }
            return true;
        }
    }
    return false;
}

bool update_platformer_checkpoints(PlatformerActor& actor, const PlatformerCheckpoint* checkpoints, size_t checkpoint_count, PlatformerRuntimeState& state) {
    state.checkpoint_changed = false;
    if (checkpoints == nullptr) {
        return false;
    }

    Rect actor_bounds = platformer_actor_rect(actor);
    for (size_t index = 0; index < checkpoint_count; ++index) {
        const PlatformerCheckpoint& checkpoint = checkpoints[index];
        if (intersects(actor_bounds, checkpoint.area_pixels) && checkpoint.id != state.active_checkpoint_id) {
            state.active_checkpoint_id = checkpoint.id;
            state.respawn_position_pixels = checkpoint.respawn_position_pixels;
            state.checkpoint_changed = true;
            return true;
        }
    }
    return false;
}

bool update_platformer_hazards(PlatformerActor& actor, const PlatformerHazard* hazards, size_t hazard_count, PlatformerRuntimeState& state) {
    state.hazard_hit = false;
    state.hazard_index = 0;
    size_t hazard_index = 0;
    if (!platformer_actor_hits_hazard(actor, hazards, hazard_count, &hazard_index)) {
        return false;
    }

    const PlatformerHazard& hazard = hazards[hazard_index];
    state.hazard_hit = true;
    state.hazard_index = hazard_index;
    state.damage_taken = static_cast<uint16_t>(state.damage_taken + hazard.damage);
    if (hazard.respawn) {
        actor.bounds_pixels.x = state.respawn_position_pixels.x;
        actor.bounds_pixels.y = state.respawn_position_pixels.y;
        actor.velocity_x256 = Vec2i { 0, 0 };
        actor.movement_remainder_x256 = Vec2i { 0, 0 };
        actor.on_ground = false;
        actor.on_ladder = false;
        actor.hit_ceiling = false;
        actor.hit_wall = false;
        actor.coyote_timer = 0;
        actor.jump_buffer_timer = 0;
    }
    return true;
}

bool apply_platformer_camera_zones(
    Camera& camera,
    const PlatformerActor& actor,
    const PlatformerCameraZone* zones,
    size_t zone_count,
    int room_width_pixels,
    int room_height_pixels,
    PlatformerRuntimeState* state
) {
    return apply_platformer_camera_zones(
        camera,
        actor,
        zones,
        zone_count,
        room_width_pixels,
        room_height_pixels,
        state,
        default_platformer_config()
    );
}

bool apply_platformer_camera_zones(
    Camera& camera,
    const PlatformerActor& actor,
    const PlatformerCameraZone* zones,
    size_t zone_count,
    int room_width_pixels,
    int room_height_pixels,
    PlatformerRuntimeState* state,
    const PlatformerConfig& config
) {
    if (state != nullptr) {
        state->camera_zone_active = false;
        state->camera_zone_index = 0;
    }
    if (zones == nullptr) {
        update_platformer_camera(camera, actor, room_width_pixels, room_height_pixels, config);
        return false;
    }

    Rect actor_bounds = platformer_actor_rect(actor);
    for (size_t index = 0; index < zone_count; ++index) {
        const PlatformerCameraZone& zone = zones[index];
        if (!intersects(actor_bounds, zone.area_pixels)) {
            continue;
        }

        Camera zoned_camera = camera;
        zoned_camera.follow_player = true;
        update_platformer_camera(zoned_camera, actor, room_width_pixels, room_height_pixels, config);

        if (zone.lock_x) {
            zoned_camera.position_pixels.x = zone.bounds_pixels.x + zone.offset_pixels.x;
        } else {
            zoned_camera.position_pixels.x += zone.offset_pixels.x;
        }
        if (zone.lock_y) {
            zoned_camera.position_pixels.y = zone.bounds_pixels.y + zone.offset_pixels.y;
        } else {
            zoned_camera.position_pixels.y += zone.offset_pixels.y;
        }

        if (zone.bounds_pixels.width > 0 && zone.bounds_pixels.height > 0) {
            zoned_camera.bounds_enabled = true;
            zoned_camera.bounds_pixels = zone.bounds_pixels;
        }
        clamp_camera_to_bounds(zoned_camera, room_width_pixels, room_height_pixels);
        camera = zoned_camera;
        if (state != nullptr) {
            state->camera_zone_active = true;
            state->camera_zone_index = index;
        }
        return true;
    }

    update_platformer_camera(camera, actor, room_width_pixels, room_height_pixels, config);
    return false;
}

bool platformer_actor_hits_enemy(const PlatformerActor& actor, const PlatformerEnemy* enemies, size_t enemy_count, size_t* enemy_index) {
    if (enemies == nullptr) {
        return false;
    }

    Rect actor_bounds = platformer_actor_rect(actor);
    for (size_t index = 0; index < enemy_count; ++index) {
        if (!enemies[index].active) {
            continue;
        }
        if (intersects(actor_bounds, enemies[index].bounds_pixels)) {
            if (enemy_index != nullptr) {
                *enemy_index = index;
            }
            return true;
        }
    }
    return false;
}

PlatformerEnemyContactResult resolve_platformer_enemy_contact(
    PlatformerActor& actor,
    PlatformerEnemy* enemies,
    size_t enemy_count,
    size_t* enemy_index,
    int stomp_bounce_speed_x256,
    int stomp_tolerance_pixels
) {
    if (enemies == nullptr) {
        return PlatformerEnemyContactResult::None;
    }

    const Rect actor_bounds = platformer_actor_rect(actor);
    for (size_t index = 0; index < enemy_count; ++index) {
        PlatformerEnemy& enemy = enemies[index];
        if (!enemy.active || !intersects(actor_bounds, enemy.bounds_pixels)) {
            continue;
        }

        if (enemy_index != nullptr) {
            *enemy_index = index;
        }

        const int overlap_from_top = actor_bounds.bottom() - enemy.bounds_pixels.y;
        const bool falling_from_above = actor.velocity_x256.y > 0 &&
            actor_bounds.y < enemy.bounds_pixels.y &&
            overlap_from_top >= 0 &&
            overlap_from_top <= stomp_tolerance_pixels;
        if (!falling_from_above) {
            return PlatformerEnemyContactResult::HurtActor;
        }

        enemy.active = false;
        actor.bounds_pixels.y = enemy.bounds_pixels.y - actor.bounds_pixels.height;
        actor.velocity_x256.y = -abs_int(stomp_bounce_speed_x256);
        actor.movement_remainder_x256.y = 0;
        actor.on_ground = false;
        actor.on_ladder = false;
        actor.hit_ceiling = false;
        return PlatformerEnemyContactResult::StompEnemy;
    }

    return PlatformerEnemyContactResult::None;
}

bool update_platformer_enemy(PlatformerEnemy& enemy) {
    if (!enemy.active) {
        return false;
    }

    enemy.bounds_pixels.x += platformer_enemy_step_delta(enemy);
    clamp_platformer_enemy_to_patrol_bounds(enemy);

    return true;
}

bool update_platformer_enemy_patrol(PlatformerEnemy& enemy, const TileMap& map, bool turn_at_ledge) {
    if (!enemy.active) {
        return false;
    }

    const int delta_pixels = platformer_enemy_step_delta(enemy);
    if (delta_pixels == 0) {
        return true;
    }

    const int direction = delta_pixels > 0 ? 1 : -1;
    Rect next = enemy.bounds_pixels;
    next.x += delta_pixels;

    const bool blocked_ahead = rect_hits_platformer_horizontal(map, next, direction);
    const bool ledge_ahead = turn_at_ledge && !platformer_enemy_has_floor_ahead(map, next, direction);
    if (blocked_ahead || ledge_ahead) {
        enemy.facing_right = !enemy.facing_right;
        return true;
    }

    enemy.bounds_pixels = next;
    clamp_platformer_enemy_to_patrol_bounds(enemy);
    return true;
}

Vec2i update_platformer_moving_platform(PlatformerMovingPlatform& platform) {
    if (!platform.active) {
        return Vec2i { 0, 0 };
    }

    Vec2i delta {
        platform.velocity_x256.x / 256,
        platform.velocity_x256.y / 256
    };
    if (delta.x == 0 && platform.velocity_x256.x != 0) {
        delta.x = platform.velocity_x256.x > 0 ? 1 : -1;
    }
    if (delta.y == 0 && platform.velocity_x256.y != 0) {
        delta.y = platform.velocity_x256.y > 0 ? 1 : -1;
    }
    if (!platform.forward) {
        delta.x = -delta.x;
        delta.y = -delta.y;
    }

    platform.bounds_pixels.x += delta.x;
    platform.bounds_pixels.y += delta.y;

    const int min_x = platform.start_pixels.x < platform.end_pixels.x ? platform.start_pixels.x : platform.end_pixels.x;
    const int max_x = platform.start_pixels.x > platform.end_pixels.x ? platform.start_pixels.x : platform.end_pixels.x;
    const int min_y = platform.start_pixels.y < platform.end_pixels.y ? platform.start_pixels.y : platform.end_pixels.y;
    const int max_y = platform.start_pixels.y > platform.end_pixels.y ? platform.start_pixels.y : platform.end_pixels.y;

    if (platform.bounds_pixels.x > max_x || platform.bounds_pixels.y > max_y) {
        platform.bounds_pixels.x = max_x;
        platform.bounds_pixels.y = max_y;
        platform.forward = false;
    } else if (platform.bounds_pixels.x < min_x || platform.bounds_pixels.y < min_y) {
        platform.bounds_pixels.x = min_x;
        platform.bounds_pixels.y = min_y;
        platform.forward = true;
    }

    return delta;
}

bool platformer_actor_stands_on_platform(const PlatformerActor& actor, const PlatformerMovingPlatform& platform) {
    if (!platform.active) {
        return false;
    }
    const Rect& actor_bounds = actor.bounds_pixels;
    const Rect& platform_bounds = platform.bounds_pixels;
    const int actor_bottom = actor_bounds.bottom();
    return actor_bottom == platform_bounds.y &&
        actor_bounds.right() > platform_bounds.x &&
        actor_bounds.x < platform_bounds.right();
}

bool snap_platformer_actor_to_moving_platforms(
    PlatformerActor& actor,
    const PlatformerMovingPlatform* platforms,
    size_t platform_count,
    size_t* platform_index,
    int max_snap_pixels
) {
    if (platforms == nullptr || max_snap_pixels < 0) {
        return false;
    }

    const Rect actor_bounds = actor.bounds_pixels;
    for (size_t index = 0; index < platform_count; ++index) {
        const PlatformerMovingPlatform& platform = platforms[index];
        if (!platform.active) {
            continue;
        }

        const Rect& platform_bounds = platform.bounds_pixels;
        const bool horizontal_overlap = actor_bounds.right() > platform_bounds.x &&
            actor_bounds.x < platform_bounds.right();
        if (!horizontal_overlap || actor_bounds.y >= platform_bounds.y) {
            continue;
        }

        const int delta_y = platform_bounds.y - actor_bounds.bottom();
        if (delta_y < -max_snap_pixels || delta_y > max_snap_pixels) {
            continue;
        }
        if (actor.velocity_x256.y < 0 && delta_y < 0) {
            continue;
        }

        actor.bounds_pixels.y += delta_y;
        actor.velocity_x256.y = 0;
        actor.movement_remainder_x256.y = 0;
        actor.on_ground = true;
        actor.on_ladder = false;
        actor.hit_ceiling = false;
        if (platform_index != nullptr) {
            *platform_index = index;
        }
        return true;
    }

    return false;
}

bool snap_platformer_actor_to_npcs(PlatformerActor& actor, Rect previous_bounds,
    const PlatformerNpcRuntime* npcs, size_t npc_count, uint8_t platform_group) {
    if (npcs == nullptr || platform_group == 0 || actor.velocity_x256.y < 0) {
        return false;
    }
    for (size_t index = 0; index < npc_count; ++index) {
        const auto& npc = npcs[index];
        if (!npc.active || !npc.visible || npc.actor.collision_mask == 0 || npc.collision_group != platform_group) {
            continue;
        }
        const Rect top = platformer_npc_actor_rect(npc);
        if (actor.bounds_pixels.right() <= top.x || actor.bounds_pixels.x >= top.right() ||
            previous_bounds.bottom() > top.y || actor.bounds_pixels.bottom() < top.y) {
            continue;
        }
        actor.bounds_pixels.y = top.y - actor.bounds_pixels.height;
        actor.velocity_x256.y = 0;
        actor.movement_remainder_x256.y = 0;
        actor.on_ground = true;
        actor.on_ladder = false;
        actor.hit_ceiling = false;
        return true;
    }
    return false;
}

bool apply_platformer_moving_platform_delta(PlatformerActor& actor, const PlatformerMovingPlatform& platform, Vec2i delta_pixels) {
    if (!platformer_actor_stands_on_platform(actor, platform)) {
        return false;
    }
    actor.bounds_pixels.x += delta_pixels.x;
    actor.bounds_pixels.y += delta_pixels.y;
    return true;
}

} // namespace gbs
