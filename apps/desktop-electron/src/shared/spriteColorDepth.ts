import type { GBAProjectData } from "./projectFile.js";

export type SpriteColorMode = "4bpp" | "8bpp";

export function spriteColorMode(value: unknown): SpriteColorMode {
  if (value === undefined || value === null || value === "") return "4bpp";
  if (value === "4bpp" || value === "8bpp") return value;
  throw new Error(`Formato de cores OBJ inválido: ${String(value)}. Use 4bpp ou 8bpp.`);
}

export function spriteColorModeForSheet(data: GBAProjectData, reference: string): SpriteColorMode {
  const assets = (Array.isArray(data.assets) ? data.assets : []) as Record<string, unknown>[];
  const asset = assets.find(a => a.name === reference || a.id === reference);
  const metadata = (asset?.metadata ?? {}) as Record<string, unknown>;
  const explicit = metadata.colorMode ?? metadata.color_mode ?? asset?.colorMode;
  const refs = new Set([reference, asset?.id, asset?.name]);
  const animations = (Array.isArray(data.animations) ? data.animations : []) as Record<string, unknown>[];
  const modes = new Set(animations.filter(a => refs.has(a.spriteSheet) && a.colorMode !== undefined).map(a => spriteColorMode(a.colorMode)));
  if (explicit !== undefined) modes.add(spriteColorMode(explicit));
  if (modes.size > 1) throw new Error(`A folha ${reference} tem formatos de cores diferentes. Selecione um formato único no workspace Sprites.`);
  return modes.values().next().value ?? "4bpp";
}
