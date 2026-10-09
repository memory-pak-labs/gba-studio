import { describe, expect, it } from "vitest";

import {
  resolvePersistedProjectPathAfterSave,
  resolveProjectSessionPathAfterDataCommit
} from "./projectImportPath.js";

describe("resolvePersistedProjectPathAfterSave", () => {
  it("reuses an existing project path without saving", () => {
    expect(resolvePersistedProjectPathAfterSave("/tmp/demo.gba-project", { canceled: true })).toEqual({
      canceled: false,
      path: "/tmp/demo.gba-project"
    });
  });

  it("returns the saved path when the project had no path yet", () => {
    expect(resolvePersistedProjectPathAfterSave(undefined, {
      path: "/tmp/demo.gba-project"
    })).toEqual({
      canceled: false,
      path: "/tmp/demo.gba-project"
    });
  });

  it("reports cancellation when save-as is dismissed", () => {
    expect(resolvePersistedProjectPathAfterSave(undefined, { canceled: true })).toEqual({
      canceled: true,
      path: null
    });
  });

  it("reports an error when save-as fails", () => {
    expect(resolvePersistedProjectPathAfterSave(undefined, {
      error: "Falha ao salvar"
    })).toEqual({
      canceled: false,
      error: "Falha ao salvar",
      path: null
    });
  });

  it("preserves the saved path when committing project data after save-as", () => {
    expect(resolveProjectSessionPathAfterDataCommit(undefined, "/tmp/demo.gba-project")).toBe("/tmp/demo.gba-project");
  });

  it("keeps the existing path when no new path is provided", () => {
    expect(resolveProjectSessionPathAfterDataCommit("/tmp/existing.gba-project")).toBe("/tmp/existing.gba-project");
  });
});
