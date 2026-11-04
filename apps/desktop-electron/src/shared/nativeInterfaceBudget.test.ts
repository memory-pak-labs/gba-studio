import { describe, expect, it } from "vitest";
import { buildAssetPackVideoBudget } from "./assetPackVideoBudget.js";
const scenes = [{ name: "a", bankGroup: "scene_a" }];
function raw(start = 0, reservations: unknown[] = [
  { feature: "hud_text", resources: { objVram: [{ start: 28800, count: 3968 }], oam: [{ start: 96, count: 32 }] } },
  { feature: "name_keyboard", resources: { objVram: [{ start: 29952, count: 1280 }], oam: [{ start: 40, count: 40 }] } }
]) { return { schema: 11, ok: true, allocations: [{ bank_group: "scene_a", allocations: {
  obj_tiles: { start, count: 32 }, oam_sprites: { start: 0, count: 4 } } }],
scene_video_layouts: { schema: 1, plans: [{ scene: "a", bank_group: "scene_a", bank_groups: ["scene_a"], runtime: "menu", display_mode: 0,
  scope: "reservation_envelope", resources: {}, notes: [], dynamic_reservations: reservations }] } }; }
describe("native interface budget", () => {
  it("unions shared glyph arenas with compiled payloads", () => {
    const scene = buildAssetPackVideoBudget(scenes, raw()).scenes[0];
    expect(scene.metrics.find(m => m.resource === "objVram")).toMatchObject({ used: 4992, basis: "compiled_and_native" });
    expect(scene.metrics.find(m => m.resource === "oam")?.used).toBe(76);
    expect(scene.nativeLayout?.dynamicReservations).toHaveLength(2);
  });
  it("blocks compiled OBJ payloads overlapping private glyph arenas", () => {
    const scene = buildAssetPackVideoBudget(scenes, raw(900)).scenes[0];
    expect(scene.blocked).toBe(true);
    expect(scene.diagnostics).toContainEqual(expect.objectContaining({ code: "reservation_overlap", resource: "objVram", feature: "hud_text" }));
  });
  it("allows only compiler-proven offscreen bytes to share a glyph arena", () => {
    const value = raw(900);
    value.allocations[0].allocations.obj_tiles.count = 1;
    Object.assign(value.scene_video_layouts.plans[0], { nonvisible_obj_ranges: [{ start: 28800, count: 32 }] });
    expect(buildAssetPackVideoBudget(scenes, value).scenes[0].blocked).toBe(false);
    value.allocations[0].allocations.obj_tiles.count = 2;
    expect(buildAssetPackVideoBudget(scenes, value).scenes[0].blocked).toBe(true);
  });
  it("rejects invalid dynamic pools", () => {
    expect(() => buildAssetPackVideoBudget(scenes, raw(0, [{ feature: "text", resources: { unknownPool: [] } }]))).toThrow(/reserva/i);
  });
});
