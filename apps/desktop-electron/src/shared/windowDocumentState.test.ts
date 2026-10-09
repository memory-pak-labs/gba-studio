import { describe, expect, it } from "vitest";
import { deriveWindowDocumentState } from "./windowDocumentState.js";

describe("window document state", () => {
  it("uses the application title when there is no project", () => {
    expect(deriveWindowDocumentState(null)).toEqual({
      dirty: false,
      representedFilename: "",
      title: "GBA Studio"
    });
  });

  it("uses the project name and path when a saved project is open", () => {
    expect(deriveWindowDocumentState({
      dirty: false,
      path: "/Projects/Topdown.gba-project",
      projectName: "Topdown"
    })).toEqual({
      dirty: false,
      representedFilename: "/Projects/Topdown.gba-project",
      title: "Topdown - GBA Studio"
    });
  });

  it("marks dirty projects in the native window title", () => {
    expect(deriveWindowDocumentState({
      dirty: true,
      projectName: "Topdown"
    })).toEqual({
      dirty: true,
      representedFilename: "",
      title: "Topdown * - GBA Studio"
    });
  });
});
