#include <cassert>
#include "gbs/isometric.hpp"

int main() {
    gbs::SpriteAnimation idle_up {}, idle_down {}, idle_left {}, idle_right {};
    gbs::SpriteAnimation walk_up {}, walk_down {}, walk_left {}, walk_right {};
    gbs::SpriteAnimation legacy_down {}, legacy_walk {};
    gbs::IsoActorAnimationSet clips {};
    clips.idle_down = &legacy_down;
    clips.walk_down = &legacy_walk;
    clips.idle_screen_up = &idle_up;
    clips.idle_screen_down = &idle_down;
    clips.idle_screen_left = &idle_left;
    clips.idle_screen_right = &idle_right;
    clips.walk_screen_up = &walk_up;
    clips.walk_screen_down = &walk_down;
    clips.walk_screen_left = &walk_left;
    clips.walk_screen_right = &walk_right;

    struct Case { gbs::Vec2i delta; const gbs::SpriteAnimation* walking; const gbs::SpriteAnimation* idle; };
    const Case cases[] = {
        {{-1,-1}, &walk_up, &idle_up}, {{1,1}, &walk_down, &idle_down},
        {{-1,1}, &walk_left, &idle_left}, {{1,-1}, &walk_right, &idle_right}
    };
    gbs::IsoActorAnimationState state {};
    for (const auto& item : cases) {
        gbs::set_iso_actor_motion(state, item.delta, true);
        assert(gbs::iso_actor_animation_for(clips, state) == item.walking);
        gbs::set_iso_actor_motion(state, {0,0}, false);
        assert(gbs::iso_actor_animation_for(clips, state) == item.idle);
    }
    // Existing four-view projects continue to choose their authored animation.
    clips.walk_screen_up = nullptr;
    clips.idle_screen_up = nullptr;
    gbs::set_iso_actor_motion(state, {-1,-1}, true);
    assert(gbs::iso_actor_animation_for(clips, state) == &legacy_walk);
    gbs::set_iso_actor_motion(state, {0,0}, false);
    assert(gbs::iso_actor_animation_for(clips, state) == &legacy_down);
    // A tile-edge direction still uses the legacy projected four-view mapping.
    gbs::set_iso_actor_motion(state, {-1,0}, true);
    assert(gbs::iso_actor_animation_for(clips, state) == &legacy_walk);
}
