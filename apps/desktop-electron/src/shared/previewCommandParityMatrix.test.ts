import { describe, expect, it } from "vitest";
import { buildPreviewRomParityMatrix, previewRomParityMatrixIssues } from "./previewCommandParityMatrix.js";

describe("previewCommandParityMatrix", () => {
  it("maps every OK ROM verb to at least one export opcode", () => {
    const issues = previewRomParityMatrixIssues();
    expect(issues).toEqual([]);
    expect(buildPreviewRomParityMatrix().filter((entry) => entry.verb !== "noop")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ verb: "save_game", status: "ok-rom", exportOps: ["save_game"] }),
        expect.objectContaining({ verb: "replace_tile", status: "ok-rom", exportOps: ["replace_tile"] }),
        expect.objectContaining({ verb: "if_variable", status: "ok-rom", exportOps: ["jump_if_variable_equals"] }),
        expect.objectContaining({ verb: "change_actor_sprite", status: "ok-rom", exportOps: ["set_actor_sprite"] }),
        expect.objectContaining({ verb: "change_player_sprite", status: "ok-rom", exportOps: ["set_actor_sprite"] }),
        expect.objectContaining({ verb: "set_actor_sprite", status: "ok-rom", exportOps: ["set_actor_sprite"] }),
        expect.objectContaining({ verb: "set_background_palette", status: "ok-rom", exportOps: ["set_background_palette"] }),
        expect.objectContaining({ verb: "set_sprite_palette", status: "ok-rom", exportOps: ["set_sprite_palette"] }),
        expect.objectContaining({ verb: "restore_colors", status: "ok-rom", exportOps: ["set_background_palette", "set_sprite_palette"] }),
        expect.objectContaining({ verb: "has_item", status: "ok-rom", exportOps: ["jump_if_inventory_at_least"] }),
        expect.objectContaining({ verb: "if_save_game", status: "ok-rom", exportOps: ["jump_if_save_exists"] }),
        expect.objectContaining({ verb: "set_dialogue_frame", status: "ok-rom", exportOps: ["set_dialogue_frame"] }),
        expect.objectContaining({ verb: "set_text_sfx", status: "ok-rom", exportOps: ["set_text_sfx"] }),
        expect.objectContaining({ verb: "stop_event", status: "ok-rom", exportOps: ["jump"] }),
        expect.objectContaining({ verb: "switch_variable", status: "ok-rom", exportOps: ["jump_if_variable_equals", "call_script"] }),
        expect.objectContaining({ verb: "repeat_expression", status: "ok-rom", exportOps: ["jump_if_variable_less_than", "jump_if_variable_equals", "call_script"] }),
        expect.objectContaining({ verb: "scene_stack_push", status: "ok-rom" }),
        expect.objectContaining({ verb: "divide_variable", status: "ok-rom" }),
        expect.objectContaining({ verb: "launch_projectile", status: "ok-rom" })
      ])
    );
  });
});
