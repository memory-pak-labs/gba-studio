#include "gbs/animation.hpp"

namespace gbs {

namespace {

int clamp_animation_speed_percent(int speed_percent) {
    if (speed_percent < 1) {
        return 1;
    }
    if (speed_percent > 400) {
        return 400;
    }
    return speed_percent;
}

void advance_sprite_animator_one_tick(SpriteAnimatorState& state) {
    if (state.frames_remaining > 0) {
        --state.frames_remaining;
    }
    if (state.frames_remaining > 0) {
        return;
    }

    uint8_t next_frame = static_cast<uint8_t>(state.frame_index + 1);
    if (next_frame >= state.animation->frame_count) {
        if (!state.animation->loop) {
            state.playing = false;
            state.frame_index = static_cast<uint8_t>(state.animation->frame_count - 1);
            state.frames_remaining = 0;
            state.frame_progress_x100 = 0;
            return;
        }
        next_frame = 0;
    }

    state.frame_index = next_frame;
    state.frames_remaining = state.animation->frames[state.frame_index].duration_frames;
}

} // namespace

void init_sprite_animator(SpriteAnimatorState& state) {
    state.animation = nullptr;
    state.frame_index = 0;
    state.frames_remaining = 0;
    state.frame_progress_x100 = 0;
    state.playing = false;
}

bool select_sprite_animation(SpriteAnimatorState& state, const SpriteAnimation& animation) {
    if (!is_valid_sprite_animation(animation)) {
        init_sprite_animator(state);
        return false;
    }

    state.animation = &animation;
    state.frame_index = 0;
    state.frames_remaining = animation.frames[0].duration_frames;
    state.frame_progress_x100 = 0;
    state.playing = false;
    return true;
}

bool play_sprite_animation(SpriteAnimatorState& state, const SpriteAnimation& animation) {
    if (!is_valid_sprite_animation(animation)) {
        init_sprite_animator(state);
        return false;
    }

    state.animation = &animation;
    state.frame_index = 0;
    state.frames_remaining = animation.frames[0].duration_frames;
    state.frame_progress_x100 = 0;
    state.playing = true;
    return true;
}

bool set_sprite_animation_frame(SpriteAnimatorState& state, int frame_index) {
    if (state.animation == nullptr ||
        state.animation->frames == nullptr ||
        frame_index < 0 ||
        frame_index >= static_cast<int>(state.animation->frame_count)) {
        return false;
    }

    state.frame_index = static_cast<uint8_t>(frame_index);
    state.frames_remaining = state.animation->frames[state.frame_index].duration_frames;
    state.frame_progress_x100 = 0;
    return true;
}

void stop_sprite_animation(SpriteAnimatorState& state) {
    state.playing = false;
}

void update_sprite_animator(SpriteAnimatorState& state) {
    if (!state.playing || state.animation == nullptr) {
        return;
    }

    advance_sprite_animator_one_tick(state);
}

void update_sprite_animator_scaled(SpriteAnimatorState& state, int speed_percent) {
    if (!state.playing || state.animation == nullptr) {
        return;
    }

    state.frame_progress_x100 = static_cast<uint16_t>(
        state.frame_progress_x100 + clamp_animation_speed_percent(speed_percent)
    );
    while (state.frame_progress_x100 >= 100 && state.playing) {
        state.frame_progress_x100 = static_cast<uint16_t>(state.frame_progress_x100 - 100);
        advance_sprite_animator_one_tick(state);
    }
}

const MetaSprite* current_metasprite(const SpriteAnimatorState& state) {
    if (state.animation == nullptr || state.animation->frames == nullptr || state.animation->frame_count == 0) {
        return nullptr;
    }
    return &state.animation->frames[state.frame_index].metasprite;
}

} // namespace gbs
