#include <cassert>
#include "gbs/animation.hpp"

namespace {

void test_sprite_animation_validation() {
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { parts, 1 }, 2 }
    };

    assert(gbs::is_valid_sprite_animation(gbs::SpriteAnimation { frames, 1, true }));
    assert(!gbs::is_valid_sprite_animation(gbs::SpriteAnimation { nullptr, 1, true }));

    const gbs::SpriteAnimationFrame bad_frames[] = {
        { gbs::MetaSprite { parts, 1 }, 0 }
    };
    assert(!gbs::is_valid_sprite_animation(gbs::SpriteAnimation { bad_frames, 1, true }));
}

void test_looping_animation_advances() {
    const gbs::MetaSpritePart first_parts[] = {
        { 0, 0, 4, 0, false, false }
    };
    const gbs::MetaSpritePart second_parts[] = {
        { 0, 0, 8, 0, false, false }
    };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { first_parts, 1 }, 2 },
        { gbs::MetaSprite { second_parts, 1 }, 1 }
    };
    const gbs::SpriteAnimation animation { frames, 2, true };
    gbs::SpriteAnimatorState state;
    gbs::init_sprite_animator(state);

    assert(gbs::play_sprite_animation(state, animation));
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 4);
    gbs::update_sprite_animator(state);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 4);
    gbs::update_sprite_animator(state);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 8);
    gbs::update_sprite_animator(state);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 4);
}

void test_select_sprite_animation_keeps_first_frame_paused_until_played() {
    const gbs::MetaSpritePart first_parts[] = {
        { 0, 0, 4, 0, false, false }
    };
    const gbs::MetaSpritePart second_parts[] = {
        { 0, 0, 8, 0, false, false }
    };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { first_parts, 1 }, 1 },
        { gbs::MetaSprite { second_parts, 1 }, 1 }
    };
    const gbs::SpriteAnimation animation { frames, 2, true };
    gbs::SpriteAnimatorState state;
    gbs::init_sprite_animator(state);

    assert(gbs::select_sprite_animation(state, animation));
    assert(!state.playing);
    gbs::update_sprite_animator(state);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 4);
    assert(gbs::set_sprite_animation_frame(state, 1));
    assert(!state.playing);
    gbs::update_sprite_animator(state);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 8);

    assert(gbs::play_sprite_animation(state, animation));
    gbs::update_sprite_animator(state);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 8);
}

void test_scaled_animation_update_advances_faster_and_slower() {
    const gbs::MetaSpritePart first_parts[] = {
        { 0, 0, 4, 0, false, false }
    };
    const gbs::MetaSpritePart second_parts[] = {
        { 0, 0, 8, 0, false, false }
    };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { first_parts, 1 }, 4 },
        { gbs::MetaSprite { second_parts, 1 }, 4 }
    };
    const gbs::SpriteAnimation animation { frames, 2, true };
    gbs::SpriteAnimatorState state;
    gbs::init_sprite_animator(state);

    assert(gbs::play_sprite_animation(state, animation));
    gbs::update_sprite_animator_scaled(state, 200);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 4);
    gbs::update_sprite_animator_scaled(state, 200);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 8);

    assert(gbs::play_sprite_animation(state, animation));
    for (int index = 0; index < 4; ++index) {
        gbs::update_sprite_animator_scaled(state, 50);
    }
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 4);
    for (int index = 0; index < 4; ++index) {
        gbs::update_sprite_animator_scaled(state, 50);
    }
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 8);
}

void test_non_looping_animation_stops_on_last_frame() {
    const gbs::MetaSpritePart parts[] = {
        { 0, 0, 0, 0, false, false }
    };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { parts, 1 }, 1 }
    };
    const gbs::SpriteAnimation animation { frames, 1, false };
    gbs::SpriteAnimatorState state;

    assert(gbs::play_sprite_animation(state, animation));
    gbs::update_sprite_animator(state);

    assert(!state.playing);
    assert(gbs::current_metasprite(state) != nullptr);
}

void test_set_sprite_animation_frame_selects_valid_frame() {
    const gbs::MetaSpritePart first_parts[] = {
        { 0, 0, 4, 0, false, false }
    };
    const gbs::MetaSpritePart second_parts[] = {
        { 0, 0, 8, 0, false, false }
    };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { first_parts, 1 }, 2 },
        { gbs::MetaSprite { second_parts, 1 }, 3 }
    };
    const gbs::SpriteAnimation animation { frames, 2, true };
    gbs::SpriteAnimatorState state;

    assert(gbs::play_sprite_animation(state, animation));
    assert(gbs::set_sprite_animation_frame(state, 1));
    assert(state.frame_index == 1);
    assert(state.frames_remaining == 3);
    assert(gbs::current_metasprite(state)->parts[0].tile_index == 8);
    assert(!gbs::set_sprite_animation_frame(state, 9));
    assert(state.frame_index == 1);
}

} // namespace

void test_distance_animation_matches_cardinal_and_fractional_diagonal_travel() {
    const gbs::MetaSpritePart parts[] = { { 0, 0, 0, 0, false, false } };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { parts, 1 }, 4 }, { gbs::MetaSprite { parts, 1 }, 4 },
        { gbs::MetaSprite { parts, 1 }, 4 }, { gbs::MetaSprite { parts, 1 }, 4 }
    };
    const gbs::SpriteAnimation animation { frames, 4, true };
    gbs::SpriteAnimatorState horizontal {}, diagonal {}, fast {};
    assert(gbs::play_sprite_animation(horizontal, animation));
    assert(gbs::play_sprite_animation(diagonal, animation));
    assert(gbs::play_sprite_animation(fast, animation));
    int remainder = 128;
    for (int n = 0; n < 64; ++n) {
        gbs::update_sprite_animator_travel(horizontal, { 1, 0 }, 100);
        remainder += 181;
        const int pixels = remainder / 256;
        remainder %= 256;
        gbs::update_sprite_animator_travel(diagonal, { pixels, pixels }, 100);
        if (n % 2 == 0) gbs::update_sprite_animator_travel(fast, { -2, 0 }, 100);
    }
    assert(horizontal.frame_index == fast.frame_index);
    assert(horizontal.frames_remaining == fast.frames_remaining);
    const auto phase = [](const gbs::SpriteAnimatorState& s) {
        return (s.frame_index * 4 + 4 - s.frames_remaining) * 100 + s.frame_progress_x100;
    };
    const int error = (phase(horizontal) - phase(diagonal) + 1600) % 1600;
    assert(error < 100 || error > 1500);
    const auto stopped = diagonal;
    for (int n = 0; n < 20; ++n) gbs::update_sprite_animator_travel(diagonal, { 0, 0 }, 400);
    assert(diagonal.frame_index == stopped.frame_index);
    assert(diagonal.frames_remaining == stopped.frames_remaining);
    assert(diagonal.frame_progress_x100 == stopped.frame_progress_x100);
    assert(gbs::play_sprite_animation(fast, animation));
    gbs::update_sprite_animator_travel(fast, { 2, 0 }, 200);
    assert(fast.frame_index == 1);
}

void test_continuing_walk_keeps_phase_when_facing_changes() {
    const gbs::MetaSpritePart parts[] = { { 0, 0, 0, 0, false, false } };
    const gbs::SpriteAnimationFrame frames[] = {
        { gbs::MetaSprite { parts, 1 }, 4 }, { gbs::MetaSprite { parts, 1 }, 4 },
        { gbs::MetaSprite { parts, 1 }, 4 }, { gbs::MetaSprite { parts, 1 }, 4 }
    };
    const gbs::SpriteAnimation right { frames, 4, true }, down { frames, 4, true };
    gbs::SpriteAnimatorState state {};
    assert(gbs::play_sprite_animation(state, right));
    gbs::update_sprite_animator_travel(state, { 5, 5 }, 100);
    const auto before = state;
    assert(gbs::continue_sprite_animation(state, down));
    assert(state.animation == &down);
    assert(state.frame_index == before.frame_index);
    assert(state.frames_remaining == before.frames_remaining);
    assert(state.frame_progress_x100 == before.frame_progress_x100);
    const gbs::SpriteAnimation idle { frames, 1, true };
    assert(gbs::continue_sprite_animation(state, idle));
    assert(state.frame_index == 0 && state.frames_remaining == 4 && state.frame_progress_x100 == 0);
}

int main() {
    test_distance_animation_matches_cardinal_and_fractional_diagonal_travel();
    test_continuing_walk_keeps_phase_when_facing_changes();
    test_sprite_animation_validation();
    test_looping_animation_advances();
    test_select_sprite_animation_keeps_first_frame_paused_until_played();
    test_scaled_animation_update_advances_faster_and_slower();
    test_non_looping_animation_stops_on_last_frame();
    test_set_sprite_animation_frame_selects_valid_frame();
    return 0;
}
