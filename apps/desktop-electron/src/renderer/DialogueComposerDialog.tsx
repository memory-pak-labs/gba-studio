import { useRef, useState } from "react";
import { useModalFocus } from "./useModalFocus";
import { useStudioUiText } from "./studioUiText";
import { DialogueAuthoringFields } from "./DialogueAuthoringFields";
import { DialogueScenePreview } from "./DialogueScenePreview";
import { nextDialogueKey, type AuthoredDialogue } from "../shared/dialogueAuthoring";
import type { GBAProjectData } from "../shared/projectFile";

export function DialogueComposerDialog({ projectData, projectPath, onSave, onCancel }: {
  projectData: GBAProjectData; projectPath?: string;
  onSave(fields: AuthoredDialogue): void; onCancel(): void;
}): React.ReactElement {
  const ui = useStudioUiText();
  const [draft, setDraft] = useState<AuthoredDialogue>(() => ({ key: nextDialogueKey(projectData), character: "Narrador", text: "", choices: [] }));
  const [error, setError] = useState("");
  const surface = useRef<HTMLElement>(null), initial = useRef<HTMLHeadingElement>(null);
  useModalFocus(surface, initial);
  const dialogue = { ...draft, character: draft.character ?? "", choices: (draft.choices ?? []).map(label => ({ label })) };
  return <div className="modal-backdrop studio-dialog-backdrop">
    <section ref={surface} className="modal-card studio-dialog-card dialogue-composer-dialog" role="dialog" aria-modal="true" aria-labelledby="dialogue-composer-title" tabIndex={-1}
      onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}>
      <h2 ref={initial} tabIndex={-1} id="dialogue-composer-title">{ui("Criar fala")}</h2>
      <p className="muted">{ui("Escreva a fala. Você poderá reutilizá-la em outros eventos.")}</p>
      <div className="dialogue-composer-body">
        <DialogueAuthoringFields dialogue={dialogue} onChange={fields => setDraft(current => ({ ...current, ...fields }))}
          assetOptions={(Array.isArray(projectData.assets) ? projectData.assets : []).filter(item => item.kind === "Portrait" || item.kind === "Emote").map(item => String(item.name))}
          sfxOptions={(Array.isArray(projectData.assets) ? projectData.assets : []).filter(item => item.kind === "SFX").map(item => String(item.name))} />
        <DialogueScenePreview projectData={projectData} projectPath={projectPath} dialogue={dialogue} scale={1.25} />
      </div>
      <details><summary>{ui("Identificação")}</summary><label>{ui("Chave do diálogo")}<input aria-label={ui("Chave do diálogo")} value={draft.key} onChange={event => setDraft(current => ({ ...current, key: event.currentTarget.value }))} /></label></details>
      {error ? <p role="alert" className="field-validation-error">{ui(error)}</p> : null}
      <footer className="studio-dialog-actions"><button type="button" onClick={onCancel}>{ui("Cancelar")}</button><button type="button" className="primary-button" onClick={() => { try { onSave(draft); } catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); } }}>{ui("Criar fala")}</button></footer>
    </section>
  </div>;
}
