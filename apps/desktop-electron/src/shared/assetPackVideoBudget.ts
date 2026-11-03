import { analyzeSceneVideoBudget, type CompiledSceneVideoPlan, type CompiledVideoRange, type SceneVideoBudget, type SceneVideoResource } from "./sceneVideoBudget.js";

export interface AssetPackVideoBudgetScene { name: string; bankGroup: string }
export interface LinkedRomVideoBudget {
  bytes: number;
  sha256: string;
  capacity: number;
  engineVersion: string | null;
  status: "ok" | "attention" | "not_recommended" | "blocked";
}
export interface AssetPackVideoBudgetReport {
  schema: 1;
  source: "compiled_allocations";
  complete: boolean;
  blocked: boolean;
  scenes: SceneVideoBudget[];
  /** Available only after linking, never inferred from PNG size or compression recommendations. */
  linkedRomBytes: number | null;
  linkedRom?: LinkedRomVideoBudget;
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** assetc OBJ tile slots are 32-byte units, including 8bpp (already doubled by
 * assetc). Palette slots are 16-bit colors, OAM slots are entries. */
const mappedResources: [string, SceneVideoResource, number][] = [
  ["obj_tiles", "objVram", 32], ["bg_palette_colors", "bgPalette", 2],
  ["obj_palette_colors", "objPalette", 2], ["oam_sprites", "oam", 1]
];

export function buildAssetPackVideoBudget(scenes: readonly AssetPackVideoBudgetScene[], raw: unknown): AssetPackVideoBudgetReport {
  if (!record(raw) || raw.schema !== 11 || raw.ok !== true || !Array.isArray(raw.allocations)) {
    throw new Error("O compilador retornou um relatório de alocação de vídeo inválido.");
  }
  const assets = raw.allocations.map((entry) => {
    if (!record(entry) || !record(entry.allocations)) throw new Error("Alocação de vídeo inválida no relatório do compilador.");
    const groups = entry.bank_groups ?? [entry.bank_group];
    if (!Array.isArray(groups) || groups.length === 0 || groups.some(group => typeof group !== "string" || !group)) {
      throw new Error("Grupos de alocação inválidos no relatório do compilador.");
    }
    for (const [resource] of mappedResources) {
      const range = entry.allocations[resource];
      if (record(entry.resources) && entry.resources[resource] !== undefined) {
        const requested = entry.resources[resource];
        if (typeof requested !== "number" || !Number.isSafeInteger(requested) || requested < 0 ||
          (requested > 0 && range === undefined && entry.omitted !== true)) {
          throw new Error(`Recurso ${resource} sem alocação válida no relatório do compilador.`);
        }
      }
      if (range === undefined) continue;
      if (!record(range) || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.count) ||
        (range.start as number) < 0 || (range.count as number) < 0 ||
        !Number.isSafeInteger((range.start as number) + (range.count as number))) {
        throw new Error(`Alocação ${resource} inválida no relatório do compilador.`);
      }
    }
    return { groups: groups as string[], omitted: entry.omitted === true, allocations: entry.allocations };
  });
  const results = scenes.map(scene => {
    const matched = assets.filter(asset => !asset.omitted && (asset.groups.includes(scene.bankGroup) || asset.groups.includes("global")));
    const resources: CompiledSceneVideoPlan["resources"] = {};
    if (matched.length > 0) for (const [source, target, multiplier] of mappedResources) {
      resources[target] = matched.flatMap(asset => {
        const range = asset.allocations[source] as CompiledVideoRange | undefined;
        return range ? [{ start: range.start * multiplier, count: range.count * multiplier }] : [];
      });
    }
    // schema 11 contains catalog maps, not their runtime screenblock placements.
    // It also omits the effective mode of several native runtimes. The editor's
    // requested composition mode is not evidence of the runtime's actual mode.
    return analyzeSceneVideoBudget({ name: scene.name, displayMode: null, resources });
  });
  return { schema: 1, source: "compiled_allocations", complete: false,
    blocked: results.some(scene => scene.blocked), scenes: results, linkedRomBytes: null };
}
