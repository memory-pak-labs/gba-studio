const MAX_BATTERY_BYTES = 131072;
const MAX_RECORD_LENGTH = 176000;
const ROM_HASH = /^[a-f0-9]{64}$/;

export function encodeBattery(bytes, romSha256) {
  if (!ROM_HASH.test(romSha256) || !(bytes instanceof Uint8Array) || !bytes.length || bytes.length > MAX_BATTERY_BYTES) throw new Error('Invalid battery data.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  return JSON.stringify({ schema: 1, romSha256, data: btoa(binary) });
}

export function decodeBattery(record, romSha256) {
  if (typeof record !== 'string' || record.length > MAX_RECORD_LENGTH) throw new Error('Invalid battery record.');
  const value = JSON.parse(record);
  if (value.schema !== 1 || value.romSha256 !== romSha256 || !ROM_HASH.test(romSha256) || typeof value.data !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.data)) throw new Error('Battery record belongs to another ROM or is corrupt.');
  const binary = atob(value.data);
  if (!binary.length || binary.length > MAX_BATTERY_BYTES) throw new Error('Invalid battery size.');
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function equalBytes(left, right) {
  return left?.length === right?.length && left.every((byte, index) => byte === right[index]);
}

export function createBatteryPersistence({ romSha256, store, copy, restore, onStatus = () => {} }) {
  let enabled = false, disposed = false, previous = null, pending = null, inFlight = null, writing = null;
  const unavailable = () => { enabled = false; pending = null; onStatus('unavailable'); };
  return {
    async initialize() {
      try {
        const record = await store.read();
        if (record !== null && !restore(decodeBattery(record, romSha256))) throw new Error('Battery restore rejected.');
        previous = copy();
        enabled = true;
        onStatus(record === null ? 'ready' : 'restored');
      } catch { unavailable(); }
    },
    flush() {
      if (!enabled || disposed) return Promise.resolve();
      const current = copy();
      if (!current.length || equalBytes(current, pending ?? inFlight ?? previous)) return writing ?? Promise.resolve();
      pending = current;
      if (writing) return writing;
      onStatus('saving');
      writing = (async () => {
        try {
          while (pending && !disposed && enabled) {
            const snapshot = pending;
            inFlight = snapshot;
            pending = null;
            await store.write(encodeBattery(snapshot, romSha256));
            previous = snapshot;
            inFlight = null;
          }
          if (!disposed && enabled) onStatus('saved');
        } catch { unavailable(); }
        finally { writing = null; }
      })();
      return writing;
    },
    destroy() { disposed = true; store.destroy?.(); }
  };
}

export function createWebBatteryStore({ windowObject = window, romSha256, timeoutMs = 3000 }) {
  if (!ROM_HASH.test(romSha256)) throw new Error('A ROM hash is required for browser saves.');
  const key = `gba-studio:web-battery:v1:${romSha256}`;
  let local = null;
  try { local = windowObject.localStorage; } catch { /* Sandboxed games use the host bridge. */ }
  if (local) return { read: () => local.getItem(key), write: value => local.setItem(key, value) };
  const pending = new Map();
  let sequence = 0;
  const listener = event => {
    const message = event.data;
    if (event.source !== windowObject.parent || message?.type !== 'gbastudio:battery:response') return;
    const request = pending.get(message.requestId);
    if (!request) return;
    pending.delete(message.requestId);
    clearTimeout(request.timer);
    if (message.ok === true && (message.value === null || message.value === undefined || typeof message.value === 'string' && message.value.length <= MAX_RECORD_LENGTH)) request.resolve(message.value ?? null);
    else request.reject(new Error('Browser save storage unavailable.'));
  };
  windowObject.addEventListener('message', listener);
  const request = (operation, value) => new Promise((resolve, reject) => {
    const requestId = `${Date.now()}-${++sequence}`;
    const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('Browser save storage timed out.')); }, timeoutMs);
    pending.set(requestId, { resolve, reject, timer });
    windowObject.parent.postMessage({ type: 'gbastudio:battery:request', requestId, operation, romSha256, ...(operation === 'write' ? { value } : {}) }, '*');
  });
  return {
    read: () => request('read'), write: value => request('write', value),
    destroy() {
      windowObject.removeEventListener('message', listener);
      for (const { reject, timer } of pending.values()) { clearTimeout(timer); reject(new Error('Player closed.')); }
      pending.clear();
    }
  };
}
