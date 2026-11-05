import { describe, expect, it } from "vitest";
import { buildAssetPackVideoBudget } from "./assetPackVideoBudget.js";
import { attachLinkedSceneRomBudget } from "./linkedSceneRomBudget.js";
const base = () => ({ ...buildAssetPackVideoBudget([{ name: "a", bankGroup: "scene_a" }], { schema: 11, ok: true, allocations: [] }), linkedRomBytes: 1000 });
const usage = () => ({ schema: 1, source: "linked_asset_symbols", attributedBytes: 100, otherBytes: 900,
  scenes: [{ scene: "a", bytes: 100, exclusiveBytes: 60, sharedBytes: 40, assetCount: 2 }] });
describe("linked scene ROM budget", () => {
  it("publishes linked assets separately from the whole ROM and keeps coverage partial", () => {
    const original = base();
    const result = attachLinkedSceneRomBudget(original, usage());
    expect(result.scenes[0].romAssetBytes).toBe(100);
    expect(result.scenes[0].romAssets).toMatchObject({ exclusiveBytes: 60, sharedBytes: 40, assetCount: 2 });
    expect(result.scenes[0].metrics.find(m => m.resource === "romAssets")).toMatchObject({ used: 100, basis: "linked_elf" });
    expect(result.linkedRomBytes).toBe(1000);
    expect(result.complete).toBe(false);
    expect(original.scenes[0].romAssetBytes).toBeNull();
  });
  it.each(["size", "split", "duplicate", "missing"])("rejects invalid %s attribution", kind => {
    const value = usage();
    if (kind === "size") value.otherBytes = 899;
    if (kind === "split") value.scenes[0].sharedBytes = 41;
    if (kind === "duplicate") value.scenes.push(value.scenes[0]);
    if (kind === "missing") value.scenes = [];
    expect(() => attachLinkedSceneRomBudget(base(), value)).toThrow(/ROM/);
  });
});
