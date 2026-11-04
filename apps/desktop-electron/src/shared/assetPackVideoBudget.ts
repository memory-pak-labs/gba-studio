import { analyzeSceneVideoBudget, type CompiledSceneVideoPlan, type CompiledVideoRange, type SceneVideoBudget, type SceneVideoResource, type NativeInterfaceReservation, type CompiledAssetColorPolicy } from "./sceneVideoBudget.js";

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
  romAssetsSummary?: { attributedBytes: number; otherBytes: number };
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const graphicsKinds = new Set(["obj", "bg", "affine_bg", "indexed_bg", "paged_bg", "bitmap3", "bitmap4", "bitmap5"]);
function parseColorPolicy(entry: Record<string, unknown>): CompiledAssetColorPolicy | undefined {
  const policy = entry.color_policy;
  if (policy === undefined) return undefined;
  const name = entry.name ?? entry.id;
  if (typeof name !== "string" || !name || typeof entry.kind !== "string" || !graphicsKinds.has(entry.kind) ||
    !record(policy) || policy.default_bpp !== 4 || (typeof policy.format !== "string" || !["4bpp", "8bpp", "rgb555"].includes(policy.format)) ||
    (typeof policy.reason !== "string" || !["default_4bpp", "obj_color_count", "explicit_8bpp", "affine_renderer", "indexed_renderer", "paged_renderer", "bitmap_mode"].includes(policy.reason)) ||
    !Number.isSafeInteger(policy.source_visible_colors) || (policy.source_visible_colors as number) < 0 || (policy.source_visible_colors as number) > 32768 ||
    typeof policy.review_4bpp !== "boolean" || (policy.review_4bpp && (policy.format !== "8bpp" || policy.reason !== "explicit_8bpp" || (policy.source_visible_colors as number) > 15))) {
    throw new Error("Política de cores inválida no relatório do compilador.");
  }
  return { asset: name, kind: entry.kind, format: policy.format as CompiledAssetColorPolicy["format"],
    reason: policy.reason as CompiledAssetColorPolicy["reason"], sourceVisibleColors: policy.source_visible_colors as number,
    review4bpp: policy.review_4bpp };
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
  dynamic_reservations?: NativeInterfaceReservation[];
  nonvisible_obj_ranges?: CompiledVideoRange[];
  video_states?: { id: string; label: string; plan: NativeVideoLayout }[];
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
    if (plan.dynamic_reservations !== undefined && (!Array.isArray(plan.dynamic_reservations) || plan.dynamic_reservations.some(entry =>
      !record(entry) || typeof entry.feature !== "string" || !entry.feature || !record(entry.resources) ||
      Object.entries(entry.resources).some(([resource, ranges]) => !["objVram", "oam", "objPalette", "bgPalette"].includes(resource) ||
        !Array.isArray(ranges) || ranges.some(range => !record(range) || typeof range.start !== "number" || typeof range.count !== "number"))))) {
      throw new Error("Reservas dinâmicas de vídeo inválidas.");
    }
    if (plan.nonvisible_obj_ranges !== undefined && (!Array.isArray(plan.nonvisible_obj_ranges) || plan.nonvisible_obj_ranges.some(range =>
      !record(range) || !Number.isSafeInteger(range.start) || !Number.isSafeInteger(range.count) || (range.start as number) < 0 || (range.count as number) < 0))) {
      throw new Error("Recorte compilado de OBJ inválido.");
    }
    if (plan.video_states !== undefined) {
      if (!Array.isArray(plan.video_states) || !plan.video_states.length || plan.video_states.length > 128) throw new Error("Estados de vídeo inválidos.");
      const ids = new Set<string>();
      for (const state of plan.video_states) {
        if (!record(state) || typeof state.id !== "string" || !state.id || ids.has(state.id) || typeof state.label !== "string" ||
          !record(state.plan) || state.plan.video_states !== undefined || state.plan.scene !== plan.scene ||
          state.plan.bank_group !== plan.bank_group || state.plan.runtime !== plan.runtime) throw new Error("Estado de vídeo inválido, aninhado ou de outra cena.");
        parseNativeLayouts({ schema: 1, plans: [state.plan] });
        ids.add(state.id);
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
    return { groups: groups as string[], omitted: entry.omitted === true, allocations: entry.allocations,
      graphics: typeof entry.kind === "string" && graphicsKinds.has(entry.kind), colorPolicy: parseColorPolicy(entry) };
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
    const allocatedObj = resources.objVram ?? [];
    const overlaps: string[] = [];
    const dynamic = layout?.dynamic_reservations ?? [];
    for (const reservation of dynamic) for (const [name, ranges] of Object.entries(reservation.resources)) {
      const resource = name as SceneVideoResource;
      const offset = resource === "objVram" && layout?.display_mode != null && layout.display_mode >= 3 ? 16384 : 0;
      const relative = ranges.map(range => ({ start: range.start - offset, count: range.count }));
      if (resource === "objVram" && relative.some(range => allocatedObj.some(asset => {
        let start = Math.max(range.start, asset.start);
        const end = Math.min(range.start + range.count, asset.start + asset.count);
        if (start >= end) return false;
        for (const clipped of [...(layout?.nonvisible_obj_ranges ?? [])].sort((a, b) => a.start - b.start)) {
          if (clipped.start - offset <= start && clipped.start - offset + clipped.count > start) start = clipped.start - offset + clipped.count;
        }
        return start < end;
      }))) overlaps.push(reservation.feature);
      resources[resource] = [...(resources[resource] ?? []), ...relative];
    }
    const result = analyzeSceneVideoBudget({ name: scene.name, displayMode: layout?.display_mode ?? null, resources });
    if (overlaps.length) {
      result.blocked = true;
      result.complete = false;
      for (const feature of overlaps) result.diagnostics.push({ scene: scene.name, resource: "objVram", feature, code: "reservation_overlap", status: "blocked" });
      result.metrics = result.metrics.map(metric => metric.resource === "objVram" ? { ...metric, status: "blocked" } : metric);
    }
    const videoStates = layout?.video_states?.map(state => ({ id: state.id, label: state.label,
      budget: buildAssetPackVideoBudget([scene], { ...raw, scene_video_layouts: { schema: 1, plans: [state.plan] } }).scenes[0]! }));
    for (const state of videoStates ?? []) if (state.budget.blocked) {
      result.blocked = true;
      result.complete = false;
      const blocked = state.budget.diagnostics.filter(d => d.status === "blocked");
      result.diagnostics.push(...blocked.map(d => ({ ...d, feature: state.id + (d.feature ? ":" + d.feature : "") })));
      result.metrics = result.metrics.map(metric => blocked.some(d => d.resource === metric.resource) ? { ...metric, status: "blocked" } : metric);
    }
    return {
      ...result,
      ...(videoStates ? { videoStates } : {}),
      colorPolicy: { defaultBpp: 4 as const, complete: matched.some(asset => asset.graphics) && matched.every(asset => !asset.graphics || asset.colorPolicy !== undefined),
        assets: matched.flatMap(asset => asset.colorPolicy ? [asset.colorPolicy] : []) },
      metrics: result.metrics.map(metric => ({ ...metric,
        ...(metric.used === null ? {} : { basis: dynamic.some(r => r.resources[metric.resource]) ? "compiled_and_native" as const : layout?.resources[metric.resource] ? "native_reservation" as const : "compiled_allocation" as const }) })),
      ...(layout ? { nativeLayout: { runtime: layout.runtime, scope: "reservation_envelope" as const, notes: layout.notes, ...(layout.dynamic_reservations ? { dynamicReservations: layout.dynamic_reservations } : {}) } } : {})
    };
  });
  return { schema: 1, source: "compiled_allocations", complete: false,
    blocked: results.some(scene => scene.blocked), scenes: results, linkedRomBytes: null };
}
