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

int main() {
    test_sprite_animation_validation();
    test_looping_animation_advances();
    test_select_sprite_animation_keeps_first_frame_paused_until_played();
    test_scaled_animation_update_advances_faster_and_slower();
    test_non_looping_animation_stops_on_last_frame();
    test_set_sprite_animation_frame_selects_valid_frame();
    return 0;
}
