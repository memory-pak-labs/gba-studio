#include "gbs/engine.hpp"
#include "gbs/event_ui.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/input.hpp"
#include "gbs/link.hpp"
#include "gbs/isometric.hpp"
#include "gbs/isometric_paged_surface.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/save.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#ifndef GBS_ISOMETRIC_PROJECT_DATA_HEADER
#define GBS_ISOMETRIC_PROJECT_DATA_HEADER "isometric_project_data.hpp"
#endif
#include GBS_ISOMETRIC_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_ISOMETRIC_RUNTIME_ENTRY
#define GBS_ISOMETRIC_RUNTIME_ENTRY gbs_main
#endif
#ifndef GBS_ISOMETRIC_RUNTIME_ENTER
#define GBS_ISOMETRIC_RUNTIME_ENTER gbs_enter_isometric
#endif
#ifndef GBS_ISOMETRIC_RUNTIME_UPDATE
#define GBS_ISOMETRIC_RUNTIME_UPDATE gbs_update_isometric
#endif
#ifndef GBS_ISOMETRIC_RUNTIME_RENDER
#define GBS_ISOMETRIC_RUNTIME_RENDER gbs_render_isometric
#endif
#ifndef GBS_ISOMETRIC_RUNTIME_LEAVE
#define GBS_ISOMETRIC_RUNTIME_LEAVE gbs_leave_isometric
#endif

namespace {

const gbs::IsometricProjectData& project = gbastudio_isometric_project::project;
gbs::LinkSession link_session;
gbs::HudState hud {};

void configure_isometric_hud(const char* scene_name) {
    gbastudio_dialogue_ui::configure_for_scene(scene_name);
    if (gbastudio_dialogue_ui::has_hud_scene_binding(scene_name)) {
        gbs::set_hud_text_slots(hud, nullptr, 0);
    } else {
        gbs::hide_hud(hud);
    }
}

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
constexpr size_t max_actor_count = gbs::max_isometric_save_actors;
constexpr size_t max_draw_count = 128;
constexpr size_t max_room_triggers = 16;
constexpr size_t no_tactical_unit_index = static_cast<size_t>(-1);
constexpr size_t max_project_tile_assets = 8;
constexpr size_t max_project_bg_palettes = 4;
constexpr size_t max_project_obj_palettes = 4;
constexpr size_t max_project_resource_banks = 64;
constexpr size_t iso_surface_layer_tile_count = 40 * 12;
constexpr size_t iso_surface_tile_count = iso_surface_layer_tile_count * 2;
constexpr size_t iso_surface_byte_count = iso_surface_tile_count * 32;
constexpr size_t max_iso_surface_dirty_runs = 8;
constexpr size_t indexed_surface_tile_count = 30 * 20;
constexpr size_t indexed_foreground_tile_base = 601;
constexpr size_t indexed_foreground_tile_count = 167;
constexpr size_t iso_surface_second_tile_base = 1025;
constexpr size_t iso_foreground_tile_base = 513;
constexpr size_t iso_foreground_tilemap_base = 0;
constexpr size_t max_iso_foreground_unique_tiles = 211;
constexpr size_t iso_foreground_cache_bucket_count = 512;
constexpr uint8_t iso_movement_repeat_frames = 8;
static_assert(iso_surface_layer_tile_count <= 512, "Cada camada regular do GBA comporta no maximo 512 tiles 4bpp");
static_assert(iso_foreground_tile_base + max_iso_foreground_unique_tiles <= 1024, "Foreground isometrico deve caber na VRAM de BG");
static_assert(iso_foreground_tile_base + max_iso_foreground_unique_tiles <= 896, "Foreground nao pode sobrescrever os tiles de dialogo");
static_assert(iso_surface_second_tile_base + iso_surface_layer_tile_count <= 1536, "Superficie nao pode sobrescrever os tilemaps");
constexpr size_t max_prefetch_new_banks_per_frame = 2;
constexpr size_t max_prefetch_uploads_per_frame = 2;
uint32_t isometric_save_sequence = 0;
uint32_t runtime_room_change_count = 0;
volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();

gbs::EngineResourceManager resources __attribute__((section(".ewram_bss")));
gbs::ResourceReservation tile_reservations[max_project_tile_assets];
gbs::ResourceReservation bg_palette_reservations[max_project_bg_palettes];
gbs::ResourceReservation obj_palette_reservations[max_project_obj_palettes];
gbs::ResourceBatchReservation resource_reservation {
    tile_reservations,
    max_project_tile_assets,
    0,
    bg_palette_reservations,
    max_project_bg_palettes,
    0,
    obj_palette_reservations,
    max_project_obj_palettes,
    0,
    gbs::ResourceReservation {},
    false
};
gbs::ResourceBankReservation bank_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::ResourceBankBatchReservation bank_reservation {
    bank_reservations,
    max_project_resource_banks,
    0,
    nullptr,
    false
};
gbs::ResourceBankReservation bank_scratch_reservations[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::ResourceBankBatchReservation bank_scratch_reservation {
    bank_scratch_reservations,
    max_project_resource_banks,
    0,
    nullptr,
    false
};
gbs::ResourceBankCacheEntry bank_cache_entries[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::ResourceBankCache bank_cache {
    bank_cache_entries,
    max_project_resource_banks,
    0
};
gbs::ResourceBankPrefetchRequest isometric_prefetch_requests[max_project_resource_banks] __attribute__((section(".ewram_bss")));
gbs::DialogueState dialogue;
gbs::PagedBackgroundWindow iso_paged_window;
uint8_t iso_surface_tiles[600 * 64] __attribute__((section(".ewram_bss")));
uint16_t iso_surface_map[32 * 32] __attribute__((section(".ewram_bss")));
uint8_t iso_transparent_tile[32] __attribute__((section(".ewram_bss")));
uint8_t iso_foreground_surface_tiles[240 * 160] __attribute__((section(".ewram_bss")));
uint8_t iso_foreground_unique_tiles[167 * 64] __attribute__((section(".ewram_bss")));
uint8_t iso_foreground_uploaded_unique_tiles[max_iso_foreground_unique_tiles * 32] __attribute__((section(".ewram_bss")));
uint16_t iso_foreground_map[32 * 32] __attribute__((section(".ewram_bss")));
uint16_t iso_foreground_uploaded_map[iso_surface_tile_count] __attribute__((section(".ewram_bss")));
uint32_t iso_foreground_unique_hashes[max_iso_foreground_unique_tiles] __attribute__((section(".ewram_bss")));
uint16_t iso_foreground_cache_buckets[iso_foreground_cache_bucket_count] __attribute__((section(".ewram_bss")));
gbs::IsoSurfaceTileCache iso_surface_cache __attribute__((section(".ewram_bss")));
const gbs::IsometricRoomData* iso_surface_room = nullptr;
gbs::IsoCamera iso_surface_camera {};
bool iso_surface_valid = false;
bool iso_surface_map_loaded = false;
bool authored_background_map_loaded = false;
bool iso_foreground_valid = false;
bool iso_foreground_map_loaded = false;
bool iso_foreground_incremental_cache_ready = false;
size_t iso_foreground_unique_tile_count = 0;
size_t iso_foreground_uploaded_unique_tile_count = 0;

struct IsoTacticalRuntimeUnit {
    bool configured = false;
    size_t actor_index = no_tactical_unit_index;
    uint8_t team = 0;
    uint8_t move_range = 1;
    uint8_t attack_range = 1;
    uint8_t hp = 0;
    uint8_t max_hp = 0;
    uint8_t attack_power = 1;
};

struct IsoTacticalCursorInput {
    gbs::Vec2i direction {0, 0};
    gbs::Vec2i pending_delta {0, 0};
    uint8_t repeat_frames = 0;
    bool pending = false;
};

struct IsoTacticalCursorVisual {
    gbs::Vec2i from {0, 0};
    gbs::Vec2i current {0, 0};
    gbs::Vec2i target {0, 0};
    uint8_t progress = 3;
    bool initialized = false;
};

struct IsoTacticalRuntimeState {
    bool enabled = false;
    bool selected = false;
    size_t active_unit_index = no_tactical_unit_index;
    size_t selected_unit_index = no_tactical_unit_index;
    uint8_t active_team = 0;
    uint16_t turn_number = 1;
    gbs::IsoCoord feedback_tile { 0, 0, 0 };
    uint8_t feedback_kind = 0;
    uint8_t feedback_frames = 0;
    uint8_t outcome = 0;
    uint8_t pending_audio_cue = 0xff;
    uint8_t pending_audio_delay = 0;
    uint8_t queued_audio_cue = 0xff;
    uint8_t queued_audio_delay = 0;
    bool moving = false;
    bool moved_this_turn = false;
    bool menu_open = false;
    IsoTacticalCursorInput cursor_input {};
    IsoTacticalCursorVisual cursor_visual {};
    bool attack_mode = false;
    uint8_t menu_index = 0; // Move, Attack, Wait.
    uint8_t message = 0; // No target, movement spent, invalid cell/target.
    uint8_t message_frames = 0;
    uint8_t enemy_delay = 30;
    size_t moving_actor_index = no_tactical_unit_index;
    gbs::IsoTacticalMovePath move_path {};
    uint8_t move_step_index = 0;
    uint8_t move_step_delay = 0;
    int32_t move_from_x256 = 0;
    int32_t move_from_y256 = 0;
    int32_t move_to_x256 = 0;
    int32_t move_to_y256 = 0;
    IsoTacticalRuntimeUnit units[max_actor_count] = {};
};

enum IsoTacticalOutcome : uint8_t {
    IsoTacticalOutcomeNone = 0,
    IsoTacticalOutcomeVictory = 1,
    IsoTacticalOutcomeDefeat = 2
};

const char* iso_tactical_phase_label(const IsoTacticalRuntimeState& state, uint8_t locale) {
    if (state.outcome == IsoTacticalOutcomeVictory) return locale == 2 ? "VICTORY" : locale == 3 ? "VICTORIA" : "VITORIA";
    if (state.outcome == IsoTacticalOutcomeDefeat) return locale == 2 ? "DEFEAT" : "DERROTA";
    if (state.active_team != 0) return locale == 2 ? "ENEMY" : locale == 3 ? "ENEMIGO" : "INIMIGO";
    if (state.moving) return locale == 2 ? "MOVING" : locale == 3 ? "MOVIENDO" : "MOVENDO";
    if (state.moved_this_turn) return locale == 2 ? "ACTION" : locale == 3 ? "ACCION" : "ACAO";
    return locale == 2 ? "YOUR TURN" : locale == 3 ? "TU TURNO" : "SUA VEZ";
}

void draw_iso_tactical_hud_status(const IsoTacticalRuntimeState& state) {
    const uint8_t locale = gbs::active_dialogue_locale_id();
    const bool commands = state.active_team == 0 && state.outcome == IsoTacticalOutcomeNone && !state.moving;
    // Reuse exactly 32 dynamic text OBJ slots; menu and stats never overlap.
    gbs::draw_text_overlay_slot(0, 0, 32, "", 0, false);
    char choices[24] {};
    const char* top = iso_tactical_phase_label(state, locale);
    if (commands) {
        if (state.message_frames > 0) {
            if (state.message == 1) top = locale == 2 ? "NO TARGET IN RANGE" : locale == 3 ? "SIN BLANCO AL ALCANCE" : "SEM ALVO AO ALCANCE";
            else if (state.message == 2) top = locale == 2 ? "ALREADY MOVED" : locale == 3 ? "YA SE MOVIO" : "JA MOVEU NESTE TURNO";
            else top = locale == 2 ? "INVALID CELL OR TARGET" : locale == 3 ? "CASILLA NO VALIDA" : "CASA OU ALVO INVALIDO";
        } else if (state.menu_open) {
            const char* labels = locale == 2 ? " MOVE   ATTACK  WAIT    " : " MOVER  ATACAR  ESPERAR";
            for (size_t i = 0; labels[i] && i < 23; ++i) choices[i] = labels[i];
            const uint8_t positions[] = {0, 7, 15};
            choices[positions[state.menu_index < 3 ? state.menu_index : 0]] = '!';
            top = choices;
        } else if (state.selected) {
            top = state.attack_mode
                ? (locale == 2 ? "A:ATTACK B:BACK" : locale == 3 ? "A:ATACAR B:VOLVER" : "A:ATACAR B:VOLTAR")
                : (locale == 2 ? "A:MOVE B:BACK" : locale == 3 ? "A:MOVER B:VOLVER" : "A:MOVER B:VOLTAR");
        } else top = locale == 2 ? "SELECT UNIT: A" : locale == 3 ? "ELEGIR UNIDAD: A" : "SELECIONE UNIDADE: A";
    }
    gbs::draw_text_overlay_slot(commands ? 3 : 10, 1, commands ? 23 : 10, top, 0);
    const IsoTacticalRuntimeUnit* player = nullptr;
    const IsoTacticalRuntimeUnit* enemy = nullptr;
    for (size_t index = 0; index < max_actor_count; ++index) {
        const auto& unit = state.units[index];
        if (!unit.configured) continue;
        if (unit.team == 0 && player == nullptr) player = &unit;
        if (unit.team != 0 && enemy == nullptr) enemy = &unit;
    }
    char player_status[] = "NARA 0/0";
    char enemy_status[] = "GUAR 0/0";
    if (player) {
        player_status[5] = static_cast<char>('0' + (player->hp > 9 ? 9 : player->hp));
        player_status[7] = static_cast<char>('0' + (player->max_hp > 9 ? 9 : player->max_hp));
    }
    if (enemy) {
        enemy_status[5] = static_cast<char>('0' + (enemy->hp > 9 ? 9 : enemy->hp));
        enemy_status[7] = static_cast<char>('0' + (enemy->max_hp > 9 ? 9 : enemy->max_hp));
    }
    if (commands) {
        char compact[] = "N0/0 S0/0";
        compact[1] = player_status[5]; compact[3] = player_status[7];
        compact[6] = enemy_status[5]; compact[8] = enemy_status[7];
        gbs::draw_text_overlay_slot(10, 18, 9, compact, 23);
    } else {
        gbs::draw_text_overlay_slot(2, 18, 8, player_status, 10, player != nullptr);
        gbs::draw_text_overlay_slot(18, 18, 8, enemy_status, 18, enemy != nullptr);
    }
}

enum IsoTacticalFeedbackKind : uint8_t {
    IsoTacticalFeedbackNone = 0,
    IsoTacticalFeedbackMove = 1,
    IsoTacticalFeedbackAttack = 2,
    IsoTacticalFeedbackBlocked = 3
};

constexpr uint8_t no_iso_tactical_audio_cue = 0xff;

gbs::EventState event_state __attribute__((section(".ewram_bss")));
gbs::VisualEffectsController visual_effects;
int current_room = 0;
int entry_x = 0;
int entry_y = 0;
bool runtime_entry = false;
bool restore_entry = false;
int restore_slot_index = -1;
const gbs::IsometricRoomData* room_data = nullptr;
gbs::IsoActor actors[max_actor_count] __attribute__((section(".ewram_bss")));
gbs::IsoActorAnimationState actor_animation_states[max_actor_count] __attribute__((section(".ewram_bss")));
bool iso_actor_touching_player[max_actor_count] __attribute__((section(".ewram_bss")));
size_t actor_count = 0;
gbs::IsoDrawItem draw_items[max_draw_count] __attribute__((section(".ewram_bss")));
gbs::IsoCamera camera {};
bool iso_camera_zone_active = false;
bool tactical_presentation_maps_loaded = false;
bool tactical_presentation_load_failed = false;
size_t tactical_surface_page_index = gbs::iso_tactical_surface_page_none;
size_t tactical_surface_pending_page_index = gbs::iso_tactical_surface_page_none;
size_t tactical_surface_requested_page_index = gbs::iso_tactical_surface_page_none;
bool tactical_surface_page_load_started = false;
bool tactical_presentation_audio_started = false;
gbs::IsoCursorState cursor {};
IsoTacticalRuntimeState tactical_state {};
gbs::RuntimeTriggerState trigger_states[max_room_triggers] __attribute__((section(".ewram_bss")));
int isometric_initialization_result = -1;

void set_iso_tactical_feedback(
    IsoTacticalRuntimeState& state,
    gbs::IsoCoord tile,
    IsoTacticalFeedbackKind kind,
    uint8_t frames = 20
) {
    state.feedback_tile = tile;
    state.feedback_kind = static_cast<uint8_t>(kind);
    state.feedback_frames = frames;
}

void tick_iso_tactical_feedback(IsoTacticalRuntimeState& state) {
    if (state.message_frames > 0) --state.message_frames;
    if (state.feedback_frames > 0) {
        --state.feedback_frames;
    }
    if (state.feedback_frames == 0) {
        state.feedback_kind = IsoTacticalFeedbackNone;
    }
}

void play_iso_tactical_sfx(
    const gbs::IsoTacticalPresentationData* presentation,
    gbs::IsoTacticalAudioCue cue
) {
    if (presentation == nullptr ||
        !gbs::iso_tactical_capability_enabled(*presentation, gbs::IsoTacticalCapability::Audio) ||
        presentation->audio_cues == nullptr) {
        return;
    }
    const size_t cue_index = static_cast<size_t>(cue);
    if (cue_index < presentation->audio_cue_count) {
        gbs::play_sfx(presentation->audio_cues[cue_index]);
    }
}

void start_iso_tactical_music(const gbs::IsoTacticalPresentationData* presentation) {
    if (presentation == nullptr ||
        !gbs::iso_tactical_capability_enabled(*presentation, gbs::IsoTacticalCapability::Audio) ||
        presentation->music == nullptr) {
        return;
    }
    gbs::play_tracker_music(*presentation->music);
}

void schedule_iso_tactical_sfx(
    IsoTacticalRuntimeState& state,
    gbs::IsoTacticalAudioCue cue,
    uint8_t delay_frames
) {
    const uint8_t cue_value = static_cast<uint8_t>(cue);
    if (state.pending_audio_cue == no_iso_tactical_audio_cue) {
        state.pending_audio_cue = cue_value;
        state.pending_audio_delay = delay_frames;
    } else {
        state.queued_audio_cue = cue_value;
        state.queued_audio_delay = delay_frames;
    }
}

void tick_iso_tactical_audio(
    IsoTacticalRuntimeState& state,
    const gbs::IsoTacticalPresentationData* presentation
) {
    if (state.pending_audio_cue == no_iso_tactical_audio_cue) {
        return;
    }
    if (state.pending_audio_delay > 0) {
        --state.pending_audio_delay;
        return;
    }
    if (state.pending_audio_cue < gbs::iso_tactical_audio_cue_count) {
        play_iso_tactical_sfx(
            presentation,
            static_cast<gbs::IsoTacticalAudioCue>(state.pending_audio_cue)
        );
    }
    state.pending_audio_cue = state.queued_audio_cue;
    state.pending_audio_delay = state.queued_audio_delay;
    state.queued_audio_cue = no_iso_tactical_audio_cue;
    state.queued_audio_delay = 0;
}

const gbs::IsoActorAnimationSet* iso_animation_set_for_actor(
    const gbs::IsometricRoomData* room_data,
    size_t index
) {
    if (room_data == nullptr || room_data->actor_animations == nullptr || index >= room_data->actor_count) {
        return nullptr;
    }
    return &room_data->actor_animations[index];
}

const gbs::IsoActorAnimationSet* iso_tactical_animation_set_for_actor(
    const gbs::IsometricRoomData& room_data,
    size_t actor_index
) {
    const gbs::IsoTacticalPresentationData* presentation = room_data.tactical_presentation;
    if (presentation != nullptr &&
        gbs::iso_tactical_capability_enabled(*presentation, gbs::IsoTacticalCapability::Units) &&
        presentation->units != nullptr) {
        for (size_t index = 0; index < presentation->unit_count; ++index) {
            const gbs::IsoTacticalUnitPresentationData& unit = presentation->units[index];
            if (unit.actor_index == actor_index && unit.animations != nullptr) {
                return unit.animations;
            }
        }
    }
    return iso_animation_set_for_actor(&room_data, actor_index);
}

void face_iso_actor_toward(
    gbs::IsoActorAnimationState& state,
    gbs::IsoCoord from,
    gbs::IsoCoord to
) {
    gbs::Vec2i delta { to.x - from.x, to.y - from.y };
    if (delta.x == 0 && delta.y == 0) {
        delta = gbs::Vec2i { 1, 0 };
    }
    gbs::set_iso_actor_motion(state, delta, false);
}

void initialize_iso_tactical_facing(
    const IsoTacticalRuntimeState& state,
    const gbs::IsoActor* actors,
    gbs::IsoActorAnimationState* animations,
    size_t actor_count
) {
    if (!state.enabled || actors == nullptr || animations == nullptr) return;
    for (const auto& unit : state.units) {
        if (!unit.configured || unit.hp == 0 || unit.actor_index >= actor_count) continue;
        const auto from = actors[unit.actor_index].tile;
        size_t target = actor_count;
        int nearest = 0;
        for (const auto& opponent : state.units) {
            if (!opponent.configured || opponent.hp == 0 || opponent.team == unit.team ||
                opponent.actor_index >= actor_count) continue;
            const auto to = actors[opponent.actor_index].tile;
            const int dx = to.x - from.x, dy = to.y - from.y;
            const int distance = (dx < 0 ? -dx : dx) + (dy < 0 ? -dy : dy);
            if (target == actor_count || distance < nearest) {
                target = opponent.actor_index;
                nearest = distance;
            }
        }
        if (target != actor_count) face_iso_actor_toward(animations[unit.actor_index], from, actors[target].tile);
    }
}

uint32_t iso_tactical_telemetry_bits(
    const IsoTacticalRuntimeState* state,
    const gbs::IsoCursorState& cursor
) {
    if (state == nullptr || !state->enabled) {
        return 0;
    }
    const uint32_t cursor_x = static_cast<uint32_t>(cursor.tile.x < 0 ? 0 : cursor.tile.x) & 0x0Fu;
    const uint32_t cursor_y = static_cast<uint32_t>(cursor.tile.y < 0 ? 0 : cursor.tile.y) & 0x0Fu;
    return (1u << 16)
        | (state->selected ? (1u << 17) : 0u)
        | ((static_cast<uint32_t>(state->active_team) & 0x01u) << 18)
        | ((static_cast<uint32_t>(state->turn_number) & 0x0Fu) << 19)
        | (cursor_x << 23)
        | (cursor_y << 27);
}

size_t first_iso_tactical_unit_for_team(
    const IsoTacticalRuntimeState& state,
    uint8_t team
) {
    for (size_t index = 0; index < max_actor_count; ++index) {
        const IsoTacticalRuntimeUnit& unit = state.units[index];
        if (unit.configured && unit.team == team && unit.hp > 0) {
            return index;
        }
    }
    return no_tactical_unit_index;
}

void init_iso_tactical_state(
    IsoTacticalRuntimeState& state,
    const gbs::IsometricRoomData& room_data,
    size_t actor_count
) {
    state = IsoTacticalRuntimeState {};
    if (!gbs::is_tactical_isometric_room(room_data) || room_data.tactical == nullptr) {
        return;
    }
    state.enabled = true;
    state.active_team = room_data.tactical->active_team;
    const size_t unit_count = room_data.tactical->unit_count < max_actor_count
        ? room_data.tactical->unit_count
        : max_actor_count;
    for (size_t index = 0; index < unit_count; ++index) {
        const gbs::IsoTacticalUnitData& source = room_data.tactical->units[index];
        if (source.actor_index >= actor_count) {
            continue;
        }
        IsoTacticalRuntimeUnit& unit = state.units[index];
        unit.configured = true;
        unit.actor_index = source.actor_index;
        unit.team = source.team;
        unit.move_range = source.move_range;
        unit.attack_range = source.attack_range;
        unit.max_hp = source.max_hp;
        unit.hp = source.max_hp;
        unit.attack_power = source.attack_power;
    }
    if (room_data.tactical->active_unit_index < unit_count &&
        state.units[room_data.tactical->active_unit_index].configured &&
        state.units[room_data.tactical->active_unit_index].team == state.active_team) {
        state.active_unit_index = room_data.tactical->active_unit_index;
    } else {
        state.active_unit_index = first_iso_tactical_unit_for_team(state, state.active_team);
    }
}

void advance_iso_tactical_turn(IsoTacticalRuntimeState& state) {
    state.selected = false;
    state.menu_open = false;
    state.attack_mode = false;
    state.menu_index = 0;
    state.message_frames = 0;
    state.selected_unit_index = no_tactical_unit_index;
    state.turn_number = static_cast<uint16_t>(state.turn_number + 1);
    state.active_team = state.active_team == 0 ? 1 : 0;
    state.active_unit_index = first_iso_tactical_unit_for_team(state, state.active_team);
    state.moved_this_turn = false;
    state.enemy_delay = 30;
}

void initialize_iso_tactical_cursor(
    const IsoTacticalRuntimeState& state,
    const gbs::IsoActor* actors,
    size_t actor_count,
    gbs::IsoCursorState& cursor
) {
    if (!state.enabled || state.active_unit_index == no_tactical_unit_index) return;
    const size_t actor_index = state.units[state.active_unit_index].actor_index;
    if (actor_index < actor_count) cursor.tile = actors[actor_index].tile;
    cursor.active = true;
}

void set_iso_entry_position(gbs::IsoActor& actor, const gbs::IsometricRoomData& room, int x, int y) {
    actor.tile = {x, y, gbs::iso_tile_height_at(gbs::iso_tilemap_from_room(room), x, y)};
    actor.position_initialized = false;
}

gbs::Vec2i input_to_tactical_cursor_delta(gbs::InputState input) {
    const int horizontal = int(input.is_held(gbs::ButtonRight)) - int(input.is_held(gbs::ButtonLeft));
    const int vertical = int(input.is_held(gbs::ButtonDown)) - int(input.is_held(gbs::ButtonUp));
    const int x = horizontal + vertical;
    const int y = vertical - horizontal;
    return {(x > 0) - (x < 0), (y > 0) - (y < 0)};
}

gbs::Vec2i step_iso_tactical_cursor_input(gbs::InputState input, IsoTacticalCursorInput& state,
    bool confirm = false) {
    constexpr uint16_t directions = gbs::ButtonLeft | gbs::ButtonRight | gbs::ButtonUp | gbs::ButtonDown;
    const gbs::Vec2i delta = input_to_tactical_cursor_delta(input);
    const bool active = delta.x != 0 || delta.y != 0;
    if (state.pending) {
        // Collect adjacent key presses in one 30 FPS tick. A released short tap
        // still commits once; opposing held keys cancel it instead.
        if (active) state.pending_delta = delta;
        else if (input.held & directions) { state = {}; return {0, 0}; }
        const auto step = state.pending_delta;
        state.pending = false;
        state.direction = delta;
        state.repeat_frames = active ? 8 : 0;
        return step;
    }
    if (!active) { state = {}; return {0, 0}; }
    if (delta.x != state.direction.x || delta.y != state.direction.y) {
        const bool was_idle = state.direction.x == 0 && state.direction.y == 0;
        state.direction = delta;
        state.repeat_frames = 8;
        // Releasing one half of a diagonal must not generate an extra step.
        if (was_idle || (input.pressed & directions)) {
            state.pending_delta = delta;
            state.pending = !confirm;
            if (confirm) return delta;
        }
        return {0, 0};
    }
    if (state.repeat_frames > 0) --state.repeat_frames;
    if (state.repeat_frames != 0) return {0, 0};
    state.repeat_frames = 3;
    return delta;
}

void set_iso_tactical_cursor_visual(IsoTacticalCursorVisual& visual, gbs::IsoCoord tile,
    const gbs::IsoGridConfig& grid, bool animate) {
    const auto target = gbs::iso_tile_to_screen(tile, grid);
    visual.from = visual.initialized && animate ? visual.current : target;
    visual.current = visual.from;
    visual.target = target;
    visual.progress = visual.initialized && animate ? 0 : 3;
    visual.initialized = true;
}

void tick_iso_tactical_cursor_visual(IsoTacticalCursorVisual& visual, gbs::IsoCoord tile,
    const gbs::IsoGridConfig& grid) {
    const auto target = gbs::iso_tile_to_screen(tile, grid);
    if (!visual.initialized || target.x != visual.target.x || target.y != visual.target.y) {
        set_iso_tactical_cursor_visual(visual, tile, grid, false);
    } else if (visual.progress < 3) {
        ++visual.progress;
        visual.current = {
            visual.from.x + (visual.target.x - visual.from.x) * visual.progress / 3,
            visual.from.y + (visual.target.y - visual.from.y) * visual.progress / 3
        };
    }
}

gbs::Vec2i iso_tactical_cursor_draw_offset(const IsoTacticalCursorVisual& visual,
    gbs::IsoCoord tile, const gbs::IsoGridConfig& grid) {
    if (!visual.initialized) return {0, 0};
    const auto target = gbs::iso_tile_to_screen(tile, grid);
    return {visual.current.x - target.x, visual.current.y - target.y};
}

void move_iso_tactical_cursor(const gbs::IsometricRoomData& room, const gbs::IsoCamera& camera,
    gbs::IsoCursorState& cursor, gbs::Vec2i delta) {
    auto next = cursor;
    if (!gbs::move_iso_cursor_by_delta(gbs::iso_tilemap_from_room(room), next, delta)) return;
    if (room.world_mode == gbs::IsoWorldMode::StaticComposition) {
        const auto point = gbs::iso_camera_world_to_screen(camera, gbs::iso_tile_to_screen(next.tile, room.grid));
        if (point.x - room.grid.tile_width_pixels / 2 < 0 || point.x + room.grid.tile_width_pixels / 2 > 240 ||
            point.y < 0 || point.y + room.grid.tile_height_pixels > 160) return;
    }
    cursor = next;
}

void tick_iso_tactical_move(
    IsoTacticalRuntimeState& state,
    gbs::IsoActor* actors,
    gbs::IsoActorAnimationState* animation_states,
    size_t actor_count,
    const gbs::IsoTileMap& map,
    const gbs::IsoTacticalPresentationData* presentation
) {
    if (!state.moving || state.moving_actor_index >= actor_count) return;
    gbs::IsoActor& actor = actors[state.moving_actor_index];
    if (state.move_step_delay > 0) {
        const int progress = 6 - state.move_step_delay;
        actor.position_x256 = state.move_from_x256 +
            (state.move_to_x256 - state.move_from_x256) * progress / 5;
        actor.position_y256 = state.move_from_y256 +
            (state.move_to_y256 - state.move_from_y256) * progress / 5;
        --state.move_step_delay;
        return;
    }
    if (state.move_step_index < state.move_path.length) {
        const gbs::IsoCoord next = state.move_path.tiles[state.move_step_index];
        const gbs::Vec2i delta { next.x - actor.tile.x, next.y - actor.tile.y };
        gbs::initialize_iso_actor_position(actor);
        state.move_from_x256 = actor.position_x256;
        state.move_from_y256 = actor.position_y256;
        if (!gbs::move_iso_actor_by_delta(
                map, actor, delta, actors, actor_count, state.moving_actor_index)) {
            state.moving = false;
            set_iso_tactical_feedback(state, next, IsoTacticalFeedbackBlocked, 12);
            if (animation_states != nullptr) {
                gbs::set_iso_actor_motion(animation_states[state.moving_actor_index], gbs::Vec2i { 0, 0 }, false);
            }
            return;
        }
        state.move_to_x256 = actor.position_x256;
        state.move_to_y256 = actor.position_y256;
        actor.position_x256 = state.move_from_x256;
        actor.position_y256 = state.move_from_y256;
        if (animation_states != nullptr) {
            gbs::set_iso_actor_motion(animation_states[state.moving_actor_index], delta, true);
        }
        ++state.move_step_index;
        state.move_step_delay = 5;
        return;
    }
    state.moving = false;
    if (animation_states != nullptr) {
        gbs::set_iso_actor_motion(animation_states[state.moving_actor_index], gbs::Vec2i { 0, 0 }, false);
    }
    state.moved_this_turn = true;
    if (state.active_team == 0) {
        state.menu_open = true;
        state.menu_index = 1;
        state.attack_mode = false;
    }
    state.enemy_delay = 20;
    (void)presentation;
}

bool has_iso_tactical_unit_for_team(const IsoTacticalRuntimeState& state, uint8_t team) {
    return first_iso_tactical_unit_for_team(state, team) != no_tactical_unit_index;
}

size_t iso_tactical_unit_for_actor(
    const IsoTacticalRuntimeState& state,
    size_t actor_index
) {
    for (size_t index = 0; index < max_actor_count; ++index) {
        if (state.units[index].configured && state.units[index].actor_index == actor_index && state.units[index].hp > 0) {
            return index;
        }
    }
    return no_tactical_unit_index;
}

void handle_iso_tactical_action(
    IsoTacticalRuntimeState& state,
    gbs::IsoCursorState& cursor,
    gbs::IsoActor* actors,
    gbs::IsoActorAnimationState* actor_animation_states,
    size_t actor_count,
    const gbs::IsoTileMap& map,
    gbs::InputState input,
    const gbs::IsoTacticalPresentationData* presentation
) {
    if (!state.enabled || state.moving || state.outcome != IsoTacticalOutcomeNone || actors == nullptr) return;
    if (input.was_pressed(gbs::ButtonSelect)) {
        advance_iso_tactical_turn(state);
        set_iso_tactical_feedback(state, cursor.tile, IsoTacticalFeedbackMove, 12);
        play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Turn);
        return;
    }
    if (input.was_pressed(gbs::ButtonB)) {
        state.message_frames = 0;
        if (state.selected) {
            if (state.menu_open) {
                state.selected = false;
                state.menu_open = false;
                state.selected_unit_index = no_tactical_unit_index;
            } else {
                state.menu_open = true;
                state.menu_index = state.attack_mode ? 1 : 0;
                if (state.selected_unit_index < max_actor_count) {
                    const size_t actor_index = state.units[state.selected_unit_index].actor_index;
                    if (actor_index < actor_count) cursor.tile = actors[actor_index].tile;
                }
            }
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
        }
        return;
    }
    if (state.active_team == 0 && state.menu_open) {
        if (input.was_pressed(gbs::ButtonLeft) || input.was_pressed(gbs::ButtonUp)) {
            state.menu_index = (state.menu_index + 2) % 3;
            state.message_frames = 0;
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cursor);
        } else if (input.was_pressed(gbs::ButtonRight) || input.was_pressed(gbs::ButtonDown)) {
            state.menu_index = (state.menu_index + 1) % 3;
            state.message_frames = 0;
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cursor);
        }
        if (!input.was_pressed(gbs::ButtonA)) return;
        state.message_frames = 0;
        if (state.menu_index == 2) {
            advance_iso_tactical_turn(state);
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Turn);
            return;
        }
        if (state.selected_unit_index >= max_actor_count) return;
        const auto& unit = state.units[state.selected_unit_index];
        if (unit.actor_index >= actor_count) return;
        if (state.menu_index == 0 && state.moved_this_turn) {
            state.message = 2; state.message_frames = 90;
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
            return;
        }
        cursor.tile = actors[unit.actor_index].tile;
        state.attack_mode = state.menu_index == 1;
        if (state.attack_mode) {
            size_t target = no_tactical_unit_index;
            for (size_t i = 0; i < max_actor_count; ++i) {
                const auto& other = state.units[i];
                if (other.configured && other.hp > 0 && other.team != unit.team && other.actor_index < actor_count &&
                    actors[other.actor_index].visible && gbs::iso_tactical_can_attack(cursor.tile,
                        actors[other.actor_index].tile, unit.attack_range, &map)) { target = other.actor_index; break; }
            }
            if (target == no_tactical_unit_index) {
                state.message = 1; state.message_frames = 90;
                play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
                return;
            }
            cursor.tile = actors[target].tile;
        }
        state.menu_open = false;
        play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Select);
        return;
    }
    if (!input.was_pressed(gbs::ButtonA)) return;

    if (!state.selected) {
        const size_t actor_index = gbs::find_iso_actor_at_cursor(cursor, actors, actor_count, 0, true);
        const size_t unit_index = iso_tactical_unit_for_actor(state, actor_index);
        if (unit_index != no_tactical_unit_index && unit_index == state.active_unit_index && state.units[unit_index].team == state.active_team) {
            state.selected = true;
            state.selected_unit_index = unit_index;
            state.menu_open = state.active_team == 0;
            state.menu_index = state.moved_this_turn ? 1 : 0;
            state.message_frames = 0;
            set_iso_tactical_feedback(state, actors[actor_index].tile, IsoTacticalFeedbackMove, 12);
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Select);
        }
        else {
            set_iso_tactical_feedback(state, cursor.tile, IsoTacticalFeedbackBlocked, 12);
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
        }
        return;
    }

    if (state.selected_unit_index == no_tactical_unit_index || state.active_unit_index == no_tactical_unit_index) {
        state.selected = false;
        set_iso_tactical_feedback(state, cursor.tile, IsoTacticalFeedbackBlocked, 12);
        play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
        return;
    }
    IsoTacticalRuntimeUnit& selected = state.units[state.selected_unit_index];
    if (!selected.configured || selected.hp == 0 || selected.actor_index >= actor_count) {
        state.selected = false;
        set_iso_tactical_feedback(state, cursor.tile, IsoTacticalFeedbackBlocked, 12);
        play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
        return;
    }
    gbs::IsoActor& selected_actor = actors[selected.actor_index];
    const size_t target_actor_index = gbs::find_iso_actor_at_cursor(cursor, actors, actor_count, 0, true);
    if (target_actor_index != gbs::no_iso_actor_index) {
        const size_t target_unit_index = iso_tactical_unit_for_actor(state, target_actor_index);
        if (target_unit_index != no_tactical_unit_index &&
            (state.active_team != 0 || state.attack_mode) &&
            state.units[target_unit_index].team != selected.team &&
            gbs::iso_tactical_can_attack(selected_actor.tile, cursor.tile, selected.attack_range, &map)) {
            IsoTacticalRuntimeUnit& target = state.units[target_unit_index];
            if (actor_animation_states != nullptr) {
                face_iso_actor_toward(
                    actor_animation_states[selected.actor_index],
                    selected_actor.tile,
                    actors[target.actor_index].tile
                );
                gbs::set_iso_actor_animation_mode(
                    actor_animation_states[selected.actor_index],
                    gbs::IsoActorAnimationMode::Attack
                );
                if (target.actor_index < actor_count) {
                    face_iso_actor_toward(
                        actor_animation_states[target.actor_index],
                        actors[target.actor_index].tile,
                        selected_actor.tile
                    );
                    gbs::set_iso_actor_animation_mode(
                        actor_animation_states[target.actor_index],
                        target.hp > selected.attack_power
                            ? gbs::IsoActorAnimationMode::Hurt
                            : gbs::IsoActorAnimationMode::Defeat
                    );
                }
            }
            target.hp = target.hp > selected.attack_power
                ? static_cast<uint8_t>(target.hp - selected.attack_power)
                : 0;
            set_iso_tactical_feedback(state, actors[target.actor_index].tile, IsoTacticalFeedbackAttack, 20);
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Attack);
            schedule_iso_tactical_sfx(state, gbs::IsoTacticalAudioCue::Hit, 6);
            if (!has_iso_tactical_unit_for_team(state, target.team)) {
                state.selected = false;
                state.selected_unit_index = no_tactical_unit_index;
                state.outcome = selected.team == 0
                    ? IsoTacticalOutcomeVictory
                    : IsoTacticalOutcomeDefeat;
                schedule_iso_tactical_sfx(
                    state,
                    selected.team == 0
                        ? gbs::IsoTacticalAudioCue::Victory
                        : gbs::IsoTacticalAudioCue::Defeat,
                    1
                );
            } else {
                advance_iso_tactical_turn(state);
                play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Turn);
            }
        }
        else {
            state.message = 3; state.message_frames = 90;
            set_iso_tactical_feedback(state, cursor.tile, IsoTacticalFeedbackBlocked, 12);
            play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
        }
        return;
    }
    if (state.moved_this_turn || (state.active_team == 0 && state.attack_mode)) {
        state.message = 3; state.message_frames = 90;
        set_iso_tactical_feedback(state, cursor.tile, IsoTacticalFeedbackBlocked, 12);
        play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
        return;
    }
    const gbs::IsoTacticalMovePath path = gbs::plan_iso_tactical_move(
        map, selected_actor.tile, cursor.tile, actors, actor_count,
        selected.actor_index, selected.move_range
    );
    if (path.found) {
        state.message_frames = 0;
        state.moving = true;
        state.moving_actor_index = selected.actor_index;
        state.move_path = path;
        state.move_step_index = 0;
        state.move_step_delay = 0;
        set_iso_tactical_feedback(state, cursor.tile, IsoTacticalFeedbackMove, 20);
        play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Move);
    } else {
        state.message = 3; state.message_frames = 90;
        set_iso_tactical_feedback(state, cursor.tile, IsoTacticalFeedbackBlocked, 12);
        play_iso_tactical_sfx(presentation, gbs::IsoTacticalAudioCue::Cancel);
    }
}

void tick_iso_tactical_enemy(
    IsoTacticalRuntimeState& state, gbs::IsoCursorState& cursor,
    gbs::IsoActor* actors, gbs::IsoActorAnimationState* animations,
    size_t actor_count, const gbs::IsoTileMap& map,
    const gbs::IsoTacticalPresentationData* presentation
) {
    if (!state.enabled || state.active_team == 0 || state.moving || state.outcome != IsoTacticalOutcomeNone) return;
    if (state.enemy_delay > 0) { --state.enemy_delay; return; }
    const size_t target_unit = first_iso_tactical_unit_for_team(state, 0);
    if (state.active_unit_index == no_tactical_unit_index || target_unit == no_tactical_unit_index) return;
    const auto& unit = state.units[state.active_unit_index];
    const size_t target_actor = state.units[target_unit].actor_index;
    if (unit.actor_index >= actor_count || target_actor >= actor_count) return;
    state.selected = true;
    state.selected_unit_index = state.active_unit_index;
    if (gbs::iso_tactical_can_attack(actors[unit.actor_index].tile, actors[target_actor].tile, unit.attack_range, &map)) {
        cursor.tile = actors[target_actor].tile;
        handle_iso_tactical_action(state, cursor, actors, animations, actor_count, map,
            gbs::InputState {gbs::ButtonA, gbs::ButtonA, 0}, presentation);
    } else if (!state.moved_this_turn) {
        const auto path = gbs::plan_iso_tactical_approach(map, actors, actor_count,
            unit.actor_index, target_actor, unit.move_range, unit.attack_range);
        if (path.found) {
            cursor.tile = path.tiles[path.length - 1];
            handle_iso_tactical_action(state, cursor, actors, animations, actor_count, map,
                gbs::InputState {gbs::ButtonA, gbs::ButtonA, 0}, presentation);
        } else {
            advance_iso_tactical_turn(state);
        }
    } else {
        advance_iso_tactical_turn(state);
    }
    if (state.active_team == 0) cursor.tile = actors[target_actor].tile;
}

void sync_runtime_telemetry(
    int current_room,
    const gbs::IsoActor* actors,
    size_t actor_count,
    const gbs::IsoActorAnimationState* actor_animation_states,
    const gbs::IsometricRoomData& room_data,
    const gbs::EventState& event_state,
    const gbs::IsoCursorState& cursor,
    const IsoTacticalRuntimeState* tactical_state
) {
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = current_room;
    runtime_telemetry.flag_bits = 0;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) {
            runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
        }
    }
    runtime_telemetry.flag_bits |= iso_tactical_telemetry_bits(tactical_state, cursor);
    runtime_telemetry.player_x = actor_count > 0 ? actors[0].tile.x : event_state.player_x;
    runtime_telemetry.player_y = actor_count > 0 ? actors[0].tile.y : event_state.player_y;
    runtime_telemetry.player_direction = actor_count > 0 && actor_animation_states != nullptr
        ? gbs::iso_actor_direction_value(actor_animation_states[0].direction)
        : -1;
    runtime_telemetry.actor_count = static_cast<int>(actor_count);
    runtime_telemetry.first_actor_x = actor_count > 1 ? actors[1].tile.x : -1;
    runtime_telemetry.first_actor_y = actor_count > 1 ? actors[1].tile.y : -1;
    runtime_telemetry.first_actor_direction = actor_count > 1 && actor_animation_states != nullptr
        ? gbs::iso_actor_direction_value(actor_animation_states[1].direction)
        : -1;
    runtime_telemetry.first_actor_visible = actor_count > 1 && actors[1].visible ? 1 : 0;
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    const gbs::IsoTileMap collision = gbs::iso_tilemap_from_room(room_data);
    const int player_tile_x = actor_count > 0 ? actors[0].tile.x : event_state.player_x;
    const int player_tile_y = actor_count > 0 ? actors[0].tile.y : event_state.player_y;
    const uint32_t current_flags = gbs::iso_tile_flags_at(collision, player_tile_x, player_tile_y);
    const uint32_t current_ramp = gbs::iso_tile_ramp_at(collision, player_tile_x, player_tile_y);
    runtime_telemetry.current_tile_flags = current_flags;
    runtime_telemetry.current_tile_slope = current_ramp;
    runtime_telemetry.seen_tile_effects |= current_flags & static_cast<uint32_t>(gbs::IsoTileWater | gbs::IsoTileDamage);
    runtime_telemetry.seen_slope_bits |= current_ramp;
    runtime_telemetry.room_change_count = runtime_room_change_count;
    gbs::publish_runtime_physical_telemetry(resources, event_state);
}

void init_iso_surface_map() {
    for (size_t index = 0; index < iso_surface_layer_tile_count; ++index) {
        // Tile 0 permanece transparente para o BG0 de dialogo/HUD.
        iso_surface_map[index] = static_cast<uint16_t>(index + 1);
    }
}

void offset_iso_foreground_tilemap(uint16_t* tilemap, size_t tile_count) {
    if (tilemap == nullptr) {
        return;
    }
    for (size_t index = 0; index < tile_count; ++index) {
        if (tilemap[index] != 0) {
            tilemap[index] = static_cast<uint16_t>(tilemap[index] + iso_foreground_tilemap_base);
        }
    }
}

bool iso_foreground_unique_tiles_match(size_t tile_count) {
    if (tile_count != iso_foreground_uploaded_unique_tile_count) {
        return false;
    }
    for (size_t tile = 0; tile < tile_count; ++tile) {
        for (size_t byte = 0; byte < 32; ++byte) {
            if (iso_foreground_unique_tiles[tile * 32 + byte] !=
                iso_foreground_uploaded_unique_tiles[tile * 32 + byte]) {
                return false;
            }
        }
    }
    return true;
}

uint32_t iso_foreground_tile_hash(const uint8_t* tile) {
    uint32_t hash = 2166136261u;
    for (size_t byte = 0; byte < 32; ++byte) {
        hash = (hash ^ tile[byte]) * 16777619u;
    }
    return hash;
}

bool iso_foreground_tile_is_transparent(const uint8_t* tile) {
    if ((reinterpret_cast<uintptr_t>(tile) & 3u) == 0) {
        typedef uint32_t AliasWord __attribute__((may_alias));
        const AliasWord* words = reinterpret_cast<const AliasWord*>(tile);
        for (size_t word = 0; word < 8; ++word) {
            if (words[word] != 0) return false;
        }
        return true;
    }
    for (size_t byte = 0; byte < 32; ++byte) {
        if (tile[byte] != 0) return false;
    }
    return true;
}

bool iso_foreground_tiles_equal(const uint8_t* left, const uint8_t* right) {
    for (size_t byte = 0; byte < 32; ++byte) {
        if (left[byte] != right[byte]) return false;
    }
    return true;
}

bool rebuild_iso_foreground_cache(size_t tile_count) {
    if (tile_count > max_iso_foreground_unique_tiles) return false;
    for (size_t bucket = 0; bucket < iso_foreground_cache_bucket_count; ++bucket) {
        iso_foreground_cache_buckets[bucket] = 0;
    }
    for (size_t tile = 0; tile < tile_count; ++tile) {
        const uint32_t hash = iso_foreground_tile_hash(iso_foreground_unique_tiles + tile * 32);
        iso_foreground_unique_hashes[tile] = hash;
        size_t bucket = (hash ^ (hash >> 16)) & (iso_foreground_cache_bucket_count - 1);
        size_t probes = 0;
        while (iso_foreground_cache_buckets[bucket] != 0 && probes < iso_foreground_cache_bucket_count) {
            bucket = (bucket + 1) & (iso_foreground_cache_bucket_count - 1);
            ++probes;
        }
        if (probes >= iso_foreground_cache_bucket_count) return false;
        iso_foreground_cache_buckets[bucket] = static_cast<uint16_t>(tile + 1);
    }
    iso_foreground_unique_tile_count = tile_count;
    iso_foreground_incremental_cache_ready = true;
    return true;
}

size_t find_iso_foreground_cached_tile(const uint8_t* tile, uint32_t hash) {
    size_t bucket = (hash ^ (hash >> 16)) & (iso_foreground_cache_bucket_count - 1);
    for (size_t probes = 0; probes < iso_foreground_cache_bucket_count; ++probes) {
        const uint16_t entry = iso_foreground_cache_buckets[bucket];
        if (entry == 0) return static_cast<size_t>(-1);
        const size_t candidate = entry - 1;
        if (candidate < iso_foreground_unique_tile_count &&
            iso_foreground_unique_hashes[candidate] == hash &&
            iso_foreground_tiles_equal(
                tile,
                iso_foreground_unique_tiles + candidate * 32
            )) {
            return candidate;
        }
        bucket = (bucket + 1) & (iso_foreground_cache_bucket_count - 1);
    }
    return static_cast<size_t>(-1);
}

bool add_iso_foreground_cached_tile(const uint8_t* tile, uint32_t hash, size_t& tile_index) {
    if (iso_foreground_unique_tile_count >= max_iso_foreground_unique_tiles) return false;
    tile_index = iso_foreground_unique_tile_count++;
    for (size_t byte = 0; byte < 32; ++byte) {
        iso_foreground_unique_tiles[tile_index * 32 + byte] = tile[byte];
    }
    iso_foreground_unique_hashes[tile_index] = hash;
    size_t bucket = (hash ^ (hash >> 16)) & (iso_foreground_cache_bucket_count - 1);
    for (size_t probes = 0; probes < iso_foreground_cache_bucket_count; ++probes) {
        if (iso_foreground_cache_buckets[bucket] == 0) {
            iso_foreground_cache_buckets[bucket] = static_cast<uint16_t>(tile_index + 1);
            gbs::load_tiles(gbs::TileAsset {
                tile,
                1,
                static_cast<uint16_t>(iso_foreground_tile_base + tile_index),
                false
            });
            return true;
        }
        bucket = (bucket + 1) & (iso_foreground_cache_bucket_count - 1);
    }
    --iso_foreground_unique_tile_count;
    return false;
}

bool iso_foreground_scroll_delta(
    const gbs::IsoCamera& previous,
    const gbs::IsoCamera& current,
    int& tile_dx,
    int& tile_dy
) {
    const int dx = current.position_pixels.x - previous.position_pixels.x;
    const int dy = current.position_pixels.y - previous.position_pixels.y;
    if (previous.zoom_x256 != 256 || current.zoom_x256 != 256 ||
        previous.pan_offset_pixels.x != current.pan_offset_pixels.x ||
        previous.pan_offset_pixels.y != current.pan_offset_pixels.y ||
        previous.shake_offset_pixels.x != current.shake_offset_pixels.x ||
        previous.shake_offset_pixels.y != current.shake_offset_pixels.y ||
        dx % 8 != 0 || dy % 8 != 0 || dx <= -240 || dx >= 240 || dy <= -160 || dy >= 160) {
        return false;
    }
    tile_dx = dx / 8;
    tile_dy = dy / 8;
    return tile_dx != 0 || tile_dy != 0;
}

bool update_iso_foreground_incremental_map(
    const gbs::IsoCamera& previous,
    const gbs::IsoCamera& current
) {
    if (!iso_foreground_incremental_cache_ready) return false;
    int tile_dx = 0;
    int tile_dy = 0;
    if (!iso_foreground_scroll_delta(previous, current, tile_dx, tile_dy)) return false;

    constexpr int columns = 40;
    constexpr int rows = 24;
    constexpr int count = columns * rows;
    const bool forward = tile_dy * columns + tile_dx >= 0;
    for (int step = 0; step < count; ++step) {
        const int destination = forward ? step : count - 1 - step;
        const int source_x = destination % columns + tile_dx;
        const int source_y = destination / columns + tile_dy;
        if (source_x < 0 || source_x >= columns || source_y < 0 || source_y >= rows) {
            const uint8_t* tile = iso_foreground_surface_tiles + destination * 32;
            if (iso_foreground_tile_is_transparent(tile)) {
                iso_foreground_map[destination] = 0;
                continue;
            }
            const uint32_t hash = iso_foreground_tile_hash(tile);
            size_t tile_index = find_iso_foreground_cached_tile(tile, hash);
            if (tile_index == static_cast<size_t>(-1) &&
                !add_iso_foreground_cached_tile(tile, hash, tile_index)) {
                return false;
            }
            iso_foreground_map[destination] = static_cast<uint16_t>(
                iso_foreground_tilemap_base + tile_index + 1
            );
        } else {
            const int source = source_y * columns + source_x;
            iso_foreground_map[destination] = iso_foreground_map[source];
        }
    }
    return true;
}

bool upload_iso_foreground_tiles_if_changed(size_t tile_count) {
    if (tile_count == iso_foreground_uploaded_unique_tile_count &&
        iso_foreground_unique_tiles_match(tile_count)) {
        return true;
    }
    size_t first_tile = 0;
    const size_t common_tile_count = tile_count < iso_foreground_uploaded_unique_tile_count
        ? tile_count
        : iso_foreground_uploaded_unique_tile_count;
    while (first_tile < common_tile_count &&
           iso_foreground_tiles_equal(
               iso_foreground_unique_tiles + first_tile * 32,
               iso_foreground_uploaded_unique_tiles + first_tile * 32
           )) {
        ++first_tile;
    }
    if (first_tile == common_tile_count && tile_count >= iso_foreground_uploaded_unique_tile_count) {
        if (tile_count > first_tile) {
            gbs::load_tiles(gbs::TileAsset {
                iso_foreground_unique_tiles + first_tile * 32,
                static_cast<uint16_t>(tile_count - first_tile),
                static_cast<uint16_t>(iso_foreground_tile_base + first_tile),
                false
            });
        }
    } else if (tile_count > 0) {
        gbs::load_tiles(gbs::TileAsset {
            iso_foreground_unique_tiles,
            static_cast<uint16_t>(tile_count),
            static_cast<uint16_t>(iso_foreground_tile_base),
            false
        });
    }
    for (size_t tile = 0; tile < tile_count; ++tile) {
        for (size_t byte = 0; byte < 32; ++byte) {
            iso_foreground_uploaded_unique_tiles[tile * 32 + byte] =
                iso_foreground_unique_tiles[tile * 32 + byte];
        }
    }
    iso_foreground_uploaded_unique_tile_count = tile_count;
    return true;
}

bool update_iso_foreground_tilemap() {
    if (!iso_foreground_map_loaded) {
        if (!gbs::load_tilemap(
                gbs::BackgroundLayer::BG3,
                gbs::TileMapAsset { iso_foreground_map, 40, 24 }
            )) {
            return false;
        }
        for (size_t index = 0; index < iso_surface_tile_count; ++index) {
            iso_foreground_uploaded_map[index] = iso_foreground_map[index];
        }
        iso_foreground_map_loaded = true;
        return true;
    }
    for (int y = 0; y < 24; ++y) {
        for (int x = 0; x < 40; ++x) {
            const size_t index = static_cast<size_t>(y * 40 + x);
            if (iso_foreground_map[index] == iso_foreground_uploaded_map[index]) {
                continue;
            }
            if (!gbs::set_bg_tile(
                    gbs::BackgroundLayer::BG3,
                    x,
                    y,
                    40,
                    24,
                    iso_foreground_map[index]
                )) {
                return false;
            }
            iso_foreground_uploaded_map[index] = iso_foreground_map[index];
        }
    }
    return true;
}

bool iso_surface_camera_matches(const gbs::IsoCamera& left, const gbs::IsoCamera& right) {
    return left.position_pixels.x == right.position_pixels.x &&
        left.position_pixels.y == right.position_pixels.y &&
        left.zoom_x256 == right.zoom_x256 &&
        left.pan_offset_pixels.x == right.pan_offset_pixels.x &&
        left.pan_offset_pixels.y == right.pan_offset_pixels.y &&
        left.shake_offset_pixels.x == right.shake_offset_pixels.x &&
        left.shake_offset_pixels.y == right.shake_offset_pixels.y;
}

void upload_iso_surface_tile_run(gbs::IsoSurfaceTileRun run) {
    while (run.tile_count > 0) {
        const bool first_layer = run.first_tile < iso_surface_layer_tile_count;
        const size_t layer_offset = first_layer ? run.first_tile : run.first_tile - iso_surface_layer_tile_count;
        const size_t layer_remaining = iso_surface_layer_tile_count - layer_offset;
        const size_t upload_count = run.tile_count < layer_remaining ? run.tile_count : layer_remaining;
        const uint16_t destination = static_cast<uint16_t>(
            1 + layer_offset
        );
        gbs::load_bg_tiles_at_character_base(gbs::TileAsset {
            iso_surface_tiles + run.first_tile * 32,
            static_cast<uint16_t>(upload_count),
            destination,
            false
        }, first_layer ? 0 : iso_surface_second_tile_base / 512);
        run.first_tile += upload_count;
        run.tile_count -= upload_count;
    }
}

bool stream_resource_group(const gbs::ResourceBankGroup& group) {
    if (group.name == nullptr || group.bank_count > max_project_resource_banks) {
        return false;
    }
    if (gbs::resource_bank_cache_contains_group(bank_cache, group)) {
        const gbs::ResourceBankCacheGroupResult result = gbs::hot_swap_resource_bank_group_from_cache(
            resources,
            bank_reservation,
            bank_cache,
            group
        );
        if (result.success) {
            return true;
        }
    }
    const gbs::ResourceStreamResult result = gbs::stream_resource_bank_group_with_uploads(
        resources,
        bank_reservation,
        bank_scratch_reservation,
        group,
        gbastudio_isometric_project::resource_bank_upload_sources,
        gbastudio_isometric_project::resource_bank_upload_source_count
    );
    return result.success;
}

bool stream_resource_group_by_name(const char* name) {
    if (project.resource_bank_group_count == 0 || name == nullptr) {
        return false;
    }
    return stream_resource_group(gbs::resource_bank_group_from_isometric_project(
        project,
        name
    ));
}

bool tactical_surface_page_resources_ready(
    const gbs::IsoTacticalPresentationData& presentation,
    size_t page_index
) {
    if (presentation.surface_pages == nullptr ||
        page_index >= presentation.surface_page_count) {
        return false;
    }
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    const gbs::IsoTacticalSurfacePage& page = presentation.surface_pages[page_index];
    if (page.resource_bank_group_name == nullptr) {
        return false;
    }
    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_isometric_project(
        project,
        page.resource_bank_group_name
    );
    if (group.name == nullptr) {
        return false;
    }
    const bool active = bank_reservation.success &&
        gbs::resource_bank_name_equals(bank_reservation.group_name, group.name);
    const bool cached = gbs::resource_bank_cache_contains_group(bank_cache, group);
    return (active || cached) && gbs::dma_vblank_queue_count() == 0;
}

bool stream_resources_for_room(int room_index) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    if (!gbs::is_valid_isometric_room_index(project, room_index)) {
        return false;
    }

    return stream_resource_group(gbs::resource_bank_group_from_isometric_room(project, project.rooms[room_index]));
}

bool uses_indexed_surface(const gbs::IsometricRoomData& room) {
    if (room.baked_composition != nullptr) return true;
    if (room.tileset_render_offset_y_pixels == 0) return false;
    if (gbs::uses_authored_isometric_background(room) || room.tileset_tilemap == nullptr) return false;
    if (room.tileset_tiles != nullptr && room.tileset_tiles->color_depth == gbs::ColorDepth::Bpp8) return true;
    const auto& map = *room.tileset_tilemap;
    if (map.entries == nullptr) return false;
    for (size_t i = 0; i < static_cast<size_t>(map.width) * map.height; ++i) {
        if ((map.entries[i] & 0xf000u) != 0) return true;
    }
    return false;
}

void prefetch_room_resource_groups(int active_room, gbs::Vec2i camera_center_pixels) {
    if (!gbs::is_valid_isometric_room_index(project, active_room)) {
        return;
    }
    const gbs::IsometricRoomData& active_room_data = project.rooms[active_room];
    // An authored isometric surface is already resident for the active room.
    // Preloading arbitrary scene banks here can consume several visible frames
    // while the player is moving, without changing the current composition.
    // Tactical pages retain their explicit, atomic resource streaming path.
    if (gbs::uses_authored_isometric_background(active_room_data)) {
        return;
    }
    // This room owns the generated viewport's VRAM until it is unloaded.
    if (uses_indexed_surface(active_room_data)) {
        return;
    }
    const gbs::ResourceBankUploadSource* upload_sources =
        gbastudio_isometric_project::resource_bank_upload_source_count == 0
            ? nullptr
            : gbastudio_isometric_project::resource_bank_upload_sources;

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
        const gbs::IsometricRoomData& room_data = project.rooms[room_index];
        const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_isometric_room(project, room_data);
        if (group.name == nullptr ||
            group.bank_count == 0 ||
            group.bank_count > max_project_resource_banks ||
            gbs::resource_bank_name_equals(group.name, bank_reservation.group_name)) {
            continue;
        }

        const gbs::Rect area {
            0,
            0,
            room_data.width_tiles * room_data.grid.tile_width_pixels,
            room_data.height_tiles * room_data.grid.tile_height_pixels
        };
        for (size_t bank_index = 0; bank_index < group.bank_count && request_count < max_project_resource_banks; ++bank_index) {
            isometric_prefetch_requests[request_count++] = gbs::ResourceBankPrefetchRequest {
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
        bank_cache,
        isometric_prefetch_requests,
        request_count,
        camera_center_pixels,
        gbs::frame_count(),
        upload_sources,
        gbastudio_isometric_project::resource_bank_upload_source_count,
        prefetch_policy
    );
}

bool reserve_resources(int initial_room, const gbs::IsometricRoomData& room_data) {
    gbs::init_resource_manager(resources);
    if (project.resource_bank_group_count > 0) {
        return stream_resources_for_room(initial_room);
    }

    if (project.resource_bank_count > 0) {
        if (project.resource_bank_count > max_project_resource_banks) {
            return false;
        }
        return gbs::reserve_resource_banks(
            resources,
            gbs::resource_bank_batch_from_isometric_project(project),
            bank_reservation
        );
    }

    const gbs::ResourceBatch batch {
        project.tile_assets,
        project.tile_asset_count,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count,
        static_cast<uint16_t>(room_data.actor_count),
        1
    };
    return gbs::reserve_resource_batch(resources, batch, resource_reservation);
}

void load_assets(const gbs::VideoComposition& video) {
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
    gbs::apply_video_composition(video);
}

bool load_iso_tactical_presentation_layers(
    const gbs::IsoTacticalPresentationData& presentation,
    const gbs::TileMapAsset* surface_override = nullptr
) {
    bool loaded = true;
    if (gbs::iso_tactical_capability_enabled(presentation, gbs::IsoTacticalCapability::Surface)) {
        const gbs::TileMapAsset* surface = surface_override != nullptr ? surface_override : presentation.surface;
        loaded = surface != nullptr && gbs::load_tilemap(gbs::BackgroundLayer::BG2, *surface) && loaded;
    }
    if (gbs::iso_tactical_capability_enabled(presentation, gbs::IsoTacticalCapability::GridOverlay)) {
        loaded = presentation.grid != nullptr &&
            gbs::load_tilemap(gbs::BackgroundLayer::BG1, *presentation.grid) && loaded;
    }
    if (gbs::iso_tactical_capability_enabled(presentation, gbs::IsoTacticalCapability::Hud)) {
        loaded = presentation.hud != nullptr &&
            gbs::load_tilemap(gbs::BackgroundLayer::BG0, *presentation.hud) && loaded;
    }
    return loaded;
}

size_t append_iso_tactical_metasprite(
    const gbs::MetaSprite* metasprite,
    gbs::IsoCoord tile,
    const gbs::IsoCamera& camera,
    const gbs::IsoGridConfig& grid,
    gbs::IsoDrawItem* draw_items,
    size_t draw_count,
    size_t draw_capacity,
    uint16_t source_index,
    uint8_t priority,
    bool center_on_tile = false,
    gbs::Vec2i visual_offset = {0, 0}
) {
    if (metasprite == nullptr || draw_items == nullptr || draw_count >= draw_capacity) {
        return draw_count;
    }
    auto offset = center_on_tile ? gbs::iso_metasprite_diamond_center_offset(*metasprite, grid) : gbs::Vec2i {0, 0};
    offset.x += visual_offset.x;
    offset.y += visual_offset.y;
    const size_t appended = gbs::build_iso_metasprite_draw_list(
        *metasprite,
        tile,
        offset,
        camera,
        draw_items + draw_count,
        draw_capacity - draw_count,
        source_index,
        priority,
        grid
    );
    return draw_count + appended;
}

void publish_iso_tactical_draw_witness(
    const gbs::IsoDrawItem* draw_items,
    size_t draw_count,
    const gbs::EventState& event_state
) {
    if (draw_items == nullptr) {
        return;
    }
    gbs::RuntimePhysicalTelemetry sample = gbs::capture_runtime_physical_telemetry(resources, event_state);
    uint32_t frame_obj_tiles = 0;
    for (size_t index = 0; index < draw_count; ++index) {
        const gbs::IsoDrawItem& item = draw_items[index];
        const uint32_t width_tiles = (static_cast<uint32_t>(item.width) + 7u) / 8u;
        const uint32_t height_tiles = (static_cast<uint32_t>(item.height) + 7u) / 8u;
        frame_obj_tiles += width_tiles * height_tiles;
    }
    if (sample.obj_tiles < frame_obj_tiles) {
        sample.obj_tiles = frame_obj_tiles;
    }
    sample.oam = sample.oam > draw_count ? sample.oam : static_cast<uint32_t>(draw_count);
    const uint32_t total_tiles = sample.bg_tiles + sample.obj_tiles;
    const uint32_t vram_bytes = total_tiles * static_cast<uint32_t>(gbs::bytes_per_4bpp_tile);
    if (sample.vram_bytes < vram_bytes) {
        sample.vram_bytes = vram_bytes;
    }
    gbs::debug_set_runtime_physical_telemetry(sample);
}

gbs::Vec2i input_to_iso_delta(gbs::InputState input) {
    // Exploration and the tactical selector use the same screen-oriented directions.
    return input_to_tactical_cursor_delta(input);
}

int32_t iso_exploration_step(gbs::Vec2i delta, const gbs::IsoGridConfig& grid) {
    // Preserve the speed along a tile edge. Compensate for the projected diamond:
    // horizontal (x,-x) is twice as wide; vertical (x,x) twice as tall.
    if (delta.x == 0 || delta.y == 0) return gbs::iso_free_movement_step_x256;
    int edge = 0;
    const int squared = grid.tile_width_pixels * grid.tile_width_pixels + grid.tile_height_pixels * grid.tile_height_pixels;
    while ((edge + 1) * (edge + 1) <= squared) ++edge;
    const int axis = delta.x == delta.y ? grid.tile_height_pixels : grid.tile_width_pixels;
    return axis > 0 ? (gbs::iso_free_movement_step_x256 * edge + axis) / (2 * axis) : 0;
}

bool update_player_tile(gbs::IsoActor* actors, const gbs::IsometricRoomData& room_data, gbs::InputState input) {
    gbs::Vec2i delta {int(input.is_held(gbs::ButtonRight)) - int(input.is_held(gbs::ButtonLeft)),
        int(input.is_held(gbs::ButtonDown)) - int(input.is_held(gbs::ButtonUp))};
    if (delta.x != 0) delta.y = 0;
    if (delta.x != 0 || delta.y != 0) {
        return gbs::move_iso_actor_by_delta(
            gbs::iso_tilemap_from_room(room_data),
            actors[0],
            delta,
            actors,
            room_data.actor_count,
            0
        );
    }
    return false;
}

bool update_player_free(gbs::IsoActor* actors, const gbs::IsometricRoomData& room_data, gbs::InputState input) {
    const gbs::Vec2i delta = input_to_iso_delta(input);
    if (room_data.actor_count == 0 || (delta.x == 0 && delta.y == 0)) {
        return false;
    }
    return gbs::move_iso_actor_by_free_delta(
        gbs::iso_tilemap_from_room(room_data),
        actors[0],
        delta,
        actors,
        room_data.actor_count,
        0,
        iso_exploration_step(delta, room_data.grid)
    );
}

void update_follow_actor(
    gbs::IsoActor* actors,
    gbs::IsoActorAnimationState* actor_animation_states,
    const gbs::IsometricRoomData& room_data
) {
    if (room_data.actor_count < 2 || !actors[1].follow_player) {
        return;
    }
    gbs::IsoPathStep step = gbs::find_iso_path_step_astar(
        gbs::iso_tilemap_from_room(room_data),
        actors[1].tile,
        actors[0].tile,
        actors,
        room_data.actor_count,
        1,
        64
    );
    const bool moved = step.found && gbs::move_iso_actor_by_delta(
            gbs::iso_tilemap_from_room(room_data),
            actors[1],
            step.delta_tile,
            actors,
            room_data.actor_count,
            1
        );
    gbs::set_iso_actor_motion(actor_animation_states[1], step.delta_tile, moved);
}

bool iso_tiles_adjacent_or_same(gbs::IsoCoord a, gbs::IsoCoord b) {
    int dx = a.x - b.x;
    int dy = a.y - b.y;
    if (dx < 0) {
        dx = -dx;
    }
    if (dy < 0) {
        dy = -dy;
    }
    return a.z == b.z && dx + dy <= 1;
}

gbs::EventScript iso_exploration_candidate_script(const gbs::IsometricRoomData& room,
    const gbs::IsoActor* actors, size_t count, size_t index) {
    if (actors == nullptr || count == 0 || index >= count) return {};
    if (index == 0) return gbs::iso_tile_event_script_for(room, actors[0].tile);
    if (!actors[index].visible || !iso_tiles_adjacent_or_same(actors[0].tile, actors[index].tile)) return {};
    return gbs::iso_actor_interact_event_script_for(room, index);
}

void cycle_iso_exploration_target(const gbs::IsometricRoomData& room,
    const gbs::IsoActor* actors, size_t count, gbs::IsoCursorState& cursor) {
    size_t current = 0;
    if (cursor.active) for (size_t i = 0; i < count; ++i) {
        if (gbs::iso_coord_equals(cursor.tile, actors[i].tile)) { current = i; break; }
    }
    for (size_t offset = 1; offset <= count; ++offset) {
        const size_t index = (current + offset) % count;
        if (gbs::has_event_script(iso_exploration_candidate_script(room, actors, count, index))) {
            cursor.tile = actors[index].tile;
            cursor.active = true;
            return;
        }
    }
    cursor.active = false;
}

gbs::EventScript iso_exploration_interact_script(const gbs::IsometricRoomData& room,
    const gbs::IsoActor* actors, size_t count, const gbs::IsoCursorState& cursor) {
    if (cursor.active) {
        for (size_t i = 0; i < count; ++i) if (gbs::iso_coord_equals(cursor.tile, actors[i].tile)) {
            return iso_exploration_candidate_script(room, actors, count, i);
        }
        return {}; // Stale/remote selection cannot execute a tile event.
    }
    for (size_t i = 1; i < count; ++i) {
        const auto script = iso_exploration_candidate_script(room, actors, count, i);
        if (gbs::has_event_script(script)) return script;
    }
    return iso_exploration_candidate_script(room, actors, count, 0);
}

void update_iso_actor_player_hit_scripts(
    const gbs::IsometricRoomData& room,
    gbs::EventState& event_state
) {
    if (actor_count == 0) {
        for (bool& touching : iso_actor_touching_player) touching = false;
        return;
    }
    for (size_t index = 1; index < actor_count; ++index) {
        const bool touching = gbs::iso_coord_equals(actors[0].tile, actors[index].tile);
        if (!touching) {
            iso_actor_touching_player[index] = false;
            continue;
        }
        if (iso_actor_touching_player[index]) continue;
        iso_actor_touching_player[index] = true;
        gbs::run_event_script(
            event_state,
            gbs::iso_room_hit_script_for_collision_group(
                room,
                actors[index].collision_group
            )
        );
    }
    iso_actor_touching_player[0] = false;
    for (size_t index = actor_count; index < max_actor_count; ++index) {
        iso_actor_touching_player[index] = false;
    }
}

void apply_iso_event_camera(gbs::IsoCamera& camera, gbs::EventState& event_state) {
    if (event_state.camera_changed) {
        camera.follow_enabled = event_state.camera_follow_player;
        if (!event_state.camera_follow_player) {
            camera.position_pixels = gbs::Vec2i { event_state.camera_x, event_state.camera_y };
        }
        event_state.camera_changed = false;
    }
    if (event_state.camera_property_changed) {
        switch (event_state.camera_property) {
        case 0:
            camera.follow_enabled = false;
            camera.position_pixels.x = event_state.camera_property_value;
            break;
        case 1:
            camera.follow_enabled = false;
            camera.position_pixels.y = event_state.camera_property_value;
            break;
        case 2:
            camera.follow_enabled = event_state.camera_property_value != 0;
            break;
        case 3:
            camera.follow_enabled = false;
            camera.position_pixels.x += event_state.camera_property_value;
            break;
        case 4:
            camera.follow_enabled = false;
            camera.position_pixels.y += event_state.camera_property_value;
            break;
        case 5:
            gbs::set_iso_camera_zoom(camera, event_state.camera_property_value * 256 / 100);
            break;
        case 6:
            camera.smoothing_x256 = static_cast<uint16_t>(gbs::clamp_int(event_state.camera_property_value * 256 / 100, 1, 256));
            break;
        case 7:
            camera.pan_offset_pixels.x = event_state.camera_property_value;
            break;
        case 8:
            camera.pan_offset_pixels.y = event_state.camera_property_value;
            break;
        case 9:
            camera.dead_zone_screen_pixels.width = gbs::clamp_int(event_state.camera_property_value, 0, 240);
            camera.dead_zone_screen_pixels.x = (240 - camera.dead_zone_screen_pixels.width) / 2;
            break;
        case 10:
            camera.dead_zone_screen_pixels.height = gbs::clamp_int(event_state.camera_property_value, 0, 160);
            camera.dead_zone_screen_pixels.y = (160 - camera.dead_zone_screen_pixels.height) / 2;
            break;
        default:
            // A propriedade 11 fica reservada para rotacao affine futura.
            break;
        }
        event_state.camera_property_changed = false;
        event_state.camera_property = 0;
        event_state.camera_property_value = 0;
    }
    if (event_state.camera_move_changed) {
        camera.follow_enabled = false;
        camera.position_pixels.x += event_state.camera_delta_x;
        camera.position_pixels.y += event_state.camera_delta_y;
        event_state.camera_move_changed = false;
        event_state.camera_delta_x = 0;
        event_state.camera_delta_y = 0;
    }
    if (event_state.camera_bounds_x_changed) {
        camera.bounds_enabled = true;
        camera.bounds_pixels.x = event_state.camera_bounds_min_x;
        camera.bounds_pixels.width = event_state.camera_bounds_max_x - event_state.camera_bounds_min_x;
        event_state.camera_bounds_x_changed = false;
    }
    if (event_state.camera_bounds_y_changed) {
        camera.bounds_enabled = true;
        camera.bounds_pixels.y = event_state.camera_bounds_min_y;
        camera.bounds_pixels.height = event_state.camera_bounds_max_y - event_state.camera_bounds_min_y;
        event_state.camera_bounds_y_changed = false;
    }
    if (event_state.camera_shake_frames > 0 && event_state.camera_shake_magnitude > 0) {
        gbs::start_iso_camera_shake(
            camera,
            static_cast<uint16_t>(event_state.camera_shake_magnitude),
            static_cast<uint16_t>(event_state.camera_shake_frames),
            gbs::frame_count() + 1
        );
        event_state.camera_shake_frames = 0;
        event_state.camera_shake_magnitude = 0;
    }
    gbs::clamp_iso_camera(camera);
}

void consume_link_event_outputs(gbs::EventState& event_state) {
    const int request = event_state.link_request;
    if (request == 0) {
        return;
    }
    event_state.link_request = 0;
    if (request == 1 || request == 2) {
        if (open_link(
                request == 1 ? gbs::LinkRole::Host : gbs::LinkRole::Join,
                static_cast<uint16_t>(event_state.link_timeout_frames)
            ) && event_state.link_script >= 0 && static_cast<size_t>(event_state.link_script) < project.script_count) {
            gbs::run_event_script(event_state, project.scripts[event_state.link_script]);
        }
        return;
    }
    if (request == 3) {
        close_link();
        return;
    }
    if (request == 4) {
        event_state.link_last_transfer_ok = transfer_link(static_cast<uint8_t>(event_state.link_transfer_value));
        event_state.link_last_received_value = received_link_value();
        if (event_state.link_last_transfer_ok && event_state.link_transfer_variable >= 0 && event_state.link_transfer_variable < 16) {
            event_state.variables[event_state.link_transfer_variable] = event_state.link_last_received_value;
        }
    }
}

void consume_event_state(gbs::EventState& event_state) {
    gbs::consume_event_palette_changes(
        event_state,
        project.bg_palettes,
        project.bg_palette_count,
        project.obj_palettes,
        project.obj_palette_count
    );
    // Palette uploads may replace BG palette entry 0. Restore the isometric
    // backdrop afterwards so transparent diamond corners do not become black.
    gbs::set_backdrop_color(project.backdrop_color);
    consume_link_event_outputs(event_state);
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
    if (event_state.fade_changed) {
        gbs::start_visual_effect_phase(
            visual_effects,
            gbs::VisualEffectKind::Fade,
            gbs::VisualEffectTarget::Screen,
            event_state.fade_frames,
            100,
            event_state.fade_direction > 0
        );
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
}

bool run_button_event_binding() {
    if (!gbs::update_button_event_bindings(event_state)) {
        return false;
    }
    const int script_index = event_state.last_script;
    const bool overrides_default = event_state.last_button_binding_overrides_default;
    event_state.last_script = -1;
    event_state.last_button_binding_overrides_default = false;
    if (script_index >= 0 && static_cast<size_t>(script_index) < project.script_count) {
        gbs::run_event_script(event_state, project.scripts[script_index]);
        consume_event_state(event_state);
    }
    return overrides_default;
}

// Compact persistent state fits the universal save envelope together with the
// scene. Room-authored unit attributes are rebuilt before restoring mutable HP.
struct IsometricTacticalSaveData {
    uint32_t signature = 0x31544349; // ICT1
    uint16_t turn_number = 1;
    uint8_t active_team = 0;
    uint8_t active_unit_index = 0xff;
    uint8_t selected_unit_index = 0xff;
    uint8_t selected = 0; // bits 0-3: selected/moved/menu/attack; 4-5: menu index (ICT1 compatible).
    uint8_t outcome = 0;
    uint8_t hp[max_actor_count] = {};
    uint8_t moving = 0;
    uint8_t moving_actor_index = 0xff;
    uint8_t path_length = 0;
    uint8_t step_index = 0;
    uint8_t step_delay = 0;
    int16_t path[gbs::max_iso_tactical_move_steps][3] = {};
    int32_t from_x256 = 0;
    int32_t from_y256 = 0;
    int32_t to_x256 = 0;
    int32_t to_y256 = 0;
    int32_t actor_x256 = 0;
    int32_t actor_y256 = 0;
};

struct IsometricMenuSaveData {
    gbs::IsometricSaveData scene {};
    IsometricTacticalSaveData tactical {};
};
static_assert(sizeof(IsometricMenuSaveData) <= gbs::universal_save_payload_capacity,
    "tactical save payload exceeds the universal envelope");
IsometricTacticalSaveData restored_tactical_save {};
bool has_restored_tactical_save = false;

IsometricTacticalSaveData capture_tactical_save(const gbs::IsoActor* saved_actors, size_t count) {
    IsometricTacticalSaveData saved {};
    saved.turn_number = tactical_state.turn_number;
    saved.active_team = tactical_state.active_team;
    saved.active_unit_index = static_cast<uint8_t>(tactical_state.active_unit_index);
    saved.selected_unit_index = static_cast<uint8_t>(tactical_state.selected_unit_index);
    saved.selected = (tactical_state.selected ? 1 : 0) | (tactical_state.moved_this_turn ? 2 : 0)
        | (tactical_state.menu_open ? 4 : 0) | (tactical_state.attack_mode ? 8 : 0)
        | ((tactical_state.menu_index & 3) << 4);
    saved.outcome = tactical_state.outcome;
    for (size_t i = 0; i < max_actor_count; ++i) saved.hp[i] = tactical_state.units[i].hp;
    saved.moving = tactical_state.moving;
    saved.moving_actor_index = static_cast<uint8_t>(tactical_state.moving_actor_index);
    saved.path_length = tactical_state.move_path.length;
    saved.step_index = tactical_state.move_step_index;
    saved.step_delay = tactical_state.move_step_delay;
    for (size_t i = 0; i < saved.path_length && i < gbs::max_iso_tactical_move_steps; ++i) {
        saved.path[i][0] = static_cast<int16_t>(tactical_state.move_path.tiles[i].x);
        saved.path[i][1] = static_cast<int16_t>(tactical_state.move_path.tiles[i].y);
        saved.path[i][2] = static_cast<int16_t>(tactical_state.move_path.tiles[i].z);
    }
    saved.from_x256 = tactical_state.move_from_x256;
    saved.from_y256 = tactical_state.move_from_y256;
    saved.to_x256 = tactical_state.move_to_x256;
    saved.to_y256 = tactical_state.move_to_y256;
    if (tactical_state.moving_actor_index < count) {
        saved.actor_x256 = saved_actors[tactical_state.moving_actor_index].position_x256;
        saved.actor_y256 = saved_actors[tactical_state.moving_actor_index].position_y256;
    }
    return saved;
}

bool read_isometric_menu_save(const gbs::UniversalSaveData& data, gbs::IsometricSaveData& scene,
    IsometricTacticalSaveData* tactical = nullptr) {
    // Adventure scenes retain their existing native payload.
    if (data.payload_size == sizeof(scene)) {
        return gbs::read_universal_save_payload(data, gbs::UniversalSaveRuntime::Isometric, &scene, sizeof(scene));
    }
    IsometricMenuSaveData saved {};
    if (!gbs::read_universal_save_payload(data, gbs::UniversalSaveRuntime::Isometric, &saved, sizeof(saved)) ||
        saved.tactical.signature != 0x31544349 || saved.tactical.turn_number == 0 ||
        saved.tactical.active_team > 1 || saved.tactical.outcome > IsoTacticalOutcomeDefeat ||
        saved.tactical.path_length > gbs::max_iso_tactical_move_steps ||
        saved.tactical.step_index > saved.tactical.path_length || saved.tactical.step_delay > 5 ||
        (saved.tactical.moving && saved.tactical.moving_actor_index >= saved.scene.actor_count)) return false;
    scene = saved.scene;
    if (tactical != nullptr) *tactical = saved.tactical;
    return true;
}

void apply_tactical_save(const IsometricTacticalSaveData& saved, gbs::IsoActor* saved_actors, size_t count) {
    tactical_state.turn_number = saved.turn_number;
    tactical_state.active_team = saved.active_team;
    tactical_state.active_unit_index = saved.active_unit_index < max_actor_count ? saved.active_unit_index : no_tactical_unit_index;
    tactical_state.selected_unit_index = saved.selected_unit_index < max_actor_count ? saved.selected_unit_index : no_tactical_unit_index;
    tactical_state.selected = (saved.selected & 1) && tactical_state.selected_unit_index != no_tactical_unit_index;
    tactical_state.moved_this_turn = (saved.selected & 2) != 0;
    tactical_state.menu_open = tactical_state.selected && (saved.selected & 4) != 0;
    tactical_state.attack_mode = (saved.selected & 8) != 0;
    tactical_state.menu_index = ((saved.selected >> 4) & 3) < 3 ? ((saved.selected >> 4) & 3) : 0;
    tactical_state.outcome = saved.outcome;
    for (size_t i = 0; i < max_actor_count; ++i) {
        auto& unit = tactical_state.units[i];
        unit.hp = saved.hp[i] < unit.max_hp ? saved.hp[i] : unit.max_hp;
    }
    tactical_state.moving = saved.moving && saved.moving_actor_index < count;
    tactical_state.moving_actor_index = saved.moving_actor_index < count ? saved.moving_actor_index : no_tactical_unit_index;
    tactical_state.move_path.found = tactical_state.moving;
    tactical_state.move_path.length = saved.path_length;
    tactical_state.move_step_index = saved.step_index;
    tactical_state.move_step_delay = saved.step_delay;
    for (size_t i = 0; i < saved.path_length; ++i) {
        tactical_state.move_path.tiles[i] = gbs::IsoCoord { saved.path[i][0], saved.path[i][1], saved.path[i][2] };
    }
    tactical_state.move_from_x256 = saved.from_x256;
    tactical_state.move_from_y256 = saved.from_y256;
    tactical_state.move_to_x256 = saved.to_x256;
    tactical_state.move_to_y256 = saved.to_y256;
    if (tactical_state.moving) {
        saved_actors[saved.moving_actor_index].position_x256 = saved.actor_x256;
        saved_actors[saved.moving_actor_index].position_y256 = saved.actor_y256;
        saved_actors[saved.moving_actor_index].position_initialized = true;
    }
}

bool capture_isometric_runtime_state(gbs::UniversalSaveData& universal_save, int current_room, const gbs::IsoActor* actors, size_t actor_count,
    const gbs::IsoCamera& camera, const gbs::EventState& event_state, const gbs::IsoCursorState& cursor) {
    IsometricMenuSaveData menu_save {};
    gbs::IsometricSaveData& save_data = menu_save.scene;
    if (tactical_state.enabled) menu_save.tactical = capture_tactical_save(actors, actor_count);
    gbs::capture_isometric_save_data(
        save_data,
        current_room,
        actors,
        actor_count,
        camera,
        gbs::frame_count(),
        0,
        &cursor
    );
    static_assert(sizeof(gbs::IsometricSaveData) <= gbs::universal_save_payload_capacity, "isometric save payload exceeds the universal envelope");
    const int player_x = save_data.actor_count > 0 ? save_data.actors[0].tile_x : 0;
    const int player_y = save_data.actor_count > 0 ? save_data.actors[0].tile_y : 0;
    if (!gbs::make_universal_save_data(
            universal_save,
            gbs::UniversalSaveRuntime::Isometric,
            current_room,
            player_x,
            player_y,
            camera.position_pixels.x,
            camera.position_pixels.y,
            event_state.variables,
            gbs::universal_save_variable_count,
            event_state.inventory,
            gbs::universal_save_inventory_count,
            event_state.equipped_items,
            gbs::universal_save_equipment_slot_count,
            save_data.play_time_frames,
            save_data.flags,
            &menu_save,
            tactical_state.enabled ? sizeof(menu_save) : sizeof(save_data))) {
        return false;
    }
    return true;
}

void persist_isometric_runtime_state(int current_room, const gbs::IsoActor* actors, size_t actor_count,
    const gbs::IsoCamera& camera, const gbs::EventState& event_state, const gbs::IsoCursorState& cursor) {
    if (!gbastudio_isometric_project::save_enabled) return;
    gbs::UniversalSaveData universal_save {};
    if (!capture_isometric_runtime_state(universal_save, current_room, actors, actor_count, camera, event_state, cursor)) return;
    ++isometric_save_sequence;
    gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "ISOMETRIC",
        gbs::frame_count(),
        isometric_save_sequence,
        static_cast<uint16_t>(current_room),
        0
    );
    gbs::write_save_slot_record(gbastudio_isometric_project::save_bank, 0, &universal_save, sizeof(universal_save), metadata, isometric_save_sequence);
}

bool restore_isometric_runtime_state(
    int& current_room,
    const gbs::IsometricRoomData*& room_data,
    gbs::IsoActor* actors,
    size_t actor_capacity,
    size_t& actor_count,
    gbs::IsoCamera& camera,
    gbs::EventState& event_state,
    gbs::IsoCursorState& cursor,
    int slot_index = -1
) {
    if (!gbastudio_isometric_project::save_enabled) {
        return false;
    }
    if (slot_index < 0) {
        slot_index = gbs::find_latest_save_slot(gbastudio_isometric_project::save_bank);
    }
    if (slot_index < 0 || static_cast<size_t>(slot_index) >= gbastudio_isometric_project::save_bank.slot_count) {
        return false;
    }
    gbs::UniversalSaveData universal_save {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_isometric_project::save_bank,
        static_cast<size_t>(slot_index),
        &universal_save,
        sizeof(universal_save),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok ||
        bytes_read != sizeof(universal_save) ||
        !gbs::is_valid_universal_save_data(universal_save)) {
        return false;
    }
    gbs::IsometricSaveData save_data {};
    has_restored_tactical_save = universal_save.payload_size == sizeof(IsometricMenuSaveData);
    if (!read_isometric_menu_save(universal_save, save_data, &restored_tactical_save)) {
        return false;
    }
    if (!gbs::apply_isometric_save_data(project, save_data, actors, actor_capacity, actor_count, camera, event_state, &cursor)) {
        return false;
    }
    if (!gbs::read_universal_save_common_state(
            universal_save,
            event_state.variables,
            gbs::universal_save_variable_count,
            event_state.inventory,
            gbs::universal_save_inventory_count,
            event_state.equipped_items,
            gbs::universal_save_equipment_slot_count)) {
        return false;
    }
    if (!stream_resources_for_room(event_state.current_room)) {
        return false;
    }
    current_room = event_state.current_room;
    room_data = &project.rooms[current_room];
    gbs::apply_video_composition(room_data->video.affine_enabled ? room_data->video : project.video);
    gbs::SaveInfo info = gbs::inspect_save_slot(gbastudio_isometric_project::save_bank, static_cast<size_t>(slot_index));
    isometric_save_sequence = info.sequence;
    return true;
}

bool apply_iso_event_room_change(
    const gbs::IsometricProjectData& project_data,
    int& current_room,
    const gbs::IsometricRoomData*& room_data,
    gbs::IsoActor* actors,
    size_t actor_capacity,
    size_t& actor_count,
    gbs::IsoCamera& camera,
    gbs::EventState& event_state,
    gbs::IsoCursorState& cursor
) {
    if (event_state.current_room == current_room) {
        return false;
    }
    if (!gbs::is_valid_isometric_room_index(project_data, event_state.current_room)) {
        event_state.current_room = current_room;
        return false;
    }

    int target_room = event_state.current_room;
    int target_tile_x = event_state.player_x;
    int target_tile_y = event_state.player_y;
    if (!stream_resources_for_room(target_room)) {
        event_state.current_room = current_room;
        return false;
    }
    gbs::run_event_script(event_state, room_data->on_exit);
    current_room = target_room;
    room_data = &project_data.rooms[current_room];
    gbs::apply_video_composition(room_data->video.affine_enabled ? room_data->video : project_data.video);
    for (size_t index = 0; index < actor_capacity; ++index) {
        actors[index] = gbs::IsoActor {};
        iso_actor_touching_player[index] = false;
    }
    for (size_t index = 0; index < room_data->actor_count && index < actor_capacity; ++index) {
        actors[index] = room_data->actors[index];
    }
    actor_count = room_data->actor_count < actor_capacity ? room_data->actor_count : actor_capacity;
    if (room_data->actor_count > 0 && (target_tile_x != 0 || target_tile_y != 0)) {
        set_iso_entry_position(actors[0], *room_data, target_tile_x, target_tile_y);
    }
    for (size_t index = 0; index < actor_count; ++index) {
        gbs::initialize_iso_actor_position(actors[index]);
    }
    camera = room_data->camera_start;
    event_state.current_room = current_room;
    if (room_data->actor_count > 0) {
        event_state.player_x = actors[0].tile.x;
        event_state.player_y = actors[0].tile.y;
        cursor.tile = gbs::iso_room_cursor_start(*room_data, actors, actor_count);
        cursor.active = false;
    }
    gbs::run_event_script(event_state, room_data->on_enter);
    for (size_t index = 0; index < room_data->actor_count && index < actor_capacity; ++index) {
        gbs::run_event_script(event_state, gbs::iso_actor_start_event_script_for(*room_data, index));
    }
    gbs::consume_iso_actor_event_commands(actors, actor_count, event_state);
    apply_iso_event_camera(camera, event_state);
    return true;
}

} // namespace

int initialize_isometric_runtime() {
    gbs::init();
    gbs::reset_runtime_telemetry();
    runtime_room_change_count = 0;
    gbs::set_backdrop_color(project.backdrop_color);
    if (!gbs::is_valid_isometric_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    gbs::init_event_state(event_state);
    gbs::init_visual_effects(visual_effects);
    current_room = project.initial_room;
    entry_x = 0;
    entry_y = 0;
    runtime_entry = false;
    restore_entry = false;
    restore_slot_index = -1;
#ifdef GBS_MULTI_RUNTIME
    restore_entry = gbs::consume_runtime_save_restore(gbs::RuntimeKind::Isometric, restore_slot_index);
    if (!restore_entry) {
        runtime_entry = gbs::consume_runtime_transition(
            gbs::RuntimeKind::Isometric,
            event_state,
            current_room,
            entry_x,
            entry_y
        );
    }
#endif
    if (!gbs::is_valid_isometric_room_index(project, current_room)) {
        return -1;
    }
    room_data = &project.rooms[current_room];
    if (room_data->actor_count > max_actor_count ||
        room_data->trigger_count > max_room_triggers ||
        !reserve_resources(current_room, *room_data)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    load_assets(room_data->video.affine_enabled ? room_data->video : project.video);
    // load_assets uploads the room palettes, including palette entry 0. The
    // backdrop must be applied after that upload to remain visible through
    // transparent atlas corners.
    gbs::set_backdrop_color(project.backdrop_color);
    for (size_t index = 0; index < max_actor_count; ++index) {
        actors[index] = gbs::IsoActor {};
        actor_animation_states[index] = gbs::IsoActorAnimationState {};
        iso_actor_touching_player[index] = false;
    }
    for (size_t index = 0; index < room_data->actor_count; ++index) {
        actors[index] = room_data->actors[index];
    }
    if (runtime_entry && room_data->actor_count > 0) {
        set_iso_entry_position(actors[0], *room_data, entry_x, entry_y);
    }
    actor_count = room_data->actor_count;
    for (size_t index = 0; index < actor_count; ++index) {
        gbs::initialize_iso_actor_position(actors[index]);
    }
    for (size_t index = 0; index < max_draw_count; ++index) draw_items[index] = gbs::IsoDrawItem {};
    camera = room_data->camera_start;
    iso_camera_zone_active = false;
    tactical_presentation_maps_loaded = false;
    tactical_presentation_load_failed = false;
    tactical_surface_page_index = gbs::iso_tactical_surface_page_none;
    tactical_surface_pending_page_index = gbs::iso_tactical_surface_page_none;
    tactical_surface_requested_page_index = gbs::iso_tactical_surface_page_none;
    tactical_surface_page_load_started = false;
    tactical_presentation_audio_started = false;
    cursor = gbs::iso_cursor_from_room(*room_data, actors, actor_count);
    tactical_state = IsoTacticalRuntimeState {};
    init_iso_tactical_state(tactical_state, *room_data, actor_count);
    initialize_iso_tactical_cursor(tactical_state, actors, actor_count, cursor);
    for (size_t index = 0; index < max_room_triggers; ++index) {
        trigger_states[index] = gbs::RuntimeTriggerState {};
    }
    gbs::init_dialogue(dialogue);
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(project.rooms[current_room].name, true);
    init_iso_surface_map();
    gbs::reset_iso_surface_tile_cache(iso_surface_cache);
    event_state.current_room = current_room;
    event_state.player_x = actors[0].tile.x;
    event_state.player_y = actors[0].tile.y;
    bool restored_save = false;
    if (restore_entry || !runtime_entry) {
        restored_save = restore_isometric_runtime_state(
            current_room,
            room_data,
            actors,
            max_actor_count,
            actor_count,
            camera,
            event_state,
            cursor,
            restore_entry ? restore_slot_index : -1
        );
    }
    if (restore_entry && !restored_save) {
        return -1;
    }
    if (restored_save) {
        init_iso_tactical_state(tactical_state, *room_data, actor_count);
        if (tactical_state.enabled && has_restored_tactical_save) apply_tactical_save(restored_tactical_save, actors, actor_count);
        if (tactical_state.enabled) {
            cursor.active = true;
            if (tactical_state.active_unit_index != no_tactical_unit_index &&
                tactical_state.active_unit_index < max_actor_count) {
                const size_t active_actor_index = tactical_state.units[tactical_state.active_unit_index].actor_index;
                if (active_actor_index < actor_count && !gbs::iso_coord_in_bounds(gbs::iso_tilemap_from_room(*room_data), cursor.tile)) {
                    cursor.tile = actors[active_actor_index].tile;
                }
            }
        }
    }
    gbs::UniversalSaveData paused_data {};
    const bool resumed_pause = runtime_entry && gbs::consume_suspended_runtime_resume(gbs::UniversalSaveRuntime::Isometric, current_room, paused_data, &tactical_state, sizeof(tactical_state));
    if (resumed_pause) {
        gbs::IsometricSaveData state {};
        if (!read_isometric_menu_save(paused_data, state) ||
            !gbs::apply_isometric_save_data(project, state, actors, max_actor_count, actor_count, camera, event_state, &cursor) ||
            !gbs::restore_suspended_common_state(paused_data, event_state)) return -1;
    } else if (!restored_save) {
        gbs::run_event_script(event_state, room_data->on_enter);
        for (size_t index = 0; index < actor_count; ++index) {
            gbs::run_event_script(event_state, gbs::iso_actor_start_event_script_for(*room_data, index));
        }
    }
    gbs::consume_iso_actor_event_commands(actors, actor_count, event_state);
    apply_iso_event_camera(camera, event_state);
    initialize_iso_tactical_facing(tactical_state, actors, actor_animation_states, actor_count);
    if (tactical_state.enabled && room_data->tactical_presentation != nullptr) {
        camera.position_pixels = gbs::iso_tactical_surface_camera_position(
            *room_data->tactical_presentation,
            camera.position_pixels
        );
    }
    if (room_data->actor_animations != nullptr || room_data->tactical_presentation != nullptr) {
        for (size_t index = 0; index < actor_count; ++index) {
            const gbs::IsoActorAnimationSet* animation_set = tactical_state.enabled
                ? iso_tactical_animation_set_for_actor(*room_data, index)
                : iso_animation_set_for_actor(room_data, index);
            if (animation_set != nullptr) {
                gbs::apply_iso_actor_animation(actors[index], *animation_set, actor_animation_states[index]);
            }
        }
    }
    consume_event_state(event_state);
    if (tactical_state.enabled) {
        start_iso_tactical_music(room_data->tactical_presentation);
        tactical_presentation_audio_started = true;
    }
    gbs::consume_visual_effect_event(event_state, visual_effects);
    prefetch_room_resource_groups(current_room, gbs::Vec2i { camera.position_pixels.x + 120, camera.position_pixels.y + 80 });
    sync_runtime_telemetry(current_room, actors, actor_count, actor_animation_states, *room_data, event_state, cursor, &tactical_state);

    return 0;
}

gbs::RuntimeAdapterFrameResult update_isometric_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        configure_isometric_hud(project.rooms[current_room].name);
#ifdef GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_pending()) {
            sync_runtime_telemetry(current_room, actors, actor_count, actor_animation_states, *room_data, event_state, cursor, &tactical_state);
            return gbs::RuntimeAdapterFrameResult::Transition;
        }
#endif
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
        const bool button_binding_overrides_default =
            !dialogue.visible &&
            run_button_event_binding();
#ifdef GBS_MULTI_RUNTIME
        if (gbs::runtime_transition_pending()) {
            sync_runtime_telemetry(current_room, actors, actor_count, actor_animation_states, *room_data, event_state, cursor, &tactical_state);
            return gbs::RuntimeAdapterFrameResult::Transition;
        }
#endif
        if (button_binding_overrides_default) {
            sync_runtime_telemetry(current_room, actors, actor_count, actor_animation_states, *room_data, event_state, cursor, &tactical_state);
            return gbs::RuntimeAdapterFrameResult::Continue;
        }
        const gbs::Vec2i input_delta = input_to_iso_delta(input);
        const bool movement_pressed = (input.pressed & (
            gbs::ButtonLeft | gbs::ButtonRight | gbs::ButtonUp | gbs::ButtonDown
        )) != 0;
        const bool movement_held = (input.held & (
            gbs::ButtonLeft | gbs::ButtonRight | gbs::ButtonUp | gbs::ButtonDown
        )) != 0;
        const bool movement_step_due = gbs::iso_movement_step_due(
            movement_pressed,
            movement_held,
            gbs::frame_count(),
            iso_movement_repeat_frames
        );
        if (tactical_state.enabled) {
            tick_iso_tactical_cursor_visual(tactical_state.cursor_visual, cursor.tile, room_data->grid);
            if (dialogue.visible) tactical_state.cursor_input = {};
        }
        if (!dialogue.visible) {
        if (tactical_state.enabled) {
            tick_iso_tactical_move(
                tactical_state, actors, actor_animation_states, actor_count,
                gbs::iso_tilemap_from_room(*room_data), room_data->tactical_presentation
            );
            const bool cursor_input_active = tactical_state.active_team == 0 && !tactical_state.moving &&
                !tactical_state.menu_open && tactical_state.outcome == IsoTacticalOutcomeNone &&
                !input.was_pressed(gbs::ButtonB) && !input.was_pressed(gbs::ButtonSelect);
            gbs::Vec2i cursor_delta {0, 0};
            if (cursor_input_active) {
                cursor_delta = step_iso_tactical_cursor_input(input, tactical_state.cursor_input,
                    input.was_pressed(gbs::ButtonA));
            } else tactical_state.cursor_input = {};
            if (cursor_delta.x != 0 || cursor_delta.y != 0) {
                const gbs::IsoCoord previous_cursor_tile = cursor.tile;
                move_iso_tactical_cursor(*room_data, camera, cursor, cursor_delta);
                if (cursor.tile.x != previous_cursor_tile.x ||
                    cursor.tile.y != previous_cursor_tile.y ||
                    cursor.tile.z != previous_cursor_tile.z) {
                    set_iso_tactical_cursor_visual(tactical_state.cursor_visual, cursor.tile, room_data->grid, true);
                    play_iso_tactical_sfx(
                        room_data->tactical_presentation,
                        gbs::IsoTacticalAudioCue::Cursor
                    );
                }
            }
            const auto cursor_before_action = cursor.tile;
            if (tactical_state.active_team == 0) handle_iso_tactical_action(
                tactical_state,
                cursor,
                actors,
                actor_animation_states,
                actor_count,
                gbs::iso_tilemap_from_room(*room_data),
                input,
                room_data->tactical_presentation
            );
            if (!dialogue.visible) tick_iso_tactical_enemy(tactical_state, cursor, actors,
                actor_animation_states, actor_count, gbs::iso_tilemap_from_room(*room_data),
                room_data->tactical_presentation);
            if ((input.pressed & (gbs::ButtonA | gbs::ButtonB | gbs::ButtonSelect)) ||
                tactical_state.menu_open || tactical_state.moving || tactical_state.active_team != 0 ||
                tactical_state.outcome != IsoTacticalOutcomeNone ||
                cursor.tile.x != cursor_before_action.x || cursor.tile.y != cursor_before_action.y ||
                cursor.tile.z != cursor_before_action.z) {
                // Actions and automatic targeting always agree with the visible selected cell.
                set_iso_tactical_cursor_visual(tactical_state.cursor_visual, cursor.tile, room_data->grid, false);
                tactical_state.cursor_input = {};
            }
        } else if (actor_count > 0 && (!movement_held || cursor.active)) {
            gbs::set_iso_actor_motion(actor_animation_states[0], input_delta, false);
        }
        if (!tactical_state.enabled && actor_count > 0) {
            if (movement_held) cursor.active = false;
            const bool player_moved = room_data->movement_model == gbs::IsoMovementModel::Free
                ? update_player_free(actors, *room_data, input)
                : movement_step_due && update_player_tile(actors, *room_data, input);
            gbs::set_iso_actor_motion(actor_animation_states[0], input_delta, player_moved);
            if (!cursor.active) cursor.tile = actors[0].tile;
            if (input.was_pressed(gbs::ButtonB)) cycle_iso_exploration_target(*room_data, actors, actor_count, cursor);
        }
        }
        gbs::run_event_script(event_state, room_data->on_update);
        update_iso_actor_player_hit_scripts(*room_data, event_state);
        if (actor_count > 0) {
            const gbs::Rect player_tile { actors[0].tile.x, actors[0].tile.y, 1, 1 };
            for (size_t index = 0; index < room_data->trigger_count; ++index) {
                const gbs::RuntimeTriggerResult result = gbs::update_runtime_trigger(
                    room_data->triggers[index],
                    trigger_states[index],
                    player_tile
                );
                gbs::run_event_script(
                    event_state,
                    gbs::runtime_trigger_script_for_result(room_data->triggers[index], result)
                );
            }
        }
        for (size_t index = 0; index < actor_count; ++index) {
            gbs::run_event_script(event_state, gbs::iso_actor_update_event_script_for(*room_data, index));
        }
        if (!dialogue.visible && !tactical_state.enabled && input.was_pressed(gbs::ButtonA)) {
            gbs::run_event_script(event_state,
                iso_exploration_interact_script(*room_data, actors, actor_count, cursor));
        }
        gbs::consume_iso_actor_event_commands(actors, actor_count, event_state);
        bool room_changed = apply_iso_event_room_change(
            project,
            current_room,
            room_data,
            actors,
            max_actor_count,
            actor_count,
            camera,
            event_state,
            cursor
        );
        if (room_data->actor_count > max_actor_count || room_data->trigger_count > max_room_triggers) {
            gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
            while (true) {
                gbs::wait_vblank();
            }
        }
        if (room_changed) {
            ++runtime_room_change_count;
            iso_camera_zone_active = false;
            tactical_presentation_maps_loaded = false;
            tactical_presentation_load_failed = false;
            tactical_surface_page_index = gbs::iso_tactical_surface_page_none;
            tactical_surface_pending_page_index = gbs::iso_tactical_surface_page_none;
            tactical_surface_requested_page_index = gbs::iso_tactical_surface_page_none;
            tactical_surface_page_load_started = false;
            tactical_presentation_audio_started = false;
            for (size_t index = 0; index < max_room_triggers; ++index) {
                trigger_states[index] = gbs::RuntimeTriggerState {};
            }
            for (size_t index = 0; index < max_actor_count; ++index) {
                actor_animation_states[index] = gbs::IsoActorAnimationState {};
                actors[index].streamed_tile_asset = nullptr;
            }
            init_iso_tactical_state(tactical_state, *room_data, actor_count);
            initialize_iso_tactical_cursor(tactical_state, actors, actor_count, cursor);
            initialize_iso_tactical_facing(tactical_state, actors, actor_animation_states, actor_count);
        }
        if (room_changed || input.was_pressed(gbs::ButtonA)) {
            persist_isometric_runtime_state(current_room, actors, actor_count, camera, event_state, cursor);
        }
        if (!tactical_state.enabled && (gbs::frame_count() & 15u) == 0) {
            update_follow_actor(actors, actor_animation_states, *room_data);
        }
        if (room_data->actor_animations != nullptr || room_data->tactical_presentation != nullptr) {
            for (size_t index = 0; index < actor_count; ++index) {
                const gbs::IsoActorAnimationSet* animation_set = tactical_state.enabled
                    ? iso_tactical_animation_set_for_actor(*room_data, index)
                    : iso_animation_set_for_actor(room_data, index);
                if (animation_set == nullptr) continue;
                gbs::tick_iso_actor_animation(actor_animation_states[index], *animation_set);
                gbs::apply_iso_actor_animation(actors[index], *animation_set, actor_animation_states[index]);
                if (actor_animation_states[index].completed &&
                    actor_animation_states[index].mode != gbs::IsoActorAnimationMode::Move &&
                    actor_animation_states[index].mode != gbs::IsoActorAnimationMode::Idle) {
                    const bool defeated = actor_animation_states[index].mode == gbs::IsoActorAnimationMode::Defeat;
                    if (defeated) {
                        actors[index].visible = false;
                    }
                    if (!defeated || actors[index].visible) {
                        gbs::set_iso_actor_animation_mode(
                            actor_animation_states[index],
                            gbs::IsoActorAnimationMode::Idle
                        );
                    }
                }
            }
        }
        tick_iso_tactical_feedback(tactical_state);
        if (tactical_state.enabled && !tactical_presentation_audio_started) {
            start_iso_tactical_music(room_data->tactical_presentation);
            tactical_presentation_audio_started = true;
        }
        tick_iso_tactical_audio(tactical_state, room_data->tactical_presentation);
        if (actor_count > 0) {
            event_state.player_x = actors[0].tile.x;
            event_state.player_y = actors[0].tile.y;
        }
        consume_event_state(event_state);
        gbs::consume_visual_effect_event(event_state, visual_effects);
        gbs::update_dialogue(dialogue);
        gbs::advance_dialogue(dialogue, input);
        if (room_data->tileset_tilemap != nullptr) {
            camera.smoothing_x256 = 256;
        }
        if (iso_camera_zone_active) {
            gbs::restore_iso_camera_bounds(camera, room_data->camera_start);
        }
        const bool continuous_camera = !tactical_state.enabled && !cursor.active && actor_count > 0 &&
            room_data->movement_model == gbs::IsoMovementModel::Free;
        const gbs::Vec2i player_world_focus = actor_count > 0
            ? gbs::iso_actor_world_position_pixels(actors[0], room_data->grid)
            : gbs::Vec2i {};
        iso_camera_zone_active = gbs::apply_iso_camera_zones(
            camera,
            gbs::iso_selected_tile(cursor, actors[0]),
            room_data->grid,
            room_data->camera_zones,
            room_data->camera_zone_count,
            continuous_camera ? &player_world_focus : nullptr
        );
        apply_iso_event_camera(camera, event_state);
        if (tactical_state.enabled && room_data->tactical_presentation != nullptr) {
            const size_t camera_page = gbs::select_iso_tactical_surface_page(
                room_data->tactical_presentation->surface_pages,
                room_data->tactical_presentation->surface_page_count,
                camera.position_pixels
            );
            size_t requested_page = camera_page;
            /* A page request survives the camera lock until its group has
             * completed streaming. Otherwise the lock would move the camera
             * back to the committed page and the renderer could never see the
             * page that should be loaded. */
            if (tactical_surface_pending_page_index != gbs::iso_tactical_surface_page_none &&
                camera_page == tactical_surface_page_index &&
                tactical_surface_page_load_started) {
                requested_page = tactical_surface_pending_page_index;
            } else if (tactical_surface_pending_page_index == gbs::iso_tactical_surface_page_none &&
                tactical_surface_page_index != gbs::iso_tactical_surface_page_none &&
                tactical_surface_requested_page_index != gbs::iso_tactical_surface_page_none &&
                tactical_surface_requested_page_index != camera_page &&
                tactical_surface_requested_page_index == tactical_surface_page_index) {
                requested_page = tactical_surface_requested_page_index;
            }
            tactical_surface_requested_page_index = requested_page;
            const bool requested_page_ready = requested_page != gbs::iso_tactical_surface_page_none &&
                tactical_surface_page_resources_ready(*room_data->tactical_presentation, requested_page);
            camera.position_pixels = gbs::iso_tactical_surface_camera_position_with_page_lock(
                *room_data->tactical_presentation,
                camera.position_pixels,
                tactical_surface_page_index,
                requested_page_ready
            );
        }
        if ((gbs::frame_count() & 31u) == 0) {
            prefetch_room_resource_groups(current_room, gbs::Vec2i { camera.position_pixels.x + 120, camera.position_pixels.y + 80 });
        }

        if (room_changed) {
            gbs::reset_iso_surface_tile_cache(iso_surface_cache);
            iso_surface_valid = false;
            authored_background_map_loaded = false;
        }
    return gbs::RuntimeAdapterFrameResult::Continue;
}

bool render_indexed_viewport(const gbs::IsometricRoomData& room, const gbs::IsoCamera& view) {
    if (!gbs::render_iso_room_surface_indexed(room, view, iso_surface_tiles, sizeof(iso_surface_tiles))) return false;
    size_t unique_count = 1;
    __builtin_memset(iso_foreground_unique_tiles, 0, 64);
    iso_foreground_unique_hashes[0] = 0;
    for (size_t i = 0; i < indexed_surface_tile_count; ++i) {
        iso_surface_map[i] = static_cast<uint16_t>(i);
        iso_foreground_map[i] = static_cast<uint16_t>(indexed_foreground_tile_base - 512);
    }
    if (room.bg1_tiles != nullptr) {
        gbs::IsometricRoomData foreground = room;
        foreground.visual_tiles = room.bg1_tiles;
        if (!gbs::render_iso_room_surface_indexed(foreground, view, iso_foreground_surface_tiles, sizeof(iso_foreground_surface_tiles))) return false;
        for (size_t i = 0; i < indexed_surface_tile_count; ++i) {
            const uint8_t* tile = iso_foreground_surface_tiles + i * 64;
            uint32_t hash = 0;
            for (size_t word_index = 0; word_index < 16; ++word_index) {
                uint32_t word;
                __builtin_memcpy(&word, tile + word_index * 4, 4);
                hash = ((hash << 5) | (hash >> 27)) ^ word;
            }
            size_t match = 0;
            while (match < unique_count && (iso_foreground_unique_hashes[match] != hash ||
                __builtin_memcmp(tile, iso_foreground_unique_tiles + match * 64, 64) != 0)) ++match;
            if (match == unique_count) {
                if (unique_count >= indexed_foreground_tile_count) return false;
                __builtin_memcpy(iso_foreground_unique_tiles + unique_count * 64, tile, 64);
                iso_foreground_unique_hashes[unique_count] = hash;
                ++unique_count;
            }
            iso_foreground_map[i] = static_cast<uint16_t>(indexed_foreground_tile_base - 512 + match);
        }
    }
    return gbs::load_bg_tiles_at_character_base(gbs::TileAsset {
        iso_surface_tiles, indexed_surface_tile_count, 0, false, gbs::ColorDepth::Bpp8
    }, 0) && gbs::load_bg_tiles_at_character_base(gbs::TileAsset {
        iso_foreground_unique_tiles, static_cast<uint16_t>(unique_count), indexed_foreground_tile_base - 512, false, gbs::ColorDepth::Bpp8
    }, 2) && gbs::load_tilemap(gbs::BackgroundLayer::BG2, gbs::TileMapAsset { iso_surface_map, 30, 20 })
       && gbs::load_tilemap(gbs::BackgroundLayer::BG3, gbs::TileMapAsset { iso_foreground_map, 30, 20 });
}

bool render_paged_isometric_viewport(const gbs::IsoBakedComposition& surface, int x, int y) {
    const bool initial_upload = !iso_paged_window.initialized;
    // The room-entry/load path resets this window. While its tile footprint
    // remains resident, pixel scrolling needs no dirty-slot scan or upload.
    if (iso_paged_window.initialized && x >= 0 && y >= 0 &&
        x <= surface.width * 8 - 240 && y <= surface.height * 8 - 160 &&
        iso_paged_window.tile_x == x / 8 && iso_paged_window.tile_y == y / 8) {
        gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, x & 255, y & 255);
        gbs::set_bg_scroll(gbs::BackgroundLayer::BG3, x & 255, y & 255);
        return true;
    }
    bool dirty[gbs::iso_paged_background_slots] {};
    int count = 0;
    // The indexed renderer is inactive here. Reuse its foreground scratch for
    // the final 51 slots instead of allocating another cache in mixed EWRAM.
    auto slot_pixels = [](int slot) {
        return slot < 600 ? iso_surface_tiles + slot * 64
                          : iso_foreground_unique_tiles + (slot - 600) * 64;
    };
    if (!gbs::update_iso_paged_surface(surface, iso_paged_window, x, y, iso_surface_map, iso_foreground_map,
        [&](int slot, const uint8_t* pixels) {
            __builtin_memcpy(slot_pixels(slot), pixels, 64);
            dirty[slot] = true;
            ++count;
        })) return false;
    // Batch adjacent slots: enqueueing hundreds of single tiles would exhaust
    // the VBlank DMA queue during the first viewport upload.
    for (int slot = 0; slot < gbs::iso_paged_background_slots;) {
        if (!dirty[slot]) { ++slot; continue; }
        const int first = slot;
        const int limit = first < 600 ? 600 : gbs::iso_paged_background_slots;
        while (slot < limit && dirty[slot]) ++slot;
        if (!gbs::load_bg_tiles_at_character_base({slot_pixels(first), static_cast<uint16_t>(slot - first),
            static_cast<uint16_t>(first), false, gbs::ColorDepth::Bpp8}, 0)) return false;
    }
    if (count && (!gbs::load_tilemap(gbs::BackgroundLayer::BG2, {iso_surface_map, 32, 32}) ||
                  !gbs::load_tilemap(gbs::BackgroundLayer::BG3, {iso_foreground_map, 32, 32}))) return false;
    // The first 651 slots exceed one VBlank DMA budget. Keep their source
    // buffers stable until that upload finishes; otherwise camera updates
    // recycle slots and fill the queue before the initial DMA has drained.
    if (initial_upload) {
        while (gbs::dma_vblank_queue_count() != 0) gbs::wait_vblank();
    }
    gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, x & 255, y & 255);
    gbs::set_bg_scroll(gbs::BackgroundLayer::BG3, x & 255, y & 255);
    return true;
}

void render_isometric_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
        const bool authored_background = gbs::uses_authored_isometric_background(*room_data);
        const gbs::IsoTacticalPresentationData* tactical_presentation = room_data->tactical_presentation;
        const bool tactical_presentation_active = tactical_state.enabled && tactical_presentation != nullptr;
        // The dynamic surface uses CBB2. Keep all maps above its last tile;
        // authored/tactical paths retain the shared engine's default layout.
        const bool dynamic_surface = !authored_background && !tactical_presentation_active;
        const bool baked_surface = dynamic_surface && room_data->baked_composition != nullptr;
        const bool paged_surface = baked_surface && room_data->baked_composition->paged_foreground_first_tile != 0;
        const bool indexed_surface = dynamic_surface && !baked_surface && uses_indexed_surface(*room_data);
        gbs::set_ui_character_base(indexed_surface || baked_surface ? 2 : 0);
        gbs::set_bg_color_depth(gbs::BackgroundLayer::BG2, indexed_surface || baked_surface ? gbs::ColorDepth::Bpp8 : gbs::ColorDepth::Bpp4);
        gbs::set_bg_color_depth(gbs::BackgroundLayer::BG3, indexed_surface || baked_surface ? gbs::ColorDepth::Bpp8 : gbs::ColorDepth::Bpp4);
        gbs::set_bg_screen_base(gbs::BackgroundLayer::BG2, dynamic_surface ? 26 : 20);
        gbs::set_bg_screen_base(gbs::BackgroundLayer::BG3, indexed_surface || baked_surface ? 27 : dynamic_surface ? 30 : 16);
        const gbs::IsoCamera surface_camera = indexed_surface ? camera : gbs::iso_surface_render_camera(camera);
        if (indexed_surface && (!iso_surface_valid || iso_surface_room != room_data || !iso_surface_camera_matches(iso_surface_camera, surface_camera))) {
            iso_surface_valid = render_indexed_viewport(*room_data, surface_camera);
            iso_foreground_valid = iso_surface_valid;
            iso_surface_camera = surface_camera;
            iso_surface_room = room_data;
        }
        if (baked_surface && (!iso_surface_valid || iso_surface_room != room_data)) {
            const auto& baked = *room_data->baked_composition;
            if (baked.palette != nullptr) gbs::load_palette(*baked.palette, false);
            const int first = paged_surface ? baked.paged_foreground_first_tile : 0;
            iso_surface_valid = gbs::load_bg_tiles_at_character_base(gbs::TileAsset {
                baked.tiles + first * 64, static_cast<uint16_t>(baked.tile_count - first),
                static_cast<uint16_t>(paged_surface ? gbs::iso_paged_background_slots : 0), false, gbs::ColorDepth::Bpp8
            }, 0);
            if (paged_surface) {
                iso_paged_window = {};
                iso_foreground_valid = true;
                if (baked.palette != nullptr) gbs::set_backdrop_color(baked.palette->colors[0]);
            }
            iso_surface_room = room_data;
            iso_surface_map_loaded = false;
        }
        const bool iso_surface_needs_render = !baked_surface && !indexed_surface && !authored_background && !tactical_presentation_active &&
            (!iso_surface_valid ||
                iso_surface_room != room_data ||
                !iso_surface_camera_matches(iso_surface_camera, surface_camera));
        if (iso_surface_needs_render) {
            const bool can_scroll_surface = iso_surface_valid && iso_surface_room == room_data;
            const gbs::IsoCamera previous_surface_camera = iso_surface_camera;
            if (!can_scroll_surface) {
                init_iso_surface_map();
                iso_surface_map_loaded = false;
            }
            iso_surface_valid = can_scroll_surface ? gbs::scroll_iso_room_surface(
                *room_data, previous_surface_camera, surface_camera, iso_surface_tiles, iso_surface_byte_count
            ) : gbs::render_iso_room_surface(
                *room_data,
                surface_camera,
                iso_surface_tiles,
                iso_surface_byte_count
            );
            if (iso_surface_valid) {
                gbs::IsoSurfaceTileRun dirty_runs[max_iso_surface_dirty_runs] {};
                const size_t dirty_run_count = gbs::collect_iso_surface_dirty_tile_runs(
                    iso_surface_cache,
                    iso_surface_tiles,
                    iso_surface_tile_count,
                    dirty_runs,
                    max_iso_surface_dirty_runs
                );
                if (dirty_run_count > 0) {
                    gbs::load_tiles(gbs::TileAsset { iso_transparent_tile, 1, 512, false });
                    gbs::load_bg_tiles_at_character_base(gbs::TileAsset { iso_transparent_tile, 1, 0, false }, 2);
                }
                for (size_t index = 0; index < dirty_run_count; ++index) {
                    upload_iso_surface_tile_run(dirty_runs[index]);
                }
                iso_surface_room = room_data;
                iso_surface_camera = surface_camera;

                const bool can_scroll_foreground = can_scroll_surface && iso_foreground_valid;
                iso_foreground_valid = false;
                if (!can_scroll_foreground) {
                    iso_foreground_map_loaded = false;
                    iso_foreground_incremental_cache_ready = false;
                    iso_foreground_unique_tile_count = 0;
                    iso_foreground_uploaded_unique_tile_count = 0;
                }
                if (room_data->bg1_tiles != nullptr) {
                    gbs::IsometricRoomData foreground_room = *room_data;
                    foreground_room.visual_tiles = room_data->bg1_tiles;
                    const bool foreground_rendered = can_scroll_foreground ? gbs::scroll_iso_room_surface(
                        foreground_room, previous_surface_camera, surface_camera, iso_foreground_surface_tiles, iso_surface_byte_count
                    ) : gbs::render_iso_room_surface(
                        foreground_room,
                        surface_camera,
                        iso_foreground_surface_tiles,
                        iso_surface_byte_count
                    );
                    if (foreground_rendered) {
                        const bool incremental_foreground = can_scroll_foreground &&
                            update_iso_foreground_incremental_map(previous_surface_camera, surface_camera);
                        if (incremental_foreground) {
                            iso_foreground_valid =
                                upload_iso_foreground_tiles_if_changed(iso_foreground_unique_tile_count) &&
                                update_iso_foreground_tilemap();
                        } else {
                            const size_t unique_tile_count = gbs::compact_iso_surface_tiles(
                                iso_foreground_surface_tiles,
                                iso_surface_tile_count,
                                iso_foreground_unique_tiles,
                                max_iso_foreground_unique_tiles,
                                iso_foreground_map
                            );
                            if (unique_tile_count <= max_iso_foreground_unique_tiles) {
                                offset_iso_foreground_tilemap(iso_foreground_map, iso_surface_tile_count);
                                iso_foreground_unique_tile_count = unique_tile_count;
                                rebuild_iso_foreground_cache(unique_tile_count);
                                iso_foreground_valid =
                                    upload_iso_foreground_tiles_if_changed(unique_tile_count) &&
                                    update_iso_foreground_tilemap();
                            }
                        }
                    }
                }
            }
        }
        const bool rendered_iso_surface = !tactical_presentation_active && iso_surface_valid;
        const int surface_scroll_x = rendered_iso_surface
            ? camera.position_pixels.x - iso_surface_camera.position_pixels.x
            : 0;
        const int surface_scroll_y = rendered_iso_surface
            ? camera.position_pixels.y - iso_surface_camera.position_pixels.y
            : 0;
        int authored_background_scroll_x = 0;
        int authored_background_scroll_y = 0;
        gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
        if (tactical_presentation_active) {
            if (!tactical_presentation_maps_loaded) {
                if (tactical_presentation->surface_page_count > 0) {
                    const size_t initial_page = tactical_surface_requested_page_index != gbs::iso_tactical_surface_page_none
                        ? tactical_surface_requested_page_index
                        : gbs::select_iso_tactical_surface_page(
                            tactical_presentation->surface_pages,
                            tactical_presentation->surface_page_count,
                            camera.position_pixels
                        );
                    if (initial_page < tactical_presentation->surface_page_count &&
                        initial_page != tactical_surface_pending_page_index) {
                        tactical_surface_pending_page_index = initial_page;
                        tactical_surface_page_load_started = false;
                    }
                    if (initial_page < tactical_presentation->surface_page_count) {
                        const gbs::IsoTacticalSurfacePage& page = tactical_presentation->surface_pages[initial_page];
                        if (!tactical_surface_page_load_started) {
                            tactical_surface_page_load_started = stream_resource_group_by_name(page.resource_bank_group_name);
                        }
                        if (tactical_surface_page_load_started &&
                            tactical_surface_page_resources_ready(*tactical_presentation, initial_page)) {
                            const bool page_loaded = load_iso_tactical_presentation_layers(*tactical_presentation, page.surface);
                            if (page_loaded) {
                                tactical_surface_page_index = initial_page;
                                tactical_surface_pending_page_index = gbs::iso_tactical_surface_page_none;
                                tactical_surface_page_load_started = false;
                                tactical_presentation_maps_loaded = true;
                            } else {
                                tactical_presentation_load_failed = true;
                                tactical_surface_page_load_started = false;
                                tactical_presentation_maps_loaded = true;
                            }
                        }
                    }
                } else {
                    if (project.resource_bank_group_count == 0 || gbs::dma_vblank_queue_count() == 0) {
                        tactical_presentation_load_failed = !load_iso_tactical_presentation_layers(*tactical_presentation);
                        tactical_presentation_maps_loaded = true;
                    }
                }
            }
            if (!tactical_presentation_load_failed && tactical_presentation->surface_page_count > 0) {
                const size_t selected_page = tactical_surface_requested_page_index != gbs::iso_tactical_surface_page_none
                    ? tactical_surface_requested_page_index
                    : gbs::select_iso_tactical_surface_page(
                        tactical_presentation->surface_pages,
                        tactical_presentation->surface_page_count,
                        camera.position_pixels
                    );
                if (selected_page < tactical_presentation->surface_page_count &&
                    selected_page != tactical_surface_page_index) {
                    const gbs::IsoTacticalSurfacePage& page = tactical_presentation->surface_pages[selected_page];
                    if (selected_page != tactical_surface_pending_page_index) {
                        tactical_surface_pending_page_index = selected_page;
                        tactical_surface_page_load_started = false;
                    }
                    if (!tactical_surface_page_load_started) {
                        tactical_surface_page_load_started = stream_resource_group_by_name(page.resource_bank_group_name);
                    }
                    if (tactical_surface_page_load_started &&
                        tactical_surface_pending_page_index == selected_page &&
                        tactical_surface_page_resources_ready(*tactical_presentation, selected_page) &&
                        load_iso_tactical_presentation_layers(*tactical_presentation, page.surface)) {
                        /* Commit only after the complete layer set is loaded;
                         * the camera lock keeps the logical view on the previous
                         * page while the resident grid covers the swap frame. */
                        tactical_surface_page_index = selected_page;
                        tactical_surface_pending_page_index = gbs::iso_tactical_surface_page_none;
                        tactical_surface_page_load_started = false;
                    }
                }
            }
            const bool tactical_surface_loading = tactical_surface_page_load_started;
            const bool page_surface_enabled = tactical_presentation->surface_page_count > 0
                ? tactical_surface_page_index != gbs::iso_tactical_surface_page_none &&
                    tactical_surface_page_index < tactical_presentation->surface_page_count &&
                    tactical_presentation->surface_pages[tactical_surface_page_index].surface != nullptr
                : tactical_presentation->surface != nullptr;
            const bool surface_enabled = !tactical_surface_loading &&
                !tactical_presentation_load_failed &&
                gbs::iso_tactical_capability_enabled(*tactical_presentation, gbs::IsoTacticalCapability::Surface) &&
                page_surface_enabled;
            const bool grid_enabled = !tactical_presentation_load_failed &&
                gbs::iso_tactical_capability_enabled(*tactical_presentation, gbs::IsoTacticalCapability::GridOverlay) &&
                tactical_presentation->grid != nullptr;
            const bool hud_enabled = !tactical_presentation_load_failed &&
                gbs::iso_tactical_capability_enabled(*tactical_presentation, gbs::IsoTacticalCapability::Hud) &&
                tactical_presentation->hud != nullptr;
            const bool authored_background_fallback = !tactical_presentation_load_failed &&
                gbs::uses_authored_isometric_background_as_tactical_surface_fallback(
                    *room_data,
                    *tactical_presentation
                );
            const bool tactical_grid_fallback = tactical_surface_loading && tactical_presentation->grid != nullptr;
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, hud_enabled);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, grid_enabled);
            gbs::set_bg_enabled(
                gbs::BackgroundLayer::BG2,
                surface_enabled || authored_background_fallback || tactical_grid_fallback
            );
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG0, 0);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG1, 0);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG2, 0);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 1);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG3, 3);
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG0, 0, 0);
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, camera.position_pixels.x, camera.position_pixels.y);
            if (tactical_grid_fallback) {
                /* The grid is a resident, non-uniform fallback for the one
                 * frame in which the exclusive surface bank is being swapped.
                 * This avoids exposing a partially uploaded page as the
                 * previous map's tile indices are being replaced. */
                gbs::load_tilemap(gbs::BackgroundLayer::BG2, *tactical_presentation->grid);
                gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, 0, 0);
            } else if (authored_background_fallback) {
                const gbs::TileMapAsset& background = *room_data->authored_background_tilemap;
                authored_background_scroll_x = gbs::clamp_int(
                    camera.position_pixels.x,
                    0,
                    background.width * 8 > 240 ? background.width * 8 - 240 : 0
                );
                authored_background_scroll_y = gbs::clamp_int(
                    camera.position_pixels.y,
                    0,
                    background.height * 8 > 160 ? background.height * 8 - 160 : 0
                );
                if (!authored_background_map_loaded) {
                    gbs::load_tilemap(gbs::BackgroundLayer::BG2, background);
                    authored_background_map_loaded = true;
                }
                gbs::set_bg_scroll(
                    gbs::BackgroundLayer::BG2,
                    authored_background_scroll_x,
                    authored_background_scroll_y
                );
            } else {
                gbs::Vec2i surface_scroll = camera.position_pixels;
                if (tactical_presentation->surface_page_count > 0 &&
                    tactical_surface_page_index < tactical_presentation->surface_page_count) {
                    surface_scroll = gbs::iso_tactical_surface_page_scroll(
                        tactical_presentation->surface_pages[tactical_surface_page_index],
                        camera.position_pixels
                    );
                }
                gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, surface_scroll.x, surface_scroll.y);
            }
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG3, 0, 0);
            if (tactical_presentation_load_failed) {
                gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
            } else {
                gbs::set_backdrop_color(project.backdrop_color);
            }
        } else if (authored_background) {
            const gbs::TileMapAsset& background = *room_data->authored_background_tilemap;
            authored_background_scroll_x = gbs::clamp_int(
                camera.position_pixels.x,
                0,
                background.width * 8 > 240 ? background.width * 8 - 240 : 0
            );
            authored_background_scroll_y = gbs::clamp_int(
                camera.position_pixels.y,
                0,
                background.height * 8 > 160 ? background.height * 8 - 160 : 0
            );
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG2, 0);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
            if (!authored_background_map_loaded) {
                gbs::load_tilemap(gbs::BackgroundLayer::BG2, *room_data->authored_background_tilemap);
                authored_background_map_loaded = true;
            }
            gbs::set_bg_scroll(
                gbs::BackgroundLayer::BG2,
                authored_background_scroll_x,
                authored_background_scroll_y
            );
        } else if (baked_surface && rendered_iso_surface) {
            const auto& baked = *room_data->baked_composition;
            const int x = camera.position_pixels.x - baked.origin.x;
            const int y = camera.position_pixels.y - baked.origin.y;
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, true);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG2, 0);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG3, 0);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG3, 0);
            if (paged_surface) {
                iso_surface_valid = render_paged_isometric_viewport(baked, x, y);
            } else if (!iso_surface_map_loaded || x / 8 != (iso_surface_camera.position_pixels.x - baked.origin.x) / 8 ||
                y / 8 != (iso_surface_camera.position_pixels.y - baked.origin.y) / 8) {
                gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2, baked.background, baked.width, baked.height, x, y);
                gbs::draw_room_to_bg(gbs::BackgroundLayer::BG3, baked.foreground, baked.width, baked.height, x, y);
                iso_surface_map_loaded = true;
                iso_surface_camera = camera;
            }
        } else if (indexed_surface && rendered_iso_surface) {
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, true);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG2, 0);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG3, 2);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG3, 0);
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, 0, 0);
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG3, 0, 0);
        } else if (rendered_iso_surface) {
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, iso_foreground_valid);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG1, 0);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG2, 2);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG3, 1);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG3, 0);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 2);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
            if (!iso_surface_map_loaded) {
                gbs::load_tilemap(gbs::BackgroundLayer::BG1, gbs::TileMapAsset { iso_surface_map, 40, 12 });
                gbs::load_tilemap(gbs::BackgroundLayer::BG2, gbs::TileMapAsset { iso_surface_map, 40, 12 });
                iso_surface_map_loaded = true;
            }
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG1, surface_scroll_x, surface_scroll_y);
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG2, surface_scroll_x, -96 + surface_scroll_y);
            gbs::set_bg_scroll(gbs::BackgroundLayer::BG3, 0, 0);
        } else {
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG0, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, true);
            gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, true);
            gbs::set_bg_character_base(gbs::BackgroundLayer::BG1, 1);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 0);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);
            gbs::set_bg_priority(gbs::BackgroundLayer::BG3, 3);
            if (!gbs::is_bitmap_display_mode(project.video.display_mode)) {
                gbs::draw_room_to_bg(gbs::BackgroundLayer::BG3, room_data->bg3_tiles, room_data->width_tiles, room_data->height_tiles, camera.position_pixels.x, camera.position_pixels.y);
                gbs::draw_room_to_bg(gbs::BackgroundLayer::BG2, room_data->bg2_tiles != nullptr ? room_data->bg2_tiles : room_data->visual_tiles, room_data->width_tiles, room_data->height_tiles, camera.position_pixels.x, camera.position_pixels.y);
                gbs::draw_room_to_bg(gbs::BackgroundLayer::BG1, room_data->bg1_tiles, room_data->width_tiles, room_data->height_tiles, camera.position_pixels.x, camera.position_pixels.y);
            }
            for (int layer = 1; layer < 4; ++layer) {
                gbs::set_bg_scroll(static_cast<gbs::BackgroundLayer>(layer), camera.position_pixels.x & 7, camera.position_pixels.y & 7);
            }
        }
        const gbs::Vec2i visual_scroll = gbs::visual_effect_scroll_offset(visual_effects);
        for (int layer = 0; layer < 4; ++layer) {
            const gbs::BackgroundLayer background = static_cast<gbs::BackgroundLayer>(layer);
            if (!gbs::visual_effect_targets_background(visual_effects, background)) continue;
            const int base_x = baked_surface && layer >= 2 ? (camera.position_pixels.x - room_data->baked_composition->origin.x) & (paged_surface ? 255 : 7) : indexed_surface ? 0 : tactical_presentation_active && layer != 0
                ? camera.position_pixels.x
                : authored_background && layer == 2
                ? authored_background_scroll_x
                : rendered_iso_surface && layer == 3
                ? 0
                : (layer == 0 || !rendered_iso_surface ? 0 : surface_scroll_x);
            const int base_y = baked_surface && layer >= 2 ? (camera.position_pixels.y - room_data->baked_composition->origin.y) & (paged_surface ? 255 : 7) : indexed_surface ? 0 : tactical_presentation_active && layer != 0
                ? camera.position_pixels.y
                : authored_background && layer == 2
                ? authored_background_scroll_y
                : (rendered_iso_surface && layer == 2
                ? -96 + surface_scroll_y
                : rendered_iso_surface && layer == 3
                ? 0
                : (layer == 0 || !rendered_iso_surface ? 0 : camera.position_pixels.y & 7));
            gbs::set_bg_scroll(background, base_x + visual_scroll.x, base_y + visual_scroll.y);
        }
        gbs::render_visual_effects(visual_effects);
        gbs::hide_all_sprites();
        size_t draw_count = gbs::build_iso_draw_list(
            actors,
            actor_count,
            camera,
            draw_items,
            max_draw_count,
            room_data->grid
        );
        if (iso_foreground_valid) {
            for (size_t index = 0; index < draw_count; ++index) {
                if (draw_items[index].priority < 1) {
                    draw_items[index].priority = 1;
                }
            }
        }
        if (tactical_presentation_active) {
            if (gbs::iso_tactical_capability_enabled(*tactical_presentation, gbs::IsoTacticalCapability::Props) &&
                tactical_presentation->props != nullptr) {
                for (size_t index = 0; index < tactical_presentation->prop_count; ++index) {
                    draw_count = append_iso_tactical_metasprite(
                        tactical_presentation->props[index].metasprite,
                        tactical_presentation->props[index].tile,
                        camera,
                        room_data->grid,
                        draw_items,
                        draw_count,
                        max_draw_count,
                        static_cast<uint16_t>(0x0200u + index),
                        1
                    );
                }
            }
            if (gbs::iso_tactical_capability_enabled(*tactical_presentation, gbs::IsoTacticalCapability::Feedback)) {
                const auto cursor_offset = iso_tactical_cursor_draw_offset(
                    tactical_state.cursor_visual, cursor.tile, room_data->grid);
                if (cursor.active) {
                    draw_count = append_iso_tactical_metasprite(
                        tactical_presentation->cursor,
                        cursor.tile,
                        camera,
                        room_data->grid,
                        draw_items,
                        draw_count,
                        max_draw_count,
                        0x0400u,
                        0,
                        true,
                        cursor_offset
                    );
                }
                if (tactical_state.selected && !tactical_state.menu_open && !tactical_state.moving) {
                    draw_count = append_iso_tactical_metasprite(
                        tactical_presentation->range,
                        cursor.tile,
                        camera,
                        room_data->grid,
                        draw_items,
                        draw_count,
                        max_draw_count,
                        0x0401u,
                        0,
                        true,
                        cursor_offset
                    );
                    const size_t target_actor_index = gbs::find_iso_actor_at_cursor(
                        cursor,
                        actors,
                        actor_count,
                        0,
                        true
                    );
                    const size_t target_unit_index = iso_tactical_unit_for_actor(tactical_state, target_actor_index);
                    const auto target_map = gbs::iso_tilemap_from_room(*room_data);
                    if (target_unit_index != no_tactical_unit_index &&
                        target_unit_index != tactical_state.selected_unit_index &&
                        tactical_state.units[target_unit_index].team != tactical_state.active_team &&
                        tactical_state.attack_mode &&
                        gbs::iso_tactical_can_attack(actors[tactical_state.units[tactical_state.selected_unit_index].actor_index].tile,
                            cursor.tile, tactical_state.units[tactical_state.selected_unit_index].attack_range,
                            &target_map)) {
                        draw_count = append_iso_tactical_metasprite(
                            tactical_presentation->target,
                            cursor.tile,
                            camera,
                            room_data->grid,
                            draw_items,
                            draw_count,
                            max_draw_count,
                            0x0402u,
                            0,
                            true,
                            cursor_offset
                        );
                    }
                    if (tactical_state.selected_unit_index != no_tactical_unit_index) {
                        const size_t selected_actor_index = tactical_state.units[tactical_state.selected_unit_index].actor_index;
                        if (selected_actor_index < actor_count) {
                            draw_count = append_iso_tactical_metasprite(
                                tactical_presentation->emotes,
                                actors[selected_actor_index].tile,
                                camera,
                                room_data->grid,
                                draw_items,
                                draw_count,
                                max_draw_count,
                                0x0403u,
                                0,
                                true
                            );
                        }
                    }
                }
                if (tactical_state.feedback_frames > 0) {
                    draw_count = append_iso_tactical_metasprite(
                        tactical_presentation->feedback,
                        tactical_state.feedback_tile,
                        camera,
                        room_data->grid,
                        draw_items,
                        draw_count,
                        max_draw_count,
                        0x0404u,
                        0,
                        true
                    );
                }
            }
        } else if (cursor.active && actor_count > 0 && draw_count < max_draw_count) {
            gbs::Vec2i cursor_world = gbs::iso_tile_to_screen(cursor.tile, room_data->grid);
            cursor_world.x += actors[0].screen_offset_pixels.x;
            cursor_world.y += actors[0].screen_offset_pixels.y;
            const gbs::Vec2i cursor_screen = gbs::iso_camera_world_to_screen(camera, cursor_world);
            draw_items[draw_count++] = gbs::IsoDrawItem {
                cursor_screen,
                actors[0].tile_index,
                actors[0].palette,
                static_cast<uint16_t>(gbs::iso_depth_key(cursor.tile, room_data->grid) + 1),
                static_cast<uint16_t>(actor_count),
                true,
                (gbs::frame_count() & 16u) != 0,
                0
            };
        }
        // UI on BG0 must cover world sprites, including the lower dialogue box.
        // Equal OBJ/BG priorities put OBJ in front on GBA hardware.
        if (dialogue.visible || tactical_presentation_active ||
            gbastudio_dialogue_ui::has_hud_scene_binding(project.rooms[current_room].name)) {
            gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);
            for (size_t index = 0; index < draw_count; ++index) {
                if (draw_items[index].priority == 0) draw_items[index].priority = 1;
            }
        }
        gbs::sort_iso_draw_list(draw_items, draw_count);
        gbs::draw_iso_sprites(
            draw_items,
            draw_count,
            0,
            gbs::visual_effect_sprite_mosaic_enabled(visual_effects)
        );
        // A scene preset is drawn through the shared HUD renderer; the
        // tactical presentation retains its own layer when no preset exists.
        if (gbastudio_dialogue_ui::has_hud_scene_binding(project.rooms[current_room].name)) {
            gbs::draw_hud(hud);
        }
        gbs::draw_dialogue(dialogue);
        gbs::draw_event_clock(event_state);
        if (tactical_presentation_active && tactical_presentation->hud != nullptr && !dialogue.visible) {
            // Hiding a dialogue clears its rectangle on BG0. Restore the
            // authored panel afterwards so the lower status keeps its backing.
            gbs::load_tilemap(gbs::BackgroundLayer::BG0, *tactical_presentation->hud);
            draw_iso_tactical_hud_status(tactical_state);
        }
        gbs::tick_visual_effects(visual_effects);
        sync_runtime_telemetry(current_room, actors, actor_count, actor_animation_states, *room_data, event_state, cursor, &tactical_state);
        publish_iso_tactical_draw_witness(draw_items, draw_count, event_state);
        gbs::wait_vblank();
}

void leave_isometric_runtime() {
#ifdef GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_target() == gbs::RuntimeKind::Menu && event_state.scene_stack_count > 0) {
        gbs::UniversalSaveData data {};
        gbs::clear_suspended_runtime_save();
        static_assert(sizeof(tactical_state) <= gbs::suspended_runtime_transient_capacity, "tactical pause state exceeds resident storage");
        if (capture_isometric_runtime_state(data, current_room, actors, actor_count, camera, event_state, cursor))
            gbs::capture_suspended_runtime_save(data, &tactical_state, sizeof(tactical_state));
    }
#endif
    gbs::set_ui_character_base(0);
    gbs::set_bg_color_depth(gbs::BackgroundLayer::BG2, gbs::ColorDepth::Bpp4);
    gbs::set_bg_color_depth(gbs::BackgroundLayer::BG3, gbs::ColorDepth::Bpp4);
    gbs::release_resource_bank_group(resources, bank_reservation);
    gbs::release_resource_bank_cache(resources, bank_cache);
}

extern "C" void GBS_ISOMETRIC_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    isometric_initialization_result = initialize_isometric_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_ISOMETRIC_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    return update_isometric_runtime(context);
}

extern "C" void GBS_ISOMETRIC_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_isometric_runtime(context);
}

extern "C" void GBS_ISOMETRIC_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_isometric_runtime();
}

extern "C" int GBS_ISOMETRIC_RUNTIME_ENTRY() {
    isometric_initialization_result = initialize_isometric_runtime();
    if (isometric_initialization_result != 0) {
        leave_isometric_runtime();
        return isometric_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::Isometric,
            current_room,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_isometric_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_isometric_runtime();
            return -1;
        }
        render_isometric_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_isometric_runtime();
            return 0;
        }
    }
}
