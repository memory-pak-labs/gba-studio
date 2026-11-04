import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerRomPlayerRecording, controlRomPlayerRecording } from "./romPlayerRecording.js";
import type { RomPlayerFrameStats } from "../shared/hardwareProfiler.js";

class PlayerWindow extends EventEmitter {
  id = 111;
  destroyed = false;
  webContents = { executeJavaScript: vi.fn<(code: string) => Promise<unknown>>() };
  isDestroyed() { return this.destroyed; }
  destroy() { this.destroyed = true; this.emit("closed"); }
  close() {
    let prevented = false;
    this.emit("close", { preventDefault() { prevented = true; } });
    if (!prevented) this.destroy();
  }
}
const windows: PlayerWindow[] = [];
afterEach(() => { windows.splice(0).forEach(window => { if (!window.destroyed) window.destroy(); }); });
const stats: RomPlayerFrameStats = { inputFrames: { firstFrame: 30, masks: [1, 0] },
  cpuPercent: 2, droppedFrameRatio: 0, droppedFrames: 0, emulationFps: 60,
  emulationMs: 1, fps: 60, frameMs: 17, presentationFps: 60, romBytes: 1024 };
function setup() {
  const window = new PlayerWindow(); windows.push(window);
  window.webContents.executeJavaScript.mockResolvedValue(stats);
  const onTelemetry = vi.fn();
  registerRomPlayerRecording({ window, ownerID: 42, normalize: value => value as RomPlayerFrameStats, onTelemetry });
  return { window, onTelemetry };
}

describe("Player recording control", () => {
  it("only lets the owning editor begin/flush and forwards the final input batch", async () => {
    const { window, onTelemetry } = setup();
    expect((await controlRomPlayerRecording(77, { windowID: window.id, action: "begin" })).ok).toBe(false);
    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
    const result = await controlRomPlayerRecording(42, { windowID: window.id, action: "begin", recordingID: "recording-1" });
    expect(result).toMatchObject({ ok: true, telemetry: { windowID: 111, state: "running", stats } });
    expect(onTelemetry).toHaveBeenCalledWith(result.telemetry);
    expect(window.webContents.executeJavaScript).toHaveBeenCalledWith(expect.stringContaining("beginInputRecording"));
  });

  it("flushes the last short tap before closing and does not close early on a repeated request", async () => {
    const { window, onTelemetry } = setup();
    let flush!: (value: unknown) => void;
    window.webContents.executeJavaScript.mockReturnValue(new Promise(resolve => { flush = resolve; }));
    window.close(); window.close();
    expect(window.destroyed).toBe(false);
    flush(stats);
    await vi.waitFor(() => expect(window.destroyed).toBe(true));
    expect(onTelemetry).toHaveBeenCalledWith({ windowID: 111, state: "running", stats });
    expect(window.webContents.executeJavaScript).toHaveBeenCalledTimes(1);
    expect((await controlRomPlayerRecording(42, { windowID: 111, action: "begin" })).ok).toBe(false);
  });

  it("closes even if the renderer cannot flush and rejects arbitrary commands", async () => {
    const { window } = setup();
    expect((await controlRomPlayerRecording(42, { windowID: 111, action: "destroy" as "begin" })).ok).toBe(false);
    expect(window.webContents.executeJavaScript).not.toHaveBeenCalled();
    window.webContents.executeJavaScript.mockRejectedValue(new Error("renderer exited"));
    window.close();
    await vi.waitFor(() => expect(window.destroyed).toBe(true));
  });
});
