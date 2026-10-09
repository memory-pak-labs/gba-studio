import { describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";

import {
  analyzeRgbaFrame,
  analyzePcmSamples,
  copyModuleSavedata,
  createKeyboardInputLatch,
  createReplayDriver,
  decodeRuntimeTelemetryWords,
  inputMasksForEmulatedFrames,
  keyboardKeyMapForBindings,
  inspectSavedataBytes,
  integerFramebufferScale,
  measureFrameCadence,
  planEmulationFrames,
  planPcmBufferSchedule,
  readRuntimeTelemetry,
  readRuntimeTelemetryFromHeap,
  restoreModuleSavedata
} from "../static/WebPlayer/player/mgba-direct-player.mjs";

function solidFrame(red, green, blue, width = 4, height = 4) {
  const bytes = new Uint8ClampedArray(width * height * 4);
  for (let offset = 0; offset < bytes.length; offset += 4) {
    bytes[offset] = red;
    bytes[offset + 1] = green;
    bytes[offset + 2] = blue;
    bytes[offset + 3] = 255;
  }
  return bytes;
}

describe("mGBA direct player framebuffer", () => {
  it("preserves a short tap across both VBlanks of a 30 FPS runtime update", () => {
    const keyboard = createKeyboardInputLatch();
    keyboard.press(1 << 0);
    keyboard.release(1 << 0);

    expect(keyboard.sample(0)).toBe(1 << 0);
    expect(keyboard.sample(1)).toBe(1 << 0);
    expect(keyboard.sample(1)).toBe(1 << 0);
    expect(keyboard.sample(1)).toBe(0);
  });

  it("consumes a tap in a two-frame batch without extending other released buttons", () => {
    const keyboard = createKeyboardInputLatch();
    keyboard.press(1); keyboard.release(1);
    expect(keyboard.sample(1)).toBe(1);
    keyboard.press(2); keyboard.release(2);
    expect(keyboard.sample(1)).toBe(3);
    expect(keyboard.sample(1)).toBe(2);
    expect(keyboard.sample(1)).toBe(0);
    keyboard.press(1); keyboard.release(1);
    expect(keyboard.sample(2)).toBe(1);
    expect(keyboard.sample(1)).toBe(0);
  });

  it("keeps a held keyboard button active across frames", () => {
    const keyboard = createKeyboardInputLatch();
    keyboard.press(1 << 7);

    expect(keyboard.sample(1)).toBe(1 << 7);
    expect(keyboard.sample(1)).toBe(1 << 7);
    keyboard.release(1 << 7);
    expect(keyboard.sample(1)).toBe(0);
  });

  it("maps multiple configured keyboard alternatives to one GBA button", () => {
    const keyMap = keyboardKeyMapForBindings({
      up: ["ArrowUp", "w"],
      a: ["Alt", "z", "j"]
    });

    expect(keyMap.get("ArrowUp")).toBe(1 << 6);
    expect(keyMap.get("KeyW")).toBe(1 << 6);
    expect(keyMap.get("AltLeft")).toBe(1);
    expect(keyMap.get("KeyZ")).toBe(1);
    expect(keyMap.get("KeyJ")).toBe(1);
  });

  it("recognizes a universal GBA Studio save record in mGBA savedata", () => {
    const bytes = new Uint8Array(2048);
    bytes.fill(0xFF);
    bytes.set([0x47, 0x42, 0x55, 0x53], 0);
    bytes.set([0x01, 0x00, 0x04, 0x00], 4);
    bytes.set([0x47, 0x42, 0x53, 0x4D], 16);
    let checksum = 2166136261;
    for (const byte of bytes.subarray(16, 20)) {
      checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
    }
    new DataView(bytes.buffer).setUint32(8, checksum, true);
    new DataView(bytes.buffer).setUint32(12, 7, true);

    expect(inspectSavedataBytes(bytes)).toMatchObject({
      bytes: 2048,
      hasUniversalSlotRecord: true,
      recordMagicOffset: 16,
      slotSignatureOffset: 0,
      slot: {
        checksumValid: true,
        payloadSize: 4,
        sequence: 7,
        status: "ok",
        version: 1
      }
    });

    bytes[19] ^= 0x01;
    expect(inspectSavedataBytes(bytes).slot).toMatchObject({
      checksumValid: false,
      status: "checksum-mismatch"
    });
  });

  it("round-trips savedata through the native mGBA adapter", () => {
    const heap = new Uint8Array(64);
    let restored = null;
    const module = {
      HEAPU8: heap,
      _free: () => {},
      _gba_savedata_copy: (pointer, size) => {
        heap.set([1, 2, 3, 4], pointer);
        return size;
      },
      _gba_savedata_restore: (pointer, size) => {
        restored = heap.slice(pointer, pointer + size);
        return 1;
      },
      _gba_savedata_size: () => 4,
      _malloc: () => 16
    };

    const snapshot = copyModuleSavedata(module);
    expect(snapshot).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(restoreModuleSavedata(module, snapshot)).toBe(true);
    expect(restored).toEqual(snapshot);
  });

  it.each(["copy", "restore"])("frees savedata buffers when native %s fails", (operation) => {
    const failure = () => { throw new Error("native failure"); };
    const module = {
      HEAPU8: new Uint8Array(64),
      _malloc: () => 16,
      _free: vi.fn(),
      _gba_savedata_size: () => 4,
      _gba_savedata_copy: failure,
      _gba_savedata_restore: failure
    };
    expect(() => operation === "copy"
      ? copyModuleSavedata(module)
      : restoreModuleSavedata(module, new Uint8Array(4))).toThrow("native failure");
    expect(module._free).toHaveBeenCalledExactlyOnceWith(16);
  });

  it("consumes one replay input for each emulated frame in a catch-up batch", () => {
    const replay = createReplayDriver({
      runs: [
        { frame: { held: ["A"], pressed: ["A"] }, frames: 1 },
        { frame: { held: ["RIGHT"], pressed: [] }, frames: 2 }
      ]
    });

    expect(inputMasksForEmulatedFrames({
      framesToRun: 3,
      manualKeys: 1 << 6,
      replayDriver: replay
    })).toEqual([1, 1 << 4, 1 << 4]);
    expect(replay.complete).toBe(true);
    expect(inputMasksForEmulatedFrames({
      framesToRun: 2,
      manualKeys: 1 << 6,
      replayDriver: replay
    })).toEqual([1 << 6, 1 << 6]);
  });

  it("releases manual input as soon as the deterministic replay consumes its last frame", () => {
    const replay = createReplayDriver({
      runs: [
        {
          frame: { held: ["A"], pressed: ["A"] },
          frames: 1
        }
      ]
    });

    expect(replay.complete).toBe(false);
    expect(replay.inspect()).toEqual({
      complete: false,
      consumedFrames: 0,
      totalFrames: 1
    });
    expect(replay.next()).toBe(1);
    expect(replay.complete).toBe(true);
    expect(replay.inspect()).toEqual({
      complete: true,
      consumedFrames: 1,
      totalFrames: 1
    });
    expect(replay.next()).toBeNull();
  });

  it("uses only the largest integer scale that fits the 240x160 framebuffer", () => {
    expect(integerFramebufferScale(720, 480)).toEqual({ height: 480, scale: 3, width: 720 });
    expect(integerFramebufferScale(600, 460)).toEqual({ height: 320, scale: 2, width: 480 });
    expect(integerFramebufferScale(1000, 640)).toEqual({ height: 640, scale: 4, width: 960 });
    expect(integerFramebufferScale(200, 100)).toEqual({ height: 160, scale: 1, width: 240 });
  });

  it("keeps emulation near the GBA cadence independently of a 120 Hz display", () => {
    const frameDurationMs = 1000 / 59.7275;
    let accumulatorMs = 0;
    let emulatedFrames = 0;
    for (let displayFrame = 0; displayFrame < 120; displayFrame += 1) {
      const plan = planEmulationFrames({ accumulatorMs, elapsedMs: 1000 / 120, frameDurationMs });
      accumulatorMs = plan.accumulatorMs;
      emulatedFrames += plan.framesToRun;
    }
    expect(emulatedFrames).toBeGreaterThanOrEqual(59);
    expect(emulatedFrames).toBeLessThanOrEqual(60);
  });

  it("caps catch-up work and reports frames discarded after a long stall", () => {
    expect(planEmulationFrames({
      accumulatorMs: 0,
      elapsedMs: 200,
      frameDurationMs: 1000 / 60,
      maxCatchUpFrames: 4
    })).toMatchObject({ framesToRun: 4, droppedFrames: 8 });
  });

  it("reports emulation and presentation cadence separately", () => {
    expect(measureFrameCadence({
      droppedFrames: 2,
      elapsedMs: 1000,
      emulatedFrames: 58,
      presentationFrames: 55,
      totalEmulationMs: 120
    })).toEqual({
      cpuPercent: 12,
      droppedFrameRatio: 0.0333,
      droppedFrames: 2,
      emulationFps: 58,
      emulationMs: 2.07,
      fps: 55,
      frameMs: 18.18,
      presentationFps: 55
    });
  });

  it("measures non-silent stereo PCM emitted by the native core", () => {
    expect(analyzePcmSamples(new Int16Array([0, 0, 1200, -800, -32768, 32767]))).toEqual({
      sampleCount: 6,
      frameCount: 3,
      nonSilentSampleCount: 4,
      peak: 1
    });
  });

  it("keeps a stable PCM prebuffer and reports underrun resynchronization", () => {
    expect(planPcmBufferSchedule({ currentTime: 10, nextAudioTime: 0 })).toEqual({
      nextAudioTime: 10.08,
      resynchronized: true,
      underrun: false
    });
    expect(planPcmBufferSchedule({ currentTime: 10, nextAudioTime: 9.99 })).toEqual({
      nextAudioTime: 10.08,
      resynchronized: true,
      underrun: true
    });
    expect(planPcmBufferSchedule({ currentTime: 10, nextAudioTime: 10.01 })).toEqual({
      nextAudioTime: 10.01,
      resynchronized: false,
      underrun: false
    });
    expect(planPcmBufferSchedule({ currentTime: 10, nextAudioTime: 10.12 })).toEqual({
      nextAudioTime: 10.12,
      resynchronized: false,
      underrun: false
    });
    expect(planPcmBufferSchedule({ currentTime: 10, nextAudioTime: 10.4 })).toEqual({
      nextAudioTime: 10.4,
      resynchronized: false,
      underrun: false
    });
  });

  it("wires the native PCM buffer into a resumable Web Audio output", async () => {
    const [player, wrapper] = await Promise.all([
      readFile(new URL("../static/WebPlayer/player/mgba-direct-player.mjs", import.meta.url), "utf8"),
      readFile(new URL("../third_party/mgba-web/mgba_web.c", import.meta.url), "utf8")
    ]);
    expect(wrapper).toContain("gba_audio_samples");
    expect(wrapper).toContain("blip_read_samples");
    expect(player).toContain("new AudioContext");
    expect(player).toContain("module._gba_audio_sample_count()");
    expect(player).toContain("audioContext.resume()");
    expect(player).toContain("audioUnderrunCount");
  });

  it("keeps the runtime state that was presented with the current framebuffer", async () => {
    const player = await readFile(new URL("../static/WebPlayer/player/mgba-direct-player.mjs", import.meta.url), "utf8");
    expect(player).toMatch(/module\._gba_run_frame\(\);\s+presentedRuntimeState = readRuntimeTelemetry\(module\);/);
    expect(player).not.toContain("presentedRuntimeState = runtimeStateBeforeFrame;");
    expect(player).toContain("inspectPresentedRuntime");
  });

  it("decodes native room, variables, flags and actor state from EWRAM words", () => {
    const words = new Uint32Array(50);
    words[0] = 0x47535452;
    words[1] = 2;
    words[2] = 50;
    words[3] = 180;
    words[4] = 0;
    words[5] = 3;
    words[6] = 1;
    words[7] = 1;
    words[21] = 0b110;
    words[22] = 120;
    words[23] = 80;
    words[24] = 3;
    words[25] = 1;
    words[26] = 144;
    words[27] = 80;
    words[28] = 3;
    words[29] = 1;
    words[32] = 0x20;
    words[33] = 2;
    words[34] = 0xe0;
    words[35] = 0x14;
    words[36] = 2;
    words[37] = 1;
    words[38] = 1;
    words[39] = 0x0f;
    words[40] = 1200;
    words[41] = 240;
    words[42] = 1600;
    words[43] = 320;
    words[44] = 2;
    words[45] = 1;
    words[46] = 1 | ((1 + 1) << 8);
    words[47] = 0x30;
    words[48] = 0x10;
    words[49] = 0x20;

    expect(decodeRuntimeTelemetryWords(words)).toMatchObject({
      schema: 2,
      frame: 180,
      currentRoom: 0,
      runtimeKind: 1,
      variables: expect.arrayContaining([3, 1, 1]),
      flagBits: 0b110,
      player: { x: 120, y: 80, direction: 3 },
      firstActor: { x: 144, y: 80, direction: 3, visible: true },
      collision: {
        currentFlags: 0x20,
        currentSlope: 2,
        seenEffectBits: 0xe0,
        seenSlopeBits: 0x14,
        blockedDirectionBits: 0x0f
      },
      triggerEnterCount: 2,
      triggerLeaveCount: 1,
      roomChangeCount: 1,
      timing: {
        cpuWorkTicks: 1200,
        vblankWaitTicks: 240,
        peakCpuWorkTicks: 1600,
        peakVblankWaitTicks: 320,
        missedFrameCount: 2,
        renderSkipCount: 1,
        frameSkipPolicy: 1
      },
      input: { held: 0x30, pressed: 0x10, released: 0x20 }
    });
  });

  it("decodes physical runtime telemetry from the current schema", () => {
    const words = new Uint32Array(59);
    words[0] = 0x47535452;
    words[1] = 3;
    words[2] = 59;
    words[40] = 1200;
    words[41] = 240;
    words[50] = 0x3ff;
    words[51] = 96;
    words[52] = 24;
    words[53] = 18;
    words[54] = 64;
    words[55] = 3840;
    words[56] = 512;
    words[57] = 2048;
    words[58] = 128;

    expect(decodeRuntimeTelemetryWords(words)).toMatchObject({
      schema: 3,
      hardware: {
        bgTiles: 96,
        objTiles: 24,
        oam: 18,
        paletteColors: 64,
        vramBytes: 3840,
        eventBytes: 512,
        audioBytes: 2048,
        dmaBytes: 128,
        vblankTicks: 240,
        cpuWorkTicks: 1200
      }
    });
  });

  it("decodes shared audio runtime telemetry from schema four", () => {
    const words = new Uint32Array(64);
    words[0] = 0x47535452;
    words[1] = 4;
    words[2] = 64;
    words[50] = 1 << 6;
    words[57] = 2048;
    words[59] = 600;
    words[60] = 4096;
    words[61] = 3;
    words[62] = 2;
    words[63] = 18;

    expect(decodeRuntimeTelemetryWords(words)).toMatchObject({
      schema: 4,
      hardware: { audioBytes: 2048 },
      audio: {
        pcmSourceBytes: 600,
        mixerBufferBytes: 4096,
        activeVoiceCount: 3,
        pcmUnderrunCount: 2,
        pcmSubmittedBlocks: 18
      }
    });
  });

  it("finds current telemetry in the linear heap when the native bridge is legacy", () => {
    const words = new Uint32Array(59);
    words[0] = 0x47535452;
    words[1] = 3;
    words[2] = 59;
    words[3] = 24;
    words[50] = 1 << 4;
    words[55] = 4096;
    const heap = new Uint8Array(384);
    new Uint8Array(heap.buffer, 64, words.byteLength).set(new Uint8Array(words.buffer));

    const module = { HEAPU8: heap };
    expect(Array.from(readRuntimeTelemetryFromHeap(module))).toEqual(Array.from(words));
    expect(decodeRuntimeTelemetryWords(readRuntimeTelemetryFromHeap(module))).toMatchObject({
      schema: 3,
      frame: 24,
      hardware: { vramBytes: 4096 }
    });
  });

  it("does not scan the heap while the native telemetry bridge is not ready", () => {
    const module = {
      get HEAPU8() {
        throw new Error("heap scan should be deferred to modules without a native bridge");
      },
      _gba_find_runtime_telemetry: () => 0,
      _gba_runtime_telemetry_word: () => 0
    };

    expect(readRuntimeTelemetry(module)).toBeNull();
  });

  it("rejects a completely black framebuffer", () => {
    expect(analyzeRgbaFrame(solidFrame(0, 0, 0), 4, 4)).toMatchObject({
      meaningful: false,
      nonBlackPixelCount: 0,
      uniqueColorCount: 1
    });
  });

  it("rejects a uniform framebuffer even when it is not black", () => {
    expect(analyzeRgbaFrame(solidFrame(40, 80, 120), 4, 4)).toMatchObject({
      meaningful: false,
      nonBlackPixelCount: 16,
      uniqueColorCount: 1
    });
  });

  it("accepts a framebuffer with visible scene variation", () => {
    const bytes = solidFrame(0, 0, 0);
    const colors = [
      [40, 80, 120],
      [90, 140, 30],
      [220, 180, 60],
      [240, 240, 240]
    ];
    colors.forEach(([red, green, blue], index) => {
      const offset = index * 4;
      bytes[offset] = red;
      bytes[offset + 1] = green;
      bytes[offset + 2] = blue;
    });

    expect(analyzeRgbaFrame(bytes, 4, 4)).toMatchObject({
      meaningful: true,
      nonBlackPixelCount: 4,
      uniqueColorCount: 5
    });
  });

  it("accepts a three-color menu framebuffer", () => {
    const bytes = solidFrame(0, 0, 0);
    bytes[0] = 255;
    bytes[4] = 255;
    bytes[5] = 255;
    expect(analyzeRgbaFrame(bytes, 4, 4)).toMatchObject({ meaningful: true, uniqueColorCount: 3 });
  });

  it("preserves the exact RGB histogram needed for RGB555 framebuffer audits", () => {
    const bytes = new Uint8ClampedArray(4 * 4 * 4);
    for (let pixel = 0; pixel < 16; pixel += 1) {
      const offset = pixel * 4;
      bytes[offset] = pixel < 12 ? 255 : 8;
      bytes[offset + 1] = pixel < 12 ? 239 : 16;
      bytes[offset + 2] = pixel < 12 ? 197 : 41;
      bytes[offset + 3] = 255;
    }

    expect(analyzeRgbaFrame(bytes, 4, 4).colorHistogram).toEqual([
      { count: 12, rgb: [255, 239, 197] },
      { count: 4, rgb: [8, 16, 41] }
    ]);
  });

  it("changes the frame signature when pixels move while colors stay the same", () => {
    const first = solidFrame(0, 0, 0);
    const second = solidFrame(0, 0, 0);
    first[0] = 255;
    second[4] = 255;

    expect(analyzeRgbaFrame(first, 4, 4).signature).not.toBe(
      analyzeRgbaFrame(second, 4, 4).signature
    );
  });
});
