import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cdpSession, copySmokeProject, createElectronSmokeEnv, prepareElectronSmokeLocale, terminateChild, wait } from './lib/electron-smoke-helpers.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.resolve(process.env.GBA_UPDATER_QA_ROOT ?? '');
if (!process.env.GBA_UPDATER_QA_ROOT) throw new Error('QA root is required');
const fixture = JSON.parse(await readFile(path.join(root, 'fixture.json'), 'utf8'));
const projectDir = path.join(root, 'project');
const project = path.join(projectDir, 'exemplo-gba.gba-project');
const evidence = path.join(root, 'evidence');
await mkdir(evidence, { recursive: true });
await copySmokeProject(path.join(appRoot, 'default-assets/templates/exemplo-gba'), projectDir);
const hash = async (file, algorithm, encoding) => {
  const digest = createHash(algorithm);
  for await (const chunk of createReadStream(file)) digest.update(chunk);
  return digest.digest(encoding);
};
const targetHash = await hash(fixture.targetInstaller, 'sha256', 'hex');
const targetSha512 = await hash(fixture.targetInstaller, 'sha512', 'base64');
const targetSize = (await stat(fixture.targetInstaller)).size;
const targetName = path.basename(fixture.targetInstaller);
const feed = JSON.stringify({ version: fixture.targetVersion, files: [{ url: targetName, sha512: targetSha512, size: targetSize }], path: targetName, sha512: targetSha512, releaseDate: new Date().toISOString() });
const requests = [];
const server = createServer((req, res) => {
  const name = new URL(req.url, 'http://127.0.0.1').pathname;
  requests.push(name);
  if (name.endsWith('.yml')) { res.writeHead(200, { 'Content-Type': 'application/yaml' }); res.end(feed); return; }
  if (name === `/${targetName}`) {
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': targetSize });
    createReadStream(fixture.targetInstaller).pipe(res); return;
  }
  res.writeHead(404); res.end();
});
await new Promise((resolve, reject) => { server.once('error', reject); server.listen(fixture.port, '127.0.0.1', resolve); });
const port = fixture.port + 1;
const env = createElectronSmokeEnv({
  GBA_STUDIO_SMOKE_CDP_PORT: String(port), GBA_STUDIO_SMOKE_USER_DATA_DIR: path.join(root, 'profile'),
  GBA_STUDIO_OPEN_PROJECT: project, APPIMAGE_EXTRACT_AND_RUN: '1', ELECTRON_DISABLE_SANDBOX: '1'
});
delete env.GBA_STUDIO_OFFLINE_SMOKE;
const child = spawn(fixture.sourceExecutable, fixture.platform === 'linux' ? ['--no-sandbox'] : [], { cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
let logs = '';
let exited = false;
let cdp;
const checks = [];
child.stdout.on('data', (data) => { logs += data; });
child.stderr.on('data', (data) => { logs += data; });
child.once('exit', () => { exited = true; });
const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); console.log(`PASS ${message}`); };
const poll = async (fn, label, ms = 120_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { try { const value = await fn(); if (value) return value; } catch { /* Wait for app, renderer or installer. */ } await wait(250); }
  throw new Error(`Timed out: ${label}`);
};
async function connect() {
  const target = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`);
    if (!response.ok) return null;
    return (await response.json()).find((item) => item.type === 'page' && item.url.includes('index.html') && item.webSocketDebuggerUrl);
  }, 'editor DevTools');
  const session = cdpSession(target.webSocketDebuggerUrl);
  await session.ready; return session;
}
const evaluate = async (expression) => {
  const result = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
  return result.result?.value;
};
const waitFor = (expression, label, ms) => poll(() => evaluate(expression), label, ms);
const click = (label, selector = 'document') => evaluate(`(() => { const button = [...${selector}.querySelectorAll('button')].find((item) => item.textContent.trim() === ${JSON.stringify(label)}); if (!button) throw new Error('Button missing: ' + ${JSON.stringify(label)}); button.click(); })()`);
async function screenshot(name) {
  const result = await cdp.send('Page.captureScreenshot', { format: 'png' });
  await writeFile(path.join(evidence, name), Buffer.from(result.data, 'base64'));
}
try {
  cdp = await connect();
  await waitFor("Boolean(document.querySelector('.app-shell'))", 'initial editor');
  await prepareElectronSmokeLocale(cdp, 'pt-BR');
  const initial = await evaluate('window.gbaStudio.getAppUpdateState()');
  assert(initial.status !== 'disabled' && initial.currentVersion === fixture.version, 'Installed updater is enabled at the source version');
  await evaluate('window.gbaStudio.checkAppUpdates()');
  await waitFor("document.body.innerText.includes('Uma nova versão está disponível')", 'available update');
  assert(!requests.includes(`/${targetName}`), 'Checking does not download without confirmation');
  await click('Baixar atualização');
  await waitFor("document.body.innerText.includes('Atualização pronta para instalar')", 'downloaded update', 300_000);
  assert(requests.includes(`/${targetName}`), 'Target installer was downloaded from the local feed');
  await screenshot('update-downloaded.png');
  await click('Reiniciar e atualizar');
  await waitFor("Boolean(document.querySelector('.studio-dialog-card'))", 'restart confirmation');
  await click('Mais tarde', "document.querySelector('.studio-dialog-card')");
  assert(!exited, 'Canceling restart keeps the application open');
  await evaluate("document.dispatchEvent(new KeyboardEvent('keydown',{key:'k',metaKey:true,ctrlKey:true,bubbles:true}))");
  await waitFor("Boolean(document.querySelector('.studio-command-palette'))", 'command palette');
  await evaluate("[...document.querySelectorAll('.studio-command-results button')].find(b=>b.textContent.includes('Criar diálogo')).click()");
  await waitFor("Boolean(document.querySelector('.studio-dialog-card input'))", 'dialogue creation');
  await click('OK', "document.querySelector('.studio-dialog-card')");
  await waitFor("Boolean(document.querySelector('.topbar-project em.dirty'))", 'dirty project');
  await wait(300);
  const blocked = await evaluate('window.gbaStudio.installAppUpdate()');
  assert(!blocked.ok, 'Main process blocks installation with unsaved changes');
  const before = JSON.parse(await readFile(project, 'utf8'));
  const dialogueKeys = new Set(before.dialogues.map((item) => item.key));
  await click('Reiniciar e atualizar');
  await waitFor("document.body.innerText.includes('Salvar antes de atualizar')", 'save confirmation');
  await screenshot('update-save-confirmation.png');
  await click('Salvar e reiniciar', "document.querySelector('.studio-dialog-card')");
  await poll(() => exited, 'source application exits', 180_000);
  const saved = JSON.parse(await readFile(project, 'utf8'));
  assert(saved.dialogues.some((item) => !dialogueKeys.has(item.key) && item.text === 'Nova fala.'), 'New dialogue is saved before the update completes');
  cdp.close(); cdp = await connect();
  await waitFor("Boolean(document.querySelector('.app-shell'))", 'updated editor', 180_000);
  const updated = await evaluate('window.gbaStudio.getAppUpdateState()');
  assert(updated.currentVersion === fixture.targetVersion, 'Updated application restarted at the target version');
  assert(!await evaluate("Boolean(document.querySelector('.topbar-project em.dirty'))"), 'Saved project reopens without pending changes');
  if (fixture.platform === 'linux') {
    const installedImage = path.join(path.dirname(fixture.sourceExecutable), targetName);
    assert(await hash(installedImage, 'sha256', 'hex') === targetHash, 'Installed AppImage matches the downloaded target');
  }
  await screenshot('updated-editor.png');
  await writeFile(path.join(evidence, 'result.json'), `${JSON.stringify({ ok: true, platform: fixture.platform, sourceVersion: fixture.version, targetVersion: fixture.targetVersion, localFeed: true, checks, requests }, null, 2)}\n`);
} catch (error) {
  await writeFile(path.join(evidence, 'failure.json'), `${JSON.stringify({ error: String(error?.stack ?? error), platform: fixture.platform, checks, requests, logs: logs.slice(-12000) }, null, 2)}\n`);
  throw error;
} finally {
  if (cdp) { try { void cdp.send('Runtime.evaluate', { expression: 'window.close()' }).catch(() => {}); } catch { /* Renderer already closed. */ } cdp.close(); }
  if (!exited) await terminateChild(child);
  server.close();
  await writeFile(path.join(evidence, 'electron.log'), logs.slice(-30000));
}
