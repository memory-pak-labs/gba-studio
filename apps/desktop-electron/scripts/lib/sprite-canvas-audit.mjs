const baseX = width => Math.max(0, Math.floor(width / 2) - 8);

function implicitFrameTiles(animation, frameIndex) {
  const width = animation.frameWidth;
  const height = animation.frameHeight;
  const tiles = [];
  // Native 32px blocks plus 16/8px edges keep 48px portraits below the OBJ limit.
  for (let sy = 0; sy < height;) {
    const h = Math.min(32, height - sy);
    for (let sx = 0; sx < width;) {
      const w = Math.min(32, width - sx);
      tiles.push({ x: sx - baseX(width), y: height - sy - h,
        sliceX: frameIndex * width + sx, sliceY: sy, tileWidth: w, tileHeight: h,
        sourceSheet: animation.spriteSheet, flipX: false, flipY: false,
        objPalette: "OBP0", paletteIndex: 0, priority: false });
      sx += w;
    }
    sy += h;
  }
  return tiles;
}

function usesCompleteTopDownSourceLayout(tiles, width, height) {
  if (tiles.length < 2) return false;
  const sx = Math.min(...tiles.map(t => t.sliceX));
  const sy = Math.min(...tiles.map(t => t.sliceY));
  const dx = tiles[0].x - (tiles[0].sliceX - sx);
  if (!tiles.every(t => t.x === t.sliceX - sx + dx && t.y === t.sliceY - sy)) return false;
  if (tiles.reduce((sum, t) => sum + t.tileWidth * t.tileHeight, 0) !== width * height) return false;
  if (!tiles.every(t => t.sliceX - sx + t.tileWidth <= width && t.sliceY - sy + t.tileHeight <= height)) return false;
  return tiles.every((a, i) => tiles.slice(i + 1).every(b =>
    a.sliceX + a.tileWidth <= b.sliceX || b.sliceX + b.tileWidth <= a.sliceX
    || a.sliceY + a.tileHeight <= b.sliceY || b.sliceY + b.tileHeight <= a.sliceY));
}

/** Fit authored compositions as a unit; preserve tile.x - frame.originX (runtime placement). */
export function fitProjectSpriteFrames(project) {
  const next = structuredClone(project);
  for (const animation of next.animations ?? []) {
    // An explicit empty frame is intentional. Missing frames use the exporter backing layout.
    if (!Array.isArray(animation.frames)) {
      animation.frames = Array.from({ length: animation.frameCount ?? 1 }, (_, frameIndex) => ({
        frameIndex, width: animation.frameWidth, height: animation.frameHeight,
        originX: animation.originX ?? 0, originY: animation.originY ?? 0,
        tiles: implicitFrameTiles(animation, frameIndex)
      }));
    }
    for (const frame of animation.frames) {
      const tiles = frame.tiles ?? [];
      if (!tiles.length) continue;
      const width = frame.width ?? animation.frameWidth;
      const height = frame.height ?? animation.frameHeight;
      if (usesCompleteTopDownSourceLayout(tiles, width, height)) {
        const sy = Math.min(...tiles.map(t => t.sliceY));
        for (const tile of tiles) tile.y = height - (tile.sliceY - sy) - tile.tileHeight;
      }
      const left = Math.min(...tiles.map(t => baseX(width) + t.x));
      const right = Math.max(...tiles.map(t => baseX(width) + t.x + t.tileWidth));
      if (right - left > width) throw new Error(`Composition wider than canvas: ${animation.id}`);
      const shift = left < 0 ? -left : right > width ? width - right : 0;
      if (shift) {
        for (const tile of tiles) tile.x += shift;
        frame.originX = (frame.originX ?? animation.originX ?? 0) + shift;
      }
    }
  }
  return next;
}

export function auditProjectSpriteFrames(project) {
  const rows = [];
  for (const asset of project.assets ?? []) {
    if (asset.kind !== "Sprite") continue;
    const animations = (project.animations ?? []).filter(a => a.spriteSheet === asset.name);
    const row = { sheet: asset.name, animations: animations.length, frames: 0, missingFrames: 0, clippedFrames: 0 };
    for (const animation of animations) {
      row.missingFrames += Math.max(0, (animation.frameCount ?? 1) - (animation.frames?.length ?? 0));
      for (const frame of animation.frames ?? []) {
        row.frames++;
        const width = frame.width ?? animation.frameWidth;
        const height = frame.height ?? animation.frameHeight;
        if ((frame.tiles ?? []).some(t => baseX(width) + t.x < 0 || baseX(width) + t.x + t.tileWidth > width
          || height - t.y - t.tileHeight < 0 || height - t.y > height)) row.clippedFrames++;
      }
    }
    rows.push(row);
  }
  return rows;
}
