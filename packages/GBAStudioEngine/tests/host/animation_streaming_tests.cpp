#include <cassert>
#include "gbs/animation.hpp"

namespace {
int uploads = 0;
bool accept_upload = true;
const gbs::TileAsset* uploaded = nullptr;
}
namespace gbs {
bool load_tiles(const TileAsset& asset) {
    ++uploads;
    uploaded = &asset;
    return accept_upload;
}
}
int main() {
    const uint8_t data[32] = {};
    const gbs::TileAsset first {data, 1, 0, true};
    const gbs::TileAsset second {data, 1, 0, true};
    const gbs::MetaSpritePart part {0, 0, 0, 0, false, false};
    const gbs::SpriteAnimationFrame frames[] = {
        {{&part, 1}, 2, &first}, {{&part, 1}, 2, &second}, {{&part, 1}, 2, nullptr}
    };
    const gbs::SpriteAnimation animation {frames, 3, true};
    gbs::SpriteAnimatorState state;
    gbs::play_sprite_animation(state, animation);
    const gbs::TileAsset* loaded = nullptr;
    assert(gbs::sync_sprite_animation_tiles(state, loaded));
    assert(uploads == 1 && uploaded == &first && loaded == &first);
    assert(gbs::sync_sprite_animation_tiles(state, loaded) && uploads == 1);
    gbs::set_sprite_animation_frame(state, 1);
    accept_upload = false;
    assert(!gbs::sync_sprite_animation_tiles(state, loaded) && loaded == &first);
    accept_upload = true;
    assert(gbs::sync_sprite_animation_tiles(state, loaded) && loaded == &second);
    gbs::set_sprite_animation_frame(state, 2);
    assert(gbs::sync_sprite_animation_tiles(state, loaded) && loaded == nullptr);
    state.frame_index = 9;
    assert(!gbs::sync_sprite_animation_tiles(state, loaded));
    gbs::init_sprite_animator(state);
    assert(gbs::sync_sprite_animation_tiles(state, loaded) && loaded == nullptr);
    // Scene/video resets can invalidate the upload even when the clip is unchanged.
    gbs::play_sprite_animation(state, animation);
    loaded = nullptr;
    assert(gbs::sync_sprite_animation_tiles(state, loaded) && loaded == &first);
}
