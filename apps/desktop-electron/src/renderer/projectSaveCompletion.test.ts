import { describe, expect, it } from "vitest";
import { completeProjectSave } from "./projectSaveCompletion.js";
import type { ProjectSession } from "./projectSession.js";
const snapshot = { dirty: true, path: "/game.gba-project", project: { data: {} } } as ProjectSession;
describe("project save completion", () => {
  it("keeps work dirty when saving fails even if a path is returned", () => {
    expect(completeProjectSave(snapshot, snapshot, { canceled: false, path: "/game.gba-project", error: "disk full" })).toBe(snapshot);
  });
  it("does not overwrite edits or a different session while saving", () => {
    const edited = { ...snapshot, project: { ...snapshot.project, data: { name: "new" } } };
    expect(completeProjectSave(edited, snapshot, { canceled: false, path: "/game.gba-project" })).toBe(edited);
    expect(completeProjectSave(null, snapshot, { canceled: false, path: "/game.gba-project" })).toBeNull();
  });
  it("does not mark a session clean when its dirty state changes while saving", () => {
    const cleanSnapshot = { ...snapshot, dirty: false };
    const edited = { ...cleanSnapshot, dirty: true };
    expect(completeProjectSave(edited, cleanSnapshot, { canceled: false, path: "/game.gba-project" })).toBe(edited);
  });
  it("marks the exact saved snapshot as clean only on success", () => {
    expect(completeProjectSave(snapshot, snapshot, { canceled: false, path: "/copy.gba-project" })).toMatchObject({ dirty: false, path: "/copy.gba-project" });
  });
});
