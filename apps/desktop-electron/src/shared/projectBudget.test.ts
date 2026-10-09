import { describe, expect, it } from "vitest";

import { createBlankProjectData } from "./newProject.js";
import {
  deriveProjectBudgetPresentation,
  projectBudgetSceneGroupName,
  type AssetPackBudgetReport
} from "./projectBudget.js";

function compilerReport(sceneGroup: string): AssetPackBudgetReport {
  return {
    schema: 11,
    budget_summary: {
      bg_tiles: { used: 740, capacity: 896, remaining: 156, percent_used: 82, severity: "warning" },
      obj_tiles: { used: 96, capacity: 1024, remaining: 928, percent_used: 9, severity: "ok" },
      oam_sprites: { used: 18, capacity: 128, remaining: 110, percent_used: 14, severity: "ok" }
    },
    group_pressure_report: [{
      name: sceneGroup,
      asset_count: 2,
      assets: ["tiles_overworld", "hero"],
      resources: {
        bg_tiles: { requested: 740, capacity: 896, remaining_after_group: 156, percent_of_pool: 82, bank_count: 3 },
        obj_tiles: { requested: 96, capacity: 1024, remaining_after_group: 928, percent_of_pool: 9, bank_count: 1 },
        oam_sprites: { requested: 18, capacity: 128, remaining_after_group: 110, percent_of_pool: 14, bank_count: 1 }
      }
    }],
    fragmentation_report: {
      bg_tiles: { used: 740, capacity: 896, remaining: 156, largest_free_block: 120, free_fragment_count: 3 }
    },
    compression_candidates: [{
      asset: "tiles_overworld",
      resource: "bg_tiles",
      strategy: "rle_or_lz77_tilemap",
      reason: "large_repetitive_background_candidate"
    }],
    production_summary: {
      ready_for_large_project: true,
      blocking_overflow_count: 0,
      compression_candidate_count: 1,
      split_recommendation_count: 1
    }
  };
}

describe("project budget presentation", () => {
  it("maps the compiler scene bank to resource pressure, compression and fragmentation", () => {
    const project = createBlankProjectData({ name: "Orçamento real" });
    const roomName = String((project.scenas as Array<Record<string, unknown>>)[0]?.name);
    const presentation = deriveProjectBudgetPresentation(project, roomName, compilerReport(projectBudgetSceneGroupName(roomName)));

    expect(presentation.source).toBe("compiler");
    expect(presentation.sceneName).toBe(roomName);
    expect(presentation.sceneMetrics.find((metric) => metric.id === "bg_tiles")).toMatchObject({
      used: 740,
      capacity: 896,
      percent: 83,
      tone: "warning"
    });
    expect(presentation.compression).toEqual([
      expect.objectContaining({ asset: "tiles_overworld", strategyLabel: "RLE ou LZ77" })
    ]);
    expect(presentation.fragmentation).toEqual([
      expect.objectContaining({ id: "bg_tiles", freeFragments: 3, largestFreeBlock: 120 })
    ]);
    expect(presentation.dma).toEqual({
      action: "Antecipe o prefetch e reduza o banco antes de adicionar novos assets.",
      budgetBytes: 32_768,
      estimatedBytes: 26_896,
      percent: 82,
      tone: "warning",
      uploadCount: 3
    });
    expect(presentation.projectReady).toBe(true);
  });

  it("keeps a live per-scene estimate available before the compiler report is generated", () => {
    const project = createBlankProjectData({ name: "Estimativa" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    room.tilemap = [1, 1, 2, 0, 3];
    const roomName = String(room.name);

    const presentation = deriveProjectBudgetPresentation(project, roomName, null);

    expect(presentation.source).toBe("estimate");
    expect(presentation.sceneMetrics.find((metric) => metric.id === "bg_tiles")).toMatchObject({
      used: 3,
      capacity: 896
    });
    expect(presentation.compression).toEqual([]);
    expect(presentation.fragmentation).toEqual([]);
    expect(presentation.dma).toMatchObject({
      estimatedBytes: 296,
      budgetBytes: 32_768,
      percent: 1,
      tone: "ok"
    });
  });

  it("estima OAM por partes de metasprite, sem confundir objetos com tiles", () => {
    const project = createBlankProjectData({ name: "OAM por metasprite" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    const roomName = String(room.name);
    project.assets = [{ name: "sentinel.png", kind: "Sprite", metadata: { source: "Assets/sentinel.png" } }];
    project.animations = [{
      id: "sentinel-idle",
      name: "idle",
      spriteSheet: "sentinel.png",
      frameWidth: 64,
      frameHeight: 64,
      frameCount: 1,
      frames: [{ width: 64, height: 64, tiles: [] }]
    }];
    project.actors = [{
      id: "sentinel",
      name: "Sentinela",
      roomName,
      x: 4,
      y: 4,
      spriteSheet: "sentinel.png"
    }];

    const presentation = deriveProjectBudgetPresentation(project, roomName, null);

    expect(presentation.sceneMetrics.find((metric) => metric.id === "obj_tiles")).toMatchObject({ used: 64 });
    expect(presentation.sceneMetrics.find((metric) => metric.id === "oam_sprites")).toMatchObject({ used: 1 });
  });

  it("contabiliza uma vez a paleta OBJ explícita compartilhada entre sprites da cena", () => {
    const project = createBlankProjectData({ name: "Paleta compartilhada" });
    const room = (project.scenas as Array<Record<string, unknown>>)[0]!;
    const roomName = String(room.name);
    project.assets = [
      {
        id: "title-a",
        name: "title-a.png",
        kind: "Sprite",
        metadata: { source: "Assets/title-a.png", objectPaletteValues: [0, 992] }
      },
      {
        id: "title-b",
        name: "title-b.png",
        kind: "Sprite",
        metadata: { source: "Assets/title-b.png", objectPaletteValues: [0, 992] }
      }
    ];
    project.animations = [
      { id: "title-a-idle", name: "idle", spriteSheet: "title-a.png", frameWidth: 16, frameHeight: 16, frameCount: 1 },
      { id: "title-b-idle", name: "idle", spriteSheet: "title-b.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }
    ];
    project.actors = [
      { id: "title-a-actor", name: "Title A", roomName, spriteSheet: "title-a.png" },
      { id: "title-b-actor", name: "Title B", roomName, spriteSheet: "title-b.png" }
    ];

    const presentation = deriveProjectBudgetPresentation(project, roomName, null);

    expect(presentation.sceneMetrics.find((metric) => metric.id === "obj_palette_colors")).toMatchObject({
      used: 16,
      percent: 6,
      tone: "ok"
    });
  });
});
