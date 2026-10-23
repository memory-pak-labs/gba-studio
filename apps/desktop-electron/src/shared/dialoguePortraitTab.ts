import type { DialoguePreviewLayout } from "./sceneRuntimeExport.js";

/** Palette roles and closed outlines shared by the editor snapshot and native preset. */
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
  const regions = [{ ...box, header: false }];
  if (portrait) regions.push({ ...pod, header: false });
  if (name) regions.push({ ...tab, header: true });
  const field = new Uint8Array(240 * 160);
  for (const b of regions) {
    const region = new Uint8Array(b.width * b.height);
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      if (Math.min(x + y, b.width - 1 - x + y, x + b.height - 1 - y, b.width + b.height - 2 - x - y) >= 3) region[y * b.width + x] = 4;
    }
    const at = (x: number, y: number): number => x < 0 || x >= b.width || y < 0 || y >= b.height ? 0 : region[y * b.width + x];
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) if (at(x, y)) region[y * b.width + x] = Math.min(at(x, y), at(x - 1, y) + 1, at(x, y - 1) + 1);
    for (let y = b.height - 1; y >= 0; y--) for (let x = b.width - 1; x >= 0; x--) if (at(x, y)) region[y * b.width + x] = Math.min(at(x, y), at(x + 1, y) + 1, at(x, y + 1) + 1);
    for (let y = 0; y < b.height; y++) for (let x = 0; x < b.width; x++) {
      const role = at(x, y);
      if (role && b.x + x >= 0 && b.x + x < 240 && b.y + y >= 0 && b.y + y < 160) {
        field[(b.y + y) * 240 + b.x + x] = b.header && role === 4 ? 5 : role;
      }
    }
  }
  const output = new Uint8ClampedArray(240 * 160 * 4);
  field.forEach((role, i) => { if (role) output.set([...colors[role].slice(1).match(/../g)!.map(c => parseInt(c, 16)), 255], i * 4); });
  return output;
}
