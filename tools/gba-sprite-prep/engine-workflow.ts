import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { cp, mkdtemp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { parseGBAProjectFile } from "../../apps/desktop-electron/src/shared/projectFile.js";
import { prepareEngineProjectExport } from "../../apps/desktop-electron/src/main/exportEngineProject.js";
import { writeEngineSchemaExport } from "../../apps/desktop-electron/src/main/engineProjectExport.js";
// @ts-expect-error The workflow is bundled with esbuild, which resolves this local ESM helper.
import { materializeBackgroundValidation } from "./background-validation-workflow.mjs";

const execFileAsync = promisify(execFile);
const toolTimeoutMs = 120_000;
const toolMaxBuffer = 16 * 1024 * 1024;

export interface EngineWorkflowOptions {
  projectPath: string;
  destination: string;
  enginePackPath: string;
  actorSelector: string;
}

export interface EngineWorkflowEvidence {
  schema: 1;
  projectPath: string;
  enginePack: {
    path: string;
    version: string;
    doctorOk: boolean;
  };
  export: {
    target: string;
    generatedFiles: number;
    warnings: string[];
  };
  backgroundValidation: {
    reportPath: string;
    status: string;
    ready: boolean;
    assets: number;
  };
  sprite: {
    actorId: string;
    spriteSheet: string;
    animationName: string;
    frameCount: number;
    exportedAsset: string;
    runtimeAnimationMode: "named" | "sheet-default";
  };
  build: {
    exitCode: number;
    romPath: string;
    romBytes: number;
    romSha256: string;
  };
  smoke: {
    checkOnly: boolean;
    reportPath: string;
  };
}

interface StagedEnginePack {
  path: string;
  cleanup: () => Promise<void>;
}

interface VerifiedSpriteContract {
  actorId: string;
  spriteSheet: string;
  animationName: string;
  frameCount: number;
  exportedAsset: string;
  runtimeAnimationMode: "named" | "sheet-default";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function records(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function requiredString(record: Record<string, unknown>, key: string, context: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${context} nao informa ${key}.`);
  }
  return value.trim();
}

function normalizedAssetName(spriteSheet: string): string {
  const stem = spriteSheet.replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "");
  const normalized = stem
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return normalized || "sprite";
}

function runtimeSpriteBindings(value: unknown, assetName: string): Array<Record<string, unknown>> {
  const matches: Array<Record<string, unknown>> = [];
  const visit = (candidate: unknown): void => {
    if (Array.isArray(candidate)) {
      candidate.forEach(visit);
      return;
    }
    if (!isRecord(candidate)) return;
    const metasprite = isRecord(candidate.metasprite) ? candidate.metasprite : {};
    if (metasprite.asset === assetName) matches.push(candidate);
    Object.values(candidate).forEach(visit);
  };
  visit(value);
  return matches;
}

export function verifySpriteContract(
  projectData: Record<string, unknown>,
  exportContract: unknown,
  actorSelector: string
): VerifiedSpriteContract {
  const actor = records(projectData.actors).find((candidate) => (
    candidate.id === actorSelector || candidate.name === actorSelector
  ));
  if (!actor) {
    throw new Error(`Ator '${actorSelector}' nao encontrado antes do export.`);
  }
  const actorId = requiredString(actor, "id", `Ator '${actorSelector}'`);
  const spriteSheet = requiredString(actor, "spriteSheet", `Ator '${actorSelector}'`);
  const animationName = requiredString(actor, "animationName", `Ator '${actorSelector}'`);
  const animation = records(projectData.animations).find((candidate) => (
    candidate.spriteSheet === spriteSheet
      && (candidate.name === animationName || candidate.id === animationName)
  ));
  if (!animation) {
    throw new Error(
      `Animacao '${animationName}' da sheet '${spriteSheet}' nao encontrada antes do export.`
    );
  }
  const animationFrames = records(animation.frames);
  const declaredFrameCount = animation.frameCount;
  const frameCount = animationFrames.length > 0
    ? animationFrames.length
    : typeof declaredFrameCount === "number" && declaredFrameCount > 0
      ? Math.floor(declaredFrameCount)
      : 0;
  if (frameCount === 0) {
    throw new Error(`Animacao '${animationName}' nao possui frames.`);
  }

  if (!isRecord(exportContract)) {
    throw new Error("Contrato do Engine Pack precisa ser um objeto.");
  }
  const copiedAsset = records(exportContract.copied_assets).find((asset) => asset.name === spriteSheet);
  if (!copiedAsset) {
    throw new Error(`Sheet '${spriteSheet}' nao chegou aos copied_assets do Engine Pack.`);
  }
  const expectedAssetName = normalizedAssetName(spriteSheet);
  const assetPack = isRecord(exportContract.asset_pack) ? exportContract.asset_pack : {};
  const exportedAsset = records(assetPack.assets).find((asset) => (
    asset.kind === "obj" && (asset.name === expectedAssetName || asset.id === expectedAssetName)
  ));
  if (!exportedAsset) {
    throw new Error(`Sheet '${spriteSheet}' nao chegou ao asset_pack como OBJ.`);
  }
  const runtimeBindings = runtimeSpriteBindings(exportContract, expectedAssetName);
  if (runtimeBindings.length === 0) {
    throw new Error(`Asset OBJ '${expectedAssetName}' nao esta ligado a nenhum ator do runtime.`);
  }
  const runtimeAnimationMode = runtimeBindings.some((binding) => (
    records(binding.animations).some((entry) => entry.name === animationName)
  ))
    ? "named"
    : "sheet-default";

  return {
    actorId,
    spriteSheet,
    animationName,
    frameCount,
    exportedAsset: requiredString(exportedAsset, "name", "Asset OBJ exportado"),
    runtimeAnimationMode
  };
}

function engineTool(enginePackPath: string, name: string): string {
  const executable = process.platform === "win32" ? `${name}.exe` : name;
  const candidate = path.join(enginePackPath, "tools", executable);
  if (!existsSync(candidate)) {
    throw new Error(`Ferramenta ${name} nao encontrada no Engine Pack: ${candidate}`);
  }
  return candidate;
}

async function enginePackVersion(enginePackPath: string): Promise<string> {
  const versionPath = path.join(enginePackPath, "VERSION");
  if (existsSync(versionPath)) {
    return (await readFile(versionPath, "utf8")).trim();
  }
  const manifest = JSON.parse(
    await readFile(path.join(enginePackPath, "enginepack.json"), "utf8")
  ) as { version?: unknown };
  if (typeof manifest.version !== "string" || manifest.version.trim().length === 0) {
    throw new Error("Engine Pack nao informa uma versao valida.");
  }
  return manifest.version.trim();
}

async function stageEnginePackForMake(enginePackPath: string): Promise<StagedEnginePack> {
  if (!/\s/.test(enginePackPath)) {
    return { path: enginePackPath, cleanup: async () => {} };
  }
  const root = await mkdtemp(path.join(os.tmpdir(), "gba-sprite-engine-pack-"));
  const staged = path.join(root, "engine-pack");
  await mkdir(staged, { recursive: true });
  for (const entry of ["lib", "include", "templates", "enginepack.json"] as const) {
    const source = path.join(enginePackPath, entry);
    if (existsSync(source)) {
      await cp(source, path.join(staged, entry), { recursive: true, force: true });
    }
  }
  return {
    path: staged,
    cleanup: async () => rm(root, { recursive: true, force: true })
  };
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function runTool(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv = process.env
): Promise<{ stdout: string; stderr: string }> {
  const result = await execFileAsync(executable, args, {
    encoding: "utf8",
    env,
    timeout: toolTimeoutMs,
    maxBuffer: toolMaxBuffer
  });
  return { stdout: result.stdout, stderr: result.stderr };
}

export async function runEngineWorkflow(
  options: EngineWorkflowOptions
): Promise<EngineWorkflowEvidence> {
  const projectPath = path.resolve(options.projectPath);
  const destination = path.resolve(options.destination);
  const enginePackPath = path.resolve(options.enginePackPath);
  const assetcPath = engineTool(enginePackPath, "assetc");
  const gbsdoctorPath = engineTool(enginePackPath, "gbsdoctor");
  const gbsbuildPath = engineTool(enginePackPath, "gbsbuild");
  const smokeMgbaPath = engineTool(enginePackPath, "smoke_mgba");
  const version = await enginePackVersion(enginePackPath);
  const project = parseGBAProjectFile(await readFile(projectPath, "utf8"));
  const prepared = prepareEngineProjectExport(project.data, {
    enginePackPath,
    enginePackVersion: version
  });
  if (!prepared.generated || prepared.error) {
    throw new Error(prepared.error ?? "O exportador nao produziu o contrato do Engine Pack.");
  }
  const sprite = verifySpriteContract(
    project.data,
    prepared.generated.contract,
    options.actorSelector
  );

  const written = await writeEngineSchemaExport({
    destination,
    prepared: prepared.generated,
    assetcPath,
    projectPath
  });
  const backgroundValidation = await materializeBackgroundValidation({
    destination,
    runAssetc: (args: string[]) => runTool(assetcPath, args)
  });
  const doctor = await runTool(gbsdoctorPath, [
    "--engine-pack",
    enginePackPath,
    "--project-dir",
    destination,
    "--json",
    "--skip-toolchain"
  ]);
  const doctorResult = JSON.parse(doctor.stdout) as { ok?: unknown };
  if (doctorResult.ok !== true) {
    throw new Error(`gbsdoctor reprovou o export: ${doctor.stdout || doctor.stderr}`);
  }

  const stagedPack = await stageEnginePackForMake(enginePackPath);
  try {
    await runTool(gbsbuildPath, [
      "--engine-pack",
      stagedPack.path,
      "--project-dir",
      destination
    ]);
  } finally {
    await stagedPack.cleanup();
  }

  const romPath = path.join(destination, "build", `${prepared.generated.target}.gba`);
  const romInfo = await stat(romPath);
  if (!romInfo.isFile() || romInfo.size === 0) {
    throw new Error(`gbsbuild nao produziu uma ROM valida: ${romPath}`);
  }
  const smokeReportPath = path.join(destination, "mgba_smoke_report.md");
  await runTool(
    smokeMgbaPath,
    ["--check-only", romPath],
    {
      ...process.env,
      REPORT_DIR: destination,
      REPORT_PATH: smokeReportPath
    }
  );

  const evidence: EngineWorkflowEvidence = {
    schema: 1,
    projectPath,
    enginePack: {
      path: enginePackPath,
      version,
      doctorOk: true
    },
    export: {
      target: prepared.generated.target,
      generatedFiles: written.files.length,
      warnings: written.warnings ?? []
    },
    backgroundValidation: {
      reportPath: backgroundValidation.reportPath,
      status: backgroundValidation.status,
      ready: backgroundValidation.ready,
      assets: backgroundValidation.assets.length
    },
    sprite,
    build: {
      exitCode: 0,
      romPath,
      romBytes: romInfo.size,
      romSha256: await sha256(romPath)
    },
    smoke: {
      checkOnly: true,
      reportPath: smokeReportPath
    }
  };
  await writeFile(
    path.join(destination, "sprite_pipeline_evidence.json"),
    `${JSON.stringify(evidence, null, 2)}\n`,
    "utf8"
  );
  return evidence;
}
