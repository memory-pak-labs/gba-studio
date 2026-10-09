#include <cassert>
#include "gbs/project.hpp"

namespace {

void test_room_conversion() {
    const uint16_t visual[] = { 1, 2, 3, 4 };
    const uint8_t collision[] = { gbs::TileEmpty, gbs::TileSolid, gbs::TileEmpty, gbs::TileEmpty };
    const gbs::Portal portals[] = {
        { gbs::Rect { 8, 8, 8, 8 }, 1, gbs::Vec2i { 16, 16 } }
    };
    const gbs::TopDownRoomData data {
        visual,
        collision,
        2,
        2,
        portals,
        1,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        gbs::default_room_metadata()
    };

    gbs::Room room = gbs::room_from_data(data);
    assert(room.visual_tiles == visual);
    assert(room.collision.flags == collision);
    assert(room.collision.width == 2);
    assert(room.collision.height == 2);
    assert(room.portals == portals);
    assert(room.portal_count == 1);
}

void test_actor_conversion() {
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::TopDownActorData data {
        gbs::Vec2i { 4, 8 },
        gbs::Vec2i { 16, 16 },
        2,
        &metasprite
    };

    gbs::Actor actor = gbs::actor_from_data(data);
    assert(actor.position_pixels.x == 4);
    assert(actor.position_pixels.y == 8);
    assert(actor.size_pixels.x == 16);
    assert(actor.speed_pixels == 2);
    assert(actor.direction == static_cast<uint8_t>(gbs::TopDownActorDirection::Down));
}

void test_player_actor_runtime_uses_animation_data() {
    static constexpr gbs::MetaSpritePart parts[] = {
        { 0, 0, 4, 2, false, false }
    };
    static constexpr gbs::MetaSprite metasprite { parts, 1 };
    static constexpr gbs::SpriteAnimationFrame frames[] = {
        { metasprite, 6 }
    };
    static constexpr gbs::SpriteAnimation idle_animation { frames, 1, true };
    const gbs::TopDownActorData player_data {
        gbs::Vec2i { 16, 24 },
        gbs::Vec2i { 16, 16 },
        2,
        &metasprite,
        &idle_animation,
        "player",
        gbs::TopDownActorDirection::Up,
        1,
        150,
        75
    };

    gbs::TopDownActorRuntime runtime = gbs::actor_runtime_from_data(player_data);

    assert(runtime.actor.position_pixels.x == 16);
    assert(runtime.actor.position_pixels.y == 24);
    assert(runtime.actor.direction == static_cast<uint8_t>(gbs::TopDownActorDirection::Up));
    assert(runtime.metasprite == &metasprite);
    assert(runtime.animation == &idle_animation);
    assert(runtime.animation_speed_percent == 75);
    assert(runtime.visible);
    assert(runtime.active);
}

void test_project_validation() {
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::TopDownRoomData room {
        visual,
        collision,
        1,
        1,
        nullptr,
        0,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        gbs::default_room_metadata()
    };
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::TopDownProjectData valid {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        &room,
        1,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        gbs::TopDownActorData { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 16, 16 }, 1, &metasprite },
        gbs::Camera { gbs::Vec2i { 0, 0 }, true },
        0
    };
    const gbs::TopDownProjectData missing_metasprite {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        &room,
        1,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        gbs::TopDownActorData { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 16, 16 }, 1, nullptr },
        gbs::Camera { gbs::Vec2i { 0, 0 }, true },
        0
    };

    assert(gbs::is_valid_topdown_project_data(valid));
    assert(!gbs::is_valid_topdown_project_data(missing_metasprite));
    gbs::TopDownProjectData invalid_initial_room = valid;
    invalid_initial_room.initial_room = 1;
    assert(!gbs::is_valid_topdown_project_data(invalid_initial_room));
    assert(gbs::is_valid_room_index(valid, 0));
    assert(!gbs::is_valid_room_index(valid, -1));
    assert(!gbs::is_valid_room_index(valid, 1));
    assert(!gbs::is_valid_project_script_index(valid, 0));
}

void test_platformer_project_data_contract() {
    const uint16_t visual[] = { 0, 1, 2, 3 };
    const uint8_t collision[] = { 0, 0, gbs::TileSolid, gbs::TileSolid };
    const gbs::TileSlope slopes[] = { gbs::TileSlope::None, gbs::TileSlope::BlockBelowRising, gbs::TileSlope::None, gbs::TileSlope::None };
    const gbs::PlatformerHazard hazards[] = {
        gbs::PlatformerHazard { gbs::Rect { 8, 8, 8, 8 }, 1, true }
    };
    const gbs::PlatformerCheckpoint checkpoints[] = {
        gbs::PlatformerCheckpoint { gbs::Rect { 16, 8, 8, 8 }, gbs::Vec2i { 16, 8 }, 2 }
    };
    const gbs::PlatformerRoomData rooms[] = {
        gbs::PlatformerRoomData {
            visual,
            collision,
            slopes,
            2,
            2,
            gbs::Rect { 4, 4, 16, 16 },
            gbs::Camera { gbs::Vec2i { 1, 2 }, true },
            gbs::default_platformer_config(),
            hazards,
            1,
            checkpoints,
            1,
            nullptr,
            0,
            "platform_room"
        }
    };
    const gbs::PlatformerProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        rooms,
        1,
        0,
        0
    };

    gbs::PlatformerRoom runtime_room = gbs::platformer_room_from_data(rooms[0]);
    assert(gbs::is_valid_platformer_project_data(project));
    assert(gbs::is_valid_platformer_room_index(project, 0));
    assert(runtime_room.collision.slopes == slopes);
    assert(!gbs::is_valid_platformer_room_index(project, 1));
    assert(runtime_room.visual_tiles == visual);
    assert(runtime_room.collision.flags == collision);
    assert(runtime_room.width_tiles == 2);
    assert(rooms[0].hazard_count == 1);
    assert(rooms[0].checkpoint_count == 1);
}

void test_platformer_project_resource_bank_validation() {
    const uint16_t visual[] = { 0, 1, 2, 3 };
    const uint8_t collision[] = { 0, 0, gbs::TileSolid, gbs::TileSolid };
    const gbs::PlatformerRoomData rooms[] = {
        [&] {
            gbs::PlatformerRoomData room {
            visual,
            collision,
            nullptr,
            2,
            2,
            gbs::Rect { 4, 4, 16, 16 },
            gbs::Camera { gbs::Vec2i { 1, 2 }, true },
            gbs::default_platformer_config()
            };
            room.name = "platform_alias";
            room.resource_bank_group_name = "platform_room";
            return room;
        }()
    };
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 0, 4, 1, "platform_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::OamSprites, gbs::automatic_resource_bank_start, 2, 1, "platform_oam" }
    };
    const gbs::ResourceBankGroup groups[] = {
        gbs::ResourceBankGroup { "platform_room", banks, 2 }
    };
    const gbs::PlatformerProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        rooms,
        1,
        0,
        0,
        banks,
        2,
        groups,
        1
    };
    gbs::PlatformerProjectData missing_banks = project;
    missing_banks.resource_banks = nullptr;
    gbs::PlatformerProjectData missing_groups = project;
    missing_groups.resource_bank_groups = nullptr;

    assert(gbs::is_valid_platformer_resource_banks(project));
    assert(gbs::is_valid_platformer_resource_bank_groups(project));
    assert(gbs::is_valid_platformer_project_data(project));
    assert(!gbs::is_valid_platformer_resource_banks(missing_banks));
    assert(!gbs::is_valid_platformer_project_data(missing_banks));
    assert(!gbs::is_valid_platformer_resource_bank_groups(missing_groups));
    assert(!gbs::is_valid_platformer_project_data(missing_groups));

    gbs::ResourceBankBatch batch = gbs::resource_bank_batch_from_platformer_project(project);
    assert(batch.banks == banks);
    assert(batch.bank_count == 2);
    gbs::ResourceBankGroup group = gbs::resource_bank_group_from_platformer_project(project, static_cast<size_t>(0));
    assert(group.name == groups[0].name);
    assert(group.banks == banks);
    assert(group.bank_count == 2);
    assert(gbs::resource_bank_group_from_platformer_project(project, 99).bank_count == 0);
    assert(gbs::find_platformer_resource_bank_group_index(project, "platform_room") == 0);
    assert(gbs::find_platformer_resource_bank_group_index(project, "missing") == -1);
    gbs::ResourceBankGroup named_group = gbs::resource_bank_group_from_platformer_project(project, "platform_room");
    assert(named_group.name == groups[0].name);
    assert(named_group.bank_count == 2);
    assert(gbs::resource_bank_group_from_platformer_project(project, "missing").bank_count == 0);
    assert(gbs::resource_bank_group_name_for_platformer_room(rooms[0]) == rooms[0].resource_bank_group_name);
    assert(gbs::find_platformer_room_resource_bank_group_index(project, rooms[0]) == 0);
    assert(gbs::resource_bank_group_from_platformer_room(project, rooms[0]).banks == banks);
    gbs::PlatformerRoomData fallback_room = rooms[0];
    fallback_room.name = "platform_room";
    fallback_room.resource_bank_group_name = nullptr;
    assert(gbs::resource_bank_group_name_for_platformer_room(fallback_room) == fallback_room.name);
    assert(gbs::find_platformer_room_resource_bank_group_index(project, fallback_room) == 0);
}

void test_platformer_save_data_roundtrip() {
    const uint16_t visual[] = { 0, 1, 2, 3 };
    const uint8_t collision[] = { 0, 0, gbs::TileSolid, gbs::TileSolid };
    const gbs::PlatformerRoomData rooms[] = {
        gbs::PlatformerRoomData {
            visual,
            collision,
            nullptr,
            2,
            2,
            gbs::Rect { 4, 4, 16, 16 },
            gbs::Camera { gbs::Vec2i { 0, 0 }, true },
            gbs::default_platformer_config()
        },
        gbs::PlatformerRoomData {
            visual,
            collision,
            nullptr,
            2,
            2,
            gbs::Rect { 24, 16, 16, 16 },
            gbs::Camera { gbs::Vec2i { 8, 0 }, true },
            gbs::default_platformer_config()
        }
    };
    const gbs::PlatformerProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        rooms,
        2,
        0,
        0
    };

    gbs::PlatformerActor actor = gbs::platformer_actor_from_rect(gbs::Rect { 32, 40, 16, 16 });
    actor.velocity_x256 = gbs::Vec2i { -512, 256 };
    actor.facing = gbs::PlatformerFacing::Left;
    actor.on_ground = true;
    actor.coyote_timer = 3;
    gbs::PlatformerRuntimeState runtime_state = gbs::platformer_state_from_spawn(gbs::Vec2i { 24, 16 }, 9);
    runtime_state.damage_taken = 2;
    gbs::Camera camera { gbs::Vec2i { 6, 8 }, false };
    gbs::EventState event_state;
    gbs::init_event_state(event_state);
    event_state.variables[3] = 77;
    event_state.variables[gbs::event_variable_count - 1] = 903;

    gbs::PlatformerSaveData save_data {};
    gbs::capture_platformer_save_data(save_data, 1, actor, runtime_state, camera, event_state, 1234, 5);
    assert(gbs::is_valid_platformer_save_data(project, save_data));
    assert(save_data.room_index == 1);
    assert(save_data.camera_x == 6);
    assert(save_data.camera_follow_player == 0);
    assert(save_data.play_time_frames == 1234);
    assert(save_data.flags == 5);
    assert(save_data.variables[3] == 77);
    assert(save_data.variables[gbs::event_variable_count - 1] == 903);

    gbs::PlatformerActor restored_actor = gbs::platformer_actor_from_rect(gbs::Rect { 0, 0, 16, 16 });
    restored_actor.movement_remainder_x256 = gbs::Vec2i { 128, -64 };
    gbs::PlatformerRuntimeState restored_state = gbs::platformer_state_from_spawn(gbs::Vec2i { 0, 0 }, 0);
    gbs::Camera restored_camera { gbs::Vec2i { 0, 0 }, true };
    gbs::EventState restored_event_state;
    gbs::init_event_state(restored_event_state);
    assert(gbs::apply_platformer_save_data(project, save_data, restored_actor, restored_state, restored_camera, restored_event_state));
    assert(restored_event_state.current_room == 1);
    assert(restored_actor.bounds_pixels.x == 32);
    assert(restored_actor.velocity_x256.x == -512);
    assert(restored_actor.movement_remainder_x256.x == 0);
    assert(restored_actor.movement_remainder_x256.y == 0);
    assert(restored_actor.facing == gbs::PlatformerFacing::Left);
    assert(restored_actor.on_ground);
    assert(restored_camera.position_pixels.x == 6);
    assert(!restored_camera.follow_player);
    assert(restored_state.active_checkpoint_id == 9);
    assert(restored_state.damage_taken == 2);
    assert(restored_event_state.variables[3] == 77);
    assert(restored_event_state.variables[gbs::event_variable_count - 1] == 903);

    save_data.room_index = 9;
    assert(!gbs::apply_platformer_save_data(project, save_data, restored_actor, restored_state, restored_camera, restored_event_state));
}

void test_isometric_project_data_contract() {
    const uint8_t visual[] = { 0, 1, 1, 0 };
    const uint8_t collision[] = { 0, gbs::IsoTileBlocked, 0, 0 };
    const gbs::IsoActor actors[] = {
        gbs::IsoActor { gbs::IsoCoord { 0, 0, 0 }, gbs::Vec2i { -8, -16 }, 0, 0, true, false, 0 }
    };
    const gbs::IsometricRoomData rooms[] = {
        gbs::IsometricRoomData {
            visual,
            collision,
            2,
            2,
            actors,
            1,
            gbs::default_iso_grid_config(),
            gbs::IsoCamera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 256, 160 }, true },
            "iso_room"
        }
    };
    const gbs::IsometricProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        rooms,
        1,
        0,
        0
    };

    gbs::IsoTileMap map = gbs::iso_tilemap_from_room(rooms[0]);
    assert(gbs::is_valid_isometric_project_data(project));
    assert(gbs::is_valid_isometric_room_index(project, 0));
    assert(!gbs::is_valid_isometric_room_index(project, -1));
    assert(map.flags == collision);
    assert(map.width == 2);
    assert(map.height == 2);
    assert(rooms[0].actors == actors);
}

void test_isometric_project_resource_bank_validation() {
    const uint8_t visual[] = { 1, 1, 1, 1 };
    const uint8_t collision[] = { gbs::IsoTileBlocked, gbs::IsoTileBlocked, gbs::IsoTileEmpty, gbs::IsoTileBlocked };
    const gbs::IsoActor actors[] = {
        gbs::IsoActor { gbs::IsoCoord { 0, 1, 0 }, gbs::Vec2i { -8, -16 }, 0, 0, true, false, 0 }
    };
    const gbs::IsometricRoomData rooms[] = {
        [&] {
            gbs::IsometricRoomData room {
            visual,
            collision,
            2,
            2,
            actors,
            1,
            gbs::default_iso_grid_config(),
            gbs::IsoCamera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 64, 32 }, true },
            "iso_bank_room"
            };
            room.resource_bank_group_name = "iso_room";
            return room;
        }()
    };
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 0, 4, 1, "iso_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::OamSprites, gbs::automatic_resource_bank_start, 4, 1, "iso_oam" }
    };
    const gbs::ResourceBankGroup groups[] = {
        gbs::ResourceBankGroup { "iso_room", banks, 2 }
    };
    const gbs::IsometricProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        rooms,
        1,
        0,
        0,
        banks,
        2,
        groups,
        1
    };
    gbs::IsometricProjectData missing_banks = project;
    missing_banks.resource_banks = nullptr;
    gbs::IsometricProjectData missing_groups = project;
    missing_groups.resource_bank_groups = nullptr;

    assert(gbs::is_valid_isometric_resource_banks(project));
    assert(gbs::is_valid_isometric_resource_bank_groups(project));
    assert(gbs::is_valid_isometric_project_data(project));
    assert(!gbs::is_valid_isometric_resource_banks(missing_banks));
    assert(!gbs::is_valid_isometric_project_data(missing_banks));
    assert(!gbs::is_valid_isometric_resource_bank_groups(missing_groups));
    assert(!gbs::is_valid_isometric_project_data(missing_groups));

    gbs::ResourceBankBatch batch = gbs::resource_bank_batch_from_isometric_project(project);
    assert(batch.banks == banks);
    assert(batch.bank_count == 2);
    gbs::ResourceBankGroup group = gbs::resource_bank_group_from_isometric_project(project, static_cast<size_t>(0));
    assert(group.name == groups[0].name);
    assert(group.banks == banks);
    assert(group.bank_count == 2);
    assert(gbs::resource_bank_group_from_isometric_project(project, 99).bank_count == 0);
    assert(gbs::find_isometric_resource_bank_group_index(project, "iso_room") == 0);
    assert(gbs::find_isometric_resource_bank_group_index(project, "missing") == -1);
    gbs::ResourceBankGroup named_group = gbs::resource_bank_group_from_isometric_project(project, "iso_room");
    assert(named_group.name == groups[0].name);
    assert(named_group.bank_count == 2);
    assert(gbs::resource_bank_group_from_isometric_project(project, "missing").bank_count == 0);
    assert(gbs::resource_bank_group_name_for_isometric_room(rooms[0]) == rooms[0].resource_bank_group_name);
    assert(gbs::find_isometric_room_resource_bank_group_index(project, rooms[0]) == 0);
    assert(gbs::resource_bank_group_from_isometric_room(project, rooms[0]).banks == banks);
    gbs::IsometricRoomData fallback_room = rooms[0];
    fallback_room.name = "iso_room";
    fallback_room.resource_bank_group_name = nullptr;
    assert(gbs::resource_bank_group_name_for_isometric_room(fallback_room) == fallback_room.name);
    assert(gbs::find_isometric_room_resource_bank_group_index(project, fallback_room) == 0);
}

void test_isometric_save_data_roundtrip() {
    const uint8_t visual[] = { 0, 1, 1, 0 };
    const uint8_t collision[] = { 0, gbs::IsoTileBlocked, 0, 0 };
    const gbs::IsoActor initial_actors[] = {
        gbs::IsoActor { gbs::IsoCoord { 0, 0, 0 }, gbs::Vec2i { -8, -16 }, 0, 0, true, false, 0 }
    };
    const gbs::IsometricRoomData rooms[] = {
        gbs::IsometricRoomData {
            visual,
            collision,
            2,
            2,
            initial_actors,
            1,
            gbs::default_iso_grid_config(),
            gbs::IsoCamera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 256, 160 }, true },
            "iso_a"
        },
        gbs::IsometricRoomData {
            visual,
            collision,
            2,
            2,
            initial_actors,
            1,
            gbs::default_iso_grid_config(),
            gbs::IsoCamera { gbs::Vec2i { 8, 4 }, gbs::Rect { 0, 0, 256, 160 }, true },
            "iso_b"
        }
    };
    const gbs::IsometricProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        rooms,
        2,
        0,
        0
    };

    gbs::IsoActor actors[] = {
        gbs::IsoActor { gbs::IsoCoord { 1, 1, 0 }, gbs::Vec2i { -8, -16 }, 4, 1, true, false, 0 },
        gbs::IsoActor { gbs::IsoCoord { 2, 1, 0 }, gbs::Vec2i { -8, -16 }, 8, 2, false, true, 1 }
    };
    actors[0].position_x256 = 1 * gbs::iso_position_scale + 128;
    actors[0].position_y256 = 1 * gbs::iso_position_scale + 64;
    actors[0].position_initialized = true;
    gbs::IsoCamera camera { gbs::Vec2i { 12, 18 }, gbs::Rect { 0, 0, 256, 160 }, true };
    camera.zoom_x256 = 448;
    camera.target_zoom_x256 = 512;
    camera.pan_offset_pixels = gbs::Vec2i { 6, -3 };
    gbs::EventState event_state;
    gbs::init_event_state(event_state);
    event_state.variables[4] = 55;
    event_state.variables[gbs::event_variable_count - 1] = 904;
    gbs::IsoCursorState cursor = gbs::iso_cursor_from_tile(gbs::IsoCoord { 2, 0, 0 }, true);

    gbs::IsometricSaveData save_data {};
    size_t saved_count = gbs::capture_isometric_save_data(save_data, 1, actors, 2, camera, 2400, 3, &cursor);
    assert(saved_count == 2);
    assert(gbs::is_valid_isometric_save_data(project, save_data));
    assert(save_data.room_index == 1);
    assert(save_data.actor_count == 2);
    assert(save_data.actors[1].visible == 0);
    assert(save_data.actors[1].hflip == 1);
    assert(save_data.camera_zoom_x256 == 448);
    assert(save_data.camera_target_zoom_x256 == 512);
    assert(save_data.camera_pan_x == 6);
    assert(save_data.camera_pan_y == -3);
    assert(save_data.player_position_sub_x256 == 128);
    assert(save_data.player_position_sub_y256 == 64);
    assert(save_data.player_position_initialized == 1);
    assert(save_data.cursor_tile_x == 2);
    assert(save_data.cursor_tile_y == 0);
    assert(save_data.cursor_active == 1);

    gbs::IsoActor restored_actors[2] = {};
    size_t restored_actor_count = 0;
    gbs::IsoCamera restored_camera { gbs::Vec2i { 0, 0 }, gbs::Rect { 0, 0, 256, 160 }, true };
    gbs::EventState restored_event_state;
    gbs::init_event_state(restored_event_state);
    gbs::IsoCursorState restored_cursor = gbs::iso_cursor_from_tile(gbs::IsoCoord { 0, 0, 0 });
    assert(gbs::apply_isometric_save_data(project, save_data, restored_actors, 2, restored_actor_count, restored_camera, restored_event_state, &restored_cursor));
    assert(restored_actor_count == 2);
    assert(restored_event_state.current_room == 1);
    assert(restored_event_state.player_x == 1);
    assert(restored_camera.position_pixels.x == 12);
    assert(restored_camera.zoom_x256 == 448);
    assert(restored_camera.target_zoom_x256 == 512);
    assert(restored_camera.pan_offset_pixels.x == 6);
    assert(restored_camera.pan_offset_pixels.y == -3);
    assert(restored_actors[1].tile.x == 2);
    assert(!restored_actors[1].visible);
    assert(restored_actors[1].hflip);
    assert(restored_actors[0].position_x256 == 1 * gbs::iso_position_scale + 128);
    assert(restored_actors[0].position_y256 == 1 * gbs::iso_position_scale + 64);
    assert(restored_actors[0].position_initialized);
    assert(restored_cursor.tile.x == 2);
    assert(restored_cursor.tile.y == 0);
    assert(restored_cursor.active);
    gbs::IsometricSaveData invalid_zoom_save = save_data;
    invalid_zoom_save.camera_zoom_x256 = 0;
    assert(!gbs::is_valid_isometric_save_data(project, invalid_zoom_save));
    assert(!gbs::apply_isometric_save_data(project, save_data, restored_actors, 1, restored_actor_count, restored_camera, restored_event_state));

    gbs::IsometricSaveData empty_save_data {};
    assert(gbs::capture_isometric_save_data(empty_save_data, 0, nullptr, 2, camera) == 0);
    assert(empty_save_data.actor_count == 0);
}

void test_room_event_script_lookup() {
    const gbs::EventCommand portal_script[] = {
        { gbs::EventOp::ShowDialogue, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::TopDownPortalEventData portal_events[] = {
        { 1, gbs::EventScript { portal_script, 2 } }
    };
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::TopDownRoomData room {
        visual,
        collision,
        1,
        1,
        nullptr,
        0,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        portal_events,
        1,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        gbs::default_room_metadata()
    };

    gbs::EventScript found = gbs::portal_event_script_for(room, 1);
    gbs::EventScript missing = gbs::portal_event_script_for(room, 0);

    assert(gbs::has_event_script(found));
    assert(found.commands[0].op == gbs::EventOp::ShowDialogue);
    assert(!gbs::has_event_script(missing));
}

void test_interaction_script_lookup() {
    const gbs::EventCommand interaction_script[] = {
        { gbs::EventOp::ShowDialogue, 4, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::TopDownInteractionData interactions[] = {
        { gbs::Rect { 8, 8, 16, 16 }, gbs::EventScript { interaction_script, 2 } }
    };
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::TopDownRoomData room {
        visual,
        collision,
        1,
        1,
        nullptr,
        0,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::empty_event_script(),
        interactions,
        1,
        nullptr,
        0,
        gbs::default_room_metadata()
    };
    gbs::Actor player_in_range { gbs::Vec2i { 12, 12 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::Actor player_out_of_range { gbs::Vec2i { 40, 40 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::EventScript found = gbs::interaction_event_script_for(room, player_in_range);
    gbs::EventScript missing = gbs::interaction_event_script_for(room, player_out_of_range);

    assert(gbs::has_event_script(found));
    assert(found.commands[0].op == gbs::EventOp::ShowDialogue);
    assert(!gbs::has_event_script(missing));
}

void test_npc_script_lookup() {
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::EventCommand npc_script[] = {
        { gbs::EventOp::SetVariable, 1, 7, 0 },
        { gbs::EventOp::ShowDialogue, 6, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::TopDownNpcData npcs[] = {
        {
            gbs::Vec2i { 16, 16 },
            gbs::Vec2i { 16, 16 },
            &metasprite,
            nullptr,
            gbs::EventScript { npc_script, 3 }
        }
    };
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::TopDownRoomData room {
        visual,
        collision,
        1,
        1,
        nullptr,
        0,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::empty_event_script(),
        nullptr,
        0,
        npcs,
        1,
        gbs::default_room_metadata()
    };
    gbs::Actor npc_actor = gbs::actor_from_npc(npcs[0]);
    gbs::TopDownNpcData hitbox_npc {};
    hitbox_npc.position_pixels = gbs::Vec2i { 16, 32 };
    hitbox_npc.size_pixels = gbs::Vec2i { 47, 39 };
    hitbox_npc.collision_offset_pixels = gbs::Vec2i { -21, -31 };
    gbs::Actor hitbox_actor = gbs::actor_from_npc(hitbox_npc);
    gbs::Actor player_in_range { gbs::Vec2i { 20, 20 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::Actor player_out_of_range { gbs::Vec2i { 40, 40 }, gbs::Vec2i { 8, 8 }, 1 };

    gbs::EventScript found = gbs::npc_event_script_for(room, player_in_range);
    gbs::EventScript missing = gbs::npc_event_script_for(room, player_out_of_range);

    assert(npc_actor.position_pixels.x == 16);
    assert(npc_actor.size_pixels.x == 16);
    assert(npc_actor.direction == static_cast<uint8_t>(gbs::TopDownActorDirection::Down));
    assert(hitbox_actor.size_pixels.x == 47);
    assert(hitbox_actor.size_pixels.y == 39);
    assert(hitbox_actor.collision_offset_pixels.x == -21);
    assert(hitbox_actor.collision_offset_pixels.y == -31);
    assert(gbs::has_event_script(found));
    assert(found.commands[0].op == gbs::EventOp::SetVariable);
    assert(!gbs::has_event_script(missing));
}

void test_background_helpers() {
    const uint16_t entries[] = { 0, 1, 2, 3 };
    const uint16_t wide_entries[65] = {};
    const gbs::Rle16Run runs[] = {
        { 4, 4 }
    };
    const gbs::Rle16TileMapAsset compressed {
        gbs::Rle16Asset { runs, 1, 4 },
        2,
        2
    };
    const gbs::TopDownBackgroundData background {
        gbs::BackgroundLayer::BG1,
        gbs::TileMapAsset { entries, 2, 2 },
        &compressed,
        gbs::Vec2i { 2, 3 },
        gbs::Vec2i { 128, 64 }
    };

    assert(gbs::background_uses_compressed_tilemap(background));
    assert(gbs::is_valid_topdown_background_data(background));
    gbs::BackgroundParallax parallax = gbs::parallax_from_background(background);
    assert(parallax.layer == gbs::BackgroundLayer::BG1);
    assert(parallax.factor_x_256 == 128);
    assert(parallax.factor_y_256 == 64);
    assert(parallax.offset_pixels.x == 2);

    const gbs::TopDownBackgroundData invalid_background {
        gbs::BackgroundLayer::BG1,
        gbs::TileMapAsset { nullptr, 0, 0 },
        nullptr,
        gbs::Vec2i { 0, 0 },
        gbs::Vec2i { 256, 256 }
    };
    assert(!gbs::is_valid_topdown_background_data(invalid_background));

    const gbs::TopDownBackgroundData wide_streaming_background {
        gbs::BackgroundLayer::BG2,
        gbs::TileMapAsset { wide_entries, 65, 1 },
        nullptr,
        gbs::Vec2i { 0, 0 },
        gbs::Vec2i { 256, 256 }
    };
    assert(gbs::is_valid_topdown_background_data(wide_streaming_background));
}

void test_topdown_render_cost_excludes_foreign_8bpp_backgrounds() {
    const uint8_t tiles[64] = {};
    const gbs::TileAsset foreign_bg { tiles, 1, 0, false, gbs::ColorDepth::Bpp8 };
    const gbs::TileAsset local_bg { tiles, 1, 0, false, gbs::ColorDepth::Bpp4 };
    const gbs::TileAsset local_obj { tiles, 1, 0, true, gbs::ColorDepth::Bpp8 };
    const gbs::TileAsset invalid_local_bg { nullptr, 1, 0, false, gbs::ColorDepth::Bpp4 };

    const gbs::RenderAssetCost excluded = gbs::estimate_topdown_project_tile_asset_cost(foreign_bg, true);
    assert(excluded.valid && excluded.tile_bytes == 0 && excluded.bg_tiles == 0);
    assert(!gbs::estimate_topdown_project_tile_asset_cost(foreign_bg, false).valid);
    assert(gbs::estimate_topdown_project_tile_asset_cost(local_bg, true).valid);
    assert(gbs::estimate_topdown_project_tile_asset_cost(local_obj, true).valid);
    assert(!gbs::estimate_topdown_project_tile_asset_cost(invalid_local_bg, true).valid);
}

void test_project_resource_bank_validation() {
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::TopDownRoomData room = [&] {
        gbs::TopDownRoomData room {
            visual,
            collision,
            1,
            1,
            nullptr,
            0,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            nullptr,
            0,
            gbs::empty_event_script(),
            nullptr,
            0,
            nullptr,
            0,
            gbs::default_room_metadata()
        };
        room.name = "topdown_alias";
        room.resource_bank_group_name = "topdown_room";
        return room;
    }();
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::ResourceBank banks[] = {
        gbs::ResourceBank { gbs::ResourcePoolKind::BgTiles, 0, 4, 1, "room_bg" },
        gbs::ResourceBank { gbs::ResourcePoolKind::OamSprites, gbs::automatic_resource_bank_start, 8, 4, "actors" }
    };
    const gbs::ResourceBankGroup groups[] = {
        gbs::ResourceBankGroup { "topdown_room", banks, 2 }
    };
    const gbs::TopDownProjectData valid {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        &room,
        1,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        gbs::TopDownActorData { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 16, 16 }, 1, &metasprite },
        gbs::Camera { gbs::Vec2i { 0, 0 }, true },
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
        0,
        banks,
        2,
        groups,
        1
    };
    const gbs::TopDownProjectData missing_banks = [](
        const gbs::TopDownRoomData* room_ptr,
        const gbs::MetaSprite* metasprite_ptr
    ) {
        gbs::TopDownProjectData project {
            nullptr,
            0,
            nullptr,
            0,
            nullptr,
            0,
            nullptr,
            0,
            room_ptr,
            1,
            nullptr,
            0,
            nullptr,
            0,
            nullptr,
            0,
            gbs::TopDownActorData { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 16, 16 }, 1, metasprite_ptr },
            gbs::Camera { gbs::Vec2i { 0, 0 }, true },
            0
        };
        project.resource_banks = nullptr;
        project.resource_bank_count = 1;
        return project;
    }(&room, &metasprite);

    assert(gbs::is_valid_topdown_resource_banks(valid));
    assert(gbs::is_valid_topdown_resource_bank_groups(valid));
    assert(gbs::is_valid_topdown_project_data(valid));
    assert(!gbs::is_valid_topdown_resource_banks(missing_banks));
    assert(!gbs::is_valid_topdown_project_data(missing_banks));
    gbs::TopDownProjectData missing_groups = valid;
    missing_groups.resource_bank_groups = nullptr;
    assert(!gbs::is_valid_topdown_resource_bank_groups(missing_groups));
    assert(!gbs::is_valid_topdown_project_data(missing_groups));

    gbs::ResourceBankBatch batch = gbs::resource_bank_batch_from_topdown_project(valid);
    assert(batch.banks == banks);
    assert(batch.bank_count == 2);
    gbs::ResourceBankGroup group = gbs::resource_bank_group_from_topdown_project(valid, static_cast<size_t>(0));
    assert(group.name == groups[0].name);
    assert(group.banks == banks);
    assert(group.bank_count == 2);
    assert(gbs::resource_bank_group_from_topdown_project(valid, 99).bank_count == 0);
    assert(gbs::find_topdown_resource_bank_group_index(valid, "topdown_room") == 0);
    assert(gbs::find_topdown_resource_bank_group_index(valid, "missing") == -1);
    gbs::ResourceBankGroup named_group = gbs::resource_bank_group_from_topdown_project(valid, "topdown_room");
    assert(named_group.name == groups[0].name);
    assert(named_group.bank_count == 2);
    assert(gbs::resource_bank_group_from_topdown_project(valid, "missing").bank_count == 0);
    assert(gbs::resource_bank_group_name_for_topdown_room(room) == room.resource_bank_group_name);
    assert(gbs::find_topdown_room_resource_bank_group_index(valid, room) == 0);
    assert(gbs::resource_bank_group_from_topdown_room(valid, room).banks == banks);
    gbs::TopDownRoomData fallback_room = room;
    fallback_room.name = "topdown_room";
    fallback_room.resource_bank_group_name = nullptr;
    assert(gbs::resource_bank_group_name_for_topdown_room(fallback_room) == fallback_room.name);
    assert(gbs::find_topdown_room_resource_bank_group_index(valid, fallback_room) == 0);
}

void test_room_metadata_helpers() {
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::MusicStep music_step[] = {
        { 220, 8, 4, 1 }
    };
    const gbs::MusicAsset music[] = {
        { music_step, 1, true }
    };
    const gbs::TopDownRoomMetadata metadata {
        gbs::TopDownCameraMode::Fixed,
        gbs::Vec2i { 24, 32 },
        true,
        gbs::Vec2i { 8, 16 },
        true,
        0,
        false,
        true,
        0x1234,
        true,
        gbs::Rect { 8, 16, 256, 160 }
    };
    const gbs::TopDownRoomData room {
        visual,
        collision,
        1,
        1,
        nullptr,
        0,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        metadata
    };
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::TopDownProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        &room,
        1,
        nullptr,
        0,
        nullptr,
        0,
        music,
        1,
        gbs::TopDownActorData { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 16, 16 }, 1, &metasprite },
        gbs::Camera { gbs::Vec2i { 1, 2 }, true },
        0x001F
    };

    gbs::Camera camera = gbs::camera_from_room_metadata(project, room);
    assert(!camera.follow_player);
    assert(camera.position_pixels.x == 24);
    assert(camera.bounds_enabled);
    assert(camera.bounds_pixels.x == 8);
    assert(gbs::room_has_player_start(room));
    assert(gbs::room_has_valid_music(project, room));
    assert(gbs::backdrop_color_for_room(project, room) == 0x1234);
}

void test_trigger_state_enter_leave_cooldown_and_run_once() {
    const gbs::EventCommand enter_commands[] = {
        { gbs::EventOp::ShowDialogue, 1, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventCommand leave_commands[] = {
        { gbs::EventOp::ShowDialogue, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::TopDownTriggerData trigger {
        gbs::Rect { 16, 16, 16, 16 },
        gbs::EventScript { enter_commands, 2 },
        gbs::EventScript { leave_commands, 2 },
        true,
        3,
        gbs::empty_event_script(),
        gbs::TopDownTriggerKind::Standard
    };
    gbs::TopDownTriggerState state;
    gbs::Actor outside { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::Actor inside { gbs::Vec2i { 20, 20 }, gbs::Vec2i { 8, 8 }, 1 };

    assert(gbs::update_trigger_state(trigger, state, outside) == gbs::TopDownTriggerResult::None);
    gbs::TopDownTriggerResult enter = gbs::update_trigger_state(trigger, state, inside);
    assert(enter == gbs::TopDownTriggerResult::Enter);
    assert(gbs::trigger_event_script_for_result(trigger, enter).commands == enter_commands);
    assert(state.fired);
    assert(state.cooldown_remaining == 3);

    gbs::TopDownTriggerResult leave = gbs::update_trigger_state(trigger, state, outside);
    assert(leave == gbs::TopDownTriggerResult::Leave);
    assert(gbs::trigger_event_script_for_result(trigger, leave).commands == leave_commands);

    assert(gbs::update_trigger_state(trigger, state, inside) == gbs::TopDownTriggerResult::None);
}

void test_actor_runtime_commands_and_interaction() {
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::SpriteAnimationFrame idle_frames[] = {
        { metasprite, 5 }
    };
    const gbs::SpriteAnimation idle_animation { idle_frames, 1, true };
    const gbs::SpriteAnimationFrame wave_frames[] = {
        { metasprite, 7 }
    };
    const gbs::SpriteAnimation wave_animation { wave_frames, 1, false };
    const gbs::SpriteAnimation* npc_animations[] = {
        &idle_animation,
        &wave_animation
    };
    const gbs::EventCommand npc_script[] = {
        { gbs::EventOp::ShowDialogue, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::TopDownNpcData npcs[] = {
        {
            gbs::Vec2i { 16, 16 },
            gbs::Vec2i { 16, 16 },
            &metasprite,
            &idle_animation,
            gbs::EventScript { npc_script, 2 },
            "npc",
            gbs::TopDownActorDirection::Left,
            2
        }
    };
    npcs[0].animations = npc_animations;
    npcs[0].animation_count = 2;
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::TopDownRoomData room {
        visual,
        collision,
        1,
        1,
        nullptr,
        0,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::empty_event_script(),
        nullptr,
        0,
        npcs,
        1,
        gbs::default_room_metadata()
    };

    gbs::TopDownActorRuntime runtime = gbs::actor_runtime_from_npc(npcs[0]);
    assert(runtime.visible);
    assert(runtime.active);
    assert(runtime.actor.direction == static_cast<uint8_t>(gbs::TopDownActorDirection::Left));
    assert(runtime.actor.collision_group == 2);
    assert(runtime.actor.collision_mask == 0xFFFFu);

    gbs::Actor player { gbs::Vec2i { 20, 20 }, gbs::Vec2i { 8, 8 }, 1 };
    gbs::EventScript found = gbs::actor_runtime_interaction_script_for(room, &runtime, 1, player);
    assert(gbs::has_event_script(found));

    gbs::Actor adjacent_player {
        gbs::Vec2i { 32, 16 },
        gbs::Vec2i { 16, 16 },
        1,
        static_cast<uint8_t>(gbs::TopDownActorDirection::Left)
    };
    gbs::EventScript adjacent_found = gbs::actor_runtime_interaction_script_for(
        room,
        &runtime,
        1,
        adjacent_player
    );
    assert(gbs::has_event_script(adjacent_found));

    adjacent_player.direction = static_cast<uint8_t>(gbs::TopDownActorDirection::Right);
    gbs::EventScript adjacent_wrong_direction = gbs::actor_runtime_interaction_script_for(
        room,
        &runtime,
        1,
        adjacent_player
    );
    assert(!gbs::has_event_script(adjacent_wrong_direction));

    gbs::EventActorCommand commands[] = {
        { gbs::EventActorOp::MoveRelative, 0, 16, 0 },
        { gbs::EventActorOp::SetVisible, 0, 0, 0 },
        { gbs::EventActorOp::SetActive, 0, 0, 0 },
        { gbs::EventActorOp::SetDirection, 0, 3, 0 },
        { gbs::EventActorOp::SetSpeed, 0, 200, 0 },
        { gbs::EventActorOp::SetSprite, 0, 2, 0 },
        { gbs::EventActorOp::SetAnimation, 0, 1, 0 },
        { gbs::EventActorOp::SetAnimationSpeed, 0, 175, 0 },
        { gbs::EventActorOp::SetAnimationFrame, 0, 2, 0 },
        { gbs::EventActorOp::SetCollisionEnabled, 0, 0, 0 }
    };
    for (const gbs::EventActorCommand& command : commands) {
        gbs::apply_actor_event_command(&runtime, 1, command);
    }

    assert(runtime.actor.position_pixels.x == 32);
    assert(!runtime.visible);
    assert(!runtime.active);
    assert(runtime.actor.direction == 3);
    assert(runtime.actor.speed_pixels == 2);
    assert(runtime.movement_speed_x100 == 200);
    assert(runtime.animation_index == 1);
    assert(runtime.sprite_index == 2);
    assert(runtime.animation_speed_percent == 175);
    assert(runtime.animation_frame_changed);
    assert(runtime.animation_frame_index == 2);
    assert(runtime.actor.collision_mask == 0);
    assert(gbs::topdown_npc_animation_for_index(npcs[0], runtime.animation_index) == &wave_animation);
    assert(gbs::topdown_npc_animation_for_index(npcs[0], 99) == &idle_animation);
    assert(!gbs::has_event_script(gbs::actor_runtime_interaction_script_for(room, &runtime, 1, player)));
}

void test_actor_runtime_command_batch_consumes_event_state() {
    gbs::TopDownActorRuntime runtimes[] = {
        {
            gbs::Actor { gbs::Vec2i { 10, 20 }, gbs::Vec2i { 16, 16 }, 1 },
            nullptr,
            nullptr,
            true,
            true,
            0,
            100,
            false,
            0
        },
        {
            gbs::Actor { gbs::Vec2i { 30, 40 }, gbs::Vec2i { 16, 16 }, 1 },
            nullptr,
            nullptr,
            true,
            true,
            0,
            100,
            false,
            0
        }
    };
    gbs::EventState state;
    state = gbs::EventState {};
    gbs::reset_event_actor_commands(state);
    state.actor_commands[0] = gbs::EventActorCommand { gbs::EventActorOp::MoveRelative, 0, 4, -2 };
    state.actor_commands[1] = gbs::EventActorCommand { gbs::EventActorOp::SetActive, 1, 0, 0 };
    state.actor_commands[2] = gbs::EventActorCommand { gbs::EventActorOp::SetPosition, 7, 99, 99 };
    state.actor_command_count = 3;

    size_t applied = gbs::consume_actor_event_commands(runtimes, 2, state);

    assert(applied == 2);
    assert(runtimes[0].actor.position_pixels.x == 14);
    assert(runtimes[0].actor.position_pixels.y == 18);
    assert(!runtimes[1].active);
    assert(state.actor_command_count == 0);
    assert(state.actor_commands[0].op == gbs::EventActorOp::None);
}

void test_actor_runtime_ai_patrol_respects_bounds() {
    const uint8_t collision[] = {
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0,
        0, 0, 0, 0, 0, 0
    };
    gbs::TileMap map { collision, 6, 3 };
    gbs::TopDownNpcData npc {};
    npc.position_pixels = gbs::Vec2i { 23, 8 };
    npc.size_pixels = gbs::Vec2i { 8, 8 };
    npc.movement_speed_x100 = 100;
    npc.movement = gbs::TopDownNpcMovementData {
        gbs::TopDownNpcMovementKind::PatrolHorizontal,
        gbs::Rect { 16, 8, 16, 8 },
        gbs::Vec2i { 0, 0 },
        16,
        1
    };
    gbs::TopDownActorRuntime runtime = gbs::actor_runtime_from_npc(npc);
    gbs::Actor player { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 8, 8 }, 1 };

    assert(gbs::update_actor_runtime_ai(npc, runtime, map, player));
    assert(runtime.actor.position_pixels.x == 24);
    assert(runtime.movement_phase == 0);

    assert(!gbs::update_actor_runtime_ai(npc, runtime, map, player));
    assert(runtime.actor.position_pixels.x == 24);
    assert(runtime.movement_phase == 1);

    assert(gbs::update_actor_runtime_ai(npc, runtime, map, player));
    assert(runtime.actor.position_pixels.x == 23);
    assert(runtime.actor.direction == 2);
}

void test_actor_runtime_ai_preserves_subpixel_speed_cadence() {
    const uint8_t collision[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    };
    gbs::TileMap map { collision, 4, 3 };
    gbs::TopDownNpcData npc {};
    npc.position_pixels = gbs::Vec2i { 8, 8 };
    npc.size_pixels = gbs::Vec2i { 8, 8 };
    npc.movement_speed_x100 = 50;
    npc.movement = gbs::TopDownNpcMovementData {
        gbs::TopDownNpcMovementKind::PatrolHorizontal,
        gbs::Rect { 0, 0, 32, 24 },
        gbs::Vec2i { 0, 0 },
        16,
        1
    };
    gbs::TopDownActorRuntime runtime = gbs::actor_runtime_from_npc(npc);
    gbs::Actor player { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 8, 8 }, 1 };

    assert(!gbs::update_actor_runtime_ai(npc, runtime, map, player));
    assert(runtime.actor.position_pixels.x == 8);
    assert(gbs::update_actor_runtime_ai(npc, runtime, map, player));
    assert(runtime.actor.position_pixels.x == 9);
}

void test_actor_runtime_ai_follow_player_uses_pathfinding() {
    const uint8_t collision[] = {
        1, 1, 1, 1, 1,
        1, 0, 1, 0, 1,
        1, 0, 0, 0, 1,
        1, 1, 1, 1, 1
    };
    gbs::TileMap map { collision, 5, 4 };
    gbs::TopDownNpcData npc {};
    npc.position_pixels = gbs::Vec2i { 8, 8 };
    npc.size_pixels = gbs::Vec2i { 8, 8 };
    npc.movement_speed_x100 = 100;
    npc.movement = gbs::TopDownNpcMovementData {
        gbs::TopDownNpcMovementKind::FollowPlayer,
        gbs::Rect { 0, 0, 0, 0 },
        gbs::Vec2i { 0, 0 },
        16,
        1
    };
    gbs::TopDownActorRuntime runtime = gbs::actor_runtime_from_npc(npc);
    gbs::Actor player { gbs::Vec2i { 24, 8 }, gbs::Vec2i { 8, 8 }, 1 };

    assert(gbs::update_actor_runtime_ai(npc, runtime, map, player));
    assert(runtime.actor.position_pixels.x == 8);
    assert(runtime.actor.position_pixels.y == 9);
    assert(runtime.actor.direction == 0);
}

void test_actor_runtime_ai_respects_blocking_actors() {
    const uint8_t collision[] = {
        0, 0, 0, 0,
        0, 0, 0, 0,
        0, 0, 0, 0
    };
    gbs::TileMap map { collision, 4, 3 };
    gbs::TopDownNpcData npc {};
    npc.position_pixels = gbs::Vec2i { 8, 8 };
    npc.size_pixels = gbs::Vec2i { 8, 8 };
    npc.movement_speed_x100 = 100;
    npc.movement = gbs::TopDownNpcMovementData {
        gbs::TopDownNpcMovementKind::PatrolHorizontal,
        gbs::Rect { 0, 0, 32, 24 },
        gbs::Vec2i { 0, 0 },
        16,
        1
    };
    gbs::TopDownActorRuntime runtime = gbs::actor_runtime_from_npc(npc);
    gbs::Actor player { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 8, 8 }, 1 };
    const gbs::Actor blockers[] = {
        { gbs::Vec2i { 16, 8 }, gbs::Vec2i { 8, 8 }, 1 }
    };

    assert(!gbs::update_actor_runtime_ai(npc, runtime, map, player, blockers, 1));
    assert(runtime.actor.position_pixels.x == 8);
    assert(runtime.movement_phase == 1);
}

void test_project_script_index_validation() {
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::TopDownRoomData room {
        visual,
        collision,
        1,
        1,
        nullptr,
        0,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        gbs::default_room_metadata()
    };
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::PlaySfx, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventScript scripts[] = {
        { commands, 2 }
    };
    const gbs::TopDownProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        &room,
        1,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        gbs::TopDownActorData { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 16, 16 }, 1, &metasprite },
        gbs::Camera { gbs::Vec2i { 0, 0 }, true },
        0,
        scripts,
        1
    };

    assert(gbs::is_valid_project_script_index(project, 0));
    assert(!gbs::is_valid_project_script_index(project, -1));
    assert(!gbs::is_valid_project_script_index(project, 1));
}

void test_stable_name_lookup_helpers() {
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::EventCommand npc_commands[] = {
        { gbs::EventOp::ShowDialogue, 1, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::TopDownNpcData npcs[] = {
        {
            gbs::Vec2i { 8, 8 },
            gbs::Vec2i { 16, 16 },
            &metasprite,
            nullptr,
            gbs::EventScript { npc_commands, 2 },
            "guide"
        }
    };
    const gbs::TopDownRoomData rooms[] = {
        {
            visual,
            collision,
            1,
            1,
            nullptr,
            0,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            nullptr,
            0,
            gbs::empty_event_script(),
            nullptr,
            0,
            npcs,
            1,
            gbs::default_room_metadata(),
            nullptr,
            0,
            nullptr,
            0,
            "start"
        }
    };
    const gbs::EventCommand named_commands[] = {
        { gbs::EventOp::PlaySfx, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::TopDownNamedScriptData named_scripts[] = {
        { "choice_yes", gbs::EventScript { named_commands, 2 } }
    };
    const gbs::TopDownProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        rooms,
        1,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        gbs::TopDownActorData { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 16, 16 }, 1, &metasprite },
        gbs::Camera { gbs::Vec2i { 0, 0 }, true },
        0,
        nullptr,
        0,
        nullptr,
        0,
        named_scripts,
        1
    };

    assert(gbs::string_equals("start", "start"));
    assert(!gbs::string_equals("start", "other"));
    assert(!gbs::string_equals(nullptr, "start"));
    assert(gbs::find_room_index_by_name(project, "start") == 0);
    assert(gbs::find_room_index_by_name(project, "missing") == -1);
    assert(gbs::find_npc_index_by_name(rooms[0], "guide") == 0);
    assert(gbs::find_npc_index_by_name(rooms[0], "missing") == -1);
    assert(gbs::find_named_script_index(project, "choice_yes") == 0);
    assert(gbs::find_named_script_index(project, "missing") == -1);
    assert(gbs::named_script_for(project, "choice_yes").commands[0].op == gbs::EventOp::PlaySfx);
    assert(!gbs::has_event_script(gbs::named_script_for(project, "missing")));
}

void test_dialogue_choice_index_validation() {
    const uint16_t visual[] = { 0 };
    const uint8_t collision[] = { 0 };
    const gbs::TopDownRoomData room {
        visual,
        collision,
        1,
        1,
        nullptr,
        0,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr,
        0,
        gbs::empty_event_script(),
        nullptr,
        0,
        nullptr,
        0,
        gbs::default_room_metadata()
    };
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::MetaSprite metasprite { parts, 1 };
    const gbs::DialogueChoice choices[] = {
        { "SIM", 1 },
        { "NAO", 2 }
    };
    const gbs::TopDownDialogueChoiceData choice_groups[] = {
        { 0, choices, 2, 3 }
    };
    const gbs::TopDownProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        &room,
        1,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        gbs::TopDownActorData { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 16, 16 }, 1, &metasprite },
        gbs::Camera { gbs::Vec2i { 0, 0 }, true },
        0,
        nullptr,
        0,
        choice_groups,
        1
    };

    assert(gbs::is_valid_dialogue_choice_index(project, 0));
    assert(!gbs::is_valid_dialogue_choice_index(project, -1));
    assert(!gbs::is_valid_dialogue_choice_index(project, 1));
}

void test_tile_effect_event_state_enter_leave_cooldown_and_run_once() {
    const gbs::EventCommand enter_commands[] = {
        { gbs::EventOp::ShowDialogue, 1, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventCommand leave_commands[] = {
        { gbs::EventOp::ShowDialogue, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::TopDownTileEffectEventData effect_event {
        gbs::TileWater,
        gbs::EventScript { enter_commands, 2 },
        gbs::EventScript { leave_commands, 2 },
        true,
        2
    };
    gbs::TopDownTriggerState state;

    gbs::TopDownTriggerResult enter = gbs::update_tile_effect_state(effect_event, state, gbs::TileWater);
    assert(enter == gbs::TopDownTriggerResult::Enter);
    assert(gbs::tile_effect_event_script_for_result(effect_event, enter).commands[0].op == gbs::EventOp::ShowDialogue);

    assert(gbs::update_tile_effect_state(effect_event, state, gbs::TileWater) == gbs::TopDownTriggerResult::None);
    gbs::TopDownTriggerResult leave = gbs::update_tile_effect_state(effect_event, state, gbs::TileEmpty);
    assert(leave == gbs::TopDownTriggerResult::Leave);
    assert(gbs::tile_effect_event_script_for_result(effect_event, leave).commands[0].a == 2);

    assert(gbs::update_tile_effect_state(effect_event, state, gbs::TileWater) == gbs::TopDownTriggerResult::None);
    assert(state.inside);
}

} // namespace

void test_authored_movement_cancellation() {
 gbs::TopDownActorRuntime actor{};
 actor.active=true; actor.visible=true; actor.movement_speed_x100=150; actor.movement_step_accumulator=90;
 gbs::apply_actor_event_command(&actor,1,{gbs::EventActorOp::CancelMovement,0,0,0});
 assert(actor.movement_cancelled && actor.movement_step_accumulator==0);
 gbs::apply_actor_event_command(&actor,1,{gbs::EventActorOp::SetSpeed,0,150,0});
 assert(!actor.movement_cancelled && actor.movement_speed_x100==150);
 gbs::EventPlayerRuntimeState player{true,0,0,0};
 player.movement_step_accumulator=75;
 assert(gbs::apply_event_player_command(player,{gbs::EventActorOp::CancelMovement,-1,0,0}));
 assert(gbs::consume_event_player_movement_step(player,true)==0);
 assert(gbs::consume_event_player_movement_step(player,true)==1);
}

int main() {
    test_authored_movement_cancellation();
    test_room_conversion();
    test_actor_conversion();
    test_player_actor_runtime_uses_animation_data();
    test_project_validation();
    test_platformer_project_data_contract();
    test_platformer_project_resource_bank_validation();
    test_platformer_save_data_roundtrip();
    test_isometric_project_data_contract();
    test_isometric_project_resource_bank_validation();
    test_isometric_save_data_roundtrip();
    test_room_event_script_lookup();
    test_interaction_script_lookup();
    test_npc_script_lookup();
    test_background_helpers();
    test_topdown_render_cost_excludes_foreign_8bpp_backgrounds();
    test_project_resource_bank_validation();
    test_room_metadata_helpers();
    test_trigger_state_enter_leave_cooldown_and_run_once();
    test_actor_runtime_commands_and_interaction();
    test_actor_runtime_command_batch_consumes_event_state();
    test_actor_runtime_ai_patrol_respects_bounds();
    test_actor_runtime_ai_preserves_subpixel_speed_cadence();
    test_actor_runtime_ai_follow_player_uses_pathfinding();
    test_actor_runtime_ai_respects_blocking_actors();
    test_project_script_index_validation();
    test_stable_name_lookup_helpers();
    test_dialogue_choice_index_validation();
    test_tile_effect_event_state_enter_leave_cooldown_and_run_once();
    return 0;
}
