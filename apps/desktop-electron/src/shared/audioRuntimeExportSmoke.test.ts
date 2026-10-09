import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import {
  createAudioChannelInProject,
  createAudioPatternInProject,
  deriveAudioWorkspacePresentation,
  updateAudioChannelNoteInProject,
  updateAudioPatternOrderSlotInProject
} from "./audioWorkspace.js";
import { generateEngineProjectExport } from "./engineProjectExport.js";
import { buildFunctionalP0Project } from "./functionalP0Project.js";
import { createPreviewRuntime } from "./previewRuntime.js";

function writeEvidenceIfRequested(evidence: Record<string, unknown>): void {
  const outputPath = process.env.GBA_STUDIO_AUDIO_RUNTIME_EXPORT_EVIDENCE;
  if (!outputPath) return;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

function buildAudioRuntimeExportProject() {
  let project = buildFunctionalP0Project();
  project = createAudioPatternInProject(project, "audio-theme", {
    id: "pattern-bridge",
    name: "bridge"
  });
  project = updateAudioChannelNoteInProject(project, "audio-theme", {
    channelID: "pattern-bridge-pulse1",
    stepIndex: 0,
    note: "D4"
  });
  project = updateAudioChannelNoteInProject(project, "audio-theme", {
    channelID: "pattern-bridge-pulse1",
    stepIndex: 4,
    note: "A4"
  });
  project = updateAudioPatternOrderSlotInProject(project, "audio-theme", 1, "pattern-bridge");
  project = createAudioPatternInProject(project, "audio-confirm", {
    id: "pattern-confirm",
    name: "confirm-hit"
  });
  project = createAudioChannelInProject(project, "audio-confirm", {
    id: "confirm-noise",
    name: "Confirm Noise",
    type: "noise",
    patternID: "pattern-confirm"
  });
  project = updateAudioChannelNoteInProject(project, "audio-confirm", {
    channelID: "pattern-confirm-noise",
    stepIndex: 0,
    note: "K"
  });
  return project;
}

describe("Audio runtime/export smoke", () => {
  it("proves composed music and SFX across workspace, preview and generated export", () => {
    const project = buildAudioRuntimeExportProject();
    const audio = deriveAudioWorkspacePresentation(project);
    const preview = createPreviewRuntime(project);
    const contract = buildEngineExportProjectContract(project);
    const exported = generateEngineProjectExport(project);
    const header = exported.files.find((file) => file.path === "gbastudio_project_data.hpp")?.contents ?? "";
    const main = exported.files.find((file) => file.path === "main.cpp")?.contents ?? "";
    const theme = audio.items.find((item) => item.id === "audio-theme");
    const confirm = audio.items.find((item) => item.id === "audio-confirm");

    expect(theme).toMatchObject({
      kind: "Musica",
      format: "COMPOSED",
      loops: true,
      runtimeCommand: "play_music intro_theme.mod",
      patternCount: 2,
      patternOrderCount: 2,
      channelCount: 4
    });
    expect(theme?.patternSequence.map((slot) => slot.patternID)).toEqual(["audio-theme-pattern-1", "pattern-bridge"]);
    expect(theme?.previewRows.some((row) => row.cells.some((cell) => cell.note === "D4"))).toBe(true);
    expect(confirm).toMatchObject({
      kind: "SFX",
      format: "WAV",
      loops: false,
      runtimeCommand: "play_sfx confirm.wav",
      patternCount: 1,
      noteCount: 1
    });

    expect(preview.activeMusic).toBe("intro_theme.mod");
    expect(preview.activeMusicAsset).toMatchObject({ name: "intro_theme.mod", source: "Assets/audio/intro_theme.mod" });
    expect(preview.activeSfx).toBe("confirm.wav");
    expect(preview.activeSfxAsset).toMatchObject({ name: "confirm.wav", source: "Assets/audio/confirm.wav" });
    expect(preview.eventLog.filter((entry) => entry.result === "audio").map((entry) => entry.command)).toEqual([
      "play_music intro_theme.mod",
      "play_sfx confirm.wav"
    ]);

    expect(contract.topdown_project?.scripts).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "room_boot",
        script: expect.arrayContaining([
          { op: "run_audio_routine", index: 0 },
          { op: "play_sfx", index: 0 }
        ])
      })
    ]));
    expect(contract.asset_pack?.assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "audio", audio_json: "assets/audio/project_audio.json" })
    ]));
    expect(contract.copied_assets).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "Audio", name: "intro_theme.mod", output: "assets/audio/intro_theme.mod" }),
      expect.objectContaining({ name: "confirm.wav", output: "assets/audio/confirm.wav" })
    ]));

    expect(header).toContain("struct AudioPatternData");
    expect(header).toContain("struct AudioNoteData");
    expect(header).toContain("\"pattern-bridge\"");
    expect(header).toContain("\"pattern-confirm-noise\"");
    expect(header).toContain("\"D4\"");
    expect(header).toContain("\"K\"");
    expect(main).toContain("audio_pattern_count");
    expect(main).toContain("audio_note_count");
    expect(main).toContain("runtime.audio_note_count");

    writeEvidenceIfRequested({
      ok: true,
      generatedAt: new Date().toISOString(),
      workspaceVerified: true,
      previewRuntimeVerified: true,
      engineContractVerified: true,
      engineHeaderVerified: true,
      generatedRuntimeVerified: true,
      coveredFlow: [
        "music-item",
        "sfx-item",
        "tracker-pattern",
        "pattern-sequence",
        "channel-notes",
        "preview-audio",
        "event-audio",
        "engine-contract",
        "engine-header",
        "generated-runtime"
      ],
      audio: {
        music: theme?.name,
        sfx: confirm?.name,
        patternCount: audio.summary.totalPatterns,
        channelCount: audio.summary.totalChannels,
        noteCount: audio.summary.totalNotes,
        activeMusic: preview.activeMusic,
        activeSfx: preview.activeSfx
      }
    });
  });
});
