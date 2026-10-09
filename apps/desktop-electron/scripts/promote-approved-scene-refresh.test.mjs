import { describe, expect, it } from "vitest";
import { promoteApprovedSceneRefresh } from "./promote-approved-scene-refresh.mjs";

describe("promote-approved-scene-refresh", () => {
  it("substitui as cenas-alvo e preserva o point-and-click fora do escopo", () => {
    const manifest = {
      sceneNames: ["abertura", "titulo", "tempestade"],
      sceneOrder: ["abertura", "titulo", "oficina", "tempestade"],
      scenes: [
        { name: "abertura", backgroundAssetName: "opening-refresh.png" },
        { name: "titulo", backgroundAssetName: "title-refresh.png" },
        { name: "tempestade", backgroundAssetName: "storm-refresh.png" }
      ],
      actors: [
        { id: "opening-refresh-actor", roomName: "abertura", spriteSheet: "opening-actor.png" },
        { id: "title-refresh-actor", roomName: "titulo", spriteSheet: "title-actor.png" },
        { id: "storm-refresh-actor", roomName: "tempestade", spriteSheet: "storm-actor.png" }
      ],
      assets: [
        { id: "opening-refresh", name: "opening-refresh.png" },
        { id: "title-refresh", name: "title-refresh.png" },
        { id: "storm-refresh", name: "storm-refresh.png" }
      ],
      animations: [
        { id: "opening-refresh-animation", spriteSheet: "opening-actor.png" },
        { id: "title-refresh-animation", spriteSheet: "title-actor.png" },
        { id: "storm-refresh-animation", spriteSheet: "storm-actor.png" }
      ],
      animationStates: [
        { id: "opening-refresh-state", spriteSheet: "opening-actor.png" },
        { id: "title-refresh-state", spriteSheet: "title-actor.png" },
        { id: "storm-refresh-state", spriteSheet: "storm-actor.png" }
      ]
    };
    const pointClickScene = {
      id: "scene-oficina",
      name: "oficina",
      backgroundAssetName: "armazem-das-mares-gba.png"
    };
    const pointClickActor = {
      id: "oficina-cursor",
      name: "Cursor da Oficina",
      roomName: "oficina",
      spriteSheet: "point-click-cursor.png"
    };
    const project = {
      rooms: [{ name: "abertura", backgroundAssetName: "old-opening.png" }, pointClickScene],
      scenas: [{ name: "abertura", backgroundAssetName: "old-opening.png" }, pointClickScene],
      actors: [
        { id: "old-opening-actor", roomName: "abertura", spriteSheet: "old-opening.png" },
        pointClickActor
      ],
      assets: [
        { id: "old-opening", name: "old-opening.png" },
        { id: "point-click-cursor", name: "point-click-cursor.png" }
      ],
      animations: [{ id: "old-opening-animation", spriteSheet: "old-opening.png" }],
      animationStates: [{ id: "old-opening-state", spriteSheet: "old-opening.png" }],
      events: [{ name: "keep-existing-event" }],
      settings: { shmup: { playerSprite: "old-player.png", enemySprite: "old-enemy.png", projectileSprite: "keep.png" } }
    };

    const promoted = promoteApprovedSceneRefresh(project, manifest);
    expect(promoted.rooms.map((scene) => scene.name)).toEqual([
      "abertura", "titulo", "oficina", "tempestade"
    ]);
    expect(promoted.scenas).toEqual(promoted.rooms);
    expect(promoted.rooms.find((scene) => scene.name === "abertura").backgroundAssetName)
      .toBe("opening-refresh.png");
    expect(promoted.rooms.find((scene) => scene.name === "oficina")).toEqual(pointClickScene);
    expect(promoted.actors.find((actor) => actor.id === pointClickActor.id)).toEqual(pointClickActor);
    expect(promoted.actors.filter((actor) => actor.roomName !== "oficina")).toEqual(manifest.actors);
    expect(promoted.assets).toEqual(expect.arrayContaining(manifest.assets));
    expect(promoted.animations).toEqual(expect.arrayContaining(manifest.animations));
    expect(promoted.animationStates).toEqual(expect.arrayContaining(manifest.animationStates));
    expect(promoted.events).toEqual(project.events);
    expect(promoted.settings.shmup).toMatchObject({
      playerSprite: "tempestade-v3-player.png",
      enemySprite: "tempestade-v3-drone-horizontal.png",
      projectileSprite: "keep.png"
    });
  });
});
