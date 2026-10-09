import {
  normalizeGBAEntityDocument,
  normalizeGBAEventDocument
} from "./entityEventDocument.js";

export type GBAEntityEventProjectionSource = "actors" | "triggers" | "events";

export interface GBAEntityEventProjectionIssue {
  source: GBAEntityEventProjectionSource;
  itemIndex: number;
  itemName: string;
  invalidFields: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function finiteNumber(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

function positiveNumber(value: unknown): boolean {
  return finiteNumber(value) && Number(value) > 0;
}

function pushUnique(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function addIssue(
  issueMap: Map<string, GBAEntityEventProjectionIssue>,
  source: GBAEntityEventProjectionSource,
  itemIndex: number,
  itemName: string,
  fields: string[]
): void {
  if (fields.length === 0) return;
  const key = `${source}:${itemIndex}`;
  const current = issueMap.get(key) ?? { source, itemIndex, itemName, invalidFields: [] };
  for (const field of fields) pushUnique(current.invalidFields, field);
  issueMap.set(key, current);
}

function sceneNames(data: Record<string, unknown>): Set<string> {
  return new Set(records(data.scenas).flatMap((room) => {
    const name = stringValue(room.name);
    return name ? [name] : [];
  }));
}

function sceneProjectionFields(
  record: Record<string, unknown>,
  knownSceneNames: Set<string>,
  normalizedSceneName: string,
  requireReference = true
): string[] {
  const fields: string[] = [];
  const aliases = ["sceneName", "roomName", "scenaName", "room", "scene"] as const;
  let hasValidAlias = false;

  for (const alias of aliases) {
    if (record[alias] === undefined) continue;
    const value = stringValue(record[alias]);
    if (!value) {
      pushUnique(fields, "sceneName");
      continue;
    }
    hasValidAlias = true;
    if (knownSceneNames.size > 0 && !knownSceneNames.has(value)) {
      pushUnique(fields, "sceneName");
    }
  }

  if (normalizedSceneName && knownSceneNames.size > 0 && !knownSceneNames.has(normalizedSceneName)) {
    pushUnique(fields, "sceneName");
  }
  if (requireReference && !hasValidAlias && knownSceneNames.size > 1) {
    pushUnique(fields, "sceneName");
  }
  return fields;
}

function coordinateProjectionFields(record: Record<string, unknown>): string[] {
  const fields: string[] = [];
  const position = isRecord(record.position) ? record.position : null;
  for (const axis of ["x", "y"] as const) {
    const directValue = record[axis];
    const nestedValue = position?.[axis];
    const value = directValue !== undefined ? directValue : nestedValue;
    if (value === undefined) continue;
    if (!finiteNumber(value) || Number(value) < 0) pushUnique(fields, `position.${axis}`);
  }
  return fields;
}

function entityProjectionFields(
  record: Record<string, unknown>,
  source: "actors" | "triggers",
  knownSceneNames: Set<string>
): string[] {
  const normalized = normalizeGBAEntityDocument(record, source === "actors" ? "actor" : "trigger");
  const fields = sceneProjectionFields(record, knownSceneNames, normalized.sceneName);
  fields.push(...coordinateProjectionFields(record));

  const size = isRecord(record.size) ? record.size : null;
  for (const dimension of ["width", "height"] as const) {
    const value = record[dimension] !== undefined ? record[dimension] : size?.[dimension];
    if (value !== undefined && !positiveNumber(value)) pushUnique(fields, dimension);
  }

  if (record.eventName !== undefined && !stringValue(record.eventName)) {
    pushUnique(fields, "eventName");
  }
  if (record.eventBindings !== undefined && !isRecord(record.eventBindings)) {
    pushUnique(fields, "eventBindings");
  } else if (isRecord(record.eventBindings)) {
    for (const [key, value] of Object.entries(record.eventBindings)) {
      if (!stringValue(value)) pushUnique(fields, `eventBindings.${key}`);
    }
  }

  if (source === "actors") {
    for (const field of ["spriteSheet", "animationName", "animationStateID"] as const) {
      if (record[field] !== undefined && !stringValue(record[field])) pushUnique(fields, field);
    }
  }

  return fields;
}

function eventProjectionFields(record: Record<string, unknown>, knownSceneNames: Set<string>): string[] {
  const normalized = normalizeGBAEventDocument(record);
  // Events may be global and receive their scene context from a room, actor,
  // trigger, or procedure binding. Only explicit invalid aliases are unsafe.
  const fields = sceneProjectionFields(record, knownSceneNames, normalized.sceneName ?? "", false);

  if (record.id !== undefined && !stringValue(record.id)) pushUnique(fields, "id");
  if (record.name !== undefined && !stringValue(record.name)) pushUnique(fields, "name");
  if (record.category !== undefined && !stringValue(record.category)) pushUnique(fields, "category");
  if (record.detail !== undefined && typeof record.detail !== "string" && record.detail !== null) {
    pushUnique(fields, "detail");
  }
  if (record.eventKind !== undefined && record.eventKind !== "event" && record.eventKind !== "procedure") {
    pushUnique(fields, "eventKind");
  }

  if (record.steps !== undefined && !Array.isArray(record.steps)) {
    pushUnique(fields, "steps");
  } else if (Array.isArray(record.steps)) {
    for (const [stepIndex, step] of record.steps.entries()) {
      if (!isRecord(step)) {
        pushUnique(fields, `steps[${stepIndex}]`);
        continue;
      }
      if (step.command !== undefined && !stringValue(step.command)) {
        pushUnique(fields, `steps[${stepIndex}].command`);
      }
      if (step.isEnabled !== undefined && typeof step.isEnabled !== "boolean") {
        pushUnique(fields, `steps[${stepIndex}].isEnabled`);
      }
      if (step.id !== undefined && !stringValue(step.id)) {
        pushUnique(fields, `steps[${stepIndex}].id`);
      }
    }
  } else if (record.command !== undefined && !stringValue(record.command)) {
    pushUnique(fields, "command");
  }

  return fields;
}

function entityItemName(record: Record<string, unknown>, source: "actors" | "triggers", index: number): string {
  return stringValue(record.name) ?? `${source === "actors" ? "Actor" : "Trigger"} ${index + 1}`;
}

function eventItemName(record: Record<string, unknown>, index: number): string {
  return stringValue(record.name) ?? `Evento ${index + 1}`;
}

function addDuplicateFieldIssues(
  issueMap: Map<string, GBAEntityEventProjectionIssue>,
  source: GBAEntityEventProjectionSource,
  items: Record<string, unknown>[],
  field: "id" | "name",
  itemName: (record: Record<string, unknown>, index: number) => string
): void {
  const indexesByValue = new Map<string, number[]>();
  for (const [index, item] of items.entries()) {
    const value = stringValue(item[field]);
    if (!value) continue;
    const indexes = indexesByValue.get(value) ?? [];
    indexes.push(index);
    indexesByValue.set(value, indexes);
  }

  for (const indexes of indexesByValue.values()) {
    if (indexes.length < 2) continue;
    for (const index of indexes) {
      addIssue(issueMap, source, index, itemName(items[index]!, index), [field]);
    }
  }
}

export function validateGBAEntityEventProjection(data: Record<string, unknown>): GBAEntityEventProjectionIssue[] {
  const knownSceneNames = sceneNames(data);
  const issueMap = new Map<string, GBAEntityEventProjectionIssue>();
  const actors = records(data.actors);
  const triggers = records(data.triggers);
  const events = records(data.events);

  for (const [index, actor] of actors.entries()) {
    addIssue(issueMap, "actors", index, entityItemName(actor, "actors", index), entityProjectionFields(actor, "actors", knownSceneNames));
  }
  for (const [index, trigger] of triggers.entries()) {
    addIssue(issueMap, "triggers", index, entityItemName(trigger, "triggers", index), entityProjectionFields(trigger, "triggers", knownSceneNames));
  }
  for (const [index, event] of events.entries()) {
    addIssue(issueMap, "events", index, eventItemName(event, index), eventProjectionFields(event, knownSceneNames));
  }

  addDuplicateFieldIssues(issueMap, "actors", actors, "id", (item, index) => entityItemName(item, "actors", index));
  addDuplicateFieldIssues(issueMap, "triggers", triggers, "id", (item, index) => entityItemName(item, "triggers", index));
  addDuplicateFieldIssues(issueMap, "events", events, "id", eventItemName);
  addDuplicateFieldIssues(issueMap, "events", events, "name", eventItemName);

  return Array.from(issueMap.values()).sort((left, right) => (
    left.source.localeCompare(right.source)
    || left.itemIndex - right.itemIndex
  ));
}

export function formatGBAEntityEventProjectionIssue(issue: GBAEntityEventProjectionIssue): string {
  const subject = issue.source === "actors" ? "Ator" : issue.source === "triggers" ? "Trigger" : "Evento";
  return `${subject} "${issue.itemName}" possui campos que nao podem ser projetados com seguranca: ${issue.invalidFields.join(", ")}.`;
}
