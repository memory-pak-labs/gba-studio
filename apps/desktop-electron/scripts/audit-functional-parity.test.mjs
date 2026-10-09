import { describe, expect, it } from "vitest";

import {
  createFunctionalParityReport,
  normalizeCanonicalP0Evidence,
  renderFunctionalParityMarkdown
} from "./audit-functional-parity.mjs";

const allP0Features = [
  "project-source",
  "room",
  "tilemap",
  "collision",
  "actor",
  "trigger",
  "event",
  "dialogue",
  "sprite",
  "audio",
  "files-assets",
  "settings",
  "save-reopen",
  "engine-export",
  "app-preview-runtime",
  "gameplay-rom",
  "preview-playtest"
];

const editorP0FeaturesWithoutRuntime = [
  "project-source",
  "room",
  "tilemap",
  "collision",
  "actor",
  "trigger",
  "event",
  "dialogue",
  "sprite",
  "audio",
  "files-assets",
  "settings",
  "save-reopen",
  "app-preview-runtime",
  "engine-export"
];

const allWorkspaceUiChecks = {
  ok: true,
  checked: [
    "workspace-arquivos",
    "workspace-arquivos-duplicate-asset",
    "workspace-arquivos-validate-library",
    "workspace-rooms",
    "workspace-rooms-tile-paint",
    "workspace-rooms-collision-paint",
    "workspace-sprites",
    "workspace-sprites-composer-add-tile",
    "workspace-sprites-composer-paint",
    "workspace-eventos",
    "workspace-eventos-add-step",
    "workspace-eventos-edit-step",
    "workspace-dialogos",
    "workspace-dialogos-edit-text",
    "workspace-dialogos-edit-choices",
    "workspace-audio",
    "workspace-audio-edit-bpm",
    "workspace-audio-edit-note",
    "floating-preview-runtime",
    "floating-preview-runtime-action",
    "floating-preview-runtime-call-event",
    "floating-preview-runtime-editor-collision",
    "floating-preview-runtime-trigger-room-change",
    "workspace-settings",
    "workspace-settings-edit-title",
    "settings-path-validation"
  ]
};

const liveRuntimeToRomUiChecks = {
  ok: true,
  checked: [
    ...allWorkspaceUiChecks.checked,
    "floating-preview-runtime-live-sync",
    "engine-export-authored-contract",
    "engine-project-export",
    "engine-rom-build-from-authored-project"
  ]
};

const playWindowEvidence = {
  ok: true,
  canvas: { width: 240, height: 160 },
  input: { ok: true },
  checked: [
    "open-rom-player-window-ipc",
    "play-window-target",
    "mgba-direct-canvas",
    "keyboard-input"
  ]
};

const itchExportEvidence = {
  ok: true,
  structure: {
    missingFiles: [],
    forbiddenPresent: [],
    forbiddenTextPresent: []
  },
  visual: {
    canvasMounted: true,
    canvasWidth: 240,
    canvasHeight: 160
  },
  input: { ok: true },
  checked: [
    "index-html-root",
    "relative-static-package",
    "rom-gba-present",
    "mgba-wasm-direct-assets",
    "mpl-license",
    "no-emulatorjs",
    "no-cdn",
    "http-static-server",
    "direct-canvas",
    "keyboard-input"
  ]
};

describe("createFunctionalParityReport", () => {
  it("declares the Exemplo GBA as the canonical P0 project", () => {
    const report = createFunctionalParityReport();
    const rooms = report.items.find((item) => item.id === "editor-rooms");

    expect(report.canonicalP0Source).toMatchObject({
      id: "exemplo-gba-p0",
      role: "canonical-p0",
      globalAcceptance: true
    });
    expect(report.canonicalP0ProjectPath).toContain(
      "default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
    );
    expect(rooms?.nextStep).not.toContain("Criar projeto P0");
    expect(rooms?.nextStep).toContain("projeto exemplo P0");
  });

  it("normalizes the canonical template smoke as P0 evidence without creating a second project", () => {
    const evidence = normalizeCanonicalP0Evidence({
      ok: true,
      source: {
        id: "exemplo-gba-p0",
        role: "canonical-p0",
        globalAcceptance: true
      },
      projectCounts: { triggers: 10 },
      roms: [{ fileName: "exemplo/build/exemplo.gba" }],
      projectHealth: { status: "warning" },
      checked: [
        "welcome-template-card",
        "canonical-source-catalog",
        "single-project-35-scenes-including-presentation-and-interface",
        "edit-scene",
        "background-layout-visible",
        "edit-collision",
        "all-scene-collision-grids-complete",
        "edit-actor",
        "all-actors-resolve-authored-hitboxes",
        "edit-event-in-editor-inspector",
        "dialogues-workspace",
        "authored-dialogue-box-and-selector-visible",
        "sprites-workspace",
        "edit-sprite",
        "audio-workspace-with-authored-music-and-sfx",
        "files-workspace",
        "self-contained-assets",
        "edit-and-save",
        "runtime-dialogue-edit-in-rom-contract",
        "reopen-without-data-loss",
        "play-full-project",
        "project-health-workspace",
        "project-health-capabilities-and-budget"
      ]
    });

    expect(evidence).toMatchObject({
      ok: true,
      source: { id: "exemplo-gba-p0", role: "canonical-p0" },
      features: expect.arrayContaining([
        "project-source",
        "room",
        "tilemap",
        "collision",
        "actor",
        "trigger",
        "event",
        "dialogue",
        "sprite",
        "audio",
        "files-assets",
        "save-reopen",
        "engine-export",
        "gameplay-rom"
      ]),
      gameplayRomVerified: true,
      saveReopenVerified: true,
      engineExportVerified: true,
      settingsApplied: true
    });
  });

  it("keeps Electron blocked when there is no P0 gameplay evidence", () => {
    const report = createFunctionalParityReport({
      projectValidation: {
        ok: true,
        samples: [{ kind: "template" }, { kind: "fixture" }, { kind: "real" }]
      },
      engineRom: {
        ok: true,
        romPath: "/tmp/game.gba"
      },
      bundle: {
        ok: true
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.items.find((item) => item.id === "shell-project-files")?.status).toBe("funcional");
    expect(report.items.find((item) => item.id === "rom-export")?.status).toBe("parcial");
    expect(report.items.find((item) => item.id === "preview-playtest")).toBeUndefined();
    expect(report.blockers.some((blocker) => blocker.startsWith("Exportacao ROM:"))).toBe(true);
  });

  it("marks shell project files functional from packaged Project I/O P0 evidence without unblocking gameplay", () => {
    const report = createFunctionalParityReport({
      projectIOP0: {
        ok: true,
        mode: "packaged-app",
        dataMatchesAfterSaveReopen: true,
        unknownEditorStatePreserved: true,
        swiftSplitManifestRejected: true,
        checks: [
          "open-gba-project",
          "render-project-workspace",
          "save-as-gba-project",
          "reopen-saved-gba-project",
          "preserve-project-data",
          "reject-swift-split-project-manifest"
        ]
      },
      bundle: {
        ok: true
      }
    });

    const shell = report.items.find((item) => item.id === "shell-project-files");

    expect(report.status).toBe("blocked");
    expect(shell?.status).toBe("funcional");
    expect(shell?.evidence).toContain("Project I/O P0");
    expect(shell?.evidence).toContain(".app");
    expect(report.projectIOP0EvidencePath).toContain("project_io_p0_evidence.json");
    expect(report.blockers.some((blocker) => blocker.startsWith("Editor / Rooms:"))).toBe(true);
  });

  it("marks the functional gate ready only when P0 gameplay, ROM and preview are proved", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: allP0Features,
        gameplayRomVerified: true,
        previewPlaytestVerified: true,
        appPreviewRuntimeVerified: true,
        saveReopenVerified: true,
        settingsApplied: true
      },
      bundle: {
        ok: true
      },
      uiP0: allWorkspaceUiChecks,
      playWindow: playWindowEvidence,
      itchExport: itchExportEvidence,
      windowsLinuxCiGreen: true
    });

    expect(report.status).toBe("ready");
    expect(report.blockers).toEqual([]);
    expect(report.items.filter((item) => item.blocking).every((item) => item.status === "funcional")).toBe(true);
  });

  it("combines functional data, ROM and preview evidence for the P0 ready gate", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true,
        appPreviewRuntimeVerified: true
      },
      engineP0Rom: {
        ok: true,
        romBuildVerified: true,
        gameplayVerified: true
      },
      previewPlaytest: {
        ok: true,
        previewPackageGenerated: true,
        romCopied: true,
        runtimeComplete: true,
        previewPlaytestVerified: true
      },
      bundle: {
        ok: true
      },
      uiP0: allWorkspaceUiChecks,
      playWindow: playWindowEvidence,
      itchExport: itchExportEvidence,
      bundle: {
        ok: true
      }
    });

    expect(report.status).toBe("ready");
    expect(report.blockers).toEqual([]);
    expect(report.items.find((item) => item.id === "editor-rooms")?.status).toBe("funcional");
    expect(report.items.find((item) => item.id === "rom-export")?.status).toBe("funcional");
    expect(report.items.find((item) => item.id === "preview-playtest")).toBeUndefined();
  });

  it("treats the authored Engine export as the current ROM gate", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true,
        appPreviewRuntimeVerified: true
      },
      engineP0Rom: {
        ok: true,
        romBuildVerified: true,
        gameplayVerified: false,
        playableRuntimeVerified: true
      },
      previewPlaytest: {
        ok: true,
        previewPackageGenerated: true,
        romCopied: true,
        runtimeComplete: true,
        previewPlaytestVerified: true
      },
      bundle: {
        ok: true
      },
      uiP0: liveRuntimeToRomUiChecks,
      playWindow: playWindowEvidence,
      itchExport: itchExportEvidence
    });

    const romExport = report.items.find((item) => item.id === "rom-export");

    expect(report.status).toBe("ready");
    expect(report.blockers).toEqual([]);
    expect(romExport?.status).toBe("funcional");
    expect(romExport?.evidence).toContain("mesmo fluxo usado pelo Play");
    expect(romExport?.evidence).toContain("ROM gerada");
  });

  it("keeps Electron blocked but reports real partial progress when editor data is created and exported", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime.filter((feature) => feature !== "app-preview-runtime"),
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true,
        appPreviewRuntimeVerified: true,
        gameplayRomVerified: false,
        previewPlaytestVerified: false
      }
    });

    expect(report.status).toBe("blocked");
    expect(report.items.find((item) => item.id === "shell-project-files")?.status).toBe("funcional");
    expect(report.items.find((item) => item.id === "editor-rooms")?.evidence).toContain("persistidos/exportados");
    expect(report.items.find((item) => item.id === "events")?.evidence).toContain("falta smoke UI");
    expect(report.items.find((item) => item.id === "sprites")?.evidence).toContain("persistidos/exportados");
    expect(report.items.find((item) => item.id === "audio")?.evidence).toContain("falta smoke UI");
    expect(report.items.find((item) => item.id === "settings")?.status).toBe("ausente");
    expect(report.items.find((item) => item.id === "rom-export")?.evidence).toContain(".gba jogavel");
    expect(report.items.find((item) => item.id === "preview-playtest")).toBeUndefined();
    expect(report.items.find((item) => item.id === "app-preview-runtime")).toBeUndefined();
    expect(report.blockers.some((blocker) => blocker.includes("Preview"))).toBe(false);
  });

  it("does not keep the retired app preview runtime as a blocker", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime.filter((feature) => feature !== "app-preview-runtime"),
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true,
        appPreviewRuntimeVerified: false
      },
      uiP0: {
        ok: true,
        checked: allWorkspaceUiChecks.checked.filter((check) => !check.startsWith("floating-preview-runtime"))
      }
    });

    const appPreview = report.items.find((item) => item.id === "app-preview-runtime");

    expect(report.status).toBe("blocked");
    expect(appPreview).toBeUndefined();
    expect(report.blockers.some((blocker) => blocker.includes("Preview Runtime do app"))).toBe(false);
  });

  it("does not let retired preview evidence substitute ROM or Play Window", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime.filter((feature) => feature !== "app-preview-runtime"),
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true,
        appPreviewRuntimeVerified: true,
        gameplayRomVerified: false,
        previewPlaytestVerified: false
      },
      uiP0: allWorkspaceUiChecks,
      bundle: {
        ok: true
      }
    });

    const appPreview = report.items.find((item) => item.id === "app-preview-runtime");

    expect(report.status).toBe("blocked");
    expect(appPreview).toBeUndefined();
    expect(report.items.find((item) => item.id === "preview-playtest")).toBeUndefined();
    expect(report.items.find((item) => item.id === "rom-export")?.status).toBe("parcial");
    expect(report.items.find((item) => item.id === "macos-app")?.status).toBe("parcial");
  });

  it("does not use the retired preview package as a functional gate", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true
      },
      previewPlaytest: {
        ok: true,
        previewPackageGenerated: true,
        romCopied: true,
        runtimeComplete: false,
        missingRuntimeFiles: ["player/mgba-core.wasm", "player/mgba-direct-player.mjs"],
        previewPlaytestVerified: false
      }
    });

    const preview = report.items.find((item) => item.id === "preview-playtest");

    expect(report.status).toBe("blocked");
    expect(preview).toBeUndefined();
    expect(report.blockers.some((blocker) => blocker.startsWith("Preview / Playtest:"))).toBe(false);
  });

  it("ignores legacy preview approval after the preview feature is retired", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true
      },
      previewPlaytest: {
        ok: true,
        previewPackageGenerated: true,
        romCopied: true,
        runtimeComplete: true,
        missingRuntimeFiles: [],
        previewPlaytestVerified: true,
        visualPreviewSmokePassed: true
      }
    });

    const preview = report.items.find((item) => item.id === "preview-playtest");

    expect(report.status).toBe("blocked");
    expect(preview).toBeUndefined();
    expect(report.blockers.some((blocker) => blocker.startsWith("Preview / Playtest:"))).toBe(false);
  });

  it("keeps the final flow blocked until Play Window and itch.io export smokes pass", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: allP0Features,
        gameplayRomVerified: true,
        previewPlaytestVerified: true,
        appPreviewRuntimeVerified: true,
        saveReopenVerified: true,
        settingsApplied: true
      },
      bundle: {
        ok: true
      },
      uiP0: allWorkspaceUiChecks,
      windowsLinuxCiGreen: true
    });

    expect(report.status).toBe("blocked");
    expect(report.items.find((item) => item.id === "play-window")?.status).toBe("ausente");
    expect(report.items.find((item) => item.id === "web-itch-export")?.status).toBe("ausente");
    expect(report.blockers.some((blocker) => blocker.startsWith("Play Window:"))).toBe(true);
    expect(report.blockers.some((blocker) => blocker.startsWith("Export Web / itch.io:"))).toBe(true);
  });

  it("marks Play Window and itch.io export functional from their direct smokes", () => {
    const report = createFunctionalParityReport({
      playWindow: playWindowEvidence,
      itchExport: itchExportEvidence
    });

    expect(report.items.find((item) => item.id === "play-window")?.status).toBe("funcional");
    expect(report.items.find((item) => item.id === "web-itch-export")?.status).toBe("funcional");
  });

  it("marks ROM export as partial when the technical P0 ROM builds but gameplay was not observed", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true
      },
      engineP0Rom: {
        ok: true,
        romBuildVerified: true,
        gameplayVerified: false,
        romPath: "/tmp/electron_p0_functional.gba"
      }
    });

    const romExport = report.items.find((item) => item.id === "rom-export");

    expect(report.status).toBe("blocked");
    expect(romExport?.status).toBe("parcial");
    expect(romExport?.evidence).toContain("ROM da fixture técnica P0 foi gerada");
    expect(romExport?.nextStep).toContain("playtest observavel");
    expect(report.blockers.some((blocker) => blocker.startsWith("Exportacao ROM:"))).toBe(true);
  });

  it("reports mGBA boot visual evidence without treating it as full gameplay", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true
      },
      engineP0Rom: {
        ok: true,
        romBuildVerified: true,
        gameplayVerified: false,
        bootVisualVerified: true,
        mgbaMode: "manual-open",
        romPath: "/tmp/electron_p0_functional.gba"
      }
    });

    const romExport = report.items.find((item) => item.id === "rom-export");

    expect(report.status).toBe("blocked");
    expect(romExport?.status).toBe("parcial");
    expect(romExport?.evidence).toContain("boot visual registrado");
    expect(romExport?.evidence).toContain("gameplay observavel");
    expect(report.blockers.some((blocker) => blocker.startsWith("Exportacao ROM:"))).toBe(true);
  });

  it("reports runtime witness evidence without treating it as full gameplay", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true
      },
      engineP0Rom: {
        ok: true,
        romBuildVerified: true,
        runtimeWitnessVerified: true,
        runtimeWitnessCounters: ["phase", "room", "boot", "dialog", "actor", "trigger", "change", "ok"],
        gameplayVerified: false,
        romPath: "/tmp/electron_p0_functional.gba"
      }
    });

    const romExport = report.items.find((item) => item.id === "rom-export");

    expect(report.status).toBe("blocked");
    expect(romExport?.status).toBe("parcial");
    expect(romExport?.evidence).toContain("runtime witness");
    expect(romExport?.evidence).toContain("boot, dialogo, ator, trigger e troca de room");
    expect(romExport?.nextStep).toContain("playtest observavel");
    expect(report.blockers.some((blocker) => blocker.startsWith("Exportacao ROM:"))).toBe(true);
  });

  it("reports native visual runtime evidence without treating it as approved gameplay", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true
      },
      engineP0Rom: {
        ok: true,
        romBuildVerified: true,
        nativeVisualRuntimeVerified: true,
        nativeVisualRuntimeFeatures: ["draw-room-bg", "actor-metasprite"],
        playableRuntimeVerified: true,
        gameplayVerified: false,
        romPath: "/tmp/electron_p0_functional.gba"
      }
    });

    const romExport = report.items.find((item) => item.id === "rom-export");

    expect(report.status).toBe("blocked");
    expect(romExport?.status).toBe("parcial");
    expect(romExport?.evidence).toContain("tilemap e sprites reais");
    expect(report.blockers.some((blocker) => blocker.startsWith("Exportacao ROM:"))).toBe(true);
  });

  it("reports playable runtime evidence without treating it as approved gameplay", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime,
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true
      },
      engineP0Rom: {
        ok: true,
        romBuildVerified: true,
        runtimeWitnessVerified: true,
        playableRuntimeVerified: true,
        playableRuntimeFeatures: ["input", "collision", "dialogue", "trigger", "scene-change", "tile-render"],
        gameplayVerified: false,
        romPath: "/tmp/electron_p0_functional.gba"
      }
    });

    const romExport = report.items.find((item) => item.id === "rom-export");

    expect(report.status).toBe("blocked");
    expect(romExport?.status).toBe("parcial");
    expect(romExport?.evidence).toContain("micro-runtime jogavel");
    expect(romExport?.evidence).toContain("input, colisao, dialogo, trigger");
    expect(romExport?.evidence).toContain("playtest visual/manual aprovado");
    expect(report.blockers.some((blocker) => blocker.startsWith("Exportacao ROM:"))).toBe(true);
  });

  it("renders the real app project baseline rule in markdown", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: allP0Features,
        gameplayRomVerified: true,
        previewPlaytestVerified: true,
        appPreviewRuntimeVerified: true,
        saveReopenVerified: true,
        settingsApplied: true
      },
      bundle: {
        ok: true
      },
      uiP0: allWorkspaceUiChecks,
      playWindow: playWindowEvidence,
      itchExport: itchExportEvidence
    });
    const markdown = renderFunctionalParityMarkdown(report);

    expect(markdown).toContain("Projeto real/base do app pronto");
    expect(markdown).toContain("O projeto exemplo completo é o P0 canônico do produto; a fixture técnica reduzida serve apenas para contratos e diagnóstico.");
    expect(markdown).toContain("O gate acompanha o projeto exemplo/base de teste aberto no app; bloqueios neste relatorio sao regressao critica.");
    expect(markdown).toContain("Evidencia ROM técnica P0 esperada");
    expect(markdown).toContain("Evidencia Play Window esperada");
    expect(markdown).toContain("Evidencia itch.io esperada");
    expect(markdown).toContain("Evidencia UI de diagnóstico");
    expect(markdown).toContain("| Play Window | funcional | sim |");
    expect(markdown).not.toContain("| Preview / Playtest |");
  });

  it("marks renderer-only workspaces as visual-only instead of partial", () => {
    const report = createFunctionalParityReport({
      workspaceSurfaces: {
        editorRooms: true,
        events: true,
        sprites: true,
        dialogues: true,
        audio: true,
        filesAssets: true,
        settings: true
      }
    });

    expect(report.items.find((item) => item.id === "editor-rooms")?.status).toBe("visual apenas");
    expect(report.items.find((item) => item.id === "events")?.status).toBe("visual apenas");
    expect(report.items.find((item) => item.id === "sprites")?.status).toBe("visual apenas");
    expect(report.items.find((item) => item.id === "dialogues")?.status).toBe("visual apenas");
    expect(report.items.find((item) => item.id === "audio")?.status).toBe("visual apenas");
    expect(report.items.find((item) => item.id === "files-assets")?.status).toBe("visual apenas");
    expect(report.items.find((item) => item.id === "settings")?.status).toBe("visual apenas");
  });

  it("keeps settings and dialogues below functional until runtime behavior is proved", () => {
    const report = createFunctionalParityReport({
      functionalPlaytest: {
        ok: true,
        features: editorP0FeaturesWithoutRuntime.filter((feature) => feature !== "app-preview-runtime"),
        saveReopenVerified: true,
        engineExportVerified: true,
        settingsApplied: true,
        gameplayRomVerified: false,
        previewPlaytestVerified: false
      }
    });

    const dialogues = report.items.find((item) => item.id === "dialogues");
    const settings = report.items.find((item) => item.id === "settings");

    expect(dialogues?.blocking).toBe(true);
    expect(dialogues?.status).toBe("ausente");
    expect(settings?.status).toBe("ausente");
    expect(settings?.evidence).toContain("smoke UI");
    expect(report.blockers.some((blocker) => blocker.startsWith("Dialogos:"))).toBe(true);
  });
});
