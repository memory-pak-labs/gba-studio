import { describe, expect, it } from "vitest";
import type { GBAProjectData } from "./projectFile.js";
import { deriveProjectHealthReport } from "./projectHealth.js";

function projectData(overrides: Record<string, unknown> = {}): GBAProjectData {
  return {
    schemaVersion: 1,
    name: "Projeto Saúde",
    assets: [],
    assetGroups: [],
    scenas: [{ id: "porto", name: "Porto", width: 30, height: 20, sceneType: "topdown" }],
    rooms: [{ id: "porto", name: "Porto", width: 30, height: 20, sceneType: "topdown" }],
    actors: [],
    triggers: [],
    dialogues: [],
    animations: [],
    animationStates: [],
    spriteReferenceImages: [],
    events: [],
    audioItems: [],
    settings: {
      general: { gameTitle: "Projeto Saúde", startScene: "Porto", exportFolder: "build" },
      build: { romFileName: "projeto-saude.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
      preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
      audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100, enablePsgChannels: true },
      save: { saveType: "sram", slots: 3, autoSave: true },
      debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
    },
    ...overrides
  };
}

describe("project health report", () => {
  it("summarizes scene capabilities and keeps a valid project exportable", () => {
    const report = deriveProjectHealthReport(projectData());

    expect(report.status).toBe("ready");
    expect(report.exportReady).toBe(true);
    expect(report.scenes).toEqual([
      expect.objectContaining({
        sceneName: "Porto",
        sceneType: "topdown",
        featureModules: expect.arrayContaining(["movement", "quests", "shop"]),
        previewMode: "map"
      })
    ]);
    expect(report.scenes[0]?.capabilityManifest.capabilities
      .filter((capability) => capability.status.enabled)).toEqual([]);
    expect(report.contract.ok).toBe(true);
  });

  it("inclui o preflight completo por cena sem habilitar capabilities implícitas", () => {
    const report = deriveProjectHealthReport(projectData({
      scenas: [{
        id: "fight",
        name: "Arena",
        width: 40,
        height: 20,
        sceneType: "luta",
        runtime: { type: "luta", config: {} }
      }]
    }));

    expect(report.scenes[0]?.preflight).toMatchObject({
      profileId: "luta",
      perspective: { orientation: "side" },
      collision: { independentOfArt: true },
      enabledCapabilities: [],
      checklist: expect.arrayContaining([
        expect.objectContaining({ id: "perspective" }),
        expect.objectContaining({ id: "collision" }),
        expect.objectContaining({ id: "verification" })
      ])
    });
  });

  it("reports unknown and incompatible scene modules without silently dropping them", () => {
    const report = deriveProjectHealthReport(projectData({
      scenas: [{
        id: "arena",
        name: "Arena",
        width: 30,
        height: 20,
        sceneType: "platformer",
        runtime: {
          type: "platformer",
          config: {
            modules: [
              { id: "shop", enabled: true, settings: {} },
              { id: "unknown_feature", enabled: true, settings: {} }
            ]
          }
        }
      }]
    }));

    expect(report.status).toBe("blocked");
    expect(report.exportReady).toBe(false);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scene.module.incompatible", scope: "scene", targetName: "Arena" }),
      expect.objectContaining({ code: "scene.module.unknown", scope: "scene", targetName: "Arena" })
    ]));
  });

  it("reports scene budget overflow and missing HUD bindings", () => {
    const report = deriveProjectHealthReport(projectData({
      scenas: [{
        id: "dungeon",
        name: "Dungeon",
        width: 30,
        height: 20,
        sceneType: "dungeonCrawler",
        hudPresetId: "hud-does-not-exist",
        runtime: {
          type: "dungeonCrawler",
          config: {
            budget: { bgTiles: 9999 }
          }
        }
      }]
    }));

    expect(report.status).toBe("blocked");
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "scene.budget.exceeded", targetName: "Dungeon" }),
      expect.objectContaining({ code: "hud.binding.missing", workspace: "Editor", targetName: "Dungeon" })
    ]));
  });

  it("keeps estimated asset pressure advisory until the compiler confirms an overflow", () => {
    const largeProject = projectData();
    const largeTilemap = Array.from({ length: 900 }, (_, index) => index + 1);
    const largeScenes = largeProject.scenas as Array<Record<string, unknown>>;
    const largeRooms = largeProject.rooms as Array<Record<string, unknown>>;
    largeScenes[0].height = 30;
    largeRooms[0].height = 30;
    largeScenes[0].tilemap = largeTilemap;
    largeRooms[0].tilemap = largeTilemap;
    const estimatedOverflow = deriveProjectHealthReport(largeProject);

    expect(estimatedOverflow.exportReady).toBe(true);
    expect(estimatedOverflow.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "asset.budget.blocked", severity: "warning", targetName: "Porto" })
    ]));

    const compilerOverflow = deriveProjectHealthReport(projectData(), {
      assetPackReport: {
        schema: 1,
        production_summary: { ready_for_large_project: false, blocking_overflow_count: 1 }
      }
    });

    expect(compilerOverflow.exportReady).toBe(false);
    expect(compilerOverflow.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "asset.budget.blocked", severity: "error" })
    ]));
  });

  it("routes high sprite VRAM pressure to the Sprites workspace without blocking an estimate", () => {
    const report = deriveProjectHealthReport(projectData({
      assets: [{
        id: "asset-boss",
        name: "boss.png",
        kind: "Sprite",
        metadata: { source: "Assets/sprites/boss.png" }
      }],
      animations: [{
        id: "animation-boss-heavy",
        name: "boss_heavy",
        spriteSheet: "boss.png",
        frameWidth: 64,
        frameHeight: 64,
        frameCount: 20,
        colorMode: "4bpp",
        frames: Array.from({ length: 20 }, () => ({ width: 64, height: 64, tiles: [] }))
      }],
      animationStates: [{
        id: "state-boss-heavy",
        name: "idle",
        spriteSheet: "boss.png",
        animationType: "fixed",
        mirrorLeftFromRight: false,
        animationIDs: ["animation-boss-heavy"]
      }]
    }));

    expect(report.exportReady).toBe(true);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({
        code: "asset.sprite_vram",
        severity: "warning",
        workspace: "Sprites",
        targetName: "boss_heavy",
        fixAction: "open_sprites"
      })
    ]));
  });

  it("surfaces engine blockers and routes event problems to Editor", () => {
    const report = deriveProjectHealthReport(projectData({
      events: [{ id: "event-1", name: "Abrir porta", command: "missing-command" }]
    }), {
      engine: { ok: false, blockers: [{ id: "engine-pack", message: "Engine Pack ausente." }] }
    });

    expect(report.exportReady).toBe(false);
    expect(report.diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "engine.blocked", scope: "runtime", workspace: "Exportar" }),
      expect.objectContaining({ scope: "runtime", workspace: "Editor", fixAction: "open_editor" })
    ]));
  });
});
