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

interface NativeVideoLayout {
  scene: string;
  bank_group: string;
  bank_groups: string[];
  runtime: string;
  display_mode: CompiledSceneVideoPlan["displayMode"];
  resources: CompiledSceneVideoPlan["resources"];
  notes: string[];
}

function parseNativeLayouts(value: unknown): NativeVideoLayout[] {
  if (value === undefined) return [];
  if (!record(value) || value.schema !== 1 || !Array.isArray(value.plans)) throw new Error("Layout de vídeo compilado inválido.");
  const seen = new Set<string>();
  return value.plans.map(plan => {
    if (!record(plan) || typeof plan.scene !== "string" || seen.has(plan.scene) ||
      typeof plan.bank_group !== "string" || !Array.isArray(plan.bank_groups) || !plan.bank_groups.length ||
      plan.bank_groups.some(g => typeof g !== "string" || !g) || !plan.bank_groups.includes(plan.bank_group) ||
      typeof plan.runtime !== "string" || plan.scope !== "reservation_envelope" ||
      !(plan.display_mode === null || (typeof plan.display_mode === "number" && Number.isInteger(plan.display_mode) && plan.display_mode >= 0 && plan.display_mode <= 5)) ||
      !record(plan.resources) || !Array.isArray(plan.notes) || plan.notes.some(note => typeof note !== "string")) {
      throw new Error("Layout de vídeo compilado inválido ou duplicado.");
    }
    for (const [resource, ranges] of Object.entries(plan.resources)) {
      if (!["bgVram", "screenblocks"].includes(resource) || !Array.isArray(ranges) || ranges.some(range =>
        !record(range) || typeof range.start !== "number" || typeof range.count !== "number")) {
        throw new Error("Intervalos inválidos no layout de vídeo compilado.");
      }
    }
    seen.add(plan.scene);
    return plan as unknown as NativeVideoLayout;
  });
}

export function buildAssetPackVideoBudget(scenes: readonly AssetPackVideoBudgetScene[], raw: unknown): AssetPackVideoBudgetReport {
  if (!record(raw) || raw.schema !== 11 || raw.ok !== true || !Array.isArray(raw.allocations)) {
    throw new Error("O compilador retornou um relatório de alocação de vídeo inválido.");
  }
  const layouts = parseNativeLayouts(raw.scene_video_layouts);
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
    const layout = layouts.find(layout => layout.scene === scene.name);
    if (layout && layout.bank_group !== scene.bankGroup) throw new Error("Grupo divergente no layout de vídeo compilado.");
    const groups = layout?.bank_groups ?? [scene.bankGroup];
    const matched = assets.filter(asset => !asset.omitted && (asset.groups.some(group => groups.includes(group)) || asset.groups.includes("global")));
    const resources: CompiledSceneVideoPlan["resources"] = {};
    if (matched.length > 0) for (const [source, target, multiplier] of mappedResources) {
      resources[target] = matched.flatMap(asset => {
        const range = asset.allocations[source] as CompiledVideoRange | undefined;
        const bitmapObjOffset = source === "obj_tiles" && layout?.display_mode != null && layout.display_mode >= 3 ? 16384 : 0;
        return range ? [{ start: range.start * multiplier - bitmapObjOffset, count: range.count * multiplier }] : [];
      });
    }
    // A native plan supplies physical reservations, not source map dimensions.
    // Without that evidence the resource remains unknown, never zero.
    Object.assign(resources, layout?.resources);
    const result = analyzeSceneVideoBudget({ name: scene.name, displayMode: layout?.display_mode ?? null, resources });
    return {
      ...result,
      metrics: result.metrics.map(metric => ({ ...metric,
        ...(metric.used === null ? {} : { basis: layout?.resources[metric.resource] ? "native_reservation" as const : "compiled_allocation" as const }) })),
      ...(layout ? { nativeLayout: { runtime: layout.runtime, scope: "reservation_envelope" as const, notes: layout.notes } } : {})
    };
  });
  return { schema: 1, source: "compiled_allocations", complete: false,
    blocked: results.some(scene => scene.blocked), scenes: results, linkedRomBytes: null };
}
