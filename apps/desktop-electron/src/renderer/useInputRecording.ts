import { useCallback, useRef, useState } from "react";
import type { RomPlayerTelemetryEvent } from "../shared/hardwareProfiler.js";
import { appendInputReplayMasks, isInputReplayInitialState, type InputReplay, type InputReplayCheckpoint } from "../shared/inputReplay.js";

interface RecordingOptions {
  onComplete(replay: InputReplay, reason: "manual" | "closed" | "replaced" | "gap" | "unavailable"): void;
  getCheckpoint?(telemetry: RomPlayerTelemetryEvent): InputReplayCheckpoint | undefined;
}

export function useInputRecording(options: RecordingOptions) {
  const callbacks = useRef(options);
  callbacks.current = options;
  const active = useRef<{ replay: InputReplay; cursor: number; windowID: number | null; capture: boolean; awaitingCapture: boolean } | null>(null);
  const [snapshot, setSnapshot] = useState<{ recording: boolean; replay: InputReplay | null }>({ recording: false, replay: null });

  const finish = useCallback((reason: Parameters<RecordingOptions["onComplete"]>[1]): void => {
    const current = active.current;
    if (!current) return;
    active.current = null;
    setSnapshot({ recording: false, replay: current.replay });
    callbacks.current.onComplete(current.replay, current.awaitingCapture ? "unavailable" : reason);
  }, []);

  const startRecording = useCallback((replay: InputReplay, telemetry: RomPlayerTelemetryEvent | null, capture = false): void => {
    finish("manual");
    const batch = telemetry?.state === "running" ? telemetry.stats?.inputFrames : null;
    active.current = {
      replay,
      capture,
      awaitingCapture: capture,
      cursor: batch ? batch.firstFrame + batch.masks.length : -1,
      windowID: telemetry?.state === "running" ? telemetry.windowID : null
    };
    setSnapshot({ recording: true, replay });
  }, [finish]);

  const stopRecording = useCallback((reason: "manual" | "gap" = "manual") => finish(reason), [finish]);

  // Consume each IPC event synchronously. React may render only the last of
  // several telemetry updates; input batches and close events are not samples.
  const consumeTelemetry = useCallback((telemetry: RomPlayerTelemetryEvent): void => {
    const current = active.current;
    if (!current) return;
    if (telemetry.state === "closed" && current.windowID !== telemetry.windowID) return;
    if (current.windowID !== null && current.windowID !== telemetry.windowID) {
      finish("replaced");
      return;
    }
    current.windowID ??= telemetry.windowID;
    if (current.capture && telemetry.state === "running") {
      if (telemetry.stats?.recordingID !== current.replay.id) return;
      if (current.awaitingCapture) {
        if (!isInputReplayInitialState(telemetry.stats?.recordingStart)) return;
        current.replay = { ...current.replay, schema: 2, initialState: telemetry.stats.recordingStart };
        current.awaitingCapture = false;
        current.cursor = 0;
        setSnapshot({ recording: true, replay: current.replay });
      }
    }
    const batch = telemetry.stats?.inputFrames;
    if (batch && batch.masks.length > 0) {
      if (current.cursor >= 0 && batch.firstFrame > current.cursor) {
        finish("gap");
        return;
      }
      const offset = Math.max(0, current.cursor - batch.firstFrame);
      if (offset < batch.masks.length) {
        current.cursor = batch.firstFrame + batch.masks.length;
        current.replay = appendInputReplayMasks(current.replay, batch.masks.slice(offset), callbacks.current.getCheckpoint?.(telemetry));
        setSnapshot({ recording: true, replay: current.replay });
      }
    }
    if (telemetry.state === "closed") finish(telemetry.recordingError ? "gap" : "closed");
  }, [finish]);

  return { ...snapshot, startRecording, stopRecording, consumeTelemetry };
}
