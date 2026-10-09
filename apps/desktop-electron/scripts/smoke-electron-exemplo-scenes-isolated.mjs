import { spawn } from "node:child_process";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditExemploInterfaceScenePlaytest,
  consolidateExemploScenePlaytestRuns,
  exemploInterfaceScenePlaytestPlan,
  exemploScenePlaytestPlan,
  reusableExemploScenePlaytestRuns,
  shouldRetryIsolatedSceneRun
} from "./exemplo-scene-playtest-contract.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const usePackagedApp = process.argv.includes("--packaged");
const interfaceOnly = process.argv.includes("--interfaces");
const resumePreviousRun = process.argv.includes("--resume");
const basePort = Number(process.env.GBA_STUDIO_SMOKE_CDP_PORT ?? 9474);
const evidenceRoot = join(appRoot, "artifacts", "exemplo-scene-playtest", "latest");
const fragmentsRoot = join(evidenceRoot, interfaceOnly ? "isolated-interface-runs" : "isolated-runs");
const evidencePath = join(evidenceRoot, interfaceOnly
  ? "exemplo_interface_scene_playtest_evidence.json"
  : "exemplo_scene_playtest_evidence.json");
const partialEvidencePath = join(evidenceRoot, interfaceOnly
  ? "exemplo_interface_scene_playtest_partial_evidence.json"
  : "exemplo_scene_playtest_partial_evidence.json");
const sceneRunnerPath = join(appRoot, "scripts", "smoke-electron-exemplo-scenes.mjs");
const templatePath = join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project");

function runProcess(command, args, env) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: appRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => resolve({ code: null, error: error.message, stderr, stdout }));
    child.on("exit", (code, signal) => resolve({ code, error: signal ? `encerrado por ${signal}` : null, stderr, stdout }));
  });
}

function diagnostic(run) {
  return [run.error, run.stderr, run.stdout]
    .filter(Boolean)
    .join("\n")
    .slice(-8_000);
}

async function writeConsolidatedEvidence(template, runs, complete) {
  const consolidated = consolidateExemploScenePlaytestRuns(template, runs, {
    audit: interfaceOnly ? auditExemploInterfaceScenePlaytest : undefined,
    plan: interfaceOnly ? exemploInterfaceScenePlaytestPlan : undefined
  });
  const evidence = {
    audit: consolidated.audit,
    complete,
    executionIssues: consolidated.executionIssues,
    executionMode: interfaceOnly ? "isolated-process-per-interface" : "isolated-process-per-scene",
    generatedAt: new Date().toISOString(),
    ok: complete && consolidated.ok,
    packagedApp: usePackagedApp,
    results: consolidated.results,
    runs: consolidated.runs,
    templatePath
  };
  await writeFile(complete ? evidencePath : partialEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  return evidence;
}

async function main() {
  const template = JSON.parse(await readFile(templatePath, "utf8"));
  const plan = interfaceOnly
    ? exemploInterfaceScenePlaytestPlan(template)
    : exemploScenePlaytestPlan(template);
  let runs = [];
  if (resumePreviousRun) {
    try {
      const previousEvidence = JSON.parse(await readFile(evidencePath, "utf8"));
      const expectedExecutionMode = interfaceOnly ? "isolated-process-per-interface" : "isolated-process-per-scene";
      if (previousEvidence.executionMode === expectedExecutionMode && previousEvidence.packagedApp === usePackagedApp) {
        runs = reusableExemploScenePlaytestRuns(template, previousEvidence.runs, {
          plan: interfaceOnly ? exemploInterfaceScenePlaytestPlan : undefined
        });
      }
    } catch {
      // Nao ha evidencia compativel para retomar.
    }
  }
  if (!resumePreviousRun) await rm(fragmentsRoot, { force: true, recursive: true });
  await mkdir(fragmentsRoot, { recursive: true });

  for (const scene of plan) {
    if (runs.some((run) => run.sceneName === scene.name && run.ok === true)) {
      console.log(`[${scene.index + 1}/${plan.length}] Preservado ${scene.name} da evidencia anterior.`);
      continue;
    }
    const fragmentPath = join(fragmentsRoot, `${String(scene.index + 1).padStart(2, "0")}-${scene.name}.json`);
    const args = [
      sceneRunnerPath,
      ...(usePackagedApp ? ["--packaged"] : []),
      `--scene=${scene.name}`,
      `--evidence=${fragmentPath}`
    ];
    let processResult;
    let attempt = 0;
    do {
      attempt += 1;
      console.log(`[${scene.index + 1}/${plan.length}] Processo isolado: ${scene.name} (${scene.runtime}), tentativa ${attempt}/2...`);
      processResult = await runProcess(process.execPath, args, {
        ...process.env,
        GBA_STUDIO_SMOKE_CDP_PORT: String(basePort + scene.index)
      });
      if (processResult.code !== 0 && shouldRetryIsolatedSceneRun(processResult, attempt, 2)) {
        console.warn(`[${scene.index + 1}/${plan.length}] Contexto transitorio perdido em ${scene.name}; repetindo uma vez em processo novo.`);
      } else {
        break;
      }
    } while (attempt < 2);

    if (processResult.code === 0) {
      const fragment = JSON.parse(await readFile(fragmentPath, "utf8"));
      const result = fragment.results?.[0];
      if (fragment.ok === true && result?.name === scene.name) {
        runs.push({ attempts: attempt, ok: true, sceneName: scene.name, result });
        console.log(`[${scene.index + 1}/${plan.length}] OK ${scene.name}: ${result.performance?.presentationFps ?? 0} FPS.`);
      } else {
        runs.push({ attempts: attempt, ok: false, sceneName: scene.name, error: `fragmento invalido: ${JSON.stringify(fragment.audit ?? null)}` });
      }
    } else {
      runs.push({
        attempts: attempt,
        ok: false,
        sceneName: scene.name,
        error: diagnostic(processResult) || `processo encerrou com codigo ${String(processResult.code)}`
      });
      console.error(`[${scene.index + 1}/${plan.length}] FALHOU ${scene.name}; as demais cenas continuarao.`);
    }
    await writeConsolidatedEvidence(template, runs, false);
  }

  const evidence = await writeConsolidatedEvidence(template, runs, true);
  if (!evidence.ok) {
    throw new Error(`Playtest isolado falhou: ${[...evidence.executionIssues, ...evidence.audit.issues].join("; ")}`);
  }
  console.log(JSON.stringify({ ok: true, evidencePath, counts: evidence.audit.counts }, null, 2));
}

await main();
