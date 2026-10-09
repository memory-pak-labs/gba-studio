import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalCutsceneProject } from "./functionalCutsceneProject.js";

describe("functionalCutsceneProject", () => {
  it("builds a native cutscene export contract for the demo fixture", () => {
    const contract = buildEngineExportProjectContract(buildFunctionalCutsceneProject());

    expect(contract.kind).toBe("cutscene");
    expect(contract.runtime_profile).toBe("cutscene");
    expect(contract.project_data).toBe("cutscene_project_data.hpp");
    expect(contract.template_dir).toContain("exported_cutscene");
    expect(contract.topdown_project).toBeUndefined();
    expect(contract.cutscene_project).toBeDefined();
    expect(contract.cutscene_project?.initial_scene).toBe(0);
    expect(contract.cutscene_project?.scenes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "intro",
        next_scene: 1,
        steps: [
          expect.objectContaining({ line: 0, duration_frames: 90, skippable: false, wait_for_dialogue: true }),
          expect.objectContaining({ line: 1, duration_frames: 120, target_scene: 1 })
        ]
      })
    ]));
    expect(contract.runtime_contract).toMatchObject({
      scene_type: "cutscene",
      adapter: "cutscene_project",
      adapter_status: "native"
    });
  });
});
