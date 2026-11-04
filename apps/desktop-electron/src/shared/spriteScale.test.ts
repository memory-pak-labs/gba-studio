import { assertSpriteScaleBudget } from "./spriteScale.js";
import { describe, expect, it } from "vitest";
import { buildActorEngineSpriteExport, buildAssetcSpritePackGeneration } from "./engineProjectExport.js";
import { deriveSpritesWorkspacePresentation, updateSpriteAnimationFieldsInProject } from "./spritesWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

function fixture(): GBAProjectData {
  return { assets: [{ id: "sheet", name: "actor.png", kind: "Sprite", metadata: { source: "Assets/actor.png" } }],
    actors: [{ id: "a", name: "Actor", spriteSheet: "actor.png", animationName: "idle" }],
    animations: [{ id: "idle", name: "idle", spriteSheet: "actor.png", frameWidth: 16, frameHeight: 16, frames: [{ tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 16, tileHeight: 16 }] }] }] };
}
describe("hardware sprite scale", () => {
  it("persists independent axes while preserving the source image and hitbox", () => {
    const data = fixture(), before = JSON.stringify(data);
    const next = updateSpriteAnimationFieldsInProject(data, "idle", { scaleX: 1.5, scaleY: 0.75 });
    expect(JSON.stringify(data)).toBe(before);
    expect((next.animations as Record<string, unknown>[])[0]).toMatchObject({ scaleX: 1.5, scaleY: 0.75, frameWidth: 16, frameHeight: 16 });
    expect(deriveSpritesWorkspacePresentation(JSON.parse(JSON.stringify(next))).animationsBySheet["actor.png"][0]).toMatchObject({ scaleX: 1.5, scaleY: 0.75 });
  });
  it("exports native OBJ dimensions and scaled part positions instead of enlarging source tiles", () => {
    const data = updateSpriteAnimationFieldsInProject(fixture(), "idle", { scaleX: 1.5, scaleY: 0.75 });
    const actor = (data.actors as Record<string, unknown>[])[0];
    const entry = buildActorEngineSpriteExport(data, actor, buildAssetcSpritePackGeneration(data))!;
    const part = entry.animations![0].frame_metasprites![0].parts[0];
    expect(part).toMatchObject({ width: 16, height: 16, scale_x256: 384, scale_y256: 192 });
    expect(part.x).toBe(4);
  });
  it("blocks more than four scale pairs and explicit use of reserved matrices", () => {
    const data = fixture();
    data.rooms = [{ name: "room" }];
    data.actors = Array.from({ length: 5 }, (_, i) => ({ roomName: "room", spriteSheet: `s${i}` }));
    data.animations = Array.from({ length: 5 }, (_, i) => ({ spriteSheet: `s${i}`, scaleX: 1 + (i + 1) / 16 }));
    expect(() => assertSpriteScaleBudget(data)).toThrow(/quatro pares/);
    data.animations = (data.animations as unknown[]).slice(0, 1);
    (data.rooms as Record<string, unknown>[])[0].runtime = { config: { capabilities: [{ id: "affine_obj", enabled: true, settings: { matrixIndex: 20 } }] } };
    expect(() => assertSpriteScaleBudget(data)).toThrow(/16–31/);
  });
  it.each([0, -1, NaN, Infinity, 2.1])("rejects invalid saved scaling (%s) at export", value => {
    const data = fixture(); (data.animations as Record<string, unknown>[])[0].scaleX = value;
    expect(() => buildActorEngineSpriteExport(data, (data.actors as Record<string, unknown>[])[0], buildAssetcSpritePackGeneration(data))).toThrow(/escala/i);
  });
});
