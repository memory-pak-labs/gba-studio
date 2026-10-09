import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildArenaV5 } from '../fixtures/asset-provenance/tactical-v5/materialize-scene.mjs';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.ts';
import { auditProjectSpriteFrames } from './lib/sprite-canvas-audit.mjs';
import { decodePngRgba } from './lib/png-icons.mjs';

const source = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));
const approved = buildArenaV5(source);
const actors = project => project.actors.filter(a => a.roomName === 'arena_tatica');
const animation = project => project.animations.filter(a => /tactical-(nara|sentinel)-v5\.png/.test(a.spriteSheet));
// Canvas fitting may move tiles and their origin together; runtime placement must stay exact.
const footPlacement = project => animation(project).map(a => ({
  ...a,
  frames: a.frames.map(frame => ({
    ...frame,
    originX: 0,
    tiles: frame.tiles.map(tile => ({ ...tile, x: tile.x - (frame.originX ?? a.originX ?? 0) }))
  }))
}));

describe('approved Arena V5 reconstruction', () => {
  it('preserves the exact approved PNG files in the canonical template', () => {
    const assets = [
      ['backgrounds','tactical-v5-surface.png','tactical-v5/prepared/background-13banks.png'],
      ['ui','tactical-v5-hud.png','tactical-v5/hud/tactical-v5-hud.png'],
      ...['nara','sentinel'].map(who => ['sprites',`tactical-${who}-v5.png`,`tactical-v5/hurt-v2/tactical-${who}-v5.png`])
    ];
    for (const [folder,name,path] of assets) {
      const bytes = readFileSync(new URL(`../default-assets/templates/exemplo-gba/Assets/${folder}/${name}`,import.meta.url));
      const prepared = readFileSync(new URL(`../fixtures/asset-provenance/${path}`,import.meta.url));
      const sha = createHash('sha256').update(bytes).digest('hex');
      expect(bytes.equals(prepared), name).toBe(true);
      expect(source.assets.find(a => a.name === name)?.metadata).toMatchObject({preparedSha256:sha,reviewStatus:'approved',visualStatus:'approved',technicalStatus:'scene-verified'});
    }
  });
  it('limits the approved hurt revision to the second frame in each direction', () => {
    const secondFrameColumns = [432, 1776, 1104, 2448]; // left, up, right, down in the approved V5 layout
    for (const who of ['nara', 'sentinel']) {
      const name = `tactical-${who}-v5.png`;
      const previous = decodePngRgba(readFileSync(new URL(`../fixtures/asset-provenance/tactical-v5/packed-final/${who}/${name}`, import.meta.url)));
      const current = decodePngRgba(readFileSync(new URL(`../default-assets/templates/exemplo-gba/Assets/sprites/${name}`, import.meta.url)));
      expect([current.width, current.height]).toEqual([previous.width, previous.height]);
      let outsideChanged = 0;
      const changedPerDirection = [0, 0, 0, 0];
      for (let y = 0; y < current.height; y++) {
        for (let x = 0; x < current.width; x++) {
          const offset = (y * current.width + x) * 4;
          if (current.pixels.subarray(offset, offset + 4).equals(previous.pixels.subarray(offset, offset + 4))) continue;
          const direction = secondFrameColumns.findIndex(left => x >= left && x < left + 48 && y < 40);
          if (direction < 0) outsideChanged++;
          else changedPerDirection[direction]++;
        }
      }
      expect(outsideChanged, `${name}: first hurt frames and other animations`).toBe(0);
      expect(changedPerDirection.every(count => count > 0), `${name}: four distinct second hurt frames`).toBe(true);
    }
  });
  it('preserves the current approved hurt provenance and placement when rebuilding the showcase', () => {
    const rebuilt = promoteExemploGBAVerticeCampaign(source);
    for (const who of ['nara', 'sentinel']) {
      const name = `tactical-${who}-v5.png`;
      expect(rebuilt.assets.find(asset => asset.name === name)).toEqual(source.assets.find(asset => asset.name === name));
    }
    expect(footPlacement(rebuilt)).toEqual(footPlacement(source));
  });
  it('changes only the Arena scene, its actors, assets, animations and incoming spawn', () => {
    expect(approved.rooms).toHaveLength(source.rooms.length);
    expect(approved.rooms.filter(r => r.name !== 'arena_tatica')).toEqual(source.rooms.filter(r => r.name !== 'arena_tatica'));
    expect(approved.actors.filter(a => a.roomName !== 'arena_tatica')).toEqual(source.actors.filter(a => a.roomName !== 'arena_tatica'));
    for (const key of Object.keys(source).filter(k => !['rooms','scenas','actors','assets','animations','animationStates','events','editorState'].includes(k))) {
      expect(approved[key], key).toEqual(source[key]);
    }
    expect(buildArenaV5(approved)).toEqual(approved);
    const preparedPlan = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/tactical-v5/review/background-palette.json', import.meta.url)));
    expect(approved.assets.find(a => a.name === 'tactical-v5-surface.png').metadata.backgroundPaletteReferencePlan)
      .toEqual({banks: preparedPlan.banks, tile_palette_banks: preparedPlan.tile_palette_banks});
  });

  it('retains the approved board, heights, collision and foot origin when rebuilding', () => {
    const rebuilt = promoteExemploGBAVerticeCampaign(approved);
    const before = approved.rooms.find(r => r.name === 'arena_tatica');
    const after = rebuilt.rooms.find(r => r.name === 'arena_tatica');
    for (const key of ['width','height','backgroundAssetName','tilesetAssetName','tilemap','collisions','collisionTypes','heightLevels','runtime','cameraBounds']) {
      expect(after[key], key).toEqual(before[key]);
    }
    expect(actors(rebuilt)).toEqual(actors(approved));
    expect(footPlacement(rebuilt)).toEqual(footPlacement(approved));
    const canvasAudit = auditProjectSpriteFrames(rebuilt)
      .filter(row => /tactical-(nara|sentinel)-v5\.png/.test(row.sheet));
    expect(canvasAudit).toHaveLength(2);
    for (const row of canvasAudit) {
      expect(row.frames).toBeGreaterThan(0);
      expect(row.missingFrames).toBe(0);
      expect(row.clippedFrames).toBe(0);
    }
    expect(rebuilt.assets.filter(a => a.metadata?.generatedBy === 'isometric-arena-v5')).toHaveLength(4);
    expect(rebuilt.assets.find(a => a.name === 'tactical-v5-surface.png').metadata.backgroundPaletteReferencePlan)
      .toEqual(approved.assets.find(a => a.name === 'tactical-v5-surface.png').metadata.backgroundPaletteReferencePlan);
    expect(after.runtime.config).toMatchObject({originX:120,originY:40,tileWidth:32,tileHeight:16,heightStep:8});
    expect(after).toEqual(rebuilt.scenas.find(r => r.name === 'arena_tatica'));
  });

  it('keeps the incoming event and connection inside the six by six board', () => {
    const rebuilt = promoteExemploGBAVerticeCampaign(approved);
    expect(rebuilt.events.find(e => e.name === 'mercado_entrar_arena').steps.map(s => s.command))
      .toContain('change_scene arena_tatica 1 4 right');
    expect(rebuilt.editorState.scenaConnections.find(c => c.eventName === 'mercado_entrar_arena').entry)
      .toEqual({x:1,y:4,width:1,height:1});
  });

  it('exports the approved V5 scene with animated units and matching surface', () => {
    const contract = buildEngineExportProjectContract(approved);
    const arena = contract.isometric_project.rooms.find(r => r.name === 'arena_tatica');
    expect(arena).toMatchObject({width_tiles:6,height_tiles:6});
    expect(animation(approved)).toHaveLength(40);
    expect(animation(approved).every(a => a.originX === 24 && a.originY === 40)).toBe(true);
  });
});
