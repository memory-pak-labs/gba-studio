import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElectronSmokeEnv, cdpSession, electronExecutablePath, terminateChild, wait, waitForRenderedText } from "./lib/electron-smoke-helpers.mjs";
import { assertCanonicalP0Source } from "./p0-source-catalog.mjs";
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = assertCanonicalP0Source(appRoot);
const output = process.env.GBA_STUDIO_DIALOGUES_LAYOUT_OUTPUT ?? join(appRoot, "artifacts/dialogues-layout/latest");
const port = Number(process.env.GBA_STUDIO_DIALOGUES_LAYOUT_CDP_PORT ?? 9472);
const temporary = await mkdtemp(join(tmpdir(), "gba-dialogues-layout-smoke-"));
const projectRoot = join(temporary, "project");
const projectPath = join(projectRoot, basename(source.projectPath));
await mkdir(output, { recursive: true });
await cp(dirname(source.projectPath), projectRoot, { recursive: true, filter: path => !["build", ".gba-cache", "node_modules", ".git"].includes(basename(path)) });
const originalProject = await readFile(source.projectPath);
const child = spawn(electronExecutablePath({ appRoot, usePackagedApp: false }), [appRoot], { cwd: appRoot,
 env: createElectronSmokeEnv({ GBA_STUDIO_OPEN_PROJECT: projectPath, GBA_STUDIO_SMOKE_USER_DATA_DIR: join(temporary, "user-data"), GBA_STUDIO_SMOKE_CDP_PORT: String(port) }), stdio: ["ignore", "pipe", "pipe"] });
let log = ""; child.stdout.on("data", data => { log += data; }); child.stderr.on("data", data => { log += data; });
let cdp, observer, previewPixels; const errors = [], captures = [], checks = [];
async function evaluate(expression) { const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails)); return result.result?.value; }
async function click(selector) { assert(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`), selector); await wait(140); }
async function capture(name) { await wait(200); const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false }); const path = join(output, `${name}.png`); await writeFile(path, Buffer.from(result.data, "base64")); captures.push(path); }
async function viewport(width, height) { await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await wait(200); }
async function verifyPreviewScale(width, height, theme) {
 const metrics = await evaluate(`(() => {
  const bounds = selector => { const e = document.querySelector(selector), b = e.getBoundingClientRect(); return { x:b.x, y:b.y, width:b.width, height:b.height }; };
  const canvas = document.querySelector('.dialogue-preview-snapshot-canvas');
  return { stage:bounds('.dialogues-preview-stage'), background:bounds('.dialogues-preview-background'), snapshot:bounds('.dialogue-preview-snapshot'), canvas:bounds('.dialogue-preview-snapshot-canvas'), native:[canvas.width,canvas.height], zoom:document.querySelector('.dialogues-preview-viewport').dataset.zoom };
 })()`);
 checks.push({name:'preview-scale',width,height,theme,metrics});
 assert.deepEqual(metrics.native,[240,160]);
 const pixels=await evaluate(`document.querySelector('.dialogue-preview-snapshot-canvas').toDataURL('image/png')`);
 if(previewPixels===undefined) {
  previewPixels=pixels;
  await writeFile(join(output,'preview-native-240x160.png'),Buffer.from(pixels.split(',')[1],'base64'));
 } else assert.equal(pixels,previewPixels,'Zoom changed the native dialogue pixels');
 for (const layer of ['background','snapshot','canvas']) {
  for (const dimension of ['x','y','width','height']) {
   assert(Math.abs(metrics[layer][dimension]-metrics.stage[dimension])<=0.5,`${layer}.${dimension} diverges from GBA stage: ${JSON.stringify(metrics)}`);
  }
 }
 assert(Math.abs(metrics.stage.width/240-metrics.stage.height/160)<=0.005,`GBA aspect ratio changed: ${JSON.stringify(metrics)}`);
 if(metrics.zoom!=='fit') assert.deepEqual([metrics.stage.width,metrics.stage.height],[240*Number(metrics.zoom),160*Number(metrics.zoom)]);
}
async function change(selector, value) {
 // Use the same DOM input/change protocol as smoke-electron-exemplo-template.
 assert(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false;if(e instanceof HTMLTextAreaElement){if(!e.closest('details')?.open)return false;e.scrollIntoView({block:'center'});e.focus();}Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true}));return true;})()`)); await wait(250); }
try {
 let target;
 for (let i=0; i<60 && !target; i++) { try { target=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==='page'); } catch {} if (!target) await wait(250); }
 assert(target, "Native Electron endpoint missing"); cdp=cdpSession(target.webSocketDebuggerUrl); await cdp.ready;
 observer = new WebSocket(target.webSocketDebuggerUrl); observer.addEventListener('message', e=>{const m=JSON.parse(e.data);if(m.method==='Runtime.exceptionThrown'||(m.method==='Log.entryAdded'&&m.params.entry.level==='error'))errors.push(m);});
 await new Promise((resolve,reject)=>{observer.addEventListener('open',resolve,{once:true});observer.addEventListener('error',reject,{once:true});}); observer.send(JSON.stringify({id:1,method:'Runtime.enable'}));observer.send(JSON.stringify({id:2,method:'Log.enable'}));
 await cdp.send('Page.enable'); await waitForRenderedText(cdp, text=>text.includes('Editor') && text.includes('Cenas'),'project');
 await click('[aria-label="Workspace Diálogos"]'); await waitForRenderedText(cdp,text=>text.includes('Páginas')&&text.includes('prologo_frame_1'),'dialogue review');
 for (const theme of ['light','dark']) {
  if(theme==='dark') await click('[aria-label="Ativar tema escuro"]');
  for (const [width,height] of [[1584,986],[1600,1000],[1104,690],[900,800]]) {
   await viewport(width,height);
   const metrics = await evaluate(`(() => {const panels=['.dialogues-rail','.dialogues-editor','.dialogues-preview-panel'].map(selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect();return{selector,x:b.x,right:b.right,width:b.width,height:b.height,overflow:e.scrollWidth-e.clientWidth}});return{width:innerWidth,overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth,panels,theme:document.documentElement.getAttribute('data-studio-theme'),background:document.querySelector('.dialogues-preview-background')?.getAttribute('src')}})()`);
   assert.equal(metrics.theme,theme);assert(metrics.overflow<=2,JSON.stringify(metrics));assert(metrics.panels.every(p=>p.width>150&&p.right<=width+2&&p.overflow<=2),JSON.stringify(metrics));assert(metrics.background.includes('prologue-frame-1-gba.png'));
   checks.push({name:'rendered-layout',width,height,theme,metrics});await capture(`${theme}-${width}x${height}`);
   for (const [index,zoom] of [[1,'1'],[2,'2'],[3,'fit']]) {
    await click(`.dialogues-preview-zoom button:nth-child(${index})`);
    await capture(`${theme}-${width}x${height}-zoom-${zoom}`);
    await verifyPreviewScale(width,height,theme);
   }
   if(width<=1050){
    assert(await evaluate(`(()=>{const text=document.querySelector('.dialogues-text-panel').getBoundingClientRect(),preview=document.querySelector('.dialogues-preview-panel').getBoundingClientRect();return preview.top>=text.bottom-1})()`),'Stacked preview overlaps text');
    await evaluate(`document.querySelector('.dialogues-test-text').scrollIntoView({block:'end'})`);
    assert(await evaluate(`(()=>{const b=document.querySelector('.dialogues-test-text').getBoundingClientRect();return b.top>0&&b.bottom<innerHeight})()`),'Compact preview controls inaccessible');
    await capture(`${theme}-${width}x${height}-preview-scrolled`);
    await evaluate(`document.querySelector('.dialogues-review-content').scrollTop=0`);
   }
  }
 }
 await viewport(1600,1000);
 await click('.dialogues-editor-actions button:first-child');assert(await evaluate(`Boolean(document.querySelector('.dialogues-validation-panel'))`));await click('.dialogues-editor-actions button:first-child');checks.push({name:'validation-disclosure',ok:true});
 const pageOne=await evaluate(`document.querySelector('.dialogue-preview-snapshot').dataset.dialoguePreviewTextLines`);
 await click('[aria-label="Próxima página"]');const pageTwo=await evaluate(`document.querySelector('.dialogue-preview-snapshot').dataset.dialoguePreviewTextLines`);assert.notEqual(pageOne,pageTwo);
 await click('[aria-label="Página anterior"]');assert.equal(await evaluate(`document.querySelector('.dialogue-preview-snapshot').dataset.dialoguePreviewTextLines`),pageOne);checks.push({name:'page-navigation',pageOne,pageTwo});
 await click('[aria-label="prologo_frame_2 · Narrador"]');assert((await evaluate(`document.querySelector('.dialogues-preview-background').src`)).includes('prologue-frame-2-gba.png'));checks.push({name:'cutscene-background',ok:true});
 await click('[aria-label="prologo_frame_1 · Narrador"]');await click('.dialogues-preview-zoom button:nth-child(2)');assert.deepEqual(await evaluate(`(()=>{const b=document.querySelector('.dialogues-preview-stage').getBoundingClientRect();return [b.width,b.height]})()`),[480,320]);await click('.dialogues-preview-zoom button:nth-child(3)');checks.push({name:'preview-zoom',ok:true});
 await click('.dialogues-test-text');assert(await evaluate(`document.querySelector('.dialogues-test-text').getAttribute('aria-pressed')==='true'`));await wait(130);assert((await evaluate(`document.querySelector('.dialogue-preview-snapshot').dataset.dialoguePreviewTextLines`)).replace(/\n/g,'').length>0);await click('.dialogues-test-text');checks.push({name:'text-reveal-and-stop',ok:true});
 await change('[aria-label="Idioma da prévia"]','es');assert.equal(await evaluate(`document.querySelector('[aria-label="Idioma da prévia"]').value`),'es');await change('[aria-label="Idioma da prévia"]','en');assert(!(await evaluate(`document.body.innerText`)).includes('Tradução ausente'));await change('[aria-label="Idioma da prévia"]','pt-BR');checks.push({name:'preview-language-and-source-text',ok:true});
 await change('[aria-label="Buscar diálogo"]','no-match-xyz');assert(await evaluate(`!document.querySelector('.dialogues-preview-panel')`));await change('[aria-label="Buscar diálogo"]','');checks.push({name:'empty-filter',ok:true});
 await click('.dialogues-additional-filters summary');await click('.dialogues-additional-filters button:nth-of-type(2)');assert((await evaluate(`document.querySelectorAll('.dialogue-row').length`))>0);await capture('choices-dark');await click('.dialogues-usage-filter button:first-child');
 await click('[aria-label="prologo_frame_1 · Narrador"]');await click('#dialogues-authoring-tab-translation');await capture('translations-dark');const translationSelector='[aria-label="Tradução de prologo_frame_1"]';const sourceText=await evaluate(`document.querySelector('.dialogues-translation-source p').textContent`);await change(translationSelector,'QA translation in temporary copy');await waitForRenderedText(cdp,text=>text.includes('Dialogo atualizado: prologo_frame_1.'),'translation update in project session');assert.equal(await evaluate(`document.querySelector(${JSON.stringify(translationSelector)}).value`),'QA translation in temporary copy');assert.equal(await evaluate(`document.querySelector('.dialogues-translation-source p').textContent`),sourceText);await capture('translations-edited-dark');checks.push({name:'translation-edit-isolated',ok:true});await click('#dialogues-authoring-tab-review');
 await click('.dialogues-preview-details summary');await capture('details-dark');checks.push({name:'details-disclosure',ok:true});
 await click('.dialogues-primary-action');await waitForRenderedText(cdp,text=>text.includes('Editor')&&text.includes('prologo_frame_1'),'scene dialogue authoring');checks.push({name:'edit-source-in-scene',ok:true});
 await click('[aria-label="Workspace Diálogos"]');await click('.dialogues-usage-entry button');await waitForRenderedText(cdp,text=>text.includes('Fala aberta no Editor: prologo_frame_1.'),'direct scene dialogue usage');checks.push({name:'open-direct-scene-usage',ok:true});
 assert.equal(errors.length,0,JSON.stringify(errors));assert.deepEqual(await readFile(source.projectPath),originalProject,'Canonical project modified');
 await writeFile(join(output,'manifest.json'),JSON.stringify({checks,captures,errors,project:source.projectPath,viewportMethod:'Electron renderer device metrics; native outer window not resized',success:true},null,2));
 console.log(JSON.stringify({success:true,checks:checks.length,captures:captures.length,output,errors:errors.length}));
} catch (error) {
 await writeFile(join(output,'manifest.json'),JSON.stringify({checks,captures,errors,failure:String(error),success:false},null,2));
 throw error;
} finally { observer?.close();cdp?.close();await terminateChild(child);await writeFile(join(output,'electron.log'),log);await rm(temporary,{recursive:true,force:true}); }
