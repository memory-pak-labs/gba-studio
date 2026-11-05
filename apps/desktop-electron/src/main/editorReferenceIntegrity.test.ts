import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { removeRoomEntitiesInProject, renameRoomInProject } from "../shared/roomsWorkspace.js";
import { renameAudioItemInProject, removeAudioItemFromProject } from "../shared/audioWorkspace.js";
import { projectReferenceDeletionGuard } from "../shared/projectReferenceUsages.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

const example = buildProjectFromTemplate("exemplo-gba", { name: "Edição do exemplo" });
const scenes = example.scenas as Array<{ id: string; name: string }>;
const sceneID = (name: string) => scenes.find(scene => scene.name === name)!.id;

describe("scene rename in the example project", () => {
  it.each([
    ["arena_arrancada", "Arena de revanche"],
    ["inventario_ferramentas", "Inventário de ferramentas"]
  ])("keeps references to %s valid when it is renamed", (oldName, newName) => {
    const next = renameRoomInProject(example, sceneID(oldName), newName);
    expect(next.scenas).toContainEqual(expect.objectContaining({ id: sceneID(oldName), name: newName }));
    expect(() => buildEngineExportProjectContract(next)).not.toThrow();
  });

  it("rejects an existing name, including a different spelling by case", () => {
    expect(renameRoomInProject(example, sceneID("abertura"), "TITULO")).toBe(example);
  });
});

describe("referenced resources in the example project", () => {
  it.each(["coast_audio_mute", "logo_concluir"])("guards the procedure or scene binding %s", (name) => {
    const event = (example.events as Array<{ id: string; name: string }>).find(item => item.name === name)!;
    expect(projectReferenceDeletionGuard(example, { kind: "event", name, id: event.id }).canDelete).toBe(false);
  });

  it.each([["porto_lumen", "port-mechanic"], ["farol_interior", "farol-relay"]])(
    "protects a referenced actor in %s", (name, actorID) => {
      const result = removeRoomEntitiesInProject(example, { roomID: sceneID(name), selectedKeys: [`actor:${actorID}`] });
      expect(result).toBe(example);
    }
  );

  it("updates menu screen sounds and preserves the physical source of renamed audio", () => {
    const name = "menu-navegar-v1.wav";
    const item = (example.audioItems as Array<{ id: string; name: string }>).find(item => item.name === name)!;
    expect(projectReferenceDeletionGuard(example, { kind: "audio", name, id: item.id }).canDelete).toBe(false);
    const renamed = renameAudioItemInProject(example, item.id, "Som de navegação");
    const contract = buildEngineExportProjectContract(renamed);
    expect(contract.menu_project?.screens.find(screen => screen.name === "title_options")?.audio_feedback?.navigate?.pcm).toBeGreaterThanOrEqual(0);
    const cleared = buildEngineExportProjectContract(removeAudioItemFromProject(example, item.id));
    expect(cleared.menu_project?.screens.find(screen => screen.name === "title_options")?.audio_feedback?.navigate?.pcm).toBeUndefined();
  });
});
