import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { buildFunctionalP0Project } from "./functionalP0Project.js";
import {
  createPreviewRuntime,
  dispatchPreviewRuntimeAction,
  syncPreviewRuntimeProject,
  type PreviewRuntimeState
} from "./previewRuntime.js";
import { setRoomCollisionCellInProject } from "./roomsWorkspace.js";

function writeEvidenceIfRequested(evidence: Record<string, unknown>): void {
  const outputPath = process.env.GBA_STUDIO_PREVIEW_RUNTIME_REAL_PROJECT_EVIDENCE;
  if (!outputPath) return;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function closeDialogue(state: PreviewRuntimeState): PreviewRuntimeState {
  return state.activeDialogue ? dispatchPreviewRuntimeAction(state, "action") : state;
}

function repeatAction(state: PreviewRuntimeState, action: "left" | "right" | "up" | "down", count: number): PreviewRuntimeState {
  let next = state;
  for (let index = 0; index < count; index += 1) {
    next = dispatchPreviewRuntimeAction(next, action);
  }
  return next;
}

describe("Preview Runtime real-project smoke", () => {
  it("proves movement, collision, dialogue, audio, trigger room change, debug and live sync", () => {
    const project = buildFunctionalP0Project();
    const boot = createPreviewRuntime(project);

    expect(boot.ready).toBe(true);
    expect(boot.currentRoom?.name).toBe("cena_1");
    expect(boot.activeDialogue).toMatchObject({ key: "intro_001" });
    expect(boot.activeMusic).toBe("intro_theme.mod");
    expect(boot.activeSfx).toBe("confirm.wav");
    expect(boot.eventLog.filter((entry) => entry.result === "audio").map((entry) => entry.command)).toEqual([
      "play_music intro_theme.mod",
      "play_sfx confirm.wav"
    ]);

    const playable = closeDialogue(boot);
    const moved = dispatchPreviewRuntimeAction(playable, "right");
    expect(moved.player).toMatchObject({ x: 16, y: 10 });

    const debugToggled = dispatchPreviewRuntimeAction(moved, "debug");
    expect(debugToggled.debug.visible).toBe(false);

    const collisionCellIndex = 10 * 30 + 17;
    const collisionProject = setRoomCollisionCellInProject(project, "room-1", collisionCellIndex, true);
    const synced = closeDialogue(syncPreviewRuntimeProject(moved, collisionProject));
    const blocked = dispatchPreviewRuntimeAction(synced, "right");
    expect(blocked.player).toMatchObject({ x: 16, y: 10 });
    expect(blocked.currentRoom?.collisionCells[collisionCellIndex]).toBe(true);

    const pathToDoor = repeatAction(playable, "right", 13);
    expect(pathToDoor.currentRoom?.name).toBe("room_2");
    expect(pathToDoor.eventLog.at(-1)).toMatchObject({
      command: "change_scene room_2",
      result: "room"
    });
    expect(pathToDoor.triggers).toEqual([]);

    writeEvidenceIfRequested({
      ok: true,
      generatedAt: new Date().toISOString(),
      movementVerified: true,
      collisionVerified: true,
      dialogueVerified: true,
      audioVerified: true,
      triggerRoomChangeVerified: true,
      debugVerified: true,
      liveSyncVerified: true,
      coveredFlow: [
        "movement",
        "collision",
        "dialogue",
        "audio",
        "trigger-room-change",
        "debug-overlay",
        "live-sync",
        "multi-room"
      ],
      preview: {
        bootRoom: boot.currentRoom?.name,
        movedPlayer: moved.player ? { x: moved.player.x, y: moved.player.y } : null,
        collisionCellIndex,
        roomAfterTrigger: pathToDoor.currentRoom?.name,
        eventLogCount: pathToDoor.eventLog.length
      }
    });
  });
});
