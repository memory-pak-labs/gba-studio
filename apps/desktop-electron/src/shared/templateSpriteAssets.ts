export interface TemplateSpriteAnimationSpec {
  name: string;
  state: string;
  direction: string;
  fps: number;
  loops: boolean;
  frameCount: number;
  sourceFrameIndexes?: number[];
}

export function bundledTemplateSpriteAsset(
  id: string,
  name: string,
  bundledDefaultAsset: string
): Record<string, unknown> {
  return {
    id,
    name,
    kind: "Sprite",
    systemImage: "photo.stack",
    metadata: {
      source: `Assets/sprites/${name}`,
      bundledDefaultAsset
    }
  };
}

export function horizontalTemplateSpriteAnimations(
  spriteSheet: string,
  frameWidth: number,
  frameHeight: number,
  specs: TemplateSpriteAnimationSpec[]
): Record<string, unknown>[] {
  let sheetFrameIndex = 0;
  const sheetId = spriteSheet
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  return specs.map((spec) => {
    const defaultOriginX = Math.max(0, Math.floor(frameWidth / 2) - 8);
    const sourceFrameIndexes = spec.sourceFrameIndexes
      ?? Array.from({ length: spec.frameCount }, (_value, animationFrameIndex) => sheetFrameIndex + animationFrameIndex);
    sheetFrameIndex += spec.frameCount;
    const frames = Array.from({ length: spec.frameCount }, (_value, animationFrameIndex) => {
      const sliceX = (sourceFrameIndexes[animationFrameIndex] ?? 0) * frameWidth;
      return {
        frameIndex: animationFrameIndex,
        width: frameWidth,
        height: frameHeight,
        originX: 0,
        originY: 0,
        tiles: [{
          x: -defaultOriginX,
          y: 0,
          sliceX,
          sliceY: 0,
          sourceSheet: spriteSheet,
          tileWidth: frameWidth,
          tileHeight: frameHeight,
          paletteIndex: 0,
          objPalette: "OBP0",
          priority: false,
          flipX: false,
          flipY: false
        }]
      };
    });
    return {
      id: `animation-${sheetId}-${spec.name.replace(/_/g, "-")}`,
      name: spec.name,
      state: spec.state,
      direction: spec.direction,
      fps: spec.fps,
      loops: spec.loops,
      frameCount: spec.frameCount,
      frameWidth,
      frameHeight,
      originX: 0,
      originY: 0,
      colorMode: "4bpp",
      spriteSheet,
      frames
    };
  });
}
