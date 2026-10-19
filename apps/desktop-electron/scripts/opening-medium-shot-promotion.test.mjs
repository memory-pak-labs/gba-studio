import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { promoteExemploGBAVerticeCampaign } from "./vertice-showcase-project.mjs";
import { buildEngineExportProjectContract } from "../src/main/exportEngineProject.js";

describe("approved illustrated opening", () => {
  it("retains the 480-frame sequence and exact bindings when rebuilding campaign logic", () => {
    const source = JSON.parse(readFileSync(new URL("../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8"));
    const rebuilt = promoteExemploGBAVerticeCampaign(source);
    for (const key of ["rooms", "scenas"]) {
      expect(rebuilt[key].find(room => room.name === "abertura")).toEqual(source[key].find(room => room.name === "abertura"));
    }
    expect(rebuilt.actors.filter(actor => actor.roomName === "abertura")).toEqual(source.actors.filter(actor => actor.roomName === "abertura"));
    const scene = buildEngineExportProjectContract(rebuilt).cutscene_project.scenes.find(scene => scene.name === "abertura");
    expect(scene.steps.reduce((sum, step) => sum + step.duration_frames, 0)).toBe(480);
    expect(scene.steps.slice(0, -1).map(step => step.actor_frames[0].frame_index)).toEqual([0,1,0,2,0,3,4,5,6,5,6,5,7,5,8,9,0]);
    expect(scene.actors).toHaveLength(1);
    expect(scene.steps.at(-1).script).toEqual(expect.arrayContaining([expect.objectContaining({ op: "warp_runtime", runtime: "menu", room: 0 })]));
  });
});
