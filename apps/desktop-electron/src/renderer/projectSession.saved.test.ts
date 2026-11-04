import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { createRoomInProject, setActiveRoomInProject } from "../shared/roomsWorkspace.js";
import { markProjectSessionSaved, reconcileProjectSessionSaved, restoreProjectSessionHistory, selectProjectSessionRoom, type ProjectSession } from "./projectSession.js";

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
  it("does not treat an overwritten asset as restored when undo only restores project metadata", () => {
    const initial = saved();
    const replaced = { ...edit(initial, "Asset replaced"), externalRevision: 1 };
    expect(restoreProjectSessionHistory(replaced, "undo").dirty).toBe(true);
    const committed = markProjectSessionSaved(replaced, replaced.path!, replaced.project.data);
    expect(committed.dirty).toBe(false);
    const undo = restoreProjectSessionHistory(committed, "undo");
    expect(undo.dirty).toBe(true);
    expect(restoreProjectSessionHistory(undo, "redo").dirty).toBe(false);
  });
  it("keeps a file replacement made during an in-flight save marked dirty", () => {
    const requested = saved();
    const later = { ...requested, dirty: true, externalRevision: 1 };
    const reconciled = reconcileProjectSessionSaved(later, requested, requested.path!, requested.project.data);
    expect(reconciled?.dirty).toBe(true);
  });
});
