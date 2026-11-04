import { describe, expect, it } from "vitest";
import {
  appendInputReplayFrame,
  appendInputReplayMasks,
  createInputReplay,
  inputFrameFromBitmasks,
  isInputReplay,
  normalizeInputReplay,
  inputReplayFrameAt,
  inputReplayStartRoom,
  verifyInputReplayCheckpoint
} from "./inputReplay.js";

describe("deterministic input replay", () => {
  it("retains a captured core state through normalization and uses its launch scene instead of its later room", () => {
    const initialState = { format: "mgba-state-v1", romSha256: "a".repeat(64), coreSha256: "b".repeat(64), stateBase64: "AQIDBA==", savedataBase64: "", launch: { roomName: "Dungeon" } };
    const source = { ...createInputReplay({ id: "captured", seed: 0 }), schema: 2, initialState, checkpoints: { 0: { room: "Final" } } };
    const normalized = normalizeInputReplay(JSON.parse(JSON.stringify(source)));
    expect(normalized?.initialState).toEqual(initialState);
    expect(inputReplayStartRoom(normalized!)).toBe("Dungeon");
    expect(normalizeInputReplay({ ...source, initialState: { ...initialState, stateBase64: "bad!" } })).toBeNull();
  });
  it("preserves the duration and short taps of a full input batch instead of one telemetry sample", () => {
    const initial = createInputReplay({ id: "native-frames", seed: 1 });
    const masks = [...Array(4).fill(0), 1, 1, ...Array(24).fill(0)];
    const first = appendInputReplayMasks(initial, masks, { room: "cena_1", variables: { v0: 0 } });
    const second = appendInputReplayMasks(first, [16, 16, 0], { room: "Caverna", variables: { v0: 1 } });
    expect(initial.frameCount).toBe(0);
    expect(first.frameCount).toBe(30);
    expect(second.frameCount).toBe(33);
    expect(inputReplayFrameAt(second, 4)).toEqual({ held: ["A"], pressed: ["A"] });
    expect(inputReplayFrameAt(second, 5)).toEqual({ held: ["A"], pressed: [] });
    expect(inputReplayFrameAt(second, 30)).toEqual({ held: ["RIGHT"], pressed: ["RIGHT"] });
    expect(inputReplayStartRoom(second)).toBe("cena_1");
    expect(verifyInputReplayCheckpoint(second, 32, { room: "Caverna", variables: { v0: 1 } }).ok).toBe(true);
    expect(second.runs.reduce((sum, run) => sum + run.frames, 0)).toBe(second.frameCount);
    expect(appendInputReplayMasks(second, [])).toBe(second);
  });

  it("validates well-formed replay payloads", () => {
    expect(isInputReplay({
      schema: 1,
      id: "run-1",
      seed: 1,
      initialSaveSlot: null,
      initialVariables: {},
      initialInventory: {},
      runs: [{ frame: { held: ["A"], pressed: [] }, frames: 1 }],
      checkpoints: {},
      frameCount: 1
    })).toBe(true);
    expect(isInputReplay({ schema: 1, id: 2, seed: 1, runs: [], checkpoints: {}, frameCount: 1 })).toBe(false);
  });

  it("normalizes loose JSON payloads into typed replays", () => {
    expect(normalizeInputReplay({
      schema: 1,
      id: "run-2",
      seed: 10,
      initialSaveSlot: "3",
      initialVariables: null,
      initialInventory: null,
      runs: [{ frame: { held: ["RIGHT", 12] }, frames: "4" }],
      checkpoints: { "2": { room: "0", variables: { lives: 3 } } },
      frameCount: -1
    })).toMatchObject({
      id: "run-2",
      seed: 10,
      initialSaveSlot: 3,
      frameCount: 0,
      runs: [{ frames: 4, frame: { held: ["RIGHT"], pressed: [] } }]
    });
  });

  it("decodes GBA key bitmasks into stable button names", () => {
    expect(inputFrameFromBitmasks(1 | 16 | 512, 1 | 512)).toEqual({
      held: ["A", "L", "RIGHT"],
      pressed: ["A", "L"]
    });
  });

  it("uses the earliest replay checkpoint as deterministic development start", () => {
    const replay = createInputReplay({ id: "dungeon-racing", seed: 7 });
    replay.checkpoints = {
      480: { room: "farol_corrida_final" },
      0: { room: "farol_subsolo" }
    };

    expect(inputReplayStartRoom(replay)).toBe("farol_subsolo");
    expect(inputReplayStartRoom({ ...replay, checkpoints: {} })).toBeUndefined();
  });

  it("stores seed, initial state, compressed input runs and checkpoints", () => {
    let replay = createInputReplay({
      id: "boss-route",
      seed: 1234,
      initialSaveSlot: 2,
      initialVariables: { chapter: 3 },
      initialInventory: { key: 1 }
    });
    replay = appendInputReplayFrame(replay, { held: ["RIGHT"], pressed: ["RIGHT"] });
    replay = appendInputReplayFrame(replay, { held: ["RIGHT"], pressed: [] });
    replay = appendInputReplayFrame(replay, { held: ["RIGHT"], pressed: [] });
    replay = appendInputReplayFrame(replay, { held: ["A"], pressed: ["A"] }, {
      room: "boss", variables: { chapter: 3 }
    });

    expect(replay.runs).toHaveLength(3);
    expect(replay.runs[1].frames).toBe(2);
    expect(inputReplayFrameAt(replay, 2)).toEqual({ held: ["RIGHT"], pressed: [] });
    expect(verifyInputReplayCheckpoint(replay, 3, {
      room: "boss",
      variables: { chapter: 3 }
    })).toEqual({ ok: true, differences: [] });
  });
});
