/** Compiled placements, never image dimensions or editor estimates. Byte offsets
 * are relative to the BG/OBJ region; screenblocks and OAM use entry offsets. */
export interface CompiledVideoRange { start: number; count: number }
export type SceneVideoResource = "bgVram" | "objVram" | "screenblocks" | "bgPalette" | "objPalette" | "oam" | "romAssets";
export type SceneVideoBudgetStatus = "ok" | "attention" | "not_recommended" | "blocked" | "unknown";
export interface CompiledSceneVideoPlan {
  name: string;
  /** null means the compiler has not supplied an authoritative runtime mode. */
  displayMode: 0 | 1 | 2 | 3 | 4 | 5 | null;
  /** An absent resource means unknown; an empty array explicitly means unused. */
  resources: Partial<Record<SceneVideoResource, readonly CompiledVideoRange[]>>;
  /** Compiled payload attributed to this scene, not the linked project ROM. */
  romAssetBytes?: number | null;
}
export interface SceneVideoBudgetDiagnostic {
  scene: string;
  resource?: SceneVideoResource;
  feature?: string;
  code: "capacity_exceeded" | "invalid_plan" | "incomplete_plan" | "reservation_overlap";
  status: "blocked" | "unknown";
  used?: number;
  capacity?: number;
  excess?: number;
}
export interface SceneVideoBudgetMetric {
  resource: SceneVideoResource;
  unit: "bytes" | "entries";
  used: number | null;
  addressEnd: number | null;
  capacity: number | null;
  /** Hardware ceiling across all modes; not a substitute for the effective mode's limit. */
  maximumCapacity: number;
  status: SceneVideoBudgetStatus;
  basis?: "compiled_allocation" | "native_reservation" | "compiled_and_native" | "linked_elf";
}
export interface NativeInterfaceReservation { feature: string; resources: CompiledSceneVideoPlan["resources"] }
export interface SceneVideoBudget {
  scene: string;
  displayMode: CompiledSceneVideoPlan["displayMode"];
  complete: boolean;
  blocked: boolean;
  metrics: SceneVideoBudgetMetric[];
  romAssetBytes: number | null;
  romAssets?: { source: "linked_asset_symbols"; bytes: number; exclusiveBytes: number; sharedBytes: number; assetCount: number };
  diagnostics: SceneVideoBudgetDiagnostic[];
  nativeLayout?: { runtime: string; scope: "reservation_envelope"; notes: string[]; dynamicReservations?: NativeInterfaceReservation[] };
}

const resources: SceneVideoResource[] = ["bgVram", "objVram", "screenblocks", "bgPalette", "objPalette", "oam", "romAssets"];
const isCount = (value: number) => Number.isSafeInteger(value) && value >= 0;

function rangeUsage(ranges: readonly CompiledVideoRange[]): { used: number; end: number } | null {
  if (ranges.some(r => !isCount(r.start) || !isCount(r.count) || !isCount(r.start + r.count))) return null;
  const ordered = ranges.filter(r => r.count > 0).map(r => ({ start: r.start, end: r.start + r.count }))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  let used = 0, end = 0;
  for (const range of ordered) {
    used += Math.max(0, range.end - Math.max(end, range.start));
    end = Math.max(end, range.end);
  }
  return { used, end };
}

/** A pure hardware check. It does not infer residence from a catalog, count
 * shared ranges twice, or approve unknown layouts. Maps share BG VRAM with
 * tile data: callers must include both in bgVram and provide their screenblocks.
 * Limits: Tonc memory map / GBATEK LCD VRAM OBJ addressing. */
export function analyzeSceneVideoBudget(plan: CompiledSceneVideoPlan): SceneVideoBudget {
  const modeValid = plan.displayMode === null || (Number.isInteger(plan.displayMode) && plan.displayMode >= 0 && plan.displayMode <= 5);
  const bitmap = plan.displayMode !== null && plan.displayMode >= 3;
  const capacities: Record<SceneVideoResource, number | null> = {
    bgVram: plan.displayMode === null ? null : bitmap ? 81920 : 65536,
    objVram: plan.displayMode === null ? null : bitmap ? 16384 : 32768,
    screenblocks: plan.displayMode === null ? null : bitmap ? 0 : 32,
    bgPalette: 512, objPalette: 512, oam: 128, romAssets: 32 * 1024 * 1024
  };
  const maximumCapacities: Record<SceneVideoResource, number> = {
    bgVram: 81920, objVram: 32768, screenblocks: 32,
    bgPalette: 512, objPalette: 512, oam: 128, romAssets: 32 * 1024 * 1024
  };
  const diagnostics: SceneVideoBudgetDiagnostic[] = [];
  if (!modeValid || (plan.romAssetBytes != null && !isCount(plan.romAssetBytes))) {
    diagnostics.push({ scene: plan.name, code: "invalid_plan", status: "blocked" });
  }
  const metrics = resources.map((resource): SceneVideoBudgetMetric => {
    const ranges = resource === "romAssets"
      ? plan.romAssetBytes == null ? undefined : [{ start: 0, count: plan.romAssetBytes }]
      : plan.resources[resource];
    const capacity = modeValid ? capacities[resource] : null;
    const maximumCapacity = maximumCapacities[resource];
    const checkedCapacity = capacity ?? maximumCapacity;
    const usage = ranges === undefined ? undefined : rangeUsage(ranges);
    if (usage === null) diagnostics.push({ scene: plan.name, resource, code: "invalid_plan", status: "blocked" });
    const occupied = usage ? Math.max(usage.used, usage.end) : null;
    const status: SceneVideoBudgetStatus = usage === null ? "blocked"
      : occupied === null ? "unknown"
      : occupied > checkedCapacity ? "blocked"
      : capacity === null ? "unknown"
      : usage!.used > 0 && usage!.used >= capacity * 0.95 ? "not_recommended"
      : usage!.used > 0 && usage!.used >= capacity * 0.8 ? "attention" : "ok";
    if (status === "blocked" && occupied !== null) diagnostics.push({
      scene: plan.name, resource, code: "capacity_exceeded", status, used: occupied, capacity: checkedCapacity, excess: occupied - checkedCapacity
    });
    return { resource, unit: resource === "oam" || resource === "screenblocks" ? "entries" : "bytes",
      used: usage?.used ?? null, addressEnd: usage?.end ?? null, capacity, maximumCapacity, status };
  });
  const complete = modeValid && plan.displayMode !== null &&
    metrics.every(metric => metric.used !== null && metric.status !== "unknown");
  if (!complete && !diagnostics.some(d => d.code === "invalid_plan")) {
    diagnostics.push({ scene: plan.name, code: "incomplete_plan", status: "unknown" });
  }
  return { scene: plan.name, displayMode: plan.displayMode, complete,
    blocked: diagnostics.some(d => d.status === "blocked"), metrics,
    romAssetBytes: plan.romAssetBytes != null && isCount(plan.romAssetBytes) ? plan.romAssetBytes : null, diagnostics };
}
