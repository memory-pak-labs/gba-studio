#include <assert.h>

#include "gbs/racing.hpp"

namespace {

constexpr uint8_t collision_flags[8 * 12] = {};
constexpr gbs::ResourceBank resource_banks[] = {
    { gbs::ResourcePoolKind::BgTiles, 64, 12, 8, "track_bg" },
};
constexpr gbs::ResourceBankGroup resource_bank_groups[] = {
    { "track_group", resource_banks, 1 },
};
constexpr uint8_t pseudo3d_floor_tiles[64] = {};
constexpr uint8_t pseudo3d_floor_tilemap_entries[16 * 16] = {};
constexpr uint8_t pseudo3d_panorama_tiles[64] = {};
constexpr uint16_t pseudo3d_panorama_tilemap_entries[32 * 32] = {};
constexpr uint8_t pseudo3d_minimap_tiles[64] = {};
constexpr uint16_t pseudo3d_minimap_tilemap_entries[32 * 32] = {};
constexpr gbs::RacingTrackSegment authored_track_segments[] = {
    { 32, -12, 28 },
    { 32, 18, 36 },
    { 32, 0, 32 }
};
constexpr uint8_t surface_flags[2] = { 0, static_cast<uint8_t>(1u << 5) };
constexpr gbs::RacingTopdownCheckpoint topdown_checkpoints[] = {
    { "gate-a", { 4, 12 }, 8, 8 },
    { "gate-b", { 4, 4 }, 8, 8 }
};
constexpr gbs::RacingTopdownTrackData topdown_track {
    96,
    64,
    topdown_checkpoints,
    2
};
constexpr uint16_t pseudo3d_palette_entries[4] = {};
constexpr gbs::PaletteAsset pseudo3d_palette { pseudo3d_palette_entries, 4, 0 };
constexpr gbs::TileAsset pseudo3d_panorama_tile_asset {
    pseudo3d_panorama_tiles, 1, 0, false
};
constexpr gbs::TileMapAsset pseudo3d_panorama_tilemap {
    pseudo3d_panorama_tilemap_entries, 32, 32
};
constexpr gbs::AffineTileAsset pseudo3d_floor_tile_asset {
    pseudo3d_floor_tiles, 1, 0
};
constexpr gbs::AffineTileMapAsset pseudo3d_floor_tilemap {
    pseudo3d_floor_tilemap_entries, 16, 16
};
constexpr gbs::TileAsset pseudo3d_minimap_tile_asset {
    pseudo3d_minimap_tiles, 1, 1, false
};
constexpr gbs::TileMapAsset pseudo3d_minimap_tilemap {
    pseudo3d_minimap_tilemap_entries, 32, 32
};
constexpr gbs::RacingPseudo3DVisualData pseudo3d_visual {
    48,
    &pseudo3d_panorama_tile_asset,
    &pseudo3d_panorama_tilemap,
    &pseudo3d_palette,
    &pseudo3d_floor_tile_asset,
    &pseudo3d_floor_tilemap,
    &pseudo3d_palette,
    &pseudo3d_minimap_tile_asset,
    &pseudo3d_minimap_tilemap,
    &pseudo3d_palette
};
constexpr gbs::RacingRoomData room {
    "track",
    collision_flags,
    8,
    12,
    gbs::RacingConfig {
        1024,
        2048,
        3072,
        512,
        gbs::RacingPseudo3DConfig {
            gbs::RacingPresentation::Topdown,
            9,
            1,
            0,
            0,
            0,
            false
        }
    },
    gbs::Vec2i { 32, 72 },
    -1,
    gbs::empty_event_script(),
    nullptr,
    0,
    nullptr,
    0,
    "track_group"
};
constexpr gbs::RacingRoomData rooms[] = { room };
constexpr gbs::RacingProjectData project {
    rooms,
    1,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    nullptr,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    resource_banks,
    1,
    resource_bank_groups,
    1
};

} // namespace

int main() {
    static_assert(gbs::is_valid_racing_project_data(project));
    static_assert(gbs::resource_bank_batch_from_racing_project(project).bank_count == 1);
    static_assert(gbs::find_racing_resource_bank_group_index(project, "track_group") == 0);
    static_assert(gbs::resource_bank_group_from_racing_room(project, room).bank_count == 1);
    gbs::RacingRuntimeState state = gbs::make_racing_runtime_state(room);
    assert(state.position_x256 == 32 * 256);
    assert(state.position_y256 == 72 * 256);

    for (int frame = 0; frame < 60; ++frame) {
        assert(gbs::tick_racing_vehicle(state, room, { true, false, 0 }));
    }
    assert(state.speed_x256 > 0 && state.speed_x256 <= room.config.max_speed_x256);
    assert(state.distance_x256 > 0);
    assert(state.position_y256 != 72 * 256 || state.lap_count > 0);

    const int x_before_steering = state.position_x256;
    assert(gbs::tick_racing_vehicle(state, room, { false, false, 1 }));
    assert(state.position_x256 > x_before_steering);

    const int speed_before_braking = state.speed_x256;
    gbs::tick_racing_vehicle(state, room, { false, true, 0 });
    assert(state.speed_x256 < speed_before_braking);

    state.position_x256 = 1 * 256;
    state.speed_x256 = 128;
    assert(!gbs::tick_racing_vehicle(state, room, { false, false, -1 }));
    assert(state.position_x256 == 1 * 256);
    assert(state.speed_x256 == 0);

    gbs::EventState event_state {};
    gbs::init_event_state(event_state);
    event_state.variables[3] = 77;
    event_state.inventory[2] = 5;
    state.position_x256 = 3 * 8 * 256;
    state.position_y256 = 2 * 8 * 256;
    state.speed_x256 = 640;
    state.distance_x256 = 4096;
    state.lap_count = 2;
    gbs::UniversalSaveData save_data {};
    assert(gbs::capture_racing_save_data(save_data, 0, state, event_state, 3600));

    gbs::RacingRuntimeState restored_state {};
    gbs::EventState restored_event_state {};
    gbs::init_event_state(restored_event_state);
    int restored_room = -1;
    assert(gbs::apply_racing_save_data(
        project,
        save_data,
        restored_room,
        restored_state,
        restored_event_state
    ));
    assert(restored_room == 0);
    assert(restored_state.position_x256 == state.position_x256);
    assert(restored_state.position_y256 == state.position_y256);
    assert(restored_state.speed_x256 == state.speed_x256);
    assert(restored_state.distance_x256 == state.distance_x256);
    assert(restored_state.lap_count == state.lap_count);
    assert(restored_event_state.variables[3] == 77);
    assert(restored_event_state.inventory[2] == 5);

    const gbs::RacingInput player_input { true, true, -1, true };
    const gbs::RacingInput scripted_input = gbs::racing_runtime_input(player_input, true);
    assert(!scripted_input.accelerate);
    assert(!scripted_input.brake);
    assert(scripted_input.steering == 0);
    const gbs::RacingInput active_input = gbs::racing_runtime_input(player_input, false);
    assert(active_input.accelerate);
    assert(active_input.brake);
    assert(active_input.steering == -1);
    assert(active_input.use_item);
    assert(!scripted_input.use_item);

    constexpr gbs::RacingRoomData topdown_room {
        "topdown_track",
        collision_flags,
        8,
        12,
        gbs::RacingConfig {
            1024,
            2048,
            3072,
            512,
            gbs::RacingPseudo3DConfig {
                gbs::RacingPresentation::Topdown,
                2,
                3,
                2,
                768,
                0,
                true
            }
        },
        gbs::Vec2i { 32, 72 },
        -1,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        "track_group",
        gbs::empty_event_script(),
        gbs::empty_event_script()
    };
    static_assert(gbs::is_valid_racing_room_data(topdown_room));
    static_assert(!gbs::racing_uses_pseudo3d(topdown_room));
    gbs::RacingRuntimeState topdown_state = gbs::make_racing_runtime_state(topdown_room);
    assert(topdown_state.rival_distance_x256 > 0);
    for (int frame = 0; frame < 480 && gbs::racing_result(topdown_state) == gbs::RacingRaceResult::InProgress; ++frame) {
        assert(gbs::tick_racing_vehicle(topdown_state, topdown_room, { true, false, 0 }));
    }
    assert(topdown_state.checkpoint_count >= 6);
    assert(topdown_state.pickup_count >= 4);
    assert(topdown_state.boost_charges > 0);
    assert(gbs::racing_result(topdown_state) == gbs::RacingRaceResult::Victory);

    constexpr gbs::RacingRoomData authored_topdown_room {
        "authored_topdown_track",
        collision_flags,
        8,
        12,
        topdown_room.config,
        gbs::Vec2i { 32, 72 },
        -1,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        "track_group",
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        nullptr,
        0,
        &topdown_track
    };
    static_assert(gbs::is_valid_racing_topdown_track_data(topdown_track, authored_topdown_room));
    static_assert(gbs::is_valid_racing_room_data(authored_topdown_room));
    gbs::RacingRuntimeState authored_topdown_state = gbs::make_racing_runtime_state(authored_topdown_room);
    authored_topdown_state.position_x256 = 4 * 256;
    authored_topdown_state.position_y256 = 12 * 256;
    authored_topdown_state.speed_x256 = 256;
    assert(gbs::tick_racing_vehicle(authored_topdown_state, authored_topdown_room, { false, false, 0 }));
    assert(authored_topdown_state.checkpoint_count == 1);
    assert(authored_topdown_state.checkpoint_count % topdown_track.checkpoint_count == 1);

    // Authored top-down tracks must let a vehicle turn toward every side of a
    // closed circuit. The legacy vertical-only motion cannot pass this test.
    constexpr uint8_t turning_collision_flags[32 * 32] = {};
    gbs::RacingRoomData turning_room = authored_topdown_room;
    turning_room.collision_flags = turning_collision_flags;
    turning_room.width_tiles = 32;
    turning_room.height_tiles = 32;
    gbs::RacingRuntimeState turning_state = gbs::make_racing_runtime_state(turning_room);
    turning_state.position_x256 = 128 * 256;
    turning_state.position_y256 = 128 * 256;
    turning_state.speed_x256 = 256;
    const int east_start_x = turning_state.position_x256;
    const int east_start_y = turning_state.position_y256;
    for (int frame = 0; frame < 12; ++frame) {
        assert(gbs::tick_racing_vehicle(turning_state, turning_room, { true, false, 1 }));
    }
    assert(turning_state.position_x256 > east_start_x);
    assert(turning_state.position_y256 < east_start_y);
    const int south_start_y = turning_state.position_y256;
    for (int frame = 0; frame < 12; ++frame) {
        assert(gbs::tick_racing_vehicle(turning_state, turning_room, { true, false, 1 }));
    }
    assert(turning_state.position_y256 > south_start_y);

    gbs::RacingRoomData camera_room = turning_room;
    camera_room.width_tiles = 60;
    camera_room.height_tiles = 40;
    const gbs::Vec2i far_camera = gbs::racing_follow_camera(camera_room, { 0, 0 }, { 400, 280 });
    assert(far_camera.x == 240 && far_camera.y == 160);
    const gbs::Vec2i return_camera = gbs::racing_follow_camera(camera_room, far_camera, { 120, 80 });
    assert(return_camera.x == 24 && return_camera.y == 16);
    turning_room.actor_count = 2;
    turning_state.distance_x256 = 0;
    turning_state.rival_distance_x256 = gbs::racing_track_length_x256(turning_room) / 2;
    assert(gbs::racing_position_for_hud(turning_state, turning_room) == 3);
    turning_state.distance_x256 = gbs::racing_track_length_x256(turning_room);
    assert(gbs::racing_position_for_hud(turning_state, turning_room) == 1);

    // Drive a complete rectangular lap using only player inputs. The finish
    // gate is last, so a lap cannot be awarded at the western checkpoint.
    uint8_t loop_flags[60 * 40] {};
    for (int y = 0; y < 40; ++y) {
        for (int x = 0; x < 60; ++x) {
            const int px = x * 8 + 4;
            const int py = y * 8 + 4;
            const bool horizontal = px >= 40 && px < 440 &&
                ((py >= 32 && py < 88) || (py >= 232 && py < 288));
            const bool vertical = py >= 40 && py < 280 &&
                ((px >= 32 && px < 88) || (px >= 392 && px < 448));
            loop_flags[y * 60 + x] = horizontal || vertical ? 0 : 1;
        }
    }
    static constexpr gbs::RacingTopdownCheckpoint loop_checkpoints[] = {
        { "east", { 420, 160 }, 56, 60 },
        { "south", { 240, 260 }, 60, 56 },
        { "west", { 60, 160 }, 56, 60 },
        { "finish", { 200, 60 }, 40, 56 }
    };
    static constexpr gbs::Vec2i loop_path[] = {
        { 200, 60 }, { 420, 60 }, { 420, 260 }, { 60, 260 }, { 60, 60 }
    };
    constexpr gbs::RacingTopdownTrackData loop_track { 56, 40, loop_checkpoints, 4, 4, loop_path, 5 };
    gbs::RacingRoomData loop_room = turning_room;
    loop_room.collision_flags = loop_flags;
    loop_room.width_tiles = 60;
    loop_room.height_tiles = 40;
    loop_room.player_start_pixels = { 200, 60 };
    loop_room.topdown_track = &loop_track;
    loop_room.config.max_speed_x256 = 512;
    loop_room.config.pseudo3d.laps_to_win = 1;
    loop_room.config.pseudo3d.pickups_per_lap = 0;
    loop_room.config.pseudo3d.rival_speed_x256_per_second = 1;
    assert(gbs::is_valid_racing_room_data(loop_room));
    assert(gbs::racing_track_length_x256(loop_room) == 1120 * 256);
    gbs::RacingRuntimeState loop_state = gbs::make_racing_runtime_state(loop_room);
    assert(loop_state.heading == 4);
    assert(gbs::racing_topdown_path_progress_x256(loop_track, { 420, 60 }) == 220 * 256);
    const gbs::RacingTopdownPose first_rival = gbs::racing_topdown_rival_pose(loop_state, loop_room, 0);
    const gbs::RacingTopdownPose second_rival = gbs::racing_topdown_rival_pose(loop_state, loop_room, 1);
    assert(first_rival.position_pixels.x == 168 && first_rival.position_pixels.y == 60 && first_rival.heading == 4);
    assert(second_rival.position_pixels.x == 136 && second_rival.position_pixels.y == 60 && second_rival.heading == 4);
    loop_state.rival_distance_x256 = 250 * 256;
    assert(gbs::racing_position_for_hud(loop_state, loop_room) == 3);
    loop_state.rival_distance_x256 = 0;
    const gbs::AffineSpriteTransform east_sprite = gbs::racing_vehicle_sprite_transform(loop_state.heading);
    assert(east_sprite.pa == 0 && east_sprite.pb == 256 && east_sprite.pc == -256 && east_sprite.pd == 0);
    loop_state.speed_x256 = 512;
    gbs::Vec2i loop_camera { 0, 0 };
    int farthest_camera_x = 0;
    int farthest_camera_y = 0;
    const auto drive = [&](int frames, int steering) {
        for (int frame = 0; frame < frames; ++frame) {
            assert(gbs::tick_racing_vehicle(loop_state, loop_room, { true, false, steering }));
            loop_camera = gbs::racing_follow_camera(loop_room, loop_camera, {
                loop_state.position_x256 / 256, loop_state.position_y256 / 256
            });
            if (loop_camera.x > farthest_camera_x) farthest_camera_x = loop_camera.x;
            if (loop_camera.y > farthest_camera_y) farthest_camera_y = loop_camera.y;
        }
    };
    drive(100, 0); drive(12, 1); drive(84, 0); drive(12, 1);
    drive(164, 0); drive(12, 1); drive(84, 0); drive(12, 1);
    assert(loop_state.checkpoint_count == 3);
    assert(loop_state.lap_count == 0);
    drive(64, 0);
    assert(loop_state.checkpoint_count == 4);
    assert(loop_state.lap_count == 1);
    assert(gbs::racing_result(loop_state) == gbs::RacingRaceResult::Victory);
    assert(farthest_camera_x >= 220 && farthest_camera_y >= 130);
    assert(loop_camera.x < 100 && loop_camera.y < 50);

    constexpr gbs::RacingConfig surface_config {
        1024,
        2048,
        3072,
        512,
        gbs::RacingPseudo3DConfig {
            gbs::RacingPresentation::Topdown,
            1,
            1,
            0,
            0,
            0,
            false
        }
    };
    constexpr gbs::RacingRoomData surface_room {
        "surface_track",
        surface_flags,
        1,
        2,
        surface_config,
        gbs::Vec2i { 4, 4 }
    };
    static_assert(gbs::racing_surface_flags_at(surface_room, { 4, 12 }) == (1u << 5));
    static_assert(!gbs::racing_position_blocked(surface_room, { 4, 12 }));
    assert(gbs::racing_surface_speed_limit_x256(surface_room, { 4, 12 }) < surface_config.max_speed_x256);

    constexpr gbs::RacingRoomData pseudo3d_room {
        "pseudo3d_track",
        collision_flags,
        8,
        12,
        gbs::RacingConfig {
            1024,
            2048,
            3072,
            512,
            gbs::RacingPseudo3DConfig {
                gbs::RacingPresentation::Pseudo3D,
                2,
                3,
                2,
                768,
                12,
                true
            }
        },
        gbs::Vec2i { 32, 72 },
        -1,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        "track_group",
        gbs::empty_event_script(),
        gbs::empty_event_script()
    };
    static_assert(gbs::is_valid_racing_room_data(pseudo3d_room));
    static_assert(gbs::racing_uses_pseudo3d(pseudo3d_room));
    static_assert(gbs::is_valid_racing_pseudo3d_visual_data(pseudo3d_visual));
    static_assert(gbs::racing_pseudo3d_visual_for_room(pseudo3d_room) == nullptr);

    constexpr gbs::RacingRoomData authored_pseudo3d_room {
        "authored_pseudo3d_track",
        collision_flags,
        8,
        12,
        pseudo3d_room.config,
        gbs::Vec2i { 32, 72 },
        -1,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        "track_group",
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        &pseudo3d_visual
    };
    static_assert(gbs::racing_pseudo3d_visual_for_room(authored_pseudo3d_room) == &pseudo3d_visual);

    constexpr gbs::RacingRoomData segmented_pseudo3d_room {
        "segmented_pseudo3d_track",
        collision_flags,
        8,
        12,
        pseudo3d_room.config,
        gbs::Vec2i { 32, 72 },
        -1,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        "track_group",
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        &pseudo3d_visual,
        authored_track_segments,
        3
    };
    static_assert(gbs::is_valid_racing_room_data(segmented_pseudo3d_room));
    static_assert(gbs::racing_track_length_x256(segmented_pseudo3d_room) == 96 * 256);
    static_assert(gbs::racing_track_segment_for_distance(segmented_pseudo3d_room, 40 * 256)->curve == 18);

    gbs::RacingRuntimeState pseudo3d_state = gbs::make_racing_runtime_state(pseudo3d_room);
    assert(pseudo3d_state.rival_distance_x256 > pseudo3d_state.distance_x256);
    const gbs::RacingPerspectiveLine horizon = gbs::racing_perspective_line(
        pseudo3d_state,
        pseudo3d_room,
        48
    );
    const gbs::RacingPerspectiveLine foreground = gbs::racing_perspective_line(
        pseudo3d_state,
        pseudo3d_room,
        152
    );
    assert(foreground.half_width > horizon.half_width);
    assert(foreground.center_x >= 0 && foreground.center_x < 240);
    const gbs::Vec2i player_marker = gbs::racing_minimap_position(
        pseudo3d_state.distance_x256,
        pseudo3d_room,
        gbs::Vec2i { 200, 8 },
        gbs::Vec2i { 32, 24 }
    );
    const gbs::Vec2i rival_marker = gbs::racing_minimap_position(
        pseudo3d_state.rival_distance_x256,
        pseudo3d_room,
        gbs::Vec2i { 200, 8 },
        gbs::Vec2i { 32, 24 }
    );
    assert(player_marker.x >= 200 && player_marker.x < 232);
    assert(player_marker.y >= 8 && player_marker.y < 32);
    assert(rival_marker.x >= 200 && rival_marker.x < 232);
    assert(rival_marker.y >= 8 && rival_marker.y < 32);

    gbs::RacingRuntimeState segmented_state = gbs::make_racing_runtime_state(segmented_pseudo3d_room);
    segmented_state.distance_x256 = 40 * 256;
    segmented_state.rival_distance_x256 = segmented_state.distance_x256 + 1;
    const gbs::Vec2i segmented_marker = gbs::racing_minimap_position(
        segmented_state.distance_x256,
        segmented_pseudo3d_room,
        gbs::Vec2i { 200, 8 },
        gbs::Vec2i { 32, 24 }
    );
    assert(segmented_marker.x != 216);
    assert(gbs::racing_position_for_hud(segmented_state) == 2);
    segmented_state.rival_distance_x256 = segmented_state.distance_x256 - 1;
    assert(gbs::racing_position_for_hud(segmented_state) == 1);
    segmented_state.pickup_count = 1;
    segmented_state.boost_charges = 1;
    assert(gbs::tick_racing_vehicle(segmented_state, segmented_pseudo3d_room, { true, false, 0, true }));
    assert(segmented_state.boost_charges == 0);
    assert(segmented_state.boost_frames > 0);
    assert(segmented_state.speed_x256 > segmented_pseudo3d_room.config.max_speed_x256 / 60);

    constexpr int raster_horizon = gbs::racing_affine_horizon_y;
    const gbs::RacingAffineRasterFrame raster = gbs::make_racing_affine_raster_frame(
        pseudo3d_state,
        pseudo3d_room
    );
    assert(raster.horizon_y == raster_horizon);
    assert(!raster.lines[raster_horizon].floor_visible);
    assert(raster.lines[raster_horizon + 1].floor_visible);
    assert(raster.lines[64].pa > raster.lines[152].pa);
    assert(raster.lines[64].reference_y_8 != raster.lines[152].reference_y_8);
    assert(raster.lines[160].pa == raster.lines[0].pa);
    assert(raster.lines[160].pc == raster.lines[0].pc);
    for (int scanline = 0; scanline < 160; ++scanline) {
        const gbs::RacingAffineRasterLine reference = gbs::racing_affine_raster_line(
            pseudo3d_state,
            pseudo3d_room,
            scanline,
            raster_horizon
        );
        assert(raster.lines[scanline].pa == reference.pa);
        assert(raster.lines[scanline].pc == reference.pc);
        assert(raster.lines[scanline].reference_x_8 == reference.reference_x_8);
        assert(raster.lines[scanline].reference_y_8 == reference.reference_y_8);
        assert(raster.lines[scanline].floor_visible == reference.floor_visible);
    }
    const gbs::RacingAffineRasterFrame custom_horizon_raster = gbs::make_racing_affine_raster_frame(
        pseudo3d_state,
        pseudo3d_room,
        56
    );
    assert(custom_horizon_raster.horizon_y == 56);
    assert(!custom_horizon_raster.lines[56].floor_visible);
    assert(custom_horizon_raster.lines[57].floor_visible);

    pseudo3d_state.distance_x256 += 2048;
    const gbs::RacingAffineRasterFrame moved_raster = gbs::make_racing_affine_raster_frame(
        pseudo3d_state,
        pseudo3d_room
    );
    assert(moved_raster.lines[96].reference_y_8 != raster.lines[96].reference_y_8);
    assert(moved_raster.lines[96].pc != 0);

    for (int frame = 0; frame < 720 && gbs::racing_result(pseudo3d_state) == gbs::RacingRaceResult::InProgress; ++frame) {
        assert(gbs::tick_racing_vehicle(pseudo3d_state, pseudo3d_room, { true, false, 0 }));
    }
    assert(pseudo3d_state.checkpoint_count >= 6);
    assert(pseudo3d_state.pickup_count >= 4);
    assert(gbs::racing_result(pseudo3d_state) == gbs::RacingRaceResult::Victory);
    return 0;
}
