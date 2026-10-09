#pragma once

#include <stddef.h>
#include <stdint.h>
#include "gbs/text_variables.hpp"
#include "gbs/link.hpp"

namespace gbs {

constexpr size_t event_variable_count = 64;

struct TileAsset;
struct RuntimeTransitionRoute;

enum class EventOp : uint8_t {
    End = 0,
    ShowDialogue = 1,
    Warp = 2,
    SetVariable = 3,
    PlaySfx = 4,
    ClearVariable = 5,
    AddVariable = 6,
    Jump = 7,
    JumpIfVariableEquals = 8,
    JumpIfVariableNotEquals = 9,
    JumpIfVariableSet = 10,
    ShowDialogueIf = 11,
    PlayMusic = 12,
    StopMusic = 13,
    CloseDialogue = 14,
    Wait = 15,
    SetCameraPosition = 16,
    FollowCamera = 17,
    LockCamera = 18,
    SetActorVisible = 19,
    SetActorActive = 20,
    SetActorPosition = 21,
    MoveActor = 22,
    SetActorDirection = 23,
    SetActorSpeed = 24,
    SetActorAnimation = 25,
    CallScript = 26,
    ShowChoice = 27,
    OpenTextInput = 28,
    OpenCodeLock = 29,
    OpenEquipMenu = 30,
    SetEquippedItem = 31,
    PushActor = 32,
    SetPlayerSpeedProfile = 33,
    SetPlayerMovementState = 34,
    StartGameClock = 35,
    AdvanceTime = 36,
    SetStat = 37,
    ModifyStat = 38,
    ShowStatBar = 39,
    ShowHearts = 40,
    ModifyWallet = 41,
    ShowNumberHud = 42,
    SetActorAnimationSpeed = 43,
    SetCameraShake = 44,
    ReplaceTile = 45,
    OverlayLine = 46,
    OverlayShow = 47,
    OverlayMove = 48,
    OverlayHide = 49,
    MuteAudioChannel = 50,
    RunAudioRoutine = 51,
    SetDialogueTextSpeed = 52,
    SetTextSfx = 53,
    SetDialogueFrame = 54,
    SetActorAnimationFrame = 55,
    MultiplyVariable = 56,
    DivideVariable = 57,
    ModuloVariable = 58,
    RandomVariable = 59,
    SetRandomSeed = 60,
    MoveCamera = 61,
    SetCameraBoundsX = 62,
    SetCameraBoundsY = 63,
    JumpIfVariableGreaterThan = 64,
    JumpIfVariableLessThan = 65,
    JumpIfVariableEqualsVariable = 66,
    JumpIfRoomEquals = 67,
    StoreEngineField = 68,
    JumpIfEngineFieldEquals = 69,
    JumpIfEngineFieldEqualsVariable = 70,
    JumpIfButtonPressed = 71,
    AddInventoryItem = 72,
    RemoveInventoryItem = 73,
    JumpIfInventoryAtLeast = 74,
    JumpIfActorDirection = 75,
    JumpIfActorAtPosition = 76,
    JumpIfActorDistance = 77,
    JumpIfActorRelative = 78,
    WaitButtonPressed = 79,
    WaitActorAnimation = 80,
    StoreActorPosition = 81,
    StoreActorDirection = 82,
    SetActorCollisionEnabled = 83,
    SetAllSpritesVisible = 84,
    PushActorAwayFromPlayer = 85,
    AddVariableFlags = 86,
    SetVariableFlags = 87,
    ClearVariableFlags = 88,
    ResetVariablesFalse = 89,
    FadeOut = 90,
    FadeIn = 91,
    SetCameraProperty = 92,
    AttachButtonEvent = 93,
    RemoveButtonEvent = 94,
    AttachTimerEvent = 95,
    RestartTimerEvent = 96,
    RemoveTimerEvent = 97,
    RateLimit = 98,
    SaveGame = 99,
    LoadGame = 100,
    RemoveSaveGame = 101,
    JumpIfSaveExists = 102,
    StoreSaveExists = 103,
    ProjectileLoadSlot = 104,
    LaunchProjectile = 105,
    LaunchProjectileSlot = 106,
    SetPlayerAnimation = 107,
    ShowActorGesture = 108,
    LockScript = 109,
    UnlockScript = 110,
    SceneStackPush = 111,
    SceneStackClear = 112,
    SceneStackPrevious = 113,
    SceneStackFirst = 114,
    StartActorUpdateScript = 115,
    StopActorUpdateScript = 116,
    StartSegment = 117,
    StopSegment = 118,
    AttachPlatformCallback = 119,
    RemovePlatformCallback = 120,
    AttachAdventureCallback = 121,
    RemoveAdventureCallback = 122,
    PauseSceneType = 123,
    ResumeSceneType = 124,
    SetEngineField = 125,
    SetActorCollisionBox = 126,
    SetBackgroundPalette = 127,
    SetSpritePalette = 128,
    PlayerBounce = 129,
    LinkHost = 130,
    LinkJoin = 131,
    LinkClose = 132,
    LinkTransfer = 133,
    PlayPcmSfx = 134,
    WarpRuntime = 135,
    VisualEffect = 136,
    SetAudioVolume = 137,
    FadeAudioVolume = 138,
    SetActorSprite = 139,
    SeedRandom = 140,
    SetPlatformerState = 141,
    ReplaceTileSequence = 142,
    SetDialogueLanguage = 143,
    SetPlayerDirection = 144,
    ReadRtc = 145,
    JumpIfRtcEquals = 146,
    RumbleOn = 147,
    RumbleOnFor = 148,
    RumbleOff = 149,
    MultiplayerOpen = 150,
    MultiplayerClose = 151,
    MultiplayerSetData = 152,
    MultiplayerTransfer = 153,
    MultiplayerGetData = 154,
    SetBackground = 155,
    LutaControl = 156,
    CancelActorMovement = 157,
    ActorEffects = 158,
    OpenMenu = 159,
    OpenShop = 160,
    SetAdventureState = 161,
    DrawText = 162
};

enum class VisualEffectKind : uint8_t {
    Clear = 0,
    PaletteFlash = 1,
    Mosaic = 2,
    Letterbox = 3,
    Wave = 4,
    WaterRipple = 5,
    ParallaxLineScroll = 6,
    Push = 7,
    Pull = 8,
    Mask = 9,
    ColorFade = 10,
    Fade = 11
};

enum class VisualEffectTarget : uint8_t {
    All = 0,
    Bg0 = 1,
    Bg1 = 2,
    Bg2 = 3,
    Bg3 = 4,
    Obj = 5,
    Screen = 6
};

constexpr int16_t pack_visual_effect(VisualEffectKind kind, VisualEffectTarget target) {
    return static_cast<int16_t>(
        static_cast<uint16_t>(kind) |
        (static_cast<uint16_t>(target) << 8)
    );
}

constexpr VisualEffectKind unpack_visual_effect_kind(int packed) {
    return static_cast<VisualEffectKind>(packed & 0xFF);
}

constexpr VisualEffectTarget unpack_visual_effect_target(int packed) {
    return static_cast<VisualEffectTarget>((packed >> 8) & 0xFF);
}

enum class RuntimeKind : uint8_t {
    TopDown = 0,
    Platformer = 1,
    Isometric = 2,
    Menu = 3,
    Shmup = 4,
    PointClick = 5,
    DungeonCrawler = 6,
    Racing = 7,
    Cutscene = 8,
    VisualNovel = 9,
    WorldMap = 10,
    BattleRpg = 11,
    Luta = 12
};

struct EventCommand {
    EventOp op;
    int16_t a;
    int16_t b;
    int16_t c;
    int16_t d = 0;
};

struct EventScript {
    const EventCommand* commands;
    size_t command_count;
};

enum class LutaEventAction : uint8_t {
    StartMatch, EndMatch, SetSuperGauge, AddSuperGauge, SetGuardPower,
    SetIsmStyle, TriggerSuper, EnableAlphaCounter, SetRoundTimer, SetRoundsToWin
};
constexpr size_t max_event_luta_commands = 16;

enum class EventActorOp : uint8_t {
    None = 0,
    SetVisible = 1,
    SetActive = 2,
    SetPosition = 3,
    MoveRelative = 4,
    SetDirection = 5,
    SetSpeed = 6,
    SetAnimation = 7,
    SetAnimationSpeed = 8,
    SetAnimationFrame = 9,
    SetCollisionEnabled = 10,
    SetCollisionBox = 11,
    SetSprite = 12,
    Push = 13,
    CancelMovement = 14,
    PushFacing = 15
};

struct EventActorCommand {
    EventActorOp op;
    int actor_index;
    int a;
    int b;
    int c = 0;
    int d = 0;
};

struct EventDrawText { int line=-1; int x=0; int y=0; bool overlay=true; };
constexpr size_t max_event_draw_text_entries=8;

struct EventTileCommand {
    int layer;
    int x;
    int y;
    int tile;
    int count;
    int tile_asset;
};

constexpr size_t max_event_actor_commands = 8;
constexpr size_t max_event_tile_commands = 8;
constexpr size_t max_event_script_queue_entries = 8;
constexpr size_t max_event_equipment_slots = 8;
constexpr size_t max_event_stats = 8;
constexpr size_t max_event_inventory_items = 16;
constexpr bool is_valid_inventory_item_index(int index) {
    return index >= 0 && static_cast<size_t>(index) < max_event_inventory_items;
}
// O runtime top-down mantem ate 96 NPCs por sala. Os comandos de evento
// precisam enderecar todos eles, mesmo quando apenas uma parte esta no OAM.
constexpr size_t max_event_actor_state_slots = 96;
constexpr int event_player_actor_index = -1;

struct EventPlayerRuntimeState {
    bool active;
    int x;
    int y;
    int direction;
    int movement_speed_x100 = 100;
    int movement_step_accumulator = 0;
    int sprite_index = -1;
    bool movement_cancelled = false;
};

constexpr bool apply_event_player_command(
    EventPlayerRuntimeState& player,
    const EventActorCommand& command
) {
    if (command.actor_index != event_player_actor_index) {
        return false;
    }
    switch (command.op) {
    case EventActorOp::SetActive:
        player.active = command.a != 0;
        return true;
    case EventActorOp::SetPosition:
        player.x = command.a;
        player.y = command.b;
        return true;
    case EventActorOp::MoveRelative:
        player.x += command.a;
        player.y += command.b;
        return true;
    case EventActorOp::SetDirection:
        player.direction = command.a;
        return true;
    case EventActorOp::SetSpeed:
        player.movement_cancelled = false;
        player.movement_speed_x100 = command.a < 0 ? 0 : command.a;
        player.movement_step_accumulator = 0;
        return true;
    case EventActorOp::SetSprite:
        player.sprite_index = command.a;
        return true;
    case EventActorOp::CancelMovement:
        player.movement_step_accumulator = 0;
        player.movement_cancelled = true;
        return true;
    default:
        return false;
    }
}

constexpr int consume_event_player_movement_step(
    EventPlayerRuntimeState& player,
    bool movement_requested
) {
    if (player.movement_cancelled) {
        player.movement_cancelled = false;
        return 0;
    }
    if (!player.active || !movement_requested || player.movement_speed_x100 <= 0) {
        return 0;
    }
    player.movement_step_accumulator += player.movement_speed_x100;
    const int pixels = player.movement_step_accumulator / 100;
    player.movement_step_accumulator %= 100;
    return pixels;
}

constexpr size_t max_event_button_bindings = 8;
constexpr size_t max_event_timer_bindings = 8;
constexpr size_t max_event_rate_limit_slots = 32;
constexpr size_t max_event_save_slots = 8;
constexpr size_t max_event_projectile_slots = 8;
constexpr size_t max_event_script_locks = 128;
constexpr size_t max_event_scene_stack_entries = 8;
constexpr size_t max_event_segments = 32;
constexpr size_t max_event_platform_callbacks = 21;
constexpr size_t max_event_adventure_callbacks = 8;
constexpr size_t max_event_scene_types = 16;

struct EventButtonBinding {
    uint16_t button;
    int script;
    bool override_default;
};

struct EventTimerBinding {
    int script;
    int frames;
    int remaining_frames;
};

struct EventSceneStackEntry {
    RuntimeKind runtime;
    int room;
    int player_x;
    int player_y;
    int player_direction;
};

struct EventState {
    EventCommand luta_commands[max_event_luta_commands];
    size_t luta_command_count;
    int current_room;
    int player_x;
    int player_y;
    int player_direction;
    int actor_condition_tile_size;
    uint16_t input_held;
    uint16_t input_pressed;
    uint16_t input_released;
    int variables[event_variable_count];
    char text_variables[text_variable_count][text_variable_max_length + 1];
    uint32_t random_seed;
    int last_dialogue;
    int last_sfx;
    int last_pcm_sfx;
    int last_pcm_sfx_volume;
    int last_pcm_sfx_priority;
    int last_music;
    int last_tracker_music;
    bool stop_music;
    bool close_dialogue;
    int wait_frames;
    bool camera_changed;
    bool camera_follow_player;
    int camera_x;
    int camera_y;
    int camera_shake_frames;
    int camera_shake_magnitude;
    bool camera_move_changed;
    int camera_delta_x;
    int camera_delta_y;
    bool camera_bounds_x_changed;
    int camera_bounds_min_x;
    int camera_bounds_max_x;
    bool camera_bounds_y_changed;
    int camera_bounds_min_y;
    int camera_bounds_max_y;
    bool camera_property_changed;
    int camera_property;
    int camera_property_value;
    EventActorCommand actor_commands[max_event_actor_commands];
    size_t actor_command_count;
    EventTileCommand tile_commands[max_event_tile_commands];
    size_t tile_command_count;
    int last_text_input_variable;
    int text_input_max_length;
    int text_input_charset;
    int last_code_lock_variable;
    int code_lock_digits;
    int code_lock_code;
    int equip_menu_slots;
    bool equip_menu_pause;
    bool equip_menu_requested;
    int menu_response_variable;
    int last_shop_actor;
    int equipped_items[max_event_equipment_slots];
    int inventory[max_event_inventory_items];
    int actor_x[max_event_actor_state_slots];
    int actor_y[max_event_actor_state_slots];
    int actor_direction[max_event_actor_state_slots];
    bool actor_animation_playing[max_event_actor_state_slots];
    bool actor_update_script_enabled[max_event_actor_state_slots];
    int player_walk_speed;
    int player_run_speed;
    int player_stamina_cost;
    int player_movement_state;
    int player_movement_tile_tag;
    bool platformer_state_changed;
    int platformer_next_state;
    int platformer_blank_gravity;
    int clock_minute;
    int clock_frame_accumulator;
    int clock_minutes_per_tick;
    int clock_frames_per_tick;
    bool clock_hud_enabled;
    int stats[max_event_stats];
    int stat_max[max_event_stats];
    int hud_stat_bar_stat;
    int hud_stat_bar_x;
    int hud_stat_bar_width;
    int hud_hearts_stat;
    int hud_units_per_heart;
    int hud_heart_count;
    int hud_number_variable;
    int hud_number_x;
    int hud_number_digits;
    bool overlay_visible;
    int overlay_x;
    int overlay_y;
    int overlay_width;
    int overlay_height;
    int overlay_line;
    bool overlay_line_changed;
    int overlay_transition_frames;
    bool overlay_show_requested;
    int overlay_show_x;
    int overlay_show_y;
    int overlay_show_width;
    int overlay_show_height;
    bool overlay_move_requested;
    bool overlay_hide_requested;
    bool audio_mute_changed;
    int audio_mute_channel;
    bool audio_mute_enabled;
    bool audio_volume_changed;
    int audio_volume_channel;
    int audio_volume;
    bool audio_fade_changed;
    int audio_fade_channel;
    int audio_fade_target_volume;
    int audio_fade_frames;
    bool all_sprites_visible_changed;
    bool all_sprites_visible;
    bool player_animation_changed;
    int player_animation_index;
    bool player_bounce_requested;
    int player_bounce_height_tiles;
    int player_bounce_frames;
    int link_request;
    int link_script;
    int link_transfer_variable;
    int link_transfer_value;
    int link_timeout_frames;
    bool link_last_transfer_ok;
    int link_last_received_value;
    MultiplayerSession multiplayer_session;
    bool rtc_read_ok;
    bool actor_gesture_changed;
    int actor_gesture_actor;
    int actor_gesture_index;
    int actor_gesture_frames;
    bool fade_changed;
    int fade_direction;
    int fade_frames;
    bool visual_effect_changed;
    int visual_effect_kind;
    int visual_effect_target;
    int visual_effect_frames;
    int visual_effect_intensity;
    int visual_effect_phase;
    bool dialogue_text_speed_changed;
    int dialogue_text_speed_frames;
    bool dialogue_text_sfx_changed;
    int dialogue_text_sfx_index;
    bool dialogue_frame_changed;
    int dialogue_frame_index;
    int background_request_index;
    bool background_palette_changed;
    int background_palette_index;
    int background_palette_frames;
    bool sprite_palette_changed;
    int sprite_palette_index;
    int sprite_palette_frames;
    int last_script;
    bool last_button_binding_overrides_default;
    int last_choice_group;
    int actor_effect_frames[max_event_actor_state_slots + 1];
    int actor_effect_intensity[max_event_actor_state_slots + 1];
    uint8_t actor_effect_kind[max_event_actor_state_slots + 1];
    int event_frame_counter;
    int rate_limit_last_frame[max_event_rate_limit_slots];
    bool rate_limit_has_run[max_event_rate_limit_slots];
    bool save_slot_exists[max_event_save_slots];
    int save_request;
    int save_request_slot;
    bool projectile_slot_loaded[max_event_projectile_slots];
    int projectile_slot_damage[max_event_projectile_slots];
    int projectile_slot_speed[max_event_projectile_slots];
    int projectile_slot_sprite[max_event_projectile_slots];
    bool projectile_launch_requested;
    int projectile_launch_actor;
    int projectile_launch_slot;
    int projectile_launch_direction;
    EventButtonBinding button_bindings[max_event_button_bindings];
    size_t button_binding_count;
    EventTimerBinding timer_bindings[max_event_timer_bindings];
    size_t timer_binding_count;
    bool script_locks[max_event_script_locks];
    EventSceneStackEntry scene_stack[max_event_scene_stack_entries];
    size_t scene_stack_count;
    bool segment_active[max_event_segments];
    int segment_script[max_event_segments];
    uint32_t segment_revision[max_event_segments];
    int adventure_state;
    int adventure_frames;
    EventDrawText draw_text[max_event_draw_text_entries];
    int platform_callback_scripts[max_event_platform_callbacks];
    int adventure_callback_scripts[max_event_adventure_callbacks];
    bool scene_type_paused[max_event_scene_types];
};

// Requested includes the cover phase; pending means ready for adapter handoff.
bool runtime_transition_requested();
bool runtime_transition_pending();
RuntimeKind runtime_transition_target();
bool runtime_transition_route(RuntimeTransitionRoute& route);
bool request_runtime_save_restore(RuntimeKind runtime, int slot_index);
bool consume_runtime_save_restore(RuntimeKind runtime, int& slot_index);
bool consume_runtime_transition(
    RuntimeKind runtime,
    EventState& state,
    int& room,
    int& player_x,
    int& player_y
);

struct EventRunner {
    EventScript script;
    size_t command_index;
    bool active;
    size_t step_budget;
};

void format_event_clock(const EventState& state, char (&display)[6]);

struct EventScriptQueueEntry {
    EventScript script;
    uint8_t flags;
};

struct EventScriptQueue {
    EventScriptQueueEntry entries[max_event_script_queue_entries];
    size_t head;
    size_t count;
};

constexpr EventScript empty_event_script() {
    return EventScript { nullptr, 0 };
}

constexpr bool is_valid_event_variable(int variable_index) {
    return variable_index >= 0 && variable_index < static_cast<int>(event_variable_count);
}

constexpr bool is_valid_event_equipment_slot(int slot) {
    return slot >= 0 && slot < static_cast<int>(max_event_equipment_slots);
}

constexpr bool is_valid_event_stat(int stat_index) {
    return stat_index >= 0 && stat_index < static_cast<int>(max_event_stats);
}

constexpr bool has_event_script(EventScript script) {
    return script.commands != nullptr && script.command_count > 0;
}

constexpr bool is_valid_event_script_lock_slot(int script_index) {
    return script_index >= 0 && script_index < static_cast<int>(max_event_script_locks);
}

constexpr void reset_event_actor_commands(EventState& state) {
    state.actor_command_count = 0;
    for (size_t index = 0; index < max_event_actor_commands; ++index) {
        state.actor_commands[index] = EventActorCommand { EventActorOp::None, -1, 0, 0, 0, 0 };
    }
}

constexpr void reset_event_tile_commands(EventState& state) {
    state.tile_command_count = 0;
    for (size_t index = 0; index < max_event_tile_commands; ++index) {
        state.tile_commands[index] = EventTileCommand { 0, 0, 0, 0, 0, -1 };
    }
}

void init_event_state(EventState& state);
void set_event_player_actor_state(EventState& state, int x, int y, int direction, int tile_size);
void set_event_input_state(EventState& state, uint16_t held, uint16_t pressed, uint16_t released);
void set_event_actor_animation_state(EventState& state, int actor_index, bool playing);
void tick_event_frame_counter(EventState& state);
bool event_actor_effect_visible(const EventState& state, int actor_index);
int event_actor_effect_offset_x(const EventState& state, int actor_index);
bool update_button_event_bindings(EventState& state);
bool button_event_binding_overrides_default(const EventState& state, uint16_t buttons);
bool update_timer_event_bindings(EventState& state);
void run_event_script(EventState& state, EventScript script);
void run_event_script(EventState& state, const EventCommand* commands, size_t count);
void clear_event_actor_commands(EventState& state);
void clear_event_tile_commands(EventState& state);
bool event_script_is_locked(const EventState& state, int script_index);
bool event_actor_update_script_enabled(const EventState& state, int actor_index);
bool event_segment_is_active(const EventState& state, int segment_index);
bool event_scene_type_is_paused(const EventState& state, int scene_type_index);
bool platform_callback_script(const EventState& state, int callback_index, int& script_index);
bool adventure_callback_script(const EventState& state, int callback_index, int& script_index);
void init_event_runner(EventRunner& runner);
void start_event_runner(EventRunner& runner, EventScript script);
void stop_event_runner(EventRunner& runner);
bool update_event_runner(EventRunner& runner, EventState& state);
uint16_t resolve_event_tile(const EventTileCommand& command, const TileAsset* assets, size_t asset_count);
constexpr bool event_runner_is_active(const EventRunner& runner) {
    return runner.active;
}
void init_event_script_queue(EventScriptQueue& queue);
bool enqueue_event_script(EventScriptQueue& queue, EventScript script, uint8_t flags = 0);
bool enqueue_event_script_front(EventScriptQueue& queue, EventScript script, uint8_t flags = 0);
bool dequeue_event_script(EventScriptQueue& queue, EventScriptQueueEntry& entry);
void clear_event_script_queue(EventScriptQueue& queue);
constexpr bool event_script_queue_is_empty(const EventScriptQueue& queue) {
    return queue.count == 0;
}
constexpr bool event_script_queue_is_full(const EventScriptQueue& queue) {
    return queue.count >= max_event_script_queue_entries;
}

} // namespace gbs
