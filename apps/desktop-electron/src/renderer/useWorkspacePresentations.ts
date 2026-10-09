import { useDeferredValue, useMemo } from "react";
import { deriveAudioWorkspacePresentation } from "../shared/audioWorkspace";
import { deriveDialoguesWorkspacePresentation } from "../shared/dialoguesWorkspace";
import { deriveFilesWorkspacePresentation } from "../shared/filesWorkspace";
import { deriveProjectContractDiagnostics } from "../shared/projectContractDiagnostics";
import { deriveProjectHealthReport } from "../shared/projectHealth";
import { deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace";
import { deriveSettingsWorkspacePresentation } from "../shared/settingsWorkspace";
import { deriveSpritesWorkspacePresentation } from "../shared/spritesWorkspace";
import type { GBAProjectData } from "../shared/projectFile";
import type { ProjectPluginRegistry } from "../shared/gbaStudioPlugins";
import type { ProjectSession } from "./projectSession";
import type { WorkspaceName } from "./workspaceNavigation";

function shouldDeriveWorkspace(workspace: WorkspaceName, selectedWorkspace: WorkspaceName): boolean {
  return workspace === selectedWorkspace;
}

export function useWorkspacePresentations(
  session: ProjectSession | null,
  selectedWorkspace: WorkspaceName,
  pluginRegistry: ProjectPluginRegistry | null = null
) {
  const projectData = session?.project.data ?? null;
  const deferredProjectData = useDeferredValue(projectData);

  const contractDiagnostics = useMemo(() => {
    return deferredProjectData ? deriveProjectContractDiagnostics(deferredProjectData) : null;
  }, [deferredProjectData]);

  const filesPresentation = useMemo(() => {
    return projectData && shouldDeriveWorkspace("Arquivos", selectedWorkspace)
      ? deriveFilesWorkspacePresentation(projectData)
      : null;
  }, [projectData, selectedWorkspace]);

  const roomsPresentation = useMemo(() => {
    return projectData && (shouldDeriveWorkspace("Editor", selectedWorkspace) || shouldDeriveWorkspace("Exportar", selectedWorkspace))
      ? deriveRoomsWorkspacePresentation(projectData)
      : null;
  }, [projectData, selectedWorkspace]);

  const spritesPresentation = useMemo(() => {
    return projectData && shouldDeriveWorkspace("Sprites", selectedWorkspace)
      ? deriveSpritesWorkspacePresentation(projectData)
      : null;
  }, [projectData, selectedWorkspace]);

  const dialoguesPresentation = useMemo(() => {
    return projectData && shouldDeriveWorkspace("Dialogos", selectedWorkspace)
      ? deriveDialoguesWorkspacePresentation(projectData)
      : null;
  }, [projectData, selectedWorkspace]);

  const audioPresentation = useMemo(() => {
    return projectData && shouldDeriveWorkspace("Audio", selectedWorkspace)
      ? deriveAudioWorkspacePresentation(projectData)
      : null;
  }, [projectData, selectedWorkspace]);

  const settingsPresentation = useMemo(() => {
    return projectData && (
      shouldDeriveWorkspace("Ajustes", selectedWorkspace)
      || shouldDeriveWorkspace("Cenas", selectedWorkspace)
      || shouldDeriveWorkspace("Exportar", selectedWorkspace)
    )
      ? deriveSettingsWorkspacePresentation(projectData)
      : null;
  }, [projectData, selectedWorkspace]);

  const projectHealthReport = useMemo(() => {
    return projectData && shouldDeriveWorkspace("Exportar", selectedWorkspace)
      ? deriveProjectHealthReport(projectData)
      : null;
  }, [projectData, selectedWorkspace]);

  return {
    audioPresentation,
    contractDiagnostics,
    dialoguesPresentation,
    filesPresentation,
    projectHealthReport,
    projectData: projectData as GBAProjectData | null,
    roomsPresentation,
    settingsPresentation,
    spritesPresentation
  };
}
