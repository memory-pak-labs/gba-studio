import { describe, expect, it } from "vitest";

import { buildAuthorStressProject } from "./authorStressProject.js";
import { createPreviewRuntime, tickPreviewRuntime } from "./previewRuntime.js";

describe("projeto autoral de stress", () => {
  it("mantem seis rooms grandes, carga alta de OAM/VRAM e audio em uma sessao longa", () => {
    const project = buildAuthorStressProject();
    const rooms = Array.isArray(project.scenas) ? project.scenas : [];
    const actors = Array.isArray(project.actors) ? project.actors : [];
    const audio = Array.isArray(project.audioItems) ? project.audioItems : [];
    let runtime = createPreviewRuntime(project);

    for (let frame = 0; frame < 1_200; frame += 1) {
      runtime = tickPreviewRuntime(runtime, 16);
    }

    expect(rooms).toHaveLength(6);
    expect(rooms.every((room) => room.width === 64 && room.height === 48)).toBe(true);
    expect(rooms.every((room) => room.cameraMode === "follow_player")).toBe(true);
    expect(rooms.reduce((total, room) => total + (room.tilemap?.length ?? 0), 0)).toBe(18_432);
    expect(actors).toHaveLength(577);
    expect(audio).toHaveLength(6);
    expect(runtime.currentRoom?.name).toBe("observatorio_01");
    expect(runtime.actors).toHaveLength(97);
  });
});
