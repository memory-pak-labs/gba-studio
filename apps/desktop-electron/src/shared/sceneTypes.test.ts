import { describe, expect, it } from "vitest";
import {
  normalizeSceneTypeId,
  roomInspectorSceneTypeOptions,
  sceneTypeLabel
} from "./sceneTypes.js";

describe("scene types", () => {
  it("normalizes legacy labels and aliases to stable scene type ids", () => {
    expect(normalizeSceneTypeId("Aventura / Top-down")).toBe("topdown");
    expect(normalizeSceneTypeId("Plataforma")).toBe("platformer");
    expect(normalizeSceneTypeId("Isométrico")).toBe("isometric");
    expect(normalizeSceneTypeId("Apontar e clicar")).toBe("pointAndClick");
    expect(normalizeSceneTypeId("point-and-click")).toBe("pointAndClick");
    expect(normalizeSceneTypeId("Dungeon Crawler")).toBe("dungeonCrawler");
    expect(normalizeSceneTypeId("Corrida")).toBe("racing");
  });

  it("keeps unknown values mapped to a safe fallback", () => {
    expect(normalizeSceneTypeId("", "topdown")).toBe("topdown");
    expect(normalizeSceneTypeId("algo-inventado", "topdown")).toBe("topdown");
  });

  it("exposes every selectable room scene type for the inspector", () => {
    expect(roomInspectorSceneTypeOptions("topdown").map((option) => option.value)).toEqual([
      "topdown",
      "platformer",
      "isometricAdventure",
      "isometricTactical",
      "dungeonCrawler",
      "racing",
      "pointAndClick",
      "shmup",
      "visualNovel",
      "menu",
      "cutscene",
      "worldMap",
      "battleRpg",
      "luta",
      "custom"
    ]);
    expect(roomInspectorSceneTypeOptions("Aventura / Top-down").map((option) => option.label)).toContain("Plataforma");
    expect(roomInspectorSceneTypeOptions("Aventura / Top-down").map((option) => option.label)).toContain("Apontar e clicar");
    expect(roomInspectorSceneTypeOptions("Aventura / Top-down").map((option) => option.label)).toContain("Isométrica · Aventura");
    expect(roomInspectorSceneTypeOptions("isometric").map((option) => option.label)).toContain("Isométrica · Batalha tática RPG");
  });

  it("returns human labels for known scene type ids", () => {
    expect(sceneTypeLabel("platformer")).toBe("Plataforma");
    expect(sceneTypeLabel("Aventura / Top-down")).toBe("Aventura / Top-down");
  });
});
