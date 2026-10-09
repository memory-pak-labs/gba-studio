import { describe, expect, it } from "vitest";
import {
  appendInputReplayFrame,
  createInputReplay,
  inputFrameFromBitmasks,
  isInputReplay,
  normalizeInputReplay,
  inputReplayFrameAt,
  inputReplayStartRoom,
  verifyInputReplayCheckpoint
} from "./inputReplay.js";

describe("deterministic input replay", () => {
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
