#include "gbs/visual_effects.hpp"

namespace {

int16_t hblank_scroll_offsets[160] {};
gbs::VisualEffectsController scene_transition_effects {};
bool scene_transition_effects_initialized = false;

int clamp_value(int value, int minimum, int maximum) {
    if (value < minimum) return minimum;
    if (value > maximum) return maximum;
    return value;
}

uint16_t render_mask(gbs::VisualEffectTarget target) {
    switch (target) {
    case gbs::VisualEffectTarget::Bg0:
        return gbs::RenderLayerBG0;
    case gbs::VisualEffectTarget::Bg1:
        return gbs::RenderLayerBG1;
    case gbs::VisualEffectTarget::Bg2:
        return gbs::RenderLayerBG2;
    case gbs::VisualEffectTarget::Bg3:
        return gbs::RenderLayerBG3;
    case gbs::VisualEffectTarget::Obj:
        return gbs::RenderLayerOBJ;
    case gbs::VisualEffectTarget::All:
    case gbs::VisualEffectTarget::Screen:
    default:
        return 0x3F;
    }
}

void set_target_bg_mosaic(gbs::VisualEffectTarget target, bool enabled) {
    if (target == gbs::VisualEffectTarget::All || target == gbs::VisualEffectTarget::Screen) {
        gbs::set_bg_mosaic(gbs::BackgroundLayer::BG0, enabled);
        gbs::set_bg_mosaic(gbs::BackgroundLayer::BG1, enabled);
        gbs::set_bg_mosaic(gbs::BackgroundLayer::BG2, enabled);
        gbs::set_bg_mosaic(gbs::BackgroundLayer::BG3, enabled);
        return;
    }
    if (target >= gbs::VisualEffectTarget::Bg0 && target <= gbs::VisualEffectTarget::Bg3) {
        const int layer = static_cast<int>(target) - static_cast<int>(gbs::VisualEffectTarget::Bg0);
        gbs::set_bg_mosaic(static_cast<gbs::BackgroundLayer>(layer), enabled);
    }
}

gbs::BackgroundLayer hblank_target_layer(gbs::VisualEffectTarget target) {
    if (target >= gbs::VisualEffectTarget::Bg0 && target <= gbs::VisualEffectTarget::Bg3) {
        return static_cast<gbs::BackgroundLayer>(
            static_cast<int>(target) - static_cast<int>(gbs::VisualEffectTarget::Bg0)
        );
    }
    return gbs::BackgroundLayer::BG1;
}

void build_hblank_scroll_offsets(const gbs::VisualEffectsController& controller) {
    const int amplitude = clamp_value((static_cast<int>(controller.intensity) * 12) / 100, 1, 12);
    for (int scanline = 0; scanline < 160; ++scanline) {
        const int phase = (scanline + static_cast<int>(controller.elapsed_frames) * 3) & 31;
        const int triangle = phase < 16 ? phase : 31 - phase;
        int offset = ((triangle * 2 - 15) * amplitude) / 15;
        if (controller.kind == gbs::VisualEffectKind::WaterRipple) {
            offset = (offset * (4 + (scanline & 7))) / 11;
        } else if (controller.kind == gbs::VisualEffectKind::ParallaxLineScroll) {
            offset = (offset * scanline) / 159;
        }
        hblank_scroll_offsets[scanline] = static_cast<int16_t>(offset);
    }
}

int transition_distance(const gbs::VisualEffectsController& controller) {
    const gbs::Fixed progress = gbs::tween_progress(
        controller.elapsed_frames,
        controller.duration_frames,
        gbs::Easing::EaseInOut
    );
    const int intensity = static_cast<int>(controller.intensity);
    return (240 * progress.raw() * intensity) / (gbs::Fixed::scale * 100);
}

int transition_offset(const gbs::VisualEffectsController& controller) {
    const int progressed_distance = transition_distance(controller);
    const int distance = controller.transition_phase && !controller.cover
        ? (240 * static_cast<int>(controller.intensity)) / 100 - progressed_distance
        : progressed_distance;
    const int sign = controller.direction == gbs::TransitionDirection::Left ? -1 : 1;
    if (controller.kind == gbs::VisualEffectKind::Pull) {
        return -sign * distance;
    }
    return sign * distance;
}

void build_transition_scroll_offsets(const gbs::VisualEffectsController& controller) {
    const int16_t offset = static_cast<int16_t>(transition_offset(controller));
    for (int scanline = 0; scanline < 160; ++scanline) {
        hblank_scroll_offsets[scanline] = offset;
    }
}

} // namespace

namespace gbs {

namespace {

VisualEffectsController& scene_transition_controller() {
    if (!scene_transition_effects_initialized) {
        init_visual_effects(scene_transition_effects);
        scene_transition_effects_initialized = true;
    }
    return scene_transition_effects;
}

} // namespace

void init_visual_effects(VisualEffectsController& controller) {
    controller.kind = VisualEffectKind::Clear;
    controller.target = VisualEffectTarget::All;
    controller.duration_frames = 0;
    controller.remaining_frames = 0;
    controller.elapsed_frames = 0;
    controller.intensity = 0;
    controller.direction = TransitionDirection::Left;
    controller.transition_phase = false;
    controller.cover = false;
    controller.active = false;
}

void reset_visual_effect_rendering() {
    disable_blending();
    disable_mosaic();
    disable_window0();
    set_target_bg_mosaic(VisualEffectTarget::All, false);
    disable_hblank_effects();
}

void stop_visual_effect(VisualEffectsController& controller) {
    reset_visual_effect_rendering();
    init_visual_effects(controller);
}

void start_visual_effect(
    VisualEffectsController& controller,
    VisualEffectKind kind,
    VisualEffectTarget target,
    int frames,
    int intensity
) {
    start_visual_transition(controller, kind, target, frames, intensity, TransitionDirection::Left);
}

void start_visual_effect_phase(
    VisualEffectsController& controller,
    VisualEffectKind kind,
    VisualEffectTarget target,
    int frames,
    int intensity,
    bool cover
) {
    start_visual_effect(controller, kind, target, frames, intensity);
    if (!controller.active) return;
    controller.transition_phase = true;
    controller.cover = cover;
}

void start_visual_transition(
    VisualEffectsController& controller,
    VisualEffectKind kind,
    VisualEffectTarget target,
    int frames,
    int intensity,
    TransitionDirection direction
) {
    reset_visual_effect_rendering();
    init_visual_effects(controller);
    if (kind == VisualEffectKind::Clear || frames <= 0) return;
    controller.kind = kind;
    controller.target = target;
    controller.duration_frames = static_cast<uint16_t>(clamp_value(frames, 1, 3600));
    controller.remaining_frames = controller.duration_frames;
    controller.intensity = static_cast<uint8_t>(clamp_value(intensity, 0, 100));
    controller.direction = direction;
    controller.active = true;
}

bool consume_visual_effect_event(EventState& event_state, VisualEffectsController& controller) {
    if (!event_state.visual_effect_changed) return false;
    const int phase = event_state.visual_effect_phase;
    consume_scene_transition_visual_effect_event(event_state);
    event_state.visual_effect_changed = false;
    if (phase == 1 || phase == 2) {
        start_visual_effect_phase(
            controller,
            static_cast<VisualEffectKind>(event_state.visual_effect_kind),
            static_cast<VisualEffectTarget>(event_state.visual_effect_target),
            event_state.visual_effect_frames,
            event_state.visual_effect_intensity,
            phase == 1
        );
    } else {
        start_visual_effect(
            controller,
            static_cast<VisualEffectKind>(event_state.visual_effect_kind),
            static_cast<VisualEffectTarget>(event_state.visual_effect_target),
            event_state.visual_effect_frames,
            event_state.visual_effect_intensity
        );
    }
    event_state.visual_effect_phase = 0;
    return true;
}

bool consume_scene_transition_visual_effect_event(EventState& event_state) {
    if (!event_state.visual_effect_changed ||
        (event_state.visual_effect_phase != 1 && event_state.visual_effect_phase != 2)) {
        return false;
    }
    VisualEffectsController& controller = scene_transition_controller();
    start_visual_effect_phase(
        controller,
        static_cast<VisualEffectKind>(event_state.visual_effect_kind),
        static_cast<VisualEffectTarget>(event_state.visual_effect_target),
        event_state.visual_effect_frames,
        event_state.visual_effect_intensity,
        event_state.visual_effect_phase == 1
    );
    // A phase is a one-shot command; runtimes may consume outputs every frame.
    event_state.visual_effect_changed = false;
    event_state.visual_effect_phase = 0;
    return true;
}

void reset_scene_transition_visual_effects() {
    VisualEffectsController& controller = scene_transition_controller();
    stop_visual_effect(controller);
}

void render_scene_transition_visual_effects() {
    if (!scene_transition_effects_initialized) return;
    render_visual_effects(scene_transition_effects);
}

void tick_scene_transition_visual_effects() {
    if (!scene_transition_effects_initialized) return;
    tick_visual_effects(scene_transition_effects);
}

void render_visual_effects(const VisualEffectsController& controller) {
    if (!controller.active) return;
    switch (controller.kind) {
    case VisualEffectKind::PaletteFlash:
    case VisualEffectKind::ColorFade: {
        const int progress = visual_effect_progress(controller).raw();
        const int amount = controller.transition_phase
            ? (controller.cover ? progress : Fixed::scale - progress)
            : Fixed::scale;
        set_blending(BlendConfig {
            render_mask(controller.target),
            0,
            BlendMode::Brighten,
            0,
            0,
            static_cast<uint8_t>((static_cast<int>(controller.intensity) * amount * 16) /
                (100 * Fixed::scale))
        });
        break;
    }
    case VisualEffectKind::Fade: {
        const int progress = visual_effect_progress(controller).raw();
        const int amount = controller.transition_phase
            ? (controller.cover ? progress : Fixed::scale - progress)
            : Fixed::scale;
        set_blending(BlendConfig {
            render_mask(controller.target),
            0,
            BlendMode::Darken,
            0,
            0,
            static_cast<uint8_t>((amount * 16) / Fixed::scale)
        });
        break;
    }
    case VisualEffectKind::Mosaic: {
        const int progress = visual_effect_progress(controller).raw();
        const int amount = controller.transition_phase
            ? (controller.cover ? progress : Fixed::scale - progress)
            : Fixed::scale;
        const uint8_t size = static_cast<uint8_t>((static_cast<int>(controller.intensity) * amount * 15) /
            (100 * Fixed::scale));
        const bool object_target = controller.target == VisualEffectTarget::Obj ||
            controller.target == VisualEffectTarget::All ||
            controller.target == VisualEffectTarget::Screen;
        const bool background_target = controller.target != VisualEffectTarget::Obj;
        set_mosaic(MosaicConfig {
            background_target ? size : static_cast<uint8_t>(0),
            background_target ? size : static_cast<uint8_t>(0),
            object_target ? size : static_cast<uint8_t>(0),
            object_target ? size : static_cast<uint8_t>(0)
        });
        set_target_bg_mosaic(controller.target, true);
        break;
    }
    case VisualEffectKind::Letterbox: {
        const uint8_t bar = static_cast<uint8_t>((static_cast<int>(controller.intensity) * 64) / 100);
        set_window0(WindowConfig {
            WindowRect { 0, 240, bar, static_cast<uint8_t>(160 - bar) },
            0x3F,
            0,
            true
        });
        break;
    }
    case VisualEffectKind::Clear:
        break;
    case VisualEffectKind::Wave:
    case VisualEffectKind::WaterRipple:
    case VisualEffectKind::ParallaxLineScroll:
        build_hblank_scroll_offsets(controller);
        set_hblank_bg_scroll(hblank_target_layer(controller.target), hblank_scroll_offsets, 160);
        break;
    case VisualEffectKind::Push:
    case VisualEffectKind::Pull:
        build_transition_scroll_offsets(controller);
        set_hblank_bg_scroll(hblank_target_layer(controller.target), hblank_scroll_offsets, 160);
        if (!controller.transition_phase) break;
        // The window covers UI and sprites while the background slides.
        [[fallthrough]];
    case VisualEffectKind::Mask: {
        const int distance = transition_distance(controller);
        const int width = controller.transition_phase && controller.cover ? 240 - distance : distance;
        const int visible_width = width > 0 ? width : 1;
        const uint8_t left = controller.direction == TransitionDirection::Left
            ? 0
            : static_cast<uint8_t>(240 - visible_width);
        const uint8_t right = controller.direction == TransitionDirection::Left
            ? static_cast<uint8_t>(visible_width)
            : 240;
        if (visible_width >= 240) {
            set_window0(WindowConfig {
                WindowRect { 0, 240, 0, 160 },
                render_mask(controller.target),
                0,
                true
            });
        } else {
            set_window0(WindowConfig {
                WindowRect { left, right, 0, 160 },
                render_mask(controller.target),
                0,
                true
            });
        }
        break;
    }
    }
}

void tick_visual_effects(VisualEffectsController& controller) {
    if (!controller.active) return;
    if (controller.remaining_frames > 0) --controller.remaining_frames;
    if (controller.elapsed_frames < 0xFFFF) ++controller.elapsed_frames;
    if (controller.remaining_frames == 0) {
        // A cover phase must remain opaque while the event script performs
        // the room swap. The following reveal phase owns the teardown.
        if (controller.transition_phase && controller.cover) return;
        stop_visual_effect(controller);
    }
}

Vec2i visual_effect_scroll_offset(const VisualEffectsController& controller) {
    if (!controller.active) return Vec2i { 0, 0 };
    if (controller.kind == VisualEffectKind::Push || controller.kind == VisualEffectKind::Pull) {
        return Vec2i { transition_offset(controller), 0 };
    }
    if (controller.kind != VisualEffectKind::Wave &&
        controller.kind != VisualEffectKind::WaterRipple &&
        controller.kind != VisualEffectKind::ParallaxLineScroll) {
        return Vec2i { 0, 0 };
    }
    const int phase = controller.elapsed_frames % 16;
    const int triangle = phase < 8 ? phase : 15 - phase;
    const int centered = triangle * 2 - 7;
    const int amplitude = clamp_value((static_cast<int>(controller.intensity) * 8) / 100, 1, 8);
    const int offset = (centered * amplitude) / 7;
    if (controller.kind == VisualEffectKind::WaterRipple) return Vec2i { offset, -offset / 2 };
    return Vec2i { offset, 0 };
}

Fixed visual_effect_progress(const VisualEffectsController& controller, Easing easing) {
    if (!controller.active) {
        return Fixed::zero();
    }
    return tween_progress(controller.elapsed_frames, controller.duration_frames, easing);
}

bool visual_effect_targets_background(const VisualEffectsController& controller, BackgroundLayer layer) {
    if (!controller.active) return false;
    if (controller.target == VisualEffectTarget::All || controller.target == VisualEffectTarget::Screen) return true;
    const int expected = static_cast<int>(controller.target) - static_cast<int>(VisualEffectTarget::Bg0);
    return expected >= 0 && expected <= 3 && expected == static_cast<int>(layer);
}

bool visual_effect_sprite_mosaic_enabled(const VisualEffectsController& controller) {
    return controller.active &&
        controller.kind == VisualEffectKind::Mosaic &&
        (controller.target == VisualEffectTarget::Obj ||
         controller.target == VisualEffectTarget::All ||
         controller.target == VisualEffectTarget::Screen);
}

} // namespace gbs
