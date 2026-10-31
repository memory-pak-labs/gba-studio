import { describe, expect, it } from "vitest";
import { parseVisibilityPreset } from "./visibilityPresets.js";
import { createBlankProjectData } from "./newProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent, tickPreviewRuntime } from "./previewRuntime.js";

describe("lantern and reveal presets", () => {
  it("exports a circular lantern only when requested and requires a round diameter", () => {
    expect(parseVisibilityPreset("lantern player 120 120 58 3600 circle".split(" "))).toMatchObject({ shape: "circle", width: 120, height: 120 });
    for (const command of ["lantern player 120 80 58 3600 circle", "lantern player 120 120 58 3600 diamond"])
      expect(() => parseVisibilityPreset(command.split(" "))).toThrow();
    const data = createBlankProjectData({ name: "Round lantern", sceneType: "topdown" });
    data.events = [{ id: "light", name: "light", command: "lantern player 120 120 58 3600 circle" }];
    expect(runPreviewRuntimeEvent(createPreviewRuntime(data), "light").visibility).toMatchObject({ shape: "circle", remainingFrames: 3600 });
  });
  it("validates actor, area, darkness and duration", () => {
    expect(parseVisibilityPreset("lantern player 80 64 75 180".split(" "))).toEqual({ effect: "lantern", actor: "player", width: 80, height: 64, intensity: 75, frames: 180 });
    for (const command of ["lantern player 241 64 75 180", "reveal_area player 8 0 100 30", "lantern player 80 64 101 180", "lantern player 80 64 75 -1"]) expect(() => parseVisibilityPreset(command.split(" "))).toThrow();
  });
  it("keeps visibility separate from a visual effect and expires it in preview", () => {
    const data = createBlankProjectData({ name: "Visibility", sceneType: "topdown" });
    data.events = [{ id: "light", name: "light", steps: [{ command: "visual_effect mask all 30 100" }, { command: "lantern player 80 64 75 180" }] }];
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "light");
    expect(state.visualEffect?.effect).toBe("mask");
    expect(state.visibility).toMatchObject({ actor: "player", width: 80, height: 64, intensity: 75, remainingFrames: 180 });
    expect(tickPreviewRuntime(state, 3100).visibility).toBeNull();
  });
  it("reports a missing actor in preview without interrupting the editor", () => {
    const data = createBlankProjectData({ name: "Missing actor", sceneType: "topdown" });
    data.events = [{ id: "light", name: "light", command: "lantern Missing 80 64 75 180" }];
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "light");
    expect(state.visibility).toBeNull();
    expect(state.eventLog.at(-1)).toMatchObject({ result: "skipped", detail: "Ator de visibilidade inexistente: Missing" });
  });
});
