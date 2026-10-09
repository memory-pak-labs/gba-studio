#include "gbs/dungeon_crawler.hpp"
#include "gbs/engine.hpp"
#include "gbs/input.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#ifndef GBS_DUNGEON_CRAWLER_PROJECT_DATA_HEADER
#define GBS_DUNGEON_CRAWLER_PROJECT_DATA_HEADER "dungeon_crawler_project_data.hpp"
#endif
#ifndef GBS_DUNGEON_CRAWLER_RUNTIME_ENTRY
#define GBS_DUNGEON_CRAWLER_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_DUNGEON_CRAWLER_RUNTIME_ENTER
#define GBS_DUNGEON_CRAWLER_RUNTIME_ENTER gbs_enter_dungeon_crawler
#endif
#ifndef GBS_DUNGEON_CRAWLER_RUNTIME_UPDATE
#define GBS_DUNGEON_CRAWLER_RUNTIME_UPDATE gbs_update_dungeon_crawler
#endif
#ifndef GBS_DUNGEON_CRAWLER_RUNTIME_RENDER
#define GBS_DUNGEON_CRAWLER_RUNTIME_RENDER gbs_render_dungeon_crawler
#endif
#ifndef GBS_DUNGEON_CRAWLER_RUNTIME_LEAVE
#define GBS_DUNGEON_CRAWLER_RUNTIME_LEAVE gbs_leave_dungeon_crawler
#endif
#ifndef GBS_MULTI_RUNTIME
#define GBS_MULTI_RUNTIME 0
#endif
#include GBS_DUNGEON_CRAWLER_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

namespace {

const gbs::DungeonCrawlerProjectData& project = gbastudio_dungeon_crawler_project::project;
int current_room_index = 0;
gbs::DungeonCrawlerRuntimeState runtime_state {};
gbs::HudState hud {};
gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::DialogueState interaction_dialogue __attribute__((section(".ewram_bss")));
gbs::DialogueState map_dialogue __attribute__((section(".ewram_bss")));
gbs::DialogueLine interaction_line { "INVENTARIO" };
gbs::DialogueLine interaction_notice_line { "" };
char dungeon_map_text[49] {};
gbs::DialogueLine map_line { dungeon_map_text };
int map_scroll_x = 0;
int map_scroll_y = 0;
int cached_view_room = -1;
gbs::Vec2i cached_view_position { -1, -1 };
gbs::DungeonDirection cached_view_direction = gbs::DungeonDirection::North;
gbs::DialogueChoice inventory_choices[2] {
    { "ITEM", 0 },
    { "FECHAR", 1 },
};
gbs::DialogueChoice battle_choices[2] {
    { "ATACAR", 0 },
    { "FUGIR", 1 },
};
enum class DungeonInteractionMode : uint8_t {
    None,
    Inventory,
    Battle,
    Notice,
    Map,
};
DungeonInteractionMode interaction_mode = DungeonInteractionMode::None;
gbs::DungeonCrawlerBattleState battle_state {};
bool dungeon_enemy_defeated = false;
bool notice_returns_to_battle = false;
int exploration_player_hp = 3;
bool dungeon_lateral_hud_visible = false;
char dungeon_sidebar_map_rows[5][7] {};
char dungeon_sidebar_hp_text[8] {};
char dungeon_sidebar_item_text[7] {};
char dungeon_sidebar_count_text[7] {};
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::EventRunner runtime_event_runner {};
uint32_t runtime_save_sequence = 0;
int runtime_event_wait_frames = 0;
bool runtime_script_controls_dialogue = false;
constexpr size_t max_runtime_triggers = 16;
gbs::RuntimeTriggerState trigger_states[max_runtime_triggers] {};
constexpr size_t max_dungeon_actor_visibility = gbs::dungeon_actor_visibility_capacity;
bool dungeon_actor_visible[max_dungeon_actor_visibility] {};
volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
constexpr size_t max_resource_bank_reservations = 64;
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankBatchReservation active_resource_banks {
    active_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false,
};
gbs::ResourceBankBatchReservation scratch_resource_banks {
    scratch_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false,
};
const bool assets_are_streamed = project.resource_bank_group_count > 0;
int dungeon_initialization_result = -1;

void reset_trigger_states();

void reset_dungeon_actor_visibility() {
    for (size_t index = 0; index < max_dungeon_actor_visibility; ++index) {
        dungeon_actor_visible[index] = true;
    }
}

bool dungeon_actor_is_enabled(size_t index) {
    return index >= max_dungeon_actor_visibility || dungeon_actor_visible[index];
}

void consume_dungeon_actor_commands() {
    for (size_t index = 0; index < event_state.actor_command_count; ++index) {
        const gbs::EventActorCommand& command = event_state.actor_commands[index];
        if (command.actor_index < 0 ||
            static_cast<size_t>(command.actor_index) >= max_dungeon_actor_visibility) continue;
        if (command.op == gbs::EventActorOp::SetVisible || command.op == gbs::EventActorOp::SetActive) {
            dungeon_actor_visible[command.actor_index] = command.a != 0;
        }
    }
    gbs::reset_event_actor_commands(event_state);
}

bool capture_dungeon_runtime_snapshot(gbs::UniversalSaveData& data) {
    gbs::DungeonCrawlerPersistentState persistent {};
    for (size_t index = 0; index < max_dungeon_actor_visibility; ++index) {
        if (!dungeon_actor_visible[index]) {
            persistent.hidden_actor_bits[index / 8] |= static_cast<uint8_t>(1u << (index % 8));
        }
    }
    persistent.exploration_player_hp = exploration_player_hp;
    persistent.battle_state = battle_state;
    persistent.enemy_defeated = dungeon_enemy_defeated;
    return gbs::capture_dungeon_crawler_save_data(data, current_room_index, runtime_state,
        event_state, gbs::frame_count(), 0, &persistent);
}

bool apply_dungeon_runtime_snapshot(const gbs::UniversalSaveData& data) {
    gbs::DungeonCrawlerPersistentState persistent {};
    if (!gbs::apply_dungeon_crawler_save_data(project, data, current_room_index,
        runtime_state, event_state, &persistent)) return false;
    for (size_t index = 0; index < max_dungeon_actor_visibility; ++index) {
        dungeon_actor_visible[index] =
            (persistent.hidden_actor_bits[index / 8] & static_cast<uint8_t>(1u << (index % 8))) == 0;
    }
    exploration_player_hp = persistent.exploration_player_hp;
    battle_state = persistent.battle_state;
    dungeon_enemy_defeated = persistent.enemy_defeated;
    return true;
}

void invalidate_dungeon_view_cache() {
    cached_view_room = -1;
    cached_view_position = gbs::Vec2i { -1, -1 };
}

bool stream_resources_for_room(const gbs::DungeonCrawlerRoomData& room) {
    if (!assets_are_streamed || room.resource_bank_group_name == nullptr) {
        return true;
    }
    const gbs::ResourceBankGroup group =
        gbs::resource_bank_group_from_dungeon_crawler_room(project, room);
    if (group.name == nullptr) return false;
    if (project.resource_bank_upload_source_count == 0) {
        return gbs::stream_resource_bank_group(
            resource_manager,
            active_resource_banks,
            scratch_resource_banks,
            group
        );
    }
    return gbs::stream_resource_bank_group_with_uploads(
        resource_manager,
        active_resource_banks,
        scratch_resource_banks,
        group,
        project.resource_bank_upload_sources,
        project.resource_bank_upload_source_count
    ).success;
}

const char* dungeon_hp_text(int hp) {
    if (hp <= 0) return "HP 00";
    if (hp == 1) return "HP 01";
    if (hp == 2) return "HP 02";
    return "HP 03";
}

const char* dungeon_compass_hp_text(int hp) {
    static char text[13] {};
    const char* hp_text = dungeon_hp_text(hp);
    text[0] = gbs::dungeon_direction_glyph(runtime_state.direction);
    text[1] = ' ';
    text[2] = hp_text[0];
    text[3] = hp_text[1];
    text[4] = hp_text[2];
    text[5] = hp_text[3];
    text[6] = hp_text[4];
    text[7] = '\0';
    return text;
}

bool dungeon_string_equals(const char* left, const char* right) {
    if (left == nullptr || right == nullptr) return left == right;
    while (*left != '\0' && *right != '\0' && *left == *right) {
        ++left;
        ++right;
    }
    return *left == '\0' && *right == '\0';
}

// Event scripts use the shared top-down direction encoding (down, up, left,
// right). Dungeon movement uses clockwise North/East/South/West values.
int dungeon_event_direction(gbs::DungeonDirection direction) {
    switch (direction) {
    case gbs::DungeonDirection::North: return 1;
    case gbs::DungeonDirection::East: return 3;
    case gbs::DungeonDirection::South: return 0;
    case gbs::DungeonDirection::West: return 2;
    }
    return 1;
}

gbs::DungeonDirection dungeon_direction_from_event(int direction) {
    switch (direction) {
    case 0: return gbs::DungeonDirection::South;
    case 1: return gbs::DungeonDirection::North;
    case 2: return gbs::DungeonDirection::West;
    case 3: return gbs::DungeonDirection::East;
    default: return gbs::DungeonDirection::North;
    }
}

bool dungeon_lateral_hud_active() {
    const gbs::HudLayout* layout = gbs::active_hud_layout();
    return layout != nullptr && (
        dungeon_string_equals(layout->id, "hud-usina-lateral") ||
        dungeon_string_equals(layout->id, "hud-usina-exploration-v3") ||
        dungeon_string_equals(layout->id, "hud-usina-combat-v3") ||
        dungeon_string_equals(layout->id, "hud-usina-exit-v3")
    );
}

void dungeon_copy_sidebar_text(char* output, size_t capacity, const char* source) {
    if (output == nullptr || capacity == 0) return;
    size_t index = 0;
    if (source != nullptr) {
        while (source[index] != '\0' && index + 1 < capacity) {
            output[index] = source[index];
            ++index;
        }
    }
    output[index] = '\0';
}

int dungeon_player_hp() {
    return battle_state.active ? battle_state.player_hp : exploration_player_hp;
}

void show_dungeon_notice(const char* text, bool return_to_battle) {
    interaction_notice_line.text = text;
    notice_returns_to_battle = return_to_battle;
    interaction_mode = DungeonInteractionMode::Notice;
    gbs::show_dialogue(
        interaction_dialogue,
        &interaction_notice_line,
        1,
        0
    );
    gbs::set_dialogue_frame(interaction_dialogue, gbs::dialogue_frame_default);
}

void show_dungeon_inventory() {
    if (!project.inventory_enabled || project.inventory_items == nullptr || project.inventory_item_count == 0) {
        return;
    }
    const gbs::DungeonCrawlerInventoryItemData& item = project.inventory_items[0];
    inventory_choices[0].text = item.label;
    inventory_choices[0].result_value = 0;
    inventory_choices[1].text = "FECHAR";
    inventory_choices[1].result_value = 1;
    interaction_mode = DungeonInteractionMode::Inventory;
    dungeon_lateral_hud_visible = true;
    gbs::show_dialogue_choices(
        interaction_dialogue,
        &interaction_line,
        1,
        0,
        inventory_choices,
        2
    );
    gbs::set_dialogue_frame(interaction_dialogue, gbs::dialogue_frame_default);
}

int dungeon_map_width(const gbs::DungeonCrawlerRoomData& room) {
    return (room.width_tiles + 1) / 2;
}

int dungeon_map_height(const gbs::DungeonCrawlerRoomData& room) {
    return (room.height_tiles + 1) / 2;
}

int dungeon_map_max_scroll(int content_size, int viewport_size) {
    return content_size > viewport_size ? content_size - viewport_size : 0;
}

char dungeon_map_cell_glyph(
    const gbs::DungeonCrawlerRoomData& room,
    int map_x,
    int map_y
) {
    bool visible = false;
    bool blocked = false;
    bool has_player = false;
    for (int local_y = 0; local_y < 2; ++local_y) {
        for (int local_x = 0; local_x < 2; ++local_x) {
            const gbs::Vec2i position { map_x * 2 + local_x, map_y * 2 + local_y };
            if (!gbs::dungeon_position_in_bounds(room, position)) continue;
            visible = visible || gbs::dungeon_exploration_is_marked(runtime_state, room, position);
            blocked = blocked || gbs::dungeon_cell_blocked(room, position);
            has_player = has_player ||
                (runtime_state.position.x == position.x && runtime_state.position.y == position.y);
        }
    }
    if (has_player) return 'P';
    if (!visible) return '?';
    return blocked ? 'X' : '.';
}

void rebuild_dungeon_sidebar_text() {
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    const int map_width = dungeon_map_width(room);
    const int map_height = dungeon_map_height(room);
    const int max_scroll_x = dungeon_map_max_scroll(map_width, 6);
    const int max_scroll_y = dungeon_map_max_scroll(map_height, 5);
    int origin_x = interaction_mode == DungeonInteractionMode::Map
        ? map_scroll_x
        : runtime_state.position.x / 2 - 2;
    int origin_y = interaction_mode == DungeonInteractionMode::Map
        ? map_scroll_y
        : runtime_state.position.y / 2 - 2;
    if (origin_x < 0) origin_x = 0;
    if (origin_y < 0) origin_y = 0;
    if (origin_x > max_scroll_x) origin_x = max_scroll_x;
    if (origin_y > max_scroll_y) origin_y = max_scroll_y;

    for (int row = 0; row < 5; ++row) {
        for (int column = 0; column < 6; ++column) {
            const int map_x = origin_x + column;
            const int map_y = origin_y + row;
            const char glyph = map_x < map_width && map_y < map_height
                ? dungeon_map_cell_glyph(room, map_x, map_y)
                : ' ';
            // Keep unexplored cells blank in the sidebar and full map.
            dungeon_sidebar_map_rows[row][column] = glyph == '?' ? ' ' : glyph;
        }
        dungeon_sidebar_map_rows[row][6] = '\0';
    }

    const char* hp_text = dungeon_hp_text(dungeon_player_hp());
    if (project.compass_enabled) {
        dungeon_sidebar_hp_text[0] = gbs::dungeon_direction_glyph(runtime_state.direction);
        dungeon_sidebar_hp_text[1] = ' ';
        dungeon_sidebar_hp_text[2] = 'H';
        dungeon_sidebar_hp_text[3] = 'P';
        dungeon_sidebar_hp_text[4] = hp_text[3];
        dungeon_sidebar_hp_text[5] = hp_text[4];
        dungeon_sidebar_hp_text[6] = '\0';
    } else {
        dungeon_copy_sidebar_text(dungeon_sidebar_hp_text, sizeof(dungeon_sidebar_hp_text), hp_text);
    }

    const bool has_item = project.inventory_enabled && project.inventory_items != nullptr && project.inventory_item_count > 0;
    const gbs::DungeonCrawlerInventoryItemData* item = has_item ? &project.inventory_items[0] : nullptr;
    dungeon_copy_sidebar_text(
        dungeon_sidebar_item_text,
        sizeof(dungeon_sidebar_item_text),
        item != nullptr && item->label != nullptr ? item->label : "ITEM"
    );
    int quantity = item != nullptr && gbs::is_valid_dungeon_crawler_inventory_item(*item)
        ? event_state.inventory[item->item_index]
        : 0;
    if (quantity < 0) quantity = 0;
    if (quantity > 99) quantity = 99;
    dungeon_sidebar_count_text[0] = 'Q';
    dungeon_sidebar_count_text[1] = 'T';
    dungeon_sidebar_count_text[2] = 'D';
    dungeon_sidebar_count_text[3] = ' ';
    dungeon_sidebar_count_text[4] = static_cast<char>('0' + quantity / 10);
    dungeon_sidebar_count_text[5] = static_cast<char>('0' + quantity % 10);
    dungeon_sidebar_count_text[6] = '\0';
}

void rebuild_dungeon_map_text() {
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    const int map_width = dungeon_map_width(room);
    const int map_height = dungeon_map_height(room);
    const int max_scroll_x = dungeon_map_max_scroll(map_width, 15);
    const int max_scroll_y = dungeon_map_max_scroll(map_height, 2);
    if (map_scroll_x > max_scroll_x) map_scroll_x = max_scroll_x;
    if (map_scroll_y > max_scroll_y) map_scroll_y = max_scroll_y;
    size_t cursor = 0;
    for (const char* label = "MAPA P=VOCE\n"; *label != '\0'; ++label) {
        dungeon_map_text[cursor++] = *label;
    }
    for (int row = 0; row < 2; ++row) {
        for (int column = 0; column < 15; ++column) {
            const int map_x = map_scroll_x + column;
            const int map_y = map_scroll_y + row;
            const char glyph = map_x < map_width && map_y < map_height
                ? dungeon_map_cell_glyph(room, map_x, map_y)
                : ' ';
            dungeon_map_text[cursor++] = glyph == '?' ? ' ' : glyph;
        }
        dungeon_map_text[cursor++] = row == 1 ? '\0' : '\n';
    }
}

void show_dungeon_map() {
    if (!project.map_enabled) return;
    map_scroll_x = runtime_state.position.x / 2 - 7;
    map_scroll_y = runtime_state.position.y / 2;
    if (map_scroll_x < 0) map_scroll_x = 0;
    if (map_scroll_y < 0) map_scroll_y = 0;
    rebuild_dungeon_map_text();
    interaction_mode = DungeonInteractionMode::Map;
    dungeon_lateral_hud_visible = true;
    gbs::show_dialogue(map_dialogue, &map_line, 1, 0);
    gbs::set_dialogue_frame(map_dialogue, gbs::dialogue_frame_default);
    gbs::set_dialogue_text_speed(map_dialogue, 0);
}

void mark_dungeon_exploration() {
    if (project.map_enabled) {
        gbs::dungeon_exploration_mark(
            runtime_state,
            project.rooms[current_room_index],
            runtime_state.position
        );
    }
}

bool update_dungeon_map(const gbs::InputState& input) {
    if (interaction_mode != DungeonInteractionMode::Map) return false;
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    const int max_scroll_x = dungeon_map_max_scroll(dungeon_map_width(room), 15);
    const int max_scroll_y = dungeon_map_max_scroll(dungeon_map_height(room), 2);
    bool changed = false;
    if (input.was_pressed(gbs::ButtonLeft) && map_scroll_x > 0) {
        --map_scroll_x;
        changed = true;
    } else if (input.was_pressed(gbs::ButtonRight) && map_scroll_x < max_scroll_x) {
        ++map_scroll_x;
        changed = true;
    } else if (input.was_pressed(gbs::ButtonUp) && map_scroll_y > 0) {
        --map_scroll_y;
        changed = true;
    } else if (input.was_pressed(gbs::ButtonDown) && map_scroll_y < max_scroll_y) {
        ++map_scroll_y;
        changed = true;
    }
    if (changed) {
        rebuild_dungeon_map_text();
        gbs::show_dialogue(map_dialogue, &map_line, 1, 0);
        gbs::set_dialogue_frame(map_dialogue, gbs::dialogue_frame_default);
        gbs::set_dialogue_text_speed(map_dialogue, 0);
        return true;
    }
    if (input.was_pressed(gbs::ButtonA) || input.was_pressed(gbs::ButtonB)) {
        gbs::hide_dialogue(map_dialogue);
        interaction_mode = DungeonInteractionMode::None;
        dungeon_lateral_hud_visible = false;
    }
    return true;
}

void show_dungeon_battle_menu() {
    interaction_mode = DungeonInteractionMode::Battle;
    dungeon_lateral_hud_visible = true;
    gbs::show_dialogue_choices(
        interaction_dialogue,
        &interaction_line,
        1,
        0,
        battle_choices,
        2
    );
    gbs::set_dialogue_frame(interaction_dialogue, gbs::dialogue_frame_battle_menu);
}

void sync_runtime_telemetry() {
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = current_room_index;
    runtime_telemetry.flag_bits = 0;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
    }
    runtime_telemetry.player_x = runtime_state.position.x;
    runtime_telemetry.player_y = runtime_state.position.y;
    runtime_telemetry.player_direction = static_cast<int>(runtime_state.direction);
    runtime_telemetry.actor_count = static_cast<int>(room.actor_count);
    runtime_telemetry.first_actor_x = room.actor_count > 0 ? room.actors[0].position.x : -1;
    runtime_telemetry.first_actor_y = room.actor_count > 0 ? room.actors[0].position.y : -1;
    runtime_telemetry.first_actor_direction = -1;
    runtime_telemetry.first_actor_visible = room.actor_count > 0
        && dungeon_actor_is_enabled(0)
        && !(dungeon_enemy_defeated && project.battle.enemy_actor_index == 0) ? 1 : 0;
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    runtime_telemetry.current_tile_flags = battle_state.active ? battle_state.enemy_hp : 0;
    runtime_telemetry.current_tile_slope = battle_state.active ? battle_state.player_hp : 0;
    runtime_telemetry.room_change_count = dungeon_enemy_defeated ? 1 : 0;
    gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
}

void fill_rect(int left, int top, int right, int bottom, uint16_t tile,
    gbs::BackgroundLayer layer = gbs::BackgroundLayer::BG1) {
    for (int y = top; y < bottom; ++y) {
        for (int x = left; x < right; ++x) {
            gbs::set_bg_tile(layer, x, y, 32, 32, tile);
        }
    }
}

void draw_view() {
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    if (cached_view_room == current_room_index &&
        cached_view_position.x == runtime_state.position.x &&
        cached_view_position.y == runtime_state.position.y &&
        cached_view_direction == runtime_state.direction) {
        return;
    }
    if (room.background_index >= 0 && static_cast<size_t>(room.background_index) < project.background_count) {
        // An authored dungeon viewport is already the first-person camera. Keep
        // the procedural fallback unpainted, but leave BG0 enabled because it
        // is the fixed UI layer used by the approved HUD and dialogue box.
        fill_rect(0, 0, 30, 20, 0, gbs::BackgroundLayer::BG0);
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
        cached_view_room = current_room_index;
        cached_view_position = runtime_state.position;
        cached_view_direction = runtime_state.direction;
        return;
    }
    fill_rect(0, 0, 30, 20, 0);
    fill_rect(0, 0, 30, 2, 3);
    fill_rect(0, 18, 30, 20, 1);

    const int max_depth = room.config.view_distance < 8 ? room.config.view_distance : 8;
    for (int distance = max_depth; distance >= 1; --distance) {
        const int inset_x = distance * 2;
        const int inset_y = distance;
        const int left = inset_x < 14 ? inset_x : 14;
        const int right = 30 - left;
        const int top = inset_y < 9 ? inset_y : 9;
        const int bottom = 20 - top;
        const gbs::DungeonViewCell ahead = gbs::dungeon_view_cell(room, runtime_state, distance, 0);
        const gbs::DungeonViewCell left_cell = gbs::dungeon_view_cell(room, runtime_state, distance - 1, -1);
        const gbs::DungeonViewCell right_cell = gbs::dungeon_view_cell(room, runtime_state, distance - 1, 1);

        if (left_cell.blocked) {
            fill_rect(left, top, left + 1, bottom, 2);
        }
        if (right_cell.blocked) {
            fill_rect(right - 1, top, right, bottom, 2);
        }
        if (ahead.blocked) {
            fill_rect(left, top, right, bottom, static_cast<uint16_t>(distance % 2 == 0 ? 2 : 3));
            break;
        }
    }

    gbs::set_bg_tile(gbs::BackgroundLayer::BG1, 1, 1, 32, 32, static_cast<uint16_t>(4 + static_cast<int>(runtime_state.direction)));
    cached_view_room = current_room_index;
    cached_view_position = runtime_state.position;
    cached_view_direction = runtime_state.direction;
}

void apply_room_visuals() {
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    invalidate_dungeon_view_cache();
    // Streamed rooms already uploaded their scoped palettes and tiles in
    // stream_resources_for_room(). Reloading every project asset here would
    // overwrite the active room palette with the next asset in the campaign
    // (for example, the energy-cell palette over the sentinel sprite).
    const bool streamed_assets_are_uploaded = assets_are_streamed
        && project.resource_bank_upload_source_count > 0;
    if (!streamed_assets_are_uploaded) {
        for (size_t index = 0; index < project.bg_palette_count; ++index) {
            gbs::load_palette(project.bg_palettes[index], false);
        }
        for (size_t index = 0; index < project.obj_palette_count; ++index) {
            gbs::load_palette(project.obj_palettes[index], true);
        }
        for (size_t index = 0; index < project.tile_asset_count; ++index) {
            gbs::load_tiles(project.tile_assets[index]);
        }
    }
    // Scene palettes can reuse the UI banks. Restore the dialogue/map glyphs
    // before configuring the authored HUD and drawing the dungeon overlays.
    gbs::render_ui_assets();
    if (room.background_index >= 0 && static_cast<size_t>(room.background_index) < project.background_count) {
        const gbs::DungeonCrawlerBackgroundData& background = project.backgrounds[room.background_index];
        gbs::set_backdrop_color(background.backdrop_color);
        // BG0 is reserved for the fixed UI layer (HUD/dialogue); the authored
        // dungeon viewport is loaded on the world layer instead.
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
        gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
        gbs::set_bg_priority(background.layer, 2);
        for (int layer = 1; layer < 4; ++layer) {
            const auto candidate = static_cast<gbs::BackgroundLayer>(layer);
            gbs::set_bg_enabled(candidate, candidate == background.layer);
        }
        gbs::set_bg_scroll(background.layer, 0, 0);
        gbs::load_tilemap(background.layer, background.tilemap);
    } else {
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
    }
    gbs::apply_video_composition(room.video);
    if (room.background_index < 0 || static_cast<size_t>(room.background_index) >= project.background_count) {
        // The procedural view uses the world plane; BG0 stays above the
        // image HUD for text and dialogue instead of covering its bottom.
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, true);
        gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 2);
        gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    }
}

bool persist_dungeon_crawler_runtime_state(int slot_index) {
    if (!gbastudio_dungeon_crawler_project::save_enabled ||
        slot_index < 0 ||
        static_cast<size_t>(slot_index) >= gbastudio_dungeon_crawler_project::save_bank.slot_count) {
        return false;
    }
    gbs::UniversalSaveData save_data {};
    if (!capture_dungeon_runtime_snapshot(save_data)) {
        return false;
    }
    ++runtime_save_sequence;
    const gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "DUNGEON",
        gbs::frame_count(),
        runtime_save_sequence,
        static_cast<uint16_t>(current_room_index),
        static_cast<uint16_t>(runtime_state.direction)
    );
    return gbs::write_save_slot_record(
        gbastudio_dungeon_crawler_project::save_bank,
        static_cast<size_t>(slot_index),
        &save_data,
        sizeof(save_data),
        metadata,
        runtime_save_sequence
    ) == gbs::SaveStatus::Ok;
}

bool restore_dungeon_crawler_runtime_state(int slot_index) {
    if (!gbastudio_dungeon_crawler_project::save_enabled) {
        return false;
    }
    if (slot_index < 0) {
        slot_index = gbs::find_latest_save_slot(
            gbastudio_dungeon_crawler_project::save_bank
        );
    }
    if (slot_index < 0 ||
        static_cast<size_t>(slot_index) >= gbastudio_dungeon_crawler_project::save_bank.slot_count) {
        return false;
    }
    gbs::UniversalSaveData save_data {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
            gbastudio_dungeon_crawler_project::save_bank,
            static_cast<size_t>(slot_index),
            &save_data,
            sizeof(save_data),
            nullptr,
            &bytes_read) != gbs::SaveStatus::Ok ||
        bytes_read != sizeof(save_data) ||
        !apply_dungeon_runtime_snapshot(save_data)) {
        return false;
    }
    runtime_save_sequence = gbs::inspect_save_slot(
        gbastudio_dungeon_crawler_project::save_bank,
        static_cast<size_t>(slot_index)
    ).sequence;
    return true;
}

bool apply_dungeon_event_warp() {
    if (event_state.current_room == current_room_index) return false;
    if (event_state.current_room < 0 ||
        static_cast<size_t>(event_state.current_room) >= project.room_count) {
        event_state.current_room = current_room_index;
        return false;
    }

    const int target_room = event_state.current_room;
    const gbs::Vec2i requested_position { event_state.player_x, event_state.player_y };
    current_room_index = target_room;
    reset_dungeon_actor_visibility();
    runtime_state = gbs::make_dungeon_crawler_runtime_state(project.rooms[current_room_index]);
    if (!gbs::dungeon_cell_blocked(project.rooms[current_room_index], requested_position)) {
        runtime_state.position = requested_position;
        mark_dungeon_exploration();
    }
    if (event_state.player_direction >= 0 && event_state.player_direction <= 3) {
        runtime_state.direction = dungeon_direction_from_event(event_state.player_direction);
    }

    interaction_mode = DungeonInteractionMode::None;
    dungeon_lateral_hud_visible = false;
    battle_state = gbs::DungeonCrawlerBattleState {};
    dungeon_enemy_defeated = false;
    notice_returns_to_battle = false;
    gbs::hide_dialogue(dialogue);
    gbs::hide_dialogue(interaction_dialogue);
    gbs::hide_dialogue(map_dialogue);
    gbs::stop_event_runner(runtime_event_runner);
    runtime_event_wait_frames = 0;
    runtime_script_controls_dialogue = false;
    reset_trigger_states();
    if (!stream_resources_for_room(project.rooms[current_room_index])) {
        return false;
    }
    apply_room_visuals();
    gbastudio_dialogue_ui::configure_for_scene(project.rooms[current_room_index].name);
    event_state.current_room = current_room_index;
    event_state.player_x = runtime_state.position.x;
    event_state.player_y = runtime_state.position.y;
    event_state.player_direction = dungeon_event_direction(runtime_state.direction);
    if (gbs::has_event_script(project.rooms[current_room_index].on_enter)) {
        gbs::start_event_runner(runtime_event_runner, project.rooms[current_room_index].on_enter);
    }
    return true;
}

void consume_event_state() {
    consume_dungeon_actor_commands();
    gbs::consume_scene_transition_visual_effect_event(event_state);
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count
    );
    if (event_state.last_dialogue >= 0) {
        gbs::show_dialogue(
            dialogue,
            project.dialogue_lines,
            project.dialogue_line_count,
            event_state.last_dialogue
        );
        gbs::set_dialogue_frame(dialogue, gbs::dialogue_frame_default);
        event_state.last_dialogue = -1;
        runtime_script_controls_dialogue = dialogue.visible;
    }
    if (event_state.last_sfx >= 0) {
        if (static_cast<size_t>(event_state.last_sfx) < project.sfx_asset_count) {
            gbs::play_sfx(project.sfx_assets[event_state.last_sfx]);
        }
        event_state.last_sfx = -1;
    }
    if (event_state.last_pcm_sfx >= 0) {
        if (static_cast<size_t>(event_state.last_pcm_sfx) < project.pcm_asset_count) {
            gbs::play_pcm_sfx(
                project.pcm_assets[event_state.last_pcm_sfx],
                static_cast<uint8_t>(event_state.last_pcm_sfx_priority),
                static_cast<uint8_t>(event_state.last_pcm_sfx_volume)
            );
        }
        event_state.last_pcm_sfx = -1;
    }
    if (event_state.last_music >= 0) {
        if (static_cast<size_t>(event_state.last_music) < project.music_asset_count) {
            gbs::play_music(project.music_assets[event_state.last_music]);
        }
        event_state.last_music = -1;
    }
    if (event_state.last_tracker_music >= 0) {
        if (static_cast<size_t>(event_state.last_tracker_music) < project.tracker_asset_count) {
            gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music]);
        }
        event_state.last_tracker_music = -1;
    }
    if (event_state.audio_mute_changed) {
        gbs::set_audio_channel_muted(
            gbs::audio_channel_from_event_value(event_state.audio_mute_channel),
            event_state.audio_mute_enabled
        );
        event_state.audio_mute_changed = false;
    }
    if (event_state.audio_volume_changed) {
        gbs::set_audio_channel_volume(
            gbs::audio_channel_from_event_value(event_state.audio_volume_channel),
            static_cast<uint8_t>(event_state.audio_volume)
        );
        event_state.audio_volume_changed = false;
    }
    if (event_state.audio_fade_changed) {
        gbs::fade_audio_channel_volume(
            gbs::audio_channel_from_event_value(event_state.audio_fade_channel),
            static_cast<uint8_t>(event_state.audio_fade_target_volume),
            static_cast<uint16_t>(event_state.audio_fade_frames)
        );
        event_state.audio_fade_changed = false;
    }
    apply_dungeon_event_warp();
    if (event_state.stop_music) {
        gbs::stop_music();
        gbs::stop_tracker_music();
        gbs::stop_pcm_music();
        event_state.stop_music = false;
    }
    if (event_state.close_dialogue) {
        gbs::hide_dialogue(dialogue);
        event_state.close_dialogue = false;
        runtime_script_controls_dialogue = false;
    }
    if (event_state.wait_frames > 0) {
        runtime_event_wait_frames = event_state.wait_frames;
        event_state.wait_frames = 0;
    }
    if (event_state.save_request != 0) {
        const int request = event_state.save_request;
        const int slot_index = event_state.save_request_slot;
        if (request == 1) {
            persist_dungeon_crawler_runtime_state(slot_index);
        } else if (request == 2 && restore_dungeon_crawler_runtime_state(slot_index)) {
            reset_trigger_states();
            stream_resources_for_room(project.rooms[current_room_index]);
            apply_room_visuals();
            gbs::stop_event_runner(runtime_event_runner);
            runtime_event_wait_frames = 0;
            runtime_script_controls_dialogue = false;
        } else if (request == 3 &&
            gbastudio_dungeon_crawler_project::save_enabled &&
            slot_index >= 0 &&
            static_cast<size_t>(slot_index) < gbastudio_dungeon_crawler_project::save_bank.slot_count) {
            gbs::clear_save_slot(
                gbastudio_dungeon_crawler_project::save_bank,
                static_cast<size_t>(slot_index)
            );
        }
        event_state.save_request = 0;
        event_state.save_request_slot = -1;
    }
}

bool start_runtime_event_script(gbs::EventScript script) {
    runtime_event_wait_frames = 0;
    runtime_script_controls_dialogue = false;
    if (!gbs::has_event_script(script)) {
        return false;
    }
    gbs::start_event_runner(runtime_event_runner, script);
    return true;
}

bool update_runtime_event_script(const gbs::InputState& input) {
    if (runtime_script_controls_dialogue && dialogue.visible) {
        gbs::advance_dialogue(dialogue, input);
        if (!dialogue.visible) {
            runtime_script_controls_dialogue = false;
        }
        return true;
    }
    if (runtime_event_wait_frames > 0) {
        --runtime_event_wait_frames;
        return true;
    }
    if (!gbs::event_runner_is_active(runtime_event_runner)) {
        return false;
    }
    gbs::update_event_runner(runtime_event_runner, event_state);
    consume_event_state();
    return true;
}

bool run_button_event_binding() {
    if (!gbs::update_button_event_bindings(event_state)) {
        return false;
    }
    const int script_index = event_state.last_script;
    const bool overrides_default = event_state.last_button_binding_overrides_default;
    event_state.last_script = -1;
    event_state.last_button_binding_overrides_default = false;
    if (gbs::is_valid_dungeon_crawler_project_script_index(project, script_index)) {
        gbs::run_event_script(event_state, project.scripts[script_index]);
        consume_event_state();
    }
    return overrides_default;
}

bool start_dungeon_battle(size_t actor_index) {
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    if (!project.battle_enabled || !room.battle_enabled || dungeon_enemy_defeated ||
        project.battle.enemy_actor_index != static_cast<int>(actor_index) ||
        !gbs::is_valid_dungeon_crawler_battle_data(project.battle, room.actor_count)) {
        return false;
    }
    // A battle owns the interaction layer. Clear any event dialogue that may
    // still be visible so it cannot leave a stale full-width box under the
    // battle menu.
    gbs::hide_dialogue(dialogue);
    runtime_script_controls_dialogue = false;
    battle_state = gbs::make_dungeon_crawler_battle_state(project.battle);
    show_dungeon_battle_menu();
    return true;
}

bool update_dungeon_interaction(const gbs::InputState& input) {
    if (interaction_mode == DungeonInteractionMode::Map) {
        return update_dungeon_map(input);
    }
    if (interaction_mode == DungeonInteractionMode::None) {
        if (input.was_pressed(gbs::ButtonStart)) {
            if (project.map_enabled) {
                show_dungeon_map();
            } else {
                show_dungeon_inventory();
            }
            return interaction_mode != DungeonInteractionMode::None;
        }
        if (input.was_pressed(gbs::ButtonSelect)) {
            show_dungeon_inventory();
            return interaction_mode != DungeonInteractionMode::None;
        }
        return false;
    }

    const bool accepted = input.was_pressed(gbs::ButtonA);
    const bool cancelled = input.was_pressed(gbs::ButtonB);
    gbs::advance_dialogue(interaction_dialogue, input);
    if (interaction_dialogue.visible) {
        return true;
    }
    if (cancelled || !accepted) {
        interaction_mode = DungeonInteractionMode::None;
        dungeon_lateral_hud_visible = false;
        return true;
    }

    if (interaction_mode == DungeonInteractionMode::Notice) {
        if (notice_returns_to_battle && battle_state.active && !dungeon_enemy_defeated) {
            show_dungeon_battle_menu();
        } else {
            interaction_mode = DungeonInteractionMode::None;
            dungeon_lateral_hud_visible = false;
        }
        return true;
    }

    const int selected = interaction_dialogue.last_choice_index;
    if (interaction_mode == DungeonInteractionMode::Inventory) {
        if (selected != 0 || project.inventory_items == nullptr || project.inventory_item_count == 0) {
            interaction_mode = DungeonInteractionMode::None;
            dungeon_lateral_hud_visible = false;
            return true;
        }
        const gbs::DungeonCrawlerInventoryItemData& item = project.inventory_items[0];
        if (!gbs::is_valid_dungeon_crawler_inventory_item(item) ||
            event_state.inventory[item.item_index] <= 0) {
            show_dungeon_notice("SEM CELULA.", false);
            return true;
        }
        --event_state.inventory[item.item_index];
        exploration_player_hp = exploration_player_hp + item.heal_amount > 3
            ? 3
            : exploration_player_hp + item.heal_amount;
        if (battle_state.active && battle_state.player_hp < 3) {
            battle_state.player_hp = battle_state.player_hp + item.heal_amount > 3
                ? 3
                : battle_state.player_hp + item.heal_amount;
        }
        show_dungeon_notice("CELULA USADA.", false);
        return true;
    }

    if (selected == 1) {
        battle_state.active = false;
        interaction_mode = DungeonInteractionMode::None;
        dungeon_lateral_hud_visible = false;
        return true;
    }
    if (!gbs::dungeon_battle_player_attack(battle_state, project.battle)) {
        interaction_mode = DungeonInteractionMode::None;
        dungeon_lateral_hud_visible = false;
        return true;
    }
    if (gbs::dungeon_battle_is_victory(battle_state)) {
        dungeon_enemy_defeated = true;
        if (gbs::is_valid_inventory_item_index(project.battle.reward_item)) {
            event_state.inventory[project.battle.reward_item] += project.battle.reward_quantity;
        }
        show_dungeon_notice("VITORIA.", false);
        return true;
    }
    gbs::dungeon_battle_enemy_turn(battle_state, project.battle);
    if (gbs::dungeon_battle_is_defeat(battle_state)) {
        show_dungeon_notice("DERROTA.", false);
    } else {
        show_dungeon_notice("CONTRA-ATAQUE.", true);
    }
    return true;
}

bool actor_view_coordinates(const gbs::DungeonCrawlerActorData& actor, int& distance, int& lateral) {
    const gbs::Vec2i forward = gbs::dungeon_forward_delta(runtime_state.direction);
    const int delta_x = actor.position.x - runtime_state.position.x;
    const int delta_y = actor.position.y - runtime_state.position.y;
    distance = delta_x * forward.x + delta_y * forward.y;
    lateral = delta_x * forward.y - delta_y * forward.x;
    return gbs::dungeon_actor_is_visible_in_view(
        distance,
        lateral,
        project.rooms[current_room_index].config.view_distance
    );
}

bool actor_is_ahead(const gbs::DungeonCrawlerActorData& actor, int& distance) {
    int lateral = 0;
    return actor_view_coordinates(actor, distance, lateral) && lateral == 0;
}

bool actor_is_occluded(int distance, int lateral) {
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    for (int nearer = 1; nearer < distance; ++nearer) {
        if (gbs::dungeon_view_cell(room, runtime_state, nearer, lateral).blocked) {
            return true;
        }
    }
    return false;
}

void draw_actors() {
    gbs::hide_all_sprites();
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    int sprite_index = 0;
    for (int distance = room.config.view_distance; distance >= 1 && sprite_index < 128; --distance) {
        for (size_t index = 0; index < room.actor_count && sprite_index < 128; ++index) {
            const gbs::DungeonCrawlerActorData& actor = room.actors[index];
            if (!dungeon_actor_is_enabled(index)) continue;
            if (dungeon_enemy_defeated && project.battle.enemy_actor_index == static_cast<int>(index)) {
                continue;
            }
            int actor_distance = 0;
            int lateral = 0;
            if (actor.metasprite == nullptr ||
                !actor_view_coordinates(actor, actor_distance, lateral) ||
                actor_distance != distance ||
                actor_is_occluded(actor_distance, lateral)) {
                continue;
            }
            const gbs::MetaSprite* metasprite = gbs::dungeon_runtime_metasprite(
                project,
                actor,
                actor_distance,
                room.config.view_distance
            );
            if (metasprite == nullptr) continue;
            const gbs::DungeonActorProjection projection = gbs::dungeon_project_actor(actor_distance, lateral);
            gbs::set_metasprite(sprite_index, *metasprite, gbs::Vec2i { projection.x, projection.y });
            sprite_index += metasprite->part_count;
        }
    }
}

void interact_with_actor(const gbs::InputState& input) {
    if (!input.was_pressed(gbs::ButtonA)) return;
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    for (size_t index = 0; index < room.actor_count; ++index) {
        if (!dungeon_actor_is_enabled(index)) continue;
        int distance = 0;
        if (actor_is_ahead(room.actors[index], distance) && distance == 1) {
            if (start_dungeon_battle(index)) {
                return;
            }
            start_runtime_event_script(room.actors[index].on_interact);
            return;
        }
    }
}

void update_triggers() {
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    const gbs::Rect player_area { runtime_state.position.x, runtime_state.position.y, 1, 1 };
    const size_t count = room.trigger_count < max_runtime_triggers ? room.trigger_count : max_runtime_triggers;
    for (size_t index = 0; index < count; ++index) {
        const gbs::RuntimeTriggerResult result = gbs::update_runtime_trigger(room.triggers[index], trigger_states[index], player_area);
        const gbs::EventScript script = gbs::runtime_trigger_script_for_result(room.triggers[index], result);
        if (gbs::has_event_script(script)) {
            start_runtime_event_script(script);
            return;
        }
    }
}

void reset_trigger_states() {
    for (size_t index = 0; index < max_runtime_triggers; ++index) {
        trigger_states[index] = gbs::RuntimeTriggerState {};
    }
}

void perform_action(const gbs::InputState& input) {
    if (runtime_state.action_frames_remaining > 0) {
        --runtime_state.action_frames_remaining;
        return;
    }
    const gbs::DungeonCrawlerRoomData& room = project.rooms[current_room_index];
    if (input.was_pressed(gbs::ButtonLeft)) {
        gbs::turn_dungeon_left(runtime_state);
        runtime_state.action_frames_remaining = room.config.turn_duration_frames;
    } else if (input.was_pressed(gbs::ButtonRight)) {
        gbs::turn_dungeon_right(runtime_state);
        runtime_state.action_frames_remaining = room.config.turn_duration_frames;
    } else if (input.was_pressed(gbs::ButtonUp)) {
        if (gbs::try_dungeon_step_forward(runtime_state, room)) mark_dungeon_exploration();
        runtime_state.action_frames_remaining = room.config.step_duration_frames;
    } else if (input.was_pressed(gbs::ButtonDown) && room.config.allow_backstep) {
        if (gbs::try_dungeon_step_backward(runtime_state, room)) mark_dungeon_exploration();
        runtime_state.action_frames_remaining = room.config.step_duration_frames;
    }
}

} // namespace

int initialize_dungeon_crawler_runtime() {
    gbs::init();
    gbs::init_dialogue(dialogue);
    gbs::init_dialogue(interaction_dialogue);
    gbs::init_dialogue(map_dialogue);
    gbs::init_hud(hud);
    gbs::set_hud_text(hud, "HP 03", "START: ITEM");
    gbs::init_event_state(event_state);
    gbs::init_event_runner(runtime_event_runner);
    gbs::reset_runtime_telemetry();
    gbs::set_backdrop_color(gbs::rgb15(2, 2, 4));
    if (!gbs::is_valid_dungeon_crawler_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) gbs::wait_vblank();
    }

    current_room_index = project.initial_room;
    reset_dungeon_actor_visibility();
    int entry_x = 0;
    int entry_y = 0;
    int restore_slot_index = -1;
    bool restored = false;
    bool resumed_from_transition = false;
#if GBS_MULTI_RUNTIME
    const bool restore_entry = gbs::consume_runtime_save_restore(
        gbs::RuntimeKind::DungeonCrawler,
        restore_slot_index
    );
    if (restore_entry) {
        restored = restore_dungeon_crawler_runtime_state(restore_slot_index);
        if (!restored) {
            return -1;
        }
    } else {
        resumed_from_transition = gbs::consume_runtime_transition(
            gbs::RuntimeKind::DungeonCrawler,
            event_state,
            current_room_index,
            entry_x,
            entry_y
        );
    }
#else
    restored = restore_dungeon_crawler_runtime_state(-1);
#endif
    gbs::init_resource_manager(resource_manager);
    if (current_room_index < 0 || static_cast<size_t>(current_room_index) >= project.room_count) {
        current_room_index = project.initial_room;
    }
    gbs::UniversalSaveData paused_data {};
    if (resumed_from_transition && gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::DungeonCrawler, current_room_index, paused_data)) {
        restored = apply_dungeon_runtime_snapshot(paused_data);
        if (!restored) return -1;
    }
    if (!restored) {
        runtime_state = gbs::make_dungeon_crawler_runtime_state(project.rooms[current_room_index]);
        exploration_player_hp = 3;
        if (project.inventory_enabled && project.inventory_items != nullptr) {
            for (size_t index = 0; index < project.inventory_item_count; ++index) {
                const gbs::DungeonCrawlerInventoryItemData& item = project.inventory_items[index];
                if (gbs::is_valid_dungeon_crawler_inventory_item(item)) {
                    event_state.inventory[item.item_index] = item.initial_quantity;
                }
            }
        }
    }
    if (resumed_from_transition && !restored) {
        const gbs::Vec2i requested { entry_x, entry_y };
        if (!gbs::dungeon_cell_blocked(project.rooms[current_room_index], requested)) {
            runtime_state.position = requested;
            mark_dungeon_exploration();
        }
    }
    mark_dungeon_exploration();
    // EventState starts with room 0, but a development launch may intentionally
    // begin in another room. Seed the event context from the selected room
    // before its on-enter script runs; otherwise the first consume_event_state()
    // would mistake the default value for a warp back to room 0.
    event_state.current_room = current_room_index;
    event_state.player_x = runtime_state.position.x;
    event_state.player_y = runtime_state.position.y;
    event_state.player_direction = dungeon_event_direction(runtime_state.direction);
    reset_trigger_states();
    if (!stream_resources_for_room(project.rooms[current_room_index])) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) gbs::wait_vblank();
    }
    apply_room_visuals();
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(project.rooms[current_room_index].name, true);
    if (!restored) {
        start_runtime_event_script(project.rooms[current_room_index].on_enter);
    } else if (battle_state.active && !dungeon_enemy_defeated) {
        show_dungeon_battle_menu();
    }
    return 0;
}

gbs::RuntimeAdapterFrameResult update_dungeon_crawler_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    gbastudio_dialogue_ui::configure_for_scene(project.rooms[current_room_index].name);
    const gbs::InputState input = gbs::begin_frame().input;
    gbs::tick_event_frame_counter(event_state);
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_requested()) {
        gbs::consume_scene_transition_visual_effect_event(event_state);
        return gbs::runtime_transition_pending()
            ? gbs::RuntimeAdapterFrameResult::Transition
            : gbs::RuntimeAdapterFrameResult::Continue;
    }
#endif
    gbs::set_event_input_state(event_state, input.held, input.pressed, input.released);
    gbs::update_hud_behavior(event_state, hud.visible);
    const bool button_binding_overrides_default =
        !dialogue.visible &&
        !interaction_dialogue.visible &&
        runtime_event_wait_frames <= 0 &&
        !gbs::event_runner_is_active(runtime_event_runner) &&
        run_button_event_binding();
#ifdef GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        return gbs::RuntimeAdapterFrameResult::Transition;
    }
#endif
    const bool script_active = update_runtime_event_script(input);
    if (!script_active && !button_binding_overrides_default) {
        const bool interaction_active = update_dungeon_interaction(input);
        if (!interaction_active) {
            perform_action(input);
            interact_with_actor(input);
        }
    }
    gbs::set_event_player_actor_state(
        event_state,
        runtime_state.position.x,
        runtime_state.position.y,
        dungeon_event_direction(runtime_state.direction),
        1
    );
    if (!script_active) {
        update_triggers();
    }
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        return gbs::RuntimeAdapterFrameResult::Transition;
    }
#endif
    return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_dungeon_crawler_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    draw_view();
    draw_actors();
    sync_runtime_telemetry();
    // The dungeon HUD is fixed chrome. Reassert its authored state after
    // room/camera rendering so a scene update cannot leave the top bar
    // hidden while dialogue remains visible.
    if (dungeon_lateral_hud_active()) {
        if (dungeon_lateral_hud_visible || !dungeon_string_equals(gbs::active_hud_layout()->id, "hud-usina-lateral")) {
            rebuild_dungeon_sidebar_text();
            const char* text_slots[] = {
                dungeon_sidebar_map_rows[0],
                dungeon_sidebar_map_rows[1],
                dungeon_sidebar_map_rows[2],
                dungeon_sidebar_map_rows[3],
                dungeon_sidebar_map_rows[4],
                dungeon_sidebar_hp_text,
                dungeon_sidebar_item_text,
                dungeon_sidebar_count_text
            };
            gbs::set_hud_text_slots(hud, text_slots, 8);
        } else {
            gbs::hide_hud(hud);
        }
    } else {
        gbs::set_hud_text(
            hud,
            project.compass_enabled ? dungeon_compass_hp_text(dungeon_player_hp()) : dungeon_hp_text(dungeon_player_hp()),
            interaction_mode == DungeonInteractionMode::Map
                ? "A/B: FECHAR"
                : battle_state.active
                    ? "A: ATACAR"
                    : project.map_enabled
                        ? "START: MAP"
                        : (project.inventory_enabled ? "SEL: ITEM" : "A: INTERACT")
        );
    }
    // Hidden dialogues clear their old BG0 rectangles before the fixed HUD.
    // Visible dialogues render afterward so they remain above the HUD.
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    // Every hidden dialogue clears its old BG0 rectangle. Clear all hidden
    // surfaces first; otherwise an inactive interaction panel erases the
    // visible map (or an inactive map erases an authored event dialogue).
    if (!dialogue.visible) gbs::draw_dialogue(dialogue);
    if (!map_dialogue.visible) gbs::draw_dialogue(map_dialogue);
    if (!interaction_dialogue.visible) gbs::draw_dialogue(interaction_dialogue);
    gbs::draw_hud(hud);
    if (dialogue.visible) gbs::draw_dialogue(dialogue);
    if (map_dialogue.visible) gbs::draw_dialogue(map_dialogue);
    if (interaction_dialogue.visible) gbs::draw_dialogue(interaction_dialogue);
    gbs::wait_vblank();
}

void leave_dungeon_crawler_runtime() {
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_target() == gbs::RuntimeKind::Menu && event_state.scene_stack_count > 0) {
        gbs::UniversalSaveData data {};
        gbs::clear_suspended_runtime_save();
        if (capture_dungeon_runtime_snapshot(data)) {
            gbs::capture_suspended_runtime_save(data);
        }
    }
#endif
    gbs::release_resource_bank_group(resource_manager, active_resource_banks);
}

extern "C" void GBS_DUNGEON_CRAWLER_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    dungeon_initialization_result = initialize_dungeon_crawler_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_DUNGEON_CRAWLER_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_dungeon_crawler_runtime(context);
}

extern "C" void GBS_DUNGEON_CRAWLER_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_dungeon_crawler_runtime(context);
}

extern "C" void GBS_DUNGEON_CRAWLER_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_dungeon_crawler_runtime();
}

extern "C" int GBS_DUNGEON_CRAWLER_RUNTIME_ENTRY() {
    dungeon_initialization_result = initialize_dungeon_crawler_runtime();
    if (dungeon_initialization_result != 0) {
        leave_dungeon_crawler_runtime();
        return dungeon_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::DungeonCrawler,
            current_room_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_dungeon_crawler_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_dungeon_crawler_runtime();
            return -1;
        }
        render_dungeon_crawler_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_dungeon_crawler_runtime();
            return 0;
        }
    }
}
