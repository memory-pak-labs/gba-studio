import type {
  ExportAudioResult,
  ExportDialogueResult,
  ExportEventResult,
  SaveProjectResult,
  ValidateSettingsPathsResult
} from "./ipc.js";

export type FeedbackTone = "info" | "success" | "error";

export interface FeedbackMessage {
  message: string;
  tone: FeedbackTone;
}

function savedProjectLabel(projectPath: string): string {
  const normalized = projectPath.replaceAll("\\", "/").replace(/\/+$/, "");
  return normalized.slice(normalized.lastIndexOf("/") + 1) || projectPath;
}

export function saveProjectFeedback(result: SaveProjectResult): FeedbackMessage {
  if (result.canceled) {
    return { message: "Salvamento cancelado.", tone: "info" };
  }
  if (result.error) {
    return { message: result.error, tone: "error" };
  }
  return {
    message: result.path ? `Projeto salvo: ${savedProjectLabel(result.path)}` : "Projeto salvo.",
    tone: "success"
  };
}

type ExportArtifactResult = ExportAudioResult | ExportDialogueResult | ExportEventResult;

export function exportArtifactFeedback(
  label: "Audio" | "Dialogo" | "Evento",
  fallbackName: string,
  result: ExportArtifactResult
): FeedbackMessage {
  if (result.canceled) {
    return { message: `Exportacao de ${label} cancelada.`, tone: "info" };
  }
  if (result.error) {
    return { message: result.error, tone: "error" };
  }
  return {
    message: `${label} exportado: ${result.path ?? fallbackName}.`,
    tone: "success"
  };
}

export function settingsPathValidationFeedback(result: ValidateSettingsPathsResult): FeedbackMessage {
  if (result.error) {
    return { message: result.error, tone: "error" };
  }
  if (result.ok) {
    return { message: "Paths de Ajustes validados.", tone: "info" };
  }

  const issueCount = result.items.filter((item) => !item.ok).length;
  const plural = issueCount === 1 ? "" : "s";
  return {
    message: `Ajustes tem ${issueCount} path${plural} com pendencia${plural}.`,
    tone: "error"
  };
}
