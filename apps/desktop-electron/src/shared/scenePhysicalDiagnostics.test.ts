import { describe, expect, it } from "vitest";

import type { GBAProjectData } from "./projectFile.js";
import { SCENE_PHYSICAL_METRIC_IDS, deriveScenePhysicalDiagnostics } from "./scenePhysicalDiagnostics.js";
import { scenePreflightProfile } from "./scenePreflight.js";
import { sceneTypeCapabilities } from "./sceneFeatureModules.js";

function projectData(): GBAProjectData {
  return {
    scenas: [{ id: "arena", name: "Arena", sceneType: "shmup", width: 30, height: 20, tilemap: [1, 2, 3, 3] }],
    actors: [{ id: "enemy", name: "Enemy", roomName: "Arena", spriteSheet: "enemy.png" }],
    triggers: [{ id: "trigger", name: "Spawn", roomName: "Arena" }],
    events: [{ id: "event", name: "spawn", roomName: "Arena", steps: [{ command: "spawn" }, { command: "wait" }] }],
    animations: [{ name: "enemy", spriteSheet: "enemy.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }],
    audioItems: [{ name: "laser.wav", kind: "SFX", byteLength: 4096 }]
  };
}

describe("scene physical diagnostics", () => {
  it("keeps editor estimate, exporter plan, runtime measurement, safe limit, and critical overflow separate", () => {
    const diagnostics = deriveScenePhysicalDiagnostics(projectData(), "Arena", {
      planned: { bgTiles: 40, objTiles: 8, oam: 4, eventBytes: 96, audioBytes: 4096, dmaBytes: 1536 },
      measured: { cpuWorkTicks: 4200, vblankTicks: 2100, dmaBytes: 512 }
    });

    expect(diagnostics.metrics.map((metric) => metric.id)).toEqual([...SCENE_PHYSICAL_METRIC_IDS]);
    expect(diagnostics.metrics.find((metric) => metric.id === "bgTiles")).toMatchObject({
      estimate: 3,
      planned: 40,
      measured: null,
      safeLimit: scenePreflightProfile("shmup").budget.bgTiles,
      criticalOverflow: false
    });
    expect(diagnostics.metrics.find((metric) => metric.id === "cpuWorkTicks")).toMatchObject({
      estimate: expect.any(Number),
      planned: null,
      measured: 4200,
      safeLimit: expect.any(Number),
      criticalOverflow: false
    });
    expect(diagnostics.metrics.find((metric) => metric.id === "vblankTicks")).toMatchObject({
      estimate: null,
      planned: null,
      measured: 2100
    });
    expect(diagnostics.metrics.find((metric) => metric.id === "dmaBytes")).toMatchObject({
      planned: 1536,
      measured: 512
    });
    expect(diagnostics.criticalOverflow).toBe(false);

    const overflow = deriveScenePhysicalDiagnostics(projectData(), "Arena", {
      measured: { cpuWorkTicks: 5000 }
    });
    expect(overflow.criticalOverflow).toBe(true);
    expect(overflow.metrics.find((metric) => metric.id === "cpuWorkTicks")).toMatchObject({
      criticalOverflow: true,
      overflow: 630
    });
  });

  it("resolves the exporter plan from the asset pack scene group name", () => {
    const diagnostics = deriveScenePhysicalDiagnostics(projectData(), "Arena", {
      assetPackReport: {
        schema: 11,
        room_pressure_report: [{
          name: "scene_arena",
          asset_count: 1,
          assets: ["arena-bg"],
          resources: {
            bg_tiles: { requested: 48, capacity: 896, percent_of_pool: 5.4 },
            obj_tiles: { requested: 12, capacity: 1024, percent_of_pool: 1.2 },
            oam_sprites: { requested: 4, capacity: 128, percent_of_pool: 3.1 },
            bg_palette_colors: { requested: 16, capacity: 256, percent_of_pool: 6.3 },
            obj_palette_colors: { requested: 16, capacity: 256, percent_of_pool: 6.3 }
          }
        }]
      }
    });

    expect(diagnostics.metrics.find((metric) => metric.id === "bgTiles")?.planned).toBe(48);
    expect(diagnostics.metrics.find((metric) => metric.id === "objTiles")?.planned).toBe(12);
    expect(diagnostics.metrics.find((metric) => metric.id === "paletteColors")?.planned).toBe(32);
  });

  it("isolates editor audio estimate to the active scene references", () => {
    const data = {
      scenas: [
        { id: "arena-id", name: "Arena", sceneType: "luta", music: "arena_theme" },
        { id: "menu-id", name: "Menu", sceneType: "menu", music: "menu_theme" }
      ],
      events: [
        {
          id: "arena-event",
          name: "arena_audio",
          roomName: "Arena",
          steps: [
            { command: "play_sfx arena_hit" },
            { command: "show_dialogue arena_dialogue" }
          ]
        },
        {
          id: "menu-event",
          name: "menu_audio",
          roomName: "Menu",
          steps: [{ command: "play_sfx menu_hit" }]
        }
      ],
      dialogues: [{
        key: "arena_dialogue",
        roomName: "Arena",
        textSound: "arena_text",
        confirmSound: "arena_confirm"
      }],
      audioItems: [
        { id: "arena-theme-id", name: "arena_theme", byteLength: 1024 },
        { id: "arena-hit-id", name: "arena_hit", byteLength: 2048 },
        { id: "arena-text-id", name: "arena_text", byteLength: 256 },
        { id: "arena-confirm-id", name: "arena_confirm", byteLength: 128 },
        { id: "arena-prefetch-id", name: "arena_prefetch", assignedScene: "Arena", byteLength: 512 },
        { id: "menu-theme-id", name: "menu_theme", byteLength: 4096 },
        { id: "menu-hit-id", name: "menu_hit", byteLength: 8192 },
        { id: "global-unused-id", name: "global_unused", assignedScene: "Global", byteLength: 16384 }
      ]
    } as GBAProjectData;

    const arena = deriveScenePhysicalDiagnostics(data, "Arena");
    const menu = deriveScenePhysicalDiagnostics(data, "Menu");

    expect(arena.metrics.find((metric) => metric.id === "audioBytes")?.estimate).toBe(3968);
    expect(menu.metrics.find((metric) => metric.id === "audioBytes")?.estimate).toBe(12288);
  });

  it("estimates physical bytes from the compiled composed audio structures", () => {
    const data = {
      scenas: [{ id: "arena-id", name: "Arena", sceneType: "shmup", music: "composed_theme" }],
      audioItems: [
        {
          id: "theme-id",
          name: "composed_theme",
          kind: "Musica",
          patterns: [{
            id: "theme-pattern",
            steps: 2,
            channels: [{ id: "lead", type: "pulse1", notes: ["C4", "E4"] }]
          }],
          patternOrder: ["theme-pattern"]
        },
        {
          id: "hit-id",
          name: "composed_hit",
          kind: "SFX",
          assignedScene: "Arena",
          channels: [{ id: "noise", type: "noise", notes: ["K", "K"] }]
        }
      ]
    } as GBAProjectData;

    const diagnostics = deriveScenePhysicalDiagnostics(data, "Arena");

    expect(diagnostics.metrics.find((metric) => metric.id === "audioBytes")?.estimate).toBe(97);
  });

  it("uses the exporter physical audio plan for the planned scene value", () => {
    const data = {
      scenas: [{ id: "arena-id", name: "Arena", sceneType: "shmup", music: "composed_theme" }],
      audioItems: [{
        id: "theme-id",
        name: "composed_theme",
        kind: "Musica",
        patterns: [{
          id: "theme-pattern",
          steps: 2,
          channels: [{ id: "lead", type: "pulse1", notes: ["C4", "E4"] }]
        }],
        patternOrder: ["theme-pattern"]
      }]
    } as GBAProjectData;

    const diagnostics = deriveScenePhysicalDiagnostics(data, "Arena", {
      assetPackReport: {
        schema: 11,
        physical_budget: {
          schema: 1,
          audio_bytes_by_item: { "theme-id": 69 }
        }
      }
    });

    expect(diagnostics.metrics.find((metric) => metric.id === "audioBytes")).toMatchObject({
      estimate: 69,
      planned: 69
    });
  });

  it("includes only enabled advanced capabilities and the physical metatile expansion in the plan", () => {
    const diagnostics = deriveScenePhysicalDiagnostics({
      scenas: [{
        id: "room",
        name: "Room",
        sceneType: "topdown",
        width: 4,
        height: 2,
        tilemap: [],
        runtime: {
          type: "topdown",
          config: {
            capabilities: [
              { id: "metatiles", enabled: true, settings: { blockSize: "2x2" } },
              { id: "save_ui_profile", enabled: false, settings: {} }
            ],
            metatiles: {
              enabled: true,
              contract: "gba-authored-metatile-2x2-v1",
              fallback: "error",
              library: [{ id: "grass", label: "Grama", tiles: [10, 11, 12, 13], semantic: { collision: "free" } }],
              map: [0, 0]
            }
          }
        }
      }]
    } as GBAProjectData, "Room");

    expect(diagnostics.metrics.find((metric) => metric.id === "bgTiles")).toMatchObject({
      estimate: 4,
      planned: 4
    });
    expect(diagnostics.metrics.find((metric) => metric.id === "vramBytes")?.planned).toBe(4 * 32);
    expect(diagnostics.metrics.find((metric) => metric.id === "objTiles")?.planned).toBe(0);
  });

  it("plans enabled tactical capabilities separately from the editor estimate", () => {
    const diagnostics = deriveScenePhysicalDiagnostics({
      scenas: [{
        id: "tactical-room",
        name: "Tactical room",
        sceneType: "isometric",
        width: 12,
        height: 8,
        tilemap: [1, 2, 3, 4],
        collisionTypes: Array.from({ length: 96 }, () => "free"),
        runtime: {
          type: "isometric",
          config: {
            gameplayMode: "tactical",
            tacticalCapabilities: [
              { id: "tactical_surface", enabled: true, settings: {} },
              { id: "tactical_grid_overlay", enabled: true, settings: {} },
              { id: "tactical_hud", enabled: true, settings: {} },
              { id: "tactical_units", enabled: true, settings: {} },
              { id: "tactical_props", enabled: true, settings: {} },
              { id: "tactical_feedback", enabled: true, settings: {} },
              { id: "tactical_audio", enabled: true, settings: {} }
            ],
            tacticalPresentation: {
              schema: 1,
              surfaceAsset: "surface.png",
              gridAsset: "grid.png",
              hudLayout: "hud",
              cursorAsset: "cursor.png",
              rangeAsset: "range.png",
              targetAsset: "target.png",
              units: [{ actorId: "nara", sheet: "nara.png" }],
              props: [{ id: "beacon", asset: "beacon.png", kind: "objective" }],
              emotesAsset: "emotes.png",
              feedbackAsset: "feedback.png",
              audio: { music: "theme", cues: { cursor: "cursor-sfx" } }
            }
          }
        }
      }],
      actors: [{ name: "Nara", roomName: "Tactical room", spriteSheet: "nara.png" }],
      animations: [{ name: "nara", spriteSheet: "nara.png", frameWidth: 48, frameHeight: 48, frameCount: 1 }],
      audioItems: [{ name: "theme", kind: "Musica", byteLength: 1024 }]
    } as GBAProjectData, "Tactical room");

    expect(diagnostics.metrics.find((metric) => metric.id === "bgTiles")).toMatchObject({
      planned: expect.any(Number),
      safeLimit: scenePreflightProfile("tacticalGrid").budget.bgTiles
    });
    expect(diagnostics.metrics.find((metric) => metric.id === "objTiles")?.planned).toBeGreaterThan(0);
    expect(diagnostics.metrics.find((metric) => metric.id === "audioBytes")?.estimate).toBe(1024);
    expect(diagnostics.metrics.every((metric) => metric.safeLimit > 0)).toBe(true);
  });

  it("estimates named background and HUD assets while keeping OBJ tiles and OAM independent", () => {
    const diagnostics = deriveScenePhysicalDiagnostics({
      scenas: [{
        id: "arena",
        name: "Arena",
        sceneType: "luta",
        width: 30,
        height: 20,
        tilemap: [],
        backgroundAssetName: "arena.png",
        runtime: { type: "luta", config: { hudAssetName: "hud.png" } }
      }],
      actors: [
        { id: "nara", name: "Nara", roomName: "Arena", spriteSheet: "nara.png", animationName: "idle" },
        { id: "rival", name: "Rival", roomName: "Arena", spriteSheet: "rival.png", animationName: "idle" }
      ],
      animations: [
        { name: "idle", spriteSheet: "other.png", frameWidth: 64, frameHeight: 64 },
        {
          name: "idle",
          spriteSheet: "nara.png",
          frameWidth: 32,
          frameHeight: 64,
          frames: [{ tiles: [{}] }]
        },
        {
          name: "idle",
          spriteSheet: "rival.png",
          frameWidth: 32,
          frameHeight: 64,
          frames: [{ tiles: [{}] }]
        }
      ],
      assets: [
        {
          id: "arena-asset",
          name: "arena.png",
          kind: "Background",
          metadata: { colorMode: "4bpp", tileCount: 600, paletteBankCount: 1 }
        },
        {
          id: "hud-asset",
          name: "hud.png",
          kind: "Background",
          metadata: { colorMode: "4bpp", tileCount: 200, maxVisibleColors: 10 }
        }
      ],
      audioItems: []
    } as GBAProjectData, "Arena");

    expect(diagnostics.metrics.find((metric) => metric.id === "bgTiles")).toMatchObject({
      estimate: 800,
      safeLimit: 896,
      tone: "warning"
    });
    expect(diagnostics.metrics.find((metric) => metric.id === "objTiles")?.estimate).toBe(64);
    expect(diagnostics.metrics.find((metric) => metric.id === "oam")?.estimate).toBe(2);
    expect(diagnostics.metrics.find((metric) => metric.id === "paletteColors")?.estimate).toBe(64);
    expect(diagnostics.metrics.find((metric) => metric.id === "vramBytes")?.estimate).toBe(27_648);
    expect(diagnostics.metrics.find((metric) => metric.id === "dmaBytes")?.estimate).toBe(27_792);
  });

  it("calcula áudio por cena e não soma recursos de outras cenas", () => {
    const diagnostics = deriveScenePhysicalDiagnostics({
      scenas: [{ id: "audio", name: "Audio", sceneType: "shmup", width: 1, height: 1, tilemap: [], music: "theme.wav" }],
      events: [{ roomName: "Audio", command: "play_sfx hit.wav" }],
      audioItems: [
        { name: "theme.wav", byteLength: 4096 },
        { name: "hit.wav", bytes: 2048 },
        { name: "other.wav", byteLength: 8192 }
      ]
    } as GBAProjectData, "Audio");

    expect(diagnostics.metrics.find((metric) => metric.id === "audioBytes")?.estimate).toBe(6144);
    expect(diagnostics.metrics.find((metric) => metric.id === "eventBytes")?.estimate).toBe(12);
  });

  it("usa o limite físico do pacote para luta sem alterar o budget editorial", () => {
    expect(sceneTypeCapabilities("luta").budget).toMatchObject({ bgTiles: 512, objTiles: 192 });
    expect(sceneTypeCapabilities("luta").physicalBudget).toMatchObject({
      bgTiles: 896,
      objTiles: 1024,
      oam: 128,
      vramBytes: 96 * 1024
    });
  });
});
