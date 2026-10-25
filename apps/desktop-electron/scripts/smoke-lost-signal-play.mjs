import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { copySmokeProject, cdpSession, createElectronSmokeEnv, electronExecutablePath, terminateChild, wait } from './lib/electron-smoke-helpers.mjs';
import { resolveExemploSmokeFaceButton } from './exemplo-scene-playtest-contract.mjs';
import { playShowcaseEnding } from './lib/showcase-ending-playthrough.mjs';
import { readNativeUI, readNativePlayerAnimation, readNativeCoastState, readNativeAudio, runtimeNativeSymbols } from './lib/native-ui-diagnostics.mjs';
import { playShowcaseSystems } from './lib/showcase-systems-playthrough.mjs';
import { playFarolRelay } from './lib/farol-relay-playthrough.mjs';
import { playLostSignalMission, lostSignalInventoryIndices } from './lib/lost-signal-playthrough.mjs';
import { playCampaignEvolutions } from './lib/campaign-evolutions-playthrough.mjs';
import { playTopdownMovement } from './lib/topdown-movement-playthrough.mjs';
import { playCoastDepth } from './lib/coast-depth-playthrough.mjs';
import { playExampleEncore } from './lib/encore-playthrough.mjs';
import { encoreEndingFixture } from './lib/encore-test-fixture.mjs';
import {tideAnnexTestFixture} from './lib/tide-annex-test-fixture.mjs';
import {playTideAnnex} from './lib/tide-annex-playthrough.mjs';
import { createMovementRecorder } from './lib/movement-video-recorder.mjs';
import { playInitialMenuAudio } from './lib/initial-menu-audio-playthrough.mjs';
import { decodeMGBAHardwareVideoState } from './native-scene-framebuffer-contract.mjs';
import { decodePngRgba } from './lib/png-icons.mjs';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const output = process.argv[2];
assert.ok(output, 'Usage: node scripts/smoke-lost-signal-play.mjs OUTPUT');
fs.mkdirSync(output, {recursive:true});
const movementRecorder = createMovementRecorder(output, process.argv.includes('--movement-video'));
const port = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9398);
const reviewProject=process.argv.find(a=>a.startsWith('--project='))?.slice(10);
const template = reviewProject?path.dirname(path.resolve(reviewProject)):path.join(app, 'default-assets/templates/exemplo-gba');
const copy = path.join(output, 'project');
await copySmokeProject(template, copy);
const projectPath = path.join(copy, 'exemplo-gba.gba-project');
const sourceProject = JSON.parse(fs.readFileSync(projectPath));
const tideMode=process.argv.find(a=>a.startsWith('--tide='))?.slice(7);
const project = tideMode&&tideMode!=='room'?tideAnnexTestFixture(sourceProject):process.argv.includes('--encore=epilogue')?encoreEndingFixture(sourceProject):sourceProject;
if(project!==sourceProject)fs.writeFileSync(projectPath,JSON.stringify(project,null,2)+'\n');
const endingPath=Number(process.argv.find(a=>a.startsWith('--ending='))?.split('=')[1]??0);
if(endingPath){assert.ok([1,2].includes(endingPath));project.variables.find(v=>v.name==='var_council_path').initialValue=endingPath;const entry=project.events.find(e=>e.name===project.scenas.find(s=>s.name==='circuito_final').eventBindings.onInit);entry.steps.unshift({id:'ending-fixture-pact',command:'set_variable var_council_path '+endingPath,isEnabled:true});fs.writeFileSync(projectPath,JSON.stringify(project,null,2)+'\n');}
const startScene=process.argv.find(a=>a.startsWith('--start='))?.slice(8)??(endingPath?'circuito_final':'titulo');
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
  const playTarget=await until(async()=> (await targets()).find(t=>t.id!==target.id&&/runtime\.html/.test(t.url)),'Play window',Number(process.env.GBA_STUDIO_SMOKE_PLAY_BUILD_TIMEOUT_MS??300000));
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
  const romPath=files(exportRoot).find(f=>f.endsWith('.gba')&&fs.existsSync(path.join(path.dirname(path.dirname(f)),'export_project.json')));
  assert.ok(romPath,'Play export retains its generated ROM and matching ELF');
  const exportDir=path.dirname(path.dirname(romPath));
  const diagnosticsDir=path.join(output,'diagnostics');
  const diagnostic=spawnSync(process.execPath,[path.join(app,'scripts/smoke-lost-signal-mission.mjs'),romPath,exportDir,diagnosticsDir,'--diagnostics-only','--project='+projectPath],{encoding:'utf8',maxBuffer:8*1024*1024});
  assert.equal(diagnostic.status,0,diagnostic.stdout+diagnostic.stderr);
  const native=JSON.parse(fs.readFileSync(path.join(diagnosticsDir,'report.json'))),d=native.diagnostics;
  const romBytes=fs.readFileSync(romPath);
  const exported=JSON.parse(fs.readFileSync(path.join(exportDir,'export_project.json')));
  Object.assign(report,{romPath,exportDir,romSha256:native.romSha256,diagnostics:d});
  const a=resolveExemploSmokeFaceButton(project.settings.controls,'a'),b=resolveExemploSmokeFaceButton(project.settings.controls,'b');
  const shoulder=project.settings.controls.rButton.split(',')[0].trim().toUpperCase();
  const controls=new Map([[1,a],[2,b],[4,{code:'ShiftLeft',key:'Shift',windowsVirtualKeyCode:16}],[8,{code:'Enter',key:'Enter',windowsVirtualKeyCode:13}],[16,{code:'ArrowRight',key:'ArrowRight',windowsVirtualKeyCode:39}],[32,{code:'ArrowLeft',key:'ArrowLeft',windowsVirtualKeyCode:37}],[64,{code:'ArrowUp',key:'ArrowUp',windowsVirtualKeyCode:38}],[128,{code:'ArrowDown',key:'ArrowDown',windowsVirtualKeyCode:40}],[256,{code:'Key'+shoulder,key:shoulder.toLowerCase(),windowsVirtualKeyCode:shoulder.charCodeAt(0)}]]);
  const leftShoulder=project.settings.controls.lButton.split(',')[0].trim().toUpperCase();
  controls.set(512,{code:'Key'+leftShoulder,key:leftShoulder.toLowerCase(),windowsVirtualKeyCode:leftShoulder.charCodeAt(0)});
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
    audioOutput:()=>evaluate(player,'window.GBAStudioDirectPlayer.inspectAudio()'),
    async timers(){const s=await snapshot(),a=addressFor(s),e=d.layouts.event;return Array.from({length:word(s.bytes,a+e.timer_binding_count)},(_,i)=>({script:word(s.bytes,a+e.timer_bindings+i*12),frames:word(s.bytes,a+e.timer_bindings+i*12+4),remaining:word(s.bytes,a+e.timer_bindings+i*12+8)}));},
    async animation(){const s=await snapshot();const byte=a=>a>=0x08000000?romBytes[a-0x08000000]:s.bytes[(a>=0x03000000?d.iwramOffset+a-0x03000000:d.ewramOffset+a-0x02000000)];return readNativePlayerAnimation(runtimeNativeSymbols(d.symbols,s.state.runtimeKind),d.layouts,byte,a=>word(s.bytes,a));},
    recordMovement:label=>movementRecorder.select(label),
    async camera(){const s=await snapshot(),r=exported.topdown_project.rooms[s.state.currentRoom],c=d.layouts.camera;const addresses=d.cameras.filter(a=>word(s.bytes,a+c.bounds_pixels+8)===r.width_tiles*8&&word(s.bytes,a+c.bounds_pixels+12)===r.height_tiles*8);assert.equal(addresses.length,1,'active Play camera matches room bounds');const a=addresses[0];return {x:word(s.bytes,a+c.position_pixels),y:word(s.bytes,a+c.position_pixels+4),follow:!!(word(s.bytes,a+c.follow_player)&255),bounds:[0,1,2,3].map(i=>word(s.bytes,a+c.bounds_pixels+i*4))};},
    async flight(){const s=await snapshot(),a=d.flight;assert.ok(a);return {tick:word(s.bytes,a+12)&65535,score:(word(s.bytes,a+12)>>>16)&65535,lives:word(s.bytes,a+16)&255,wave:word(s.bytes,a+8)};},
    async frame(){const data=await evaluate(player,'window.GBAStudioDirectPlayer.canvas.toDataURL("image/png").split(",")[1]');return decodePngRgba(Buffer.from(data,'base64')).pixels;},
    async hardware(){return decodeMGBAHardwareVideoState((await snapshot()).bytes);},
    async battle(){const s=await snapshot(),a=d.battle.state,b=d.layouts.battle;assert.ok(a&&d.battle.menu);let prompt='';for(let n=0;n<64&&d.battle.prompt;n++){const c=word(s.bytes,d.battle.prompt+n)&255;if(!c)break;prompt+=String.fromCharCode(c);}return {partyHp:[0,1,2,3].map(i=>word(s.bytes,a+b.party_hp+i*4)),enemyHp:word(s.bytes,a+b.enemy_hp),selectedParty:word(s.bytes,a+b.selected_party),selectedAlly:word(s.bytes,a+b.selected_ally),ability:word(s.bytes,a+b.selected_ability),pending:!!(word(s.bytes,a+b.enemy_turn_pending)&255),outcome:word(s.bytes,a+b.outcome)&255,page:word(s.bytes,d.battle.menu)&255,prompt,effectPosition:[word(s.bytes,d.battle.effect),word(s.bytes,d.battle.effect+4)]};},
    async telemetry(){return evaluate(player,'window.GBAStudioDirectPlayer.inspectRuntime().state');},
    async pcmTelemetry(){
      const s=await snapshot(),symbol=d.symbols.find(row=>row.name.endsWith('::shared_runtime_telemetry')&&row.size>=256);
      assert.ok(symbol,'Matching ELF identifies the current native PCM telemetry');const a=symbol.address;
      assert.equal(word(s.bytes,a+4),4);assert.equal(word(s.bytes,a+8),64);
      return Object.fromEntries(['pcmSourceBytes','mixerBufferBytes','activeVoiceCount','pcmUnderrunCount','pcmSubmittedBlocks'].map((key,i)=>[key,word(s.bytes,a+(59+i)*4)]));
    },
    async state(){const s=await snapshot();if(s.state.currentRoom<0||s.state.runtimeKind<0||s.state.runtimeKind>12)return s.state;const addr=addressFor(s);return {...s.state,variables:Array.from({length:64},(_,i)=>word(s.bytes,addr+d.layout.variables+i*4))};},
    async coast(){const s=await snapshot();return readNativeCoastState(s.state.runtimeKind,d.symbols,d.layouts,a=>word(s.bytes,a)&255,a=>word(s.bytes,a));},
    async audioMixer(){const s=await snapshot();return readNativeAudio(d.symbols,d.layouts,a=>word(s.bytes,a)&255);},
    async audioEnvelope(){const s=await snapshot(),a=addressFor(s);return{target:word(s.bytes,a+d.layouts.event.audio_fade_target_volume),frames:word(s.bytes,a+d.layouts.event.audio_fade_frames)};},
    async run(frames,keys){
      for(const [bit,key] of controls)if(Boolean(held&bit)!==Boolean(keys&bit))await player.send('Input.dispatchKeyEvent',{type:keys&bit?'keyDown':'keyUp',...key});
      held=keys;
      if(movementRecorder.active){
        for(let n=0;n<frames;n+=4){await evaluate(player,`window.__missionClock.run(${Math.min(4,frames-n)})`);cached=null;movementRecorder.write(await this.frame());}
      }else await evaluate(player,`window.__missionClock.run(${frames})`);
      cached=null;report.inputs.push({frames,keys});
    },
    async dialogue(){const {bytes,state}=await snapshot();return runtimeNativeSymbols(d.symbols,state.runtimeKind).filter(s=>/::(?:(?:interaction|dungeon|map)_)?dialogue$/.test(s.name)).some(({address:a})=>(word(bytes,a)&255)===1 && word(bytes,a+8)>=0x02000000 && word(bytes,a+8)<0x0a000000);},
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
      const state=await this.state();report.captures.push({label,state,battle:state.runtimeKind===11?await this.battle():undefined});console.log(label);
    }
  };
  if(process.argv.includes('--menu-audio')){
    const bounds=await evaluate(player,'(()=>{const r=document.querySelector("canvas").getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()');
    await player.send('Input.dispatchMouseEvent',{type:'mousePressed',button:'left',clickCount:1,...bounds});
    await player.send('Input.dispatchMouseEvent',{type:'mouseReleased',button:'left',clickCount:1,...bounds});
    Object.assign(report,await playInitialMenuAudio(driver));
  }
  else if(process.argv.some(a=>a.startsWith('--tide=')))Object.assign(report,await playTideAnnex(driver,project,exported,process.argv.find(a=>a.startsWith('--tide=')).slice(7),{projectRoot:copy}));
  else if(process.argv.some(a=>a.startsWith('--encore=')))Object.assign(report,await playExampleEncore(driver,project,exported,process.argv.find(a=>a.startsWith('--encore=')).slice(9)));
  else if(endingPath){
    const traceDir=path.join(output,'native-ending');
    const nativeRun=spawnSync(process.execPath,[path.join(app,'scripts/smoke-lost-signal-mission.mjs'),romPath,exportDir,traceDir,'--ending='+endingPath],{encoding:'utf8',maxBuffer:8*1024*1024});
    assert.equal(nativeRun.status,0,nativeRun.stdout+nativeRun.stderr);
    const trace=JSON.parse(fs.readFileSync(path.join(traceDir,'report.json')));assert.equal(trace.romSha256,report.romSha256);
    await driver.reboot();Object.assign(report,await playShowcaseEnding(driver,project,JSON.parse(fs.readFileSync(path.join(app,'fixtures/asset-provenance/racing-approved-manifest.json'))),endingPath),{nativeReport:path.join(traceDir,'report.json')});
  }else if(process.argv.some(a=>a.startsWith('--coast=')))Object.assign(report,await playCoastDepth(driver,project,exported,process.argv.find(a=>a.startsWith('--coast=')).slice(8),{projectRoot:copy,output}));
  else if(process.argv.includes('--topdown-movement'))Object.assign(report,await playTopdownMovement(driver,project,exported,{projectRoot:copy,output,walkAnimation:process.argv.includes('--walk-animation')}));
  else if(process.argv.some(a=>a.startsWith('--evolutions=')))Object.assign(report,await playCampaignEvolutions(driver,project,exported,process.argv.find(a=>a.startsWith('--evolutions=')).slice(13),{projectRoot:copy,output}));
  else Object.assign(report,await (process.argv.includes('--relay')?playFarolRelay:process.argv.includes('--showcase')?playShowcaseSystems:playLostSignalMission)(driver,project,exported));
  report.audio=await evaluate(player,'window.GBAStudioDirectPlayer.inspectAudio()');
} catch(error) {
  report.error=String(error);
  if(main)try{
    const shot=await main.send('Page.captureScreenshot',{format:'png'});
    fs.writeFileSync(path.join(output,'editor-failure.png'),Buffer.from(shot.data,'base64'));
    fs.writeFileSync(path.join(output,'editor-failure.txt'),await evaluate(main,'document.body.innerText'));
  }catch{}
  throw error;
}
finally {
  report.movementVideos=movementRecorder.close();
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
  fs.writeFileSync(path.join(output,'electron.log'),stdout+'\n'+stderr);
  main?.close();player?.close();await terminateChild(child);
}
