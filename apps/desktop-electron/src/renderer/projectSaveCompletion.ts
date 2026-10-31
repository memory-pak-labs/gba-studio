import type { SaveProjectResult } from "../shared/ipc.js";
import type { ProjectSession } from "./projectSession.js";

export function completeProjectSave(current: ProjectSession | null, snapshot: ProjectSession, result: SaveProjectResult): ProjectSession | null {
  if (!current || result.canceled || result.error || !result.path
    || current.path !== snapshot.path || current.project.data !== snapshot.project.data || current.dirty !== snapshot.dirty) return current;
  return { ...current, path: result.path, dirty: false };
}
