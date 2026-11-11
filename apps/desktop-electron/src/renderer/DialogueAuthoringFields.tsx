import { useId } from "react";
import { useStudioUiText } from "./studioUiText";
import type { DialogueCharacterProfile, DialogueSceneActorOption, UpdateDialogueFields } from "../shared/dialoguesWorkspace";
import type { RoomDialoguesInspectorDialogue } from "./RoomDialoguesInspector";
function uniqueValues(values: Array<string | undefined>): string[] {
  return Array.from(new Set(values.map((value) => value?.trim()).filter(Boolean) as string[]));
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

export function DialogueAuthoringFields({ dialogue: selectedDialogue, onChange: updateDialogue, actorOptions = [], assetOptions = [], sfxOptions = [], variables = [], characterProfiles = [], characterOptions = [] }: {
  dialogue: RoomDialoguesInspectorDialogue;
  onChange(fields: UpdateDialogueFields): void;
  actorOptions?: DialogueSceneActorOption[];
  assetOptions?: string[]; sfxOptions?: string[]; variables?: string[];
  characterProfiles?: DialogueCharacterProfile[]; characterOptions?: string[];
}): React.ReactElement {
  const ui = useStudioUiText();
  const characterList = `dialogue-character-${useId().replace(/:/g, "")}`;
  const characterProfile = characterProfiles.find(profile => profile.name === selectedDialogue.character);
  return <div className="dialogue-authoring-fields">          <div className="hud-authoring-actions">
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

          <label>
            <span>{ui("Personagem")}</span>
            <input
              aria-label={ui("Ator ou personagem do diálogo")}
              list={characterList}
              onChange={(event) => updateDialogue({ character: event.currentTarget.value })}
              value={selectedDialogue.character}
            />
            <datalist id={characterList}>
              {uniqueValues(characterOptions).map((character) => <option key={character} value={character} />)}
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

<details className="dialogue-presentation-options"><summary>{ui("Aparência e sons")}</summary>          <div className="room-dialogue-field-grid">
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

</details></div>;
}
