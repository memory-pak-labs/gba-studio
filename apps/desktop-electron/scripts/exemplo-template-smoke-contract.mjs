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
