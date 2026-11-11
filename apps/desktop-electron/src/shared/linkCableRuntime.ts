import { sceneChangeCommandParts } from "./sceneChangeCommand.js";
import { authoredEventCommandRecords } from "./authoredEventCommands.js";
import type { GBAProjectData } from "./projectFile.js";

export const QUEUED_MULTIPLAYER_VERBS = ["multiplayer_queue_open", "multiplayer_queue_send", "multiplayer_queue_receive", "multiplayer_queue_status", "multiplayer_queue_close"] as const;
export function hasQueuedMultiplayerCommands(data: GBAProjectData, verbs: readonly string[] = QUEUED_MULTIPLAYER_VERBS): boolean {
  return authoredEventCommandRecords(data).some(record => record.isEnabled !== false && record.enabled !== false &&
    [record.command, ...(typeof record.commands === "string" ? record.commands.split(/\r?\n/) : [])].some(command =>
      typeof command === "string" && verbs.includes(sceneChangeCommandParts(command)[0] ?? "")));
}

export type LinkCableRole = "none" | "host" | "join";
export type LinkCableStatus = "closed" | "connected" | "timeout";

export type LinkCableCommand =
  | { kind: "host" | "join"; callbackEvent: string; timeoutFrames: number }
  | { kind: "transfer"; variable: string; value: number; timeoutFrames: number }
  | { kind: "close" }
  | { kind: "rumble_on" }
  | { kind: "rumble_on_for"; frames: number }
  | { kind: "rumble_off" }
  | { kind: "mp4_open"; players: number }
  | { kind: "mp4_set"; value: number }
  | { kind: "mp4_sync" }
  | { kind: "mp4_read"; varPlayer: string; varCount: string; varBase: string }
  | { kind: "mp4_close" }
  | { kind: "queue_open"; players: number; baud: number; timeoutFrames: number }
  | { kind: "queue_send"; varValue: string; varAccepted: string }
  | { kind: "queue_receive"; varValue: string; varPlayer: string; varReceived: string }
  | { kind: "queue_status"; varState: string; varPlayer: string; varPending: string }
  | { kind: "queue_close" };

export type EngineLinkCableCommand =
  | { op: "link_host" | "link_join"; script: number; timeout_frames: number }
  | { op: "link_transfer"; variable: number; value: number; timeout_frames: number }
  | { op: "link_close" }
  | { op: "rumble_on" }
  | { op: "rumble_on_for"; frames: number }
  | { op: "rumble_off" }
  | { op: "multiplayer_open"; players: number }
  | { op: "multiplayer_close" }
  | { op: "multiplayer_set_data"; value: number }
  | { op: "multiplayer_sync" }
  | { op: "multiplayer_read"; var_player: number; var_count: number; var_base: number }
  | { op: "multiplayer_queue_open"; players: number; baud: number; timeout_frames: number }
  | { op: "multiplayer_queue_send"; var_value: number; var_accepted: number }
  | { op: "multiplayer_queue_receive"; var_value: number; var_player: number; var_received: number }
  | { op: "multiplayer_queue_status"; var_state: number; var_player: number; var_pending: number }
  | { op: "multiplayer_queue_close" };

export interface RumblePreviewState {
  active: boolean;
  frames: number | null;
}

export interface Multiplayer4PreviewState {
  open: boolean;
  players: number;
  local: number;
  received: number[];
  syncOk: boolean;
}

export interface LinkCablePreviewState {
  role: LinkCableRole;
  status: LinkCableStatus;
  timeoutFrames: number;
  callbackEvent: string | null;
  lastSent: number | null;
  lastReceived: number | null;
  transferVariable: string | null;
  transferOk: boolean;
  rumble: RumblePreviewState;
  mp4: Multiplayer4PreviewState;
  queue: { state: number; players: number; pending: number[]; accepted: boolean };
}

function integer(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function timeout(value: string | undefined): number {
  return Math.max(1, Math.min(600, integer(value, 120)));
}

export function isLinkCableCommand(command: string): boolean {
  const verb = command.trim().split(/\s+/, 1)[0] ?? "";
  return [
    "multiplayer_host", "multiplayer_join", "multiplayer_transfer", "multiplayer_close",
    "rumble_on", "rumble_on_for", "rumble_off",
    "multiplayer4_open", "multiplayer4_set", "multiplayer4_sync", "multiplayer4_read", "multiplayer4_close"
  ].includes(verb) || (QUEUED_MULTIPLAYER_VERBS as readonly string[]).includes(verb);
}

export function parseLinkCableCommand(command: string): LinkCableCommand | null {
  const parts = sceneChangeCommandParts(command);
  if ((QUEUED_MULTIPLAYER_VERBS as readonly string[]).includes(parts[0] ?? "")) {
    const verb = parts[0]!;
    const arity = verb === "multiplayer_queue_close" ? 1 : verb === "multiplayer_queue_send" ? 3 : 4;
    if (parts.length !== arity || parts.slice(1).some(value => !value.trim())) throw new Error(`Parâmetros incompletos em ${verb}.`);
    if (verb === "multiplayer_queue_open") {
      const [players, baud, frames] = parts.slice(1).map(value => /^\d+$/.test(value) ? Number(value) : NaN);
      if (![2,3,4].includes(players!) || ![9600,38400,57600,115200].includes(baud!) || !Number.isInteger(frames) || frames! < 1 || frames! > 600)
        throw new Error("Conexão com filas: escolha 2–4 jogadores, uma velocidade de cabo válida e 1–600 quadros.");
      return { kind: "queue_open", players: players!, baud: baud!, timeoutFrames: frames! };
    }
    if (verb !== "multiplayer_queue_close" && new Set(parts.slice(1)).size !== parts.length - 1)
      throw new Error("Use variáveis diferentes para os campos da conexão com filas.");
    if (verb === "multiplayer_queue_send") return { kind: "queue_send", varValue: parts[1]!, varAccepted: parts[2]! };
    if (verb === "multiplayer_queue_receive") return { kind: "queue_receive", varValue: parts[1]!, varPlayer: parts[2]!, varReceived: parts[3]! };
    if (verb === "multiplayer_queue_status") return { kind: "queue_status", varState: parts[1]!, varPlayer: parts[2]!, varPending: parts[3]! };
    return { kind: "queue_close" };
  }
  switch (parts[0]) {
    case "multiplayer_host":
      return { kind: "host", callbackEvent: parts[1] ?? "", timeoutFrames: timeout(parts[2]) };
    case "multiplayer_join":
      return { kind: "join", callbackEvent: parts[1] ?? "", timeoutFrames: timeout(parts[2]) };
    case "multiplayer_transfer":
      return {
        kind: "transfer",
        variable: parts[1] ?? "net.value",
        value: Math.max(0, Math.min(255, integer(parts[2], 0))),
        timeoutFrames: timeout(parts[3])
      };
    case "multiplayer_close":
      return { kind: "close" };
    case "rumble_on":
      return { kind: "rumble_on" };
    case "rumble_on_for":
      return { kind: "rumble_on_for", frames: Math.max(1, Math.min(600, integer(parts[1], 60))) };
    case "rumble_off":
      return { kind: "rumble_off" };
    case "multiplayer4_open":
      return { kind: "mp4_open", players: Math.max(2, Math.min(4, integer(parts[1], 2))) };
    case "multiplayer4_set":
      return { kind: "mp4_set", value: Math.max(0, Math.min(65535, integer(parts[1], 0))) };
    case "multiplayer4_sync":
      return { kind: "mp4_sync" };
    case "multiplayer4_read":
      return {
        kind: "mp4_read",
        varPlayer: parts[1] ?? "",
        varCount: parts[2] ?? "",
        varBase: parts[3] ?? ""
      };
    case "multiplayer4_close":
      return { kind: "mp4_close" };
    default:
      return null;
  }
}

export function toEngineLinkCableCommand(
  command: LinkCableCommand,
  resolver: { eventIndex(name: string): number; variableIndex(name: string): number }
): EngineLinkCableCommand {
  if (command.kind === "queue_open") return { op: "multiplayer_queue_open", players: command.players, baud: command.baud, timeout_frames: command.timeoutFrames };
  if (command.kind === "queue_send") return { op: "multiplayer_queue_send", var_value: resolver.variableIndex(command.varValue), var_accepted: resolver.variableIndex(command.varAccepted) };
  if (command.kind === "queue_receive") return { op: "multiplayer_queue_receive", var_value: resolver.variableIndex(command.varValue), var_player: resolver.variableIndex(command.varPlayer), var_received: resolver.variableIndex(command.varReceived) };
  if (command.kind === "queue_status") return { op: "multiplayer_queue_status", var_state: resolver.variableIndex(command.varState), var_player: resolver.variableIndex(command.varPlayer), var_pending: resolver.variableIndex(command.varPending) };
  if (command.kind === "queue_close") return { op: "multiplayer_queue_close" };
  if (command.kind === "close") return { op: "link_close" };
  if (command.kind === "rumble_on") return { op: "rumble_on" };
  if (command.kind === "rumble_on_for") return { op: "rumble_on_for", frames: command.frames };
  if (command.kind === "rumble_off") return { op: "rumble_off" };
  if (command.kind === "mp4_open") return { op: "multiplayer_open", players: command.players };
  if (command.kind === "mp4_set") return { op: "multiplayer_set_data", value: command.value };
  if (command.kind === "mp4_sync") return { op: "multiplayer_sync" };
  if (command.kind === "mp4_read") {
    return {
      op: "multiplayer_read",
      var_player: resolver.variableIndex(command.varPlayer),
      var_count: resolver.variableIndex(command.varCount),
      var_base: resolver.variableIndex(command.varBase)
    };
  }
  if (command.kind === "mp4_close") return { op: "multiplayer_close" };
  if (command.kind === "transfer") {
    return {
      op: "link_transfer",
      variable: resolver.variableIndex(command.variable),
      value: command.value,
      timeout_frames: command.timeoutFrames
    };
  }
  return {
    op: command.kind === "host" ? "link_host" : "link_join",
    script: resolver.eventIndex(command.callbackEvent),
    timeout_frames: command.timeoutFrames
  };
}

export function defaultLinkCablePreviewState(): LinkCablePreviewState {
  return {
    role: "none",
    status: "closed",
    timeoutFrames: 0,
    callbackEvent: null,
    lastSent: null,
    lastReceived: null,
    transferVariable: null,
    transferOk: false,
    rumble: { active: false, frames: null },
    mp4: { open: false, players: 0, local: 0, received: [], syncOk: false },
    queue: { state: 0, players: 0, pending: [], accepted: false }
  };
}

export function applyLinkCablePreviewCommand(state: LinkCablePreviewState, rawCommand: string, variableValue: (name: string) => number = () => 0): LinkCablePreviewState {
  const command = parseLinkCableCommand(rawCommand);
  if (!command) return state;
  if (command.kind === "queue_open") return { ...defaultLinkCablePreviewState(), queue: { state: 1, players: command.players, pending: [], accepted: false } };
  if (command.kind === "queue_close") return defaultLinkCablePreviewState();
  if (command.kind === "queue_send") {
    const accepted = state.queue.state !== 0 && state.queue.pending.length < 8;
    return { ...state, queue: { ...state.queue, accepted, pending: accepted ? [...state.queue.pending, Math.trunc(variableValue(command.varValue)) & 65535] : [...state.queue.pending] } };
  }
  if (command.kind === "queue_receive" || command.kind === "queue_status") return state;
  if (command.kind === "close") return defaultLinkCablePreviewState();
  if (command.kind === "rumble_on") {
    return { ...state, rumble: { active: true, frames: null } };
  }
  if (command.kind === "rumble_on_for") {
    return { ...state, rumble: { active: true, frames: command.frames } };
  }
  if (command.kind === "rumble_off") {
    return { ...state, rumble: { active: false, frames: null } };
  }
  if (command.kind === "mp4_open") {
    return { ...state, queue: defaultLinkCablePreviewState().queue, mp4: { open: true, players: command.players, local: 0, received: [], syncOk: false } };
  }
  if (command.kind === "mp4_set") {
    return { ...state, mp4: { ...state.mp4, local: command.value } };
  }
  if (command.kind === "mp4_sync") {
    if (!state.mp4.open) return state;
    return {
      ...state,
      mp4: {
        ...state.mp4,
        received: Array.from({ length: state.mp4.players }, (_, index) => index === 0 ? state.mp4.local : 0),
        syncOk: true
      }
    };
  }
  if (command.kind === "mp4_read") {
    return state;
  }
  if (command.kind === "mp4_close") {
    return { ...state, mp4: { open: false, players: 0, local: 0, received: [], syncOk: false } };
  }
  if (command.kind === "host" || command.kind === "join") {
    return {
      ...defaultLinkCablePreviewState(),
      role: command.kind,
      status: "connected",
      timeoutFrames: command.timeoutFrames,
      callbackEvent: command.callbackEvent || null
    };
  }
  if (command.kind !== "transfer") return state;
  const connected = state.role !== "none" && state.status === "connected";
  return {
    ...state,
    timeoutFrames: command.timeoutFrames,
    lastSent: command.value,
    lastReceived: connected ? command.value : null,
    transferVariable: command.variable,
    transferOk: connected,
    status: connected ? "connected" : "timeout"
  };
}
