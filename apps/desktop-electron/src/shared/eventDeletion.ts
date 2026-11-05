import { nativeEventCommandReferencedEvents } from "./eventCommandRegistry.js";
import { normalizeEventProcedureDefinition } from "./eventProcedures.js";
import { removeEventFromProject } from "./eventsWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";
import { listProjectReferenceUsages } from "./projectReferenceUsages.js";

function eventsIn(data: GBAProjectData): Record<string, unknown>[] {
  return Array.isArray(data.events) ? data.events.filter((event): event is Record<string, unknown> =>
    Boolean(event) && typeof event === "object" && !Array.isArray(event)) : [];
}

function calledEvents(event: Record<string, unknown>): string[] {
  const commands = [event.command,
    ...(typeof event.commands === "string" ? event.commands.split(/\r?\n/) : []),
    ...(Array.isArray(event.steps) ? event.steps.map(step => step?.command) : [])
  ];
  return commands.flatMap(command => typeof command === "string" && /^\s*call_(?:procedure|event)\s/.test(command)
    ? nativeEventCommandReferencedEvents(command) : []);
}

export function planEventDeletion(data: GBAProjectData, id: string, name: string) {
  const events = eventsIn(data);
  const source = events.find(event => event.id === id);
  const unlink = source ? removeEventFromProject(data, id, { replacementName: null }) : data;
  const canUnlink = unlink !== data && !listProjectReferenceUsages(unlink, { kind: "event", name, id }).length;
  if (!source || !canUnlink) return { canUnlink: false, replacements: [] };

  const procedure = source.eventKind === "procedure";
  const parameters = (event: Record<string, unknown>) =>
    normalizeEventProcedureDefinition(event.procedure).parameters.map(parameter => parameter.type).join(" ");
  const byName = new Map(events.map(event => [event.name, event]));
  function callsSource(event: Record<string, unknown>, visited = new Set<Record<string, unknown>>()): boolean {
    if (visited.has(event)) return false;
    visited.add(event);
    return calledEvents(event).some(called => {
      if (called === name) return true;
      const next = byName.get(called);
      return next !== undefined && callsSource(next, visited);
    });
  }
  const replacements = events.flatMap(event => {
    if (event === source || typeof event.name !== "string" || event.name === name || /\s/.test(event.name)
      || (event.eventKind === "procedure") !== procedure) return [];
    if (callsSource(event) || (procedure && parameters(event) !== parameters(source))) return [];
    return [{ value: event.name, label: event.name }];
  });
  return { canUnlink, replacements };
}
