import { describe, expect, it } from "vitest";
import type { GBAProjectData } from "./projectFile.js";
import { applyImportedAnimationToCutscene } from "./cutsceneAnimationImport.js";

describe("applyImportedAnimationToCutscene", () => {
  it("creates a step per frame while preserving the terminal transition", () => {
    const project = {
      scenas: [{
        id: "logo",
        name: "Logo",
        sceneType: "cutscene",
        backgroundAssetName: "old.png",
        runtime: {
          type: "cutscene",
          config: {
            stepDurationFrames: 8,
            autoAdvance: true,
            nextSceneIndex: 1,
            backgroundIndex: -1,
            steps: [
              { id: "old-1", dialogueKey: "", eventName: "logo_start", durationFrames: 8, autoAdvance: true, skippable: true, waitForDialogue: false, onSkipEventName: "", targetSceneIndex: -1, branchVariable: -1, branchValue: 0, branchTargetSceneIndex: -1, branchTargetStepIndex: -1 },
              { id: "old-2", dialogueKey: "", eventName: "logo_end", durationFrames: 60, autoAdvance: true, skippable: true, waitForDialogue: false, onSkipEventName: "", targetSceneIndex: 1, branchVariable: -1, branchValue: 0, branchTargetSceneIndex: -1, branchTargetStepIndex: -1 }
            ]
          }
        }
      }]
    } as unknown as GBAProjectData;

    const next = applyImportedAnimationToCutscene(project, "logo", {
      sourceAssetName: "logo.gif",
      frameAssetNames: ["logo-01.png", "logo-02.png", "logo-03.png"],
      frameDurations: [4, 5, 6],
      width: 240,
      height: 160,
      frameCount: 3,
      totalDurationFrames: 15
    });

    const room = (next.scenas as Array<Record<string, unknown>>)[0]!;
    const config = (room.runtime as Record<string, unknown>).config as Record<string, unknown>;
    const steps = config.steps as Array<Record<string, unknown>>;
    expect(room.backgroundAssetName).toBe("logo-01.png");
    expect(steps).toHaveLength(3);
    expect(steps.map((step) => step.backgroundAssetName)).toEqual(["logo-01.png", "logo-02.png", "logo-03.png"]);
    expect(steps.map((step) => step.durationFrames)).toEqual([4, 5, 6]);
    expect(steps[0]?.eventName).toBe("logo_start");
    expect(steps[2]?.eventName).toBe("logo_end");
    expect(steps[2]?.targetSceneIndex).toBe(1);
  });

  it("does not change a non-cutscene target", () => {
    const project = { scenas: [{ id: "menu", sceneType: "menu" }] } as unknown as GBAProjectData;
    const next = applyImportedAnimationToCutscene(project, "menu", {
      sourceAssetName: "menu.gif",
      frameAssetNames: ["menu-01.png"],
      frameDurations: [4],
      width: 240,
      height: 160,
      frameCount: 1,
      totalDurationFrames: 4
    });

    expect(next).toEqual(project);
  });
});
