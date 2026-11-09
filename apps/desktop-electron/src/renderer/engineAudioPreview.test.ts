/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { startEngineAudioPreview } from "./engineAudioPreview.js";

afterEach(() => { document.body.replaceChildren(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function context() {
  // Exercise the message/lifecycle protocol without loading remote pages in happy-dom.
  const create = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation(((tag: string) => {
    if (tag !== "iframe") return create(tag);
    const frame = create("div");
    Object.defineProperties(frame, { contentWindow: { value: { postMessage: vi.fn() } }, sandbox: { value: { add: vi.fn() } } });
    return frame;
  }) as typeof document.createElement);
  const closed = vi.fn().mockResolvedValue(undefined);
  const sources: any[] = [];
  const ctx = { currentTime: 0, destination: {}, resume: vi.fn().mockResolvedValue(undefined), close: closed,
    createBuffer: vi.fn((_: number, length: number, rate: number) => ({ duration: length / rate, copyToChannel: vi.fn() })),
    createBufferSource: vi.fn(() => { const node = { buffer: null, connect: vi.fn(), disconnect: vi.fn(), start: vi.fn(), stop: vi.fn(), onended: null }; sources.push(node); return node; }) };
  vi.stubGlobal("AudioContext", function () { return ctx; });
  return { ctx, closed, sources };
}
describe("native engine audio lifecycle", () => {
  it("unlocks audio on the click and cancels a pending compilation without starting playback", async () => {
    const { ctx, closed } = context(); const release = vi.fn();
    let finish!: (value: any) => void;
    const preview = startEngineAudioPreview({ prepare: () => new Promise(resolve => { finish = resolve; }), release, onStep() {}, onEnded() {} });
    expect(ctx.resume).toHaveBeenCalledOnce();
    preview.stop();
    expect(await preview.ready).toBe(false);
    finish({ ok: true, requestID: preview.id, url: "http://127.0.0.1:9991/player/audio-preview.html" });
    await Promise.resolve();
    expect(release).toHaveBeenCalledWith(preview.id); expect(closed).toHaveBeenCalledOnce();
    expect(document.querySelector("[data-audio-engine-preview]")).toBeNull();
  });
  it("accepts only this frame's PCM and stops every queued source", async () => {
    const { sources, closed } = context(); const release = vi.fn();
    const preview = startEngineAudioPreview({ prepare: async id => ({ ok: true, requestID: id, url: `http://127.0.0.1:9991/player/audio-preview.html?id=${id}` }), release, onStep() {}, onEnded() {} });
    await new Promise(resolve => setTimeout(resolve, 10));
    const frame = document.querySelector("[data-audio-engine-preview]")! as HTMLIFrameElement;
    const send = (origin: string, type: string) => window.dispatchEvent(new MessageEvent("message", { origin, source: frame.contentWindow, data: { id: preview.id, type, sampleRate: 32768, left: new Float32Array([0, .2, 0]), right: new Float32Array([0, .2, 0]), frame: 1 } }));
    send("http://untrusted.invalid", "ready"); expect(sources).toHaveLength(0);
    send("http://127.0.0.1:9991", "ready"); expect(await preview.ready).toBe(true);
    send("http://untrusted.invalid", "frames"); expect(sources).toHaveLength(0);
    send("http://127.0.0.1:9991", "frames"); expect(sources).toHaveLength(1);
    preview.stop(); preview.stop();
    expect(sources[0].stop).toHaveBeenCalledOnce(); expect(sources[0].disconnect).toHaveBeenCalledOnce();
    expect(closed).toHaveBeenCalledOnce(); expect(frame.isConnected).toBe(false);
  });
});
