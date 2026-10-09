import type { GBAProjectData } from "../shared/projectFile";
import { resolveSceneDialogueUiSettings } from "../shared/interfaceThemes";
import { DialoguePreviewSnapshot } from "./dialoguePreviewSnapshot";
import { hudAssetURL } from "./HudSceneInspector";
import type { RoomDialoguesInspectorDialogue } from "./RoomDialoguesInspector";

export function DialogueScenePreview({ projectData, projectPath, roomId, dialogue, scale, ariaLabel = "Prévia da aparência do diálogo" }: {
  projectData: GBAProjectData;
  projectPath?: string;
  roomId?: string;
  dialogue?: RoomDialoguesInspectorDialogue | null;
  scale: number;
  ariaLabel?: string;
}): React.ReactElement {
  const settings = resolveSceneDialogueUiSettings(projectData, roomId);
  const asset = (name: string) => hudAssetURL(projectData, projectPath, name);
  const portrait = (Array.isArray(projectData.assets) ? projectData.assets : []).find(asset => asset.name === dialogue?.portrait);
  const metadata = (portrait?.metadata ?? {}) as Record<string, unknown>;
  return <div className="scene-dialogue-preview" aria-label={ariaLabel} style={{ width: 240 * scale, height: 160 * scale }}>
    <span className="scene-dialogue-preview-caption">{dialogue ? `Prévia congelada · ${dialogue.key}` : "Prévia de exemplo · não salva como fala"}</span>
    <DialoguePreviewSnapshot settings={settings} speaker={dialogue ? dialogue.character : "Personagem"}
      portraitSlot={dialogue?.portraitSlot === "right" || dialogue?.portraitSlot === "Direita" ? "Direita" : dialogue?.portraitSlot === "left" || dialogue?.portraitSlot === "Esquerda" ? "Esquerda" : settings.portraitPosition}
      text={dialogue?.text ?? "Esta é uma prévia da aparência dos diálogos."}
      choices={dialogue?.choices.map(choice => choice.label) ?? []}
      boxImageURL={asset(settings.boxImage)} selectorImageURL={asset(settings.selectorImage)} fontImageURL={asset(settings.font)}
      portraitImageURL={asset(dialogue?.portrait ?? "")} portraitFrameWidth={typeof metadata.frameWidth === "number" ? metadata.frameWidth : undefined}
      portraitFrameHeight={typeof metadata.frameHeight === "number" ? metadata.frameHeight : undefined} emoteImageURL={asset(dialogue?.emote ?? "")}
      portraitAlt="Retrato" emoteAlt="Emote" boxSource={asset(settings.boxImage)} noDialogueLabel={dialogue ? `Diálogo congelado: ${dialogue.character}, ${dialogue.text}` : "Exemplo de diálogo"}
      overflowLabel="Prévia parcial · o texto completo continua no inspetor." transparentBackground maxTextRows={3} />
  </div>;
}
