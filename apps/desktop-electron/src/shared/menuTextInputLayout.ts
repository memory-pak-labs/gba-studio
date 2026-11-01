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

export type MenuTextInputPart = "field" | "keyboard";

/** Movement is authored in tiles, just like the existing engine contract. */
export function moveMenuTextInput(input: MenuTextInputConfig, part: MenuTextInputPart, dx: number, dy: number): MenuTextInputConfig {
  const source = part === "field" ? input : input.keyboard;
  if (!source) return input;
  const width = part === "field" ? input.width : Math.max(input.keyboard!.width, 17);
  const height = part === "field" ? 1 : Math.max(input.keyboard!.height, 10);
  const x = Math.max(0, Math.min(30 - width, source.x + Math.round(dx / 8)));
  const y = Math.max(0, Math.min(20 - height, source.y + Math.round(dy / 8)));
  if (x === source.x && y === source.y) return input;
  return part === "field" ? { ...input, x, y } : { ...input, keyboard: { ...input.keyboard!, x, y } };
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
  return { keys, nameField: { x: input.x * 8, y: input.y * 8, width: input.width * 8, height: 8 },
    keyboardBounds: { x, y, width: 136, height: 80 } };
}
