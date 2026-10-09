import { afterEach, describe, expect, it, vi } from "vitest";
import { startComposedAudioPreview, resolveAudioPreviewSourceURL } from "./audioPreviewPlayback.js";
import type { AudioPreviewPlaybackPlan } from "../shared/audioWorkspace.js";
const plan: AudioPreviewPlaybackPlan = { loops: true, loopStart: 0, stepCount: 1, stepDurationMs: 200, totalDurationMs: 200, steps: [{ stepIndex: 0, startOffsetMs: 0, durationMs: 200, notes: [] }] };
afterEach(() => vi.useRealTimers());
describe("ciclo da audição", () => {
  it("repete até Parar e cancela o agendamento ao parar", () => {
    vi.useFakeTimers(); const onStep = vi.fn(); const onEnded = vi.fn();
    const context = { get currentTime() { return Date.now() / 1000; } };
    const stop = startComposedAudioPreview(context, plan, { onStep, onEnded, playNote: vi.fn() });
    vi.advanceTimersByTime(8000);
    expect(onStep.mock.calls.length).toBeGreaterThan(35); expect(onEnded).not.toHaveBeenCalled();
    stop(); const count = onStep.mock.calls.length; vi.advanceTimersByTime(1000);
    expect(onStep).toHaveBeenCalledTimes(count); expect(vi.getTimerCount()).toBe(0);
  });
  it("encerra uma execução apenas depois do último passo", () => {
    vi.useFakeTimers(); const onEnded = vi.fn();
    startComposedAudioPreview({ get currentTime() { return Date.now() / 1000; } }, { ...plan, loops: false }, { onStep: vi.fn(), onEnded, playNote: vi.fn() });
    vi.advanceTimersByTime(150); expect(onEnded).not.toHaveBeenCalled();
    vi.advanceTimersByTime(200); expect(onEnded).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
  });
  it("resolve WAV por protocolo autorizado, incluindo paths com espaços", () => {
    expect(resolveAudioPreviewSourceURL("/tmp/Jogo novo/a.gba-project", "Assets/sfx/hit.wav")).toBe("gba-asset://asset?path=%2Ftmp%2FJogo%20novo%2FAssets%2Fsfx%2Fhit.wav");
    expect(resolveAudioPreviewSourceURL(undefined, "hit.wav")).toBeNull();
  });
});
