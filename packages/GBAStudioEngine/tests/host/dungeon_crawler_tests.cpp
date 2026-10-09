#include <assert.h>

#include "gbs/dungeon_crawler.hpp"

namespace {

constexpr uint8_t collision_flags[] = {
    1, 1, 1, 1, 1,
    1, 0, 0, 1, 1,
    1, 0, 1, 0, 1,
    1, 0, 0, 0, 1,
    1, 1, 1, 1, 1,
};

constexpr gbs::ResourceBank resource_banks[] = {
    { gbs::ResourcePoolKind::BgTiles, 32, 8, 8, "crypt_bg" },
};
constexpr gbs::ResourceBankGroup resource_bank_groups[] = {
    { "crypt_group", resource_banks, 1 },
};

constexpr gbs::DungeonCrawlerRoomData room {
    "crypt",
    collision_flags,
    5,
    5,
    gbs::DungeonCrawlerConfig { 12, 6, false, 7 },
    gbs::Vec2i { 1, 1 },
    gbs::DungeonDirection::East,
    gbs::empty_event_script(),
    -1,
    nullptr,
    0,
    nullptr,
    0,
    "crypt_group"
};

static_assert(!room.battle_enabled);

constexpr gbs::DungeonCrawlerRoomData rooms[] = { room };
constexpr gbs::DungeonCrawlerProjectData project {
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

constexpr gbs::MetaSpritePart sentinel_parts[] = {
    { 0, 0, 0, 0, false, false, 64, 64 },
};
constexpr gbs::MetaSprite sentinel_far { sentinel_parts, 1 };
constexpr gbs::MetaSprite sentinel_mid { sentinel_parts, 1 };
constexpr gbs::MetaSprite sentinel_near { sentinel_parts, 1 };
constexpr gbs::DungeonCrawlerDepthSprites sentinel_depth {
    &sentinel_far,
    &sentinel_mid,
    &sentinel_near,
};
constexpr gbs::DungeonCrawlerActorData sentinel_actor {
    "sentinel",
    { 4, 1 },
    &sentinel_far,
    gbs::empty_event_script(),
    &sentinel_depth,
};

} // namespace

int main() {
    static_assert(gbs::is_valid_dungeon_crawler_project_data(project));
    static_assert(gbs::resource_bank_batch_from_dungeon_crawler_project(project).bank_count == 1);
    static_assert(gbs::find_dungeon_crawler_resource_bank_group_index(project, "crypt_group") == 0);
    static_assert(gbs::resource_bank_group_from_dungeon_crawler_room(project, room).bank_count == 1);
    assert(gbs::dungeon_cell_blocked(room, { 0, 0 }));
    assert(!gbs::dungeon_cell_blocked(room, { 2, 1 }));

    gbs::DungeonCrawlerRuntimeState state = gbs::make_dungeon_crawler_runtime_state(room);
    assert(state.position.x == 1 && state.position.y == 1);
    assert(gbs::dungeon_direction_glyph(gbs::DungeonDirection::North) == 'N');
    assert(gbs::dungeon_direction_glyph(gbs::DungeonDirection::East) == 'E');
    assert(gbs::dungeon_direction_glyph(gbs::DungeonDirection::South) == 'S');
    assert(gbs::dungeon_direction_glyph(gbs::DungeonDirection::West) == 'W');
    assert(gbs::dungeon_exploration_is_marked(state, room, state.position));
    assert(!gbs::dungeon_exploration_is_marked(state, room, { 2, 1 }));
    assert(gbs::try_dungeon_step_forward(state, room));
    assert(state.position.x == 2 && state.position.y == 1);
    gbs::dungeon_exploration_mark(state, room, state.position);
    assert(gbs::dungeon_exploration_is_marked(state, room, { 2, 1 }));
    assert(!gbs::try_dungeon_step_forward(state, room));

    gbs::turn_dungeon_right(state);
    assert(state.direction == gbs::DungeonDirection::South);
    assert(!gbs::try_dungeon_step_backward(state, room));
    assert(gbs::dungeon_view_cell(room, state, 1, 0).blocked);

    static_assert(gbs::dungeon_depth_variant_for_distance(1, 5) == gbs::DungeonDepthVariant::Near);
    static_assert(gbs::dungeon_depth_variant_for_distance(2, 5) == gbs::DungeonDepthVariant::Mid);
    static_assert(gbs::dungeon_depth_variant_for_distance(4, 5) == gbs::DungeonDepthVariant::Far);
    static_assert(gbs::dungeon_depth_metasprite(sentinel_actor, 1, 5) == &sentinel_near);
    static_assert(gbs::dungeon_depth_metasprite(sentinel_actor, 2, 5) == &sentinel_mid);
    static_assert(gbs::dungeon_depth_metasprite(sentinel_actor, 4, 5) == &sentinel_far);
    static_assert(gbs::dungeon_actor_is_visible_in_view(2, -1, 5));
    static_assert(!gbs::dungeon_actor_is_visible_in_view(2, 2, 5));
    static_assert(gbs::dungeon_project_actor(1, 0).x == 88);
    static_assert(gbs::dungeon_project_actor(1, 0).y == 32);
    static_assert(gbs::dungeon_project_actor(2, -1).x == 50);
    static_assert(gbs::dungeon_project_actor(2, -1).y == 24);

    constexpr gbs::DungeonCrawlerInventoryItemData inventory_item {
        "CELL",
        2,
        1,
        1
    };
    constexpr gbs::DungeonCrawlerBattleData battle_data {
        "SENTINEL",
        0,
        3,
        1,
        1,
        3,
        1
    };
    static_assert(gbs::is_valid_dungeon_crawler_inventory_item(inventory_item));
    static_assert(gbs::is_valid_dungeon_crawler_battle_data(battle_data, 1));
    gbs::DungeonCrawlerBattleState battle_state = gbs::make_dungeon_crawler_battle_state(battle_data);
    assert(gbs::dungeon_battle_player_attack(battle_state, battle_data));
    assert(battle_state.enemy_hp == 2);
    assert(gbs::dungeon_battle_enemy_turn(battle_state, battle_data));
    assert(battle_state.player_hp == 2);
    assert(gbs::dungeon_battle_player_attack(battle_state, battle_data));
    assert(gbs::dungeon_battle_player_attack(battle_state, battle_data));
    assert(gbs::dungeon_battle_is_victory(battle_state));

    gbs::DungeonCrawlerProjectData configured = project;
    configured.inventory_enabled = false;
    configured.battle_enabled = true;
    configured.depth_sprites_enabled = false;
    assert(!configured.inventory_enabled);
    assert(configured.battle_enabled);
    assert(!configured.depth_sprites_enabled);

    gbs::EventState event_state {};
    gbs::init_event_state(event_state);
    event_state.variables[4] = 91;
    event_state.inventory[1] = 3;
    state.position = { 3, 3 };
    state.direction = gbs::DungeonDirection::West;
    state.action_frames_remaining = 4;
    gbs::UniversalSaveData save_data {};
    assert(gbs::capture_dungeon_crawler_save_data(save_data, 0, state, event_state, 7200));

    gbs::DungeonCrawlerRuntimeState restored_state {};
    gbs::EventState restored_event_state {};
    gbs::init_event_state(restored_event_state);
    int restored_room = -1;
    assert(gbs::apply_dungeon_crawler_save_data(
        project,
        save_data,
        restored_room,
        restored_state,
        restored_event_state
    ));
    assert(restored_room == 0);
    assert(restored_state.position.x == 3 && restored_state.position.y == 3);
    assert(restored_state.direction == gbs::DungeonDirection::West);
    assert(restored_state.action_frames_remaining == 4);
    assert(gbs::dungeon_exploration_is_marked(restored_state, room, { 1, 1 }));
    assert(gbs::dungeon_exploration_is_marked(restored_state, room, { 2, 1 }));
    assert(restored_event_state.variables[4] == 91);
    assert(restored_event_state.inventory[1] == 3);
    // Collected/defeated actors and player health survive a fresh save/load.
    gbs::DungeonCrawlerPersistentState persistent {};
    persistent.hidden_actor_bits[0] = 1;
    persistent.exploration_player_hp = 1;
    persistent.battle_state = {false, 0, 1};
    persistent.enemy_defeated = true;
    assert(gbs::capture_dungeon_crawler_save_data(save_data, 0, state, event_state, 7200, 0, &persistent));
    gbs::DungeonCrawlerPersistentState restored_persistent {};
    assert(gbs::apply_dungeon_crawler_save_data(project, save_data, restored_room,
        restored_state, restored_event_state, &restored_persistent));
    assert(restored_persistent.hidden_actor_bits[0] == 1);
    assert(restored_persistent.exploration_player_hp == 1);
    assert(restored_persistent.enemy_defeated);
    assert(restored_persistent.battle_state.enemy_hp == 0);
    assert(restored_persistent.battle_state.player_hp == 1);
    persistent.exploration_player_hp = -1;
    assert(gbs::capture_dungeon_crawler_save_data(save_data, 0, state, event_state, 7200, 0, &persistent));
    restored_event_state.variables[4] = 123;
    assert(!gbs::apply_dungeon_crawler_save_data(project, save_data, restored_room,
        restored_state, restored_event_state, &restored_persistent));
    assert(restored_event_state.variables[4] == 123);
    assert(restored_persistent.exploration_player_hp == 1);
    return 0;
}
