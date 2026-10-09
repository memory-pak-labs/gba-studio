import { deriveDialoguesForScene, type DialogueSceneUsage } from "../shared/dialoguesWorkspace";
import type { GBAProjectData } from "../shared/projectFile";

export function dialogueDisplayTitle(key: string, scene?: { name: string; title: string }): string {
  const frame = key.match(/^(.*?)[_-]frame[_-](\d+)$/i);
  if (frame && scene?.name === frame[1]) return `${scene.title.split(/[·—]/)[0].trim()} · ${frame[2]}`;
  const name = key.replace(/[_-]frame[_-](\d+)$/i, " · $1").replace(/[_-]+/g, " ");
  return name.charAt(0).toLocaleUpperCase() + name.slice(1);
}
export function dialogueReviewScenes(data?: GBAProjectData): Array<{ id: string; name: string; title: string; background: string; record: Record<string, unknown>; usages: Map<string, DialogueSceneUsage[]> }> {
  if (!data) return [];
  const rooms = Array.isArray(data.scenas) ? data.scenas : [];
  return rooms.filter(room => typeof room === "object" && room !== null).map(room => {
    const record = room as Record<string, unknown>;
    const name = String(record.name ?? "");
    const id = String(record.id ?? name);
    return { id, name, title: String(record.displayName ?? name), record,
      background: typeof record.backgroundAssetName === "string" ? record.backgroundAssetName : "",
      usages: new Map(deriveDialoguesForScene(data, { id, name }).references.map(reference => [reference.key, reference.usages])) };
  });
}
export function dialogueReviewBackground(scene: ReturnType<typeof dialogueReviewScenes>[number] | undefined, key: string): string {
  if (!scene) return "";
  const runtime = scene.record.runtime as { config?: { steps?: Array<{ dialogueKey?: string; backgroundAssetName?: string }> } } | undefined;
  const step = runtime?.config?.steps?.find(step => step.dialogueKey === key);
  return step?.backgroundAssetName || scene.background;
}
