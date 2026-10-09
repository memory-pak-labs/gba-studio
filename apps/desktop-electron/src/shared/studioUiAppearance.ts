export type StudioUiContrast = "standard" | "high";

export interface StudioUiAppearance {
  appBackgroundGray: number;
  canvasBackgroundGray: number;
  textContrast: number;
  brightness: number;
  contrast: StudioUiContrast;
}

export const STUDIO_UI_APPEARANCE_STORAGE_KEY = "gba-studio:ui-appearance";

export const DEFAULT_STUDIO_UI_APPEARANCE: StudioUiAppearance = {
  appBackgroundGray: 0,
  canvasBackgroundGray: 0,
  textContrast: 50,
  brightness: 50,
  contrast: "standard"
};

function clampPercentage(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(100, Math.max(0, Math.round(numeric)));
}

function normalizeAppearance(value: unknown): StudioUiAppearance {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ...DEFAULT_STUDIO_UI_APPEARANCE };
  }
  const candidate = value as Partial<StudioUiAppearance>;
  return {
    appBackgroundGray: clampPercentage(candidate.appBackgroundGray, DEFAULT_STUDIO_UI_APPEARANCE.appBackgroundGray),
    canvasBackgroundGray: clampPercentage(candidate.canvasBackgroundGray, DEFAULT_STUDIO_UI_APPEARANCE.canvasBackgroundGray),
    textContrast: clampPercentage(candidate.textContrast, DEFAULT_STUDIO_UI_APPEARANCE.textContrast),
    brightness: clampPercentage(candidate.brightness, DEFAULT_STUDIO_UI_APPEARANCE.brightness),
    contrast: candidate.contrast === "high" ? "high" : "standard"
  };
}

export function readStudioUiAppearance(
  storage: Pick<Storage, "getItem"> = localStorage
): StudioUiAppearance {
  try {
    const rawValue = storage.getItem(STUDIO_UI_APPEARANCE_STORAGE_KEY);
    return rawValue ? normalizeAppearance(JSON.parse(rawValue)) : { ...DEFAULT_STUDIO_UI_APPEARANCE };
  } catch {
    return { ...DEFAULT_STUDIO_UI_APPEARANCE };
  }
}

export function writeStudioUiAppearance(
  value: StudioUiAppearance,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(STUDIO_UI_APPEARANCE_STORAGE_KEY, JSON.stringify(normalizeAppearance(value)));
}

export function studioUiTextContrastTone(value: number): "low" | "standard" | "high" {
  return value < 34 ? "low" : value > 66 ? "high" : "standard";
}

export function studioUiBrightness(value: number): number {
  return 0.85 + clampPercentage(value, DEFAULT_STUDIO_UI_APPEARANCE.brightness) * 0.003;
}

export function applyStudioUiAppearance(
  value: StudioUiAppearance,
  root: HTMLElement = document.documentElement
): void {
  const appearance = normalizeAppearance(value);
  root.setAttribute("data-studio-ui-text-contrast", studioUiTextContrastTone(appearance.textContrast));
  root.setAttribute("data-studio-ui-contrast", appearance.contrast);
  root.style.setProperty("--studio-ui-app-gray", `${appearance.appBackgroundGray}%`);
  root.style.setProperty("--studio-ui-canvas-gray", `${appearance.canvasBackgroundGray}%`);
  root.style.setProperty("--studio-ui-brightness", String(studioUiBrightness(appearance.brightness)));
}
