import { describe, expect, it, vi } from "vitest";
import { readPlayerPlaybackReadiness } from "./player-playback-readiness.mjs";

function runningPlayer() {
  const forbidden = vi.fn(() => { throw Error("A diagnostic inspection blocked playback"); });
  const canvas = { width: 240, height: 160, dataset: { audio: "running-non-silent" } };
  Object.defineProperty(canvas, "clientHeight", { get: forbidden });
  Object.defineProperty(canvas, "clientWidth", { get: forbidden });
  return {
    canvas, inspectFrame: forbidden, inspectAudio: forbidden, save: forbidden, load: forbidden, reset: forbidden,
    inspectRuntime: () => ({ state: { frame: 9, runtimeKind: 10, currentRoom: 0 } }),
    inspectPresentedRuntime: () => ({ state: { frame: 8, runtimeKind: 10, currentRoom: 0 }, previousState: { frame: 7 } })
  };
}

describe("uninterrupted playback readiness", () => {
  it("observes real native and presented frames without pixels, layout, audio registers or state mutation", () => {
    const player = runningPlayer();
    const result = readPlayerPlaybackReadiness(player, 1234.5);
    expect(result).toMatchObject({ ok: true, observedAtUnixMs: 1234.5, runtimeState: { frame: 9 }, presentedRuntimeState: { frame: 8 } });
    expect(player.inspectFrame).not.toHaveBeenCalled();
    expect(result).not.toHaveProperty("frame");
    expect(result).not.toHaveProperty("audio");
    expect(result).not.toHaveProperty("display");
  });

  it.each(["running", "suspended", "unavailable", ""])('requires a queued PCM block rather than AudioContext state "%s"', state => {
    const player = runningPlayer(); player.canvas.dataset.audio = state;
    expect(readPlayerPlaybackReadiness(player, 100).ok).toBe(false);
  });

  it("waits for both native execution and the presented frame", () => {
    const player = runningPlayer();
    player.inspectPresentedRuntime = () => ({ state: { frame: 7 } });
    expect(readPlayerPlaybackReadiness(player, 100).ok).toBe(false);
    player.inspectPresentedRuntime = () => ({ state: { frame: 10 } });
    player.inspectRuntime = () => ({ state: { frame: 0 } });
    expect(readPlayerPlaybackReadiness(player, 100).ok).toBe(false);
  });

  it("handles an unpublished Player without starting or resetting it", () => {
    expect(readPlayerPlaybackReadiness(null, 0).ok).toBe(false);
  });
});
