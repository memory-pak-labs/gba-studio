import { assetFileSourceInProject, replaceAssetFileInProject } from "../shared/filesWorkspace.js";
import type { ImportedAssetFile } from "../shared/ipc.js";
import { summarizeGBAProject, type ParsedGBAProject } from "../shared/projectFile.js";
import { setActiveRoomInProject } from "../shared/roomsWorkspace.js";
import { pushProjectHistory, redoProjectHistory, undoProjectHistory } from "../shared/projectHistory.js";
import { audioRecords, audioSourceAsset } from "../shared/audioContract.js";
import { prepareTrackerModuleForEditingInProject } from "../shared/trackerModuleEditing.js";
import type { TrackerModuleSong } from "../shared/trackerModule.js";

export interface ProjectSession {
  /** Identity is local to this open session and is never written to the project. */
  identity?: object;
  path?: string;
  project: ParsedGBAProject;
  dirty: boolean;
  savedData?: ParsedGBAProject["data"];
  redoStack: ParsedGBAProject["data"][];
  undoStack: ParsedGBAProject["data"][];
}

/** A module read may finish after unrelated edits, another project, or a source replacement. */
export function commitEditableTrackerImport(current: ProjectSession | null, requested: ProjectSession, audioID: string, song: TrackerModuleSong): ProjectSession | null {
  if (!current || !requested.identity || current.identity !== requested.identity || current.path !== requested.path) return current;
  const source = (session: ProjectSession) => {
    const audio = audioRecords(session.project.data.audioItems).find(item => item.id === audioID);
    const asset = audio && audioSourceAsset(session.project.data, audio);
    return asset ? JSON.stringify([asset.id, (asset.metadata as Record<string, unknown> | undefined)?.source]) : null;
  };
  if (!source(requested) || source(requested) !== source(current)) return current;
  const data = prepareTrackerModuleForEditingInProject(current.project.data, audioID, song);
  if (data === current.project.data) return current;
  const history = pushProjectHistory({ present: current.project.data, undoStack: current.undoStack, redoStack: current.redoStack }, data);
  return { ...current, dirty: true, project: { data: history.present, summary: summarizeGBAProject(history.present) }, undoStack: history.undoStack, redoStack: history.redoStack };
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
export function markProjectSessionSaved(session: ProjectSession, path: string, savedData: ParsedGBAProject["data"]): ProjectSession {
  const snapshot = structuredClone(savedData);
  return { ...session, path, savedData: snapshot, dirty: hasUnsavedProjectData(session.project.data, snapshot) };
}

/** A late save must not change a different project opened in the meantime. */
export function reconcileProjectSessionSaved(current: ProjectSession | null, requested: ProjectSession, path: string, savedData: ParsedGBAProject["data"]): ProjectSession | null {
  if (!current || !requested.identity || current.identity !== requested.identity) return current;
  return markProjectSessionSaved(current, path, savedData);
}

export function restoreProjectSessionHistory(session: ProjectSession, direction: "undo" | "redo"): ProjectSession {
  const state = { present: session.project.data, undoStack: session.undoStack, redoStack: session.redoStack };
  const history = direction === "undo" ? undoProjectHistory(state) : redoProjectHistory(state);
  if (history.present === state.present) return session;
  return { ...session, dirty: hasUnsavedProjectData(history.present, session.savedData),
    project: { data: history.present, summary: summarizeGBAProject(history.present) },
    undoStack: history.undoStack, redoStack: history.redoStack };
}

/** Apply a completed file selection only if its project and asset version are still current. */
export function commitProjectAssetReplacement(
  current: ProjectSession | null,
  requested: ProjectSession,
  projectPath: string,
  assetID: string,
  previousSource: string,
  replacement: ImportedAssetFile
): ProjectSession | null {
  if (!current || !requested.identity || current.identity !== requested.identity || current.path !== projectPath
    || assetFileSourceInProject(current.project.data, assetID) !== previousSource) return current;

  const data = replaceAssetFileInProject(current.project.data, assetID, replacement);
  const history = pushProjectHistory({ present: current.project.data, undoStack: current.undoStack, redoStack: current.redoStack }, data);
  return {
    ...current,
    project: { data: history.present, summary: summarizeGBAProject(history.present) },
    dirty: hasUnsavedProjectData(history.present, current.savedData),
    undoStack: history.undoStack,
    redoStack: history.redoStack
  };
}

/** Keep the active scene mirror for editor consumers without recording navigation as an edit. */
export function selectProjectSessionRoom(session: ProjectSession, roomID: string): ProjectSession {
  const active = session.project.data.scena as Record<string, unknown> | undefined;
  if (active?.id === roomID) return session;
  const data = setActiveRoomInProject(session.project.data, roomID);
  if (data === session.project.data) return session;
  return { ...session, project: { ...session.project, data } };
}
