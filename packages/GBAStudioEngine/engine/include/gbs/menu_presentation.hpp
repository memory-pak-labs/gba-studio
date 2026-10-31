#pragma once
#include "menu.hpp"

namespace gbs {

constexpr size_t menu_presentation_padding(const char* text, size_t columns) {
    size_t cells=0;
    for(size_t i=0;text && text[i];++i) if((static_cast<unsigned char>(text[i])&0xC0u)!=0x80u)++cells;
    return cells<columns?columns-cells:0;
}

// Read-only bindings never allocate inventory or alter persisted event slots.
constexpr int menu_presentation_value(const EventState& state, const MenuItemBindingData& binding) {
    if (!is_valid_menu_item_binding(binding)) return -1;
    switch (binding.source) {
    case MenuItemBindingSource::Variable: return state.variables[binding.index];
    case MenuItemBindingSource::Inventory: return state.inventory[binding.index];
    case MenuItemBindingSource::Stat: return state.stats[binding.index];
    case MenuItemBindingSource::Equipped: return state.equipped_items[binding.index];
    case MenuItemBindingSource::Text: {
        const char* text = state.text_variables[binding.index];
        if (*text < '0' || *text > '9') return -1;
        int value = 0;
        for (size_t i = 0; text[i] >= '0' && text[i] <= '9'; ++i) {
            value = value * 10 + text[i] - '0';
            if (value > 32767) return 32767;
        }
        return value;
    }
    case MenuItemBindingSource::Context:
        if (binding.index == 1) return state.racing_result;
        if (!state.scene_stack_count) return -1;
        return binding.index == 0 ? state.scene_stack[state.scene_stack_count - 1].room
            : static_cast<int>(state.scene_stack[state.scene_stack_count - 1].runtime);
    default: return -1;
    }
}

constexpr bool menu_presentation_visible(const EventState& state,
    const MenuVisibilityConditionData* conditions, size_t count, bool any) {
    if (!count) return true;
    if (!conditions) return false;
    for (size_t i = 0; i < count; ++i) {
        const auto& condition = conditions[i];
        const bool matches = is_valid_menu_item_binding(condition.binding) &&
            ((menu_presentation_value(state, condition.binding) == condition.value) != condition.negate);
        if (any && matches) return true;
        if (!any && !matches) return false;
    }
    return !any;
}

constexpr int menu_page_target(const MenuScreenData& screen, uint16_t pressed, size_t screen_count) {
    const int target = pressed & ButtonL ? screen.previous_page_screen_index
        : pressed & ButtonR ? screen.next_page_screen_index : -1;
    return target >= 0 && static_cast<size_t>(target) < screen_count ? target : -1;
}
} // namespace gbs
