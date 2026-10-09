import { gbaObjNativeDimension } from "./gbaVideoModes.js";

export interface GbaMetaspriteLayoutPart {
  x: number;
  y: number;
  width: number;
  height: number;
}

type GbaMetaspriteLayoutChoice =
  | { kind: "native" }
  | { kind: "vertical"; split: number }
  | { kind: "horizontal"; split: number };

const layoutCache = new Map<string, GbaMetaspriteLayoutPart[]>();

export interface GbaMetaspriteSourcePart {
  tileWidth: number;
  tileHeight: number;
  sliceX: number;
  sliceY: number;
}

export function gbaMetaspriteFramePartCount(width: number, height: number, tiles: readonly GbaMetaspriteSourcePart[]): number {
  const first = tiles[0];
  const backing = width >= 8 && height >= 8 && width <= 1024 && height <= 1024 && width % 8 === 0 && height % 8 === 0
    ? decomposeGbaMetaspriteFrame(width, height).map(part => ({ ...part, x: part.x + (first?.sliceX ?? 0), y: part.y + (first?.sliceY ?? 0) })) : [];
  return tiles.reduce((count, tile) => {
    const { tileWidth, tileHeight, sliceX, sliceY } = tile;
    if (tileWidth < 8 || tileHeight < 8 || tileWidth % 8 || tileHeight % 8 || sliceX < 0 || sliceY < 0 || sliceX % 8 || sliceY % 8) return count + 1;
    const parts = tileWidth <= 128 && tileHeight <= 128 ? decomposeGbaMetaspriteFrame(tileWidth, tileHeight) : [];
    const contiguous = parts.length > 0 && parts.every(part => backing.some(block => (
      block.x === sliceX + part.x && block.y === sliceY + part.y && block.width === part.width && block.height === part.height
    )));
    return count + (contiguous ? parts.length : (tileWidth / 8) * (tileHeight / 8));
  }, 0);
}

export function decomposeGbaMetaspriteFrame(width: number, height: number): GbaMetaspriteLayoutPart[] {
  const key = `${width}x${height}`;
  const cached = layoutCache.get(key);
  if (cached) return cached.map(part => ({ ...part }));
  const tilesWide = width / 8;
  const tilesHigh = height / 8;
  const costs = Array.from({ length: tilesWide + 1 }, () => Array<number>(tilesHigh + 1).fill(Number.POSITIVE_INFINITY));
  const choices = Array.from({ length: tilesWide + 1 }, () => Array<GbaMetaspriteLayoutChoice | null>(tilesHigh + 1).fill(null));
  for (let x = 0; x <= tilesWide; x += 1) costs[x][0] = 0;
  for (let y = 0; y <= tilesHigh; y += 1) costs[0][y] = 0;

  for (let currentWidth = 1; currentWidth <= tilesWide; currentWidth += 1) {
    for (let currentHeight = 1; currentHeight <= tilesHigh; currentHeight += 1) {
      if (gbaObjNativeDimension(currentWidth * 8, currentHeight * 8) !== null) {
        costs[currentWidth][currentHeight] = 1;
        choices[currentWidth][currentHeight] = { kind: "native" };
        continue;
      }
      for (let split = currentWidth - 1; split >= 1; split -= 1) {
        const candidate = costs[split][currentHeight] + costs[currentWidth - split][currentHeight];
        if (candidate < costs[currentWidth][currentHeight]) {
          costs[currentWidth][currentHeight] = candidate;
          choices[currentWidth][currentHeight] = { kind: "vertical", split };
        }
      }
      for (let split = currentHeight - 1; split >= 1; split -= 1) {
        const candidate = costs[currentWidth][split] + costs[currentWidth][currentHeight - split];
        if (candidate < costs[currentWidth][currentHeight]) {
          costs[currentWidth][currentHeight] = candidate;
          choices[currentWidth][currentHeight] = { kind: "horizontal", split };
        }
      }
    }
  }

  const parts: GbaMetaspriteLayoutPart[] = [];
  const appendParts = (partWidth: number, partHeight: number, x: number, y: number): void => {
    const choice = choices[partWidth][partHeight];
    if (!choice) throw new Error(`Nao foi possivel decompor metasprite ${width}x${height}.`);
    if (choice.kind === "native") {
      parts.push({ x: x * 8, y: y * 8, width: partWidth * 8, height: partHeight * 8 });
    } else if (choice.kind === "vertical") {
      appendParts(choice.split, partHeight, x, y);
      appendParts(partWidth - choice.split, partHeight, x + choice.split, y);
    } else {
      appendParts(partWidth, choice.split, x, y);
      appendParts(partWidth, partHeight - choice.split, x, y + choice.split);
    }
  };
  appendParts(tilesWide, tilesHigh, 0, 0);
  if (layoutCache.size >= 64) layoutCache.delete(layoutCache.keys().next().value!);
  layoutCache.set(key, parts.map(part => ({ ...part })));
  return parts;
}
