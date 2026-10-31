import { beforeAll, describe, expect, it, vi } from "vitest";

const invoke = vi.fn();
const exposeInMainWorld = vi.fn();
const on = vi.fn();
const removeListener = vi.fn();

vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld },
  ipcRenderer: {
    invoke,
    on,
    removeListener,
    send: vi.fn()
  }
}));

beforeAll(async () => {
  await import("./preload.js");
});

describe("preload asset bridge", () => {
  it("queries the current native fullscreen state and cleans up its subscription", async () => {
    const api = exposeInMainWorld.mock.calls.find(([name]) => name === "gbaStudio")?.[1];
    await api.getWindowFullscreen();
    expect(invoke).toHaveBeenLastCalledWith("window:get-fullscreen");
    const listener = vi.fn();
    const unsubscribe = api.onWindowFullscreenChange(listener);
    const subscription = on.mock.calls.find(([channel]) => channel === "window:fullscreen-changed")?.[1];
    subscription({}, true);
    expect(listener).toHaveBeenLastCalledWith(true);
    unsubscribe();
    expect(removeListener).toHaveBeenLastCalledWith("window:fullscreen-changed", subscription);
  });

  it("forwards both a confirmed and canceled window close to the main process", async () => {
    const api = exposeInMainWorld.mock.calls.find(([name]) => name === "gbaStudio")?.[1];
    await api.confirmWindowClose();
    expect(invoke).toHaveBeenLastCalledWith("window:confirm-close", true);
    await api.confirmWindowClose(false);
    expect(invoke).toHaveBeenLastCalledWith("window:confirm-close", false);
  });

  it("keeps sprite import and inspection available without development preparation tools", async () => {
    const api = exposeInMainWorld.mock.calls.find(([name]) => name === "gbaStudio")?.[1];
    const request = { projectPath: "/tmp/demo.gba-project", destinationDirectory: "Assets/sprites" };
    await api.importAssets(request);
    expect(invoke).toHaveBeenCalledWith("assets:import", request);

    const inspection = { projectPath: request.projectPath, source: "Assets/sprites/player.png" };
    await api.inspectAssetFile(inspection);
    expect(invoke).toHaveBeenCalledWith("assets:inspect-file", inspection);
  });

  it("does not expose the retired preparation and draft promotion services to the renderer", () => {
    const api = exposeInMainWorld.mock.calls.find(([name]) => name === "gbaStudio")?.[1];
    for (const method of ["prepareControlledEntityAsset", "prepareSpriteDraft", "promoteSpriteDraft", "discardSpriteDraft"]) {
      expect(api, method).not.toHaveProperty(method);
    }
  });
});
