#pragma once

#include <stddef.h>
#include <stdint.h>

#include "gbs/assets.hpp"
#include "gbs/animation.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/racing_camera.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/save.hpp"
#include "gbs/trigger.hpp"
#include "gbs/types.hpp"

namespace gbs {

enum class RacingPresentation : uint8_t {
    Topdown = 0,
    Pseudo3D = 1
};

struct RacingPseudo3DConfig {
    RacingPresentation presentation = RacingPresentation::Topdown;
    uint8_t laps_to_win = 1;
    uint8_t checkpoints_per_lap = 1;
    uint8_t pickups_per_lap = 0;
    int rival_speed_x256_per_second = 0;
    int road_curve = 0;
    bool show_minimap = false;
};

struct RacingConfig {
    int max_speed_x256;
    int acceleration_x256_per_second;
    int brake_power_x256_per_second;
    int steering_speed_x256;
    RacingPseudo3DConfig pseudo3d {};
};

struct RacingBackgroundData {
    BackgroundLayer layer;
    TileMapAsset tilemap;
    uint16_t backdrop_color = 0;
};

struct RacingPseudo3DVisualData {
    uint8_t horizon_y = 48;
    const TileAsset* panorama_tiles = nullptr;
    const TileMapAsset* panorama_tilemap = nullptr;
    const PaletteAsset* panorama_palette = nullptr;
    const AffineTileAsset* floor_tiles = nullptr;
    const AffineTileMapAsset* floor_tilemap = nullptr;
    const PaletteAsset* floor_palette = nullptr;
    const TileAsset* minimap_tiles = nullptr;
    const TileMapAsset* minimap_tilemap = nullptr;
    const PaletteAsset* minimap_palette = nullptr;
};

struct RacingActorData {
    const char* name;
    Vec2i position_pixels;
    const MetaSprite* metasprite;
    EventScript on_interact = empty_event_script();
};

struct RacingTrackSegment {
    uint16_t length_pixels;
    int16_t curve;
    uint16_t half_width;
};

struct RacingTopdownCheckpoint {
    const char* id;
    Vec2i center_pixels;
    uint16_t width_pixels;
    uint16_t height_pixels;
};

struct RacingTopdownTrackData {
    int camera_dead_zone_x = 0;
    int camera_dead_zone_y = 0;
    const RacingTopdownCheckpoint* checkpoints = nullptr;
    size_t checkpoint_count = 0;
    // Sixteen compass steps, clockwise from north. Four points east.
    uint8_t start_heading = 0;
    const Vec2i* path_points = nullptr;
    size_t path_point_count = 0;
    bool finish_at_zero = false;
};

struct RacingPlayerVisual;

struct RacingRoomData {
    const char* name;
    const uint8_t* collision_flags;
    int width_tiles;
    int height_tiles;
    RacingConfig config;
    Vec2i player_start_pixels;
    int background_index = -1;
    EventScript on_enter = empty_event_script();
    const RuntimeTriggerData* triggers = nullptr;
    size_t trigger_count = 0;
    const RacingActorData* actors = nullptr;
    size_t actor_count = 0;
    const char* resource_bank_group_name = nullptr;
    EventScript on_victory = empty_event_script();
    EventScript on_defeat = empty_event_script();
    const RacingPseudo3DVisualData* pseudo3d_visual = nullptr;
    const RacingTrackSegment* track_segments = nullptr;
    size_t track_segment_count = 0;
    const RacingTopdownTrackData* topdown_track = nullptr;
    VideoComposition video = default_video_composition();
    RacingCameraConfig perspective_camera {};
    const AffineTileMapAsset* circuit_floor = nullptr;
    int circuit_empty_tile = -1;
    const RacingPlayerVisual* player_visual = nullptr;
};

struct RacingVehicleDirectionAnimations {
    const SpriteAnimation* idle = nullptr;
    const SpriteAnimation* drive = nullptr;
    const SpriteAnimation* hurt = nullptr;
};

struct RacingVehicleAnimationSet {
    const SpriteAnimation* idle = nullptr;
    const SpriteAnimation* drive = nullptr;
    const SpriteAnimation* steer_left = nullptr;
    const SpriteAnimation* steer_right = nullptr;
    const SpriteAnimation* brake = nullptr;
    const SpriteAnimation* hurt = nullptr;
    const SpriteAnimation* brake_left = nullptr;
    const SpriteAnimation* brake_right = nullptr;
    RacingVehicleDirectionAnimations directions[4] {};
};

struct RacingPlayerVisual {
    const MetaSprite* idle = nullptr;
    const MetaSprite* drive = nullptr;
    RacingVehicleAnimationSet animations {};
};

struct RacingProjectData {
    const RacingRoomData* rooms;
    size_t room_count;
    int initial_room;
    const PaletteAsset* bg_palettes = nullptr;
    size_t bg_palette_count = 0;
    const PaletteAsset* obj_palettes = nullptr;
    size_t obj_palette_count = 0;
    const TileAsset* tile_assets = nullptr;
    size_t tile_asset_count = 0;
    const RacingBackgroundData* backgrounds = nullptr;
    size_t background_count = 0;
    const MetaSprite* player_idle_metasprite = nullptr;
    const MetaSprite* player_drive_metasprite = nullptr;
    const DialogueLine* dialogue_lines = nullptr;
    size_t dialogue_line_count = 0;
    const SfxAsset* sfx_assets = nullptr;
    size_t sfx_asset_count = 0;
    const MusicAsset* music_assets = nullptr;
    size_t music_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
    RacingVehicleAnimationSet player_animations {};
    const ResourceBankUploadSource* resource_bank_upload_sources = nullptr;
    size_t resource_bank_upload_source_count = 0;
};

struct RacingInput {
    bool accelerate;
    bool brake;
    int steering;
    bool use_item = false;
};

constexpr RacingInput racing_runtime_input(RacingInput player_input, bool script_active) {
    return script_active ? RacingInput { false, false, 0, false } : player_input;
}

struct RacingRuntimeState {
    int position_x256;
    int position_y256;
    int speed_x256;
    int distance_x256;
    unsigned int lap_count;
    int rival_distance_x256;
    unsigned int checkpoint_count;
    unsigned int pickup_count;
    uint8_t race_result;
    uint8_t boost_charges;
    uint16_t boost_frames;
    uint8_t heading = 0;
    uint8_t steering_frames = 0;
    uint16_t heading_x256 = 0;
    uint8_t collision_frames = 0;
    int8_t last_checkpoint = -1;
};

enum class RacingRaceResult : uint8_t {
    InProgress = 0,
    Victory = 1,
    Defeat = 2
};

struct RacingPerspectiveLine {
    int center_x;
    int half_width;
    int scroll_x;
};

constexpr int racing_affine_horizon_y = 48;
constexpr size_t racing_affine_raster_line_count = 161;

struct RacingAffineRasterLine {
    int16_t pa;
    int16_t pc;
    int32_t reference_x_8;
    int32_t reference_y_8;
    bool floor_visible;
};

struct RacingAffineRasterFrame {
    int horizon_y;
    RacingAffineRasterLine lines[racing_affine_raster_line_count];
};

struct RacingSavePayload {
    RacingRuntimeState runtime_state;
};

constexpr bool is_valid_racing_config(const RacingConfig& config) {
    const bool pseudo3d_valid = config.pseudo3d.presentation == RacingPresentation::Topdown ||
        (config.pseudo3d.presentation == RacingPresentation::Pseudo3D &&
            config.pseudo3d.laps_to_win > 0 &&
            config.pseudo3d.checkpoints_per_lap > 0 &&
            config.pseudo3d.checkpoints_per_lap <= 16 &&
            config.pseudo3d.pickups_per_lap <= 16 &&
            config.pseudo3d.rival_speed_x256_per_second > 0 &&
            config.pseudo3d.road_curve >= 0 &&
            config.pseudo3d.road_curve <= 64);
    return pseudo3d_valid && config.max_speed_x256 > 0 &&
        config.acceleration_x256_per_second > 0 &&
        config.brake_power_x256_per_second > 0 &&
        config.steering_speed_x256 > 0;
}

constexpr bool racing_uses_pseudo3d(const RacingRoomData& room) {
    return room.config.pseudo3d.presentation == RacingPresentation::Pseudo3D;
}

constexpr bool racing_uses_circuit_track(const RacingRoomData& room) {
    return room.topdown_track != nullptr && room.topdown_track->checkpoint_count > 0;
}

constexpr bool is_valid_racing_pseudo3d_visual_data(const RacingPseudo3DVisualData& visual) {
    return visual.horizon_y > 0 && visual.horizon_y < 160 &&
        ((visual.panorama_tiles == nullptr && visual.panorama_tilemap == nullptr && visual.panorama_palette == nullptr) ||
         (visual.panorama_tiles != nullptr && is_valid_tile_asset(*visual.panorama_tiles) &&
          visual.panorama_tilemap != nullptr && is_valid_tilemap_asset(*visual.panorama_tilemap) &&
          visual.panorama_palette != nullptr && is_valid_palette_asset(*visual.panorama_palette))) &&
        visual.floor_tiles != nullptr && is_valid_affine_tile_asset(*visual.floor_tiles) &&
        visual.floor_tilemap != nullptr && is_valid_affine_tilemap_asset(*visual.floor_tilemap) &&
        visual.floor_palette != nullptr && is_valid_palette_asset(*visual.floor_palette) &&
        ((visual.minimap_tiles == nullptr && visual.minimap_tilemap == nullptr && visual.minimap_palette == nullptr) ||
         (visual.minimap_tiles != nullptr && is_valid_tile_asset(*visual.minimap_tiles) &&
          visual.minimap_tilemap != nullptr && is_valid_tilemap_asset(*visual.minimap_tilemap) &&
          visual.minimap_palette != nullptr && is_valid_palette_asset(*visual.minimap_palette)));
}

constexpr const RacingPseudo3DVisualData* racing_pseudo3d_visual_for_room(const RacingRoomData& room) {
    return racing_uses_pseudo3d(room) && room.pseudo3d_visual != nullptr &&
        is_valid_racing_pseudo3d_visual_data(*room.pseudo3d_visual)
        ? room.pseudo3d_visual
        : nullptr;
}

constexpr int racing_positive_mod(int value, int modulus) {
    if (modulus <= 0) return 0;
    const int remainder = value % modulus;
    return remainder < 0 ? remainder + modulus : remainder;
}

constexpr int racing_topdown_segment_length_pixels(Vec2i from, Vec2i to) {
    const int dx = from.x > to.x ? from.x - to.x : to.x - from.x;
    const int dy = from.y > to.y ? from.y - to.y : to.y - from.y;
    const int major = dx > dy ? dx : dy;
    const int minor = dx > dy ? dy : dx;
    return major + minor / 2;
}

constexpr int racing_topdown_path_length_pixels(const RacingTopdownTrackData& track) {
    if (track.path_points == nullptr || track.path_point_count < 2) return 0;
    int length = 0;
    for (size_t index = 0; index < track.path_point_count; ++index) {
        length += racing_topdown_segment_length_pixels(
            track.path_points[index], track.path_points[(index + 1) % track.path_point_count]
        );
    }
    return length;
}

constexpr int racing_track_length_x256(const RacingRoomData& room) {
    if (room.topdown_track != nullptr) {
        const int path_length = racing_topdown_path_length_pixels(*room.topdown_track);
        if (path_length > 0) return path_length * 256;
    }
    if (room.track_segments == nullptr || room.track_segment_count == 0) {
        return room.height_tiles * 8 * 256;
    }
    int length_pixels = 0;
    for (size_t index = 0; index < room.track_segment_count; ++index) {
        length_pixels += room.track_segments[index].length_pixels;
    }
    return length_pixels * 256;
}

constexpr const RacingTrackSegment* racing_track_segment_for_distance(
    const RacingRoomData& room,
    int distance_x256
) {
    if (room.track_segments == nullptr || room.track_segment_count == 0) return nullptr;
    const int track_length = racing_track_length_x256(room);
    if (track_length <= 0) return nullptr;
    int remaining = racing_positive_mod(distance_x256, track_length) / 256;
    for (size_t index = 0; index < room.track_segment_count; ++index) {
        const RacingTrackSegment& segment = room.track_segments[index];
        if (remaining < segment.length_pixels) return &segment;
        remaining -= segment.length_pixels;
    }
    return &room.track_segments[room.track_segment_count - 1];
}

constexpr int racing_track_curve(const RacingRoomData& room, int distance_x256) {
    const RacingTrackSegment* segment = racing_track_segment_for_distance(room, distance_x256);
    return segment != nullptr ? segment->curve : room.config.pseudo3d.road_curve;
}

constexpr int racing_track_half_width(const RacingRoomData& room, int distance_x256) {
    const RacingTrackSegment* segment = racing_track_segment_for_distance(room, distance_x256);
    return segment != nullptr ? static_cast<int>(segment->half_width) : 64;
}

constexpr int racing_clamp_int(int value, int minimum, int maximum) {
    return value < minimum ? minimum : value > maximum ? maximum : value;
}

constexpr int racing_curve_offset(const RacingRoomData& room, int distance_x256, int screen_y) {
    const int authored_curve = racing_track_curve(room, distance_x256);
    if (room.track_segments != nullptr && room.track_segment_count > 0) {
        const int depth_phase = racing_positive_mod(screen_y - racing_affine_horizon_y, 48);
        return authored_curve + ((depth_phase * authored_curve) / 96);
    }
    const int phase = racing_positive_mod((distance_x256 / 256) + screen_y * 2, 64);
    const int triangle = phase < 32 ? phase : 63 - phase;
    return ((triangle * 2) - 31) * room.config.pseudo3d.road_curve / 32;
}

constexpr int racing_abs_int(int value) {
    return value < 0 ? -value : value;
}

constexpr int racing_affine_curve_offset_for_scanline(
    const RacingRoomData& room,
    int distance_x256,
    int scanline,
    int authored_curve
) {
    if (room.track_segments != nullptr && room.track_segment_count > 0) {
        const int depth_phase = racing_positive_mod(scanline - racing_affine_horizon_y, 48);
        return authored_curve + ((depth_phase * authored_curve) / 96);
    }
    const int phase = racing_positive_mod((distance_x256 / 256) + scanline * 2, 64);
    const int triangle = phase < 32 ? phase : 63 - phase;
    return ((triangle * 2) - 31) * room.config.pseudo3d.road_curve / 32;
}

constexpr RacingAffineRasterLine racing_affine_raster_line_with_curve(
    const RacingRuntimeState& state,
    const RacingRoomData& room,
    int scanline,
    int horizon_y,
    int curve
) {
    const int clamped_horizon_y = racing_clamp_int(horizon_y, 1, 159);
    if (scanline <= clamped_horizon_y || scanline >= 160 || !racing_uses_pseudo3d(room)) {
        return RacingAffineRasterLine { 0, 0, 0, 0, false };
    }

    const int depth = scanline - clamped_horizon_y;
    const int scale_8 = racing_clamp_int(2048 / (depth + 8), 8, 255);
    const int yaw_8 = racing_clamp_int(curve * 4, -96, 96);
    const int forward_8 = 256 - racing_abs_int(yaw_8) / 3;
    const int pa = (scale_8 * forward_8) / 256;
    const int pc = (scale_8 * yaw_8) / 256;

    return RacingAffineRasterLine {
        static_cast<int16_t>(pa),
        static_cast<int16_t>(pc),
        state.position_x256 - pa * 120 + pc * 96,
        state.distance_x256 - pc * 120 - pa * 256,
        true
    };
}

constexpr RacingAffineRasterLine racing_affine_raster_line(
    const RacingRuntimeState& state,
    const RacingRoomData& room,
    int scanline,
    int horizon_y
) {
    const int curve = racing_curve_offset(room, state.distance_x256, scanline);
    return racing_affine_raster_line_with_curve(state, room, scanline, horizon_y, curve);
}

constexpr RacingAffineRasterLine racing_affine_raster_line(
    const RacingRuntimeState& state,
    const RacingRoomData& room,
    int scanline
) {
    return racing_affine_raster_line(state, room, scanline, racing_affine_horizon_y);
}

constexpr RacingAffineRasterFrame make_racing_affine_raster_frame(
    const RacingRuntimeState& state,
    const RacingRoomData& room,
    int horizon_y
) {
    RacingAffineRasterFrame frame { racing_clamp_int(horizon_y, 1, 159), {} };
    if(racing_uses_pseudo3d(room) && racing_uses_circuit_track(room)) {
        const auto camera=racing_camera_pose({state.position_x256,state.position_y256},state.heading_x256,room.perspective_camera);
        for(int y=0;y<160;++y) {
            const auto line=racing_camera_floor_line(camera,room.perspective_camera,frame.horizon_y,y);
            frame.lines[y]={line.pa,line.pc,line.reference_x_8,line.reference_y_8,line.visible};
        }
        frame.lines[160]=frame.lines[0];
        return frame;
    }
    const int authored_curve = racing_track_curve(room, state.distance_x256);
    for (int scanline = 0; scanline < 160; ++scanline) {
        const int curve = racing_affine_curve_offset_for_scanline(
            room,
            state.distance_x256,
            scanline,
            authored_curve
        );
        frame.lines[scanline] = racing_affine_raster_line_with_curve(
            state,
            room,
            scanline,
            frame.horizon_y,
            curve
        );
    }
    frame.lines[160] = frame.lines[0];
    return frame;
}

constexpr RacingAffineRasterFrame make_racing_affine_raster_frame(
    const RacingRuntimeState& state,
    const RacingRoomData& room
) {
    return make_racing_affine_raster_frame(state, room, racing_affine_horizon_y);
}

constexpr RacingPerspectiveLine racing_perspective_line(
    const RacingRuntimeState& state,
    const RacingRoomData& room,
    int screen_y
) {
    const int clamped_y = racing_clamp_int(screen_y, 0, 159);
    const int horizon_y = 36;
    const int depth = clamped_y > horizon_y ? clamped_y - horizon_y : 0;
    const int track_center_x = room.player_start_pixels.x;
    const int lateral_offset = (state.position_x256 / 256) - track_center_x;
    const int curve = racing_curve_offset(room, state.distance_x256, clamped_y);
    const int center_x = racing_clamp_int(
        120 + curve - (lateral_offset * (depth + 12)) / 132,
        0,
        239
    );
    const int width_scale = racing_track_half_width(room, state.distance_x256);
    const int half_width = racing_clamp_int(
        5 + (depth * (width_scale + 56)) / 123,
        5,
        116
    );
    return RacingPerspectiveLine {
        center_x,
        half_width,
        curve - (lateral_offset * depth) / 160
    };
}

constexpr Vec2i racing_minimap_position(
    int distance_x256,
    const RacingRoomData& room,
    Vec2i origin,
    Vec2i size
) {
    const int width = size.x > 0 ? size.x : 1;
    const int height = size.y > 0 ? size.y : 1;
    const int track_length = racing_track_length_x256(room);
    const int progress = racing_positive_mod(distance_x256, track_length);
    const int y_offset = track_length > 0
        ? ((height - 1) * progress) / track_length
        : 0;
    const int curve = racing_track_curve(room, distance_x256);
    const int curve_offset = room.track_segments != nullptr && room.track_segment_count > 0
        ? (curve * (width - 1)) / 128
        : 0;
    return Vec2i {
        racing_clamp_int(origin.x + width / 2 + curve_offset, origin.x, origin.x + width - 1),
        origin.y + height - 1 - y_offset
    };
}

constexpr unsigned int racing_position_for_hud(const RacingRuntimeState& state) {
    return state.distance_x256 >= state.rival_distance_x256 ? 1u : 2u;
}

constexpr Vec2i racing_circuit_minimap_position(Vec2i world,const RacingRoomData& room,Vec2i origin,Vec2i size) {
    const int width=size.x>0?size.x:1,height=size.y>0?size.y:1;
    return {origin.x+racing_clamp_int(world.x*width/(room.width_tiles*8),0,width-1),
        origin.y+racing_clamp_int(world.y*height/(room.height_tiles*8),0,height-1)};
}

constexpr int racing_boost_max_speed_x256(const RacingRoomData& room, const RacingRuntimeState& state) {
    const int base = room.config.max_speed_x256;
    return state.boost_frames > 0 ? base + base / 2 : base;
}

constexpr bool racing_uses_topdown_track(const RacingRoomData& room) {
    return room.config.pseudo3d.presentation == RacingPresentation::Topdown &&
        room.topdown_track != nullptr && room.topdown_track->checkpoint_count > 0;
}

constexpr int racing_heading_sine_x256[16] = {
    0, 98, 181, 237, 256, 237, 181, 98,
    0, -98, -181, -237, -256, -237, -181, -98
};

constexpr AffineSpriteTransform racing_vehicle_sprite_transform(uint8_t heading) {
    const int sine = racing_heading_sine_x256[heading & 15];
    const int cosine = racing_heading_sine_x256[(heading + 4) & 15];
    return AffineSpriteTransform {
        static_cast<int16_t>(cosine),
        static_cast<int16_t>(sine),
        static_cast<int16_t>(-sine),
        static_cast<int16_t>(cosine)
    };
}

struct RacingTopdownPose {
    Vec2i position_pixels;
    uint8_t heading;
};

constexpr uint8_t racing_heading_for_vector(int dx, int dy) {
    int best_score = -0x7fffffff;
    uint8_t best_heading = 0;
    for (uint8_t heading = 0; heading < 16; ++heading) {
        const int score = dx * racing_heading_sine_x256[heading] -
            dy * racing_heading_sine_x256[(heading + 4) & 15];
        if (score > best_score) {
            best_score = score;
            best_heading = heading;
        }
    }
    return best_heading;
}

constexpr RacingTopdownPose racing_topdown_pose_at_distance(
    const RacingTopdownTrackData& track,
    int distance_x256
) {
    const int path_length_x256 = racing_topdown_path_length_pixels(track) * 256;
    if (path_length_x256 <= 0) return { { 0, 0 }, track.start_heading };
    int remaining = racing_positive_mod(distance_x256, path_length_x256);
    for (size_t index = 0; index < track.path_point_count; ++index) {
        const Vec2i from = track.path_points[index];
        const Vec2i to = track.path_points[(index + 1) % track.path_point_count];
        const int segment = racing_topdown_segment_length_pixels(from, to) * 256;
        if (segment <= 0) continue;
        if (remaining < segment) {
            return {
                { from.x + (to.x - from.x) * remaining / segment,
                  from.y + (to.y - from.y) * remaining / segment },
                racing_heading_for_vector(to.x - from.x, to.y - from.y)
            };
        }
        remaining -= segment;
    }
    return { track.path_points[0], track.start_heading };
}

constexpr int racing_topdown_path_progress_x256(
    const RacingTopdownTrackData& track,
    Vec2i position_pixels
) {
    if (track.path_points == nullptr || track.path_point_count < 2) return 0;
    int prefix_x256 = 0;
    int best_progress_x256 = 0;
    int64_t best_distance_squared = 0x7fffffffffffffffLL;
    for (size_t index = 0; index < track.path_point_count; ++index) {
        const Vec2i from = track.path_points[index];
        const Vec2i to = track.path_points[(index + 1) % track.path_point_count];
        const int dx = to.x - from.x;
        const int dy = to.y - from.y;
        const int64_t denominator = static_cast<int64_t>(dx) * dx + static_cast<int64_t>(dy) * dy;
        if (denominator == 0) continue;
        const int64_t numerator = static_cast<int64_t>(position_pixels.x - from.x) * dx +
            static_cast<int64_t>(position_pixels.y - from.y) * dy;
        const int64_t bounded = numerator < 0 ? 0 : numerator > denominator ? denominator : numerator;
        const int projected_x = from.x + static_cast<int>(static_cast<int64_t>(dx) * bounded / denominator);
        const int projected_y = from.y + static_cast<int>(static_cast<int64_t>(dy) * bounded / denominator);
        const int64_t offset_x = position_pixels.x - projected_x;
        const int64_t offset_y = position_pixels.y - projected_y;
        const int64_t distance_squared = offset_x * offset_x + offset_y * offset_y;
        if (distance_squared < best_distance_squared) {
            best_distance_squared = distance_squared;
            best_progress_x256 = prefix_x256 + static_cast<int>(
                racing_topdown_segment_length_pixels(from, to) * 256LL * bounded / denominator
            );
        }
        prefix_x256 += racing_topdown_segment_length_pixels(from, to) * 256;
    }
    return best_progress_x256;
}

constexpr RacingTopdownPose racing_topdown_rival_pose(
    const RacingRuntimeState& state,
    const RacingRoomData& room,
    size_t rival_index
) {
    if (!racing_uses_circuit_track(room) || room.topdown_track->path_point_count < 2) {
        return { room.actors[rival_index].position_pixels,
            static_cast<uint8_t>(room.topdown_track != nullptr ? room.topdown_track->start_heading : 0) };
    }
    return racing_topdown_pose_at_distance(
        *room.topdown_track,
        state.rival_distance_x256 - static_cast<int>(rival_index + 1) * 32 * 256
    );
}

constexpr unsigned int racing_position_for_hud(
    const RacingRuntimeState& state,
    const RacingRoomData& room
) {
    if (!racing_uses_circuit_track(room) || room.actor_count == 0) {
        return racing_position_for_hud(state);
    }
    const bool has_path = room.topdown_track->path_point_count >= 2;
    const int track_length = racing_track_length_x256(room);
    const int player_progress = has_path
        ? static_cast<int>(state.lap_count) * track_length + racing_topdown_path_progress_x256(
            *room.topdown_track, { state.position_x256 / 256, state.position_y256 / 256 })
        : state.distance_x256;
    const int spacing = has_path ? 32 * 256 : track_length / static_cast<int>(room.actor_count + 1);
    unsigned int position = 1;
    for (size_t index = 0; index < room.actor_count; ++index) {
        const int rival_progress = state.rival_distance_x256 -
            static_cast<int>(index + (has_path ? 1 : 0)) * spacing;
        if (player_progress < rival_progress) {
            ++position;
        }
    }
    return position;
}

constexpr Vec2i racing_follow_camera(
    const RacingRoomData& room,
    Vec2i camera,
    Vec2i player_pixels
) {
    const int max_x = room.width_tiles * 8 > 240 ? room.width_tiles * 8 - 240 : 0;
    const int max_y = room.height_tiles * 8 > 160 ? room.height_tiles * 8 - 160 : 0;
    if (racing_uses_topdown_track(room)) {
        const RacingTopdownTrackData& track = *room.topdown_track;
        const int right = 240 - track.camera_dead_zone_x;
        const int bottom = 160 - track.camera_dead_zone_y;
        if (player_pixels.x - camera.x < track.camera_dead_zone_x) {
            camera.x = player_pixels.x - track.camera_dead_zone_x;
        } else if (player_pixels.x - camera.x > right) {
            camera.x = player_pixels.x - right;
        }
        if (player_pixels.y - camera.y < track.camera_dead_zone_y) {
            camera.y = player_pixels.y - track.camera_dead_zone_y;
        } else if (player_pixels.y - camera.y > bottom) {
            camera.y = player_pixels.y - bottom;
        }
    } else {
        camera.x = player_pixels.x - 120;
        camera.y = player_pixels.y - 96;
    }
    return Vec2i {
        racing_clamp_int(camera.x, 0, max_x),
        racing_clamp_int(camera.y, 0, max_y)
    };
}

constexpr RacingRaceResult racing_result(const RacingRuntimeState& state) {
    return static_cast<RacingRaceResult>(state.race_result);
}

constexpr bool racing_position_in_bounds(const RacingRoomData& room, Vec2i position_pixels) {
    return position_pixels.x >= 0 && position_pixels.y >= 0 &&
        position_pixels.x < room.width_tiles * 8 &&
        position_pixels.y < room.height_tiles * 8;
}

constexpr uint8_t racing_surface_flags_at(const RacingRoomData& room, Vec2i position_pixels) {
    if (!racing_position_in_bounds(room, position_pixels) || room.collision_flags == nullptr) {
        return 0;
    }
    return room.collision_flags[(position_pixels.y / 8) * room.width_tiles + (position_pixels.x / 8)];
}

constexpr int racing_surface_speed_limit_x256(const RacingRoomData& room, Vec2i position_pixels) {
    const uint8_t surface = racing_surface_flags_at(room, position_pixels);
    int limit = room.config.max_speed_x256;
    if ((surface & (1u << 5)) != 0) {
        limit = (limit * 3) / 4;
    }
    if ((surface & (1u << 6)) != 0) {
        limit /= 2;
    }
    return limit > 0 ? limit : 1;
}

constexpr bool racing_position_blocked(const RacingRoomData& room, Vec2i position_pixels) {
    return !racing_position_in_bounds(room, position_pixels) || room.collision_flags == nullptr ||
        (racing_surface_flags_at(room, position_pixels) & 0x1Fu) != 0;
}

constexpr bool racing_topdown_checkpoint_contains(
    const RacingTopdownCheckpoint& checkpoint,
    Vec2i position_pixels
) {
    const int left = checkpoint.center_pixels.x - static_cast<int>(checkpoint.width_pixels) / 2;
    const int top = checkpoint.center_pixels.y - static_cast<int>(checkpoint.height_pixels) / 2;
    return position_pixels.x >= left && position_pixels.x < left + checkpoint.width_pixels &&
        position_pixels.y >= top && position_pixels.y < top + checkpoint.height_pixels;
}

constexpr bool is_valid_racing_topdown_track_data(
    const RacingTopdownTrackData& track,
    const RacingRoomData& room
) {
    if (track.camera_dead_zone_x < 0 || track.camera_dead_zone_x > 120 ||
        track.camera_dead_zone_y < 0 || track.camera_dead_zone_y > 80 ||
        track.start_heading > 15 ||
        (track.path_point_count > 0 && (track.path_points == nullptr || track.path_point_count < 2 || track.path_point_count > 32)) ||
        track.checkpoints == nullptr || track.checkpoint_count == 0 || track.checkpoint_count > 16) {
        return false;
    }
    for (size_t index = 0; index < track.path_point_count; ++index) {
        if (!racing_position_in_bounds(room, track.path_points[index]) ||
            racing_topdown_segment_length_pixels(track.path_points[index],
                track.path_points[(index + 1) % track.path_point_count]) == 0) return false;
    }
    for (size_t index = 0; index < track.checkpoint_count; ++index) {
        const RacingTopdownCheckpoint& checkpoint = track.checkpoints[index];
        if (checkpoint.id == nullptr || checkpoint.width_pixels == 0 || checkpoint.height_pixels == 0 ||
            checkpoint.width_pixels > 256 || checkpoint.height_pixels > 256 ||
            !racing_position_in_bounds(room, checkpoint.center_pixels)) {
            return false;
        }
    }
    return true;
}

constexpr bool is_valid_racing_room_data(const RacingRoomData& room) {
    bool segments_valid = true;
    if (room.track_segment_count > 0) {
        if (room.track_segments == nullptr) return false;
        int segment_length = 0;
        for (size_t index = 0; index < room.track_segment_count; ++index) {
            const RacingTrackSegment& segment = room.track_segments[index];
            if (segment.length_pixels == 0 || segment.half_width == 0 || segment.half_width > 128 ||
                segment.curve < -64 || segment.curve > 64) {
                segments_valid = false;
                break;
            }
            segment_length += segment.length_pixels;
        }
        segments_valid = segments_valid && segment_length == room.height_tiles * 8;
    }
    return room.name != nullptr && room.collision_flags != nullptr &&
        room.width_tiles > 0 && room.height_tiles > 1 &&
        is_valid_racing_config(room.config) &&
        segments_valid &&
        (room.topdown_track == nullptr || is_valid_racing_topdown_track_data(*room.topdown_track, room)) &&
        racing_position_in_bounds(room, room.player_start_pixels) &&
        !racing_position_blocked(room, room.player_start_pixels);
}

constexpr bool is_valid_racing_resource_banks(const RacingProjectData& project) {
    if (project.resource_bank_count == 0) {
        return true;
    }
    if (project.resource_banks == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.resource_bank_count; ++index) {
        if (!is_valid_resource_bank(project.resource_banks[index])) {
            return false;
        }
    }
    return true;
}

constexpr bool is_valid_racing_resource_bank_groups(const RacingProjectData& project) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    if (project.resource_bank_groups == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.resource_bank_group_count; ++index) {
        if (!is_valid_resource_bank_group(project.resource_bank_groups[index])) {
            return false;
        }
    }
    return true;
}

constexpr ResourceBankBatch resource_bank_batch_from_racing_project(
    const RacingProjectData& project
) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_racing_project(
    const RacingProjectData& project,
    size_t group_index
) {
    return project.resource_bank_groups != nullptr && group_index < project.resource_bank_group_count
        ? project.resource_bank_groups[group_index]
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr int find_racing_resource_bank_group_index(
    const RacingProjectData& project,
    const char* name
) {
    return find_resource_bank_group_index(
        project.resource_bank_groups,
        project.resource_bank_group_count,
        name
    );
}

constexpr ResourceBankGroup resource_bank_group_from_racing_room(
    const RacingProjectData& project,
    const RacingRoomData& room
) {
    const int index = find_racing_resource_bank_group_index(
        project,
        room.resource_bank_group_name
    );
    return index >= 0
        ? resource_bank_group_from_racing_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr bool is_valid_racing_project_data(const RacingProjectData& project) {
    if (project.rooms == nullptr || project.room_count == 0 || project.initial_room < 0 ||
        static_cast<size_t>(project.initial_room) >= project.room_count ||
        !is_valid_racing_resource_banks(project) ||
        !is_valid_racing_resource_bank_groups(project)) {
        return false;
    }
    for (size_t index = 0; index < project.room_count; ++index) {
        const RacingRoomData& room = project.rooms[index];
        if (!is_valid_racing_room_data(room) ||
            (room.resource_bank_group_name != nullptr &&
                find_racing_resource_bank_group_index(
                    project,
                    room.resource_bank_group_name
                ) < 0)) {
            return false;
        }
    }
    return true;
}

constexpr RacingRuntimeState make_racing_runtime_state(const RacingRoomData& room) {
    return RacingRuntimeState {
        room.player_start_pixels.x * 256,
        room.player_start_pixels.y * 256,
        0,
        0,
        0,
        room.config.pseudo3d.rival_speed_x256_per_second > 0 &&
            (room.topdown_track == nullptr || room.topdown_track->path_point_count < 2)
            ? racing_track_length_x256(room) / 12
            : 0,
        0,
        0,
        static_cast<uint8_t>(RacingRaceResult::InProgress),
        0,
        0,
        static_cast<uint8_t>(room.topdown_track != nullptr ? room.topdown_track->start_heading : 0),
        0,
        static_cast<uint16_t>((room.topdown_track != nullptr ? room.topdown_track->start_heading : 0)*256),
        0,
        static_cast<int8_t>(room.topdown_track != nullptr && room.topdown_track->checkpoint_count==1 &&
            racing_topdown_checkpoint_contains(room.topdown_track->checkpoints[0],room.player_start_pixels) ? 0 : -1)
    };
}

inline bool capture_racing_save_data(
    UniversalSaveData& save_data,
    int room_index,
    const RacingRuntimeState& runtime_state,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    static_assert(
        sizeof(RacingSavePayload) <= universal_save_payload_capacity,
        "racing save payload exceeds the universal envelope"
    );
    const RacingSavePayload payload { runtime_state };
    return make_universal_save_data(
        save_data,
        UniversalSaveRuntime::Racing,
        room_index,
        runtime_state.position_x256 / 256,
        runtime_state.position_y256 / 256,
        0,
        0,
        event_state.variables,
        universal_save_variable_count,
        event_state.inventory,
        universal_save_inventory_count,
        event_state.equipped_items,
        universal_save_equipment_slot_count,
        play_time_frames,
        flags,
        &payload,
        sizeof(payload),
        event_state.text_variables,
        text_variable_count
    );
}

inline bool apply_racing_save_data(
    const RacingProjectData& project,
    const UniversalSaveData& save_data,
    int& room_index,
    RacingRuntimeState& runtime_state,
    EventState& event_state
) {
    if (!is_valid_universal_save_data(save_data) ||
        save_data.runtime != UniversalSaveRuntime::Racing ||
        save_data.room_index < 0 ||
        static_cast<size_t>(save_data.room_index) >= project.room_count) {
        return false;
    }
    RacingSavePayload payload {};
    // Legacy states ended after steering_frames and rounded to four bytes.
    constexpr size_t legacy_size = (offsetof(RacingRuntimeState, heading_x256) + 3u) & ~3u;
    const bool legacy = save_data.payload_size == legacy_size;
    if (!read_universal_save_payload(save_data, UniversalSaveRuntime::Racing, &payload,
            legacy ? legacy_size : sizeof(payload))) return false;
    if(legacy) {
        payload.runtime_state.heading_x256 = payload.runtime_state.heading * 256;
        payload.runtime_state.collision_frames = 0;
        payload.runtime_state.last_checkpoint = -1;
    }
    const RacingRoomData& room = project.rooms[save_data.room_index];
    const Vec2i position {
        payload.runtime_state.position_x256 / 256,
        payload.runtime_state.position_y256 / 256
    };
    if (racing_position_blocked(room, position) ||
        payload.runtime_state.speed_x256 < 0 ||
        payload.runtime_state.speed_x256 > racing_boost_max_speed_x256(room, payload.runtime_state) ||
        payload.runtime_state.distance_x256 < 0 ||
        payload.runtime_state.heading > 15 || payload.runtime_state.heading_x256 > 4095 ||
        payload.runtime_state.last_checkpoint < -1 ||
        (payload.runtime_state.last_checkpoint >= 0 && (room.topdown_track == nullptr ||
         static_cast<size_t>(payload.runtime_state.last_checkpoint) >= room.topdown_track->checkpoint_count)) ||
        payload.runtime_state.boost_charges > 3 ||
        payload.runtime_state.boost_frames > 45 ||
        racing_result(payload.runtime_state) > RacingRaceResult::Defeat) {
        return false;
    }
    if (!read_universal_save_common_state(
            save_data,
            event_state.variables,
            universal_save_variable_count,
            event_state.inventory,
            universal_save_inventory_count,
            event_state.equipped_items,
            universal_save_equipment_slot_count,
            event_state.text_variables,
            text_variable_count)) {
        return false;
    }
    room_index = save_data.room_index;
    runtime_state = payload.runtime_state;
    event_state.current_room = room_index;
    event_state.player_x = position.x;
    event_state.player_y = position.y;
    event_state.player_direction = 0;
    return true;
}

bool tick_racing_vehicle(RacingRuntimeState& state, const RacingRoomData& room, RacingInput input);

} // namespace gbs
