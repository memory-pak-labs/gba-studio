import { describe, expect, it } from "vitest";
import {
  createMacosPilotReadinessReport,
  mergeMacosPilotManualApprovals,
  mergeMacosPilotVisualReviewApproval
} from "./macosPilotReadiness.js";

const workspaceCaptures = [
  "Welcome",
  "Editor",
  "Eventos",
  "Sprites",
  "Dialogos",
  "Audio",
  "Arquivos",
  "Settings"
].map((label) => ({ label, path: `${label}.png`, bytes: 1000 }));

describe("createMacosPilotReadinessReport", () => {
  it("blocks canonical migration when human validation is still missing", () => {
    const report = createMacosPilotReadinessReport({
      bundle: {
        ok: true,
        appPath: "/release/GBA Studio.app",
        executablePath: "/release/GBA Studio.app/Contents/MacOS/GBA Studio",
        hasIcon: true,
        hasAppAsar: true,
        documentExtensions: ["gba-project", "gbastudio"],
        projectDocumentIconFile: "file-gbastudio.icns",
        hasProjectDocumentIcon: true
      },
      projectValidation: {
        ok: true,
        samples: [
          { kind: "template" },
          { kind: "fixture" },
          { kind: "real" }
        ]
      },
      visualManifest: {
        ok: true,
        captures: workspaceCaptures
      },
      engineRom: {
        ok: true,
        romPath: "/export/game.gba",
        mgbaMode: "manual-open",
        manualVisualPlaytestPassed: false
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.blockers).toContain("Playtest visual/manual do mGBA ainda nao foi aprovado.");
    expect(report.items.find((item) => item.id === "macos-app")?.state).toBe("passed");
    expect(report.items.find((item) => item.id === "manual-mgba-playtest")?.state).toBe("blocked");
  });

  it("can merge persistent manual approvals without auto-approving missing fields", () => {
    const evidence = mergeMacosPilotManualApprovals(
      {
        engineRom: {
          ok: true,
          romPath: "/export/game.gba",
          mgbaMode: "manual-open",
          manualVisualPlaytestPassed: false
        },
        humanVisualReviewApproved: false,
        swiftCanonicalDecisionApproved: false
      },
      {
        manualMgbaPlaytestApproved: true,
        humanVisualReviewApproved: true
      }
    );

    expect(evidence.engineRom?.manualVisualPlaytestPassed).toBe(true);
    expect(evidence.humanVisualReviewApproved).toBe(true);
    expect(evidence.swiftCanonicalDecisionApproved).toBe(false);
  });

  it("can derive human visual approval from all required workspace approvals", () => {
    const evidence = mergeMacosPilotVisualReviewApproval(
      {
        humanVisualReviewApproved: false
      },
      {
        requiredAreas: ["editor-rooms", "eventos"],
        areas: {
          "editor-rooms": { approved: true },
          eventos: { approved: true }
        }
      }
    );

    expect(evidence.humanVisualReviewApproved).toBe(true);
  });

  it("does not approve the visual review when any required workspace is missing or rejected", () => {
    const missingAreaEvidence = mergeMacosPilotVisualReviewApproval(
      {
        humanVisualReviewApproved: false
      },
      {
        requiredAreas: ["editor-rooms", "eventos"],
        areas: {
          "editor-rooms": { approved: true }
        }
      }
    );
    const rejectedAreaEvidence = mergeMacosPilotVisualReviewApproval(
      {
        humanVisualReviewApproved: false
      },
      {
        requiredAreas: ["editor-rooms", "eventos"],
        areas: {
          "editor-rooms": { approved: true },
          eventos: { approved: false }
        }
      }
    );

    expect(missingAreaEvidence.humanVisualReviewApproved).toBe(false);
    expect(rejectedAreaEvidence.humanVisualReviewApproved).toBe(false);
  });

  it("blocks the macOS app gate when the current project document icon evidence is missing", () => {
    const report = createMacosPilotReadinessReport({
      bundle: {
        ok: true,
        appPath: "/release/GBA Studio.app",
        executablePath: "/release/GBA Studio.app/Contents/MacOS/GBA Studio",
        hasIcon: true,
        hasAppAsar: true,
        documentExtensions: ["gba-project", "gbastudio"]
      },
      projectValidation: {
        ok: true,
        samples: [
          { kind: "template" },
          { kind: "fixture" },
          { kind: "real" }
        ]
      },
      visualManifest: {
        ok: true,
        captures: workspaceCaptures
      },
      engineRom: {
        ok: true,
        romPath: "/export/game.gba",
        mgbaMode: "manual-open",
        manualVisualPlaytestPassed: true
      },
      humanVisualReviewApproved: true,
      swiftCanonicalDecisionApproved: true
    });

    expect(report.status).toBe("blocked");
    expect(report.items.find((item) => item.id === "macos-app")?.state).toBe("blocked");
    expect(report.blockers).toContain("Bundle macOS .app ainda nao tem evidencia completa.");
  });

  it("marks the macOS pilot as ready only when all completion gates are proved", () => {
    const report = createMacosPilotReadinessReport({
      bundle: {
        ok: true,
        appPath: "/release/GBA Studio.app",
        executablePath: "/release/GBA Studio.app/Contents/MacOS/GBA Studio",
        hasIcon: true,
        hasAppAsar: true,
        documentExtensions: ["gba-project", "gbastudio"],
        projectDocumentIconFile: "file-gbastudio.icns",
        hasProjectDocumentIcon: true
      },
      projectValidation: {
        ok: true,
        samples: [
          { kind: "template" },
          { kind: "fixture" },
          { kind: "real" }
        ]
      },
      visualManifest: {
        ok: true,
        captures: workspaceCaptures
      },
      engineRom: {
        ok: true,
        romPath: "/export/game.gba",
        mgbaMode: "manual-open",
        manualVisualPlaytestPassed: true
      },
      humanVisualReviewApproved: true,
      swiftCanonicalDecisionApproved: true
    });

    expect(report.status).toBe("ready");
    expect(report.blockers).toEqual([]);
    expect(report.items.every((item) => item.state === "passed" || item.state === "warning")).toBe(true);
  });

  it("distinguishes prepared local signing config from real Developer ID notarization", () => {
    const report = createMacosPilotReadinessReport({
      bundle: {
        ok: true,
        appPath: "/release/GBA Studio.app",
        executablePath: "/release/GBA Studio.app/Contents/MacOS/GBA Studio",
        hasIcon: true,
        hasAppAsar: true,
        documentExtensions: ["gba-project", "gbastudio"],
        projectDocumentIconFile: "file-gbastudio.icns",
        hasProjectDocumentIcon: true
      },
      projectValidation: {
        ok: true,
        samples: [
          { kind: "template" },
          { kind: "fixture" },
          { kind: "real" }
        ]
      },
      visualManifest: {
        ok: true,
        captures: workspaceCaptures
      },
      engineRom: {
        ok: true,
        romPath: "/export/game.gba",
        mgbaMode: "manual-open",
        manualVisualPlaytestPassed: true
      },
      crossPlatformPackage: {
        status: "ready",
        items: [{ state: "passed" }]
      },
      macosSigning: {
        status: "ready",
        items: [{ state: "passed" }]
      },
      humanVisualReviewApproved: true,
      swiftCanonicalDecisionApproved: true,
      developerIdSigned: false,
      windowsLinuxCiGreen: false
    });

    const developerID = report.items.find((item) => item.id === "developer-id");
    const windowsLinux = report.items.find((item) => item.id === "windows-linux");

    expect(developerID?.state).toBe("warning");
    expect(developerID?.evidence).toContain("Entitlements e hardened runtime preparados");
    expect(developerID?.nextStep).toContain("credenciais Apple");
    expect(windowsLinux?.state).toBe("warning");
    expect(windowsLinux?.evidence).toContain("Configuracao local cross-platform auditada");
  });
});
