import type { SaveProjectRequest, SaveProjectResult } from "../shared/ipc.js";
import type { ParsedGBAProject } from "../shared/projectFile.js";

interface SaveableProjectSession { path?: string; project: ParsedGBAProject; dirty: boolean }

export async function saveExistingProjectSession<T extends SaveableProjectSession>(
  session: T,
  saveProject: (request: SaveProjectRequest) => Promise<SaveProjectResult>,
  saveAs = false
): Promise<{ result: SaveProjectResult; session: T }> {
  const result = await saveProject(saveAs ? { project: session.project, sourcePath: session.path } : { path: session.path, project: session.project });
  return { result, session: !result.canceled && !result.error && result.path ? { ...session, path: result.path, dirty: false } : session };
}
