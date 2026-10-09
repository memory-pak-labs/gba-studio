export const SPRITE_EDITOR_LAYOUT_STORAGE_PREFIX = "gba-studio:sprite-editor:";
export const DEFAULT_SPRITE_EDITOR_BOTTOM_HEIGHT = 180;
export const MIN_SPRITE_EDITOR_BOTTOM_HEIGHT = 36;
export const MAX_SPRITE_EDITOR_BOTTOM_HEIGHT = 420;
export const COLLAPSED_SPRITE_EDITOR_BOTTOM_HEIGHT = 36;

export function spriteEditorLayoutStorageKey(suffix: "bottom-height" | "frames-open" | "tiles-open"): string {
  return `${SPRITE_EDITOR_LAYOUT_STORAGE_PREFIX}${suffix}`;
}

export function clampSpriteEditorBottomHeight(height: number): number {
  if (!Number.isFinite(height)) {
    return DEFAULT_SPRITE_EDITOR_BOTTOM_HEIGHT;
  }

  return Math.min(MAX_SPRITE_EDITOR_BOTTOM_HEIGHT, Math.max(MIN_SPRITE_EDITOR_BOTTOM_HEIGHT, Math.round(height)));
}

export function readSpriteEditorBottomHeight(
  storage: Pick<Storage, "getItem"> = localStorage
): number {
  const raw = storage.getItem(spriteEditorLayoutStorageKey("bottom-height"));
  if (!raw) {
    return DEFAULT_SPRITE_EDITOR_BOTTOM_HEIGHT;
  }

  return clampSpriteEditorBottomHeight(Number.parseFloat(raw));
}

export function writeSpriteEditorBottomHeight(
  height: number,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(
    spriteEditorLayoutStorageKey("bottom-height"),
    String(clampSpriteEditorBottomHeight(height))
  );
}

export function readSpriteEditorSectionOpen(
  suffix: "frames-open" | "tiles-open",
  storage: Pick<Storage, "getItem"> = localStorage
): boolean {
  const raw = storage.getItem(spriteEditorLayoutStorageKey(suffix));
  if (raw === null) {
    return true;
  }

  return raw !== "closed";
}

export function writeSpriteEditorSectionOpen(
  suffix: "frames-open" | "tiles-open",
  open: boolean,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(spriteEditorLayoutStorageKey(suffix), open ? "open" : "closed");
}

export function toggleSpriteEditorBottomHeight(currentHeight: number): number {
  return currentHeight <= COLLAPSED_SPRITE_EDITOR_BOTTOM_HEIGHT
    ? DEFAULT_SPRITE_EDITOR_BOTTOM_HEIGHT
    : COLLAPSED_SPRITE_EDITOR_BOTTOM_HEIGHT;
}
