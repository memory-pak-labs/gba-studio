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
const output = process.env.GBA_STUDIO_SCENES_LAYOUT_OUTPUT ?? join(appRoot, "artifacts/scenes-layout/latest");
const port = Number(process.env.GBA_STUDIO_SCENES_LAYOUT_CDP_PORT ?? 9474);
const temporary = await mkdtemp(join(tmpdir(), "gba-scenes-layout-smoke-"));
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
  assert(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e) return false; e.click(); return true; })()`), selector);
  await wait(160);
}
async function change(selector, value) {
  assert(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false; Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`), selector);
  await wait(600);
}
async function waitUntil(expression, description) {
  const deadline = Date.now() + 10000;
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
async function openPlatformer() {
  await click('[aria-label="Workspace Cenas"]');
  await click('[aria-label="Plataforma seção de ajustes"]');
  assert.equal(await evaluate(`document.querySelectorAll('.scene-defaults-page').length`), 1);
}
async function saveCopy() {
  await click('[aria-label="Salvar projeto"]');
  await waitForRenderedText(cdp, text => text.includes("Salvo"), "saved isolated project");
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
  await openPlatformer();
  assert.equal(await evaluate(`document.querySelector('.scene-defaults-advanced').open`), false);
  const navigation = await evaluate(`Array.from(document.querySelectorAll('.settings-nav-item')).map(e=>({label:e.getAttribute('aria-label'),id:e.dataset.sectionId}))`);
  assert.equal(navigation.length, 15);
  for (const { label } of navigation) {
    await click(`[aria-label="${label}"]`);
    const state = await evaluate(`({id:document.querySelector('.scene-defaults-page').id,active:document.querySelectorAll('.settings-nav-item[aria-pressed="true"]').length,inputs:document.querySelectorAll('.scene-defaults-page input,.scene-defaults-page select,.scene-defaults-page output').length})`);
    assert.equal(state.active, 1); assert(state.inputs > 0, label);
    await capture(`section-${state.id.replace('settings-section-', '')}`); checks.push({ name: "scene-navigation", label, ...state });
  }
  assert.deepEqual(await readFile(projectPath), originalBytes, "Navigation rewrote isolated project");
  await click('[aria-label="Plataforma seção de ajustes"]');
  for (const theme of ["light", "dark"]) {
    await click('[aria-label="Workspace Ajustes"]');
    await click(`.settings-interface-theme-choice input[value="${theme}"]`);
    await openPlatformer();
    for (const [width, height] of [[1584, 992], [1600, 1000], [1104, 690], [900, 800]]) {
      await viewport(width, height);
      const metrics = await evaluate(`(() => {const panels=['.settings-nav','.settings-main-panel','.scene-defaults-page'].map(s=>{const e=document.querySelector(s),b=e.getBoundingClientRect();return{selector:s,x:b.x,right:b.right,width:b.width,overflow:e.scrollWidth-e.clientWidth}});const switches=Array.from(document.querySelectorAll('.scene-defaults-switches input')).map(e=>{const b=e.getBoundingClientRect(),s=getComputedStyle(e);return{width:b.width,height:b.height,appearance:s.appearance,checked:e.checked,background:s.backgroundColor}});return{width:innerWidth,overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth,theme:document.documentElement.dataset.studioTheme,panels,switches,advancedBottom:document.querySelector('.scene-defaults-advanced').getBoundingClientRect().bottom}})()`);
      assert.equal(metrics.theme, theme); assert(metrics.overflow <= 2, JSON.stringify(metrics));
      assert(metrics.panels.every(p => p.width > 150 && p.right <= width + 2 && p.overflow <= 2), JSON.stringify(metrics));
      assert(metrics.switches.every(s => s.width === 46 && s.height === 26 && s.appearance === "none"), JSON.stringify(metrics));
      checks.push({ name: "rendered-layout", width, height, theme, metrics }); await capture(`${theme}-${width}x${height}`);
      if (width === 900) {
        await evaluate(`document.querySelector('.scene-defaults-advanced').scrollIntoView({block:'end'})`);
        assert(await evaluate(`document.querySelector('.scene-defaults-advanced').getBoundingClientRect().bottom<innerHeight`), "Settings end inaccessible");
        await capture(`${theme}-${width}x${height}-scrolled`);
        await evaluate(`document.querySelector('.settings-main-panel').scrollTop=0;document.querySelector('.settings-nav-item:last-child').scrollIntoView({block:'end'})`);
        assert(await evaluate(`document.querySelector('.settings-nav-item:last-child').getBoundingClientRect().bottom<innerHeight`), "Navigation end inaccessible");
        await evaluate(`document.querySelector('.settings-nav').scrollTop=0`);
      }
    }
  }
  await click('[aria-label="Workspace Ajustes"]');
  await click('[name="studio-ui-font-size"][value="large"]'); await click('[name="studio-ui-contrast"][value="high"]');
  await openPlatformer(); await viewport(900, 800);
  assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+2&&document.querySelector('.scene-defaults-page').scrollWidth<=document.querySelector('.scene-defaults-page').clientWidth+2`));
  await capture("dark-900x800-large-high-contrast"); checks.push({ name: "large-high-contrast", ok: true });
  await click('[aria-label="Workspace Ajustes"]'); await click('[name="studio-ui-font-size"][value="compact"]'); await click('[name="studio-ui-contrast"][value="standard"]');
  await click('.settings-interface-theme-choice input[value="light"]'); await viewport(1584, 992); await openPlatformer();
  await change('[aria-label="Buscar ajustes"]', "gravidade"); await click('[aria-label="Abrir Plataforma"]');
  assert(await evaluate(`Boolean(document.querySelector('#settings-section-platformer'))`));
  await change('[aria-label="Buscar ajustes"]', "no-match-xyz"); assert((await evaluate(`document.querySelector('.settings-search-results').innerText`)).includes("Nenhum ajuste encontrado"));
  await change('[aria-label="Buscar ajustes"]', ""); checks.push({ name: "search-and-empty-state", ok: true });
  await click('[aria-label="Aplicar Flutuante em Plataforma"]');
  await waitUntil(`document.querySelector('[aria-label="Aplicar Flutuante em Plataforma"]').getAttribute('aria-pressed')==='true'`, "complete floating preset");
  const presetState = await evaluate(`({pressed:document.querySelector('[aria-label="Aplicar Flutuante em Plataforma"]').getAttribute('aria-pressed'),abilities:Array.from(document.querySelectorAll('.scene-defaults-switches label')).map(e=>({label:e.textContent,checked:e.querySelector('input').checked})),gravity:document.querySelector('[aria-label="Gravidade valor exato"]').value,fall:document.querySelector('[aria-label="Velocidade máxima de queda valor exato"]').value})`);
  assert.equal(presetState.pressed, "true", JSON.stringify(presetState)); assert(presetState.abilities.find(a=>a.label==='Pulo duplo')?.checked, JSON.stringify(presetState));
  await click('[aria-label="Desfazer alteração"]');
  await waitUntil(`document.querySelector('[aria-label="Aplicar Normal em Plataforma"]').getAttribute('aria-pressed')==='true'&&!document.querySelector('.scene-defaults-switches input').checked`, "whole preset undo");
  await click('[aria-label="Refazer alteração"]');
  await waitUntil(`document.querySelector('[aria-label="Aplicar Flutuante em Plataforma"]').getAttribute('aria-pressed')==='true'&&document.querySelector('.scene-defaults-switches input').checked`, "whole preset redo");
  checks.push({ name: "preset-undo-redo-atomic", ok: true });
  await click('.scene-defaults-advanced summary');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Gravidade valor exato"]').value`), "0.32");
  assert.equal(await evaluate(`document.querySelector('[aria-label="Velocidade máxima de queda valor exato"]').value`), "4");
  await capture("platformer-floating-advanced");
  // A native keyboard event reaches and edits the technical number control.
  await evaluate(`document.querySelector('[aria-label="Gravidade valor exato"]').focus()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowUp", code: "ArrowUp", windowsVirtualKeyCode: 38 }); await wait(160);
  await waitUntil(`Number(document.querySelector('[aria-label="Gravidade valor exato"]').value)>0.32`, "gravity keyboard edit");
  const gravity = Number(await evaluate(`document.querySelector('[aria-label="Gravidade valor exato"]').value`)); assert(gravity > 0.32);
  await change('[aria-label="Botão de pulo"]', "L");
  const player = await evaluate(`Array.from(document.querySelector('[aria-label="Player padrão · Plataforma"]').options).find(o=>o.value)?.value`);
  assert(player, "No sprite for linked default player"); await change('[aria-label="Player padrão · Plataforma"]', player);
  const saved = await saveCopy(); assert.equal(saved.settings.platformer.gravity, gravity); assert.equal(saved.settings.platformer.jumpButton, "L"); assert.equal(saved.settings.platformer.doubleJump, true); assert.equal(saved.settings.platformer.maxFallSpeed, 4); assert.equal(saved.settings.sceneTypes.defaultPlayerSprites.platformer, player);
  for (const key of ["scena", "scenas", "actors", "assets", "events"]) assert.deepEqual(saved[key], originalProject[key], `Settings modified ${key}`);
  await click('[aria-label="Players Padrão seção de ajustes"]'); assert.equal(await evaluate(`Array.from(document.querySelectorAll('.settings-edit-row')).find(e=>e.querySelector('span')?.textContent==='Player padrão · Plataforma').querySelector('select').value`), player);
  await cdp.send("Page.reload"); await waitForRenderedText(cdp, text => text.includes("Editor") && text.includes("Cenas"), "reloaded project"); await openPlatformer();
  assert.equal(await evaluate(`document.querySelector('[aria-label="Botão de pulo"]').value`), "L");
  assert.equal(await evaluate(`document.querySelector('[aria-label="Player padrão · Plataforma"]').value`), player);
  assert.equal(await evaluate(`document.querySelector('.scene-defaults-advanced').open`), false);
  await click('.scene-defaults-advanced summary'); assert.equal(Number(await evaluate(`document.querySelector('[aria-label="Gravidade valor exato"]').value`)), gravity);
  await click('.scene-defaults-advanced summary'); checks.push({ name: "presets-keyboard-controls-player-save-reload", gravity, player, ok: true });
  await click('[aria-label="Restaurar padrão de Plataforma"]'); await click('.settings-reset-confirmation button:first-child');
  assert.equal(await evaluate(`document.querySelector('[aria-label="Botão de pulo"]').value`), "L");
  await click('[aria-label="Restaurar padrão de Plataforma"]'); await click('[aria-label="Confirmar restauração"]');
  await click('.studio-dialog-actions button:last-child');
  await waitUntil(`document.querySelector('[aria-label="Botão de pulo"]').value==='A'`, "confirmed profile reset");
  assert.equal(await evaluate(`document.querySelector('[aria-label="Botão de pulo"]').value`), "A");
  assert.equal(await evaluate(`document.querySelector('[aria-label="Player padrão · Plataforma"]').value`), player);
  checks.push({ name: "confirmed-reset-preserves-player", ok: true }); await capture("platformer-reset");
  await click('[aria-label="Workspace Exportar"]');
  await waitForRenderedText(cdp, text => text.includes("Gerar ROM") && text.includes("Informações do jogo"), "export workspace");
  assert(await evaluate(`Boolean(document.querySelector('#settings-section-general'))&&!document.querySelector('#settings-section-build')`));
  await capture("export-regression"); checks.push({ name: "export-discrete-layout", ok: true });
  await click('[aria-label="Workspace Ajustes"]'); assert(await evaluate(`Boolean(document.querySelector('.settings-interface-page'))&&!document.querySelector('.scene-defaults-page')`));
  checks.push({ name: "settings-layout-preserved", ok: true }); await openPlatformer();
  assert.equal(errors.length, 0, JSON.stringify(errors)); assert.deepEqual(await readFile(source.projectPath), originalBytes, "Canonical project modified");
  await writeFile(join(output, "manifest.json"), JSON.stringify({ checks, captures, errors, project: source.projectPath, canonicalProjectHash: createHash('sha256').update(originalBytes).digest('hex'), viewportMethod: "Electron renderer device metrics; native outer window not resized", success: true }, null, 2));
  console.log(JSON.stringify({ success: true, checks: checks.length, captures: captures.length, output, errors: errors.length }));
} catch (error) {
  if (cdp) { await capture("failure").catch(() => {}); await writeFile(join(output, "failure-state.txt"), await evaluate(`document.body.innerText`).catch(() => "")); }
  throw error;
} finally {
  observer?.close(); cdp?.close(); await terminateChild(child);
  await writeFile(join(output, "electron.log"), log); await rm(temporary, { recursive: true, force: true });
}
