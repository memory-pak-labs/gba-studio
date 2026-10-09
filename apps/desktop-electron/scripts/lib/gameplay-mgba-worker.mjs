import { parentPort, workerData } from 'node:worker_threads';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import createMGBA from '../../static/WebPlayer/player/mgba-core.mjs';
import { readRuntimeTelemetry, copyModuleSavedata, restoreModuleSavedata } from '../../static/WebPlayer/player/mgba-direct-player.mjs';
import { validatePlan, runExploration, replayInputs, auditTrace, confirmFindings } from './gameplay-exploration.mjs';
import { createGameplayDecisionProvider } from './gameplay-decision-provider.mjs';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const {romPath,out,replayDirectory,plan:rawPlan,useJev}=workerData;
let core;
let recording = false, currentMask = 0;
try {
  const rom=await readFile(romPath),wasm=await readFile(new URL('../../static/WebPlayer/player/mgba-core.wasm',import.meta.url));
  const coreSource=await readFile(new URL('../../static/WebPlayer/player/mgba-core.mjs',import.meta.url));
  const identity={romSha256:hash(rom),wasmSha256:hash(wasm),coreSourceSha256:hash(coreSource)};
  core=await createMGBA({print:()=>{},printErr:()=>{},instantiateWasm(imports,receive){const instance=new WebAssembly.Instance(new WebAssembly.Module(wasm),imports);receive(instance);return instance.exports;}});
  if(core._gba_init()!==1)throw Error('core-init');
  const ptr=core._malloc(rom.length);
  try{core.HEAPU8.set(rom,ptr);if(core._gba_load_rom(ptr,rom.length)!==1)throw Error('rom-load');}finally{core._free(ptr);}
  function saveState(){const size=core._gba_state_size(),p=core._malloc(size);try{if(core._gba_save_state(p,size)!==1)throw Error('snapshot');return Buffer.from(core.HEAPU8.slice(p,p+size));}finally{core._free(p);}}
  const adapter={
    snapshot:()=>({state:saveState(),savedata:Buffer.from(copyModuleSavedata(core))}),
    restore:initial=>{recording=false;const p=core._malloc(initial.state.length);try{core.HEAPU8.set(initial.state,p);if(core._gba_load_state(p,initial.state.length)!==1)throw Error('restore-state');}finally{core._free(p);}
      if(initial.savedata.length&&!restoreModuleSavedata(core,initial.savedata))throw Error('restore-save');core._gba_set_keys(0);},
    read:()=>readRuntimeTelemetry(core),keys:mask=>{currentMask=mask;core._gba_set_keys(mask);},step:()=>{
      if(recording)parentPort.postMessage({type:'progress',mask:currentMask,before:readRuntimeTelemetry(core)});
      core._gba_run_frame();
    }
  };
  let plan,initial,result;
  if(replayDirectory){
    const replay=JSON.parse(await readFile(join(replayDirectory,'replay.json'),'utf8'));
    plan=validatePlan(replay.plan);
    if(replay.schema!==1||Object.entries(identity).some(([k,v])=>replay.identity?.[k]!==v))throw Error('replay-identity');
    if(!Array.isArray(replay.inputs)||replay.inputs.length>plan.steps*plan.framesPerStep||replay.inputs.some(k=>!Number.isInteger(k)||k<0||k>1023))throw Error('replay-inputs');
    initial={state:await readFile(join(replayDirectory,'initial.state')),savedata:await readFile(join(replayDirectory,'initial.save'))};
    if(hash(initial.state)!==replay.initialStateSha256||hash(initial.savedata)!==replay.initialSaveSha256)throw Error('replay-initial-hash');
    adapter.restore(initial);
    const observed=adapter.read();
    if(observed?.currentRoom!==plan.scope.currentRoom||observed?.runtimeKind!==plan.scope.runtimeKind)throw Error('initial-scope-mismatch');
    const trace=await replayInputs(adapter,initial,replay.inputs),replayTrace=await replayInputs(adapter,initial,replay.inputs);
    const reproduced=JSON.stringify(trace)===JSON.stringify(replayTrace)&&hash(JSON.stringify(trace))===replay.traceSha256;
    const audit=auditTrace(plan,trace,replay.inputs);
    result={inputs:replay.inputs,trace,replayTrace,decisions:[],reproduced,objectiveReached:audit.objectiveReached,coverage:audit.coverage,findings:confirmFindings(audit,auditTrace(plan,replayTrace,replay.inputs),reproduced)};
  }else{
    plan=validatePlan(rawPlan);core._gba_set_keys(0);
    for(let frame=0;frame<plan.bootFrames;frame++)adapter.step();
    initial=adapter.snapshot();
    await writeFile(join(out,'initial.state'),initial.state,{flag:'wx',mode:0o600});
    await writeFile(join(out,'initial.save'),initial.savedata,{flag:'wx',mode:0o600});
    parentPort.postMessage({type:'initial',plan,identity,initialTelemetry:adapter.read()});
    recording=true;
    result=await runExploration(plan,adapter,createGameplayDecisionProvider({enabled:useJev&&process.env.GBA_STUDIO_JEV_ENABLED==='1',apiKey:process.env.TYPESAFE_API_KEY,model:process.env.GBA_STUDIO_JEV_MODEL??'jev-1.13.0'}));
    recording=false;
  }
  const replay={schema:1,plan,identity,initialStateSha256:hash(initial.state),initialSaveSha256:hash(initial.savedata),traceSha256:hash(JSON.stringify(result.trace)),inputs:result.inputs,
    rng:'Captured in mGBA state; no independent engine seed injection',initialSave:'Captured SRAM; original ROM and user save files are never written'};
  if(replayDirectory){
    await writeFile(join(out,'initial.state'),initial.state,{flag:'wx',mode:0o600});
    await writeFile(join(out,'initial.save'),initial.savedata,{flag:'wx',mode:0o600});
  }
  await writeFile(join(out,'replay.json'),JSON.stringify(replay,null,2),{flag:'wx',mode:0o600});
  const report={schema:1,scene:plan.scene,identity,initialTelemetry:result.trace[0],...result,
    apiCalls:result.decisions.reduce((n,d)=>n+(d.calls??0),0),releaseApproval:false,
    reproduction:'node scripts/explore-gameplay.mjs --rom SAME_ROM --replay THIS_DIRECTORY --out NEW_DIRECTORY',
    limitations:['Configured invariants require human validation of coordinate/flag semantics.','No visual, hardware, or release approval.','Missing objective/collision contracts are untested, not passed.']};
  await writeFile(join(out,'report.json'),JSON.stringify(report,null,2),{flag:'wx',mode:0o600});
  parentPort.postMessage({ok:true,reproduced:result.reproduced,frames:result.inputs.length,findings:result.findings,apiCalls:report.apiCalls});
}catch(error){
  // Do not persist provider errors or arbitrary exception text that may carry credentials.
  const allowed=['initial-scope-mismatch','invalid-plan','invalid-bounds','invalid-objective','invalid-collision-mask','core-init','rom-load','snapshot','restore-state','restore-save','replay-identity','replay-inputs','replay-initial-hash'];
  parentPort.postMessage({ok:false,code:allowed.includes(error?.message)?error.message:'runner-exception',status:'inconclusive'});
}finally{core?._gba_destroy();}
