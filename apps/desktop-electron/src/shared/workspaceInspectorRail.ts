export const WORKSPACE_INSPECTOR_STORAGE_PREFIX = "gba-studio:inspector:";

export function workspaceInspectorStorageKey(workspaceId: string): string {
  return `${WORKSPACE_INSPECTOR_STORAGE_PREFIX}${workspaceId}`;
}

export function readInspectorRailCollapsed(
  workspaceId: string,
  storage: Pick<Storage, "getItem"> = localStorage
): boolean {
  return storage.getItem(workspaceInspectorStorageKey(workspaceId)) === "collapsed";
}

export function writeInspectorRailCollapsed(
  workspaceId: string,
  collapsed: boolean,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(workspaceInspectorStorageKey(workspaceId), collapsed ? "collapsed" : "expanded");
}

export function toggleInspectorRailCollapsed(collapsed: boolean): boolean {
  return !collapsed;
}
