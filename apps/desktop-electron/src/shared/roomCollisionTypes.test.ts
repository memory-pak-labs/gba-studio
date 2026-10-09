import { describe, expect, it } from "vitest";
import {
  collisionFlagsFromTypes,
  collisionSlopesFromTypes,
  isBlockedCollisionType,
  isBlockedCollisionTypeForScene,
  normalizeRoomCollisionType,
  resizeCollisionTypeCells
} from "./roomCollisionTypes.js";
import { setRoomCollisionTypeInProject } from "./roomsWorkspace.js";

describe("roomCollisionTypes", () => {
  it("normalizes unknown collision values to free", () => {
    expect(normalizeRoomCollisionType("water")).toBe("water");
    expect(normalizeRoomCollisionType("damage")).toBe("damage");
    expect(normalizeRoomCollisionType("ladder")).toBe("ladder");
    expect(normalizeRoomCollisionType("invalid")).toBe("free");
  });

  it("marks solid, directional and ramp surfaces as movement blocking", () => {
    expect(isBlockedCollisionType("solid")).toBe(true);
    expect(isBlockedCollisionType("down")).toBe(true);
    expect(isBlockedCollisionType("slope_up_right")).toBe(true);
    expect(isBlockedCollisionType("slope_up_left")).toBe(true);
    expect(isBlockedCollisionType("water")).toBe(false);
    expect(isBlockedCollisionType("damage")).toBe(false);
    expect(isBlockedCollisionType("ladder")).toBe(false);
    expect(isBlockedCollisionType("event")).toBe(false);
    expect(isBlockedCollisionType("free")).toBe(false);
  });

  it("keeps isometric ramps traversable while retaining the generic blocking contract", () => {
    expect(isBlockedCollisionTypeForScene("slope_up_right", "isometric")).toBe(false);
    expect(isBlockedCollisionTypeForScene("slope_up_left", "isometric")).toBe(false);
    expect(isBlockedCollisionTypeForScene("solid", "isometric")).toBe(true);
    expect(isBlockedCollisionTypeForScene("slope_up_right", "platformer")).toBe(true);
  });

  it("exports the directional and effect bits consumed by GBAStudioEngine", () => {
    expect(collisionFlagsFromTypes([
      "solid", "free", "down", "up", "left", "right", "water", "damage", "ladder", "event"
    ])).toEqual([1, 0, 2, 4, 16, 8, 32, 64, 128, 0]);
  });

  it("exports both platformer ramp orientations to the slope map", () => {
    expect(collisionSlopesFromTypes([
      "free", "slope_up_right", "slope_up_left", "solid"
    ])).toEqual([0, 2, 4, 0]);
  });

  it("pads and trims collision types when room is resized", () => {
    const resized = resizeCollisionTypeCells(["solid", "free"], 2, 1, 3, 2, "free");
    expect(resized).toEqual(["solid", "free", "free", "free", "free", "free"]);
  });
});

describe("setRoomCollisionTypeInProject", () => {
  it("persists advanced collision types in the room", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, collisionTypes: ["free", "free", "free", "free"] }]
    };

    const next = setRoomCollisionTypeInProject(project, "room-overworld", 1, "water");
    expect((next.scenas as Record<string, unknown>[])[0].collisionTypes).toEqual(["free", "water", "free", "free"]);
  });

  it("keeps a modular topdown collision edit aligned to its 2x2 metatile", () => {
    const project = {
      scenas: [{
        id: "room-port",
        name: "Porto",
        sceneType: "topdown",
        width: 6,
        height: 4,
        collisionTypes: Array.from({ length: 24 }, () => "free")
      }]
    };

    const next = setRoomCollisionTypeInProject(project, "room-port", 7, "solid");
    expect((next.scenas as Record<string, unknown>[])[0].collisionTypes).toEqual([
      "solid", "solid", "free", "free", "free", "free",
      "solid", "solid", "free", "free", "free", "free",
      "free", "free", "free", "free", "free", "free",
      "free", "free", "free", "free", "free", "free"
    ]);
  });
});
