import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {expandCompactSequence} from './exemplo-template-audit.mjs';
import {decodePngRgba} from './lib/png-icons.mjs';
import {auditRgbaAgainstExportedTilemap} from './rgb555-framebuffer-contract.mjs';
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const canonical=()=>JSON.parse(readFileSync(new URL('exemplo-gba.gba-project',root)));
const scene='farol_interior',file='farol-interior-approved-paged-384x256.png';

it('compiles every approved background pixel without tile merging or additional color loss',()=>{
 const source=readFileSync(new URL('Assets/backgrounds/'+file,root));
 const png=decodePngRgba(source),out=mkdtempSync(join(tmpdir(),'gba-farol-paged-'));
 try{
  const output=join(out,'farol.hpp'),assetc=fileURLToPath(new URL('../../../packages/GBAStudioEngine/tools/assetc/assetc.py',import.meta.url));
  execFileSync(process.env.GBA_STUDIO_PYTHON||(process.platform==='win32'?'python':'python3'),[assetc,fileURLToPath(new URL('Assets/backgrounds/'+file,root)),'--paged-tilemap','--name','farol','-o',output]);
  expect(auditRgbaAgainstExportedTilemap({...png,headerSource:readFileSync(output,'utf8'),symbol:'farol'})).toMatchObject({ok:true,mismatchCount:0});
 }finally{rmSync(out,{recursive:true,force:true});}
});

it('exports the approved paged Farol, existing48pxactors and HUD B without the old sprite override',()=>{
 const p=canonical(),room=p.rooms.find(r=>r.name===scene);
 expect(room).toMatchObject({width:48,height:32,backgroundAssetName:file,hudPresetId:'hud-farol-trial'});
 expect(p.scenas.find(r=>r.name===scene)).toEqual(room);
 const base=p.settings.hudPresets.find(h=>h.id==='hud-porto-lumen-b'),hud=p.settings.hudPresets.find(h=>h.id===room.hudPresetId);
 expect(hud.components.slice(0,base.components.length)).toEqual(base.components);
 expect(hud.components.slice(base.components.length).every(c=>c.behavior.states.hidden.variable==='var_trial_active')).toBe(true);
 expect(p.actors.find(a=>a.id==='farol-nara')).toMatchObject({x:23,y:27,spriteSheet:'porto-nara-animations48.png',animationStateID:'porto-nara-animations48-state'});
 expect(p.actors.find(a=>a.id==='farol-keeper')).toMatchObject({x:17,y:14,spriteSheet:'porto-lighthousekeeper-body48.png',animationStateID:'porto-approved-lighthousekeeper-body48-state'});
 expect(p.events.find(e=>e.name==='showcase_base_farol_enter').steps.map(s=>s.command)).toContain('change_player_sprite porto-nara-animations48.png');
 expect(p.events.find(e=>e.name==='porto_entrar_farol').steps.map(s=>s.command)).toContain('change_scene farol_interior 23 27 up');
 const c=buildEngineExportProjectContract(p),exported=c.topdown_project.rooms.find(r=>r.name===scene);
 expect(exported).toMatchObject({width_tiles:48,height_tiles:32,paged_source_tiles:'farol_interior_approved_paged_384x256'});
 expect(c.asset_pack.assets.find(a=>a.id==='farol_interior_approved_paged_384x256')).toMatchObject({kind:'paged_bg'});
 expect(c.asset_pack.assets.some(a=>a.id==='farol_interior_topdown_360x240_gba')).toBe(false);
 const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/farol-interior-manifest.json',import.meta.url)));
 expect(createHash('sha256').update(readFileSync(new URL(manifest.asset.source,root))).digest('hex')).toBe(manifest.asset.sha256);
});

it('keeps walking access to the lens, keeper and exit while blocking furniture, walls and stairwell',()=>{
 const p=canonical(),r=p.rooms.find(r=>r.name===scene),c=expandCompactSequence(r.collisionTypes);
 const free=(x,y)=>c[y*r.width+x]==='free';
 for(const point of [[23,27],[17,14],[23,16],[23,22],[20,14],[23,29],[10,22]])expect(free(...point),point.join(',')).toBe(true);
 for(const point of [[0,0],[2,15],[24,10],[33,20],[6,15],[42,15]])expect(free(...point),point.join(',')).toBe(false);
 expect(p.triggers.filter(t=>t.roomName===scene).map(t=>({id:t.id,x:t.x,y:t.y,width:t.width,height:t.height}))).toEqual([
  {id:'trigger-lighthouse-lens',x:21,y:13,width:6,height:2},
  {id:'trigger-lighthouse-exit',x:22,y:30,width:4,height:2}]);
});

it('regenerates the approved Farol idempotently without touching other scenes or actor drawings',async()=>{
 const {promoteApprovedFarolInterior}=await import('./farol-interior-promotion.mjs');
 const {promoteExemploGBAVerticeCampaign}=await import('./vertice-showcase-project.mjs');
 const p=canonical(),before=structuredClone(p),result=promoteApprovedFarolInterior(p);
 expect(p).toEqual(before);expect(result).toEqual(p);expect(promoteApprovedFarolInterior(result)).toEqual(result);
 const input=structuredClone(p);input.rooms.find(r=>r.name===scene).backgroundAssetName='old.png';
 input.scenas.find(r=>r.name===scene).backgroundAssetName='old.png';input.actors.find(a=>a.id==='farol-nara').spriteSheet='old.png';
 const restored=promoteApprovedFarolInterior(input);
 for(const k of ['rooms','scenas'])expect(restored[k].filter(r=>r.name!==scene)).toEqual(p[k].filter(r=>r.name!==scene));
 expect(restored.animations).toEqual(p.animations);expect(restored.animationStates).toEqual(p.animationStates);expect(restored.settings).toEqual(p.settings);expect(restored.dialogues).toEqual(p.dialogues);
 const regenerated=promoteExemploGBAVerticeCampaign(input);
 expect(regenerated.rooms.find(r=>r.name===scene).backgroundAssetName).toBe(file);
 expect(regenerated.actors.find(a=>a.id==='farol-nara').spriteSheet).toBe('porto-nara-animations48.png');
});
