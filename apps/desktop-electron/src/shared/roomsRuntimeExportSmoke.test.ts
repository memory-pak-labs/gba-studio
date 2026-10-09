import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { generateEngineProjectExport } from "./engineProjectExport.js";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import { parseGBAProjectFile, serializeGBAProjectFile, type GBAProjectData } from "./projectFile.js";
import { createPreviewRuntime, dispatchPreviewRuntimeAction } from "./previewRuntime.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";

function writeEvidenceIfRequested(evidence: Record<string, unknown>): void {
  const outputPath = process.env.GBA_STUDIO_ROOMS_RUNTIME_EXPORT_EVIDENCE;
  if (!outputPath) return;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function denseTilemap(width: number, height: number, seed: number): number[] {
  return Array.from({ length: width * height }, (_item, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1) return 9;
    return ((x * 3 + y * 5 + seed) % 8) + 1;
  });
}

function denseCollisionTypes(width: number, height: number, gates: number[]): string[] {
  const gateSet = new Set(gates);
  return Array.from({ length: width * height }, (_item, index) => {
    const x = index % width;
    const y = Math.floor(index / width);
    if (gateSet.has(index)) return "free";
    if (x === 0 || y === 0 || x === width - 1 || y === height - 1 || (x === 7 && y > 3 && y < height - 4)) {
      return "solid";
    }
    return "free";
  });
}

function buildDenseRoomsProject(): GBAProjectData {
  const base = buildFunctionalP0Project();
  const baseSettings = asRecord(base.settings);
  const baseGeneralSettings = asRecord(baseSettings.general);
  const baseBuildSettings = asRecord(baseSettings.build);
  return {
    ...base,
    schemaVersion: 1,
    name: "Dense Rooms Gate",
    assets: [
      ...(Array.isArray(base.assets) ? base.assets : []),
      { id: "asset-dense-tiles", name: "dense_tiles.png", kind: "Tileset", metadata: { source: "Assets/tiles/dense_tiles.png", tileWidth: 8, tileHeight: 8 } },
      { id: "asset-theme-dense", name: "field_theme.mod", kind: "Audio", metadata: { source: "Assets/audio/field_theme.mod" } }
    ],
    audioItems: [
      ...(Array.isArray(base.audioItems) ? base.audioItems : []),
      { id: "audio-field-theme", name: "field_theme.mod", kind: "Musica", format: "MOD", loops: true, exportID: "field_theme", volume: 80 }
    ],
    scenas: [
      {
        id: "room-field",
        name: "field",
        width: 40,
        height: 24,
        sceneType: "topdown",
        music: "intro_theme.mod",
        backgroundAssetName: "dense_tiles.png",
        tilemap: denseTilemap(40, 24, 1),
        collisionTypes: denseCollisionTypes(40, 24, [22 * 40 + 38, 12 * 40 + 38]),
        eventBindings: { onInit: "field_boot" }
      },
      {
        id: "room-cave",
        name: "cave",
        width: 32,
        height: 20,
        sceneType: "topdown",
        music: "intro_theme.mod",
        backgroundAssetName: "dense_tiles.png",
        tilemap: denseTilemap(32, 20, 3),
        collisionTypes: denseCollisionTypes(32, 20, [9 * 32 + 1])
      },
      {
        id: "room-shop",
        name: "shop",
        width: 24,
        height: 18,
        sceneType: "topdown",
        music: "intro_theme.mod",
        backgroundAssetName: "dense_tiles.png",
        tilemap: denseTilemap(24, 18, 5),
        collisionTypes: denseCollisionTypes(24, 18, [8 * 24 + 1])
      }
    ],
    actors: [
      { id: "actor-player", name: "Player", roomName: "field", x: 36, y: 22, eventName: "player_talk", spriteSheet: "player_topdown_4dir.png", animationName: "idle_down" },
      { id: "actor-guide", name: "Guide", roomName: "field", x: 12, y: 8, eventName: "guide_talk", spriteSheet: "player_topdown_4dir.png", animationName: "idle_down" },
      { id: "actor-merchant", name: "Merchant", roomName: "shop", x: 8, y: 7, eventName: "merchant_talk", spriteSheet: "player_topdown_4dir.png", animationName: "idle_down" }
    ],
    triggers: [
      { id: "trigger-cave", name: "Cave Gate", roomName: "field", x: 38, y: 22, width: 2, height: 1, eventName: "field_to_cave", onEnterEventName: "field_to_cave" },
      { id: "trigger-shop", name: "Shop Gate", roomName: "field", x: 38, y: 12, width: 2, height: 1, eventName: "field_to_shop", onEnterEventName: "field_to_shop" },
      { id: "trigger-cave-exit", name: "Cave Exit", roomName: "cave", x: 0, y: 9, width: 2, height: 2, eventName: "cave_to_field", onEnterEventName: "cave_to_field" }
    ],
    dialogues: [
      { key: "field_intro", character: "Guide", text: "Dense rooms are online." },
      { key: "merchant_hello", character: "Merchant", text: "Three rooms, one gate." }
    ],
    events: [
      { id: "event-field-boot", name: "field_boot", category: "Cena", steps: [{ command: "play_music intro_theme.mod" }, { command: "show_dialogue field_intro" }] },
      { id: "event-player-talk", name: "player_talk", category: "Ator", steps: [{ command: "show_dialogue field_intro" }] },
      { id: "event-guide-talk", name: "guide_talk", category: "Ator", steps: [{ command: "show_dialogue field_intro" }] },
      { id: "event-merchant-talk", name: "merchant_talk", category: "Ator", steps: [{ command: "show_dialogue merchant_hello" }] },
      { id: "event-field-cave", name: "field_to_cave", category: "Trigger", steps: [{ command: "change_scene cave 2 9" }] },
      { id: "event-field-shop", name: "field_to_shop", category: "Trigger", steps: [{ command: "change_scene shop 2 8" }] },
      { id: "event-cave-field", name: "cave_to_field", category: "Trigger", steps: [{ command: "change_scene field 36 22" }] }
    ],
    editorState: {
      scenaConnections: [
        { from: "field", to: "cave", eventName: "field_to_cave" },
        { from: "field", to: "shop", eventName: "field_to_shop" },
        { from: "cave", to: "field", eventName: "cave_to_field" }
      ]
    },
    settings: {
      ...baseSettings,
      general: {
        ...baseGeneralSettings,
        gameTitle: "Dense Rooms Gate",
        startScene: "field"
      },
      build: {
        ...baseBuildSettings,
        romFileName: "dense_rooms_gate.gba",
        engineBackend: "gbastudio_engine"
      }
    }
  };
}

describe("Rooms runtime/export smoke", () => {
  it("proves dense room authoring across workspace, preview, export and persistence", () => {
    const project = buildDenseRoomsProject();
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({
      data: project,
      summary: { schemaVersion: 1, name: "Dense Rooms Gate", rooms: 3, assets: 3 }
    })).data;
    const rooms = deriveRoomsWorkspacePresentation(reopened);
    const preview = createPreviewRuntime(reopened);
    const playablePreview = dispatchPreviewRuntimeAction(preview, "action");
    const movedToCave = dispatchPreviewRuntimeAction(dispatchPreviewRuntimeAction(playablePreview, "right"), "right");
    const contract = buildEngineExportProjectContract(reopened);
    const exported = generateEngineProjectExport(reopened);
    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    const main = exported.files.find((file) => file.path === "main.cpp")?.contents ?? "";

    expect(rooms.summary).toMatchObject({
      roomCount: 3,
      activeRoomName: "field",
      startRoomName: "field",
      totalTiles: 2032,
      warningCount: 4
    });
    expect(rooms.rooms.find((room) => room.name === "field")).toMatchObject({
      width: 40,
      height: 24,
      tileCount: 960,
      collisionCount: 140,
      background: "dense_tiles.png",
      music: "intro_theme.mod"
    });
    expect(rooms.connections).toHaveLength(3);
    expect(rooms.entities.filter((entity) => entity.kind === "actor")).toHaveLength(3);
    expect(rooms.entities.filter((entity) => entity.kind === "trigger")).toHaveLength(3);

    expect(preview.currentRoom?.name).toBe("field");
    expect(preview.rooms.map((room) => `${room.name}:${room.width}x${room.height}`)).toEqual([
      "field:40x24",
      "cave:32x20",
      "shop:24x18"
    ]);
    expect(preview.actors.map((actor) => actor.name).sort()).toEqual(["Guide", "Player"]);
    expect(preview.triggers.map((trigger) => trigger.name).sort()).toEqual(["Cave Gate", "Shop Gate"]);
    expect(movedToCave.currentRoom?.name).toBe("cave");
    expect(movedToCave.triggers.map((trigger) => trigger.name)).toEqual(["Cave Exit"]);

    expect(contract.topdown_project?.rooms).toHaveLength(3);
    expect(contract.topdown_project?.rooms[0]).toMatchObject({
      name: "field",
      width_tiles: 40,
      height_tiles: 24
    });
    expect(contract.topdown_project?.rooms[0].visual_tiles).toHaveLength(960);
    expect(contract.topdown_project?.rooms[0].collision_flags.filter((cell) => cell === 1)).toHaveLength(140);
    expect(contract.topdown_project?.rooms[0].portals).toHaveLength(2);
    expect(contract.topdown_project?.rooms[0].triggers).toHaveLength(2);
    expect(contract.topdown_project?.rooms[0].visual_tilemap).toBeTruthy();
    expect(contract.topdown_project?.rooms[0].visual_tiles?.length).toBeGreaterThan(0);
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "bg", name: "dense_tiles" })
    ]));
    expect(contract.topdown_project?.rooms[0].npcs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Guide", position: { x: 96, y: 64 } })
    ]));

    expect(header).toContain("room_count = 3");
    expect(header).toContain("actor_count = 3");
    expect(header).toContain("trigger_count = 3");
    expect(header).toContain("tile_cell_count = 2032");
    expect(header).toContain("collision_cell_count = 2032");
    expect(header).toContain("\"field\"");
    expect(header).toContain("\"cave\"");
    expect(header).toContain("\"shop\"");
    expect(main).toContain("bool is_blocked_tile(int room_index, int x, int y)");
    expect(main).toContain("void handle_trigger_overlap()");
    expect(main).toContain("draw_runtime_room_layer(room)");

    writeEvidenceIfRequested({
      ok: true,
      generatedAt: new Date().toISOString(),
      workspaceVerified: true,
      previewRuntimeVerified: true,
      engineContractVerified: true,
      engineHeaderVerified: true,
      generatedRuntimeVerified: true,
      persistenceVerified: true,
      coveredFlow: [
        "multi-room",
        "dense-tilemap",
        "collision-map",
        "actors",
        "triggers",
        "connections",
        "preview-rooms",
        "engine-contract",
        "engine-header",
        "generated-runtime",
        "save-reopen"
      ],
      rooms: {
        count: rooms.summary.roomCount,
        totalTiles: rooms.summary.totalTiles,
        actors: rooms.entities.filter((entity) => entity.kind === "actor").length,
        triggers: rooms.entities.filter((entity) => entity.kind === "trigger").length,
        connections: rooms.connections.length,
        previewRoomAfterTrigger: movedToCave.currentRoom?.name
      }
    });
  });
});
