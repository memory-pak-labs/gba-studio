#include <cassert>
#include "gbs/menu.hpp"

namespace {

constexpr gbs::DialogueLine lines[] = {
    { "Main Menu" },
    { "Start" },
    { "Options" },
};

constexpr gbs::EventCommand start_commands[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 },
};

constexpr gbs::MenuItemData main_items[] = {
    { "Start", 1, { start_commands, 1 }, -1, true },
    { "Options", 2, gbs::empty_event_script(), 1, true },
};

constexpr gbs::MenuItemData options_items[] = {
    { "Back", 1, gbs::empty_event_script(), 0, true },
};

constexpr gbs::MenuItemData advanced_items[] = {
    {
        "Continue",
        1,
        gbs::empty_event_script(),
        -1,
        true,
        gbs::MenuItemAction::Select,
        gbs::MenuItemConditionData { 0, 1, true },
        gbs::menu_item_no_value()
    },
    {
        "Sound",
        2,
        gbs::empty_event_script(),
        -1,
        true,
        gbs::MenuItemAction::ToggleVariable,
        gbs::menu_item_always_available(),
        gbs::MenuItemValueData { 1, 0, 1, 1 }
    },
    {
        "Volume",
        2,
        gbs::empty_event_script(),
        -1,
        true,
        gbs::MenuItemAction::AdjustVariable,
        gbs::menu_item_always_available(),
        gbs::MenuItemValueData { 2, 0, 10, 2 }
    },
    {
        "Back",
        1,
        gbs::empty_event_script(),
        -1,
        true,
        gbs::MenuItemAction::PopScreen,
        gbs::menu_item_always_available(),
        gbs::menu_item_no_value()
    },
};

constexpr gbs::MenuItemData inventory_binding_item {
    "Modules",
    -1,
    gbs::empty_event_script(),
    -1,
    true,
    gbs::MenuItemAction::Select,
    gbs::menu_item_always_available(),
    gbs::menu_item_no_value(),
    gbs::menu_default_click_box(),
    1,
    false,
    -1,
    { gbs::MenuItemBindingSource::Inventory, 2, gbs::MenuItemBindingFormat::Count }
};

constexpr gbs::MenuScreenData screens[] = {
    { "main", -1, 0, main_items, 2, gbs::empty_event_script(), gbs::empty_event_script(), "main_group" },
    { "options", -1, 2, options_items, 1, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
};

constexpr gbs::ResourceBank banks[] = {
    { gbs::ResourcePoolKind::BgTiles, 0, 4, 1, "menu_bank" },
};
constexpr gbs::ResourceBankGroup groups[] = {
    { "main_group", banks, 1 },
};

constexpr gbs::EventState menu_condition_state(int variable_0) {
    gbs::EventState state {};
    state.variables[0] = variable_0;
    state.variables[1] = 1;
    state.variables[2] = 4;
    return state;
}

constexpr gbs::EventState locked_state = menu_condition_state(0);
constexpr gbs::EventState unlocked_state = menu_condition_state(1);
constexpr gbs::EventState save_state = [] {
    gbs::EventState state = menu_condition_state(1);
    state.save_slot_exists[0] = true;
    return state;
}();
constexpr gbs::EventState binding_state = [] {
    gbs::EventState state = menu_condition_state(1);
    state.inventory[2] = 7;
    return state;
}();

constexpr gbs::MenuItemData continue_requires_save {
    "Continue",
    -1,
    gbs::empty_event_script(),
    -1,
    true,
    gbs::MenuItemAction::Select,
    gbs::menu_item_always_available(),
    gbs::menu_item_no_value(),
    gbs::menu_default_click_box(),
    1,
    true
};

constexpr gbs::MenuProjectData project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    screens,
    2,
    0,
    lines,
    3,
    nullptr,
    0,
    banks,
    1,
    groups,
    1
};

static_assert(gbs::is_valid_menu_project_data(project), "menu project should be valid");
static_assert(gbs::menu_next_enabled_item_index(screens[0], 0, 1) == 1, "down moves to options");
static_assert(gbs::menu_next_enabled_item_index(screens[0], 1, 1) == 0, "down wraps");
static_assert(gbs::menu_runtime_from_project(project).screen_index == 0, "runtime starts at initial screen");
static_assert(!gbs::menu_item_is_visible(locked_state, advanced_items[0]), "hidden locked item is invisible");
static_assert(gbs::menu_item_is_visible(unlocked_state, advanced_items[0]), "unlocked item is visible");
static_assert(gbs::menu_item_is_available(unlocked_state, advanced_items[0]), "unlocked item is available");
static_assert(!gbs::menu_item_is_available(unlocked_state, continue_requires_save), "continue is unavailable without a save");
static_assert(gbs::menu_item_is_available(save_state, continue_requires_save), "continue is available when a save exists");
static_assert(gbs::menu_next_visible_item_index({ "advanced", -1, 0, advanced_items, 4, gbs::empty_event_script(), gbs::empty_event_script(), nullptr }, locked_state, 0, 1) == 1, "hidden item is skipped");
static_assert(gbs::menu_toggled_variable_value(advanced_items[1], 1) == 0, "toggle flips max to min");
static_assert(gbs::menu_adjusted_variable_value(advanced_items[2], 9, 1) == 10, "adjust clamps at max");
static_assert(gbs::menu_adjusted_variable_value(advanced_items[2], 1, -1) == 0, "adjust clamps at min");
static_assert(gbs::is_valid_menu_item_binding(inventory_binding_item.binding), "inventory binding is valid");
static_assert(gbs::menu_item_binding_value(binding_state, inventory_binding_item) == 7, "inventory binding reads event state");
static_assert(gbs::menu_screen_name(project, 0)[0] == 'm', "menu screen name is exposed");
static_assert(gbs::menu_screen_name(project, 99) == nullptr, "invalid menu screen has no name");
static_assert(gbs::menu_stack_depth(gbs::menu_runtime_from_project(project)) == 0, "fresh runtime has empty stack");

constexpr gbs::MenuClickBox title_click_box { 72, 104, 96, 24 };
static_assert(gbs::is_valid_menu_click_box(title_click_box), "title click box should fit the GBA viewport");
static_assert(!gbs::is_valid_menu_click_box({ 230, 150, 20, 20 }), "click box outside viewport must fail");

constexpr gbs::MenuItemData spatial_items[] = {
    { "Top left", -1, gbs::empty_event_script(), -1, true, gbs::MenuItemAction::Select, gbs::menu_item_always_available(), gbs::menu_item_no_value(), { 16, 16, 64, 24 } },
    { "Top right", -1, gbs::empty_event_script(), -1, true, gbs::MenuItemAction::Select, gbs::menu_item_always_available(), gbs::menu_item_no_value(), { 152, 16, 64, 24 } },
    { "Bottom left", -1, gbs::empty_event_script(), -1, true, gbs::MenuItemAction::Select, gbs::menu_item_always_available(), gbs::menu_item_no_value(), { 16, 104, 64, 24 } },
    { "Bottom right", -1, gbs::empty_event_script(), -1, true, gbs::MenuItemAction::Select, gbs::menu_item_always_available(), gbs::menu_item_no_value(), { 152, 104, 64, 24 } },
};
constexpr gbs::MenuScreenData spatial_screen {
    "spatial", -1, -1, spatial_items, 4, gbs::empty_event_script(), gbs::empty_event_script(), nullptr
};
static_assert(gbs::menu_directional_item_index(spatial_screen, unlocked_state, 0, 1, 0) == 1, "right follows click-box geometry");
static_assert(gbs::menu_directional_item_index(spatial_screen, unlocked_state, 0, 0, 1) == 2, "down follows click-box geometry");
static_assert(gbs::menu_directional_item_index(spatial_screen, unlocked_state, 3, -1, 0) == 2, "left follows click-box geometry");
static_assert(gbs::menu_directional_item_index(spatial_screen, unlocked_state, 3, 0, -1) == 1, "up follows click-box geometry");

constexpr gbs::MenuItemData carousel_items[] = {
    { "Novo jogo", -1, gbs::empty_event_script(), -1, true },
    { "Carregar jogo", -1, gbs::empty_event_script(), -1, true, gbs::MenuItemAction::Select,
      gbs::menu_item_always_available(), gbs::menu_item_no_value(), gbs::menu_default_click_box(), 1, true },
    { "Idioma", -1, gbs::empty_event_script(), -1, true },
    { "Configuracoes", -1, gbs::empty_event_script(), -1, true },
    { "Creditos", -1, gbs::empty_event_script(), -1, true }
};
constexpr gbs::MenuScreenData carousel_screen = [] {
    gbs::MenuScreenData screen { "title_options", -1, -1, carousel_items, 5,
        gbs::empty_event_script(), gbs::empty_event_script(), nullptr };
    screen.carousel = true;
    return screen;
}();
static_assert(gbs::menu_carousel_item_index(carousel_screen, locked_state, 0, 1) == 1,
    "carousel keeps disabled load option visible");
static_assert(gbs::menu_carousel_item_index(carousel_screen, locked_state, 4, 1) == 0,
    "carousel wraps right to first option");
static_assert(gbs::menu_carousel_item_index(carousel_screen, locked_state, 0, -1) == 4,
    "carousel wraps left to last option");

constexpr gbs::MenuScreenData logo_screen {
    "logo",
    -1,
    -1,
    nullptr,
    0,
    gbs::empty_event_script(),
    gbs::empty_event_script(),
    nullptr,
    gbs::MenuScreenType::Logo,
    "Studio",
    150,
    true,
    0
};
static_assert(gbs::menu_screen_can_be_empty(logo_screen), "logo screens may omit selectable items");
static_assert(gbs::menu_screen_should_advance(logo_screen, 150, false), "logo advances after its timeout");
static_assert(gbs::menu_screen_should_advance(logo_screen, 1, true), "skippable logo advances on input");
static_assert(gbs::menu_title_fade_alpha({ "title", -1, -1, nullptr, 0, gbs::empty_event_script(), gbs::empty_event_script(), nullptr, gbs::MenuScreenType::Title, nullptr, 0, false, -1, 1, 24 }, 0) == 1, "title fade starts nearly transparent");
static_assert(gbs::menu_title_fade_alpha({ "title", -1, -1, nullptr, 0, gbs::empty_event_script(), gbs::empty_event_script(), nullptr, gbs::MenuScreenType::Title, nullptr, 0, false, -1, 1, 24 }, 12) == 8, "title fade reaches half alpha");
static_assert(gbs::menu_title_fade_alpha({ "title", -1, -1, nullptr, 0, gbs::empty_event_script(), gbs::empty_event_script(), nullptr, gbs::MenuScreenType::Title, nullptr, 0, false, -1, 1, 24 }, 24) == 16, "title fade finishes opaque");

constexpr int title_background_animation_frames[] = { 3, 4, 5 };
constexpr gbs::MenuScreenData animated_title_screen {
    "animated_title",
    3,
    -1,
    main_items,
    1,
    gbs::empty_event_script(),
    gbs::empty_event_script(),
    nullptr,
    gbs::MenuScreenType::Title,
    "Title",
    0,
    false,
    -1,
    -1,
    0,
    gbs::empty_event_script(),
    nullptr,
    0,
    gbs::menu_no_text_input(),
    title_background_animation_frames,
    3,
    18,
    true
};
static_assert(gbs::menu_screen_background_index(
    animated_title_screen,
    0
) == 3, "background animation starts at its first frame");
static_assert(gbs::menu_screen_background_index(
    animated_title_screen,
    18
) == 4, "background animation advances after its frame duration");
static_assert(gbs::menu_screen_background_index(
    animated_title_screen,
    54
) == 3, "background animation loops deterministically");

constexpr gbs::MetaSpritePart title_actor_part { 0, 0, 0, 0, false, false, 8, 8 };
constexpr gbs::MetaSprite title_actor_metasprite { &title_actor_part, 1 };
constexpr gbs::MenuActorData title_actors[] = {
    { "title actor", &title_actor_metasprite, gbs::Vec2i { 80, 104 } }
};
constexpr gbs::MenuActorData animated_title_actor {
    "animated title actor",
    &title_actor_metasprite,
    gbs::Vec2i { 72, 24 },
    gbs::MenuActorEntryAnimation::SlideDown,
    40,
    24
};
constexpr gbs::MenuActorData option_actor {
    "NOVO JOGO",
    &title_actor_metasprite,
    gbs::Vec2i { 48, 40 },
    gbs::MenuActorEntryAnimation::None,
    0,
    0,
    gbs::MenuActorRole::Option,
    0,
    nullptr
};
constexpr gbs::MetaSpritePart selected_option_actor_part { 1, 1, 0, 0, false, false, 8, 8 };
constexpr gbs::MetaSprite selected_option_actor_metasprite { &selected_option_actor_part, 1 };
constexpr gbs::MenuActorData selected_option_actor {
    "NOVO JOGO",
    &title_actor_metasprite,
    gbs::Vec2i { 48, 40 },
    gbs::MenuActorEntryAnimation::None,
    0,
    0,
    gbs::MenuActorRole::Option,
    0,
    nullptr,
    nullptr,
    nullptr,
    -1,
    -1,
    &selected_option_actor_metasprite
};
constexpr gbs::EventCommand menu_actor_init_commands[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 }
};
constexpr gbs::EventCommand menu_actor_interact_commands[] = {
    { gbs::EventOp::SetVariable, 1, 1, 0 }
};
constexpr gbs::EventCommand menu_actor_update_commands[] = {
    { gbs::EventOp::SetVariable, 2, 1, 0 }
};
constexpr gbs::MenuActorData lifecycle_option_actor {
    "NOVO JOGO",
    &title_actor_metasprite,
    gbs::Vec2i { 48, 40 },
    gbs::MenuActorEntryAnimation::None,
    0,
    0,
    gbs::MenuActorRole::Option,
    0,
    nullptr,
    nullptr,
    nullptr,
    -1,
    -1,
    nullptr,
    gbs::EventScript { menu_actor_init_commands, 1 },
    gbs::EventScript { menu_actor_interact_commands, 1 },
    gbs::EventScript { menu_actor_update_commands, 1 }
};
constexpr gbs::MenuActorData cursor_actor {
    "cursor",
    &title_actor_metasprite,
    gbs::Vec2i { 32, 40 },
    gbs::MenuActorEntryAnimation::None,
    0,
    0,
    gbs::MenuActorRole::Cursor,
    -1,
    "initial"
};
constexpr gbs::MenuItemData title_actor_items[] = {
    { "Start", -1, gbs::empty_event_script(), -1, true }
};
constexpr gbs::MenuScreenData title_actor_screen {
    "title_actor",
    -1,
    -1,
    title_actor_items,
    1,
    gbs::empty_event_script(),
    gbs::empty_event_script(),
    nullptr,
    gbs::MenuScreenType::Title,
    nullptr,
    0,
    false,
    -1,
    -1,
    0,
    gbs::empty_event_script(),
    title_actors,
    1
};
constexpr gbs::MenuScreenData title_actor_screens[] = { title_actor_screen };
constexpr gbs::MenuScreenData logo_project_screens[] = { logo_screen, screens[0] };
constexpr gbs::MenuProjectData logo_project = {
    nullptr, 0, nullptr, 0, nullptr, 0,
    logo_project_screens, 2, 0,
    lines, 3
};
static_assert(gbs::is_valid_menu_project_data(logo_project), "a project may start with an empty logo screen");
constexpr gbs::MenuProjectData title_actor_project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    title_actor_screens,
    1,
    0,
    nullptr,
    0
};
static_assert(gbs::is_valid_menu_actor(title_actors[0]), "menu actors expose a valid metasprite");
static_assert(title_actor_screens[0].actor_count == 1 && title_actor_screens[0].actors[0].position_pixels.x == 80, "menu actor position is preserved");
static_assert(gbs::menu_actor_position_at(animated_title_actor, 0).y == -16, "slide-down actors start above the screen");
static_assert(gbs::menu_actor_position_at(animated_title_actor, 12).y == 4, "slide-down actors interpolate halfway");
static_assert(gbs::menu_actor_position_at(animated_title_actor, 24).y == 24, "slide-down actors settle at their authored position");
static_assert(gbs::is_valid_menu_project_data(title_actor_project), "menu project accepts screen actors");
static_assert(option_actor.role == gbs::MenuActorRole::Option && option_actor.menu_item_index == 0, "menu option actor keeps its item binding");
static_assert(gbs::menu_actor_metasprite_at(selected_option_actor, 0) == &selected_option_actor_metasprite, "selected menu option uses its selected metasprite");
static_assert(gbs::menu_actor_metasprite_at(selected_option_actor, 1) == &title_actor_metasprite, "unselected menu option keeps its base metasprite");
static_assert(cursor_actor.role == gbs::MenuActorRole::Cursor && cursor_actor.cursor_for_menu[0] == 'i', "menu cursor actor keeps its menu binding");
constexpr gbs::MenuActorData horizontal_cursor = [] {
    auto actor = cursor_actor;
    actor.cursor_follows_option = true;
    actor.cursor_offset_pixels = {0, -1};
    return actor;
}();
constexpr gbs::MenuActorData horizontal_options[] = {
    [] {auto actor = option_actor; actor.menu_item_index = 0; actor.position_pixels = {58, 48}; return actor;}(),
    [] {auto actor = option_actor; actor.menu_item_index = 1; actor.position_pixels = {120, 48}; return actor;}()
};
constexpr gbs::MenuScreenData horizontal_screen = [] {auto screen = title_actor_screen; screen.actors = horizontal_options; screen.actor_count = 2; return screen;}();
static_assert(gbs::menu_cursor_position_at(horizontal_screen, 0, horizontal_cursor, 0).x == 58, "single player frame selects the left portrait");
static_assert(gbs::menu_cursor_position_at(horizontal_screen, 1, horizontal_cursor, 0).x == 120, "same player frame moves to the right portrait");
static_assert(gbs::menu_cursor_position_at(horizontal_screen, 1, horizontal_cursor, 0).y == 47, "player frame preserves its authored offset");
static_assert(gbs::menu_cursor_position_at(horizontal_screen, 1, cursor_actor, 0).x == 32, "legacy cursors keep their authored horizontal position");
static_assert(gbs::is_valid_menu_actor(lifecycle_option_actor), "menu actor lifecycle keeps a valid visual actor");
static_assert(gbs::has_event_script(lifecycle_option_actor.on_init), "menu actor exposes an on-init event script");
static_assert(gbs::has_event_script(lifecycle_option_actor.on_interact), "menu actor exposes an on-interact event script");
static_assert(gbs::has_event_script(lifecycle_option_actor.on_update), "menu actor exposes an on-update event script");

constexpr gbs::EventCommand text_input_commands[] = {
    { gbs::EventOp::OpenTextInput, 0, 8, 0 }
};
constexpr gbs::MenuItemData text_input_items[] = {
    { "Name", -1, { text_input_commands, 1 }, -1, true }
};
constexpr gbs::MenuTextInputKeyboardData name_keyboard {
    gbs::MenuTextInputKeyboardLayout::Grid,
    4,
    8,
    22,
    6,
    true
};
constexpr gbs::MenuTextInputKeyboardData name_side_keyboard {
    gbs::MenuTextInputKeyboardLayout::Grid,
    1,
    8,
    24,
    6,
    true,
    gbs::MenuTextInputKeyboardControlLayout::Side,
    25,
    8,
    5,
    6
};
constexpr gbs::MenuTextInputKeyboardData name_background_keyboard {
    gbs::MenuTextInputKeyboardLayout::Grid,
    3,
    11,
    22,
    6,
    true,
    gbs::MenuTextInputKeyboardControlLayout::Side,
    25,
    11,
    5,
    6,
    gbs::MenuTextInputKeyboardSurface::Background
};
constexpr gbs::MenuTextInputData name_input { 0, 8, 12, 6, 8, name_keyboard };
constexpr gbs::MenuScreenData text_input_screen {
    "new_game",
    -1,
    -1,
    text_input_items,
    1,
    gbs::empty_event_script(),
    gbs::empty_event_script(),
    nullptr,
    gbs::MenuScreenType::Menu,
    "Novo Jogo",
    0,
    false,
    -1,
    -1,
    0,
    gbs::empty_event_script(),
    nullptr,
    0,
    name_input
};
constexpr gbs::MenuProjectData text_input_project {
    nullptr, 0, nullptr, 0, nullptr, 0,
    &text_input_screen, 1, 0, nullptr, 0
};
static_assert(gbs::is_valid_menu_text_input(name_input), "text input keeps its bounded viewport contract");
static_assert(gbs::is_valid_menu_text_input_keyboard(name_keyboard), "text input keyboard keeps its bounded grid contract");
static_assert(gbs::is_valid_menu_text_input_keyboard(name_side_keyboard), "side controls keep the keyboard inside the viewport");
static_assert(gbs::is_valid_menu_text_input_keyboard(name_background_keyboard), "background keyboard keeps its static keycaps contract");
static_assert(gbs::is_valid_menu_project_data(text_input_project), "menu project accepts actorized text input");
static_assert(!gbs::is_valid_menu_text_input({ 0, 17, 12, 6, 17 }), "text input rejects buffers above the runtime capacity");
static_assert(!gbs::is_valid_menu_text_input_keyboard({ gbs::MenuTextInputKeyboardLayout::Grid, 12, 16, 8, 4, false }), "text input keyboard rejects a grid that cannot fit its controls");
static_assert(gbs::menu_item_opens_text_input(text_input_items[0], 0), "text input item keeps its variable binding");
static_assert(!gbs::menu_item_opens_text_input(text_input_items[0], 1), "text input item rejects unrelated variables");

constexpr gbs::MenuItemData text_input_actor_items[] = {
    { "Name", -1, { text_input_commands, 1 }, -1, true },
    { "Option", -1, gbs::empty_event_script(), -1, true }
};
constexpr gbs::MenuActorData text_input_cursor_actor {
    "cursor",
    &title_actor_metasprite,
    gbs::Vec2i { 32, 72 },
    gbs::MenuActorEntryAnimation::None,
    0,
    0,
    gbs::MenuActorRole::Cursor,
    -1,
    "new_game"
};
constexpr gbs::MenuActorData text_input_option_actor {
    "Option",
    &title_actor_metasprite,
    gbs::Vec2i { 64, 72 },
    gbs::MenuActorEntryAnimation::None,
    0,
    0,
    gbs::MenuActorRole::Option,
    1
};
constexpr gbs::MenuActorData text_input_actor_actors[] = {
    text_input_cursor_actor,
    text_input_option_actor
};
constexpr gbs::MenuScreenData text_input_actor_screen {
    "new_game_actorized",
    -1,
    -1,
    text_input_actor_items,
    2,
    gbs::empty_event_script(),
    gbs::empty_event_script(),
    nullptr,
    gbs::MenuScreenType::Menu,
    "Novo Jogo",
    0,
    false,
    -1,
    -1,
    0,
    gbs::empty_event_script(),
    text_input_actor_actors,
    2,
    name_input
};
static_assert(gbs::menu_cursor_position_at(text_input_actor_screen, 0, text_input_cursor_actor, 0).y == 48, "cursor follows the text input row");
static_assert(gbs::menu_cursor_position_at(text_input_actor_screen, 1, text_input_cursor_actor, 0).y == 72, "cursor follows option actors outside text input");

void test_menu_save_roundtrips_text_variables() {
    gbs::MenuRuntimeState menu_state = gbs::menu_runtime_from_project(text_input_project);
    gbs::EventState event_state {};
    event_state.text_variables[0][0] = 'N';
    event_state.text_variables[0][1] = 'A';
    event_state.text_variables[0][2] = 'R';
    event_state.text_variables[0][3] = 'A';

    gbs::MenuSaveData save_data {};
    gbs::capture_menu_save_data(save_data, menu_state, event_state);
    event_state.text_variables[0][0] = '\0';
    assert(gbs::apply_menu_save_data(text_input_project, save_data, menu_state, event_state));
    assert(event_state.text_variables[0][0] == 'N');
    assert(event_state.text_variables[0][3] == 'A');
}

constexpr gbs::MenuItemData invalid_item[] = {
    { "Broken", 99, gbs::empty_event_script(), -1, true },
};
constexpr gbs::MenuScreenData invalid_screens[] = {
    { "invalid", -1, 0, invalid_item, 1, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
};
constexpr gbs::MenuProjectData invalid_project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    invalid_screens,
    1,
    0,
    lines,
    3,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0
};

static_assert(!gbs::is_valid_menu_project_data(invalid_project), "invalid line index must fail");

} // namespace

int main() {
    static_assert(gbs::menu_name_field_padding_cells("Nara", 8) == 2);
    static_assert(gbs::menu_name_field_padding_cells("MATHEUSX", 8) == 0);
    static_assert(gbs::menu_name_field_padding_cells("João", 8) == 2);
    static_assert(gbs::menu_name_field_padding_cells(nullptr, 8) == 4);
    {
        gbs::MenuRuntimeState state {};
        state.screen_index = 4;
        state.selected_item_index = 3;
        assert(gbs::menu_push_screen(state, 7));
        assert(gbs::menu_pop_screen(state));
        assert(state.screen_index == 4 && state.selected_item_index == 3);
        gbs::EventState events {};
        events.save_slot_exists[0] = true;
        gbs::MenuItemData load {};
        load.enabled = true;
        load.requires_save = true;
        load.save_slot = 2;
        assert(!gbs::menu_item_is_available(events, load));
        events.save_slot_exists[2] = true;
        assert(gbs::menu_item_is_available(events, load));
    }

    test_menu_save_roundtrips_text_variables();
    if (!gbs::is_valid_menu_project_data(project)) {
        return 1;
    }
    const gbs::MenuScreenData* main_screen = gbs::menu_screen_for(project, 0);
    if (main_screen == nullptr || gbs::menu_item_for(*main_screen, 1)->target_screen_index != 1) {
        return 2;
    }
    if (gbs::find_menu_screen_resource_bank_group_index(project, *main_screen) != 0) {
        return 3;
    }
    gbs::MenuRuntimeState state = gbs::menu_runtime_from_project(project);
    if (!gbs::menu_focus_item(project, unlocked_state, state, 1) || state.selected_item_index != 1 ||
        gbs::menu_focus_item(project, unlocked_state, state, 99) || state.selected_item_index != 1) {
        return 41;
    }
    if (!gbs::menu_push_screen(state, 1) || state.screen_index != 1 || state.screen_stack_count != 1) {
        return 4;
    }
    if (!gbs::menu_pop_screen(state) || state.screen_index != 0 || state.screen_stack_count != 0) {
        return 5;
    }
    gbs::EventState event_state {};
    event_state.variables[0] = 1;
    event_state.variables[1] = 0;
    event_state.variables[gbs::event_variable_count - 1] = 908;
    state.screen_index = 1;
    state.selected_item_index = 0;
    state.screen_stack_count = 1;
    state.screen_stack[0] = 0;

    gbs::MenuSaveData save_data {};
    gbs::capture_menu_save_data(save_data, state, event_state, 240, 3);
    if (!gbs::is_valid_menu_save_data(project, save_data) ||
        save_data.screen_index != 1 ||
        save_data.selected_item_index != 0 ||
        save_data.screen_stack_count != 1 ||
        save_data.variables[0] != 1 ||
        save_data.variables[gbs::event_variable_count - 1] != 908 ||
        save_data.play_time_frames != 240 ||
        save_data.flags != 3) {
        return 6;
    }

    gbs::MenuRuntimeState restored = gbs::menu_runtime_from_project(project);
    gbs::EventState restored_events {};
    if (!gbs::apply_menu_save_data(project, save_data, restored, restored_events) ||
        restored.screen_index != 1 ||
        restored.selected_item_index != 0 ||
        restored.screen_stack_count != 1 ||
        restored.screen_stack[0] != 0 ||
        restored_events.variables[0] != 1 ||
        restored_events.variables[gbs::event_variable_count - 1] != 908) {
        return 7;
    }

    save_data.screen_index = 99;
    if (gbs::is_valid_menu_save_data(project, save_data) ||
        gbs::apply_menu_save_data(project, save_data, restored, restored_events)) {
        return 8;
    }
    return 0;
}
