import type { GBAProjectData } from "../shared/projectFile.js";

export function nativeEventFixture(commands: string[]): GBAProjectData {
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
