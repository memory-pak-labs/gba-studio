import { lutaEventVerbs } from "./lutaEventCommands.js";

export type NativeEventCommandExportHandling = "runtime" | "structural" | "editor-only";

const nativeEventCommandExportHandlingByVerb = new Map<string, NativeEventCommandExportHandling>([
  ...lutaEventVerbs.map(verb => [verb, "runtime"] as const),
  ...([
    "noop",
    "set_actor_animation_state",
    "cancel_actor_movement",
    "actor_effects",
    "open_menu",
    "open_shop",
    "open_equip_menu",
    "open_code_lock",
    "start_segment",
    "stop_segment",
    "set_adventure_state",
    "push_actor",
    "draw_text",
    "projectile_load_slot",
    "launch_projectile_slot",
    "start_game_clock",
    "advance_time",
    "store_engine_field",
    "attach_adventure_callback",
    "remove_adventure_callback",
    "remove_platform_callback",
    "store_save_variable",
    "visual_effect",
    "idle",
    "run_audio_routine",
    "pause_scene_type",
    "resume_scene_type",
    "set_platform_state",
    "show_dialogue",
    "show_choice",
    "open_text_input",
    "change_scene",
    "change_scene_by_variable",
    "advance_campaign",
    "scene_stack_push",
    "scene_stack_clear",
    "scene_stack_previous",
    "scene_stack_first",
    "play_music",
    "play_sfx",
    "mute_audio_channel",
    "set_audio_volume",
    "fade_audio_volume",
    "call_event",
    "call_procedure",
    "data_table_lookup",
    "set_variable",
    "add_variable",
    "divide_variable",
    "mod_variable",
    "multiply_variable",
    "set_flag",
    "add_item",
    "modify_wallet",
    "set_equipped_item",
    "fade_in",
    "fade_out",
    "camera_follow_player",
    "camera_set_position",
    "camera_move",
    "camera_set_bounds",
    "set_camera_property",
    "move_actor",
    "move_actor_relative",
    "set_actor_relative_position",
    "move_actor_to",
    "set_actor_position",
    "teleport_actor",
    "set_actor_visible",
    "set_actor_active",
    "set_actor_collision_enabled",
    "set_all_sprites_visible",
    "set_actor_animation_speed",
    "set_actor_sprite",
    "show_actor_gesture",
    "player_bounce",
    "set_actor_collision_box",
    "set_player_speed_profile",
    "set_player_movement_state",
    "set_platformer_state",
    "change_actor_sprite",
    "change_player_sprite",
    "attach_platform_callback",
    "store_actor_position",
    "store_actor_direction",
    "set_random_seed",
    "seed_random",
    "wait_button",
    "set_stat",
    "wait",
    "stop_music",
    "close_dialogue",
    "save_game",
    "load_game",
    "remove_save_game",
    "set_actor_animation",
    "set_actor_direction",
    "turn_actor",
    "camera_lock_player",
    "shake_screen",
    "modify_stat",
    "show_stat_bar",
    "show_hearts",
    "show_number_hud",
    "replace_tile",
    "replace_tile_sequence",
    "replace_tile_animation",
    "set_engine_field",
    "set_actor_movement_speed",
    "push_actor_away_from_player",
    "wait_actor_animation",
    "random_variable",
    "add_variable_flags",
    "set_variable_flags",
    "clear_variable_flags",
    "reset_variables_false",
    "lock_script",
    "unlock_script",
    "set_actor_animation_frame",
    "launch_projectile",
    "overlay_line",
    "overlay_show",
    "overlay_move",
    "overlay_hide",
    "set_dialogue_text_speed",
    "set_language",
    "set_dialogue_frame",
    "play_actor_animation",
    "set_text_sfx",
    "restore_colors",
    "set_background",
    "set_background_palette",
    "set_sprite_palette",
    "show_dialogue_speaker",
    "if_variable",
    "if_variable_greater_than",
    "if_variable_less_than",
    "if_variable_variable",
    "if_flag",
    "has_item",
    "if_scene",
    "if_save_game",
    "if_engine_field",
    "if_engine_field_variable",
    "read_rtc",
    "if_rtc",
    "if_button",
    "if_actor_direction",
    "if_actor_at_position",
    "if_actor_distance",
    "if_actor_relative",
    "attach_button",
    "remove_button",
    "timer_attach",
    "timer_restart",
    "timer_remove",
    "end_event",
    "rate_limit",
    "multiplayer_host",
    "multiplayer_join",
    "multiplayer_transfer",
    "multiplayer_close",
    "rumble_on",
    "rumble_on_for",
    "rumble_off",
    "multiplayer4_open",
    "multiplayer4_set",
    "multiplayer4_sync",
    "multiplayer4_read",
    "multiplayer4_close"
  ] as const).map((verb) => [verb, "runtime"] as const),
  ...([
    "else",
    "slider",
    "choice_event",
    "switch_variable",
    "repeat_expression",
    "stop_event",
    "loop_begin",
    "loop_end",
    "condition_end",
    "rate_limit_end"
  ] as const).map((verb) => [verb, "structural"] as const),
  ...(["comment", "group"] as const).map((verb) => [verb, "editor-only"] as const)
]);

export function nativeEventCommandExportHandling(verb: string): NativeEventCommandExportHandling | null {
  return nativeEventCommandExportHandlingByVerb.get(verb) ?? null;
}

export function nativeRuntimeEventCommandVerbs(): string[] {
  return [...nativeEventCommandExportHandlingByVerb.entries()]
    .filter(([, handling]) => handling === "runtime")
    .map(([verb]) => verb);
}

export function isNativeEventCommandAcceptedByRomExport(verb: string): boolean {
  return nativeEventCommandExportHandlingByVerb.has(verb);
}

export function isNativeEventCommandSupportedInRom(verb: string): boolean {
  const handling = nativeEventCommandExportHandling(verb);
  return handling === "runtime" || handling === "structural";
}

export function nativeEventCommandReferencedEvents(command: string): string[] {
  const parts = command.split(/\s+/).filter(Boolean);
  const verb = parts[0] ?? "noop";
  const references: string[] = [];

  if (["call_event", "call_procedure", "lock_script", "unlock_script", "timer_restart", "timer_remove"].includes(verb) && parts[1]) {
    references.push(parts[1]);
  } else if (verb === "choice_event" && parts[3]) {
    references.push(parts[3]);
  } else if (["attach_button", "timer_attach", "attach_platform_callback", "attach_adventure_callback", "start_segment"].includes(verb) && parts[2]) {
    references.push(parts[2]);
  } else if (verb === "repeat_expression" && parts[4]) {
    references.push(parts[4]);
  } else if (verb === "switch_variable") {
    for (let index = 2; index + 1 < parts.length; index += 2) {
      references.push(parts[index + 1]);
      if ((parts[index] ?? "").toLowerCase() === "else") break;
    }
  }

  return Array.from(new Set(references.filter(Boolean)));
}

export function unsupportedNativeEventCommandVerbs(commands: Iterable<string>): string[] {
  const unsupported = new Set<string>();
  for (const command of commands) {
    const verb = command.split(/\s+/).filter(Boolean)[0] ?? "noop";
    if (!isNativeEventCommandAcceptedByRomExport(verb)) unsupported.add(verb);
  }
  return [...unsupported].sort();
}
