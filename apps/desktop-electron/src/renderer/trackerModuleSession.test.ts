import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { makeEditableModFixture } from "../shared/trackerModuleFixtures.js";
import { parseTrackerModule } from "../shared/trackerModule.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { commitEditableTrackerImport, restoreProjectSessionHistory, type ProjectSession } from "./projectSession.js";
function setup() {
  const bytes = makeEditableModFixture(); const song = parseTrackerModule(bytes, "MOD", createHash("sha256").update(bytes).digest("hex"));
  const data = { name: "Projeto", audioItems: [{ id: "original", name: "Tema", kind: "Musica", sourceAssetID: "source" }],
    assets: [{ id: "source", name: "source.mod", kind: "Audio", metadata: { source: "Assets/source.mod" } }] };
  const requested: ProjectSession = { identity: {}, path: "/project/p.gba-project", project: { data, summary: summarizeGBAProject(data) }, dirty: false, savedData: data, undoStack: [], redoStack: [] };
  return { requested, song };
}
describe("asynchronous native module import", () => {
  it("keeps changes made during loading and makes import one undoable action", () => {
    const { requested, song } = setup(); const data = { ...requested.project.data, name: "Renomeado durante a leitura" };
    const current = { ...requested, dirty: true, project: { data, summary: summarizeGBAProject(data) }, undoStack: [requested.project.data] };
    const next = commitEditableTrackerImport(current, requested, "original", song, "editable")!;
    expect(next.project.data.name).toBe(data.name); expect(next.project.data.audioItems).toHaveLength(2);
    expect(next.undoStack.at(-1)).toEqual(data);
    const undone = restoreProjectSessionHistory(next, "undo"); expect(undone.project.data).toEqual(data);
    expect(restoreProjectSessionHistory(undone, "redo").project.data).toEqual(next.project.data);
    expect(requested.project.data.audioItems).toHaveLength(1);
  });
  it("discards a late result after switching projects or replacing the source", () => {
    const { requested, song } = setup(); const switched = { ...requested, identity: {} };
    expect(commitEditableTrackerImport(switched, requested, "original", song, "editable")).toBe(switched);
    const changed = structuredClone(requested.project.data); (changed.assets as any[])[0].metadata.source = "Assets/replaced.mod";
    const replaced = { ...requested, project: { data: changed, summary: summarizeGBAProject(changed) } };
    expect(commitEditableTrackerImport(replaced, requested, "original", song, "editable")).toBe(replaced);
  });
});
