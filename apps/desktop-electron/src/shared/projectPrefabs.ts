import type { GBAProjectData } from "./projectFile.js";

export interface ProjectPrefabRecord extends Record<string, unknown> {
  id: string;
  name: string;
}

export type ProjectPrefabKind = "actor" | "trigger";

export interface ProjectPrefabPlacement {
  roomID: string;
  x: number;
  y: number;
}

const instanceFields = new Set(["id", "name", "roomID", "roomId", "x", "y", "prefabID"]);

function slug(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "prefab";
}

function uniqueID(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let suffix = 2;
  while (existing.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.filter((item): item is Record<string, unknown> => typeof item === "object" && item !== null)
    : [];
}

export function projectActorPrefabs(data: GBAProjectData | null | undefined): ProjectPrefabRecord[] {
  return records(data?.actorPrefabs).flatMap((prefab) => {
    const id = typeof prefab.id === "string" ? prefab.id : "";
    if (!id) return [];
    return [{ ...prefab, id, name: typeof prefab.name === "string" && prefab.name ? prefab.name : id }];
  });
}

export function projectTriggerPrefabs(data: GBAProjectData | null | undefined): ProjectPrefabRecord[] {
  return records(data?.triggerPrefabs).flatMap((prefab) => {
    const id = typeof prefab.id === "string" ? prefab.id : "";
    if (!id) return [];
    return [{ ...prefab, id, name: typeof prefab.name === "string" && prefab.name ? prefab.name : id }];
  });
}

function synchronizeInstances(instances: unknown, prefabs: ProjectPrefabRecord[]): Array<Record<string, unknown>> {
  const byID = new Map(prefabs.map((prefab) => [prefab.id, prefab]));
  return records(instances).map((instance) => {
    const prefabID = typeof instance.prefabID === "string" ? instance.prefabID : "";
    const prefab = byID.get(prefabID);
    if (!prefab) return instance;
    const inherited = Object.fromEntries(
      Object.entries(prefab).filter(([key]) => !instanceFields.has(key))
    );
    return { ...instance, ...inherited };
  });
}

export function synchronizeProjectPrefabInstances(data: GBAProjectData): GBAProjectData {
  return {
    ...data,
    actors: synchronizeInstances(data.actors, projectActorPrefabs(data)),
    triggers: synchronizeInstances(data.triggers, projectTriggerPrefabs(data))
  };
}

export function createProjectPrefabFromEntity(
  data: GBAProjectData,
  kind: ProjectPrefabKind,
  entityID: string,
  requestedName?: string
): { data: GBAProjectData; prefabID: string | null } {
  const instanceKey = kind === "actor" ? "actors" : "triggers";
  const prefabKey = kind === "actor" ? "actorPrefabs" : "triggerPrefabs";
  const instances = records(data[instanceKey]);
  const source = instances.find((instance) => instance.id === entityID);
  if (!source) return { data, prefabID: null };
  const sourceName = typeof source.name === "string" && source.name ? source.name : kind === "actor" ? "Ator" : "Trigger";
  const name = requestedName?.trim() || `${sourceName} Base`;
  const existingPrefabs = records(data[prefabKey]);
  const existingIDs = new Set(existingPrefabs.map((prefab) => String(prefab.id ?? "")));
  const prefabID = uniqueID(`${kind}-prefab-${slug(name)}`, existingIDs);
  const inherited = Object.fromEntries(Object.entries(source).filter(([key]) => !instanceFields.has(key)));
  const prefab = { ...inherited, id: prefabID, name };
  return {
    prefabID,
    data: {
      ...data,
      [prefabKey]: [...existingPrefabs, prefab],
      [instanceKey]: instances.map((instance) => instance.id === entityID ? { ...instance, prefabID } : instance)
    }
  };
}

export function updateProjectPrefab(
  data: GBAProjectData,
  kind: ProjectPrefabKind,
  prefabID: string,
  fields: Record<string, unknown>
): GBAProjectData {
  const prefabKey = kind === "actor" ? "actorPrefabs" : "triggerPrefabs";
  const protectedFields = new Set(["id"]);
  const safeFields = Object.fromEntries(Object.entries(fields).filter(([key]) => !protectedFields.has(key)));
  const prefabs = records(data[prefabKey]);
  if (!prefabs.some((prefab) => prefab.id === prefabID)) return data;
  return synchronizeProjectPrefabInstances({
    ...data,
    [prefabKey]: prefabs.map((prefab) => prefab.id === prefabID ? { ...prefab, ...safeFields } : prefab)
  });
}

export function instantiateProjectPrefab(
  data: GBAProjectData,
  kind: ProjectPrefabKind,
  prefabID: string,
  placement: ProjectPrefabPlacement
): { data: GBAProjectData; entityID: string | null } {
  const instanceKey = kind === "actor" ? "actors" : "triggers";
  const prefabs = kind === "actor" ? projectActorPrefabs(data) : projectTriggerPrefabs(data);
  const prefab = prefabs.find((candidate) => candidate.id === prefabID);
  if (!prefab) return { data, entityID: null };
  const instances = records(data[instanceKey]);
  const entityID = uniqueID(`${kind}-${slug(prefab.name)}`, new Set(instances.map((instance) => String(instance.id ?? ""))));
  const inherited = Object.fromEntries(Object.entries(prefab).filter(([key]) => !instanceFields.has(key)));
  const entity = {
    ...inherited,
    id: entityID,
    name: prefab.name,
    roomID: placement.roomID,
    x: Math.round(placement.x),
    y: Math.round(placement.y),
    prefabID
  };
  return { data: { ...data, [instanceKey]: [...instances, entity] }, entityID };
}
