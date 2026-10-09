export function shouldPressWideSceneAction({
  elapsedMs,
  nextActionAtMs,
  actionUntilMs,
  playerX = Number.NEGATIVE_INFINITY,
  actionUntilPlayerX = Number.POSITIVE_INFINITY
}) {
  return elapsedMs >= nextActionAtMs &&
    elapsedMs <= actionUntilMs &&
    playerX < actionUntilPlayerX;
}

export function shouldSkipWideSceneGameplayWarmup({ wideSceneSmoke, requestedSkip }) {
  return wideSceneSmoke === true && requestedSkip === true;
}

export function selectKeyboardProbeCode({ skipGameplayWarmup, wideInputCode }) {
  return skipGameplayWarmup ? wideInputCode : "KeyX";
}

export function normalizeWideActionIntervalMs(value) {
  return Number.isFinite(value) ? Math.max(100, Math.min(5_000, value)) : 900;
}

export function parseWideActionCodes(value, fallback = ["KeyX"]) {
  const codes = String(value ?? "")
    .split(",")
    .map((code) => code.trim())
    .filter(Boolean);
  return codes.length > 0 ? [...new Set(codes)] : fallback;
}

export function selectWideSceneActionCodes({ playerX, switchAtPlayerX, openingCodes, tailCodes }) {
  return playerX >= switchAtPlayerX ? tailCodes : openingCodes;
}

export function analyzeWideSceneSamples(samples, {
  minimumActorCount = 0,
  minimumDistinctSignatures = 1,
  minimumPlayerX = 0,
  minimumTriggerEnterCount = 0
} = {}) {
  if (!Array.isArray(samples) || samples.length < 2) {
    throw new Error(`Wide scene needs at least two samples: ${JSON.stringify({ sampleCount: samples?.length ?? 0 })}`);
  }
  const runtimeSamples = samples.filter((sample) => sample?.runtime && typeof sample.runtime === "object");
  if (runtimeSamples.length !== samples.length) {
    throw new Error(`Wide scene runtime telemetry was missing: ${JSON.stringify({ sampleCount: samples.length, runtimeSampleCount: runtimeSamples.length })}`);
  }
  const distinctSignatures = [...new Set(samples.map((sample) => sample.signature))];
  const maxPlayerX = Math.max(...runtimeSamples.map((sample) => Number(sample.runtime.player?.x ?? Number.NEGATIVE_INFINITY)));
  const maxActorCount = Math.max(...runtimeSamples.map((sample) => Number(sample.runtime.actorCount ?? 0)));
  const maxTriggerEnterCount = Math.max(...runtimeSamples.map((sample) => Number(sample.runtime.triggerEnterCount ?? 0)));
  if (distinctSignatures.length < minimumDistinctSignatures) {
    throw new Error(`Wide scene distinct signature count was below target: ${JSON.stringify({ actual: distinctSignatures.length, expected: minimumDistinctSignatures })}`);
  }
  if (maxPlayerX < minimumPlayerX) {
    throw new Error(`Wide scene player X was below target: ${JSON.stringify({ actual: maxPlayerX, expected: minimumPlayerX })}`);
  }
  if (maxActorCount < minimumActorCount) {
    throw new Error(`Wide scene actor count was below target: ${JSON.stringify({ actual: maxActorCount, expected: minimumActorCount })}`);
  }
  if (maxTriggerEnterCount < minimumTriggerEnterCount) {
    throw new Error(`Wide scene trigger enter count was below target: ${JSON.stringify({ actual: maxTriggerEnterCount, expected: minimumTriggerEnterCount })}`);
  }
  return {
    collisionSampleCount: runtimeSamples.filter((sample) => sample.runtime.collision && typeof sample.runtime.collision === "object").length,
    distinctSignatureCount: distinctSignatures.length,
    endPlayer: runtimeSamples.at(-1)?.runtime.player ?? null,
    maxActorCount,
    maxPlayerX,
    maxTriggerEnterCount,
    observedRooms: [...new Set(runtimeSamples.map((sample) => sample.runtime.currentRoom))],
    runtimeSampleCount: runtimeSamples.length,
    startPlayer: runtimeSamples[0]?.runtime.player ?? null
  };
}

export function buildPlayWindowCheckedFeatures({
  audioOutput = null,
  gameplayInputState = null,
  menuFlowRoute = null,
  runtimeCanaryRoute = null,
  runtimeInspection = null,
  startInputState = null,
  wideSceneRoute = null
} = {}) {
  const checked = [
    "open-rom-player-window-ipc",
    "play-window-target",
    "play-window-normal-not-fullscreen",
    "mgba-direct-canvas",
    "meaningful-framebuffer-pixels",
    "rom-canvas-clean-without-profiler-overlay",
    "player-telemetry-to-main-debugger",
    "editor-bottom-debugger-live-and-idle-states",
    "keyboard-input",
    "play-window-close",
    "main-window-responsive-after-play-close"
  ];
  if (startInputState) checked.push("start-input-and-player-screenshot");
  if (gameplayInputState) checked.push("dpad-visible-frame-change");
  if (runtimeInspection?.state) checked.push("native-rom-runtime-state");
  if (audioOutput) checked.push("web-audio-non-silent-pcm");
  if (runtimeCanaryRoute) checked.push("trigger-enter-leave-and-room-change");
  if (menuFlowRoute) checked.push("logo-title-menu-gameplay");
  if (wideSceneRoute) {
    checked.push("wide-scene-continuous-frame-sampling");
    checked.push("wide-scene-no-empty-frames");
    if (wideSceneRoute.runtimeSampleCount === wideSceneRoute.sampleCount) {
      checked.push("wide-scene-native-runtime-sampling");
    }
  }
  return checked;
}
