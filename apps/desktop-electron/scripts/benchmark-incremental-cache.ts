import {execFile} from 'node:child_process';
import {cp,mkdir,readFile,writeFile,stat,readdir,access} from 'node:fs/promises';
import {promisify} from 'node:util';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {prepareEngineProjectExport} from '../src/main/exportEngineProject.js';
import {writeEngineSchemaExport} from '../src/main/engineProjectExport.js';
import {exportedFileHashes} from '../src/main/stableBuildFiles.js';
import {parseGBAProjectFile,serializeGBAProjectFile} from '../src/shared/projectFile.js';
import {runGbsbuild} from '../src/main/enginePack.js';
import {writeRomOccupancyArtifact} from '../src/main/romOccupancyArtifact.js';
import {writeProjectMemoryReport} from '../src/main/projectMemoryReport.js';
import {publishEnginePackRomToProjectRoot} from '../src/main/projectRomPublication.js';
import {loadProjectPlugins} from '../src/main/gbaStudioPluginLoader.js';
const exec=promisify(execFile);
const root=process.env.GBA_BENCHMARK_ROOT!;
const pack=path.join(root,'engine-pack'),all:any[]=[];
const inputProject=process.env.GBA_BENCHMARK_PROJECT!;
const inputPack=process.env.GBA_BENCHMARK_PACK!;
const projectName=path.basename(inputProject);
const digest=(b:any)=>createHash('sha256').update(b).digest('hex');
await cp(path.dirname(inputProject),path.join(root,'source-project'),{recursive:true,dereference:true,filter:(file)=>{const relative=path.relative(path.dirname(inputProject),file);return !relative || relative===projectName || ['Assets','Plugins','plugins'].includes(relative.split(path.sep)[0]);}});
await cp(inputPack,pack,{recursive:true,dereference:true,filter:(file)=>!['build','.gba-cache'].includes(path.relative(inputPack,file).split(path.sep)[0])});
await writeFile(path.join(root,'inputs.json'),JSON.stringify({project:inputProject,enginePack:inputPack,projectSha256:digest(await readFile(path.join(root,'source-project',projectName))),projectFiles:await exportedFileHashes(path.join(root,'source-project')),packFiles:await exportedFileHashes(pack)},null,2));
const rounds=Number(process.env.GBA_BENCHMARK_ROUNDS??3);
if(!Number.isInteger(rounds)||rounds<1)throw Error('Numero de rodadas invalido');
// Each invocation has a fresh cache; results from previous runs are never imported.
async function files(directory:string,base=directory):Promise<any[]> {
  const result=[]; for(const f of await readdir(directory,{withFileTypes:true})) {const full=path.join(directory,f.name);if(f.isDirectory()&&f.name!=='build'&&f.name!=='.gba-cache')result.push(...await files(full,base));else if(f.isFile()&&/\.(cpp|hpp|json)$/.test(f.name)){const info=await stat(full);result.push({path:path.relative(base,full),mtimeMs:info.mtimeMs,sha256:digest(await readFile(full))});}}return result;
}
for(let round=1;round<=rounds;round++){
 const projectRoot=path.join(root,`round-${round}`,'Project Copy'),projectPath=path.join(projectRoot,projectName);
 try{await access(projectPath);}catch{await cp(path.join(root,'source-project'),projectRoot,{recursive:true,dereference:true});}
 let parsed=parseGBAProjectFile(await readFile(projectPath,'utf8'));let data:any=parsed.data;
 const save=async()=>{parsed.data=data;await writeFile(projectPath,serializeGBAProjectFile(parsed));};
 const initialScene=data.scenas.find((s:any)=>s.name==='porto_lumen')??data.scenas.find((s:any)=>data.actors.some((a:any)=>a.roomName===s.name));const otherScene=data.scenas.find((s:any)=>s.name==='penedos_vento')??data.scenas.find((s:any)=>s.id!==initialScene?.id);
 if(!initialScene||!otherScene)throw Error('Benchmark requer duas cenas e um ator.');
 const actor=data.actors.find((a:any)=>a.roomName===initialScene.name&&a.name!=='Nara')??data.actors.find((a:any)=>a.roomName===initialScene.name);
 const event=data.events.find((e:any)=>e.roomName===initialScene.name&&Array.isArray(e.steps))??data.events[0];
 const asset=data.assets.find((a:any)=>a.name==='player-pilot-32x32.png')??data.assets.find((a:any)=>a.type==='sprite'&&a.metadata?.source?.endsWith('.png'));
 if(!actor||!event||!asset)throw Error('Benchmark requer ator, evento e sprite PNG.');
 let launch={id:initialScene.id,name:initialScene.name}; let priorFiles:any[]=all.filter(r=>r.round===round).at(-1)?.outputFiles??[];
 const scenarios=['cold','unchanged','actor','event','asset','other-scene'];
 if(all.some(r=>r.round===round&&r.scenario==='cold')&&!all.some(r=>r.round===round&&r.scenario==='unchanged'))priorFiles=all.find(r=>r.round===round&&r.scenario==='cold').outputFiles;
 for(const scenario of scenarios){
  if(all.some(r=>r.round===round&&r.scenario===scenario))continue;
  if(scenario==='actor'){actor.x=Number(actor.x)+1;await save();}
  if(scenario==='event'){event.steps=[...(event.steps??[]),{id:'diagnostic-wait',command:'wait 1',isEnabled:true}];await save();}
  if(scenario==='asset'){
    const source=path.resolve(projectRoot,asset.metadata.source),relative=path.relative(projectRoot,source);
    if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Asset fora da copia isolada');
    await cp(source,path.join(root,`asset-before-${round}.png`));await exec('/usr/bin/sips',['--flip','horizontal',source]);
  }
  if(scenario==='other-scene')launch={id:otherScene.id,name:otherScene.name};
  const label=`r${round}-${scenario}`,sampleDirectory=path.join(root,'samples',label);await mkdir(sampleDirectory,{recursive:true});
  const timingLog=path.join(sampleDirectory,'tool-timings.jsonl');await writeFile(timingLog,'');process.env.GBA_DIAG_TIMING_LOG=timingLog;
  const began=performance.now();const current=parseGBAProjectFile(await readFile(projectPath,'utf8'));const readMs=performance.now()-began;
  let t=performance.now();const pluginRegistry=await loadProjectPlugins(projectPath);const pluginsMs=performance.now()-t;
  t=performance.now();const prep=prepareEngineProjectExport(current.data,{enginePackPath:pack,enginePackVersion:JSON.parse(await readFile(path.join(pack,'enginepack.json'),'utf8')).version,developmentStartScene:launch,pluginRegistry});const prepareMs=performance.now()-t;
  if(!prep.generated)throw Error(prep.error);
  const destination=path.join(projectRoot,'build',prep.generated.target);
  console.log(JSON.stringify({state:'starting',round,scenario,prepareMs,scene:launch.name}));
  t=performance.now();const exp=await writeEngineSchemaExport({destination,prepared:prep.generated,assetcPath:path.join(root,'assetc-timer'),projectPath,cacheEnabled:true});const exportMs=performance.now()-t;
  t=performance.now();const doctor=await exec(path.join(pack,'tools/gbsdoctor'),['--engine-pack',pack,'--project-dir',destination,'--json','--skip-toolchain'],{timeout:20000,maxBuffer:8*1024*1024});const doctorMs=performance.now()-t;
  await writeFile(path.join(sampleDirectory,'doctor.json'),doctor.stdout);
  t=performance.now();const built=await runGbsbuild({enginePackPath:pack,gbsbuildPath:path.join(pack,'tools/gbsbuild'),projectDir:destination});const buildMs=performance.now()-t;
  await writeFile(path.join(sampleDirectory,'build.log'),(built.stdout??'')+'\n'+(built.stderr??''));
  if(built.error||!built.summary)throw Error(built.error??'No ROM');
  t=performance.now();await writeRomOccupancyArtifact(built.summary.romPath);await writeProjectMemoryReport({assetReportPath:path.join(destination,'asset_pack_report.json'),romPath:built.summary.romPath});const published=await publishEnginePackRomToProjectRoot(built,projectPath);const reportsAndPublishMs=performance.now()-t;
  if(published.error)throw Error(published.error);
  const pipelineMs=performance.now()-began;
  const toolTimings=(await readFile(timingLog,'utf8')).trim().split('\n').filter(Boolean).map(x=>JSON.parse(x));
  const stageMs=(stage:string)=>toolTimings.filter((x:any)=>x.stage===stage).reduce((n:number,x:any)=>n+x.ms,0);
  const cppSpans=toolTimings.filter((x:any)=>x.stage==='cpp');
  // Elapsed compilation spans include overlaps and gaps between compiler calls.
  // cppMs remains the sum of individual durations for workload diagnostics.
  const cppWallMs=cppSpans.length
    ? Math.max(...cppSpans.map((x:any)=>x.finishedMs))-Math.min(...cppSpans.map((x:any)=>x.startedMs)) : 0;
  const outputFiles=await files(destination);const prev=new Map(priorFiles.map(f=>[f.path,f]));
  const changed=outputFiles.filter(f=>prev.get(f.path)?.sha256!==f.sha256).map(f=>f.path);
  const unchangedRewritten=outputFiles.filter(f=>prev.has(f.path)&&prev.get(f.path).sha256===f.sha256&&prev.get(f.path).mtimeMs!==f.mtimeMs).map(f=>f.path);
  priorFiles=outputFiles;
  const manifest=JSON.parse(await readFile(path.join(destination,'gbastudio_project.json'),'utf8'));
  const result={round,scenario,scene:launch,readMs,pluginsMs,prepareMs,exportMs,assetcMs:stageMs('assetc'),exportOverheadMs:exportMs-stageMs('assetc'),doctorMs,buildMs,cppMs:stageMs('cpp'),cppWallMs,linkMs:stageMs('link'),objcopyMs:stageMs('arm-none-eabi-objcopy'),gbafixMs:stageMs('gbafix'),buildOtherMs:buildMs-cppWallMs-stageMs('link')-stageMs('arm-none-eabi-objcopy')-stageMs('gbafix'),reportsAndPublishMs,pipelineMs,cache:exp.cache,romPath:published.summary!.romPath,romSha256:digest(await readFile(published.summary!.romPath)),cppInvocations:toolTimings.filter((x:any)=>x.stage==='cpp').length,buildSources:manifest.build.sources,changed,unchangedRewritten,outputFiles,toolTimings,actor:{id:actor.id,x:actor.x,y:actor.y},event:event.id,assetSource:asset.metadata.source,projectScenes:data.scenas.length,contractSceneCount:prep.generated.contract.mixed_project?.scenes?.length};
  await cp(published.summary!.romPath,path.join(sampleDirectory,'rom.gba'));
  all.push(result);await writeFile(path.join(sampleDirectory,'result.json'),JSON.stringify(result,null,2));await writeFile(path.join(root,'results.json'),JSON.stringify(all,null,2));
  console.log(JSON.stringify({state:'complete',round,scenario,pipelineMs,prepareMs,exportMs,assetcMs:result.assetcMs,doctorMs,buildMs,cppMs:result.cppMs,cppWallMs:result.cppWallMs,cppInvocations:result.cppInvocations,cacheHit:exp.cache?.hit,romSha256:result.romSha256}));
 }
}
await writeFile(path.join(root,'measure-done.json'),JSON.stringify({count:all.length}));

await writeFile(path.join(root,'measurement-scope.json'),JSON.stringify({pipeline:'read, plugins, prepare, assetc/export, doctor, staging/compiler/link/objcopy/gbafix, reports, publication',compilerTiming:'cppWallMs spans first compiler start to last finish; cppMs sums individual durations and can exceed wall time. Tool clocks use POSIX CLOCK_MONOTONIC when available, otherwise Unix time.',player:process.env.GBA_BENCHMARK_PLAYER==='1'?'separate isolated Electron process':'not requested; first playable frame not measured',assetMutation:'sips horizontal flip in isolated project; macOS only',sampling:'sequential edits; each round starts from a fresh copy and empty cache',limitations:['Does not time UI click or renderer-to-main IPC.','Player measurements include about:blank/probe setup and are run after the pipeline.','No claim of physical GBA or player reuse validation.']},null,2));
console.log('Evidencias preservadas em '+root);
