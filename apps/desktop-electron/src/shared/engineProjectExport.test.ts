import { describe, expect, it } from "vitest";
import { deriveAudioEngineExportDiagnostics, generateEngineProjectExport, buildAssetcAudioPackGeneration, buildActorEngineSpriteExport, buildLutaActorEngineSpriteExport, buildAssetcSpritePackGeneration, buildAssetcTilesetPackGeneration, buildAssetcPaletteFamilyPackGeneration, buildAssetcPortraitPackGeneration, buildAssetcEmotePackGeneration, buildDialoguePortraitAssetsExport, buildDialogueEmoteAssetsExport, compileComposedMusicaToTracker, compileComposedSfxToAssetc, computeAssetcMetaspriteIndex, sortTopdownSpriteAnimationsForExport } from "./engineProjectExport.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import type { GBAProjectData } from "./projectFile.js";
import { verifyTopdownWalk4DirsExportContract } from "../../scripts/lib/native-visual-rom-contracts.mjs";

function exportableProject(overrides: GBAProjectData): GBAProjectData {
  const baseSettings = {
    general: {
      gameTitle: "Export Test",
      startScene: "start",
      startSceneType: "topdown",
      exportFolder: "build"
    },
    build: {
      romFileName: "export_test.gba",
      exportFormat: "gba_rom",
      engineBackend: "gbastudio_engine",
      enginePackPath: "/opt/GBAStudioEnginePack"
    },
    preview: {
      defaultMode: "quick_preview",
      scale: 3,
      runAfterBuild: false
    },
    audio: {
      audioEngine: "gbastudio_engine_audio",
      audioMode: "chiptune_pcm",
      masterVolume: 100
    },
    save: {
      saveType: "sram",
      slots: 3,
      autoSave: true
    },
    transitions: {
      style: "cut",
      durationFrames: 30,
      fadeOut: true,
      fadeIn: true
    },
    debug: {
      developerMode: false,
      preserveTempFiles: false,
      exportReadableButanoProject: false
    }
  };
  const overrideSettings = overrides.settings && typeof overrides.settings === "object" && !Array.isArray(overrides.settings)
    ? (overrides.settings as Record<string, unknown>)
    : {};

  return {
    assets: [],
    assetGroups: [],
    scenas: [{ name: "start", width: 20, height: 18 }],
    animations: [],
    animationStates: [],
    spriteReferenceImages: [],
    audioItems: [],
    events: [],
    ...overrides,
    settings: {
      ...baseSettings,
      ...overrideSettings,
      general: { ...baseSettings.general, ...(overrideSettings.general as Record<string, unknown> | undefined) },
      build: { ...baseSettings.build, ...(overrideSettings.build as Record<string, unknown> | undefined) },
      preview: { ...baseSettings.preview, ...(overrideSettings.preview as Record<string, unknown> | undefined) },
      audio: { ...baseSettings.audio, ...(overrideSettings.audio as Record<string, unknown> | undefined) },
      save: { ...baseSettings.save, ...(overrideSettings.save as Record<string, unknown> | undefined) },
      transitions: { ...baseSettings.transitions, ...(overrideSettings.transitions as Record<string, unknown> | undefined) },
      debug: { ...baseSettings.debug, ...(overrideSettings.debug as Record<string, unknown> | undefined) }
    }
  };
}

describe("Engine project export", () => {
  it("exports only referenced palette families and ignores stale authoring records", () => {
    const data = exportableProject({
      paletteFamilies: [
        { id: "used", name: "Usada", background: [0, 31], objects: [0, 992] },
        { id: "orphan", name: "Órfã", background: [31744], objects: [31744] }
      ],
      scenas: [{ name: "start", width: 20, height: 18, paletteFamilyID: "used" }]
    });

    const pack = buildAssetcPaletteFamilyPackGeneration(data);

    expect(pack?.families.map((family) => family.id)).toEqual(["used"]);
    expect(pack?.assetNames).toEqual([
      "palette_family_used_background",
      "palette_family_used_objects"
    ]);
  });

  it("materializa capacidades universais no manifesto e no header consumido pelo runtime", () => {
    const exported = generateEngineProjectExport(exportableProject({
      settings: {
        backgrounds: { graphicsMode: "Mode 2 - Affine" },
        runtimeCapabilities: {
          rtc: { enabled: true },
          link: { enabled: false },
          affine: { enabled: true }
        }
      }
    }));
    const manifest = JSON.parse(exported.files.find((file) => file.path === "gbastudio_project.json")?.contents ?? "{}") as Record<string, unknown>;
    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";

    expect(manifest.runtime_capabilities).toMatchObject({
      registry: "gba-studio-runtime-capabilities",
      capabilities: [
        { id: "save", enabled: true },
        { id: "rtc", enabled: true },
        { id: "link", enabled: false },
        { id: "affine", enabled: true }
      ]
    });
    expect(header).toContain("#include \"gbs/runtime_capabilities.hpp\"");
    expect(header).toContain("gbs::RuntimeCapabilityID::Rtc");
    expect(header).toContain("gbs::RuntimeCapabilityID::Affine");
  });

  it("exporta uma apresentacao Affine opcional no contrato da sala e no asset pack", () => {
    const contract = buildEngineExportProjectContract(exportableProject({
      assets: [{
        id: "affine-lab",
        name: "affine-lab.png",
        kind: "Background",
        metadata: {
          affineTileOptimizer: { enabled: true, tileBudget: 256 },
          colorMode: "8bpp-affine",
          kind: "affine_bg"
        }
      }],
      scenas: [{
        name: "start",
        width: 20,
        height: 18,
        runtime: {
          type: "topdown",
          config: {
            affine: {
              enabled: true,
              assetId: "affine-lab",
              layer: "BG3",
              scaleX: 1.5,
              scaleY: 0.75,
              rotationDegrees: 90,
              pivotX: 120,
              pivotY: 80,
              wrap: false
            }
          }
        }
      }]
    }));

    expect(contract.topdown_project?.rooms[0]?.video).toMatchObject({
      display_mode: 2,
      affine: expect.objectContaining({
        asset: "affine_lab",
        layer: "BG3",
        wrap: false
      })
    });
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "affine_lab",
        kind: "affine_bg",
        bank_group: "scene_start"
      })
    ]));
    expect(contract.requires.features).toContain("render.video_composition");
  });

  it("mantem o video de sala desligado quando Affine nao esta configurado", () => {
    const contract = buildEngineExportProjectContract(exportableProject({
      scenas: [{
        name: "start",
        width: 20,
        height: 18,
        runtime: { type: "topdown", config: {} }
      }]
    }));

    expect(contract.topdown_project?.rooms[0]?.video).toEqual({
      display_mode: 0,
      affine: null,
      bitmap: null
    });
    expect(contract.asset_pack?.assets ?? []).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "affine_bg" })
    ]));
  });

  it("exports selected RGB555 palette families as native asset-pack resources", () => {
    const contract = buildEngineExportProjectContract(exportableProject({
      paletteFamilies: [{
        id: "harbor-day",
        name: "Porto diurno",
        background: [0, 31, 992, 31744],
        objects: [0, 31, 992, 31744]
      }],
      scenas: [{
        name: "start",
        width: 20,
        height: 18,
        paletteFamilyID: "harbor-day"
      }]
    }));

    expect(contract.runtime_contract.rooms[0]).toMatchObject({
      name: "start",
      palette_family_id: "harbor-day"
    });
    expect(contract.palette_families).toEqual([expect.objectContaining({
      id: "harbor-day",
      name: "Porto diurno",
      background_asset: "palette_family_harbor_day_background",
      objects_asset: "palette_family_harbor_day_objects"
    })]);
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "palette-family-harbor-day-background",
        kind: "palette",
        palette_slot: "background",
        palette_values: [0, 31, 992, 31744]
      }),
      expect.objectContaining({
        id: "palette-family-harbor-day-objects",
        kind: "palette",
        palette_slot: "objects",
        palette_values: [0, 31, 992, 31744]
      })
    ]));
    expect(contract.requires.features).toContain("palette_families.rgb555");
  });

  it("applies an unambiguous scene palette family to its background and actors", () => {
    const data = exportableProject({
      paletteFamilies: [{
        id: "harbor-day",
        name: "Porto diurno",
        background: [0, 31],
        objects: [0, 992]
      }],
      assets: [
        { id: "bg-harbor", name: "harbor.png", kind: "Background" },
        { id: "actor-harbor", name: "player.png", kind: "Sprite" }
      ],
      scenas: [{
        name: "start",
        width: 20,
        height: 18,
        backgroundAssetName: "harbor.png",
        paletteFamilyID: "harbor-day"
      }],
      actors: [{
        id: "player",
        name: "Player",
        roomName: "start",
        spriteSheet: "player.png"
      }]
    });

    expect(buildAssetcTilesetPackGeneration(data)?.assetsBySheet["harbor.png"]).toMatchObject({
      background_palette_reference_colors: [[0, 0, 0], [248, 0, 0]]
    });
    expect(buildAssetcSpritePackGeneration(data)?.assetsBySheet["player.png"]).toMatchObject({
      object_palette_values: [0, 992]
    });
  });

  it("preserves an exact authored background palette plan in the assetc pack", () => {
    const plan = {
      banks: [[null, [0, 0, 0], [248, 0, 0]]],
      tile_palette_banks: [0]
    };
    const data = exportableProject({
      assets: [{
        id: "bg-harbor",
        name: "harbor.png",
        kind: "Background",
        metadata: {
          source: "Assets/backgrounds/harbor.png",
          colorMode: "4bpp",
          backgroundPaletteReferencePlan: plan
        }
      }],
      scenas: [{
        name: "start",
        width: 20,
        height: 18,
        backgroundAssetName: "harbor.png"
      }]
    });

    expect(buildAssetcTilesetPackGeneration(data)?.assetsBySheet["harbor.png"]).toMatchObject({
      background_palette_reference_plan: plan
    });
  });

  it("compiles a variable scene route table into guarded native transitions", () => {
    const contract = buildEngineExportProjectContract(exportableProject({
      scenas: [
        { name: "start", width: 20, height: 18 },
        { name: "porto", width: 20, height: 18 },
        { name: "penedos", width: 20, height: 18 }
      ],
      variables: [{ name: "route", initialValue: 1 }],
      sceneRouteTables: [{
        id: "route-table",
        name: "Rotas do mapa",
        variable: "route",
        routes: [
          { value: 0, scene: "porto", x: 2, y: 3, direction: "down", fadeFrames: 0 },
          { value: 1, scene: "penedos", x: 4, y: 5, direction: "right", fadeFrames: 8 }
        ],
        fallback: { scene: "start", x: 1, y: 1, direction: "up", fadeFrames: 0 }
      }],
      events: [{
        name: "choose_route",
        category: "Cena",
        command: "change_scene_by_variable route-table"
      }]
    }));

    const script = contract.topdown_project?.scripts.find((entry) => entry.name === "choose_route")?.script ?? [];
    expect(script).toEqual(expect.arrayContaining([
      expect.objectContaining({ op: "jump_if_variable_equals", value: 1 }),
      { op: "fade_out", frames: 8 },
      { op: "wait", frames: 8 },
      { op: "set_player_direction", direction: "right" },
      { op: "warp", room: 2, x: 32, y: 40 },
      { op: "fade_in", frames: 8 }
    ]));
    expect(script[1]).toEqual({ op: "jump", offset: 4 });
    expect(script.some((command) => command.op === "warp" && command.room === 1)).toBe(true);
    expect(script.some((command) => command.op === "warp" && command.room === 0)).toBe(true);
  });

  it("wraps exported scene portals with the transition configured on the connection", () => {
    const contract = buildEngineExportProjectContract(exportableProject({
      scenas: [
        { name: "start", width: 20, height: 18 },
        { name: "shop", width: 20, height: 18 }
      ],
      editorState: {
        scenaConnections: [{
          from: "start",
          to: "shop",
          transition: { style: "fade", durationFrames: 12, fadeOut: true, fadeIn: true }
        }]
      }
    }));

    const portal = contract.topdown_project?.rooms.find((room) => room.name === "start")?.portals?.[0];

    expect(portal?.script).toEqual([
      { op: "visual_effect", effect: "fade", layer: "all", frames: 12, intensity: 100, phase: "cover" },
      { op: "wait", frames: 12 },
      { op: "warp", room: 1, x: 8, y: 72 },
      { op: "visual_effect", effect: "fade", layer: "all", frames: 12, intensity: 100, phase: "reveal" }
    ]);
  });

  it("uses the project transition default for portals without a connection override", () => {
    const contract = buildEngineExportProjectContract(exportableProject({
      scenas: [
        { name: "start", width: 20, height: 18 },
        { name: "shop", width: 20, height: 18 }
      ],
      settings: {
        transitions: { style: "wipe", durationFrames: 9, fadeOut: true, fadeIn: false }
      },
      editorState: {
        scenaConnections: [{ from: "start", to: "shop" }]
      }
    }));

    const portal = contract.topdown_project?.rooms.find((room) => room.name === "start")?.portals?.[0];

    expect(portal?.script).toEqual([
      { op: "visual_effect", effect: "mask", layer: "all", frames: 9, intensity: 100, phase: "cover" },
      { op: "wait", frames: 9 },
      { op: "warp", room: 1, x: 8, y: 72 }
    ]);
  });

  it("rejects projects that fail the shared migration contract before generating Engine Pack files", () => {
    expect(() => generateEngineProjectExport({
      assets: [{ id: "", name: "missing.png", kind: "Sprite" }],
      scenas: [{ name: "start", width: 10, height: 8 }],
      events: [{ name: "bad", category: "Cena", command: "change_scene missing" }],
      settings: {}
    })).toThrow(/Contrato de migracao invalido: workspace, files, events, settings/);
  });

  it("rejects Engine Pack exports when gbastudio_engine has no enginePackPath configured", () => {
    expect(() => generateEngineProjectExport(exportableProject({
      settings: {
        build: {
          enginePackPath: ""
        }
      }
    }))).toThrow(/Contrato de migracao invalido: settings/);
  });

  it("rejects projects with broken room connections before generating Engine Pack files", () => {
    expect(() => generateEngineProjectExport(exportableProject({
      scenas: [
        { name: "start", width: 20, height: 18 },
        { name: "shop", width: 20, height: 18 }
      ],
      editorState: {
        scenaConnections: [
          { from: "start", to: "missing", eventName: "door" },
          { from: "shop", to: "shop", eventName: "loop" }
        ]
      }
    }))).toThrow(/Contrato de migracao invalido: roomConnections/);
  });

  it("rejects projects with broken room references before generating Engine Pack files", () => {
    expect(() => generateEngineProjectExport(exportableProject({
      scenas: [
        {
          name: "start",
          width: 20,
          height: 18,
          music: "missing.mod",
          backgroundAssetName: "missing_tiles.png",
          playerActorName: "Ghost"
        }
      ]
    }))).toThrow(/Contrato de migracao invalido: roomReferences/);
  });

  it("rejects projects with event commands that reference missing events", () => {
    expect(() => generateEngineProjectExport(exportableProject({
      events: [
        {
          name: "start_event",
          category: "Controle",
          command: "call_event missing_event"
        }
      ]
    }))).toThrow(/Contrato de migracao invalido: events/);
  });

  it("rejects projects with event commands that reference missing dialogues", () => {
    expect(() => generateEngineProjectExport(exportableProject({
      events: [
        {
          name: "dialogue_event",
          category: "Dialogo",
          command: "show_dialogue missing_dialogue"
        }
      ]
    }))).toThrow(/Contrato de migracao invalido: events/);
  });

  it("rejects projects with event bindings that reference missing events", () => {
    expect(() => generateEngineProjectExport(exportableProject({
      actors: [
        {
          id: "actor-player",
          name: "Player",
          roomName: "start",
          eventName: "missing_actor_event"
        }
      ],
      events: [
        { name: "room_boot", category: "Cena", command: "noop" }
      ]
    }))).toThrow(/Contrato de migracao invalido: eventBindings/);
  });

  it("ignores legacy single room fields and exports only current room arrays", () => {
    const exported = generateEngineProjectExport(exportableProject({
      scenas: [],
      rooms: [],
      scena: { name: "legacy_room", width: 10, height: 8 },
      room: { name: "legacy_room_alias", width: 12, height: 9 }
    }));
    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    const readme = exported.files.find((file) => file.path === "README.md")?.contents ?? "";

    expect(header).toContain("room_count = 0");
    expect(header).not.toContain("legacy_room");
    expect(header).not.toContain("legacy_room_alias");
    expect(readme).toContain("- Rooms: 0");
  });

  it("generates the minimum Engine Pack project files from a .gba-project", () => {
    const exported = generateEngineProjectExport(exportableProject({
      name: "Topdown Demo",
      settings: {
        general: {
          gameTitle: "Topdown Demo",
          startScene: "overworld_start",
          startSceneType: "topdown"
        },
        build: {
          romFileName: "topdown_demo.gba"
        }
      },
      scenas: [
        { name: "overworld_start", width: 30, height: 20, music: "intro_theme.mod" },
        { name: "shop", width: 20, height: 18, music: "" }
      ],
      events: [{ name: "room_boot", category: "Cena", command: "noop" }, { name: "npc_shop", category: "Dialogo", command: "noop" }],
      audioItems: [{ name: "intro_theme.mod", kind: "Musica" }],
      assets: [{ id: "asset-player", name: "player_idle.png", kind: "Sprite" }]
    }));

    expect(exported.target).toBe("topdown_demo");
    expect(exported.files.map((file) => file.path).sort()).toEqual([
      "README.md",
      "gbastudio_project.json",
      "gbastudio_project_data.hpp",
      "main.cpp"
    ]);

    const manifest = JSON.parse(exported.files.find((file) => file.path === "gbastudio_project.json")?.contents ?? "{}") as Record<string, unknown>;
    expect(manifest).toMatchObject({
      schema: 1,
      backend: "gbastudio_engine",
      kind: "topdown",
      build: { target: "topdown_demo", make_target: "all" },
      entry: "main.cpp",
      project_data: "gbastudio_project_data.hpp"
    });
    expect(manifest.generated_assets).toEqual([]);
    expect(manifest.requires).toMatchObject({
      engine_pack: ">=0.36.0",
      features: ["topdown_project_data", "dialogue", "audio"]
    });

    expect(exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents).toContain("room_count = 2");
    expect(exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents).toContain("event_count = 2");
    expect(exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents).toContain("audio_count = 1");
    const main = exported.files.find((file) => file.path === "main.cpp")?.contents ?? "";
    expect(main).toContain("#include \"gbastudio_project_data.hpp\"");
    expect(main).toContain("gbs::wait_vblank();");
    expect(main).toContain("#include \"gbs/debug.hpp\"");
    expect(main).toContain("struct RuntimeWitnessState");
    expect(main).toContain("gbs::debug_set_counter(0, \"phase\", runtime_witness.phase);");
    expect(main).toContain("gbs::debug_set_counter(1, \"room\", runtime_witness.current_room + 1);");
    expect(main).toContain("gbs::debug_set_counter(9, \"ok\", runtime_witness.ok ? 1u : 0u);");
    expect(main).toContain("gbs::draw_debug_overlay(true);");
  });

  it("generates a runtime witness loop that exposes the P0 gameplay flow in the ROM overlay", () => {
    const exported = generateEngineProjectExport(exportableProject({
      name: "Witness Demo",
      settings: {
        general: {
          gameTitle: "Witness Demo",
          startScene: "room_1",
          startSceneType: "topdown"
        },
        build: {
          romFileName: "witness_demo.gba"
        }
      },
      scenas: [
        { id: "room-1", name: "room_1", width: 30, height: 20, eventBindings: { onInit: "room_boot" } },
        { id: "room-2", name: "room_2", width: 30, height: 20 }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "room_1", x: 15, y: 10, eventName: "player_start" }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "room_1", x: 28, y: 10, width: 2, height: 2, eventName: "door_to_room_2" }
      ],
      dialogues: [
        { key: "intro_001", character: "Ana", text: "Teste", choices: ["Sim"] }
      ],
      audioItems: [
        { id: "audio-theme", name: "theme.mod", kind: "Musica", exportID: "theme" }
      ],
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          steps: [
            { command: "play_music theme.mod" },
            { command: "show_dialogue intro_001" },
            { command: "set_variable story.started 1" }
          ]
        },
        { id: "event-player", name: "player_start", category: "Ator", command: "show_dialogue intro_001" },
        { id: "event-door", name: "door_to_room_2", category: "Trigger", command: "change_scene room_2" }
      ]
    }));

    const main = exported.files.find((file) => file.path === "main.cpp")?.contents ?? "";

    expect(main).toContain("struct RuntimeWitnessState");
    expect(main).toContain("void advance_runtime_witness()");
    expect(main).toContain("gbastudio_project::EventCommandOpcode::ShowDialogue");
    expect(main).toContain("gbastudio_project::EventCommandOpcode::ChangeScene");
    expect(main).toContain("gbs::runtime_read_rtc_datetime");
    expect(main).toContain("gbs::debug_set_counter(0, \"phase\", runtime_witness.phase);");
    expect(main).toContain("gbs::debug_set_counter(1, \"room\", runtime_witness.current_room + 1);");
    expect(main).toContain("gbs::debug_set_counter(6, \"change\", runtime_witness.change_room + 1);");
    expect(main).toContain("gbs::debug_set_counter(7, \"audio\", runtime_witness.audio);");
    expect(main).toContain("gbs::debug_set_counter(8, \"state\", runtime_witness.state);");
    expect(main).toContain("gbs::debug_set_counter(9, \"ok\", runtime_witness.ok ? 1u : 0u);");
  });

  it("generates a playable topdown P0 loop with input, collision, dialogue and trigger scene changes", () => {
    const exported = generateEngineProjectExport(exportableProject({
      name: "Playable P0",
      settings: {
        general: {
          gameTitle: "Playable P0",
          startScene: "room_1",
          startSceneType: "topdown"
        },
        build: {
          romFileName: "playable_p0.gba"
        }
      },
      scenas: [
        {
          id: "room-1",
          name: "room_1",
          width: 30,
          height: 20,
          collisionTypes: Array.from({ length: 30 * 20 }, () => "free"),
          eventBindings: { onInit: "room_boot" }
        },
        { id: "room-2", name: "room_2", width: 30, height: 20 }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "room_1", x: 15, y: 10, eventName: "player_start" }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "room_1", x: 16, y: 10, width: 2, height: 2, eventName: "door_to_room_2" }
      ],
      dialogues: [
        { key: "intro_001", character: "Ana", text: "Teste", choices: ["Sim"] }
      ],
      events: [
        { id: "event-room", name: "room_boot", category: "Cena", command: "show_dialogue intro_001" },
        { id: "event-player", name: "player_start", category: "Ator", command: "show_dialogue intro_001" },
        { id: "event-door", name: "door_to_room_2", category: "Trigger", command: "change_scene room_2" }
      ]
    }));

    const main = exported.files.find((file) => file.path === "main.cpp")?.contents ?? "";

    expect(main).toContain("#include \"gbs/dialogue.hpp\"");
    expect(main).toContain("#include \"gbs/input.hpp\"");
    expect(main).toContain("#include \"gbs/render.hpp\"");
    expect(main).toContain("struct PlayableRuntimeState");
    expect(main).toContain("gbs::InputState input = gbs::poll_input();");
    expect(main).toContain("bool is_blocked_tile(int room_index, int x, int y)");
    expect(main).toContain("void try_move_player(int dx, int dy)");
    expect(main).toContain("void run_event_step(const gbastudio_project::EventStepData& step)");
    expect(main).toContain("void handle_trigger_overlap()");
    expect(main).toContain("change_room(step.target_index, step.arg0, step.arg1);");
    expect(main).toContain("struct RuntimeNamedNumber");
    expect(main).toContain("RuntimeNamedNumber runtime_variables[max_runtime_variables];");
    expect(main).toContain("RuntimeNamedNumber runtime_flags[max_runtime_flags];");
    expect(main).toContain("RuntimeNamedNumber runtime_inventory[max_runtime_inventory];");
    expect(main).toContain("RuntimeWallet runtime_wallets[max_runtime_wallets];");
    expect(main).toContain("RuntimeEquippedItem runtime_equipped_items[max_runtime_equipped_items];");
    expect(main).toContain("void set_runtime_variable(const char* key, int value)");
    expect(main).toContain("void set_runtime_flag(const char* key, int value)");
    expect(main).toContain("void add_runtime_inventory(const char* key, int amount)");
    expect(main).toContain("void modify_runtime_wallet(const char* key, int amount, int max_value)");
    expect(main).toContain("void set_runtime_equipped_item(int slot, const char* item)");
    expect(main).toContain("runtime.last_music_index = step.target_index;");
    expect(main).toContain("runtime.last_sfx_index = step.target_index;");
    expect(main).toContain("run_event_by_index(step.target_index);");
    expect(main).toContain("set_runtime_variable(step.operand, step.arg0);");
    expect(main).toContain("add_runtime_variable(step.operand, step.arg0);");
    expect(main).toContain("multiply_runtime_variable(step.operand, step.arg0);");
    expect(main).toContain("set_runtime_flag(step.operand, step.arg0);");
    expect(main).toContain("add_runtime_inventory(step.operand, step.arg0);");
    expect(main).toContain("modify_runtime_wallet(step.operand, step.arg0, step.arg1);");
    expect(main).toContain("set_runtime_equipped_item(step.arg0, equipped_item_from_operand(step.operand));");
    expect(main).toContain("runtime_witness.audio = runtime.audio_event_count;");
    expect(main).toContain("runtime_witness.state = runtime.state_mutation_count;");
    expect(main).toContain("runtime_witness.audio > 0 &&");
    expect(main).toContain("runtime_witness.state > 0 &&");
    expect(main).toContain("gbs::debug_set_counter(7, \"audio\", runtime_witness.audio);");
    expect(main).toContain("gbs::debug_set_counter(8, \"state\", runtime_witness.state);");
    expect(main).toContain("gbs::debug_set_counter(9, \"ok\", runtime_witness.ok ? 1u : 0u);");
    expect(main).toContain("runtime.player_visible = true;");
    expect(main).toContain("dialogue_line.actor_id = dialogue.actor_id;");
    expect(main).toContain("gbs::show_dialogue(dialogue_state, &dialogue_line, 1, 0);");
    expect(main).toContain("gbs::advance_dialogue(dialogue_state, input);");
    expect(main).toContain("gbs::draw_dialogue(dialogue_state);");
    expect(main).toContain("draw_playable_scene();");
    expect(main).toContain("constexpr int runtime_bg_width = 32;");
    expect(main).toContain("gbs::set_bg_tile(gbs::BackgroundLayer::BG2, x, y, runtime_bg_width, runtime_bg_height, tile);");
    expect(main).toContain("gbs::set_bg_priority(gbs::BackgroundLayer::BG0, 0);");
    expect(main).toContain("gbs::set_bg_priority(gbs::BackgroundLayer::BG1, 1);");
    expect(main).toContain("gbs::set_bg_priority(gbs::BackgroundLayer::BG2, 2);");
    expect(main).toContain("gbs::set_bg_priority(gbs::BackgroundLayer::BG3, 3);");
    expect(main).not.toContain("gbs::draw_room_to_bg0(runtime_room_tiles, room.width, room.height, 0, 0);");
    expect(main).toContain("void set_runtime_room_tile(int x, int y, uint16_t tile)");
    expect(main).toContain("set_runtime_room_tile(trigger.x + dx, trigger.y + dy, tile_runtime_trigger);");
    expect(main).toContain("set_runtime_room_tile(runtime.player_x, runtime.player_y, tile_runtime_player);");
    expect(main).toContain("bool debug_overlay_visible;");
    expect(main).toContain("runtime.debug_overlay_visible = !runtime.debug_overlay_visible;");
    expect(main).toContain("if (runtime.debug_overlay_visible) {");
    expect(main).toContain("draw_runtime_witness_overlay();");
    expect(main).toContain("gbs::draw_debug_overlay(false);");

    const playableSceneStart = main.indexOf("void draw_playable_scene()");
    const playableSceneEnd = main.indexOf("void advance_runtime_witness()", playableSceneStart);
    const playableScene = main.slice(playableSceneStart, playableSceneEnd);
    expect(playableScene).not.toContain("gbs::draw_dialogue(dialogue_state);");

    const debugOverlayIndex = main.indexOf("draw_runtime_witness_overlay();");
    const dialogueDrawIndex = main.indexOf("gbs::draw_dialogue(dialogue_state);", debugOverlayIndex);
    const vblankIndex = main.indexOf("gbs::wait_vblank();", dialogueDrawIndex);
    expect(dialogueDrawIndex).toBeGreaterThan(debugOverlayIndex);
    expect(vblankIndex).toBeGreaterThan(dialogueDrawIndex);
  });

  it("prepares dialogue text for the GBA runtime font and text box width", () => {
    const exported = generateEngineProjectExport(exportableProject({
      dialogues: [
        {
          actorId: "actor-player",
          key: "intro_001",
          character: "Ana",
          text: "A ROM está pronta, vamos testar a cena inicial agora!"
        }
      ],
      events: [
        { name: "room_boot", category: "Cena", command: "show_dialogue intro_001" }
      ]
    }));

    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";

    expect(header).toContain("{\"intro_001\", \"Ana\", \"\", \"actor-player\", \"A ROM ESTA PRONTA.\\nVAMOS TESTAR A CENA\\nINICIAL AGORA!\", 0, 0}");
  });

  it("exports structured project data arrays for the Engine Pack runtime bridge", () => {
    const exported = generateEngineProjectExport(exportableProject({
      name: "Runtime Bridge",
      settings: {
        general: {
          gameTitle: "Runtime Bridge",
          startScene: "overworld_start",
          startSceneType: "topdown"
        },
        build: {
          romFileName: "runtime_bridge.gba"
        }
      },
      assets: [
        { id: "asset-player", name: "player_idle.png", kind: "Sprite", metadata: { source: "Assets/sprites/player_idle.png" } },
        { id: "asset-tiles", name: "tiles_overworld.png", kind: "Tileset", metadata: { source: "Assets/tiles/tiles_overworld.png" } }
      ],
      scenas: [
        {
          id: "room-overworld",
          name: "overworld_start",
          width: 30,
          height: 20,
          sceneType: "topdown",
          music: "intro_theme.mod",
          backgroundAssetName: "tiles_overworld.png",
          playerActorName: "Player",
          tilemap: Array.from({ length: 600 }, (_value, index) => [1, 2, 3][index] ?? 0),
          collisionTypes: Array.from({ length: 600 }, (_value, index) => (index === 0 || index === 2 ? "solid" : "free")),
          eventBindings: { onInit: "room_boot" }
        }
      ],
      actors: [
        {
          id: "actor-player",
          name: "Player",
          roomName: "overworld_start",
          x: 12,
          y: 9,
          spriteSheet: "player_idle.png",
          animationName: "idle_down",
          eventName: "player_start",
          eventBindings: { onInteract: "npc_shop" }
        }
      ],
      animations: [
        {
          id: "anim-player-idle",
          name: "idle_down",
          spriteSheet: "player_idle.png",
          frameWidth: 16,
          frameHeight: 32
        }
      ],
      triggers: [
        {
          id: "trigger-door",
          name: "Shop Door",
          roomName: "overworld_start",
          x: 14,
          y: 10,
          width: 2,
          height: 1,
          eventName: "door_enter",
          onEnterEventName: "door_enter",
          onLeaveEventName: "door_leave"
        }
      ],
      dialogues: [
        {
          actorId: "actor-player",
          key: "intro_001",
          character: "Ana",
          portrait: "ana.png",
          text: "Ola, viajante!",
          choices: ["Vamos explorar", "Abrir inventario"]
        }
      ],
      audioItems: [
        { id: "audio-theme", name: "intro_theme.mod", kind: "Musica", format: "MOD", exportID: "intro_theme", loops: true, volume: 80 }
      ],
      events: [
        {
          id: "event-room",
          name: "room_boot",
          category: "Cena",
          detail: "Boot da sala",
          steps: [
            { command: "play_music intro_theme.mod" },
            { command: "show_dialogue intro_001", isEnabled: false }
          ]
        },
        { id: "event-player", name: "player_start", category: "Atores", command: "noop" },
        { id: "event-npc", name: "npc_shop", category: "Atores", command: "noop" },
        { id: "event-door-enter", name: "door_enter", category: "Triggers", command: "noop" },
        { id: "event-door-leave", name: "door_leave", category: "Triggers", command: "noop" }
      ]
    }));

    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";

    expect(header).toContain("struct RoomData");
    expect(header).toContain("constexpr RoomData rooms[room_storage_count]");
    expect(header).toContain("const char* background_layer;");
    expect(header).toContain("{\"room-overworld\", \"overworld_start\", 30, 20, \"topdown\", \"intro_theme.mod\", \"tiles_overworld.png\", \"BG2\", \"room_boot\", 0, 600, 0, 0, 0, 600}");
    expect(header).toContain("tile_cell_count = 600");
    expect(header).toContain("collision_cell_count = 600");
    expect(header).toContain("struct TileCellData");
    expect(header).toContain("{0, 0, 1}");
    expect(header).toContain("{0, 1, 2}");
    expect(header).toContain("{0, 2, 3}");
    expect(header).toContain("{0, 3, 0}");
    expect(header).toContain("struct CollisionCellData");
    expect(header).toContain("{0, 0, true}");
    expect(header).toContain("{0, 1, false}");
    expect(header).toContain("{0, 2, true}");
    expect(header).toContain("{0, 3, false}");
    expect(header).toContain("struct AssetData");
    expect(header).toContain("{\"asset-player\", \"player_idle.png\", \"Sprite\", \"Assets/sprites/player_idle.png\"}");
    expect(header).toContain("struct AudioData");
    expect(header).toContain("{\"audio-theme\", \"intro_theme.mod\", \"Musica\", \"MOD\", \"intro_theme\", true, 80}");
    expect(header).toContain("struct EventStepData");
    expect(header).toContain("{0, EventCommandOpcode::PlayMusic, EventCommandTargetKind::Audio, 0, 0, 0, \"intro_theme.mod\", \"play_music intro_theme.mod\", true}");
    expect(header).toContain("{0, EventCommandOpcode::ShowDialogue, EventCommandTargetKind::Dialogue, 0, 0, 0, \"intro_001\", \"show_dialogue intro_001\", false}");
    expect(header).toContain("struct EventData");
    expect(header).toContain("{\"event-room\", \"room_boot\", \"Cena\", \"Boot da sala\", 0, 2}");
    expect(header).toContain("actor_count = 1");
    expect(header).toContain("struct ActorData");
    expect(header).toContain("const char* render_layer;");
    expect(header).toContain("int sprite_width_tiles;");
    expect(header).toContain("int sprite_height_tiles;");
    expect(header).toContain("{\"actor-player\", \"Player\", 0, 12, 9, \"player_start\", \"npc_shop\", \"player_idle.png\", \"idle_down\", \"OBJ\", 2, 4}");
    expect(header).toContain("trigger_count = 1");
    expect(header).toContain("struct TriggerData");
    expect(header).toContain("{\"trigger-door\", \"Shop Door\", 0, 14, 10, 2, 1, \"door_enter\", \"door_enter\", \"door_leave\"}");
    expect(header).toContain("dialogue_count = 1");
    expect(header).toContain("dialogue_choice_count = 2");
    expect(header).toContain("struct DialogueData");
    expect(header).toContain("{\"intro_001\", \"Ana\", \"ana.png\", \"actor-player\", \"OLA. VIAJANTE!\", 0, 2}");
    expect(header).toContain("struct DialogueChoiceData");
    expect(header).toContain("{0, \"Vamos explorar\"}");
    expect(header).toContain("{0, \"Abrir inventario\"}");
  });

  it("normalizes missing names and unsafe ROM file names", () => {
    const exported = generateEngineProjectExport(exportableProject({
      name: "",
      settings: {
        general: { gameTitle: "Projeto sem nome", startSceneType: "custom kind" },
        build: { romFileName: "Meu Jogo!.gba" }
      }
    }));

    expect(exported.target).toBe("meu_jogo");
    const manifest = JSON.parse(exported.files.find((file) => file.path === "gbastudio_project.json")?.contents ?? "{}") as Record<string, unknown>;
    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    expect(manifest).toMatchObject({
      kind: "custom_kind",
      build: { target: "meu_jogo" }
    });
    expect(header).toContain("room_count = 1");
    expect(header).toContain("room_storage_count = room_count > 0 ? room_count : 1");
    expect(header).toContain("constexpr RoomData rooms[room_storage_count]");
    expect(exported.files.find((file) => file.path === "README.md")?.contents).toContain("Projeto sem nome");
  });

  it("compiles known event commands into opcodes and resolved target indexes", () => {
    const exported = generateEngineProjectExport(exportableProject({
      name: "Command Compile",
      scenas: [
        { name: "start", width: 20, height: 18 },
        { name: "shop", width: 20, height: 18 }
      ],
      dialogues: [
        { key: "intro", text: "Ola" }
      ],
      audioItems: [
        { name: "theme.mod", kind: "Musica" },
        { name: "confirm.wav", kind: "SFX" }
      ],
      events: [
        {
          name: "boot",
          category: "Cena",
          steps: [
            { command: "play_music theme.mod" },
            { command: "play_sfx confirm.wav" },
            { command: "show_dialogue intro" },
            { command: "change_scene shop 4 5" },
            { command: "call_event after" },
            { command: "choice_event intro 1 after" },
            { command: "set_variable score 10" },
            { command: "add_variable score 5" },
            { command: "multiply_variable score 2" },
            { command: "set_flag story.progress true" },
            { command: "add_variable_flags story.flags 1" },
            { command: "add_item potion 2" },
            { command: "modify_wallet wallet.gold 25 999" },
            { command: "set_equipped_item 0 sword" },
            { command: "multiplayer_host after 180" },
            { command: "multiplayer_join after 90" },
            { command: "multiplayer_transfer net.recebido 255 45" },
            { command: "multiplayer_close" },
            { command: "read_rtc hour clock.hour" },
            { command: "if_rtc weekday 6" },
            { command: "custom_command value", isEnabled: false }
          ]
        },
        { name: "after", category: "Controle", command: "noop" }
      ]
    }));

    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";

    expect(header).toContain("enum class EventCommandOpcode");
    expect(header).toContain("enum class EventCommandTargetKind");
    expect(header).toContain("{0, EventCommandOpcode::PlayMusic, EventCommandTargetKind::Audio, 0, 0, 0, \"theme.mod\", \"play_music theme.mod\", true}");
    expect(header).toContain("{0, EventCommandOpcode::PlaySfx, EventCommandTargetKind::Audio, 1, 0, 0, \"confirm.wav\", \"play_sfx confirm.wav\", true}");
    expect(header).toContain("{0, EventCommandOpcode::ShowDialogue, EventCommandTargetKind::Dialogue, 0, 0, 0, \"intro\", \"show_dialogue intro\", true}");
    expect(header).toContain("{0, EventCommandOpcode::ChangeScene, EventCommandTargetKind::Room, 1, 4, 5, \"shop\", \"change_scene shop 4 5\", true}");
    expect(header).toContain("{0, EventCommandOpcode::CallEvent, EventCommandTargetKind::Event, 1, 0, 0, \"after\", \"call_event after\", true}");
    expect(header).toContain("{0, EventCommandOpcode::ChoiceEvent, EventCommandTargetKind::Event, 1, 1, 0, \"after\", \"choice_event intro 1 after\", true}");
    expect(header).toContain("{0, EventCommandOpcode::SetVariable, EventCommandTargetKind::Variable, -1, 10, 0, \"score\", \"set_variable score 10\", true}");
    expect(header).toContain("{0, EventCommandOpcode::AddVariable, EventCommandTargetKind::Variable, -1, 5, 0, \"score\", \"add_variable score 5\", true}");
    expect(header).toContain("{0, EventCommandOpcode::MultiplyVariable, EventCommandTargetKind::Variable, -1, 2, 0, \"score\", \"multiply_variable score 2\", true}");
    expect(header).toContain("{0, EventCommandOpcode::SetFlag, EventCommandTargetKind::Flag, -1, 1, 0, \"story.progress\", \"set_flag story.progress true\", true}");
    expect(header).toContain("{0, EventCommandOpcode::AddVariableFlags, EventCommandTargetKind::Variable, -1, 1, 0, \"story.flags\", \"add_variable_flags story.flags 1\", true}");
    expect(header).toContain("{0, EventCommandOpcode::AddItem, EventCommandTargetKind::Inventory, -1, 2, 0, \"potion\", \"add_item potion 2\", true}");
    expect(header).toContain("{0, EventCommandOpcode::ModifyWallet, EventCommandTargetKind::Inventory, -1, 25, 999, \"wallet.gold\", \"modify_wallet wallet.gold 25 999\", true}");
    expect(header).toContain("{0, EventCommandOpcode::SetEquippedItem, EventCommandTargetKind::Inventory, -1, 0, 0, \"0:sword\", \"set_equipped_item 0 sword\", true}");
    expect(header).toContain("{0, EventCommandOpcode::LinkHost, EventCommandTargetKind::Event, 1, 180, 0, \"after\", \"multiplayer_host after 180\", true}");
    expect(header).toContain("{0, EventCommandOpcode::LinkJoin, EventCommandTargetKind::Event, 1, 90, 0, \"after\", \"multiplayer_join after 90\", true}");
    expect(header).toContain("{0, EventCommandOpcode::LinkTransfer, EventCommandTargetKind::Variable, -1, 255, 45, \"net.recebido\", \"multiplayer_transfer net.recebido 255 45\", true}");
    expect(header).toContain("{0, EventCommandOpcode::LinkClose, EventCommandTargetKind::None, -1, 0, 0, \"\", \"multiplayer_close\", true}");
    expect(header).toContain("EventCommandOpcode::ReadRtc");
    expect(header).toContain("EventCommandOpcode::JumpIfRtcEquals");
    expect(header).toContain("\"read_rtc hour clock.hour\"");
    expect(header).toContain("\"if_rtc weekday 6\"");
    expect(header).toContain("{0, EventCommandOpcode::Unknown, EventCommandTargetKind::None, -1, 0, 0, \"value\", \"custom_command value\", false}");
    expect(header).toContain("{1, EventCommandOpcode::Noop, EventCommandTargetKind::None, -1, 0, 0, \"\", \"noop\", true}");
  });

  it("emits rumble and 4-player multiplayer opcodes to the preview header", () => {
    const exported = generateEngineProjectExport(exportableProject({
      events: [
        {
          name: "haptics",
          category: "Multijogador",
          steps: [
            { command: "rumble_on" },
            { command: "rumble_on_for 60" },
            { command: "rumble_off" },
            { command: "multiplayer4_open 4" },
            { command: "multiplayer4_set 1234" },
            { command: "multiplayer4_sync" },
            { command: "multiplayer4_read net.var_player net.var_count net.var_data" },
            { command: "multiplayer4_close" }
          ]
        },
        { name: "after", category: "Controle", command: "noop" }
      ]
    }));

    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";

    expect(header).toContain("{0, EventCommandOpcode::RumbleOn, EventCommandTargetKind::None, -1, 0, 0, \"\", \"rumble_on\", true}");
    expect(header).toContain("{0, EventCommandOpcode::RumbleOnFor, EventCommandTargetKind::None, -1, 60, 0, \"\", \"rumble_on_for 60\", true}");
    expect(header).toContain("{0, EventCommandOpcode::RumbleOff, EventCommandTargetKind::None, -1, 0, 0, \"\", \"rumble_off\", true}");
    expect(header).toContain("{0, EventCommandOpcode::MultiplayerOpen, EventCommandTargetKind::None, -1, 4, 0, \"\", \"multiplayer4_open 4\", true}");
    expect(header).toContain("{0, EventCommandOpcode::MultiplayerSetData, EventCommandTargetKind::None, -1, 1234, 0, \"\", \"multiplayer4_set 1234\", true}");
    expect(header).toContain("{0, EventCommandOpcode::MultiplayerTransfer, EventCommandTargetKind::None, -1, 0, 0, \"\", \"multiplayer4_sync\", true}");
    expect(header).toContain("EventCommandOpcode::MultiplayerGetData");
    expect(header).toContain("EventCommandOpcode::MultiplayerClose");
  });

  it("lists processable project assets in the Engine Pack manifest", () => {
    const exported = generateEngineProjectExport(exportableProject({
      name: "Assets Export",
      assets: [
        { id: "asset-player", name: "Player Idle.PNG", kind: "Sprite", metadata: { source: "Assets/Sprites/Player Idle.PNG" } },
        { id: "asset-theme", name: "Theme.mod", kind: "Musica", relativePath: "Assets/Audio/Theme.mod" },
        { id: "asset-missing", name: "Missing", kind: "Unknown" }
      ]
    }));

    expect(exported.assets).toEqual([
      {
        id: "asset-player",
        kind: "Sprite",
        name: "Player Idle.PNG",
        source: "Assets/Sprites/Player Idle.PNG",
        output: "assets/sprite/player_idle.png"
      },
      {
        id: "asset-theme",
        kind: "Musica",
        name: "Theme.mod",
        source: "Assets/Audio/Theme.mod",
        output: "assets/audio/theme.mod"
      }
    ]);

    const manifest = JSON.parse(exported.files.find((file) => file.path === "gbastudio_project.json")?.contents ?? "{}") as Record<string, unknown>;
    expect(manifest.generated_assets).toEqual(["assets/sprite/player_idle.png", "assets/audio/theme.mod"]);
  });

  it("exports composed tracker patterns with up to 64 steps", () => {
    const exported = generateEngineProjectExport(exportableProject({
      audioItems: [{
        id: "audio-theme",
        name: "theme.mod",
        kind: "Musica",
        format: "MOD",
        bpm: 120,
        patterns: [{
          id: "pattern-main",
          name: "Main",
          steps: 64,
          channels: [{
            id: "pattern-main-pulse1",
            name: "Pulse 1",
            type: "pulse1",
            notes: Array.from({ length: 64 }, (_, index) => (index % 4 === 0 ? "C4" : ""))
          }]
        }],
        patternOrder: ["pattern-main"]
      }]
    }));

    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    expect(header).toContain("\"pattern-main\"");
    expect(header).toMatch(/,\s*64,\s*\d+,\s*\d+\}/);
  });

  it("derives engine audio export diagnostics for import and composed items", () => {
    const diagnostics = deriveAudioEngineExportDiagnostics([
      { id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD" },
      {
        id: "audio-hit",
        name: "hit.wav",
        kind: "SFX",
        format: "WAV",
        patterns: [{ id: "p1", name: "Main", steps: 64, channels: [] }],
        patternOrder: []
      },
      { id: "audio-empty", name: "empty.mod", kind: "Musica", format: "MOD", bpm: 999 }
    ]);

    expect(diagnostics).toEqual(expect.arrayContaining([
      expect.objectContaining({ audioName: "theme.mod", level: "ok" }),
      expect.objectContaining({ audioName: "hit.wav", level: "ok" }),
      expect.objectContaining({ audioName: "empty.mod", level: "warning", message: expect.stringContaining("BPM 999") })
    ]));
  });

  it("exports instrument and envelope fields for composed tracker notes", () => {
    const exported = generateEngineProjectExport(exportableProject({
      audioItems: [{
        id: "audio-theme",
        name: "theme",
        kind: "Musica",
        format: "MOD",
        patterns: [{
          id: "pattern-main",
          name: "Main",
          steps: 4,
          channels: [{
            id: "pattern-main-noise",
            name: "Noise",
            type: "noise",
            instrument: "Noise Kit",
            envelope: "Short Decay",
            notes: ["C4", "", "", ""]
          }]
        }]
      }]
    }));

    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    expect(header).toContain("const char* instrument");
    expect(header).toContain("\"Noise Kit\"");
    expect(header).toContain("\"Short Decay\"");
  });

  it("builds assetc audio pack with inline tracker patterns for composed music without imported files", () => {
    const pack = buildAssetcAudioPackGeneration({
      assets: [],
      audioItems: [{
        id: "audio-battle",
        name: "battle_theme",
        kind: "Musica",
        exportID: "battle_theme",
        loops: true,
        patterns: [{
          id: "pattern-main",
          name: "Main",
          steps: 4,
          channels: [{
            id: "pattern-main-pulse1",
            name: "Pulse 1",
            type: "pulse1",
            notes: ["C4", "", "E4", ""]
          }]
        }],
        patternOrder: ["pattern-main"]
      }]
    });

    expect(pack?.document.tracker).toEqual([
      expect.objectContaining({
        name: "battle_theme",
        loop: true,
        order: [0],
        patterns: [expect.objectContaining({
          steps: expect.arrayContaining([
            expect.objectContaining({ channel: 1, frequency_hz: expect.any(Number), duration_frames: expect.any(Number) })
          ])
        })]
      })
    ]);
    expect(pack?.document.tracker[0]).not.toHaveProperty("mod");
    expect(pack?.sourceCopies).toEqual([]);
    expect(pack?.physicalBudget).toEqual({
      schema: 1,
      audio_bytes_by_item: {
        "audio-battle": 101,
        "audio:0": 101,
        battle_theme: 101
      }
    });
  });

  it("builds assetc audio pack generation for imported mod and wav items", () => {
    const pack = buildAssetcAudioPackGeneration({
      assets: [
        { id: "asset-theme", name: "theme.mod", kind: "Musica", metadata: { source: "Assets/music/theme.mod" } },
        { id: "asset-hit", name: "hit.wav", kind: "SFX", metadata: { source: "Assets/sounds/hit.wav" } }
      ],
      audioItems: [
        { id: "audio-theme", name: "theme.mod", kind: "Musica", format: "MOD", loops: true, exportID: "theme" },
        { id: "audio-hit", name: "hit.wav", kind: "SFX", format: "WAV", loops: false, exportID: "hit" }
      ]
    });

    expect(pack).toMatchObject({
      packAsset: expect.objectContaining({ audio_json: "assets/audio/project_audio.json" }),
      document: {
        tracker: [expect.objectContaining({ name: "theme", mod: "theme.mod", loop: true })],
        pcm: [expect.objectContaining({ name: "hit", wav: "hit.wav" })]
      }
    });
    expect(pack?.document.pcm[0]).not.toHaveProperty("sample_rate_hz");
    expect(pack?.sourceCopies).toHaveLength(2);
  });

  it("uses configured project audio sample rate when generating PCM audio pack entries", () => {
    const pack = buildAssetcAudioPackGeneration({
      settings: {
        audio: {
          sampleRate: 18000
        }
      },
      assets: [
        { id: "asset-hit", name: "hit.wav", kind: "SFX", metadata: { source: "Assets/sounds/hit.wav" } }
      ],
      audioItems: [
        { id: "audio-hit", name: "hit.wav", kind: "SFX", format: "WAV", loops: false, exportID: "hit" }
      ]
    });

    expect(pack).toMatchObject({
      document: {
        pcm: [expect.objectContaining({ name: "hit", wav: "hit.wav", sample_rate_hz: 18000 })]
      }
    });
  });

  it("builds assetc sprite pack generation for actor sprite sheets", () => {
    const pack = buildAssetcSpritePackGeneration({
      assets: [
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 1, y: 1, spriteSheet: "hero.png", animationName: "idle" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }
      ]
    });

    expect(pack).toMatchObject({
      assetNames: ["hero"],
      packAssets: [expect.objectContaining({ kind: "obj", name: "hero", sprite_width: 16, sprite_height: 16 })]
    });
    expect(pack?.assetsBySheet["hero.png"]).toMatchObject({ png: "assets/sprite/hero.png", header: "hero.hpp" });
  });

  it("exports an explicit object palette declared by the sprite asset metadata", () => {
    const pack = buildAssetcSpritePackGeneration({
      assets: [{
        id: "asset-title",
        name: "title.png",
        kind: "Sprite",
        metadata: {
          source: "Assets/sprites/title.png",
          objectPaletteValues: [0, 992]
        }
      }],
      actors: [{
        id: "actor-title",
        name: "Title",
        roomName: "start",
        spriteSheet: "title.png",
        animationName: "idle"
      }],
      animations: [{
        id: "anim-idle",
        name: "idle",
        spriteSheet: "title.png",
        frameWidth: 16,
        frameHeight: 16,
        frameCount: 1
      }]
    });

    expect(pack?.assetsBySheet["title.png"]).toMatchObject({
      object_palette_values: [0, 992]
    });
  });

  it("emits scene palette variants for a sprite shared by different families", () => {
    const data = exportableProject({
      paletteFamilies: [
        { id: "harbor", name: "Porto", background: [0, 31], objects: [0, 992] },
        { id: "alpine", name: "Cordilheira", background: [0, 992], objects: [0, 31] }
      ],
      scenas: [
        { name: "porto", width: 20, height: 18, paletteFamilyID: "harbor" },
        { name: "penedos", width: 20, height: 18, paletteFamilyID: "alpine" }
      ],
      assets: [{ id: "asset-nara", name: "nara.png", kind: "Sprite", metadata: { source: "Assets/sprites/nara.png" } }],
      actors: [
        { id: "actor-porto", name: "Nara Porto", roomName: "porto", spriteSheet: "nara.png", animationName: "idle" },
        { id: "actor-penedos", name: "Nara Penedos", roomName: "penedos", spriteSheet: "nara.png", animationName: "idle" }
      ],
      animations: [{ id: "anim-idle", name: "idle", spriteSheet: "nara.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }]
    });

    const pack = buildAssetcSpritePackGeneration(data);
    const actors = data.actors as Record<string, unknown>[];
    expect(pack?.assetsBySheet["nara.png::harbor"]).toMatchObject({
      name: "nara_palette_harbor",
      png: "assets/sprite/nara.png",
      object_palette_values: [0, 992]
    });
    expect(pack?.assetsBySheet["nara.png::alpine"]).toMatchObject({
      name: "nara_palette_alpine",
      png: "assets/sprite/nara.png",
      object_palette_values: [0, 31]
    });
    expect(buildActorEngineSpriteExport(data, actors[0], pack)?.metasprite.asset)
      .toBe("nara_palette_harbor");
    expect(buildActorEngineSpriteExport(data, actors[1], pack)?.metasprite.asset)
      .toBe("nara_palette_alpine");
  });

  it("keeps a same-named actor sprite scoped to its menu room when another room uses it as the player", () => {
    const data = {
      scenas: [
        { name: "conselho_guardia", sceneType: "visualNovel", playerActorName: "Retrato de Nara" },
        { name: "perfil_equipe", sceneType: "menu" }
      ],
      assets: [
        { id: "asset-nara", name: "nara-portrait.png", kind: "Sprite", metadata: { source: "Assets/sprites/nara-portrait.png" } }
      ],
      actors: [
        { id: "actor-council-nara", name: "Retrato de Nara", roomName: "conselho_guardia", spriteSheet: "nara-portrait.png" },
        { id: "actor-profile-nara", name: "Retrato de Nara", roomName: "perfil_equipe", spriteSheet: "nara-portrait.png" }
      ],
      animations: [
        { id: "anim-nara", name: "nara-portrait", spriteSheet: "nara-portrait.png", frameWidth: 32, frameHeight: 32, frameCount: 2 }
      ]
    } satisfies GBAProjectData;

    const pack = buildAssetcSpritePackGeneration(data);

    expect(pack?.assetsBySheet["nara-portrait.png"]).toMatchObject({
      bank_groups: expect.arrayContaining(["scene_conselho_guardia", "scene_perfil_equipe"])
    });
  });

  it("preserves native GBA OBJ frame dimensions for free actor sprites", () => {
    const pack = buildAssetcSpritePackGeneration({
      assets: [
        { id: "asset-enemy", name: "enemy.png", kind: "Sprite", metadata: { source: "Assets/sprites/enemy.png" } }
      ],
      actors: [
        { id: "actor-enemy", name: "Enemy", roomName: "start", x: 4, y: 4, spriteSheet: "enemy.png", animationName: "idle" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "enemy.png", frameWidth: 32, frameHeight: 32, frameCount: 1 }
      ]
    });

    expect(pack?.packAssets).toEqual([
      expect.objectContaining({ sprite_width: 32, sprite_height: 32 })
    ]);
  });

  it("preserves 8x8 native GBA OBJ frames without promoting them to 16x16", () => {
    const pack = buildAssetcSpritePackGeneration({
      assets: [
        { id: "asset-cursor", name: "cursor.png", kind: "Sprite", metadata: { source: "Assets/sprites/cursor.png" } }
      ],
      actors: [
        { id: "actor-cursor", name: "Cursor", roomName: "start", x: 4, y: 4, spriteSheet: "cursor.png", animationName: "idle" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "cursor.png", frameWidth: 8, frameHeight: 8, frameCount: 1 }
      ]
    });

    expect(pack?.packAssets).toEqual([
      expect.objectContaining({ sprite_width: 8, sprite_height: 8 })
    ]);
  });

  it("rejects mixed frame dimensions within one spritesheet", () => {
    expect(() => buildAssetcSpritePackGeneration({
      assets: [
        { id: "asset-enemy", name: "enemy.png", kind: "Sprite", metadata: { source: "Assets/sprites/enemy.png" } }
      ],
      actors: [
        { id: "actor-enemy", name: "Enemy", roomName: "start", x: 4, y: 4, spriteSheet: "enemy.png" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "enemy.png", frameWidth: 16, frameHeight: 16, frameCount: 1 },
        { id: "anim-walk", name: "walk", spriteSheet: "enemy.png", frameWidth: 32, frameHeight: 16, frameCount: 1 }
      ]
    })).toThrow("usa mais de um tamanho de frame");
  });

  it("accepts tile-aligned metasprite frames and rejects invalid free dimensions", () => {
    const pack = buildAssetcSpritePackGeneration({
      assets: [
        { id: "asset-enemy", name: "enemy.png", kind: "Sprite", metadata: { source: "Assets/sprites/enemy.png" } }
      ],
      actors: [
        { id: "actor-enemy", name: "Enemy", roomName: "start", x: 4, y: 4, spriteSheet: "enemy.png" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "enemy.png", frameWidth: 24, frameHeight: 24, frameCount: 1 }
      ]
    });
    expect(pack?.packAssets).toEqual([
      expect.objectContaining({ sprite_width: 24, sprite_height: 24 })
    ]);

    expect(() => buildAssetcSpritePackGeneration({
      assets: [
        { id: "asset-invalid", name: "invalid.png", kind: "Sprite", metadata: { source: "Assets/sprites/invalid.png" } }
      ],
      actors: [
        { id: "actor-invalid", name: "Invalid", roomName: "start", x: 4, y: 4, spriteSheet: "invalid.png" }
      ],
      animations: [
        { id: "anim-invalid", name: "idle", spriteSheet: "invalid.png", frameWidth: 25, frameHeight: 24, frameCount: 1 }
      ]
    })).toThrow("multiplo de 8 entre 8 e 128");

    const largePack = buildAssetcSpritePackGeneration({
      assets: [
        { id: "asset-oam-heavy", name: "oam-heavy.png", kind: "Sprite", metadata: { source: "Assets/sprites/oam-heavy.png" } }
      ],
      actors: [
        { id: "actor-oam-heavy", name: "OAM Heavy", roomName: "start", x: 4, y: 4, spriteSheet: "oam-heavy.png" }
      ],
      animations: [
        { id: "anim-oam-heavy", name: "idle", spriteSheet: "oam-heavy.png", frameWidth: 120, frameHeight: 120, frameCount: 1 }
      ]
    });
    expect(largePack?.packAssets).toEqual([
      expect.objectContaining({ sprite_width: 120, sprite_height: 120 })
    ]);
  });

  it("decomposes a 96x64 actor frame into two native OBJ parts", () => {
    const data = {
      assets: [
        { id: "asset-boss", name: "boss.png", kind: "Sprite", metadata: { source: "Assets/sprites/boss.png" } }
      ],
      actors: [
        { id: "actor-boss", name: "Boss", roomName: "start", x: 1, y: 1, spriteSheet: "boss.png", animationName: "idle" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "boss.png", frameWidth: 96, frameHeight: 64, frameCount: 1 },
        { id: "anim-walk", name: "walk", spriteSheet: "boss.png", frameWidth: 96, frameHeight: 64, frameCount: 1 }
      ]
    } satisfies GBAProjectData;
    const pack = buildAssetcSpritePackGeneration(data);
    const actorExport = buildActorEngineSpriteExport(data, data.actors[0], pack);

    expect(pack?.packAssets).toEqual([
      expect.objectContaining({ sprite_width: 96, sprite_height: 64 })
    ]);
    expect(actorExport?.animations?.find((animation) => animation.name === "idle")).toMatchObject({
      frame_metasprites: [{
        parts: [
          { x: -40, y: -56, slice_x: 0, slice_y: 0, width: 64, height: 64 },
          { x: 24, y: -56, slice_x: 64, slice_y: 0, width: 32, height: 64 }
        ]
      }]
    });
  });

  it("exports multi-tile animation frames as frame_metasprites for assetc", () => {
    const contract = buildEngineExportProjectContract(exportableProject({
      assets: [
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 1, y: 1, spriteSheet: "hero.png", animationName: "walk_right" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1 },
        {
          id: "anim-walk-right",
          name: "walk_right",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 16,
          frames: [{
            tiles: [
              { x: -8, y: 0, sliceX: 16, sliceY: 0, tileWidth: 8, tileHeight: 16 },
              { x: 0, y: 0, sliceX: 24, sliceY: 0, tileWidth: 8, tileHeight: 16 }
            ]
          }]
        }
      ]
    }));
    const walkRight = contract.topdown_project?.player.animations?.find((animation) => animation.name === "walk_right");

    expect(walkRight).toMatchObject({
      name: "walk_right",
      frame_indices: [0],
      frame_metasprites: [{
        parts: [
          { x: -8, y: -8, slice_x: 16, slice_y: 0, width: 8, height: 8 },
          { x: -8, y: 0, slice_x: 16, slice_y: 8, width: 8, height: 8 },
          { x: 0, y: -8, slice_x: 24, slice_y: 0, width: 8, height: 8 },
          { x: 0, y: 0, slice_x: 24, slice_y: 8, width: 8, height: 8 }
        ]
      }]
    });
  });

  it("keeps GB Studio metasprite coordinates relative to the actor origin", () => {
    const actor = {
      id: "actor-elephant",
      name: "Elephant",
      roomName: "start",
      x: 17,
      y: 14,
      spriteSheet: "elephant.png",
      animationName: "idle"
    };
    const project = {
      assets: [
        { id: "asset-elephant", name: "elephant.png", kind: "Sprite", metadata: { source: "Assets/sprites/elephant.png" } }
      ],
      actors: [actor],
      animations: [{
        id: "anim-idle",
        name: "idle",
        spriteSheet: "elephant.png",
        frameWidth: 64,
        frameHeight: 48,
        originX: 0,
        originY: 0,
        frames: [{
          originX: 0,
          originY: 0,
          tiles: [
            { x: -24, y: 16, sliceX: 0, sliceY: 0, tileWidth: 64, tileHeight: 32 },
            { x: -24, y: 0, sliceX: 0, sliceY: 32, tileWidth: 32, tileHeight: 16 },
            { x: 8, y: 0, sliceX: 32, sliceY: 32, tileWidth: 32, tileHeight: 16 }
          ]
        }]
      }]
    } as GBAProjectData;

    const exported = buildActorEngineSpriteExport(project, actor, buildAssetcSpritePackGeneration(project));

    expect(exported?.animations?.find((animation) => animation.name === "idle")?.frame_metasprites).toEqual([{
      parts: [
        { x: -24, y: -40, slice_x: 0, slice_y: 0, width: 64, height: 32, hflip: false, vflip: false },
        { x: -24, y: -8, slice_x: 0, slice_y: 32, width: 32, height: 16, hflip: false, vflip: false },
        { x: 8, y: -8, slice_x: 32, slice_y: 32, width: 32, height: 16, hflip: false, vflip: false }
      ]
    }]);
  });

  it("emite os estados de ação tática isométrica quando explicitamente habilitado", () => {
    const directions = ["down", "up", "left", "right"];
    const states = ["idle", "move", "attack", "hurt", "defeat"];
    const animations = states.flatMap((state, stateIndex) => directions.map((direction, directionIndex) => {
      const sourceFrameIndex = stateIndex * directions.length + directionIndex;
      return {
        id: `nara-${state}-${direction}`,
        name: `${state}_${direction}`,
        spriteSheet: "nara.png",
        state,
        direction,
        frameWidth: 48,
        frameHeight: 48,
        frameCount: 1,
        originX: 24,
        originY: 48,
        fps: state === "move" ? 8 : 10,
        loops: state === "idle" || state === "move",
        frames: [{
          sourceFrameIndex,
          originX: 24,
          originY: 48,
          tiles: [
            { x: 0, y: 0, sliceX: sourceFrameIndex * 48, sliceY: 0, tileWidth: 32, tileHeight: 32 },
            { x: 0, y: 32, sliceX: sourceFrameIndex * 48, sliceY: 32, tileWidth: 32, tileHeight: 16 },
            { x: 32, y: 0, sliceX: sourceFrameIndex * 48 + 32, sliceY: 0, tileWidth: 16, tileHeight: 32 },
            { x: 32, y: 32, sliceX: sourceFrameIndex * 48 + 32, sliceY: 32, tileWidth: 16, tileHeight: 16 }
          ]
        }]
      };
    }));
    const data = exportableProject({
      assets: [{ id: "asset-nara", name: "nara.png", kind: "Sprite", metadata: { source: "Assets/sprites/nara.png" } }],
      actors: [{ id: "actor-nara", name: "Nara", roomName: "start", x: 2, y: 2, spriteSheet: "nara.png", animationName: "idle_down", animationStateID: "nara-tactical-state" }],
      animations,
      animationStates: [{
        id: "nara-tactical-state",
        name: "Nara tactical",
        spriteSheet: "nara.png",
        animationType: "four_direction_movement",
        animationIDs: animations.map((animation) => animation.id)
      }]
    });
    const actor = (data.actors as Record<string, unknown>[] | undefined)?.[0] ?? {};
    const spritePack = buildAssetcSpritePackGeneration(data);

    const exported = buildActorEngineSpriteExport(data, actor, spritePack, {
      directionAdapter: "isometric",
      includeIsometricTacticalAnimations: true
    });

    expect(exported?.animations?.map((animation) => animation.name)).toEqual(expect.arrayContaining([
      "idle_down",
      "walk_down",
      "attack_down",
      "hurt_down",
      "defeat_down"
    ]));
    expect(exported?.animations?.filter((animation) => (
      animation.name.startsWith("attack_")
      || animation.name.startsWith("hurt_")
      || animation.name.startsWith("defeat_")
    ))).toHaveLength(12);
  });

  it("anchors implicit 16x16 and 32x32 frames at the GB Studio actor feet", () => {
    const actors = [
      { id: "actor-small", name: "Small", roomName: "start", x: 4, y: 4, spriteSheet: "small.png", animationName: "idle" },
      { id: "actor-large", name: "Large", roomName: "start", x: 8, y: 4, spriteSheet: "large.png", animationName: "idle" }
    ];
    const project = {
      assets: [
        { id: "asset-small", name: "small.png", kind: "Sprite", metadata: { source: "Assets/sprites/small.png" } },
        { id: "asset-large", name: "large.png", kind: "Sprite", metadata: { source: "Assets/sprites/large.png" } }
      ],
      actors,
      animations: [
        { id: "small-idle", name: "idle", spriteSheet: "small.png", frameWidth: 16, frameHeight: 16, originX: 0, originY: 0 },
        { id: "large-idle", name: "idle", spriteSheet: "large.png", frameWidth: 32, frameHeight: 32, originX: 0, originY: 0 }
      ]
    } as GBAProjectData;
    const generation = buildAssetcSpritePackGeneration(project);

    const small = buildActorEngineSpriteExport(project, actors[0], generation);
    const large = buildActorEngineSpriteExport(project, actors[1], generation);

    expect(small?.animations?.[0]?.frame_metasprites?.[0]?.parts).toEqual([
      expect.objectContaining({ x: 0, y: -8, width: 16, height: 16 })
    ]);
    expect(large?.animations?.[0]?.frame_metasprites?.[0]?.parts).toEqual([
      expect.objectContaining({ x: -8, y: -24, width: 32, height: 32 })
    ]);
  });

  it("builds portrait pack generation for dialogue portraits not already in sprite pack", () => {
    const data = {
      assets: [
        { id: "asset-guide", name: "guide.png", kind: "Sprite", metadata: { source: "Assets/portraits/guide.png" } },
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }
      ],
      dialogues: [
        { key: "intro", text: "Ola", portrait: "guide.png" },
        { key: "shop", text: "Compre", portrait: "hero.png" }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 1, y: 1, spriteSheet: "hero.png", animationName: "idle" }
      ],
      animations: [
        { id: "anim-idle", name: "idle", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1 }
      ]
    } satisfies GBAProjectData;

    const spritePack = buildAssetcSpritePackGeneration(data);
    const portraitPack = buildAssetcPortraitPackGeneration(data, spritePack);
    const portraitAssets = buildDialoguePortraitAssetsExport(data, portraitPack, spritePack);

    expect(spritePack?.assetNames).toEqual(["hero"]);
    expect(portraitPack).toMatchObject({
      assetNames: ["guide"],
      packAssets: [expect.objectContaining({ kind: "obj", name: "guide", sprite_width: 16, sprite_height: 16 })]
    });
    expect(portraitAssets).toEqual([
      { name: "guide.png", metasprite: { asset: "guide", index: 0 } },
      { name: "hero.png", metasprite: { asset: "hero", index: 0 } }
    ]);
  });

  it("preserves a 48x48 dialogue portrait frame without requiring a world actor", () => {
    const data = exportableProject({
      assets: [{ id: "guardian", name: "guardian.png", kind: "Sprite", metadata: { source: "Assets/sprites/guardian.png" } }],
      actors: [],
      dialogues: [{ key: "council", portrait: "guardian.png", text: "Olá" }],
      animations: [{ id: "guardian-portrait", name: "portrait", spriteSheet: "guardian.png", frameWidth: 48, frameHeight: 48, frameCount: 1 }]
    });
    const spritePack = buildAssetcSpritePackGeneration(data);
    const portraits = buildAssetcPortraitPackGeneration(data, spritePack);
    expect(portraits?.assetsByPortraitName["guardian.png"]).toMatchObject({ sprite_width: 48, sprite_height: 48 });
    expect(buildDialoguePortraitAssetsExport(data, portraits, spritePack)).toEqual([
      { name: "guardian.png", metasprite: { asset: "guardian", index: 0 } }
    ]);
  });

  it("sorts topdown sprite animations into canonical directional order", () => {
    const sorted = sortTopdownSpriteAnimationsForExport([
      { name: "idle_left", spriteSheet: "hero.png" },
      { name: "idle_down", spriteSheet: "hero.png" },
      { name: "idle_right", spriteSheet: "hero.png" },
      { name: "idle_up", spriteSheet: "hero.png" }
    ]);

    expect(sorted.map((animation) => animation.name)).toEqual([
      "idle_down",
      "idle_up",
      "idle_right",
      "idle_left"
    ]);
  });

  it("places walk animations after idle right when walk states exist", () => {
    const sorted = sortTopdownSpriteAnimationsForExport([
      { name: "walk_right", spriteSheet: "hero.png" },
      { name: "idle_down", spriteSheet: "hero.png" },
      { name: "walk_down", spriteSheet: "hero.png" },
      { name: "idle_up", spriteSheet: "hero.png" },
      { name: "idle_right", spriteSheet: "hero.png" },
      { name: "walk_up", spriteSheet: "hero.png" }
    ]);

    expect(sorted.map((animation) => animation.name)).toEqual([
      "idle_down",
      "idle_up",
      "idle_right",
      "walk_down",
      "walk_up",
      "walk_right"
    ]);
  });

  it("exports P0 player with canonical idle+walk 4 dirs prefix", () => {
    const contract = buildEngineExportProjectContract(buildFunctionalP0Project());

    expect(verifyTopdownWalk4DirsExportContract(contract)).toMatchObject({ animationCount: 8 });
    expect(contract.topdown_project?.player.animations?.map((animation) => animation.name)).toEqual([
      "idle_down",
      "idle_right",
      "idle_up",
      "idle_left",
      "walk_down",
      "walk_right",
      "walk_up",
      "walk_left"
    ]);
    expect(contract.topdown_project?.player.animations?.find((animation) => animation.name === "walk_down")?.frame_indices?.length).toBeGreaterThanOrEqual(2);
  });

  it("normalizes a referenced SpriteState into eight runtime slots and mirrors left", () => {
    const actor = {
      id: "actor-player",
      name: "Player",
      spriteSheet: "hero.png",
      animationStateID: "state-player-default",
      animationName: "idle_down"
    };
    const animations = [
      ["idle-down", "idle_down", "idle", "down", 0],
      ["idle-right", "idle_right", "idle", "right", 16],
      ["idle-up", "idle_up", "idle", "up", 32],
      ["walk-down", "walk_down", "walk", "down", 48],
      ["walk-right", "walk_right", "walk", "right", 64],
      ["walk-up", "walk_up", "walk", "up", 80]
    ].map(([id, name, state, direction, sliceX]) => ({
      id,
      name,
      state,
      direction,
      spriteSheet: "hero.png",
      frameWidth: 16,
      frameHeight: 16,
      frames: [{ tiles: [{ x: 0, y: 0, sliceX, sliceY: 0, tileWidth: 16, tileHeight: 16 }] }]
    }));
    const project = {
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }],
      actors: [actor],
      animations,
      animationStates: [{
        id: "state-player-default",
        name: "default",
        spriteSheet: "hero.png",
        animationType: "four_direction_movement",
        mirrorLeftFromRight: true,
        animationIDs: animations.map((animation) => animation.id)
      }]
    } as GBAProjectData;

    const spritePack = buildAssetcSpritePackGeneration(project);
    const exportFields = buildActorEngineSpriteExport(project, actor, spritePack);

    expect(exportFields?.animations?.map((animation) => animation.name)).toEqual([
      "idle_down", "idle_right", "idle_up", "idle_left",
      "walk_down", "walk_right", "walk_up", "walk_left"
    ]);
    expect(exportFields?.animations?.find((animation) => animation.name === "idle_left")?.frame_metasprites).toEqual([
      { parts: [{ x: 0, y: -8, slice_x: 16, slice_y: 0, width: 16, height: 16, hflip: true, vflip: false }] }
    ]);
    expect(exportFields?.animations?.find((animation) => animation.name === "walk_left")?.frame_metasprites).toEqual([
      { parts: [{ x: 0, y: -8, slice_x: 64, slice_y: 0, width: 16, height: 16, hflip: true, vflip: false }] }
    ]);
  });

  it("exports directional_view with explicit view-based animation names", () => {
    const actor = {
      id: "actor-player",
      name: "Player",
      spriteSheet: "hero.png",
      animationStateID: "state-player-default",
      animationName: "view_down"
    };
    const animations = [
      ["idle-down", "idle_down", "idle", "down", 0],
      ["idle-right", "idle_right", "idle", "right", 16],
      ["idle-up", "idle_up", "idle", "up", 32],
      ["idle-left", "idle_left", "idle", "left", 16],
      ["walk-down", "walk_down", "walk", "down", 48],
      ["walk-right", "walk_right", "walk", "right", 64],
      ["walk-up", "walk_up", "walk", "up", 80],
      ["walk-left", "walk_left", "walk", "left", 64]
    ].map(([id, name, state, direction, sliceX]) => ({
      id,
      name,
      state,
      direction,
      spriteSheet: "hero.png",
      frameWidth: 16,
      frameHeight: 16,
      frames: [{ tiles: [{ x: 0, y: 0, sliceX, sliceY: 0, tileWidth: 16, tileHeight: 16 }] }]
    }));
    const project = {
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }],
      actors: [actor],
      animations,
      animationStates: [{
        id: "state-player-default",
        name: "default",
        spriteSheet: "hero.png",
        animationType: "directional_view",
        mirrorLeftFromRight: true,
        animationIDs: animations.map((animation) => animation.id)
      }]
    } as GBAProjectData;

    const spritePack = buildAssetcSpritePackGeneration(project);
    const exportFields = buildActorEngineSpriteExport(project, actor, spritePack);

    expect(exportFields?.animations?.map((animation) => animation.name)).toEqual([
      "view_down", "view_right", "view_up", "view_left",
      "moving_view_down", "moving_view_right", "moving_view_up", "moving_view_left"
    ]);
    expect(exportFields?.animations?.map((animation) => animation.name).some((name) => name.startsWith("walk_"))).toBe(false);
  });

  it("exports fixed SpriteState names so events can switch an actor between authored states", () => {
    const actor = {
      id: "actor-chest",
      name: "Chest",
      spriteSheet: "chest.png",
      animationStateID: "state-chest-default",
      animationName: "idle"
    };
    const project = {
      assets: [{ id: "asset-chest", name: "chest.png", kind: "Sprite", metadata: { source: "Assets/sprites/chest.png" } }],
      actors: [actor],
      animations: [
        {
          id: "animation-chest-closed",
          name: "idle",
          state: "idle",
          direction: "down",
          spriteSheet: "chest.png",
          frameWidth: 16,
          frameHeight: 16,
          frames: [{ tiles: [{ x: 0, y: 0, sliceX: 0, sliceY: 0, tileWidth: 16, tileHeight: 16 }] }]
        },
        {
          id: "animation-chest-open",
          name: "idle",
          state: "idle",
          direction: "up",
          spriteSheet: "chest.png",
          frameWidth: 16,
          frameHeight: 16,
          frames: [{ tiles: [{ x: 0, y: 0, sliceX: 16, sliceY: 0, tileWidth: 16, tileHeight: 16 }] }]
        }
      ],
      animationStates: [
        {
          id: "state-chest-default",
          name: "default",
          spriteSheet: "chest.png",
          animationType: "fixed",
          mirrorLeftFromRight: false,
          animationIDs: ["animation-chest-closed"]
        },
        {
          id: "state-chest-open",
          name: "open",
          spriteSheet: "chest.png",
          animationType: "fixed",
          mirrorLeftFromRight: false,
          animationIDs: ["animation-chest-open"]
        }
      ]
    } as GBAProjectData;

    const exportFields = buildActorEngineSpriteExport(project, actor, buildAssetcSpritePackGeneration(project));

    expect(exportFields?.animations?.slice(0, 8).map((animation) => animation.name)).toEqual([
      "idle_down", "idle_right", "idle_up", "idle_left",
      "walk_down", "walk_right", "walk_up", "walk_left"
    ]);
    expect(exportFields?.animations?.find((animation) => animation.name === "default")).toMatchObject({
      frame_indices: [0]
    });
    expect(exportFields?.animations?.find((animation) => animation.name === "open")).toMatchObject({
      frame_indices: [0],
      frame_metasprites: [{ parts: [expect.objectContaining({ slice_x: 16, y: -8 })] }]
    });
  });

  it("exports only animations owned by platform and cursor SpriteStates", () => {
    const actor = {
      id: "actor-cursor",
      name: "Cursor",
      spriteSheet: "cursor.png",
      animationStateID: "state-cursor",
      animationName: "normal"
    };
    const project = {
      assets: [{ id: "asset-cursor", name: "cursor.png", kind: "Sprite", metadata: { source: "Assets/sprites/cursor.png" } }],
      actors: [actor],
      animations: [
        { id: "anim-normal", name: "normal", state: "idle", spriteSheet: "cursor.png", frameWidth: 8, frameHeight: 8, frameCount: 1 },
        { id: "anim-hover", name: "hover", state: "hover", spriteSheet: "cursor.png", frameWidth: 8, frameHeight: 8, frameCount: 1 },
        { id: "anim-unused", name: "unused", state: "idle", spriteSheet: "cursor.png", frameWidth: 8, frameHeight: 8, frameCount: 1 }
      ],
      animationStates: [{
        id: "state-cursor",
        name: "default",
        spriteSheet: "cursor.png",
        animationType: "cursor",
        mirrorLeftFromRight: false,
        animationIDs: ["anim-normal", "anim-hover"]
      }]
    } as GBAProjectData;

    const exported = buildActorEngineSpriteExport(project, actor, buildAssetcSpritePackGeneration(project), { directionAdapter: "cursor" });

    expect(exported?.animations?.map((animation) => animation.name)).toEqual(["normal", "hover"]);
  });

  it("builds emote pack generation for dialogue emotes", () => {
    const data = {
      assets: [
        { id: "asset-smile", name: "Smile.png", kind: "Emote", metadata: { source: "Assets/emotes/Smile.png" } }
      ],
      dialogues: [
        { key: "intro", text: "Ola!", emote: "Smile.png" }
      ]
    } satisfies GBAProjectData;

    const emotePack = buildAssetcEmotePackGeneration(data, null, null);
    const emoteAssets = buildDialogueEmoteAssetsExport(data, emotePack, null, null);

    expect(emotePack).toMatchObject({
      assetNames: ["smile"],
      packAssets: [expect.objectContaining({ kind: "obj", name: "smile", png: "assets/sprite/smile.png" })]
    });
    expect(emoteAssets).toEqual([
      { name: "Smile.png", metasprite: { asset: "smile", index: 0 } }
    ]);
  });

  it("limits emote resource banks to scenes that reference each emote", () => {
    const data = {
      assets: [
        { id: "asset-smile", name: "Smile.png", kind: "Emote", metadata: { source: "Assets/emotes/Smile.png" } },
        { id: "asset-alert", name: "Alert.png", kind: "Emote", metadata: { source: "Assets/emotes/Alert.png" } },
        { id: "asset-unused", name: "Unused.png", kind: "Emote", metadata: { source: "Assets/emotes/Unused.png" } }
      ],
      scenas: [
        { id: "room-town", name: "town", width: 20, height: 18 },
        { id: "room-cave", name: "cave", width: 20, height: 18 }
      ],
      dialogues: [
        { key: "town_line", text: "Ola!", emote: "Smile.png" },
        { key: "cave_line", text: "Cuidado!", emote: "Alert.png" },
        { key: "unused_line", text: "Sem vinculo", emote: "Unused.png" }
      ],
      events: [
        {
          name: "town_event",
          roomName: "town",
          steps: [
            { command: "show_dialogue town_line" },
            { command: "show_actor_gesture Lia Alert.png 30" }
          ]
        },
        {
          name: "cave_event",
          roomName: "cave",
          steps: [{ command: "show_dialogue cave_line" }]
        }
      ]
    } satisfies GBAProjectData;

    const emotePack = buildAssetcEmotePackGeneration(data, null, null);

    expect(emotePack?.assetsByEmoteName["Smile.png"]).toMatchObject({
      bank_group: "scene_town",
      bank_groups: ["scene_town"]
    });
    expect(emotePack?.assetsByEmoteName["Alert.png"]).toMatchObject({
      bank_group: "scene_town",
      bank_groups: ["scene_town", "scene_cave"]
    });
    expect(emotePack?.assetsByEmoteName["Unused.png"]).toMatchObject({
      bank_group: "global",
      bank_groups: ["global", "scene_town", "scene_cave"]
    });
  });

  it("exports sprite animation durations derived from editor fps", () => {
    const project = {
      assets: [
        { id: "asset-hero", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } }
      ],
      actors: [
        { id: "actor-player", name: "Player", roomName: "start", x: 1, y: 1, spriteSheet: "hero.png", animationName: "walk_down" }
      ],
      animations: [
        { id: "anim-walk", name: "walk_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 2, fps: 12 },
        { id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frameCount: 1, fps: 10 }
      ]
    } as GBAProjectData;
    const spritePack = buildAssetcSpritePackGeneration(project);
    const actor = { spriteSheet: "hero.png", animationName: "walk_down" };
    const exportFields = buildActorEngineSpriteExport(project, actor, spritePack);

    expect(exportFields?.animations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "walk_down",
        frame_indices: [0, 1],
        durations: [5, 5]
      })
    ]));
  });

  it("preserves name, fps-derived duration and loop mode for a single animation", () => {
    const actor = {
      id: "actor-sign",
      name: "Sign",
      roomName: "start",
      x: 1,
      y: 1,
      spriteSheet: "sign.png",
      animationName: "blink"
    };
    const project = {
      assets: [
        { id: "asset-sign", name: "sign.png", kind: "Sprite", metadata: { source: "Assets/sprites/sign.png" } }
      ],
      actors: [actor],
      animations: [
        { id: "anim-blink", name: "blink", spriteSheet: "sign.png", frameWidth: 16, frameHeight: 16, frameCount: 2, fps: 12, loops: false }
      ]
    } as GBAProjectData;
    const spritePack = buildAssetcSpritePackGeneration(project);
    const exportFields = buildActorEngineSpriteExport(project, actor, spritePack);

    expect(exportFields).toMatchObject({
      animation: "blink",
      animations: [{
        name: "blink",
        frame_indices: [0, 1],
        durations: [5, 5],
        loops: false
      }]
    });
  });

  it("exports only the explicitly configured Luta animation states", () => {
    const project = exportableProject({
      assets: [{ id: "asset-fighter", name: "fighter.png", kind: "Sprite", metadata: { source: "Assets/sprites/fighter.png" } }],
      actors: [{
        id: "actor-fighter",
        name: "Fighter",
        roomName: "start",
        spriteSheet: "fighter.png",
        animationName: "idle",
        lutaAnimations: {
          idle: "idle",
          attack: "attack",
          special: "special",
          guard: "guard",
          hurt: "hurt",
          fallback: "static_metasprite"
        }
      }],
      animations: ["idle", "attack", "special", "guard", "hurt"].map((name, index) => ({
        id: `anim-${name}`,
        name,
        spriteSheet: "fighter.png",
        frameWidth: 32,
        frameHeight: 64,
        frameCount: name === "attack" || name === "special" ? 2 : 1,
        fps: 6,
        loops: name === "attack" || name === "special" ? false : true,
        frames: Array.from({ length: name === "attack" || name === "special" ? 2 : 1 }, (_item, frameIndex) => ({
          id: `frame-${index}-${frameIndex}`,
          frameIndex,
          tiles: [{ sliceX: frameIndex * 32, sliceY: 0 }]
        }))
      }))
    });
    const actor = (Array.isArray(project.actors) ? project.actors[0] : {}) as Record<string, unknown>;
    const fields = buildLutaActorEngineSpriteExport(project, actor, buildAssetcSpritePackGeneration(project));

    expect(fields?.luta_animation_set).toMatchObject({
      fallback: "static_metasprite",
      idle: { asset: "fighter", frame_indices: [0] },
      attack: { asset: "fighter", frame_indices: [0, 1], loops: false },
      special: { asset: "fighter", frame_indices: [0, 1], loops: false },
      guard: { asset: "fighter", frame_indices: [0] },
      hurt: { asset: "fighter", frame_indices: [0] }
    });

    const fallbackFields = buildLutaActorEngineSpriteExport(
      project,
      { ...actor, lutaAnimations: undefined },
      buildAssetcSpritePackGeneration(project)
    );
    expect(fallbackFields).not.toHaveProperty("luta_animation_set");
  });

  it("maps sprite sheet slices to assetc metasprite indices in row-major order", () => {
    expect(computeAssetcMetaspriteIndex(16, 32, 64, 16, 0)).toBe(1);
    expect(computeAssetcMetaspriteIndex(16, 16, 48, 32, 16)).toBe(5);
  });

  it("builds assetc tileset pack generation for room background assets", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [
        { name: "field", width: 20, height: 18, backgroundAssetName: "tiles_overworld.png" },
        { name: "cave", width: 16, height: 16, background: "tiles_cave.png" }
      ],
      assets: [
        { id: "asset-overworld", name: "tiles_overworld.png", kind: "Tileset", metadata: { source: "Assets/tiles/tiles_overworld.png" } },
        { id: "asset-cave", name: "tiles_cave.png", kind: "Tileset", metadata: { source: "Assets/tiles/tiles_cave.png" } },
        { id: "asset-animation", name: "tiles_animation.png", kind: "Tileset", metadata: { source: "Assets/tiles/tiles_animation.png" } }
      ],
      events: [{
        name: "animate_water",
        steps: [{ command: "replace_tile_animation 2 3 0 4 water_frame tiles_animation.png" }]
      }]
    });

    expect(pack?.assetNames.sort()).toEqual(["tiles_animation", "tiles_cave", "tiles_overworld"]);
    expect(pack?.packAssets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "bg", name: "tiles_overworld", png: "assets/image/tiles_overworld.png" }),
      expect.objectContaining({ kind: "bg", name: "tiles_cave", png: "assets/image/tiles_cave.png" }),
      expect.objectContaining({ kind: "bg", name: "tiles_animation", png: "assets/image/tiles_animation.png" })
    ]));
  });

  it("reserves the runtime demo tile range for point-and-click backgrounds", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "workshop",
        width: 30,
        height: 20,
        backgroundAssetName: "workshop.png",
        runtime: { type: "pointAndClick" }
      }],
      assets: [{
        name: "workshop.png",
        kind: "Background",
        metadata: { source: "Assets/backgrounds/workshop.png" }
      }]
    });

    expect(pack?.assetsBySheet["workshop.png"]).toMatchObject({
      placement: { bg_tiles: { start: 4 } }
    });
  });

  it("keeps an authored isometric background separate from its logical tileset", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "market",
        width: 40,
        height: 30,
        backgroundAssetName: "market-composite.png",
        tilesetAssetName: "market-atlas.png"
      }],
      assets: [
        { name: "market-composite.png", kind: "Background", metadata: { source: "Assets/backgrounds/market-composite.png" } },
        { name: "market-atlas.png", kind: "Tileset", metadata: { source: "Assets/backgrounds/market-atlas.png" } }
      ]
    });

    expect(pack?.assetNames.sort()).toEqual(["market_atlas", "market_composite"]);
    expect(pack?.assetsBySheet["market-composite.png"]).toMatchObject({
      bank_group: "scene_market",
      bank_groups: expect.arrayContaining(["scene_market"])
    });
    expect(pack?.assetsBySheet["market-atlas.png"]).toMatchObject({
      bank_group: "scene_market",
      bank_groups: expect.arrayContaining(["scene_market"])
    });
  });

  it("does not pack an unused logical atlas beside an authored isometric background", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "market-authored",
        width: 40,
        height: 30,
        backgroundAssetName: "market-composite.png",
        tilesetAssetName: "market-atlas.png",
        gbStudioUseBackgroundLayout: true,
        runtime: { type: "isometric", config: { worldMode: "static_composition" } }
      }],
      assets: [
        { name: "market-composite.png", kind: "Background", metadata: { source: "Assets/backgrounds/market-composite.png" } },
        { name: "market-atlas.png", kind: "Tileset", metadata: { source: "Assets/backgrounds/market-atlas.png" } }
      ]
    });

    expect(pack?.assetNames).toEqual(["market_composite"]);
    expect(pack?.assetsBySheet["market-atlas.png"]).toBeUndefined();
  });

  it("does not pack a legacy isometric background beside active tactical pages", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "arena",
        width: 12,
        height: 8,
        sceneType: "isometric",
        backgroundAssetName: "legacy-arena.png",
        tilesetAssetName: "legacy-arena.png",
        runtime: {
          type: "isometric",
          config: {
            gameplayMode: "tactical",
            tacticalPresentation: {
              surfacePages: [
                { id: "r0c0", asset: "arena-r0c0.png", bankGroup: "arena_r0c0", world: { x: 0, y: 0, width: 240, height: 160 } },
                { id: "r0c1", asset: "arena-r0c1.png", bankGroup: "arena_r0c1", world: { x: 240, y: 0, width: 240, height: 160 } }
              ]
            }
          }
        }
      }],
      assets: [
        { name: "legacy-arena.png", kind: "Background", metadata: { source: "Assets/backgrounds/legacy-arena.png" } },
        { name: "arena-r0c0.png", kind: "Background", metadata: { source: "Assets/backgrounds/arena-r0c0.png" } },
        { name: "arena-r0c1.png", kind: "Background", metadata: { source: "Assets/backgrounds/arena-r0c1.png" } }
      ]
    });

    expect(pack?.assetNames.sort()).toEqual(["arena_r0c0", "arena_r0c1"]);
    expect(pack?.assetsBySheet["legacy-arena.png"]).toBeUndefined();
    expect(pack?.assetsBySheet["arena-r0c0.png"]).toMatchObject({
      bank_group: "arena_r0c0",
      bank_groups: ["arena_r0c0"]
    });
  });

  it("rejects regular backgrounds that request the removed 8bpp contract", () => {
    expect(() => buildAssetcTilesetPackGeneration({
      scenas: [
        { name: "rich", width: 30, height: 20, backgroundAssetName: "rich-background.png" }
      ],
      assets: [{
        name: "rich-background.png",
        kind: "Background",
        metadata: { source: "Assets/backgrounds/rich-background.png", colorMode: "8bpp" }
      }]
    })).toThrow(/4bpp/i);
  });

  it("propagates an approved 4bpp tile budget to the assetc background pack", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{ name: "storm", width: 60, height: 20, backgroundAssetName: "storm-sky.png" }],
      assets: [{
        name: "storm-sky.png",
        kind: "Background",
        metadata: {
          source: "Assets/backgrounds/storm-sky.png",
          colorMode: "4bpp",
          backgroundTileOptimizer: { enabled: true, tileBudget: 640 }
        }
      }]
    });

    expect(pack?.assetsBySheet["storm-sky.png"]).toMatchObject({
      kind: "bg",
      background_bpp: 4,
      optimize_background_tiles: true,
      background_tile_budget: 640
    });
  });

  it("propagates the affine tile budget only to pseudo-3D racing floors", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "race",
        width: 40,
        height: 30,
        runtime: {
          type: "racing",
          config: {
            presentation: "pseudo3d",
            pseudo3dVisuals: {
              panoramaBackgroundId: "race-sky.png",
              floorTilemapId: "race-floor.png",
              minimapAssetId: "race-minimap.png"
            }
          }
        }
      }],
      assets: [
        {
          name: "race-floor.png",
          kind: "Background",
          metadata: {
            source: "Assets/backgrounds/race-floor.png",
            colorMode: "4bpp",
            affineTileOptimizer: { enabled: true, tileBudget: 256 }
          }
        },
        { name: "race-sky.png", kind: "Background", metadata: { source: "Assets/backgrounds/race-sky.png" } },
        { name: "race-minimap.png", kind: "Background", metadata: { source: "Assets/backgrounds/race-minimap.png" } }
      ]
    });

    expect(pack?.assetsBySheet["race-floor.png"]).toMatchObject({
      kind: "affine_bg",
      background_bpp: 8,
      optimize_affine_tiles: true,
      affine_tile_budget: 256
    });
    expect(pack?.assetsBySheet["race-sky.png"]).not.toHaveProperty("optimize_affine_tiles");
  });

  it("exports SHMUP Affine assets as native 8bpp affine resources", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "day-shmup",
        width: 90,
        height: 20,
        sceneType: "shmup",
        runtime: {
          type: "shmup",
          config: {
            composition: {
              enabled: true,
              mode: "affine",
              layers: [{ kind: "affine_bg", layer: "BG2", enabled: true, assetId: "day-bg.png" }]
            },
            capabilities: [{ id: "affine_background", enabled: true, settings: {} }]
          }
        }
      }],
      assets: [{
        name: "day-bg.png",
        kind: "Background",
        metadata: {
          source: "Assets/backgrounds/day-bg.png",
          colorMode: "8bpp-affine",
          kind: "affine_bg",
          affineTileOptimizer: { enabled: true, tileBudget: 256 }
        }
      }]
    });

    expect(pack?.assetsBySheet["day-bg.png"]).toMatchObject({
      kind: "affine_bg",
      background_bpp: 8,
      optimize_affine_tiles: true,
      affine_tile_budget: 256
    });
  });

  it("propagates the shared 4bpp palette-bank budget to the assetc background pack", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{ name: "storm", width: 60, height: 20, backgroundAssetName: "storm-waves.png" }],
      assets: [{
        name: "storm-waves.png",
        kind: "Background",
        metadata: {
          source: "Assets/backgrounds/storm-waves.png",
          colorMode: "4bpp",
          backgroundPaletteBankBudget: 3
        }
      }]
    });

    expect(pack?.assetsBySheet["storm-waves.png"]).toMatchObject({
      kind: "bg",
      background_bpp: 4,
      background_palette_banks: 3
    });
  });

  it("reserves banks 14 and 15 for the shared HUD and dialogue palettes", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [
        { name: "with-budget", width: 30, height: 20, backgroundAssetName: "wide-background.png" },
        { name: "without-budget", width: 30, height: 20, backgroundAssetName: "default-background.png" }
      ],
      assets: [
        {
          name: "wide-background.png",
          kind: "Background",
          metadata: {
            source: "Assets/backgrounds/wide-background.png",
            colorMode: "4bpp",
            backgroundPaletteBankBudget: 16
          }
        },
        {
          name: "default-background.png",
          kind: "Background",
          metadata: {
            source: "Assets/backgrounds/default-background.png",
            colorMode: "4bpp"
          }
        }
      ]
    });

    expect(pack?.assetsBySheet["wide-background.png"]).toMatchObject({ background_palette_banks: 14 });
    expect(pack?.assetsBySheet["default-background.png"]).toMatchObject({ background_palette_banks: 14 });
  });

  it("allows sixteen BG banks only when every scene using the asset opts into full screen", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "logo",
        sceneType: "cutscene",
        paletteBankPolicy: "full-screen",
        width: 30,
        height: 20,
        backgroundAssetName: "logo-background.png"
      }],
      assets: [{
        name: "logo-background.png",
        kind: "Background",
        metadata: {
          source: "Assets/backgrounds/logo-background.png",
          colorMode: "4bpp",
          backgroundPaletteBankBudget: 16
        }
      }]
    });

    expect(pack?.assetsBySheet["logo-background.png"]).toMatchObject({ background_palette_banks: 16 });
  });

  it("allows sixteen BG banks for a fight HUD when its scene opts into full screen", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "arena",
        sceneType: "luta",
        paletteBankPolicy: "full-screen",
        width: 30,
        height: 20,
        backgroundAssetName: "arena-background.png",
        runtime: { type: "luta", config: { hudAssetName: "fight-hud.png" } }
      }],
      assets: [{
        name: "fight-hud.png",
        kind: "Background",
        metadata: {
          source: "Assets/backgrounds/fight-hud.png",
          colorMode: "4bpp",
          backgroundPaletteBankBudget: 16,
          backgroundPaletteReferencePlan: {
            banks: Array.from({ length: 16 }, () => [null]),
            tile_palette_banks: []
          }
        }
      }]
    });

    expect(pack?.assetsBySheet["fight-hud.png"]?.background_palette_banks).toBe(16);
    expect(pack?.assetsBySheet["fight-hud.png"]?.background_palette_reference_plan?.banks).toHaveLength(16);
  });

  it("keeps point-and-click backgrounds below the shared UI palette banks", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "workshop",
        sceneType: "pointAndClick",
        paletteBankPolicy: "full-screen",
        width: 30,
        height: 20,
        backgroundAssetName: "workshop.png",
        runtime: { type: "pointAndClick", config: {} }
      }],
      assets: [{
        name: "workshop.png",
        kind: "Background",
        metadata: {
          source: "Assets/backgrounds/workshop.png",
          colorMode: "4bpp",
          backgroundPaletteBankBudget: 16
        }
      }]
    });

    expect(pack?.assetsBySheet["workshop.png"]).toMatchObject({ background_palette_banks: 14 });
  });

  it("keeps a shared UI budget when one asset is reused by mixed scene policies", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [
        {
          name: "logo",
          sceneType: "cutscene",
          paletteBankPolicy: "full-screen",
          width: 30,
          height: 20,
          backgroundAssetName: "shared-background.png"
        },
        {
          name: "dialogue",
          sceneType: "cutscene",
          paletteBankPolicy: "shared-ui",
          width: 30,
          height: 20,
          backgroundAssetName: "shared-background.png"
        }
      ],
      assets: [{
        name: "shared-background.png",
        kind: "Background",
        metadata: {
          source: "Assets/backgrounds/shared-background.png",
          colorMode: "4bpp",
          backgroundPaletteBankBudget: 16
        }
      }]
    });

    expect(pack?.assetsBySheet["shared-background.png"]).toMatchObject({ background_palette_banks: 14 });
  });

  it("keeps a menu title overlay inside the same streamed scene bank as its background", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "title",
        sceneType: "menu",
        width: 30,
        height: 20,
        backgroundAssetName: "title-background.png",
        runtime: {
          type: "menu",
          config: {
            screenType: "title",
            titleOverlayAssetName: "title-overlay.png",
            screens: [{
              id: "title",
              screenType: "title",
              titleOverlayAssetName: "title-overlay.png"
            }]
          }
        }
      }],
      assets: [
        { name: "title-background.png", kind: "Background", metadata: { source: "Assets/backgrounds/title-background.png" } },
        { name: "title-overlay.png", kind: "Background", metadata: { source: "Assets/backgrounds/title-overlay.png" } }
      ]
    });

    expect(pack?.assetsBySheet["title-background.png"]).toMatchObject({
      bank_group: "scene_title",
      bank_groups: ["scene_title"]
    });
    expect(pack?.assetsBySheet["title-overlay.png"]).toMatchObject({
      bank_group: "scene_title",
      bank_groups: ["scene_title"]
    });
  });

  it("keeps a luta HUD inside the same streamed scene bank as its arena", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "arena",
        sceneType: "luta",
        width: 30,
        height: 20,
        backgroundAssetName: "arena-background.png",
        runtime: {
          type: "luta",
          config: { hudAssetName: "fight-hud.png" }
        }
      }],
      assets: [
        { name: "arena-background.png", kind: "Background", metadata: { source: "Assets/backgrounds/arena-background.png" } },
        { name: "fight-hud.png", kind: "Background", metadata: { source: "Assets/backgrounds/fight-hud.png" } }
      ]
    });

    expect(pack?.assetsBySheet["arena-background.png"]).toMatchObject({
      bank_group: "scene_arena",
      bank_groups: ["scene_arena"]
    });
    expect(pack?.assetsBySheet["fight-hud.png"]).toMatchObject({
      bank_group: "scene_arena",
      bank_groups: ["scene_arena"]
    });
  });

  it("reads nested HUD bindings once per pack and refreshes them on the next export", () => {
    let reads = 0;
    let selectedPreset = "hud-icons";
    const binding = { get hudPresetId() { reads += 1; return selectedPreset; } };
    const names = Array.from({ length: 8 }, (_, index) => `icon-${index}.png`);
    const project = {
      scenas: [{ name: "market", sceneType: "isometric", eventData: [binding] }],
      assets: names.map((name) => ({ name, kind: "Sprite", metadata: { source: `Assets/sprites/${name}` } })),
      settings: { hudPresets: [
        { id: "hud-empty", components: [] },
        { id: "hud-icons", components: names.map((asset) => ({ kind: "icon", asset })) }
      ] }
    } as GBAProjectData;
    const first = buildAssetcSpritePackGeneration(project);
    expect(reads).toBe(1);
    for (const name of names) expect(first?.assetsBySheet[name].bank_groups).toEqual(["scene_market"]);
    selectedPreset = "hud-empty";
    reads = 0;
    const second = buildAssetcSpritePackGeneration(project);
    expect(reads).toBe(1);
    for (const name of names) expect(second?.assetsBySheet[name]).toBeUndefined();
  });

  it("keeps advanced HUD icons only in scenes that bind the preset", () => {
    const pack = buildAssetcSpritePackGeneration({
      scenas: [
        { name: "arena", sceneType: "luta", hudPresetId: "hud-arena" },
        { name: "market", sceneType: "isometric", hudPresetId: "hud-market" }
      ],
      assets: [
        { name: "dialogue-sigil.png", kind: "Sprite", metadata: { source: "Assets/sprites/dialogue-sigil.png" } }
      ],
      settings: {
        hudPresets: [
          { id: "hud-arena", components: [{ kind: "text", text: "ARENA" }] },
          { id: "hud-market", components: [{ kind: "icon", asset: "dialogue-sigil.png" }] }
        ]
      }
    } as GBAProjectData);

    expect(pack?.assetsBySheet["dialogue-sigil.png"]).toMatchObject({
      bank_group: "scene_market",
      bank_groups: ["scene_market"]
    });
  });

  it("keeps cutscene step backgrounds inside the cutscene bank", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [{
        name: "prologue",
        sceneType: "cutscene",
        width: 30,
        height: 20,
        backgroundAssetName: "prologue-frame-1.png",
        runtime: {
          type: "cutscene",
          config: {
            steps: [
              { backgroundAssetName: "prologue-frame-2.png" },
              { backgroundAssetName: "prologue-frame-3.png" }
            ]
          }
        }
      }],
      assets: [
        { name: "prologue-frame-1.png", kind: "Background", metadata: { source: "Assets/backgrounds/prologue-frame-1.png" } },
        { name: "prologue-frame-2.png", kind: "Background", metadata: { source: "Assets/backgrounds/prologue-frame-2.png" } },
        { name: "prologue-frame-3.png", kind: "Background", metadata: { source: "Assets/backgrounds/prologue-frame-3.png" } }
      ]
    });

    expect(pack?.assetsBySheet["prologue-frame-2.png"]).toMatchObject({
      bank_group: "scene_prologue_step_0",
      bank_groups: ["scene_prologue_step_0"]
    });
    expect(pack?.assetsBySheet["prologue-frame-3.png"]).toMatchObject({
      bank_group: "scene_prologue_step_1",
      bank_groups: ["scene_prologue_step_1"]
    });
  });

  it("scopes animated tilesets to every scene whose event references the asset", () => {
    const pack = buildAssetcTilesetPackGeneration({
      scenas: [
        { name: "field", width: 20, height: 18, backgroundAssetName: "field.png" },
        { name: "cave", width: 20, height: 18, backgroundAssetName: "cave.png" }
      ],
      assets: [
        { name: "field.png", kind: "Background", metadata: { source: "Assets/backgrounds/field.png" } },
        { name: "cave.png", kind: "Background", metadata: { source: "Assets/backgrounds/cave.png" } },
        { name: "waterfall.png", kind: "Tileset", metadata: { source: "Assets/tilesets/waterfall.png" } }
      ],
      events: [
        {
          name: "animate_field_water",
          roomName: "field",
          steps: [{ command: "replace_tile_animation 2 3 0 4 water_frame waterfall.png" }]
        },
        {
          name: "animate_cave_water",
          roomName: "cave",
          steps: [{ command: "replace_tile_animation 4 5 0 4 water_frame waterfall.png" }]
        }
      ]
    });

    expect(pack?.assetsBySheet["waterfall.png"]).toMatchObject({
      bank_group: "scene_field",
      bank_groups: ["scene_field", "scene_cave"]
    });
  });

  it("assigns one physical asset to deterministic scene bank groups without duplicating shared sprites", () => {
    const data: GBAProjectData = {
      scenas: [
        { name: "field", width: 20, height: 18, playerActorName: "Player", backgroundAssetName: "tiles_field.png" },
        { name: "cave", width: 16, height: 16, playerActorName: "Player", backgroundAssetName: "tiles_cave.png" }
      ],
      actors: [
        { name: "Player", roomName: "field", spriteSheet: "hero.png" },
        { name: "Bat", roomName: "cave", spriteSheet: "bat.png" }
      ],
      assets: [
        { name: "hero.png", kind: "Sprite", metadata: { source: "Assets/sprites/hero.png" } },
        { name: "bat.png", kind: "Sprite", metadata: { source: "Assets/sprites/bat.png" } },
        { name: "tiles_field.png", kind: "Tileset", metadata: { source: "Assets/tiles/tiles_field.png" } },
        { name: "tiles_cave.png", kind: "Tileset", metadata: { source: "Assets/tiles/tiles_cave.png" } }
      ],
      audioItems: [{
        name: "theme",
        kind: "Musica",
        bpm: 120,
        patterns: [{ channels: [{ type: "pulse1", notes: ["C4"] }] }]
      }]
    };

    const sprites = buildAssetcSpritePackGeneration(data);
    const tilesets = buildAssetcTilesetPackGeneration(data);
    const audio = buildAssetcAudioPackGeneration(data);

    expect(sprites?.assetsBySheet["hero.png"]).toMatchObject({
      bank_group: "scene_field",
      bank_groups: ["scene_field", "scene_cave"]
    });
    expect(sprites?.assetsBySheet["bat.png"]).toMatchObject({
      bank_group: "scene_cave",
      bank_groups: ["scene_cave"]
    });
    expect(tilesets?.assetsBySheet["tiles_field.png"]).toMatchObject({
      bank_group: "scene_field",
      bank_groups: ["scene_field"]
    });
    expect(tilesets?.assetsBySheet["tiles_cave.png"]).toMatchObject({
      bank_group: "scene_cave",
      bank_groups: ["scene_cave"]
    });
    expect(audio?.packAsset).toMatchObject({
      bank_group: "global",
      bank_groups: ["global", "scene_field", "scene_cave"]
    });
  });

  it("keeps distinct room players inside only the scene banks that use them", () => {
    const data: GBAProjectData = {
      scenas: [
        { name: "field", sceneType: "topdown", width: 20, height: 18, playerActorName: "Lia" },
        { name: "house", sceneType: "pointAndClick", width: 20, height: 18, playerActorName: "Cursor de Lia" },
        { name: "race", sceneType: "racing", width: 30, height: 20, playerActorName: "Carro de Lia" }
      ],
      actors: [
        { name: "Lia", roomName: "field", spriteSheet: "lia.png" },
        { name: "Cursor de Lia", roomName: "house", spriteSheet: "cursor.png" },
        { name: "Carro de Lia", roomName: "race", spriteSheet: "car.png" }
      ],
      assets: [
        { name: "lia.png", kind: "Sprite", metadata: { source: "Assets/sprites/lia.png" } },
        { name: "cursor.png", kind: "Sprite", metadata: { source: "Assets/sprites/cursor.png" } },
        { name: "car.png", kind: "Sprite", metadata: { source: "Assets/sprites/car.png" } }
      ]
    };

    const sprites = buildAssetcSpritePackGeneration(data);

    expect(sprites?.assetsBySheet["lia.png"]).toMatchObject({
      bank_group: "scene_field",
      bank_groups: ["scene_field"]
    });
    expect(sprites?.assetsBySheet["cursor.png"]).toMatchObject({
      bank_group: "scene_house",
      bank_groups: ["scene_house"]
    });
    expect(sprites?.assetsBySheet["car.png"]).toMatchObject({
      bank_group: "scene_race",
      bank_groups: ["scene_race"]
    });
  });

  it("scopes imported GB Studio runtime players to their matching scene bank groups", () => {
    const data: GBAProjectData = {
      scenas: [
        { name: "field", sceneType: "topdown", width: 20, height: 18 },
        { name: "cave", sceneType: "topdown", width: 20, height: 18 },
        { name: "platform", sceneType: "platformer", width: 80, height: 18 },
        { name: "house", sceneType: "pointAndClick", width: 20, height: 18 }
      ],
      actors: [
        { name: "Player", roomName: "field", spriteSheet: "player.png", gbStudioPlayerRuntime: "TOPDOWN" },
        { name: "Player", roomName: "platform", spriteSheet: "player_platform.png", gbStudioPlayerRuntime: "PLATFORM" },
        { name: "Player", roomName: "house", spriteSheet: "cursor.png", gbStudioPlayerRuntime: "POINTNCLICK" }
      ],
      assets: [
        { name: "player.png", kind: "Sprite", metadata: { source: "Assets/sprites/player.png" } },
        { name: "player_platform.png", kind: "Sprite", metadata: { source: "Assets/sprites/player_platform.png" } },
        { name: "cursor.png", kind: "Sprite", metadata: { source: "Assets/sprites/cursor.png" } }
      ]
    };

    const sprites = buildAssetcSpritePackGeneration(data);
    expect(sprites?.assetsBySheet["player.png"]).toMatchObject({
      bank_group: "scene_field",
      bank_groups: ["scene_field", "scene_cave"]
    });
    expect(sprites?.assetsBySheet["player_platform.png"]).toMatchObject({
      bank_group: "scene_platform",
      bank_groups: ["scene_platform"]
    });
    expect(sprites?.assetsBySheet["cursor.png"]).toMatchObject({
      bank_group: "scene_house",
      bank_groups: ["scene_house"]
    });
  });

  it("marks imported GB Studio sprites to use the top-left palette entry as OBJ transparency", () => {
    const data: GBAProjectData = {
      scenas: [{ name: "space", sceneType: "shmup", width: 20, height: 18 }],
      actors: [{ name: "Enemy", roomName: "space", spriteSheet: "enemy_ship.png" }],
      assets: [{
        name: "enemy_ship.png",
        kind: "Sprite",
        metadata: {
          source: "Assets/sprites/enemy_ship.png",
          gbStudioResourceType: "sprite"
        }
      }]
    };

    expect(buildAssetcSpritePackGeneration(data)?.assetsBySheet["enemy_ship.png"]).toMatchObject({
      transparent_color_index: "top_left"
    });
  });

  it("compiles composed tracker patterns into inline assetc tracker assets", () => {
    const tracker = compileComposedMusicaToTracker({
      bpm: 120,
      loops: true,
      volume: 80,
      patterns: [{
        id: "pattern-a",
        name: "intro",
        steps: 4,
        channels: [{
          id: "pulse",
          type: "pulse1",
          notes: ["C4", "---", "E4", "---"]
        }]
      }],
      patternOrder: ["pattern-a"]
    }, "theme_song");

    expect(tracker).toMatchObject({
      name: "theme_song",
      loop: true,
      order: [0],
      patterns: [{
        steps: expect.arrayContaining([
          expect.objectContaining({ channel: 1, frequency_hz: expect.any(Number), duration_frames: expect.any(Number) }),
          expect.objectContaining({ channel: 1, frequency_hz: expect.any(Number) })
        ])
      }]
    });
  });

  it("preserves every composed tracker row and exports channel timbre and envelope data", () => {
    const tracker = compileComposedMusicaToTracker({
      bpm: 120,
      loops: true,
      volume: 80,
      patterns: [{
        id: "pattern-a",
        name: "intro",
        steps: 4,
        channels: [
          {
            id: "warm-pulse",
            type: "pulse1",
            instrument: "Pulse Warm",
            envelope: "Soft ADSR",
            volume: 40,
            notes: ["C4", "", "E4", ""]
          },
          {
            id: "wave-bass",
            type: "wave",
            instrument: "Wave Bass",
            envelope: "Short Decay",
            volume: 100,
            notes: ["C3", "", "", ""]
          }
        ]
      }],
      patternOrder: ["pattern-a"]
    }, "timbral_theme");

    const steps = tracker?.patterns?.[0]?.steps ?? [];
    expect(steps.reduce((total, step) => total + step.duration_frames, 0)).toBe(60);
    expect(steps.filter((step) => step.volume === 0)).toHaveLength(2);
    expect(steps[0]).toMatchObject({
      channel: 1,
      volume: 5,
      duty: 1,
      attack_frames: 2,
      release_frames: 4,
      waveform: 0
    });
    expect(steps[1]).toMatchObject({
      channel: 3,
      volume: 12,
      attack_frames: 0,
      release_frames: 4,
      waveform: 1
    });
  });

  it("exports one tracker row using the four distinct GBA PSG channels", () => {
    const tracker = compileComposedMusicaToTracker({
      bpm: 120,
      loops: true,
      volume: 80,
      patterns: [{
        id: "chord",
        steps: 1,
        channels: [
          { id: "lead", type: "pulse1", notes: ["C4"] },
          { id: "harmony", type: "pulse2", notes: ["E4"] },
          { id: "bass", type: "wave", notes: ["C3"] },
          { id: "drums", type: "noise", notes: ["K"] }
        ]
      }],
      patternOrder: ["chord"]
    }, "polyphonic_theme");

    expect(tracker?.patterns?.[0]?.steps).toEqual([
      expect.objectContaining({ channel: 1, duration_frames: 0 }),
      expect.objectContaining({ channel: 2, duration_frames: 0 }),
      expect.objectContaining({ channel: 3, duration_frames: 0 }),
      expect.objectContaining({ channel: 4, duration_frames: 15 })
    ]);
  });

  it("compiles composed SFX channel notes into inline assetc sfx tones", () => {
    const sfx = compileComposedSfxToAssetc({
      bpm: 120,
      volume: 100,
      patterns: [{
        id: "pattern-hit",
        channels: [{ id: "noise", type: "noise", notes: ["K", "---"] }]
      }]
    }, "hit");

    expect(sfx).toMatchObject({
      name: "hit",
      tones: [
        expect.objectContaining({ frequency_hz: 64, noise: true, duration_frames: 15 }),
        expect.objectContaining({ frequency_hz: 64, volume: 0, duration_frames: 15 })
      ]
    });
    expect(sfx?.tones.reduce((total, tone) => total + tone.duration_frames, 0)).toBe(30);
  });
});
