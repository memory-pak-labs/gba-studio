// Read-only host diagnostic. These are blank-window display timings, not game FPS.
const { app, BrowserWindow, screen } = require('electron');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(process.env.GBA_DISPLAY_QA_OUTPUT || '.display-qa');
fs.mkdirSync(path.join(root, 'profile'), { recursive: true });
app.setPath('userData', path.join(root, 'profile'));
app.whenReady().then(async () => {
  const swift = `import CoreGraphics
import Foundation
let current = CGDisplayCopyDisplayMode(CGMainDisplayID())
let modes = (CGDisplayCopyAllDisplayModes(CGMainDisplayID(), nil) as? [CGDisplayMode]) ?? []
func describe(_ mode: CGDisplayMode) -> [String:Any] {
  return ["width":mode.width,"height":mode.height,"pixelWidth":mode.pixelWidth,"pixelHeight":mode.pixelHeight,"refreshRateHz":mode.refreshRate,"modeId":mode.ioDisplayModeID]
}
let result: [String:Any] = ["current":current.map(describe) ?? [:],"available":modes.map(describe)]
let data = try JSONSerialization.data(withJSONObject: result, options: [.sortedKeys])
print(String(data:data,encoding:.utf8)!)`;
  let coreGraphics;
  try {
    coreGraphics = JSON.parse(execFileSync('xcrun', ['swift', '-e', swift], { encoding: 'utf8', timeout: 120000 }));
  } catch (error) {
    coreGraphics = { error: String(error.message).slice(0, 2000) };
  }
  const displays = screen.getAllDisplays().map(display => ({
    id: display.id, bounds: display.bounds, scaleFactor: display.scaleFactor,
    displayFrequencyHz: display.displayFrequency, internal: display.internal
  }));
  let translated = false;
  try { translated = execFileSync('sysctl', ['-n', 'sysctl.proc_translated'], { encoding: 'utf8' }).trim() === '1'; }
  catch { /* Absent on native Intel. */ }
  const window = new BrowserWindow({ width: 720, height: 480, show: true,
    webPreferences: { contextIsolation: true, sandbox: true, backgroundThrottling: false } });
  await window.loadURL('data:text/html,<canvas width="240" height="160"></canvas>');
  window.show();window.focus();
  const timing = await window.webContents.executeJavaScript(`new Promise(resolve => {
    const canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
    const timestamps = []; let first;
    function tick(now) {
      first ??= now; timestamps.push(now);
      ctx.fillStyle = timestamps.length % 2 ? '#0000ff' : '#00ffff';
      ctx.fillRect(0,0,240,160);
      if (now-first >= 12000) resolve({ frames:timestamps.length,
        elapsedMs:now-first, rafFps:(timestamps.length-1)*1000/(now-first),
        intervalsMs:timestamps.slice(1).map((time,index)=>time-timestamps[index]) });
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  })`);
  const report = { kind: 'blank-window-display-diagnostic', generatedAt: new Date().toISOString(),
    platform: process.platform, architecture: process.arch, translated,
    electronVersion: process.versions.electron, displays, coreGraphics, timing,
    changedDisplayMode: false, changedProduct: false };
  fs.writeFileSync(path.join(root, 'display-diagnostics.json'), JSON.stringify(report, null, 2)+'\n');
  console.log(JSON.stringify({ ...report, timing: { ...timing, intervalsMs: '[retained in artifact]' } }, null, 2));
  window.destroy();app.quit();
}).catch(error => { console.error(error); app.exit(1); });
