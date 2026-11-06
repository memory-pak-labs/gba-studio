import { describe, expect, it } from "vitest";
import type { GBAProjectData } from "./projectFile.js";
import { addSceneNote, readSceneNotes, removeSceneNote, updateSceneNote } from "./sceneNotes.js";
import { pushProjectHistory, redoProjectHistory, undoProjectHistory } from "./projectHistory.js";

const project = () => ({ schemaVersion: 1, name: "Notes", rooms: [], editorState: { sceneMapPositions: { port: { x: 20, y: 30 } } } }) as unknown as GBAProjectData;

describe("scene notes authoring", () => {
  it("creates independent notes without changing scenes or existing editor state", () => {
    const source = project();
    const next = addSceneNote(source, { id: "note-1", x: 400, y: 200 });
    expect(readSceneNotes(source)).toEqual([]);
    expect(readSceneNotes(next)).toEqual([{ id: "note-1", title: "", text: "", color: "yellow", x: 400, y: 200, width: 240, height: 180 }]);
    expect(next.rooms).toEqual(source.rooms);
    expect((next.editorState as Record<string, unknown>).sceneMapPositions).toEqual((source.editorState as Record<string, unknown>).sceneMapPositions);
    expect(addSceneNote(next, { id: "note-1", x: 0, y: 0 })).toBe(next);
  });

  it("edits multiline reminders, bounds geometry and removes only the requested note", () => {
    const source = addSceneNote(addSceneNote(project(), { id: "a", x: 10, y: 20 }), { id: "b", x: 50, y: 80 });
    const edited = updateSceneNote(source, "a", { title: "Revisar porto", text: "Testar colisões\nRever diálogo", color: "blue", x: -5, y: 120, width: 10, height: 20 });
    expect(readSceneNotes(edited)[0]).toMatchObject({ title: "Revisar porto", text: "Testar colisões\nRever diálogo", color: "blue", x: 0, y: 120, width: 180, height: 120 });
    expect(readSceneNotes(source)[0].text).toBe("");
    expect(updateSceneNote(edited, "a", { x: NaN, y: Infinity })).toBe(edited);
    expect(updateSceneNote(edited, "missing", { text: "x" })).toBe(edited);
    expect(removeSceneNote(edited, "missing")).toBe(edited);
    expect(readSceneNotes(removeSceneNote(edited, "a")).map(n => n.id)).toEqual(["b"]);
  });

  it("undoes and redoes creation, edits, movement and removal through project history", () => {
    const initial = project();
    const added = addSceneNote(initial, { id: "a", x: 10, y: 20 });
    const edited = updateSceneNote(added, "a", { text: "Lembrar", x: 900, width: 320 });
    let history = { present: initial, undoStack: [] as GBAProjectData[], redoStack: [] as GBAProjectData[] };
    for (const state of [added, edited, removeSceneNote(edited, "a")]) history = pushProjectHistory(history, state);
    history = undoProjectHistory(history);
    expect(readSceneNotes(history.present)[0]).toMatchObject({ text: "Lembrar", x: 900, width: 320 });
    history = undoProjectHistory(undoProjectHistory(history));
    expect(readSceneNotes(history.present)).toEqual([]);
    history = redoProjectHistory(redoProjectHistory(history));
    expect(readSceneNotes(history.present)).toEqual(readSceneNotes(edited));
  });
});
