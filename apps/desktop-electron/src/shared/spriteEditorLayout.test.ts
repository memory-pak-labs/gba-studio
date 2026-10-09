import { describe, expect, it } from "vitest";

import {
  clampSpriteEditorBottomHeight,
  DEFAULT_SPRITE_EDITOR_BOTTOM_HEIGHT,
  toggleSpriteEditorBottomHeight
} from "./spriteEditorLayout.js";

describe("spriteEditorLayout", () => {
  it("clamps bottom pane height to supported bounds", () => {
    expect(clampSpriteEditorBottomHeight(12)).toBe(36);
    expect(clampSpriteEditorBottomHeight(180)).toBe(180);
    expect(clampSpriteEditorBottomHeight(999)).toBe(420);
    expect(clampSpriteEditorBottomHeight(Number.NaN)).toBe(DEFAULT_SPRITE_EDITOR_BOTTOM_HEIGHT);
  });

  it("toggles between collapsed and default bottom pane heights", () => {
    expect(toggleSpriteEditorBottomHeight(36)).toBe(DEFAULT_SPRITE_EDITOR_BOTTOM_HEIGHT);
    expect(toggleSpriteEditorBottomHeight(180)).toBe(36);
  });
});
