import { describe, expect, it } from "vitest";
import { analyzeSceneVideoBudget, type CompiledSceneVideoPlan } from "./sceneVideoBudget.js";

function scene(overrides: Partial<CompiledSceneVideoPlan> = {}): CompiledSceneVideoPlan {
  return {
    name: "track", displayMode: 0,
    resources: {
      bgVram: [], objVram: [], screenblocks: [], bgPalette: [], objPalette: [], oam: []
    },
    ...overrides
  };
}

describe("compiled scene video budget", () => {
  it("accepts exact hardware limits and reports recommendation separately from blocking", () => {
    const result = analyzeSceneVideoBudget(scene({ resources: {
      bgVram: [{ start: 0, count: 65536 }], objVram: [{ start: 0, count: 32768 }],
      screenblocks: [{ start: 0, count: 32 }], bgPalette: [{ start: 0, count: 512 }],
      objPalette: [{ start: 0, count: 512 }], oam: [{ start: 0, count: 128 }]
    }, romAssetBytes: 1000 }));
    expect(result.blocked).toBe(false);
    expect(result.complete).toBe(true);
    expect(result.metrics.filter(metric => metric.resource !== "romAssets").every(metric => metric.status === "not_recommended")).toBe(true);
    expect(result.romAssetBytes).toBe(1000);
  });

  it.each([
    ["bgVram", 65536], ["objVram", 32768], ["screenblocks", 32],
    ["bgPalette", 512], ["objPalette", 512], ["oam", 128]
  ] as const)("identifies only %s when one unit exceeds its capacity", (resource, capacity) => {
    const input = scene();
    input.resources[resource] = [{ start: 0, count: capacity + 1 }];
    const result = analyzeSceneVideoBudget(input);
    expect(result.blocked).toBe(true);
    expect(result.diagnostics.filter(d => d.code === "capacity_exceeded")).toEqual([
      expect.objectContaining({ scene: "track", resource, used: capacity + 1, capacity, excess: 1, status: "blocked" })
    ]);
  });

  it("counts shared allocations once but still checks address extent and holes", () => {
    const result = analyzeSceneVideoBudget(scene({ resources: {
      objVram: [{ start: 0, count: 32 }, { start: 0, count: 32 }, { start: 32768, count: 32 }]
    } }));
    expect(result.metrics.find(m => m.resource === "objVram")).toMatchObject({ used: 64, addressEnd: 32800, status: "blocked" });
    expect(result.diagnostics.find(d => d.resource === "objVram" && d.code === "capacity_exceeded")).toMatchObject({ excess: 32 });
  });

  it.each([3, 4, 5] as const)("limits OBJ to 16 KiB in bitmap mode %s", displayMode => {
    const result = analyzeSceneVideoBudget(scene({ displayMode, resources: { objVram: [{ start: 0, count: 16385 }] } }));
    expect(result.metrics.find(m => m.resource === "objVram")).toMatchObject({ capacity: 16384, status: "blocked" });
    expect(result.metrics.find(m => m.resource === "bgVram")?.capacity).toBe(81920);
  });

  it("checks tiles and maps in the same BG region instead of granting each its own VRAM", () => {
    const result = analyzeSceneVideoBudget(scene({ resources: { bgVram: [
      { start: 0, count: 49152 }, { start: 64512, count: 2048 }
    ] } }));
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ resource: "bgVram", capacity: 65536, excess: 1024 }));
  });

  it("checks the ROM payload ceiling without confusing it with final linked ROM size", () => {
    expect(analyzeSceneVideoBudget(scene({ romAssetBytes: 33554432 })).blocked).toBe(false);
    expect(analyzeSceneVideoBudget(scene({ romAssetBytes: 33554433 })).diagnostics).toContainEqual(
      expect.objectContaining({ resource: "romAssets", capacity: 33554432, excess: 1 })
    );
  });

  it("does not turn missing layout, mode or ROM data into zero usage or a verified scene", () => {
    const result = analyzeSceneVideoBudget({ name: "pending", displayMode: null, resources: {} });
    expect(result.complete).toBe(false);
    expect(result.metrics.every(m => m.used === null && m.status === "unknown")).toBe(true);
    expect(result.romAssetBytes).toBeNull();
    expect(result.diagnostics.some(d => d.code === "incomplete_plan")).toBe(true);
  });

  it("blocks a proven OBJ overflow even when the effective mode is still unknown", () => {
    const result = analyzeSceneVideoBudget(scene({ displayMode: null, resources: { objVram: [{ start: 0, count: 32769 }] } }));
    expect(result.blocked).toBe(true);
    expect(result.complete).toBe(false);
    expect(result.metrics.find(m => m.resource === "objVram")).toMatchObject({ capacity: null, maximumCapacity: 32768, status: "blocked" });
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ resource: "objVram", excess: 1, capacity: 32768 }));
  });

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])("rejects an invalid compiled count %s", count => {
    const result = analyzeSceneVideoBudget(scene({ resources: { oam: [{ start: 0, count }] } }));
    expect(result.blocked).toBe(true);
    expect(result.diagnostics.some(d => d.code === "invalid_plan" && d.resource === "oam")).toBe(true);
  });

  it("uses stable 80 and 95 percent thresholds without mutating compiler input", () => {
    const input = scene({ resources: { oam: [{ start: 0, count: 103 }] } });
    const before = JSON.stringify(input);
    expect(analyzeSceneVideoBudget(input).metrics.find(m => m.resource === "oam")?.status).toBe("attention");
    input.resources.oam = [{ start: 0, count: 122 }];
    const after = JSON.stringify(input);
    expect(analyzeSceneVideoBudget(input).metrics.find(m => m.resource === "oam")?.status).toBe("not_recommended");
    expect(JSON.stringify(input)).toBe(after);
    expect(before).not.toBe(after);
  });
});
