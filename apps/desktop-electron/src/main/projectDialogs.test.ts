import { describe, expect, it } from "vitest";
import { projectOpenDialogOptions, projectSaveDialogOptions } from "./projectDialogs.js";

describe("project dialog options", () => {
  it("opens current project files while keeping legacy files selectable", () => {
    expect(projectOpenDialogOptions()).toEqual({
      title: "Abrir projeto GBA Studio",
      properties: ["openFile"],
      filters: [{ name: "GBA Studio Project", extensions: ["gba-project", "gbastudio", "gbsproj"] }]
    });
  });

  it("saves new projects inside a slugged project folder by default", () => {
    expect(projectSaveDialogOptions("Topdown Demo")).toEqual({
      title: "Salvar projeto GBA Studio",
      defaultPath: "topdown_demo/topdown_demo.gba-project",
      filters: [{ name: "GBA Studio Project", extensions: ["gba-project", "gbastudio"] }]
    });
  });
});
