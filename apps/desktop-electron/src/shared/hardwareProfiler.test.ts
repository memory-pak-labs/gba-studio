import { describe, expect, it } from "vitest";

import {
  deriveHardwareProfilerPresentation
} from "./hardwareProfiler.js";
import type { GBAProjectData } from "./projectFile.js";

function profilerProject(): GBAProjectData {
  return {
    settings: {
      debug: {
        showCpuUsage: true,
        showVramUsage: true,
        showOamUsage: true,
        showPaletteUsage: true,
        showRomUsage: true,
        showRamUsage: true
      }
    },
    scena: { id: "room-1", name: "campo" },
    scenas: [{
      id: "room-1",
      name: "campo",
      sceneType: "topdown",
      width: 4,
      height: 4,
      tilemap: [1, 2, 1, 0, 3, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      collision: [true, false, false, false]
    }],
    actors: [{ id: "player", name: "Player", roomName: "campo", spriteSheet: "player.png", x: 1, y: 1 }],
    animations: [{
      id: "player-idle",
      name: "idle",
      spriteSheet: "player.png",
      frameWidth: 16,
      frameHeight: 16,
      frameCount: 2,
      colorMode: "4bpp"
    }],
    triggers: [{ id: "door", name: "door", roomName: "campo", x: 2, y: 2, width: 1, height: 1 }],
    events: [{ id: "boot", name: "boot", commands: ["set_variable story 1"] }],
    variables: [{ id: "story", name: "story", initialValue: 0 }]
  };
}

describe("hardware profiler", () => {
  it("derives the six real GBA budgets for the active scene and honors debug toggles", () => {
    const presentation = deriveHardwareProfilerPresentation(profilerProject(), { romBytes: 524_288 });

    expect(presentation.activeRoomName).toBe("campo");
    expect(presentation.metrics.map((metric) => metric.id)).toEqual([
      "cpu", "vram", "oam", "palette", "rom", "ram"
    ]);
    expect(presentation.metrics.every((metric) => metric.enabled)).toBe(true);
    expect(presentation.metrics.find((metric) => metric.id === "vram")).toMatchObject({
      limit: 96 * 1024,
      source: "estimate"
    });
    expect(presentation.metrics.find((metric) => metric.id === "oam")).toMatchObject({ limit: 128 });
    expect(presentation.metrics.find((metric) => metric.id === "palette")).toMatchObject({ limit: 512 });
    expect(presentation.metrics.find((metric) => metric.id === "rom")).toMatchObject({
      used: 524_288,
      limit: 32 * 1024 * 1024,
      source: "measured"
    });
    expect(presentation.metrics.find((metric) => metric.id === "ram")).toMatchObject({ limit: 288 * 1024 });
  });

  it("merges live Play telemetry into the debugger presentation", () => {
    const presentation = deriveHardwareProfilerPresentation(profilerProject(), {
      telemetry: {
        cpuPercent: 42.5,
        emulationMs: 7.08,
        fps: 59.9,
        frameMs: 16.69,
        presentationFps: 59.9,
        emulationFps: 59.73,
        droppedFrames: 1,
        droppedFrameRatio: 0.0164,
        romBytes: 786_432,
        runtimeState: {
          schema: 2,
          frame: 90,
          currentRoom: 0,
          runtimeKind: 0,
          variables: [3, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
          flagBits: 3,
          player: { x: 80, y: 64, direction: 1 },
          actorCount: 1,
          firstActor: { x: 112, y: 64, direction: 2, visible: true },
          lastMusic: 0,
          lastSfx: 0,
          collision: { currentFlags: 0, currentSlope: 0, seenEffectBits: 0, seenSlopeBits: 0, blockedDirectionBits: 0 },
          triggerEnterCount: 0,
          triggerLeaveCount: 0,
          roomChangeCount: 0,
          timing: {
            cpuWorkTicks: 1200,
            vblankWaitTicks: 240,
            peakCpuWorkTicks: 1600,
            peakVblankWaitTicks: 320,
            missedFrameCount: 0,
            renderSkipCount: 0,
            frameSkipPolicy: 1
          },
          input: { held: 0, pressed: 0, released: 0 }
        }
      }
    });

    expect(presentation.runtime).toEqual({
      emulationMs: 7.08,
      fps: 59.9,
      frameMs: 16.69,
      presentationFps: 59.9,
      emulationFps: 59.73,
      droppedFrames: 1,
      droppedFrameRatio: 0.0164,
      runtimeState: expect.objectContaining({
        currentRoom: 0,
        variables: expect.arrayContaining([3, 1]),
        player: { x: 80, y: 64, direction: 1 }
      })
    });
    expect(presentation.metrics.find((metric) => metric.id === "cpu")).toMatchObject({
      used: 42.5,
      limit: 100,
      source: "measured",
      unit: "percent"
    });
    expect(presentation.metrics.find((metric) => metric.id === "rom")).toMatchObject({
      used: 786_432,
      source: "measured"
    });
  });

  it("profiles the room executed by the ROM instead of the room selected in the editor", () => {
    const project = profilerProject();
    project.scenas = [
      ...project.scenas as Record<string, unknown>[],
      {
        id: "room-2",
        name: "caverna",
        sceneType: "platformer",
        width: 4,
        height: 4,
        tilemap: [1, 2, 3, 4, 5, 6, 7, 8, 0, 0, 0, 0, 0, 0, 0, 0],
        collision: Array(16).fill(false)
      }
    ];
    project.actors = [
      ...project.actors as Record<string, unknown>[],
      { id: "cave-player", name: "Player", roomName: "caverna", spriteSheet: "player.png", x: 1, y: 1 },
      { id: "bat", name: "Bat", roomName: "caverna", spriteSheet: "player.png", x: 2, y: 1 }
    ];
    const telemetry = {
      cpuPercent: 30,
      emulationMs: 5,
      fps: 60,
      frameMs: 16.67,
      presentationFps: 60,
      emulationFps: 60,
      droppedFrames: 0,
      droppedFrameRatio: 0,
      romBytes: 1024,
      runtimeState: {
        schema: 2,
        frame: 120,
        currentRoom: 0,
        runtimeKind: 1,
        variables: Array(16).fill(0),
        flagBits: 0,
        player: { x: 16, y: 16, direction: 1 },
        actorCount: 2,
        firstActor: { x: 32, y: 16, direction: 2, visible: true },
        lastMusic: 0,
        lastSfx: 0,
        collision: { currentFlags: 0, currentSlope: 0, seenEffectBits: 0, seenSlopeBits: 0, blockedDirectionBits: 0 },
        triggerEnterCount: 0,
        triggerLeaveCount: 0,
        roomChangeCount: 1,
        timing: {
          cpuWorkTicks: 500,
          vblankWaitTicks: 100,
          peakCpuWorkTicks: 700,
          peakVblankWaitTicks: 150,
          missedFrameCount: 0,
          renderSkipCount: 0,
          frameSkipPolicy: 1
        },
        input: { held: 0, pressed: 0, released: 0 }
      }
    };

    const presentation = deriveHardwareProfilerPresentation(project, { telemetry });

    expect(presentation.activeRoomName).toBe("caverna");
    expect(presentation.activeRoomType).toBe("platformer");
    expect(presentation.metrics.find((metric) => metric.id === "oam")?.used).toBe(2);
  });

  it("resolve o runtime luta e preserva as métricas físicas medidas da arena", () => {
    const project = profilerProject();
    project.scenas = [
      ...project.scenas as Record<string, unknown>[],
      {
        id: "arena",
        name: "arena_arrancada",
        sceneType: "luta",
        width: 30,
        height: 20,
        tilemap: [],
        backgroundAssetName: "arena.png",
        runtime: { type: "luta", config: { hudAssetName: "hud.png" } }
      }
    ];
    project.actors = [
      ...project.actors as Record<string, unknown>[],
      { id: "nara", name: "Nara", roomName: "arena_arrancada", spriteSheet: "fighter.png", animationName: "idle" }
    ];
    project.animations = [
      ...project.animations as Record<string, unknown>[],
      { id: "fighter-idle", name: "idle", spriteSheet: "fighter.png", frameWidth: 32, frameHeight: 64 }
    ];

    const presentation = deriveHardwareProfilerPresentation(project, {
      telemetry: {
        cpuPercent: 9.5,
        emulationMs: 1.5,
        fps: 60,
        frameMs: 16.67,
        presentationFps: 60,
        emulationFps: 60,
        droppedFrames: 0,
        droppedFrameRatio: 0,
        romBytes: 1024,
        runtimeState: {
          schema: 3,
          frame: 30,
          currentRoom: 0,
          runtimeKind: 12,
          variables: Array(16).fill(0),
          flagBits: 0,
          player: { x: 80, y: 80, direction: 0 },
          actorCount: 1,
          firstActor: { x: 160, y: 80, direction: 0, visible: true },
          lastMusic: 0,
          lastSfx: 0,
          collision: { currentFlags: 0, currentSlope: 0, seenEffectBits: 0, seenSlopeBits: 0, blockedDirectionBits: 0 },
          triggerEnterCount: 0,
          triggerLeaveCount: 0,
          roomChangeCount: 0,
          timing: {
            cpuWorkTicks: 800,
            vblankWaitTicks: 3500,
            peakCpuWorkTicks: 820,
            peakVblankWaitTicks: 3510,
            missedFrameCount: 0,
            renderSkipCount: 0,
            frameSkipPolicy: 0
          },
          input: { held: 0, pressed: 0, released: 0 }
        },
        hardware: {
          bgTiles: 591,
          objTiles: 388,
          oam: 3,
          paletteColors: 80,
          vramBytes: 31328,
          eventBytes: 3708,
          audioBytes: 1092,
          dmaBytes: 0
        }
      }
    });

    expect(presentation.activeRoomName).toBe("arena_arrancada");
    expect(presentation.activeRoomType).toBe("luta");
    expect(presentation.physical.metrics.find((metric) => metric.id === "bgTiles")).toMatchObject({
      measured: 591,
      safeLimit: 896
    });
    expect(presentation.metrics.find((metric) => metric.id === "oam")).toMatchObject({ used: 1 });
    expect(presentation.physical.metrics.find((metric) => metric.id === "objTiles")).toMatchObject({ estimate: 32 });
    expect(presentation.physical.metrics.find((metric) => metric.id === "oam")).toMatchObject({ estimate: 1 });
    expect(presentation.physical.metrics.find((metric) => metric.id === "cpuWorkTicks")).toMatchObject({
      measured: 820
    });
  });

  it("marks an OAM overflow as an error instead of hiding the hardware violation", () => {
    const project = profilerProject();
    project.actors = Array.from({ length: 129 }, (_value, index) => ({
      id: `actor-${index}`,
      name: `Actor ${index}`,
      roomName: "campo",
      spriteSheet: "player.png",
      x: index % 4,
      y: Math.floor(index / 4)
    }));

    const presentation = deriveHardwareProfilerPresentation(project);

    expect(presentation.metrics.find((metric) => metric.id === "oam")).toMatchObject({
      tone: "error"
    });
    expect(presentation.warningCount).toBeGreaterThan(0);
  });

  it("exposes isometric update, VRAM, OAM and foreground costs for the active room", () => {
    const project = profilerProject();
    project.scena = { id: "room-iso", name: "market" };
    project.scenas = [{
      id: "room-iso",
      name: "market",
      sceneType: "isometric",
      width: 2,
      height: 2,
      tilemap: [1, 2, 3, 4],
      tileLayers: [
        { mapping: "BG2", tilemap: [1, 2, 3, 4] },
        { mapping: "BG1", tilemap: [-1, 7, -1, 6] }
      ],
      collision: [false, false, false, true]
    }];
    project.actors = [
      { id: "player", name: "Player", roomName: "market", spriteSheet: "player.png", x: 0, y: 0 },
      { id: "guide", name: "Guide", roomName: "market", spriteSheet: "player.png", x: 1, y: 1 }
    ];

    const presentation = deriveHardwareProfilerPresentation(project);

    expect(presentation.isometric).toEqual({
      tilesUpdated: 6,
      vramBytes: 19_968,
      oamObjects: 2,
      foregroundTileCount: 2,
      foregroundBytes: 512
    });
  });
});
