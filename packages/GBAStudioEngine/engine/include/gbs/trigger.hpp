#pragma once

#include <stdint.h>
#include "gbs/event.hpp"
#include "gbs/types.hpp"

namespace gbs {

struct RuntimeTriggerData {
    Rect area;
    EventScript on_enter;
    EventScript on_leave;
    bool run_once = false;
    uint16_t cooldown_frames = 0;
};

struct RuntimeTriggerState {
    bool inside = false;
    bool fired = false;
    uint16_t cooldown_remaining = 0;
};

enum class RuntimeTriggerResult : uint8_t {
    None = 0,
    Enter = 1,
    Leave = 2
};

constexpr RuntimeTriggerResult update_runtime_trigger(
    const RuntimeTriggerData& trigger,
    RuntimeTriggerState& state,
    Rect subject
) {
    if (state.cooldown_remaining > 0) {
        --state.cooldown_remaining;
    }
    const bool is_inside = intersects(subject, trigger.area);
    if (is_inside && !state.inside) {
        state.inside = true;
        if ((trigger.run_once && state.fired) || state.cooldown_remaining > 0) {
            return RuntimeTriggerResult::None;
        }
        state.fired = true;
        state.cooldown_remaining = trigger.cooldown_frames;
        return RuntimeTriggerResult::Enter;
    }
    if (!is_inside && state.inside) {
        state.inside = false;
        return RuntimeTriggerResult::Leave;
    }
    return RuntimeTriggerResult::None;
}

constexpr EventScript runtime_trigger_script_for_result(
    const RuntimeTriggerData& trigger,
    RuntimeTriggerResult result
) {
    if (result == RuntimeTriggerResult::Enter) return trigger.on_enter;
    if (result == RuntimeTriggerResult::Leave) return trigger.on_leave;
    return empty_event_script();
}

} // namespace gbs
