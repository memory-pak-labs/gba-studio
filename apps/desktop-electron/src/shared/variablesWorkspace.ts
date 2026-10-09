import type { GBAProjectData } from "./projectFile.js";

export type ProjectVariableKind = "variable" | "constant";
export type ProjectVariableValueType = "number" | "text";

export interface ProjectVariableEntry {
  name: string;
  kind: ProjectVariableKind;
  valueType?: ProjectVariableValueType;
  maxLength?: number;
}

export interface CreateProjectVariableOptions {
  name: string;
  kind?: ProjectVariableKind;
  valueType?: ProjectVariableValueType;
  maxLength?: number;
}

export interface RenameProjectVariableOptions {
  currentName: string;
  nextName: string;
  kind?: ProjectVariableKind;
}

export interface RemoveProjectVariableOptions {
  name: string;
  kind?: ProjectVariableKind;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function entryName(item: Record<string, unknown>): string | null {
  const name = item.name ?? item.key ?? item.id;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

function storageKey(kind: ProjectVariableKind): "variables" | "constants" {
  return kind === "constant" ? "constants" : "variables";
}

function listKind(data: GBAProjectData, kind: ProjectVariableKind): Record<string, unknown>[] {
  const primary = projectArray(data, storageKey(kind));
  const legacy = projectArray(data, kind === "constant" ? "constantes" : "variaveis");
  const entries = [...primary, ...legacy];
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const name = entryName(entry);
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function variableEntry(item: Record<string, unknown>, kind: ProjectVariableKind): ProjectVariableEntry | null {
  const name = entryName(item);
  if (!name) return null;
  if (item.valueType !== "text") return { name, kind };
  const rawMaxLength = typeof item.maxLength === "number" ? item.maxLength : Number(item.maxLength);
  const maxLength = Number.isFinite(rawMaxLength)
    ? Math.min(16, Math.max(1, Math.round(rawMaxLength)))
    : 16;
  return { name, kind, valueType: "text", maxLength };
}

export function listProjectVariables(data: GBAProjectData): ProjectVariableEntry[] {
  return [
    ...listKind(data, "variable").map((item) => variableEntry(item, "variable")),
    ...listKind(data, "constant").map((item) => variableEntry(item, "constant"))
  ].filter((entry): entry is ProjectVariableEntry => Boolean(entry));
}

export function createProjectVariableInProject(
  data: GBAProjectData,
  options: CreateProjectVariableOptions
): GBAProjectData {
  const name = options.name.trim();
  const kind = options.kind ?? "variable";
  if (!name || (kind === "constant" && !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(name))) return data;
  if (listProjectVariables(data).some((entry) => entry.name === name)) {
    return data;
  }

  const next = cloneProjectData(data);
  const key = storageKey(kind);
  const current = Array.isArray(next[key]) ? [...(next[key] as unknown[])] : [];
  const valueType = kind !== "constant" && options.valueType === "text" ? "text" : "number";
  const maxLength = typeof options.maxLength === "number" && Number.isFinite(options.maxLength)
    ? Math.min(16, Math.max(1, Math.round(options.maxLength)))
    : 16;
  next[key] = [...current, {
    name,
    ...(kind === "constant" ? { value: 0 } : {}),
    ...(valueType === "text" ? { valueType, maxLength } : {})
  }];
  return next;
}

export function renameProjectVariableInProject(
  data: GBAProjectData,
  options: RenameProjectVariableOptions
): GBAProjectData {
  const currentName = options.currentName.trim();
  const nextName = options.nextName.trim();
  const kind = options.kind ?? "variable";
  if (!currentName || !nextName || currentName === nextName) return data;
  if (listProjectVariables(data).some((entry) => entry.name === nextName)) {
    return data;
  }

  const next = cloneProjectData(data);
  const key = storageKey(kind);
  const legacyKey = kind === "constant" ? "constantes" : "variaveis";
  for (const storage of [key, legacyKey] as const) {
    const items = projectArray(next, storage);
    if (items.length === 0) continue;
    next[storage] = items.map((item) => {
      if (entryName(item) !== currentName) return item;
      return { ...item, name: nextName };
    });
  }
  return next;
}

export function removeProjectVariableFromProject(
  data: GBAProjectData,
  options: RemoveProjectVariableOptions
): GBAProjectData {
  const name = options.name.trim();
  const kind = options.kind ?? "variable";
  if (!name) return data;

  const next = cloneProjectData(data);
  const key = storageKey(kind);
  const legacyKey = kind === "constant" ? "constantes" : "variaveis";
  for (const storage of [key, legacyKey] as const) {
    const items = projectArray(next, storage);
    if (items.length === 0) continue;
    next[storage] = items.filter((item) => entryName(item) !== name);
  }
  return next;
}
