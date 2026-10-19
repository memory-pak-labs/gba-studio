import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { normalizeCutsceneSceneConfig } from "../shared/sceneTypeProfiles.js";
import { createBlankProjectData } from "../shared/newProject.js";

describe("cutscene actor poses", () => {
  it("preserves an explicit sheet frame at each timeline step", () => {
    const config = normalizeCutsceneSceneConfig({ steps: [{ durationFrames: 6,
      actorFrames: [{ actorIndex: 0, frameIndex: 7 }] }] });
    expect(config.steps?.[0]).toMatchObject({ actorFrames: [{ actorIndex: 0, frameIndex: 7 }] });
  });

  it("exports a streamed animation reference and deterministic per-step frame selection", () => {
    const contract = buildEngineExportProjectContract({
      ...createBlankProjectData({ name: "Cutscene poses" }),
      assetGroups: [], animations: [], animationStates: [], spriteReferenceImages: [],
      assets: [{ id: "faces", name: "faces.png", kind: "Sprite", metadata: {
        source: "Assets/sprites/faces.png", width: 1280, height: 96,
        frameWidth: 128, frameHeight: 96, frameCount: 10, streamFrames: true, colorMode: "8bpp"
      } }],
      actors: [{ id: "cast", name: "Cast", roomName: "intro", x: 8, y: 7, spriteSheet: "faces.png" }],
      scenas: [{ id: "intro", name: "intro", sceneType: "cutscene", width: 30, height: 20,
        runtime: { type: "cutscene", config: { steps: [
          { durationFrames: 60, actorFrames: [{ actorIndex: 0, frameIndex: 0 }] },
          { durationFrames: 6, actorFrames: [{ actorIndex: 0, frameIndex: 7 }] }
        ] } } }],
      settings: { ...(createBlankProjectData({ name: "Cutscene poses" }).settings as Record<string, unknown>),
        general: { gameTitle: "Poses", startScene: "intro", startSceneType: "cutscene", exportFolder: "build" } }
    });
    const scene = contract.cutscene_project!.scenes[0]!;
    expect(scene.actors?.[0]).toMatchObject({ animation: { asset: "faces" } });
    expect(scene.steps.map(step => step.actor_frames)).toEqual([
      [{ actor_index: 0, frame_index: 0 }], [{ actor_index: 0, frame_index: 7 }]
    ]);
    expect(contract.asset_pack?.assets.find(asset => asset.id === "faces")).toMatchObject({ stream_frames: true });
  });
});
