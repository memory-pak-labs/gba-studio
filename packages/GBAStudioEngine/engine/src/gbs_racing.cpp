#include "gbs/racing.hpp"

namespace gbs {
namespace {

int positive_per_frame(int per_second) {
    const int value = per_second / 60;
    return value > 0 ? value : 1;
}

int clamp_speed(int value, int maximum) {
    if (value < 0) return 0;
    return value > maximum ? maximum : value;
}

int abs_int(int value) {
    return value < 0 ? -value : value;
}

void update_checkpoint_at(RacingRuntimeState& state, const RacingRoomData& room, Vec2i position_pixels) {
    if (!racing_uses_circuit_track(room)) return;
    const RacingTopdownTrackData& track = *room.topdown_track;
    const size_t checkpoint_index = (state.checkpoint_count + (track.finish_at_zero && track.checkpoint_count>1 ? 1 : 0)) % track.checkpoint_count;
    const RacingTopdownCheckpoint& checkpoint = track.checkpoints[checkpoint_index];
    if(state.last_checkpoint>=0 && racing_topdown_checkpoint_contains(track.checkpoints[state.last_checkpoint],position_pixels)) return;
    state.last_checkpoint=-1;
    if (!racing_topdown_checkpoint_contains(checkpoint, position_pixels)) return;
    state.last_checkpoint=static_cast<int8_t>(checkpoint_index);
    ++state.checkpoint_count;
    if (state.checkpoint_count % track.checkpoint_count == 0) {
        ++state.lap_count;
    }
}

void update_race_progress(RacingRuntimeState& state, const RacingRoomData& room, Vec2i previous_position) {
    if (racing_result(state) != RacingRaceResult::InProgress) {
        return;
    }
    const RacingPseudo3DConfig& config = room.config.pseudo3d;
    const int track_length = racing_track_length_x256(room);
    const int pickup_span = config.pickups_per_lap > 0
        ? track_length / config.pickups_per_lap
        : track_length;
    if (racing_uses_circuit_track(room)) {
        // A thin gate is still crossed at maximum speed. Check the movement
        // segment at pixel intervals instead of just its final position.
        const int dx=state.position_x256/256-previous_position.x;
        const int dy=state.position_y256/256-previous_position.y;
        const int distance=abs_int(dx)>abs_int(dy)?abs_int(dx):abs_int(dy);
        const int steps=distance>0?distance:1;
        for(int step=1;step<=steps;++step) update_checkpoint_at(state,room,
            {previous_position.x+dx*step/steps,previous_position.y+dy*step/steps});
    } else {
        const int checkpoint_span = track_length / config.checkpoints_per_lap;
        const unsigned int expected_checkpoints = static_cast<unsigned int>(
            state.distance_x256 / (checkpoint_span > 0 ? checkpoint_span : 1)
        );
        if (expected_checkpoints > state.checkpoint_count) {
            state.checkpoint_count = expected_checkpoints;
        }
    }

    if (config.pickups_per_lap > 0 &&
        abs_int((state.position_x256 / 256) - room.player_start_pixels.x) <= 24) {
        const unsigned int expected_pickups = static_cast<unsigned int>(
            state.distance_x256 / (pickup_span > 0 ? pickup_span : 1)
        );
        if (expected_pickups > state.pickup_count) {
            const unsigned int collected = expected_pickups - state.pickup_count;
            state.pickup_count = expected_pickups;
            const unsigned int available = 3u - state.boost_charges;
            state.boost_charges = static_cast<uint8_t>(
                state.boost_charges + (collected < available ? collected : available)
            );
        }
    }

    state.rival_distance_x256 += positive_per_frame(config.rival_speed_x256_per_second);
    const unsigned int checkpoints_per_lap = racing_uses_circuit_track(room)
        ? static_cast<unsigned int>(room.topdown_track->checkpoint_count)
        : config.checkpoints_per_lap;
    const unsigned int winning_checkpoints = static_cast<unsigned int>(
        config.laps_to_win * checkpoints_per_lap
    );
    if (state.lap_count >= config.laps_to_win && state.checkpoint_count >= winning_checkpoints) {
        state.race_result = static_cast<uint8_t>(RacingRaceResult::Victory);
        return;
    }
    if (track_length > 0 &&
        state.rival_distance_x256 / track_length >= config.laps_to_win) {
        state.race_result = static_cast<uint8_t>(RacingRaceResult::Defeat);
    }
}

} // namespace

bool tick_racing_vehicle(RacingRuntimeState& state, const RacingRoomData& room, RacingInput input) {
    const Vec2i previous_position{state.position_x256/256,state.position_y256/256};
    if(state.collision_frames>0) --state.collision_frames;
    if (racing_result(state) != RacingRaceResult::InProgress) {
        return true;
    }
    if (input.use_item && state.boost_charges > 0 && state.boost_frames == 0) {
        --state.boost_charges;
        state.boost_frames = 45;
    }
    const int maximum_speed = racing_boost_max_speed_x256(room, state);
    if (input.accelerate && !input.brake) {
        state.speed_x256 = clamp_speed(
            state.speed_x256 + positive_per_frame(room.config.acceleration_x256_per_second),
            maximum_speed
        );
    } else if (input.brake) {
        state.speed_x256 = clamp_speed(
            state.speed_x256 - positive_per_frame(room.config.brake_power_x256_per_second),
            maximum_speed
        );
    } else if (state.speed_x256 > 0) {
        state.speed_x256 = clamp_speed(
            state.speed_x256 - positive_per_frame(room.config.acceleration_x256_per_second) / 2,
            maximum_speed
        );
    }

    const int steering = input.steering < 0 ? -1 : input.steering > 0 ? 1 : 0;
    int target_x256 = state.position_x256;
    int target_y256 = state.position_y256;
    if (racing_uses_pseudo3d(room) && racing_uses_circuit_track(room)) {
        if(steering!=0 && state.speed_x256>0) {
            const int turn=room.config.steering_speed_x256/16;
            state.heading_x256=static_cast<uint16_t>((state.heading_x256+4096+steering*(turn>0?turn:1))&4095);
            state.heading=static_cast<uint8_t>(((state.heading_x256+128)>>8)&15);
        }
        target_x256+=state.speed_x256*racing_camera_sine(state.heading_x256)/256;
        target_y256-=state.speed_x256*racing_camera_sine(static_cast<uint16_t>(state.heading_x256+1024))/256;
    } else if (racing_uses_topdown_track(room)) {
        state.heading &= 15;
        if (steering != 0 && state.speed_x256 > 0) {
            const int authored_turn_frames = 1 + 1024 / room.config.steering_speed_x256;
            const int turn_frames = authored_turn_frames < 1 ? 1 : authored_turn_frames > 8 ? 8 : authored_turn_frames;
            if (++state.steering_frames >= turn_frames) {
                state.heading = static_cast<uint8_t>((state.heading + 16 + steering) & 15);
                state.steering_frames = 0;
            }
        } else {
            state.steering_frames = 0;
        }
        target_x256 += (state.speed_x256 * racing_heading_sine_x256[state.heading]) / 256;
        target_y256 -= (state.speed_x256 * racing_heading_sine_x256[(state.heading + 4) & 15]) / 256;
    } else {
        target_x256 += steering * room.config.steering_speed_x256;
        target_y256 -= state.speed_x256;
    }
    bool completed_lap = false;
    if (!racing_uses_circuit_track(room) && target_y256 < 0) {
        target_y256 = (room.height_tiles * 8 - 4) * 256;
        completed_lap = !racing_uses_circuit_track(room);
    }

    const Vec2i target_pixels { target_x256 / 256, target_y256 / 256 };
    bool blocked=racing_position_blocked(room,target_pixels);
    if(racing_uses_pseudo3d(room) && racing_uses_circuit_track(room)) {
        // Sweep a conservative chassis footprint at <=4px intervals. A fast
        // car cannot skip a solid8px tile or leave the finite circuit map.
        const int dx=target_x256-state.position_x256,dy=target_y256-state.position_y256;
        const int travel=abs_int(dx)>abs_int(dy)?abs_int(dx):abs_int(dy);
        const int steps=1+travel/1024;
        for(int step=1;step<=steps&&!blocked;++step) {
            const Vec2i point {(state.position_x256+dx*step/steps)/256,(state.position_y256+dy*step/steps)/256};
            for(int oy=-8;oy<=8;oy+=8) for(int ox=-8;ox<=8;ox+=8) {
                if(racing_position_blocked(room,{point.x+ox,point.y+oy})) blocked=true;
            }
        }
    }
    if (blocked) {
        state.speed_x256 = 0;
        state.collision_frames=12;
        update_race_progress(state,room,previous_position);
        return false;
    }

    state.position_x256 = target_x256;
    state.position_y256 = target_y256;
    state.speed_x256 = clamp_speed(
        state.speed_x256,
        racing_surface_speed_limit_x256(room, target_pixels)
    );
    state.distance_x256 += state.speed_x256;
    if (completed_lap) ++state.lap_count;
    if (state.boost_frames > 0) {
        --state.boost_frames;
        if (state.boost_frames == 0) {
            state.speed_x256 = clamp_speed(state.speed_x256, room.config.max_speed_x256);
        }
    }
    update_race_progress(state, room,previous_position);
    return true;
}

} // namespace gbs
