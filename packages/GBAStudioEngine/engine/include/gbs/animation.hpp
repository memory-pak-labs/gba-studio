#pragma once

#include "gbs/assets.hpp"
#include "gbs/render.hpp"

namespace gbs {

struct SpriteAnimatorState {
    const SpriteAnimation* animation;
    uint8_t frame_index;
    uint8_t frames_remaining;
    uint16_t frame_progress_x100;
    bool playing;
};

void init_sprite_animator(SpriteAnimatorState& state);
bool select_sprite_animation(SpriteAnimatorState& state, const SpriteAnimation& animation);
bool play_sprite_animation(SpriteAnimatorState& state, const SpriteAnimation& animation);
bool set_sprite_animation_frame(SpriteAnimatorState& state, int frame_index);
void stop_sprite_animation(SpriteAnimatorState& state);
void update_sprite_animator(SpriteAnimatorState& state);
void update_sprite_animator_scaled(SpriteAnimatorState& state, int speed_percent);
const MetaSprite* current_metasprite(const SpriteAnimatorState& state);

// Call in the render phase. Reset loaded_asset after scene/video/resource uploads.
// Each simultaneously animated actor needs an independent resident tile range.
inline bool sync_sprite_animation_tiles(const SpriteAnimatorState& state, const TileAsset*& loaded_asset) {
    if (state.animation == nullptr || state.animation->frames == nullptr || state.animation->frame_count == 0) {
        loaded_asset = nullptr;
        return true;
    }
    if (state.frame_index >= state.animation->frame_count) return false;
    const TileAsset* asset = state.animation->frames[state.frame_index].streamed_tile_asset;
    if (asset == nullptr) {
        loaded_asset = nullptr;
        return true;
    }
    if (asset == loaded_asset) return true;
    if (!load_tiles(*asset)) return false;
    loaded_asset = asset;
    return true;
}

} // namespace gbs
