import { uiText as ui, useStudioUiText } from "./studioUiText";
import { ChevronRight, ExternalLink } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { InspectorInfoTip } from "./InspectorControls";

import type {
  DialogueActorBindingStatus,
  DialogueCharacterProfile,
  DialogueSceneActorOption,
  DialogueSceneUsage,
  UpdateDialogueFields
} from "../shared/dialoguesWorkspace";

export interface RoomDialoguesInspectorDialogue {
  key: string;
  character: string;
  actorId?: string;
  actorName?: string;
  actorBindingStatus?: DialogueActorBindingStatus;
  portrait?: string;
  portraitSlot?: string;
  emote?: string;
  textSound?: string;
  confirmSound?: string;
  text: string;
  choices: Array<{ label: string }>;
  sceneUsages?: DialogueSceneUsage[];
  warnings?: string[];
}

export interface RoomDialoguesInspectorProps {
  selectionName?: string;
  dialogues: RoomDialoguesInspectorDialogue[];
  catalog?: RoomDialoguesInspectorDialogue[];
  focusedDialogueKey?: string | null;
  focusRequestID?: number | null;
  variables?: string[];
  onCreateDialogue?(): Promise<string | null>;
  onDuplicateDialogue?(key: string): Promise<string | null>;
  onRemoveDialogue?(key: string): void;
  onNormalizeDialogue?(key: string): void;
  onImportAssets?(): void | Promise<void>;
  onOpenDialogueEvent?(name: string): void;
  usages?: Record<string, Array<{ eventName: string; command: string; targetEventName?: string }>>;
  sceneUsageNames?: Record<string, string[]>;
  characterProfiles?: DialogueCharacterProfile[];

  appearance?: ReactNode;
  onPreviewChange?(key: string | null): void;
  actorOptions?: DialogueSceneActorOption[];
  missingDialogueKeys?: string[];
  assetOptions?: string[];
  sfxOptions?: string[];
  onUpdateDialogue?(key: string, fields: UpdateDialogueFields): void;
  onOpenDialoguesWorkspace?(key?: string): void;
}

function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
}

function usageLabel(usage: DialogueSceneUsage): string {
  if (usage.sourceKind === "actor") return `Ator · ${usage.sourceName}`;
  if (usage.sourceKind === "trigger") return `Trigger · ${usage.sourceName}`;
  if (usage.sourceKind === "event") return `Evento · ${usage.sourceName}`;
  return "Referência direta da cena";
}

function DialogueAssetSelect({
  ariaLabel,
  currentValue,
  options,
  onChange
}: {
  ariaLabel: string;
  currentValue: string;
  options: string[];
  onChange(value: string): void;
}): React.ReactElement {
  const ui = useStudioUiText();
  const values = uniqueValues([currentValue, ...options]);
  return (
    <select aria-label={ui(ariaLabel)} onChange={(event) => onChange(event.currentTarget.value)} value={currentValue}>
      <option value="">{ui("Nenhum")}</option>
      {values.map((value) => <option key={value} value={value}>{value}</option>)}
    </select>
  );
}

export function RoomDialoguesInspector({
  selectionName,
  actorOptions = [],
  appearance,
  onPreviewChange,
  dialogues,
  catalog = [], focusedDialogueKey, focusRequestID, variables = [],
  onCreateDialogue, onDuplicateDialogue, onRemoveDialogue, onNormalizeDialogue, onImportAssets, onOpenDialogueEvent,
  usages = {}, sceneUsageNames = {}, characterProfiles = [],
  missingDialogueKeys = [],
  assetOptions = [],
  sfxOptions = [],
  onUpdateDialogue,
  onOpenDialoguesWorkspace
}: RoomDialoguesInspectorProps): React.ReactElement {
  const ui = useStudioUiText();
  const [mode, setMode] = useState<"speech" | "appearance">("speech");
  const [selectedKey, setSelectedKey] = useState(dialogues[0]?.key ?? "");
  const allDialogues = [...dialogues, ...catalog.filter(item => !dialogues.some(local => local.key === item.key))];
  const selectedDialogue = allDialogues.find((dialogue) => dialogue.key === selectedKey) ?? dialogues[0] ?? null;
  const characterProfile = characterProfiles.find(profile => profile.name === selectedDialogue?.character);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [previewSpeech, setPreviewSpeech] = useState(true);
  useEffect(() => { if (focusedDialogueKey) { setSelectedKey(focusedDialogueKey); setMode("speech"); } }, [focusedDialogueKey, focusRequestID]);
  const create = async () => { const key = await onCreateDialogue?.(); if (key) { setSelectedKey(key); setMode("speech"); } };


  useEffect(() => { onPreviewChange?.(mode === "appearance" ? selectedDialogue?.key ?? "__sample__" : previewSpeech ? selectedDialogue?.key ?? null : null); }, [mode, previewSpeech, selectedDialogue?.key, onPreviewChange]);
  useEffect(() => () => onPreviewChange?.(null), [onPreviewChange]);

  const updateDialogue = (fields: UpdateDialogueFields): void => {
    if (selectedDialogue) onUpdateDialogue?.(selectedDialogue.key, fields);
  };

  return (
    <div className="room-dialogues-inspector" aria-label={ui("Diálogos usados nesta cena")}>
      <div className="room-dialogues-header">
        <div>
          <span className="room-dialogues-title-line"><strong>{selectionName ? ui("Diálogos · {0}", { 0: selectionName }) : ui("Diálogos da cena")}</strong><InspectorInfoTip label={ui("Diálogos da cena")}>{ui("A prévia mostra até três linhas, apenas nesta aba. Ela não executa eventos.")}</InspectorInfoTip></span>
          <small>{dialogues.length} {ui(" usado")}{dialogues.length === 1 ? "" : "s"}</small>
        </div>
        {onOpenDialoguesWorkspace ? (
          <button
            aria-label={ui("Abrir workspace Diálogos")}
            className="room-dialogues-workspace-link"
            onClick={() => onOpenDialoguesWorkspace(selectedDialogue?.key)}
            title={ui("Abrir workspace Diálogos")}
            type="button"
          >
            <ExternalLink aria-hidden="true" size={14} strokeWidth={2.2} />
            <span>{ui("Revisão e tradução")}</span>
          </button>
        ) : null}
      </div>

      {appearance ? <div className="hud-authoring-tabs" role="tablist" aria-label={ui("Edição dos diálogos")}><button role="tab" aria-selected={mode === "speech"} onClick={() => setMode("speech")}>{ui("Fala")}</button><button role="tab" aria-selected={mode === "appearance"} onClick={() => setMode("appearance")}>{ui("Aparência")}</button></div> : null}
      {mode === "appearance" ? appearance : <>
      <div className="hud-authoring-actions">
        {onCreateDialogue ? <button type="button" onClick={() => void create()}>{ui("Nova fala")}</button> : null}
        <button type="button" aria-pressed={previewSpeech} onClick={() => setPreviewSpeech(value => !value)}>{ui("Prévia na cena")}</button>
        {onImportAssets ? <button type="button" onClick={() => void onImportAssets()}>{ui("Importar assets")}</button> : null}
      </div>
      {catalog.length ? <details className="dialogue-project-library"><summary>{ui("Falas do projeto · ")}{catalog.length}</summary>
        <label>{ui("Buscar fala")}<input type="search" value={libraryQuery} onChange={event => setLibraryQuery(event.currentTarget.value)} /></label>
        <div className="room-dialogues-list">{catalog.filter(item => `${item.key} ${item.character} ${item.text}`.toLocaleLowerCase().includes(libraryQuery.toLocaleLowerCase())).map(item => <button type="button" key={item.key} aria-pressed={selectedDialogue?.key === item.key} onClick={() => setSelectedKey(item.key)}>{item.key} · {item.character}</button>)}</div>
      </details> : null}
      <ul className="room-dialogues-list" aria-label={ui("Diálogos usados nesta cena")}>
        {dialogues.length ? dialogues.map((dialogue) => (
          <li key={dialogue.key}>
            <button
              aria-pressed={selectedDialogue?.key === dialogue.key}
              aria-label={ui("Selecionar diálogo {0}", { 0: dialogue.key })}
              className={selectedDialogue?.key === dialogue.key ? "room-dialogue-row active" : "room-dialogue-row"}
              onClick={() => setSelectedKey(dialogue.key)}
              type="button"
            >
              <ChevronRight aria-hidden="true" size={14} strokeWidth={2.2} />
              <span>
                <strong>{dialogue.key}</strong>
                <small>{dialogue.character}{dialogue.text ? ` · ${dialogue.text.slice(0, 48)}${dialogue.text.length > 48 ? "…" : ""}` : ""}</small>
              </span>
              {dialogue.warnings?.length ? <em>{dialogue.warnings.length} {ui(" alerta")}{dialogue.warnings.length === 1 ? "" : "s"}</em> : null}
            </button>
          </li>
        )) : (
          <li className="room-dialogues-empty">{selectionName ? ui("Nenhum diálogo ligado à seleção.") : ui("Nenhum diálogo usado nesta cena.")}</li>
        )}
      </ul>

      {missingDialogueKeys.length > 0 ? (
        <section className="room-dialogues-missing" aria-label={ui("Referências de diálogo ausentes")}>
          <strong>{ui("Referências ausentes")}</strong>
          <p>{ui("Estas chaves estão vinculadas à cena, mas não existem no catálogo:")}</p>
          <ul>{missingDialogueKeys.map((key) => <li key={key}>{key}</li>)}</ul>
          <p>{ui("Crie a fala com a chave ausente ou corrija a referência no evento da cena.")}</p>

        </section>
      ) : null}

      {selectedDialogue ? (
        <section className="room-dialogue-editor" aria-label={ui("Editar diálogo {0}", { 0: selectedDialogue.key })}>
          <div className="room-dialogue-editor-heading">
            <div>
              <strong>{ui("Editar diálogo")}</strong>
              <small>{selectedDialogue.key}</small>
            </div>
            <span>{selectedDialogue.sceneUsages?.map(usageLabel).filter((value, index, values) => values.indexOf(value) === index).join(" · ") || ui("Referência da cena")}</span>
          </div>

          {!dialogues.some(item => item.key === selectedDialogue.key) ? <p className="hud-scope-notice">{selectionName ? ui("Fala do catálogo · fora desta seleção.") : ui("Fala do catálogo · não usada nesta cena.")} {ui(" Para executá-la, adicione uma ação Mostrar diálogo aos eventos da cena ou de um ator.")}</p> : null}
          {(sceneUsageNames[selectedDialogue.key]?.length ?? 0) > 1 ? <p className="hud-scope-notice">{ui("Fala compartilhada · alterações afetam: ")}{sceneUsageNames[selectedDialogue.key].join(", ")}{ui(". Duplique para criar uma fala independente e escolha a nova chave no evento.")}</p> : null}
          <div className="hud-authoring-actions">
            {onDuplicateDialogue ? <button type="button" onClick={async () => { const key = await onDuplicateDialogue(selectedDialogue.key); if (key) setSelectedKey(key); }}>{ui("Duplicar fala")}</button> : null}
            {onNormalizeDialogue ? <button type="button" onClick={() => onNormalizeDialogue(selectedDialogue.key)}>{ui("Normalizar texto")}</button> : null}
            {onRemoveDialogue ? <button type="button" onClick={() => onRemoveDialogue(selectedDialogue.key)}>{ui("Remover fala")}</button> : null}
          </div>
          <label>
            <span>{ui("Personagem")}</span>
            <input
              aria-label={ui("Ator ou personagem do diálogo")}
              list="room-dialogue-character-options"
              onChange={(event) => updateDialogue({ character: event.currentTarget.value })}
              value={selectedDialogue.character}
            />
            <datalist id="room-dialogue-character-options">
              {uniqueValues(dialogues.map((dialogue) => dialogue.character)).map((character) => <option key={character} value={character} />)}
            </datalist>
          </label>

          {characterProfile ? <button type="button" onClick={() => updateDialogue({ portrait: characterProfile.portrait, emote: characterProfile.emote, textSound: characterProfile.textSound, confirmSound: characterProfile.confirmSound })}>{ui("Aplicar padrões de ")}{characterProfile.name}</button> : null}
          <label>
            <span>{ui("Fonte da fala")}</span>
            <select
              aria-label={ui("Ator da cena do diálogo")}
              onChange={(event) => updateDialogue({ actorId: event.currentTarget.value })}
              value={selectedDialogue.actorId ?? ""}
            >
              <option value="">{ui("Personagem / sem ator")}</option>
              {selectedDialogue.actorId && !actorOptions.some((actor) => actor.id === selectedDialogue.actorId) ? (
                <option value={selectedDialogue.actorId}>{ui("Ator não encontrado · ")}{selectedDialogue.actorId}</option>
              ) : null}
              {actorOptions.map((actor) => <option key={actor.id} value={actor.id}>{ui("Ator · ")}{actor.name}</option>)}
            </select>
            <small className={selectedDialogue.actorBindingStatus === "missing" ? "room-dialogue-actor-status is-missing" : "room-dialogue-actor-status"}>
              {selectedDialogue.actorBindingStatus === "resolved"
                ? ui("Instância vinculada: {0}", { 0: selectedDialogue.actorName || selectedDialogue.actorId })
                : selectedDialogue.actorBindingStatus === "missing"
                  ? ui("O ator vinculado não pertence a esta cena.")
                  : ui("A fala não depende de uma instância física da cena.")}
            </small>
          </label>

          <div className="room-dialogue-field-grid">
            <label>
              <span>{ui("Retrato")}</span>
              <DialogueAssetSelect
                ariaLabel={ui("Retrato do diálogo")}
                currentValue={selectedDialogue.portrait ?? ""}
                onChange={(portrait) => updateDialogue({ portrait })}
                options={assetOptions}
              />
            </label>
            <label>
              <span>{ui("Posição do retrato")}</span>
              <select
                aria-label={ui("Posição do retrato")}
                onChange={(event) => updateDialogue({ portraitSlot: event.currentTarget.value })}
                value={selectedDialogue.portraitSlot ?? ""}
              >
                <option value="">{ui("Padrão")}</option>
                <option value="left">{ui("Esquerda")}</option>
                <option value="right">{ui("Direita")}</option>
              </select>
            </label>
            <label>
              <span>{ui("Emote")}</span>
              <DialogueAssetSelect
                ariaLabel={ui("Emote do diálogo")}
                currentValue={selectedDialogue.emote ?? ""}
                onChange={(emote) => updateDialogue({ emote })}
                options={assetOptions}
              />
            </label>
            <label>
              <span>{ui("Som do texto")}</span>
              <DialogueAssetSelect
                ariaLabel={ui("Som do texto")}
                currentValue={selectedDialogue.textSound ?? ""}
                onChange={(textSound) => updateDialogue({ textSound })}
                options={sfxOptions}
              />
            </label>
            <label>
              <span>{ui("Som de confirmação")}</span>
              <DialogueAssetSelect
                ariaLabel={ui("Som de confirmação")}
                currentValue={selectedDialogue.confirmSound ?? ""}
                onChange={(confirmSound) => updateDialogue({ confirmSound })}
                options={sfxOptions}
              />
            </label>
          </div>

          <div className="hud-authoring-actions">
            <select aria-label={ui("Inserir variável no diálogo")} value="" onChange={event => { if (event.currentTarget.value) updateDialogue({ text: `${selectedDialogue.text}{${event.currentTarget.value}}` }); }}><option value="">{ui("Inserir variável…")}</option>{variables.map(name => <option key={name} value={name}>{name}</option>)}</select>
            <button type="button" onClick={() => updateDialogue({ text: `${selectedDialogue.text}{pause:30}` })}>{ui("Inserir pausa")}</button>
            <button type="button" onClick={() => updateDialogue({ text: `${selectedDialogue.text}{color:accent}` })}>{ui("Inserir cor")}</button>
          </div>
          <label className="room-dialogue-text-field">
            <span>{ui("Texto da fala")}</span>
            <textarea
              aria-label={ui("Texto do diálogo")}
              onChange={(event) => updateDialogue({ text: event.currentTarget.value })}
              rows={5}
              value={selectedDialogue.text}
            />
          </label>

          <label className="room-dialogue-text-field">
            <span>{ui("Escolhas ")}<small>{ui("(uma por linha)")}</small></span>
            <textarea
              aria-label={ui("Escolhas do diálogo")}
              onChange={(event) => updateDialogue({ choices: event.currentTarget.value.split("\n") })}
              rows={3}
              value={selectedDialogue.choices.map((choice) => choice.label).join("\n")}
            />
          </label>

          {usages[selectedDialogue.key]?.length ? <details><summary>{ui("Eventos e destinos das escolhas")}</summary>{usages[selectedDialogue.key].map((usage, index) => <button type="button" key={index} onClick={() => onOpenDialogueEvent?.(usage.targetEventName ?? usage.eventName)}>{usage.targetEventName ?? usage.eventName} · {usage.command}</button>)}</details> : null}
          {selectedDialogue.warnings?.some(warning => /nao encontrado/.test(warning)) ? <button type="button" onClick={() => updateDialogue({ ...(selectedDialogue.warnings?.includes("Retrato nao encontrado") ? { portrait: "" } : {}), ...(selectedDialogue.warnings?.includes("Emote nao encontrado") ? { emote: "" } : {}), ...(selectedDialogue.warnings?.includes("Som de texto nao encontrado") ? { textSound: "" } : {}), ...(selectedDialogue.warnings?.includes("Som de confirmar nao encontrado") ? { confirmSound: "" } : {}) })}>{ui("Limpar referências inválidas")}</button> : null}
          {selectedDialogue.warnings?.length ? <p className="room-dialogue-warning" role="alert">{selectedDialogue.warnings.map(warning => ui(warning)).join(" · ")}</p> : null}
          <p className="room-dialogue-translation-note">{ui("Revisão e tradução em lote ficam no workspace Diálogos.")}</p>
        </section>
      ) : null}
      </>}
    </div>
  );
}
