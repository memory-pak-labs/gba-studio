#include <cassert>
#include "gbs/shmup.hpp"

namespace {

constexpr gbs::DialogueLine dialogue_lines[] = {
    { "Wave one." },
    { "Enemy down." },
};

constexpr gbs::EventCommand wave_start_commands[] = {
    { gbs::EventOp::ShowDialogue, 0, 0, 0 },
};

constexpr gbs::EventCommand enemy_destroy_commands[] = {
    { gbs::EventOp::SetVariable, 0, 1, 0 },
};

constexpr gbs::ShmupEnemyData wave_0_enemies[] = {
    {
        "scout",
        { 40, 16 },
        { 16, 16 },
        { 0, 1 },
        gbs::ShmupEnemyMovementKind::Linear,
        2,
        100,
        24,
        { 6, 12 },
        1,
        gbs::empty_event_script(),
        { enemy_destroy_commands, sizeof(enemy_destroy_commands) / sizeof(enemy_destroy_commands[0]) },
        gbs::empty_event_script(),
        "wave0"
    },
    {
        "dive",
        { 120, 8 },
        { 16, 16 },
        { -1, 1 },
        gbs::ShmupEnemyMovementKind::Dive,
        1,
        150,
        0,
        { 6, 12 },
        -1,
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        gbs::empty_event_script(),
        nullptr
    },
};

constexpr gbs::ShmupWaveData waves[] = {
    {
        "wave0",
        wave_0_enemies,
        sizeof(wave_0_enemies) / sizeof(wave_0_enemies[0]),
        0,
        -1,
        { wave_start_commands, sizeof(wave_start_commands) / sizeof(wave_start_commands[0]) },
        gbs::empty_event_script(),
        "wave0",
        4,
        6
    },
};

constexpr gbs::ResourceBank resource_banks[] = {
    { gbs::ResourcePoolKind::ObjTiles, 0, 4, 1, "wave0_bank" },
};

constexpr gbs::ShmupProjectData valid_project = {
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    -1,
    {
        { 112, 128 },
        { 16, 16 },
        2,
        8,
        { 6, -4 },
        { wave_start_commands, sizeof(wave_start_commands) / sizeof(wave_start_commands[0]) },
        nullptr
    },
    {
        { 4, 8 },
        { 0, -3 },
        4,
        gbs::empty_event_script()
    },
    {
        { 4, 8 },
        { 0, 2 },
        4,
        gbs::empty_event_script()
    },
    waves,
    sizeof(waves) / sizeof(waves[0]),
    0,
    dialogue_lines,
    sizeof(dialogue_lines) / sizeof(dialogue_lines[0]),
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    nullptr,
    0,
    resource_banks,
    sizeof(resource_banks) / sizeof(resource_banks[0]),
    nullptr,
    0
};

void test_valid_project_contract() {
    static_assert(gbs::is_valid_shmup_project_data(valid_project), "valid shmup project");
    assert(gbs::is_valid_shmup_project_data(valid_project));
    assert(gbs::shmup_wave_for(valid_project, 0) == &waves[0]);
    assert(gbs::shmup_wave_for(valid_project, 0)->player_speed_pixels_per_frame == 4);
    assert(gbs::shmup_wave_for(valid_project, 0)->fire_cooldown_frames == 6);
    assert(gbs::shmup_enemy_for(waves[0], 1) == &wave_0_enemies[1]);
    assert(gbs::shmup_enemy_for(waves[0], 2) == nullptr);
    assert(valid_project.sfx_asset_count == 0);
    assert(valid_project.music_asset_count == 0);
    assert(valid_project.pcm_asset_count == 0);
    assert(valid_project.tracker_asset_count == 0);
}

void test_wide_background_uses_streaming_contract() {
    static constexpr uint16_t tile_entries[] = { 0 };
    static constexpr gbs::ShmupBackgroundLayerData wide_layers[] = {
        { gbs::BackgroundLayer::BG3, { tile_entries, 255, 18 }, { 1, 0 } },
        { gbs::BackgroundLayer::BG2, { tile_entries, 255, 18 }, { 2, 0 } },
        { gbs::BackgroundLayer::BG1, { tile_entries, 255, 18 }, { 4, 0 } },
    };
    static constexpr gbs::ShmupBackgroundData wide_backgrounds[] = {
        { "space", wide_layers, sizeof(wide_layers) / sizeof(wide_layers[0]), 0 },
    };
    gbs::ShmupProjectData project = valid_project;
    project.backgrounds = wide_backgrounds;
    project.background_count = 1;
    project.background_index = 0;

    assert(gbs::shmup_background_primary_layer(wide_backgrounds[0]) == &wide_layers[1]);
    assert(!gbs::is_valid_tilemap_asset(wide_layers[1].tilemap));
    assert(gbs::is_valid_streaming_tilemap_asset(wide_layers[1].tilemap));
    assert(gbs::shmup_background_camera_pixels(wide_backgrounds[0], 10).x == 20);
    assert(gbs::shmup_background_layer_camera_pixels(wide_layers[2], 10).x == 40);
    assert(gbs::shmup_background_camera_pixels(wide_backgrounds[0], 10000).x == 1800);
    assert(gbs::is_valid_shmup_project_data(project));
}

void test_affine_background_owns_video_and_collision_data() {
    static constexpr uint8_t affine_tiles_data[64] = {};
    static constexpr uint8_t affine_map_entries[16 * 16] = {};
    static constexpr uint16_t affine_palette_colors[] = { 0 };
    static constexpr gbs::AffineTileAsset affine_tiles = { affine_tiles_data, 1, 0 };
    static constexpr gbs::AffineTileMapAsset affine_map = { affine_map_entries, 16, 16 };
    static constexpr gbs::PaletteAsset affine_palette = { affine_palette_colors, 1, 0 };
    static constexpr gbs::VideoComposition video = {
        gbs::DisplayMode::Mode1TextAffine,
        true,
        gbs::BackgroundLayer::BG2,
        { 256, 0, 0, 256, 0, 0 },
        &affine_tiles,
        &affine_map,
        &affine_palette,
        nullptr,
        nullptr,
        nullptr,
        0,
        false
    };
    static constexpr uint8_t collision_flags[] = { 0, 1, 0, 1 };
    static constexpr gbs::ShmupBackgroundData backgrounds[] = {
        {
            "day",
            nullptr,
            0,
            0,
            video,
            collision_flags,
            4,
            2,
            2,
            720,
            160,
            { 2, 0 }
        }
    };
    gbs::ShmupProjectData project = valid_project;
    project.backgrounds = backgrounds;
    project.background_count = 1;
    project.background_index = 0;

    assert(gbs::shmup_background_has_affine_video(backgrounds[0]));
    assert(gbs::shmup_background_collision_at(backgrounds[0], 1, 0));
    assert(!gbs::shmup_background_collision_at(backgrounds[0], 0, 0));
    assert(gbs::shmup_background_camera_pixels(backgrounds[0], 10).x == 20);
    assert(gbs::is_valid_shmup_project_data(project));

    gbs::ShmupBackgroundData invalid_world = backgrounds[0];
    invalid_world.world_width_pixels = 240;
    project.backgrounds = &invalid_world;
    assert(!gbs::is_valid_shmup_project_data(project));
}

void test_world_positions_are_projected_into_the_active_viewport() {
    const gbs::Vec2i screen = gbs::shmup_world_to_viewport(
        gbs::Vec2i { 1832, 120 },
        gbs::Vec2i { 1600, 0 }
    );
    assert(screen.x == 232);
    assert(screen.y == 120);
}

void test_runtime_defaults_and_geometry() {
    constexpr gbs::ShmupRuntimeState state = gbs::shmup_runtime_from_project(valid_project);
    static_assert(state.player_position_pixels.x == 112, "player x");
    static_assert(state.wave_index == 0, "default wave");
    static_assert(state.score == 0, "default score");
    static_assert(state.lives == 3, "default lives");
    static_assert(gbs::shmup_can_fire(state), "can fire at boot");
    static_assert(gbs::shmup_player_is_vulnerable(state), "vulnerable at boot");
    static_assert(gbs::shmup_player_fire_script(valid_project).command_count == 1, "player fire script");
    constexpr gbs::Rect enemy_rect = gbs::shmup_enemy_rect(wave_0_enemies[0], 3);
    static_assert(enemy_rect.y == 19, "linear enemy y");
    assert(gbs::intersects(gbs::shmup_player_rect(valid_project, state), { 112, 128, 16, 16 }));

    gbs::ShmupWaveData delayed_wave = waves[0];
    delayed_wave.start_frame = 90;
    assert(!gbs::shmup_wave_spawn_ready(delayed_wave, 89));
    assert(gbs::shmup_wave_spawn_ready(delayed_wave, 90));
}

void test_feature_runtime_configuration() {
    gbs::ShmupProjectData configured = valid_project;
    configured.score_enabled = false;
    configured.high_score_enabled = false;
    configured.initial_score = 250;
    configured.initial_lives = 5;
    configured.waves_enabled = false;
    configured.max_waves = 1;
    configured.loop_waves = true;

    assert(gbs::is_valid_shmup_project_data(configured));
    const gbs::ShmupRuntimeState state = gbs::shmup_runtime_from_project(configured);
    assert(state.wave_index == 0);
    assert(state.score == 250);
    assert(state.lives == 5);
    assert(gbs::shmup_add_score(250, 100) == 350);
    assert(gbs::shmup_add_score(65530, 10) == 65535);

    configured.waves_enabled = true;
    configured.max_waves = 0;
    assert(!gbs::is_valid_shmup_project_data(configured));
}

void test_selected_scene_without_automatic_waves() {
    const gbs::ShmupWaveData selected_waves[] = { waves[0], waves[0] };
    auto configured = valid_project;
    configured.waves = selected_waves;
    configured.wave_count = 2;
    configured.initial_wave = 1;
    configured.waves_enabled = false;
    configured.player.start_pixels = { 72, 96 };
    assert(gbs::is_valid_shmup_project_data(configured));
    const auto state = gbs::shmup_runtime_from_project(configured);
    assert(state.wave_index == 1);
    assert(state.player_position_pixels.x == 72);
    assert(state.player_position_pixels.y == 96);
}

void test_scene_composition_contract() {
    static constexpr int16_t hblank_offsets[160] = {};
    static constexpr uint8_t affine_tiles_data[64] = {};
    static constexpr uint8_t affine_map_entries[16 * 16] = {};
    static constexpr uint16_t affine_palette_colors[] = { 0 };
    static constexpr gbs::AffineTileAsset affine_tiles = { affine_tiles_data, 1, 0 };
    static constexpr gbs::AffineTileMapAsset affine_map = { affine_map_entries, 16, 16 };
    static constexpr gbs::PaletteAsset affine_palette = { affine_palette_colors, 1, 0 };
    static gbs::ShmupHBlankTimelineKeyframe hblank_timeline[] = {
        { 0, hblank_offsets, 160 },
        { 30, hblank_offsets, 160 },
    };
    gbs::ShmupSceneComposition composition = gbs::default_shmup_scene_composition();
    assert(!composition.enabled);

    composition.enabled = true;
    composition.video.display_mode = gbs::DisplayMode::Mode1TextAffine;
    composition.video.affine_enabled = true;
    composition.video.affine_layer = gbs::BackgroundLayer::BG2;
    composition.video.affine_tiles = &affine_tiles;
    composition.video.affine_tilemap = &affine_map;
    composition.video.affine_palette = &affine_palette;
    composition.blend_enabled = true;
    composition.blend = {
        gbs::RenderLayerBG2,
        gbs::RenderLayerOBJ,
        gbs::BlendMode::Alpha,
        8,
        8,
        0
    };
    composition.hblank_enabled = true;
    composition.hblank_layer = gbs::BackgroundLayer::BG2;
    composition.hblank_scroll_offsets = hblank_offsets;
    composition.hblank_scroll_count = 160;
    composition.hblank_timeline = hblank_timeline;
    composition.hblank_timeline_count = 2;

    assert(gbs::is_valid_shmup_scene_composition(composition));
    hblank_timeline[1].frame = 0;
    assert(!gbs::is_valid_shmup_scene_composition(composition));
    hblank_timeline[1].frame = 30;
    composition.hblank_scroll_count = 159;
    assert(!gbs::is_valid_shmup_scene_composition(composition));
}

void test_player_air_brake_reduces_controlled_movement() {
    static_assert(gbs::shmup_player_movement_speed(2, false) == 2, "normal shmup movement speed");
    static_assert(gbs::shmup_player_movement_speed(2, true) == 1, "air brake halves movement speed");
    static_assert(gbs::shmup_player_movement_speed(1, true) == 1, "air brake keeps a minimum movement step");
    assert(gbs::shmup_player_movement_speed(16, true) == 8);
}

void test_resource_group_lookup() {
    constexpr gbs::ResourceBankGroup resource_bank_groups[] = {
        { "wave0", resource_banks, sizeof(resource_banks) / sizeof(resource_banks[0]) },
    };
    gbs::ShmupProjectData project = valid_project;
    project.resource_bank_groups = resource_bank_groups;
    project.resource_bank_group_count = sizeof(resource_bank_groups) / sizeof(resource_bank_groups[0]);
    assert(gbs::find_shmup_resource_bank_group_index(project, "wave0") == 0);
    assert(gbs::find_shmup_resource_bank_group_index(project, "missing") == -1);
    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_shmup_wave(project, waves[0]);
    assert(group.name != nullptr);
    assert(group.bank_count == 1);
}

void test_resource_group_lookup_missing_when_not_declared() {
    assert(gbs::find_shmup_resource_bank_group_index(valid_project, "missing") == -1);
    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_shmup_wave(valid_project, waves[0]);
    assert(group.name == nullptr);
    assert(group.bank_count == 0);
}

void test_save_data_roundtrip() {
    gbs::ShmupRuntimeState state = gbs::shmup_runtime_from_project(valid_project);
    state.player_position_pixels = { 80, 120 };
    state.wave_index = 0;
    state.frame_counter = 42;
    state.score = 300;
    state.lives = 2;
    state.fire_cooldown_remaining = 5;
    state.invulnerability_frames_remaining = 12;

    gbs::EventState event_state {};
    event_state.variables[0] = 7;
    event_state.variables[4] = 99;
    event_state.variables[gbs::event_variable_count - 1] = 911;

    gbs::ShmupSaveData save_data {};
    gbs::capture_shmup_save_data(save_data, state, event_state, 500, 3600, 3);
    assert(gbs::is_valid_shmup_save_data(valid_project, save_data));
    assert(save_data.player_x == 80);
    assert(save_data.player_y == 120);
    assert(save_data.score == 300);
    assert(save_data.high_score == 500);
    assert(save_data.play_time_frames == 3600);
    assert(save_data.flags == 3);

    gbs::ShmupRuntimeState restored = gbs::shmup_runtime_from_project(valid_project);
    gbs::EventState restored_events {};
    uint16_t restored_high_score = 0;
    assert(gbs::apply_shmup_save_data(valid_project, save_data, restored, restored_events, restored_high_score));
    assert(restored.player_position_pixels.x == 80);
    assert(restored.player_position_pixels.y == 120);
    assert(restored.frame_counter == 42);
    assert(restored.score == 300);
    assert(restored.lives == 2);
    assert(restored_high_score == 500);
    assert(restored_events.variables[0] == 7);
    assert(restored_events.variables[4] == 99);
    assert(restored_events.variables[gbs::event_variable_count - 1] == 911);
}

void test_invalid_save_data_rejected() {
    gbs::ShmupRuntimeState state = gbs::shmup_runtime_from_project(valid_project);
    gbs::EventState event_state {};
    gbs::ShmupSaveData save_data {};
    gbs::capture_shmup_save_data(save_data, state, event_state);
    save_data.wave_index = 9;
    assert(!gbs::is_valid_shmup_save_data(valid_project, save_data));

    uint16_t high_score = 0;
    assert(!gbs::apply_shmup_save_data(valid_project, save_data, state, event_state, high_score));
}

void test_invalid_project_rejected() {
    gbs::ShmupProjectData invalid = valid_project;
    invalid.player.size_pixels = { 0, 16 };
    assert(!gbs::is_valid_shmup_project_data(invalid));

    invalid = valid_project;
    invalid.waves = nullptr;
    assert(!gbs::is_valid_shmup_project_data(invalid));

    invalid = valid_project;
    invalid.initial_wave = 4;
    assert(!gbs::is_valid_shmup_project_data(invalid));

    invalid = valid_project;
    invalid.enemy_projectile.max_active = 0;
    assert(!gbs::is_valid_shmup_project_data(invalid));
}

} // namespace

int main() {
    test_valid_project_contract();
    test_wide_background_uses_streaming_contract();
    test_affine_background_owns_video_and_collision_data();
    test_world_positions_are_projected_into_the_active_viewport();
    test_runtime_defaults_and_geometry();
    test_feature_runtime_configuration();
    test_selected_scene_without_automatic_waves();
    test_scene_composition_contract();
    test_player_air_brake_reduces_controlled_movement();
    test_resource_group_lookup();
    test_resource_group_lookup_missing_when_not_declared();
    test_save_data_roundtrip();
    test_invalid_save_data_rejected();
    test_invalid_project_rejected();
    return 0;
}
