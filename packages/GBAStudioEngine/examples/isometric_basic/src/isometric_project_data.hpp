#pragma once

#include "gbs/engine.hpp"
#include "gbs/isometric.hpp"

namespace gbastudio_isometric_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveBank save_bank {
    1024,
    1024,
    1,
    gbs::make_save_signature('G', 'B', 'I', 'S'),
    1
};

constexpr int room_w = 32;
constexpr int room_h = 32;
constexpr int tile_count = room_w * room_h;

template <int Count>
struct ByteTiles {
    uint8_t values[Count];
};

constexpr gbs::IsoGridConfig grid { 32, 16, gbs::Vec2i { 120, 24 } };

constexpr bool is_blocked_tile(int x, int y) {
    return x == 0 || y == 0 || x == room_w - 1 || y == room_h - 1 || (x == 8 && y >= 4 && y <= 10);
}

constexpr ByteTiles<tile_count> make_visual_tiles() {
    ByteTiles<tile_count> tiles {};
    for (int y = 0; y < room_h; ++y) {
        for (int x = 0; x < room_w; ++x) {
            tiles.values[y * room_w + x] = is_blocked_tile(x, y) ? 2 : (((x + y) % 2 == 0) ? 1 : 2);
        }
    }
    return tiles;
}

constexpr ByteTiles<tile_count> make_collision_tiles() {
    ByteTiles<tile_count> tiles {};
    for (int y = 0; y < room_h; ++y) {
        for (int x = 0; x < room_w; ++x) {
            tiles.values[y * room_w + x] = is_blocked_tile(x, y) ? gbs::IsoTileBlocked : gbs::IsoTileEmpty;
        }
    }
    return tiles;
}

constexpr ByteTiles<tile_count> visual_tiles = make_visual_tiles();
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

alignas(2) constexpr uint8_t bg_tiles[3][32] = {
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
    }
};

alignas(2) constexpr uint8_t actor_tiles[4][32] = {
    {
        0x11, 0x11, 0x11, 0x11, 0x14, 0x44, 0x44, 0x41,
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
const gbs::TileAsset bg_tile_asset { reinterpret_cast<const uint8_t*>(bg_tiles), 3, 0, false };
const gbs::TileAsset actor_tile_asset { reinterpret_cast<const uint8_t*>(actor_tiles), 4, 0, true };
const gbs::TileAsset tile_assets[] = {
    bg_tile_asset,
    actor_tile_asset
};
constexpr gbs::PaletteAsset bg_palette_assets[] = {
    bg_palette_asset
};
constexpr gbs::PaletteAsset obj_palette_assets[] = {
    obj_palette_asset
};

constexpr gbs::IsoActor initial_actors[] = {
    { gbs::IsoCoord { 4, 4, 0 }, gbs::Vec2i { -8, -16 }, 0, 0, true, false, 0 },
    { gbs::IsoCoord { 5, 4, 0 }, gbs::Vec2i { -8, -16 }, 0, 0, true, false, 0 },
    { gbs::IsoCoord { 4, 5, 0 }, gbs::Vec2i { -8, -16 }, 0, 0, true, true, 0 }
};

constexpr gbs::IsoTileMap collision_map { collision_tiles.values, room_w, room_h };

constexpr gbs::IsoCamera camera_start {
    gbs::Vec2i { 0, 0 },
    gbs::Rect { 0, 0, 512, 256 },
    true
};
constexpr gbs::EventCommand room_on_enter_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetVariable, 1, 1, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand actor_on_interact_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetActorVisible, 2, 0, 0 },
    gbs::EventCommand { gbs::EventOp::Warp, 1, 4, 4 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand actor_on_start_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetActorVisible, 1, 1, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand actor_on_update_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetCameraPosition, 0, 0, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand tile_on_select_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetVariable, 4, 7, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::EventCommand second_iso_room_on_enter_commands[] = {
    gbs::EventCommand { gbs::EventOp::SetVariable, 3, 1, 0 },
    gbs::EventCommand { gbs::EventOp::End, 0, 0, 0 }
};
constexpr gbs::IsoActorEventData actor_interact_events[] = {
    gbs::IsoActorEventData { 1, gbs::EventScript { actor_on_interact_commands, 3 } }
};
constexpr gbs::IsoActorEventData actor_start_events[] = {
    gbs::IsoActorEventData { 1, gbs::EventScript { actor_on_start_commands, 2 } }
};
constexpr gbs::IsoActorEventData actor_update_events[] = {
    gbs::IsoActorEventData { 0, gbs::EventScript { actor_on_update_commands, 2 } }
};
constexpr gbs::IsoTileEventData tile_events[] = {
    gbs::IsoTileEventData { gbs::IsoCoord { 6, 4, 0 }, gbs::EventScript { tile_on_select_commands, 2 }, 2, 2 }
};
constexpr gbs::IsometricRoomData rooms[] = {
    gbs::IsometricRoomData {
        visual_tiles.values,
        collision_tiles.values,
        room_w,
        room_h,
        initial_actors,
        sizeof(initial_actors) / sizeof(initial_actors[0]),
        grid,
        camera_start,
        "Isometric Test Room",
        gbs::EventScript { room_on_enter_commands, 2 },
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        actor_interact_events,
        sizeof(actor_interact_events) / sizeof(actor_interact_events[0]),
        actor_start_events,
        sizeof(actor_start_events) / sizeof(actor_start_events[0]),
        actor_update_events,
        sizeof(actor_update_events) / sizeof(actor_update_events[0]),
        nullptr,
        tile_events,
        sizeof(tile_events) / sizeof(tile_events[0]),
        gbs::IsoCoord { 6, 4, 0 },
        true
    },
    gbs::IsometricRoomData {
        visual_tiles.values,
        collision_tiles.values,
        room_w,
        room_h,
        initial_actors,
        sizeof(initial_actors) / sizeof(initial_actors[0]),
        grid,
        camera_start,
        "Isometric Warp Room",
        gbs::EventScript { second_iso_room_on_enter_commands, 2 },
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        actor_interact_events,
        sizeof(actor_interact_events) / sizeof(actor_interact_events[0]),
        actor_start_events,
        sizeof(actor_start_events) / sizeof(actor_start_events[0]),
        actor_update_events,
        sizeof(actor_update_events) / sizeof(actor_update_events[0])
    }
};
const gbs::IsometricProjectData project {
    bg_palette_assets,
    sizeof(bg_palette_assets) / sizeof(bg_palette_assets[0]),
    obj_palette_assets,
    sizeof(obj_palette_assets) / sizeof(obj_palette_assets[0]),
    tile_assets,
    sizeof(tile_assets) / sizeof(tile_assets[0]),
    rooms,
    sizeof(rooms) / sizeof(rooms[0]),
    0,
    gbs::rgb15(2, 4, 6)
};

constexpr const gbs::ResourceBankUploadSource* resource_bank_upload_sources = nullptr;
constexpr size_t resource_bank_upload_source_count = 0;

} // namespace gbastudio_isometric_project
