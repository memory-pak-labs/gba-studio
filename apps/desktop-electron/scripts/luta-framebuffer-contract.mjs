/** Screen-space rectangles read from the emulator, including modular HUD OBJ. */
export function resolveLutaNativeFramebufferMasks(nativeVideo) {
  if (!Array.isArray(nativeVideo?.objects)) throw new Error('Native luta OAM unavailable');
  return nativeVideo.objects.map(({x,y,width,height})=>{
    if (![x,y,width,height].every(Number.isFinite)||width<=0||height<=0) throw new Error('Invalid native luta OAM');
    return {x,y,width,height};
  });
}

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
