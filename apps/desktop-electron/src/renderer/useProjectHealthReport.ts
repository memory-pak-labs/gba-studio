import { useEffect, useMemo, useRef, useState } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import { deriveProjectHealthReport } from "../shared/projectHealth";
import type { ProjectHealthAnalysis } from "./projectHealth.worker";

interface HealthSource {
  data: GBAProjectData;
  identity: object | undefined;
}

interface HealthSnapshot {
  source: HealthSource;
  analysis: ProjectHealthAnalysis;
}

export function useProjectHealthReport(data: GBAProjectData | null, identity: object | undefined) {
  const workerRef = useRef<Worker | null>(null);
  const inFlight = useRef<HealthSource | null>(null);
  const [completed, setCompleted] = useState<HealthSnapshot | null>(null);
  const [workerUnavailable, setWorkerUnavailable] = useState(() => typeof Worker === "undefined");

  const hasProject = data !== null;
  useEffect(() => {
    if (!hasProject || workerUnavailable) return;
    let worker: Worker;
    try {
      worker = new Worker(new URL("./projectHealth.worker.ts", import.meta.url));
    } catch {
      setWorkerUnavailable(true);
      return;
    }
    workerRef.current = worker;
    worker.onmessage = ({ data: analysis }: MessageEvent<ProjectHealthAnalysis>) => {
      const source = inFlight.current;
      inFlight.current = null;
      if (source) setCompleted({ source, analysis });
    };
    worker.onerror = () => setWorkerUnavailable(true);
    worker.onmessageerror = () => setWorkerUnavailable(true);
    return () => {
      worker.terminate();
      workerRef.current = null;
      inFlight.current = null;
    };
  }, [hasProject, workerUnavailable]);

  const matchesProject = completed !== null && completed.source.identity === identity;
  const current = matchesProject && completed?.source.data === data;

  useEffect(() => {
    const worker = workerRef.current;
    // While an analysis is running, the next response schedules only the most recent edit.
    if (!worker || !data || current || inFlight.current) return;
    inFlight.current = { data, identity };
    try {
      worker.postMessage(data);
    } catch {
      setWorkerUnavailable(true);
    }
  }, [data, identity, completed, current]);

  const fallbackReport = useMemo(() => workerUnavailable && data ? deriveProjectHealthReport(data) : null, [data, workerUnavailable]);
  const analysis = hasProject && matchesProject && !workerUnavailable ? completed.analysis : null;
  return {
    report: analysis?.report ?? fallbackReport,
    estimatedRomBytes: analysis?.estimatedRomBytes,
    pending: hasProject && !workerUnavailable && !current
  };
}
