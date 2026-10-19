/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { readSceneMapViewZoom, writeSceneMapViewZoom, readSceneMapViewMode, writeSceneMapViewMode, readSceneDiagramPositions, writeSceneDiagramPositions } from "./sceneMapViewPreferences.js";

describe("scene map navigation preferences", () => {
  afterEach(() => { window.localStorage.clear(); vi.restoreAllMocks(); });

  it("restores diagram card positions independently for each saved project", () => {
    writeSceneDiagramPositions("/one.gba-project", { porto: { x: 321, y: 456 } });
    expect(readSceneDiagramPositions("/one.gba-project")).toEqual({ porto: { x: 321, y: 456 } });
    expect(readSceneDiagramPositions("/two.gba-project")).toEqual({});
    writeSceneDiagramPositions("/one.gba-project", {});
    expect(readSceneDiagramPositions("/one.gba-project")).toEqual({});
  });

  it("rejects malformed diagram coordinates without blocking project opening", () => {
    const key="gba-studio:scene-diagram-positions:/one";
    window.localStorage.setItem(key,'{"valid":{"x":10.4,"y":-2},"bad":{"x":"40","y":2},"": {"x":1,"y":2}}');
    expect(readSceneDiagramPositions("/one")).toEqual({valid:{x:10,y:0}});
    window.localStorage.setItem(key,'broken');
    expect(readSceneDiagramPositions("/one")).toEqual({});
  });

  it("keeps diagram navigation usable when no saved path or device storage exists", () => {
    writeSceneDiagramPositions(undefined,{porto:{x:1,y:2}});
    expect(readSceneDiagramPositions(undefined)).toEqual({});
    vi.spyOn(window.localStorage,"setItem").mockImplementation(()=>{throw new Error("full");});
    expect(()=>writeSceneDiagramPositions("/one",{porto:{x:1,y:2}})).not.toThrow();
    vi.spyOn(window.localStorage,"getItem").mockImplementation(()=>{throw new Error("blocked");});
    expect(readSceneDiagramPositions("/one")).toEqual({});
  });

  it("remembers the overview mode per project and defaults to previews", () => {
    expect(readSceneMapViewMode("/one")).toBe("preview");
    writeSceneMapViewMode("/one", "diagram");
    expect(readSceneMapViewMode("/one")).toBe("diagram");
    expect(readSceneMapViewMode("/two")).toBe("preview");
    writeSceneMapViewMode("/one", "preview");
    expect(readSceneMapViewMode("/one")).toBe("preview");
  });

  it("keeps the overview usable when device preferences are unavailable", () => {
    vi.spyOn(window.localStorage, "setItem").mockImplementation(() => { throw new Error("full"); });
    expect(() => writeSceneMapViewMode("/one", "diagram")).not.toThrow();
    vi.spyOn(window.localStorage, "getItem").mockImplementation(() => { throw new Error("blocked"); });
    expect(readSceneMapViewMode("/one")).toBe("preview");
  });

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
