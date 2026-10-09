import type { GBAProjectData } from "./projectFile.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = (data as Record<string, unknown>)[key];
  return Array.isArray(value) ? value.filter((entry): entry is Record<string, unknown> => Boolean(entry) && typeof entry === "object") : [];
}

function stringField(source: Record<string, unknown>, key: string, fallback = ""): string {
  const value = source[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function commandParts(command: string): string[] {
  return command.split(/\s+/).filter(Boolean);
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;
  return projectArray(data, "rooms");
}

function eventSteps(event: Record<string, unknown>): Array<{ command: string; isEnabled: boolean }> {
  const steps = event.steps;
  if (!Array.isArray(steps)) {
    const command = stringField(event, "command", "noop");
    return command === "noop" ? [] : [{ command, isEnabled: true }];
  }
  return steps.flatMap((step) => {
    if (!isRecord(step)) return [];
    return [{
      command: stringField(step, "command", "noop"),
      isEnabled: step.isEnabled !== false
    }];
  });
}

function referencedEvents(command: string): string[] {
  const parts = commandParts(command);
  const verb = parts[0] ?? "noop";
  const refs: string[] = [];

  if (["call_event", "lock_script", "unlock_script", "timer_restart", "timer_remove"].includes(verb) && parts[1]) {
    refs.push(parts[1]);
  }
  if (verb === "choice_event" && parts[3]) refs.push(parts[3]);
  if (verb === "attach_button" && parts[2]) refs.push(parts[2]);
  if (verb === "timer_attach" && parts[2]) refs.push(parts[2]);
  if (verb === "switch_variable") {
    for (let index = 2; index + 1 < parts.length; index += 2) {
      if (parts[index + 1]) refs.push(parts[index + 1]);
    }
  }
  if (verb === "repeat_expression" && parts[4]) refs.push(parts[4]);

  return refs;
}

export function auditProjectEventReferenceWarnings(data: GBAProjectData): string[] {
  const warnings = new Set<string>();
  const eventNames = new Set(projectArray(data, "events").map((event, index) => stringField(event, "name", `event_${index + 1}`)));
  const dialogueKeys = new Set(projectArray(data, "dialogues").map((item) => stringField(item, "key", "")));
  const roomNames = new Set(projectRooms(data).map((room, index) => stringField(room, "name", `room_${index + 1}`)));
  const audioNames = new Set(projectArray(data, "audioItems").map((item) => stringField(item, "name", "")));

  for (const event of projectArray(data, "events")) {
    const eventName = stringField(event, "name", "evento");
    for (const step of eventSteps(event)) {
      if (!step.isEnabled || step.command === "noop") continue;
      const parts = commandParts(step.command);
      const verb = parts[0] ?? "noop";

      if (["show_dialogue", "show_choice", "choice_event"].includes(verb) && parts[1] && !dialogueKeys.has(parts[1])) {
        warnings.add(`Referencia: dialogo ausente em ${eventName} (${parts[1]}).`);
      }

      if (["play_music", "play_sfx"].includes(verb) && parts[1] && !audioNames.has(parts[1])) {
        warnings.add(`Referencia: audio ausente em ${eventName} (${parts[1]}).`);
      }

      if (verb === "change_scene" && parts[1] && !roomNames.has(parts[1])) {
        warnings.add(`Referencia: room ausente em ${eventName} (${parts[1]}).`);
      }

      for (const target of referencedEvents(step.command)) {
        if (!eventNames.has(target)) {
          warnings.add(`Referencia: evento ausente em ${eventName} (${target}).`);
        }
      }
    }
  }

  return [...warnings];
}

function projectAssetNames(data: GBAProjectData): Set<string> {
  const names = new Set<string>();
  for (const asset of projectArray(data, "assets")) {
    const name = stringField(asset, "name", "");
    if (name) names.add(name);
  }
  for (const audio of projectArray(data, "audioItems")) {
    const name = stringField(audio, "name", "");
    if (name) names.add(name);
  }
  return names;
}

export function auditProjectDialogueAssetWarnings(data: GBAProjectData): string[] {
  const assetNames = projectAssetNames(data);
  const warnings = new Set<string>();

  for (const dialogue of projectArray(data, "dialogues")) {
    const key = stringField(dialogue, "key", "dialogo");
    const portrait = stringField(dialogue, "portrait", "");
    const emote = stringField(dialogue, "emote", "");
    const textSound = stringField(dialogue, "textSound", "");
    const confirmSound = stringField(dialogue, "confirmSound", "");

    if (portrait && !assetNames.has(portrait)) {
      warnings.add(`Referencia: portrait ausente em dialogo ${key} (${portrait}).`);
    }
    if (emote && !assetNames.has(emote)) {
      warnings.add(`Referencia: emote ausente em dialogo ${key} (${emote}).`);
    }
    if (textSound && !assetNames.has(textSound)) {
      warnings.add(`Referencia: textSound ausente em dialogo ${key} (${textSound}).`);
    }
    if (confirmSound && !assetNames.has(confirmSound)) {
      warnings.add(`Referencia: confirmSound ausente em dialogo ${key} (${confirmSound}).`);
    }
  }

  return [...warnings];
}

const BUILTIN_DIALOGUE_FONTS = new Set([
  "gba padrao",
  "gba padrão",
  "gba_padrao",
  "gba compacta",
  "gba_compacta",
  "gba_variable_width",
  "gba variable width"
]);

function isCustomDialogueFont(font: string): boolean {
  const normalized = font.trim().toLowerCase();
  if (!normalized) return false;
  if (BUILTIN_DIALOGUE_FONTS.has(normalized)) return false;
  return /[\\/.]/.test(font) || /\.(png|bmp|gif|jpg|jpeg|webp)$/i.test(font);
}

/** Avisa quando settings.uiDialogs.font aponta para asset custom que a engine ainda nao aplica na ROM. */
export function auditProjectDialogueUiFontWarnings(data: GBAProjectData): string[] {
  const settings = isRecord(data.settings) ? data.settings : null;
  const uiDialogs = settings && isRecord(settings.uiDialogs) ? settings.uiDialogs : null;
  if (!uiDialogs) return [];
  const font = stringField(uiDialogs, "font", "");
  if (!isCustomDialogueFont(font)) return [];
  if (projectAssetNames(data).has(font)) return [];
  return [
    `Fonte custom "${font}" selecionada, mas nenhum asset do projeto com esse nome pode ser convertido para a ROM.`
  ];
}

/** Avisa quando settings.uiDialogs.boxImage nao referencia nenhum asset existente no projeto (fallback procedural sera usado). */
export function auditProjectDialogueUiBoxImageWarnings(data: GBAProjectData): string[] {
  const settings = isRecord(data.settings) ? data.settings : null;
  const uiDialogs = settings && isRecord(settings.uiDialogs) ? settings.uiDialogs : null;
  if (!uiDialogs) return [];
  const boxImage = stringField(uiDialogs, "boxImage", "");
  if (!boxImage) return [];
  const assetNames = projectAssetNames(data);
  if (assetNames.has(boxImage)) return [];
  return [
    `Caixa de dialogo custom "${boxImage}" exportada em dialogue_ui.box_image, mas nenhum asset do projeto tem esse nome.`
  ];
}
