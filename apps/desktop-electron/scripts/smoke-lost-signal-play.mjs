import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { copySmokeProject, cdpSession, createElectronSmokeEnv, electronExecutablePath, terminateChild, wait } from './lib/electron-smoke-helpers.mjs';
import { resolveExemploSmokeFaceButton } from './exemplo-scene-playtest-contract.mjs';
import { playShowcaseEnding } from './lib/showcase-ending-playthrough.mjs';
import { readNativeUI, runtimeNativeSymbols } from './lib/native-ui-diagnostics.mjs';
import { playShowcaseSystems } from './lib/showcase-systems-playthrough.mjs';
import { playFarolRelay } from './lib/farol-relay-playthrough.mjs';
import { playLostSignalMission, lostSignalInventoryIndices } from './lib/lost-signal-playthrough.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2];
assert.ok(output, 'Usage: node scripts/smoke-lost-signal-play.mjs OUTPUT');
fs.mkdirSync(output, {recursive:true});
const port = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9398);
const template = path.join(app, 'default-assets/templates/exemplo-gba');
const copy = path.join(output, 'project');
await copySmokeProject(template, copy);
const projectPath = path.join(copy, 'exemplo-gba.gba-project');
const project = JSON.parse(fs.readFileSync(projectPath));
const endingPath=Number(process.argv.find(a=>a.startsWith('--ending='))?.split('=')[1]??0);
if(endingPath){assert.ok([1,2].includes(endingPath));project.variables.find(v=>v.name==='var_council_path').initialValue=endingPath;const entry=project.events.find(e=>e.name===project.scenas.find(s=>s.name==='circuito_final').eventBindings.onInit);entry.steps.unshift({id:'ending-fixture-pact',command:'set_variable var_council_path '+endingPath,isEnabled:true});fs.writeFileSync(projectPath,JSON.stringify(project,null,2)+'\n');}
const startScene=endingPath?'circuito_final':'titulo';
const inventoryIndices = lostSignalInventoryIndices(project);
const exportRoot = path.join(output, 'export');
const child = spawn(electronExecutablePath({appRoot:app,usePackagedApp:false}), [app], {
  cwd:app, env:createElectronSmokeEnv({ GBA_STUDIO_SMOKE_CDP_PORT:String(port), GBA_STUDIO_SMOKE_USER_DATA_DIR:path.join(output,'UserData'), GBA_STUDIO_OPEN_PROJECT:projectPath, GBA_STUDIO_SMOKE_PROJECT_SAVE_PATH:projectPath, GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT:exportRoot }), stdio:['ignore','pipe','pipe']
});
let stdout='',stderr='',main,player;
child.stdout.on('data',c=>stdout+=c); child.stderr.on('data',c=>stderr+=c);
const evaluate = async (cdp,expression) => {
  const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});
  if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result?.value;
};
const until = async (fn,label,ms=30000) => { const end=Date.now()+ms; while(Date.now()<end) { const r=await fn();if(r)return r;await wait(150); }throw Error('Timed out: '+label); };
const targets = async()=>{try{return await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();}catch{return[];}};
function files(root) { return fs.readdirSync(root,{withFileTypes:true}).flatMap(e=>e.isDirectory()?files(path.join(root,e.name)):[path.join(root,e.name)]); }
const report={passed:false,captures:[],inputs:[],scope:'Rendered Electron Play, native ROM and controller inputs. Test clock gates animation frames; no game RAM or saves are injected. Emulator snapshots are read-only diagnostics and are never loaded.'};
try {
  const target=await until(async()=> (await targets()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl),'editor CDP');
  main=cdpSession(target.webSocketDebuggerUrl);await main.ready;
  const selector=`button[aria-label*="${startScene}"]`;
  await until(()=>evaluate(main,`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).some(b=>!b.disabled && /Run only|Executar somente|Ejecutar solo/.test(b.getAttribute('aria-label')))`),'title scene Play button',60000);
  await evaluate(main,`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(b=>!b.disabled && /Run only|Executar somente|Ejecutar solo/.test(b.getAttribute('aria-label'))).click()`);
  const playTarget=await until(async()=> (await targets()).find(t=>t.id!==target.id&&/runtime\.html/.test(t.url)),'Play window',300000);
  player=cdpSession(playTarget.webSocketDebuggerUrl);await player.ready;
  await until(()=>evaluate(player,'Boolean(window.GBAStudioDirectPlayer?.inspectRuntime()?.state)'),'native Play framebuffer',60000);
  await player.send('Page.bringToFront');
  // Gate this disposable window's render clock, as a browser clock fixture does.
  // Each queued callback is the unmodified production mGBA player renderer.
  await evaluate(player,`(() => {
    const queue=new Map();let id=100000,time=performance.now();
    window.requestAnimationFrame=callback=>{queue.set(++id,callback);return id;};
    window.cancelAnimationFrame=key=>queue.delete(key);
    window.__missionClock={run(count){for(let n=0;n<count;n++){time+=1000/60;const callbacks=[...queue.values()];queue.clear();for(const callback of callbacks)callback(time);}},get ready(){return queue.size>0;}};
  })()`);
  await until(()=>evaluate(player,'window.__missionClock.ready'),'render clock gate');
  const romPath=files(exportRoot).find(f=>f.endsWith('.gba'));
  assert.ok(romPath,'Play export retains its generated ROM and matching ELF');
  const exportDir=path.dirname(path.dirname(romPath));
  const diagnosticsDir=path.join(output,'diagnostics');
  const diagnostic=spawnSync(process.execPath,[path.join(app,'scripts/smoke-lost-signal-mission.mjs'),romPath,exportDir,diagnosticsDir,'--diagnostics-only'],{encoding:'utf8',maxBuffer:8*1024*1024});
  assert.equal(diagnostic.status,0,diagnostic.stdout+diagnostic.stderr);
  const native=JSON.parse(fs.readFileSync(path.join(diagnosticsDir,'report.json'))),d=native.diagnostics;
  const romBytes=fs.readFileSync(romPath);
  const exported=JSON.parse(fs.readFileSync(path.join(exportDir,'export_project.json')));
  Object.assign(report,{romPath,exportDir,romSha256:native.romSha256,diagnostics:d});
  const a=resolveExemploSmokeFaceButton(project.settings.controls,'a'),b=resolveExemploSmokeFaceButton(project.settings.controls,'b');
  const shoulder=project.settings.controls.rButton.split(',')[0].trim().toUpperCase();
  const controls=new Map([[1,a],[2,b],[4,{code:'ShiftLeft',key:'Shift',windowsVirtualKeyCode:16}],[8,{code:'Enter',key:'Enter',windowsVirtualKeyCode:13}],[16,{code:'ArrowRight',key:'ArrowRight',windowsVirtualKeyCode:39}],[32,{code:'ArrowLeft',key:'ArrowLeft',windowsVirtualKeyCode:37}],[64,{code:'ArrowUp',key:'ArrowUp',windowsVirtualKeyCode:38}],[128,{code:'ArrowDown',key:'ArrowDown',windowsVirtualKeyCode:40}],[256,{code:'Key'+shoulder,key:shoulder.toLowerCase(),windowsVirtualKeyCode:shoulder.charCodeAt(0)}]]);
  let held=0,cached=null;
  async function snapshot() {
    if(cached)return cached;
    const result=await evaluate(player,`(() => {
      const p=window.GBAStudioDirectPlayer,previous=new Map(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));
      try {p.save();const encoded=Object.keys(localStorage).filter(k=>localStorage.getItem(k)!==previous.get(k)).map(k=>localStorage.getItem(k))[0] || [...previous.values()].find(v=>v?.length>100000);return {state:p.inspectRuntime().state,encoded};}
      finally {for(const k of Object.keys(localStorage)){if(!previous.has(k))localStorage.removeItem(k);else if(localStorage.getItem(k)!==previous.get(k))localStorage.setItem(k,previous.get(k));}}
    })()`);
    assert.ok(result.encoded,'Read-only Play snapshot is available');
    cached={state:result.state,bytes:Buffer.from(result.encoded,'base64')};return cached;
  }
  const word=(bytes,address)=>bytes.readInt32LE((address>=0x03000000?d.iwramOffset+address-0x03000000:d.ewramOffset+address-0x02000000));
  function addressFor({state,bytes}) {
    const candidates=d.eventStatesByRuntime[state.runtimeKind]?[d.eventStatesByRuntime[state.runtimeKind]]:d.eventStates;
    const matches=candidates.filter(a=>state.variables.every((v,i)=>word(bytes,a+d.layout.variables+i*4)===v));
    assert.ok(matches.length,'Snapshot variables agree with the native Play telemetry');
    const score=a=>Number(word(bytes,a+d.layout.room)===state.currentRoom)+Number(word(bytes,a+d.layout.playerX)===state.player.x)+Number(word(bytes,a+d.layout.playerY)===state.player.y);
    return matches.sort((a,b)=>score(b)-score(a))[0];
  }
  const driver={
    async telemetry(){return evaluate(player,'window.GBAStudioDirectPlayer.inspectRuntime().state');},
    async state(){const s=await snapshot();if(![0,3,5,7,8,9].includes(s.state.runtimeKind))return s.state;const addr=addressFor(s);return {...s.state,variables:Array.from({length:64},(_,i)=>word(s.bytes,addr+d.layout.variables+i*4))};},
    async run(frames,keys){
      for(const [bit,key] of controls)if(Boolean(held&bit)!==Boolean(keys&bit))await player.send('Input.dispatchKeyEvent',{type:keys&bit?'keyDown':'keyUp',...key});
      held=keys;await evaluate(player,`window.__missionClock.run(${frames})`);cached=null;report.inputs.push({frames,keys});
    },
    async dialogue(){const {bytes}=await snapshot();return d.dialogues.some(a=>(word(bytes,a)&255)===1 && word(bytes,a+8)>=0x08000000 && word(bytes,a+8)<0x0a000000);},
    async modal(){const {bytes}=await snapshot();return (word(bytes,d.modal.address)&255)===1;},
    async ui(){const {bytes}=await snapshot();const byte=a=>a>=0x08000000?romBytes[a-0x08000000]:bytes[(a>=0x03000000?d.iwramOffset+a-0x03000000:d.ewramOffset+a-0x02000000)];const string=a=>{let s='';for(let n=0;n<2048&&a;n++){const v=byte(a+n);if(!v)break;s+=String.fromCharCode(v);}return s;};return readNativeUI(runtimeNativeSymbols(d.symbols,(await snapshot()).state.runtimeKind),d.layouts,byte,a=>byte(a)|byte(a+1)<<8|byte(a+2)<<16|byte(a+3)<<24,string);},
    async equipped(slot=0){const s=await snapshot();return word(s.bytes,addressFor(s)+d.layout.equipped+slot*4);},
    async race(){
      const addr=d.symbols.find(s=>s.name.endsWith('::runtime_state')&&s.size===48).address,offset=addr>=0x03000000?d.iwramOffset+addr-0x03000000:d.ewramOffset+addr-0x02000000;
      return evaluate(player,`(() => {
        const p=window.GBAStudioDirectPlayer,previous=new Map(Object.keys(localStorage).map(k=>[k,localStorage.getItem(k)]));
        try{p.save();const encoded=Object.keys(localStorage).filter(k=>localStorage.getItem(k)!==previous.get(k)).map(k=>localStorage.getItem(k))[0]||[...previous.values()].find(v=>v?.length>100000);const bytes=atob(encoded),o=${offset};const word=n=>bytes.charCodeAt(o+n)|bytes.charCodeAt(o+n+1)<<8|bytes.charCodeAt(o+n+2)<<16|bytes.charCodeAt(o+n+3)<<24;return{x:word(0)/256,y:word(4)/256,laps:word(16),gates:word(24),result:bytes.charCodeAt(o+32),heading:bytes.charCodeAt(o+36)};}
        finally{for(const k of Object.keys(localStorage)){if(!previous.has(k))localStorage.removeItem(k);else if(localStorage.getItem(k)!==previous.get(k))localStorage.setItem(k,previous.get(k));}}
      })()`);
    },
    async currency(){const s=await snapshot();return word(s.bytes,addressFor(s)+d.layout.inventory);},
    async item(key){assert.ok(Number.isInteger(inventoryIndices[key]));const s=await snapshot();return word(s.bytes,addressFor(s)+d.layout.inventory+inventoryIndices[key]*4);},
    async saveInfo(){return evaluate(player,'window.GBAStudioDirectPlayer.inspectSaveData()');},
    async checkpoint(label){fs.writeFileSync(path.join(output,label+'-save.json'),JSON.stringify(await this.saveInfo(),null,2));},
    async reboot(){await this.run(1,0);await evaluate(player,'window.GBAStudioDirectPlayer.reset()');cached=null;},
    async capture(label){
      const data=await evaluate(player,'window.GBAStudioDirectPlayer.canvas.toDataURL("image/png").split(",")[1]');
      fs.writeFileSync(path.join(output,label+'.png'),Buffer.from(data,'base64'));
      const shot=await player.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,label+'-play.png'),Buffer.from(shot.data,'base64'));
      report.captures.push({label,state:await this.state()});console.log(label);
    }
  };
  if(endingPath){
    const traceDir=path.join(output,'native-ending');
    const nativeRun=spawnSync(process.execPath,[path.join(app,'scripts/smoke-lost-signal-mission.mjs'),romPath,exportDir,traceDir,'--ending='+endingPath],{encoding:'utf8',maxBuffer:8*1024*1024});
    assert.equal(nativeRun.status,0,nativeRun.stdout+nativeRun.stderr);
    const trace=JSON.parse(fs.readFileSync(path.join(traceDir,'report.json')));assert.equal(trace.romSha256,report.romSha256);
    await driver.reboot();Object.assign(report,await playShowcaseEnding(driver,project,JSON.parse(fs.readFileSync(path.join(app,'fixtures/asset-provenance/racing-approved-manifest.json'))),endingPath),{nativeReport:path.join(traceDir,'report.json')});
  }else Object.assign(report,await (process.argv.includes('--relay')?playFarolRelay:process.argv.includes('--showcase')?playShowcaseSystems:playLostSignalMission)(driver,project,exported));
  report.audio=await evaluate(player,'window.GBAStudioDirectPlayer.inspectAudio()');
} catch(error) {report.error=String(error);throw error;}
finally {
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(output,'electron.log'),stdout+'\n'+stderr);
  main?.close();player?.close();await terminateChild(child);
}
