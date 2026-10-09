import { describe, expect, it } from "vitest";

import {
  createPlatformerPreviewBody,
  stepPlatformerPreview,
  type PlatformerPreviewInput,
  type PlatformerPreviewMap
} from "./platformerPreview.js";
import { DEFAULT_PLATFORMER_SCENE_CONFIG } from "./sceneTypeProfiles.js";

function mapWithFloor(floorType: string = "solid"): PlatformerPreviewMap {
  const width = 16;
  const height = 12;
  const collisionTypes = Array.from({ length: width * height }, () => "free");
  for (let x = 0; x < width; x += 1) collisionTypes[8 * width + x] = floorType;
  return { width, height, collisionTypes };
}

function input(partial: Partial<PlatformerPreviewInput> = {}): PlatformerPreviewInput {
  return {
    left: false,
    right: false,
    up: false,
    down: false,
    jumpPressed: false,
    jumpHeld: false,
    dashPressed: false,
    glideHeld: false,
    ...partial
  };
}

describe("Platformer Preview physics", () => {
  it("applies a held variable jump and cuts it at the configured minimum", () => {
    const config = {
      ...DEFAULT_PLATFORMER_SCENE_CONFIG,
      jumpSpeed: 5.5,
      jumpMinHeight: 1.25,
      jumpFrames: 8
    };
    const floor = mapWithFloor();
    const grounded = createPlatformerPreviewBody(32, 56);

    const held = stepPlatformerPreview(grounded, input({ jumpPressed: true, jumpHeld: true }), config, floor);
    const released = stepPlatformerPreview(held, input(), config, floor);

    expect(held.onGround).toBe(false);
    expect(held.velocityY).toBeLessThan(-config.jumpMinHeight);
    expect(released.jumpHoldFrames).toBe(0);
    expect(released.velocityY).toBeGreaterThan(held.velocityY);
  });

  it("accepts a buffered jump during coyote time", () => {
    const config = { ...DEFAULT_PLATFORMER_SCENE_CONFIG, coyoteTime: 3, jumpBuffer: 4 };
    const body = {
      ...createPlatformerPreviewBody(32, 48),
      onGround: false,
      coyoteFrames: 2
    };

    const jumped = stepPlatformerPreview(body, input({ jumpPressed: true }), config, mapWithFloor());

    expect(jumped.onGround).toBe(false);
    expect(jumped.coyoteFrames).toBe(0);
    expect(jumped.velocityY).toBeLessThan(0);
  });

  it("drops through a one-way platform only with the configured input", () => {
    const config = { ...DEFAULT_PLATFORMER_SCENE_CONFIG, dropThrough: "down_jump_hold" as const };
    const body = createPlatformerPreviewBody(32, 56);
    const oneWay = mapWithFloor("down");

    const dropped = stepPlatformerPreview(body, input({ down: true, jumpPressed: true, jumpHeld: true }), config, oneWay);

    expect(dropped.onGround).toBe(false);
    expect(dropped.dropThroughFrames).toBeGreaterThan(0);
    expect(dropped.y).toBeGreaterThan(body.y);
  });

  it("starts an airborne dash with recharge and actor/wall pass-through semantics", () => {
    const config = {
      ...DEFAULT_PLATFORMER_SCENE_CONFIG,
      dash: true,
      dashStyle: "air" as const,
      dashSpeed: 6.5,
      dashFrames: 8,
      dashRechargeFrames: 45,
      dashThrough: "actors_triggers_walls" as const
    };
    const body = {
      ...createPlatformerPreviewBody(32, 40),
      onGround: false,
      velocityY: 2
    };

    const dashed = stepPlatformerPreview(body, input({ dashPressed: true, right: true }), config, mapWithFloor());

    expect(dashed.dashing).toBe(true);
    expect(dashed.velocityX).toBe(config.dashSpeed);
    expect(dashed.velocityY).toBe(0);
    expect(dashed.dashRechargeFrames).toBe(config.dashRechargeFrames);
    expect(dashed.ignoresTileCollisions).toBe(true);
  });

  it("snaps a non-square body to the authored slope floor", () => {
    const config = { ...DEFAULT_PLATFORMER_SCENE_CONFIG, gravity: 0 };
    const width = 4;
    const height = 4;
    const collisionTypes = Array.from({ length: width * height }, () => "free");
    collisionTypes[2 * width + 1] = "slope_up_right";
    const map = { width, height, collisionTypes };
    const body = {
      ...createPlatformerPreviewBody(8, 10, 12, 8),
      onGround: false
    };

    const settled = stepPlatformerPreview(body, input(), config, map);

    expect(settled.width).toBe(12);
    expect(settled.height).toBe(8);
    expect(settled.y).toBe(9);
    expect(settled.onGround).toBe(true);
  });

  it("uses the slope pixel mask instead of treating a ramp as a full solid tile", () => {
    const config = { ...DEFAULT_PLATFORMER_SCENE_CONFIG, gravity: 0 };
    const width = 3;
    const height = 3;
    const collisionTypes = Array.from({ length: width * height }, () => "free");
    collisionTypes[1 * width + 1] = "slope_up_right";
    const map = { width, height, collisionTypes };
    const body = {
      ...createPlatformerPreviewBody(8, 8, 2, 2),
      onGround: false
    };

    const moved = stepPlatformerPreview(body, input({ right: true }), config, map);

    expect(moved.x).toBeGreaterThan(body.x);
    expect(moved.hitWall).toBe(false);
  });

  it("continues across a ramp and follows its floor instead of creating a side wall", () => {
    const config = { ...DEFAULT_PLATFORMER_SCENE_CONFIG, gravity: 0 };
    const width = 3;
    const height = 3;
    const collisionTypes = Array.from({ length: width * height }, () => "free");
    collisionTypes[1 * width + 1] = "slope_up_right";
    const map = { width, height, collisionTypes };
    const body = {
      ...createPlatformerPreviewBody(8, 11, 2, 4),
      onGround: true
    };

    const moved = stepPlatformerPreview(body, input({ right: true }), config, map);

    expect(moved.x).toBeGreaterThan(body.x);
    expect(moved.y).toBeLessThan(body.y);
    expect(moved.hitWall).toBe(false);
    expect(moved.onGround).toBe(true);
  });
});
