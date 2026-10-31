import type { GBAProjectData } from "./projectFile.js";
import { normalizeSceneTypeId } from "./sceneTypes.js";

export interface PointClickTargetConfig {
  giveItem: string;
  ownershipVariable: number;
  requiredItem: string;
  consumeRequiredItem: boolean;
  unavailableDialogue: string;
  useItemEvent: string;
}

export interface PointClickInventoryItem {
  name: string;
  variable: number;
}

const record = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value)
  ? value.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object" && !Array.isArray(entry)) : [];
const text = (value: unknown): string => typeof value === "string" ? value.trim() : "";

export function normalizePointClickTarget(value: unknown): PointClickTargetConfig {
  const config = record(value);
  return {
    giveItem: text(config.giveItem),
    ownershipVariable: typeof config.ownershipVariable === "number" && Number.isFinite(config.ownershipVariable)
      ? Math.max(0, Math.min(63, Math.trunc(config.ownershipVariable))) : 0,
    requiredItem: text(config.requiredItem),
    consumeRequiredItem: config.consumeRequiredItem === true,
    unavailableDialogue: text(config.unavailableDialogue),
    useItemEvent: text(config.useItemEvent)
  };
}

function pointClickCollectors(data: GBAProjectData): Record<string, unknown>[] {
  const scenes = records(data.scenas).length ? records(data.scenas) : records(data.rooms);
  const names = new Set(scenes.filter(scene => normalizeSceneTypeId(text(scene.sceneType ?? record(scene.runtime).type), "custom") === "pointAndClick")
    .map(scene => text(scene.name)));
  return records(data.triggers).filter(trigger => !text(trigger.roomName) || names.has(text(trigger.roomName)));
}

/** Names remain visible in the editor even if an imported variable binding is invalid. */
export function pointClickItemNames(data: GBAProjectData): string[] {
  return [...new Set(pointClickCollectors(data).map(trigger => normalizePointClickTarget(trigger.pointClick).giveItem).filter(Boolean))];
}

/** Native PointClickInventoryItemData owns an item while its EventState variable is nonzero. */
export function pointClickInventoryItems(data: GBAProjectData): PointClickInventoryItem[] {
  const items = new Map<string, number>();
  for (const trigger of pointClickCollectors(data)) {
    const config = normalizePointClickTarget(trigger.pointClick);
    if (!config.giveItem) continue;
    const raw = record(trigger.pointClick).ownershipVariable;
    if (raw !== undefined && (typeof raw !== "number" || !Number.isInteger(raw) || raw < 0 || raw > 63)) {
      throw new Error(`Variável de posse do item ${config.giveItem} precisa estar entre 0 e 63.`);
    }
    const existing = items.get(config.giveItem);
    if (existing !== undefined && existing !== config.ownershipVariable) {
      throw new Error(`Item ${config.giveItem} usa variáveis de posse diferentes nos alvos.`);
    }
    for (const [name, variable] of items) {
      if (name !== config.giveItem && variable === config.ownershipVariable) {
        throw new Error(`Itens ${name} e ${config.giveItem} precisam de variáveis de posse diferentes.`);
      }
    }
    items.set(config.giveItem, config.ownershipVariable);
  }
  return [...items].map(([name, variable]) => ({ name, variable }));
}
