import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { summarizeGBAProject } from "../shared/projectFile.js";
import { createRoomInProject, setActiveRoomInProject } from "../shared/roomsWorkspace.js";
import { selectProjectSessionRoom, type ProjectSession } from "./projectSession.js";

function fixture(): ProjectSession {
  const data = setActiveRoomInProject(createRoomInProject(createBlankProjectData({ name: "Navegação" }), {
    id: "room-port", name: "port", sceneType: "topdown", width: 60, height: 40
  }), "room-port");
  return { project: { data, summary: summarizeGBAProject(data) }, dirty: false, undoStack: [], redoStack: [] };
}

describe("selectProjectSessionRoom", () => {
  it("abre outra cena sem criar edição ou apagar o histórico", () => {
    const session = fixture();
    session.undoStack = [session.project.data];
    session.redoStack = [session.project.data];
    const next = selectProjectSessionRoom(session, "room-1");
    expect(next.project.data.scena).toMatchObject({ id: "room-1" });
    expect(next.dirty).toBe(false);
    expect(next.undoStack).toBe(session.undoStack);
    expect(next.redoStack).toBe(session.redoStack);
    expect(next.project.data.settings).toEqual(session.project.data.settings);
    expect(next.project.data.scenas).toEqual(session.project.data.scenas);
    expect(session.project.data.scena).toMatchObject({ id: "room-port" });
  });
  it("preserva alterações pendentes e ignora uma cena inexistente", () => {
    const session = { ...fixture(), dirty: true };
    expect(selectProjectSessionRoom(session, "room-1").dirty).toBe(true);
    expect(selectProjectSessionRoom(session, "missing")).toBe(session);
    expect(selectProjectSessionRoom(session, "room-port")).toBe(session);
  });
});
