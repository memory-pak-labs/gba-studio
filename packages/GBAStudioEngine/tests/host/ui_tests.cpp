#include <cassert>
#include <cstring>
#include "gbs/ui.hpp"

namespace {

char last_text_box_text[160] = {};
int last_text_box_visible = 0;
int last_text_box_x = 0;
int last_text_box_y = 0;
int last_text_box_width = 0;
int last_text_box_height = 0;
int draw_text_box_calls = 0;
int last_overlay_rect_visible = 0;
int last_overlay_rect_x = 0;
int last_overlay_rect_y = 0;
int last_overlay_rect_width = 0;
int last_overlay_rect_height = 0;
int hud_bar_calls = 0;
int hud_layout_begin_calls = 0;
int hud_layout_component_calls = 0;
int hud_layout_end_calls = 0;
int last_hud_layout_visible = 0;
int last_hud_layout_kind = 0;
int last_hud_layout_x = 0;
int last_hud_layout_y = 0;
int last_hud_layout_width = 0;
int last_hud_layout_height = 0;
int last_hud_layout_text_slot = -1;
int last_hud_layout_component_visible = 0;
const char* last_hud_layout_text = nullptr;
const gbs::MetaSprite* last_hud_layout_metasprite = nullptr;
int hud_tile_upload_calls = 0;

}

extern "C" void gbs_hw_draw_hud_bar(const char*, const char*, int) {
    ++hud_bar_calls;
}

extern "C" void gbs_hw_load_obj_tiles(const uint8_t*, uint32_t, uint32_t) { ++hud_tile_upload_calls; }

extern "C" void gbs_hw_begin_hud_layout(int visible) {
    ++hud_layout_begin_calls;
    last_hud_layout_visible = visible;
}

extern "C" void gbs_hw_draw_hud_layout_component(
    int kind,
    int x,
    int y,
    int width,
    int height,
    const char* text,
    int text_slot,
    const void* metasprite,
    int visible
) {
    ++hud_layout_component_calls;
    last_hud_layout_kind = kind;
    last_hud_layout_x = x;
    last_hud_layout_y = y;
    last_hud_layout_width = width;
    last_hud_layout_height = height;
    last_hud_layout_text = text;
    last_hud_layout_text_slot = text_slot;
    last_hud_layout_metasprite = static_cast<const gbs::MetaSprite*>(metasprite);
    last_hud_layout_component_visible = visible;
}

extern "C" void gbs_hw_end_hud_layout(void) {
    ++hud_layout_end_calls;
}

extern "C" void gbs_hw_invalidate_hud_layout(void) {
}

extern "C" void gbs_hw_draw_text_box(int x, int y, int width, int height, const char* text, int visible) {
    ++draw_text_box_calls;
    last_text_box_x = x;
    last_text_box_y = y;
    last_text_box_width = width;
    last_text_box_height = height;
    last_text_box_visible = visible;
    last_text_box_text[0] = '\0';
    if (text != nullptr) {
        std::strncpy(last_text_box_text, text, sizeof(last_text_box_text) - 1);
        last_text_box_text[sizeof(last_text_box_text) - 1] = '\0';
    }
}

extern "C" void gbs_hw_draw_overlay_rect(int x, int y, int width, int height, int visible) {
    last_overlay_rect_x = x;
    last_overlay_rect_y = y;
    last_overlay_rect_width = width;
    last_overlay_rect_height = height;
    last_overlay_rect_visible = visible;
}

namespace {

void test_hud_state() {
    gbs::HudState hud;
    gbs::init_hud(hud);
    assert(!hud.visible);

    gbs::set_hud_text(hud, "ROOM 1", "HP 3");
    assert(hud.visible);
    assert(hud.left_text[0] == 'R');
    assert(hud.right_text[0] == 'H');

    gbs::hide_hud(hud);
    assert(!hud.visible);
    assert(hud.left_text == nullptr);
}

void test_advanced_hud_layout_draws_components_and_preserves_fallback() {
    const gbs::HudLayoutComponent components[] = {
        { "market-frame", "frame", "Moldura", "", "hud_market.png", 0, 136, 240, 24, 0, true },
        { "market-status", "text", "Status", "HP 03", "", 8, 144, 64, 8, 1, true },
    };
    const gbs::HudLayout layouts[] = {
        { "hud-default", "standard", nullptr, 0 },
        { "hud-market", "advanced", components, 2 },
    };

    gbs::configure_hud_layouts(layouts, 2);
    assert(gbs::active_hud_layout() == nullptr);
    assert(gbs::configure_hud_layout("hud-market"));
    assert(gbs::active_hud_layout() == &layouts[1]);

    gbs::HudState hud;
    gbs::init_hud(hud);
    gbs::set_hud_text(hud, "ROOM 1", "HP 3");
    hud_layout_begin_calls = 0;
    hud_layout_component_calls = 0;
    hud_layout_end_calls = 0;
    gbs::draw_hud(hud);

    assert(hud_layout_begin_calls == 1);
    assert(last_hud_layout_visible == 1);
    assert(hud_layout_component_calls == 2);
    assert(last_hud_layout_kind == 1);
    assert(last_hud_layout_x == 8);
    assert(last_hud_layout_y == 144);
    assert(last_hud_layout_width == 64);
    assert(last_hud_layout_height == 8);
    assert(last_hud_layout_text != nullptr);
    assert(std::strcmp(last_hud_layout_text, "HP 03") == 0);
    assert(last_hud_layout_text_slot == 0);
    assert(last_hud_layout_component_visible == 1);
    assert(hud_layout_end_calls == 1);

    assert(gbs::configure_hud_layout(nullptr));
    hud_bar_calls = 0;
    gbs::draw_hud(hud);
    assert(hud_bar_calls == 1);
}

void test_advanced_hud_icon_passes_metasprite_to_hardware() {
    const gbs::MetaSpritePart icon_part { 0, 0, 12, 2, false, false, 16, 16 };
    const gbs::MetaSprite icon_metasprite { &icon_part, 1 };
    const gbs::HudLayoutComponent components[] = {
        { "market-sigil", "icon", "Nara", "", "hud_sigil", 8, 8, 16, 16, 1, true, &icon_metasprite },
    };
    const gbs::HudLayout layouts[] = {
        { "hud-market", "advanced", components, 1 },
    };

    gbs::configure_hud_layouts(layouts, 1);
    assert(gbs::configure_hud_layout("hud-market"));

    gbs::HudState hud;
    gbs::init_hud(hud);
    gbs::set_hud_text(hud, "ROOM 1", "HP 3");
    last_hud_layout_metasprite = nullptr;
    gbs::draw_hud(hud);

    assert(last_hud_layout_kind == 3);
    assert(last_hud_layout_metasprite == &icon_metasprite);
}

void test_advanced_hud_layout_accepts_multiple_text_slots() {
    const gbs::HudLayoutComponent components[] = {
        { "score", "text", "Score", "", "", 8, 8, 104, 8, 1, true },
        { "lives", "text", "Vidas", "", "", 120, 8, 64, 8, 1, true },
        { "wave", "text", "Onda", "", "", 184, 8, 48, 8, 1, true },
    };
    const gbs::HudLayout layouts[] = {
        { "hud-shmup", "advanced", components, 3 },
    };
    const char* text_slots[] = { "SCORE 0012", "VIDAS 03", "WAVE 02" };

    gbs::configure_hud_layouts(layouts, 1);
    assert(gbs::configure_hud_layout("hud-shmup"));

    gbs::HudState hud;
    gbs::init_hud(hud);
    gbs::set_hud_text_slots(hud, text_slots, 3);
    hud_layout_component_calls = 0;
    gbs::draw_hud(hud);

    assert(hud_layout_component_calls == 3);
    assert(last_hud_layout_text != nullptr);
    assert(std::strcmp(last_hud_layout_text, "WAVE 02") == 0);
    assert(last_hud_layout_text_slot == 21);
}

void test_advanced_hud_layout_allocates_oam_offsets_by_component_width() {
    const gbs::HudLayoutComponent components[] = {
        { "static", "text", "Statico", "MAPA", "", 8, 8, 32, 8, 1, true },
        { "dynamic", "text", "Dinamico", "", "", 8, 16, 64, 8, 1, true },
    };
    const gbs::HudLayout layouts[] = {
        { "hud-oam-offsets", "advanced", components, 2 },
    };
    const char* text_slots[] = { nullptr, "DESTINO" };

    gbs::configure_hud_layouts(layouts, 1);
    assert(gbs::configure_hud_layout("hud-oam-offsets"));

    gbs::HudState hud;
    gbs::init_hud(hud);
    gbs::set_hud_text_slots(hud, text_slots, 2);
    gbs::draw_hud(hud);

    // The first component occupies four 8px OAM text slots. The second
    // component must start after it, while retaining logical slot index 1.
    assert(last_hud_layout_text != nullptr);
    assert(std::strcmp(last_hud_layout_text, "DESTINO") == 0);
    assert(last_hud_layout_text_slot == 4);
}

void test_overlay_state_draws_screen_box() {
    gbs::OverlayState overlay;
    gbs::init_overlay(overlay);
    assert(!overlay.visible);

    gbs::show_overlay(overlay, 8, 104, 144, 32);
    assert(overlay.visible);
    assert(overlay.x == 8);
    assert(overlay.y == 104);
    assert(overlay.width == 144);
    assert(overlay.height == 32);

    draw_text_box_calls = 0;
    gbs::draw_overlay(overlay);
    assert(draw_text_box_calls == 0);
    assert(last_overlay_rect_visible == 1);
    assert(last_overlay_rect_x == 1);
    assert(last_overlay_rect_y == 13);
    assert(last_overlay_rect_width == 18);
    assert(last_overlay_rect_height == 4);

    gbs::hide_overlay(overlay);
    gbs::draw_overlay(overlay);
    assert(last_overlay_rect_visible == 0);
}

void test_overlay_moves_to_target_over_requested_frames() {
    gbs::OverlayState overlay;
    gbs::init_overlay(overlay);
    gbs::show_overlay(overlay, 0, 0, 160, 144);
    gbs::move_overlay(overlay, 0, 144, 3);

    assert(overlay.x == 0);
    assert(overlay.y == 0);
    assert(overlay.target_x == 0);
    assert(overlay.target_y == 144);
    assert(overlay.transition_frames == 3);

    gbs::tick_overlay(overlay);
    assert(overlay.y == 48);
    assert(overlay.transition_frames == 2);
    gbs::tick_overlay(overlay);
    assert(overlay.y == 96);
    assert(overlay.transition_frames == 1);
    gbs::tick_overlay(overlay);
    assert(overlay.y == 144);
    assert(overlay.transition_frames == 0);
}

void test_menu_show_selects_first_enabled_item() {
    const gbs::MenuItem items[] = {
        { "SAVE", 1, false },
        { "LOAD", 2, true },
        { "EXIT", 3, true }
    };
    gbs::MenuState menu;
    gbs::init_menu(menu);

    assert(gbs::show_menu(menu, "PAUSE", items, 3));
    assert(menu.visible);
    assert(menu.selected_index == 1);
}

void test_menu_navigation_wraps_and_skips_disabled_items() {
    const gbs::MenuItem items[] = {
        { "A", 1, true },
        { "B", 2, false },
        { "C", 3, true }
    };
    gbs::MenuState menu;
    gbs::init_menu(menu);
    assert(gbs::show_menu(menu, "MENU", items, 3));

    assert(gbs::advance_menu(menu, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }));
    assert(menu.selected_index == 2);
    assert(gbs::advance_menu(menu, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }));
    assert(menu.selected_index == 0);
    assert(gbs::advance_menu(menu, gbs::InputState { gbs::ButtonUp, gbs::ButtonUp, 0 }));
    assert(menu.selected_index == 2);
}

void test_menu_accept_and_cancel() {
    const gbs::MenuItem items[] = {
        { "CONTINUE", 10, true },
        { "QUIT", 20, true }
    };
    gbs::MenuState menu;
    gbs::init_menu(menu);
    assert(gbs::show_menu(menu, "PAUSE", items, 2));

    assert(gbs::advance_menu(menu, gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }));
    assert(gbs::advance_menu(menu, gbs::InputState { gbs::ButtonA, gbs::ButtonA, 0 }));
    assert(!menu.visible);
    assert(menu.accepted);
    assert(!menu.cancelled);
    assert(menu.last_index == 1);
    assert(menu.last_value == 20);

    assert(gbs::show_menu(menu, "PAUSE", items, 2));
    assert(gbs::advance_menu(menu, gbs::InputState { gbs::ButtonB, gbs::ButtonB, 0 }));
    assert(!menu.visible);
    assert(!menu.accepted);
    assert(menu.cancelled);
    assert(menu.last_index == -1);
}

void test_menu_paginates_and_jumps_with_shoulders() {
    const gbs::MenuItem items[] = {
        { "ITEM 1", 1, true },
        { "ITEM 2", 2, true },
        { "ITEM 3", 3, true },
        { "ITEM 4", 4, true },
        { "ITEM 5", 5, true },
        { "ITEM 6", 6, true }
    };
    gbs::MenuState menu;
    gbs::init_menu(menu);
    assert(gbs::show_menu(menu, "BAG", items, 6));

    assert(gbs::menu_first_visible_index(menu) == 0);
    assert(gbs::menu_visible_item_count(menu) == gbs::menu_max_visible_items);
    assert(!gbs::menu_has_previous_page(menu));
    assert(gbs::menu_has_next_page(menu));

    gbs::draw_menu(menu);
    assert(last_text_box_visible == 1);
    assert(std::strstr(last_text_box_text, "BAG v") != nullptr);
    assert(std::strstr(last_text_box_text, "ITEM 1") != nullptr);
    assert(std::strstr(last_text_box_text, "ITEM 5") == nullptr);

    assert(gbs::advance_menu(menu, gbs::InputState { gbs::ButtonR, gbs::ButtonR, 0 }));
    assert(menu.selected_index == 4);
    assert(gbs::menu_first_visible_index(menu) == 4);
    assert(gbs::menu_has_previous_page(menu));
    assert(!gbs::menu_has_next_page(menu));

    gbs::draw_menu(menu);
    assert(std::strstr(last_text_box_text, "BAG ^") != nullptr);
    assert(std::strstr(last_text_box_text, "ITEM 1") == nullptr);
    assert(std::strstr(last_text_box_text, "ITEM 5") != nullptr);

    assert(gbs::advance_menu(menu, gbs::InputState { gbs::ButtonL, gbs::ButtonL, 0 }));
    assert(menu.selected_index == 0);
}

void test_menu_rejects_empty_or_disabled_items() {
    const gbs::MenuItem disabled[] = {
        { "NOPE", 1, false }
    };
    gbs::MenuState menu;
    gbs::init_menu(menu);

    assert(!gbs::show_menu(menu, "EMPTY", nullptr, 0));
    assert(!gbs::show_menu(menu, "DISABLED", disabled, 1));
    assert(!menu.visible);
}

} // namespace

void test_hud_behavior_drives_text_and_visibility_without_remapping_slots() {
    const gbs::HudVariableAction action[] = {{false, 1, 7}};
    const gbs::HudElementEvent events[] = {{gbs::HudElementTrigger::Confirm, -1, action, 1}};
    const gbs::HudLayoutComponent components[] = {
        { "first", "text", "First", "NORMAL", "", 8, 8, 64, 8, 1, true, nullptr, {{0, 1, "FOCO"}, {}, {0, 2, nullptr}, events, 1} },
        { "second", "text", "Second", "", "", 8, 16, 64, 8, 1, true },
    };
    const gbs::HudLayout layouts[] = {{"behavior", "advanced", components, 2}};
    gbs::configure_hud_layouts(layouts, 1);
    assert(gbs::configure_hud_layout("behavior"));
    gbs::EventState event_state {};
    event_state.variables[0] = 1;
    event_state.input_pressed = 1;
    gbs::update_hud_behavior(event_state, true);
    assert(event_state.variables[1] == 7);
    gbs::HudState hud {};
    gbs::init_hud(hud);
    const char* slots[] = {nullptr, "SECOND"};
    gbs::set_hud_text_slots(hud, slots, 2);
    event_state.variables[0] = 2;
    gbs::update_hud_behavior(event_state, true);
    hud_layout_component_calls = 0;
    gbs::draw_hud(hud);
    assert(hud_layout_component_calls == 2);
    assert(std::strcmp(last_hud_layout_text, "SECOND") == 0);
    assert(last_hud_layout_text_slot == 8);
    assert(last_hud_layout_component_visible == 1);
}

void test_named_hud_values_survive_reordering_and_round_images() {
    gbs::HudLayoutComponent component {"timer","text","Tempo","99","",112,8,16,8,2,true};
    component.value_source = gbs::HudValueSource::RoundTime;
    gbs::HudLayout layout {"bound","advanced",&component,1};
    gbs::configure_hud_layouts(&layout,1); assert(gbs::configure_hud_layout("bound"));
    gbs::HudState hud {}; gbs::init_hud(hud); gbs::set_hud_text(hud,"OLD","SLOT");
    gbs::set_hud_value(hud,gbs::HudValueSource::RoundTime,9);
    gbs::draw_hud(hud); assert(std::strcmp(last_hud_layout_text,"09")==0);
    gbs::set_hud_value(hud,gbs::HudValueSource::RoundTime,0);
    gbs::draw_hud(hud); assert(std::strcmp(last_hud_layout_text,"00")==0);
    gbs::MetaSprite empty {}, one {}, two {};
    component.kind="icon"; component.metasprite=&empty; component.state_assets[0]=&one; component.state_assets[1]=&two;
    component.value_source=gbs::HudValueSource::P1Rounds;
    gbs::set_hud_value(hud,gbs::HudValueSource::P1Rounds,1);
    gbs::draw_hud(hud); assert(last_hud_layout_metasprite==&one);
    gbs::set_hud_value(hud,gbs::HudValueSource::P1Rounds,2);
    gbs::draw_hud(hud); assert(last_hud_layout_metasprite==&two);
    gbs::init_hud(hud); gbs::set_hud_text(hud,""," ");
    gbs::draw_hud(hud); assert(!last_hud_layout_component_visible);
}

void test_hud_gauge_updates_only_when_value_or_layout_changes() {
    uint8_t full_pixels[32] {}, empty_pixels[32] {};
    gbs::TileAsset full {}, empty {};
    full.data = full_pixels; empty.data = empty_pixels;
    full.object_tiles = empty.object_tiles = true;
    full.tile_count = empty.tile_count = 1;
    const gbs::MetaSpritePart part {0,0,0,0,false,false,8,8};
    const gbs::MetaSprite image {&part,1};
    gbs::HudLayoutComponent component {"life","bar","Vida","","",0,0,8,8,0,true,&image};
    component.value_source = gbs::HudValueSource::P1Health;
    component.gauge = {&full,&empty,0,0,8,8,false};
    gbs::HudLayout layout {"life","advanced",&component,1};
    gbs::configure_hud_layouts(&layout,1); assert(gbs::configure_hud_layout("life"));
    gbs::HudState hud {}; gbs::init_hud(hud); gbs::set_hud_text(hud,"","");
    gbs::set_hud_value(hud,gbs::HudValueSource::P1Health,50,100);
    hud_tile_upload_calls = 0;
    gbs::draw_hud(hud); gbs::draw_hud(hud);
    assert(hud_tile_upload_calls == 1);
    gbs::set_hud_value(hud,gbs::HudValueSource::P1Health,49,100); gbs::draw_hud(hud);
    assert(hud_tile_upload_calls == 2);
    gbs::set_hud_value(hud,gbs::HudValueSource::P1Health,49,200); gbs::draw_hud(hud);
    assert(hud_tile_upload_calls == 3);
    assert(gbs::configure_hud_layout("life")); gbs::draw_hud(hud);
    assert(hud_tile_upload_calls == 4);
}

int main() {
    test_hud_gauge_updates_only_when_value_or_layout_changes();
    test_named_hud_values_survive_reordering_and_round_images();
    test_hud_behavior_drives_text_and_visibility_without_remapping_slots();
    test_hud_state();
    test_advanced_hud_layout_draws_components_and_preserves_fallback();
    test_advanced_hud_icon_passes_metasprite_to_hardware();
    test_advanced_hud_layout_accepts_multiple_text_slots();
    test_advanced_hud_layout_allocates_oam_offsets_by_component_width();
    test_overlay_state_draws_screen_box();
    test_overlay_moves_to_target_over_requested_frames();
    test_menu_show_selects_first_enabled_item();
    test_menu_navigation_wraps_and_skips_disabled_items();
    test_menu_accept_and_cancel();
    test_menu_paginates_and_jumps_with_shoulders();
    test_menu_rejects_empty_or_disabled_items();
    return 0;
}
