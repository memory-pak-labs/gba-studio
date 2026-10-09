import type { GBAProjectData } from "./projectFile.js";
import { deriveDialoguesForScene, type DialoguesForScenePresentation, type DialogueSceneUsage } from "./dialoguesWorkspace.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";

/** Resolve from project data: the review workspace does not load the room presentation. */
export function dialogueEditorScene(data: GBAProjectData, key: string, sceneID?: string): { id: string; name: string } | null {
  const rooms = deriveRoomsWorkspacePresentation(data).rooms;
  const used = rooms.filter(room => deriveDialoguesForScene(data, room).dialogues.some(item => item.key === key));
  return used.find(room => room.id === sceneID) ?? used.find(room => room.isActive) ?? used[0] ?? rooms.find(room => room.isActive) ?? rooms[0] ?? null;
}

/** Player is an actor instance too; match identity or event provenance, never display names. */
export function dialogueSelectionScope(
  scene: DialoguesForScenePresentation | null,
  entities: Array<{ id: string; kind: "actor" | "trigger" }>
) {
  const matches = (usages: DialogueSceneUsage[]) => usages.some(usage => entities.some(entity =>
    usage.sourceKind === entity.kind && usage.sourceID === entity.id));
  return {
    dialogues: (scene?.dialogues ?? []).filter(dialogue => !entities.length || matches(dialogue.sceneUsages)
      || entities.some(entity => entity.kind === "actor" && entity.id === dialogue.actorId)),
    missing: (scene?.missing ?? []).filter(reference => !entities.length || matches(reference.usages))
  };
}
