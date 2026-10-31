import { execFile, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { cp, mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { promisify } from 'node:util';
import { cdpSession, copySmokeProject, createElectronSmokeEnv, prepareElectronSmokeLocale, terminateChild, wait } from './lib/electron-smoke-helpers.mjs';
import { findLinuxUpdatedProcess, findWindowsUpdatedProcess } from './updater-qa-fixture.mjs';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const asar = createRequire(import.meta.url)('@electron/asar');
const execFileAsync = promisify(execFile);
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
let child;
let logs = '';
let exited = false;
let cdp;
const checks = [];
function launchForInspection(executable = fixture.sourceExecutable) {
  exited = false;
  child = spawn(executable, fixture.platform === 'linux' ? ['--no-sandbox'] : [], { cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  child.stdout.on('data', (data) => { logs += data; });
  child.stderr.on('data', (data) => { logs += data; });
  child.once('exit', () => { exited = true; });
}
launchForInspection();
const assert = (condition, message) => { if (!condition) throw new Error(message); checks.push(message); console.log(`PASS ${message}`); };
const poll = async (fn, label, ms = 120_000) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) { try { const value = await fn(); if (value) return value; } catch { /* Wait for app, renderer or installer. */ } await wait(250); }
  throw new Error(`Timed out: ${label}`);
};
async function connect() {
  const target = await poll(async () => {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(1_500) });
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
  cdp.close();
  if (fixture.platform === 'win32') {
    // NSIS uses ExecShellAsUser; the restarted process does not inherit the QA CDP environment.
    const restartedPid = await poll(async () => {
      asar.uncacheAll();
      const installed = JSON.parse(asar.extractFile(path.join(path.dirname(fixture.sourceExecutable), 'resources', 'app.asar'), 'package.json').toString());
      if (installed.version !== fixture.targetVersion) return null;
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', "Get-CimInstance Win32_Process -Filter \"Name='gba-studio.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress"]);
      const values = JSON.parse(stdout || '[]');
      return findWindowsUpdatedProcess(Array.isArray(values) ? values : [values], fixture.sourceExecutable);
    }, 'Windows installation and automatic restart', 180_000);
    assert(Boolean(restartedPid), 'Windows installed the target version and automatically restarted it');
    // Relaunch the isolated instance with QA variables solely to inspect the saved project.
    process.kill(restartedPid);
    await poll(async () => {
      const { stdout } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', `if (Get-Process -Id ${restartedPid} -ErrorAction SilentlyContinue) { 'running' } else { 'exited' }; exit 0`]);
      return stdout.trim() === 'exited';
    }, 'updated instance exits', 30_000);
    launchForInspection();
  } else {
    const installedImage = path.join(path.dirname(fixture.sourceExecutable), targetName);
    const restarted = await poll(async () => {
      if (await hash(installedImage, 'sha256', 'hex') !== targetHash) return null;
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid=,ppid=,args=']);
      const processes = stdout.split('\n').map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(.+)$/)).filter(Boolean)
        .map(([, pid, ppid, args]) => ({ pid: Number(pid), ppid: Number(ppid), args }));
      return findLinuxUpdatedProcess(processes, installedImage);
    }, 'Linux installation and automatic restart', 180_000);
    assert(Boolean(restarted), 'Linux installed the target AppImage and automatically restarted it');
    // Inspect a fresh instance with the same QA profile after confirming the automatic restart.
    process.kill(restarted.appPid, 'SIGTERM');
    await poll(async () => {
      for (const pid of [restarted.appPid, restarted.launcherPid]) {
        try { process.kill(pid, 0); return false; }
        catch (error) { if (error.code !== 'ESRCH') throw error; }
      }
      return true;
    }, 'updated instance exits', 30_000);
    launchForInspection(installedImage);
  }
  cdp = await connect();
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
  let diagnostics = '';
  if (fixture.platform === 'linux') {
    try {
      const { stdout } = await execFileAsync('ps', ['-eo', 'pid,ppid,stat,args']);
      diagnostics = stdout.split('\n').filter((line) => line.includes(root) || line.includes('appimage_extracted')).join('\n');
      const installedImage = path.join(path.dirname(fixture.sourceExecutable), targetName);
      diagnostics += `\nTarget image SHA-256: ${await hash(installedImage, 'sha256', 'hex')} (expected ${targetHash})`;
    } catch (diagnosticError) { diagnostics += `\nDiagnostic error: ${diagnosticError}`; }
  }
  await writeFile(path.join(evidence, 'failure.json'), `${JSON.stringify({ error: String(error?.stack ?? error), platform: fixture.platform, checks, requests, diagnostics, logs: logs.slice(-12000) }, null, 2)}\n`);
  throw error;
} finally {
  if (cdp) { try { void cdp.send('Runtime.evaluate', { expression: 'window.close()' }).catch(() => {}); } catch { /* Renderer already closed. */ } cdp.close(); }
  if (!exited) await terminateChild(child);
  server.close();
  await writeFile(path.join(evidence, 'electron.log'), logs.slice(-30000));
}
