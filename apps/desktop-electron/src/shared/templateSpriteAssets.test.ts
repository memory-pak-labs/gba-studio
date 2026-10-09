import { describe, expect, it } from "vitest";
import { horizontalTemplateSpriteAnimations } from "./templateSpriteAssets.js";

describe("templateSpriteAssets", () => {
  it("creates frames in the current GB Studio origin coordinate system", () => {
    const [animation] = horizontalTemplateSpriteAnimations("hero.png", 32, 32, [{
      name: "idle_right",
      state: "idle",
      direction: "right",
      fps: 8,
      loops: true,
      frameCount: 1
    }]);

    expect(animation).toMatchObject({
      originX: 0,
      originY: 0,
      frames: [{
        originX: 0,
        originY: 0,
        tiles: [{ x: -8, y: 0, tileWidth: 32, tileHeight: 32 }]
      }]
    });
  });

  it("supports animation specs that reuse source frames from a template strip", () => {
    const [animation] = horizontalTemplateSpriteAnimations("fighter.png", 32, 64, [{
      name: "attack",
      state: "attack",
      direction: "right",
      fps: 12,
      loops: false,
      frameCount: 2,
      sourceFrameIndexes: [0, 4]
    }]);

    expect(animation.frames).toMatchObject([
      { tiles: [{ sliceX: 0 }] },
      { tiles: [{ sliceX: 128 }] }
    ]);
  });
});
