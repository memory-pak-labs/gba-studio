import {
  buildMarketCandidateLayers,
  createMarketCompositionV2Candidate
} from './lib/market-composition-v2.mjs';

/** Lossless tile placement contract. Coordinates are pixels, not map cells. */
export function splitModuleIntoTiles(crop, anchor) {
  if (![crop.x,crop.y,crop.width,crop.height].every(v=>Number.isInteger(v)&&v>=0&&v%8===0)
      || crop.width===0 || crop.height===0) throw new Error('Module crop must align to 8x8 tiles');
  if (![anchor.x,anchor.y].every(Number.isInteger)) throw new Error('Anchor must use integer pixels');
  const parts=[];
  for(let y=0;y<crop.height;y+=8) for(let x=0;x<crop.width;x+=8) {
    parts.push({sourceX:crop.x+x,sourceY:crop.y+y,x:x-anchor.x,y:y-anchor.y,width:8,height:8});
  }
  return parts;
}

/** Editable world specification, separate from any rasterized background. */
export function createMarketComposition() {
  return { ...createMarketCompositionV2Candidate(), status: 'runtime-integrated' };
}

/** Apply only the market's authored data; campaign events remain intact. */
export function applyMarketComposition(project, {
  preparedSha256,
  reviewStatus,
  sourceSha256,
  supersededAssetNames = []
} = {}) {
  const result = structuredClone(project);
  const c = createMarketComposition();
  const name = 'mercado_suspenso';
  const assetName = 'mercado-suspenso-modules-v5.png';
  const existingAsset = result.assets.find(asset => asset.name === assetName);
  const existingMetadata = existingAsset?.metadata && typeof existingAsset.metadata === 'object'
    ? existingAsset.metadata
    : {};
  const resolvedPreparedSha256 = preparedSha256 ?? existingMetadata.preparedSha256;
  const resolvedReviewStatus = reviewStatus ?? existingMetadata.reviewStatus ?? 'candidate';
  const resolvedSourceSha256 = sourceSha256 ?? existingMetadata.sourceSha256;
  const { floor, foreground, heightLevels, collisions } = buildMarketCandidateLayers(c);
  // Cliff faces belong to the terrain: all walkable cells are on top of them.
  // Keeping them in BG1 hides actors on the rim and on the stairs.
  for (let index = 0; index < foreground.length; index++) {
    if (foreground[index] === 5 || foreground[index] === 6) {
      floor[index] = foreground[index];
      foreground[index] = 0;
    }
  }
  // A walkable bridge is a deck under the actors, not a foreground obstacle.
  // The current atlas combines deck/posts; a future split rail asset can add occlusion.
  for (const prop of c.props.filter(prop => prop.module === 'bridge')) {
    const index = prop.y * c.width + prop.x;
    floor[index] = foreground[index];
    foreground[index] = 0;
  }
  const update = scene => scene.name !== name ? scene : {
    ...scene, width: c.width, height: c.height,
    tilesetAssetName: assetName, backgroundAssetName: assetName,
    backgroundRenderMode: 'tilemap', gbStudioUseBackgroundLayout: false,
    paletteFamilyID: null, cameraMode: 'follow_player', cameraZones: [],
    cameraBounds: { x: 0, y: 0, width: c.width, height: c.height },
    tilemap: floor, collisions, collisionTypes: collisions,
    heightLevels,
    tileLayers: ['BG3','BG2','BG1','BG0'].map(mapping => ({
      mapping, name: mapping, tilesetAssetName: assetName,
      tileSourceAssetNames: Array(floor.length).fill(assetName),
      tilemap: mapping === 'BG2' ? floor : mapping === 'BG1' ? foreground : Array(floor.length).fill(0)
    })),
    runtime: { ...scene.runtime, type: 'isometric', config: {
      ...scene.runtime?.config, ...c.grid, originX: 120, originY: 24,
      gameplayMode: 'adventure', movement: 'free', projection: 'diamond',
      heightMode: 'levels', worldMode: 'scrollable_tiled_world', presentationZoom: 100
    }}
  };
  result.rooms = result.rooms.map(update);
  result.scenas = result.scenas.map(update);
  for (const actor of result.actors) {
    if (actor.id === 'market-nara') Object.assign(actor, { x: 10, y: 12, z: 0 });
    if (actor.id === 'market-trader-v2') Object.assign(actor, { x: 10, y: 9, z: 0 });
  }
  for (const trigger of result.triggers) {
    if (trigger.id === 'trigger-market-bridge') Object.assign(trigger, { x: 15, y: 12, width: 1, height: 1 });
    if (trigger.id === 'trigger-market-exit') Object.assign(trigger, { x: 19, y: 6, width: 1, height: 1 });
  }
  for (const connection of result.editorState?.scenaConnections ?? []) {
    if (connection.to === name) connection.entry = {
      x: 18, y: connection.eventName === 'arena_tatica_sair' ? 7 : 13, width: 1, height: 1
    };
  }
  const superseded = new Set(supersededAssetNames);
  const promotedAsset = { id: 'market-modules-v5', name: assetName, kind: 'Tileset', metadata: {
    ...existingMetadata,
    source: `Assets/backgrounds/${assetName}`, tileWidth: 32, tileHeight: 16,
    atlasTileWidth: 64, atlasTileHeight: 64, atlasColumns: 4, atlasRows: 4,
    atlasRenderOffsetY: -35, colorMode: '8bpp-indexed', kind: 'indexed_bg', transparentIndex: 0,
    ...(resolvedSourceSha256 ? { sourceSha256: resolvedSourceSha256 } : {}),
    ...(resolvedPreparedSha256 ? { preparedSha256: resolvedPreparedSha256 } : {}),
    reviewStatus: resolvedReviewStatus,
    provenance: 'Atlas modular nativo revisado; composição do Mercado Suspenso aprovada para integração no runtime'
  }};
  let replaced = false;
  result.assets = result.assets.flatMap(asset => {
    if (asset.name === assetName) {
      if (replaced) return [];
      replaced = true;
      return [promotedAsset];
    }
    return superseded.has(asset.name) ? [] : [asset];
  });
  if (!replaced) result.assets.push(promotedAsset);
  return result;
}
