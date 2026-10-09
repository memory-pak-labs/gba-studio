import { deriveDialoguesWorkspacePresentation } from "./dialoguesWorkspace.js";
import { deriveFilesWorkspacePresentation } from "./filesWorkspace.js";
import type { FilesWorkspaceName, FilesWorkspaceUsageLink } from "./filesWorkspace.js";
import type { GBAProjectData } from "./projectFile.js";

export type ProjectReferenceKind = "asset" | "audio" | "room" | "event" | "spriteAnimation" | "dialogue";

export interface ProjectReferenceTarget {
  kind: ProjectReferenceKind;
  name: string;
  id?: string;
}

export interface ProjectReferenceUsage extends FilesWorkspaceUsageLink {
  workspace: FilesWorkspaceName;
}

export interface ProjectReferenceDeletionGuard {
  canDelete: boolean;
  message: string | null;
  usages: ProjectReferenceUsage[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function commandsForEvent(event: Record<string, unknown>): Array<{ command: string; stepIndex: number | null }> {
  const commands: Array<{ command: string; stepIndex: number | null }> = [];
  const command = optionalString(event.command);
  if (command) commands.push({ command, stepIndex: null });
  if (Array.isArray(event.steps)) {
    event.steps.filter(isRecord).forEach((step, stepIndex) => {
      const stepCommand = optionalString(step.command);
      if (stepCommand) commands.push({ command: stepCommand, stepIndex });
    });
  }
  return commands;
}

function commandParts(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}

function eventReferenceIndex(parts: string[]): number | null {
  const verb = parts[0] ?? "noop";
  if (["call_event", "lock_script", "unlock_script", "timer_restart", "timer_remove"].includes(verb)) return 1;
  if (verb === "choice_event") return 3;
  if (["attach_button", "timer_attach"].includes(verb)) return 2;
  return null;
}

function addUsage(usages: Map<string, ProjectReferenceUsage>, usage: ProjectReferenceUsage): void {
  const key = [usage.workspace, usage.targetID ?? "", usage.targetName ?? "", usage.usageKind, usage.label].join(":");
  usages.set(key, usage);
}

function sortedUsages(usages: Map<string, ProjectReferenceUsage>): ProjectReferenceUsage[] {
  return [...usages.values()].sort((left, right) => left.label.localeCompare(right.label, "pt-BR"));
}

function listAssetUsages(data: GBAProjectData, target: ProjectReferenceTarget): ProjectReferenceUsage[] {
  const asset = deriveFilesWorkspacePresentation(data).assets.find((item) => {
    return (target.id && item.id === target.id) || item.name === target.name;
  });
  return asset?.usageLinks ?? [];
}

function listAudioUsages(data: GBAProjectData, target: ProjectReferenceTarget): ProjectReferenceUsage[] {
  const usages = new Map<string, ProjectReferenceUsage>();
  for (const room of projectArray(data, "rooms")) {
    if (optionalString(room.music) !== target.name) continue;
    const roomName = stringValue(room.name, "Room sem nome");
    addUsage(usages, {
      label: `Room: ${roomName}`,
      workspace: "Editor",
      targetID: optionalString(room.id) ?? undefined,
      targetName: roomName,
      usageKind: "room-music"
    });
  }
  for (const event of projectArray(data, "events")) {
    const eventName = stringValue(event.name, "Evento sem nome");
    if (!commandsForEvent(event).some(({ command }) => {
      const parts = commandParts(command);
      return ["play_music", "play_sfx"].includes(parts[0] ?? "") && parts[1] === target.name;
    })) continue;
    addUsage(usages, {
      label: `Evento: ${eventName}`,
      workspace: "Eventos",
      targetID: optionalString(event.id) ?? undefined,
      targetName: eventName,
      usageKind: "event-audio-command"
    });
  }
  return sortedUsages(usages);
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const rooms = projectArray(data, "rooms");
  return rooms.length > 0 ? rooms : projectArray(data, "scenas");
}

function editorConnections(data: GBAProjectData): Record<string, unknown>[] {
  const editorState = isRecord(data.editorState) ? data.editorState : null;
  return editorState && Array.isArray(editorState.scenaConnections)
    ? editorState.scenaConnections.filter(isRecord)
    : [];
}

function listRoomUsages(data: GBAProjectData, target: ProjectReferenceTarget): ProjectReferenceUsage[] {
  const usages = new Map<string, ProjectReferenceUsage>();
  const editorState = isRecord(data.editorState) ? data.editorState : null;
  if (editorState && (editorState.activeRoomID === target.id || editorState.activeRoomName === target.name)) {
    addUsage(usages, { label: "Cena ativa do editor", workspace: "Editor", targetName: target.name, usageKind: "editor-active-room" });
  }
  const settings = isRecord(data.settings) ? data.settings : null;
  const general = settings && isRecord(settings.general) ? settings.general : null;
  if (general?.startScene === target.name) {
    addUsage(usages, { label: "Cena inicial do projeto", workspace: "Ajustes", targetName: "general", usageKind: "settings-start-scene" });
  }
  for (const connection of editorConnections(data)) {
    if (connection.from !== target.name && connection.to !== target.name) continue;
    const from = stringValue(connection.from, "?");
    const to = stringValue(connection.to, "?");
    addUsage(usages, {
      label: `Conexao: ${from} -> ${to}`,
      workspace: "Editor",
      targetName: connection.from === target.name ? from : to,
      usageKind: "room-connection"
    });
  }
  for (const audio of projectArray(data, "audioItems")) {
    if (audio.assignedScene !== target.name) continue;
    const audioName = stringValue(audio.name, "Audio sem nome");
    addUsage(usages, {
      label: `Audio atribuido: ${audioName}`,
      workspace: "Audio",
      targetID: optionalString(audio.id) ?? undefined,
      targetName: audioName,
      usageKind: "audio-assigned-scene"
    });
  }
  for (const event of projectArray(data, "events")) {
    const eventName = stringValue(event.name, "Evento sem nome");
    if (!commandsForEvent(event).some(({ command }) => {
      const parts = commandParts(command);
      return parts[0] === "change_scene" && parts[1] === target.name;
    })) continue;
    addUsage(usages, {
      label: `Evento ${eventName}: change_scene`,
      workspace: "Eventos",
      targetID: optionalString(event.id) ?? undefined,
      targetName: eventName,
      usageKind: "event-change-scene"
    });
  }
  return sortedUsages(usages);
}

function entityLabel(kind: "room" | "actor" | "trigger", entity: Record<string, unknown>): string {
  const name = stringValue(entity.name, kind === "room" ? "Cena sem nome" : kind === "actor" ? "Ator sem nome" : "Trigger sem nome");
  return `${kind === "room" ? "Cena" : kind === "actor" ? "Ator" : "Trigger"}: ${name}`;
}

function entityWorkspace(kind: "room" | "actor" | "trigger"): FilesWorkspaceName {
  return kind === "room" || kind === "actor" || kind === "trigger" ? "Editor" : "Editor";
}

function recordHasEventReference(record: Record<string, unknown>, eventName: string): boolean {
  if (["eventName", "onLeaveEventName", "onEnterEventName"].some((key) => record[key] === eventName)) return true;
  const bindings = isRecord(record.eventBindings) ? record.eventBindings : null;
  return Boolean(bindings && Object.values(bindings).includes(eventName));
}

function valueHasFrameEvent(value: unknown, eventName: string): boolean {
  if (Array.isArray(value)) return value.some((item) => valueHasFrameEvent(item, eventName));
  if (!isRecord(value)) return false;
  if (value.type === "event" && value.value === eventName) return true;
  return Object.values(value).some((item) => valueHasFrameEvent(item, eventName));
}

function listEventUsages(data: GBAProjectData, target: ProjectReferenceTarget): ProjectReferenceUsage[] {
  const usages = new Map<string, ProjectReferenceUsage>();
  const entityGroups = [
    ["room", projectRooms(data)],
    ["actor", projectArray(data, "actors")],
    ["trigger", projectArray(data, "triggers")]
  ] as const;
  for (const [kind, entities] of entityGroups) {
    for (const entity of entities) {
      if (!recordHasEventReference(entity, target.name)) continue;
      const name = stringValue(entity.name, entityLabel(kind, entity));
      addUsage(usages, {
        label: entityLabel(kind, entity),
        workspace: entityWorkspace(kind),
        targetID: optionalString(entity.id) ?? undefined,
        targetName: name,
        usageKind: `${kind}-event`
      });
    }
  }
  for (const connection of editorConnections(data)) {
    if (!["eventName", "onExitEventName", "onEnterEventName"].some((key) => connection[key] === target.name)) continue;
    addUsage(usages, {
      label: `Conexao: ${stringValue(connection.from, "?")} -> ${stringValue(connection.to, "?")}`,
      workspace: "Editor",
      targetName: stringValue(connection.from, "?"),
      usageKind: "connection-event"
    });
  }
  for (const event of projectArray(data, "events")) {
    const eventName = stringValue(event.name, "Evento sem nome");
    if (!commandsForEvent(event).some(({ command }) => {
      const parts = commandParts(command);
      const index = eventReferenceIndex(parts);
      return index !== null && parts[index] === target.name;
    })) continue;
    addUsage(usages, {
      label: `Evento: ${eventName}`,
      workspace: "Eventos",
      targetID: optionalString(event.id) ?? undefined,
      targetName: eventName,
      usageKind: "event-command"
    });
  }
  for (const animation of projectArray(data, "animations")) {
    if (!valueHasFrameEvent(animation.frameEvents, target.name)) continue;
    const animationName = stringValue(animation.name, "Animacao sem nome");
    const frameEvents = Array.isArray(animation.frameEvents) ? animation.frameEvents : [];
    frameEvents.forEach((events, frameIndex) => {
      if (!valueHasFrameEvent(events, target.name)) return;
      addUsage(usages, {
        label: `Animacao ${animationName}: frame ${frameIndex + 1}`,
        workspace: "Sprites",
        targetID: optionalString(animation.id) ?? undefined,
        targetName: animationName,
        usageKind: "sprite-frame-event"
      });
    });
  }
  return sortedUsages(usages);
}

function listSpriteAnimationUsages(data: GBAProjectData, target: ProjectReferenceTarget): ProjectReferenceUsage[] {
  const usages = new Map<string, ProjectReferenceUsage>();
  for (const state of projectArray(data, "animationStates")) {
    const ids = Array.isArray(state.animationIDs) ? state.animationIDs : [];
    if (!target.id || !ids.includes(target.id)) continue;
    const stateName = stringValue(state.name, "Estado sem nome");
    addUsage(usages, {
      label: `Estado de animacao: ${stateName}`,
      workspace: "Sprites",
      targetID: optionalString(state.id) ?? undefined,
      targetName: target.name,
      usageKind: "animation-state"
    });
  }
  for (const actor of projectArray(data, "actors")) {
    if (actor.animationName !== target.name) continue;
    const actorName = stringValue(actor.name, "Ator sem nome");
    addUsage(usages, {
      label: `Ator: ${actorName}`,
      workspace: "Editor",
      targetID: optionalString(actor.id) ?? undefined,
      targetName: actorName,
      usageKind: "actor-animation"
    });
  }
  return sortedUsages(usages);
}

function listDialogueUsages(data: GBAProjectData, target: ProjectReferenceTarget): ProjectReferenceUsage[] {
  const dialogue = deriveDialoguesWorkspacePresentation(data).dialogues.find((item) => item.key === target.name);
  return (dialogue?.usages ?? []).map((usage) => ({
    label: `Evento: ${usage.eventName}${usage.stepIndex === null ? "" : `, passo ${usage.stepIndex + 1}`}`,
    workspace: "Eventos",
    targetID: usage.eventID,
    targetName: usage.eventName,
    usageKind: "event-dialogue-command"
  }));
}

export function listProjectReferenceUsages(data: GBAProjectData, target: ProjectReferenceTarget): ProjectReferenceUsage[] {
  if (target.kind === "asset") return listAssetUsages(data, target);
  if (target.kind === "audio") return listAudioUsages(data, target);
  if (target.kind === "room") return listRoomUsages(data, target);
  if (target.kind === "event") return listEventUsages(data, target);
  if (target.kind === "spriteAnimation") return listSpriteAnimationUsages(data, target);
  return listDialogueUsages(data, target);
}

export function projectReferenceDeletionGuard(
  data: GBAProjectData,
  target: ProjectReferenceTarget
): ProjectReferenceDeletionGuard {
  const usages = listProjectReferenceUsages(data, target);
  if (usages.length === 0) return { canDelete: true, message: null, usages: [] };

  return {
    canDelete: false,
    message: `Nao foi possivel remover ${target.name}: usado por ${usages.map((usage) => usage.label).join("; ")}.`,
    usages
  };
}
