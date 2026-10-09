import { describe, expect, it, vi } from 'vitest';
const { invoke, expose } = vi.hoisted(() => ({ invoke: vi.fn(), expose: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: { exposeInMainWorld: expose }, ipcRenderer: { invoke, on: vi.fn(), removeListener: vi.fn(), send: vi.fn() } }));

describe('scene analysis bridge', () => {
  it('forwards only the request through the dedicated channel and returns the result', async () => {
    await import('./preload.js');
    const api = expose.mock.calls.find(([name]) => name === 'gbaStudio')?.[1];
    const request = { data: { scenas: [{ name: 'Scene' }] }, sceneName: 'Scene', useJev: false };
    const response = { source: 'local' };
    invoke.mockResolvedValue(response);
    expect(await api.analyzeScene(request)).toBe(response);
    expect(invoke).toHaveBeenCalledWith('scene:analyze', request);
  });
});
