import type { GBAProjectData } from "./projectFile.js";
import type { MenuEmbeddedScreenConfig } from "./menuScene.js";

type ProjectRecord = Record<string, unknown>;

function records(value: unknown): ProjectRecord[] {
  return Array.isArray(value) ? value.filter((item): item is ProjectRecord => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

export interface MenuSliderItemPatch {
  label?: string;
  spriteSheet?: string;
  targetScreenID?: string;
  targetItemID?: string;
  eventName?: string;
}

export function findMenuSliderScreen(data: GBAProjectData, sceneName: string, screenID: string): MenuEmbeddedScreenConfig | null {
  const scene = records(data.scenas).find((item) => item.name === sceneName);
  const runtime = scene?.runtime as ProjectRecord | undefined;
  const config = runtime?.config as ProjectRecord | undefined;
  const screen = records(config?.screens).find((item) => item.id === screenID && item.carousel === true);
  return screen ? screen as unknown as MenuEmbeddedScreenConfig : null;
}

export function menuSliderSprite(data: GBAProjectData, sceneName: string, itemID: string): string {
  const actor = records(data.actors).find((item) => item.roomName === sceneName && item.menuItemID === itemID && item.menuActorRole === "option");
  return typeof actor?.spriteSheet === "string" ? actor.spriteSheet : "";
}

export function menuSliderSpriteOptions(data: GBAProjectData, sceneName: string, screenID: string): string[] {
  const active = findMenuSliderScreen(data, sceneName, screenID)?.items.map((item) => menuSliderSprite(data, sceneName, item.id)) ?? [];
  const compatible = records(data.assets)
    .filter((asset) => asset.kind === "Sprite" && (asset.metadata as ProjectRecord | undefined)?.role === "initial-menu-option")
    .map((asset) => asset.name)
    .filter((name): name is string => typeof name === "string");
  return [...new Set([...active, ...compatible].filter(Boolean))];
}

export function updateMenuSliderItemInProject(
  data: GBAProjectData,
  sceneName: string,
  screenID: string,
  itemID: string,
  patch: MenuSliderItemPatch
): GBAProjectData {
  if (!findMenuSliderScreen(data, sceneName, screenID)?.items.some((item) => item.id === itemID)) return data;
  const next = structuredClone(data);
  for (const key of ["scenas", "rooms"] as const) {
    for (const scene of records(next[key])) {
      if (scene.name !== sceneName) continue;
      const runtime = scene.runtime as ProjectRecord | undefined;
      const config = runtime?.config as ProjectRecord | undefined;
      for (const screen of records(config?.screens)) {
        if (screen.id !== screenID || screen.carousel !== true) continue;
        screen.items = records(screen.items).map((item): ProjectRecord => item.id === itemID ? {
          ...item,
          ...(patch.label !== undefined ? { label: patch.label } : {}),
          ...(patch.targetScreenID !== undefined ? { targetScreenID: patch.targetScreenID } : {}),
          ...(patch.targetItemID !== undefined ? { targetItemID: patch.targetItemID } : {}),
          ...(patch.eventName !== undefined ? { eventName: patch.eventName } : {})
        } : item);
      }
    }
  }
  if (patch.spriteSheet !== undefined) {
    const available = records(next.assets).some((asset) => asset.kind === "Sprite" && asset.name === patch.spriteSheet);
    if (!available) return data;
    const animation = records(next.animations).find((entry) => entry.spriteSheet === patch.spriteSheet);
    for (const actor of records(next.actors)) {
      if (actor.roomName !== sceneName || actor.menuItemID !== itemID || actor.menuActorRole !== "option") continue;
      actor.spriteSheet = patch.spriteSheet;
      if (typeof animation?.name === "string") actor.animationName = animation.name;
      else delete actor.animationName;
      delete actor.animationStateID;
    }
  }
  return next;
}
