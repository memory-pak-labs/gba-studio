import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { auditCampaignReplayOutcome } from "./exemplo-campaign-replay-contract.mjs";
import {
  cdpSession,
  createElectronSmokeEnv,
  electronExecutablePath,
  renderedText,
  terminateChild,
  wait
} from "./lib/electron-smoke-helpers.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const enginePackPath = resolve(
  appRoot,
  "..",
  "..",
  "packages",
  "GBAStudioEngine",
  "dist",
  "GBAStudioEnginePack"
);
const templatePath = join(
  appRoot,
  "default-assets",
  "templates",
  "exemplo-gba",
  "exemplo-gba.gba-project"
);
const port = Number(process.env.GBA_STUDIO_CAMPAIGN_REPLAY_CDP_PORT ?? 9381);
const replayID = "farol-dungeon-racing-continue";
const evidencePath = resolve(
  process.env.GBA_STUDIO_CAMPAIGN_REPLAY_EVIDENCE
    ?? join(appRoot, "artifacts", "exemplo-campaign-replay", "latest", "evidence.json")
);

async function fetchTargets() {
  const response = await fetch(`http://127.0.0.1:${port}/json/list`);
  if (!response.ok) return [];
  const targets = await response.json();
  return Array.isArray(targets) ? targets : [];
}

async function waitForTarget(predicate, description, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let lastTargets = [];
  while (Date.now() < deadline) {
    try {
      lastTargets = await fetchTargets();
      const target = lastTargets.find(predicate);
      if (target) return target;
    } catch {
      // Electron ainda pode estar iniciando.
    }
    await wait(250);
  }
  throw new Error(`Target nao encontrado para ${description}: ${JSON.stringify(lastTargets)}.`);
}

async function evaluate(cdp, expression, awaitPromise = false) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text ?? "Falha no renderer.");
  }
  return result.result?.value;
}

async function waitForText(cdp, predicate, description, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let lastText = "";
  while (Date.now() < deadline) {
    lastText = await renderedText(cdp);
    if (predicate(lastText)) return lastText;
    await wait(250);
  }
  throw new Error(`Estado nao alcancado: ${description}. Texto: ${lastText.slice(0, 4_000)}`);
}

async function waitForPlayWindowStatus(cdp, timeoutMs = 180_000) {
  const deadline = Date.now() + timeoutMs;
  let sawBusy = false;
  let lastStatus = null;
  while (Date.now() < deadline) {
    lastStatus = await evaluate(cdp, `
      (() => ({
        busy: Boolean(document.querySelector(".studio-status-bar-spinner")),
        message: document.querySelector(".studio-status-bar-message")?.textContent?.trim() ?? ""
      }))()
    `);
    if (String(lastStatus?.message).includes("Play Window aberto:")) return lastStatus;
    sawBusy ||= Boolean(lastStatus?.busy);
    if (sawBusy && !lastStatus?.busy) {
      throw new Error(`Build do replay terminou sem abrir a Play Window: ${JSON.stringify(lastStatus)}.`);
    }
    await wait(250);
  }
  throw new Error(`Timeout aguardando Play Window: ${JSON.stringify(lastStatus)}.`);
}

async function clickByAriaLabel(cdp, label) {
  const result = await evaluate(cdp, `
    (() => {
      const button = document.querySelector(${JSON.stringify(`button[aria-label="${label}"]`)});
      if (!button || button.disabled) {
        return { ok: false, found: Boolean(button), disabled: button?.disabled ?? null };
      }
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) throw new Error(`${label} indisponivel: ${JSON.stringify(result)}.`);
}

async function clickReplayByID(cdp, replayID) {
  const result = await evaluate(cdp, `
    (() => {
      const article = Array.from(document.querySelectorAll("article"))
        .find((candidate) => (candidate.textContent ?? "").includes(${JSON.stringify(replayID)}));
      const button = article?.querySelector("button");
      if (!button || button.disabled) {
        return { ok: false, found: Boolean(button), disabled: button?.disabled ?? null };
      }
      button.click();
      return { ok: true };
    })()
  `);
  if (!result?.ok) {
    throw new Error(`Replay ${replayID} indisponivel: ${JSON.stringify(result)}.`);
  }
}

async function waitForPlayerReady(cdp, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ready = await evaluate(cdp, `Boolean(
      window.GBAStudioDirectPlayer?.inspectRuntime &&
      document.querySelector("canvas.gba-studio-direct-canvas")
    )`);
    if (ready) return;
    await wait(100);
  }
  throw new Error("Player da campanha nao ficou pronto.");
}

async function waitForRuntimeState(cdp, predicateSource, description, timeoutMs = 180_000) {
  return evaluate(cdp, `
    new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const state = window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null;
        if (state && (${predicateSource})(state)) {
          resolve(state);
          return;
        }
        if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
          reject(new Error(${JSON.stringify(`Timeout aguardando ${description}.`)}
            + " Ultimo estado: " + JSON.stringify(state)));
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  `, true);
}

async function waitForReplayCompletion(cdp, timeoutMs = 30_000) {
  return evaluate(cdp, `
    new Promise((resolve, reject) => {
      const started = Date.now();
      const check = () => {
        const replay = window.GBAStudioDirectPlayer?.inspectReplay?.() ?? null;
        if (replay?.complete === true) {
          resolve(replay);
          return;
        }
        if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
          reject(new Error("Timeout aguardando o replay liberar entrada manual. Estado: "
            + JSON.stringify(replay)));
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  `, true);
}

async function waitForValidSaveData(cdp, description, timeoutMs = 10_000) {
  return evaluate(cdp, `
    new Promise((resolve, reject) => {
      const started = Date.now();
      let stableChecksum = null;
      let stableSamples = 0;
      const check = () => {
        const inspection = window.GBAStudioDirectPlayer?.inspectSaveData?.() ?? null;
        if (inspection?.slot?.status === "ok") {
          if (inspection.contentChecksum === stableChecksum) {
            stableSamples += 1;
          } else {
            stableChecksum = inspection.contentChecksum;
            stableSamples = 1;
          }
          if (stableSamples >= 3) {
            resolve(inspection);
            return;
          }
        } else {
          stableChecksum = null;
          stableSamples = 0;
        }
        if (Date.now() - started > ${JSON.stringify(timeoutMs)}) {
          reject(new Error(${JSON.stringify(`Timeout aguardando save valido e estavel: ${description}.`)}
            + " Ultima inspecao: " + JSON.stringify(inspection)));
          return;
        }
        setTimeout(check, 50);
      };
      check();
    })
  `, true);
}

async function pressKey(cdp, code, key, windowsVirtualKeyCode, durationMs = 120) {
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    code,
    key,
    windowsVirtualKeyCode
  });
  await wait(durationMs);
  const heldState = await evaluate(
    cdp,
    "window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null"
  );
  await cdp.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    code,
    key,
    windowsVirtualKeyCode
  });
  return heldState;
}

async function inspectPlayer(cdp) {
  return evaluate(cdp, `({
    frame: window.GBAStudioDirectPlayer?.inspectFrame?.() ?? null,
    replay: window.GBAStudioDirectPlayer?.inspectReplay?.() ?? null,
    runtime: window.GBAStudioDirectPlayer?.inspectRuntime?.()?.state ?? null,
    saveData: window.GBAStudioDirectPlayer?.inspectSaveData?.() ?? null
  })`);
}

async function filesNamed(root, fileName) {
  const matches = [];
  if (!existsSync(root)) return matches;
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) matches.push(...await filesNamed(path, fileName));
    else if (entry.name === fileName) matches.push(path);
  }
  return matches;
}

async function latestExportContract(engineExportRoot) {
  const candidates = await Promise.all(
    (await filesNamed(engineExportRoot, "export_project.json"))
      .map(async (path) => ({ path, modifiedAt: (await stat(path)).mtimeMs }))
  );
  const latest = candidates.sort((left, right) => right.modifiedAt - left.modifiedAt)[0];
  if (!latest) throw new Error("O replay nao gerou export_project.json.");
  return {
    path: latest.path,
    project: JSON.parse(await readFile(latest.path, "utf8"))
  };
}

function finishVariableIndex(exportProject) {
  const finishScript = exportProject.racing_project?.scripts?.find(
    (script) => script.name === "farol_corrida_concluir"
  );
  const command = finishScript?.script?.find(
    (candidate) => candidate.op === "set_variable"
  );
  const index = Number(command?.variable);
  if (!Number.isInteger(index) || index < 0 || index >= 16) {
    throw new Error(`Indice da variavel final ausente no contrato racing: ${JSON.stringify(finishScript)}.`);
  }
  return index;
}

async function main() {
  const templateProject = JSON.parse(await readFile(templatePath, "utf8"));
  const configuredReplays = Array.isArray(templateProject?.advancedTools?.inputReplays)
    ? templateProject.advancedTools.inputReplays
    : [];
  if (!configuredReplays.some((replay) => replay?.id === replayID)) {
    console.log(JSON.stringify({
      ok: true,
      replayID,
      skipped: true,
      reason: "O projeto Vértice atual não configura o replay legado da campanha Farol."
    }, null, 2));
    return;
  }

  const executable = electronExecutablePath({ appRoot, usePackagedApp: false });
  if (!existsSync(executable)) {
    throw new Error(`Executavel do Electron nao encontrado: ${executable}`);
  }
  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-campaign-replay-"));
  const engineExportRoot = join(tempRoot, "EngineExport");
  const child = spawn(executable, [appRoot], {
    cwd: appRoot,
    env: createElectronSmokeEnv({
      GBA_STUDIO_ENGINE_PACK_SOURCE: enginePackPath,
      GBA_STUDIO_OPEN_PROJECT: templatePath,
      GBA_STUDIO_SMOKE_CDP_PORT: String(port),
      GBA_STUDIO_SMOKE_ENGINE_EXPORT_ROOT: engineExportRoot,
      GBA_STUDIO_SMOKE_USER_DATA_DIR: join(tempRoot, "UserData")
    }),
    stdio: ["ignore", "pipe", "pipe"]
  });
  let stdout = "";
  let stderr = "";
  child.stdout.on("data", (chunk) => { stdout += String(chunk); });
  child.stderr.on("data", (chunk) => { stderr += String(chunk); });
  let mainCdp;
  let playerCdp;

  try {
    const mainTarget = await waitForTarget(
      (target) => target.type === "page" && target.webSocketDebuggerUrl,
      "janela principal"
    );
    mainCdp = cdpSession(mainTarget.webSocketDebuggerUrl);
    await mainCdp.ready;
    await waitForText(
      mainCdp,
      (text) => (text.includes("circuito_final") || text.includes("farol_corrida_final"))
        && text.includes("Salvo"),
      "projeto completo aberto"
    );
    await clickByAriaLabel(mainCdp, "Abrir testes e diagnóstico");
    await waitForText(
      mainCdp,
      (text) => text.includes(replayID),
      "replay da campanha no diagnostico"
    );

    const beforeIDs = new Set((await fetchTargets()).map((target) => target.id));
    await clickReplayByID(mainCdp, replayID);
    await waitForText(
      mainCdp,
      (text) => text.includes("Compilando ROM..."),
      "compilacao do replay da campanha",
      30_000
    );
    await waitForPlayWindowStatus(mainCdp);
    const playerTarget = await waitForTarget(
      (target) => target.type === "page"
        && target.webSocketDebuggerUrl
        && !beforeIDs.has(target.id)
        && String(target.url).includes("/player/runtime.html")
        && String(target.url).includes("replay=1"),
      "Play Window com replay"
    );
    playerCdp = cdpSession(playerTarget.webSocketDebuggerUrl);
    await playerCdp.ready;
    await waitForPlayerReady(playerCdp);
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

    const exported = await latestExportContract(engineExportRoot);
    const variableIndex = finishVariableIndex(exported.project);
    const dungeonState = await waitForRuntimeState(
      playerCdp,
      "(state) => Number(state.runtimeKind) === 6",
      "entrada focada no dungeon"
    );
    const racingCompletedState = await waitForRuntimeState(
      playerCdp,
      `(state) => Number(state.runtimeKind) === 7
        && Number(state.variables?.[${variableIndex}]) === 1`,
      "dungeon concluido e corrida salva"
    );
    const completedState = await waitForRuntimeState(
      playerCdp,
      "(state) => Number(state.runtimeKind) === 3",
      "epilogo e retorno ao menu",
      240_000
    );
    const replayCompletion = await waitForReplayCompletion(playerCdp);
    const saveDataAfterCompletion = await waitForValidSaveData(
      playerCdp,
      "depois da conclusao da corrida"
    );
    if (saveDataAfterCompletion?.hasUniversalSlotRecord !== true) {
      throw new Error(
        `A corrida terminou sem gravar um registro universal no SRAM: ${JSON.stringify(saveDataAfterCompletion)}.`
      );
    }

    const snapshotSaved = await evaluate(
      playerCdp,
      "window.GBAStudioDirectPlayer.save()"
    );
    if (!snapshotSaved) throw new Error("Nao foi possivel salvar o snapshot do menu final.");
    const reboot = await evaluate(playerCdp, `({
      rebootPerformed: true,
      snapshotLoaded: window.GBAStudioDirectPlayer.restartAndLoad()
    })`);
    if (!reboot?.snapshotLoaded) {
      throw new Error("Nao foi possivel reiniciar o core, restaurar o menu e reanexar o save.");
    }
    const resetTitleState = await waitForRuntimeState(
      playerCdp,
      "(state) => Number(state.runtimeKind) === 3",
      "menu restaurado depois do reboot"
    );
    const saveDataBeforeContinue = await waitForValidSaveData(
      playerCdp,
      "depois do reboot e antes de Continue"
    );
    const beforeContinue = await inspectPlayer(playerCdp);
    const downHeldState = await pressKey(playerCdp, "ArrowDown", "ArrowDown", 40);
    await wait(200);
    const afterDown = await inspectPlayer(playerCdp);
    const confirmHeldState = await pressKey(playerCdp, "KeyX", "x", 88);
    await wait(200);
    const afterConfirm = await inspectPlayer(playerCdp);
    const continueTrace = {
      afterConfirm,
      afterDown,
      beforeContinue,
      confirmHeldState,
      downHeldState
    };
    let continuedState;
    try {
      continuedState = await waitForRuntimeState(
        playerCdp,
        `(state) => Number(state.runtimeKind) === 7
          && Number(state.variables?.[${variableIndex}]) === 1`,
        "Continue restaurar a corrida",
        60_000
      );
    } catch (error) {
      throw new Error(
        `${error instanceof Error ? error.message : String(error)}`
        + ` Trace de entrada: ${JSON.stringify(continueTrace)}`
      );
    }

    const audit = auditCampaignReplayOutcome({
      completedState,
      continueTrace,
      continuedState,
      dungeonState,
      finishVariableIndex: variableIndex,
      racingCompletedState,
      replayCompletion,
      rebootPerformed: reboot.rebootPerformed,
      saveDataAfterCompletion,
      saveDataBeforeContinue,
      resetTitleState
    });
    const evidence = {
      audit,
      completedState,
      continuedState,
      dungeonState,
      exportContractPath: exported.path,
      finishVariableIndex: variableIndex,
      generatedAt: new Date().toISOString(),
      ok: audit.ok,
      racingCompletedState,
      reboot,
      resetTitleState,
      replayID,
      replayCompletion,
      saveDataAfterCompletion,
      saveDataBeforeContinue,
      continueTrace,
      templatePath
    };
    await mkdir(dirname(evidencePath), { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    if (!audit.ok) {
      throw new Error(audit.issues.join("; "));
    }
    console.log(JSON.stringify({ ok: true, evidencePath, finishVariableIndex: variableIndex }, null, 2));
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}`
      + `\nstdout:\n${stdout.slice(-8_000)}\nstderr:\n${stderr.slice(-8_000)}`
    );
  } finally {
    playerCdp?.close();
    mainCdp?.close();
    await terminateChild(child);
  }
}

await main();
