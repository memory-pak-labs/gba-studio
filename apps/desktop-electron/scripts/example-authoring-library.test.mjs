import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { materializeExampleAuthoring, exampleAuthoringInventory } from './example-authoring-library.mjs';
import { synchronizeProjectPrefabInstances, instantiateProjectPrefab } from '../src/shared/projectPrefabs.js';
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from '../src/shared/projectFile.js';
import { buildEngineExportProjectContract } from '../src/main/exportEngineProject.js';
const source=()=>JSON.parse(readFileSync(new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project',import.meta.url),'utf8'));
const withoutNotes=room=>Object.fromEntries(Object.entries(room).filter(([key])=>key!=='authoringNotes'));
describe('example authoring library',()=>{
 it('detects broken references inside native menu/cutscene configuration as well as bindings',()=>{
  const broken={rooms:[{name:'menu',runtime:{type:'menu',config:{items:[{eventName:'missing'}]}}}],events:[]};
  expect(exampleAuthoringInventory(broken).missingEvents).toEqual([expect.objectContaining({target:'missing'})]);
 });
 it('documents every scene without replacing approved resources or native behavior',()=>{
  const original=source(),next=materializeExampleAuthoring(original);
  for(const key of ['assets','animations','animationStates','audioItems','settings','variables'])expect(next[key]).toEqual(original[key]);
  expect(next.rooms.map(withoutNotes)).toEqual(original.rooms.map(withoutNotes));
  expect(next.rooms.every(room=>room.authoringNotes?.length>40)).toBe(true);
  expect(next.scenas).toEqual(next.rooms);
  expect(materializeExampleAuthoring(next)).toEqual(next);
 });
 it('provides working native actor/trigger prefabs and preserves identity and placement on sync',()=>{
  const next=materializeExampleAuthoring(source());
  expect(next.actorPrefabs.length).toBeGreaterThan(15);expect(next.triggerPrefabs.length).toBeGreaterThan(8);
  for(const prefab of [...next.actorPrefabs,...next.triggerPrefabs])expect(prefab.authoring).toMatchObject({sourceEntityID:expect.any(String),sourceScene:expect.any(String),description:expect.any(String)});
  const synced=synchronizeProjectPrefabInstances(next);
  expect(synced.actors).toEqual(next.actors);expect(synced.triggers).toEqual(next.triggers);
  const prefab=next.actorPrefabs.find(p=>p.authoring.sourceEntityID==='usina-energy-cell-v2');
  const instance=instantiateProjectPrefab(next,'actor',prefab.id,{roomID:'scene-usina_saida',x:4,y:4});
  expect(instance.entityID).toBeTruthy();
  expect(instance.data.actors.find(a=>a.id===instance.entityID).roomName).toBe('usina_saida');
  const exported=buildEngineExportProjectContract(instance.data).dungeon_crawler_project.rooms.find(room=>room.name==='usina_saida');
  const copy=exported.actors.find(actor=>actor.name===prefab.name);
  expect(copy.cell).toBe(true);
  expect(copy.on_interact).toContainEqual({op:'set_actor_visible',actor:1,value:0});
  expect(exported.actors[0].on_interact).toContainEqual({op:'set_actor_visible',actor:0,value:0});
 });
 it('connects the five remaining Port Lumen NPCs to visible dialogue chains',()=>{
  const next=materializeExampleAuthoring(source());
  for(const id of ['captain','traveler','cartographer','fisherchild','lighthousekeeper']){
   const actor=next.actors.find(a=>a.id===`porto-lume-${id}-pilot`),event=next.events.find(e=>e.name===actor.eventBindings.onInteract);
   if(id==='cartographer')expect(event.steps).toEqual(expect.arrayContaining([expect.objectContaining({command:'show_choice signal_travel'})]));
   else if(['captain','traveler'].includes(id))expect(event.steps).toEqual(expect.arrayContaining([expect.objectContaining({command:`choice_event showcase_${id==='captain'?'captain':'trader'}_menu 2 showcase_${id}_talk`})]));
   const conversation=next.events.find(e=>e.name===`showcase_base_${id==='fisherchild'?'fisher':id}`)??event;
   const original=conversation.steps.find(s=>s.command===`show_dialogue porto-${id}-conversa`);
   expect(original).toBeDefined();
   const dialogue=next.dialogues.find(d=>d.key===original.command.split(' ')[1]);
   expect(dialogue).toBeDefined();
   for(const locale of ['pt-BR','en','es'])expect(dialogue.translations[locale]?.length).toBeGreaterThan(20);
  }
 });
 it('saves, reopens and exports all existing timelines with resolved references',()=>{
  const next=materializeExampleAuthoring(source());
  const reopened=parseGBAProjectFile(serializeGBAProjectFile({data:next,summary:summarizeGBAProject(next)})).data;
  expect(reopened).toEqual(next);
  const inventory=exampleAuthoringInventory(reopened);expect(inventory.missingEvents).toEqual([]);
  expect(inventory.scenes).toHaveLength(31);
  const contract=buildEngineExportProjectContract(reopened);
  expect(contract.topdown_project.rooms.find(r=>r.name==='porto_lumen').npcs.filter(a=>a.on_interact?.length)).toHaveLength(6);
 });
});
