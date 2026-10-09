export type EventProcedureParameterType = "number" | "boolean" | "variable";
export type EventProcedureLocalType = "number" | "boolean";

export interface EventProcedureParameter {
  name: string;
  type: EventProcedureParameterType;
  defaultValue?: string;
}

export interface EventProcedureLocal {
  name: string;
  type: EventProcedureLocalType;
  initialValue: string;
}

export interface EventProcedureDefinition {
  parameters: EventProcedureParameter[];
  locals: EventProcedureLocal[];
}

export interface EventProcedureExpansionResult {
  events: Record<string, unknown>[];
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function identifier(value: unknown): string {
  return stringValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parameterType(value: unknown): EventProcedureParameterType {
  return value === "boolean" || value === "variable" ? value : "number";
}

function localType(value: unknown): EventProcedureLocalType {
  return value === "boolean" ? "boolean" : "number";
}

function booleanValue(value: unknown, fallback = "false"): string {
  const normalized = stringValue(value).toLowerCase();
  return normalized === "true" || normalized === "false" ? normalized : fallback;
}

function numberValue(value: unknown, fallback = "0"): string {
  const normalized = stringValue(value);
  return normalized && Number.isFinite(Number(normalized)) ? normalized : fallback;
}

export function normalizeEventProcedureDefinition(value: unknown): EventProcedureDefinition {
  const record = isRecord(value) ? value : {};
  const seen = new Set<string>();
  const parameters = (Array.isArray(record.parameters) ? record.parameters : [])
    .filter(isRecord)
    .flatMap((item): EventProcedureParameter[] => {
      const name = identifier(item.name);
      if (!name || seen.has(name)) return [];
      seen.add(name);
      const type = parameterType(item.type);
      const rawDefault = stringValue(item.defaultValue);
      const defaultValue = type === "boolean"
        ? booleanValue(rawDefault)
        : type === "number"
          ? numberValue(rawDefault)
          : identifier(rawDefault);
      return [{ name, type, ...(defaultValue ? { defaultValue } : {}) }];
    });
  const locals = (Array.isArray(record.locals) ? record.locals : [])
    .filter(isRecord)
    .flatMap((item): EventProcedureLocal[] => {
      const name = identifier(item.name);
      if (!name || seen.has(name)) return [];
      seen.add(name);
      const type = localType(item.type);
      return [{
        name,
        type,
        initialValue: type === "boolean" ? booleanValue(item.initialValue) : numberValue(item.initialValue)
      }];
    });
  return { parameters, locals };
}

function eventName(event: Record<string, unknown>, index: number): string {
  return stringValue(event.name) || stringValue(event.id) || `event_${index + 1}`;
}

function eventSteps(event: Record<string, unknown>): Record<string, unknown>[] {
  if (Array.isArray(event.steps)) return event.steps.filter(isRecord);
  const command = stringValue(event.command);
  return command ? [{ command }] : [];
}

function isProcedure(event: Record<string, unknown>): boolean {
  return event.eventKind === "procedure";
}

function localVariableKey(procedureName: string, localName: string): string {
  return `__proc_${identifier(procedureName).toLowerCase()}_${identifier(localName).toLowerCase()}`;
}

function splitCommand(command: string): string[] {
  return command.trim().split(/\s+/).filter(Boolean);
}

function substituteCommand(command: string, values: Map<string, string>): string {
  return splitCommand(command).map((token) => (
    token.startsWith("$") ? values.get(token.slice(1)) ?? token : token
  )).join(" ") || "noop";
}

function validatedArgument(
  procedureName: string,
  parameter: EventProcedureParameter,
  supplied: string | undefined,
  issues: string[]
): string {
  const value = supplied || parameter.defaultValue || (parameter.type === "boolean" ? "false" : parameter.type === "number" ? "0" : "");
  if (parameter.type === "number") {
    if (!value || !Number.isFinite(Number(value))) {
      issues.push(`Procedure ${procedureName}: parametro ${parameter.name} espera number, recebeu ${value || "vazio"}.`);
      return parameter.defaultValue || "0";
    }
    return value;
  }
  if (parameter.type === "boolean") {
    if (value !== "true" && value !== "false") {
      issues.push(`Procedure ${procedureName}: parametro ${parameter.name} espera boolean, recebeu ${value || "vazio"}.`);
      return parameter.defaultValue || "false";
    }
    return value;
  }
  const variable = identifier(value);
  if (!variable) {
    issues.push(`Procedure ${procedureName}: parametro ${parameter.name} espera variable.`);
  }
  return variable;
}

export function expandEventProcedures(events: Record<string, unknown>[]): EventProcedureExpansionResult {
  const issues: string[] = [];
  const procedures = new Map<string, { event: Record<string, unknown>; definition: EventProcedureDefinition; name: string }>();
  events.forEach((event, index) => {
    if (!isProcedure(event)) return;
    const name = eventName(event, index);
    procedures.set(name, { event, definition: normalizeEventProcedureDefinition(event.procedure), name });
  });

  const expandSteps = (
    steps: Record<string, unknown>[],
    inheritedValues: Map<string, string>,
    callStack: string[]
  ): Record<string, unknown>[] => steps.flatMap((step): Record<string, unknown>[] => {
    if (step.isEnabled === false) return callStack.length === 0 ? [{ ...step }] : [];
    const command = substituteCommand(stringValue(step.command) || "noop", inheritedValues);
    const parts = splitCommand(command);
    if (parts[0] !== "call_procedure") return [{ ...step, command }];

    const targetName = parts[1] ?? "";
    const target = procedures.get(targetName);
    if (!target) {
      issues.push(`Procedure inexistente: ${targetName || "(vazia)"}.`);
      return [];
    }
    if (callStack.includes(targetName)) {
      issues.push(`Chamada recursiva de procedure bloqueada: ${targetName}.`);
      return [];
    }

    const values = new Map<string, string>();
    target.definition.parameters.forEach((parameter, parameterIndex) => {
      values.set(parameter.name, validatedArgument(targetName, parameter, parts[parameterIndex + 2], issues));
    });
    const localInitializers = target.definition.locals.map((local) => {
      const key = localVariableKey(targetName, local.name);
      values.set(local.name, key);
      return { command: `set_variable ${key} ${local.initialValue}`, isEnabled: true };
    });
    return [
      ...localInitializers,
      ...expandSteps(eventSteps(target.event), values, [...callStack, targetName])
    ];
  });

  return {
    events: events.map((event) => ({
      ...event,
      steps: isProcedure(event) ? [] : expandSteps(eventSteps(event), new Map(), [])
    })),
    issues
  };
}

export function procedureVariableKeys(events: Record<string, unknown>[]): string[] {
  const keys = new Set<string>();
  for (const event of events) {
    for (const step of eventSteps(event)) {
      const parts = splitCommand(stringValue(step.command));
      for (const token of parts) {
        if (token.startsWith("__proc_")) keys.add(token);
      }
    }
  }
  return [...keys].sort();
}
