const playerSheets = new Set(['porto-nara-animations48.png', 'nara-topdown-walk-run-v1.png']);

function widenStairLanding(sequence, width) {
  if (!sequence) return sequence;
  const compact = !Array.isArray(sequence);
  const cells = compact ? sequence.runs.flatMap(([value, count]) => Array(count).fill(value)) : [...sequence];
  // The first bend has visible floor inside this 8px fringe. Keep the cliff
  // outside it solid; the lower flights still follow the approved winding stairs.
  for (const y of [24, 25]) cells[y * width + 23] = 'free';
  if (!compact) return cells;
  const runs = [];
  for (const cell of cells) {
    const last = runs.at(-1);
    if (last?.[0] === cell) last[1]++;
    else runs.push([cell, 1]);
  }
  return { ...sequence, runs };
}

/** Refine physical controls without moving or redrawing the approved art. */
export function refineExampleTopdownMovement(source) {
  const p = structuredClone(source);
  p.settings.topdown = { ...p.settings.topdown, movementType: '8 direcoes', allowDiagonal: true, normalizeDiagonal: true, directionalAnimation: '4-way animation' };
  for (const animation of p.animations) if (playerSheets.has(animation.spriteSheet))
    Object.assign(animation, { hitboxX: 0, hitboxY: 0, hitboxWidth: 16, hitboxHeight: 8 });
  const update = r => {
    if (r.name !== 'porto_lumen' || r.width !== 126 || r.height !== 86) return r;
    return { ...r, collisions: widenStairLanding(r.collisions, r.width), collisionTypes: widenStairLanding(r.collisionTypes, r.width) };
  };
  for (const key of ['rooms', 'scenas']) p[key] = p[key].map(update);
  if (p.scena) p.scena = update(p.scena);
  return p;
}
