#include "gbs/racing_feedback.hpp"
#include <cassert>
int main() {
    gbs::RacingRuntimeState before {}, after {};
    const gbs::RacingActionSounds sounds {10,11,12,13};
    gbs::RacingInput accelerate {true,false,0,false}, brake {false,true,0,false}, none {};
    assert(gbs::racing_action_sound(before,after,accelerate,none,sounds)==10);
    assert(gbs::racing_action_sound(before,after,accelerate,accelerate,sounds)==-1);
    before.speed_x256=512;
    assert(gbs::racing_action_sound(before,after,brake,none,sounds)==11);
    assert(gbs::racing_action_sound(before,after,brake,brake,sounds)==-1);
    after.collision_frames=12;
    assert(gbs::racing_action_sound(before,after,brake,none,sounds)==12);
    before.collision_frames=13;
    assert(gbs::racing_action_sound(before,after,none,none,sounds)==-1);
    after.checkpoint_count=1;
    assert(gbs::racing_action_sound(before,after,accelerate,none,sounds)==13);
    after.race_result=static_cast<uint8_t>(gbs::RacingRaceResult::Victory);
    assert(gbs::racing_action_sound(before,after,accelerate,none,sounds)==-1);
}
