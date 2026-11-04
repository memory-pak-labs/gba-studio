import { describe, expect, it } from "vitest";
import { buildAssetPackVideoBudget } from "./assetPackVideoBudget.js";

const scenes = [{ name: "alpha", bankGroup: "scene_alpha" }, { name: "beta", bankGroup: "scene_beta" }];
function asset(id: string, bank_groups: string[], allocations: Record<string, { start: number; count: number }>, extra = {}) {
  return { id, bank_group: bank_groups[0], bank_groups, kind: "obj", allocations, ...extra };
}
const report = (allocations: unknown[]) => ({ schema: 11, ok: true, allocations });

describe("asset pack video budget adapter", () => {
  it("keeps color decisions scoped to the scene and never converts formats", () => {
    const policy = { default_bpp: 4, format: "8bpp", reason: "explicit_8bpp", source_visible_colors: 4, review_4bpp: true };
    const raw = report([asset("icon", ["scene_alpha"], {}, { color_policy: policy }),
      asset("other", ["scene_beta"], {}, { color_policy: { ...policy, source_visible_colors: 30, reason: "obj_color_count", review_4bpp: false } }),
      asset("omitted", ["scene_alpha"], {}, { omitted: true, color_policy: policy })]);
    const before = JSON.stringify(raw);
    const result = buildAssetPackVideoBudget(scenes, raw);
    expect(result.scenes[0].colorPolicy).toEqual({ defaultBpp: 4, complete: true, assets: [
      { asset: "icon", kind: "obj", format: "8bpp", reason: "explicit_8bpp", sourceVisibleColors: 4, review4bpp: true }
    ] });
    expect(result.scenes[1].colorPolicy?.assets[0].reason).toBe("obj_color_count");
    expect(JSON.stringify(raw)).toBe(before);
  });

  it("keeps missing color decisions pending and rejects malformed policy evidence", () => {
    expect(buildAssetPackVideoBudget(scenes, report([asset("icon", ["scene_alpha"], {})])).scenes[0].colorPolicy?.complete).toBe(false);
    for (const color_policy of [{}, { default_bpp: 4, format: "8bpp", reason: "explicit_8bpp", source_visible_colors: -1, review_4bpp: true },
      { default_bpp: 4, format: ["4bpp"], reason: "default_4bpp", source_visible_colors: 1, review_4bpp: false },
      { default_bpp: 4, format: "4bpp", reason: ["default_4bpp"], source_visible_colors: 1, review_4bpp: false }]) {
      expect(() => buildAssetPackVideoBudget(scenes, report([asset("bad", ["scene_alpha"], {}, { color_policy })]))).toThrow(/política/i);
    }
  });

  it("validates each native video state with its own OBJ addressing rules", () => {
    const base = { scene: "alpha", bank_group: "scene_alpha", bank_groups: ["scene_alpha"], runtime: "shmup",
      scope: "reservation_envelope", resources: {}, notes: [] };
    const raw = { ...report([asset("obj", ["scene_alpha"], { obj_tiles: { start: 0, count: 1 } })]),
      scene_video_layouts: { schema: 1, plans: [{ ...base, display_mode: null, video_states: [
        { id: "regular", label: "Regular", plan: { ...base, display_mode: 0 } },
        { id: "bitmap", label: "Bitmap", plan: { ...base, display_mode: 5 } }
      ] }] } };
    const result = buildAssetPackVideoBudget(scenes, raw).scenes[0];
    expect(result.blocked).toBe(true);
    expect(result.videoStates?.map(state => state.budget.blocked)).toEqual([false, true]);
    expect(result.diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({ resource: "objVram", feature: "bitmap", status: "blocked" })]));
    expect(result.videoStates?.[1].budget.metrics.find(m => m.resource === "objVram")?.capacity).toBe(16384);
  });

  it("rejects nested or foreign video states instead of bypassing validation", () => {
    const base = { scene: "alpha", bank_group: "scene_alpha", bank_groups: ["scene_alpha"], runtime: "shmup", display_mode: 0,
      scope: "reservation_envelope", resources: {}, notes: [] };
    for (const state of [{ id: "a", label: "A", plan: { ...base, scene: "beta" } },
      { id: "a", label: "A", plan: { ...base, video_states: [] } }]) {
      expect(() => buildAssetPackVideoBudget(scenes, { ...report([]), scene_video_layouts: { schema: 1, plans: [{ ...base, video_states: [state] }] } })).toThrow(/estado/i);
    }
  });

  it("uses native renderer reservations and the effective mode emitted by assetc", () => {
    const raw = { ...report([asset("floor", ["scene_alpha"], { obj_tiles: { start: 0, count: 128 } })]), scene_video_layouts: { schema: 1, plans: [{
      scene: "alpha", bank_group: "scene_alpha", bank_groups: ["scene_alpha"], runtime: "racing", display_mode: 1,
      scope: "reservation_envelope", notes: [], resources: { bgVram: [{ start: 32768, count: 16384 }], screenblocks: [{ start: 0, count: 2 }] }
    }] } };
    const result = buildAssetPackVideoBudget(scenes, raw);
    expect(result.scenes[0].displayMode).toBe(1);
    expect(result.scenes[0].metrics.find(m => m.resource === "bgVram")).toMatchObject({ used: 16384, capacity: 65536, status: "ok" });
    expect(result.scenes[0].metrics.find(m => m.resource === "objVram")).toMatchObject({ capacity: 32768, used: 4096, status: "ok" });
    expect(result.scenes[0].nativeLayout).toMatchObject({ runtime: "racing", scope: "reservation_envelope" });
    expect(result.scenes[1].displayMode).toBeNull();
  });

  it("checks alternate timeline bank groups without summing reused addresses twice", () => {
    const raw = { ...report([
      asset("a", ["scene_alpha"], { oam_sprites: { start: 0, count: 5 } }),
      asset("b", ["scene_alpha_step_1"], { oam_sprites: { start: 0, count: 10 } })
    ]), scene_video_layouts: { schema: 1, plans: [{ scene: "alpha", bank_group: "scene_alpha", bank_groups: ["scene_alpha", "scene_alpha_step_1"], runtime: "cutscene",
      display_mode: 0, scope: "reservation_envelope", resources: {}, notes: [] }] } };
    expect(buildAssetPackVideoBudget(scenes, raw).scenes[0].metrics.find(m => m.resource === "oam")?.used).toBe(10);
  });

  it("rejects malformed or duplicated native layout evidence", () => {
    for (const layouts of [{ schema: 0, plans: [] }, { schema: 1, plans: [null] }, { schema: 1, plans: [{ scene: "alpha", display_mode: 7 }] }]) {
      expect(() => buildAssetPackVideoBudget(scenes, { ...report([]), scene_video_layouts: layouts })).toThrow(/layout/i);
    }
  });

  it("interprets bitmap OBJ slots relative to the accessible upper half of OBJ VRAM", () => {
    const slots = { obj_tiles: { start: 512, count: 512 } };
    const raw = { ...report([asset("bitmap", ["scene_alpha"], slots)]),
      scene_video_layouts: { schema: 1, plans: [{ scene: "alpha", bank_group: "scene_alpha", bank_groups: ["scene_alpha"], runtime: "platformer",
        display_mode: 3, scope: "reservation_envelope", resources: {}, notes: ["advanced_video_layout_not_modelled"] }] } };
    const metric = buildAssetPackVideoBudget(scenes, raw).scenes[0].metrics.find(m => m.resource === "objVram");
    expect(metric).toMatchObject({ used: 16384, addressEnd: 16384, capacity: 16384, status: "not_recommended" });
    slots.obj_tiles.start = 0;
    expect(buildAssetPackVideoBudget(scenes, raw).scenes[0].blocked).toBe(true);
  });

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
