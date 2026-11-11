import type { EngineAudioPreviewResult } from "../shared/audioPreview.js";

interface Options {
  prepare(id: string): Promise<EngineAudioPreviewResult>;
  release(id: string): Promise<unknown> | unknown;
  onStep(step: number): void;
  onEnded(): void;
  onMeter?(peak: number, underruns: number): void;
  onError?(error: string): void;
}
// The AudioContext transports the PCM emitted by the actual ARM engine. It does
// not synthesize or approximate notes. Unlock it before the asynchronous build.
export function startEngineAudioPreview(options: Options): { id: string; ready: Promise<boolean>; stop(): void } {
  const id = crypto.randomUUID();
  const context = new AudioContext({ sampleRate: 32768 });
  const unlocked = context.resume();
  const sources = new Set<AudioBufferSourceNode>();
  let frame: HTMLIFrameElement | null = null;
  let stopped = false, pending = false, ending = false;
  let nextTime = 0, sampleRate = 32768, rowFrames = 1, stepCount = 64;
  let origin = "";
  let failure: Error | null = null;
  let interval: ReturnType<typeof setInterval> | undefined;
  let endTimer: ReturnType<typeof setTimeout> | undefined;
  let readyTimer: ReturnType<typeof setTimeout> | undefined;
  let initialized: ((value: boolean) => void) | undefined;
  let failed: ((error: Error) => void) | undefined;
  let cancel!: (value: null) => void;
  const canceled = new Promise<null>(resolve => { cancel = resolve; });
  const pump = () => {
    if (stopped || pending || ending || !frame?.contentWindow || nextTime - context.currentTime > .12) return;
    pending = true;
    frame.contentWindow.postMessage({ id, type: "pump", frames: 4 }, origin);
  };
  const stop = () => {
    if (stopped) return;
    stopped = true; cancel(null); initialized?.(false);
    if (interval !== undefined) clearInterval(interval);
    if (endTimer !== undefined) clearTimeout(endTimer);
    if (readyTimer !== undefined) clearTimeout(readyTimer);
    window.removeEventListener("message", receive);
    for (const source of sources) { try { source.stop(); source.disconnect(); } catch { /* already ended */ } }
    sources.clear(); frame?.remove(); frame = null;
    void context.close().catch(() => undefined);
    void Promise.resolve(options.release(id)).catch(() => undefined);
  };
  const receive = (event: MessageEvent) => {
    if (stopped || event.source !== frame?.contentWindow || event.origin !== origin || event.data?.id !== id) return;
    const message = event.data;
    if (message.type === "error") {
      const error = new Error(String(message.error ?? "A prévia de áudio foi interrompida."));
      failure = error; failed?.(error); stop(); options.onError?.(error.message); return;
    }
    if (message.type === "ready") {
      if (interval !== undefined) return;
      if (message.sampleRate !== 32768) { failure = new Error("Frequência de saída do core incompatível."); failed?.(failure); stop(); return; }
      sampleRate = message.sampleRate;
      if (readyTimer !== undefined) clearTimeout(readyTimer);
      initialized?.(true); interval = setInterval(pump, 25); pump(); return;
    }
    if (message.type !== "frames" || !(message.left instanceof Float32Array) || !(message.right instanceof Float32Array)
      || message.left.length !== message.right.length || message.left.length > 8192) return;
    pending = false;
    if (message.left.length) {
      const buffer = context.createBuffer(2, message.left.length, sampleRate);
      buffer.copyToChannel(message.left, 0); buffer.copyToChannel(message.right, 1);
      const source = context.createBufferSource(); source.buffer = buffer; source.connect(context.destination);
      source.onended = () => { sources.delete(source); source.disconnect(); };
      sources.add(source);
      const when = Math.max(context.currentTime + .02, nextTime);
      source.start(when); nextTime = when + buffer.duration;
      let peak = 0;
      for (let i = 0; i < message.left.length; i++) peak = Math.max(peak, Math.abs(message.left[i]), Math.abs(message.right[i]));
      options.onMeter?.(peak, Number(message.underruns ?? 0));
    }
    if (Number.isFinite(message.frame)) options.onStep(Math.floor(Number(message.frame) / rowFrames) % stepCount);
    if (message.ended) {
      ending = true;
      if (interval !== undefined) clearInterval(interval);
      endTimer = setTimeout(() => { stop(); options.onEnded(); }, Math.max(0, nextTime - context.currentTime) * 1000);
    } else pump();
  };
  const prepared = options.prepare(id);
  const ready = (async () => {
    await unlocked;
    const result = await Promise.race([prepared, canceled]);
    if (!result || stopped || result.canceled) return false;
    if (!result.ok || !result.url) throw new Error(result.error ?? "Não foi possível preparar a prévia da engine.");
    const url = new URL(result.url);
    if (url.hostname !== "127.0.0.1" || url.protocol !== "http:") throw new Error("Origem da prévia inválida.");
    origin = url.origin; rowFrames = result.rowFrames ?? 1; stepCount = Math.max(1, result.stepCount ?? 64);
    const loaded = new Promise<boolean>((resolve, reject) => { initialized = resolve; failed = reject; });
    window.addEventListener("message", receive);
    frame = document.createElement("iframe"); frame.hidden = true; frame.title = "Prévia de áudio da engine";
    frame.dataset.audioEnginePreview = id; frame.sandbox.add("allow-scripts", "allow-same-origin"); frame.src = result.url;
    readyTimer = setTimeout(() => { failure = new Error("A engine não respondeu ao iniciar o áudio."); failed?.(failure); stop(); }, 30000);
    document.body.append(frame);
    return await loaded;
  })().catch(error => { if (stopped && error !== failure) return false; stop(); throw error; });
  return { id, ready, stop };
}
