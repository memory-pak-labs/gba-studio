import { summarizeGBAProject, type ParsedGBAProject } from "../shared/projectFile.js";
import { setActiveRoomInProject } from "../shared/roomsWorkspace.js";
import { redoProjectHistory, undoProjectHistory } from "../shared/projectHistory.js";

export interface ProjectSession {
  /** Identity is local to this open session and is never written to the project. */
  identity?: object;
  path?: string;
  project: ParsedGBAProject;
  dirty: boolean;
  savedData?: ParsedGBAProject["data"];
  /** File replacement cannot be undone by restoring project metadata. */
  externalRevision?: number;
  savedExternalRevision?: number;
  redoStack: ParsedGBAProject["data"][];
  undoStack: ParsedGBAProject["data"][];
}

/** Scene navigation changes only a redundant active-scene mirror, not project content. */
function comparableProjectData(data: ParsedGBAProject["data"]): ParsedGBAProject["data"] {
  const scene = data.scena;
  if (!scene || typeof scene !== "object" || Array.isArray(scene) || !Array.isArray(data.scenas)) return data;
  const serializedScene = JSON.stringify(scene);
  if (!data.scenas.some((candidate) => JSON.stringify(candidate) === serializedScene)) return data;
  const { scena: _activeScene, ...content } = data;
  return content;
}

function hasUnsavedProjectData(data: ParsedGBAProject["data"], savedData?: ParsedGBAProject["data"]): boolean {
  return !savedData || JSON.stringify(comparableProjectData(data)) !== JSON.stringify(comparableProjectData(savedData));
}

/** Record the exact data sent to a successful save, preserving later edits. */
export function markProjectSessionSaved(session: ProjectSession, path: string, savedData: ParsedGBAProject["data"], savedExternalRevision = session.externalRevision ?? 0): ProjectSession {
  const snapshot = structuredClone(savedData);
  return { ...session, path, savedData: snapshot, savedExternalRevision,
    dirty: (session.externalRevision ?? 0) !== savedExternalRevision || hasUnsavedProjectData(session.project.data, snapshot) };
}

/** A late save must not change a different project opened in the meantime. */
export function reconcileProjectSessionSaved(current: ProjectSession | null, requested: ProjectSession, path: string, savedData: ParsedGBAProject["data"]): ProjectSession | null {
  if (!current || !requested.identity || current.identity !== requested.identity) return current;
  return markProjectSessionSaved(current, path, savedData, requested.externalRevision ?? 0);
}

export function restoreProjectSessionHistory(session: ProjectSession, direction: "undo" | "redo"): ProjectSession {
  const state = { present: session.project.data, undoStack: session.undoStack, redoStack: session.redoStack };
  const history = direction === "undo" ? undoProjectHistory(state) : redoProjectHistory(state);
  if (history.present === state.present) return session;
  return { ...session, dirty: (session.externalRevision ?? 0) !== (session.savedExternalRevision ?? 0) || hasUnsavedProjectData(history.present, session.savedData),
    project: { data: history.present, summary: summarizeGBAProject(history.present) },
    undoStack: history.undoStack, redoStack: history.redoStack };
}

/** Keep the active scene mirror for editor consumers without recording navigation as an edit. */
export function selectProjectSessionRoom(session: ProjectSession, roomID: string): ProjectSession {
  const active = session.project.data.scena as Record<string, unknown> | undefined;
  if (active?.id === roomID) return session;
  const data = setActiveRoomInProject(session.project.data, roomID);
  if (data === session.project.data) return session;
  return { ...session, project: { ...session.project, data } };
}
