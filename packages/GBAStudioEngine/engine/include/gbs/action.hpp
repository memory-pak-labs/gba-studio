#pragma once

#include <stddef.h>
#include <stdint.h>

#include "gbs/tween.hpp"
#include "gbs/math.hpp"
#include "gbs/types.hpp"

namespace gbs {

// ============================================================
// Action System
// ============================================================

constexpr size_t action_max_entries = 32;

// What property an action drives.
enum class ActionTarget : uint8_t {
    SpriteX = 0,
    SpriteY = 1,
    SpritePositionX = 2,   // alias of SpriteX
    SpriteVisible = 3,
    SpritePaletteFade = 4,
    SpriteRotation = 5,
    SpriteScaleX = 6,
    SpriteScaleY = 7,
    SpriteAffineMat = 8,
    BgScrollX = 10,
    BgScrollY = 11,
    BgAffineMat = 12,
    BackdropColor = 13,
    Custom = 100
};

// How the value is produced each frame.
struct ActionValueProvider {
    int32_t from;
    int32_t to;
    int32_t delta;         // used when use_delta is true
    uint16_t duration_frames;
    uint16_t elapsed_frames;
    Easing easing;
    bool use_delta;
};

// A single action instance.
struct Action {
    ActionTarget target;
    uint8_t index;          // sprite index, affine mat index, bg layer, etc.
    ActionValueProvider provider;
    bool loop = false;
    bool enabled = false;

    // Optional custom apply; when null the built-in dispatcher is used.
    void (*apply)(ActionTarget target, uint8_t index, int32_t value, void* user_data) = nullptr;
    void* user_data = nullptr;
};

// Built-in apply for sprite properties (X, Y, visible, rotation, scale).
void action_apply_sprite(ActionTarget target, uint8_t index, int32_t value, void* user_data);
// Built-in apply for background scroll.
void action_apply_bg_scroll(ActionTarget target, uint8_t layer, int32_t value, void* user_data);
// Built-in apply for backdrop color.
void action_apply_backdrop(ActionTarget target, uint8_t index, int32_t value, void* user_data);

// Start an action. Returns a handle (1..action_max_entries) or 0 on failure.
uint8_t action_start(const Action& action);
// Stop and remove an action by handle.
void action_stop(uint8_t handle);
// Stop all actions.
void action_clear();
// Whether a handle is still active.
bool action_active(uint8_t handle);
// Number of active actions.
size_t action_active_count();
// Advance all actions by one frame, applying values.
void action_update_frame();
// Force-update a specific action by handle (used when testing stepping).
void action_update_handle(uint8_t handle);

// ------------------------------------------------------------------
// Convenience builders
// ------------------------------------------------------------------

// Animate a property from a starting value to an end value.
uint8_t action_animate(
    ActionTarget target,
    uint8_t index,
    int32_t from,
    int32_t to,
    uint16_t duration_frames,
    Easing easing = Easing::Linear,
    bool loop = false
);

// Animate a property by a delta from its current value.
uint8_t action_animate_by(
    ActionTarget target,
    uint8_t index,
    int32_t delta,
    uint16_t duration_frames,
    Easing easing = Easing::Linear,
    bool loop = false
);

// A no-op action that just waits for N frames.
uint8_t action_delay(uint16_t frames);

// ------------------------------------------------------------------
// Sprite affine convenience builders
// ------------------------------------------------------------------

// Animate sprite rotation (angle in GBA 16-bit turns: 0x4000 = 90 degrees).
uint8_t action_animate_sprite_rotation(
    uint8_t matrix_index,
    Angle from,
    Angle to,
    uint16_t duration_frames,
    Easing easing = Easing::Linear,
    bool loop = false
);

// Animate sprite horizontal scale (256 = 1.0x in Q8.8 fixed point).
uint8_t action_animate_sprite_scale_x(
    uint8_t matrix_index,
    int16_t from,
    int16_t to,
    uint16_t duration_frames,
    Easing easing = Easing::Linear,
    bool loop = false
);

// Animate sprite vertical scale (256 = 1.0x in Q8.8 fixed point).
uint8_t action_animate_sprite_scale_y(
    uint8_t matrix_index,
    int16_t from,
    int16_t to,
    uint16_t duration_frames,
    Easing easing = Easing::Linear,
    bool loop = false
);

// ------------------------------------------------------------------
// Composition
// ------------------------------------------------------------------

// Run a set of actions sequentially (one after the other).
// Returns a handle for the composed group (0 on failure).
uint8_t action_sequence_start(const uint8_t* handles, size_t count);

// Run a set of actions in parallel (all at once).
// Returns a handle for the composed group (0 on failure).
uint8_t action_parallel_start(const uint8_t* handles, size_t count);

// Update composed groups (call once per frame after action_update_frame).
void action_update_compositions();

// Loop an action a fixed number of times (repeats = 0 means forever).
// Returns a handle for the loop group (0 on failure).
uint8_t action_loop_start(uint8_t inner_handle, uint16_t repeats = 0);
bool action_loop_running(uint8_t loop_handle);
void action_loop_stop(uint8_t loop_handle);

// Sequence state access
bool action_sequence_running(uint8_t sequence_handle);
void action_sequence_stop(uint8_t sequence_handle);

#if !defined(__arm__) && !defined(__thumb__)
// Host-only: read back the last value applied for a target/index pair.
// Returns 0 if never applied.
int32_t action_host_last_value(ActionTarget target, uint8_t index);
#endif

} // namespace gbs