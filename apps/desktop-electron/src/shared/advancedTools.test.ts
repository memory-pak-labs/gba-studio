import { describe, expect, it } from "vitest";
import {
  addAdvancedToolResourceInProject,
  applyAutotileTerrainInProject,
  compileAdvancedToolsForExport,
  deriveAdvancedToolsPresentation,
  enableAdvancedToolInProject,
  installGameplayComponentInProject,
  projectWithCompiledAdvancedTools,
  removeAdvancedToolResourceInProject,
  saveInputReplayInProject,
  updateAdvancedToolResourceInProject
} from "./advancedTools.js";

describe("advanced tools hub", () => {
  const project = {
    name: "Tools",
    rooms: [
      { id: "start", name: "start", width: 3, height: 3, tilemap: Array(9).fill(0) },
      { id: "end", name: "end", width: 3, height: 3, tilemap: Array(9).fill(0) }
    ],
    settings: { general: { startScene: "start" } },
    editorState: { scenaConnections: [{ from: "start", to: "end" }] },
    events: []
  };

  it("summarizes every optional production tool and the conditional scene flow", () => {
    const presentation = deriveAdvancedToolsPresentation(project);

    expect(presentation.tools).toHaveLength(13);
    expect(presentation.flow.reachableScenes).toEqual(["end", "start"]);
    expect(presentation.summary.enabled).toBe(0);
  });

  it("enables a tool with a usable current-schema resource", () => {
    const next = enableAdvancedToolInProject(project, "particles");

    expect(next).toMatchObject({
      advancedTools: {
        particleEmitters: [
          expect.objectContaining({ id: "emitter-1", preset: "dust", maxParticles: 12 })
        ]
      }
    });
    expect(deriveAdvancedToolsPresentation(next).tools.find((tool) => tool.id === "particles")?.enabled).toBe(true);
  });

  it("applies a deterministic 4-neighbor autotile mask to selected terrain", () => {
    const next = applyAutotileTerrainInProject(project, "start", [1, 3, 4, 5, 7], 32);
    const room = (next.rooms as Array<{ tilemap: number[] }>)[0];

    expect(room.tilemap[4]).toBe(32 + 15);
    expect(room.tilemap[1]).toBe(32 + 4);
    expect(room.tilemap[0]).toBe(0);
  });

  it("installs gameplay components as native event resources", () => {
    const next = installGameplayComponentInProject(project, "checkpoint");

    expect(next.events).toEqual([
      expect.objectContaining({
        name: "component_checkpoint_activate",
        steps: expect.arrayContaining([
          { command: "store_engine_field current_room checkpoint.room" },
          { command: "save_game 0" }
        ])
      })
    ]);
  });

  it("stores a completed deterministic replay in the project", () => {
    const next = saveInputReplayInProject(project, {
      schema: 1,
      id: "run-1",
      seed: 42,
      initialSaveSlot: null,
      initialVariables: {},
      initialInventory: {},
      runs: [{ frame: { held: ["A"], pressed: ["A"] }, frames: 1 }],
      checkpoints: {},
      frameCount: 1
    });
    expect(next.advancedTools).toMatchObject({
      inputReplays: [expect.objectContaining({ id: "run-1", seed: 42, frameCount: 1 })]
    });
  });

  it("edits, adds and removes advanced resources without exposing raw JSON", () => {
    const enabled = enableAdvancedToolInProject(project, "particles");
    const edited = updateAdvancedToolResourceInProject(enabled, "particleEmitters", "emitter-1", {
      name: "Chuva fina",
      preset: "rain",
      maxParticles: 24
    });
    const added = addAdvancedToolResourceInProject(edited, "particleEmitters", {
      id: "emitter-2",
      name: "Faíscas",
      preset: "sparks",
      maxParticles: 8,
      maxPerScanline: 4,
      lifetimeFrames: 12
    });
    const removed = removeAdvancedToolResourceInProject(added, "particleEmitters", "emitter-1");

    expect(removed.advancedTools).toMatchObject({
      particleEmitters: [
        expect.objectContaining({ id: "emitter-2", name: "Faíscas", maxParticles: 8 })
      ]
    });
  });

  it("compiles advanced resources into ROM-facing data and native event procedures", () => {
    const compiled = compileAdvancedToolsForExport({
      ...project,
      advancedTools: {
        inputReplays: [{
          schema: 1,
          id: "route-1",
          seed: 7,
          initialSaveSlot: 1,
          initialVariables: { quest: 1 },
          initialInventory: { key: 1 },
          runs: [{ frame: { held: ["RIGHT"], pressed: [] }, frames: 4 }],
          checkpoints: {},
          frameCount: 4
        }],
        saveLabSnapshots: [{
          id: "save-boss",
          name: "Antes do chefe",
          slot: 2,
          variables: { boss: 0 },
          inventory: { potion: 3 },
          corruption: "none"
        }],
        actorStateMachines: [{
          id: "slime",
          name: "Slime",
          initialState: "idle",
          states: [{ id: "idle", onEnter: ["wait 1"] }, { id: "attack", onUpdate: ["move_actor Player 1 0"] }],
          transitions: [{ from: "idle", to: "attack", condition: "if_variable aggro == 1" }]
        }],
        cinematicTimelines: [{
          id: "intro",
          name: "Introdução",
          durationFrames: 120,
          tracks: [{ kind: "camera", keyframes: [{ frame: 30, command: "camera_move 2 0" }] }]
        }],
        effectSequences: [{
          id: "flash",
          name: "Flash",
          durationFrames: 20,
          tracks: [{ kind: "fade", keyframes: [{ frame: 0, value: 0 }, { frame: 20, value: 16 }] }]
        }],
        particleEmitters: [{
          id: "dust",
          name: "Poeira",
          preset: "dust",
          maxParticles: 16,
          maxPerScanline: 8,
          lifetimeFrames: 20
        }],
        fontProjects: [{
          id: "ui",
          name: "UI",
          glyphWidth: 8,
          glyphHeight: 8,
          variableWidth: true,
          glyphs: [{ character: "A", width: 7, pixels: "183c66667e666600" }],
          kerning: [{ left: "A", right: "V", amount: -1 }],
          fallbacks: { "pt-BR": "?" }
        }],
        localizationInterchanges: [{
          id: "locale-main",
          format: "csv",
          sourceLocale: "pt-BR",
          targetLocales: ["en"],
          entries: [{ id: "hello", values: { "pt-BR": "Olá", en: "Hello" } }]
        }],
        gameplayComponents: [{ id: "components", installed: ["checkpoint", "inventory"] }]
      }
    });

    expect(compiled.contract).toMatchObject({
      schema: 1,
      replays: [expect.objectContaining({ id: "route-1", frame_count: 4 })],
      save_snapshots: [expect.objectContaining({ id: "save-boss", slot: 2 })],
      state_machines: [expect.objectContaining({ id: "slime", initial_state: "idle" })],
      particles: [expect.objectContaining({ id: "dust", max_particles: 16 })],
      fonts: [expect.objectContaining({ id: "ui", glyph_count: 1 })],
      localization: [expect.objectContaining({ id: "locale-main", entry_count: 1 })]
    });
    expect(compiled.events.map((event) => event.name)).toEqual(expect.arrayContaining([
      "state_slime_idle",
      "state_slime_attack",
      "timeline_intro",
      "effects_flash"
    ]));
  });

  it("mantém máquinas de estado fora do export até a capability da cena ser habilitada", () => {
    const withoutOptIn = projectWithCompiledAdvancedTools({
      ...project,
      advancedTools: {
        actorStateMachines: [{
          id: "enemy",
          initialState: "idle",
          states: [{ id: "idle" }],
          transitions: []
        }]
      }
    });
    expect(withoutOptIn.compiled.contract.state_machines).toEqual([]);
    expect(withoutOptIn.compiled.events).toEqual([]);

    const withOptIn = projectWithCompiledAdvancedTools({
      ...project,
      scenas: [{
        id: "start",
        name: "start",
        sceneType: "topdown",
        runtime: {
          type: "topdown",
          config: { capabilities: [{ id: "animation_state_machine", enabled: true, settings: {} }] }
        }
      }],
      advancedTools: {
        actorStateMachines: [{
          id: "enemy",
          initialState: "idle",
          states: [{ id: "idle" }],
          transitions: []
        }]
      }
    });
    expect(withOptIn.compiled.contract.state_machines).toEqual([
      expect.objectContaining({ id: "enemy" })
    ]);
    expect(withOptIn.compiled.events.map((event) => event.name)).toContain("state_enemy_idle");
  });
});
