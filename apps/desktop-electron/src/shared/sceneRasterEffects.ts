export interface SceneRasterEffects {
  ripple: { enabled: boolean; layer: "BG1" | "BG2" | "BG3"; amplitude: number; wavelength: number; speed: number; top: number; bottom: number };
  gradient: { enabled: boolean; from: string; to: string; top: number; bottom: number };
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const integer = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
const color = (v: unknown, fallback: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;

export function normalizeSceneRasterEffects(value: unknown): SceneRasterEffects {
  const source = record(value), r = record(source.ripple), g = record(source.gradient);
  return {
    ripple: { enabled: r.enabled === true, layer: r.layer === "BG1" || r.layer === "BG3" ? r.layer : "BG2", amplitude: integer(r.amplitude, 4, 0, 16), wavelength: integer(r.wavelength, 32, 8, 160), speed: integer(r.speed, 2, 0, 8), top: integer(r.top, 80, 0, 159), bottom: integer(r.bottom, 160, 1, 160) },
    gradient: { enabled: g.enabled === true, from: color(g.from, "#3858a0"), to: color(g.to, "#b0d8f8"), top: integer(g.top, 0, 0, 158), bottom: integer(g.bottom, 80, 2, 160) }
  };
}
export const hasSceneRasterEffects = (value: unknown) => { const e = normalizeSceneRasterEffects(value); return e.ripple.enabled || e.gradient.enabled; };
export function sceneRasterEffectIssues(value: unknown, mode: string, authoredHblank: boolean): string[] {
  const source = record(value), e = normalizeSceneRasterEffects(value), issues: string[] = [];
  for (const name of ["ripple", "gradient"] as const) {
    if (!e[name].enabled) continue;
    const raw = record(source[name]);
    for (const [key, min, max] of (name === "ripple" ? [["amplitude",0,16],["wavelength",8,160],["speed",0,8],["top",0,159],["bottom",1,160]] : [["top",0,158],["bottom",2,160]]) as Array<[string,number,number]>) {
      if (raw[key] !== undefined && (typeof raw[key] !== "number" || !Number.isInteger(raw[key]) || Number(raw[key]) < min || Number(raw[key]) > max)) issues.push(`${name}: ${key} precisa estar entre ${min} e ${max}.`);
    }
    if (e[name].bottom - e[name].top < (name === "gradient" ? 2 : 1)) issues.push(`${name}: a linha final deve vir depois da inicial.`);
  }
  const g = record(source.gradient), r = record(source.ripple);
  if (e.gradient.enabled && [g.from, g.to].some(c => c !== undefined && (typeof c !== "string" || !/^#[0-9a-f]{6}$/i.test(c)))) issues.push("Gradiente: escolha duas cores válidas.");
  if (e.gradient.enabled && !["tilemap", "affine"].includes(mode)) issues.push("Gradiente de fundo requer uma cena em tiled ou affine.");
  if (e.ripple.enabled) {
    if (r.layer !== undefined && !["BG1","BG2","BG3"].includes(String(r.layer))) issues.push("Ondulação: escolha BG1, BG2 ou BG3.");
    if (authoredHblank) issues.push("Ondulação e a tabela HBlank avançada disputam o deslocamento do fundo. Use uma delas.");
    if (mode !== "tilemap" && !(mode === "affine" && e.ripple.layer === "BG1")) issues.push("Ondulação requer uma camada regular: no modo Affine, use BG1.");
  }
  return issues;
}
export function rgb555(hex: string): number {
  const v = Number.parseInt(hex.slice(1), 16);
  return ((v >> 19) & 31) | (((v >> 11) & 31) << 5) | (((v >> 3) & 31) << 10);
}
// Same quarter-wave table and rounding as GBAStudioEngine fixed_sin at 256 phases.
const sine = [0,6,13,19,25,31,38,44,50,56,62,68,74,80,86,92,98,104,109,115,121,126,132,137,142,147,152,157,162,167,172,177,181,185,190,194,198,202,206,209,213,216,220,223,226,229,231,234,237,239,241,243,245,247,248,250,251,252,253,254,255,255,256,256,256];
export function rasterScanline(e: SceneRasterEffects, y: number, frame: number): { offset: number; color: number } {
  const r = e.ripple, g = e.gradient;
  let offset = 0;
  if (r.enabled && y >= r.top && y < r.bottom) {
    const phase = (Math.floor((y - r.top) * 256 / r.wavelength) + frame * r.speed) & 255;
    const q = phase >> 6, i = phase & 63, value = sine[q & 1 ? 64 - i : i] * (q >= 2 ? -1 : 1) * r.amplitude;
    offset = Math.trunc((value + (value >= 0 ? 128 : -128)) / 256);
  }
  const from = rgb555(g.from), to = rgb555(g.to), length = Math.max(1, g.bottom - g.top - 1);
  const distance = Math.max(0, Math.min(length, y - g.top));
  let color = 0;
  for (const shift of [0,5,10]) color |= Math.floor((((from >> shift) & 31) * (length - distance) + ((to >> shift) & 31) * distance) / Math.max(1,length)) << shift;
  return { offset, color };
}
