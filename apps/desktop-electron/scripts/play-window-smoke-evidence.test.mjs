import { describe, expect, it } from "vitest";

import {
  analyzeWideSceneSamples,
  buildPlayWindowCheckedFeatures,
  normalizeWideActionIntervalMs,
  parseWideActionCodes,
  selectKeyboardProbeCode,
  selectWideSceneActionCodes,
  shouldPressWideSceneAction,
  shouldSkipWideSceneGameplayWarmup
} from "./play-window-smoke-evidence.mjs";

describe("Play Window smoke evidence", () => {
  it("only claims runtime, audio, trigger and menu checks that actually ran", () => {
    const generic = buildPlayWindowCheckedFeatures({});
    expect(generic).not.toContain("native-rom-runtime-state");
    expect(generic).not.toContain("web-audio-non-silent-pcm");
    expect(generic).not.toContain("trigger-enter-leave-and-room-change");
    expect(generic).not.toContain("logo-title-menu-gameplay");
    expect(generic).not.toContain("wide-scene-continuous-frame-sampling");
    expect(generic).not.toContain("start-input-and-player-screenshot");
    expect(generic).not.toContain("dpad-visible-frame-change");

    const complete = buildPlayWindowCheckedFeatures({
      audioOutput: { peak: 0.2 },
      menuFlowRoute: { gameplay: { signature: "game" } },
      gameplayInputState: { after: { signature: "moved" } },
      runtimeCanaryRoute: { changedRoom: { currentRoom: 1 } },
      runtimeInspection: { state: { currentRoom: 0 } },
      startInputState: { signature: "started" },
      wideSceneRoute: { runtimeSampleCount: 1, sampleCount: 1, samples: [{ signature: "wide" }] }
    });
    expect(complete).toEqual(expect.arrayContaining([
      "native-rom-runtime-state",
      "web-audio-non-silent-pcm",
      "trigger-enter-leave-and-room-change",
      "logo-title-menu-gameplay",
      "start-input-and-player-screenshot",
      "dpad-visible-frame-change",
      "wide-scene-continuous-frame-sampling",
      "wide-scene-no-empty-frames",
      "wide-scene-native-runtime-sampling"
    ]));
  });

  it("summarizes native runtime progress and rejects incomplete wide-scene coverage", () => {
    const samples = [
      {
        signature: "start",
        runtime: {
          currentRoom: 2,
          player: { x: 64, y: 64, direction: 3 },
          actorCount: 7,
          triggerEnterCount: 0,
          collision: { currentFlags: 1 }
        }
      },
      {
        signature: "middle",
        runtime: {
          currentRoom: 2,
          player: { x: 640, y: 104, direction: 3 },
          actorCount: 7,
          triggerEnterCount: 1,
          collision: { currentFlags: 1 }
        }
      },
      {
        signature: "end",
        runtime: {
          currentRoom: 2,
          player: { x: 1160, y: 104, direction: 3 },
          actorCount: 7,
          triggerEnterCount: 2,
          collision: { currentFlags: 1 }
        }
      }
    ];

    expect(analyzeWideSceneSamples(samples, {
      minimumActorCount: 7,
      minimumDistinctSignatures: 3,
      minimumPlayerX: 1100,
      minimumTriggerEnterCount: 2
    })).toMatchObject({
      distinctSignatureCount: 3,
      maxActorCount: 7,
      maxPlayerX: 1160,
      maxTriggerEnterCount: 2,
      observedRooms: [2],
      runtimeSampleCount: 3
    });

    expect(() => analyzeWideSceneSamples(samples, { minimumPlayerX: 1200 })).toThrow(/player X/i);
    expect(() => analyzeWideSceneSamples(samples, { minimumActorCount: 8 })).toThrow(/actor count/i);
    expect(() => analyzeWideSceneSamples(samples, { minimumTriggerEnterCount: 3 })).toThrow(/trigger enter count/i);
    expect(() => analyzeWideSceneSamples([
      { signature: "missing-a", runtime: null },
      { signature: "missing-b", runtime: null }
    ])).toThrow(/runtime telemetry/i);
  });

  it("limits obstacle actions to the configured opening phase", () => {
    expect(shouldPressWideSceneAction({ elapsedMs: 900, nextActionAtMs: 900, actionUntilMs: 6_000, playerX: 300, actionUntilPlayerX: 400 })).toBe(true);
    expect(shouldPressWideSceneAction({ elapsedMs: 899, nextActionAtMs: 900, actionUntilMs: 6_000, playerX: 300, actionUntilPlayerX: 400 })).toBe(false);
    expect(shouldPressWideSceneAction({ elapsedMs: 6_001, nextActionAtMs: 5_400, actionUntilMs: 6_000, playerX: 300, actionUntilPlayerX: 400 })).toBe(false);
    expect(shouldPressWideSceneAction({ elapsedMs: 5_400, nextActionAtMs: 5_400, actionUntilMs: 6_000, playerX: 400, actionUntilPlayerX: 400 })).toBe(false);
  });

  it("skips the generic jump warmup only for a directed wide-scene probe", () => {
    expect(shouldSkipWideSceneGameplayWarmup({ wideSceneSmoke: true, requestedSkip: true })).toBe(true);
    expect(shouldSkipWideSceneGameplayWarmup({ wideSceneSmoke: false, requestedSkip: true })).toBe(false);
  });

  it("uses directional input for focused probes without firing action scripts", () => {
    expect(selectKeyboardProbeCode({ skipGameplayWarmup: true, wideInputCode: "ArrowRight" })).toBe("ArrowRight");
    expect(selectKeyboardProbeCode({ skipGameplayWarmup: false, wideInputCode: "ArrowRight" })).toBe("KeyX");
  });

  it("normalizes the directed action cadence", () => {
    expect(normalizeWideActionIntervalMs(300)).toBe(300);
    expect(normalizeWideActionIntervalMs(20)).toBe(100);
    expect(normalizeWideActionIntervalMs(Number.NaN)).toBe(900);
  });

  it("parses multiple directed action buttons", () => {
    expect(parseWideActionCodes("KeyX, KeyZ")).toEqual(["KeyX", "KeyZ"]);
    expect(parseWideActionCodes(" ")).toEqual(["KeyX"]);
  });

  it("switches to tail actions after the configured player position", () => {
    expect(selectWideSceneActionCodes({ playerX: 899, switchAtPlayerX: 900, openingCodes: ["KeyX", "KeyZ"], tailCodes: ["KeyX"] })).toEqual(["KeyX", "KeyZ"]);
    expect(selectWideSceneActionCodes({ playerX: 900, switchAtPlayerX: 900, openingCodes: ["KeyX", "KeyZ"], tailCodes: ["KeyX"] })).toEqual(["KeyX"]);
  });
});
