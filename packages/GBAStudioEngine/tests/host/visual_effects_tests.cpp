#include <cassert>
#include "gbs/visual_effects.hpp"

namespace {

int blend_calls = 0;
int mosaic_calls = 0;
int window_calls = 0;
int reset_calls = 0;
int hblank_calls = 0;
int hblank_disable_calls = 0;
int16_t first_hblank_offset = 0;
int16_t middle_hblank_offset = 0;
gbs::BlendConfig last_blend {};
gbs::MosaicConfig last_mosaic {};
gbs::WindowConfig last_window {};

} // namespace

namespace gbs {

void set_blending(const BlendConfig& config) {
    ++blend_calls;
    last_blend = config;
}

void disable_blending() { ++reset_calls; }
void set_mosaic(const MosaicConfig& config) {
    ++mosaic_calls;
    last_mosaic = config;
}
void disable_mosaic() { ++reset_calls; }
void set_window0(const WindowConfig& config) {
    ++window_calls;
    last_window = config;
}
void disable_window0() { ++reset_calls; }
void set_bg_mosaic(BackgroundLayer, bool) {}
bool set_hblank_bg_scroll(BackgroundLayer, const int16_t* offsets, size_t count) {
    ++hblank_calls;
    first_hblank_offset = count > 0 ? offsets[0] : 0;
    middle_hblank_offset = count > 80 ? offsets[80] : 0;
    return count == 160;
}
void disable_hblank_effects() { ++hblank_disable_calls; }

} // namespace gbs

namespace {

void reset_spy() {
    blend_calls = 0;
    mosaic_calls = 0;
    window_calls = 0;
    reset_calls = 0;
    hblank_calls = 0;
    hblank_disable_calls = 0;
}

void test_palette_flash_consumes_event_and_restores_render_state() {
    gbs::EventState event_state {};
    gbs::init_event_state(event_state);
    event_state.visual_effect_changed = true;
    event_state.visual_effect_kind = static_cast<int>(gbs::VisualEffectKind::PaletteFlash);
    event_state.visual_effect_target = static_cast<int>(gbs::VisualEffectTarget::Bg0);
    event_state.visual_effect_frames = 2;
    event_state.visual_effect_intensity = 70;

    gbs::VisualEffectsController controller {};
    gbs::init_visual_effects(controller);
    reset_spy();
    assert(gbs::consume_visual_effect_event(event_state, controller));
    assert(!event_state.visual_effect_changed);
    assert(controller.active);

    gbs::render_visual_effects(controller);
    assert(blend_calls == 1);
    assert(last_blend.first_targets == gbs::RenderLayerBG0);
    assert(last_blend.mode == gbs::BlendMode::Brighten);
    assert(last_blend.intensity == 11);

    gbs::tick_visual_effects(controller);
    assert(controller.active);
    gbs::tick_visual_effects(controller);
    assert(!controller.active);
    assert(reset_calls >= 3);
}

void test_mosaic_and_wave_expose_hardware_and_scroll_outputs() {
    gbs::VisualEffectsController controller {};
    gbs::init_visual_effects(controller);
    reset_spy();

    gbs::start_visual_effect(
        controller,
        gbs::VisualEffectKind::Mosaic,
        gbs::VisualEffectTarget::Bg2,
        30,
        80
    );
    gbs::render_visual_effects(controller);
    assert(mosaic_calls == 1);
    assert(last_mosaic.bg_x == 12);
    assert(last_mosaic.bg_y == 12);

    gbs::start_visual_effect(
        controller,
        gbs::VisualEffectKind::Wave,
        gbs::VisualEffectTarget::Bg1,
        60,
        50
    );
    assert(gbs::visual_effect_targets_background(controller, gbs::BackgroundLayer::BG1));
    assert(!gbs::visual_effect_targets_background(controller, gbs::BackgroundLayer::BG2));
    const gbs::Vec2i before = gbs::visual_effect_scroll_offset(controller);
    gbs::tick_visual_effects(controller);
    const gbs::Vec2i after = gbs::visual_effect_scroll_offset(controller);
    assert(before.x != after.x || before.y != after.y);
    gbs::render_visual_effects(controller);
    assert(hblank_calls == 1);
    assert(first_hblank_offset != middle_hblank_offset);
    gbs::stop_visual_effect(controller);
    assert(hblank_disable_calls > 0);
}

void test_push_pull_and_mask_transitions_are_progressive() {
    gbs::VisualEffectsController controller {};
    gbs::init_visual_effects(controller);
    gbs::start_visual_transition(
        controller,
        gbs::VisualEffectKind::Push,
        gbs::VisualEffectTarget::Bg1,
        10,
        100,
        gbs::TransitionDirection::Right
    );
    assert(gbs::visual_effect_progress(controller).raw() == 0);
    assert(gbs::visual_effect_scroll_offset(controller).x == 0);
    gbs::tick_visual_effects(controller);
    assert(gbs::visual_effect_scroll_offset(controller).x > 0);
    reset_spy();
    gbs::render_visual_effects(controller);
    assert(hblank_calls == 1);
    assert(first_hblank_offset > 0);

    gbs::start_visual_transition(
        controller,
        gbs::VisualEffectKind::Mask,
        gbs::VisualEffectTarget::All,
        10,
        100,
        gbs::TransitionDirection::Left
    );
    reset_spy();
    gbs::render_visual_effects(controller);
    assert(window_calls == 1);
    assert(last_window.rect.right == 1);
    gbs::tick_visual_effects(controller);
    reset_spy();
    gbs::render_visual_effects(controller);
    assert(last_window.rect.right > 0);
}

void test_slide_reveal_returns_to_the_origin_and_covers_all_layers() {
    gbs::VisualEffectsController controller {};
    gbs::start_visual_effect_phase(controller, gbs::VisualEffectKind::Push,
        gbs::VisualEffectTarget::All, 10, 100, true);
    assert(gbs::visual_effect_scroll_offset(controller).x == 0);
    for (int frame = 0; frame < 10; ++frame) gbs::tick_visual_effects(controller);
    assert(gbs::visual_effect_scroll_offset(controller).x == -240);
    reset_spy();
    gbs::render_visual_effects(controller);
    assert(window_calls == 1);
    assert(last_window.rect.right == 1);
    gbs::start_visual_effect_phase(controller, gbs::VisualEffectKind::Push,
        gbs::VisualEffectTarget::All, 10, 100, false);
    assert(gbs::visual_effect_scroll_offset(controller).x == -240);
    for (int frame = 0; frame < 9; ++frame) gbs::tick_visual_effects(controller);
    assert(gbs::visual_effect_scroll_offset(controller).x > -60);
    gbs::tick_visual_effects(controller);
    assert(gbs::visual_effect_scroll_offset(controller).x == 0);
}

void test_scene_transition_cover_is_held_until_reveal() {
    gbs::EventState event_state {};
    gbs::init_event_state(event_state);
    event_state.visual_effect_changed = true;
    event_state.visual_effect_kind = static_cast<int>(gbs::VisualEffectKind::Mask);
    event_state.visual_effect_target = static_cast<int>(gbs::VisualEffectTarget::All);
    event_state.visual_effect_frames = 2;
    event_state.visual_effect_intensity = 100;
    event_state.visual_effect_phase = 1;

    gbs::VisualEffectsController controller {};
    gbs::init_visual_effects(controller);
    assert(gbs::consume_visual_effect_event(event_state, controller));
    reset_spy();
    gbs::render_visual_effects(controller);
    assert(last_window.rect.right == 240);
    gbs::tick_visual_effects(controller);
    gbs::tick_visual_effects(controller);
    assert(controller.active);

    event_state.visual_effect_changed = true;
    event_state.visual_effect_phase = 2;
    assert(gbs::consume_visual_effect_event(event_state, controller));
    reset_spy();
    gbs::render_visual_effects(controller);
    assert(last_window.rect.right == 1);
    gbs::tick_visual_effects(controller);
    gbs::tick_visual_effects(controller);
    assert(!controller.active);
}

void test_common_scene_transition_compositor_mirrors_phase_events() {
    gbs::EventState event_state {};
    gbs::init_event_state(event_state);
    event_state.visual_effect_changed = true;
    event_state.visual_effect_kind = static_cast<int>(gbs::VisualEffectKind::Mask);
    event_state.visual_effect_target = static_cast<int>(gbs::VisualEffectTarget::All);
    event_state.visual_effect_frames = 4;
    event_state.visual_effect_intensity = 100;
    event_state.visual_effect_phase = 1;

    gbs::reset_scene_transition_visual_effects();
    reset_spy();
    assert(gbs::consume_scene_transition_visual_effect_event(event_state));
    assert(!gbs::consume_scene_transition_visual_effect_event(event_state));
    gbs::render_scene_transition_visual_effects();
    assert(window_calls == 1);
    assert(last_window.rect.right == 240);

    gbs::tick_scene_transition_visual_effects();
    event_state.visual_effect_changed = true;
    event_state.visual_effect_phase = 2;
    assert(gbs::consume_scene_transition_visual_effect_event(event_state));
    reset_spy();
    gbs::render_scene_transition_visual_effects();
    assert(window_calls == 1);
    assert(last_window.rect.right == 1);
    gbs::reset_scene_transition_visual_effects();
}

} // namespace

int main() {
    test_palette_flash_consumes_event_and_restores_render_state();
    test_mosaic_and_wave_expose_hardware_and_scroll_outputs();
    test_push_pull_and_mask_transitions_are_progressive();
    test_slide_reveal_returns_to_the_origin_and_covers_all_layers();
    test_scene_transition_cover_is_held_until_reveal();
    test_common_scene_transition_compositor_mirrors_phase_events();
    return 0;
}
