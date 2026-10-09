import { describe, expect, it } from "vitest";

import { validateHardwareSoakEvidence } from "./hardwareSoakEvidence.js";

const validEvidence = {
  schema: 1,
  evidenceType: "hardware_real",
  status: "passed",
  checkedAt: "2026-07-26T18:00:00.000Z",
  romSha256: "a".repeat(64),
  durationMinutes: 30,
  device: "Game Boy Advance AGB-001",
  cartridge: "EverDrive GBA Mini",
  tester: "Matheus",
  checks: {
    boot: true,
    sceneTransitions: true,
    graphicsAndParallax: true,
    audio: true,
    input: true,
    saves: true,
    dmaAndScanlines: true,
    oamStress: true,
    linkCable: true
  },
  notes: "Executado em duas unidades com cabo link."
} as const;

describe("hardware soak evidence", () => {
  it("accepts a complete physical run matching the built ROM", () => {
    expect(validateHardwareSoakEvidence(validEvidence, {
      expectedRomSha256: "a".repeat(64),
      minimumDurationMinutes: 20
    })).toEqual({ ok: true, issues: [] });
  });

  it("does not convert an emulator or incomplete manual note into hardware approval", () => {
    const result = validateHardwareSoakEvidence({
      ...validEvidence,
      evidenceType: "emulator",
      durationMinutes: 5,
      romSha256: "b".repeat(64),
      checks: { ...validEvidence.checks, saves: false, linkCable: false }
    }, {
      expectedRomSha256: "a".repeat(64),
      minimumDurationMinutes: 20
    });

    expect(result.ok).toBe(false);
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("hardware_real"),
      expect.stringContaining("20 minutos"),
      expect.stringContaining("hash"),
      expect.stringContaining("saves"),
      expect.stringContaining("linkCable")
    ]));
  });
});
