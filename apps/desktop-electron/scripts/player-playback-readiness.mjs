// This function is serialized into the isolated Player renderer by the smoke.
// Keep it self-contained and free of visual inspections, layout and mutations.
export function readPlayerPlaybackReadiness(player, observedAtUnixMs) {
  const runtimeState = player?.inspectRuntime?.()?.state ?? null;
  const presented = player?.inspectPresentedRuntime?.() ?? null;
  const presentedRuntimeState = presented?.state ?? null;
  const canvas = player?.canvas;
  const pcmQueued = ["running-silent", "running-non-silent"].includes(canvas?.dataset?.audio);
  const ok = canvas?.width === 240 && canvas?.height === 160 && pcmQueued
    && Number.isFinite(runtimeState?.frame) && runtimeState.frame >= 8
    && Number.isFinite(presentedRuntimeState?.frame) && presentedRuntimeState.frame >= 8
    && runtimeState.runtimeKind === presentedRuntimeState.runtimeKind
    && runtimeState.currentRoom === presentedRuntimeState.currentRoom;
  return { ok, observedAtUnixMs, runtimeState, presentedRuntimeState,
    previousPresentedRuntimeState: presented?.previousState ?? null };
}
