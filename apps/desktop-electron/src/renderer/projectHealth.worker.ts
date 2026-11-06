import type { GBAProjectData } from "../shared/projectFile";
import { estimateRomBytes } from "../shared/hardwareProfiler";
import { deriveProjectHealthReport, type ProjectHealthReport } from "../shared/projectHealth";

export interface ProjectHealthAnalysis {
  report: ProjectHealthReport;
  estimatedRomBytes: number;
}

self.onmessage = ({ data }: MessageEvent<GBAProjectData>) => {
  const analysis: ProjectHealthAnalysis = {
    report: deriveProjectHealthReport(data),
    estimatedRomBytes: estimateRomBytes(data)
  };
  self.postMessage(analysis);
};
