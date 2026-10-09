export type ProjectActionID = "create-backup" | "export-rom-engine" | "export-web" | "close-project";

export interface ProjectActionMenuItem {
  id: ProjectActionID;
  label: string;
  disabled: boolean;
  reason?: string;
}

export interface ProjectActionMenuState {
  hasSession: boolean;
  hasProjectPath: boolean;
  hasEngineAssetc: boolean;
  hasEngineBuild: boolean;
  contractDiagnosticsOK: boolean | null;
  projectHealthExportReady?: boolean | null;
  buildRunning: boolean;
  exportRunning: boolean;
}

import { canGenerateRom, generateRomBlockedReason } from "./engineRomPipeline.js";

export function deriveProjectActionMenuItems(state: ProjectActionMenuState): ProjectActionMenuItem[] {
  const generateRomReason = generateRomBlockedReason({
    hasSession: state.hasSession,
    hasProjectPath: state.hasProjectPath,
    contractDiagnosticsOK: state.contractDiagnosticsOK,
    projectHealthExportReady: state.projectHealthExportReady,
    hasEngineAssetc: state.hasEngineAssetc,
    hasEngineBuild: state.hasEngineBuild,
    buildRunning: state.buildRunning,
    exportRunning: state.exportRunning
  });

  return [
    {
      id: "create-backup",
      label: "Criar backup",
      disabled: !state.hasSession,
      reason: state.hasSession ? undefined : "Abra ou crie um projeto antes de criar backup."
    },
    {
      id: "export-rom-engine",
      label: "Exportar ROM .gba",
      disabled: !canGenerateRom({
        hasSession: state.hasSession,
        hasProjectPath: state.hasProjectPath,
        contractDiagnosticsOK: state.contractDiagnosticsOK,
        projectHealthExportReady: state.projectHealthExportReady,
        hasEngineAssetc: state.hasEngineAssetc,
        hasEngineBuild: state.hasEngineBuild,
        buildRunning: state.buildRunning,
        exportRunning: state.exportRunning
      }),
      reason: generateRomReason
    },
    {
      id: "export-web",
      label: "Exportar Web / itch.io",
      disabled: !state.hasSession || !state.hasProjectPath || !state.hasEngineBuild || state.buildRunning,
      reason: exportWebDisabledReason(state)
    },
    {
      id: "close-project",
      label: "Fechar projeto",
      disabled: !state.hasSession,
      reason: state.hasSession ? undefined : "Nenhum projeto aberto."
    }
  ];
}

function exportWebDisabledReason(state: ProjectActionMenuState): string | undefined {
  if (!state.hasSession) return "Abra ou crie um projeto antes de exportar Web.";
  if (!state.hasProjectPath) return "Salve o projeto antes de exportar Web.";
  if (!state.hasEngineBuild) return "GBAStudio Engine Pack com gbsbuild nao localizado.";
  if (state.buildRunning) return "Build de ROM em andamento.";
  return undefined;
}
