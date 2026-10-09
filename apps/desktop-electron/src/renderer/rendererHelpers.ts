import type { OpenProjectResult, SaveProjectResult } from "../shared/ipc.js";
import type { DroppedFileLike } from "../shared/dropProject.js";

export function statusText(result?: OpenProjectResult | SaveProjectResult): string {
  if (!result) return "Pronto para abrir um projeto.";
  if (result.canceled) return "Operacao cancelada.";
  if (result.error) return result.error;
  if ("importReport" in result && result.importReport) {
    const report = result.importReport;
    return `GB Studio importado: ${report.resourceCount} recursos, ${report.copiedAssetCount} assets, ${report.translatedEventCount} eventos convertidos e ${report.unsupportedEventCount} pendentes. Arquivo: ${result.path ?? "projeto sem caminho"}`;
  }
  return result.path ? `Arquivo: ${result.path}` : "Operacao concluida.";
}

export function copyName(name: string): string {
  const dotIndex = name.lastIndexOf(".");
  if (dotIndex <= 0) {
    return `${name} copy`;
  }

  return `${name.slice(0, dotIndex)} copy${name.slice(dotIndex)}`;
}

export function defaultRoomName(existingCount: number): string {
  return `cena_${existingCount + 1}`;
}

export function uniqueDefaultRoomName(existingNames: string[]): string {
  const taken = new Set(existingNames.map((name) => name.trim()).filter(Boolean));
  let index = Math.max(1, taken.size + 1);
  let candidate = `cena_${index}`;
  while (taken.has(candidate)) {
    index += 1;
    candidate = `cena_${index}`;
  }
  return candidate;
}

export function parentDirectory(filePath: string | undefined): string | null {
  if (!filePath) return null;
  const index = Math.max(filePath.lastIndexOf("/"), filePath.lastIndexOf("\\"));
  return index > 0 ? filePath.slice(0, index) : null;
}

export function droppedFiles(event: DragEvent): DroppedFileLike[] {
  return Array.from(event.dataTransfer?.files ?? []).map((file) => ({
    name: file.name,
    path: "path" in file && typeof file.path === "string" ? file.path : undefined
  }));
}
