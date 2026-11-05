import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildActorEngineSpriteExport, buildAssetcSpritePackGeneration } from "./engineProjectExport.js";
import { parseGBAProjectFile, type GBAProjectData } from "./projectFile.js";

const directions = ["down", "right", "up", "left"];
const movementNames = ["idle", "walk"].flatMap(state => directions.map(direction => `${state}_${direction}`));

function spriteProject(names: string[], animationType = "fixed") {
  const actor = { id: "lamp", name: "Lamp", spriteSheet: "lamp.png", animationStateID: "lamp-state", animationName: names[0] };
  const animations = names.map((name, index) => ({
    id: `clip-${index}`, name, spriteSheet: "lamp.png", frameWidth: 16, frameHeight: 16,
    state: name.split("_")[0], direction: name.includes("_") ? name.split("_")[1] : "none",
    frames: [{ tiles: [{ x: 0, y: 0, sliceX: index * 16, sliceY: 0, tileWidth: 16, tileHeight: 16 }] }]
  }));
  const project = {
    assets: [{ id: "lamp-asset", name: "lamp.png", kind: "Sprite", metadata: { source: "Assets/sprites/lamp.png" } }],
    actors: [actor], animations,
    animationStates: [{ id: "lamp-state", name: "default", spriteSheet: "lamp.png", animationType,
      mirrorLeftFromRight: false, animationIDs: animations.map(animation => animation.id) }]
  } as GBAProjectData;
  return { project, actor };
}

describe("named clips inside normalized SpriteStates", () => {
  it("keeps fixed-state clip names and their authored frames after the movement slots", () => {
    const { project, actor } = spriteProject(["off", "on"]);
    const sprite = buildActorEngineSpriteExport(project, actor, buildAssetcSpritePackGeneration(project))!;
    expect(sprite.animations?.map(animation => animation.name)).toEqual([...movementNames, "off", "on"]);
    expect(sprite.animation).toBe("off");
    expect(sprite.animations?.find(animation => animation.name === "on")?.frame_metasprites?.[0]?.parts[0]?.slice_x).toBe(16);
  });

  it("keeps run slots in place and includes only additional clips owned by the selected state", () => {
    const runs = directions.map(direction => `run_${direction}`);
    const { project, actor } = spriteProject([...movementNames, ...runs, "wave"], "four_direction_movement");
    (project.animations as Record<string, unknown>[]).push({
      id: "unowned", name: "unowned", spriteSheet: "lamp.png", frameWidth: 16, frameHeight: 16
    });
    const sprite = buildActorEngineSpriteExport(project, actor, buildAssetcSpritePackGeneration(project))!;
    expect(sprite.animations?.map(animation => animation.name)).toEqual([...movementNames, ...runs, "wave"]);
  });

  it("exports the canonical Port lanterns with both clips called by their on-enter events", () => {
    const project = parseGBAProjectFile(readFileSync(new URL(
      "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url
    ), "utf8")).data;
    const room = buildEngineExportProjectContract(project).topdown_project!.rooms.find(room => room.name === "porto_lumen")!;
    const lanterns = room.npcs!.flatMap((actor, index) => actor.name.startsWith("Lanterna do cais") ? [{ actor, index }] : []);
    expect(lanterns).toHaveLength(2);
    for (const { actor, index } of lanterns) {
      expect(actor.animations?.map(animation => animation.name)).toEqual(expect.arrayContaining(["off", "on"]));
      for (const animation of ["off", "on"]) {
        expect(room.on_enter).toContainEqual({ op: "set_actor_animation", actor: index, animation });
      }
    }
  });
});
