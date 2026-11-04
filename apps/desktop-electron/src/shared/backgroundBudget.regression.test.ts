import { describe, expect, it } from "vitest";
import { deriveProjectBudgetPresentation, type AssetPackBudgetReport } from "./projectBudget.js";
import { deriveProjectHealthReport } from "./projectHealth.js";
import type { GBAProjectData } from "./projectFile.js";

function project(withLayer = true): GBAProjectData {
  return {
    rooms: [{ name: "storm", width: 96, height: 20, sceneType: "shmup",
      backgroundAssetName: "background.png", gbStudioUseBackgroundLayout: true,
      tilemap: Array(1920).fill(0),
      tileLayers: withLayer ? [{ name: "Clouds", tilemap: Array.from({ length: 1920 }, (_, i) => i), tileSourceAssetNames: Array(1920).fill("clouds.png") }] : [] }],
    assets: [{ name: "background.png", kind: "Tileset", metadata: { width: 768, height: 160 } },
      { name: "clouds.png", kind: "Tileset", metadata: { width: 768, height: 160 } }]
  };
}

describe("image background budget", () => {
  it.each([true, false])("waits for physical tile deduplication instead of counting image positions (layer: %s)", withLayer => {
    const p = project(withLayer);
    const budget = deriveProjectBudgetPresentation(p, "storm", null);
    expect(budget.sceneMetrics.find(metric => metric.id === "bg_tiles")).toMatchObject({ used: 0, pending: true, tone: "ok" });
    expect(budget.dma.pending).toBe(true);
    const diagnostics = deriveProjectHealthReport(p).diagnostics;
    expect(diagnostics.some(d => d.code === "asset.budget.blocked")).toBe(false);
    expect(diagnostics).toContainEqual(expect.objectContaining({ code: "asset.budget.pending", severity: "info", message: expect.stringContaining("background") }));
  });

  it.each([745, 900])("uses the compiler's measured %s tiles, retaining confirmed pressure and overflow", used => {
    const report: AssetPackBudgetReport = { schema: 11,
      resource_bank_groups: [{ name: "scene_storm", assets: ["background", "clouds"], banks: [{ resource: "bg_tiles", count: used }] }],
      budget_summary: { bg_tiles: { used, capacity: 896, remaining: Math.max(0, 896 - used), percent_used: used / 896 * 100, severity: used > 896 ? "error" : "warning" } } };
    const budget = deriveProjectBudgetPresentation(project(), "storm", report);
    expect(budget.sceneMetrics.find(metric => metric.id === "bg_tiles")).toMatchObject({ used, tone: used > 896 ? "error" : "warning" });
    expect(budget.sceneMetrics.find(metric => metric.id === "bg_tiles")?.pending).not.toBe(true);
  });

  it("retains known tile-index estimates for authored tile layouts", () => {
    const p: GBAProjectData = { rooms: [{ name: "tiles", tilemap: [1, 1, 2, 3] }] };
    expect(deriveProjectBudgetPresentation(p, "tiles", null).sceneMetrics.find(metric => metric.id === "bg_tiles"))
      .toMatchObject({ used: 3, tone: "ok" });
  });
});
