import type { GBAProjectData } from "./projectFile.js";
import {
  deriveProjectHealthReport,
  type ProjectDiagnosticSeverity,
  type ProjectDiagnosticWorkspace
} from "./projectHealth.js";

export type ProjectProblemWorkspace = ProjectDiagnosticWorkspace;
export type ProjectProblemSeverity = ProjectDiagnosticSeverity;

export interface ProjectProblem {
  id: string;
  code?: string;
  message: string;
  severity: ProjectProblemSeverity;
  workspace: ProjectProblemWorkspace;
  targetID?: string;
  targetName?: string;
}

const workspaceOrder: ProjectProblemWorkspace[] = ["Arquivos", "Editor", "Sprites", "Dialogos", "Audio", "Exportar", "Ajustes"];

function severityRank(severity: ProjectProblemSeverity): number {
  return severity === "error" ? 0 : 1;
}

export function deriveProjectProblems(data: GBAProjectData): ProjectProblem[] {
  const report = deriveProjectHealthReport(data);
  return report.diagnostics
    .filter((diagnostic): diagnostic is typeof diagnostic & { severity: ProjectProblemSeverity } => diagnostic.severity !== "info")
    .map((diagnostic) => ({
      id: diagnostic.id,
      code: diagnostic.code,
      message: diagnostic.message,
      severity: diagnostic.severity,
      workspace: diagnostic.workspace,
      targetID: diagnostic.targetID,
      targetName: diagnostic.targetName
    }))
    .sort((left, right) => (
      severityRank(left.severity) - severityRank(right.severity)
      || workspaceOrder.indexOf(left.workspace) - workspaceOrder.indexOf(right.workspace)
      || left.message.localeCompare(right.message, "pt-BR")
    ));
}
