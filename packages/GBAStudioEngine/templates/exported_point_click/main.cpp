#include "gbs/engine.hpp"
#include "gbs/animation.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/point_click.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/runtime_save_restore.hpp"
#include "gbs/save.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#include "point_click_project_data.hpp"
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_POINT_CLICK_RUNTIME_ENTRY
#define GBS_POINT_CLICK_RUNTIME_ENTRY gbs_main
#endif

#ifndef GBS_POINT_CLICK_RUNTIME_ENTER
#define GBS_POINT_CLICK_RUNTIME_ENTER gbs_enter_point_click
#endif

#ifndef GBS_POINT_CLICK_RUNTIME_UPDATE
#define GBS_POINT_CLICK_RUNTIME_UPDATE gbs_update_point_click
#endif

#ifndef GBS_POINT_CLICK_RUNTIME_RENDER
#define GBS_POINT_CLICK_RUNTIME_RENDER gbs_render_point_click
#endif

#ifndef GBS_POINT_CLICK_RUNTIME_LEAVE
#define GBS_POINT_CLICK_RUNTIME_LEAVE gbs_leave_point_click
#endif

namespace {

const gbs::PointClickProjectData& project = gbastudio_point_click_project::project;

gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::HudState hud;
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
gbs::PointClickCursorState cursor;
gbs::SpriteAnimatorState cursor_animator;
const gbs::TileAsset* cursor_streamed_tile_asset_loaded = nullptr;
constexpr size_t max_point_click_props = 6;
constexpr int point_click_prop_first_sprite = 32;
constexpr int point_click_oam_sprite_count = 128;
gbs::SpriteAnimatorState point_click_prop_animators[max_point_click_props];
const gbs::TileAsset* prop_streamed_tile_assets_loaded[max_point_click_props] = {};
volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
    int current_scene_index = 0;
    int pending_scene_index = -1;
    uint32_t point_click_save_sequence = 0;
    int point_click_initialization_result = -1;
    char hud_left_buffer[16] = {};
char hud_right_buffer[16] = {};
int runtime_last_scene = -1;
uint32_t runtime_scene_change_count = 0;

#if GBS_MULTI_RUNTIME
struct PointClickRuntimeSnapshot {
    gbs::PointClickSaveData state;
    int music_index;
    int tracker_index;
};
int active_music_index = -1;
int active_tracker_index = -1;

bool capture_universal_point_click_state(gbs::UniversalSaveData& data) {
    PointClickRuntimeSnapshot snapshot {};
    gbs::capture_point_click_save_data(snapshot.state, current_scene_index, cursor, event_state, gbs::frame_count());
    snapshot.music_index = active_music_index;
    snapshot.tracker_index = active_tracker_index;
    static_assert(sizeof(snapshot) <= gbs::universal_save_payload_capacity, "point-click save exceeds universal payload");
    return gbs::make_universal_save_data(data, gbs::UniversalSaveRuntime::PointClick,
        current_scene_index, cursor.position_pixels.x, cursor.position_pixels.y, 0, 0,
        event_state.variables, gbs::universal_save_variable_count,
        event_state.inventory, gbs::universal_save_inventory_count,
        event_state.equipped_items, gbs::universal_save_equipment_slot_count,
        gbs::frame_count(), 0, &snapshot, sizeof(snapshot),
        event_state.text_variables, gbs::text_variable_count);
}

bool restore_universal_point_click_state(int slot_index) {
    gbs::RuntimeSaveService* service = gbs::active_runtime_save_service();
    if (service == nullptr) return false;
    gbs::UniversalSaveData data {};
    PointClickRuntimeSnapshot snapshot {};
    snapshot.music_index = snapshot.tracker_index = -1;
    if (gbs::read_runtime_save(*service, slot_index, data) != gbs::SaveStatus::Ok ||
        (!gbs::read_universal_save_payload(data, gbs::UniversalSaveRuntime::PointClick, &snapshot, sizeof(snapshot)) &&
         !gbs::read_universal_save_payload(data, gbs::UniversalSaveRuntime::PointClick, &snapshot.state, sizeof(snapshot.state))) ||
        data.room_index != snapshot.state.scene_index ||
        snapshot.music_index < -1 || snapshot.tracker_index < -1 ||
        (snapshot.music_index >= 0 && static_cast<size_t>(snapshot.music_index) >= project.music_asset_count) ||
        (snapshot.tracker_index >= 0 && static_cast<size_t>(snapshot.tracker_index) >= project.tracker_asset_count) ||
        !gbs::apply_point_click_save_data(project, snapshot.state, current_scene_index, cursor, event_state) ||
        !gbs::restore_suspended_common_state(data, event_state)) return false;
    active_music_index = snapshot.music_index;
    active_tracker_index = snapshot.tracker_index;
    if (active_music_index >= 0) gbs::play_music(project.music_assets[active_music_index]);
    if (active_tracker_index >= 0) gbs::play_tracker_music(project.tracker_assets[active_tracker_index]);
    event_state.current_room = current_scene_index;
    event_state.player_x = cursor.position_pixels.x;
    event_state.player_y = cursor.position_pixels.y;
    return true;
}

void consume_point_click_save_request() {
    const int request = event_state.save_request;
    if (request == 0) return;
    const int slot_index = event_state.save_request_slot;
    event_state.save_request = 0;
    event_state.save_request_slot = -1;
    gbs::RuntimeSaveService* service = gbs::active_runtime_save_service();
    if (service == nullptr) return;
    if (request == 1) {
        gbs::UniversalSaveData data {};
        if (capture_universal_point_click_state(data)) {
            const auto metadata = gbs::make_save_metadata("POINT CLICK", gbs::frame_count(), 0,
                static_cast<uint16_t>(current_scene_index), 0);
            gbs::write_runtime_save(*service, slot_index, data, metadata);
        }
    } else if (request == 2) {
        gbs::request_universal_save_restore(service->bank, slot_index,
            gbs::runtime_availability(gbs::RuntimeKind::PointClick));
    } else if (request == 3) {
        gbs::clear_runtime_save(*service, slot_index);
    }
}
#endif

constexpr size_t max_resource_bank_reservations = 64;
gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations] __attribute__((section(".ewram_bss"))) = {};
gbs::ResourceBankBatchReservation active_resource_bank_group {
    active_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false
};
gbs::ResourceBankBatchReservation scratch_resource_bank_group {
    scratch_resource_bank_reservations,
    max_resource_bank_reservations,
    0,
    nullptr,
    false
};

void reset_resource_bank_groups() {
    for (size_t index = 0; index < max_resource_bank_reservations; ++index) {
        active_resource_bank_reservations[index] = gbs::ResourceBankReservation {};
        scratch_resource_bank_reservations[index] = gbs::ResourceBankReservation {};
    }
    active_resource_bank_group = gbs::ResourceBankBatchReservation {
        active_resource_bank_reservations,
        max_resource_bank_reservations,
        0,
        nullptr,
        false
    };
    scratch_resource_bank_group = gbs::ResourceBankBatchReservation {
        scratch_resource_bank_reservations,
        max_resource_bank_reservations,
        0,
        nullptr,
        false
    };
}

void sync_runtime_telemetry() {
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = current_scene_index;
    runtime_telemetry.flag_bits = 0;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) {
            runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
        }
    }
    runtime_telemetry.player_x = cursor.position_pixels.x;
    runtime_telemetry.player_y = cursor.position_pixels.y;
    runtime_telemetry.player_direction = 0;
    runtime_telemetry.actor_count = 0;
    runtime_telemetry.first_actor_x = -1;
    runtime_telemetry.first_actor_y = -1;
    runtime_telemetry.first_actor_direction = -1;
    runtime_telemetry.first_actor_visible = 0;
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    runtime_telemetry.current_tile_flags = 0;
    runtime_telemetry.current_tile_slope = 0;
    if (runtime_last_scene < 0) {
        runtime_last_scene = current_scene_index;
    } else if (runtime_last_scene != current_scene_index) {
        ++runtime_scene_change_count;
        runtime_last_scene = current_scene_index;
    }
    runtime_telemetry.room_change_count = runtime_scene_change_count;
    gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
}

constexpr uint16_t cursor_palette_colors[] = {
    gbs::rgb15(0, 0, 0),
    gbs::rgb15(0, 0, 0),
    gbs::rgb15(31, 6, 6),
    gbs::rgb15(31, 31, 31),
};

constexpr uint8_t cursor_tile_data[] = {
    0x01, 0x00, 0x00, 0x00,
    0x11, 0x00, 0x00, 0x00,
    0x21, 0x01, 0x00, 0x00,
    0x21, 0x12, 0x00, 0x00,
    0x21, 0x22, 0x01, 0x00,
    0x21, 0x11, 0x00, 0x00,
    0x31, 0x01, 0x00, 0x00,
    0x00, 0x10, 0x00, 0x00,
};

constexpr gbs::PaletteAsset cursor_palette_asset = {
    cursor_palette_colors,
    static_cast<uint16_t>(sizeof(cursor_palette_colors) / sizeof(cursor_palette_colors[0])),
    0
};

constexpr gbs::TileAsset cursor_tile_asset = {
    cursor_tile_data,
    1,
    0,
    true
};

void append_char(char*& cursor_text, const char* end, char value) {
    if (cursor_text < end) {
        *cursor_text = value;
        ++cursor_text;
        *cursor_text = '\0';
    }
}

void append_text(char*& cursor_text, const char* end, const char* text) {
    if (text == nullptr) {
        return;
    }
    while (*text != '\0' && cursor_text < end) {
        append_char(cursor_text, end, *text);
        ++text;
    }
}

bool point_click_scene_uses_authored_hud() {
    const char* scene_name = gbs::point_click_scene_name(project, current_scene_index);
    return scene_name != nullptr && gbastudio_dialogue_ui::has_hud_scene_binding(scene_name);
}

void refresh_hud() {
    char* left = hud_left_buffer;
    const char* left_end = hud_left_buffer + sizeof(hud_left_buffer) - 1;
    if (!point_click_scene_uses_authored_hud()) {
        gbs::hide_hud(hud);
        return;
    }
    hud_left_buffer[0] = '\0';
    const char* scene_name = gbs::point_click_scene_name(project, current_scene_index);
    append_text(left, left_end, scene_name != nullptr ? scene_name : "SCENE");

    char* right = hud_right_buffer;
    const char* right_end = hud_right_buffer + sizeof(hud_right_buffer) - 1;
    hud_right_buffer[0] = '\0';
    append_text(right, right_end, "IT ");
    const char* item_name = gbs::point_click_selected_item_name(project, cursor);
    append_text(right, right_end, item_name != nullptr ? item_name : "-");
    gbs::set_hud_text(hud, hud_left_buffer, hud_right_buffer);
}

void load_cursor_assets() {
    if (project.cursor_metasprite != nullptr) {
        if (project.resource_bank_group_count == 0) {
            for (size_t index = 0; index < project.obj_palette_count; ++index) {
                gbs::load_palette(project.obj_palettes[index], true);
            }
        }
        return;
    }
    gbs::load_palette(cursor_palette_asset, true);
    gbs::load_tiles(cursor_tile_asset);
}

void stream_scene_resource_group(const gbs::PointClickSceneData& scene) {
    for (auto& asset : prop_streamed_tile_assets_loaded) asset = nullptr;
    if (project.resource_bank_group_count == 0) {
        return;
    }

    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_point_click_scene(project, scene);
    if (group.bank_count == 0) {
        return;
    }

    gbs::stream_resource_bank_group_with_uploads(
        resource_manager,
        active_resource_bank_group,
        scratch_resource_bank_group,
        group,
        gbastudio_point_click_project::resource_bank_upload_sources,
        gbastudio_point_click_project::resource_bank_upload_source_count
    );
    cursor_streamed_tile_asset_loaded = nullptr;
}

void draw_cursor() {
    if (project.cursor_metasprite != nullptr) {
        if (cursor_animator.animation != nullptr && cursor_animator.animation->frames != nullptr) {
            const auto& frame = cursor_animator.animation->frames[cursor_animator.frame_index];
            if (frame.streamed_tile_asset != nullptr && frame.streamed_tile_asset != cursor_streamed_tile_asset_loaded) {
                if (gbs::load_tiles(*frame.streamed_tile_asset)) cursor_streamed_tile_asset_loaded = frame.streamed_tile_asset;
            }
        }
        const gbs::MetaSprite* cursor_metasprite = gbs::current_metasprite(cursor_animator);
        if (cursor_metasprite == nullptr) {
            cursor_metasprite = project.cursor_metasprite;
        }
        gbs::set_metasprite(0, *cursor_metasprite, cursor.position_pixels);
        return;
    }
    gbs::set_sprite(0, gbs::Sprite {
        cursor.position_pixels.x,
        cursor.position_pixels.y,
        cursor_tile_asset.destination_tile,
        0,
        false,
        false,
        true,
        0,
        gbs::SpriteRenderMode::Normal
    });
    const bool has_selected_item = cursor.selected_item_index >= 0;
    gbs::set_sprite(1, gbs::Sprite {
        8,
        8,
        cursor_tile_asset.destination_tile,
        0,
        false,
        false,
        has_selected_item,
        0,
        gbs::SpriteRenderMode::Normal
    });
}

void apply_backgrounds(const gbs::PointClickSceneData& scene) {
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);

    const bool assets_are_streamed = project.resource_bank_group_count > 0;
    bool assets_loaded = false;
    for (size_t index = 0; index < gbs::point_click_scene_background_count(scene); ++index) {
        const int background_index = gbs::point_click_scene_background_at(scene, index);
        if (!gbs::is_valid_point_click_background_index(project, background_index) || background_index < 0) {
            continue;
        }
        const gbs::PointClickBackgroundData& background = project.backgrounds[background_index];
        if (!assets_loaded && !assets_are_streamed) {
            for (size_t palette_index = 0; palette_index < project.bg_palette_count; ++palette_index) {
                gbs::load_palette(project.bg_palettes[palette_index], false);
            }
            for (size_t tile_index = 0; tile_index < project.tile_asset_count; ++tile_index) {
                gbs::load_tiles(project.tile_assets[tile_index]);
            }
            assets_loaded = true;
        }
        if (index == 0) {
            gbs::set_backdrop_color(background.backdrop_color);
        }
        gbs::set_bg_scroll(background.layer, 0, 0);
        gbs::load_tilemap(background.layer, background.tilemap);
        gbs::set_bg_enabled(background.layer, true);
    }
}

void draw_point_click_props(const gbs::PointClickSceneData& scene) {
    int next_sprite = point_click_prop_first_sprite;
    for (size_t index = 0; index < scene.prop_count && index < max_point_click_props; ++index) {
        const gbs::PointClickPropData& prop = scene.props[index];
        if (!gbs::point_click_prop_is_visible(prop, event_state)) {
            continue;
        }
        const gbs::MetaSprite* metasprite = prop.metasprite;
        if (prop.idle_animation != nullptr) {
            gbs::SpriteAnimatorState& animator = point_click_prop_animators[index];
            if (animator.animation != prop.idle_animation) {
                gbs::play_sprite_animation(animator, *prop.idle_animation);
            }
            gbs::update_sprite_animator(animator);
            const gbs::MetaSprite* animated_metasprite = gbs::current_metasprite(animator);
            if (!gbs::sync_sprite_animation_tiles(animator, prop_streamed_tile_assets_loaded[index])) continue;
            if (animated_metasprite != nullptr) {
                metasprite = animated_metasprite;
            }
        }
        if (metasprite == nullptr || !gbs::is_valid_metasprite(*metasprite) ||
            next_sprite + metasprite->part_count > point_click_oam_sprite_count) {
            continue;
        }
        gbs::set_metasprite(next_sprite, *metasprite, prop.position_pixels);
        next_sprite += metasprite->part_count;
    }
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
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, event_state.last_dialogue);
        event_state.last_dialogue = -1;
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
#if GBS_MULTI_RUNTIME
            active_music_index = event_state.last_music;
            active_tracker_index = -1;
#endif
        }
        event_state.last_music = -1;
    }
    if (event_state.last_tracker_music >= 0) {
        if (static_cast<size_t>(event_state.last_tracker_music) < project.tracker_asset_count) {
            gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music]);
#if GBS_MULTI_RUNTIME
            active_tracker_index = event_state.last_tracker_music;
            active_music_index = -1;
#endif
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
    if (event_state.close_dialogue) {
        gbs::hide_dialogue(dialogue);
        event_state.close_dialogue = false;
    }
    if (event_state.stop_music) {
        gbs::stop_music();
        gbs::stop_tracker_music();
        gbs::stop_pcm_music();
        event_state.stop_music = false;
#if GBS_MULTI_RUNTIME
        active_music_index = active_tracker_index = -1;
#endif
    }
#if GBS_MULTI_RUNTIME
    consume_point_click_save_request();
#endif
}

void show_dialogue_line(int line_index) {
    if (gbs::is_valid_point_click_dialogue_line_index(project, line_index) && line_index >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, line_index);
    }
}

void persist_point_click_runtime_state() {
#if GBS_MULTI_RUNTIME
    // Shared campaign slots are written only by explicit SaveGame requests.
    return;
#else
    if (!gbastudio_point_click_project::save_enabled) {
        return;
    }
    gbs::PointClickSaveData save_data {};
    gbs::capture_point_click_save_data(save_data, current_scene_index, cursor, event_state, gbs::frame_count());
    ++point_click_save_sequence;
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "POINT CLICK",
        gbs::frame_count(),
        point_click_save_sequence,
        static_cast<uint16_t>(current_scene_index < 0 ? 0 : current_scene_index),
        0
    );
    gbs::write_save_slot_record(
        gbastudio_point_click_project::save_bank,
        0,
        &save_data,
        sizeof(save_data),
        metadata,
        point_click_save_sequence
    );
#endif
}

bool restore_point_click_runtime_state() {
    if (!gbastudio_point_click_project::save_enabled) {
        return false;
    }
    int latest_slot = gbs::find_latest_save_slot(gbastudio_point_click_project::save_bank);
    if (latest_slot < 0) {
        return false;
    }
    gbs::PointClickSaveData save_data {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_point_click_project::save_bank,
        static_cast<size_t>(latest_slot),
        &save_data,
        sizeof(save_data),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok || bytes_read != sizeof(save_data)) {
        return false;
    }
    if (!gbs::apply_point_click_save_data(project, save_data, current_scene_index, cursor, event_state)) {
        return false;
    }
    gbs::SaveInfo info = gbs::inspect_save_slot(gbastudio_point_click_project::save_bank, static_cast<size_t>(latest_slot));
    point_click_save_sequence = info.sequence;
    refresh_hud();
    return true;
}

void start_scene(int scene_index) {
    const gbs::PointClickSceneData* scene = gbs::point_click_scene_for(project, scene_index);
    if (scene == nullptr) {
        return;
    }
    current_scene_index = scene_index;
    event_state.current_room = current_scene_index;
    event_state.player_x = cursor.position_pixels.x;
    event_state.player_y = cursor.position_pixels.y;
    pending_scene_index = -1;
    stream_scene_resource_group(*scene);
    apply_backgrounds(*scene);
    gbs::run_event_script(event_state, scene->on_enter);
    consume_event_state();
    refresh_hud();
}

void start_pending_scene_if_ready() {
    if (!dialogue.visible && pending_scene_index >= 0) {
        start_scene(pending_scene_index);
        persist_point_click_runtime_state();
    }
}

void update_cursor(gbs::InputState input) {
    const gbs::PointClickSceneData* scene = gbs::point_click_scene_for(project, current_scene_index);
    int speed = scene != nullptr && scene->cursor_speed_pixels > 0
        ? scene->cursor_speed_pixels
        : (project.cursor_speed_pixels <= 0 ? 1 : project.cursor_speed_pixels);
    if (input.is_held(gbs::ButtonLeft)) {
        cursor.position_pixels.x -= speed;
    }
    if (input.is_held(gbs::ButtonRight)) {
        cursor.position_pixels.x += speed;
    }
    if (input.is_held(gbs::ButtonUp)) {
        cursor.position_pixels.y -= speed;
    }
    if (input.is_held(gbs::ButtonDown)) {
        cursor.position_pixels.y += speed;
    }
    cursor.position_pixels.x = gbs::clamp_int(cursor.position_pixels.x, 0, 239);
    cursor.position_pixels.y = gbs::clamp_int(cursor.position_pixels.y, 0, 159);
}

void cycle_selected_item() {
    cursor.selected_item_index = gbs::point_click_next_owned_item_index(
        project,
        event_state,
        cursor.selected_item_index
    );
    if (cursor.selected_item_index >= 0) {
        const gbs::PointClickInventoryItemData& item = project.inventory_items[cursor.selected_item_index];
        show_dialogue_line(item.dialogue_line_index);
    }
    refresh_hud();
    persist_point_click_runtime_state();
}

void queue_scene_transition(const gbs::PointClickSceneData& scene, int target_scene_index) {
    if (!gbs::is_valid_point_click_scene_index(project, target_scene_index)) {
        return;
    }
    gbs::run_event_script(event_state, scene.on_exit);
    consume_event_state();
    if (dialogue.visible) {
        pending_scene_index = target_scene_index;
        return;
    }
    start_scene(target_scene_index);
    persist_point_click_runtime_state();
}

void activate_hotspot() {
    const gbs::PointClickSceneData* scene = gbs::point_click_scene_for(project, current_scene_index);
    if (scene == nullptr) {
        return;
    }
    const gbs::PointClickHotspotData* hotspot = gbs::point_click_hotspot_at(*scene, cursor.position_pixels);
    if (hotspot == nullptr) {
        return;
    }
    if (!gbs::point_click_hotspot_can_activate(project, event_state, cursor, *hotspot)) {
        show_dialogue_line(hotspot->unavailable_dialogue_line_index);
        return;
    }
    const bool used_required_item = gbs::point_click_hotspot_requires_selected_item(*hotspot);
    show_dialogue_line(hotspot->dialogue_line_index);
    gbs::point_click_grant_item(project, event_state, hotspot->give_item_index);
    if (hotspot->give_item_index >= 0 && cursor.selected_item_index < 0) {
        cursor.selected_item_index = hotspot->give_item_index;
    }
    gbs::run_event_script(event_state, gbs::point_click_hotspot_success_script(*hotspot, used_required_item));
    consume_event_state();
    const int scripted_scene_index = gbs::point_click_scripted_scene_destination(
        project, current_scene_index, event_state
    );
    if (!dialogue.visible && hotspot->give_item_index >= 0) {
        const gbs::PointClickInventoryItemData& item = project.inventory_items[hotspot->give_item_index];
        show_dialogue_line(item.dialogue_line_index);
    }
    if (hotspot->target_scene_index >= 0 || scripted_scene_index >= 0) {
        if (hotspot->target_scene_index < 0) {
            cursor.position_pixels = {
                gbs::clamp_int(event_state.player_x, 0, 239),
                gbs::clamp_int(event_state.player_y, 0, 159)
            };
        }
        queue_scene_transition(*scene, hotspot->target_scene_index >= 0
            ? hotspot->target_scene_index : scripted_scene_index);
    } else if (hotspot->give_item_index >= 0) {
        refresh_hud();
        persist_point_click_runtime_state();
    }
}

bool run_button_event_binding() {
    if (!gbs::update_button_event_bindings(event_state)) {
        return false;
    }
    const int script_index = event_state.last_script;
    const bool overrides_default = event_state.last_button_binding_overrides_default;
    event_state.last_script = -1;
    event_state.last_button_binding_overrides_default = false;
    if (project.scripts != nullptr &&
        script_index >= 0 &&
        static_cast<size_t>(script_index) < project.script_count) {
        gbs::run_event_script(event_state, project.scripts[script_index]);
        consume_event_state();
    }
    return overrides_default;
}

} // namespace

int initialize_point_click_runtime() {
    gbs::init();
    gbs::reset_runtime_telemetry();
    runtime_last_scene = -1;
    runtime_scene_change_count = 0;
    gbs::init_dialogue(dialogue);
    gbs::init_event_state(event_state);
    gbs::init_hud(hud);
    gbs::init_resource_manager(resource_manager);
    gbs::init_sprite_animator(cursor_animator);
    cursor_streamed_tile_asset_loaded = nullptr;
    gbs::update_point_click_cursor_animator(cursor_animator, project, false, false);
    for (size_t index = 0; index < max_point_click_props; ++index) {
        gbs::init_sprite_animator(point_click_prop_animators[index]);
        prop_streamed_tile_assets_loaded[index] = nullptr;
    }
    reset_resource_bank_groups();
    gbs::set_backdrop_color(gbs::rgb15(1, 4, 4));
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 1);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG3, 3);

    if (!gbs::is_valid_point_click_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    cursor = gbs::point_click_cursor_from_project(project);
    pending_scene_index = -1;
#ifdef GBS_MULTI_RUNTIME
    active_music_index = active_tracker_index = -1;
    int restore_slot_index = -1;
    const bool restored_save = gbs::consume_runtime_save_restore(gbs::RuntimeKind::PointClick, restore_slot_index);
    if (restored_save) {
        if (!restore_universal_point_click_state(restore_slot_index)) return -1;
    } else {
        int transition_scene = project.initial_scene;
        int transition_x = cursor.position_pixels.x;
        int transition_y = cursor.position_pixels.y;
        const bool resumed_from_transition = gbs::consume_runtime_transition(
            gbs::RuntimeKind::PointClick,
            event_state,
            transition_scene,
            transition_x,
            transition_y
        );
        current_scene_index = resumed_from_transition ? transition_scene : project.initial_scene;
        if (resumed_from_transition) {
            cursor.position_pixels = { transition_x, transition_y };
        }
    }
#else
    current_scene_index = project.initial_scene;
    restore_point_click_runtime_state();
#endif
    load_cursor_assets();
#if GBS_MULTI_RUNTIME
    if (restored_save) {
        const auto* scene = gbs::point_click_scene_for(project, current_scene_index);
        if (scene == nullptr) return -1;
        stream_scene_resource_group(*scene);
        apply_backgrounds(*scene);
    } else
#endif
    start_scene(current_scene_index);
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(gbs::point_click_scene_name(project, current_scene_index));
    refresh_hud();

    return 0;
}

gbs::RuntimeAdapterFrameResult update_point_click_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    gbastudio_dialogue_ui::configure_for_scene(gbs::point_click_scene_name(project, current_scene_index));
    const gbs::InputState input = gbs::begin_frame().input;
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
    gbs::update_hud_behavior(event_state, hud.visible);
    event_state.current_room = current_scene_index;
    event_state.player_x = cursor.position_pixels.x;
    event_state.player_y = cursor.position_pixels.y;
    bool cursor_clicked = false;
    if (dialogue.visible) {
        gbs::advance_dialogue(dialogue, input);
        start_pending_scene_if_ready();
    } else {
        const bool overrides_default = gbs::button_event_binding_overrides_default(event_state, input.held);
        run_button_event_binding();
        if (!overrides_default) {
            update_cursor(input);
            if (input.was_pressed(gbs::ButtonB)) {
                cycle_selected_item();
            }
            if (input.was_pressed(gbs::ButtonA)) {
                cursor_clicked = true;
                activate_hotspot();
            }
        }
    }

    const gbs::PointClickSceneData* cursor_scene = gbs::point_click_scene_for(project, current_scene_index);
    const bool cursor_hovering = cursor_scene != nullptr &&
        gbs::point_click_hotspot_at(*cursor_scene, cursor.position_pixels) != nullptr;
    gbs::update_point_click_cursor_animator(cursor_animator, project, cursor_hovering, cursor_clicked);

#ifdef GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        return gbs::RuntimeAdapterFrameResult::Transition;
    }
#endif

    return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_point_click_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    gbs::hide_all_sprites();
    const gbs::PointClickSceneData* scene = gbs::point_click_scene_for(project, current_scene_index);
    if (scene != nullptr) {
        draw_point_click_props(*scene);
    }
    draw_cursor();
    gbs::draw_hud(hud);
    gbs::draw_dialogue(dialogue);
    sync_runtime_telemetry();
    gbs::wait_vblank();
}

void leave_point_click_runtime() {
    gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);
}

extern "C" void GBS_POINT_CLICK_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    point_click_initialization_result = initialize_point_click_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_POINT_CLICK_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_point_click_runtime(context);
}

extern "C" void GBS_POINT_CLICK_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_point_click_runtime(context);
}

extern "C" void GBS_POINT_CLICK_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_point_click_runtime();
}

extern "C" int GBS_POINT_CLICK_RUNTIME_ENTRY() {
    point_click_initialization_result = initialize_point_click_runtime();
    if (point_click_initialization_result != 0) {
        leave_point_click_runtime();
        return point_click_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::PointClick,
            current_scene_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_point_click_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_point_click_runtime();
            return -1;
        }
        render_point_click_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_point_click_runtime();
            return 0;
        }
    }
}
