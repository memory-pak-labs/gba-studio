import type { ParsedGBAProject } from "../shared/projectFile.js";
import { setActiveRoomInProject } from "../shared/roomsWorkspace.js";

export interface ProjectSession {
  path?: string;
  project: ParsedGBAProject;
  dirty: boolean;
  redoStack: ParsedGBAProject["data"][];
  undoStack: ParsedGBAProject["data"][];
}

/** Keep the active scene mirror for editor consumers without recording navigation as an edit. */
export function selectProjectSessionRoom(session: ProjectSession, roomID: string): ProjectSession {
  const active = session.project.data.scena as Record<string, unknown> | undefined;
  if (active?.id === roomID) return session;
  const data = setActiveRoomInProject(session.project.data, roomID);
  if (data === session.project.data) return session;
  return { ...session, project: { ...session.project, data } };
}
