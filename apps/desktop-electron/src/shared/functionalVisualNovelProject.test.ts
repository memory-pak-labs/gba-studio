import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalVisualNovelProject } from "./functionalVisualNovelProject.js";

describe("functionalVisualNovelProject", () => {
  it("builds a native visual_novel export contract for the demo fixture", () => {
    const contract = buildEngineExportProjectContract(buildFunctionalVisualNovelProject());

    expect(contract.kind).toBe("visual_novel");
    expect(contract.runtime_profile).toBe("visual_novel");
    expect(contract.project_data).toBe("visual_novel_project_data.hpp");
    expect(contract.template_dir).toContain("exported_visual_novel");
    expect(contract.topdown_project).toBeUndefined();
    expect(contract.visual_novel_project).toBeDefined();
    expect(contract.visual_novel_project?.initial_scene).toBe(0);
    expect(contract.visual_novel_project?.scenes).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "intro" }),
      expect.objectContaining({ name: "choice" })
    ]));
    expect(contract.visual_novel_project?.choice_groups?.length).toBeGreaterThan(0);
    expect(contract.runtime_contract).toMatchObject({
      scene_type: "visualNovel",
      adapter: "visual_novel_project",
      adapter_status: "native"
    });
  });
});
