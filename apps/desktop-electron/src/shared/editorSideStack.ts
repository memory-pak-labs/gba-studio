export const EDITOR_SIDE_STACK_STORAGE_PREFIX = "gba-studio:editor-side:v2:";
export const DEFAULT_EDITOR_SIDE_STACK_SPLIT = 0.6;
export const MIN_EDITOR_SIDE_STACK_SPLIT = 0.24;
export const MAX_EDITOR_SIDE_STACK_SPLIT = 0.72;
export const DEFAULT_EDITOR_SIDE_STACK_WIDTH = 320;
export const MIN_EDITOR_SIDE_STACK_WIDTH = 320;
export const MAX_EDITOR_SIDE_STACK_WIDTH = 760;

export function editorSideStackStorageKey(workspaceId: string, suffix: "collapsed" | "split" | "width"): string {
  return `${EDITOR_SIDE_STACK_STORAGE_PREFIX}${workspaceId}:${suffix}`;
}

export function clampEditorSideStackSplit(ratio: number): number {
  if (!Number.isFinite(ratio)) {
    return DEFAULT_EDITOR_SIDE_STACK_SPLIT;
  }

  return Math.min(MAX_EDITOR_SIDE_STACK_SPLIT, Math.max(MIN_EDITOR_SIDE_STACK_SPLIT, ratio));
}

export function readEditorSideStackSplit(
  workspaceId: string,
  storage: Pick<Storage, "getItem"> = localStorage
): number {
  const raw = storage.getItem(editorSideStackStorageKey(workspaceId, "split"));
  if (!raw) {
    return DEFAULT_EDITOR_SIDE_STACK_SPLIT;
  }

  return clampEditorSideStackSplit(Number.parseFloat(raw));
}

export function writeEditorSideStackSplit(
  workspaceId: string,
  ratio: number,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(
    editorSideStackStorageKey(workspaceId, "split"),
    String(clampEditorSideStackSplit(ratio))
  );
}

export function clampEditorSideStackWidth(width: number): number {
  if (!Number.isFinite(width)) {
    return DEFAULT_EDITOR_SIDE_STACK_WIDTH;
  }

  return Math.min(MAX_EDITOR_SIDE_STACK_WIDTH, Math.max(MIN_EDITOR_SIDE_STACK_WIDTH, Math.round(width)));
}

export function readEditorSideStackWidth(
  workspaceId: string,
  storage: Pick<Storage, "getItem"> = localStorage
): number {
  const raw = storage.getItem(editorSideStackStorageKey(workspaceId, "width"));
  if (!raw) {
    return DEFAULT_EDITOR_SIDE_STACK_WIDTH;
  }

  return clampEditorSideStackWidth(Number.parseFloat(raw));
}

export function writeEditorSideStackWidth(
  workspaceId: string,
  width: number,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(
    editorSideStackStorageKey(workspaceId, "width"),
    String(clampEditorSideStackWidth(width))
  );
}

export function readEditorSideStackCollapsed(
  workspaceId: string,
  storage: Pick<Storage, "getItem"> = localStorage
): boolean {
  return storage.getItem(editorSideStackStorageKey(workspaceId, "collapsed")) === "collapsed";
}

export function writeEditorSideStackCollapsed(
  workspaceId: string,
  collapsed: boolean,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(
    editorSideStackStorageKey(workspaceId, "collapsed"),
    collapsed ? "collapsed" : "expanded"
  );
}

export function toggleEditorSideStackCollapsed(collapsed: boolean): boolean {
  return !collapsed;
}
