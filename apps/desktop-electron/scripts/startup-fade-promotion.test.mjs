import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { promoteApprovedStartupFade, startupFadeManifest } from './startup-fade-promotion.mjs';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
import { decodePngRgba } from './lib/png-icons.mjs';

const source = JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url)));

it('distributes the approved A fade as a 216-frame logo timeline instead of the previous 120-frame intro', () => {
  const logo = source.rooms.find(scene => scene.name === 'logo');
  expect(logo.runtime.config.steps.reduce((sum, step) => sum + step.durationFrames, 0)).toBe(216);
  expect(logo.runtime.config.steps[0].backgroundAssetName).toMatch(/^startup-fade-a-/);
  expect(logo.runtime.config.steps.at(-1).targetSceneIndex).toBe(1);
});

it('preserves every non-logo scene, actor, dialogue, setting and existing event without mutating input', () => {
  const before = structuredClone(source), result = promoteApprovedStartupFade(source);
  expect(source).toEqual(before);
  for (const collection of ['rooms', 'scenas']) expect(result[collection].filter(scene => scene.name !== 'logo')).toEqual(source[collection].filter(scene => scene.name !== 'logo'));
  for (const key of Object.keys(source).filter(key => !['assets', 'rooms', 'scenas', 'scena', 'events'].includes(key))) expect(result[key], key).toEqual(source[key]);
  if (source.scena?.name !== 'logo') expect(result.scena).toEqual(source.scena);
  for (const event of source.events.filter(event => event.name !== 'logo_concluir')) expect(result.events.find(item => item.name === event.name)).toEqual(event);
  expect(promoteApprovedStartupFade(result)).toEqual(result);
});

it('retains the selected fade when the example is regenerated', () => {
  const rebuilt = promoteExemploGBAVerticeCampaign(source);
  expect(rebuilt.rooms.find(scene => scene.name === 'logo').runtime.config.steps).toEqual(source.rooms.find(scene => scene.name === 'logo').runtime.config.steps);
  for (const asset of startupFadeManifest.assets) expect(rebuilt.assets.find(item => item.id === asset.id)?.name).toBe(asset.file);
});

it('preserves approved native pixels, RGB555 colors and the original startup PNGs', () => {
  const root = new URL('../default-assets/templates/exemplo-gba/', import.meta.url);
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const asset of startupFadeManifest.assets) {
    const bytes = readFileSync(new URL(asset.source, root)), image = decodePngRgba(bytes);
    expect(sha(bytes)).toBe(asset.sha256); expect(sha(image.pixels)).toBe(asset.pixelSha256);
    expect(image.width).toBe(240); expect(image.height).toBe(160);
    const colors = new Set(); let invalidAlpha = 0, invalidColors = 0;
    for(let i=0;i<image.pixels.length;i+=4) { if(image.pixels[i+3]!==255)invalidAlpha++; for(let c=0;c<3;c++)if(image.pixels[i+c]%8)invalidColors++; colors.add(image.pixels.subarray(i,i+3).join(',')); }
    expect(invalidAlpha).toBe(0); expect(invalidColors).toBe(0);
    expect(colors.size).toBeLessThanOrEqual(15);
  }
  for(const original of startupFadeManifest.retainedOriginals) expect(sha(readFileSync(new URL(original.source,root)))).toBe(original.sha256);
});

it('exports the whole fade with exact one-bank backgrounds, automatic completion and a skip action at every step', () => {
  const exported = buildEngineExportProjectContract(source), scene = exported.cutscene_project.scenes.find(item => item.name === 'logo');
  expect(scene.steps).toHaveLength(56);
  expect(scene.steps.reduce((sum,step)=>sum+step.duration_frames,0)).toBe(216);
  expect(scene.steps.at(-1).target_scene).toBe(1);
  for(const step of scene.steps) {
    expect(step.skippable).toBe(true);
    expect(step.on_skip).toEqual(expect.arrayContaining([expect.objectContaining({op:'warp_runtime',runtime:'cutscene',room:1})]));
  }
  for(const asset of startupFadeManifest.assets) expect(exported.asset_pack.assets.find(item=>item.id===asset.file.replace('.png','').replaceAll('-','_'))).toMatchObject({background_bpp:4,background_palette_banks:1,background_tile_budget:600});
});
