import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,it,expect} from 'vitest';
import {promoteApprovedTempestade} from './tempestade-approved-promotion.mjs';
import {buildEngineExportProjectContract} from '../src/main/exportEngineProject.js';
const source=()=>JSON.parse(readFileSync('default-assets/templates/exemplo-gba/exemplo-gba.gba-project'));
const manifest=()=>JSON.parse(readFileSync('fixtures/asset-provenance/tempestade-approved-manifest.json'));
describe('approved Tempestade integration',()=>{
 it('preserves other scenes, source pixels, and remains idempotent',()=>{
  const before=source(), p=promoteApprovedTempestade(before);
  expect(promoteApprovedTempestade(p)).toEqual(p);
  for(const key of ['rooms','scenas']) expect(p[key].filter(r=>r.name!=='tempestade')).toEqual(before[key].filter(r=>r.name!=='tempestade'));
  for(const key of ['actors','triggers','events']) expect(p[key].filter(r=>r.roomName!=='tempestade')).toEqual(before[key].filter(r=>r.roomName!=='tempestade'));
  for(const a of manifest().assets) expect(createHash('sha256').update(readFileSync('default-assets/templates/exemplo-gba/'+a.metadata.source)).digest('hex')).toBe(a.metadata.preparedSha256);
 });
 it('exports both waves, centered full quality animated actors, action cues and live HUD values',()=>{
  const p=promoteApprovedTempestade(source()), full=buildEngineExportProjectContract(p), c=full.shmup_project;
  expect(full.asset_pack.assets.find(a=>a.id==='tempestade_approved_explosion').bank_groups).toEqual(['scene_tempestade']);
  expect(c.backgrounds[0]).toMatchObject({width_tiles:96,height_tiles:20});
  expect(c.waves).toHaveLength(2);
  expect(c.waves.every(w=>w.on_defeat?.some(s=>s.op==='wait'))).toBe(true);
  for(const action of ['idle','fly','bank_up','bank_down','shoot','hurt','explosion']) expect(c.player.animations[action]).toBeDefined();
  expect(c.player.animations.fly.frame_indices).toHaveLength(3);
  expect(c.player.animations.fly.frame_metasprites[0].parts[0]).toMatchObject({x:-16,y:-16});
  expect(c.player.on_fire.some(x=>x.op==='play_sfx')).toBe(true);
  expect(c.enemy_projectile.on_hit_player.some(x=>x.op==='play_sfx')).toBe(true);
  for(const wave of c.waves) for(const e of wave.enemies){expect(e.animation.frame_indices).toHaveLength(4);expect(e.on_destroy.some(x=>x.op==='play_sfx')).toBe(true);}
  const h=c.dialogue_ui.hud_layouts.find(h=>h.id==='hud-tempestade-voo-livre');
  expect(c.dialogue_ui.hud_presets.find(h=>h.id==='hud-tempestade-voo-livre').font_image).toContain('tempestade');
  for(const name of ['tempestade_inicial','tempestade_farol'])expect(c.dialogue_ui.hud_scene_bindings).toContainEqual({scene_name:name,preset_id:h.id});
  expect(h.components.filter(x=>x.value_binding).map(x=>[x.value_binding,x.width])).toEqual([['lives',16],['wave',16],['score',48]]);
  expect(p.rooms.find(r=>r.name==='tempestade').campaign.nextScene).toBe('guardiao_rele');
 });
 it('keeps the existing projectile defaults for projects without explicit flight geometry',()=>{
  const p=source();delete p.settings.shmup.projectileOffset;delete p.settings.shmup.projectileSize;
  const c=buildEngineExportProjectContract(p).shmup_project;
  expect(c.player.projectile_offset).toEqual({x:24,y:12});expect(c.projectile.size).toEqual({x:16,y:8});
 });
 it('survives canonical regeneration',async()=>{
  const {promoteExemploGBAVerticeCampaign}=await import('./vertice-showcase-project.mjs');
  const p=promoteExemploGBAVerticeCampaign(promoteApprovedTempestade(source()));
  expect(p.rooms.find(r=>r.name==='tempestade').backgroundAssetName).toBe('tempestade-approved-background.png');
 });
});
