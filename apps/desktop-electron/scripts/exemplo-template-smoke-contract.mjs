const expectedRuntimes = [
  "menu",
  "topdown",
  "platformer",
  "isometric",
  "dungeon_crawler",
  "racing",
  "point_click",
  "shmup",
  "cutscene",
  "visual_novel",
  "world_map",
  "battle_rpg",
  "luta"
];

export function exemploSceneBuildTimeoutMs(value) {
  if (value === undefined || value === '') return 300_000;
  const timeout = Number(value);
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(timeout) || timeout < 300_000 || timeout > 900_000) {
    throw new Error('Invalid scene compilation timeout: expected 300000 to 900000 milliseconds');
  }
  return timeout;
}

// This supplement never changes the original audit, its FPS thresholds, the
// process exit code, or publication approval. It records which functional
// assertions completed on the known 30 Hz Intel host.
export function intelRemainingFunctionalEvidence(evidence) {
  const expected = ['arena_arrancada', 'circuito_final', 'arena_tatica', 'circuito_perspectiva'];
  const results = Array.isArray(evidence?.results) ? evidence.results : [];
  const names = results.map(result => result.name);
  const issues = Array.isArray(evidence?.audit?.issues) ? evidence.audit.issues : ['Auditoria incompleta'];
  const nonCadenceIssues = issues.filter(issue => !expected.some(name =>
    issue === `${name}: cadencia do Player fora dos limites esperados.`));
  const thresholds = evidence?.audit?.thresholds;
  const checks = {
    sceneCoverage: results.length === expected.length && new Set(names).size === expected.length
      && names.every(name => expected.includes(name)) && evidence?.audit?.counts?.expected === expected.length,
    thresholdsUnchanged: thresholds?.minEmulationFps === 55 && thresholds?.minPresentationFps === 55
      && thresholds?.maxDroppedFrameRatio === 0.1,
    nativeExecution: results.every(result => Number.isFinite(result.runtimeState?.frame) && result.runtimeState.frame >= 8
      && Number.isFinite(result.performance?.emulationFps) && result.performance.emulationFps >= 55),
    droppedFrames: results.every(result => Number.isFinite(result.performance?.droppedFrameRatio)
      && result.performance.droppedFrameRatio >= 0 && result.performance.droppedFrameRatio <= 0.1),
    audioHealthy: results.every(result => result.audio?.audioUnderrunCount === 0
      && result.runtimeState?.audio?.pcmUnderrunCount === 0),
    measuredEngineAudioHealthy: results.every(result => Array.isArray(result.performance?.observedSamples)
      && result.performance.observedSamples.length >= 3
      && result.performance.observedSamples.every(sample => sample.runtimeState?.audio?.pcmUnderrunCount === 0)),
    visualGate: evidence?.audit?.visualGate?.ok === true,
    remainingAssertions: nonCadenceIssues.length === 0
  };
  return { scope: 'four unfinished Intel scenes; original full audit retained',
    functionalPassed: Object.values(checks).every(Boolean), checks, nonCadenceIssues,
    presentationGatePassed: checks.sceneCoverage && checks.thresholdsUnchanged && checks.nativeExecution && checks.droppedFrames && results.every(result =>
      Number.isFinite(result.performance?.presentationFps) && result.performance.presentationFps >= 55),
    strictAuditPassed: evidence?.ok === true && evidence?.audit?.ok === true,
    publicationApproved: false, sceneNames: names,
    scenes: results.map(result => ({ name: result.name,
      emulationFps: result.performance?.emulationFps, presentationFps: result.performance?.presentationFps,
      droppedFrameRatio: result.performance?.droppedFrameRatio,
      hostAudioUnderruns: result.audio?.audioUnderrunCount, enginePcmUnderruns: result.runtimeState?.audio?.pcmUnderrunCount,
      measuredEnginePcmUnderruns: result.performance?.observedSamples?.map(sample => sample.runtimeState?.audio?.pcmUnderrunCount) })) };
}

// Autonomous actors can leave the viewport or blink after damage during the
// uninterrupted cadence window. Audit their authored initial pixels in a
// separate real startup, never by replacing cadence samples or masking pixels.
export async function captureMovingSceneVisualBaseline({ runtime, scope, performance, reset, capture }) {
  if (!['shmup', 'racing'].includes(runtime)) throw new Error('Expected a moving runtime');
  const cadenceFinalFrame = performance?.observedSamples?.at(-1)?.runtimeState?.frame;
  if (!Number.isInteger(cadenceFinalFrame) || cadenceFinalFrame <= 60) {
    throw new Error('A completed cadence measurement is required before the visual baseline');
  }
  await reset();
  const evidence = await capture();
  const frames = [evidence?.runtimeState, evidence?.presentedRuntimeState];
  if (!evidence?.ok || typeof evidence.framebufferRgbaBase64 !== 'string' || !evidence.framebufferRgbaBase64
    || !frames.every(state => Number.isInteger(state?.frame) && state.frame >= 8 && state.frame <= 60
      && state.runtimeKind === scope.runtimeKind && state.currentRoom === scope.currentRoom)) {
    throw new Error('Invalid initial visual baseline after the independent startup');
  }
  return { ...evidence, visualBaseline: { source: 'independent-startup-after-cadence',
    cadenceFinalFrame, capturedFrame: evidence.presentedRuntimeState.frame } };
}

export function activeBuildRomPaths(files) {
  return files.filter((file) => file.endsWith(".gba") && !file.split(/[\\/]/).includes(".gba-cache"));
}

export function fullProjectRuntimeEvidence(contract) {
  const dispatch = contract?.runtime_dispatch;
  const runtimes = Array.isArray(dispatch?.runtimes) ? dispatch.runtimes : [];
  const hasEveryRuntime = expectedRuntimes.every((runtime) => runtimes.includes(runtime));
  if (contract?.kind !== "mixed" || runtimes.length !== expectedRuntimes.length || !hasEveryRuntime) {
    throw new Error("O smoke deve compilar o projeto completo com todos os runtimes na mesma ROM.");
  }
  if (dispatch.initial_runtime !== "cutscene" || dispatch.initial_scene !== "logo" || dispatch.initial_room < 0) {
    throw new Error("O smoke deve iniciar pela Cena Logo do Vértice no projeto completo.");
  }
  return Object.freeze({
    kind: contract.kind,
    initialRuntime: dispatch.initial_runtime,
    initialRoom: dispatch.initial_room,
    initialScene: dispatch.initial_scene,
    runtimes: [...runtimes]
  });
}
