import {expect,it} from 'vitest';
import {buildEngineExportProjectContract} from './exportEngineProject.js';
import {withEngineExportContext} from '../shared/engineExportContext.js';
import type {GBAProjectData} from '../shared/projectFile.js';

function project():GBAProjectData {
 return {assets:[],assetGroups:[],animations:[],animationStates:[],spriteReferenceImages:[],audioItems:[],
  scenas:[{name:'start',sceneType:'topdown',width:30,height:20}],
  variables:[{name:'first',initialValue:0},{name:'second',initialValue:0}],
  events:[{id:'boot',name:'boot',category:'Cena',sceneName:'start',steps:[{id:'set',command:'set_variable first 7',isEnabled:true}]}],
  settings:{general:{gameTitle:'Registry scope',startScene:'start',startSceneType:'topdown',exportFolder:'build'},
   build:{romFileName:'registry.gba',exportFormat:'gba_rom',engineBackend:'gbastudio_engine',enginePackPath:'/opt/GBAStudioEnginePack'},
   preview:{defaultMode:'quick_preview',scale:3,runAfterBuild:false},audio:{audioEngine:'gbastudio_engine_audio',audioMode:'chiptune_pcm',masterVolume:100},
   save:{saveType:'sram',slots:3,autoSave:true},debug:{developerMode:false,preserveTempFiles:false,exportReadableButanoProject:false}}};
}
const commands=(p:GBAProjectData)=>buildEngineExportProjectContract(p).topdown_project!.scripts!.find(s=>s.name==='boot')!.script;
it('rebuilds saved variable indices after in-place authoring edits between exports',()=>{
 const p=project();expect(commands(p)).toContainEqual({op:'set_variable',variable:0,value:7});
 (p.variables as unknown[]).reverse();
 expect(commands(p)).toContainEqual({op:'set_variable',variable:1,value:7});
});
it('keeps projects isolated even when they share an event array and an outer export context',()=>{
 const a=project(),b={...project(),events:a.events,variables:[{name:'second',initialValue:0},{name:'first',initialValue:0}]};
 withEngineExportContext(()=>{
  expect(commands(a)).toContainEqual({op:'set_variable',variable:0,value:7});
  expect(commands(b)).toContainEqual({op:'set_variable',variable:1,value:7});
 });
});
