export interface HardwareProfilerFrame {
  frame: number;
  roomIndex: number;
  sceneName: string;
  runtime: string;
  cpu: number;
  dma: number;
  vram: number;
  oam: number;
  scanline: number;
}

export type HardwareProfilerFrameMetric = Exclude<
  keyof HardwareProfilerFrame,
  "frame" | "roomIndex" | "runtime" | "sceneName"
>;

export interface HardwareProfilerPeak {
  frame: number;
  roomIndex: number;
  sceneName: string;
  runtime: string;
  value: number;
}

export interface HardwareProfilerScenePeak {
  roomIndex: number;
  sceneName: string;
  runtime: string;
  frameCount: number;
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
      { frame: 0, roomIndex: -1, runtime: "unknown", sceneName: "Cena desconhecida", value: 0 }
    ])) as HardwareProfilerSession["peaks"],
    scenePeaks: []
  };
}

export function appendHardwareProfilerFrame(
  session: HardwareProfilerSession,
  frame: HardwareProfilerFrame
): HardwareProfilerSession {
  const peaks = structuredClone(session.peaks);
  for (const metric of metrics) {
    if (frame[metric] > peaks[metric].value) {
      peaks[metric] = {
        frame: frame.frame,
        roomIndex: frame.roomIndex,
        runtime: frame.runtime,
        sceneName: frame.sceneName,
        value: frame[metric]
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
        metrics.map((metric) => [metric, { frame: 0, value: 0 }])
      ) as HardwareProfilerScenePeak["peaks"]
    };
    scenePeaks.push(scene);
  }
  scene.frameCount += 1;
  for (const metric of metrics) {
    if (frame[metric] > scene.peaks[metric].value) {
      scene.peaks[metric] = { frame: frame.frame, value: frame[metric] };
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
): { baseline: string; candidate: string; deltas: Record<HardwareProfilerFrameMetric, number> } {
  return {
    baseline: baseline.id,
    candidate: candidate.id,
    deltas: Object.fromEntries(metrics.map((metric) => [
      metric,
      candidate.peaks[metric].value - baseline.peaks[metric].value
    ])) as Record<HardwareProfilerFrameMetric, number>
  };
}
