import { describe, expect, it } from "vitest";
import { buildProjectFromTemplate } from "./projectTemplates.js";
import { createRoomInProject, updateRoomFieldsInProject } from "./roomsWorkspace.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildAssetcSpritePackGeneration } from "./engineProjectExport.js";
import { resolveGbaActorSprite, gbaActorSpriteRoomPlacementFromFrame } from "./gbaRendering.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject, type GBAProjectData } from "./projectFile.js";

function records(data: GBAProjectData, key: string): Record<string, any>[] {
  return data[key] as Record<string, any>[];
}

describe("approved players in blank projects", () => {
  it("starts with the approved topdown player and fixed idle, without example content", () => {
    const project = buildProjectFromTemplate("blank", { name: "Meu jogo" });
    const actor = records(project, "actors")[0]!;
    expect(actor).toMatchObject({ name: "Player", spriteSheet: "neutral-player-topdown.png", animationName: "idle_down" });
    expect(records(project, "rooms")[0]).toMatchObject({ playerActorName: "Player", backgroundAssetName: "neutral-background-topdown.png" });
    expect(project.settings).toMatchObject({ general: { startPlayer: "Player" } });
    expect(records(project, "assets").every(asset => asset.metadata.bundledDefaultAsset.startsWith("template:blank/"))).toBe(true);
    for (const key of ["events", "triggers", "dialogues", "audioItems"]) expect(project[key]).toEqual([]);
    const animations = records(project, "animations");
    expect(animations.filter(animation => animation.state === "idle").every(animation => animation.frames.length === 1)).toBe(true);
    const down = animations.find(animation => animation.spriteSheet === actor.spriteSheet && animation.name === "walk_down")!;
    expect(down.frames).toHaveLength(4);
    const reopened = parseGBAProjectFile(serializeGBAProjectFile({ data: project, summary: summarizeGBAProject(project) })).data;
    expect(reopened).toEqual(project);
  });

  it.each([
    ["topdown", "neutral-player-topdown.png", 32, 32, 1],
    ["platformer", "neutral-player-platformer.png", 64, 64, 1],
    ["luta", "neutral-player-fighter.png", 64, 80, 1],
    ["isometricAdventure", "neutral-player-isometric-adventure.png", 40, 48, 1],
    ["isometricTactical", "neutral-player-isometric-tactical.png", 32, 32, 2],
    ["shmup", "neutral-player-shmup-horizontal.png", 32, 32, 1]
  ])("creates %s with its approved player and complete animation bindings", (sceneType, spriteSheet, width, height, actorCount) => {
    const base = buildProjectFromTemplate("blank", { name: "Cenas" });
    const next = createRoomInProject(base, {
      id: `new-${sceneType}`, name: `new_${sceneType}`, width: 30, height: 20, sceneType: String(sceneType),
      ...(String(sceneType).startsWith("isometric") ? { presetID: sceneType as "isometricAdventure" | "isometricTactical" } : {})
    });
    const room = records(next, "rooms").at(-1)!;
    const actors = records(next, "actors").filter(actor => actor.roomName === room.name);
    expect(actors).toHaveLength(Number(actorCount));
    expect(actors[0]).toMatchObject({ spriteSheet });
    expect(room.backgroundAssetName).toMatch(/^neutral-background-/);
    expect(next.assets).toEqual(base.assets);
    for (const actor of actors) {
      expect(records(next, "assets").some(asset => asset.name === actor.spriteSheet)).toBe(true);
      expect(records(next, "animationStates").some(state => state.id === actor.animationStateID && state.spriteSheet === spriteSheet)).toBe(true);
      const animation = records(next, "animations").find(animation => animation.spriteSheet === spriteSheet && animation.name === actor.animationName)!;
      expect(animation).toMatchObject({ frameWidth: width, frameHeight: height, frameCount: 1 });
    }
    const contract = buildEngineExportProjectContract(next);
    expect(contract.export_warnings ?? []).toEqual([]);
    if (sceneType === "shmup") {
      expect(contract.shmup_project?.player.metasprite).toEqual({ asset: "neutral_player_shmup_horizontal", index: 0 });
      expect(contract.shmup_project?.player).toMatchObject({ animations: {
        idle: { asset: "neutral_player_shmup_horizontal", frame_indices: [0], durations: [60], loops: false },
        fly: { asset: "neutral_player_shmup_horizontal", frame_indices: [1, 2, 3], durations: [6, 6, 6], loops: true },
        bank_up: { asset: "neutral_player_shmup_horizontal", frame_indices: [4, 5], loops: true },
        bank_down: { asset: "neutral_player_shmup_horizontal", frame_indices: [6, 7], loops: true },
        shoot: { asset: "neutral_player_shmup_horizontal", frame_indices: [8, 9], durations: [5, 5], loops: false },
        hurt: { asset: "neutral_player_shmup_horizontal", frame_indices: [10, 11], loops: false },
        explosion: { asset: "neutral_shmup_explosion", frame_indices: [0, 1, 2, 3], durations: [6, 6, 6, 6], loops: false }
      } });
      expect(contract.shmup_project?.projectile.velocity).toEqual({ x: 4, y: 0 });
      expect(animationForShip(next).originX).toBe(-8);
      expect(animationForShip(next).originY).toBe(-24);
      const ship = actors[0]!;
      const frame = resolveGbaActorSprite(next, ship)!.frame!;
      expect(frame).toMatchObject({ originX: 0, originY: 0 });
      expect(gbaActorSpriteRoomPlacementFromFrame(ship.x, ship.y, frame)).toMatchObject({ leftTiles: ship.x, topTiles: ship.y });
      expect(resolveGbaActorSprite(next, { ...ship, originY: 8 })!.frame!.originY).toBe(8);
    }
    expect(records(base, "rooms")).toHaveLength(1);
  });

  it("changes default players between isometric modes and preserves a custom sprite", () => {
    const base = buildProjectFromTemplate("blank", { name: "Troca" });
    const adventure = createRoomInProject(base, { id: "iso", name: "iso", width: 6, height: 6, sceneType: "isometricAdventure" });
    const tactical = updateRoomFieldsInProject(adventure, "iso", { sceneType: "isometricTactical" });
    const actor = records(tactical, "actors").find(actor => actor.roomName === "iso" && actor.name === "Player")!;
    expect(actor.spriteSheet).toBe("neutral-player-isometric-tactical.png");
    expect(tactical.assets).toEqual(adventure.assets);
    expect(records(tactical, "rooms").find(room => room.id === "iso")?.backgroundAssetName).toBe("neutral-background-isometric-tactical.png");
    actor.spriteSheet = "custom.png";
    const customized = updateRoomFieldsInProject(tactical, "iso", { sceneType: "platformer" });
    expect(records(customized, "actors").find(candidate => candidate.id === actor.id)?.spriteSheet).toBe("custom.png");
  });

  it("binds the fighting player to player1 in the native fighting runtime", () => {
    const next = createRoomInProject(buildProjectFromTemplate("blank", { name: "Luta" }), {
      id: "fight", name: "fight", width: 30, height: 20, sceneType: "luta"
    });
    const player = records(next, "actors").find(actor => actor.roomName === "fight" && actor.name === "Player")!;
    expect(player.battle).toMatchObject({ side: "player1" });
    expect(player.lutaAnimations).toMatchObject({ idle: "idle_right", attack: "attack_right", hurt: "hurt_right" });
    const contract = buildEngineExportProjectContract(next);
    expect(contract.luta_project?.stages[0]?.player1?.[0]?.animation_set).toMatchObject({
      idle: expect.any(Object), attack: expect.any(Object), hurt: expect.any(Object)
    });
  });

  it("reserves each default player's sprite only in its own scenes", () => {
    let project = buildProjectFromTemplate("blank", { name: "Mixed scenes" });
    for (const sceneType of ["platformer", "luta", "isometricAdventure", "isometricTactical", "shmup"]) {
      project = createRoomInProject(project, {
        id: sceneType, name: sceneType, width: 6, height: 6, sceneType
      });
    }
    const pack = buildAssetcSpritePackGeneration(project)!;
    for (const [sheet, group] of [
      ["neutral-player-topdown.png", "scene_cena_1"],
      ["neutral-player-platformer.png", "scene_platformer"],
      ["neutral-player-fighter.png", "scene_luta"],
      ["neutral-player-isometric-adventure.png", "scene_isometricadventure"],
      ["neutral-player-isometric-tactical.png", "scene_isometrictactical"],
      ["neutral-player-shmup-horizontal.png", "scene_shmup"]
    ]) expect(pack.assetsBySheet[sheet].bank_groups).toEqual([group]);
  });

  it.each([
    ["racing", "neutral-player-racing-topdown.png"]
  ])("uses the approved purple default for %s", (sceneType, spriteSheet) => {
    const base = buildProjectFromTemplate("blank", { name: "Existing defaults" });
    const initialRoom = records(base, "rooms")[0]!;
    const changed = updateRoomFieldsInProject(base, String(initialRoom.id), { sceneType });
    const changedPlayer = records(changed, "actors")[0]!;
    expect(changedPlayer.spriteSheet).toBe(spriteSheet);
    expect(records(changed, "assets").some(asset => asset.name === spriteSheet)).toBe(true);
    expect(records(changed, "animationStates").some(state => state.id === changedPlayer.animationStateID && state.spriteSheet === spriteSheet)).toBe(true);
    const next = createRoomInProject(base, { id: sceneType, name: sceneType, width: 30, height: 20, sceneType });
    const player = records(next, "actors").find(actor => actor.roomName === sceneType)!;
    expect(player).toMatchObject({ name: "Player", spriteSheet });
    expect(records(next, "assets").some(asset => asset.name === spriteSheet)).toBe(true);
    expect(records(next, "animationStates").some(state => state.id === player.animationStateID)).toBe(true);
    const switched = updateRoomFieldsInProject(next, sceneType, { sceneType: "topdown" });
    expect(records(switched, "actors").find(actor => actor.id === player.id)?.spriteSheet).toBe("neutral-player-topdown.png");
    expect(records(base, "assets").filter(asset => String((asset.metadata as Record<string,unknown>)?.source).startsWith("Assets/sprites/"))).toHaveLength(10);
  });

  it("uses the approved hand as the blank point-and-click player, with a fixed pointer and complete click", () => {
    const base = buildProjectFromTemplate("blank", { name: "Hand cursor" });
    const initialRoom = records(base, "rooms")[0]!;
    const project = updateRoomFieldsInProject(base, initialRoom.id, { sceneType: "pointAndClick" });
    const player = records(project, "actors")[0]!;
    expect(player).toMatchObject({ spriteSheet: "neutral-cursor-hand.png", animationStateID: "state-neutral-point-click", animationName: "idle" });
    expect(project.settings).toMatchObject({ pointAndClick: { cursorImage: "neutral-cursor-hand.png" } });
    const clips = records(project, "animations").filter(animation => animation.spriteSheet === player.spriteSheet);
    expect(clips.map(clip => [clip.name, clip.frames.map((frame: any) => frame.tiles[0].sliceX / 32)])).toEqual([
      ["idle", [0]], ["click", [1, 2, 3, 4]]
    ]);
    expect(clips[0]).toMatchObject({ frameCount: 1, frameWidth: 32, frameHeight: 32 });
    expect(clips[1]).toMatchObject({ fps: 12, loops: false });
    const frame = resolveGbaActorSprite(project, player)!.frame!;
    expect(frame).toMatchObject({ originX: 10, originY: 7 });
    const contract = buildEngineExportProjectContract(project);
    expect(contract.point_click_project?.cursor).toMatchObject({
      metasprite: { asset: "neutral_cursor_hand", index: 0 },
      animations: expect.arrayContaining([
        expect.objectContaining({ name: "idle", frame_indices: [0] }),
        expect.objectContaining({ name: "click", frame_indices: [0, 1, 2, 3], durations: [5, 5, 5, 5], loops: false,
          frame_metasprites: [32, 64, 96, 128].map(slice_x => ({ parts: [expect.objectContaining({ slice_x, x: -10, y: -7, width: 32, height: 32 })] })) })
      ])
    });
    const pack = buildAssetcSpritePackGeneration(project)!;
    expect(pack.assetsBySheet[player.spriteSheet].bank_groups).toEqual(["scene_cena_1"]);
    const created = createRoomInProject(base, { id: "point", name: "point", width: 30, height: 20, sceneType: "pointAndClick" });
    expect(records(created, "actors").find(actor => actor.roomName === "point")).toMatchObject({ spriteSheet: player.spriteSheet });
    player.spriteSheet = "custom-cursor.png";
    expect(records(updateRoomFieldsInProject(project, initialRoom.id, { sceneType: "topdown" }), "actors")[0]!.spriteSheet).toBe("custom-cursor.png");
  });

  it("switches the initial blank room to the horizontal ship and preserves custom artwork", () => {
    const base = buildProjectFromTemplate("blank", { name: "Horizontal ship" });
    const room = records(base, "rooms")[0]!;
    const changed = updateRoomFieldsInProject(base, room.id, { sceneType: "shmup" });
    const player = records(changed, "actors")[0]!;
    expect(player).toMatchObject({ spriteSheet: "neutral-player-shmup-horizontal.png", animationName: "idle", animationStateID: "state-neutral-shmup" });
    player.spriteSheet = "custom-ship.png";
    expect(records(updateRoomFieldsInProject(changed, room.id, { sceneType: "topdown" }), "actors")[0]!.spriteSheet).toBe("custom-ship.png");
    expect(records(base, "actors")[0]!.spriteSheet).toBe("neutral-player-topdown.png");
  });

  it("binds the prepared ship's twelve frames and keeps explosion separate from the player", () => {
    const project = buildProjectFromTemplate("blank", { name: "Ship animations" });
    const animations = records(project, "animations").filter(animation => animation.spriteSheet === "neutral-player-shmup-horizontal.png");
    expect(animations.map(animation => [animation.name, animation.frames.map((frame: any) => frame.tiles[0].sliceX / 32)])).toEqual([
      ["idle", [0]], ["fly_right", [1, 2, 3]], ["bank_up", [4, 5]],
      ["bank_down", [6, 7]], ["shoot_right", [8, 9]], ["hurt_right", [10, 11]]
    ]);
    expect(animations[0]).toMatchObject({ frameCount: 1, fps: 1, loops: false });
    expect(records(project, "animationStates").find(state => state.id === "state-neutral-shmup")).toMatchObject({ animationType: "fixed", mirrorLeftFromRight: false });
    const explosion = records(project, "animations").find(animation => animation.spriteSheet === "neutral-shmup-explosion.png")!;
    expect(explosion).toMatchObject({ name: "explosion", frameCount: 4, loops: false, fps: 10 });
    expect(explosion.frames.map((frame: any) => frame.tiles[0].sliceX)).toEqual([0, 32, 64, 96]);
    expect(records(project, "actors").some(actor => actor.spriteSheet === explosion.spriteSheet)).toBe(false);
    expect(project.events).toEqual([]);
  });

  it.each(["cutscene", "menu", "visualNovel", "battleRpg", "dungeonCrawler", "worldMap"])("does not add an unnecessary player to %s", sceneType => {
    const next = createRoomInProject(buildProjectFromTemplate("blank", { name: "Sem player" }), {
      id: sceneType, name: sceneType, width: 30, height: 20, sceneType
    });
    expect(records(next, "actors").filter(actor => actor.roomName === sceneType)).toEqual([]);
  });
});

function animationForShip(project: GBAProjectData): Record<string, any> {
  return records(project, "animations").find(animation => animation.spriteSheet === "neutral-player-shmup-horizontal.png" && animation.name === "idle")!;
}
