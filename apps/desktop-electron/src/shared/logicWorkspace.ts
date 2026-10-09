import type { GBAProjectData } from "./projectFile.js";
import { listProjectVariables, type ProjectVariableKind } from "./variablesWorkspace.js";

export interface LogicValuePatch { name?: string; valueType?: "number" | "text"; maxLength?: number; initialValue?: string | number; value?: string | number; }
export interface LogicUsage { path: string; label: string; }
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);

// Conservative reference inventory: complete names/tokens, including HUD bindings and dialogue substitutions.
export function listLogicValueUsages(data: GBAProjectData, name: string): LogicUsage[] {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`(^|[^\\w.])${escaped}($|[^\\w.])`);
  const usages: LogicUsage[] = [];
  function visit(value: unknown, path: string, label: string): void {
    if (typeof value === "string" && pattern.test(value)) usages.push({path,label});
    else if (Array.isArray(value)) value.forEach((item,index) => visit(item,`${path}[${index}]`, record(item) && typeof item.name === "string" ? item.name : label));
    else if (record(value)) Object.entries(value).forEach(([key,item]) => visit(item,`${path}.${key}`,label));
  }
  Object.entries(data).forEach(([key,value]) => {
    if (key === "scenas" && Array.isArray(data.rooms) && data.rooms.length) return;
    if (!["variables","constants","variaveis","constantes","editorState"].includes(key)) visit(value,key,key);
  });
  return usages;
}

export function logicValueRecord(data: GBAProjectData, name: string, kind: ProjectVariableKind): Record<string, unknown> | null {
  for (const key of kind === "constant" ? ["constants","constantes"] : ["variables","variaveis"]) {
    const entries = data[key];
    if (Array.isArray(entries)) {
      const entry = entries.find(item => record(item) && (item.name ?? item.key ?? item.id) === name);
      if (record(entry)) return entry;
    }
  }
  return null;
}

export function updateLogicValueInProject(data: GBAProjectData, name: string, kind: ProjectVariableKind, patch: LogicValuePatch): GBAProjectData {
  if (patch.maxLength !== undefined && !Number.isFinite(patch.maxLength)) return data;
  const entry = logicValueRecord(data,name,kind);
  if (!entry) return data;
  const nextName = patch.name?.trim() ?? name;
  if (!nextName || (nextName !== name && (listProjectVariables(data).some(item => item.name === nextName) || listLogicValueUsages(data,name).length))) return data;
  if (kind === "constant" && (patch.valueType === "text" || (patch.name !== undefined && !/^[A-Za-z_][A-Za-z0-9_.]*$/.test(nextName)))) return data;
  const valueType = patch.valueType ?? (entry.valueType === "text" ? "text" : "number");
  const value = patch[kind === "constant" ? "value" : "initialValue"];
  if (value !== undefined && (valueType === "number" ? typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value) : typeof value !== "string")) return data;
  if (kind === "constant" && typeof value === "number" && (value < -2147483648 || value > 2147483647)) return data;
  const next = structuredClone(data);
  for (const key of kind === "constant" ? ["constants","constantes"] : ["variables","variaveis"]) {
    if (!Array.isArray(next[key])) continue;
    next[key] = (next[key] as unknown[]).map(item => {
      if (!record(item) || (item.name ?? item.key ?? item.id) !== name) return item;
      const updated = {...item,...patch,name:nextName};
      if (valueType === "text") {
        updated.valueType = "text";
        updated.maxLength = Math.min(16,Math.max(1,Math.round(patch.maxLength ?? (Number(item.maxLength) || 16))));
        if (typeof updated.initialValue === "string") updated.initialValue = updated.initialValue.slice(0,updated.maxLength);
        if (typeof updated.value === "string") updated.value = updated.value.slice(0,updated.maxLength);
      } else { if (patch.valueType) updated.valueType = "number"; delete updated.maxLength; }
      return updated;
    });
  }
  return next;
}
