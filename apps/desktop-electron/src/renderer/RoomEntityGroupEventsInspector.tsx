import { useMemo, useState } from "react";
import { Plus, UsersRound } from "lucide-react";

import { resolveEventBindingCapabilities } from "../shared/eventBindingCapabilities";
import type {
  BindEventToTargetOptions,
  EventsCommandMenuTab,
  EventsWorkspaceCommandSuggestion,
  EventsWorkspaceGraphContextKind
} from "../shared/eventsWorkspace";
import type { EventBindingCapability } from "../shared/eventBindingCapabilities";
import { EventCommandMenu } from "./eventsWorkspace";

export interface RoomEntityGroupEventTarget {
  id: string;
  kind: Exclude<EventsWorkspaceGraphContextKind, "room">;
  name: string;
}

export interface RoomEntityGroupEventsInspectorProps {
  entities: RoomEntityGroupEventTarget[];
  commandSuggestions?: EventsWorkspaceCommandSuggestion[];
  onCreateBehaviors(options: { initialCommands: string[]; targets: BindEventToTargetOptions[] }): string[];
  runtimeType?: string | null;
  sceneType?: string | null;
}

function entityKindLabel(kind: RoomEntityGroupEventTarget["kind"], count: number): string {
  if (kind === "actor") return count === 1 ? "ator" : "atores";
  return count === 1 ? "trigger" : "triggers";
}

export function RoomEntityGroupEventsInspector({
  entities,
  commandSuggestions = [],
  onCreateBehaviors,
  runtimeType,
  sceneType
}: RoomEntityGroupEventsInspectorProps): React.ReactElement | null {
  const [frequencyByBinding, setFrequencyByBinding] = useState<Record<string, number>>({});
  const [createdCount, setCreatedCount] = useState<number | null>(null);
  const [behaviorPickerCapability, setBehaviorPickerCapability] = useState<EventBindingCapability | null>(null);
  const [behaviorPickerQuery, setBehaviorPickerQuery] = useState("");
  const [behaviorPickerTab, setBehaviorPickerTab] = useState<EventsCommandMenuTab>("all");
  const entityKind = entities.every((entity) => entity.kind === "actor")
    ? "actor"
    : entities.every((entity) => entity.kind === "trigger")
      ? "trigger"
      : null;
  const capabilities = useMemo(
    () => entityKind ? resolveEventBindingCapabilities({ targetKind: entityKind, runtimeType, sceneType }) : [],
    [entityKind, runtimeType, sceneType]
  );

  if (!entityKind || entities.length < 2) return null;

  const kindLabel = entityKindLabel(entityKind, entities.length);
  const title = `Grupo de ${entities.length} ${kindLabel}`;

  function openBehaviorPicker(capability: EventBindingCapability): void {
    setBehaviorPickerCapability(capability);
    setBehaviorPickerQuery("");
    setBehaviorPickerTab("all");
  }

  function createBehaviors(capability: EventBindingCapability, commands: string[]): void {
    const frequency = frequencyByBinding[capability.bindingKey] ?? 30;
    const initialCommands = capability.requiresFrequency
      ? [`rate_limit ${frequency} 0`, ...commands, "rate_limit_end"]
      : commands;
    const eventNames = onCreateBehaviors({
      initialCommands,
      targets: entities.map((entity) => ({
        bindingKey: capability.bindingKey,
        targetKind: entity.kind,
        targetName: entity.name
      }))
    });
    setCreatedCount(eventNames.length);
  }

  return (
    <section aria-label={title} className="room-entity-group-events-inspector">
      <header>
        <UsersRound aria-hidden="true" size={16} strokeWidth={2.3} />
        <div>
          <strong>{title}</strong>
          <p>{entities.map((entity) => entity.name).join(", ")}</p>
        </div>
      </header>
      <p className="muted">Cada item recebe uma cópia independente do comportamento, para você poder ajustá-los depois sem afetar o grupo.</p>
      <ul>
        {capabilities.map((capability) => {
          const frequency = frequencyByBinding[capability.bindingKey] ?? 30;
          return (
            <li key={capability.bindingKey}>
              <span>{capability.label}</span>
              {capability.requiresFrequency ? (
                <label>
                  <span>Frequência</span>
                  <select
                    aria-label={`Frequência do grupo em ${capability.label}`}
                    onChange={(event) => setFrequencyByBinding((current) => ({
                      ...current,
                      [capability.bindingKey]: Number.parseInt(event.currentTarget.value, 10) || 30
                    }))}
                    value={String(frequency)}
                  >
                    <option value="1">A cada quadro</option>
                    <option value="15">A cada 15 quadros</option>
                    <option value="30">A cada 30 quadros</option>
                    <option value="60">A cada 60 quadros</option>
                  </select>
                </label>
              ) : null}
              <button
                aria-label={`Adicionar comportamento em grupo em ${capability.label}`}
                onClick={() => openBehaviorPicker(capability)}
                type="button"
              >
                <Plus aria-hidden="true" size={15} strokeWidth={2.4} />
                <span>Adicionar comportamento</span>
              </button>
            </li>
          );
        })}
      </ul>
      {behaviorPickerCapability ? (
        <EventCommandMenu
          allowRecipes
          contextLabel={`o grupo em ${behaviorPickerCapability.label}`}
          onChangeQuery={setBehaviorPickerQuery}
          onChangeTab={setBehaviorPickerTab}
          onChooseSuggestion={(suggestion) => {
            const commands = suggestion.steps?.length
              ? suggestion.steps.map((step) => step.command)
              : [suggestion.command];
            createBehaviors(behaviorPickerCapability, commands);
            setBehaviorPickerCapability(null);
          }}
          onClose={() => setBehaviorPickerCapability(null)}
          query={behaviorPickerQuery}
          stepIndex={null}
          suggestions={commandSuggestions}
          tab={behaviorPickerTab}
        />
      ) : null}
      {createdCount !== null ? (
        <p role="status">{createdCount} comportamento{createdCount === 1 ? "" : "s"} independente{createdCount === 1 ? "" : "s"} criado{createdCount === 1 ? "" : "s"}.</p>
      ) : null}
    </section>
  );
}
