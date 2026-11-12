// Native Intel compiler isolation: exact frozen Player/core/ROM, fresh profile,
// no hidden game frames, no renderer debugger, all initial samples retained.
const { app, BrowserWindow, screen } = require('electron');
const { createServer } = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
app.setPath('userData', process.env.GBA_INTEL_PROFILE);
if (process.env.GBA_INTEL_FLAGS) app.commandLine.appendSwitch('js-flags', process.env.GBA_INTEL_FLAGS);
let server;
app.whenReady().then(async () => {
  const root = path.resolve(process.env.GBA_INTEL_WEB_ROOT);
  const rom = fs.readFileSync(process.env.GBA_INTEL_ROM);
  server = createServer((req, res) => {
    const name = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cache-Control', 'no-store');
    if (name === '/rom.gba') return res.end(rom);
    if (name === '/') return res.end('<html><body style="margin:0"><div id="game" style="width:720px;height:480px"></div></body></html>');
    const file = path.resolve(root, '.' + name);
    if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return res.writeHead(404).end();
    res.setHeader('Content-Type', file.endsWith('.wasm') ? 'application/wasm' : file.endsWith('.mjs') ? 'text/javascript' : 'application/octet-stream');
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const window = new BrowserWindow({ width: 720, height: 480, show: true,
    webPreferences: { contextIsolation: true, sandbox: false, backgroundThrottling: false } });
  await window.loadURL(`http://127.0.0.1:${server.address().port}/`);
  window.show();window.focus();
  const result = await window.webContents.executeJavaScript(`(async () => {
    const started = performance.now();
    const { startMGBAPlayer } = await import('/player/mgba-direct-player.mjs');
    const samples = [];
    let complete;
    const done = new Promise(resolve => { complete = resolve; });
    const player = await startMGBAPlayer({ container: document.querySelector('#game'),
      romUrl: '/rom.gba', storageKey: 'diagnostic-cold', onFrameStats: stats => {
        samples.push(stats); if (samples.length === 20) complete();
      } });
    const readyMs = performance.now() - started;
    await Promise.race([done, new Promise((_, reject) => setTimeout(() => reject(new Error('Missing cadence samples')), 45000))]);
    return { readyMs, samples, audio: player.inspectAudio(), runtime: player.inspectRuntime(),
      frame: player.inspectFrame() };
  })()`);
  const first = result.samples.filter(sample => sample.runtimeState?.frame >= 8).slice(0, 4);
  if (first.length !== 4) throw new Error('Missing first measured window');
  const steady = first.slice(1);
  const mean = key => steady.reduce((sum, item) => sum + item[key], 0) / steady.length;
  const report = { platform: process.platform, architecture: process.arch,
    versions: process.versions, flags: app.commandLine.getSwitchValue('js-flags'),
    displays: screen.getAllDisplays().map(display => ({ frequency: display.displayFrequency, bounds: display.bounds })),
    romHash: createHash('sha256').update(rom).digest('hex'), ...result,
    firstWindow: { emulationFps: mean('emulationFps'), presentationFps: mean('presentationFps'),
      droppedFrameRatio: mean('droppedFrameRatio'), emulationMs: mean('emulationMs'), observedSamples: first } };
  fs.writeFileSync(process.env.GBA_INTEL_OUTPUT, JSON.stringify(report, null, 2) + '\n');
  window.destroy();server.close();app.quit();
}).catch(error => { console.error(error); server?.close(); app.exit(1); });
