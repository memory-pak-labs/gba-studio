import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cdpSession, createElectronSmokeEnv, electronExecutablePath, terminateChild, wait, waitForRenderedText } from './lib/electron-smoke-helpers.mjs';

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const temporary = await mkdtemp(path.join(tmpdir(), 'gba-scene-routing-'));
const evidence = await mkdtemp(path.join(tmpdir(), 'gba-scene-routing-evidence-'));
const source = path.join(appRoot, 'default-assets/templates/exemplo-gba');
const projectPath = path.join(temporary, 'project/exemplo-gba.gba-project');
await mkdir(path.dirname(projectPath));
await cp(path.join(source, 'exemplo-gba.gba-project'), projectPath);
await cp(path.join(source, 'Assets'), path.join(temporary, 'project/Assets'), { recursive: true });
const original = await readFile(projectPath, 'utf8');
const port = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9457);
const env = createElectronSmokeEnv({ GBA_STUDIO_JEV_ENABLED: '0', GBA_STUDIO_SMOKE_CDP_PORT: String(port),
  GBA_STUDIO_SMOKE_USER_DATA_DIR: path.join(temporary, 'UserData'), GBA_STUDIO_OPEN_PROJECT: projectPath });
delete env.TYPESAFE_API_KEY;
const child = spawn(electronExecutablePath({ appRoot, usePackagedApp: false }), [appRoot], { cwd: appRoot, env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = ''; child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
let cdp;
const outcomes = [];
try {
  let target;
  for (let attempt = 0; attempt < 80; attempt++) {
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find(t => t.type === 'page'); } catch { /* app starting */ }
    if (target) break;
    await wait(250);
  }
  assert(target, 'Electron did not expose a renderer');
  cdp = cdpSession(target.webSocketDebuggerUrl); await cdp.ready;
  const evaluate = async expression => {
    const response = await cdp.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    assert(!response.exceptionDetails, JSON.stringify(response.exceptionDetails));
    return response.result.value;
  };
  await waitForRenderedText(cdp, text => text.includes('Ver Saúde'), 'Editor');
  await evaluate(`window.__sceneRoutingErrors = []; window.addEventListener('error', event => window.__sceneRoutingErrors.push(event.message)); window.addEventListener('unhandledrejection', () => window.__sceneRoutingErrors.push('unhandledrejection'));`);
  const screenshot = async name => { const result = await cdp.send('Page.captureScreenshot', { format: 'png' }); await writeFile(path.join(evidence, name), Buffer.from(result.data, 'base64')); };
  const panel = `document.querySelector('[aria-label="Análise prévia · circuito_final"]')`;
  async function openAnalysis() {
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Exportar').click()`);
    await waitForRenderedText(cdp, text => text.includes('Capacidades por cena'), 'Health');
    await evaluate(`(()=>{const p=${panel};p.closest('details').open=true;p.scrollIntoView({block:'start'});p.querySelector('button').click()})()`);
    await waitForRenderedText(cdp, text => text.includes('Próxima ferramenta'), 'Routing');
  }
  const cases = [['abrir_editor_hud', 'hud'], ['revisar_camadas', 'background'], ['revisar_logica', 'events'], ['revisar_player', 'scene'], ['revisar_colisao', 'collision']];
  for (const [action, tab] of cases) {
    await openAnalysis();
    const options = await evaluate(`[...${panel}.querySelector('[aria-label="Próxima ferramenta"]').options].map(o => o.value)`);
    assert(options.includes(action)); assert(!options.includes('compilar')); assert(!options.includes('gerar_sprite'));
    await evaluate(`(()=>{const p=${panel};const s=p.querySelector('[aria-label="Próxima ferramenta"]');s.value=${JSON.stringify(action)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
    await wait(50);
    if (action === 'abrir_editor_hud') await screenshot('01-routing.png');
    await evaluate(`[...${panel}.querySelectorAll('button')].find(b => b.textContent === 'Abrir ferramenta').click()`);
    let selected;
    for (let attempt = 0; attempt < 40; attempt++) {
      selected = await evaluate(`document.getElementById('rooms-inspector-tab-${tab}')?.getAttribute('aria-selected')`);
      const header = await evaluate(`document.querySelector('.rooms-inspector-header')?.textContent`);
      if (selected === 'true' && header?.includes('circuito_final')) break;
      await wait(100);
    }
    assert.equal(selected, 'true', `${action} did not focus ${tab}`);
    const title = await evaluate(`document.querySelector('.rooms-inspector-header')?.textContent`);
    assert(title?.includes('circuito_final'), `Wrong scene: ${title}`);
    outcomes.push({ action, tab, scene: title, status: 'opened' });
    await screenshot(`02-${action}.png`);
  }
  await openAnalysis();
  assert((await evaluate(`document.body.innerText`)).includes('Ações de revisão nesta sessão · 5'));
  await evaluate(`(()=>{const p=${panel};p.querySelector('input[type=checkbox]').click();[...p.querySelectorAll('button')].find(b=>b.textContent==='Consultar Jev').click()})()`);
  await waitForRenderedText(cdp, text => text.includes('Jev não configurado'), 'Offline fallback');
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 900, height: 800, deviceScaleFactor: 1, mobile: false });
  await evaluate(`${panel}.querySelector('[aria-label="Escolha da próxima ferramenta"]').scrollIntoView({block:'center'})`);
  await wait(200);
  const dimensions = await evaluate(`({width:${panel}.clientWidth,scrollWidth:${panel}.scrollWidth})`);
  assert(dimensions.scrollWidth <= dimensions.width + 1, 'Horizontal overflow');
  await screenshot('03-routing-900.png');
  const errors = await evaluate('window.__sceneRoutingErrors'); assert.deepEqual(errors, []);
  assert.equal(await readFile(projectPath, 'utf8'), original, 'Routing wrote project data');
  await writeFile(path.join(evidence, 'report.json'), JSON.stringify({ outcomes, dimensions, errors, projectFileUnchanged: true, externalCalls: 0 }, null, 2));
  console.log(`PASS: 5 scene tool routes, history, offline fallback and 900x800 layout. Evidence: ${evidence}`);
} finally {
  if (cdp) cdp.close();
  await terminateChild(child);
  await writeFile(path.join(evidence, 'electron.log'), output);
  await rm(temporary, { recursive: true, force: true });
}
