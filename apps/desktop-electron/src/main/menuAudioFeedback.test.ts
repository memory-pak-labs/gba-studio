import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeMenuSceneConfig } from "../shared/menuScene.js";
import { bootPreviewRuntimeAtRoom, dispatchPreviewRuntimeAction } from "../shared/previewRuntime.js";
import { buildAssetcAudioPackGeneration } from "../shared/engineProjectExport.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

function projectWithFeedback() {
  const project = JSON.parse(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
  const actionSounds = Object.fromEntries(["navigate", "confirm", "back", "unavailable"].map(action => [action, `test-${action}.wav`]));
  for (const [action, name] of Object.entries(actionSounds)) {
    const id = `test-audio-${action}`;
    project.assets.push({ id, name, kind: "SFX", metadata: { source: `Assets/audio/${name}` } });
    project.audioItems.push({ id, name, exportID: id.replaceAll("-", "_"), kind: "SFX", format: "WAV", sourceAssetID: id, volume: 65, loops: false });
  }
  for (const collection of [project.rooms, project.scenas]) {
    const title = collection.find((scene: { name: string }) => scene.name === "titulo");
    title.runtime.config.screens.find((screen: { id: string }) => screen.id === "title_options").actionSounds = actionSounds;
  }
  return { project, actionSounds };
}

describe("authored menu audio feedback", () => {
  it("preserves feedback when normalizing regular and embedded screens", () => {
    const actionSounds = { navigate: "soft.wav", confirm: "yes.wav", back: "back.wav", unavailable: "no.wav" };
    const normalized = normalizeMenuSceneConfig({ screenType: "menu", actionSounds, screens: [{ id: "options", screenType: "menu", actionSounds }] });
    expect(normalized.actionSounds).toEqual(actionSounds);
    expect(normalized.screens?.[0]?.actionSounds).toEqual(actionSounds);
    expect(normalizeMenuSceneConfig({ screenType: "menu" }).actionSounds).toBeUndefined();
  });

  it("exports all four cues with real PCM indices, quiet volume and the required capability", () => {
    const { project } = projectWithFeedback();
    const pcm = buildAssetcAudioPackGeneration(project)!.document.pcm;
    const exported = buildEngineExportProjectContract(project);
    const screen = exported.menu_project!.screens.find(screen => screen.name === "title_options")!;
    for (const action of ["navigate", "confirm", "back", "unavailable"] as const) {
      expect(screen.audio_feedback?.[action]).toEqual({ pcm: pcm.findIndex(asset => asset.name === `test_audio_${action}`), volume: 10, priority: 8 });
    }
    expect(exported.requires.features).toContain("menu_audio_feedback");
  });

  it("plays navigation, refusal and back without selecting a save that does not exist", () => {
    const { project, actionSounds } = projectWithFeedback();
    let state = bootPreviewRuntimeAtRoom(project, "titulo");
    state = dispatchPreviewRuntimeAction(state, "start");
    state = dispatchPreviewRuntimeAction(state, "right");
    expect(state.sceneMenu.selectedIndex).toBe(1);
    expect(state.activeSfx).toBe(actionSounds.navigate);
    expect(state.audioMix.lastPcmSfx).toEqual({ volume: 10, priority: 8 });
    state = dispatchPreviewRuntimeAction(state, "action");
    expect(state.sceneMenu.screenID).toBe("title_options");
    expect(state.activeSfx).toBe(actionSounds.unavailable);
    state = dispatchPreviewRuntimeAction(state, "back");
    expect(state.sceneMenu.screenID).toBe("title");
    expect(state.activeSfx).toBe(actionSounds.back);
  });
});
