// Single geometry source for assembly, collision, entry points and QA.
export const arenaBlueprint = {
  width: 6, height: 6,
  tileWidth: 32, tileHeight: 16, heightStep: 8, originX: 120, originY: 40,
  viewport: { width: 240, height: 160 },
  hud: { top: [0, 0, 240, 20], bottom: [0, 140, 240, 20] },
  spawn: { x: 1, y: 4, z: 0 }, enemy: { x: 4, y: 1, z: 1 },
  stairs: { x: 3, y: 2, type: 'slope_up_right' },
  props: [
    { x: 0, y: 0, module: 'banner' }, { x: 2, y: 0, module: 'pillar' },
    { x: 4, y: 0, module: 'banner' }, { x: 5, y: 0, module: 'pillar' },
    { x: 0, y: 2, module: 'pillar' }, { x: 0, y: 4, module: 'banner' },
    { x: 0, y: 5, module: 'pillar' }
  ]
};
export function arenaHeight(x, y) { return x >= 3 && y <= 2 ? 1 : 0; }
export function arenaCell(x, y) {
  if (x === 0 || y === 0) return 'solid';
  return x === 3 && y === 2 ? 'slope_up_right' : 'free';
}
export function arenaPoint(x, y, z = arenaHeight(x, y)) {
  return { x: arenaBlueprint.originX + (x-y)*16, y: arenaBlueprint.originY + (x+y)*8-z*8 };
}
export const arenaCells = Array.from({ length: 36 }, (_, i) => ({
  x:i%6, y:Math.floor(i/6), z:arenaHeight(i%6,Math.floor(i/6)),
  collision:arenaCell(i%6,Math.floor(i/6))
}));
