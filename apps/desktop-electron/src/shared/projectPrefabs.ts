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

const instanceFields = new Set(["id", "name", "roomID", "roomId", "roomName", "x", "y", "z", "prefabID", "prefabEventCopies", "authoring"]);

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

function inheritedFields(prefab: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(Object.fromEntries(Object.entries(prefab).filter(([key]) => !instanceFields.has(key))));
}

function fieldsAtPlacement(prefab: Record<string, unknown>, instance: Record<string, unknown>): Record<string, unknown> {
  const fields = inheritedFields(prefab);
  const authoring = prefab.authoring as { sourcePosition?: { x: number; y: number } } | undefined;
  const movement = fields.topdownMovement as { kind?: string; bounds?: { x: number; y: number } } | undefined;
  if (authoring?.sourcePosition && movement?.kind === "wander_box" && movement.bounds) {
    movement.bounds.x += Number(instance.x) - authoring.sourcePosition.x;
    movement.bounds.y += Number(instance.y) - authoring.sourcePosition.y;
  }
  return fields;
}

function mappedBindings(value: unknown, mapping: Record<string, string>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value && typeof value === "object" ? value : {})
    .map(([key, name]) => [key, typeof name === "string" ? mapping[name] ?? name : name]));
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
    const inherited = fieldsAtPlacement(prefab, instance);
    const mapping = instance.prefabEventCopies as Record<string, string> | undefined;
    if (mapping) {
      inherited.eventBindings = mappedBindings(inherited.eventBindings, mapping);
      for (const key of ["eventName", "scriptName"]) if (typeof inherited[key] === "string") inherited[key] = mapping[inherited[key] as string] ?? inherited[key];
    }
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
  const inherited = inheritedFields(source);
  const prefab = { ...inherited, id: prefabID, name, authoring: {
    sourceEntityID: entityID, sourceEntityName: sourceName, sourceScene: source.roomName ?? "",
    sourcePosition: { x: Number(source.x ?? 0), y: Number(source.y ?? 0) }
  } };
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
  const current = prefabs.find(prefab => prefab.id === prefabID)!;
  const bindings = { ...(current.eventBindings as Record<string, unknown> ?? {}), ...(safeFields.eventBindings as Record<string, unknown> ?? {}) };
  for (const [legacy, native] of [["onEnterEventName", "onEnter"], ["onLeaveEventName", "onLeave"]]) {
    if (Object.hasOwn(safeFields, legacy)) bindings[native] = safeFields[legacy];
  }
  if (Object.keys(bindings).length) safeFields.eventBindings = bindings;
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
  const inherited = fieldsAtPlacement(prefab, { x: Math.round(placement.x), y: Math.round(placement.y) });
  const room = records(data.rooms).find(room => room.id === placement.roomID || room.name === placement.roomID);
  const entity = {
    ...inherited,
    id: entityID,
    name: prefab.name,
    roomID: placement.roomID,
    ...(room ? { roomName: room.name } : {}),
    x: Math.round(placement.x),
    y: Math.round(placement.y),
    prefabID
  };
  const next = { ...data, [instanceKey]: [...instances, entity] };
  if (kind === "actor") copyActorScripts(next, entity, prefab, String(room?.name ?? ""));
  return { data: next, entityID };
}

/** A copied collectible must address its own actor, never hide the prototype. */
function copyActorScripts(data: GBAProjectData, entity: Record<string, unknown>, prefab: ProjectPrefabRecord, roomName: string): void {
  const source = prefab.authoring as Record<string, unknown> | undefined;
  const actorIDs = new Set([source?.sourceEntityID, source?.sourceEntityName].filter(value => typeof value === "string" && value));
  if (!actorIDs.size) return;
  const events = records(data.events);
  const byName = new Map(events.map(event => [event.name, event]));
  const selected = new Map<string, Record<string, unknown>>();
  function commands(event: Record<string, unknown>): string[] {
    return [event.command, ...records(event.steps).map(step => step.command)].filter((value): value is string => typeof value === "string");
  }
  function visit(name: string): void {
    const event = byName.get(name);
    if (!event || selected.has(name)) return;
    selected.set(name, event);
    for (const command of commands(event)) {
      const [verb, target] = command.trim().split(/\s+/);
      if (verb === "call_event" && target) visit(target);
    }
  }
  for (const name of Object.values(entity.eventBindings as Record<string, unknown> ?? {})) if (typeof name === "string") visit(name);
  const addressesSource = (command: string) => {
    const [verb, actor] = command.trim().split(/\s+/);
    return verb.includes("actor") && actorIDs.has(actor);
  };
  if (![...selected.values()].some(event => commands(event).some(addressesSource))) return;
  const reserved = new Set(events.flatMap(event => [String(event.id), String(event.name)]));
  const mapping: Record<string, string> = {};
  for (const name of selected.keys()) {
    const id = uniqueID(`prefab-${entity.id}-${slug(name)}`, reserved);
    reserved.add(id); mapping[name] = id;
  }
  const rewrite = (command: string) => {
    const [verb, target, ...args] = command.trim().split(/\s+/);
    if (verb === "call_event" && mapping[target]) return [verb, mapping[target], ...args].join(" ");
    return addressesSource(command) ? [verb, entity.id, ...args].join(" ") : command;
  };
  data.events = [...events, ...[...selected].map(([name, event]) => ({
    ...structuredClone(event), id: mapping[name], name: mapping[name], roomName,
    ...(typeof event.command === "string" ? { command: rewrite(event.command) } : {}),
    steps: records(event.steps).map((step, index) => ({ ...structuredClone(step), id: `${mapping[name]}-${index}`, command: rewrite(String(step.command ?? "noop")) }))
  }))];
  entity.prefabEventCopies = mapping;
  entity.eventBindings = mappedBindings(entity.eventBindings, mapping);
  for (const key of ["eventName", "scriptName"]) if (typeof entity[key] === "string") entity[key] = mapping[entity[key] as string] ?? entity[key];
}
