import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { createRoomInProject, setActiveRoomInProject } from "../shared/roomsWorkspace.js";
import { commitProjectAssetReplacement, markProjectSessionSaved, reconcileProjectSessionSaved, restoreProjectSessionHistory, selectProjectSessionRoom, type ProjectSession } from "./projectSession.js";

function saved(): ProjectSession {
  const data = setActiveRoomInProject(createRoomInProject(createBlankProjectData({ name: "Saved" }), {
    id: "room-port", name: "port", sceneType: "topdown", width: 60, height: 40
  }), "room-port");
  return markProjectSessionSaved({ identity: {}, path: "/game.gba-project", project: { data, summary: summarizeGBAProject(data) }, dirty: false, undoStack: [], redoStack: [] }, "/game.gba-project", data);
}
function edit(session: ProjectSession, name: string): ProjectSession {
  const data = { ...session.project.data, name };
  return { ...session, dirty: true, undoStack: [...session.undoStack, session.project.data], redoStack: [], project: { data, summary: summarizeGBAProject(data) } };
}

describe("saved project history", () => {
  it("marks undo to the saved contents clean and redo dirty", () => {
    const changed = edit(saved(), "Edited");
    const undone = restoreProjectSessionHistory(changed, "undo");
    expect(undone.dirty).toBe(false);
    expect(restoreProjectSessionHistory(undone, "redo").dirty).toBe(true);
  });
  it("recognizes the saved state on redo after saving an edit", () => {
    const changed = edit(saved(), "Edited");
    const committed = markProjectSessionSaved(changed, "/game.gba-project", changed.project.data);
    const undone = restoreProjectSessionHistory(committed, "undo");
    expect(undone.dirty).toBe(true);
    expect(restoreProjectSessionHistory(undone, "redo").dirty).toBe(false);
  });
  it("ignores only a valid active-scene mirror when navigating", () => {
    const initial = saved();
    const navigated = selectProjectSessionRoom(initial, "room-1");
    expect(restoreProjectSessionHistory(edit(navigated, "Edited"), "undo").dirty).toBe(false);
    const invalid = { ...navigated.project.data, scena: { ...(navigated.project.data.scena as object), unexpected: true } };
    expect(markProjectSessionSaved({ ...navigated, project: { ...navigated.project, data: invalid } }, navigated.path!, initial.project.data).dirty).toBe(true);
  });
  it("does not clear other pending changes or assume a missing baseline is saved", () => {
    const initial = saved();
    const first = edit(initial, "First");
    expect(restoreProjectSessionHistory(edit(first, "Second"), "undo").dirty).toBe(true);
    expect(restoreProjectSessionHistory({ ...first, savedData: undefined }, "undo").dirty).toBe(true);
  });
  it("keeps edits made while a save runs and ignores completion for another project", () => {
    const start = edit(saved(), "Being saved");
    const savedData = structuredClone(start.project.data);
    const later = edit(start, "New edit");
    const reconciled = reconcileProjectSessionSaved(later, start, "/new.gba-project", savedData);
    expect(reconciled?.project.data.name).toBe("New edit");
    expect(reconciled?.path).toBe("/new.gba-project");
    expect(reconciled?.dirty).toBe(true);
    expect(restoreProjectSessionHistory(reconciled!, "undo").dirty).toBe(false);
    const other = saved();
    expect(reconcileProjectSessionSaved(other, start, "/new.gba-project", savedData)).toBe(other);
  });
  it("applies a finished replacement to the current session without dropping edits or a newer asset version", () => {
    const initial = saved();
    const source = "Assets/sprites/player.png";
    const data = { ...initial.project.data, assets: [{ id: "player", name: "player.png", kind: "Sprite", metadata: { source } }] };
    const requested = markProjectSessionSaved({ ...initial, project: { data, summary: summarizeGBAProject(data) } }, initial.path!, data);
    const later = edit(requested, "A later project edit");
    const replacement = { id: "revision", name: "player.png", relativePath: "Assets/revisions/asset-a/player.png", kind: "Sprite", systemImage: "photo" };
    const applied = commitProjectAssetReplacement(later, requested, requested.path!, "player", source, replacement)!;
    expect(applied.project.data.name).toBe("A later project edit");
    expect(applied.project.data).toMatchObject({ assets: [{ metadata: { source: replacement.relativePath } }] });
    expect(restoreProjectSessionHistory(applied, "undo").project.data).toEqual(later.project.data);
    expect(reconcileProjectSessionSaved(applied, later, later.path!, later.project.data)?.dirty).toBe(true);
    expect(commitProjectAssetReplacement(applied, requested, requested.path!, "player", source, replacement)).toBe(applied);
    const other = { ...later, identity: {} };
    expect(commitProjectAssetReplacement(other, requested, requested.path!, "player", source, replacement)).toBe(other);
  });
});
