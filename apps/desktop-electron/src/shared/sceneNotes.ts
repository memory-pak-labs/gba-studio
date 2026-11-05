import type { GBAProjectData } from "./projectFile.js";

export const SCENE_NOTE_COLORS = ["yellow", "blue", "green", "pink"] as const;
export type SceneNoteColor = typeof SCENE_NOTE_COLORS[number];
export interface SceneNote {
  id: string;
  title: string;
  text: string;
  color: SceneNoteColor;
  x: number;
  y: number;
  width: number;
  height: number;
}
export type SceneNotePatch = Partial<Omit<SceneNote, "id">>;

const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));
const dimension = (value: unknown, fallback: number, min: number, max: number): number =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.round(value))) : fallback;
const editorState = (data: GBAProjectData): Record<string, unknown> => record(data.editorState) ? data.editorState : {};

/** Authoring metadata only. No scene, event or runtime resource is created. */
export function readSceneNotes(data: GBAProjectData): SceneNote[] {
  const notes = editorState(data).sceneNotes;
  if (!Array.isArray(notes)) return [];
  return notes.flatMap(note => {
    if (!record(note) || typeof note.id !== "string" || !note.id.trim()) return [];
    return [{
      id: note.id,
      title: typeof note.title === "string" ? note.title : "",
      text: typeof note.text === "string" ? note.text : "",
      color: SCENE_NOTE_COLORS.includes(note.color as SceneNoteColor) ? note.color as SceneNoteColor : "yellow",
      x: dimension(note.x, 0, 0, 1000000), y: dimension(note.y, 0, 0, 1000000),
      width: dimension(note.width, 240, 180, 1200), height: dimension(note.height, 180, 120, 1200)
    }];
  });
}

function writeNotes(data: GBAProjectData, sceneNotes: SceneNote[]): GBAProjectData {
  return { ...data, editorState: { ...editorState(data), sceneNotes } };
}

export function addSceneNote(data: GBAProjectData, position: { id: string; x: number; y: number }): GBAProjectData {
  const notes = readSceneNotes(data);
  if (!position.id.trim() || notes.some(note => note.id === position.id)) return data;
  return writeNotes(data, [...notes, {
    id: position.id, title: "", text: "", color: "yellow",
    x: dimension(position.x, 0, 0, 1000000), y: dimension(position.y, 0, 0, 1000000), width: 240, height: 180
  }]);
}

export function updateSceneNote(data: GBAProjectData, id: string, patch: SceneNotePatch): GBAProjectData {
  const notes = readSceneNotes(data), index = notes.findIndex(note => note.id === id);
  if (index < 0) return data;
  const previous = notes[index];
  const next: SceneNote = {
    ...previous,
    title: typeof patch.title === "string" ? patch.title : previous.title,
    text: typeof patch.text === "string" ? patch.text : previous.text,
    color: SCENE_NOTE_COLORS.includes(patch.color as SceneNoteColor) ? patch.color! : previous.color,
    x: dimension(patch.x, previous.x, 0, 1000000), y: dimension(patch.y, previous.y, 0, 1000000),
    width: dimension(patch.width, previous.width, 180, 1200), height: dimension(patch.height, previous.height, 120, 1200)
  };
  if (Object.keys(previous).every(key => previous[key as keyof SceneNote] === next[key as keyof SceneNote])) return data;
  return writeNotes(data, notes.map((note, i) => i === index ? next : note));
}

export function removeSceneNote(data: GBAProjectData, id: string): GBAProjectData {
  const notes = readSceneNotes(data);
  return notes.some(note => note.id === id) ? writeNotes(data, notes.filter(note => note.id !== id)) : data;
}
