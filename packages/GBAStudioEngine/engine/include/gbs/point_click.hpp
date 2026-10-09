#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/audio.hpp"
#include "gbs/animation.hpp"
#include "gbs/assets.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/types.hpp"

namespace gbs {

struct PointClickBackgroundData {
    const char* name;
    BackgroundLayer layer;
    TileMapAsset tilemap;
    uint16_t backdrop_color;
};

struct PointClickInventoryItemData {
    const char* name;
    int variable_index;
    int dialogue_line_index;
};

struct PointClickHotspotData {
    const char* name;
    Rect area_pixels;
    int dialogue_line_index;
    EventScript on_click;
    int target_scene_index;
    const char* resource_bank_group_name;
    int required_item_index = -1;
    int give_item_index = -1;
    int unavailable_dialogue_line_index = -1;
    EventScript on_use_item = empty_event_script();
};

struct PointClickPropData {
    const char* name;
    const MetaSprite* metasprite;
    const SpriteAnimation* idle_animation;
    Vec2i position_pixels;
    int visible_variable_index = -1;
    int visible_variable_value = 1;
};

struct PointClickSceneData {
    const char* name;
    int background_index;
    const PointClickHotspotData* hotspots;
    size_t hotspot_count;
    EventScript on_enter;
    EventScript on_exit;
    const char* resource_bank_group_name;
    int cursor_speed_pixels = 0;
    const int* background_indices = nullptr;
    size_t background_count = 0;
    const PointClickPropData* props = nullptr;
    size_t prop_count = 0;
};

struct PointClickProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const PointClickBackgroundData* backgrounds;
    size_t background_count;
    const PointClickSceneData* scenes;
    size_t scene_count;
    int initial_scene;
    Vec2i cursor_start_pixels;
    int cursor_speed_pixels;
    const DialogueLine* dialogue_lines;
    size_t dialogue_line_count;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
    const PointClickInventoryItemData* inventory_items = nullptr;
    size_t inventory_item_count = 0;
    const SfxAsset* sfx_assets = nullptr;
    size_t sfx_asset_count = 0;
    const MusicAsset* music_assets = nullptr;
    size_t music_asset_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    const MetaSprite* cursor_metasprite = nullptr;
    const SpriteAnimation* cursor_idle_animation = nullptr;
    const SpriteAnimation* cursor_hover_animation = nullptr;
    const PaletteAsset* obj_palettes = nullptr;
    size_t obj_palette_count = 0;
    const SpriteAnimation* cursor_click_animation = nullptr;
};

inline void update_point_click_cursor_animator(
    SpriteAnimatorState& animator, const PointClickProjectData& project,
    bool hovering, bool clicked
) {
    update_sprite_animator(animator);
    const SpriteAnimation* next = hovering && project.cursor_hover_animation != nullptr
        ? project.cursor_hover_animation : project.cursor_idle_animation;
    if (clicked && project.cursor_click_animation != nullptr) {
        play_sprite_animation(animator, *project.cursor_click_animation);
        return;
    }
    if (animator.animation == project.cursor_click_animation && animator.playing) return;
    if (animator.animation != next) {
        if (next != nullptr) play_sprite_animation(animator, *next);
        else init_sprite_animator(animator);
    }
}

struct PointClickCursorState {
    Vec2i position_pixels;
    int selected_item_index;
};

struct PointClickSaveData {
    uint16_t scene_index;
    int16_t cursor_x;
    int16_t cursor_y;
    int16_t selected_item_index;
    int32_t variables[event_variable_count];
    uint32_t play_time_frames;
    uint16_t flags;
};

constexpr bool is_valid_point_click_scene_index(const PointClickProjectData& project, int scene_index) {
    return project.scenes != nullptr &&
        scene_index >= 0 &&
        static_cast<size_t>(scene_index) < project.scene_count;
}

constexpr int point_click_scripted_scene_destination(
    const PointClickProjectData& project,
    int current_scene_index,
    const EventState& state
) {
    return state.current_room != current_scene_index &&
        is_valid_point_click_scene_index(project, state.current_room)
        ? state.current_room
        : -1;
}

constexpr bool is_valid_point_click_background_index(const PointClickProjectData& project, int background_index) {
    return background_index < 0 ||
        (project.backgrounds != nullptr &&
            static_cast<size_t>(background_index) < project.background_count);
}

constexpr bool is_valid_point_click_dialogue_line_index(const PointClickProjectData& project, int line_index) {
    return line_index < 0 ||
        (project.dialogue_lines != nullptr &&
            static_cast<size_t>(line_index) < project.dialogue_line_count &&
            project.dialogue_lines[line_index].text != nullptr);
}

constexpr bool is_valid_point_click_item_index(const PointClickProjectData& project, int item_index) {
    return item_index < 0 ||
        (project.inventory_items != nullptr &&
            static_cast<size_t>(item_index) < project.inventory_item_count);
}

constexpr bool is_valid_point_click_inventory_item(
    const PointClickProjectData& project,
    const PointClickInventoryItemData& item
) {
    return item.name != nullptr &&
        is_valid_event_variable(item.variable_index) &&
        is_valid_point_click_dialogue_line_index(project, item.dialogue_line_index);
}

constexpr bool is_valid_point_click_hotspot(const PointClickProjectData& project, const PointClickHotspotData& hotspot) {
    return hotspot.area_pixels.width > 0 &&
        hotspot.area_pixels.height > 0 &&
        is_valid_point_click_dialogue_line_index(project, hotspot.dialogue_line_index) &&
        is_valid_point_click_dialogue_line_index(project, hotspot.unavailable_dialogue_line_index) &&
        is_valid_point_click_item_index(project, hotspot.required_item_index) &&
        is_valid_point_click_item_index(project, hotspot.give_item_index) &&
        (hotspot.target_scene_index < 0 || is_valid_point_click_scene_index(project, hotspot.target_scene_index));
}

constexpr bool is_valid_point_click_prop(const PointClickPropData& prop) {
    return prop.name != nullptr &&
        prop.metasprite != nullptr &&
        is_valid_metasprite(*prop.metasprite) &&
        (prop.idle_animation == nullptr || is_valid_sprite_animation(*prop.idle_animation)) &&
        (prop.visible_variable_index < 0 || is_valid_event_variable(prop.visible_variable_index));
}

constexpr bool is_valid_point_click_resource_banks(const PointClickProjectData& project) {
    if (project.resource_bank_count == 0) {
        return true;
    }
    return project.resource_banks != nullptr;
}

constexpr bool is_valid_point_click_resource_bank_groups(const PointClickProjectData& project) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    return project.resource_bank_groups != nullptr;
}

constexpr PointClickCursorState point_click_cursor_from_project(const PointClickProjectData& project) {
    return PointClickCursorState { project.cursor_start_pixels, -1 };
}

constexpr Rect point_click_cursor_rect(const PointClickCursorState& cursor) {
    return Rect { cursor.position_pixels.x, cursor.position_pixels.y, 1, 1 };
}

constexpr const PointClickSceneData* point_click_scene_for(const PointClickProjectData& project, int scene_index) {
    return is_valid_point_click_scene_index(project, scene_index)
        ? &project.scenes[scene_index]
        : nullptr;
}

constexpr size_t point_click_scene_background_count(const PointClickSceneData& scene) {
    return scene.background_count > 0
        ? scene.background_count
        : (scene.background_index >= 0 ? 1 : 0);
}

constexpr int point_click_scene_background_at(const PointClickSceneData& scene, size_t index) {
    if (scene.background_count > 0) {
        return scene.background_indices != nullptr && index < scene.background_count
            ? scene.background_indices[index]
            : -1;
    }
    return index == 0 ? scene.background_index : -1;
}

constexpr bool point_click_prop_is_visible(const PointClickPropData& prop, const EventState& state) {
    return prop.visible_variable_index < 0 ||
        state.variables[prop.visible_variable_index] == prop.visible_variable_value;
}

constexpr const PointClickInventoryItemData* point_click_item_for(
    const PointClickProjectData& project,
    int item_index
) {
    return is_valid_point_click_item_index(project, item_index) && item_index >= 0
        ? &project.inventory_items[item_index]
        : nullptr;
}

constexpr const char* point_click_scene_name(
    const PointClickProjectData& project,
    int scene_index
) {
    const PointClickSceneData* scene = point_click_scene_for(project, scene_index);
    return scene != nullptr ? scene->name : nullptr;
}

constexpr const char* point_click_selected_item_name(
    const PointClickProjectData& project,
    const PointClickCursorState& cursor
) {
    const PointClickInventoryItemData* item = point_click_item_for(project, cursor.selected_item_index);
    return item != nullptr ? item->name : nullptr;
}

constexpr const PointClickHotspotData* point_click_hotspot_at(const PointClickSceneData& scene, Vec2i point_pixels) {
    Rect point_rect { point_pixels.x, point_pixels.y, 1, 1 };
    for (size_t index = 0; index < scene.hotspot_count; ++index) {
        if (intersects(scene.hotspots[index].area_pixels, point_rect)) {
            return &scene.hotspots[index];
        }
    }
    return nullptr;
}

constexpr bool point_click_item_is_owned(
    const PointClickProjectData& project,
    const EventState& state,
    int item_index
) {
    return is_valid_point_click_item_index(project, item_index) &&
        item_index >= 0 &&
        state.variables[project.inventory_items[item_index].variable_index] != 0;
}

constexpr bool point_click_hotspot_requires_selected_item(
    const PointClickHotspotData& hotspot
) {
    return hotspot.required_item_index >= 0;
}

constexpr bool point_click_hotspot_can_activate(
    const PointClickProjectData& project,
    const EventState& state,
    const PointClickCursorState& cursor,
    const PointClickHotspotData& hotspot
) {
    if (!point_click_hotspot_requires_selected_item(hotspot)) {
        return true;
    }
    return cursor.selected_item_index == hotspot.required_item_index &&
        point_click_item_is_owned(project, state, hotspot.required_item_index);
}

constexpr int point_click_next_owned_item_index(
    const PointClickProjectData& project,
    const EventState& state,
    int current_item_index
) {
    if (project.inventory_items == nullptr || project.inventory_item_count == 0) {
        return -1;
    }
    const size_t start = current_item_index >= 0
        ? static_cast<size_t>(current_item_index + 1)
        : 0;
    for (size_t offset = 0; offset < project.inventory_item_count; ++offset) {
        const size_t index = (start + offset) % project.inventory_item_count;
        if (point_click_item_is_owned(project, state, static_cast<int>(index))) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

constexpr EventScript point_click_hotspot_success_script(
    const PointClickHotspotData& hotspot,
    bool used_required_item
) {
    return used_required_item && has_event_script(hotspot.on_use_item)
        ? hotspot.on_use_item
        : hotspot.on_click;
}

constexpr void point_click_grant_item(
    const PointClickProjectData& project,
    EventState& state,
    int item_index
) {
    if (is_valid_point_click_item_index(project, item_index) && item_index >= 0) {
        state.variables[project.inventory_items[item_index].variable_index] = 1;
    }
}

constexpr EventScript point_click_scene_enter_script(const PointClickProjectData& project, int scene_index) {
    const PointClickSceneData* scene = point_click_scene_for(project, scene_index);
    return scene != nullptr ? scene->on_enter : empty_event_script();
}

constexpr EventScript point_click_scene_exit_script(const PointClickProjectData& project, int scene_index) {
    const PointClickSceneData* scene = point_click_scene_for(project, scene_index);
    return scene != nullptr ? scene->on_exit : empty_event_script();
}

constexpr bool is_valid_point_click_save_data(
    const PointClickProjectData& project,
    const PointClickSaveData& save_data
) {
    return is_valid_point_click_scene_index(project, save_data.scene_index) &&
        save_data.cursor_x >= 0 &&
        save_data.cursor_x <= 239 &&
        save_data.cursor_y >= 0 &&
        save_data.cursor_y <= 159 &&
        is_valid_point_click_item_index(project, save_data.selected_item_index);
}

inline void capture_point_click_save_data(
    PointClickSaveData& save_data,
    int scene_index,
    const PointClickCursorState& cursor,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    save_data.scene_index = static_cast<uint16_t>(scene_index < 0 ? 0 : scene_index);
    save_data.cursor_x = static_cast<int16_t>(clamp_int(cursor.position_pixels.x, 0, 239));
    save_data.cursor_y = static_cast<int16_t>(clamp_int(cursor.position_pixels.y, 0, 159));
    save_data.selected_item_index = static_cast<int16_t>(cursor.selected_item_index);
    for (size_t index = 0; index < event_variable_count; ++index) {
        save_data.variables[index] = event_state.variables[index];
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
}

inline bool apply_point_click_save_data(
    const PointClickProjectData& project,
    const PointClickSaveData& save_data,
    int& scene_index,
    PointClickCursorState& cursor,
    EventState& event_state
) {
    if (!is_valid_point_click_save_data(project, save_data)) {
        return false;
    }
    scene_index = save_data.scene_index;
    cursor.position_pixels = Vec2i { save_data.cursor_x, save_data.cursor_y };
    cursor.selected_item_index = save_data.selected_item_index;
    for (size_t index = 0; index < event_variable_count; ++index) {
        event_state.variables[index] = save_data.variables[index];
    }
    return true;
}

constexpr ResourceBankBatch resource_bank_batch_from_point_click_project(const PointClickProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_point_click_project(
    const PointClickProjectData& project,
    size_t group_index
) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_point_click_resource_bank_group_index(const PointClickProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr int find_point_click_scene_resource_bank_group_index(
    const PointClickProjectData& project,
    const PointClickSceneData& scene
) {
    return find_point_click_resource_bank_group_index(project, scene.resource_bank_group_name);
}

constexpr ResourceBankGroup resource_bank_group_from_point_click_scene(
    const PointClickProjectData& project,
    const PointClickSceneData& scene
) {
    int index = find_point_click_scene_resource_bank_group_index(project, scene);
    return index >= 0
        ? resource_bank_group_from_point_click_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr bool is_valid_point_click_project_data(const PointClickProjectData& project) {
    if (project.scenes == nullptr ||
        project.scene_count == 0 ||
        !is_valid_point_click_scene_index(project, project.initial_scene) ||
        project.cursor_speed_pixels < 0 ||
        !is_valid_point_click_resource_banks(project) ||
        !is_valid_point_click_resource_bank_groups(project)) {
        return false;
    }
    if (project.background_count > 0 && project.backgrounds == nullptr) {
        return false;
    }
    if (project.dialogue_line_count > 0 && project.dialogue_lines == nullptr) {
        return false;
    }
    if (project.inventory_item_count > 0 && project.inventory_items == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.background_count; ++index) {
        if (!is_valid_streaming_tilemap_asset(project.backgrounds[index].tilemap)) {
            return false;
        }
    }
    for (size_t index = 0; index < project.inventory_item_count; ++index) {
        if (!is_valid_point_click_inventory_item(project, project.inventory_items[index])) {
            return false;
        }
    }
    for (size_t index = 0; index < project.scene_count; ++index) {
        const PointClickSceneData& scene = project.scenes[index];
        if (scene.background_count > 3 ||
            (scene.background_count > 0 && scene.background_indices == nullptr) ||
            scene.prop_count > 6 ||
            (scene.prop_count > 0 && scene.props == nullptr)) {
            return false;
        }
        for (size_t background_index = 0; background_index < point_click_scene_background_count(scene); ++background_index) {
            if (!is_valid_point_click_background_index(project, point_click_scene_background_at(scene, background_index))) {
                return false;
            }
        }
        if (scene.hotspot_count > 0 && scene.hotspots == nullptr) {
            return false;
        }
        for (size_t hotspot_index = 0; hotspot_index < scene.hotspot_count; ++hotspot_index) {
            if (!is_valid_point_click_hotspot(project, scene.hotspots[hotspot_index])) {
                return false;
            }
        }
        for (size_t prop_index = 0; prop_index < scene.prop_count; ++prop_index) {
            if (!is_valid_point_click_prop(scene.props[prop_index])) {
                return false;
            }
        }
    }
    return true;
}

} // namespace gbs
