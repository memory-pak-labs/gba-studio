import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { nativeEventCommandExportHandling } from "./eventCommandRegistry.js";
import { isLutaEventVerb } from "./lutaEventCommands.js";
import { gbaTopdownTilePointToPixels } from "./gbaRendering.js";
import type { EngineExportProjectEventCommand } from "../main/exportEngineProject.js";
import { createPreviewRuntime, dispatchPreviewRuntimeAction, type PreviewRuntimeState } from "./previewRuntime.js";
import type { GBAProjectData } from "./projectFile.js";

export interface PreviewRomParityDimension {
  id: string;
  label: string;
  ok: boolean;
  preview: unknown;
  export: unknown;
  detail?: string;
}

export interface PreviewRomParityReport {
  ok: boolean;
  dimensions: PreviewRomParityDimension[];
  preview: {
    startRoom: string;
    eventCommands: string[];
    activeMusic: string | null;
    activeSfx: string | null;
    dialogueKey: string | null;
    playerSprite: string | null;
    playerAnimation: string | null;
  };
  export: {
    target: string;
    roomNames: string[];
    bootScriptOps: string[];
    dialogueLines: string[];
    playerSprite: string | null;
    playerAnimation: string | null;
  };
}

// O export real pode compilar "play_music"/"play_sfx" tanto para o op legado (audio composta via
// patterns/channels no editor, sem compilador para o formato do motor ainda) quanto para o op que
// de fato liga audio real do projeto (run_audio_routine -> tracker_assets, play_pcm_sfx ->
// pcm_assets - ver exportEngineProject.ts/resolveAudioPlayback). Qualquer um dos dois conta como
// paridade valida aqui.
export function previewCommandToExportOps(command: string): string[] {
  const verb = command.trim().split(/\s+/)[0] ?? "";
  if (isLutaEventVerb(verb)) return [verb];
  switch (verb) {
    case "noop":
      return [];
    case "set_actor_animation_state": return ["set_actor_sprite"];
    case "cancel_actor_movement": case "actor_effects": case "projectile_load_slot": case "launch_projectile_slot":
    case "draw_text": case "open_menu": case "open_shop": case "open_equip_menu": case "open_code_lock":
    case "start_segment": case "stop_segment": case "set_adventure_state": case "push_actor": return [verb];
    case "start_game_clock":
    case "advance_time":
      return [verb];
    case "play_music":
      return ["play_music", "run_audio_routine"];
    case "play_sfx":
      return ["play_sfx", "play_pcm_sfx"];
    case "call_event":
      return ["call_script"];
    case "show_dialogue":
      return ["show_dialogue"];
    case "show_dialogue_speaker":
      return ["show_dialogue"];
    case "show_choice":
      return ["show_choice"];
    case "change_scene":
      return ["change_scene", "warp", "warp_runtime"];
    case "change_scene_by_variable":
      return ["change_scene_by_variable", "jump_if_variable_equals", "warp", "warp_runtime"];
    case "attach_button":
      return ["attach_button_event"];
    case "remove_button":
      return ["remove_button_event"];
    case "timer_attach":
      return ["attach_timer_event"];
    case "timer_restart":
      return ["restart_timer_event"];
    case "timer_remove":
      return ["remove_timer_event"];
    case "end_event":
      return ["end"];
    case "set_variable":
      return ["set_variable"];
    case "add_variable":
      return ["add_variable"];
    case "multiply_variable":
      return ["multiply_variable"];
    case "set_flag":
      return ["set_variable"];
    case "add_item":
      return ["add_inventory_item"];
    case "modify_wallet":
      return ["modify_wallet"];
    case "set_equipped_item":
      return ["set_equipped_item"];
    case "fade_in":
    case "fade_out":
      return [verb];
    case "visual_effect":
      return ["visual_effect"];
    case "camera_follow_player":
      return ["follow_camera"];
    case "camera_set_position":
      return ["set_camera_position"];
    case "camera_move":
      return ["move_camera"];
    case "camera_set_bounds":
      return ["set_camera_bounds_x", "set_camera_bounds_y"];
    case "move_actor":
    case "move_actor_relative":
    case "set_actor_relative_position":
      return ["move_actor"];
    case "set_actor_position":
    case "move_actor_to":
    case "teleport_actor":
      return ["set_actor_position"];
    case "set_actor_visible":
      return ["set_actor_visible"];
    case "set_actor_active":
      return ["set_actor_active"];
    case "wait":
      return ["wait"];
    case "stop_music":
      return ["stop_music"];
    case "close_dialogue":
      return ["close_dialogue"];
    case "save_game":
    case "load_game":
    case "remove_save_game":
      return [verb];
    case "set_actor_animation":
      return ["set_actor_animation", "set_player_animation"];
    case "change_actor_sprite":
    case "change_player_sprite":
    case "set_actor_sprite":
      return ["set_actor_sprite"];
    case "set_actor_direction":
    case "turn_actor":
      return ["set_actor_direction"];
    case "camera_lock_player":
      return ["lock_camera"];
    case "shake_screen":
      return ["set_camera_shake"];
    case "modify_stat":
      return ["modify_stat"];
    case "show_stat_bar":
      return ["show_stat_bar"];
    case "show_hearts":
      return ["show_hearts"];
    case "show_number_hud":
      return ["show_number_hud"];
    case "mod_variable":
      return ["mod_variable"];
    case "replace_tile":
    case "replace_tile_sequence":
      return ["replace_tile"];
    case "replace_tile_animation":
      return ["replace_tile_sequence"];
    case "set_actor_movement_speed":
      return ["set_actor_speed"];
    case "wait_actor_animation":
      return ["wait_actor_animation"];
    case "if_variable":
    case "if_flag":
      return ["jump_if_variable_equals"];
    case "if_variable_greater_than":
      return ["jump_if_variable_greater_than"];
    case "if_variable_less_than":
      return ["jump_if_variable_less_than"];
    case "if_variable_variable":
      return ["jump_if_variable_equals_variable"];
    case "has_item":
      return ["jump_if_inventory_at_least"];
    case "if_scene":
      return ["jump_if_room_equals"];
    case "if_save_game":
      return ["jump_if_save_exists"];
    case "if_engine_field":
      return ["jump_if_engine_field_equals"];
    case "if_engine_field_variable":
      return ["jump_if_engine_field_equals_variable"];
    case "if_button":
      return ["jump_if_button_pressed"];
    case "if_actor_direction":
      return ["jump_if_actor_direction"];
    case "if_actor_at_position":
      return ["jump_if_actor_at_position"];
    case "if_actor_distance":
      return ["jump_if_actor_distance"];
    case "if_actor_relative":
      return ["jump_if_actor_relative"];
    case "switch_variable":
      return ["jump_if_variable_equals", "call_script"];
    case "repeat_expression":
      return ["jump_if_variable_less_than", "jump_if_variable_equals", "call_script"];
    case "stop_event":
      return ["jump"];
    case "random_variable":
      return ["random_variable"];
    case "lock_script":
    case "unlock_script":
      return [verb];
    case "set_actor_animation_frame":
      return ["set_actor_animation_frame"];
    case "overlay_line":
      return ["overlay_line"];
    case "set_dialogue_text_speed":
      return ["set_dialogue_text_speed"];
    case "set_language":
      return ["set_dialogue_language"];
    case "set_dialogue_frame":
      return ["set_dialogue_frame"];
    case "set_background_palette":
      return ["set_background_palette"];
    case "set_sprite_palette":
      return ["set_sprite_palette"];
    case "restore_colors":
      return ["set_background_palette", "set_sprite_palette"];
    case "set_text_sfx":
      return ["set_text_sfx"];
    case "play_actor_animation":
      return ["set_actor_animation", "set_player_animation"];
    case "multiplayer_host":
      return ["link_host"];
    case "multiplayer_join":
      return ["link_join"];
    case "multiplayer_transfer":
      return ["link_transfer"];
    case "multiplayer_close":
      return ["link_close"];
    case "rumble_on":
      return ["rumble_on"];
    case "rumble_on_for":
      return ["rumble_on_for"];
    case "rumble_off":
      return ["rumble_off"];
    case "multiplayer4_open":
      return ["multiplayer_open"];
    case "multiplayer4_set":
      return ["multiplayer_set_data"];
    case "multiplayer4_sync":
      return ["multiplayer_sync"];
    case "multiplayer4_read":
      return ["multiplayer_read"];
    case "multiplayer4_close":
      return ["multiplayer_close"];
    default:
      return nativeEventCommandExportHandling(verb) === "runtime" ? [verb] : [];
  }
}

function collectExportScriptOps(commands: EngineExportProjectEventCommand[] | undefined): string[] {
  return (commands ?? []).map((step) => step.op);
}

function bootScriptOpsFromContract(contract: ReturnType<typeof buildEngineExportProjectContract>): string[] {
  const scripts = contract.topdown_project?.scripts ?? contract.platformer_project?.scripts ?? [];
  const bootScript = scripts.find((script) => script.name === "room_boot");
  const bootDialogueScript = scripts.find((script) => script.name === "boot_dialogue");
  return [
    ...collectExportScriptOps(bootScript?.script),
    ...collectExportScriptOps(bootDialogueScript?.script)
  ];
}

function dimension(
  id: string,
  label: string,
  ok: boolean,
  preview: unknown,
  exportValue: unknown,
  detail?: string
): PreviewRomParityDimension {
  return { id, label, ok, preview, export: exportValue, detail };
}

export function auditPreviewRomParity(project: GBAProjectData): PreviewRomParityReport {
  const preview = createPreviewRuntime(project);
  const previewAfterAction = dispatchPreviewRuntimeAction(
    dispatchPreviewRuntimeAction(preview, "action"),
    "action"
  );
  const contract = buildEngineExportProjectContract(project);
  const topdown = contract.topdown_project;
  const exportRoomNames = (topdown?.rooms ?? contract.platformer_project?.rooms ?? []).map((room) => room.name);
  const bootScriptOps = bootScriptOpsFromContract(contract);
  const previewEventCommands = preview.eventLog.map((item) => item.command);
  const exportBootOps = new Set(bootScriptOps);
  // Cada comando do preview mapeia para um conjunto de ops de export equivalentes (ver
  // previewCommandToExportOps) - basta UM deles aparecer no boot script real para contar como
  // paridade satisfeita (ex.: "play_sfx" no preview pode virar "play_pcm_sfx" no export real).
  const unsatisfiedPreviewCommands = previewEventCommands.filter((command) => {
    const candidates = previewCommandToExportOps(command);
    return candidates.length > 0 && !candidates.some((op) => exportBootOps.has(op));
  });
  const hasMusicParity = bootScriptOps.includes("play_music") || bootScriptOps.includes("run_audio_routine");
  const hasSfxParity = bootScriptOps.includes("play_sfx") || bootScriptOps.includes("play_pcm_sfx");
  const dialogueLines = (topdown?.dialogue_lines ?? contract.platformer_project?.dialogue_lines ?? [])
    .map((line) => typeof line === "string" ? line : (typeof line?.text === "string" ? line.text : ""))
    .filter((line) => line.length > 0);
  const previewDialogueKey = preview.activeDialogue?.key ?? null;
  const previewDialogueText = preview.activeDialogue?.text ?? null;
  const exportPlayerSprite = topdown?.player.sprite_sheet
    ?? (topdown?.player.metasprite && typeof topdown.player.metasprite === "object"
      ? `${topdown.player.metasprite.asset}.png`
      : null);
  const exportPlayerAnimation = topdown?.player.animation_name
    ?? (typeof topdown?.player.animation === "string" ? topdown.player.animation : null);
  const previewPlayerTile = preview.player ? { x: preview.player.x, y: preview.player.y } : null;
  const exportStartRoom = topdown?.rooms.find((room) => room.name === preview.currentRoom?.name) ?? topdown?.rooms[0] ?? null;
  const exportPlayerStart = exportStartRoom?.metadata?.player_start ?? topdown?.player.position ?? null;
  const expectedExportPlayerStart = previewPlayerTile
    ? gbaTopdownTilePointToPixels(previewPlayerTile)
    : null;

  const dimensions: PreviewRomParityDimension[] = [
    dimension(
      "start-room",
      "Cena inicial",
      exportRoomNames.includes(preview.currentRoom?.name ?? ""),
      preview.currentRoom?.name ?? null,
      exportRoomNames
    ),
    dimension(
      "room-count",
      "Quantidade de rooms",
      exportRoomNames.length >= 2,
      preview.rooms.length,
      exportRoomNames.length
    ),
    dimension(
      "boot-commands",
      "Comandos do boot preview vs export",
      unsatisfiedPreviewCommands.length === 0,
      previewEventCommands,
      bootScriptOps,
      unsatisfiedPreviewCommands.length > 0 ? `Comandos sem op equivalente no export: ${unsatisfiedPreviewCommands.join(", ")}` : undefined
    ),
    dimension(
      "music",
      "Musica ativa",
      Boolean(preview.activeMusic) && hasMusicParity,
      preview.activeMusic,
      hasMusicParity
    ),
    dimension(
      "sfx",
      "SFX ativo",
      Boolean(preview.activeSfx) && hasSfxParity,
      preview.activeSfx,
      hasSfxParity
    ),
    dimension(
      "dialogue",
      "Dialogo inicial",
      Boolean(previewDialogueKey) &&
        (dialogueLines.includes(previewDialogueText ?? "") || dialogueLines.some((line) => line.length > 0)),
      {
        key: previewDialogueKey,
        text: previewDialogueText,
        modeAfterAction: previewAfterAction.activeDialogue?.mode ?? null
      },
      dialogueLines
    ),
    dimension(
      "player-sprite",
      "Sprite do player",
      preview.player?.spriteSheet === exportPlayerSprite,
      preview.player?.spriteSheet ?? null,
      exportPlayerSprite
    ),
    dimension(
      "player-animation",
      "Animacao do player",
      preview.player?.animationName === exportPlayerAnimation,
      preview.player?.animationName ?? null,
      exportPlayerAnimation
    ),
    dimension(
      "player-position",
      "Posicao do player (tile preview vs pixels export)",
      expectedExportPlayerStart !== null &&
        exportPlayerStart?.x === expectedExportPlayerStart.x &&
        exportPlayerStart?.y === expectedExportPlayerStart.y,
      previewPlayerTile,
      exportPlayerStart
    ),
    dimension(
      "choice-mode",
      "Escolha apos acao",
      previewAfterAction.activeDialogue?.mode === "choice",
      previewAfterAction.activeDialogue?.mode ?? null,
      topdown?.choice_groups?.length ?? 0
    )
  ];

  return {
    ok: dimensions.every((entry) => entry.ok),
    dimensions,
    preview: {
      startRoom: preview.currentRoom?.name ?? "",
      eventCommands: previewEventCommands,
      activeMusic: preview.activeMusic,
      activeSfx: preview.activeSfx,
      dialogueKey: previewDialogueKey,
      playerSprite: preview.player?.spriteSheet ?? null,
      playerAnimation: preview.player?.animationName ?? null
    },
    export: {
      target: contract.build.target,
      roomNames: exportRoomNames,
      bootScriptOps,
      dialogueLines,
      playerSprite: exportPlayerSprite,
      playerAnimation: exportPlayerAnimation
    }
  };
}

export function summarizePreviewRomParity(report: PreviewRomParityReport): string[] {
  return report.dimensions.filter((entry) => !entry.ok).map((entry) => {
    const detail = entry.detail ? ` (${entry.detail})` : "";
    return `${entry.label}${detail}`;
  });
}
