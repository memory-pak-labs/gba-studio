#include "gbs/engine.hpp"
#include <string.h>
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/save.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#include "gbs/world_map.hpp"
#include "gbs/world_map_journey.hpp"
#include "gbs/runtime_save_restore.hpp"
#ifndef GBS_WORLD_MAP_PROJECT_DATA_HEADER
#define GBS_WORLD_MAP_PROJECT_DATA_HEADER "world_map_project_data.hpp"
#endif
#include GBS_WORLD_MAP_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_WORLD_MAP_RUNTIME_ENTRY
#define GBS_WORLD_MAP_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_WORLD_MAP_RUNTIME_ENTER
#define GBS_WORLD_MAP_RUNTIME_ENTER gbs_enter_world_map
#endif
#ifndef GBS_WORLD_MAP_RUNTIME_UPDATE
#define GBS_WORLD_MAP_RUNTIME_UPDATE gbs_update_world_map
#endif
#ifndef GBS_WORLD_MAP_RUNTIME_RENDER
#define GBS_WORLD_MAP_RUNTIME_RENDER gbs_render_world_map
#endif
#ifndef GBS_WORLD_MAP_RUNTIME_LEAVE
#define GBS_WORLD_MAP_RUNTIME_LEAVE gbs_leave_world_map
#endif

#ifdef GBS_MULTI_RUNTIME
#include "mixed_project_data.hpp"
#endif

namespace {

const gbs::WorldMapProjectData& project = gbastudio_world_map_project::project;

gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::HudState hud;
gbs::WorldMapRuntimeState world_map_state;
gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
int camera_x = 0;
int camera_y = 0;
int vehicle_node = 0;
int visible_sprite_count = 0;
gbs::WorldMapJourney journey;
gbs::PagedBackgroundWindow background_window;
uint16_t viewport_map[1024] __attribute__((section(".ewram_bss")));
alignas(4) uint8_t viewport_tiles[651 * 64] __attribute__((section(".ewram_bss")));
constexpr uint8_t empty_background_tile[64] = {};
int world_map_initialization_result = -1;
char hud_left_buffer[40] = {};


constexpr size_t max_resource_bank_reservations = 16;
gbs::ResourceBankReservation active_resource_bank_reservations[max_resource_bank_reservations] = {};
gbs::ResourceBankReservation scratch_resource_bank_reservations[max_resource_bank_reservations] = {};
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

constexpr uint16_t marker_palette_colors[] = {
    gbs::rgb15(0, 0, 0),
    gbs::rgb15(5, 18, 8),
    gbs::rgb15(24, 22, 4),
    gbs::rgb15(31, 31, 31),
    gbs::rgb15(10, 10, 10),
};

constexpr uint8_t marker_tile_data[] = {
    0x00, 0x11, 0x11, 0x00,
    0x01, 0x11, 0x11, 0x10,
    0x11, 0x11, 0x11, 0x11,
    0x11, 0x11, 0x11, 0x11,
    0x11, 0x11, 0x11, 0x11,
    0x11, 0x11, 0x11, 0x11,
    0x01, 0x11, 0x11, 0x10,
    0x00, 0x11, 0x11, 0x00,
};

constexpr uint8_t cursor_tile_data[] = {
    0x00, 0x22, 0x22, 0x00,
    0x02, 0x00, 0x00, 0x20,
    0x20, 0x00, 0x00, 0x02,
    0x20, 0x00, 0x00, 0x02,
    0x20, 0x00, 0x00, 0x02,
    0x20, 0x00, 0x00, 0x02,
    0x02, 0x00, 0x00, 0x20,
    0x00, 0x22, 0x22, 0x00,
};

constexpr gbs::PaletteAsset marker_palette_asset = {
    marker_palette_colors,
    static_cast<uint16_t>(sizeof(marker_palette_colors) / sizeof(marker_palette_colors[0])),
    192
};

constexpr gbs::TileAsset marker_tile_asset = {
    marker_tile_data,
    1,
    880,
    true
};

constexpr gbs::TileAsset cursor_tile_asset = {
    cursor_tile_data,
    1,
    881,
    true
};

constexpr uint8_t locked_marker_data[] = {
    0,0x44,0x44,0, 0x04,0x44,0x44,0x40,
    0x44,0x44,0x44,0x44, 0x44,0x44,0x44,0x44,
    0x44,0x44,0x44,0x44, 0x44,0x44,0x44,0x44,
    0x04,0x44,0x44,0x40, 0,0x44,0x44,0
};
constexpr gbs::TileAsset locked_marker_asset {locked_marker_data,1,882,true};

const char* hud_scene_name() {
    return project.scene_name != nullptr && project.scene_name[0] != '\0'
        ? project.scene_name : project.nodes[world_map_state.node_index].name;
}

void update_background_window() {
    const auto* background = gbs::world_map_background_for(project);
    if (background == nullptr) return;
    if (background->source_tiles != nullptr) {
        bool dirty[651] = {};
        int changed_tiles=0;
        const bool changed = !background_window.initialized || background_window.tile_x != camera_x / 8 || background_window.tile_y != camera_y / 8;
        gbs::update_paged_background_window(background_window, camera_x, camera_y, [&](int x, int y, int slot) {
            const auto& map = background->tilemap;
            const auto& atlas = *background->source_tiles;
            const int source_index = x < map.width && y < map.height ? map.entries[y * map.width + x] : -1;
            const uint8_t* pixels = source_index >= 0 && source_index < atlas.tile_count
                ? atlas.data + source_index * 64 : empty_background_tile;
            memcpy(viewport_tiles+slot*64,pixels,64);
            dirty[slot]=true; ++changed_tiles;
            viewport_map[(y % 32)*32+x % 32]=static_cast<uint16_t>(slot);
        });
        if (changed) {
            // Coalesce uploads so the bounded DMA queue cannot drop tiles.
            if (changed_tiles>128) {
                gbs::load_bg_tiles_at_character_base(gbs::TileAsset {viewport_tiles,651,0,false,gbs::ColorDepth::Bpp8},0);
            } else {
                for(int slot=0;slot<651;) {
                    if (!dirty[slot]) { ++slot; continue; }
                    const int first=slot;
                    while(slot<651 && dirty[slot]) ++slot;
                    gbs::load_bg_tiles_at_character_base(gbs::TileAsset {viewport_tiles+first*64,static_cast<uint16_t>(slot-first),static_cast<uint16_t>(first),false,gbs::ColorDepth::Bpp8},0);
                }
            }
            gbs::load_tilemap(background->layer,gbs::TileMapAsset {viewport_map,32,32});
        }
        gbs::set_bg_scroll(background->layer,camera_x % 256,camera_y % 256);
    } else {
        gbs::set_bg_scroll(background->layer,camera_x,camera_y);
    }
}

void append_char(char*& cursor, const char* end, char value) {
    if (cursor < end) {
        *cursor = value;
        ++cursor;
        *cursor = '\0';
    }
}

void append_text(char*& cursor, const char* end, const char* text) {
    if (text == nullptr) {
        return;
    }
    while (*text != '\0' && cursor < end) {
        append_char(cursor, end, *text);
        ++text;
    }
}

void refresh_hud() {
    const gbs::WorldMapNodeData* node = gbs::world_map_node_for(project, world_map_state.node_index);
    char* left = hud_left_buffer;
    const char* left_end = hud_left_buffer + sizeof(hud_left_buffer) - 1;
    hud_left_buffer[0] = '\0';
    append_text(left, left_end, node != nullptr ? (node->label != nullptr ? node->label : node->name) : "MAPA");
    const auto status = gbs::world_map_node_status(project,world_map_state.node_index,event_state);
    const char* texts[] = {hud_left_buffer, journey.active ? "EM VOO" : status == gbs::WorldMapNodeStatus::Available ? "A VIAJAR" : "BLOQUEADO", "D DESTINO  B PORTO", "START PAUSA"};
    gbs::set_hud_text_slots(hud,texts,4);
}

void stream_node_resource_group(const gbs::WorldMapNodeData& node) {
    if (project.resource_bank_group_count == 0) {
        return;
    }

    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_world_map_node(project, node);
    if (group.bank_count == 0) {
        return;
    }

    gbs::stream_resource_bank_group(resource_manager, active_resource_bank_group, scratch_resource_bank_group, group);
}

void apply_background() {
    const gbs::WorldMapBackgroundData* background = gbs::world_map_background_for(project);
    for (size_t index = 0; index < project.bg_palette_count; ++index) {
        gbs::load_palette(project.bg_palettes[index], false);
    }
    for (size_t index = 0; index < project.obj_palette_count; ++index) {
        gbs::load_palette(project.obj_palettes[index], true);
    }
    for (size_t index = 0; index < project.tile_asset_count; ++index) {
        gbs::load_tiles(project.tile_assets[index]);
    }
    if (background == nullptr) {
        return;
    }

    gbs::set_backdrop_color(background->backdrop_color);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, background->layer == gbs::BackgroundLayer::BG1);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, background->layer == gbs::BackgroundLayer::BG3);
    if (background->source_tiles != nullptr) {
        gbs::set_ui_character_base(1);
        gbs::set_bg_character_base(background->layer,0);
        gbs::set_bg_screen_base(background->layer,27);
        gbs::set_bg_color_depth(background->layer,gbs::ColorDepth::Bpp8);
        for (auto& tile : viewport_map) tile=0;
        background_window = {};
        update_background_window();
    } else {
        gbs::load_tilemap(background->layer, background->tilemap);
    }
    gbs::set_bg_enabled(background->layer, true);
    gbs::set_bg_scroll(background->layer, camera_x, camera_y);
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
        gbs::set_audio_channel_muted(gbs::audio_channel_from_event_value(event_state.audio_mute_channel), event_state.audio_mute_enabled);
        event_state.audio_mute_changed = false;
    }
    if (event_state.audio_volume_changed) {
        gbs::set_audio_channel_volume(gbs::audio_channel_from_event_value(event_state.audio_volume_channel), static_cast<uint8_t>(event_state.audio_volume));
        event_state.audio_volume_changed = false;
    }
    if (event_state.audio_fade_changed) {
        gbs::fade_audio_channel_volume(gbs::audio_channel_from_event_value(event_state.audio_fade_channel), static_cast<uint8_t>(event_state.audio_fade_target_volume), static_cast<uint16_t>(event_state.audio_fade_frames));
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
    }
}

int current_scene_index() {
    return project.embedded_nodes ? 0 : world_map_state.node_index;
}

struct WorldMapSavePayload { gbs::WorldMapRuntimeState state; gbs::WorldMapJourney flight; int vehicle; };
bool capture_world_map(gbs::UniversalSaveData& data) {
    const WorldMapSavePayload payload {world_map_state,journey,vehicle_node};
    return gbs::make_universal_save_data(data,gbs::UniversalSaveRuntime::WorldMap,
        current_scene_index(),journey.position.x,journey.position.y,camera_x,camera_y,
        event_state.variables,gbs::universal_save_variable_count,event_state.inventory,gbs::universal_save_inventory_count,
        event_state.equipped_items,gbs::universal_save_equipment_slot_count,gbs::frame_count(),0,
        &payload,sizeof(payload),event_state.text_variables,gbs::text_variable_count);
}
bool apply_world_map_save(const gbs::UniversalSaveData& data) {
    WorldMapSavePayload payload {};
    if (!gbs::read_universal_save_payload(data,gbs::UniversalSaveRuntime::WorldMap,&payload,sizeof(payload)) ||
        !gbs::is_valid_world_map_node_index(project,payload.state.node_index) ||
        !gbs::is_valid_world_map_node_index(project,payload.vehicle) ||
        payload.flight.duration < 1 || payload.flight.duration > 600 ||
        payload.flight.frame < 0 || payload.flight.frame > payload.flight.duration ||
        !gbs::restore_suspended_common_state(data,event_state)) return false;
    world_map_state = payload.state; journey = payload.flight; vehicle_node = payload.vehicle;
    camera_x = data.camera_x; camera_y = data.camera_y;
    return true;
}
bool restore_world_map_runtime_state(int slot_index) {
    if (!gbastudio_world_map_project::save_enabled) return false;
    if (slot_index < 0) slot_index = gbs::find_latest_save_slot(gbastudio_world_map_project::save_bank);
    if (slot_index < 0) return false;
    gbs::UniversalSaveData data {}; size_t bytes = 0;
    return gbs::read_save_slot_record(gbastudio_world_map_project::save_bank,static_cast<size_t>(slot_index),
        &data,sizeof(data),nullptr,&bytes) == gbs::SaveStatus::Ok && bytes == sizeof(data) && apply_world_map_save(data);
}

void show_node_line() {
    const gbs::WorldMapNodeData* node = gbs::world_map_node_for(project, world_map_state.node_index);
    if (node != nullptr && node->line_index >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, node->line_index);
    }
}

void update_camera() {
    const auto* background = gbs::world_map_background_for(project);
    if (background == nullptr) return;
    const auto* selected = gbs::world_map_node_for(project,world_map_state.node_index);
    const auto focus = journey.active ? journey.position : selected->position_pixels;
    camera_x = gbs::world_map_clamp(focus.x - 120,0,background->tilemap.width*8 > 240 ? background->tilemap.width*8-240 : 0);
    camera_y = gbs::world_map_clamp(focus.y - 80,0,background->tilemap.height*8 > 160 ? background->tilemap.height*8-160 : 0);
    update_background_window();
}

void focus_node(int node_index) {
    const gbs::WorldMapNodeData* node = gbs::world_map_node_for(project, node_index);
    if (node == nullptr || !gbs::world_map_node_is_visible(*node, event_state)) {
        return;
    }
    stream_node_resource_group(*node);
    world_map_state.previous_node_index = world_map_state.node_index;
    world_map_state.node_index = node_index;
    // Embedded destinations share one world-map scene for runtime transitions.
    event_state.current_room = current_scene_index();
    update_camera();
    if (gbs::world_map_node_is_available(*node, event_state)) {
        gbs::run_event_script(event_state, node->on_focus);
        consume_event_state();
    }
    if (!dialogue.visible && gbs::world_map_node_is_available(*node, event_state)) {
        show_node_line();
    }
    refresh_hud();
}

void move_focus(int direction_x, int direction_y) {
    int next = gbs::find_world_map_connected_node_in_direction(project, world_map_state.node_index, direction_x, direction_y, event_state);
    if (next >= 0) {
        focus_node(next);
    }
}

void select_node() {
    const gbs::WorldMapNodeData* node = gbs::world_map_node_for(project, world_map_state.node_index);
    if (node == nullptr || !gbs::world_map_node_is_visible(*node, event_state)) {
        return;
    }
    if (!gbs::world_map_node_is_available(*node, event_state)) {
        if (gbs::has_event_script(node->on_locked)) {
            gbs::run_event_script(event_state, node->on_locked);
            consume_event_state();
        }
        if (!dialogue.visible && node->locked_line_index >= 0) {
            gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, node->locked_line_index);
        }
        refresh_hud();
        return;
    }
    world_map_state.selected_level_index = node->target_level_index;
    vehicle_node = world_map_state.node_index;
    gbs::run_event_script(event_state, node->on_select);
    consume_event_state();
    if (!dialogue.visible) {
        show_node_line();
    }
    refresh_hud();

}

void load_marker_assets() {
    gbs::load_palette(marker_palette_asset,true);
    gbs::load_tiles(marker_tile_asset);
    gbs::load_tiles(cursor_tile_asset);
    gbs::load_tiles(locked_marker_asset);
}

void begin_journey() {
    const auto* target = gbs::world_map_node_for(project,world_map_state.node_index);
    if (target == nullptr || !gbs::world_map_node_is_available(*target,event_state)) { select_node(); return; }
    gbs::start_world_map_journey(journey,project.nodes[vehicle_node].position_pixels,target->position_pixels,project.journey_frames);
    refresh_hud();
}

void draw_nodes() {
    gbs::hide_all_sprites();
    int sprite_index = 0;
    const auto* vehicle = project.cursor_metasprite;
    if (vehicle != nullptr) {
        const auto position = journey.active ? journey.position : project.nodes[vehicle_node].position_pixels;
        const int x = position.x-camera_x;
        const int y = position.y-camera_y-20;
        if (x > -32 && x < 272 && y > -32 && y < 192) {
            if (project.cursor_affine && vehicle->part_count == 1) {
                const auto& part = vehicle->parts[0];
                gbs::AffineMatrix matrix = gbs::identity_affine_matrix();
                const int wave = journey.active ? (journey.frame < journey.duration/2 ? journey.frame : journey.duration-journey.frame)*512/journey.duration : 0;
                const int angle = (journey.destination.x < journey.origin.x ? -1 : 1)*1456*wave/256;
                const auto scale = gbs::Fixed::from_raw(256+20*wave/256);
                gbs::build_affine_matrix(matrix,static_cast<gbs::Angle>(angle),scale,scale);
                gbs::set_affine_sprite_transform(0,matrix);
                gbs::Sprite sprite {x-part.width,y-part.height,part.tile_index,part.palette,false,false,true};
                sprite.width=part.width; sprite.height=part.height; sprite.affine=true; sprite.double_size=true;
                sprite.affine_matrix=0; sprite.color_depth=part.color_depth;
                gbs::set_sprite(sprite_index++,sprite);
            } else {
                gbs::set_metasprite(sprite_index,*vehicle,{x,y}); sprite_index += vehicle->part_count;
            }
        }
    }
    for (size_t index=0;index<project.node_count && sprite_index<120;++index) {
        const auto& node=project.nodes[index];
        if (!gbs::world_map_node_is_visible(node,event_state)) continue;
        const int x=node.position_pixels.x-camera_x-4, y=node.position_pixels.y-camera_y-4;
        if (x < -8 || x > 240 || y < -8 || y > 160) continue;
        const bool available=gbs::world_map_node_is_available(node,event_state);
        if (project.marker_metasprite != nullptr && available) {
            const auto& marker = *project.marker_metasprite;
            if (sprite_index + marker.part_count <= 128) {
                gbs::set_metasprite(sprite_index, marker, {x + 4, y + 4});
                sprite_index += marker.part_count;
            }
            if (static_cast<int>(index) != world_map_state.node_index) continue;
        }
        const uint16_t tile = static_cast<int>(index)==world_map_state.node_index ? 881 : available ? 880 : 882;
        gbs::Sprite sprite {x,y,tile,12,false,false,true}; sprite.width=8; sprite.height=8;
        gbs::set_sprite(sprite_index++,sprite);
    }
    visible_sprite_count = sprite_index;
}

} // namespace

int initialize_world_map_runtime() {
    gbs::init();
    gbs::init_dialogue(dialogue);
    gbs::init_event_state(event_state);
    gbs::init_hud(hud);
    gbs::init_resource_manager(resource_manager);
    gbs::set_backdrop_color(gbs::rgb15(1, 6, 12));

    if (!gbs::is_valid_world_map_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    world_map_state = gbs::world_map_runtime_from_project(project);
    journey = {}; background_window = {}; camera_x=0; camera_y=0;
    bool restored=false;
#ifdef GBS_MULTI_RUNTIME
    int restore_slot=-1;
    if (gbs::consume_runtime_save_restore(gbs::RuntimeKind::WorldMap,restore_slot)) {
        restored=restore_world_map_runtime_state(restore_slot);
        if (!restored) return -1;
    } else {
        int transition_node=project.initial_node, x=0,y=0;
        if (gbs::consume_runtime_transition(gbs::RuntimeKind::WorldMap,event_state,transition_node,x,y)) {
            if (gbs::is_valid_world_map_node_index(project,transition_node)) world_map_state.node_index=transition_node;
            gbs::UniversalSaveData paused {};
            if (gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::WorldMap,current_scene_index(),paused)) restored=apply_world_map_save(paused);
        }
    }
#else
    restored=restore_world_map_runtime_state(-1);
#endif
    if (!restored) { vehicle_node=world_map_state.node_index; journey.position=project.nodes[vehicle_node].position_pixels; }
    event_state.current_room=current_scene_index();
    stream_node_resource_group(project.nodes[world_map_state.node_index]);
    apply_background(); load_marker_assets(); update_camera();
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(hud_scene_name(),true);
    if (!restored) { gbs::run_event_script(event_state,project.on_enter); consume_event_state(); }
    refresh_hud();

    return 0;
}

gbs::RuntimeAdapterFrameResult update_world_map_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    if (world_map_initialization_result != 0) {
        return gbs::RuntimeAdapterFrameResult::Error;
    }

        gbastudio_dialogue_ui::configure_for_scene(hud_scene_name());
        const gbs::InputState input = gbs::begin_frame().input;
        gbs::set_event_input_state(event_state, input.held, input.pressed, input.released);
        gbs::update_hud_behavior(event_state, hud.visible);
        gbs::tick_event_frame_counter(event_state);
#if GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_requested()) {
            gbs::consume_scene_transition_visual_effect_event(event_state);
            return gbs::runtime_transition_pending()
                ? gbs::RuntimeAdapterFrameResult::Transition
                : gbs::RuntimeAdapterFrameResult::Continue;
        }
#endif
        if (dialogue.visible) {
            gbs::advance_dialogue(dialogue, input);
        } else if (input.was_pressed(gbs::ButtonStart)) {
            gbs::run_event_script(event_state,project.on_start); consume_event_state();
        } else if (journey.active && input.was_pressed(gbs::ButtonB)) {
            journey.active=false; journey.position=journey.origin;
            focus_node(vehicle_node); refresh_hud();
        } else if (journey.active) {
            if (gbs::tick_world_map_journey(journey)) select_node();
            update_camera(); refresh_hud();
        } else if (input.was_pressed(gbs::ButtonB)) {
            gbs::run_event_script(event_state,project.on_cancel); consume_event_state();
        } else {
            if (input.was_pressed(gbs::ButtonLeft)) {
                move_focus(-1, 0);
            } else if (input.was_pressed(gbs::ButtonRight)) {
                move_focus(1, 0);
            } else if (input.was_pressed(gbs::ButtonUp)) {
                move_focus(0, -1);
            } else if (input.was_pressed(gbs::ButtonDown)) {
                move_focus(0, 1);
            } else if (input.was_pressed(gbs::ButtonA)) {
                begin_journey();
            }
        }

#ifdef GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_pending()) {
            return gbs::RuntimeAdapterFrameResult::Transition;
        }
#endif

        return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_world_map_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        gbs::set_event_player_actor_state(event_state,journey.position.x,journey.position.y,0,1);
        auto& telemetry=gbs::runtime_telemetry_block();
        telemetry.current_room=world_map_state.node_index;
        telemetry.player_x=journey.position.x; telemetry.player_y=journey.position.y;
        telemetry.actor_count=1;
        for(size_t i=0;i<gbs::runtime_telemetry_variable_count;++i) telemetry.variables[i]=event_state.variables[i];
        draw_nodes();
        gbs::draw_dialogue(dialogue);
        gbs::draw_hud(hud);
        auto physical = gbs::capture_runtime_physical_telemetry(resource_manager, event_state);
        const auto* background = gbs::world_map_background_for(project);
        if (background != nullptr && background->source_tiles != nullptr) {
            // The paged cache is outside the resident allocator. Report its
            // actual allocation in the telemetry's 32-byte tile units.
            physical.bg_tiles += sizeof(viewport_tiles) / 32;
            physical.vram_bytes += sizeof(viewport_tiles) + sizeof(viewport_map);
        }
        physical.obj_tiles += 3;
        physical.vram_bytes += 3 * 32;
        physical.palette_colors += 5;
        physical.oam = visible_sprite_count;
        gbs::debug_set_runtime_physical_telemetry(physical);
        gbs::wait_vblank();
}

void leave_world_map_runtime() {
#ifdef GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_target()==gbs::RuntimeKind::Menu && event_state.scene_stack_count>0) {
        gbs::UniversalSaveData data {}; gbs::clear_suspended_runtime_save();
        if (capture_world_map(data)) gbs::capture_suspended_runtime_save(data);
    }
#endif
    gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);
}

extern "C" void GBS_WORLD_MAP_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    world_map_initialization_result = initialize_world_map_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_WORLD_MAP_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_world_map_runtime(context);
}

extern "C" void GBS_WORLD_MAP_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_world_map_runtime(context);
}

extern "C" void GBS_WORLD_MAP_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_world_map_runtime();
}

extern "C" int GBS_WORLD_MAP_RUNTIME_ENTRY() {
    world_map_initialization_result = initialize_world_map_runtime();
    if (world_map_initialization_result != 0) {
        leave_world_map_runtime();
        return world_map_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::WorldMap,
            world_map_state.node_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_world_map_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_world_map_runtime();
            return -1;
        }
        render_world_map_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_world_map_runtime();
            return 0;
        }
    }
}
