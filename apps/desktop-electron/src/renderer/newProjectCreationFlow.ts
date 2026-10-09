import type { SaveProjectRequest, SaveProjectResult } from "../shared/ipc.js";
import type { ParsedGBAProject } from "../shared/projectFile.js";

interface SavedProjectSession {
  path: string;
  project: ParsedGBAProject;
  dirty: false;
  redoStack: ParsedGBAProject["data"][];
  undoStack: ParsedGBAProject["data"][];
}

interface SaveNewProjectSessionResult {
  saveResult: SaveProjectResult;
  session: SavedProjectSession | null;
}

export async function saveNewProjectSession(
  project: ParsedGBAProject,
  saveProject: (request: SaveProjectRequest) => Promise<SaveProjectResult>
): Promise<SaveNewProjectSessionResult> {
  const saveResult = await saveProject({ project });
  if (saveResult.canceled || saveResult.error || !saveResult.path) {
    return { saveResult, session: null };
  }

  return {
    saveResult,
    session: {
      dirty: false,
      path: saveResult.path,
      project,
      redoStack: [],
      undoStack: []
    }
  };
}
