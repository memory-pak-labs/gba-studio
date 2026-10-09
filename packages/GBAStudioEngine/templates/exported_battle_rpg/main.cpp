#include "gbs/engine.hpp"
#include "gbs/audio.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/event.hpp"
#include "gbs/input.hpp"
#include "gbs/render.hpp"
#include "gbs/resource_manager.hpp"
#include "gbs/runtime.hpp"
#include "gbs/runtime_telemetry.hpp"
#include "gbs/save.hpp"
#include "gbs/runtime_checkpoint.hpp"
#include "gbs/ui.hpp"
#include "gbs/visual_effects.hpp"
#include <cstring>

#ifndef GBS_BATTLE_RPG_PROJECT_DATA_HEADER
#define GBS_BATTLE_RPG_PROJECT_DATA_HEADER "battle_rpg_project_data.hpp"
#endif
#include GBS_BATTLE_RPG_PROJECT_DATA_HEADER
#if __has_include("dialogue_ui_assets.hpp")
#include "dialogue_ui_assets.hpp"
#else
#include "gbs/dialogue_ui_assets.hpp"
#endif

#ifndef GBS_BATTLE_RPG_RUNTIME_ENTRY
#define GBS_BATTLE_RPG_RUNTIME_ENTRY gbs_main
#endif

#ifndef GBS_BATTLE_RPG_RUNTIME_ENTER
#define GBS_BATTLE_RPG_RUNTIME_ENTER gbs_enter_battle_rpg
#endif

#ifndef GBS_BATTLE_RPG_RUNTIME_UPDATE
#define GBS_BATTLE_RPG_RUNTIME_UPDATE gbs_update_battle_rpg
#endif

#ifndef GBS_BATTLE_RPG_RUNTIME_RENDER
#define GBS_BATTLE_RPG_RUNTIME_RENDER gbs_render_battle_rpg
#endif

#ifndef GBS_BATTLE_RPG_RUNTIME_LEAVE
#define GBS_BATTLE_RPG_RUNTIME_LEAVE gbs_leave_battle_rpg
#endif

#ifndef GBS_MULTI_RUNTIME
#define GBS_MULTI_RUNTIME 0
#endif

namespace {

const gbs::BattleRpgProjectData& project = gbastudio_battle_rpg_project::project;
int encounter_index = 0;
gbs::BattleRpgRuntimeState state {};
gbs::DialogueState dialogue __attribute__((section(".ewram_bss")));
gbs::DialogueState battle_prompt_dialogue __attribute__((section(".ewram_bss")));
gbs::DialogueState battle_menu_dialogue __attribute__((section(".ewram_bss")));
gbs::HudState battle_hud {};
gbs::EventState event_state __attribute__((section(".ewram_bss")));
    gbs::EventRunner battle_event_runner {};
    gbs::EngineResourceManager resource_manager __attribute__((section(".ewram_bss")));
    uint32_t battle_save_sequence = 0;
    int battle_initialization_result = -1;
    int battle_event_wait_frames = 0;
bool battle_script_controls_dialogue = false;
bool battle_ui_restore_pending = true;
bool outcome_hook_started = false;
bool outcome_hook_handled = false;
enum class BattleMenuPage : uint8_t { Root, Moves, Targets, Party, Items, Notice };
BattleMenuPage battle_menu_page = BattleMenuPage::Root;
int battle_menu_parent_choice = 0;
bool battle_menu_wait_for_enemy_turn = false;
bool battle_menu_target_is_ally = false;
char battle_prompt_text[96] = {};
gbs::DialogueLine battle_prompt_line { battle_prompt_text };
gbs::DialogueLine battle_menu_line { "COMANDO" };
gbs::DialogueLine battle_menu_notice_line { "" };
gbs::DialogueChoice battle_root_choices[] = {
    { "ATACAR", 0 },
    { "EQUIPE", 1 },
    { "ITENS", 2 },
    { "FUGIR", 3 }
};
gbs::DialogueChoice battle_move_choices[4] = {};
gbs::DialogueChoice battle_target_choices[4] = {};
gbs::DialogueChoice battle_party_choices[4] = {};
gbs::DialogueChoice battle_item_choices[] = {{ "NENHUM ITEM", 0 }};
bool persist_battle_rpg_runtime_state(int slot_index = 0);
char battle_party_hud_text[48] = {};
char battle_enemy_hud_text[48] = {};
char battle_enemy_hp_hud_text[8] = {};
char battle_party_hp_hud_text[8] = {};
volatile gbs::RuntimeTelemetryBlock& runtime_telemetry = gbs::runtime_telemetry_block();
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

#if GBS_MULTI_RUNTIME
int checkpoint_music_index = -1;
int checkpoint_tracker_index = -1;
struct BattleRpgRuntimeCheckpoint {
    uint32_t version;
    gbs::BattleRpgRuntimeState state;
    gbs::CheckpointScript script;
    gbs::CheckpointDialogue dialogue;
    gbs::CheckpointEvents events;
    int32_t music_index;
    int32_t tracker_index;
    int32_t wait_frames;
    bool script_controls_dialogue;
    bool outcome_started;
    bool outcome_handled;
};
static_assert(sizeof(BattleRpgRuntimeCheckpoint) <= gbs::universal_save_payload_capacity);

gbs::EventScript checkpoint_script_for(int room, int script_index) {
    if (room < 0 || static_cast<size_t>(room) >= project.encounter_count) return gbs::empty_event_script();
    const auto& room_data = project.encounters[room];
    switch (script_index) {
    case 0: return room_data.on_enter;
    case 1: return room_data.on_victory;
    case 2: return room_data.on_defeat;
    case 3: return room_data.on_escape;
    default: return gbs::empty_event_script();
    }
}

int current_checkpoint_script_index() {
    if (!gbs::has_event_script(battle_event_runner.script)) return -1;
    for (int index = 0; index < 4; ++index) {
        const auto script = checkpoint_script_for(encounter_index, index);
        if (script.commands == battle_event_runner.script.commands && script.command_count == battle_event_runner.script.command_count) return index;
    }
    return -1;
}

bool capture_battle_rpg_checkpoint(gbs::UniversalSaveData& data) {
    if (gbs::checkpoint_dialogue_is_feedback(dialogue)) return false;
    const int script_index = current_checkpoint_script_index();
    if (battle_event_runner.active && script_index < 0) return false;
    const BattleRpgRuntimeCheckpoint snapshot {
        1, state, gbs::capture_checkpoint_script(battle_event_runner, script_index),
        gbs::capture_checkpoint_dialogue(dialogue), gbs::capture_checkpoint_events(event_state),
        checkpoint_music_index, checkpoint_tracker_index, battle_event_wait_frames,
        battle_script_controls_dialogue, outcome_hook_started, outcome_hook_handled
    };
    return gbs::capture_runtime_checkpoint(data, gbs::UniversalSaveRuntime::BattleRpg, encounter_index,
        event_state.player_x, event_state.player_y, event_state, &snapshot, sizeof(snapshot), gbs::frame_count());
}

bool restore_battle_rpg_checkpoint(int slot) {
    auto* service = gbs::active_runtime_save_service();
    gbs::UniversalSaveData data {};
    BattleRpgRuntimeCheckpoint snapshot {};
    if (service == nullptr || gbs::read_runtime_save(*service, slot, data) != gbs::SaveStatus::Ok ||
        !gbs::read_universal_save_payload(data, gbs::UniversalSaveRuntime::BattleRpg, &snapshot, sizeof(snapshot)) ||
        snapshot.version != 1 || data.room_index < 0 || static_cast<size_t>(data.room_index) >= project.encounter_count ||
        snapshot.wait_frames < 0 || snapshot.music_index < -1 || snapshot.tracker_index < -1 ||
        (snapshot.music_index >= 0 && static_cast<size_t>(snapshot.music_index) >= project.music_asset_count) ||
        (snapshot.tracker_index >= 0 && static_cast<size_t>(snapshot.tracker_index) >= project.tracker_asset_count) ||
        !gbs::valid_checkpoint_dialogue(snapshot.dialogue, project.dialogue_line_count)) return false;
    gbs::EventRunner restored_runner {};
    if (!gbs::restore_checkpoint_script(snapshot.script,
            checkpoint_script_for(data.room_index, snapshot.script.script_index), restored_runner)) return false;
    const auto& encounter = project.encounters[data.room_index];
    if (snapshot.state.outcome > gbs::BattleRpgOutcome::Escaped ||
        snapshot.state.selected_party < 0 || snapshot.state.selected_party >= encounter.party_count ||
        snapshot.state.selected_enemy < -1 || snapshot.state.selected_enemy >= encounter.enemy_count ||
        snapshot.state.selected_ally < -1 || snapshot.state.selected_ally >= encounter.party_count ||
        snapshot.state.turn_delay_remaining < 0) return false;
    for (int index = 0; index < encounter.party_count; ++index)
        if (snapshot.state.party_hp[index] < 0 || snapshot.state.party_hp[index] > encounter.party[index].unit.max_hp) return false;
    for (int index = 0; index < encounter.enemy_count; ++index)
        if (snapshot.state.enemy_hp[index] < 0 || snapshot.state.enemy_hp[index] > encounter.enemies[index].unit.max_hp) return false;
    if (!gbs::restore_checkpoint_events(snapshot.events, event_state) ||
        !gbs::restore_suspended_common_state(data, event_state)) return false;
    encounter_index = data.room_index;
    state = snapshot.state;
    battle_event_runner = restored_runner;
    battle_event_wait_frames = snapshot.wait_frames;
    battle_script_controls_dialogue = snapshot.script_controls_dialogue;
    outcome_hook_started = snapshot.outcome_started;
    outcome_hook_handled = snapshot.outcome_handled;
    checkpoint_music_index = snapshot.music_index;
    checkpoint_tracker_index = snapshot.tracker_index;
    event_state.current_room = encounter_index;
    event_state.player_x = data.player_x;
    event_state.player_y = data.player_y;
    return gbs::restore_checkpoint_dialogue(snapshot.dialogue, dialogue, project.dialogue_lines, project.dialogue_line_count);
}

void consume_battle_rpg_checkpoint_request() {
    if (event_state.save_request == 0) return;
    gbs::UniversalSaveData data {};
    const bool captured = event_state.save_request != 1 || capture_battle_rpg_checkpoint(data);
    const bool saving = event_state.save_request == 1;
    const auto status = gbs::consume_checkpoint_request(event_state, data, captured, "BATTLE RPG", gbs::RuntimeKind::BattleRpg);
    if (saving && status != gbs::SaveStatus::Ok) {
        gbs::show_checkpoint_save_failure(dialogue);
        battle_script_controls_dialogue = true;
    }
}
#endif

void sync_runtime_telemetry() {
    runtime_telemetry.magic = gbs::runtime_telemetry_magic;
    runtime_telemetry.schema = gbs::runtime_telemetry_schema;
    runtime_telemetry.word_count = sizeof(gbs::RuntimeTelemetryBlock) / sizeof(uint32_t);
    runtime_telemetry.frame = gbs::frame_count();
    runtime_telemetry.current_room = encounter_index;
    runtime_telemetry.flag_bits = static_cast<uint32_t>(state.outcome) << 28;
    for (size_t index = 0; index < gbs::runtime_telemetry_variable_count; ++index) {
        runtime_telemetry.variables[index] = event_state.variables[index];
        if (event_state.variables[index] != 0) {
            runtime_telemetry.flag_bits |= static_cast<uint32_t>(1u << index);
        }
    }
    runtime_telemetry.player_x = state.selected_party;
    runtime_telemetry.player_y = state.selected_enemy;
    runtime_telemetry.player_direction = state.selected_ability;
    runtime_telemetry.actor_count = project.encounters[encounter_index].enemy_count;
    runtime_telemetry.first_actor_x = state.enemy_hp[0];
    runtime_telemetry.first_actor_y = project.encounters[encounter_index].enemies[0].unit.max_hp;
    runtime_telemetry.first_actor_direction = static_cast<int>(state.last_enemy_ability);
    runtime_telemetry.first_actor_visible = state.enemy_hp[0] > 0 ? 1 : 0;
    runtime_telemetry.last_music = event_state.last_music;
    runtime_telemetry.last_sfx = event_state.last_sfx >= 0 ? event_state.last_sfx : event_state.last_pcm_sfx;
    runtime_telemetry.current_tile_flags = static_cast<uint32_t>(state.reward_gold);
    runtime_telemetry.current_tile_slope = static_cast<uint32_t>(state.reward_experience);
    runtime_telemetry.room_change_count = outcome_hook_handled ? 1u : 0u;
    gbs::publish_runtime_physical_telemetry(resource_manager, event_state);
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
        battle_script_controls_dialogue = dialogue.visible;
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
            checkpoint_music_index = event_state.last_music;
            checkpoint_tracker_index = -1;
#endif
        }
        event_state.last_music = -1;
    }
    if (event_state.last_tracker_music >= 0) {
        if (static_cast<size_t>(event_state.last_tracker_music) < project.tracker_asset_count) {
            gbs::play_tracker_music(project.tracker_assets[event_state.last_tracker_music]);
#if GBS_MULTI_RUNTIME
            checkpoint_tracker_index = event_state.last_tracker_music;
            checkpoint_music_index = -1;
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
        battle_script_controls_dialogue = false;
    }
    if (event_state.stop_music) {
        gbs::stop_music();
        gbs::stop_tracker_music();
        gbs::stop_pcm_music();
        event_state.stop_music = false;
#if GBS_MULTI_RUNTIME
        checkpoint_music_index = checkpoint_tracker_index = -1;
#endif
    }
    if (event_state.wait_frames > 0) {
        battle_event_wait_frames = event_state.wait_frames;
        event_state.wait_frames = 0;
    }
#if GBS_MULTI_RUNTIME
    consume_battle_rpg_checkpoint_request();
#endif
}

bool start_battle_event_script(gbs::EventScript script) {
    battle_event_wait_frames = 0;
    battle_script_controls_dialogue = false;
    if (!gbs::has_event_script(script)) {
        return false;
    }
    gbs::start_event_runner(battle_event_runner, script);
    return true;
}

bool update_battle_event_script(const gbs::InputState& input) {
    if (battle_script_controls_dialogue && dialogue.visible) {
        gbs::advance_dialogue(dialogue, input);
        if (!dialogue.visible) {
            battle_script_controls_dialogue = false;
        }
        return true;
    }
    if (battle_event_wait_frames > 0) {
        --battle_event_wait_frames;
        return true;
    }
    if (!gbs::event_runner_is_active(battle_event_runner)) {
        return false;
    }
#if GBS_MULTI_RUNTIME
    gbs::update_checkpoint_event_runner(battle_event_runner, event_state);
#else
    gbs::update_event_runner(battle_event_runner, event_state);
#endif
    consume_event_state();
    return true;
}

const char* battle_ability_label(gbs::BattleRpgAbilityKind kind) {
    switch (kind) {
        case gbs::BattleRpgAbilityKind::Magic: return "TECNICA";
        case gbs::BattleRpgAbilityKind::Heal: return "REPARAR";
        case gbs::BattleRpgAbilityKind::Defend: return "DEFENDER";
        default: return "ATAQUE";
    }
}

void append_hud_number(char* output, int& cursor, int value) {
    if (value >= 100) output[cursor++] = static_cast<char>('0' + ((value / 100) % 10));
    if (value >= 10) output[cursor++] = static_cast<char>('0' + ((value / 10) % 10));
    output[cursor++] = static_cast<char>('0' + (value % 10));
}

void format_battle_hud_text(char* output, const char* label, int hp, int max_hp) {
    int cursor = 0;
    for (int index = 0; index < 4 && label != nullptr && label[index] != '\0'; ++index) {
        output[cursor++] = label[index];
    }
    output[cursor++] = ' ';
    append_hud_number(output, cursor, hp);
    output[cursor++] = '/';
    append_hud_number(output, cursor, max_hp);
    output[cursor] = '\0';
}

bool battle_hud_uses_compact_status() {
    const gbs::HudLayout* layout = gbs::active_hud_layout();
    if (layout == nullptr) return false;
    for (size_t index = 0; index < layout->component_count; ++index) {
        const char* id = layout->components[index].id;
        if (id != nullptr && std::strcmp(id, "battle-party-name") == 0) return true;
    }
    return false;
}

void format_battle_hud_name(char* output, const char* label) {
    int cursor = 0;
    while (label != nullptr && label[cursor] != '\0' && cursor < 47) {
        output[cursor] = label[cursor];
        ++cursor;
    }
    output[cursor] = '\0';
}

void update_battle_hud() {
    const bool compact = battle_hud_uses_compact_status();
    const gbs::BattleRpgEncounterData& encounter = project.encounters[encounter_index];
    const int party_index = state.selected_party >= 0 && state.selected_party < encounter.party_count
        ? state.selected_party
        : 0;
    const int enemy_index = state.selected_enemy >= 0 && state.selected_enemy < encounter.enemy_count
        ? state.selected_enemy
        : 0;
    if (encounter.party_count > 0) {
        if (compact) format_battle_hud_name(battle_party_hud_text, encounter.party[party_index].name);
        else format_battle_hud_text(
            battle_party_hud_text,
            encounter.party[party_index].name,
            state.party_hp[party_index],
            encounter.party[party_index].unit.max_hp
        );
        int hp_cursor = 0;
        append_hud_number(battle_party_hp_hud_text, hp_cursor, state.party_hp[party_index]);
        battle_party_hp_hud_text[hp_cursor] = '\0';
        gbs::set_hud_value(battle_hud, gbs::HudValueSource::P1Health,
            state.party_hp[party_index], encounter.party[party_index].unit.max_hp);
    } else {
        battle_party_hud_text[0] = '\0';
        battle_party_hp_hud_text[0] = '\0';
        gbs::set_hud_value(battle_hud, gbs::HudValueSource::P1Health, 0, 0);
    }
    if (encounter.enemy_count > 0) {
        if (compact) format_battle_hud_name(battle_enemy_hud_text, encounter.enemies[enemy_index].name);
        else format_battle_hud_text(
            battle_enemy_hud_text,
            encounter.enemies[enemy_index].name,
            state.enemy_hp[enemy_index],
            encounter.enemies[enemy_index].unit.max_hp
        );
        int hp_cursor = 0;
        append_hud_number(battle_enemy_hp_hud_text, hp_cursor, state.enemy_hp[enemy_index]);
        if (!compact) {
            battle_enemy_hp_hud_text[hp_cursor++] = '/';
            append_hud_number(battle_enemy_hp_hud_text, hp_cursor, encounter.enemies[enemy_index].unit.max_hp);
        }
        battle_enemy_hp_hud_text[hp_cursor] = '\0';
        gbs::set_hud_value(battle_hud, gbs::HudValueSource::P2Health,
            state.enemy_hp[enemy_index], encounter.enemies[enemy_index].unit.max_hp);
    } else {
        battle_enemy_hud_text[0] = '\0';
        battle_enemy_hp_hud_text[0] = '\0';
        gbs::set_hud_value(battle_hud, gbs::HudValueSource::P2Health, 0, 0);
    }
    if (compact) {
        const char* slots[] = { battle_party_hud_text, battle_enemy_hud_text, battle_party_hp_hud_text, battle_enemy_hp_hud_text };
        gbs::set_hud_text_slots(battle_hud, slots, 4);
        return;
    }
    const char* hud_text_slots[] = { battle_party_hud_text, battle_enemy_hud_text, battle_enemy_hp_hud_text };
    gbs::set_hud_text_slots(battle_hud, hud_text_slots, 3);
}

void set_battle_menu_frame(int frame_index) {
    if (battle_menu_dialogue.frame_index != frame_index) {
        const bool visible = battle_menu_dialogue.visible;
        battle_menu_dialogue.visible = false;
        gbs::draw_dialogue(battle_menu_dialogue);
        battle_menu_dialogue.visible = visible;
    }
    gbs::set_dialogue_frame(battle_menu_dialogue, frame_index);
}

void show_battle_prompt() {
    const auto& encounter = project.encounters[encounter_index];
    const int selected = state.selected_party >= 0 && state.selected_party < encounter.party_count ? state.selected_party : 0;
    const char* name = encounter.party_count > 0 ? encounter.party[selected].name : "GRUPO";
    const char prefix[] = "O QUE FARA\n";
    int cursor = 0;
    for (const char character : prefix) if (character != '\0') battle_prompt_text[cursor++] = character;
    // Twenty complete characters fit the three inner rows of the prompt.
    for (int characters = 0; name != nullptr && *name && characters < 20; ++characters) {
        const char* next = name;
        gbs_text_next_codepoint(&next);
        while (name < next) battle_prompt_text[cursor++] = *name++;
    }
    battle_prompt_text[cursor++] = '?';
    battle_prompt_text[cursor] = '\0';
    gbs::show_dialogue(battle_prompt_dialogue, &battle_prompt_line, 1, 0);
    gbs::set_dialogue_frame(battle_prompt_dialogue, gbs::dialogue_frame_battle_prompt);
}

void hide_battle_prompt() {
    gbs::hide_dialogue(battle_prompt_dialogue);
}

void ensure_battle_prompt_visible() {
    if (battle_menu_dialogue.visible &&
        battle_menu_page != BattleMenuPage::Notice &&
        !battle_prompt_dialogue.visible) {
        show_battle_prompt();
    }
}

void show_battle_menu_choices(
    BattleMenuPage page,
    gbs::DialogueChoice* choices,
    size_t choice_count,
    int parent_choice
) {
    battle_menu_page = page;
    battle_menu_parent_choice = parent_choice;
    battle_menu_wait_for_enemy_turn = false;
    gbs::show_dialogue_choices(
        battle_menu_dialogue,
        &battle_menu_line,
        1,
        0,
        choices,
        choice_count
    );
    set_battle_menu_frame(gbs::dialogue_frame_battle_menu);
    show_battle_prompt();
}

void show_battle_menu_root(int selected_choice = 0) {
    show_battle_menu_choices(
        BattleMenuPage::Root,
        battle_root_choices,
        sizeof(battle_root_choices) / sizeof(battle_root_choices[0]),
        selected_choice
    );
    const int clamped_choice = selected_choice < 0 ? 0 :
        selected_choice >= static_cast<int>(sizeof(battle_root_choices) / sizeof(battle_root_choices[0]))
            ? static_cast<int>(sizeof(battle_root_choices) / sizeof(battle_root_choices[0])) - 1
            : selected_choice;
    for (int index = 0; index < clamped_choice; ++index) {
        gbs::advance_dialogue(
            battle_menu_dialogue,
            gbs::InputState { gbs::ButtonDown, gbs::ButtonDown, 0 }
        );
    }
}

void show_battle_menu_notice(const char* text, int parent_choice, bool wait_for_enemy_turn = false) {
    battle_menu_page = BattleMenuPage::Notice;
    battle_menu_parent_choice = parent_choice;
    battle_menu_notice_line.text = text;
    hide_battle_prompt();
    gbs::show_dialogue(
        battle_menu_dialogue,
        &battle_menu_notice_line,
        1,
        0
    );
    set_battle_menu_frame(gbs::dialogue_frame_default);
    battle_menu_parent_choice = parent_choice;
    battle_menu_wait_for_enemy_turn = wait_for_enemy_turn;
    battle_menu_target_is_ally = false;
}

void prepare_battle_move_choices(const gbs::BattleRpgEncounterData& encounter) {
    const gbs::BattleRpgParticipantData& participant = encounter.party[state.selected_party];
    for (int index = 0; index < participant.ability_count; ++index) {
        battle_move_choices[index] = { battle_ability_label(participant.abilities[index].kind), index };
    }
}

void prepare_battle_party_choices(const gbs::BattleRpgEncounterData& encounter) {
    for (int index = 0; index < encounter.party_count; ++index) {
        battle_party_choices[index] = { encounter.party[index].name, index };
    }
}

void prepare_battle_target_choices(const gbs::BattleRpgEncounterData& encounter, bool ally) {
    const gbs::BattleRpgParticipantData* participants = ally ? encounter.party : encounter.enemies;
    const int participant_count = ally ? encounter.party_count : encounter.enemy_count;
    for (int index = 0; index < participant_count; ++index) {
        battle_target_choices[index] = { participants[index].name, index };
    }
}

bool update_battle_menu(const gbs::InputState& input) {
    if (!battle_menu_dialogue.visible) return false;

    const bool dismiss_notice = battle_menu_page == BattleMenuPage::Notice &&
        (input.was_pressed(gbs::ButtonA) || input.was_pressed(gbs::ButtonB));
    if (input.was_pressed(gbs::ButtonB) && !dismiss_notice) {
        if (battle_menu_page == BattleMenuPage::Root) {
            return true;
        }
        const int parent = battle_menu_parent_choice;
        gbs::hide_dialogue(battle_menu_dialogue);
        if (battle_menu_page == BattleMenuPage::Targets) {
            const gbs::BattleRpgEncounterData& encounter = project.encounters[encounter_index];
            prepare_battle_move_choices(encounter);
            show_battle_menu_choices(
                BattleMenuPage::Moves,
                battle_move_choices,
                encounter.party[state.selected_party].ability_count,
                parent
            );
            return true;
        }
        show_battle_menu_root(parent);
        return true;
    }

    const bool navigation_pressed = input.was_pressed(gbs::ButtonUp) ||
        input.was_pressed(gbs::ButtonDown) ||
        input.was_pressed(gbs::ButtonLeft) ||
        input.was_pressed(gbs::ButtonRight);
    if (navigation_pressed && !input.was_pressed(gbs::ButtonA)) {
        gbs::advance_dialogue(battle_menu_dialogue, input);
        return true;
    }
    if (!input.was_pressed(gbs::ButtonA) && !dismiss_notice) return false;

    gbs::advance_dialogue(battle_menu_dialogue, input);
    if (battle_menu_dialogue.visible) return true;
    const int selected_choice = battle_menu_dialogue.last_choice_index;
    const gbs::BattleRpgEncounterData& encounter = project.encounters[encounter_index];

    if (battle_menu_page == BattleMenuPage::Root) {
        if (selected_choice == 0) {
            prepare_battle_move_choices(encounter);
            show_battle_menu_choices(
                BattleMenuPage::Moves,
                battle_move_choices,
                encounter.party[state.selected_party].ability_count,
                0
            );
            return true;
        }
        if (selected_choice == 1) {
            prepare_battle_party_choices(encounter);
            show_battle_menu_choices(
                BattleMenuPage::Party,
                battle_party_choices,
                encounter.party_count,
                1
            );
            return true;
        }
        if (selected_choice == 2) {
            show_battle_menu_choices(BattleMenuPage::Items, battle_item_choices, 1, 2);
            return true;
        }
        if (gbs::try_escape_battle(state, encounter)) {
            hide_battle_prompt();
            if (gbastudio_battle_rpg_project::save_autosave) {
                persist_battle_rpg_runtime_state();
            }
            return true;
        }
        show_battle_menu_notice("NAO HA ROTA DE FUGA!", 3);
        return true;
    }

    if (battle_menu_page == BattleMenuPage::Moves) {
        state.selected_ability = selected_choice;
        const gbs::BattleRpgParticipantData& participant = encounter.party[state.selected_party];
        const bool target_is_ally = participant.abilities[selected_choice].kind == gbs::BattleRpgAbilityKind::Heal;
        const int target_count = target_is_ally ? encounter.party_count : encounter.enemy_count;
        if (target_count > 1) {
            battle_menu_target_is_ally = target_is_ally;
            prepare_battle_target_choices(encounter, target_is_ally);
            show_battle_menu_choices(
                BattleMenuPage::Targets,
                battle_target_choices,
                target_count,
                0
            );
            return true;
        }
        const bool action_started = gbs::use_selected_battle_ability(state, encounter);
        if (action_started && gbastudio_battle_rpg_project::save_autosave) {
            persist_battle_rpg_runtime_state();
        }
        const bool battle_finished = state.outcome != gbs::BattleRpgOutcome::InProgress;
        show_battle_menu_notice(
            !action_started ? "ACAO INDISPONIVEL!" :
                state.outcome == gbs::BattleRpgOutcome::Victory ? "VITORIA!" :
                state.outcome == gbs::BattleRpgOutcome::Defeat ? "DERROTA!" : "ACAO EXECUTADA.",
            0,
            action_started && !battle_finished
        );
        return true;
    }

    if (battle_menu_page == BattleMenuPage::Targets) {
        if (battle_menu_target_is_ally) {
            state.selected_ally = selected_choice;
        } else {
            state.selected_enemy = selected_choice;
        }
        const bool action_started = gbs::use_selected_battle_ability(state, encounter);
        if (action_started && gbastudio_battle_rpg_project::save_autosave) {
            persist_battle_rpg_runtime_state();
        }
        const bool battle_finished = state.outcome != gbs::BattleRpgOutcome::InProgress;
        show_battle_menu_notice(
            !action_started ? "ACAO INDISPONIVEL!" :
                state.outcome == gbs::BattleRpgOutcome::Victory ? "VITORIA!" :
                state.outcome == gbs::BattleRpgOutcome::Defeat ? "DERROTA!" : "ACAO EXECUTADA.",
            0,
            action_started && !battle_finished
        );
        return true;
    }

    if (battle_menu_page == BattleMenuPage::Party) {
        if (selected_choice >= 0 && selected_choice < encounter.party_count) {
            state.selected_party = selected_choice;
        }
        show_battle_menu_notice("EQUIPE SELECIONADA.", 1);
        return true;
    }

    if (battle_menu_page == BattleMenuPage::Items) {
        show_battle_menu_notice("NAO HA ITENS DISPONIVEIS.", 2);
        return true;
    }

    const bool waiting_for_enemy_turn = battle_menu_wait_for_enemy_turn;
    const int parent = battle_menu_parent_choice;
    if (state.outcome != gbs::BattleRpgOutcome::InProgress) {
        gbs::hide_dialogue(battle_menu_dialogue);
        return true;
    }
    if (waiting_for_enemy_turn) {
        battle_menu_page = BattleMenuPage::Root;
        battle_menu_parent_choice = 0;
        battle_menu_wait_for_enemy_turn = false;
        battle_menu_target_is_ally = false;
        return true;
    }
    show_battle_menu_root(parent);
    return true;
}

bool stream_encounter_resource_group(const gbs::BattleRpgEncounterData& encounter) {
    if (project.resource_bank_group_count == 0) {
        return true;
    }
    const gbs::ResourceBankGroup group = gbs::resource_bank_group_from_battle_rpg_encounter(
        project,
        encounter
    );
    if (group.bank_count == 0) {
        return false;
    }
    return gbs::stream_resource_bank_group_with_uploads(
        resource_manager,
        active_resource_bank_group,
        scratch_resource_bank_group,
        group,
        gbastudio_battle_rpg_project::resource_bank_upload_sources,
        gbastudio_battle_rpg_project::resource_bank_upload_source_count
    ).success;
}

void apply_battle_visuals(const gbs::BattleRpgEncounterData& encounter) {
    battle_ui_restore_pending = true;
    /* Battle scenes use a dedicated authored layer (normally BG2). Disable
     * optional layers first so a previous runtime cannot leak stale maps into
     * the encounter, then enable the layer selected by the encounter below. */
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG1, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG2, false);
    gbs::set_bg_enabled(gbs::BackgroundLayer::BG3, false);
    const bool resources_ready = stream_encounter_resource_group(encounter);
    if (!resources_ready) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        return;
    }
    if (project.resource_bank_group_count == 0) {
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
    /* Background banks may overwrite palette 15; restore the native dialogue
     * tiles and colors before drawing the dynamic battle command band. */
    gbs::render_ui_assets();
    const gbs::BattleRpgBackgroundData* background = gbs::battle_rpg_background_for(
        project,
        encounter
    );
    if (background == nullptr) {
        return;
    }
    gbs::set_backdrop_color(background->backdrop_color);
    gbs::load_tilemap(background->layer, background->tilemap);
    gbs::set_bg_enabled(background->layer, true);
    gbs::set_bg_scroll(background->layer, 0, 0);
}

void clear_battle_meter_tiles(int x, int y, int width) {
    for (int offset = 0; offset < width; ++offset) {
        gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x + offset, y, 32, 32, 0);
    }
}

void draw_battle_participant_metasprite(
    int first_index,
    const gbs::MetaSprite& metasprite,
    gbs::Vec2i position,
    uint8_t sprite_scale
) {
    if (sprite_scale <= 1) {
        gbs::set_metasprite(first_index, metasprite, position);
        return;
    }

    for (uint8_t part_index = 0; part_index < metasprite.part_count; ++part_index) {
        const gbs::MetaSpritePart& part = metasprite.parts[part_index];
        if (part.width > 32 || part.height > 32) {
            gbs::set_metasprite(first_index, metasprite, position);
            return;
        }
        gbs::set_sprite(first_index + part_index, gbs::Sprite {
            position.x + part.x * 2 - part.width / 2,
            position.y + part.y * 2 - part.height / 2,
            part.tile_index,
            part.palette,
            part.hflip,
            part.vflip,
            true,
            0,
            gbs::SpriteRenderMode::Normal,
            false,
            part.width,
            part.height,
            true,
            true,
            0,
            part.color_depth
        });
    }
}

void draw_battle_meters(const gbs::BattleRpgEncounterData& encounter) {
    const gbs::HudLayout* layout = gbs::active_hud_layout();
    bool authored_meters = layout != nullptr && layout->id != nullptr
        && std::strcmp(layout->id, "hud-neutral-batalha-rpg") == 0;
    if (layout != nullptr) {
        for (size_t index = 0; index < layout->component_count; ++index) {
            if (layout->components[index].value_source == gbs::HudValueSource::P1Health
                || layout->components[index].value_source == gbs::HudValueSource::P2Health) {
                authored_meters = true;
                break;
            }
        }
    }
    // Authored HUDs also own BG frames. Clearing legacy meter cells here
    // would erase their borders before the pending UI map is committed.
    if (authored_meters) return;
    for (int index = 0; index < encounter.party_count; ++index) {
        const int hp_tiles = (state.party_hp[index] * 5) / encounter.party[index].unit.max_hp;
        const uint16_t party_tile = index == state.selected_party ? 4 :
            index == state.selected_ally ? 9 : 1;
        clear_battle_meter_tiles(2, 3 + index * 3, 5);
        for (int x = 2; x < 7; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 3 + index * 3, 32, 32, party_tile);
        }
        for (int x = 2; x < 2 + hp_tiles; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 3 + index * 3, 32, 32, 2);
        }
    }
    for (int index = 0; index < encounter.enemy_count; ++index) {
        const int hp_tiles = (state.enemy_hp[index] * 5) / encounter.enemies[index].unit.max_hp;
        const uint16_t tile = index == state.selected_enemy ? 4 : 1;
        clear_battle_meter_tiles(22, 3 + index * 2, 5);
        for (int x = 22; x < 27; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 3 + index * 2, 32, 32, tile);
        }
        for (int x = 22; x < 22 + hp_tiles; ++x) {
            gbs::set_bg_tile(gbs::BackgroundLayer::BG0, x, 3 + index * 2, 32, 32, 3);
        }
    }
}

void draw_battle() {
    const gbs::BattleRpgEncounterData& encounter = project.encounters[encounter_index];
    // The image HUD owns its OAM slots; the hardware helper protects them
    // while the world actor range is refreshed.
    gbs::hide_sprites(0, 88);
    draw_battle_meters(encounter);
    int sprite_index = 0;
    gbs::set_affine_sprite_transform(0, gbs::AffineSpriteTransform { 128, 0, 0, 128 });
    for (int index = 0; index < encounter.party_count && sprite_index < 128; ++index) {
        const gbs::MetaSprite* metasprite = gbs::battle_rpg_participant_metasprite_for(
            encounter.party[index]
        );
        if (metasprite == nullptr || state.party_hp[index] <= 0) {
            continue;
        }
        draw_battle_participant_metasprite(
            sprite_index,
            *metasprite,
            gbs::Vec2i { 48, 32 + index * 40 },
            encounter.party[index].sprite_scale
        );
        sprite_index += metasprite->part_count;
    }
    for (int index = 0; index < encounter.enemy_count && sprite_index < 128; ++index) {
        const gbs::MetaSprite* metasprite = gbs::battle_rpg_participant_metasprite_for(
            encounter.enemies[index]
        );
        if (metasprite == nullptr || state.enemy_hp[index] <= 0) {
            continue;
        }
        draw_battle_participant_metasprite(
            sprite_index,
            *metasprite,
            gbs::Vec2i { 176, 24 + index * 28 },
            encounter.enemies[index].sprite_scale
        );
        sprite_index += metasprite->part_count;
    }
}

bool persist_battle_rpg_runtime_state(int slot_index) {
#if GBS_MULTI_RUNTIME
    // Runtime-local snapshots cannot overwrite a shared campaign checkpoint.
    (void)slot_index;
    return false;
#else
    if (!gbastudio_battle_rpg_project::save_enabled || slot_index < 0) {
        return false;
    }
    gbs::BattleRpgSaveData save_data {};
    gbs::capture_battle_rpg_save_data(
        save_data,
        encounter_index,
        state,
        event_state,
        gbs::frame_count()
    );
    ++battle_save_sequence;
    const gbs::SaveMetadata metadata = gbs::make_save_metadata(
        "BATTLE RPG",
        gbs::frame_count(),
        battle_save_sequence,
        static_cast<uint16_t>(encounter_index),
        static_cast<uint16_t>(state.outcome)
    );
    return gbs::write_save_slot_record(
        gbastudio_battle_rpg_project::save_bank,
        static_cast<size_t>(slot_index),
        &save_data,
        sizeof(save_data),
        metadata,
        battle_save_sequence
    ) == gbs::SaveStatus::Ok;
#endif
}

bool restore_battle_rpg_runtime_state(int slot_index) {
#if GBS_MULTI_RUNTIME
    return restore_battle_rpg_checkpoint(slot_index);
#else
    if (!gbastudio_battle_rpg_project::save_enabled) {
        return false;
    }
    if (slot_index < 0) {
        slot_index = gbs::find_latest_save_slot(gbastudio_battle_rpg_project::save_bank);
    }
    if (slot_index < 0) {
        return false;
    }
    gbs::BattleRpgSaveData save_data {};
    gbs::SaveMetadata metadata {};
    size_t bytes_read = 0;
    if (gbs::read_save_slot_record(
        gbastudio_battle_rpg_project::save_bank,
        static_cast<size_t>(slot_index),
        &save_data,
        sizeof(save_data),
        &metadata,
        &bytes_read
    ) != gbs::SaveStatus::Ok || bytes_read != sizeof(save_data)) {
        return false;
    }
    if (!gbs::apply_battle_rpg_save_data(project, save_data, encounter_index, state, event_state)) {
        return false;
    }
    battle_save_sequence = gbs::inspect_save_slot(
        gbastudio_battle_rpg_project::save_bank,
        static_cast<size_t>(slot_index)
    ).sequence;
    return true;
#endif
}

void update_battle_controls(const gbs::InputState& input) {
    update_battle_menu(input);
}

#if !GBS_MULTI_RUNTIME
bool restart_standalone_battle_from_transition() {
    if (!gbs::consume_battle_rpg_runtime_transition(
            project,
            event_state,
            encounter_index,
            state)) {
        return false;
    }
    gbs::init_dialogue(dialogue);
    gbs::init_dialogue(battle_prompt_dialogue);
    gbs::init_dialogue(battle_menu_dialogue);
    gbs::init_hud(battle_hud);
    battle_menu_page = BattleMenuPage::Root;
    battle_menu_parent_choice = 0;
    battle_menu_wait_for_enemy_turn = false;
    battle_menu_target_is_ally = false;
    gbs::init_event_runner(battle_event_runner);
    battle_event_wait_frames = 0;
    battle_script_controls_dialogue = false;
    outcome_hook_started = false;
    outcome_hook_handled = false;
    apply_battle_visuals(project.encounters[encounter_index]);
    start_battle_event_script(project.encounters[encounter_index].on_enter);
    if (gbastudio_battle_rpg_project::save_autosave) {
        persist_battle_rpg_runtime_state();
    }
    return true;
}
#endif

} // namespace

int initialize_battle_rpg_runtime() {
    gbs::init();
    gbs::init_dialogue(dialogue);
    gbs::init_dialogue(battle_prompt_dialogue);
    gbs::init_dialogue(battle_menu_dialogue);
    gbs::init_hud(battle_hud);
    gbs::init_event_state(event_state);
    gbs::init_event_runner(battle_event_runner);
    gbs::init_resource_manager(resource_manager);
    gbs::reset_runtime_telemetry();
    gbs::set_backdrop_color(gbs::rgb15(2, 2, 7));

    if (!gbs::is_valid_battle_rpg_project_data(project)) {
        gbs::set_backdrop_color(gbs::rgb15(31, 0, 0));
        while (true) {
            gbs::wait_vblank();
        }
    }

    encounter_index = project.initial_encounter;
    int restore_slot_index = -1;
    bool restore_entry = false;
    bool runtime_entry = false;
#if GBS_MULTI_RUNTIME
    int entry_x = 0;
    int entry_y = 0;
    restore_entry = gbs::consume_runtime_save_restore(gbs::RuntimeKind::BattleRpg, restore_slot_index);
    if (!restore_entry) {
        runtime_entry = gbs::consume_runtime_transition(
            gbs::RuntimeKind::BattleRpg,
            event_state,
            encounter_index,
            entry_x,
            entry_y
        );
    }
#endif
    if (encounter_index < 0 || static_cast<size_t>(encounter_index) >= project.encounter_count) {
        encounter_index = project.initial_encounter;
    }
    state = gbs::make_battle_rpg_runtime_state(project.encounters[encounter_index]);
    bool restored = false;
    if (restore_entry) {
        restored = restore_battle_rpg_runtime_state(restore_slot_index);
        if (!restored) {
            return -1;
        }
    }
#if !GBS_MULTI_RUNTIME
    if (!runtime_entry) {
        restored = restore_battle_rpg_runtime_state(-1);
    }
#endif
#if !GBS_MULTI_RUNTIME
    outcome_hook_started = restored && state.outcome != gbs::BattleRpgOutcome::InProgress;
    outcome_hook_handled = outcome_hook_started;
#endif
    apply_battle_visuals(project.encounters[encounter_index]);
#if GBS_MULTI_RUNTIME
    if (restored) {
        if (checkpoint_music_index >= 0) gbs::play_music(project.music_assets[checkpoint_music_index]);
        if (checkpoint_tracker_index >= 0) gbs::play_tracker_music(project.tracker_assets[checkpoint_tracker_index]);
    }
#endif
    if (!restored) {
        const gbs::BattleRpgEncounterData& encounter = project.encounters[encounter_index];
        start_battle_event_script(encounter.on_enter);
        if (gbastudio_battle_rpg_project::save_autosave) {
            persist_battle_rpg_runtime_state();
        }
    }
    gbastudio_dialogue_ui::configure();
    gbastudio_dialogue_ui::configure_for_scene(project.encounters[encounter_index].name);
    if (state.outcome == gbs::BattleRpgOutcome::InProgress &&
        !state.enemy_turn_pending &&
        !gbs::event_runner_is_active(battle_event_runner)) {
        show_battle_menu_root();
    }

    return 0;
}

gbs::RuntimeAdapterFrameResult update_battle_rpg_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    gbastudio_dialogue_ui::configure_for_scene(project.encounters[encounter_index].name);
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
    gbs::update_hud_behavior(event_state, battle_hud.visible);
    const bool script_active = update_battle_event_script(input);
    if (!script_active && !dialogue.visible) {
        if (state.outcome == gbs::BattleRpgOutcome::InProgress) {
            if (!battle_menu_dialogue.visible && !state.enemy_turn_pending) {
                show_battle_menu_root(battle_menu_parent_choice);
            }
            update_battle_controls(input);
            if (!battle_menu_dialogue.visible) {
                gbs::tick_battle_rpg(state, project.encounters[encounter_index]);
            }
            if (!battle_menu_dialogue.visible && !state.enemy_turn_pending &&
                state.outcome == gbs::BattleRpgOutcome::InProgress) {
                show_battle_menu_root(battle_menu_parent_choice);
            }
        } else if (battle_menu_dialogue.visible) {
            update_battle_controls(input);
        }
    }

    if (state.outcome != gbs::BattleRpgOutcome::InProgress && !outcome_hook_started) {
        outcome_hook_started = true;
        const gbs::EventScript outcome_script = gbs::battle_rpg_outcome_script(
            project.encounters[encounter_index],
            state.outcome
        );
        outcome_hook_handled = !start_battle_event_script(outcome_script);
        persist_battle_rpg_runtime_state();
    } else if (outcome_hook_started && !outcome_hook_handled &&
        !gbs::event_runner_is_active(battle_event_runner) &&
        !battle_script_controls_dialogue && battle_event_wait_frames == 0) {
        outcome_hook_handled = true;
    }

#if GBS_MULTI_RUNTIME
    if (gbs::runtime_transition_pending()) {
        return gbs::RuntimeAdapterFrameResult::Transition;
    }
#else
    if (gbs::runtime_transition_pending() &&
        !restart_standalone_battle_from_transition()) {
        return gbs::RuntimeAdapterFrameResult::Error;
    }
#endif

    return gbs::RuntimeAdapterFrameResult::Continue;
}

void render_battle_rpg_runtime(const gbs::RuntimeFrameContext& context) {
    (void)context;
    draw_battle();
    update_battle_hud();
    ensure_battle_prompt_visible();
    sync_runtime_telemetry();

    /* Complete entry uploads before restoring UI colors once. Stable frames
     * stage actors and UI together before their single publication VBlank. */
    if (battle_ui_restore_pending) {
        gbs::wait_vblank();
        gbs::render_ui_assets();
        battle_ui_restore_pending = false;
    }
    if (dialogue.visible) {
        gbs::draw_dialogue(dialogue);
    } else {
        gbs::draw_dialogue(battle_prompt_dialogue);
        gbs::draw_dialogue(battle_menu_dialogue);
    }
    /* Draw the battle HUD last so the status labels remain visible after
     * the dialogue layer refreshes its UI resources and BG0 contents. */
    gbs::draw_hud(battle_hud);
    gbs::wait_vblank();
}

void leave_battle_rpg_runtime() {
    gbs::release_resource_bank_group(resource_manager, active_resource_bank_group);
}

extern "C" void GBS_BATTLE_RPG_RUNTIME_ENTER(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    battle_initialization_result = initialize_battle_rpg_runtime();
}

extern "C" gbs::RuntimeAdapterFrameResult GBS_BATTLE_RPG_RUNTIME_UPDATE(
    const gbs::RuntimeFrameContext& context
) {
    if (battle_initialization_result != 0) return gbs::RuntimeAdapterFrameResult::Error;
    return update_battle_rpg_runtime(context);
}

extern "C" void GBS_BATTLE_RPG_RUNTIME_RENDER(const gbs::RuntimeFrameContext& context) {
    render_battle_rpg_runtime(context);
}

extern "C" void GBS_BATTLE_RPG_RUNTIME_LEAVE(const gbs::RuntimeAdapter& adapter) {
    (void)adapter;
    leave_battle_rpg_runtime();
}

extern "C" int GBS_BATTLE_RPG_RUNTIME_ENTRY() {
    battle_initialization_result = initialize_battle_rpg_runtime();
    if (battle_initialization_result != 0) {
        leave_battle_rpg_runtime();
        return battle_initialization_result;
    }

    while (true) {
        const gbs::RuntimeFrameContext context {
            gbs::frame_count(),
            gbs::RuntimeKind::BattleRpg,
            encounter_index,
            nullptr,
            0
        };
        const gbs::RuntimeAdapterFrameResult result = update_battle_rpg_runtime(context);
        if (result == gbs::RuntimeAdapterFrameResult::Error) {
            leave_battle_rpg_runtime();
            return -1;
        }
        render_battle_rpg_runtime(context);
        if (result != gbs::RuntimeAdapterFrameResult::Continue) {
            leave_battle_rpg_runtime();
            return 0;
        }
    }
}
