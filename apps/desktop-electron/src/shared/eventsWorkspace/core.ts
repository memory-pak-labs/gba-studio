import { eventCommandCategory, eventCommandDescription, eventCommandParameterChoices, eventCommandParameterLabel, normalizeEventSearch } from "../eventCommandMetadata.js";
import { constantOperandIndices, projectNumericConstants, resolveProjectConstantCommand } from "../projectConstants.js";
import { eventCommandCatalog, eventCommandLibrary, eventCommandRuntimeVerbs, type EventCommandDefinition } from "../eventCommandLibrary.js";
import { eventCommandIntegrationIssue, eventCommandSupport } from "../eventCommandSupport.js";
import { eventCommandReview } from "../eventCommandReview.js";
import { findMenuSliderScreen } from "../menuSlider.js";
import { runtimeEventGroups, runtimeEventStates, runtimeEventValue, updateRuntimeEventState, menuActorRuntimeState } from "../sceneEventStates.js";
import {
  eventCommandRecipeLibrary,
  eventCommandRecipeRuntimeVerbs,
  type EventCommandRecipeDefinition,
  type EventCommandRecipeStepDefinition
} from "../eventCommandRecipeLibrary.js";
import {
  emptyProjectPluginRegistry,
  type PluginEventCommandDefinition,
  type ProjectPluginRegistry
} from "../gbaStudioPlugins.js";
import { findNextFreeCanvasPosition } from "../canvasWorkspace.js";
import {
  isNativeEventCommandAcceptedByRomExport,
  isNativeEventCommandSupportedInRom,
  nativeEventCommandReferencedEvents
} from "../eventCommandRegistry.js";
import {
  resolveEventBindingCapabilities,
  type EventBindingCapabilityActorRole
} from "../eventBindingCapabilities.js";
import {
  insertEventStructureCommands,
  setEventUpdateFrequency,
  type EventStructureInsertionTarget,
  type EventStructureStep
} from "../eventStructure.js";
import type { GBAProjectData } from "../projectFile.js";
import { sceneRouteTablesFromProject } from "../sceneRouteTables.js";
import {
  normalizeGBAEntityDocument,
  normalizeGBAEventDocument
} from "../../../../../packages/project-contract/src/index.js";
import {
  normalizeEventProcedureDefinition,
  type EventProcedureDefinition
} from "../eventProcedures.js";
import {
  EVENT_GRAPH_NODE_HEIGHT,
  EVENT_GRAPH_NODE_WIDTH,
  GRAPH_LAYOUT_GAP,
  GRAPH_LAYOUT_CONTEXT_X,
  GRAPH_LAYOUT_START_Y,
  GRAPH_LAYOUT_SCRIPT_OFFSET_X,
  graphNodeToRect,
  layoutEventsGraphNodes,
  preferredPositionBesideBinding
} from "./graphLayout.js";

export interface EventsWorkspaceCategoryCount {
  category: string;
  count: number;
}

export interface EventsWorkspaceStep {
  index: number;
  command: string;
  isEnabled: boolean;
  commandVerb: string;
  commandLabel: string;
  commandCategory: string;
  commandSection: string | null;
  commandBadge: string;
  commandRuntimeStatus: EventsWorkspaceCommandRuntimeStatus;
  commandAvailability: string | null;
  commandTemplate: string | null;
  commandPaletteID: string | null;
  commandParameters: EventsWorkspaceCommandParameter[];
  paletteSuggestions: EventsWorkspaceStepPaletteSuggestion[];
  flow: EventsWorkspaceStepFlow;
  missingReferences: string[];
}

export type EventsWorkspaceStepFlowKind = "linear" | "condition" | "condition-dependent" | "else" | "else-dependent" | "choice" | "event-call";

export interface EventsWorkspaceStepFlow {
  kind: EventsWorkspaceStepFlowKind;
  label: string;
  detail: string;
  controlsNextStep: boolean;
  dependsOnStepIndex: number | null;
  targetEventName: string | null;
  choiceIndex: number | null;
  isBranchPoint: boolean;
}

export interface EventsWorkspaceStepPaletteSuggestion {
  id: string;
  label: string;
  command: string;
  category: string;
  badge: string | null;
}

export interface EventsWorkspaceEvent {
  id: string;
  name: string;
  category: string;
  detail: string | null;
  primaryCommand: string;
  steps: EventsWorkspaceStep[];
  stepCount: number;
  enabledStepCount: number;
  referenceCount: number;
  isUnlinked: boolean;
  commandVerbs: string[];
  bindingLabels: string[];
  missingReferences: string[];
  eventKind: "event" | "procedure";
  procedure: EventProcedureDefinition;
}

export interface EventsWorkspaceGroup {
  id: string;
  title: string;
  events: EventsWorkspaceEvent[];
}

export interface EventsWorkspaceGraphEdge {
  id: string;
  sourceEventID: string;
  stepIndex: number;
  sourceEventName: string;
  targetEventName: string;
  commandVerb: string;
  flowKind: EventsWorkspaceStepFlowKind;
  flowLabel: string;
  flowDetail: string;
  guardStepIndex: number | null;
  guardCommand: string | null;
  choiceIndex: number | null;
  isMissingTarget: boolean;
}

export type EventsWorkspaceGraphNodeFlowRole =
  | "isolated"
  | "entry"
  | "linear"
  | "branch-source"
  | "branch-target"
  | "branch-hub";

export type EventsWorkspaceGraphNodeKind = "event" | "context";
export type EventsWorkspaceGraphContextKind = "room" | "actor" | "trigger";

export interface EventsWorkspaceContextBindingSlotDefinition {
  bindingKey: string;
  label: string;
  section: string | null;
  requiresFrequency: boolean;
  groupedBindingKeys?: Array<{
    bindingKey: string;
    label: string;
  }>;
}

export interface EventsWorkspaceContextBindingCapabilityContext {
  sceneType?: string | null;
  runtimeType?: string | null;
  collisionGroup?: number | null;
  actorRole?: EventBindingCapabilityActorRole | null;
}

export interface EventsWorkspaceContextBindingSlotState extends EventsWorkspaceContextBindingSlotDefinition {
  eventName: string | null;
  isMissing: boolean;
  isPending: boolean;
}

export interface EventsWorkspaceGraphNode {
  id: string;
  nodeKind: EventsWorkspaceGraphNodeKind;
  contextKind: EventsWorkspaceGraphContextKind | null;
  contextRole?: EventBindingCapabilityActorRole | null;
  eventName: string;
  targetName: string | null;
  sceneName: string | null;
  contextSubtitle: string | null;
  category: string;
  x: number;
  y: number;
  isUnlinked: boolean;
  missingReferenceCount: number;
  pendingBindingCount: number;
  bindingKeys: string[];
  boundEventNames: string[];
  contextBindingSlots: EventsWorkspaceContextBindingSlotState[];
  incomingEdgeCount: number;
  outgoingEdgeCount: number;
  incomingFlowKinds: EventsWorkspaceStepFlowKind[];
  outgoingFlowKinds: EventsWorkspaceStepFlowKind[];
  flowRole: EventsWorkspaceGraphNodeFlowRole;
  flowLabels: string[];
}

export interface EventsWorkspaceGraphBindingEdge {
  id: string;
  sourceNodeID: string;
  sourceLabel: string;
  targetEventName: string;
  targetEventID: string | null;
  targetNodeID: string | null;
  targetKind: EventsWorkspaceBindingTargetKind;
  targetName: string;
  bindingKey: string;
  label: string;
  isMissingTarget: boolean;
}

export interface EventsWorkspaceGraphConnectTarget {
  eventID: string;
  eventName: string;
  category: string;
}

export interface EventsWorkspaceCommandSuggestion {
  id: string;
  label: string;
  command: string;
  category: string;
  section: string | null;
  targetName: string | null;
  badge: string | null;
  runtimeStatus: EventsWorkspaceCommandRuntimeStatus;
  commandTemplate: string | null;
  parameters: EventsWorkspaceCommandParameter[];
  isFavorite: boolean;
  isRecipe: boolean;
  steps: EventsWorkspaceCommandSuggestionStep[] | null;
  authoringCategories?: EventCommandDefinition["authoringCategories"];
  searchAliases?: string[];
  isExtension?: boolean;
  reference?: EventCommandDefinition["reference"];
  adaptation?: string | null;
}

export interface EventsWorkspaceCommandSuggestionStep {
  command: string;
  category: string;
  detail: string;
}

export type EventsWorkspaceCommandRuntimeStatus = "ok-rom" | "preview-p0" | "preview-runtime" | "unsupported" | "recipe";
export type EventsWorkspaceCommandParameterKind =
  | "actor"
  | "animation"
  | "animationState"
  | "background"
  | "choiceDialogue"
  | "currentRoom"
  | "dialogue"
  | "event"
  | "music"
  | "room"
  | "routeTable"
  | "sfx"
  | "sprite"
  | "variable"
  | "value";

export interface EventsWorkspaceCommandParameter {
  id: string;
  label: string;
  kind: EventsWorkspaceCommandParameterKind;
  tokenIndex: number;
  value: string;
  defaultValue: string;
  placeholder: string | null;
  options: string[];
  isKnownValue: boolean;
}

export type EventsWorkspaceBindingTargetKind = "room" | "actor" | "trigger" | "spriteFrame";

export interface EventsWorkspaceBindingTarget {
  id: string;
  label: string;
  targetKind: EventsWorkspaceBindingTargetKind;
  targetName: string;
  bindingKey: string;
  currentEventName: string | null;
}

export interface EventsWorkspaceSummary {
  eventCount: number;
  stepCount: number;
  enabledStepCount: number;
  unlinkedEventCount: number;
  missingReferenceCount: number;
  graphEdgeCount: number;
  categories: EventsWorkspaceCategoryCount[];
}

export interface EventsWorkspacePresentation {
  groups: EventsWorkspaceGroup[];
  graphNodes: EventsWorkspaceGraphNode[];
  graphEdges: EventsWorkspaceGraphEdge[];
  graphBindingEdges: EventsWorkspaceGraphBindingEdge[];
  graphConnectTargetsBySource: Record<string, EventsWorkspaceGraphConnectTarget[]>;
  commandPalette: EventsWorkspaceCommandSuggestion[];
  bindingTargets: EventsWorkspaceBindingTarget[];
  sceneNames: string[];
  summary: EventsWorkspaceSummary;
}

export interface EventsWorkspaceFilteredGraph {
  graphNodes: EventsWorkspaceGraphNode[];
  graphEdges: EventsWorkspaceGraphEdge[];
  graphBindingEdges: EventsWorkspaceGraphBindingEdge[];
  graphConnectTargetsBySource: Record<string, EventsWorkspaceGraphConnectTarget[]>;
}

export interface EventsWorkspaceValidationIssue {
  id: string;
  severity: "error" | "warning";
  message: string;
  nodeID?: string;
  eventName?: string;
}

export type EventsWorkspaceFilterStatus = "" | "unlinked" | "warnings";
export type EventsCommandMenuTab = "all" | "favorites" | "recipes";

export interface EventsWorkspaceFilterOptions {
  query?: string;
  status?: EventsWorkspaceFilterStatus;
}

export interface EventsCommandSuggestionFilterOptions {
  query?: string;
  tab?: EventsCommandMenuTab;
}

export interface EventsCommandMenuState {
  query: string;
  tab: EventsCommandMenuTab;
}

export interface CreateEventOptions {
  id: string;
  name: string;
  category: string;
}

export interface CreateEventGraphPositionOptions {
  preferred?: { x: number; y: number };
}

export interface DuplicateEventOptions {
  sourceEventID: string;
  newEventID: string;
  newName: string;
}

export interface UpdateEventFields {
  category?: string;
  detail?: string;
  command?: string;
  eventKind?: "event" | "procedure";
  procedure?: EventProcedureDefinition;
}

export interface UpdateEventStepFields {
  command?: string;
  isEnabled?: boolean;
}

export interface PreparedEventExport {
  fileName: string;
  contents: string;
}

export interface UpdateEventGraphNodePosition {
  x: number;
  y: number;
}

export interface BindEventToTargetOptions {
  targetKind: EventsWorkspaceBindingTargetKind;
  targetName: string;
  bindingKey: string;
}

export interface RetargetEventGraphEdgeOptions {
  sourceEventID: string;
  stepIndex: number;
  targetEventName: string;
}

export interface ConnectEventGraphNodesOptions {
  sourceEventID: string;
  targetEventName: string;
}

export interface RemoveEventGraphEdgeOptions {
  sourceEventID: string;
  stepIndex: number;
}

interface EventStep {
  command: string;
  isEnabled: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function nullableString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
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

function projectEditorState(data: GBAProjectData): Record<string, unknown> | undefined {
  return isRecord(data.editorState) ? data.editorState : undefined;
}

function projectSettings(data: GBAProjectData): Record<string, unknown> {
  return isRecord(data.settings) ? data.settings : {};
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const scenas = projectArray(data, "scenas");
  if (scenas.length > 0) return scenas;

  const rooms = projectArray(data, "rooms");
  if (rooms.length > 0) return rooms;

  return [];
}

function normalizedCategory(value: unknown): string {
  return stringField(value, "Custom");
}

function safeFileStem(name: string): string {
  const normalized = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "event";
}

function eventID(event: Record<string, unknown>, index: number): string {
  return normalizeGBAEventDocument(event, index).id;
}

function eventName(event: Record<string, unknown>, index: number): string {
  return normalizeGBAEventDocument(event, index).name;
}

function makeEvent(options: CreateEventOptions): Record<string, unknown> | null {
  const id = options.id.trim();
  const name = options.name.trim();
  const category = options.category.trim() || "Custom";
  if (!id || !name) return null;

  return {
    id,
    name,
    category,
    detail: "",
    command: "noop",
    steps: [{ command: "noop", isEnabled: true }]
  };
}

function normalizedCommand(value: string | undefined, fallback = "noop"): string {
  return value && value.trim().length > 0 ? value.trim() : fallback;
}

function eventIndexByID(events: Record<string, unknown>[], eventIDToFind: string): number {
  return events.findIndex((event, index) => eventID(event, index) === eventIDToFind);
}

function groupTitle(category: string): string {
  switch (category.toLowerCase()) {
    case "ator":
      return "Atores";
    case "trigger":
      return "Triggers";
    case "dialogo":
    case "diálogo":
      return "Dialogos";
    default:
      return category;
  }
}

function groupOrder(category: string): number {
  const normalized = category.toLowerCase();
  const ordered = ["cena", "ator", "trigger", "dialogo", "diálogo", "audio", "controle", "custom"];
  const index = ordered.indexOf(normalized);
  return index >= 0 ? index : ordered.length;
}

function eventSteps(event: Record<string, unknown>): EventStep[] {
  return normalizeGBAEventDocument(event).steps.map(({ command, isEnabled }) => ({ command, isEnabled }));
}

const conditionCommandVerbs = new Set([
  "has_item",
  "if_actor_at_position",
  "if_actor_direction",
  "if_actor_distance",
  "if_actor_relative",
  "if_button",
  "if_engine_field",
  "if_engine_field_variable",
  "if_flag",
  "if_save_game",
  "if_scene",
  "if_variable",
  "if_variable_greater_than",
  "if_variable_less_than",
  "if_variable_variable"
]);

function emptyStepFlow(): EventsWorkspaceStepFlow {
  return {
    kind: "linear",
    label: "Sequencial",
    detail: "Executa na ordem do evento.",
    controlsNextStep: false,
    dependsOnStepIndex: null,
    targetEventName: null,
    choiceIndex: null,
    isBranchPoint: false
  };
}

function commandTargetEventName(command: string): string | null {
  const parts = commandParts(command);
  const verb = parts[0] ?? "noop";
  if (verb === "call_event" || verb === "call_procedure") return parts[1] ?? null;
  if (verb === "choice_event") return parts[3] ?? null;
  return null;
}

function commandChoiceIndex(command: string): number | null {
  const parts = commandParts(command);
  if ((parts[0] ?? "noop") !== "choice_event") return null;
  const parsed = Number(parts[2]);
  return Number.isFinite(parsed) ? parsed : null;
}

function stepIsInElseBody(steps: EventStep[], index: number): boolean {
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    const verb = commandVerb(steps[cursor].command);
    if (verb === "else") return true;
    if (conditionCommandVerbs.has(verb)) return false;
  }
  return false;
}

function stepFlow(command: string, index: number, steps: EventStep[]): EventsWorkspaceStepFlow {
  const parts = commandParts(command);
  const verb = parts[0] ?? "noop";
  const targetEventName = commandTargetEventName(command);
  const previousStep = index > 0 ? steps[index - 1] : null;

  if (verb === "choice_event") {
    const choiceIndex = commandChoiceIndex(command);
    return {
      kind: "choice",
      label: choiceIndex === null ? "Escolha" : `Escolha ${choiceIndex + 1}`,
      detail: `Quando ${parts[1] ?? "dialogo"} escolher a opcao ${choiceIndex === null ? "-" : choiceIndex + 1}, chama ${targetEventName ?? "-"}.`,
      controlsNextStep: false,
      dependsOnStepIndex: null,
      targetEventName,
      choiceIndex,
      isBranchPoint: true
    };
  }

  if (conditionCommandVerbs.has(verb)) {
    return {
      kind: "condition",
      label: "Condicao",
      detail: `Se ${command} for verdadeiro, executa o bloco ate "else"; senao pula para o ramo apos "else".`,
      controlsNextStep: true,
      dependsOnStepIndex: null,
      targetEventName,
      choiceIndex: null,
      isBranchPoint: true
    };
  }

  if (verb === "else") {
    return {
      kind: "else",
      label: "Senao",
      detail: "Inicia o ramo falso do bloco condicional acima.",
      controlsNextStep: false,
      dependsOnStepIndex: null,
      targetEventName,
      choiceIndex: null,
      isBranchPoint: true
    };
  }

  if (previousStep && commandVerb(previousStep.command) === "else") {
    return {
      kind: "else-dependent",
      label: "Ramo falso",
      detail: `Executa somente quando a condicao acima for falsa.`,
      controlsNextStep: false,
      dependsOnStepIndex: index - 1,
      targetEventName,
      choiceIndex: null,
      isBranchPoint: targetEventName !== null
    };
  }

  if (stepIsInElseBody(steps, index) && !conditionCommandVerbs.has(verb) && verb !== "else") {
    return {
      kind: "else-dependent",
      label: "Ramo falso",
      detail: `Continua o bloco falso iniciado em "else".`,
      controlsNextStep: false,
      dependsOnStepIndex: index - 1,
      targetEventName,
      choiceIndex: null,
      isBranchPoint: targetEventName !== null
    };
  }

  if (previousStep && conditionCommandVerbs.has(commandVerb(previousStep.command))) {
    return {
      kind: "condition-dependent",
      label: `Depende do passo ${index}`,
      detail: `Executa somente quando ${previousStep.command} for verdadeiro.`,
      controlsNextStep: false,
      dependsOnStepIndex: index - 1,
      targetEventName,
      choiceIndex: null,
      isBranchPoint: targetEventName !== null
    };
  }

  if (targetEventName) {
    return {
      kind: "event-call",
      label: "Chama evento",
      detail: `Chama ${targetEventName}.`,
      controlsNextStep: false,
      dependsOnStepIndex: null,
      targetEventName,
      choiceIndex: null,
      isBranchPoint: true
    };
  }

  return emptyStepFlow();
}

function workspaceSteps(
  event: Record<string, unknown>,
  data: GBAProjectData,
  eventNames: Set<string>,
  palette: EventsWorkspaceCommandSuggestion[],
  resourceOptions: EventCommandResourceOptions
): EventsWorkspaceStep[] {
  const steps = eventSteps(event);
  return steps.map((step, index) => {
    const insight = commandInsightForStep(step.command, palette, resourceOptions);
    return {
      index,
      command: step.command,
      isEnabled: step.isEnabled,
      commandVerb: insight.commandVerb,
      commandLabel: insight.commandLabel,
      commandCategory: insight.commandCategory,
      commandSection: insight.commandSection,
      commandBadge: insight.commandBadge,
      commandRuntimeStatus: insight.commandRuntimeStatus,
      commandAvailability: insight.commandAvailability,
      commandTemplate: insight.commandTemplate,
      commandPaletteID: insight.commandPaletteID,
      commandParameters: insight.commandParameters,
      paletteSuggestions: insight.paletteSuggestions,
      flow: stepFlow(step.command, index, steps),
      missingReferences: step.isEnabled ? missingResourceReferences(step.command, data, eventNames) : []
    };
  });
}

function commandVerb(command: string): string {
  return command.split(/\s+/).filter(Boolean)[0] ?? "noop";
}

function commandParts(command: string): string[] {
  const parts = command.split(/\s+/).filter(Boolean);
  if(parts[0] === "draw_text" && parts.length>4) return [...parts.slice(0,4),parts.slice(4).join(" ")];
  return parts[0] === "set_background" && parts.length > 1 ? [parts[0], parts.slice(1).join(" ")] : parts;
}

interface EventCommandResourceOptions {
  actor: string[];
  animation: string[];
  animationState: string[];
  background: string[];
  choiceDialogue: string[];
  currentRoom: string[];
  dialogue: string[];
  event: string[];
  music: string[];
  room: string[];
  routeTable: string[];
  sfx: string[];
  sprite: string[];
  variable: string[];
  constant?: string[];
}

const commandParameterLabels: Record<EventsWorkspaceCommandParameterKind, string> = {
  actor: "Ator",
  animation: "Animacao",
  animationState: "Estado de animação",
  background: "Fundo",
  choiceDialogue: "Dialogo de escolha",
  currentRoom: "Cena atual",
  dialogue: "Dialogo",
  event: "Evento",
  music: "Musica",
  room: "Cena",
  routeTable: "Tabela de rotas",
  sfx: "SFX",
  sprite: "Sprite",
  variable: "Variavel",
  value: "Valor"
};

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.trim().length > 0)));
}

function commandRuntimeStatus(command: string, pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()): EventsWorkspaceCommandRuntimeStatus {
  const verb = commandVerb(command);
  const pluginStatus = pluginRegistry.commandRuntimeStatusByVerb.get(verb);
  if (pluginStatus) return pluginStatus;
  if (["comment", "group"].includes(verb)) return "preview-p0";
  if (isNativeEventCommandSupportedInRom(verb)) return "ok-rom";
  if (["pending", "not-applicable"].includes(eventCommandSupport(verb).status)) return "unsupported";
  if (eventCommandRuntimeVerbs.has(verb) || eventCommandRecipeRuntimeVerbs.has(verb)) return "preview-runtime";
  return "unsupported";
}

function commandBadgeForRuntimeStatus(status: EventsWorkspaceCommandRuntimeStatus): string {
  if (status === "ok-rom") return "OK ROM";
  if (status === "preview-p0") return "Somente editor";
  if (status === "preview-runtime") return "Não exporta ROM";
  if (status === "recipe") return "Modelo de script";
  return "Ainda sem runtime Electron";
}

function commandParameterKind(placeholder: string | null): EventsWorkspaceCommandParameterKind {
  if (placeholder === "stage") return "room";
  if (
    placeholder === "actor" ||
    placeholder === "animation" || placeholder === "animationState" ||
    placeholder === "background" ||
    placeholder === "choiceDialogue" ||
    placeholder === "currentRoom" ||
    placeholder === "dialogue" ||
    placeholder === "event" ||
    placeholder === "music" ||
    placeholder === "room" ||
    placeholder === "routeTable" ||
    placeholder === "sfx" ||
    placeholder === "sprite" ||
    placeholder === "variable"
  ) {
    return placeholder;
  }
  return "value";
}

function commandParameterLabel(kind: EventsWorkspaceCommandParameterKind, tokenIndex: number, placeholder: string | null): string {
  if (placeholder) return commandParameterLabels[kind];
  return tokenIndex === 1 ? "Alvo" : `Argumento ${tokenIndex}`;
}

function commandParameterOptions(kind: EventsWorkspaceCommandParameterKind, options: EventCommandResourceOptions): string[] {
  if (kind === "value") return [];
  return options[kind];
}

function commandParameterPlaceholder(templatePart: string | undefined): string | null {
  const match = templatePart ? /^\{([a-zA-Z_]+)\}$/.exec(templatePart) : null;
  return match?.[1] ?? null;
}

function commandParametersForCommand(
  command: string,
  commandTemplate: string | null,
  options: EventCommandResourceOptions
): EventsWorkspaceCommandParameter[] {
  const parts = commandParts(command);
  const templateParts = commandTemplate ? commandParts(commandTemplate) : [];
  const parameterCount = Math.max(parts.length, templateParts.length) - 1;
  if (parameterCount <= 0) return [];

  const seenIDs = new Map<string, number>();
  return Array.from({ length: parameterCount }, (_item, parameterIndex) => {
    const tokenIndex = parameterIndex + 1;
    const templatePart = templateParts[tokenIndex];
    const placeholder = commandParameterPlaceholder(templatePart);
    const kind = commandParameterKind(placeholder);
    const baseID = placeholder ?? `arg${tokenIndex}`;
    const occurrence = seenIDs.get(baseID) ?? 0;
    seenIDs.set(baseID, occurrence + 1);
    const id = occurrence === 0 ? baseID : `${baseID}${occurrence + 1}`;
    const value = parts[tokenIndex] ?? "";
    const defaultValue = placeholder ? "" : templatePart ?? "";
    const parameterOptions = eventCommandParameterChoices(parts[0] ?? "", tokenIndex) ?? (constantOperandIndices(parts[0] ?? "").includes(tokenIndex)
      ? options.constant ?? [] : commandParameterOptions(kind, options));
    return {
      id,
      label: eventCommandParameterLabel(parts[0] ?? "", tokenIndex, commandParameterLabel(kind, tokenIndex, placeholder)),
      kind,
      tokenIndex,
      value,
      defaultValue,
      placeholder,
      options: parameterOptions,
      isKnownValue: (constantOperandIndices(parts[0] ?? "").includes(tokenIndex) && value.trim() !== "" && Number.isFinite(Number(value))) || parameterOptions.length === 0 || parameterOptions.includes(value)
    };
  });
}

function replaceCommandPart(command: unknown, index: number, oldName: string, nextName: string): unknown {
  if (typeof command !== "string") return command;
  const parts = commandParts(command);
  if (parts[index] !== oldName) return command;
  parts[index] = nextName;
  return parts.join(" ");
}

function renameEventCommandReference(command: unknown, oldName: string, nextName: string): unknown {
  if (typeof command !== "string") return command;
  const verb = commandParts(command)[0] ?? "noop";
  if (["call_event", "call_procedure", "lock_script", "unlock_script", "timer_restart", "timer_remove"].includes(verb)) {
    return replaceCommandPart(command, 1, oldName, nextName);
  }

  if (verb === "choice_event") {
    return replaceCommandPart(command, 3, oldName, nextName);
  }

  if (verb === "attach_button" || verb === "timer_attach") {
    return replaceCommandPart(command, 2, oldName, nextName);
  }

  return command;
}

function eventReferencePartIndex(command: unknown): number | null {
  if (typeof command !== "string") return null;
  const verb = commandParts(command)[0] ?? "noop";
  if (["call_event", "call_procedure", "lock_script", "unlock_script", "timer_restart", "timer_remove"].includes(verb)) {
    return 1;
  }

  if (verb === "choice_event") {
    return 3;
  }

  if (verb === "attach_button" || verb === "timer_attach") {
    return 2;
  }

  return null;
}

function retargetEventCommandReference(command: unknown, nextName: string): string | null {
  if (typeof command !== "string") return null;
  const referenceIndex = eventReferencePartIndex(command);
  if (referenceIndex === null) return null;

  const parts = commandParts(command);
  if (!parts[referenceIndex]) return null;

  parts[referenceIndex] = nextName;
  return parts.join(" ");
}

function renameEventBindings(value: unknown, oldName: string, nextName: string): void {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (value[key] === oldName) {
      value[key] = nextName;
    }
  }
}

function clearEventBindings(value: unknown, eventNameToRemove: string): void {
  if (!isRecord(value)) return;
  for (const key of Object.keys(value)) {
    if (value[key] === eventNameToRemove) {
      delete value[key];
    }
  }
}

function renameEventReferences(data: GBAProjectData, oldName: string, nextName: string): void {
  for (const room of [...projectArray(data, "rooms"), ...projectArray(data, "scenas")]) {
    for (const state of runtimeEventStates(room)) {
      if (state.eventName === oldName) Object.assign(room, updateRuntimeEventState(room, state.bindingKey, "eventName", nextName));
    }
  }
  for (const room of [...projectArray(data, "rooms"), ...projectArray(data, "scenas"), ...projectArray(data, "actors"), ...projectArray(data, "triggers")]) {
    for (const key of ["eventName", "onLeaveEventName", "onEnterEventName"]) {
      if (room[key] === oldName) {
        room[key] = nextName;
      }
    }
    renameEventBindings(room.eventBindings, oldName, nextName);
  }

  const editorState = isRecord(data.editorState) ? data.editorState : undefined;
  const connections = editorState && Array.isArray(editorState.scenaConnections) ? editorState.scenaConnections.filter(isRecord) : [];
  for (const connection of connections) {
    for (const key of ["eventName", "onExitEventName", "onEnterEventName"]) {
      if (connection[key] === oldName) {
        connection[key] = nextName;
      }
    }
  }

  for (const event of projectArray(data, "events")) {
    event.command = renameEventCommandReference(event.command, oldName, nextName);
    if (!Array.isArray(event.steps)) continue;
    event.steps = event.steps.map((step) => {
      if (!isRecord(step)) return step;
      return {
        ...step,
        command: renameEventCommandReference(step.command, oldName, nextName)
      };
    });
  }

  for (const animation of projectArray(data, "animations")) {
    const frameCount = typeof animation.frameCount === "number" && Number.isFinite(animation.frameCount) && animation.frameCount > 0
      ? Math.floor(animation.frameCount)
      : 1;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (spriteFrameEventName(animation.frameEvents, frameIndex) === oldName) {
        setSpriteFrameEventName(animation, frameIndex, nextName);
      }
    }
  }
}

function clearDirectEventReferences(data: GBAProjectData, eventNameToRemove: string): void {
  for (const room of [...projectArray(data, "rooms"), ...projectArray(data, "scenas")]) {
    for (const state of runtimeEventStates(room)) {
      if (state.eventName === eventNameToRemove) Object.assign(room, updateRuntimeEventState(room, state.bindingKey, "eventName", ""));
    }
  }
  for (const room of [...projectArray(data, "rooms"), ...projectArray(data, "scenas"), ...projectArray(data, "actors"), ...projectArray(data, "triggers")]) {
    for (const key of ["eventName", "onLeaveEventName", "onEnterEventName"]) {
      if (room[key] === eventNameToRemove) {
        delete room[key];
      }
    }
    clearEventBindings(room.eventBindings, eventNameToRemove);
  }

  const editorState = isRecord(data.editorState) ? data.editorState : undefined;
  if (editorState && Array.isArray(editorState.scenaConnections)) {
    editorState.scenaConnections = editorState.scenaConnections.filter((connection) => {
      if (!isRecord(connection)) return true;
      return !["eventName", "onExitEventName", "onEnterEventName"].some((key) => connection[key] === eventNameToRemove);
    });
  }

  for (const animation of projectArray(data, "animations")) {
    const frameCount = typeof animation.frameCount === "number" && Number.isFinite(animation.frameCount) && animation.frameCount > 0
      ? Math.floor(animation.frameCount)
      : 1;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      if (spriteFrameEventName(animation.frameEvents, frameIndex) === eventNameToRemove) {
        setSpriteFrameEventName(animation, frameIndex, null);
      }
    }
  }
}

function addEventBindingNames(value: unknown, output: string[]): void {
  if (!isRecord(value)) return;

  for (const fieldValue of Object.values(value)) {
    if (typeof fieldValue === "string" && fieldValue.trim().length > 0) {
      output.push(fieldValue.trim());
    }
  }
}

function addEventBindingLabels(
  value: unknown,
  prefix: string,
  output: Map<string, string[]>
): void {
  if (!isRecord(value)) return;

  for (const [key, fieldValue] of Object.entries(value)) {
    if (typeof fieldValue !== "string" || fieldValue.trim().length === 0) continue;
    const eventNameToLabel = fieldValue.trim();
    const labels = output.get(eventNameToLabel) ?? [];
    labels.push(`${prefix} · ${key}`);
    output.set(eventNameToLabel, labels);
  }
}

function addDirectEventLabel(
  value: unknown,
  label: string,
  output: Map<string, string[]>
): void {
  if (typeof value !== "string" || value.trim().length === 0) return;
  const eventNameToLabel = value.trim();
  const labels = output.get(eventNameToLabel) ?? [];
  labels.push(label);
  output.set(eventNameToLabel, labels);
}

function spriteFrameEventName(frameEvents: unknown, frameIndex: number): string | null {
  if (!Array.isArray(frameEvents)) return null;
  const events = Array.isArray(frameEvents[frameIndex]) ? frameEvents[frameIndex].filter(isRecord) : [];
  return events
    .map((event) => ({ type: nullableString(event.type), value: nullableString(event.value) }))
    .find((event) => event.type === "event" && event.value)?.value ?? null;
}

function setSpriteFrameEventName(animation: Record<string, unknown>, frameIndex: number, eventNameToSet: string | null): void {
  const frameCount = typeof animation.frameCount === "number" && Number.isFinite(animation.frameCount) && animation.frameCount > 0
    ? Math.floor(animation.frameCount)
    : 1;
  const source = Array.isArray(animation.frameEvents) ? animation.frameEvents : [];
  const frameEvents = Array.from({ length: frameCount }, (_, index) => (
    Array.isArray(source[index]) ? source[index].filter(isRecord) : []
  ));
  const otherEvents = frameEvents[frameIndex].filter((event) => nullableString(event.type) !== "event");
  frameEvents[frameIndex] = eventNameToSet ? [{ type: "event", value: eventNameToSet }, ...otherEvents] : otherEvents;
  animation.frameEvents = frameEvents;
}

function menuRuntimeItems(room: Record<string, unknown>): Record<string, unknown>[] {
  const runtime = isRecord(room.runtime) ? room.runtime : undefined;
  if (!runtime) return [];
  const config = isRecord(runtime.config) ? runtime.config : undefined;
  if (!config) return [];
  const runtimeType = nullableString(runtime.type);
  if (runtimeType === "worldMap") {
    const nodes = Array.isArray(config.nodes) ? config.nodes.filter(isRecord) : [];
    return nodes.map((node) => ({
      label: stringField(node.name, stringField(node.id, "Nó do mapa")),
      eventName: node.eventName
    }));
  }
  if (runtimeType === "cutscene") {
    const steps = Array.isArray(config.steps) ? config.steps.filter(isRecord) : [];
    return steps.flatMap((step) => {
      const label = stringField(step.id, "Etapa da cutscene");
      return [
        { label, eventName: step.eventName },
        { label: `${label} (pular)`, eventName: step.onSkipEventName }
      ];
    });
  }
  if (runtimeType !== "menu") return [];
  const rootItems = Array.isArray(config.items) ? config.items.filter(isRecord) : [];
  const internalScreens = Array.isArray(config.screens) ? config.screens.filter(isRecord) : [];
  const internalItems = internalScreens.flatMap((screen) => {
    const items = Array.isArray(screen.items) ? screen.items.filter(isRecord) : [];
    const onEnterEventName = nullableString(screen.onEnterEventName);
    const onBackEventName = nullableString(screen.onBackEventName);
    const screenBindings = [
      ...(onEnterEventName ? [{ label: stringField(screen.title, stringField(screen.id, "Tela interna")), eventName: onEnterEventName }] : []),
      ...(onBackEventName ? [{ label: `${stringField(screen.title, stringField(screen.id, "Tela interna"))} · voltar`, eventName: onBackEventName }] : [])
    ];
    return [...screenBindings, ...items];
  });
  const rootBackEventName = !internalScreens.length ? nullableString(config.onBackEventName) : null;
  return [
    ...rootItems,
    ...(rootBackEventName ? [{ label: "Menu · voltar", eventName: rootBackEventName }] : []),
    ...internalItems
  ];
}

function bindingLabelsByEventName(data: GBAProjectData): Map<string, string[]> {
  const labels = new Map<string, string[]>();
  for (const room of projectRooms(data)) {
    const roomName = stringField(room.name, "Cena sem nome");
    addEventBindingLabels(room.eventBindings, `Cena: ${roomName}`, labels);
    for (const item of menuRuntimeItems(room)) {
      const itemLabel = stringField(item.label, "Item sem nome");
      addDirectEventLabel(item.eventName, `Cena: ${roomName} · Menu: ${itemLabel}`, labels);
    }
  }

  for (const actor of projectArray(data, "actors")) {
    const actorName = stringField(actor.name, "Ator sem nome");
    addDirectEventLabel(actor.eventName, `Ator: ${actorName} · eventName`, labels);
    addEventBindingLabels(actor.eventBindings, `Ator: ${actorName}`, labels);
  }

  for (const trigger of projectArray(data, "triggers")) {
    const triggerName = stringField(trigger.name, "Trigger sem nome");
    for (const key of ["eventName", "onLeaveEventName", "onEnterEventName"]) {
      addDirectEventLabel(trigger[key], `Trigger: ${triggerName} · ${key}`, labels);
    }
    addEventBindingLabels(trigger.eventBindings, `Trigger: ${triggerName}`, labels);
  }

  const editorState = isRecord(data.editorState) ? data.editorState : undefined;
  const connections = editorState && Array.isArray(editorState.scenaConnections) ? editorState.scenaConnections.filter(isRecord) : [];
  for (const connection of connections) {
    const from = stringField(connection.from, "origem");
    const to = stringField(connection.to, "destino");
    for (const key of ["eventName", "onExitEventName", "onEnterEventName"]) {
      addDirectEventLabel(connection[key], `Conexao: ${from} -> ${to} · ${key}`, labels);
    }
  }

  for (const animation of projectArray(data, "animations")) {
    const animationName = stringField(animation.name, "Animacao sem nome");
    const frameCount = typeof animation.frameCount === "number" && Number.isFinite(animation.frameCount) && animation.frameCount > 0
      ? Math.floor(animation.frameCount)
      : 1;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      addDirectEventLabel(spriteFrameEventName(animation.frameEvents, frameIndex), `Sprite: ${animationName} · Frame ${frameIndex + 1}`, labels);
    }
  }

  return labels;
}

function bindingValue(target: Record<string, unknown>, bindingKey: string): string | null {
  const bindings = isRecord(target.eventBindings) ? target.eventBindings : {};
  return nullableString(bindings[bindingKey]);
}

export function deriveContextBindingSlots(
  contextKind: EventsWorkspaceGraphContextKind,
  entity?: Record<string, unknown>,
  context: EventsWorkspaceContextBindingCapabilityContext = {}
): EventsWorkspaceContextBindingSlotDefinition[] {
  const runtime = entity && isRecord(entity.runtime) ? entity.runtime : {};
  const menuActorRole = contextKind === "actor" ? nullableString(entity?.menuActorRole) : null;
  const menuItemID = contextKind === "actor" ? nullableString(entity?.menuItemID) : null;
  const isMenuVisualActor = Boolean(menuActorRole || menuItemID);
  const slots = resolveEventBindingCapabilities({
    targetKind: contextKind,
    actorRole: context.actorRole,
    sceneType: context.sceneType ?? nullableString(entity?.sceneType),
    runtimeType: context.runtimeType ?? (isMenuVisualActor ? "menu" : nullableString(runtime.type)),
    collisionGroup: context.collisionGroup ?? (
      typeof entity?.collisionGroup === "number" && Number.isFinite(entity.collisionGroup)
        ? entity.collisionGroup
        : null
    ),
    menuActorRole,
    menuItemID
  });
  if (contextKind === "room") return [...slots, ...runtimeEventGroups(entity)];
  if (contextKind === "trigger" && !slots.some((slot) => slot.bindingKey === "onInteract") && (bindingValue(entity ?? {}, "onInteract") || entity?.onInteractEventName)) {
    return [...slots, { bindingKey: "onInteract", label: "Ao interagir", section: null, requiresFrequency: false }];
  }
  return slots;
}

function resolveEntityBindingSlotValue(
  entity: Record<string, unknown>,
  contextKind: EventsWorkspaceGraphContextKind,
  bindingKey: string
): string | null {
  if (contextKind === "room" && bindingKey.startsWith("runtime:/")) return runtimeEventValue(entity, bindingKey);
  if (contextKind === "actor" && bindingKey === "onInit") {
    return bindingValue(entity, "onInit");
  }

  if (contextKind === "actor" && bindingKey === "onInteract") {
    return bindingValue(entity, "onInteract") ?? nullableString(entity.eventName);
  }

  if (contextKind === "trigger" && bindingKey === "onEnter") {
    return bindingValue(entity, "onEnter")
      ?? nullableString(entity.onEnterEventName)
      ?? nullableString(entity.eventName);
  }

  if (contextKind === "trigger" && bindingKey === "onInteract") {
    return bindingValue(entity, "onInteract")
      ?? nullableString(entity.onInteractEventName);
  }

  if (contextKind === "trigger" && bindingKey === "onLeave") {
    return bindingValue(entity, "onLeave") ?? nullableString(entity.onLeaveEventName);
  }

  return bindingValue(entity, bindingKey);
}

export function deriveContextBindingSlotStates(
  entity: Record<string, unknown>,
  contextKind: EventsWorkspaceGraphContextKind,
  eventNames: Set<string>,
  context?: EventsWorkspaceContextBindingCapabilityContext
): EventsWorkspaceContextBindingSlotState[] {
  return deriveContextBindingSlots(contextKind, entity, context).map((slot) => {
    const eventName = resolveEntityBindingSlotValue(entity, contextKind, slot.bindingKey);
    return {
      ...slot,
      eventName,
      isMissing: Boolean(eventName && !eventNames.has(eventName)),
      isPending: !eventName
    };
  });
}

function materializeContextBindingSlotStates(
  entity: Record<string, unknown>,
  contextKind: EventsWorkspaceGraphContextKind,
  eventNames: Set<string>,
  context?: EventsWorkspaceContextBindingCapabilityContext
): EventsWorkspaceContextBindingSlotState[] {
  return deriveContextBindingSlotStates(entity, contextKind, eventNames, context).flatMap((slot) => {
    if (!slot.groupedBindingKeys?.length) return [slot];
    return slot.groupedBindingKeys.map((group) => {
      const eventName = resolveEntityBindingSlotValue(entity, contextKind, group.bindingKey);
      return {
        bindingKey: group.bindingKey,
        label: `${slot.label} · ${group.label}`,
        section: slot.section,
        requiresFrequency: false,
        eventName,
        isMissing: Boolean(eventName && !eventNames.has(eventName)),
        isPending: !eventName
      };
    });
  });
}

function activeSceneName(data: GBAProjectData): string | null {
  const editorState = projectEditorState(data);
  const active = nullableString(editorState?.activeScena) ?? nullableString(editorState?.activeRoom);
  if (active) return active;

  const settings = projectSettings(data);
  const general = isRecord(settings.general) ? settings.general : {};
  return nullableString(general.startScene);
}

function contextSubtitleForEntity(
  data: GBAProjectData,
  contextKind: EventsWorkspaceGraphContextKind,
  entity: Record<string, unknown>,
  targetName: string,
  sceneName: string | null,
  pendingBindingCount: number,
  contextRole: EventBindingCapabilityActorRole | null = null
): string {
  const pendingLabel = `${pendingBindingCount} pendente${pendingBindingCount === 1 ? "" : "s"}`;
  if (contextKind === "room") {
    const activeScene = activeSceneName(data);
    const sceneLabel = activeScene === targetName ? "Cena ativa" : (sceneName ?? "Cena");
    return `Cena · ${sceneLabel} · ${pendingLabel}`;
  }

  if (contextKind === "actor") {
    const group = nullableString(entity.collisionGroup) ?? nullableString(entity.group);
    const groupLabel = group ? `Grupo ${group}` : "Sem grupo";
    const actorLabel = contextRole === "player" ? "Player" : "Ator";
    return `${actorLabel} · ${sceneName ?? "Sem cena"} · ${groupLabel} · ${pendingLabel}`;
  }

  return `Trigger · ${sceneName ?? "Sem cena"} · ${pendingLabel}`;
}

function actorWithRuntimeBinding(data: GBAProjectData, actor: Record<string, unknown>): Record<string, unknown> {
  const scene = projectRooms(data).find((room) => room.name === entityRoomName(actor, projectRooms(data)));
  const state = menuActorRuntimeState(scene, actor);
  if (!state) return actor;
  return { ...actor, eventBindings: { ...(isRecord(actor.eventBindings) ? actor.eventBindings : {}), onInteract: state.eventName ?? "" }, eventName: "" };
}

function canonicalBindingEntries(
  entity: Record<string, unknown>,
  contextKind: EventsWorkspaceGraphContextKind,
  context: EventsWorkspaceContextBindingCapabilityContext = {}
): Array<{ bindingKey: string; eventName: string }> {
  return materializeContextBindingSlotStates(entity, contextKind, new Set(), context)
    .filter((slot): slot is EventsWorkspaceContextBindingSlotState & { eventName: string } => Boolean(slot.eventName))
    .map((slot) => ({ bindingKey: slot.bindingKey, eventName: slot.eventName }));
}

function bindingTarget(
  targetKind: EventsWorkspaceBindingTargetKind,
  targetName: string,
  bindingKey: string,
  labelPrefix: string,
  currentEventName: string | null
): EventsWorkspaceBindingTarget {
  return {
    id: `${targetKind}:${targetName}:${bindingKey}`,
    label: `${labelPrefix} ${targetName} · ${bindingKey}`,
    targetKind,
    targetName,
    bindingKey,
    currentEventName
  };
}

function quickBindingTargets(data: GBAProjectData): EventsWorkspaceBindingTarget[] {
  const rooms = projectRooms(data);
  const roomTargets = rooms.flatMap((room) => {
    const name = nullableString(room.name);
    if (!name) return [];
    return deriveContextBindingSlots("room", room).flatMap((slot) => {
      const bindings = slot.groupedBindingKeys?.length
        ? slot.groupedBindingKeys.map((group) => ({ bindingKey: group.bindingKey, label: `${slot.label} · ${group.label}` }))
        : [{ bindingKey: slot.bindingKey, label: slot.label }];
      return bindings.map((binding) => bindingTarget(
        "room",
        name,
        binding.bindingKey,
        "Cena",
        resolveEntityBindingSlotValue(room, "room", binding.bindingKey)
      ));
    });
  });

  const actorTargets = projectArray(data, "actors").flatMap((actor) => {
    const name = nullableString(actor.name);
    if (!name) return [];
    const actorRole = actorRoleForEntity(actor, rooms);
    return deriveContextBindingSlots("actor", actor, { actorRole }).map((slot) => bindingTarget(
        "actor",
        name,
        slot.bindingKey,
        actorRole === "player" ? "Player" : "Ator",
        resolveEntityBindingSlotValue(actorWithRuntimeBinding(data, actor), "actor", slot.bindingKey)
      ));
  });

  const triggerTargets = projectArray(data, "triggers").flatMap((trigger) => {
    const name = nullableString(trigger.name);
    if (!name) return [];
    return [
      ...deriveContextBindingSlots("trigger", trigger).map((slot) => bindingTarget(
        "trigger",
        name,
        slot.bindingKey,
        "Trigger",
        resolveEntityBindingSlotValue(trigger, "trigger", slot.bindingKey)
      )),
      bindingTarget("trigger", name, "eventName", "Trigger", nullableString(trigger.eventName))
    ];
  });

  const spriteFrameTargets = projectArray(data, "animations")
    .flatMap((animation, animationIndex) => {
      const animationID = nullableString(animation.id) ?? `animation-${animationIndex + 1}`;
      const name = nullableString(animation.name) ?? `Animacao ${animationIndex + 1}`;
      const frameCount = typeof animation.frameCount === "number" && Number.isFinite(animation.frameCount) && animation.frameCount > 0
        ? Math.floor(animation.frameCount)
        : 1;
      return Array.from({ length: frameCount }, (_, frameIndex) => ({
        id: `spriteFrame:${animationID}:${frameIndex}`,
        label: `Sprite ${name} · Frame ${frameIndex + 1}`,
        targetKind: "spriteFrame" as const,
        targetName: name,
        bindingKey: `frame:${frameIndex}`,
        currentEventName: spriteFrameEventName(animation.frameEvents, frameIndex)
      }));
    });

  return [...roomTargets, ...actorTargets, ...triggerTargets, ...spriteFrameTargets];
}

function boundEventNames(data: GBAProjectData): string[] {
  const names: string[] = [];
  for (const room of projectRooms(data)) {
    addEventBindingNames(room.eventBindings, names);
    for (const item of menuRuntimeItems(room)) {
      const eventName = nullableString(item.eventName);
      if (eventName) names.push(eventName);
    }
  }

  for (const actor of projectArray(data, "actors")) {
    const eventName = nullableString(actor.eventName);
    if (eventName) names.push(eventName);
    addEventBindingNames(actor.eventBindings, names);
  }

  for (const trigger of projectArray(data, "triggers")) {
    for (const key of ["eventName", "onLeaveEventName", "onEnterEventName"]) {
      const eventName = nullableString(trigger[key]);
      if (eventName) names.push(eventName);
    }
    addEventBindingNames(trigger.eventBindings, names);
  }

  const editorState = isRecord(data.editorState) ? data.editorState : undefined;
  const connections = editorState && Array.isArray(editorState.scenaConnections) ? editorState.scenaConnections.filter(isRecord) : [];
  for (const connection of connections) {
    for (const key of ["eventName", "onExitEventName", "onEnterEventName"]) {
      const eventName = nullableString(connection[key]);
      if (eventName) names.push(eventName);
    }
  }

  for (const animation of projectArray(data, "animations")) {
    const frameCount = typeof animation.frameCount === "number" && Number.isFinite(animation.frameCount) && animation.frameCount > 0
      ? Math.floor(animation.frameCount)
      : 1;
    for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
      const eventName = spriteFrameEventName(animation.frameEvents, frameIndex);
      if (eventName) names.push(eventName);
    }
  }

  return names;
}

function commandReferencedEvents(command: string): string[] {
  return nativeEventCommandReferencedEvents(command);
}

function graphEdgeFlowForStep(
  step: EventStep,
  stepIndex: number,
  steps: EventStep[]
): Pick<
  EventsWorkspaceGraphEdge,
  "flowKind" | "flowLabel" | "flowDetail" | "guardStepIndex" | "guardCommand" | "choiceIndex"
> {
  const flow = stepFlow(step.command, stepIndex, steps);
  const previousStep = stepIndex > 0 ? steps[stepIndex - 1] : null;
  const guardedByPreviousStep = previousStep !== null && conditionCommandVerbs.has(commandVerb(previousStep.command));
  return {
    flowKind: flow.kind,
    flowLabel: flow.label,
    flowDetail: flow.detail,
    guardStepIndex: guardedByPreviousStep ? stepIndex - 1 : null,
    guardCommand: guardedByPreviousStep ? previousStep.command : null,
    choiceIndex: flow.choiceIndex
  };
}

function graphEdgesForEvent(event: Record<string, unknown>, index: number, eventNames: Set<string>): EventsWorkspaceGraphEdge[] {
  const sourceEventID = eventID(event, index);
  const sourceEventName = eventName(event, index);
  const steps = eventSteps(event);
  return steps
    .flatMap((step, stepIndex) => {
      if (!step.isEnabled) return [];
      const verb = commandVerb(step.command);
      const flow = graphEdgeFlowForStep(step, stepIndex, steps);
      return commandReferencedEvents(step.command).map((targetEventName) => ({
        id: `${sourceEventID}-${targetEventName}-${verb}-${stepIndex}`,
        sourceEventID,
        stepIndex,
        sourceEventName,
        targetEventName,
        commandVerb: verb,
        ...flow,
        isMissingTarget: !eventNames.has(targetEventName)
      }));
    });
}

function graphNodePositions(data: GBAProjectData): Record<string, unknown> {
  const positions = projectEditorState(data)?.eventGraphNodePositions;
  return isRecord(positions) ? positions : {};
}

function savedGraphPosition(data: GBAProjectData, nodeID: string): { x: number; y: number } | null {
  return savedGraphPositionFromValue(graphNodePositions(data)[nodeID]);
}

function graphNodePositionsMap(data: GBAProjectData): Record<string, { x: number; y: number }> {
  const positions: Record<string, { x: number; y: number }> = {};
  for (const [nodeID, position] of Object.entries(graphNodePositions(data))) {
    const saved = savedGraphPositionFromValue(position);
    if (saved) positions[nodeID] = saved;
  }
  return positions;
}

function savedGraphPositionFromValue(position: unknown): { x: number; y: number } | null {
  if (!isRecord(position) || typeof position.x !== "number" || typeof position.y !== "number") {
    return null;
  }

  return {
    x: Math.max(0, Math.round(position.x)),
    y: Math.max(0, Math.round(position.y))
  };
}

function applyGraphNodeLayout(
  nodes: EventsWorkspaceGraphNode[],
  graphEdges: EventsWorkspaceGraphEdge[],
  graphBindingEdges: EventsWorkspaceGraphBindingEdge[],
  savedPositions: Record<string, { x: number; y: number }>
): EventsWorkspaceGraphNode[] {
  const layoutPositions = layoutEventsGraphNodes({
    nodes,
    graphEdges,
    graphBindingEdges,
    savedPositions
  });

  return nodes.map((node) => ({
    ...node,
    x: savedPositions[node.id]?.x ?? layoutPositions[node.id]?.x ?? node.x,
    y: savedPositions[node.id]?.y ?? layoutPositions[node.id]?.y ?? node.y
  }));
}

function contextRoomNodeID(roomName: string, index: number): string {
  const stem = safeFileStem(roomName);
  return `context-room-${stem || index + 1}`;
}

function contextActorNodeID(actorName: string, index: number): string {
  const stem = safeFileStem(actorName);
  return `context-actor-${stem || index + 1}`;
}

function contextTriggerNodeID(triggerName: string, index: number): string {
  const stem = safeFileStem(triggerName);
  return `context-trigger-${stem || index + 1}`;
}

function entityRoomName(entity: Record<string, unknown>, rooms: Record<string, unknown>[]): string | null {
  return normalizeGBAEntityDocument(
    entity,
    "actor",
    0,
    rooms[0] ? stringField(rooms[0].name, "Room sem nome") : ""
  ).sceneName || null;
}

function actorRoleForEntity(
  actor: Record<string, unknown>,
  rooms: Record<string, unknown>[]
): EventBindingCapabilityActorRole {
  const actorName = nullableString(actor.name);
  const sceneName = entityRoomName(actor, rooms);
  if (!actorName || !sceneName) return "actor";
  return rooms.some((room) => (
    nullableString(room.name) === sceneName
      && nullableString(room.playerActorName) === actorName
  )) ? "player" : "actor";
}

function collectEntityBindingEntries(
  entity: Record<string, unknown>,
  directBindingKeys: string[] = []
): Array<{ bindingKey: string; eventName: string }> {
  const entries: Array<{ bindingKey: string; eventName: string }> = [];
  for (const bindingKey of directBindingKeys) {
    const eventName = nullableString(entity[bindingKey]);
    if (eventName) entries.push({ bindingKey, eventName });
  }

  const bindings = isRecord(entity.eventBindings) ? entity.eventBindings : {};
  for (const [bindingKey, value] of Object.entries(bindings)) {
    const eventName = nullableString(value);
    if (eventName) entries.push({ bindingKey, eventName });
  }

  return entries;
}

function buildContextGraphNode(
  data: GBAProjectData,
  options: {
    id: string;
    contextKind: EventsWorkspaceGraphContextKind;
    labelPrefix: string;
    targetName: string;
    category: string;
    sceneName: string | null;
    contextRole?: EventBindingCapabilityActorRole | null;
    entity: Record<string, unknown>;
    eventNames: Set<string>;
    positionIndex: number;
    flowLabel: string;
  }
): EventsWorkspaceGraphNode {
  const capabilityContext: EventsWorkspaceContextBindingCapabilityContext = {
    actorRole: options.contextRole ?? null
  };
  const slotStates = deriveContextBindingSlotStates(
    options.entity,
    options.contextKind,
    options.eventNames,
    capabilityContext
  );
  const materializedSlotStates = materializeContextBindingSlotStates(
    options.entity,
    options.contextKind,
    options.eventNames,
    capabilityContext
  );
  const bindingEntries = materializedSlotStates
    .filter((slot): slot is EventsWorkspaceContextBindingSlotState & { eventName: string } => Boolean(slot.eventName))
    .map((slot) => ({ bindingKey: slot.bindingKey, eventName: slot.eventName }));
  const missingBindings = materializedSlotStates.filter((slot) => slot.isMissing);
  const pendingBindingCount = materializedSlotStates.filter((slot) => slot.isPending).length;
  const position = savedGraphPosition(data, options.id) ?? { x: 0, y: 0 };
  return {
    id: options.id,
    nodeKind: "context",
    contextKind: options.contextKind,
    contextRole: options.contextRole ?? null,
    eventName: `${options.labelPrefix}: ${options.targetName}`,
    targetName: options.targetName,
    sceneName: options.sceneName,
    contextSubtitle: contextSubtitleForEntity(
      data,
      options.contextKind,
      options.entity,
      options.targetName,
      options.sceneName,
      pendingBindingCount,
      options.contextRole ?? null
    ),
    category: options.category,
    x: position.x,
    y: position.y,
    isUnlinked: bindingEntries.length === 0,
    missingReferenceCount: missingBindings.length,
    pendingBindingCount,
    bindingKeys: bindingEntries.map((entry) => entry.bindingKey),
    boundEventNames: bindingEntries.map((entry) => entry.eventName),
    contextBindingSlots: slotStates,
    incomingEdgeCount: 0,
    outgoingEdgeCount: bindingEntries.length,
    incomingFlowKinds: [],
    outgoingFlowKinds: [],
    flowRole: bindingEntries.length > 0 ? "entry" : "isolated",
    flowLabels: [
      options.flowLabel,
      pendingBindingCount > 0
        ? `${pendingBindingCount} pendente${pendingBindingCount === 1 ? "" : "s"}`
        : missingBindings.length > 0
          ? "Pendente"
          : bindingEntries.length > 0
            ? "Vinculada"
            : "Sem evento"
    ]
  };
}

function deriveBindingEdgesForEntity(
  sourceNodeID: string,
  sourceLabel: string,
  targetKind: EventsWorkspaceBindingTargetKind,
  targetName: string,
  bindingEntries: Array<{ bindingKey: string; eventName: string }>,
  eventByName: Map<string, EventsWorkspaceEvent>
): EventsWorkspaceGraphBindingEdge[] {
  return bindingEntries.map(({ bindingKey, eventName }) => {
    const targetEvent = eventByName.get(eventName) ?? null;
    return {
      id: `${sourceNodeID}-${bindingKey}-${safeFileStem(eventName)}`,
      sourceNodeID,
      sourceLabel,
      targetEventName: eventName,
      targetEventID: targetEvent?.id ?? null,
      targetNodeID: targetEvent?.id ?? null,
      targetKind,
      targetName,
      bindingKey,
      label: bindingKey,
      isMissingTarget: targetEvent === null
    };
  });
}

function uniqueFlowKinds(kinds: EventsWorkspaceStepFlowKind[]): EventsWorkspaceStepFlowKind[] {
  return Array.from(new Set(kinds));
}

function graphNodeFlowLabels(
  incomingFlowKinds: EventsWorkspaceStepFlowKind[],
  outgoingFlowKinds: EventsWorkspaceStepFlowKind[],
  incomingEdgeCount: number,
  outgoingEdgeCount: number
): string[] {
  const labels: string[] = [];
  if (incomingEdgeCount === 0 && outgoingEdgeCount > 0) labels.push("Entrada");
  if (outgoingEdgeCount > 1) labels.push("Ramifica");
  if (outgoingFlowKinds.includes("choice")) labels.push("Escolhas");
  if (outgoingFlowKinds.includes("condition-dependent")) labels.push("Condicional");
  if (incomingFlowKinds.includes("choice")) labels.push("Alvo de escolha");
  if (incomingFlowKinds.includes("condition-dependent")) labels.push("Alvo condicional");
  if (labels.length > 0) return labels;
  if (incomingEdgeCount === 0 && outgoingEdgeCount === 0) return ["Solto"];
  return ["Linear"];
}

function graphNodeFlowRole(
  incomingFlowKinds: EventsWorkspaceStepFlowKind[],
  outgoingFlowKinds: EventsWorkspaceStepFlowKind[],
  incomingEdgeCount: number,
  outgoingEdgeCount: number
): EventsWorkspaceGraphNodeFlowRole {
  const hasBranchSource = outgoingEdgeCount > 1 || outgoingFlowKinds.includes("choice") || outgoingFlowKinds.includes("condition-dependent");
  const hasBranchTarget = incomingFlowKinds.includes("choice") || incomingFlowKinds.includes("condition-dependent");
  if (hasBranchSource && hasBranchTarget) return "branch-hub";
  if (hasBranchSource) return "branch-source";
  if (hasBranchTarget) return "branch-target";
  if (incomingEdgeCount === 0 && outgoingEdgeCount === 0) return "isolated";
  if (incomingEdgeCount === 0) return "entry";
  return "linear";
}

function deriveGraphNodes(
  data: GBAProjectData,
  events: EventsWorkspaceEvent[],
  graphEdges: EventsWorkspaceGraphEdge[],
  graphBindingEdges: EventsWorkspaceGraphBindingEdge[]
): EventsWorkspaceGraphNode[] {
  const eventNodes = events.map((event) => {
    const position = savedGraphPosition(data, event.id) ?? { x: 0, y: 0 };
    const incomingEdges = graphEdges.filter((edge) => edge.targetEventName === event.name);
    const incomingBindingEdges = graphBindingEdges.filter((edge) => edge.targetEventName === event.name);
    const outgoingEdges = graphEdges.filter((edge) => edge.sourceEventID === event.id);
    const incomingFlowKinds = uniqueFlowKinds(incomingEdges.map((edge) => edge.flowKind));
    const outgoingFlowKinds = uniqueFlowKinds(outgoingEdges.map((edge) => edge.flowKind));
    const incomingEdgeCount = incomingEdges.length + incomingBindingEdges.length;
    return {
      id: event.id,
      nodeKind: "event" as const,
      contextKind: null,
      eventName: event.name,
      targetName: null,
      sceneName: null,
      contextSubtitle: null,
      category: event.category,
      x: position.x,
      y: position.y,
      isUnlinked: event.isUnlinked,
      missingReferenceCount: event.missingReferences.length,
      pendingBindingCount: 0,
      bindingKeys: [],
      boundEventNames: [],
      contextBindingSlots: [],
      incomingEdgeCount,
      outgoingEdgeCount: outgoingEdges.length,
      incomingFlowKinds,
      outgoingFlowKinds,
      flowRole: graphNodeFlowRole(incomingFlowKinds, outgoingFlowKinds, incomingEdgeCount, outgoingEdges.length),
      flowLabels: graphNodeFlowLabels(incomingFlowKinds, outgoingFlowKinds, incomingEdgeCount, outgoingEdges.length)
    };
  });

  const eventNodeCount = eventNodes.length;
  const eventNames = new Set(events.map((event) => event.name));
  const rooms = projectRooms(data);
  const roomNodes = rooms.map((room, index) => {
    const targetName = stringField(room.name, "Cena sem nome");
    const id = contextRoomNodeID(targetName, index);
    return buildContextGraphNode(data, {
      id,
      contextKind: "room",
      labelPrefix: "Cena",
      targetName,
      category: "Cena",
      sceneName: targetName,
      entity: room,
      eventNames,
      positionIndex: eventNodeCount + index,
      flowLabel: "Cena"
    });
  });

  const actorNodes = projectArray(data, "actors").map((actor, index) => {
    const targetName = stringField(actor.name, "Ator sem nome");
    const id = contextActorNodeID(targetName, index);
    const contextRole = actorRoleForEntity(actor, rooms);
    const actorLabel = contextRole === "player" ? "Player" : "Ator";
    return buildContextGraphNode(data, {
      id,
      contextKind: "actor",
      contextRole,
      labelPrefix: actorLabel,
      targetName,
      category: actorLabel,
      sceneName: entityRoomName(actor, rooms),
      entity: actorWithRuntimeBinding(data, actor),
      eventNames,
      positionIndex: eventNodeCount + roomNodes.length + index,
      flowLabel: "Ator"
    });
  });

  const triggerNodes = projectArray(data, "triggers").map((trigger, index) => {
    const targetName = stringField(trigger.name, "Trigger sem nome");
    const id = contextTriggerNodeID(targetName, index);
    return buildContextGraphNode(data, {
      id,
      contextKind: "trigger",
      labelPrefix: "Trigger",
      targetName,
      category: "Trigger",
      sceneName: entityRoomName(trigger, rooms),
      entity: trigger,
      eventNames,
      positionIndex: eventNodeCount + roomNodes.length + actorNodes.length + index,
      flowLabel: "Trigger"
    });
  });

  const allNodes = [...eventNodes, ...roomNodes, ...actorNodes, ...triggerNodes];
  return applyGraphNodeLayout(allNodes, graphEdges, graphBindingEdges, graphNodePositionsMap(data));
}

function deriveGraphBindingEdges(
  data: GBAProjectData,
  events: EventsWorkspaceEvent[]
): EventsWorkspaceGraphBindingEdge[] {
  const eventByName = new Map(events.map((event) => [event.name, event]));
  const rooms = projectRooms(data);
  return [
    ...rooms.flatMap((room, index) => {
      const targetName = stringField(room.name, "Cena sem nome");
      const sourceNodeID = contextRoomNodeID(targetName, index);
      const bindingEntries = canonicalBindingEntries(room, "room");
      return deriveBindingEdgesForEntity(
        sourceNodeID,
        `Cena: ${targetName}`,
        "room",
        targetName,
        bindingEntries,
        eventByName
      );
    }),
    ...projectArray(data, "actors").flatMap((actor, index) => {
      const targetName = stringField(actor.name, "Ator sem nome");
      const sourceNodeID = contextActorNodeID(targetName, index);
      const contextRole = actorRoleForEntity(actor, rooms);
      const bindingEntries = canonicalBindingEntries(actorWithRuntimeBinding(data, actor), "actor", { actorRole: contextRole });
      return deriveBindingEdgesForEntity(
        sourceNodeID,
        `${contextRole === "player" ? "Player" : "Ator"}: ${targetName}`,
        "actor",
        targetName,
        bindingEntries,
        eventByName
      );
    }),
    ...projectArray(data, "triggers").flatMap((trigger, index) => {
      const targetName = stringField(trigger.name, "Trigger sem nome");
      const sourceNodeID = contextTriggerNodeID(targetName, index);
      const bindingEntries = canonicalBindingEntries(trigger, "trigger");
      return deriveBindingEdgesForEntity(
        sourceNodeID,
        `Trigger: ${targetName}`,
        "trigger",
        targetName,
        bindingEntries,
        eventByName
      );
    })
  ];
}

function deriveGraphConnectTargetsBySource(
  graphNodes: EventsWorkspaceGraphNode[],
  graphEdges: EventsWorkspaceGraphEdge[]
): Record<string, EventsWorkspaceGraphConnectTarget[]> {
  const existingTargetsBySource = new Map<string, Set<string>>();
  for (const edge of graphEdges) {
    const current = existingTargetsBySource.get(edge.sourceEventID) ?? new Set<string>();
    current.add(edge.targetEventName);
    existingTargetsBySource.set(edge.sourceEventID, current);
  }

  return Object.fromEntries(graphNodes.map((sourceNode) => {
    const existingTargets = existingTargetsBySource.get(sourceNode.id) ?? new Set<string>();
    const targets = graphNodes
      .filter((targetNode) => (
        sourceNode.nodeKind === "event"
        && targetNode.nodeKind === "event"
        && targetNode.id !== sourceNode.id
        && !existingTargets.has(targetNode.eventName)
      ))
      .map((targetNode) => ({
        eventID: targetNode.id,
        eventName: targetNode.eventName,
        category: targetNode.category
      }));
    return [sourceNode.id, targets];
  }));
}

export function filterEventsWorkspaceGraphByScene(
  presentation: EventsWorkspacePresentation,
  activeSceneName: string | null
): EventsWorkspaceFilteredGraph {
  if (!activeSceneName) {
    return {
      graphNodes: presentation.graphNodes,
      graphEdges: presentation.graphEdges,
      graphBindingEdges: presentation.graphBindingEdges,
      graphConnectTargetsBySource: presentation.graphConnectTargetsBySource
    };
  }

  const visibleContextNodes = presentation.graphNodes.filter((node) => (
    node.nodeKind === "context"
    && node.sceneName === activeSceneName
  ));
  const visibleContextIDs = new Set(visibleContextNodes.map((node) => node.id));
  const visibleEventNames = new Set<string>();

  for (const edge of presentation.graphBindingEdges) {
    if (!visibleContextIDs.has(edge.sourceNodeID)) continue;
    visibleEventNames.add(edge.targetEventName);
  }

  let expanded = true;
  while (expanded) {
    expanded = false;
    for (const edge of presentation.graphEdges) {
      if (visibleEventNames.has(edge.sourceEventName) && !visibleEventNames.has(edge.targetEventName)) {
        visibleEventNames.add(edge.targetEventName);
        expanded = true;
      }
      if (visibleEventNames.has(edge.targetEventName) && !visibleEventNames.has(edge.sourceEventName)) {
        visibleEventNames.add(edge.sourceEventName);
        expanded = true;
      }
    }
  }

  const visibleNodeIDs = new Set<string>([
    ...visibleContextNodes.map((node) => node.id),
    ...presentation.graphNodes
      .filter((node) => node.nodeKind === "event" && visibleEventNames.has(node.eventName))
      .map((node) => node.id)
  ]);

  const graphNodes = presentation.graphNodes.filter((node) => visibleNodeIDs.has(node.id));
  const graphBindingEdges = presentation.graphBindingEdges.filter((edge) => (
    visibleContextIDs.has(edge.sourceNodeID)
    && (edge.targetNodeID === null || visibleNodeIDs.has(edge.targetNodeID))
  ));
  const graphEdges = presentation.graphEdges.filter((edge) => (
    visibleEventNames.has(edge.sourceEventName) && visibleEventNames.has(edge.targetEventName)
  ));
  const graphConnectTargetsBySource = deriveGraphConnectTargetsBySource(graphNodes, graphEdges);

  return {
    graphNodes,
    graphEdges,
    graphBindingEdges,
    graphConnectTargetsBySource
  };
}

export function deriveEventsWorkspaceValidationIssues(
  presentation: EventsWorkspacePresentation
): EventsWorkspaceValidationIssue[] {
  const issues: EventsWorkspaceValidationIssue[] = [];

  for (const node of presentation.graphNodes) {
    if (node.nodeKind === "event" && node.isUnlinked) {
      issues.push({
        id: `unlinked-${node.id}`,
        severity: "warning",
        message: `Evento "${node.eventName}" esta solto, sem vinculos ou chamadas.`,
        nodeID: node.id,
        eventName: node.eventName
      });
    }

    if (node.missingReferenceCount > 0) {
      issues.push({
        id: `missing-${node.id}`,
        severity: "error",
        message: `${node.eventName} tem ${node.missingReferenceCount} referencia(s) pendente(s).`,
        nodeID: node.id,
        eventName: node.eventName
      });
    }
  }

  for (const edge of presentation.graphBindingEdges) {
    if (!edge.isMissingTarget) continue;
    issues.push({
      id: `binding-${edge.id}`,
      severity: "error",
      message: `${edge.sourceLabel} · ${edge.bindingKey} aponta para "${edge.targetEventName}", que nao existe.`,
      nodeID: edge.sourceNodeID,
      eventName: edge.targetEventName
    });
  }

  for (const edge of presentation.graphEdges) {
    if (!edge.isMissingTarget) continue;
    issues.push({
      id: `edge-${edge.id}`,
      severity: "error",
      message: `${edge.sourceEventName} chama "${edge.targetEventName}", que nao existe.`,
      eventName: edge.targetEventName
    });
  }

  return issues;
}

function ensureEditorState(data: GBAProjectData): Record<string, unknown> {
  const state = isRecord(data.editorState) ? data.editorState : {};
  data.editorState = state;
  return state;
}

export function updateEventGraphNodePositionInProject(
  data: GBAProjectData,
  eventIDToUpdate: string,
  position: UpdateEventGraphNodePosition
): GBAProjectData {
  const trimmedEventID = eventIDToUpdate.trim();
  if (!trimmedEventID || !Number.isFinite(position.x) || !Number.isFinite(position.y)) {
    return data;
  }

  const next = cloneProjectData(data);
  const editorState = ensureEditorState(next);
  const positions = isRecord(editorState.eventGraphNodePositions) ? editorState.eventGraphNodePositions : {};
  editorState.eventGraphNodePositions = positions;
  positions[trimmedEventID] = {
    x: Math.max(0, Math.round(position.x)),
    y: Math.max(0, Math.round(position.y))
  };

  return next;
}

export function relayoutEventsGraphInProject(data: GBAProjectData): GBAProjectData {
  const next = cloneProjectData(data);
  const editorState = ensureEditorState(next);
  editorState.eventGraphNodePositions = {};

  const presentation = deriveEventsWorkspacePresentation(next);
  const positions: Record<string, { x: number; y: number }> = {};
  for (const node of presentation.graphNodes) {
    positions[node.id] = { x: node.x, y: node.y };
  }
  editorState.eventGraphNodePositions = positions;
  return next;
}

function missingResourceReferences(command: string, data: GBAProjectData, eventNames: Set<string>): string[] {
  const parts = commandParts(command);
  const verb = parts[0] ?? "noop";
  const missing: string[] = [];
  try { resolveProjectConstantCommand(data, command); } catch (error) { missing.push(error instanceof Error ? error.message : String(error)); }

  const integrationIssue = eventCommandIntegrationIssue(command);
  if (integrationIssue && isNativeEventCommandSupportedInRom(verb)) missing.push(integrationIssue);

  if (!isNativeEventCommandAcceptedByRomExport(verb) && !eventCommandRuntimeVerbs.has(verb) && !eventCommandRecipeRuntimeVerbs.has(verb)) {
    missing.push(`Comando sem suporte no runtime da ROM: ${verb}.`);
  } else if (eventCommandRuntimeVerbs.has(verb) && !isNativeEventCommandSupportedInRom(verb) && !eventCommandRecipeRuntimeVerbs.has(verb)) {
    missing.push(eventCommandIntegrationIssue(command) ?? `Comando ${verb} nao compila para a ROM.`);
  }

  if (["show_dialogue", "show_choice"].includes(verb) && !parts[1]) {
    missing.push(`Comando incompleto: ${verb} requer dialogo.`);
  }

  if (["play_music", "play_sfx"].includes(verb) && !parts[1]) {
    missing.push(`Comando incompleto: ${verb} requer audio.`);
  }

  if (verb === "change_scene" && !parts[1]) {
    missing.push("Comando incompleto: change_scene requer cena.");
  }

  if (verb === "change_scene_by_variable" && !parts[1]) {
    missing.push("Comando incompleto: change_scene_by_variable requer tabela de rotas.");
  }

  if (verb === "slider") {
    const matches = projectRooms(data).filter((room) => findMenuSliderScreen(data, stringField(room.name, ""), parts[1] ?? ""));
    if (!parts[1] || matches.length === 0) missing.push(`Slider não encontrado: ${parts[1] || "-"}.`);
  }

  if (["call_event", "call_procedure", "lock_script", "unlock_script", "timer_restart", "timer_remove"].includes(verb) && !parts[1]) {
    missing.push(`Comando incompleto: ${verb} requer evento.`);
  }

  if (verb === "choice_event" && !parts[3]) {
    missing.push("Comando incompleto: choice_event requer evento.");
  }

  if (verb === "choice_event" && !parts[1]) {
    missing.push("Comando incompleto: choice_event requer dialogo.");
  }

  if (verb === "choice_event" && !parts[2]) {
    missing.push("Comando incompleto: choice_event requer indice da escolha.");
  }

  if (verb === "choice_event" && parts[2] && !/^\d+$/.test(parts[2])) {
    missing.push(`Indice de escolha invalido em choice_event: ${parts[2]}.`);
  }

  if (verb === "attach_button" && !parts[1]) {
    missing.push("Comando incompleto: attach_button requer botao.");
  }

  if (verb === "timer_attach" && !parts[1]) {
    missing.push("Comando incompleto: timer_attach requer timer.");
  }

  if (verb === "rumble_on_for" && !parts[1]) {
    missing.push("Comando incompleto: rumble_on_for requer quadros.");
  }

  if (verb === "rumble_on_for" && parts[1] && !/^\d+$/.test(parts[1])) {
    missing.push(`Quadros invalidos em rumble_on_for: ${parts[1]}.`);
  }

  if (verb === "multiplayer4_open" && !parts[1]) {
    missing.push("Comando incompleto: multiplayer4_open requer jogadores (2-4).");
  }

  if (verb === "multiplayer4_open" && parts[1] && !["2", "3", "4"].includes(parts[1])) {
    missing.push(`Jogadores invalidos em multiplayer4_open: ${parts[1]}.`);
  }

  if (verb === "multiplayer4_set" && !parts[1]) {
    missing.push("Comando incompleto: multiplayer4_set requer valor.");
  }

  if (verb === "multiplayer4_read" && (!parts[1] || !parts[2] || !parts[3])) {
    missing.push("Comando incompleto: multiplayer4_read requer variaveis de jogador, contagem e base.");
  }

  if (["attach_button", "timer_attach"].includes(verb) && !parts[2]) {
    missing.push(`Comando incompleto: ${verb} requer evento.`);
  }

  if (["show_dialogue", "show_choice", "choice_event"].includes(verb) && parts[1]) {
    const dialogueKeys = new Set(projectArray(data, "dialogues").map((item) => stringField(item.key, "")));
    if (!dialogueKeys.has(parts[1])) {
      missing.push(`Dialogo nao encontrado: ${parts[1]}`);
    }
  }

  if (["play_music", "play_sfx"].includes(verb) && parts[1]) {
    const audioItems = projectArray(data, "audioItems").map((item) => ({
      kind: stringField(item.kind, ""),
      name: stringField(item.name, "")
    }));
    const audio = audioItems.find((item) => item.name === parts[1]);
    if (!audio) {
      missing.push(`Audio nao encontrado: ${parts[1]}`);
    } else if (verb === "play_music" && !["musica", "música", "music"].includes(audio.kind.toLowerCase())) {
      missing.push(`Audio incompativel para play_music: ${parts[1]} e ${audio.kind}.`);
    } else if (verb === "play_sfx" && !["sfx", "sound", "efeito"].includes(audio.kind.toLowerCase())) {
      missing.push(`Audio incompativel para play_sfx: ${parts[1]} e ${audio.kind}.`);
    }
  }

  if (verb === "change_scene" && parts[1]) {
    const roomNames = new Set(projectRooms(data).map((item) => stringField(item.name, "")));
    if (!roomNames.has(parts[1])) {
      missing.push(`Cena não encontrada: ${parts[1]}`);
    }
  }

  if (verb === "change_scene_by_variable" && parts[1]) {
    const routeTableIDs = new Set(sceneRouteTablesFromProject(data).map((table) => table.id));
    if (!routeTableIDs.has(parts[1])) {
      missing.push(`Tabela de rotas não encontrada: ${parts[1]}`);
    }
  }

  for (const eventName of commandReferencedEvents(command)) {
    if (!eventNames.has(eventName)) {
      missing.push(`Evento nao encontrado: ${eventName}`);
    }
  }

  return missing;
}

function projectVariableNames(data: GBAProjectData): string[] {
  const variableRecords = [
    ...projectArray(data, "variables"),
    ...projectArray(data, "variaveis")
  ];

  return variableRecords
    .map((item) => nullableString(item.name) ?? nullableString(item.key) ?? nullableString(item.id))
    .filter((name): name is string => Boolean(name));
}

function suggestionForResource(
  category: string,
  label: string,
  command: string,
  targetName: string | null,
  resourceOptions: EventCommandResourceOptions,
  options: Partial<Pick<EventsWorkspaceCommandSuggestion, "id" | "badge" | "isFavorite" | "isRecipe" | "steps">> = {}
): EventsWorkspaceCommandSuggestion {
  const id = options.id ?? `${category}:${command}`;
  const runtimeStatus = options.isRecipe ? "recipe" : commandRuntimeStatus(command);
  return {
    id,
    label,
    command,
    category,
    section: null,
    targetName,
    badge: options.badge ?? commandBadgeForRuntimeStatus(runtimeStatus),
    runtimeStatus,
    commandTemplate: command,
    parameters: commandParametersForCommand(command, command, resourceOptions),
    isFavorite: options.isFavorite ?? false,
    isRecipe: options.isRecipe ?? false,
    steps: options.steps ?? null
  };
}

interface EventCommandTemplateContext {
  actor: string;
  animation: string;
  animationState: string;
  background: string;
  choiceDialogue: string;
  currentRoom: string;
  dialogue: string;
  event: string;
  music: string;
  room: string;
  routeTable: string;
  sfx: string;
  sprite: string;
  variable: string;
}

function firstNamedRecord(data: GBAProjectData, key: string, fallback: string): string {
  return projectArray(data, key)
    .map((item) => nullableString(item.name) ?? nullableString(item.id) ?? nullableString(item.key))
    .find((name): name is string => Boolean(name)) ?? fallback;
}

function namedRecords(data: GBAProjectData, key: string): string[] {
  return projectArray(data, key)
    .map((item) => nullableString(item.name) ?? nullableString(item.id) ?? nullableString(item.key))
    .filter((name): name is string => Boolean(name));
}

function commandResourceOptions(data: GBAProjectData, sourceEvents: Record<string, unknown>[]): EventCommandResourceOptions {
  const rooms = projectRooms(data).map((item) => nullableString(item.name)).filter((name): name is string => Boolean(name));
  const routeTables = sceneRouteTablesFromProject(data).map((table) => table.id);
  const dialogues = projectArray(data, "dialogues").map((dialogue) => ({
    key: nullableString(dialogue.key) ?? nullableString(dialogue.id) ?? nullableString(dialogue.name),
    hasChoices: Array.isArray(dialogue.choices) && dialogue.choices.length > 0
  })).filter((dialogue): dialogue is { key: string; hasChoices: boolean } => Boolean(dialogue.key));
  const audioItems = projectArray(data, "audioItems")
    .map((audio) => ({
      kind: stringField(audio.kind, ""),
      name: nullableString(audio.name)
    }))
    .filter((audio): audio is { kind: string; name: string } => Boolean(audio.name));
  const events = sourceEvents.map((item, index) => eventName(item, index)).filter((name) => name.trim().length > 0);
  const music = audioItems
    .filter((audio) => ["musica", "música", "music"].includes(audio.kind.toLowerCase()))
    .map((audio) => audio.name);
  const sfx = audioItems
    .filter((audio) => ["sfx", "sound", "efeito"].includes(audio.kind.toLowerCase()))
    .map((audio) => audio.name);

  return {
    actor: uniqueStrings(namedRecords(data, "actors")),
    animation: uniqueStrings(namedRecords(data, "animations")),
    animationState: uniqueStrings(projectArray(data, "animationStates").map(state => stringField(state.id, "")).filter(Boolean)),
    background: projectArray(data, "assets").filter(asset => stringField(asset.kind, "").toLowerCase() === "background").map(asset => stringField(asset.name, "")).filter(Boolean),
    choiceDialogue: uniqueStrings(dialogues.filter((dialogue) => dialogue.hasChoices).map((dialogue) => dialogue.key)),
    currentRoom: uniqueStrings(rooms),
    dialogue: uniqueStrings(dialogues.map((dialogue) => dialogue.key)),
    event: uniqueStrings(events),
    music: uniqueStrings(music.length ? music : audioItems.map((audio) => audio.name)),
    room: uniqueStrings(rooms),
    routeTable: uniqueStrings(routeTables),
    sfx: uniqueStrings(sfx.length ? sfx : audioItems.map((audio) => audio.name)),
    sprite: uniqueStrings([
      ...namedRecords(data, "spriteAssets"),
      ...namedRecords(data, "assets")
    ]),
    constant: projectNumericConstants(data).map(item => `const(${item.name})`),
    variable: uniqueStrings(projectVariableNames(data))
  };
}

function firstOption(options: string[], fallback: string): string {
  return options[0] ?? fallback;
}

function commandTemplateContext(options: EventCommandResourceOptions): EventCommandTemplateContext {
  return {
    actor: firstOption(options.actor, "Player"),
    animation: firstOption(options.animation, "idle"),
    animationState: firstOption(options.animationState, "state_id"),
    background: firstOption(options.background, "background.png"),
    choiceDialogue: firstOption(options.choiceDialogue, firstOption(options.dialogue, "intro_001")),
    currentRoom: firstOption(options.currentRoom, "room_name"),
    dialogue: firstOption(options.dialogue, "intro_001"),
    event: firstOption(options.event, "intro_001"),
    music: firstOption(options.music, "theme.mod"),
    room: options.room[1] ?? firstOption(options.room, "room_name"),
    routeTable: firstOption(options.routeTable, "scene-routes"),
    sfx: firstOption(options.sfx, "confirm.wav"),
    sprite: firstOption(options.sprite, "player_idle.png"),
    variable: firstOption(options.variable, "value")
  };
}

function resolveCommandTemplate(template: string, context: EventCommandTemplateContext): string {
  const defaults: Record<string, string> = {
    stage: context.currentRoom, winner: "player1", amount: "0", style: "a-ism",
    move_id: "super", enabled: "true", seconds: "60", count: "2"
  };
  return template.replace(/\{([a-zA-Z_]+)\}/g, (_match, key: keyof EventCommandTemplateContext) => (
    context[key] ?? defaults[key] ?? _match
  ));
}

function commandTargetName(command: string): string | null {
  const parts = commandParts(command);
  return parts[1] ?? null;
}

function commandSuggestionBadge(command: string): string {
  if (["pending", "not-applicable"].includes(eventCommandSupport(commandVerb(command)).status)) return "Indisponível";
  return commandBadgeForRuntimeStatus(commandRuntimeStatus(command));
}

function commandVerbLabel(verb: string): string {
  if (verb === "noop") return "Sem operacao";
  return verb.replace(/_/g, " ");
}

function stepSuggestionRecord(suggestion: EventsWorkspaceCommandSuggestion): EventsWorkspaceStepPaletteSuggestion {
  return {
    id: suggestion.id,
    label: suggestion.label,
    command: suggestion.command,
    category: suggestion.category,
    badge: suggestion.badge
  };
}

const preferredStepSuggestionIDsByVerb = new Map<string, string>([
  ["set_variable", "command:variables.set_value"]
]);

function commandSuggestionRank(suggestion: EventsWorkspaceCommandSuggestion, command: string, verb: string): number {
  let rank = 0;
  if (suggestion.id === preferredStepSuggestionIDsByVerb.get(verb)) rank -= 100;
  if (suggestion.command === command) rank -= 50;
  if (suggestion.isFavorite) rank -= 5;
  return rank;
}

function commandInsightForStep(
  command: string,
  palette: EventsWorkspaceCommandSuggestion[],
  resourceOptions: EventCommandResourceOptions
): Pick<
  EventsWorkspaceStep,
  | "commandVerb"
  | "commandLabel"
  | "commandCategory"
  | "commandSection"
  | "commandBadge"
  | "commandRuntimeStatus"
  | "commandAvailability"
  | "commandTemplate"
  | "commandPaletteID"
  | "commandParameters"
  | "paletteSuggestions"
> {
  const verb = commandVerb(command);
  const review = eventCommandReview(verb);
  const definition = eventCommandCatalog.find(item => commandVerb(item.commandTemplate) === verb);
  const support = eventCommandSupport(verb);
  const integrationIssue = support.status === "native" ? eventCommandIntegrationIssue(command) : null;
  const unavailable = Boolean(integrationIssue) || support.status === "pending" || support.status === "not-applicable";
  const commandSuggestions = palette.filter((suggestion) => !suggestion.isRecipe);
  const sameVerbSuggestions = commandSuggestions
    .filter((suggestion) => commandVerb(suggestion.command) === verb)
    .sort((lhs, rhs) => (
      commandSuggestionRank(lhs, command, verb) - commandSuggestionRank(rhs, command, verb) ||
      lhs.label.localeCompare(rhs.label, "pt-BR")
    ));
  const exactSuggestion = sameVerbSuggestions.find((suggestion) => suggestion.command === command) ?? null;
  const verbSuggestion = sameVerbSuggestions[0] ?? null;
  const primarySuggestion = exactSuggestion ?? verbSuggestion;
  const relatedSuggestions = [
    ...commandSuggestions.filter(suggestion => review?.alternatives.includes(commandVerb(suggestion.command))),
    ...sameVerbSuggestions.filter((suggestion) => suggestion.command === command),
    ...sameVerbSuggestions.filter((suggestion) => suggestion.command !== command),
    ...commandSuggestions.filter((suggestion) => (
      primarySuggestion &&
      suggestion.command !== command &&
      commandVerb(suggestion.command) !== verb &&
      suggestion.category === primarySuggestion.category
    ))
  ];
  const seenSuggestionIDs = new Set<string>();
  const paletteSuggestions = relatedSuggestions
    .filter((suggestion) => {
      if (seenSuggestionIDs.has(suggestion.id)) return false;
      seenSuggestionIDs.add(suggestion.id);
      return true;
    })
    .slice(0, 5)
    .map(stepSuggestionRecord);

  return {
    commandVerb: verb,
    commandLabel: primarySuggestion?.label ?? definition?.title ?? review?.title ?? commandVerbLabel(verb),
    commandCategory: primarySuggestion?.category ?? definition?.category ?? "Comando custom",
    commandSection: primarySuggestion?.section ?? definition?.section ?? null,
    commandBadge: integrationIssue && support.status === "native" ? "Parâmetros incompletos" : commandSuggestionBadge(command),
    commandRuntimeStatus: commandRuntimeStatus(command),
    commandAvailability: unavailable ? integrationIssue ?? review?.message ?? support.reason : null,
    commandTemplate: primarySuggestion?.commandTemplate ?? null,
    commandPaletteID: primarySuggestion?.id ?? null,
    commandParameters: commandParametersForCommand(command, primarySuggestion?.commandTemplate ?? null, resourceOptions),
    paletteSuggestions
  };
}

function commandSuggestion(
  definition: EventCommandDefinition,
  context: EventCommandTemplateContext,
  resourceOptions: EventCommandResourceOptions
): EventsWorkspaceCommandSuggestion {
  const command = resolveCommandTemplate(definition.commandTemplate, context);
  const runtimeStatus = commandRuntimeStatus(command);
  return {
    id: `command:${definition.id}`,
    label: definition.title,
    command,
    category: definition.category,
    section: definition.section,
    targetName: commandTargetName(command),
    badge: commandBadgeForRuntimeStatus(runtimeStatus),
    runtimeStatus,
    commandTemplate: definition.commandTemplate,
    parameters: commandParametersForCommand(command, definition.commandTemplate, resourceOptions),
    isFavorite: definition.isFavorite,
    authoringCategories: definition.authoringCategories,
    searchAliases: definition.searchAliases,
    isExtension: definition.isExtension,
    reference: definition.reference,
    adaptation: definition.adaptation,
    isRecipe: false,
    steps: null
  };
}

function recipeStep(
  step: EventCommandRecipeStepDefinition,
  context: EventCommandTemplateContext
): EventsWorkspaceCommandSuggestionStep {
  return {
    command: resolveCommandTemplate(step.commandTemplate, context),
    category: step.category,
    detail: step.detail
  };
}

function recipeSuggestion(
  recipe: EventCommandRecipeDefinition,
  context: EventCommandTemplateContext,
  resourceOptions: EventCommandResourceOptions
): EventsWorkspaceCommandSuggestion {
  const steps = recipe.steps.map((step) => recipeStep(step, context));
  const firstCommand = steps[0]?.command ?? "noop";
  return {
    id: `recipe:${recipe.id}`,
    label: recipe.title,
    command: firstCommand,
    category: recipe.category,
    section: null,
    targetName: commandTargetName(firstCommand),
    badge: commandBadgeForRuntimeStatus("recipe"),
    runtimeStatus: "recipe",
    commandTemplate: recipe.steps[0]?.commandTemplate ?? null,
    parameters: commandParametersForCommand(firstCommand, recipe.steps[0]?.commandTemplate ?? null, resourceOptions),
    isFavorite: false,
    isRecipe: true,
    steps
  };
}

function pluginCommandSuggestion(
  definition: PluginEventCommandDefinition,
  context: EventCommandTemplateContext,
  resourceOptions: EventCommandResourceOptions
): EventsWorkspaceCommandSuggestion {
  const command = resolveCommandTemplate(definition.commandTemplate, context);
  return {
    id: `plugin-command:${definition.id}`,
    label: definition.title,
    command,
    category: definition.category,
    section: definition.section,
    targetName: commandTargetName(command),
    badge: commandBadgeForRuntimeStatus(definition.runtimeStatus),
    runtimeStatus: definition.runtimeStatus,
    commandTemplate: definition.commandTemplate,
    parameters: commandParametersForCommand(command, definition.commandTemplate, resourceOptions),
    isFavorite: definition.isFavorite,
    isRecipe: false,
    steps: null
  };
}

function commandTemplateAcceptedByRomExporter(commandTemplate: string): boolean {
  const verb = commandTemplate.split(/\s+/).filter(Boolean)[0] ?? "noop";
  return isNativeEventCommandAcceptedByRomExport(verb);
}

function recipeAcceptedByRomExporter(recipe: EventCommandRecipeDefinition): boolean {
  return recipe.steps.every((step) => commandTemplateAcceptedByRomExporter(step.commandTemplate));
}

function commandPalette(
  data: GBAProjectData,
  sourceEvents: Record<string, unknown>[],
  pluginRegistry: ProjectPluginRegistry = emptyProjectPluginRegistry()
): EventsWorkspaceCommandSuggestion[] {
  const resourceOptions = commandResourceOptions(data, sourceEvents);
  const context = commandTemplateContext(resourceOptions);
  return [
    suggestionForResource("Diversos", "Sem operação", "noop", null, resourceOptions, {
      id: "Controle:noop",
      badge: "OK ROM"
    }),
    ...eventCommandLibrary
      .filter((definition) => commandTemplateAcceptedByRomExporter(definition.commandTemplate))
      .map((definition) => commandSuggestion(definition, context, resourceOptions)),
    ...sourceEvents.flatMap((event, index): EventsWorkspaceCommandSuggestion[] => {
      if (event.eventKind !== "procedure") return [];
      const name = eventName(event, index);
      const definition = normalizeEventProcedureDefinition(event.procedure);
      const argumentValues = definition.parameters.map((parameter) => (
        parameter.defaultValue || (parameter.type === "variable" ? firstOption(resourceOptions.variable, "value") : parameter.type === "boolean" ? "false" : "0")
      ));
      const templateArguments = definition.parameters.map((parameter) => (
        parameter.type === "variable" ? "{variable}" : "{value}"
      ));
      const command = ["call_procedure", name, ...argumentValues].join(" ");
      const commandTemplate = ["call_procedure", name, ...templateArguments].join(" ");
      return [{
        id: `procedure:${name}`,
        label: `Chamar procedure ${name}`,
        command,
        category: "Fluxo de controle",
        section: "Procedures",
        targetName: name,
        badge: "OK ROM",
        runtimeStatus: "ok-rom",
        commandTemplate,
        parameters: commandParametersForCommand(command, commandTemplate, resourceOptions),
        isFavorite: true,
        isRecipe: false,
        steps: null
      }];
    }),
    ...eventCommandRecipeLibrary
      .filter((recipe) => recipeAcceptedByRomExporter(recipe))
      .map((recipe) => recipeSuggestion(recipe, context, resourceOptions)),
    ...pluginRegistry.recipes.map((recipe) => recipeSuggestion(recipe, context, resourceOptions)),
    ...pluginRegistry.commands.map((definition) => pluginCommandSuggestion(definition, context, resourceOptions))
  ];
}

export interface EventsWorkspacePluginContext {
  registry: ProjectPluginRegistry | null;
}

export function createEventInProject(data: GBAProjectData, options: CreateEventOptions): GBAProjectData {
  const event = makeEvent(options);
  if (!event) return data;

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  if (events.some((item, index) => eventID(item, index) === event.id || eventName(item, index) === event.name)) {
    return data;
  }

  next.events = [...events, event];
  return next;
}

export function createEventWithGraphPositionInProject(
  data: GBAProjectData,
  options: CreateEventOptions,
  layoutOptions?: CreateEventGraphPositionOptions
): GBAProjectData {
  const created = createEventInProject(data, options);
  if (created === data) return data;

  const presentation = deriveEventsWorkspacePresentation(data);
  const existingRects = presentation.graphNodes.map((node) => graphNodeToRect(node));
  const preferred = layoutOptions?.preferred ?? { x: GRAPH_LAYOUT_CONTEXT_X, y: GRAPH_LAYOUT_START_Y };
  const position = findNextFreeCanvasPosition({
    existingRects,
    gap: GRAPH_LAYOUT_GAP,
    preferred,
    size: { width: EVENT_GRAPH_NODE_WIDTH, height: EVENT_GRAPH_NODE_HEIGHT },
    worldWidth: 4800
  });

  return updateEventGraphNodePositionInProject(created, options.id, position);
}

export function renameEventInProject(data: GBAProjectData, eventIDToRename: string, nextName: string): GBAProjectData {
  const trimmedName = nextName.trim();
  if (!trimmedName) return data;

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = events.findIndex((event, index) => eventID(event, index) === eventIDToRename);
  if (eventIndex < 0) return data;

  const oldName = eventName(events[eventIndex], eventIndex);
  if (oldName === trimmedName) return data;

  events[eventIndex].name = trimmedName;
  next.events = events;
  renameEventReferences(next, oldName, trimmedName);
  return next;
}

export function duplicateEventInProject(data: GBAProjectData, options: DuplicateEventOptions): GBAProjectData {
  const newEventID = options.newEventID.trim();
  const newName = options.newName.trim();
  if (!newEventID || !newName || newEventID === options.sourceEventID) {
    return data;
  }

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const source = events.find((event, index) => eventID(event, index) === options.sourceEventID);
  if (!source || events.some((event, index) => eventID(event, index) === newEventID || eventName(event, index) === newName)) {
    return data;
  }

  next.events = [
    ...events,
    {
      ...cloneProjectData(source),
      id: newEventID,
      name: newName
    }
  ];
  return next;
}

export function updateEventFieldsInProject(data: GBAProjectData, eventIDToUpdate: string, fields: UpdateEventFields): GBAProjectData {
  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = eventIndexByID(events, eventIDToUpdate);
  if (eventIndex < 0) return data;

  const event = events[eventIndex];
  if (fields.category !== undefined) {
    event.category = fields.category.trim() || "Custom";
  }

  if (fields.detail !== undefined) {
    event.detail = fields.detail.trim();
  }

  if (fields.command !== undefined) {
    event.command = normalizedCommand(fields.command);
  }

  if (fields.eventKind !== undefined) {
    event.eventKind = fields.eventKind;
  }

  if (fields.procedure !== undefined) {
    event.procedure = normalizeEventProcedureDefinition(fields.procedure);
  }

  next.events = events;
  return next;
}

export function addEventStepInProject(data: GBAProjectData, eventIDToUpdate: string, command: string): GBAProjectData {
  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = eventIndexByID(events, eventIDToUpdate);
  if (eventIndex < 0) return data;

  const event = events[eventIndex];
  const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
  event.steps = [
    ...steps,
    {
      command: normalizedCommand(command),
      isEnabled: true
    }
  ];
  next.events = events;
  return next;
}

function eventStructureSteps(event: Record<string, unknown>): EventStructureStep[] {
  return eventSteps(event).map((step) => ({ ...step }));
}

export function insertEventStepsInProject(
  data: GBAProjectData,
  eventIDToUpdate: string,
  target: EventStructureInsertionTarget,
  commands: string[]
): GBAProjectData {
  const safeCommands = commands.map((command) => normalizedCommand(command)).filter(Boolean);
  if (safeCommands.length === 0) return data;

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = eventIndexByID(events, eventIDToUpdate);
  if (eventIndex < 0) return data;

  const event = events[eventIndex]!;
  const steps = eventStructureSteps(event);
  const updatedSteps = insertEventStructureCommands(steps, target, safeCommands);
  if (updatedSteps === steps) return data;

  event.steps = updatedSteps;
  next.events = events;
  return next;
}

export function setEventUpdateFrequencyInProject(
  data: GBAProjectData,
  eventIDToUpdate: string,
  frames: number,
  slot: number
): GBAProjectData {
  if (!Number.isFinite(frames) || !Number.isFinite(slot)) return data;

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = eventIndexByID(events, eventIDToUpdate);
  if (eventIndex < 0) return data;

  const event = events[eventIndex]!;
  event.steps = setEventUpdateFrequency(eventStructureSteps(event), frames, slot);
  next.events = events;
  return next;
}

export function updateEventStepInProject(
  data: GBAProjectData,
  eventIDToUpdate: string,
  stepIndex: number,
  fields: UpdateEventStepFields
): GBAProjectData {
  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = eventIndexByID(events, eventIDToUpdate);
  if (eventIndex < 0) return data;

  const event = events[eventIndex];
  const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
  const step = steps[stepIndex];
  if (!step) return data;

  if (fields.command !== undefined) {
    step.command = normalizedCommand(fields.command);
  }

  if (fields.isEnabled !== undefined) {
    step.isEnabled = fields.isEnabled;
  }

  event.steps = steps;
  next.events = events;
  return next;
}

export function removeEventStepInProject(data: GBAProjectData, eventIDToUpdate: string, stepIndex: number): GBAProjectData {
  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = eventIndexByID(events, eventIDToUpdate);
  if (eventIndex < 0) return data;

  const event = events[eventIndex];
  const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
  if (stepIndex < 0 || stepIndex >= steps.length) return data;

  event.steps = steps.filter((_, index) => index !== stepIndex);
  next.events = events;
  return next;
}

export function retargetEventGraphEdgeInProject(
  data: GBAProjectData,
  options: RetargetEventGraphEdgeOptions
): GBAProjectData {
  const targetEventName = options.targetEventName.trim();
  if (!targetEventName || !Number.isInteger(options.stepIndex) || options.stepIndex < 0) {
    return data;
  }

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  if (!events.some((event, index) => eventName(event, index) === targetEventName)) {
    return data;
  }

  const eventIndex = eventIndexByID(events, options.sourceEventID);
  if (eventIndex < 0) return data;

  const event = events[eventIndex];
  if (Array.isArray(event.steps)) {
    const steps = event.steps.filter(isRecord);
    const step = steps[options.stepIndex];
    if (!step) return data;

    const nextCommand = retargetEventCommandReference(step.command, targetEventName);
    if (!nextCommand) return data;

    step.command = nextCommand;
    event.steps = steps;
  } else if (options.stepIndex === 0) {
    const nextCommand = retargetEventCommandReference(event.command, targetEventName);
    if (!nextCommand) return data;

    event.command = nextCommand;
  } else {
    return data;
  }

  next.events = events;
  return next;
}

export function connectEventGraphNodesInProject(
  data: GBAProjectData,
  options: ConnectEventGraphNodesOptions
): GBAProjectData {
  const targetEventName = options.targetEventName.trim();
  if (!targetEventName) return data;

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  if (!events.some((event, index) => eventName(event, index) === targetEventName)) {
    return data;
  }

  const eventIndex = eventIndexByID(events, options.sourceEventID);
  if (eventIndex < 0) return data;

  const event = events[eventIndex];
  const sourceEventName = eventName(event, eventIndex);
  const currentReferences = new Set(eventSteps(event).flatMap((step) => commandReferencedEvents(step.command)));
  if (sourceEventName === targetEventName || currentReferences.has(targetEventName)) {
    return data;
  }

  const nextStep = {
    command: `call_event ${targetEventName}`,
    isEnabled: true
  };

  if (Array.isArray(event.steps)) {
    event.steps = [
      ...event.steps.filter(isRecord).map((step) => ({
        ...step,
        isEnabled: typeof step.isEnabled === "boolean" ? step.isEnabled : true
      })),
      nextStep
    ];
  } else {
    event.steps = [
      {
        command: normalizedCommand(typeof event.command === "string" ? event.command : undefined),
        isEnabled: true
      },
      nextStep
    ];
  }

  next.events = events;
  return next;
}

export function removeEventGraphEdgeInProject(
  data: GBAProjectData,
  options: RemoveEventGraphEdgeOptions
): GBAProjectData {
  if (!Number.isInteger(options.stepIndex) || options.stepIndex < 0) {
    return data;
  }

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = eventIndexByID(events, options.sourceEventID);
  if (eventIndex < 0) return data;

  const event = events[eventIndex];
  const steps = Array.isArray(event.steps) ? event.steps.filter(isRecord) : [];
  const step = steps[options.stepIndex];
  if (!step || eventReferencePartIndex(step.command) === null) {
    return data;
  }

  event.steps = steps.filter((_, index) => index !== options.stepIndex);
  next.events = events;
  return next;
}

export function removeEventFromProject(data: GBAProjectData, eventIDToRemove: string): GBAProjectData {
  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = events.findIndex((event, index) => eventID(event, index) === eventIDToRemove);
  if (eventIndex < 0) return data;

  const removedName = eventName(events[eventIndex], eventIndex);
  next.events = events.filter((_, index) => index !== eventIndex);
  clearDirectEventReferences(next, removedName);
  return next;
}

function bindingTargetsForKind(data: GBAProjectData, targetKind: EventsWorkspaceBindingTargetKind): Record<string, unknown>[] {
  if (targetKind === "room") return projectRooms(data);
  if (targetKind === "actor") return projectArray(data, "actors");
  if (targetKind === "spriteFrame") return projectArray(data, "animations");
  return projectArray(data, "triggers");
}

function spriteFrameIndexFromBindingKey(bindingKey: string): number | null {
  const match = /^frame:(\d+)$/.exec(bindingKey);
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function isDirectBindingKey(targetKind: EventsWorkspaceBindingTargetKind, bindingKey: string): boolean {
  if (targetKind === "actor") return bindingKey === "eventName";
  if (targetKind === "trigger") {
    return bindingKey === "eventName" || bindingKey === "onEnterEventName" || bindingKey === "onLeaveEventName";
  }
  return false;
}

export function suggestBoundEventName(targetName: string, bindingKey: string): string {
  return safeFileStem(`${targetName}_${bindingKey}`);
}

function uniqueEventNameInProject(data: GBAProjectData, baseName: string): string {
  const events = projectArray(data, "events");
  const used = new Set(events.map((event, index) => eventName(event, index)));
  if (!used.has(baseName)) return baseName;

  let suffix = 2;
  while (used.has(`${baseName}_${suffix}`)) {
    suffix += 1;
  }
  return `${baseName}_${suffix}`;
}

function eventIDByName(data: GBAProjectData, name: string): string | null {
  const events = projectArray(data, "events");
  const index = events.findIndex((event, eventIndex) => eventName(event, eventIndex) === name);
  if (index < 0) return null;
  return eventID(events[index], index);
}

export function boundEventNameForTarget(
  data: GBAProjectData,
  options: BindEventToTargetOptions
): string | null {
  const targetName = options.targetName.trim();
  const bindingKey = options.bindingKey.trim();
  if (!targetName || !bindingKey) return null;

  const targets = bindingTargetsForKind(data, options.targetKind);
  const target = targets.find((item) => nullableString(item.name) === targetName);
  if (!target) return null;

  if (options.targetKind === "spriteFrame") {
    const frameIndex = spriteFrameIndexFromBindingKey(bindingKey);
    if (frameIndex === null) return null;
    return spriteFrameEventName(target.frameEvents, frameIndex);
  }

  if (options.targetKind === "room") {
    return resolveEntityBindingSlotValue(target, "room", bindingKey);
  }
  if (options.targetKind === "actor") {
    return resolveEntityBindingSlotValue(actorWithRuntimeBinding(data, target), "actor", bindingKey);
  }
  if (options.targetKind === "trigger") {
    return resolveEntityBindingSlotValue(target, "trigger", bindingKey);
  }

  return null;
}

export interface CreateBoundEventForTargetResult {
  created: boolean;
  data: GBAProjectData;
  eventID: string;
}

export interface CreateBoundEventsForTargetsOptions {
  category?: string;
  eventIDs: string[];
  initialCommands: string[];
  targets: BindEventToTargetOptions[];
}

export interface CreateBoundEventsForTargetsResult {
  data: GBAProjectData;
  eventIDs: string[];
  eventNames: string[];
}

export function createBoundEventsForTargetsInProject(
  data: GBAProjectData,
  options: CreateBoundEventsForTargetsOptions
): CreateBoundEventsForTargetsResult | null {
  if (options.targets.length === 0 || options.targets.length !== options.eventIDs.length) return null;
  const eventIDs = options.eventIDs.map((eventID) => eventID.trim());
  if (eventIDs.some((eventID) => !eventID) || new Set(eventIDs).size !== eventIDs.length) return null;
  const initialCommands = options.initialCommands.map((command) => normalizedCommand(command));
  const category = options.category?.trim() || "Custom";
  let next = cloneProjectData(data);
  const eventNames: string[] = [];

  for (let index = 0; index < options.targets.length; index += 1) {
    const target = options.targets[index]!;
    const eventIDToCreate = eventIDs[index]!;
    const targetName = target.targetName.trim();
    const bindingKey = target.bindingKey.trim();
    if (!targetName || !bindingKey) return null;
    if (projectArray(next, "events").some((event, eventIndex) => eventID(event, eventIndex) === eventIDToCreate)) return null;
    if (!bindingTargetsForKind(next, target.targetKind).some((candidate) => nullableString(candidate.name) === targetName)) return null;

    const name = uniqueEventNameInProject(next, suggestBoundEventName(targetName, bindingKey));
    const event = makeEvent({ id: eventIDToCreate, name, category });
    if (!event) return null;
    event.steps = initialCommands.map((command) => ({ command, isEnabled: true }));
    next.events = [...projectArray(next, "events"), event];
    const bound = bindEventToTargetInProject(next, eventIDToCreate, target);
    if (bound === next) return null;
    next = bound;
    eventNames.push(name);
  }

  return { data: next, eventIDs, eventNames };
}

export function createBoundEventForTargetInProject(
  data: GBAProjectData,
  options: BindEventToTargetOptions & { category?: string; eventID: string }
): CreateBoundEventForTargetResult | null {
  const eventIDToCreate = options.eventID.trim();
  if (!eventIDToCreate) return null;

  const existingName = boundEventNameForTarget(data, options);
  if (existingName) {
    const existingID = eventIDByName(data, existingName);
    if (existingID) {
      return { created: false, data, eventID: existingID };
    }
  }

  const suggestedName = uniqueEventNameInProject(
    data,
    suggestBoundEventName(options.targetName, options.bindingKey)
  );
  const presentation = deriveEventsWorkspacePresentation(data);
  const contextKind = options.targetKind === "room"
    ? "room"
    : options.targetKind === "actor"
      ? "actor"
      : "trigger";
  const contextNode = presentation.graphNodes.find((node) => (
    node.nodeKind === "context"
    && node.contextKind === contextKind
    && node.targetName === options.targetName.trim()
  )) ?? null;
  const preferred = contextNode
    ? preferredPositionBesideBinding(contextNode, options.bindingKey)
    : undefined;
  let next = createEventWithGraphPositionInProject(data, {
    id: eventIDToCreate,
    name: suggestedName,
    category: options.category?.trim() || "Custom"
  }, preferred ? { preferred } : undefined);
  if (next === data) return null;

  next = bindEventToTargetInProject(next, eventIDToCreate, options);
  if (next === data) return null;

  return { created: true, data: next, eventID: eventIDToCreate };
}

export function bindEventToTargetInProject(
  data: GBAProjectData,
  eventIDToBind: string,
  options: BindEventToTargetOptions
): GBAProjectData {
  const targetName = options.targetName.trim();
  const bindingKey = options.bindingKey.trim();
  if (!targetName || !bindingKey) return data;

  const next = cloneProjectData(data);
  const events = projectArray(next, "events");
  const eventIndex = eventIndexByID(events, eventIDToBind);
  if (eventIndex < 0) return data;

  const eventNameToBind = eventName(events[eventIndex], eventIndex);
  const targets = bindingTargetsForKind(next, options.targetKind);
  const target = targets.find((item) => nullableString(item.name) === targetName);
  if (!target) return data;

  if (options.targetKind === "room" && bindingKey.startsWith("runtime:/")) {
    const updated = updateRuntimeEventState(target, bindingKey, "eventName", eventNameToBind);
    if (updated === target) return data;
    for (const room of [...projectArray(next, "rooms"), ...projectArray(next, "scenas")]) {
      if (room.name === targetName) Object.assign(room, updateRuntimeEventState(room, bindingKey, "eventName", eventNameToBind));
    }
    return next;
  }
  if (options.targetKind === "actor" && bindingKey === "onInteract") {
    for (const room of [...projectArray(next, "rooms"), ...projectArray(next, "scenas")]) {
      if (room.name !== target.roomName) continue;
      const menuState = menuActorRuntimeState(room, target);
      if (menuState) Object.assign(room, updateRuntimeEventState(room, menuState.bindingKey, "eventName", eventNameToBind));
    }
  }

  if (options.targetKind === "spriteFrame") {
    const frameIndex = spriteFrameIndexFromBindingKey(bindingKey);
    const frameCount = typeof target.frameCount === "number" && Number.isFinite(target.frameCount) && target.frameCount > 0
      ? Math.floor(target.frameCount)
      : 1;
    if (frameIndex === null || frameIndex < 0 || frameIndex >= frameCount) return data;
    setSpriteFrameEventName(target, frameIndex, eventNameToBind);
    return next;
  }

  if (isDirectBindingKey(options.targetKind, bindingKey)) {
    target[bindingKey] = eventNameToBind;
    return next;
  }

  const bindings = isRecord(target.eventBindings) ? target.eventBindings : {};
  target.eventBindings = bindings;
  bindings[bindingKey] = eventNameToBind;
  if (options.targetKind === "room") {
    for (const scene of [...projectArray(next, "rooms"), ...projectArray(next, "scenas")]) {
      if (scene.name !== targetName) continue;
      scene.eventBindings = { ...(isRecord(scene.eventBindings) ? scene.eventBindings : {}), [bindingKey]: eventNameToBind };
    }
  }
  return next;
}

export function removeEventTargetBindingInProject(
  data: GBAProjectData,
  options: BindEventToTargetOptions
): GBAProjectData {
  const targetName = options.targetName.trim();
  const bindingKey = options.bindingKey.trim();
  if (!targetName || !bindingKey) return data;

  const next = cloneProjectData(data);
  const targets = bindingTargetsForKind(next, options.targetKind);
  const target = targets.find((item) => nullableString(item.name) === targetName);
  if (!target) return data;

  if (options.targetKind === "room" && bindingKey.startsWith("runtime:/")) {
    if (!runtimeEventValue(target, bindingKey)) return data;
    for (const room of [...projectArray(next, "rooms"), ...projectArray(next, "scenas")]) {
      if (room.name === targetName) Object.assign(room, updateRuntimeEventState(room, bindingKey, "eventName", ""));
    }
    return next;
  }

  if (options.targetKind === "actor" && bindingKey === "onInteract") {
    let updated = false;
    for (const room of [...projectArray(next, "rooms"), ...projectArray(next, "scenas")]) {
      if (room.name !== entityRoomName(target, projectRooms(next))) continue;
      const state = menuActorRuntimeState(room, target);
      if (state?.eventName) {
        Object.assign(room, updateRuntimeEventState(room, state.bindingKey, "eventName", ""));
        updated = true;
      }
    }
    if (updated) {
      if (isRecord(target.eventBindings)) delete target.eventBindings.onInteract;
      target.eventName = "";
      return next;
    }
  }

  if (options.targetKind === "spriteFrame") {
    const frameIndex = spriteFrameIndexFromBindingKey(bindingKey);
    const frameCount = target && typeof target.frameCount === "number" && Number.isFinite(target.frameCount) && target.frameCount > 0
      ? Math.floor(target.frameCount)
      : 1;
    if (!target || frameIndex === null || frameIndex < 0 || frameIndex >= frameCount || !spriteFrameEventName(target.frameEvents, frameIndex)) {
      return data;
    }
    setSpriteFrameEventName(target, frameIndex, null);
    return next;
  }

  if (isDirectBindingKey(options.targetKind, bindingKey)) {
    if (!nullableString(target[bindingKey])) return data;
    target[bindingKey] = "";
    return next;
  }

  if (!isRecord(target.eventBindings) || target.eventBindings[bindingKey] === undefined) {
    return data;
  }

  delete target.eventBindings[bindingKey];
  if (options.targetKind === "room") {
    for (const scene of [...projectArray(next, "rooms"), ...projectArray(next, "scenas")]) {
      if (scene.name === targetName && isRecord(scene.eventBindings)) delete scene.eventBindings[bindingKey];
    }
  }
  return next;
}

export function deriveEventsWorkspacePresentation(
  data: GBAProjectData,
  pluginContext: EventsWorkspacePluginContext = { registry: null }
): EventsWorkspacePresentation {
  const pluginRegistry = pluginContext.registry ?? emptyProjectPluginRegistry();
  const sourceEvents = projectArray(data, "events");
  const eventDocuments = sourceEvents.map((event, index) => normalizeGBAEventDocument(event, index));
  const eventNames = new Set(eventDocuments.map((event) => event.name));
  const resourceOptions = commandResourceOptions(data, sourceEvents);
  const palette = commandPalette(data, sourceEvents, pluginRegistry);
  const graphEdges = sourceEvents.flatMap((event, index) => graphEdgesForEvent(event, index, eventNames));
  const bindings = boundEventNames(data);
  const bindingLabels = bindingLabelsByEventName(data);
  const commandEventReferences = sourceEvents.flatMap((event) => eventSteps(event).flatMap((step) => commandReferencedEvents(step.command)));
  const referenceNames = [...bindings, ...commandEventReferences];

  const events = sourceEvents.map((event, index) => {
    const eventDocument = eventDocuments[index]!;
    const id = eventDocument.id;
    const name = eventDocument.name;
    const category = normalizedCategory(eventDocument.category);
    const steps = eventSteps(event);
    const enabledSteps = steps.filter((step) => step.isEnabled);
    const commandVerbs = Array.from(new Set(enabledSteps.map((step) => commandVerb(step.command))));
    const missingReferences = Array.from(
      new Set(enabledSteps.flatMap((step) => missingResourceReferences(step.command, data, eventNames)))
    );
    const referenceCount = referenceNames.filter((reference) => reference === name).length;

    const eventKind: EventsWorkspaceEvent["eventKind"] = eventDocument.eventKind;
    return {
      id,
      name,
      category,
      detail: eventDocument.detail,
      primaryCommand: eventDocument.primaryCommand,
      steps: workspaceSteps(event, data, eventNames, palette, resourceOptions),
      stepCount: steps.length,
      enabledStepCount: enabledSteps.length,
      referenceCount,
      isUnlinked: referenceCount === 0,
      commandVerbs: commandVerbs.length > 0 ? commandVerbs : ["noop"],
      bindingLabels: bindingLabels.get(name) ?? [],
      missingReferences,
      eventKind,
      procedure: normalizeEventProcedureDefinition(event.procedure)
    };
  });

  const groupsByCategory = new Map<string, EventsWorkspaceEvent[]>();
  for (const event of events) {
    const current = groupsByCategory.get(event.category) ?? [];
    current.push(event);
    groupsByCategory.set(event.category, current);
  }

  const groups = Array.from(groupsByCategory.entries())
    .sort(([lhs], [rhs]) => groupOrder(lhs) - groupOrder(rhs) || lhs.localeCompare(rhs, "pt-BR"))
    .map(([category, groupEvents]) => ({
      id: category.toLowerCase(),
      title: groupTitle(category),
      events: groupEvents.sort((lhs, rhs) => lhs.name.localeCompare(rhs.name, "pt-BR"))
    }));

  const categories = groups.map((group) => ({
    category: group.events[0]?.category ?? group.title,
    count: group.events.length
  }));
  const graphBindingEdges = deriveGraphBindingEdges(data, events);
  const graphNodes = deriveGraphNodes(data, events, graphEdges, graphBindingEdges);
  const graphConnectTargetsBySource = deriveGraphConnectTargetsBySource(graphNodes, graphEdges);
  const sceneNames = projectRooms(data)
    .map((room, index) => stringField(room.name, `Cena ${index + 1}`))
    .filter((name, index, names) => names.indexOf(name) === index);

  return {
    groups,
    graphNodes,
    graphEdges,
    graphBindingEdges,
    graphConnectTargetsBySource,
    commandPalette: palette,
    bindingTargets: quickBindingTargets(data),
    sceneNames,
    summary: {
      eventCount: events.length,
      stepCount: events.reduce((sum, event) => sum + event.stepCount, 0),
      enabledStepCount: events.reduce((sum, event) => sum + event.enabledStepCount, 0),
      unlinkedEventCount: events.filter((event) => event.isUnlinked).length,
      missingReferenceCount: events.reduce((sum, event) => sum + event.missingReferences.length, 0),
      graphEdgeCount: graphEdges.length,
      categories
    }
  };
}

export function prepareEventExport(data: GBAProjectData, eventIDToExport: string): PreparedEventExport | null {
  const presentation = deriveEventsWorkspacePresentation(data);
  const event = presentation.groups.flatMap((group) => group.events).find((item) => item.id === eventIDToExport);
  if (!event) return null;

  const graphEdges = presentation.graphEdges.filter((edge) => (
    edge.sourceEventID === event.id || edge.targetEventName === event.name
  ));
  const steps = event.steps.map((step) => ({
    index: step.index,
    command: step.command,
    isEnabled: step.isEnabled,
    missingReferences: step.missingReferences
  }));
  const exportedEvent = {
    id: event.id,
    name: event.name,
    category: event.category,
    detail: event.detail,
    primaryCommand: event.primaryCommand,
    steps,
    bindingLabels: event.bindingLabels,
    missingReferences: event.missingReferences,
    commandVerbs: event.commandVerbs,
    graphEdges
  };

  return {
    fileName: `${safeFileStem(event.name)}.event.json`,
    contents: JSON.stringify({ kind: "gbastudio.event", version: 1, event: exportedEvent }, null, 2)
  };
}

function eventMatchesQuery(event: EventsWorkspaceEvent, query: string): boolean {
  if (!query) return true;

  return [
    event.name,
    event.category,
    event.detail ?? "",
    event.primaryCommand,
    event.commandVerbs.join(" "),
    event.bindingLabels.join(" "),
    event.missingReferences.join(" "),
    event.steps.map((step) => step.command).join(" ")
  ].some((value) => value.toLocaleLowerCase("pt-BR").includes(query));
}

function eventMatchesStatus(event: EventsWorkspaceEvent, status: EventsWorkspaceFilterStatus): boolean {
  if (status === "unlinked") return event.isUnlinked;
  if (status === "warnings") return event.missingReferences.length > 0;
  return true;
}

export function filterEventsWorkspaceGroups(
  groups: EventsWorkspaceGroup[],
  options: EventsWorkspaceFilterOptions
): EventsWorkspaceGroup[] {
  const query = options.query?.trim().toLocaleLowerCase("pt-BR") ?? "";
  const status = options.status ?? "";

  return groups
    .map((group) => ({
      ...group,
      events: group.events.filter((event) => eventMatchesQuery(event, query) && eventMatchesStatus(event, status))
    }))
    .filter((group) => group.events.length > 0);
}

function commandSuggestionMatchesTab(suggestion: EventsWorkspaceCommandSuggestion, tab: EventsCommandMenuTab): boolean {
  if (tab === "favorites") {
    return suggestion.isFavorite;
  }
  if (tab === "recipes") {
    return suggestion.isRecipe;
  }
  return true;
}

function commandSuggestionMatchesQuery(suggestion: EventsWorkspaceCommandSuggestion, query: string): boolean {
  if (!query) return true;
  return [
    suggestion.label,
    suggestion.searchAliases?.join(" ") ?? "",
    suggestion.authoringCategories?.map(group => `${group.category} ${group.section ?? ""}`).join(" ") ?? "",
    suggestion.command,
    suggestion.category,
    suggestion.section ?? "",
    eventCommandCategory(suggestion.category),
    eventCommandDescription(suggestion.command.split(/\s+/)[0] ?? "") ?? "",
    suggestion.command.startsWith("change_scene ") ? "trocar sala transicao chegada" : "",
    suggestion.commandTemplate ?? "",
    suggestion.badge ?? "",
    suggestion.targetName ?? "",
    suggestion.parameters.map((parameter) => `${parameter.label} ${parameter.value}`).join(" ")
  ].some((value) => normalizeEventSearch(value).includes(query));
}

export function filterEventsCommandSuggestions(
  suggestions: EventsWorkspaceCommandSuggestion[],
  options: EventsCommandSuggestionFilterOptions
): EventsWorkspaceCommandSuggestion[] {
  const query = normalizeEventSearch(options.query?.trim() ?? "");
  const tab = options.tab ?? "all";
  return suggestions.filter((suggestion) => commandSuggestionMatchesTab(suggestion, tab) && commandSuggestionMatchesQuery(suggestion, query));
}

export interface EventsCommandContextOptions {
  eventCategory?: string;
  bindingLabels?: string[];
}

function normalizedContextText(options: EventsCommandContextOptions): string {
  return [options.eventCategory ?? "", ...(options.bindingLabels ?? [])]
    .join(" ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function preferredCommandCategories(options: EventsCommandContextOptions): string[] {
  const context = normalizedContextText(options);
  if (context.includes("ator") || context.includes("npc")) {
    return ["Ator", "Movimento", "Dialogo", "Diálogo e menus", "Audio", "Música e efeitos sonoros"];
  }
  if (context.includes("dialog")) {
    return ["Dialogo", "Diálogo e menus", "Menu", "Entrada de controle", "Audio", "Música e efeitos sonoros"];
  }
  if (context.includes("trigger")) {
    return ["Fluxo de controle", "Controle", "Cena", "Dialogo", "Audio", "Temporizador"];
  }
  if (context.includes("cena") || context.includes("room") || context.includes("sala")) {
    return ["Cena", "Câmera", "Tela", "Audio", "Música e efeitos sonoros", "Cutscene FX"];
  }
  return [options.eventCategory ?? "", "Fluxo de controle", "Controle", "Dialogo", "Cena"].filter(Boolean);
}

export function rankEventsCommandSuggestionsForContext(
  suggestions: EventsWorkspaceCommandSuggestion[],
  options: EventsCommandContextOptions
): EventsWorkspaceCommandSuggestion[] {
  const preferred = preferredCommandCategories(options);
  const categoryRank = new Map(preferred.map((category, index) => [category, index]));
  return suggestions
    .map((suggestion, index) => ({ suggestion, index }))
    .sort((lhs, rhs) => {
      const leftCategory = categoryRank.get(lhs.suggestion.category) ?? preferred.length + 10;
      const rightCategory = categoryRank.get(rhs.suggestion.category) ?? preferred.length + 10;
      const leftScore = leftCategory * 10 - (lhs.suggestion.isRecipe ? 2 : 0) - (lhs.suggestion.isFavorite ? 1 : 0);
      const rightScore = rightCategory * 10 - (rhs.suggestion.isRecipe ? 2 : 0) - (rhs.suggestion.isFavorite ? 1 : 0);
      return leftScore - rightScore || lhs.index - rhs.index;
    })
    .map(({ suggestion }) => suggestion);
}

function naturalStepDescription(step: EventsWorkspaceStep, previousStep: EventsWorkspaceStep | undefined): string {
  const parts = commandParts(step.command);
  const target = parts[1] ?? "destino";
  if (step.commandVerb === "show_dialogue") return `exibe o diálogo ${target}`;
  if (step.commandVerb === "show_choice") return `mostra as escolhas de ${target}`;
  if (step.commandVerb === "play_music") return `toca ${target}`;
  if (step.commandVerb === "play_sfx") return `reproduz o efeito ${target}`;
  if (step.commandVerb === "change_scene") return `troca para a cena ${target}`;
  if (step.commandVerb === "call_event" || step.commandVerb === "call_procedure") {
    const conditional = previousStep?.flow.kind === "condition" || step.flow.kind === "condition-dependent";
    return conditional ? `quando a condição for verdadeira, chama o evento ${target}` : `chama o evento ${target}`;
  }
  if (step.commandVerb.startsWith("if_")) return `verifica ${target}`;
  return step.commandLabel.toLocaleLowerCase("pt-BR");
}

export function describeEventFlow(event: EventsWorkspaceEvent): string {
  const enabledSteps = event.steps.filter((step) => step.isEnabled);
  if (enabledSteps.length === 0) return "Este evento não possui passos ativos.";
  const descriptions = enabledSteps.map((step, index) => naturalStepDescription(step, enabledSteps[index - 1]));
  const joined = descriptions.length === 1
    ? descriptions[0]
    : `${descriptions.slice(0, -1).join("; ")}; e ${descriptions.at(-1)}`;
  return `Executa ${enabledSteps.length} ${enabledSteps.length === 1 ? "passo" : "passos"}: ${joined}.`;
}

export function menuStateForEventsCommandCategory(category: string): EventsCommandMenuState {
  return {
    query: category.trim(),
    tab: "all"
  };
}
