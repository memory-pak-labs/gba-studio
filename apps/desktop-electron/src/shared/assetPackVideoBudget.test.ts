import { describe, expect, it } from "vitest";
import { buildAssetPackVideoBudget } from "./assetPackVideoBudget.js";

const scenes = [{ name: "alpha", bankGroup: "scene_alpha" }, { name: "beta", bankGroup: "scene_beta" }];
function asset(id: string, bank_groups: string[], allocations: Record<string, { start: number; count: number }>, extra = {}) {
  return { id, bank_group: bank_groups[0], bank_groups, kind: "obj", allocations, ...extra };
}
const report = (allocations: unknown[]) => ({ schema: 11, ok: true, allocations });

describe("asset pack video budget adapter", () => {
  it("keeps scenes separate, includes global and shared groups and excludes omitted assets", () => {
    const result = buildAssetPackVideoBudget(scenes, report([
      asset("global", ["global"], { oam_sprites: { start: 0, count: 1 } }),
      asset("shared", ["scene_alpha", "scene_beta"], { obj_palette_colors: { start: 0, count: 16 } }),
      asset("alpha", ["scene_alpha"], { obj_tiles: { start: 0, count: 32 }, oam_sprites: { start: 1, count: 3 } }),
      asset("omitted", ["scene_alpha"], { oam_sprites: { start: 100, count: 50 } }, { omitted: true })
    ]));
    const [alpha, beta] = result.scenes;
    expect(alpha.metrics.find(m => m.resource === "objVram")?.used).toBe(1024);
    expect(alpha.metrics.find(m => m.resource === "oam")?.used).toBe(4);
    expect(beta.metrics.find(m => m.resource === "oam")?.used).toBe(1);
    expect(beta.metrics.find(m => m.resource === "objPalette")?.used).toBe(32);
    expect(result.blocked).toBe(false);
  });

  it("does not multiply 8bpp OBJ allocation units by 64 again or double-count a shared palette", () => {
    const result = buildAssetPackVideoBudget(scenes, report([
      asset("8bpp", ["scene_alpha"], { obj_tiles: { start: 0, count: 128 }, obj_palette_colors: { start: 0, count: 256 } }),
      asset("shared", ["scene_alpha"], { obj_palette_colors: { start: 0, count: 256 } })
    ]));
    expect(result.scenes[0].metrics.find(m => m.resource === "objVram")?.used).toBe(4096);
    expect(result.scenes[0].metrics.find(m => m.resource === "objPalette")?.used).toBe(512);
  });

  it("identifies the precise overflowing resource and scene without hiding it behind missing fields", () => {
    const result = buildAssetPackVideoBudget(scenes, report([
      asset("sprites", ["scene_beta"], { oam_sprites: { start: 0, count: 129 } })
    ]));
    expect(result.blocked).toBe(true);
    expect(result.scenes[0].blocked).toBe(false);
    expect(result.scenes[1].diagnostics).toContainEqual(expect.objectContaining({ scene: "beta", resource: "oam", code: "capacity_exceeded", excess: 1 }));
  });

  it("keeps maps, complete BG residence, runtime mode and linked ROM explicitly pending", () => {
    const result = buildAssetPackVideoBudget(scenes, report([asset("obj", ["scene_alpha"], {})]));
    expect(result.complete).toBe(false);
    for (const scene of result.scenes) {
      expect(scene.displayMode).toBeNull();
      expect(scene.metrics.find(m => m.resource === "bgVram")?.used).toBeNull();
      expect(scene.metrics.find(m => m.resource === "screenblocks")?.used).toBeNull();
      expect(scene.romAssetBytes).toBeNull();
    }
    expect(result.linkedRomBytes).toBeNull();
  });

  it.each([null, {}, { schema: 11, ok: true }, { schema: 11, ok: false, allocations: [] },
    { schema: 1, ok: true, allocations: [] },
    report([asset("broken", ["scene_alpha"], { oam_sprites: { start: -1, count: 1 } })]),
    report([asset("broken", ["scene_alpha"], {}, { resources: { oam_sprites: 129 } })]),
    report([asset("broken", ["scene_alpha"], {}, { bank_groups: [42] })])
  ])("rejects malformed compiler data instead of reporting zero", raw => {
    expect(() => buildAssetPackVideoBudget(scenes, raw)).toThrow(/relatório|alocação/i);
  });
});
