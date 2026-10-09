import type { ReactNode } from "react";
import { useState } from "react";

import {
  deriveEventStructure,
  type EventStructureInsertionTarget,
  type EventStructureNode,
  type EventStructureSequence,
  type EventStructureStep
} from "../shared/eventStructure";

export type EventBlockTone =
  | "motion"
  | "looks"
  | "sound"
  | "control"
  | "sensing"
  | "operators"
  | "data"
  | "events"
  | "system"
  | "neutral";

export function eventBlockToneForCategory(category: string): EventBlockTone {
  const normalized = category.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
  if (/movimento|camera/.test(normalized)) return "motion";
  if (/dialogo|menu|visual|cores?|hud|tela/.test(normalized)) return "looks";
  if (/audio|musica|som/.test(normalized)) return "sound";
  if (/controle|fluxo|tempo|temporizador|plataforma|puzzle|minigame/.test(normalized)) return "control";
  if (/entrada|sensores?/.test(normalized)) return "sensing";
  if (/operadores?|matematica/.test(normalized)) return "operators";
  if (/variaveis?|dados|salvar|inventario|loja|quest|recompensa/.test(normalized)) return "data";
  if (/cena|ator|luta|cutscene|hardware/.test(normalized)) return "events";
  if (category.trim()) return "system";
  return "neutral";
}

export interface EventStructureEditorProps {
  eventName: string;
  onDropBlock?(target: EventStructureInsertionTarget, command: string): void;
  onOpenCommandMenu(target: EventStructureInsertionTarget): void;
  onRemoveStep?(stepIndex: number): void;
  onSelectStep(stepIndex: number): void;
  onToggleStep?(stepIndex: number, isEnabled: boolean): void;
  renderStepEditor?(stepIndex: number): ReactNode;
  onUpdateStepParameter?(stepIndex: number, parameterID: string, value: string): void;
  activeStepIndex?: number | null;
  onToggleStepSelection?(stepIndex: number): void;
  selectedStepIndexes?: ReadonlySet<number>;
  selectionMode?: boolean;
  stepPresentations?: ReadonlyMap<number, EventStructureStepPresentation>;
  steps: EventStructureStep[];
}

export interface EventStructureStepPresentation {
  label: string;
  category: string;
  section?: string | null;
  badge?: string | null;
  tone?: EventBlockTone;
  parameters?: ReadonlyArray<{
    id: string;
    label: string;
    value: string;
    inline?: boolean;
    inputMode?: "numeric" | "text";
    options?: ReadonlyArray<string>;
  }>;
}

interface EventStructureSequenceViewProps {
  onDropBlock?(target: EventStructureInsertionTarget, command: string): void;
  onOpenCommandMenu(target: EventStructureInsertionTarget): void;
  onRemoveStep?(stepIndex: number): void;
  onSelectStep(stepIndex: number): void;
  onToggleStep?(stepIndex: number, isEnabled: boolean): void;
  renderStepEditor?(stepIndex: number): ReactNode;
  onUpdateStepParameter?(stepIndex: number, parameterID: string, value: string): void;
  activeStepIndex: number | null;
  onToggleStepSelection?(stepIndex: number): void;
  sequence: EventStructureSequence;
  selectedStepIndexes: ReadonlySet<number>;
  selectionMode: boolean;
  stepPresentations: ReadonlyMap<number, EventStructureStepPresentation>;
  target: EventStructureInsertionTarget;
}

interface EventStructureDropSlotProps {
  buttonLabel: string;
  label: string;
  onDropBlock?: (target: EventStructureInsertionTarget, command: string) => void;
  onOpenCommandMenu(target: EventStructureInsertionTarget): void;
  target: EventStructureInsertionTarget;
}

function EventStructureDropSlot({
  buttonLabel,
  label,
  onDropBlock,
  onOpenCommandMenu,
  target
}: EventStructureDropSlotProps): React.ReactElement {
  const [isDropActive, setIsDropActive] = useState(false);
  const canDrop = Boolean(onDropBlock);

  function handleDrop(event: React.DragEvent<HTMLButtonElement>): void {
    if (!onDropBlock) return;
    event.preventDefault();
    setIsDropActive(false);
    const command = (
      event.dataTransfer.getData("application/x-gba-command") ||
      event.dataTransfer.getData("text/plain")
    ).trim();
    if (command) onDropBlock(target, command);
  }

  return (
    <button
      aria-label={label}
      className={isDropActive ? "is-drop-target" : ""}
      onClick={() => onOpenCommandMenu(target)}
      onDragEnter={canDrop ? () => setIsDropActive(true) : undefined}
      onDragLeave={canDrop ? () => setIsDropActive(false) : undefined}
      onDragOver={canDrop ? (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
        setIsDropActive(true);
      } : undefined}
      onDrop={canDrop ? handleDrop : undefined}
      type="button"
    >
      {buttonLabel}
    </button>
  );
}

function EventStructureSequenceView({
  onDropBlock,
  onOpenCommandMenu,
  onRemoveStep,
  onSelectStep,
  onToggleStep,
  renderStepEditor,
  onUpdateStepParameter,
  activeStepIndex,
  onToggleStepSelection,
  sequence,
  selectedStepIndexes,
  selectionMode,
  stepPresentations,
  target
}: EventStructureSequenceViewProps): React.ReactElement {
  return (
    <ol className="event-structure-sequence">
      {sequence.children.map((node) => (
        <EventStructureNodeView
          key={`${node.kind}-${node.index}`}
          node={node}
          onDropBlock={onDropBlock}
          onOpenCommandMenu={onOpenCommandMenu}
          onRemoveStep={onRemoveStep}
          onSelectStep={onSelectStep}
          onToggleStep={onToggleStep}
          renderStepEditor={renderStepEditor}
          onUpdateStepParameter={onUpdateStepParameter}
          activeStepIndex={activeStepIndex}
          onToggleStepSelection={onToggleStepSelection}
          selectedStepIndexes={selectedStepIndexes}
          selectionMode={selectionMode}
          stepPresentations={stepPresentations}
        />
      ))}
      <li className="event-structure-add">
        <EventStructureDropSlot
          buttonLabel="Adicionar evento"
          label={target.kind === "root" ? "Adicionar evento ao fluxo principal" : `Adicionar evento em ${target.kind === "trueBranch" ? "Se sim" : "Se não"}`}
          onDropBlock={onDropBlock}
          onOpenCommandMenu={onOpenCommandMenu}
          target={target}
        />
      </li>
    </ol>
  );
}

function EventStructureNodeView({
  node,
  onDropBlock,
  onOpenCommandMenu,
  onRemoveStep,
  onSelectStep,
  onToggleStep,
  renderStepEditor,
  onUpdateStepParameter,
  activeStepIndex,
  onToggleStepSelection,
  selectedStepIndexes,
  selectionMode,
  stepPresentations
}: {
  node: EventStructureNode;
  onDropBlock?: (target: EventStructureInsertionTarget, command: string) => void;
  onOpenCommandMenu(target: EventStructureInsertionTarget): void;
  onRemoveStep?(stepIndex: number): void;
  onSelectStep(stepIndex: number): void;
  onToggleStep?(stepIndex: number, isEnabled: boolean): void;
  renderStepEditor?(stepIndex: number): ReactNode;
  onUpdateStepParameter?(stepIndex: number, parameterID: string, value: string): void;
  activeStepIndex: number | null;
  onToggleStepSelection?(stepIndex: number): void;
  selectedStepIndexes: ReadonlySet<number>;
  selectionMode: boolean;
  stepPresentations: ReadonlyMap<number, EventStructureStepPresentation>;
}): React.ReactElement {
  if (node.kind === "step") {
    const presentation = stepPresentations.get(node.index);
    const category = presentation
      ? [presentation.category, presentation.section].filter(Boolean).join(" · ")
      : null;
    const parameters = presentation?.parameters ?? [];
    const inlineParameters = parameters.filter((parameter) => parameter.inline);
    const summaryParameters = parameters.filter((parameter) => !parameter.inline);
    const isSelected = activeStepIndex === node.index;
    return (
      <li className={["event-structure-step", `tone-${presentation?.tone ?? "neutral"}`, selectionMode ? "is-selecting" : "", node.step.isEnabled ? "" : "is-disabled"].filter(Boolean).join(" ")}>
        {selectionMode ? (
          <input
            aria-label={`Selecionar passo ${node.index + 1}`}
            checked={selectedStepIndexes.has(node.index)}
            onChange={() => onToggleStepSelection?.(node.index)}
            type="checkbox"
          />
        ) : null}
        <div className="event-structure-step-card">
          <button
            aria-label={`Passo ${node.index + 1}: ${presentation?.label ?? node.step.command}`}
            className="event-structure-step-main"
            onClick={() => onSelectStep(node.index)}
            aria-pressed={isSelected}
            title={node.step.command}
            type="button"
          >
            <span aria-hidden="true">{node.index + 1}</span>
            <span className="event-structure-step-content">
              {presentation ? (
                <>
                  <strong>{presentation.label}</strong>
                  {category ? <small>{category}</small> : null}
                  {presentation.badge || parameters.length ? (
                    <span className="event-structure-step-meta">
                      {presentation.badge && presentation.badge !== "OK ROM" ? <em>{presentation.badge}</em> : null}
                      {summaryParameters.slice(0, 3).map((parameter) => (
                        <span key={`${node.index}-${parameter.id}`}>{parameter.label}: {parameter.value || "-"}</span>
                      ))}
                      {summaryParameters.length > 3 ? <span>+{summaryParameters.length - 3}</span> : null}
                    </span>
                  ) : null}
                </>
              ) : <code>{node.step.command}</code>}
            </span>
          </button>
          {isSelected && renderStepEditor ? renderStepEditor(node.index) : null}
          {isSelected && !renderStepEditor && inlineParameters.length ? (
            <div
              role="region"
              className="event-structure-inline-editor"
              aria-label={`Parâmetros do evento ${node.index + 1}`}
            >
              <div className="event-structure-inline-fields">
                {inlineParameters.map((parameter) => {
                  const options = parameter.options ?? [];
                  const hasCurrentOption = options.includes(parameter.value);
                  return (
                    <label key={`${node.index}-${parameter.id}`}>
                      <span>{parameter.label}</span>
                      {options.length && !options.some(option => option.startsWith("const(")) ? (
                        <select
                          aria-label={`${parameter.label} do evento ${node.index + 1}`}
                          onChange={(event) => onUpdateStepParameter?.(node.index, parameter.id, event.currentTarget.value)}
                          onClick={(event) => event.stopPropagation()}
                          value={parameter.value}
                        >
                          {hasCurrentOption ? null : <option value={parameter.value}>{parameter.value || "Valor atual"}</option>}
                          {options.map((option) => <option key={`${node.index}-${parameter.id}-${option}`} value={option}>{option}</option>)}
                        </select>
                      ) : (
                        <><input
                          list={options.length ? `constant-inline-${node.index}-${parameter.id}` : undefined}
                          aria-label={`${parameter.label} do evento ${node.index + 1}`}
                          inputMode={parameter.inputMode ?? "text"}
                          onChange={(event) => onUpdateStepParameter?.(node.index, parameter.id, event.currentTarget.value)}
                          onClick={(event) => event.stopPropagation()}
                          type="text"
                          value={parameter.value}
                        /><datalist id={`constant-inline-${node.index}-${parameter.id}`}>{options.map(option => <option key={option} value={option}/>)}</datalist></>
                      )}
                    </label>
                  );
                })}
              </div>
              <div className="event-structure-inline-actions">
                {onToggleStep ? (
                  <label>
                    <input
                      aria-label={`Executar evento ${node.index + 1}`}
                      checked={node.step.isEnabled}
                      onChange={(event) => onToggleStep(node.index, event.currentTarget.checked)}
                      type="checkbox"
                    />
                    <span>Executar</span>
                  </label>
                ) : null}
                {onRemoveStep ? (
                  <button onClick={() => onRemoveStep(node.index)} type="button">Remover</button>
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </li>
    );
  }

  if (node.kind === "rateLimit") {
    return (
      <li className="event-structure-rate-limit">
        <section aria-label={`Camada a cada ${node.frames} quadros`}>
          <header>
            <strong>A cada {node.frames} quadros</strong>
            <button aria-label={`Editar frequência do passo ${node.index + 1}`} onClick={() => onSelectStep(node.index)} type="button">
              Editar
            </button>
          </header>
          {activeStepIndex === node.index && renderStepEditor ? renderStepEditor(node.index) : null}
          <EventStructureSequenceView
            onDropBlock={onDropBlock}
            onOpenCommandMenu={onOpenCommandMenu}
            onRemoveStep={onRemoveStep}
            onSelectStep={onSelectStep}
            onToggleStep={onToggleStep}
            renderStepEditor={renderStepEditor}
            onUpdateStepParameter={onUpdateStepParameter}
            activeStepIndex={activeStepIndex}
            onToggleStepSelection={onToggleStepSelection}
            sequence={node.body}
            selectedStepIndexes={selectedStepIndexes}
            selectionMode={selectionMode}
            stepPresentations={stepPresentations}
            target={{ kind: "root" }}
          />
        </section>
      </li>
    );
  }

  const trueTarget: EventStructureInsertionTarget = { kind: "trueBranch", conditionIndex: node.index };
  const falseTarget: EventStructureInsertionTarget = { kind: "falseBranch", conditionIndex: node.index };
  const conditionPresentation = stepPresentations.get(node.index);
  const conditionCategory = conditionPresentation
    ? [conditionPresentation.category, conditionPresentation.section].filter(Boolean).join(" · ")
    : null;
  return (
    <li className={["event-structure-condition", `tone-${conditionPresentation?.tone ?? "control"}`].join(" ")}>
      <section aria-label={`Condição do passo ${node.index + 1}`}>
        <header>
          <strong>Se</strong>
          <button aria-label={`Editar condição do passo ${node.index + 1}`} aria-pressed={activeStepIndex === node.index} onClick={() => onSelectStep(node.index)} type="button">
            {conditionPresentation ? (
              <span className="event-structure-condition-content">
                <strong>{conditionPresentation.label}</strong>
                {conditionCategory ? <small>{conditionCategory}</small> : null}
              </span>
            ) : <code>{node.command}</code>}
          </button>
        </header>
        {activeStepIndex === node.index && renderStepEditor ? renderStepEditor(node.index) : null}
        <details open role="region" aria-label={`Se sim do passo ${node.index + 1}`} className="event-structure-branch event-structure-branch-true">
          <summary>Se sim</summary>
          <EventStructureSequenceView
            onDropBlock={onDropBlock}
            onOpenCommandMenu={onOpenCommandMenu}
            onRemoveStep={onRemoveStep}
            onSelectStep={onSelectStep}
            onToggleStep={onToggleStep}
            renderStepEditor={renderStepEditor}
            onUpdateStepParameter={onUpdateStepParameter}
            activeStepIndex={activeStepIndex}
            onToggleStepSelection={onToggleStepSelection}
            sequence={node.trueBranch}
            selectedStepIndexes={selectedStepIndexes}
            selectionMode={selectionMode}
            stepPresentations={stepPresentations}
            target={trueTarget}
          />
        </details>
        <details open role="region" aria-label={`Se não do passo ${node.index + 1}`} className="event-structure-branch event-structure-branch-false">
          <summary>Se não</summary>
          {node.falseBranch ? (
            <EventStructureSequenceView
                onDropBlock={onDropBlock}
                onOpenCommandMenu={onOpenCommandMenu}
                onRemoveStep={onRemoveStep}
                onSelectStep={onSelectStep}
                onToggleStep={onToggleStep}
                renderStepEditor={renderStepEditor}
                onUpdateStepParameter={onUpdateStepParameter}
                activeStepIndex={activeStepIndex}
                onToggleStepSelection={onToggleStepSelection}
                sequence={node.falseBranch}
                selectedStepIndexes={selectedStepIndexes}
                selectionMode={selectionMode}
                stepPresentations={stepPresentations}
                target={falseTarget}
            />
          ) : (
            <EventStructureDropSlot
              buttonLabel="Adicionar caminho não"
              label="Adicionar evento em Se não"
              onDropBlock={onDropBlock}
              onOpenCommandMenu={onOpenCommandMenu}
              target={falseTarget}
            />
          )}
        </details>
      </section>
    </li>
  );
}

export function EventStructureEditor({
  eventName,
  onDropBlock,
  onRemoveStep,
  onOpenCommandMenu,
  onSelectStep,
  onToggleStep,
  renderStepEditor,
  onUpdateStepParameter,
  activeStepIndex = null,
  onToggleStepSelection,
  selectedStepIndexes = new Set<number>(),
  selectionMode = false,
  stepPresentations = new Map<number, EventStructureStepPresentation>(),
  steps
}: EventStructureEditorProps): React.ReactElement {
  const structure = deriveEventStructure(steps);
  return (
    <section aria-label={`Estrutura do script ${eventName}`} className="event-structure-editor">
      <header>
        <strong>Eventos do script</strong>
        <span>Arraste eventos para montar a sequência do comportamento.</span>
      </header>
      <EventStructureSequenceView
        onDropBlock={onDropBlock}
        onOpenCommandMenu={onOpenCommandMenu}
        onRemoveStep={onRemoveStep}
        onSelectStep={onSelectStep}
        onToggleStep={onToggleStep}
        renderStepEditor={renderStepEditor}
        onUpdateStepParameter={onUpdateStepParameter}
        activeStepIndex={activeStepIndex}
        onToggleStepSelection={onToggleStepSelection}
        sequence={structure.root}
        selectedStepIndexes={selectedStepIndexes}
        selectionMode={selectionMode}
        stepPresentations={stepPresentations}
        target={{ kind: "root" }}
      />
      {structure.diagnostics.length ? (
        <ul aria-label="Diagnósticos da estrutura" className="event-structure-diagnostics">
          {structure.diagnostics.map((diagnostic) => <li key={`${diagnostic.index}-${diagnostic.message}`}>Passo {diagnostic.index + 1}: {diagnostic.message}</li>)}
        </ul>
      ) : null}
    </section>
  );
}
