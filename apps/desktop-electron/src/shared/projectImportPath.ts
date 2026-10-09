export interface ResolvePersistedProjectPathAfterSaveResult {
  canceled: boolean;
  error?: string;
  path: string | null;
}

export interface SaveProjectPathResult {
  canceled?: boolean;
  error?: string;
  path?: string;
}

export function resolvePersistedProjectPathAfterSave(
  currentPath: string | undefined,
  saveResult: SaveProjectPathResult
): ResolvePersistedProjectPathAfterSaveResult {
  const trimmedCurrentPath = currentPath?.trim();
  if (trimmedCurrentPath) {
    return { canceled: false, path: trimmedCurrentPath };
  }

  if (saveResult.canceled) {
    return { canceled: true, path: null };
  }

  const savedPath = saveResult.path?.trim();
  if (!savedPath) {
    return {
      canceled: false,
      error: saveResult.error ?? "Salve o projeto antes de importar tileset.",
      path: null
    };
  }

  return { canceled: false, path: savedPath };
}

export function resolveProjectSessionPathAfterDataCommit(
  currentPath: string | undefined,
  nextPath?: string
): string | undefined {
  const trimmedNextPath = nextPath?.trim();
  if (trimmedNextPath) {
    return trimmedNextPath;
  }

  const trimmedCurrentPath = currentPath?.trim();
  return trimmedCurrentPath || undefined;
}
