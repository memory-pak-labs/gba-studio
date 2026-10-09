export type StudioUiFontSize = "compact" | "default" | "large";

export const STUDIO_UI_FONT_SIZE_STORAGE_KEY = "gba-studio:ui-font-size";

const studioUiFontScales: Record<StudioUiFontSize, number> = {
  compact: 0.9,
  default: 1,
  large: 1.15
};

function isStudioUiFontSize(value: string | null): value is StudioUiFontSize {
  return value === "compact" || value === "default" || value === "large";
}

export function readStudioUiFontSize(
  storage: Pick<Storage, "getItem"> = localStorage
): StudioUiFontSize {
  const value = storage.getItem(STUDIO_UI_FONT_SIZE_STORAGE_KEY);
  return isStudioUiFontSize(value) ? value : "compact";
}

export function writeStudioUiFontSize(
  value: StudioUiFontSize,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(STUDIO_UI_FONT_SIZE_STORAGE_KEY, value);
}

export function studioUiFontScale(value: StudioUiFontSize): number {
  return studioUiFontScales[value];
}

export function applyStudioUiFontSize(
  value: StudioUiFontSize,
  root: HTMLElement = document.documentElement
): void {
  root.setAttribute("data-studio-font-size", value);
  root.style.setProperty("--studio-font-scale", String(studioUiFontScale(value)));
}
