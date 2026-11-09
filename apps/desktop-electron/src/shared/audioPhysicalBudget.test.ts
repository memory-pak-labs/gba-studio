import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import {
  GBA_AUDIO_ROM_LAYOUT,
  estimateComposedAudioPhysicalBytes
} from "./audioPhysicalBudget.js";

describe("composed audio physical budget", () => {
  it("uses the target ARM audio structure layout", () => {
    expect(GBA_AUDIO_ROM_LAYOUT).toEqual({
      sfxToneBytes: 14,
      sfxAssetBytes: 16,
      trackerStepBytes: 24,
      trackerPatternBytes: 8,
      trackerOrderEntryBytes: 1,
      trackerAssetBytes: 32
    });
  });

  it("counts only generated tracker and SFX structures", () => {
    expect(estimateComposedAudioPhysicalBytes({
      kind: "Musica",
      name: "theme",
      patterns: [{ id: "intro", steps: 1, channels: [{ type: "pulse1", notes: ["C4"] }] }],
      patternOrder: ["intro"]
    })).toBe(65);

    expect(estimateComposedAudioPhysicalBytes({
      kind: "SFX",
      name: "hit",
      channels: [{ type: "noise", notes: ["K"] }]
    })).toBe(30);
  });

  it("does not claim a physical size for audio without composed content", () => {
    expect(estimateComposedAudioPhysicalBytes({ kind: "Musica", name: "empty" })).toBeNull();
    expect(estimateComposedAudioPhysicalBytes({ kind: "WAV", name: "imported" })).toBeNull();
  });

  it("defers imported tactical music and cues to the compiled assetc budget", () => {
    const project = JSON.parse(readFileSync(new URL(
      "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
      import.meta.url
    ), "utf8")) as { audioItems?: Array<Record<string, unknown>> };
    const items = (project.audioItems ?? []).filter((item) => (
      item.name === "farol_arena_tatica"
      || (typeof item.name === "string" && item.name.startsWith("farol_sfx_tatica_"))
    ));
    const sizes = items.map((item) => estimateComposedAudioPhysicalBytes(item));

    expect(items).toHaveLength(10);
    expect(items.filter((item) => item.kind === "Musica")).toHaveLength(1);
    expect(items.filter((item) => item.kind === "SFX")).toHaveLength(9);
    expect(sizes).toEqual(Array(10).fill(null));
    expect(items.filter(item => item.kind === "Musica").every(item => item.format === "MOD")).toBe(true);
    expect(items.filter(item => item.kind === "SFX").every(item => item.format === "WAV")).toBe(true);
  });
});
