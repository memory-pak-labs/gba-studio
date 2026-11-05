import { describe, expect, it } from "vitest";
import { deriveSpritesWorkspacePresentation, updateSpriteAnimationFieldsInProject } from "./spritesWorkspace.js";

function importedKeyProject() {
  return {
    animations: [{
      id: "key-idle", name: "idle_down", spriteSheet: "key.png",
      frameWidth: 16, frameHeight: 32, frameCount: 2, fps: 8,
      frames: [
        { width: 16, height: 32, originX: 0, originY: 0, metadata: { authored: true },
          tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 16, tileHeight: 16 }] },
        { width: 16, height: 16, originX: 3, originY: -2,
          tiles: [{ x: 0, y: 0, sliceX: 16, sliceY: 0, tileWidth: 16, tileHeight: 16 }] }
      ]
    }]
  };
}

describe("sprite frame dimension edits", () => {
  it("resizes existing frames with the animation height and persists the rendered dimensions", () => {
    const project = importedKeyProject();
    const next = updateSpriteAnimationFieldsInProject(project, "key-idle", { frameHeight: 16 });
    const saved = JSON.parse(JSON.stringify(next));
    const animation = saved.animations[0];
    expect(animation.frames.map((frame: { height: number }) => frame.height)).toEqual([16, 16]);
    expect(animation.frames[0]).toEqual({ ...project.animations[0].frames[0], height: 16 });
    expect(animation.frames[1]).toEqual(project.animations[0].frames[1]);
    expect(project.animations[0].frames[0].height).toBe(32);
    const rendered = deriveSpritesWorkspacePresentation(saved);
    expect(rendered.animationsBySheet["key.png"][0].metaspriteFrames.map(frame => frame.height)).toEqual([16, 16]);
  });

  it("updates only the edited dimension without changing per-frame origins, crops or metadata", () => {
    const project = importedKeyProject();
    const next = updateSpriteAnimationFieldsInProject(project, "key-idle", { frameWidth: 24 });
    const frames = (next.animations as typeof project.animations)[0].frames;
    expect(frames).toEqual(project.animations[0].frames.map(frame => ({ ...frame, width: 24 })));
  });

  it("keeps authored frame geometry when changing playback settings", () => {
    const project = importedKeyProject();
    const next = updateSpriteAnimationFieldsInProject(project, "key-idle", { fps: 12 });
    expect((next.animations as typeof project.animations)[0].frames).toEqual(project.animations[0].frames);
  });
});
