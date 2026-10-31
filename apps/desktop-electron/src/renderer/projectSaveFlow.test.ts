import { describe, expect, it, vi } from "vitest";
import { parseGBAProjectFile } from "../shared/projectFile.js";
import { saveExistingProjectSession } from "./projectSaveFlow.js";

const project = parseGBAProjectFile('{"schemaVersion":2,"name":"Authoring"}');
const session = { path: "/original/game.gba-project", project, dirty: true, undoStack: [project.data], redoStack: [] };

describe("existing project save flow", () => {
  it("supplies the source for Save As without bypassing the destination dialog", async () => {
    const save = vi.fn().mockResolvedValue({ canceled: false, path: "/copy/copy.gba-project" });
    const next = await saveExistingProjectSession(session, save, true);
    expect(save).toHaveBeenCalledWith({ project, sourcePath: session.path });
    expect(next.session).toEqual({ ...session, path: "/copy/copy.gba-project", dirty: false });
    expect(next.session.undoStack).toBe(session.undoStack);
    expect(session.dirty).toBe(true);
  });
  it.each([{ canceled: true }, { canceled: false, path: "/copy/copy.gba-project", error: "asset copy failed" }])(
    "preserves the current path and unsaved work after cancellation or failure", async result => {
      expect((await saveExistingProjectSession(session, vi.fn().mockResolvedValue(result), true)).session).toBe(session);
    }
  );
  it("saves normally at the current path", async () => {
    const save = vi.fn().mockResolvedValue({ canceled: false, path: session.path });
    expect((await saveExistingProjectSession(session, save)).session.dirty).toBe(false);
    expect(save).toHaveBeenCalledWith({ project, path: session.path });
  });
});
