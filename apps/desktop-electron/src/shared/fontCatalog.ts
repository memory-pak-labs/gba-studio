import type { GBAProjectData } from "./projectFile.js";

export type FontCatalogSource = "builtin" | "project-asset";

export interface FontCatalogEntry {
  id: string;
  value: string;
  name: string;
  description: string;
  source: FontCatalogSource;
  ready: boolean;
  license: string;
  glyphWidth: number;
  glyphHeight: number;
  variableWidth: boolean;
  warnings: string[];
}
export interface FontCatalogPresentation {
  fonts: FontCatalogEntry[];
  activeFontValue: string;
  activeFont: FontCatalogEntry | null;
}

const BUILTIN_FONT_PROFILES: FontCatalogEntry[] = [
  {
    id: "builtin-gba-dialogue-v3",
    value: "gba-dialogue-font-v3.png",
    name: "GBA padrão",
    description: "Atlas nativo 8×8 de alto contraste, pronto para caixas de diálogo GBA.",
    source: "builtin",
    ready: true,
    license: "Incluída no projeto exemplo GBA Studio",
    glyphWidth: 8,
    glyphHeight: 8,
    variableWidth: false,
    warnings: []
  },
  {
    id: "builtin-gba-variable",
    value: "gba-variable-font.png",
    name: "GBA variável (legado)",
    description: "Alias da fonte padrão. Os diálogos usam avanço fixo de 8 px no editor e na ROM.",
    source: "builtin",
    ready: true,
    license: "Incluída no projeto exemplo GBA Studio",
    glyphWidth: 8,
    glyphHeight: 8,
    variableWidth: false,
    warnings: []
  },
  {
    id: "builtin-gba-default",
    value: "GBA padrao",
    name: "GBA padrão",
    description: "Fonte latina para português, inglês e espanhol, com avanço fixo de 8 px.",
    source: "builtin",
    ready: true,
    license: "Incluída no GBA Studio",
    glyphWidth: 8,
    glyphHeight: 8,
    variableWidth: false,
    warnings: []
  },
  {
    id: "builtin-gba-compact",
    value: "GBA compacta",
    name: "GBA compacta",
    description: "Perfil para mais texto por linha; importe um atlas compatível para ativá-la.",
    source: "builtin",
    ready: false,
    license: "Importar asset compatível",
    glyphWidth: 8,
    glyphHeight: 8,
    variableWidth: true,
    warnings: ["Importe um atlas FONT 128×112 para usar este perfil na ROM."]
  },
  {
    id: "builtin-gba-large",
    value: "GBA grande",
    name: "GBA grande",
    description: "Perfil de leitura ampliada; importe um atlas compatível para ativá-lo.",
    source: "builtin",
    ready: false,
    license: "Importar asset compatível",
    glyphWidth: 8,
    glyphHeight: 8,
    variableWidth: false,
    warnings: ["Importe um atlas FONT 128×112 para usar este perfil na ROM."]
  }
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function integer(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.round(value) : fallback;
}

function projectFontAssets(data: GBAProjectData): Record<string, unknown>[] {
  return (Array.isArray(data.assets) ? data.assets : [])
    .filter(isRecord)
    .filter((asset) => {
      const kind = text(asset.kind).toLowerCase();
      const metadata = isRecord(asset.metadata) ? asset.metadata : {};
      return kind === "font" || text(metadata.gbaRole).toLowerCase() === "dialogue-font";
    });
}

function projectFontEntry(asset: Record<string, unknown>): FontCatalogEntry | null {
  const value = text(asset.name);
  if (!value) return null;
  const metadata = isRecord(asset.metadata) ? asset.metadata : {};
  const width = integer(metadata.width, 128);
  const height = integer(metadata.height, 112);
  const colors = integer(metadata.colors, 2);
  const validGeometry = width === 128 && height === 112;
  const validColors = colors > 0 && colors <= 2;
  const warnings = [
    ...(!validGeometry ? ["O atlas precisa ter 128×112 pixels para o runtime GBA."] : []),
    ...(!validColors ? ["O atlas precisa usar no máximo duas cores por restrição da ROM."] : []),
    ...(!text(metadata.license) ? ["Confirme a licença de redistribuição deste asset antes de incluí-lo no template."] : [])
  ];
  return {
    id: `asset:${value}`,
    value,
    name: value.replace(/\.[a-z0-9]+$/i, ""),
    description: "Atlas de fonte importado no projeto.",
    source: "project-asset",
    ready: validGeometry && validColors,
    license: text(metadata.license, "Licença não informada"),
    glyphWidth: Math.max(1, Math.min(16, integer(metadata.glyphWidth, 8))),
    glyphHeight: Math.max(1, Math.min(16, integer(metadata.glyphHeight, 8))),
    variableWidth: metadata.variableWidth !== false,
    warnings
  };
}

export function deriveFontCatalog(data: GBAProjectData): FontCatalogPresentation {
  const settings = isRecord(data.settings) ? data.settings : {};
  const uiDialogs = isRecord(settings.uiDialogs) ? settings.uiDialogs : {};
  const activeFontValue = text(uiDialogs.font, "GBA padrao");
  const projectFonts = projectFontAssets(data)
    .map(projectFontEntry)
    .filter((font): font is FontCatalogEntry => Boolean(font));
  const builtinValues = new Set(BUILTIN_FONT_PROFILES.map((font) => font.value));
  const fonts = [...BUILTIN_FONT_PROFILES, ...projectFonts.filter((font) => !builtinValues.has(font.value))];
  return {
    fonts,
    activeFontValue,
    activeFont: fonts.find((font) => font.value === activeFontValue) ?? null
  };
}

export function setActiveFontInProject(data: GBAProjectData, fontValue: string): GBAProjectData {
  const trimmed = fontValue.trim();
  if (!trimmed || !deriveFontCatalog(data).fonts.some((font) => font.value === trimmed)) return data;
  const next = cloneProjectData(data);
  if (!isRecord(next.settings)) next.settings = {};
  const settings = next.settings as Record<string, unknown>;
  if (!isRecord(settings.uiDialogs)) settings.uiDialogs = {};
  (settings.uiDialogs as Record<string, unknown>).font = trimmed;
  return next;
}
