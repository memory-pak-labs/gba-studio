import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseGBAProjectFile } from "./projectFile.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildAssetcSpritePackGeneration } from "./engineProjectExport.js";

const data = parseGBAProjectFile(readFileSync(new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url), "utf8")).data;

describe("Porto Lumen directional animations", () => {
  it("exports a bounded native NPC route in pixels while preserving interaction", () => {
    const project = structuredClone(data);
    const actor = (project.actors as any[]).find(actor => actor.id === "port-mechanic");
    actor.topdownMovement = { kind: "wander_box", bounds: { x: 94, y: 47, width: 6, height: 4 } };
    const npc = buildEngineExportProjectContract(project).topdown_project!.rooms.find(room => room.name === "porto_lumen")!.npcs!.find(npc => npc.name === actor.name)!;
    expect(npc).toMatchObject({ movement: { kind: "wander_box", bounds: { x: 752, y: 376, width: 48, height: 32 } } });
    expect(npc.on_interact).toBeTruthy();
  });

  it.each([{kind:"wander_box",bounds:{x:94,y:47,width:0,height:4}},{kind:"wander_box",bounds:{x:94.5,y:47,width:6,height:4}},{kind:"unknown",bounds:{x:94,y:47,width:6,height:4}}])("rejects malformed NPC bounds or movement before export", movement => {
    const project = structuredClone(data);
    (project.actors as any[]).find(actor => actor.id === "port-mechanic").topdownMovement = movement;
    expect(() => buildEngineExportProjectContract(project)).toThrow(/topdownMovement/);
  });

  it("exports directional states with independent left artwork and streamed frames", () => {
    const pack = buildAssetcSpritePackGeneration(data)!;
    const contract = buildEngineExportProjectContract(data);
    for (const actor of ["nara", "mechanic"]) {
      const sheet = actor === "nara" ? "nara-topdown-walk-run-v1.png" : "porto-mechanic-animations48.png";
      expect(pack.assetsBySheet[sheet]).toMatchObject({ sprite_width: 32, sprite_height: 48, sprite_bpp: 8, stream_frames: true });
      const visual = actor === "nara"
        ? contract.topdown_project!.actor_sprites!.find(visual => visual.name === sheet)!
        : contract.topdown_project!.rooms.find(room => room.name === "porto_lumen")!.npcs!.find(npc => npc.name === "Mecânica de Lúmen")!;
      const expected = [
        "idle_down", "idle_right", "idle_up", "idle_left",
        "walk_down", "walk_right", "walk_up", "walk_left"
      ];
      if (actor === "nara") expected.push("run_down", "run_right", "run_up", "run_left");
      expect(visual.animations?.map(animation => animation.name)).toEqual(expected);
      for (const animation of visual.animations!) {
        expect(animation.frame_indices).toHaveLength(animation.name.startsWith("idle") ? 1 : 4);
        for (const frame of animation.frame_metasprites!) {
          expect(frame.parts).toHaveLength(2);
          expect(frame.parts[0]).toMatchObject({ x: -8, y: -40, width: 32, height: 32, hflip: false });
          expect(frame.parts[1]).toMatchObject({ x: -8, y: -8, width: 32, height: 16, hflip: false });
        }
      }
      const left = visual.animations!.find(animation => animation.name === "walk_left")!;
      const right = visual.animations!.find(animation => animation.name === "walk_right")!;
      expect(left.frame_metasprites![0]!.parts[0]!.slice_y).not.toBe(right.frame_metasprites![0]!.parts[0]!.slice_y);
    }
  });
});
