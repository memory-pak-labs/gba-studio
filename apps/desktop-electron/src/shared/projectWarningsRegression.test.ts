import { describe, expect, it } from "vitest";
import { buildGbaHardwareContract, auditGbaHardwareBlockingErrors } from "./gbaHardwareContract.js";
import { deriveProjectProblems } from "./projectProblems.js";
import { deriveProjectHealthReport } from "./projectHealth.js";
import { deriveProjectBudgetPresentation, type AssetPackBudgetReport } from "./projectBudget.js";
import { deriveRoomGeometryDiagnostics, deriveRoomsWorkspacePresentation, type RoomsWorkspaceEntity } from "./roomsWorkspace.js";
import { createBlankProjectData } from "./newProject.js";

describe("actionable project warnings", () => {
  it("keeps supported metasprite decomposition informational and actual OBJ failures blocking", () => {
    const supported = { assets: [{ name: "hero.png", kind: "Sprite", metadata: { width: 48, height: 48 } }],
      animations: [{ name: "idle", spriteSheet: "hero.png", frameWidth: 48, frameHeight: 48,
        frames: [{ tiles: [{ tileWidth: 48, tileHeight: 48, sliceX: 0, sliceY: 0 }] }] }] };
    const notices = buildGbaHardwareContract(supported).issues.filter(i => i.code.includes("REQUIRES"));
    expect(notices).toHaveLength(3);
    expect(notices.every(i => i.severity === "info")).toBe(true);
    expect(auditGbaHardwareBlockingErrors({ animations: [{ name: "bad", frameWidth: 22, frameHeight: 16 }] })).not.toEqual([]);
    expect(auditGbaHardwareBlockingErrors({ animations: [{ name: "over", frameWidth: 512, frameHeight: 512,
      frames: [{ tiles: [{ tileWidth: 512, tileHeight: 512, sliceX: 0, sliceY: 0 }] }] }] })).not.toEqual([]);
  });

  it("uses a physical camera for Dungeon cells without exempting ordinary undersized maps", () => {
    for (const size of [11, 80]) {
      const contract = buildGbaHardwareContract({ scenas: [{ name: "maze", sceneType: "dungeonCrawler", width: size, height: size }] });
      expect(contract.issues.some(i => ["SCENE_BELOW_GBA_VIEWPORT", "SCENE_EXCEEDS_GBA_BACKGROUND_MAP"].includes(i.code))).toBe(false);
      expect(contract.scenes[0].requiredMapSize.id).toBe("32x32");
    }
    expect(buildGbaHardwareContract({ scenas: [{ name: "small", sceneType: "topdown", width: 11, height: 11 }] }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "SCENE_BELOW_GBA_VIEWPORT", severity: "warning" })]));
  });

  it("distinguishes automatic map selection from an explicitly undersized default", () => {
    const scenas = [{ name: "large", sceneType: "topdown", width: 64, height: 64 }];
    expect(buildGbaHardwareContract({ scenas }).issues.filter(i => i.code.startsWith("BACKGROUND_MAP_SIZE")))
      .toEqual(expect.arrayContaining([expect.objectContaining({ severity: "info" })]));
    expect(buildGbaHardwareContract({ scenas }).issues.filter(i => i.code.startsWith("BACKGROUND_MAP_SIZE")).every(i => i.severity === "info")).toBe(true);
    expect(buildGbaHardwareContract({ scenas, settings: { backgrounds: { defaultMapSize: "32x32" } } }).issues)
      .toEqual(expect.arrayContaining([expect.objectContaining({ code: "BACKGROUND_MAP_SIZE_EXPANDED", severity: "warning" })]));
  });

  it("does not require animation clips for static HUD assets, but retains invalid animation errors", () => {
    const data = { assets: [{ id: "panel", name: "panel.png", kind: "Sprite", metadata: { width: 64, height: 32 } }] };
    expect(deriveProjectProblems(data).some(p => p.id === "sprites-no-animations-panel.png")).toBe(false);
    expect(deriveProjectHealthReport(data).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "sprites-no-animations-panel.png", severity: "info" })
    ]));
    expect(deriveProjectProblems({ ...data, animations: [{ id: "bad", name: "idle", spriteSheet: "panel.png", frameWidth: 22, frameHeight: 16 }] }))
      .toEqual(expect.arrayContaining([expect.objectContaining({ severity: "error", code: "gba.hardware.sprite_frame_not_tile_aligned" })]));
  });

  const race = (tileCount?: number) => ({ scenas: [{ name: "race", sceneType: "racing", width: 64, height: 64,
    tilemap: Array.from({ length: 4096 }, (_, i) => i + 1), backgroundAssetName: "floor.png",
    runtime: { type: "racing", config: { presentation: "pseudo3d", pseudo3dVisuals: { floorTilemapId: "floor.png" } } } }],
    assets: [{ name: "floor.png", kind: "Background", metadata: { kind: "affine_bg", width: 512, height: 512, ...(tileCount === undefined ? {} : { tileCount }) } }] });

  it("counts unique affine patterns instead of the 4096 map entries", () => {
    const budget = deriveProjectBudgetPresentation(race(236), "race", null);
    expect(budget.sceneMetrics.find(m => m.id === "bg_tiles")?.used).toBe(0);
    expect(budget.sceneMetrics.find(m => m.id === "affine_bg_tiles")).toMatchObject({ used: 236, capacity: 256 });
    expect(budget.tone).not.toBe("error");
    expect(budget.dma.estimatedBytes).toBeGreaterThanOrEqual(236 * 64);
  });

  it("marks an uncompiled image count as pending instead of reporting zero usage or overflow", () => {
    const budget = deriveProjectBudgetPresentation(race(), "race", null);
    expect(budget.sceneMetrics.find(m => m.id === "affine_bg_tiles")).toMatchObject({ pending: true });
    expect(budget.dma.pending).toBe(true);
    expect(budget.tone).not.toBe("error");
    expect(deriveProjectProblems(race()).some(p => p.code === "asset.budget.blocked")).toBe(false);
    const report: AssetPackBudgetReport = { schema: 11, group_pressure_report: [{ name: "scene_race", asset_count: 1, assets: ["floor"], resources: {
      affine_bg_tiles: { requested: 257, capacity: 256, percent_of_pool: 100.4 }
    } }], production_summary: { ready_for_large_project: false, blocking_overflow_count: 1 } };
    expect(deriveProjectBudgetPresentation(race(), "race", report)).toMatchObject({ source: "compiler", tone: "error", projectReady: false });
    expect(deriveProjectBudgetPresentation(race(), "race", report).sceneMetrics.find(m => m.id === "affine_bg_tiles")?.pending).not.toBe(true);
  });

  it("reads affine physical allocations even when assetc omits them from its bank plan", () => {
    const report: AssetPackBudgetReport = { schema: 11,
      resource_bank_groups: [{ name: "scene_race", assets: ["floor"], banks: [{ resource: "bg_palette_colors", count: 224 }] }],
      allocations: [
        { bank_group: "scene_race", allocations: { affine_bg_tiles: { start: 0, count: 236 } } },
        { bank_groups: ["scene_other", "scene_race"], allocations: { affine_bg_tiles: { start: 0, count: 236 } } },
        { bank_group: "scene_other", allocations: { affine_bg_tiles: { start: 0, count: 256 } } }
      ] };
    const metric = deriveProjectBudgetPresentation(race(), "race", report).sceneMetrics.find(m => m.id === "affine_bg_tiles");
    expect(metric).toMatchObject({ used: 236, capacity: 256 });
    expect(metric?.pending).not.toBe(true);
  });

  it("tests Dungeon occupancy in one logical cell and still detects an actor actually inside a wall", () => {
    const base = deriveRoomsWorkspacePresentation(createBlankProjectData({ name: "Cell diagnostics" })).rooms[0]!;
    const room = { ...base, sceneType: "dungeonCrawler" as const, width: 11, height: 11, collisionTypes: Array.from({ length: 121 }, () => "solid" as const) as Array<"solid" | "free"> };
    room.collisionTypes[6 * 11 + 5] = "free";
    const actor: RoomsWorkspaceEntity = { kind: "actor", id: "cell", name: "Cell", roomName: room.name, x: 5, y: 6, width: 4, height: 4, eventName: null, isInActiveRoom: true,
      spriteFrame: { frameWidth: 32, frameHeight: 32, widthTiles: 4, heightTiles: 4, originX: 16, originY: 28, sourceX: 0, sourceY: 0, sourceWidth: 32, sourceHeight: 32, layer: "OBJ" } };
    expect(deriveRoomGeometryDiagnostics(room, [actor]).actorPlacement.blocked).toEqual([]);
    expect(deriveRoomGeometryDiagnostics(room, [{ ...actor, x: 4 }]).actorPlacement.blocked).toEqual(["Cell"]);
  });

  it("uses the platformer hitbox above the floor, and flags actual penetration", () => {
    const data = createBlankProjectData({ name: "Platform feet" });
    const sourceRoom = (data.scenas as Array<Record<string, unknown>>)[0]!;
    Object.assign(sourceRoom, { sceneType: "platformer", width: 30, height: 20, playerActorName: "Nara",
      collisionTypes: Array.from({ length: 600 }, (_, i) => Math.floor(i / 30) >= 10 ? "solid" : "free") });
    data.actors = [{ id: "nara", name: "Nara", roomName: sourceRoom.name, x: 10, y: 10, spriteSheet: "nara.png", animationName: "idle" }];
    data.assets = [{ id: "nara", name: "nara.png", kind: "Sprite", metadata: { width: 64, height: 64 } }];
    data.animations = [{ id: "idle", name: "idle", spriteSheet: "nara.png", frameWidth: 64, frameHeight: 64,
      originX: 32, originY: 56, hitboxX: -8, hitboxY: -24, hitboxWidth: 16, hitboxHeight: 24, frames: [{ tiles: [] }] }];
    const presentation = deriveRoomsWorkspacePresentation(data), room = presentation.rooms[0]!;
    const actor = presentation.entities.find(e => e.id === "nara")!;
    expect(deriveRoomGeometryDiagnostics(room, [actor]).actorPlacement.blocked).toEqual([]);
    expect(deriveRoomGeometryDiagnostics(room, [{ ...actor, y: actor.y + 1 }]).actorPlacement.blocked).toEqual(["Nara"]);
  });

  it("allows a platform exit area to overlap its floor while detecting wholly unreachable triggers", () => {
    const base = deriveRoomsWorkspacePresentation(createBlankProjectData({ name: "Platform trigger" })).rooms[0]!;
    const room = { ...base, sceneType: "platformer" as const, width: 30, height: 20,
      collisionTypes: Array.from({ length: 600 }, (_, i) => Math.floor(i / 30) >= 10 ? "solid" as const : "free" as const) };
    const trigger: RoomsWorkspaceEntity = { kind: "trigger", id: "exit", name: "Exit", roomName: room.name, x: 26, y: 8, width: 4, height: 4, eventName: null, isInActiveRoom: true };
    expect(deriveRoomGeometryDiagnostics(room, [trigger]).triggerPlacement.blocked).toEqual([]);
    expect(deriveRoomGeometryDiagnostics(room, [{ ...trigger, y: 10 }]).triggerPlacement.blocked).toEqual(["Exit"]);
  });
});
