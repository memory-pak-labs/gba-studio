import { describe, expect, it } from "vitest";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { deriveProjectHealthReport } from "./projectHealth.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject, type GBAProjectData } from "./projectFile.js";
import { createRoomInProject, deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import { SCENE_TYPE_OPTIONS } from "./sceneTypes.js";

const records = (data: GBAProjectData, key: string) => data[key] as Record<string, any>[];
const reopen = (data: GBAProjectData) => parseGBAProjectFile(serializeGBAProjectFile({ data, summary: summarizeGBAProject(data) })).data;

describe("project without starter assets", () => {
  it("saves and reopens with just the project settings and editor state", () => {
    const data = reopen(buildProjectFromTemplate("empty", { name: "  Do zero  " }));
    expect(data.name).toBe("Do zero");
    for (const key of ["rooms", "scenas", "actors", "assets", "assetGroups", "animations", "animationStates", "triggers", "events", "dialogues", "audioItems"]) {
      expect(data[key], key).toEqual([]);
    }
    expect(data.scena).toBeUndefined();
    expect(data.room).toBeUndefined();
    expect(data.editorState).not.toHaveProperty("activeScenaID");
    expect(data.editorState).not.toHaveProperty("startScenaID");
    expect(data.settings).toMatchObject({
      general: { gameTitle: "Do zero", startScene: "", startPlayer: "" },
      build: { romFileName: "do_zero.gba" },
      sceneTypes: { enabled: Object.fromEntries(SCENE_TYPE_OPTIONS.map(({ id }) => [id, true])) },
      topdown: { playerSprite: "" },
      pointAndClick: { cursorImage: "", font: "" },
      uiDialogs: { boxImage: "", font: "", selectorImage: "" }
    });
    expect(data.settings).not.toHaveProperty("hudPresets");
    expect(validateGBAProjectMigrationContract(data)).toEqual([]);
    expect(deriveProjectHealthReport(data)).toMatchObject({ counts: { error: 0, warning: 0 }, exportReady: false });
  });

  it.each(["exterior", "isometricAdventure", "isometricTactical"] as const)(
    "creates a first %s scene without importing sample content",
    (presetID) => {
      const empty = reopen(buildProjectFromTemplate("empty", { name: "Do zero" }));
      const data = reopen(createRoomInProject(empty, {
        id: "first", name: "Minha cena", sceneType: "topdown", presetID, width: 30, height: 20
      }));
      expect(deriveRoomsWorkspacePresentation(data).rooms).toHaveLength(1);
      expect(data.scena).toMatchObject({ id: "first", name: "Minha cena" });
      expect(data.settings).toMatchObject({ general: { startScene: "Minha cena", startPlayer: "" } });
      expect(data.assets).toEqual([]);
      expect(data.actors).toEqual([]);
    }
  );
});

describe("basic template with starter assets", () => {
  it("saves and reopens without authored content or stale scene selections", () => {
    const data = reopen(buildProjectFromTemplate("blank", { name: "  Meu jogo  " }));
    expect(data.name).toBe("Meu jogo");
    for (const key of ["scenas", "rooms", "actors", "triggers", "events", "dialogues", "audioItems"]) {
      expect(data[key], key).toEqual([]);
    }
    expect(data.scena).toBeUndefined();
    expect(data.room).toBeUndefined();
    expect(data.settings).toMatchObject({ general: { startScene: "", startPlayer: "" } });
    const editor = data.editorState as Record<string, unknown>;
    for (const key of ["activeScenaID", "activeScenaName", "startScenaID"]) expect(editor[key]).toBeFalsy();
    expect(editor.scenaConnections).toEqual([]);
    expect(validateGBAProjectMigrationContract(data)).toEqual([]);
    expect(deriveRoomsWorkspacePresentation(data).rooms).toEqual([]);
  });

  it("keeps the reusable authoring library and every scene type available", () => {
    const data = reopen(buildProjectFromTemplate("blank", { name: "Capacidades" }));
    expect(records(data, "assets").length).toBeGreaterThan(0);
    expect(records(data, "assets").every(asset => asset.metadata.reusableLibraryAsset
      && asset.metadata.bundledDefaultAsset.startsWith("template:blank/"))).toBe(true);
    expect(records(data, "animations").length).toBeGreaterThan(0);
    expect(records(data, "animationStates").length).toBeGreaterThan(0);
    const settings = data.settings as Record<string, any>;
    for (const { id } of SCENE_TYPE_OPTIONS) expect(settings.sceneTypes.enabled[id], id).toBe(true);
  });

  it("treats an empty project as editable and healthy while export waits for its first scene", () => {
    const data = reopen(buildProjectFromTemplate("blank", { name: "Vazio válido" }));
    const health = deriveProjectHealthReport(data);
    expect(health.counts).toMatchObject({ error: 0, warning: 0 });
    expect(health.exportReady).toBe(false);
  });

  it("creates the first playable scene through the normal editor mutation after reopening", () => {
    const empty = reopen(buildProjectFromTemplate("blank", { name: "Primeira cena" }));
    const created = createRoomInProject(empty, { id: "first", name: "Minha ilha", sceneType: "topdown", width: 30, height: 20 });
    const data = reopen(created);
    expect(records(data, "rooms")).toHaveLength(1);
    expect(records(data, "scenas")).toHaveLength(1);
    expect(records(data, "actors")).toHaveLength(1);
    expect(records(data, "actors")[0]).toMatchObject({ name: "Player", roomName: "Minha ilha", spriteSheet: "neutral-player-topdown.png" });
    expect(data.settings).toMatchObject({ general: { startScene: "Minha ilha", startPlayer: "Player" } });
    expect(data.scena).toMatchObject({ id: "first", name: "Minha ilha" });
    expect(deriveProjectHealthReport(data).counts.error).toBe(0);
    expect(deriveProjectHealthReport(data).exportReady).toBe(true);
    const exported = buildEngineExportProjectContract(data).topdown_project!;
    expect(exported.initial_room).toBe(0);
    expect(exported.rooms).toHaveLength(1);
    expect(exported.rooms[0].name).toBe("Minha ilha");
    expect(records(empty, "rooms")).toEqual([]);
  });

  it("still requires a start scene once a scene exists", () => {
    const empty = buildProjectFromTemplate("blank", { name: "Validação" });
    const data = createRoomInProject(empty, { id: "first", name: "First", sceneType: "topdown", width: 30, height: 20 });
    (data.settings as Record<string, any>).general.startScene = "";
    expect(validateGBAProjectMigrationContract(data)).toEqual(expect.arrayContaining([
      expect.objectContaining({ validator: "settings", issue: expect.objectContaining({ invalidFields: expect.arrayContaining(["startScene"]) }) })
    ]));
    expect(deriveProjectHealthReport(data).exportReady).toBe(false);
  });
});
