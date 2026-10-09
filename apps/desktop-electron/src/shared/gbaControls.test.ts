import { describe, expect, it } from "vitest";
import {
  deriveGBAKeyboardBindings,
  formatGBAKeyboardBindings,
  parseGBAKeyboardBindings
} from "./gbaControls.js";

describe("GBA keyboard controls", () => {
  it("parses comma-separated alternatives, trims and removes duplicates", () => {
    expect(parseGBAKeyboardBindings(" ArrowUp, w, ArrowUp, ", ["ArrowDown"])).toEqual(["ArrowUp", "w"]);
    expect(parseGBAKeyboardBindings("", ["ArrowDown"])).toEqual(["ArrowDown"]);
  });

  it("formats bindings using the GB Studio-style comma separator", () => {
    expect(formatGBAKeyboardBindings(["ArrowUp", "w"])).toBe("ArrowUp,w");
  });

  it("uses arrows plus WASD and the configured A/B aliases as defaults", () => {
    expect(deriveGBAKeyboardBindings({ settings: {} })).toEqual({
      up: ["ArrowUp", "w"],
      down: ["ArrowDown", "s"],
      left: ["ArrowLeft", "a"],
      right: ["ArrowRight", "d"],
      a: ["Alt", "z", "j"],
      b: ["Control", "k", "x"],
      l: ["Q"],
      r: ["E"],
      start: ["Enter"],
      select: ["Shift"]
    });
  });

  it("derives every GBA action from project settings without losing legacy fields", () => {
    expect(deriveGBAKeyboardBindings({
      settings: {
        controls: {
          up: "ArrowUp,w",
          down: "ArrowDown,s",
          left: "ArrowLeft,a",
          right: "ArrowRight,d",
          aButton: "Alt,z,j",
          bButton: "Control,k,x",
          startButton: "Enter,Space"
        }
      }
    })).toEqual({
      up: ["ArrowUp", "w"],
      down: ["ArrowDown", "s"],
      left: ["ArrowLeft", "a"],
      right: ["ArrowRight", "d"],
      a: ["Alt", "z", "j"],
      b: ["Control", "k", "x"],
      l: ["Q"],
      r: ["E"],
      start: ["Enter", "Space"],
      select: ["Shift"]
    });
  });
});
