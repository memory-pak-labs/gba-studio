import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElectronSmokeEnv, cdpSession, electronExecutablePath, terminateChild, wait, waitForRenderedText } from "./lib/electron-smoke-helpers.mjs";
import { assertCanonicalP0Source } from "./p0-source-catalog.mjs";

// Render and edit a copy; never write project settings or preferences in the active session.
const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const source = assertCanonicalP0Source(appRoot);
const output = process.env.GBA_STUDIO_EXPORT_LAYOUT_OUTPUT ?? join(appRoot, "artifacts/export-layout/latest");
const port = Number(process.env.GBA_STUDIO_EXPORT_LAYOUT_CDP_PORT ?? 9475);
const temporary = await mkdtemp(join(tmpdir(), "gba-export-layout-smoke-"));
const projectRoot = join(temporary, "project");
const projectPath = join(projectRoot, basename(source.projectPath));
await mkdir(output, { recursive: true });
await cp(dirname(source.projectPath), projectRoot, { recursive: true, filter: path => !["build", ".gba-cache", "node_modules", ".git"].includes(basename(path)) });
const originalBytes = await readFile(source.projectPath);
const originalProject = JSON.parse(originalBytes);
const child = spawn(electronExecutablePath({ appRoot, usePackagedApp: false }), [appRoot], { cwd: appRoot,
  env: createElectronSmokeEnv({ GBA_STUDIO_OPEN_PROJECT: projectPath, GBA_STUDIO_SMOKE_USER_DATA_DIR: join(temporary, "user-data"), GBA_STUDIO_SMOKE_CDP_PORT: String(port) }), stdio: ["ignore", "pipe", "pipe"] });
let log = "", cdp, observer;
const errors = [], captures = [], checks = [];
child.stdout.on("data", data => { log += data; }); child.stderr.on("data", data => { log += data; });
async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function click(selector) {
  assert(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false; e.click(); return true; })()`), selector);
  await wait(160);
}
async function change(selector, value) {
  assert(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false; Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`), selector);
  await wait(600);
  await waitUntil(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); return e instanceof HTMLInputElement ? e.getAttribute('value') === ${JSON.stringify(value)} : e?.value === ${JSON.stringify(value)}; })()`, `committed field ${selector}`);
}
async function waitUntil(expression, description, timeout = 10000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await evaluate(expression)) return;
    await wait(200);
  }
  throw new Error(`Renderer did not reach expected state: ${description}`);
}
async function capture(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = join(output, `${name}.png`);
  await writeFile(path, Buffer.from(result.data, "base64")); captures.push(path);
}
async function viewport(width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await wait(180);
}
const fieldSelector = key => `[data-setting-key="${key}"] :is(input,select)`;
async function openExport() {
  await click('[aria-label="Workspace Exportar"]');
  await waitUntil(`Boolean(document.querySelector('.export-project-page'))`, "export page");
}
async function saveCopy() {
  await click('[aria-label="Salvar projeto"]');
  await waitForRenderedText(cdp, text => text.includes("Salvo"), "saved copy");
  return JSON.parse(await readFile(projectPath, "utf8"));
}
try {
  let target;
  for (let i = 0; i < 60 && !target; i++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === "page"); } catch {}
    if (!target) await wait(250);
  }
  assert(target, "Native Electron endpoint missing"); cdp = cdpSession(target.webSocketDebuggerUrl); await cdp.ready;
  observer = new WebSocket(target.webSocketDebuggerUrl);
  observer.addEventListener("message", e => { const m = JSON.parse(e.data); if (m.method === "Runtime.exceptionThrown" || (m.method === "Log.entryAdded" && m.params.entry.level === "error")) errors.push(m); });
  await new Promise((resolve, reject) => { observer.addEventListener("open", resolve, { once: true }); observer.addEventListener("error", reject, { once: true }); });
  observer.send(JSON.stringify({ id: 1, method: "Runtime.enable" })); observer.send(JSON.stringify({ id: 2, method: "Log.enable" }));
  await cdp.send("Page.enable"); await waitForRenderedText(cdp, text => text.includes("Editor") && text.includes("Cenas"), "project");
  await openExport();
  assert.equal(await evaluate(`document.querySelector('.export-rom-advanced').open`), false);
  const nav = await evaluate(`Array.from(document.querySelectorAll('.settings-nav-item')).map(e=>e.getAttribute('aria-label'))`);
  assert.equal(nav.length, 8);
  for (const label of nav) {
    await click(`[aria-label="${label}"]`);
    const state = await evaluate(`({id:document.querySelector('.export-settings-page').id,active:document.querySelectorAll('.settings-nav-item[aria-pressed="true"]').length,pages:document.querySelectorAll('.export-settings-page').length,actions:document.querySelectorAll('.export-rom-actions').length})`);
    assert.equal(state.active, 1); assert.equal(state.pages, 1); assert.equal(state.actions, 1);
    await capture(state.id); checks.push({ name: "navigation", label, ...state });
  }
  assert.deepEqual(await readFile(projectPath), originalBytes, "Navigation rewrote copied project");
  for (const theme of ["light", "dark"]) {
    await click('[aria-label="Workspace Ajustes"]'); await click(`.settings-interface-theme-choice input[value="${theme}"]`); await openExport();
    await cdp.send("DOM.enable"); await cdp.send("CSS.enable");
    const root = await cdp.send("DOM.getDocument");
    const activeTab = await cdp.send("DOM.querySelector", { nodeId: root.root.nodeId, selector: ".workspace-list .workspace.active" });
    await cdp.send("CSS.forcePseudoState", { nodeId: activeTab.nodeId, forcedPseudoClasses: ["hover"] });
    const hoverColor = await evaluate(`(() => {const e=document.querySelector('.workspace-list .workspace.active'),sample=document.createElement('span');sample.style.color='var(--studio-color-on-accent)';document.body.append(sample);const expected=getComputedStyle(sample).color;sample.remove();return{color:getComputedStyle(e).color,expected};})()`);
    await waitUntil(`getComputedStyle(document.querySelector('.workspace-list .workspace.active')).color === ${JSON.stringify(hoverColor.expected)}`, `${theme} active workspace hover`);
    hoverColor.color = await evaluate(`getComputedStyle(document.querySelector('.workspace-list .workspace.active')).color`);
    assert.equal(hoverColor.color, hoverColor.expected, `${theme} active workspace hover contrast`);
    checks.push({ name: "active-workspace-hover", theme, ...hoverColor });
    for (const [width, height] of [[1586, 992], [1600, 1000], [1104, 690], [900, 800]]) {
      await viewport(width, height);
      const metrics = await evaluate(`(() => {const panels=['.settings-nav','.settings-main-panel','.export-project-page'].map(s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return{selector:s,x:b.x,right:b.right,width:b.width,overflow:e.scrollWidth-e.clientWidth}});return{width:innerWidth,overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth,theme:document.documentElement.dataset.studioTheme,panels}})()`);
      assert.equal(metrics.theme, theme); assert(metrics.overflow <= 2, JSON.stringify(metrics));
      assert(metrics.panels.every(p => p.width > 150 && p.right <= width + 2 && p.overflow <= 2), JSON.stringify(metrics));
      await capture(`${theme}-${width}x${height}`); checks.push({ name: "layout", width, height, theme, metrics });
      await evaluate(`document.querySelector('.export-rom-actions').scrollIntoView({block:'end'})`);
      assert(await evaluate(`document.querySelector('.export-rom-actions').getBoundingClientRect().bottom<innerHeight`), "ROM actions inaccessible");
      if (width === 900) await capture(`${theme}-900x800-scrolled`);
      await evaluate(`document.querySelector('.settings-main-panel').scrollTop=0`);
    }
    await cdp.send("CSS.forcePseudoState", { nodeId: activeTab.nodeId, forcedPseudoClasses: [] });
  }
  await click('[aria-label="Workspace Ajustes"]'); await click('[name="studio-ui-font-size"][value="large"]'); await click('[name="studio-ui-contrast"][value="high"]'); await openExport(); await viewport(900,800);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+2&&document.querySelector('.export-project-page').scrollWidth<=document.querySelector('.export-project-page').clientWidth+2`));
  await capture("dark-900x800-large-high-contrast"); checks.push({ name: "large-high-contrast", ok: true });
  await click('[aria-label="Workspace Ajustes"]'); await click('[name="studio-ui-font-size"][value="compact"]'); await click('[name="studio-ui-contrast"][value="standard"]'); await click('.settings-interface-theme-choice input[value="light"]'); await viewport(1586,992); await openExport();
  await change('[aria-label="Buscar ajustes"]', "código do jogo"); await click('[aria-label="Abrir Projeto e ROM"]');
  assert(await evaluate(`Boolean(document.querySelector('.export-project-page'))`));
  await change('[aria-label="Buscar ajustes"]', "engine pack"); await click('[aria-label="Abrir Compilação"]');
  assert(await evaluate(`Boolean(document.querySelector('#settings-section-build'))`));
  await change('[aria-label="Buscar ajustes"]', "no-match-xyz"); assert((await evaluate(`document.querySelector('.settings-search-results').innerText`)).includes("Nenhum ajuste encontrado"));
  await change('[aria-label="Buscar ajustes"]', ""); checks.push({ name: "search-routing", ok: true });
  await click('[aria-label="Projeto e ROM seção de ajustes"]');
  await change(fieldSelector("gameTitle"), "Export QA"); await change(fieldSelector("author"), "QA"); await change(fieldSelector("version"), "1.2.3");
  await change(fieldSelector("startScene"), "porto_lumen"); await change(fieldSelector("startPlayer"), "Nara");
  await change(fieldSelector("romFileName"), "layout-test.gba"); await change(fieldSelector("exportFolder"), "build-export-layout");
  await waitUntil(`document.querySelector('.export-output-hint').innerText.endsWith("build-export-layout/layout_test/layout_test.gba")`, "updated output path");
  await click('.export-rom-advanced summary'); await change(fieldSelector("gameCode"), "LAYT");
  await click('.export-rom-advanced summary');
  const saved = await saveCopy();
  assert.equal(saved.settings.general.gameTitle, "Export QA"); assert.equal(saved.settings.general.startScene, "porto_lumen"); assert.equal(saved.settings.general.startPlayer, "Nara"); assert.equal(saved.settings.general.exportFolder, "build-export-layout");
  assert.equal(saved.settings.build.romFileName, "layout-test.gba"); assert.equal(saved.settings.build.gameCode, "LAYT");
  for (const key of ["scena", "scenas", "actors", "assets", "events"]) assert.deepEqual(saved[key], originalProject[key], `Settings modified ${key}`);
  await cdp.send("Page.reload"); await waitForRenderedText(cdp,text=>text.includes("Editor")&&text.includes("Cenas"),"reloaded project"); await openExport();
  assert.equal(await evaluate(`document.querySelector('${fieldSelector("romFileName")}').value`), "layout-test.gba");
  assert.equal(await evaluate(`document.querySelector('${fieldSelector("startScene")}').value`), "porto_lumen");
  checks.push({ name: "edit-save-reload-preserves-content", ok: true });
  await click('[aria-label="Restaurar padrão de Projeto e ROM"]'); await click('.settings-reset-confirmation button:first-child');
  assert.equal(await evaluate(`document.querySelector('${fieldSelector("romFileName")}').value`), "layout-test.gba");
  await click('[aria-label="Restaurar padrão de Projeto e ROM"]'); await click('[aria-label="Confirmar restauração"]'); await click('.studio-dialog-actions button:last-child');
  await waitUntil(`document.querySelector('${fieldSelector("romFileName")}').value==='game.gba'`, "project ROM reset");
  await click('[aria-label="Desfazer alteração"]'); await waitUntil(`document.querySelector('${fieldSelector("romFileName")}').value==='layout-test.gba'`, "atomic undo ROM page");
  checks.push({ name: "cancel-confirm-reset-atomic-undo", ok: true });
  await change(fieldSelector("exportFolder"), projectPath); await click('.export-rom-actions button:first-child');
  await waitUntil(`document.querySelector('.export-path-status').innerText.includes('Caminhos com pendências')`, "invalid path result"); await capture("invalid-path");
  await click('[aria-label="Desfazer alteração"]'); await waitUntil(`document.querySelector('${fieldSelector("exportFolder")}').value==='build-export-layout'`, "restore output path");
  await click('.export-rom-actions button:first-child'); await waitUntil(`document.querySelector('.export-path-status').innerText.includes('Caminhos verificados')`, "valid paths");
  await click('[aria-label="Compilação seção de ajustes"]');
  assert((await evaluate(`document.querySelector('.settings-path-validation').innerText`)).includes("Engine Pack detectado automaticamente"));
  await capture("valid-paths"); checks.push({ name: "real-valid-and-invalid-paths", ok: true });
  await click('[aria-label="Projeto e ROM seção de ajustes"]');
  // Restore the desired entry scene before testing the final artifact.
  await change(fieldSelector("startScene"), "logo"); await saveCopy();
  await waitUntil(`!document.querySelector('.export-generate-rom').disabled`, "build prerequisites");
  await click('.export-generate-rom');
  await waitUntil(`document.body.innerText.includes("ROM gerada:")`, "generated ROM", 180000);
  const generatedStatus = await evaluate(`document.querySelector('.studio-status-bar-message').textContent`);
  const romPath = generatedStatus.replace("ROM gerada: ", "").split(" Aviso: ")[0];
  assert(romPath.startsWith(projectRoot), generatedStatus);
  const rom = await readFile(romPath); assert(rom.length>192); assert.equal(rom.subarray(0xac,0xb0).toString(),"LAYT");
  await writeFile(join(output,"layout-test.gba"),rom); await capture("rom-generated"); checks.push({ name: "real-ROM-generation", bytes: rom.length, sha256: createHash('sha256').update(rom).digest('hex'), gameCode: "LAYT" });
  await click('.export-rom-actions button:nth-child(2)');
  await waitUntil(`document.body.innerText.includes("Play Window aberto:")`, "Play launch", 180000);
  const playerTarget=(await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t=>t.type==="page"&&t.id!==target.id);
  assert(playerTarget,"Play target missing"); const playerCdp=cdpSession(playerTarget.webSocketDebuggerUrl); await playerCdp.ready;
  let playerState;
  const playerDeadline=Date.now()+30000;
  do {
    const result=await playerCdp.send("Runtime.evaluate",{expression:`({frame:window.GBAStudioDirectPlayer?.inspectFrame?.(),error:window.GBAStudioDirectPlayerError??null,canvas:document.querySelector('canvas.gba-studio-direct-canvas')?.width})`,returnByValue:true});
    playerState=result.result?.value;
    if (playerState?.frame?.meaningful===true && playerState?.canvas===240 && !playerState.error) break;
    await wait(250);
  } while(Date.now()<playerDeadline);
  assert(playerState?.frame?.meaningful===true && !playerState.error,JSON.stringify(playerState));
  const frame=await playerCdp.send("Page.captureScreenshot",{format:"png",captureBeyondViewport:false});const playerFrame=join(output,"play-window.png");await writeFile(playerFrame,Buffer.from(frame.data,"base64"));captures.push(playerFrame);playerCdp.close();
  checks.push({ name: "real-ROM-player-window", state: playerState, ok: true });
  assert.equal(errors.length,0,JSON.stringify(errors));assert.deepEqual(await readFile(source.projectPath),originalBytes,"Canonical project modified");
  await writeFile(join(output,"manifest.json"),JSON.stringify({ success:true,checks,captures,errors,project:source.projectPath,canonicalProjectHash:createHash('sha256').update(originalBytes).digest('hex'),viewportMethod:"Electron renderer device metrics; outer native window not resized" },null,2));
  console.log(JSON.stringify({ success:true,checks:checks.length,captures:captures.length,output,errors:errors.length }));
} catch (error) {
  if (cdp) {
    try {
      await capture("failure");
      const state = await evaluate(`({text:document.body.innerText,fields:Array.from(document.querySelectorAll('[data-setting-key]')).map(e=>({key:e.dataset.settingKey,value:e.querySelector('input,select')?.value,attribute:e.querySelector('input')?.getAttribute('value')}))})`);
      await writeFile(join(output,"failure.json"),JSON.stringify({ error:String(error),checks,errors,state },null,2));
    } catch {}
  }
  throw error;
} finally {
  observer?.close();cdp?.close();await terminateChild(child);await writeFile(join(output,"electron.log"),log);await rm(temporary,{recursive:true,force:true});
}
