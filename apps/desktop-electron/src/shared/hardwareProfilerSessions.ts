import { profilerSubsystems, type ProfilerSubsystem, type ProfilerSubsystemTicks } from "./hardwareProfiler.js";

export interface HardwareProfilerFrame {
  frame: number;
  roomIndex: number;
  sceneName: string;
  runtime: string;
  cpu: number;
  dma: number | null;
  vram: number | null;
  oam: number | null;
  scanline: number;
  subsystems?: ProfilerSubsystemTicks;
  nativeVideo?: { frame: number; room: number; sceneFrameCount: number;
    peaks: { dma: { value: number; frame: number } | null; oam: { value: number; frame: number } | null } };
}

export type HardwareProfilerFrameMetric = Exclude<
  keyof HardwareProfilerFrame,
  "frame" | "roomIndex" | "runtime" | "sceneName" | "subsystems" | "nativeVideo"
>;

export interface HardwareProfilerPeak {
  frame: number;
  roomIndex: number;
  sceneName: string;
  runtime: string;
  value: number | null;
}

export interface HardwareProfilerScenePeak {
  roomIndex: number;
  sceneName: string;
  runtime: string;
  frameCount: number;
  nativeFrameCount?: number;
  subsystems?: Partial<Record<ProfilerSubsystem, Pick<HardwareProfilerPeak, "frame" | "value">>>;
  peaks: Record<HardwareProfilerFrameMetric, Pick<HardwareProfilerPeak, "frame" | "value">>;
}

export interface HardwareProfilerSession {
  schema: 2;
  id: string;
  createdAt: string;
  frames: HardwareProfilerFrame[];
  peaks: Record<HardwareProfilerFrameMetric, HardwareProfilerPeak>;
  scenePeaks: HardwareProfilerScenePeak[];
}

const metrics: HardwareProfilerFrameMetric[] = ["cpu", "dma", "vram", "oam", "scanline"];

export function createHardwareProfilerSession(id: string, createdAt = new Date().toISOString()): HardwareProfilerSession {
  return {
    schema: 2,
    id,
    createdAt,
    frames: [],
    peaks: Object.fromEntries(metrics.map((metric) => [
      metric,
      { frame: 0, roomIndex: -1, runtime: "unknown", sceneName: "Cena desconhecida", value: null }
    ])) as HardwareProfilerSession["peaks"],
    scenePeaks: []
  };
}

export function appendHardwareProfilerFrame(
  session: HardwareProfilerSession,
  frame: HardwareProfilerFrame
): HardwareProfilerSession {
  const peaks = structuredClone(session.peaks);
  const native = frame.nativeVideo?.frame === frame.frame && frame.nativeVideo.room === frame.roomIndex ? frame.nativeVideo : undefined;
  const sample = (metric: HardwareProfilerFrameMetric) => {
    const peak = metric === "dma" ? native?.peaks.dma : metric === "oam" ? native?.peaks.oam : null;
    return peak ?? { value: frame[metric], frame: frame.frame };
  };
  for (const metric of metrics) {
    const measured = sample(metric);
    if (measured.value !== null && Number.isFinite(measured.value) && (peaks[metric].value === null || measured.value > peaks[metric].value!)) {
      peaks[metric] = {
        frame: measured.frame,
        roomIndex: frame.roomIndex,
        runtime: frame.runtime,
        sceneName: frame.sceneName,
        value: measured.value
      };
    }
  }
  const scenePeaks = structuredClone(session.scenePeaks);
  let scene = scenePeaks.find((candidate) => (
    candidate.roomIndex === frame.roomIndex && candidate.runtime === frame.runtime
  ));
  if (!scene) {
    scene = {
      roomIndex: frame.roomIndex,
      runtime: frame.runtime,
      sceneName: frame.sceneName,
      frameCount: 0,
      peaks: Object.fromEntries(
        metrics.map((metric) => [metric, { frame: 0, value: null }])
      ) as HardwareProfilerScenePeak["peaks"]
    };
    scenePeaks.push(scene);
  }
  scene.frameCount += 1;
  if (native) scene.nativeFrameCount = native.sceneFrameCount;
  if (frame.subsystems) {
    scene.subsystems ??= {};
    for (const subsystem of profilerSubsystems) {
      const value = frame.subsystems[subsystem];
      if (value === undefined || !Number.isFinite(value) || value < 0) continue;
      if (!scene.subsystems[subsystem] || value > (scene.subsystems[subsystem]!.value ?? -1)) {
        scene.subsystems[subsystem] = { frame: frame.frame, value };
      }
    }
  }
  for (const metric of metrics) {
    const measured = sample(metric);
    if (measured.value !== null && Number.isFinite(measured.value) && (scene.peaks[metric].value === null || measured.value > scene.peaks[metric].value!)) {
      scene.peaks[metric] = measured;
    }
  }
  return {
    ...session,
    frames: [...session.frames, structuredClone(frame)],
    peaks,
    scenePeaks
  };
}

export function compareHardwareProfilerSessions(
  baseline: HardwareProfilerSession,
  candidate: HardwareProfilerSession
): { baseline: string; candidate: string; deltas: Record<HardwareProfilerFrameMetric, number | null> } {
  return {
    baseline: baseline.id,
    candidate: candidate.id,
    deltas: Object.fromEntries(metrics.map((metric) => [
      metric,
      candidate.peaks[metric].value === null || baseline.peaks[metric].value === null ? null : candidate.peaks[metric].value! - baseline.peaks[metric].value!
    ])) as Record<HardwareProfilerFrameMetric, number | null>
  };
}
