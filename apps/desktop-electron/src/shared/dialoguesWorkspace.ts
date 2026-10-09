import { unsupportedDialogueCharacters } from "./dialogueFont.js";
import type { GBAProjectData } from "./projectFile.js";
import {
  deriveHudPresetsWorkspacePresentation,
  type HudPresetsWorkspacePresentation
} from "./hudPresets.js";
import { deriveFontCatalog, type FontCatalogPresentation } from "./fontCatalog.js";
import {
  builtInProjectLocales,
  deriveProjectLocalization,
  dialogueChoiceTranslations as localizedChoiceTranslationMap,
  dialogueTranslations as localizedDialogueTranslationMap,
  type ProjectLocale,
  type ProjectLocalization
} from "./projectLocalization.js";
import { resolveDialogueUiSettings, type DialogueNameLabelMode } from "./sceneRuntimeExport.js";

export interface DialoguesWorkspaceChoice {
  id: string;
  label: string;
  translation: string;
  translations: Partial<Record<ProjectLocale, string>>;
}

export interface DialoguesWorkspaceUsage {
  eventID: string;
  eventName: string;
  command: string;
  stepIndex: number | null;
  verb: string;
  choiceIndex?: number;
  targetEventName?: string;
}

export type DialogueSceneSourceKind = "scene" | "actor" | "trigger" | "event";

export type DialogueActorBindingStatus = "unbound" | "resolved" | "missing";

export interface DialogueSceneActorOption {
  id: string;
  name: string;
  roomName: string;
}

export interface DialogueSceneUsage extends DialoguesWorkspaceUsage {
  sceneID: string;
  sceneName: string;
  sourceKind: DialogueSceneSourceKind;
  sourceID: string;
  sourceName: string;
  viaEventName?: string;
}

export interface DialoguesWorkspaceDialogue {
  key: string;
  character: string;
  actorId?: string;
  portrait: string;
  portraitSlot: string;
  emote: string;
  textSound: string;
  confirmSound: string;
  text: string;
  translation: string;
  translationLanguageCode: string;
  translations: Partial<Record<ProjectLocale, string>>;
  choiceTranslationsByLocale: Partial<Record<ProjectLocale, string[]>>;
  choices: DialoguesWorkspaceChoice[];
  choiceTranslations: string[];
  choiceCount: number;
  textLength: number;
  referencedByEvents: string[];
  usages: DialoguesWorkspaceUsage[];
  warnings: string[];
}

export interface DialoguesSceneDialogue extends DialoguesWorkspaceDialogue {
  sceneUsages: DialogueSceneUsage[];
  actorId: string;
  actorName: string;
  actorBindingStatus: DialogueActorBindingStatus;
}

export interface DialoguesForScenePresentation {
  sceneID: string;
  sceneName: string;
  actors: DialogueSceneActorOption[];
  dialogues: DialoguesSceneDialogue[];
  references: Array<{ key: string; usages: DialogueSceneUsage[] }>;
  missing: Array<{ key: string; usages: DialogueSceneUsage[] }>;
}

export interface DialoguesWorkspaceCharacter {
  name: string;
  dialogueCount: number;
}

export interface DialogueCharacterProfile extends DialoguesWorkspaceCharacter {
  portrait: string;
  emote: string;
  textSound: string;
  confirmSound: string;
}

export interface DialoguesWorkspaceSummary {
  dialogueCount: number;
  characterCount: number;
  choiceCount: number;
  referencedDialogueCount: number;
  missingPortraitCount: number;
  translationCompletion: string;
}

export interface DialoguesWorkspaceFontPanel {
  font: string;
  status: string;
  textSpeed: string;
}

export interface DialoguesWorkspaceBoxPanel {
  selectorImage: string;
  boxImage: string;
  boxPosition: string;
  boxSize: string;
}

export interface DialoguesWorkspaceChromePanel {
  showPortrait: boolean;
  portraitPosition: string;
  portraitLayout: "inline" | "fixed_slots";
  showCharacterName: boolean;
  nameLabelMode: DialogueNameLabelMode;
}

export interface DialoguesWorkspaceInterfacePanel {
  characterSound: string;
  fontColor: string;
  choiceStyle: string;
  autoAdvance: boolean;
  advanceButton: string;
  cancelButton: string;
  startMenuTitle: string;
  startMenuShowInventory: boolean;
  startMenuShowMap: boolean;
}

export interface DialoguesWorkspacePreview {
  speaker: string;
  portrait: string;
  portraitSlot: string;
  emote: string;
  text: string;
  choices: string[];
}

export interface DialoguesWorkspacePresentation {
  localization: ProjectLocalization;
  dialogues: DialoguesWorkspaceDialogue[];
  characters: DialoguesWorkspaceCharacter[];
  selectedDialogue: DialoguesWorkspaceDialogue | null;
  summary: DialoguesWorkspaceSummary;
  fontPanel: DialoguesWorkspaceFontPanel;
  fontCatalog?: FontCatalogPresentation;
  boxPanel: DialoguesWorkspaceBoxPanel;
  chromePanel: DialoguesWorkspaceChromePanel;
  interfacePanel: DialoguesWorkspaceInterfacePanel;
  hudPresets: HudPresetsWorkspacePresentation;
  preview: DialoguesWorkspacePreview;
}

export type DialoguesWorkspaceStatusFilter = "all" | "used" | "unused" | "warning" | "choices";

export interface DialoguesWorkspaceFilterOptions {
  query?: string;
  status?: DialoguesWorkspaceStatusFilter;
  character?: string;
}

export interface DialoguesWorkspaceFilterChip {
  id: string;
  label: string;
  value: DialoguesWorkspaceStatusFilter;
  count: number;
  isActive: boolean;
}

export interface CreateDialogueOptions {
  key: string;
  character?: string;
  portrait?: string;
  text?: string;
  translation?: string;
  translationLanguageCode?: string;
  choices?: string[];
  choiceTranslations?: string[];
}

export interface DuplicateDialogueOptions {
  sourceKey: string;
  newKey: string;
}

export interface PreparedDialogueExport {
  fileName: string;
  contents: string;
}

export interface UpdateDialogueFields {
  character?: string;
  actorId?: string;
  portrait?: string;
  portraitSlot?: string;
  emote?: string;
  textSound?: string;
  confirmSound?: string;
  text?: string;
  translation?: string;
  translationLanguageCode?: string;
  translationStatus?: "draft-ai" | "approved";
  choices?: string[];
  choiceTranslations?: string[];
}

export interface UpdateDialoguesUiFields {
  font?: string;
  textSpeed?: string;
  characterSound?: string;
  selectorImage?: string;
  boxImage?: string;
  boxPosition?: string;
  boxWidth?: number;
  boxHeight?: number;
  fontColor?: string;
  showPortrait?: boolean;
  portraitPosition?: string;
  portraitLayout?: "inline" | "fixed_slots";
  showCharacterName?: boolean;
  nameLabelMode?: DialogueNameLabelMode;
  choiceStyle?: string;
  autoAdvance?: boolean;
  advanceButton?: string;
  cancelButton?: string;
  startMenuTitle?: string;
  startMenuShowInventory?: boolean;
  startMenuShowMap?: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProjectData<T>(data: T): T {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as T);
}

function mostCommonDialogueValue(values: string[]): string {
  const counts = new Map<string, { count: number; firstIndex: number }>();
  for (const [index, value] of values.entries()) {
    if (!value) continue;
    const current = counts.get(value) ?? { count: 0, firstIndex: index };
    counts.set(value, { count: current.count + 1, firstIndex: current.firstIndex });
  }
  return Array.from(counts.entries())
    .sort((lhs, rhs) => rhs[1].count - lhs[1].count || lhs[1].firstIndex - rhs[1].firstIndex)[0]?.[0] ?? "";
}

export function deriveDialogueCharacterProfiles(dialogues: DialoguesWorkspaceDialogue[]): DialogueCharacterProfile[] {
  const byCharacter = new Map<string, DialoguesWorkspaceDialogue[]>();
  for (const dialogue of dialogues) {
    const current = byCharacter.get(dialogue.character) ?? [];
    current.push(dialogue);
    byCharacter.set(dialogue.character, current);
  }
  return Array.from(byCharacter.entries()).map(([name, characterDialogues]) => ({
    name,
    dialogueCount: characterDialogues.length,
    portrait: mostCommonDialogueValue(characterDialogues.map((dialogue) => dialogue.portrait)),
    emote: mostCommonDialogueValue(characterDialogues.map((dialogue) => dialogue.emote)),
    textSound: mostCommonDialogueValue(characterDialogues.map((dialogue) => dialogue.textSound)),
    confirmSound: mostCommonDialogueValue(characterDialogues.map((dialogue) => dialogue.confirmSound))
  }));
}

function projectArray(data: GBAProjectData, key: string): Record<string, unknown>[] {
  const value = data[key];
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function optionalStringField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function numberField(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function booleanField(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function dialogueKey(dialogue: Record<string, unknown>, index: number): string {
  return stringField(dialogue.key, `dialogue_${index + 1}`);
}

function dialogueChoiceTranslations(value: unknown, count: number): string[] {
  const translations = Array.isArray(value)
    ? value.map((choice) => (typeof choice === "string" ? choice.trim() : ""))
    : [];
  return Array.from({ length: count }, (_, index) => translations[index] ?? "");
}

function dialogueChoices(value: unknown, translationsValue?: unknown): DialoguesWorkspaceChoice[] {
  if (!Array.isArray(value)) return [];
  const labels = value
    .map((choice, index) => {
      const label = typeof choice === "string" ? choice.trim() : "";
      return label ? { index, label } : null;
    })
    .filter((choice): choice is { index: number; label: string } => Boolean(choice));
  const translations = dialogueChoiceTranslations(translationsValue, value.length);
  return labels.map((choice, index) => ({
    id: `choice-${index + 1}`,
    label: choice.label,
    translation: translations[choice.index] ?? "",
    translations: {}
  }));
}

function sanitizedChoices(choices: string[] | undefined): string[] | undefined {
  if (!choices) return undefined;
  return choices.map((choice) => choice.trim()).filter(Boolean);
}

function sanitizedChoiceTranslations(translations: string[] | undefined, count: number): string[] | undefined {
  if (!translations) return undefined;
  return Array.from({ length: count }, (_, index) => translations[index]?.trim() ?? "");
}

function normalizeDialogueText(value: string): string {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/\s+/g, " "))
    .filter(Boolean)
    .join("\n");
}

function normalizeDialogueChoices(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .map((choice) => (typeof choice === "string" ? normalizeDialogueText(choice) : ""))
    .filter(Boolean);
}

function normalizeDialogueChoicePairs(value: unknown, translationsValue: unknown): { choices: string[]; translations: string[] } | null {
  if (!Array.isArray(value)) return null;
  const translations = dialogueChoiceTranslations(translationsValue, value.length);
  const choices: string[] = [];
  const choiceTranslations: string[] = [];

  value.forEach((choice, index) => {
    const normalizedChoice = typeof choice === "string" ? normalizeDialogueText(choice) : "";
    if (!normalizedChoice) return;
    choices.push(normalizedChoice);
    choiceTranslations.push(translations[index] ? normalizeDialogueText(translations[index]) : "");
  });

  return { choices, translations: choiceTranslations };
}

function safeFileStem(value: string, fallback: string): string {
  const safe = value
    .trim()
    .replace(/[^A-Za-z0-9_.-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || fallback;
}

function projectSettings(data: GBAProjectData): Record<string, unknown> {
  return isRecord(data.settings) ? data.settings : {};
}

function uiDialogsSettings(data: GBAProjectData): Record<string, unknown> {
  const settings = projectSettings(data);
  return isRecord(settings.uiDialogs) ? settings.uiDialogs : {};
}

function ensureProjectSettings(data: GBAProjectData): Record<string, unknown> {
  if (!isRecord(data.settings)) {
    data.settings = {};
  }
  return data.settings as Record<string, unknown>;
}

function ensureUiDialogsSettings(data: GBAProjectData): Record<string, unknown> {
  const settings = ensureProjectSettings(data);
  if (!isRecord(settings.uiDialogs)) {
    settings.uiDialogs = {};
  }
  return settings.uiDialogs as Record<string, unknown>;
}

function assetNames(data: GBAProjectData): Set<string> {
  return new Set(
    projectArray(data, "assets")
      .map((asset) => optionalStringField(asset.name))
      .filter(Boolean)
  );
}

function composedSfxNames(data: GBAProjectData): Set<string> {
  return new Set(
    projectArray(data, "audioItems")
      .filter((audio) => stringField(audio.kind, "").toLowerCase() === "sfx")
      .map((audio) => optionalStringField(audio.name))
      .filter(Boolean)
  );
}

export function deriveDialogueCharacterSound(data: GBAProjectData): string {
  const uiDialogs = uiDialogsSettings(data);
  if (typeof uiDialogs.characterSound === "string") return uiDialogs.characterSound.trim();

  const availableReferences = new Set([...assetNames(data), ...composedSfxNames(data)]);
  const availableDialogueSounds = projectArray(data, "dialogues")
    .map((dialogue) => optionalStringField(dialogue.textSound))
    .filter((sound) => availableReferences.has(sound));
  return mostCommonDialogueValue(availableDialogueSounds);
}

function eventCommands(data: GBAProjectData): Array<{ eventID: string; eventName: string; command: string; stepIndex: number | null }> {
  return projectArray(data, "events").flatMap((event, index) => {
    const eventID = stringField(event.id, `event-${index + 1}`);
    const eventName = stringField(event.name, stringField(event.id, `event_${index + 1}`));
    const commands: Array<{ eventID: string; eventName: string; command: string; stepIndex: number | null }> = [];
    const topLevelCommand = optionalStringField(event.command);
    if (topLevelCommand) commands.push({ eventID, eventName, command: topLevelCommand, stepIndex: null });

    if (Array.isArray(event.steps)) {
      for (const [stepIndex, step] of event.steps.entries()) {
        if (!isRecord(step)) continue;
        const command = optionalStringField(step.command);
        if (command) commands.push({ eventID, eventName, command, stepIndex });
      }
    }

    return commands;
  });
}

function dialogueUsage(command: string): { key: string; verb: string; choiceIndex?: number; targetEventName?: string } | null {
  const parts = command.trim().split(/\s+/);
  const verb = parts[0]?.toLowerCase();
  if (["show_dialogue", "show_choice", "show_dialogue_speaker", "dialogue", "dialog"].includes(verb) && parts[1]) {
    return { key: parts[1], verb };
  }
  if (verb === "choice_event" && parts[1]) {
    const choiceIndex = parts[2] && /^\d+$/.test(parts[2]) ? Number(parts[2]) : undefined;
    return {
      key: parts[1],
      verb,
      choiceIndex,
      targetEventName: parts[3]
    };
  }
  return null;
}

function referencedDialogues(data: GBAProjectData): Map<string, DialoguesWorkspaceUsage[]> {
  const references = new Map<string, DialoguesWorkspaceUsage[]>();

  for (const { eventID, eventName, command, stepIndex } of eventCommands(data)) {
    const usage = dialogueUsage(command);
    if (!usage) continue;
    const usages = references.get(usage.key) ?? [];
    usages.push({
      eventID,
      eventName,
      command,
      stepIndex,
      verb: usage.verb,
      choiceIndex: usage.choiceIndex,
      targetEventName: usage.targetEventName
    });
    references.set(usage.key, usages);
  }

  for (const [sceneIndex, scene] of projectArray(data, "scenas").entries()) {
    const runtime = isRecord(scene.runtime) ? scene.runtime : null;
    const config = runtime && isRecord(runtime.config) ? runtime.config : null;
    const sceneName = stringField(scene.name, `scene_${sceneIndex + 1}`);
    const sceneID = stringField(scene.id, `scene-${sceneIndex + 1}`);
    const addSceneDialogueUsage = (dialogueKey: string, eventName: string, stepIndex: number | null): void => {
      if (!dialogueKey) return;
      const usages = references.get(dialogueKey) ?? [];
      usages.push({
        eventID: sceneID,
        eventName,
        command: `show_dialogue ${dialogueKey}`,
        stepIndex,
        verb: "scene_dialogue"
      });
      references.set(dialogueKey, usages);
    };

    addSceneDialogueUsage(
      config ? optionalStringField(config.dialogueKey) : "",
      `Cena: ${sceneName}`,
      null
    );

    const steps = config && Array.isArray(config.steps) ? config.steps.filter(isRecord) : [];
    steps.forEach((step, stepIndex) => {
      addSceneDialogueUsage(
        optionalStringField(step.dialogueKey),
        `Cena: ${sceneName} · passo ${stepIndex + 1}`,
        stepIndex
      );
    });

    const nodes = config && Array.isArray(config.nodes) ? config.nodes.filter(isRecord) : [];
    nodes.forEach((node, nodeIndex) => {
      const nodeName = optionalStringField(node.name) || optionalStringField(node.id) || String(nodeIndex + 1);
      addSceneDialogueUsage(
        optionalStringField(node.dialogueKey),
        `Cena: ${sceneName} · nó ${nodeName}`,
        nodeIndex
      );
    });

    const addMenuItemDialogueUsage = (items: unknown[], context: string): void => {
      items.filter(isRecord).forEach((item, itemIndex) => {
        const label = optionalStringField(item.label) || optionalStringField(item.id) || String(itemIndex + 1);
        addSceneDialogueUsage(
          optionalStringField(item.dialogueKey),
          `Cena: ${sceneName} · ${context} · item ${label}`,
          itemIndex
        );
      });
    };

    addMenuItemDialogueUsage(config && Array.isArray(config.items) ? config.items : [], "menu");
    const embeddedScreens = config && Array.isArray(config.screens) ? config.screens.filter(isRecord) : [];
    embeddedScreens.forEach((screen, screenIndex) => {
      const screenName = optionalStringField(screen.title) || optionalStringField(screen.id) || String(screenIndex + 1);
      addMenuItemDialogueUsage(
        Array.isArray(screen.items) ? screen.items : [],
        `tela ${screenName}`
      );
    });
  }

  return references;
}

interface DialogueSceneSource {
  sourceKind: DialogueSceneSourceKind;
  sourceID: string;
  sourceName: string;
}

interface SceneEventRecord {
  eventID: string;
  eventName: string;
  roomName: string;
  commands: Array<{ command: string; stepIndex: number | null }>;
}

function stringRecordValues(value: unknown): string[] {
  if (!isRecord(value)) return [];
  return Object.values(value).filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0).map((entry) => entry.trim());
}

function sceneEventRecords(data: GBAProjectData): SceneEventRecord[] {
  return projectArray(data, "events").map((event, index) => {
    const eventID = stringField(event.id, `event-${index + 1}`);
    const eventName = stringField(event.name, eventID);
    const commands: Array<{ command: string; stepIndex: number | null }> = [];
    const topLevelCommand = optionalStringField(event.command);
    if (topLevelCommand) commands.push({ command: topLevelCommand, stepIndex: null });
    if (Array.isArray(event.steps)) {
      event.steps.forEach((step, stepIndex) => {
        if (!isRecord(step)) return;
        const command = optionalStringField(step.command);
        if (command) commands.push({ command, stepIndex });
      });
    }
    return {
      eventID,
      eventName,
      roomName: optionalStringField(event.roomName),
      commands
    };
  });
}

function collectSceneDialogueKeys(value: unknown, path: string, result: Array<{ key: string; path: string }>): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectSceneDialogueKeys(entry, `${path}[${index}]`, result));
    return;
  }
  if (!isRecord(value)) return;
  const dialogueKey = optionalStringField(value.dialogueKey);
  if (dialogueKey) result.push({ key: dialogueKey, path });
  Object.entries(value).forEach(([key, entry]) => {
    if (key !== "dialogueKey") collectSceneDialogueKeys(entry, `${path}.${key}`, result);
  });
}

function sceneScopedRecords(data: GBAProjectData, collection: string, sceneID: string, sceneName: string): Record<string, unknown>[] {
  return projectArray(data, collection).filter((record) => (
    optionalStringField(record.roomName) === sceneName
    || optionalStringField(record.roomID) === sceneID
  ));
}

function sceneEventNamesForRecord(record: Record<string, unknown>): string[] {
  return Array.from(new Set([
    optionalStringField(record.eventName),
    optionalStringField(record.scriptName),
    ...stringRecordValues(record.eventBindings)
  ].filter(Boolean)));
}

function addSceneDialogueReference(
  references: Map<string, DialogueSceneUsage[]>,
  key: string,
  usage: DialogueSceneUsage
): void {
  const usages = references.get(key) ?? [];
  const signature = [
    usage.sourceKind,
    usage.sourceID,
    usage.viaEventName ?? "",
    usage.command,
    usage.stepIndex ?? ""
  ].join("|");
  if (!usages.some((candidate) => [
    candidate.sourceKind,
    candidate.sourceID,
    candidate.viaEventName ?? "",
    candidate.command,
    candidate.stepIndex ?? ""
  ].join("|") === signature)) {
    usages.push(usage);
  }
  references.set(key, usages);
}

export function deriveDialoguesForScene(
  data: GBAProjectData,
  scene: { id?: string; name: string }
): DialoguesForScenePresentation {
  const sceneRecord = projectArray(data, "scenas").find((candidate) => (
    (scene.id && optionalStringField(candidate.id) === scene.id)
    || optionalStringField(candidate.name) === scene.name
  ));
  const sceneID = optionalStringField(sceneRecord?.id) || scene.id || scene.name;
  const sceneName = optionalStringField(sceneRecord?.name) || scene.name;
  const references = new Map<string, DialogueSceneUsage[]>();
  const events = sceneEventRecords(data);
  const eventsByName = new Map(events.map((event) => [event.eventName, event]));
  const eventSeeds = new Map<string, DialogueSceneSource>();
  const addEventSeed = (eventName: string, source: DialogueSceneSource): void => {
    if (eventName && eventsByName.has(eventName)) {
      const seedKey = `${eventName}|${source.sourceKind}|${source.sourceID}`;
      if (!eventSeeds.has(seedKey)) eventSeeds.set(seedKey, source);
    }
  };

  if (sceneRecord) {
    const sceneSource: DialogueSceneSource = { sourceKind: "scene", sourceID: sceneID, sourceName: sceneName };
    stringRecordValues(sceneRecord.eventBindings).forEach((eventName) => addEventSeed(eventName, sceneSource));
    const runtime = isRecord(sceneRecord.runtime) ? sceneRecord.runtime : null;
    const config = runtime && isRecord(runtime.config) ? runtime.config : null;
    const directReferences: Array<{ key: string; path: string }> = [];
    collectSceneDialogueKeys(config, "runtime.config", directReferences);
    directReferences.forEach(({ key, path }) => addSceneDialogueReference(references, key, {
      eventID: sceneID,
      eventName: `Cena: ${sceneName}`,
      command: `show_dialogue ${key}`,
      stepIndex: null,
      verb: "scene_dialogue",
      sceneID,
      sceneName,
      sourceKind: "scene",
      sourceID: sceneID,
      sourceName: path
    }));
  }

  for (const collection of ["actors", "triggers"] as const) {
    const sourceKind = collection === "actors" ? "actor" : "trigger";
    sceneScopedRecords(data, collection, sceneID, sceneName).forEach((record, index) => {
      const sourceID = stringField(record.id, `${sourceKind}-${index + 1}`);
      const sourceName = stringField(record.name, sourceID);
      const source: DialogueSceneSource = { sourceKind, sourceID, sourceName };
      sceneEventNamesForRecord(record).forEach((eventName) => addEventSeed(eventName, source));
    });
  }

  const actors = sceneScopedRecords(data, "actors", sceneID, sceneName).flatMap((record) => {
    const id = optionalStringField(record.id);
    if (!id) return [];
    return [{
      id,
      name: stringField(record.name, id),
      roomName: sceneName
    } satisfies DialogueSceneActorOption];
  });
  const actorsByID = new Map(actors.map((actor) => [actor.id, actor]));

  const pending = Array.from(eventSeeds.entries()).map(([seedKey, source]) => ({
    seedKey,
    eventName: seedKey.split("|")[0] ?? "",
    source
  }));
  const visited = new Set<string>();
  while (pending.length > 0) {
    const current = pending.shift();
    if (!current) break;
    const visitKey = `${current.eventName}|${current.source.sourceKind}|${current.source.sourceID}`;
    if (visited.has(visitKey)) continue;
    visited.add(visitKey);
    const event = eventsByName.get(current.eventName);
    if (!event) continue;

    event.commands.forEach(({ command, stepIndex }) => {
      const usage = dialogueUsage(command);
      const parts = command.trim().split(/\s+/);
      if (usage) {
        addSceneDialogueReference(references, usage.key, {
          eventID: event.eventID,
          eventName: event.eventName,
          command,
          stepIndex,
          verb: usage.verb,
          choiceIndex: usage.choiceIndex,
          targetEventName: usage.targetEventName,
          sceneID,
          sceneName,
          sourceKind: current.source.sourceKind,
          sourceID: current.source.sourceID,
          sourceName: current.source.sourceName,
          viaEventName: event.eventName
        });
      }
      if (parts[0]?.toLowerCase() !== "call_event" || !parts[1]) return;
      addEventSeed(parts[1], current.source);
      const nestedSeedKey = `${parts[1]}|${current.source.sourceKind}|${current.source.sourceID}`;
      if (!visited.has(nestedSeedKey)) pending.unshift({ seedKey: nestedSeedKey, eventName: parts[1], source: current.source });
    });
  }

  const globalDialogues = deriveDialoguesWorkspacePresentation(data).dialogues;
  const dialoguesByKey = new Map(globalDialogues.map((dialogue) => [dialogue.key, dialogue]));
  const orderedReferences = Array.from(references.entries()).map(([key, usages]) => ({ key, usages }));
  const dialogues = orderedReferences.flatMap(({ key, usages }) => {
    const dialogue = dialoguesByKey.get(key);
    if (!dialogue) return [];
    const actorId = dialogue.actorId ?? "";
    const actor = actorId ? actorsByID.get(actorId) : undefined;
    const actorBindingStatus: DialogueActorBindingStatus = !actorId
      ? "unbound"
      : actor
        ? "resolved"
        : "missing";
    const warnings = actorBindingStatus === "missing"
      ? Array.from(new Set([...dialogue.warnings, `Ator vinculado não encontrado: ${actorId}`]))
      : dialogue.warnings;
    return [{
      ...dialogue,
      actorId,
      actorName: actor?.name ?? "",
      actorBindingStatus,
      sceneUsages: usages,
      warnings
    }];
  });
  const missing = orderedReferences.filter(({ key }) => !dialoguesByKey.has(key));

  return { actors, sceneID, sceneName, dialogues, references: orderedReferences, missing };
}

function makeDialogue(
  dialogue: Record<string, unknown>,
  index: number,
  references: Map<string, DialoguesWorkspaceUsage[]>,
  availableAssets: Set<string>,
  availableSfx: Set<string>,
  localization: ProjectLocalization,
  activeTranslationLocale: ProjectLocale
): DialoguesWorkspaceDialogue {
  const key = dialogueKey(dialogue, index);
  const character = stringField(dialogue.character, "Narrador");
  const actorId = optionalStringField(dialogue.actorId);
  const portrait = optionalStringField(dialogue.portrait);
  const portraitSlot = optionalStringField(dialogue.portraitSlot);
  const emote = optionalStringField(dialogue.emote);
  const textSound = optionalStringField(dialogue.textSound);
  const confirmSound = optionalStringField(dialogue.confirmSound);
  const text = optionalStringField(dialogue.text);
  const translations = localizedDialogueTranslationMap(dialogue);
  const choiceTranslationsByLocale = localizedChoiceTranslationMap(dialogue);
  const translationLanguageCode = activeTranslationLocale;
  const legacyTranslation = optionalStringField(dialogue.translation);
  const legacyTranslationLocale = stringField(dialogue.translationLanguageCode, translationLanguageCode) as ProjectLocale;
  if (legacyTranslation && localization.enabledLocales.includes(legacyTranslationLocale)) {
    translations[legacyTranslationLocale] = legacyTranslation;
  }
  const legacyChoiceTranslations = Array.isArray(dialogue.choiceTranslations) ? dialogue.choiceTranslations : undefined;
  if (legacyChoiceTranslations && localization.enabledLocales.includes(legacyTranslationLocale)) {
    choiceTranslationsByLocale[legacyTranslationLocale] = legacyChoiceTranslations.map((value) => typeof value === "string" ? value : "");
  }
  const translation = translations[translationLanguageCode] ?? "";
  const activeChoiceTranslations = choiceTranslationsByLocale[translationLanguageCode] ?? [];
  const choices = dialogueChoices(dialogue.choices, activeChoiceTranslations).map((choice, choiceIndex) => ({
    ...choice,
    translations: Object.fromEntries(localization.enabledLocales.flatMap((locale) => {
      if (locale === localization.sourceLocale) return [[locale, choice.label]];
      const value = choiceTranslationsByLocale[locale]?.[choiceIndex] ?? "";
      return value ? [[locale, value]] : [];
    })) as Partial<Record<ProjectLocale, string>>
  }));
  const choiceTranslations = choices.map((choice) => choice.translation);
  const usages = (references.get(key) ?? []).sort((left, right) => {
    const eventCompare = left.eventName.localeCompare(right.eventName);
    if (eventCompare !== 0) return eventCompare;
    return (left.stepIndex ?? -1) - (right.stepIndex ?? -1);
  });
  const warnings = [
    portrait && !availableAssets.has(portrait) ? "Retrato nao encontrado" : "",
    emote && !availableAssets.has(emote) ? "Emote nao encontrado" : "",
    textSound && !availableAssets.has(textSound) && !availableSfx.has(textSound) ? "Som de texto nao encontrado" : "",
    confirmSound && !availableAssets.has(confirmSound) && !availableSfx.has(confirmSound) ? "Som de confirmar nao encontrado" : ""
  ].filter(Boolean);

  return {
    key,
    character,
    ...(actorId ? { actorId } : {}),
    portrait,
    portraitSlot,
    emote,
    textSound,
    confirmSound,
    text,
    translation,
    translationLanguageCode,
    translations,
    choiceTranslationsByLocale,
    choices,
    choiceTranslations,
    choiceCount: choices.length,
    textLength: text.length,
    referencedByEvents: Array.from(new Set(usages.map((usage) => usage.eventName))).sort((left, right) => left.localeCompare(right)),
    usages,
    warnings
  };
}

function makeCharacters(dialogues: DialoguesWorkspaceDialogue[]): DialoguesWorkspaceCharacter[] {
  const counts = new Map<string, number>();
  for (const dialogue of dialogues) {
    counts.set(dialogue.character, (counts.get(dialogue.character) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .map(([name, dialogueCount]) => ({ name, dialogueCount }))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function deriveDialoguesWorkspacePresentation(data: GBAProjectData): DialoguesWorkspacePresentation {
  const localization = deriveProjectLocalization(data);
  const uiDialogs = uiDialogsSettings(data);
  const requestedTranslationLocale = optionalStringField(uiDialogs.translationLocale);
  const activeTranslationLocale = localization.enabledLocales.includes(requestedTranslationLocale as ProjectLocale)
      && requestedTranslationLocale !== localization.sourceLocale
    ? requestedTranslationLocale as ProjectLocale
    : localization.enabledLocales.find((locale) => locale !== localization.sourceLocale) ?? localization.defaultLocale;
  const references = referencedDialogues(data);
  const availableAssets = assetNames(data);
  const availableSfx = composedSfxNames(data);
  const dialogues = projectArray(data, "dialogues").map((dialogue, index) =>
    makeDialogue(dialogue, index, references, availableAssets, availableSfx, localization, activeTranslationLocale)
  );
  const selectedDialogue = dialogues[0] ?? null;
  const choiceCount = dialogues.reduce((sum, dialogue) => sum + dialogue.choiceCount, 0);
  const targetLocales = localization.enabledLocales.filter((locale) => locale !== localization.sourceLocale);
  const translatableDialogueCount = dialogues.filter((dialogue) => dialogue.text.trim()).length * targetLocales.length;
  const translatedDialogueCount = dialogues.reduce(
    (sum, dialogue) => sum + targetLocales.filter((locale) => dialogue.text.trim() && dialogue.translations[locale]?.trim()).length,
    0
  );
  const translatedChoiceCount = dialogues.reduce((sum, dialogue) =>
    sum + dialogue.choices.reduce((choiceSum, choice) =>
      choiceSum + targetLocales.filter((locale) => choice.label.trim() && choice.translations[locale]?.trim()).length,
    0),
  0);
  const translationTotal = translatableDialogueCount + choiceCount * targetLocales.length;
  const translationComplete = translationTotal === 0
    ? 100
    : Math.round(((translatedDialogueCount + translatedChoiceCount) / translationTotal) * 100);
  const missingPortraitCount = dialogues.filter((dialogue) => dialogue.warnings.includes("Retrato nao encontrado")).length;
  const referencedDialogueCount = dialogues.filter((dialogue) => dialogue.referencedByEvents.length > 0).length;
  const dialogueUi = resolveDialogueUiSettings(uiDialogs);

  return {
    localization,
    dialogues,
    characters: makeCharacters(dialogues),
    selectedDialogue,
    summary: {
      dialogueCount: dialogues.length,
      characterCount: makeCharacters(dialogues).length,
      choiceCount,
      referencedDialogueCount,
      missingPortraitCount,
      translationCompletion: `${translationComplete}%`
    },
    fontPanel: {
      font: dialogueUi.font,
      status: "GBA OK",
      textSpeed: dialogueUi.textSpeed
    },
    fontCatalog: deriveFontCatalog(data),
    boxPanel: {
      selectorImage: dialogueUi.selectorImage,
      boxImage: dialogueUi.boxImage,
      boxPosition: dialogueUi.boxPosition,
      boxSize: `${dialogueUi.boxWidth} x ${dialogueUi.boxHeight}`
    },
    chromePanel: {
      showPortrait: dialogueUi.showPortrait,
      portraitPosition: dialogueUi.portraitPosition,
      portraitLayout: dialogueUi.portraitLayout,
      showCharacterName: dialogueUi.showCharacterName,
      nameLabelMode: dialogueUi.nameLabelMode
    },
    interfacePanel: {
      characterSound: deriveDialogueCharacterSound(data),
      fontColor: stringField(uiDialogs.fontColor, "#FFFFFF"),
      choiceStyle: stringField(uiDialogs.choiceStyle, "Lista vertical"),
      autoAdvance: booleanField(uiDialogs.autoAdvance, false),
      advanceButton: stringField(uiDialogs.advanceButton, "A"),
      cancelButton: stringField(uiDialogs.cancelButton, "B"),
      startMenuTitle: stringField(uiDialogs.startMenuTitle, "Menu"),
      startMenuShowInventory: booleanField(uiDialogs.startMenuShowInventory, false),
      startMenuShowMap: booleanField(uiDialogs.startMenuShowMap, false)
    },
    hudPresets: deriveHudPresetsWorkspacePresentation(data),
    preview: {
      speaker: selectedDialogue?.character ?? "Sem personagem",
      portrait: selectedDialogue?.portrait ?? "",
      portraitSlot: selectedDialogue?.portraitSlot ?? "",
      emote: selectedDialogue?.emote ?? "",
      text: selectedDialogue?.text ?? "Selecione um dialogo para visualizar.",
      choices: selectedDialogue?.choices.map((choice) => choice.label) ?? []
    }
  };
}

function normalizedSearch(value: string): string {
  return value.trim().toLowerCase();
}

export function filterDialoguesWorkspaceDialogues(
  dialogues: DialoguesWorkspaceDialogue[],
  options: DialoguesWorkspaceFilterOptions = {}
): DialoguesWorkspaceDialogue[] {
  const query = normalizedSearch(options.query ?? "");
  const status = options.status ?? "all";
  const character = normalizedSearch(options.character ?? "");

  return dialogues.filter((dialogue) => {
    if (status === "used" && dialogue.referencedByEvents.length === 0) return false;
    if (status === "unused" && dialogue.referencedByEvents.length > 0) return false;
    if (status === "warning" && dialogue.warnings.length === 0) return false;
    if (status === "choices" && dialogue.choiceCount === 0) return false;
    if (character && normalizedSearch(dialogue.character) !== character) return false;
    if (!query) return true;

    return [
      dialogue.key,
      dialogue.character,
      dialogue.portrait,
      dialogue.text,
      dialogue.translation,
      ...dialogue.choices.map((choice) => choice.label),
      ...dialogue.choices.map((choice) => choice.translation),
      ...dialogue.referencedByEvents,
      ...dialogue.warnings
    ].some((value) => normalizedSearch(value).includes(query));
  });
}

export function deriveDialoguesWorkspaceFilterChips(
  presentation: DialoguesWorkspacePresentation,
  activeStatus: DialoguesWorkspaceStatusFilter = "all"
): DialoguesWorkspaceFilterChip[] {
  const dialogues = presentation.dialogues;
  const definitions: Array<{ value: DialoguesWorkspaceStatusFilter; label: string; count: number }> = [
    { value: "all", label: "Todas", count: dialogues.length },
    { value: "used", label: "Usadas", count: dialogues.filter((dialogue) => dialogue.referencedByEvents.length > 0).length },
    { value: "unused", label: "Sem uso", count: dialogues.filter((dialogue) => dialogue.referencedByEvents.length === 0).length },
    { value: "warning", label: "Avisos", count: dialogues.filter((dialogue) => dialogue.warnings.length > 0).length },
    { value: "choices", label: "Escolhas", count: dialogues.filter((dialogue) => dialogue.choiceCount > 0).length }
  ];

  return definitions.map((definition) => ({
    id: `dialogue-status-${definition.value}`,
    label: definition.label,
    value: definition.value,
    count: definition.count,
    isActive: definition.value === activeStatus
  }));
}

export function updateDialogueInProject(
  data: GBAProjectData,
  key: string,
  fields: UpdateDialogueFields
): GBAProjectData {
  const next = cloneProjectData(data);
  const dialogues = Array.isArray(next.dialogues) ? next.dialogues : [];
  const index = dialogues.findIndex((dialogue, dialogueIndex) => isRecord(dialogue) && dialogueKey(dialogue, dialogueIndex) === key);
  if (index < 0 || !isRecord(dialogues[index])) return next;

  const dialogue = dialogues[index];
  if (fields.character !== undefined) dialogue.character = fields.character.trim();
  if (fields.actorId !== undefined) {
    const actorId = fields.actorId.trim();
    if (actorId) dialogue.actorId = actorId;
    else delete dialogue.actorId;
  }
  if (fields.portrait !== undefined) dialogue.portrait = fields.portrait.trim();
  if (fields.portraitSlot !== undefined) dialogue.portraitSlot = fields.portraitSlot.trim();
  if (fields.emote !== undefined) dialogue.emote = fields.emote.trim();
  if (fields.textSound !== undefined) dialogue.textSound = fields.textSound.trim();
  if (fields.confirmSound !== undefined) dialogue.confirmSound = fields.confirmSound.trim();
  if (fields.text !== undefined) dialogue.text = fields.text;
  const localization = deriveProjectLocalization(next);
  const requestedLocale = fields.translationLanguageCode?.trim() ?? optionalStringField(uiDialogsSettings(next).translationLocale);
  const activeLocale = builtInProjectLocales.includes(requestedLocale as ProjectLocale)
      && localization.enabledLocales.includes(requestedLocale as ProjectLocale)
      && requestedLocale !== localization.sourceLocale
    ? requestedLocale as ProjectLocale
    : localization.enabledLocales.find((locale) => locale !== localization.sourceLocale) ?? localization.defaultLocale;
  if (fields.translationLanguageCode !== undefined) {
    ensureUiDialogsSettings(next).translationLocale = activeLocale;
  }
  if (fields.translation !== undefined) {
    const translations = isRecord(dialogue.translations) ? dialogue.translations : {};
    translations[activeLocale] = fields.translation.trim();
    dialogue.translations = translations;
    delete dialogue.translation;
    delete dialogue.translationLanguageCode;
  }
  if (fields.translationStatus !== undefined) {
    const status = isRecord(dialogue.translationStatus) ? dialogue.translationStatus : {};
    status[activeLocale] = fields.translationStatus;
    dialogue.translationStatus = status;
  }
  const choices = sanitizedChoices(fields.choices);
  if (choices !== undefined) dialogue.choices = choices;
  const choiceCount = Array.isArray(dialogue.choices) ? dialogue.choices.length : 0;
  const choiceTranslations = sanitizedChoiceTranslations(fields.choiceTranslations, choiceCount);
  if (choiceTranslations !== undefined) {
    const translationsByLocale = isRecord(dialogue.choiceTranslations) ? dialogue.choiceTranslations : {};
    translationsByLocale[activeLocale] = choiceTranslations;
    dialogue.choiceTranslations = translationsByLocale;
  }

  return next;
}

export function updateDialoguesUiInProject(
  data: GBAProjectData,
  fields: UpdateDialoguesUiFields
): GBAProjectData {
  const next = cloneProjectData(data);
  const uiDialogs = ensureUiDialogsSettings(next);

  if (fields.font !== undefined) uiDialogs.font = fields.font.trim();
  if (fields.textSpeed !== undefined) uiDialogs.textSpeed = fields.textSpeed.trim();
  if (fields.characterSound !== undefined) uiDialogs.characterSound = fields.characterSound.trim();
  if (fields.selectorImage !== undefined) uiDialogs.selectorImage = fields.selectorImage.trim();
  if (fields.boxImage !== undefined) uiDialogs.boxImage = fields.boxImage.trim();
  if (fields.boxPosition !== undefined) uiDialogs.boxPosition = fields.boxPosition.trim();
  if (fields.boxWidth !== undefined && Number.isFinite(fields.boxWidth)) uiDialogs.boxWidth = Math.max(1, Math.round(fields.boxWidth));
  if (fields.boxHeight !== undefined && Number.isFinite(fields.boxHeight)) uiDialogs.boxHeight = Math.max(1, Math.round(fields.boxHeight));
  if (fields.fontColor !== undefined) uiDialogs.fontColor = fields.fontColor.trim();
  if (fields.showPortrait !== undefined) uiDialogs.showPortrait = fields.showPortrait;
  if (fields.portraitPosition !== undefined) uiDialogs.portraitPosition = fields.portraitPosition.trim();
  if (fields.portraitLayout !== undefined) uiDialogs.portraitLayout = fields.portraitLayout;
  if (fields.showCharacterName !== undefined) uiDialogs.showCharacterName = fields.showCharacterName;
  if (fields.nameLabelMode !== undefined) uiDialogs.nameLabelMode = fields.nameLabelMode;
  if (fields.choiceStyle !== undefined) uiDialogs.choiceStyle = fields.choiceStyle.trim();
  if (fields.autoAdvance !== undefined) uiDialogs.autoAdvance = fields.autoAdvance;
  if (fields.advanceButton !== undefined) uiDialogs.advanceButton = fields.advanceButton.trim();
  if (fields.cancelButton !== undefined) uiDialogs.cancelButton = fields.cancelButton.trim();
  if (fields.startMenuTitle !== undefined) uiDialogs.startMenuTitle = fields.startMenuTitle.trim();
  if (fields.startMenuShowInventory !== undefined) uiDialogs.startMenuShowInventory = fields.startMenuShowInventory;
  if (fields.startMenuShowMap !== undefined) uiDialogs.startMenuShowMap = fields.startMenuShowMap;

  return next;
}

export function createDialogueInProject(data: GBAProjectData, options: CreateDialogueOptions): GBAProjectData {
  const key = options.key.trim();
  if (!key) return data;

  const next = cloneProjectData(data);
  const dialogues = Array.isArray(next.dialogues) ? next.dialogues : [];
  const exists = dialogues.some((dialogue, index) => isRecord(dialogue) && dialogueKey(dialogue, index) === key);
  if (exists) return next;

  const settings = isRecord(next.settings) ? next.settings : {};
  const uiDialogs = isRecord(settings.uiDialogs) ? settings.uiDialogs : {};
  const defaultPortrait = optionalStringField(uiDialogs.defaultPortrait);

  next.dialogues = [
    ...dialogues,
    {
      key,
      character: options.character?.trim() || "Narrador",
      portrait: options.portrait === undefined ? defaultPortrait : options.portrait.trim(),
      portraitSlot: "",
      emote: "",
      textSound: "",
      confirmSound: "",
      text: options.text ?? "",
      translation: options.translation?.trim() ?? "",
      translationLanguageCode: options.translationLanguageCode?.trim() || "en",
      choices: sanitizedChoices(options.choices) ?? [],
      choiceTranslations: sanitizedChoiceTranslations(options.choiceTranslations, sanitizedChoices(options.choices)?.length ?? 0) ?? []
    }
  ];

  return next;
}

export function duplicateDialogueInProject(data: GBAProjectData, options: DuplicateDialogueOptions): GBAProjectData {
  const sourceKey = options.sourceKey.trim();
  const newKey = options.newKey.trim();
  if (!sourceKey || !newKey) return data;

  const dialogues = Array.isArray(data.dialogues) ? data.dialogues : [];
  const sourceIndex = dialogues.findIndex((dialogue, index) => isRecord(dialogue) && dialogueKey(dialogue, index) === sourceKey);
  const exists = dialogues.some((dialogue, index) => isRecord(dialogue) && dialogueKey(dialogue, index) === newKey);
  if (sourceIndex < 0 || exists || !isRecord(dialogues[sourceIndex])) return data;

  const sourceDialogue = dialogues[sourceIndex];
  const next = cloneProjectData(data);
  const nextDialogues = Array.isArray(next.dialogues) ? next.dialogues : [];
  next.dialogues = [
    ...nextDialogues,
    {
      key: newKey,
      character: optionalStringField(sourceDialogue.character) || "Narrador",
      portrait: optionalStringField(sourceDialogue.portrait),
      portraitSlot: optionalStringField(sourceDialogue.portraitSlot),
      emote: optionalStringField(sourceDialogue.emote),
      textSound: optionalStringField(sourceDialogue.textSound),
      confirmSound: optionalStringField(sourceDialogue.confirmSound),
      text: optionalStringField(sourceDialogue.text),
      translation: optionalStringField(sourceDialogue.translation),
      translationLanguageCode: stringField(sourceDialogue.translationLanguageCode, "en"),
      choices: dialogueChoices(sourceDialogue.choices, sourceDialogue.choiceTranslations).map((choice) => choice.label),
      choiceTranslations: dialogueChoices(sourceDialogue.choices, sourceDialogue.choiceTranslations).map((choice) => choice.translation)
    }
  ];

  return next;
}

export function normalizeDialogueInProject(data: GBAProjectData, key: string): GBAProjectData {
  const dialogues = Array.isArray(data.dialogues) ? data.dialogues : [];
  const index = dialogues.findIndex((dialogue, dialogueIndex) => isRecord(dialogue) && dialogueKey(dialogue, dialogueIndex) === key);
  if (index < 0 || !isRecord(dialogues[index])) return data;

  const sourceDialogue = dialogues[index];
  const nextText = normalizeDialogueText(optionalStringField(sourceDialogue.text));
  const nextChoicePairs = normalizeDialogueChoicePairs(sourceDialogue.choices, sourceDialogue.choiceTranslations);
  const currentText = typeof sourceDialogue.text === "string" ? sourceDialogue.text : "";
  const currentChoices = Array.isArray(sourceDialogue.choices) ? sourceDialogue.choices : null;
  const currentChoiceTranslations = Array.isArray(sourceDialogue.choiceTranslations) ? sourceDialogue.choiceTranslations : null;
  const textChanged = currentText !== nextText;
  const choicesChanged =
    nextChoicePairs !== null &&
    (currentChoices === null ||
      currentChoices.length !== nextChoicePairs.choices.length ||
      currentChoices.some((choice, choiceIndex) => choice !== nextChoicePairs.choices[choiceIndex]));
  const choiceTranslationsChanged =
    nextChoicePairs !== null &&
    (currentChoiceTranslations === null ||
      currentChoiceTranslations.length !== nextChoicePairs.translations.length ||
      currentChoiceTranslations.some((translation, choiceIndex) => translation !== nextChoicePairs.translations[choiceIndex]));

  if (!textChanged && !choicesChanged && !choiceTranslationsChanged) return data;

  const next = cloneProjectData(data);
  const nextDialogues = Array.isArray(next.dialogues) ? next.dialogues : [];
  const dialogue = nextDialogues[index];
  if (!isRecord(dialogue)) return next;
  dialogue.text = nextText;
  if (nextChoicePairs !== null) {
    dialogue.choices = nextChoicePairs.choices;
    dialogue.choiceTranslations = nextChoicePairs.translations;
  }

  return next;
}

export interface DialoguesEditorContext {
  dialogueKey: string;
  character: string;
  choiceCount: number;
  usageCount: number;
  translationLabel: string;
  runtimeCommand: string | null;
  warningCount: number;
}

export interface DialoguesWorkspaceValidationIssue {
  id: string;
  severity: "error" | "warning" | "info";
  message: string;
  dialogueKey?: string;
}

export interface DialogueExportSummary {
  fileName: string;
  key: string;
  character: string;
  choiceCount: number;
  usageCount: number;
  translationLanguageCode: string;
  runtimeCommand: string | null;
  warningCount: number;
  ready: boolean;
}

export function deriveDialoguesEditorContext(
  dialogue: DialoguesWorkspaceDialogue | null
): DialoguesEditorContext | null {
  if (!dialogue) return null;

  const runtimeCommand = dialogue.choiceCount > 0
    ? `show_choice ${dialogue.key}`
    : dialogue.text.trim()
      ? `show_dialogue ${dialogue.key}`
      : null;

  return {
    dialogueKey: dialogue.key,
    character: dialogue.character,
    choiceCount: dialogue.choiceCount,
    usageCount: dialogue.referencedByEvents.length,
    translationLabel: dialogue.translation.trim() ? "Traduzido" : "Pendente",
    runtimeCommand,
    warningCount: dialogue.warnings.length
  };
}

export function deriveDialoguesWorkspaceValidationIssues(
  presentation: DialoguesWorkspacePresentation
): DialoguesWorkspaceValidationIssue[] {
  const issues: DialoguesWorkspaceValidationIssue[] = [];

  for (const dialogue of presentation.dialogues) {
    const sources = [
      [presentation.localization.sourceLocale, dialogue.text],
      ...Object.entries(dialogue.translations),
      ["personagem", dialogue.character],
      ...dialogue.choices.flatMap(choice => [["escolha", choice.label], ...Object.entries(choice.translations)])
    ];
    for (const [sourceIndex, [locale, text]] of sources.entries()) {
      const missing = unsupportedDialogueCharacters(text ?? "");
      if (missing.length) issues.push({
        id: `font-${dialogue.key}-${sourceIndex}-${locale}-${missing.join("")}`,
        severity: "warning", dialogueKey: dialogue.key,
        message: `${dialogue.key} (${locale}): caracteres sem glifo na fonte latina: ${missing.join(" ")}. Serão exibidos como ?.`
      });
    }
    for (const warning of dialogue.warnings) {
      issues.push({
        id: `warning-${dialogue.key}-${warning}`,
        severity: warning.includes("nao encontrado") ? "error" : "warning",
        message: `${dialogue.key}: ${warning}`,
        dialogueKey: dialogue.key
      });
    }

    if (dialogue.referencedByEvents.length === 0) {
      issues.push({
        id: `unused-${dialogue.key}`,
        severity: "warning",
        message: `${dialogue.key} nao esta referenciado por eventos.`,
        dialogueKey: dialogue.key
      });
    }

    const targetLocales = presentation.localization.enabledLocales.filter(
      (locale) => locale !== presentation.localization.sourceLocale
    );
    for (const locale of targetLocales) {
      if (dialogue.text.trim() && !dialogue.translations[locale]?.trim()) {
        issues.push({
          id: `translation-${dialogue.key}-${locale}`,
          severity: "warning",
          message: `${dialogue.key} tem texto sem traducao para ${locale}.`,
          dialogueKey: dialogue.key
        });
      }
      dialogue.choices.forEach((choice, index) => {
        if (choice.label.trim() && !choice.translations[locale]?.trim()) {
          issues.push({
            id: `choice-translation-${dialogue.key}-${locale}-${index}`,
            severity: "warning",
            message: `${dialogue.key} escolha ${index + 1} sem traducao para ${locale}.`,
            dialogueKey: dialogue.key
          });
        }
      });
    }
  }

  if (issues.length === 0 && presentation.dialogues.length > 0) {
    issues.push({
      id: "dialogues-ok",
      severity: "info",
      message: "Biblioteca de dialogos validada sem pendencias."
    });
  }

  return issues;
}

export function deriveDialogueExportSummary(
  dialogue: DialoguesWorkspaceDialogue | null
): DialogueExportSummary | null {
  if (!dialogue) return null;

  const runtimeCommand = dialogue.choiceCount > 0
    ? `show_choice ${dialogue.key}`
    : dialogue.text.trim()
      ? `show_dialogue ${dialogue.key}`
      : null;

  return {
    fileName: `${safeFileStem(dialogue.key, "dialogue")}.dialogue.json`,
    key: dialogue.key,
    character: dialogue.character,
    choiceCount: dialogue.choiceCount,
    usageCount: dialogue.referencedByEvents.length,
    translationLanguageCode: dialogue.translationLanguageCode,
    runtimeCommand,
    warningCount: dialogue.warnings.length,
    ready: dialogue.warnings.length === 0 && Boolean(dialogue.text.trim() || dialogue.choiceCount > 0)
  };
}

export function prepareDialogueExport(data: GBAProjectData, key: string): PreparedDialogueExport | null {
  const presentation = deriveDialoguesWorkspacePresentation(data);
  const dialogue = presentation.dialogues.find((candidate) => candidate.key === key);
  if (!dialogue) return null;

  return {
    fileName: `${safeFileStem(dialogue.key, "dialogue")}.dialogue.json`,
    contents: JSON.stringify(
      {
        kind: "gbastudio.dialogue",
        version: 1,
        dialogue: {
          key: dialogue.key,
          character: dialogue.character,
          portrait: dialogue.portrait,
          portraitSlot: dialogue.portraitSlot,
          emote: dialogue.emote,
          textSound: dialogue.textSound,
          confirmSound: dialogue.confirmSound,
          text: dialogue.text,
          translation: dialogue.translation,
          translationLanguageCode: dialogue.translationLanguageCode,
          choiceTranslations: dialogue.choiceTranslations,
          choices: dialogue.choices.map((choice) => choice.label),
          referencedByEvents: dialogue.referencedByEvents
        }
      },
      null,
      2
    )
  };
}

export function removeDialogueFromProject(data: GBAProjectData, key: string): GBAProjectData {
  const next = cloneProjectData(data);
  const dialogues = Array.isArray(next.dialogues) ? next.dialogues : [];
  next.dialogues = dialogues.filter((dialogue, index) => !isRecord(dialogue) || dialogueKey(dialogue, index) !== key);
  return next;
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  return scenas.length > 0 ? scenas : projectArray(data, "rooms");
}

function projectRoomsKey(data: GBAProjectData): "scenas" | "rooms" {
  return projectArray(data, "scenas").length > 0 ? "scenas" : "rooms";
}

function roomName(room: Record<string, unknown>, index: number): string {
  return stringField(room.name, `room_${index + 1}`);
}

function startRoomName(data: GBAProjectData, rooms: Record<string, unknown>[]): string | null {
  const settings = projectSettings(data);
  const general = isRecord(settings.general) ? settings.general : {};
  return optionalStringField(general.startScene) || optionalStringField(rooms[0]?.name) || null;
}

function uniqueName(baseName: string, existingNames: string[]): string {
  const existing = new Set(existingNames.map((name) => name.toLowerCase()));
  if (!existing.has(baseName.toLowerCase())) return baseName;
  let index = 2;
  while (existing.has(`${baseName}_${index}`.toLowerCase())) {
    index += 1;
  }
  return `${baseName}_${index}`;
}

function slug(value: string, fallback: string): string {
  const cleaned = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
}

function roomEventBindings(room: Record<string, unknown>): Record<string, unknown> {
  return isRecord(room.eventBindings) ? room.eventBindings : {};
}

function eventName(event: Record<string, unknown>, index: number): string {
  return stringField(event.name, stringField(event.id, `event_${index + 1}`));
}

function commandExists(event: Record<string, unknown>, command: string): boolean {
  const commands = [
    optionalStringField(event.command),
    ...(Array.isArray(event.steps)
      ? event.steps.flatMap((step) => isRecord(step) ? [optionalStringField(step.command)] : [])
      : [])
  ];
  return commands.some((candidate) => candidate === command);
}

export function connectDialogueToStartEventInProject(data: GBAProjectData, key: string): GBAProjectData {
  const trimmedKey = key.trim();
  const dialogues = projectArray(data, "dialogues");
  const dialogue = dialogues.find((candidate, index) => dialogueKey(candidate, index) === trimmedKey);
  if (!dialogue) return data;

  const rooms = projectRooms(data);
  const startName = startRoomName(data, rooms);
  const roomIndex = rooms.findIndex((room, index) => roomName(room, index) === startName);
  if (roomIndex < 0) return data;

  const command = Array.isArray(dialogue.choices) && dialogue.choices.length > 0
    ? `show_choice ${trimmedKey}`
    : `show_dialogue ${trimmedKey}`;
  const events = projectArray(data, "events");
  const room = rooms[roomIndex];
  const onInit = optionalStringField(roomEventBindings(room).onInit);
  const existingEventIndex = events.findIndex((event, index) => eventName(event, index) === onInit);

  if (existingEventIndex >= 0) {
    const event = events[existingEventIndex];
    if (commandExists(event, command)) return data;
    const next = cloneProjectData(data);
    const nextEvents = Array.isArray(next.events) ? next.events : [];
    const nextEvent = nextEvents[existingEventIndex];
    if (!isRecord(nextEvent)) return next;
    const steps = Array.isArray(nextEvent.steps) ? nextEvent.steps.filter(isRecord) : [];
    nextEvent.steps = [
      ...steps,
      {
        id: `step-${slug(trimmedKey, "dialogue")}`,
        command,
        isEnabled: true
      }
    ];
    return next;
  }

  const roomNameValue = roomName(room, roomIndex);
  const baseEventName = slug(`${roomNameValue}_${trimmedKey}_dialogue`, "room_dialogue");
  const nextEventName = uniqueName(baseEventName, events.map(eventName));
  const next = cloneProjectData(data);
  const nextRooms = projectArray(next, projectRoomsKey(data));
  const nextRoom = nextRooms[roomIndex];
  if (!nextRoom) return next;
  if (!isRecord(nextRoom.eventBindings)) nextRoom.eventBindings = {};
  (nextRoom.eventBindings as Record<string, unknown>).onInit = nextEventName;
  next.events = [
    ...(Array.isArray(next.events) ? next.events : []),
    {
      id: `event-${nextEventName}`,
      name: nextEventName,
      category: "Dialogo",
      steps: [
        {
          id: `step-${slug(trimmedKey, "dialogue")}`,
          command,
          isEnabled: true
        }
      ]
    }
  ];
  return next;
}
