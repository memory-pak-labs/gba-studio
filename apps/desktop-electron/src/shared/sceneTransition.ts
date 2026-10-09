export const SCENE_TRANSITION_STYLES = ["cut", "fade", "fade-color", "wipe", "mosaic", "slide", "crossfade"] as const;

export type SceneTransitionStyle = typeof SCENE_TRANSITION_STYLES[number];

export type SceneTransitionVisualEffect = "color_fade" | "mask" | "mosaic" | "push";

export interface SceneTransitionConfig {
  style: SceneTransitionStyle;
  durationFrames: number;
  fadeOut: boolean;
  fadeIn: boolean;
}

export const DEFAULT_SCENE_TRANSITION_CONFIG: SceneTransitionConfig = {
  style: "cut",
  durationFrames: 30,
  fadeOut: true,
  fadeIn: true
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function integerValue(value: unknown, fallback: number): number {
  const numeric = typeof value === "number" || typeof value === "string" ? Number(value) : Number.NaN;
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(0, Math.min(600, Math.trunc(numeric)));
}

function legacyTransitionStyle(value: unknown): SceneTransitionStyle | undefined {
  if (SCENE_TRANSITION_STYLES.includes(value as SceneTransitionStyle)) return value as SceneTransitionStyle;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLocaleLowerCase("pt-BR");
  const labels: Record<string, SceneTransitionStyle> = {
    "corte imediato": "cut",
    "fade preto": "fade",
    "fade claro": "fade-color",
    "máscara lateral": "wipe",
    "mosaico": "mosaic",
    "deslize lateral": "slide",
    "crossfade de paleta": "crossfade"
  };
  return labels[normalized];
}

function legacyDurationFrames(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return undefined;
  const numeric = Number.parseFloat(value.replace(",", "."));
  if (!Number.isFinite(numeric)) return undefined;
  return /s(?:ec(?:ond)?s?)?\b/i.test(value) ? numeric * 60 : numeric;
}

/** Resolves project-level defaults while keeping explicit connection overrides intact. */
export function sceneTransitionFromProjectSettings(value: unknown): SceneTransitionConfig {
  const source = isRecord(value) ? value : {};
  const legacySceneChange = typeof source.onSceneChange === "boolean" ? source.onSceneChange : undefined;
  return normalizeSceneTransition({
    style: source.style ?? legacyTransitionStyle(source.defaultStyle),
    durationFrames: source.durationFrames ?? legacyDurationFrames(source.duration),
    fadeOut: source.fadeOut ?? legacySceneChange,
    fadeIn: source.fadeIn ?? legacySceneChange
  });
}

export function normalizeSceneTransition(value: unknown): SceneTransitionConfig {
  const source = isRecord(value) ? value : {};
  const style = SCENE_TRANSITION_STYLES.includes(source.style as SceneTransitionStyle)
    ? source.style as SceneTransitionStyle
    : DEFAULT_SCENE_TRANSITION_CONFIG.style;
  return {
    style,
    durationFrames: integerValue(source.durationFrames, DEFAULT_SCENE_TRANSITION_CONFIG.durationFrames),
    fadeOut: typeof source.fadeOut === "boolean" ? source.fadeOut : DEFAULT_SCENE_TRANSITION_CONFIG.fadeOut,
    fadeIn: typeof source.fadeIn === "boolean" ? source.fadeIn : DEFAULT_SCENE_TRANSITION_CONFIG.fadeIn
  };
}

export function sceneTransitionUsesFade(config: SceneTransitionConfig): boolean {
  return config.style === "fade" && config.durationFrames > 0 && (config.fadeOut || config.fadeIn);
}

export function sceneTransitionVisualEffect(config: SceneTransitionConfig): SceneTransitionVisualEffect | null {
  switch (config.style) {
    case "fade-color":
    case "crossfade":
      return "color_fade";
    case "mosaic":
      return "mosaic";
    case "slide":
      return "push";
    case "wipe":
      return "mask";
    case "cut":
    case "fade":
      return null;
  }
}

export function sceneTransitionDisplayName(style: SceneTransitionStyle): string {
  switch (style) {
    case "cut": return "Corte imediato";
    case "fade": return "Fade preto";
    case "fade-color": return "Fade claro";
    case "wipe": return "Máscara lateral";
    case "mosaic": return "Mosaico";
    case "slide": return "Deslize lateral";
    case "crossfade": return "Crossfade de paleta";
  }
}

export function sceneTransitionUsesVisualEffect(config: SceneTransitionConfig): boolean {
  return config.style !== "cut" && config.durationFrames > 0 && (config.fadeOut || config.fadeIn);
}

export type SceneTransitionPhase = "cover" | "reveal";
