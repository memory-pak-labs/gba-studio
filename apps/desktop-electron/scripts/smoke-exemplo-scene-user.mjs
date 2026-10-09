import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  assertUserScenePlayProject,
  auditUserScenePlayEvidence,
  buildUserScenePlayProject
} from "./smoke-exemplo-scene-user-contract.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const templateRoot = join(appRoot, "default-assets", "templates", "exemplo-gba");
const templatePath = join(templateRoot, "exemplo-gba.gba-project");
const sceneSmokePath = join(appRoot, "scripts", "smoke-electron-exemplo-scenes.mjs");
const evidenceRoot = join(appRoot, "artifacts", "exemplo-scene-playtest", "latest");
const defaultSceneName = "porto_lumen";

function argumentValue(prefix, fallback) {
  const argument = process.argv.find((candidate) => candidate.startsWith(prefix));
  return argument === undefined ? fallback : argument.slice(prefix.length).trim();
}

function runChild(command, args, options) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      ...options,
      stdio: ["ignore", "pipe", "pipe"]
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.once("error", reject);
    child.once("close", (code, signal) => resolvePromise({ code, signal, stderr, stdout }));
  });
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function main() {
  const runAll = process.argv.includes("--all");
  const exerciseBattleInput = process.argv.includes("--exercise-battle-input");
  const requestedSceneName = argumentValue("--scene=", null);
  if (runAll && requestedSceneName !== null) {
    throw new Error("Use --all ou --scene, não os dois ao mesmo tempo.");
  }
  const sceneName = runAll ? null : requestedSceneName ?? defaultSceneName;
  if (!runAll && sceneName.length === 0) throw new Error("O argumento --scene precisa identificar uma cena.");
  if (exerciseBattleInput && sceneName !== "guardiao_rele") {
    throw new Error("--exercise-battle-input exige --scene=guardiao_rele.");
  }
  if (!existsSync(templatePath)) throw new Error(`Template Exemplo não encontrado: ${templatePath}`);
  if (!existsSync(sceneSmokePath)) throw new Error(`Smoke de cenas não encontrado: ${sceneSmokePath}`);

  const source = await readJson(templatePath);
  const userProject = assertUserScenePlayProject(buildUserScenePlayProject(source));
  const tempRoot = await mkdtemp(join(tmpdir(), "gba-studio-exemplo-scene-user-"));
  const projectRoot = join(tempRoot, "exemplo-gba");
  const userProjectPath = join(projectRoot, "exemplo-gba.gba-project");
  const childEvidencePath = join(evidenceRoot, "user-scene-playtest-run.json");
  const userEvidencePath = join(evidenceRoot, "user-scene-playtest-evidence.json");

  try {
    await mkdir(projectRoot, { recursive: true });
    await symlink(join(templateRoot, "Assets"), join(projectRoot, "Assets"), "dir");
    await symlink(join(templateRoot, "plugins"), join(projectRoot, "plugins"), "dir");
    await writeFile(userProjectPath, `${JSON.stringify(userProject, null, 2)}\n`, "utf8");
    await mkdir(evidenceRoot, { recursive: true });

    const childArgs = [
      sceneSmokePath,
      `--project=${userProjectPath}`,
      `--evidence=${childEvidencePath}`
    ];
    if (!runAll) childArgs.push(`--scene=${sceneName}`);
    if (exerciseBattleInput) childArgs.push("--exercise-battle-input");

    const childResult = await runChild(
      process.execPath,
      childArgs,
      {
        cwd: appRoot,
        env: {
          ...process.env
        }
      }
    );
    if (childResult.code !== 0) {
      throw new Error([
        `Smoke ${runAll ? "agregado das cenas" : `da cena ${sceneName}`} terminou com código ${childResult.code ?? "desconhecido"}${childResult.signal ? ` (${childResult.signal})` : ""}.`,
        `stdout:\n${childResult.stdout.slice(-8_000)}`,
        `stderr:\n${childResult.stderr.slice(-8_000)}`
      ].join("\n"));
    }

    const childEvidence = await readJson(childEvidencePath);
    const audit = auditUserScenePlayEvidence({
      childEvidence,
      childExitCode: childResult.code,
      project: userProject,
      runAll,
      sceneName,
      exerciseBattleInput
    });
    const checks = audit.checks;
    const evidence = {
      checks,
      childEvidencePath,
      generatedAt: new Date().toISOString(),
      ok: Object.values(checks).every(Boolean),
      projectPath: userProjectPath,
      requestedSceneName: sceneName,
      runAll,
      runtimeFrames: audit.runtimeFrames,
      sceneNames: audit.sceneNames,
      sourceTemplatePath: templatePath,
      userProject: {
        developerMode: userProject.settings.debug.developerMode,
        sceneCount: Array.isArray(userProject.scenas) ? userProject.scenas.length : 0
      }
    };
    await writeFile(userEvidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    if (!evidence.ok) {
      throw new Error(`Contrato do usuário falhou: ${JSON.stringify(checks)}.`);
    }
    console.log(JSON.stringify({
      ok: true,
      evidencePath: userEvidencePath,
      checks,
      sceneNames: audit.sceneNames,
      runtimeFrames: audit.runtimeFrames
    }, null, 2));
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}
