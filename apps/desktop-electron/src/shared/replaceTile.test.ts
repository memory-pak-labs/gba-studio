import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "./newProject.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "./previewRuntime.js";

function run(command: string) {
  const project = createBlankProjectData({name: "Tile replacement", sceneType: "topdown"});
  const room = (project.rooms as Record<string, unknown>[])[0];
  room.tilemap = Array(600).fill(1);
  room.collisionTypes = Array(600).fill("solid");
  room.collisions = Array(600).fill("solid");
  project.events = [{id: "edit", name: "edit", roomName: room.name, command}];
  return runPreviewRuntimeEvent(createPreviewRuntime(project), "edit");
}

describe("ReplaceTile preview contract", () => {
  it("changes rendered ground and explicitly opens collision", () => {
    const state = run("replace_tile 4 6 17 bg2 free");
    const room = state.currentRoom!;
    expect(room.tileCells[184]).toBe(17);
    expect(room.renderLayers.backgrounds.BG2.tileCells[184]).toBe(17);
    expect(room.bg2.tileCells[184]).toBe(17);
    expect(room.collisionCells[184]).toBe(false);
    expect(room.collisionTypes[184]).toBe("free");
    expect(room.collisionCells[183]).toBe(true);
  });
  it("keeps collision when omitted and does not wrap sequences into the next row", () => {
    const state = run("replace_tile_sequence 29 6 17 4 bg2");
    expect(state.currentRoom!.tileCells[209]).toBe(17);
    expect(state.currentRoom!.tileCells[210]).toBe(1);
    expect(state.currentRoom!.collisionCells[209]).toBe(true);
  });
  it("does not treat a negative column as the preceding row", () => {
    const state = run("replace_tile -1 6 17 bg2 free");
    expect(state.currentRoom!.tileCells[179]).toBe(1);
    expect(state.currentRoom!.collisionCells[179]).toBe(true);
  });
});
