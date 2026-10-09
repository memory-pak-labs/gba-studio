import { Worker } from 'node:worker_threads';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { validatePlan } from './lib/gameplay-exploration.mjs';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i++){
  const key=args[i];if(key==='--jev'){options.useJev=true;continue;}
  if(!['--rom','--plan','--out','--replay'].includes(key)||!args[i+1]||args[i+1].startsWith('--'))throw Error('Uso: --rom ROM --plan JSON --out NOVO_DIRETORIO [--jev], ou --replay DIRETORIO em vez de --plan.');
  options[key.slice(2)]=args[++i];
}
if(!options.rom||!options.out||Boolean(options.plan)===Boolean(options.replay))throw Error('Informe --rom, --out e exatamente um de --plan/--replay.');
if(options.replay&&options.useJev)throw Error('Replay usa entradas gravadas, sem Jev.');
async function boundedFile(file,max){const s=await stat(file);if(!s.isFile()||s.size>max)throw Error('Arquivo ausente ou excede o limite.');return file;}
const romPath=resolve(options.rom);await boundedFile(romPath,32*1024*1024);
let plan;const replayDirectory=options.replay?resolve(options.replay):undefined;
if(options.plan){await boundedFile(options.plan,16384);plan=validatePlan(JSON.parse(await readFile(options.plan,'utf8')));}
if(replayDirectory){await boundedFile(join(replayDirectory,'replay.json'),65536);await boundedFile(join(replayDirectory,'initial.state'),8*1024*1024);await boundedFile(join(replayDirectory,'initial.save'),1024*1024);}
const out=resolve(options.out);await mkdir(out,{mode:0o700}); // Refuse overwrite, including previous evidence.
if(options.useJev)console.log('Jev opt-in: até 4 resumos numéricos; nenhum nome, ROM, imagem ou caminho será enviado. Sem configuração, fallback local.');
const worker=new Worker(new URL('./lib/gameplay-mgba-worker.mjs',import.meta.url),{workerData:{romPath,out,plan,replayDirectory,useJev:Boolean(options.useJev)},stdout:true,stderr:true});
const partial={initial:null,attemptedInputs:[],lastObserved:null};
// Discard emulator chatter; reports use structured observations only.
worker.stdout.resume();worker.stderr.resume();
const result=await new Promise(resolveResult=>{
  let done=false;
  const finish=result=>{if(done)return;done=true;clearTimeout(timer);resolveResult(result);};
  const timer=setTimeout(()=>{void worker.terminate();finish({ok:false,code:'wall-time-limit',status:'inconclusive'});},45000);
  worker.on('message',message=>{
    if(message.type==='initial'){partial.initial=message;return;}
    if(message.type==='progress'){
      if(partial.attemptedInputs.length<4800)partial.attemptedInputs.push(message.mask);
      partial.lastObserved=message.before;return;
    }
    finish(message);
  });worker.on('error',()=>finish({ok:false,code:'worker-error',status:'inconclusive'}));
  worker.on('exit',()=>finish({ok:false,code:'worker-exit',status:'inconclusive'}));
});
await worker.terminate();
if(!result.ok)await writeFile(join(out,'failure.json'),JSON.stringify({...result,partial},null,2),{flag:'wx',mode:0o600});
console.log(JSON.stringify({out,...result},null,2));
process.exitCode=!result.ok||!result.reproduced?2:result.findings.some(f=>f.status==='confirmed-invariant')?1:0;
