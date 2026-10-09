export const WORKSPACE_EXPLORER_STORAGE_PREFIX = "gba-studio:explorer:";

export function workspaceExplorerStorageKey(workspaceId: string): string {
  return `${WORKSPACE_EXPLORER_STORAGE_PREFIX}${workspaceId}`;
}

export function readExplorerRailCollapsed(
  workspaceId: string,
  storage: Pick<Storage, "getItem"> = localStorage
): boolean {
  return storage.getItem(workspaceExplorerStorageKey(workspaceId)) === "collapsed";
}

export function writeExplorerRailCollapsed(
  workspaceId: string,
  collapsed: boolean,
  storage: Pick<Storage, "setItem"> = localStorage
): void {
  storage.setItem(workspaceExplorerStorageKey(workspaceId), collapsed ? "collapsed" : "expanded");
}

export function toggleExplorerRailCollapsed(collapsed: boolean): boolean {
  return !collapsed;
}
