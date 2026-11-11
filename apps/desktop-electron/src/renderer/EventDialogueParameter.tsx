import { useState } from "react";
import { deriveDialoguesWorkspacePresentation, type UpdateDialogueFields } from "../shared/dialoguesWorkspace";
import type { DialogueEventTarget } from "../shared/dialogueAuthoring";
import type { GBAProjectData } from "../shared/projectFile";
import type { EventsWorkspaceCommandParameter } from "../shared/eventsWorkspace";
import { ProjectReferencePicker } from "./studioUi";
import { DialogueAuthoringFields } from "./DialogueAuthoringFields";
import { DialogueScenePreview } from "./DialogueScenePreview";
import { useStudioUiText } from "./studioUiText";

export function EventDialogueParameter({ parameter, projectData, projectPath, target, onChange, onCreate, onUpdate }: {
  parameter: EventsWorkspaceCommandParameter; projectData: GBAProjectData; projectPath?: string; target: DialogueEventTarget;
  onChange(value: string): void; onCreate?(target: DialogueEventTarget): Promise<string | null>;
  onUpdate?(key: string, fields: UpdateDialogueFields): void;
}): React.ReactElement {
  const ui = useStudioUiText();
  const [editing, setEditing] = useState(false);
  const dialogues = deriveDialoguesWorkspacePresentation(projectData).dialogues;
  const selected = dialogues.find(item => item.key === parameter.value);
  return <div className="event-dialogue-parameter">
    <span>{ui(parameter.label)}</span>
    <ProjectReferencePicker ariaLabel={ui("{0} do evento", { 0: ui(parameter.label) })} value={parameter.value}
      options={dialogues.filter(item => parameter.kind !== "choiceDialogue" || item.choices.length > 0).map(item => ({ value: item.key, label: item.key, detail: `${item.character} · ${item.text}`, keywords: [item.character, item.text] }))}
      emptyLabel={ui("Selecione uma fala")} onChange={onChange} />
    <div className="hud-authoring-actions">
      {onCreate ? <button type="button" onClick={() => void onCreate({ ...target, ...(parameter.kind === "choiceDialogue" ? { requiresChoices: true } : {}) })}>{ui("Criar fala")}</button> : null}
      {selected && onUpdate ? <button type="button" aria-expanded={editing} onClick={() => setEditing(value => !value)}>{ui(editing ? "Fechar edição da fala" : "Editar fala")}</button> : null}
    </div>
    {selected ? <p className="dialogue-scope-notice">{ui("Fala compartilhada · {0} uso(s). Alterações afetam todos os usos.", { 0: selected.usages.length })}</p> : <p className="muted">{ui("Escolha uma fala ou crie uma para completar este evento.")}</p>}
    {selected && !editing ? <p className="event-dialogue-excerpt">{selected.text}</p> : null}
    {selected && editing ? <div className="event-dialogue-editor">
      <DialogueAuthoringFields dialogue={selected} onChange={fields => onUpdate?.(selected.key, fields)}
        assetOptions={(Array.isArray(projectData.assets) ? projectData.assets : []).filter(item => item.kind === "Portrait" || item.kind === "Emote").map(item => String(item.name))}
        sfxOptions={(Array.isArray(projectData.assets) ? projectData.assets : []).filter(item => item.kind === "SFX").map(item => String(item.name))} />
      <DialogueScenePreview projectData={projectData} projectPath={projectPath} dialogue={selected} scale={1} />
    </div> : null}
  </div>;
}
