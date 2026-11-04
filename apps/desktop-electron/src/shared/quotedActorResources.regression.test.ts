import { describe, expect, it } from "vitest";
import { sceneChangeCommand, sceneChangeCommandParts, actorCommandReferences } from "./sceneChangeCommand.js";

describe("quoted actor resource operands", () => {
  it.each([
    ["show_actor_gesture", "Guard QA", "speech bubble.png", "90"],
    ["play_actor_animation", "Hero QA", 'Wave "hello"'],
    ["set_actor_animation", "Hero QA", "Custom salute"],
    ["change_actor_sprite", "Hero QA", "hero blue.png"],
    ["set_actor_animation_state", "Hero QA", "Combat state"]
  ])("roundtrips every operand of %s without changing names", (...parts) => {
    expect(sceneChangeCommandParts(sceneChangeCommand(parts))).toEqual(parts);
    expect(actorCommandReferences(sceneChangeCommand(parts))).toEqual([parts[1]]);
  });

  it("parses explicitly quoted resource names after a simple actor name", () => {
    expect(sceneChangeCommandParts('show_actor_gesture Player "speech bubble.png" 90'))
      .toEqual(["show_actor_gesture", "Player", "speech bubble.png", "90"]);
  });

  it("preserves raw dialogue text and the existing two-actor name lookup", () => {
    expect(sceneChangeCommand(["draw_text", "1", "2", "overlay", 'He said "hello"']))
      .toBe('draw_text 1 2 overlay He said "hello"');
    expect(sceneChangeCommandParts('if_actor_relative Guard QA Hero QA left', ["Guard QA", "Hero QA"]))
      .toEqual(["if_actor_relative", "Guard QA", "Hero QA", "left"]);
  });
});
