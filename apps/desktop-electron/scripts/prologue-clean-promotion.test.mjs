import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {promoteApprovedCleanPrologue} from './prologue-clean-promotion.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {configurePlatformerEvents} from './configure-platformer-events.mjs';
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const source=JSON.parse(readFileSync(new URL('exemplo-gba.gba-project',root)));
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/prologue-clean-manifest.json',import.meta.url)));
const retired=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/example-library-cleanup.json',import.meta.url))).retiredAssets;
const hash=f=>createHash('sha256').update(readFileSync(new URL(f,root))).digest('hex');

it('keeps the library order stable when the platformer authoring is reapplied',()=>{
 const p=promoteApprovedCleanPrologue(source);
 expect(configurePlatformerEvents(p).assets).toEqual(p.assets);
});

it('uses the three approved native files and retains the prior provenance outside the live library',()=>{
 const p=promoteApprovedCleanPrologue(source);
 for(const e of manifest.assets){
  expect(hash(e.source)).toBe(e.sha256);
  expect(p.assets.find(a=>a.id===e.id)?.metadata).toMatchObject({reviewStatus:'approved',preparedSha256:e.sha256,backgroundPaletteBankBudget:14,palettePreparationVisuallyApproved:true});
 }
 for(const e of manifest.retainedAssets){expect(retired.find(a=>a.source===e.file)?.sha256).toBe(e.sha256);expect(source.assets.some(a=>a.metadata?.source===e.file)).toBe(false);}
});

it('connects all three frames and the completion frame, preserving dialogue and campaign actions',()=>{
 const p=promoteApprovedCleanPrologue(source),room=p.rooms.find(r=>r.name==='prologo');
 expect(room.backgroundAssetName).toBe(manifest.assets[0].file);
 expect(room.runtime.config.steps.map(s=>s.backgroundAssetName)).toEqual([...manifest.assets.map(a=>a.file),manifest.assets[2].file]);
 const rest=s=>{const {backgroundAssetName,...unchanged}=s;return unchanged};
 expect(room.runtime.config.steps.map(rest)).toEqual(source.rooms.find(r=>r.name==='prologo').runtime.config.steps.map(rest));
 expect(p.scenas.find(r=>r.name==='prologo')).toEqual(room);
});

it('preserves every other scene, actor, animation, event, dialogue, setting and player variant',()=>{
 const before=structuredClone(source),p=promoteApprovedCleanPrologue(source);
 expect(source).toEqual(before);
 for(const k of Object.keys(source).filter(k=>!['assets','rooms','scenas'].includes(k)))expect(p[k],k).toEqual(source[k]);
 for(const k of ['rooms','scenas'])expect(p[k].filter(r=>r.name!=='prologo')).toEqual(source[k].filter(r=>r.name!=='prologo'));
 for(const a of source.assets.filter(a=>!a.name.startsWith('prologue-frame-')&&!a.id.startsWith('prologue-clean-')))expect(p.assets.find(b=>b.id===a.id)).toEqual(a);
 expect(promoteApprovedCleanPrologue(p)).toEqual(p);
});

it('exports three distinct 4bpp backgrounds with exact tiles and existing transition scripts',()=>{
 const p=buildEngineExportProjectContract(promoteApprovedCleanPrologue(source));
 const scene=p.cutscene_project.scenes.find(s=>s.name==='prologo');
 expect(scene.steps).toHaveLength(4);
 expect(new Set(scene.steps.filter(s=>s.line>=0).map(s=>s.background)).size).toBe(3);
 for(const e of manifest.assets)expect(p.asset_pack.assets.find(a=>a.id===e.file.replace('.png','').replaceAll('-','_'))).toMatchObject({background_bpp:4,background_tile_budget:600,background_palette_banks:14});
 expect(scene.steps.at(-1).script).toEqual(expect.arrayContaining([expect.objectContaining({op:'warp_runtime',runtime:'topdown',room:0})]));
});
