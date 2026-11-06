import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { openProjectFile, saveProjectFileAtomically } from "./projectPersistence.js";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { addSceneNote, readSceneNotes, updateSceneNote } from "../shared/sceneNotes.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

it("keeps authoring reminders out of the complete project's engine export", () => {
  const source = buildProjectFromTemplate("exemplo-gba", { name: "Notes export" });
  const annotated = updateSceneNote(addSceneNote(source, { id: "reminder", x: 400, y: 500 }), "reminder", {
    title: "Revisão", text: "Lembrete privado do autor", color: "green"
  });
  const original = buildEngineExportProjectContract(source);
  const withNotes = buildEngineExportProjectContract(annotated);
  expect(withNotes).toEqual(original);
  expect(JSON.stringify(withNotes)).not.toContain("Lembrete privado do autor");
});

it.each(["compact", "monolithic", "split"])("saves and reopens notes with the complete project in %s format", async mode => {
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-scene-notes-"));
  try {
    const source = buildProjectFromTemplate("exemplo-gba", { name: "Notes persistence" });
    const data = updateSceneNote(addSceneNote(source, { id: "reminder", x: 900, y: 500 }), "reminder", {
      title: "Próxima revisão", text: "Colisão do cais\nDiálogo do capitão", color: "pink", width: 360, height: 220
    });
    const settings = data.settings as Record<string, unknown>;
    settings.build = { ...(settings.build as Record<string, unknown>), compactTilemaps: mode !== "monolithic", splitProjectResources: mode === "split" };
    const file = path.join(root, "notes.gba-project");
    await saveProjectFileAtomically(file, { data, summary: summarizeGBAProject(data) }, { appPath: process.cwd() });
    const reopened = await openProjectFile(file);
    expect(reopened.error).toBeUndefined();
    expect(readSceneNotes(reopened.project!.data)).toEqual(readSceneNotes(data));
    expect(reopened.project!.data.editorState).toEqual(data.editorState);
    expect(reopened.project!.summary.rooms).toEqual(summarizeGBAProject(source).rooms);
    expect(readSceneNotes(source)).toEqual([]);
  } finally { await rm(root, { recursive: true, force: true }); }
}, 30000);
