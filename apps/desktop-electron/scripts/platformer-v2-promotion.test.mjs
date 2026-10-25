import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, it, expect } from 'vitest';
import { promoteApprovedPlatformer } from './platformer-approved-promotion.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
import { decodePngRgba } from './lib/png-icons.mjs';
import { platformerCameraPosition } from './platformer-viewport-contract.mjs';

const root = new URL('../default-assets/templates/exemplo-gba/', import.meta.url);
const read = name => JSON.parse(readFileSync(new URL(name, root)));
const manifest = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/platformer-approved-manifest.json', import.meta.url)));

describe('Penedos coastal V2 presentation', () => {
  it('keeps the larger playable world, independent BG layers and animated actors through regeneration', () => {
    const source = read('exemplo-gba.gba-project');
    const result = promoteApprovedPlatformer(source);
    const room = result.rooms.find(room => room.name === 'penedos_vento');
    expect(room.platformerVisualRevision).toBe('penedos-v2-faithful');
    expect([room.width, room.height, room.cameraMode]).toEqual([120, 40, 'follow_player']);
    expect(room.tileLayers.map(layer => layer.mapping)).toEqual(['BG3', 'BG2']);
    expect(new Set(room.tileLayers.map(layer => layer.tileSourceAssetNames[0])).size).toBe(2);
    expect(result.actors.filter(actor => actor.roomName === 'penedos_vento')).toHaveLength(9);
    for (const key of ['rooms', 'scenas']) {
      expect(result[key].filter(room => room.name !== 'penedos_vento'))
        .toEqual(source[key].filter(room => room.name !== 'penedos_vento'));
    }
    const exported = buildEngineExportProjectContract(result);
    expect(Object.keys(exported.platformer_project.player.animations).sort())
      .toEqual(['idle', 'walk', 'jump', 'fall', 'climb', 'wall_slide', 'dash', 'glide', 'attack', 'hurt', 'land'].sort());
  });

  it('uses compact native HUD art with live health and token bindings', () => {
    const hud = manifest.hud;
    const life = hud.components.find(component => component.id === 'life-frame');
    const token = hud.components.find(component => component.id === 'money-frame');
    const hearts = hud.components.find(component => component.id === 'hearts');
    const value = hud.components.find(component => component.id === 'coins');
    expect([life.x, life.y, life.width, life.height]).toEqual([16, 6, 40, 16]);
    expect([token.x, token.y, token.width, token.height]).toEqual([184, 6, 40, 16]);
    expect(hearts.valueVariable).toBe('penedos_player_health');
    expect([hearts.valueMaximum, hearts.gauge.width]).toEqual([3, 27]);
    expect([value.valueVariable, value.text, value.textAdvance]).toEqual(['penedos_tokens', '00', 6]);
    expect(hud.components.filter(component => component.asset).every(component => component.pixelPosition)).toBe(true);
    expect(hud.components.filter(component => component.id.endsWith('frame')).every(component => component.asset.startsWith('penedos-v2-'))).toBe(true);
  });

  it('keeps binary terrain alpha, opaque sky, native actor scale and room palette reservations', () => {
    for (const name of ['sky', 'terrain']) {
      const asset = manifest.assets.find(asset => asset.name === `penedos-approved-${name}.png`);
      const bytes = readFileSync(new URL(asset.metadata.source, root));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.metadata.preparedSha256);
      expect(asset.metadata.backgroundPaletteBankBudget).toBe(14);
      expect(asset.metadata.backgroundPaletteReferencePlan.banks.length).toBeLessThanOrEqual(14);
      const image = decodePngRgba(bytes);
      const alpha = Array.from(image.pixels).filter((_, index) => index % 4 === 3);
      expect(alpha.every(value => value === 0 || value === 255)).toBe(true);
      if (name === 'sky') expect(alpha.every(value => value === 255)).toBe(true);
      else expect(alpha.some(value => value === 0)).toBe(true);
    }
    const actor = manifest.assets.find(asset => asset.name === 'penedos-approved-nara.png');
    const image = decodePngRgba(readFileSync(new URL(actor.metadata.source, root)));
    const rows = [];
    for (let y = 0; y < 64; y++) {
      if (Array.from({ length: 64 }, (_, x) => image.pixels[(y * image.width + x) * 4 + 3]).some(Boolean)) rows.push(y);
    }
    expect(rows.at(-1) - rows[0] + 1).toBe(39);
    expect(image.width / 64).toBe(24);
  });

  it('rebuilds the approved opening, central bridge, ladder and checkpoint instead of the old floating platforms', () => {
    const project = promoteApprovedPlatformer(read('exemplo-gba.gba-project'));
    const room = project.rooms.find(room => room.name === manifest.scene);
    const cell = (x, y) => room.collisionTypes[y * room.width + x];
    expect(cell(5, 34)).toBe('solid');
    expect(cell(16, 35)).toBe('down');
    expect(cell(16, 34)).toBe('free');
    expect(cell(16, 37)).toBe('free');
    expect(cell(23, 34)).toBe('solid');
    expect(cell(19, 35)).toBe('free');
    expect(cell(20, 34)).toBe('slope_up_right');
    expect(cell(21, 34)).toBe('slope_up_left');
    expect(cell(27, 36)).toBe('ladder');
    expect(cell(28, 36)).toBe('ladder');
    expect(cell(28, 39)).toBe('down');
    expect(room.cameraZones[0]).toMatchObject({ lockY: true, bounds: { y: 160, height: 160 } });
    const player = project.actors.find(actor => actor.id === 'penedos-player');
    const worker = project.actors.find(actor => actor.id === 'penedos-npc');
    const checkpoint = project.actors.find(actor => actor.id === 'penedos-checkpoint');
    expect([player.x, player.y]).toEqual([8, 34]);
    expect([worker.x, worker.y]).toEqual([3, 34]);
    expect([checkpoint.x, checkpoint.y]).toEqual([27, 30]);
    const exported = buildEngineExportProjectContract(project);
    expect(platformerCameraPosition(exported.platformer_project.rooms[0], { player: { x: 56, y: 248 } }).y).toBe(160);
    const commands = project.events.find(event => event.name === 'penedos_teste_queda').steps.map(step => step.command);
    expect(commands).toContain('set_actor_position player 21 34');
    expect(commands).toContain('set_actor_position player 8 34');
    const crab = manifest.actors.find(actor => actor.id === 'penedos-crab');
    expect(manifest.respawn.x * 8 + 8).toBeLessThanOrEqual((crab.x - 2) * 8 - 8);
  });
});
