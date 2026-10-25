import { expect, it } from 'vitest';
import { createBlankProjectData } from '../shared/newProject.js';
import { buildEngineExportProjectContract } from './exportEngineProject.js';

it('exports an authored A interaction without losing the same trigger enter/leave actions', () => {
  const p=createBlankProjectData({name:'Interaction regression',sceneType:'topdown'});
  const room=(p.rooms as Array<Record<string,unknown>>)[0]!;
  p.variables=[{id:'interaction-result',name:'interaction_result',initialValue:0}];
  p.events=[['enter',1],['interact',2],['leave',3]].map(([name,value])=>({id:`event-${name}`,name,roomName:room.name,category:'Cena',command:`set_variable interaction_result ${value}`}));
  p.triggers=[{id:'workbench',name:'Workbench',roomName:room.name,x:8,y:10,width:2,height:3,eventBindings:{onEnter:'enter',onInteract:'interact',onLeave:'leave'}}];
  const exported=buildEngineExportProjectContract(p).topdown_project!.rooms[0]!;
  expect(exported.triggers?.[0]).toMatchObject({area:{x:64,y:80,width:16,height:24},on_enter:[{op:'set_variable',value:1}],on_leave:[{op:'set_variable',value:3}]});
  expect(exported.interactions).toEqual([{area:{x:64,y:80,width:16,height:24},script:[{op:'set_variable',variable:0,value:2}]}]);
});
