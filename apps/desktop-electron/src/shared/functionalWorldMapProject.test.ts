import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalWorldMapProject } from "./functionalWorldMapProject.js";

describe("functionalWorldMapProject", () => {
  it("builds a native world_map export contract for the demo fixture", () => {
    const contract = buildEngineExportProjectContract(buildFunctionalWorldMapProject());

    expect(contract.kind).toBe("world_map");
    expect(contract.runtime_profile).toBe("world_map");
    expect(contract.project_data).toBe("world_map_project_data.hpp");
    expect(contract.template_dir).toContain("exported_world_map");
    expect(contract.topdown_project).toBeUndefined();
    expect(contract.world_map_project).toBeDefined();
    expect(contract.world_map_project?.initial_node).toBe(0);
    expect(contract.world_map_project?.nodes).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "start",
        connections: expect.arrayContaining(["forest", "castle"])
      }),
      expect.objectContaining({ name: "forest" }),
      expect.objectContaining({
        name: "castle",
        unlocked: false,
        hide_when_locked: true,
        required_variable: 2,
        required_value: 1,
        target_level: 7
      })
    ]));
    expect(contract.runtime_contract).toMatchObject({
      scene_type: "worldMap",
      adapter: "world_map_project",
      adapter_status: "native"
    });
  });
});
