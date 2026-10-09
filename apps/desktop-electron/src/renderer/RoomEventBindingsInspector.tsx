import { EventEditingContext } from "./EventEditingContext";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Maximize2, Plus } from "lucide-react";

import {
  deriveContextBindingSlotStates,
  type EventsCommandMenuTab,
  type EventsWorkspaceCommandSuggestion,
  type EventsWorkspaceContextBindingCapabilityContext,
  type EventsWorkspaceGraphContextKind
} from "../shared/eventsWorkspace";
import type { ProjectReferenceOption } from "./studioUi";
import { EventCommandMenu } from "./eventsWorkspace";
import { menuActorRuntimeState, runtimeEventStates, runtimeEventValue, type RuntimeEventState, type NativeEventField } from "../shared/sceneEventStates";

export interface ContextEventBindingChangeOptions {
  updateFrequencyFrames: number | null;
}

export interface CreateContextEventBehaviorOptions {
  bindingKey: string;
  initialCommands: string[];
  targetKind: EventsWorkspaceGraphContextKind;
  targetName: string;
}

export interface RoomEventBindingsInspectorProps {
  contextKind?: EventsWorkspaceGraphContextKind;
  entity?: Record<string, unknown>;
  room?: Record<string, unknown>;
  isPlayer?: boolean;
  collisionGroup?: number;
  sceneType?: string | null;
  runtimeType?: string | null;
  ownerScene?: Record<string, unknown>;
  onUpdateRuntimeState?(bindingKey: string, field: string, value: string | number | boolean): void;
  eventOptions: ProjectReferenceOption[];
  commandSuggestions?: EventsWorkspaceCommandSuggestion[];
  onChangeBinding(bindingKey: string, eventName: string, options: ContextEventBindingChangeOptions): void;
  onChangeCollisionGroup?(group: number): void;
  onCreateEvent(initialCommands?: string[]): string | void | Promise<string | void>;
  onCreateBehavior?(options: CreateContextEventBehaviorOptions): string | void | Promise<string | void>;
  onUpdateEventFrequency?(eventName: string, frames: number): void;
  onOpenEvent?(eventName: string): void;
  focusedEventName?: string | null;
  focusedEventRequestID?: number;
  renderEventInspector?(eventName: string, triggerLabel: string): ReactNode;
}

interface BehaviorPickerSlot {
  bindingKey: string;
  label: string;
  requiresFrequency: boolean;
}

interface GroupedBindingSlot extends BehaviorPickerSlot {
  section: string | null;
  eventName: string | null;
  isMissing: boolean;
  isPending: boolean;
}

function contextTitle(contextKind: EventsWorkspaceGraphContextKind): string {
  if (contextKind === "actor") return "Eventos do ator";
  if (contextKind === "trigger") return "Eventos do trigger";
  return "Eventos da cena";
}

function defaultFrequencyForBinding(bindingKey: string, current: Record<string, number>): number {
  return current[bindingKey] ?? 30;
}

function isCreatedEventPromise(value: string | void | Promise<string | void>): value is Promise<string | void> {
  return typeof value === "object" && value !== null && "then" in value;
}

function orderedBindingSlots(
  slots: ReturnType<typeof deriveContextBindingSlotStates>,
  contextKind: EventsWorkspaceGraphContextKind
): ReturnType<typeof deriveContextBindingSlotStates> {
  if (contextKind !== "actor") return slots;
  const preferredOrder = ["onInteract", "onInit", "onUpdate"];
  return [...slots].sort((left, right) => {
    const leftIndex = preferredOrder.indexOf(left.bindingKey);
    const rightIndex = preferredOrder.indexOf(right.bindingKey);
    if (leftIndex === -1 && rightIndex === -1) return 0;
    if (leftIndex === -1) return 1;
    if (rightIndex === -1) return -1;
    return leftIndex - rightIndex;
  });
}

function collisionGroupOptions(currentGroup: number): number[] {
  const normalized = Number.isFinite(currentGroup) ? Math.max(0, Math.min(15, Math.floor(currentGroup))) : 0;
  return normalized > 3 ? [0, 1, 2, 3, normalized] : [0, 1, 2, 3];
}

function targetBindingValue(target: Record<string, unknown>, bindingKey: string): string | null {
  if (bindingKey.startsWith("runtime:/")) return runtimeEventValue(target, bindingKey);
  const bindings = target.eventBindings;
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) return null;
  const value = (bindings as Record<string, unknown>)[bindingKey];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function RoomEventBindingsInspector({
  contextKind = "room",
  entity,
  room,
  isPlayer = false,
  collisionGroup,
  sceneType,
  runtimeType,
  ownerScene,
  onUpdateRuntimeState,
  eventOptions,
  commandSuggestions = [],
  onChangeBinding,
  onChangeCollisionGroup,
  onCreateEvent,
  onCreateBehavior,
  onUpdateEventFrequency,
  onOpenEvent,
  focusedEventName,
  focusedEventRequestID,
  renderEventInspector
}: RoomEventBindingsInspectorProps): React.ReactElement {
  const sourceTarget = entity ?? room ?? {};
  const menuState = contextKind === "actor" && ownerScene ? menuActorRuntimeState(ownerScene, sourceTarget) : null;
  const target = useMemo(() => menuState ? {
    ...sourceTarget,
    eventName: "",
    eventBindings: { ...(sourceTarget.eventBindings as Record<string, unknown> ?? {}), onInteract: menuState.eventName ?? "" }
  } : sourceTarget, [sourceTarget, menuState?.eventName]);
  const resolvedCollisionGroup = typeof collisionGroup === "number"
    ? collisionGroup
    : typeof target.collisionGroup === "number"
      ? target.collisionGroup
      : 0;
  const collisionSupported = ["topdown", "platformer", "isometric", "shmup"].includes(runtimeType ?? sceneType ?? "topdown");
  const [updateFrequencyByBinding, setUpdateFrequencyByBinding] = useState<Record<string, number>>({});
  const [behaviorPickerSlot, setBehaviorPickerSlot] = useState<BehaviorPickerSlot | null>(null);
  const [behaviorPickerQuery, setBehaviorPickerQuery] = useState("");
  const [behaviorPickerTab, setBehaviorPickerTab] = useState<EventsCommandMenuTab>("all");
  const [activeBindingKey, setActiveBindingKey] = useState<string | null>(null);
  const [activeGroupBindingKey, setActiveGroupBindingKey] = useState<string | null>(null);
  const [expandedHost, setExpandedHost] = useState<HTMLElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  const appliedFocusedEventRequestID = useRef<number | null>(null);
  const capabilityContext: EventsWorkspaceContextBindingCapabilityContext = {
    actorRole: contextKind === "actor" ? (isPlayer ? "player" : "actor") : null,
    collisionGroup: resolvedCollisionGroup,
    sceneType,
    runtimeType
  };
  const slots = useMemo(
    () => deriveContextBindingSlotStates(target, contextKind, new Set(eventOptions.map((option) => option.value)), capabilityContext).map(slot => contextKind === "trigger" ? { ...slot, label: slot.bindingKey === "onEnter" ? "Ao entrar na área" : slot.bindingKey === "onLeave" ? "Ao sair da área" : slot.label } : slot),
    [capabilityContext.actorRole, capabilityContext.collisionGroup, capabilityContext.runtimeType, capabilityContext.sceneType, contextKind, eventOptions, target]
  );
  const sequenceStates = useMemo(() => contextKind === "room" ? runtimeEventStates(target).filter((state) => state.group === "Sequência") : [], [contextKind, target]);
  const orderedSlots = useMemo(() => orderedBindingSlots(slots, contextKind).filter((slot) => slot.bindingKey !== "runtime-group:Sequência"), [contextKind, slots]);
  const activeSlot = orderedSlots.find((slot) => slot.bindingKey === activeBindingKey) ?? orderedSlots[0] ?? null;
  const groupedSlots = useMemo<GroupedBindingSlot[]>(() => {
    if (!activeSlot?.groupedBindingKeys?.length) return [];
    return activeSlot.groupedBindingKeys.map((group) => {
      const eventName = targetBindingValue(target, group.bindingKey);
      return {
        bindingKey: group.bindingKey,
        label: group.label,
        section: activeSlot.section,
        requiresFrequency: false,
        eventName,
        isMissing: Boolean(eventName && !eventOptions.some((option) => option.value === eventName)),
        isPending: !eventName
      };
    });
  }, [activeSlot, eventOptions, target]);
  const activeGroupedSlot = groupedSlots.find((slot) => slot.bindingKey === activeGroupBindingKey) ?? groupedSlots[0] ?? null;
  const activeDisplaySlot = activeSlot?.groupedBindingKeys?.length
    ? activeGroupedSlot
    : activeSlot;
  const runtimeState = activeDisplaySlot?.bindingKey === "onInteract" && menuState
    ? menuState
    : runtimeEventStates(target).find((state) => state.bindingKey === activeDisplaySlot?.bindingKey);
  const hasNativeActions = Boolean(runtimeState?.actions.length);
  const showSequence = activeDisplaySlot?.bindingKey === "onInit" && sequenceStates.length > 0;
  const nativeTimeline = hasNativeActions ? <NativeStateTimeline state={runtimeState!} onUpdate={onUpdateRuntimeState} /> : null;
  const focusedEventIsBoundToTarget = Boolean(
    focusedEventName && (
      slots.some((slot) => slot.eventName === focusedEventName)
      || slots.some((slot) => slot.groupedBindingKeys?.some((group) => targetBindingValue(target, group.bindingKey) === focusedEventName))
    )
  );

  useEffect(() => { setExpandedHost(null); }, [contextKind, sourceTarget.id, sourceTarget.name]);
  useEffect(() => {
    if (!expandedHost) return;
    const layout = expandedHost.closest(".rooms-editor-layout");
    const covered = Array.from(layout?.querySelectorAll<HTMLElement>(":scope > .rooms-canvas-stage, :scope > .rooms-side-stack") ?? []);
    const previous = covered.map(element => element.hasAttribute("inert"));
    covered.forEach(element => element.setAttribute("inert", ""));
    return () => covered.forEach((element, index) => { if (!previous[index]) element.removeAttribute("inert"); });
  }, [expandedHost]);
  useEffect(() => {
    expandedHost?.querySelector<HTMLElement>('.event-authoring-states [aria-selected="true"]')?.focus();
  }, [expandedHost, activeDisplaySlot?.bindingKey]);

  function changeExpandedHost(host: HTMLElement | null): void {
    setExpandedHost(host);
    if (!host) queueMicrotask(() => expandButtonRef.current?.focus());
  }

  function selectState(bindingKey: string): void {
    const slot = orderedSlots.find(candidate => candidate.bindingKey === bindingKey
      || candidate.groupedBindingKeys?.some(group => group.bindingKey === bindingKey));
    if (!slot) return;
    setActiveBindingKey(slot.bindingKey);
    setActiveGroupBindingKey(slot.groupedBindingKeys?.length ? bindingKey : null);
  }

  useEffect(() => {
    if (!groupedSlots.length) {
      setActiveGroupBindingKey(null);
      return;
    }
    setActiveGroupBindingKey((current) => groupedSlots.some((slot) => slot.bindingKey === current)
      ? current
      : groupedSlots[0]!.bindingKey);
  }, [groupedSlots]);

  useEffect(() => {
    if (!renderEventInspector || !focusedEventName || !focusedEventRequestID) return;
    if (appliedFocusedEventRequestID.current === focusedEventRequestID) return;
    const matchingSlot = slots.find((slot) => slot.eventName === focusedEventName);
    const matchingGroupedSlot = slots.flatMap((slot) => slot.groupedBindingKeys ?? []).find((group) => targetBindingValue(target, group.bindingKey) === focusedEventName);
    appliedFocusedEventRequestID.current = focusedEventRequestID;
    if (matchingSlot) {
      setActiveBindingKey(matchingSlot.bindingKey);
      setActiveGroupBindingKey(null);
    } else if (matchingGroupedSlot) {
      const parentSlot = slots.find((slot) => slot.groupedBindingKeys?.some((group) => group.bindingKey === matchingGroupedSlot.bindingKey));
      if (parentSlot) setActiveBindingKey(parentSlot.bindingKey === "runtime-group:Sequência" ? "onInit" : parentSlot.bindingKey);
      setActiveGroupBindingKey(matchingGroupedSlot.bindingKey);
    }
  }, [focusedEventName, focusedEventRequestID, renderEventInspector, slots, target]);

  function frequencyFor(slot: { bindingKey: string }): number {
    return defaultFrequencyForBinding(slot.bindingKey, updateFrequencyByBinding);
  }

  function changeBinding(bindingKey: string, eventName: string, requiresFrequency: boolean): void {
    onChangeBinding(bindingKey, eventName, {
      updateFrequencyFrames: requiresFrequency ? frequencyFor({ bindingKey }) : null
    });
  }

  function createBehavior(slot: BehaviorPickerSlot, commands: string[]): void {
    const frequency = slot.requiresFrequency ? frequencyFor(slot) : null;
    const initialCommands = frequency === null
      ? commands
      : [`rate_limit ${frequency} 0`, ...commands, "rate_limit_end"];
    const bindCreatedEvent = (eventName: string | void): void => {
      if (!eventName) return;
      if (!onCreateBehavior) {
        changeBinding(slot.bindingKey, eventName, slot.requiresFrequency);
      }
    };
    const createdEvent = onCreateBehavior
      ? onCreateBehavior({
          bindingKey: slot.bindingKey,
          initialCommands,
          targetKind: contextKind,
          targetName: String(target.name ?? "")
        })
      : onCreateEvent(initialCommands);
    if (isCreatedEventPromise(createdEvent)) {
      void createdEvent.then(bindCreatedEvent);
      return;
    }
    bindCreatedEvent(createdEvent);
  }

  function openBehaviorPicker(slot: BehaviorPickerSlot): void {
    setBehaviorPickerSlot(slot);
    setBehaviorPickerQuery("");
    setBehaviorPickerTab("all");
  }

  const focusedEventInspector = focusedEventName && focusedEventRequestID && !focusedEventIsBoundToTarget && renderEventInspector
    ? (
      <div className="room-event-editor-shell" aria-label={`Script de ${focusedEventName}`}>
        {renderEventInspector(focusedEventName, "Evento selecionado")}
      </div>
    )
    : null;
  const activeEventInspector = focusedEventInspector ?? (activeDisplaySlot?.eventName && !activeDisplaySlot.isMissing && renderEventInspector
    ? (
      <div className="room-event-editor-shell" aria-label={`Script de ${activeDisplaySlot.label}`}>
        {renderEventInspector(activeDisplaySlot.eventName, activeDisplaySlot.label)}
      </div>
    )
    : null);

  const frequencyEditor = activeDisplaySlot?.requiresFrequency ? (
      <label className="room-event-binding-frequency">
        <span>Frequência</span>
        <select
          aria-label={`Frequência de ${activeDisplaySlot.label}`}
          onChange={(event) => {
            const frames = Number.parseInt(event.currentTarget.value, 10) || 30;
            setUpdateFrequencyByBinding((current) => ({ ...current, [activeDisplaySlot.bindingKey]: frames }));
            if (activeDisplaySlot.eventName) onUpdateEventFrequency?.(activeDisplaySlot.eventName, frames);
          }}
          value={String(frequencyFor(activeDisplaySlot))}
        >
          <option value="1">A cada quadro</option>
          <option value="15">A cada 15 quadros</option>
          <option value="30">A cada 30 quadros</option>
          <option value="60">A cada 60 quadros</option>
        </select>
      </label>
    ) : null;

  const slotEditor = activeDisplaySlot ? (
    activeEventInspector ? (
      <div className="room-event-binding-timeline" aria-label={`Timeline de ${activeDisplaySlot.label}`}>
        <EventEditingContext.Provider value={{
          name: String(target.name ?? ""),
          activeKey: activeDisplaySlot.bindingKey,
          states: orderedSlots.flatMap(slot => slot.groupedBindingKeys?.length
            ? slot.groupedBindingKeys.map(group => ({ key: group.bindingKey, label: `${slot.label} · ${group.label}` }))
            : [{ key: slot.bindingKey, label: slot.label }]),
          onSelectState: selectState,
          expandedHost, onChangeExpandedHost: changeExpandedHost
        }}>{activeEventInspector}</EventEditingContext.Provider>
      </div>
    ) : activeDisplaySlot.isPending && (hasNativeActions || showSequence) ? (
      <button className="room-event-binding-open" onClick={() => openBehaviorPicker(activeDisplaySlot)} type="button">Adicionar evento</button>
    ) : activeDisplaySlot.isPending ? (
      <div className="room-event-binding-empty" aria-label={`Fluxo vazio de ${activeDisplaySlot.label}`}>
        <strong>Este estado ainda não tem eventos.</strong>
        <p>Comece a montar a cadeia diretamente neste estado.</p>
        <button
          aria-label={`Começar script em ${activeDisplaySlot.label}`}
          onClick={() => openBehaviorPicker(activeDisplaySlot)}
          type="button"
        >
          <Plus aria-hidden="true" size={15} strokeWidth={2.4} />
          <span>Começar script</span>
        </button>
      </div>
    ) : activeDisplaySlot.isMissing ? (
      <div className="room-event-binding-empty is-warning" aria-label={`Fluxo indisponível de ${activeDisplaySlot.label}`}>
        <strong>O fluxo vinculado não está disponível.</strong>
        <p>Crie uma nova sequência de eventos para este estado.</p>
        <button
          aria-label={`Reconstruir script em ${activeDisplaySlot.label}`}
          onClick={() => openBehaviorPicker(activeDisplaySlot)}
          type="button"
        >
          <Plus aria-hidden="true" size={15} strokeWidth={2.4} />
          <span>Reconstruir fluxo</span>
        </button>
      </div>
    ) : activeDisplaySlot.eventName && onOpenEvent ? (
      <button
        className="room-event-binding-open"
        onClick={() => onOpenEvent(activeDisplaySlot.eventName!)}
        type="button"
      >
        Abrir script
      </button>
    ) : null

  ) : null;
  const nativeEditor = activeDisplaySlot ? <>
    {nativeTimeline}
    {showSequence ? <div className="room-native-event-timeline" aria-label="Timeline da sequência em Ao iniciar">
      {sequenceStates.map((state, index) => <details className="room-native-event-block" key={state.bindingKey} open={index === 0}>
        <summary>{state.label}</summary>
        <NativeStateTimeline state={state} onUpdate={onUpdateRuntimeState} />
        {state.eventName && eventOptions.some((option) => option.value === state.eventName) && renderEventInspector
          ? <div className="room-event-binding-timeline" aria-label={`Eventos de ${state.label}`}>{renderEventInspector(state.eventName, state.label)}</div>
          : state.eventName ? <span role="status">Fluxo não encontrado: {state.eventName}</span> : null}
        <button className="room-event-binding-open" type="button" onClick={() => openBehaviorPicker({ bindingKey: state.bindingKey, label: state.label, requiresFrequency: false })}>{state.eventName ? "Substituir fluxo do quadro" : "Adicionar evento ao quadro"}</button>
      </details>)}
    </div> : null}</> : null;
  const expandedEmptyState = Boolean(expandedHost && !activeEventInspector && activeDisplaySlot);

  useEffect(() => {
    if (!expandedEmptyState) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "Escape" || behaviorPickerSlot) return;
      event.preventDefault();
      changeExpandedHost(null);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expandedEmptyState, behaviorPickerSlot]);

  return (
    <div className="room-event-bindings-inspector" aria-label={`${isPlayer ? "Configuração do Player" : contextTitle(contextKind)} ${String(target.name ?? "")}`}>
      <div className="room-event-state-toolbar">
        <label className="room-event-state-picker">
          <span>Quando</span>
          <select aria-label="Estado do evento" value={activeDisplaySlot?.bindingKey ?? ""}
            disabled={!activeDisplaySlot} onChange={event => selectState(event.currentTarget.value)}>
            {orderedSlots.map(slot => slot.groupedBindingKeys?.length
              ? <optgroup key={slot.bindingKey} label={slot.label}>{slot.groupedBindingKeys.map(group =>
                  <option key={group.bindingKey} value={group.bindingKey}>{slot.label} · {group.label}</option>
                )}</optgroup>
              : <option key={slot.bindingKey} value={slot.bindingKey}>{slot.label}</option>)}
          </select>
        </label>
        <button ref={expandButtonRef} type="button" aria-label="Expandir eventos" disabled={!activeDisplaySlot}
          onClick={event => changeExpandedHost(event.currentTarget.closest(".rooms-editor-layout")?.querySelector<HTMLElement>(".rooms-event-focus-host") ?? document.body)}>
          <Maximize2 aria-hidden="true" size={15}/>Expandir
        </button>
      </div>
      {contextKind === "actor" && collisionSupported && onChangeCollisionGroup ? (
        <div className="room-event-collision-group">
          <span>Grupo de colisão</span>
          <div aria-label="Grupo de colisão" className="room-event-collision-group-options" role="radiogroup">
            {collisionGroupOptions(resolvedCollisionGroup).map((group) => (
              <button
                aria-checked={group === resolvedCollisionGroup}
                className={group === resolvedCollisionGroup ? "is-selected" : undefined}
                key={group}
                onClick={() => onChangeCollisionGroup(group)}
                role="radio"
                type="button"
              >
                {group === 0 ? "Nenhum" : group}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {isPlayer ? (
        <details className="room-event-player-guidance">
          <summary>Sobre os eventos do Player</summary>
          <p>Os estados próprios do Player ficam neste fluxo. As colisões contra ele ficam nos estados da cena.</p>
        </details>
      ) : null}
      {activeDisplaySlot ? (
        <div
          aria-label={activeDisplaySlot.label}
          className={["room-event-binding", activeDisplaySlot.isPending ? "is-pending" : "", activeDisplaySlot.isMissing ? "is-missing" : ""].filter(Boolean).join(" ")}
          id={`room-event-panel-${activeDisplaySlot.bindingKey}`}
          role="region"
          hidden={expandedEmptyState}
        >
          {!expandedEmptyState ? <>{frequencyEditor}{slotEditor}{nativeEditor}</> : null}
        </div>
      ) : null}
      {expandedEmptyState && expandedHost && activeDisplaySlot ? createPortal(
        <section aria-label={`Editor de ${activeDisplaySlot.label}`} className={`event-inspector-flow is-event-authoring is-expanded${expandedHost === document.body ? " is-standalone" : ""}`}>
          <header className="event-authoring-header">
            <button type="button" onClick={() => changeExpandedHost(null)}><ArrowLeft size={15}/>Voltar à cena</button>
            <div><small>{String(target.name ?? "")} / Eventos</small><strong>{activeDisplaySlot.label}</strong><small>{hasNativeActions || showSequence ? "Ações da cena" : "Fluxo vazio"}</small></div>
          </header>
          <div className="event-authoring-states" role="tablist" aria-label="Estados de evento expandido">
            {orderedSlots.map(slot => <button key={slot.bindingKey} type="button" role="tab" aria-selected={activeSlot?.bindingKey === slot.bindingKey} onClick={() => setActiveBindingKey(slot.bindingKey)}>{slot.label}</button>)}
          </div>
          {groupedSlots.length ? <div className="event-authoring-states" role="tablist" aria-label={`Grupos de ${activeSlot?.label}`}>
            {groupedSlots.map(slot => <button key={slot.bindingKey} type="button" role="tab" aria-selected={activeDisplaySlot.bindingKey === slot.bindingKey} onClick={() => setActiveGroupBindingKey(slot.bindingKey)}>{slot.label}</button>)}
          </div> : null}
          <div className="event-authoring-layout"><div className="event-authoring-flow">{frequencyEditor}{slotEditor}{nativeEditor}</div>
            <aside className="event-authoring-parameters"><p className="event-selected-empty">Adicione um evento para começar este fluxo. Trocar de estado mantém o editor aberto.</p></aside>
          </div>
        </section>, expandedHost
      ) : null}
      {behaviorPickerSlot ? (
        <EventCommandMenu
          allowRecipes
          contextLabel={behaviorPickerSlot.label}
          onChangeQuery={setBehaviorPickerQuery}
          onChangeTab={setBehaviorPickerTab}
          onChooseSuggestion={(suggestion) => {
            const commands = suggestion.steps?.length
              ? suggestion.steps.map((step) => step.command)
              : [suggestion.command];
            createBehavior(behaviorPickerSlot, commands);
            setBehaviorPickerSlot(null);
          }}
          onClose={() => setBehaviorPickerSlot(null)}
          query={behaviorPickerQuery}
          stepIndex={null}
          suggestions={commandSuggestions}
          tab={behaviorPickerTab}
        />
      ) : null}
    </div>
  );
}

function NativeFieldEditor({ state, field, onUpdate }: { state: RuntimeEventState; field: NativeEventField; onUpdate?: RoomEventBindingsInspectorProps["onUpdateRuntimeState"] }): React.ReactElement {
  const [draft, setDraft] = useState(String(field.value));
  useEffect(() => setDraft(String(field.value)), [field.value, state.bindingKey, field.key]);
  const isBoolean = typeof field.value === "boolean";
  const commit = (): void => {
    if (isBoolean || !onUpdate) return;
    if (typeof field.value === "number" && (!draft.trim() || !Number.isFinite(Number(draft)))) {
      setDraft(String(field.value));
      return;
    }
    const value = typeof field.value === "number" ? Number(draft) : draft;
    if (value !== field.value) onUpdate(state.bindingKey, field.key, value);
  };
  return <label className={isBoolean ? "room-native-event-checkbox" : undefined}><span>{field.label}</span><input
    aria-label={`${state.label} · ${field.label}`}
    type={isBoolean ? "checkbox" : typeof field.value === "number" ? "number" : "text"}
    checked={isBoolean ? Boolean(field.value) : undefined}
    value={isBoolean ? undefined : draft}
    disabled={!onUpdate}
    onBlur={commit}
    onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
    onChange={(event) => isBoolean ? onUpdate?.(state.bindingKey, field.key, event.currentTarget.checked) : setDraft(event.currentTarget.value)}
  /></label>;
}

function NativeStateTimeline({ state, onUpdate }: { state: RuntimeEventState; onUpdate?: RoomEventBindingsInspectorProps["onUpdateRuntimeState"] }): React.ReactElement {
  return <div className="room-native-event-timeline" aria-label={`Ações de ${state.label}`}>
    {state.actions.map((action, index) => <details className="room-native-event-block" key={`${state.bindingKey}-${index}`}>
      <summary>{action.title}</summary>
      <div className="room-native-event-fields">{action.fields.map((field) => <NativeFieldEditor key={field.key} state={state} field={field} onUpdate={onUpdate} />)}</div>
    </details>)}
  </div>;
}
