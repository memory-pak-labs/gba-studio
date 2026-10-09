import type { ImportAssetsRequest, ImportAssetsResult, SaveProjectResult } from "../shared/ipc.js";

interface RunFilesImportFlowOptions {
  projectPath?: string;
  saveProject(): Promise<SaveProjectResult>;
  importAssets(request: ImportAssetsRequest): Promise<ImportAssetsResult>;
  onSaveResult?(result: SaveProjectResult): void;
}

export interface FilesImportFlowResult {
  projectPath: string;
  result: ImportAssetsResult;
}

export async function runFilesImportFlow({
  projectPath,
  saveProject,
  importAssets,
  onSaveResult
}: RunFilesImportFlowOptions): Promise<FilesImportFlowResult | null> {
  let resolvedProjectPath = projectPath;
  if (!resolvedProjectPath) {
    const saveResult = await saveProject();
    onSaveResult?.(saveResult);
    if (saveResult.canceled || saveResult.error || !saveResult.path) return null;
    resolvedProjectPath = saveResult.path;
  }

  return {
    projectPath: resolvedProjectPath,
    result: await importAssets({ projectPath: resolvedProjectPath })
  };
}
