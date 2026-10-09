function expandFiveBits(value: number): number {
  const channel = value & 0x1f;
  return (channel << 3) | (channel >> 2);
}

export function decodeRgb555(value: number): [number, number, number] {
  const color = value & 0x7fff;
  return [
    expandFiveBits(color),
    expandFiveBits(color >> 5),
    expandFiveBits(color >> 10)
  ];
}

export function compileRgbaToRgb555(source: Uint8ClampedArray): Uint8ClampedArray {
  const compiled = new Uint8ClampedArray(source);
  for (let offset = 0; offset + 3 < compiled.length; offset += 4) {
    compiled[offset] = expandFiveBits(compiled[offset] >> 3);
    compiled[offset + 1] = expandFiveBits(compiled[offset + 1] >> 3);
    compiled[offset + 2] = expandFiveBits(compiled[offset + 2] >> 3);
  }
  return compiled;
}

export function formatRgb555Hex(value: number): string {
  return (value & 0x7fff).toString(16).toUpperCase().padStart(4, "0");
}

export function parseRgb555Hex(hex: string): number | null {
  const trimmed = hex.trim();
  if (/^0x/i.test(trimmed)) return parseRgb555Hex(trimmed.slice(2));
  if (!/^[0-9a-fA-F]{1,4}$/.test(trimmed)) return null;
  const value = parseInt(trimmed, 16);
  return Number.isNaN(value) || value < 0 || value > 0x7fff ? null : value;
}

export function isValidRgb555(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0x7fff;
}

export function encodeRgb555(r: number, g: number, b: number): number {
  const red = Math.max(0, Math.min(255, Math.round(r)));
  const green = Math.max(0, Math.min(255, Math.round(g)));
  const blue = Math.max(0, Math.min(255, Math.round(b)));
  return ((blue >> 3) << 10) | ((green >> 3) << 5) | (red >> 3);
}

export function remapRgbaToRgb555Palette(
  source: Uint8ClampedArray,
  palette: readonly number[]
): Uint8ClampedArray {
  if (palette.length === 0) return compileRgbaToRgb555(source);
  const colors = palette.slice(0, 16).map(decodeRgb555);
  const compiled = compileRgbaToRgb555(source);
  for (let offset = 0; offset + 3 < compiled.length; offset += 4) {
    if (compiled[offset + 3] === 0) continue;
    let nearest = colors[0];
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (const color of colors) {
      const red = compiled[offset] - color[0];
      const green = compiled[offset + 1] - color[1];
      const blue = compiled[offset + 2] - color[2];
      const distance = (2 * red * red) + (4 * green * green) + (blue * blue);
      if (distance < nearestDistance) {
        nearest = color;
        nearestDistance = distance;
      }
    }
    compiled[offset] = nearest[0];
    compiled[offset + 1] = nearest[1];
    compiled[offset + 2] = nearest[2];
  }
  return compiled;
}
