import type { GBAProjectData } from "./projectFile.js";
import { createDialogueInProject, updateDialogueInProject, type UpdateDialogueFields } from "./dialoguesWorkspace.js";
import { deriveEventsWorkspacePresentation, updateEventStepInProject } from "./eventsWorkspace.js";
import { sceneChangeCommand, sceneChangeCommandParts } from "./sceneChangeCommand.js";

export interface DialogueEventTarget { eventID: string; stepIndex: number; command: string; tokenIndex: number; requiresChoices?: boolean }
export type AuthoredDialogue = UpdateDialogueFields & { key: string; text: string };

export function nextDialogueKey(data: GBAProjectData): string {
  const keys = new Set((Array.isArray(data.dialogues) ? data.dialogues : []).map(item => item.key));
  let index = 1;
  while (keys.has(`fala_${index}`)) index++;
  return `fala_${index}`;
}

/** One update for history: a cancelled or stale operation never creates an orphan. */
export function createAuthoredDialogue(data: GBAProjectData, fields: AuthoredDialogue, target?: DialogueEventTarget): GBAProjectData {
  const key = fields.key.trim();
  if (!key || /\s/.test(key)) throw new Error("Use uma chave sem espaços, como fala_do_guia.");
  if (Array.isArray(data.dialogues) && data.dialogues.some(item => item.key === key)) throw new Error("Esta chave já existe. Escolha outra.");
  if (!fields.text.trim()) throw new Error("Escreva o texto da fala antes de criar.");
  if (target?.requiresChoices && !fields.choices?.some(choice => choice.trim())) throw new Error("Adicione pelo menos uma escolha para usar esta fala neste evento.");
  let command: string | undefined;
  if (target) {
    const event = deriveEventsWorkspacePresentation(data).groups.flatMap(group => group.events).find(item => item.id === target.eventID);
    const step = event?.steps.find(item => item.index === target.stepIndex);
    if (!step || step.command !== target.command) throw new Error("O evento mudou. Feche esta janela e tente novamente.");
    const parts = sceneChangeCommandParts(step.command);
    parts[target.tokenIndex] = key;
    command = sceneChangeCommand(parts);
  }
  let next = updateDialogueInProject(createDialogueInProject(data, fields), key, fields);
  if (target && command) next = updateEventStepInProject(next, target.eventID, target.stepIndex, { command });
  return next;
}
