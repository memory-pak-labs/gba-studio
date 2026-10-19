#include "gbs/cutscene.hpp"

namespace {
constexpr gbs::MetaSpritePart parts[] = {
    { 0, 0, 0, 0, false, false, 8, 8 }, { 0, 0, 2, 0, false, false, 8, 8 }
};
constexpr gbs::SpriteAnimationFrame frames[] = {
    { { &parts[0], 1 }, 8 }, { { &parts[1], 1 }, 8 }
};
constexpr gbs::SpriteAnimation animation { frames, 2, false };
constexpr gbs::CutsceneActorData actors[] = {
    { "animated", &frames[0].metasprite, { 64, 56 }, &animation },
    { "static", &frames[0].metasprite, { 0, 0 } }
};
constexpr gbs::CutsceneSceneData scene { "intro", -1, nullptr, 0, -1,
    gbs::empty_event_script(), gbs::empty_event_script(), nullptr, actors, 2 };
constexpr gbs::CutsceneActorFrameData selection { 0, 1 };
constexpr gbs::CutsceneStepData pose { -1, 6, gbs::empty_event_script(), -1, true,
    true, gbs::empty_event_script(), gbs::no_cutscene_branch(), false, -1, nullptr,
    nullptr, 0, &selection, 1 };
constexpr gbs::CutsceneStepData rest { -1, 60, gbs::empty_event_script(), -1, true };

static_assert(gbs::is_valid_cutscene_actor_frame(scene, selection), "valid explicit pose");
static_assert(!gbs::is_valid_cutscene_actor_frame(scene, { 1, 1 }), "static actor cannot select animation");
static_assert(!gbs::is_valid_cutscene_actor_frame(scene, { 2, 0 }), "missing actor rejected");
static_assert(!gbs::is_valid_cutscene_actor_frame(scene, { 0, 2 }), "past end rejected");
static_assert(gbs::cutscene_actor_frame_for(scene, pose, 0) == &frames[1], "authored pose is selected");
static_assert(gbs::cutscene_actor_frame_for(scene, rest, 0) == &frames[0], "absent selection restores initial pose and its streamed tiles");
static_assert(gbs::cutscene_actor_metasprite_for(scene, pose, 0) == &frames[1].metasprite, "pose overrides initial metasprite");
static_assert(gbs::cutscene_actor_metasprite_for(scene, rest, 0) == actors[0].metasprite, "rest and jumps are deterministic");
static_assert(gbs::cutscene_actor_metasprite_for(scene, pose, 1) == actors[1].metasprite, "other actor remains unchanged");
static_assert(gbs::cutscene_actor_metasprite_for(scene, pose, 2) == nullptr, "invalid actor safe");
}

int main() { return 0; }
