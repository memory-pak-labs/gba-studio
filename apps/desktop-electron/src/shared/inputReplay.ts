export interface InputReplayFrame {
  held: string[];
  pressed: string[];
}

export interface InputReplayCheckpoint {
  room?: string;
  variables?: Record<string, boolean | number | string>;
  inventory?: Record<string, number>;
}

export interface InputReplayRun {
  frame: InputReplayFrame;
  frames: number;
}

export interface InputReplay {
  schema: 1;
  id: string;
  seed: number;
  initialSaveSlot: number | null;
  initialVariables: Record<string, boolean | number | string>;
  initialInventory: Record<string, number>;
  runs: InputReplayRun[];
  checkpoints: Record<number, InputReplayCheckpoint>;
  frameCount: number;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function frameFromUnknown(value: unknown): InputReplayFrame {
  if (!isObject(value)) return { held: [], pressed: [] };
  return {
    held: stringArray(value.held),
    pressed: stringArray(value.pressed)
  };
}

export function isInputReplay(value: unknown): value is InputReplay {
  if (!isObject(value)) return false;
  if (value.schema !== 1 || typeof value.id !== "string") return false;
  if (!Number.isInteger(Number(value.seed)) || Number(value.seed) < 0) return false;
  const frameCount = value.frameCount;
  if (!isNumber(frameCount) || frameCount < 0) return false;
  const runs = value.runs;
  if (!Array.isArray(runs)) return false;
  if (!runs.every((run) => isObject(run) && isNumber(run.frames) && run.frames > 0 && isObject(run.frame))) return false;
  return true;
}

function normalizeReplayRuns(value: unknown): Array<{ frames: number; frame: InputReplayFrame }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((run) => {
      if (!isObject(run)) return null;
      const frames = Number(run.frames);
      if (!Number.isFinite(frames) || frames <= 0) return null;
      return {
        frame: frameFromUnknown(run.frame),
        frames: Math.max(1, Math.floor(frames))
      };
    })
    .filter((run): run is { frames: number; frame: InputReplayFrame } => run !== null);
}

export function normalizeInputReplay(value: unknown): InputReplay | null {
  if (!isObject(value)) return null;
  if (value.schema !== 1 || typeof value.id !== "string") return null;
  const seed = Number(value.seed);
  if (!Number.isFinite(seed) || seed < 0) return null;
  const runFrames = normalizeReplayRuns(value.runs);
  const checkpointEntries = isObject(value.checkpoints) ? value.checkpoints : {};
  const checkpoints = Object.create(null) as Record<number, InputReplayCheckpoint>;
  for (const [key, checkpoint] of Object.entries(checkpointEntries)) {
    const frameIndex = Number.parseInt(key, 10);
    if (Number.isNaN(frameIndex) || frameIndex < 0) continue;
    if (!isObject(checkpoint)) continue;
    checkpoints[frameIndex] = {
      room: typeof checkpoint.room === "string" ? checkpoint.room : undefined,
      variables: isObject(checkpoint.variables) ? { ...checkpoint.variables as Record<string, unknown> } as Record<string, boolean | number | string> : undefined,
      inventory: isObject(checkpoint.inventory) ? { ...checkpoint.inventory as Record<string, unknown> } as Record<string, number> : undefined
    };
  }

  return {
    schema: 1,
    id: String(value.id),
    seed: Math.max(0, Math.floor(seed)),
    initialSaveSlot: value.initialSaveSlot === null
      ? null
      : Number.isFinite(Number(value.initialSaveSlot))
        ? Math.floor(Number(value.initialSaveSlot))
        : null,
    initialVariables: isObject(value.initialVariables) ? { ...value.initialVariables as Record<string, boolean | number | string> } : {},
    initialInventory: isObject(value.initialInventory) ? { ...value.initialInventory as Record<string, number> } : {},
    runs: runFrames,
    checkpoints,
    frameCount: Math.max(0, Math.floor(Number(value.frameCount) || 0))
  };
}

const gbaInputBits: Array<[number, string]> = [
  [1, "A"],
  [2, "B"],
  [4, "SELECT"],
  [8, "START"],
  [16, "RIGHT"],
  [32, "LEFT"],
  [64, "UP"],
  [128, "DOWN"],
  [256, "R"],
  [512, "L"]
];

export function inputFrameFromBitmasks(heldBits: number, pressedBits: number): InputReplayFrame {
  return {
    held: gbaInputBits.filter(([bit]) => (heldBits & bit) !== 0).map(([, name]) => name).sort(),
    pressed: gbaInputBits.filter(([bit]) => (pressedBits & bit) !== 0).map(([, name]) => name).sort()
  };
}

export function createInputReplay(options: {
  id: string;
  seed: number;
  initialSaveSlot?: number | null;
  initialVariables?: Record<string, boolean | number | string>;
  initialInventory?: Record<string, number>;
}): InputReplay {
  return {
    schema: 1,
    id: options.id,
    seed: options.seed,
    initialSaveSlot: options.initialSaveSlot ?? null,
    initialVariables: structuredClone(options.initialVariables ?? {}),
    initialInventory: structuredClone(options.initialInventory ?? {}),
    runs: [],
    checkpoints: {},
    frameCount: 0
  };
}

function normalizedFrame(frame: InputReplayFrame): InputReplayFrame {
  return {
    held: [...new Set(frame.held)].sort(),
    pressed: [...new Set(frame.pressed)].sort()
  };
}

function framesEqual(left: InputReplayFrame, right: InputReplayFrame): boolean {
  return left.held.join("\0") === right.held.join("\0") && left.pressed.join("\0") === right.pressed.join("\0");
}

export function appendInputReplayFrame(
  replay: InputReplay,
  input: InputReplayFrame,
  checkpoint?: InputReplayCheckpoint
): InputReplay {
  const frame = normalizedFrame(input);
  const runs = structuredClone(replay.runs);
  const previous = runs.at(-1);
  if (previous && framesEqual(previous.frame, frame)) previous.frames += 1;
  else runs.push({ frame, frames: 1 });
  const checkpoints = { ...replay.checkpoints };
  if (checkpoint) checkpoints[replay.frameCount] = structuredClone(checkpoint);
  return { ...replay, runs, checkpoints, frameCount: replay.frameCount + 1 };
}

export function inputReplayFrameAt(replay: InputReplay, frameIndex: number): InputReplayFrame | null {
  if (!Number.isInteger(frameIndex) || frameIndex < 0 || frameIndex >= replay.frameCount) return null;
  let offset = 0;
  for (const run of replay.runs) {
    if (frameIndex < offset + run.frames) return structuredClone(run.frame);
    offset += run.frames;
  }
  return null;
}

export function inputReplayStartRoom(replay: InputReplay): string | undefined {
  return Object.entries(replay.checkpoints)
    .map(([frameIndex, checkpoint]) => ({
      checkpoint,
      frameIndex: Number(frameIndex)
    }))
    .filter(({ checkpoint, frameIndex }) => (
      Number.isFinite(frameIndex) &&
      typeof checkpoint.room === "string" &&
      checkpoint.room.trim().length > 0
    ))
    .sort((left, right) => left.frameIndex - right.frameIndex)[0]
    ?.checkpoint.room
    ?.trim();
}

export function verifyInputReplayCheckpoint(
  replay: InputReplay,
  frameIndex: number,
  actual: InputReplayCheckpoint
): { ok: boolean; differences: string[] } {
  const expected = replay.checkpoints[frameIndex];
  if (!expected) return { ok: false, differences: [`Checkpoint ausente no frame ${frameIndex}.`] };
  const differences: string[] = [];
  if (expected.room !== actual.room) differences.push(`room: esperado ${expected.room ?? "-"}, recebido ${actual.room ?? "-"}`);
  for (const category of ["variables", "inventory"] as const) {
    const expectedValues = expected[category] ?? {};
    const actualValues = actual[category] ?? {};
    for (const key of new Set([...Object.keys(expectedValues), ...Object.keys(actualValues)])) {
      if (expectedValues[key] !== actualValues[key]) {
        differences.push(`${category}.${key}: esperado ${String(expectedValues[key])}, recebido ${String(actualValues[key])}`);
      }
    }
  }
  return { ok: differences.length === 0, differences };
}
