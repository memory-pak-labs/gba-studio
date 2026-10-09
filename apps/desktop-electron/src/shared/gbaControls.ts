import type { GBAProjectData } from "./projectFile.js";

export type GBAControlActionID =
  | "up"
  | "down"
  | "left"
  | "right"
  | "a"
  | "b"
  | "l"
  | "r"
  | "start"
  | "select";

export interface GBAControlBindingDefinition {
  action: GBAControlActionID;
  label: string;
  settingKey: string;
  defaultKeys: string[];
}

export type GBAKeyboardBindings = Record<GBAControlActionID, string[]>;

export const GBA_CONTROL_BINDING_DEFINITIONS: GBAControlBindingDefinition[] = [
  { action: "up", label: "Cima", settingKey: "up", defaultKeys: ["ArrowUp", "w"] },
  { action: "down", label: "Baixo", settingKey: "down", defaultKeys: ["ArrowDown", "s"] },
  { action: "left", label: "Esquerda", settingKey: "left", defaultKeys: ["ArrowLeft", "a"] },
  { action: "right", label: "Direita", settingKey: "right", defaultKeys: ["ArrowRight", "d"] },
  { action: "a", label: "A", settingKey: "aButton", defaultKeys: ["Alt", "z", "j"] },
  { action: "b", label: "B", settingKey: "bButton", defaultKeys: ["Control", "k", "x"] },
  { action: "l", label: "Botao L", settingKey: "lButton", defaultKeys: ["Q"] },
  { action: "r", label: "Botao R", settingKey: "rButton", defaultKeys: ["E"] },
  { action: "start", label: "Start", settingKey: "startButton", defaultKeys: ["Enter"] },
  { action: "select", label: "Select", settingKey: "selectButton", defaultKeys: ["Shift"] }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function uniqueTokens(value: string[]): string[] {
  return [...new Set(value.map((token) => token.trim()).filter(Boolean))];
}

export function parseGBAKeyboardBindings(value: unknown, fallback: string[]): string[] {
  const parsed = typeof value === "string" ? uniqueTokens(value.split(",")) : [];
  return parsed.length > 0 ? parsed : uniqueTokens(fallback);
}

export function formatGBAKeyboardBindings(keys: string[]): string {
  return uniqueTokens(keys).join(",");
}

export function deriveGBAKeyboardBindings(data: GBAProjectData): GBAKeyboardBindings {
  const controls = isRecord(data.settings) && isRecord(data.settings.controls)
    ? data.settings.controls
    : {};

  return Object.fromEntries(GBA_CONTROL_BINDING_DEFINITIONS.map((definition) => [
    definition.action,
    parseGBAKeyboardBindings(controls[definition.settingKey], definition.defaultKeys)
  ])) as GBAKeyboardBindings;
}
