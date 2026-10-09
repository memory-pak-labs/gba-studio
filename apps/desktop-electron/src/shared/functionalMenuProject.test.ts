import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalMenuProject } from "./functionalMenuProject.js";

describe("functionalMenuProject", () => {
  it("builds a native menu export contract for the demo fixture", () => {
    const contract = buildEngineExportProjectContract(buildFunctionalMenuProject());

    expect(contract.kind).toBe("mixed");
    expect(contract.runtime_profile).toBe("mixed");
    expect(contract.project_data).toBe("mixed_project_data.hpp");
    expect(contract.template_dir).toContain("exported_mixed");
    expect(contract.runtime_dispatch).toMatchObject({ initial_runtime: "menu", runtimes: ["menu", "topdown"] });
    expect(contract.topdown_project).toBeDefined();
    expect(contract.menu_project).toBeDefined();
    expect(contract.menu_project?.initial_screen).toBe(0);
    expect(contract.menu_project?.screens).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "logo", screen_type: "logo", next_screen: 1, items: [] }),
      expect.objectContaining({
        name: "title",
        screen_type: "title",
        text_input: {
          variable_index: 0,
          max_length: 8,
          x: 10,
          y: 8,
          width: 8,
          keyboard_layout: "hidden",
          keyboard_x: 0,
          keyboard_y: 0,
          keyboard_width: 0,
          keyboard_height: 0,
          keyboard_allow_lowercase: false
        },
        items: expect.arrayContaining([
          expect.objectContaining({ label: expect.stringMatching(/Start/i), on_select: expect.arrayContaining([
            expect.objectContaining({ op: "open_text_input", variable: 0, max_length: 8, charset: "latin_upper" }),
            expect.objectContaining({ op: "warp_runtime", runtime: "topdown", room: 0 })
          ]) }),
          expect.objectContaining({ label: "Options", action: "push_screen", target_screen: 2 })
        ])
      }),
      expect.objectContaining({
        name: "options",
        screen_type: "menu",
        items: expect.arrayContaining([
          expect.objectContaining({ label: "Sound", action: "toggle_variable", toggle_variable: 1 }),
          expect.objectContaining({ label: "Back", action: "pop_screen" })
        ])
      })
    ]));
    expect(contract.runtime_contract).toMatchObject({
      scene_type: "menu",
      adapter: "mixed_runtime_project",
      adapter_status: "native"
    });
  });
});
