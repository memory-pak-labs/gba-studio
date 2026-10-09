import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fitProjectSpriteFrames, auditProjectSpriteFrames } from "../../scripts/lib/sprite-canvas-audit.mjs";
import { buildActorEngineSpriteExport, buildAssetcSpritePackGeneration } from "./engineProjectExport.js";
import { deriveProjectHealthReport } from "./projectHealth.js";

const canonical = JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));

describe("canonical sprite canvas audit", () => {
  it("contains all 129 sheets and 362 frames without cropping or missing compositions", () => {
    const rows = auditProjectSpriteFrames(canonical);
    expect(rows).toHaveLength(129);
    expect(rows.reduce((n, r) => n + r.frames, 0)).toBe(362);
    expect(rows.filter(r => r.clippedFrames || r.missingFrames)).toEqual([]);
    expect(fitProjectSpriteFrames(canonical)).toEqual(canonical);
  });

  it.each([64, 48, 32])("keeps the runtime export identical when fitting a %ipx composition", width => {
    const actor = { id: "actor", name: "Actor", spriteSheet: "hero.png", animationName: "idle" };
    const before = {
      assets: [{ id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png", width, height: width } }],
      actors: [actor], animations: [{ id: "idle", name: "idle", spriteSheet: "hero.png", frameWidth: width,
        frameHeight: width, frameCount: 1, originX: 0, originY: 0, colorMode: "4bpp",
        frames: [{ width, height: width, originX: 0, originY: 0, tiles: [{ x: 0, y: 0,
          sliceX: 0, sliceY: 0, tileWidth: width, tileHeight: width, sourceSheet: "hero.png" }] }] }]
    };
    const after = fitProjectSpriteFrames(before);
    expect(buildActorEngineSpriteExport(after, actor, buildAssetcSpritePackGeneration(after)))
      .toEqual(buildActorEngineSpriteExport(before, actor, buildAssetcSpritePackGeneration(before)));
  });

  it("keeps the export identical when materializing a 48px implicit portrait", () => {
    const before = structuredClone(canonical);
    const animation = before.animations.find(a => a.spriteSheet === "council-v5-nara.png");
    delete animation.frames;
    const after = fitProjectSpriteFrames(before);
    const actor = { id: "audit", spriteSheet: animation.spriteSheet };
    expect(buildActorEngineSpriteExport(after, actor, buildAssetcSpritePackGeneration(after)))
      .toEqual(buildActorEngineSpriteExport(before, actor, buildAssetcSpritePackGeneration(before)));
  });
});

// Opt-in comparison against the preserved snapshot, outside the permanent contract.
if (process.env.GBA_SPRITE_AUDIT_BEFORE) {
  it("compares all exports and project health against the preserved snapshot", () => {
    const before = JSON.parse(readFileSync(process.env.GBA_SPRITE_AUDIT_BEFORE, "utf8"));
    const oldPack = buildAssetcSpritePackGeneration(before);
    const newPack = buildAssetcSpritePackGeneration(canonical);
    const changed = [];
    for (const row of auditProjectSpriteFrames(canonical)) {
      const actor = { id: "audit", spriteSheet: row.sheet };
      const oldExport = buildActorEngineSpriteExport(before, actor, oldPack);
      const newExport = buildActorEngineSpriteExport(canonical, actor, newPack);
      if (JSON.stringify(oldExport) !== JSON.stringify(newExport)) changed.push(row.sheet);
    }
    expect(changed.sort()).toEqual([
      "hud-usina-combat-v3-4bpp.png", "hud-usina-exit-v3-4bpp.png",
      "hud-usina-exploration-v3-4bpp.png", "title-logo-actor-128x88.png"
    ].sort());
    const oldErrors = deriveProjectHealthReport(before).diagnostics.filter(d => d.severity === "error");
    const newErrors = deriveProjectHealthReport(canonical).diagnostics.filter(d => d.severity === "error");
    expect(newErrors.filter(d => !oldErrors.some(e => e.id === d.id))).toEqual([]);
  });
}
