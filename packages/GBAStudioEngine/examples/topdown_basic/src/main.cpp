#include "gbs/animation.hpp"
#include "gbs/audio.hpp"
#include "gbs/engine.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/event_ui.hpp"
#include "gbs/event_interactions.hpp"
#include "gbs/event_threads.hpp"
#include "gbs/event_adventure.hpp"
#include "gbs/interrupt.hpp"
#include "gbs/link.hpp"
#include "gbs/project.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/save.hpp"
#include "gbs/timer.hpp"
#include "gbs/topdown.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#ifndef GBS_TOPDOWN_PROJECT_DATA_HEADER
#define GBS_TOPDOWN_PROJECT_DATA_HEADER "gbastudio_project_data.hpp"
#endif
#include GBS_TOPDOWN_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_TOPDOWN_RUNTIME_ENTRY
#define GBS_TOPDOWN_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_TOPDOWN_RUNTIME_ENTER
#define GBS_TOPDOWN_RUNTIME_ENTER gbs_enter_topdown
#endif
#ifndef GBS_TOPDOWN_RUNTIME_UPDATE
#define GBS_TOPDOWN_RUNTIME_UPDATE gbs_update_topdown
#endif
#ifndef GBS_TOPDOWN_RUNTIME_RENDER
#define GBS_TOPDOWN_RUNTIME_RENDER gbs_render_topdown
#endif
#ifndef GBS_TOPDOWN_RUNTIME_LEAVE
#define GBS_TOPDOWN_RUNTIME_LEAVE gbs_leave_topdown
#endif

namespace {

const gbs::TopDownProjectData& project = gbastudio_project::project;

int current_room = 0;
int configured_dialogue_ui_room = -1;
bool configured_dialogue_ui_affine = false;
uint16_t room_backdrop_color = 0;
gbs::Room room = gbs::room_from_data(project.rooms[0]);
gbs::Actor player = gbs::actor_from_data(project.player);
gbs::EventPlayerRuntimeState player_event_runtime { true, 0, 0, 0 };
gbs::Camera camera = project.camera;
gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::EventRunner event_runner;
gbs::EventThreadPool event_threads{};
gbs::EventScriptQueue event_queue;
gbs::VisualEffectsController visual_effects;
gbs::LinkSession link_session;

const gbs::TopDownActorSpriteData* selected_player_sprite_data();
const gbs::MetaSprite* player_runtime_metasprite();
void apply_player_sprite_variant();
void refresh_player_directional_animation(bool moving);

bool open_link(gbs::LinkRole role, uint16_t timeout_frames) {
    gbs::RuntimeLinkService* service = gbs::active_runtime_link_service();
    if (service != nullptr) return gbs::runtime_link_open(*service, role, timeout_frames);
    gbs::link_open(link_session, role, timeout_frames);
    return link_session.active;
}

void close_link() {
    gbs::RuntimeLinkService* service = gbs::active_runtime_link_service();
    if (service != nullptr) {
        gbs::runtime_link_close(*service);
        return;
    }
    gbs::link_close(link_session);
}

bool transfer_link(uint8_t value) {
    gbs::RuntimeLinkService* service = gbs::active_runtime_link_service();
    if (service != nullptr) return gbs::runtime_link_transfer(*service, value);
    return gbs::link_transfer(link_session, value);
}

uint8_t received_link_value() {
    gbs::RuntimeLinkService* service = gbs::active_runtime_link_service();
    return service != nullptr && service->session != nullptr
        ? service->session->last_received
        : link_session.last_received;
}
gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::HudState hud;
gbs::OverlayState overlay;
gbs::MenuState pause_menu;
gbs::SpriteAnimatorState player_animator;
gbs::EngineResourceManager resources __attribute__((section(".ewram_bss")));
// Mantem o estado de todos os NPCs de uma sala de stress, mas so compromete
// sprites que cabem antes das reservas de projeteis e dialogo no OAM.
constexpr size_t max_npc_slots = 96;
constexpr size_t max_visible_npc_slots = 26;
constexpr size_t max_active_npc_slots = 26;
constexpr int active_npc_viewport_margin_pixels = 16;
constexpr size_t max_project_tile_assets = 16;
constexpr size_t max_project_bg_palettes = 8;
constexpr size_t max_project_obj_palettes = 8;
constexpr size_t max_project_resource_banks = 64;
constexpr size_t max_prefetch_new_banks_per_frame = 2;
constexpr size_t max_prefetch_uploads_per_frame = 2;
constexpr uint16_t oam_sprites_per_actor = 4;
constexpr uint16_t npc_oam_start = 8;
constexpr size_t max_visible_world_actor_slots = max_visible_npc_slots + 1;
const gbs::TileAsset* player_streamed_tile_asset_loaded = nullptr;
const gbs::TileAsset* npc_streamed_tile_assets_loaded[max_npc_slots] = {};
constexpr size_t max_runtime_projectiles = 8;
constexpr uint16_t projectile_oam_start = npc_oam_start + max_visible_npc_slots * oam_sprites_per_actor;
constexpr size_t max_trigger_slots = 8;
constexpr size_t max_tile_effect_slots = 8;
constexpr size_t max_mutable_room_tiles = 64 * 64;
constexpr int adventure_callback_on_interact = 0;
constexpr int adventure_callback_on_room_enter = 1;
constexpr int adventure_callback_on_room_exit = 2;
constexpr int scene_type_topdown = 0;
gbs::ResourceReservation project_tile_reservations[max_project_tile_assets];
gbs::ResourceReservation project_bg_palette_reservations[max_project_bg_palettes];
gbs::ResourceReservation project_obj_palette_reservations[max_project_obj_palettes];
gbs::ResourceBatchReservation project_resource_reservation {
    project_tile_reservations,
    max_project_tile_assets,
    0,
    project_bg_palette_reservations,
    max_project_bg_palettes,
    0,
    project_obj_palette_reservations,
    max_project_obj_palettes,
    0,
    gbs::ResourceReservation {},
    false
};
gbs::ResourceBankReservation project_bank_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::ResourceBankBatchReservation project_bank_reservation {
    project_bank_reservations,
    max_project_resource_banks,
    0,
    nullptr,
    false
};
gbs::ResourceBankReservation project_bank_scratch_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::ResourceBankBatchReservation project_bank_scratch_reservation {
    project_bank_scratch_reservations,
    max_project_resource_banks,
    0,
    nullptr,
    false
};
gbs::ResourceBankCacheEntry project_bank_cache_entries[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::ResourceBankCache project_bank_cache {
    project_bank_cache_entries,
    max_project_resource_banks,
    0
};
gbs::ResourceBankPrefetchRequest topdown_prefetch_requests[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::SpriteAnimatorState npc_animators[max_npc_slots] __attribute__((section(".ewram_bss")));
gbs::TopDownActorRuntime npc_runtimes[max_npc_slots] __attribute__((section(".ewram_bss")));
gbs::Actor push_blocking_actors[max_npc_slots] __attribute__((section(".ewram_bss")));
int npc_health[max_npc_slots] __attribute__((section(".ewram_bss")));
bool npc_touching_player[max_npc_slots] __attribute__((section(".ewram_bss")));
bool npc_defeat_pending_despawn[max_npc_slots] __attribute__((section(".ewram_bss")));
gbs::TopDownTriggerState trigger_states[max_trigger_slots];
gbs::TopDownTriggerState tile_effect_states[max_tile_effect_slots];
uint16_t mutable_room_visual_tiles[max_mutable_room_tiles] __attribute__((section(".ewram_bss")));
bool mutable_room_visual_tiles_ready = false;
gbs::InputState current_input { 0, 0, 0 };
bool player_moved_this_frame = false;
int topdown_initialization_result = 0;

volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
uint32_t runtime_trigger_enter_count = 0;
uint32_t runtime_trigger_leave_count = 0;
uint32_t runtime_room_change_count = 0;
uint32_t runtime_blocked_direction_bits = 0;
int runtime_last_room = -1;

constexpr int topdown_directional_idle_down_index = 0;
constexpr int topdown_directional_idle_right_index = 1;
constexpr int topdown_directional_idle_up_index = 2;
constexpr int topdown_directional_idle_left_index = 3;
constexpr int topdown_directional_walk_down_index = 4;
constexpr int topdown_directional_walk_right_index = 5;
constexpr int topdown_directional_walk_up_index = 6;
constexpr int topdown_directional_walk_left_index = 7;
constexpr size_t topdown_directional_animation_count = 8;
constexpr size_t topdown_idle_directional_animation_count = 4;

bool topdown_has_walk_directional_animations(size_t animation_count) {
    return animation_count >= topdown_directional_animation_count;
}

bool topdown_has_idle_directional_animations(size_t animation_count) {
    return animation_count >= topdown_idle_directional_animation_count;
}

int topdown_directional_animation_index(size_t animation_count, uint8_t direction, bool moving) {
    if (topdown_has_walk_directional_animations(animation_count)) {
        switch (static_cast<gbs::TopDownActorDirection>(direction)) {
        case gbs::TopDownActorDirection::Up:
        case gbs::TopDownActorDirection::UpLeft:
        case gbs::TopDownActorDirection::UpRight:
            return moving ? topdown_directional_walk_up_index : topdown_directional_idle_up_index;
        case gbs::TopDownActorDirection::Left:
            return moving ? topdown_directional_walk_left_index : topdown_directional_idle_left_index;
        case gbs::TopDownActorDirection::Right:
            return moving ? topdown_directional_walk_right_index : topdown_directional_idle_right_index;
        case gbs::TopDownActorDirection::Down:
        case gbs::TopDownActorDirection::DownLeft:
        case gbs::TopDownActorDirection::DownRight:
        default:
            return moving ? topdown_directional_walk_down_index : topdown_directional_idle_down_index;
        }
    }

    if (!topdown_has_idle_directional_animations(animation_count)) {
        return 0;
    }

    switch (static_cast<gbs::TopDownActorDirection>(direction)) {
    case gbs::TopDownActorDirection::Up:
    case gbs::TopDownActorDirection::UpLeft:
    case gbs::TopDownActorDirection::UpRight:
        return topdown_directional_idle_up_index;
    case gbs::TopDownActorDirection::Left:
        return topdown_directional_idle_left_index;
    case gbs::TopDownActorDirection::Right:
    case gbs::TopDownActorDirection::DownRight:
        return topdown_directional_idle_right_index;
    case gbs::TopDownActorDirection::Down:
    case gbs::TopDownActorDirection::DownLeft:
    default:
        return topdown_directional_idle_down_index;
    }
}

struct RuntimeProjectile {
    bool active;
    int x;
    int y;
    int dx;
    int dy;
    int damage;
    int speed_x100;
    int step_accumulator;
    uint8_t source_collision_group;
    int sprite_index = -1;
    gbs::SpriteAnimatorState animator{};
    const gbs::TileAsset* loaded_tiles = nullptr;
};

RuntimeProjectile runtime_projectiles[max_runtime_projectiles];
int event_wait_frames = 0;
int active_choice_group = -1;
int active_menu_response_variable=-1;
bool shop_from_event=false;
gbs::EventInteractionState event_interaction{};
gbs::MenuState event_interaction_menu{};
gbs::MenuItem event_interaction_items[17]{};
char event_interaction_labels[17][32]{};
bool all_sprites_visible = true;
int camera_shake_frames = 0;
int camera_shake_magnitude = 0;
int player_bounce_frames = 0;
int player_bounce_total_frames = 1;
int player_bounce_height_pixels = 0;
bool screen_fade_active = false;
int screen_fade_direction = 0;
int screen_fade_total_frames = 1;
int screen_fade_frames_remaining = 0;
int vblank_ticks = 0;
uint32_t debug_work_units = 0;
bool active_script_triggers_room_enter = true;
constexpr uint8_t script_flag_trigger_room_enter = 1;
enum class PauseMenuPage : uint8_t {
    Root,
    Inventory,
    Shop,
    Map,
    System,
    Save,
    Load,
    Delete,
    DeleteConfirm,
    Settings
};

constexpr int pause_menu_resume = 1;
constexpr int pause_menu_inventory = 2;
constexpr int pause_menu_shop = 3;
constexpr int pause_menu_map = 4;
constexpr int pause_menu_system = 5;
constexpr int pause_menu_save = 10;
constexpr int pause_menu_load = 11;
constexpr int pause_menu_settings = 12;
constexpr int pause_menu_delete = 13;
constexpr int pause_menu_back = 90;
constexpr int pause_menu_save_base = 100;
constexpr int pause_menu_load_base = 120;
constexpr int pause_menu_delete_base = 140;
constexpr int pause_menu_delete_confirm = 160;
constexpr int pause_menu_delete_cancel = 161;
constexpr int pause_menu_shop_base = 180;
constexpr size_t pause_menu_inventory_capacity = 8;
constexpr size_t pause_menu_shop_capacity = 8;
constexpr size_t pause_menu_map_capacity = 8;
constexpr size_t max_menu_save_slots = 3;
char load_slot_labels[3][32] = {
    "LOAD 1",
    "LOAD 2",
    "LOAD 3"
};
char delete_slot_labels[3][32] = {};
char inventory_item_labels[pause_menu_inventory_capacity][16] = {};
char shop_item_labels[pause_menu_shop_capacity][24] = {};
char map_room_labels[pause_menu_map_capacity][16] = {};
gbs::MenuItem pause_root_items[] = {
    { gbastudio_project::save_menu_config.continue_label, pause_menu_resume, true },
    { "ITENS", pause_menu_inventory, false },
    { "LOJA", pause_menu_shop, false },
    { "MAPA", pause_menu_map, false },
    { "SISTEMA", pause_menu_system, true }
};
gbs::MenuItem pause_inventory_items[pause_menu_inventory_capacity + 1] = {};
gbs::MenuItem pause_shop_items[pause_menu_shop_capacity + 1] = {};
gbs::MenuItem pause_map_items[pause_menu_map_capacity + 1] = {};
gbs::MenuItem pause_system_items[] = {
    { "SALVAR", pause_menu_save, false },
    { gbastudio_project::save_menu_config.load_label, pause_menu_load, false },
    { gbastudio_project::save_menu_config.delete_label, pause_menu_delete, false },
    { "CONFIG", pause_menu_settings, true },
    { "VOLTAR", pause_menu_back, true }
};
gbs::MenuItem pause_save_items[max_menu_save_slots + 1] = {};
gbs::MenuItem pause_load_items[max_menu_save_slots + 1] = {};
gbs::MenuItem pause_delete_items[max_menu_save_slots + 1] = {};
gbs::MenuItem pause_delete_confirm_items[] = {
    { "CONFIRMAR", pause_menu_delete_confirm, true },
    { "CANCELAR", pause_menu_delete_cancel, true }
};
gbs::MenuItem pause_settings_items[] = {
    { "IDIOMA: PT-BR", 0, false },
    { "CONTROLES: PADRAO", 0, false },
    { "AUDIO: ATIVO", 0, false },
    { "VOLTAR", pause_menu_back, true }
};
PauseMenuPage pause_menu_page = PauseMenuPage::Root;
size_t pause_inventory_menu_item_count = 1;
size_t pause_shop_menu_item_count = 1;
size_t pause_map_menu_item_count = 1;
gbs::Vec2i pause_render_camera;
bool pause_render_camera_ready = false;
int pending_delete_slot_index = -1;

void queue_script(gbs::EventScript script);
void queue_actor_start_scripts();

constexpr size_t active_save_slot_count = gbastudio_project::save_enabled && gbastudio_project::save_menu_config.enabled ?
    (gbastudio_project::save_bank.slot_count < max_menu_save_slots ? gbastudio_project::save_bank.slot_count : max_menu_save_slots) :
    0;

int default_save_menu_index() {
    if (active_save_slot_count == 0) {
        return 0;
    }
    const int requested = static_cast<int>(gbastudio_project::save_menu_config.selected_slot) - 1;
    return requested >= 0 && static_cast<size_t>(requested) < active_save_slot_count ? requested : 0;
}

bool topdown_direction_uses_horizontal_flip(uint8_t direction) {
    return direction == static_cast<uint8_t>(gbs::TopDownActorDirection::Left) ||
        direction == static_cast<uint8_t>(gbs::TopDownActorDirection::DownLeft) ||
        direction == static_cast<uint8_t>(gbs::TopDownActorDirection::UpLeft);
}

void set_actor_metasprite(
    int first_index,
    const gbs::MetaSprite& metasprite,
    gbs::Vec2i position,
    gbs::Vec2i size,
    bool hflip,
    const gbs::TopDownAffineObjectData* affine_object = nullptr
) {
    if (!gbs::is_valid_metasprite(metasprite)) {
        return;
    }

    gbs::AffineSpriteTransform affine_transform = affine_object != nullptr
        ? affine_object->transform
        : gbs::AffineSpriteTransform { 256, 0, 0, 256 };
    const bool has_affine_keyframes = affine_object != nullptr
        && affine_object->keyframes != nullptr
        && affine_object->keyframe_count > 0;
    const bool affine_transform_ready = has_affine_keyframes
        ? gbs::sample_affine_matrix(
            affine_transform,
            affine_object->keyframes,
            affine_object->keyframe_count,
            gbs::frame_count(),
            affine_object->keyframe_easing
        )
        : affine_object != nullptr;
    const bool use_affine = affine_object != nullptr
        && affine_object->enabled
        && affine_transform_ready
        && gbs::set_affine_sprite_transform(affine_object->matrix_index, affine_transform);
    for (uint8_t part_index = 0; part_index < metasprite.part_count; ++part_index) {
        const gbs::MetaSpritePart& part = metasprite.parts[part_index];
        const int part_x = hflip
            ? position.x + size.x - static_cast<int>(part.x) - part.width
            : position.x + part.x;
        const int part_y = position.y + part.y;
        gbs::set_sprite(first_index + part_index, gbs::Sprite {
            part_x,
            part_y,
            part.tile_index,
            part.palette,
            hflip ? !part.hflip : part.hflip,
            part.vflip,
            true,
            0,
            gbs::SpriteRenderMode::Normal,
            gbs::visual_effect_sprite_mosaic_enabled(visual_effects),
            part.width,
            part.height,
            use_affine,
            use_affine && affine_object->double_size,
            static_cast<uint8_t>(use_affine ? affine_object->matrix_index : 0),
            part.color_depth
        });
    }
}

void draw_active_dialogue_emote(const gbs::DialogueState& state, gbs::Vec2i actor_screen_position) {
    if (!gbs::dialogue_should_show_emote(state)) {
        return;
    }
    const gbs::MetaSprite* emote = gbs::dialogue_emote_metasprite(state.emote);
    if (emote == nullptr) {
        return;
    }
    gbs::set_metasprite(
        gbs::dialogue_emote_oam_index,
        *emote,
        gbs::dialogue_emote_position_pixels(actor_screen_position)
    );
}

void draw_active_dialogue_portrait(const gbs::DialogueState& state) {
    if (!gbs::dialogue_should_show_portrait(state)) {
        return;
    }
    const gbs::MetaSprite* portrait = gbs::dialogue_portrait_metasprite(state.portrait);
    if (portrait == nullptr) {
        return;
    }
    gbs::set_metasprite(
        gbs::dialogue_portrait_oam_index,
        *portrait,
        gbs::dialogue_portrait_position_pixels(state)
    );
}

uint32_t save_sequence = 0;
uint32_t play_time_frames = 0;
int current_save_slot_index = 0;
char hud_left_buffer[16] = {};
char hud_right_buffer[16] = {};

void on_vblank() {
    ++vblank_ticks;
}

void write_small_number(char* out, int value) {
    if (out == nullptr) {
        return;
    }
    if (value < 0) {
        value = 0;
    }
    if (value > 999) {
        value = 999;
    }
    if (value >= 100) {
        *out++ = static_cast<char>('0' + (value / 100));
    }
    if (value >= 10) {
        *out++ = static_cast<char>('0' + ((value / 10) % 10));
    }
    *out++ = static_cast<char>('0' + (value % 10));
    *out = '\0';
}

void append_char(char*& out, char* end, char value) {
    if (out < end) {
        *out = value;
        ++out;
    }
}

void append_text(char*& out, char* end, const char* text) {
    if (text == nullptr) {
        return;
    }
    while (*text != '\0') {
        append_char(out, end, *text);
        ++text;
    }
}

void append_number(char*& out, char* end, int value) {
    char number[8] = {};
    write_small_number(number, value);
    append_text(out, end, number);
}

void refresh_hud() {
    if (!gbastudio_dialogue_ui::has_hud_scene_binding(project.rooms[current_room].name)) {
        gbs::hide_hud(hud);
        return;
    }

    hud_left_buffer[0] = 'R';
    hud_left_buffer[1] = 'O';
    hud_left_buffer[2] = 'O';
    hud_left_buffer[3] = 'M';
    hud_left_buffer[4] = ' ';
    write_small_number(hud_left_buffer + 5, current_room + 1);

    hud_right_buffer[0] = 'S';
    hud_right_buffer[1] = 'A';
    hud_right_buffer[2] = 'V';
    hud_right_buffer[3] = 'E';
    hud_right_buffer[4] = ' ';
    write_small_number(hud_right_buffer + 5, static_cast<int>(save_sequence));
    gbs::set_hud_text(hud, hud_left_buffer, hud_right_buffer);
}

void refresh_pause_menu_items() {
    for (size_t index = 0; index < max_menu_save_slots; ++index) {
        pause_save_items[index] = gbs::MenuItem {
            index == 0 ? "SAVE 1" : (index == 1 ? "SAVE 2" : "SAVE 3"),
            pause_menu_save_base + static_cast<int>(index),
            index < active_save_slot_count
        };
        pause_load_items[index].value = pause_menu_load_base + static_cast<int>(index);
        pause_load_items[index].enabled = false;
        pause_delete_items[index].value = pause_menu_delete_base + static_cast<int>(index);
        pause_delete_items[index].enabled = false;
        char* out = load_slot_labels[index];
        char* end = load_slot_labels[index] + sizeof(load_slot_labels[index]) - 1;
        append_text(out, end, gbastudio_project::save_menu_config.load_label);
        append_text(out, end, " ");
        append_number(out, end, static_cast<int>(index + 1));
        char* delete_out = delete_slot_labels[index];
        char* delete_end = delete_slot_labels[index] + sizeof(delete_slot_labels[index]) - 1;
        append_text(delete_out, delete_end, gbastudio_project::save_menu_config.delete_label);
        append_text(delete_out, delete_end, " ");
        append_number(delete_out, delete_end, static_cast<int>(index + 1));
        if (index >= active_save_slot_count) {
            *out = '\0';
            *delete_out = '\0';
            continue;
        }

        gbs::SaveMetadataInfo info = gbs::inspect_save_slot_metadata(gbastudio_project::save_bank, index);
        pause_load_items[index].text = load_slot_labels[index];
        pause_load_items[index].enabled = info.status == gbs::SaveStatus::Ok;
        pause_delete_items[index].text = delete_slot_labels[index];
        pause_delete_items[index].enabled = info.status == gbs::SaveStatus::Ok;
        if (info.status == gbs::SaveStatus::Ok) {
            const gbs::SaveMenuConfig& save_menu = gbastudio_project::save_menu_config;
            if (save_menu.layout == gbs::SaveMenuLayout::Cards && save_menu.show_player_name) {
                append_text(out, end, " ");
                append_text(out, end, info.metadata.title);
            }
            char time_label[12] = {};
            if (save_menu.show_play_time && gbs::format_save_play_time(info.metadata.play_time_frames, time_label, sizeof(time_label))) {
                append_text(out, end, " ");
                append_text(out, end, time_label);
            }
            if (save_menu.show_location) {
                append_text(out, end, " R");
                append_number(out, end, static_cast<int>(info.metadata.room_index));
            }
        }
        *out = '\0';
        *delete_out = '\0';
    }
    pause_save_items[max_menu_save_slots] = gbs::MenuItem { "VOLTAR", pause_menu_back, true };
    pause_load_items[max_menu_save_slots] = gbs::MenuItem { "VOLTAR", pause_menu_back, true };
    pause_delete_items[max_menu_save_slots] = gbs::MenuItem { "VOLTAR", pause_menu_back, true };
    pause_system_items[0].enabled = active_save_slot_count > 0;
    pause_system_items[1].enabled = active_save_slot_count > 0;
    pause_system_items[2].enabled = gbs::count_valid_saves(gbastudio_project::save_bank) > 0;
}

bool pause_menu_has_inventory_items() {
    if (!project.inventory_enabled) return false;
    for (size_t index = 0; index < pause_menu_inventory_capacity; ++index) {
        if (event_state.inventory[index] > 0) {
            return true;
        }
    }
    return false;
}

bool pause_menu_has_shop_items() {
    return project.shop_enabled && project.shop_item_count > 0;
}

void refresh_pause_inventory_items() {
    size_t item_count = 0;
    for (size_t index = 0; index < pause_menu_inventory_capacity; ++index) {
        if (event_state.inventory[index] <= 0) {
            continue;
        }
        char* out = inventory_item_labels[item_count];
        char* end = out + sizeof(inventory_item_labels[item_count]) - 1;
        append_text(out, end, "ITEM ");
        append_number(out, end, static_cast<int>(index + 1));
        append_text(out, end, " x");
        append_number(out, end, event_state.inventory[index]);
        *out = '\0';
        pause_inventory_items[item_count++] = gbs::MenuItem { inventory_item_labels[item_count - 1], 0, false };
    }
    if (item_count == 0) {
        pause_inventory_items[item_count++] = gbs::MenuItem { "SEM ITENS", 0, false };
    }
    pause_inventory_items[item_count] = gbs::MenuItem { "VOLTAR", pause_menu_back, true };
    pause_inventory_menu_item_count = item_count + 1;
}

size_t pause_inventory_item_count() {
    return pause_inventory_menu_item_count;
}

void refresh_pause_shop_items() {
    const size_t item_count = project.shop_item_count < pause_menu_shop_capacity
        ? project.shop_item_count
        : pause_menu_shop_capacity;
    for (size_t index = 0; index < item_count; ++index) {
        const gbs::TopDownShopItemData& item = project.shop_items[index];
        char* out = shop_item_labels[index];
        char* end = out + sizeof(shop_item_labels[index]) - 1;
        append_text(out, end, item.label != nullptr ? item.label : "ITEM");
        append_text(out, end, " $");
        append_number(out, end, item.price);
        *out = '\0';
        pause_shop_items[index] = gbs::MenuItem {
            shop_item_labels[index],
            pause_menu_shop_base + static_cast<int>(index),
            gbs::topdown_shop_item_can_purchase(item, event_state)
        };
    }
    pause_shop_items[item_count] = gbs::MenuItem { "VOLTAR", pause_menu_back, true };
    pause_shop_menu_item_count = item_count + 1;
}

void update_topdown_quests() {
    if (!project.quests_enabled || project.quests == nullptr) return;
    for (size_t index = 0; index < project.quest_count; ++index) {
        const gbs::TopDownQuestData& quest = project.quests[index];
        if (gbs::complete_topdown_quest(quest, event_state)) {
            queue_script(quest.on_complete);
        }
    }
}

void refresh_pause_map_items() {
    const size_t room_count = project.room_count < pause_menu_map_capacity ? project.room_count : pause_menu_map_capacity;
    for (size_t index = 0; index < room_count; ++index) {
        char* out = map_room_labels[index];
        char* end = out + sizeof(map_room_labels[index]) - 1;
        append_text(out, end, static_cast<int>(index) == current_room ? "* SALA " : "SALA ");
        append_number(out, end, static_cast<int>(index + 1));
        *out = '\0';
        pause_map_items[index] = gbs::MenuItem { map_room_labels[index], 0, false };
    }
    pause_map_items[room_count] = gbs::MenuItem { "VOLTAR", pause_menu_back, true };
    pause_map_menu_item_count = room_count + 1;
}

size_t pause_map_item_count() {
    return pause_map_menu_item_count;
}

PauseMenuPage pause_menu_parent_page(PauseMenuPage page) {
    switch (page) {
    case PauseMenuPage::Inventory:
    case PauseMenuPage::Map:
    case PauseMenuPage::System:
        return PauseMenuPage::Root;
    case PauseMenuPage::Shop:
        return PauseMenuPage::Root;
    case PauseMenuPage::Save:
    case PauseMenuPage::Load:
    case PauseMenuPage::Delete:
    case PauseMenuPage::DeleteConfirm:
    case PauseMenuPage::Settings:
        return PauseMenuPage::System;
    case PauseMenuPage::Root:
    default:
        return PauseMenuPage::Root;
    }
}

void show_pause_menu_page(PauseMenuPage page) {
    refresh_pause_menu_items();
    pause_menu_page = page;
    switch (page) {
    case PauseMenuPage::Root:
        pause_root_items[1].enabled = pause_menu_has_inventory_items();
        pause_root_items[2].enabled = pause_menu_has_shop_items();
        pause_root_items[3].enabled = project.room_count > 1;
        gbs::show_menu(pause_menu, "MENU", pause_root_items, sizeof(pause_root_items) / sizeof(pause_root_items[0]));
        return;
    case PauseMenuPage::Inventory:
        refresh_pause_inventory_items();
        gbs::show_menu(pause_menu, "ITENS", pause_inventory_items, pause_inventory_item_count());
        return;
    case PauseMenuPage::Shop:
        refresh_pause_shop_items();
        gbs::show_menu(pause_menu, "LOJA", pause_shop_items, pause_shop_menu_item_count);
        return;
    case PauseMenuPage::Map:
        refresh_pause_map_items();
        gbs::show_menu(pause_menu, "MAPA", pause_map_items, pause_map_item_count());
        return;
    case PauseMenuPage::System:
        gbs::show_menu(pause_menu, "SISTEMA", pause_system_items, sizeof(pause_system_items) / sizeof(pause_system_items[0]));
        return;
    case PauseMenuPage::Save:
        gbs::show_menu(pause_menu, "SALVAR", pause_save_items, max_menu_save_slots + 1);
        pause_menu.selected_index = default_save_menu_index();
        return;
    case PauseMenuPage::Load:
        gbs::show_menu(pause_menu, gbastudio_project::save_menu_config.load_label, pause_load_items, max_menu_save_slots + 1);
        if (pause_load_items[default_save_menu_index()].enabled) {
            pause_menu.selected_index = default_save_menu_index();
        }
        return;
    case PauseMenuPage::Delete:
        gbs::show_menu(pause_menu, gbastudio_project::save_menu_config.delete_label, pause_delete_items, max_menu_save_slots + 1);
        if (pause_delete_items[default_save_menu_index()].enabled) {
            pause_menu.selected_index = default_save_menu_index();
        }
        return;
    case PauseMenuPage::DeleteConfirm:
        gbs::show_menu(pause_menu, gbastudio_project::save_menu_config.delete_label, pause_delete_confirm_items, sizeof(pause_delete_confirm_items) / sizeof(pause_delete_confirm_items[0]));
        return;
    case PauseMenuPage::Settings:
        gbs::show_menu(pause_menu, "CONFIG", pause_settings_items, sizeof(pause_settings_items) / sizeof(pause_settings_items[0]));
        return;
    }
}

bool stream_resources_for_room(int room_index);

void validate_production_costs() {
    gbs::RenderAssetCost render_cost {
        true,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0
    };
    for (size_t index = 0; index < project.bg_palette_count; ++index) {
        render_cost = gbs::add_render_asset_cost(render_cost, gbs::estimate_palette_asset_cost(project.bg_palettes[index]));
    }
    for (size_t index = 0; index < project.obj_palette_count; ++index) {
        render_cost = gbs::add_render_asset_cost(render_cost, gbs::estimate_palette_asset_cost(project.obj_palettes[index]));
    }
    for (size_t index = 0; index < project.tile_asset_count; ++index) {
        render_cost = gbs::add_render_asset_cost(
            render_cost,
            gbs::estimate_topdown_project_tile_asset_cost(project.tile_assets[index], project.resource_bank_group_count > 0)
        );
    }
    for (size_t index = 0; index < project.background_count; ++index) {
        if (project.backgrounds[index].compressed_tilemap == nullptr) {
            render_cost = gbs::add_render_asset_cost(render_cost, gbs::estimate_tilemap_asset_cost(project.backgrounds[index].tilemap));
        }
    }

    gbs::AudioMixCost audio_cost = gbs::estimate_pcm_mix_runtime_cost(gbs::PCM_MIXER_MAX_SFX_VOICES, project.pcm_asset_count > 0);
    for (size_t index = 0; index < project.sfx_asset_count; ++index) {
        audio_cost = gbs::add_audio_mix_cost(audio_cost, gbs::estimate_sfx_asset_cost(project.sfx_assets[index]));
    }
    for (size_t index = 0; index < project.music_asset_count; ++index) {
        audio_cost = gbs::add_audio_mix_cost(audio_cost, gbs::estimate_music_asset_cost(project.music_assets[index]));
    }
    for (size_t index = 0; index < project.pcm_asset_count; ++index) {
        audio_cost = gbs::add_audio_mix_cost(audio_cost, gbs::estimate_pcm_asset_cost(project.pcm_assets[index]));
    }

    gbs::debug_assert(render_cost.valid, "render cost", 30);
    gbs::debug_assert(audio_cost.valid, "audio cost", 31);
    gbs::debug_set_counter(6, "rbytes", render_cost.tile_bytes + render_cost.tilemap_bytes + render_cost.palette_bytes + render_cost.bitmap_bytes);
    gbs::debug_set_counter(7, "abytes", audio_cost.pcm_bytes);
}

bool reserve_project_resources() {
    gbs::init_resource_manager(resources);
    if (project.resource_bank_group_count > 0) {
        return stream_resources_for_room(current_room);
    }

    if (project.resource_bank_count > 0) {
        const bool banks_fit = project.resource_bank_count <= max_project_resource_banks;
        gbs::debug_assert(banks_fit, "resource bank cap", 1);
        if (!banks_fit) {
            return false;
        }

        bool ok = gbs::reserve_resource_banks(
            resources,
            gbs::resource_bank_batch_from_topdown_project(project),
            project_bank_reservation
        );
        gbs::debug_assert(ok, "resource banks", 2);
        gbs::debug_set_counter(3, "bgtiles", gbs::resource_pool_used_count(resources.bg_tiles));
        gbs::debug_set_counter(4, "objtiles", gbs::resource_pool_used_count(resources.obj_tiles));
        gbs::debug_set_counter(5, "oam", gbs::resource_pool_used_count(resources.oam_sprites));
        return ok;
    }

    const bool counts_fit = project.tile_asset_count <= max_project_tile_assets &&
        project.bg_palette_count <= max_project_bg_palettes &&
        project.obj_palette_count <= max_project_obj_palettes;
    gbs::debug_assert(counts_fit, "resource batch cap", 1);
    if (!counts_fit) {
        return false;
    }

    const gbs::ResourceBatch batch {
        project.tile_assets,
        project.tile_asset_count,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count,
        static_cast<uint16_t>(projectile_oam_start + max_runtime_projectiles),
        1
    };

    bool ok = gbs::reserve_resource_batch(resources, batch, project_resource_reservation);
    gbs::debug_assert(ok, "resource batch", 2);
    gbs::debug_set_counter(3, "bgtiles", gbs::resource_pool_used_count(resources.bg_tiles));
    gbs::debug_set_counter(4, "objtiles", gbs::resource_pool_used_count(resources.obj_tiles));
    gbs::debug_set_counter(5, "oam", gbs::resource_pool_used_count(resources.oam_sprites));
    return ok;
}

bool stream_resource_bank_group_in_upload_batches(const gbs::ResourceBankGroup& group) {
    const gbs::ResourceBankUploadSource* sources =
        gbastudio_project::resource_bank_upload_source_count == 0
            ? nullptr
            : gbastudio_project::resource_bank_upload_sources;
    for (size_t index = 0; index < group.bank_count; ++index) {
        if (gbs::resource_bank_requires_upload_source(group.banks[index].kind) &&
            gbs::resource_bank_upload_source_by_name(
                sources,
                gbastudio_project::resource_bank_upload_source_count,
                group.banks[index].name
            ) == nullptr) {
            return false;
        }
    }
    const gbs::ResourceStreamResult stream_result = gbs::stream_resource_bank_group_with_uploads(
        resources,
        project_bank_reservation,
        project_bank_scratch_reservation,
        group,
        sources,
        gbastudio_project::resource_bank_upload_source_count
    );
    if (stream_result.success) {
        if (stream_result.uploaded_count > 0) {
            gbs::wait_vblank();
        }
        return true;
    }
    if (stream_result.status != gbs::ResourceStreamStatus::DmaQueueFull) {
        return false;
    }

    if (!gbs::stream_resource_bank_group(
            resources,
            project_bank_reservation,
            project_bank_scratch_reservation,
            group)) {
        return false;
    }

    bool queued_upload = false;
    for (size_t index = 0; index < project_bank_reservation.reservation_count; ++index) {
        const gbs::ResourceBankReservation& reservation = project_bank_reservation.reservations[index];
        if (!gbs::resource_bank_requires_upload_source(reservation.kind)) {
            continue;
        }
        if (gbs::dma_vblank_queue_count() >= gbs::dma_vblank_queue_capacity) {
            gbs::wait_vblank();
            queued_upload = false;
        }
        const void* source = gbs::resource_bank_upload_source_by_name(
            sources,
            gbastudio_project::resource_bank_upload_source_count,
            reservation.name
        );
        if (!gbs::enqueue_resource_bank_upload_vblank(reservation, source)) {
            return false;
        }
        queued_upload = true;
    }
    if (queued_upload) {
        gbs::wait_vblank();
    }
    return true;
}

bool stream_resources_for_room(int room_index) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    if (!gbs::is_valid_room_index(project, room_index)) {
        return false;
    }

    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_topdown_room(project, project.rooms[room_index]);
    const bool group_found = group.name != nullptr;
    const bool banks_fit = group.bank_count <= max_project_resource_banks;
    gbs::debug_assert(group_found, "room bank group", 6);
    gbs::debug_assert(banks_fit, "room bank cap", 7);
    if (!group_found || !banks_fit) {
        return false;
    }

    if (gbs::resource_bank_cache_contains_group(project_bank_cache, group)) {
        const gbs::ResourceBankCacheGroupResult promote_result = gbs::hot_swap_resource_bank_group_from_cache(
            resources,
            project_bank_reservation,
            project_bank_cache,
            group
        );
        if (promote_result.success) {
            gbs::debug_set_counter(6, "stream", 0);
            gbs::debug_set_counter(7, "uploads", 0);
            gbs::debug_set_counter(8, "largest", gbs::resource_pool_largest_free_block(resources.bg_tiles));
            gbs::debug_set_counter(3, "bgtiles", gbs::resource_pool_used_count(resources.bg_tiles));
            gbs::debug_set_counter(4, "objtiles", gbs::resource_pool_used_count(resources.obj_tiles));
            gbs::debug_set_counter(5, "oam", gbs::resource_pool_used_count(resources.oam_sprites));
            return true;
        }
    }

    const bool ok = stream_resource_bank_group_in_upload_batches(group);
    gbs::debug_assert(ok, "room bank stream", 8);
    gbs::debug_set_counter(6, "stream", ok ? 0 : 1);
    gbs::debug_set_counter(7, "uploads", static_cast<uint32_t>(group.bank_count));
    gbs::debug_set_counter(8, "largest", gbs::resource_pool_largest_free_block(resources.bg_tiles));
    gbs::debug_set_counter(3, "bgtiles", gbs::resource_pool_used_count(resources.bg_tiles));
    gbs::debug_set_counter(4, "objtiles", gbs::resource_pool_used_count(resources.obj_tiles));
    gbs::debug_set_counter(5, "oam", gbs::resource_pool_used_count(resources.oam_sprites));
    return ok;
}

void load_active_room_visual_tilemap() {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    if (!room_data.uses_visual_tilemap ||
        room_data.visual_tilemap == nullptr ||
        room_data.visual_tile_asset == nullptr ||
        room_data.visual_palette == nullptr) {
        return;
    }
    gbs::load_palette(*room_data.visual_palette, false);
    gbs::load_tiles(*room_data.visual_tile_asset);
    gbs::load_tilemap(gbs::BackgroundLayer::BG2, *room_data.visual_tilemap);
}

void apply_active_room_video() {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    const gbs::VideoComposition& composition = room_data.video.affine_enabled
        ? room_data.video
        : project.video;
    gbs::apply_video_composition(composition);
}

void configure_dialogue_ui_for_active_room(bool force = false) {
    const gbs::TopDownRoomData& active_room_data = project.rooms[current_room];
    const bool affine_room = active_room_data.video.affine_enabled || project.video.affine_enabled;
    // The 128x128 affine map occupies screenblocks 0-7, which overlap the
    // BG0 text character block. Keep the UI layer disabled for this integrated
    // Affine scene while preserving the authored composition.
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, !affine_room);
    if (!force && configured_dialogue_ui_room == current_room &&
        configured_dialogue_ui_affine == affine_room) {
        return;
    }

    gbastudio_dialogue_ui::configure_for_scene(active_room_data.name, force);
    if (affine_room) {
        // BG2 affine compositions address all 256 BG palette entries. UI
        // skins reserve palettes 14/15, so disable them and restore the
        // authored affine palette after the scene configuration.
        gbs::configure_dialogue_box_skin(nullptr);
        gbs::configure_hud_box_skin(nullptr);
        apply_active_room_video();
    }
    configured_dialogue_ui_room = current_room;
    configured_dialogue_ui_affine = affine_room;
}

void prefetch_room_resource_groups(int active_room, gbs::Vec2i camera_center_pixels) {
    const gbs::TopDownRoomData& active_room_data = project.rooms[active_room];
    const bool affine_room = active_room_data.video.affine_enabled || project.video.affine_enabled;
    if (active_room_data.uses_visual_tilemap || affine_room) {
        // Authored visual tilemaps and affine compositions use fixed BG2 tile,
        // map, and palette slots. Do not stream another room into those slots
        // while this presentation is live.
        return;
    }

    const gbs::ResourceBankUploadSource* upload_sources =
        gbastudio_project::resource_bank_upload_source_count == 0
            ? nullptr
            : gbastudio_project::resource_bank_upload_sources;

    if (project.resource_bank_group_count == 0 ||
        project.room_count <= 1 ||
        upload_sources == nullptr) {
        return;
    }

    size_t request_count = 0;
    for (size_t room_index = 0; room_index < project.room_count && request_count < max_project_resource_banks; ++room_index) {
        if (static_cast<int>(room_index) == active_room) {
            continue;
        }
        const gbs::TopDownRoomData& room_data = project.rooms[room_index];
        const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_topdown_room(project, room_data);
        if (group.name == nullptr ||
            group.bank_count == 0 ||
            group.bank_count > max_project_resource_banks ||
            gbs::resource_bank_name_equals(group.name, project_bank_reservation.group_name)) {
            continue;
        }

        const gbs::Rect area {
            0,
            0,
            room_data.width_tiles * 8,
            room_data.height_tiles * 8
        };
        for (size_t bank_index = 0; bank_index < group.bank_count && request_count < max_project_resource_banks; ++bank_index) {
            topdown_prefetch_requests[request_count++] = gbs::ResourceBankPrefetchRequest {
                &group.banks[bank_index],
                area,
                192,
                48,
                512,
                false
            };
        }
    }

    if (request_count == 0) {
        return;
    }

    const gbs::ResourceBankPrefetchPolicy prefetch_policy {
        max_prefetch_new_banks_per_frame,
        max_prefetch_uploads_per_frame,
        true
    };
    gbs::prefetch_resource_banks_for_camera_with_uploads_policy(
        resources,
        project_bank_cache,
        topdown_prefetch_requests,
        request_count,
        camera_center_pixels,
        gbs::frame_count(),
        upload_sources,
        gbastudio_project::resource_bank_upload_source_count,
        prefetch_policy
    );
}

void load_project_assets() {
    const bool assets_are_streamed = project.resource_bank_group_count > 0;
    if (!assets_are_streamed) {
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
    // Resource-bank streaming uploads palettes and tiles per room. A room
    // with an authored visual tilemap must copy only that map after its bank
    // is active; loading every project background in sequence can leave BG2
    // pointing at a different map whose tiles are not resident.
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    if (room_data.uses_visual_tilemap && room_data.visual_tilemap != nullptr) {
        load_active_room_visual_tilemap();
    } else {
        for (size_t index = 0; index < project.background_count; ++index) {
            const gbs::TopDownBackgroundData& background = project.backgrounds[index];
            if (gbs::background_uses_compressed_tilemap(background)) {
                gbs::load_tilemap(background.layer, *background.compressed_tilemap);
            } else {
                gbs::load_tilemap(background.layer, background.tilemap);
            }
            gbs::set_bg_parallax(camera.position_pixels, gbs::parallax_from_background(background));
        }
    }
    apply_active_room_video();
}

size_t active_room_tile_count() {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    if (room_data.width_tiles <= 0 || room_data.height_tiles <= 0) {
        return 0;
    }
    const size_t count = static_cast<size_t>(room_data.width_tiles) *
        static_cast<size_t>(room_data.height_tiles);
    return count < max_mutable_room_tiles ? count : max_mutable_room_tiles;
}

void reset_active_room_visual_tiles() {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    const size_t count = active_room_tile_count();
    for (size_t index = 0; index < count; ++index) {
        mutable_room_visual_tiles[index] = room_data.visual_tiles[index];
    }
    for (size_t index = count; index < max_mutable_room_tiles; ++index) {
        mutable_room_visual_tiles[index] = 0;
    }
    mutable_room_visual_tiles_ready = true;
}

const uint16_t* active_room_visual_tiles() {
    if (!mutable_room_visual_tiles_ready) {
        reset_active_room_visual_tiles();
    }
    return mutable_room_visual_tiles;
}

bool background_dimensions_for_layer(int layer, int& width, int& height) {
    for (size_t index = 0; index < project.background_count; ++index) {
        const gbs::TopDownBackgroundData& background = project.backgrounds[index];
        if (static_cast<int>(background.layer) != layer) {
            continue;
        }
        if (background.compressed_tilemap != nullptr) {
            width = background.compressed_tilemap->width;
            height = background.compressed_tilemap->height;
        } else {
            width = background.tilemap.width;
            height = background.tilemap.height;
        }
        return width > 0 && height > 0;
    }
    return false;
}

bool apply_tile_command(const gbs::EventTileCommand& command) {
    for (int offset = 0; offset < command.count; ++offset) {
        const int x = command.x + offset;
        const int y = command.y;
        gbs::EventTileCommand resolved_command = command;
        resolved_command.tile += offset;
        const uint16_t tile = gbs::resolve_event_tile(
            resolved_command,
            project.tile_assets,
            project.tile_asset_count
        );
        if (command.layer == 0) {
            const gbs::TopDownRoomData& room_data = project.rooms[current_room];
            if (x < 0 || y < 0 || x >= room_data.width_tiles || y >= room_data.height_tiles) {
                continue;
            }
            active_room_visual_tiles();
            const size_t tile_index = static_cast<size_t>(y * room_data.width_tiles + x);
            if (tile_index < max_mutable_room_tiles) {
                mutable_room_visual_tiles[tile_index] = tile;
            }
            continue;
        }

        int width = 0;
        int height = 0;
        if (background_dimensions_for_layer(command.layer, width, height)) {
            gbs::set_bg_tile(static_cast<gbs::BackgroundLayer>(command.layer), x, y, width, height, tile);
        }
    }
    return true;
}

void consume_tile_commands() {
    for (size_t index = 0; index < event_state.tile_command_count; ++index) {
        apply_tile_command(event_state.tile_commands[index]);
    }
    gbs::clear_event_tile_commands(event_state);
}

size_t current_npc_count();
size_t collect_npc_blocking_actors(size_t npc_index, gbs::Actor* out, size_t capacity);
size_t collect_active_npc_actors(gbs::Actor* out, size_t* out_indices, size_t capacity);
gbs::Vec2i projectile_direction_delta(int direction);
void refresh_npc_directional_animation(size_t index, bool moving);
void consume_push_actor_commands() {
    for(size_t i=0;i<event_state.actor_command_count;++i) {
        const gbs::EventActorCommand& command=event_state.actor_commands[i];
        if(command.op!=gbs::EventActorOp::PushFacing) continue;
        gbs::Actor* target=command.actor_index==-1 ? &player :
            (command.actor_index>=0 && static_cast<size_t>(command.actor_index)<current_npc_count() ? &npc_runtimes[command.actor_index].actor : nullptr);
        if(target==nullptr) continue;
        gbs::Actor blockers[max_active_npc_slots+1]{};
        size_t blocker_count=0;
        if(command.actor_index>=0) blocker_count=collect_npc_blocking_actors(static_cast<size_t>(command.actor_index),blockers,max_active_npc_slots+1);
        else { size_t indices[max_active_npc_slots]{};blocker_count=collect_active_npc_actors(blockers,indices,max_active_npc_slots); }
        const gbs::Vec2i direction=projectile_direction_delta(player.direction);
        const int distance=command.a!=0 ? (room.width_tiles+room.height_tiles)*8 : 8;
        gbs::push_actor_by_delta_until_collision(room.collision,*target,{direction.x*distance,direction.y*distance},blockers,blocker_count);
        if(command.actor_index>=0) { npc_runtimes[command.actor_index].movement_cancelled=true;refresh_npc_directional_animation(static_cast<size_t>(command.actor_index),false); }
    }
}

void consume_player_event_commands() {
    const int previous_sprite_index = player_event_runtime.sprite_index;
    player_event_runtime.x = player.position_pixels.x;
    player_event_runtime.y = player.position_pixels.y;
    player_event_runtime.direction = player.direction;
    for (size_t index = 0; index < event_state.actor_command_count; ++index) {
        gbs::apply_event_player_command(player_event_runtime, event_state.actor_commands[index]);
    }
    if (player_event_runtime.sprite_index != previous_sprite_index) {
        apply_player_sprite_variant();
    }
    player.position_pixels = gbs::Vec2i { player_event_runtime.x, player_event_runtime.y };
    player.direction = static_cast<uint8_t>(player_event_runtime.direction);
    event_state.player_x = player.position_pixels.x;
    event_state.player_y = player.position_pixels.y;
    event_state.player_direction = player.direction;
}

void consume_overlay_state() {
    if (event_state.overlay_line_changed) {
        gbs::set_overlay_line(overlay, event_state.overlay_line);
        event_state.overlay_line_changed = false;
    }
    if (event_state.overlay_show_requested) {
        gbs::show_overlay(
            overlay,
            event_state.overlay_show_x,
            event_state.overlay_show_y,
            event_state.overlay_show_width,
            event_state.overlay_show_height
        );
        event_state.overlay_show_requested = false;
    }
    if (event_state.overlay_move_requested) {
        gbs::move_overlay(
            overlay,
            event_state.overlay_x,
            event_state.overlay_y,
            event_state.overlay_transition_frames
        );
        event_state.overlay_move_requested = false;
    }
    if (event_state.overlay_hide_requested) {
        gbs::hide_overlay(overlay);
        event_state.overlay_hide_requested = false;
    }
}

void configure_hardware_core() {
    gbs::set_interrupt_callback(gbs::InterruptSource::VBlank, on_vblank);
    gbs::enable_interrupt(gbs::InterruptSource::VBlank);
    gbs::timer_start(gbs::TimerId::Timer0, gbs::TimerConfig {
        gbs::timer_reload_for_ticks(1024),
        gbs::TimerFrequency::Cpu1024,
        false,
        false
    });
    // BG0 = UI, BG1 = foreground, BG2 = ground.
    gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 1);
    gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, true);
}

size_t current_npc_count() {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    if (room_data.npcs == nullptr) {
        return 0;
    }
    return room_data.npc_count < max_npc_slots ? room_data.npc_count : max_npc_slots;
}

size_t collect_camera_npc_slots(size_t* out_indices, size_t capacity, int margin_pixels) {
    const int viewport_width_pixels = gbs::topdown_camera_viewport_width_pixels(camera.zoom_x256);
    const int viewport_height_pixels = gbs::topdown_camera_viewport_height_pixels(camera.zoom_x256);
    return gbs::collect_visible_actor_runtime_slots(
        npc_runtimes,
        current_npc_count(),
        camera.position_pixels,
        viewport_width_pixels,
        viewport_height_pixels,
        margin_pixels,
        out_indices,
        capacity
    );
}

size_t collect_active_npc_actors(gbs::Actor* out, size_t* out_indices, size_t capacity) {
    if (out == nullptr || capacity == 0) {
        return 0;
    }
    size_t npc_slots[max_active_npc_slots] = {};
    const size_t slot_capacity = capacity < max_active_npc_slots ? capacity : max_active_npc_slots;
    const size_t npc_slot_count = collect_camera_npc_slots(
        npc_slots,
        slot_capacity,
        active_npc_viewport_margin_pixels
    );
    size_t count = 0;
    for (size_t slot_index = 0; slot_index < npc_slot_count; ++slot_index) {
        const size_t npc_index = npc_slots[slot_index];
        out[count] = npc_runtimes[npc_index].actor;
        if (out_indices != nullptr) {
            out_indices[count] = npc_index;
        }
        ++count;
    }
    return count;
}

size_t collect_npc_blocking_actors(size_t npc_index, gbs::Actor* out, size_t capacity) {
    if (out == nullptr || capacity == 0) {
        return 0;
    }
    size_t count = 0;
    out[count] = player;
    ++count;

    size_t npc_slots[max_active_npc_slots] = {};
    const size_t slot_capacity = (capacity - count) < max_active_npc_slots
        ? (capacity - count)
        : max_active_npc_slots;
    const size_t npc_slot_count = collect_camera_npc_slots(
        npc_slots,
        slot_capacity,
        active_npc_viewport_margin_pixels
    );
    for (size_t slot_index = 0; slot_index < npc_slot_count && count < capacity; ++slot_index) {
        const size_t index = npc_slots[slot_index];
        if (index == npc_index) {
            continue;
        }
        out[count] = npc_runtimes[index].actor;
        ++count;
    }
    return count;
}

void consume_actor_push_commands() {
    const size_t npc_count = current_npc_count();
    for (size_t command_index = 0; command_index < event_state.actor_command_count; ++command_index) {
        const gbs::EventActorCommand& command = event_state.actor_commands[command_index];
        if (command.op != gbs::EventActorOp::Push ||
            command.actor_index < 0 ||
            static_cast<size_t>(command.actor_index) >= npc_count) {
            continue;
        }
        const size_t npc_index = static_cast<size_t>(command.actor_index);
        size_t blocker_count = 0;
        push_blocking_actors[blocker_count] = player;
        ++blocker_count;
        for (size_t index = 0; index < npc_count && blocker_count < max_npc_slots; ++index) {
            if (index == npc_index || !npc_runtimes[index].active || !npc_runtimes[index].visible) {
                continue;
            }
            push_blocking_actors[blocker_count] = npc_runtimes[index].actor;
            ++blocker_count;
        }
        npc_runtimes[npc_index].active = true;
        gbs::push_actor_by_delta_until_collision(
            room.collision,
            npc_runtimes[npc_index].actor,
            gbs::Vec2i { command.a, command.b },
            push_blocking_actors,
            blocker_count
        );
    }
}

void init_npc_runtime() {
    for (size_t index = 0; index < max_npc_slots; ++index) {
        gbs::init_sprite_animator(npc_animators[index]);
        npc_streamed_tile_assets_loaded[index] = nullptr;
        npc_runtimes[index] = gbs::TopDownActorRuntime {
            gbs::Actor { gbs::Vec2i { 0, 0 }, gbs::Vec2i { 0, 0 }, 0 },
            nullptr,
            nullptr,
            false,
            false,
            0,
            100,
            false,
            0
        };
        npc_health[index] = 0;
        npc_touching_player[index] = false;
        npc_defeat_pending_despawn[index] = false;
    }

    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    const size_t npc_count = current_npc_count();
    for (size_t index = 0; index < npc_count; ++index) {
        npc_runtimes[index] = gbs::actor_runtime_from_npc(room_data.npcs[index]);
        npc_health[index] = room_data.npcs[index].health > 0 ? room_data.npcs[index].health : 1;
        if (npc_runtimes[index].animation != nullptr) {
            gbs::select_sprite_animation(npc_animators[index], *npc_runtimes[index].animation);
        }
        if (index < gbs::max_event_actor_state_slots) {
            event_state.actor_update_script_enabled[index] = gbs::has_event_script(room_data.npcs[index].on_update);
        }
    }
}

void refresh_npc_runtime_animation(size_t index, bool playing) {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    if (index >= room_data.npc_count) {
        return;
    }

    const gbs::TopDownActorSpriteData* actor_sprite = gbs::topdown_actor_sprite_for_index(
        project,
        npc_runtimes[index].sprite_index
    );
    npc_runtimes[index].metasprite = actor_sprite != nullptr && actor_sprite->metasprite != nullptr
        ? actor_sprite->metasprite
        : room_data.npcs[index].metasprite;
    const gbs::SpriteAnimation* next_animation = actor_sprite != nullptr
        ? gbs::topdown_actor_animation_for_index(*actor_sprite, npc_runtimes[index].animation_index)
        : gbs::topdown_npc_animation_for_index(room_data.npcs[index], npc_runtimes[index].animation_index);
    if (next_animation == npc_runtimes[index].animation) {
        if (next_animation != nullptr && playing && !npc_animators[index].playing) {
            gbs::play_sprite_animation(npc_animators[index], *next_animation);
        } else if (!playing) {
            gbs::stop_sprite_animation(npc_animators[index]);
        }
        return;
    }

    npc_runtimes[index].animation = next_animation;
    gbs::init_sprite_animator(npc_animators[index]);
    if (next_animation != nullptr) {
        if (playing) {
            gbs::play_sprite_animation(npc_animators[index], *next_animation);
        } else {
            gbs::select_sprite_animation(npc_animators[index], *next_animation);
        }
    }
}

void refresh_player_runtime_animation(int animation_index) {
    const gbs::TopDownActorSpriteData* actor_sprite = selected_player_sprite_data();
    const gbs::SpriteAnimation* next_animation = actor_sprite != nullptr
        ? gbs::topdown_actor_animation_for_index(*actor_sprite, animation_index)
        : gbs::topdown_actor_animation_for_index(project.player, animation_index);
    if (next_animation == nullptr || next_animation == player_animator.animation) {
        return;
    }

    gbs::init_sprite_animator(player_animator);
    gbs::play_sprite_animation(player_animator, *next_animation);
}

void refresh_player_directional_animation(bool moving) {
    const gbs::TopDownActorSpriteData* actor_sprite = selected_player_sprite_data();
    const size_t animation_count = actor_sprite != nullptr
        ? actor_sprite->animation_count
        : project.player.animation_count;
    if (!topdown_has_idle_directional_animations(animation_count)) {
        return;
    }
    refresh_player_runtime_animation(topdown_directional_animation_index(animation_count, player.direction, moving));
}

const gbs::TopDownActorSpriteData* selected_player_sprite_data() {
    return gbs::topdown_actor_sprite_for_index(project, player_event_runtime.sprite_index);
}

const gbs::MetaSprite* player_runtime_metasprite() {
    const gbs::MetaSprite* metasprite = gbs::current_metasprite(player_animator);
    if (metasprite != nullptr) return metasprite;
    const gbs::TopDownActorSpriteData* actor_sprite = selected_player_sprite_data();
    return actor_sprite != nullptr && actor_sprite->metasprite != nullptr
        ? actor_sprite->metasprite
        : project.player.metasprite;
}

bool load_streamed_animation_frame_tiles(
    const gbs::SpriteAnimatorState& animator,
    const gbs::TileAsset*& loaded_asset
) {
    if (animator.animation == nullptr || animator.animation->frames == nullptr || animator.animation->frame_count == 0) {
        loaded_asset = nullptr;
        return true;
    }
    const uint8_t frame_index = animator.frame_index < animator.animation->frame_count ? animator.frame_index : 0;
    const gbs::TileAsset* streamed_asset = animator.animation->frames[frame_index].streamed_tile_asset;
    if (streamed_asset == nullptr) {
        loaded_asset = nullptr;
        return true;
    }
    if (loaded_asset == streamed_asset) return true;
    if (!gbs::load_tiles(*streamed_asset)) return false;
    loaded_asset = streamed_asset;
    return true;
}

void apply_player_sprite_variant() {
    gbs::init_sprite_animator(player_animator);
    player_streamed_tile_asset_loaded = nullptr;
    const gbs::TopDownActorSpriteData* actor_sprite = selected_player_sprite_data();
    const gbs::SpriteAnimation* initial_animation = actor_sprite != nullptr
        ? actor_sprite->animation
        : project.player.animation;
    if (initial_animation != nullptr) {
        gbs::play_sprite_animation(player_animator, *initial_animation);
    }
    refresh_player_directional_animation(false);
    load_streamed_animation_frame_tiles(player_animator, player_streamed_tile_asset_loaded);
}

void refresh_npc_directional_animation(size_t index, bool moving) {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    if (index >= room_data.npc_count ||
        room_data.npcs[index].movement.kind == gbs::TopDownNpcMovementKind::None) {
        return;
    }

    const gbs::TopDownActorSpriteData* actor_sprite = gbs::topdown_actor_sprite_for_index(
        project,
        npc_runtimes[index].sprite_index
    );
    const size_t animation_count = actor_sprite != nullptr
        ? actor_sprite->animation_count
        : room_data.npcs[index].animation_count;
    if (!topdown_has_idle_directional_animations(animation_count)) return;

    npc_runtimes[index].animation_index = topdown_directional_animation_index(
        animation_count,
        npc_runtimes[index].actor.direction,
        moving
    );
    refresh_npc_runtime_animation(index, moving);
}

void sync_event_actor_animation_state() {
    const size_t npc_count = current_npc_count();
    for (size_t index = 0; index < npc_count; ++index) {
        if (index >= gbs::max_event_actor_state_slots) {
            break;
        }
        event_state.actor_x[index] = npc_runtimes[index].actor.position_pixels.x;
        event_state.actor_y[index] = npc_runtimes[index].actor.position_pixels.y;
        event_state.actor_direction[index] = npc_runtimes[index].actor.direction;
        gbs::set_event_actor_animation_state(
            event_state,
            static_cast<int>(index),
            npc_animators[index].playing
        );
    }
}

uint32_t runtime_input_direction_bits(gbs::InputState input) {
    uint32_t bits = 0;
    if (input.is_held(gbs::ButtonRight)) bits |= 1u << 0;
    if (input.is_held(gbs::ButtonLeft)) bits |= 1u << 1;
    if (input.is_held(gbs::ButtonUp)) bits |= 1u << 2;
    if (input.is_held(gbs::ButtonDown)) bits |= 1u << 3;
    return bits;
}

uint32_t runtime_slope_bits_in_rect(const gbs::TileMap& map, gbs::Rect rect) {
    const int left = rect.x / 8;
    const int top = rect.y / 8;
    const int right = (rect.right() - 1) / 8;
    const int bottom = (rect.bottom() - 1) / 8;
    uint32_t bits = 0;
    for (int tile_y = top; tile_y <= bottom; ++tile_y) {
        for (int tile_x = left; tile_x <= right; ++tile_x) {
            const uint32_t slope = static_cast<uint32_t>(gbs::tile_slope_at(map, tile_x, tile_y));
            if (slope != 0) bits |= static_cast<uint32_t>(1u << slope);
        }
    }
    return bits;
}

void sync_runtime_telemetry() {
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = current_room;
    runtime_telemetry.flag_bits = 0;
    for (size_t index = 0; index < 16; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) {
            runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
        }
    }
    runtime_telemetry.player_x = player.position_pixels.x;
    runtime_telemetry.player_y = player.position_pixels.y;
    runtime_telemetry.player_direction = player.direction;
    const size_t actor_count = current_npc_count();
    runtime_telemetry.actor_count = static_cast<uint32_t>(actor_count);
    runtime_telemetry.first_actor_x = -1;
    runtime_telemetry.first_actor_y = -1;
    runtime_telemetry.first_actor_direction = -1;
    runtime_telemetry.first_actor_visible = 0;
    if (actor_count > 0) {
        runtime_telemetry.first_actor_x = npc_runtimes[0].actor.position_pixels.x;
        runtime_telemetry.first_actor_y = npc_runtimes[0].actor.position_pixels.y;
        runtime_telemetry.first_actor_direction = npc_runtimes[0].actor.direction;
        runtime_telemetry.first_actor_visible = npc_runtimes[0].visible ? 1u : 0u;
    }
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    const gbs::Rect player_rect = gbs::actor_rect(player);
    const int center_tile_x = (player_rect.x + player_rect.width / 2) / 8;
    const int center_tile_y = (player_rect.y + player_rect.height / 2) / 8;
    const uint32_t current_flags = gbs::tile_flags_in_rect(room.collision, player_rect);
    const uint32_t current_slope = static_cast<uint32_t>(gbs::tile_slope_at(room.collision, center_tile_x, center_tile_y));
    const uint32_t current_effects = current_flags & static_cast<uint32_t>(gbs::TileWater | gbs::TileDamage | gbs::TileLadder);
    runtime_telemetry.current_tile_flags = current_flags;
    runtime_telemetry.current_tile_slope = current_slope;
    runtime_telemetry.seen_tile_effects |= current_effects;
    if (current_slope != 0) {
        runtime_telemetry.seen_slope_bits |= static_cast<uint32_t>(1u << current_slope);
    }
    if (runtime_last_room < 0) {
        runtime_last_room = current_room;
    } else if (runtime_last_room != current_room) {
        ++runtime_room_change_count;
        runtime_last_room = current_room;
    }
    runtime_telemetry.trigger_enter_count = runtime_trigger_enter_count;
    runtime_telemetry.trigger_leave_count = runtime_trigger_leave_count;
    runtime_telemetry.room_change_count = runtime_room_change_count;
    runtime_telemetry.blocked_direction_bits = runtime_blocked_direction_bits;
    gbs::publish_runtime_physical_telemetry(resources, event_state);
}

bool queue_script(gbs::EventScript script, bool trigger_room_enter);
void queue_script(gbs::EventScript script);

void sync_event_player_actor_state() {
    gbs::set_event_player_actor_state(
        event_state,
        player.position_pixels.x,
        player.position_pixels.y,
        player.direction,
        8
    );
}

bool queue_adventure_callback(int callback_index, bool trigger_room_enter) {
    int script_index = -1;
    if (!gbs::adventure_callback_script(event_state, callback_index, script_index) ||
        !gbs::is_valid_project_script_index(project, script_index)) {
        return false;
    }
    queue_script(project.scripts[script_index], trigger_room_enter);
    return true;
}

void init_runtime_projectiles() {
    for (RuntimeProjectile& projectile : runtime_projectiles) {
        projectile = RuntimeProjectile { false, 0, 0, 0, 0, 1, 100, 0, 0 };
    }
}

int next_runtime_projectile_index() {
    for (size_t index = 0; index < max_runtime_projectiles; ++index) {
        if (!runtime_projectiles[index].active) {
            return static_cast<int>(index);
        }
    }
    return -1;
}

gbs::Vec2i projectile_direction_delta(int direction) {
    switch (direction) {
    case 1:
        return gbs::Vec2i { 0, -1 };
    case 2:
        return gbs::Vec2i { -1, 0 };
    case 3:
        return gbs::Vec2i { 1, 0 };
    case 4:
        return gbs::Vec2i { -1, 1 };
    case 5:
        return gbs::Vec2i { 1, 1 };
    case 6:
        return gbs::Vec2i { -1, -1 };
    case 7:
        return gbs::Vec2i { 1, -1 };
    case 0:
    default:
        return gbs::Vec2i { 0, 1 };
    }
}

bool projectile_spawn_position(int actor_index, gbs::Vec2i& position) {
    if (actor_index <= 0) {
        position = gbs::Vec2i {
            player.position_pixels.x + player.size_pixels.x / 2,
            player.position_pixels.y + player.size_pixels.y / 2
        };
        return true;
    }

    const size_t npc_count = current_npc_count();
    const int npc_index = actor_index - 1;
    if (npc_index >= 0 && static_cast<size_t>(npc_index) < npc_count) {
        const gbs::Actor& actor = npc_runtimes[npc_index].actor;
        position = gbs::Vec2i {
            actor.position_pixels.x + actor.size_pixels.x / 2,
            actor.position_pixels.y + actor.size_pixels.y / 2
        };
        return true;
    }

    if (actor_index >= 0 && static_cast<size_t>(actor_index) < npc_count) {
        const gbs::Actor& actor = npc_runtimes[actor_index].actor;
        position = gbs::Vec2i {
            actor.position_pixels.x + actor.size_pixels.x / 2,
            actor.position_pixels.y + actor.size_pixels.y / 2
        };
        return true;
    }

    return false;
}

uint8_t projectile_source_collision_group(int actor_index) {
    if (actor_index <= 0) {
        return player.collision_group;
    }

    const size_t npc_count = current_npc_count();
    const int npc_index = actor_index - 1;
    if (npc_index >= 0 && static_cast<size_t>(npc_index) < npc_count) {
        return npc_runtimes[npc_index].actor.collision_group;
    }

    if (actor_index >= 0 && static_cast<size_t>(actor_index) < npc_count) {
        return npc_runtimes[actor_index].actor.collision_group;
    }

    return 0;
}

bool spawn_runtime_projectile_from_event(int actor_index, int slot_index, int direction) {
    const int projectile_index = next_runtime_projectile_index();
    if (projectile_index < 0) {
        return false;
    }

    gbs::Vec2i position {};
    if (!projectile_spawn_position(actor_index, position)) {
        return false;
    }

    const int slot = slot_index >= 0 && static_cast<size_t>(slot_index) < gbs::max_event_projectile_slots
        ? slot_index
        : 0;
    const gbs::Vec2i delta = projectile_direction_delta(direction);
    RuntimeProjectile& projectile = runtime_projectiles[projectile_index];
    projectile.active = true;
    projectile.x = position.x;
    projectile.y = position.y;
    projectile.dx = delta.x;
    projectile.dy = delta.y;
    projectile.damage = event_state.projectile_slot_loaded[slot] ? event_state.projectile_slot_damage[slot] : 1;
    projectile.speed_x100 = event_state.projectile_slot_loaded[slot] ? event_state.projectile_slot_speed[slot] : 100;
    if (projectile.speed_x100 <= 0) {
        projectile.speed_x100 = 100;
    }
    projectile.step_accumulator = 0;
    projectile.source_collision_group = projectile_source_collision_group(actor_index);
    projectile.sprite_index = event_state.projectile_slot_loaded[slot] ? event_state.projectile_slot_sprite[slot] : -1;
    projectile.loaded_tiles = nullptr;
    gbs::init_sprite_animator(projectile.animator);
    const gbs::TopDownActorSpriteData* sprite = gbs::topdown_actor_sprite_for_index(project, projectile.sprite_index);
    if (sprite != nullptr && sprite->animation != nullptr) gbs::play_sprite_animation(projectile.animator, *sprite->animation);
    for (const RuntimeProjectile& other : runtime_projectiles) {
        if (&other != &projectile && other.active && other.sprite_index == projectile.sprite_index) {
            projectile.animator = other.animator;
            break;
        }
    }
    return true;
}

gbs::Rect projectile_rect_for(const RuntimeProjectile& projectile) {
    return gbs::Rect { projectile.x - 2, projectile.y - 2, 4, 4 };
}

gbs::EventScript hit_group_script_for_projectile(const gbs::TopDownRoomData& room_data, size_t npc_index, const RuntimeProjectile& projectile) {
    switch (projectile.source_collision_group) {
    case 1:
        return room_data.npcs[npc_index].on_hit_group1;
    case 2:
        return room_data.npcs[npc_index].on_hit_group2;
    case 3:
        return room_data.npcs[npc_index].on_hit_group3;
    default:
        return gbs::empty_event_script();
    }
}

bool apply_projectile_hit_to_npc(RuntimeProjectile& projectile, size_t npc_index) {
    if (npc_index >= max_npc_slots ||
        !projectile.active ||
        !npc_runtimes[npc_index].active ||
        !npc_runtimes[npc_index].visible) {
        return false;
    }

    if (!gbs::intersects(projectile_rect_for(projectile), gbs::actor_rect(npc_runtimes[npc_index].actor))) {
        return false;
    }

    const int damage = projectile.damage > 0 ? projectile.damage : 1;
    npc_health[npc_index] -= damage;
    projectile.active = false;
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    const gbs::EventScript hit_script = room_data.npcs[npc_index].on_hit_actor;
    if (gbs::has_event_script(hit_script)) {
        queue_script(hit_script);
    }
    const gbs::EventScript group_script = hit_group_script_for_projectile(room_data, npc_index, projectile);
    if (gbs::has_event_script(group_script)) {
        queue_script(group_script);
    }
    if (npc_health[npc_index] <= 0) {
        const gbs::EventScript defeated_script = room_data.npcs[npc_index].on_defeated;
        if (gbs::has_event_script(defeated_script)) {
            queue_script(defeated_script);
        }
        npc_defeat_pending_despawn[npc_index] = true;
        npc_runtimes[npc_index].active = false;
        npc_runtimes[npc_index].visible = true;
    }
    return true;
}

void finalize_defeated_npc_scripts() {
    if (gbs::event_runner_is_active(event_runner) || !gbs::event_script_queue_is_empty(event_queue)) {
        return;
    }

    const size_t npc_count = current_npc_count();
    for (size_t npc_index = 0; npc_index < npc_count; ++npc_index) {
        if (!npc_defeat_pending_despawn[npc_index]) {
            continue;
        }
        npc_defeat_pending_despawn[npc_index] = false;
        npc_runtimes[npc_index].visible = false;
        gbs::init_sprite_animator(npc_animators[npc_index]);
    }
}

bool apply_projectile_hits(RuntimeProjectile& projectile) {
    const size_t npc_count = current_npc_count();
    for (size_t npc_index = 0; npc_index < npc_count; ++npc_index) {
        if (apply_projectile_hit_to_npc(projectile, npc_index)) {
            return true;
        }
    }
    return false;
}

void consume_projectile_event_outputs() {
    if (!event_state.projectile_launch_requested) {
        return;
    }

    spawn_runtime_projectile_from_event(
        event_state.projectile_launch_actor,
        event_state.projectile_launch_slot,
        event_state.projectile_launch_direction
    );
    event_state.projectile_launch_requested = false;
    event_state.projectile_launch_actor = -1;
    event_state.projectile_launch_slot = -1;
    event_state.projectile_launch_direction = 0;
}

void update_runtime_projectiles() {
    for (RuntimeProjectile& projectile : runtime_projectiles) if (projectile.active) gbs::update_sprite_animator(projectile.animator);
    const int max_x = room.width_tiles * 8;
    const int max_y = room.height_tiles * 8;
    for (RuntimeProjectile& projectile : runtime_projectiles) {
        if (!projectile.active) {
            continue;
        }

        projectile.step_accumulator += projectile.speed_x100 > 0 ? projectile.speed_x100 : 100;
        while (projectile.step_accumulator >= 100) {
            projectile.x += projectile.dx;
            projectile.y += projectile.dy;
            projectile.step_accumulator -= 100;
            if (apply_projectile_hits(projectile)) {
                break;
            }
        }

        if (!projectile.active) {
            continue;
        }

        if (projectile.x < -8 || projectile.y < -8 || projectile.x >= max_x + 8 || projectile.y >= max_y + 8) {
            projectile = RuntimeProjectile { false, 0, 0, 0, 0, 1, 100, 0, 0 };
        }
    }
}

gbs::Sprite projectile_sprite_for_position(gbs::Vec2i position) {
    const gbs::MetaSprite* metasprite = player_runtime_metasprite();
    const gbs::MetaSpritePart* part = (metasprite != nullptr && metasprite->part_count > 0) ? &metasprite->parts[0] : nullptr;
    gbs::Sprite sprite {
        position.x,
        position.y,
        part != nullptr ? part->tile_index : static_cast<uint16_t>(0),
        part != nullptr ? static_cast<uint16_t>(part->palette) : static_cast<uint16_t>(0),
        false,
        false,
        true,
        0,
        gbs::SpriteRenderMode::Normal,
        gbs::visual_effect_sprite_mosaic_enabled(visual_effects)
    };
    if (part != nullptr) {
        sprite.width = part->width;
        sprite.height = part->height;
        sprite.color_depth = part->color_depth;
    }
    return sprite;
}

const gbs::MetaSprite* runtime_projectile_metasprite(const RuntimeProjectile& projectile) {
    const gbs::MetaSprite* frame = gbs::current_metasprite(projectile.animator);
    const gbs::TopDownActorSpriteData* sprite = gbs::topdown_actor_sprite_for_index(project, projectile.sprite_index);
    return frame != nullptr ? frame : (sprite != nullptr ? sprite->metasprite : nullptr);
}
size_t runtime_projectile_oam_cost() {
    size_t cost=0;
    for (const RuntimeProjectile& projectile : runtime_projectiles) {
        if (!projectile.active) continue;
        const gbs::MetaSprite* sprite = runtime_projectile_metasprite(projectile);
        cost += sprite != nullptr ? sprite->part_count : 1;
    }
    return cost;
}
void render_runtime_projectiles(gbs::Vec2i render_camera, uint16_t first_oam) {
    for (RuntimeProjectile& projectile : runtime_projectiles) {
        if (!projectile.active) continue;
        const gbs::MetaSprite* sprite = runtime_projectile_metasprite(projectile);
        if (sprite != nullptr) {
            if (load_streamed_animation_frame_tiles(projectile.animator, projectile.loaded_tiles)) {
                gbs::set_metasprite(first_oam, *sprite, {projectile.x-render_camera.x, projectile.y-render_camera.y});
            }
            first_oam += sprite->part_count;
        } else {
            gbs::set_sprite(first_oam++, projectile_sprite_for_position({projectile.x-render_camera.x,projectile.y-render_camera.y}));
        }
    }
}

void init_trigger_states() {
    for (size_t index = 0; index < max_trigger_slots; ++index) {
        trigger_states[index] = gbs::TopDownTriggerState {};
    }
    for (size_t index = 0; index < max_tile_effect_slots; ++index) {
        tile_effect_states[index] = gbs::TopDownTriggerState {};
    }
}

void reset_npc_player_hit_state() {
    for (bool& touching : npc_touching_player) {
        touching = false;
    }
}

gbs::EventScript room_hit_script_for_collision_group(
    const gbs::TopDownRoomData& room_data,
    uint8_t collision_group
) {
    switch (collision_group) {
    case 1:
        return room_data.on_hit_group1;
    case 2:
        return room_data.on_hit_group2;
    case 3:
        return room_data.on_hit_group3;
    default:
        return gbs::empty_event_script();
    }
}

void queue_npc_player_hit_script(size_t npc_index) {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    if (npc_index >= current_npc_count() ||
        !npc_runtimes[npc_index].active ||
        !npc_runtimes[npc_index].visible ||
        !gbs::intersects(gbs::actor_rect(npc_runtimes[npc_index].actor), gbs::actor_rect(player))) {
        npc_touching_player[npc_index] = false;
        return;
    }

    if (npc_touching_player[npc_index]) {
        return;
    }

    npc_touching_player[npc_index] = true;
    const gbs::EventScript hit_script = room_data.npcs[npc_index].on_hit_player;
    if (gbs::has_event_script(hit_script)) {
        queue_script(hit_script);
    }
    const gbs::EventScript room_hit_script = room_hit_script_for_collision_group(
        room_data,
        room_data.npcs[npc_index].collision_group
    );
    if (gbs::has_event_script(room_hit_script)) {
        queue_script(room_hit_script);
    }
}

void update_npc_player_hit_scripts() {
    const size_t npc_count = current_npc_count();
    for (size_t npc_index = 0; npc_index < npc_count; ++npc_index) {
        queue_npc_player_hit_script(npc_index);
    }
    for (size_t npc_index = npc_count; npc_index < max_npc_slots; ++npc_index) {
        npc_touching_player[npc_index] = false;
    }
}

uint16_t room_palette_backdrop_color(const gbs::TopDownRoomData& room_data) {
    if (project.resource_bank_group_count > 0) {
        const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_topdown_room(project, room_data);
        for (size_t index = 0; index < group.bank_count; ++index) {
            const gbs::ResourceBank& bank = group.banks[index];
            if (bank.kind != gbs::ResourcePoolKind::BgPalette || bank.start != 0 || bank.count == 0) {
                continue;
            }
            return gbs::backdrop_color();
        }
    }
    return gbs::backdrop_color();
}

bool apply_room_metadata(bool use_room_player_start) {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    room_backdrop_color = room_palette_backdrop_color(room_data);
    if (room_data.metadata.has_backdrop_color) {
        room_backdrop_color = room_data.metadata.backdrop_color;
    }
    gbs::set_backdrop_color(room_backdrop_color);
    camera = gbs::camera_from_room_metadata(project, room_data);

    if (use_room_player_start && gbs::room_has_player_start(room_data)) {
        player.position_pixels = room_data.metadata.player_start_pixels;
    }

    if (gbs::room_has_valid_music(project, room_data)) {
        gbs::play_music(project.music_assets[room_data.metadata.music_index]);
        return true;
    }
    if (room_data.metadata.stop_music) {
        gbs::stop_music();
        return true;
    }
    return false;
}

bool capture_topdown_runtime_state(gbs::UniversalSaveData& data) {
    if (!gbs::make_universal_save_data(
            data,
            gbs::UniversalSaveRuntime::TopDown,
            current_room,
            player.position_pixels.x,
            player.position_pixels.y,
            camera.position_pixels.x,
            camera.position_pixels.y,
            event_state.variables,
            gbs::universal_save_variable_count,
            event_state.inventory,
            gbs::universal_save_inventory_count,
            event_state.equipped_items,
            gbs::universal_save_equipment_slot_count,
            play_time_frames,
            0,
            nullptr,
            0,
            event_state.text_variables,
            gbs::text_variable_count)) {
        return false;
    }
    return true;
}

void persist_runtime_state(int slot_index = current_save_slot_index) {
    if (slot_index < 0 || static_cast<size_t>(slot_index) >= active_save_slot_count) return;
    gbs::UniversalSaveData data {};
    if (!capture_topdown_runtime_state(data)) return;
    ++save_sequence;
    char title[16] = {};
    title[0] = 'R';
    title[1] = 'O';
    title[2] = 'O';
    title[3] = 'M';
    title[4] = ' ';
    write_small_number(title + 5, current_room + 1);
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        title,
        play_time_frames,
        save_sequence,
        static_cast<uint16_t>(current_room + 1),
        static_cast<uint16_t>(slot_index + 1)
    );
    if (gbs::write_save_slot_record(gbastudio_project::save_bank, static_cast<size_t>(slot_index), &data, sizeof(data), metadata, save_sequence) == gbs::SaveStatus::Ok) {
        current_save_slot_index = slot_index;
    }
    refresh_pause_menu_items();
    refresh_hud();
}

bool restore_runtime_state(int slot_index) {
    if (slot_index < 0 || static_cast<size_t>(slot_index) >= active_save_slot_count) {
        return false;
    }
    gbs::UniversalSaveData data {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(gbastudio_project::save_bank, static_cast<size_t>(slot_index), &data, sizeof(data), &metadata, &bytes_read) != gbs::SaveStatus::Ok ||
        bytes_read != sizeof(data) ||
        !gbs::is_valid_universal_save_data(data) ||
        data.runtime != gbs::UniversalSaveRuntime::TopDown ||
        !gbs::is_valid_room_index(project, data.room_index)) {
        return false;
    }
    const gbs::TopDownRoomData& saved_room = project.rooms[data.room_index];
    const int room_width_pixels = saved_room.width_tiles * 8;
    const int room_height_pixels = saved_room.height_tiles * 8;
    if (data.player_x < 0 ||
        data.player_y < 0 ||
        data.player_x + player.size_pixels.x > room_width_pixels ||
        data.player_y + player.size_pixels.y > room_height_pixels) {
        return false;
    }
    if (!stream_resources_for_room(data.room_index)) {
        return false;
    }

    gbs::SaveInfo info = gbs::inspect_save_slot(gbastudio_project::save_bank, static_cast<size_t>(slot_index));
    save_sequence = info.sequence;
    play_time_frames = metadata.play_time_frames;
    current_save_slot_index = slot_index;
    current_room = data.room_index;
    player_streamed_tile_asset_loaded = nullptr;
    room = gbs::room_from_data(project.rooms[current_room]);
    load_active_room_visual_tilemap();
    apply_active_room_video();
    configure_dialogue_ui_for_active_room();
    reset_active_room_visual_tiles();
    player.position_pixels = gbs::Vec2i { data.player_x, data.player_y };
    camera.position_pixels = gbs::Vec2i { data.camera_x, data.camera_y };
    if (!gbs::read_universal_save_common_state(
            data,
            event_state.variables,
            gbs::universal_save_variable_count,
            event_state.inventory,
            gbs::universal_save_inventory_count,
            event_state.equipped_items,
            gbs::universal_save_equipment_slot_count,
            event_state.text_variables,
            gbs::text_variable_count)) {
        return false;
    }
    reset_event_threads(event_threads, event_state);
    event_interaction = {};
    gbs::hide_menu(event_interaction_menu);
    init_runtime_projectiles();
    refresh_hud();
    return true;
}

bool restore_latest_runtime_state() {
    if (active_save_slot_count == 0) {
        return false;
    }
    return restore_runtime_state(gbs::find_latest_save_slot(gbastudio_project::save_bank));
}

void refresh_event_save_slot_statuses() {
    for (size_t index = 0; index < gbs::max_event_save_slots; ++index) {
        event_state.save_slot_exists[index] = index < active_save_slot_count &&
            gbs::inspect_save_slot(gbastudio_project::save_bank, index).status == gbs::SaveStatus::Ok;
    }
}

uint16_t backdrop_color_for_player_effects() {
    uint8_t effects = gbs::tile_effects_for_actor(
        room.collision,
        player,
        static_cast<uint8_t>(gbs::TileWater | gbs::TileDamage | gbs::TileLadder)
    );
    if ((effects & gbs::TileDamage) != 0) {
        return gbs::rgb15(18, 2, 2);
    }
    if ((effects & gbs::TileWater) != 0) {
        return gbs::rgb15(0, 8, 18);
    }
    if ((effects & gbs::TileLadder) != 0) {
        return gbs::rgb15(6, 14, 4);
    }
    return room_backdrop_color;
}

bool apply_warp(const gbs::WarpResult& warp) {
    if (!warp.did_warp || !gbs::is_valid_room_index(project, warp.room_index)) {
        return false;
    }
    if (!stream_resources_for_room(warp.room_index)) {
        return false;
    }

    int previous_room = current_room;
    const int selected_player_sprite_index = player_event_runtime.sprite_index;
    current_room = warp.room_index;
    gbs::reset_event_threads(event_threads,event_state);
    for(auto& text:event_state.draw_text) text=gbs::EventDrawText{};
    event_interaction=gbs::EventInteractionState{};gbs::hide_menu(event_interaction_menu);
    player_streamed_tile_asset_loaded = nullptr;
    room = gbs::room_from_data(project.rooms[current_room]);
    load_active_room_visual_tilemap();
    apply_active_room_video();
    configure_dialogue_ui_for_active_room();
    reset_active_room_visual_tiles();
    player.position_pixels = warp.player_position_pixels;
    if (warp.has_player_direction) {
        player.direction = warp.player_direction;
    }
    player_event_runtime = gbs::EventPlayerRuntimeState {
        true,
        player.position_pixels.x,
        player.position_pixels.y,
        player.direction,
        project.player.speed_pixels * 100,
        0,
        selected_player_sprite_index
    };
    apply_room_metadata(false);
    init_npc_runtime();
    init_trigger_states();
    reset_npc_player_hit_state();
    persist_runtime_state();
    refresh_hud();
    return previous_room != current_room;
}

gbs::AudioChannel audio_channel_for_event_value(int channel) {
    switch (channel) {
    case 1:
        return gbs::AudioChannel::Sfx;
    case 2:
        return gbs::AudioChannel::PcmMusic;
    case 3:
        return gbs::AudioChannel::PcmSfx;
    case 4:
        return gbs::AudioChannel::All;
    default:
        return gbs::AudioChannel::Music;
    }
}

void apply_screen_fade_intensity(int intensity) {
    intensity = intensity < 0 ? 0 : (intensity > 16 ? 16 : intensity);
    if (intensity == 0) {
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
        16,
        0,
        static_cast<uint8_t>(intensity)
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
    const int intensity = screen_fade_direction > 0 ? step : 16 - step;
    apply_screen_fade_intensity(intensity);
    if (screen_fade_frames_remaining > 0) {
        --screen_fade_frames_remaining;
    }
    if (screen_fade_frames_remaining <= 0) {
        if (screen_fade_direction > 0) {
            apply_screen_fade_intensity(16);
        } else {
            apply_screen_fade_intensity(0);
        }
        screen_fade_active = false;
    }
}

void consume_link_event_outputs() {
    if (event_state.link_request == 0) {
        return;
    }

    switch (event_state.link_request) {
    case 1:
        if (open_link(gbs::LinkRole::Host, static_cast<uint16_t>(event_state.link_timeout_frames)) &&
            event_state.link_script >= 0 && static_cast<size_t>(event_state.link_script) < project.script_count) {
            queue_script(project.scripts[event_state.link_script]);
        }
        break;
    case 2:
        if (open_link(gbs::LinkRole::Join, static_cast<uint16_t>(event_state.link_timeout_frames)) &&
            event_state.link_script >= 0 && static_cast<size_t>(event_state.link_script) < project.script_count) {
            queue_script(project.scripts[event_state.link_script]);
        }
        break;
    case 3:
        close_link();
        break;
    case 4:
        event_state.link_last_transfer_ok = transfer_link(static_cast<uint8_t>(event_state.link_transfer_value));
        event_state.link_last_received_value = received_link_value();
        if (event_state.link_last_transfer_ok &&
            event_state.link_transfer_variable >= 0 &&
            event_state.link_transfer_variable < 16) {
            event_state.variables[event_state.link_transfer_variable] = event_state.link_last_received_value;
        }
        break;
    default:
        break;
    }

    event_state.link_request = 0;
}

void refresh_event_interaction_menu() {
    if (!event_interaction.active) { gbs::hide_menu(event_interaction_menu); return; }
    size_t count=0;
    if (event_interaction.kind==gbs::EventInteractionKind::CodeLock) {
        char* out=event_interaction_labels[0];
        for(int i=0;i<event_interaction.digits;++i) {
            *out++=i==event_interaction.cursor ? '!' : ' ';
            *out++=static_cast<char>('0'+event_interaction.code_digits[i]);
        }
        *out='\0';
        event_interaction_items[0]={event_interaction_labels[0],0,true};
        event_interaction_items[1]={"DIRECAO: DIGITO",0,false};
        event_interaction_items[2]={"A: OK  B: CANCELAR",0,false};
        count=3;
    } else if (event_interaction.kind==gbs::EventInteractionKind::EquipmentSlots) {
        for(int i=0;i<event_interaction.slots;++i) {
            char* out=event_interaction_labels[i];char* end=out+31;
            append_text(out,end,"SLOT ");append_number(out,end,i+1);
            append_text(out,end," / ");append_number(out,end,event_state.equipped_items[i]+1);*out='\0';
            event_interaction_items[count++]={event_interaction_labels[i],i,true};
        }
    } else {
        event_interaction_items[count++]={"REMOVER EQUIPAMENTO",-1,true};
        for(size_t i=0;i<gbs::max_event_inventory_items;++i) {
            if(event_state.inventory[i]<=0) continue;
            char* out=event_interaction_labels[count];char* end=out+31;
            append_text(out,end,"ITEM ");append_number(out,end,static_cast<int>(i+1));
            append_text(out,end," x");append_number(out,end,event_state.inventory[i]);*out='\0';
            event_interaction_items[count]={event_interaction_labels[count],static_cast<int>(i),true};++count;
        }
    }
    gbs::show_menu(event_interaction_menu,event_interaction.kind==gbs::EventInteractionKind::CodeLock ? "CADEADO" : "EQUIPAMENTO",event_interaction_items,count);
}
void advance_event_interaction(gbs::InputState input) {
    if(event_interaction.kind==gbs::EventInteractionKind::CodeLock) {
        gbs::advance_event_code_lock(event_state,event_interaction,input);
        refresh_event_interaction_menu();return;
    }
    if(input.was_pressed(gbs::ButtonB)) {
        if(event_interaction.kind==gbs::EventInteractionKind::EquipmentItems) event_interaction.kind=gbs::EventInteractionKind::EquipmentSlots;
        else event_interaction.active=false;
        refresh_event_interaction_menu();return;
    }
    if(gbs::advance_menu(event_interaction_menu,input) && event_interaction_menu.accepted) {
        gbs::select_event_equipment(event_state,event_interaction,event_interaction_menu.last_value);
        refresh_event_interaction_menu();
    }
}
void update_unpaused_event_interaction_world() {
    if(event_interaction.pause) return;
    const gbs::TopDownRoomData& data=project.rooms[current_room];
    size_t slots[max_active_npc_slots]{};
    const size_t count=collect_camera_npc_slots(slots,max_active_npc_slots,active_npc_viewport_margin_pixels);
    for(size_t i=0;i<count;++i) {
        const size_t actor=slots[i];gbs::Actor blockers[max_active_npc_slots+1]{};
        const size_t blocker_count=collect_npc_blocking_actors(actor,blockers,max_active_npc_slots+1);
        const bool moved=gbs::update_actor_runtime_ai(data.npcs[actor],npc_runtimes[actor],room.collision,player,blockers,blocker_count);
        refresh_npc_directional_animation(actor,moved);
    }
    update_topdown_quests();
}

void consume_event_outputs(bool trigger_room_enter) {
    if(gbs::begin_event_interaction(event_state,event_interaction)) refresh_event_interaction_menu();
    if(event_state.last_shop_actor>=-1) {
        if(pause_menu_has_shop_items()) { shop_from_event=true;show_pause_menu_page(PauseMenuPage::Shop); }
        event_state.last_shop_actor=-2;
    }
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count
    );
    bool room_changed = false;
    if (event_state.current_room != current_room ||
        event_state.player_x != player.position_pixels.x ||
        event_state.player_y != player.position_pixels.y) {
        room_changed = apply_warp(gbs::WarpResult {
            true,
            event_state.current_room,
            gbs::Vec2i { event_state.player_x, event_state.player_y }
        });
        player.direction = static_cast<uint8_t>(event_state.player_direction);
    }

    if (event_state.dialogue_text_speed_changed) {
        gbs::set_dialogue_text_speed(dialogue, event_state.dialogue_text_speed_frames);
        event_state.dialogue_text_speed_changed = false;
    }
    if (event_state.dialogue_text_sfx_changed) {
        gbs::set_dialogue_text_sfx(dialogue, event_state.dialogue_text_sfx_index);
        event_state.dialogue_text_sfx_changed = false;
    }
    if (event_state.dialogue_frame_changed) {
        gbs::set_dialogue_frame(dialogue, event_state.dialogue_frame_index);
        event_state.dialogue_frame_changed = false;
    }

    if (event_state.last_dialogue >= 0) {
        gbs::show_dialogue(dialogue, project.dialogue_lines, project.dialogue_line_count, event_state.last_dialogue);
        active_choice_group = -1;
        event_state.last_dialogue = -1;
    }

    if (gbs::is_valid_dialogue_choice_index(project, event_state.last_choice_group)) {
        const gbs::TopDownDialogueChoiceData& choice = project.dialogue_choices[event_state.last_choice_group];
        if (gbs::show_dialogue_choices(
                dialogue,
                project.dialogue_lines,
                project.dialogue_line_count,
                choice.line_index,
                choice.choices,
                choice.choice_count
            )) {
            active_choice_group = event_state.last_choice_group;
            active_menu_response_variable=event_state.menu_response_variable;
            event_state.menu_response_variable=-1;
        }
    }
    event_state.last_choice_group = -1;

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
            audio_channel_for_event_value(event_state.audio_mute_channel),
            event_state.audio_mute_enabled
        );
        event_state.audio_mute_changed = false;
    }
    if (event_state.audio_volume_changed) {
        gbs::set_audio_channel_volume(
            audio_channel_for_event_value(event_state.audio_volume_channel),
            static_cast<uint8_t>(event_state.audio_volume)
        );
        event_state.audio_volume_changed = false;
    }
    if (event_state.audio_fade_changed) {
        gbs::fade_audio_channel_volume(
            audio_channel_for_event_value(event_state.audio_fade_channel),
            static_cast<uint8_t>(event_state.audio_fade_target_volume),
            static_cast<uint16_t>(event_state.audio_fade_frames)
        );
        event_state.audio_fade_changed = false;
    }
    if (event_state.all_sprites_visible_changed) {
        all_sprites_visible = event_state.all_sprites_visible;
        event_state.all_sprites_visible_changed = false;
    }
    if (event_state.player_animation_changed) {
        refresh_player_runtime_animation(event_state.player_animation_index);
        event_state.player_animation_changed = false;
    }
    if (event_state.player_bounce_requested) {
        player_bounce_frames = event_state.player_bounce_frames;
        player_bounce_total_frames = event_state.player_bounce_frames <= 0 ? 1 : event_state.player_bounce_frames;
        player_bounce_height_pixels = event_state.player_bounce_height_tiles * 8;
        event_state.player_bounce_requested = false;
        event_state.player_bounce_height_tiles = 0;
        event_state.player_bounce_frames = 0;
    }
    consume_link_event_outputs();
    if (event_state.fade_changed) {
        start_screen_fade(event_state.fade_direction, event_state.fade_frames);
        event_state.fade_changed = false;
        event_state.fade_direction = 0;
        event_state.fade_frames = 0;
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
    }

    if (event_state.wait_frames > 0) {
        event_wait_frames = event_state.wait_frames;
        event_state.wait_frames = 0;
    }

    if (event_state.save_request != 0) {
        const int requested_slot = event_state.save_request_slot;
        if (requested_slot >= 0 && static_cast<size_t>(requested_slot) < active_save_slot_count) {
            if (event_state.save_request == 1) {
                persist_runtime_state(requested_slot);
            } else if (event_state.save_request == 2) {
                if (restore_runtime_state(requested_slot)) {
                    apply_room_metadata(false);
                    init_npc_runtime();
                    init_trigger_states();
                    reset_npc_player_hit_state();
                    room_changed = true;
                }
            } else if (event_state.save_request == 3) {
                gbs::clear_save_slot(gbastudio_project::save_bank, static_cast<size_t>(requested_slot));
                refresh_pause_menu_items();
                refresh_hud();
            }
            refresh_event_save_slot_statuses();
        }
        event_state.save_request = 0;
        event_state.save_request_slot = -1;
    }

    if (event_state.camera_changed) {
        camera.follow_player = event_state.camera_follow_player;
        if (!event_state.camera_follow_player) {
            camera.position_pixels = gbs::Vec2i { event_state.camera_x, event_state.camera_y };
        }
        event_state.camera_changed = false;
    }
    if (event_state.camera_property_changed) {
        switch (event_state.camera_property) {
        case 0:
            camera.follow_player = false;
            camera.position_pixels.x = event_state.camera_property_value;
            break;
        case 1:
            camera.follow_player = false;
            camera.position_pixels.y = event_state.camera_property_value;
            break;
        case 2:
            camera.follow_player = event_state.camera_property_value != 0;
            break;
        case 3:
            camera.follow_player = false;
            camera.position_pixels.x += event_state.camera_property_value;
            break;
        case 4:
            camera.follow_player = false;
            camera.position_pixels.y += event_state.camera_property_value;
            break;
        default:
            break;
        }
        gbs::clamp_camera_to_bounds(camera, room.width_tiles * 8, room.height_tiles * 8);
        event_state.camera_property_changed = false;
        event_state.camera_property = 0;
        event_state.camera_property_value = 0;
    }
    if (event_state.camera_bounds_x_changed || event_state.camera_bounds_y_changed) {
        camera.bounds_enabled = true;
        if (event_state.camera_bounds_x_changed) {
            const int min_x = event_state.camera_bounds_min_x;
            const int max_x = event_state.camera_bounds_max_x >= min_x ? event_state.camera_bounds_max_x : min_x;
            camera.bounds_pixels.x = min_x;
            camera.bounds_pixels.width = max_x - min_x;
            event_state.camera_bounds_x_changed = false;
        }
        if (event_state.camera_bounds_y_changed) {
            const int min_y = event_state.camera_bounds_min_y;
            const int max_y = event_state.camera_bounds_max_y >= min_y ? event_state.camera_bounds_max_y : min_y;
            camera.bounds_pixels.y = min_y;
            camera.bounds_pixels.height = max_y - min_y;
            event_state.camera_bounds_y_changed = false;
        }
        gbs::clamp_camera_to_bounds(camera, room.width_tiles * 8, room.height_tiles * 8);
    }
    if (event_state.camera_move_changed) {
        camera.follow_player = false;
        camera.position_pixels.x += event_state.camera_delta_x;
        camera.position_pixels.y += event_state.camera_delta_y;
        gbs::clamp_camera_to_bounds(camera, room.width_tiles * 8, room.height_tiles * 8);
        event_state.camera_move_changed = false;
        event_state.camera_delta_x = 0;
        event_state.camera_delta_y = 0;
    }
    if (event_state.camera_shake_frames > 0) {
        camera_shake_frames = event_state.camera_shake_frames;
        camera_shake_magnitude = event_state.camera_shake_magnitude;
        event_state.camera_shake_frames = 0;
        event_state.camera_shake_magnitude = 0;
    }

    const size_t npc_count = current_npc_count();
    consume_push_actor_commands();
    consume_player_event_commands();
    consume_actor_push_commands();
    gbs::consume_actor_event_commands(npc_runtimes, npc_count, event_state);
    for (size_t index = 0; index < npc_count; ++index) {
        const bool animation_requested = index < gbs::max_event_actor_state_slots
            && event_state.actor_animation_playing[index];
        refresh_npc_runtime_animation(index, animation_requested);
        if (npc_runtimes[index].animation_frame_changed) {
            gbs::set_sprite_animation_frame(npc_animators[index], npc_runtimes[index].animation_frame_index);
            npc_runtimes[index].animation_frame_changed = false;
        }
    }
    consume_projectile_event_outputs();
    consume_tile_commands();
    consume_overlay_state();

    if (gbs::is_valid_project_script_index(project, event_state.last_script)) {
        int script_index = event_state.last_script;
        event_state.last_script = -1;
        queue_script(project.scripts[script_index], trigger_room_enter);
    } else {
        event_state.last_script = -1;
    }

    if (room_changed && trigger_room_enter) {
        if (!queue_adventure_callback(adventure_callback_on_room_enter, false)) {
            queue_script(project.rooms[current_room].on_enter, true);
        }
        queue_actor_start_scripts();
    }
}

bool queue_script(gbs::EventScript script, bool trigger_room_enter) {
    if (!gbs::has_event_script(script)) {
        return false;
    }
    return gbs::enqueue_event_script(
        event_queue,
        script,
        trigger_room_enter ? script_flag_trigger_room_enter : 0
    );
}

void queue_runtime_event_bindings(bool allow_button_bindings) {
    if (allow_button_bindings && gbs::update_button_event_bindings(event_state)) {
        const int script_index = event_state.last_script;
        event_state.last_script = -1;
        if (gbs::is_valid_project_script_index(project, script_index)) {
            queue_script(project.scripts[script_index]);
        }
    }

    if (gbs::update_timer_event_bindings(event_state)) {
        const int script_index = event_state.last_script;
        event_state.last_script = -1;
        if (gbs::is_valid_project_script_index(project, script_index)) {
            queue_script(project.scripts[script_index]);
        }
    }
}

bool start_next_script() {
    if (gbs::event_runner_is_active(event_runner) || gbs::event_script_queue_is_empty(event_queue)) {
        return false;
    }

    gbs::EventScriptQueueEntry entry {};
    if (!gbs::dequeue_event_script(event_queue, entry)) {
        return false;
    }
    active_script_triggers_room_enter = (entry.flags & script_flag_trigger_room_enter) != 0;
    event_state.current_room = current_room;
    sync_event_player_actor_state();
    gbs::start_event_runner(event_runner, entry.script);
    return gbs::event_runner_is_active(event_runner);
}

gbs::Vec2i camera_shake_offset() {
    if (camera_shake_frames <= 0 || camera_shake_magnitude <= 0) {
        return gbs::Vec2i { 0, 0 };
    }

    switch (camera_shake_frames & 3) {
    case 0:
        return gbs::Vec2i { camera_shake_magnitude, 0 };
    case 1:
        return gbs::Vec2i { -camera_shake_magnitude, 0 };
    case 2:
        return gbs::Vec2i { 0, camera_shake_magnitude };
    default:
        return gbs::Vec2i { 0, -camera_shake_magnitude };
    }
}

void update_camera_shake() {
    if (camera_shake_frames > 0) {
        --camera_shake_frames;
    }
    if (camera_shake_frames == 0) {
        camera_shake_magnitude = 0;
    }
}

int player_bounce_offset_y() {
    if (player_bounce_frames <= 0 || player_bounce_height_pixels <= 0) {
        return 0;
    }

    const int elapsed = player_bounce_total_frames - player_bounce_frames;
    const int midpoint = player_bounce_total_frames / 2;
    const int phase = elapsed <= midpoint ? elapsed : player_bounce_total_frames - elapsed;
    const int divisor = midpoint <= 0 ? 1 : midpoint;
    return -(player_bounce_height_pixels * phase) / divisor;
}

gbs::Vec2i render_camera_from_state() {
    const gbs::Vec2i shake_offset = camera_shake_offset();
    const int bounce_offset_y = player_bounce_offset_y();
    return gbs::Vec2i {
        camera.position_pixels.x + shake_offset.x,
        camera.position_pixels.y + shake_offset.y + bounce_offset_y
    };
}

void capture_pause_render_camera() {
    pause_render_camera = render_camera_from_state();
    pause_render_camera_ready = true;
}

void update_player_bounce() {
    if (player_bounce_frames > 0) {
        --player_bounce_frames;
    }
    if (player_bounce_frames == 0) {
        player_bounce_height_pixels = 0;
        player_bounce_total_frames = 1;
    }
}

void update_active_script() {
    if (!gbs::event_runner_is_active(event_runner)) {
        if (!start_next_script()) {
            return;
        }
    }
    event_state.current_room = current_room;
    sync_event_player_actor_state();
    sync_event_actor_animation_state();
    gbs::update_event_runner(event_runner, event_state);
    consume_event_outputs(active_script_triggers_room_enter);
}

void queue_actor_update_scripts() {
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    const size_t npc_count = current_npc_count();
    for (size_t index = 0; index < npc_count; ++index) {
        if (!npc_runtimes[index].active || !npc_runtimes[index].visible) {
            continue;
        }
        if (!gbs::event_actor_update_script_enabled(event_state, static_cast<int>(index))) {
            continue;
        }
        queue_script(room_data.npcs[index].on_update, false);
    }
}

void queue_actor_start_scripts() {
    queue_script(project.player.on_start, false);
    const gbs::TopDownRoomData& room_data = project.rooms[current_room];
    const size_t npc_count = current_npc_count();
    for (size_t index = 0; index < npc_count; ++index) {
        queue_script(room_data.npcs[index].on_start, false);
    }
}

void queue_player_update_script() {
    queue_script(project.player.on_update, false);
}

void queue_script(gbs::EventScript script) {
    queue_script(script, true);
}

} // namespace

int initialize_topdown_runtime() {
    // A preceding runtime can relocate UI tiles or use an 8bpp background.
    // Restore video controls before uploading this scene's regular 4bpp banks.
    gbs::init();
    player_streamed_tile_asset_loaded = nullptr;
    if (!gbs::is_valid_topdown_project_data(project)) {
        while (true) {
            gbs::wait_vblank();
        }
    }

    gbs::init_event_state(event_state);
    gbs::init_visual_effects(visual_effects);
    bool runtime_entry = false;
    bool restore_entry = false;
    int restore_slot_index = -1;
    int entry_x = project.player.position_pixels.x;
    int entry_y = project.player.position_pixels.y;
    current_room = project.initial_room;
#ifdef GBS_MULTI_RUNTIME
    restore_entry = gbs::consume_runtime_save_restore(gbs::RuntimeKind::TopDown, restore_slot_index);
    if (!restore_entry) {
        runtime_entry = gbs::consume_runtime_transition(
            gbs::RuntimeKind::TopDown,
            event_state,
            current_room,
            entry_x,
            entry_y
        );
    }
#endif
    if (!gbs::is_valid_room_index(project, current_room)) {
        return -1;
    }
    room = gbs::room_from_data(project.rooms[current_room]);
    player = gbs::actor_from_data(project.player);
    if (runtime_entry) {
        player.position_pixels = gbs::Vec2i { entry_x, entry_y };
        player.direction = static_cast<uint8_t>(event_state.player_direction);
    }

    gbs::debug_reset();
    gbs::reset_runtime_telemetry();
    runtime_trigger_enter_count = 0;
    runtime_trigger_leave_count = 0;
    runtime_room_change_count = 0;
    runtime_blocked_direction_bits = 0;
    runtime_last_room = -1;
    gbs::debug_set_frame_budget(32);
    gbs::debug_assert(project.room_count > 0, "rooms missing", 10);
    validate_production_costs();

    if (!reserve_project_resources()) {
        while (true) {
            gbs::wait_vblank();
        }
    }
    load_project_assets();
    configure_hardware_core();
    refresh_pause_menu_items();
    const bool restored_save = restore_entry
        ? restore_runtime_state(restore_slot_index)
        : (!runtime_entry && restore_latest_runtime_state());
    if (restore_entry && !restored_save) {
        return -1;
    }
    bool room_handled_music = apply_room_metadata(!restored_save && !runtime_entry);
    gbs::UniversalSaveData paused_data {};
    const bool resumed_pause = runtime_entry && gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::TopDown, current_room, paused_data);
    if (resumed_pause) {
        camera.position_pixels = gbs::Vec2i { paused_data.camera_x, paused_data.camera_y };
        play_time_frames = paused_data.play_time_frames;
    }
    if (!room_handled_music && project.music_asset_count > 0) {
        gbs::play_music(project.music_assets[0]);
    }
    gbs::init_sprite_animator(player_animator);
    if (project.player.animation != nullptr) {
        gbs::play_sprite_animation(player_animator, *project.player.animation);
    }
    refresh_player_directional_animation(false);
    init_npc_runtime();
    init_trigger_states();
    reset_npc_player_hit_state();
    gbs::init_event_runner(event_runner);
    gbs::reset_event_threads(event_threads,event_state);
    event_interaction=gbs::EventInteractionState{};
    gbs::init_menu(event_interaction_menu);
    shop_from_event=false;active_menu_response_variable=-1;
    gbs::init_event_script_queue(event_queue);
    event_state.current_room = current_room;
    sync_event_player_actor_state();
    refresh_event_save_slot_statuses();
    gbs::init_dialogue(dialogue);
    gbs::configure_dialogue_ui(project.dialogue_ui);
    gbs::set_dialogue_frame(dialogue, project.dialogue_ui.frame_index);
    gbs::configure_dialogue_portraits(
        gbastudio_project::dialogue_portrait_assets,
        gbastudio_project::dialogue_portrait_asset_count
    );
    gbs::configure_dialogue_emotes(
        gbastudio_project::dialogue_emote_assets,
        gbastudio_project::dialogue_emote_asset_count
    );
    configure_dialogue_ui_for_active_room(true);
    gbs::configure_dialogue_font(gbastudio_project::dialogue_font);
    gbs::init_hud(hud);
    gbs::init_overlay(overlay);
    gbs::init_menu(pause_menu);
    init_runtime_projectiles();
    player_event_runtime = gbs::EventPlayerRuntimeState {
        true,
        player.position_pixels.x,
        player.position_pixels.y,
        player.direction,
        project.player.speed_pixels * 100,
        0
    };
    refresh_hud();
    if (!resumed_pause) {
        queue_script(project.rooms[current_room].on_enter, true);
        queue_actor_start_scripts();
    }
    const gbs::Vec2i viewport_center = gbs::topdown_camera_viewport_center_pixels(camera.zoom_x256);
    prefetch_room_resource_groups(current_room, gbs::Vec2i {
        camera.position_pixels.x + viewport_center.x,
        camera.position_pixels.y + viewport_center.y
    });

    return 0;
}

gbs::RuntimeAdapterFrameResult update_topdown_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    if (topdown_initialization_result != 0) {
        return gbs::RuntimeAdapterFrameResult::Error;
    }

        configure_dialogue_ui_for_active_room();
        gbs::debug_begin_frame(gbs::frame_count());
        debug_work_units = 0;
        player_moved_this_frame = false;
        current_input = gbs::begin_frame().input;
        const gbs::InputState input = current_input;
#ifdef GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_pending()) {
            return gbs::RuntimeAdapterFrameResult::Transition;
        }
#endif
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
        sync_event_player_actor_state();
        sync_event_actor_animation_state();
        if(!pause_menu.visible && !dialogue.visible && (!event_interaction.active || !event_interaction.pause)) update_runtime_projectiles();
        if(!pause_menu.visible && !dialogue.visible && (!event_interaction.active || !event_interaction.pause) && !gbs::event_scene_type_is_paused(event_state,scene_type_topdown)) {
            gbs::tick_event_threads(event_threads,event_state,project.scripts,project.script_count);
            consume_event_outputs(true);
        }
        queue_runtime_event_bindings(!pause_menu.visible && !dialogue.visible && !event_interaction.active);
        if (event_interaction.active) {
            advance_event_interaction(input);
            update_unpaused_event_interaction_world();
        } else if (pause_menu.visible) {
            if(shop_from_event && input.was_pressed(gbs::ButtonB)) { gbs::hide_menu(pause_menu);shop_from_event=false; }
            else if (input.was_pressed(gbs::ButtonB) && pause_menu_page != PauseMenuPage::Root) {
                show_pause_menu_page(pause_menu_parent_page(pause_menu_page));
            } else if (gbs::advance_menu(pause_menu, input) && pause_menu.accepted) {
                const int selected_value = pause_menu.last_value;
                pause_menu.accepted = false;
                if (selected_value == pause_menu_inventory) {
                    show_pause_menu_page(PauseMenuPage::Inventory);
                } else if (selected_value == pause_menu_shop) {
                    show_pause_menu_page(PauseMenuPage::Shop);
                } else if (selected_value == pause_menu_map) {
                    show_pause_menu_page(PauseMenuPage::Map);
                } else if (selected_value == pause_menu_system) {
                    show_pause_menu_page(PauseMenuPage::System);
                } else if (selected_value == pause_menu_save) {
                    show_pause_menu_page(PauseMenuPage::Save);
                } else if (selected_value == pause_menu_load) {
                    show_pause_menu_page(PauseMenuPage::Load);
                } else if (selected_value == pause_menu_delete) {
                    show_pause_menu_page(PauseMenuPage::Delete);
                } else if (selected_value == pause_menu_settings) {
                    show_pause_menu_page(PauseMenuPage::Settings);
                } else if (selected_value == pause_menu_back) {
                    if(shop_from_event) { gbs::hide_menu(pause_menu);shop_from_event=false; }
                    else show_pause_menu_page(pause_menu_parent_page(pause_menu_page));
                } else if (selected_value >= pause_menu_save_base &&
                    selected_value < pause_menu_save_base + static_cast<int>(active_save_slot_count)) {
                    persist_runtime_state(selected_value - pause_menu_save_base);
                    show_pause_menu_page(PauseMenuPage::System);
                } else if (selected_value >= pause_menu_load_base &&
                    selected_value < pause_menu_load_base + static_cast<int>(active_save_slot_count)) {
                    if (restore_runtime_state(selected_value - pause_menu_load_base)) {
                        apply_room_metadata(false);
                        init_npc_runtime();
                        init_trigger_states();
                        reset_npc_player_hit_state();
                    }
                    show_pause_menu_page(PauseMenuPage::System);
                } else if (selected_value >= pause_menu_delete_base &&
                    selected_value < pause_menu_delete_base + static_cast<int>(active_save_slot_count)) {
                    pending_delete_slot_index = selected_value - pause_menu_delete_base;
                    if (gbastudio_project::save_menu_config.confirm_delete) {
                        show_pause_menu_page(PauseMenuPage::DeleteConfirm);
                    } else {
                        gbs::clear_save_slot(gbastudio_project::save_bank, static_cast<size_t>(pending_delete_slot_index));
                        pending_delete_slot_index = -1;
                        show_pause_menu_page(PauseMenuPage::System);
                    }
                } else if (selected_value == pause_menu_delete_confirm) {
                    if (pending_delete_slot_index >= 0 && static_cast<size_t>(pending_delete_slot_index) < active_save_slot_count) {
                        gbs::clear_save_slot(gbastudio_project::save_bank, static_cast<size_t>(pending_delete_slot_index));
                    }
                    pending_delete_slot_index = -1;
                    show_pause_menu_page(PauseMenuPage::System);
                } else if (selected_value == pause_menu_delete_cancel) {
                    pending_delete_slot_index = -1;
                    show_pause_menu_page(PauseMenuPage::Delete);
                } else if (selected_value >= pause_menu_shop_base &&
                    selected_value < pause_menu_shop_base + static_cast<int>(project.shop_item_count)) {
                    const size_t item_index = static_cast<size_t>(selected_value - pause_menu_shop_base);
                    if (item_index < project.shop_item_count &&
                        gbs::purchase_topdown_shop_item(project.shop_items[item_index], event_state)) {
                        queue_script(project.shop_items[item_index].on_purchase);
                    }
                    show_pause_menu_page(PauseMenuPage::Shop);
                }
            }
            if (!pause_menu.visible) {
                pause_menu_page = PauseMenuPage::Root;
                pause_render_camera_ready = false;
            }
        } else if (dialogue.visible) {
            const bool was_choice_mode = dialogue.choice_mode;
            const int confirm_sfx = dialogue.confirm_sfx_index;
            const int confirm_pcm = dialogue.confirm_pcm_index;
            gbs::advance_dialogue(dialogue, input);
            if (!dialogue.visible) {
                if (confirm_sfx >= 0 && static_cast<size_t>(confirm_sfx) < project.sfx_asset_count) {
                    gbs::play_sfx(project.sfx_assets[confirm_sfx]);
                } else if (confirm_pcm >= 0 && static_cast<size_t>(confirm_pcm) < project.pcm_asset_count) {
                    gbs::play_pcm_sfx(project.pcm_assets[confirm_pcm]);
                }
            }
            if (was_choice_mode && !dialogue.visible && active_choice_group >= 0) {
                const gbs::TopDownDialogueChoiceData& choice = project.dialogue_choices[active_choice_group];
                const int response_variable=active_menu_response_variable>=0 ? active_menu_response_variable : choice.variable_index;
                if(gbs::is_valid_event_variable(response_variable) && (dialogue.last_choice_value>=0 || active_menu_response_variable>=0)) event_state.variables[response_variable]=dialogue.last_choice_value;
                active_menu_response_variable=-1;
                if (gbs::is_valid_project_script_index(project, dialogue.last_choice_script)) {
                    queue_script(project.scripts[dialogue.last_choice_script]);
                }
                active_choice_group = -1;
            }
        } else if (event_wait_frames > 0) {
            --event_wait_frames;
        } else if (gbs::event_runner_is_active(event_runner) || !gbs::event_script_queue_is_empty(event_queue)) {
            update_active_script();
        } else if (!gbs::event_scene_type_is_paused(event_state, scene_type_topdown)) {
            update_topdown_quests();
            finalize_defeated_npc_scripts();
            if (input.was_pressed(gbs::ButtonStart)) {
                refresh_pause_menu_items();
                capture_pause_render_camera();
                show_pause_menu_page(PauseMenuPage::Root);
            } else {
                gbs::Actor player_blockers[max_active_npc_slots] = {};
                size_t player_blocker_indices[max_active_npc_slots] = {};
                size_t player_blocker_count = collect_active_npc_actors(
                    player_blockers,
                    player_blocker_indices,
                    max_active_npc_slots
                );
                const gbs::Vec2i player_position_before_update = player.position_pixels;
                const int adventure_speed=gbs::adventure_event_speed_x100(event_state,player_event_runtime.movement_speed_x100);
                const gbs::InputState player_input = player_event_runtime.active
                    ? gbs::adventure_event_input(event_state,input,player.direction)
                    : gbs::InputState { 0, 0, 0 };
                const bool player_wants_to_move = runtime_input_direction_bits(player_input) != 0;
                const int authored_speed=player_event_runtime.movement_speed_x100;
                player_event_runtime.movement_speed_x100=adventure_speed;
                player.speed_pixels = gbs::consume_event_player_movement_step(
                    player_event_runtime,
                    player_wants_to_move
                );
                player_event_runtime.movement_speed_x100=authored_speed;
                gbs::update_player_with_actor_push(
                    room.collision,
                    player,
                    player_input,
                    player_blockers,
                    player_blocker_count
                );
                for (size_t blocker_index = 0; blocker_index < player_blocker_count; ++blocker_index) {
                    npc_runtimes[player_blocker_indices[blocker_index]].actor.position_pixels =
                        player_blockers[blocker_index].position_pixels;
                }
                player_moved_this_frame = player.position_pixels.x != player_position_before_update.x ||
                    player.position_pixels.y != player_position_before_update.y;
                if (player.speed_pixels > 0 && !player_moved_this_frame && player_wants_to_move) {
                    runtime_blocked_direction_bits |= runtime_input_direction_bits(player_input);
                    gbs::Rect attempted_rect = gbs::actor_rect(player);
                    if (player_input.is_held(gbs::ButtonRight)) ++attempted_rect.x;
                    if (player_input.is_held(gbs::ButtonLeft)) --attempted_rect.x;
                    if (player_input.is_held(gbs::ButtonDown)) ++attempted_rect.y;
                    if (player_input.is_held(gbs::ButtonUp)) --attempted_rect.y;
                    runtime_telemetry.seen_slope_bits |= runtime_slope_bits_in_rect(room.collision, attempted_rect);
                }
                refresh_player_directional_animation(player_wants_to_move);
            }

            const gbs::TopDownRoomData& ai_room = project.rooms[current_room];
            size_t active_npc_slots[max_active_npc_slots] = {};
            const size_t ai_npc_count = collect_camera_npc_slots(
                active_npc_slots,
                max_active_npc_slots,
                active_npc_viewport_margin_pixels
            );
            debug_work_units += static_cast<uint32_t>(ai_npc_count);
            gbs::debug_set_counter(0, "npc", static_cast<uint32_t>(ai_npc_count));
            for (size_t slot_index = 0; slot_index < ai_npc_count; ++slot_index) {
                const size_t index = active_npc_slots[slot_index];
                gbs::Actor npc_blockers[max_active_npc_slots + 1] = {};
                size_t npc_blocker_count = collect_npc_blocking_actors(index, npc_blockers, max_active_npc_slots + 1);
                const bool npc_moved = gbs::update_actor_runtime_ai(
                    ai_room.npcs[index],
                    npc_runtimes[index],
                    room.collision,
                    player,
                    npc_blockers,
                    npc_blocker_count
                );
                refresh_npc_directional_animation(index, npc_moved);
            }
            update_npc_player_hit_scripts();
            queue_player_update_script();
            queue_actor_update_scripts();

            const gbs::TopDownRoomData& trigger_room = project.rooms[current_room];
            const size_t trigger_count = trigger_room.triggers == nullptr
                ? 0
                : (trigger_room.trigger_count < max_trigger_slots ? trigger_room.trigger_count : max_trigger_slots);
            debug_work_units += static_cast<uint32_t>(trigger_count);
            gbs::debug_set_counter(1, "trigger", static_cast<uint32_t>(trigger_count));
            for (size_t index = 0; index < trigger_count; ++index) {
                gbs::TopDownTriggerResult result = gbs::update_trigger_state(
                    trigger_room.triggers[index],
                    trigger_states[index],
                    player
                );
                if (result == gbs::TopDownTriggerResult::Enter) {
                    ++runtime_trigger_enter_count;
                } else if (result == gbs::TopDownTriggerResult::Leave) {
                    ++runtime_trigger_leave_count;
                }
                gbs::EventScript trigger_script = gbs::trigger_event_script_for_result(
                    trigger_room.triggers[index],
                    result
                );
                if (gbs::has_event_script(trigger_script)) {
                    queue_script(trigger_script);
                }
            }

            uint8_t active_effects = gbs::tile_effects_for_actor(
                room.collision,
                player,
                static_cast<uint8_t>(gbs::TileWater | gbs::TileDamage | gbs::TileLadder)
            );
            const size_t tile_effect_count = trigger_room.tile_effect_events == nullptr
                ? 0
                : (trigger_room.tile_effect_event_count < max_tile_effect_slots
                    ? trigger_room.tile_effect_event_count
                    : max_tile_effect_slots);
            debug_work_units += static_cast<uint32_t>(tile_effect_count);
            gbs::debug_set_counter(2, "tilefx", static_cast<uint32_t>(tile_effect_count));
            for (size_t index = 0; index < tile_effect_count; ++index) {
                gbs::TopDownTriggerResult result = gbs::update_tile_effect_state(
                    trigger_room.tile_effect_events[index],
                    tile_effect_states[index],
                    active_effects
                );
                gbs::EventScript effect_script = gbs::tile_effect_event_script_for_result(
                    trigger_room.tile_effect_events[index],
                    result
                );
                if (gbs::has_event_script(effect_script)) {
                    queue_script(effect_script);
                }
            }

            if (input.was_pressed(gbs::ButtonA)) {
                if (!queue_adventure_callback(adventure_callback_on_interact, true)) {
                    gbs::EventScript interaction_script = gbs::actor_runtime_interaction_script_for(
                        project.rooms[current_room],
                        npc_runtimes,
                        current_npc_count(),
                        player
                    );
                    if (!gbs::has_event_script(interaction_script)) {
                        interaction_script = gbs::interaction_event_script_for(project.rooms[current_room], player);
                    }
                    if (!gbs::has_event_script(interaction_script)) {
                        interaction_script = project.rooms[current_room].on_interact;
                    }
                    queue_script(interaction_script);
                }
            }

            gbs::PortalHit portal_hit = gbs::check_portal_hits(room, player, current_room);
            if (portal_hit.did_hit) {
                gbs::EventScript portal_script = gbs::portal_event_script_for(project.rooms[current_room], portal_hit.portal_index);
                if (gbs::has_event_script(portal_script)) {
                    if (!queue_adventure_callback(adventure_callback_on_room_exit, false)) {
                        queue_script(project.rooms[current_room].on_exit, false);
                    }
                    queue_script(portal_script);
                } else {
                    apply_warp(portal_hit.warp);
                }
            }
        }
        if (!gbs::event_scene_type_is_paused(event_state, scene_type_topdown)) {

        }

        return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_topdown_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        gbs::consume_visual_effect_event(event_state, visual_effects);
        gbs::set_backdrop_color(backdrop_color_for_player_effects());
        if (!pause_menu.visible) {
            gbs::update_dialogue(dialogue);
            if (dialogue.revealed_char_this_frame &&
                dialogue.text_sfx_index >= 0 &&
                static_cast<size_t>(dialogue.text_sfx_index) < project.sfx_asset_count) {
                gbs::play_sfx(project.sfx_assets[dialogue.text_sfx_index]);
            }
        }
        const gbs::TopDownRoomData& active_room_data = project.rooms[current_room];
        if (!pause_menu.visible) {
            gbs::apply_camera_zones(
                camera,
                player,
                active_room_data.camera_zones,
                active_room_data.camera_zone_count,
                room.width_tiles * 8,
                room.height_tiles * 8
            );
        } else if (!pause_render_camera_ready) {
            capture_pause_render_camera();
        }
        const gbs::Vec2i render_camera = pause_menu.visible && pause_render_camera_ready
            ? pause_render_camera
            : render_camera_from_state();
        // Ground lives on BG2, foreground on BG1 and UI overlays stay on BG0.
        for (size_t index = 0; index < project.background_count; ++index) {
            gbs::set_bg_parallax(render_camera, gbs::parallax_from_background(project.backgrounds[index]));
        }
        const bool affine_room = active_room_data.video.affine_enabled || project.video.affine_enabled;
        if (!gbs::is_bitmap_display_mode(project.video.display_mode)) {
            if (!active_room_data.uses_visual_tilemap && !affine_room) {
                gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2, active_room_visual_tiles(), room.width_tiles, room.height_tiles, render_camera.x, render_camera.y);
                gbs::draw_room_to_bg(gbs::BackgroundLayer::BG1, project.rooms[current_room].foreground_tiles, room.width_tiles, room.height_tiles, render_camera.x, render_camera.y);
            }
        }
        gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, !active_room_data.uses_visual_tilemap && !affine_room);
        // A source visual tilemap is already resident as a full hardware map;
        // dynamic room tiles are staged into a 32x32 window and only need the
        // sub-tile scroll remainder.
        const int bg2_scroll_x = affine_room ? 0 : (active_room_data.uses_visual_tilemap ? render_camera.x : (render_camera.x & 7));
        const int bg2_scroll_y = affine_room ? 0 : (active_room_data.uses_visual_tilemap ? render_camera.y : (render_camera.y & 7));
        gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, render_camera.x & 7, render_camera.y & 7);
        gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, bg2_scroll_x, bg2_scroll_y);
        gbs::set_bg_scroll(gbs::BackgroundLayer::BG0, 0, 0);
        const gbs::Vec2i visual_scroll = gbs::visual_effect_scroll_offset(visual_effects);
        if (gbs::visual_effect_targets_background(visual_effects, gbs::BackgroundLayer::BG0)) {
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG0, visual_scroll.x, visual_scroll.y);
        }
        if (gbs::visual_effect_targets_background(visual_effects, gbs::BackgroundLayer::BG1)) {
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, (render_camera.x & 7) + visual_scroll.x, (render_camera.y & 7) + visual_scroll.y);
        }
        if (gbs::visual_effect_targets_background(visual_effects, gbs::BackgroundLayer::BG2)) {
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, bg2_scroll_x + visual_scroll.x, bg2_scroll_y + visual_scroll.y);
        }
        if (gbs::visual_effect_targets_background(visual_effects, gbs::BackgroundLayer::BG3)) {
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG3, visual_scroll.x, visual_scroll.y);
        }
        gbs::render_visual_effects(visual_effects);
        const bool show_debug_overlay = current_input.is_held(gbs::ButtonSelect);
        if (!show_debug_overlay) {
            gbs::draw_debug_overlay(false);
        }
        gbs::hide_all_sprites();
        gbs::clear_event_text();
        if (!pause_menu.visible) {
            gbs::draw_hud(hud);

        }
        if (!pause_menu.visible) {
            gbs::draw_dialogue(dialogue);
        }
        if (!pause_menu.visible) {
            gbs::tick_overlay(overlay);
            gbs::draw_overlay(overlay);
        }
        if (show_debug_overlay) {
            gbs::draw_debug_overlay(true);
        }
        // O overlay de debug limpa uma area que cruza o menu; desenhe o menu por ultimo.
        // Quando esta oculto, draw_menu tambem limpa apenas a propria caixa.
        gbs::draw_menu(pause_menu);
        if(event_interaction.active) gbs::draw_menu(event_interaction_menu);

        const size_t npc_count = current_npc_count();
        const bool draw_world_sprites = all_sprites_visible && !pause_menu.visible;
        if (draw_world_sprites) {
            gbs::TopDownActorDrawSlot draw_slots[max_visible_world_actor_slots] = {};
            const size_t draw_slot_count = gbs::collect_visible_topdown_actor_draw_slots(
                player,
                player_event_runtime.active,
                npc_runtimes,
                npc_count,
                render_camera,
                gbs::topdown_camera_viewport_width_pixels(camera.zoom_x256),
                gbs::topdown_camera_viewport_height_pixels(camera.zoom_x256),
                0,
                draw_slots,
                ((96 - npc_oam_start - runtime_projectile_oam_cost()) / oam_sprites_per_actor + 1) < max_visible_world_actor_slots
                    ? ((96 - npc_oam_start - runtime_projectile_oam_cost()) / oam_sprites_per_actor + 1)
                    : max_visible_world_actor_slots
            );
            for (size_t slot_index = 0; slot_index < draw_slot_count; ++slot_index) {
                const uint16_t first_oam_index = slot_index == 0
                    ? 0
                    : npc_oam_start + static_cast<uint16_t>((slot_index - 1) * oam_sprites_per_actor);
                if (draw_slots[slot_index].is_player) {
                    if (!gbs::event_actor_effect_visible(event_state, -1)) continue;
                    if (!load_streamed_animation_frame_tiles(player_animator, player_streamed_tile_asset_loaded)) {
                        continue;
                    }
                    const gbs::MetaSprite* player_metasprite = player_runtime_metasprite();
                    set_actor_metasprite(
                        first_oam_index,
                        *player_metasprite,
                        gbs::Vec2i {
                            player.position_pixels.x - render_camera.x + gbs::event_actor_effect_offset_x(event_state, -1),
                            player.position_pixels.y - render_camera.y
                        },
                        player.size_pixels,
                        topdown_direction_uses_horizontal_flip(player.direction),
                        project.player.affine_obj.enabled ? &project.player.affine_obj : nullptr
                    );
                    continue;
                }

                const size_t index = draw_slots[slot_index].actor_index;
                if (!gbs::event_actor_effect_visible(event_state, static_cast<int>(index))) continue;
                if (!load_streamed_animation_frame_tiles(
                        npc_animators[index],
                        npc_streamed_tile_assets_loaded[index]
                    )) {
                    continue;
                }
                const gbs::MetaSprite* npc_metasprite = gbs::current_metasprite(npc_animators[index]);
                if (npc_metasprite == nullptr) {
                    npc_metasprite = npc_runtimes[index].metasprite;
                }
                if (npc_metasprite != nullptr) {
                    set_actor_metasprite(
                        first_oam_index,
                        *npc_metasprite,
                        gbs::Vec2i {
                            npc_runtimes[index].actor.position_pixels.x - render_camera.x + gbs::event_actor_effect_offset_x(event_state, static_cast<int>(index)),
                            npc_runtimes[index].actor.position_pixels.y - render_camera.y
                        },
                        npc_runtimes[index].actor.size_pixels,
                        topdown_direction_uses_horizontal_flip(npc_runtimes[index].actor.direction),
                        npc_runtimes[index].affine_obj.enabled ? &npc_runtimes[index].affine_obj : nullptr
                    );
                }
            }
            render_runtime_projectiles(render_camera, npc_oam_start + static_cast<uint16_t>((draw_slot_count > 0 ? draw_slot_count-1 : 0) * oam_sprites_per_actor));
        }
        if(!pause_menu.visible && !event_interaction.active && !dialogue.visible) {
            gbs::draw_event_text(event_state,project.dialogue_lines,project.dialogue_line_count,render_camera.x,render_camera.y);
            gbs::draw_event_clock(event_state);
        }
        if (draw_world_sprites) {
            draw_active_dialogue_emote(
                dialogue,
                gbs::Vec2i {
                    player.position_pixels.x - render_camera.x,
                    player.position_pixels.y - render_camera.y
                }
            );
            draw_active_dialogue_portrait(dialogue);
        }

        if (player_moved_this_frame) {
            gbs::update_sprite_animator_scaled(player_animator, project.player.animation_speed_percent);
        }
        for (size_t index = 0; index < npc_count; ++index) {
            if (npc_runtimes[index].active || npc_defeat_pending_despawn[index]) {
                gbs::update_sprite_animator_scaled(npc_animators[index], npc_runtimes[index].animation_speed_percent);
            }
        }
        sync_event_actor_animation_state();
        sync_runtime_telemetry();
        if ((gbs::frame_count() & 31u) == 0) {
            const gbs::Vec2i viewport_center = gbs::topdown_camera_viewport_center_pixels(camera.zoom_x256);
            prefetch_room_resource_groups(current_room, gbs::Vec2i {
                camera.position_pixels.x + viewport_center.x,
                camera.position_pixels.y + viewport_center.y
            });
        }
        update_screen_fade();
        update_camera_shake();
        update_player_bounce();
        ++play_time_frames;
        gbs::debug_end_frame(debug_work_units);
        gbs::tick_visual_effects(visual_effects);

        gbs::wait_vblank();
}

void leave_topdown_runtime() {
#ifdef GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_target() == gbs::RuntimeKind::Menu && event_state.scene_stack_count > 0) {
        gbs::UniversalSaveData data {};
        gbs::clear_suspended_runtime_save();
        if (capture_topdown_runtime_state(data)) gbs::capture_suspended_runtime_save(data);
    }
#endif
    gbs::release_resource_bank_group(resources, project_bank_reservation);
    gbs::release_resource_bank_cache(resources, project_bank_cache);
}

extern "C" void GBS_TOPDOWN_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    topdown_initialization_result = initialize_topdown_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_TOPDOWN_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_topdown_runtime(context);
}

extern "C" void GBS_TOPDOWN_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_topdown_runtime(context);
}

extern "C" void GBS_TOPDOWN_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_topdown_runtime();
}

extern "C" int GBS_TOPDOWN_RUNTIME_ENTRY() {
    topdown_initialization_result = initialize_topdown_runtime();
    if (topdown_initialization_result != 0) {
        leave_topdown_runtime();
        return topdown_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::TopDown,
            current_room,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_topdown_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_topdown_runtime();
            return -1;
        }
        render_topdown_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_topdown_runtime();
            return 0;
        }
    }
}
