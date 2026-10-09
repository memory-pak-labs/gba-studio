export interface DirtySessionLike {
  dirty: boolean;
}

export function canDiscardUnsavedChanges(
  session: DirtySessionLike | null,
  confirmDiscard: (message: string) => boolean
): boolean {
  if (!session?.dirty) return true;
  return confirmDiscard("Continuar sem salvar as alteracoes do projeto?");
}

export async function canDiscardUnsavedChangesAsync(
  session: DirtySessionLike | null,
  confirmDiscard: (message: string) => Promise<boolean>
): Promise<boolean> {
  if (!session?.dirty) return true;
  return confirmDiscard("Continuar sem salvar as alteracoes do projeto?");
}
