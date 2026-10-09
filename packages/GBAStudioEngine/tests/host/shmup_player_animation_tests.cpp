#include <cassert>
#include "gbs/shmup.hpp"

namespace {
constexpr gbs::MetaSpritePart parts[] = { { 0, 0, 0, 0, false, false } };
constexpr gbs::SpriteAnimationFrame frames[] = {
    { { parts, 1 }, 2 }, { { parts, 1 }, 2 }, { { parts, 1 }, 2 }
};
constexpr gbs::SpriteAnimation idle { frames, 1, false };
constexpr gbs::SpriteAnimation fly { frames, 3, true };
constexpr gbs::SpriteAnimation up { frames, 2, true };
constexpr gbs::SpriteAnimation down { frames, 2, true };
constexpr gbs::SpriteAnimation shoot { frames, 2, false };
constexpr gbs::SpriteAnimation hurt { frames, 2, false };
constexpr gbs::SpriteAnimation explosion { frames, 3, false };
constexpr gbs::ShmupPlayerAnimationSet clips { &idle, &fly, &up, &down, &shoot, &hurt, &explosion };

void test_movement_and_idle() {
    gbs::ShmupPlayerAnimator player {};
    gbs::init_shmup_player_animator(player);
    gbs::update_shmup_player_animator(player, clips, { 0, 0 }, false, false, true);
    assert(player.animator.animation == &idle);
    for (int tick = 0; tick < 90; ++tick)
        gbs::update_shmup_player_animator(player, clips, { 0, 0 }, false, false, true);
    assert(player.animator.frame_index == 0 && !player.animator.playing);
    gbs::update_shmup_player_animator(player, clips, { -2, 0 }, false, false, true);
    assert(player.animator.animation == &fly);
    for (int tick = 0; tick < 2; ++tick)
        gbs::update_shmup_player_animator(player, clips, { -2, 0 }, false, false, true);
    assert(player.animator.frame_index == 1);
    gbs::update_shmup_player_animator(player, clips, { 2, -2 }, false, false, true);
    assert(player.animator.animation == &up);
    gbs::update_shmup_player_animator(player, clips, { 2, 2 }, false, false, true);
    assert(player.animator.animation == &down);
    gbs::update_shmup_player_animator(player, clips, { 0, 0 }, false, false, true);
    assert(player.animator.animation == &idle && player.animator.frame_index == 0);
}

void test_one_shots_finish_and_damage_wins() {
    gbs::ShmupPlayerAnimator player {};
    gbs::init_shmup_player_animator(player);
    gbs::update_shmup_player_animator(player, clips, { 2, 0 }, true, false, true);
    assert(player.animator.animation == &shoot && player.animator.frame_index == 0);
    for (int tick = 0; tick < 2; ++tick)
        gbs::update_shmup_player_animator(player, clips, { 2, 0 }, true, false, true);
    assert(player.animator.frame_index == 1); // Repeated fire must not restart the first frame.
    gbs::update_shmup_player_animator(player, clips, { 0, 0 }, true, true, true);
    assert(player.animator.animation == &hurt);
    for (int tick = 0; tick < 3; ++tick)
        gbs::update_shmup_player_animator(player, clips, { 0, 0 }, true, false, true);
    assert(player.animator.animation == &hurt && player.animator.frame_index == 1);
    gbs::update_shmup_player_animator(player, clips, { 0, 0 }, false, false, true);
    assert(player.animator.animation == &idle);
    gbs::update_shmup_player_animator(player, clips, { 0, 0 }, false, true, false);
    assert(player.animator.animation == &explosion);
    for (int tick = 0; tick < 5; ++tick)
        gbs::update_shmup_player_animator(player, clips, { 0, 0 }, true, false, false);
    assert(player.animator.frame_index == 2 && player.animator.playing);
    gbs::update_shmup_player_animator(player, clips, { 0, 0 }, false, false, false);
    assert(!player.animator.playing);
    for (int tick = 0; tick < 10; ++tick)
        gbs::update_shmup_player_animator(player, clips, { 0, 0 }, true, false, false);
    assert(!player.animator.playing); // Death never loops or restarts.
}

void test_optional_clips_and_invalid_contract() {
    gbs::ShmupPlayerAnimator player {};
    gbs::init_shmup_player_animator(player);
    constexpr gbs::ShmupPlayerAnimationSet sparse { &idle, &fly };
    gbs::update_shmup_player_animator(player, sparse, { 0, -2 }, true, true, true);
    assert(player.animator.animation == &fly);
    constexpr gbs::ShmupPlayerAnimationSet empty {};
    gbs::update_shmup_player_animator(player, empty, { 0, 0 }, false, false, true);
    assert(player.animator.animation == nullptr);
    auto invalid = clips;
    invalid.explosion = &fly;
    assert(!gbs::is_valid_shmup_player_animation_set(invalid));
    assert(gbs::is_valid_shmup_player_animation_set(clips));
    assert(gbs::is_valid_shmup_player_animation_set(empty));
}
}

int main() {
    test_movement_and_idle();
    test_one_shots_finish_and_damage_wins();
    test_optional_clips_and_invalid_contract();
}
