import { previewCommandToExportOps } from "./previewRomParity.js";
import { nativeRuntimeEventCommandVerbs } from "./eventCommandRegistry.js";

export type PreviewRomParityMatrixStatus = "ok-rom" | "preview-only" | "unsupported";

export interface PreviewRomParityMatrixEntry {
  verb: string;
  preview: "runtime-p0" | "runtime-js" | "none";
  exportOps: string[];
  status: PreviewRomParityMatrixStatus;
}

/** Verbos do runtime nativo, derivados da mesma fonte de verdade usada pelo export. */
export const previewRomOkVerbs = [
  ...nativeRuntimeEventCommandVerbs(),
  "stop_event",
  "switch_variable",
  "repeat_expression"
];

export function buildPreviewRomParityMatrix(): PreviewRomParityMatrixEntry[] {
  return previewRomOkVerbs.map((verb) => {
    const exportOps = previewCommandToExportOps(`${verb} sample`);
    return {
      verb,
      preview: "runtime-p0",
      exportOps,
      status: exportOps.length > 0 ? "ok-rom" : "preview-only"
    };
  });
}

export function previewRomParityMatrixIssues(): string[] {
  return buildPreviewRomParityMatrix()
    .filter((entry) => entry.verb !== "noop" && entry.status !== "ok-rom")
    .map((entry) => `${entry.verb} sem opcode de export mapeado`);
}
