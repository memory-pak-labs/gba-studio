// Background-only follow-up; approved actor pixels and animation data stay intact.
export const PLATFORMER_V8_BG = 'penedos-platformer-v8.png';
function replaceTileSourceAssetNames(value) {
  if (Array.isArray(value)) return value.map(() => PLATFORMER_V8_BG);
  if (value?.encoding === 'rle-v1' && Array.isArray(value.runs)) {
    return {
      ...value,
      runs: value.runs.map(([, count]) => [PLATFORMER_V8_BG, count])
    };
  }
  throw new TypeError('Formato de tileSourceAssetNames nao suportado');
}
export function promotePlatformerV8(project) {
  const next = structuredClone(project);
  const scene = next.scenas?.find(s => s.name === 'penedos_vento');
  if (!scene) return next;
  const cells = Array(161 * 20).fill('free');
  for (let x = 0; x < 161; x++) {
    if ((x >= 56 && x < 59) || (x >= 105 && x < 110)) {
      cells[19 * 161 + x] = 'damage'; continue;
    }
    let top = 16;
    if (x >= 20 && x < 29) top = 16 - Math.floor((x - 20) / 2);
    if (x >= 29 && x < 33) top = 11;
    if (x >= 33 && x < 39) top = 12 + Math.floor((x - 33) * 4 / 6);
    if (x >= 80 && x < 90) top = 12;
    if (x >= 139) cells[16 * 161 + x] = 'down';
    else for (let y = top; y < 20; y++) cells[y * 161 + x] = 'solid';
  }
  for (let y = 6; y < 16; y++) cells[y * 161 + 137] = 'ladder';
  const update = s => s.name !== 'penedos_vento' ? s : ({...s,
    backgroundAssetName: PLATFORMER_V8_BG, runtimeBaseBackgroundAssetName: PLATFORMER_V8_BG,
    runtimeCompositeBackgroundAssetName: PLATFORMER_V8_BG,
    collisions: [...cells], collisionTypes: [...cells],
    tileLayers: s.tileLayers.map(layer => ({...layer,
      tileSourceAssetNames: replaceTileSourceAssetNames(layer.tileSourceAssetNames)})),
    platformerVisualRevision: 'porto-lume-v8-approved',
    visualPromotionStatus: 'canonical-integrated'
  });
  next.scenas = next.scenas.map(update);
  next.rooms = next.rooms?.map(update);
  if (next.scena) next.scena = update(next.scena);
  // Raise only the rock's collision box to the revised block surface (y=96).
  next.actors = next.actors.map(a => a.id === 'penedos-rock' ? {...a, y: 10} : a);
  const old = next.assets.find(a => a.name === PLATFORMER_V8_BG);
  const metadata = {...old?.metadata, source: 'Assets/backgrounds/' + PLATFORMER_V8_BG,
    width: 1288, height: 160, reviewStatus: 'approved', visualStatus: 'approved',
    candidateStatus: 'canonical-integrated',
    assetcStatus: 'attention', role: 'platformer-full-scene', sceneRoles: ['platformer-full-scene', 'platformer-surfaces', 'cliff-tiles'],
    backgroundPaletteBankBudget: 16, backgroundTileOptimizer: {enabled: true, tileBudget: 895},
    sourcePreparation: 'Approved v8 review PNG; RGB pixels preserved, no quantization at import',
    runtimeValidationNote: 'Pending joint BG/OBJ pack and framebuffer review; visual approval is for source only'};
  next.assets = [...next.assets.filter(a => a.name !== PLATFORMER_V8_BG),
    {id: 'penedos-platformer-v8', name: PLATFORMER_V8_BG, kind: 'Background', systemImage: 'figure.run', metadata}];
  const actorSheets = new Set(next.actors.filter(a => a.roomName === 'penedos_vento').map(a => a.spriteSheet));
  next.assets = next.assets.map(a => actorSheets.has(a.name) ? {...a, metadata: {...a.metadata,
    reviewStatus: 'approved', visualStatus: 'approved', candidateStatus: 'canonical-integrated',
    approvalScope: 'Existing actor appearance and scale explicitly accepted unchanged with platformer v8'
  }} : a);
  return next;
}
