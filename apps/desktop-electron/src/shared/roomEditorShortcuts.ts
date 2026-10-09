import type { RoomEditorToolPanelMode } from "./roomsWorkspace/core.js";

export interface RoomEditorShortcutBinding {
  defaultKey: string;
  description: string;
  fieldKey: string;
  label: string;
  mode: RoomEditorToolPanelMode;
}

export type RoomEditorShortcutIssueKind = "conflict" | "invalid";

export interface RoomEditorShortcutIssue {
  conflictingFieldKeys?: string[];
  kind: RoomEditorShortcutIssueKind;
  message: string;
}

export interface RoomEditorShortcutKeyboardEvent {
  altKey?: boolean;
  code?: string;
  ctrlKey?: boolean;
  key: string;
  metaKey?: boolean;
  shiftKey?: boolean;
}

export interface RoomEditorReservedShortcut {
  label: string;
  shortcut: string;
}

export const ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS: readonly RoomEditorShortcutBinding[] = [
  { defaultKey: "v", description: "Selecionar e mover entidades", fieldKey: "select", label: "Selecionar", mode: "select" },
  { defaultKey: "b", description: "Pintar tiles no canvas", fieldKey: "paint", label: "Pintura", mode: "paint" },
  { defaultKey: "c", description: "Editar colisões por célula", fieldKey: "collision", label: "Colisão", mode: "collision" },
  { defaultKey: "h", description: "Editar níveis de altura isométricos", fieldKey: "height", label: "Altura", mode: "height" },
  { defaultKey: "a", description: "Criar e editar atores", fieldKey: "actor", label: "Ator", mode: "actor" },
  { defaultKey: "t", description: "Criar e editar triggers", fieldKey: "trigger", label: "Trigger", mode: "trigger" },
  { defaultKey: "z", description: "Editar zonas de câmera", fieldKey: "camera", label: "Zonas de câmera", mode: "camera" },
  { defaultKey: "p", description: "Criar zonas de entrada e saída entre cenas", fieldKey: "warp", label: "Warp", mode: "warp" },
  { defaultKey: "u", description: "Editar a HUD diretamente no viewport", fieldKey: "hud", label: "HUD", mode: "hud" },
  { defaultKey: "r", description: "Abrir configurações da cena no Inspetor", fieldKey: "room", label: "Cena", mode: "room" }
];

export const ROOM_EDITOR_TOOL_SHORTCUT_DEFAULTS: Readonly<Record<RoomEditorToolPanelMode, string>> = Object.fromEntries(
  ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.map((binding) => [binding.mode, binding.defaultKey])
) as Record<RoomEditorToolPanelMode, string>;

export const ROOM_EDITOR_RESERVED_SHORTCUTS: readonly RoomEditorReservedShortcut[] = [
  { shortcut: "mod+k", label: "a Paleta de comandos" },
  { shortcut: "mod+z", label: "Desfazer" },
  { shortcut: "mod+shift+z", label: "Refazer" },
  { shortcut: "mod+y", label: "Refazer" },
  { shortcut: "mod+d", label: "Duplicar entidade" },
  { shortcut: "e", label: "a Borracha contextual" },
  { shortcut: "f", label: "o preenchimento contextual" },
  { shortcut: "1", label: "o pincel de colisão" },
  { shortcut: "2", label: "o retângulo de colisão" },
  { shortcut: "3", label: "o preenchimento de colisão" }
];

const SHORTCUT_MODIFIER_ALIASES: Readonly<Record<string, "alt" | "mod" | "shift">> = {
  alt: "alt",
  option: "alt",
  cmd: "mod",
  command: "mod",
  control: "mod",
  ctrl: "mod",
  meta: "mod",
  mod: "mod",
  shift: "shift"
};

const SHORTCUT_MODIFIER_ORDER = ["mod", "alt", "shift"] as const;

function normalizedShortcutBaseKey(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLocaleLowerCase("en-US");
  return /^[a-z0-9]$/.test(key) ? key : null;
}

export function normalizeRoomEditorShortcut(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const parts = value.split("+").map((part) => part.trim().toLocaleLowerCase("en-US"));
  if (parts.length < 1 || parts.some((part) => part.length === 0)) return null;
  const key = normalizedShortcutBaseKey(parts.at(-1));
  if (!key) return null;

  const modifiers = parts.slice(0, -1).map((part) => SHORTCUT_MODIFIER_ALIASES[part]);
  if (modifiers.some((modifier) => !modifier) || new Set(modifiers).size !== modifiers.length) return null;

  return [
    ...SHORTCUT_MODIFIER_ORDER.filter((modifier) => modifiers.includes(modifier)),
    key
  ].join("+");
}

function shortcutBaseKeyFromKeyboardEvent(event: RoomEditorShortcutKeyboardEvent): string | null {
  const directKey = normalizedShortcutBaseKey(event.key);
  if (directKey) return directKey;
  if (typeof event.code === "string") {
    const codeMatch = /^(?:Key([A-Z])|Digit([0-9]))$/.exec(event.code);
    if (codeMatch) return (codeMatch[1] ?? codeMatch[2] ?? "").toLocaleLowerCase("en-US");
  }
  return null;
}

export function roomEditorShortcutFromKeyboardEvent(event: RoomEditorShortcutKeyboardEvent): string | null {
  const key = shortcutBaseKeyFromKeyboardEvent(event);
  if (!key) return null;
  return normalizeRoomEditorShortcut([
    event.ctrlKey || event.metaKey ? "mod" : null,
    event.altKey ? "alt" : null,
    event.shiftKey ? "shift" : null,
    key
  ].filter((part): part is string => Boolean(part)).join("+"));
}

export function formatRoomEditorShortcut(value: unknown): string {
  const normalized = normalizeRoomEditorShortcut(value);
  if (!normalized) return typeof value === "string" && value.trim() ? value.trim().toUpperCase() : "—";
  return normalized.split("+").map((part) => {
    if (part === "mod") return "⌘/Ctrl";
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join("+");
}

export function roomEditorShortcutAriaKey(value: unknown): string {
  const normalized = normalizeRoomEditorShortcut(value);
  if (!normalized) return "";
  return normalized.split("+").map((part) => {
    if (part === "mod") return "Control";
    return part.charAt(0).toUpperCase() + part.slice(1);
  }).join("+");
}

export function roomEditorReservedShortcutLabel(value: unknown): string | null {
  const normalized = normalizeRoomEditorShortcut(value);
  if (!normalized) return null;
  return ROOM_EDITOR_RESERVED_SHORTCUTS.find((reserved) => reserved.shortcut === normalized)?.label ?? null;
}

export function resolveRoomEditorToolShortcuts(source: Record<string, unknown> | undefined): Record<RoomEditorToolPanelMode, string> {
  const resolved = { ...ROOM_EDITOR_TOOL_SHORTCUT_DEFAULTS };
  const used = new Set<string>();
  const availableFallbackKeys = "abcdefghijklmnopqrstuvwxyz0123456789".split("");

  for (const binding of ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS) {
    const configured = normalizeRoomEditorShortcut(source?.[binding.fieldKey]);
    const candidate = [configured, binding.defaultKey, ...availableFallbackKeys]
      .filter((key): key is string => Boolean(key))
      .find((key) => !used.has(key) && !roomEditorReservedShortcutLabel(key));
    if (!candidate) continue;
    resolved[binding.mode] = candidate;
    used.add(candidate);
  }

  return resolved;
}

export function roomEditorToolModeFromShortcut(
  keyOrEvent: string | RoomEditorShortcutKeyboardEvent,
  shortcuts: Readonly<Record<RoomEditorToolPanelMode, string>> = ROOM_EDITOR_TOOL_SHORTCUT_DEFAULTS
): RoomEditorToolPanelMode | null {
  const normalized = typeof keyOrEvent === "string"
    ? normalizeRoomEditorShortcut(keyOrEvent)
    : roomEditorShortcutFromKeyboardEvent(keyOrEvent);
  if (!normalized) return null;
  return ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => normalizeRoomEditorShortcut(shortcuts[binding.mode]) === normalized)?.mode ?? null;
}

export function roomEditorShortcutIssues(source: Record<string, unknown> | undefined): Record<string, RoomEditorShortcutIssue[]> {
  const issues: Record<string, RoomEditorShortcutIssue[]> = {};
  const requestedKeys = new Map<string, string[]>();

  for (const binding of ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS) {
    const hasConfiguredValue = Boolean(source && Object.prototype.hasOwnProperty.call(source, binding.fieldKey));
    const rawValue = hasConfiguredValue ? source?.[binding.fieldKey] : binding.defaultKey;
    const normalized = normalizeRoomEditorShortcut(rawValue);

    if (hasConfiguredValue && !normalized) {
      issues[binding.fieldKey] = [{
        kind: "invalid",
        message: "Use uma letra ou número, com no máximo Shift, Ctrl/Cmd ou Alt."
      }];
      continue;
    }

    if (!normalized) continue;
    const fieldsForKey = requestedKeys.get(normalized) ?? [];
    fieldsForKey.push(binding.fieldKey);
    requestedKeys.set(normalized, fieldsForKey);
  }

  for (const fieldsForKey of requestedKeys.values()) {
    if (fieldsForKey.length < 2) continue;
    for (const fieldKey of fieldsForKey) {
      const conflictingFieldKeys = fieldsForKey.filter((candidate) => candidate !== fieldKey);
      const conflictingLabels = conflictingFieldKeys
        .map((conflictingFieldKey) => ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS.find((binding) => binding.fieldKey === conflictingFieldKey)?.label)
        .filter((label): label is string => Boolean(label));
      issues[fieldKey] = [
        ...(issues[fieldKey] ?? []),
        {
          conflictingFieldKeys,
          kind: "conflict",
          message: `Conflita com ${conflictingLabels.join(", ")}.`
        }
      ];
    }
  }

  for (const binding of ROOM_EDITOR_TOOL_SHORTCUT_BINDINGS) {
    const configured = normalizeRoomEditorShortcut(source?.[binding.fieldKey]);
    const reservedLabel = roomEditorReservedShortcutLabel(configured);
    if (!reservedLabel) continue;
    issues[binding.fieldKey] = [
      ...(issues[binding.fieldKey] ?? []),
      {
        kind: "conflict",
        message: `Conflita com ${reservedLabel}.`
      }
    ];
  }

  return issues;
}

export function roomEditorShortcutSource(settings: unknown): Record<string, unknown> | undefined {
  if (!settings || typeof settings !== "object" || Array.isArray(settings)) return undefined;
  const shortcuts = (settings as Record<string, unknown>).shortcuts;
  return shortcuts && typeof shortcuts === "object" && !Array.isArray(shortcuts)
    ? shortcuts as Record<string, unknown>
    : undefined;
}
