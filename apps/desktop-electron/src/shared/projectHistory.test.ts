import { describe, expect, it } from "vitest";
import {
  pushProjectHistory,
  redoProjectHistory,
  updateProjectHistoryPresent,
  undoProjectHistory
} from "./projectHistory.js";

describe("project history", () => {
  it("undoes, redoes, and clears redo after a new edit", () => {
    const initial = {
      present: { name: "A" },
      redoStack: [],
      undoStack: []
    };
    const edited = pushProjectHistory(initial, { name: "B" });
    const undone = undoProjectHistory(edited);
    const redone = redoProjectHistory(undone);
    const branched = pushProjectHistory(undone, { name: "C" });

    expect(edited).toEqual({
      present: { name: "B" },
      redoStack: [],
      undoStack: [{ name: "A" }]
    });
    expect(undone).toEqual({
      present: { name: "A" },
      redoStack: [{ name: "B" }],
      undoStack: []
    });
    expect(redone).toEqual(edited);
    expect(branched).toEqual({
      present: { name: "C" },
      redoStack: [],
      undoStack: [{ name: "A" }]
    });
  });

  it("atualiza intermediários do mesmo gesto sem criar vários checkpoints", () => {
    const initial = pushProjectHistory({
      present: { name: "A" },
      redoStack: [],
      undoStack: []
    }, { name: "B" });
    const updated = updateProjectHistoryPresent(initial, { name: "C" });

    expect(updated).toEqual({
      present: { name: "C" },
      redoStack: [],
      undoStack: [{ name: "A" }]
    });
    expect(undoProjectHistory(updated).present).toEqual({ name: "A" });
  });
});
