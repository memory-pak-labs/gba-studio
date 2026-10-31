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
gbs::WindowConfig last_window1 {};
int window1_disable_calls = 0;
int circular_window_calls = 0;
int circular_window_disable_calls = 0;
int window1_calls = 0;
uint16_t circular_bounds[161] {};

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
void set_window1(const WindowConfig& config) { ++window1_calls;last_window1 = config; }
void disable_window1() { ++window1_disable_calls; }
bool set_hblank_window1(const uint16_t* bounds, size_t count) {
    ++circular_window_calls;
    assert(count == 161);
    for (size_t i=0;i<count;++i) circular_bounds[i]=bounds[i];
    return true;
}
void disable_hblank_window1() { ++circular_window_disable_calls; }
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

void test_fade_intensity_and_fully_closed_mask() {
    gbs::VisualEffectsController effect {};
    gbs::init_visual_effects(effect);
    gbs::start_visual_effect(effect, gbs::VisualEffectKind::Fade, gbs::VisualEffectTarget::All, 30, 50);
    gbs::render_visual_effects(effect);
    assert(last_blend.intensity == 8);
    gbs::start_visual_effect_phase(effect, gbs::VisualEffectKind::Mask, gbs::VisualEffectTarget::All, 2, 100, true);
    gbs::tick_visual_effects(effect);
    gbs::tick_visual_effects(effect);
    gbs::render_visual_effects(effect);
    assert(effect.active); // Cover remains in place until the scene reveal.
    assert(last_window.inside_mask == 0 && last_window.outside_mask == 0);
    assert(last_window.rect.left == 0 && last_window.rect.right == 240);
}

void test_visibility_event_is_independent_of_fade_output() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        {gbs::EventOp::VisualEffect, gbs::pack_visual_effect(gbs::VisualEffectKind::Fade, gbs::VisualEffectTarget::All), 10, 50, 0},
        {gbs::EventOp::Visibility, 2, static_cast<int16_t>((80 << 8) | 64), 180, 75}
    };
    gbs::run_event_script(state, commands, 2);
    assert(state.visual_effect_changed && state.visual_effect_frames == 10);
    gbs::consume_visibility_event_commands(state);
    assert(gbs::visibility_effect().active && gbs::visibility_effect().actor == 2);
    assert(gbs::visibility_effect().width == 80 && gbs::visibility_effect().height == 64);
    assert(gbs::visibility_effect().remaining_frames == 180);
    assert(state.visual_effect_changed); // The fade output remains available.
    gbs::stop_visibility_effect();
}

void test_circular_lantern_follows_clips_and_releases_only_its_raster() {
    gbs::EventState state {};gbs::init_event_state(state);
    const gbs::EventCommand command {gbs::EventOp::Visibility,-1,static_cast<int16_t>((120<<8)|120),3600,58|256};
    gbs::run_event_script(state,&command,1);gbs::consume_visibility_event_commands(state);
    assert(gbs::visibility_effect().circular);
    gbs::VisualEffectsController other {};gbs::init_visual_effects(other);
    gbs::render_visibility_effects({120,80},other);
    assert(circular_window_calls>0);
    assert(circular_bounds[20]==0 && circular_bounds[160]==0);
    assert((circular_bounds[80]>>8)==60 && (circular_bounds[80]&255)==180);
    assert((circular_bounds[44]>>8)==72 && (circular_bounds[44]&255)==168);
    const int window_writes=window1_calls;
    gbs::render_visibility_effects({10,10},other);
    assert(window1_calls==window_writes); // A mid-scanline WIN1H write tears the circle.
    assert((circular_bounds[10]>>8)==0 && (circular_bounds[10]&255)==70);
    const int calls=circular_window_calls,stops=circular_window_disable_calls;
    gbs::start_visual_effect(other,gbs::VisualEffectKind::Wave,gbs::VisualEffectTarget::Bg3,30,50);
    assert(gbs::visibility_render_status(other)==gbs::VisibilityRenderStatus::EffectOwnsResources);
    gbs::render_visibility_effects({120,80},other);
    assert(circular_window_calls==calls && circular_window_disable_calls>stops);
    gbs::stop_visibility_effect();gbs::stop_visual_effect(other);
    gbs::start_visibility_effect(-1,80,64,75,180,false);
    assert(!gbs::visibility_effect().circular);
    gbs::render_visibility_effects({120,80},other);
    assert(circular_window_calls==calls);
    gbs::stop_visibility_effect();
}

void test_visibility_follows_actor_and_reveals_without_overriding_transitions() {
    gbs::VisualEffectsController other {};
    gbs::init_visual_effects(other);
    gbs::start_visibility_effect(-1, 80, 64, 75, 10, false);
    assert(gbs::visibility_effect().actor == -1);
    gbs::render_visibility_effects({100, 70}, other);
    assert(last_window1.rect.left == 60 && last_window1.rect.right == 140);
    assert(last_window1.rect.top == 38 && last_window1.rect.bottom == 102);
    assert(last_window1.inside_mask == 0x1F && last_window1.outside_mask == 0x3F);
    assert(last_blend.mode == gbs::BlendMode::Darken && last_blend.intensity == 12);
    gbs::render_visibility_effects({120, 80}, other);
    assert(last_window1.rect.left == 80 && last_window1.rect.top == 48);
    gbs::start_visual_effect(other, gbs::VisualEffectKind::Mask, gbs::VisualEffectTarget::All, 5, 100);
    gbs::render_visual_effects(other);
    const int calls = blend_calls;
    const auto mask = last_window;
    gbs::render_visibility_effects({120, 80}, other);
    assert(blend_calls == calls);
    assert(last_window.rect.right == mask.rect.right);
    assert(window1_disable_calls > 0);
    gbs::stop_visual_effect(other);
    gbs::start_visibility_effect(2, 24, 24, 100, 4, true);
    gbs::render_visibility_effects({120, 80}, other);
    const int initial = last_window1.rect.right - last_window1.rect.left;
    gbs::tick_visibility_effects();
    gbs::render_visibility_effects({120, 80}, other);
    assert(last_window1.rect.right - last_window1.rect.left > initial);
    for (int i = 0; i < 3; ++i) gbs::tick_visibility_effects();
    assert(!gbs::visibility_effect().active);
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
    assert(last_window.rect.right == 240 && last_window.inside_mask == 0 && last_window.outside_mask == 0);
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
    assert(last_window.rect.right == 240 && last_window.inside_mask == 0 && last_window.outside_mask == 0);
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
    assert(last_window.rect.right == 240 && last_window.inside_mask == 0 && last_window.outside_mask == 0);
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
    assert(last_window.rect.right == 240 && last_window.inside_mask == 0 && last_window.outside_mask == 0);
    gbs::reset_scene_transition_visual_effects();
}

} // namespace

int main() {
    test_circular_lantern_follows_clips_and_releases_only_its_raster();
    test_fade_intensity_and_fully_closed_mask();
    test_visibility_event_is_independent_of_fade_output();
    test_visibility_follows_actor_and_reveals_without_overriding_transitions();
    test_palette_flash_consumes_event_and_restores_render_state();
    test_mosaic_and_wave_expose_hardware_and_scroll_outputs();
    test_push_pull_and_mask_transitions_are_progressive();
    test_slide_reveal_returns_to_the_origin_and_covers_all_layers();
    test_scene_transition_cover_is_held_until_reveal();
    test_common_scene_transition_compositor_mirrors_phase_events();
    return 0;
}
