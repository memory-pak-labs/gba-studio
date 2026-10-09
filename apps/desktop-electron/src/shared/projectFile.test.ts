import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  PROJECT_WORKSPACE_SCHEMAS,
  parseGBAProjectFile,
  serializeGBAProjectFile,
  summarizeGBAProject,
  validateGBAProjectMigrationContract,
  validateAudioSchemaCoverage,
  validateAssetGroupSchemaCoverage,
  validateEventBindingSchemaCoverage,
  validateEventSchemaCoverage,
  validateFilesSchemaCoverage,
  validateRoomConnectionSchemaCoverage,
  validateRoomReferenceSchemaCoverage,
  validateRoomEntitySchemaCoverage,
  validateRoomSchemaCoverage,
  validateSettingsSchemaCoverage,
  validateSpriteSchemaCoverage,
  validateWorkspaceSchemaCoverage
} from "../../../../packages/project-contract/src/index.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/project-contract/fixtures/topdown-demo.gba-project");

describe("GBA project file contract", () => {
  it("parses current .gba-project JSON without discarding unknown fields", () => {
    const project = parseGBAProjectFile(
      JSON.stringify({
        schemaVersion: 7,
        name: "Topdown Demo",
        rooms: [{ id: "room-1", name: "Start", width: 20, height: 18 }],
        assets: [{ id: "asset-1", name: "hero.png", type: "image" }],
        editorState: { selectedWorkspace: "rooms" }
      })
    );

    expect(project.summary).toEqual({
      schemaVersion: 7,
      name: "Topdown Demo",
      rooms: 1,
      assets: 1
    });
    expect(project.data.editorState).toEqual({ selectedWorkspace: "rooms" });
  });

  it("migrates legacy entity and scene event aliases into contextual bindings", () => {
    const project = parseGBAProjectFile(JSON.stringify({
      rooms: [{ name: "Porto Lumen", onEnterEventName: "scene_start" }],
      actors: [{ name: "Nara", eventName: "nara_interact" }],
      triggers: [{
        name: "Farol",
        eventName: "farol_enter",
        onEnterEventName: "farol_enter",
        onLeaveEventName: "farol_leave"
      }]
    }));

    expect(project.data.rooms).toEqual([{
      name: "Porto Lumen",
      eventBindings: { onInit: "scene_start" }
    }]);
    expect(project.data.actors).toEqual([{
      name: "Nara",
      eventBindings: { onInteract: "nara_interact" }
    }]);
    expect(project.data.triggers).toEqual([{
      name: "Farol",
      eventBindings: { onEnter: "farol_enter", onLeave: "farol_leave" }
    }]);
  });

  it("preserves a conflicting legacy alias instead of overwriting a current binding", () => {
    const project = parseGBAProjectFile(JSON.stringify({
      rooms: [{
        name: "Conflito",
        onEnterEventName: "legacy_start",
        eventBindings: { onInit: "current_start" }
      }]
    }));

    expect(project.data.rooms).toEqual([{
      name: "Conflito",
      onEnterEventName: "legacy_start",
      eventBindings: { onInit: "current_start" }
    }]);
  });

  it("rejects Swift split-project manifests instead of treating them as complete monolithic projects", () => {
    expect(() => parseGBAProjectFile(JSON.stringify({
      schemaVersion: 1,
      format: "gbastudio.split-project",
      name: "Swift Split Project",
      activeScene: "room_1",
      parts: {
        settings: "project/settings.json",
        editorState: "project/editor_state.json",
        scenes: ["project/scenes/001-room_1.json"]
      }
    }))).toThrow("Projeto split do Swift");
  });

  it("serializes with stable formatting for auditable saves", () => {
    const project = parseGBAProjectFile('{"schemaVersion":1,"name":"Novo Projeto"}');

    expect(serializeGBAProjectFile(project)).toBe('{\n  "schemaVersion": 1,\n  "name": "Novo Projeto"\n}\n');
  });

  it("summarizes scena-first projects through the shared contract", () => {
    expect(summarizeGBAProject({
      name: "Scena Demo",
      scenas: [{ name: "overworld" }],
      assets: []
    })).toEqual({
      schemaVersion: null,
      name: "Scena Demo",
      rooms: 1,
      assets: 0
    });
  });

  it("declares shared workspace schemas covered by the migration fixture", () => {
    expect(PROJECT_WORKSPACE_SCHEMAS.map((schema) => schema.id)).toEqual([
      "files",
      "rooms",
      "sprites",
      "events",
      "audio",
      "settings"
    ]);

    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateWorkspaceSchemaCoverage(project.data)).toEqual([]);
    expect(validateWorkspaceSchemaCoverage({
      assets: [],
      events: [],
      settings: {}
    })).toEqual([
      { workspace: "rooms", missingKeys: ["scenas|rooms"] },
      { workspace: "sprites", missingKeys: ["animations", "animationStates", "spriteReferenceImages"] },
      { workspace: "audio", missingKeys: ["audioItems"] }
    ]);
  });

  it("validates the full migration contract with validator provenance", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateGBAProjectMigrationContract(project.data)).toEqual([]);
    expect(validateGBAProjectMigrationContract({
      assets: [{ id: "", name: "missing.png", kind: "Sprite" }],
      scenas: [{ name: "start", width: 10, height: 8 }],
      events: [{ name: "bad", category: "Cena", command: "change_scene missing" }],
      settings: {}
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ validator: "workspace" }),
      expect.objectContaining({ validator: "files" }),
      expect.objectContaining({ validator: "events" }),
      expect.objectContaining({ validator: "settings" })
    ]));
  });

  it("validates detailed room schema coverage for current scenas", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateRoomSchemaCoverage(project.data)).toEqual([]);
    expect(validateRoomSchemaCoverage({
      scenas: [
        { name: "valid", width: 2, height: 2, tilemap: [0, 1, 2, 3], collisionTypes: ["free", "solid", "free", "free"] },
        { name: "below_viewport", width: 29, height: 19 },
        { name: "", width: 20 },
        { width: "wide", height: 18 },
        { name: "fractional", width: 2.5, height: 2 },
        { name: "bad_tilemap", width: 2, height: 2, tilemap: [1, "two"], collisionTypes: "none" },
        { name: "bad_collision_size", width: 2, height: 2, collisionTypes: ["solid", "free", "solid", "free", "solid"] }
      ]
    })).toEqual([
      { roomIndex: 2, roomName: "Room 3", missingFields: ["height"], invalidFields: ["name"] },
      { roomIndex: 3, roomName: "Room 4", missingFields: ["name"], invalidFields: ["width"] },
      { roomIndex: 4, roomName: "fractional", missingFields: [], invalidFields: ["width"] },
      { roomIndex: 5, roomName: "bad_tilemap", missingFields: [], invalidFields: ["tilemap[1]", "tilemap.length", "collisionTypes"] },
      { roomIndex: 6, roomName: "bad_collision_size", missingFields: [], invalidFields: ["collisionTypes.length"] }
    ]);
  });

  it("accepts compact RLE room resources with the declared cell count", () => {
    expect(validateRoomSchemaCoverage({
      scenas: [{
        name: "compact",
        width: 2,
        height: 2,
        tilemap: { encoding: "rle-v1", length: 4, runs: [[0, 4]] },
        collisionTypes: { encoding: "rle-v1", length: 4, runs: [["free", 4]] }
      }]
    })).toEqual([]);
  });

  it("validates detailed room entity schema coverage for actors and triggers", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateRoomEntitySchemaCoverage(project.data)).toEqual([]);
    expect(validateRoomEntitySchemaCoverage({
      scenas: [{ name: "overworld", width: 10, height: 8 }],
      actors: [
        { id: "actor-player", name: "Player", roomName: "overworld", x: 1, y: 2 },
        { id: "", name: "Blank", roomName: "missing", x: "left", y: 2 },
        { id: "actor-nameless" },
        { id: "actor-out", name: "Out", roomName: "overworld", x: 10, y: -1 }
      ],
      triggers: [
        { id: "trigger-door", name: "Door", roomName: "overworld", x: 4, y: 5, width: 2, height: 1 },
        { id: "trigger-bad", name: "", roomName: "missing", x: 1, y: null, width: 0, height: "tall" },
        { name: "No ID" },
        { id: "trigger-out", name: "Out", roomName: "overworld", x: 9, y: 7, width: 2, height: 2 }
      ]
    })).toEqual([
      { source: "actors", itemIndex: 1, itemName: "Blank", missingFields: [], invalidFields: ["id", "roomName", "x"] },
      { source: "actors", itemIndex: 2, itemName: "Actor 3", missingFields: ["name"], invalidFields: [] },
      { source: "actors", itemIndex: 3, itemName: "Out", missingFields: [], invalidFields: ["x", "y"] },
      { source: "triggers", itemIndex: 1, itemName: "Trigger 2", missingFields: [], invalidFields: ["name", "roomName", "y", "width", "height"] },
      { source: "triggers", itemIndex: 2, itemName: "No ID", missingFields: ["id"], invalidFields: [] },
      { source: "triggers", itemIndex: 3, itemName: "Out", missingFields: [], invalidFields: ["x", "y"] }
    ]);
  });

  it("validates detailed room connection schema coverage for editor scene links", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateRoomConnectionSchemaCoverage(project.data)).toEqual([]);
    expect(validateRoomConnectionSchemaCoverage({
      scenas: [
        { name: "overworld", width: 10, height: 8 },
        { name: "shop", width: 10, height: 8 }
      ],
      editorState: {
        scenaConnections: [
          { from: "overworld", to: "shop", eventName: "door_enter" },
          { from: "", to: "shop", eventName: "blank_from" },
          { from: "overworld", to: "missing", eventName: "missing_to" },
          { from: "shop", to: "shop", eventName: "self_link" },
          { from: "missing", to: 7, eventName: "" }
        ]
      }
    })).toEqual([
      { connectionIndex: 1, connectionName: "blank_from", missingFields: [], invalidFields: ["from"] },
      { connectionIndex: 2, connectionName: "missing_to", missingFields: [], invalidFields: ["to"] },
      { connectionIndex: 3, connectionName: "self_link", missingFields: [], invalidFields: ["to"] },
      { connectionIndex: 4, connectionName: "Connection 5", missingFields: [], invalidFields: ["from", "to", "eventName"] }
    ]);
  });

  it("validates detailed room reference schema coverage for music, backgrounds and player actors", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateRoomReferenceSchemaCoverage(project.data)).toEqual([]);
    expect(validateRoomReferenceSchemaCoverage({
      scenas: [
        {
          name: "overworld",
          width: 10,
          height: 8,
          music: "missing.mod",
          backgroundAssetName: "missing_tiles.png",
          playerActorName: "Ghost"
        },
        {
          name: "shop",
          width: 10,
          height: 8,
          music: "theme.mod",
          backgroundAssetName: "forest.png",
          playerActorName: "Player"
        },
        {
          name: "quiet",
          width: 10,
          height: 8,
          music: "silent",
          backgroundAssetName: "",
          playerActorName: ""
        }
      ],
      assets: [
        { id: "asset-tiles", name: "forest.png", kind: "Tileset" },
        { id: "asset-theme", name: "theme.mod", kind: "Audio" }
      ],
      audioItems: [{ name: "theme.mod", kind: "Musica" }],
      actors: [{ id: "actor-player", name: "Player", roomName: "shop" }]
    })).toEqual([
      {
        roomIndex: 0,
        roomName: "overworld",
        invalidFields: ["music", "backgroundAssetName", "playerActorName"]
      }
    ]);
  });

  it("validates detailed files schema coverage for current assets", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateFilesSchemaCoverage(project.data)).toEqual([]);
    expect(validateFilesSchemaCoverage({
      assets: [
        { id: "valid", name: "hero.png", kind: "Sprite", metadata: { source: "Assets/hero.png" } },
        { id: "", name: "blank-id.png", kind: "Sprite" },
        { id: "missing-fields" },
        { id: "bad-source", name: "bad.png", kind: "Sprite", metadata: { source: "" } },
        { id: "bad-metadata", name: "meta.png", kind: "Sprite", metadata: "Assets/meta.png" }
      ]
    })).toEqual([
      { assetIndex: 1, assetName: "blank-id.png", missingFields: [], invalidFields: ["id"] },
      { assetIndex: 2, assetName: "Asset 3", missingFields: ["name", "kind"], invalidFields: [] },
      { assetIndex: 3, assetName: "bad.png", missingFields: [], invalidFields: ["metadata.source"] },
      { assetIndex: 4, assetName: "meta.png", missingFields: [], invalidFields: ["metadata"] }
    ]);
  });

  it("validates detailed asset group schema coverage recursively", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateAssetGroupSchemaCoverage(project.data)).toEqual([]);
    expect(validateAssetGroupSchemaCoverage({
      assets: [{ id: "asset-1", name: "hero.png", kind: "Sprite" }],
      assetGroups: [
        {
          id: "group-art",
          name: "Arte",
          assetIDs: ["asset-1", "missing-asset"],
          children: [
            { id: "", name: "Filho", assetIDs: "asset-1", children: [] },
            { id: "bad-child", name: "", assetIDs: [], children: "none" }
          ]
        }
      ]
    })).toEqual([
      { groupPath: "Arte", missingFields: [], invalidFields: ["assetIDs[1]"] },
      { groupPath: "Arte / Filho", missingFields: [], invalidFields: ["id", "assetIDs"] },
      { groupPath: "Arte / Group 2", missingFields: [], invalidFields: ["name", "children"] }
    ]);
  });

  it("validates detailed audio schema coverage for current audio items", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateAudioSchemaCoverage(project.data)).toEqual([]);
    expect(validateAudioSchemaCoverage({
      assets: [{ id: "asset-valid", name: "valid.mod", kind: "Audio" }],
      audioItems: [
        { name: "valid.mod", kind: "Musica", bpm: 120, volume: 80, patterns: [{ id: "intro", name: "Intro" }], patternOrder: ["intro"] },
        { name: "", kind: "SFX" },
        { name: "bad.wav", kind: "Voice" },
        { kind: "music" },
        { name: "missing.wav", kind: "SFX", bpm: 20, volume: 140, patterns: [{ id: "hit", name: "Hit" }], patternOrder: ["missing-pattern", ""] },
        {
          name: "broken_tracker.mod",
          kind: "Musica",
          patterns: [
            { id: "", name: "Blank", channels: "pulse" },
            {
              id: "loop",
              name: "",
              channels: [
                { id: "", name: "Pulse", type: "", notes: ["C4", 7], muted: "no", solo: false, volume: 101 },
                { id: "wave", notes: "C4" }
              ]
            }
          ],
          channels: [
            { id: "direct", name: "Direct", type: "wave", notes: ["A3"], muted: false, solo: true, volume: 12 },
            { id: "direct-bad", name: "", type: "noise", notes: [null], solo: "yes", volume: -1 }
          ]
        },
        {
          name: "gb_builtin_crash",
          kind: "SFX",
          format: "COMPOSED",
          bpm: 60,
          volume: 90,
          patterns: [{
            id: "crash",
            name: "Crash",
            channels: [{ id: "noise", name: "Noise", type: "noise", notes: ["K"] }]
          }]
        }
      ]
    })).toEqual([
      { audioIndex: 1, audioName: "Audio 2", missingFields: [], invalidFields: ["name"] },
      { audioIndex: 2, audioName: "bad.wav", missingFields: [], invalidFields: ["name", "kind"] },
      { audioIndex: 3, audioName: "Audio 4", missingFields: ["name"], invalidFields: [] },
      { audioIndex: 4, audioName: "missing.wav", missingFields: [], invalidFields: ["name", "bpm", "volume", "patternOrder[0]", "patternOrder[1]"] },
      {
        audioIndex: 5,
        audioName: "broken_tracker.mod",
        missingFields: [],
        invalidFields: [
          "name",
          "patterns[0].id",
          "patterns[0].channels",
          "patterns[1].name",
          "patterns[1].channels[0].id",
          "patterns[1].channels[0].type",
          "patterns[1].channels[0].notes[1]",
          "patterns[1].channels[0].muted",
          "patterns[1].channels[0].volume",
          "patterns[1].channels[1].name",
          "patterns[1].channels[1].type",
          "patterns[1].channels[1].notes",
          "channels[1].name",
          "channels[1].notes[0]",
          "channels[1].solo",
          "channels[1].volume"
        ]
      }
    ]);
  });

  it("validates detailed event schema coverage for current event scripts", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateEventSchemaCoverage(project.data)).toEqual([]);
    expect(validateEventSchemaCoverage({
      scenas: [{ name: "start", width: 10, height: 8 }],
      audioItems: [{ name: "theme.mod", kind: "Musica" }, { name: "confirm.wav", kind: "SFX" }],
      dialogues: [{ key: "intro" }],
      events: [
        { name: "valid", category: "Controle", command: "play_music theme.mod" },
        { name: "target", category: "Controle", command: "noop" },
        { name: "", category: "Controle", command: "noop" },
        { name: "missing_command", category: "Controle" },
        { name: "bad_steps_shape", category: "Controle", command: "noop", steps: "noop" },
        { name: "bad_step", category: "", steps: [{ command: "" }, { note: "missing command" }] },
        { name: "bad_step_enabled", category: "Controle", steps: [{ command: "noop", isEnabled: "yes" }] },
        { name: "bad_refs", category: "Cena", command: "change_scene missing_room", steps: [{ command: "play_sfx missing.wav" }, { command: "play_music confirm.wav" }] },
        {
          name: "bad_event_refs",
          category: "Controle",
          command: "call_event missing_event",
          steps: [
            { command: "call_event target" },
            { command: "choice_event intro 0 missing_choice_target" },
            { command: "attach_button A missing_button_target" },
            { command: "timer_attach timer1 missing_timer_target" }
          ]
        },
        {
          name: "bad_dialogue_refs",
          category: "Dialogo",
          command: "show_dialogue missing_dialogue",
          steps: [
            { command: "show_choice missing_choice" },
            { command: "choice_event missing_choice 0 target" },
            { command: "choice_event intro two target" }
          ]
        }
      ]
    })).toEqual([
      { eventIndex: 2, eventName: "Evento 3", missingFields: [], invalidFields: ["name"] },
      { eventIndex: 3, eventName: "missing_command", missingFields: ["command|steps"], invalidFields: [] },
      { eventIndex: 4, eventName: "bad_steps_shape", missingFields: [], invalidFields: ["steps"] },
      { eventIndex: 5, eventName: "bad_step", missingFields: [], invalidFields: ["category", "steps[0].command", "steps[1].command"] },
      { eventIndex: 6, eventName: "bad_step_enabled", missingFields: [], invalidFields: ["steps[0].isEnabled"] },
      { eventIndex: 7, eventName: "bad_refs", missingFields: [], invalidFields: ["command", "steps[0].command", "steps[1].command"] },
      { eventIndex: 8, eventName: "bad_event_refs", missingFields: [], invalidFields: ["command", "steps[1].command", "steps[2].command", "steps[3].command"] },
      { eventIndex: 9, eventName: "bad_dialogue_refs", missingFields: [], invalidFields: ["command", "steps[0].command", "steps[1].command", "steps[2].command"] }
    ]);
  });

  it("validates event binding references from rooms, entities and scene connections", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateEventBindingSchemaCoverage(project.data)).toEqual([]);
    expect(validateEventBindingSchemaCoverage({
      scenas: [
        { name: "overworld", eventName: "room_boot", eventBindings: { onInit: "missing_room_init", onExit: "room_exit", onHitActor: "" } }
      ],
      actors: [
        { name: "Player", eventName: "missing_actor_event", eventBindings: { onInteract: "npc_talk", onUpdate: "" } }
      ],
      triggers: [
        {
          name: "Door",
          eventName: "door_enter",
          onEnterEventName: "missing_enter",
          onLeaveEventName: "door_leave",
          eventBindings: { onUse: "missing_trigger_binding" }
        }
      ],
      editorState: {
        scenaConnections: [
          { from: "overworld", to: "shop", eventName: "missing_connection_event" }
        ]
      },
      events: [
        { name: "room_boot", category: "Cena", command: "noop" },
        { name: "room_exit", category: "Cena", command: "noop" },
        { name: "npc_talk", category: "Atores", command: "noop" },
        { name: "door_enter", category: "Triggers", command: "noop" },
        { name: "door_leave", category: "Triggers", command: "noop" }
      ]
    })).toEqual([
      { source: "rooms", itemName: "overworld", invalidFields: ["eventBindings.onInit"] },
      { source: "actors", itemName: "Player", invalidFields: ["eventName"] },
      { source: "triggers", itemName: "Door", invalidFields: ["onEnterEventName", "eventBindings.onUse"] },
      { source: "scenaConnections", itemName: "overworld -> shop", invalidFields: ["eventName"] }
    ]);
  });

  it("validates detailed sprite schema coverage for current animations and states", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    expect(validateSpriteSchemaCoverage(project.data)).toEqual([]);
    expect(validateSpriteSchemaCoverage({
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite" }],
      animations: [
        {
          id: "anim-valid",
          name: "valid",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 32,
          originY: -8,
          frames: [
            {
              width: 16,
              height: 32,
              originX: 8,
              originY: -8,
              tiles: [
                { x: -8, y: 0, sliceX: 0, sliceY: 0, sourceSheet: "hero.png", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, paletteIndex: 0, priority: false },
                { x: 0, y: 0, sliceX: 8, sliceY: 0, sourceSheet: "", tileWidth: 8, tileHeight: 8, flipX: false, flipY: false, paletteIndex: 0, priority: false }
              ]
            }
          ]
        },
        { name: "", spriteSheet: "hero.png", frameWidth: 16 },
        { id: "anim-bad-size", name: "bad_size", spriteSheet: "", frameWidth: "wide", frameHeight: 16 },
        { id: "anim-missing-sheet", name: "missing_sheet", spriteSheet: "missing.png", frameWidth: 16, frameHeight: 16 },
        {
          id: "anim-bad-frames",
          name: "bad_frames",
          spriteSheet: "hero.png",
          frameWidth: 16,
          frameHeight: 16,
          frames: [
            {
              width: 0,
              height: "tall",
              originX: Number.NaN,
              originY: Number.NaN,
              tiles: [
                { x: 0, y: 0, sliceX: -1, sliceY: 0, sourceSheet: "missing.png", tileWidth: 0, tileHeight: 8, flipX: "yes", paletteIndex: 16, priority: "no" },
                "tile"
              ]
            },
            "frame"
          ]
        },
        { id: "anim-bad-frames-shape", name: "bad_frames_shape", spriteSheet: "hero.png", frameWidth: 16, frameHeight: 16, frames: "frame" }
      ],
      animationStates: [
        { id: "state-idle", name: "idle", spriteSheet: "hero.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: ["anim-valid"] },
        { id: "state-empty-name", name: "", spriteSheet: "hero.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: [] },
        { id: "state-bad-shape", spriteSheet: "hero.png", animationType: "fixed", mirrorLeftFromRight: false, animationIDs: "anim-valid" },
        { id: "state-bad-ref", name: "bad-ref", spriteSheet: "hero.png", animationType: "four_direction_movement", mirrorLeftFromRight: true, animationIDs: ["anim-valid", "missing-anim", ""] },
        { id: "", name: "bad-contract", spriteSheet: "missing.png", animationType: "fixed_direction", mirrorLeftFromRight: "yes", animationIDs: [] }
      ]
    })).toEqual([
      { source: "animations", itemIndex: 1, itemName: "Sprite 2", missingFields: ["frameHeight"], invalidFields: ["name"] },
      { source: "animations", itemIndex: 2, itemName: "bad_size", missingFields: [], invalidFields: ["spriteSheet", "frameWidth"] },
      { source: "animations", itemIndex: 3, itemName: "missing_sheet", missingFields: [], invalidFields: ["spriteSheet"] },
      {
        source: "animations",
        itemIndex: 4,
        itemName: "bad_frames",
        missingFields: [],
        invalidFields: [
          "frames[0].width",
          "frames[0].height",
          "frames[0].originX",
          "frames[0].originY",
          "frames[0].tiles[0].sliceX",
          "frames[0].tiles[0].sourceSheet",
          "frames[0].tiles[0].tileWidth",
          "frames[0].tiles[0].flipX",
          "frames[0].tiles[0].priority",
          "frames[0].tiles[0].paletteIndex",
          "frames[0].tiles[1]",
          "frames[1]"
        ]
      },
      { source: "animations", itemIndex: 5, itemName: "bad_frames_shape", missingFields: [], invalidFields: ["frames"] },
      { source: "animationStates", itemIndex: 1, itemName: "Sprite State 2", missingFields: [], invalidFields: ["name"] },
      { source: "animationStates", itemIndex: 2, itemName: "Sprite State 3", missingFields: ["name"], invalidFields: ["animationIDs"] },
      { source: "animationStates", itemIndex: 3, itemName: "bad-ref", missingFields: [], invalidFields: ["animationIDs[1]", "animationIDs[2]"] },
      { source: "animationStates", itemIndex: 4, itemName: "bad-contract", missingFields: [], invalidFields: ["id", "spriteSheet", "animationType", "mirrorLeftFromRight"] }
    ]);
  });

  it("aceita animationType directional_view", () => {
    expect(validateSpriteSchemaCoverage({
      assets: [{ id: "asset-hero", name: "hero.png", kind: "Sprite" }],
      animations: [{
        id: "anim-directional",
        name: "Directional",
        spriteSheet: "hero.png",
        frameWidth: 16,
        frameHeight: 32
      }],
      animationStates: [{
        id: "state-directional",
        name: "Directional",
        spriteSheet: "hero.png",
        animationType: "directional_view",
        mirrorLeftFromRight: false,
        animationIDs: ["anim-directional"]
      }]
    })).toEqual([]);
  });

  it("validates detailed settings schema coverage for current settings sections", () => {
    const project = parseGBAProjectFile(readFileSync(fixturePath, "utf8"));
    const settings = project.data.settings as Record<string, unknown>;
    expect(validateSettingsSchemaCoverage(project.data)).toEqual([]);
    expect(validateSettingsSchemaCoverage({
      ...project.data,
      settings: {
        ...settings,
        save: { ...(settings.save as Record<string, unknown>), saveType: "flash1m" }
      }
    })).toEqual([]);
    expect(validateSettingsSchemaCoverage({
      scenas: [{ name: "overworld", width: 10, height: 8 }],
      settings: {
        general: { gameTitle: "Broken", startScene: "missing_room", exportFolder: "build" },
        build: { romFileName: "game.gba", exportFormat: "gba_rom", engineBackend: "butano" },
        preview: { defaultMode: "quick_preview", scale: "large", runAfterBuild: false },
        audio: { audioEngine: "butano_audio", audioMode: "chiptune_pcm", masterVolume: 100 }
      }
    })).toEqual([
      { section: "general", missingFields: [], invalidFields: ["startScene"] },
      { section: "preview", missingFields: [], invalidFields: ["scale"] },
      { section: "save", missingFields: ["section"], invalidFields: [] },
      { section: "debug", missingFields: ["section"], invalidFields: [] }
    ]);
    expect(validateSettingsSchemaCoverage({
      scenas: [{ name: "overworld", width: 10, height: 8 }],
      settings: {
        general: { gameTitle: "Needs Engine Pack", startScene: "overworld", exportFolder: "build" },
        build: { romFileName: "game.gba", exportFormat: "gba_rom", engineBackend: "gbastudio_engine" },
        preview: { defaultMode: "quick_preview", scale: 3, runAfterBuild: false },
        audio: { audioEngine: "gbastudio_engine_audio", audioMode: "chiptune_pcm", masterVolume: 100 },
        save: { saveType: "sram", slots: 3, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    })).toEqual([
      { section: "build", missingFields: [], invalidFields: ["enginePackPath"] }
    ]);
    expect(validateSettingsSchemaCoverage({
      scenas: [{ name: "overworld", width: 10, height: 8 }],
      settings: {
        general: { gameTitle: "Broken Settings", startScene: "overworld", exportFolder: "" },
        build: { romFileName: "bad name.txt", exportFormat: "zip", engineBackend: "gbastudio_engine", enginePackPath: "/opt/GBAStudioEnginePack" },
        preview: { defaultMode: "remote", scale: 0, runAfterBuild: false },
        audio: { audioEngine: "unknown_audio", audioMode: "mp3", masterVolume: 128 },
        save: { saveType: "cloud", slots: 0, autoSave: true },
        debug: { developerMode: false, preserveTempFiles: false, exportReadableButanoProject: false }
      }
    })).toEqual([
      { section: "general", missingFields: [], invalidFields: ["exportFolder"] },
      { section: "build", missingFields: [], invalidFields: ["romFileName", "exportFormat"] },
      { section: "preview", missingFields: [], invalidFields: ["defaultMode", "scale"] },
      { section: "audio", missingFields: [], invalidFields: ["audioEngine", "audioMode", "masterVolume"] },
      { section: "save", missingFields: [], invalidFields: ["saveType", "slots"] }
    ]);
  });
});
