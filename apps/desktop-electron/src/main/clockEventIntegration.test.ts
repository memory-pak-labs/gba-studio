import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport, tacticalMarkerIndices } from "./exportEngineProject.js";
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
  it.each([0,50])("scales a scene fade by music and master preferences (%i%% master)",master=>{
    const data=project(["set_variable music_preference 50","set_variable master_preference "+master,"fade_audio_volume music 75 30 music_preference master_preference"]);
    data.variables=[{name:"music_preference",initialValue:0},{name:"master_preference",initialValue:0}];
    const result=prepareEngineProjectExport(data);
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project!.scripts[0]!.script[2]).toEqual({op:"fade_audio_volume",channel:"music",volume:11,frames:30,variable:0,other_variable:1});
    const state=runPreviewRuntimeEvent(createPreviewRuntime(data),"boot");
    expect(state.audioMix.fades.music?.target).toBe(master===0?0:3);
    expect(state.audioMix.volumes.music).toBeLessThanOrEqual(master===0?0:4);
  });
  it("shares a single approved marker frame without addressing nonexistent frames", () => {
    expect(tacticalMarkerIndices("marker", "marker", "marker", { marker: 1 })).toEqual({cursor:0,range:0,target:0});
  });
  it("keeps a scene music fade relative to the saved music preference, including mute", () => {
    const data = project(["set_variable music_preference 50", "fade_audio_volume music 75 30 music_preference"]);
    data.variables = [{ id: "music", name: "music_preference", initialValue: 0 }];
    const result = prepareEngineProjectExport(data);
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project!.scripts[0]!.script[1]).toEqual({
      op: "fade_audio_volume", channel: "music", volume: 11, frames: 30, variable: 0
    });
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "boot");
    expect(state.audioMix.fades.music?.target).toBe(6);
    expect(state.audioMix.volumes.music).toBeLessThanOrEqual(8);
  });
  it("binds the game clock to a saved minute variable and resumes its cadence", () => {
    const data = project(["set_variable harbor_minute 1079", "start_game_clock 1 3 hidden harbor_minute"]);
    data.variables = [{ id: "minute", name: "harbor_minute", initialValue: 0 }];
    const result = prepareEngineProjectExport(data);
    expect(result.error).toBeUndefined();
    expect(result.generated!.contract.topdown_project!.scripts[0]!.script[1]).toEqual({
      op: "start_game_clock", minutes_per_tick: 1, frames_per_tick: 3, hud: false, variable: 0
    });
    let state = runPreviewRuntimeEvent(createPreviewRuntime(data), "boot");
    expect(state.hud.gameClock?.currentMinute).toBe(1079);
    state = tickPreviewRuntime(state, 3 * 1000 / 60);
    expect(state.variables.harbor_minute).toBe(1080);
    (data.events as Array<Record<string, unknown>>).push({ id: "resume", name: "resume", steps: [{ command: "start_game_clock 1 3 hidden harbor_minute", isEnabled: true }] });
    state = runPreviewRuntimeEvent(state, "resume");
    expect(state.hud.gameClock?.currentMinute).toBe(1080);
  });
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
