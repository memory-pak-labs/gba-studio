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
  const values = uniqueValues([currentValue, ...options]);
  return (
    <select aria-label={ariaLabel} onChange={(event) => onChange(event.currentTarget.value)} value={currentValue}>
      <option value="">Nenhum</option>
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
    <div className="room-dialogues-inspector" aria-label="Diálogos usados nesta cena">
      <div className="room-dialogues-header">
        <div>
          <span className="room-dialogues-title-line"><strong>{selectionName ? `Diálogos · ${selectionName}` : "Diálogos da cena"}</strong><InspectorInfoTip label="Diálogos da cena">A prévia mostra até três linhas, apenas nesta aba. Ela não executa eventos.</InspectorInfoTip></span>
          <small>{dialogues.length} usado{dialogues.length === 1 ? "" : "s"}</small>
        </div>
        {onOpenDialoguesWorkspace ? (
          <button
            aria-label="Abrir workspace Diálogos"
            className="room-dialogues-workspace-link"
            onClick={() => onOpenDialoguesWorkspace(selectedDialogue?.key)}
            title="Abrir workspace Diálogos"
            type="button"
          >
            <ExternalLink aria-hidden="true" size={14} strokeWidth={2.2} />
            <span>Revisão e tradução</span>
          </button>
        ) : null}
      </div>

      {appearance ? <div className="hud-authoring-tabs" role="tablist" aria-label="Edição dos diálogos"><button role="tab" aria-selected={mode === "speech"} onClick={() => setMode("speech")}>Fala</button><button role="tab" aria-selected={mode === "appearance"} onClick={() => setMode("appearance")}>Aparência</button></div> : null}
      {mode === "appearance" ? appearance : <>
      <div className="hud-authoring-actions">
        {onCreateDialogue ? <button type="button" onClick={() => void create()}>Nova fala</button> : null}
        <button type="button" aria-pressed={previewSpeech} onClick={() => setPreviewSpeech(value => !value)}>Prévia na cena</button>
        {onImportAssets ? <button type="button" onClick={() => void onImportAssets()}>Importar assets</button> : null}
      </div>
      {catalog.length ? <details className="dialogue-project-library"><summary>Falas do projeto · {catalog.length}</summary>
        <label>Buscar fala<input type="search" value={libraryQuery} onChange={event => setLibraryQuery(event.currentTarget.value)} /></label>
        <div className="room-dialogues-list">{catalog.filter(item => `${item.key} ${item.character} ${item.text}`.toLocaleLowerCase().includes(libraryQuery.toLocaleLowerCase())).map(item => <button type="button" key={item.key} aria-pressed={selectedDialogue?.key === item.key} onClick={() => setSelectedKey(item.key)}>{item.key} · {item.character}</button>)}</div>
      </details> : null}
      <ul className="room-dialogues-list" aria-label="Diálogos usados nesta cena">
        {dialogues.length ? dialogues.map((dialogue) => (
          <li key={dialogue.key}>
            <button
              aria-pressed={selectedDialogue?.key === dialogue.key}
              aria-label={`Selecionar diálogo ${dialogue.key}`}
              className={selectedDialogue?.key === dialogue.key ? "room-dialogue-row active" : "room-dialogue-row"}
              onClick={() => setSelectedKey(dialogue.key)}
              type="button"
            >
              <ChevronRight aria-hidden="true" size={14} strokeWidth={2.2} />
              <span>
                <strong>{dialogue.key}</strong>
                <small>{dialogue.character}{dialogue.text ? ` · ${dialogue.text.slice(0, 48)}${dialogue.text.length > 48 ? "…" : ""}` : ""}</small>
              </span>
              {dialogue.warnings?.length ? <em>{dialogue.warnings.length} alerta{dialogue.warnings.length === 1 ? "" : "s"}</em> : null}
            </button>
          </li>
        )) : (
          <li className="room-dialogues-empty">{selectionName ? "Nenhum diálogo ligado à seleção." : "Nenhum diálogo usado nesta cena."}</li>
        )}
      </ul>

      {missingDialogueKeys.length > 0 ? (
        <section className="room-dialogues-missing" aria-label="Referências de diálogo ausentes">
          <strong>Referências ausentes</strong>
          <p>Estas chaves estão vinculadas à cena, mas não existem no catálogo:</p>
          <ul>{missingDialogueKeys.map((key) => <li key={key}>{key}</li>)}</ul>
          <p>Crie a fala com a chave ausente ou corrija a referência no evento da cena.</p>

        </section>
      ) : null}

      {selectedDialogue ? (
        <section className="room-dialogue-editor" aria-label={`Editar diálogo ${selectedDialogue.key}`}>
          <div className="room-dialogue-editor-heading">
            <div>
              <strong>Editar diálogo</strong>
              <small>{selectedDialogue.key}</small>
            </div>
            <span>{selectedDialogue.sceneUsages?.map(usageLabel).filter((value, index, values) => values.indexOf(value) === index).join(" · ") || "Referência da cena"}</span>
          </div>

          {!dialogues.some(item => item.key === selectedDialogue.key) ? <p className="hud-scope-notice">{selectionName ? "Fala do catálogo · fora desta seleção." : "Fala do catálogo · não usada nesta cena."} Para executá-la, adicione uma ação Mostrar diálogo aos eventos da cena ou de um ator.</p> : null}
          {(sceneUsageNames[selectedDialogue.key]?.length ?? 0) > 1 ? <p className="hud-scope-notice">Fala compartilhada · alterações afetam: {sceneUsageNames[selectedDialogue.key].join(", ")}. Duplique para criar uma fala independente e escolha a nova chave no evento.</p> : null}
          <div className="hud-authoring-actions">
            {onDuplicateDialogue ? <button type="button" onClick={async () => { const key = await onDuplicateDialogue(selectedDialogue.key); if (key) setSelectedKey(key); }}>Duplicar fala</button> : null}
            {onNormalizeDialogue ? <button type="button" onClick={() => onNormalizeDialogue(selectedDialogue.key)}>Normalizar texto</button> : null}
            {onRemoveDialogue ? <button type="button" onClick={() => onRemoveDialogue(selectedDialogue.key)}>Remover fala</button> : null}
          </div>
          <label>
            <span>Personagem</span>
            <input
              aria-label="Ator ou personagem do diálogo"
              list="room-dialogue-character-options"
              onChange={(event) => updateDialogue({ character: event.currentTarget.value })}
              value={selectedDialogue.character}
            />
            <datalist id="room-dialogue-character-options">
              {uniqueValues(dialogues.map((dialogue) => dialogue.character)).map((character) => <option key={character} value={character} />)}
            </datalist>
          </label>

          {characterProfile ? <button type="button" onClick={() => updateDialogue({ portrait: characterProfile.portrait, emote: characterProfile.emote, textSound: characterProfile.textSound, confirmSound: characterProfile.confirmSound })}>Aplicar padrões de {characterProfile.name}</button> : null}
          <label>
            <span>Fonte da fala</span>
            <select
              aria-label="Ator da cena do diálogo"
              onChange={(event) => updateDialogue({ actorId: event.currentTarget.value })}
              value={selectedDialogue.actorId ?? ""}
            >
              <option value="">Personagem / sem ator</option>
              {selectedDialogue.actorId && !actorOptions.some((actor) => actor.id === selectedDialogue.actorId) ? (
                <option value={selectedDialogue.actorId}>Ator não encontrado · {selectedDialogue.actorId}</option>
              ) : null}
              {actorOptions.map((actor) => <option key={actor.id} value={actor.id}>Ator · {actor.name}</option>)}
            </select>
            <small className={selectedDialogue.actorBindingStatus === "missing" ? "room-dialogue-actor-status is-missing" : "room-dialogue-actor-status"}>
              {selectedDialogue.actorBindingStatus === "resolved"
                ? `Instância vinculada: ${selectedDialogue.actorName || selectedDialogue.actorId}`
                : selectedDialogue.actorBindingStatus === "missing"
                  ? "O ator vinculado não pertence a esta cena."
                  : "A fala não depende de uma instância física da cena."}
            </small>
          </label>

          <div className="room-dialogue-field-grid">
            <label>
              <span>Retrato</span>
              <DialogueAssetSelect
                ariaLabel="Retrato do diálogo"
                currentValue={selectedDialogue.portrait ?? ""}
                onChange={(portrait) => updateDialogue({ portrait })}
                options={assetOptions}
              />
            </label>
            <label>
              <span>Posição do retrato</span>
              <select
                aria-label="Posição do retrato"
                onChange={(event) => updateDialogue({ portraitSlot: event.currentTarget.value })}
                value={selectedDialogue.portraitSlot ?? ""}
              >
                <option value="">Padrão</option>
                <option value="left">Esquerda</option>
                <option value="right">Direita</option>
              </select>
            </label>
            <label>
              <span>Emote</span>
              <DialogueAssetSelect
                ariaLabel="Emote do diálogo"
                currentValue={selectedDialogue.emote ?? ""}
                onChange={(emote) => updateDialogue({ emote })}
                options={assetOptions}
              />
            </label>
            <label>
              <span>Som do texto</span>
              <DialogueAssetSelect
                ariaLabel="Som do texto"
                currentValue={selectedDialogue.textSound ?? ""}
                onChange={(textSound) => updateDialogue({ textSound })}
                options={sfxOptions}
              />
            </label>
            <label>
              <span>Som de confirmação</span>
              <DialogueAssetSelect
                ariaLabel="Som de confirmação"
                currentValue={selectedDialogue.confirmSound ?? ""}
                onChange={(confirmSound) => updateDialogue({ confirmSound })}
                options={sfxOptions}
              />
            </label>
          </div>

          <div className="hud-authoring-actions">
            <select aria-label="Inserir variável no diálogo" value="" onChange={event => { if (event.currentTarget.value) updateDialogue({ text: `${selectedDialogue.text}{${event.currentTarget.value}}` }); }}><option value="">Inserir variável…</option>{variables.map(name => <option key={name} value={name}>{name}</option>)}</select>
            <button type="button" onClick={() => updateDialogue({ text: `${selectedDialogue.text}{pause:30}` })}>Inserir pausa</button>
            <button type="button" onClick={() => updateDialogue({ text: `${selectedDialogue.text}{color:accent}` })}>Inserir cor</button>
          </div>
          <label className="room-dialogue-text-field">
            <span>Texto da fala</span>
            <textarea
              aria-label="Texto do diálogo"
              onChange={(event) => updateDialogue({ text: event.currentTarget.value })}
              rows={5}
              value={selectedDialogue.text}
            />
          </label>

          <label className="room-dialogue-text-field">
            <span>Escolhas <small>(uma por linha)</small></span>
            <textarea
              aria-label="Escolhas do diálogo"
              onChange={(event) => updateDialogue({ choices: event.currentTarget.value.split("\n") })}
              rows={3}
              value={selectedDialogue.choices.map((choice) => choice.label).join("\n")}
            />
          </label>

          {usages[selectedDialogue.key]?.length ? <details><summary>Eventos e destinos das escolhas</summary>{usages[selectedDialogue.key].map((usage, index) => <button type="button" key={index} onClick={() => onOpenDialogueEvent?.(usage.targetEventName ?? usage.eventName)}>{usage.targetEventName ?? usage.eventName} · {usage.command}</button>)}</details> : null}
          {selectedDialogue.warnings?.some(warning => /nao encontrado/.test(warning)) ? <button type="button" onClick={() => updateDialogue({ ...(selectedDialogue.warnings?.includes("Retrato nao encontrado") ? { portrait: "" } : {}), ...(selectedDialogue.warnings?.includes("Emote nao encontrado") ? { emote: "" } : {}), ...(selectedDialogue.warnings?.includes("Som de texto nao encontrado") ? { textSound: "" } : {}), ...(selectedDialogue.warnings?.includes("Som de confirmar nao encontrado") ? { confirmSound: "" } : {}) })}>Limpar referências inválidas</button> : null}
          {selectedDialogue.warnings?.length ? <p className="room-dialogue-warning" role="alert">{selectedDialogue.warnings.join(" · ")}</p> : null}
          <p className="room-dialogue-translation-note">Revisão e tradução em lote ficam no workspace Diálogos.</p>
        </section>
      ) : null}
      </>}
    </div>
  );
}
