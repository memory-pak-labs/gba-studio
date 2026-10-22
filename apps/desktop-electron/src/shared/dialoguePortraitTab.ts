import type { DialoguePreviewLayout } from "./sceneRuntimeExport.js";

/** Palette roles and joined outline shared by the editor snapshot and native preset. */
export const portraitTabColors = ["#00000000", "#001820", "#c8b888", "#185868", "#083038", "#103848", "#f0e8d0", "#e8c878", "#184050"];

export function portraitTabPalette(pixels?: Uint8ClampedArray): string[] {
  if (!pixels) return [...portraitTabColors];
  const colors = new Map<string, number[]>();
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 3] >= 128) {
    const rgb = [pixels[i], pixels[i + 1], pixels[i + 2]].map(c => Math.floor(c / 8) * 8);
    colors.set(rgb.join(","), rgb);
  }
  if (!colors.size) return [...portraitTabColors];
  // Unused runtime skin palette slots are black; index zero stays transparent.
  if (colors.size < 14) colors.set("0,0,0", [0, 0, 0]);
  return portraitTabColors.map((hex, role) => {
    if (!role) return hex;
    const target = hex.slice(1).match(/../g)!.map(c => parseInt(c, 16));
    const error = (rgb: number[]): number => rgb.reduce((sum, c, i) => sum + (c - target[i]) ** 2, 0);
    const rgb = [...colors.values()].reduce((best, candidate) => error(candidate) < error(best) ? candidate : best);
    return `#${rgb.map(c => c.toString(16).padStart(2, "0")).join("")}`;
  });
}

export function portraitTabFramePixels(layout: DialoguePreviewLayout, portrait: boolean, name: boolean, colors = portraitTabColors): Uint8ClampedArray {
  const { box, portraitSlot: pod, nameLabel: tab } = layout;
  const regions = [box];
  if (portrait) regions.push({ ...pod, height: pod.height + 4 });
  if (name) regions.push({ ...tab, x: tab.x - (portrait && !layout.portraitOnRight ? 4 : 0), width: tab.width + (portrait ? 4 : 0), height: tab.height + 4 });
  const field = new Uint8Array(240 * 160);
  for (const b of regions) for (let y = b.y; y < b.y + b.height; y++) for (let x = b.x; x < b.x + b.width; x++) {
    const xx = x - b.x, yy = y - b.y;
    if (Math.min(xx + yy, b.width - 1 - xx + yy, xx + b.height - 1 - yy, b.width + b.height - 2 - xx - yy) >= 3) field[y * 240 + x] = 4;
  }
  const at = (x: number, y: number): number => x < 0 || x >= 240 || y < 0 || y >= 160 ? 0 : field[y * 240 + x];
  for (let y = 0; y < 160; y++) for (let x = 0; x < 240; x++) if (at(x, y)) field[y * 240 + x] = Math.min(at(x, y), at(x - 1, y) + 1, at(x, y - 1) + 1);
  for (let y = 159; y >= 0; y--) for (let x = 239; x >= 0; x--) if (at(x, y)) field[y * 240 + x] = Math.min(at(x, y), at(x + 1, y) + 1, at(x, y + 1) + 1);
  const output = new Uint8ClampedArray(240 * 160 * 4);
  field.forEach((role, i) => { if (role) output.set([...colors[role].slice(1).match(/../g)!.map(c => parseInt(c, 16)), 255], i * 4); });
  return output;
}
