import type { GBAProjectData } from "./projectFile.js";
import type { RoomsWorkspaceRoom } from "./roomsWorkspace/core.js";

export interface EditorSceneGroup {
  id: string;
  name: string;
  sceneIDs: string[];
}

export interface EditorSceneOrganization {
  order: string[];
  groups: EditorSceneGroup[];
}

export type EditorRailExpandState = {
  project: boolean;
  prefabsLibrary: boolean;
  prefabsActors: boolean;
  prefabsTriggers: boolean;
};

export const defaultEditorRailExpandState: EditorRailExpandState = {
  project: true,
  prefabsLibrary: true,
  prefabsActors: true,
  prefabsTriggers: true
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
        const normalized = stringValue(item);
        return normalized ? [normalized] : [];
      })
    : [];
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

export function deriveEditorSceneOrganization(
  rooms: ReadonlyArray<Pick<RoomsWorkspaceRoom, "id">>,
  editorState: unknown
): EditorSceneOrganization {
  const sceneIDs = Array.from(new Set(rooms.map((room) => room.id.trim()).filter(Boolean)));
  const knownSceneIDs = new Set(sceneIDs);
  const rawState = isRecord(editorState) && isRecord(editorState.sceneExplorer)
    ? editorState.sceneExplorer
    : {};
  const persistedOrder = Array.from(new Set(stringArray(rawState.order)));
  const order = [
    ...persistedOrder.filter((id) => knownSceneIDs.has(id)),
    ...sceneIDs.filter((id) => !persistedOrder.includes(id))
  ];
  const claimedSceneIDs = new Set<string>();
  const groupIDs = new Set<string>();
  const groups = (Array.isArray(rawState.groups) ? rawState.groups : []).flatMap((value, index) => {
    if (!isRecord(value)) return [];
    const id = stringValue(value.id);
    const name = stringValue(value.name);
    if (!id || !name || groupIDs.has(id)) return [];
    groupIDs.add(id);
    const sceneIDsInGroup = stringArray(value.sceneIDs).filter((sceneID) => {
      if (!knownSceneIDs.has(sceneID) || claimedSceneIDs.has(sceneID)) return false;
      claimedSceneIDs.add(sceneID);
      return true;
    });
    return [{ id, name: name || `Grupo ${index + 1}`, sceneIDs: sceneIDsInGroup }];
  });

  return { groups, order };
}

export function updateEditorSceneOrganizationInProject(
  data: GBAProjectData,
  organization: EditorSceneOrganization
): GBAProjectData {
  const next = cloneProjectData(data);
  const editorState = isRecord(next.editorState) ? next.editorState : {};
  editorState.sceneExplorer = {
    order: [...organization.order],
    groups: organization.groups.map((group) => ({
      id: group.id,
      name: group.name,
      sceneIDs: [...group.sceneIDs]
    }))
  };
  next.editorState = editorState;
  return next;
}

export function reorderEditorScene(
  organization: EditorSceneOrganization,
  sceneID: string,
  beforeSceneID: string | null
): EditorSceneOrganization {
  if (!organization.order.includes(sceneID)) return organization;
  const order = organization.order.filter((id) => id !== sceneID);
  const targetIndex = beforeSceneID ? order.indexOf(beforeSceneID) : order.length;
  order.splice(targetIndex >= 0 ? targetIndex : order.length, 0, sceneID);
  return { ...organization, order };
}

export function moveEditorSceneToGroup(
  organization: EditorSceneOrganization,
  sceneID: string,
  groupID: string | null
): EditorSceneOrganization {
  if (!organization.order.includes(sceneID)) return organization;
  const groups = organization.groups.map((group) => ({
    ...group,
    sceneIDs: group.sceneIDs.filter((id) => id !== sceneID)
  }));
  if (groupID) {
    const targetGroup = groups.find((group) => group.id === groupID);
    if (targetGroup) targetGroup.sceneIDs.push(sceneID);
  }
  return { ...organization, groups };
}

export function createEditorSceneGroup(
  organization: EditorSceneOrganization,
  id: string,
  name: string
): EditorSceneOrganization {
  const normalizedID = id.trim();
  const normalizedName = name.trim();
  if (!normalizedID || !normalizedName || organization.groups.some((group) => group.id === normalizedID)) {
    return organization;
  }
  return {
    ...organization,
    groups: [...organization.groups, { id: normalizedID, name: normalizedName, sceneIDs: [] }]
  };
}

export function renameEditorSceneGroup(
  organization: EditorSceneOrganization,
  groupID: string,
  name: string
): EditorSceneOrganization {
  const normalizedName = name.trim();
  if (!normalizedName) return organization;
  return {
    ...organization,
    groups: organization.groups.map((group) => group.id === groupID ? { ...group, name: normalizedName } : group)
  };
}

export function removeEditorSceneGroup(
  organization: EditorSceneOrganization,
  groupID: string
): EditorSceneOrganization {
  return {
    ...organization,
    groups: organization.groups.filter((group) => group.id !== groupID)
  };
}

export function toggleEditorRailSection(
  current: EditorRailExpandState,
  section: keyof EditorRailExpandState
): EditorRailExpandState {
  return {
    ...current,
    [section]: !current[section]
  };
}

export function roomTreeSubtitle(
  room: Pick<RoomsWorkspaceRoom, "sceneType" | "isStart" | "isActive">
): string {
  const parts = [room.sceneType];
  if (room.isStart) parts.push("inicial");
  if (room.isActive) parts.push("ativa");
  return parts.join(" · ");
}
