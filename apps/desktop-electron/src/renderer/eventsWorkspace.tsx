import { EventEditingContext } from "./EventEditingContext";
import { EventBlockLibrary } from "./EventBlockLibrary";
import { runtimeEventStates } from "../shared/sceneEventStates";
import { Fragment, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Maximize2,
  AudioLines,
  ArrowRight,
  Hash,
  Map as MapIcon,
  MessageSquare,
  Plus,
  ScanSearch,
  SlidersHorizontal,
  UserRound,
  Zap,
  ZoomIn,
  ZoomOut,
  type LucideIcon
} from "lucide-react";

import { wheelZoomCanvasViewport } from "../shared/canvasWorkspace";
import { estimateContextNodeHeight } from "../shared/eventsWorkspace/graphLayout";
import type { GBAProjectData } from "../shared/projectFile";
import { findMenuSliderScreen, menuSliderSprite, menuSliderSpriteOptions, type MenuSliderItemPatch } from "../shared/menuSlider";
import { sceneDisplayName } from "../shared/sceneDisplayName";
import { sceneTransitionDisplayName } from "../shared/sceneTransition";
import {
  createPreviewRuntime,
  bootPreviewRuntimeAtRoom,
  dispatchPreviewRuntimeAction,
  enablePreviewDebugger,
  runPreviewRuntimeEvent,
  tickPreviewRuntime,
  previewRuntimeStartMenuItems,
  togglePreviewDebuggerBreakpoint,
  type PreviewRuntimeState
} from "../shared/previewRuntime";
import { deriveGbaDebuggerPresentation } from "../shared/gbaDebugger";
import { WorkspaceInspectorRail } from "./WorkspaceInspectorRail";
import { InspectorNumber } from "./InspectorControls";
import { StudioChip, WorkspaceContextToolbar, WorkspaceEmptyState } from "./studioUi";
import {
  EventStructureEditor,
  eventBlockToneForCategory,
  type EventStructureStepPresentation
} from "./EventStructureEditor";
import type { EventStructureInsertionTarget } from "../shared/eventStructure";
import {
  deriveEventsWorkspaceValidationIssues,
  describeEventFlow,
  filterEventsCommandSuggestions,
  filterEventsWorkspaceGraphByScene,
  rankEventsCommandSuggestionsForContext,
  type BindEventToTargetOptions,
  type ConnectEventGraphNodesOptions,
  type EventsCommandMenuTab,
  type EventsWorkspaceBindingTarget,
  type EventsWorkspaceCommandParameter,
  type EventsWorkspaceCommandSuggestion,
  type EventsWorkspaceContextBindingSlotState,
  type EventsWorkspaceEvent,
  type EventsWorkspaceFilterStatus,
  type EventsWorkspaceGraphContextKind,
  type EventsWorkspaceGraphEdge,
  type EventsWorkspaceGraphNode,
  type EventsWorkspacePresentation,
  type EventsWorkspaceStep,
  type RetargetEventGraphEdgeOptions,
  type RemoveEventGraphEdgeOptions,
  type UpdateEventFields,
  type UpdateEventGraphNodePosition,
  type UpdateEventStepFields
} from "../shared/eventsWorkspace";
import type { ProjectVariableEntry } from "../shared/variablesWorkspace";
import {
  SCENE_ROUTE_DIRECTIONS,
  findSceneRouteTable,
  type SceneRouteCase,
  type SceneRouteTable,
  type SceneRouteTablePatch
} from "../shared/sceneRouteTables";

export interface EventsWorkspaceProps {
  presentation: EventsWorkspacePresentation | null;
  projectData: GBAProjectData;
  variables?: ProjectVariableEntry[];
  focusedEventName?: string | null;
  focusedEventRequestID?: number;
  onCreateEvent(): void;
  onCreateVariable?(kind?: "variable" | "constant", valueType?: "number" | "text"): void;
  onRemoveVariable?(name: string, kind: "variable" | "constant"): void;
  onUpdateEventFields(eventID: string, fields: UpdateEventFields): void;
  onAddEventStep(eventID: string, eventName: string, command?: string): void;
  onInsertEventSteps?(eventID: string, target: EventStructureInsertionTarget, commands: string[]): void;
  onUpdateEventStep(eventID: string, stepIndex: number, fields: UpdateEventStepFields): void;
  onUpdateSceneRouteTable?(tableID: string, patch: SceneRouteTablePatch): void;
  onUpdateMenuSliderItem?(sceneName: string, screenID: string, itemID: string, patch: MenuSliderItemPatch): void;
  onUpdateEventGraphNodePosition(eventID: string, position: UpdateEventGraphNodePosition): void;
  onRetargetEventGraphEdge(options: RetargetEventGraphEdgeOptions): void;
  onConnectEventGraphNodes(options: ConnectEventGraphNodesOptions): void;
  onRemoveEventGraphEdge(options: RemoveEventGraphEdgeOptions): void;
  onBindEventToTarget(eventID: string, options: BindEventToTargetOptions): void;
  onCreateBoundEventForTarget(options: BindEventToTargetOptions): string | null;
  onRemoveEventTargetBinding(options: BindEventToTargetOptions): void;
  onRemoveEventStep(eventID: string, stepIndex: number, eventName: string): void;
  onRenameEvent(eventID: string, currentName: string): void;
  onDuplicateEvent(eventID: string, currentName: string): void;
  onExportEvent(eventID: string, currentName: string): void;
  onRemoveEvent(eventID: string, currentName: string): void;
  onRelayoutEventsGraph(): void;
}

type EventInspectorSelection =
  | { kind: "event"; eventID: string }
  | { kind: "edge"; edgeID: string }
  | { kind: "step"; eventID: string; stepIndex: number }
  | { kind: "context"; nodeID: string };

type EventWorkspaceView = "build" | "map" | "debug";
type EventEditorMode = "guided" | "advanced" | "properties";

type EventEditorProps = EventsWorkspaceProps & {
  onOpenCommandMenu(eventID: string, stepIndex: number | null): void;
};

const commandMenuTabs: Array<{ id: EventsCommandMenuTab; label: string }> = [
  { id: "all", label: "Todos" },
  { id: "favorites", label: "Favoritos" },
  { id: "recipes", label: "Modelos de script" }
];

function commandSuggestionsByCategory(suggestions: EventsWorkspaceCommandSuggestion[]): Array<[string, EventsWorkspaceCommandSuggestion[]]> {
  const groups = new Map<string, EventsWorkspaceCommandSuggestion[]>();
  for (const suggestion of suggestions) {
    const current = groups.get(suggestion.category) ?? [];
    current.push(suggestion);
    groups.set(suggestion.category, current);
  }

  return Array.from(groups.entries())
    .map(([category, values]) => {
      const sortedValues = [...values].sort((lhs, rhs) =>
        lhs.label.localeCompare(rhs.label, "pt-BR")
      );
      return [category, sortedValues] as [string, EventsWorkspaceCommandSuggestion[]];
    })
    .sort((lhs, rhs) => lhs[0].localeCompare(rhs[0], "pt-BR"));
}

function commandWithParameterValue(command: string, parameter: EventsWorkspaceCommandParameter, value: string): string {
  const parts = command.split(/\s+/).filter(Boolean);
  const safeValue = value.trim();
  while (parts.length <= parameter.tokenIndex) {
    parts.push("");
  }
  parts[parameter.tokenIndex] = safeValue || parameter.defaultValue || parameter.value;
  return parts.join(" ").trim() || "noop";
}

function inlineCommandParameterLabel(parameter: EventsWorkspaceCommandParameter): string {
  return parameter.label;
}

function canEditStepInline(step: EventsWorkspaceStep): boolean {
  return !step.commandAvailability && step.commandVerb !== "slider" && step.commandParameters.length > 0 &&
    step.commandParameters.length <= 2 &&
    !step.commandVerb.startsWith("if_") &&
    step.commandVerb !== "else" &&
    !step.commandParameters.some((parameter) => parameter.kind === "routeTable");
}

function commandCardClassName(suggestion: EventsWorkspaceCommandSuggestion): string {
  return [
    "event-command-card",
    `tone-${eventBlockToneForCategory(suggestion.category)}`,
    suggestion.runtimeStatus === "ok-rom" ? "ok" : "",
    suggestion.runtimeStatus === "preview-p0" ? "preview" : "",
    suggestion.runtimeStatus === "preview-runtime" ? "runtime" : "",
    suggestion.runtimeStatus === "unsupported" ? "pending" : "",
    suggestion.isRecipe ? "recipe" : ""
  ].filter(Boolean).join(" ");
}

function commandCardPreview(
  suggestion: EventsWorkspaceCommandSuggestion,
  options?: { compact?: boolean }
): React.ReactElement {
  if (options?.compact) {
    return <strong>{suggestion.label}</strong>;
  }

  return (
    <>
      <div className="event-command-card-main">
        <strong>{suggestion.label}</strong>
        <small>{suggestion.section ? `${suggestion.category} / ${suggestion.section}` : suggestion.category}</small>
      </div>
      <div className="event-command-card-meta">
        {suggestion.badge ? <em>{suggestion.badge}</em> : null}
        {suggestion.parameters.slice(0, 3).map((parameter) => (
          <span key={`${suggestion.id}-${parameter.id}`}>
            {parameter.label}: {parameter.value || "-"}
          </span>
        ))}
        {suggestion.parameters.length > 3 ? <span>+{suggestion.parameters.length - 3}</span> : null}
      </div>
    </>
  );
}

function eventStepLabel(step: EventsWorkspaceStep): string {
  if (step.command === "noop") return "Sem operação";
  if (step.commandLabel.trim()) return step.commandLabel;
  return step.command || "Comando personalizado";
}

function eventStepLabelCategory(step: EventsWorkspaceStep): string {
  if (step.commandSection && step.commandSection !== step.commandCategory) {
    return `${step.commandCategory} · ${step.commandSection}`;
  }
  return step.commandCategory;
}

interface CommandSuggestionAccordionProps {
  groups: Array<[string, EventsWorkspaceCommandSuggestion[]]>;
  expandedCategories: ReadonlySet<string>;
  enableDrag?: boolean;
  onToggleCategory(category: string): void;
  onChooseSuggestion(suggestion: EventsWorkspaceCommandSuggestion): void;
}

function CommandSuggestionAccordion({
  groups,
  expandedCategories,
  enableDrag = false,
  onToggleCategory,
  onChooseSuggestion
}: CommandSuggestionAccordionProps): React.ReactElement {
  if (!groups.length) {
    return <p className="muted">Nenhum evento corresponde à busca.</p>;
  }

  return (
    <div className="event-command-accordion" role="list">
      {groups.map(([category, categorySuggestions]) => {
        const expanded = expandedCategories.has(category);
        return (
          <section className={["event-command-accordion-group", `tone-${eventBlockToneForCategory(category)}`, expanded ? "expanded" : ""].filter(Boolean).join(" ")} key={category}>
            <button
              aria-expanded={expanded}
              className="event-command-accordion-trigger"
              data-tone={eventBlockToneForCategory(category)}
              onClick={() => onToggleCategory(category)}
              type="button"
            >
              <strong>{category}</strong>
              <span>{categorySuggestions.length}</span>
              <em aria-hidden="true">{expanded ? "−" : "+"}</em>
            </button>
            {expanded ? (
              <div className="event-command-accordion-items">
                {categorySuggestions.map((suggestion) => (
                  <button
                    className={[commandCardClassName(suggestion), "compact"].filter(Boolean).join(" ")}
                    data-tone={eventBlockToneForCategory(suggestion.category)}
                    draggable={enableDrag}
                    key={suggestion.id}
                    onClick={() => onChooseSuggestion(suggestion)}
                    onDragStart={enableDrag ? (event) => {
                      event.dataTransfer.setData("application/x-gba-command", suggestion.command);
                      event.dataTransfer.setData("text/plain", suggestion.command);
                      event.dataTransfer.effectAllowed = "copy";
                    } : undefined}
                    title={suggestion.label}
                    type="button"
                  >
                    {commandCardPreview(suggestion, { compact: true })}
                  </button>
                ))}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}

function commandParameterInput(
  parameter: EventsWorkspaceCommandParameter,
  onChange: (value: string) => void
): React.ReactElement {
  const commonLabel = `${parameter.label} do evento`;
  if (parameter.kind === "value" && parameter.options.some(option => option.startsWith("const("))) {
    const listID = `constant-values-${parameter.id}`;
    return <label className="event-command-parameter"><span>{parameter.label}</span>
      <input aria-label={commonLabel} type="text" list={listID} value={parameter.value} onChange={event => onChange(event.currentTarget.value)}/>
      <datalist id={listID}>{parameter.options.map(option => <option key={option} value={option}/>)}</datalist>
    </label>;
  }
  if (parameter.options.length > 0) {
    const hasCurrentOption = parameter.options.includes(parameter.value);
    return (
      <label className={parameter.isKnownValue ? "event-command-parameter" : "event-command-parameter warning"}>
        <span>{parameter.label}</span>
        <select aria-label={commonLabel} onChange={(event) => onChange(event.currentTarget.value)} value={parameter.value}>
          {hasCurrentOption ? null : <option value={parameter.value}>{parameter.value || "Valor atual"}</option>}
          {parameter.options.map((option) => (
            <option key={`${parameter.id}-${option}`} value={option}>{parameter.label === "Direção" ? ({ up: "Cima", down: "Baixo", left: "Esquerda", right: "Direita" } as Record<string,string>)[option] ?? option : option}</option>
          ))}
        </select>
      </label>
    );
  }

  return (
    <label className="event-command-parameter">
      <span>{parameter.label}</span>
      <input
        aria-label={commonLabel}
        onChange={(event) => onChange(event.currentTarget.value)}
        type="text"
        value={parameter.value}
      />
    </label>
  );
}

function sceneNamesForRouteEditor(projectData: GBAProjectData): string[] {
  const source = Array.isArray(projectData.scenas)
    ? projectData.scenas
    : Array.isArray(projectData.rooms) ? projectData.rooms : [];
  return Array.from(new Set(source.flatMap((room) => {
    if (!room || typeof room !== "object" || Array.isArray(room)) return [];
    const record = room as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    return name ? [name] : [];
  })));
}

function sceneSizeForRouteEditor(projectData: GBAProjectData, sceneName: string): { height: number; width: number } | null {
  const source = Array.isArray(projectData.scenas)
    ? projectData.scenas
    : Array.isArray(projectData.rooms) ? projectData.rooms : [];
  const room = source.find((candidate) => {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return false;
    return (candidate as Record<string, unknown>).name === sceneName;
  });
  if (!room || typeof room !== "object" || Array.isArray(room)) return null;
  const record = room as Record<string, unknown>;
  const width = typeof record.width === "number" && Number.isFinite(record.width) ? Math.max(1, Math.floor(record.width)) : null;
  const height = typeof record.height === "number" && Number.isFinite(record.height) ? Math.max(1, Math.floor(record.height)) : null;
  return width !== null && height !== null ? { height, width } : null;
}

function SceneRouteTableEditor({
  table,
  projectData,
  variables,
  onUpdate
}: {
  table: SceneRouteTable;
  projectData: GBAProjectData;
  variables: ProjectVariableEntry[];
  onUpdate?: (tableID: string, patch: SceneRouteTablePatch) => void;
}): React.ReactElement {
  const sceneNames = Array.from(new Set([...sceneNamesForRouteEditor(projectData), ...table.routes.map((route) => route.scene), table.fallback?.scene ?? ""].filter(Boolean)));
  const variableNames = Array.from(new Set([...variables.filter((entry) => entry.valueType !== "text").map((entry) => entry.name), table.variable].filter(Boolean)));
  const updateRoutes = (routes: SceneRouteCase[]) => onUpdate?.(table.id, { routes });
  const updateRoute = (routeIndex: number, patch: Partial<SceneRouteCase>) => updateRoutes(table.routes.map((route, index) => index === routeIndex ? { ...route, ...patch } : route));

  return (
    <section className="event-scene-route-editor" aria-label={`Tabela de rotas ${table.name}`}>
      <div className="event-scene-route-editor-header">
        <div>
          <span>Rotas da cena</span>
          <strong>{table.name}</strong>
        </div>
        <button
          type="button"
          onClick={() => {
            const usedValues = new Set(table.routes.map((route) => route.value));
            const value = Array.from({ length: 64 }, (_item, index) => index).find((candidate) => !usedValues.has(candidate)) ?? table.routes.length;
            updateRoutes([...table.routes, {
              value,
              scene: sceneNames[0] ?? "",
              x: 0,
              y: 0,
              direction: "down",
              fadeFrames: 0
            }]);
          }}
          disabled={!onUpdate || sceneNames.length === 0}
        >
          Adicionar rota
        </button>
      </div>
      <label className="event-context-field">
        <span>Variável de decisão</span>
        <select
          aria-label={`Variável da tabela ${table.name}`}
          disabled={!onUpdate}
          onChange={(event) => onUpdate?.(table.id, { variable: event.currentTarget.value })}
          value={table.variable}
        >
          {variableNames.map((name) => <option key={name} value={name}>{name}</option>)}
          {!variableNames.includes(table.variable) ? <option value={table.variable}>{table.variable || "Escolher variável"}</option> : null}
        </select>
      </label>
      {table.routes.length ? table.routes.map((route, routeIndex) => (
        <div className="event-scene-route-row" key={`${table.id}-${route.value}-${routeIndex}`}>
          {(() => {
            const sceneSize = sceneSizeForRouteEditor(projectData, route.scene);
            return (
              <>
          <strong>Valor {route.value}</strong>
          <label><span>Cena</span><select disabled={!onUpdate} onChange={(event) => updateRoute(routeIndex, { scene: event.currentTarget.value })} value={route.scene}>{sceneNames.map((name) => <option key={name} value={name}>{sceneDisplayName(name)}</option>)}</select></label>
          <InspectorNumber disabled={!onUpdate} label="X" max={sceneSize ? sceneSize.width - 1 : undefined} min={0} onChange={(value) => updateRoute(routeIndex, { x: value })} unit="tile" value={route.x} />
          <InspectorNumber disabled={!onUpdate} label="Y" max={sceneSize ? sceneSize.height - 1 : undefined} min={0} onChange={(value) => updateRoute(routeIndex, { y: value })} unit="tile" value={route.y} />
          <label><span>Direção</span><select disabled={!onUpdate} onChange={(event) => updateRoute(routeIndex, { direction: event.currentTarget.value as SceneRouteCase["direction"] })} value={route.direction}>{SCENE_ROUTE_DIRECTIONS.map((direction) => <option key={direction} value={direction}>{direction}</option>)}</select></label>
          <InspectorNumber disabled={!onUpdate} label="Fade" max={3600} min={0} onChange={(value) => updateRoute(routeIndex, { fadeFrames: value })} unit="frames" value={route.fadeFrames} />
          <button type="button" disabled={!onUpdate} onClick={() => updateRoutes(table.routes.filter((_item, index) => index !== routeIndex))}>Remover</button>
              </>
            );
          })()}
        </div>
      )) : <p className="muted">Nenhuma rota configurada. Adicione pelo menos uma para exportar.</p>}
      {table.fallback ? <small className="event-scene-route-fallback">Fallback: {sceneDisplayName(table.fallback.scene)} · ({table.fallback.x}, {table.fallback.y}) · {table.fallback.direction}</small> : <small className="event-scene-route-fallback">Sem fallback: valores sem correspondência encerram o evento.</small>}
    </section>
  );
}

function MenuSliderEditor({ sceneName, screenID, projectData, onUpdate }: {
  sceneName: string;
  screenID: string;
  projectData: GBAProjectData;
  onUpdate?: EventsWorkspaceProps["onUpdateMenuSliderItem"];
}): React.ReactElement {
  const screen = findMenuSliderScreen(projectData, sceneName, screenID);
  if (!screen) return <p className="event-step-issues">Slider {screenID || "-"} não encontrado na cena {sceneName}.</p>;
  const images = menuSliderSpriteOptions(projectData, sceneName, screenID);
  const scenes = Array.isArray(projectData.scenas) ? projectData.scenas.map((scene) => scene.name).filter((name): name is string => typeof name === "string") : [];
  const events = Array.isArray(projectData.events) ? projectData.events.map((event) => event.name).filter((name): name is string => typeof name === "string") : [];
  return (
    <section className="event-scene-route-editor" aria-label={`Slider ${screenID}`}>
      <div className="event-scene-route-editor-header"><div><span>Slider · ←/→ navega · A confirma · B volta</span><strong>{screen.items.length} opções em {screenID}</strong></div></div>
      {screen.items.map((item, index) => (
        <details className="event-slider-row" key={item.id}>
          <summary>{index + 1}. {item.label} <small>→ {sceneDisplayName(item.targetScreenID)}</small></summary>
          <div className="event-slider-fields">
          <label><span>Texto</span><input aria-label={`Texto de ${item.id}`} value={item.label} disabled={!onUpdate} onChange={(event) => onUpdate?.(sceneName, screenID, item.id, { label: event.currentTarget.value })} /></label>
          <label><span>Imagem</span><select aria-label={`Imagem de ${item.id}`} value={menuSliderSprite(projectData, sceneName, item.id)} disabled={!onUpdate} onChange={(event) => onUpdate?.(sceneName, screenID, item.id, { spriteSheet: event.currentTarget.value })}>{images.map((image) => <option key={image} value={image}>{image}</option>)}</select></label>
          <label><span>Cena ao confirmar</span><select aria-label={`Cena de ${item.id}`} value={item.targetScreenID} disabled={!onUpdate} onChange={(event) => onUpdate?.(sceneName, screenID, item.id, { targetScreenID: event.currentTarget.value })}>{scenes.map((name) => <option key={name} value={name}>{sceneDisplayName(name)}</option>)}</select></label>
          <label><span>Evento antes da ação</span><select aria-label={`Evento de ${item.id}`} value={item.eventName} disabled={!onUpdate} onChange={(event) => onUpdate?.(sceneName, screenID, item.id, { eventName: event.currentTarget.value })}><option value="">Nenhum</option>{events.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>
          {item.targetItemID ? <label><span>Foco na cena</span><input aria-label={`Foco de ${item.id}`} value={item.targetItemID} disabled={!onUpdate} onChange={(event) => onUpdate?.(sceneName, screenID, item.id, { targetItemID: event.currentTarget.value })} /></label> : null}
          </div>
        </details>
      ))}
    </section>
  );
}

function sliderSceneName(data: GBAProjectData, eventID: string): string {
  const source = Array.isArray(data.events) ? data.events.find((item) => item.id === eventID) : null;
  if (typeof source?.roomName === "string") return source.roomName;
  const rooms = Array.isArray(data.scenas) ? data.scenas : [];
  const screenID = Array.isArray(source?.steps)
    ? source.steps.find((step: Record<string, unknown>) => typeof step.command === "string" && step.command.startsWith("slider "))?.command as string | undefined
    : undefined;
  const candidates = rooms.filter((room) => screenID && findMenuSliderScreen(data, String(room.name), screenID.split(/\s+/)[1] ?? ""));
  const owner = candidates.find((room) => runtimeEventStates(room).some((state) => state.eventName === source?.name));
  return String(owner?.name ?? (candidates.length === 1 ? candidates[0]?.name : "") ?? "");
}

export interface EventCommandMenuProps {
  event?: EventsWorkspaceEvent;
  contextLabel?: string;
  suggestions: EventsWorkspaceCommandSuggestion[];
  allowRecipes: boolean;
  stepIndex: number | null;
  query: string;
  tab: EventsCommandMenuTab;
  onChangeQuery(query: string): void;
  onChangeTab(tab: EventsCommandMenuTab): void;
  onChooseSuggestion(suggestion: EventsWorkspaceCommandSuggestion): void;
  onClose(): void;
}

export function EventCommandMenu(props: EventCommandMenuProps): React.ReactElement {
  return <EventBlockLibrary {...props} />;
}

function EventCommandPalette({
  event,
  suggestions,
  onChooseSuggestion,
  enableDrag = false,
  floating = false,
  onClose,
  title = "Biblioteca de eventos"
}: {
  event: EventsWorkspaceEvent;
  suggestions: EventsWorkspaceCommandSuggestion[];
  onChooseSuggestion(suggestion: EventsWorkspaceCommandSuggestion): void;
  enableDrag?: boolean;
  floating?: boolean;
  onClose?(): void;
  title?: string;
}): React.ReactElement {
  const groupedSuggestions = commandSuggestionsByCategory(suggestions);
  const [expandedCategories, setExpandedCategories] = useState<ReadonlySet<string>>(() => new Set());

  const toggleCategory = (category: string) => {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const palette = (
    <div aria-label={`Paleta de eventos de ${event.name}`} className="event-command-palette" role="region">
      <div className="event-command-palette-header">
        <div>
          <strong>{title}</strong>
          {floating ? <small>Arraste um evento para o ponto desejado do fluxo.</small> : null}
        </div>
        <div className="event-command-palette-header-actions">
          <span>{suggestions.length} opções</span>
          {onClose ? <button aria-label="Fechar biblioteca de eventos" onClick={onClose} type="button">×</button> : null}
        </div>
      </div>
      <CommandSuggestionAccordion
        enableDrag={enableDrag}
        expandedCategories={expandedCategories}
        groups={groupedSuggestions}
        onChooseSuggestion={onChooseSuggestion}
        onToggleCategory={toggleCategory}
      />
    </div>
  );

  if (floating && typeof document !== "undefined") {
    return createPortal(
      <div className="event-command-palette-floating" role="dialog" aria-label={`Biblioteca de eventos de ${event.name}`}>
        {palette}
      </div>,
      document.body
    );
  }

  return palette;
}

function eventEditor(
  event: EventsWorkspaceEvent,
  props: EventEditorProps,
  selectedStepIndex: number | null,
  onSelectStep: (stepIndex: number) => void,
  mode: EventEditorMode = "advanced"
): React.ReactElement {
  const activeBindings = props.presentation?.bindingTargets.filter((target) => target.currentEventName === event.name) ?? [];
  const showAdvancedFields = mode !== "guided";
  const updateProcedure = (procedure: EventsWorkspaceEvent["procedure"]): void => {
    props.onUpdateEventFields(event.id, { procedure });
  };
  return (
    <div className="event-editor" aria-label={`Editar ${event.name}`}>
      {showAdvancedFields ? (
        <>
      <label>
        <span>Tipo</span>
        <select
          aria-label={`Tipo de ${event.name}`}
          onChange={(inputEvent) => props.onUpdateEventFields(event.id, {
            eventKind: inputEvent.currentTarget.value === "procedure" ? "procedure" : "event"
          })}
          value={event.eventKind}
        >
          <option value="event">Evento</option>
          <option value="procedure">Rotina reutilizável</option>
        </select>
      </label>
      {event.eventKind === "procedure" ? (
        <section className="event-procedure-editor" aria-label={`Procedure ${event.name}`}>
          <div className="event-procedure-heading">
            <div>
              <strong>Entradas e memória local</strong>
              <small>Use $nome nos valores dos eventos. As chamadas são expandidas igualmente no preview e na ROM.</small>
            </div>
          </div>
          <div className="event-procedure-list">
            <div className="event-procedure-list-heading">
              <span>Parâmetros</span>
              <button
                onClick={() => updateProcedure({
                  ...event.procedure,
                  parameters: [...event.procedure.parameters, { name: `param${event.procedure.parameters.length + 1}`, type: "number", defaultValue: "0" }]
                })}
                type="button"
              >Adicionar</button>
            </div>
            {event.procedure.parameters.map((parameter, parameterIndex) => (
              <div className="event-procedure-row" key={`parameter-${parameterIndex}`}>
                <input
                  aria-label={`Nome do parâmetro ${parameterIndex + 1}`}
                  onChange={(inputEvent) => updateProcedure({
                    ...event.procedure,
                    parameters: event.procedure.parameters.map((item, index) => index === parameterIndex ? { ...item, name: inputEvent.currentTarget.value } : item)
                  })}
                  value={parameter.name}
                />
                <select
                  aria-label={`Tipo do parâmetro ${parameter.name}`}
                  onChange={(inputEvent) => updateProcedure({
                    ...event.procedure,
                    parameters: event.procedure.parameters.map((item, index) => index === parameterIndex ? {
                      ...item,
                      type: inputEvent.currentTarget.value as typeof parameter.type
                    } : item)
                  })}
                  value={parameter.type}
                >
                  <option value="number">Número</option>
                  <option value="boolean">Booleano</option>
                  <option value="variable">Variável por referência</option>
                </select>
                <input
                  aria-label={`Valor padrão de ${parameter.name}`}
                  onChange={(inputEvent) => updateProcedure({
                    ...event.procedure,
                    parameters: event.procedure.parameters.map((item, index) => index === parameterIndex ? { ...item, defaultValue: inputEvent.currentTarget.value } : item)
                  })}
                  value={parameter.defaultValue ?? ""}
                />
                <button
                  aria-label={`Remover parâmetro ${parameter.name}`}
                  onClick={() => updateProcedure({
                    ...event.procedure,
                    parameters: event.procedure.parameters.filter((_item, index) => index !== parameterIndex)
                  })}
                  type="button"
                >×</button>
              </div>
            ))}
          </div>
          <div className="event-procedure-list">
            <div className="event-procedure-list-heading">
              <span>Variáveis locais</span>
              <button
                onClick={() => updateProcedure({
                  ...event.procedure,
                  locals: [...event.procedure.locals, { name: `local${event.procedure.locals.length + 1}`, type: "number", initialValue: "0" }]
                })}
                type="button"
              >Adicionar</button>
            </div>
            {event.procedure.locals.map((local, localIndex) => (
              <div className="event-procedure-row" key={`local-${localIndex}`}>
                <input
                  aria-label={`Nome da variável local ${localIndex + 1}`}
                  onChange={(inputEvent) => updateProcedure({
                    ...event.procedure,
                    locals: event.procedure.locals.map((item, index) => index === localIndex ? { ...item, name: inputEvent.currentTarget.value } : item)
                  })}
                  value={local.name}
                />
                <select
                  aria-label={`Tipo da variável local ${local.name}`}
                  onChange={(inputEvent) => updateProcedure({
                    ...event.procedure,
                    locals: event.procedure.locals.map((item, index) => index === localIndex ? {
                      ...item,
                      type: inputEvent.currentTarget.value === "boolean" ? "boolean" : "number"
                    } : item)
                  })}
                  value={local.type}
                >
                  <option value="number">Número</option>
                  <option value="boolean">Booleano</option>
                </select>
                <input
                  aria-label={`Valor inicial de ${local.name}`}
                  onChange={(inputEvent) => updateProcedure({
                    ...event.procedure,
                    locals: event.procedure.locals.map((item, index) => index === localIndex ? { ...item, initialValue: inputEvent.currentTarget.value } : item)
                  })}
                  value={local.initialValue}
                />
                <button
                  aria-label={`Remover variável local ${local.name}`}
                  onClick={() => updateProcedure({
                    ...event.procedure,
                    locals: event.procedure.locals.filter((_item, index) => index !== localIndex)
                  })}
                  type="button"
                >×</button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
      <label>
        <span>Categoria</span>
        <input
          onChange={(inputEvent) => props.onUpdateEventFields(event.id, { category: inputEvent.currentTarget.value })}
          type="text"
          value={event.category}
        />
      </label>
      <label>
        <span>Detalhe</span>
        <input
          onChange={(inputEvent) => props.onUpdateEventFields(event.id, { detail: inputEvent.currentTarget.value })}
          type="text"
          value={event.detail ?? ""}
        />
      </label>
      {mode !== "properties" ? <label className="event-command-field">
        <span>Comando</span>
        <input
          onChange={(inputEvent) => props.onUpdateEventFields(event.id, { command: inputEvent.currentTarget.value })}
          type="text"
          value={event.primaryCommand}
        />
      </label> : null}
      <label className="event-binding-field">
        <span>Vinculo rapido</span>
        <select
          onChange={(inputEvent) => {
            const target = props.presentation?.bindingTargets.find((item) => item.id === inputEvent.currentTarget.value);
            if (target) {
              props.onBindEventToTarget(event.id, {
                targetKind: target.targetKind,
                targetName: target.targetName,
                bindingKey: target.bindingKey
              });
              inputEvent.currentTarget.value = "";
            }
          }}
          value=""
        >
          <option value="">Vincular a room/ator/trigger</option>
          {props.presentation?.bindingTargets.map((target) => (
            <option key={`${event.id}-${target.id}`} value={target.id}>
              {target.currentEventName ? `${target.label} (${target.currentEventName})` : target.label}
            </option>
          ))}
        </select>
      </label>
      {activeBindings.length ? (
        <div className="event-active-bindings" aria-label={`Vinculos ativos de ${event.name}`}>
          {activeBindings.map((target) => (
            <button
              key={`${event.id}-${target.id}`}
              onClick={() => props.onRemoveEventTargetBinding({
                targetKind: target.targetKind,
                targetName: target.targetName,
                bindingKey: target.bindingKey
              })}
              aria-label={`Remover vínculo com ${target.label}`} title={`Remover vínculo com ${target.label}`}
              type="button"
            >
              Remover vínculo: {target.label}
            </button>
          ))}
        </div>
      ) : null}
      {mode !== "properties" ? <EventCommandPalette
        event={event}
        onChooseSuggestion={(suggestion) => props.onUpdateEventFields(event.id, { command: suggestion.command })}
        suggestions={props.presentation?.commandPalette ?? []}
      /> : null}
        </>
      ) : null}
      {mode !== "properties" ? <div className="event-step-editor">
        <div className="event-step-editor-header">
          <strong>Eventos</strong>
          <button type="button" onClick={() => props.onOpenCommandMenu(event.id, null)}>Adicionar</button>
        </div>
        {event.steps.length ? (
          event.steps.map((step) => (
            <div
              className={[
                "event-step-row",
                selectedStepIndex === step.index ? "selected" : ""
              ].filter(Boolean).join(" ")}
              key={`${event.id}-${step.index}`}
            >
              <button
                aria-pressed={selectedStepIndex === step.index}
                className="event-step-select"
                onClick={() => onSelectStep(step.index)}
                type="button"
              >
                {step.index + 1}
              </button>
              <input
                aria-label={`Ativar evento ${step.index + 1}`}
                checked={step.isEnabled}
                onChange={(inputEvent) => {
                  onSelectStep(step.index);
                  props.onUpdateEventStep(event.id, step.index, { isEnabled: inputEvent.currentTarget.checked });
                }}
                type="checkbox"
              />
              <div className="event-step-main">
                <button
                  aria-label={`Abrir escolha de evento ${step.index + 1}`}
                  className="event-step-command"
                  onClick={() => {
                    onSelectStep(step.index);
                    props.onOpenCommandMenu(event.id, step.index);
                  }}
                  onMouseDown={(inputEvent) => inputEvent.preventDefault()}
                  type="button"
                >
                  <span className="event-step-command-title">{eventStepLabel(step)}</span>
                  <small>{eventStepLabelCategory(step)}</small>
                </button>
                {step.commandParameters.length ? (
                  <div className="event-step-parameter-summary" aria-label={`Parâmetros do evento ${step.index + 1}`}>
                    {step.commandParameters.slice(0, 4).map((parameter) => (
                      <span key={`${event.id}-${step.index}-${parameter.id}`}>{`${inlineCommandParameterLabel(parameter)}: ${parameter.value || "-"}`}</span>
                    ))}
                    {step.commandParameters.length > 4 ? (
                      <span>+{step.commandParameters.length - 4} parâmetro(s)</span>
                    ) : null}
                  </div>
                ) : null}
                {mode === "guided" && step.commandParameters.length ? (
                  <div className="event-step-guided-parameters" aria-label={`Editar parâmetros do evento ${step.index + 1}`}>
                    {step.commandParameters.map((parameter) => (
                      <Fragment key={`${event.id}-${step.index}-${parameter.id}`}>
                        {commandParameterInput(parameter, (value) => {
                          props.onUpdateEventStep(event.id, step.index, {
                            command: commandWithParameterValue(step.command, parameter, value)
                          });
                        })}
                      </Fragment>
                    ))}
                  </div>
                ) : null}
                {mode === "guided" && step.commandVerb === "change_scene_by_variable" ? (
                  (() => {
                    const routeTableID = step.command.trim().split(/\s+/).filter(Boolean)[1] ?? "";
                    const routeTable = findSceneRouteTable(props.projectData, routeTableID);
                    return routeTable ? (
                      <SceneRouteTableEditor
                        table={routeTable}
                        projectData={props.projectData}
                        variables={props.variables ?? []}
                        onUpdate={props.onUpdateSceneRouteTable}
                      />
                    ) : null;
                  })()
                ) : null}
                {mode === "guided" && step.commandVerb === "slider" ? (
                  <MenuSliderEditor
                    sceneName={sliderSceneName(props.projectData, event.id)}
                    screenID={step.command.trim().split(/\s+/)[1] ?? ""}
                    projectData={props.projectData}
                    onUpdate={props.onUpdateMenuSliderItem}
                  />
                ) : null}
              </div>
              <button
                className="event-step-remove"
                type="button"
                onClick={() => props.onRemoveEventStep(event.id, step.index, event.name)}
              >
                Remover
              </button>
              {step.missingReferences.length ? (
                <div className="event-step-issues" aria-label={`Pendências do evento ${step.index + 1}`}>
                  {step.missingReferences.map((reference) => (
                    <span key={`${event.id}-${step.index}-${reference}`}>{reference}</span>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        ) : (
          <div className="event-step-empty-state">
            <p>Nenhum evento neste evento ainda.</p>
            <p>Clique em <strong>Adicionar evento</strong> para começar a montar a lógica.</p>
          </div>
        )}
      </div> : null}
    </div>
  );
}

function EventBlockInspector({
  event,
  editorProps,
  selectedStepIndex
}: {
  event: EventsWorkspaceEvent;
  editorProps: EventEditorProps;
  selectedStepIndex: number;
}): React.ReactElement | null {
  const selectedStep = event.steps.find((step) => step.index === selectedStepIndex);
  if (!selectedStep) return null;

  const category = selectedStep.commandSection
    ? `${selectedStep.commandCategory} / ${selectedStep.commandSection}`
    : selectedStep.commandCategory;

  return (
    <section className={`event-block-inspector tone-${eventBlockToneForCategory(selectedStep.commandCategory)}`} aria-label={`Editar evento ${selectedStep.index + 1}`}>
      <header className="event-block-inspector-header">
        <div>
          <span>Evento {selectedStep.index + 1}</span>
          <strong>{selectedStep.commandLabel}</strong>
          <small>{category}</small>
        </div>
        {selectedStep.commandBadge && selectedStep.commandBadge !== "OK ROM" ? <em>{selectedStep.commandBadge}</em> : null}
      </header>
      {selectedStep.commandAvailability ? <>
        <p className="event-authoring-warning" role="status">{selectedStep.commandAvailability}</p>
        <button type="button" onClick={() => editorProps.onOpenCommandMenu(event.id, selectedStep.index)}>Escolher outro evento</button>
      </> : null}
      {selectedStep.commandVerb !== "slider" ? <label className="event-block-inspector-toggle">
        <input
          checked={selectedStep.isEnabled}
          onChange={(inputEvent) => editorProps.onUpdateEventStep(event.id, selectedStep.index, {
            isEnabled: inputEvent.currentTarget.checked
          })}
          type="checkbox"
        />
        <span>Executar este evento</span>
      </label> : null}
      {selectedStep.commandAvailability ? null : selectedStep.commandParameters.length ? (
        <div className="event-block-inspector-parameters" aria-label={`Parâmetros do evento ${selectedStep.index + 1}`}>
          {selectedStep.commandParameters.map((parameter) => (
            <Fragment key={`${event.id}-${selectedStep.index}-${parameter.id}`}>
              {commandParameterInput(parameter, (value) => editorProps.onUpdateEventStep(event.id, selectedStep.index, {
                command: commandWithParameterValue(selectedStep.command, parameter, value)
              }))}
            </Fragment>
          ))}
        </div>
      ) : (
        <p className="event-block-inspector-empty">Este evento não tem parâmetros editáveis.</p>
      )}
      {selectedStep.commandVerb === "change_scene_by_variable" ? (
        (() => {
          const routeTableID = selectedStep.command.trim().split(/\s+/).filter(Boolean)[1] ?? "";
          const routeTable = findSceneRouteTable(editorProps.projectData, routeTableID);
          return routeTable ? (
            <SceneRouteTableEditor
              table={routeTable}
              projectData={editorProps.projectData}
              variables={editorProps.variables ?? []}
              onUpdate={editorProps.onUpdateSceneRouteTable}
            />
          ) : null;
        })()
      ) : null}
      {selectedStep.commandVerb === "slider" ? (
        <MenuSliderEditor sceneName={sliderSceneName(editorProps.projectData, event.id)} screenID={selectedStep.command.trim().split(/\s+/)[1] ?? ""} projectData={editorProps.projectData} onUpdate={editorProps.onUpdateMenuSliderItem} />
      ) : null}
      <details className="event-block-technical"><summary>Opções técnicas</summary>
        <label><span>Comando</span><input aria-label={`Comando do evento ${selectedStep.index + 1}`} value={selectedStep.command} onChange={e => editorProps.onUpdateEventStep(event.id, selectedStep.index, { command: e.currentTarget.value })}/></label>
        {!selectedStep.commandAvailability ? <button type="button" onClick={() => editorProps.onOpenCommandMenu(event.id, selectedStep.index)}>Trocar evento</button> : null}
      </details>
      {!selectedStep.commandVerb.startsWith("if_") && !["has_item", "rate_limit"].includes(selectedStep.commandVerb) ? <button type="button" onClick={() => editorProps.onAddEventStep(event.id, event.name, selectedStep.command)}>Duplicar evento ao final</button> : null}
      <button
        className="danger-button"
        onClick={() => editorProps.onRemoveEventStep(event.id, selectedStep.index, event.name)}
        type="button"
      >
        Remover evento
      </button>
    </section>
  );
}

interface EventBuildPanelProps {
  unifiedEditing?: boolean;
  separateInspector?: boolean;
  event: EventsWorkspaceEvent | null;
  editorProps: EventEditorProps;
  onChoosePaletteSuggestion?(suggestion: EventsWorkspaceCommandSuggestion): void;
  onDropPaletteBlock?(target: EventStructureInsertionTarget, command: string): void;
  floatingPalette?: boolean;
  selectedStepIndex: number | null;
  paletteSuggestions?: EventsWorkspaceCommandSuggestion[];
  onCreateEvent(): void;
  onInsertEventSteps?: EventsWorkspaceProps["onInsertEventSteps"];
  onOpenCommandMenu(eventID: string, target?: EventStructureInsertionTarget): void;
  onOpenRecipeMenu(eventID: string): void;
  onSelectStep(eventID: string, stepIndex: number): void;
}

export interface EventInspectorPanelProps extends EventsWorkspaceProps {
  eventName: string;
  triggerLabel: string;
}

export function EventInspectorPanel({
  eventName,
  triggerLabel,
  presentation,
  projectData,
  variables = [],
  onCreateEvent,
  onCreateVariable,
  onRemoveVariable,
  onUpdateEventFields,
  onAddEventStep,
  onInsertEventSteps,
  onUpdateEventStep,
  onUpdateSceneRouteTable,
  onUpdateMenuSliderItem,
  onUpdateEventGraphNodePosition,
  onRetargetEventGraphEdge,
  onConnectEventGraphNodes,
  onRemoveEventGraphEdge,
  onBindEventToTarget,
  onCreateBoundEventForTarget,
  onRemoveEventTargetBinding,
  onRemoveEventStep,
  onRenameEvent,
  onDuplicateEvent,
  onExportEvent,
  onRemoveEvent,
  onRelayoutEventsGraph
}: EventInspectorPanelProps): React.ReactElement {
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [commandMenuQuery, setCommandMenuQuery] = useState("");
  const [commandMenuTab, setCommandMenuTab] = useState<EventsCommandMenuTab>("all");
  const [commandMenuStepIndex, setCommandMenuStepIndex] = useState<number | null>(null);
  const [commandMenuInsertionTarget, setCommandMenuInsertionTarget] = useState<EventStructureInsertionTarget>({ kind: "root" });
  const context = useContext(EventEditingContext);
  const [localExpandedHost, setLocalExpandedHost] = useState<HTMLElement | null>(null);
  const expandedHost = context?.onChangeExpandedHost ? context.expandedHost ?? null : localExpandedHost;
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [simulationOpen, setSimulationOpen] = useState(false);
  const flowRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef({ compact: 0, expanded: 0 });
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const flow = flowRef.current;
    const mode = expandedHost ? "expanded" : "compact";
    if (flow) flow.scrollTop = scrollPositions.current[mode];
    return () => { if (flow) scrollPositions.current[mode] = flow.scrollTop; };
  }, [expandedHost]);
  function changeExpanded(next: boolean): void {
    if (flowRef.current) scrollPositions.current[expandedHost ? "expanded" : "compact"] = flowRef.current.scrollTop;
    const host = next ? document.querySelector<HTMLElement>(".rooms-event-focus-host") ?? document.body : null;
    if (context?.onChangeExpandedHost) context.onChangeExpandedHost(host);
    else setLocalExpandedHost(host);
    if (!next) queueMicrotask(() => expandButtonRef.current?.focus());
  }
  useEffect(() => {
    if (!expandedHost) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || commandMenuOpen || event.defaultPrevented) return;
      event.preventDefault();
      changeExpanded(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expandedHost, commandMenuOpen]);
  const allEvents = useMemo(
    () => presentation?.groups.flatMap((group) => group.events) ?? [],
    [presentation?.groups]
  );
  const event = allEvents.find((candidate) => candidate.name === eventName || candidate.id === eventName) ?? null;
  const contextualSuggestions = useMemo(
    () => presentation && event
      ? rankEventsCommandSuggestionsForContext(presentation.commandPalette, {
        eventCategory: event.category,
        bindingLabels: event.bindingLabels
      })
      : [],
    [event?.bindingLabels, event?.category, presentation]
  );
  const preferredEventTargetName = allEvents.find((candidate) => candidate.name !== event?.name)?.name ?? null;

  useEffect(() => {
    setSelectedStepIndex(null);
    setCommandMenuOpen(false);
    setCommandMenuInsertionTarget({ kind: "root" });
    setPropertiesOpen(false);
    setSimulationOpen(false);
  }, [eventName]);

  const openCommandMenu = (
    eventID: string,
    stepIndex: number | null = null,
    tab: EventsCommandMenuTab = "all",
    insertionTarget: EventStructureInsertionTarget = { kind: "root" }
  ) => {
    if (!event || event.id !== eventID) return;
    if (stepIndex !== null) setSelectedStepIndex(stepIndex);
    setCommandMenuStepIndex(stepIndex);
    setCommandMenuQuery("");
    setCommandMenuTab(tab);
    setCommandMenuInsertionTarget(insertionTarget);
    setCommandMenuOpen(true);
  };
  const closeCommandMenu = () => {
    setCommandMenuOpen(false);
    setCommandMenuQuery("");
    setCommandMenuTab("all");
    setCommandMenuStepIndex(null);
    setCommandMenuInsertionTarget({ kind: "root" });
  };
  const addPaletteSuggestion = (suggestion: EventsWorkspaceCommandSuggestion): void => {
    if (!event) return;
    const commands = suggestion.steps?.length
      ? suggestion.steps.map((step) => step.command)
      : [suggestion.command];
    const safeCommands = commands.map((command) => (
      command === `call_event ${event.name}` && preferredEventTargetName
        ? `call_event ${preferredEventTargetName}`
        : command
    ));
    safeCommands.forEach((command) => onAddEventStep(event.id, event.name, command));
  };
  const dropPaletteBlock = (target: EventStructureInsertionTarget, command: string): void => {
    if (!event) return;
    const safeCommand = command === `call_event ${event.name}` && preferredEventTargetName
      ? `call_event ${preferredEventTargetName}`
      : command;
    if (target.kind !== "root" && onInsertEventSteps) {
      onInsertEventSteps(event.id, target, [safeCommand]);
      return;
    }
    onAddEventStep(event.id, event.name, safeCommand);
  };
  const editorProps: EventEditorProps = {
    presentation,
    projectData,
    variables,
    onCreateEvent,
    onCreateVariable,
    onRemoveVariable,
    onUpdateEventFields,
    onAddEventStep,
    onUpdateEventStep,
    onUpdateSceneRouteTable,
    onUpdateMenuSliderItem,
    onUpdateEventGraphNodePosition,
    onRetargetEventGraphEdge,
    onConnectEventGraphNodes,
    onRemoveEventGraphEdge,
    onBindEventToTarget,
    onCreateBoundEventForTarget,
    onRemoveEventTargetBinding,
    onRemoveEventStep,
    onRenameEvent,
    onDuplicateEvent,
    onExportEvent,
    onRemoveEvent,
    onRelayoutEventsGraph,
    onOpenCommandMenu: (eventID, stepIndex) => openCommandMenu(eventID, stepIndex)
  };

  if (!event) {
    return (
      <section aria-label="Editor de evento" className="event-inspector-flow event-inspector-flow-empty">
        <p>Esse evento não existe mais nesta cena.</p>
      </section>
    );
  }

  const blockInspector = selectedStepIndex !== null ? <EventBlockInspector event={event} editorProps={editorProps} selectedStepIndex={selectedStepIndex}/> : <p className="event-selected-empty">Selecione um evento para editar seus parâmetros.</p>;
  const content = (
    <section aria-label={`Editor de ${event.name}`} className={`event-inspector-flow is-event-authoring${expandedHost ? " is-expanded" : ""}${expandedHost === document.body ? " is-standalone" : ""}`}>
      {expandedHost || !context?.onChangeExpandedHost ? <header className="event-authoring-header">
        {expandedHost ? <button type="button" onClick={() => changeExpanded(false)}><ArrowLeft size={15}/>Voltar à cena</button> : null}
        <div>
          {context?.name ? <small>{context.name} / Eventos</small> : null}<strong>{triggerLabel}</strong><small>{event.name}</small>
        </div>
        <span className={event.missingReferences.length ? "event-authoring-warning" : "muted"}>{event.missingReferences.length ? `${event.missingReferences.length} pendências` : "Sem pendências de referências"}</span>
        {!expandedHost ? <button ref={expandButtonRef} type="button" onClick={() => changeExpanded(true)} aria-label="Expandir eventos"><Maximize2 size={15}/>Expandir</button> : null}
      </header> : event.missingReferences.length ? <p className="event-authoring-warning" role="status">{event.missingReferences.length} pendências de referências</p> : null}
      {expandedHost && context ? <div className="event-authoring-states" role="tablist" aria-label="Estados de evento expandido">{context.states.map(state => <button key={state.key} type="button" role="tab" aria-selected={context.activeKey === state.key} onClick={() => context.onSelectState(state.key)}>{state.label}</button>)}</div> : null}
      <div className="event-authoring-layout"><div className="event-authoring-flow" ref={flowRef}>
      <EventBuildPanel
        unifiedEditing
        separateInspector={Boolean(expandedHost)}
        editorProps={editorProps}
        event={event}
        floatingPalette
        onChoosePaletteSuggestion={addPaletteSuggestion}
        onDropPaletteBlock={dropPaletteBlock}
        onInsertEventSteps={onInsertEventSteps}
        onCreateEvent={onCreateEvent}
        onOpenCommandMenu={(eventID, insertionTarget) => openCommandMenu(eventID, null, "all", insertionTarget)}
        onOpenRecipeMenu={(eventID) => openCommandMenu(eventID, null, "recipes")}
        onSelectStep={(_eventID, stepIndex) => setSelectedStepIndex(stepIndex)}
        paletteSuggestions={contextualSuggestions.filter((suggestion) => !suggestion.isRecipe)}
        selectedStepIndex={selectedStepIndex}
      />
      <details className="event-properties" open={simulationOpen} onToggle={e => setSimulationOpen(e.currentTarget.open)}>
        <summary>Simular script</summary>
        {simulationOpen ? <EventSimulationPanel key={event.id} event={event} projectData={projectData}/> : null}
      </details>
      <details className="event-properties" onToggle={e => setPropertiesOpen(e.currentTarget.open)}>
        <summary>Propriedades do script</summary>
        <small className="muted">Fluxo: {event.name}</small>
        <div className="event-properties-actions"><button type="button" onClick={() => onRenameEvent(event.id, event.name)}>Renomear</button><button type="button" onClick={() => onDuplicateEvent(event.id,event.name)}>Duplicar script</button><button type="button" onClick={() => onExportEvent(event.id,event.name)}>Exportar script</button></div>
        {propertiesOpen ? eventEditor(event, editorProps, selectedStepIndex, setSelectedStepIndex, "properties") : null}
      </details>
      </div>{expandedHost ? <aside className="event-authoring-parameters" aria-label="Parâmetros do evento selecionado">{blockInspector}</aside> : null}</div>
      {commandMenuOpen ? (
        <EventCommandMenu
          allowRecipes={commandMenuStepIndex === null}
          event={event}
          contextLabel={`${context?.name ? context.name + " · " : ""}${triggerLabel}${commandMenuInsertionTarget.kind === "trueBranch" ? " · Se sim" : commandMenuInsertionTarget.kind === "falseBranch" ? " · Se não" : ""}`}
          onChangeQuery={setCommandMenuQuery}
          onChangeTab={setCommandMenuTab}
          onChooseSuggestion={(suggestion) => {
            const commands = suggestion.steps?.length
              ? suggestion.steps.map((step) => step.command)
              : [suggestion.command];
            const safeCommands = commands.map((command) => (
              command === `call_event ${event.name}` && preferredEventTargetName
                ? `call_event ${preferredEventTargetName}`
                : command
            ));
            if (commandMenuStepIndex === null && commandMenuInsertionTarget.kind !== "root" && onInsertEventSteps) {
              onInsertEventSteps(event.id, commandMenuInsertionTarget, safeCommands);
            } else if (commandMenuStepIndex === null) {
              safeCommands.forEach((command) => onAddEventStep(event.id, event.name, command));
            } else {
              onUpdateEventStep(event.id, commandMenuStepIndex, { command: safeCommands[0] ?? suggestion.command });
              setSelectedStepIndex(commandMenuStepIndex);
            }
            closeCommandMenu();
          }}
          onClose={closeCommandMenu}
          query={commandMenuQuery}
          stepIndex={commandMenuStepIndex}
          suggestions={contextualSuggestions}
          tab={commandMenuTab}
        />
      ) : null}
    </section>
  );
  return expandedHost ? createPortal(content, expandedHost) : content;
}

function EventBuildPanel({
  unifiedEditing = false,
  separateInspector = false,
  event,
  editorProps,
  onChoosePaletteSuggestion,
  onDropPaletteBlock,
  floatingPalette = false,
  selectedStepIndex,
  paletteSuggestions = [],
  onCreateEvent,
  onInsertEventSteps,
  onOpenCommandMenu,
  onOpenRecipeMenu,
  onSelectStep
}: EventBuildPanelProps): React.ReactElement {
  const [stepSelectionMode, setStepSelectionMode] = useState(false);
  const [selectedStructureStepIndexes, setSelectedStructureStepIndexes] = useState<Set<number>>(new Set());
  const [paletteOpen, setPaletteOpen] = useState(false);

  useEffect(() => {
    setStepSelectionMode(false);
    setSelectedStructureStepIndexes(new Set());
    setPaletteOpen(false);
  }, [event?.id]);

  useEffect(() => {
    if (!floatingPalette || !paletteOpen) return;
    const onKeyDown = (keyboardEvent: KeyboardEvent): void => {
      if (keyboardEvent.key === "Escape") setPaletteOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [floatingPalette, paletteOpen]);

  if (!event) {
    return (
      <section aria-label="Montar script" className="event-build-panel event-build-panel-empty">
        <div>
          <span>Comece por aqui</span>
          <h4>Crie um script para montar a lógica</h4>
          <p>Depois escolha uma modelo de script ou adicione eventos um por um.</p>
          <button onClick={onCreateEvent} type="button">Novo script</button>
        </div>
      </section>
    );
  }

  const selectedStepIndexes = Array.from(selectedStructureStepIndexes).sort((left, right) => left - right);
  const selectedStepCount = selectedStepIndexes.length;
  const selectedStepLabel = `${selectedStepCount} passo${selectedStepCount === 1 ? "" : "s"}`;
  const stepPresentations = new Map<number, EventStructureStepPresentation>(event.steps.map((step) => [step.index, {
    badge: step.commandBadge,
    category: step.commandCategory,
    label: step.commandLabel,
    tone: eventBlockToneForCategory(step.commandCategory),
    parameters: (step.commandAvailability ? [] : step.commandParameters).map((parameter) => ({
      id: parameter.id,
      label: step.commandVerb === "wait" && parameter.kind === "value"
        ? "quadros"
        : inlineCommandParameterLabel(parameter),
      value: parameter.value,
      inline: !unifiedEditing && canEditStepInline(step),
      inputMode: parameter.kind === "value" ? "numeric" : "text",
      options: parameter.options
    })),
    section: step.commandSection
  }]));
  const selectedStep = selectedStepIndex === null
    ? null
    : event.steps.find((step) => step.index === selectedStepIndex) ?? null;
  const selectedStepIsInline = selectedStep ? canEditStepInline(selectedStep) : false;
  const updateInlineStepParameter = (stepIndex: number, parameterID: string, value: string): void => {
    const step = event.steps.find((candidate) => candidate.index === stepIndex);
    const parameter = step?.commandParameters.find((candidate) => candidate.id === parameterID);
    if (!step || !parameter) return;
    editorProps.onUpdateEventStep(event.id, stepIndex, {
      command: commandWithParameterValue(step.command, parameter, value)
    });
  };
  const toggleStepSelection = (stepIndex: number): void => {
    setSelectedStructureStepIndexes((current) => {
      const next = new Set(current);
      if (next.has(stepIndex)) next.delete(stepIndex);
      else next.add(stepIndex);
      return next;
    });
  };

  return (
    <section aria-label={`Montar script ${event.name}`} className="event-build-panel">
      <header className="event-build-panel-header">
        {!floatingPalette ? (
          <div>
            <span>Você está montando</span>
            <h4>{event.name}</h4>
            <p>{describeEventFlow(event)}</p>
          </div>
        ) : null}
        <div className="event-build-actions">
          <button onClick={() => onOpenRecipeMenu(event.id)} type="button">Começar com modelo de script</button>
          <button className="primary-button" onClick={() => onOpenCommandMenu(event.id)} type="button">Adicionar evento</button>
          {!unifiedEditing && floatingPalette && onChoosePaletteSuggestion && paletteSuggestions.length ? (
            <button
              aria-expanded={paletteOpen}
              aria-label="Abrir biblioteca de eventos"
              className={paletteOpen ? "active" : ""}
              onClick={() => unifiedEditing ? onOpenCommandMenu(event.id) : setPaletteOpen((current) => !current)}
              type="button"
            >
              Biblioteca de eventos
            </button>
          ) : null}
        </div>
      </header>
      <div className="event-structure-actions" role="toolbar" aria-label="Ações de passos">
        <button
          aria-pressed={stepSelectionMode}
          onClick={() => setStepSelectionMode((current) => !current)}
          type="button"
        >
          Selecionar passos
        </button>
        {stepSelectionMode && selectedStepCount > 0 ? (
          <>
            <button
              onClick={() => selectedStepIndexes.forEach((stepIndex) => editorProps.onUpdateEventStep(event.id, stepIndex, { isEnabled: false }))}
              type="button"
            >
              Desativar {selectedStepLabel}
            </button>
            <button
              onClick={() => selectedStepIndexes.forEach((stepIndex) => {
                const step = event.steps[stepIndex];
                if (step) editorProps.onAddEventStep(event.id, event.name, step.command);
              })}
              type="button"
            >
              Duplicar {selectedStepLabel}
            </button>
            <button
              onClick={() => editorProps.onAddEventStep(event.id, event.name, `comment passos ${selectedStepIndexes.map((index) => index + 1).join(", ")}`)}
              type="button"
            >
              Comentar {selectedStepLabel}
            </button>
          </>
        ) : null}
      </div>
      <EventStructureEditor
        renderStepEditor={unifiedEditing && !separateInspector ? stepIndex => <EventBlockInspector event={event} editorProps={editorProps} selectedStepIndex={stepIndex}/> : undefined}
        eventName={event.name}
        onDropBlock={onDropPaletteBlock}
        onOpenCommandMenu={(target) => onOpenCommandMenu(event.id, target)}
        onRemoveStep={(stepIndex) => editorProps.onRemoveEventStep(event.id, stepIndex, event.name)}
        onSelectStep={(stepIndex) => onSelectStep(event.id, stepIndex)}
        onToggleStep={(stepIndex, isEnabled) => editorProps.onUpdateEventStep(event.id, stepIndex, { isEnabled })}
        onUpdateStepParameter={updateInlineStepParameter}
        activeStepIndex={selectedStepIndex}
        onToggleStepSelection={toggleStepSelection}
        selectedStepIndexes={selectedStructureStepIndexes}
        selectionMode={stepSelectionMode}
        stepPresentations={stepPresentations}
        steps={event.steps.map((step) => ({ command: step.command, isEnabled: step.isEnabled }))}
      />
      {!unifiedEditing && onChoosePaletteSuggestion && paletteSuggestions.length && (!floatingPalette || paletteOpen) ? (
        <EventCommandPalette
          event={event}
          enableDrag
          floating={floatingPalette}
          onChooseSuggestion={onChoosePaletteSuggestion}
          onClose={floatingPalette ? () => setPaletteOpen(false) : undefined}
          suggestions={paletteSuggestions}
          title="Biblioteca de eventos"
        />
      ) : null}
      {!unifiedEditing && selectedStepIndex !== null && !selectedStepIsInline ? (
        <EventBlockInspector
          event={event}
          editorProps={editorProps}
          selectedStepIndex={selectedStepIndex}
        />
      ) : null}
      {onInsertEventSteps ? null : (
        <p className="event-structure-editor-hint">Os novos eventos são adicionados ao fim do fluxo.</p>
      )}
    </section>
  );
}

interface EventDebugPanelProps {
  event: EventsWorkspaceEvent | null;
  result: PreviewRuntimeState | null;
  onRun(debug: boolean): void;
}

function nativeModalStatus(result: PreviewRuntimeState): string {
  const modal = result.nativeEvents.modal;
  if (!modal) return "";
  if (modal.kind === "code") return `Código: ${modal.code?.split("").map((digit, index) => index === modal.cursor ? `[${digit}]` : digit).join(" ")}. Use as setas para editar e Confirmar para enviar.`;
  if (modal.kind === "menu") return `Opção ${(result.activeDialogue?.selectedChoiceIndex ?? 0) + 1}: ${result.activeDialogue?.choices[result.activeDialogue.selectedChoiceIndex] ?? ""}`;
  if (modal.kind === "shop") {
    const item = previewRuntimeStartMenuItems(result)[result.startMenu.selectedIndex];
    return `Loja: ${item?.label ?? ""}${item?.detail ? ` · ${item.detail}` : ""}${result.startMenu.notice ? ` · ${result.startMenu.notice}` : ""}`;
  }
  const slot = modal.kind === "equip-slots" ? modal.cursor : modal.slot ?? 0;
  const equipped = result.equippedItems[String(slot)] ?? "Nenhum";
  if (modal.kind === "equip-slots") return `Equipamento ${slot + 1}: ${equipped}. Confirmar abre os itens disponíveis.`;
  const items = Object.keys(result.inventory).filter(key => result.inventory[key]! > 0).sort();
  const selected = modal.cursor === 0 ? "Remover equipamento" : items[modal.cursor - 1] ?? "";
  return `Equipamento ${slot + 1}: ${equipped}. Seleção: ${selected}. Confirmar equipa; Voltar retorna.`;
}

function EventRuntimeStatus({ result }: { result: PreviewRuntimeState }): React.ReactElement {
  const title = result.debugger.paused ? "Depuração pausada"
    : result.nativeEvents.modal ? "Aguardando resposta"
    : result.scriptWaitFrames > 0 ? "Aguardando evento"
    : result.eventLog.some(item => item.result === "unsupported") ? "Execução com limitações" : "Caminho executado";
  return <>
    <strong>{title}</strong>
    {result.debugger.pauseReason ? <p>{result.debugger.pauseReason}</p> : null}
    {result.nativeEvents.modal ? <p role="status">{nativeModalStatus(result)}</p> : null}
    {result.hud.gameClock ? <p>Relógio: {String(Math.floor(result.hud.gameClock.currentMinute / 60)).padStart(2, "0")}:{String(result.hud.gameClock.currentMinute % 60).padStart(2, "0")}</p> : null}
    {result.lutaCombat ? <p>Luta: HP {result.lutaCombat.fighters[0].hp}/{result.lutaCombat.fighters[1].hp}; Super {result.lutaCombat.fighters[0].superGauge}/{result.lutaCombat.fighters[1].superGauge}; {Math.ceil(result.lutaCombat.roundTimerFrames / 60)} s.</p> : null}
    {Object.keys(result.nativeEvents.threads).length ? <p>Scripts paralelos ativos: {Object.keys(result.nativeEvents.threads).join(", ")}.</p> : null}
    {result.scriptWaitFrames > 0 ? <p>Espera: {result.scriptWaitFrames} quadros restantes.</p> : null}
    {result.eventLog.filter(item => item.result === "unsupported").map((item, index) => (
      <p key={`unsupported-${index}`} role="status">{item.detail}</p>
    ))}
  </>;
}

function useEventRuntimeClock(result: PreviewRuntimeState | null, setResult: React.Dispatch<React.SetStateAction<PreviewRuntimeState | null>>): void {
  const advancing = Boolean(result && !result.debugger.paused && (
    result.sceneTransition || result.visualEffect || result.scriptWaitFrames > 0
    || result.scriptContinuations.length || result.scriptQueue.length
    || result.lutaCombat?.roundState === "active" || (result.hud.gameClock?.frames ?? 0) > 0 || Object.keys(result.nativeEvents.threads).length
    || Object.keys(result.nativeEvents.actorEffects).length || result.nativeEvents.projectiles.length || result.nativeEvents.adventure.frames > 0
  ));
  useEffect(() => {
    if (!advancing) return;
    const timer = window.setInterval(() => {
      setResult(current => current && !current.debugger.paused ? tickPreviewRuntime(current, 1000 / 60) : current);
    }, 1000 / 60);
    return () => window.clearInterval(timer);
  }, [advancing, setResult]);
}

function EventNativeResponseControls({ result, setResult }: { result: PreviewRuntimeState; setResult: React.Dispatch<React.SetStateAction<PreviewRuntimeState | null>> }): React.ReactElement | null {
  if (!result.nativeEvents.modal) return null;
  return <div className="event-debug-actions" role="group" aria-label="Responder à interação">
    {(["up", "down", "left", "right", "action", "back"] as const).map((action, index) => <button type="button" key={action} disabled={result.debugger.paused}
      onClick={() => setResult(current => current ? dispatchPreviewRuntimeAction(current, action) : current)}>
      {["Selecionar opção anterior", "Selecionar próxima opção", "Cursor à esquerda", "Cursor à direita", "Confirmar", "Voltar ou cancelar"][index]}
    </button>)}
  </div>;
}

function EventSimulationPanel({ event, projectData }: { event: EventsWorkspaceEvent; projectData: GBAProjectData }): React.ReactElement {
  const initial = useMemo(() => {
    const record = Array.isArray(projectData.events) ? projectData.events.find(record => record?.id === event.id || record?.name === event.name) : null;
    const room = typeof record?.sceneName === "string" ? record.sceneName : null;
    return bootPreviewRuntimeAtRoom(projectData, room, { skipBootEvents: true });
  }, [event.id, event.name, projectData]);
  const [roomName, setRoomName] = useState(initial.currentRoom?.name ?? "");
  const [result, setResult] = useState<PreviewRuntimeState | null>(null);
  useEventRuntimeClock(result, setResult);
  useEffect(() => { setResult(null); setRoomName(initial.currentRoom?.name ?? ""); }, [initial]);
  return <section className="event-debug-panel" aria-label={`Simulação de ${event.name}`}>
    <p>Simula as variáveis e o fluxo deste evento no editor.</p>
    <label>Cena da simulação
      <select aria-label="Cena da simulação" value={roomName} onChange={e => { setRoomName(e.currentTarget.value); setResult(null); }}>
        {initial.rooms.map(room => <option key={room.id} value={room.name}>{room.name}</option>)}
      </select>
    </label>
    <div className="event-debug-actions"><button type="button" disabled={!initial.ready} onClick={() => {
      const base = bootPreviewRuntimeAtRoom(projectData, roomName, { skipBootEvents: true });
      setResult(runPreviewRuntimeEvent(base, event.name));
    }}>Executar simulação</button></div>
    {result ? <section className="event-debug-result" aria-label={`Resultado da simulação de ${event.name}`}>
      <EventRuntimeStatus result={result}/>
      <EventNativeResponseControls result={result} setResult={setResult}/>
      <div className="event-debug-actions">
        <button type="button" disabled={result.debugger.paused} onClick={() => setResult(current => current ? dispatchPreviewRuntimeAction(current, "action") : current)}>Interagir</button>
        <button type="button" disabled={result.debugger.paused} onClick={() => setResult(current => current ? tickPreviewRuntime(current, 1000 / 60) : current)}>Avançar um quadro</button>
      </div>
      {result.currentRoom?.sceneType === "topdown" && result.player ? <>
        <div className="event-debug-actions" role="group" aria-label="Mover jogador na simulação">
          {(["up", "left", "down", "right"] as const).map((direction, index) => <button key={direction} type="button"
            disabled={result.debugger.paused || result.scriptWaitFrames > 0 || result.scriptQueue.length > 0 || result.scriptContinuations.length > 0}
            onClick={() => setResult(current => current ? dispatchPreviewRuntimeAction(current, direction) : current)}>
            {["Mover para cima", "Mover à esquerda", "Mover para baixo", "Mover à direita"][index]}
          </button>)}
        </div>
        <p>Cena: {result.currentRoom.name}. Posição: {result.player.x}, {result.player.y} tiles.</p>
      </> : null}
      {result.platformerPhysics ? <p>Estado da Plataforma: {result.platformerState}. Posição: {result.platformerPhysics.x.toFixed(2)}, {result.platformerPhysics.y.toFixed(2)} px.</p> : null}
      <div className="event-runtime-variables">
        {Object.entries(result.variables).map(([name, value]) => <code key={name}>{name} = {String(value)}</code>)}
      </div>
      {result.activeMusic ? <p>Rotina de música: {result.activeMusic}</p> : null}
    </section> : null}
  </section>;
}

function EventDebugPanel({ event, result, onRun }: EventDebugPanelProps): React.ReactElement {
  if (!event) {
    return (
      <section aria-label="Depurar evento" className="event-debug-panel">
        <h4>Escolha um evento para testar</h4>
        <p>Selecione um evento no Mapa ou crie um novo na visão Montar.</p>
      </section>
    );
  }

  return (
    <section aria-label={`Depurar evento ${event.name}`} className="event-debug-panel">
      <header>
        <span>Teste a lógica</span>
        <h4>{event.name}</h4>
        <p>{describeEventFlow(event)}</p>
      </header>
      <div className="event-debug-actions">
        <button aria-label={`Executar evento ${event.name}`} onClick={() => onRun(false)} type="button">
          Executar evento
        </button>
        <button aria-label={`Depurar evento ${event.name}`} onClick={() => onRun(true)} type="button">
          Depurar evento
        </button>
      </div>
      {result ? (
        <section className="event-debug-result" aria-label={`Resultado de ${event.name}`}>
          <EventRuntimeStatus result={result}/>
          {result.executionTrace.length ? (
            <ol>
              {result.executionTrace.map((item, index) => (
                <li key={`${item.eventName}-${item.command}-${index}`}>
                  <span>{item.eventName}</span>
                  <code>{item.command}</code>
                  <em>{item.status}</em>
                </li>
              ))}
            </ol>
          ) : <p>Nenhum evento foi executado.</p>}
        </section>
      ) : <p className="event-debug-empty">Execute o evento para acompanhar o resultado.</p>}
    </section>
  );
}

interface EventGraphCanvasProps {
  presentation: EventsWorkspacePresentation;
  layoutKey: string;
  fitViewportRequestID: number;
  eventsByID: Map<string, EventsWorkspaceEvent>;
  allEvents: EventsWorkspaceEvent[];
  selectedNodeID: string | null;
  selectedEdgeID: string | null;
  selectedStep: { eventID: string; stepIndex: number } | null;
  pendingConnectionSourceID: string | null;
  onUpdateEventGraphNodePosition: EventsWorkspaceProps["onUpdateEventGraphNodePosition"];
  onUpdateEventStep: EventsWorkspaceProps["onUpdateEventStep"];
  onBindEventToTarget: EventsWorkspaceProps["onBindEventToTarget"];
  onSelectNode(nodeID: string): void;
  onSelectEdge(edgeID: string): void;
  onSelectStep(eventID: string, stepIndex: number): void;
  onStartConnection(nodeID: string): void;
  onCompleteConnection(sourceEventID: string, targetEventName: string): void;
  onOpenCommandMenu(eventID: string): void;
  onOpenCommandMenuForBindingSlot(
    node: EventsWorkspaceGraphNode,
    slot: EventsWorkspaceContextBindingSlotState
  ): void;
}

interface EventGraphDragState {
  nodeID: string;
  offsetX: number;
  offsetY: number;
  pointerID: number;
}

interface EventGraphPanState {
  pointerID: number;
  startScrollLeft: number;
  startScrollTop: number;
  startX: number;
  startY: number;
}

interface EventGraphDisplayNode extends EventsWorkspaceGraphNode {
  displayX: number;
  displayY: number;
}

function eventGraphCategoryClassName(category: string): string {
  const normalizedCategory = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return normalizedCategory ? `category-${normalizedCategory}` : "category-default";
}

function eventGraphCategoryIcon(category: string): LucideIcon {
  const normalizedCategory = category
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (normalizedCategory.includes("player") || normalizedCategory.includes("ator")) return UserRound;
  if (normalizedCategory.includes("trigger")) return Zap;
  if (normalizedCategory.includes("dialog")) return MessageSquare;
  if (normalizedCategory.includes("audio")) return AudioLines;
  if (normalizedCategory.includes("variave")) return Hash;
  if (normalizedCategory.includes("controle")) return SlidersHorizontal;
  return MapIcon;
}

function contextTargetKind(contextKind: EventsWorkspaceGraphContextKind | null): BindEventToTargetOptions["targetKind"] {
  if (contextKind === "actor") return "actor";
  if (contextKind === "trigger") return "trigger";
  return "room";
}

function contextBindingFields(node: EventsWorkspaceGraphNode | null): Array<{ bindingKey: string; label: string; section: string | null }> {
  if (!node || node.nodeKind !== "context") return [];
  return node.contextBindingSlots.map(({ bindingKey, label, section }) => ({ bindingKey, label, section }));
}

function contextPrimaryBindingKey(contextKind: EventsWorkspaceGraphContextKind | null): string {
  if (contextKind === "actor") return "onInit";
  if (contextKind === "trigger") return "onEnter";
  return "onInit";
}

function contextCardHeight(node: EventsWorkspaceGraphNode): number {
  return estimateContextNodeHeight(node);
}

interface EventBindingPickerState {
  bindingKey: string;
  label: string;
  nodeID: string;
  targetKind: BindEventToTargetOptions["targetKind"];
  targetName: string;
}

interface EventBindingPickerProps {
  events: EventsWorkspaceEvent[];
  picker: EventBindingPickerState;
  query: string;
  onClose(): void;
  onQueryChange(query: string): void;
  onSelect(eventID: string): void;
}

function EventBindingPicker({
  events,
  picker,
  query,
  onClose,
  onQueryChange,
  onSelect
}: EventBindingPickerProps): React.ReactElement {
  const normalizedQuery = query.trim().toLowerCase();
  const visibleEvents = normalizedQuery
    ? events.filter((event) => (
      event.name.toLowerCase().includes(normalizedQuery) ||
      event.category.toLowerCase().includes(normalizedQuery)
    ))
    : events;

  return (
    <div className="event-binding-picker-backdrop" onClick={onClose} role="presentation">
      <section
        aria-label={`Escolher evento para ${picker.label}`}
        className="event-binding-picker"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="event-binding-picker-header">
          <div>
            <h4>{picker.label}</h4>
            <p>{picker.targetName}</p>
          </div>
          <button onClick={onClose} type="button">Fechar</button>
        </header>
        <label className="event-binding-picker-search">
          <span>Buscar evento</span>
          <input
            autoFocus
            onChange={(event) => onQueryChange(event.currentTarget.value)}
            placeholder="Nome ou categoria"
            type="search"
            value={query}
          />
        </label>
        <div className="event-binding-picker-list" role="list">
          {visibleEvents.length === 0 ? (
            <p className="muted">Nenhum evento encontrado.</p>
          ) : (
            visibleEvents.map((event) => (
              <button
                key={`${picker.nodeID}-${picker.bindingKey}-${event.id}`}
                onClick={() => onSelect(event.id)}
                type="button"
              >
                <strong>{event.name}</strong>
                <span>{event.category}</span>
              </button>
            ))
          )}
        </div>
      </section>
    </div>
  );
}

function contextEntityLabel(
  contextKind: EventsWorkspaceGraphContextKind | null,
  contextRole: EventsWorkspaceGraphNode["contextRole"] = null
): string {
  if (contextKind === "actor") return contextRole === "player" ? "Player" : "Ator";
  if (contextKind === "trigger") return "Trigger";
  return "Cena";
}

function graphNodeClassName(
  node: EventsWorkspaceGraphNode,
  selectedNodeID: string | null,
  pendingConnectionSourceID: string | null,
  connectableTargetIDs: Set<string>
): string {
  return [
    "event-graph-node",
    `node-${node.nodeKind}`,
    eventGraphCategoryClassName(node.category),
    node.id === selectedNodeID ? "selected" : "",
    `flow-${node.flowRole}`,
    node.id === pendingConnectionSourceID ? "connection-source" : "",
    connectableTargetIDs.has(node.id) ? "connection-target" : "",
    node.isUnlinked ? "unlinked" : "",
    node.missingReferenceCount > 0 ? "warning" : ""
  ].filter(Boolean).join(" ");
}

function EventGraphCanvas({
  presentation,
  layoutKey,
  fitViewportRequestID,
  eventsByID,
  allEvents,
  selectedNodeID,
  selectedEdgeID,
  selectedStep,
  pendingConnectionSourceID,
  onUpdateEventGraphNodePosition,
  onUpdateEventStep,
  onBindEventToTarget,
  onSelectNode,
  onSelectEdge,
  onSelectStep,
  onStartConnection,
  onCompleteConnection,
  onOpenCommandMenu,
  onOpenCommandMenuForBindingSlot
}: EventGraphCanvasProps): React.ReactElement {
  const [dragState, setDragState] = useState<EventGraphDragState | null>(null);
  const [dragPreviewPosition, setDragPreviewPosition] = useState<UpdateEventGraphNodePosition | null>(null);
  const [zoom, setZoom] = useState(1);
  const [bindingPicker, setBindingPicker] = useState<EventBindingPickerState | null>(null);
  const [bindingPickerQuery, setBindingPickerQuery] = useState("");
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const panState = useRef<EventGraphPanState | null>(null);
  const viewPaddingX = 96;
  const viewPaddingY = 78;
  const nodeWidth = 196;
  const nodeHeight = 118;
  const sourceNodes = dragState && dragPreviewPosition
    ? presentation.graphNodes.map((node) => (
      node.id === dragState.nodeID ? { ...node, ...dragPreviewPosition } : node
    ))
    : presentation.graphNodes;
  const minNodeX = Math.min(0, ...sourceNodes.map((node) => node.x));
  const maxNodeX = Math.max(0, ...sourceNodes.map((node) => node.x));
  const minNodeY = Math.min(0, ...sourceNodes.map((node) => node.y));
  const displayNodes = sourceNodes.map((node) => ({
    ...node,
    displayX: node.x - minNodeX + viewPaddingX,
    displayY: node.y - minNodeY + viewPaddingY
  }));
  const nodesByName = new Map(displayNodes.map((node) => [node.eventName, node]));
  const nodesByID = new Map(displayNodes.map((node) => [node.id, node]));
  const connectableTargetIDs = new Set(
    pendingConnectionSourceID
      ? (presentation.graphConnectTargetsBySource[pendingConnectionSourceID] ?? []).map((target) => target.eventID)
      : []
  );
  const canvasWidth = Math.max(980, ...displayNodes.map((node) => node.displayX + nodeWidth + 128));
  const canvasHeight = Math.max(620, ...displayNodes.map((node) => {
    const height = node.nodeKind === "context" ? contextCardHeight(node) : nodeHeight;
    return node.displayY + height + 104;
  }));

  function graphNodeHeightFor(node: EventGraphDisplayNode): number {
    if (node.nodeKind === "context") return contextCardHeight(node);
    if (selectedStep?.eventID !== node.id) return nodeHeight;
    const selectedEventStep = eventsByID.get(node.id)?.steps.find((step) => step.index === selectedStep.stepIndex);
    return selectedEventStep?.commandParameters.length ? nodeHeight + 64 : nodeHeight;
  }

  useEffect(() => {
    if (!fitViewportRequestID || !viewportRef.current || displayNodes.length === 0) return;

    const viewport = viewportRef.current;
    const minDisplayX = Math.min(...displayNodes.map((node) => node.displayX));
    const minDisplayY = Math.min(...displayNodes.map((node) => node.displayY));
    const maxDisplayX = Math.max(...displayNodes.map((node) => node.displayX + nodeWidth));
    const maxDisplayY = Math.max(...displayNodes.map((node) => node.displayY + graphNodeHeightFor(node)));

    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, Math.round(minDisplayX - 48));
      viewport.scrollTop = Math.max(0, Math.round(minDisplayY - 48));
      const viewportWidth = viewport.clientWidth / zoom;
      const viewportHeight = viewport.clientHeight / zoom;
      if (maxDisplayX - minDisplayX > viewportWidth || maxDisplayY - minDisplayY > viewportHeight) {
        viewport.scrollLeft = Math.max(0, Math.round(minDisplayX - 48));
        viewport.scrollTop = Math.max(0, Math.round(minDisplayY - 48));
      }
    });
  }, [displayNodes, fitViewportRequestID, zoom]);

  function applyZoomAtPointer(nextZoom: number, pointer: { x: number; y: number }): void {
    const viewport = viewportRef.current;
    if (!viewport) {
      setZoom(nextZoom);
      return;
    }

    const worldX = (viewport.scrollLeft + pointer.x) / zoom;
    const worldY = (viewport.scrollTop + pointer.y) / zoom;
    setZoom(nextZoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.round(worldX * nextZoom - pointer.x);
      viewport.scrollTop = Math.round(worldY * nextZoom - pointer.y);
    });
  }

  function canvasPosition(target: HTMLElement, clientX: number, clientY: number, drag: EventGraphDragState): UpdateEventGraphNodePosition | null {
    const canvas = target.closest(".event-graph-canvas");
    if (!(canvas instanceof HTMLElement)) return null;

    const bounds = canvas.getBoundingClientRect();
    return {
      x: (clientX - bounds.left) / zoom - drag.offsetX + minNodeX - viewPaddingX,
      y: (clientY - bounds.top) / zoom - drag.offsetY + minNodeY - viewPaddingY
    };
  }

  function startDrag(event: React.PointerEvent<HTMLDivElement>, node: EventsWorkspaceGraphNode): void {
    if (pendingConnectionSourceID && pendingConnectionSourceID !== node.id) {
      return;
    }

    const bounds = event.currentTarget.getBoundingClientRect();
    const nextDrag = {
      nodeID: node.id,
      offsetX: (event.clientX - bounds.left) / zoom,
      offsetY: (event.clientY - bounds.top) / zoom,
      pointerID: event.pointerId
    };
    onSelectNode(node.id);
    setDragState(nextDrag);
    setDragPreviewPosition({ x: node.x, y: node.y });
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (!dragState || dragState.pointerID !== event.pointerId || event.buttons !== 1) return;
    const position = canvasPosition(event.currentTarget, event.clientX, event.clientY, dragState);
    if (!position) return;
    setDragPreviewPosition(position);
  }

  function endDrag(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (dragState && dragPreviewPosition && dragState.pointerID === event.pointerId) {
      onUpdateEventGraphNodePosition(dragState.nodeID, dragPreviewPosition);
    }
    setDragState(null);
    setDragPreviewPosition(null);
  }

  function chooseNode(node: EventsWorkspaceGraphNode): void {
    if (node.nodeKind === "event" && pendingConnectionSourceID && pendingConnectionSourceID !== node.id && connectableTargetIDs.has(node.id)) {
      onCompleteConnection(pendingConnectionSourceID, node.eventName);
      return;
    }

    onSelectNode(node.id);
  }

  function locateNode(node: EventGraphDisplayNode): void {
    chooseNode(node);
    const viewport = viewportRef.current;
    if (!viewport) return;
    viewport.scrollLeft = Math.max(0, node.displayX * zoom - viewport.clientWidth / 2 + nodeWidth / 2);
    viewport.scrollTop = Math.max(0, node.displayY * zoom - viewport.clientHeight / 2 + graphNodeHeightFor(node) / 2);
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>): void {
    if (!event.ctrlKey && !event.metaKey) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    event.preventDefault();
    const bounds = viewport.getBoundingClientRect();
    const nextViewport = wheelZoomCanvasViewport({
      current: {
        scrollLeft: viewport.scrollLeft,
        scrollTop: viewport.scrollTop,
        zoom
      },
      deltaY: event.deltaY,
      maxZoom: 2,
      minZoom: 0.35,
      pointer: {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top
      }
    });
    setZoom(nextViewport.zoom);
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = nextViewport.scrollLeft;
      viewport.scrollTop = nextViewport.scrollTop;
    });
  }

  function canStartPan(target: EventTarget | null): boolean {
    if (!(target instanceof HTMLElement)) return false;
    return !target.closest(".event-graph-node, path, button, input, select, textarea, [contenteditable='true']");
  }

  function startPan(event: React.PointerEvent<HTMLDivElement>): void {
    if (event.button !== 0 || !canStartPan(event.target)) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    panState.current = {
      pointerID: event.pointerId,
      startScrollLeft: viewport.scrollLeft,
      startScrollTop: viewport.scrollTop,
      startX: event.clientX,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continuePan(event: React.PointerEvent<HTMLDivElement>): void {
    const pan = panState.current;
    const viewport = viewportRef.current;
    if (!pan || pan.pointerID !== event.pointerId || !viewport) return;
    viewport.scrollLeft = pan.startScrollLeft - (event.clientX - pan.startX);
    viewport.scrollTop = pan.startScrollTop - (event.clientY - pan.startY);
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>): void {
    const pan = panState.current;
    if (!pan || pan.pointerID !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    panState.current = null;
  }

  function setZoomByStep(delta: number): void {
    const viewport = viewportRef.current;
    const nextZoom = Math.max(0.35, Math.min(2, Math.round((zoom + delta) * 100) / 100));
    if (!viewport) {
      setZoom(nextZoom);
      return;
    }

    applyZoomAtPointer(nextZoom, {
      x: viewport.clientWidth / 2,
      y: viewport.clientHeight / 2
    });
  }

  function fitViewToNodes(): void {
    const viewport = viewportRef.current;
    if (!viewport || displayNodes.length === 0) return;
    const minX = Math.min(...displayNodes.map((node) => node.displayX));
    const minY = Math.min(...displayNodes.map((node) => node.displayY));
    const maxX = Math.max(...displayNodes.map((node) => node.displayX + nodeWidth));
    const maxY = Math.max(...displayNodes.map((node) => node.displayY + graphNodeHeightFor(node)));
    const contentWidth = maxX - minX + viewPaddingX * 2;
    const contentHeight = maxY - minY + viewPaddingY * 2;
    const nextZoom = Math.max(
      0.35,
      Math.min(2, Math.min(viewport.clientWidth / contentWidth, viewport.clientHeight / contentHeight))
    );
    applyZoomAtPointer(nextZoom, {
      x: viewport.clientWidth / 2,
      y: viewport.clientHeight / 2
    });
    window.requestAnimationFrame(() => {
      viewport.scrollLeft = Math.max(0, (minX - viewPaddingX) * nextZoom);
      viewport.scrollTop = Math.max(0, (minY - viewPaddingY) * nextZoom);
    });
  }

  function openBindingPicker(node: EventsWorkspaceGraphNode, bindingKey: string, label: string): void {
    if (!node.contextKind || !node.targetName) return;
    setBindingPickerQuery("");
    setBindingPicker({
      bindingKey,
      label,
      nodeID: node.id,
      targetKind: contextTargetKind(node.contextKind),
      targetName: node.targetName
    });
  }

  function closeBindingPicker(): void {
    setBindingPicker(null);
    setBindingPickerQuery("");
  }

  return (
    <div
      className="event-graph-viewport"
      onPointerCancel={endPan}
      onPointerDown={startPan}
      onPointerMove={continuePan}
      onPointerUp={endPan}
      onWheel={handleWheel}
      ref={viewportRef}
    >
      <div className="event-graph-zoom" role="group" aria-label="Zoom do canvas de eventos">
        <button aria-label="Ajustar canvas aos cards visiveis" onClick={fitViewToNodes} title="Ajustar" type="button">
          <ScanSearch aria-hidden="true" size={14} strokeWidth={2.3} />
        </button>
        <button aria-label="Reduzir zoom do canvas de eventos" onClick={() => setZoomByStep(-0.1)} type="button">
          <ZoomOut aria-hidden="true" size={14} strokeWidth={2.3} />
        </button>
        <strong>{Math.round(zoom * 100)}%</strong>
        <button aria-label="Aumentar zoom do canvas de eventos" onClick={() => setZoomByStep(0.1)} type="button">
          <ZoomIn aria-hidden="true" size={14} strokeWidth={2.3} />
        </button>
      </div>
      <div
        className="event-graph-scale-space"
        style={{
          height: canvasHeight * zoom,
          width: canvasWidth * zoom
        }}
      >
        <div
          className="event-graph-canvas"
          style={{
            height: canvasHeight,
            transform: `scale(${zoom})`,
            width: canvasWidth
          }}
        >
          <svg aria-hidden="true" className="event-graph-lines" height={canvasHeight} width={canvasWidth}>
        <defs>
          <marker id="event-graph-arrow" markerHeight="10" markerWidth="10" orient="auto" refX="8" refY="5">
            <path d="M 0 1 L 9 5 L 0 9 z" />
          </marker>
          <marker id="event-graph-arrow-missing" markerHeight="10" markerWidth="10" orient="auto" refX="8" refY="5">
            <path d="M 0 1 L 9 5 L 0 9 z" />
          </marker>
          <marker id="event-graph-arrow-binding" markerHeight="10" markerWidth="10" orient="auto" refX="8" refY="5">
            <path d="M 0 1 L 9 5 L 0 9 z" />
          </marker>
        </defs>
        {presentation.graphEdges.map((edge) => {
          const source = nodesByName.get(edge.sourceEventName);
          const target = nodesByName.get(edge.targetEventName);
          if (!source || !target) return null;
          const sourceX = source.displayX + nodeWidth;
          const sourceY = source.displayY + graphNodeHeightFor(source) / 2;
          const targetX = target.displayX;
          const targetY = target.displayY + graphNodeHeightFor(target) / 2;
          const bend = Math.max(68, Math.abs(targetX - sourceX) * 0.42);
          return (
            <path
              aria-label={`Selecionar chamada ${edge.flowLabel} de ${edge.sourceEventName} para ${edge.targetEventName}`}
              className={[
                edge.flowKind,
                edge.isMissingTarget ? "missing" : "",
                edge.id === selectedEdgeID ? "selected" : ""
              ].filter(Boolean).join(" ")}
              d={`M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`}
              key={edge.id}
              markerEnd={edge.isMissingTarget ? "url(#event-graph-arrow-missing)" : "url(#event-graph-arrow)"}
              onClick={(event) => {
                event.stopPropagation();
                onSelectEdge(edge.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectEdge(edge.id);
                }
              }}
              role="button"
              tabIndex={0}
            />
          );
        })}
        {presentation.graphBindingEdges.map((edge) => {
          if (!edge.targetNodeID) return null;
          const source = nodesByID.get(edge.sourceNodeID);
          const target = nodesByID.get(edge.targetNodeID);
          if (!source || !target) return null;
          const sourceX = source.displayX + nodeWidth;
          const sourceY = source.displayY + graphNodeHeightFor(source) / 2;
          const targetX = target.displayX;
          const targetY = target.displayY + graphNodeHeightFor(target) / 2;
          const bend = Math.max(58, Math.abs(targetX - sourceX) * 0.34);
          return (
            <path
              aria-label={`Selecionar vinculo ${edge.sourceLabel} ${edge.bindingKey} para ${edge.targetEventName}`}
              className="binding-edge"
              d={`M ${sourceX} ${sourceY} C ${sourceX + bend} ${sourceY}, ${targetX - bend} ${targetY}, ${targetX} ${targetY}`}
              key={edge.id}
              markerEnd="url(#event-graph-arrow-binding)"
              onClick={(event) => {
                event.stopPropagation();
                onSelectNode(edge.sourceNodeID);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectNode(edge.sourceNodeID);
                }
              }}
              role="button"
              tabIndex={0}
            />
          );
        })}
      </svg>
      {presentation.graphEdges.map((edge) => {
        const source = nodesByName.get(edge.sourceEventName);
        const target = nodesByName.get(edge.targetEventName);
        if (!source || !target) return null;
        return (
          <span
            aria-hidden="true"
            className={[
              "event-graph-edge-badge",
              edge.flowKind,
              edge.id === selectedEdgeID ? "selected" : "",
              edge.isMissingTarget ? "missing" : ""
            ].filter(Boolean).join(" ")}
            key={`${edge.id}-badge`}
            style={{
              left: (source.displayX + nodeWidth + target.displayX) / 2,
              top: (source.displayY + target.displayY + graphNodeHeightFor(source)) / 2 - 13
            }}
          >
            {edge.flowLabel}
          </span>
        );
      })}
      {presentation.graphBindingEdges.map((edge) => {
        if (!edge.targetNodeID) return null;
        const source = nodesByID.get(edge.sourceNodeID);
        const target = nodesByID.get(edge.targetNodeID);
        if (!source || !target) return null;
        return (
          <span
            aria-hidden="true"
            className="event-graph-edge-badge binding-edge"
            key={`${edge.id}-badge`}
            style={{
              left: (source.displayX + nodeWidth + target.displayX) / 2,
              top: (source.displayY + target.displayY + graphNodeHeightFor(source)) / 2 + 13
            }}
          >
            {edge.label}
          </span>
        );
      })}
      {displayNodes.map((node) => {
        const eventDetails = eventsByID.get(node.id);
        const visibleSteps = eventDetails?.steps.filter((step) => step.isEnabled).slice(0, 2) ?? [];
        const hiddenStepCount = Math.max(0, (eventDetails?.enabledStepCount ?? 0) - visibleSteps.length);
        const pendingLabel = node.pendingBindingCount > 0
          ? `${node.pendingBindingCount} pend.`
          : node.missingReferenceCount > 0
            ? `${node.missingReferenceCount} pend.`
            : node.nodeKind === "context"
              ? node.boundEventNames.length > 0 ? "Vinculada" : "Sem evento"
              : "OK ROM";
        const CategoryIcon = eventGraphCategoryIcon(node.category);
        const cardHeight = graphNodeHeightFor(node);
        let lastBindingSection: string | null = null;
        return (
          <div
            aria-label={`${node.nodeKind === "context" ? "Contexto" : "Evento"} ${node.eventName}`}
            aria-pressed={node.id === selectedNodeID}
            className={[
              graphNodeClassName(node, selectedNodeID, pendingConnectionSourceID, connectableTargetIDs),
              node.nodeKind === "context" ? "context-card" : ""
            ].filter(Boolean).join(" ")}
            key={node.id}
            onClick={() => chooseNode(node)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                chooseNode(node);
              }
            }}
            onPointerDown={(event) => startDrag(event, node)}
            onPointerMove={continueDrag}
            onPointerUp={endDrag}
            role="button"
            style={{ height: cardHeight, left: node.displayX, top: node.displayY }}
            tabIndex={0}
          >
            <span className="event-graph-node-port in" aria-hidden="true" />
            {node.nodeKind === "event" ? (
              <button
                aria-label={`Criar conexao saindo de ${node.eventName}`}
                className="event-graph-node-port out"
                onClick={(event) => {
                  event.stopPropagation();
                  onStartConnection(node.id);
                }}
                onPointerDown={(event) => event.stopPropagation()}
                type="button"
              />
            ) : null}
            <span className="event-graph-node-topline" aria-hidden="true" />
            <span className="event-graph-node-header">
              <span className="event-graph-node-kind" aria-hidden="true">
                <CategoryIcon size={13} strokeWidth={2.4} />
              </span>
              <span>
                <strong>{node.targetName ?? node.eventName}</strong>
                <small>{node.contextSubtitle ?? `${node.category}${node.isUnlinked ? " - sem vinculo" : ""}`}</small>
              </span>
              <em>{pendingLabel}</em>
            </span>
            {node.nodeKind === "event" ? (
              <span className="event-graph-node-flow" aria-label={`Fluxo: ${node.flowLabels.join(", ")}`}>
                {node.flowLabels.slice(0, 3).map((label) => (
                  <small key={`${node.id}-${label}`}>{label}</small>
                ))}
              </span>
            ) : null}
            <span className={node.nodeKind === "context" ? "event-graph-binding-slots" : "event-graph-node-steps"}>
              {node.nodeKind === "context" ? (
                node.contextBindingSlots.map((slot) => {
                  const sectionHeader = slot.section && slot.section !== lastBindingSection
                    ? (lastBindingSection = slot.section, (
                      <strong className="event-graph-binding-section" key={`${node.id}-${slot.section}`}>
                        {slot.section}
                      </strong>
                    ))
                    : null;
                  const boundEvent = slot.eventName ? allEvents.find((event) => event.name === slot.eventName) ?? null : null;
                  return (
                    <Fragment key={`${node.id}-${slot.bindingKey}`}>
                      {sectionHeader}
                      <div className="event-graph-binding-row">
                        <span className="event-graph-binding-label">{slot.label}</span>
                        <span className={[
                          "event-graph-binding-value",
                          slot.isPending ? "pending" : "",
                          slot.isMissing ? "missing" : ""
                        ].filter(Boolean).join(" ")}>
                          {slot.eventName ?? "Sem evento"}
                        </span>
                        <button
                          aria-label={`Adicionar evento em ${slot.label}`}
                          className="event-graph-binding-add"
                          onClick={(event) => {
                            event.stopPropagation();
                            onOpenCommandMenuForBindingSlot(node, slot);
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          type="button"
                        >
                          <Plus aria-hidden="true" size={12} strokeWidth={2.4} />
                        </button>
                        <button
                          aria-label={boundEvent ? `Abrir script ${slot.eventName}` : `Criar script para ${slot.label}`}
                          className={[
                            "event-graph-binding-open",
                            slot.isPending ? "pending" : "linked"
                          ].join(" ")}
                          disabled={!slot.eventName}
                          onClick={(event) => {
                            event.stopPropagation();
                            if (boundEvent) onSelectNode(boundEvent.id);
                          }}
                          onPointerDown={(event) => event.stopPropagation()}
                          type="button"
                        >
                          <ArrowRight aria-hidden="true" size={12} strokeWidth={2.4} />
                        </button>
                      </div>
                    </Fragment>
                  );
                })
              ) : visibleSteps.length ? (
                visibleSteps.map((step) => {
                  const isSelectedStep = selectedStep?.eventID === node.id && selectedStep.stepIndex === step.index;
                  return (
                    <Fragment key={`${node.id}-${step.index}`}>
                      <button
                        aria-pressed={isSelectedStep}
                        className={["event-graph-step-chip", isSelectedStep ? "selected" : ""].filter(Boolean).join(" ")}
                        onClick={(event) => {
                          event.stopPropagation();
                          onSelectStep(node.id, step.index);
                        }}
                        onPointerDown={(event) => event.stopPropagation()}
                        type="button"
                      >
                        <small>{step.index === 0 ? "Ao iniciar" : `Comando ${step.index + 1}`}</small>
                        <strong className={step.command === "noop" ? "empty-command" : ""}>
                          {step.command === "noop" ? "Sem operação" : step.commandLabel}
                        </strong>
                        {step.flow.kind !== "linear" ? <em>{step.flow.label}</em> : null}
                      </button>
                      {isSelectedStep && step.commandParameters.length ? (
                        <span className="event-graph-inline-parameters" onClick={(event) => event.stopPropagation()}>
                          {step.commandParameters.slice(0, 2).map((parameter) => (
                            <label key={`${node.id}-${step.index}-${parameter.id}`}>
                              <small>{inlineCommandParameterLabel(parameter)}</small>
                              {parameter.options.length && parameter.kind !== "value" ? (
                                <select
                                    aria-label={`${inlineCommandParameterLabel(parameter)} do evento no card`}
                                  onChange={(event) => onUpdateEventStep(node.id, step.index, {
                                    command: commandWithParameterValue(step.command, parameter, event.currentTarget.value)
                                  })}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  value={parameter.value}
                                >
                                  {parameter.options.includes(parameter.value) ? null : <option value={parameter.value}>{parameter.value}</option>}
                                  {parameter.options.map((option) => <option key={option} value={option}>{option}</option>)}
                                </select>
                              ) : (
                                <input
                                  aria-label={`${inlineCommandParameterLabel(parameter)} do evento no card`}
                                  onChange={(event) => onUpdateEventStep(node.id, step.index, {
                                    command: commandWithParameterValue(step.command, parameter, event.currentTarget.value)
                                  })}
                                  onPointerDown={(event) => event.stopPropagation()}
                                  value={parameter.value}
                                />
                              )}
                            </label>
                          ))}
                        </span>
                      ) : null}
                    </Fragment>
                  );
                })
              ) : (
                <span>
                  <small>Fluxo</small>
                  <strong className={(eventDetails?.primaryCommand ?? "noop") === "noop" ? "empty-command" : ""}>
                    {(eventDetails?.primaryCommand ?? "noop") === "noop" ? "Sem operação" : eventDetails?.primaryCommand}
                  </strong>
                </span>
              )}
            </span>
            <span className="event-graph-node-footer">
              <small>
                {node.nodeKind === "context"
                  ? `${node.boundEventNames.length} vinculo${node.boundEventNames.length === 1 ? "" : "s"}`
                  : eventDetails ? `${eventDetails.enabledStepCount}/${eventDetails.stepCount} eventos` : "0 eventos"}
                {hiddenStepCount > 0 ? ` +${hiddenStepCount}` : ""}
              </small>
              <small>{node.incomingEdgeCount} in / {node.outgoingEdgeCount} out</small>
              {node.nodeKind === "event" ? (
                <button
                  aria-label={`Adicionar evento em ${node.eventName}`}
                  className="event-graph-node-add-block"
                  onClick={(event) => {
                    event.stopPropagation();
                    onOpenCommandMenu(node.id);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  type="button"
                >
                  <Plus aria-hidden="true" size={12} strokeWidth={2.4} />
                </button>
              ) : null}
            </span>
          </div>
        );
          })}
        </div>
      </div>
      <nav aria-label="Minimapa de eventos" className="event-graph-minimap">
        {displayNodes.map((node) => (
          <button
            aria-label={`Localizar ${node.eventName}`}
            className={`${node.nodeKind}${node.id === selectedNodeID ? " selected" : ""}`}
            key={`minimap-${node.id}`}
            onClick={() => locateNode(node)}
            style={{
              left: `${Math.min(92, Math.max(2, (node.displayX / canvasWidth) * 100))}%`,
              top: `${Math.min(88, Math.max(4, (node.displayY / canvasHeight) * 100))}%`
            }}
            title={node.eventName}
            type="button"
          />
        ))}
      </nav>
      {bindingPicker ? (
        <EventBindingPicker
          events={allEvents}
          onClose={closeBindingPicker}
          onQueryChange={setBindingPickerQuery}
          onSelect={(eventID) => {
            onBindEventToTarget(eventID, {
              bindingKey: bindingPicker.bindingKey,
              targetKind: bindingPicker.targetKind,
              targetName: bindingPicker.targetName
            });
            closeBindingPicker();
          }}
          picker={bindingPicker}
          query={bindingPickerQuery}
        />
      ) : null}
    </div>
  );
}

export function EventsWorkspace({
  presentation,
  projectData,
  variables = [],
  focusedEventName,
  focusedEventRequestID,
  onCreateEvent,
  onCreateVariable,
  onRemoveVariable,
  onUpdateEventFields,
  onAddEventStep,
  onUpdateEventStep,
  onUpdateSceneRouteTable,
  onUpdateMenuSliderItem,
  onUpdateEventGraphNodePosition,
  onRetargetEventGraphEdge,
  onConnectEventGraphNodes,
  onRemoveEventGraphEdge,
  onBindEventToTarget,
  onCreateBoundEventForTarget,
  onRemoveEventTargetBinding,
  onRemoveEventStep,
  onRenameEvent,
  onDuplicateEvent,
  onExportEvent,
  onRemoveEvent,
  onRelayoutEventsGraph
}: EventsWorkspaceProps): React.ReactElement {
  const [activeView, setActiveView] = useState<EventWorkspaceView>("build");
  const [inspectorSelection, setInspectorSelection] = useState<EventInspectorSelection | null>(null);
  const [pendingConnectionSourceID, setPendingConnectionSourceID] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<EventsWorkspaceFilterStatus>("");
  const [fitViewportRequestID, setFitViewportRequestID] = useState(0);
  const [activeSceneName, setActiveSceneName] = useState("");
  const [validationOpen, setValidationOpen] = useState(false);
  const [commandMenuOpen, setCommandMenuOpen] = useState(false);
  const [commandMenuEventID, setCommandMenuEventID] = useState<string | null>(null);
  const [commandMenuQuery, setCommandMenuQuery] = useState("");
  const [commandMenuTab, setCommandMenuTab] = useState<EventsCommandMenuTab>("all");
  const [commandMenuStepIndex, setCommandMenuStepIndex] = useState<number | null>(null);
  const [eventRuntimeResult, setEventRuntimeResult] = useState<PreviewRuntimeState | null>(null);
  const eventDebuggerPresentation = useMemo(
    () => eventRuntimeResult ? deriveGbaDebuggerPresentation(eventRuntimeResult, projectData) : null,
    [eventRuntimeResult, projectData]
  );
  useEventRuntimeClock(eventRuntimeResult, setEventRuntimeResult);
  const allEvents = useMemo(
    () => presentation?.groups.flatMap((group) => group.events) ?? [],
    [presentation?.groups]
  );
  const filteredGraph = useMemo(
    () => (presentation ? filterEventsWorkspaceGraphByScene(presentation, activeSceneName || null) : null),
    [presentation, activeSceneName]
  );
  const graphPresentation = useMemo(() => {
    if (!presentation || !filteredGraph) return presentation;
    return {
      ...presentation,
      graphNodes: filteredGraph.graphNodes,
      graphEdges: filteredGraph.graphEdges,
      graphBindingEdges: filteredGraph.graphBindingEdges,
      graphConnectTargetsBySource: filteredGraph.graphConnectTargetsBySource
    };
  }, [presentation, filteredGraph]);
  const validationIssues = useMemo(
    () => (presentation ? deriveEventsWorkspaceValidationIssues(presentation) : []),
    [presentation]
  );
  const bindableTargets = useMemo((): EventsWorkspaceBindingTarget[] => {
    if (!presentation) return [];
    return presentation.bindingTargets.filter((target) => !target.currentEventName);
  }, [presentation]);
  const contextualEventID = commandMenuEventID
    ?? (inspectorSelection?.kind === "event" || inspectorSelection?.kind === "step" ? inspectorSelection.eventID : null)
    ?? allEvents[0]?.id
    ?? null;
  const contextualEvent = contextualEventID ? allEvents.find((event) => event.id === contextualEventID) ?? null : null;
  const contextualCommandSuggestions = useMemo(
    () => presentation ? rankEventsCommandSuggestionsForContext(presentation.commandPalette, {
      eventCategory: contextualEvent?.category,
      bindingLabels: contextualEvent?.bindingLabels
    }) : [],
    [contextualEvent?.bindingLabels, contextualEvent?.category, presentation]
  );
  const commandMenuSuggestions = useMemo(
    () => (commandMenuStepIndex === null
      ? presentation?.commandPalette ?? []
      : contextualCommandSuggestions),
    [commandMenuStepIndex, contextualCommandSuggestions, presentation?.commandPalette]
  );
  const graphLayoutKey = useMemo(
    () => graphPresentation?.graphNodes.map((node) => `${node.id}:${node.x},${node.y}`).join("|") ?? "",
    [graphPresentation?.graphNodes]
  );

  useEffect(() => {
    if (!presentation || !focusedEventName) return;
    const event = allEvents.find((item) => item.name === focusedEventName || item.id === focusedEventName);
    if (!event) return;

    setInspectorSelection({ kind: "event", eventID: event.id });
    setPendingConnectionSourceID(null);
    setFilterStatus("");
  }, [allEvents, focusedEventName, focusedEventRequestID, presentation]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if ((event.key !== "Delete" && event.key !== "Backspace") || !presentation || commandMenuOpen) return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!inspectorSelection) return;

      if (inspectorSelection.kind === "edge") {
        const edge = presentation.graphEdges.find((candidate) => candidate.id === inspectorSelection.edgeID);
        if (!edge) return;
        event.preventDefault();
        onRemoveEventGraphEdge({ sourceEventID: edge.sourceEventID, stepIndex: edge.stepIndex });
        setInspectorSelection({ kind: "event", eventID: edge.sourceEventID });
        return;
      }

      if (inspectorSelection.kind === "step") {
        const selectedEventForStep = allEvents.find((candidate) => candidate.id === inspectorSelection.eventID);
        if (!selectedEventForStep) return;
        event.preventDefault();
        onRemoveEventStep(selectedEventForStep.id, inspectorSelection.stepIndex, selectedEventForStep.name);
        setInspectorSelection({ kind: "event", eventID: selectedEventForStep.id });
        return;
      }

      if (inspectorSelection.kind === "context") return;

      const selectedEventForDelete = allEvents.find((candidate) => candidate.id === inspectorSelection.eventID);
      if (!selectedEventForDelete) return;
      event.preventDefault();
      onRemoveEvent(selectedEventForDelete.id, selectedEventForDelete.name);
      setInspectorSelection(null);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [allEvents, commandMenuOpen, inspectorSelection, onRemoveEvent, onRemoveEventGraphEdge, onRemoveEventStep, presentation]);

  if (!presentation) {
    return (
      <WorkspaceEmptyState
        title="Editor de Eventos"
        description="Abra um projeto para visualizar scripts, eventos e vínculos do editor visual."
      />
    );
  }

  const eventsByID = new Map(allEvents.map((event) => [event.id, event]));
  const activeGraph = graphPresentation ?? presentation;
  const eventGraphNodes = activeGraph.graphNodes.filter((node) => node.nodeKind === "event");
  const selectedEdge = inspectorSelection?.kind === "edge"
    ? activeGraph.graphEdges.find((edge) => edge.id === inspectorSelection.edgeID) ?? null
    : null;
  const selectedStepEvent = inspectorSelection?.kind === "step"
    ? allEvents.find((event) => event.id === inspectorSelection.eventID) ?? null
    : null;
  const selectedStep = selectedStepEvent && inspectorSelection?.kind === "step"
    ? selectedStepEvent.steps.find((step) => step.index === inspectorSelection.stepIndex) ?? null
    : null;
  const selectedStepPendingMessages = selectedStep ? [
    ...(!selectedStep.isEnabled ? ["Evento inativo: este evento não executa até ser reativado."] : []),
    ...selectedStep.missingReferences
  ] : [];
  const selectedContextNode = inspectorSelection?.kind === "context"
    ? activeGraph.graphNodes.find((node) => node.id === inspectorSelection.nodeID && node.nodeKind === "context") ?? null
    : null;
  const selectedEventID = inspectorSelection?.kind === "event"
    ? inspectorSelection.eventID
    : inspectorSelection?.kind === "step"
      ? inspectorSelection.eventID
      : selectedEdge?.sourceEventID ?? null;
  const selectedGraphNode = selectedContextNode
    ?? (selectedEventID ? activeGraph.graphNodes.find((node) => node.id === selectedEventID) ?? null : null)
    ?? activeGraph.graphNodes.find((node) => node.nodeKind === "event")
    ?? activeGraph.graphNodes[0]
    ?? null;
  const selectedEvent = selectedContextNode ? null : (selectedEventID ? allEvents.find((event) => event.id === selectedEventID) ?? null : allEvents[0] ?? null);
  const commandMenuEvent = commandMenuEventID
    ? allEvents.find((event) => event.id === commandMenuEventID) ?? null
    : selectedEvent;
  const visualConnectTargets = selectedGraphNode ? activeGraph.graphConnectTargetsBySource[selectedGraphNode.id] ?? [] : [];
  const selectedGraphEdges = selectedGraphNode ? activeGraph.graphEdges.filter((edge) => edge.sourceEventID === selectedGraphNode.id) : [];
  const selectedContextBindingEdges = selectedContextNode
    ? activeGraph.graphBindingEdges.filter((edge) => edge.sourceNodeID === selectedContextNode.id)
    : [];
  const selectEvent = (eventID: string) => {
    setInspectorSelection({ kind: "event", eventID });
    setPendingConnectionSourceID(null);
  };
  const selectNode = (nodeID: string) => {
    const node = activeGraph.graphNodes.find((candidate) => candidate.id === nodeID);
    if (!node) return;
    setInspectorSelection(node.nodeKind === "context" ? { kind: "context", nodeID } : { kind: "event", eventID: nodeID });
    setPendingConnectionSourceID(null);
  };
  const selectEdge = (edgeID: string) => {
    setInspectorSelection({ kind: "edge", edgeID });
    setPendingConnectionSourceID(null);
  };
  const selectStep = (eventID: string, stepIndex: number) => {
    setInspectorSelection({ kind: "step", eventID, stepIndex });
    setPendingConnectionSourceID(null);
  };
  const startConnection = (eventID: string) => {
    const node = activeGraph.graphNodes.find((candidate) => candidate.id === eventID);
    if (node?.nodeKind !== "event") return;
    setInspectorSelection({ kind: "event", eventID });
    setPendingConnectionSourceID((current) => current === eventID ? null : eventID);
  };
  const completeConnection = (sourceEventID: string, targetEventName: string) => {
    onConnectEventGraphNodes({ sourceEventID, targetEventName });
    setPendingConnectionSourceID(null);
    setInspectorSelection({ kind: "event", eventID: sourceEventID });
  };
  const executeFromSelectedEvent = (debug: boolean): void => {
    if (!selectedEvent) return;
    let runtime = createPreviewRuntime(projectData);
    const existingTraceCount = runtime.executionTrace.length;
    if (debug) {
      runtime = enablePreviewDebugger(runtime, true);
      runtime = togglePreviewDebuggerBreakpoint(runtime, selectedEvent.name);
    }
    runtime = runPreviewRuntimeEvent(runtime, selectedEvent.name);
    setEventRuntimeResult({
      ...runtime,
      executionTrace: runtime.executionTrace.slice(existingTraceCount)
    });
  };
  function openCommandMenuForEvent(eventID: string, stepIndex: number | null = null): void {
    setInspectorSelection({ kind: "event", eventID });
    setPendingConnectionSourceID(null);
    setCommandMenuQuery("");
    setCommandMenuTab("all");
    setCommandMenuStepIndex(stepIndex);
    setCommandMenuEventID(eventID);
    setCommandMenuOpen(true);
  }
  function openRecipeMenuForEvent(eventID: string): void {
    openCommandMenuForEvent(eventID);
    setCommandMenuTab("recipes");
  }
  function closeCommandMenu(): void {
    setCommandMenuOpen(false);
    setCommandMenuEventID(null);
    setCommandMenuStepIndex(null);
  }
  function openCommandMenuForBindingSlot(
    node: EventsWorkspaceGraphNode,
    slot: EventsWorkspaceContextBindingSlotState
  ): void {
    if (!node.targetName || !node.contextKind) return;

    const bindOptions: BindEventToTargetOptions = {
      bindingKey: slot.bindingKey,
      targetKind: contextTargetKind(node.contextKind),
      targetName: node.targetName
    };
    const boundEvent = slot.eventName
      ? allEvents.find((event) => event.name === slot.eventName) ?? null
      : null;

    if (boundEvent) {
      openCommandMenuForEvent(boundEvent.id);
      return;
    }

    const eventID = onCreateBoundEventForTarget(bindOptions);
    if (eventID) {
      openCommandMenuForEvent(eventID);
    }
  }
  const eventEditorProps = {
    presentation,
    projectData,
    onCreateEvent,
    onUpdateEventFields,
    onAddEventStep,
    onUpdateEventStep,
    onUpdateSceneRouteTable,
    onUpdateMenuSliderItem,
    onUpdateEventGraphNodePosition,
    onRetargetEventGraphEdge,
    onConnectEventGraphNodes,
    onRemoveEventGraphEdge,
    onBindEventToTarget,
    onCreateBoundEventForTarget,
    onRemoveEventTargetBinding,
    onRemoveEventStep,
    onRenameEvent,
    onDuplicateEvent,
    onExportEvent,
    onRemoveEvent,
    onRelayoutEventsGraph,
    onOpenCommandMenu: (eventID: string, stepIndex: number | null) => {
      openCommandMenuForEvent(eventID, stepIndex);
    }
  };

  return (
    <section className="events-workspace" aria-label="Workspace Eventos">
      <h3 className="studio-visually-hidden">Editor de Eventos</h3>

      <div className="events-layout">
        <section className="events-canvas-stage" aria-label="Área de trabalho de eventos">
          <div aria-label="Visão do editor de eventos" className="events-view-tabs" role="tablist">
            <button
              aria-controls="events-build-view"
              aria-selected={activeView === "build"}
              onClick={() => setActiveView("build")}
              role="tab"
              type="button"
            >
              Montar
            </button>
            <button
              aria-controls="events-map-view"
              aria-selected={activeView === "map"}
              onClick={() => setActiveView("map")}
              role="tab"
              type="button"
            >
              Mapa
            </button>
            <button
              aria-controls="events-debug-view"
              aria-selected={activeView === "debug"}
              onClick={() => setActiveView("debug")}
              role="tab"
              type="button"
            >
              Depurar
            </button>
          </div>
          {activeView === "build" ? (
            <div id="events-build-view" role="tabpanel">
              <EventBuildPanel
                editorProps={eventEditorProps}
                event={selectedEvent}
                onCreateEvent={onCreateEvent}
                onOpenCommandMenu={(eventID) => openCommandMenuForEvent(eventID)}
                onOpenRecipeMenu={openRecipeMenuForEvent}
                onSelectStep={selectStep}
                selectedStepIndex={inspectorSelection?.kind === "step" && inspectorSelection.eventID === selectedEvent?.id
                  ? inspectorSelection.stepIndex
                  : null}
              />
            </div>
          ) : activeView === "debug" ? (
            <div id="events-debug-view" role="tabpanel">
              <EventDebugPanel event={selectedEvent} onRun={executeFromSelectedEvent} result={eventRuntimeResult} />
            </div>
          ) : (
            <div id="events-map-view" role="tabpanel">
          <WorkspaceContextToolbar className="events-tool-strip" aria-label="Ferramentas do editor de eventos">
            <button type="button" onClick={onCreateEvent}>Novo script</button>
            <button
              disabled={!selectedEvent}
              onClick={() => selectedEvent && openCommandMenuForEvent(selectedEvent.id)}
              type="button"
            >
              Adicionar evento
            </button>
            <button
              disabled={!selectedEvent}
              onClick={() => selectedEvent && openRecipeMenuForEvent(selectedEvent.id)}
              type="button"
            >
              Modelos de script
            </button>
            <label className="events-scene-filter">
              <span>Cena</span>
              <select
                aria-label="Filtrar canvas por cena"
                onChange={(event) => setActiveSceneName(event.currentTarget.value)}
                value={activeSceneName}
              >
                <option value="">Todas</option>
                {presentation.sceneNames.map((sceneName) => (
                  <option key={`scene-filter-${sceneName}`} value={sceneName}>{sceneDisplayName(sceneName)}</option>
                ))}
              </select>
            </label>
            {selectedEvent && bindableTargets.length ? (
              <label className="events-bind-topbar">
                <span>Usar em</span>
                <select
                  aria-label={`Vincular ${selectedEvent.name} a um alvo do projeto`}
                  defaultValue=""
                  onChange={(inputEvent) => {
                    const targetID = inputEvent.currentTarget.value;
                    inputEvent.currentTarget.value = "";
                    const target = presentation.bindingTargets.find((candidate) => candidate.id === targetID);
                    if (!target) return;
                    onBindEventToTarget(selectedEvent.id, {
                      targetKind: target.targetKind,
                      targetName: target.targetName,
                      bindingKey: target.bindingKey
                    });
                  }}
                >
                  <option value="">Escolher alvo</option>
                  {bindableTargets.map((target) => (
                    <option key={target.id} value={target.id}>{target.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              aria-expanded={validationOpen}
              className={validationIssues.length > 0 ? "warning-chip" : ""}
              onClick={() => setValidationOpen((current) => !current)}
              type="button"
            >
              Validar
              {validationIssues.length > 0 ? ` (${validationIssues.length})` : ""}
            </button>
            <button
              onClick={() => {
                onRelayoutEventsGraph();
                setFitViewportRequestID((current) => current + 1);
              }}
              type="button"
            >
              Organizar canvas
            </button>
            <div className="event-filter-segment" role="group" aria-label="Filtros rapidos de eventos">
              <StudioChip active={filterStatus === ""} onClick={() => setFilterStatus("")}>Tudo</StudioChip>
              <StudioChip active={filterStatus === "unlinked"} onClick={() => setFilterStatus("unlinked")}>Pendencias</StudioChip>
              <StudioChip active={filterStatus === "warnings"} onClick={() => setFilterStatus("warnings")}>Problemas</StudioChip>
              <StudioChip active={Boolean(selectedGraphNode)} disabled={!selectedGraphNode}>Selecionado</StudioChip>
            </div>
            <span>{activeGraph.graphNodes.length} cards{activeSceneName ? ` · ${activeSceneName}` : ""}</span>
          </WorkspaceContextToolbar>
          {validationOpen ? (
            <div className="events-validation-panel" aria-label="Diagnostico do grafo de eventos">
              {validationIssues.length ? validationIssues.map((issue) => (
                <button
                  className={issue.severity === "error" ? "danger-chip" : "warning-chip"}
                  key={issue.id}
                  onClick={() => {
                    if (issue.nodeID) selectNode(issue.nodeID);
                  }}
                  type="button"
                >
                  {issue.message}
                </button>
              )) : (
                <p className="muted">Nenhum problema encontrado no grafo de eventos.</p>
              )}
            </div>
          ) : null}

          <div className="event-graph-panel">
            <div className="event-graph-panel-header">
              <h4>Canvas visual</h4>
              <div className="event-graph-legend" aria-label="Legenda do canvas de eventos">
                <span className="context">Contexto</span>
                <span className="event">Evento</span>
                <span className="call">Chamada</span>
              </div>
              <div className="event-graph-count">
                Chamadas
                <strong>{presentation.summary.graphEdgeCount}</strong>
              </div>
            </div>
            {pendingConnectionSourceID ? (
              <div className="event-graph-connect">
                <span>
                  Conectando a partir de{" "}
                  <strong>{eventsByID.get(pendingConnectionSourceID)?.name ?? "evento"}</strong>
                </span>
                <button onClick={() => setPendingConnectionSourceID(null)} type="button">
                  Cancelar
                </button>
              </div>
            ) : null}
            {activeGraph.graphNodes.length > 0 ? (
              <EventGraphCanvas
                presentation={activeGraph}
                layoutKey={`${activeSceneName}|${graphLayoutKey}`}
                fitViewportRequestID={fitViewportRequestID}
                eventsByID={eventsByID}
                allEvents={allEvents}
                selectedNodeID={selectedGraphNode?.id ?? null}
                selectedEdgeID={selectedEdge?.id ?? null}
                selectedStep={inspectorSelection?.kind === "step" ? {
                  eventID: inspectorSelection.eventID,
                  stepIndex: inspectorSelection.stepIndex
                } : null}
                pendingConnectionSourceID={pendingConnectionSourceID}
                onUpdateEventGraphNodePosition={onUpdateEventGraphNodePosition}
                onUpdateEventStep={onUpdateEventStep}
                onBindEventToTarget={onBindEventToTarget}
                onSelectNode={selectNode}
                onSelectEdge={selectEdge}
                onSelectStep={selectStep}
                onStartConnection={startConnection}
                onCompleteConnection={completeConnection}
                onOpenCommandMenu={openCommandMenuForEvent}
                onOpenCommandMenuForBindingSlot={openCommandMenuForBindingSlot}
              />
            ) : (
              <p className="muted">Nenhum card de evento para exibir.</p>
            )}
          </div>
            </div>
          )}
        </section>

        <WorkspaceInspectorRail
          ariaLabel="Inspector de eventos"
          className="event-side-stack"
          workspaceId="events"
        >
          {inspectorSelection?.kind === "context" && selectedContextNode ? (
            <div className="event-inspector-panel event-context-panel" aria-label={`Inspector de ${selectedContextNode.eventName}`}>
              <div className="event-inspector-header">
                <div>
                  <h4>{selectedContextNode.eventName}</h4>
                  <p>{selectedContextNode.boundEventNames.length} vinculo{selectedContextNode.boundEventNames.length === 1 ? "" : "s"} de evento</p>
                </div>
                <span>{selectedContextNode.missingReferenceCount > 0 ? "Pendente" : selectedContextNode.boundEventNames.length ? "Vinculada" : "Sem evento"}</span>
              </div>
              {(() => {
                let lastSection: string | null = null;
                return contextBindingFields(selectedContextNode).map((field) => {
                  const sectionHeader = field.section && field.section !== lastSection
                    ? (lastSection = field.section, (
                      <h5 className="event-context-section" key={`${selectedContextNode.id}-${field.section}`}>
                        {field.section}
                      </h5>
                    ))
                    : null;
                  const boundEdge = selectedContextBindingEdges.find((edge) => edge.bindingKey === field.bindingKey);
                  return (
                    <Fragment key={`${selectedContextNode.id}-${field.bindingKey}`}>
                      {sectionHeader}
                      <label className="event-context-field">
                        <span>{field.label}</span>
                        <select
                          aria-label={`${field.label} de ${selectedContextNode.eventName}`}
                          onChange={(inputEvent) => {
                            const eventID = inputEvent.currentTarget.value;
                            const eventToBind = allEvents.find((event) => event.id === eventID);
                            if (!eventToBind || !selectedContextNode.targetName) return;
                            onBindEventToTarget(eventToBind.id, {
                              targetKind: contextTargetKind(selectedContextNode.contextKind),
                              targetName: selectedContextNode.targetName,
                              bindingKey: field.bindingKey
                            });
                          }}
                          value={boundEdge?.targetEventID ?? ""}
                        >
                          <option value="">Escolher evento</option>
                          {allEvents.map((event) => (
                            <option key={`${selectedContextNode.id}-${field.bindingKey}-${event.id}`} value={event.id}>
                              {event.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    </Fragment>
                  );
                });
              })()}
              <div className="event-context-summary">
                <span>{contextEntityLabel(selectedContextNode.contextKind, selectedContextNode.contextRole)}</span>
                <strong>{selectedContextNode.targetName ?? selectedContextNode.eventName}</strong>
                {selectedContextNode.sceneName ? (
                  <>
                    <span>Cena</span>
                    <strong>{sceneDisplayName(selectedContextNode.sceneName)}</strong>
                  </>
                ) : null}
                <span>Saidas</span>
                <strong>{selectedContextNode.outgoingEdgeCount}</strong>
                <span>Pendencias</span>
                <strong>{selectedContextNode.missingReferenceCount}</strong>
              </div>
              {selectedContextBindingEdges.length ? (
                <div className="event-active-bindings" aria-label={`Vinculos ativos de ${selectedContextNode.eventName}`}>
                  {selectedContextBindingEdges.map((edge) => (
                    <button
                      className={edge.isMissingTarget ? "warning" : ""}
                      key={edge.id}
                      onClick={() => onRemoveEventTargetBinding({
                        targetKind: edge.targetKind,
                        targetName: edge.targetName,
                        bindingKey: edge.bindingKey
                      })}
                      title={`Remover ${edge.bindingKey}`}
                      type="button"
                    >
                      {`${edge.bindingKey} -> ${edge.targetEventName}${edge.isMissingTarget ? " (pendente)" : ""}`}
                    </button>
                  ))}
                </div>
              ) : (
                <p className="muted">Nenhum evento vinculado a este contexto.</p>
              )}
            </div>
          ) : inspectorSelection?.kind === "edge" && selectedEdge ? (
            <div className="event-inspector-panel event-context-panel" aria-label={`Inspector da chamada ${selectedEdge.sourceEventName}`}>
              <div className="event-inspector-header">
                <div>
                  <h4>Conexao</h4>
                  <p>{selectedEdge.sourceEventName} - {selectedEdge.commandVerb}</p>
                </div>
                <span>{selectedEdge.isMissingTarget ? "Pendente" : "OK"}</span>
              </div>
              <label className="event-context-field">
                <span>Destino</span>
                <select
                  aria-label={`Destino de ${selectedEdge.sourceEventName} ${selectedEdge.commandVerb}`}
                  onChange={(inputEvent) => {
                    const targetEventName = inputEvent.currentTarget.value;
                    onRetargetEventGraphEdge({
                      sourceEventID: selectedEdge.sourceEventID,
                      stepIndex: selectedEdge.stepIndex,
                      targetEventName
                    });
                    setInspectorSelection({
                      kind: "edge",
                      edgeID: `${selectedEdge.sourceEventID}-${targetEventName}-${selectedEdge.commandVerb}-${selectedEdge.stepIndex}`
                    });
                  }}
                  value={selectedEdge.targetEventName}
                >
                  {(eventGraphNodes.some((node) => node.eventName === selectedEdge.targetEventName)
                    ? eventGraphNodes
                    : [{ id: `${selectedEdge.id}-missing`, eventName: selectedEdge.targetEventName }, ...eventGraphNodes]
                  ).map((node) => (
                    <option key={`${selectedEdge.id}-${node.id}`} value={node.eventName}>
                      {node.eventName}
                    </option>
                  ))}
                </select>
              </label>
              <div className="event-context-summary">
                <span>Origem</span>
                <strong>{selectedEdge.sourceEventName}</strong>
                <span>Fluxo</span>
                <strong>{selectedEdge.flowLabel}</strong>
                <span>Comando</span>
                <strong>{selectedEdge.stepIndex + 1}</strong>
                <span>Destino</span>
                <strong>{selectedEdge.targetEventName}</strong>
                {selectedEdge.guardCommand ? (
                  <>
                    <span>Guarda</span>
                    <strong>{`Comando ${(selectedEdge.guardStepIndex ?? 0) + 1}: ${selectedEdge.guardCommand}`}</strong>
                  </>
                ) : null}
                <span>Detalhe</span>
                <strong>{selectedEdge.flowDetail}</strong>
              </div>
              <div className="event-actions inspector-actions">
                <button type="button" onClick={() => selectEvent(selectedEdge.sourceEventID)}>Abrir evento</button>
                <button
                  className="danger-button"
                  onClick={() => {
                    onRemoveEventGraphEdge({
                      sourceEventID: selectedEdge.sourceEventID,
                      stepIndex: selectedEdge.stepIndex
                    });
                    setInspectorSelection({ kind: "event", eventID: selectedEdge.sourceEventID });
                  }}
                  type="button"
                >
                  Remover conexao
                </button>
              </div>
            </div>
          ) : inspectorSelection?.kind === "step" && selectedStepEvent && selectedStep ? (
            <div className="event-inspector-panel event-context-panel" aria-label={`Inspetor do evento ${selectedStep.index + 1}`}>
              <div className="event-inspector-header">
                <div>
                  <h4>Evento {selectedStep.index + 1}</h4>
                  <p>{selectedStepEvent.name}</p>
                </div>
                <span>{selectedStep.commandBadge}</span>
              </div>
              <div className="event-step-insight">
                <div>
                  <strong>{selectedStep.commandLabel}</strong>
                  <small>
                    {selectedStep.commandSection
                      ? `${selectedStep.commandCategory} / ${selectedStep.commandSection}`
                      : selectedStep.commandCategory} · {selectedStep.commandVerb}
                  </small>
                </div>
                <em>{selectedStep.isEnabled ? "Ativo" : "Inativo"}</em>
              </div>
              <div className="event-command-template-card">
                <span>Modelo</span>
                <code>{selectedStep.commandTemplate ?? selectedStep.commandVerb}</code>
                <small>{selectedStep.commandRuntimeStatus === "ok-rom"
                  ? "Executa na ROM."
                  : selectedStep.commandRuntimeStatus === "preview-p0"
                    ? "Disponível apenas como evento de organização no editor."
                    : selectedStep.commandRuntimeStatus === "preview-runtime"
                      ? "Reconhecido pelo editor, mas ainda nao compila para a ROM."
                      : "Ainda sem runtime Electron."}</small>
              </div>
              <div className={`event-flow-card ${selectedStep.flow.kind}`}>
                <span>Fluxo</span>
                <strong>{selectedStep.flow.label}</strong>
                <small>{selectedStep.flow.detail}</small>
                {selectedStep.flow.dependsOnStepIndex !== null ? (
                  <em>Depende do evento {selectedStep.flow.dependsOnStepIndex + 1}</em>
                ) : selectedStep.flow.controlsNextStep ? (
                  <em>Controla o próximo evento</em>
                ) : selectedStep.flow.targetEventName ? (
                  <em>Alvo: {selectedStep.flow.targetEventName}</em>
                ) : null}
              </div>
              {selectedStep.commandParameters.length ? (
                <div className="event-command-parameters" aria-label={`Parâmetros do evento ${selectedStep.index + 1}`}>
                  {selectedStep.commandParameters.map((parameter) => (
                    <div className="event-command-parameter-row" key={`${selectedStepEvent.id}-${selectedStep.index}-${parameter.id}`}>
                      {commandParameterInput(parameter, (value) => onUpdateEventStep(selectedStepEvent.id, selectedStep.index, {
                        command: commandWithParameterValue(selectedStep.command, parameter, value)
                      }))}
                      {!parameter.isKnownValue && parameter.options.length ? (
                        <small>Valor fora dos recursos atuais.</small>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="event-command-parameters empty">
                  <span>Parametros</span>
                  <p className="muted">Este evento não tem argumentos editáveis.</p>
                </div>
              )}
              {selectedStep.commandVerb === "change_scene_by_variable" ? (
                (() => {
                  const routeTableID = selectedStep.command.trim().split(/\s+/).filter(Boolean)[1] ?? "";
                  const routeTable = findSceneRouteTable(projectData, routeTableID);
                  return routeTable ? (
                    <SceneRouteTableEditor
                      table={routeTable}
                      projectData={projectData}
                      variables={variables}
                      onUpdate={onUpdateSceneRouteTable}
                    />
                  ) : (
                    <div className="event-scene-route-editor missing">
                      <strong>Tabela de rotas não encontrada</strong>
                      <span>{routeTableID || "Escolha uma tabela no parâmetro acima."}</span>
                    </div>
                  );
                })()
              ) : null}
              {selectedStep.commandVerb === "slider" ? (
                <MenuSliderEditor sceneName={sliderSceneName(projectData, selectedStepEvent.id)} screenID={selectedStep.command.trim().split(/\s+/)[1] ?? ""} projectData={projectData} onUpdate={onUpdateMenuSliderItem} />
              ) : null}
              {selectedStep.commandVerb !== "slider" ? <label className="event-context-toggle">
                <input
                  checked={selectedStep.isEnabled}
                  onChange={(inputEvent) => onUpdateEventStep(selectedStepEvent.id, selectedStep.index, {
                    isEnabled: inputEvent.currentTarget.checked
                  })}
                  type="checkbox"
                />
                <span>Executar este evento</span>
              </label> : null}
              <label className="event-context-field">
                <span>Evento</span>
                <button
                  className="event-step-command"
                  onClick={() => openCommandMenuForEvent(selectedStepEvent.id, selectedStep.index)}
                  onMouseDown={(inputEvent) => inputEvent.preventDefault()}
                  type="button"
                >
                  <span className="event-step-command-title">{eventStepLabel(selectedStep)}</span>
                  <small>{eventStepLabelCategory(selectedStep)}</small>
                </button>
              </label>
              <label className="event-context-field">
                <span>Comando (texto)</span>
                <input
                  onChange={(inputEvent) => onUpdateEventStep(selectedStepEvent.id, selectedStep.index, {
                    command: inputEvent.currentTarget.value
                  })}
                  type="text"
                  value={selectedStep.command}
                />
              </label>
              {selectedStep.paletteSuggestions.length ? (
                <div className="event-step-suggestions">
                  <span>Sugestões da paleta</span>
                  {selectedStep.paletteSuggestions.map((suggestion) => (
                    <button
                      aria-pressed={suggestion.command === selectedStep.command}
                      key={`${selectedStepEvent.id}-${selectedStep.index}-${suggestion.id}`}
                      onClick={() => onUpdateEventStep(selectedStepEvent.id, selectedStep.index, { command: suggestion.command })}
                      type="button"
                    >
                      <div>
                        <strong>{suggestion.label}</strong>
                        <small>{suggestion.command}</small>
                      </div>
                      {suggestion.badge ? <em>{suggestion.badge}</em> : null}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="event-step-suggestions empty">
                  <span>Sugestões da paleta</span>
                  <p className="muted">Comando custom sem sugestoes relacionadas.</p>
                </div>
              )}
              {selectedStepPendingMessages.length ? (
                <div className="event-step-issues context-issues">
                  {selectedStepPendingMessages.map((reference) => (
                    <span key={`${selectedStepEvent.id}-${selectedStep.index}-${reference}`}>{reference}</span>
                  ))}
                </div>
              ) : null}
              <div className="event-actions inspector-actions">
                <button type="button" onClick={() => selectEvent(selectedStepEvent.id)}>Abrir evento</button>
                <button
                  className="danger-button"
                  onClick={() => {
                    onRemoveEventStep(selectedStepEvent.id, selectedStep.index, selectedStepEvent.name);
                    setInspectorSelection({ kind: "event", eventID: selectedStepEvent.id });
                  }}
                  type="button"
                >
                  Remover evento
                </button>
              </div>
            </div>
          ) : selectedEvent ? (
            <div className="event-inspector-panel" aria-label={`Inspector de ${selectedEvent.name}`}>
              <div className="event-inspector-header">
                <div>
                  <h4>{selectedEvent.name}</h4>
                  <p>{selectedEvent.category} - {selectedEvent.enabledStepCount}/{selectedEvent.stepCount} eventos ativos</p>
                </div>
                <span>{selectedEvent.isUnlinked ? "Solto" : `${selectedEvent.referenceCount} uso${selectedEvent.referenceCount === 1 ? "" : "s"}`}</span>
              </div>
              {activeView !== "build" ? (
                <section className="event-natural-summary" aria-label={`Resumo de ${selectedEvent.name}`}>
                  <span>Em linguagem natural</span>
                  <p>{describeEventFlow(selectedEvent)}</p>
                </section>
              ) : null}
              <div className="event-actions inspector-actions">
                <button type="button" onClick={() => executeFromSelectedEvent(false)}>Executar daqui</button>
                <button type="button" onClick={() => executeFromSelectedEvent(true)}>Depurar daqui</button>
                <button type="button" onClick={() => onRenameEvent(selectedEvent.id, selectedEvent.name)}>Renomear</button>
                <button type="button" onClick={() => onDuplicateEvent(selectedEvent.id, selectedEvent.name)}>Duplicar</button>
                <button type="button" onClick={() => onExportEvent(selectedEvent.id, selectedEvent.name)}>Exportar</button>
                <button className="danger-button" type="button" onClick={() => onRemoveEvent(selectedEvent.id, selectedEvent.name)}>
                  Remover
                </button>
              </div>
              {eventRuntimeResult ? (
                <section className="event-runtime-result" aria-label={`Resultado de ${selectedEvent.name}`}>
                  <EventRuntimeStatus result={eventRuntimeResult}/>
                  <EventNativeResponseControls result={eventRuntimeResult} setResult={setEventRuntimeResult}/>
                  {eventDebuggerPresentation?.callStack.length ? (
                    <div className="event-runtime-debug-grid">
                      <section>
                        <span>Pilha de chamadas</span>
                        {eventDebuggerPresentation.callStack.map((entry, index) => (
                          <code key={`${entry}-${index}`}>{index + 1}. {entry}</code>
                        ))}
                      </section>
                      <section>
                        <span>Watches</span>
                        {eventDebuggerPresentation.watchValues.map((watch) => (
                          <code key={watch.expression}>{watch.expression} = {watch.value}</code>
                        ))}
                      </section>
                    </div>
                  ) : null}
                  {eventRuntimeResult.visualEffect ? (
                    <div
                      className={`event-runtime-visual-effect is-${eventRuntimeResult.visualEffect.effect}`}
                      data-effect={eventRuntimeResult.visualEffect.effect}
                    >
                      <span>Efeito visual</span>
                      <strong>{eventRuntimeResult.visualEffect.effect}</strong>
                      <code>
                        {eventRuntimeResult.visualEffect.layer} · {eventRuntimeResult.visualEffect.durationFrames} frames · {eventRuntimeResult.visualEffect.intensity}%
                      </code>
                    </div>
                  ) : null}
                  {eventRuntimeResult.sceneTransition ? (
                    <div
                      aria-label={`Transição de cena para ${eventRuntimeResult.sceneTransition.targetRoomName}`}
                      className={`event-runtime-scene-transition is-${eventRuntimeResult.sceneTransition.style}`}
                      data-effect={eventRuntimeResult.sceneTransition.style}
                      role="region"
                    >
                      <div className="event-runtime-scene-transition-heading">
                        <span>Transição de cena</span>
                        <strong>{sceneTransitionDisplayName(eventRuntimeResult.sceneTransition.style)}</strong>
                      </div>
                      <div aria-hidden="true" className="event-runtime-scene-transition-track">
                        <span style={{ width: `${Math.round(eventRuntimeResult.sceneTransition.progress * 100)}%` }} />
                      </div>
                      <code>
                        {eventRuntimeResult.sceneTransition.sourceRoomName ?? "Cena atual"}
                        {" → "}
                        {eventRuntimeResult.sceneTransition.targetRoomName}
                        {" · revelando · "}
                        {eventRuntimeResult.sceneTransition.elapsedFrames}/{eventRuntimeResult.sceneTransition.durationFrames} frames
                      </code>
                    </div>
                  ) : null}
                  {eventRuntimeResult.executionTrace.length ? (
                    <ol>
                      {eventRuntimeResult.executionTrace.map((item, index) => (
                        <li key={`${item.eventName}-${item.command}-${index}`}>
                          <span>{item.eventName}</span>
                          <code>{item.command}</code>
                          <em>{item.status}</em>
                        </li>
                      ))}
                    </ol>
                  ) : null}
                  <div className="event-runtime-variables">
                    {Object.entries(eventRuntimeResult.variables).length ? Object.entries(eventRuntimeResult.variables).map(([name, value]) => (
                      <code key={name}>{name} = {String(value)}</code>
                    )) : <span>Nenhuma variável alterada.</span>}
                  </div>
                </section>
              ) : null}
              {bindableTargets.length ? (
                <label className="event-context-field">
                  <span>Usar em</span>
                  <select
                    aria-label={`Vincular ${selectedEvent.name} a um alvo do projeto`}
                    defaultValue=""
                    onChange={(inputEvent) => {
                      const targetID = inputEvent.currentTarget.value;
                      inputEvent.currentTarget.value = "";
                      const target = presentation.bindingTargets.find((candidate) => candidate.id === targetID);
                      if (!target) return;
                      onBindEventToTarget(selectedEvent.id, {
                        targetKind: target.targetKind,
                        targetName: target.targetName,
                        bindingKey: target.bindingKey
                      });
                    }}
                  >
                    <option value="">Escolher room, ator ou trigger</option>
                    {bindableTargets.map((target) => (
                      <option key={target.id} value={target.id}>{target.label}</option>
                    ))}
                  </select>
                </label>
              ) : null}
              {selectedGraphNode ? (
                <div className={`event-flow-card ${selectedGraphNode.flowRole}`}>
                  <span>Papel no fluxo</span>
                  <strong>{selectedGraphNode.flowLabels.join(" · ")}</strong>
                  <small>{selectedGraphNode.incomingEdgeCount} entrada(s) e {selectedGraphNode.outgoingEdgeCount} saida(s)</small>
                  {selectedGraphNode.incomingFlowKinds.length || selectedGraphNode.outgoingFlowKinds.length ? (
                    <em>
                      {[
                        selectedGraphNode.incomingFlowKinds.length ? `Recebe: ${selectedGraphNode.incomingFlowKinds.join(", ")}` : "",
                        selectedGraphNode.outgoingFlowKinds.length ? `Envia: ${selectedGraphNode.outgoingFlowKinds.join(", ")}` : ""
                      ].filter(Boolean).join(" | ")}
                    </em>
                  ) : null}
                </div>
              ) : null}
              {activeView !== "build" ? eventEditor(
                selectedEvent,
                eventEditorProps,
                inspectorSelection?.kind === "step" && inspectorSelection.eventID === selectedEvent.id ? inspectorSelection.stepIndex : null,
                (stepIndex) => selectStep(selectedEvent.id, stepIndex)
              ) : null}
            </div>
          ) : (
            <p className="muted">Selecione um evento para editar.</p>
          )}

          <div className="event-category-panel">
            <h4>Categorias</h4>
            {presentation.summary.categories.map((category) => (
              <div className="event-category-row" key={category.category}>
                <span>{category.category}</span>
                <strong>{category.count}</strong>
              </div>
            ))}
          </div>

          <div className="event-graph-details-panel">
            {selectedGraphNode?.nodeKind === "event" ? (
              <div className="event-graph-node-panel" aria-label={`Conexoes visuais de ${selectedGraphNode.eventName}`}>
                <div>
                  <strong>{selectedGraphNode.eventName}</strong>
                  <span>{visualConnectTargets.length} destinos livres</span>
                </div>
                {visualConnectTargets.length ? (
                  <div className="event-graph-targets">
                    {visualConnectTargets.slice(0, 6).map((target) => (
                      <button
                        key={`${selectedGraphNode.id}-${target.eventID}`}
                        onClick={() => completeConnection(selectedGraphNode.id, target.eventName)}
                        title={`Criar chamada para ${target.eventName}`}
                        type="button"
                      >
                        {target.eventName}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="muted">Todos os eventos disponiveis ja estao conectados.</p>
                )}
                {selectedGraphEdges.length ? (
                  <div className="event-graph-selected-edges">
                    {selectedGraphEdges.map((edge) => (
                      <button
                        key={`${selectedGraphNode.id}-${edge.id}`}
                        onClick={() => selectEdge(edge.id)}
                        title={`Selecionar chamada para ${edge.targetEventName}`}
                        type="button"
                      >
                        {`${edge.flowLabel} -> ${edge.targetEventName}`}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="event-variables-panel" aria-label="Variaveis do projeto">
              <div className="event-inspector-header">
                <div>
                  <h4>Variaveis</h4>
                  <p>{variables.length} no projeto</p>
                </div>
                {onCreateVariable ? (
                  <div className="event-actions inspector-actions">
                    <button type="button" onClick={() => onCreateVariable("variable")}>Nova variavel</button>
                    <button type="button" onClick={() => onCreateVariable("variable", "text")}>Nova variavel textual</button>
                    <button type="button" onClick={() => onCreateVariable("constant")}>Nova constante</button>
                  </div>
                ) : null}
              </div>
              {variables.length === 0 ? (
                <p className="muted">Nenhuma variavel ou constante cadastrada.</p>
              ) : (
                <ul className="event-variables-list">
                  {variables.map((entry) => (
                    <li key={`${entry.kind}-${entry.name}`}>
                      <span>{entry.name}</span>
                      <em>{entry.kind === "constant" ? "constante" : "variavel"}</em>
                      {entry.valueType === "text" ? <small>texto · até {entry.maxLength ?? 16} caracteres</small> : <small>número</small>}
                      {onRemoveVariable ? (
                        <button
                          aria-label={`Remover ${entry.kind === "constant" ? "constante" : "variavel"} ${entry.name}`}
                          className="danger-button"
                          onClick={() => onRemoveVariable(entry.name, entry.kind)}
                          type="button"
                        >
                          Remover
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {activeGraph.graphEdges.length === 0 ? (
              <p className="muted">Nenhuma chamada entre eventos.</p>
            ) : (
              presentation.graphEdges.slice(0, 8).map((edge) => {
                const targetOptions = eventGraphNodes.some((node) => node.eventName === edge.targetEventName)
                  ? eventGraphNodes
                  : [{ id: `${edge.id}-missing`, eventName: edge.targetEventName }, ...eventGraphNodes];
                return (
                  <div
                    className={[
                      "event-graph-row",
                      edge.flowKind,
                      edge.isMissingTarget ? "missing" : "",
                      selectedEdge?.id === edge.id ? "selected" : ""
                    ].filter(Boolean).join(" ")}
                    key={edge.id}
                    onClick={() => selectEdge(edge.id)}
                    role="button"
                    tabIndex={0}
                  >
                    <span>{edge.sourceEventName}</span>
                    <code>{edge.flowLabel}</code>
                    <select
                      aria-label={`Destino de ${edge.sourceEventName} ${edge.commandVerb}`}
                      onChange={(inputEvent) => {
                        inputEvent.stopPropagation();
                        onRetargetEventGraphEdge({
                          sourceEventID: edge.sourceEventID,
                          stepIndex: edge.stepIndex,
                          targetEventName: inputEvent.currentTarget.value
                        });
                        setInspectorSelection({
                          kind: "edge",
                          edgeID: `${edge.sourceEventID}-${inputEvent.currentTarget.value}-${edge.commandVerb}-${edge.stepIndex}`
                        });
                      }}
                      onClick={(inputEvent) => inputEvent.stopPropagation()}
                      value={edge.targetEventName}
                    >
                      {targetOptions.map((node) => (
                        <option key={`${edge.id}-${node.id}`} value={node.eventName}>
                          {node.eventName}
                        </option>
                      ))}
                    </select>
                    <button
                      className="event-graph-remove"
                      onClick={(buttonEvent) => {
                        buttonEvent.stopPropagation();
                        onRemoveEventGraphEdge({
                          sourceEventID: edge.sourceEventID,
                          stepIndex: edge.stepIndex
                        });
                        setInspectorSelection({ kind: "event", eventID: edge.sourceEventID });
                      }}
                      title={`Remover chamada ${edge.sourceEventName} -> ${edge.targetEventName}`}
                      type="button"
                    >
                      Remover
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </WorkspaceInspectorRail>
      </div>
      {commandMenuOpen && commandMenuEvent ? (
        <EventCommandMenu
          event={commandMenuEvent}
          suggestions={commandMenuSuggestions}
          allowRecipes={commandMenuStepIndex === null}
          stepIndex={commandMenuStepIndex}
          query={commandMenuQuery}
          tab={commandMenuTab}
          onChangeQuery={setCommandMenuQuery}
          onChangeTab={setCommandMenuTab}
          onChooseSuggestion={(suggestion) => {
            const commands = suggestion.steps?.length
              ? suggestion.steps.map((step) => step.command)
              : [suggestion.command];
            if (commandMenuStepIndex === null) {
              for (const command of commands) {
                onAddEventStep(commandMenuEvent.id, commandMenuEvent.name, command);
              }
            } else {
              onUpdateEventStep(commandMenuEvent.id, commandMenuStepIndex, { command: commands[0] ?? suggestion.command });
            }
            if (commandMenuStepIndex !== null) {
              setInspectorSelection({ kind: "step", eventID: commandMenuEvent.id, stepIndex: commandMenuStepIndex });
            }
            closeCommandMenu();
            setCommandMenuQuery("");
            setCommandMenuTab("all");
          }}
          onClose={closeCommandMenu}
        />
      ) : null}
    </section>
  );
}
