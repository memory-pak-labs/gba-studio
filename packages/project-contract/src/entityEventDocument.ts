export type GBAEntityDocumentKind = "actor" | "trigger";

export interface GBAEntityDocument {
  schema: "gba-entity/v1";
  kind: GBAEntityDocumentKind;
  id: string;
  name: string;
  sceneName: string;
  position: {
    x: number;
    y: number;
  };
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  eventName: string | null;
  eventBindings: Record<string, string>;
  spriteSheet: string | null;
  animationName: string | null;
  animationStateID: string | null;
}

export interface GBAEventStepDocument {
  id: string;
  command: string;
  isEnabled: boolean;
}

export interface GBAEventDocument {
  schema: "gba-event/v1";
  id: string;
  name: string;
  sceneName: string | null;
  category: string;
  detail: string | null;
  primaryCommand: string;
  steps: GBAEventStepDocument[];
  eventKind: "event" | "procedure";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function coordinateValue(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : fallback;
}

function positiveInteger(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : fallback;
}

function eventBindings(value: unknown): Record<string, string> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(
    Object.entries(value).flatMap(([key, rawValue]) => {
      const normalized = stringValue(rawValue);
      return normalized ? [[key, normalized]] : [];
    })
  );
}

function nestedCoordinate(record: Record<string, unknown>, key: "x" | "y"): unknown {
  const position = isRecord(record.position) ? record.position : {};
  return record[key] ?? position[key];
}

function sceneName(record: Record<string, unknown>): string {
  return stringValue(record.sceneName)
    ?? stringValue(record.roomName)
    ?? stringValue(record.scenaName)
    ?? stringValue(record.room)
    ?? stringValue(record.scene)
    ?? "";
}

export function normalizeGBAEntityDocument(
  entity: unknown,
  kind: GBAEntityDocumentKind,
  fallbackIndex = 0,
  fallbackSceneName = ""
): GBAEntityDocument {
  const record = isRecord(entity) ? entity : {};
  const x = coordinateValue(nestedCoordinate(record, "x"));
  const y = coordinateValue(nestedCoordinate(record, "y"));
  const size = isRecord(record.size) ? record.size : {};
  const width = positiveInteger(record.width ?? size.width, 1);
  const height = positiveInteger(record.height ?? size.height, 1);
  const defaultLabel = kind === "actor" ? "Actor" : "Trigger";

  return {
    schema: "gba-entity/v1",
    kind,
    id: stringValue(record.id) ?? `${kind}-${fallbackIndex + 1}`,
    name: stringValue(record.name) ?? `${defaultLabel} ${fallbackIndex + 1}`,
    sceneName: sceneName(record) || fallbackSceneName,
    position: { x, y },
    bounds: { x, y, width, height },
    eventName: stringValue(record.eventName),
    eventBindings: eventBindings(record.eventBindings),
    spriteSheet: kind === "actor" ? stringValue(record.spriteSheet) : null,
    animationName: kind === "actor" ? stringValue(record.animationName) : null,
    animationStateID: kind === "actor" ? stringValue(record.animationStateID) : null
  };
}

function normalizeEventSteps(record: Record<string, unknown>, eventID: string): GBAEventStepDocument[] {
  const rawSteps = Array.isArray(record.steps) ? record.steps.filter(isRecord) : [];
  if (rawSteps.length === 0) {
    return [{
      id: `${eventID}-step-1`,
      command: stringValue(record.command) ?? "noop",
      isEnabled: true
    }];
  }

  return rawSteps.map((step, index) => ({
    id: stringValue(step.id) ?? `${eventID}-step-${index + 1}`,
    command: stringValue(step.command) ?? "noop",
    isEnabled: typeof step.isEnabled === "boolean" ? step.isEnabled : true
  }));
}

export function normalizeGBAEventDocument(event: unknown, fallbackIndex = 0): GBAEventDocument {
  const record = isRecord(event) ? event : {};
  const id = stringValue(record.id) ?? `event-${fallbackIndex + 1}`;
  const steps = normalizeEventSteps(record, id);
  const primaryStep = steps.find((step) => step.isEnabled) ?? steps[0]!;

  return {
    schema: "gba-event/v1",
    id,
    name: stringValue(record.name) ?? "Evento sem nome",
    sceneName: sceneName(record) || null,
    category: stringValue(record.category) ?? "Custom",
    detail: stringValue(record.detail),
    primaryCommand: primaryStep.command,
    steps,
    eventKind: record.eventKind === "procedure" ? "procedure" : "event"
  };
}
