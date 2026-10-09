import {app,BrowserWindow} from 'electron';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createRomPlayerServer,romPlayerBrowserWindowOptions} from '../src/main/romPlayerWindow.js';
import {deriveGBAKeyboardBindings} from '../src/shared/gbaControls.js';
process.on('uncaughtException',e=>{console.error(e);process.exit(1)});
process.on('unhandledRejection',e=>{console.error(e);process.exit(1)});
const root=process.argv[2];app.setName('GBA Play Diagnostic');app.setPath('userData',path.join(root,'electron-user-data'));app.setPath('sessionData',path.join(root,'electron-session-data'));
const probe=`(() => {
 window.__diag={frames:0};
 const real=CanvasRenderingContext2D.prototype.putImageData;
 CanvasRenderingContext2D.prototype.putImageData=function(image,...args){
  const t=performance.now(),d=window.__diag;d.frames++;
  if(d.firstDrawMs===undefined)d.firstDrawMs=t;
  if(image.width===240&&image.height===160){let min=765,max=0;for(let i=0;i<image.data.length;i+=4){const n=image.data[i]+image.data[i+1]+image.data[i+2];min=Math.min(min,n);max=Math.max(max,n);}if(max>min+50){if(d.firstNonblankMs===undefined)d.firstNonblankMs=t;const state=window.GBAStudioDirectPlayer?.inspectPresentedRuntime?.().state;if(state?.currentRoom>=0&&state?.frame>0&&d.sceneDrawMs===undefined)d.sceneDrawMs=t;}}
  return real.call(this,image,...args);
 };
 const instantiate=WebAssembly.instantiate;
 WebAssembly.instantiate=async function(...args){const t=performance.now();const result=await instantiate.apply(this,args);window.__diag.wasmInstantiateMs=(window.__diag.wasmInstantiateMs??0)+(performance.now()-t);return result;};
})()`;
const results:any[]=[];
async function run(){
await app.whenReady();app.dock?.hide();
try {
 const samples=JSON.parse(await readFile(path.join(root,'results.json'),'utf8')).filter((sample:any)=>['cold','unchanged','actor','event','asset','other-scene'].includes(sample.scenario));
 const keyboardBindings=deriveGBAKeyboardBindings(JSON.parse(await readFile(path.join(root,'source-project',path.basename(process.env.GBA_BENCHMARK_PROJECT!)),'utf8')));
 for(const sample of samples){
  console.log(JSON.stringify({state:'player-starting',round:sample.round,scenario:sample.scenario}));
  const began=performance.now();let t=performance.now();
  const server=await createRomPlayerServer({romPath:path.join(root,'samples',`r${sample.round}-${sample.scenario}`,'rom.gba'),title:'isolated-'+sample.round+'-'+sample.scenario,webPlayerRoot:path.join(root,'WebPlayer'),keyboardBindings});const serverMs=performance.now()-t;
  t=performance.now();const win=new BrowserWindow(romPlayerBrowserWindowOptions(path.join(root,'main')));win.webContents.setAudioMuted(true);const windowCreateMs=performance.now()-t;
  const errors:string[]=[];win.webContents.on('console-message',(_e,level,message)=>{if(level>=3)errors.push(message);});
  const initialBlankStarted=performance.now();await win.loadURL('about:blank');const initialBlankMs=performance.now()-initialBlankStarted;
  t=performance.now();win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Page.enable');await win.webContents.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:probe});const probeSetupMs=performance.now()-t;
  const navigationStarted=performance.now();t=navigationStarted;await win.loadURL(server.url);const documentLoadMs=performance.now()-t;let observed:any;
  const deadline=performance.now()+20000;
  do {
   observed=await win.webContents.executeJavaScript(`({timing:window.__diag,ready:!!window.GBAStudioDirectPlayer,state:window.GBAStudioDirectPlayer?.inspectPresentedRuntime?.().state,frame:window.GBAStudioDirectPlayer?.inspectFrame?.(),error:document.querySelector('#runtime-game')?.dataset.directError,resources:performance.getEntriesByType('resource').map(r=>({name:r.name,duration:r.duration,startTime:r.startTime,responseEnd:r.responseEnd}))})`);
   if(observed.error)throw Error(observed.error);
   if(observed.timing?.sceneDrawMs!==undefined&&observed.state?.currentRoom>=0&&observed.frame?.meaningful)break;
   await new Promise(r=>setTimeout(r,10));
  }while(performance.now()<deadline);
  const readinessObservedMs=performance.now()-began;
  const navigationToReadyMs=performance.now()-navigationStarted;
  if(!(observed.timing?.sceneDrawMs!==undefined&&observed.state?.currentRoom>=0&&observed.state?.frame>0&&observed.frame?.meaningful))throw Error('No playable scene frame');
  const before=observed.state;
  await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown',{code:'ArrowRight',key:'ArrowRight',bubbles:true}))`);
  await new Promise(r=>setTimeout(r,80));
  const after=await win.webContents.executeJavaScript(`window.GBAStudioDirectPlayer.inspectRuntime().state`);
  await win.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keyup',{code:'ArrowRight',key:'ArrowRight',bubbles:true}))`);
  const inputAccepted=Boolean(after?.input?.held&16)||before.player?.x!==after?.player?.x||before.player?.y!==after?.player?.y;
  const screenshot=await win.webContents.capturePage();await writeFile(path.join(root,'samples',`r${sample.round}-${sample.scenario}`,'player-frame.png'),screenshot.toPNG());
  const result={round:sample.round,scenario:sample.scenario,serverMs,windowCreateMs,initialBlankMs,probeSetupMs,documentLoadMs,navigationToReadyMs,readinessObservedMs,observed,inputAccepted,before,after,errors,windowVisible:win.isVisible(),totalWithSequentialPlayerMs:sample.pipelineMs+readinessObservedMs};results.push(result);
  await writeFile(path.join(root,'player-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify({round:sample.round,scenario:sample.scenario,readinessObservedMs,firstNonblankMs:observed.timing.firstNonblankMs,inputAccepted,runtimeKind:before.runtimeKind,currentRoom:before.currentRoom}));
  await win.webContents.executeJavaScript('window.GBAStudioDirectPlayer.destroy()');win.destroy();await server.close();
 }
}finally{app.quit();}
}
void run().catch(e=>{console.error(e);app.quit();process.exitCode=1;});
