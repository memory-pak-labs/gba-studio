#include "gbs/ui.hpp"
#include "gbs_hw.h"

#if defined(__arm__) || defined(__thumb__)
#define GBS_UI_EWRAM __attribute__((section(".ewram_bss")))
#else
#define GBS_UI_EWRAM
#endif

namespace {

const gbs::HudLayout* configured_hud_layouts = nullptr;
size_t configured_hud_layout_count = 0;
const gbs::HudLayout* selected_hud_layout = nullptr;
gbs::HudElementMemory hud_element_memory[64] {};
uint8_t hud_gauge_buffers[2][1536] GBS_UI_EWRAM {};
struct HudGaugeCache {
    const gbs::HudLayoutComponent* component = nullptr;
    uint32_t value = 0, maximum = 0;
};
HudGaugeCache hud_gauge_cache[2] {};
char hud_value_text[64][9] GBS_UI_EWRAM {};

bool string_equals(const char* left, const char* right) {
    if (left == nullptr || right == nullptr) {
        return left == right;
    }
    while (*left != '\0' && *right != '\0' && *left == *right) {
        ++left;
        ++right;
    }
    return *left == '\0' && *right == '\0';
}

int hud_component_kind(const char* kind) {
    if (string_equals(kind, "frame")) return GBS_HW_HUD_COMPONENT_FRAME;
    if (string_equals(kind, "text")) return GBS_HW_HUD_COMPONENT_TEXT;
    if (string_equals(kind, "bar")) return GBS_HW_HUD_COMPONENT_BAR;
    if (string_equals(kind, "icon")) return GBS_HW_HUD_COMPONENT_ICON;
    return -1;
}

int clamp_selection(const gbs::MenuItem* items, size_t item_count, int desired) {
    if (items == nullptr || item_count == 0) {
        return -1;
    }
    if (desired < 0) {
        desired = 0;
    }
    if (static_cast<size_t>(desired) >= item_count) {
        desired = static_cast<int>(item_count - 1);
    }
    if (items[desired].enabled) {
        return desired;
    }
    for (size_t offset = 1; offset < item_count; ++offset) {
        int down = desired + static_cast<int>(offset);
        if (static_cast<size_t>(down) < item_count && items[down].enabled) {
            return down;
        }
        int up = desired - static_cast<int>(offset);
        if (up >= 0 && items[up].enabled) {
            return up;
        }
    }
    return -1;
}

int find_next_enabled(const gbs::MenuState& state, int direction) {
    if (state.items == nullptr || state.item_count == 0 || state.selected_index < 0) {
        return -1;
    }

    int index = state.selected_index;
    for (size_t step = 0; step < state.item_count; ++step) {
        index += direction;
        if (index < 0) {
            index = static_cast<int>(state.item_count - 1);
        } else if (static_cast<size_t>(index) >= state.item_count) {
            index = 0;
        }
        if (state.items[index].enabled) {
            return index;
        }
    }
    return state.selected_index;
}

int select_page(const gbs::MenuState& state, int direction) {
    if (state.items == nullptr || state.item_count == 0 || state.selected_index < 0) {
        return -1;
    }
    int desired = state.selected_index + direction * static_cast<int>(gbs::menu_max_visible_items);
    return clamp_selection(state.items, state.item_count, desired);
}

void append_char(char*& out, char* end, char value) {
    if (out < end) {
        *out = value;
        ++out;
    }
}

void append_limited_text(char*& out, char* end, const char* text, int max_chars) {
    if (text == nullptr) {
        return;
    }
    int count = 0;
    while (*text != '\0' && *text != '\n' && count < max_chars) {
        append_char(out, end, *text);
        ++text;
        ++count;
    }
}

char menu_buffer[26 * 5 + 5 + 1];

const char* menu_page_text(const gbs::MenuState& state) {
    char* out = menu_buffer;
    char* end = menu_buffer + sizeof(menu_buffer) - 1;
    append_limited_text(out, end, state.title, 26);
    if (gbs::menu_has_previous_page(state)) {
        append_char(out, end, ' ');
        append_char(out, end, '^');
    }
    if (gbs::menu_has_next_page(state)) {
        append_char(out, end, ' ');
        append_char(out, end, 'v');
    }

    size_t first_item = gbs::menu_first_visible_index(state);
    size_t visible_count = gbs::menu_visible_item_count(state);

    for (size_t index = 0; index < visible_count; ++index) {
        size_t item_index = first_item + index;
        append_char(out, end, '\n');
        append_char(out, end, static_cast<int>(item_index) == state.selected_index ? '!' : '-');
        append_char(out, end, state.items[item_index].enabled ? ' ' : 'X');
        append_limited_text(out, end, state.items[item_index].text, 24);
    }

    *out = '\0';
    return menu_buffer;
}

} // namespace

namespace gbs {

namespace {

int clamp_ui_int(int value, int min_value, int max_value) {
    if (value < min_value) {
        return min_value;
    }
    if (value > max_value) {
        return max_value;
    }
    return value;
}

int pixel_to_tile_floor(int value) {
    return clamp_ui_int(value, 0, 240) / 8;
}

int pixel_size_to_tiles(int value, int max_pixels) {
    value = clamp_ui_int(value, 0, max_pixels);
    return (value + 7) / 8;
}

int move_axis_towards_target(int current, int target, int remaining_frames) {
    if (current == target || remaining_frames <= 0) {
        return target;
    }
    const int delta = target - current;
    const int distance = delta < 0 ? -delta : delta;
    const int step = (distance + remaining_frames - 1) / remaining_frames;
    return current + (delta < 0 ? -step : step);
}

} // namespace

void init_hud(HudState& state) {
    state.visible = false;
    state.left_text = nullptr;
    state.right_text = nullptr;
    state.text_slot_count = 0;
    state.value_sources = 0;
    for (size_t index = 0; index < hud_text_slot_capacity; ++index) {
        state.text_slots[index] = nullptr;
    }
}

void set_hud_text(HudState& state, const char* left_text, const char* right_text) {
    const char* text_slots[] = { left_text, right_text };
    set_hud_text_slots(state, text_slots, 2);
}

void set_hud_text_slots(HudState& state, const char* const* text_slots, size_t text_slot_count) {
    state.visible = true;
    state.text_slot_count = text_slots == nullptr
        ? 0
        : text_slot_count < hud_text_slot_capacity ? text_slot_count : hud_text_slot_capacity;
    for (size_t index = 0; index < hud_text_slot_capacity; ++index) {
        state.text_slots[index] = index < state.text_slot_count ? text_slots[index] : nullptr;
    }
    state.left_text = state.text_slot_count > 0 ? state.text_slots[0] : nullptr;
    state.right_text = state.text_slot_count > 1 ? state.text_slots[1] : nullptr;
}

void set_hud_value(HudState& state, HudValueSource source, uint32_t value, uint32_t maximum) {
    const int index = static_cast<int>(source);
    if (index < 0 || static_cast<size_t>(index) >= hud_value_source_count) return;
    state.values[index] = value;
    state.maximums[index] = maximum;
    state.value_sources |= 1u << index;
}

void hide_hud(HudState& state) {
    state.visible = false;
    state.left_text = nullptr;
    state.right_text = nullptr;
    state.text_slot_count = 0;
    for (size_t index = 0; index < hud_text_slot_capacity; ++index) {
        state.text_slots[index] = nullptr;
    }
}

void update_hud_behavior(EventState& state, bool visible) {
    if (!selected_hud_layout || !string_equals(selected_hud_layout->mode, "advanced")) return;
    for (size_t index=0; index<selected_hud_layout->component_count && index<64; ++index) {
        const auto& component=selected_hud_layout->components[index];
        update_hud_element(component.behavior,hud_element_memory[index],state,visible && component.visible,state.input_pressed);
    }
}

void draw_hud(const HudState& state) {
    if (selected_hud_layout != nullptr && string_equals(selected_hud_layout->mode, "advanced")) {
        constexpr size_t hud_layout_order_capacity = 64;
        size_t order[hud_layout_order_capacity];
        size_t order_count = 0;
        for (size_t index = 0; index < selected_hud_layout->component_count && order_count < hud_layout_order_capacity; ++index) {
            const HudLayoutComponent& component = selected_hud_layout->components[index];
            if (!component.visible) continue;
            size_t insert_at = order_count;
            while (insert_at > 0 && selected_hud_layout->components[order[insert_at - 1]].z_index > component.z_index) {
                order[insert_at] = order[insert_at - 1];
                --insert_at;
            }
            order[insert_at] = index;
            ++order_count;
        }

        gbs_hw_begin_hud_layout(state.visible ? 1 : 0);
        int text_slot = 0;
        int text_oam_offset = 0;
        size_t gauge_buffer = 0;
        for (size_t order_index = 0; order_index < order_count; ++order_index) {
            const HudLayoutComponent& component = selected_hud_layout->components[order[order_index]];
            const int kind = hud_component_kind(component.kind);
            if (kind < 0) continue;
            const auto status = hud_element_memory[order[order_index]].state;
            const char* text = status == HudElementState::Selected && component.behavior.selected.text ? component.behavior.selected.text :
                status == HudElementState::Disabled && component.behavior.disabled.text ? component.behavior.disabled.text : component.text;
            const int value_index = static_cast<int>(component.value_source);
            const bool bound = value_index >= 0 && static_cast<size_t>(value_index) < hud_value_source_count;
            const bool available = !bound || (state.value_sources & (1u << value_index));
            const MetaSprite* image = component.metasprite;
            if (bound && available) {
                const uint32_t value = state.values[value_index];
                if (kind == GBS_HW_HUD_COMPONENT_TEXT) {
                    char* digits = hud_value_text[order[order_index]];
                    const size_t columns = static_cast<size_t>((component.width + 7) / 8);
                    size_t length = 0;
                    if (component.text) while (component.text[length] && length < 8) ++length;
                    if (length == 0 || length > columns) length = columns < 8 ? columns : 8;
                    digits[length] = '\0';
                    uint32_t remaining = value;
                    for (size_t n = length; n > 0; --n) {digits[n-1] = '0' + remaining % 10; remaining /= 10;}
                    text = digits;
                } else if (kind == GBS_HW_HUD_COMPONENT_ICON && value > 0) {
                    image = component.state_assets[value > 1 ? 1 : 0];
                    if (!image) image = component.metasprite;
                } else if (kind == GBS_HW_HUD_COMPONENT_BAR && image && gauge_buffer < 2 &&
                    state.visible && status != HudElementState::Hidden) {
                    const size_t buffer = gauge_buffer++;
                    auto& cache = hud_gauge_cache[buffer];
                    const uint32_t maximum = state.maximums[value_index];
                    if ((cache.component != &component || cache.value != value || cache.maximum != maximum) &&
                        compose_hud_gauge(*image,component.gauge,value,maximum,hud_gauge_buffers[buffer],1536)) {
                        gbs_hw_load_obj_tiles(hud_gauge_buffers[buffer],component.gauge.full->destination_tile,component.gauge.full->tile_count);
                        cache = {&component,value,maximum};
                    }
                }
            }
            int component_text_slot = -1;
            if (kind == GBS_HW_HUD_COMPONENT_TEXT || (kind == GBS_HW_HUD_COMPONENT_ICON && component.metasprite == nullptr)) {
                component_text_slot = text_slot++;
                if (text == nullptr || *text == '\0') {
                    if (component_text_slot >= 0
                        && static_cast<size_t>(component_text_slot) < state.text_slot_count) {
                        text = state.text_slots[component_text_slot];
                    }
                    if (text == nullptr || *text == '\0') {
                        text = component_text_slot == 0 ? state.left_text : state.right_text;
                    }
                }
                if ((text == nullptr || *text == '\0') && kind == GBS_HW_HUD_COMPONENT_ICON) {
                    text = component.label;
                }
            }
            gbs_hw_draw_hud_layout_component(
                kind,
                component.x,
                component.y,
                component.width,
                component.height,
                text,
                text_oam_offset,
                image,
                state.visible && available && status != HudElementState::Hidden ? 1 : 0
            );
            if (kind == GBS_HW_HUD_COMPONENT_TEXT || (kind == GBS_HW_HUD_COMPONENT_ICON && image == nullptr)) {
                text_oam_offset += (component.width + 7) / 8;
            }
        }
        gbs_hw_end_hud_layout();
        return;
    }
    gbs_hw_draw_hud_bar(state.left_text, state.right_text, state.visible ? 1 : 0);
}

void configure_hud_layouts(const HudLayout* layouts, size_t count) {
    configured_hud_layouts = layouts;
    configured_hud_layout_count = layouts == nullptr ? 0 : count;
    selected_hud_layout = nullptr;
    for (auto& cache : hud_gauge_cache) cache = HudGaugeCache {};
    for (auto& memory : hud_element_memory) memory = HudElementMemory {};
}

bool configure_hud_layout(const char* layout_id) {
    // Scene setup may have reloaded the full image into the same VRAM slot.
    for (auto& cache : hud_gauge_cache) cache = HudGaugeCache {};
    if (layout_id == nullptr) {
        selected_hud_layout = nullptr;
        for (auto& memory : hud_element_memory) memory = HudElementMemory {};
        gbs_hw_invalidate_hud_layout();
        return true;
    }
    for (size_t index = 0; index < configured_hud_layout_count; ++index) {
        if (!string_equals(configured_hud_layouts[index].id, layout_id)) continue;
        if (selected_hud_layout != &configured_hud_layouts[index]) for (auto& memory : hud_element_memory) memory = HudElementMemory {};
        selected_hud_layout = &configured_hud_layouts[index];
        gbs_hw_invalidate_hud_layout();
        return true;
    }
    selected_hud_layout = nullptr;
    gbs_hw_invalidate_hud_layout();
    return false;
}

const HudLayout* active_hud_layout() {
    return selected_hud_layout;
}

void init_overlay(OverlayState& state) {
    state.visible = false;
    state.x = 0;
    state.y = 0;
    state.target_x = 0;
    state.target_y = 0;
    state.width = 160;
    state.height = 40;
    state.line = 0;
    state.transition_frames = 0;
}

void set_overlay_line(OverlayState& state, int line) {
    state.line = clamp_ui_int(line, 0, 160);
    state.height = state.line;
}

void show_overlay(OverlayState& state, int x, int y, int width, int height) {
    state.visible = true;
    state.x = clamp_ui_int(x, 0, 240);
    state.y = clamp_ui_int(y, 0, 160);
    state.target_x = state.x;
    state.target_y = state.y;
    state.width = clamp_ui_int(width, 0, 240);
    state.height = clamp_ui_int(height, 0, 160);
    state.transition_frames = 0;
}

void move_overlay(OverlayState& state, int x, int y, int frames) {
    state.target_x = clamp_ui_int(x, 0, 240);
    state.target_y = clamp_ui_int(y, 0, 160);
    state.transition_frames = clamp_ui_int(frames, 0, 600);
    if (state.transition_frames == 0) {
        state.x = state.target_x;
        state.y = state.target_y;
    }
}

void tick_overlay(OverlayState& state) {
    if (state.transition_frames <= 0) {
        return;
    }
    state.x = move_axis_towards_target(state.x, state.target_x, state.transition_frames);
    state.y = move_axis_towards_target(state.y, state.target_y, state.transition_frames);
    --state.transition_frames;
    if (state.transition_frames == 0) {
        state.x = state.target_x;
        state.y = state.target_y;
    }
}

void hide_overlay(OverlayState& state) {
    state.visible = false;
}

void draw_overlay(const OverlayState& state) {
    if (!state.visible || state.width <= 0 || state.height <= 0) {
        gbs_hw_draw_overlay_rect(0, 0, 0, 0, 0);
        return;
    }

    gbs_hw_draw_overlay_rect(
        pixel_to_tile_floor(state.x),
        pixel_to_tile_floor(state.y),
        pixel_size_to_tiles(state.width, 240),
        pixel_size_to_tiles(state.height, 160),
        1
    );
}

void init_menu(MenuState& state) {
    state.visible = false;
    state.title = nullptr;
    state.items = nullptr;
    state.item_count = 0;
    state.selected_index = -1;
    state.last_value = 0;
    state.last_index = -1;
    state.accepted = false;
    state.cancelled = false;
}

bool show_menu(MenuState& state, const char* title, const MenuItem* items, size_t item_count) {
    if (items == nullptr || item_count == 0 || item_count > 16) {
        return false;
    }
    int selection = clamp_selection(items, item_count, 0);
    if (selection < 0) {
        return false;
    }

    state.visible = true;
    state.title = title;
    state.items = items;
    state.item_count = item_count;
    state.selected_index = selection;
    state.last_value = 0;
    state.last_index = -1;
    state.accepted = false;
    state.cancelled = false;
    return true;
}

void hide_menu(MenuState& state) {
    state.visible = false;
    state.title = nullptr;
    state.items = nullptr;
    state.item_count = 0;
    state.selected_index = -1;
}

size_t menu_first_visible_index(const MenuState& state) {
    if (!state.visible || state.item_count == 0 || state.selected_index < 0) {
        return 0;
    }
    size_t selected = static_cast<size_t>(state.selected_index);
    return (selected / menu_max_visible_items) * menu_max_visible_items;
}

size_t menu_visible_item_count(const MenuState& state) {
    if (!state.visible || state.items == nullptr || state.item_count == 0) {
        return 0;
    }
    size_t first_item = menu_first_visible_index(state);
    size_t remaining_count = state.item_count > first_item ? state.item_count - first_item : 0;
    return remaining_count < menu_max_visible_items ? remaining_count : menu_max_visible_items;
}

bool menu_has_previous_page(const MenuState& state) {
    return menu_first_visible_index(state) > 0;
}

bool menu_has_next_page(const MenuState& state) {
    return menu_first_visible_index(state) + menu_visible_item_count(state) < state.item_count;
}

bool advance_menu(MenuState& state, InputState input) {
    if (!state.visible) {
        return false;
    }

    if (input.was_pressed(ButtonUp) || input.was_pressed(ButtonLeft)) {
        int next = find_next_enabled(state, -1);
        if (next >= 0 && next != state.selected_index) {
            state.selected_index = next;
            return true;
        }
    }
    if (input.was_pressed(ButtonDown) || input.was_pressed(ButtonRight)) {
        int next = find_next_enabled(state, 1);
        if (next >= 0 && next != state.selected_index) {
            state.selected_index = next;
            return true;
        }
    }
    if (input.was_pressed(ButtonL)) {
        int next = select_page(state, -1);
        if (next >= 0 && next != state.selected_index) {
            state.selected_index = next;
            return true;
        }
    }
    if (input.was_pressed(ButtonR)) {
        int next = select_page(state, 1);
        if (next >= 0 && next != state.selected_index) {
            state.selected_index = next;
            return true;
        }
    }
    if (input.was_pressed(ButtonA) || input.was_pressed(ButtonStart)) {
        if (state.selected_index >= 0 && static_cast<size_t>(state.selected_index) < state.item_count) {
            const MenuItem& item = state.items[state.selected_index];
            if (item.enabled) {
                state.last_value = item.value;
                state.last_index = state.selected_index;
                state.accepted = true;
                state.cancelled = false;
                hide_menu(state);
                return true;
            }
        }
    }
    if (input.was_pressed(ButtonB)) {
        state.last_value = 0;
        state.last_index = -1;
        state.accepted = false;
        state.cancelled = true;
        hide_menu(state);
        return true;
    }
    return false;
}

void draw_menu(const MenuState& state) {
    gbs_hw_draw_text_box(2, 5, 26, 7, state.visible ? menu_page_text(state) : nullptr, state.visible ? 1 : 0);
}

} // namespace gbs
