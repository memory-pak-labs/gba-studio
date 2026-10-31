import { readFileSync } from 'node:fs';

const sheet = 'porto-nara-animations48.png';
const provenance = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/porto-lumen-animations48.json', import.meta.url)));

/** Reapply only the approved Nara walk contract after template regeneration. */
export function integrateApprovedPlayerWalk(source) {
  const p = structuredClone(source);
  const asset = p.assets.find(a => a.name === sheet);
  // Newer campaigns use the separately approved walk-and-run sheet instead.
  if (!asset) return p;
  for (const animation of p.animations) {
    if (animation.spriteSheet !== sheet || animation.state !== 'walk') continue;
    const row = ['down', 'up', 'left', 'right'].indexOf(animation.direction);
    if (row < 0) continue;
    animation.fps = 15; // Four authored ticks/pixels per pose; four poses per stride.
    animation.frameCount = 4;
    animation.frames = Array.from({ length: 4 }, (_, i) => ({
      ...structuredClone(animation.frames[i]), frameIndex: i, sourceFrameIndex: row * 5 + i + 1,
      tiles: animation.frames[i].tiles.map(tile => ({
        ...tile, sliceX: (i + 1) * 32, sliceY: row * 48 + (tile.tileHeight === 16 ? 32 : 0),
        flipX: false, flipY: false
      }))
    }));
  }
  Object.assign(asset.metadata, {
    preparedSha256: provenance.sourceSheets.find(a => a.name === sheet).sha256,
    walkRevision: 'v3-lateral-v2-front-back',
    provenance: 'Caminhada aprovada: frente/costas V2 e laterais V3; quatro tempos; paleta OBJ original preservada.'
  });
  return p;
}
