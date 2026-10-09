export function resolveLutaFighterFramebufferMasks({ fighters, sourceX = 0, sourceY = 0 } = {}) {
  if (!Array.isArray(fighters)) return [];

  return fighters.flatMap((fighter) => {
    const targetX = Number(fighter?.target?.x);
    const targetY = Number(fighter?.target?.y);
    const width = Number(fighter?.frameWidth);
    const height = Number(fighter?.frameHeight);
    if (![targetX, targetY, width, height].every(Number.isFinite)
      || width <= 0
      || height <= 0) {
      return [];
    }
    return [{
      height,
      width,
      x: targetX - Number(sourceX),
      y: targetY - Number(sourceY)
    }];
  });
}
