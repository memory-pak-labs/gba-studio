#include "gbs/engine.hpp"
#include "gbs/input.hpp"
#include "gbs/racing.hpp"
#include "gbs/racing_animation.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/ui.hpp"
#include "gbs/hud_racing.hpp"
#include <cstring>
#include "gbs/visual_effects.hpp"
#ifndef GBS_RACING_PROJECT_DATA_HEADER
#define GBS_RACING_PROJECT_DATA_HEADER "racing_project_data.hpp"
#endif
#ifndef GBS_RACING_RUNTIME_ENTRY
#define GBS_RACING_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_RACING_RUNTIME_ENTER
#define GBS_RACING_RUNTIME_ENTER gbs_enter_racing
#endif
#ifndef GBS_RACING_RUNTIME_UPDATE
#define GBS_RACING_RUNTIME_UPDATE gbs_update_racing
#endif
#ifndef GBS_RACING_RUNTIME_RENDER
#define GBS_RACING_RUNTIME_RENDER gbs_render_racing
#endif
#ifndef GBS_RACING_RUNTIME_LEAVE
#define GBS_RACING_RUNTIME_LEAVE gbs_leave_racing
#endif
#ifndef GBS_MULTI_RUNTIME
#define GBS_MULTI_RUNTIME 0
#endif
#include GBS_RACING_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

namespace {

const gbs::RacingProjectData& project = gbastudio_racing_project::project;
int current_room_index = 0;
gbs::RacingRuntimeState runtime_state {};
gbs::SpriteAnimatorState vehicle_animator {};
const gbs::TileAsset* vehicle_loaded_frame = nullptr;
gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::EventState event_state __attribute__((section(".ewram_bss")));
    gbs::EventRunner runtime_event_runner {};
    uint32_t runtime_save_sequence = 0;
    int racing_initialization_result = -1;
    int runtime_event_wait_frames = 0;
bool runtime_script_controls_dialogue = false;
bool screen_fade_active = false;
int screen_fade_direction = 0;
int screen_fade_total_frames = 1;
int screen_fade_frames_remaining = 0;
constexpr size_t max_runtime_triggers = 16;
gbs::RuntimeTriggerState trigger_states[max_runtime_triggers] {};
int camera_x = 0;
int camera_y = 0;
gbs::HBlankAffineRasterLine pseudo3d_affine_raster[gbs::hblank_affine_raster_line_count] {};
gbs::RacingCameraFloorBasis circuit_floor_basis[160] __attribute__((section(".ewram_bss")));
const gbs::RacingRoomData* circuit_floor_basis_room = nullptr;
gbs::Vec2i previous_pseudo3d_player_marker { -1, -1 };
    gbs::Vec2i previous_pseudo3d_rival_marker { -1, -1 };
    bool race_result_dispatched = false;
    bool racing_controls_active = false;
    gbs::HudState racing_hud {};
volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
constexpr size_t max_resource_bank_reservations = 64;
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankBatchReservation active_resource_banks {
    active_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false,
};
gbs::ResourceBankBatchReservation scratch_resource_banks {
    scratch_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false,
};
const bool assets_are_streamed = project.resource_bank_group_count > 0;

void reset_trigger_states();

bool stream_resources_for_room(const gbs::RacingRoomData& room) {
    if (!assets_are_streamed || room.resource_bank_group_name == nullptr) {
        return true;
    }
    const gbs::ResourceBankGroup group =
        gbs::resource_bank_group_from_racing_room(project, room);
    if (group.name == nullptr) return false;
    if (project.resource_bank_upload_source_count == 0) {
        return gbs::stream_resource_bank_group(resource_manager, active_resource_banks, scratch_resource_banks, group);
    }
    const gbs::ResourceStreamResult result =
        gbs::stream_resource_bank_group_with_uploads(
            resource_manager,
            active_resource_banks,
            scratch_resource_banks,
            group,
            project.resource_bank_upload_sources,
            project.resource_bank_upload_source_count
        );
    if (result.success && result.uploaded_count > 0) gbs::wait_vblank();
    return result.success;
}

void sync_runtime_telemetry() {
    const gbs::RacingRoomData& room = project.rooms[current_room_index];
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = current_room_index;
    runtime_telemetry.flag_bits = 0;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
    }
    runtime_telemetry.player_x = runtime_state.position_x256 / 256;
    runtime_telemetry.player_y = runtime_state.position_y256 / 256;
    runtime_telemetry.player_direction = 0;
    runtime_telemetry.actor_count = static_cast<int>(room.actor_count);
    runtime_telemetry.first_actor_x = room.actor_count > 0 ? room.actors[0].position_pixels.x : -1;
    runtime_telemetry.first_actor_y = room.actor_count > 0 ? room.actors[0].position_pixels.y : -1;
    runtime_telemetry.first_actor_direction = -1;
    runtime_telemetry.first_actor_visible = room.actor_count > 0 ? 1 : 0;
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    runtime_telemetry.current_tile_flags = 0;
    runtime_telemetry.current_tile_slope = 0;
    runtime_telemetry.room_change_count = 0;
    gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
}

int clamp_int(int value, int minimum, int maximum) {
    if (value < minimum) return minimum;
    if (value > maximum) return maximum;
    return value;
}

bool has_authored_background(const gbs::RacingRoomData& room) {
    return room.background_index >= 0 && static_cast<size_t>(room.background_index) < project.background_count;
}

const gbs::RacingPseudo3DVisualData* pseudo3d_visual(const gbs::RacingRoomData& room) {
    return gbs::racing_pseudo3d_visual_for_room(room);
}

uint16_t pseudo3d_minimap_tile_at(const gbs::RacingPseudo3DVisualData& visual, int x, int y) {
    if (visual.minimap_tilemap == nullptr || x < 0 || y < 0 ||
        x >= visual.minimap_tilemap->width || y >= visual.minimap_tilemap->height) {
        return 0;
    }
    return visual.minimap_tilemap->entries[y * visual.minimap_tilemap->width + x];
}

void apply_room_visuals() {
    const gbs::RacingRoomData& room = project.rooms[current_room_index];
    gbs::disable_hblank_effects();
    gbs::disable_window0();
    // The room stream already uploaded its scoped assets. Other rooms can
    // reuse these VRAM ranges, so loading the entire campaign overwrites them.
    if (!assets_are_streamed || project.resource_bank_upload_source_count == 0) {
        for (size_t index = 0; index < project.bg_palette_count; ++index) {
            gbs::load_palette(project.bg_palettes[index], false);
        }
        for (size_t index = 0; index < project.obj_palette_count; ++index) {
            gbs::load_palette(project.obj_palettes[index], true);
        }
        for (size_t index = 0; index < project.tile_asset_count; ++index) {
            gbs::load_tiles(project.tile_assets[index]);
        }
    }
    if (gbs::racing_uses_pseudo3d(room)
        && (pseudo3d_visual(room) != nullptr || !has_authored_background(room))) {
        const gbs::RacingPseudo3DVisualData* visual = pseudo3d_visual(room);
        gbs::set_backdrop_color(gbs::rgb15(4, 10, 18));
        gbs::set_display_mode(gbs::DisplayMode::Mode1TextAffine);
        previous_pseudo3d_player_marker = gbs::Vec2i { -1, -1 };
        previous_pseudo3d_rival_marker = gbs::Vec2i { -1, -1 };
        if (visual == nullptr) {
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);
            return;
        }
        if (visual->panorama_palette) gbs::load_palette(*visual->panorama_palette, false);
        gbs::load_palette(*visual->floor_palette, false);
        if (visual->minimap_palette) gbs::load_palette(*visual->minimap_palette, false);
        if (visual->panorama_tiles) gbs::load_tiles(*visual->panorama_tiles);
        if (visual->minimap_tiles) gbs::load_tiles(*visual->minimap_tiles);
        gbs::load_affine_tiles(gbs::BackgroundLayer::BG2, *visual->floor_tiles);
        if(room.circuit_empty_tile>=0) {
            static constexpr uint8_t empty_tile[64]={};
            gbs::load_affine_tiles(gbs::BackgroundLayer::BG2,gbs::AffineTileAsset{empty_tile,1,static_cast<uint16_t>(room.circuit_empty_tile)});
        }
        if (visual->panorama_tilemap) gbs::load_tilemap(gbs::BackgroundLayer::BG1, *visual->panorama_tilemap);
        if (visual->minimap_tilemap) gbs::load_tilemap(gbs::BackgroundLayer::BG0, *visual->minimap_tilemap);
        gbs::load_affine_tilemap(gbs::BackgroundLayer::BG2, room.circuit_floor ? *room.circuit_floor : *visual->floor_tilemap);
        gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
        gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 3);
        gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, visual->panorama_tilemap != nullptr);
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, true);
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);
        gbs::set_window0(gbs::WindowConfig {
            gbs::WindowRect { 0, 240, visual->horizon_y, 160 },
            static_cast<uint16_t>(gbs::RenderLayerBG0 | gbs::RenderLayerBG1 | gbs::RenderLayerBG2 | gbs::RenderLayerOBJ | gbs::RenderLayerBackdrop),
            static_cast<uint16_t>(gbs::RenderLayerBG0 | gbs::RenderLayerBG1 | gbs::RenderLayerOBJ | gbs::RenderLayerBackdrop),
            true
        });
        return;
    }
    gbs::set_display_mode(gbs::DisplayMode::Mode0Text);
    if (!has_authored_background(room)) {
        gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
        gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 2);
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, true);
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
        gbs::apply_video_composition(room.video);
        return;
    }
    const gbs::RacingBackgroundData& background = project.backgrounds[room.background_index];
    gbs::set_backdrop_color(background.backdrop_color);
    // BG0 is the fixed HUD/dialogue plane. Authored race maps live on BG2 so
    // the map can scroll underneath the HUD without hiding the race status.
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    gbs::set_bg_priority(background.layer, 2);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
    // init() enables the demo BG1 plane. Its stale map would otherwise draw
    // over the race using the newly loaded tiles, including after a handoff.
    for (int layer = 1; layer < 4; ++layer) {
        const auto candidate = static_cast<gbs::BackgroundLayer>(layer);
        gbs::set_bg_enabled(candidate, candidate == background.layer);
    }
    gbs::load_tilemap(background.layer, background.tilemap);
    gbs::set_bg_scroll(background.layer, 0, 0);
    gbs::apply_video_composition(room.video);
}

void update_camera() {
    const gbs::RacingRoomData& room = project.rooms[current_room_index];
    const int player_x = runtime_state.position_x256 / 256;
    const int player_y = runtime_state.position_y256 / 256;
    const gbs::Vec2i camera = gbs::racing_follow_camera(room, { camera_x, camera_y }, { player_x, player_y });
    camera_x = camera.x;
    camera_y = camera.y;
    if (gbs::racing_uses_pseudo3d(room)) {
        const int horizon_scroll = gbs::racing_uses_circuit_track(room) ? runtime_state.heading_x256 / 8 : runtime_state.distance_x256 / 1024 +
            gbs::racing_curve_offset(room, runtime_state.distance_x256, 96);
        gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, horizon_scroll, 0);
        return;
    }
    if (has_authored_background(room) && !gbs::racing_uses_pseudo3d(room)) {
        gbs::set_bg_scroll(project.backgrounds[room.background_index].layer, camera_x, camera_y);
    }
}

void apply_screen_fade_intensity(int intensity) {
    const uint8_t amount = static_cast<uint8_t>(clamp_int(intensity, 0, 16));
    if (amount == 0) {
        gbs::disable_blending();
        return;
    }
    gbs::set_blending(gbs::BlendConfig {
        static_cast<uint16_t>(
            gbs::RenderLayerBG0 |
            gbs::RenderLayerBG1 |
            gbs::RenderLayerBG2 |
            gbs::RenderLayerBG3 |
            gbs::RenderLayerOBJ |
            gbs::RenderLayerBackdrop
        ),
        0,
        gbs::BlendMode::Darken,
        0,
        0,
        amount
    });
}

void start_screen_fade(int direction, int frames) {
    screen_fade_direction = direction < 0 ? -1 : 1;
    screen_fade_total_frames = frames <= 0 ? 1 : frames;
    screen_fade_frames_remaining = screen_fade_total_frames;
    screen_fade_active = true;
    apply_screen_fade_intensity(screen_fade_direction > 0 ? 0 : 16);
}

void update_screen_fade() {
    if (!screen_fade_active) {
        return;
    }
    const int elapsed = screen_fade_total_frames - screen_fade_frames_remaining;
    const int step = screen_fade_total_frames <= 0 ? 16 : (elapsed * 16) / screen_fade_total_frames;
    apply_screen_fade_intensity(screen_fade_direction > 0 ? step : 16 - step);
    if (screen_fade_frames_remaining > 0) {
        --screen_fade_frames_remaining;
    }
    if (screen_fade_frames_remaining <= 0) {
        apply_screen_fade_intensity(screen_fade_direction > 0 ? 16 : 0);
        screen_fade_active = false;
    }
}

bool persist_racing_runtime_state(int slot_index) {
    if (!gbastudio_racing_project::save_enabled ||
        slot_index < 0 ||
        static_cast<size_t>(slot_index) >= gbastudio_racing_project::save_bank.slot_count) {
        return false;
    }
    gbs::UniversalSaveData save_data {};
    if (!gbs::capture_racing_save_data(
            save_data,
            current_room_index,
            runtime_state,
            event_state,
            gbs::frame_count())) {
        return false;
    }
    ++runtime_save_sequence;
    const gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "RACING",
        gbs::frame_count(),
        runtime_save_sequence,
        static_cast<uint16_t>(current_room_index),
        static_cast<uint16_t>(runtime_state.lap_count)
    );
    return gbs::write_save_slot_record(
        gbastudio_racing_project::save_bank,
        static_cast<size_t>(slot_index),
        &save_data,
        sizeof(save_data),
        metadata,
        runtime_save_sequence
    ) == gbs::SaveStatus::Ok;
}

bool restore_racing_runtime_state(int slot_index) {
    if (!gbastudio_racing_project::save_enabled) {
        return false;
    }
    if (slot_index < 0) {
        slot_index = gbs::find_latest_save_slot(gbastudio_racing_project::save_bank);
    }
    if (slot_index < 0 ||
        static_cast<size_t>(slot_index) >= gbastudio_racing_project::save_bank.slot_count) {
        return false;
    }
    gbs::UniversalSaveData save_data {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
            gbastudio_racing_project::save_bank,
            static_cast<size_t>(slot_index),
            &save_data,
            sizeof(save_data),
            nullptr,
            &bytes_read) != gbs::SaveStatus::Ok ||
        bytes_read != sizeof(save_data) ||
        !gbs::apply_racing_save_data(
            project,
            save_data,
            current_room_index,
            runtime_state,
            event_state)) {
        return false;
    }
    runtime_save_sequence = gbs::inspect_save_slot(
        gbastudio_racing_project::save_bank,
        static_cast<size_t>(slot_index)
    ).sequence;
    return true;
}

void consume_event_state() {
    gbs::consume_scene_transition_visual_effect_event(event_state);
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count
    );
    if (event_state.last_dialogue >= 0) {
        gbs::show_dialogue(
            dialogue,
            project.dialogue_lines,
            project.dialogue_line_count,
            event_state.last_dialogue
        );
        event_state.last_dialogue = -1;
        runtime_script_controls_dialogue = dialogue.visible;
    }
    if (event_state.last_sfx >= 0) {
        if (static_cast<size_t>(event_state.last_sfx) < project.sfx_asset_count) {
            gbs::play_sfx(project.sfx_assets[event_state.last_sfx]);
        }
        event_state.last_sfx = -1;
    }
    if (event_state.last_pcm_sfx >= 0) {
        if (static_cast<size_t>(event_state.last_pcm_sfx) < project.pcm_asset_count) {
            gbs::play_pcm_sfx(
                project.pcm_assets[event_state.last_pcm_sfx],
                static_cast<uint8_t>(event_state.last_pcm_sfx_priority),
                static_cast<uint8_t>(event_state.last_pcm_sfx_volume)
            );
        }
        event_state.last_pcm_sfx = -1;
    }
    if (event_state.last_music >= 0) {
        if (static_cast<size_t>(event_state.last_music) < project.music_asset_count) {
            gbs::play_music(project.music_assets[event_state.last_music]);
        }
        event_state.last_music = -1;
    }
    if (event_state.last_tracker_music >= 0) {
        if (static_cast<size_t>(event_state.last_tracker_music) < project.tracker_asset_count) {
            gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music]);
        }
        event_state.last_tracker_music = -1;
    }
    if (event_state.audio_mute_changed) {
        gbs::set_audio_channel_muted(
            gbs::audio_channel_from_event_value(event_state.audio_mute_channel),
            event_state.audio_mute_enabled
        );
        event_state.audio_mute_changed = false;
    }
    if (event_state.audio_volume_changed) {
        gbs::set_audio_channel_volume(
            gbs::audio_channel_from_event_value(event_state.audio_volume_channel),
            static_cast<uint8_t>(event_state.audio_volume)
        );
        event_state.audio_volume_changed = false;
    }
    if (event_state.audio_fade_changed) {
        gbs::fade_audio_channel_volume(
            gbs::audio_channel_from_event_value(event_state.audio_fade_channel),
            static_cast<uint8_t>(event_state.audio_fade_target_volume),
            static_cast<uint16_t>(event_state.audio_fade_frames)
        );
        event_state.audio_fade_changed = false;
    }
    if (event_state.stop_music) {
        gbs::stop_music();
        gbs::stop_tracker_music();
        gbs::stop_pcm_music();
        event_state.stop_music = false;
    }
    if (event_state.close_dialogue) {
        gbs::hide_dialogue(dialogue);
        event_state.close_dialogue = false;
        runtime_script_controls_dialogue = false;
    }
    if (event_state.fade_changed) {
        start_screen_fade(event_state.fade_direction, event_state.fade_frames);
        event_state.fade_changed = false;
        event_state.fade_direction = 0;
        event_state.fade_frames = 0;
    }
    if (event_state.wait_frames > 0) {
        runtime_event_wait_frames = event_state.wait_frames;
        event_state.wait_frames = 0;
    }
    if (event_state.save_request != 0) {
        const int request = event_state.save_request;
        const int slot_index = event_state.save_request_slot;
        if (request == 1) {
            persist_racing_runtime_state(slot_index);
        } else if (request == 2 && restore_racing_runtime_state(slot_index)) {
            reset_trigger_states();
            stream_resources_for_room(project.rooms[current_room_index]);
            apply_room_visuals();
            update_camera();
            gbs::stop_event_runner(runtime_event_runner);
            runtime_event_wait_frames = 0;
            runtime_script_controls_dialogue = false;
        } else if (request == 3 &&
            gbastudio_racing_project::save_enabled &&
            slot_index >= 0 &&
            static_cast<size_t>(slot_index) < gbastudio_racing_project::save_bank.slot_count) {
            gbs::clear_save_slot(
                gbastudio_racing_project::save_bank,
                static_cast<size_t>(slot_index)
            );
        }
        event_state.save_request = 0;
        event_state.save_request_slot = -1;
    }
}

bool start_runtime_event_script(gbs::EventScript script) {
    runtime_event_wait_frames = 0;
    runtime_script_controls_dialogue = false;
    if (!gbs::has_event_script(script)) {
        return false;
    }
    gbs::start_event_runner(runtime_event_runner, script);
    return true;
}

bool update_runtime_event_script(const gbs::InputState& input) {
    if (runtime_script_controls_dialogue && dialogue.visible) {
        gbs::advance_dialogue(dialogue, input);
        if (!dialogue.visible) {
            runtime_script_controls_dialogue = false;
        }
        return true;
    }
    if (runtime_event_wait_frames > 0) {
        --runtime_event_wait_frames;
        return true;
    }
    if (!gbs::event_runner_is_active(runtime_event_runner)) {
        return false;
    }
    gbs::update_event_runner(runtime_event_runner, event_state);
    consume_event_state();
    return true;
}

void draw_pseudo3d_hud(const gbs::RacingRoomData& room) {
    const gbs::RacingPseudo3DVisualData* visual = pseudo3d_visual(room);
    if (visual == nullptr || visual->minimap_tilemap == nullptr || !room.config.pseudo3d.show_minimap) return;
    runtime_telemetry.seen_tile_effects = 200;
    constexpr gbs::Vec2i minimap_origin { 200, 8 };
    constexpr gbs::Vec2i minimap_size { 32, 32 };
    const int map_width = visual->minimap_tilemap->width;
    runtime_telemetry.seen_tile_effects = 201;
    const int map_height = visual->minimap_tilemap->height;
    runtime_telemetry.seen_tile_effects = 202;
    const uint16_t clear_tile = pseudo3d_minimap_tile_at(*visual, 0, map_height - 1);
    runtime_telemetry.seen_tile_effects = 203;
    const uint16_t player_tile = pseudo3d_minimap_tile_at(*visual, 1, map_height - 1);
    runtime_telemetry.seen_tile_effects = 204;
    const uint16_t rival_tile = pseudo3d_minimap_tile_at(*visual, 2, map_height - 1);
    runtime_telemetry.seen_tile_effects = 205;
    runtime_telemetry.seen_tile_effects = 155;
    if (previous_pseudo3d_player_marker.x >= 0 && previous_pseudo3d_player_marker.y >= 0) {
        gbs::set_bg_tile(gbs::BackgroundLayer::BG0, previous_pseudo3d_player_marker.x / 8, previous_pseudo3d_player_marker.y / 8, map_width, map_height, clear_tile);
    }
    if (previous_pseudo3d_rival_marker.x >= 0 && previous_pseudo3d_rival_marker.y >= 0) {
        gbs::set_bg_tile(gbs::BackgroundLayer::BG0, previous_pseudo3d_rival_marker.x / 8, previous_pseudo3d_rival_marker.y / 8, map_width, map_height, clear_tile);
    }
    const gbs::Vec2i player_marker = gbs::racing_uses_circuit_track(room)
        ? gbs::racing_circuit_minimap_position({runtime_state.position_x256/256,runtime_state.position_y256/256},room,minimap_origin,minimap_size)
        : gbs::racing_minimap_position(
        runtime_state.distance_x256,
        room,
        minimap_origin,
        minimap_size
    );
    const gbs::Vec2i rival_marker = gbs::racing_uses_circuit_track(room) && room.actor_count>0
        ? gbs::racing_circuit_minimap_position(gbs::racing_topdown_rival_pose(runtime_state,room,0).position_pixels,room,minimap_origin,minimap_size)
        : gbs::racing_minimap_position(
        runtime_state.rival_distance_x256,
        room,
        minimap_origin,
        minimap_size
    );
    runtime_telemetry.seen_tile_effects = 156;
    gbs::set_bg_tile(gbs::BackgroundLayer::BG0, player_marker.x / 8, player_marker.y / 8, map_width, map_height, player_tile);
    gbs::set_bg_tile(gbs::BackgroundLayer::BG0, rival_marker.x / 8, rival_marker.y / 8, map_width, map_height, rival_tile);
    runtime_telemetry.seen_tile_effects = 157;
    previous_pseudo3d_player_marker = player_marker;
    previous_pseudo3d_rival_marker = rival_marker;
}

void draw_pseudo3d_track(const gbs::RacingRoomData& room) {
    const gbs::RacingPseudo3DVisualData* visual = pseudo3d_visual(room);
    if (visual == nullptr) return;
    if(gbs::racing_uses_circuit_track(room)) {
        // Height, focal length and horizon are room constants. Keep their
        // divisions out of the frame loop on the ARM7TDMI.
        if(circuit_floor_basis_room!=&room) {
            for(int y=0;y<160;++y) circuit_floor_basis[y]=gbs::racing_camera_floor_basis(room.perspective_camera,visual->horizon_y,y);
            circuit_floor_basis_room=&room;
        }
        const auto camera=gbs::racing_camera_pose({runtime_state.position_x256,runtime_state.position_y256},runtime_state.heading_x256,room.perspective_camera);
        for(int y=0;y<160;++y) {
            const auto line=gbs::racing_camera_floor_from_basis(camera,circuit_floor_basis[y]);
            pseudo3d_affine_raster[y]={line.pa,line.pc,line.reference_x_8,line.reference_y_8,line.visible};
        }
        pseudo3d_affine_raster[160]=pseudo3d_affine_raster[0];
    } else {
    const gbs::RacingAffineRasterFrame raster = gbs::make_racing_affine_raster_frame(
        runtime_state,
        room,
        visual->horizon_y
    );
    runtime_telemetry.seen_tile_effects = 151;
    for (size_t index = 0; index < gbs::hblank_affine_raster_line_count; ++index) {
        const gbs::RacingAffineRasterLine& line = raster.lines[index];
        pseudo3d_affine_raster[index] = gbs::HBlankAffineRasterLine {
            line.pa,
            line.pc,
            line.reference_x_8,
            line.reference_y_8,
            line.floor_visible
        };
    }
    }
    runtime_telemetry.seen_tile_effects = 152;
    gbs::set_hblank_affine_raster(gbs::BackgroundLayer::BG2, pseudo3d_affine_raster, gbs::hblank_affine_raster_line_count);
    runtime_telemetry.seen_tile_effects = 153;
    draw_pseudo3d_hud(room);
    runtime_telemetry.seen_tile_effects = 154;
}

void append_hud_text(char* buffer, size_t capacity, size_t& length, const char* text) {
    if (buffer == nullptr || text == nullptr || length >= capacity) return;
    while (*text != '\0' && length + 1 < capacity) {
        buffer[length++] = *text++;
    }
    buffer[length] = '\0';
}

void append_hud_number(char* buffer, size_t capacity, size_t& length, unsigned int value) {
    char digits[10] {};
    size_t digit_count = 0;
    do {
        digits[digit_count++] = static_cast<char>('0' + (value % 10));
        value /= 10;
    } while (value > 0 && digit_count < sizeof(digits));
    while (digit_count > 0 && length + 1 < capacity) {
        buffer[length++] = digits[--digit_count];
    }
    if (length < capacity) buffer[length] = '\0';
}

void draw_racing_hud(const gbs::RacingRoomData& room) {
    const int maximum_speed = gbs::racing_boost_max_speed_x256(room, runtime_state);
    const unsigned int speed = maximum_speed > 0
        ? static_cast<unsigned int>(clamp_int((runtime_state.speed_x256 * 99) / maximum_speed, 0, 99))
        : 0;
    const unsigned int laps = room.config.pseudo3d.laps_to_win > 0
        ? room.config.pseudo3d.laps_to_win
        : 1;
    const unsigned int lap = runtime_state.lap_count >= laps ? laps : runtime_state.lap_count + 1;
    const unsigned int position = gbs::racing_position_for_hud(runtime_state, room);
    const auto* layout = gbs::active_hud_layout();
    if (layout && std::strcmp(layout->id, "hud-neutral-corrida") == 0) {
        const auto compact = gbs::compact_racing_hud_text(lap, laps, position,
            static_cast<unsigned int>(room.actor_count + 1), speed);
        const char* slots[] = { compact.lap, compact.position, compact.speed };
        gbs::set_hud_text_slots(racing_hud, slots, 3);
        gbs::draw_hud(racing_hud);
        return;
    }
    if (gbs::racing_uses_topdown_track(room)) {
        char lap_text[16] {};
        char position_text[16] {};
        char speed_text[16] {};
        size_t lap_length = 0;
        size_t position_length = 0;
        size_t speed_length = 0;
        append_hud_text(lap_text, sizeof(lap_text), lap_length, "LAP ");
        append_hud_number(lap_text, sizeof(lap_text), lap_length, lap);
        append_hud_text(lap_text, sizeof(lap_text), lap_length, "/");
        append_hud_number(lap_text, sizeof(lap_text), lap_length, laps);
        append_hud_text(position_text, sizeof(position_text), position_length, "P");
        append_hud_number(position_text, sizeof(position_text), position_length, position);
        append_hud_text(position_text, sizeof(position_text), position_length, "/");
        append_hud_number(position_text, sizeof(position_text), position_length,
            static_cast<unsigned int>(room.actor_count + 1));
        append_hud_text(speed_text, sizeof(speed_text), speed_length, "SPD ");
        append_hud_number(speed_text, sizeof(speed_text), speed_length, speed);
        const char* slots[] = { lap_text, position_text, speed_text };
        gbs::set_hud_text_slots(racing_hud, slots, 3);
        gbs::draw_hud(racing_hud);
        return;
    }
    char left_text[16] {};
    char right_text[16] {};
    size_t left_length = 0;
    size_t right_length = 0;
    append_hud_text(left_text, sizeof(left_text), left_length, "SPD ");
    append_hud_number(left_text, sizeof(left_text), left_length, speed);
    append_hud_text(left_text, sizeof(left_text), left_length, " LAP ");
    append_hud_number(left_text, sizeof(left_text), left_length, lap);
    append_hud_text(left_text, sizeof(left_text), left_length, "/");
    append_hud_number(left_text, sizeof(left_text), left_length, laps);
    append_hud_text(right_text, sizeof(right_text), right_length, "POS ");
    append_hud_number(right_text, sizeof(right_text), right_length, position);
    append_hud_text(right_text, sizeof(right_text), right_length, "/2 BST ");
    append_hud_number(right_text, sizeof(right_text), right_length, runtime_state.boost_charges);
    gbs::set_hud_text(racing_hud, left_text, right_text);
    gbs::draw_hud(racing_hud);
}

void draw_track() {
    const gbs::RacingRoomData& room = project.rooms[current_room_index];
    if (gbs::racing_uses_pseudo3d(room)) {
        if (pseudo3d_visual(room) == nullptr && has_authored_background(room)) return;
        draw_pseudo3d_track(room);
        return;
    }
    if (has_authored_background(room)) {
        return;
    }
    const int player_tile_x = (runtime_state.position_x256 / 256) / 8;
    const int player_tile_y = (runtime_state.position_y256 / 256) / 8;
    for (int screen_y = 0; screen_y < 20; ++screen_y) {
        for (int screen_x = 0; screen_x < 30; ++screen_x) {
            const int world_x = player_tile_x + screen_x - 15;
            const int world_y = player_tile_y + screen_y - 14;
            const bool blocked = world_x < 0 || world_y < 0 ||
                world_x >= room.width_tiles || world_y >= room.height_tiles ||
                (room.collision_flags[world_y * room.width_tiles + world_x] & 0x1F) != 0;
            const uint16_t tile = blocked ? 2 : ((world_y & 3) == 0 ? 1 : 0);
            gbs::set_bg_tile(gbs::BackgroundLayer::BG1, screen_x, screen_y, 32, 32, tile);
        }
    }
    gbs::set_bg_tile(gbs::BackgroundLayer::BG1, 15, 14, 32, 32, 3);
    const uint16_t speed_tile = static_cast<uint16_t>(4 +
        (runtime_state.speed_x256 * 3) / room.config.max_speed_x256);
    gbs::set_bg_tile(gbs::BackgroundLayer::BG1, 1, 1, 32, 32, speed_tile);
}

const gbs::RacingVehicleAnimationSet& current_vehicle_clips() {
    const auto* visual = project.rooms[current_room_index].player_visual;
    return visual ? visual->animations : project.player_animations;
}

const gbs::MetaSprite* current_vehicle_sprite() {
    const auto* sprite = gbs::current_metasprite(vehicle_animator);
    if(sprite) {
        const auto& frame=vehicle_animator.animation->frames[vehicle_animator.frame_index];
        if(frame.streamed_tile_asset && frame.streamed_tile_asset != vehicle_loaded_frame &&
           gbs::load_tiles(*frame.streamed_tile_asset)) vehicle_loaded_frame=frame.streamed_tile_asset;
        return sprite;
    }
    const auto* visual = project.rooms[current_room_index].player_visual;
    const auto* idle = visual ? visual->idle : project.player_idle_metasprite;
    const auto* drive = visual ? visual->drive : project.player_drive_metasprite;
    return runtime_state.speed_x256 > 0 && drive ? drive : idle;
}

void draw_pseudo3d_actors(const gbs::RacingRoomData& room, bool controls_active) {
    (void)controls_active;
    gbs::hide_all_sprites();
    const auto* player_sprite=current_vehicle_sprite();
    int sprite_index=0;
    const auto* visual=pseudo3d_visual(room);
    const int horizon=visual ? visual->horizon_y : 48;
    const auto camera=gbs::racing_camera_pose({runtime_state.position_x256,runtime_state.position_y256},runtime_state.heading_x256,room.perspective_camera);
    const auto player_point=gbs::racing_camera_project(camera,{runtime_state.position_x256,runtime_state.position_y256},room.perspective_camera,horizon);
    if(player_sprite) {
        gbs::set_metasprite(0,*player_sprite,{120,gbs::racing_uses_circuit_track(room)?player_point.y:120});
        sprite_index+=player_sprite->part_count;
    }
    if(gbs::racing_uses_circuit_track(room)) {
        // Near objects take earlier OAM entries and cover more distant ones.
        gbs::RacingProjectedPoint points[31]{};
        int order[31]{};int count=0;
        for(size_t i=0;i<room.actor_count && i<31;++i) {
            if(!room.actors[i].metasprite) continue;
            const auto pose=gbs::racing_topdown_rival_pose(runtime_state,room,i);
            const auto point=gbs::racing_camera_project(camera,{pose.position_pixels.x*256,pose.position_pixels.y*256},room.perspective_camera,horizon);
            if(point.visible) {points[i]=point;order[count++]=static_cast<int>(i);}
        }
        for(int i=1;i<count;++i) {const int value=order[i];int j=i;while(j>0&&points[order[j-1]].depth_x256>points[value].depth_x256){order[j]=order[j-1];--j;}order[j]=value;}
        for(int i=0;i<count&&sprite_index<64;++i) {
            const int index=order[i];const auto& point=points[index];const auto& sprite=*room.actors[index].metasprite;
            const int scale=clamp_int(point.scale_x256,24,256);
            for(size_t part_index=0;part_index<sprite.part_count && sprite_index<64;++part_index) {
                const auto& part=sprite.parts[part_index];
                const int center_x=point.x+(part.x+part.width/2)*scale/256;
                const int center_y=point.y+(part.y+part.height/2)*scale/256;
                gbs::Sprite object {center_x-part.width/2,center_y-part.height/2,part.tile_index,part.palette,false,false,true,0,gbs::SpriteRenderMode::Normal,false,part.width,part.height};
                object.color_depth=part.color_depth;object.affine=true;object.affine_matrix=static_cast<uint8_t>(index+1);
                gbs::set_affine_sprite_transform(object.affine_matrix,{static_cast<int16_t>(65536/scale),0,0,static_cast<int16_t>(65536/scale)});
                gbs::set_sprite(sprite_index++,object);
            }
        }
        return;
    }
    if(room.actor_count == 0 || !room.actors[0].metasprite) return;
    const int relative=(runtime_state.rival_distance_x256-runtime_state.distance_x256)/256;
    if(relative < -4 || relative > 52) return;
    const int y=clamp_int(118-relative*2,44,118);
    const auto line=gbs::racing_perspective_line(runtime_state,room,y);
    gbs::set_metasprite(sprite_index,*room.actors[0].metasprite,{line.center_x,y});
}

bool draw_topdown_vehicle(
    int sprite_index,
    const gbs::MetaSprite& metasprite,
    gbs::Vec2i position,
    uint8_t heading,
    uint8_t matrix_index
) {
    if (metasprite.part_count != 1 || metasprite.parts == nullptr || matrix_index >= 32) return false;
    const gbs::MetaSpritePart& part = metasprite.parts[0];
    if (part.width != 32 || part.height != 32) return false;
    gbs::Sprite sprite {
        position.x + part.x,
        position.y + part.y,
        part.tile_index,
        part.palette,
        false,
        false,
        true,
        0,
        gbs::SpriteRenderMode::Normal,
        false,
        part.width,
        part.height
    };
    sprite.color_depth = part.color_depth;
    sprite.affine = true;
    sprite.affine_matrix = matrix_index;
    if (!gbs::set_affine_sprite_transform(matrix_index,
            gbs::racing_vehicle_sprite_transform(heading))) return false;
    gbs::set_sprite(sprite_index, sprite);
    return true;
}

void draw_actors(bool controls_active) {
    const gbs::RacingRoomData& room = project.rooms[current_room_index];
    if (gbs::racing_uses_pseudo3d(room)) {
        draw_pseudo3d_actors(room, controls_active);
        return;
    }
    gbs::hide_all_sprites();
    const gbs::MetaSprite* player_sprite = current_vehicle_sprite();
    int sprite_index = 0;
    if (player_sprite != nullptr) {
        const gbs::Vec2i position {
            runtime_state.position_x256 / 256 - camera_x,
            runtime_state.position_y256 / 256 - camera_y
        };
        if (!gbs::racing_uses_topdown_track(room) ||
            !draw_topdown_vehicle(sprite_index, *player_sprite, position, gbs::racing_vehicle_sprite_heading(current_vehicle_clips(),runtime_state.heading), 0)) {
            gbs::set_metasprite(sprite_index, *player_sprite, position);
        }
        sprite_index += player_sprite->part_count;
    }
    for (size_t index = 0; index < room.actor_count && sprite_index < 128; ++index) {
        const gbs::RacingActorData& actor = room.actors[index];
        if (actor.metasprite == nullptr) continue;
        const gbs::RacingTopdownPose rival_pose = gbs::racing_topdown_rival_pose(runtime_state, room, index);
        const gbs::Vec2i actor_position = gbs::racing_uses_topdown_track(room)
            ? rival_pose.position_pixels : actor.position_pixels;
        const gbs::Vec2i screen_position { actor_position.x - camera_x, actor_position.y - camera_y };
        if (screen_position.x < -32 || screen_position.x > 272 || screen_position.y < -32 || screen_position.y > 192) continue;
        if (!gbs::racing_uses_topdown_track(room) || index >= 31 ||
            !draw_topdown_vehicle(sprite_index, *actor.metasprite, screen_position,
                rival_pose.heading, static_cast<uint8_t>(index + 1))) {
            gbs::set_metasprite(sprite_index, *actor.metasprite, screen_position);
        }
        sprite_index += actor.metasprite->part_count;
    }
}

void update_triggers() {
    const gbs::RacingRoomData& room = project.rooms[current_room_index];
    const int player_x = runtime_state.position_x256 / 256;
    const int player_y = runtime_state.position_y256 / 256;
    const gbs::Rect player_area { player_x - 8, player_y - 16, 16, 32 };
    const size_t count = room.trigger_count < max_runtime_triggers ? room.trigger_count : max_runtime_triggers;
    for (size_t index = 0; index < count; ++index) {
        const gbs::RuntimeTriggerResult result = gbs::update_runtime_trigger(room.triggers[index], trigger_states[index], player_area);
        const gbs::EventScript script = gbs::runtime_trigger_script_for_result(room.triggers[index], result);
        if (gbs::has_event_script(script)) {
            start_runtime_event_script(script);
            return;
        }
    }
}

void dispatch_race_result() {
    const gbs::RacingRoomData& room = project.rooms[current_room_index];
    if (race_result_dispatched) return;
    const gbs::RacingRaceResult result = gbs::racing_result(runtime_state);
    const gbs::EventScript script = result == gbs::RacingRaceResult::Victory
        ? room.on_victory
        : result == gbs::RacingRaceResult::Defeat
            ? room.on_defeat
            : gbs::empty_event_script();
    if (gbs::has_event_script(script)) {
        race_result_dispatched = start_runtime_event_script(script);
    }
}

void reset_trigger_states() {
    for (size_t index = 0; index < max_runtime_triggers; ++index) {
        trigger_states[index] = gbs::RuntimeTriggerState {};
    }
}

gbs::RacingInput racing_input(const gbs::InputState& input) {
    const int steering = input.is_held(gbs::ButtonLeft) ? -1 :
        input.is_held(gbs::ButtonRight) ? 1 : 0;
    return {
        input.is_held(gbs::ButtonUp) || input.is_held(gbs::ButtonA),
        input.is_held(gbs::ButtonDown) || input.is_held(gbs::ButtonB),
        steering,
        input.was_pressed(gbs::ButtonL)
    };
}

} // namespace

int initialize_racing_runtime() {
    gbs::init();
    gbs::init_dialogue(dialogue);
    gbs::init_hud(racing_hud);
    gbs::init_sprite_animator(vehicle_animator);
    vehicle_loaded_frame=nullptr;
    gbs::init_event_state(event_state);
    gbs::init_event_runner(runtime_event_runner);
    gbs::reset_runtime_telemetry();
    gbs::set_backdrop_color(gbs::rgb15(4, 12, 4));
    if (!gbs::is_valid_racing_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) gbs::wait_vblank();
    }
    current_room_index = project.initial_room;
    int entry_x = 0;
    int entry_y = 0;
    int restore_slot_index = -1;
    bool restored = false;
    bool resumed_from_transition = false;
#if GBS_MULTI_RUNTIME
    const bool restore_entry = gbs::consume_runtime_save_restore(
        gbs::RuntimeKind::Racing,
        restore_slot_index
    );
    if (restore_entry) {
        restored = restore_racing_runtime_state(restore_slot_index);
        if (!restored) {
            return -1;
        }
    } else {
        resumed_from_transition = gbs::consume_runtime_transition(
            gbs::RuntimeKind::Racing,
            event_state,
            current_room_index,
            entry_x,
            entry_y
        );
    }
#else
    restored = restore_racing_runtime_state(-1);
#endif
    gbs::init_resource_manager(resource_manager);
    if (current_room_index < 0 || static_cast<size_t>(current_room_index) >= project.room_count) {
        current_room_index = project.initial_room;
    }
    if (!restored) {
        runtime_state = gbs::make_racing_runtime_state(project.rooms[current_room_index]);
        race_result_dispatched = false;
    }
    if (resumed_from_transition && !restored) {
        const gbs::Vec2i requested { entry_x, entry_y };
        if (!gbs::racing_position_blocked(project.rooms[current_room_index], requested)) {
            runtime_state.position_x256 = entry_x * 256;
            runtime_state.position_y256 = entry_y * 256;
        }
    }
    reset_trigger_states();
    if (!stream_resources_for_room(project.rooms[current_room_index])) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) gbs::wait_vblank();
    }
    apply_room_visuals();
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(project.rooms[current_room_index].name);
    if (!restored) {
        start_runtime_event_script(project.rooms[current_room_index].on_enter);
    }
    return 0;
}

gbs::RuntimeAdapterFrameResult update_racing_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    gbastudio_dialogue_ui::configure_for_scene(project.rooms[current_room_index].name);
    const gbs::InputState input = gbs::begin_frame().input;
    runtime_telemetry.seen_tile_effects = 100;
    gbs::tick_event_frame_counter(event_state);
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_requested()) {
        gbs::consume_scene_transition_visual_effect_event(event_state);
        return gbs::runtime_transition_pending()
            ? gbs::RuntimeAdapterFrameResult::Transition
            : gbs::RuntimeAdapterFrameResult::Continue;
    }
#endif
    gbs::set_event_input_state(event_state, input.held, input.pressed, input.released);
    gbs::update_hud_behavior(event_state, racing_hud.visible);
    const bool script_active = update_runtime_event_script(input);
    runtime_telemetry.seen_tile_effects = 110;
    const gbs::RacingInput controls = gbs::racing_runtime_input(
        racing_input(input),
        script_active
    );
    racing_controls_active = controls.accelerate || controls.brake || controls.steering != 0 || controls.use_item;
    if (!script_active) {
        gbs::tick_racing_vehicle(runtime_state, project.rooms[current_room_index], controls);
        const auto& room = project.rooms[current_room_index];
        gbs::update_racing_vehicle_animator(vehicle_animator,current_vehicle_clips(),runtime_state.speed_x256,controls,runtime_state.collision_frames>0,
            gbs::racing_uses_pseudo3d(room) ? 0 : runtime_state.heading);
        dispatch_race_result();
    }
    runtime_telemetry.seen_tile_effects = 120;
    update_camera();
    runtime_telemetry.seen_tile_effects = 130;
    gbs::set_event_player_actor_state(event_state, runtime_state.position_x256 / 256, runtime_state.position_y256 / 256, 0, 8);
    if (!script_active) {
        update_triggers();
    }
    runtime_telemetry.seen_tile_effects = 140;
    update_screen_fade();
    runtime_telemetry.seen_tile_effects = 150;
#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        return gbs::RuntimeAdapterFrameResult::Transition;
    }
#endif
    return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_racing_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    if (!dialogue.visible) {
        // The hidden dialogue clears its previous BG0 rectangle. Do that
        // before drawing the HUD, whose speed panel may occupy the same rows.
        gbs::draw_dialogue(dialogue);
    }
    draw_track();
    runtime_telemetry.seen_tile_effects = 160;
    draw_actors(racing_controls_active);
    draw_racing_hud(project.rooms[current_room_index]);
    runtime_telemetry.seen_tile_effects = 170;
    sync_runtime_telemetry();
    if (dialogue.visible) {
        gbs::draw_dialogue(dialogue);
    }
    gbs::wait_vblank();
}

void leave_racing_runtime() {
    gbs::release_resource_bank_group(resource_manager, active_resource_banks);
}

extern "C" void GBS_RACING_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    racing_initialization_result = initialize_racing_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_RACING_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_racing_runtime(context);
}

extern "C" void GBS_RACING_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_racing_runtime(context);
}

extern "C" void GBS_RACING_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_racing_runtime();
}

extern "C" int GBS_RACING_RUNTIME_ENTRY() {
    racing_initialization_result = initialize_racing_runtime();
    if (racing_initialization_result != 0) {
        leave_racing_runtime();
        return racing_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::Racing,
            current_room_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_racing_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_racing_runtime();
            return -1;
        }
        render_racing_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_racing_runtime();
            return 0;
        }
    }
}
