import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import p0SourceCatalog from "../../scripts/p0-source-catalog.json" with { type: "json" };
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import { deriveDialoguesWorkspacePresentation } from "./dialoguesWorkspace.js";
import { deriveEventsWorkspacePresentation } from "./eventsWorkspace.js";
import { deriveFilesWorkspacePresentation } from "./filesWorkspace.js";
import {
  parseGBAProjectFile,
  serializeGBAProjectFile
} from "./projectFile.js";
import { deriveRoomsWorkspacePresentation } from "./roomsWorkspace.js";
import { deriveSpritesWorkspacePresentation } from "./spritesWorkspace.js";
import { deriveSettingsWorkspacePresentation } from "./settingsWorkspace.js";
import { generateEngineProjectExport } from "./engineProjectExport.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { buildFunctionalP0Project, provenEditorFeatures } from "./functionalP0Project.js";
import { createPreviewRuntime, dispatchPreviewRuntimeAction } from "./previewRuntime.js";
import { validateGBAProjectMigrationContract } from "../../../../packages/project-contract/src/index.js";
import {
  verifyNativeVisualExportContract,
  verifyTopdownWalk4DirsExportContract
} from "../../scripts/lib/native-visual-rom-contracts.mjs";

function writeEvidenceIfRequested(evidence: Record<string, unknown>): void {
  const outputPath = process.env.GBA_STUDIO_FUNCTIONAL_PLAYTEST_EVIDENCE;
  if (!outputPath) return;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

describe("Electron technical P0 fixture flow", () => {
  it("creates, edits, saves, reopens and exports the minimum real project data before ROM/playtest", () => {
    const project = buildFunctionalP0Project();
    const serialized = serializeGBAProjectFile({ data: project, summary: { schemaVersion: 1, name: "Electron P0 Functional", rooms: 2, assets: 16 } });
    const reopened = parseGBAProjectFile(serialized);
    const issues = validateGBAProjectMigrationContract(reopened.data);

    expect(issues).toEqual([]);
    expect(reopened.summary).toMatchObject({
      name: "Electron P0 Functional",
      rooms: 2,
      assets: 16
    });
    const reopenedAssets = reopened.data.assets as Array<{ name: string }>;
    expect(new Set(reopenedAssets.map((asset) => asset.name)).size).toBe(reopenedAssets.length);

    const rooms = deriveRoomsWorkspacePresentation(reopened.data);
    const events = deriveEventsWorkspacePresentation(reopened.data);
    const sprites = deriveSpritesWorkspacePresentation(reopened.data);
    const dialogues = deriveDialoguesWorkspacePresentation(reopened.data);
    const audio = deriveAudioWorkspacePresentation(reopened.data);
    const files = deriveFilesWorkspacePresentation(reopened.data);
    const settings = deriveSettingsWorkspacePresentation(reopened.data);
    const exported = generateEngineProjectExport(reopened.data);
    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    const introDialogue = dialogues.dialogues.find((dialogue) => dialogue.key === "intro_001");
    const previewRuntime = createPreviewRuntime(reopened.data);
    const previewRuntimeAfterAction = dispatchPreviewRuntimeAction(
      dispatchPreviewRuntimeAction(previewRuntime, "action"),
      "action"
    );

    expect(rooms.summary.roomCount).toBe(2);
    // cena_1 = sandbox stage_1 32x32; room_2 = 30x20
    expect(rooms.summary.totalTiles).toBe(32 * 32 + 30 * 20);
    expect(rooms.rooms.find((room) => room.name === "cena_1")).toMatchObject({
      width: 32,
      height: 32,
      background: "tiles_topdown_sandbox.png"
    });
    expect(rooms.rooms.find((room) => room.name === "cena_1")?.tileCells.slice(0, 4)).toEqual([142, 0, 0, 142]);
    // A topdown collision edit now targets the physical 2x2 cells of one
    // 16x16 authoring metatile.
    expect(rooms.rooms.find((room) => room.name === "cena_1")?.collisionCount).toBe(4);
    expect(rooms.entities.map((entity) => `${entity.kind}:${entity.name}`).sort()).toEqual([
      "actor:Guide",
      "actor:Player",
      "actor:Player",
      "trigger:Door to room 2"
    ]);
    expect(rooms.entities.find((entity) => entity.kind === "actor" && entity.name === "Player")).toMatchObject({
      spriteSheet: "player_topdown_4dir.png",
      animationName: "idle_down",
      spriteSource: "Assets/sprites/player_topdown_4dir.png"
    });
    expect(rooms.entities.find((entity) => entity.kind === "actor" && entity.name === "Guide")).toMatchObject({
      spriteSheet: "player_topdown_4dir.png",
      animationName: "idle_right",
      spriteSource: "Assets/sprites/player_topdown_4dir.png"
    });

    expect(events.summary).toMatchObject({
      eventCount: 5,
      unlinkedEventCount: 0,
      missingReferenceCount: 0
    });
    expect(dialogues.summary).toMatchObject({
      dialogueCount: 2,
      choiceCount: 2,
      referencedDialogueCount: 2
    });
    expect(introDialogue?.text).toBe("ROM OK. TESTE A CENA.");
    expect(introDialogue?.text).toMatch(/^[A-Z0-9 .!:/-]+$/);
    expect(introDialogue?.text.length).toBeLessThanOrEqual(28);
    expect(dialogues.dialogues.find((dialogue) => dialogue.key === "guide_001")).toMatchObject({
      character: "Guia",
      text: "A PORTA LEVA AO SEGUNDO CAIS."
    });
    expect(sprites.summary).toMatchObject({
      spriteSheetCount: 8,
      animationCount: 28,
      missingSpriteSheetCount: 0,
      totalFrames: 35
    });
    // The current fighter has one frame for walk/jump/fall and two for attack.
    expect(sprites.animationsBySheet["nara-fighter.png"].map(({name, frameCount}) => ({name, frameCount}))).toEqual([
      {name: "attack", frameCount: 2},
      {name: "fall", frameCount: 1},
      {name: "hurt", frameCount: 1},
      {name: "idle", frameCount: 1},
      {name: "jump", frameCount: 1},
      {name: "walk", frameCount: 1}
    ]);
    expect(sprites.animationsBySheet["player_topdown_4dir.png"].map((animation) => animation.name)).toEqual(
      expect.arrayContaining(["idle_down", "idle_up", "idle_right", "walk_down", "walk_up", "walk_right"])
    );
    expect(audio.summary).toMatchObject({
      audioCount: 2,
      musicCount: 1,
      totalPatterns: 1,
      totalChannels: 4
    });
    expect(files.assets.map((asset) => asset.name).sort()).toEqual([
      "actor_isometric.png",
      "actor_point_click.png",
      "confirm.wav",
      "cursor_point_click.png",
      "dialogue_box.png",
      "dialogue_selector.png",
      "gba-dialogue-font-v3.png",
      "gba-variable-font.png",
      "intro_theme.mod",
      "nara-fighter.png",
      "nara-racer.png",
      "player_platformer.png",
      "player_shmup.png",
      "player_topdown_4dir.png",
      "portrait.png",
      "tiles_topdown_sandbox.png"
    ]);
    expect(settings.summary).toMatchObject({
      hasSettings: true,
      engineBackend: "gbastudio_engine",
      exportFolder: "build/electron-p0"
    });
    expect(previewRuntime.currentRoom?.name).toBe("cena_1");
    expect(previewRuntime.player).toMatchObject({
      name: "Player",
      spriteSheet: "player_topdown_4dir.png",
      animationName: "idle_down"
    });
    expect(previewRuntime.activeDialogue?.key).toBe("intro_001");
    expect(previewRuntime.activeDialogue?.mode).toBe("dialogue");
    expect(previewRuntimeAfterAction.activeDialogue).toMatchObject({
      key: "intro_001",
      mode: "choice",
      choices: ["Sim", "Abrir editor"]
    });
    expect(previewRuntime.activeMusic).toBe("intro_theme.mod");
    expect(previewRuntime.activeSfx).toBe("confirm.wav");
    expect(previewRuntime.eventLog.map((item) => item.command)).toEqual([
      "play_music intro_theme.mod",
      "play_sfx confirm.wav",
      "call_event boot_dialogue",
      "show_dialogue intro_001"
    ]);
    expect(previewRuntimeAfterAction.eventLog.map((item) => item.command)).toEqual([
      "play_music intro_theme.mod",
      "play_sfx confirm.wav",
      "call_event boot_dialogue",
      "show_dialogue intro_001",
      "show_choice intro_001"
    ]);

    expect(exported.target).toBe("electron_p0_functional");
    const exportContract = buildEngineExportProjectContract(reopened.data);
    const nativeVisual = verifyNativeVisualExportContract(exportContract);
    expect(nativeVisual).toMatchObject({
      playerAssetId: "player_topdown_4dir",
      emitAnimationFallback: false
    });
    expect(verifyTopdownWalk4DirsExportContract(exportContract)).toMatchObject({
      animationCount: 8
    });
    expect(exportContract.topdown_project?.player.animations?.map((animation) => animation.name)).toEqual([
      "idle_down",
      "idle_right",
      "idle_up",
      "idle_left",
      "walk_down",
      "walk_right",
      "walk_up",
      "walk_left"
    ]);
    expect(exportContract.topdown_project?.player.emit_animation_fallback).toBe(false);
    expect(exportContract.topdown_project?.player.metasprite).toMatchObject({ asset: "player_topdown_4dir" });
    expect(exportContract.topdown_project?.rooms?.[0]?.visual_tilemap).toBe("tiles_topdown_sandbox");
    expect(exportContract.topdown_project?.dialogue_ui?.wrap_columns).toEqual(expect.any(Number));
    expect(exportContract.topdown_project?.dialogue_lines?.[0]).toMatchObject({
      key: "intro_001",
      text: "ROM OK. TESTE A CENA."
    });
    expect(exportContract.topdown_project?.choice_groups?.length).toBeGreaterThan(0);
    expect(exportContract.topdown_project?.portrait_assets?.some((entry) => entry.name === "portrait.png")).toBe(true);
    expect(
      exportContract.topdown_project?.scripts.some((script) =>
        script.script.some((command) => command.op === "show_dialogue")
      )
    ).toBe(true);
    expect(header).toContain("room_count = 2");
    expect(header).toContain(`tile_cell_count = ${32 * 32 + 30 * 20}`);
    expect(header).toContain(`collision_cell_count = ${32 * 32 + 30 * 20}`);
    expect(header).toContain("actor_count = 3");
    expect(header).toContain("trigger_count = 1");
    expect(header).toContain("event_count = 5");
    expect(header).toContain("dialogue_count = 2");
    expect(header).toContain("audio_count = 2");
    expect(header).toContain("{0, 0, 142}");
    expect(header).toContain("{0, 31, true}");
    expect(header).toContain("change_scene room_2");
    expect(header).toContain("play_sfx confirm.wav");
    expect(header).toContain("call_event boot_dialogue");
    expect(header).toContain("show_choice intro_001");
    expect(header).toContain("show_dialogue guide_001");
    expect(exportContract.topdown_project?.rooms?.[0]?.npcs).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "Guide" })])
    );
    const reopenedAnimations = Array.isArray(reopened.data.animations) ? reopened.data.animations : [];
    expect(reopenedAnimations.map((animation) => (animation as { name?: string }).name)).toEqual(
      expect.arrayContaining(["idle_down", "walk_down", "walk_up", "walk_right"])
    );

    writeEvidenceIfRequested({
      ok: true,
      generatedAt: new Date().toISOString(),
      source: {
        id: p0SourceCatalog.technicalFixture.id,
        role: p0SourceCatalog.technicalFixture.role,
        acceptanceSurfaces: p0SourceCatalog.technicalFixture.acceptanceSurfaces,
        excludedFromCanonicalAcceptance: p0SourceCatalog.technicalFixture.excludedFromCanonicalAcceptance
      },
      features: provenEditorFeatures,
      saveReopenVerified: true,
      engineExportVerified: true,
      appPreviewRuntimeVerified: true,
      settingsApplied: true,
      gameplayRomVerified: false,
      previewPlaytestVerified: false,
      project: {
        rooms: rooms.summary.roomCount,
        tileCells: rooms.summary.totalTiles,
        collisionCells: rooms.summary.totalTiles,
        actors: 3,
        triggers: 1,
        events: events.summary.eventCount,
        dialogues: dialogues.summary.dialogueCount,
        sprites: sprites.summary.animationCount,
        audioItems: audio.summary.audioCount,
        assets: files.assets.length
      },
      export: {
        target: exported.target,
        files: exported.files.map((file) => file.path)
      }
    });
  });
});
