// Capture the active opening beats and authored transition from a real ROM.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import createMGBA from "../static/WebPlayer/player/mgba-core.mjs";
import { readRuntimeTelemetry } from "../static/WebPlayer/player/mgba-direct-player.mjs";
import { decodePngRgba, encodePngRgba } from "./lib/png-icons.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const [romPath, evidenceDirectory] = process.argv.slice(2);
const skipRequested = process.argv.includes("--skip");
assert.ok(romPath && evidenceDirectory, "usage: node scripts/playtest-opening-v3-rom.mjs ROM.gba EVIDENCE_DIR");
mkdirSync(evidenceDirectory, { recursive: true });

const rom = readFileSync(romPath);
const wasm = readFileSync(path.join(appRoot, "static/WebPlayer/player/mgba-core.wasm"));
const projectRoot = path.join(appRoot, "default-assets/templates/exemplo-gba");
const project = JSON.parse(readFileSync(path.join(projectRoot, "exemplo-gba.gba-project"), "utf8"));
const openingScene = project.scenas.find((scene) => scene.name === "abertura");
assert.ok(openingScene, "a cena abertura precisa existir no Exemplo GBA atual");
const openingRoomIndex = project.scenas.findIndex((scene) => scene.name === "abertura");
const openingActors = project.actors.filter((actor) => actor.roomName === "abertura");
const openingSteps = openingScene.runtime?.config?.steps?.filter((step) => step.durationFrames > 0) ?? [];
assert.ok(openingSteps.length > 0, "a cena abertura precisa ter quadros com duração");
const spriteRoot = path.join(appRoot, "default-assets/templates/exemplo-gba/Assets/sprites");
const backgroundPath = path.join(projectRoot, "Assets", "backgrounds", openingScene.backgroundAssetName);
const background = decodePngRgba(readFileSync(backgroundPath));
assert.equal(background.width, 240);
assert.equal(background.height, 160);
const spriteImages = new Map();
function spriteImage(file) {
  if (!spriteImages.has(file)) {
    spriteImages.set(file, decodePngRgba(readFileSync(path.join(spriteRoot, file))));
  }
  return spriteImages.get(file);
}

const shotLabels = openingSteps.map((step, index) => {
  const label = step.id.replace(/^opening-v\d+-/, "").replace(/^\d+-/, "");
  return `${String(index + 1).padStart(2, "0")}-${label || `quadro-${index + 1}`}`;
});
const spritesByShot = Object.fromEntries(openingSteps.map((step, index) => [
  shotLabels[index],
  (step.actorMotions ?? []).flatMap((motion) => {
    const actor = openingActors[motion.actorIndex];
    const position = motion.toPosition;
    if (!actor || !position || !actor.spriteSheet) return [];
    const image = spriteImage(actor.spriteSheet);
    const intersectsViewport = position.x < 240 && position.y < 160
      && position.x + image.width > 0 && position.y + image.height > 0;
    return intersectsViewport ? [[actor.spriteSheet, position.x, position.y]] : [];
  })
]));
const spriteBoundsByShot = Object.fromEntries(Object.entries(spritesByShot).map(([label, sprites]) => [
  label,
  sprites.map(([file, left, top]) => {
    const { width, height } = spriteImage(file);
    return { left, top, width, height };
  })
]));
const core = await createMGBA({
  print: () => {},
  printErr: () => {},
  instantiateWasm(imports, receive) {
    const instance = new WebAssembly.Instance(new WebAssembly.Module(wasm), imports);
    receive(instance);
    return instance.exports;
  }
});

const audioTrace = [];
const audioNonSilentByFrame = [];
let previousSound1cntH = 0;
function advance(frames) {
  core._gba_set_keys(0);
  for (let frame = 0; frame < frames; frame += 1) {
    core._gba_run_frame();
    const telemetry = readRuntimeTelemetry(core);
    const audioFrameCount = core._gba_audio_sample_count();
    const audioSamples = new Int16Array(core.HEAPU8.buffer, core._gba_audio_samples(), audioFrameCount * 2);
    let nonSilentSamples = 0;
    for (const sample of audioSamples) if (sample !== 0) nonSilentSamples += 1;
    if (nonSilentSamples > 0) {
      audioNonSilentByFrame.push({
        frame: telemetry?.frame ?? -1,
        runtimeKind: telemetry?.runtimeKind ?? -1,
        nonSilentSamples
      });
    }
    const sound1cntH = core._gba_audio_register(0x04000062) >>> 0;
    if (sound1cntH !== previousSound1cntH) {
      audioTrace.push({ frame: telemetry?.frame ?? -1, runtimeKind: telemetry?.runtimeKind ?? -1, sound1cntH });
      previousSound1cntH = sound1cntH;
    }
  }
}

function auditVisibleSprites(label, framebuffer) {
  return (spritesByShot[label] ?? []).map(([file, originX, originY]) => {
    const source = spriteImage(file);
    let pixelCount = 0;
    let mismatchCount = 0;
    let maxChannelError = 0;
    for (let y = 0; y < source.height; y += 1) {
      for (let x = 0; x < source.width; x += 1) {
        const sourceOffset = (y * source.width + x) * 4;
        if (source.pixels[sourceOffset + 3] < 128) continue;
        const screenX = originX + x;
        const screenY = originY + y;
        if (screenX >= 240 || screenY >= 160) continue;
        const screenOffset = (screenY * 240 + screenX) * 4;
        const error = Math.max(...[0, 1, 2].map((channel) =>
          Math.abs(source.pixels[sourceOffset + channel] - framebuffer[screenOffset + channel])));
        pixelCount += 1;
        maxChannelError = Math.max(maxChannelError, error);
        if (error > 7) mismatchCount += 1; // RGB555 round-trip tolerance
      }
    }
    assert.ok(pixelCount > 0, `${file}: nenhum pixel opaco`);
    assert.equal(mismatchCount, 0, `${file}: pixels OBJ divergem da ROM`);
    return { file, pixelCount, mismatchCount, maxChannelError };
  });
}

function auditBackground(label, framebuffer) {
  if (!spritesByShot[label]) return null;
  let pixelCount = 0;
  let mismatchCount = 0;
  let maxChannelError = 0;
  for (let y = 0; y < 160; y += 1) {
    for (let x = 0; x < 240; x += 1) {
      if (spriteBoundsByShot[label].some(({ left, top, width, height }) =>
        x >= left && x < left + width && y >= top && y < top + height)) continue;
      const offset = (y * 240 + x) * 4;
      const error = Math.max(...[0, 1, 2].map((channel) =>
        Math.abs(background.pixels[offset + channel] - framebuffer[offset + channel])));
      pixelCount += 1;
      maxChannelError = Math.max(maxChannelError, error);
      if (error > 7) mismatchCount += 1;
    }
  }
  assert.equal(mismatchCount, 0, `${label}: pixels BG divergem da ROM`);
  return { pixelCount, mismatchCount, maxChannelError };
}

const samples = [];
function capture(label) {
  const telemetry = readRuntimeTelemetry(core);
  const pixels = Buffer.from(core.HEAPU8.slice(core._gba_framebuffer(), core._gba_framebuffer() + 240 * 160 * 4));
  for (let index = 3; index < pixels.length; index += 4) pixels[index] = 255;
  writeFileSync(path.join(evidenceDirectory, `${label}.png`), encodePngRgba({ width: 240, height: 160, pixels }));
  samples.push({
    label,
    frame: telemetry.frame,
    currentRoom: telemetry.currentRoom,
    runtimeKind: telemetry.runtimeKind,
    firstActor: telemetry.firstActor,
    lastSfx: telemetry.lastSfx,
    sound1cntH: core._gba_audio_register(0x04000062) >>> 0,
    sound1cntX: core._gba_audio_register(0x04000064) >>> 0,
    spriteFidelity: auditVisibleSprites(label, pixels),
    backgroundFidelity: auditBackground(label, pixels),
    framebufferSha256: createHash("sha256").update(pixels).digest("hex")
  });
  return telemetry;
}

try {
  assert.equal(core._gba_init(), 1);
  const pointer = core._malloc(rom.length);
  try {
    core.HEAPU8.set(rom, pointer);
    assert.equal(core._gba_load_rom(pointer, rom.length), 1);
  } finally {
    core._free(pointer);
  }

  let openingEntered = false;
  for (let frame = 0; frame < 600; frame += 1) {
    const telemetry = readRuntimeTelemetry(core);
    if (telemetry?.runtimeKind === 8 && telemetry.currentRoom === openingRoomIndex) {
      openingEntered = true;
      break;
    }
    advance(1);
  }
  assert.ok(openingEntered, "a ROM não entrou na cena abertura em até 600 frames");
  audioTrace.length = 0;
  audioNonSilentByFrame.length = 0;
  previousSound1cntH = core._gba_audio_register(0x04000062) >>> 0;

  if (skipRequested) {
    advance(60);
    assert.equal(capture("01-abertura-antes-de-pular").runtimeKind, 8);
    core._gba_set_keys(2); // B
    core._gba_run_frame();
    advance(30);
    assert.equal(capture("02-titulo-apos-pular").runtimeKind, 3, "B deve pular para o Menu Título");
  } else {
    const firstStep = openingSteps[0];
    let elapsedFrames = 0;
    let previousCaptureFrame = 0;
    const capturePlan = openingSteps.map((step, index) => {
      // Sample within each beat; a capture on the exact boundary can still
      // contain the previous actor pose while the runtime advances the step.
      const captureFrame = elapsedFrames + Math.max(1, Math.floor(step.durationFrames / 2));
      const framesToAdvance = captureFrame - previousCaptureFrame;
      elapsedFrames += step.durationFrames;
      previousCaptureFrame = captureFrame;
      return [framesToAdvance, shotLabels[index]];
    });
    for (const [frames, label] of capturePlan) {
      advance(frames);
      capture(label);
    }
    let titleEntered = false;
    for (let frame = 0; frame < 240; frame += 1) {
      if (readRuntimeTelemetry(core)?.runtimeKind === 3) {
        titleEntered = true;
        break;
      }
      advance(1);
    }
    assert.ok(titleEntered, "a abertura não chegou ao Menu Título em até 240 frames após o último quadro");
    advance(8);
    capture(`${String(openingSteps.length + 1).padStart(2, "0")}-titulo`);
    console.log(JSON.stringify({
      samples: samples.map(({ label, frame, currentRoom, runtimeKind, firstActor, sound1cntH }) =>
        ({ label, frame, currentRoom, runtimeKind, firstActor, sound1cntH })),
      audioTrace
    }));
    assert.ok(samples.slice(0, openingSteps.length).every((sample) => sample.runtimeKind === 8),
      "os quadros devem permanecer na cutscene");
    const firstActorPosition = firstStep.actorMotions?.find((motion) => motion.actorIndex === 0)?.toPosition;
    if (firstActorPosition) {
      assert.equal(samples[0].firstActor.x, firstActorPosition.x);
      assert.equal(samples[0].firstActor.y, firstActorPosition.y);
    }
    const signalStepIndex = openingSteps.findIndex((step) => step.eventName && project.events.some((event) =>
      event.name === step.eventName && event.steps?.some((eventStep) =>
        eventStep.isEnabled !== false && eventStep.command?.startsWith("play_sfx "))));
    if (signalStepIndex >= 0) {
      const previousFrame = samples[signalStepIndex - 1]?.frame ?? 0;
      const signalFrame = samples[signalStepIndex].frame;
      assert.ok(!audioNonSilentByFrame.some(({ frame, runtimeKind }) =>
        runtimeKind === 8 && frame <= previousFrame),
        "a abertura deve permanecer silenciosa antes do sinal");
      assert.ok(audioTrace.some(({ frame, sound1cntH }) =>
        frame > previousFrame && frame <= signalFrame && sound1cntH !== 0),
      "o evento da cena deve acionar o canal de áudio");
      assert.ok(audioNonSilentByFrame.some(({ frame }) => frame > previousFrame && frame <= signalFrame),
        "o sinal deve emitir amostras de áudio na ROM");
    }
    assert.equal(samples.at(-1).runtimeKind, 3, "a abertura deve terminar no Menu Título");
    assert.equal(new Set(samples.map((sample) => sample.framebufferSha256)).size, openingSteps.length + 1,
      "cada quadro e o título devem renderizar imagens distintas");
  }

  const evidence = {
    ok: true,
    path: skipRequested ? "skip" : "automatic",
    romSha256: createHash("sha256").update(rom).digest("hex"),
    wasmSha256: createHash("sha256").update(wasm).digest("hex"),
    audioTrace,
    audioNonSilentByFrame,
    samples
  };
  writeFileSync(path.join(evidenceDirectory, "playtest.json"), `${JSON.stringify(evidence, null, 2)}\n`);
  console.log(JSON.stringify({ ok: true, evidenceDirectory, samples: samples.length }));
} finally {
  core._gba_destroy();
}
