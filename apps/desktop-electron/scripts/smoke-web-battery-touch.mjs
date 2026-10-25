import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {cdpSession, createElectronSmokeEnv, electronExecutablePath, terminateChild, wait} from './lib/electron-smoke-helpers.mjs';
import {playLostSignalMission} from './lib/lost-signal-playthrough.mjs';

// Exercise a real exported page and its production mGBA renderer. Inputs use
// CDP keyboard/touch events; telemetry is read-only and SRAM is written by menus.
const app=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [romFile,exportDir,output]=process.argv.slice(2);
assert.ok(romFile&&exportDir&&output,'Usage: node scripts/smoke-web-battery-touch.mjs ROM EXPORT OUTPUT');
fs.mkdirSync(output,{recursive:true});
const projectFile=process.argv.find(a=>a.startsWith('--project='))?.slice(10)??path.join(app,'default-assets/templates/exemplo-gba/exemplo-gba.gba-project');
const project=JSON.parse(fs.readFileSync(projectFile));
const exported=JSON.parse(fs.readFileSync(path.join(exportDir,'export_project.json')));
const bundle=path.join(output,'web-export.mjs');
await build({stdin:{contents:'export {prepareWebProjectExport,writeWebProjectExport} from "./src/main/exportWebProject.ts";',resolveDir:app},bundle:true,platform:'node',format:'esm',outfile:bundle,loader:{'.gba-project':'text'},banner:{js:"import {createRequire} from 'node:module';const require=createRequire(import.meta.url);"}});
const {prepareWebProjectExport,writeWebProjectExport}=await import(pathToFileURL(bundle));
const prepared=prepareWebProjectExport(project);assert.ok(prepared.generated,prepared.error);
const webRoot=path.join(output,'web');
await writeWebProjectExport({destination:webRoot,generated:prepared.generated,projectPath:projectFile,projectData:project,romSourcePath:path.resolve(romFile)});
const variant=Buffer.from(fs.readFileSync(romFile));
variant.write('WEBISOLATE',0xa0,'ascii');
variant[0xbd]=(-0x19-variant.subarray(0xa0,0xbd).reduce((sum,v)=>sum+v,0))&255;
const variantFile=path.join(output,'identity-variant.gba');fs.writeFileSync(variantFile,variant);
await writeWebProjectExport({destination:path.join(webRoot,'other'),generated:prepared.generated,romSourcePath:variantFile});

const server=createServer((req,res)=>{
  const pathname=new URL(req.url,'http://localhost').pathname;
  const f=path.resolve(webRoot,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
  if(!f.startsWith(webRoot+path.sep)){res.writeHead(403);res.end();return;}
  try{const ext=path.extname(f);res.writeHead(200,{'Content-Type':({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.wasm':'application/wasm','.json':'application/json'})[ext]??'application/octet-stream','Cache-Control':'no-store'});res.end(fs.readFileSync(f));}
  catch{res.writeHead(404);res.end();}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const url=`http://127.0.0.1:${server.address().port}/`;
const host=path.join(output,'browser-host.cjs');
fs.writeFileSync(host,`const {app,BrowserWindow}=require('electron');app.setPath('userData',process.env.GBS_WEB_SMOKE_PROFILE);app.whenReady().then(()=>{const w=new BrowserWindow({width:1100,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true}});w.loadURL(process.env.GBS_WEB_SMOKE_URL);});app.on('window-all-closed',()=>app.quit());`);
const port=Number(process.env.GBA_STUDIO_WEB_SMOKE_CDP_PORT??9397);
const child=spawn(electronExecutablePath({appRoot:app,usePackagedApp:false}),[`--remote-debugging-port=${port}`,host],{cwd:app,env:createElectronSmokeEnv({GBS_WEB_SMOKE_URL:url,GBS_WEB_SMOKE_PROFILE:path.join(output,'UserData')}),stdio:['ignore','pipe','pipe']});
let stdout='',stderr='',cdp,held=0;
child.stdout.on('data',c=>stdout+=c);child.stderr.on('data',c=>stderr+=c);
const report={passed:false,url,captures:[],inputs:[],scope:'Real exported Web page in Chromium; canonical ROM, keyboard/touch, page reload and browser SRAM. No game-state injection.'};
const until=async(fn,label,ms=30000)=>{const end=Date.now()+ms;while(Date.now()<end){const v=await fn();if(v)return v;await wait(100);}throw Error('Timed out: '+label);};
const evaluate=async expression=>{const r=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result?.value;};
const frameExpression='document.querySelector("iframe").contentWindow';
const playerExpression=frameExpression+'.GBAStudioDirectPlayer';
// An exported Web page uses the production browser bindings, independently of
// the desktop editor's optional keyboard configuration.
const keyMap=new Map([[1,['KeyX','x',88]],[2,['KeyZ','z',90]],[4,['Backspace','Backspace',8]],[8,['Enter','Enter',13]],[16,['ArrowRight','ArrowRight',39]],[32,['ArrowLeft','ArrowLeft',37]],[64,['ArrowUp','ArrowUp',38]],[128,['ArrowDown','ArrowDown',40]]]);
async function keys(mask){for(const [bit,[code,key,windowsVirtualKeyCode]]of keyMap)if(Boolean(mask&bit)!==Boolean(held&bit))await cdp.send('Input.dispatchKeyEvent',{type:mask&bit?'keyDown':'keyUp',code,key,windowsVirtualKeyCode});held=mask;}
async function ready(){
  held=0;
  await until(()=>evaluate('Boolean(document.querySelector("iframe")?.contentWindow?.GBAStudioDirectPlayer?.inspectRuntime().state)'),'Web player starts');
  await evaluate(`(()=>{const w=${frameExpression},q=new Map();let id=0,time=w.performance.now();w.requestAnimationFrame=f=>{q.set(++id,f);return id;};w.cancelAnimationFrame=id=>q.delete(id);w.__webSmokeClock={get ready(){return q.size>0},run(n){for(let i=0;i<n;i++){time+=1000/60;const jobs=[...q.values()];q.clear();for(const f of jobs)f(time);}}};${playerExpression}.canvas.focus();})()`);
  await until(()=>evaluate(frameExpression+'.__webSmokeClock.ready'),'Web render clock');
}
const driver={
  state:()=>evaluate(playerExpression+'.inspectRuntime().state'),
  telemetry:()=>driver.state(),
  async run(frames,mask){await keys(mask);await evaluate(`${frameExpression}.__webSmokeClock.run(${frames})`);report.inputs.push({frames,keys:mask});},
  async capture(label){const shot=await cdp.send('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(output,label+'.png'),Buffer.from(shot.data,'base64'));report.captures.push({label,state:await driver.state()});},
  // The journey only uses this after opening Porto; the authored intro is
  // dismissed through Start. No native memory is read or modified here.
  dialogue:async()=>false
};
try{
  const target=await until(async()=>{try{return(await(await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'&&t.webSocketDebuggerUrl);}catch{return null;}},'browser CDP');
  cdp=cdpSession(target.webSocketDebuggerUrl);await cdp.ready;await cdp.send('Page.enable');await ready();
  await playLostSignalMission(driver,project,exported,{journey:async controls=>{
    // Dismiss the authored introductory text with real B presses before walking.
    for(let n=0;n<8;n++)await controls.tap(2,20);
    await controls.walkTo(55,48);await driver.run(7,16);await driver.run(4,0);
    await controls.saveSlot(1,'desktop-manual-save');
  }});
  const saved=(await driver.state()).player;
  await driver.run(240,0);await keys(0);
  await until(()=>evaluate(`${playerExpression}.canvas.dataset.save==='saved'`),'browser SRAM flushed');
  const manifest=JSON.parse(fs.readFileSync(path.join(webRoot,'manifest.json')));
  const romHash=await evaluate('window.GBAStudioPlayerConfig.romSha256');
  const storageKey='gba-studio:web-battery:v1:'+romHash;
  const stored=await evaluate(`localStorage.getItem(${JSON.stringify(storageKey)})`);assert.ok(stored&&JSON.parse(stored).romSha256===romHash);
  report.romSha256=romHash;report.desktopSave=true;report.manifest=manifest;
  await cdp.send('Page.reload');await ready();
  assert.equal(await evaluate(`${playerExpression}.canvas.dataset.save`),'restored');
  await driver.run(180,0);
  const controls=await playLostSignalMission(driver,project,exported,{resume:true});
  await controls.loadSlot(1,'web-page-reload');
  assert.deepEqual((await driver.state()).player,saved,'Page reload loads the position and facing saved by the game');
  report.reloadSaveLoad=true;

  await cdp.send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  await driver.run(4,0);
  const bounds=await evaluate(`(()=>{const frame=document.querySelector('iframe').getBoundingClientRect(),w=${frameExpression};return [...w.document.querySelectorAll('[data-gba-key]')].map(b=>{const r=b.getBoundingClientRect();return {key:Number(b.dataset.gbaKey),x:frame.x+r.x+r.width/2,y:frame.y+r.y+r.height/2,bottom:frame.y+r.bottom,right:frame.x+r.right};});})()`);
  assert.equal(bounds.length,10);assert.ok(bounds.every(b=>b.x>=0&&b.right<=390&&b.y>=0&&b.bottom<=844),'All ten touch targets fit the portrait viewport');
  const touch=async(type,buttons)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:buttons.map((key,id)=>{const p=bounds.find(p=>p.key===key);return {id,x:p.x,y:p.y,radiusX:4,radiusY:4,force:1};})});
  await touch('touchStart',[16,128]);await driver.run(16,0);
  assert.equal((await driver.state()).input.held&144,144,'Two touch contacts reach native diagonal input');
  await touch('touchEnd',[]);await driver.run(4,0);assert.equal((await driver.state()).input.held&144,0);
  await touch('touchStart',[16,1]);await driver.run(4,0);assert.equal((await driver.state()).input.held&17,17,'D-pad and A can be held together');
  await touch('touchCancel',[]);await driver.run(4,0);assert.equal((await driver.state()).input.held&17,0,'Cancelled contacts release native input');
  await driver.capture('mobile-controls');report.touch={diagonal:true,simultaneousAction:true,cancel:true,portraitFits:true};
  await keys(32);await driver.run(3,32);
  await evaluate(`${frameExpression}.dispatchEvent(new Event('blur'))`);held=0;
  await driver.run(4,0);assert.equal((await driver.state()).input.held,0,'Losing focus releases held keyboard input');report.blurRelease=true;

  await cdp.send('Page.navigate',{url:url+'other/'});await ready();await driver.run(180,0);
  const otherHash=await evaluate('window.GBAStudioPlayerConfig.romSha256');assert.notEqual(otherHash,romHash);
  const otherData=await evaluate(playerExpression+'.inspectSaveData()');
  assert.equal(otherData.slot,null,'A different ROM identity does not load the first ROM save');
  assert.equal(await evaluate(`localStorage.getItem(${JSON.stringify(storageKey)})`),stored,'The first ROM save remains intact');report.romIsolation=true;

  await cdp.send('Page.addScriptToEvaluateOnNewDocument',{source:`Object.defineProperty(window,'localStorage',{get(){throw new DOMException('Storage blocked by test','SecurityError');}});`});
  await cdp.send('Page.navigate',{url});await ready();
  await until(()=>evaluate(`${playerExpression}.canvas.dataset.save==='unavailable'`),'storage-blocked status',10000);
  await driver.run(20,0);assert.ok((await driver.state()).frame>0);await driver.capture('storage-unavailable');report.storageBlocked={visibleMessage:true,gameContinues:true};
  report.passed=true;
}catch(error){report.error=error.stack;try{await driver.capture('failure');}catch{}process.exitCode=1;}
finally{
  fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)+'\n');fs.writeFileSync(path.join(output,'browser.stdout.log'),stdout);fs.writeFileSync(path.join(output,'browser.stderr.log'),stderr);
  cdp?.close();await terminateChild(child);await new Promise(resolve=>server.close(resolve));
}
console.log(JSON.stringify({passed:report.passed,output,error:report.error}));
