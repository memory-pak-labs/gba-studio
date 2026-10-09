import type { ImportedAnimationSequence } from "./ipc.js";
import type { GBAProjectData } from "./projectFile.js";
import { normalizeCutsceneSceneConfig } from "./sceneTypeProfiles.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneProjectData(data: GBAProjectData): GBAProjectData {
  return globalThis.structuredClone
    ? globalThis.structuredClone(data)
    : (JSON.parse(JSON.stringify(data)) as GBAProjectData);
}

function projectRooms(data: GBAProjectData): Record<string, unknown>[] {
  const source = Array.isArray(data.scenas) ? data.scenas : data.rooms;
  return Array.isArray(source) ? source.filter(isRecord) : [];
}

function roomID(room: Record<string, unknown>, index: number): string {
  return typeof room.id === "string" && room.id.trim() ? room.id : `room-${index + 1}`;
}

function sameRoom(room: Record<string, unknown>, index: number, targetRoomID: string): boolean {
  return roomID(room, index) === targetRoomID || room.name === targetRoomID;
}

function defaultCutsceneStep(id: string, durationFrames: number): Record<string, unknown> {
  return {
    autoAdvance: true,
    branchTargetSceneIndex: -1,
    branchTargetStepIndex: -1,
    branchValue: 0,
    branchVariable: -1,
    dialogueKey: "",
    durationFrames,
    eventName: "",
    id,
    onSkipEventName: "",
    skippable: true,
    targetSceneIndex: -1,
    waitForDialogue: false
  };
}

export function applyImportedAnimationToCutscene(
  data: GBAProjectData,
  targetRoomID: string,
  sequence: ImportedAnimationSequence
): GBAProjectData {
  if (!sequence.frameAssetNames.length || sequence.frameAssetNames.length !== sequence.frameDurations.length) return data;
  const next = cloneProjectData(data);
  const rooms = projectRooms(next);
  const roomIndex = rooms.findIndex((room, index) => sameRoom(room, index, targetRoomID));
  if (roomIndex < 0) return data;
  const room = rooms[roomIndex]!;
  if (room.sceneType !== "cutscene") return data;

  const runtime = isRecord(room.runtime) ? room.runtime : {};
  const runtimeConfig = isRecord(runtime.config) ? runtime.config : {};
  const normalizedConfig = normalizeCutsceneSceneConfig(runtimeConfig);
  const existingSteps = normalizedConfig.steps ?? [];
  const terminalStep = existingSteps[existingSteps.length - 1];
  const steps = sequence.frameAssetNames.map((assetName, frameIndex) => {
    const isLastFrame = frameIndex === sequence.frameAssetNames.length - 1;
    const existing = existingSteps[frameIndex] ?? (isLastFrame ? terminalStep : undefined);
    const base = existing ? { ...existing } : defaultCutsceneStep(`gif-frame-${frameIndex + 1}`, sequence.frameDurations[frameIndex]!);
    if (isLastFrame && terminalStep) {
      Object.assign(base, {
        branchTargetSceneIndex: terminalStep.branchTargetSceneIndex,
        branchTargetStepIndex: terminalStep.branchTargetStepIndex,
        branchValue: terminalStep.branchValue,
        branchVariable: terminalStep.branchVariable,
        eventName: terminalStep.eventName,
        onSkipEventName: terminalStep.onSkipEventName,
        targetSceneIndex: terminalStep.targetSceneIndex
      });
    } else if (!isLastFrame && !existing) {
      Object.assign(base, {
        branchTargetSceneIndex: -1,
        branchTargetStepIndex: -1,
        branchVariable: -1,
        eventName: "",
        onSkipEventName: "",
        targetSceneIndex: -1
      });
    }
    return {
      ...base,
      backgroundAssetName: assetName,
      durationFrames: sequence.frameDurations[frameIndex]
    };
  });

  room.backgroundAssetName = sequence.frameAssetNames[0]!;
  delete room.background;
  room.runtime = {
    type: "cutscene",
    config: normalizeCutsceneSceneConfig({
      ...normalizedConfig,
      stepDurationFrames: sequence.frameDurations[0]!,
      steps
    })
  };
  next.scenas = rooms;
  if (Array.isArray(next.rooms)) next.rooms = rooms;
  if (isRecord(next.scena) && sameRoom(next.scena, roomIndex, targetRoomID)) next.scena = cloneProjectData(room);
  delete next.room;
  return next;
}
