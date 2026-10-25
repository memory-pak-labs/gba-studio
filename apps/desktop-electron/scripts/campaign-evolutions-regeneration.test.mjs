import {readFileSync} from 'node:fs';
import {describe,it,expect} from 'vitest';
import {isVerticeShowcaseProject,promoteExemploGBAVerticeCampaign} from './vertice-showcase-project.mjs';

const source=()=>JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url)));
const manifest=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/campaign-evolutions-approved.json',import.meta.url)));
describe('approved campaign extensions survive regeneration',()=>{
 it('recognizes the canonical campaign with its optional Gallery',()=>expect(isVerticeShowcaseProject(source())).toBe(true));
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
