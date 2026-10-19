import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {promoteApprovedFrontalWarehouse} from './warehouse-frontal-promotion.mjs';
import {promotePointClickSceneCandidates} from './point-click-scenes.mjs';
import {promoteExemploGBAVerticeCampaign} from './vertice-showcase-project.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {resolveGbaActorSprite} from '../src/shared/gbaRendering.js';
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const canonical=JSON.parse(readFileSync(new URL('exemplo-gba.gba-project',root)));
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/warehouse-frontal-manifest.json',import.meta.url)));
const name='armazem_das_mares';
const prior=()=>promotePointClickSceneCandidates(structuredClone(canonical));
it('promotes the approved warehouse bytes and leaves the old image in the library',()=>{
 const p=promoteApprovedFrontalWarehouse(prior());
 expect(createHash('sha256').update(readFileSync(new URL(manifest.asset.source,root))).digest('hex')).toBe(manifest.asset.sha256);
 expect(p.rooms.find(r=>r.name===name).backgroundAssetName).toBe(manifest.asset.file);
 expect(p.scenas.find(r=>r.name===name)).toEqual(p.rooms.find(r=>r.name===name));
 expect(p.assets.find(a=>a.name===manifest.asset.file)?.metadata).toMatchObject({reviewStatus:'approved',preparedSha256:manifest.asset.sha256,palettePreparationVisuallyApproved:true,backgroundPaletteBankBudget:14});
 expect(p.assets.find(a=>a.name==='armazem-das-mares-gba.png')?.metadata.reusableLibraryAsset).toBe(true);
});
it('removes only the three decorative warehouse NPCs and preserves campaign, dialogues and Observatory',()=>{
 const source=prior(),snapshot=structuredClone(source),p=promoteApprovedFrontalWarehouse(source);
 expect(source).toEqual(snapshot);
 expect(p.actors.filter(a=>a.roomName===name).map(a=>a.id)).toEqual(['armazem_das_mares-cursor']);
 expect(p.actors.filter(a=>a.roomName!==name)).toEqual(source.actors.filter(a=>a.roomName!==name));
 for(const key of ['events','dialogues','variables','settings'])expect(p[key],key).toEqual(source[key]);
 for(const key of ['animations','animationStates'])expect(p[key].filter(a=>!a.id.startsWith(name+'-cursor')),key).toEqual(source[key].filter(a=>!a.id.startsWith(name+'-cursor')));
 for(const key of ['rooms','scenas'])expect(p[key].filter(r=>r.name!==name),key).toEqual(source[key].filter(r=>r.name!==name));
 expect(p.rooms.find(r=>r.name===name).campaign).toEqual(source.rooms.find(r=>r.name===name).campaign);
 expect(p.triggers.filter(t=>t.roomName!==name)).toEqual(source.triggers.filter(t=>t.roomName!==name));
 expect(promoteApprovedFrontalWarehouse(p)).toEqual(p);
});
it('exports three correctly positioned hotspots, no decorative props and the same exit to Observatory',()=>{
 const p=promoteApprovedFrontalWarehouse(prior()),c=buildEngineExportProjectContract(p),scenes=c.point_click_project.scenes;
 const room=scenes.find(s=>s.name===name);
 expect(room.props??[]).toHaveLength(0);
 expect(scenes.find(s=>s.name==='observatorio_do_farol').props).toHaveLength(3);
 expect(room.hotspots.map(h=>({name:h.name,area:h.area}))).toEqual([
 {name:'Carta Náutica',area:{x:40,y:72,width:72,height:16}},
 {name:'Baú Vermelho',area:{x:192,y:80,width:48,height:48}},
 {name:'Saída do Armazém',area:{x:136,y:32,width:48,height:72}}]);
 for(const key of ['carta','bau'])expect(p.events.find(e=>e.name===name+'_'+key).steps.map(s=>s.command)).toEqual(['show_dialogue '+name+'_'+key]);
 expect(p.events.find(e=>e.name===name+'_saida').steps.map(s=>s.command)).toEqual(['advance_campaign']);
 expect(room.hotspots[2].on_click).toEqual(expect.arrayContaining([{op:'set_variable',variable:10,value:1},expect.objectContaining({op:'warp_runtime',runtime:'point_click',room:1})]));
 expect(c.asset_pack.assets.find(a=>a.id==='warehouse_frontal_bg_240x160')).toMatchObject({background_bpp:4,background_palette_banks:14,background_tile_budget:600});
});
it('keeps the frontal warehouse when the example is regenerated',()=>{
 const p=promoteExemploGBAVerticeCampaign(canonical);
 expect(p.rooms.find(r=>r.name===name).backgroundAssetName).toBe(manifest.asset.file);
 expect(p.actors.filter(a=>a.roomName===name)).toHaveLength(1);
});

it('exports the approved hand anchored at its fingertip only in Warehouse',()=>{
 const p=promoteApprovedFrontalWarehouse(prior()),c=buildEngineExportProjectContract(p);
 const cursor=p.actors.find(a=>a.id===name+'-cursor');
 expect(cursor.spriteSheet).toBe('white-hand-cursor-32x32.png');
 expect(resolveGbaActorSprite(p,cursor).frame).toMatchObject({originX:13,originY:6});
 const handManifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/warehouse-white-hand-manifest.json',import.meta.url)));
 expect(createHash('sha256').update(readFileSync(new URL(handManifest.asset.source,root))).digest('hex')).toBe(handManifest.asset.sha256);
 const scenes=c.point_click_project.scenes;
 const hand=scenes.find(s=>s.name===name).cursor;
 expect(hand.metasprite.asset).toBe('white_hand_cursor_32x32');
 expect(hand.animations.find(a=>a.name==='idle').frame_metasprites[0].parts).toEqual([
  expect.objectContaining({x:-13,y:-6,width:32,height:32,slice_x:0,slice_y:0})
 ]);
 expect(scenes.find(s=>s.name==='observatorio_do_farol').cursor.metasprite.asset).toBe('point_click_cursor');
});

