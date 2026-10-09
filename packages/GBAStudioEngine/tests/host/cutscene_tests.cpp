#include "gbs/cutscene.hpp"

namespace {

constexpr gbs::DialogueLine lines[] = {
    { "Intro" },
    { "Fade in" },
    { "The end" },
};

constexpr gbs::EventCommand step_commands[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 },
};

constexpr gbs::CutsceneActorMotionData intro_actor_motions[] = {
    { 0, gbs::Vec2i { 240, 48 }, gbs::Vec2i { 88, 64 }, 30 }
};

constexpr uint16_t background_entries[] = { 0 };
constexpr gbs::TileMapAsset background_tilemap { background_entries, 1, 1 };
constexpr gbs::CutsceneBackgroundData backgrounds[] = {
    { "intro_default", gbs::BackgroundLayer::BG0, background_tilemap, 0 },
    { "intro_override", gbs::BackgroundLayer::BG0, background_tilemap, 1 },
};

constexpr gbs::CutsceneStepData intro_steps[] = {
    {
        0,
        30,
        gbs::empty_event_script(),
        -1,
        true,
        true,
        gbs::empty_event_script(),
        gbs::no_cutscene_branch(),
        false,
        1,
        "intro_step_group",
        intro_actor_motions,
        1
    },
    { 1, 20, { step_commands, 1 }, 1, true },
    {
        1,
        0,
        gbs::empty_event_script(),
        -1,
        false,
        false,
        { step_commands, 1 },
        gbs::CutsceneBranchData { 0, 1, 1, -1 },
        true
    },
};

constexpr gbs::CutsceneStepData end_steps[] = {
    { 2, 0, gbs::empty_event_script(), -1, false },
};

constexpr gbs::MetaSpritePart intro_actor_part { 0, 0, 0, 0, false, false, 8, 8 };
constexpr gbs::MetaSprite intro_actor_metasprite { &intro_actor_part, 1 };
constexpr gbs::CutsceneActorData intro_actors[] = {
    { "airship", &intro_actor_metasprite, gbs::Vec2i { 88, 64 } }
};

constexpr gbs::CutsceneSceneData scenes[] = {
    { "intro", 0, intro_steps, 3, 1, gbs::empty_event_script(), gbs::empty_event_script(), "intro_group", intro_actors, 1 },
    { "end", -1, end_steps, 1, -1, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
};

constexpr gbs::ResourceBank banks[] = {
    { gbs::ResourcePoolKind::BgTiles, 0, 4, 1, "cutscene_bank" },
};
constexpr gbs::ResourceBankGroup groups[] = {
    { "intro_group", banks, 1 },
    { "intro_step_group", banks, 1 },
};

constexpr gbs::CutsceneProjectData project = {
    nullptr,
    0,
    nullptr,
    0,
    backgrounds,
    2,
    scenes,
    2,
    0,
    lines,
    3,
    nullptr,
    0,
    banks,
    1,
    groups,
    2
};

static_assert(gbs::is_valid_cutscene_project_data(project), "cutscene project should be valid");
static_assert(gbs::cutscene_runtime_from_project(project).scene_index == 0, "runtime starts at initial scene");
static_assert(gbs::cutscene_step_for(scenes[0], 1)->target_scene_index == 1, "step target should be readable");
static_assert(gbs::cutscene_step_background_index(scenes[0], intro_steps[0]) == 1, "step background should override scene background");
static_assert(gbs::cutscene_step_background_index(scenes[0], intro_steps[1]) == 0, "step without background should use scene background");
static_assert(gbs::cutscene_step_resource_bank_group_name(scenes[0], intro_steps[0])[0] == 'i', "step resource group overrides scene group");
static_assert(gbs::cutscene_step_resource_bank_group_name(scenes[0], intro_steps[1])[0] == 'i', "step resource group falls back to scene group");
static_assert(gbs::cutscene_step_is_skippable(intro_steps[1]), "legacy steps are skippable by default");
static_assert(!gbs::cutscene_step_is_skippable(intro_steps[2]), "locked step is not skippable");
static_assert(gbs::cutscene_step_waits_for_dialogue(intro_steps[2]), "step can wait for dialogue close");
static_assert(gbs::is_valid_cutscene_branch(project, intro_steps[2].branch), "branch data is valid");
static_assert(gbs::cutscene_branch_matches(intro_steps[2].branch, 1), "branch matches variable value");
static_assert(gbs::cutscene_branch_target_scene(project, intro_steps[2].branch) == 1, "branch targets scene");
static_assert(gbs::cutscene_next_step_index(scenes[0], 0) == 1, "next step helper advances");
static_assert(gbs::cutscene_next_step_index(scenes[0], 2) == -1, "last step helper stops");
static_assert(gbs::cutscene_scene_name(project, 0)[0] == 'i', "cutscene scene name is exposed");
static_assert(gbs::cutscene_scene_name(project, 99) == nullptr, "invalid cutscene scene has no name");
static_assert(gbs::cutscene_scene_number(project, 0) == 1, "cutscene scene numbers are one-based");
static_assert(gbs::cutscene_scene_number(project, 99) == 0, "invalid cutscene scene number is zero");
static_assert(gbs::is_valid_cutscene_actor(intro_actors[0]), "cutscene actors expose a valid metasprite");
static_assert(scenes[0].actor_count == 1 && scenes[0].actors[0].position_pixels.x == 88, "cutscene actor position is preserved");
static_assert(gbs::is_valid_cutscene_actor_motion(scenes[0], intro_steps[0].actor_motions[0]), "cutscene actor motion is valid");
static_assert(gbs::cutscene_actor_position_at(scenes[0], intro_steps[0], 0, 0).x == 240, "cutscene actor motion starts at its origin");
static_assert(gbs::cutscene_actor_position_at(scenes[0], intro_steps[0], 0, 15).x == 164, "cutscene actor motion interpolates during the step");
static_assert(gbs::cutscene_actor_position_at(scenes[0], intro_steps[0], 0, 30).x == 88, "cutscene actor motion reaches its target");

constexpr gbs::CutsceneStepData invalid_steps[] = {
    { 99, 1, gbs::empty_event_script(), -1, true },
};
constexpr gbs::CutsceneSceneData invalid_scenes[] = {
    { "invalid", -1, invalid_steps, 1, -1, gbs::empty_event_script(), gbs::empty_event_script(), nullptr },
};
constexpr gbs::CutsceneProjectData invalid_project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    invalid_scenes,
    1,
    0,
    lines,
    3,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0
};

static_assert(!gbs::is_valid_cutscene_project_data(invalid_project), "invalid line index must fail");

constexpr gbs::CutsceneBranchData invalid_branch { 99, 1, 0, -1 };
static_assert(!gbs::is_valid_cutscene_branch(project, invalid_branch), "invalid branch variable fails");
constexpr gbs::CutsceneActorMotionData invalid_actor_motion { 9, gbs::Vec2i { 0, 0 }, gbs::Vec2i { 8, 8 }, 10 };
static_assert(!gbs::is_valid_cutscene_actor_motion(scenes[0], invalid_actor_motion), "invalid actor motion target fails");

} // namespace

int main() {
    if (!gbs::is_valid_cutscene_project_data(project)) {
        return 1;
    }
    const gbs::CutsceneSceneData* intro = gbs::cutscene_scene_for(project, 0);
    if (intro == nullptr || gbs::cutscene_step_for(*intro, 1)->script.command_count != 1) {
        return 2;
    }
    if (gbs::find_cutscene_scene_resource_bank_group_index(project, *intro) != 0) {
        return 3;
    }
    gbs::EventState event_state {};
    event_state.text_variables[0][0] = 'N';
    event_state.text_variables[0][1] = 'A';
    event_state.text_variables[0][2] = 'R';
    event_state.text_variables[0][3] = 'A';
    event_state.variables[0] = 1;
    event_state.variables[gbs::event_variable_count - 1] = 907;
    gbs::CutsceneRuntimeState state { 1, 0, 12 };
    gbs::CutsceneSaveData save_data {};
    gbs::capture_cutscene_save_data(save_data, state, event_state, 360, 5);
    if (!gbs::is_valid_cutscene_save_data(project, save_data) ||
        save_data.scene_index != 1 ||
        save_data.step_index != 0 ||
        save_data.frame_counter != 12 ||
        save_data.variables[0] != 1 ||
        save_data.variables[gbs::event_variable_count - 1] != 907 ||
        save_data.play_time_frames != 360 ||
        save_data.flags != 5 || save_data.text_variables[0][2] != 'R') {
        return 4;
    }
    gbs::CutsceneRuntimeState restored = gbs::cutscene_runtime_from_project(project);
    gbs::EventState restored_events {};
    if (!gbs::apply_cutscene_save_data(project, save_data, restored, restored_events) ||
        restored.scene_index != 1 ||
        restored.step_index != 0 ||
        restored.frame_counter != 12 ||
        restored_events.text_variables[0][2] != 'R' ||
        restored_events.text_variables[0][4] != '\0' ||
        restored_events.variables[0] != 1 ||
        restored_events.variables[gbs::event_variable_count - 1] != 907) {
        return 5;
    }
    static_assert(gbs::legacy_cutscene_save_size == 272, "legacy save prefix stays compatible");
    gbs::CutsceneSaveData legacy_data {};
    const unsigned char* saved_bytes = reinterpret_cast<const unsigned char*>(&save_data);
    unsigned char* legacy_bytes = reinterpret_cast<unsigned char*>(&legacy_data);
    for (size_t index = 0; index < gbs::legacy_cutscene_save_size; ++index) legacy_bytes[index] = saved_bytes[index];
    if (!gbs::apply_cutscene_save_data(project, legacy_data, restored, restored_events) ||
        restored_events.variables[0] != 1 || restored_events.text_variables[0][0] != '\0') return 7;
    save_data.scene_index = 99;
    if (gbs::is_valid_cutscene_save_data(project, save_data) ||
        gbs::apply_cutscene_save_data(project, save_data, restored, restored_events)) {
        return 6;
    }
    return 0;
}
