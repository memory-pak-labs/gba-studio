import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { describe, expect, it } from "vitest";

import { buildFunctionalP0Project } from "./functionalP0Project.js";
import { auditPreviewRomParity, previewCommandToExportOps, summarizePreviewRomParity } from "./previewRomParity.js";

function writeEvidenceIfRequested(evidence: Record<string, unknown>): void {
  const outputPath = process.env.GBA_STUDIO_PREVIEW_ROM_PARITY_EVIDENCE;
  if (!outputPath) return;

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

describe("Preview ↔ ROM parity", () => {
  it("ignores noop because it intentionally emits no ROM opcode", () => {
    expect(previewCommandToExportOps("noop")).toEqual([]);
  });

  it("maps visual effects to the shared ROM event operation", () => {
    expect(previewCommandToExportOps("visual_effect palette_flash bg0 18 70")).toEqual(["visual_effect"]);
  });

  it("maps sprite swap and palette commands to ROM event ops", () => {
    expect(previewCommandToExportOps("change_actor_sprite Drone zombie.png")).toEqual(["set_actor_sprite"]);
    expect(previewCommandToExportOps("change_player_sprite hero_alt.png")).toEqual(["set_actor_sprite"]);
    expect(previewCommandToExportOps("set_background_palette 3 18")).toEqual(["set_background_palette"]);
    expect(previewCommandToExportOps("set_sprite_palette 2 10")).toEqual(["set_sprite_palette"]);
    expect(previewCommandToExportOps("restore_colors")).toEqual(["set_background_palette", "set_sprite_palette"]);
  });

  it("maps the newer native runtime commands instead of leaving parity gaps", () => {
    expect(previewCommandToExportOps("scene_stack_push")).toEqual(["scene_stack_push"]);
    expect(previewCommandToExportOps("mute_audio_channel music true")).toEqual(["mute_audio_channel"]);
    expect(previewCommandToExportOps("divide_variable score 2")).toEqual(["divide_variable"]);
    expect(previewCommandToExportOps("set_actor_collision_enabled npc true")).toEqual(["set_actor_collision_enabled"]);
    expect(previewCommandToExportOps("launch_projectile player right")).toEqual(["launch_projectile"]);
    expect(previewCommandToExportOps("attach_button a event-a")).toEqual(["attach_button_event"]);
    expect(previewCommandToExportOps("end_event")).toEqual(["end"]);
  });

  it("aligns the functional P0 preview runtime with the Engine export contract", () => {
    const project = buildFunctionalP0Project();
    const report = auditPreviewRomParity(project);

    expect(report.ok).toBe(true);
    expect(summarizePreviewRomParity(report)).toEqual([]);
    expect(report.preview.startRoom).toBe("cena_1");
    expect(report.export.roomNames).toEqual(expect.arrayContaining(["cena_1", "room_2"]));
    expect(report.preview.eventCommands).toEqual([
      "play_music intro_theme.mod",
      "play_sfx confirm.wav",
      "call_event boot_dialogue",
      "show_dialogue intro_001"
    ]);
    // "confirm.wav" nao tem patterns/channels compostos, entao o export real usa play_pcm_sfx (o
    // op que o motor de fato liga a project.pcm_assets) - ver exportEngineProject.ts/resolveAudioPlayback.
    expect(report.export.bootScriptOps).toEqual(expect.arrayContaining([
      "run_audio_routine",
      "play_pcm_sfx",
      "call_script",
      "show_dialogue"
    ]));
    expect(report.preview.playerSprite).toBe("player_topdown_4dir.png");
    expect(report.export.playerSprite).toBe("player_topdown_4dir.png");
    expect(report.export.target).toBe("electron_p0_functional");

    writeEvidenceIfRequested({
      ok: true,
      generatedAt: new Date().toISOString(),
      previewRomParityVerified: true,
      target: report.export.target,
      dimensions: report.dimensions,
      preview: report.preview,
      export: report.export
    });
  });
});
