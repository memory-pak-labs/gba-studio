#pragma once
#include "gbs/isometric.hpp"

namespace gbs {
// Experimental: callers must cancel before resetting or leaving a scene.
struct IsoTemporalMotion {
    EventRunner* owner = nullptr;
    uint32_t token = 0;
    int target_x = 0;
    int target_y = 0;
    int remainder = 0;
};
struct IsoTemporalMotionPool { IsoTemporalMotion moves[max_isometric_save_actors]{}; };
inline bool iso_temporal_motion_is_live(const IsoTemporalMotion& move) {
    return move.owner && move.owner->active && move.owner->actor_motion_pending &&
        move.owner->actor_motion_token == move.token;
}
inline void finish_iso_temporal_motion(IsoTemporalMotion& move) {
    if (iso_temporal_motion_is_live(move)) complete_event_actor_movement(*move.owner, move.token);
    move = IsoTemporalMotion{};
}
inline void clear_iso_temporal_motions(IsoTemporalMotionPool& pool) {
    for (auto& move : pool.moves) if (move.owner) finish_iso_temporal_motion(move);
}
inline bool begin_iso_temporal_motion(IsoTemporalMotionPool& pool, const EventActorCommand& request, size_t actor_count) {
    if (request.op != EventActorOp::MoveTo || !request.motion_owner || !request.motion_owner->active ||
        !request.motion_owner->actor_motion_pending || request.motion_owner->actor_motion_token != request.motion_token)
        return false;
    if (request.actor_index < 0 || static_cast<size_t>(request.actor_index) >= actor_count ||
        static_cast<size_t>(request.actor_index) >= max_isometric_save_actors) {
        complete_event_actor_movement(*request.motion_owner, request.motion_token); return false;
    }
    auto& move = pool.moves[request.actor_index];
    if (move.owner) finish_iso_temporal_motion(move);
    move = { request.motion_owner, request.motion_token, request.a, request.b, 0 };
    return true;
}
inline void tick_iso_temporal_motion(IsoTemporalMotionPool& pool, size_t index, const IsoTileMap& map,
    IsoActor* actors, IsoActorAnimationState* animation, size_t count, int speed_x100) {
    if (index >= max_isometric_save_actors || index >= count || !actors || !animation) return;
    auto& move = pool.moves[index];
    if (!move.owner) return;
    if (!iso_temporal_motion_is_live(move)) { move = IsoTemporalMotion{}; return; }
    auto& actor = actors[index];
    if (!actor.visible || speed_x100 <= 0) { finish_iso_temporal_motion(move); return; }
    initialize_iso_actor_position(actor);
    const int32_t tx = static_cast<int32_t>(move.target_x) * iso_position_scale;
    const int32_t ty = static_cast<int32_t>(move.target_y) * iso_position_scale;
    if (actor.position_x256 == tx && actor.position_y256 == ty) { finish_iso_temporal_motion(move); return; }
    const int64_t accumulated = static_cast<int64_t>(move.remainder) + static_cast<int64_t>(speed_x100) * iso_free_movement_step_x256;
    int64_t remaining = accumulated / 100;
    move.remainder = static_cast<int>(accumulated % 100);
    Vec2i direction{};
    while (remaining > 0) {
        const int32_t diff_x = tx - actor.position_x256;
        const int32_t diff_y = ty - actor.position_y256;
        direction = diff_x ? Vec2i { diff_x > 0 ? 1 : -1, 0 } : Vec2i { 0, diff_y > 0 ? 1 : -1 };
        int32_t distance = diff_x ? (diff_x > 0 ? diff_x : -diff_x) : (diff_y > 0 ? diff_y : -diff_y);
        int32_t step = remaining > iso_position_scale ? iso_position_scale : static_cast<int32_t>(remaining);
        if (step > distance) step = distance;
        if (!move_iso_actor_by_free_delta(map, actor, direction, actors, count, index, step)) {
            set_iso_actor_motion(animation[index], direction, false); finish_iso_temporal_motion(move); return;
        }
        remaining -= step;
        if (actor.position_x256 == tx && actor.position_y256 == ty) {
            set_iso_actor_motion(animation[index], direction, false); finish_iso_temporal_motion(move); return;
        }
    }
    set_iso_actor_motion(animation[index], direction, true);
}
}
