#include "gbs/action.hpp"
#include "gbs_hw.h"
#if defined(__arm__) || defined(__thumb__)
#include "gbs/render.hpp"
#include "gbs/math.hpp"
#endif

namespace gbs {

// ============================================================
// Internal state
// ============================================================

namespace {

Action s_actions[action_max_entries] = {};
uint8_t s_action_count = 0;
uint8_t s_next_handle = 1;

#if !defined(__arm__) && !defined(__thumb__)
int32_t s_host_last_values[16][256] = {};
bool s_host_value_valid[16][256] = {};
#endif

// Composition storage
constexpr size_t action_max_compositions = 8;

enum class CompositionKind : uint8_t {
    Sequence = 0,
    Parallel = 1,
    Loop = 2
};

struct Composition {
    uint8_t handles[action_max_entries];
    size_t count;
    size_t current;
    CompositionKind kind;
    bool running;
    bool delay_mode;
    uint16_t delay_remaining;
    uint16_t loop_remaining;   // for Loop kind: repeats left (0 = forever)
    bool done[action_max_entries];
};

Composition s_compositions[action_max_compositions] = {};
uint8_t s_composition_count = 0;
uint8_t s_composition_next_handle = 1;

// Compute the value for a provider at its current elapsed frame.
int32_t provider_value(const ActionValueProvider& p) {
    if (p.use_delta) {
        // delta-based: start from 0 and go to delta
        return static_cast<int32_t>(
            tween_value(
                Fixed::zero(),
                Fixed::from_raw(p.delta),
                p.elapsed_frames,
                p.duration_frames,
                p.easing
            ).raw()
        );
    }
    return static_cast<int32_t>(
        tween_value(
            Fixed::from_raw(p.from),
            Fixed::from_raw(p.to),
            p.elapsed_frames,
            p.duration_frames,
            p.easing
        ).raw()
    );
}

// Built-in value application (host uses shadow, ARM uses hardware).
void apply_value(ActionTarget target, uint8_t index, int32_t value) {
#if defined(__arm__) || defined(__thumb__)
    switch (target) {
    case ActionTarget::SpriteX:
        // handled through the engine sprite API via gbs_hw_set_sprite when the
        // engine uses shadow OAM; for raw mode this is a direct OAM write.
        break;
    case ActionTarget::SpriteVisible:
        break;
    case ActionTarget::SpriteRotation: {
        const Angle angle = static_cast<Angle>(static_cast<uint16_t>(value));
        AffineMatrix mat;
        build_affine_matrix(mat, angle, Fixed::from_raw(256), Fixed::from_raw(256));
        set_affine_sprite_transform(static_cast<uint8_t>(index), mat);
        break;
    }
    case ActionTarget::SpriteScaleX: {
        const int16_t scale_x = static_cast<int16_t>(value);
        set_affine_sprite_transform(static_cast<uint8_t>(index), affine_scale_x_matrix(scale_x));
        break;
    }
    case ActionTarget::SpriteScaleY: {
        const int16_t scale_y = static_cast<int16_t>(value);
        set_affine_sprite_transform(static_cast<uint8_t>(index), affine_scale_y_matrix(scale_y));
        break;
    }
    case ActionTarget::SpriteAffineMat: {
        // value packs pa|pb in upper/lower 16 bits; index encodes the matrix.
        // Callers should use action_animate_affine instead of raw values.
        break;
    }
    case ActionTarget::BgScrollX:
        gbs_hw_set_bg_scroll(static_cast<int>(index), value, gbs_hw_timer_value(0));
        break;
    case ActionTarget::BgScrollY:
        gbs_hw_set_bg_scroll(static_cast<int>(index), value, 0);
        break;
    case ActionTarget::BackdropColor:
        gbs_hw_set_backdrop(static_cast<uint16_t>(value));
        break;
    default:
        break;
    }
#else
    if (static_cast<int>(target) < 16) {
        s_host_last_values[static_cast<int>(target)][index] = value;
        s_host_value_valid[static_cast<int>(target)][index] = true;
    }
#endif
}

} // namespace

// ============================================================
// Public API
// ============================================================

void action_apply_sprite(ActionTarget target, uint8_t index, int32_t value, void*) {
    apply_value(target, index, value);
}

void action_apply_bg_scroll(ActionTarget target, uint8_t layer, int32_t value, void*) {
    apply_value(target, layer, value);
}

void action_apply_backdrop(ActionTarget target, uint8_t index, int32_t value, void*) {
    apply_value(target, index, value);
}

uint8_t action_start(const Action& action) {
    if (s_action_count >= action_max_entries) {
        return 0;
    }
    if (s_next_handle == 0) {
        s_next_handle = 1;
    }
    const uint8_t handle = s_next_handle++;
    Action& slot = s_actions[s_action_count];
    slot = action;
    slot.enabled = true;
    ++s_action_count;
    return handle;
}

void action_stop(uint8_t handle) {
    if (handle == 0 || handle > s_action_count) {
        return;
    }
    for (size_t i = 0; i < s_action_count; ++i) {
        if (i + 1u == handle) {
            for (size_t j = i; j + 1 < s_action_count; ++j) {
                s_actions[j] = s_actions[j + 1];
            }
            --s_action_count;
            return;
        }
    }
}

void action_clear() {
    for (size_t i = 0; i < action_max_entries; ++i) {
        s_actions[i] = Action {};
    }
    s_action_count = 0;
    s_next_handle = 1;

    for (size_t i = 0; i < action_max_compositions; ++i) {
        s_compositions[i] = Composition {};
    }
    s_composition_count = 0;
    s_composition_next_handle = 1;
}

bool action_active(uint8_t handle) {
    return handle != 0 && handle <= s_action_count && s_actions[handle - 1u].enabled;
}

size_t action_active_count() {
    size_t count = 0;
    for (size_t i = 0; i < s_action_count; ++i) {
        if (s_actions[i].enabled) {
            ++count;
        }
    }
    return count;
}

void action_update_handle(uint8_t handle) {
    if (handle == 0 || handle > s_action_count) {
        return;
    }
    Action& action = s_actions[handle - 1u];
    if (!action.enabled) {
        return;
    }

    const int32_t value = provider_value(action.provider);
    if (action.apply != nullptr) {
        action.apply(action.target, action.index, value, action.user_data);
    } else {
        apply_value(action.target, action.index, value);
    }

    action.provider.elapsed_frames++;
    if (action.provider.elapsed_frames >= action.provider.duration_frames) {
        if (action.loop) {
            action.provider.elapsed_frames = 0;
        } else {
            // Apply the exact final value (to / delta) on the last frame.
            action.provider.elapsed_frames = action.provider.duration_frames;
            const int32_t final_value = provider_value(action.provider);
            if (action.apply != nullptr) {
                action.apply(action.target, action.index, final_value, action.user_data);
            } else {
                apply_value(action.target, action.index, final_value);
            }
            action.enabled = false;
        }
    }
}

void action_update_frame() {
    for (size_t i = 0; i < s_action_count; ++i) {
        action_update_handle(static_cast<uint8_t>(i + 1u));
    }
    action_update_compositions();
}

// ============================================================
// Convenience builders
// ============================================================

uint8_t action_animate(
    ActionTarget target,
    uint8_t index,
    int32_t from,
    int32_t to,
    uint16_t duration_frames,
    Easing easing,
    bool loop
) {
    if (duration_frames == 0) {
        return 0;
    }
    Action action;
    action.target = target;
    action.index = index;
    action.provider = ActionValueProvider {
        from, to, 0, duration_frames, 0, easing, false
    };
    action.loop = loop;
    action.enabled = true;
    return action_start(action);
}

uint8_t action_animate_by(
    ActionTarget target,
    uint8_t index,
    int32_t delta,
    uint16_t duration_frames,
    Easing easing,
    bool loop
) {
    if (duration_frames == 0) {
        return 0;
    }
    Action action;
    action.target = target;
    action.index = index;
    action.provider = ActionValueProvider {
        0, delta, delta, duration_frames, 0, easing, true
    };
    action.loop = loop;
    action.enabled = true;
    return action_start(action);
}

uint8_t action_delay(uint16_t frames) {
    if (frames == 0) {
        return 0;
    }
    Action action;
    action.target = ActionTarget::Custom;
    action.provider = ActionValueProvider {
        0, 0, 0, frames, 0, Easing::Linear, false
    };
    action.enabled = true;
    return action_start(action);
}

// ------------------------------------------------------------------
// Sprite affine convenience builders
// ------------------------------------------------------------------

uint8_t action_animate_sprite_rotation(
    uint8_t matrix_index,
    Angle from,
    Angle to,
    uint16_t duration_frames,
    Easing easing,
    bool loop
) {
    if (duration_frames == 0) {
        return 0;
    }
    Action action;
    action.target = ActionTarget::SpriteRotation;
    action.index = matrix_index;
    action.provider = ActionValueProvider {
        static_cast<int32_t>(from),
        static_cast<int32_t>(to),
        0, duration_frames, 0, easing, false
    };
    action.loop = loop;
    action.enabled = true;
    return action_start(action);
}

uint8_t action_animate_sprite_scale_x(
    uint8_t matrix_index,
    int16_t from,
    int16_t to,
    uint16_t duration_frames,
    Easing easing,
    bool loop
) {
    if (duration_frames == 0) {
        return 0;
    }
    Action action;
    action.target = ActionTarget::SpriteScaleX;
    action.index = matrix_index;
    action.provider = ActionValueProvider {
        from, to, 0, duration_frames, 0, easing, false
    };
    action.loop = loop;
    action.enabled = true;
    return action_start(action);
}

uint8_t action_animate_sprite_scale_y(
    uint8_t matrix_index,
    int16_t from,
    int16_t to,
    uint16_t duration_frames,
    Easing easing,
    bool loop
) {
    if (duration_frames == 0) {
        return 0;
    }
    Action action;
    action.target = ActionTarget::SpriteScaleY;
    action.index = matrix_index;
    action.provider = ActionValueProvider {
        from, to, 0, duration_frames, 0, easing, false
    };
    action.loop = loop;
    action.enabled = true;
    return action_start(action);
}

// ============================================================
// Composition
// ============================================================

namespace {

void advance_sequence(Composition& c) {
    ++c.current;
    if (c.current >= c.count) {
        c.running = false;
        return;
    }
    const uint8_t h = c.handles[c.current];
    // Enable the next action so it starts playing.
    if (h != 0 && h <= s_action_count) {
        s_actions[h - 1u].enabled = true;
    }
}

} // namespace

uint8_t action_sequence_start(const uint8_t* handles, size_t count) {
    if (handles == nullptr || count == 0 || count > action_max_entries) {
        return 0;
    }
    if (s_composition_count >= action_max_compositions) {
        return 0;
    }
    if (s_composition_next_handle == 0) {
        s_composition_next_handle = 1;
    }
    Composition& c = s_compositions[s_composition_count];
    for (size_t i = 0; i < count; ++i) {
        c.handles[i] = handles[i];
    }
    c.count = count;
    c.current = 0;
    c.kind = CompositionKind::Sequence;
    c.running = true;
    c.delay_mode = false;
    c.delay_remaining = 0;

    // Only the first action runs initially; pause the rest.
    for (size_t i = 1; i < count; ++i) {
        const uint8_t h = handles[i];
        if (h != 0 && h <= s_action_count) {
            s_actions[h - 1u].enabled = false;
        }
    }
    ++s_composition_count;
    return s_composition_next_handle++;
}

uint8_t action_parallel_start(const uint8_t* handles, size_t count) {
    if (handles == nullptr || count == 0 || count > action_max_entries) {
        return 0;
    }
    if (s_composition_count >= action_max_compositions) {
        return 0;
    }
    if (s_composition_next_handle == 0) {
        s_composition_next_handle = 1;
    }
    Composition& c = s_compositions[s_composition_count];
    for (size_t i = 0; i < count; ++i) {
        c.handles[i] = handles[i];
        c.done[i] = false;
    }
    c.count = count;
    c.current = 0;
    c.kind = CompositionKind::Parallel;
    c.running = true;
    c.delay_mode = false;
    c.delay_remaining = 0;
    ++s_composition_count;
    return s_composition_next_handle++;
}

void action_update_compositions() {
    for (size_t i = 0; i < s_composition_count; ++i) {
        Composition& c = s_compositions[i];
        if (!c.running) {
            continue;
        }

        if (c.kind == CompositionKind::Loop) {
            if (c.count == 0) {
                c.running = false;
                continue;
            }
            const uint8_t inner = c.handles[0];
            if (!action_active(inner)) {
                if (c.loop_remaining == 0) {
                    c.running = false; // infinite loop stays running
                    continue;
                }
                if (c.loop_remaining > 1) {
                    --c.loop_remaining;
                    // Restart the inner action by resetting its elapsed counter.
                    if (inner != 0 && inner <= s_action_count) {
                        s_actions[inner - 1u].enabled = true;
                        s_actions[inner - 1u].provider.elapsed_frames = 0;
                    }
                } else {
                    // Final repeat: stop once the inner action has completed.
                    --c.loop_remaining;
                    c.running = false;
                }
            }
            continue;
        }

        if (c.kind == CompositionKind::Parallel) {
            bool any = false;
            for (size_t m = 0; m < c.count; ++m) {
                if (action_active(c.handles[m])) {
                    any = true;
                }
            }
            if (!any) {
                c.running = false;
            }
            continue;
        }

        // Sequence
        if (c.current >= c.count) {
            c.running = false;
            continue;
        }
        if (action_active(c.handles[c.current])) {
            continue;
        }
        advance_sequence(c);
    }
}

bool action_sequence_running(uint8_t sequence_handle) {
    if (sequence_handle == 0 || sequence_handle > s_composition_count) {
        return false;
    }
    return s_compositions[sequence_handle - 1u].running;
}

uint8_t action_loop_start(uint8_t inner_handle, uint16_t repeats) {
    if (inner_handle == 0) {
        return 0;
    }
    if (s_composition_count >= action_max_compositions) {
        return 0;
    }
    if (s_composition_next_handle == 0) {
        s_composition_next_handle = 1;
    }
    Composition& c = s_compositions[s_composition_count];
    c.handles[0] = inner_handle;
    c.count = 1;
    c.current = 0;
    c.kind = CompositionKind::Loop;
    c.running = true;
    c.loop_remaining = repeats;
    c.delay_mode = false;
    c.delay_remaining = 0;
    // Ensure the inner action is running for the first pass.
    if (inner_handle <= s_action_count) {
        s_actions[inner_handle - 1u].enabled = true;
        s_actions[inner_handle - 1u].provider.elapsed_frames = 0;
    }
    ++s_composition_count;
    return s_composition_next_handle++;
}

bool action_loop_running(uint8_t loop_handle) {
    if (loop_handle == 0 || loop_handle > s_composition_count) {
        return false;
    }
    return s_compositions[loop_handle - 1u].running &&
        s_compositions[loop_handle - 1u].kind == CompositionKind::Loop;
}

void action_loop_stop(uint8_t loop_handle) {
    if (loop_handle == 0 || loop_handle > s_composition_count) {
        return;
    }
    s_compositions[loop_handle - 1u].running = false;
}

void action_sequence_stop(uint8_t sequence_handle) {
    if (sequence_handle == 0 || sequence_handle > s_composition_count) {
        return;
    }
    s_compositions[sequence_handle - 1u].running = false;
}

#if !defined(__arm__) && !defined(__thumb__)
int32_t action_host_last_value(ActionTarget target, uint8_t index) {
    const int t = static_cast<int>(target);
    if (t < 16 && s_host_value_valid[t][index]) {
        return s_host_last_values[t][index];
    }
    return 0;
}
#endif

} // namespace gbs