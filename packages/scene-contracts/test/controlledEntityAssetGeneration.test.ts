import { describe, expect, it } from "vitest";

import {
  buildControlledEntityAssetGenerationBrief,
  buildControlledEntitySpritePackManifest,
  resolveControlledEntityContract
} from "../src/index.js";

describe("controlled entity asset generation", () => {
  it("builds a complete brief and manifest for the Top Down character", () => {
    const brief = buildControlledEntityAssetGenerationBrief(
      resolveControlledEntityContract("topdown")
    );

    expect(brief).toMatchObject({
      sceneType: "topdown",
      role: "character",
      required: true,
      visualCanvas: { width: 16, height: 32 },
      collision: { width: 16, height: 16 },
      anchor: "bottom-center",
      directionModel: { mode: "cardinal-4" },
      directions: ["down", "right", "up"],
      mirroring: { left: "right" },
      gbaAssetPreset: "player-topdown",
      animations: expect.arrayContaining([
        expect.objectContaining({ name: "idle", technicalState: "idle", frameCount: 2, fps: 6, loop: true }),
        expect.objectContaining({ name: "walk", technicalState: "walk", frameCount: 4, fps: 10, loop: true })
      ]),
      generationGuidance: expect.any(Array)
    });

    expect(buildControlledEntitySpritePackManifest(brief!, {
      name: "hero-topdown",
      source: "assets/hero-topdown.png"
    })).toMatchObject({
      schemaVersion: 2,
      name: "hero-topdown",
      source: "assets/hero-topdown.png",
      preset: "player-topdown",
      layout: { mode: "horizontal", rows: 1 },
      animations: expect.arrayContaining([
        { name: "idle_down", state: "idle", direction: "down", fps: 6, loops: true, frames: [0, 1] },
        { name: "walk_down", state: "walk", direction: "down", fps: 10, loops: true, frames: [6, 7, 8, 9] }
      ])
    });
  });

  it("generates a marker manifest only for a navigable World Map", () => {
    expect(buildControlledEntityAssetGenerationBrief(
      resolveControlledEntityContract("worldMap")
    )).toBeNull();

    const brief = buildControlledEntityAssetGenerationBrief(
      resolveControlledEntityContract("worldMap", { worldMapNavigable: true })
    );
    expect(brief).toMatchObject({
      sceneType: "worldMap",
      role: "marker",
      directions: ["none"],
      gbaAssetPreset: "world-map-player"
    });
    expect(buildControlledEntitySpritePackManifest(brief!, {
      name: "world-marker",
      source: "assets/world-marker.png"
    }).animations).toEqual([
      { name: "idle", state: "idle", direction: "none", fps: 4, loops: true, frames: [0] },
      { name: "move", state: "walk", direction: "none", fps: 8, loops: true, frames: [1, 2] }
    ]);
  });

  it("does not build assets for neutral contracts", () => {
    expect(buildControlledEntityAssetGenerationBrief(
      resolveControlledEntityContract("custom")
    )).toBeNull();
  });
});
