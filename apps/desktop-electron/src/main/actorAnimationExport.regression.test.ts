import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";

function animationProject(sceneType: "topdown" | "platformer") {
  const data = createBlankProjectData({ name: "Animation target", includeStarterContent: false });
  data.scenas = [{ id: "room-a", name: "Room A", width: 30, height: 20, sceneType,
    playerActorName: "Player", eventBindings: { onInit: "scene_boot" } }];
  data.actors = [
    { id: "player", name: "Player", roomName: "Room A", x: 3, y: 5 },
    { id: "guide-a", name: "Guide A", roomName: "Room A", x: 8, y: 5, spriteSheet: "guide-a.png",
      animationName: "idle_down", eventBindings: { onInteract: "actor_use" } },
    { id: "guide-b", name: "Guide B", roomName: "Room A", x: 12, y: 5, spriteSheet: "guide-b.png", animationName: "idle_down" }
  ];
  data.assets = ["guide-a", "guide-b"].map(id => ({
    id, name: `${id}.png`, kind: "Sprite", metadata: { source: `Assets/sprites/${id}.png` }
  }));
  data.animations = [
    ...["idle_down", "wave"].map((name, index) => ({ id: `a-${index}`, name, spriteSheet: "guide-a.png",
      frameWidth: 16, frameHeight: 16, frameCount: 1 })),
    ...["idle_down", "other", "wave"].map((name, index) => ({ id: `b-${index}`, name, spriteSheet: "guide-b.png",
      frameWidth: 16, frameHeight: 16, frameCount: 1 }))
  ];
  data.animationStates = [];
  data.events = [
    { id: "scene-boot", name: "scene_boot", category: "Cena", roomName: "Room A", steps: [{ command: "call_event shared_animation" }] },
    { id: "actor-use", name: "actor_use", category: "Ator", roomName: "Room A", steps: [{ command: "call_event shared_animation" }] },
    { id: "shared-animation", name: "shared_animation", category: "Custom", steps: [
      { command: 'set_actor_animation "Guide A" wave' },
      { command: 'play_actor_animation "Guide B" wave true' }
    ] }
  ];
  const settings = data.settings as { general: Record<string, unknown> };
  settings.general.startScene = "Room A";
  settings.general.startSceneType = sceneType;
  return data;
}

describe("actor animation bytecode target", () => {
  it.each(["topdown", "platformer"] as const)("exports waits for the Player and preserves NPC targets in %s", sceneType => {
    for (const target of ["Player", "player", "Hero QA"]) {
      const data = animationProject(sceneType);
      Object.assign((data.actors as Array<Record<string, unknown>>)[0]!, { name: "Hero QA", spriteSheet: "guide-a.png" });
      Object.assign((data.scenas as Array<Record<string, unknown>>)[0]!, { playerActorName: "Hero QA" });
      Object.assign((data.events as Array<Record<string, unknown>>)[0]!, { steps: [
        { command: `wait_actor_animation "${target}"` },
        { command: 'wait_actor_animation "Guide A"' }
      ] });
      const contract = buildEngineExportProjectContract(data);
      const runtime = sceneType === "topdown" ? contract.topdown_project! : contract.platformer_project!;
      expect(runtime.rooms[0]!.on_enter).toEqual(expect.arrayContaining([
        { op: "wait_actor_animation", actor: -1 }, { op: "wait_actor_animation", actor: 0 }
      ]));
    }
  });
  it.each(["topdown", "platformer"] as const)("resolves the reserved Player aliases and configured name for play animation in %s", sceneType => {
    for (const target of ["Player", "player", "Hero QA"]) {
      const data = animationProject(sceneType);
      Object.assign((data.actors as Array<Record<string, unknown>>)[0]!, {
        name: "Hero QA", spriteSheet: "guide-a.png", animationName: "idle_down"
      });
      Object.assign((data.scenas as Array<Record<string, unknown>>)[0]!, { playerActorName: "Hero QA" });
      Object.assign((data.events as Array<Record<string, unknown>>)[0]!, {
        steps: [{ command: `play_actor_animation "${target}" wave` }]
      });
      const contract = buildEngineExportProjectContract(data);
      const runtime = sceneType === "topdown" ? contract.topdown_project! : contract.platformer_project!;
      expect(runtime.rooms[0]!.on_enter).toContainEqual({ op: "set_player_animation", animation: "wave" });
    }
  });

  it.each(["topdown", "platformer"] as const)("preserves authored clip looping for play animation in %s", sceneType => {
    for (const loops of [true, false]) {
      const data = animationProject(sceneType);
      Object.assign((data.actors as Array<Record<string, unknown>>)[0]!, {
        spriteSheet: "guide-a.png", animationName: "idle_down"
      });
      const wave = (data.animations as Array<Record<string, unknown>>).find(animation => animation.id === "a-1")!;
      wave.loops = loops;
      Object.assign((data.events as Array<Record<string, unknown>>)[0]!, {
        steps: [{ command: "play_actor_animation Player wave" }]
      });
      const contract = buildEngineExportProjectContract(data);
      const animations = sceneType === "topdown"
        ? contract.topdown_project!.player.animations
        : contract.platformer_project!.player!.script_animations;
      expect(animations?.find(animation => animation.name === "wave")).toMatchObject({ loops });
    }
  });

  it.each([
    ["topdown", "Player"], ["platformer", "Player"],
    ["topdown", "Hero"], ["platformer", "Hero"]
  ] as const)("exports frame and speed for the configured Player in %s using %s", (sceneType, target) => {
    const data = animationProject(sceneType);
    const actors = data.actors as Array<Record<string, unknown>>;
    Object.assign(actors[0]!, { name: target, spriteSheet: "guide-a.png" });
    Object.assign((data.scenas as Array<Record<string, unknown>>)[0]!, { playerActorName: target });
    Object.assign((data.events as Array<Record<string, unknown>>)[0]!, { steps: [
      { command: `set_actor_animation_frame ${target} 2` },
      { command: `set_actor_animation_speed ${target} 25` },
      { command: 'set_actor_animation_frame "Guide A" 1' },
      { command: 'set_actor_animation_speed "Guide A" 400' }
    ] });
    const contract = buildEngineExportProjectContract(data);
    const runtime = sceneType === "topdown" ? contract.topdown_project! : contract.platformer_project!;
    expect(runtime.rooms[0]!.on_enter).toEqual(expect.arrayContaining([
      { op: "set_actor_animation_frame", actor: -1, frame: 2 },
      { op: "set_actor_animation_speed", actor: -1, percent: 25 },
      { op: "set_actor_animation_frame", actor: 0, frame: 1 },
      { op: "set_actor_animation_speed", actor: 0, percent: 400 }
    ]));
  });

  it("preserves every named Player clip in Platformer, including clips outside the automatic states", () => {
    const data = animationProject("platformer");
    Object.assign((data.actors as Array<Record<string, unknown>>)[0]!, { spriteSheet: "guide-a.png", animationName: "idle_down" });
    Object.assign((data.events as Array<Record<string, unknown>>)[0]!, { steps: [{ command: "set_actor_animation Player wave" }] });
    const runtime = buildEngineExportProjectContract(data).platformer_project!;
    expect(runtime.player).toMatchObject({ script_animations: [
      expect.objectContaining({ name: "idle_down" }), expect.objectContaining({ name: "wave" })
    ] });
    expect(runtime.rooms[0]!.on_enter).toContainEqual({ op: "set_player_animation", animation: "wave" });
  });

  it.each(["topdown", "platformer"] as const)("preserves the named target in a shared routine called by scene and actor in %s", sceneType => {
    const contract = buildEngineExportProjectContract(animationProject(sceneType));
    expect(contract.requires.features).toContain("events.named_animation_keys");
    const runtime = sceneType === "topdown" ? contract.topdown_project! : contract.platformer_project!;
    expect(runtime.scripts.find(script => script.name === "shared_animation")?.script).toEqual([
      { op: "set_actor_animation", actor: 0, animation: "wave" },
      { op: "set_actor_animation", actor: 1, animation: "wave" }
    ]);
    expect(runtime.rooms[0]?.on_enter).toContainEqual({ op: "call_script", index: 2 });
    expect(runtime.rooms[0]?.npcs?.[0]?.on_interact).toContainEqual({ op: "call_script", index: 2 });
  });

  it("keeps the clip name after swapping to a sprite with a different animation order", () => {
    const data = animationProject("topdown");
    (data.events as Array<{ steps: Array<{ command: string }> }>)[2]!.steps.unshift({ command: 'change_actor_sprite "Guide A" guide-b.png' });
    const runtime = buildEngineExportProjectContract(data).topdown_project!;
    expect(runtime.scripts.find(script => script.name === "shared_animation")?.script[0]).toEqual({
      op: "set_actor_sprite", actor: 0, sprite: runtime.actor_sprites?.findIndex(sprite => sprite.name === "guide-b.png")
    });
    expect(runtime.scripts.find(script => script.name === "shared_animation")?.script[1]).toEqual({
      op: "set_actor_animation", actor: 0, animation: "wave"
    });
    expect(runtime.rooms[0]?.npcs?.[0]?.animations?.map(animation => animation.name)).toEqual(["idle_down", "wave"]);
    expect(runtime.actor_sprites?.find(sprite => sprite.name === "guide-b.png")?.animations?.map(animation => animation.name))
      .toEqual(["idle_down", "other", "wave"]);
  });
});
