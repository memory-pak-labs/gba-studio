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
const output = process.env.GBA_STUDIO_SETTINGS_LAYOUT_OUTPUT ?? join(appRoot, "artifacts/settings-layout/latest");
const port = Number(process.env.GBA_STUDIO_SETTINGS_LAYOUT_CDP_PORT ?? 9473);
const temporary = await mkdtemp(join(tmpdir(), "gba-settings-layout-smoke-"));
const projectRoot = join(temporary, "project");
const projectPath = join(projectRoot, basename(source.projectPath));
await mkdir(output, { recursive: true });
await cp(dirname(source.projectPath), projectRoot, { recursive: true, filter: path => !["build", ".gba-cache", "node_modules", ".git"].includes(basename(path)) });
const originalProject = await readFile(source.projectPath);
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
  await wait(140);
}
async function change(selector, value) {
  assert(await evaluate(`(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled) return false; Object.getOwnPropertyDescriptor(e instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype,'value').set.call(e, ${JSON.stringify(value)}); e.dispatchEvent(new Event('input',{bubbles:true})); e.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`), selector);
  await wait(140);
}
async function capture(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = join(output, `${name}.png`);
  await writeFile(path, Buffer.from(result.data, "base64")); captures.push(path);
}
async function viewport(width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }); await wait(180);
}
const themeInput = value => `.settings-interface-theme-choice input[value="${value}"]`;
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
  await click('[aria-label="Workspace Ajustes"]'); await waitForRenderedText(cdp, text => text.includes("Aparência e idioma"), "interface settings");
  assert.equal(await evaluate(`document.querySelector('.settings-interface-advanced').open`), false);
  assert.equal(await evaluate(`document.querySelectorAll('.settings-main-panel > .settings-continuous-section').length`), 0);
  assert(await evaluate(`Array.from(document.querySelectorAll('.settings-interface-themes img')).every(i=>i.complete&&i.naturalWidth>0)`), "Theme images missing");
  assert(await evaluate(`(()=>{const e=document.querySelector('.settings-interface-language select');return getComputedStyle(e).opacity==='1'&&e.getBoundingClientRect().width>200})()`), "Language selector invisible");
  checks.push({ name: "selected-section-and-collapsed-advanced", ok: true });
  for (const theme of ["light", "dark"]) {
    await click(themeInput(theme));
    for (const [width, height] of [[1586, 992], [1600, 1000], [1104, 690], [900, 800]]) {
      await viewport(width, height);
      const metrics = await evaluate(`(() => { const selectors=['.settings-nav','.settings-main-panel','.settings-interface-page']; const panels=selectors.map(selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect();return{selector,x:b.x,right:b.right,width:b.width,height:b.height,overflow:e.scrollWidth-e.clientWidth}}); return{width:innerWidth,overflow:Math.max(document.body.scrollWidth,document.documentElement.scrollWidth)-innerWidth,panels,theme:document.documentElement.getAttribute('data-studio-theme')}; })()`);
      assert.equal(metrics.theme, theme); assert(metrics.overflow <= 2, JSON.stringify(metrics));
      assert(metrics.panels.every(p => p.width > 150 && p.right <= width + 2 && p.overflow <= 2), JSON.stringify(metrics));
      checks.push({ name: "rendered-layout", width, height, theme, metrics }); await capture(`${theme}-${width}x${height}`);
      if (width === 900) {
        await evaluate(`document.querySelector('.settings-interface-autosave').scrollIntoView({block:'end'})`);
        assert(await evaluate(`document.querySelector('.settings-interface-autosave').getBoundingClientRect().bottom<innerHeight`), "Settings end inaccessible");
        await capture(`${theme}-${width}x${height}-scrolled`);
        await evaluate(`document.querySelector('.settings-main-panel').scrollTop=0`);
      }
    }
  }
  await viewport(1600, 1000);
  await click('[aria-label="Ativar tema claro"]'); assert.equal(await evaluate(`document.querySelector(${JSON.stringify(themeInput("light"))}).checked`), true);
  await click(themeInput("dark")); assert(await evaluate(`Boolean(document.querySelector('[aria-label="Ativar tema claro"]'))`));
  checks.push({ name: "theme-header-and-settings-sync", ok: true });
  await click('[name="studio-ui-font-size"][value="large"]'); await click('[name="studio-ui-contrast"][value="high"]');
  await viewport(900, 800); assert(await evaluate(`document.documentElement.scrollWidth<=innerWidth+2`)); await capture("dark-900x800-large-high-contrast");
  await click('.settings-interface-advanced summary'); assert.equal(await evaluate(`document.querySelector('.settings-interface-advanced').open`), true);
  assert.equal(await evaluate(`document.querySelectorAll('.settings-interface-ranges input[type="range"]').length`), 4);
  // Native keyboard interaction verifies that the range can actually be reached and edited.
  await evaluate(`document.querySelector('[aria-label="Brilho da interface"]').scrollIntoView({block:'center'}); document.querySelector('[aria-label="Brilho da interface"]').focus()`);
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "ArrowRight", code: "ArrowRight", windowsVirtualKeyCode: 39 }); await wait(150);
  assert.equal(await evaluate(`JSON.parse(localStorage.getItem('gba-studio:ui-appearance')).brightness`), 51);
  await capture("dark-advanced-900x800"); checks.push({ name: "native-advanced-slider-keyboard", ok: true });
  await cdp.send("Page.reload"); await waitForRenderedText(cdp, text => text.includes("Editor") && text.includes("30 cenas"), "reloaded project");
  await click('[aria-label="Workspace Ajustes"]'); await waitForRenderedText(cdp, text => text.includes("Aparência e idioma"), "reloaded settings");
  assert(await evaluate(`document.querySelector('[name="studio-ui-font-size"][value="large"]').checked&&document.querySelector('[name="studio-ui-contrast"][value="high"]').checked&&document.querySelector(${JSON.stringify(themeInput("dark"))}).checked&&JSON.parse(localStorage.getItem('gba-studio:ui-appearance')).brightness===51`));
  assert.equal(await evaluate(`document.querySelector('.settings-interface-advanced').open`), false);
  checks.push({ name: "preferences-survive-reload", ok: true });
  await viewport(1600, 1000); await change('.settings-interface-language select', "en-US");
  assert((await evaluate(`document.querySelector('.settings-interface-heading').innerText`)).includes("Appearance and language"));
  await click('.settings-interface-reset');
  assert(await evaluate(`document.querySelector('.settings-interface-language select').value==='en-US'&&localStorage.getItem('gba-studio:theme')==='light'&&localStorage.getItem('gba-studio:ui-font-size')==='compact'&&JSON.parse(localStorage.getItem('gba-studio:ui-appearance')).brightness===50`));
  checks.push({ name: "reset-preserves-language", ok: true });
  await change('.settings-interface-language select', "pt-BR");
  for (const [name, id] of [["Tradução offline", "translationPacks"], ["Créditos", "credits"], ["Atalhos", "shortcuts"], ["Controles", "controls"], ["Plugins", "plugins"], ["MCP local", "mcp"]]) {
    await click(`[aria-label="${name} seção de ajustes"]`);
    assert(await evaluate(`Boolean(document.querySelector('#settings-section-${id}'))&&!document.querySelector('#settings-section-interface')`), name);
    assert.equal(await evaluate(`document.querySelectorAll('.settings-nav-item[aria-pressed="true"]').length`), 1);
    await capture(`section-${id}`); checks.push({ name: `navigation-${id}`, ok: true });
  }
  await change('[aria-label="Buscar ajustes"]', "brilho"); await click('[aria-label="Abrir Interface"]'); assert(await evaluate(`Boolean(document.querySelector('#settings-section-interface'))`));
  await change('[aria-label="Buscar ajustes"]', "no-match-xyz"); assert((await evaluate(`document.querySelector('.settings-search-results').innerText`)).includes("Nenhum ajuste encontrado"));
  await change('[aria-label="Buscar ajustes"]', ""); checks.push({ name: "search-and-empty-state", ok: true });
  await click('.settings-interface-theme-choice input[value="light"]'); await capture("final-light-1600x1000");
  await click('[aria-label="Workspace Exportar"]');
  await waitForRenderedText(cdp, text => text.includes("Gerar ROM") && text.includes("Informações do jogo"), "export workspace");
  await capture("export-regression");
  const exportSections = await evaluate(`Array.from(document.querySelectorAll('.settings-main-panel .export-settings-page')).map(e=>e.id)`);
  assert.deepEqual(exportSections, ["settings-section-general"]);
  assert.equal(await evaluate(`document.querySelectorAll('.settings-nav-item[aria-pressed="true"]').length`), 1);
  checks.push({ name: "export-discrete-layout", ok: true });
  assert.equal(errors.length, 0, JSON.stringify(errors)); assert.deepEqual(await readFile(source.projectPath), originalProject, "Canonical project modified");
  assert.deepEqual(await readFile(projectPath), originalProject, "Local preferences rewrote the isolated project");
  await writeFile(join(output, "manifest.json"), JSON.stringify({ checks, captures, errors, project: source.projectPath, viewportMethod: "Electron renderer device metrics; native outer window not resized", success: true }, null, 2));
  console.log(JSON.stringify({ success: true, checks: checks.length, captures: captures.length, output, errors: errors.length }));
} finally {
  observer?.close(); cdp?.close(); await terminateChild(child);
  await writeFile(join(output, "electron.log"), log); await rm(temporary, { recursive: true, force: true });
}
