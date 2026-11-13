import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { makeEditableModFixture } from "../shared/trackerModuleFixtures.js";
import { parseTrackerModule } from "../shared/trackerModule.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { commitEditableTrackerImport, restoreProjectSessionHistory, type ProjectSession } from "./projectSession.js";
function setup() {
  const bytes = makeEditableModFixture(); const song = parseTrackerModule(bytes, "MOD", createHash("sha256").update(bytes).digest("hex"));
  const data = { name: "Projeto", audioItems: [{ id: "original", name: "Tema", kind: "Musica", sourceAssetID: "source", exportID: "theme", volume: 86, loops: false }],
    assets: [{ id: "source", name: "source.mod", kind: "Audio", metadata: { source: "Assets/source.mod" } }] };
  const requested: ProjectSession = { identity: {}, path: "/project/p.gba-project", project: { data, summary: summarizeGBAProject(data) }, dirty: false, savedData: data, undoStack: [], redoStack: [] };
  return { requested, song };
}
describe("asynchronous native module import", () => {
  it("prepares the original item, preserves concurrent changes and makes editing one undoable action", () => {
    const { requested, song } = setup(); const data: ProjectSession["project"]["data"] = { ...requested.project.data, name: "Renomeado durante a leitura" };
    const current = { ...requested, dirty: true, project: { data, summary: summarizeGBAProject(data) }, undoStack: [requested.project.data] };
    const next = commitEditableTrackerImport(current, requested, "original", song)!;
    expect(next.project.data.name).toBe(data.name); expect(next.project.data.audioItems).toHaveLength(1);
    expect((next.project.data.audioItems as any[])[0]).toMatchObject({ id: "original", name: "Tema", sourceAssetID: "source", exportID: "theme", volume: 86, loops: false, trackerModule: { projectOverlay: true } });
    expect(next.project.data.assets).toEqual(current.project.data.assets);
    expect(next.undoStack.at(-1)).toEqual(data);
    const undone = restoreProjectSessionHistory(next, "undo"); expect(undone.project.data).toEqual(data);
    expect(restoreProjectSessionHistory(undone, "redo").project.data).toEqual(next.project.data);
    expect(requested.project.data.audioItems).toHaveLength(1);
  });
  it("does not create extra history or overwrite edits when preparation completes twice", () => {
    const { requested, song } = setup();
    const first = commitEditableTrackerImport(requested, requested, "original", song)!;
    expect(commitEditableTrackerImport(first, requested, "original", song)).toBe(first);
    expect(first.undoStack).toHaveLength(1);
  });
  it("discards a late result after switching projects or replacing the source", () => {
    const { requested, song } = setup(); const switched = { ...requested, identity: {} };
    expect(commitEditableTrackerImport(switched, requested, "original", song)).toBe(switched);
    const changed = structuredClone(requested.project.data); (changed.assets as any[])[0].metadata.source = "Assets/replaced.mod";
    const replaced = { ...requested, project: { data: changed, summary: summarizeGBAProject(changed) } };
    expect(commitEditableTrackerImport(replaced, requested, "original", song)).toBe(replaced);
  });
});
