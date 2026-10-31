import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { createActorInProject, createRoomInProject, setRoomTileCellInProject, updateRoomFieldsInProject } from "./roomsWorkspace.js";
import { deriveProjectHealthReport } from "./projectHealth.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject, type GBAProjectData } from "./projectFile.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { deriveSettingsWorkspacePresentation } from "./settingsWorkspace.js";

const rooms = (data: GBAProjectData) => data.rooms as Record<string, any>[];
const blank = () => buildProjectFromTemplate("blank", { name: "Meu jogo" });

describe("blank project authoring workflow", () => {
  it.each(["topdown", "platformer", "shmup", "luta", "racing", "isometricAdventure", "isometricTactical", "dungeonCrawler", "pointAndClick", "battleRpg"])(
    "creates a %s actor from the available blank library with a valid animation", sceneType => {
      const base = createRoomInProject(blank(), { id: "actor-room", name: "actor-room", sceneType, width: 30, height: 20 });
      const data = createActorInProject(base, { id: "new-npc", name: "NPC", roomID: "actor-room", x: 4, y: 4 });
      const actor = (data.actors as Record<string, any>[]).find(a => a.id === "new-npc")!;
      expect((data.assets as Record<string, any>[]).some(a => a.name === actor.spriteSheet)).toBe(true);
      expect((data.animations as Record<string, any>[]).some(a => a.spriteSheet === actor.spriteSheet && a.name === actor.animationName)).toBe(true);
      expect(deriveProjectHealthReport(data).counts.error).toBe(0);
      expect(data.assets).toEqual(base.assets);
    }
  );

  it("keeps the bundled authoring library without unused-file warnings, while diagnosing unused imports", () => {
    const data = blank();
    expect(deriveProjectHealthReport(data).counts).toMatchObject({ warning: 0, error: 0 });
    (data.assets as unknown[]).push({ id: "unused-import", name: "my-unused.png", kind: "Background",
      metadata: { source: "Assets/backgrounds/my-unused.png", width: 240, height: 160 } });
    expect(deriveProjectHealthReport(data).diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "files.warning", severity: "warning", message: "1 asset(s) sem uso no projeto." })
    ]));
  });

  it("follows the default HUD when changing scene types and saves the same HUD used by export", () => {
    let data = blank();
    const id = String(rooms(data)[0].id);
    for (const [sceneType, hudPresetId] of [["platformer", "hud-neutral-plataforma"], ["racing", "hud-neutral-corrida"],
      ["dungeonCrawler", "hud-neutral-dungeon-crawler"], ["menu", "hud-neutral-menu"], ["topdown", undefined]] as const) {
      data = updateRoomFieldsInProject(data, id, { sceneType });
      expect(rooms(data)[0].hudPresetId).toBe(hudPresetId);
      expect(data.scena).toMatchObject({ sceneType });
      expect((data.scena as Record<string, unknown>).hudPresetId).toBe(hudPresetId);
    }
    data = updateRoomFieldsInProject(data, id, { sceneType: "platformer" });
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({ data, summary: summarizeGBAProject(data) })).data;
    expect(rooms(reopened)[0].hudPresetId).toBe("hud-neutral-plataforma");
    expect(buildEngineExportProjectContract(reopened).platformer_project?.dialogue_ui?.hud_scene_bindings)
      .toContainEqual({ scene_name: rooms(reopened)[0].name, preset_id: "hud-neutral-plataforma" });
  });

  it.each([null, "my-custom-hud"])("preserves an explicitly selected HUD %s across type changes", hudPresetId => {
    const data = blank();
    rooms(data)[0].hudPresetId = hudPresetId;
    const changed = updateRoomFieldsInProject(data, String(rooms(data)[0].id), { sceneType: "platformer" });
    expect(rooms(changed)[0].hudPresetId).toBe(hudPresetId);
    const explicit = updateRoomFieldsInProject(blank(), String(rooms(blank())[0].id), { sceneType: "platformer", hudPresetId });
    expect(rooms(explicit)[0].hudPresetId).toBe(hudPresetId ?? undefined);
  });

  it("switches between adventure and tactical HUD defaults without changing the approved assets", () => {
    const base = blank();
    let data = createRoomInProject(base, { id: "iso", name: "iso", sceneType: "isometricAdventure", width: 6, height: 6 });
    data = updateRoomFieldsInProject(data, "iso", { sceneType: "isometricTactical" });
    expect(rooms(data).find(r => r.id === "iso")?.hudPresetId).toBe("hud-neutral-tatica-isometrica");
    data = updateRoomFieldsInProject(data, "iso", { sceneType: "isometricAdventure" });
    expect(rooms(data).find(r => r.id === "iso")?.hudPresetId).toBeUndefined();
    expect(data.assets).toEqual(base.assets);
  });

  it.each(["topdown", "platformer", "racing", "dungeonCrawler"])("preserves painted %s cells, source assets and camera bounds when resizing", sceneType => {
    let data = createRoomInProject(blank(), { id: "new", name: "new", sceneType, width: 30, height: 20 });
    const room = rooms(data).find(r => r.id === "new")!;
    const sourceIndex = room.width + 1, sourceSize = room.width * room.height;
    room.tilemap[sourceIndex] = 42;
    const layer = room.tileLayers.find((l: any) => l.mapping === "BG2")!;
    layer.tilemap[sourceIndex] = 42;
    layer.tileSourceAssetNames = Array(sourceSize).fill("");
    layer.tileSourceAssetNames[sourceIndex] = "my-tiles.png";
    room.collisionTypes = Array(sourceSize).fill("free"); room.collisionTypes[sourceIndex] = "solid";
    data = updateRoomFieldsInProject(data, "new", { width: 60, height: 40, cameraMode: "follow_player" });
    const enlarged = rooms(data).find(r => r.id === "new")!;
    const enlargedLayer = enlarged.tileLayers.find((l: any) => l.mapping === "BG2")!;
    expect(enlarged.tilemap).toHaveLength(2400);
    expect(enlarged.tilemap[61]).toBe(42);
    expect(enlargedLayer.tilemap[61]).toBe(42);
    expect(enlargedLayer.tileSourceAssetNames[61]).toBe("my-tiles.png");
    expect(enlargedLayer.tileSourceAssetNames[31]).toBe("");
    expect(enlarged.collisionTypes[61]).toBe("solid");
    expect(enlarged.cameraBounds).toEqual({ x: 0, y: 0, width: 60, height: 40 });
    const smaller = updateRoomFieldsInProject(data, "new", { width: 30, height: 20 });
    expect(rooms(smaller).find(r => r.id === "new")?.tilemap[31]).toBe(42);
    expect(room.tilemap).toHaveLength(sourceSize);
  });

  it("preserves custom camera bounds and respects explicit bounds during resize", () => {
    let data = updateRoomFieldsInProject(blank(), String(rooms(blank())[0].id), { width: 40, height: 30,
      cameraBounds: { x: 2, y: 3, width: 32, height: 22 } });
    const id = String(rooms(data)[0].id);
    data = updateRoomFieldsInProject(data, id, { width: 60, height: 40 });
    expect(rooms(data)[0].cameraBounds).toEqual({ x: 2, y: 3, width: 32, height: 22 });
    data = updateRoomFieldsInProject(data, id, { width: 70, cameraBounds: { width: 50 } });
    expect(rooms(data)[0].cameraBounds.width).toBe(50);
  });

  it("lets follow-player cover an enlarged scene instead of clamping to the initial viewport", () => {
    const created = createRoomInProject(blank(), { id: "large", name: "large", sceneType: "topdown", width: 60, height: 40 });
    const data = updateRoomFieldsInProject(created, "large", { cameraMode: "follow_player" });
    expect(rooms(data).find(r => r.id === "large")?.cameraBounds).toEqual({ x: 0, y: 0, width: 60, height: 40 });
    expect(buildEngineExportProjectContract(data).topdown_project?.rooms.find(r => r.name === "large")?.metadata)
      .toMatchObject({ camera_bounds: { x: 0, y: 0, width: 480, height: 320 } });
  });

  it("authors Dungeon Crawler grids independently of the physical GBA viewport", () => {
    let data = createRoomInProject(blank(), { id: "maze", name: "maze", sceneType: "dungeonCrawler", width: 11, height: 11 });
    expect(rooms(data).find(r => r.id === "maze")).toMatchObject({ width: 11, height: 11 });
    data = updateRoomFieldsInProject(data, "maze", { width: 9, height: 7 });
    expect(rooms(data).find(r => r.id === "maze")).toMatchObject({ width: 9, height: 7, gbStudioUseBackgroundLayout: true });
    expect(buildEngineExportProjectContract(data).dungeon_crawler_project?.rooms[0]).toMatchObject({ width_tiles: 9, height_tiles: 7 });
  });

  it("uses automatic background map allocation for new blank projects", () => {
    const field = deriveSettingsWorkspacePresentation(blank()).sections.find(s => s.id === "backgrounds")?.editableFields.find(f => f.key === "defaultMapSize");
    expect(field?.value).toBe("");
    expect(field?.options).toContainEqual(expect.objectContaining({ value: "" }));
  });

  it("uses the native RPG party capacity when converting the initial scene", () => {
    const data = blank();
    const changed = updateRoomFieldsInProject(data, String(rooms(data)[0].id), { sceneType: "battleRpg" });
    expect(buildEngineExportProjectContract(changed).battle_rpg_project?.encounters[0]?.config.max_party_size).toBe(4);
  });

  it.each(["topdown", "platformer"])("exports edited %s tiles instead of replacing them with the original background layout", sceneType => {
    let data = createRoomInProject(blank(), { id: "paint", name: "paint", sceneType, width: 30, height: 20 });
    data = setRoomTileCellInProject(data, "paint", 31, 42);
    expect(rooms(data).find(r => r.id === "paint")?.gbStudioUseBackgroundLayout).toBe(false);
    data = updateRoomFieldsInProject(data, "paint", { width: 60 });
    expect(deriveProjectHealthReport(data).diagnostics.filter(d => d.targetName === "paint" && d.severity !== "info")).toEqual([]);
    const contract = buildEngineExportProjectContract(data);
    const exported = (sceneType === "topdown" ? contract.topdown_project : contract.platformer_project)?.rooms.find(r => r.name === "paint");
    expect(exported?.visual_tilemap_layout).toBe("editor_tiles");
    expect(exported?.visual_tiles[61]).toBe(42);
    if (sceneType === "platformer") expect(contract.platformer_project?.rooms[0]?.background_layers)
      .toContainEqual(expect.objectContaining({ layer: "bg2", tilemap: "neutral_background_platformer", tilemap_layout: "editor_tiles" }));
  });

  it("keeps an enlarged map editable after replacing its default through a type change", () => {
    const base = createRoomInProject(blank(), { id: "large", name: "large", sceneType: "topdown", width: 60, height: 40 });
    expect(rooms(base).find(r => r.id === "large")?.gbStudioUseBackgroundLayout).toBe(false);
    const changed = updateRoomFieldsInProject(base, "large", { sceneType: "platformer" });
    expect(rooms(changed).find(r => r.id === "large")?.gbStudioUseBackgroundLayout).toBe(false);
    expect(deriveProjectHealthReport(changed).counts).toMatchObject({ warning: 0, error: 0 });
  });

  it("persists the editor tile numbering in both the room and its active copy after painting", () => {
    const data = blank();
    delete rooms(data)[0].tilemapIndexBase;
    delete (data.scena as Record<string, unknown>).tilemapIndexBase;
    const painted = setRoomTileCellInProject(data, String(rooms(data)[0].id), 599, 600);
    expect(rooms(painted)[0].tilemapIndexBase).toBe(1);
    expect((painted.scena as Record<string, unknown>).tilemapIndexBase).toBe(1);
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({ data: painted, summary: summarizeGBAProject(painted) })).data;
    expect(rooms(reopened)[0].tilemapIndexBase).toBe(1);
  });
});
