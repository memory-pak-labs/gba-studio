import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { audioReplacementChoices, removeAudioItemFromProject } from "../shared/audioWorkspace.js";
import { dialogueReplacementChoices, removeDialogueFromProject } from "../shared/dialoguesWorkspace.js";
import { removeEventFromProject } from "../shared/eventsWorkspace.js";
import { planEventDeletion } from "../shared/eventDeletion.js";
import { planRoomActorDeletion, planRoomRemoval, removeRoomEntitiesInProject, removeRoomFromProject } from "../shared/roomsWorkspace.js";
import { pushProjectHistory, undoProjectHistory } from "../shared/projectHistory.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

const example = buildProjectFromTemplate("exemplo-gba", { name: "Exclusão com vínculos" });
const records = (project: Record<string, unknown>, key: string) => project[key] as Record<string, unknown>[];
const idFor = (key: string, name: string) => String(records(example, key).find(item => item.name === name)?.id);

describe("deleting a referenced item in the Exemplo GBA", () => {
  it("unlinks the opening from the logo and restores both with one undo", () => {
    const id = idFor("scenas", "abertura");
    expect(planRoomRemoval(example, id)?.usages).toContain("Cena: logo · sequência de quadros");
    const next = removeRoomFromProject(example, id, null);
    expect(records(next, "scenas").some(scene => scene.id === id)).toBe(false);
    expect(JSON.stringify(records(next, "events").find(event => event.name === "logo_concluir"))).not.toContain("change_scene abertura");
    expect(() => buildEngineExportProjectContract(next)).not.toThrow();
    expect(undoProjectHistory(pushProjectHistory({ present: example, undoStack: [], redoStack: [] }, next)).present).toBe(example);
  });

  it("retargets menu pagination to an embedded screen ID when replacing a scene", () => {
    const id = idFor("scenas", "inventario_ferramentas");
    const replacement = idFor("scenas", "titulo");
    expect(planRoomRemoval(example, id)?.choices.some(choice => choice.value === replacement)).toBe(true);
    const next = removeRoomFromProject(example, id, replacement);
    expect(next).not.toBe(example);
    expect(() => buildEngineExportProjectContract(next)).not.toThrow();
  });

  it("replaces or unlinks a menu sound through the same authored references", () => {
    const id = idFor("audioItems", "menu-navegar-v1.wav");
    const replacements = audioReplacementChoices(example, id);
    expect(replacements.length).toBeGreaterThan(0);
    const edited = removeAudioItemFromProject(example, id, replacements[0]!.value);
    const unlinked = removeAudioItemFromProject(example, id);
    expect(records(edited, "audioItems").some(item => item.id === id)).toBe(false);
    const menuCue = (data: typeof example) => buildEngineExportProjectContract(data).menu_project?.screens
      .find(screen => screen.name === "title_options")?.audio_feedback?.navigate?.pcm;
    expect(menuCue(edited)).toBeGreaterThanOrEqual(0);
    expect(menuCue(unlinked)).toBeUndefined();
  });

  it("unlinks procedure calls, preserving unrelated steps and the export contract", () => {
    const name = "coast_audio_mute";
    const id = idFor("events", name);
    expect(planEventDeletion(example, id, name).canUnlink).toBe(true);
    const next = removeEventFromProject(example, id, { replacementName: null });
    expect(records(next, "events").some(event => event.id === id)).toBe(false);
    expect(JSON.stringify(next.events)).not.toContain(`call_procedure ${name}`);
    expect(() => buildEngineExportProjectContract(next)).not.toThrow();
  });

  it("rules out incompatible and recursive replacements for a procedure", () => {
    const procedure = (name: string, steps: { command: string }[], parameters: unknown[] = []) =>
      ({ id: name, name, eventKind: "procedure", procedure: { parameters }, steps });
    const data = { events: [
      procedure("old", [{ command: "noop" }]),
      procedure("recursive", [{ command: "call_procedure old" }]),
      procedure("incompatible", [{ command: "noop" }], [{ name: "value", type: "number" }]),
      procedure("compatible", [{ command: "noop" }]),
      { id: "call", name: "call", steps: [{ command: "call_procedure old" }, { command: "wait 8" }] }
    ] };
    expect(planEventDeletion(data, "old", "old").replacements.map(option => option.value)).toEqual(["compatible"]);
    const next = removeEventFromProject(data, "old", { replacementName: "compatible" });
    expect(records(next, "events").find(event => event.name === "call")?.steps).toEqual([
      { command: "call_procedure compatible" }, { command: "wait 8" }
    ]);
  });

  it("unlinks a script reference to an actor without removing other actors", () => {
    const options = { roomID: idFor("scenas", "porto_lumen"), selectedKeys: ["actor:port-mechanic"] };
    const plan = planRoomActorDeletion(example, options);
    expect(plan.usages.length).toBeGreaterThan(0);
    expect(plan.canUnlink).toBe(true);
    const next = removeRoomEntitiesInProject(example, options, null);
    expect(records(next, "actors")).toHaveLength(records(example, "actors").length - 1);
    expect(() => buildEngineExportProjectContract(next)).not.toThrow();
  });

  it("removes a dialogue from cutscene frames and supports compatible replacement", () => {
    const key = "prologo_frame_1";
    const replacement = dialogueReplacementChoices(example, key)[0]!;
    expect(replacement).toBeDefined();
    for (const replacementKey of [null, replacement.value]) {
      const next = removeDialogueFromProject(example, key, { replacementKey });
      expect(next).not.toBe(example);
      expect(JSON.stringify(next.scenas)).not.toContain(`"dialogueKey":"${key}"`);
      expect(() => buildEngineExportProjectContract(next)).not.toThrow();
    }
  });
});
