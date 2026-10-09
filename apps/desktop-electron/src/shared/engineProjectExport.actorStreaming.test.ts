import { describe, expect, it } from "vitest";
import { buildActorEngineSpriteExport, buildAssetcSpritePackGeneration } from "./engineProjectExport.js";
import type { GBAProjectData } from "./projectFile.js";

function fixture(streamFrames: boolean, secondRoom = "room") {
  return {
    assets: [{ id: "own", name: "own.png", kind: "Sprite", metadata: { source: "Assets/sprites/own.png", streamFrames } }],
    rooms: [{ id: "r", name: "room", sceneType: "topdown", width: 30, height: 20 }, { id: "r2", name: "other", sceneType: "topdown", width: 30, height: 20 }],
    actors: [
      { id: "one", name: "One", roomName: "room", spriteSheet: "own.png", animationName: "idle_down" },
      { id: "two", name: "Two", roomName: secondRoom, spriteSheet: "own.png", animationName: "walk_down" }
    ],
    animations: [{ id: "idle", name: "idle_down", spriteSheet: "own.png", frameWidth: 16, frameHeight: 16, frames: [{ frameIndex: 0 }] },
      { id: "walk", name: "walk_down", spriteSheet: "own.png", frameWidth: 16, frameHeight: 16, frames: [{ frameIndex: 0 }, { frameIndex: 1 }] }]
  } as GBAProjectData;
}
describe("independent streamed actor residency", () => {
  it("reserves different tile ranges for simultaneously animated actors sharing a sheet", () => {
    const data = fixture(true), pack = buildAssetcSpritePackGeneration(data)!;
    const fields = (data.actors as Record<string, unknown>[]).map(actor => buildActorEngineSpriteExport(data, actor, pack)!);
    expect(fields[0].metasprite.asset).not.toBe(fields[1].metasprite.asset);
    expect(pack.packAssets).toHaveLength(2);
    expect(pack.packAssets.every(asset => asset.stream_frames && asset.png === "assets/sprite/own.png")).toBe(true);
    expect(fields[1].animations!.every(animation => animation.asset === fields[1].metasprite.asset)).toBe(true);
  });
  it.each([[false, "room"], [true, "other"]])("reuses resident sheets and sprites in disjoint scenes (%s/%s)", (stream, room) => {
    const data = fixture(Boolean(stream), String(room)), pack = buildAssetcSpritePackGeneration(data)!;
    expect(pack.packAssets).toHaveLength(1);
  });
});
