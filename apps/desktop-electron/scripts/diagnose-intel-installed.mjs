// Cold starts through the real desktop app/IPC/battery path (installed or built source). No ROM rebuild,
// debugger profiler, hidden frames, warmup, or substitutions of early samples.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { cdpSession, createElectronSmokeEnv, prepareElectronSmokeLocale, terminateChild, wait } from './lib/electron-smoke-helpers.mjs';

const root = process.env.GBA_UPDATER_QA_ROOT;
const evidence = path.join(root, 'evidence');
const app = process.env.GBA_INTEL_APP ?? path.join(root, 'reference', 'gba-studio.app');
const rom = path.join(evidence, 'rom', 'arena_arrancada.gba');
const flags = process.env.GBA_INTEL_FLAGS ?? '';
const label = process.env.GBA_INTEL_LABEL ?? 'baseline';
assert.match(label, /^[a-z0-9-]+$/);
assert.equal(process.platform, 'darwin');
assert.equal(process.arch, 'x64');
const profileRoot = path.join(root, 'cold-profiles');
await mkdir(profileRoot, { recursive: true });
const results = [];
const evaluate = async (cdp, expression) => {
  const response = await cdp.send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description ?? response.exceptionDetails.text);
  return response.result?.value;
};
for (let trial = 1; trial <= 3; trial++) {
  const profile = await mkdtemp(path.join(profileRoot, label + '-'));
  let child, main, player;
  let stderr = '';
  try {
    const port = 9461;
    const env = createElectronSmokeEnv({ GBA_STUDIO_SMOKE_CDP_PORT: String(port),
      GBA_STUDIO_SMOKE_USER_DATA_DIR: profile,
      GBA_STUDIO_OPEN_PROJECT: path.resolve('default-assets/templates/exemplo-gba/exemplo-gba.gba-project') });
    const executable = process.env.GBA_INTEL_APP ? path.resolve('node_modules/.bin/electron') : path.join(app, 'Contents', 'MacOS', 'gba-studio');
    const args = [...(flags ? [`--js-flags=${flags}`] : []), ...(process.env.GBA_INTEL_APP ? [app] : [])];
    child = spawn(executable, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    child.stderr.on('data', data => { stderr = (stderr + String(data)).slice(-16000); });
    child.on('error', error => { stderr += String(error); });
    const targets = async () => {
      try { return await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); }
      catch { return []; }
    };
    const waitUntil = async (read, description, timeout = 30000) => {
      const deadline = Date.now() + timeout;
      while (Date.now() < deadline) { const value = await read(); if (value) return value; await wait(50); }
      throw new Error(`Timeout: ${description}; ${stderr}`);
    };
    const target = await waitUntil(async () => (await targets()).find(target => target.type === 'page' && target.webSocketDebuggerUrl), 'editor');
    main = cdpSession(target.webSocketDebuggerUrl);await main.ready;
    await waitUntil(async () => evaluate(main, 'Boolean(window.gbaStudio?.openRomPlayerWindow)'), 'IPC bridge');
    await prepareElectronSmokeLocale(main, 'pt-BR');
    await waitUntil(async () => evaluate(main, `Boolean(document.querySelector('button[aria-label="Executar ROM"]'))`), 'complete example editor');
    await evaluate(main, `(() => { window.__coldSamples = []; window.gbaStudio.onRomPlayerTelemetry(event => {
      if (event.state === 'running') window.__coldSamples.push(event.stats);
    }); })()`);
    const opened = await evaluate(main, `window.gbaStudio.openRomPlayerWindow(${JSON.stringify({ romPath: rom, title: 'Arena Arrancada cold diagnostic' })})`);
    assert.equal(opened?.ok, true, JSON.stringify(opened));
    const playerTarget = await waitUntil(async () => (await targets()).find(target => target.type === 'page' && target.url.includes('/player/runtime.html')), 'Player');
    player = cdpSession(playerTarget.webSocketDebuggerUrl);await player.ready;
    await waitUntil(async () => evaluate(player, `(() => {
      const player = window.GBAStudioDirectPlayer;
      if (!player?.canvas) return false;
      player.canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return true;
    })()`), 'audio activation');
    await waitUntil(async () => evaluate(main, 'window.__coldSamples.filter(sample => sample.runtimeState?.frame >= 8).length >= 4'), 'first cadence window');
    const samples = await evaluate(main, 'window.__coldSamples');
    const audio = await evaluate(player, 'window.GBAStudioDirectPlayer.inspectAudio()');
    const first = samples.filter(sample => sample.runtimeState?.frame >= 8).slice(0, 4);
    const steady = first.slice(1);
    const mean = key => steady.reduce((sum, sample) => sum + sample[key], 0) / steady.length;
    const report = { trial, flags, label, samples, firstWindow: {
      emulationFps: mean('emulationFps'), presentationFps: mean('presentationFps'),
      droppedFrameRatio: mean('droppedFrameRatio'), emulationMs: mean('emulationMs'), observedSamples: first },
      audio, stderr, romHash: createHash('sha256').update(await readFile(rom)).digest('hex') };
    results.push(report);
    await writeFile(path.join(evidence, `installed-${label}-${trial}.json`), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify({ trial, label, ...report.firstWindow, observedSamples: undefined, audio }));
  } finally {
    main?.close();player?.close();
    if (child) await terminateChild(child);
    await rm(profile, { recursive: true, force: true });
  }
}
const checks = {
  threeColdStarts: results.length === 3,
  emulation: results.every(result => result.firstWindow.emulationFps >= 55),
  drops: results.every(result => result.firstWindow.droppedFrameRatio <= 0.1),
  initialSamples: results.every(result => result.firstWindow.observedSamples.every(sample =>
    sample.emulationFps >= 55 && sample.droppedFrameRatio <= 0.1)),
  engineAudio: results.every(result => result.firstWindow.observedSamples.every(sample =>
    sample.runtimeState?.audio?.pcmUnderrunCount === 0)),
  outputAudio: results.every(result => result.audio?.state === 'running'
    && result.audio.emittedNonSilentSamples > 0 && result.audio.audioUnderrunCount === 0)
};
const functionalPassed = Object.values(checks).every(Boolean);
const summary = { functionalPassed, checks, publicationApproved: false,
  presentationGatePassed: results.every(result => result.firstWindow.presentationFps >= 55), results };
await writeFile(path.join(evidence, `installed-${label}.json`), JSON.stringify(summary, null, 2) + '\n');
if (process.env.GBA_INTEL_REQUIRE_PASS === '1') assert(functionalPassed, JSON.stringify(checks));
