#pragma once
#include "gbs/event.hpp"
#include "gbs/topdown.hpp"
#include <limits.h>

namespace gbs {
constexpr size_t max_scripted_movements = max_event_segments + 1;
enum class ScriptedMovementResult { Idle, Moving, Reached, Stopped };
using ScriptedMoveStep = bool (*)(const TileMap&, Actor&, Vec2i, const Actor*, size_t);
struct ScriptedMovement {
    EventRunner* owner = nullptr;
    uint32_t token = 0;
    int actor_index = -2;
    Vec2i target{};
    int remainder = 0;
};
struct ScriptedMovementPool { ScriptedMovement moves[max_scripted_movements]{}; };
inline bool scripted_movement_is_live(const ScriptedMovement& move) {
    return move.owner != nullptr && move.owner->active && move.owner->actor_motion_pending &&
        move.owner->actor_motion_token == move.token;
}
inline void finish_scripted_movement(ScriptedMovement& move) {
    if (scripted_movement_is_live(move)) complete_event_actor_movement(*move.owner, move.token);
    move = ScriptedMovement{};
}
inline bool has_scripted_movement(const ScriptedMovementPool& pool, int actor_index) {
    for (const auto& move : pool.moves)
        if (move.actor_index == actor_index && scripted_movement_is_live(move)) return true;
    return false;
}
inline void clear_scripted_movements(ScriptedMovementPool& pool) {
    for (auto& move : pool.moves) if (move.owner) finish_scripted_movement(move);
}
inline void cancel_scripted_movement(ScriptedMovementPool& pool, int actor_index) {
    for (auto& move : pool.moves) if (move.owner && move.actor_index == actor_index)
        finish_scripted_movement(move);
}
inline bool resolve_scripted_movement_destination(const EventActorCommand& request, Vec2i origin, EventActorCommand& out) {
    out = request;
    if (request.c == 0) return true;
    const int64_t x = static_cast<int64_t>(origin.x) + request.a;
    const int64_t y = static_cast<int64_t>(origin.y) + request.b;
    if (x < INT_MIN || x > INT_MAX || y < INT_MIN || y > INT_MAX) return false;
    out.a = static_cast<int>(x); out.b = static_cast<int>(y); out.c = 0;
    return true;
}
inline bool start_scripted_movement(ScriptedMovementPool& pool, const EventActorCommand& request) {
    if (request.op != EventActorOp::MoveTo || request.motion_owner == nullptr ||
        !request.motion_owner->active || !request.motion_owner->actor_motion_pending ||
        request.motion_owner->actor_motion_token != request.motion_token) return false;
    cancel_scripted_movement(pool, request.actor_index);
    for (auto& move : pool.moves) {
        if (move.owner != nullptr && !scripted_movement_is_live(move)) move = ScriptedMovement{};
        if (move.owner == nullptr) {
            move.owner = request.motion_owner; move.token = request.motion_token;
            move.actor_index = request.actor_index; move.target = {request.a, request.b};
            return true;
        }
    }
    complete_event_actor_movement(*request.motion_owner, request.motion_token);
    return false;
}
inline ScriptedMovementResult tick_scripted_movement(ScriptedMovementPool& pool, int actor_index,
    Actor& actor, const TileMap& map, int speed_x100, const Actor* blockers, size_t blocker_count,
    ScriptedMoveStep step = move_actor_by_delta_with_actor_collisions) {
    ScriptedMovement* motion = nullptr;
    for (auto& item : pool.moves) if (item.owner && item.actor_index == actor_index) { motion = &item; break; }
    if (motion == nullptr) return ScriptedMovementResult::Idle;
    if (!scripted_movement_is_live(*motion)) { *motion = ScriptedMovement{}; return ScriptedMovementResult::Idle; }
    if (actor.position_pixels.x == motion->target.x && actor.position_pixels.y == motion->target.y) {
        finish_scripted_movement(*motion); return ScriptedMovementResult::Reached;
    }
    if (speed_x100 <= 0) { finish_scripted_movement(*motion); return ScriptedMovementResult::Stopped; }
    int steps = speed_x100 / 100;
    motion->remainder += speed_x100 % 100;
    if (motion->remainder >= 100) { ++steps; motion->remainder -= 100; }
    while (steps-- > 0) {
        Vec2i delta{};
        if (actor.position_pixels.x != motion->target.x) {
            delta.x = actor.position_pixels.x < motion->target.x ? 1 : -1;
            actor.direction = delta.x > 0 ? 3 : 2;
        } else {
            delta.y = actor.position_pixels.y < motion->target.y ? 1 : -1;
            actor.direction = delta.y > 0 ? 0 : 1;
        }
        if (!step(map, actor, delta, blockers, blocker_count)) {
            finish_scripted_movement(*motion); return ScriptedMovementResult::Stopped;
        }
        if (actor.position_pixels.x == motion->target.x && actor.position_pixels.y == motion->target.y) {
            finish_scripted_movement(*motion); return ScriptedMovementResult::Reached;
        }
    }
    return ScriptedMovementResult::Moving;
}
}
