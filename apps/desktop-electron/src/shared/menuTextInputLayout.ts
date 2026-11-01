import type { MenuTextInputConfig } from "./menuScene.js";

export interface MenuTextInputKeyGeometry {
  index: number;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  glyphX: number;
  glyphY: number;
}

/** Pixel geometry used by GBAStudioEngine's BottomGrid name keyboard.
 * Keycaps belong to the scene background, not a stretched HTML grid. */
export function menuTextInputLayout(input: MenuTextInputConfig) {
  const keyboard = input.keyboard;
  if (keyboard?.layout !== "grid" || keyboard.controlLayout !== "bottom_grid") return null;
  const x = keyboard.x * 8, y = keyboard.y * 8;
  const keys: MenuTextInputKeyGeometry[] = Array.from({ length: 26 }, (_, index) => ({
    index, label: String.fromCharCode(65 + index),
    x: x + index % 8 * 16, y: y + Math.floor(index / 8) * 16,
    width: 16, height: 16,
    glyphX: x + index % 8 * 16 + 4, glyphY: y + Math.floor(index / 8) * 16 + 4
  }));
  ["DEL", "Aa", "OK"].forEach((label, index) => keys.push({
    index: 26 + index, label, x: x + index * 48, y: y + 64, width: 40, height: 16,
    glyphX: x + index * 48 + (index === 0 ? 8 : 12), glyphY: y + 68
  }));
  return { keys, nameField: { x: input.x * 8, y: input.y * 8, width: input.width * 8, height: 8 } };
}
