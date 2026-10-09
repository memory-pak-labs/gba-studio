import { describe, expect, it } from "vitest";
import { listLogicValueUsages, updateLogicValueInProject } from "./logicWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";
const project = { variables: [{name:"score", initialValue:0}], constants:[{name:"limit",value:5}], events:[{name:"reward", steps:[{command:"add_variable score 1"}]}], rooms:[{name:"menu", variable:"score"}] } as GBAProjectData;
describe("logic values", () => {
  it("finds command and structured references, excluding declarations and partial names", () => {
    expect(listLogicValueUsages(project,"score")).toHaveLength(2);
    expect(listLogicValueUsages(project,"sco")).toEqual([]);
  });
  it("preserves data and blocks renaming a referenced value", () => {
    expect(updateLogicValueInProject(project,"score","variable",{name:"points"})).toBe(project);
    const next=updateLogicValueInProject(project,"limit","constant",{name:"maximum", value:8});
    expect(next.constants).toEqual([{name:"maximum",value:8}]);
    expect(project.constants).toEqual([{name:"limit",value:5}]);
  });
  it("rejects duplicate names and invalid values, bounds text length", () => {
    expect(updateLogicValueInProject(project,"limit","constant",{name:"score"})).toBe(project);
    expect(updateLogicValueInProject(project,"score","variable",{initialValue:NaN})).toBe(project);
    expect(updateLogicValueInProject(project,"score","variable",{valueType:"text",maxLength:40, initialValue:"Lumen"}).variables).toEqual([{name:"score", valueType:"text", maxLength:16, initialValue:"Lumen"}]);
  });
});
