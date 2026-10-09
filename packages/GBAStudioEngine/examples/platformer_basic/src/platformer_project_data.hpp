#pragma once

#include "gbs/engine.hpp"
#include "gbs/render.hpp"

namespace gbastudio_platformer_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveBank save_bank {
    0,
    1024,
    1,
    gbs::make_save_signature('G', 'B', 'P', 'F'),
    1
};

constexpr int room_w = 64;
constexpr int room_h = 32;
constexpr int tile_count = room_w * room_h;

template <int Count>
struct ByteTiles {
    uint8_t values[Count];
};

template <int Count>
struct WordTiles {
    uint16_t values[Count];
};

constexpr bool is_floor(int, int y) {
    return y >= 20;
}

constexpr bool is_wall(int x, int) {
    return x == 0 || x == room_w - 1;
}

constexpr bool is_one_way_platform(int x, int y) {
    return y == 14 && x >= 10 && x <= 22;
}

constexpr bool is_ladder(int x, int y) {
    return x == 30 && y >= 11 && y <= 20;
}

constexpr bool is_hazard(int x, int y) {
    return y == 19 && x >= 42 && x <= 48;
}

constexpr uint8_t visual_tile_for(int x, int y) {
    if (is_hazard(x, y)) {
        return 3;
    }
    if (is_floor(x, y) || is_wall(x, y)) {
        return 2;
    }
    if (is_one_way_platform(x, y)) {
        return 3;
    }
    if (is_ladder(x, y)) {
        return 1;
    }
    return ((x / 2 + y / 2) % 2 == 0) ? 0 : 1;
}

constexpr uint8_t collision_tile_for(int x, int y) {
    uint8_t flags = gbs::TileEmpty;
    if (is_floor(x, y) || is_wall(x, y)) {
        flags |= gbs::TileSolid;
    }
    if (is_one_way_platform(x, y)) {
        flags |= gbs::TileBlockTop;
    }
    if (is_ladder(x, y)) {
        flags |= gbs::TileLadder;
    }
    return flags;
}

constexpr WordTiles<tile_count> make_visual_tiles() {
    WordTiles<tile_count> tiles {};
    for (int y = 0; y < room_h; ++y) {
        for (int x = 0; x < room_w; ++x) {
            tiles.values[y * room_w + x] = visual_tile_for(x, y);
        }
    }
    return tiles;
}

constexpr ByteTiles<tile_count> make_collision_tiles() {
    ByteTiles<tile_count> tiles {};
    for (int y = 0; y < room_h; ++y) {
        for (int x = 0; x < room_w; ++x) {
            tiles.values[y * room_w + x] = collision_tile_for(x, y);
        }
    }
    return tiles;
}

constexpr WordTiles<tile_count> visual_tiles = make_visual_tiles();
constexpr ByteTiles<tile_count> collision_tiles = make_collision_tiles();

constexpr uint16_t bg_palette[] = {
    0x0000,
    0x4210,
    0x03FF,
    0x021F,
    0x7FFF,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000
};

constexpr uint16_t obj_palette[] = {
    0x0000,
    0x7C00,
    0x001F,
    0x03E0,
    0x7FFF,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000,
    0x0000
};

alignas(2) constexpr uint8_t bg_tiles[4][32] = {
    { 0 },
    {
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11
    },
    {
        0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22,
        0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22,
        0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22,
        0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22, 0x22
    },
    {
        0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
        0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
        0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
        0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33
    }
};

alignas(2) constexpr uint8_t player_tiles[4][32] = {
    {
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x14, 0x44, 0x44, 0x41, 0x14, 0x44, 0x44, 0x41,
        0x14, 0x44, 0x44, 0x41, 0x14, 0x44, 0x44, 0x41,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11
    },
    {
        0x11, 0x11, 0x11, 0x11, 0x12, 0x22, 0x22, 0x21,
        0x12, 0x22, 0x22, 0x21, 0x12, 0x22, 0x22, 0x21,
        0x12, 0x22, 0x22, 0x21, 0x12, 0x22, 0x22, 0x21,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11
    },
    {
        0x11, 0x11, 0x11, 0x11, 0x13, 0x33, 0x33, 0x31,
        0x13, 0x33, 0x33, 0x31, 0x13, 0x33, 0x33, 0x31,
        0x13, 0x33, 0x33, 0x31, 0x13, 0x33, 0x33, 0x31,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11
    },
    {
        0x11, 0x11, 0x11, 0x11, 0x14, 0x44, 0x44, 0x41,
        0x14, 0x44, 0x44, 0x41, 0x14, 0x44, 0x44, 0x41,
        0x14, 0x44, 0x44, 0x41, 0x14, 0x44, 0x44, 0x41,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11
    }
};

constexpr gbs::PaletteAsset bg_palette_asset { bg_palette, 16, 0 };
constexpr gbs::PaletteAsset obj_palette_asset { obj_palette, 16, 0 };
const gbs::TileAsset bg_tile_asset { reinterpret_cast<const uint8_t*>(bg_tiles), 4, 0, false };
const gbs::TileAsset player_tile_asset { reinterpret_cast<const uint8_t*>(player_tiles), 4, 0, true };
const gbs::TileAsset tile_assets[] = {
    bg_tile_asset,
    player_tile_asset
};
constexpr gbs::PaletteAsset bg_palette_assets[] = {
    bg_palette_asset
};
constexpr gbs::PaletteAsset obj_palette_assets[] = {
    obj_palette_asset
};
constexpr gbs::TileMap collision_map { collision_tiles.values, room_w, room_h };
constexpr gbs::PlatformerRoom room { visual_tiles.values, collision_map, room_w, room_h };
constexpr gbs::Rect player_start { 24, 120, 16, 16 };
constexpr gbs::PlatformerHazard hazards[] = {
    gbs::PlatformerHazard { gbs::Rect { 42 * 8, 19 * 8, 7 * 8, 8 }, 1, true }
};
constexpr gbs::PlatformerCheckpoint checkpoints[] = {
    gbs::PlatformerCheckpoint { gbs::Rect { 24 * 8, 16 * 8, 16, 32 }, gbs::Vec2i { 24 * 8, 16 * 8 }, 1 }
};
constexpr gbs::PlatformerCameraZone camera_zones[] = {
    gbs::PlatformerCameraZone {
        gbs::Rect { 32 * 8, 0, 16 * 8, room_h * 8 },
        gbs::Rect { 24 * 8, 0, 24 * 8, room_h * 8 },
        gbs::Vec2i { 0, 0 },
        false,
        false
    }
};
constexpr gbs::PlatformerEnemy enemies[] = {
    gbs::PlatformerEnemy {
        gbs::Rect { 36 * 8, 18 * 8, 16, 16 },
        gbs::Rect { 34 * 8, 18 * 8, 7 * 8, 16 },
        gbs::Vec2i { 0x0100, 0 },
        true,
        true,
        1,
        0
    }
};
constexpr gbs::PlatformerMovingPlatform moving_platforms[] = {
    gbs::PlatformerMovingPlatform {
        gbs::Rect { 12 * 8, 12 * 8, 32, 8 },
        gbs::Vec2i { 12 * 8, 12 * 8 },
        gbs::Vec2i { 18 * 8, 12 * 8 },
        gbs::Vec2i { 0x0100, 0 },
        true,
        true,
        0,
        0
    }
};
constexpr gbs::EventCommand room_on_enter_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetVariable, 1, 1, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand hazard_on_hit_commands[] = {
    gbs::EventCommand { gbs::EventOp::PlaySfx, 0, 0, 0 },
    gbs::EventCommand { gbs::EventOp::Warp, 1, 24, 120 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand checkpoint_on_activate_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetVariable, 2, 1, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand camera_zone_on_enter_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetCameraPosition, 24 * 8, 0, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand second_room_on_enter_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetVariable, 3, 1, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand second_room_on_update_commands[] = {
    gbs::EventCommand { gbs::EventOp::ShowDialogueIf, 0, 3, 1 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::PlatformerHazardEventData hazard_events[] = {
    gbs::PlatformerHazardEventData { 0, gbs::EventScript { hazard_on_hit_commands, 3 } }
};
constexpr gbs::PlatformerCheckpointEventData checkpoint_events[] = {
    gbs::PlatformerCheckpointEventData { 1, gbs::EventScript { checkpoint_on_activate_commands, 2 } }
};
constexpr gbs::PlatformerCameraZoneEventData camera_zone_events[] = {
    gbs::PlatformerCameraZoneEventData { 0, gbs::EventScript { camera_zone_on_enter_commands, 2 } }
};
constexpr gbs::Camera camera_start { gbs::Vec2i { 0, 0 }, true };
constexpr gbs::PlatformerRoomData rooms[] = {
    gbs::PlatformerRoomData {
        visual_tiles.values,
        collision_tiles.values,
        nullptr,
        room_w,
        room_h,
        player_start,
        camera_start,
        gbs::default_platformer_config(),
        hazards,
        sizeof(hazards) / sizeof(hazards[0]),
        checkpoints,
        sizeof(checkpoints) / sizeof(checkpoints[0]),
        camera_zones,
        sizeof(camera_zones) / sizeof(camera_zones[0]),
        "Platformer Test Room",
        gbs::EventScript { room_on_enter_commands, 2 },
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        hazard_events,
        sizeof(hazard_events) / sizeof(hazard_events[0]),
        checkpoint_events,
        sizeof(checkpoint_events) / sizeof(checkpoint_events[0]),
        camera_zone_events,
        sizeof(camera_zone_events) / sizeof(camera_zone_events[0]),
        nullptr,
        enemies,
        sizeof(enemies) / sizeof(enemies[0]),
        moving_platforms,
        sizeof(moving_platforms) / sizeof(moving_platforms[0])
    },
    gbs::PlatformerRoomData {
        visual_tiles.values,
        collision_tiles.values,
        nullptr,
        room_w,
        room_h,
        gbs::Rect { 24, 120, 16, 16 },
        camera_start,
        gbs::default_platformer_config(),
        nullptr,
        0,
        checkpoints,
        sizeof(checkpoints) / sizeof(checkpoints[0]),
        camera_zones,
        sizeof(camera_zones) / sizeof(camera_zones[0]),
        "Platformer Warp Room",
        gbs::EventScript { second_room_on_enter_commands, 2 },
        gbs::empty_event_script(),
        gbs::EventScript { second_room_on_update_commands, 2 },
        nullptr,
        0,
        checkpoint_events,
        sizeof(checkpoint_events) / sizeof(checkpoint_events[0]),
        camera_zone_events,
        sizeof(camera_zone_events) / sizeof(camera_zone_events[0])
    }
};
const gbs::PlatformerProjectData project {
    bg_palette_assets,
    sizeof(bg_palette_assets) / sizeof(bg_palette_assets[0]),
    obj_palette_assets,
    sizeof(obj_palette_assets) / sizeof(obj_palette_assets[0]),
    tile_assets,
    sizeof(tile_assets) / sizeof(tile_assets[0]),
    rooms,
    sizeof(rooms) / sizeof(rooms[0]),
    0,
    gbs::rgb15(2, 3, 5)
};

constexpr const gbs::ResourceBankUploadSource* resource_bank_upload_sources = nullptr;
constexpr size_t resource_bank_upload_source_count = 0;

constexpr const gbs::DialoguePortraitEntry* dialogue_portrait_assets = nullptr;
constexpr size_t dialogue_portrait_asset_count = 0;

constexpr const gbs::DialogueEmoteEntry* dialogue_emote_assets = nullptr;
constexpr size_t dialogue_emote_asset_count = 0;

} // namespace gbastudio_platformer_project
