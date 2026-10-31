import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {isVerticeShowcaseProject,promoteExemploGBAVerticeCampaign} from './vertice-showcase-project.mjs';
import { validateGBAProjectMigrationContract } from '../../../packages/project-contract/src/index.js';
import { prepareEngineProjectExport } from '../src/main/exportEngineProject.js';

const source=()=>JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/campaign-evolutions-approved.json',import.meta.url)));
describe('approved campaign extensions survive regeneration',()=>{
 it('recognizes the canonical campaign with its optional Gallery',()=>expect(isVerticeShowcaseProject(source())).toBe(true));
 it('preserves the three approved menu scenes and their actors during regeneration',()=>{
  const before=source(),after=promoteExemploGBAVerticeCampaign(before);
  const names=new Set(['corrida_preparacao','corrida_resultados','inventario_ferramentas','menu_start','inventario']);
  for(const key of ['rooms','scenas'])for(const scene of before[key].filter(r=>names.has(r.name)))expect(after[key].find(r=>r.name===scene.name)).toEqual(scene);
  for(const actor of before.actors.filter(a=>names.has(a.roomName)))expect(after.actors.find(a=>a.id===actor.id)).toEqual(actor);
  expect(after.actors.find(a=>a.id==='farol-nara')).toEqual(before.actors.find(a=>a.id==='farol-nara'));
  expect(after.events.find(e=>e.name==='showcase_base_farol_enter')).toEqual(before.events.find(e=>e.name==='showcase_base_farol_enter'));
  expect(after.editorState.sceneMapPositions).toMatchObject(before.editorState.sceneMapPositions);
  for(const event of before.events.filter(e=>names.has(e.roomName)))expect(after.events.find(e=>e.id===event.id)).toEqual(event);
  const authored=JSON.stringify([...before.scenas.filter(r=>names.has(r.name)),...before.actors.filter(a=>names.has(a.roomName))]);
  for(const asset of before.assets.filter(a=>a.name && authored.includes(a.name)))expect(after.assets.find(a=>a.id===asset.id)).toEqual(asset);
  for(const dialogue of before.dialogues.filter(d=>d.key?.startsWith('race_')))expect(after.dialogues.find(d=>d.key===dialogue.key)).toEqual(dialogue);
  for(const event of before.events.filter(e=>e.name?.startsWith('race_')||e.name==='nara_configurar_corrida'))expect(after.events.find(e=>e.name===event.name)).toEqual(event);
  const extraNames=new Set(['corrida_preparacao','corrida_resultados','inventario_ferramentas']);
  const extraConnections=project=>project.editorState.scenaConnections.filter(c=>extraNames.has(c.from)||extraNames.has(c.to));
  expect(extraConnections(before).length).toBeGreaterThan(0);
  expect(extraConnections(after)).toEqual(extraConnections(before));
  const raceSources=new Set(['arena_arrancada','mapa_rota','circuito_final','circuito_perspectiva']);
  const raceConnections=project=>project.editorState.scenaConnections.filter(c=>raceSources.has(c.from));
  expect(raceConnections(after)).toEqual(raceConnections(before));
  for(const key of ['scenas','actors','events','assets','animations','animationStates']) {
   const ids=new Set(after[key].map(item=>item.id));
   expect(before[key].filter(item=>!ids.has(item.id))).toEqual([]);
  }
  expect(new Set(after.events.map(event=>event.name)).size).toBe(after.events.length);
  expect(after.events.map(event=>event.name)).toEqual(before.events.map(event=>event.name));
  expect(validateGBAProjectMigrationContract(after)).toEqual([]);
  expect(prepareEngineProjectExport(after).error).toBeUndefined();
 });

 it('retains the four approved extensions, ordinary event IDs and existing save slots',()=>{
  const before=source(),copy=structuredClone(before),after=promoteExemploGBAVerticeCampaign(before);
  expect(before).toEqual(copy);
  for(const key of ['rooms','scenas'])expect(after[key].find(r=>r.name==='galeria_das_mares')).toEqual(before[key].find(r=>r.name==='galeria_das_mares'));
  for(const actor of before.actors.filter(a=>a.roomName==='galeria_das_mares'||a.id.startsWith('telescope-dial-')||a.id==='relay-mechanic-support'))expect(after.actors.find(a=>a.id===actor.id)).toEqual(actor);
  for(const name of ['gallery_sync','gallery_update','gallery_restore','gallery_stairs','observatorio_do_farol_telescopio','guardiao_ao_entrar'])expect(after.events.find(e=>e.name===name)).toEqual(before.events.find(e=>e.name===name));
  for(const a of manifest.assets)expect(after.assets.find(row=>row.name===a.name)).toEqual(before.assets.find(row=>row.name===a.name));
  const storm=p=>p.rooms.find(r=>r.name==='tempestade').runtime.config;
  expect(storm(after).composition.layers.find(l=>l.id==='evolution-storm-clouds')).toEqual(storm(before).composition.layers.find(l=>l.id==='evolution-storm-clouds'));
  expect(storm(after).composition.effects.hblank).toEqual(storm(before).composition.effects.hblank);
  expect(after.variables.map(v=>v.name)).toEqual(before.variables.map(v=>v.name));
  for(const variable of ['var_gallery_gate','var_gallery_record','var_telescope_alignment'])expect(after.events.find(e=>e.name==='titulo_novo_jogo').steps.filter(s=>s.command==='set_variable '+variable+' 0')).toHaveLength(1);
  expect(after.settings.campaign?.sceneOrder).toEqual(before.settings.campaign?.sceneOrder);
  expect(after.editorState.sceneMapPositions.galeria_das_mares).toEqual(before.editorState.sceneMapPositions.galeria_das_mares);
  expect(after.editorState.scenaConnections.filter(c=>c.from==='galeria_das_mares'||c.to==='galeria_das_mares')).toEqual(before.editorState.scenaConnections.filter(c=>c.from==='galeria_das_mares'||c.to==='galeria_das_mares'));
  expect(after.rooms.filter(r=>r.name==='galeria_das_mares')).toHaveLength(1);
 });
});
