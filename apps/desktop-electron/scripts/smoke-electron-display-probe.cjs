const { app, BrowserWindow, screen, powerMonitor } = require('electron');
const { mkdir, writeFile } = require('node:fs/promises');
const { join } = require('node:path');
const os = require('node:os');

const output = process.env.GBA_STUDIO_DISPLAY_PROBE_OUTPUT || join(__dirname, '../artifacts/display-probe/latest');
const deadline = setTimeout(() => { console.error('Display measurement timed out.'); app.exit(1); }, 25000);

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 640, height: 480, show: true,
    webPreferences: { backgroundThrottling: false, contextIsolation: true, nodeIntegration: false }
  });
  await window.loadURL('data:text/html,<html><body style="background:%23555">Display cadence measurement</body></html>');
  window.show();
  window.focus();
  const cadence = await window.webContents.executeJavaScript(`new Promise(resolve => {
    let warmup = 15;
    const timestamps = [];
    function frame(timestamp) {
      if (warmup > 0) warmup--;
      else timestamps.push(timestamp);
      if (timestamps.length === 181) {
        const intervals = timestamps.slice(1).map((t, i) => t - timestamps[i]);
        const sorted = [...intervals].sort((a,b) => a-b);
        resolve({ frames: 180, fps: 180000 / (timestamps[180]-timestamps[0]),
          medianIntervalMs: sorted[Math.floor(sorted.length/2)],
          minIntervalMs: sorted[0], maxIntervalMs: sorted[sorted.length-1] });
      } else requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  })`);
  const evidence = {
    kind: 'host-display-diagnostic',
    productQAApproval: false,
    generatedAt: new Date().toISOString(),
    architecture: process.arch,
    machine: os.machine(),
    versions: process.versions,
    displays: screen.getAllDisplays(),
    onBatteryPower: powerMonitor.isOnBatteryPower(),
    cadence,
    gpuStatus: app.getGPUFeatureStatus(),
    gpuInfo: await app.getGPUInfo('basic')
  };
  await mkdir(output, { recursive: true });
  await writeFile(join(output, 'display_evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify(evidence, null, 2));
  clearTimeout(deadline);
  window.destroy();
  app.quit();
}).catch(error => { console.error(error); clearTimeout(deadline); app.exit(1); });
