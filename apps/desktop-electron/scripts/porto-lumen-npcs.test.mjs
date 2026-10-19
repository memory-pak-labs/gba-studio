import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { buildAssetcSpritePackGeneration } from '../src/shared/engineProjectExport.js';
import { normalizeSpriteStateSlots } from '../src/shared/spriteAnimationState.js';
import { promoteApprovedPortoLumenPaged } from './porto-lumen-paged-promotion.mjs';
import { approvedObjectPaletteSourceRgba } from './rgb555-framebuffer-contract.mjs';
import { decodePngRgba } from './lib/png-icons.mjs';
const root = new URL('../default-assets/templates/exemplo-gba/', import.meta.url);
const project = () => JSON.parse(readFileSync(new URL('exemplo-gba.gba-project', root)));
const roles = ['captain', 'traveler', 'cartographer', 'fisherchild', 'lighthousekeeper'];
const directions = ['down', 'up', 'left', 'right'];

describe('NPCs aprovados de Porto Lumen', () => {
  it('matches the independently reviewed runtime colors in all twenty poses', () => {
    const data = project();
    const provenance = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/porto-lumen-npcs48.json', import.meta.url)));
    expect(provenance.runtimePaletteApproval).toBe('ok aprovado as paletas compativeis');
    for (const entry of provenance.sourceSheets) {
      const source = decodePngRgba(readFileSync(new URL(`Assets/sprites/${entry.name}`, root)));
      const expected = approvedObjectPaletteSourceRgba(source, data.assets.find(a => a.name === entry.name).metadata);
      expect(createHash('sha256').update(expected.pixels).digest('hex')).toBe(entry.approvedRuntimeRgbaSha256);
    }
  });
  it('usa os cinco desenhos nativos aprovados e conserva as quatro vistas sem espelhamento', () => {
    const data = project();
    const palette = data.assets.find(a => a.name === 'porto-nara-animations48.png').metadata.objectPaletteValues;
    for (const role of roles) {
      const name = `porto-${role}-body48.png`;
      const actor = data.actors.find(a => a.id === `porto-lume-${role}-pilot`);
      expect(actor.spriteSheet).toBe(name);
      const asset = data.assets.find(a => a.name === name);
      const bytes = readFileSync(new URL(`Assets/sprites/${name}`, root));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.metadata.preparedSha256);
      expect(asset.metadata).toMatchObject({reviewStatus: 'approved', runtimePaletteReviewStatus: 'approved', frameWidth: 32, frameHeight: 48, frameCount: 4, colorMode: '8bpp', streamFrames: true});
      expect(asset.metadata.objectPaletteValues).toHaveLength(176);
      expect(asset.metadata.objectPaletteValues.slice(0, palette.length)).toEqual(palette);
      const image = decodePngRgba(bytes);
      expect([image.width, image.height]).toEqual([128, 48]);
      expect([...image.pixels].filter((_, i) => i % 4 === 3).every(a => a === 0 || a === 255)).toBe(true);
      const state = data.animationStates.find(s => s.id === actor.animationStateID);
      expect(state).toMatchObject({spriteSheet: name, animationType: 'four_direction', mirrorLeftFromRight: false});
      const animations = data.animations.filter(a => state.animationIDs.includes(a.id));
      const slots = normalizeSpriteStateSlots(state, animations);
      expect(slots.missingSlots).toEqual([]);
      for (const [index, direction] of directions.entries()) {
        const animation = animations.find(a => a.direction === direction);
        expect(slots.slots[`idle_${direction}`]).toEqual({animationID: animation.id, flipX: false});
        expect(slots.slots[`moving_${direction}`]).toEqual(slots.slots[`idle_${direction}`]);
        expect(animation.frames[0].tiles.map(t => [t.sliceX, t.sliceY, t.tileWidth, t.tileHeight])).toEqual([[index * 32, 0, 32, 32], [index * 32, 32, 32, 16]]);
      }
    }
    expect(data.actors.find(a => a.id === 'farol-keeper').spriteSheet).toBe('porto-lighthousekeeper-body48.png');
  });

  it('restaura os vínculos aprovados na regeneração sem alterar posições, eventos ou a superfície', () => {
    const data = project();
    const input = structuredClone(data);
    for (const actor of input.actors.filter(a => a.roomName === 'porto_lumen' && roles.some(r => a.id === `porto-lume-${r}-pilot`))) actor.spriteSheet = 'obsolete.png';
    const output = promoteApprovedPortoLumenPaged(input);
    expect(output.actors).toEqual(data.actors);
    expect(output.events).toEqual(data.events);
    expect(output.settings).toEqual(data.settings);
  });

  it('exporta folhas 8bpp com residência de um quadro e banco compartilhado', () => {
    const pack = buildAssetcSpritePackGeneration(project());
    for (const role of roles) {
      const asset = pack.assetsBySheet[`porto-${role}-body48.png`];
      expect(asset).toBeDefined();
      expect(asset.sprite_bpp).toBe(8);
      expect([asset.sprite_width, asset.sprite_height]).toEqual([32, 48]);
      expect(asset.stream_frames).toBe(true);
      expect(asset.object_palette_values).toHaveLength(176);
    }
  });
});
