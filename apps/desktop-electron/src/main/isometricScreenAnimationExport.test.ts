import { describe, expect, it } from "vitest";
import { buildIsometricActorAnimations } from "./exportEngineProject.js";
import { buildActorEngineSpriteExport, buildAssetcSpritePackGeneration } from "../shared/engineProjectExport.js";

describe("isometric screen-facing animation export", () => {
  it("keeps screen-facing clips separate from existing projected directions", () => {
    const entries = [
      { name: "idle_screen_up", asset: "hero", frame_indices: [10] },
      { name: "idle_up_right", asset: "hero", frame_indices: [1] },
      { name: "walk_screen_up", asset: "hero", frame_indices: [11, 12] },
      { name: "walk_up_right", asset: "hero", frame_indices: [2, 3] }
    ];
    const result = buildIsometricActorAnimations(entries)!;
    expect(result.find((entry) => entry.name === "idle_up")?.frame_indices).toEqual([1]);
    expect(result.find((entry) => entry.name === "idle_screen_up")?.frame_indices).toEqual([10]);
    expect(result.find((entry) => entry.name === "walk_up")?.frame_indices).toEqual([2, 3]);
    expect(result.find((entry) => entry.name === "walk_screen_up")?.frame_indices).toEqual([11, 12]);
  });

  it("exports an authored screen direction selected in the editor", () => {
    const data = {
      assets: [{ id: "hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png", width: 32, height: 16 } }],
      animations: [
        { id: "base", name: "idle_down", state: "idle", direction: "down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1 },
        { id: "front", name: "looking_front", state: "idle", direction: "screen_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1, frames: [{ tiles: [{ sliceX: 16, sliceY: 0, tileWidth: 16, tileHeight: 16 }] }] }
      ],
      actors: [{ id: "player", name: "Player", spriteSheet: "hero.png" }]
    };
    const pack = buildAssetcSpritePackGeneration(data);
    const result = buildActorEngineSpriteExport(data, data.actors[0], pack, { directionAdapter: "isometric" });
    expect(result?.animations?.find((entry) => entry.name === "idle_screen_down")).toMatchObject({
      frame_indices: [0], frame_metasprites: [{ parts: [{ slice_x: 16, slice_y: 0 }] }]
    });
  });
});
