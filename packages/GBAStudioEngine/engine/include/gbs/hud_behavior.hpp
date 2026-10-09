#pragma once
#include "gbs/event.hpp"
#include <stdint.h>
namespace gbs {
enum class HudElementState : uint8_t { Normal, Selected, Disabled, Hidden };
enum class HudElementTrigger : uint8_t { Appear, ValueChanged, Focus, Confirm };
struct HudStateCondition { int variable = -1; int32_t value = 0; const char* text = nullptr; };
struct HudVariableAction { bool add; int variable; int32_t value; };
struct HudElementEvent { HudElementTrigger trigger; int watch_variable; const HudVariableAction* actions; size_t action_count; };
struct HudElementBehavior {
    HudStateCondition selected {};
    HudStateCondition disabled {};
    HudStateCondition hidden {};
    const HudElementEvent* events = nullptr;
    size_t event_count = 0;
};
struct HudElementMemory {
    bool initialized = false;
    bool shown = false;
    HudElementState state = HudElementState::Normal;
    int32_t watched[8] {};
};
inline bool hud_condition_matches(const HudStateCondition& condition, const EventState& state) {
    return condition.variable >= 0 && static_cast<size_t>(condition.variable) < event_variable_count && state.variables[condition.variable] == condition.value;
}
inline HudElementState resolve_hud_element_state(const HudElementBehavior& behavior, const EventState& state) {
    if (hud_condition_matches(behavior.hidden,state)) return HudElementState::Hidden;
    if (hud_condition_matches(behavior.disabled,state)) return HudElementState::Disabled;
    if (hud_condition_matches(behavior.selected,state)) return HudElementState::Selected;
    return HudElementState::Normal;
}
inline HudElementState update_hud_element(const HudElementBehavior& behavior, HudElementMemory& memory, EventState& state, bool visible, uint16_t pressed) {
    const HudElementState status = resolve_hud_element_state(behavior,state);
    const bool shown = visible && status != HudElementState::Hidden;
    for (size_t index=0;index<behavior.event_count && index<8;++index) {
        const auto& event = behavior.events[index];
        const bool valid_watch = event.watch_variable >= 0 && static_cast<size_t>(event.watch_variable)<event_variable_count;
        const int32_t value = valid_watch ? state.variables[event.watch_variable] : 0;
        const bool fire = shown && ((event.trigger==HudElementTrigger::Appear && !memory.shown) ||
            (event.trigger==HudElementTrigger::ValueChanged && valid_watch && memory.initialized && memory.watched[index]!=value) ||
            (event.trigger==HudElementTrigger::Focus && status==HudElementState::Selected && (!memory.shown || memory.state!=HudElementState::Selected)) ||
            (event.trigger==HudElementTrigger::Confirm && status==HudElementState::Selected && (pressed & 1u)));
        memory.watched[index]=value;
        if (!fire || !event.actions) continue;
        for (size_t action_index=0; action_index<event.action_count && action_index<16; ++action_index) {
            const auto& action=event.actions[action_index];
            if (action.variable<0 || static_cast<size_t>(action.variable)>=event_variable_count) continue;
            const int64_t next=action.add ? static_cast<int64_t>(state.variables[action.variable])+action.value : action.value;
            state.variables[action.variable]=static_cast<int32_t>(next>INT32_MAX ? INT32_MAX : next<INT32_MIN ? INT32_MIN : next);
        }
    }
    memory.initialized=true; memory.shown=shown; memory.state=status;
    return status;
}
}
