import { describe, expect, it } from "vitest";

import {
  createRealProjectReadinessReport,
  renderRealProjectReadinessMarkdown
} from "./audit-real-project-readiness.mjs";

const completeFeatureSet = [
  "new-project",
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

const currentUiChecks = [
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
  "workspace-settings",
  "workspace-settings-edit-title",
  "settings-path-validation",
  "floating-preview-runtime",
  "floating-preview-runtime-action",
  "floating-preview-runtime-call-event",
  "floating-preview-runtime-editor-collision",
  "floating-preview-runtime-trigger-room-change",
  "floating-preview-runtime-live-sync",
  "engine-export-authored-contract",
  "engine-project-export",
  "engine-rom-build-from-authored-project"
];

function currentEvidence() {
  return {
    functionalParity: { status: "ready" },
    functionalPlaytest: {
      ok: true,
      features: completeFeatureSet,
      saveReopenVerified: true,
      engineExportVerified: true,
      appPreviewRuntimeVerified: true,
      settingsApplied: true,
      gameplayRomVerified: true,
      previewPlaytestVerified: true
    },
    projectValidation: {
      ok: true,
      samples: [
        { kind: "template", name: "exemplo-gba" },
        { kind: "fixture", name: "topdown-demo" },
        { kind: "app-base", name: "exemplo-gba-base" },
        { kind: "real", name: "runtime-canvas-check.gbastudio" }
      ]
    },
    projectIOP0: {
      ok: true,
      mode: "packaged-app",
      dataMatchesAfterSaveReopen: true
    },
    uiP0: {
      ok: true,
      checked: currentUiChecks
    },
    previewPlaytest: {
      ok: true,
      previewPlaytestVerified: true,
      runtimeComplete: true,
      romCopied: true
    },
    engineP0Rom: {
      ok: true,
      romBuildVerified: true,
      gameplayVerified: true
    },
    bundle: {
      ok: true
    }
  };
}

function completeEventsRuntimeExportEvidence() {
  return {
    ok: true,
    previewRuntimeVerified: true,
    engineContractVerified: true,
    engineHeaderVerified: true,
    generatedRuntimeVerified: true,
    coveredCommands: [
      "play_music",
      "play_sfx",
      "show_dialogue",
      "show_choice",
      "change_scene",
      "call_event",
      "set_variable",
      "add_variable",
      "multiply_variable",
      "set_flag",
      "add_item",
      "modify_wallet",
      "set_equipped_item"
    ]
  };
}

function completeSpritesRuntimeExportEvidence() {
  return {
    ok: true,
    workspaceVerified: true,
    previewRuntimeVerified: true,
    engineContractVerified: true,
    engineHeaderVerified: true,
    generatedRuntimeVerified: true,
    coveredFlow: [
      "reference-import",
      "sprite-asset",
      "metasprite-frame",
      "state-direction",
      "room-actor",
      "preview-player",
      "engine-contract",
      "engine-header",
      "generated-runtime"
    ]
  };
}

function completeAudioRuntimeExportEvidence() {
  return {
    ok: true,
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
    ]
  };
}

function completeRoomsRuntimeExportEvidence() {
  return {
    ok: true,
    workspaceVerified: true,
    previewRuntimeVerified: true,
    engineContractVerified: true,
    engineHeaderVerified: true,
    generatedRuntimeVerified: true,
    persistenceVerified: true,
    coveredFlow: [
      "multi-room",
      "dense-tilemap",
      "collision-map",
      "actors",
      "triggers",
      "connections",
      "preview-rooms",
      "engine-contract",
      "engine-header",
      "generated-runtime",
      "save-reopen"
    ]
  };
}

function completeEngineRomEvidence() {
  return {
    ok: true,
    sourceProjectPath: "default-assets/templates/exemplo-gba/exemplo-gba.gba-project",
    target: "exemplo",
    romBuildVerified: true,
    exportPipeline: "schema-assetc-native",
    nativeVisualRuntimeVerified: true,
    nativeVisualRuntimeFeatures: ["load-project-assets", "draw-room-bg", "actor-metasprite"],
    mgbaCheckOnlyPassed: true,
    manualVisualPlaytestPassed: false
  };
}

describe("createRealProjectReadinessReport", () => {
  it("declares the complete Exemplo GBA as the canonical P0 source", () => {
    const report = createRealProjectReadinessReport({
      ...currentEvidence(),
      functionalPlaytest: { ok: false, features: [] },
      canonicalP0: {
        ok: true,
        source: {
          id: "exemplo-gba-p0",
          role: "canonical-p0",
          globalAcceptance: true
        },
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
          "reopen-without-data-loss",
          "runtime-dialogue-edit-in-rom-contract",
          "play-full-project",
          "project-health-workspace",
          "project-health-capabilities-and-budget"
        ],
        projectCounts: { triggers: 1 },
        roms: [{ path: "build/exemplo.gba" }]
      }
    });

    expect(report.canonicalP0Source).toMatchObject({
      id: "exemplo-gba-p0",
      role: "canonical-p0",
      globalAcceptance: true
    });
    expect(report.canonicalP0ProjectPath).toContain(
      "default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
    );
    expect(report.items.find((item) => item.area === "Rooms")?.status).toBe("funcional mas limitado");
  });

  it("builds the full matrix for the canonical project and remaining real-project gaps", () => {
    const report = createRealProjectReadinessReport(currentEvidence());

    expect(report.status).toBe("blocked");
    expect(report.items.map((item) => item.area)).toEqual([
      "Arquivos",
      "Rooms",
      "Sprites / Animador",
      "Eventos",
      "Dialogos",
      "Audio",
      "Settings",
      "Export Engine Pack",
      "Build ROM",
      "Salvar / reabrir",
      "Pacote .app"
    ]);
    expect(report.items.find((item) => item.area === "Salvar / reabrir")?.status).toBe("pronto para projeto real");
    expect(report.items.find((item) => item.area === "Eventos")?.status).toBe("bloqueador");
    expect(report.items.find((item) => item.area === "Sprites / Animador")?.status).toBe("bloqueador");
    expect(report.items.find((item) => item.area === "Audio")?.status).toBe("bloqueador");
    expect(report.items.find((item) => item.area === "Build ROM")?.status).toBe("bloqueador");
    expect(report.nextFocus.map((item) => item.area)).toEqual([
      "Eventos",
      "Sprites / Animador",
      "Audio",
      "Rooms",
      "Build ROM"
    ]);
  });

  it("renders a markdown report with evidence and the ordered gap list", () => {
    const markdown = renderRealProjectReadinessMarkdown(createRealProjectReadinessReport(currentEvidence()));

    expect(markdown).toContain("# Real Project Readiness");
    expect(markdown).toContain("Projeto P0 canônico:");
    expect(markdown).toContain("Diagnóstico da fixture técnica:");
    expect(markdown).toContain("| Eventos | bloqueador | sim |");
    expect(markdown).toContain("| Salvar / reabrir | pronto para projeto real | nao |");
    expect(markdown).toContain("## Proximas lacunas");
    expect(markdown).toContain("1. Eventos");
    expect(markdown).toContain("5. Build ROM");
  });

  it("promotes Eventos when export and generated runtime evidence cover the real-project command set", () => {
    const report = createRealProjectReadinessReport({
      ...currentEvidence(),
      eventsRuntimeExport: completeEventsRuntimeExportEvidence()
    });

    expect(report.items.find((item) => item.area === "Eventos")?.status).toBe("funcional mas limitado");
    expect(report.items.find((item) => item.area === "Eventos")?.blocking).toBe(false);
    expect(report.nextFocus.map((item) => item.area)).toEqual([
      "Sprites / Animador",
      "Audio",
      "Rooms",
      "Build ROM"
    ]);
  });

  it("promotes Sprites when workspace and generated export evidence cover the real-project sprite flow", () => {
    const report = createRealProjectReadinessReport({
      ...currentEvidence(),
      eventsRuntimeExport: completeEventsRuntimeExportEvidence(),
      spritesRuntimeExport: completeSpritesRuntimeExportEvidence()
    });

    expect(report.items.find((item) => item.area === "Sprites / Animador")?.status).toBe("funcional mas limitado");
    expect(report.items.find((item) => item.area === "Sprites / Animador")?.blocking).toBe(false);
    expect(report.nextFocus.map((item) => item.area)).toEqual([
      "Audio",
      "Rooms",
      "Build ROM"
    ]);
  });

  it("promotes Audio when composed music and SFX evidence covers workspace and export", () => {
    const report = createRealProjectReadinessReport({
      ...currentEvidence(),
      eventsRuntimeExport: completeEventsRuntimeExportEvidence(),
      spritesRuntimeExport: completeSpritesRuntimeExportEvidence(),
      audioRuntimeExport: completeAudioRuntimeExportEvidence()
    });

    expect(report.items.find((item) => item.area === "Audio")?.status).toBe("funcional mas limitado");
    expect(report.items.find((item) => item.area === "Audio")?.blocking).toBe(false);
    expect(report.nextFocus.map((item) => item.area)).toEqual([
      "Rooms",
      "Build ROM"
    ]);
  });

  it("promotes Rooms when dense room authoring evidence covers workspace, export and persistence", () => {
    const report = createRealProjectReadinessReport({
      ...currentEvidence(),
      eventsRuntimeExport: completeEventsRuntimeExportEvidence(),
      spritesRuntimeExport: completeSpritesRuntimeExportEvidence(),
      audioRuntimeExport: completeAudioRuntimeExportEvidence(),
      roomsRuntimeExport: completeRoomsRuntimeExportEvidence()
    });

    expect(report.items.find((item) => item.area === "Rooms")?.status).toBe("funcional mas limitado");
    expect(report.items.find((item) => item.area === "Rooms")?.blocking).toBe(false);
    expect(report.nextFocus.map((item) => item.area)).toEqual([
      "Build ROM"
    ]);
  });

  it("promotes Build ROM when the canonical project builds and passes automated mGBA runtime evidence", () => {
    const report = createRealProjectReadinessReport({
      ...currentEvidence(),
      eventsRuntimeExport: completeEventsRuntimeExportEvidence(),
      spritesRuntimeExport: completeSpritesRuntimeExportEvidence(),
      audioRuntimeExport: completeAudioRuntimeExportEvidence(),
      roomsRuntimeExport: completeRoomsRuntimeExportEvidence(),
      engineRom: completeEngineRomEvidence()
    });

    expect(report.items.find((item) => item.area === "Build ROM")?.status).toBe("funcional mas limitado");
    expect(report.items.find((item) => item.area === "Build ROM")?.blocking).toBe(false);
    expect(report.nextFocus.map((item) => item.area)).toEqual([]);
    expect(report.status).toBe("ready");
  });

  it("does not use retired P0 evidence as the project readiness gate", () => {
    const { functionalParity: _functionalParity, ...baseline } = currentEvidence();
    const report = createRealProjectReadinessReport({
      ...baseline,
      eventsRuntimeExport: completeEventsRuntimeExportEvidence(),
      spritesRuntimeExport: completeSpritesRuntimeExportEvidence(),
      audioRuntimeExport: completeAudioRuntimeExportEvidence(),
      roomsRuntimeExport: completeRoomsRuntimeExportEvidence(),
      engineRom: completeEngineRomEvidence()
    });

    expect(report.status).toBe("ready");
    expect(report.items.find((item) => item.area === "Build ROM")?.evidence).not.toContain("P0");
  });

  it("keeps the report blocked when a non-focus area still has a blocking gap", () => {
    const { functionalParity: _functionalParity, functionalPlaytest: _functionalPlaytest, projectIOP0: _projectIOP0, ...baseline } = currentEvidence();
    const report = createRealProjectReadinessReport({
      ...baseline,
      eventsRuntimeExport: completeEventsRuntimeExportEvidence(),
      spritesRuntimeExport: completeSpritesRuntimeExportEvidence(),
      audioRuntimeExport: completeAudioRuntimeExportEvidence(),
      roomsRuntimeExport: completeRoomsRuntimeExportEvidence(),
      engineRom: completeEngineRomEvidence()
    });

    expect(report.status).toBe("blocked");
    expect(report.nextFocus.map((item) => item.area)).toContain("Salvar / reabrir");
  });
});
