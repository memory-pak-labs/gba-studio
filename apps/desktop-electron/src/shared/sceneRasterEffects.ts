export const SCANLINE_LAYERS = ["BG1", "BG2", "BG3"] as const;
export const SCANLINE_SECOND_TARGETS = [...SCANLINE_LAYERS, "BACKDROP"] as const;
type ScanlineLayer = typeof SCANLINE_LAYERS[number];
type ScanlineSecondTarget = typeof SCANLINE_SECOND_TARGETS[number];

export function scanlineLayers(videoMode: number): readonly ScanlineLayer[] {
  if (videoMode === 1) return ["BG1", "BG2"];
  if (videoMode === 2) return ["BG2", "BG3"];
  return SCANLINE_LAYERS;
}

interface ScanlineBand { enabled: boolean; top: number; bottom: number }

export interface SceneScanlineControls {
  palette: ScanlineBand & { index: number; from: string; to: string };
  alpha: ScanlineBand & { first: ScanlineLayer; second: ScanlineSecondTarget; from: number; to: number };
  mask: ScanlineBand & { layer: ScanlineLayer; leftTop: number; rightTop: number; leftBottom: number; rightBottom: number };
}

export const defaultScanlineControls: SceneScanlineControls = {
  palette: { enabled: false, index: 17, from: "#ffac48", to: "#4868d8", top: 0, bottom: 160 },
  alpha: { enabled: false, first: "BG2", second: "BACKDROP", from: 16, to: 6, top: 0, bottom: 160 },
  mask: { enabled: false, layer: "BG2", leftTop: 96, rightTop: 144, leftBottom: 20, rightBottom: 220, top: 0, bottom: 160 }
};

export interface SceneRasterEffects extends Partial<SceneScanlineControls> {
  ripple: { enabled: boolean; layer: "BG1" | "BG2" | "BG3"; amplitude: number; wavelength: number; speed: number; top: number; bottom: number };
  gradient: { enabled: boolean; from: string; to: string; top: number; bottom: number };
}
const record = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const integer = (v: unknown, fallback: number, min: number, max: number) => typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.round(v))) : fallback;
const color = (v: unknown, fallback: string) => typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;

function band(source: Record<string, unknown>): ScanlineBand {
  return { enabled: source.enabled === true, top: integer(source.top, 0, 0, 158), bottom: integer(source.bottom, 160, 2, 160) };
}

function layer(value: unknown): ScanlineLayer {
  return value === "BG1" || value === "BG3" ? value : "BG2";
}

function normalizeScanlineControls(source: Record<string, unknown>): Partial<SceneScanlineControls> {
  const { palette, alpha, mask } = defaultScanlineControls;
  const p = record(source.palette), a = record(source.alpha), m = record(source.mask);
  return {
    ...(source.palette !== undefined ? { palette: {
      ...band(p), index: integer(p.index, palette.index, 1, 223),
      from: color(p.from, palette.from), to: color(p.to, palette.to)
    } } : {}),
    ...(source.alpha !== undefined ? { alpha: {
      ...band(a), first: layer(a.first),
      second: a.second === "BG1" || a.second === "BG2" || a.second === "BG3" ? a.second : "BACKDROP",
      from: integer(a.from, alpha.from, 0, 16), to: integer(a.to, alpha.to, 0, 16)
    } } : {}),
    ...(source.mask !== undefined ? { mask: {
      ...band(m), layer: layer(m.layer),
      leftTop: integer(m.leftTop, mask.leftTop, 0, 239), rightTop: integer(m.rightTop, mask.rightTop, 1, 240),
      leftBottom: integer(m.leftBottom, mask.leftBottom, 0, 239), rightBottom: integer(m.rightBottom, mask.rightBottom, 1, 240)
    } } : {})
  };
}

export function hasSceneScanlineControls(effects?: SceneRasterEffects): boolean {
  return effects?.palette?.enabled === true || effects?.alpha?.enabled === true || effects?.mask?.enabled === true;
}

export function normalizeSceneRasterEffects(value: unknown): SceneRasterEffects {
  const source = record(value), r = record(source.ripple), g = record(source.gradient);
  return {
    ...normalizeScanlineControls(source),
    ripple: { enabled: r.enabled === true, layer: r.layer === "BG1" || r.layer === "BG3" ? r.layer : "BG2", amplitude: integer(r.amplitude, 4, 0, 16), wavelength: integer(r.wavelength, 32, 8, 160), speed: integer(r.speed, 2, 0, 8), top: integer(r.top, 80, 0, 159), bottom: integer(r.bottom, 160, 1, 160) },
    gradient: { enabled: g.enabled === true, from: color(g.from, "#3858a0"), to: color(g.to, "#b0d8f8"), top: integer(g.top, 0, 0, 158), bottom: integer(g.bottom, 80, 2, 160) }
  };
}
export const hasSceneRasterEffects = (value: unknown) => { const e = normalizeSceneRasterEffects(value); return e.ripple.enabled || e.gradient.enabled || hasSceneScanlineControls(e); };
export function sceneRasterEffectIssues(value: unknown, mode: string, authoredHblank: boolean, videoMode = mode === "affine" ? 1 : 0): string[] {
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
  const controls = ["palette", "alpha", "mask"] as const;
  const layers = scanlineLayers(videoMode);
  for (const key of controls) {
    const control = e[key];
    if (!control?.enabled) continue;
    const raw = record(source[key]);
    if (videoMode > 2 || !["tilemap", "affine"].includes(mode)) issues.push("Paleta, transparência e máscara por linha exigem modo Tilemap ou Affine.");
    if (control.bottom < control.top + 2) issues.push("O efeito por linha precisa abranger pelo menos duas linhas.");
    for (const field of Object.keys(control)) {
      const input = raw[field];
      const actual = (control as unknown as Record<string, unknown>)[field];
      const expected = key === "palette" && (field === "from" || field === "to") && typeof input === "string" ? input.toLowerCase() : input;
      if (input !== undefined && expected !== actual) {
        issues.push(`Valor inválido em raster.${key}.${field}.`);
      }
    }
  }
  if (e.alpha?.enabled) {
    if (e.alpha.first === e.alpha.second) issues.push("Escolha camadas diferentes para misturar.");
    if (!layers.includes(e.alpha.first) || (e.alpha.second !== "BACKDROP" && !layers.includes(e.alpha.second))) issues.push("Escolha camadas disponíveis no modo de vídeo da cena.");
  }
  if (e.mask?.enabled) {
    if (e.mask.leftTop >= e.mask.rightTop || e.mask.leftBottom >= e.mask.rightBottom) issues.push("A borda direita da máscara deve ficar à direita da borda esquerda.");
    if (!layers.includes(e.mask.layer)) issues.push("Escolha uma camada de máscara disponível no modo de vídeo da cena.");
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

function scanlineValue(from: number, to: number, { top, bottom }: ScanlineBand, y: number): number {
  const span = Math.max(1, bottom - top - 1);
  const distance = Math.max(0, Math.min(span, y - top));
  return Math.floor((from * (span - distance) + to * distance) / span);
}

export function blendScanlineColors(first: number, second: number, alpha: number): number {
  let result = 0;
  for (let shift = 0; shift <= 10; shift += 5) {
    result |= ((((first >> shift) & 31) * alpha + ((second >> shift) & 31) * (16 - alpha)) >> 4) << shift;
  }
  return result;
}

export function sceneScanlineControls(effects: SceneRasterEffects, y: number) {
  const { palette, alpha, mask } = effects;
  let paletteColor: number | undefined;
  if (palette?.enabled) {
    const from = rgb555(palette.from), to = rgb555(palette.to);
    paletteColor = 0;
    for (let shift = 0; shift <= 10; shift += 5) {
      paletteColor |= scanlineValue((from >> shift) & 31, (to >> shift) & 31, palette, y) << shift;
    }
  }
  return {
    paletteColor,
    alpha: alpha?.enabled ? scanlineValue(alpha.from, alpha.to, alpha, y) : undefined,
    left: mask?.enabled && y >= mask.top && y < mask.bottom ? scanlineValue(mask.leftTop, mask.leftBottom, mask, y) : 0,
    right: mask?.enabled && y >= mask.top && y < mask.bottom ? scanlineValue(mask.rightTop, mask.rightBottom, mask, y) : 240
  };
}
