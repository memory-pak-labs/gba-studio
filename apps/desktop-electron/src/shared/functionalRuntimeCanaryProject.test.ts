import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { createPreviewRuntime } from "./previewRuntime.js";
import { ROOM_COLLISION_TYPES } from "./roomCollisionTypes.js";
import { buildFunctionalRuntimeCanaryProject } from "./functionalRuntimeCanaryProject.js";

describe("functional runtime canary project", () => {
  it("combines visual layers, actors, triggers and every collision type in the gameplay room", () => {
    const project = buildFunctionalRuntimeCanaryProject();
    const room = (project.scenas as Array<Record<string, unknown>>).find((item) => item.name === "canary_gameplay");
    const collisionLab = (project.scenas as Array<Record<string, unknown>>).find((item) => item.name === "room_2");

    expect(room?.tileLayers).toEqual(expect.arrayContaining([
      expect.objectContaining({ mapping: "BG2" }),
      expect.objectContaining({ mapping: "BG1" })
    ]));
    expect(new Set(room?.collisionTypes as string[])).toEqual(new Set(ROOM_COLLISION_TYPES));
    expect(new Set(collisionLab?.collisionTypes as string[])).toEqual(new Set(ROOM_COLLISION_TYPES));
    expect((project.actors as Array<{ name: string }>).map((actor) => actor.name)).toEqual(
      expect.arrayContaining(["Player", "NPC_Canary"])
    );
    expect((project.triggers as Array<{ name: string }>).map((trigger) => trigger.name)).toEqual(
      expect.arrayContaining(["State Witness", "Room Exit"])
    );
  });

  it("persists reusable actor and trigger prefabs and links their instances", () => {
    const project = buildFunctionalRuntimeCanaryProject();

    expect(project.actorPrefabs).toEqual([
      expect.objectContaining({ id: "actor-prefab-canary-npc", name: "NPC Canary" })
    ]);
    expect(project.triggerPrefabs).toEqual([
      expect.objectContaining({
        id: "trigger-prefab-state-witness",
        name: "State Witness",
        onEnterEventName: "canary_state",
        onLeaveEventName: "canary_leave"
      })
    ]);
    expect(project.actors).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "NPC_Canary", prefabID: "actor-prefab-canary-npc" })
    ]));
    expect(project.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "State Witness", prefabID: "trigger-prefab-state-witness" })
    ]));
  });

  it("executes boot witnesses for variables, flags, actor state, music and SFX in preview", () => {
    const runtime = createPreviewRuntime(buildFunctionalRuntimeCanaryProject());
    const npc = runtime.actors.find((actor) => actor.name === "NPC_Canary");

    expect(runtime.currentRoom?.name).toBe("canary_gameplay");
    expect(runtime.variables["canary.counter"]).toBe(3);
    expect(runtime.flags["canary.started"]).toBe(true);
    expect(runtime.activeMusic).toBe("intro_theme.mod");
    expect(runtime.activeSfx).toBe("confirm.wav");
    expect(npc).toMatchObject({ direction: "left", animationName: "idle_left", visible: true });
  });

  it("exports collision, NPC, trigger and state-witness commands to the native contract", () => {
    const contract = buildEngineExportProjectContract(buildFunctionalRuntimeCanaryProject());
    const room = contract.topdown_project?.rooms?.find((item) => item.name === "canary_gameplay");
    const collisionLab = contract.topdown_project?.rooms?.find((item) => item.name === "room_2");
    const commands = room?.on_enter?.map((command) => command.op) ?? [];

    expect(new Set(room?.collision_types)).toEqual(new Set(ROOM_COLLISION_TYPES));
    expect(room?.visual_tiles?.[336]).not.toBe(142);
    expect(room?.foreground_tiles?.[336]).toBe(142);
    expect(room?.foreground_tiles?.[0]).toBe(-1);
    expect(room?.npcs).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "NPC_Canary" })
    ]));
    expect(room?.triggers?.length).toBeGreaterThanOrEqual(2);
    expect(room?.triggers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        area: expect.objectContaining({ x: 128, y: 80 }),
        on_enter: expect.arrayContaining([expect.objectContaining({ op: "add_variable" })]),
        on_leave: expect.arrayContaining([expect.objectContaining({ op: "set_variable" })])
      })
    ]));
    expect(commands).toEqual(expect.arrayContaining([
      "run_audio_routine",
      "play_pcm_sfx",
      "set_variable",
      "add_variable",
      "set_actor_direction",
      "set_actor_animation",
      "set_actor_visible"
    ]));
    expect(collisionLab?.on_interact).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: "warp", room: 1, x: 32, y: 80 })
    ]));
    expect(collisionLab?.collision_slopes?.[318]).toBe(4);
    expect(collisionLab?.collision_slopes?.[320]).toBe(2);
  });
});
