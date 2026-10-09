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
const output = process.env.GBA_STUDIO_FILES_LAYOUT_OUTPUT ?? join(appRoot, "artifacts/files-layout/latest");
const port = Number(process.env.GBA_STUDIO_FILES_LAYOUT_CDP_PORT ?? 9468);
const profiles = [{ width: 1600, height: 1000 }, { width: 1104, height: 690 }, { width: 900, height: 800 }];
const temporary = await mkdtemp(join(tmpdir(), "gba-files-layout-smoke-"));
const projectRoot = join(temporary, "project");
const projectPath = join(projectRoot, basename(source.projectPath));
await mkdir(output, { recursive: true });
await cp(dirname(source.projectPath), projectRoot, {
  recursive: true,
  filter: path => !["build", ".gba-cache", "node_modules", ".git"].includes(basename(path))
});
const originalProject = await readFile(source.projectPath);
const child = spawn(electronExecutablePath({ appRoot, usePackagedApp: false }), [appRoot], {
  cwd: appRoot,
  env: createElectronSmokeEnv({ GBA_STUDIO_OPEN_PROJECT: projectPath, GBA_STUDIO_SMOKE_USER_DATA_DIR: join(temporary, "user-data"), GBA_STUDIO_SMOKE_CDP_PORT: String(port) }),
  stdio: ["ignore", "pipe", "pipe"]
});
let log = "";
child.stdout.on("data", data => { log += data; });
child.stderr.on("data", data => { log += data; });
let cdp;
let observer;
const errors = [];
const captures = [];
const checks = [];
async function evaluate(expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function click(selector) {
  assert(await evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`), `Missing ${selector}`);
  await wait(120);
}
async function capture(name) {
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  const path = join(output, `${name}.png`);
  await writeFile(path, Buffer.from(result.data, "base64"));
  captures.push(path);
}
async function viewport(profile) {
  const window = await cdp.send("Browser.getWindowForTarget").catch(() => null);
  if (window?.windowId) await cdp.send("Browser.setWindowBounds", { windowId: window.windowId, bounds: { ...profile, windowState: "normal" } });
  await cdp.send("Emulation.setDeviceMetricsOverride", { ...profile, mobile: false, deviceScaleFactor: 1 });
  await wait(200);
}
async function assertLayout(profile, theme) {
  const metrics = await evaluate(`(() => {
    const root = document.documentElement;
    const panels = ['.files-navigation', '.files-gallery', '.files-details-panel'].map(selector => {
      const element = document.querySelector(selector); const box = element.getBoundingClientRect();
      return { selector, width: box.width, left: box.left, right: box.right, height: box.height, overflow: element.scrollWidth - element.clientWidth };
    });
    return { width: innerWidth, overflow: Math.max(root.scrollWidth, document.body.scrollWidth) - innerWidth, panels, theme: root.getAttribute('data-studio-theme') };
  })()`);
  assert.equal(metrics.theme, theme);
  assert(metrics.overflow <= 2, JSON.stringify(metrics));
  assert(metrics.panels.every(panel => panel.width >= 140 && panel.height >= 300 && panel.left >= -1 && panel.right <= profile.width + 1 && panel.overflow <= 2), JSON.stringify(metrics));
  checks.push({ name: "three-panel-layout", profile, metrics });
}
try {
  let page;
  for (let i = 0; i < 60 && !page; i += 1) {
    try { page = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(target => target.type === "page"); } catch { /* startup */ }
    if (!page) await wait(250);
  }
  assert(page, "Isolated Electron endpoint missing");
  cdp = cdpSession(page.webSocketDebuggerUrl);
  await cdp.ready;
  observer = new WebSocket(page.webSocketDebuggerUrl);
  observer.addEventListener("message", event => {
    const message = JSON.parse(event.data);
    if (message.method === "Runtime.exceptionThrown" || (message.method === "Log.entryAdded" && message.params.entry.level === "error")) errors.push(message);
  });
  await new Promise((resolve, reject) => { observer.addEventListener("open", resolve, { once: true }); observer.addEventListener("error", reject, { once: true }); });
  observer.send(JSON.stringify({ id: 1, method: "Runtime.enable" }));
  observer.send(JSON.stringify({ id: 2, method: "Log.enable" }));
  await cdp.send("Page.enable");
  await waitForRenderedText(cdp, text => text.includes("Editor") && text.includes("Cenas"), "project");
  await click('[aria-label="Workspace Arquivos"]');
  await waitForRenderedText(cdp, text => text.includes("Todos os arquivos"), "new Files layout");
  await viewport(profiles[0]);
  await click('[aria-label="Categorias de arquivo: Fundos"]');
  await click('[aria-label="route-map-paged-v2.png"]');
  await evaluate(`document.querySelector('[aria-label="route-map-paged-v2.png"]').scrollIntoView({block:'center'})`);
  await waitForRenderedText(cdp, text => text.includes("480 × 320 px"), "actual file dimensions");
  for (const theme of ["light", "dark"]) {
    if (theme === "dark") await click('[aria-label="Ativar tema escuro"]');
    for (const profile of profiles) {
      await viewport(profile);
      await assertLayout(profile, theme);
      await capture(`${theme}-${profile.width}x${profile.height}`);
    }
  }
  await viewport(profiles[0]);
  await click('.files-preview-zoom button:nth-child(2)');
  const zoom = await evaluate(`(() => { const image = document.querySelector('.files-preview-image-frame img'); const frame = image.closest('.files-preview-image-frame'); return {width:image.getBoundingClientRect().width, height:image.getBoundingClientRect().height, scroll:frame.scrollWidth > frame.clientWidth, pixelated:getComputedStyle(image).imageRendering}; })()`);
  assert.equal(zoom.width, 960); assert.equal(zoom.height, 640); assert(zoom.scroll); assert.equal(zoom.pixelated, "pixelated");
  checks.push({ name: "native-2x-preview", zoom });
  await click('.files-preview-zoom button:nth-child(3)');
  await click('.files-library-import');
  assert(await evaluate(`document.querySelectorAll('.studio-context-menu [role="menuitem"]').length === 2`));
  await cdp.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  await cdp.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
  assert(await evaluate(`!document.querySelector('[role="menu"]') && document.activeElement.matches('.files-library-import')`));
  await click('.files-preview-actions button[aria-haspopup="menu"]');
  assert(await evaluate(`document.querySelectorAll('.studio-context-menu [role="menuitem"]').length === 4`));
  await capture("overflow-menu-dark");
  const point = await evaluate(`(() => {const box=document.querySelector('.files-filter-heading h2').getBoundingClientRect();return {x:box.left+10,y:box.top+10};})()`);
  await cdp.send("Input.dispatchMouseEvent", { type: "mousePressed", ...point, button: "left", clickCount: 1 });
  await cdp.send("Input.dispatchMouseEvent", { type: "mouseReleased", ...point, button: "left", clickCount: 1 });
  assert(await evaluate(`!document.querySelector('[role="menu"]')`));
  checks.push({ name: "menus-and-keyboard-focus", ok: true });
  await click('.files-selection-toggle');
  await click('.asset-batch-check');
  await click('.asset-row:nth-child(2) .asset-batch-check');
  assert(await evaluate(`document.querySelector('.files-batch-toolbar strong').textContent.includes('2 selecionados')`));
  await capture("batch-selection-dark");
  await click('[aria-label="Limpar seleção"]');
  await click('.files-selection-toggle');
  await click('[aria-label="Lista"]');
  assert(await evaluate(`!document.querySelector('.asset-list-grid')`));
  await click('[aria-label="Grade"]');
  await click('[aria-label="Pasta: Assets/backgrounds"]');
  const folder = await evaluate(`Array.from(document.querySelectorAll('.asset-row-main')).every(button => button.title.startsWith('Assets/backgrounds/'))`);
  assert(folder);
  await click('[aria-label="Categorias de arquivo: Fundos"]');
  await click('[aria-label="route-map-paged-v2.png"]');
  await click('.files-pipeline-notice button');
  assert(await evaluate(`document.querySelector('.files-technical-details').open && document.querySelector('.files-asset-pipeline').getBoundingClientRect().height > 0`));
  await capture("technical-details-dark");
  await click('.files-usage-links button');
  await waitForRenderedText(cdp, text => text.includes("mapa_rota") && !text.includes("Todos os arquivos"), "linked scene");
  assert(await evaluate(`!document.querySelector('.files-workspace') && Boolean(document.querySelector('.rooms-workspace'))`));
  checks.push({ name: "folder-list-grid-batch-and-usage-navigation", ok: true });
  await click('[aria-label="Workspace Arquivos"]');
  await evaluate(`document.querySelector('[aria-label="Buscar arquivo"]').focus()`);
  await cdp.send("Input.insertText", { text: "__no_asset_matches__" });
  await waitForRenderedText(cdp, text => text.includes("Nenhum arquivo corresponde aos filtros."), "empty filtered results");
  assert(await evaluate(`!document.querySelector('.files-preview-actions')`));
  await click('.files-no-results button');
  assert(await evaluate(`document.querySelectorAll('.asset-row').length === 182`));
  // Exercise the existing focus-mode CSS without changing persisted preferences.
  await evaluate(`document.querySelector('.app-shell').classList.add('focus-mode')`);
  const focus = await evaluate(`(() => { const gallery=document.querySelector('.files-gallery');return {gallery:getComputedStyle(gallery).display,navigation:getComputedStyle(document.querySelector('.files-navigation')).display,inspector:getComputedStyle(document.querySelector('.files-details-panel')).display}; })()`);
  assert.equal(focus.gallery, "flex"); assert.equal(focus.navigation, "none"); assert.equal(focus.inspector, "none");
  await evaluate(`document.querySelector('.app-shell').classList.remove('focus-mode')`);
  checks.push({ name: "empty-results-and-focus-mode", focus });
  assert.deepEqual(await readFile(source.projectPath), originalProject, "Canonical project changed");
  assert.equal(errors.length, 0, JSON.stringify(errors));
  assert(!/Unhandled|uncaught/i.test(log), log);
  const manifest = { ok: true, source: source.projectPath, projectPath, profiles, checks, captures, errors, generatedAt: new Date().toISOString() };
  await writeFile(join(output, "manifest.json"), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ok: true, checks: checks.length, screenshots: captures.length, output }));
} finally {
  observer?.close(); cdp?.close();
  await terminateChild(child);
  await writeFile(join(output, "electron.log"), log);
  await rm(temporary, { recursive: true, force: true });
}
