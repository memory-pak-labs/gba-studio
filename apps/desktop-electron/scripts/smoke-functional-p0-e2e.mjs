#!/usr/bin/env node
import { existsSync } from "node:fs";
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  cdpSession,
  createElectronSmokeEnv,
  electronExecutablePath,
  renderedText,
  terminateChild,
  wait
} from "./lib/electron-smoke-helpers.mjs";
import { resolveP0Source } from "./p0-source-catalog.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const technicalP0Source = resolveP0Source(appRoot, "technicalFixture");
const sourceProjectPath = technicalP0Source.projectPath;
if (!process.argv.includes("--allow-technical-fixture")) {
  throw new Error(
    "Este smoke usa apenas a fixture técnica electron-p0-playtest.gba-project. "
    + "Para aceite P0, use npm run smoke:p0 ou npm run smoke:p0:scenes. "
    + "Para diagnóstico explícito, acrescente --allow-technical-fixture."
  );
}
const evidenceRoot = path.join(appRoot, "artifacts", "functional-playtest", "latest");
const evidencePath = path.join(evidenceRoot, "functional_playtest_evidence.json");
const port = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9394);
const visualCdpPort = Number(process.env.GBA_STUDIO_PREVIEW_VISUAL_CDP_PORT ?? 9396);
const visualPort = Number(process.env.GBA_STUDIO_PREVIEW_VISUAL_PORT ?? 9395);
const keepTemp = process.env.GBA_STUDIO_KEEP_SMOKE_TEMP === "1";
const editedDialogueText = "DADOS EDITADOS PELA UI P0.";
const transitionProbeStyle = process.env.GBA_STUDIO_P0_TRANSITION_STYLE?.trim() || null;
const transitionProbeStyles = new Set(["fade", "fade-color", "wipe", "mosaic"]);

if (transitionProbeStyle && !transitionProbeStyles.has(transitionProbeStyle)) {
  throw new Error(`Estilo de transição P0 inválido: ${transitionProbeStyle}. Use fade, fade-color, wipe ou mosaic.`);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function arrayField(project, key) {
  return Array.isArray(project?.[key]) ? project[key] : [];
}

function roomByName(project, name) {
  return arrayField(project, "scenas").find((room) => room?.name === name)
    ?? arrayField(project, "rooms").find((room) => room?.name === name)
    ?? null;
}

function expandCompactResource(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== "object") return [];
  if (value.encoding === "rle-v1" && Array.isArray(value.runs)) {
    return value.runs.flatMap(([entry, count]) => Array.from({ length: Number(count) || 0 }, () => entry));
  }
  if (value.encoding === "metatile-v1" && Array.isArray(value.dictionary) && Array.isArray(value.indices)) {
    const width = Number(value.width) || 0;
    const height = Number(value.height) || 0;
    const blockWidth = Number(value.blockWidth) || 1;
    const blockHeight = Number(value.blockHeight) || 1;
    const output = Array.from({ length: Math.max(0, width * height) }, () => 0);
    value.indices.forEach((dictionaryIndex, blockIndex) => {
      const block = Array.isArray(value.dictionary[dictionaryIndex]) ? value.dictionary[dictionaryIndex] : [];
      const blockX = (blockIndex % Math.ceil(width / blockWidth)) * blockWidth;
      const blockY = Math.floor(blockIndex / Math.ceil(width / blockWidth)) * blockHeight;
      for (let localY = 0; localY < blockHeight; localY += 1) {
        for (let localX = 0; localX < blockWidth; localX += 1) {
          const x = blockX + localX;
          const y = blockY + localY;
          if (x >= width || y >= height) continue;
          output[y * width + x] = block[localY * blockWidth + localX] ?? 0;
        }
      }
    });
    return output;
  }
  return [];
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.exception?.value
      ?? result.exceptionDetails.text
      ?? "Falha ao avaliar o renderer.";
    throw new Error(`${detail}\nExpression:\n${expression}`);
  }
  return result.result?.value;
}

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForTargets(timeoutMs = 20_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    try {
      lastTargets = await fetchTargets();
      const page = lastTargets.find((target) => target.type === "page" && target.webSocketDebuggerUrl);
      if (page) return lastTargets;
    } catch {
      // Electron ainda pode estar subindo.
    }
    await wait(250);
  }
  throw new Error(`Endpoint DevTools indisponível. Alvos: ${JSON.stringify(lastTargets)}`);
}

async function waitForText(cdp, predicate, description, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await renderedText(cdp);
    if (predicate(lastText)) return lastText;
    await wait(250);
  }
  throw new Error(`Estado não alcançado: ${description}.\n${lastText.slice(0, 8_000)}`);
}

async function clickAria(cdp, ariaLabel) {
  const result = await evaluate(cdp, `
    (() => {
      const button = document.querySelector(${JSON.stringify(`button[aria-label="${ariaLabel}"]`)});
      if (!button) return { ok: false, reason: "missing" };
      if (button.disabled) return { ok: false, reason: "disabled" };
      button.click();
      return { ok: true };
    })()
  `);
  assert(result?.ok, `Botão ${ariaLabel} indisponível: ${JSON.stringify(result)}`);
}

async function clickText(cdp, text, selector = "button") {
  const result = await evaluate(cdp, `
    (() => {
      const root = document.querySelector(${JSON.stringify(selector)}) ?? document;
      const nodes = Array.from(root.querySelectorAll("button"));
      const node = nodes.find((item) => {
        const value = item.textContent?.trim() ?? "";
        return value === ${JSON.stringify(text)} || value.endsWith(${JSON.stringify(text)});
      });
      if (!node) return { ok: false, available: nodes.map((item) => item.textContent?.trim()).filter(Boolean) };
      if (node.disabled) return { ok: false, reason: "disabled" };
      node.click();
      return { ok: true };
    })()
  `);
  assert(result?.ok, `Texto ${text} indisponível em ${selector}: ${JSON.stringify(result)}`);
}

async function clickWorkspace(cdp, label, expectedText = []) {
  const result = await evaluate(cdp, `
    (() => {
      const button = document.querySelector(${JSON.stringify(`.workspace-list .workspace[aria-label="Workspace ${label}"]`)});
      if (!button) return { ok: false, reason: "missing" };
      if (button.disabled) return { ok: false, reason: "disabled" };
      button.click();
      return { ok: true };
    })()
  `);
  assert(result?.ok, `Workspace ${label} indisponível: ${JSON.stringify(result)}`);
  await waitForText(
    cdp,
    (text) => expectedText.every((item) => text.includes(item)),
    `workspace ${label}`
  );
}

async function dispatchPointerPress(cdp, selector, description) {
  const result = await evaluate(cdp, `
    (() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!element) return { ok: false, reason: "missing" };
      const bounds = element.getBoundingClientRect();
      const eventInit = {
        bubbles: true,
        cancelable: true,
        clientX: bounds.left + bounds.width / 2,
        clientY: bounds.top + bounds.height / 2,
        pointerId: 1,
        pointerType: "mouse"
      };
      element.dispatchEvent(new PointerEvent("pointerdown", { ...eventInit, buttons: 1 }));
      element.dispatchEvent(new PointerEvent("pointerup", { ...eventInit, buttons: 0 }));
      element.click();
      return { ok: true };
    })()
  `);
  assert(result?.ok, `Não foi possível executar ${description}: ${JSON.stringify(result)}`);
}

async function focusScene(cdp, sceneName) {
  await clickAria(cdp, `Editar cena ${sceneName}`);
  await waitForText(cdp, (text) => text.includes("Voltar à visão geral"), `foco na cena ${sceneName}`);
}

async function editTilemapAndCollision(cdp) {
  await clickAria(cdp, "Pintura - Tiles");
  const tileEdit = await evaluate(cdp, `
    (() => {
      const cells = Array.from(document.querySelectorAll(".room-stage-card-canvas button"));
      const candidate = cells.find((item) => {
        const label = item.getAttribute("aria-label") ?? "";
        const match = label.match(/^Pintar tile (-?\\d+)/);
        return match && Number(match[1]) !== 1;
      });
      return { ok: Boolean(candidate), selector: candidate ? ".room-stage-card-canvas button" : null, before: candidate?.getAttribute("aria-label") ?? null };
    })()
  `);
  assert(tileEdit?.ok, `Nenhuma célula disponível para editar o tilemap: ${JSON.stringify(tileEdit)}`);
  await dispatchPointerPress(
    cdp,
    `.room-stage-card-canvas button[aria-label="${tileEdit.before}"]`,
    "pintura de tile"
  );

  await clickAria(cdp, "Colisao - Solidos");
  const collisionEdit = await evaluate(cdp, `
    (() => {
      const cells = Array.from(document.querySelectorAll(".room-stage-card-canvas button"));
      const candidate = cells.find((item) => {
        const label = item.getAttribute("aria-label") ?? "";
        return label.startsWith("Pintar colisão ") && !item.classList.contains("has-collision");
      });
      return { ok: Boolean(candidate), ariaLabel: candidate?.getAttribute("aria-label") ?? null };
    })()
  `);
  assert(collisionEdit?.ok, `Nenhuma célula livre para editar colisão: ${JSON.stringify(collisionEdit)}`);
  await dispatchPointerPress(
    cdp,
    `.room-stage-card-canvas button[aria-label="${collisionEdit.ariaLabel}"]`,
    "pintura de colisão"
  );
  await wait(300);

  const result = await evaluate(cdp, `
    (() => ({
      tileCells: Array.from(document.querySelectorAll('.room-stage-card-canvas button')).length,
      collisionCells: Array.from(document.querySelectorAll('.room-stage-card-canvas button.has-collision')).length,
      activeTool: document.querySelector('.room-tool-button.active')?.getAttribute('aria-label') ?? null
    }))()
  `);
  assert(Number(result?.tileCells) > 0, "O canvas não expôs células de tile após a edição.");
  assert(Number(result?.collisionCells) > 0, "A UI não refletiu uma célula com colisão após a edição.");
  return result;
}

async function inspectNpcAndTriggerInEditor(cdp) {
  await clickAria(cdp, "Ator - OBJ");
  await waitForText(cdp, (text) => text.includes("Guide"), "NPC Guide no editor de atores");
  const actorState = await evaluate(cdp, `
    (() => {
      const editor = document.querySelector('.room-entities-editor[aria-label^="Atores e triggers"]');
      const text = editor?.textContent ?? document.body?.innerText ?? '';
      return {
        guide: text.includes('Guide'),
        player: text.includes('Player'),
        editorText: text.trim().slice(0, 800)
      };
    })()
  `);
  assert(actorState?.guide && actorState?.player, `Editor não expôs Player e Guide: ${JSON.stringify(actorState)}`);

  await clickAria(cdp, "Trigger - Eventos");
  await waitForText(cdp, (text) => text.includes("Door to room 2") && text.includes("door_to_room_2"), "trigger e evento no editor");
  return actorState;
}

async function fillDialogueText(cdp, value) {
  const result = await evaluate(cdp, `
    (() => {
      const row = Array.from(document.querySelectorAll('.dialogue-row'))
        .find((item) => item.querySelector('strong')?.textContent?.trim() === 'intro_001');
      row?.click();
      const label = Array.from(document.querySelectorAll('label'))
        .find((item) => item.textContent?.includes('Texto'));
      const textarea = label?.querySelector('textarea');
      if (!textarea) return { ok: false, reason: 'textarea-missing' };
      const descriptor = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value');
      textarea.focus();
      descriptor?.set?.call(textarea, ${JSON.stringify(value)});
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      textarea.dispatchEvent(new Event('change', { bubbles: true }));
      return { ok: true, value: textarea.value };
    })()
  `);
  assert(result?.ok, `Diálogo intro_001 não expôs a área Texto: ${JSON.stringify(result)}`);
  const persistedValue = await evaluate(cdp, `
    new Promise((resolve) => {
      const started = Date.now();
      const read = () => {
        const label = Array.from(document.querySelectorAll('label'))
          .find((item) => item.textContent?.includes('Texto'));
        const current = label?.querySelector('textarea')?.value ?? '';
        if (current === ${JSON.stringify(value)} || Date.now() - started > 10_000) {
          resolve(current);
          return;
        }
        setTimeout(read, 100);
      };
      read();
    })
  `, true);
  assert(persistedValue === value, `Texto de diálogo não refletiu a edição: ${JSON.stringify(persistedValue)}`);
  return persistedValue;
}

async function saveProject(cdp, projectPath) {
  const result = await evaluate(cdp, `
    (() => {
      const button = document.querySelector('button[aria-label="Salvar projeto"]');
      if (!button) return { ok: false, reason: 'missing' };
      if (button.disabled) return { ok: false, reason: 'disabled' };
      button.click();
      return { ok: true };
    })()
  `);
  assert(result?.ok, `Salvar projeto não ficou disponível: ${JSON.stringify(result)}`);
  await waitForText(cdp, (text) => text.includes("Salvo"), "projeto salvo pela interface", 20_000);
  assert(existsSync(projectPath), `O arquivo salvo pela interface não existe: ${projectPath}`);
}

async function startElectron(projectPath, userDataPath, exportRoot) {
  const executable = electronExecutablePath({ appRoot, usePackagedApp: false });
  assert(existsSync(executable), `Electron não encontrado: ${executable}`);
  const child = spawn(executable, [appRoot], {
    cwd: appRoot,
    env: createElectronSmokeEnv({
      ELECTRON_DISABLE_SECURITY_WARNINGS: "1",
      GBA_STUDIO_OPEN_PROJECT: projectPath,
      GBA_STUDIO_SMOKE_CDP_PORT: String(port),
      GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT: exportRoot,
      GBA_STUDIO_SMOKE_USER_DATA_DIR: userDataPath
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  const targets = await waitForTargets();
  const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
  assert(target?.webSocketDebuggerUrl, `Electron iniciou sem alvo de página: ${JSON.stringify(targets)}`);
  const cdp = cdpSession(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");
  await cdp.send("Runtime.enable");
  return { child, cdp, diagnostics: () => ({ stdout, stderr }) };
}

async function stopElectron(session) {
  session?.cdp?.close();
  if (session?.child) await terminateChild(session.child);
}

async function waitForPlayTarget(timeoutMs = 300_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    lastTargets = await fetchTargets();
    const target = lastTargets.find((item) => item.type === "page"
      && item.webSocketDebuggerUrl
      && String(item.url).includes("/player/runtime.html"));
    if (target) return target;
    await wait(250);
  }
  throw new Error(`Play Window não abriu. Alvos: ${JSON.stringify(lastTargets)}`);
}

async function closeTarget(targetID) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browserCdp = cdpSession(version.webSocketDebuggerUrl);
  await browserCdp.ready;
  try {
    await browserCdp.send("Target.closeTarget", { targetId: targetID });
  } finally {
    browserCdp.close();
  }
}

async function pressPlayerButton(cdp, code, key, windowsVirtualKeyCode, holdMs = 120) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    code,
    key,
    text: key.length === 1 ? key : undefined,
    unmodifiedText: key.length === 1 ? key : undefined,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    autoRepeat: false,
    isKeypad: false,
    isSystemKey: false
  });
  const input = await evaluate(cdp, "window.GBAStudioDirectPlayer?.canvas?.dataset.input ?? null");
  assert(input === "keyboard-down", `Play Window não recebeu ${code}: ${String(input)}`);
  await wait(holdMs);
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    code,
    key,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
    autoRepeat: false,
    isKeypad: false,
    isSystemKey: false
  });
  await wait(180);
}

function expectedRuntimeActorCount(project, targetRoomIndex) {
  const rooms = arrayField(project, "scenas").length > 0
    ? arrayField(project, "scenas")
    : arrayField(project, "rooms");
  const targetRoom = rooms[targetRoomIndex] ?? {};
  const targetRoomName = typeof targetRoom?.name === "string" ? targetRoom.name : null;
  if (!targetRoomName) return 0;
  const playerName = typeof targetRoom?.playerActorName === "string" && targetRoom.playerActorName.trim()
    ? targetRoom.playerActorName.trim()
    : "Player";
  return arrayField(project, "actors").filter((actor) => {
    if (!actor || actor.name === playerName || actor.name === "Player") return false;
    const actorRoomName = typeof actor.roomName === "string" ? actor.roomName : null;
    return actorRoomName === targetRoomName;
  }).length;
}

async function sampleTransitionBoundary(cdp, targetRoom, style, expectedActorCount) {
  return evaluate(cdp, `
    new Promise((resolve) => {
      const samples = [];
      const started = Date.now();
      let baselineRoomChangeCount = null;
      let boundaryFrame = null;
      const collect = () => {
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const state = player?.inspectRuntime?.()?.state ?? null;
        const roomChangeCount = Number(state?.roomChangeCount ?? 0);
        const runtimeFrame = Number(state?.frame ?? 0);
        baselineRoomChangeCount ??= roomChangeCount;
        const sample = {
          frame: runtimeFrame,
          room: Number(state?.currentRoom ?? -1),
          roomChangeCount,
          actorCount: Number(state?.actorCount ?? 0),
          firstActorVisible: state?.firstActor?.visible === true,
          meaningful: frame?.meaningful === true,
          nonBlackRatio: Number(frame?.nonBlackRatio ?? 0),
          uniqueColorCount: Number(frame?.uniqueColorCount ?? 0),
          signature: frame?.signature ?? null,
          timing: {
            missedFrameCount: Number(state?.timing?.missedFrameCount ?? 0),
            renderSkipCount: Number(state?.timing?.renderSkipCount ?? 0),
            vblankWaitTicks: Number(state?.timing?.vblankWaitTicks ?? 0)
          }
        };
        samples.push(sample);
        if (roomChangeCount > baselineRoomChangeCount || Number(state?.currentRoom) === ${JSON.stringify(targetRoom)}) {
          boundaryFrame ??= runtimeFrame;
        }
        const targetSamples = samples.filter((item) => item.room === ${JSON.stringify(targetRoom)});
        const settledSamples = boundaryFrame === null
          ? []
          : targetSamples.filter((item) => item.frame >= boundaryFrame + 8);
        if (settledSamples.length >= 8) {
          resolve({
            ok: true,
            style: ${JSON.stringify(style)},
            targetRoom: ${JSON.stringify(targetRoom)},
            expectedActorCount: ${JSON.stringify(expectedActorCount)},
            boundaryFrame,
            samples,
            settledSamples,
            final: settledSamples[settledSamples.length - 1]
          });
          return;
        }
        if (Date.now() - started > 15_000) {
          resolve({
            ok: false,
            style: ${JSON.stringify(style)},
            targetRoom: ${JSON.stringify(targetRoom)},
            expectedActorCount: ${JSON.stringify(expectedActorCount)},
            boundaryFrame,
            samples,
            settledSamples,
            reason: "janela de transição não estabilizou"
          });
          return;
        }
        requestAnimationFrame(collect);
      };
      requestAnimationFrame(collect);
    })
  `, true);
}

function assertTransitionProbe(probe) {
  assert(probe?.ok, `Probe temporal da transição não estabilizou: ${JSON.stringify(probe)}`);
  assert(Number(probe.final?.room) === Number(probe.targetRoom), `Probe terminou na sala errada: ${JSON.stringify(probe)}`);
  const expectedActorCount = Number(probe.expectedActorCount ?? 0);
  assert(
    Number(probe.final?.actorCount) === expectedActorCount,
    `Probe terminou com quantidade de atores divergente: esperado ${expectedActorCount}, recebido ${JSON.stringify(probe.final)}`
  );
  assert(
    probe.settledSamples.every((sample) => sample.actorCount === expectedActorCount),
    `Probe detectou oscilação de atores após a revelação: ${JSON.stringify(probe.settledSamples)}`
  );
  assert(probe.settledSamples.every((sample) => sample.meaningful && sample.uniqueColorCount >= 3), `Probe detectou framebuffer inválido após a revelação: ${JSON.stringify(probe.settledSamples)}`);
  const timingStart = probe.settledSamples[0]?.timing ?? {};
  const timingEnd = probe.final?.timing ?? {};
  assert(Number(timingEnd.missedFrameCount) >= Number(timingStart.missedFrameCount), `Telemetria temporal regrediu durante a transição: ${JSON.stringify(probe)}`);
  return {
    ...probe,
    invalidSettledFrames: probe.settledSamples.filter((sample) => !sample.meaningful || sample.actorCount !== expectedActorCount).length,
    missedFramesDuringSettledWindow: Number(timingEnd.missedFrameCount) - Number(timingStart.missedFrameCount),
    renderSkipsDuringSettledWindow: Number(timingEnd.renderSkipCount) - Number(timingStart.renderSkipCount)
  };
}

async function exerciseRom(cdp, transitionStyle = null, expectedActorCount = 0) {
  const ready = await evaluate(cdp, `
    new Promise((resolve) => {
      const started = Date.now();
      const check = () => {
        const player = window.GBAStudioDirectPlayer;
        const frame = player?.inspectFrame?.() ?? null;
        const state = player?.inspectRuntime?.()?.state ?? null;
        const audio = player?.inspectAudio?.() ?? null;
        if (frame?.meaningful && Number(state?.frame) >= 8
          && Number(audio?.emittedAudioFrames) > 0) {
          resolve({ ok: true, frame, state, audio });
          return;
        }
        if (Date.now() - started > 30_000) {
          resolve({ ok: false, frame, state, audio, directError: window.GBAStudioDirectPlayerError ?? null });
          return;
        }
        setTimeout(check, 100);
      };
      check();
    })
  `, true);
  assert(ready?.ok, `ROM não produziu framebuffer/runtime/áudio: ${JSON.stringify(ready)}`);
  assert(Number(ready.state?.currentRoom) === 0, `ROM iniciou na sala errada: ${JSON.stringify(ready.state)}`);
  assert(Number(ready.state?.actorCount) >= 1, `ROM não expôs atores no runtime: ${JSON.stringify(ready.state)}`);
  assert(
    Number(ready.audio?.emittedNonSilentSamples) > 0,
    `ROM iniciou sem amostras de áudio audíveis: ${JSON.stringify({ state: ready.state, audio: ready.audio })}`
  );

  const initial = ready.state;
  const initialAudio = ready.audio;
  for (let index = 0; index < 4; index += 1) {
    await pressPlayerButton(cdp, "KeyX", "x", 88, 90);
  }

  const audioAfterDialogue = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectAudio?.() ?? null");
  assert(Number(audioAfterDialogue?.emittedAudioFrames) > Number(initialAudio?.emittedAudioFrames), "O áudio não continuou sendo emitido após a interação do diálogo.");

  let current = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
  let moved = false;
  const transitionProbePromise = transitionStyle
    ? sampleTransitionBoundary(cdp, 1, transitionStyle, expectedActorCount)
    : null;
  for (let index = 0; index < 24; index += 1) {
    const before = current;
    await pressPlayerButton(cdp, "ArrowRight", "ArrowRight", 39, 120);
    current = await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null");
    moved ||= Number(current?.player?.x) !== Number(before?.player?.x)
      || Number(current?.player?.y) !== Number(before?.player?.y);
    if (Number(current?.currentRoom) === 1 && Number(current?.roomChangeCount) >= 1) break;
  }
  assert(moved, `ROM não respondeu ao movimento do jogador: ${JSON.stringify({ initial, current })}`);
  assert(Number(current?.currentRoom) === 1, `Trigger não trocou para room_2: ${JSON.stringify(current)}`);
  assert(Number(current?.roomChangeCount) >= 1, `Troca de sala não foi registrada: ${JSON.stringify(current)}`);
  assert(Number(current?.triggerEnterCount) >= 1, `Entrada no trigger não foi registrada: ${JSON.stringify(current)}`);
  assert(Number(current?.frame) > Number(initial?.frame), "O runtime não avançou após o fluxo de input.");
  const transitionProbe = transitionProbePromise
    ? assertTransitionProbe(await transitionProbePromise)
    : null;

  return {
    initial,
    final: current,
    transitionProbe,
    frame: await evaluate(cdp, "window.GBAStudioDirectPlayer?.inspectFrame?.() ?? null"),
    audio: audioAfterDialogue,
    audioPlayback: {
      emittedAudioFrames: Number(audioAfterDialogue?.emittedAudioFrames ?? 0),
      emittedNonSilentSamples: Number(audioAfterDialogue?.emittedNonSilentSamples ?? 0),
      playbackState: await evaluate(cdp, "window.GBAStudioDirectPlayer?.canvas?.dataset.audio ?? null")
    }
  };
}

async function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? appRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: "inherit"
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} saiu com código ${code ?? "desconhecido"}.`));
    });
  });
}

async function findRom(root, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const files = [];
    const visit = async (directory) => {
      let entries = [];
      try {
        entries = await readdir(directory, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) await visit(target);
        else if (entry.name.endsWith(".gba")) files.push(target);
      }
    };
    await visit(root);
    if (files.length > 1) throw new Error(`Mais de uma ROM foi gerada: ${files.join(", ")}`);
    if (files.length === 1) return files[0];
    await wait(250);
  }
  throw new Error(`Nenhuma ROM foi materializada em ${root}.`);
}

async function readProject(projectPath) {
  return JSON.parse(await readFile(projectPath, "utf8"));
}

function configureTransitionProbe(project, style) {
  if (!style) return project;
  const editorState = project.editorState && typeof project.editorState === "object"
    ? project.editorState
    : {};
  const connections = Array.isArray(editorState.scenaConnections)
    ? editorState.scenaConnections
    : [];
  const connection = connections[0];
  assert(connection && typeof connection === "object", "A fixture P0 não possui conexão para o probe temporal.");
  connection.transition = {
    style,
    durationFrames: 8,
    fadeOut: true,
    fadeIn: true
  };
  project.editorState = editorState;
  return project;
}

async function main() {
  assert(
    technicalP0Source.role === "technical-contract-fixture"
      && technicalP0Source.excludedFromCanonicalAcceptance === true,
    `A fonte do smoke funcional precisa ser explicitamente técnica: ${JSON.stringify(technicalP0Source)}`
  );
  assert(existsSync(sourceProjectPath), `Fixture técnica P0 ausente: ${sourceProjectPath}`);
  await mkdir(evidenceRoot, { recursive: true });
  const tempRoot = await mkdtemp(path.join(os.tmpdir(), "gbastudio-functional-p0-") );
  const tempProjectRoot = path.join(tempRoot, "project");
  const projectPath = path.join(tempProjectRoot, "electron-p0-playtest.gba-project");
  const exportRoot = path.join(tempRoot, "engine-export");
  let mainSession = null;
  let playerCdp = null;
  let playerTarget = null;
  let romPath = null;

  try {
    await mkdir(tempProjectRoot, { recursive: true });
    await cp(technicalP0Source.assetsRoot, path.join(tempProjectRoot, "Assets"), { recursive: true });
    const smokeProject = configureTransitionProbe(
      JSON.parse(await readFile(sourceProjectPath, "utf8")),
      transitionProbeStyle
    );
    await writeFile(projectPath, `${JSON.stringify(smokeProject, null, 2)}\n`, "utf8");
    const initialProject = await readProject(projectPath);

    mainSession = await startElectron(projectPath, path.join(tempRoot, "user-data-editor"), exportRoot);
    await waitForText(mainSession.cdp, (text) => text.includes("Electron Technical P0 Fixture") && text.includes("2 cenas"), "fixture técnica P0 aberta no Editor");
    await focusScene(mainSession.cdp, "cena_1");
    const editorTilemap = await editTilemapAndCollision(mainSession.cdp);
    const editorActors = await inspectNpcAndTriggerInEditor(mainSession.cdp);
    await clickWorkspace(mainSession.cdp, "Diálogos", ["intro_001", "2 escolhas"]);
    const dialogueValue = await fillDialogueText(mainSession.cdp, editedDialogueText);
    await clickWorkspace(mainSession.cdp, "Áudio", ["intro_theme.mod", "confirm.wav"]);
    await clickWorkspace(mainSession.cdp, "Sprites", ["player_topdown_4dir.png", "Animações"]);
    await saveProject(mainSession.cdp, projectPath);
    await stopElectron(mainSession);
    mainSession = null;

    const savedProject = await readProject(projectPath);
    const savedRoom = roomByName(savedProject, "cena_1");
    const initialRoom = roomByName(initialProject, "cena_1");
    const savedActors = arrayField(savedProject, "actors");
    const savedTriggers = arrayField(savedProject, "triggers");
    const savedDialogues = arrayField(savedProject, "dialogues");
    const savedEvents = arrayField(savedProject, "events");
    const savedAudio = arrayField(savedProject, "audioItems");
    const expectedTargetActorCount = expectedRuntimeActorCount(savedProject, 1);
    const introDialogue = savedDialogues.find((dialogue) => dialogue?.key === "intro_001");
    const initialTilemap = expandCompactResource(initialRoom?.tilemap);
    const savedTilemap = expandCompactResource(savedRoom?.tilemap);
    const initialCollisionTypes = expandCompactResource(initialRoom?.collisionTypes);
    const savedCollisionTypes = expandCompactResource(savedRoom?.collisionTypes);
    const initialCollisionCount = initialCollisionTypes.filter((value) => value !== "free").length;
    const savedCollisionCount = savedCollisionTypes.filter((value) => value !== "free").length;
    const tilemapChanged = JSON.stringify(savedTilemap) !== JSON.stringify(initialTilemap);
    assert(tilemapChanged, "A edição de tilemap feita pela UI não foi persistida.");
    assert(savedCollisionCount > initialCollisionCount, `A edição de colisão não foi persistida: ${initialCollisionCount} -> ${savedCollisionCount}`);
    assert(savedActors.some((actor) => actor?.name === "Player") && savedActors.some((actor) => actor?.name === "Guide"), "Player/NPC não persistidos.");
    assert(savedTriggers.some((trigger) => trigger?.name === "Door to room 2"), "Trigger não persistido.");
    assert(savedEvents.length === 5, `Eventos da fixture técnica divergentes após salvar: ${savedEvents.length}`);
    assert(savedDialogues.length === 2 && introDialogue?.text === editedDialogueText, "Diálogo editado/choices não persistido.");
    assert(Array.isArray(introDialogue?.choices) && introDialogue.choices.length === 2, "Escolhas do diálogo não persistidas.");
    assert(savedAudio.length === 2, `Áudio da fixture técnica divergente após salvar: ${savedAudio.length}`);

    mainSession = await startElectron(projectPath, path.join(tempRoot, "user-data-reopen"), exportRoot);
    await waitForText(mainSession.cdp, (text) => text.includes("Electron Technical P0 Fixture") && text.includes("2 cenas") && text.includes("Guide"), "fixture técnica salva reaberta no Editor");
    await clickWorkspace(mainSession.cdp, "Diálogos", ["intro_001", "2 escolhas"]);
    const reopenedDialogueValue = await evaluate(mainSession.cdp, `
      new Promise((resolve) => {
        const started = Date.now();
        const read = () => {
          const label = Array.from(document.querySelectorAll('label'))
            .find((item) => item.textContent?.includes('Texto'));
          const value = label?.querySelector('textarea')?.value ?? '';
          if (value === ${JSON.stringify(editedDialogueText)} || Date.now() - started > 10_000) {
            resolve(value);
            return;
          }
          setTimeout(read, 100);
        };
        read();
      })
    `, true);
    assert(reopenedDialogueValue === editedDialogueText, `Texto editado não foi reaberto: ${JSON.stringify(reopenedDialogueValue)}`);

    const runButtonState = await evaluate(mainSession.cdp, `
      new Promise((resolve) => {
        const started = Date.now();
        const check = () => {
          const button = document.querySelector('button[aria-label="Executar ROM"]');
          if (button && !button.disabled) {
            resolve({ ok: true, title: button.title });
            return;
          }
          if (Date.now() - started > 60_000) {
            resolve({ ok: false, title: button?.title ?? null, text: document.body?.innerText ?? '' });
            return;
          }
          setTimeout(check, 250);
        };
        check();
      })
    `, true);
    assert(runButtonState?.ok, `Executar ROM não ficou disponível após reabrir: ${JSON.stringify(runButtonState)}`);
    await clickAria(mainSession.cdp, "Executar ROM");
    await waitForText(mainSession.cdp, (text) => text.includes("Play Window aberto") || text.includes("Compilando ROM"), "compilação/abertura da ROM", 300_000);
    playerTarget = await waitForPlayTarget();
    playerCdp = cdpSession(playerTarget.webSocketDebuggerUrl);
    await playerCdp.ready;
    await playerCdp.send("Page.enable");
    await playerCdp.send("Runtime.enable");
    await playerCdp.send("Page.bringToFront");
    await playerCdp.send("Input.dispatchMouseEvent", {
      type: "mousePressed",
      x: 360,
      y: 240,
      button: "left",
      clickCount: 1
    });
    await playerCdp.send("Input.dispatchMouseEvent", {
      type: "mouseReleased",
      x: 360,
      y: 240,
      button: "left",
      clickCount: 1
    });
    await evaluate(playerCdp, `
      new Promise((resolve) => {
        const started = Date.now();
        const check = () => {
          if (window.GBAStudioDirectPlayer?.inspectAudio && document.querySelector('canvas.gba-studio-direct-canvas')) {
            resolve(true);
            return;
          }
          if (Date.now() - started > 30_000) {
            resolve(false);
            return;
          }
          setTimeout(check, 100);
        };
        check();
      })
    `, true);
    const romRuntime = await exerciseRom(playerCdp, transitionProbeStyle, expectedTargetActorCount);
    await closeTarget(playerTarget.id);
    playerCdp.close();
    playerCdp = null;
    playerTarget = null;

    romPath = await findRom(exportRoot);
    const enginePackPath = path.resolve(appRoot, "../../packages/GBAStudioEngine/dist/GBAStudioEnginePack");
    const smokeMgbaPath = path.join(enginePackPath, "tools", process.platform === "win32" ? "smoke_mgba.bat" : "smoke_mgba");
    assert(existsSync(smokeMgbaPath), `smoke_mgba ausente: ${smokeMgbaPath}`);
    await runCommand(smokeMgbaPath, ["--check-only", romPath], { cwd: path.resolve(appRoot, "../..") });

    await runCommand(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "smoke:technical-p0:preview"], {
      cwd: appRoot,
      env: {
        GBA_STUDIO_P0_PROJECT_PATH: projectPath,
        GBA_STUDIO_P0_SOURCE_ID: technicalP0Source.id,
        GBA_STUDIO_P0_ROM_SOURCE: romPath,
        GBA_STUDIO_PREVIEW_VISUAL_PORT: String(visualPort),
        GBA_STUDIO_PREVIEW_VISUAL_CDP_PORT: String(visualCdpPort)
      }
    });

    const previewEvidencePath = path.join(appRoot, "artifacts", "preview-playtest", "latest", "preview_playtest_evidence.json");
    const previewEvidence = JSON.parse(await readFile(previewEvidencePath, "utf8"));
    assert(previewEvidence.previewPlaytestVerified === true, `Preview técnico P0 não foi validado visualmente: ${JSON.stringify(previewEvidence)}`);

    const evidence = {
      ok: true,
      generatedAt: new Date().toISOString(),
      sourceProjectPath,
      source: {
        id: technicalP0Source.id,
        role: technicalP0Source.role,
        acceptanceSurfaces: technicalP0Source.acceptanceSurfaces,
        excludedFromCanonicalAcceptance: technicalP0Source.excludedFromCanonicalAcceptance
      },
      savedProjectPath: projectPath,
      romPath,
      project: {
        rooms: arrayField(savedProject, "scenas").length,
        tilemapEdited: tilemapChanged,
        collisionCellsBefore: initialCollisionCount,
        collisionCellsAfter: savedCollisionCount,
        actors: savedActors.length,
        triggers: savedTriggers.length,
        events: savedEvents.length,
        dialogues: savedDialogues.length,
        choices: introDialogue?.choices?.length ?? 0,
        audioItems: savedAudio.length
      },
      editorUiVerified: true,
      editor: { tilemap: editorTilemap, actors: editorActors, dialogueText: dialogueValue },
      saveReopenVerified: true,
      exportVerified: true,
      previewPlaytestVerified: true,
      previewEvidencePath,
      playWindowVerified: true,
      gameplayRomVerified: true,
      transitionProbeStyle,
      transitionProbeVerified: romRuntime.transitionProbe !== null,
      romBuildVerified: true,
      runtime: romRuntime,
      features: [
        "two-rooms",
        "tilemap",
        "collision",
        "player",
        "npc",
        "trigger",
        "event",
        "dialogue-choice",
        "animated-sprite",
        "music",
        "sfx",
        "room-transition",
        "save-reopen",
        "preview",
        "play-window",
        "rom"
      ]
    };
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    console.log(`Functional P0 E2E OK: ${evidencePath}`);
    if (keepTemp) console.log(`Arquivos temporários preservados: ${tempRoot}`);
  } finally {
    if (playerCdp) playerCdp.close();
    if (playerTarget) await closeTarget(playerTarget.id).catch(() => undefined);
    if (mainSession) await stopElectron(mainSession);
    if (!keepTemp) await rm(tempRoot, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
