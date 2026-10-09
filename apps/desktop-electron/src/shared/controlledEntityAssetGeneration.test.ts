import { describe, expect, it } from "vitest";

import {
  buildControlledEntityAssetGenerationBrief,
  buildControlledEntitySpritePackManifest,
  resolveControlledEntityContract
} from "../../../../packages/scene-contracts/src/index.js";

describe("controlled entity asset generation", () => {
  it("describes the approved 32px cursor with a four-frame click and optional hover", () => {
    const contract = resolveControlledEntityContract("pointAndClick");
    expect(contract).toMatchObject({ visualCanvas: { width: 32, height: 32 }, animations: {
      pointer: { defaultFrames: 1 }, hover: { required: false }, click: { defaultFrames: 4, fps: 12, loop: false }
    } });
  });
  it("reuses one source frame for every generated animation when preparing a single PNG", () => {
    const brief = buildControlledEntityAssetGenerationBrief(
      resolveControlledEntityContract("racing")
    );

    const manifest = buildControlledEntitySpritePackManifest(brief!, {
      name: "single-car",
      source: "assets/car.png",
      sourceAnimationMode: "single-frame"
    });

    expect(manifest.layout).toEqual({ mode: "horizontal", rows: 1, columns: 1 });
    expect(manifest.animations).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "idle_up", frames: [0] }),
      expect.objectContaining({ name: "drive_right", frames: [0, 0] }),
      expect.objectContaining({ name: "hurt_down", frames: [0] })
    ]));
  });
});
