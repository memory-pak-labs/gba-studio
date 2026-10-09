import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import { deriveDialoguesWorkspacePresentation } from "./dialoguesWorkspace.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { deriveFilesWorkspacePresentation } from "./filesWorkspace.js";
import { parseGBAProjectFile, serializeGBAProjectFile } from "./projectFile.js";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import { deriveSettingsWorkspacePresentation } from "./settingsWorkspace.js";
import { deriveSpritesWorkspacePresentation } from "./spritesWorkspace.js";

const fixturePath = join(dirname(fileURLToPath(import.meta.url)), "../../../../packages/project-contract/fixtures/topdown-demo.gba-project");

describe("Electron migration fixture", () => {
  it("opens, serializes and derives every migrated workspace from a real .gba-project file", () => {
    const fixture = readFileSync(fixturePath, "utf8");
    const project = parseGBAProjectFile(fixture);
    const reparsed = parseGBAProjectFile(serializeGBAProjectFile(project));

    expect(project.summary).toEqual({
      schemaVersion: 1,
      name: "Electron Topdown Demo",
      rooms: 2,
      assets: 6
    });
    expect(reparsed.data).toEqual(project.data);
    expect(validateGBAProjectMigrationContract(project.data)).toEqual([]);

    const files = deriveFilesWorkspacePresentation(project.data);
    expect(files.assets).toHaveLength(6);
    expect(files.groups.map((group) => group.name)).toEqual(["Arte", "Audio"]);
    expect(files.kindCounts).toEqual([
      { kind: "Audio", count: 2 },
      { kind: "Sprite", count: 3 },
      { kind: "Tileset", count: 1 }
    ]);
    expect(files.assets.map((asset) => ({ name: asset.name, usageCount: asset.usageLabels.length }))).toEqual([
      { name: "tiles_overworld.png", usageCount: 2 },
      { name: "player_topdown_4dir.png", usageCount: 5 },
      { name: "actor_point_click.png", usageCount: 0 },
      { name: "cursor_point_click.png", usageCount: 0 },
      { name: "intro_theme.mod", usageCount: 2 },
      { name: "confirm.wav", usageCount: 2 }
    ]);

    const rooms = deriveRoomsWorkspacePresentation(project.data);
    expect(rooms.summary).toMatchObject({
      roomCount: 2,
      activeRoomName: "overworld_start",
      startRoomName: "overworld_start",
      totalTiles: 1200
    });
    expect(rooms.rooms[0]).toMatchObject({
      name: "overworld_start",
      music: "intro_theme.mod",
      isActive: true,
      isStart: true
    });

    const sprites = deriveSpritesWorkspacePresentation(project.data);
    expect(sprites.summary).toEqual({
      spriteSheetCount: 3,
      animationCount: 2,
      animationStateCount: 1,
      referenceImageCount: 1,
      missingSpriteSheetCount: 0,
      totalFrames: 6
    });

    const events = deriveEventsWorkspacePresentation(project.data);
    expect(events.summary).toMatchObject({
      eventCount: 4,
      stepCount: 6,
      enabledStepCount: 6,
      unlinkedEventCount: 0,
      missingReferenceCount: 0
    });
    expect(events.groups.map((group) => group.title)).toEqual(["Cena", "Atores", "Triggers", "Dialogos"]);

    const dialogues = deriveDialoguesWorkspacePresentation(project.data);
    expect(dialogues.summary).toMatchObject({
      dialogueCount: 2,
      characterCount: 2,
      choiceCount: 4,
      referencedDialogueCount: 2
    });
    expect(dialogues.dialogues.map((dialogue) => dialogue.key)).toEqual(["intro_001", "npc_shop"]);
    expect(dialogues.dialogues[0].referencedByEvents).toEqual(["room_boot"]);

    const audio = deriveAudioWorkspacePresentation(project.data);
    expect(audio.summary).toMatchObject({
      audioCount: 2,
      musicCount: 1,
      sfxCount: 1,
      importedCount: 0,
      composedCount: 2,
      unusedCount: 0,
      attentionCount: 0
    });
    expect(audio.items.map((item) => item.runtimeCommand)).toEqual(["play_sfx confirm.wav", "play_music intro_theme.mod"]);

    const settings = deriveSettingsWorkspacePresentation(project.data);
    expect(settings.summary).toMatchObject({
      hasSettings: true,
      sectionCount: 27,
      configuredPathCount: 2,
      availableSceneTypeCount: 14,
      engineBackend: "gbastudio_engine",
      audioMode: "chiptune_pcm",
      startScene: "overworld_start",
      exportFolder: "build/electron-fixture",
      warnings: []
    });
    expect(settings.sections.find((section) => section.id === "sceneTypes")).toMatchObject({
      group: "Cenas",
      title: "Players e backgrounds"
    });
    expect(settings.sections.find((section) => section.id === "credits")).toMatchObject({
      group: "Aplicativo",
      title: "Créditos"
    });
  });
});
