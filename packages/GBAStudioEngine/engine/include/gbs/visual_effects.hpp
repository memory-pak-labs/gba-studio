#pragma once

#include <stdint.h>
#include "gbs/event.hpp"
#include "gbs/render.hpp"
#include "gbs/types.hpp"
#include "gbs/tween.hpp"

namespace gbs {

enum class TransitionDirection : uint8_t {
    Left = 0,
    Right = 1
};

struct VisualEffectsController {
    VisualEffectKind kind;
    VisualEffectTarget target;
    uint16_t duration_frames;
    uint16_t remaining_frames;
    uint16_t elapsed_frames;
    uint8_t intensity;
    TransitionDirection direction;
    bool transition_phase;
    bool cover;
    bool active;
};

struct VisibilityEffectController {
    int16_t actor;
    uint16_t width;
    uint16_t height;
    uint16_t duration_frames;
    uint16_t remaining_frames;
    uint16_t elapsed_frames;
    uint8_t intensity;
    bool reveal;
    bool active;
};

enum class VisibilityRenderStatus : uint8_t { Inactive, Visible, TransitionOwnsResources, EffectOwnsResources };
// WIN1 + brightness are exclusive with transitions and window/blend effects.
VisibilityRenderStatus visibility_render_status(const VisualEffectsController& other, bool transition_active = false);
const VisibilityEffectController& visibility_effect();
void start_visibility_effect(int actor, int width, int height, int intensity, int frames, bool reveal);
void stop_visibility_effect();
void consume_visibility_event_commands(const EventState& state);
// Fade/mask transitions own the shared hardware effects while active.
void render_visibility_effects(Vec2i center_screen, const VisualEffectsController& other, bool transition_active = false);
void tick_visibility_effects();

void init_visual_effects(VisualEffectsController& controller);
void reset_visual_effect_rendering();
void stop_visual_effect(VisualEffectsController& controller);
void start_visual_effect(
    VisualEffectsController& controller,
    VisualEffectKind kind,
    VisualEffectTarget target,
    int frames,
    int intensity
);
void start_visual_effect_phase(
    VisualEffectsController& controller,
    VisualEffectKind kind,
    VisualEffectTarget target,
    int frames,
    int intensity,
    bool cover
);
void start_visual_transition(
    VisualEffectsController& controller,
    VisualEffectKind kind,
    VisualEffectTarget target,
    int frames,
    int intensity,
    TransitionDirection direction
);
bool consume_visual_effect_event(EventState& event_state, VisualEffectsController& controller);
bool consume_scene_transition_visual_effect_event(EventState& event_state);
void reset_scene_transition_visual_effects();
void render_scene_transition_visual_effects();
void tick_scene_transition_visual_effects();
void render_visual_effects(const VisualEffectsController& controller);
void tick_visual_effects(VisualEffectsController& controller);
Vec2i visual_effect_scroll_offset(const VisualEffectsController& controller);
bool visual_effect_targets_background(const VisualEffectsController& controller, BackgroundLayer layer);
bool visual_effect_sprite_mosaic_enabled(const VisualEffectsController& controller);
Fixed visual_effect_progress(const VisualEffectsController& controller, Easing easing = Easing::Linear);

} // namespace gbs
