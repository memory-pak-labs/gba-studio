#include <cassert>
#include "gbs/point_click.hpp"

namespace {

void test_point_click_project_validation_and_lookup() {
    const uint16_t entries[65] = {};
    const gbs::PointClickBackgroundData backgrounds[] = {
        { "room_bg", gbs::BackgroundLayer::BG1, gbs::TileMapAsset { entries, 65, 1 }, 31 }
    };
    const gbs::DialogueLine lines[] = {
        { "Look" },
        { "Door" },
        { "Key" },
        { "Locked" }
    };
    const gbs::EventCommand click_commands[] = {
        { gbs::EventOp::SetVariable, 1, 7, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::PointClickHotspotData hotspots[] = {
        {
            "door",
            gbs::Rect { 8, 8, 16, 16 },
            1,
            gbs::EventScript { click_commands, 2 },
            1,
            "room_group",
            0,
            -1,
            3,
            gbs::EventScript { click_commands, 2 }
        },
        {
            "key",
            gbs::Rect { 32, 8, 16, 16 },
            2,
            gbs::empty_event_script(),
            -1,
            "room_group",
            -1,
            0,
            -1,
            gbs::empty_event_script()
        }
    };
    const gbs::PointClickSceneData scenes[] = {
        {
            "room",
            0,
            hotspots,
            2,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            "room_group",
            4
        },
        {
            "closeup",
            0,
            nullptr,
            0,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            "room_group"
        }
    };
    const gbs::ResourceBank banks[] = {
        { gbs::ResourcePoolKind::BgTiles, 0, 4, 1, "room_tiles" }
    };
    const gbs::ResourceBankGroup resource_groups[] = {
        { "room_group", banks, 1 }
    };
    const gbs::PointClickInventoryItemData items[] = {
        { "key", 2, 2 }
    };
    const gbs::PointClickProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        backgrounds,
        1,
        scenes,
        2,
        0,
        gbs::Vec2i { 12, 12 },
        2,
        lines,
        4,
        nullptr,
        0,
        banks,
        1,
        resource_groups,
        1,
        items,
        1
    };

    gbs::EventState state {};
    gbs::PointClickCursorState cursor = gbs::point_click_cursor_from_project(project);

    assert(gbs::is_valid_point_click_project_data(project));
    state.current_room = 0;
    assert(gbs::point_click_scripted_scene_destination(project, 0, state) == -1);
    state.current_room = 1;
    assert(gbs::point_click_scripted_scene_destination(project, 0, state) == 1);
    state.current_room = 9;
    assert(gbs::point_click_scripted_scene_destination(project, 0, state) == -1);
    state.current_room = 0;
    assert(gbs::point_click_scene_for(project, 0) == &scenes[0]);
    assert(gbs::point_click_scene_for(project, 0)->cursor_speed_pixels == 4);
    assert(gbs::point_click_scene_for(project, 8) == nullptr);
    assert(gbs::point_click_scene_name(project, 0)[0] == 'r');
    assert(gbs::point_click_scene_name(project, 8) == nullptr);
    assert(gbs::point_click_item_for(project, 0) == &items[0]);
    assert(gbs::point_click_item_for(project, -1) == nullptr);
    assert(gbs::point_click_hotspot_at(scenes[0], gbs::Vec2i { 12, 12 }) == &hotspots[0]);
    assert(gbs::point_click_hotspot_at(scenes[0], gbs::Vec2i { 1, 1 }) == nullptr);
    assert(gbs::point_click_scene_enter_script(project, 9).command_count == 0);
    assert(gbs::point_click_cursor_from_project(project).position_pixels.x == 12);
    assert(gbs::point_click_cursor_rect(gbs::point_click_cursor_from_project(project)).width == 1);
    assert(gbs::find_point_click_scene_resource_bank_group_index(project, scenes[0]) == 0);
    assert(gbs::resource_bank_group_from_point_click_scene(project, scenes[0]).bank_count == 1);
    assert(gbs::resource_bank_batch_from_point_click_project(project).bank_count == 1);
    assert(gbs::is_valid_point_click_item_index(project, 0));
    assert(!gbs::point_click_item_is_owned(project, state, 0));
    assert(!gbs::point_click_hotspot_can_activate(project, state, cursor, hotspots[0]));
    gbs::point_click_grant_item(project, state, 0);
    cursor.selected_item_index = gbs::point_click_next_owned_item_index(project, state, -1);
    assert(cursor.selected_item_index == 0);
    assert(gbs::point_click_selected_item_name(project, cursor)[0] == 'k');
    assert(gbs::point_click_item_is_owned(project, state, 0));
    assert(gbs::point_click_hotspot_can_activate(project, state, cursor, hotspots[0]));
    assert(gbs::point_click_hotspot_success_script(hotspots[0], true).command_count == 2);
    assert(gbs::point_click_hotspot_success_script(hotspots[1], false).command_count == 0);
    cursor.selected_item_index = -1;
    assert(gbs::point_click_selected_item_name(project, cursor) == nullptr);
}

void test_point_click_save_data_roundtrip() {
    const gbs::DialogueLine lines[] = {
        { "Room" },
        { "Inside" },
        { "Key" }
    };
    const gbs::PointClickInventoryItemData items[] = {
        { "key", 2, 2 }
    };
    const gbs::PointClickSceneData scenes[] = {
        {
            "room",
            -1,
            nullptr,
            0,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            nullptr
        },
        {
            "inside",
            -1,
            nullptr,
            0,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            nullptr
        }
    };
    const gbs::PointClickProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        scenes,
        2,
        0,
        gbs::Vec2i { 120, 80 },
        2,
        lines,
        3,
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        items,
        1
    };
    gbs::PointClickCursorState cursor {
        gbs::Vec2i { 44, 91 },
        0
    };
    gbs::EventState event_state {};
    event_state.variables[2] = 1;
    event_state.variables[7] = 123;
    event_state.variables[gbs::event_variable_count - 1] = 909;

    gbs::PointClickSaveData save_data {};
    gbs::capture_point_click_save_data(save_data, 1, cursor, event_state, 3600, 6);
    assert(gbs::is_valid_point_click_save_data(project, save_data));
    assert(save_data.scene_index == 1);
    assert(save_data.cursor_x == 44);
    assert(save_data.cursor_y == 91);
    assert(save_data.selected_item_index == 0);
    assert(save_data.variables[7] == 123);
    assert(save_data.variables[gbs::event_variable_count - 1] == 909);
    assert(save_data.play_time_frames == 3600);
    assert(save_data.flags == 6);

    int restored_scene = 0;
    gbs::PointClickCursorState restored_cursor = gbs::point_click_cursor_from_project(project);
    gbs::EventState restored_event_state {};
    assert(gbs::apply_point_click_save_data(project, save_data, restored_scene, restored_cursor, restored_event_state));
    assert(restored_scene == 1);
    assert(restored_cursor.position_pixels.x == 44);
    assert(restored_cursor.position_pixels.y == 91);
    assert(restored_cursor.selected_item_index == 0);
    assert(restored_event_state.variables[2] == 1);
    assert(restored_event_state.variables[7] == 123);
    assert(restored_event_state.variables[gbs::event_variable_count - 1] == 909);

    save_data.scene_index = 99;
    assert(!gbs::apply_point_click_save_data(project, save_data, restored_scene, restored_cursor, restored_event_state));
}

void test_point_click_project_rejects_invalid_refs() {
    const uint16_t entries[] = { 0 };
    const gbs::PointClickBackgroundData backgrounds[] = {
        { "bg", gbs::BackgroundLayer::BG1, gbs::TileMapAsset { entries, 1, 1 }, 0 }
    };
    const gbs::DialogueLine lines[] = {
        { "Only" }
    };
    const gbs::PointClickHotspotData bad_hotspot[] = {
        {
            "bad",
            gbs::Rect { 0, 0, 0, 16 },
            0,
            gbs::empty_event_script(),
            -1,
            nullptr
        }
    };
    const gbs::PointClickSceneData bad_hotspot_scene[] = {
        {
            "bad",
            0,
            bad_hotspot,
            1,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            nullptr
        }
    };
    const gbs::PointClickProjectData invalid_hotspot {
        nullptr,
        0,
        nullptr,
        0,
        backgrounds,
        1,
        bad_hotspot_scene,
        1,
        0,
        gbs::Vec2i { 0, 0 },
        1,
        lines,
        1
    };
    const gbs::PointClickSceneData bad_bg_scene[] = {
        {
            "bad_bg",
            4,
            nullptr,
            0,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            nullptr
        }
    };
    const gbs::PointClickProjectData invalid_bg {
        nullptr,
        0,
        nullptr,
        0,
        backgrounds,
        1,
        bad_bg_scene,
        1,
        0,
        gbs::Vec2i { 0, 0 },
        1,
        lines,
        1
    };

    assert(!gbs::is_valid_point_click_project_data(invalid_hotspot));
    assert(!gbs::is_valid_point_click_project_data(invalid_bg));
}

void test_point_click_supports_layered_backgrounds_and_conditional_props() {
    const uint16_t entries[] = { 0 };
    const gbs::PointClickBackgroundData backgrounds[] = {
        { "sky", gbs::BackgroundLayer::BG3, gbs::TileMapAsset { entries, 1, 1 }, 0 },
        { "bench", gbs::BackgroundLayer::BG2, gbs::TileMapAsset { entries, 1, 1 }, 0 },
        { "foreground", gbs::BackgroundLayer::BG1, gbs::TileMapAsset { entries, 1, 1 }, 0 }
    };
    const gbs::MetaSpritePart prop_parts[] = {
        { 0, 0, 0, 0, false, false, 8, 8 }
    };
    const gbs::MetaSprite prop_metasprite { prop_parts, 1 };
    const gbs::SpriteAnimationFrame prop_frames[] = {
        { prop_metasprite, 1 }
    };
    const gbs::SpriteAnimation prop_idle { prop_frames, 1, true };
    const int background_indices[] = { 0, 1, 2 };
    const gbs::PointClickPropData props[] = {
        { "coupler", &prop_metasprite, &prop_idle, gbs::Vec2i { 112, 96 }, 3, 1 }
    };
    const gbs::PointClickSceneData scenes[] = {
        {
            "workshop",
            -1,
            nullptr,
            0,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            nullptr,
            0,
            background_indices,
            3,
            props,
            1
        }
    };
    const gbs::PointClickProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        backgrounds,
        3,
        scenes,
        1,
        0,
        gbs::Vec2i { 120, 80 },
        2,
        nullptr,
        0
    };
    gbs::EventState state {};

    assert(gbs::is_valid_point_click_project_data(project));
    assert(gbs::point_click_scene_background_count(scenes[0]) == 3);
    assert(gbs::point_click_scene_background_at(scenes[0], 0) == 0);
    assert(gbs::point_click_scene_background_at(scenes[0], 2) == 2);
    assert(gbs::point_click_scene_background_at(scenes[0], 3) == -1);
    assert(!gbs::point_click_prop_is_visible(props[0], state));
    state.variables[3] = 1;
    assert(gbs::point_click_prop_is_visible(props[0], state));
}

} // namespace

int main() {
    test_point_click_project_validation_and_lookup();
    test_point_click_save_data_roundtrip();
    test_point_click_project_rejects_invalid_refs();
    test_point_click_supports_layered_backgrounds_and_conditional_props();
    return 0;
}
