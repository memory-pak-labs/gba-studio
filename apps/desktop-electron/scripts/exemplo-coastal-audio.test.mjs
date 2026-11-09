import { describe,it,expect } from 'vitest';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { preserveExemploCoastalAudio } from './exemplo-coastal-audio.mjs';
import { promoteExemploGBAAudio } from './exemplo-gba-audio.mjs';
const base=new URL('../default-assets/templates/exemplo-gba/',import.meta.url);
const load=name=>JSON.parse(fs.readFileSync(new URL(name,base),'utf8'));
const project=()=>load('exemplo-gba.gba-project');
const bank='Assets/audio/coastal-v1/';
describe('approved coastal audio bank',()=>{
 it('keeps every existing binding and validates every source against its licensed manifest',()=>{
  const source=project(),manifest=load(bank+'manifest.json'),bindings=load(bank+'bindings.json');
  expect(source.audioItems.map(item=>Object.fromEntries(['id','name','exportID','kind','loops'].map(key=>[key,item[key]])))).toEqual(bindings);
  expect(manifest.music).toHaveLength(16);expect(manifest.sfx).toHaveLength(58);
  expect(new Set(Object.values(manifest.files)).size).toBe(74);
  for(const item of source.audioItems){
   const asset=source.assets.find(asset=>asset.id===item.sourceAssetID);
   expect(asset.metadata.coastalBank).toBe('coastal-v1');expect(asset.metadata.license).toContain('MIT');
   const bytes=fs.readFileSync(new URL(asset.metadata.source,base));
   expect(createHash('sha256').update(bytes).digest('hex')).toBe(asset.metadata.preparedSha256);
   expect(item.format).toBe(item.kind==='Musica'?'MOD':'WAV');
   expect(item.patterns).toBeUndefined();
   if(item.kind==='Musica')expect(asset.metadata.moduleChannels).toBeGreaterThan(4);
  }
 });
 it('restores approved audio after legacy regeneration without reverting new event or scene edits',()=>{
  const source=project(),before=JSON.stringify(source);
  const generated=promoteExemploGBAAudio(source);
  generated.events.push({id:'new-event',name:'new-event',steps:[]});
  generated.rooms[0].name='new scene title';
  const restored=preserveExemploCoastalAudio(source,generated);
  expect(restored.audioItems.filter(item=>source.audioItems.some(old=>old.id===item.id))).toEqual(source.audioItems);
  expect(restored.assets.filter(asset=>asset.metadata?.coastalBank==='coastal-v1')).toEqual(source.assets.filter(asset=>asset.metadata?.coastalBank==='coastal-v1'));
  expect(restored.events.at(-1).id).toBe('new-event');expect(restored.rooms[0].name).toBe('new scene title');
  expect(new Set(restored.audioItems.map(item=>item.id)).size).toBe(restored.audioItems.length);
  expect(JSON.stringify(source)).toBe(before);
 });
});
