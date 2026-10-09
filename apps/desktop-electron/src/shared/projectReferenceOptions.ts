import type { GBAProjectData } from "./projectFile.js";
import { sceneDisplayName } from "./sceneDisplayName.js";

export interface ProjectReferenceOption {
  value: string;
  label: string;
  detail?: string;
  keywords?: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueSortedOptions(options: ProjectReferenceOption[]): ProjectReferenceOption[] {
  const unique = new Map<string, ProjectReferenceOption>();
  for (const option of options) {
    if (option.value && !unique.has(option.value)) unique.set(option.value, option);
  }
  return Array.from(unique.values()).sort((lhs, rhs) => lhs.label.localeCompare(rhs.label, "pt-BR"));
}

export function projectRoomReferenceOptions(data: GBAProjectData): ProjectReferenceOption[] {
  const scenas = records(data.scenas);
  const rooms = scenas.length > 0 ? scenas : records(data.rooms);
  return uniqueSortedOptions(rooms.map((room, index) => {
    const name = stringValue(room.name) || `Cena ${index + 1}`;
    const sceneType = stringValue(room.sceneType);
    return {
      value: name,
      label: sceneDisplayName(name),
      detail: sceneType ? `Cena · ${sceneType}` : "Cena",
      keywords: [stringValue(room.id), sceneType].filter(Boolean)
    };
  }));
}

export function projectEventReferenceOptions(data: GBAProjectData): ProjectReferenceOption[] {
  return uniqueSortedOptions(records(data.events).map((event, index) => {
    const name = stringValue(event.name) || `Evento ${index + 1}`;
    return {
      value: name,
      label: name,
      detail: "Evento",
      keywords: [stringValue(event.id), stringValue(event.category), stringValue(event.command)].filter(Boolean)
    };
  }));
}

export function projectAudioReferenceOptions(data: GBAProjectData): ProjectReferenceOption[] {
  return uniqueSortedOptions(records(data.audioItems).map((audio, index) => {
    const name = stringValue(audio.name) || `Áudio ${index + 1}`;
    const kind = stringValue(audio.kind) || "Áudio";
    return {
      value: name,
      label: name,
      detail: kind,
      keywords: [stringValue(audio.id), stringValue(audio.format), kind].filter(Boolean)
    };
  }));
}

export function projectAssetReferenceOptions(
  data: GBAProjectData,
  acceptedKinds?: string[]
): ProjectReferenceOption[] {
  const normalizedKinds = acceptedKinds?.map((kind) => kind.toLocaleLowerCase("pt-BR"));
  return uniqueSortedOptions(records(data.assets)
    .filter((asset) => {
      if (!normalizedKinds?.length) return true;
      return normalizedKinds.includes(stringValue(asset.kind).toLocaleLowerCase("pt-BR"));
    })
    .map((asset, index) => {
      const name = stringValue(asset.name) || `Asset ${index + 1}`;
      const kind = stringValue(asset.kind) || "Asset";
      const metadata = isRecord(asset.metadata) ? asset.metadata : {};
      return {
        value: name,
        label: name,
        detail: kind,
        keywords: [stringValue(asset.id), stringValue(metadata.source), kind].filter(Boolean)
      };
    }));
}
