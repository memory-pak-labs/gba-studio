#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/audio.hpp"
#include "gbs/assets.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"

namespace gbs {

struct MenuBackgroundData {
    const char* name;
    BackgroundLayer layer;
    TileMapAsset tilemap;
    uint16_t backdrop_color;
};

enum class MenuItemAction : uint8_t {
    Select = 0,
    OpenScreen = 1,
    PushScreen = 2,
    PopScreen = 3,
    ToggleVariable = 4,
    AdjustVariable = 5
};

enum class MenuScreenType : uint8_t {
    Logo = 0,
    Title = 1,
    Menu = 2
};

enum class MenuSceneProfile : uint8_t {
    Initial = 0,
    InGame = 1
};

enum class MenuSceneEntryPolicy : uint8_t {
    Title = 0,
    Gameplay = 1
};

enum class MenuSceneReturnPolicy : uint8_t {
    Title = 0,
    Resume = 1
};

enum class MenuScenePresentationMode : uint8_t {
    Scene = 0,
    Hud = 1,
    Both = 2
};

struct MenuClickBox {
    int x;
    int y;
    int width;
    int height;
};

constexpr MenuClickBox menu_default_click_box() {
    return MenuClickBox { 0, 0, 240, 160 };
}

constexpr bool is_valid_menu_click_box(const MenuClickBox& click_box) {
    return click_box.x >= 0 &&
        click_box.y >= 0 &&
        click_box.width > 0 &&
        click_box.height > 0 &&
        click_box.x + click_box.width <= 240 &&
        click_box.y + click_box.height <= 160;
}

struct MenuItemConditionData {
    int variable_index;
    int equals_value;
    bool hide_when_unavailable;
};

struct MenuItemValueData {
    int variable_index;
    int min_value;
    int max_value;
    int step;
};

enum class MenuItemBindingSource : uint8_t {
    None = 0,
    Variable = 1,
    Inventory = 2,
    Stat = 3,
    Equipped = 4
};

enum class MenuItemBindingFormat : uint8_t {
    Number = 0,
    Count = 1,
    Percent = 2,
    OnOff = 3
};

struct MenuItemBindingData {
    MenuItemBindingSource source = MenuItemBindingSource::None;
    int index = -1;
    MenuItemBindingFormat format = MenuItemBindingFormat::Number;
};

constexpr MenuItemConditionData menu_item_always_available() {
    return MenuItemConditionData { -1, 0, false };
}

constexpr MenuItemValueData menu_item_no_value() {
    return MenuItemValueData { -1, 0, 0, 0 };
}

constexpr MenuItemBindingData menu_item_no_binding() {
    return MenuItemBindingData {
        MenuItemBindingSource::None,
        -1,
        MenuItemBindingFormat::Number
    };
}

struct MenuItemData {
    const char* label;
    int line_index;
    EventScript on_select;
    int target_screen_index;
    bool enabled;
    MenuItemAction action = MenuItemAction::Select;
    MenuItemConditionData condition = menu_item_always_available();
    MenuItemValueData value = menu_item_no_value();
    MenuClickBox click_box = menu_default_click_box();
    int checked_value = 1;
    bool requires_save = false;
    int audio_channel = -1;
    MenuItemBindingData binding = menu_item_no_binding();
    int target_item_index = -1;
    int save_slot = -1;
    const char* const* value_labels = nullptr;
    size_t value_label_count = 0;
    const char* detail_lines[3] = {nullptr, nullptr, nullptr};
};

enum class MenuActorEntryAnimation : uint8_t {
    None = 0,
    SlideDown = 1
};

enum class MenuActorRole : uint8_t {
    Decorative = 0,
    Option = 1,
    Cursor = 2
};

struct MenuActorData {
    const char* name;
    const MetaSprite* metasprite;
    Vec2i position_pixels;
    MenuActorEntryAnimation entry_animation = MenuActorEntryAnimation::None;
    int entry_offset_y = 0;
    uint16_t entry_animation_frames = 0;
    MenuActorRole role = MenuActorRole::Decorative;
    int menu_item_index = -1;
    const char* cursor_for_menu = nullptr;
    const TileAsset* tile_asset = nullptr;
    const PaletteAsset* palette_asset = nullptr;
    int visibility_variable_index = -1;
    int visibility_value = -1;
    const MetaSprite* selected_metasprite = nullptr;
    EventScript on_init = empty_event_script();
    EventScript on_interact = empty_event_script();
    EventScript on_update = empty_event_script();
    bool flip_horizontal = false;
    bool cursor_follows_option = false;
    Vec2i cursor_offset_pixels = {0, 0};
    bool selected_only = false;
};

constexpr int menu_text_input_max_length = 16;

enum class MenuTextInputKeyboardLayout : uint8_t {
    Hidden = 0,
    Grid = 1
};

enum class MenuTextInputKeyboardControlLayout : uint8_t {
    Bottom = 0,
    Side = 1,
    BottomGrid = 2
};

enum class MenuTextInputKeyboardSurface : uint8_t {
    Runtime = 0,
    Background = 1
};

struct MenuTextInputKeyboardData {
    MenuTextInputKeyboardLayout layout = MenuTextInputKeyboardLayout::Hidden;
    int x = 0;
    int y = 0;
    int width = 0;
    int height = 0;
    bool allow_lowercase = false;
    MenuTextInputKeyboardControlLayout control_layout = MenuTextInputKeyboardControlLayout::Bottom;
    int controls_x = 0;
    int controls_y = 0;
    int controls_width = 0;
    int controls_height = 0;
    MenuTextInputKeyboardSurface surface = MenuTextInputKeyboardSurface::Runtime;
};

constexpr MenuTextInputKeyboardData menu_no_text_input_keyboard() {
    return MenuTextInputKeyboardData {
        MenuTextInputKeyboardLayout::Hidden,
        0,
        0,
        0,
        0,
        false
    };
}

constexpr bool is_valid_menu_text_input_keyboard(const MenuTextInputKeyboardData& keyboard) {
    if (keyboard.layout == MenuTextInputKeyboardLayout::Hidden) {
        return keyboard.x == 0 && keyboard.y == 0 && keyboard.width == 0 && keyboard.height == 0;
    }
    if (keyboard.layout != MenuTextInputKeyboardLayout::Grid) {
        return false;
    }
    if (keyboard.surface != MenuTextInputKeyboardSurface::Runtime &&
        keyboard.surface != MenuTextInputKeyboardSurface::Background) {
        return false;
    }
    const bool base_valid = keyboard.x >= 0 &&
        keyboard.y >= 0 &&
        keyboard.width >= (keyboard.control_layout == MenuTextInputKeyboardControlLayout::BottomGrid ? 16 : 22) &&
        keyboard.height >= (keyboard.control_layout == MenuTextInputKeyboardControlLayout::BottomGrid ? 10 : 6) &&
        keyboard.x + keyboard.width <= 32 &&
        keyboard.y + keyboard.height <= 20;
    if (!base_valid) return false;
    if (keyboard.control_layout == MenuTextInputKeyboardControlLayout::Bottom) return true;
    if (keyboard.control_layout == MenuTextInputKeyboardControlLayout::BottomGrid) return true;
    if (keyboard.control_layout != MenuTextInputKeyboardControlLayout::Side) return false;
    return keyboard.controls_x >= keyboard.x + keyboard.width &&
        keyboard.controls_y >= keyboard.y &&
        keyboard.controls_width >= 5 &&
        keyboard.controls_height >= 6 &&
        keyboard.controls_x + keyboard.controls_width <= 32 &&
        keyboard.controls_y + keyboard.controls_height <= 20;
}

struct MenuTextInputData {
    int variable_index;
    int max_length;
    int x;
    int y;
    int width;
    MenuTextInputKeyboardData keyboard = menu_no_text_input_keyboard();
};

constexpr MenuTextInputData menu_no_text_input() {
    return MenuTextInputData { -1, 0, 0, 0, 0 };
}

constexpr bool is_valid_menu_text_input(const MenuTextInputData& input) {
    if (input.variable_index < 0) {
        return input.max_length == 0 && input.width == 0 &&
            is_valid_menu_text_input_keyboard(input.keyboard);
    }
    return is_valid_text_variable_index(input.variable_index) &&
        input.max_length > 0 &&
        input.max_length <= menu_text_input_max_length &&
        input.x >= 0 &&
        input.y >= 0 &&
        input.width > 0 &&
        input.width <= 32 - input.x &&
        input.max_length <= input.width &&
        is_valid_menu_text_input_keyboard(input.keyboard);
}

constexpr Vec2i menu_actor_position_at(const MenuActorData& actor, uint32_t elapsed_frames) {
    if (actor.entry_animation != MenuActorEntryAnimation::SlideDown ||
        actor.entry_offset_y <= 0 ||
        actor.entry_animation_frames == 0 ||
        elapsed_frames >= actor.entry_animation_frames) {
        return actor.position_pixels;
    }
    const uint32_t remaining_frames = actor.entry_animation_frames - elapsed_frames;
    const int offset_y = static_cast<int>(
        (static_cast<uint32_t>(actor.entry_offset_y) * remaining_frames) /
        actor.entry_animation_frames
    );
    return Vec2i { actor.position_pixels.x, actor.position_pixels.y - offset_y };
}

constexpr const MetaSprite* menu_actor_metasprite_at(
    const MenuActorData& actor,
    int selected_item_index
) {
    if (actor.role == MenuActorRole::Option &&
        actor.menu_item_index == selected_item_index &&
        actor.selected_metasprite != nullptr &&
        is_valid_metasprite(*actor.selected_metasprite)) {
        return actor.selected_metasprite;
    }
    return actor.metasprite;
}

struct MenuScreenData {
    const char* name;
    int background_index;
    int title_line_index;
    const MenuItemData* items;
    size_t item_count;
    EventScript on_enter;
    EventScript on_exit;
    const char* resource_bank_group_name;
    MenuScreenType screen_type = MenuScreenType::Menu;
    const char* title = nullptr;
    int auto_advance_frames = 0;
    bool allow_skip = false;
    int next_screen_index = -1;
    int title_overlay_background_index = -1;
    int title_fade_frames = 0;
    EventScript on_back = empty_event_script();
    const MenuActorData* actors = nullptr;
    size_t actor_count = 0;
    MenuTextInputData text_input = menu_no_text_input();
    const int* background_animation_frames = nullptr;
    size_t background_animation_frame_count = 0;
    int background_animation_frame_duration = 0;
    bool background_animation_loop = true;
    MenuSceneProfile profile = MenuSceneProfile::Initial;
    MenuSceneEntryPolicy entry_policy = MenuSceneEntryPolicy::Title;
    MenuSceneReturnPolicy return_policy = MenuSceneReturnPolicy::Title;
    bool suspends_gameplay = false;
    MenuScenePresentationMode presentation_mode = MenuScenePresentationMode::Scene;
    uint8_t hud_list_rows = 0;
    int title_text_variable = -1;
    bool carousel = false;
    uint16_t hud_text_color = 0x7FFF;
    bool hud_transparent_text = false;
};

constexpr bool menu_screen_can_be_empty(const MenuScreenData& screen) {
    return screen.screen_type == MenuScreenType::Logo;
}

constexpr size_t menu_name_field_padding_cells(const char* name, size_t cells) {
    size_t length = 0;
    for (const char* cursor = name; cursor != nullptr && *cursor != '\0'; ++cursor) {
        if ((static_cast<unsigned char>(*cursor) & 0xC0u) != 0x80u) ++length;
    }
    return length < cells ? (cells - length) / 2 : 0;
}

constexpr bool menu_screen_should_advance(
    const MenuScreenData& screen,
    uint32_t elapsed_frames,
    bool skip_pressed
) {
    return (screen.auto_advance_frames > 0 && elapsed_frames >= static_cast<uint32_t>(screen.auto_advance_frames)) ||
        (screen.allow_skip && skip_pressed);
}

constexpr uint8_t menu_title_fade_alpha(
    const MenuScreenData& screen,
    uint32_t elapsed_frames
) {
    if (screen.title_overlay_background_index < 0 || screen.title_fade_frames <= 0) {
        return 16;
    }
    if (elapsed_frames == 0) {
        return 1;
    }
    if (elapsed_frames >= static_cast<uint32_t>(screen.title_fade_frames)) {
        return 16;
    }
    return static_cast<uint8_t>(
        (elapsed_frames * 16u) / static_cast<uint32_t>(screen.title_fade_frames)
    );
}

struct MenuProjectData {
    const PaletteAsset* bg_palettes;
    size_t bg_palette_count;
    const TileAsset* tile_assets;
    size_t tile_asset_count;
    const MenuBackgroundData* backgrounds;
    size_t background_count;
    const MenuScreenData* screens;
    size_t screen_count;
    int initial_screen;
    const DialogueLine* dialogue_lines;
    size_t dialogue_line_count;
    const EventScript* scripts = nullptr;
    size_t script_count = 0;
    const ResourceBank* resource_banks = nullptr;
    size_t resource_bank_count = 0;
    const ResourceBankGroup* resource_bank_groups = nullptr;
    size_t resource_bank_group_count = 0;
    const SfxAsset* sfx_assets = nullptr;
    size_t sfx_asset_count = 0;
    const MusicAsset* music_assets = nullptr;
    size_t music_asset_count = 0;
    const PcmAsset* pcm_assets = nullptr;
    size_t pcm_asset_count = 0;
    const TrackerAsset* tracker_assets = nullptr;
    size_t tracker_asset_count = 0;
    const PaletteAsset* obj_palettes = nullptr;
    size_t obj_palette_count = 0;
};

constexpr int menu_screen_background_index(
    const MenuScreenData& screen,
    uint32_t elapsed_frames
) {
    if (screen.background_animation_frames == nullptr ||
        screen.background_animation_frame_count == 0 ||
        screen.background_animation_frame_duration <= 0) {
        return screen.background_index;
    }
    uint32_t frame_index = elapsed_frames / static_cast<uint32_t>(screen.background_animation_frame_duration);
    if (screen.background_animation_loop) {
        frame_index %= static_cast<uint32_t>(screen.background_animation_frame_count);
    } else if (frame_index >= screen.background_animation_frame_count) {
        frame_index = static_cast<uint32_t>(screen.background_animation_frame_count - 1);
    }
    return screen.background_animation_frames[frame_index];
}

struct MenuRuntimeState {
    int screen_index;
    int selected_item_index;
    int screen_stack[8];
    size_t screen_stack_count;
    int selection_stack[8] = {};
};

constexpr size_t menu_screen_stack_capacity = 8;

struct MenuSaveData {
    uint16_t screen_index;
    int16_t selected_item_index;
    uint8_t screen_stack_count;
    uint16_t screen_stack[menu_screen_stack_capacity];
    int32_t variables[event_variable_count];
    char text_variables[text_variable_count][text_variable_max_length + 1];
    uint32_t play_time_frames;
    uint16_t flags;
};

constexpr bool is_valid_menu_screen_index(const MenuProjectData& project, int screen_index) {
    return project.screens != nullptr &&
        screen_index >= 0 &&
        static_cast<size_t>(screen_index) < project.screen_count;
}

constexpr bool is_valid_menu_background_index(const MenuProjectData& project, int background_index) {
    return background_index < 0 ||
        (project.backgrounds != nullptr &&
            static_cast<size_t>(background_index) < project.background_count);
}

constexpr bool is_valid_menu_dialogue_line_index(const MenuProjectData& project, int line_index) {
    return line_index < 0 ||
        (project.dialogue_lines != nullptr &&
            static_cast<size_t>(line_index) < project.dialogue_line_count &&
            project.dialogue_lines[line_index].text != nullptr);
}

constexpr bool is_valid_menu_item_condition(const MenuItemConditionData& condition) {
    return condition.variable_index < 0 || is_valid_event_variable(condition.variable_index);
}

constexpr bool is_valid_menu_item_value(const MenuItemValueData& value) {
    if (value.variable_index < 0) {
        return value.step == 0;
    }
    return is_valid_event_variable(value.variable_index) &&
        value.min_value <= value.max_value &&
        value.step > 0;
}

constexpr bool is_valid_menu_item_binding(const MenuItemBindingData& binding) {
    if (binding.source == MenuItemBindingSource::None) {
        return binding.index < 0;
    }
    if (binding.source == MenuItemBindingSource::Variable) {
        return is_valid_event_variable(binding.index);
    }
    if (binding.source == MenuItemBindingSource::Inventory) {
        return is_valid_inventory_item_index(binding.index);
    }
    if (binding.source == MenuItemBindingSource::Stat) {
        return is_valid_event_stat(binding.index);
    }
    if (binding.source == MenuItemBindingSource::Equipped) {
        return is_valid_event_equipment_slot(binding.index);
    }
    return false;
}

constexpr bool is_valid_menu_item(const MenuProjectData& project, const MenuItemData& item) {
    if (item.label == nullptr ||
        !is_valid_menu_dialogue_line_index(project, item.line_index) ||
        !is_valid_menu_item_condition(item.condition) ||
        !is_valid_menu_item_value(item.value) ||
        !is_valid_menu_item_binding(item.binding) ||
        !is_valid_menu_click_box(item.click_box) ||
        (item.target_screen_index >= 0 && !is_valid_menu_screen_index(project, item.target_screen_index)) ||
        item.target_item_index < -1) {
        return false;
    }
    if ((item.action == MenuItemAction::OpenScreen || item.action == MenuItemAction::PushScreen) &&
        item.target_screen_index < 0) {
        return false;
    }
    if (item.target_item_index >= 0 &&
        ((item.action != MenuItemAction::OpenScreen && item.action != MenuItemAction::PushScreen) ||
            item.target_screen_index < 0 ||
            static_cast<size_t>(item.target_item_index) >= project.screens[item.target_screen_index].item_count)) {
        return false;
    }
    if ((item.action == MenuItemAction::ToggleVariable || item.action == MenuItemAction::AdjustVariable) &&
        !is_valid_event_variable(item.value.variable_index)) {
        return false;
    }
    if (item.action == MenuItemAction::ToggleVariable &&
        (item.checked_value < item.value.min_value || item.checked_value > item.value.max_value)) {
        return false;
    }
    return true;
}

constexpr bool is_valid_menu_actor(const MenuActorData& actor) {
    return actor.name != nullptr &&
        actor.metasprite != nullptr &&
        is_valid_metasprite(*actor.metasprite) &&
        actor.visibility_variable_index >= -1 &&
        actor.visibility_variable_index < static_cast<int>(event_variable_count) &&
        (actor.visibility_variable_index < 0 || actor.visibility_value >= 0);
}

constexpr bool is_valid_menu_resource_banks(const MenuProjectData& project) {
    if (project.resource_bank_count == 0) {
        return true;
    }
    return project.resource_banks != nullptr;
}

constexpr bool is_valid_menu_resource_bank_groups(const MenuProjectData& project) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    return project.resource_bank_groups != nullptr;
}

constexpr const MenuScreenData* menu_screen_for(const MenuProjectData& project, int screen_index) {
    return is_valid_menu_screen_index(project, screen_index)
        ? &project.screens[screen_index]
        : nullptr;
}

constexpr const char* menu_screen_name(const MenuProjectData& project, int screen_index) {
    const MenuScreenData* screen = menu_screen_for(project, screen_index);
    return screen != nullptr ? screen->name : nullptr;
}

constexpr size_t menu_stack_depth(const MenuRuntimeState& state) {
    return state.screen_stack_count;
}

constexpr const MenuItemData* menu_item_for(const MenuScreenData& screen, int item_index) {
    return screen.items != nullptr &&
            item_index >= 0 &&
            static_cast<size_t>(item_index) < screen.item_count
        ? &screen.items[item_index]
        : nullptr;
}

constexpr bool menu_item_opens_text_input(const MenuItemData& item, int variable_index) {
    if (item.on_select.commands == nullptr || variable_index < 0) {
        return false;
    }
    for (size_t command_index = 0; command_index < item.on_select.command_count; ++command_index) {
        const EventCommand& command = item.on_select.commands[command_index];
        if (command.op == EventOp::OpenTextInput && command.a == variable_index) {
            return true;
        }
    }
    return false;
}

constexpr Vec2i menu_cursor_position_at(
    const MenuScreenData& screen,
    int selected_item_index,
    const MenuActorData& cursor_actor,
    uint32_t elapsed_frames
) {
    Vec2i position = menu_actor_position_at(cursor_actor, elapsed_frames);
    const MenuItemData* selected_item = menu_item_for(screen, selected_item_index);
    if (selected_item != nullptr &&
        is_valid_menu_text_input(screen.text_input) &&
        menu_item_opens_text_input(*selected_item, screen.text_input.variable_index)) {
        position.y = screen.text_input.y * 8;
        return position;
    }
    if (screen.actors == nullptr) {
        return position;
    }
    for (size_t actor_index = 0; actor_index < screen.actor_count; ++actor_index) {
        const MenuActorData& option = screen.actors[actor_index];
        if (option.role == MenuActorRole::Option &&
            option.menu_item_index == selected_item_index) {
            if (cursor_actor.cursor_follows_option) {
                const Vec2i target = menu_actor_position_at(option, elapsed_frames);
                return {target.x + cursor_actor.cursor_offset_pixels.x,
                    target.y + cursor_actor.cursor_offset_pixels.y};
            }
            position.y = menu_actor_position_at(option, elapsed_frames).y;
            break;
        }
    }
    return position;
}

constexpr bool is_valid_menu_selected_item_index(
    const MenuProjectData& project,
    int screen_index,
    int selected_item_index
) {
    const MenuScreenData* screen = menu_screen_for(project, screen_index);
    return screen != nullptr &&
        selected_item_index >= 0 &&
        static_cast<size_t>(selected_item_index) < screen->item_count;
}

constexpr MenuRuntimeState menu_runtime_from_project(const MenuProjectData& project) {
    return MenuRuntimeState { project.initial_screen, 0, {}, 0 };
}

constexpr bool menu_item_condition_is_met(const EventState& state, const MenuItemData& item) {
    return item.condition.variable_index < 0 ||
        (is_valid_event_variable(item.condition.variable_index) &&
            state.variables[item.condition.variable_index] == item.condition.equals_value);
}

constexpr bool menu_item_is_visible(const EventState& state, const MenuItemData& item) {
    if (!item.enabled) {
        return false;
    }
    return menu_item_condition_is_met(state, item) || !item.condition.hide_when_unavailable;
}

constexpr bool menu_item_is_available(const EventState& state, const MenuItemData& item) {
    const bool save_exists = state.save_slot_exists[0] ||
        state.save_slot_exists[1] ||
        state.save_slot_exists[2] ||
        state.save_slot_exists[3] ||
        state.save_slot_exists[4] ||
        state.save_slot_exists[5] ||
        state.save_slot_exists[6] ||
        state.save_slot_exists[7];
    return item.enabled &&
        (!item.requires_save || (item.save_slot >= 0
            ? static_cast<size_t>(item.save_slot) < max_event_save_slots && state.save_slot_exists[item.save_slot]
            : save_exists)) &&
        menu_item_condition_is_met(state, item);
}

constexpr bool menu_focus_item(
    const MenuProjectData& project,
    const EventState& event_state,
    MenuRuntimeState& state,
    int item_index
) {
    const MenuScreenData* screen = menu_screen_for(project, state.screen_index);
    const MenuItemData* item = screen != nullptr ? menu_item_for(*screen, item_index) : nullptr;
    if (item == nullptr || !menu_item_is_available(event_state, *item)) {
        return false;
    }
    state.selected_item_index = item_index;
    return true;
}

constexpr int menu_item_binding_value(const EventState& state, const MenuItemData& item) {
    if (!is_valid_menu_item_binding(item.binding)) {
        return 0;
    }
    switch (item.binding.source) {
        case MenuItemBindingSource::Variable:
            return state.variables[item.binding.index];
        case MenuItemBindingSource::Inventory:
            return state.inventory[item.binding.index];
        case MenuItemBindingSource::Stat:
            return state.stats[item.binding.index];
        case MenuItemBindingSource::Equipped:
            return state.equipped_items[item.binding.index];
        case MenuItemBindingSource::None:
        default:
            return 0;
    }
}

constexpr int menu_next_enabled_item_index(const MenuScreenData& screen, int selected_item_index, int direction) {
    if (screen.items == nullptr || screen.item_count == 0 || direction == 0) {
        return -1;
    }
    int index = selected_item_index;
    for (size_t step = 0; step < screen.item_count; ++step) {
        index += direction > 0 ? 1 : -1;
        if (index < 0) {
            index = static_cast<int>(screen.item_count) - 1;
        } else if (static_cast<size_t>(index) >= screen.item_count) {
            index = 0;
        }
        if (screen.items[index].enabled) {
            return index;
        }
    }
    return -1;
}

constexpr int menu_next_visible_item_index(
    const MenuScreenData& screen,
    const EventState& state,
    int selected_item_index,
    int direction
) {
    if (screen.items == nullptr || screen.item_count == 0 || direction == 0) {
        return -1;
    }
    int index = selected_item_index;
    for (size_t step = 0; step < screen.item_count; ++step) {
        index += direction > 0 ? 1 : -1;
        if (index < 0) {
            index = static_cast<int>(screen.item_count) - 1;
        } else if (static_cast<size_t>(index) >= screen.item_count) {
            index = 0;
        }
        if (menu_item_is_available(state, screen.items[index])) {
            return index;
        }
    }
    return -1;
}

constexpr int menu_carousel_item_index(
    const MenuScreenData& screen,
    const EventState& state,
    int selected_item_index,
    int direction
) {
    if (!screen.carousel || screen.items == nullptr || screen.item_count == 0 || direction == 0) {
        return -1;
    }
    int index = selected_item_index;
    for (size_t step = 0; step < screen.item_count; ++step) {
        index += direction > 0 ? 1 : -1;
        if (index < 0) index = static_cast<int>(screen.item_count) - 1;
        if (static_cast<size_t>(index) >= screen.item_count) index = 0;
        if (menu_item_is_visible(state, screen.items[index])) return index;
    }
    return -1;
}

constexpr int menu_click_box_center_x(const MenuClickBox& click_box) {
    return click_box.x + click_box.width / 2;
}

constexpr int menu_click_box_center_y(const MenuClickBox& click_box) {
    return click_box.y + click_box.height / 2;
}

constexpr int menu_abs(int value) {
    return value < 0 ? -value : value;
}

constexpr int menu_directional_item_index(
    const MenuScreenData& screen,
    const EventState& state,
    int selected_item_index,
    int direction_x,
    int direction_y
) {
    const MenuItemData* selected = menu_item_for(screen, selected_item_index);
    if (selected == nullptr || (direction_x == 0 && direction_y == 0)) {
        return -1;
    }

    const int origin_x = menu_click_box_center_x(selected->click_box);
    const int origin_y = menu_click_box_center_y(selected->click_box);
    int best_index = -1;
    int best_score = 0;
    for (size_t index = 0; index < screen.item_count; ++index) {
        if (static_cast<int>(index) == selected_item_index || !menu_item_is_available(state, screen.items[index])) {
            continue;
        }
        const int delta_x = menu_click_box_center_x(screen.items[index].click_box) - origin_x;
        const int delta_y = menu_click_box_center_y(screen.items[index].click_box) - origin_y;
        const int primary_distance = delta_x * direction_x + delta_y * direction_y;
        if (primary_distance <= 0) {
            continue;
        }
        const int cross_distance = menu_abs(delta_x * direction_y - delta_y * direction_x);
        const int score = primary_distance * 4 + cross_distance;
        if (best_index < 0 || score < best_score) {
            best_index = static_cast<int>(index);
            best_score = score;
        }
    }
    return best_index;
}

constexpr int menu_first_visible_item_index(const MenuScreenData& screen, const EventState& state) {
    if (screen.items == nullptr) {
        return -1;
    }
    for (size_t index = 0; index < screen.item_count; ++index) {
        if (menu_item_is_available(state, screen.items[index])) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

constexpr int clamp_menu_item_value(const MenuItemData& item, int value) {
    if (!is_valid_menu_item_value(item.value)) {
        return value;
    }
    if (value < item.value.min_value) {
        return item.value.min_value;
    }
    if (value > item.value.max_value) {
        return item.value.max_value;
    }
    return value;
}

constexpr int menu_toggled_variable_value(const MenuItemData& item, int current_value) {
    if (!is_valid_menu_item_value(item.value)) {
        return current_value;
    }
    return current_value == item.checked_value ? item.value.min_value : item.checked_value;
}

constexpr int menu_adjusted_variable_value(const MenuItemData& item, int current_value, int direction) {
    if (!is_valid_menu_item_value(item.value) || direction == 0) {
        return current_value;
    }
    int delta = direction > 0 ? item.value.step : -item.value.step;
    return clamp_menu_item_value(item, current_value + delta);
}

constexpr bool menu_push_screen(MenuRuntimeState& state, int screen_index) {
    if (state.screen_stack_count >= menu_screen_stack_capacity) {
        return false;
    }
    state.screen_stack[state.screen_stack_count] = state.screen_index;
    state.selection_stack[state.screen_stack_count] = state.selected_item_index;
    ++state.screen_stack_count;
    state.screen_index = screen_index;
    state.selected_item_index = 0;
    return true;
}

constexpr bool menu_pop_screen(MenuRuntimeState& state) {
    if (state.screen_stack_count == 0) {
        return false;
    }
    --state.screen_stack_count;
    state.screen_index = state.screen_stack[state.screen_stack_count];
    state.screen_stack[state.screen_stack_count] = -1;
    state.selected_item_index = state.selection_stack[state.screen_stack_count];
    return true;
}

constexpr bool is_valid_menu_save_data(
    const MenuProjectData& project,
    const MenuSaveData& save_data
) {
    if (!is_valid_menu_selected_item_index(project, save_data.screen_index, save_data.selected_item_index) ||
        save_data.screen_stack_count > menu_screen_stack_capacity) {
        return false;
    }
    for (size_t index = 0; index < save_data.screen_stack_count; ++index) {
        if (!is_valid_menu_screen_index(project, save_data.screen_stack[index])) {
            return false;
        }
    }
    return true;
}

inline void capture_menu_save_data(
    MenuSaveData& save_data,
    const MenuRuntimeState& menu_state,
    const EventState& event_state,
    uint32_t play_time_frames = 0,
    uint16_t flags = 0
) {
    save_data.screen_index = static_cast<uint16_t>(menu_state.screen_index < 0 ? 0 : menu_state.screen_index);
    save_data.selected_item_index = static_cast<int16_t>(menu_state.selected_item_index);
    save_data.screen_stack_count = static_cast<uint8_t>(
        menu_state.screen_stack_count < menu_screen_stack_capacity
            ? menu_state.screen_stack_count
            : menu_screen_stack_capacity
    );
    for (size_t index = 0; index < menu_screen_stack_capacity; ++index) {
        save_data.screen_stack[index] = static_cast<uint16_t>(
            index < save_data.screen_stack_count && menu_state.screen_stack[index] >= 0
                ? menu_state.screen_stack[index]
                : 0
        );
    }
    for (size_t index = 0; index < event_variable_count; ++index) {
        save_data.variables[index] = event_state.variables[index];
    }
    for (size_t variable_index = 0; variable_index < text_variable_count; ++variable_index) {
        for (size_t character_index = 0; character_index <= text_variable_max_length; ++character_index) {
            save_data.text_variables[variable_index][character_index] = event_state.text_variables[variable_index][character_index];
        }
    }
    save_data.play_time_frames = play_time_frames;
    save_data.flags = flags;
}

inline bool apply_menu_save_data(
    const MenuProjectData& project,
    const MenuSaveData& save_data,
    MenuRuntimeState& menu_state,
    EventState& event_state
) {
    if (!is_valid_menu_save_data(project, save_data)) {
        return false;
    }
    menu_state.screen_index = save_data.screen_index;
    menu_state.selected_item_index = save_data.selected_item_index;
    menu_state.screen_stack_count = save_data.screen_stack_count;
    for (size_t index = 0; index < menu_screen_stack_capacity; ++index) {
        menu_state.screen_stack[index] = index < menu_state.screen_stack_count
            ? static_cast<int>(save_data.screen_stack[index])
            : -1;
    }
    for (size_t index = 0; index < event_variable_count; ++index) {
        event_state.variables[index] = save_data.variables[index];
    }
    for (size_t variable_index = 0; variable_index < text_variable_count; ++variable_index) {
        for (size_t character_index = 0; character_index <= text_variable_max_length; ++character_index) {
            event_state.text_variables[variable_index][character_index] = save_data.text_variables[variable_index][character_index];
        }
    }
    return true;
}

constexpr EventScript menu_screen_enter_script(const MenuProjectData& project, int screen_index) {
    const MenuScreenData* screen = menu_screen_for(project, screen_index);
    return screen != nullptr ? screen->on_enter : empty_event_script();
}

constexpr EventScript menu_screen_exit_script(const MenuProjectData& project, int screen_index) {
    const MenuScreenData* screen = menu_screen_for(project, screen_index);
    return screen != nullptr ? screen->on_exit : empty_event_script();
}

constexpr ResourceBankBatch resource_bank_batch_from_menu_project(const MenuProjectData& project) {
    return ResourceBankBatch { project.resource_banks, project.resource_bank_count };
}

constexpr ResourceBankGroup resource_bank_group_from_menu_project(
    const MenuProjectData& project,
    size_t group_index
) {
    if (project.resource_bank_groups == nullptr || group_index >= project.resource_bank_group_count) {
        return ResourceBankGroup { nullptr, nullptr, 0 };
    }
    return project.resource_bank_groups[group_index];
}

constexpr int find_menu_resource_bank_group_index(const MenuProjectData& project, const char* name) {
    return find_resource_bank_group_index(project.resource_bank_groups, project.resource_bank_group_count, name);
}

constexpr int find_menu_screen_resource_bank_group_index(
    const MenuProjectData& project,
    const MenuScreenData& screen
) {
    return find_menu_resource_bank_group_index(project, screen.resource_bank_group_name);
}

constexpr ResourceBankGroup resource_bank_group_from_menu_screen(
    const MenuProjectData& project,
    const MenuScreenData& screen
) {
    int index = find_menu_screen_resource_bank_group_index(project, screen);
    return index >= 0
        ? resource_bank_group_from_menu_project(project, static_cast<size_t>(index))
        : ResourceBankGroup { nullptr, nullptr, 0 };
}

constexpr bool is_valid_menu_project_data(const MenuProjectData& project) {
    if (project.screens == nullptr ||
        project.screen_count == 0 ||
        !is_valid_menu_screen_index(project, project.initial_screen) ||
        !is_valid_menu_resource_banks(project) ||
        !is_valid_menu_resource_bank_groups(project)) {
        return false;
    }
    if (project.background_count > 0 && project.backgrounds == nullptr) {
        return false;
    }
    if (project.dialogue_line_count > 0 && project.dialogue_lines == nullptr) {
        return false;
    }
    for (size_t index = 0; index < project.background_count; ++index) {
        if (!is_valid_tilemap_asset(project.backgrounds[index].tilemap)) {
            return false;
        }
    }
    for (size_t index = 0; index < project.screen_count; ++index) {
        const MenuScreenData& screen = project.screens[index];
        if (!is_valid_menu_background_index(project, screen.background_index) ||
            !is_valid_menu_dialogue_line_index(project, screen.title_line_index) ||
            screen.auto_advance_frames < 0 ||
            (screen.next_screen_index >= 0 && !is_valid_menu_screen_index(project, screen.next_screen_index)) ||
            !is_valid_menu_text_input(screen.text_input) ||
            (screen.background_animation_frame_count > 0 &&
                (screen.background_animation_frames == nullptr ||
                    screen.background_animation_frame_duration <= 0)) ||
            (!menu_screen_can_be_empty(screen) && screen.item_count == 0) ||
            (screen.item_count > 0 && screen.items == nullptr) ||
            (screen.actor_count > 0 && screen.actors == nullptr)) {
            return false;
        }
        for (size_t frame_index = 0; frame_index < screen.background_animation_frame_count; ++frame_index) {
            if (!is_valid_menu_background_index(
                project,
                screen.background_animation_frames[frame_index]
            )) {
                return false;
            }
        }
        for (size_t actor_index = 0; actor_index < screen.actor_count; ++actor_index) {
            if (!is_valid_menu_actor(screen.actors[actor_index])) {
                return false;
            }
        }
        bool has_enabled_item = false;
        for (size_t item_index = 0; item_index < screen.item_count; ++item_index) {
            if (!is_valid_menu_item(project, screen.items[item_index])) {
                return false;
            }
            has_enabled_item = has_enabled_item || screen.items[item_index].enabled;
        }
        if (!has_enabled_item && !menu_screen_can_be_empty(screen)) {
            return false;
        }
    }
    return true;
}

} // namespace gbs
