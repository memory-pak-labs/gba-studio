import fs from 'node:fs';
import path from 'node:path';

/** Optional QA footage. Receives real framebuffer pixels only; never restores
 * emulator snapshots or modifies game state. Four native frames per sample. */
export function createMovementRecorder(output, enabled) {
  const clips = new Map();
  let active = null, fd = null;
  const select = name => {
    if (fd !== null) fs.closeSync(fd);
    fd = null; active = null;
    if (!enabled || !name) return;
    if (!/^[a-z_]+$/.test(name)) throw Error('Invalid movement clip label');
    const file = path.join(output, 'movement-video', name + '.rgba');
    if (!clips.has(name)) {
      fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, '');
      clips.set(name, { name, path: file, frames: 0, fps: 15, width: 240, height: 160, format: 'RGBA', scope: 'Unmodified framebuffer samples from movement test excerpts; no audio' });
    }
    active = clips.get(name); fd = fs.openSync(file, 'a');
  };
  return {
    get active() { return active !== null; },
    select,
    write(pixels) {
      if (!active) return;
      if (pixels.length !== 240 * 160 * 4) throw Error('Movement clip dimensions');
      fs.writeSync(fd, pixels); active.frames++;
    },
    close() { select(null); return [...clips.values()]; }
  };
}
