export function buildEngineP0RomSmokeEvidence(options) {
  const mgbaMode = options.openMgba ? "manual-open" : "check-only";

  return {
    ok: true,
    checkedAt: options.checkedAt,
    enginePackRoot: options.enginePackRoot,
    exportRoot: options.exportRoot,
    target: "electron_p0_functional",
    romPath: options.romPath,
    romSha256: options.romSha256,
    romBuildVerified: true,
    exportPipeline: "schema-assetc-native",
    source: options.source ?? {
      id: "unclassified",
      role: "unclassified"
    },
    nativeVisualRuntimeVerified: true,
    nativeVisualRuntimeFeatures: options.nativeVisualRuntimeFeatures,
    nativeVisualExportSummary: options.nativeVisualExportSummary,
    runtimeMainPath: options.runtimeMainPath,
    runtimeWitnessVerified: false,
    playableRuntimeVerified: true,
    mgbaReportPath: options.mgbaReportPath,
    mgbaMode,
    mgbaCheckOnlyPassed: !options.openMgba,
    bootVisualVerified: options.openMgba,
    manualChecklistPath: options.manualChecklistPath,
    gameplayVerified: false,
    manualVisualPlaytestPassed: false
  };
}
