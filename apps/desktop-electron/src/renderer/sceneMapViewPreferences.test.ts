/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSceneMapViewZoom, writeSceneMapViewZoom } from "./sceneMapViewPreferences.js";

describe("scene map navigation preferences", () => {
  afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

  it("reads the project's initial zoom until a device preference exists", () => {
    expect(readSceneMapViewZoom("/games/one.gba-project", 0.75)).toBe(0.75);
  });

  it("persists navigation per project on the device", () => {
    writeSceneMapViewZoom("/games/one.gba-project", 1.25);
    expect(readSceneMapViewZoom("/games/one.gba-project", 0.75)).toBe(1.25);
    expect(readSceneMapViewZoom("/games/two.gba-project", 0.75)).toBe(0.75);
  });

  it("keeps zoom within the supported range", () => {
    writeSceneMapViewZoom("/games/one.gba-project", 100);
    expect(readSceneMapViewZoom("/games/one.gba-project")).toBe(4);
    writeSceneMapViewZoom("/games/one.gba-project", 0);
    expect(readSceneMapViewZoom("/games/one.gba-project")).toBe(0.25);
  });

  it("does not block navigation when preferences cannot be written", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(() => writeSceneMapViewZoom("/games/one.gba-project", 2)).not.toThrow();
  });
});
