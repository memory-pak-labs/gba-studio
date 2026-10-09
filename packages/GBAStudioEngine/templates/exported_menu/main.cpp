#include <algorithm>
extern "C" void gbs_hw_set_bg_font_transparent(int enabled);
#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/menu.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/runtime_save_restore.hpp"
#include "gbs/save.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#include "menu_project_data.hpp"
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_MENU_RUNTIME_ENTRY
#define GBS_MENU_RUNTIME_ENTRY gbs_main
#endif

#ifndef GBS_MENU_RUNTIME_ENTER
#define GBS_MENU_RUNTIME_ENTER gbs_enter_menu
#endif
#ifndef GBS_MENU_RUNTIME_UPDATE
#define GBS_MENU_RUNTIME_UPDATE gbs_update_menu
#endif
#ifndef GBS_MENU_RUNTIME_RENDER
#define GBS_MENU_RUNTIME_RENDER gbs_render_menu
#endif
#ifndef GBS_MENU_RUNTIME_LEAVE
#define GBS_MENU_RUNTIME_LEAVE gbs_leave_menu
#endif
#ifndef GBS_MULTI_RUNTIME
#define GBS_MULTI_RUNTIME 0
#endif

#if GBS_MULTI_RUNTIME
#include "mixed_project_data.hpp"
#endif

namespace {

const gbs::MenuProjectData& project = gbastudio_menu_project::project;

gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::EventRunner menu_event_runner {};
gbs::MenuRuntimeState menu_state;
gbs::MenuState menu_ui;
gbs::MenuItem menu_ui_items[16] {};
char menu_item_label_buffers[16][48] {};
gbs::HudState hud;
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
int temporary_message_frames = 0;
int save_feedback_frames = 0;
const char* save_feedback = nullptr;
int overwrite_confirmation_slot = -1;
int menu_event_wait_frames = 0;
bool menu_script_controls_dialogue = false;
size_t menu_actor_init_index = 0;
size_t menu_actor_update_index = 0;
bool menu_actor_init_pending = false;
bool menu_actor_update_pending = false;
uint32_t screen_elapsed_frames = 0;
int active_background_index = -1;
bool active_background_applied = false;
uint32_t menu_save_sequence = 0;
int menu_initialization_result = -1;
bool menu_scene_has_hud_binding = false;
bool menu_ui_assets_restore_pending = false;
char hud_left_buffer[16] = {};
char hud_right_buffer[16] = {};
const char* map_hud_text_slots[8] = {};

struct MenuTextInputState {
    int variable_index;
    int max_length;
    int cursor_index;
    bool editing;
    int keyboard_index;
    bool lowercase;
    char value[gbs::menu_text_input_max_length + 1];
};

MenuTextInputState menu_text_input { -1, 0, 0, false, 0, false, {} };

enum class MenuPendingActionKind {
    None,
    OpenScreen,
    PushScreen,
    PopScreen,
    ActivateSelection
};

struct MenuPendingAction {
    MenuPendingActionKind kind;
    int screen_index;
    int item_index;
};

MenuPendingAction pending_menu_action { MenuPendingActionKind::None, -1, -1 };

constexpr size_t max_resource_bank_reservations = 16;
gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations]
    __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations]
    __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankBatchReservation active_resource_bank_group {
    active_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false
};
gbs::ResourceBankBatchReservation scratch_resource_bank_group {
    scratch_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false
};

void consume_event_state();
void consume_menu_save_request();
void complete_pending_menu_action();
void persist_menu_runtime_state(int slot_index = 0);
bool restore_menu_runtime_state(int slot_index = -1);
void refresh_menu_save_slot_statuses();
const gbs::MenuTextInputData* menu_text_input_config(const gbs::MenuScreenData* screen);
void activate_selection();

void copy_menu_text_input_to_event_state() {
    if (!gbs::is_valid_text_variable_index(menu_text_input.variable_index)) return;
    for (size_t index = 0; index <= gbs::text_variable_max_length; ++index) {
        event_state.text_variables[menu_text_input.variable_index][index] = menu_text_input.value[index];
    }
    event_state.text_variables[menu_text_input.variable_index][gbs::text_variable_max_length] = '\0';
}

void copy_event_text_variable_to_menu_input(int variable_index, int max_length) {
    if (!gbs::is_valid_text_variable_index(variable_index)) return;
    menu_text_input.variable_index = variable_index;
    menu_text_input.max_length = max_length;
    for (size_t index = 0; index <= gbs::text_variable_max_length; ++index) {
        menu_text_input.value[index] = event_state.text_variables[variable_index][index];
    }
    menu_text_input.value[gbs::menu_text_input_max_length] = '\0';
}

const char menu_text_input_alphabet[] = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

constexpr int menu_text_input_keyboard_grid[4][10] = {
    { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9 },
    { 10, 11, 12, 13, 14, 15, 16, 17, 18, 19 },
    { 20, 21, 22, 23, 24, 25, -1, -1, -1, -1 },
    { 26, -1, -1, -1, 27, -1, -1, 28, -1, -1 }
};

/* The side-control layout follows the GB Studio input reference: eight
 * letters per row, with Y/Z on the fourth row and the three actions in a
 * separate column. Keeping a dedicated grid avoids changing the compact
 * bottom-control layout used by existing projects. */
constexpr int menu_text_input_keyboard_side_grid[4][8] = {
    { 0, 1, 2, 3, 4, 5, 6, 7 },
    { 8, 9, 10, 11, 12, 13, 14, 15 },
    { 16, 17, 18, 19, 20, 21, 22, 23 },
    { 24, 25, -1, -1, -1, -1, -1, -1 }
};

int menu_text_input_keyboard_cell_index(bool side_controls, int row, int column, bool bottom_grid = false) {
    if (bottom_grid) {
        if (column < 0 || column >= 8 || row < 0 || row > 4) return -1;
        if (row == 4) return column < 3 ? 26 : column < 6 ? 27 : 28;
        return menu_text_input_keyboard_side_grid[row][column];
    }
    if (row < 0 || row >= 4 || column < 0) return -1;
    if (side_controls) {
        if (column == 8) return row < 3 ? 26 + row : -1;
        if (column >= 8) return -1;
        return menu_text_input_keyboard_side_grid[row][column];
    }
    if (column >= 10) return -1;
    return menu_text_input_keyboard_grid[row][column];
}

bool menu_text_input_uses_keyboard(const gbs::MenuTextInputData* config) {
    return config != nullptr &&
        config->keyboard.layout == gbs::MenuTextInputKeyboardLayout::Grid &&
        gbs::is_valid_menu_text_input_keyboard(config->keyboard);
}

void move_menu_text_input_keyboard(int horizontal, int vertical) {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    const gbs::MenuTextInputData* config = menu_text_input_config(screen);
    const bool side_controls = config != nullptr &&
        config->keyboard.control_layout == gbs::MenuTextInputKeyboardControlLayout::Side;
    const bool bottom_grid = config != nullptr &&
        config->keyboard.control_layout == gbs::MenuTextInputKeyboardControlLayout::BottomGrid;
    const int column_count = bottom_grid ? 8 : side_controls ? 9 : 10;
    const int row_count = bottom_grid ? 5 : 4;
    int row = -1;
    int column = -1;
    for (int candidate_row = 0; candidate_row < row_count; ++candidate_row) {
        for (int candidate_column = 0; candidate_column < column_count; ++candidate_column) {
            const int candidate_index = menu_text_input_keyboard_cell_index(
                side_controls,
                candidate_row,
                candidate_column, bottom_grid
            );
            if (candidate_index == menu_text_input.keyboard_index) {
                row = candidate_row;
                column = candidate_column;
            }
        }
    }
    if (row < 0 || column < 0) {
        menu_text_input.keyboard_index = 0;
        return;
    }

    if (horizontal != 0) {
        for (int distance = 1; distance <= column_count; ++distance) {
            int next_column = (column + horizontal * distance) % column_count;
            if (next_column < 0) next_column += column_count;
            const int candidate = menu_text_input_keyboard_cell_index(side_controls, row, next_column, bottom_grid);
            if (candidate >= 0 && candidate != menu_text_input.keyboard_index) {
                menu_text_input.keyboard_index = candidate;
                return;
            }
        }
        return;
    }

    if (vertical != 0) {
        for (int distance = 1; distance <= row_count; ++distance) {
            int next_row = (row + vertical * distance) % row_count;
            if (next_row < 0) next_row += row_count;
            int best_column = -1;
            int best_distance = column_count + 1;
            for (int candidate_column = 0; candidate_column < column_count; ++candidate_column) {
                const int candidate = menu_text_input_keyboard_cell_index(
                    side_controls,
                    next_row,
                    candidate_column, bottom_grid
                );
                if (candidate < 0) continue;
                const int candidate_distance = candidate_column > column
                    ? candidate_column - column
                    : column - candidate_column;
                if (candidate_distance < best_distance) {
                    best_distance = candidate_distance;
                    best_column = candidate_column;
                }
            }
            if (best_column >= 0) {
                menu_text_input.keyboard_index = menu_text_input_keyboard_cell_index(
                    side_controls,
                    next_row,
                    best_column, bottom_grid
                );
                return;
            }
        }
    }
}

void select_menu_text_input_character() {
    if (menu_text_input.cursor_index < 0 || menu_text_input.cursor_index >= menu_text_input.max_length ||
        menu_text_input.keyboard_index < 0 || menu_text_input.keyboard_index >= 26) {
        return;
    }
    menu_text_input.value[menu_text_input.cursor_index] = static_cast<char>(
        (menu_text_input.lowercase ? 'a' : 'A') + menu_text_input.keyboard_index
    );
    if (menu_text_input.cursor_index + 1 < menu_text_input.max_length) {
        ++menu_text_input.cursor_index;
    }
}

void backspace_menu_text_input_character() {
    if (menu_text_input.max_length <= 0) return;
    if (menu_text_input.cursor_index > 0) {
        --menu_text_input.cursor_index;
    }
    menu_text_input.value[menu_text_input.cursor_index] = ' ';
}

char* append_char(char* cursor, char* end, char value) {
    if (cursor < end) {
        *cursor = value;
        ++cursor;
    }
    return cursor;
}

char* append_text(char* cursor, char* end, const char* text) {
    while (text != nullptr && *text != '\0' && cursor < end) {
        *cursor = *text;
        ++cursor;
        ++text;
    }
    return cursor;
}

char* append_uint(char* cursor, char* end, uint32_t value) {
    char digits[10] = {};
    size_t count = 0;
    do {
        digits[count] = static_cast<char>('0' + value % 10);
        value /= 10;
        ++count;
    } while (value > 0 && count < sizeof(digits));
    while (count > 0 && cursor < end) {
        --count;
        *cursor = digits[count];
        ++cursor;
    }
    return cursor;
}

char* append_menu_item_details(
    char* cursor,
    char* end,
    const gbs::MenuItemData& item
) {
    if (item.action == gbs::MenuItemAction::AdjustVariable &&
        gbs::is_valid_event_variable(item.value.variable_index)) {
        cursor = append_text(cursor, end, " ");
        const int value = event_state.variables[item.value.variable_index];
        const int label_index = value - item.value.min_value;
        if (item.value_labels != nullptr && label_index >= 0 && static_cast<size_t>(label_index) < item.value_label_count) {
            cursor = append_text(cursor, end, item.value_labels[label_index]);
        } else cursor = append_uint(cursor, end, static_cast<uint32_t>(std::max(0, value)));
        if (item.audio_channel >= 0) cursor = append_char(cursor, end, '%');
    } else if (item.action == gbs::MenuItemAction::ToggleVariable &&
        gbs::is_valid_event_variable(item.value.variable_index)) {
        cursor = append_text(cursor, end, " ");
        cursor = append_text(
            cursor,
            end,
            event_state.variables[item.value.variable_index] == item.checked_value ? "ON" : "OFF"
        );
    }
    if (item.save_slot >= 0 && static_cast<size_t>(item.save_slot) < gbs::max_event_save_slots) {
        const auto* screen = gbs::menu_screen_for(project, menu_state.screen_index);
        const bool compact = screen != nullptr && screen->hud_transparent_text;
        cursor = append_text(cursor, end, event_state.save_slot_exists[item.save_slot]
            ? (compact ? " SALVO" : " [SALVO]") : (compact ? " LIVRE" : " [LIVRE]"));
    }
    if (item.binding.source != gbs::MenuItemBindingSource::None) {
        const int value = gbs::menu_item_binding_value(event_state, item);
        cursor = append_text(cursor, end, " ");
        switch (item.binding.format) {
            case gbs::MenuItemBindingFormat::Count:
                cursor = append_uint(cursor, end, static_cast<uint32_t>(std::max(0, value)));
                cursor = append_char(cursor, end, 'x');
                break;
            case gbs::MenuItemBindingFormat::Percent:
                cursor = append_uint(cursor, end, static_cast<uint32_t>(std::max(0, value)));
                cursor = append_char(cursor, end, '%');
                break;
            case gbs::MenuItemBindingFormat::OnOff:
                cursor = append_text(cursor, end, value != 0 ? "OK" : "NAO");
                break;
            case gbs::MenuItemBindingFormat::Number:
            default:
                cursor = append_uint(cursor, end, static_cast<uint32_t>(std::max(0, value)));
                break;
        }
    }
    return cursor;
}

char* append_hud_audio_bar(
    char* cursor,
    char* end,
    const gbs::MenuItemData& item
) {
    if (item.action != gbs::MenuItemAction::AdjustVariable ||
        item.audio_channel < 0 ||
        !gbs::is_valid_event_variable(item.value.variable_index) ||
        !gbs::is_valid_menu_item_value(item.value)) {
        return cursor;
    }
    const int range = std::max(1, item.value.max_value - item.value.min_value);
    const int value = std::max(item.value.min_value, std::min(
        item.value.max_value,
        event_state.variables[item.value.variable_index]
    ));
    const int filled = std::max(0, std::min(10, ((value - item.value.min_value) * 10 + range / 2) / range));
    cursor = append_text(cursor, end, " [");
    for (int index = 0; index < 10; ++index) {
        cursor = append_char(cursor, end, index < filled ? '!' : '.');
    }
    return append_char(cursor, end, ']');
}

void format_menu_item_label(const gbs::MenuItemData& item, size_t slot) {
    if (slot >= 16) {
        return;
    }
    char* cursor = menu_item_label_buffers[slot];
    char* end = cursor + sizeof(menu_item_label_buffers[slot]) - 1;
    cursor = append_text(cursor, end, item.label);
    cursor = append_menu_item_details(cursor, end, item);
    *cursor = '\0';
}

bool menu_screen_uses_actor_options(const gbs::MenuScreenData* screen);

void format_hud_menu_item_label(const gbs::MenuItemData& item, int item_index, size_t slot) {
    if (slot >= 16) {
        return;
    }
    char* cursor = menu_item_label_buffers[slot];
    char* end = cursor + sizeof(menu_item_label_buffers[slot]) - 1;
    if (!menu_screen_uses_actor_options(gbs::menu_screen_for(project, menu_state.screen_index))) {
        cursor = append_text(cursor, end, item_index == menu_state.selected_item_index ? "! " : "  ");
    }
    if (item.audio_channel >= 0 && item.action == gbs::MenuItemAction::AdjustVariable) {
        const char* audio_label = item.audio_channel == 4
            ? "Geral"
            : (item.audio_channel == 1 || item.audio_channel == 3 ? "Efeitos" : "Musica");
        cursor = append_text(cursor, end, audio_label);
        const auto* screen = gbs::menu_screen_for(project, menu_state.screen_index);
        if (screen != nullptr && screen->hud_transparent_text) {
            cursor = append_text(cursor, end, " ");
            cursor = append_uint(cursor, end, static_cast<uint32_t>(std::max(0, event_state.variables[item.value.variable_index])));
        } else cursor = append_hud_audio_bar(cursor, end, item);
    } else {
        cursor = append_text(cursor, end, item.label);
        cursor = append_menu_item_details(cursor, end, item);
    }
    *cursor = '\0';
}

void apply_menu_audio_binding(const gbs::MenuItemData& item, int value) {
    if (item.audio_channel < 0) {
        return;
    }
    const gbs::AudioChannel channel = gbs::audio_channel_from_event_value(item.audio_channel);
    if (item.action == gbs::MenuItemAction::ToggleVariable) {
        gbs::set_audio_channel_muted(channel, value != item.checked_value);
        return;
    }
    if (item.action != gbs::MenuItemAction::AdjustVariable) {
        return;
    }
    const int range = std::max(1, item.value.max_value - item.value.min_value);
    const int normalized = std::max(0, std::min(range, value - item.value.min_value));
    const uint8_t volume = static_cast<uint8_t>((normalized * 15) / range);
    gbs::set_audio_channel_volume(channel, volume);
    gbs::set_audio_channel_muted(channel, volume == 0);
}

bool menu_screen_uses_ui(const gbs::MenuScreenData* screen) {
    if (screen == nullptr ||
        screen->screen_type == gbs::MenuScreenType::Logo ||
        screen->screen_type == gbs::MenuScreenType::Title) {
        return false;
    }
    if (screen->screen_type != gbs::MenuScreenType::Menu || screen->actors == nullptr) {
        return true;
    }

    bool has_actor_option = false;
    for (size_t actor_index = 0; actor_index < screen->actor_count; ++actor_index) {
        if (screen->actors[actor_index].role == gbs::MenuActorRole::Option) {
            has_actor_option = true;
            break;
        }
    }
    if (!has_actor_option) {
        return true;
    }

    // Actor-only menu screens must leave BG0 transparent. The text-input and
    // HUD variants still need the UI layer for their authored controls.
    return screen->text_input.variable_index >= 0 || menu_scene_has_hud_binding;
}

bool menu_screen_uses_actor_options(const gbs::MenuScreenData* screen) {
    if (screen == nullptr ||
        screen->screen_type != gbs::MenuScreenType::Menu) {
        return false;
    }
    /* A text-input keyboard owns the screen presentation even when its
     * decorative/option actors were intentionally omitted. This keeps the
     * native grid from falling back to the generic menu/dialogue UI. */
    if (menu_text_input_config(screen) != nullptr) {
        return true;
    }
    if (screen->actors == nullptr) {
        return false;
    }
    for (size_t actor_index = 0; actor_index < screen->actor_count; ++actor_index) {
        const gbs::MenuActorData& actor = screen->actors[actor_index];
        if (actor.role == gbs::MenuActorRole::Option) {
            return true;
        }
    }
    return false;
}

bool menu_screen_uses_hud_layout(const gbs::MenuScreenData* screen) {
    return screen != nullptr &&
        screen->screen_type == gbs::MenuScreenType::Menu &&
        menu_scene_has_hud_binding;
}

bool menu_screen_uses_generic_menu(const gbs::MenuScreenData* screen) {
    if (screen == nullptr || screen->screen_type != gbs::MenuScreenType::Menu) {
        return false;
    }
    if (menu_screen_uses_actor_options(screen)) {
        return false;
    }
    return !menu_screen_uses_hud_layout(screen) ||
        screen->presentation_mode == gbs::MenuScenePresentationMode::Both;
}

gbs::EventScript menu_actor_interact_script_for(
    const gbs::MenuScreenData& screen,
    int item_index
) {
    if (screen.actors == nullptr) {
        return gbs::empty_event_script();
    }
    for (size_t actor_index = 0; actor_index < screen.actor_count; ++actor_index) {
        const gbs::MenuActorData& actor = screen.actors[actor_index];
        if (actor.role == gbs::MenuActorRole::Option &&
            actor.menu_item_index == item_index &&
            gbs::has_event_script(actor.on_interact)) {
            return actor.on_interact;
        }
    }
    return gbs::empty_event_script();
}

gbs::EventScript menu_actor_lifecycle_script(
    const gbs::MenuActorData& actor,
    bool init
) {
    return init ? actor.on_init : actor.on_update;
}

bool start_next_menu_actor_script(bool init) {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen == nullptr || screen->actors == nullptr) {
        return false;
    }
    size_t& actor_index = init ? menu_actor_init_index : menu_actor_update_index;
    while (actor_index < screen->actor_count) {
        const gbs::EventScript script = menu_actor_lifecycle_script(screen->actors[actor_index], init);
        ++actor_index;
        if (!gbs::has_event_script(script)) {
            continue;
        }
        menu_event_wait_frames = 0;
        menu_script_controls_dialogue = false;
        pending_menu_action = MenuPendingAction { MenuPendingActionKind::None, -1, -1 };
        gbs::start_event_runner(menu_event_runner, script);
        return true;
    }
    return false;
}

const gbs::MenuTextInputData* menu_text_input_config(const gbs::MenuScreenData* screen) {
    if (screen == nullptr || !gbs::is_valid_menu_text_input(screen->text_input) || screen->text_input.variable_index < 0) {
        return nullptr;
    }
    return &screen->text_input;
}

void clear_menu_text_input_overlay(const gbs::MenuScreenData* screen) {
    const gbs::MenuTextInputData* config = menu_text_input_config(screen);
    if (config != nullptr) {
        gbs::draw_text_overlay_light(config->x, config->y, config->width, nullptr, false);
    }
    gbs::draw_text_input_surface(0, 0, 0, 0, false);
    gbs::draw_text_input_keyboard(0, 0, 0, 0, 0, false, false);
}

void initialize_menu_text_input(const gbs::MenuScreenData* screen) {
    const gbs::MenuTextInputData* config = menu_text_input_config(screen);
    if (config == nullptr) {
        menu_text_input = MenuTextInputState { -1, 0, 0, false, 0, false, {} };
        return;
    }

    menu_text_input.variable_index = config->variable_index;
    menu_text_input.max_length = config->max_length;
    menu_text_input.cursor_index = 0;
    menu_text_input.editing = false;
    menu_text_input.keyboard_index = 0;
    menu_text_input.lowercase = false;
    copy_event_text_variable_to_menu_input(config->variable_index, config->max_length);
    copy_menu_text_input_to_event_state();
}

int menu_text_input_alphabet_index(char value) {
    for (int index = 0; menu_text_input_alphabet[index] != '\0'; ++index) {
        if (menu_text_input_alphabet[index] == value) return index;
    }
    return 0;
}

void cycle_menu_text_input_character(int direction) {
    if (!menu_text_input.editing || menu_text_input.cursor_index < 0 || menu_text_input.cursor_index >= menu_text_input.max_length) {
        return;
    }
    const int alphabet_length = static_cast<int>(sizeof(menu_text_input_alphabet) - 1);
    int index = menu_text_input_alphabet_index(menu_text_input.value[menu_text_input.cursor_index]);
    index = (index + direction) % alphabet_length;
    if (index < 0) index += alphabet_length;
    menu_text_input.value[menu_text_input.cursor_index] = menu_text_input_alphabet[index];
}

void build_menu_text_input_display(char* output, size_t capacity) {
    if (output == nullptr || capacity == 0) return;
    const int length = menu_text_input.max_length > 0
        ? menu_text_input.max_length
        : 0;
    const int copy_length = length < static_cast<int>(capacity - 1) ? length : static_cast<int>(capacity - 1);
    for (int index = 0; index < copy_length; ++index) {
        output[index] = menu_text_input.value[index] == '\0' ? ' ' : menu_text_input.value[index];
    }
    if (menu_text_input.editing && menu_text_input.cursor_index >= 0 && menu_text_input.cursor_index < copy_length) {
        const auto* screen = gbs::menu_screen_for(project, menu_state.screen_index);
        const auto* config = menu_text_input_config(screen);
        output[menu_text_input.cursor_index] = config != nullptr &&
            config->keyboard.control_layout == gbs::MenuTextInputKeyboardControlLayout::BottomGrid ? ' ' : '_';
    }
    output[copy_length] = '\0';
}

void draw_menu_text_input() {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    const gbs::MenuTextInputData* config = menu_text_input_config(screen);
    if (config == nullptr) return;
    char display[gbs::menu_text_input_max_length + 1] = {};
    build_menu_text_input_display(display, sizeof(display));
    const int surface_x = std::max(0, config->x - 2);
    const int surface_y = std::max(0, config->y - 2);
    const int surface_width = std::min(32 - surface_x, config->width + 4);
    gbs::draw_text_input_surface(surface_x, surface_y, surface_width, 4,
        config->keyboard.control_layout != gbs::MenuTextInputKeyboardControlLayout::BottomGrid);
    gbs::draw_text_overlay_light(config->x, config->y, config->width, display, true);
    if (menu_text_input_uses_keyboard(config)) {
        gbs::draw_text_input_keyboard_with_controls(
            config->keyboard.x,
            config->keyboard.y,
            config->keyboard.width,
            config->keyboard.height,
            menu_text_input.keyboard_index,
            menu_text_input.lowercase && config->keyboard.allow_lowercase,
            true,
            static_cast<int>(config->keyboard.control_layout),
            config->keyboard.controls_x,
            config->keyboard.controls_y,
            config->keyboard.controls_width,
            config->keyboard.controls_height,
            static_cast<int>(config->keyboard.surface)
        );
    } else {
        gbs::draw_text_input_keyboard(0, 0, 0, 0, 0, false, false);
    }
}

bool update_menu_text_input(const gbs::InputState& input) {
    if (!menu_text_input.editing) return false;
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    const gbs::MenuTextInputData* config = menu_text_input_config(screen);
    if (menu_text_input_uses_keyboard(config)) {
        if (input.was_pressed(gbs::ButtonUp)) {
            move_menu_text_input_keyboard(0, -1);
        } else if (input.was_pressed(gbs::ButtonDown)) {
            move_menu_text_input_keyboard(0, 1);
        } else if (input.was_pressed(gbs::ButtonLeft)) {
            move_menu_text_input_keyboard(-1, 0);
        } else if (input.was_pressed(gbs::ButtonRight)) {
            move_menu_text_input_keyboard(1, 0);
        } else if (input.was_pressed(gbs::ButtonA)) {
            if (menu_text_input.keyboard_index < 26) {
                select_menu_text_input_character();
            } else if (menu_text_input.keyboard_index == 26) {
                backspace_menu_text_input_character();
            } else if (menu_text_input.keyboard_index == 27) {
                if (config != nullptr && config->keyboard.allow_lowercase) {
                    menu_text_input.lowercase = !menu_text_input.lowercase;
                }
            } else if (menu_text_input.keyboard_index == 28) {
                menu_text_input.editing = false;
                if (screen != nullptr) {
                    for (size_t candidate_index = static_cast<size_t>(menu_state.selected_item_index + 1);
                         candidate_index < screen->item_count;
                         ++candidate_index) {
                        const gbs::MenuItemData* candidate = gbs::menu_item_for(
                            *screen,
                            static_cast<int>(candidate_index)
                        );
                        if (candidate != nullptr &&
                            gbs::menu_item_is_visible(event_state, *candidate) &&
                            gbs::menu_item_is_available(event_state, *candidate)) {
                            menu_state.selected_item_index = static_cast<int>(candidate_index);
                            activate_selection();
                            break;
                        }
                    }
                }
            }
        } else if (input.was_pressed(gbs::ButtonB) || input.was_pressed(gbs::ButtonStart)) {
            menu_text_input.editing = false;
        }
    } else if (input.was_pressed(gbs::ButtonUp)) {
        cycle_menu_text_input_character(1);
    } else if (input.was_pressed(gbs::ButtonDown)) {
        cycle_menu_text_input_character(-1);
    } else if (input.was_pressed(gbs::ButtonLeft)) {
        if (menu_text_input.cursor_index > 0) --menu_text_input.cursor_index;
    } else if (input.was_pressed(gbs::ButtonRight)) {
        if (menu_text_input.cursor_index + 1 < menu_text_input.max_length) ++menu_text_input.cursor_index;
    } else if (input.was_pressed(gbs::ButtonA)) {
        if (menu_text_input.cursor_index + 1 < menu_text_input.max_length) ++menu_text_input.cursor_index;
        else menu_text_input.editing = false;
    } else if (input.was_pressed(gbs::ButtonB) || input.was_pressed(gbs::ButtonStart)) {
        menu_text_input.editing = false;
    }
    copy_menu_text_input_to_event_state();
    return true;
}

void refresh_hud() {
    char* left = hud_left_buffer;
    char* left_end = hud_left_buffer + sizeof(hud_left_buffer) - 1;
    char* right = hud_right_buffer;
    char* right_end = hud_right_buffer + sizeof(hud_right_buffer) - 1;
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (!menu_screen_uses_ui(screen) || screen->screen_type == gbs::MenuScreenType::Title) {
        gbs::hide_hud(hud);
        return;
    }
    if (screen->screen_type == gbs::MenuScreenType::Menu && !menu_screen_uses_hud_layout(screen)) {
        gbs::hide_hud(hud);
        return;
    }
    if (menu_screen_uses_hud_layout(screen)) {
        if (screen->hud_list_rows > 0) {
            const size_t rows = screen->hud_list_rows;
            size_t selected_visible = 0;
            for (int i = 0; i < menu_state.selected_item_index; ++i) {
                if (gbs::menu_item_is_visible(event_state, screen->items[i])) ++selected_visible;
            }
            const size_t first_visible = (selected_visible / rows) * rows;
            size_t ordinal = 0;
            size_t count = 0;
            for (size_t i = 0; i < screen->item_count && count < rows; ++i) {
                if (!gbs::menu_item_is_visible(event_state, screen->items[i])) continue;
                if (ordinal++ < first_visible) continue;
                format_hud_menu_item_label(screen->items[i], static_cast<int>(i), count++);
            }
            for (size_t i = 0; i < gbs::hud_text_slot_capacity; ++i) map_hud_text_slots[i] = nullptr;
            char* title = append_text(hud_left_buffer, hud_left_buffer + sizeof(hud_left_buffer) - 1, screen->title);
            if (screen->title_text_variable >= 0 && static_cast<size_t>(screen->title_text_variable) < gbs::text_variable_count) {
                const char* name = event_state.text_variables[screen->title_text_variable];
                name = *name ? name : "Nara";
                // Name-only menu fields use eight cells, matching the player-name input.
                const size_t padding = title != hud_left_buffer ? 1 : gbs::menu_name_field_padding_cells(name, 8);
                for (size_t i = 0; i < padding; ++i) title = append_text(title, hud_left_buffer + sizeof(hud_left_buffer) - 1, " ");
                title = append_text(title, hud_left_buffer + sizeof(hud_left_buffer) - 1, name);
            }
            *title = '\0';
            map_hud_text_slots[0] = hud_left_buffer;
            for (size_t i = 0; i < rows; ++i) {
                if (i >= count) { menu_item_label_buffers[i][0] = ' '; menu_item_label_buffers[i][1] = '\0'; }
                map_hud_text_slots[i + 1] = menu_item_label_buffers[i];
            }
            map_hud_text_slots[rows + 1] = save_feedback_frames > 0 ? save_feedback : "D MOVER A OK B VOLTAR";
            const auto* selected = gbs::menu_item_for(*screen, menu_state.selected_item_index);
            for (size_t i = rows + 2; i < 8; ++i) {
                map_hud_text_slots[i] = selected && i - rows - 2 < 3 ? selected->detail_lines[i - rows - 2] : nullptr;
            }
            gbs::set_hud_text_slots(hud, map_hud_text_slots, 8);
            return;
        }
        const gbs::MenuItemData* selected_item = gbs::menu_item_for(*screen, menu_state.selected_item_index);
        char* selection = menu_item_label_buffers[0];
        char* selection_end = selection + sizeof(menu_item_label_buffers[0]) - 1;
        selection = append_text(selection, selection_end, selected_item != nullptr ? selected_item->label : "SELECIONE");
        *selection = '\0';
        map_hud_text_slots[0] = nullptr;
        map_hud_text_slots[1] = nullptr;
        map_hud_text_slots[2] = menu_item_label_buffers[0];
        for (size_t i = 0; i < 3; ++i) map_hud_text_slots[i + 3] = selected_item ? selected_item->detail_lines[i] : nullptr;
        char* progress = append_menu_item_details(hud_right_buffer, hud_right_buffer + sizeof(hud_right_buffer) - 1, selected_item ? *selected_item : screen->items[0]);
        *progress = '\0';
        map_hud_text_slots[6] = hud_right_buffer;
        map_hud_text_slots[7] = "D MOVER A OK B VOLTAR";
        gbs::set_hud_text_slots(hud, map_hud_text_slots, 8);
        return;
    }
    const char* screen_name = screen != nullptr && screen->title != nullptr
        ? screen->title
        : gbs::menu_screen_name(project, menu_state.screen_index);
    left = append_text(left, left_end, screen_name != nullptr ? screen_name : "MENU");
    *left = '\0';
    const gbs::MenuItemData* selected_item = screen != nullptr
        ? gbs::menu_item_for(*screen, menu_state.selected_item_index)
        : nullptr;
    if (selected_item != nullptr &&
        selected_item->action == gbs::MenuItemAction::ToggleVariable &&
        gbs::is_valid_event_variable(selected_item->value.variable_index)) {
        right = append_char(right, right_end, '[');
        right = append_char(
            right,
            right_end,
            event_state.variables[selected_item->value.variable_index] == selected_item->checked_value ? 'X' : ' '
        );
        right = append_char(right, right_end, ']');
        right = append_char(right, right_end, ' ');
    }
    right = append_char(right, right_end, 'I');
    right = append_uint(right, right_end, static_cast<uint32_t>(menu_state.selected_item_index + 1));
    right = append_char(right, right_end, ' ');
    right = append_char(right, right_end, 'S');
    right = append_uint(right, right_end, static_cast<uint32_t>(gbs::menu_stack_depth(menu_state)));
    *right = '\0';
    gbs::set_hud_text(hud, hud_left_buffer, hud_right_buffer);
}

void refresh_menu_ui() {
    gbs::hide_menu(menu_ui);
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen == nullptr ||
        screen->screen_type != gbs::MenuScreenType::Menu ||
        !menu_screen_uses_generic_menu(screen)) {
        return;
    }

    size_t visible_item_count = 0;
    int selected_item_index = -1;
    for (size_t index = 0; index < screen->item_count && visible_item_count < 16; ++index) {
        const gbs::MenuItemData& item = screen->items[index];
        if (!gbs::menu_item_is_visible(event_state, item)) {
            continue;
        }
        const bool enabled = gbs::menu_item_is_available(event_state, item);
        format_menu_item_label(item, visible_item_count);
        menu_ui_items[visible_item_count] = gbs::MenuItem {
            menu_item_label_buffers[visible_item_count],
            static_cast<int>(index),
            enabled
        };
        if (static_cast<int>(index) == menu_state.selected_item_index && enabled) {
            selected_item_index = static_cast<int>(visible_item_count);
        }
        ++visible_item_count;
    }

    const char* title = screen->title != nullptr
        ? screen->title
        : gbs::menu_screen_name(project, menu_state.screen_index);
    if (!gbs::show_menu(menu_ui, title, menu_ui_items, visible_item_count)) {
        return;
    }
    if (selected_item_index >= 0) {
        menu_ui.selected_index = selected_item_index;
    }
}

void stream_screen_resource_group(const gbs::MenuScreenData& screen) {
    if (project.resource_bank_group_count == 0) {
        return;
    }

    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_menu_screen(project, screen);
    if (group.bank_count == 0) {
        return;
    }

    gbs::stream_resource_bank_group(resource_manager, active_resource_bank_group, scratch_resource_bank_group, group);
}

void load_screen_actor_resources(const gbs::MenuScreenData& screen) {
    for (size_t actor_index = 0; actor_index < screen.actor_count; ++actor_index) {
        const gbs::MenuActorData& actor = screen.actors[actor_index];
        if (actor.tile_asset != nullptr) {
            bool already_loaded = false;
            for (size_t previous_index = 0; previous_index < actor_index; ++previous_index) {
                if (screen.actors[previous_index].tile_asset == actor.tile_asset) {
                    already_loaded = true;
                    break;
                }
            }
            if (!already_loaded) {
                gbs::load_tiles(*actor.tile_asset);
            }
        }
        if (actor.palette_asset != nullptr) {
            bool already_loaded = false;
            for (size_t previous_index = 0; previous_index < actor_index; ++previous_index) {
                if (screen.actors[previous_index].palette_asset == actor.palette_asset) {
                    already_loaded = true;
                    break;
                }
            }
            if (!already_loaded) {
                gbs::load_palette(*actor.palette_asset, true);
            }
        }
    }
}

void apply_background(const gbs::MenuScreenData& screen) {
    const int background_index = gbs::menu_screen_background_index(screen, screen_elapsed_frames);
    if (active_background_applied && background_index == active_background_index) {
        return;
    }
    active_background_index = background_index;
    active_background_applied = true;
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, false);
    gbs::disable_blending();
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, menu_screen_uses_ui(&screen));
    if (!gbs::is_valid_menu_background_index(project, background_index) || background_index < 0) {
        return;
    }

    const gbs::MenuBackgroundData& background = project.backgrounds[background_index];
    gbs::set_backdrop_color(background.backdrop_color);
    if (background_index < static_cast<int>(project.bg_palette_count)) {
        gbs::load_palette(project.bg_palettes[background_index], false);
    }
    if (background_index < static_cast<int>(project.tile_asset_count)) {
        gbs::load_tiles(project.tile_assets[background_index]);
    }
    gbs::load_tilemap(background.layer, background.tilemap);
    gbs::set_bg_enabled(background.layer, true);

    if (!gbs::is_valid_menu_background_index(project, screen.title_overlay_background_index) ||
        screen.title_overlay_background_index < 0) {
        return;
    }
    const gbs::MenuBackgroundData& overlay = project.backgrounds[screen.title_overlay_background_index];
    if (screen.title_overlay_background_index < static_cast<int>(project.bg_palette_count)) {
        gbs::load_palette(project.bg_palettes[screen.title_overlay_background_index], false);
    }
    if (screen.title_overlay_background_index < static_cast<int>(project.tile_asset_count)) {
        gbs::load_tiles(project.tile_assets[screen.title_overlay_background_index]);
    }
    gbs::load_tilemap(gbs::BackgroundLayer::BG0, overlay.tilemap);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
}

void draw_screen_actors() {
    gbs::hide_all_sprites();

    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen == nullptr || screen->actors == nullptr) {
        return;
    }

    // OAM slots 112-127 are reserved by the transparent actorized text field.
    const int max_oam_sprites = screen->text_input.keyboard.control_layout == gbs::MenuTextInputKeyboardControlLayout::BottomGrid ? 40 : 112;
    int sprite_index = 0;
    for (size_t actor_index = 0; actor_index < screen->actor_count; ++actor_index) {
        const gbs::MenuActorData& actor = screen->actors[actor_index];
        if ((screen->carousel || actor.selected_only) && actor.role == gbs::MenuActorRole::Option &&
            actor.menu_item_index != menu_state.selected_item_index) {
            continue;
        }
        if (screen->hud_list_rows > 0 && actor.role == gbs::MenuActorRole::Option && !actor.selected_only) {
            size_t selected_ordinal = 0, actor_ordinal = 0;
            for (int i = 0; i < menu_state.selected_item_index; ++i) if (gbs::menu_item_is_visible(event_state, screen->items[i])) ++selected_ordinal;
            for (int i = 0; i < actor.menu_item_index; ++i) if (gbs::menu_item_is_visible(event_state, screen->items[i])) ++actor_ordinal;
            if (actor_ordinal / screen->hud_list_rows != selected_ordinal / screen->hud_list_rows) continue;
        }
        if (actor.visibility_variable_index >= 0 &&
            (!gbs::is_valid_event_variable(actor.visibility_variable_index) ||
             event_state.variables[actor.visibility_variable_index] != actor.visibility_value)) {
            continue;
        }
        const gbs::MetaSprite* metasprite = gbs::menu_actor_metasprite_at(actor, menu_state.selected_item_index);
        if (metasprite == nullptr || !gbs::is_valid_metasprite(*metasprite)) {
            continue;
        }
        if (sprite_index + metasprite->part_count > max_oam_sprites) {
            break;
        }
        gbs::Vec2i position = gbs::menu_actor_position_at(actor, screen_elapsed_frames);
        if (actor.role == gbs::MenuActorRole::Cursor && menu_screen_uses_actor_options(screen)) {
            position = gbs::menu_cursor_position_at(
                *screen,
                menu_state.selected_item_index,
                actor,
                screen_elapsed_frames
            );
        }
        if (actor.flip_horizontal) {
            int left = 240;
            int right = 0;
            for (uint8_t part_index = 0; part_index < metasprite->part_count; ++part_index) {
                const gbs::MetaSpritePart& part = metasprite->parts[part_index];
                if (part.x < left) left = part.x;
                if (part.x + part.width > right) right = part.x + part.width;
            }
            for (uint8_t part_index = 0; part_index < metasprite->part_count; ++part_index) {
                const gbs::MetaSpritePart& part = metasprite->parts[part_index];
                gbs::Sprite sprite {
                    position.x + left + right - part.x - part.width,
                    position.y + part.y,
                    part.tile_index,
                    part.palette,
                    !part.hflip,
                    part.vflip,
                    true,
                    0,
                    gbs::SpriteRenderMode::Normal,
                    false,
                    part.width,
                    part.height
                };
                sprite.color_depth = part.color_depth;
                gbs::set_sprite(sprite_index + part_index, sprite);
            }
        } else {
            gbs::set_metasprite(sprite_index, *metasprite, position);
        }
        sprite_index += metasprite->part_count;
    }
}

void update_title_overlay_fade(const gbs::MenuScreenData* screen) {
    if (screen == nullptr || screen->title_overlay_background_index < 0) {
        gbs::disable_blending();
        return;
    }
    const uint8_t alpha = gbs::menu_title_fade_alpha(*screen, screen_elapsed_frames);
    if (alpha >= 16) {
        gbs::disable_blending();
        return;
    }
    gbs::set_blending(gbs::BlendConfig {
        gbs::RenderLayerBG0,
        static_cast<uint16_t>(
            gbs::RenderLayerBG1 |
            gbs::RenderLayerBG2 |
            gbs::RenderLayerBG3 |
            gbs::RenderLayerBackdrop
        ),
        gbs::BlendMode::Alpha,
        alpha,
        static_cast<uint8_t>(16 - alpha),
        0
    });
}

void consume_event_state() {
    gbs::consume_scene_transition_visual_effect_event(event_state);
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        nullptr,
        0
    );
    if (event_state.last_dialogue >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, event_state.last_dialogue);
        event_state.last_dialogue = -1;
        menu_script_controls_dialogue = gbs::event_runner_is_active(menu_event_runner);
        temporary_message_frames = menu_script_controls_dialogue ? 0 : 90;
    }
    if (event_state.last_text_input_variable >= 0) {
        const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
        const gbs::MenuTextInputData* config = menu_text_input_config(screen);
        if (config != nullptr && config->variable_index == event_state.last_text_input_variable) {
            copy_event_text_variable_to_menu_input(config->variable_index, config->max_length);
            menu_text_input.cursor_index = 0;
            menu_text_input.keyboard_index = 0;
            menu_text_input.lowercase = false;
            menu_text_input.editing = true;
            if (menu_text_input.value[0] == '\0') {
                initialize_menu_text_input(screen);
                menu_text_input.editing = true;
            }
        }
        event_state.last_text_input_variable = -1;
        event_state.text_input_max_length = 0;
        event_state.text_input_charset = 0;
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
        gbs::set_audio_channel_muted(gbs::audio_channel_from_event_value(event_state.audio_mute_channel), event_state.audio_mute_enabled);
        event_state.audio_mute_changed = false;
    }
    if (event_state.audio_volume_changed) {
        gbs::set_audio_channel_volume(gbs::audio_channel_from_event_value(event_state.audio_volume_channel), static_cast<uint8_t>(event_state.audio_volume));
        event_state.audio_volume_changed = false;
    }
    if (event_state.audio_fade_changed) {
        gbs::fade_audio_channel_volume(gbs::audio_channel_from_event_value(event_state.audio_fade_channel), static_cast<uint8_t>(event_state.audio_fade_target_volume), static_cast<uint16_t>(event_state.audio_fade_frames));
        event_state.audio_fade_changed = false;
    }
    if (event_state.close_dialogue) {
        gbs::hide_dialogue(dialogue);
        event_state.close_dialogue = false;
        menu_script_controls_dialogue = false;
        temporary_message_frames = 0;
    }
    if (event_state.stop_music) {
        gbs::stop_music();
        gbs::stop_tracker_music();
        gbs::stop_pcm_music();
        event_state.stop_music = false;
    }
    if (event_state.wait_frames > 0) {
        menu_event_wait_frames = event_state.wait_frames;
        event_state.wait_frames = 0;
    }
    consume_menu_save_request();
}

void select_first_visible_item(const gbs::MenuScreenData& screen) {
    int first = gbs::menu_first_visible_item_index(screen, event_state);
    menu_state.selected_item_index = first >= 0 ? first : 0;
}

void ensure_selected_visible_item(const gbs::MenuScreenData& screen) {
    const gbs::MenuItemData* item = gbs::menu_item_for(screen, menu_state.selected_item_index);
    if (item == nullptr || !gbs::menu_item_is_available(event_state, *item)) {
        select_first_visible_item(screen);
    }
}

bool start_menu_event_script(gbs::EventScript script, MenuPendingAction action) {
    pending_menu_action = action;
    menu_event_wait_frames = 0;
    menu_script_controls_dialogue = false;
    if (!gbs::has_event_script(script)) {
        return false;
    }
    gbs::start_event_runner(menu_event_runner, script);
    return true;
}

bool update_menu_event_script(const gbs::InputState& input) {
    if (menu_script_controls_dialogue && dialogue.visible) {
        const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
        if (menu_screen_uses_hud_layout(screen) && input.was_pressed(gbs::ButtonB)) {
            gbs::hide_dialogue(dialogue);
        } else {
            gbs::advance_dialogue(dialogue, input);
        }
        if (!dialogue.visible) {
            menu_script_controls_dialogue = false;
        }
        return true;
    }
    if (menu_event_wait_frames > 0) {
        --menu_event_wait_frames;
        return true;
    }
    if (!gbs::event_runner_is_active(menu_event_runner)) {
        const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
        if (menu_actor_init_pending) {
            if (start_next_menu_actor_script(true)) {
                gbs::update_event_runner(menu_event_runner, event_state);
                consume_event_state();
                return true;
            }
            menu_actor_init_pending = false;
        }
        if (!menu_actor_update_pending) {
            menu_actor_update_index = 0;
            menu_actor_update_pending = screen != nullptr;
        }
        if (menu_actor_update_pending) {
            if (start_next_menu_actor_script(false)) {
                gbs::update_event_runner(menu_event_runner, event_state);
                consume_event_state();
                return true;
            }
            menu_actor_update_pending = false;
        }
        return false;
    }

    gbs::update_event_runner(menu_event_runner, event_state);
    consume_event_state();
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        pending_menu_action = MenuPendingAction { MenuPendingActionKind::None, -1, -1 };
        gbs::stop_event_runner(menu_event_runner);
        return true;
    }
#endif
    if (!gbs::event_runner_is_active(menu_event_runner) &&
        menu_event_wait_frames == 0 &&
        !menu_script_controls_dialogue) {
        complete_pending_menu_action();
    }
    return true;
}

void start_screen(int screen_index, bool reset_selection = true, int target_item_index = -1) {
    clear_menu_text_input_overlay(gbs::menu_screen_for(project, menu_state.screen_index));
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, screen_index);
    if (screen == nullptr) {
        return;
    }
    gbs::begin_render_publication_transaction();
    gbs::hide_hud(hud);
    gbs::hide_dialogue(dialogue);
    gbs::disable_blending();
    temporary_message_frames = 0;
    save_feedback_frames = 0;
    overwrite_confirmation_slot = -1;
    menu_script_controls_dialogue = false;
    menu_actor_init_index = 0;
    menu_actor_update_index = 0;
    menu_actor_init_pending = true;
    menu_actor_update_pending = false;
    menu_state.screen_index = screen_index;
    screen_elapsed_frames = 0;
    active_background_index = -1;
    active_background_applied = false;
    refresh_menu_save_slot_statuses();
    if (reset_selection) {
        select_first_visible_item(*screen);
    } else {
        ensure_selected_visible_item(*screen);
    }
    stream_screen_resource_group(*screen);
    load_screen_actor_resources(*screen);
    // Reapply the native dialogue/HUD tiles and palettes after the staged
    // screen resources finish uploading. The publication transaction keeps
    // the previous frame visible until that point.
    menu_ui_assets_restore_pending = true;
    if (screen->screen_type != gbs::MenuScreenType::Logo &&
        screen->screen_type != gbs::MenuScreenType::Title) {
        const char* scene_name = gbs::menu_screen_name(project, menu_state.screen_index);
        gbastudio_dialogue_ui::configure_for_scene(scene_name, true);
        menu_scene_has_hud_binding = gbastudio_dialogue_ui::has_hud_scene_binding(scene_name);
    } else {
        menu_scene_has_hud_binding = false;
        gbs::hide_hud(hud);
        gbs::hide_dialogue(dialogue);
    }
    apply_background(*screen);
    initialize_menu_text_input(screen);
    start_menu_event_script(
        screen->on_enter,
        MenuPendingAction { MenuPendingActionKind::None, -1, -1 }
    );
    if (reset_selection) {
        select_first_visible_item(*screen);
    } else {
        ensure_selected_visible_item(*screen);
    }
    if (target_item_index >= 0) {
        gbs::menu_focus_item(project, event_state, menu_state, target_item_index);
    }
    refresh_hud();
}

void publish_menu_screen_telemetry() {
    volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
    runtime_telemetry.current_room = menu_state.screen_index;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
    }
    gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
}

bool menu_save_is_enabled() {
#if GBS_MULTI_RUNTIME
    return gbastudio_mixed_project::save_enabled;
#else
    return gbastudio_menu_project::save_enabled;
#endif
}

gbs::SaveBank menu_save_bank() {
#if GBS_MULTI_RUNTIME
    return gbastudio_mixed_project::save_bank;
#else
    return gbastudio_menu_project::save_bank;
#endif
}

void refresh_menu_save_slot_statuses() {
    const gbs::SaveBank bank = menu_save_bank();
    for (size_t index = 0; index < gbs::max_event_save_slots; ++index) {
        event_state.save_slot_exists[index] = menu_save_is_enabled() &&
            index < bank.slot_count &&
            gbs::inspect_save_slot(bank, index).status == gbs::SaveStatus::Ok;
    }
}

void persist_menu_runtime_state(int slot_index) {
#if GBS_MULTI_RUNTIME
    return;
#else
    if (!gbastudio_menu_project::save_enabled ||
        slot_index < 0 ||
        static_cast<size_t>(slot_index) >= gbastudio_menu_project::save_bank.slot_count) {
        return;
    }
    gbs::MenuSaveData save_data {};
    gbs::capture_menu_save_data(save_data, menu_state, event_state, gbs::frame_count());
    ++menu_save_sequence;
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "MENU",
        gbs::frame_count(),
        menu_save_sequence,
        static_cast<uint16_t>(menu_state.screen_index < 0 ? 0 : menu_state.screen_index),
        0
    );
    gbs::write_save_slot_record(
        gbastudio_menu_project::save_bank,
        static_cast<size_t>(slot_index),
        &save_data,
        sizeof(save_data),
        metadata,
        menu_save_sequence
    );
#endif
}

bool restore_menu_runtime_state(int slot_index) {
#if GBS_MULTI_RUNTIME
    return false;
#else
    if (!gbastudio_menu_project::save_enabled) {
        return false;
    }
    if (slot_index < 0) {
        slot_index = gbs::find_latest_save_slot(gbastudio_menu_project::save_bank);
    }
    if (slot_index < 0 || static_cast<size_t>(slot_index) >= gbastudio_menu_project::save_bank.slot_count) {
        return false;
    }
    gbs::MenuSaveData save_data {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_menu_project::save_bank,
        static_cast<size_t>(slot_index),
        &save_data,
        sizeof(save_data),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok || bytes_read != sizeof(save_data)) {
        return false;
    }
    if (!gbs::apply_menu_save_data(project, save_data, menu_state, event_state)) {
        return false;
    }
    gbs::SaveInfo info = gbs::inspect_save_slot(gbastudio_menu_project::save_bank, static_cast<size_t>(slot_index));
    menu_save_sequence = info.sequence;
    return true;
#endif
}

#if GBS_MULTI_RUNTIME
gbs::RuntimeAvailabilityMask mixed_runtime_availability() {
    gbs::RuntimeAvailabilityMask available = 0;
#if GBS_MIXED_HAS_TOPDOWN
    available |= gbs::runtime_availability(gbs::RuntimeKind::TopDown);
#endif
#if GBS_MIXED_HAS_PLATFORMER
    available |= gbs::runtime_availability(gbs::RuntimeKind::Platformer);
#endif
#if GBS_MIXED_HAS_ISOMETRIC
    available |= gbs::runtime_availability(gbs::RuntimeKind::Isometric);
#endif
#if GBS_MIXED_HAS_DUNGEON_CRAWLER
    available |= gbs::runtime_availability(gbs::RuntimeKind::DungeonCrawler);
#endif
#if GBS_MIXED_HAS_RACING
    available |= gbs::runtime_availability(gbs::RuntimeKind::Racing);
#endif
#if GBS_MIXED_HAS_WORLD_MAP
    available |= gbs::runtime_availability(gbs::RuntimeKind::WorldMap);
#endif
#if GBS_MIXED_HAS_CUTSCENE
    available |= gbs::runtime_availability(gbs::RuntimeKind::Cutscene);
#endif
#if GBS_MIXED_HAS_POINT_CLICK
    available |= gbs::runtime_availability(gbs::RuntimeKind::PointClick);
#endif
#if GBS_MIXED_HAS_VISUAL_NOVEL
    available |= gbs::runtime_availability(gbs::RuntimeKind::VisualNovel);
#endif
#if GBS_MIXED_HAS_SHMUP
    available |= gbs::runtime_availability(gbs::RuntimeKind::Shmup);
#endif
#if GBS_MIXED_HAS_BATTLE_RPG
    available |= gbs::runtime_availability(gbs::RuntimeKind::BattleRpg);
#endif
#if GBS_MIXED_HAS_LUTA
    available |= gbs::runtime_availability(gbs::RuntimeKind::Luta);
#endif
    return available;
}

bool request_mixed_runtime_save_restore(int slot_index) {
    if (!gbastudio_mixed_project::save_enabled) {
        return false;
    }
    return gbs::request_universal_save_restore(
        gbastudio_mixed_project::save_bank,
        slot_index,
        mixed_runtime_availability()
    );
}
#endif

void consume_menu_save_request() {
    if (event_state.save_request == 0) {
        return;
    }
    const int request = event_state.save_request;
    const int slot_index = event_state.save_request_slot;
#if GBS_MULTI_RUNTIME
    if (request == 1) {
        gbs::RuntimeSaveService* service = gbs::active_runtime_save_service();
        const bool saved = event_state.scene_stack_count > 0 && service != nullptr &&
            gbs::write_suspended_runtime_save(*service, slot_index, event_state) == gbs::SaveStatus::Ok;
        save_feedback = saved ? "JOGO SALVO" : "FALHA AO SALVAR";
        save_feedback_frames = 180;
    } else if (request == 2) {
        request_mixed_runtime_save_restore(slot_index);
    } else if (request == 3 &&
        gbastudio_mixed_project::save_enabled &&
        slot_index >= 0 &&
        static_cast<size_t>(slot_index) < gbastudio_mixed_project::save_bank.slot_count) {
        gbs::clear_save_slot(gbastudio_mixed_project::save_bank, static_cast<size_t>(slot_index));
    }
#else
    if (request == 1) {
        persist_menu_runtime_state(slot_index);
    } else if (request == 2 && restore_menu_runtime_state(slot_index)) {
        pending_menu_action = MenuPendingAction { MenuPendingActionKind::None, -1, -1 };
        menu_event_wait_frames = 0;
        menu_script_controls_dialogue = false;
        gbs::stop_event_runner(menu_event_runner);
        start_screen(menu_state.screen_index, false);
    } else if (request == 3 &&
        gbastudio_menu_project::save_enabled &&
        slot_index >= 0 &&
        static_cast<size_t>(slot_index) < gbastudio_menu_project::save_bank.slot_count) {
        gbs::clear_save_slot(gbastudio_menu_project::save_bank, static_cast<size_t>(slot_index));
    }
#endif
    event_state.save_request = 0;
    event_state.save_request_slot = -1;
    refresh_menu_save_slot_statuses();
}

void refresh_menu_text() {
    if (temporary_message_frames > 0) {
        --temporary_message_frames;
        return;
    }

    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen == nullptr) {
        return;
    }
    if (!menu_screen_uses_ui(screen) ||
        !menu_screen_uses_generic_menu(screen)) {
        gbs::hide_dialogue(dialogue);
        return;
    }
    if (screen->screen_type == gbs::MenuScreenType::Title) {
        gbs::hide_dialogue(dialogue);
        return;
    }
    const gbs::MenuItemData* item = gbs::menu_item_for(*screen, menu_state.selected_item_index);
    if (item == nullptr || !gbs::menu_item_is_visible(event_state, *item)) {
        select_first_visible_item(*screen);
        item = gbs::menu_item_for(*screen, menu_state.selected_item_index);
    }
    int line = item != nullptr && gbs::menu_item_is_visible(event_state, *item)
        ? item->line_index
        : screen->title_line_index;
    if (line >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, line);
    }
}

void move_selection(int direction_x, int direction_y) {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen == nullptr) {
        return;
    }
    int next = screen->carousel
        ? gbs::menu_carousel_item_index(*screen, event_state, menu_state.selected_item_index, direction_x)
        : screen->hud_list_rows > 0 && direction_y != 0
        ? gbs::menu_next_visible_item_index(*screen, event_state, menu_state.selected_item_index, direction_y)
        : gbs::menu_directional_item_index(
        *screen,
        event_state,
        menu_state.selected_item_index,
        direction_x,
        direction_y
    );
    if (next < 0 && direction_y != 0 && !screen->carousel) {
        next = gbs::menu_next_visible_item_index(*screen, event_state, menu_state.selected_item_index, direction_y);
    }
    if (next >= 0) {
        menu_state.selected_item_index = next;
        temporary_message_frames = 0;
        refresh_menu_text();
        refresh_hud();
        persist_menu_runtime_state();
    }
}

void run_current_screen_exit(MenuPendingAction action) {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen != nullptr && start_menu_event_script(screen->on_exit, action)) {
        return;
    }
    pending_menu_action = action;
    complete_pending_menu_action();
}

void open_screen(int screen_index, int target_item_index = -1) {
    if (!gbs::is_valid_menu_screen_index(project, screen_index)) {
        return;
    }
    run_current_screen_exit(MenuPendingAction { MenuPendingActionKind::OpenScreen, screen_index, target_item_index });
}

void push_screen(int screen_index, int target_item_index = -1) {
    if (!gbs::is_valid_menu_screen_index(project, screen_index) ||
        menu_state.screen_stack_count >= gbs::menu_screen_stack_capacity) {
        return;
    }
    run_current_screen_exit(MenuPendingAction { MenuPendingActionKind::PushScreen, screen_index, target_item_index });
}

void pop_screen() {
    if (menu_state.screen_stack_count == 0) {
        return;
    }
    run_current_screen_exit(MenuPendingAction { MenuPendingActionKind::PopScreen, -1, -1 });
}

void back_from_screen() {
    if (menu_state.screen_stack_count == 0 && event_state.scene_stack_count > 0) gbs::request_suspended_runtime_resume(event_state);
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (menu_state.screen_stack_count == 0 && screen != nullptr &&
        start_menu_event_script(screen->on_back, MenuPendingAction { MenuPendingActionKind::None, -1, -1 })) {
        return;
    }
    pop_screen();
}

void adjust_current_item(int direction) {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen == nullptr) {
        return;
    }
    const gbs::MenuItemData* item = gbs::menu_item_for(*screen, menu_state.selected_item_index);
    if (item == nullptr ||
        item->action != gbs::MenuItemAction::AdjustVariable ||
        !gbs::menu_item_is_available(event_state, *item) ||
        !gbs::is_valid_event_variable(item->value.variable_index)) {
        return;
    }
    const int next_value = gbs::menu_adjusted_variable_value(
        *item,
        event_state.variables[item->value.variable_index],
        direction
    );
    event_state.variables[item->value.variable_index] = next_value;
    apply_menu_audio_binding(*item, next_value);
    start_menu_event_script(item->on_select, MenuPendingAction { MenuPendingActionKind::None, -1, -1 });
    temporary_message_frames = 0;
    refresh_menu_text();
    refresh_hud();
    persist_menu_runtime_state();
}

bool current_item_adjusts() {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    const gbs::MenuItemData* item = screen != nullptr
        ? gbs::menu_item_for(*screen, menu_state.selected_item_index)
        : nullptr;
    return item != nullptr && item->action == gbs::MenuItemAction::AdjustVariable;
}

void apply_selection_action(int screen_index, int item_index) {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, screen_index);
    if (screen == nullptr) {
        return;
    }
    const gbs::MenuItemData* item = gbs::menu_item_for(*screen, item_index);
    if (item == nullptr) {
        return;
    }

    if (item->action == gbs::MenuItemAction::ToggleVariable &&
        gbs::is_valid_event_variable(item->value.variable_index)) {
        event_state.variables[item->value.variable_index] = gbs::menu_toggled_variable_value(
            *item,
            event_state.variables[item->value.variable_index]
        );
        apply_menu_audio_binding(*item, event_state.variables[item->value.variable_index]);
        refresh_menu_text();
        refresh_hud();
        persist_menu_runtime_state();
        return;
    }
    if (item->action == gbs::MenuItemAction::AdjustVariable) {
        adjust_current_item(1);
        return;
    }
    if (item->action == gbs::MenuItemAction::PopScreen) {
        pop_screen();
        return;
    }
    if (item->action == gbs::MenuItemAction::PushScreen) {
        push_screen(item->target_screen_index, item->target_item_index);
        return;
    }
    if (item->action == gbs::MenuItemAction::OpenScreen || item->target_screen_index >= 0) {
        open_screen(item->target_screen_index, item->target_item_index);
        return;
    }
    refresh_hud();
    persist_menu_runtime_state();
}

void complete_pending_menu_action() {
    const MenuPendingAction action = pending_menu_action;
    pending_menu_action = MenuPendingAction { MenuPendingActionKind::None, -1, -1 };
    if (action.kind == MenuPendingActionKind::OpenScreen) {
        start_screen(action.screen_index, true, action.item_index);
        refresh_hud();
        persist_menu_runtime_state();
        return;
    }
    if (action.kind == MenuPendingActionKind::PushScreen) {
        if (gbs::menu_push_screen(menu_state, action.screen_index)) {
            start_screen(action.screen_index, true, action.item_index);
            refresh_hud();
            persist_menu_runtime_state();
        }
        return;
    }
    if (action.kind == MenuPendingActionKind::PopScreen) {
        if (gbs::menu_pop_screen(menu_state)) {
            start_screen(menu_state.screen_index, false);
            refresh_hud();
            persist_menu_runtime_state();
        }
        return;
    }
    if (action.kind == MenuPendingActionKind::ActivateSelection) {
        apply_selection_action(action.screen_index, action.item_index);
    }
}

void activate_selection() {
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen == nullptr) {
        return;
    }
    const int item_index = menu_state.selected_item_index;
    const gbs::MenuItemData* item = gbs::menu_item_for(*screen, item_index);
    if (item == nullptr || !gbs::menu_item_is_visible(event_state, *item)) {
        return;
    }
    if (!gbs::menu_item_is_available(event_state, *item)) {
        refresh_menu_text();
        return;
    }

    if (item->action == gbs::MenuItemAction::AdjustVariable) {
        adjust_current_item(1);
        return;
    }
    if (item->action == gbs::MenuItemAction::PopScreen && menu_state.screen_stack_count == 0 && event_state.scene_stack_count > 0) {
        gbs::request_suspended_runtime_resume(event_state);
    }
    const MenuPendingAction action {
        MenuPendingActionKind::ActivateSelection,
        menu_state.screen_index,
        item_index
    };
    const gbs::EventScript actor_interact = menu_actor_interact_script_for(*screen, item_index);
    if (gbs::has_event_script(actor_interact)) {
        start_menu_event_script(
            actor_interact,
            MenuPendingAction { MenuPendingActionKind::None, -1, -1 }
        );
    } else if (!start_menu_event_script(item->on_select, action)) {
        complete_pending_menu_action();
    }
}

} // namespace

int initialize_menu_runtime() {
    gbs::init();
    gbs::init_dialogue(dialogue);
    gbs::init_menu(menu_ui);
    gbs::init_hud(hud);
    gbs::init_event_state(event_state);
    gbs::init_event_runner(menu_event_runner);
    gbs::init_resource_manager(resource_manager);
    gbs::set_backdrop_color(gbs::rgb15(1, 1, 5));

    if (!gbs::is_valid_menu_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    menu_state = gbs::menu_runtime_from_project(project);
#if GBS_MULTI_RUNTIME
    int transition_screen = project.initial_screen;
    int transition_x = 0;
    int transition_y = 0;
    const bool resumed_from_transition = gbs::consume_runtime_transition(
        gbs::RuntimeKind::Menu,
        event_state,
        transition_screen,
        transition_x,
        transition_y
    );
    start_screen(resumed_from_transition ? transition_screen : project.initial_screen);
#else
    if (restore_menu_runtime_state()) {
        start_screen(menu_state.screen_index, false);
    } else {
        start_screen(project.initial_screen);
        persist_menu_runtime_state();
    }
#endif
    // A runtime handoff can carry a reveal even when on_enter is empty.
    gbs::consume_scene_transition_visual_effect_event(event_state);
    refresh_menu_save_slot_statuses();

    return 0;
}

gbs::RuntimeAdapterFrameResult update_menu_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (screen != nullptr &&
        screen->screen_type != gbs::MenuScreenType::Logo &&
        screen->screen_type != gbs::MenuScreenType::Title) {
        const char* scene_name = gbs::menu_screen_name(project, menu_state.screen_index);
        gbastudio_dialogue_ui::configure_for_scene(scene_name);
        menu_scene_has_hud_binding = gbastudio_dialogue_ui::has_hud_scene_binding(scene_name);
    } else {
        menu_scene_has_hud_binding = false;
    }
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
    gbs::update_hud_behavior(event_state, hud.visible && menu_scene_has_hud_binding);
    ++screen_elapsed_frames;
    if (save_feedback_frames > 0) --save_feedback_frames;
    if (screen != nullptr) {
        apply_background(*screen);
    }
    if ((input.pressed & (gbs::ButtonUp | gbs::ButtonDown | gbs::ButtonLeft | gbs::ButtonRight)) != 0) {
        overwrite_confirmation_slot = -1;
        save_feedback_frames = 0;
    }
    const bool handled_menu_script = update_menu_event_script(input);
    const bool handled_text_input = !handled_menu_script && update_menu_text_input(input);
    update_title_overlay_fade(screen);
    const bool skip_pressed = input.was_pressed(gbs::ButtonA) ||
        input.was_pressed(gbs::ButtonB) ||
        input.was_pressed(gbs::ButtonStart);
    bool handled_screen_advance = false;
    if (!handled_menu_script && screen != nullptr && screen->screen_type == gbs::MenuScreenType::Logo &&
        gbs::menu_screen_should_advance(*screen, screen_elapsed_frames, skip_pressed) &&
        gbs::is_valid_menu_screen_index(project, screen->next_screen_index)) {
        open_screen(screen->next_screen_index);
        handled_screen_advance = true;
    } else if (!handled_menu_script && screen != nullptr && screen->screen_type == gbs::MenuScreenType::Title &&
        screen->auto_advance_frames > 0 &&
        gbs::menu_screen_should_advance(*screen, screen_elapsed_frames, false) &&
        gbs::is_valid_menu_screen_index(project, screen->next_screen_index)) {
        open_screen(screen->next_screen_index);
        handled_screen_advance = true;
    }

    if (handled_menu_script) {
        // Event scripts own the frame until waits, dialogue and deferred actions finish.
    } else if (handled_text_input) {
        // The actorized name field owns the frame while its character cursor is active.
    } else if (handled_screen_advance) {
        temporary_message_frames = 0;
    } else if (input.was_pressed(gbs::ButtonUp)) {
        move_selection(0, -1);
    } else if (input.was_pressed(gbs::ButtonDown)) {
        move_selection(0, 1);
    } else if (input.was_pressed(gbs::ButtonLeft)) {
        if (current_item_adjusts()) {
            adjust_current_item(-1);
        } else {
            move_selection(-1, 0);
        }
    } else if (input.was_pressed(gbs::ButtonRight)) {
        if (current_item_adjusts()) {
            adjust_current_item(1);
        } else {
            move_selection(1, 0);
        }
    } else if (input.was_pressed(gbs::ButtonA) ||
        input.was_pressed(gbs::ButtonStart)) {
        const gbs::MenuItemData* item = screen ? gbs::menu_item_for(*screen, menu_state.selected_item_index) : nullptr;
        if (item && item->save_slot >= 0 && !item->requires_save && event_state.save_slot_exists[item->save_slot]
            && overwrite_confirmation_slot != item->save_slot) {
            overwrite_confirmation_slot = item->save_slot;
            save_feedback = "A SUBSTITUIR  B CANCELAR";
            save_feedback_frames = 3600;
        } else {
            overwrite_confirmation_slot = -1;
            activate_selection();
        }
    } else if (input.was_pressed(gbs::ButtonB)) {
        if (overwrite_confirmation_slot >= 0) {
            overwrite_confirmation_slot = -1;
            save_feedback_frames = 0;
        } else back_from_screen();
        temporary_message_frames = 0;
    }

#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        return gbs::RuntimeAdapterFrameResult::Transition;
    }
#endif

    return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_menu_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    const gbs::MenuScreenData* screen = gbs::menu_screen_for(project, menu_state.screen_index);
    if (!menu_script_controls_dialogue) {
        refresh_menu_text();
    }
    refresh_hud();
    refresh_menu_ui();
    draw_screen_actors();
    if (menu_screen_uses_generic_menu(screen)) {
        gbs::draw_menu(menu_ui);
    }
    gbs::update_dialogue(dialogue);
    gbs_hw_set_bg_font_transparent(screen != nullptr && screen->hud_transparent_text);
    /* Invisible dialogue still clears its previous box. When an advanced HUD
     * is active, perform that cleanup first so it cannot erase HUD rows that
     * occupy the same lower BG0 tiles. */
    if (gbs::active_hud_layout() != nullptr) {
        if (!dialogue.visible) gbs::draw_dialogue(dialogue);
        gbs::draw_hud(hud);
        if (dialogue.visible) gbs::draw_dialogue(dialogue);
    } else {
        gbs::draw_hud(hud);
        gbs::draw_dialogue(dialogue);
    }
    /* Text input is the scene-owned UI layer. Draw it after the generic HUD
     * and dialogue cleanup so those systems cannot erase its keyboard rows. */
    draw_menu_text_input();
    if (screen != nullptr && menu_screen_uses_hud_layout(screen)) {
        const gbs::PaletteAsset ink { &screen->hud_text_color, 1, 14 * 16 + 4 };
        gbs::load_palette(ink, false);
    }
    publish_menu_screen_telemetry();
    gbs::wait_vblank();
    if (menu_ui_assets_restore_pending && !gbs::render_publication_transaction_active()) {
        gbs::render_ui_assets();
        // Generic UI restoration resets palette entries. Reapply the scene's
        // approved skins even when configure_for_scene's cache is unchanged.
        gbs::configure_dialogue_box_skin(gbs::active_dialogue_box_skin());
        gbs::configure_hud_box_skin(gbs::active_hud_box_skin());
        const gbs::MenuScreenData* published_screen = gbs::menu_screen_for(project, menu_state.screen_index);
        // Actor-only screens own all 16 BG banks. UI initialization must not
        // leave banks 14/15 overwritten by hidden dialogue and HUD skins.
        if (published_screen != nullptr && !menu_screen_uses_ui(published_screen) &&
            active_background_index >= 0 && active_background_index < static_cast<int>(project.bg_palette_count)) {
            gbs::load_palette(project.bg_palettes[active_background_index], false);
        }
        if (published_screen != nullptr &&
            published_screen->screen_type != gbs::MenuScreenType::Logo &&
            published_screen->screen_type != gbs::MenuScreenType::Title) {
            const char* scene_name = gbs::menu_screen_name(project, menu_state.screen_index);
            gbastudio_dialogue_ui::configure_for_scene(scene_name);
        }
        menu_ui_assets_restore_pending = false;
    }
}

void leave_menu_runtime() {
    gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);
}

extern "C" void GBS_MENU_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    menu_initialization_result = initialize_menu_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_MENU_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_menu_runtime(context);
}

extern "C" void GBS_MENU_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_menu_runtime(context);
}

extern "C" void GBS_MENU_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_menu_runtime();
}

extern "C" int GBS_MENU_RUNTIME_ENTRY() {
    menu_initialization_result = initialize_menu_runtime();
    if (menu_initialization_result != 0) {
        leave_menu_runtime();
        return menu_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::Menu,
            menu_state.screen_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_menu_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_menu_runtime();
            return -1;
        }
        render_menu_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_menu_runtime();
            return 0;
        }
    }
}
