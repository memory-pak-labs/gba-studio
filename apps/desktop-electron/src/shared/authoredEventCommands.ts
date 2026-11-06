import type { GBAProjectData } from "./projectFile.js";

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> =>
    item !== null && typeof item === "object" && !Array.isArray(item)) : [];
}

export function authoredEventCommandRecords(data: GBAProjectData): Record<string, unknown>[] {
  const events = records(data.events).flatMap(event => [event, ...records(event.steps)]);
  const tools = data.advancedTools as Record<string, unknown> | undefined;
  const frames = [tools?.cinematicTimelines, tools?.effectSequences].flatMap(resources =>
    records(resources).flatMap(resource => records(resource.tracks).flatMap(track => records(track.keyframes))));
  return [...events, ...frames];
}

export function mapAuthoredEventCommands(data: GBAProjectData, map: (command: string) => string): void {
  for (const record of authoredEventCommandRecords(data)) {
    if (typeof record.command === "string") record.command = map(record.command);
    if (typeof record.commands === "string") record.commands = record.commands.split(/(\r?\n)/).map(map).join("");
  }
}
