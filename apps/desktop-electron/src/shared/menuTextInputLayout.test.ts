import { describe, expect, it } from "vitest";
import { normalizeMenuSceneConfig } from "./menuScene.js";
import { menuTextInputLayout, moveMenuTextInput } from "./menuTextInputLayout.js";

const input = normalizeMenuSceneConfig({ role: "name_input", textInput: {
  variableName: "player.name", maxLength: 8, x: 15, y: 5, width: 8,
  keyboard: { layout: "grid", controlLayout: "bottom_grid", surface: "background", x: 11, y: 8, width: 16, height: 10, allowLowercase: true }
} }).textInput!;

describe("native name keyboard geometry", () => {
  it("aligns all letters and wide commands with the approved keycaps in pixels", () => {
    const before = structuredClone(input), layout = menuTextInputLayout(input)!;
    expect(layout.keys).toHaveLength(29);
    expect(layout.keys[0]).toMatchObject({ label: "A", x: 88, y: 64, width: 16, height: 16, glyphX: 92, glyphY: 68 });
    expect(layout.keys[7]).toMatchObject({ label: "H", x: 200, y: 64 });
    expect(layout.keys[8]).toMatchObject({ label: "I", x: 88, y: 80 });
    expect(layout.keys[25]).toMatchObject({ label: "Z", x: 104, y: 112 });
    expect(layout.keys.slice(26).map(key => [key.label, key.x, key.y, key.width, key.glyphX])).toEqual([
      ["DEL", 88, 128, 40, 96], ["Aa", 136, 128, 40, 148], ["OK", 184, 128, 40, 196]
    ]);
    expect(layout.nameField).toEqual({ x: 120, y: 40, width: 64, height: 8 });
    expect(input).toEqual(before);
  });
  it("moves the glyphs with the authored keyboard instead of stretching to its reserved area", () => {
    const layout = menuTextInputLayout({ ...input, keyboard: { ...input.keyboard!, x: 10, y: 7, width: 18, height: 12 } })!;
    expect(layout.keys[0]).toMatchObject({ x: 80, y: 56, glyphX: 84, glyphY: 60 });
    expect(layout.keys[28]).toMatchObject({ x: 176, y: 120, width: 40 });
  });
  it("does not materialize hidden or other keyboard presentations as BottomGrid", () => {
    expect(menuTextInputLayout({ ...input, keyboard: { ...input.keyboard!, layout: "hidden" } })).toBeNull();
    expect(menuTextInputLayout({ ...input, keyboard: { ...input.keyboard!, controlLayout: "side" } })).toBeNull();
  });
});


describe("native name input movement", () => {
  it("moves the field independently on the 8px grid and preserves its binding", () => {
    const moved = moveMenuTextInput(input, "field", -10, 9);
    expect(moved).toMatchObject({ x: 14, y: 6, width: 8, variableName: "player.name", maxLength: 8 });
    expect(moved.keyboard).toBe(input.keyboard);
    expect(input.x).toBe(15);
  });
  it("moves the whole keyboard, including wide commands, and keeps it in the viewport", () => {
    const moved = moveMenuTextInput(input, "keyboard", 999, 999);
    expect(moved).toMatchObject({ x: 15, y: 5, keyboard: { x: 13, y: 10, controlLayout: "bottom_grid", surface: "background" } });
    const bounds = menuTextInputLayout(moved)!.keyboardBounds;
    expect(bounds.x + bounds.width).toBe(240);
    expect(bounds.y + bounds.height).toBe(160);
    expect(moveMenuTextInput(input, "field", -999, -999)).toMatchObject({ x: 0, y: 0 });
  });
  it("does not create a change for a click or a movement smaller than the grid", () => {
    expect(moveMenuTextInput(input, "field", 3, -3)).toBe(input);
    expect(moveMenuTextInput(input, "keyboard", 0, 0)).toBe(input);
    expect(moveMenuTextInput({ ...input, keyboard: undefined }, "keyboard", 8, 8)).toMatchObject({ keyboard: undefined });
  });
});
