import type { GBAProjectData } from "./projectFile.js";

export interface PrepareAudioPreviewRequest {
  requestID: string;
  data: GBAProjectData;
  projectPath?: string;
  audioID: string;
  scope: "pattern" | "sequence";
  patternID?: string | null;
}
export interface EngineAudioPreviewResult {
  requestID: string;
  ok?: boolean;
  canceled?: boolean;
  error?: string;
  url?: string;
  romBytes?: number;
  rowFrames?: number;
  stepCount?: number;
}
