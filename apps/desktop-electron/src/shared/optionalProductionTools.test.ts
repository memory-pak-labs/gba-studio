import { describe, expect, it } from "vitest";
import {
  budgetParticleEmitter,
  compileActorStateMachine,
  compileCinematicTimeline,
  compileGraphicEffectSequence,
  corruptSaveLabSnapshot,
  duplicateSaveLabSnapshot,
  simulateLinkCableSession,
  validatePluginDevelopmentManifest
} from "./optionalProductionTools.js";

describe("optional production tools", () => {
  it("clamps particle emitters to reserved OAM and scanline budgets", () => {
    expect(budgetParticleEmitter({ maxParticles: 200, maxPerScanline: 40 }, { reservedOam: 100, reservedPerScanline: 112 }))
      .toMatchObject({ maxParticles: 28, maxPerScanline: 16, clamped: true });
  });

  it("compiles actor state machines into native event procedures", () => {
    const events = compileActorStateMachine({
      id: "slime",
      initialState: "patrol",
      states: [
        { id: "patrol", onEnter: ["set_actor_animation slime walk"] },
        { id: "attack", onEnter: ["play_actor_animation slime attack"] }
      ],
      transitions: [{ from: "patrol", to: "attack", condition: "if_variable player_near 1" }]
    });
    expect(events.map((event) => event.name)).toContain("state_slime_patrol");
    expect(events.find((event) => event.name === "state_slime_patrol")?.steps).toEqual([
      { command: "set_actor_animation slime walk" },
      { command: "if_variable player_near 1" },
      { command: "call_event state_slime_attack" }
    ]);
  });

  it("liga estado, animação, conclusão e transição a eventos quando declarados", () => {
    const events = compileActorStateMachine({
      id: "boss",
      actor: "Guardian",
      initialState: "idle",
      states: [{
        id: "idle",
        animation: "breathing",
        onAnimationComplete: ["boss_idle_done"]
      }, { id: "attack", animation: "slash" }],
      transitions: [{ from: "idle", to: "attack", condition: "always", event: "boss_attack" }]
    });

    expect(events.find((event) => event.name === "state_boss_idle")?.steps).toEqual([
      { command: "set_actor_animation Guardian breathing" },
      { command: "call_event boss_attack" },
      { command: "call_event boss_idle_done" }
    ]);
    expect(events.find((event) => event.name === "state_boss_attack")?.steps).toEqual([
      { command: "set_actor_animation Guardian slash" }
    ]);
  });

  it("sorts cinematic and graphic effect keyframes deterministically", () => {
    expect(compileCinematicTimeline({
      id: "intro",
      tracks: [{ kind: "camera", keyframes: [{ frame: 20, command: "camera_pan 20 10" }, { frame: 0, command: "fade_in 10" }] }]
    })).toEqual([
      { frame: 0, track: "camera", command: "fade_in 10" },
      { frame: 20, track: "camera", command: "camera_pan 20 10" }
    ]);
    expect(compileGraphicEffectSequence({
      id: "storm",
      tracks: [{ kind: "mosaic", keyframes: [{ frame: 4, value: 2 }] }]
    })[0].command).toBe("visual_effect mosaic all 30 2");
  });

  it("duplicates and corrupts save snapshots without mutating the source", () => {
    const source = { id: "save-1", name: "Boss", slot: 1, variables: { hp: 10 }, inventory: { key: 1 }, checksum: 44 };
    const duplicate = duplicateSaveLabSnapshot(source, "save-2", "Boss copy");
    const corrupted = corruptSaveLabSnapshot(source, "checksum");
    expect(duplicate).toMatchObject({ id: "save-2", name: "Boss copy", variables: { hp: 10 } });
    expect(corrupted.checksum).toBe(45);
    expect(source.checksum).toBe(44);
  });

  it("simulates Link Cable delivery, latency and timeout", () => {
    const result = simulateLinkCableSession({
      players: 2,
      latencyFrames: 2,
      timeoutFrames: 4,
      transfers: [
        { frame: 1, from: 0, to: 1, value: 7 },
        { frame: 1, from: 1, to: 0, value: 9, dropped: true }
      ]
    });
    expect(result.delivered[0]).toMatchObject({ deliveredFrame: 3, value: 7 });
    expect(result.timeouts[0]).toMatchObject({ timeoutFrame: 5, value: 9 });
  });

  it("validates plugin permissions and development entrypoints", () => {
    expect(validatePluginDevelopmentManifest({
      id: "weather",
      version: "1.0.0",
      developmentEntry: "src/index.ts",
      permissions: ["project.read", "network.any"]
    })).toEqual({
      ok: false,
      errors: ["Permissao nao declaravel: network.any"],
      warnings: []
    });
  });
});
