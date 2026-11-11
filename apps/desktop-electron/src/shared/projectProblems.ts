import type { GBAProjectData } from "./projectFile.js";
import {
  deriveProjectHealthReport,
  type ProjectHealthOptions,
  type ProjectHealthReport,
  type ProjectDiagnosticSeverity,
  type ProjectDiagnosticWorkspace
} from "./projectHealth.js";

export type ProjectProblemWorkspace = ProjectDiagnosticWorkspace;
export type ProjectProblemSeverity = ProjectDiagnosticSeverity;

export interface ProjectProblem {
  id: string;
  code?: string;
  message: string;
  detail?: string;
  severity: ProjectProblemSeverity;
  workspace: ProjectProblemWorkspace;
  targetID?: string;
  targetName?: string;
  targetField?: "x" | "y" | "width" | "height";
  sceneName?: string;
}

const workspaceOrder: ProjectProblemWorkspace[] = ["Arquivos", "Editor", "Sprites", "Dialogos", "Audio", "Exportar", "Ajustes"];

function severityRank(severity: ProjectProblemSeverity): number {
  return severity === "error" ? 0 : 1;
}

export function deriveProjectProblems(data: GBAProjectData, options: ProjectHealthOptions = {}): ProjectProblem[] {
  return projectProblemsFromHealthReport(deriveProjectHealthReport(data, options));
}

export function projectProblemsFromHealthReport(report: ProjectHealthReport): ProjectProblem[] {
  return report.diagnostics
    .filter((diagnostic): diagnostic is typeof diagnostic & { severity: ProjectProblemSeverity } => diagnostic.severity !== "info")
    .map((diagnostic) => ({
      id: diagnostic.id,
      code: diagnostic.code,
      message: diagnostic.message,
      detail: diagnostic.detail,
      severity: diagnostic.severity,
      workspace: diagnostic.workspace,
      targetID: diagnostic.targetID,
      targetName: diagnostic.targetName,
      targetField: diagnostic.targetField, sceneName: diagnostic.sceneName
    }))
    .sort((left, right) => (
      severityRank(left.severity) - severityRank(right.severity)
      || workspaceOrder.indexOf(left.workspace) - workspaceOrder.indexOf(right.workspace)
      || left.message.localeCompare(right.message, "pt-BR")
    ));
}
