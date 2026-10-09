#include <cassert>
#include "gbs/visual_novel.hpp"

namespace {

void test_visual_novel_project_validation_and_lookup() {
    const uint16_t entries[] = { 0, 1, 2, 3 };
    const gbs::VisualNovelBackgroundData backgrounds[] = {
        {
            "intro_bg",
            gbs::BackgroundLayer::BG1,
            gbs::TileMapAsset { entries, 2, 2 },
            31
        }
    };
    const gbs::DialogueLine lines[] = {
        { "Hello" },
        { "Continue?" }
    };
    const gbs::DialogueChoice choices[] = {
        { "Yes", 1, -1 },
        { "No", 0, -1 }
    };
    const gbs::EventCommand choice_commands[] = {
        { gbs::EventOp::SetVariable, 3, 1, 0 }
    };
    const gbs::VisualNovelChoiceOptionData choice_options[] = {
        { -1, 0, true, 1, gbs::empty_event_script() },
        { 2, 1, true, 1, { choice_commands, 1 } }
    };
    const gbs::VisualNovelChoiceGroupData groups[] = {
        { 1, choices, 2, -1, choice_options }
    };
    const gbs::EventCommand enter_commands[] = {
        { gbs::EventOp::ShowDialogue, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::VisualNovelSceneData scenes[] = {
        {
            "intro",
            0,
            0,
            -1,
            1,
            gbs::EventScript { enter_commands, 2 },
            gbs::empty_event_script(),
            true,
            "intro_group"
        },
        {
            "choice",
            0,
            1,
            0,
            -1,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            false,
            "intro_group"
        }
    };
    const gbs::ResourceBank banks[] = {
        { gbs::ResourcePoolKind::BgTiles, 0, 4, 1, "intro_bg_tiles" }
    };
    const gbs::ResourceBankGroup resource_groups[] = {
        { "intro_group", banks, 1 }
    };
    const gbs::VisualNovelProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        backgrounds,
        1,
        scenes,
        2,
        0,
        lines,
        2,
        nullptr,
        0,
        groups,
        1,
        banks,
        1,
        resource_groups,
        1
    };
    gbs::EventState state {};
    gbs::VisualNovelHistoryState history = gbs::visual_novel_empty_history();

    assert(gbs::is_valid_visual_novel_project_data(project));
    assert(gbs::visual_novel_scene_for(project, 0) == &scenes[0]);
    assert(gbs::visual_novel_scene_for(project, 9) == nullptr);
    assert(gbs::visual_novel_scene_name(project, 0)[0] == 'i');
    assert(gbs::visual_novel_scene_name(project, 9) == nullptr);
    assert(gbs::visual_novel_scene_number(project, 0) == 1);
    assert(gbs::visual_novel_scene_number(project, 9) == 0);
    assert(gbs::visual_novel_choice_group_for(project, 0) == &groups[0]);
    assert(gbs::visual_novel_next_scene_index(project, scenes[0]) == 1);
    assert(gbs::visual_novel_next_scene_index(project, scenes[1]) == -1);
    assert(gbs::visual_novel_scene_enter_script(project, 0).command_count == 2);
    assert(gbs::visual_novel_scene_exit_script(project, 9).command_count == 0);
    assert(gbs::find_visual_novel_scene_resource_bank_group_index(project, scenes[0]) == 0);
    assert(gbs::resource_bank_group_from_visual_novel_scene(project, scenes[0]).bank_count == 1);
    assert(gbs::resource_bank_batch_from_visual_novel_project(project).bank_count == 1);
    assert(gbs::visual_novel_choice_option_for(groups[0], 1) == &choice_options[1]);
    assert(gbs::visual_novel_choice_option_is_available(state, &choice_options[0]));
    assert(!gbs::visual_novel_choice_option_is_available(state, &choice_options[1]));
    state.variables[2] = 1;
    assert(gbs::visual_novel_choice_option_is_available(state, &choice_options[1]));
    assert(gbs::visual_novel_choice_next_scene_index(project, groups[0], 1, -1) == 1);
    assert(gbs::visual_novel_choice_script(groups[0], 1).command_count == 1);
    gbs::visual_novel_push_history(history, 0);
    gbs::visual_novel_push_history(history, 1);
    assert(gbs::visual_novel_last_history_line(history) == 1);
    assert(gbs::visual_novel_previous_history_line(history) == 0);
    for (int index = 0; index < 12; ++index) {
        gbs::visual_novel_push_history(history, index);
    }
    assert(history.count == gbs::visual_novel_history_capacity);
    assert(gbs::visual_novel_previous_history_line(history) == 10);
}

void test_visual_novel_project_rejects_invalid_refs() {
    const uint16_t entries[] = { 0 };
    const gbs::VisualNovelBackgroundData backgrounds[] = {
        { "bg", gbs::BackgroundLayer::BG1, gbs::TileMapAsset { entries, 1, 1 }, 0 }
    };
    const gbs::DialogueLine lines[] = {
        { "Only" }
    };
    const gbs::DialogueChoice choices[] = {
        { "Bad", 1, -1 }
    };
    const gbs::VisualNovelChoiceGroupData bad_group[] = {
        { 0, choices, 1, 99 }
    };
    const gbs::VisualNovelChoiceOptionData bad_options[] = {
        { 99, 1, true, -1, gbs::empty_event_script() }
    };
    const gbs::VisualNovelChoiceGroupData bad_option_group[] = {
        { 0, choices, 1, 0, bad_options }
    };
    const gbs::VisualNovelSceneData bad_scene[] = {
        {
            "bad",
            2,
            0,
            -1,
            -1,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            false,
            nullptr
        }
    };
    const gbs::VisualNovelProjectData invalid_scene {
        nullptr,
        0,
        nullptr,
        0,
        backgrounds,
        1,
        bad_scene,
        1,
        0,
        lines,
        1
    };
    const gbs::VisualNovelSceneData valid_scene[] = {
        {
            "valid",
            0,
            0,
            0,
            -1,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            false,
            nullptr
        }
    };
    const gbs::VisualNovelProjectData invalid_choice {
        nullptr,
        0,
        nullptr,
        0,
        backgrounds,
        1,
        valid_scene,
        1,
        0,
        lines,
        1,
        nullptr,
        0,
        bad_group,
        1
    };
    const gbs::VisualNovelProjectData invalid_option {
        nullptr,
        0,
        nullptr,
        0,
        backgrounds,
        1,
        valid_scene,
        1,
        0,
        lines,
        1,
        nullptr,
        0,
        bad_option_group,
        1
    };

    assert(!gbs::is_valid_visual_novel_project_data(invalid_scene));
    assert(!gbs::is_valid_visual_novel_project_data(invalid_choice));
    assert(!gbs::is_valid_visual_novel_project_data(invalid_option));
}

void test_visual_novel_save_data_roundtrip() {
    const gbs::DialogueLine lines[] = {
        { "Intro" },
        { "Choice" },
        { "Ending" }
    };
    const gbs::VisualNovelSceneData scenes[] = {
        {
            "intro",
            -1,
            0,
            -1,
            1,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            false,
            nullptr
        },
        {
            "ending",
            -1,
            2,
            -1,
            -1,
            gbs::empty_event_script(),
            gbs::empty_event_script(),
            false,
            nullptr
        }
    };
    const gbs::VisualNovelProjectData project {
        nullptr,
        0,
        nullptr,
        0,
        nullptr,
        0,
        scenes,
        2,
        0,
        lines,
        3
    };
    gbs::EventState event_state {};
    event_state.variables[3] = 42;
    event_state.variables[9] = -7;
    event_state.variables[gbs::event_variable_count - 1] = 906;
    gbs::VisualNovelHistoryState history = gbs::visual_novel_empty_history();
    gbs::visual_novel_push_history(history, 0);
    gbs::visual_novel_push_history(history, 2);

    gbs::VisualNovelSaveData save_data {};
    gbs::capture_visual_novel_save_data(save_data, 1, history, event_state, 7200, 5);
    assert(gbs::is_valid_visual_novel_save_data(project, save_data));
    assert(save_data.scene_index == 1);
    assert(save_data.history_count == 2);
    assert(save_data.last_line_index == 2);
    assert(save_data.previous_line_index == 0);
    assert(save_data.variables[3] == 42);
    assert(save_data.variables[9] == -7);
    assert(save_data.variables[gbs::event_variable_count - 1] == 906);
    assert(save_data.play_time_frames == 7200);
    assert(save_data.flags == 5);

    int restored_scene = 0;
    gbs::VisualNovelHistoryState restored_history = gbs::visual_novel_empty_history();
    gbs::EventState restored_event_state {};
    assert(gbs::apply_visual_novel_save_data(project, save_data, restored_scene, restored_history, restored_event_state));
    assert(restored_scene == 1);
    assert(restored_history.count == 2);
    assert(gbs::visual_novel_last_history_line(restored_history) == 2);
    assert(gbs::visual_novel_previous_history_line(restored_history) == 0);
    assert(restored_event_state.variables[3] == 42);
    assert(restored_event_state.variables[9] == -7);
    assert(restored_event_state.variables[gbs::event_variable_count - 1] == 906);

    save_data.scene_index = 99;
    assert(!gbs::apply_visual_novel_save_data(project, save_data, restored_scene, restored_history, restored_event_state));
}

} // namespace

int main() {
    test_visual_novel_project_validation_and_lookup();
    test_visual_novel_project_rejects_invalid_refs();
    test_visual_novel_save_data_roundtrip();
    return 0;
}
