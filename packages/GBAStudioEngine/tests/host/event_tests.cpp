#include <cassert>
#include <type_traits>
#include "gbs/assets.hpp"
#include "gbs/event.hpp"
#include "gbs/event_interactions.hpp"
#include "gbs/event_threads.hpp"
#include "gbs/event_adventure.hpp"
#include "gbs/runtime.hpp"
#include "gbs/input.hpp"
#include "gbs/dialogue.hpp"
#include "gbs/rumble.hpp"
#include "gbs/save.hpp"

static_assert(gbs::event_variable_count == 64, "Event runtime must expose 64 variables");
static_assert(std::extent<decltype(gbs::EventState::variables)>::value == gbs::event_variable_count, "EventState variable storage must follow the shared capacity");
static_assert(gbs::universal_save_variable_count == gbs::event_variable_count, "Universal saves must preserve every event variable");

namespace {

bool test_rumble_available(void*) { return true; }
void test_rumble_set_enabled(void*, bool) {}

void test_ready_system_event_ops_update_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    static_assert(gbs::text_variable_count == 8, "Text variable capacity must remain bounded for GBA memory");
    assert(state.text_variables[0][0] == '\0');

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::OpenTextInput, 0, 8, 1 },
        { gbs::EventOp::OpenCodeLock, 1, 4, 4321 },
        { gbs::EventOp::OpenEquipMenu, 5, 1, 0 },
        { gbs::EventOp::SetEquippedItem, 0, 7, 0 },
        { gbs::EventOp::PushActor, 2, 1, 0 },
        { gbs::EventOp::SetPlayerSpeedProfile, 100, 160, 2 },
        { gbs::EventOp::SetPlayerMovementState, 1, 2, 0 },
        { gbs::EventOp::StartGameClock, 10, 180, 1 },
        { gbs::EventOp::AdvanceTime, 60, 0, 0 },
        { gbs::EventOp::SetStat, 0, 16, 16 },
        { gbs::EventOp::ModifyStat, 0, -3, 0 },
        { gbs::EventOp::ShowStatBar, 0, 8, 64 },
        { gbs::EventOp::ShowHearts, 0, 4, 4 },
        { gbs::EventOp::ModifyWallet, 2, 25, 999 },
        { gbs::EventOp::ShowNumberHud, 2, 200, 3 },
        { gbs::EventOp::SetCameraShake, 6, 2, 0 },
        { gbs::EventOp::MoveCamera, -12, 6, 0 },
        { gbs::EventOp::SetCameraBoundsX, 0, 320, 0 },
        { gbs::EventOp::SetCameraBoundsY, 0, 240, 0 },
        { gbs::EventOp::ReplaceTile, 388, 12, 1 },
        { gbs::EventOp::ReplaceTile, 8581, 20, 3 },
        { gbs::EventOp::OverlayLine, 72, 0, 0 },
        { gbs::EventOp::OverlayShow, 8, 104, (18 << 8) | 4 },
        { gbs::EventOp::OverlayMove, 16, 96, 24 },
        { gbs::EventOp::OverlayHide, 12, 0, 0 },
        { gbs::EventOp::SetBackgroundPalette, 2, 10, 0 },
        { gbs::EventOp::SetSpritePalette, 3, 6, 0 },
        { gbs::EventOp::SetAllSpritesVisible, 0, 0, 0 },
        { gbs::EventOp::PlayerBounce, 2, 20, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.last_text_input_variable == 0);
    assert(state.text_input_max_length == 8);
    assert(state.text_input_charset == 1);
    assert(state.last_code_lock_variable == 1);
    assert(state.code_lock_digits == 4);
    assert(state.code_lock_code == 4321);
    assert(state.variables[1] == 0);
    assert(state.equip_menu_slots == 5);
    assert(state.equip_menu_pause);
    assert(state.equipped_items[0] == 7);
    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].op == gbs::EventActorOp::PushFacing);
    assert(state.actor_commands[0].actor_index == 2);
    assert(state.actor_commands[0].a == 1);
    assert(state.player_walk_speed == 100);
    assert(state.player_run_speed == 160);
    assert(state.player_stamina_cost == 2);
    assert(state.player_movement_state == 1);
    assert(state.player_movement_tile_tag == 2);
    assert(state.clock_minutes_per_tick == 10);
    assert(state.clock_frames_per_tick == 180);
    assert(state.clock_hud_enabled);
    assert(state.clock_minute == 60);
    assert(state.stats[0] == 13);
    assert(state.stat_max[0] == 16);
    assert(state.hud_stat_bar_stat == 0);
    assert(state.hud_stat_bar_x == 8);
    assert(state.hud_stat_bar_width == 64);
    assert(state.hud_hearts_stat == 0);
    assert(state.hud_units_per_heart == 4);
    assert(state.hud_heart_count == 4);
    assert(state.variables[2] == 25);
    assert(state.hud_number_variable == 2);
    assert(state.hud_number_x == 200);
    assert(state.hud_number_digits == 3);
    assert(state.camera_shake_frames == 6);
    assert(state.camera_shake_magnitude == 2);
    assert(state.camera_move_changed);
    assert(state.camera_delta_x == -12);
    assert(state.camera_delta_y == 6);
    assert(state.camera_bounds_x_changed);
    assert(state.camera_bounds_min_x == 0);
    assert(state.camera_bounds_max_x == 320);
    assert(state.camera_bounds_y_changed);
    assert(state.camera_bounds_min_y == 0);
    assert(state.camera_bounds_max_y == 240);
    assert(state.tile_command_count == 2);
    assert(state.tile_commands[0].layer == 0);
    assert(state.tile_commands[0].x == 4);
    assert(state.tile_commands[0].y == 6);
    assert(state.tile_commands[0].tile == 12);
    assert(state.tile_commands[0].count == 1);
    assert(state.tile_commands[1].layer == 2);
    assert(state.tile_commands[1].x == 5);
    assert(state.tile_commands[1].y == 6);
    assert(state.tile_commands[1].tile == 20);
    assert(state.tile_commands[1].count == 3);
    assert(state.overlay_line == 72);
    assert(!state.overlay_visible);
    assert(state.overlay_x == 16);
    assert(state.overlay_y == 96);
    assert(state.overlay_width == 144);
    assert(state.overlay_height == 32);
    assert(state.overlay_transition_frames == 12);
    assert(state.overlay_show_requested);
    assert(state.overlay_show_x == 8);
    assert(state.overlay_show_y == 104);
    assert(state.overlay_line_changed);
    assert(state.overlay_move_requested);
    assert(state.overlay_hide_requested);
    assert(state.background_palette_changed);
    assert(state.background_palette_index == 2);
    assert(state.background_palette_frames == 10);
    assert(state.sprite_palette_changed);
    assert(state.sprite_palette_index == 3);
    assert(state.sprite_palette_frames == 6);
    assert(state.all_sprites_visible_changed);
    assert(!state.all_sprites_visible);
    assert(state.player_bounce_requested);
    assert(state.player_bounce_height_tiles == 2);
    assert(state.player_bounce_frames == 20);
}

void test_player_event_commands_apply_to_reserved_player_slot() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetActorActive, gbs::event_player_actor_index, 0, 0 },
        { gbs::EventOp::SetActorPosition, gbs::event_player_actor_index, 40, 56 },
        { gbs::EventOp::MoveActor, gbs::event_player_actor_index, 8, -16 },
        { gbs::EventOp::SetActorDirection, gbs::event_player_actor_index, 3, 0 },
        { gbs::EventOp::SetActorSprite, gbs::event_player_actor_index, 2, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    gbs::EventPlayerRuntimeState player { true, 8, 16, 0 };
    for (size_t index = 0; index < state.actor_command_count; ++index) {
        assert(gbs::apply_event_player_command(player, state.actor_commands[index]));
    }

    assert(!player.active);
    assert(player.x == 48);
    assert(player.y == 40);
    assert(player.direction == 3);
    assert(player.sprite_index == 2);
    assert(!gbs::apply_event_player_command(
        player,
        gbs::EventActorCommand { gbs::EventActorOp::SetPosition, 0, 1, 2, 0, 0 }
    ));
}

void test_set_player_direction_updates_event_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetPlayerDirection, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.player_direction == 3);
}

void test_player_event_speed_uses_subpixel_accumulator() {
    gbs::EventPlayerRuntimeState player { true, 0, 0, 3, 100, 0 };
    const gbs::EventActorCommand command {
        gbs::EventActorOp::SetSpeed,
        gbs::event_player_actor_index,
        50,
        0
    };

    assert(gbs::apply_event_player_command(player, command));
    assert(player.movement_speed_x100 == 50);
    assert(gbs::consume_event_player_movement_step(player, true) == 0);
    assert(gbs::consume_event_player_movement_step(player, true) == 1);
    assert(gbs::consume_event_player_movement_step(player, true) == 0);
    assert(gbs::consume_event_player_movement_step(player, true) == 1);
}

void test_link_commands_update_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand host_commands[] = {
        { gbs::EventOp::LinkHost, 3, 12, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, host_commands, sizeof(host_commands) / sizeof(host_commands[0]));
    assert(state.link_request == 1);
    assert(state.link_script == 3);
    assert(state.link_timeout_frames == 12);

    const gbs::EventCommand join_commands[] = {
        { gbs::EventOp::LinkJoin, 4, 9, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, join_commands, sizeof(join_commands) / sizeof(join_commands[0]));
    assert(state.link_request == 2);
    assert(state.link_script == 4);
    assert(state.link_timeout_frames == 9);

    const gbs::EventCommand transfer_commands[] = {
        { gbs::EventOp::LinkTransfer, 5, 0xA5, 7 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, transfer_commands, sizeof(transfer_commands) / sizeof(transfer_commands[0]));
    assert(state.link_request == 4);
    assert(state.link_transfer_variable == 5);
    assert(state.link_transfer_value == 0xA5);
    assert(state.link_timeout_frames == 7);

    const gbs::EventCommand close_commands[] = {
        { gbs::EventOp::LinkClose, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, close_commands, sizeof(close_commands) / sizeof(close_commands[0]));
    assert(state.link_request == 3);
}

void test_rumble_commands_drive_global_rumble_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    gbs::rumble_init();
    gbs::rumble_set_provider(gbs::RumbleProvider {
        test_rumble_available, test_rumble_set_enabled, nullptr
    });

    const gbs::EventCommand on_commands[] = {
        { gbs::EventOp::RumbleOn, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, on_commands, sizeof(on_commands) / sizeof(on_commands[0]));
    assert(gbs::rumble_active());

    const gbs::EventCommand timed_commands[] = {
        { gbs::EventOp::RumbleOnFor, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, timed_commands, sizeof(timed_commands) / sizeof(timed_commands[0]));
    assert(gbs::rumble_active());
    gbs::rumble_update();
    gbs::rumble_update();
    assert(gbs::rumble_active());
    gbs::rumble_update();
    assert(!gbs::rumble_active());

    const gbs::EventCommand off_commands[] = {
        { gbs::EventOp::RumbleOn, 0, 0, 0 },
        { gbs::EventOp::RumbleOff, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, off_commands, sizeof(off_commands) / sizeof(off_commands[0]));
    assert(!gbs::rumble_active());
}

void test_multiplayer4_commands_drive_session_and_variables() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand open_commands[] = {
        { gbs::EventOp::MultiplayerOpen, 4, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, open_commands, sizeof(open_commands) / sizeof(open_commands[0]));
    assert(state.multiplayer_session.active);
    assert(state.multiplayer_session.player_count == 4);

    const gbs::EventCommand set_commands[] = {
        { gbs::EventOp::MultiplayerSetData, 0x1234, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, set_commands, sizeof(set_commands) / sizeof(set_commands[0]));
    assert(state.multiplayer_session.local_data == 0x1234);

    const gbs::EventCommand transfer_commands[] = {
        { gbs::EventOp::MultiplayerTransfer, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, transfer_commands, sizeof(transfer_commands) / sizeof(transfer_commands[0]));
    assert(state.multiplayer_session.sync_ok);

    // Variables 10/11/12 receive player_id, connected_count and per-player data.
    const gbs::EventCommand read_commands[] = {
        { gbs::EventOp::MultiplayerGetData, 10, 11, 12 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, read_commands, sizeof(read_commands) / sizeof(read_commands[0]));
    assert(state.variables[10] == 0);
    assert(state.variables[11] == 4);
    assert(state.variables[12] == 0x1234);

    const gbs::EventCommand close_commands[] = {
        { gbs::EventOp::MultiplayerClose, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, close_commands, sizeof(close_commands) / sizeof(close_commands[0]));
    assert(!state.multiplayer_session.active);
}

bool read_test_rtc(void*, gbs::RtcDateTime& out) {
    out = gbs::RtcDateTime { 2026, 9, 1, 2, 14, 37, 52 };
    return true;
}

bool no_transition() {
    return false;
}

bool no_route(gbs::RuntimeTransitionRoute&) {
    return false;
}

void no_transition_hook() {}

void rtc_adapter_enter(const gbs::RuntimeAdapter&) {}
void rtc_adapter_render(const gbs::RuntimeFrameContext&) {}
void rtc_adapter_leave(const gbs::RuntimeAdapter&) {}

gbs::RuntimeAdapterFrameResult rtc_adapter_update(const gbs::RuntimeFrameContext&) {
    return gbs::RuntimeAdapterFrameResult::Complete;
}

void test_rtc_commands_read_fields_and_branch() {
    static constexpr gbs::RuntimeCapabilityDescriptor capabilities[] = {
        { gbs::RuntimeCapabilityID::Save, false, false },
        { gbs::RuntimeCapabilityID::Rtc, true, true },
        { gbs::RuntimeCapabilityID::Link, false, false },
        { gbs::RuntimeCapabilityID::Affine, false, false }
    };
    static constexpr gbs::RuntimeCapabilityManifest manifest {
        1,
        capabilities,
        sizeof(capabilities) / sizeof(capabilities[0])
    };
    gbs::RtcProvider provider { read_test_rtc, nullptr };
    gbs::RuntimeServices services {
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        nullptr,
        &provider,
        nullptr
    };
    static constexpr gbs::RuntimeAdapter adapter {
        gbs::RuntimeKind::TopDown,
        nullptr,
        nullptr,
        rtc_adapter_enter,
        rtc_adapter_update,
        rtc_adapter_render,
        rtc_adapter_leave
    };
    static constexpr gbs::RuntimeSceneDescriptor scenes[] = {
        { "rtc", gbs::RuntimeKind::TopDown, 0 }
    };
    static constexpr gbs::RuntimeSceneRegistry registry { scenes, 1, 0 };
    gbs::ProjectRuntime runtime {
        &registry,
        &adapter,
        1,
        { no_transition, no_route, no_transition_hook },
        &services,
        gbs::RuntimeKind::TopDown,
        0,
        &manifest
    };
    assert(gbs::run_project_runtime(runtime) == 0);

    gbs::EventState state {};
    gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::ReadRtc, 4, 3, 0 },
        { gbs::EventOp::JumpIfRtcEquals, 2, 1, 2 },
        { gbs::EventOp::SetVariable, 4, 0, 0 },
        { gbs::EventOp::SetVariable, 4, 1, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.rtc_read_ok);
    assert(state.variables[3] == 14);
    assert(state.variables[4] == 1);
}

void test_wallet_and_stat_commands_clamp_to_valid_ranges() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetStat, 0, 3, 10 },
        { gbs::EventOp::ModifyStat, 0, -99, 0 },
        { gbs::EventOp::ModifyWallet, 1, 50, 40 },
        { gbs::EventOp::ModifyWallet, 1, -99, 40 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.stats[0] == 0);
    assert(state.stat_max[0] == 10);
    assert(state.variables[1] == 0);
}

void test_multiply_variable_command_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetVariable, 2, 4, 0 },
        { gbs::EventOp::MultiplyVariable, 2, 3, 0 },
        { gbs::EventOp::MultiplyVariable, 99, 3, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.variables[2] == 12);
}

void test_divide_and_mod_variable_commands_update_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetVariable, 1, 20, 0 },
        { gbs::EventOp::DivideVariable, 1, 4, 0 },
        { gbs::EventOp::DivideVariable, 1, 0, 0 },
        { gbs::EventOp::SetVariable, 2, 17, 0 },
        { gbs::EventOp::ModuloVariable, 2, 5, 0 },
        { gbs::EventOp::ModuloVariable, 2, 0, 0 },
        { gbs::EventOp::DivideVariable, 99, 3, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.variables[1] == 5);
    assert(state.variables[2] == 2);
}

void test_variable_flag_commands_update_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetVariable, 0, 4, 0 },
        { gbs::EventOp::AddVariableFlags, 0, 2, 0 },
        { gbs::EventOp::SetVariableFlags, 1, 5, 0 },
        { gbs::EventOp::ClearVariableFlags, 0, 4, 0 },
        { gbs::EventOp::AddVariableFlags, 99, 1, 0 },
        { gbs::EventOp::ClearVariableFlags, 99, 1, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.variables[0] == 2);
    assert(state.variables[1] == 5);
}

void test_reset_variables_false_clears_runtime_variables() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    for (int& variable : state.variables) {
        variable = 9;
    }

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::ResetVariablesFalse, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    for (const int variable : state.variables) {
        assert(variable == 0);
    }
}

void test_fade_commands_update_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand fade_out_commands[] = {
        { gbs::EventOp::FadeOut, 24, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, fade_out_commands, sizeof(fade_out_commands) / sizeof(fade_out_commands[0]));

    assert(state.fade_changed);
    assert(state.fade_direction == 1);
    assert(state.fade_frames == 24);

    state.fade_changed = false;
    const gbs::EventCommand fade_in_commands[] = {
        { gbs::EventOp::FadeIn, 12, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, fade_in_commands, sizeof(fade_in_commands) / sizeof(fade_in_commands[0]));

    assert(state.fade_changed);
    assert(state.fade_direction == -1);
    assert(state.fade_frames == 12);
}

void test_visual_effect_command_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        {
            gbs::EventOp::VisualEffect,
            gbs::pack_visual_effect(gbs::VisualEffectKind::PaletteFlash, gbs::VisualEffectTarget::Bg0),
            18,
            70
        },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.visual_effect_changed);
    assert(state.visual_effect_kind == static_cast<int>(gbs::VisualEffectKind::PaletteFlash));
    assert(state.visual_effect_target == static_cast<int>(gbs::VisualEffectTarget::Bg0));
    assert(state.visual_effect_frames == 18);
    assert(state.visual_effect_intensity == 70);
}

void test_cross_runtime_transition_carries_reveal_to_target_state() {
    gbs::EventState source_state {};
    gbs::init_event_state(source_state);
    const int packed_target = (static_cast<int>(gbs::RuntimeKind::Platformer) << 12) | 2;
    const gbs::EventCommand commands[] = {
        {
            gbs::EventOp::VisualEffect,
            gbs::pack_visual_effect(gbs::VisualEffectKind::Mask, gbs::VisualEffectTarget::All),
            8,
            100,
            1
        },
        { gbs::EventOp::WarpRuntime, static_cast<int16_t>(packed_target), 24, 40 },
        {
            gbs::EventOp::VisualEffect,
            gbs::pack_visual_effect(gbs::VisualEffectKind::Mask, gbs::VisualEffectTarget::All),
            8,
            100,
            2
        },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(source_state, commands, sizeof(commands) / sizeof(commands[0]));

    gbs::EventState target_state {};
    gbs::init_event_state(target_state);
    int target_room = -1;
    int target_x = -1;
    int target_y = -1;
    assert(gbs::consume_runtime_transition(
        gbs::RuntimeKind::Platformer,
        target_state,
        target_room,
        target_x,
        target_y
    ));
    assert(target_room == 2);
    assert(target_x == 24);
    assert(target_y == 40);
    assert(target_state.visual_effect_changed);
    assert(target_state.visual_effect_kind == static_cast<int>(gbs::VisualEffectKind::Mask));
    assert(target_state.visual_effect_phase == 2);
}

void test_synchronous_scene_transition_waits_for_cover_before_routing() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        {gbs::EventOp::VisualEffect, gbs::pack_visual_effect(gbs::VisualEffectKind::Push, gbs::VisualEffectTarget::All), 3, 100, 1},
        {gbs::EventOp::Wait, 3, 0, 0, 0},
        {gbs::EventOp::WarpRuntime, static_cast<int16_t>(static_cast<int>(gbs::RuntimeKind::PointClick) << 12), 24, 40},
        {gbs::EventOp::VisualEffect, gbs::pack_visual_effect(gbs::VisualEffectKind::Push, gbs::VisualEffectTarget::All), 3, 100, 2}
    };
    gbs::run_event_script(state, commands, 4);
    assert(gbs::runtime_transition_requested());
    assert(!gbs::runtime_transition_pending());
    gbs::RuntimeTransitionRoute route {};
    assert(!gbs::runtime_transition_route(route));
    int room = -1, x = -1, y = -1;
    gbs::EventState destination {};
    assert(!gbs::consume_runtime_transition(gbs::RuntimeKind::PointClick, destination, room, x, y));
    for (int frame = 0; frame < 3; ++frame) gbs::tick_event_frame_counter(state);
    assert(gbs::runtime_transition_requested());
    assert(gbs::runtime_transition_pending());
    assert(gbs::consume_runtime_transition(gbs::RuntimeKind::PointClick, destination, room, x, y));
    assert(destination.visual_effect_phase == 2);
    assert(destination.wait_frames == 0);
    assert(!gbs::runtime_transition_requested());
    assert(!gbs::runtime_transition_pending());
}

void test_random_variable_command_updates_runtime_state_with_inclusive_range() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    const uint32_t seed_before = state.random_seed;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::RandomVariable, 3, 1, 6 },
        { gbs::EventOp::RandomVariable, 4, 8, 4 },
        { gbs::EventOp::RandomVariable, 99, 1, 6 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.variables[3] >= 1);
    assert(state.variables[3] <= 6);
    assert(state.variables[4] >= 4);
    assert(state.variables[4] <= 8);
    assert(state.random_seed != seed_before);
}

void test_set_random_seed_command_uses_variable_value_with_nonzero_fallback() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetVariable, 5, 42, 0 },
        { gbs::EventOp::SetRandomSeed, 5, 0, 0 },
        { gbs::EventOp::SetVariable, 6, 0, 0 },
        { gbs::EventOp::SetRandomSeed, 6, 0, 0 },
        { gbs::EventOp::SetRandomSeed, 99, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.random_seed == 1);
}

void test_mute_audio_channel_command_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::MuteAudioChannel, 0, 1, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.audio_mute_changed);
    assert(state.audio_mute_channel == 0);
    assert(state.audio_mute_enabled);
}

void test_audio_volume_commands_update_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetAudioVolume, 1, 12, 0 },
        { gbs::EventOp::FadeAudioVolume, 2, 4, 90 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.audio_volume_changed);
    assert(state.audio_volume_channel == 1);
    assert(state.audio_volume == 12);
    assert(state.audio_fade_changed);
    assert(state.audio_fade_channel == 2);
    assert(state.audio_fade_target_volume == 4);
    assert(state.audio_fade_frames == 90);
}

void test_run_audio_routine_command_updates_tracker_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::RunAudioRoutine, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.last_tracker_music == 2);
}

void test_play_pcm_sfx_command_updates_pcm_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::PlayPcmSfx, 3, 9, 12 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.last_pcm_sfx == 3);
    assert(state.last_pcm_sfx_volume == 9);
    assert(state.last_pcm_sfx_priority == 12);
    assert(state.last_sfx == -1);
}

void test_set_dialogue_text_speed_command_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetDialogueTextSpeed, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.dialogue_text_speed_changed);
    assert(state.dialogue_text_speed_frames == 3);
}

void test_set_text_sfx_command_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetTextSfx, 4, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.dialogue_text_sfx_changed);
    assert(state.dialogue_text_sfx_index == 4);
}

void test_set_dialogue_frame_command_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetDialogueFrame, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.dialogue_frame_changed);
    assert(state.dialogue_frame_index == 2);
}

void test_jump_if_variable_equals_routes_to_matching_warp() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetVariable, 0, 1, 0 },
        { gbs::EventOp::JumpIfVariableEquals, 0, 0, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 0, 1, 1 },
        { gbs::EventOp::JumpIfVariableEquals, 0, 1, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 2, 4, 5 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.current_room == 2);
    assert(state.player_x == 4);
    assert(state.player_y == 5);
}

void test_variable_comparison_jumps_gate_next_command() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetVariable, 0, 5, 0 },
        { gbs::EventOp::JumpIfVariableGreaterThan, 0, 4, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 1, 2, 3 },
        { gbs::EventOp::JumpIfVariableLessThan, 0, 4, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 3, 4, 5 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.current_room == 1);
    assert(state.player_x == 2);
    assert(state.player_y == 3);
}

void test_variable_to_variable_jump_gates_next_command() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetVariable, 0, 7, 0 },
        { gbs::EventOp::SetVariable, 1, 7, 0 },
        { gbs::EventOp::JumpIfVariableEqualsVariable, 0, 1, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 4, 5, 6 },
        { gbs::EventOp::SetVariable, 1, 3, 0 },
        { gbs::EventOp::JumpIfVariableEqualsVariable, 0, 1, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 9, 9, 9 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.current_room == 4);
    assert(state.player_x == 5);
    assert(state.player_y == 6);
}

void test_room_conditional_jump_gates_next_command() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    state.current_room = 2;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::JumpIfRoomEquals, 2, 0, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 4, 5, 6 },
        { gbs::EventOp::JumpIfRoomEquals, 2, 0, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 9, 9, 9 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.current_room == 4);
    assert(state.player_x == 5);
    assert(state.player_y == 6);
}

void test_engine_field_commands_store_and_gate_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    state.player_x = 7;
    state.player_y = 4;
    state.camera_y = 12;
    state.variables[1] = 12;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::StoreEngineField, 3, 0, 0 },
        { gbs::EventOp::JumpIfEngineFieldEquals, 4, 4, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::Warp, 4, 5, 6 },
        { gbs::EventOp::JumpIfEngineFieldEqualsVariable, 2, 1, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 3, 0, 0 },
        { gbs::EventOp::SetEngineField, 1, 22, 0 },
        { gbs::EventOp::SetEngineField, 3, 9, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.variables[0] == 7);
    assert(state.current_room == 4);
    assert(state.player_y == 6);
    assert(state.last_script == 3);
    assert(state.camera_x == 22);
    assert(state.player_x == 9);
}

void test_store_actor_state_commands_copy_actor_state_to_variables() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    state.actor_x[1] = 4;
    state.actor_y[1] = 5;
    state.actor_direction[1] = 3;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::StoreActorPosition, 1, 2, 3 },
        { gbs::EventOp::StoreActorDirection, 1, 4, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.variables[2] == 4);
    assert(state.variables[3] == 5);
    assert(state.variables[4] == 3);
}

void test_button_pressed_jump_gates_next_command() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    state.input_pressed = gbs::ButtonStart;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::JumpIfButtonPressed, gbs::ButtonStart, 0, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 4, 0, 0 },
        { gbs::EventOp::JumpIfButtonPressed, gbs::ButtonA, 0, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 9, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.last_script == 4);
}

void test_wait_button_pressed_pauses_runner_until_matching_input() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    gbs::EventRunner runner {};
    gbs::init_event_runner(runner);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::WaitButtonPressed, gbs::ButtonStart, 0, 0 },
        { gbs::EventOp::CallScript, 5, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::start_event_runner(runner, gbs::EventScript { commands, sizeof(commands) / sizeof(commands[0]) });

    assert(gbs::update_event_runner(runner, state));
    assert(gbs::event_runner_is_active(runner));
    assert(runner.command_index == 0);
    assert(state.last_script == -1);

    gbs::set_event_input_state(state, 0, gbs::ButtonA, 0);
    assert(gbs::update_event_runner(runner, state));
    assert(gbs::event_runner_is_active(runner));
    assert(runner.command_index == 0);
    assert(state.last_script == -1);

    gbs::set_event_input_state(state, 0, gbs::ButtonStart, 0);
    assert(!gbs::update_event_runner(runner, state));
    assert(!gbs::event_runner_is_active(runner));
    assert(state.last_script == 5);
}

void test_wait_actor_animation_pauses_runner_until_animation_finishes() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    gbs::EventRunner runner {};
    gbs::init_event_runner(runner);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetActorAnimation, 1, 3, 0 },
        { gbs::EventOp::WaitActorAnimation, 1, 0, 0 },
        { gbs::EventOp::CallScript, 6, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::start_event_runner(runner, gbs::EventScript { commands, sizeof(commands) / sizeof(commands[0]) });

    assert(gbs::update_event_runner(runner, state));
    assert(gbs::event_runner_is_active(runner));
    assert(runner.command_index == 1);
    assert(state.last_script == -1);
    assert(state.actor_animation_playing[1]);

    gbs::set_event_actor_animation_state(state, 1, true);
    assert(gbs::update_event_runner(runner, state));
    assert(gbs::event_runner_is_active(runner));
    assert(runner.command_index == 1);
    assert(state.last_script == -1);

    gbs::set_event_actor_animation_state(state, 1, false);
    assert(!gbs::update_event_runner(runner, state));
    assert(!gbs::event_runner_is_active(runner));
    assert(state.last_script == 6);
}

void test_inventory_commands_store_remove_and_gate_quantities() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::AddInventoryItem, 0, 3, 0 },
        { gbs::EventOp::RemoveInventoryItem, 0, 1, 0 },
        { gbs::EventOp::RemoveInventoryItem, 1, 5, 0 },
        { gbs::EventOp::JumpIfInventoryAtLeast, 0, 2, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 4, 0, 0 },
        { gbs::EventOp::JumpIfInventoryAtLeast, 0, 3, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 9, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.inventory[0] == 2);
    assert(state.inventory[1] == 0);
    assert(state.last_script == 4);
}

void test_actor_condition_jumps_gate_runtime_actor_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    state.actor_x[0] = 1;
    state.actor_y[0] = 1;
    state.actor_direction[0] = 3;
    state.actor_x[1] = 4;
    state.actor_y[1] = 3;
    state.actor_direction[1] = 3;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::JumpIfActorDirection, 1, 3, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 4, 0, 0 },
        { gbs::EventOp::JumpIfActorAtPosition, 1, (3 << 6) | 4, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 5, 0, 0 },
        { gbs::EventOp::JumpIfActorDistance, 1, 0, (2 << 8) | 5 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 6, 0, 0 },
        { gbs::EventOp::JumpIfActorRelative, 1, 0, (2 << 8) | 3 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 7, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.last_script == 7);
}

void test_actor_condition_jumps_support_player_and_tile_scaled_positions() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    gbs::set_event_player_actor_state(state, 16, 8, 3, 8);
    state.actor_x[0] = 32;
    state.actor_y[0] = 24;
    state.actor_direction[0] = 3;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::JumpIfActorDirection, gbs::event_player_actor_index, 3, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 4, 0, 0 },
        { gbs::EventOp::JumpIfActorAtPosition, gbs::event_player_actor_index, (1 << 6) | 2, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 5, 0, 0 },
        { gbs::EventOp::JumpIfActorDistance, 0, gbs::event_player_actor_index, (2 << 8) | 4 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 6, 0, 0 },
        { gbs::EventOp::JumpIfActorRelative, 0, gbs::event_player_actor_index, (2 << 8) | 3 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::CallScript, 7, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.last_script == 7);
}

void test_actor_position_condition_supports_wide_maps() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    gbs::set_event_player_actor_state(state, 0, 0, 3, 8);
    state.actor_x[0] = 160 * 8;
    state.actor_y[0] = 15 * 8;
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::JumpIfActorAtPosition, 0, (15 << 6) | 32 | (128 << 6), 2 },
        { gbs::EventOp::End, 0, 0, 0 },
        { gbs::EventOp::CallScript, 9, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, commands, 4);
    assert(state.last_script == 9);
}

void test_call_script_command_records_project_script_index() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::CallScript, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.last_script == 3);
}

void test_camera_property_command_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetCameraProperty, 0, 32, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.camera_property_changed);
    assert(state.camera_property == 0);
    assert(state.camera_property_value == 32);
}

void test_button_event_bindings_route_pressed_input_to_script() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand attach_commands[] = {
        { gbs::EventOp::AttachButtonEvent, gbs::ButtonStart, 5, 1 },
        { gbs::EventOp::AttachButtonEvent, gbs::ButtonA, 2, 0 },
        { gbs::EventOp::RemoveButtonEvent, gbs::ButtonA, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, attach_commands, sizeof(attach_commands) / sizeof(attach_commands[0]));

    assert(state.button_binding_count == 1);
    assert(state.button_bindings[0].button == gbs::ButtonStart);
    assert(state.button_bindings[0].script == 5);
    assert(state.button_bindings[0].override_default);
    assert(gbs::button_event_binding_overrides_default(state, gbs::ButtonStart));
    assert(!gbs::button_event_binding_overrides_default(state, gbs::ButtonA));

    gbs::set_event_input_state(state, 0, gbs::ButtonA, 0);
    assert(!gbs::update_button_event_bindings(state));
    assert(state.last_script == -1);

    gbs::set_event_input_state(state, 0, gbs::ButtonStart, 0);
    assert(gbs::update_button_event_bindings(state));
    assert(state.last_script == 5);
    assert(state.last_button_binding_overrides_default);

    const gbs::EventCommand remove_commands[] = {
        { gbs::EventOp::RemoveButtonEvent, gbs::ButtonStart, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, remove_commands, sizeof(remove_commands) / sizeof(remove_commands[0]));
    state.last_script = -1;
    gbs::set_event_input_state(state, 0, gbs::ButtonStart, 0);
    assert(!gbs::update_button_event_bindings(state));
    assert(state.last_script == -1);
}

void test_platform_callback_bindings_route_runtime_callbacks_to_script() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand attach_commands[] = {
        { gbs::EventOp::AttachPlatformCallback, 0, 5, 0 },
        { gbs::EventOp::AttachPlatformCallback, 1, 6, 0 },
        { gbs::EventOp::RemovePlatformCallback, 1, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, attach_commands, sizeof(attach_commands) / sizeof(attach_commands[0]));

    int script = -1;
    assert(gbs::platform_callback_script(state, 0, script));
    assert(script == 5);
    assert(!gbs::platform_callback_script(state, 1, script));

    const gbs::EventCommand lock_commands[] = {
        { gbs::EventOp::LockScript, 5, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, lock_commands, sizeof(lock_commands) / sizeof(lock_commands[0]));

    assert(!gbs::platform_callback_script(state, 0, script));

    const gbs::EventCommand extended_callback[] = {
        { gbs::EventOp::AttachPlatformCallback, 15, 9, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, extended_callback, sizeof(extended_callback) / sizeof(extended_callback[0]));
    assert(gbs::platform_callback_script(state, 15, script));
    assert(script == 9);
}

void test_choice_pauses_event_runner_before_following_branch_commands() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    gbs::EventRunner runner {};
    gbs::init_event_runner(runner);
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::ShowChoice, 2, 0, 0 },
        { gbs::EventOp::SetVariable, 0, 7, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::start_event_runner(runner, gbs::EventScript { commands, 3 });
    assert(gbs::update_event_runner(runner, state));
    assert(gbs::event_runner_is_active(runner));
    assert(state.last_choice_group == 2);
    assert(state.variables[0] == 0);

    state.last_choice_group = -1;
    assert(!gbs::update_event_runner(runner, state));
    assert(state.variables[0] == 7);
}

void test_dialogue_pauses_event_runner_before_cross_runtime_warp() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    gbs::EventRunner runner {};
    gbs::init_event_runner(runner);
    const int packed_target = (static_cast<int>(gbs::RuntimeKind::Platformer) << 12) | 1;
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::ShowDialogue, 4, 0, 0 },
        { gbs::EventOp::WarpRuntime, static_cast<int16_t>(packed_target), 32, 112 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::start_event_runner(runner, gbs::EventScript { commands, 3 });

    assert(gbs::update_event_runner(runner, state));
    assert(gbs::event_runner_is_active(runner));
    assert(runner.command_index == 1);
    assert(state.last_dialogue == 4);
    assert(!gbs::runtime_transition_pending());

    state.last_dialogue = -1;
    assert(!gbs::update_event_runner(runner, state));
    assert(!gbs::event_runner_is_active(runner));
    assert(gbs::runtime_transition_pending());

    gbs::EventState target_state {};
    gbs::init_event_state(target_state);
    int target_room = -1;
    int target_x = -1;
    int target_y = -1;
    assert(gbs::consume_runtime_transition(
        gbs::RuntimeKind::Platformer,
        target_state,
        target_room,
        target_x,
        target_y
    ));
    assert(target_room == 1);
    assert(target_x == 32);
    assert(target_y == 112);
}

void test_seed_random_and_platformer_state_commands_publish_runtime_requests() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    const uint32_t seed_before = state.random_seed;
    state.event_frame_counter = 17;
    gbs::set_event_input_state(state, gbs::ButtonUp, gbs::ButtonA, 0);
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SeedRandom, 0, 0, 0 },
        { gbs::EventOp::SetPlatformerState, 7, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.random_seed != 0);
    assert(state.random_seed != seed_before);
    assert(state.platformer_state_changed);
    assert(state.platformer_next_state == 7);
}

void test_platformer_engine_field_and_tile_sequence_preserve_gb_studio_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetEngineField, 5, 1802, 0 },
        { gbs::EventOp::ReplaceTileSequence, (6 << 6) | 22, (3 << 10) | 0, (4 << 8) | 0 },
        { gbs::EventOp::ReplaceTileSequence, (6 << 6) | 22, (3 << 10) | 0, (4 << 8) | 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.platformer_blank_gravity == 1802);
    assert(state.variables[0] == 2);
    assert(state.tile_command_count == 2);
    assert(state.tile_commands[0].x == 22);
    assert(state.tile_commands[0].y == 6);
    assert(state.tile_commands[0].tile == 0);
    assert(state.tile_commands[0].tile_asset == 2);
    assert(state.tile_commands[1].tile == 1);
    const gbs::TileAsset assets[] = {
        gbs::TileAsset { nullptr, 0, 0, false },
        gbs::TileAsset { nullptr, 0, 0, false },
        gbs::TileAsset { nullptr, 4, 400, false }
    };
    assert(gbs::resolve_event_tile(state.tile_commands[0], assets, 3) == 400);
    assert(gbs::resolve_event_tile(state.tile_commands[1], assets, 3) == 401);
}

void test_adventure_callback_bindings_route_runtime_callbacks_to_script() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand attach_commands[] = {
        { gbs::EventOp::AttachAdventureCallback, 0, 7, 0 },
        { gbs::EventOp::AttachAdventureCallback, 1, 8, 0 },
        { gbs::EventOp::RemoveAdventureCallback, 1, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, attach_commands, sizeof(attach_commands) / sizeof(attach_commands[0]));

    int script = -1;
    assert(gbs::adventure_callback_script(state, 0, script));
    assert(script == 7);
    assert(!gbs::adventure_callback_script(state, 1, script));

    const gbs::EventCommand lock_commands[] = {
        { gbs::EventOp::LockScript, 7, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, lock_commands, sizeof(lock_commands) / sizeof(lock_commands[0]));

    assert(!gbs::adventure_callback_script(state, 0, script));
}

void test_timer_event_bindings_route_elapsed_frames_to_script() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand attach_commands[] = {
        { gbs::EventOp::AttachTimerEvent, 3, 7, 0 },
        { gbs::EventOp::AttachTimerEvent, 5, 2, 0 },
        { gbs::EventOp::RestartTimerEvent, 7, 0, 0 },
        { gbs::EventOp::RemoveTimerEvent, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, attach_commands, sizeof(attach_commands) / sizeof(attach_commands[0]));

    assert(state.timer_binding_count == 1);
    assert(state.timer_bindings[0].script == 7);
    assert(state.timer_bindings[0].frames == 3);
    assert(state.timer_bindings[0].remaining_frames == 3);

    assert(!gbs::update_timer_event_bindings(state));
    assert(state.last_script == -1);
    assert(!gbs::update_timer_event_bindings(state));
    assert(state.last_script == -1);
    assert(gbs::update_timer_event_bindings(state));
    assert(state.last_script == 7);
    assert(state.timer_bindings[0].remaining_frames == 3);

    state.last_script = -1;
    const gbs::EventCommand remove_commands[] = {
        { gbs::EventOp::RemoveTimerEvent, 7, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, remove_commands, sizeof(remove_commands) / sizeof(remove_commands[0]));
    assert(state.timer_binding_count == 0);
    assert(!gbs::update_timer_event_bindings(state));
    assert(state.last_script == -1);
}

void test_rate_limit_gates_next_command_until_enough_frames_pass() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::RateLimit, 0, 3, 2 },
        { gbs::EventOp::AddVariable, 1, 1, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));
    assert(state.variables[1] == 1);

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));
    assert(state.variables[1] == 1);

    gbs::tick_event_frame_counter(state);
    gbs::tick_event_frame_counter(state);
    assert(state.event_frame_counter == 2);
    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));
    assert(state.variables[1] == 1);

    gbs::tick_event_frame_counter(state);
    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));
    assert(state.variables[1] == 2);
}

void test_manual_save_commands_update_runtime_requests_and_cached_status() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    state.save_slot_exists[1] = true;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SaveGame, 2, 0, 0 },
        { gbs::EventOp::LoadGame, 1, 0, 0 },
        { gbs::EventOp::RemoveSaveGame, 2, 0, 0 },
        { gbs::EventOp::StoreSaveExists, 1, 3, 0 },
        { gbs::EventOp::JumpIfSaveExists, 1, 0, 2 },
        { gbs::EventOp::Jump, 2, 0, 0 },
        { gbs::EventOp::AddVariable, 4, 1, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));
    assert(state.save_request == 3);
    assert(state.save_request_slot == 2);
    assert(state.variables[3] == 1);
    assert(state.variables[4] == 1);

    state.save_slot_exists[1] = false;
    state.variables[3] = 0;
    state.variables[4] = 0;
    gbs::run_event_script(state, commands + 3, 5);
    assert(state.variables[3] == 0);
    assert(state.variables[4] == 0);
}

void test_dialogue_language_command_switches_runtime_locale() {
    gbs::configure_dialogue_locale(nullptr);
    gbs::EventState state {};
    gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetDialogueLanguage, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));
    assert(gbs::active_dialogue_locale_id() == 3);
}

void test_projectile_commands_update_runtime_launch_requests_and_slots() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::ProjectileLoadSlot, 3, 2, 180 },
        { gbs::EventOp::LaunchProjectile, 1, 0, 3 },
        { gbs::EventOp::LaunchProjectileSlot, 1, 3, 6 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));
    assert(state.projectile_slot_loaded[3]);
    assert(state.projectile_slot_damage[3] == 2);
    assert(state.projectile_slot_speed[3] == 180);
    assert(state.projectile_launch_requested);
    assert(state.projectile_launch_actor == 1);
    assert(state.projectile_launch_slot == 3);
    assert(state.projectile_launch_direction == 6);

    const gbs::EventCommand invalid_commands[] = {
        { gbs::EventOp::ProjectileLoadSlot, 99, 4, 200 },
        { gbs::EventOp::LaunchProjectileSlot, 1, 99, 2 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    state.projectile_launch_requested = false;
    gbs::run_event_script(state, invalid_commands, sizeof(invalid_commands) / sizeof(invalid_commands[0]));
    assert(!state.projectile_launch_requested);
}

void test_set_player_animation_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetPlayerAnimation, 2, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.player_animation_changed);
    assert(state.player_animation_index == 2);
}

void test_show_actor_gesture_updates_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::ShowActorGesture, 3, 5, 45 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.actor_gesture_changed);
    assert(state.actor_gesture_actor == 3);
    assert(state.actor_gesture_index == 5);
    assert(state.actor_gesture_frames == 45);

    const gbs::EventCommand player_gesture_commands[] = {
        { gbs::EventOp::ShowActorGesture, gbs::event_player_actor_index, 2, 30 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, player_gesture_commands, sizeof(player_gesture_commands) / sizeof(player_gesture_commands[0]));
    assert(state.actor_gesture_changed);
    assert(state.actor_gesture_actor == gbs::event_player_actor_index);
    assert(state.actor_gesture_index == 2);
    assert(state.actor_gesture_frames == 30);
}

void test_set_actor_sprite_queues_runtime_command() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SetActorSprite, 3, 2, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].op == gbs::EventActorOp::SetSprite);
    assert(state.actor_commands[0].actor_index == 3);
    assert(state.actor_commands[0].a == 2);
}

void test_script_lock_commands_update_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand lock_commands[] = {
        { gbs::EventOp::LockScript, 4, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventCommand unlock_commands[] = {
        { gbs::EventOp::UnlockScript, 4, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, lock_commands, sizeof(lock_commands) / sizeof(lock_commands[0]));

    assert(gbs::event_script_is_locked(state, 4));
    assert(!gbs::event_script_is_locked(state, 3));

    gbs::run_event_script(state, unlock_commands, sizeof(unlock_commands) / sizeof(unlock_commands[0]));

    assert(!gbs::event_script_is_locked(state, 4));
}

void test_scene_stack_commands_update_current_room_history() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::Warp, 2, 24, 40 },
        { gbs::EventOp::SceneStackPush, static_cast<int>(gbs::RuntimeKind::TopDown), 0, 0 },
        { gbs::EventOp::Warp, 5, 64, 72 },
        { gbs::EventOp::SceneStackPush, static_cast<int>(gbs::RuntimeKind::TopDown), 0, 0 },
        { gbs::EventOp::Warp, 7, 8, 16 },
        { gbs::EventOp::SceneStackPrevious, static_cast<int>(gbs::RuntimeKind::TopDown), 0, 0 },
        { gbs::EventOp::SceneStackFirst, static_cast<int>(gbs::RuntimeKind::TopDown), 0, 0 },
        { gbs::EventOp::SceneStackPush, static_cast<int>(gbs::RuntimeKind::TopDown), 0, 0 },
        { gbs::EventOp::SceneStackClear, 0, 0, 0 },
        { gbs::EventOp::SceneStackPrevious, static_cast<int>(gbs::RuntimeKind::TopDown), 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(state.current_room == 2);
    assert(state.player_x == 24);
    assert(state.player_y == 40);
    assert(state.scene_stack_count == 0);
}

void test_scene_stack_restores_player_state_across_runtimes() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    state.current_room = 3;
    state.player_x = 120;
    state.player_y = 88;
    state.player_direction = 2;

    const gbs::EventCommand commands[] = {
        { gbs::EventOp::SceneStackPush, static_cast<int>(gbs::RuntimeKind::Platformer), 0, 0 },
        { gbs::EventOp::Warp, 1, 16, 24 },
        { gbs::EventOp::SceneStackPrevious, static_cast<int>(gbs::RuntimeKind::TopDown), 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(gbs::runtime_transition_pending());
    assert(gbs::runtime_transition_target() == gbs::RuntimeKind::Platformer);

    int room = -1;
    int player_x = -1;
    int player_y = -1;
    assert(gbs::consume_runtime_transition(gbs::RuntimeKind::Platformer, state, room, player_x, player_y));
    assert(room == 3);
    assert(player_x == 120);
    assert(player_y == 88);
    assert(state.player_direction == 2);
    assert(state.scene_stack_count == 0);
}

void test_actor_update_script_commands_toggle_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand start_commands[] = {
        { gbs::EventOp::StartActorUpdateScript, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventCommand stop_commands[] = {
        { gbs::EventOp::StopActorUpdateScript, 3, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    assert(!gbs::event_actor_update_script_enabled(state, 3));

    gbs::run_event_script(state, start_commands, sizeof(start_commands) / sizeof(start_commands[0]));

    assert(gbs::event_actor_update_script_enabled(state, 3));
    assert(!gbs::event_actor_update_script_enabled(state, 2));

    gbs::run_event_script(state, stop_commands, sizeof(stop_commands) / sizeof(stop_commands[0]));

    assert(!gbs::event_actor_update_script_enabled(state, 3));
}

void test_actor_event_state_supports_last_topdown_npc_slot() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const int last_topdown_npc_slot = 95;
    const gbs::EventCommand commands[] = {
        { gbs::EventOp::StartActorUpdateScript, last_topdown_npc_slot, 0, 0 },
        { gbs::EventOp::SetActorAnimation, last_topdown_npc_slot, 2, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    gbs::run_event_script(state, commands, sizeof(commands) / sizeof(commands[0]));

    assert(gbs::event_actor_update_script_enabled(state, last_topdown_npc_slot));
    assert(state.actor_animation_playing[last_topdown_npc_slot]);
    assert(state.actor_command_count == 1);
    assert(state.actor_commands[0].actor_index == last_topdown_npc_slot);
}

void test_segment_commands_toggle_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand start_commands[] = {
        { gbs::EventOp::StartSegment, 5, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventCommand stop_commands[] = {
        { gbs::EventOp::StopSegment, 5, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    assert(!gbs::event_segment_is_active(state, 5));

    gbs::run_event_script(state, start_commands, sizeof(start_commands) / sizeof(start_commands[0]));

    assert(gbs::event_segment_is_active(state, 5));
    assert(!gbs::event_segment_is_active(state, 4));

    gbs::run_event_script(state, stop_commands, sizeof(stop_commands) / sizeof(stop_commands[0]));

    assert(!gbs::event_segment_is_active(state, 5));
}

void test_scene_type_pause_commands_toggle_runtime_state() {
    gbs::EventState state {};
    gbs::init_event_state(state);

    const gbs::EventCommand pause_commands[] = {
        { gbs::EventOp::PauseSceneType, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    const gbs::EventCommand resume_commands[] = {
        { gbs::EventOp::ResumeSceneType, 0, 0, 0 },
        { gbs::EventOp::End, 0, 0, 0 }
    };

    assert(!gbs::event_scene_type_is_paused(state, 0));

    gbs::run_event_script(state, pause_commands, sizeof(pause_commands) / sizeof(pause_commands[0]));
    assert(gbs::event_scene_type_is_paused(state, 0));
    assert(!gbs::event_scene_type_is_paused(state, 1));

    gbs::run_event_script(state, resume_commands, sizeof(resume_commands) / sizeof(resume_commands[0]));
    assert(!gbs::event_scene_type_is_paused(state, 0));
}

void test_cross_runtime_warp_preserves_target_position_and_variables() {
    const auto verify_transition = [](gbs::RuntimeKind runtime, int room, int x, int y) {
        gbs::EventState source_state {};
        gbs::init_event_state(source_state);
        source_state.variables[3] = 42;

        const int packed_target = (static_cast<int>(runtime) << 12) | room;
        const gbs::EventCommand commands[] = {
            {
                gbs::EventOp::WarpRuntime,
                static_cast<int16_t>(packed_target),
                static_cast<int16_t>(x),
                static_cast<int16_t>(y)
            },
            { gbs::EventOp::End, 0, 0, 0 }
        };
        gbs::run_event_script(source_state, commands, sizeof(commands) / sizeof(commands[0]));

        assert(gbs::runtime_transition_pending());
        assert(gbs::runtime_transition_target() == runtime);

        gbs::EventState target_state {};
        gbs::init_event_state(target_state);
        int target_room = -1;
        int target_x = -1;
        int target_y = -1;
        assert(gbs::consume_runtime_transition(runtime, target_state, target_room, target_x, target_y));
        assert(target_room == room);
        assert(target_x == x);
        assert(target_y == y);
        assert(target_state.variables[3] == 42);
        assert(!gbs::runtime_transition_pending());
    };

    verify_transition(gbs::RuntimeKind::Platformer, 2, 48, 64);
    verify_transition(gbs::RuntimeKind::Shmup, 3, 120, 72);
    verify_transition(gbs::RuntimeKind::PointClick, 4, 16, 80);
}

void test_runtime_transition_route_exposes_pending_destination() {
    gbs::EventState source_state {};
    gbs::init_event_state(source_state);

    const int room = 7;
    const int packed_target = (static_cast<int>(gbs::RuntimeKind::Platformer) << 12) | room;
    const gbs::EventCommand commands[] = {
        {
            gbs::EventOp::WarpRuntime,
            static_cast<int16_t>(packed_target),
            32,
            112
        },
        { gbs::EventOp::End, 0, 0, 0 }
    };
    gbs::run_event_script(source_state, commands, sizeof(commands) / sizeof(commands[0]));

    gbs::RuntimeTransitionRoute route {};
    assert(gbs::runtime_transition_route(route));
    assert(route.runtime == gbs::RuntimeKind::Platformer);
    assert(route.local_index == room);

    gbs::EventState target_state {};
    gbs::init_event_state(target_state);
    int target_room = -1;
    int target_x = -1;
    int target_y = -1;
    assert(gbs::consume_runtime_transition(
        gbs::RuntimeKind::Platformer,
        target_state,
        target_room,
        target_x,
        target_y
    ));
    assert(target_room == room);
    assert(!gbs::runtime_transition_route(route));
}

void test_runtime_save_restore_transition_preserves_target_and_slot() {
    assert(!gbs::request_runtime_save_restore(gbs::RuntimeKind::Platformer, -1));
    assert(!gbs::runtime_transition_pending());

    assert(gbs::request_runtime_save_restore(gbs::RuntimeKind::Platformer, 2));
    assert(gbs::runtime_transition_pending());
    assert(gbs::runtime_transition_target() == gbs::RuntimeKind::Platformer);

    gbs::EventState state {};
    gbs::init_event_state(state);
    int room = -1;
    int player_x = -1;
    int player_y = -1;
    assert(!gbs::consume_runtime_transition(
        gbs::RuntimeKind::Platformer,
        state,
        room,
        player_x,
        player_y
    ));
    assert(gbs::runtime_transition_pending());

    int slot_index = -1;
    assert(!gbs::consume_runtime_save_restore(gbs::RuntimeKind::TopDown, slot_index));
    assert(gbs::runtime_transition_pending());
    assert(gbs::consume_runtime_save_restore(gbs::RuntimeKind::Platformer, slot_index));
    assert(slot_index == 2);
    assert(!gbs::runtime_transition_pending());
}

} // namespace

void test_background_request_is_consumable_and_rejects_negative_index() {
    gbs::EventState state {};
    gbs::init_event_state(state);
    assert(state.background_request_index == -1);
    const gbs::EventCommand command { gbs::EventOp::SetBackground, 3, 0, 0 };
    gbs::run_event_script(state, &command, 1);
    assert(state.background_request_index == 3);
    state.background_request_index = -1;
    const gbs::EventCommand invalid { gbs::EventOp::SetBackground, -2, 0, 0 };
    gbs::run_event_script(state, &invalid, 1);
    assert(state.background_request_index == -1);
}

void test_clock_ticks_and_wraps_day() {
    gbs::EventState state{};
    gbs::init_event_state(state);
    const gbs::EventCommand commands[] = {
        {gbs::EventOp::StartGameClock, 10, 3, 1}, {gbs::EventOp::AdvanceTime, 1430, 0, 0}
    };
    gbs::run_event_script(state, commands, 2);
    gbs::tick_event_frame_counter(state);
    gbs::tick_event_frame_counter(state);
    assert(state.clock_minute == 1430);
    gbs::tick_event_frame_counter(state);
    assert(state.clock_minute == 0);
    const gbs::EventCommand back{gbs::EventOp::AdvanceTime, -20, 0, 0};
    gbs::run_event_script(state, &back, 1);
    assert(state.clock_minute == 1420);
    char display[6]{};
    gbs::format_event_clock(state, display);
    assert(display[0] == '2' && display[1] == '3' && display[3] == '4' && display[4] == '0');
}

void test_actor_effect_lifetime_and_projectile_binding() {
 gbs::EventState state{}; gbs::init_event_state(state);
 const gbs::EventCommand commands[]={{gbs::EventOp::ActorEffects,0,0,3,50},{gbs::EventOp::ProjectileLoadSlot,3,12,150,7},{gbs::EventOp::End,0,0,0}};
 gbs::run_event_script(state,{commands,3});
 assert(state.projectile_slot_sprite[3]==7 && state.projectile_slot_damage[3]==12);
 assert(!gbs::event_actor_effect_visible(state,0));
 assert(gbs::event_actor_effect_visible(state,1));
 gbs::tick_event_frame_counter(state);
 assert(gbs::event_actor_effect_visible(state,0));
 gbs::tick_event_frame_counter(state); gbs::tick_event_frame_counter(state);
 assert(gbs::event_actor_effect_visible(state,0));
}

void test_interactive_lock_and_equipment() {
 gbs::EventState state{}; gbs::init_event_state(state);
 gbs::EventInteractionState modal{};
 state.last_code_lock_variable=4;state.code_lock_digits=2;state.code_lock_code=10;
 assert(gbs::begin_event_interaction(state,modal));
 assert(modal.active && state.variables[4]==0);
 gbs::advance_event_code_lock(state,modal,{0,gbs::ButtonUp,0});
 gbs::advance_event_code_lock(state,modal,{0,gbs::ButtonA,0});
 assert(!modal.active && state.variables[4]==1);
 state.last_code_lock_variable=4;state.code_lock_digits=2;state.code_lock_code=10;
 gbs::begin_event_interaction(state,modal);
 gbs::advance_event_code_lock(state,modal,{0,gbs::ButtonB,0});
 assert(state.variables[4]==-1);
 state.equip_menu_requested=true;state.equip_menu_slots=2;state.equip_menu_pause=true;state.inventory[3]=1;
 assert(gbs::begin_event_interaction(state,modal));
 assert(gbs::select_event_equipment(state,modal,1));
 assert(!gbs::select_event_equipment(state,modal,4));
 assert(gbs::select_event_equipment(state,modal,3));
 assert(state.equipped_items[1]==3 && state.inventory[3]==1);
 assert(gbs::select_event_equipment(state,modal,-1));
 assert(state.equipped_items[1]==-1);
}

void test_parallel_scripts_wait_and_cancel() {
 gbs::EventState state{};gbs::init_event_state(state);gbs::EventThreadPool pool{};
 const gbs::EventCommand child[]={{gbs::EventOp::AddVariable,0,1,0},{gbs::EventOp::Wait,2,0,0},{gbs::EventOp::AddVariable,0,2,0},{gbs::EventOp::End,0,0,0}};
 const gbs::EventScript scripts[]={{child,4}};
 const gbs::EventCommand start[]={{gbs::EventOp::StartSegment,3,0,0},{gbs::EventOp::Wait,20,0,0}};
 gbs::run_event_script(state,{start,2});
 gbs::tick_event_threads(pool,state,scripts,1);
 assert(state.variables[0]==1 && state.wait_frames==20);
 gbs::tick_event_threads(pool,state,scripts,1);
 assert(state.variables[0]==1 && state.wait_frames==20);
 state.segment_active[3]=false;
 for(int i=0;i<8;++i) gbs::tick_event_threads(pool,state,scripts,1);
 assert(state.variables[0]==1);
}

void test_adventure_movement_consumes_state() {
 gbs::EventState state{};gbs::init_event_state(state);
 state.adventure_state=1;state.adventure_frames=1;
 assert(gbs::adventure_event_speed_x100(state,100)==300);
 auto input=gbs::adventure_event_input(state,{0,0,0},1);
 assert(input.is_held(gbs::ButtonUp) && state.adventure_state==0);
 state.adventure_state=2;state.adventure_frames=12;
 assert(gbs::adventure_event_input(state,{0,0,0},2).is_held(gbs::ButtonRight));
 state.adventure_state=3;
 assert(gbs::adventure_event_input(state,{gbs::ButtonRight,0,0},0).held==0);
}

int main() {
 test_adventure_movement_consumes_state();
 test_parallel_scripts_wait_and_cancel();
 test_interactive_lock_and_equipment();
 test_actor_effect_lifetime_and_projectile_binding();
    test_clock_ticks_and_wraps_day();
    test_background_request_is_consumable_and_rejects_negative_index();
    test_ready_system_event_ops_update_runtime_state();
    test_player_event_commands_apply_to_reserved_player_slot();
    test_set_player_direction_updates_event_state();
    test_rtc_commands_read_fields_and_branch();
    test_player_event_speed_uses_subpixel_accumulator();
    test_link_commands_update_runtime_state();
    test_rumble_commands_drive_global_rumble_state();
    test_multiplayer4_commands_drive_session_and_variables();
    test_wallet_and_stat_commands_clamp_to_valid_ranges();
    test_multiply_variable_command_updates_runtime_state();
    test_divide_and_mod_variable_commands_update_runtime_state();
    test_variable_flag_commands_update_runtime_state();
    test_reset_variables_false_clears_runtime_variables();
    test_fade_commands_update_runtime_state();
    test_visual_effect_command_updates_runtime_state();
    test_cross_runtime_transition_carries_reveal_to_target_state();
    test_synchronous_scene_transition_waits_for_cover_before_routing();
    test_random_variable_command_updates_runtime_state_with_inclusive_range();
    test_set_random_seed_command_uses_variable_value_with_nonzero_fallback();
    test_mute_audio_channel_command_updates_runtime_state();
    test_audio_volume_commands_update_runtime_state();
    test_run_audio_routine_command_updates_tracker_runtime_state();
    test_play_pcm_sfx_command_updates_pcm_runtime_state();
    test_set_dialogue_text_speed_command_updates_runtime_state();
    test_set_text_sfx_command_updates_runtime_state();
    test_set_dialogue_frame_command_updates_runtime_state();
    test_jump_if_variable_equals_routes_to_matching_warp();
    test_variable_comparison_jumps_gate_next_command();
    test_variable_to_variable_jump_gates_next_command();
    test_room_conditional_jump_gates_next_command();
    test_engine_field_commands_store_and_gate_runtime_state();
    test_store_actor_state_commands_copy_actor_state_to_variables();
    test_button_pressed_jump_gates_next_command();
    test_wait_button_pressed_pauses_runner_until_matching_input();
    test_wait_actor_animation_pauses_runner_until_animation_finishes();
    test_inventory_commands_store_remove_and_gate_quantities();
    test_actor_condition_jumps_gate_runtime_actor_state();
    test_actor_condition_jumps_support_player_and_tile_scaled_positions();
    test_actor_position_condition_supports_wide_maps();
    test_call_script_command_records_project_script_index();
    test_camera_property_command_updates_runtime_state();
    test_button_event_bindings_route_pressed_input_to_script();
    test_adventure_callback_bindings_route_runtime_callbacks_to_script();
    test_platform_callback_bindings_route_runtime_callbacks_to_script();
    test_choice_pauses_event_runner_before_following_branch_commands();
    test_dialogue_pauses_event_runner_before_cross_runtime_warp();
    test_seed_random_and_platformer_state_commands_publish_runtime_requests();
    test_platformer_engine_field_and_tile_sequence_preserve_gb_studio_state();
    test_timer_event_bindings_route_elapsed_frames_to_script();
    test_rate_limit_gates_next_command_until_enough_frames_pass();
    test_manual_save_commands_update_runtime_requests_and_cached_status();
    test_dialogue_language_command_switches_runtime_locale();
    test_projectile_commands_update_runtime_launch_requests_and_slots();
    test_set_player_animation_updates_runtime_state();
    test_show_actor_gesture_updates_runtime_state();
    test_set_actor_sprite_queues_runtime_command();
    test_script_lock_commands_update_runtime_state();
    test_scene_stack_commands_update_current_room_history();
    test_scene_stack_restores_player_state_across_runtimes();
    test_actor_update_script_commands_toggle_runtime_state();
    test_actor_event_state_supports_last_topdown_npc_slot();
    test_segment_commands_toggle_runtime_state();
    test_scene_type_pause_commands_toggle_runtime_state();
    test_cross_runtime_warp_preserves_target_position_and_variables();
    test_runtime_transition_route_exposes_pending_destination();
    test_runtime_save_restore_transition_preserves_target_and_slot();
    return 0;
}
