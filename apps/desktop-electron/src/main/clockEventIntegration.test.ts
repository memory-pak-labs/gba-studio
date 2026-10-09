import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent, tickPreviewRuntime } from "../shared/previewRuntime.js";
import type { GBAProjectData } from "../shared/projectFile.js";

function project(commands: string[]): GBAProjectData {
  return {
    assets: [], assetGroups: [], animations: [], animationStates: [], spriteReferenceImages: [], audioItems: [],
    scenas: [{ name: "start", sceneType: "topdown", width: 30, height: 20 }],
    events: [{ id: "boot", name: "boot", category: "Cena", sceneName: "start", steps: commands.map(command => ({ command, isEnabled: true })) }],
    settings: {
      general: { gameTitle: "Clock", startScene: "start", startSceneType: "topdown", exportFolder: "build" },
      build: { romFileName: "clock.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
      preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
      audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
      save: { saveType: "sram", slots: 3, autoSave: true },
      debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
    }
  };
}
describe("authored clock events", () => {
  it("exports clock cadence and HUD visibility independently from RTC", () => {
    const result = prepareEngineProjectExport(project(["start_game_clock 10 3 hud", "advance_time -20"]));
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project!.scripts[0]!.script).toEqual([
      { op: "start_game_clock", minutes_per_tick: 10, frames_per_tick: 3, hud: true }, { op: "advance_time", minutes: -20 }
    ]);
  });
  it("simulates frame cadence and day rollover", () => {
    const data = project(["start_game_clock 10 3 hud", "advance_time 1430"]);
    let state = runPreviewRuntimeEvent(createPreviewRuntime(data), "boot");
    state = tickPreviewRuntime(state, 2 * 1000 / 60);
    expect(state.hud.gameClock?.currentMinute).toBe(1430);
    state = tickPreviewRuntime(state, 1000 / 60);
    expect(state.hud.gameClock?.currentMinute).toBe(0);
    expect(state.rtc).toBeNull();
  });
  it.each(["start_game_clock 0 3 hud", "start_game_clock 10 0 hud", "start_game_clock 10 3 nope", "advance_time nope"])("rejects invalid cadence: %s", command => {
    expect(prepareEngineProjectExport(project([command])).error).toBeTruthy();
  });
});
