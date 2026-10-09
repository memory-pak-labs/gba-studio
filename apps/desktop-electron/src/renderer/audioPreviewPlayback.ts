import type { AudioPreviewPlaybackNote, AudioPreviewPlaybackPlan } from "../shared/audioWorkspace.js";
import { desktopAssetURL } from "../shared/spriteAssetURL.js";

export function resolveAudioPreviewSourceURL(projectPath: string | undefined, source: string | null): string | null {
  if (!projectPath || !source) return null;
  const normalized = source.replace(/\\/g, "/");
  const directory = projectPath.replace(/\\/g, "/").split("/").slice(0, -1).join("/");
  return desktopAssetURL(normalized.startsWith("/") || /^[A-Za-z]:\//.test(normalized) ? normalized : `${directory}/${normalized}`);
}

// Schedule only the next 100 ms. Loops do not allocate an unbounded set of nodes or timers.
export function startComposedAudioPreview(
  context: Pick<AudioContext, "currentTime">,
  plan: AudioPreviewPlaybackPlan,
  callbacks: { playNote(note: AudioPreviewPlaybackNote, when: number, duration: number): void; onStep(index: number): void; onEnded(): void }
): () => void {
  const timers = new Set<ReturnType<typeof setTimeout>>();
  const start = context.currentTime + 0.05;
  let cursor = 0;
  let pass = 0;
  let stopped = false;
  let interval: ReturnType<typeof setInterval> | undefined;
  const stop = () => {
    stopped = true;
    if (interval !== undefined) clearInterval(interval);
    for (const timer of timers) clearTimeout(timer);
    timers.clear();
  };
  const tick = () => {
    if (stopped) return;
    if (!plan.steps.length || plan.totalDurationMs <= 0) { stop(); callbacks.onEnded(); return; }
    while (plan.loops || pass === 0) {
      const step = plan.steps[cursor];
      const when = start + (pass * plan.totalDurationMs + step.startOffsetMs) / 1000;
      if (when > context.currentTime + 0.1) break;
      if (when >= context.currentTime - step.durationMs / 1000) {
        for (const note of step.notes) callbacks.playNote(note, Math.max(context.currentTime, when), Math.max(0.03, step.durationMs / 1000));
        const timer = setTimeout(() => { timers.delete(timer); if (!stopped) callbacks.onStep(step.stepIndex); }, Math.max(0, (when - context.currentTime) * 1000));
        timers.add(timer);
      }
      cursor += 1;
      if (cursor === plan.steps.length) { cursor = 0; pass += 1; }
    }
    if (!plan.loops && context.currentTime >= start + plan.totalDurationMs / 1000) { stop(); callbacks.onEnded(); }
  };
  interval = setInterval(tick, 25);
  tick();
  return stop;
}
