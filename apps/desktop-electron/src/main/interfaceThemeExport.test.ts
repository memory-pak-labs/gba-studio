import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import { DEFAULT_HUD_PRESET } from "../shared/hudPresets.js";

function fixture() {
  const p: GBAProjectData = { assets: [], assetGroups: [], animations: [], animationStates: [], spriteReferenceImages: [], audioItems: [], events: [] };
  p.scenas = [{ id: "port", name: "porto", sceneType: "topdown", width: 30, height: 20, hudPresetId: "hud" },
    { id: "other", name: "outra", sceneType: "topdown", width: 30, height: 20, interfaceThemeId: "story" }];
  p.assets = ["sea", "story", "own"].map(name => ({ id: name, name: `${name}.png`, kind: "UI", metadata: { source: `Assets/ui/${name}.png`, width: 24, height: 24 } }));
  p.settings = { general: { gameTitle: "Themes", startScene: "porto", startSceneType: "topdown", exportFolder: "build" },
    build: { romFileName: "themes.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
    preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
    audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
    save: { saveType: "sram", slots: 3, autoSave: true },
    debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false },
    hudPresets: [{ ...DEFAULT_HUD_PRESET, id: "hud", backgroundImage: "own.png" }],
    interfaceThemes: { defaultThemeId: "story", sceneTypeThemeIds: { topdown: "sea" }, themes: [
      { id: "sea", name: "Mar", hudImage: "sea.png", boxImage: "sea.png" },
      { id: "story", name: "História", hudImage: "story.png", boxImage: "story.png" }
    ] } };
  return p;
}
describe("interface theme export", () => {
  it("exports per-scene skins with explicit HUD images taking precedence, without enabling extra HUDs", () => {
    const ui = buildEngineExportProjectContract(fixture()).topdown_project?.dialogue_ui;
    expect(ui?.box_skin).toBe("assets/ui/story.png");
    expect(ui?.scene_skins).toEqual([
      { scene_name: "porto", box_skin: "assets/ui/sea.png", hud_skin: "assets/ui/own.png" },
      { scene_name: "outra", box_skin: "assets/ui/story.png", hud_skin: "assets/ui/story.png" }
    ]);
    expect(ui?.hud_scene_bindings).toEqual([{ scene_name: "porto", preset_id: "hud" }]);
  });
  it("blocks an unresolved theme skin instead of silently exporting another appearance", () => {
    const p = fixture();
    p.assets = [];
    expect(() => buildEngineExportProjectContract(p)).toThrow(/moldura|skin/i);
  });
});
