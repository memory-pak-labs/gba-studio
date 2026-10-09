import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import {
  createProjectVariableInProject,
  listProjectVariables,
  removeProjectVariableFromProject,
  renameProjectVariableInProject
} from "./variablesWorkspace.js";

describe("variablesWorkspace", () => {
  it("creates variables and constants without duplicating names", () => {
    let project = createBlankProjectData({ name: "Vars" });
    project = createProjectVariableInProject(project, { name: "score" });
    project = createProjectVariableInProject(project, { name: "max_score", kind: "constant" });
    project = createProjectVariableInProject(project, { name: "score" });

    expect(listProjectVariables(project)).toEqual([
      { name: "score", kind: "variable" },
      { name: "max_score", kind: "constant" }
    ]);
    expect(project.variables).toEqual([{ name: "score" }]);
    expect(project.constants).toEqual([{ name: "max_score", value: 0 }]);
  });

  it("renames and removes variables", () => {
    let project = createBlankProjectData({ name: "Vars" });
    project = createProjectVariableInProject(project, { name: "gold" });
    project = renameProjectVariableInProject(project, { currentName: "gold", nextName: "wallet.gold" });
    expect(listProjectVariables(project)).toEqual([{ name: "wallet.gold", kind: "variable" }]);

    project = removeProjectVariableFromProject(project, { name: "wallet.gold" });
    expect(listProjectVariables(project)).toEqual([]);
  });

  it("creates text variables with a bounded length", () => {
    let project = createBlankProjectData({ name: "Text Vars" });
    project = createProjectVariableInProject(project, {
      name: "player.name",
      valueType: "text",
      maxLength: 8
    });

    expect(listProjectVariables(project)).toEqual([{
      name: "player.name",
      kind: "variable",
      valueType: "text",
      maxLength: 8
    }]);
    expect(project.variables).toEqual([{
      name: "player.name",
      valueType: "text",
      maxLength: 8
    }]);
  });
});
