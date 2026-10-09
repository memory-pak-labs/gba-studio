import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import {
  applyRoomTileBrushInProject,
  applyRoomCollisionFillInProject,
  canvasPointToRoomTile,
  canvasPointToTilesetTileID,
  deriveMetatileTilesetStamp,
  deriveRoomEntityAlignmentGuides,
  deriveRoomEntitySelection,
  deriveRoomEventSceneLinks,
  updateRoomEventSceneLinkCommand,
  deriveRoomGeometryDiagnostics,
  roomGeometryDiagnosticWarnings,
  resolveActorAnimationName,
  deriveRoomCanvasActions,
  deriveTilesetTileStamp,
  deriveRoomPaintInspectorPresentation,
  deriveRoomEditorToolPanel,
  deriveRoomsEditorContext,
  deriveRoomsWorkspaceFilterChips,
  deriveRoomsWorkspaceSummaryCards,
  deriveRoomsWorkspaceValidationIssues,
  deriveRoomSelectedEntityCells,
  alignRoomEntitiesInProject,
  distributeRoomEntitiesInProject,
  tilesetRegionForTileID,
  createRoomConnectionInProject,
  createRoomWarpConnectionInProject,
  defaultRoomConnectionEntryArea,
  defaultRoomConnectionExitArea,
  deriveRoomConnectionAreasForRoom,
  moveRoomConnectionAreaToCell,
  normalizeRoomConnectionArea,
  roomConnectionArrival,
  updateRoomConnectionInProject,
  deriveRoomTileOverlayCells,
  isometricRoomAreaPlacement,
  isometricRoomTilePlacement,
  createRoomInProject,
  composeVisibleRoomTileCells,
  ROOM_PRESETS,
  deriveRoomsWorkspacePresentation,
  duplicateRoomInProject,
  duplicateRoomEntitiesInProject,
  filterRoomsWorkspaceRooms,
  removeRoomFromProject,
  removeRoomEntitiesInProject,
  removeRoomConnectionFromProject,
  renameRoomInProject,
  sceneMapPositions,
  sceneMapZoom,
  nudgeRoomEntitiesInProject,
  createActorInProject,
  createTriggerInProject,
  deriveTriggerPlacementFromCells,
  resizeRoomTriggerToTileInProject,
  roomCellLineIndexes,
  roomEntitySelectionFootprint,
  selectRoomEntityAtTile,
  setActiveRoomInProject,
  setActiveTileLayerMappingInProject,
  setStartRoomInProject,
  setRoomCollisionCellInProject,
  setRoomHeightLevelInProject,
  setRoomTileCellInProject,
  toggleRoomCollisionCellInProject,
  updateRoomEntityInProject,
  placeRoomEntityInRoomInProject,
  updateRoomBackgroundTilesetGridInProject,
  organizeSceneMapPositionsInProject,
  updateSceneMapPositionInProject,
  updateSceneMapZoomInProject,
  updateRoomFieldsInProject
} from "./roomsWorkspace.js";
import { rectsOverlap } from "./eventsWorkspace/graphLayout.js";
import {
  preferredSceneMapPositionBeside,
  sceneMapCardSize,
  SCENE_MAP_HORIZONTAL_GAP
} from "./sceneMapLayout.js";
import type { GBAProjectData } from "./projectFile.js";
import type { RoomCollisionType, RoomsWorkspaceEntity, RoomsWorkspaceRoom } from "./roomsWorkspace.js";
import { DEFAULT_ISOMETRIC_SCENE_CONFIG } from "./sceneTypeProfiles.js";
import { SCENE_TYPE_OPTIONS } from "./sceneTypes.js";
import { sceneTileLayerEmptyTile, sceneTileLayerOrderedMappings } from "./sceneTileLayers.js";

describe("Rooms workspace presentation", () => {
  it("persiste campos comuns e remove aliases legados ao editar uma cena", () => {
    const project = createBlankProjectData({ name: "Persistência comum" });
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    room.id = "room-porto";
    room.name = "porto";
    room.width = 2;
    room.height = 1;
    room.background = "legacy.png";
    room.collisions = ["solid", "free"];
    delete room.backgroundAssetName;
    delete room.collisionTypes;

    const next = updateRoomFieldsInProject(project, "room-porto", {
      backgroundAssetName: "",
      collisionTypes: ["solid", "free"]
    });
    const savedRoom = (next.scenas as Record<string, unknown>[])[0]!;

    expect(savedRoom.backgroundAssetName).toBeUndefined();
    expect(savedRoom.background).toBeUndefined();
    expect(savedRoom.collisionTypes).toEqual(["solid", "free"]);
    expect(savedRoom.collisions).toBeUndefined();
    expect(deriveRoomsWorkspacePresentation(next).rooms[0]).toMatchObject({
      background: null,
      collisionCount: 1
    });
  });

  it("usa os aliases do documento comum na projeção do Editor", () => {
    const project = createBlankProjectData({ name: "Cena normalizada" });
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    room.id = "room-porto";
    room.name = "porto";
    room.width = 24;
    room.height = 16;
    room.background = "porto.png";
    delete room.backgroundAssetName;
    room.backgroundRenderMode = "tilemap";
    room.runtime = { type: "topdown", config: { hudPresetId: "hud-map-corners" } };
    room.eventBindings = { onInit: "porto_boot" };
    room.collisions = Array.from({ length: 24 * 16 }, (_value, index) => index === 0 ? "solid" : "free");
    delete room.collisionTypes;

    const presentedRoom = deriveRoomsWorkspacePresentation(project).rooms[0];

    expect(presentedRoom).toMatchObject({
      id: "room-porto",
      name: "porto",
      width: 24,
      height: 16,
      background: "porto.png",
      hudPresetId: "hud-map-corners",
      eventBindings: { onInit: "porto_boot" },
      collisionCount: 1
    });
    expect(presentedRoom?.collisionCells[0]).toBe(true);
  });

  it("preserva o nome de apresentação e a campanha da cena no Editor", () => {
    const project = createBlankProjectData({ name: "Campanha no editor" });
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    room.displayName = "Jogo · Porto de Lúmen";
    room.campaign = {
      chapter: 2,
      title: "Capítulo 1 · Porto de Lúmen",
      objective: "Encontrar a estrutura.",
      nextScene: "route",
      completionVariable: "farolParts.frame",
      controls: "Direcional move.",
      success: "Rota aberta.",
      failureRecovery: "Tente novamente."
    };

    const presentedRoom = deriveRoomsWorkspacePresentation(project).rooms[0];

    expect(presentedRoom).toMatchObject({
      displayName: "Jogo · Porto de Lúmen",
      campaign: {
        chapter: 2,
        title: "Capítulo 1 · Porto de Lúmen",
        objective: "Encontrar a estrutura.",
        nextScene: "route",
        completionVariable: "farolParts.frame"
      }
    });
  });

  it("atualiza os metadados da campanha sem mutar o projeto original", () => {
    const project = createBlankProjectData({ name: "Campanha editável" });
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    room.campaign = {
      chapter: 1,
      title: "Capítulo inicial",
      objective: "Chegar ao porto.",
      nextScene: "porto",
      completionVariable: "chapter",
      completedValue: 1,
      controls: "Direcional move.",
      success: "Rota aberta.",
      failureRecovery: "Tente novamente.",
      tutorialDialogue: null
    };

    const next = updateRoomFieldsInProject(project, String(room.id), {
      campaign: {
        title: "Capítulo 1 · Porto",
        objective: "Encontrar a estrutura da aeronave.",
        nextScene: "route",
        completionVariable: "farolParts.frame",
        completedValue: 2
      }
    });
    const nextCampaign = (next.scenas as Record<string, unknown>[])[0]!.campaign as Record<string, unknown>;

    expect(nextCampaign).toMatchObject({
      chapter: 1,
      title: "Capítulo 1 · Porto",
      objective: "Encontrar a estrutura da aeronave.",
      nextScene: "route",
      completionVariable: "farolParts.frame",
      completedValue: 2,
      controls: "Direcional move."
    });
    expect((project.scenas as Record<string, unknown>[])[0]!.campaign).toMatchObject({
      title: "Capítulo inicial",
      nextScene: "porto",
      completedValue: 1
    });

    const cleared = updateRoomFieldsInProject(next, String(room.id), { campaign: null });
    expect((cleared.scenas as Record<string, unknown>[])[0]!.campaign).toBeUndefined();
  });

  it("snaps a tileset selection to a reusable 16x16 metatile", () => {
    expect(deriveMetatileTilesetStamp({
      anchorTileID: 7,
      blockHeight: 2,
      blockWidth: 2,
      imageHeight: 32,
      imageWidth: 32,
      tileHeight: 8,
      tileWidth: 8
    })).toEqual({
      height: 2,
      tileIDs: [3, 4, 7, 8],
      width: 2
    });
  });

  it("exposes the modular map contract for the canonical-sized topdown scene", () => {
    const project = createBlankProjectData({ name: "Mapa modular" });
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    room.sceneType = "topdown";
    room.width = 60;
    room.height = 40;
    room.tilemap = Array.from({ length: 60 * 40 }, () => 0);
    room.collisionTypes = Array.from({ length: 60 * 40 }, () => "free");

    const presentation = deriveRoomsWorkspacePresentation(project);

    expect(presentation.rooms[0]?.tilemapContract).toMatchObject({
      id: "gba-regular-metatile-2x2-v1",
      metatileWidth: 2,
      metatileHeight: 2,
      logicalLayers: [
        { id: "base", hardwareMapping: "BG2" },
        { id: "top", hardwareMapping: "BG1" }
      ]
    });
  });

  it("persists editor controls for the four GBA background layers", () => {
    const project = createBlankProjectData({ name: "Camadas" });
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    const roomID = String(room.id);
    const next = updateRoomFieldsInProject(project, roomID, {
      layerEditing: {
        BG3: { hidden: true, locked: true, opacity: 0.35, solo: false, parallaxCurve: [{ input: 0, output: 0 }, { input: 1, output: 0.5 }] }
      }
    });
    const presentation = deriveRoomsWorkspacePresentation(next);
    const layer = presentation.rooms[0].layerEditing!.BG3;

    expect(layer).toMatchObject({ hidden: true, locked: true, opacity: 0.35, solo: false });
    expect(layer.parallaxCurve).toEqual([{ input: 0, output: 0 }, { input: 1, output: 0.5 }]);
  });

  it("applies one authored palette family to the room background and objects", () => {
    const project = createBlankProjectData({ name: "Familia de paleta" });
    project.paletteFamilies = [{
      id: "forest-dawn",
      name: "Floresta ao amanhecer",
      background: [0x0000, 0x01e0, 0x03e0],
      objects: [0x0000, 0x03e0, 0x7fff]
    }];
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    room.paletteFamilyID = "forest-dawn";

    expect(deriveRoomsWorkspacePresentation(project).rooms[0]).toMatchObject({
      paletteFamilyID: "forest-dawn",
      paletteFamilyName: "Floresta ao amanhecer",
      backgroundPalette: [0x0000, 0x01e0, 0x03e0],
      objectPalette: [0x0000, 0x03e0, 0x7fff]
    });
  });

  it("persists the scene palette bank policy for the editor and exporter", () => {
    const project = createBlankProjectData({ name: "Política de paleta" });
    const roomID = String((project.scenas as Record<string, unknown>[])[0]!.id);
    const next = updateRoomFieldsInProject(project, roomID, { paletteBankPolicy: "full-screen" });

    expect(deriveRoomsWorkspacePresentation(next).rooms[0]).toMatchObject({
      paletteBankPolicy: "full-screen"
    });
    expect((next.scenas as Record<string, unknown>[])[0]!.paletteBankPolicy).toBe("full-screen");
  });

  it("deriva conexoes visuais dos comandos change_scene sem criar portais persistidos", () => {
    const project = createBlankProjectData({ name: "Mapa conectado" });
    project.scenas = [
      { id: "room-a", name: "cave", width: 20, height: 18 },
      { id: "room-b", name: "town", width: 20, height: 18 }
    ];
    project.events = [{
      id: "event-exit",
      name: "cave_exit",
      roomName: "cave",
      steps: [
        { command: "change_scene town 4 5 down" },
        { command: "show_dialogue welcome" },
        { command: "change_scene missing 0 0 down" }
      ]
    }];

    expect(deriveRoomEventSceneLinks(project)).toEqual([{
      id: "event-scene-link-event-exit-0",
      from: "cave",
      to: "town",
      eventName: "cave_exit",
      eventID: "event-exit",
      stepIndex: 0,
      command: "change_scene town 4 5 down",
      x: 4,
      y: 5,
      direction: "down"
    }]);
    expect((project.editorState as Record<string, unknown>).scenaConnections).toEqual([]);
  });

  it("deriva conexoes visuais das acoes push_screen sem criar arestas persistidas", () => {
    const project = createBlankProjectData({ name: "Menu conectado" });
    project.scenas = [
      {
        id: "room-menu",
        name: "menu_root",
        width: 20,
        height: 14,
        runtime: {
          type: "menu",
          config: {
            items: [{
              id: "settings",
              label: "Configurações",
              action: "push_screen",
              targetScreenID: "settings",
              eventName: "open_settings"
            }]
          }
        }
      },
      { id: "room-settings", name: "settings", width: 20, height: 14 }
    ];

    expect(deriveRoomEventSceneLinks(project)).toEqual([{
      id: "menu-scene-link-menu_root-settings",
      from: "menu_root",
      to: "settings",
      eventName: "open_settings",
      eventID: null,
      stepIndex: null,
      command: null,
      x: null,
      y: null,
      direction: null
    }]);
    expect((project.editorState as Record<string, unknown>).scenaConnections).toEqual([]);
  });

  it("resolve a origem de uma troca de cena pelo trigger vinculado e materializa a chegada", () => {
    const project = createBlankProjectData({ name: "Transição por trigger" });
    project.scenas = [
      { id: "room-a", name: "cave", width: 20, height: 18 },
      { id: "room-b", name: "town", width: 20, height: 18 }
    ];
    project.triggers = [{
      id: "trigger-exit",
      name: "Saída",
      roomName: "cave",
      eventName: "cave_exit"
    }];
    project.events = [{
      id: "event-exit",
      name: "cave_exit",
      steps: [{ command: "change_scene town" }]
    }];

    expect(deriveRoomEventSceneLinks(project)).toEqual([{
      id: "event-scene-link-event-exit-0",
      from: "cave",
      to: "town",
      eventName: "cave_exit",
      eventID: "event-exit",
      stepIndex: 0,
      command: "change_scene town",
      x: 10,
      y: 9,
      direction: "down"
    }]);
  });

  it("atualiza a posição e a direção de uma troca de cena sem criar uma conexão explícita", () => {
    expect(updateRoomEventSceneLinkCommand("change_scene town", {
      direction: "right",
      x: 4,
      y: 5
    })).toBe("change_scene town 4 5 right");
  });

  it("persiste alturas isometricas de 0 a 3 e as expoe no overlay do editor", () => {
    const base = createRoomInProject(createBlankProjectData({ name: "Alturas isometricas" }), {
      id: "room-iso",
      name: "Praca elevada",
      width: 4,
      height: 3,
      sceneType: "isometric"
    });

    const raised = setRoomHeightLevelInProject(base, "room-iso", 5, 2);
    const clamped = setRoomHeightLevelInProject(raised, "room-iso", 6, 9);
    const room = deriveRoomsWorkspacePresentation(clamped).rooms.find((entry) => entry.id === "room-iso")!;
    const overlays = deriveRoomTileOverlayCells(room, []);
    if (!room.heightLevels) throw new Error("A sala isometrica deve expor heightLevels.");

    expect((clamped.scenas as Record<string, unknown>[]).at(-1)?.heightLevels).toHaveLength(4 * 3);
    expect(room.heightLevels).toHaveLength(4 * 3);
    expect(room.heightLevels[5]).toBe(2);
    expect(room.heightLevels[6]).toBe(3);
    expect(overlays[5]).toMatchObject({ heightLevel: 2, elevated: true });
    expect(overlays[6]).toMatchObject({ heightLevel: 3, elevated: true });
  });

  it("marca no overlay rampas, bloqueios e tiles da camada frontal", () => {
    const project = createRoomInProject(createBlankProjectData({ name: "Overlay isometrico" }), {
      id: "room-iso-overlay",
      name: "Bosque",
      width: 3,
      height: 2,
      sceneType: "isometric"
    });
    const roomRecord = (project.scenas as Record<string, unknown>[]).at(-1)!;
    roomRecord.collisionTypes = ["free", "slope_up_right", "solid", "free", "free", "free"];
    roomRecord.heightLevels = [0, 1, 1, 0, 0, 0];
    roomRecord.tileLayers = [
      { mapping: "BG2", tilemap: [1, 1, 1, 1, 1, 1] },
      { mapping: "BG1", tilemap: [-1, -1, 7, -1, -1, -1] }
    ];

    const room = deriveRoomsWorkspacePresentation(project).rooms.find((entry) => entry.id === "room-iso-overlay")!;
    const overlays = deriveRoomTileOverlayCells(room, []);

    expect(overlays[1]).toMatchObject({ collisionType: "slope_up_right", ramp: true, heightLevel: 1 });
    expect(overlays[2]).toMatchObject({ collision: true, foreground: true, heightLevel: 1 });
    expect(room.foregroundTileCount).toBe(1);
  });

  it("creates distinct room presets and initializes isometric rooms with the bundled tilemap", () => {
    const base = createBlankProjectData({ name: "Presets de room" });
    const expected = {
      isometricAdventure: {width: 36, height: 36, sceneType: "isometric", cameraMode: "follow_player"},
      isometricTactical: {width: 6, height: 6, sceneType: "isometric", cameraMode: "fixed_center"},
      interior: { width: 30, height: 20, sceneType: "topdown", cameraMode: "fixed_center" },
      exterior: { width: 30, height: 20, sceneType: "topdown", cameraMode: "follow_player" },
      battle: { width: 30, height: 20, sceneType: "battleRpg", cameraMode: "fixed_center" },
      luta: { width: 40, height: 20, sceneType: "luta", cameraMode: "fixed_center" },
      dialogue: { width: 30, height: 20, sceneType: "visualNovel", cameraMode: "fixed_center" },
      transition: { width: 30, height: 20, sceneType: "cutscene", cameraMode: "fixed_center" },
      logo: { width: 30, height: 20, sceneType: "menu", cameraMode: "fixed_center", runtime: { type: "menu", config: expect.objectContaining({ screenType: "logo" }) } },
      title: { width: 30, height: 20, sceneType: "menu", cameraMode: "fixed_center", runtime: { type: "menu", config: expect.objectContaining({ screenType: "title" }) } },
      menu: { width: 30, height: 20, sceneType: "menu", cameraMode: "fixed_center", runtime: { type: "menu", config: expect.objectContaining({ screenType: "menu" }) } },
      startMenu: { width: 30, height: 20, sceneType: "menu", cameraMode: "fixed_center", runtime: { type: "menu", config: expect.objectContaining({ screenType: "menu", role: "start" }) } }
    } as const;

    expect(ROOM_PRESETS.map((preset) => preset.id)).toEqual(Object.keys(expected));
    for (const preset of ROOM_PRESETS) {
      const next = createRoomInProject(base, {
        id: `room-${preset.id}`,
        name: preset.label,
        width: 8,
        height: 8,
        sceneType: "topdown",
        presetID: preset.id
      });
      const created = (next.scenas as Record<string, unknown>[]).at(-1);
      expect(created).toMatchObject(expected[preset.id]);
    }

    const minimumSizedDefault = createRoomInProject(base, {
      id: "room-default",
      name: "Padrao",
      width: 12,
      height: 9,
      sceneType: "isometric"
    });
    expect((minimumSizedDefault.scenas as Record<string, unknown>[]).at(-1)).toMatchObject({
      width: 12,
      height: 9,
      sceneType: "isometric",
      cameraMode: "fixed_center",
      cameraZoom: 100,
      backgroundAssetName: "isometric-sandbox-sheet.png",
      tilemap: Array.from({ length: 12 * 9 }, () => 1)
    });
    expect(minimumSizedDefault.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "isometric-sandbox-sheet.png",
        kind: "Tileset",
        metadata: expect.objectContaining({ bundledDefaultAsset: "isometric-sandbox-tiles" })
      })
    ]));
    expect(deriveRoomsWorkspacePresentation(minimumSizedDefault).rooms.at(-1)).toMatchObject({
      backgroundBundledDefaultAsset: "isometric-sandbox-tiles"
    });

    const scrollingRoom = createRoomInProject(base, {
      id: "room-scrolling",
      name: "Mapa amplo",
      width: 80,
      height: 32,
      sceneType: "topdown"
    });
    expect((scrollingRoom.scenas as Record<string, unknown>[]).at(-1)).toMatchObject({
      width: 80,
      height: 32
    });
  });

  it("materializes BG3, BG2, BG1 and BG0 for every scene type created in Mode 0", () => {
    for (const sceneType of SCENE_TYPE_OPTIONS) {
      const project = createRoomInProject(createBlankProjectData({ name: `Layers ${sceneType.id}` }), {
        id: `room-${sceneType.id}`,
        name: `Scene ${sceneType.id}`,
        width: 30,
        height: 20,
        sceneType: sceneType.id
      });
      const room = (project.scenas as Array<Record<string, unknown>>).at(-1);
      const layers = room?.tileLayers as Array<{ mapping: string; tilemap: number[] }> | undefined;

      expect(layers?.map((layer) => layer.mapping), sceneType.id).toEqual(sceneTileLayerOrderedMappings);
      expect(layers?.every((layer) => layer.tilemap.length === 30 * 20), sceneType.id).toBe(true);
      expect(layers?.find((layer) => layer.mapping === "BG3")?.tilemap, sceneType.id)
        .toEqual(Array.from({ length: 30 * 20 }, () => sceneTileLayerEmptyTile));
    }
  });

  it("applies the bundled tilemap when a blank room becomes isometric", () => {
    const project = setActiveRoomInProject(
      createBlankProjectData({ name: "Conversao isometrica" }),
      "room-1"
    );

    const next = updateRoomFieldsInProject(project, "room-1", { sceneType: "isometric" });
    const room = (next.scenas as Record<string, unknown>[])[0];

    expect(room).toMatchObject({
      sceneType: "isometric",
      backgroundAssetName: "isometric-sandbox-sheet.png",
      tilemap: Array.from({ length: 30 * 20 }, () => 1)
    });
    expect(next.scena).toMatchObject({
      sceneType: "isometric",
      backgroundAssetName: "isometric-sandbox-sheet.png",
      tilemap: Array.from({ length: 30 * 20 }, () => 1)
    });
  });

  it("preserves an explicitly selected tileset when a room becomes isometric", () => {
    const project = createBlankProjectData({ name: "Isometrico personalizado" });

    const next = updateRoomFieldsInProject(project, "room-1", {
      sceneType: "isometric",
      backgroundAssetName: "custom-isometric.png"
    });
    const room = (next.scenas as Record<string, unknown>[])[0];

    expect(room).toMatchObject({
      sceneType: "isometric",
      backgroundAssetName: "custom-isometric.png",
      tilemap: Array.from({ length: 30 * 20 }, () => 0)
    });
    expect((next.assets as Record<string, unknown>[]).some(
      (asset) => asset.name === "isometric-sandbox-sheet.png"
    )).toBe(false);
  });

  it("updates battle outcome bindings without discarding existing room events", () => {
    const project = createBlankProjectData({ name: "Battle outcomes" });
    const rooms = project.scenas as Record<string, unknown>[];
    rooms[0] = { ...rooms[0], eventBindings: { onInit: "battle_start", onVictory: "old_victory" } };

    const next = updateRoomFieldsInProject(project, "room-1", {
      eventBindings: { onVictory: "battle_won", onDefeat: "battle_lost" }
    });

    expect((next.scenas as Record<string, unknown>[])[0]).toMatchObject({
      eventBindings: { onInit: "battle_start", onVictory: "battle_won", onDefeat: "battle_lost" }
    });
  });

  it("composes only the room layers that are visible in the editor", () => {
    expect(composeVisibleRoomTileCells({
      width: 2,
      height: 1,
      tileLayers: [
        { mapping: "BG2", label: "Mapa principal", tilemap: [1, -1], paintedTileCount: 1 },
        { mapping: "BG1", label: "Overlay", tilemap: [2, 3], paintedTileCount: 2 }
      ]
    }, ["BG2", "BG1"])).toEqual([2, 3]);
    expect(composeVisibleRoomTileCells({
      width: 2,
      height: 1,
      tileLayers: [
        { mapping: "BG2", label: "Mapa principal", tilemap: [1, -1], paintedTileCount: 1 },
        { mapping: "BG1", label: "Overlay", tilemap: [2, 3], paintedTileCount: 2 }
      ]
    }, ["BG2"])).toEqual([1, 0]);
  });
  it("persists scene map positions and zoom in editor state", () => {
    const project = {
      editorState: {
        sceneMapPositions: {
          overworld: { x: 10.4, y: 20.6 },
          "": { x: 1, y: 1 },
          broken: { x: "nope", y: 3 }
        },
        sceneMapZoom: 8
      }
    };

    expect(sceneMapPositions(project)).toEqual({ overworld: { x: 10, y: 21 } });
    expect(sceneMapZoom(project)).toBe(4);

    const moved = updateSceneMapPositionInProject(project, "shop", { x: 44.8, y: 90.2 });
    const next = updateSceneMapZoomInProject(moved, 0.1);

    expect(next).not.toBe(project);
    expect(sceneMapPositions(next)).toEqual({
      overworld: { x: 10, y: 21 },
      shop: { x: 45, y: 90 }
    });
    expect(sceneMapZoom(next)).toBe(0.25);
  });

  it("organizes scene map positions by room order and card height", () => {
    const project = {
      scenas: [
        { id: "room-1", name: "logo", width: 30, height: 20 },
        { id: "room-2", name: "wide", width: 60, height: 40 },
        { id: "room-3", name: "menu", width: 30, height: 20 },
        { id: "room-4", name: "next", width: 30, height: 20 },
        { id: "room-5", name: "after", width: 30, height: 20 }
      ],
      editorState: {
        sceneMapPositions: {
          logo: { x: 1000, y: 1000 },
          wide: { x: 1000, y: 1000 }
        }
      }
    };

    const next = organizeSceneMapPositionsInProject(project);

    expect(sceneMapPositions(next)).toEqual({
      logo: { x: 36, y: 36 },
      wide: { x: 324, y: 36 },
      menu: { x: 852, y: 36 },
      next: { x: 1140, y: 36 },
      after: { x: 36, y: 498 }
    });
    expect(project.editorState.sceneMapPositions.logo).toEqual({ x: 1000, y: 1000 });
  });

  it("organizes isometric cards using their composed surface dimensions", () => {
    const project = {
      scenas: [
        { id: "market", name: "market", width: 25, height: 25, sceneType: "isometric", runtime: {
          type: "isometric", config: { pagedSurface: {
            backgroundAsset: "market.png", foregroundAsset: "market-front.png", width: 512, height: 344
          } }
        } },
        { id: "next", name: "next", width: 30, height: 20 },
        { id: "third", name: "third", width: 30, height: 20 },
        { id: "fourth", name: "fourth", width: 30, height: 20 },
        { id: "below", name: "below", width: 30, height: 20 }
      ]
    };
    const positions = sceneMapPositions(organizeSceneMapPositionsInProject(project));
    expect(positions.next).toEqual({ x: 596, y: 36 });
    expect(positions.below).toEqual({ x: 36, y: 522 });
  });

  it("derives rooms from current scenas fields with active and start-room markers", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scena: { name: "overworld", width: 30, height: 20 },
      scenas: [
        {
          name: "overworld",
          width: 30,
          height: 20,
          music: "intro.mod",
          cameraMode: "Follow Player",
          sceneType: "topdown",
          playerActorName: "Player",
          backgroundAssetName: "forest.png",
          backgroundRenderMode: "hybrid",
          tilemap: [1, 2, 3],
          collisionTypes: ["solid", "free"],
          referenceImages: [{ assetName: "guide.png" }]
        },
        {
          name: "shop",
          width: 20,
          height: 18,
          music: "",
          cameraMode: "Fixed",
          sceneType: "pointAndClick",
          backgroundRenderMode: "tilemap",
          tilemap: [],
          collisionTypes: [],
          referenceImages: []
        }
      ],
      assets: [
        { name: "forest.png", kind: "Tileset", metadata: { source: "Assets/tiles/forest.png", tileWidth: 16, tileHeight: 8, tileOffsetX: 2, tileOffsetY: 4 } },
        { name: "portrait.png", kind: "Sprite", metadata: { source: "Assets/portrait.png", bundledDefaultAsset: "topdown-player-4dir" } },
        { name: "parallax.png", kind: "Background" }
      ],
      animations: [
        {
          id: "anim-portrait-idle",
          name: "idle_down",
          spriteSheet: "portrait.png",
          frameWidth: 16,
          frameHeight: 16,
          frames: [
            {
              width: 16,
              height: 16,
              tiles: [{ sliceX: 32, sliceY: 16, tileWidth: 16, tileHeight: 16 }]
            }
          ]
        }
      ],
      audioItems: [
        { name: "intro.mod", kind: "Musica" },
        { name: "confirm.wav", kind: "SFX" }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "overworld", x: 4, y: 5, eventName: "player_start", spriteSheet: "portrait.png", animationName: "idle_down" },
        { id: "actor-shopkeeper", name: "Shopkeeper", roomName: "shop", x: 2, y: 3 }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "overworld", x: 10, y: 11, width: 2, height: 1, eventName: "door_enter" },
        { id: "trigger-exit", name: "Exit", roomName: "shop", x: 1, y: 1, width: 1, height: 1 }
      ],
      editorState: {
        scenaConnections: [
          { from: "overworld", to: "shop", eventName: "door_enter" },
          { from: "shop", to: "overworld", eventName: "door_exit" }
        ]
      },
      settings: { general: { startScene: "shop" } }
    });

    expect(presentation.summary).toEqual({
      roomCount: 2,
      activeRoomName: "overworld",
      startRoomName: "shop",
      sceneTypes: [
        { sceneType: "pointAndClick", count: 1 },
        { sceneType: "topdown", count: 1 }
      ],
      totalTiles: 960,
      warningCount: 0
    });
    expect(presentation.rooms[0]).toMatchObject({
      name: "overworld",
      width: 30,
      height: 20,
      gbaResolution: "240 x 160",
      music: "intro.mod",
      cameraMode: "follow_player",
      cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
      cameraBoundsEditable: false,
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      sceneType: "topdown",
      playerActorName: "Player",
      background: "forest.png",
      backgroundSource: "Assets/tiles/forest.png",
      backgroundTileHeight: 8,
      backgroundTileOffsetX: 2,
      backgroundTileOffsetY: 4,
      backgroundTileWidth: 16,
      backgroundRenderMode: "hybrid",
      tileCount: 600,
      collisionCount: 1,
      referenceImageCount: 1,
      isActive: true,
      isStart: false,
      warnings: []
    });
    expect(presentation.rooms[0].collisionCells.slice(0, 4)).toEqual([true, false, false, false]);
    expect(presentation.rooms[0].tileCells.slice(0, 5)).toEqual([1, 2, 3, 0, 0]);
    expect(presentation.rooms[1]).toMatchObject({
      name: "shop",
      music: null,
      background: null,
      isActive: false,
      isStart: true
    });
    expect(presentation.options).toEqual({
      backgroundAssets: [
        { label: "forest.png", value: "forest.png" },
        { label: "parallax.png", value: "parallax.png" }
      ],
      actorSpriteSheets: [
        { label: "portrait.png", value: "portrait.png" }
      ],
      actorAnimations: [
        { label: "idle_down", value: "idle_down" }
      ],
      actorAnimationStates: [],
      actorAnimationVariants: [
        { animationName: "idle_down", spriteSheet: "portrait.png", state: "idle", direction: "down" }
      ],
      musicItems: [
        { label: "intro.mod", value: "intro.mod" },
        { label: "confirm.wav", value: "confirm.wav" }
      ],
      paletteFamilies: [],
      playerActors: [
        { label: "Player", value: "Player" },
        { label: "Shopkeeper", value: "Shopkeeper" }
      ]
    });
    expect(presentation.connections).toEqual([
      {
        index: 0,
        from: "overworld",
        to: "shop",
        eventName: "door_enter",
        exit: null,
        entry: null,
        transition: { style: "cut", durationFrames: 30, fadeOut: true, fadeIn: true },
        transitionSource: "project-default",
        isFromActive: true,
        isToActive: false
      },
      {
        index: 1,
        from: "shop",
        to: "overworld",
        eventName: "door_exit",
        exit: null,
        entry: null,
        transition: { style: "cut", durationFrames: 30, fadeOut: true, fadeIn: true },
        transitionSource: "project-default",
        isFromActive: false,
        isToActive: true
      }
    ]);
    expect(presentation.tilePalette).toEqual([0, 1, 2, 3]);
    expect(presentation.entities).toEqual([
      {
        kind: "actor",
        id: "actor-player",
        name: "Player",
        isPlayer: true,
        roomName: "overworld",
        x: 4,
        y: 5,
        width: 1,
        height: 1,
        eventName: "player_start",
        spriteSheet: "portrait.png",
        spriteSource: "Assets/portrait.png",
        spriteBundledDefaultAsset: "topdown-player-4dir",
        spriteFrame: {
          animationID: "anim-portrait-idle",
          animationName: "idle_down",
          fps: 1,
          frameHeight: 16,
          frameIndex: 0,
          frameWidth: 16,
          heightTiles: 2,
          layer: "OBJ",
          originX: 8,
          originY: 8,
          sourceHeight: 16,
          sourceSheets: ["portrait.png"],
          sourceWidth: 16,
          sourceX: 32,
          sourceY: 16,
          spriteSheet: "portrait.png",
          tileCount: 1,
          widthTiles: 2
        },
        animationName: "idle_down",
        battle: { side: "none", maxHp: 24, attack: 7, defense: 2, speed: 5, abilities: ["attack"] },
        collisionGroup: 0,
        collisionMask: 65535,
        pushPriority: 0,
        pushable: false,
        isInActiveRoom: true
      },
      {
        kind: "actor",
        id: "actor-shopkeeper",
        name: "Shopkeeper",
        roomName: "shop",
        x: 2,
        y: 3,
        width: 1,
        height: 1,
        eventName: null,
        spriteSheet: null,
        spriteSource: null,
        spriteBundledDefaultAsset: null,
        spriteFrame: null,
        animationName: null,
        battle: { side: "none", maxHp: 24, attack: 7, defense: 2, speed: 5, abilities: ["attack"] },
        collisionGroup: 0,
        collisionMask: 65535,
        pushPriority: 0,
        pushable: false,
        isInActiveRoom: false
      },
      {
        kind: "trigger",
        id: "trigger-door",
        name: "Door",
        roomName: "overworld",
        x: 10,
        y: 11,
        width: 2,
        height: 1,
        eventName: "door_enter",
        spriteSheet: null,
        spriteSource: null,
        spriteBundledDefaultAsset: null,
        spriteFrame: null,
        animationName: null,
        isInActiveRoom: true
      },
      {
        kind: "trigger",
        id: "trigger-exit",
        name: "Exit",
        roomName: "shop",
        x: 1,
        y: 1,
        width: 1,
        height: 1,
        eventName: null,
        spriteSheet: null,
        spriteSource: null,
        spriteBundledDefaultAsset: null,
        spriteFrame: null,
        animationName: null,
        isInActiveRoom: false
      }
    ]);
  });

  it("derives backgroundSource for imported tilesets without metadata.source", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scenas: [{
        id: "room-overworld",
        name: "overworld",
        width: 6,
        height: 4,
        backgroundAssetName: "tileset.png"
      }],
      assets: [{
        id: "asset-tileset",
        name: "tileset.png",
        kind: "Tileset",
        relativePath: "Assets/tilesets/tileset.png"
      }]
    });

    expect(presentation.rooms[0]?.backgroundSource).toBe("Assets/tilesets/tileset.png");
  });

  it("derives ordered full-scene background layers from authored tile source assets", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scenas: [{
        id: "room-layered-platformer",
        name: "layered_platformer",
        width: 2,
        height: 2,
        sceneType: "platformer",
        backgroundAssetName: "terrain.png",
        gbStudioUseBackgroundLayout: true,
        tileLayers: [
          { mapping: "BG3", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["sky.png", "sky.png", "sky.png", "sky.png"] },
          { mapping: "BG2", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["terrain.png", "terrain.png", "terrain.png", "terrain.png"] },
          { mapping: "BG1", tilemap: [0, 0, 0, 0], tileSourceAssetNames: ["details.png", "details.png", "details.png", "details.png"] },
          { mapping: "BG0", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] }
        ]
      }],
      assets: [
        { id: "asset-sky", name: "sky.png", kind: "Background", metadata: { source: "Assets/backgrounds/sky.png" } },
        { id: "asset-terrain", name: "terrain.png", kind: "Background", metadata: { source: "Assets/backgrounds/terrain.png" } },
        { id: "asset-details", name: "details.png", kind: "Background", metadata: { source: "Assets/backgrounds/details.png" } }
      ],
      settings: { backgrounds: { graphicsMode: "Mode 0 - Tilemaps" } }
    });

    expect(presentation.rooms[0]?.backgroundLayers).toEqual([
      { mapping: "BG3", assetName: "sky.png", source: "Assets/backgrounds/sky.png", bundledDefaultAsset: null },
      { mapping: "BG2", assetName: "terrain.png", source: "Assets/backgrounds/terrain.png", bundledDefaultAsset: null },
      { mapping: "BG1", assetName: "details.png", source: "Assets/backgrounds/details.png", bundledDefaultAsset: null }
    ]);
  });

  it("derives contextual actor animation variants and resolves only valid state-direction pairs", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      animationStates: [
        { id: "state-hero", name: "Hero principal", spriteSheet: "hero.png", animationType: "four_direction_movement", mirrorLeftFromRight: true, animationIDs: [] },
        { id: "state-enemy", name: "Inimigo", spriteSheet: "enemy.png", animationType: "four_direction", mirrorLeftFromRight: false, animationIDs: [] }
      ],
      animations: [
        { name: "idle_down", spriteSheet: "hero.png", state: "idle", direction: "down" },
        { name: "idle_up", spriteSheet: "hero.png", state: "idle", direction: "up" },
        { name: "walk_down", spriteSheet: "hero.png", state: "walk", direction: "down" },
        { name: "celebrate", spriteSheet: "hero.png", state: "celebrate" },
        { name: "idle_left", spriteSheet: "enemy.png", state: "idle", direction: "left" }
      ]
    });

    expect(presentation.options.actorAnimationVariants).toEqual([
      { animationName: "idle_down", spriteSheet: "hero.png", state: "idle", direction: "down" },
      { animationName: "idle_up", spriteSheet: "hero.png", state: "idle", direction: "up" },
      { animationName: "walk_down", spriteSheet: "hero.png", state: "walk", direction: "down" },
      { animationName: "celebrate", spriteSheet: "hero.png", state: "celebrate", direction: null },
      { animationName: "idle_left", spriteSheet: "enemy.png", state: "idle", direction: "left" }
    ]);
    expect(presentation.options.actorAnimationStates).toEqual([
      { label: "Hero principal", value: "state-hero", spriteSheet: "hero.png" },
      { label: "Inimigo", value: "state-enemy", spriteSheet: "enemy.png" }
    ]);
    expect(resolveActorAnimationName(presentation.options.actorAnimationVariants, {
      spriteSheet: "hero.png",
      state: "idle",
      direction: "up"
    })).toBe("idle_up");
    expect(resolveActorAnimationName(presentation.options.actorAnimationVariants, {
      spriteSheet: "hero.png",
      state: "walk",
      direction: "up"
    })).toBe("walk_down");
    expect(resolveActorAnimationName(presentation.options.actorAnimationVariants, {
      spriteSheet: "hero.png",
      state: "celebrate",
      direction: null
    })).toBe("celebrate");
  });

  it("falls back to the tileset folder convention when only the asset name is known", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scenas: [{
        id: "room-overworld",
        name: "overworld",
        width: 6,
        height: 4,
        backgroundAssetName: "tileset.png"
      }],
      assets: [{
        id: "asset-tileset",
        name: "tileset.png",
        kind: "Tileset"
      }]
    });

    expect(presentation.rooms[0]?.backgroundSource).toBe("Assets/tilesets/tileset.png");
  });

  it("derives contextual editor tool panels for paint, collision, actors, triggers and room settings", () => {
    const room: RoomsWorkspaceRoom = {
      id: "room-overworld",
      name: "overworld_start",
      width: 30,
      height: 20,
      gbaResolution: "240 x 160",
      music: "intro_theme.mod",
      cameraMode: "fixed_center",
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
      cameraBoundsEditable: false,
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      sceneType: "topdown",
      playerActorName: "Player",
      background: "tiles_overworld.png",
      backgroundSource: "assets/tiles_overworld.png",
      backgroundBundledDefaultAsset: null,
      backgroundTileHeight: 16,
      backgroundTileOffsetX: 0,
      backgroundTileOffsetY: 0,
      backgroundTileWidth: 16,
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: false,
      tileCount: 600,
      tileCells: [],
      activeLayerTileCells: [],
      collisionCount: 3,
      collisionCells: [],
      referenceImageCount: 0,
      layeredPaintingEnabled: false,
      activeTileLayerMapping: "BG2",
      paintedTileCount: 0,
      isActive: true,
      isStart: true,
      warnings: []
    };
    const entities: RoomsWorkspaceEntity[] = [
      {
        kind: "actor",
        id: "actor-player",
        name: "Player",
        roomName: "overworld_start",
        x: 15,
        y: 10,
        width: 1,
        height: 1,
        eventName: "player_start",
        isInActiveRoom: true
      },
      {
        kind: "trigger",
        id: "trigger-door",
        name: "Door",
        roomName: "overworld_start",
        x: 28,
        y: 8,
        width: 2,
        height: 1,
        eventName: "door_enter",
        isInActiveRoom: true
      }
    ];

    expect(deriveRoomEditorToolPanel(room, entities, {
      mode: "paint",
      selectedPaintTool: "brush",
      selectedTileID: 7
    })).toMatchObject({
      mode: "paint",
      title: "Pintura de tiles",
      badge: "Tile 7",
      metrics: [
        { label: "Camada", value: "Mapa principal" },
        { label: "Modo", value: "Pincel" },
        { label: "Tile", value: "7" },
        { label: "Grade", value: "16x16" }
      ]
    });
    expect(deriveRoomEditorToolPanel(room, entities, { mode: "collision" })).toMatchObject({
      mode: "collision",
      title: "Colisao",
      badge: "3 solidos",
      metrics: [
        { label: "Tipo ativo", value: "Solido" },
        { label: "Mapa", value: "30x20" },
        { label: "Solidos", value: "3" },
        { label: "Livres", value: "597" }
      ]
    });
    expect(deriveRoomEditorToolPanel(room, entities, {
      mode: "actor",
      selectedEntityKey: "actor:actor-player"
    })).toMatchObject({
      mode: "actor",
      title: "Player",
      subtitle: "Ator",
      badge: "15,10",
      metrics: [
        { label: "X", value: "15" },
        { label: "Y", value: "10" },
        { label: "Evento", value: "player_start" },
        { label: "Tamanho", value: "1x1" }
      ]
    });
    expect(deriveRoomEditorToolPanel(room, entities, {
      mode: "trigger",
      selectedEntityKey: "trigger:trigger-door"
    })).toMatchObject({
      mode: "trigger",
      title: "Door",
      subtitle: "Trigger",
      badge: "2x1",
      metrics: [
        { label: "X", value: "28" },
        { label: "Y", value: "8" },
        { label: "Evento", value: "door_enter" },
        { label: "Area", value: "2x1" }
      ]
    });
    expect(deriveRoomEditorToolPanel(room, entities, { mode: "room" })).toMatchObject({
      mode: "room",
      title: "overworld_start",
      subtitle: "Aventura / Top-down - 240 x 160",
      badge: "Início"
    });
  });

  it("filters rooms and derives rail filter chips with counts", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scena: { name: "overworld", width: 30, height: 20 },
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20, sceneType: "topdown" },
        { id: "room-shop", name: "shop", width: 18, height: 16, sceneType: "topdown" },
        { id: "room-menu", name: "main_menu", width: 20, height: 14, sceneType: "pointAndClick", music: "missing.mod" }
      ],
      settings: { general: { startScene: "shop" } },
      assets: [],
      audioItems: []
    });

    expect(filterRoomsWorkspaceRooms(presentation.rooms, { query: "shop" }).map((room) => room.name)).toEqual(["shop"]);
    expect(filterRoomsWorkspaceRooms(presentation.rooms, { sceneType: "topdown" }).map((room) => room.name)).toEqual(["overworld", "shop"]);
    expect(filterRoomsWorkspaceRooms(presentation.rooms, { status: "start" }).map((room) => room.name)).toEqual(["shop"]);
    expect(filterRoomsWorkspaceRooms(presentation.rooms, { status: "warning" }).map((room) => room.name)).toEqual(["main_menu"]);

    const chips = deriveRoomsWorkspaceFilterChips(presentation, { sceneType: "topdown", status: "start" });

    expect(chips.sceneType).toEqual([
      { id: "scene-type-all", label: "Todas", value: "", count: 3, isActive: false },
      { id: "scene-type-pointandclick", label: "Apontar e clicar", value: "pointAndClick", count: 1, isActive: false },
      { id: "scene-type-topdown", label: "Aventura / Top-down", value: "topdown", count: 2, isActive: true }
    ]);
    expect(chips.status).toEqual([
      { id: "status-all", label: "Todas", value: "all", count: 3, isActive: false },
      { id: "status-active", label: "Ativa", value: "active", count: 1, isActive: false },
      { id: "status-start", label: "Inicial", value: "start", count: 1, isActive: true },
      { id: "status-warning", label: "Alertas", value: "warning", count: 1, isActive: false }
    ]);
    expect(presentation.rooms).toHaveLength(3);
  });

  it("normalizes legacy scene type labels when deriving the rooms presentation", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20, sceneType: "Aventura / Top-down" },
        { id: "room-climb", name: "climb", width: 20, height: 18, sceneType: "Plataforma" }
      ],
      settings: { general: { startScene: "overworld" } }
    });

    expect(presentation.rooms.map((room) => ({ name: room.name, sceneType: room.sceneType }))).toEqual([
      { name: "overworld", sceneType: "topdown" },
      { name: "climb", sceneType: "platformer" }
    ]);
  });

  it("ignores legacy single room fields and requires the current rooms arrays", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      room: {
        name: "legacy_room",
        width: 10,
        height: 8,
        cameraMode: "Fixed"
      }
    });

    expect(presentation.summary).toMatchObject({
      roomCount: 0,
      activeRoomName: null,
      startRoomName: null,
      totalTiles: 0,
      warningCount: 0
    });
    expect(presentation.rooms).toEqual([]);
  });

  it("keeps presentation resilient for partial room data", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scenas: [{ name: "", width: -1, height: 0, sceneType: "" }]
    });

    expect(presentation.rooms).toEqual([
      {
        id: "room-1",
        name: "Cena sem nome",
        displayName: "Cena sem nome",
        width: 1,
        height: 1,
        gbaResolution: "8 x 8",
        music: null,
        hudPresetId: null,
        eventBindings: {},
      cameraMode: "fixed_center",
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width: 1, height: 1 },
      cameraBoundsEditable: false,
      cameraZones: [],
        parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
        sceneType: "topdown",
        runtime: { type: "topdown", config: {} },
        playerActorName: null,
        background: null,
        backgroundLayers: [],
        backgroundSource: null,
        backgroundBundledDefaultAsset: null,
        backgroundPixelHeight: null,
        backgroundPixelWidth: null,
        backgroundPalette: [],
        backgroundTileHeight: 8,
        backgroundAtlasTileHeight: 8,
        backgroundAtlasRenderOffsetY: 0,
        backgroundAtlasColumns: 1,
        backgroundAtlasRows: 1,
        backgroundTileOffsetX: 0,
        backgroundTileOffsetY: 0,
        backgroundTileWidth: 8,
        backgroundAtlasTileWidth: 8,
        backgroundRenderMode: "tilemap",
        objectPalette: [],
        paletteFamilyID: null,
        paletteFamilyName: null,
        paletteBankPolicy: "shared-ui",
        gbStudioUseBackgroundLayout: false,
        tileCount: 1,
        tileCells: [0],
        activeLayerTileCells: [0],
        tileLayers: [
          { mapping: "BG3", label: "BG3 — Fundo distante", tilemap: [-1], paintedTileCount: 0 },
          { mapping: "BG2", label: "BG2 — Mapa principal", tilemap: [-1], paintedTileCount: 0 },
          { mapping: "BG1", label: "BG1 — Overlay", tilemap: [-1], paintedTileCount: 0 },
          { mapping: "BG0", label: "BG0 — Frente", tilemap: [-1], paintedTileCount: 0 }
        ],
        collisionCount: 0,
        collisionCells: [false],
        collisionTypes: ["free"],
        heightLevels: [0],
        foregroundTileCount: 0,
        referenceImageCount: 0,
        layeredPaintingEnabled: true,
        activeTileLayerMapping: "BG2",
        paintedTileCount: 0,
        geometryDiagnostics: {
          backgroundAlignment: {
            actualHeight: null,
            actualWidth: null,
            expectedHeight: 8,
            expectedWidth: 8,
            status: "not_applicable"
          },
          actorPlacement: { blocked: [], outsideBounds: [] },
          triggerPlacement: { blocked: [], outsideBounds: [] }
        },
        isActive: true,
        isStart: true,
        warnings: []
      }
    ]);
  });

  it("reports broken room references for music, background and player actor", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scenas: [
        {
          id: "room-overworld",
          name: "overworld",
          width: 10,
          height: 8,
          music: "missing.mod",
          backgroundAssetName: "missing_tiles.png",
          playerActorName: "Ghost"
        }
      ],
      assets: [{ name: "forest.png", kind: "Tileset" }],
      audioItems: [{ name: "intro.mod", kind: "Musica" }],
      actors: [{ name: "Player", roomName: "overworld" }]
    });

    expect(presentation.summary.warningCount).toBe(3);
    expect(presentation.rooms[0].warnings).toEqual([
      "Musica nao encontrada: missing.mod.",
      "Fundo nao encontrado: missing_tiles.png.",
      "Jogador não encontrado: Ghost."
    ]);
  });

  it("creates a room in the current scenas collection without discarding unrelated fields", () => {
    const project = {
      scenas: [{ id: "room-1", name: "overworld", width: 30, height: 20, cameraMode: "Follow Player" }],
      settings: { general: { gameTitle: "Demo", startScene: "overworld" } },
      editorState: { selectedWorkspace: "rooms" }
    };

    const next = createRoomInProject(project, {
      id: "room-2",
      name: "shop",
      width: 20,
      height: 18,
      sceneType: "topdown"
    });

    expect(next.scenas).toEqual([
      { id: "room-1", name: "overworld", width: 30, height: 20, cameraMode: "Follow Player" },
      expect.objectContaining({
        id: "room-2",
        name: "shop",
        width: 30,
        height: 20,
        sceneType: "topdown",
        runtime: { type: "topdown", config: {} },
        cameraMode: "fixed_center",
        cameraZoom: 100,
        cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
        parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
        backgroundRenderMode: "tilemap",
        collisionTypes: [],
        referenceImages: [],
        tileLayers: expect.arrayContaining(sceneTileLayerOrderedMappings.map((mapping) => (
          expect.objectContaining({ mapping })
        )))
      })
    ]);
    expect(next.settings).toEqual({ general: { gameTitle: "Demo", startScene: "overworld" } });
    expect(next.editorState).toEqual({
      selectedWorkspace: "rooms",
      sceneMapPositions: { shop: { x: 324, y: 36 } }
    });
    expect(project.scenas).toEqual([{ id: "room-1", name: "overworld", width: 30, height: 20, cameraMode: "Follow Player" }]);
  });

  it("creates the first room and marks it as active and start room", () => {
    const next = createRoomInProject({ settings: { general: { gameTitle: "Demo" } } }, {
      id: "room-1",
      name: "overworld",
      width: 30,
      height: 20,
      sceneType: "topdown"
    });

    expect(next.scena).toMatchObject({ id: "room-1", name: "overworld" });
    expect(next.room).toBeUndefined();
    expect(next.scenas).toHaveLength(1);
    expect(next.settings).toEqual({ general: { gameTitle: "Demo", startScene: "overworld" } });
    expect(next.editorState).toEqual({ sceneMapPositions: { overworld: { x: 36, y: 36 } } });
  });

  it("adds the configured default player when creating a required scene", () => {
    const base = createBlankProjectData({ name: "Defaults por cena" });
    const platformer = createRoomInProject(base, {
      id: "room-platformer",
      name: "stage",
      width: 30,
      height: 20,
      sceneType: "platformer"
    });

    expect((platformer.scenas as Record<string, unknown>[]).find((room) => room.id === "room-platformer")).toMatchObject({
      playerActorName: "Player"
    });
    expect((platformer.actors as Record<string, unknown>[]).find((actor) => actor.roomName === "stage")).toMatchObject({
      name: "Player",
      spriteSheet: "player_platformer.png",
      animationStateID: "state-player-platformer",
      animationName: "idle_right"
    });

  });

  it("does not auto-create a player for scenes without a controlled entity", () => {
    const base = createBlankProjectData({ name: "Sem jogador automatico" });
    const settings = structuredClone(base.settings) as Record<string, Record<string, unknown>>;
    (settings.sceneTypes.defaultPlayerSprites as Record<string, string>).cutscene = "player_topdown_4dir.png";
    const cutscene = createRoomInProject({ ...base, settings }, {
      id: "room-cutscene",
      name: "intro",
      width: 30,
      height: 20,
      sceneType: "cutscene"
    });

    expect((cutscene.actors as Record<string, unknown>[]).some((actor) => actor.roomName === "intro")).toBe(false);
    expect((cutscene.scenas as Record<string, unknown>[]).find((room) => room.id === "room-cutscene"))
      .not.toHaveProperty("playerActorName");
  });

  it("provisions a marker only when a World Map becomes navigable", () => {
    const base = createBlankProjectData({ name: "Marcador de mapa" });
    const settings = structuredClone(base.settings) as Record<string, Record<string, unknown>>;
    (settings.sceneTypes.defaultPlayerSprites as Record<string, string>).worldMap = "world-map-player.png";
    const withMap = createRoomInProject({ ...base, settings }, {
      id: "room-map",
      name: "world-map",
      width: 30,
      height: 20,
      sceneType: "worldMap"
    });

    const notNavigable = updateRoomFieldsInProject(withMap, "room-map", {
      runtime: { type: "worldMap", config: { navigable: false } }
    });
    expect((notNavigable.actors as Record<string, unknown>[]).some((actor) => actor.roomName === "world-map")).toBe(false);

    const navigable = updateRoomFieldsInProject(notNavigable, "room-map", {
      runtime: { type: "worldMap", config: { navigable: true } }
    });
    expect((navigable.actors as Record<string, unknown>[]).find((actor) => actor.roomName === "world-map")).toMatchObject({
      name: "World Map Marker",
      roomName: "world-map",
      spriteSheet: "world-map-player.png",
      worldMapRole: "marker"
    });
    expect((navigable.scenas as Record<string, unknown>[]).find((room) => room.id === "room-map"))
      .not.toHaveProperty("playerActorName");
  });

  it("duplicates a room with a new id and name while preserving room content", () => {
    const project = {
      scenas: [
        {
          id: "room-overworld",
          name: "overworld",
          width: 30,
          height: 20,
          eventBindings: { onInit: "room_boot" },
          collisionTypes: ["solid", "free"]
        }
      ]
    };

    const next = duplicateRoomInProject(project, {
      sourceRoomID: "room-overworld",
      newRoomID: "room-shop",
      newName: "shop"
    });

    expect(next.scenas).toEqual([
      {
        id: "room-overworld",
        name: "overworld",
        width: 30,
        height: 20,
        eventBindings: { onInit: "room_boot" },
        collisionTypes: ["solid", "free"]
      },
      {
        id: "room-shop",
        name: "shop",
        width: 30,
        height: 20,
        eventBindings: { onInit: "room_boot" },
        collisionTypes: ["solid", "free"]
      }
    ]);
    expect(next.editorState).toEqual({ sceneMapPositions: { shop: { x: 324, y: 36 } } });
    expect(project.scenas).toHaveLength(1);
  });

  it("renames a room and updates start scene, route tables, scene connections and change_scene commands", () => {
    const project = {
      scena: { id: "room-shop", name: "shop", width: 20, height: 18 },
      room: { id: "room-shop", name: "shop", width: 20, height: 18 },
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      settings: { general: { startScene: "shop" } },
      editorState: {
        sceneMapPositions: {
          overworld: { x: 36, y: 36 },
          shop: { x: 324, y: 36 }
        },
        scenaConnections: [
          { from: "overworld", to: "shop", eventName: "door_enter" },
          { from: "shop", to: "overworld", eventName: "door_exit" }
        ]
      },
      events: [
        { id: "event-door", name: "door_enter", roomName: "shop", command: "change_scene shop" },
        { id: "event-sequence", name: "sequence", steps: [{ command: "change_scene shop" }, { command: "if_scene shop" }, { command: "noop" }] }
      ],
      sceneRouteTables: [{
        id: "map-routes",
        variable: "route",
        routes: [{ value: 1, scene: "shop", x: 2, y: 3, direction: "right" }],
        fallback: { scene: "shop", x: 2, y: 3, direction: "right" }
      }],
      actors: [
        { id: "actor-shopkeeper", name: "Shopkeeper", roomName: "shop", x: 2, y: 3 },
        { id: "actor-guide", name: "Guide", roomName: "overworld", x: 4, y: 5 }
      ],
      triggers: [
        { id: "trigger-exit", name: "Exit", roomName: "shop", x: 1, y: 1, width: 1, height: 1 },
        { id: "trigger-door", name: "Door", roomName: "overworld", x: 10, y: 11, width: 2, height: 1 }
      ],
      audioItems: [
        { id: "audio-shop", name: "shop.mod", kind: "Musica", assignedScene: "shop" },
        { id: "audio-global", name: "confirm.wav", kind: "SFX", assignedScene: "Global" }
      ]
    };

    const next = renameRoomInProject(project, "room-shop", "market");
    const nextScenas = next.scenas as Record<string, unknown>[];

    expect(next.scena).toMatchObject({ id: "room-shop", name: "market" });
    expect(next.room).toBeUndefined();
    expect(nextScenas[1]).toMatchObject({ id: "room-shop", name: "market" });
    expect(next.settings).toEqual({ general: { startScene: "market" } });
    expect(next.editorState).toEqual({
      sceneMapPositions: {
        overworld: { x: 36, y: 36 },
        market: { x: 324, y: 36 }
      },
      scenaConnections: [
        { from: "overworld", to: "market", eventName: "door_enter" },
        { from: "market", to: "overworld", eventName: "door_exit" }
      ]
    });
    expect(next.events).toEqual([
      { id: "event-door", name: "door_enter", roomName: "market", command: "change_scene market" },
      { id: "event-sequence", name: "sequence", steps: [{ command: "change_scene market" }, { command: "if_scene market" }, { command: "noop" }] }
    ]);
    expect(next.sceneRouteTables).toEqual([{
      id: "map-routes",
      variable: "route",
      routes: [{ value: 1, scene: "market", x: 2, y: 3, direction: "right" }],
      fallback: { scene: "market", x: 2, y: 3, direction: "right" }
    }]);
    expect(next.actors).toEqual([
      { id: "actor-shopkeeper", name: "Shopkeeper", roomName: "market", x: 2, y: 3 },
      { id: "actor-guide", name: "Guide", roomName: "overworld", x: 4, y: 5 }
    ]);
    expect(next.triggers).toEqual([
      { id: "trigger-exit", name: "Exit", roomName: "market", x: 1, y: 1, width: 1, height: 1 },
      { id: "trigger-door", name: "Door", roomName: "overworld", x: 10, y: 11, width: 2, height: 1 }
    ]);
    expect(next.audioItems).toEqual([
      { id: "audio-shop", name: "shop.mod", kind: "Musica", assignedScene: "market" },
      { id: "audio-global", name: "confirm.wav", kind: "SFX", assignedScene: "Global" }
    ]);
  });

  it("atualiza a próxima cena da campanha ao renomear uma sala", () => {
    const project = {
      scenas: [
        {
          id: "room-overworld",
          name: "overworld",
          campaign: { nextScene: "shop", title: "Overworld" }
        },
        {
          id: "room-shop",
          name: "shop",
          campaign: { nextScene: "overworld", title: "Shop" }
        }
      ],
      rooms: [
        {
          id: "room-overworld",
          name: "overworld",
          campaign: { nextScene: "shop", title: "Overworld" }
        },
        {
          id: "room-shop",
          name: "shop",
          campaign: { nextScene: "overworld", title: "Shop" }
        }
      ]
    };

    const next = renameRoomInProject(project, "room-shop", "market");

    expect((next.scenas as Record<string, unknown>[])[0]?.campaign).toMatchObject({ nextScene: "market" });
    expect((next.scenas as Record<string, unknown>[])[1]?.campaign).toMatchObject({ nextScene: "overworld" });
    expect((next.rooms as Record<string, unknown>[])[0]?.campaign).toMatchObject({ nextScene: "market" });
    expect((next.rooms as Record<string, unknown>[])[1]?.campaign).toMatchObject({ nextScene: "overworld" });
  });

  it("removes a room and retargets active/start room to the first remaining room", () => {
    const project = {
      scena: { id: "room-shop", name: "shop", width: 20, height: 18 },
      room: { id: "room-shop", name: "shop", width: 20, height: 18 },
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      settings: { general: { startScene: "shop" } },
      editorState: {
        sceneMapPositions: {
          overworld: { x: 36, y: 36 },
          shop: { x: 324, y: 36 }
        },
        scenaConnections: [
          { from: "overworld", to: "shop", eventName: "door_enter" },
          { from: "shop", to: "overworld", eventName: "door_exit" }
        ]
      }
    };

    const next = removeRoomFromProject(project, "room-shop");

    expect(next.scenas).toEqual([{ id: "room-overworld", name: "overworld", width: 30, height: 20 }]);
    expect(next.scena).toEqual({ id: "room-overworld", name: "overworld", width: 30, height: 20 });
    expect(next.room).toBeUndefined();
    expect(next.settings).toEqual({ general: { startScene: "overworld" } });
    expect(next.editorState).toEqual({
      sceneMapPositions: { overworld: { x: 36, y: 36 } },
      scenaConnections: []
    });
  });

  it("sets the start room from a scene map card action", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      settings: { general: { startScene: "overworld" } }
    };

    const next = setStartRoomInProject(project, "room-shop");

    expect(next.settings).toEqual({ general: { startScene: "shop" } });
    expect(project.settings).toEqual({ general: { startScene: "overworld" } });
  });

  it("creates room connections in editor state without duplicating existing links", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      editorState: {
        selectedWorkspace: "rooms",
        scenaConnections: [{ from: "overworld", to: "shop", eventName: "door_enter" }]
      }
    };

    const duplicate = createRoomConnectionInProject(project, { from: "overworld", to: "shop", eventName: "door_enter" });
    const next = createRoomConnectionInProject(project, { from: "shop", to: "overworld", eventName: "door_exit" });

    expect(duplicate).toBe(project);
    expect(next.editorState).toEqual({
      selectedWorkspace: "rooms",
      scenaConnections: [
        { from: "overworld", to: "shop", eventName: "door_enter" },
        {
          from: "shop",
          to: "overworld",
          eventName: "door_exit",
          exit: { x: 19, y: 9, width: 1, height: 1 },
          entry: { x: 0, y: 10, width: 1, height: 1 }
        }
      ]
    });
    expect(project.editorState.scenaConnections).toEqual([{ from: "overworld", to: "shop", eventName: "door_enter" }]);
  });

  it("rejects room connections with missing, unknown or self-linked rooms", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ]
    };

    expect(createRoomConnectionInProject(project, { from: "overworld", to: "overworld", eventName: "loop" })).toBe(project);
    expect(createRoomConnectionInProject(project, { from: "overworld", to: "missing", eventName: "door" })).toBe(project);
    expect(createRoomConnectionInProject(project, { from: "", to: "shop", eventName: "door" })).toBe(project);
  });

  it("creates room connections with default exit and entry areas", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ]
    };

    const next = createRoomConnectionInProject(project, { from: "overworld", to: "shop", eventName: "door_enter" });

    expect(next.editorState).toEqual({
      scenaConnections: [{
        from: "overworld",
        to: "shop",
        eventName: "door_enter",
        exit: { x: 29, y: 10, width: 1, height: 1 },
        entry: { x: 0, y: 9, width: 1, height: 1 }
      }]
    });
  });

  it("creates an additional warp connection with the drawn area and preserves the default opposite area", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 10, height: 8 },
        { id: "room-shop", name: "shop", width: 8, height: 6 }
      ],
      editorState: {
        scenaConnections: [{ from: "overworld", to: "shop" }]
      }
    };

    const next = createRoomWarpConnectionInProject(project, {
      area: { x: 2, y: 3, width: 2, height: 1 },
      from: "overworld",
      side: "exit",
      to: "shop"
    });

    const nextConnections = (next.editorState as { scenaConnections?: unknown[] }).scenaConnections;
    expect(nextConnections).toHaveLength(2);
    expect(nextConnections?.[1]).toEqual({
      from: "overworld",
      to: "shop",
      exit: { x: 2, y: 3, width: 2, height: 1 },
      entry: { x: 0, y: 3, width: 1, height: 1 }
    });
    expect(project.editorState.scenaConnections).toEqual([{ from: "overworld", to: "shop" }]);
  });

  it("updates room connection areas and clamps them to room bounds", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      editorState: {
        scenaConnections: [{
          from: "overworld",
          to: "shop",
          eventName: "door_enter",
          exit: { x: 29, y: 10, width: 1, height: 1 },
          entry: { x: 0, y: 9, width: 1, height: 1 }
        }]
      }
    };

    const next = updateRoomConnectionInProject(project, 0, {
      exit: { x: 25, y: 5, width: 10, height: 20 },
      entry: { x: -2, y: 0, width: 4, height: 3 }
    });

    const updatedConnection = (next.editorState as { scenaConnections?: Array<Record<string, unknown>> }).scenaConnections?.[0];
    expect(updatedConnection).toMatchObject({
      exit: { x: 20, y: 0, width: 10, height: 20 },
      entry: { x: 0, y: 0, width: 4, height: 3 }
    });
    expect(updateRoomConnectionInProject(project, -1, { exit: { x: 1, y: 1, width: 1, height: 1 } })).toBe(project);
    expect(updateRoomConnectionInProject(project, 3, { exit: { x: 1, y: 1, width: 1, height: 1 } })).toBe(project);
  });

  it("persists connection transitions as a normalized partial update", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      editorState: {
        scenaConnections: [{
          from: "overworld",
          to: "shop",
          transition: { style: "fade", durationFrames: 12, fadeOut: false, fadeIn: true }
        }]
      }
    };

    const updated = updateRoomConnectionInProject(project, 0, {
      transition: { durationFrames: 48, fadeIn: false }
    });
    const updatedConnection = (updated.editorState as { scenaConnections?: Array<Record<string, unknown>> }).scenaConnections?.[0];

    expect(updatedConnection?.transition).toEqual({
      style: "fade",
      durationFrames: 48,
      fadeOut: false,
      fadeIn: false
    });
    expect(updateRoomConnectionInProject(updated, 0, { transition: null }).editorState).toEqual({
      scenaConnections: [{ from: "overworld", to: "shop" }]
    });
  });

  it("marks inherited and customized connection transitions for the Inspector", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      settings: {
        general: { startScene: "overworld" },
        transitions: { style: "wipe", durationFrames: 9, fadeOut: true, fadeIn: false }
      },
      editorState: {
        scenaConnections: [
          { from: "overworld", to: "shop" },
          { from: "shop", to: "overworld", transition: { style: "fade", durationFrames: 12, fadeOut: true, fadeIn: true } }
        ]
      }
    });

    expect(presentation.connections.map((connection) => ({
      source: connection.transitionSource,
      style: connection.transition.style,
      duration: connection.transition.durationFrames,
      fadeIn: connection.transition.fadeIn
    }))).toEqual([
      { source: "project-default", style: "wipe", duration: 9, fadeIn: false },
      { source: "custom", style: "fade", duration: 12, fadeIn: true }
    ]);
  });

  it("moves room connection areas to a target cell while preserving their size", () => {
    expect(moveRoomConnectionAreaToCell(
      { x: 2, y: 3, width: 4, height: 2 },
      10,
      8,
      0
    )).toEqual({ x: 0, y: 0, width: 4, height: 2 });

    expect(moveRoomConnectionAreaToCell(
      { x: 2, y: 3, width: 4, height: 2 },
      10,
      8,
      79
    )).toEqual({ x: 6, y: 6, width: 4, height: 2 });
  });

  it("exposes connection exit and entry areas in workspace presentation", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      editorState: {
        scenaConnections: [{
          from: "overworld",
          to: "shop",
          eventName: "door_enter",
          exit: { x: 28, y: 8, width: 2, height: 2 },
          entry: { x: 1, y: 7, width: 1, height: 2 }
        }]
      }
    };

    const presentation = deriveRoomsWorkspacePresentation(project);
    expect(presentation.connections[0]).toMatchObject({
      from: "overworld",
      to: "shop",
      exit: { x: 28, y: 8, width: 2, height: 2 },
      entry: { x: 1, y: 7, width: 1, height: 2 }
    });
    expect(deriveRoomConnectionAreasForRoom("overworld", presentation.connections)).toEqual([{
      connectionIndex: 0,
      side: "exit",
      area: { x: 28, y: 8, width: 2, height: 2 }
    }]);
    expect(deriveRoomConnectionAreasForRoom("shop", presentation.connections)).toEqual([{
      connectionIndex: 0,
      side: "entry",
      area: { x: 1, y: 7, width: 1, height: 2 }
    }]);
  });

  it("normalizes connection areas with minimum 1x1 size", () => {
    expect(normalizeRoomConnectionArea({ x: 5, y: 5, width: 0, height: -1 }, 20, 18)).toEqual({
      x: 5,
      y: 5,
      width: 1,
      height: 1
    });
    expect(defaultRoomConnectionExitArea(30, 20)).toEqual({ x: 29, y: 10, width: 1, height: 1 });
    expect(defaultRoomConnectionEntryArea(20, 18)).toEqual({ x: 0, y: 9, width: 1, height: 1 });
  });

  it("places the player one tile inside an entry door and faces the room interior", () => {
    expect(roomConnectionArrival({ x: 0, y: 10, width: 1, height: 1 }, 20, 18)).toEqual({
      x: 1,
      y: 10,
      direction: "right"
    });
    expect(roomConnectionArrival({ x: 19, y: 10, width: 1, height: 1 }, 20, 18)).toEqual({
      x: 18,
      y: 10,
      direction: "left"
    });
    expect(roomConnectionArrival({ x: 8, y: 0, width: 2, height: 1 }, 20, 18)).toEqual({
      x: 9,
      y: 1,
      direction: "down"
    });
    expect(roomConnectionArrival({ x: 8, y: 17, width: 2, height: 1 }, 20, 18)).toEqual({
      x: 9,
      y: 16,
      direction: "up"
    });
  });

  it("moves a door arrival to the nearest walkable tile when the inward tile is blocked", () => {
    const collisionTypes = Array.from({ length: 20 * 18 }, () => "free");
    collisionTypes[10 * 20 + 1] = "solid";

    expect(roomConnectionArrival({ x: 0, y: 10, width: 1, height: 1 }, 20, 18, collisionTypes)).toEqual({
      x: 2,
      y: 10,
      direction: "right"
    });
  });

  it("removes room connections by presentation index", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      editorState: {
        selectedWorkspace: "rooms",
        scenaConnections: [
          { from: "overworld", to: "shop", eventName: "door_enter" },
          { from: "shop", to: "overworld", eventName: "door_exit" }
        ]
      }
    };

    const next = removeRoomConnectionFromProject(project, 0);

    expect(next.editorState).toEqual({
      selectedWorkspace: "rooms",
      scenaConnections: [{ from: "shop", to: "overworld", eventName: "door_exit" }]
    });
    expect(removeRoomConnectionFromProject(project, -1)).toBe(project);
    expect(removeRoomConnectionFromProject(project, 2)).toBe(project);
  });

  it("opens a room by copying it into the active scena without mutating the source project", () => {
    const project = {
      scena: { id: "room-overworld", name: "overworld", width: 30, height: 20 },
      room: { id: "room-overworld", name: "overworld", width: 30, height: 20 },
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18, music: "shop.mod" }
      ]
    };

    const next = setActiveRoomInProject(project, "room-shop");

    expect(next.scena).toEqual({ id: "room-shop", name: "shop", width: 20, height: 18, music: "shop.mod" });
    expect(next.room).toBeUndefined();
    expect(project.scena).toEqual({ id: "room-overworld", name: "overworld", width: 30, height: 20 });
  });

  it("updates room properties and mirrors the active room copy when it matches", () => {
    const project = {
      scena: { id: "room-overworld", name: "overworld", width: 30, height: 20, eventBindings: { onInit: "boot" } },
      room: { id: "room-overworld", name: "overworld", width: 30, height: 20 },
      scenas: [
        {
          id: "room-overworld",
          name: "overworld",
          width: 30,
          height: 20,
          cameraMode: "Fixed",
          sceneType: "topdown",
          eventBindings: { onInit: "boot" },
          collisionTypes: ["solid", "free"]
        }
      ]
    };

    const next = updateRoomFieldsInProject(project, "room-overworld", {
      width: 32,
      height: 24,
      cameraMode: "Follow Player",
      music: "intro.mod",
      backgroundAssetName: "tiles.png",
      backgroundRenderMode: "hybrid",
      playerActorName: "Hero",
      sceneType: "Plataforma"
    });
    const updatedRoom = (next.scenas as Record<string, unknown>[])[0];

    expect(updatedRoom).toMatchObject({
      id: "room-overworld",
      name: "overworld",
      width: 32,
      height: 24,
      cameraMode: "follow_player",
      cameraBounds: { x: 1, y: 2, width: 30, height: 20 },
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      music: "intro.mod",
      backgroundAssetName: "tiles.png",
      backgroundRenderMode: "hybrid",
      playerActorName: "Hero",
      sceneType: "platformer",
      eventBindings: { onInit: "boot" },
      collisionTypes: expect.arrayContaining(["solid", "free"])
    });
    expect((updatedRoom.collisionTypes as string[]).length).toBe(32 * 24);
    expect(next.scena).toMatchObject({
      id: "room-overworld",
      width: 32,
      height: 24,
      cameraMode: "follow_player",
      music: "intro.mod"
    });
    expect(next.room).toBeUndefined();
  });

  it("impede que a edicao reduza uma cena abaixo do viewport GBA de 30 por 20 tiles", () => {
    const project: GBAProjectData = {
      scenas: [{
        id: "room-minimum",
        name: "minimum",
        width: 32,
        height: 22,
        collisionTypes: ["solid", "damage"]
      }]
    };

    const next = updateRoomFieldsInProject(project, "room-minimum", { width: 8, height: 6 });
    const room = (next.scenas as Record<string, unknown>[])[0];

    expect(room).toMatchObject({ width: 30, height: 20 });
    expect((room.collisionTypes as string[]).length).toBe(30 * 20);
    expect((room.collisionTypes as string[]).slice(0, 2)).toEqual(["solid", "damage"]);
  });

  it("persists camera bounds and parallax settings from the room inspector", () => {
    const project = {
      scenas: [{
        id: "room-overworld",
        name: "overworld",
        width: 40,
        height: 24,
        cameraMode: "Fixed",
        sceneType: "topdown"
      }]
    };

    const next = updateRoomFieldsInProject(project, "room-overworld", {
      cameraMode: "Fixa na posição",
      cameraZoom: 175,
      cameraBounds: { x: 4, y: 2, width: 30, height: 20 },
      parallax: { mode: "BG3", offsetX: 3, offsetY: 1, speedX: 128, speedY: 192 }
    });
    const updatedRoom = (next.scenas as Record<string, unknown>[])[0];

    expect(updatedRoom).toMatchObject({
      cameraMode: "fixed_position",
      cameraZoom: 175,
      cameraBounds: { x: 4, y: 2, width: 30, height: 20 },
      parallax: { mode: "bg3", offsetX: 3, offsetY: 1, speedX: 128, speedY: 192 }
    });

    const centered = updateRoomFieldsInProject(next, "room-overworld", { centerCameraBounds: true });
    expect((centered.scenas as Record<string, unknown>[])[0]).toMatchObject({
      cameraBounds: { x: 5, y: 2, width: 30, height: 20 }
    });

    const origin = updateRoomFieldsInProject(next, "room-overworld", { resetCameraBoundsOrigin: true });
    expect((origin.scenas as Record<string, unknown>[])[0]).toMatchObject({
      cameraBounds: { x: 0, y: 0, width: 30, height: 20 }
    });

    const presentation = deriveRoomsWorkspacePresentation(next);
    expect(presentation.rooms[0]).toMatchObject({
      cameraMode: "fixed_position",
      cameraZoom: 175,
      cameraBoundsEditable: true,
      parallax: { mode: "bg3", offsetX: 3, offsetY: 1, speedX: 128, speedY: 192 }
    });
  });

  it("persists and presents camera zones independently from scene connections", () => {
    const project: GBAProjectData = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 30, height: 20, sceneType: "isometric" }]
    };
    const cameraZones = [{
      id: "camera-zone-1",
      name: "Entrada",
      area: { x: 2, y: 3, width: 5, height: 4 },
      bounds: { x: 16, y: 8, width: 208, height: 144 },
      offset: { x: 12, y: -6 },
      lockX: true,
      lockY: false
    }];

    const next = updateRoomFieldsInProject(project, "room-overworld", { cameraZones });
    expect((next.scenas as Record<string, unknown>[])[0]?.cameraZones).toEqual(cameraZones);
    expect(deriveRoomsWorkspacePresentation(next).rooms[0]?.cameraZones).toEqual(cameraZones);
  });

  it("updates the grid metadata for the room background tileset", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 30, height: 20, backgroundAssetName: "tiles.png" }],
      assets: [
        { id: "asset-tiles", name: "tiles.png", kind: "Tileset", metadata: { source: "Assets/tiles.png", notes: "original" } },
        { id: "asset-sprite", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }
      ]
    };

    const next = updateRoomBackgroundTilesetGridInProject(project, "room-overworld", {
      tileHeight: 12,
      tileOffsetX: 3,
      tileOffsetY: 5,
      tileWidth: 16
    });

    expect(next.assets).toEqual([
      { id: "asset-tiles", name: "tiles.png", kind: "Tileset", metadata: { source: "Assets/tiles.png", notes: "original", tileHeight: 12, tileOffsetX: 3, tileOffsetY: 5, tileWidth: 16 } },
      { id: "asset-sprite", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } }
    ]);
    expect(project.assets[0].metadata).toEqual({ source: "Assets/tiles.png", notes: "original" });
  });

  it("rejects background tileset grid updates for unknown rooms or missing background assets", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 30, height: 20, backgroundAssetName: "tiles.png" }],
      assets: [{ id: "asset-other", name: "other.png", kind: "Tileset", metadata: { source: "Assets/other.png" } }]
    };

    expect(updateRoomBackgroundTilesetGridInProject(project, "missing", { tileHeight: 8, tileWidth: 8 })).toBe(project);
    expect(updateRoomBackgroundTilesetGridInProject(project, "room-overworld", { tileHeight: 8, tileWidth: 8 })).toBe(project);
  });

  it("moves actors and triggers between rooms without mutating the source project", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 20, height: 18 }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2, eventName: "player_start" }],
      triggers: [{ id: "trigger-door", name: "Door", roomName: "overworld", x: 4, y: 5, width: 2, height: 1 }]
    };

    const movedActor = updateRoomEntityInProject(project, "actor", "actor-player", {
      roomName: "shop",
      x: 7,
      y: 8,
      eventName: "npc_shop"
    });
    const movedTrigger = updateRoomEntityInProject(movedActor, "trigger", "trigger-door", {
      roomName: "shop",
      x: 9,
      y: 10,
      width: 3,
      height: 2,
      eventName: "door_enter"
    });

    expect(movedTrigger.actors).toEqual([{ id: "actor-player", name: "Player", roomName: "shop", x: 7, y: 8, eventName: "npc_shop" }]);
    expect(movedTrigger.triggers).toEqual([{ id: "trigger-door", name: "Door", roomName: "shop", x: 9, y: 10, width: 3, height: 2, eventName: "door_enter" }]);
    expect(project.actors[0]).toEqual({ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2, eventName: "player_start" });
  });

  it("persists independent export-backed behavior bindings for actors and triggers", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 30, height: 20 }],
      actors: [{ id: "actor-guide", name: "Guide", roomName: "overworld", x: 1, y: 2, eventName: "guide_talk", eventBindings: { onInit: "guide_spawn" } }],
      triggers: [{ id: "trigger-door", name: "Door", roomName: "overworld", x: 4, y: 5, width: 2, height: 1 }]
    };

    const withActorBindings = updateRoomEntityInProject(project, "actor", "actor-guide", {
      eventBindings: { onInit: "guide_spawn", onInteract: "guide_talk", onUpdate: "guide_watch" }
    });
    const withTriggerBindings = updateRoomEntityInProject(withActorBindings, "trigger", "trigger-door", {
      eventBindings: { onEnter: "door_enter", onLeave: "door_leave" }
    });
    const clearedActorInteract = updateRoomEntityInProject(withTriggerBindings, "actor", "actor-guide", {
      eventBindings: { onInteract: "" }
    });

    expect(clearedActorInteract.actors).toEqual([{
      id: "actor-guide",
      name: "Guide",
      roomName: "overworld",
      x: 1,
      y: 2,
      eventName: "guide_talk",
      eventBindings: { onInit: "guide_spawn", onUpdate: "guide_watch" }
    }]);
    expect(clearedActorInteract.triggers).toEqual([{
      id: "trigger-door",
      name: "Door",
      roomName: "overworld",
      x: 4,
      y: 5,
      width: 2,
      height: 1,
      eventBindings: { onEnter: "door_enter", onLeave: "door_leave" }
    }]);
    expect(project.actors[0]).toEqual({ id: "actor-guide", name: "Guide", roomName: "overworld", x: 1, y: 2, eventName: "guide_talk", eventBindings: { onInit: "guide_spawn" } });
  });

  it("updates actor sprite assignment without changing triggers or unknown actors", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 10, height: 8 }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2, spriteSheet: "player_idle.png", animationName: "idle_down" }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "overworld", x: 3, y: 4, eventName: "door_enter" }
      ]
    };

    const next = updateRoomEntityInProject(project, "actor", "actor-player", {
      spriteSheet: "actor_animated.png",
      animationName: "idle_down",
      animationStateID: "state-actor-animated"
    });
    const rejectedTrigger = updateRoomEntityInProject(project, "trigger", "trigger-door", {
      spriteSheet: "actor_animated.png",
      animationName: "idle_down"
    });
    const rejectedUnknown = updateRoomEntityInProject(project, "actor", "missing", {
      spriteSheet: "actor_animated.png"
    });

    expect(next.actors).toEqual([
      { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2, spriteSheet: "actor_animated.png", animationName: "idle_down", animationStateID: "state-actor-animated" }
    ]);
    expect(rejectedTrigger).toBe(project);
    expect(rejectedUnknown).toBe(project);
    expect(project.actors[0]).toEqual({ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2, spriteSheet: "player_idle.png", animationName: "idle_down" });
  });

  it("authors normalized battle roles, stats and abilities on actors", () => {
    const project = {
      scenas: [{ id: "room-arena", name: "arena", width: 10, height: 8 }],
      actors: [{ id: "actor-hero", name: "Hero", roomName: "arena", x: 1, y: 2 }]
    };

    const next = updateRoomEntityInProject(project, "actor", "actor-hero", {
      battle: {
        side: "party",
        maxHp: 40,
        attack: 12,
        defense: 5,
        speed: 8,
        abilities: ["attack", "magic", "heal", "defend"]
      }
    });

    expect(next.actors).toEqual([expect.objectContaining({
      id: "actor-hero",
      battle: {
        side: "party",
        maxHp: 40,
        attack: 12,
        defense: 5,
        speed: 8,
        abilities: ["attack", "magic", "heal", "defend"]
      }
    })]);
    expect(deriveRoomsWorkspacePresentation(next).entities[0]?.battle).toEqual({
      side: "party",
      maxHp: 40,
      attack: 12,
      defense: 5,
      speed: 8,
      abilities: ["attack", "magic", "heal", "defend"]
    });
    expect(project.actors[0]).not.toHaveProperty("battle");
  });

  it("authors bounded actor collision groups, masks and push priority", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 10, height: 8 }],
      actors: [{ id: "actor-crate", name: "Crate", roomName: "overworld", x: 2, y: 3 }]
    };

    const next = updateRoomEntityInProject(project, "actor", "actor-crate", {
      collisionGroup: 21,
      collisionMask: 70_000,
      pushPriority: 300,
      pushable: true
    });

    expect(next.actors).toEqual([expect.objectContaining({
      collisionGroup: 15,
      collisionMask: 65_535,
      pushPriority: 255,
      pushable: true
    })]);
    expect(deriveRoomsWorkspacePresentation(next).entities[0]).toEqual(expect.objectContaining({
      collisionGroup: 15,
      collisionMask: 65_535,
      pushPriority: 255,
      pushable: true
    }));
    expect(project.actors[0]).not.toHaveProperty("collisionGroup");
  });

  it("rejects entity moves for unknown entities or rooms", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 30, height: 20 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2 }],
      triggers: [{ id: "trigger-door", name: "Door", roomName: "overworld", x: 4, y: 5 }]
    };

    expect(updateRoomEntityInProject(project, "actor", "missing", { x: 5 })).toBe(project);
    expect(updateRoomEntityInProject(project, "trigger", "trigger-door", { roomName: "missing" })).toBe(project);
  });

  it("places room entities from canvas coordinates while clamping them inside the target room", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 30, height: 20 },
        { id: "room-shop", name: "shop", width: 5, height: 4 }
      ],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2 }],
      triggers: [{ id: "trigger-door", name: "Door", roomName: "overworld", x: 4, y: 5, width: 3, height: 2 }]
    };

    const placedActor = placeRoomEntityInRoomInProject(project, "actor", "actor-player", {
      roomID: "room-shop",
      x: -3,
      y: 12
    });
    const placedTrigger = placeRoomEntityInRoomInProject(placedActor, "trigger", "trigger-door", {
      roomID: "room-shop",
      x: 99,
      y: 99
    });

    expect(placedTrigger.actors).toEqual([{ id: "actor-player", name: "Player", roomName: "shop", x: 0, y: 3 }]);
    expect(placedTrigger.triggers).toEqual([{ id: "trigger-door", name: "Door", roomName: "shop", x: 2, y: 2, width: 3, height: 2 }]);
    expect(project.actors[0]).toEqual({ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2 });
  });

  it("rejects canvas placement for unknown rooms, unknown entities or invalid coordinates", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 30, height: 20 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2 }]
    };

    expect(placeRoomEntityInRoomInProject(project, "actor", "missing", { roomID: "room-overworld", x: 3, y: 4 })).toBe(project);
    expect(placeRoomEntityInRoomInProject(project, "actor", "actor-player", { roomID: "missing", x: 3, y: 4 })).toBe(project);
    expect(placeRoomEntityInRoomInProject(project, "actor", "actor-player", { roomID: "room-overworld", x: Number.NaN, y: 4 })).toBe(project);
  });

  it("converts canvas points to clamped room tile coordinates", () => {
    expect(canvasPointToRoomTile({
      canvasHeight: 200,
      canvasWidth: 300,
      pointX: 149,
      pointY: 199,
      roomHeight: 20,
      roomWidth: 30
    })).toEqual({ x: 14, y: 19 });

    expect(canvasPointToRoomTile({
      canvasHeight: 200,
      canvasWidth: 300,
      pointX: 999,
      pointY: -10,
      roomHeight: 20,
      roomWidth: 30
    })).toEqual({ x: 29, y: 0 });

    expect(canvasPointToRoomTile({
      canvasHeight: 400,
      canvasWidth: 800,
      pointX: 384,
      pointY: 200,
      projection: "isometric",
      roomHeight: 20,
      roomWidth: 30
    })).toEqual({ x: 14, y: 10 });

    expect(canvasPointToRoomTile({
      canvasHeight: 400,
      canvasWidth: 800,
      pointX: 400,
      pointY: 80,
      projection: "isometric",
      roomHeight: 4,
      roomWidth: 6
    })).toEqual({ x: 1, y: 0 });

    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 6; x += 1) {
        const placement = isometricRoomTilePlacement(6, 4, x, y);
        expect(canvasPointToRoomTile({
          canvasHeight: 400,
          canvasWidth: 800,
          pointX: ((placement.leftPercent + placement.widthPercent / 2) / 100) * 800,
          pointY: ((placement.topPercent + placement.heightPercent / 2) / 100) * 400,
          projection: "isometric",
          roomHeight: 4,
          roomWidth: 6
        })).toEqual({ x, y });
      }
    }
  });

  it("keeps pointer selection inside tile boundaries at fractional viewport scales", () => {
    for (const scale of [0.625, 1, 3.723, 5.117]) {
      for (const roomWidth of [30, 60]) {
        const roomHeight = 20;
        const canvasWidth = roomWidth * 8 * scale;
        const canvasHeight = roomHeight * 8 * scale;
        for (let x = 1; x < roomWidth; x += 1) {
          for (let y = 1; y < roomHeight; y += 1) {
            for (const side of [-1, 1]) {
              expect(canvasPointToRoomTile({
                canvasWidth,
                canvasHeight,
                pointX: x * 8 * scale + side * 0.01,
                pointY: y * 8 * scale + side * 0.01,
                roomWidth,
                roomHeight
              })).toEqual({ x: x - (side < 0 ? 1 : 0), y: y - (side < 0 ? 1 : 0) });
            }
          }
        }
      }
    }
  });

  it("round-trips isometric cell centers with the configured projection", () => {
    const config = {
      ...DEFAULT_ISOMETRIC_SCENE_CONFIG,
      originX: 120,
      originY: 24
    };
    const surfaceSize = { height: 576, width: 1120 };

    for (const [x, y] of [[0, 0], [39, 0], [0, 29], [19, 14], [39, 29]]) {
      const placement = isometricRoomTilePlacement(40, 30, x, y, config, 32, surfaceSize);
      expect(canvasPointToRoomTile({
        canvasHeight: surfaceSize.height,
        canvasWidth: surfaceSize.width,
        isometricConfig: config,
        isometricSurfaceSize: surfaceSize,
        pointX: ((placement.leftPercent + placement.widthPercent / 2) / 100) * surfaceSize.width,
        pointY: ((placement.topPercent + placement.heightPercent / 2) / 100) * surfaceSize.height,
        projection: "isometric",
        roomHeight: 30,
        roomWidth: 40
      })).toEqual({ x, y });
    }
  });

  it("converts tileset image points to tile IDs", () => {
    expect(canvasPointToTilesetTileID({
      imageHeight: 32,
      imageWidth: 32,
      pointX: 42,
      pointY: 34,
      renderedHeight: 64,
      renderedWidth: 64,
      tileHeight: 8,
      tileOffsetX: 4,
      tileOffsetY: 8,
      tileWidth: 8
    })).toBe(6);

    expect(canvasPointToTilesetTileID({
      imageHeight: 32,
      imageWidth: 32,
      pointX: 999,
      pointY: -10,
      renderedHeight: 64,
      renderedWidth: 64,
      tileHeight: 8,
      tileOffsetX: 4,
      tileOffsetY: 8,
      tileWidth: 8
    })).toBe(3);
  });

  it("derives the rich paint inspector presentation for a tileset image", () => {
    const room: RoomsWorkspaceRoom = {
      id: "room-overworld",
      name: "overworld",
      width: 30,
      height: 20,
      gbaResolution: "240 x 160",
      music: null,
      cameraMode: "Follow Player",
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
      cameraBoundsEditable: false,
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      sceneType: "topdown",
      playerActorName: "Player",
      background: "tileset_default.png",
      backgroundSource: "Assets/tileset_default.png",
      backgroundBundledDefaultAsset: null,
      backgroundTileHeight: 16,
      backgroundTileOffsetX: 0,
      backgroundTileOffsetY: 0,
      backgroundTileWidth: 16,
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: false,
      tileCount: 600,
      tileCells: Array.from({ length: 600 }, () => 0),
      activeLayerTileCells: Array.from({ length: 600 }, () => 0),
      collisionCount: 0,
      collisionCells: Array.from({ length: 600 }, () => false),
      referenceImageCount: 0,
      layeredPaintingEnabled: true,
      activeTileLayerMapping: "BG2",
      paintedTileCount: 0,
      isActive: true,
      isStart: true,
      warnings: []
    };

    expect(deriveRoomPaintInspectorPresentation(room, {
      activeTileLayerMapping: "BG2",
      imageSize: { width: 256, height: 256 },
      layeredPaintingEnabled: true,
      paintedTileCount: 0,
      selectedTileID: 5,
      selectedTool: "brush",
      videoModeId: 0,
      videoModeLabel: "Modo 0 — 4 tilemaps estaticos"
    })).toEqual({
      activeTileLabel: "Tile 5",
      backgroundName: "tileset_default.png",
      compositeTileCount: 0,
      layerDescription: "Tilemap principal da cena; no Modo 1 tambem suporta rotacao e escala (afinidade).",
      layerLabel: "BG2 — Mapa principal",
      layerOptions: [
        { available: true, description: "Camada mais ao fundo; ideal para ceu, parallax e elementos distantes (Modo 0 e Modo 2 afinidade).", disabledReason: null, isActive: false, label: "BG3 — Fundo distante", layerKind: "text", mapping: "BG3" },
        { available: true, description: "Tilemap principal da cena; no Modo 1 tambem suporta rotacao e escala (afinidade).", disabledReason: null, isActive: true, label: "BG2 — Mapa principal", layerKind: "text", mapping: "BG2" },
        { available: true, description: "Detalhes sobre o chao, props e vegetacao alta; suporta transparencia via canal alpha.", disabledReason: null, isActive: false, label: "BG1 — Overlay", layerKind: "text", mapping: "BG1" },
        { available: true, description: "Camada frontal que pode cobrir o jogador e sprites OBJ quando a prioridade exige.", disabledReason: null, isActive: false, label: "BG0 — Frente", layerKind: "text", mapping: "BG0" }
      ],
      layeredPaintingEnabled: true,
      modeLabel: "Normal",
      videoModeLabel: "Modo 0 — 4 tilemaps estaticos",
      selectedTileSize: "16x16",
      tileCountLabel: "256/256 px - 16x16 - 256 tiles 16x16",
      tileSizeOptions: [
        { label: "8x8", value: 8, isActive: false },
        { label: "16x16", value: 16, isActive: true },
        { label: "32x32", value: 32, isActive: false },
        { label: "64x64", value: 64, isActive: false }
      ],
      toolLabel: "Pincel",
      usesFreeSize: false
    });
  });

  it("derives tileset regions for tile IDs", () => {
    expect(tilesetRegionForTileID({
      imageHeight: 32,
      imageWidth: 32,
      tileHeight: 8,
      tileID: 1,
      tileOffsetX: 4,
      tileOffsetY: 2,
      tileWidth: 8
    })).toEqual({
      height: 8,
      width: 8,
      x: 4,
      y: 2
    });

    expect(tilesetRegionForTileID({
      imageHeight: 32,
      imageWidth: 32,
      tileHeight: 8,
      tileID: 5,
      tileOffsetX: 4,
      tileOffsetY: 2,
      tileWidth: 8
    })).toEqual({
      height: 8,
      width: 8,
      x: 12,
      y: 10
    });

    expect(tilesetRegionForTileID({
      imageHeight: 32,
      imageWidth: 32,
      tileHeight: 8,
      tileID: 99,
      tileOffsetX: 4,
      tileOffsetY: 2,
      tileWidth: 8
    })).toEqual({
      height: 8,
      width: 8,
      x: 20,
      y: 18
    });
  });

  it("creates a rectangular multi-tile stamp regardless of drag direction", () => {
    expect(deriveTilesetTileStamp({
      endTileID: 6,
      imageHeight: 32,
      imageWidth: 32,
      startTileID: 11,
      tileHeight: 8,
      tileWidth: 8
    })).toEqual({
      height: 2,
      tileIDs: [6, 7, 10, 11],
      width: 2
    });
  });

  it("projects rectangular tool areas onto the same isometric grid", () => {
    expect(isometricRoomAreaPlacement(6, 4, { x: 1, y: 1, width: 2, height: 2 })).toEqual({
      clipPath: "polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)",
      heightPercent: 40,
      leftPercent: 20,
      topPercent: 20,
      widthPercent: 40
    });
  });

  it("projects every covered floor when an isometric area crosses a height boundary", () => {
    const config = { ...DEFAULT_ISOMETRIC_SCENE_CONFIG, tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 24 };
    const heights = Array(16).fill(0);
    heights[10] = 3;
    const area = isometricRoomAreaPlacement(4, 4, { x: 1, y: 2, width: 2, height: 1 }, config, undefined,
      { width: 240, height: 160 }, heights);
    // Cell (1,2) spans y=48..64; raised (2,2) spans y=32..48.
    expect(area.topPercent).toBeCloseTo(20);
    expect(area.heightPercent).toBeCloseTo(20);
    expect(area.leftPercent).toBeCloseTo(36.6666667);
    expect(area.widthPercent).toBeCloseTo(20);
    expect(area.clipPath).toBe("shape(nonzero from 33.3333% 50%, line to 66.6667% 75%, line to 33.3333% 100%, line to 0% 75%, close, move to 66.6667% 0%, line to 100% 25%, line to 66.6667% 50%, line to 33.3333% 25%, close)");
  });

  it("keeps a uniformly elevated isometric area a single diamond", () => {
    const config = { ...DEFAULT_ISOMETRIC_SCENE_CONFIG, tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 24 };
    const heights = Array(16).fill(2);
    const area = isometricRoomAreaPlacement(4, 4, { x: 1, y: 1, width: 2, height: 2 }, config, undefined,
      { width: 240, height: 160 }, heights);
    expect(area.clipPath).toBe("polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)");
    expect(area.topPercent).toBeCloseTo(15);
    expect(area.heightPercent).toBeCloseTo(20);
  });

  it("derives tilemap overlay cells for collisions, actors and trigger areas", () => {
    const overlays = deriveRoomTileOverlayCells(
      {
        id: "room-overworld",
        name: "overworld",
        width: 4,
        height: 3,
        gbaResolution: "32 x 24",
        music: null,
        cameraMode: "fixed_center",
        cameraZoom: 100,
        cameraBounds: { x: 0, y: 0, width: 4, height: 3 },
        cameraBoundsEditable: false,
        parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
        sceneType: "topdown",
        playerActorName: null,
        background: null,
        backgroundSource: null,
        backgroundBundledDefaultAsset: null,
        backgroundTileHeight: 8,
        backgroundTileOffsetX: 0,
        backgroundTileOffsetY: 0,
        backgroundTileWidth: 8,
        backgroundRenderMode: "tilemap",
        gbStudioUseBackgroundLayout: false,
        tileCount: 12,
        tileCells: [],
      activeLayerTileCells: [],
        collisionCount: 2,
        collisionCells: [false, true, false, false, false, false, true, false, false, false, false, false],
        collisionTypes: ["free", "solid", "free", "free", "free", "free", "solid", "free", "free", "free", "free", "free"],
        referenceImageCount: 0,
        layeredPaintingEnabled: true,
        activeTileLayerMapping: "BG2",
        paintedTileCount: 0,
        isActive: true,
        isStart: true,
        warnings: []
      },
      [
        { kind: "actor", id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 0, width: 1, height: 1, eventName: null, isInActiveRoom: true },
        { kind: "trigger", id: "trigger-door", name: "Door", roomName: "overworld", x: 2, y: 1, width: 2, height: 2, eventName: null, isInActiveRoom: true }
      ]
    );

    expect(overlays[1]).toMatchObject({ actorCount: 1, collision: true, collisionType: "solid", triggerCount: 0 });
    expect(overlays[6]).toMatchObject({ actorCount: 0, collision: true, collisionType: "solid", triggerCount: 1 });
    expect(overlays[7]).toMatchObject({ actorCount: 0, collision: false, collisionType: "free", triggerCount: 1 });
    expect(overlays[10]).toMatchObject({ actorCount: 0, collision: false, collisionType: "free", triggerCount: 1 });
    expect(overlays[11]).toMatchObject({ actorCount: 0, collision: false, collisionType: "free", triggerCount: 1 });
  });

  it("derives background alignment and placement diagnostics for actors and triggers", () => {
    const room = {
      ...deriveRoomsWorkspacePresentation(createBlankProjectData({ name: "Geometry diagnostics" })).rooms[0]!,
      width: 4,
      height: 3,
      background: "background.png",
      backgroundPixelWidth: 32,
      backgroundPixelHeight: 24,
      gbStudioUseBackgroundLayout: true,
      collisionTypes: ["free", "solid", "free", "free", "free", "free", "free", "free", "free", "free", "free", "free"] as RoomCollisionType[]
    };
    const entities: RoomsWorkspaceEntity[] = [
      { kind: "actor", id: "actor-player", name: "Player", roomName: room.name, x: 1, y: 0, width: 1, height: 1, eventName: null, isInActiveRoom: true },
      { kind: "trigger", id: "trigger-exit", name: "Saída", roomName: room.name, x: 3, y: 2, width: 2, height: 1, eventName: null, isInActiveRoom: true }
    ];

    const diagnostics = deriveRoomGeometryDiagnostics(room, entities);

    expect(diagnostics.backgroundAlignment).toMatchObject({
      status: "aligned",
      expectedWidth: 32,
      expectedHeight: 24,
      actualWidth: 32,
      actualHeight: 24
    });
    expect(diagnostics.actorPlacement.blocked).toEqual(["Player"]);
    expect(diagnostics.triggerPlacement.outsideBounds).toEqual(["Saída"]);
    expect(roomGeometryDiagnosticWarnings(room, diagnostics)).toEqual(expect.arrayContaining([
      expect.stringContaining("Player"),
      expect.stringContaining("Saída")
    ]));
  });

  it("não acusa ator de cutscene em staging fora da tela quando há movimento correspondente", () => {
    const project = createBlankProjectData({ name: "Diagnóstico de staging" });
    const sourceRoom = (project.scenas as Record<string, unknown>[])[0]!;
    Object.assign(sourceRoom, {
      id: "opening",
      name: "abertura",
      width: 30,
      height: 20,
      sceneType: "cutscene",
      runtime: {
        type: "cutscene",
        config: {
          steps: [{
            id: "step-1",
            actorMotions: [{
              actorIndex: 0,
              fromPosition: { x: 232, y: 152 },
              toPosition: { x: 240, y: 160 },
              durationFrames: 1
            }]
          }]
        }
      }
    });
    const room = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    const actor: RoomsWorkspaceEntity = {
      kind: "actor",
      id: "opening-airship",
      name: "Aeronave",
      roomName: room.name,
      x: 29,
      y: 19,
      width: 1,
      height: 1,
      eventName: null,
      isInActiveRoom: true,
      spriteFrame: {
        frameHeight: 32,
        frameWidth: 64,
        heightTiles: 4,
        layer: "OBJ",
        originX: 0,
        originY: 0,
        sourceHeight: 32,
        sourceWidth: 64,
        sourceX: 0,
        sourceY: 0,
        widthTiles: 8
      }
    };

    const diagnostics = deriveRoomGeometryDiagnostics(room, [actor]);

    expect(diagnostics.actorPlacement.outsideBounds).toEqual([]);
    expect(roomGeometryDiagnosticWarnings(room, diagnostics)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Aeronave")])
    );
  });

  it("mantém o aviso para ator de cutscene fora da grade sem staging declarado", () => {
    const project = createBlankProjectData({ name: "Diagnóstico de ator fora da grade" });
    const sourceRoom = (project.scenas as Record<string, unknown>[])[0]!;
    Object.assign(sourceRoom, {
      id: "opening",
      name: "abertura",
      width: 30,
      height: 20,
      sceneType: "cutscene",
      runtime: { type: "cutscene", config: { steps: [] } }
    });
    const room = deriveRoomsWorkspacePresentation(project).rooms[0]!;
    const actor: RoomsWorkspaceEntity = {
      kind: "actor",
      id: "opening-actor",
      name: "Ator inválido",
      roomName: room.name,
      x: 29,
      y: 19,
      width: 1,
      height: 1,
      eventName: null,
      isInActiveRoom: true,
      spriteFrame: {
        frameHeight: 32,
        frameWidth: 64,
        heightTiles: 4,
        layer: "OBJ",
        originX: 0,
        originY: 0,
        sourceHeight: 32,
        sourceWidth: 64,
        sourceX: 0,
        sourceY: 0,
        widthTiles: 8
      }
    };

    const diagnostics = deriveRoomGeometryDiagnostics(room, [actor]);

    expect(diagnostics.actorPlacement.outsideBounds).toEqual(["Ator inválido"]);
    expect(roomGeometryDiagnosticWarnings(room, diagnostics)).toEqual(
      expect.arrayContaining([expect.stringContaining("Ator inválido")])
    );
  });

  it("reconhece o mapa físico quadrado de um fundo affine do SHMUP", () => {
    const project = createBlankProjectData({ name: "Diagnóstico affine" });
    const scene = {
      id: "storm",
      name: "Tempestade",
      width: 90,
      height: 20,
      sceneType: "shmup",
      backgroundAssetName: "storm-affine.png",
      gbStudioUseBackgroundLayout: true,
      runtime: {
        type: "shmup",
        config: {
          capabilities: [{ id: "affine_background", enabled: true, settings: { physicalMapTiles: 128 } }],
          composition: {
            schema: 1,
            enabled: true,
            mode: "affine",
            layers: [{ id: "storm", kind: "affine_bg", layer: "BG2", enabled: true, assetId: "storm-affine.png" }]
          }
        }
      }
    };
    const room = deriveRoomsWorkspacePresentation({
      ...project,
      scenas: [scene],
      rooms: [scene],
      assets: [{ id: "storm-affine", kind: "Background", name: "storm-affine.png", metadata: { width: 1024, height: 1024 } }]
    }).rooms[0]!;

    expect(room.geometryDiagnostics?.backgroundAlignment).toMatchObject({
      status: "aligned",
      expectedWidth: 1024,
      expectedHeight: 1024,
      actualWidth: 1024,
      actualHeight: 1024
    });
    expect(roomGeometryDiagnosticWarnings(room, room.geometryDiagnostics!)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Fundo desalinhado")])
    );
  });

  it("reconhece a superfície multipágina da arena tática", () => {
    const project = createBlankProjectData({ name: "Diagnóstico tático" });
    const scene = {
      id: "tactical",
      name: "Arena Tática",
      width: 12,
      height: 8,
      sceneType: "isometric",
      backgroundAssetName: "tactical-reference.png",
      gbStudioUseBackgroundLayout: true,
      runtime: {
        type: "isometric",
        config: {
          worldMode: "static_composition",
          tacticalPresentation: {
            surfacePages: [
              { id: "r0c0", asset: "page-00.png", bankGroup: "page-00", world: { x: 0, y: 0, width: 240, height: 160 } },
              { id: "r0c1", asset: "page-01.png", bankGroup: "page-01", world: { x: 240, y: 0, width: 240, height: 160 } },
              { id: "r1c0", asset: "page-10.png", bankGroup: "page-10", world: { x: 0, y: 160, width: 240, height: 160 } },
              { id: "r1c1", asset: "page-11.png", bankGroup: "page-11", world: { x: 240, y: 160, width: 240, height: 160 } }
            ],
            units: [],
            props: []
          }
        }
      }
    };
    const room = deriveRoomsWorkspacePresentation({
      ...project,
      scenas: [scene],
      rooms: [scene],
      assets: [{ id: "tactical-reference", kind: "Background", name: "tactical-reference.png", metadata: { width: 480, height: 320 } }]
    }).rooms[0]!;

    expect(room.geometryDiagnostics?.backgroundAlignment).toMatchObject({
      status: "aligned",
      expectedWidth: 480,
      expectedHeight: 320,
      actualWidth: 480,
      actualHeight: 320
    });
    expect(roomGeometryDiagnosticWarnings(room, room.geometryDiagnostics!)).not.toEqual(
      expect.arrayContaining([expect.stringContaining("Fundo desalinhado")])
    );
  });

  it("selects the topmost room entity at a tile coordinate", () => {
    const entities = [
      { kind: "actor" as const, id: "actor-player", name: "Player", roomName: "overworld", x: 2, y: 2, width: 1, height: 1, eventName: null, isInActiveRoom: true },
      { kind: "trigger" as const, id: "trigger-door", name: "Door", roomName: "overworld", x: 1, y: 1, width: 3, height: 2, eventName: null, isInActiveRoom: true },
      { kind: "actor" as const, id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 2, y: 2, width: 1, height: 1, eventName: null, isInActiveRoom: false }
    ];

    expect(selectRoomEntityAtTile(entities, { roomName: "overworld", tileX: 2, tileY: 2 })).toMatchObject({
      kind: "trigger",
      id: "trigger-door"
    });
    expect(selectRoomEntityAtTile(entities, { roomName: "overworld", tileX: 2, tileY: 2, ignoredEntityKey: "trigger:trigger-door" })).toMatchObject({
      kind: "actor",
      id: "actor-player"
    });
    expect(selectRoomEntityAtTile(entities, {
      roomName: "overworld",
      tileX: 2,
      tileY: 2,
      visibleEntityKeys: new Set(["actor:actor-player"])
    })).toMatchObject({
      kind: "actor",
      id: "actor-player"
    });
    expect(selectRoomEntityAtTile(entities, { roomName: "overworld", tileX: 4, tileY: 2 })).toBeNull();
    expect(selectRoomEntityAtTile(entities, { roomName: "shop", tileX: 2, tileY: 2 })).toMatchObject({
      kind: "actor",
      id: "actor-shop"
    });

    const tallActor: RoomsWorkspaceEntity = {
      kind: "actor",
      id: "actor-tall",
      name: "Tall actor",
      roomName: "overworld",
      x: 1,
      y: 0,
      width: 1,
      height: 1,
      eventName: null,
      isInActiveRoom: true,
      spriteFrame: {
        frameHeight: 32,
        frameWidth: 16,
        heightTiles: 4,
        layer: "OBJ",
        originX: 0,
        originY: 0,
        sourceHeight: 32,
        sourceWidth: 16,
        sourceX: 0,
        sourceY: 0,
        widthTiles: 2
      }
    };

    expect(selectRoomEntityAtTile([tallActor], { roomName: "overworld", tileX: 1, tileY: 0 })).toBeNull();
    expect(selectRoomEntityAtTile([tallActor], { roomName: "overworld", tileX: 1, tileY: 3 })).toMatchObject({ id: "actor-tall" });
    expect(selectRoomEntityAtTile([tallActor], { roomName: "overworld", tileX: 2, tileY: 3 })).toMatchObject({ id: "actor-tall" });
    expect(selectRoomEntityAtTile([tallActor], { roomName: "overworld", sceneType: "isometric", tileX: 1, tileY: 0 })).toMatchObject({ id: "actor-tall" });
    expect(selectRoomEntityAtTile([tallActor], { roomName: "overworld", sceneType: "isometric", tileX: 1, tileY: 3 })).toBeNull();
  });

  it("mantém a origem negativa do ator no footprint de seleção", () => {
    const entity: RoomsWorkspaceEntity = {
      kind: "actor",
      id: "actor-farm",
      name: "Farm actor",
      roomName: "overworld",
      x: 5,
      y: 5,
      width: 1,
      height: 1,
      eventName: null,
      isInActiveRoom: true,
      spriteFrame: {
        frameHeight: 48,
        frameWidth: 48,
        heightTiles: 6,
        layer: "OBJ",
        originX: -16,
        originY: 0,
        sourceHeight: 48,
        sourceWidth: 48,
        sourceX: 0,
        sourceY: 0,
        widthTiles: 6
      }
    };

    expect(roomEntitySelectionFootprint(entity, "topdown")).toEqual({
      height: 1,
      width: 6,
      x: 7,
      y: 10
    });
  });

  it("derives multi-entity selection with replacement, additive toggle and active-room filtering", () => {
    const entities = [
      { kind: "actor" as const, id: "actor-player", name: "Player", roomName: "overworld", x: 2, y: 2, width: 1, height: 1, eventName: null, isInActiveRoom: true },
      { kind: "trigger" as const, id: "trigger-door", name: "Door", roomName: "overworld", x: 1, y: 1, width: 3, height: 2, eventName: null, isInActiveRoom: true },
      { kind: "actor" as const, id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 2, y: 2, width: 1, height: 1, eventName: null, isInActiveRoom: false }
    ];

    expect(deriveRoomEntitySelection({
      currentKeys: [],
      entities,
      roomName: "overworld",
      targetKey: "actor:actor-player"
    })).toEqual(["actor:actor-player"]);

    expect(deriveRoomEntitySelection({
      additive: true,
      currentKeys: ["actor:actor-player"],
      entities,
      roomName: "overworld",
      targetKey: "trigger:trigger-door"
    })).toEqual(["actor:actor-player", "trigger:trigger-door"]);

    expect(deriveRoomEntitySelection({
      additive: true,
      currentKeys: ["actor:actor-player", "trigger:trigger-door"],
      entities,
      roomName: "overworld",
      targetKey: "actor:actor-player"
    })).toEqual(["trigger:trigger-door"]);

    expect(deriveRoomEntitySelection({
      currentKeys: ["actor:actor-player", "trigger:trigger-door"],
      entities,
      roomName: "overworld",
      targetKey: "trigger:trigger-door"
    })).toEqual(["trigger:trigger-door"]);

    expect(deriveRoomEntitySelection({
      currentKeys: ["actor:actor-player"],
      entities,
      roomName: "overworld",
      targetKey: "actor:actor-shop"
    })).toEqual([]);
  });

  it("derives selected entity bounds for visual feedback in the active room grid", () => {
    const selectedCells = deriveRoomSelectedEntityCells(
      {
        id: "room-overworld",
        name: "overworld",
        width: 4,
        height: 3,
        gbaResolution: "32 x 24",
        music: null,
        cameraMode: "fixed_center",
        cameraZoom: 100,
        cameraBounds: { x: 0, y: 0, width: 4, height: 3 },
        cameraBoundsEditable: false,
        parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
        sceneType: "topdown",
        playerActorName: null,
        background: null,
        backgroundSource: null,
        backgroundBundledDefaultAsset: null,
        backgroundTileHeight: 8,
        backgroundTileOffsetX: 0,
        backgroundTileOffsetY: 0,
        backgroundTileWidth: 8,
        backgroundRenderMode: "tilemap",
        gbStudioUseBackgroundLayout: false,
        tileCount: 12,
        tileCells: [],
      activeLayerTileCells: [],
        collisionCount: 0,
        collisionCells: [],
        referenceImageCount: 0,
        layeredPaintingEnabled: true,
        activeTileLayerMapping: "BG2",
        paintedTileCount: 0,
        isActive: true,
        isStart: true,
        warnings: []
      },
      [
        { kind: "actor", id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 0, width: 1, height: 1, eventName: null, isInActiveRoom: true },
        { kind: "trigger", id: "trigger-door", name: "Door", roomName: "overworld", x: 2, y: 1, width: 4, height: 2, eventName: null, isInActiveRoom: true },
        { kind: "actor", id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 1, y: 1, width: 1, height: 1, eventName: null, isInActiveRoom: false }
      ],
      ["actor:actor-player", "trigger:trigger-door", "actor:actor-shop"]
    );

    expect(selectedCells).toEqual([
      false, true, false, false,
      false, false, true, true,
      false, false, true, true
    ]);
  });

  it("highlights only the bottom sprite row used to grab a tall actor", () => {
    const room: RoomsWorkspaceRoom = {
      id: "room-overworld",
      name: "overworld",
      width: 5,
      height: 5,
      gbaResolution: "40 x 40",
      music: null,
      cameraMode: "Fixed",
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width: 5, height: 5 },
      cameraBoundsEditable: false,
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      sceneType: "topdown",
      playerActorName: null,
      background: null,
      backgroundSource: null,
      backgroundBundledDefaultAsset: null,
      backgroundTileHeight: 8,
      backgroundTileOffsetX: 0,
      backgroundTileOffsetY: 0,
      backgroundTileWidth: 8,
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: false,
      tileCount: 25,
      tileCells: [],
      activeLayerTileCells: [],
      collisionCount: 0,
      collisionCells: [],
      referenceImageCount: 0,
      layeredPaintingEnabled: true,
      activeTileLayerMapping: "BG2",
      paintedTileCount: 0,
      isActive: true,
      isStart: true,
      warnings: []
    };
    const actor: RoomsWorkspaceEntity = {
      kind: "actor",
      id: "actor-tall",
      name: "Tall actor",
      roomName: "overworld",
      x: 1,
      y: 0,
      width: 1,
      height: 1,
      eventName: null,
      isInActiveRoom: true,
      spriteFrame: {
        frameHeight: 32,
        frameWidth: 16,
        heightTiles: 4,
        layer: "OBJ",
        originX: 0,
        originY: 0,
        sourceHeight: 32,
        sourceWidth: 16,
        sourceX: 0,
        sourceY: 0,
        widthTiles: 2
      }
    };

    const selectedCells = deriveRoomSelectedEntityCells(room, [actor], ["actor:actor-tall"]);
    expect(selectedCells.map((selected, index) => selected ? index : -1).filter((index) => index >= 0)).toEqual([16, 17]);
  });

  it("derives alignment guides for selected room entities sharing x or y coordinates", () => {
    const room: RoomsWorkspaceRoom = {
      id: "room-overworld",
      name: "overworld",
      width: 10,
      height: 8,
      gbaResolution: "80 x 64",
      music: null,
      cameraMode: "Fixed",
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
      cameraBoundsEditable: false,
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      sceneType: "topdown",
      playerActorName: null,
      background: null,
      backgroundSource: null,
      backgroundBundledDefaultAsset: null,
      backgroundTileHeight: 8,
      backgroundTileOffsetX: 0,
      backgroundTileOffsetY: 0,
      backgroundTileWidth: 8,
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: false,
      tileCount: 80,
      tileCells: [],
      activeLayerTileCells: [],
      collisionCount: 0,
      collisionCells: [],
      referenceImageCount: 0,
      layeredPaintingEnabled: true,
      activeTileLayerMapping: "BG2",
      paintedTileCount: 0,
      isActive: true,
      isStart: true,
      warnings: []
    };
    const entities = [
      { kind: "actor" as const, id: "actor-left", name: "Left", roomName: "overworld", x: 2, y: 1, width: 1, height: 1, eventName: null, isInActiveRoom: true },
      { kind: "trigger" as const, id: "trigger-line", name: "Line", roomName: "overworld", x: 2, y: 4, width: 2, height: 2, eventName: null, isInActiveRoom: true },
      { kind: "actor" as const, id: "actor-bottom", name: "Bottom", roomName: "overworld", x: 7, y: 4, width: 1, height: 1, eventName: null, isInActiveRoom: true }
    ];

    expect(deriveRoomEntityAlignmentGuides(room, entities, ["actor:actor-left", "trigger:trigger-line", "actor:actor-bottom"])).toEqual([
      { axis: "x", coordinate: 2, percent: 20, count: 2 },
      { axis: "y", coordinate: 4, percent: 50, count: 2 }
    ]);
    expect(deriveRoomEntityAlignmentGuides(room, entities, ["actor:actor-left"])).toEqual([]);
  });

  it("nudges selected room entities as a batch while clamping each entity inside the active room", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 5, height: 4 },
        { id: "room-shop", name: "shop", width: 8, height: 8 }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 },
        { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 1, y: 1 }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "overworld", x: 3, y: 2, width: 3, height: 2 },
        { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 }
      ]
    };

    const next = nudgeRoomEntitiesInProject(project, {
      deltaX: 2,
      deltaY: 1,
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player", "trigger:trigger-door", "actor:actor-shop"]
    });

    expect(next.actors).toEqual([
      { id: "actor-player", name: "Player", roomName: "overworld", x: 3, y: 2 },
      { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 1, y: 1 }
    ]);
    expect(next.triggers).toEqual([
      { id: "trigger-door", name: "Door", roomName: "overworld", x: 2, y: 2, width: 3, height: 2 },
      { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 }
    ]);
    expect(project.actors[0]).toEqual({ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 });
  });

  it("nudges selected room entities with a configurable step size", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 20, height: 12 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 }],
      triggers: [{ id: "trigger-door", name: "Door", roomName: "overworld", x: 3, y: 2, width: 2, height: 2 }]
    };

    const next = nudgeRoomEntitiesInProject(project, {
      deltaX: 1,
      deltaY: -1,
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player", "trigger:trigger-door"],
      stepSize: 8
    });

    expect(next.actors).toEqual([
      { id: "actor-player", name: "Player", roomName: "overworld", x: 9, y: 0 }
    ]);
    expect(next.triggers).toEqual([
      { id: "trigger-door", name: "Door", roomName: "overworld", x: 11, y: 0, width: 2, height: 2 }
    ]);
  });

  it("rejects batch entity nudges with no selected active-room entities or invalid deltas", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 5, height: 4 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 }]
    };

    expect(nudgeRoomEntitiesInProject(project, {
      deltaX: Number.NaN,
      deltaY: 1,
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player"]
    })).toBe(project);
    expect(nudgeRoomEntitiesInProject(project, {
      deltaX: 1,
      deltaY: 0,
      roomID: "room-overworld",
      selectedKeys: ["trigger:missing"]
    })).toBe(project);
    expect(nudgeRoomEntitiesInProject(project, {
      deltaX: 1,
      deltaY: 0,
      roomID: "missing",
      selectedKeys: ["actor:actor-player"]
    })).toBe(project);
    expect(nudgeRoomEntitiesInProject(project, {
      deltaX: 1,
      deltaY: 0,
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player"],
      stepSize: 0
    })).toBe(project);
  });

  it("removes selected room entities as a batch without touching other rooms", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 5, height: 4 },
        { id: "room-shop", name: "shop", width: 8, height: 8 }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 },
        { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 1, y: 1 }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "overworld", x: 3, y: 2, width: 3, height: 2 },
        { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 }
      ]
    };

    const next = removeRoomEntitiesInProject(project, {
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player", "trigger:trigger-door", "actor:actor-shop"]
    });

    expect(next.actors).toEqual([
      { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 1, y: 1 }
    ]);
    expect(next.triggers).toEqual([
      { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 }
    ]);
    expect(project.actors).toHaveLength(2);
  });

  it("rejects batch entity removal with no selected active-room entities", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 5, height: 4 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 }]
    };

    expect(removeRoomEntitiesInProject(project, {
      roomID: "room-overworld",
      selectedKeys: []
    })).toBe(project);
    expect(removeRoomEntitiesInProject(project, {
      roomID: "room-overworld",
      selectedKeys: ["trigger:missing"]
    })).toBe(project);
    expect(removeRoomEntitiesInProject(project, {
      roomID: "missing",
      selectedKeys: ["actor:actor-player"]
    })).toBe(project);
  });

  it("duplicates selected room entities as a batch with new ids and offset positions", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 5, height: 4 },
        { id: "room-shop", name: "shop", width: 8, height: 8 }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1, eventName: "player_start" },
        { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 1, y: 1 }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "overworld", x: 3, y: 2, width: 2, height: 2 },
        { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 }
      ]
    };

    const next = duplicateRoomEntitiesInProject(project, {
      idForCopy: (kind, sourceID, copyIndex) => `${kind}-${sourceID}-copy-${copyIndex}`,
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player", "trigger:trigger-door", "actor:actor-shop"]
    });

    expect(next.actors).toEqual([
      { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1, eventName: "player_start" },
      { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 1, y: 1 },
      { id: "actor-actor-player-copy-1", name: "Player copy", roomName: "overworld", x: 2, y: 2, eventName: "player_start" }
    ]);
    expect(next.triggers).toEqual([
      { id: "trigger-door", name: "Door", roomName: "overworld", x: 3, y: 2, width: 2, height: 2 },
      { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 },
      { id: "trigger-trigger-door-copy-1", name: "Door copy", roomName: "overworld", x: 3, y: 2, width: 2, height: 2 }
    ]);
    expect(project.actors).toHaveLength(2);
  });

  it("rejects batch entity duplication with no selected active-room entities", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 5, height: 4 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 }]
    };

    const options = {
      idForCopy: (kind: "actor" | "trigger", sourceID: string, copyIndex: number) => `${kind}-${sourceID}-copy-${copyIndex}`,
      roomID: "room-overworld",
      selectedKeys: [] as string[]
    };

    expect(duplicateRoomEntitiesInProject(project, options)).toBe(project);
    expect(duplicateRoomEntitiesInProject(project, {
      ...options,
      selectedKeys: ["trigger:missing"]
    })).toBe(project);
    expect(duplicateRoomEntitiesInProject(project, {
      ...options,
      roomID: "missing",
      selectedKeys: ["actor:actor-player"]
    })).toBe(project);
  });

  it("aligns selected room entities to the first selected entity on the chosen axis", () => {
    const project = {
      scenas: [
        { id: "room-overworld", name: "overworld", width: 6, height: 5 },
        { id: "room-shop", name: "shop", width: 8, height: 8 }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 3 },
        { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 4, y: 4 }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "overworld", x: 4, y: 1, width: 2, height: 2 },
        { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 }
      ]
    };

    const alignedX = alignRoomEntitiesInProject(project, {
      axis: "x",
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player", "trigger:trigger-door", "actor:actor-shop"]
    });

    expect(alignedX.actors).toEqual([
      { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 3 },
      { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 4, y: 4 }
    ]);
    expect(alignedX.triggers).toEqual([
      { id: "trigger-door", name: "Door", roomName: "overworld", x: 1, y: 1, width: 2, height: 2 },
      { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 }
    ]);

    const alignedY = alignRoomEntitiesInProject(project, {
      axis: "y",
      roomID: "room-overworld",
      selectedKeys: ["trigger:trigger-door", "actor:actor-player"]
    });

    expect(alignedY.actors).toEqual([
      { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 },
      { id: "actor-shop", name: "Shopkeeper", roomName: "shop", x: 4, y: 4 }
    ]);
    expect(alignedY.triggers).toEqual([
      { id: "trigger-door", name: "Door", roomName: "overworld", x: 4, y: 1, width: 2, height: 2 },
      { id: "trigger-exit", name: "Exit", roomName: "overworld", x: 0, y: 0, width: 1, height: 1 }
    ]);
    expect(project.triggers[0]).toEqual({ id: "trigger-door", name: "Door", roomName: "overworld", x: 4, y: 1, width: 2, height: 2 });
  });

  it("rejects batch entity alignment without at least two selected active-room entities", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 6, height: 5 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 3 }]
    };

    expect(alignRoomEntitiesInProject(project, {
      axis: "x",
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player"]
    })).toBe(project);
    expect(alignRoomEntitiesInProject(project, {
      axis: "z" as "x",
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-player", "trigger:missing"]
    })).toBe(project);
    expect(alignRoomEntitiesInProject(project, {
      axis: "y",
      roomID: "missing",
      selectedKeys: ["actor:actor-player", "trigger:missing"]
    })).toBe(project);
  });

  it("distributes selected room entities evenly between the first and last selected entities", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 12, height: 8 }],
      actors: [
        { id: "actor-left", name: "Left", roomName: "overworld", x: 1, y: 1 },
        { id: "actor-middle", name: "Middle", roomName: "overworld", x: 9, y: 5 },
        { id: "actor-right", name: "Right", roomName: "overworld", x: 10, y: 7 }
      ],
      triggers: [
        { id: "trigger-mid", name: "Gate", roomName: "overworld", x: 5, y: 3, width: 2, height: 2 }
      ]
    };

    const distributedX = distributeRoomEntitiesInProject(project, {
      axis: "x",
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-left", "trigger:trigger-mid", "actor:actor-right"]
    });

    expect(distributedX.actors).toEqual([
      { id: "actor-left", name: "Left", roomName: "overworld", x: 1, y: 1 },
      { id: "actor-middle", name: "Middle", roomName: "overworld", x: 9, y: 5 },
      { id: "actor-right", name: "Right", roomName: "overworld", x: 10, y: 7 }
    ]);
    expect(distributedX.triggers).toEqual([
      { id: "trigger-mid", name: "Gate", roomName: "overworld", x: 6, y: 3, width: 2, height: 2 }
    ]);

    const distributedY = distributeRoomEntitiesInProject(project, {
      axis: "y",
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-left", "trigger:trigger-mid", "actor:actor-right"]
    });

    expect(distributedY.triggers).toEqual([
      { id: "trigger-mid", name: "Gate", roomName: "overworld", x: 5, y: 4, width: 2, height: 2 }
    ]);
    expect(project.triggers[0]).toEqual({ id: "trigger-mid", name: "Gate", roomName: "overworld", x: 5, y: 3, width: 2, height: 2 });
  });

  it("rejects batch entity distribution without at least three selected active-room entities", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 12, height: 8 }],
      actors: [
        { id: "actor-left", name: "Left", roomName: "overworld", x: 1, y: 1 },
        { id: "actor-right", name: "Right", roomName: "overworld", x: 10, y: 7 }
      ]
    };

    expect(distributeRoomEntitiesInProject(project, {
      axis: "x",
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-left", "actor:actor-right"]
    })).toBe(project);
    expect(distributeRoomEntitiesInProject(project, {
      axis: "z" as "x",
      roomID: "room-overworld",
      selectedKeys: ["actor:actor-left", "actor:actor-right", "trigger:missing"]
    })).toBe(project);
    expect(distributeRoomEntitiesInProject(project, {
      axis: "y",
      roomID: "missing",
      selectedKeys: ["actor:actor-left", "actor:actor-right", "trigger:missing"]
    })).toBe(project);
  });

  it("resizes triggers from a canvas handle while keeping them inside the room", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 8, height: 6 }],
      triggers: [{ id: "trigger-door", name: "Door", roomName: "overworld", x: 2, y: 1, width: 2, height: 2 }]
    };

    const resized = resizeRoomTriggerToTileInProject(project, "trigger-door", {
      roomID: "room-overworld",
      tileX: 99,
      tileY: 99
    });

    expect(resized.triggers).toEqual([{ id: "trigger-door", name: "Door", roomName: "overworld", x: 2, y: 1, width: 6, height: 5 }]);
    expect(project.triggers[0]).toEqual({ id: "trigger-door", name: "Door", roomName: "overworld", x: 2, y: 1, width: 2, height: 2 });
  });

  it("rejects trigger canvas resize for unknown rooms, actors or invalid coordinates", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 8, height: 6 }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 }],
      triggers: [{ id: "trigger-door", name: "Door", roomName: "overworld", x: 2, y: 1, width: 2, height: 2 }]
    };

    expect(resizeRoomTriggerToTileInProject(project, "missing", { roomID: "room-overworld", tileX: 4, tileY: 3 })).toBe(project);
    expect(resizeRoomTriggerToTileInProject(project, "actor-player", { roomID: "room-overworld", tileX: 4, tileY: 3 })).toBe(project);
    expect(resizeRoomTriggerToTileInProject(project, "trigger-door", { roomID: "missing", tileX: 4, tileY: 3 })).toBe(project);
    expect(resizeRoomTriggerToTileInProject(project, "trigger-door", { roomID: "room-overworld", tileX: Number.NaN, tileY: 3 })).toBe(project);
  });

  it("toggles collision cells and mirrors the active room copy", () => {
    const project = {
      scena: { id: "room-overworld", name: "overworld", width: 2, height: 2, collisionTypes: ["solid", "free"] },
      room: { id: "room-overworld", name: "overworld", width: 2, height: 2, collisionTypes: ["solid", "free"] },
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, collisionTypes: ["solid", "free"] }]
    };

    const next = toggleRoomCollisionCellInProject(project, "room-overworld", 2);
    const nextScenas = next.scenas as Record<string, unknown>[];

    expect(nextScenas[0].collisionTypes).toEqual(["solid", "free", "solid", "free"]);
    expect(next.scena).toEqual({ id: "room-overworld", name: "overworld", width: 2, height: 2, collisionTypes: ["solid", "free", "solid", "free"] });
    expect(next.room).toBeUndefined();
    expect(project.scenas[0].collisionTypes).toEqual(["solid", "free"]);
  });

  it("ignores collision toggles outside the room tile range", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, collisionTypes: ["solid", "free"] }]
    };

    expect(toggleRoomCollisionCellInProject(project, "room-overworld", 4)).toBe(project);
    expect(toggleRoomCollisionCellInProject(project, "missing-room", 0)).toBe(project);
  });

  it("sets collision cells explicitly for drag painting", () => {
    const project = {
      scena: { id: "room-overworld", name: "overworld", width: 3, height: 2, collisionTypes: ["free", "solid"] },
      scenas: [{ id: "room-overworld", name: "overworld", width: 3, height: 2, collisionTypes: ["free", "solid"] }]
    };

    const blocked = setRoomCollisionCellInProject(project, "room-overworld", 2, true);

    expect((blocked.scenas as Record<string, unknown>[])[0].collisionTypes).toEqual(["free", "solid", "solid", "free", "free", "free"]);
    expect(blocked.scena).toEqual({ id: "room-overworld", name: "overworld", width: 3, height: 2, collisionTypes: ["free", "solid", "solid", "free", "free", "free"] });

    expect(setRoomCollisionCellInProject(blocked, "room-overworld", 2, true)).toBe(blocked);

    const unblocked = setRoomCollisionCellInProject(blocked, "room-overworld", 1, false);
    expect((unblocked.scenas as Record<string, unknown>[])[0].collisionTypes).toEqual(["free", "free", "solid", "free", "free", "free"]);
  });

  it("preenche a região de colisão sem atravessar blocos e preserva metatiles", () => {
    const collisionTypes = Array.from({ length: 6 * 4 }, () => "solid" as RoomCollisionType);
    for (const [blockX, blockY] of [[0, 0], [1, 0], [0, 1]] as const) {
      for (let y = blockY * 2; y < blockY * 2 + 2; y += 1) {
        for (let x = blockX * 2; x < blockX * 2 + 2; x += 1) {
          collisionTypes[y * 6 + x] = "free";
        }
      }
    }
    collisionTypes[2 * 6 + 4] = "free";
    collisionTypes[2 * 6 + 5] = "free";
    const project = {
      scena: { id: "room-overworld", name: "overworld", sceneType: "topdown", width: 6, height: 4, collisionTypes },
      scenas: [{ id: "room-overworld", name: "overworld", sceneType: "topdown", width: 6, height: 4, collisionTypes }]
    };

    const filled = applyRoomCollisionFillInProject(project, "room-overworld", 0, "water");
    const nextTypes = (filled.scenas as Record<string, unknown>[])[0]!.collisionTypes as string[];

    expect(nextTypes.slice(0, 4)).toEqual(["water", "water", "water", "water"]);
    expect(nextTypes.slice(6, 10)).toEqual(["water", "water", "water", "water"]);
    expect(nextTypes.slice(12, 16)).toEqual(["water", "water", "solid", "solid"]);
    expect(nextTypes[16]).toBe("free");
    expect(nextTypes[17]).toBe("free");
    expect(nextTypes[18]).toBe("water");
    expect(nextTypes[19]).toBe("water");
    expect(nextTypes[14]).toBe("solid");
    expect(nextTypes[15]).toBe("solid");
    expect(nextTypes[20]).toBe("solid");
    expect(nextTypes[21]).toBe("solid");
    expect(filled.scena).toEqual({ ...project.scena, collisionTypes: nextTypes });
    expect(project.scena.collisionTypes).toEqual(collisionTypes);
  });

  it("preenche células ortogonais em cenas sem contrato de metatile", () => {
    const project = {
      scenas: [{ id: "room-platformer", name: "platformer", sceneType: "platformer", width: 3, height: 2, collisionTypes: [
        "free", "free", "solid",
        "free", "solid", "free"
      ] }]
    };

    const filled = applyRoomCollisionFillInProject(project, "room-platformer", 0, "damage");
    expect((filled.scenas as Record<string, unknown>[])[0]!.collisionTypes).toEqual([
      "damage", "damage", "solid",
      "damage", "solid", "free"
    ]);
  });

  it("mantém a referência quando o preenchimento não altera a região", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, collisionTypes: ["solid", "solid", "solid", "solid"] }]
    };

    expect(applyRoomCollisionFillInProject(project, "room-overworld", 0, "solid")).toBe(project);
    expect(applyRoomCollisionFillInProject(project, "missing-room", 0, "free")).toBe(project);
  });

  it("derives contiguous room cell lines for fast canvas drag painting", () => {
    expect(roomCellLineIndexes(5, 1, 16)).toEqual([1, 6, 11, 16]);
    expect(roomCellLineIndexes(5, 4, 1)).toEqual([4, 3, 2, 1]);
    expect(roomCellLineIndexes(5, 0, 12)).toEqual([0, 6, 12]);
    expect(roomCellLineIndexes(0, 0, 1)).toEqual([]);
    expect(roomCellLineIndexes(5, -1, 1)).toEqual([]);
  });

  it("derives mini editor canvas actions for tile, collision and entity tools", () => {
    const room: RoomsWorkspaceRoom = {
      id: "room-overworld",
      name: "overworld",
      width: 5,
      height: 4,
      gbaResolution: "40 x 32",
      music: null,
      cameraMode: "Fixed",
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
      cameraBoundsEditable: false,
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      sceneType: "topdown",
      playerActorName: "Player",
      background: "tiles.png",
      backgroundSource: "Assets/tiles.png",
      backgroundBundledDefaultAsset: null,
      backgroundTileHeight: 8,
      backgroundTileOffsetX: 0,
      backgroundTileOffsetY: 0,
      backgroundTileWidth: 8,
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: false,
      tileCount: 20,
      tileCells: Array.from({ length: 20 }, () => 0),
      activeLayerTileCells: Array.from({ length: 20 }, () => 0),
      collisionCount: 1,
      collisionCells: Array.from({ length: 20 }, (_value, index) => index === 6),
      referenceImageCount: 0,
      layeredPaintingEnabled: true,
      activeTileLayerMapping: "BG2",
      paintedTileCount: 1,
      isActive: true,
      isStart: true,
      warnings: []
    };
    const entities: RoomsWorkspaceEntity[] = [
      { kind: "actor", id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1, width: 1, height: 1, eventName: null, isInActiveRoom: true },
      { kind: "trigger", id: "trigger-door", name: "Door", roomName: "overworld", x: 3, y: 1, width: 1, height: 1, eventName: null, isInActiveRoom: true }
    ];
    const base = {
      entities,
      room,
      selectedEntityKeys: ["actor:actor-player"],
      selectedEntityKey: "actor:actor-player",
      selectedEntityTool: "move" as const,
      selectedTileID: 7,
      selectedTool: "brush" as const
    };

    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 6,
      selectedEditMode: "collision",
      selectedEntityKey: null,
      selectedEntityKeys: []
    }).actions).toEqual([
      { type: "collision", roomID: "room-overworld", cellIndex: 6, collisionType: "solid" }
    ]);

    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 6,
      selectedEditMode: "entities",
      selectedEntityKey: null,
      selectedEntityKeys: [],
      selectedToolPanelMode: "actor"
    }).actions).toEqual([
      { type: "select_entity", selectedKeys: ["actor:actor-player"] }
    ]);

    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 16,
      previousCellIndex: 1,
      selectedEditMode: "tiles"
    }).actions).toEqual([
      { type: "tile", roomID: "room-overworld", options: { tool: "brush", cellIndex: 1, layerMapping: "BG2", tileID: 7 } },
      { type: "tile", roomID: "room-overworld", options: { tool: "brush", cellIndex: 6, layerMapping: "BG2", tileID: 7 } },
      { type: "tile", roomID: "room-overworld", options: { tool: "brush", cellIndex: 11, layerMapping: "BG2", tileID: 7 } },
      { type: "tile", roomID: "room-overworld", options: { tool: "brush", cellIndex: 16, layerMapping: "BG2", tileID: 7 } }
    ]);

    const tallActor: RoomsWorkspaceEntity = {
      ...entities[0],
      id: "actor-tall",
      name: "Tall actor",
      x: 1,
      y: 0,
      spriteFrame: {
        frameHeight: 32,
        frameWidth: 16,
        heightTiles: 4,
        layer: "OBJ",
        originX: 0,
        originY: 0,
        sourceHeight: 32,
        sourceWidth: 16,
        sourceX: 0,
        sourceY: 0,
        widthTiles: 2
      }
    };
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 18,
      previousCellIndex: 1,
      entities: [tallActor],
      entityGrabOffset: { x: 1, y: 0 },
      selectedEditMode: "entities",
      selectedEntityKey: "actor:actor-tall",
      selectedEntityKeys: ["actor:actor-tall"]
    }).actions).toEqual([
      {
        type: "place_entity",
        kind: "actor",
        entityID: "actor-tall",
        selectedKeys: ["actor:actor-tall"],
        options: { roomID: "room-overworld", x: 2, y: 0 }
      }
    ]);

    const collisionStart = deriveRoomCanvasActions({
      ...base,
      cellIndex: 1,
      selectedEditMode: "collision"
    });
    expect(collisionStart.collisionPaintType).toBe("solid");
    expect(collisionStart.actions).toEqual([
      { type: "collision", roomID: "room-overworld", cellIndex: 1, collisionType: "solid" }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 1,
      selectedEditMode: "collision",
      selectedTool: "fill"
    }).actions).toEqual([
      { type: "collision_fill", roomID: "room-overworld", cellIndex: 1, collisionType: "solid" }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 16,
      previousCellIndex: 1,
      selectedEditMode: "collision",
      selectedTool: "fill"
    }).actions).toEqual([]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 16,
      collisionPaintType: collisionStart.collisionPaintType,
      previousCellIndex: 1,
      selectedEditMode: "collision"
    }).actions).toEqual([
      { type: "collision", roomID: "room-overworld", cellIndex: 1, collisionType: "solid" },
      { type: "collision", roomID: "room-overworld", cellIndex: 6, collisionType: "solid" },
      { type: "collision", roomID: "room-overworld", cellIndex: 11, collisionType: "solid" },
      { type: "collision", roomID: "room-overworld", cellIndex: 16, collisionType: "solid" }
    ]);

    expect(deriveRoomCanvasActions({
      ...base,
      additive: true,
      cellIndex: 8,
      selectedEditMode: "select"
    }).actions).toEqual([
      { type: "select_entity", selectedKeys: ["actor:actor-player", "trigger:trigger-door"] }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 4,
      selectedEditMode: "select"
    }).actions).toEqual([]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 4,
      previousCellIndex: 1,
      selectedEditMode: "select"
    }).actions).toEqual([
      {
        type: "place_entity",
        kind: "actor",
        entityID: "actor-player",
        selectedKeys: ["actor:actor-player"],
        options: { roomID: "room-overworld", x: 4, y: 0 }
      }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 19,
      selectedEditMode: "select",
      selectedEntityKey: "trigger:trigger-door",
      selectedEntityKeys: ["trigger:trigger-door"],
      selectedEntityTool: "move"
    }).actions).toEqual([]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 19,
      previousCellIndex: 8,
      selectedEditMode: "select",
      selectedEntityKey: "trigger:trigger-door",
      selectedEntityKeys: ["trigger:trigger-door"],
      selectedEntityTool: "move"
    }).actions).toEqual([
      {
        type: "place_entity",
        kind: "trigger",
        entityID: "trigger-door",
        selectedKeys: ["trigger:trigger-door"],
        options: { roomID: "room-overworld", x: 4, y: 3 }
      }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      additive: true,
      cellIndex: 8,
      selectedEditMode: "entities"
    }).actions).toEqual([
      { type: "select_entity", selectedKeys: ["actor:actor-player", "trigger:trigger-door"] }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 4,
      selectedEditMode: "entities"
    }).actions).toEqual([]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 4,
      previousCellIndex: 1,
      selectedEditMode: "entities"
    }).actions).toEqual([
      {
        type: "place_entity",
        kind: "actor",
        entityID: "actor-player",
        selectedKeys: ["actor:actor-player"],
        options: { roomID: "room-overworld", x: 4, y: 0 }
      }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 4,
      selectedEditMode: "entities",
      selectedEntityKey: null,
      selectedEntityKeys: [],
      selectedToolPanelMode: "actor"
    }).actions).toEqual([
      {
        type: "create_actor",
        roomID: "room-overworld",
        options: { x: 4, y: 0 },
        selectedKeys: []
      }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: room.width + 1,
      selectedEditMode: "entities",
      selectedToolPanelMode: "actor"
    }).actions).toEqual([
      { type: "select_entity", selectedKeys: ["actor:actor-player"] }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 4,
      selectedEditMode: "entities",
      selectedEntityKey: null,
      selectedEntityKeys: []
    }).actions).toEqual([]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 19,
      selectedEditMode: "entities",
      selectedEntityKey: "trigger:trigger-door",
      selectedEntityTool: "resize"
    }).actions).toEqual([]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 19,
      previousCellIndex: 8,
      selectedEditMode: "entities",
      selectedEntityKey: "trigger:trigger-door",
      selectedEntityTool: "resize"
    }).actions).toEqual([
      {
        type: "resize_trigger",
        triggerID: "trigger-door",
        selectedKeys: ["trigger:trigger-door"],
        options: { roomID: "room-overworld", tileX: 4, tileY: 3 }
      }
    ]);
    expect(deriveRoomCanvasActions({
      ...base,
      cellIndex: 13,
      previousCellIndex: 8,
      selectedEditMode: "entities",
      selectedEntityKey: "actor:actor-player",
      selectedEntityKeys: ["actor:actor-player"],
      selectedEntityTool: "resize"
    }).actions).toEqual([
      {
        type: "resize_entity",
        entityID: "actor-player",
        fields: { height: 2, width: 3 },
        kind: "actor",
        selectedKeys: ["actor:actor-player"]
      }
    ]);
  });

  it("creates triggers in the active room with unique ids", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 6, height: 4 }],
      triggers: []
    };

    const next = createTriggerInProject(project, {
      roomID: "room-overworld",
      x: 2,
      y: 1,
      width: 2,
      height: 3
    });
    const triggers = next.triggers as Record<string, unknown>[];

    expect(triggers).toHaveLength(1);
    expect(triggers[0]).toMatchObject({
      id: "trigger_1",
      name: "Trigger 1",
      roomName: "overworld",
      x: 2,
      y: 1,
      width: 2,
      height: 3,
      eventName: ""
    });
  });

  it("creates actors in the active room with unique ids", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 6, height: 4 }],
      animationStates: [{ id: "state-player", name: "default", spriteSheet: "player_topdown_4dir.png" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 1 }]
    };

    const next = createActorInProject(project, {
      roomID: "room-overworld",
      x: 3,
      y: 2
    });
    const actors = next.actors as Record<string, unknown>[];

    expect(actors).toHaveLength(2);
    expect(actors[1]).toMatchObject({
      id: "actor_2",
      name: "Actor 2",
      roomName: "overworld",
      x: 3,
      y: 2,
      spriteSheet: "player_topdown_4dir.png",
      animationName: "idle_down",
      animationStateID: "state-player"
    });
  });

  it("derives trigger placement rectangles from grid cells", () => {
    expect(deriveTriggerPlacementFromCells(6, 8, 21)).toEqual({
      x: 2,
      y: 1,
      width: 2,
      height: 3
    });
    expect(deriveTriggerPlacementFromCells(6, 21, 8)).toEqual({
      x: 2,
      y: 1,
      width: 2,
      height: 3
    });
  });

  it("sets tilemap cells and mirrors the active room copy", () => {
    const project = {
      scena: { id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1] },
      room: { id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1] },
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1] }]
    };

    const next = setRoomTileCellInProject(project, "room-overworld", 2, 7);
    const nextScenas = next.scenas as Record<string, unknown>[];

    expect(nextScenas[0].tilemap).toEqual([1, 0, 7, 0]);
    expect(next.scena).toMatchObject({ id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1, 0, 7, 0] });
    expect(next.room).toBeUndefined();
    expect(project.scenas[0].tilemap).toEqual([1]);
  });

  it("ignores tile painting outside the room range", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1] }]
    };

    expect(setRoomTileCellInProject(project, "room-overworld", 4, 7)).toBe(project);
    expect(setRoomTileCellInProject(project, "missing-room", 0, 7)).toBe(project);
  });

  it("applies brush and eraser tile tools while mirroring the active room copy", () => {
    const project = {
      scena: { id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1, 2, 3, 4] },
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1, 2, 3, 4] }]
    };

    const brushed = applyRoomTileBrushInProject(project, "room-overworld", {
      tool: "brush",
      cellIndex: 1,
      tileID: 9
    });
    const erased = applyRoomTileBrushInProject(brushed, "room-overworld", {
      tool: "eraser",
      cellIndex: 2,
      tileID: 9
    });

    expect((erased.scenas as Record<string, unknown>[])[0].tilemap).toEqual([1, 9, 0, 4]);
    expect(erased.scena).toMatchObject({ id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1, 9, 0, 4] });
    expect(project.scenas[0].tilemap).toEqual([1, 2, 3, 4]);
  });

  it("applies a free rectangular tileset selection as a multi-tile brush", () => {
    const project = {
      scena: { id: "room-overworld", name: "overworld", width: 4, height: 3, tilemap: Array.from({ length: 12 }, () => 0) },
      scenas: [{ id: "room-overworld", name: "overworld", width: 4, height: 3, tilemap: Array.from({ length: 12 }, () => 0) }]
    };

    const next = applyRoomTileBrushInProject(project, "room-overworld", {
      tool: "brush",
      cellIndex: 5,
      tileID: 6,
      stamp: {
        height: 2,
        tileIDs: [6, 7, 10, 11],
        width: 2
      }
    });

    expect((next.scenas as Record<string, unknown>[])[0].tilemap).toEqual([
      0, 0, 0, 0,
      0, 6, 7, 0,
      0, 10, 11, 0
    ]);
    expect(next.scena).toMatchObject({
      id: "room-overworld",
      tilemap: [0, 0, 0, 0, 0, 6, 7, 0, 0, 10, 11, 0]
    });
  });

  it("fills only the contiguous tile region selected by the fill tool", () => {
    const project = {
      scena: { id: "room-overworld", name: "overworld", width: 4, height: 3, tilemap: [1, 1, 2, 2, 1, 2, 2, 3, 4, 4, 3, 3] },
      scenas: [{ id: "room-overworld", name: "overworld", width: 4, height: 3, tilemap: [1, 1, 2, 2, 1, 2, 2, 3, 4, 4, 3, 3] }]
    };

    const next = applyRoomTileBrushInProject(project, "room-overworld", {
      tool: "fill",
      cellIndex: 2,
      tileID: 7
    });

    expect((next.scenas as Record<string, unknown>[])[0].tilemap).toEqual([1, 1, 7, 7, 1, 7, 7, 3, 4, 4, 3, 3]);
    expect(next.scena).toMatchObject({ id: "room-overworld", name: "overworld", width: 4, height: 3, tilemap: [1, 1, 7, 7, 1, 7, 7, 3, 4, 4, 3, 3] });
  });

  it("ignores tile tools outside the room range", () => {
    const project = {
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, tilemap: [1] }]
    };

    expect(applyRoomTileBrushInProject(project, "room-overworld", { tool: "brush", cellIndex: 4, tileID: 7 })).toBe(project);
    expect(applyRoomTileBrushInProject(project, "missing-room", { tool: "fill", cellIndex: 0, tileID: 7 })).toBe(project);
  });

  it("paints tiles on the selected scene layer and composes the export tilemap", () => {
    const project = {
      editorState: { activeTileLayerMapping: "BG3" },
      scena: { id: "room-overworld", name: "overworld", width: 2, height: 2, sceneType: "topdown", tilemap: [0, 0, 0, 0] },
      scenas: [{ id: "room-overworld", name: "overworld", width: 2, height: 2, sceneType: "topdown", tilemap: [0, 0, 0, 0] }]
    };

    const bg3Painted = applyRoomTileBrushInProject(project, "room-overworld", {
      tool: "brush",
      cellIndex: 0,
      tileID: 3
    });
    const roomAfterBg3 = (bg3Painted.scenas as Record<string, unknown>[])[0];
    expect(roomAfterBg3.tilemap).toEqual([3, 0, 0, 0]);

    const bg2Project = setActiveTileLayerMappingInProject(bg3Painted, "BG2");
    const bg2Painted = applyRoomTileBrushInProject(bg2Project, "room-overworld", {
      tool: "brush",
      cellIndex: 1,
      tileID: 9
    });
    const roomAfterBoth = (bg2Painted.scenas as Record<string, unknown>[])[0];
    expect(roomAfterBoth.tilemap).toEqual([3, 9, 0, 0]);

    const presentation = deriveRoomsWorkspacePresentation(bg2Painted);
    expect(presentation.rooms[0]?.paintedTileCount).toBe(2);
    expect(presentation.rooms[0]?.layeredPaintingEnabled).toBe(true);
    expect(presentation.rooms[0]?.activeTileLayerMapping).toBe("BG2");
    expect(presentation.rooms[0]?.activeLayerTileCells).toEqual([0, 9, 0, 0]);
    expect(presentation.rooms[0]?.tileCells).toEqual([3, 9, 0, 0]);
  });

  it("applies a multi-tile brush to the active scene layer", () => {
    const project = {
      editorState: { activeTileLayerMapping: "BG2" },
      scena: { id: "room-overworld", name: "overworld", width: 3, height: 2, sceneType: "topdown", tilemap: [0, 0, 0, 0, 0, 0] },
      scenas: [{ id: "room-overworld", name: "overworld", width: 3, height: 2, sceneType: "topdown", tilemap: [0, 0, 0, 0, 0, 0] }]
    };

    const next = applyRoomTileBrushInProject(project, "room-overworld", {
      cellIndex: 1,
      stamp: { height: 2, tileIDs: [3, 4, 7, 8], width: 2 },
      tileID: 3,
      tool: "brush"
    });
    const room = (next.scenas as Record<string, unknown>[])[0];

    expect(room.tilemap).toEqual([0, 3, 4, 0, 7, 8]);
    expect((room.tileLayers as Array<Record<string, unknown>>).find((layer) => layer.mapping === "BG2")?.tilemap)
      .toEqual([-1, 3, 4, -1, 7, 8]);
  });

  it("exposes active layer tile cells separately from the composed tilemap", () => {
    const project = {
      editorState: { activeTileLayerMapping: "BG2" },
      scenas: [{
        id: "room-overworld",
        name: "overworld",
        width: 2,
        height: 2,
        sceneType: "topdown",
        tilemap: [3, 9, 0, 0],
        tileLayers: [
          { mapping: "BG3", tilemap: [3, -1, -1, -1], tileSourceAssetNames: [] },
          { mapping: "BG2", tilemap: [-1, 9, -1, -1], tileSourceAssetNames: [] },
          { mapping: "BG1", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] },
          { mapping: "BG0", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] }
        ]
      }]
    };

    const presentation = deriveRoomsWorkspacePresentation(project);
    expect(presentation.rooms[0]?.tileCells).toEqual([3, 9, 0, 0]);
    expect(presentation.rooms[0]?.activeLayerTileCells).toEqual([0, 9, 0, 0]);
  });

  it("reflects the active tile layer in the paint tool panel", () => {
    const room: RoomsWorkspaceRoom = {
      id: "room-overworld",
      name: "overworld",
      width: 4,
      height: 4,
      gbaResolution: "32 x 32",
      music: null,
      cameraMode: "Fixed",
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
      cameraBoundsEditable: false,
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      sceneType: "topdown",
      playerActorName: null,
      background: "tileset.png",
      backgroundSource: "Assets/tileset.png",
      backgroundBundledDefaultAsset: null,
      backgroundTileHeight: 8,
      backgroundTileOffsetX: 0,
      backgroundTileOffsetY: 0,
      backgroundTileWidth: 8,
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: false,
      tileCount: 16,
      tileCells: Array.from({ length: 16 }, () => 0),
      activeLayerTileCells: Array.from({ length: 16 }, () => 0),
      collisionCount: 0,
      collisionCells: Array.from({ length: 16 }, () => false),
      referenceImageCount: 0,
      layeredPaintingEnabled: true,
      activeTileLayerMapping: "BG3",
      paintedTileCount: 0,
      isActive: true,
      isStart: true,
      warnings: []
    };

    expect(deriveRoomEditorToolPanel(room, [], {
      mode: "paint",
      selectedPaintTool: "brush",
      selectedTileID: 2
    }).metrics?.[0]).toEqual({ label: "Camada", value: "BG3" });
  });

  it("derives paint mode labels from the selected tool", () => {
    const room: RoomsWorkspaceRoom = {
      id: "room-overworld",
      name: "overworld",
      width: 4,
      height: 4,
      gbaResolution: "32 x 32",
      music: null,
      cameraMode: "Fixed",
      cameraZoom: 100,
      cameraBounds: { x: 0, y: 0, width: 30, height: 20 },
      cameraBoundsEditable: false,
      parallax: { mode: "disabled", offsetX: 0, offsetY: 0, speedX: 256, speedY: 256 },
      sceneType: "topdown",
      playerActorName: null,
      background: "tileset.png",
      backgroundSource: "Assets/tileset.png",
      backgroundBundledDefaultAsset: null,
      backgroundTileHeight: 8,
      backgroundTileOffsetX: 0,
      backgroundTileOffsetY: 0,
      backgroundTileWidth: 8,
      backgroundRenderMode: "tilemap",
      gbStudioUseBackgroundLayout: false,
      tileCount: 16,
      tileCells: Array.from({ length: 16 }, () => 0),
      activeLayerTileCells: Array.from({ length: 16 }, () => 0),
      collisionCount: 0,
      collisionCells: Array.from({ length: 16 }, () => false),
      referenceImageCount: 0,
      layeredPaintingEnabled: true,
      activeTileLayerMapping: "BG2",
      paintedTileCount: 0,
      isActive: true,
      isStart: true,
      warnings: []
    };
    const baseOptions = {
      activeTileLayerMapping: "BG2" as const,
      imageSize: { width: 64, height: 64 },
      layeredPaintingEnabled: true,
      paintedTileCount: 0,
      selectedTileID: 1,
      videoModeId: 0,
      videoModeLabel: "Modo 0 — 4 tilemaps estaticos"
    };

    expect(deriveRoomPaintInspectorPresentation(room, {
      ...baseOptions,
      selectedTool: "eraser"
    }).modeLabel).toBe("Borracha");
    expect(deriveRoomPaintInspectorPresentation(room, {
      ...baseOptions,
      selectedTool: "fill"
    }).modeLabel).toBe("Preencher");
  });

  it("applies fill and eraser tools on layered tilemaps", () => {
    const project = {
      editorState: { activeTileLayerMapping: "BG2" },
      scenas: [{
        id: "room-overworld",
        name: "overworld",
        width: 2,
        height: 2,
        sceneType: "topdown",
        tilemap: [1, 1, 1, 1],
        tileLayers: [
          { mapping: "BG3", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] },
          { mapping: "BG2", tilemap: [1, 1, 1, 1], tileSourceAssetNames: [] },
          { mapping: "BG1", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] },
          { mapping: "BG0", tilemap: [-1, -1, -1, -1], tileSourceAssetNames: [] }
        ]
      }]
    };

    const filled = applyRoomTileBrushInProject(project, "room-overworld", {
      tool: "fill",
      cellIndex: 0,
      tileID: 7,
      layerMapping: "BG2"
    });
    expect((filled.scenas as Record<string, unknown>[])[0].tilemap).toEqual([7, 7, 7, 7]);

    const erased = applyRoomTileBrushInProject(filled, "room-overworld", {
      tool: "eraser",
      cellIndex: 2,
      tileID: 0,
      layerMapping: "BG2"
    });
    expect((erased.scenas as Record<string, unknown>[])[0].tilemap).toEqual([7, 7, 0, 7]);
  });

  it("derives rooms validation issues, summary cards and editor context", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      scenas: [
        { name: "overworld", width: 4, height: 4, sceneType: "topdown", tilemap: [1, 0, 0, 0] },
        { name: "shop", width: 4, height: 4, sceneType: "pointAndClick", tilemap: [] }
      ],
      editorState: {
        scenaConnections: [{ from: "overworld", to: "missing_room", eventName: "door_enter" }]
      },
      settings: { general: { startScene: "overworld" } }
    } satisfies GBAProjectData);

    const activeRoom = presentation.rooms[0] ?? null;
    expect(deriveRoomsEditorContext(activeRoom)).toMatchObject({
      roomName: "overworld",
      sceneType: "topdown",
      dimensions: "4 x 4"
    });

    const issues = deriveRoomsWorkspaceValidationIssues(presentation);
    expect(issues.some((issue) => issue.severity === "error" && issue.message.includes("missing_room"))).toBe(true);

    const cards = deriveRoomsWorkspaceSummaryCards(presentation);
    expect(cards.map((card) => card.id)).toEqual(["rooms", "tiles", "connections", "warnings"]);
    expect(cards.find((card) => card.id === "tiles")?.value).toBe(1);
  });
});

describe("scene map beside anchor", () => {
  function sceneMapCardRect(
    room: { width: number; height: number },
    position: { x: number; y: number }
  ) {
    const size = sceneMapCardSize(room);
    return { x: position.x, y: position.y, width: size.width, height: size.height };
  }

  it("creates room beside anchor without overlap", () => {
    const project = {
      scenas: [{ id: "room-1", name: "overworld", width: 30, height: 20 }],
      editorState: { sceneMapPositions: { overworld: { x: 36, y: 36 } } }
    };

    const next = createRoomInProject(project, {
      id: "room-2",
      name: "shop",
      width: 30,
      height: 20,
      sceneType: "topdown",
      anchorRoomID: "room-1"
    });

    const positions = sceneMapPositions(next);
    const anchorRect = sceneMapCardRect({ width: 30, height: 20 }, positions.overworld);
    const newRect = sceneMapCardRect({ width: 30, height: 20 }, positions.shop);
    const preferred = preferredSceneMapPositionBeside({ width: 30, height: 20 }, positions.overworld);

    expect(positions.shop.x).toBeGreaterThanOrEqual(preferred.x);
    expect(positions.shop.y).toBe(positions.overworld.y);
    expect(rectsOverlap(anchorRect, newRect)).toBe(false);
  });

  it("creates room beside anchor when space immediately to the right is occupied", () => {
    const project = {
      scenas: [
        { id: "room-1", name: "overworld", width: 30, height: 20 },
        { id: "room-2", name: "shop", width: 30, height: 20 }
      ],
      editorState: {
        sceneMapPositions: {
          overworld: { x: 36, y: 36 },
          shop: { x: 324, y: 36 }
        }
      }
    };

    const next = createRoomInProject(project, {
      id: "room-3",
      name: "market",
      width: 30,
      height: 20,
      sceneType: "topdown",
      anchorRoomID: "room-1"
    });

    const positions = sceneMapPositions(next);
    const rects = [
      sceneMapCardRect({ width: 30, height: 20 }, positions.overworld),
      sceneMapCardRect({ width: 30, height: 20 }, positions.shop),
      sceneMapCardRect({ width: 30, height: 20 }, positions.market)
    ];

    expect(rectsOverlap(rects[0]!, rects[2]!)).toBe(false);
    expect(rectsOverlap(rects[1]!, rects[2]!)).toBe(false);
    expect(positions.market.y).toBe(positions.overworld.y);
    expect(positions.market.x).toBeGreaterThan(positions.overworld.x + sceneMapCardSize({ width: 30, height: 20 }).width + SCENE_MAP_HORIZONTAL_GAP - 1);
  });

  it("duplicates room beside source when space immediately to the right is occupied", () => {
    const project = {
      scenas: [
        { id: "room-1", name: "overworld", width: 30, height: 20 },
        { id: "room-2", name: "shop", width: 30, height: 20 }
      ],
      editorState: {
        sceneMapPositions: {
          overworld: { x: 36, y: 36 },
          shop: { x: 324, y: 36 }
        }
      }
    };

    const next = duplicateRoomInProject(project, {
      sourceRoomID: "room-1",
      newRoomID: "room-3",
      newName: "overworld_copy"
    });

    const positions = sceneMapPositions(next);
    const rects = [
      sceneMapCardRect({ width: 30, height: 20 }, positions.overworld),
      sceneMapCardRect({ width: 30, height: 20 }, positions.shop),
      sceneMapCardRect({ width: 30, height: 20 }, positions.overworld_copy)
    ];

    expect(rectsOverlap(rects[0]!, rects[2]!)).toBe(false);
    expect(rectsOverlap(rects[1]!, rects[2]!)).toBe(false);
    expect(positions.overworld_copy.y).toBe(positions.overworld.y);
    expect(positions.overworld_copy.x).toBeGreaterThan(
      positions.overworld.x + sceneMapCardSize({ width: 30, height: 20 }).width + SCENE_MAP_HORIZONTAL_GAP - 1
    );
  });

  it("creates room connection when anchor room is provided through createRoomConnectionInProject", () => {
    const project = {
      scenas: [{ id: "room-1", name: "overworld", width: 30, height: 20 }],
      editorState: { sceneMapPositions: { overworld: { x: 36, y: 36 } } }
    };

    const withRoom = createRoomInProject(project, {
      id: "room-2",
      name: "shop",
      width: 30,
      height: 20,
      sceneType: "topdown",
      anchorRoomID: "room-1"
    });
    const withConnection = createRoomConnectionInProject(withRoom, {
      from: "overworld",
      to: "shop",
      eventName: ""
    });

    expect(withConnection.editorState).toEqual({
      sceneMapPositions: expect.objectContaining({
        overworld: { x: 36, y: 36 },
        shop: expect.objectContaining({ x: expect.any(Number), y: 36 })
      }),
      scenaConnections: [{
        from: "overworld",
        to: "shop",
        exit: { x: 29, y: 10, width: 1, height: 1 },
        entry: { x: 0, y: 10, width: 1, height: 1 }
      }]
    });
  });

  it("rejects creating a room with a duplicate name", () => {
    const project = createBlankProjectData({ name: "Blank" });
    const next = createRoomInProject(project, {
      id: "room-2",
      name: "cena_1",
      width: 30,
      height: 20,
      sceneType: "topdown"
    });

    expect(next).toBe(project);
  });

  it("creates a second room beside cena_1 in a blank project", () => {
    const project = createBlankProjectData({ name: "Blank" });
    const next = createRoomInProject(project, {
      id: "room-2",
      name: "room_2",
      width: 30,
      height: 20,
      sceneType: "topdown",
      anchorRoomID: "room-1"
    });
    const presentation = deriveRoomsWorkspacePresentation(next);

    expect(presentation.rooms).toHaveLength(2);
    expect(presentation.summary.roomCount).toBe(2);
    expect(presentation.sceneMapPositions.room_2).toEqual({ x: 324, y: 36 });
    expect(deriveRoomsWorkspacePresentation(next).rooms.map((room) => room.name)).toEqual(["cena_1", "room_2"]);
  });

  it("persists and presents a discriminated runtime config for platformer rooms", () => {
    const project = createRoomInProject(createBlankProjectData({ name: "Platform Profiles" }), {
      id: "room-platformer",
      name: "climb",
      width: 24,
      height: 18,
      sceneType: "platformer",
      anchorRoomID: "room-1"
    });
    const createdRoom = (project.scenas as Record<string, unknown>[]).find((room) => room.id === "room-platformer");
    expect(createdRoom?.runtime).toEqual({ type: "platformer", config: {} });

    const next = updateRoomFieldsInProject(project, "room-platformer", {
      runtime: {
        type: "platformer",
        config: { gravity: 0.75, jumpSpeed: 6, ladders: false }
      }
    });
    const room = deriveRoomsWorkspacePresentation(next).rooms.find((candidate) => candidate.id === "room-platformer");

    expect(room?.runtime).toMatchObject({
      type: "platformer",
      config: { gravity: 0.75, jumpSpeed: 6, ladders: false }
    });
  });

  it("keeps a sprite visible when its asset uses direct source fields and the actor has no animation selected", () => {
    const presentation = deriveRoomsWorkspacePresentation({
      project: { name: "Direct sprite" },
      scena: { name: "iso", width: 8, height: 8, sceneType: "isometric" },
      rooms: [{ name: "iso", width: 8, height: 8, sceneType: "isometric" }],
      assets: [{
        name: "hero.png",
        kind: "Sprite",
        source: "Assets/sprites/hero.png",
        bundledDefaultAsset: "topdown-player-4dir"
      }],
      actors: [{ id: "hero", name: "Hero", roomName: "iso", x: 2, y: 3, spriteSheet: "hero.png" }],
      animations: []
    });

    expect(presentation.entities[0]).toEqual(expect.objectContaining({
      spriteSource: "Assets/sprites/hero.png",
      spriteBundledDefaultAsset: "topdown-player-4dir",
      spriteSheet: "hero.png"
    }));
  });

  it("projects isometric room tiles with cartesian-to-isometric coordinates and x+y depth", () => {
    expect(isometricRoomTilePlacement(4, 4, 0, 0)).toEqual({
      heightPercent: 25,
      leftPercent: 37.5,
      topPercent: 0,
      widthPercent: 25,
      depth: 0
    });
    expect(isometricRoomTilePlacement(4, 4, 2, 1)).toEqual({
      heightPercent: 25,
      leftPercent: 50,
      topPercent: 37.5,
      widthPercent: 25,
      depth: 3
    });
  });

  it("reserves the atlas slot height when projecting isometric tiles", () => {
    expect(isometricRoomTilePlacement(4, 4, 0, 0, undefined, 32)).toEqual({
      depth: 0,
      heightPercent: 20,
      leftPercent: 37.5,
      topPercent: 0,
      widthPercent: 25
    });
    expect(isometricRoomTilePlacement(4, 4, 2, 1, undefined, 32)).toEqual({
      depth: 3,
      heightPercent: 20,
      leftPercent: 50,
      topPercent: 30,
      widthPercent: 25
    });
  });

  it("escala a grade isométrica para a superfície autoral estática", () => {
    expect(isometricRoomTilePlacement(12, 8, 0, 0, undefined, undefined, { height: 320, width: 480 })).toEqual({
      depth: 0,
      heightPercent: 5,
      leftPercent: 21.666666666666668,
      topPercent: 5,
      widthPercent: 6.666666666666667
    });
  });

  it("keeps a newly opened room editable for painting, collision, actors and triggers", () => {
    const project = createBlankProjectData({ name: "Blank" });
    const withSecondRoom = createRoomInProject(project, {
      id: "room-2",
      name: "room_2",
      width: 30,
      height: 20,
      sceneType: "topdown",
      anchorRoomID: "room-1"
    });
    const withActiveRoom = setActiveRoomInProject(withSecondRoom, "room-2");
    const activeRoom = deriveRoomsWorkspacePresentation(withActiveRoom).rooms.find((room) => room.isActive);

    expect(activeRoom).toMatchObject({ id: "room-2", name: "room_2" });

    const painted = setRoomTileCellInProject(withActiveRoom, activeRoom!.id, 3, 7);
    const withCollision = setRoomCollisionCellInProject(painted, activeRoom!.id, 4, true);
    const withActor = createActorInProject(withCollision, {
      id: "actor-room-2",
      name: "Actor da Room 2",
      roomID: activeRoom!.id,
      x: 5,
      y: 6
    });
    const withTrigger = createTriggerInProject(withActor, {
      id: "trigger-room-2",
      name: "Gatilho da Room 2",
      roomID: activeRoom!.id,
      x: 7,
      y: 8,
      width: 2,
      height: 1
    });

    const presentation = deriveRoomsWorkspacePresentation(withTrigger);
    const room1 = presentation.rooms.find((room) => room.id === "room-1");
    const room2 = presentation.rooms.find((room) => room.id === "room-2");

    expect(room1?.tileCells[3]).toBe(0);
    expect(room1?.collisionCells[4]).toBe(false);
    expect(room2?.tileCells[3]).toBe(7);
    expect(room2?.collisionCells[4]).toBe(true);
    expect(presentation.entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "actor-room-2", roomName: "room_2", isInActiveRoom: true }),
      expect.objectContaining({ id: "trigger-room-2", roomName: "room_2", isInActiveRoom: true })
    ]));
  });
});


describe("Isometric authoring modes and actor support", () => {
  function elevatedProject() {
    const project = createBlankProjectData({name: "Piso elevado"});
    const room = (project.scenas as Record<string, unknown>[])[0]!;
    Object.assign(room, {sceneType: "isometric", width: 6, height: 6,
      runtime: {type: "isometric", config: {...DEFAULT_ISOMETRIC_SCENE_CONFIG}},
      heightLevels: Array(36).fill(0)});
    (room.heightLevels as number[])[8] = 3;
    project.actors = [{id: "support", name: "Support", roomName: String(room.name), x: 1, y: 1, z: 0, spriteSheet: "unit.png"}];
    return {project, room};
  }

  it("selects adventure and tactical modes without losing authored geometry", () => {
    const {project, room} = elevatedProject();
    const tactical = updateRoomFieldsInProject(project, String(room.id), {sceneType: "isometricTactical"});
    const scene = (tactical.scenas as Record<string, any>[])[0]!;
    expect(scene).toMatchObject({sceneType: "isometric", heightLevels: room.heightLevels,
      runtime: {type: "isometric", config: {gameplayMode: "tactical", movement: "tile", originX: 120}}});
    expect(scene.runtime.config.tactical.units).toHaveLength(2);
    expect(scene.playerActorName).toBe("Support");
    expect((tactical.actors as Record<string, unknown>[])[0]).toMatchObject({id: "support", x: 1, y: 1, z: 0});
    expect((tactical.actors as Record<string, unknown>[])[1]).toMatchObject({name: "Enemy"});
    const adventure = updateRoomFieldsInProject(tactical, String(room.id), {sceneType: "isometricAdventure"});
    expect((adventure.scenas as Record<string, unknown>[])[0]).toMatchObject({sceneType: "isometric",
      runtime: {type: "isometric", config: {gameplayMode: "adventure", movement: "free"}}});
    expect((project.scenas as Record<string, unknown>[])[0]).toEqual(room);
  });

  it("resizes the logical grid without shifting heights or painted tiles", () => {
    const {project, room} = elevatedProject();
    room.tilemap = Array(36).fill(0);
    (room.tilemap as number[])[8] = 7;
    room.tileLayers = [{mapping: "BG2", tilemap: room.tilemap}];
    const next = updateRoomFieldsInProject(project, String(room.id), {width: 8, height: 4});
    const scene = (next.scenas as Record<string, any>[])[0]!;
    expect(scene).toMatchObject({width: 8, height: 4});
    expect(scene.heightLevels).toHaveLength(32);
    expect(scene.heightLevels[10]).toBe(3);
    expect(scene.heightLevels[8]).toBe(0);
    expect(scene.tilemap[10]).toBe(7);
    expect(scene.tileLayers[0].tilemap[10]).toBe(7);
  });

  it("creates both isometric presets with logical sizes and a playable tactical pair", () => {
    const base = createBlankProjectData({name: "Dois tipos"});
    for (const presetID of ["isometricAdventure", "isometricTactical"] as const) {
      const next = createRoomInProject(base, {id: presetID, name: presetID, width: 30, height: 20,
        sceneType: "isometric", presetID});
      const scene = (next.scenas as Record<string, any>[]).at(-1)!;
      expect(scene.sceneType).toBe("isometric");
      expect(scene.width).toBe(presetID === "isometricAdventure" ? 36 : 6);
      expect(scene.height).toBe(presetID === "isometricAdventure" ? 36 : 6);
      expect(scene.runtime.config.gameplayMode).toBe(presetID === "isometricAdventure" ? "adventure" : "tactical");
      const actors = (next.actors as Record<string, unknown>[]).filter(actor => actor.roomName === presetID);
      expect(actors).toHaveLength(presetID === "isometricAdventure" ? 1 : 2);
      if (presetID === "isometricTactical") expect(scene.runtime.config.tactical.units.map((unit: {team: string}) => unit.team)).toEqual(["player", "enemy"]);
    }
  });

  it("keeps an authored composition in its supported gameplay mode", () => {
    const {project, room} = elevatedProject();
    room.runtime = {type: "isometric", config: {...DEFAULT_ISOMETRIC_SCENE_CONFIG,
      pagedSurface: {backgroundAsset: "floor.png", foregroundAsset: "front.png", width: 512, height: 344}}};
    expect(updateRoomFieldsInProject(project, String(room.id), {sceneType: "isometricTactical"})).toBe(project);
  });

  it("places the controlled actor inside a small logical grid", () => {
    const next = createRoomInProject(createBlankProjectData({name: "Mapa pequeno"}), {
      id: "small", name: "small", width: 1, height: 1, sceneType: "isometricAdventure"
    });
    expect((next.actors as Record<string, unknown>[]).find(actor => actor.roomName === "small")).toMatchObject({x: 0, y: 0, z: 0});
  });

  it("reuses approved composition and full character animations in an empty project", () => {
    const next = createRoomInProject(createBlankProjectData({name: "Vazio", includeStarterContent: false}), {
      id: "iso", name: "iso", width: 6, height: 6, sceneType: "isometric", presetID: "isometricTactical"
    });
    const actor = (next.actors as Record<string, unknown>[])[0]!;
    expect(next.assets).toEqual(expect.arrayContaining([expect.objectContaining({name: actor.spriteSheet,
      metadata: expect.objectContaining({bundledDefaultAsset: "template:exemplo-gba/Assets/sprites/tactical-nara-v5.png"})})]));
    expect(next.animations).toEqual(expect.arrayContaining([expect.objectContaining({spriteSheet: actor.spriteSheet, name: actor.animationName})]));
    const room = (next.scenas as Record<string, any>[]).at(-1)!;
    expect(room.runtime.config).toMatchObject({worldMode: "static_composition", originX: 120, originY: 40});
    expect(room.runtime.config.tacticalPresentation.units[0].actorId).toBe(actor.id);
    expect(room.runtime.config.tacticalPresentation.surfacePages[0].asset).toBe("tactical-v5-surface.png");
    expect((next.actors as Record<string, unknown>[])[1]).toMatchObject({x: 4, y: 1, z: 1});
  });

  it("snaps an actor to the supporting height when placing it and moving back to ground", () => {
    const {project, room} = elevatedProject();
    const raised = placeRoomEntityInRoomInProject(project, "actor", "support", {roomID: String(room.id), x: 2, y: 1});
    expect((raised.actors as Record<string, unknown>[])[0]).toMatchObject({x: 2, y: 1, z: 3});
    const lowered = placeRoomEntityInRoomInProject(raised, "actor", "support", {roomID: String(room.id), x: 1, y: 1});
    expect((lowered.actors as Record<string, unknown>[])[0]).toMatchObject({x: 1, y: 1, z: 0});
    expect((project.actors as Record<string, unknown>[])[0]).toMatchObject({x: 1, y: 1, z: 0});
  });

  it("keeps inspector edits and keyboard nudges on the authored floor", () => {
    const {project, room} = elevatedProject();
    const edited = updateRoomEntityInProject(project, "actor", "support", {x: 2});
    expect((edited.actors as Record<string, unknown>[])[0]).toMatchObject({x: 2, y: 1, z: 3});
    const nudged = nudgeRoomEntitiesInProject(project, {roomID: String(room.id), selectedKeys: ["actor:support"], deltaX: 1, deltaY: 0});
    expect((nudged.actors as Record<string, unknown>[])[0]).toMatchObject({x: 2, y: 1, z: 3});
  });

  it("raises and lowers a standing actor with the height brush", () => {
    const {project, room} = elevatedProject();
    const raised = setRoomHeightLevelInProject(project, String(room.id), 7, 2);
    expect((raised.actors as Record<string, unknown>[])[0]).toMatchObject({x: 1, y: 1, z: 2});
    expect((setRoomHeightLevelInProject(raised, String(room.id), 7, 0).actors as Record<string, unknown>[])[0]).toMatchObject({z: 0});
  });

  it("creates new actors at the support height", () => {
    const {project, room} = elevatedProject();
    const next = createActorInProject(project, {roomID: String(room.id), id: "new", x: 2, y: 1, spriteSheet: "unit.png"});
    expect((next.actors as Record<string, unknown>[]).at(-1)).toMatchObject({x: 2, y: 1, z: 3});
  });

  it("keeps group alignment and distribution on the new support cells", () => {
    const {project, room} = elevatedProject();
    project.actors = [
      {id: "first", roomName: String(room.name), x: 2, y: 1, z: 3},
      {id: "middle", roomName: String(room.name), x: 1, y: 1, z: 0},
      {id: "last", roomName: String(room.name), x: 3, y: 1, z: 0}
    ];
    const aligned = alignRoomEntitiesInProject(project, {roomID: String(room.id), selectedKeys: ["actor:first", "actor:middle"], axis: "x"});
    expect((aligned.actors as Record<string, unknown>[])[1]).toMatchObject({x: 2, y: 1, z: 3});
    (project.actors as Record<string, unknown>[])[0] = {...(project.actors as Record<string, unknown>[])[0], x: 1, z: 0};
    const distributed = distributeRoomEntitiesInProject(project, {roomID: String(room.id), selectedKeys: ["actor:first", "actor:middle", "actor:last"], axis: "x"});
    expect((distributed.actors as Record<string, unknown>[])[1]).toMatchObject({x: 2, y: 1, z: 3});
  });
});
