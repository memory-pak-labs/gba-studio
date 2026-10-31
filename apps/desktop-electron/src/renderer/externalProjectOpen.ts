import type { OpenProjectResult } from "../shared/ipc.js";

/** Register and watch an external project only after navigation is accepted. */
export async function resolveExternalProjectOpen(
  result: OpenProjectResult,
  confirmDiscard: () => Promise<boolean>,
  openProjectAtPath: (path: string) => Promise<OpenProjectResult>
): Promise<OpenProjectResult | null> {
  if (!(await confirmDiscard())) return null;
  if (result.path && result.project && !result.error && !result.canceled) {
    return openProjectAtPath(result.path);
  }
  return result;
}
