import { describe, expect, it } from "vitest";
import { updateSpriteAnimationFieldsInProject, deriveSpritesWorkspacePresentation, createSpriteAnimationInProject } from "./spritesWorkspace.js";
import { buildAssetcSpritePackGeneration, applySceneResourceCompressionPolicies } from "./engineProjectExport.js";
import { analyzeSpriteVram } from "./spriteVramAnalysis.js";
import { auditGbaHardwareBlockingErrors } from "./gbaHardwareContract.js";
import type { GBAProjectData } from "./projectFile.js";
import { appendImportedAssetsToProject } from "./filesWorkspace.js";

function fixture(): GBAProjectData {
  return {
    assets: [{ id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png", streamFrames: true } }],
    rooms: [{ id: "room", name: "Room", sceneType: "topdown", width: 30, height: 20 }],
    actors: [{ id: "actor", roomName: "Room", spriteSheet: "hero.png", animationName: "idle" }],
    animations: ["idle", "walk"].map(name => ({ id: name, name, spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 2, colorMode: "4bpp" }))
  };
}

describe("sprite color depth through authoring and export", () => {
  it("keeps new and existing sheets in 4bpp by default", () => {
    expect(buildAssetcSpritePackGeneration(fixture())!.packAssets[0].sprite_bpp ?? 4).toBe(4);
  });
  it("retains an explicitly authored sheet mode while importing its idle animation", () => {
    const imported = appendImportedAssetsToProject({}, [{ id: "hero", name: "hero.png", kind: "Sprite", relativePath: "Assets/hero.png", systemImage: "photo", metadata: { colorMode: "8bpp" } }]);
    expect((imported.animations as Record<string, unknown>[])[0].colorMode).toBe("8bpp");
    expect(deriveSpritesWorkspacePresentation(imported).spriteSheets[0].colorModes).toEqual(["8bpp"]);
  });
  it("changes the whole sheet, persists its mode and exports streamed 8bpp", () => {
    const original = fixture();
    const updated = updateSpriteAnimationFieldsInProject(original, "idle", { colorMode: "8bpp" });
    expect(original).toEqual(fixture());
    expect((updated.animations as Record<string, unknown>[]).map(a => a.colorMode)).toEqual(["8bpp", "8bpp"]);
    expect((updated.assets as Record<string, any>[])[0].metadata.colorMode).toBe("8bpp");
    const reopened = JSON.parse(JSON.stringify(updated));
    expect(buildAssetcSpritePackGeneration(reopened)!.packAssets[0]).toMatchObject({ sprite_bpp: 8, stream_frames: true });
    expect(deriveSpritesWorkspacePresentation(reopened).spriteSheets[0].colorModes).toEqual(["8bpp"]);
    expect(auditGbaHardwareBlockingErrors(reopened)).toEqual([]);
  });
  it("counts full-byte tiles and rejects unknown modes", () => {
    const input = { name: "hero", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 3, colorMode: "8bpp" };
    expect(analyzeSpriteVram(input)).toMatchObject({ bytesPerTile: 64, totalTileBytes: 768 });
    expect(() => updateSpriteAnimationFieldsInProject(fixture(), "idle", { colorMode: "15bpp" })).toThrow();
  });
  it("budgets streamed 8bpp residency separately from the full animation", () => {
    const input = { name: "hero", spriteSheet: "hero.png", frameWidth: 64, frameHeight: 64, frameCount: 20, colorMode: "8bpp", streamFrames: true };
    expect(analyzeSpriteVram(input)).toMatchObject({ totalTileBytes: 81920, residentTileBytes: 4096, warnings: [] });
  });
  it("inherits the sheet mode when authoring another animation", () => {
    const eight = updateSpriteAnimationFieldsInProject(fixture(), "idle", { colorMode: "8bpp" });
    const updated = createSpriteAnimationInProject(eight, { id: "new", name: "attack", spriteSheet: "hero.png" });
    expect((updated.animations as Record<string, unknown>[]).at(-1)?.colorMode).toBe("8bpp");
  });
  it("does not treat a scene resource declaration as an image conversion", () => {
    const data = fixture();
    (data.rooms as Record<string, any>[])[0].runtime = { config: { resources: { resources: [{ id: "hero", assetId: "hero.png", kind: "obj", bpp: 8, enabled: true }] } } };
    expect(() => applySceneResourceCompressionPolicies(data, buildAssetcSpritePackGeneration(data)!.packAssets)).toThrow(/Sprites/);
    const updated = updateSpriteAnimationFieldsInProject(data, "idle", { colorMode: "8bpp" });
    expect(applySceneResourceCompressionPolicies(updated, buildAssetcSpritePackGeneration(updated)!.packAssets)[0].sprite_bpp).toBe(8);
  });
  it("blocks declared 8bpp OBJ colors that would overwrite runtime text palettes", () => {
    const data = updateSpriteAnimationFieldsInProject(fixture(), "idle", { colorMode: "8bpp" });
    const metadata = (data.assets as Record<string, any>[])[0].metadata;
    metadata.maxVisibleColors = 195;
    expect(auditGbaHardwareBlockingErrors(data)).toEqual(expect.arrayContaining([
      expect.stringContaining("OBJ_SHARED_PALETTE_LIMIT_EXCEEDED")
    ]));
    metadata.maxVisibleColors = 194;
    expect(auditGbaHardwareBlockingErrors(data)).toEqual([]);
  });
});
