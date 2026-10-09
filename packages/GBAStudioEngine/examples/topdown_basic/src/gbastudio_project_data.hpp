#pragma once

#include "gbs/engine.hpp"
#include "gbs/project.hpp"
#include "player_sprite_asset.hpp"

namespace gbastudio_project {

constexpr bool save_enabled = true;
constexpr gbs::SaveMenuConfig save_menu_config {
    "CONTINUAR",
    "CARREGAR",
    "APAGAR",
    gbs::SaveMenuLayout::Cards,
    1,
    true,
    true,
    true,
    true,
    true
};
constexpr gbs::SaveBank save_bank {
    0,
    1024,
    3,
    gbs::make_save_signature('G', 'B', 'T', 'D'),
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

template <int Count>
struct Rle16Runs {
    gbs::Rle16Run values[Count];
};

constexpr bool is_border(int x, int y) {
    return x == 0 || y == 0 || x == room_w - 1 || y == room_h - 1;
}

constexpr bool is_room0_pillar(int x, int y) {
    return (x == 20 || x == 21) && y > 5 && y < 24;
}

constexpr bool is_room1_wall(int x, int y) {
    return y == 7 && x > 8 && x < 52;
}

constexpr bool is_room0_water_tile(int x, int y) {
    return x >= 12 && x <= 15 && y >= 18 && y <= 20;
}

constexpr bool is_room0_damage_tile(int x, int y) {
    return x >= 28 && x <= 30 && y >= 13 && y <= 15;
}

constexpr bool is_room1_ladder_tile(int x, int y) {
    return x >= 12 && x <= 13 && y >= 16 && y <= 20;
}

constexpr bool is_pillar_gap(int y) {
    return y >= 13 && y <= 15;
}

constexpr bool is_room0_portal_gap(int x, int y) {
    return x == 56 && y >= 13 && y <= 15;
}

constexpr bool is_room1_portal_gap(int x, int y) {
    return x == 0 && y >= 13 && y <= 15;
}

constexpr bool is_room0_solid_tile(int x, int y) {
    bool pillar = is_room0_pillar(x, y);
    return (is_border(x, y) || (pillar && !is_pillar_gap(y))) && !is_room0_portal_gap(x, y);
}

constexpr bool is_room1_solid_tile(int x, int y) {
    return (is_border(x, y) || is_room1_wall(x, y)) && !is_room1_portal_gap(x, y);
}

constexpr bool is_solid_tile(int room_index, int x, int y) {
    return room_index == 0 ? is_room0_solid_tile(x, y) : is_room1_solid_tile(x, y);
}

constexpr bool is_portal_marker(int room_index, int x, int y) {
    return room_index == 0 ? is_room0_portal_gap(x, y) : is_room1_portal_gap(x, y);
}

constexpr uint16_t visual_tile_for(int room_index, int x, int y) {
    if (is_solid_tile(room_index, x, y) || is_portal_marker(room_index, x, y)) {
        return room_index == 0 ? 2 : 3;
    }
    if (room_index == 0 && is_room0_water_tile(x, y)) {
        return 1;
    }
    if ((room_index == 0 && is_room0_damage_tile(x, y)) || (room_index == 1 && is_room1_ladder_tile(x, y))) {
        return 3;
    }
    return room_index == 0
        ? ((x + y) % 2 == 0 ? 1 : 3)
        : ((x / 2 + y / 2) % 2 == 0 ? 1 : 2);
}

template <int RoomIndex>
constexpr WordTiles<tile_count> make_visual_tiles() {
    WordTiles<tile_count> tiles {};
    for (int y = 0; y < room_h; ++y) {
        for (int x = 0; x < room_w; ++x) {
            tiles.values[y * room_w + x] = visual_tile_for(RoomIndex, x, y);
        }
    }
    return tiles;
}

template <int RoomIndex>
constexpr ByteTiles<tile_count> make_collision_tiles() {
    ByteTiles<tile_count> tiles {};
    for (int y = 0; y < room_h; ++y) {
        for (int x = 0; x < room_w; ++x) {
            uint8_t flags = is_solid_tile(RoomIndex, x, y) ? gbs::TileSolid : gbs::TileEmpty;
            if (RoomIndex == 0 && is_room0_water_tile(x, y)) {
                flags |= gbs::TileWater;
            }
            if (RoomIndex == 0 && is_room0_damage_tile(x, y)) {
                flags |= gbs::TileDamage;
            }
            if (RoomIndex == 1 && is_room1_ladder_tile(x, y)) {
                flags |= gbs::TileLadder;
            }
            tiles.values[y * room_w + x] = flags;
        }
    }
    return tiles;
}

constexpr WordTiles<tile_count> make_bg1_overlay() {
    WordTiles<tile_count> tiles {};
    for (int y = 0; y < room_h; ++y) {
        for (int x = 0; x < room_w; ++x) {
            tiles.values[y * room_w + x] = ((x / 4 + y / 4) % 2 == 0) ? 1 : 3;
        }
    }
    return tiles;
}

constexpr int bg1_overlay_run_count = room_h * 16;

constexpr Rle16Runs<bg1_overlay_run_count> make_bg1_overlay_runs() {
    Rle16Runs<bg1_overlay_run_count> runs {};
    int cursor = 0;
    for (int y = 0; y < room_h; ++y) {
        for (int segment = 0; segment < 16; ++segment) {
            runs.values[cursor] = gbs::Rle16Run {
                ((segment + y / 4) % 2 == 0) ? static_cast<uint16_t>(1) : static_cast<uint16_t>(3),
                4
            };
            ++cursor;
        }
    }
    return runs;
}

constexpr WordTiles<tile_count> room_0_visual_tiles = make_visual_tiles<0>();
constexpr ByteTiles<tile_count> room_0_collision_tiles = make_collision_tiles<0>();
constexpr WordTiles<tile_count> room_1_visual_tiles = make_visual_tiles<1>();
constexpr ByteTiles<tile_count> room_1_collision_tiles = make_collision_tiles<1>();
constexpr WordTiles<tile_count> bg1_overlay = make_bg1_overlay();
constexpr Rle16Runs<bg1_overlay_run_count> bg1_overlay_runs = make_bg1_overlay_runs();

constexpr gbs::Rle16TileMapAsset bg1_overlay_compressed {
    gbs::Rle16Asset { bg1_overlay_runs.values, bg1_overlay_run_count, tile_count },
    room_w,
    room_h
};

constexpr uint16_t demo_bg_palette[] = {
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

alignas(2) constexpr uint8_t demo_bg_tiles[4][32] = {
    { 0 },
    {
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11,
        0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x11
    },
    {
        0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
        0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
        0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33,
        0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33, 0x33
    },
    {
        0x44, 0x44, 0x44, 0x44, 0x44, 0x44, 0x44, 0x44,
        0x44, 0x44, 0x44, 0x44, 0x44, 0x44, 0x44, 0x44,
        0x44, 0x44, 0x44, 0x44, 0x44, 0x44, 0x44, 0x44,
        0x44, 0x44, 0x44, 0x44, 0x44, 0x44, 0x44, 0x44
    }
};

constexpr gbs::PaletteAsset bg_palettes[] = {
    { demo_bg_palette, 16, 0 }
};

constexpr gbs::PaletteAsset obj_palettes[] = {
    player_sprite_palette_asset
};

const gbs::TileAsset tile_assets[] = {
    { reinterpret_cast<const uint8_t*>(demo_bg_tiles), 4, 0, false },
    player_sprite_tile_asset
};

constexpr gbs::Portal room_0_portals[] = {
    { gbs::Rect { 56 * 8, 13 * 8, 8, 24 }, 1, gbs::Vec2i { 4 * 8, 14 * 8 } }
};

constexpr gbs::Portal room_1_portals[] = {
    { gbs::Rect { 0, 13 * 8, 8, 24 }, 0, gbs::Vec2i { 52 * 8, 14 * 8 } }
};

constexpr gbs::DialogueLine dialogue_lines[] = {
    { "ROOM 1\nPORTAL A DIREITA\nDIALOGO COM MAIS UMA PAGINA\nPRESSIONE A PARA AVANCAR" },
    { "ROOM 2\nPORTAL A ESQUERDA" },
    { "INTERACAO NA ROOM 1" },
    { "INTERACAO NA ROOM 2" },
    { "HOTSPOT NA ROOM 1\nPRESSIONE A AQUI" },
    { "HOTSPOT NA ROOM 2\nAREA DE RETORNO" },
    { "NPC ROOM 1\nOLA DO ATOR" },
    { "NPC ROOM 2\nBEM-VINDO DE VOLTA" },
    { "NPC ROOM 1\nVARIAVEL CONFIRMADA" },
    { "TRIGGER ROOM 1\nENTRADA DETECTADA" },
    { "ESCOLHA UMA OPCAO" },
    { "EFEITO DE TILE\nAGUA DETECTADA" },
    { "EFEITO DE TILE\nDANO DETECTADO" },
    { "EFEITO DE TILE\nESCADA DETECTADA" },
    { "VOCE ESCOLHEU SIM" },
    { "VOCE ESCOLHEU NAO" },
    { "TALVEZ TAMBEM E CAMINHO" },
    { "PODE VOLTAR DEPOIS" }
};

constexpr gbs::SfxTone portal_sfx_tones[] = {
    { 880, 5, 12, 2, false },
    { 1320, 5, 10, 2, false },
    { 1760, 8, 8, 1, false }
};

constexpr gbs::SfxAsset sfx_assets[] = {
    { portal_sfx_tones, 3 }
};

constexpr gbs::MusicStep main_music_steps[] = {
    { 262, 18, 3, 1 },
    { 330, 18, 3, 1 },
    { 392, 18, 3, 1 },
    { 330, 18, 3, 1 }
};

constexpr gbs::MusicAsset music_assets[] = {
    { main_music_steps, 4, true }
};

constexpr gbs::EventCommand room_0_enter_events[] = {
    { gbs::EventOp::ShowDialogue, 0, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_0_interact_events[] = {
    { gbs::EventOp::ShowChoice, 0, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_1_enter_events[] = {
    { gbs::EventOp::ShowDialogue, 1, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_1_interact_events[] = {
    { gbs::EventOp::ShowDialogue, 3, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_0_hotspot_0_events[] = {
    { gbs::EventOp::ClearVariable, 1, 0, 0 },
    { gbs::EventOp::ShowDialogue, 4, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_1_hotspot_0_events[] = {
    { gbs::EventOp::ShowDialogue, 5, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_0_trigger_0_enter_events[] = {
    { gbs::EventOp::Wait, 6, 0, 0 },
    { gbs::EventOp::ShowDialogue, 9, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_0_water_enter_events[] = {
    { gbs::EventOp::ShowDialogue, 11, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_0_damage_enter_events[] = {
    { gbs::EventOp::PlaySfx, 0, 0, 0 },
    { gbs::EventOp::ShowDialogue, 12, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_1_ladder_enter_events[] = {
    { gbs::EventOp::ShowDialogue, 13, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand shared_actor_feedback_events[] = {
    { gbs::EventOp::PlaySfx, 0, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand choice_yes_events[] = {
    { gbs::EventOp::PlaySfx, 0, 0, 0 },
    { gbs::EventOp::ShowDialogue, 14, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand choice_no_events[] = {
    { gbs::EventOp::ShowDialogue, 15, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand choice_maybe_events[] = {
    { gbs::EventOp::AddVariable, 5, 1, 0 },
    { gbs::EventOp::ShowDialogue, 16, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand choice_later_events[] = {
    { gbs::EventOp::ShowDialogue, 17, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_0_npc_0_events[] = {
    { gbs::EventOp::SetVariable, 1, 10, 0 },
    { gbs::EventOp::CallScript, 0, 0, 0 },
    { gbs::EventOp::MoveActor, 0, 8, 0 },
    { gbs::EventOp::SetActorDirection, 0, static_cast<int16_t>(gbs::TopDownActorDirection::Right), 0 },
    { gbs::EventOp::ShowDialogueIf, 8, 1, 10 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_1_npc_0_events[] = {
    { gbs::EventOp::AddVariable, 2, 1, 0 },
    { gbs::EventOp::PlaySfx, 0, 0, 0 },
    { gbs::EventOp::ShowDialogue, 7, 0, 0 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_0_portal_0_events[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 },
    { gbs::EventOp::PlaySfx, 0, 0, 0 },
    { gbs::EventOp::Warp, 1, 4 * 8, 14 * 8 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::EventCommand room_1_portal_0_events[] = {
    { gbs::EventOp::SetVariable, 0, 2, 0 },
    { gbs::EventOp::PlaySfx, 0, 0, 0 },
    { gbs::EventOp::Warp, 0, 52 * 8, 14 * 8 },
    { gbs::EventOp::End, 0, 0, 0 }
};

constexpr gbs::TopDownPortalEventData room_0_portal_events[] = {
    { 0, gbs::EventScript { room_0_portal_0_events, 4 } }
};

constexpr gbs::TopDownPortalEventData room_1_portal_events[] = {
    { 0, gbs::EventScript { room_1_portal_0_events, 4 } }
};

constexpr gbs::TopDownInteractionData room_0_interactions[] = {
    { gbs::Rect { 8 * 8, 14 * 8, 16, 16 }, gbs::EventScript { room_0_hotspot_0_events, 3 } }
};

constexpr gbs::TopDownInteractionData room_1_interactions[] = {
    { gbs::Rect { 4 * 8, 14 * 8, 16, 16 }, gbs::EventScript { room_1_hotspot_0_events, 2 } }
};

constexpr gbs::TopDownTriggerData room_0_triggers[] = {
    {
        gbs::Rect { 20 * 8, 14 * 8, 16, 16 },
        gbs::EventScript { room_0_trigger_0_enter_events, 3 },
        gbs::empty_event_script(),
        true,
        30,
        gbs::empty_event_script(),
        gbs::TopDownTriggerKind::Standard
    }
};

constexpr gbs::TopDownTileEffectEventData room_0_tile_effect_events[] = {
    {
        gbs::TileWater,
        gbs::EventScript { room_0_water_enter_events, 2 },
        gbs::empty_event_script(),
        true,
        20
    },
    {
        gbs::TileDamage,
        gbs::EventScript { room_0_damage_enter_events, 3 },
        gbs::empty_event_script(),
        true,
        20
    }
};

constexpr gbs::TopDownTileEffectEventData room_1_tile_effect_events[] = {
    {
        gbs::TileLadder,
        gbs::EventScript { room_1_ladder_enter_events, 2 },
        gbs::empty_event_script(),
        true,
        20
    }
};

constexpr gbs::TopDownNpcData room_0_npcs[] = {
    {
        gbs::Vec2i { 12 * 8, 14 * 8 },
        gbs::Vec2i { 16, 16 },
        &player_sprite_metasprites[1],
        &player_sprite_animation,
        gbs::EventScript { room_0_npc_0_events, 6 },
        "room_0_npc",
        gbs::TopDownActorDirection::Down,
        0,
        100,
        100,
        1,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::EventScript { room_0_npc_0_events, 6 },
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::TopDownNpcMovementData {
            gbs::TopDownNpcMovementKind::PatrolHorizontal,
            gbs::Rect { 10 * 8, 14 * 8, 5 * 8, 16 },
            gbs::Vec2i { 0, 0 },
            16,
            6
        }
    }
};

constexpr gbs::TopDownNpcData room_1_npcs[] = {
    {
        gbs::Vec2i { 8 * 8, 14 * 8 },
        gbs::Vec2i { 16, 16 },
        &player_sprite_metasprites[2],
        &player_sprite_animation,
        gbs::EventScript { room_1_npc_0_events, 4 },
        "room_1_npc",
        gbs::TopDownActorDirection::Left,
        0,
        100,
        100,
        1,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::EventScript { room_1_npc_0_events, 4 },
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::TopDownNpcMovementData {
            gbs::TopDownNpcMovementKind::FollowPlayer,
            gbs::Rect { 0, 0, 0, 0 },
            gbs::Vec2i { 0, 0 },
            24,
            8
        }
    }
};

constexpr gbs::TopDownRoomMetadata room_0_metadata {
    gbs::TopDownCameraMode::Follow,
    gbs::Vec2i { 0, 0 },
    true,
    gbs::Vec2i { 8 * 8, 14 * 8 },
    true,
    0,
    false,
    true,
    gbs::rgb15(2, 4, 8),
    true,
    gbs::Rect { 0, 0, room_w * 8, room_h * 8 }
};

constexpr gbs::TopDownRoomMetadata room_1_metadata {
    gbs::TopDownCameraMode::Follow,
    gbs::Vec2i { 0, 0 },
    false,
    gbs::Vec2i { 0, 0 },
    true,
    0,
    false,
    true,
    gbs::rgb15(1, 1, 5),
    true,
    gbs::Rect { 0, 0, room_w * 8, room_h * 8 }
};

constexpr gbs::TopDownBackgroundData backgrounds[] = {
    {
        gbs::BackgroundLayer::BG1,
        gbs::TileMapAsset { bg1_overlay.values, room_w, room_h },
        &bg1_overlay_compressed,
        gbs::Vec2i { 0, 0 },
        gbs::Vec2i { 128, 128 }
    }
};

constexpr gbs::EventScript project_scripts[] = {
    gbs::EventScript { shared_actor_feedback_events, 2 },
    gbs::EventScript { choice_yes_events, 3 },
    gbs::EventScript { choice_no_events, 2 },
    gbs::EventScript { choice_maybe_events, 3 },
    gbs::EventScript { choice_later_events, 2 }
};

constexpr gbs::TopDownNamedScriptData named_scripts[] = {
    { "shared_actor_feedback", gbs::EventScript { shared_actor_feedback_events, 2 } },
    { "choice_yes", gbs::EventScript { choice_yes_events, 3 } },
    { "choice_no", gbs::EventScript { choice_no_events, 2 } },
    { "choice_maybe", gbs::EventScript { choice_maybe_events, 3 } },
    { "choice_later", gbs::EventScript { choice_later_events, 2 } }
};

constexpr gbs::DialogueChoice room_0_choices[] = {
    { "SIM", 1, 1 },
    { "NAO", 2, 2 },
    { "TALVEZ", 3, 3 },
    { "DEPOIS", 4, 4 }
};

constexpr gbs::TopDownDialogueChoiceData dialogue_choices[] = {
    { 10, room_0_choices, 4, 4 }
};

constexpr gbs::TopDownRoomData rooms[] = {
    {
        room_0_visual_tiles.values,
        room_0_collision_tiles.values,
        room_w,
        room_h,
        room_0_portals,
        1,
        gbs::EventScript { room_0_enter_events, 2 },
        gbs::empty_event_script(),
        room_0_portal_events,
        1,
        gbs::EventScript { room_0_interact_events, 2 },
        room_0_interactions,
        1,
        room_0_npcs,
        1,
        room_0_metadata,
        room_0_triggers,
        1,
        room_0_tile_effect_events,
        2,
        "room_0"
    },
    {
        room_1_visual_tiles.values,
        room_1_collision_tiles.values,
        room_w,
        room_h,
        room_1_portals,
        1,
        gbs::EventScript { room_1_enter_events, 2 },
        gbs::empty_event_script(),
        room_1_portal_events,
        1,
        gbs::EventScript { room_1_interact_events, 2 },
        room_1_interactions,
        1,
        room_1_npcs,
        1,
        room_1_metadata,
        nullptr,
        0,
        room_1_tile_effect_events,
        1,
        "room_1"
    }
};

const gbs::TopDownProjectData project {
    bg_palettes,
    1,
    obj_palettes,
    1,
    tile_assets,
    2,
    backgrounds,
    1,
    rooms,
    2,
    dialogue_lines,
    18,
    sfx_assets,
    1,
    music_assets,
    1,
    gbs::TopDownActorData {
        gbs::Vec2i { 8 * 8, 14 * 8 },
        gbs::Vec2i { 16, 16 },
        1,
        &player_sprite_metasprites[0],
        &player_sprite_animation,
        "player",
        gbs::TopDownActorDirection::Down,
        0,
        100,
        100
    },
    gbs::Camera { gbs::Vec2i { 0, 0 }, true },
    gbs::rgb15(2, 4, 8),
    project_scripts,
    5,
    dialogue_choices,
    1,
    named_scripts,
    5
};

constexpr const gbs::ResourceBankUploadSource* resource_bank_upload_sources = nullptr;
constexpr size_t resource_bank_upload_source_count = 0;

constexpr const gbs::DialoguePortraitEntry* dialogue_portrait_assets = nullptr;
constexpr size_t dialogue_portrait_asset_count = 0;

constexpr const gbs::DialogueEmoteEntry* dialogue_emote_assets = nullptr;
constexpr size_t dialogue_emote_asset_count = 0;

constexpr const gbs::DialogueBoxSkin* dialogue_box_skin = nullptr;
constexpr const gbs::DialogueFont* dialogue_font = nullptr;
constexpr const gbs::DialogueChoiceSelector* dialogue_choice_selector = nullptr;

} // namespace gbastudio_project
