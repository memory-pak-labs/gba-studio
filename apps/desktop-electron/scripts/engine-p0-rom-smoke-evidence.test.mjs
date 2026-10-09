import { describe, expect, it } from "vitest";

import { buildEngineP0RomSmokeEvidence } from "./engine-p0-rom-smoke-evidence.mjs";

const baseOptions = {
  checkedAt: "2026-07-04T12:00:00.000Z",
  enginePackRoot: "/opt/GBAStudioEnginePack",
  exportRoot: "/tmp/export",
  romPath: "/tmp/export/exported-p0/build/electron_p0_functional.gba",
  romSha256: "abc123",
  runtimeMainPath: "/tmp/export/exported-p0/main.cpp",
  nativeVisualRuntimeFeatures: ["load-project-assets", "draw-room-bg", "actor-metasprite"],
  nativeVisualExportSummary: { spriteAssetCount: 1, tilesetAssetCount: 1, roomCount: 2 },
  source: {
    id: "electron-p0-technical-fixture",
    role: "technical-contract-fixture",
    projectPath: "/workspace/apps/desktop-electron/fixtures/electron-p0-playtest.gba-project",
    acceptanceSurfaces: ["unit", "export", "runtime-contract"],
    excludedFromCanonicalAcceptance: true
  },
  mgbaReportPath: "/tmp/mgba_smoke_report.md",
  manualChecklistPath: "/tmp/manual_mgba_playtest.md"
};

describe("Engine P0 ROM smoke evidence", () => {
  it("keeps check-only mGBA runs as non-visual runtime evidence", () => {
    expect(buildEngineP0RomSmokeEvidence({ ...baseOptions, openMgba: false })).toMatchObject({
      ok: true,
      target: "electron_p0_functional",
      source: { role: "technical-contract-fixture" },
      exportPipeline: "schema-assetc-native",
      romBuildVerified: true,
      nativeVisualRuntimeVerified: true,
      runtimeWitnessVerified: false,
      playableRuntimeVerified: true,
      mgbaMode: "check-only",
      mgbaCheckOnlyPassed: true,
      bootVisualVerified: false,
      gameplayVerified: false,
      manualVisualPlaytestPassed: false
    });
  });

  it("records manual-open mGBA runs as boot visual evidence without approving gameplay", () => {
    expect(buildEngineP0RomSmokeEvidence({ ...baseOptions, openMgba: true })).toMatchObject({
      ok: true,
      mgbaMode: "manual-open",
      mgbaCheckOnlyPassed: false,
      bootVisualVerified: true,
      gameplayVerified: false,
      manualVisualPlaytestPassed: false
    });
  });
});
