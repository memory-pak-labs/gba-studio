import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseGBAProjectFile, validateGBAProjectMigrationContract } from '../../../packages/project-contract/src/index.ts';
import { applyMarketComposition, createMarketComposition, splitModuleIntoTiles } from './market-suspenso-composition.mjs';
import { expandProjectTilemaps } from '../src/shared/projectResourceFormat.ts';
import { promoteMarketAdventure, MARKET_SURFACE, MARKET_FRONT, MARKET_POINTS } from './market-adventure-promotion.mjs';

describe('Market modular composition', () => {
  it('keeps the approved continuous adventure composition materialized in the canonical project', () => {
    const source = readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url), 'utf8');
    const project = expandProjectTilemaps(parseGBAProjectFile(source).data);
    const promoted = promoteMarketAdventure(project);
    expect(promoted.rooms.find((room) => room.name === 'mercado_suspenso')).toEqual(
      project.rooms.find((room) => room.name === 'mercado_suspenso')
    );
    const scene = project.scenas.find((room) => room.name === 'mercado_suspenso');
    expect(scene).toMatchObject({ width: 36, height: 36, backgroundAssetName: MARKET_SURFACE, tilesetAssetName: MARKET_SURFACE,
      runtime: { config: { gameplayMode: 'adventure', movement: 'free', pagedSurface: { backgroundAsset: MARKET_SURFACE, foregroundAsset: MARKET_FRONT, width: 512, height: 344 } } } });
    expect(scene.tileLayers).toEqual([]);
    expect(scene.collisionTypes).toHaveLength(36 * 36);
    expect(JSON.parse(source).scenas.find((room) => room.name === 'mercado_suspenso')).not.toHaveProperty('collisions');
    expect(project.triggers.find((trigger) => trigger.id === 'trigger-market-bridge')).toMatchObject({ x: 28, y: 22 });
    expect(project.triggers.find((trigger) => trigger.id === 'trigger-market-exit')).toMatchObject({ x: 27, y: 12 });
  });
  it('keeps the approved surface and trader landmark aligned in the canonical project', () => {
    const project = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url), 'utf8'));
    const trader = project.actors.find(actor => actor.id === 'market-trader-v2');
    const surface = project.assets.find(asset => asset.name === MARKET_SURFACE);
    const png = readFileSync(new URL(`../default-assets/templates/exemplo-gba/Assets/backgrounds/${MARKET_SURFACE}`, import.meta.url));
    expect([trader.x, trader.y]).toEqual(MARKET_POINTS.merchant);
    expect(trader.eventBindings.onInteract).toBe('mercado_falar_mercador');
    expect(surface.metadata.reviewStatus).toBe('approved');
    expect(createHash('sha256').update(png).digest('hex')).toBe('cb4944b1b5f9d0837908711db5c743b5a23ff5c6ca9e505c5114d495b8808255');
  });
  it('keeps the complete project export contract valid', () => {
    const project = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url), 'utf8'));
    expect(validateGBAProjectMigrationContract(project)).toEqual([]);
  });
  it('materializes both scene collections without changing other scenes or event bindings', () => {
    const market = { name: 'mercado_suspenso', eventBindings: { onEnter: 'enter' } };
    const other = { name: 'other', width: 9 };
    const trader = { id: 'market-trader-v2', roomName: market.name, eventBindings: { onInteract: 'mercado_falar_mercador' } };
    const input = { rooms: [market, other], scenas: [market, other], actors: [{ id: 'market-nara', roomName: market.name }, trader], triggers: [], assets: [] };
    const result = applyMarketComposition(input);
    expect(input.rooms[0]).toEqual(market);
    expect(result.rooms[1]).toEqual(other);
    expect(result.rooms[0]).toEqual(result.scenas[0]);
    expect(result.rooms[0].eventBindings).toEqual(market.eventBindings);
    expect(result.rooms[0].tilemap).toHaveLength(625);
    const foreground = result.rooms[0].tileLayers.find((layer) => layer.mapping === 'BG1').tilemap;
    expect(result.rooms[0].tilemap.filter((tile) => tile === 5).length).toBeGreaterThan(0);
    expect(result.rooms[0].tilemap.filter((tile) => tile === 6).length).toBeGreaterThan(0);
    expect(result.rooms[0].heightLevels.some((level, index) => result.rooms[0].tilemap[index] === 6 && level === 2)).toBe(true);
    expect(result.rooms[0].runtime.config.gameplayMode).toBe('adventure');
    expect(result.assets[0].metadata.atlasRenderOffsetY).toBe(-35);
    expect(result.assets[0].metadata.reviewStatus).toBe('candidate');
    expect(result.actors.find(actor => actor.id === trader.id)).toMatchObject({
      x: 10, y: 9, eventBindings: trader.eventBindings
    });
  });
  it('records an approved composition without retaining the superseded tileset record', () => {
    const market = { name: 'mercado_suspenso', runtime: { type: 'isometric', config: {} } };
    const result = applyMarketComposition({
      rooms: [market], scenas: [market], actors: [], triggers: [],
      assets: [{ id: 'legacy-market-tileset', name: 'mercado-suspenso-tileset-v4-gba.png' }]
    }, {
      preparedSha256: 'prepared-hash',
      reviewStatus: 'approved',
      sourceSha256: 'source-hash',
      supersededAssetNames: ['mercado-suspenso-tileset-v4-gba.png']
    });

    expect(result.assets.find((asset) => asset.name === 'mercado-suspenso-tileset-v4-gba.png')).toBeUndefined();
    expect(result.assets.find((asset) => asset.name === 'mercado-suspenso-modules-v5.png')).toMatchObject({
      metadata: {
        preparedSha256: 'prepared-hash',
        reviewStatus: 'approved',
        sourceSha256: 'source-hash'
      }
    });
  });
  it('covers every source pixel exactly once without scaling a large prop', () => {
    const parts = splitModuleIntoTiles({ x: 16, y: 32, width: 48, height: 48 }, { x: 24, y: 48 });
    expect(parts).toHaveLength(36);
    const pixels = new Set();
    for (const p of parts) for (let y=0;y<8;y++) for(let x=0;x<8;x++) {
      const key = `${p.sourceX+x},${p.sourceY+y}`;
      expect(pixels.has(key)).toBe(false);
      pixels.add(key);
      expect(p.x+x+24).toBe(p.sourceX+x-16);
      expect(p.y+y+48).toBe(p.sourceY+y-32);
    }
    expect(pixels.size).toBe(48*48);
  });
  it('rejects non tile-aligned crops rather than silently cutting them', () => {
    expect(() => splitModuleIntoTiles({x:0,y:0,width:47,height:48},{x:24,y:48})).toThrow();
  });
  it('connects the entrance, plaza, side landing and raised terrace', () => {
    const c = createMarketComposition();
    const seen = new Set([c.spawn.y*c.width+c.spawn.x]);
    const queue = [...seen];
    while(queue.length) {
      const cell=queue.shift(), x=cell%c.width,y=Math.floor(cell/c.width);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
        const nx=x+dx,ny=y+dy;
        if(nx<0||ny<0||nx>=c.width||ny>=c.height) continue;
        const next=ny*c.width+nx;
        if(c.cells[next].walkable && !seen.has(next)) {
          expect(Math.abs(c.cells[next].height-c.cells[cell].height)).toBeLessThanOrEqual(1);
          seen.add(next);queue.push(next);
        }
      }
    }
    for(const [i,cell] of c.cells.entries()) if(cell.walkable) expect(seen.has(i)).toBe(true);
    for(const target of Object.values(c.landmarks)) expect(seen.has(target.y*c.width+target.x)).toBe(true);
    expect(c.landmarks.trader).toEqual({ x: 10, y: 9 });
  });
});
