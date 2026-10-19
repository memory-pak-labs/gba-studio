import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {promoteApprovedRelay} from './relay-approved-promotion.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
import {normalizeSceneRuntime} from '../src/shared/sceneTypeProfiles.js';
const source=()=>JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project'));
const manifest=()=>JSON.parse(readFileSync('fixtures/asset-provenance/relay-approved-manifest.json'));
describe('approved relay battle integration',()=>{
 it('preserves other scenes and approved source pixels, and is idempotent',()=>{
  const before=source(),p=promoteApprovedRelay(before);
  expect(promoteApprovedRelay(p)).toEqual(p);
  for(const key of ['rooms','scenas'])expect(p[key].filter(r=>r.name!=='guardiao_rele')).toEqual(before[key].filter(r=>r.name!=='guardiao_rele'));
  for(const key of ['actors','events','triggers'])expect(p[key].filter(r=>r.roomName!=='guardiao_rele')).toEqual(before[key].filter(r=>r.roomName!=='guardiao_rele'));
  for(const a of manifest().assets)expect(createHash('sha256').update(readFileSync('default-assets/templates/exemplo-gba/'+a.metadata.source)).digest('hex')).toBe(a.metadata.preparedSha256);
 });
 it('exports authored positions, all approved poses, real HP, four effects and seven PSG cues',()=>{
  const p=promoteApprovedRelay(source()),r=p.rooms.find(r=>r.name==='guardiao_rele');
  expect(normalizeSceneRuntime('battleRpg',r.runtime).config.presentation).toEqual(r.runtime.config.presentation);
  const full=buildEngineExportProjectContract(p),c=full.battle_rpg_project,e=c.encounters.find(e=>e.name==='guardiao_rele');
  expect(e.party[0].position).toEqual({x:56,y:112});expect(e.enemies[0].position).toEqual({x:184,y:112});
  expect(e.party[0].unit).toEqual({max_hp:96,attack:12,defense:10,speed:11});
  expect(e.party[0].abilities.map(a=>a.kind)).toEqual(['attack','magic']);
  expect(e.enemies[0].animation_set.reactivate.frame_metasprites).toHaveLength(3);
  expect(e.party[0].animation_set.attack.frame_metasprites[0].parts[0]).toMatchObject({x:-32,y:-60,width:64,height:64});
  expect(Object.keys(e.presentation.action_sounds)).toHaveLength(7);
  expect(Object.keys(e.presentation.effects).sort()).toEqual(['electric','energy','hit','shield']);
  expect(c.backgrounds[e.presentation.hud_background].layer).toBe('bg1');
  const h=c.dialogue_ui.hud_layouts.find(h=>h.id==='hud-guardiao-rele');
  expect(h.components.filter(h=>h.value_binding).map(h=>h.value_binding)).toEqual(['p1-health','p2-health']);
  expect(h.components.filter(h=>h.kind==='text')).toHaveLength(6);
  expect(h.components.filter(h=>h.kind==='text').every(h=>h.text==='')).toBe(true); // Editor hints never replace runtime values.
  expect(c.dialogue_ui.hud_presets.find(h=>h.id==='hud-guardiao-rele').font_preserve_opaque_colors).toBe(true);
 });
 it('survives canonical regeneration',async()=>{
  const {promoteExemploGBAVerticeCampaign}=await import('./vertice-showcase-project.mjs');
  const p=promoteExemploGBAVerticeCampaign(promoteApprovedRelay(source()));
  expect(p.rooms.find(r=>r.name==='guardiao_rele').backgroundAssetName).toBe('relay-approved-background.png');
 });
});
