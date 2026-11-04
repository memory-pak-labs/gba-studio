/** @vitest-environment happy-dom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createInputReplay } from "../shared/inputReplay.js";
import type { RomPlayerTelemetryEvent } from "../shared/hardwareProfiler.js";
import { useInputRecording } from "./useInputRecording.js";

afterEach(cleanup);

function batch(windowID: number, firstFrame: number, masks: number[]): RomPlayerTelemetryEvent {
  return { state: "running", windowID, stats: {
    inputFrames: { firstFrame, masks }, cpuPercent: 5, droppedFrameRatio: 0, droppedFrames: 0,
    emulationFps: 60, emulationMs: 1, fps: 60, frameMs: 17, presentationFps: 60, romBytes: 1024
  } };
}

describe("input recording lifecycle", () => {
  it("waits for its own atomic capture and ignores stale batches from before the frame counter reset", () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useInputRecording({ onComplete }));
    act(() => result.current.startRecording(createInputReplay({ id: "capture", seed: 0 }), null, true));
    act(() => result.current.consumeTelemetry(batch(1, 500, [16])));
    expect(result.current.replay!.frameCount).toBe(0);
    const recordingStart = { format: "mgba-state-v1" as const, romSha256: "a".repeat(64), coreSha256: "b".repeat(64), stateBase64: "AQIDBA==", savedataBase64: "" };
    act(() => result.current.consumeTelemetry({ ...batch(1, 0, []), stats: { ...batch(1, 0, []).stats!, recordingID: "capture", recordingStart } }));
    act(() => result.current.consumeTelemetry(batch(1, 501, [16])));
    act(() => result.current.consumeTelemetry({ ...batch(1, 0, [32, 0]), stats: { ...batch(1, 0, [32, 0]).stats!, recordingID: "capture" } }));
    act(() => result.current.stopRecording());
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ schema: 2, initialState: recordingStart, frameCount: 2 }), "manual");
    expect(result.current.replay!.runs.flatMap(run => run.frame.held)).toEqual(["LEFT"]);
  });

  function setup() {
    const onComplete = vi.fn();
    const hook = renderHook(() => useInputRecording({ onComplete, getCheckpoint: () => ({ room: "Praia" }) }));
    act(() => hook.result.current.startRecording(createInputReplay({ id: "first", seed: 7 }), null));
    return { ...hook, onComplete };
  }

  it("saves and stops when its Player closes, then accepts an independent recording", () => {
    const { result, onComplete } = setup();
    act(() => result.current.consumeTelemetry(batch(1, 0, [0, 16, 0])));
    act(() => result.current.consumeTelemetry({ state: "closed", windowID: 1 }));
    expect(result.current.recording).toBe(false);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "first", frameCount: 3 }), "closed");
    act(() => result.current.startRecording(createInputReplay({ id: "second", seed: 8 }), null));
    act(() => result.current.consumeTelemetry(batch(2, 0, [32, 0])));
    act(() => result.current.stopRecording());
    expect(onComplete).toHaveBeenLastCalledWith(expect.objectContaining({ id: "second", frameCount: 2 }), "manual");
  });

  it("keeps every input batch and short press when React coalesces telemetry updates", () => {
    const { result, onComplete } = setup();
    act(() => {
      result.current.consumeTelemetry(batch(1, 0, [0, 1]));
      result.current.consumeTelemetry(batch(1, 2, [0, 16]));
    });
    act(() => result.current.stopRecording());
    expect(onComplete).toHaveBeenCalledOnce();
    const replay = onComplete.mock.calls[0]![0];
    expect(replay.frameCount).toBe(4);
    expect(replay.runs.map((run: { frame: { held: string[] } }) => run.frame.held)).toEqual([[], ["A"], [], ["RIGHT"]]);
    expect(replay.checkpoints[0]).toEqual({ room: "Praia" });
  });

  it("finalizes once when inputs and close arrive before the next render", () => {
    const { result, onComplete } = setup();
    act(() => {
      result.current.consumeTelemetry(batch(1, 0, [1, 0]));
      result.current.consumeTelemetry({ state: "closed", windowID: 1 });
      result.current.consumeTelemetry({ state: "closed", windowID: 1 });
      result.current.stopRecording();
    });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ frameCount: 2 }), "closed");
  });

  it("preserves only the first boot when a replacement arrives without a close event", () => {
    const { result, onComplete } = setup();
    act(() => {
      result.current.consumeTelemetry(batch(1, 0, [16, 0]));
      result.current.consumeTelemetry(batch(2, 0, [32, 0]));
    });
    expect(result.current.recording).toBe(false);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ frameCount: 2 }), "replaced");
    expect(result.current.replay!.runs.flatMap(run => run.frame.held)).not.toContain("LEFT");
  });

  it("does not duplicate overlapping batches or lose the pressed edge", () => {
    const { result, onComplete } = setup();
    act(() => {
      result.current.consumeTelemetry(batch(1, 0, [0, 1]));
      result.current.consumeTelemetry(batch(1, 0, [0, 1]));
      result.current.consumeTelemetry(batch(1, 1, [1, 1, 0]));
      result.current.stopRecording();
    });
    const replay = onComplete.mock.calls[0]![0];
    expect(replay.frameCount).toBe(4);
    expect(replay.runs.map((run: { frame: { pressed: string[] } }) => run.frame.pressed)).toEqual([[], ["A"], [], []]);
  });

  it("reports a missing batch and saves the intact prefix instead of compressing the gap", () => {
    const { result, onComplete } = setup();
    act(() => {
      result.current.consumeTelemetry(batch(1, 0, [1, 0]));
      result.current.consumeTelemetry(batch(1, 5, [16]));
    });
    expect(result.current.recording).toBe(false);
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ frameCount: 2 }), "gap");
  });

  it("reports a failed final flush as a partial route instead of successful manual completion", () => {
    const { result, onComplete } = setup();
    act(() => {
      result.current.consumeTelemetry(batch(1, 0, [16, 0]));
      result.current.stopRecording("gap");
    });
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ frameCount: 2 }), "gap");
    expect(result.current.recording).toBe(false);
  });

  it("ignores an unrelated close while armed and skips inputs seen before recording started", () => {
    const { result, onComplete } = setup();
    act(() => result.current.consumeTelemetry({ state: "closed", windowID: 7 }));
    expect(result.current.recording).toBe(true);
    expect(onComplete).not.toHaveBeenCalled();
    act(() => result.current.stopRecording());
    onComplete.mockClear();
    act(() => result.current.startRecording(createInputReplay({ id: "live", seed: 1 }), batch(8, 98, [1, 0])));
    act(() => {
      result.current.consumeTelemetry(batch(8, 99, [0, 32, 0]));
      result.current.stopRecording();
    });
    expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ id: "live", frameCount: 2 }), "manual");
    expect(result.current.replay!.runs[0]!.frame.held).toEqual(["LEFT"]);
  });
});
