import { describe, expect, it } from "vitest";
import { deriveProjectContractDiagnostics } from "./projectContractDiagnostics.js";

describe("project contract diagnostics", () => {
  it("summarizes valid projects as ready for export", () => {
    const diagnostics = deriveProjectContractDiagnostics({
      assets: [],
      assetGroups: [],
      scenas: [{ name: "start", width: 20, height: 18 }],
      animations: [],
      animationStates: [],
      spriteReferenceImages: [],
      audioItems: [],
      events: [],
      settings: {
        general: { gameTitle: "Valid", startScene: "start", exportFolder: "build" },
        build: { romFileName: "valid.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    expect(diagnostics).toEqual({
      ok: true,
      issueCount: 0,
      validatorLabels: [],
      validatorCounts: [],
      summary: "Contrato de migracao pronto para export.",
      detail: "Arquivos, Cenas, Sprites, Eventos, Áudio e Ajustes passaram no gate compartilhado."
    });
  });

  it("accepts current sprite geometry and frame event schema", () => {
    const diagnostics = deriveProjectContractDiagnostics({
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite" }],
      assetGroups: [],
      scenas: [{ name: "start", width: 20, height: 18 }],
      animations: [
        {
          id: "anim-hero",
          name: "hero_idle",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          fps: 8,
          loops: true,
          frameCount: 2,
          originX: 8,
          originY: 24,
          hitboxX: -4,
          hitboxY: -16,
          hitboxWidth: 12,
          hitboxHeight: 16,
          frameEvents: [
            [{ type: "event", value: "hero_idle_frame_1" }],
            []
          ],
          frames: [
            { width: 16, height: 32, originX: 8, originY: 24, tiles: [] },
            { width: 16, height: 32, originX: 8, originY: 24, tiles: [] }
          ]
        }
      ],
      animationStates: [{
        id: "state-idle",
        name: "idle",
        spriteSheet: "hero.png",
        animationType: "fixed",
        mirrorLeftFromRight: false,
        animationIDs: ["anim-hero"]
      }],
      spriteReferenceImages: [],
      audioItems: [],
      events: [{ id: "event-frame", name: "hero_idle_frame_1", category: "Sprite", command: "noop" }],
      settings: {
        general: { gameTitle: "Valid", startScene: "start", exportFolder: "build" },
        build: { romFileName: "valid.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.validatorLabels).toEqual([]);
  });

  it("rejects malformed sprite frame event schema", () => {
    const diagnostics = deriveProjectContractDiagnostics({
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite" }],
      scenas: [{ name: "start", width: 20, height: 18 }],
      animations: [
        {
          id: "anim-hero",
          name: "hero_idle",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          frameEvents: [[{ type: "", value: "" }]]
        }
      ],
      animationStates: [],
      spriteReferenceImages: [],
      audioItems: [],
      events: [],
      settings: {
        general: { gameTitle: "Invalid", startScene: "start", exportFolder: "build" },
        build: { romFileName: "invalid.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.validatorCounts).toContainEqual({ validator: "sprites", count: 1 });
  });

  it("summarizes invalid projects by failing validator", () => {
    const diagnostics = deriveProjectContractDiagnostics({
      assets: [{ id: "", name: "bad.png", kind: "Sprite" }],
      scenas: [{ name: "start", width: 20, height: 18 }],
      events: [{ name: "bad", category: "Cena", command: "change_scene missing" }],
      settings: {}
    });

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.issueCount).toBeGreaterThan(0);
    expect(diagnostics.validatorLabels).toEqual(["workspace", "files", "events", "settings"]);
    expect(diagnostics.validatorCounts).toEqual([
      { validator: "workspace", count: 2 },
      { validator: "files", count: 1 },
      { validator: "events", count: 1 },
      { validator: "settings", count: 6 }
    ]);
    expect(diagnostics.summary).toBe("Contrato de migracao com pendencias.");
    expect(diagnostics.detail).toBe("Pendencias por validador: workspace 2, files 1, events 1, settings 6.");
  });

  it("includes broken room connections in migration diagnostics", () => {
    const diagnostics = deriveProjectContractDiagnostics({
      scenas: [
        { name: "overworld", width: 10, height: 8 },
        { name: "shop", width: 10, height: 8 }
      ],
      editorState: {
        scenaConnections: [
          { from: "overworld", to: "missing", eventName: "door" },
          { from: "shop", to: "shop", eventName: "loop" }
        ]
      },
      assets: [],
      animations: [],
      animationStates: [],
      spriteReferenceImages: [],
      audioItems: [],
      events: [],
      settings: {
        general: { gameTitle: "Broken links", startScene: "overworld", exportFolder: "build" },
        build: { romFileName: "broken.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.validatorCounts).toContainEqual({ validator: "roomConnections", count: 2 });
    expect(diagnostics.detail).toBe("Pendencias por validador: roomConnections 2.");
  });

  it("includes broken room references in migration diagnostics", () => {
    const diagnostics = deriveProjectContractDiagnostics({
      scenas: [
        {
          name: "overworld",
          width: 10,
          height: 8,
          music: "missing.mod",
          backgroundAssetName: "missing_tiles.png",
          playerActorName: "Ghost"
        }
      ],
      assets: [],
      animations: [],
      animationStates: [],
      spriteReferenceImages: [],
      audioItems: [],
      actors: [],
      events: [],
      settings: {
        general: { gameTitle: "Broken refs", startScene: "overworld", exportFolder: "build" },
        build: { romFileName: "broken.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.validatorCounts).toContainEqual({ validator: "roomReferences", count: 1 });
    expect(diagnostics.detail).toBe("Pendencias por validador: roomReferences 1.");
  });

  it("aceita animationType directional_view no estado de sprite", () => {
    const diagnostics = deriveProjectContractDiagnostics({
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite" }],
      scenas: [{ name: "start", width: 20, height: 18 }],
      animations: [{
        id: "anim-hero",
        name: "idle-down",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 16
      }],
      animationStates: [{
        id: "state-idle",
        name: "idle",
        spriteSheet: "hero.png",
        animationType: "directional_view",
        mirrorLeftFromRight: false,
        animationIDs: ["anim-hero"]
      }],
      spriteReferenceImages: [],
      audioItems: [],
      events: [],
      settings: {
        general: { gameTitle: "Directional", startScene: "start", exportFolder: "build" },
        build: { romFileName: "directional.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    expect(diagnostics.ok).toBe(true);
    expect(diagnostics.validatorLabels).toEqual([]);
  });

  it("blocks export diagnostics when a typed Racing scene selects an entity outside the scene", () => {
    const diagnostics = deriveProjectContractDiagnostics({
      assets: [],
      assetGroups: [],
      scenas: [{ name: "track", width: 30, height: 20, sceneType: "racing", playerActorName: "Lia Car" }],
      animations: [],
      animationStates: [],
      spriteReferenceImages: [],
      audioItems: [],
      events: [],
      settings: {
        general: { gameTitle: "Racing", startScene: "track", exportFolder: "build" },
        build: { romFileName: "racing.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    });

    expect(diagnostics.ok).toBe(false);
    expect(diagnostics.validatorCounts).toContainEqual({ validator: "controlledEntities", count: 1 });
  });
});
