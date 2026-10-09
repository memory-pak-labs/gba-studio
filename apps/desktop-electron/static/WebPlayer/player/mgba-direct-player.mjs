const WIDTH = 240;
const HEIGHT = 160;
const FRAME_BYTES = WIDTH * HEIGHT * 4;
const GBA_FRAMES_PER_SECOND = 59.7275;
const GBA_FRAME_DURATION_MS = 1000 / GBA_FRAMES_PER_SECOND;
const MAX_CATCH_UP_FRAMES = 4;
const AUDIO_PREBUFFER_SECONDS = 0.08;
const RUNTIME_TELEMETRY_MAGIC = 0x47535452;
const RUNTIME_TELEMETRY_LEGACY_SCHEMA = 2;
const RUNTIME_TELEMETRY_LEGACY_WORD_COUNT = 50;
const RUNTIME_TELEMETRY_PREVIOUS_SCHEMA = 3;
const RUNTIME_TELEMETRY_PREVIOUS_WORD_COUNT = 59;
const RUNTIME_TELEMETRY_SCHEMA = 4;
const RUNTIME_TELEMETRY_WORD_COUNT = 64;
const runtimeTelemetryHeapOffsets = new WeakMap();
const DEFAULT_KEYBOARD_KEY_MAP = new Map([
  ["KeyX", 1 << 0], ["KeyZ", 1 << 1], ["Backspace", 1 << 2], ["Enter", 1 << 3],
  ["ArrowRight", 1 << 4], ["ArrowLeft", 1 << 5], ["ArrowUp", 1 << 6], ["ArrowDown", 1 << 7],
  ["KeyS", 1 << 8], ["KeyA", 1 << 9]
]);
const inputReplayKeyBits = {
  A: 1 << 0,
  B: 1 << 1,
  SELECT: 1 << 2,
  START: 1 << 3,
  RIGHT: 1 << 4,
  LEFT: 1 << 5,
  UP: 1 << 6,
  DOWN: 1 << 7,
  R: 1 << 8,
  L: 1 << 9
};

const keyboardBindingBits = {
  a: 1 << 0,
  b: 1 << 1,
  select: 1 << 2,
  start: 1 << 3,
  right: 1 << 4,
  left: 1 << 5,
  up: 1 << 6,
  down: 1 << 7,
  r: 1 << 8,
  l: 1 << 9
};

function normalizeKeyboardCode(value) {
  if (typeof value !== "string") return null;
  const token = value.trim();
  if (!token) return null;
  const aliases = {
    alt: "AltLeft",
    control: "ControlLeft",
    ctrl: "ControlLeft",
    shift: "ShiftLeft",
    space: "Space",
    enter: "Enter",
    backspace: "Backspace",
    tab: "Tab",
    escape: "Escape"
  };
  const alias = aliases[token.toLowerCase()];
  if (alias) return alias;
  if (/^[a-z]$/i.test(token)) return `Key${token.toUpperCase()}`;
  if (/^\d$/.test(token)) return `Digit${token}`;
  if (/^(?:Key[A-Z]|Digit\d|Arrow(?:Up|Down|Left|Right)|(?:Alt|Control|Shift)(?:Left|Right)|Space|Enter|Backspace|Tab|Escape|Numpad\w+|F\d{1,2})$/.test(token)) {
    return token;
  }
  return null;
}

export function keyboardKeyMapForBindings(bindings) {
  if (!bindings || typeof bindings !== "object" || Array.isArray(bindings)) {
    return new Map(DEFAULT_KEYBOARD_KEY_MAP);
  }

  const keyMap = new Map();
  for (const [action, bit] of Object.entries(keyboardBindingBits)) {
    const configuredKeys = bindings[action];
    if (!Array.isArray(configuredKeys)) continue;
    for (const token of configuredKeys) {
      const code = normalizeKeyboardCode(token);
      if (!code) continue;
      keyMap.set(code, (keyMap.get(code) ?? 0) | bit);
    }
  }
  return keyMap;
}

export function createKeyboardInputLatch() {
  const held = new Set();
  const pendingPresses = new Map();
  return {
    press(key) {
      held.add(key);
      // A runtime running at 30 FPS may read KEYINPUT only every second VBlank.
      // Preserve taps across that interval, even after the browser sends keyup.
      pendingPresses.set(key, 2);
    },
    release(key) {
      held.delete(key);
    },
    sample(framesToRun) {
      const keys = [...held, ...pendingPresses.keys()].reduce((value, key) => value | key, 0);
      if (framesToRun > 0) {
        for (const [key, remaining] of pendingPresses) {
          if (remaining <= framesToRun) pendingPresses.delete(key);
          else pendingPresses.set(key, remaining - framesToRun);
        }
      }
      return keys >>> 0;
    }
  };
}

function normalizeReplayName(value) {
  return typeof value === "string" ? value.trim().toUpperCase() : "";
}

function inputReplayFrameToKeyMask(frame) {
  if (!frame || typeof frame !== "object") return 0;
  const keys = new Set([
    ...Array.isArray(frame.held) ? frame.held.map(normalizeReplayName) : [],
    ...Array.isArray(frame.pressed) ? frame.pressed.map(normalizeReplayName) : []
  ]);
  let keysMask = 0;
  for (const key of keys) {
    const bit = inputReplayKeyBits[key];
    if (bit) keysMask |= bit;
  }
  return keysMask >>> 0;
}

export function createReplayDriver(replay) {
  if (!replay || !Array.isArray(replay.runs) || replay.runs.length === 0) {
    return {
      next: null,
      complete: true,
      inspect: () => Object.freeze({ complete: true, consumedFrames: 0, totalFrames: 0 })
    };
  }

  const runs = replay.runs
    .filter((run) => run && run.frames > 0)
    .map((run) => ({
      frames: Math.max(1, Math.floor(Number(run.frames) || 0)),
      keys: inputReplayFrameToKeyMask(run.frame)
    }))
    .filter((run) => run.frames > 0);
  if (runs.length === 0) {
    return {
      next: null,
      complete: true,
      inspect: () => Object.freeze({ complete: true, consumedFrames: 0, totalFrames: 0 })
    };
  }

  let runIndex = 0;
  let framesLeft = 0;
  let nextKey = 0;
  let consumedFrames = 0;
  const totalFrames = runs.reduce((total, run) => total + run.frames, 0);
  return {
    complete: false,
    inspect() {
      return Object.freeze({
        complete: this.complete,
        consumedFrames,
        totalFrames
      });
    },
    next() {
      if (framesLeft <= 0) {
        if (runIndex >= runs.length) return null;
        const run = runs[runIndex++];
        nextKey = run.keys;
        framesLeft = run.frames;
      }
      framesLeft -= 1;
      consumedFrames += 1;
      if (framesLeft === 0 && runIndex >= runs.length) {
        this.complete = true;
      }
      return nextKey;
    }
  };
}

export function inputMasksForEmulatedFrames({
  framesToRun,
  manualKeys,
  replayDriver
}) {
  const masks = [];
  const fallback = Number(manualKeys) >>> 0;
  for (let frame = 0; frame < Math.max(0, Number(framesToRun) || 0); frame += 1) {
    const replayKeys = replayDriver?.next();
    masks.push(
      replayKeys !== null && replayKeys !== undefined
        ? replayKeys >>> 0
        : fallback
    );
  }
  return masks;
}

export function integerFramebufferScale(containerWidth, containerHeight) {
  const availableWidth = Math.max(0, Number(containerWidth) || 0);
  const availableHeight = Math.max(0, Number(containerHeight) || 0);
  const scale = Math.max(1, Math.floor(Math.min(availableWidth / WIDTH, availableHeight / HEIGHT)));
  return Object.freeze({
    height: HEIGHT * scale,
    scale,
    width: WIDTH * scale
  });
}

function bindIntegerFramebufferScale(canvas, container) {
  const update = () => {
    const layout = integerFramebufferScale(container.clientWidth, container.clientHeight);
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    canvas.dataset.integerScale = String(layout.scale);
  };
  const observer = typeof ResizeObserver === "function" ? new ResizeObserver(update) : null;
  observer?.observe(container);
  window.addEventListener("resize", update);
  update();
  return () => {
    observer?.disconnect();
    window.removeEventListener("resize", update);
  };
}

function signedWord(value) {
  return Number(value) | 0;
}

function rounded(value, digits) {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

export function planEmulationFrames({
  accumulatorMs,
  elapsedMs,
  frameDurationMs = GBA_FRAME_DURATION_MS,
  maxCatchUpFrames = MAX_CATCH_UP_FRAMES
}) {
  const accumulated = Math.max(0, accumulatorMs) + Math.max(0, elapsedMs);
  const dueFrames = Math.floor((accumulated + Number.EPSILON) / frameDurationMs);
  const framesToRun = Math.min(dueFrames, maxCatchUpFrames);
  return Object.freeze({
    accumulatorMs: accumulated - dueFrames * frameDurationMs,
    droppedFrames: Math.max(0, dueFrames - framesToRun),
    framesToRun
  });
}

export function planPcmBufferSchedule({
  currentTime,
  nextAudioTime,
  prebufferSeconds = AUDIO_PREBUFFER_SECONDS
}) {
  const now = Math.max(0, Number(currentTime) || 0);
  const scheduled = Math.max(0, Number(nextAudioTime) || 0);
  const uninitialized = scheduled === 0;
  const underrun = !uninitialized && scheduled < now;
  const resynchronized = uninitialized || underrun;
  return Object.freeze({
    nextAudioTime: resynchronized ? now + prebufferSeconds : scheduled,
    resynchronized,
    underrun
  });
}

export function measureFrameCadence({
  droppedFrames,
  elapsedMs,
  emulatedFrames,
  presentationFrames,
  totalEmulationMs
}) {
  const safeElapsedMs = Math.max(1, elapsedMs);
  const scheduledFrames = emulatedFrames + droppedFrames;
  const presentationFps = presentationFrames > 0 ? (presentationFrames / safeElapsedMs) * 1000 : 0;
  return Object.freeze({
    cpuPercent: rounded((totalEmulationMs / safeElapsedMs) * 100, 2),
    droppedFrameRatio: rounded(scheduledFrames > 0 ? droppedFrames / scheduledFrames : 0, 4),
    droppedFrames,
    emulationFps: rounded((emulatedFrames / safeElapsedMs) * 1000, 2),
    emulationMs: rounded(emulatedFrames > 0 ? totalEmulationMs / emulatedFrames : 0, 2),
    fps: rounded(presentationFps, 2),
    frameMs: rounded(presentationFrames > 0 ? safeElapsedMs / presentationFrames : 0, 2),
    presentationFps: rounded(presentationFps, 2)
  });
}

export function decodeRuntimeTelemetryWords(words) {
  if (!words || words.length < 3 || Number(words[0]) !== RUNTIME_TELEMETRY_MAGIC) {
    return null;
  }
  const schema = Number(words[1]);
  const wordCount = Number(words[2]);
  const isLegacyLayout = schema === RUNTIME_TELEMETRY_LEGACY_SCHEMA && wordCount === RUNTIME_TELEMETRY_LEGACY_WORD_COUNT;
  const isPreviousLayout = schema === RUNTIME_TELEMETRY_PREVIOUS_SCHEMA && wordCount === RUNTIME_TELEMETRY_PREVIOUS_WORD_COUNT;
  const isCurrentLayout = schema === RUNTIME_TELEMETRY_SCHEMA && wordCount === RUNTIME_TELEMETRY_WORD_COUNT;
  if ((!isLegacyLayout && !isPreviousLayout && !isCurrentLayout) || wordCount > words.length) {
    return null;
  }
  const physicalValidBits = (isPreviousLayout || isCurrentLayout) ? Number(words[50]) : 0;
  const hardware = {};
  if ((physicalValidBits & (1 << 0)) !== 0) hardware.bgTiles = Number(words[51]);
  if ((physicalValidBits & (1 << 1)) !== 0) hardware.objTiles = Number(words[52]);
  if ((physicalValidBits & (1 << 2)) !== 0) hardware.oam = Number(words[53]);
  if ((physicalValidBits & (1 << 3)) !== 0) hardware.paletteColors = Number(words[54]);
  if ((physicalValidBits & (1 << 4)) !== 0) hardware.vramBytes = Number(words[55]);
  if ((physicalValidBits & (1 << 5)) !== 0) hardware.eventBytes = Number(words[56]);
  if ((physicalValidBits & (1 << 6)) !== 0) hardware.audioBytes = Number(words[57]);
  if ((physicalValidBits & (1 << 7)) !== 0) hardware.dmaBytes = Number(words[58]);
  if ((physicalValidBits & (1 << 8)) !== 0) hardware.vblankTicks = Number(words[41]);
  if ((physicalValidBits & (1 << 9)) !== 0) hardware.cpuWorkTicks = Number(words[40]);
  const audio = isCurrentLayout ? Object.freeze({
    pcmSourceBytes: Number(words[59]),
    mixerBufferBytes: Number(words[60]),
    activeVoiceCount: Number(words[61]),
    pcmUnderrunCount: Number(words[62]),
    pcmSubmittedBlocks: Number(words[63])
  }) : null;
  return Object.freeze({
    schema,
    frame: Number(words[3]),
    currentRoom: signedWord(words[4]),
    runtimeKind: Math.max(-1, (Number(words[46]) >>> 8) - 1),
    variables: Object.freeze(Array.from(words.slice(5, 21), signedWord)),
    flagBits: Number(words[21]),
    player: Object.freeze({
      x: signedWord(words[22]),
      y: signedWord(words[23]),
      direction: signedWord(words[24])
    }),
    actorCount: Number(words[25]),
    firstActor: Object.freeze({
      x: signedWord(words[26]),
      y: signedWord(words[27]),
      direction: signedWord(words[28]),
      visible: Number(words[29]) !== 0
    }),
    lastMusic: signedWord(words[30]),
    lastSfx: signedWord(words[31]),
    collision: Object.freeze({
      currentFlags: Number(words[32]),
      currentSlope: Number(words[33]),
      seenEffectBits: Number(words[34]),
      seenSlopeBits: Number(words[35]),
      blockedDirectionBits: Number(words[39])
    }),
    triggerEnterCount: Number(words[36]),
    triggerLeaveCount: Number(words[37]),
    roomChangeCount: Number(words[38]),
    timing: Object.freeze({
      cpuWorkTicks: Number(words[40]),
      vblankWaitTicks: Number(words[41]),
      peakCpuWorkTicks: Number(words[42]),
      peakVblankWaitTicks: Number(words[43]),
      missedFrameCount: Number(words[44]),
      renderSkipCount: Number(words[45]),
      frameSkipPolicy: Number(words[46]) & 0xFF
    }),
    input: Object.freeze({
      held: Number(words[47]),
      pressed: Number(words[48]),
      released: Number(words[49])
    }),
    hardware: Object.keys(hardware).length > 0 ? Object.freeze(hardware) : null,
    audio
  });
}

function runtimeTelemetryWordCountAt(view, offset) {
  if (offset < 0 || offset + (3 * 4) > view.byteLength || view.getUint32(offset, true) !== RUNTIME_TELEMETRY_MAGIC) {
    return 0;
  }
  const schema = view.getUint32(offset + 4, true);
  const wordCount = view.getUint32(offset + 8, true);
  const isLegacyLayout = schema === RUNTIME_TELEMETRY_LEGACY_SCHEMA && wordCount === RUNTIME_TELEMETRY_LEGACY_WORD_COUNT;
  const isPreviousLayout = schema === RUNTIME_TELEMETRY_PREVIOUS_SCHEMA && wordCount === RUNTIME_TELEMETRY_PREVIOUS_WORD_COUNT;
  const isCurrentLayout = schema === RUNTIME_TELEMETRY_SCHEMA && wordCount === RUNTIME_TELEMETRY_WORD_COUNT;
  return (isLegacyLayout || isPreviousLayout || isCurrentLayout) && offset + (wordCount * 4) <= view.byteLength ? wordCount : 0;
}

export function readRuntimeTelemetryFromHeap(module) {
  const heap = module?.HEAPU8;
  if (!heap || typeof heap.byteLength !== "number" || heap.byteLength < 3 * 4) return null;
  const view = new DataView(heap.buffer, heap.byteOffset, heap.byteLength);
  let offset = runtimeTelemetryHeapOffsets.get(module);
  if (offset === undefined || runtimeTelemetryWordCountAt(view, offset) === 0) {
    offset = -1;
    for (let candidate = 0; candidate + (3 * 4) <= view.byteLength; candidate += 4) {
      if (runtimeTelemetryWordCountAt(view, candidate) > 0) {
        offset = candidate;
        break;
      }
    }
    if (offset < 0) return null;
    runtimeTelemetryHeapOffsets.set(module, offset);
  }
  const wordCount = runtimeTelemetryWordCountAt(view, offset);
  if (wordCount === 0) return null;
  return Uint32Array.from(
    { length: wordCount },
    (_, index) => view.getUint32(offset + (index * 4), true)
  );
}

export function readRuntimeTelemetry(module) {
  const hasNativeBridge = typeof module._gba_find_runtime_telemetry === "function" &&
    typeof module._gba_runtime_telemetry_word === "function";
  if (hasNativeBridge) {
    if (module._gba_find_runtime_telemetry() !== 0) {
      const wordCount = module._gba_runtime_telemetry_word(2) >>> 0;
      if (wordCount === RUNTIME_TELEMETRY_LEGACY_WORD_COUNT || wordCount === RUNTIME_TELEMETRY_PREVIOUS_WORD_COUNT || wordCount === RUNTIME_TELEMETRY_WORD_COUNT) {
        const words = Uint32Array.from(
          { length: wordCount },
          (_, index) => module._gba_runtime_telemetry_word(index) >>> 0
        );
        const decoded = decodeRuntimeTelemetryWords(words);
        if (decoded) return decoded;
      }
    }
    return null;
  }
  return decodeRuntimeTelemetryWords(readRuntimeTelemetryFromHeap(module));
}

export function analyzeRgbaFrame(bytes, width = WIDTH, height = HEIGHT) {
  const pixelCount = width * height;
  if (!bytes || bytes.length < pixelCount * 4 || pixelCount <= 0) {
    throw new Error("Framebuffer RGBA invalido para analise visual.");
  }
  const colors = new Set();
  let nonBlackPixelCount = 0;
  const colorCounts = new Map();
  let dominantPixelCount = 0;
  let signatureHash = 0x811c9dc5;
  for (let pixel = 0; pixel < pixelCount; pixel += 1) {
    const offset = pixel * 4;
    const red = bytes[offset];
    const green = bytes[offset + 1];
    const blue = bytes[offset + 2];
    if (red > 4 || green > 4 || blue > 4) nonBlackPixelCount += 1;
    const color = (red << 16) | (green << 8) | blue;
    signatureHash = Math.imul(signatureHash ^ red, 0x01000193);
    signatureHash = Math.imul(signatureHash ^ green, 0x01000193);
    signatureHash = Math.imul(signatureHash ^ blue, 0x01000193);
    colors.add(color);
    const count = (colorCounts.get(color) ?? 0) + 1;
    colorCounts.set(color, count);
    dominantPixelCount = Math.max(dominantPixelCount, count);
  }
  const nonBlackRatio = nonBlackPixelCount / pixelCount;
  const dominantColorRatio = dominantPixelCount / pixelCount;
  const uniqueColorCount = colors.size;
  const colorHistogram = [...colorCounts.entries()]
    .sort(([leftColor, leftCount], [rightColor, rightCount]) => rightCount - leftCount || leftColor - rightColor)
    .map(([color, count]) => ({
      count,
      rgb: [(color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF]
    }));
  return Object.freeze({
    colorHistogram,
    meaningful: nonBlackRatio >= 0.01 && uniqueColorCount >= 3 && dominantColorRatio < 0.995,
    pixelCount,
    nonBlackPixelCount,
    nonBlackRatio,
    uniqueColorCount,
    dominantColorRatio,
    signature: (signatureHash >>> 0).toString(16).padStart(8, "0")
  });
}

export function analyzePcmSamples(samples) {
  let nonSilentSampleCount = 0;
  let peakValue = 0;
  for (const sample of samples ?? []) {
    const magnitude = Math.abs(Number(sample));
    if (magnitude > 8) nonSilentSampleCount += 1;
    peakValue = Math.max(peakValue, magnitude);
  }
  return Object.freeze({
    sampleCount: samples?.length ?? 0,
    frameCount: Math.floor((samples?.length ?? 0) / 2),
    nonSilentSampleCount,
    peak: Math.min(1, peakValue / 32768)
  });
}

function byteSequenceOffset(bytes, sequence) {
  for (let offset = 0; offset + sequence.length <= bytes.length; offset += 1) {
    if (sequence.every((value, index) => bytes[offset + index] === value)) return offset;
  }
  return -1;
}

function readLittleEndian(bytes, offset, size) {
  let value = 0;
  for (let index = 0; index < size; index += 1) {
    value += bytes[offset + index] * (2 ** (index * 8));
  }
  return value >>> 0;
}

function savedataChecksum(bytes) {
  let checksum = 2166136261;
  for (const byte of bytes) checksum = Math.imul(checksum ^ byte, 16777619) >>> 0;
  return checksum === 0 ? 1 : checksum;
}

export function inspectSavedataBytes(bytes) {
  const savedata = bytes instanceof Uint8Array ? bytes : new Uint8Array();
  const slotSignatureOffset = byteSequenceOffset(savedata, [0x47, 0x42, 0x55, 0x53]);
  const recordMagicOffset = byteSequenceOffset(savedata, [0x47, 0x42, 0x53, 0x4D]);
  const hasSlotHeader = slotSignatureOffset >= 0 && slotSignatureOffset + 16 <= savedata.length;
  const version = hasSlotHeader ? readLittleEndian(savedata, slotSignatureOffset + 4, 2) : 0;
  const payloadSize = hasSlotHeader ? readLittleEndian(savedata, slotSignatureOffset + 6, 2) : 0;
  const storedChecksum = hasSlotHeader ? readLittleEndian(savedata, slotSignatureOffset + 8, 4) : 0;
  const sequence = hasSlotHeader ? readLittleEndian(savedata, slotSignatureOffset + 12, 4) : 0;
  const payloadStart = slotSignatureOffset + 16;
  const payloadEnd = payloadStart + payloadSize;
  const payloadFits = hasSlotHeader && payloadEnd <= savedata.length;
  const computedChecksum = payloadFits
    ? savedataChecksum(savedata.subarray(payloadStart, payloadEnd))
    : 0;
  const checksumValid = payloadFits && storedChecksum === computedChecksum;
  const slot = hasSlotHeader
    ? Object.freeze({
        checksumValid,
        computedChecksum,
        payloadSize,
        sequence,
        status: !payloadFits
          ? "payload-out-of-range"
          : version !== 1
            ? "version-mismatch"
            : checksumValid
              ? "ok"
              : "checksum-mismatch",
        storedChecksum,
        version
      })
    : null;
  return Object.freeze({
    bytes: savedata.length,
    contentChecksum: savedataChecksum(savedata),
    hasUniversalSlotRecord: slotSignatureOffset >= 0
      && recordMagicOffset === slotSignatureOffset + 16,
    recordMagicOffset,
    slot,
    slotSignatureOffset
  });
}

export function copyModuleSavedata(module) {
  if (typeof module?._gba_savedata_size !== "function" ||
      typeof module?._gba_savedata_copy !== "function") {
    return new Uint8Array();
  }
  const size = module._gba_savedata_size();
  if (!size) return new Uint8Array();
  const pointer = module._malloc(size);
  try {
    const copied = module._gba_savedata_copy(pointer, size);
    return copied === size ? module.HEAPU8.slice(pointer, pointer + size) : new Uint8Array();
  } finally {
    module._free(pointer);
  }
}

export function restoreModuleSavedata(module, savedata) {
  if (!(savedata instanceof Uint8Array) ||
      savedata.length === 0 ||
      typeof module?._gba_savedata_restore !== "function") {
    return false;
  }
  const pointer = module._malloc(savedata.length);
  try {
    module.HEAPU8.set(savedata, pointer);
    return module._gba_savedata_restore(pointer, savedata.length) === 1;
  } finally {
    module._free(pointer);
  }
}

function bytesToBase64(bytes) {
  let text = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(text);
}

function base64ToBytes(value) {
  const text = atob(value);
  return Uint8Array.from(text, (character) => character.charCodeAt(0));
}

function gamepadKeys() {
  const gamepad = [...navigator.getGamepads?.() ?? []].find(Boolean);
  if (!gamepad) return 0;
  let keys = 0;
  const pressed = (index) => gamepad.buttons[index]?.pressed === true;
  if (pressed(0)) keys |= 1 << 0;
  if (pressed(1)) keys |= 1 << 1;
  if (pressed(8)) keys |= 1 << 2;
  if (pressed(9)) keys |= 1 << 3;
  if (pressed(5)) keys |= 1 << 8;
  if (pressed(4)) keys |= 1 << 9;
  if (pressed(15) || gamepad.axes[0] > 0.45) keys |= 1 << 4;
  if (pressed(14) || gamepad.axes[0] < -0.45) keys |= 1 << 5;
  if (pressed(12) || gamepad.axes[1] < -0.45) keys |= 1 << 6;
  if (pressed(13) || gamepad.axes[1] > 0.45) keys |= 1 << 7;
  return keys;
}

export async function startMGBAPlayer({ container, romUrl, storageKey, onFrameStats, replay, keyboardBindings }) {
  if (!(container instanceof HTMLElement)) throw new Error("Container do GBA Studio Player invalido.");
  const keyboardKeys = keyboardKeyMapForBindings(keyboardBindings);
  const [{ default: createMGBA }, response] = await Promise.all([
    import("./mgba-core.mjs"),
    fetch(romUrl)
  ]);
  if (!response.ok) throw new Error(`ROM nao carregada: HTTP ${response.status}.`);
  const rom = new Uint8Array(await response.arrayBuffer());
  const module = await createMGBA({ noInitialRun: true, locateFile: (file) => new URL(file, import.meta.url).toString() });
  let active = true;
  const cleanup = [() => module._gba_destroy()];
  const destroy = () => {
    if (!active) return;
    active = false;
    for (const release of cleanup.splice(0).reverse()) {
      try { release(); } catch (error) { console.warn("Falha ao liberar recurso do Play.", error); }
    }
  };
  try {
    try {
      if (module._gba_init() !== 1) throw new Error("retorno invalido");
    } catch (error) {
      throw new Error(`Inicializacao do core mGBA falhou: ${error instanceof Error ? error.message : String(error)}`);
    }

    const romPointer = module._malloc(rom.length);
    let loaded;
    try {
      module.HEAPU8.set(rom, romPointer);
      loaded = module._gba_load_rom(romPointer, rom.length);
    } catch (error) {
      const stage = typeof module._gba_last_stage === "function" ? module._gba_last_stage() : "desconhecida";
      throw new Error(`Carregamento da ROM no core mGBA falhou na etapa ${stage}: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      module._free(romPointer);
    }
    if (loaded !== 1) throw new Error("A ROM foi rejeitada pelo core mGBA.");
    onFrameStats?.({
      cpuPercent: 0,
      droppedFrameRatio: 0,
      droppedFrames: 0,
      emulationFps: 0,
      emulationMs: 0,
      fps: 0,
      frameMs: 0,
      presentationFps: 0,
      romBytes: rom.length
    });

    const canvas = document.createElement("canvas");
    cleanup.push(() => canvas.remove());
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    canvas.className = "gba-studio-direct-canvas";
    canvas.dataset.input = "none";
    canvas.tabIndex = 0;
    canvas.dataset.audio = "suspended";
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Canvas 2D indisponivel.");
    const image = context.createImageData(WIDTH, HEIGHT);
    const keyboardInput = createKeyboardInputLatch();
    const replayDriver = replay ? createReplayDriver(replay) : null;
    const AudioContext = window.AudioContext ?? window.webkitAudioContext;
    const audioSampleRate = typeof module._gba_audio_sample_rate === "function"
      ? module._gba_audio_sample_rate()
      : 32768;
    let audioContext = null;
    cleanup.push(() => {
      if (audioContext) void audioContext.close().catch((error) => console.warn("Falha ao encerrar áudio do Play.", error));
    });
    let audioDestination = null;
    let nextAudioTime = 0;
    let emittedAudioFrames = 0;
    let emittedNonSilentSamples = 0;
    let emittedAudioPeak = 0;
    let audioResynchronizationCount = 0;
    let audioUnderrunCount = 0;
    let maxQueuedAudioSeconds = 0;
    const queuedAudioSources = new Set();
    const clearQueuedAudio = () => {
      for (const source of queuedAudioSources) {
        source.onended = null;
        source.stop();
        source.disconnect();
      }
      queuedAudioSources.clear();
      nextAudioTime = 0;
    };
    cleanup.push(clearQueuedAudio);
    const ensureAudioRunning = async () => {
      if (!active) return false;
      if (!AudioContext) {
        canvas.dataset.audio = "unavailable";
        return false;
      }
      if (!audioContext) {
        audioContext = new AudioContext({ sampleRate: audioSampleRate });
        audioDestination = audioContext.createGain();
        audioDestination.gain.value = 0.7;
        audioDestination.connect(audioContext.destination);
      }
      if (audioContext.state !== "running") await audioContext.resume();
      if (!active) return false;
      canvas.dataset.audio = audioContext.state;
      nextAudioTime = planPcmBufferSchedule({
        currentTime: audioContext.currentTime,
        nextAudioTime
      }).nextAudioTime;
      return audioContext.state === "running";
    };
    const queueNativeAudio = () => {
      if (typeof module._gba_audio_sample_count !== "function" ||
          typeof module._gba_audio_samples !== "function") return;
      const frameCount = module._gba_audio_sample_count();
      if (frameCount <= 0) return;
      const sampleCount = frameCount * 2;
      const samples = new Int16Array(module.HEAPU8.buffer, module._gba_audio_samples(), sampleCount);
      const analysis = analyzePcmSamples(samples);
      emittedAudioFrames += analysis.frameCount;
      emittedNonSilentSamples += analysis.nonSilentSampleCount;
      emittedAudioPeak = Math.max(emittedAudioPeak, analysis.peak);
      if (!audioContext || audioContext.state !== "running" || !audioDestination) return;
      const schedule = planPcmBufferSchedule({ currentTime: audioContext.currentTime, nextAudioTime });
      nextAudioTime = schedule.nextAudioTime;
      if (schedule.resynchronized) audioResynchronizationCount += 1;
      if (schedule.underrun) audioUnderrunCount += 1;
      const buffer = audioContext.createBuffer(2, frameCount, audioSampleRate);
      const left = buffer.getChannelData(0);
      const right = buffer.getChannelData(1);
      for (let index = 0; index < frameCount; index += 1) {
        left[index] = samples[index * 2] / 32768;
        right[index] = samples[index * 2 + 1] / 32768;
      }
      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioDestination);
      source.onended = () => {
        queuedAudioSources.delete(source);
        source.disconnect();
      };
      source.start(nextAudioTime);
      queuedAudioSources.add(source);
      nextAudioTime += frameCount / audioSampleRate;
      maxQueuedAudioSeconds = Math.max(maxQueuedAudioSeconds, nextAudioTime - audioContext.currentTime);
      canvas.dataset.audio = analysis.nonSilentSampleCount > 0 ? "running-non-silent" : "running-silent";
    };
    const inspectAudioRegisters = () => {
      if (typeof module._gba_audio_register !== "function") return null;
      const read = (address) => module._gba_audio_register(address) >>> 0;
      return Object.freeze({
        sound1cntH: read(0x04000062),
        sound1cntX: read(0x04000064),
        sound2cntL: read(0x04000068),
        sound2cntH: read(0x0400006c),
        sound3cntL: read(0x04000070),
        sound3cntH: read(0x04000072),
        sound3cntX: read(0x04000074),
        sound4cntL: read(0x04000078),
        sound4cntH: read(0x0400007c),
        soundcntL: read(0x04000080),
        soundcntH: read(0x04000082),
        soundcntX: read(0x04000084),
        timer1Control: read(0x04000106)
      });
    };
    const onKey = (event, isDown) => {
      if (!active) return;
      if (replayDriver && !replayDriver.complete) return;
      const key = keyboardKeys.get(event.code);
      if (!key) return;
      const systemShortcut = [
        [event.metaKey, "Meta"], [event.ctrlKey, "Control"], [event.altKey, "Alt"]
      ].some(([pressed, modifier]) => pressed
        && !keyboardKeys.has(`${modifier}Left`) && !keyboardKeys.has(`${modifier}Right`));
      if (systemShortcut) {
        // Release an existing game press without capturing the system shortcut.
        if (!isDown) keyboardInput.release(key);
        return;
      }
      event.preventDefault();
      canvas.dataset.input = isDown ? "keyboard-down" : "keyboard-up";
      if (isDown) {
        keyboardInput.press(key);
        void ensureAudioRunning();
      } else keyboardInput.release(key);
    };
    const onKeyDown = (event) => onKey(event, true);
    const onKeyUp = (event) => onKey(event, false);
    const onPointerDown = () => { void ensureAudioRunning(); };
    window.addEventListener("keydown", onKeyDown);
    cleanup.push(() => window.removeEventListener("keydown", onKeyDown));
    window.addEventListener("keyup", onKeyUp);
    cleanup.push(() => window.removeEventListener("keyup", onKeyUp));
    container.replaceChildren(canvas);
    cleanup.push(bindIntegerFramebufferScale(canvas, container));
    canvas.addEventListener("pointerdown", onPointerDown);
    cleanup.push(() => canvas.removeEventListener("pointerdown", onPointerDown));
    canvas.focus();

    let frameHandle = 0;
    cleanup.push(() => cancelAnimationFrame(frameHandle));
    let presentedRuntimeState = null;
    let accumulatorMs = GBA_FRAME_DURATION_MS;
    let lastAnimationFrameAt = performance.now();
    let sampleDroppedFrames = 0;
    let sampleEmulatedFrames = 0;
    let sampleEmulationMs = 0;
    let samplePresentationFrames = 0;
    let sampleStartedAt = performance.now();
    const render = (animationFrameAt) => {
      if (!active) return;
      const elapsedSinceAnimationFrame = Math.min(250, Math.max(0, animationFrameAt - lastAnimationFrameAt));
      lastAnimationFrameAt = animationFrameAt;
      const plan = planEmulationFrames({ accumulatorMs, elapsedMs: elapsedSinceAnimationFrame });
      accumulatorMs = plan.accumulatorMs;
      sampleDroppedFrames += plan.droppedFrames;
      const manualKeys = keyboardInput.sample(plan.framesToRun) | gamepadKeys();
      const inputMasks = inputMasksForEmulatedFrames({
        framesToRun: plan.framesToRun,
        manualKeys,
        replayDriver
      });

      for (let frame = 0; frame < plan.framesToRun; frame += 1) {
        module._gba_set_keys(inputMasks[frame]);
        const emulationStartedAt = performance.now();
        module._gba_run_frame();
        presentedRuntimeState = readRuntimeTelemetry(module);
        queueNativeAudio();
        sampleEmulationMs += performance.now() - emulationStartedAt;
        sampleEmulatedFrames += 1;
      }

      if (plan.framesToRun > 0) {
        const source = module.HEAPU8.subarray(module._gba_framebuffer(), module._gba_framebuffer() + FRAME_BYTES);
        image.data.set(source);
        for (let offset = 3; offset < FRAME_BYTES; offset += 4) image.data[offset] = 255;
        context.putImageData(image, 0, 0);
        samplePresentationFrames += 1;
      }

      const now = performance.now();
      if (now - sampleStartedAt >= 500) {
        const elapsed = Math.max(1, now - sampleStartedAt);
        const cadence = measureFrameCadence({
          droppedFrames: sampleDroppedFrames,
          elapsedMs: elapsed,
          emulatedFrames: sampleEmulatedFrames,
          presentationFrames: samplePresentationFrames,
          totalEmulationMs: sampleEmulationMs
        });
        const nativeTelemetry = readRuntimeTelemetry(module);
        onFrameStats?.({
          ...cadence,
          romBytes: rom.length,
          runtimeState: nativeTelemetry,
          hardware: nativeTelemetry?.hardware ?? null
        });
        sampleDroppedFrames = 0;
        sampleEmulatedFrames = 0;
        sampleEmulationMs = 0;
        samplePresentationFrames = 0;
        sampleStartedAt = now;
      }
      frameHandle = requestAnimationFrame(render);
    };
    frameHandle = requestAnimationFrame(render);

    const save = () => {
      if (!active) return false;
      const size = module._gba_state_size();
      if (!size) return false;
      const pointer = module._malloc(size);
      try {
        const saved = module._gba_save_state(pointer, size) === 1;
        if (saved) localStorage.setItem(storageKey, bytesToBase64(module.HEAPU8.slice(pointer, pointer + size)));
        return saved;
      } finally {
        module._free(pointer);
      }
    };
    const load = () => {
      if (!active) return false;
      const encoded = localStorage.getItem(storageKey);
      if (!encoded) return false;
      const state = base64ToBytes(encoded);
      const pointer = module._malloc(state.length);
      try {
        module.HEAPU8.set(state, pointer);
        const loaded = module._gba_load_state(pointer, state.length) === 1;
        if (loaded) clearQueuedAudio();
        return loaded;
      } finally {
        module._free(pointer);
      }
    };
    const inspectSaveData = () => {
      return inspectSavedataBytes(copyModuleSavedata(module));
    };
    const restartAndLoad = () => {
      if (!active) return false;
      const savedata = copyModuleSavedata(module);
      if (savedata.length === 0) return false;
      module._gba_reset();
      clearQueuedAudio();
      if (!load()) return false;
      return restoreModuleSavedata(module, savedata);
    };

    return Object.freeze({
      canvas,
      inspectRuntime: () => Object.freeze({
        address: typeof module._gba_find_runtime_telemetry === "function"
          ? module._gba_find_runtime_telemetry()
          : 0,
        state: readRuntimeTelemetry(module)
      }),
      inspectInput: () => Object.freeze({
        manualKeys: keyboardInput.sample(0),
        replayActive: Boolean(replayDriver && !replayDriver.complete)
      }),
      inspectPresentedRuntime: () => Object.freeze({ state: presentedRuntimeState }),
      inspectFrame: () => Object.freeze({
        ...analyzeRgbaFrame(image.data, WIDTH, HEIGHT),
        framebufferBytes: module._gba_framebuffer_size(),
        expectedRgbaBytes: FRAME_BYTES
      }),
      inspectAudio: () => Object.freeze({
        state: audioContext?.state ?? (AudioContext ? "suspended" : "unavailable"),
        sampleRate: audioSampleRate,
        emittedAudioFrames,
        emittedNonSilentSamples,
        peak: emittedAudioPeak,
        audioResynchronizationCount,
        audioUnderrunCount,
        queuedAudioSeconds: audioContext ? Math.max(0, nextAudioTime - audioContext.currentTime) : 0,
        maxQueuedAudioSeconds,
        pendingAudioBuffers: queuedAudioSources.size,
        registers: inspectAudioRegisters()
      }),
      inspectReplay: () => replayDriver?.inspect?.()
        ?? Object.freeze({ complete: true, consumedFrames: 0, totalFrames: 0 }),
      inspectSaveData,
      restartAndLoad,
      reset: () => {
        if (active) {
          module._gba_reset();
          clearQueuedAudio();
        }
      },
      save,
      load,
      destroy
    });
  } catch (error) {
    destroy();
    throw error;
  }
}
