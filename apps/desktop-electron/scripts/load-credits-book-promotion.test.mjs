import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {expect,it} from 'vitest';
import {promoteApprovedLoadCredits} from './load-credits-book-promotion.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {configurePlatformerEvents} from './configure-platformer-events.mjs';
const retired=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/example-library-cleanup.json',import.meta.url))).retiredAssets;
const root=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const source=JSON.parse(readFileSync(new URL('exemplo-gba.gba-project',root)));
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/load-credits-book-manifest.json',import.meta.url)));
const affected=new Set(['carregar_jogo','creditos']);
const actions=r=>r.runtime.config.items.map(({label,clickBox,detailLines,...item})=>item);
it('promotes the approved PNGs and retains old images without processing pixels',()=>{
 const p=promoteApprovedLoadCredits(source);
 for(const a of manifest.assets){
  expect(createHash('sha256').update(readFileSync(new URL(a.source,root))).digest('hex')).toBe(a.sha256);
  expect(p.assets.find(b=>b.id===a.id)?.metadata).toMatchObject({reviewStatus:'approved',preparedSha256:a.sha256,backgroundPaletteBankBudget:14,palettePreparationVisuallyApproved:true,fixedTitle:a.scene==='creditos'?'CRÉDITOS':'CARREGAR'});
  expect(p.rooms.find(r=>r.name===a.scene).backgroundAssetName).toBe(a.file);
 }
 for(const a of manifest.retainedAssets){expect(retired.find(r=>r.source===a.file)?.sha256).toBe(a.sha256);expect(source.assets.some(r=>r.metadata?.source===a.file)).toBe(false);}
 expect(p.assets.some(a=>a.name==='neutral-menu-font-gba.png')).toBe(false);
});
it('preserves real save bindings, credits events, dialogues and every other approved scene',()=>{
 const before=structuredClone(source),p=promoteApprovedLoadCredits(source);
 expect(source).toEqual(before);
 for(const k of ['events','dialogues','variables','triggers','animations','animationStates'])expect(p[k],k).toEqual(source[k]);
 for(const k of ['rooms','scenas'])expect(p[k].filter(r=>!affected.has(r.name))).toEqual(source[k].filter(r=>!affected.has(r.name)));
 expect(p.actors.filter(a=>!affected.has(a.roomName))).toEqual(source.actors.filter(a=>!affected.has(a.roomName)));
 for(const n of affected){expect(actions(p.rooms.find(r=>r.name===n))).toEqual(actions(source.rooms.find(r=>r.name===n)));expect(p.scenas.find(r=>r.name===n)).toEqual(p.rooms.find(r=>r.name===n));}
 expect(p.settings.hudPresets.filter(h=>!['hud-book-carregar_jogo','hud-book-creditos','hud-neutral-carregar_jogo','hud-neutral-creditos'].includes(h.id))).toEqual(source.settings.hudPresets.filter(h=>!['hud-book-carregar_jogo','hud-book-creditos','hud-neutral-carregar_jogo','hud-neutral-creditos'].includes(h.id)));
 expect(promoteApprovedLoadCredits(p)).toEqual(p);
 expect(configurePlatformerEvents(p).assets).toEqual(p.assets);
});
it('exports live slot statuses, separate static credits and selected cursors without a command footer',()=>{
 const p=promoteApprovedLoadCredits(source),contract=buildEngineExportProjectContract(p);
 for(const n of affected){
  const room=p.rooms.find(r=>r.name===n),hud=p.settings.hudPresets.find(h=>h.id===room.hudPresetId);
  expect(hud.components).toHaveLength(8);expect(hud.font).toBe('porto-hud-b-font.png');
  expect(hud.components.every(c=>c.x>=0&&c.y>=0&&c.x+c.width<=240&&c.y+c.height<=160)).toBe(true);
  expect(hud.components.some(c=>/D MOVER|A.*DETALH|B.*VOLTAR/.test(c.text))).toBe(false);
  for(const item of room.runtime.config.items)expect(p.actors.some(a=>a.roomName===n&&a.menuItemID===item.id&&a.menuActorSelectedOnly&&a.spriteSheet==='book-cursor-approved-8x8.png')).toBe(true);
 }
 const load=contract.menu_project.screens.find(s=>s.name==='carregar_jogo');
 expect(load.items.map(i=>i.save_slot)).toEqual([0,1,2,undefined]);expect(load.items.slice(0,3).every(i=>i.requires_save)).toBe(true);
 const credits=contract.menu_project.dialogue_ui.hud_layouts.find(h=>h.id==='hud-book-creditos');
 expect(credits.components.filter(c=>c.kind==='text').map(c=>c.text)).toEqual([' ','','','OBRIGADO POR JOGAR','O ÚLTIMO FAROL','GBAStudioEngine',' ',' ']);
 for(const a of manifest.assets)expect(contract.asset_pack.assets.find(e=>e.png===a.source||e.id===a.file.replace('.png','').replaceAll('-','_'))).toMatchObject({background_bpp:4,background_tile_budget:600,background_palette_banks:14});
});
