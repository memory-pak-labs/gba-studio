import { existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFile, type ExecFileOptionsWithStringEncoding } from "node:child_process";
import { cp, mkdir, readFile, realpath, stat } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { app } from "electron";
import type {
  EnginePackBuildDryRunResult,
  EnginePackBuildDryRunSummary,
  EnginePackBuildResult,
  EnginePackBuildSummary,
  EnginePackCandidate,
  EnginePackDoctorBlocker,
  EnginePackDoctorResult,
  EnginePackDoctorSummary,
  EnginePackInvocationOptions,
  EnginePackStatus
} from "../shared/ipc.js";
import { resolveEnginePackCandidatePaths } from "../shared/enginePackPaths.js";
import { resolveEngineToolInvocation as toolInvocation } from "./engineToolInvocation.js";
import { acquireBuildLock, copyTreeIfChanged, exportedFileHashes } from "./stableBuildFiles.js";
import { pruneDiskCache, stagingCachePolicy, touchDiskCacheEntry, withDiskCacheLock } from "./diskCacheRetention.js";

const execFileAsync = promisify(execFile);
const doctorTimeoutMs = 20_000;
const gbsbuildTimeoutMs = 300_000;
const doctorMaxBuffer = 8 * 1024 * 1024;
const unsafeMakePathPattern = /\s/;

function gbsdoctorExecutableName(): string {
  return process.platform === "win32" ? "gbsdoctor.exe" : "gbsdoctor";
}

function gbsbuildExecutableName(): string {
  return process.platform === "win32" ? "gbsbuild.exe" : "gbsbuild";
}

function assetcExecutableName(): string {
  return process.platform === "win32" ? "assetc.exe" : "assetc";
}

function toolPath(candidatePath: string, executableName: string): string {
  const toolName = executableName.replace(/\.exe$/, "");
  const candidates = [
    ...(process.platform !== "darwin" ? [path.join(candidatePath, "tools", `${toolName}.py`)] : []),
    path.join(candidatePath, "tools", executableName),
    path.join(candidatePath, "tools", `${toolName}.py`),
    path.join(candidatePath, "tools", toolName),
    path.join(candidatePath, "tools", `${toolName}.exe`)
  ];
  return candidates.find((item) => existsSync(item)) ?? candidates[0];
}

function candidate(label: string, candidatePath: string): EnginePackCandidate {
  const assetcPath = toolPath(candidatePath, assetcExecutableName());
  const gbsdoctorPath = toolPath(candidatePath, gbsdoctorExecutableName());
  const gbsbuildPath = toolPath(candidatePath, gbsbuildExecutableName());
  return {
    label,
    path: candidatePath,
    exists: existsSync(candidatePath),
    assetcPath,
    hasAssetc: existsSync(assetcPath),
    gbsdoctorPath,
    hasGbsdoctor: existsSync(gbsdoctorPath),
    gbsbuildPath,
    hasGbsbuild: existsSync(gbsbuildPath)
  };
}

export async function readEnginePackVersion(enginePackPath: string): Promise<string | null> {
  try {
    const contents = await readFile(path.join(enginePackPath, "enginepack.json"), "utf8");
    const manifest = JSON.parse(contents) as unknown;
    return isRecord(manifest) ? stringOrNull(manifest.version) : null;
  } catch {
    return null;
  }
}

export interface InspectEnginePackOptions {
  preferredPath?: string;
}

export function inspectEnginePack(options: InspectEnginePackOptions = {}): EnginePackStatus {
  const preferredPath = options.preferredPath?.trim();
  const baseCandidates = resolveEnginePackCandidatePaths({
    envPackPath: process.env.GBA_STUDIO_ENGINE_PACK_SOURCE ?? process.env.GBA_STUDIO_ENGINE_PACK_DIR,
    envRepoPath: process.env.GBA_STUDIO_ENGINE_REPO,
    appPath: app.getAppPath(),
    homeDir: app.getPath("home"),
    resourcesPath: process.resourcesPath
  }).map((item) => candidate(item.label, item.path));

  const candidates = preferredPath
    ? [candidate("Settings do projeto", preferredPath), ...baseCandidates.filter((item) => path.resolve(item.path) !== path.resolve(preferredPath))]
    : baseCandidates;

  return {
    platform: process.platform,
    candidates,
    selected: candidates.find((item) => item.exists && item.hasGbsdoctor && item.hasAssetc && item.hasGbsbuild)
      ?? candidates.find((item) => item.exists && item.hasGbsdoctor)
  };
}

export interface MakeGbsdoctorArgsOptions {
  enginePackPath: string;
  projectDir?: string;
}

export function makeGbsdoctorArgs(options: MakeGbsdoctorArgsOptions): string[] {
  const args = ["--engine-pack", options.enginePackPath];
  if (options.projectDir) {
    args.push("--project-dir", options.projectDir);
  }
  args.push("--json");
  return args;
}

export interface MakeGbsbuildDryRunArgsOptions {
  enginePackPath: string;
  projectDir: string;
  buildDir?: string;
}

export type MakeGbsbuildArgsOptions = MakeGbsbuildDryRunArgsOptions;

export function makeGbsbuildArgs(options: MakeGbsbuildArgsOptions): string[] {
  const args = ["--engine-pack", options.enginePackPath, "--project-dir", options.projectDir];
  if (options.buildDir) {
    args.push("--build-dir", options.buildDir);
  }
  return args;
}

export function makeGbsbuildDryRunArgs(options: MakeGbsbuildDryRunArgsOptions): string[] {
  const args = ["--engine-pack", options.enginePackPath, "--project-dir", options.projectDir, "--dry-run", "--json"];
  if (options.buildDir) {
    args.push("--build-dir", options.buildDir);
  }
  return args;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function booleanValue(value: unknown): boolean {
  return value === true;
}

function execOptionsForTool(invocation: ReturnType<typeof toolInvocation>): ExecFileOptionsWithStringEncoding {
  return { encoding: "utf8", windowsVerbatimArguments: invocation.windowsVerbatimArguments };
}

function checksSummary(value: unknown): { checksPassed: number; checksTotal: number } {
  if (!Array.isArray(value)) {
    return { checksPassed: 0, checksTotal: 0 };
  }

  return {
    checksPassed: value.filter((item) => isRecord(item) && item.ok === true).length,
    checksTotal: value.length
  };
}

function platformSummary(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }

  const system = stringOrNull(value.system);
  const machine = stringOrNull(value.machine);
  return [system, machine].filter(Boolean).join(" ") || null;
}

function readinessBlockers(value: unknown): EnginePackDoctorBlocker[] {
  if (!isRecord(value)) {
    return [];
  }

  const blockers = value.blockers;
  if (!Array.isArray(blockers)) {
    return [];
  }

  return blockers
    .filter(isRecord)
    .map((blocker) => ({
      id: stringOrNull(blocker.id) ?? "unknown",
      message: stringOrNull(blocker.message) ?? "Sem mensagem."
    }));
}

function nestedReadiness(raw: Record<string, unknown>): unknown {
  if (isRecord(raw.readiness)) {
    return raw.readiness;
  }

  if (isRecord(raw.diagnostics) && isRecord(raw.diagnostics.readiness)) {
    return raw.diagnostics.readiness;
  }

  return undefined;
}

export function summarizeDoctorOutput(raw: unknown): EnginePackDoctorSummary {
  if (!isRecord(raw)) {
    throw new Error("gbsdoctor retornou JSON invalido.");
  }

  const engineManifest = isRecord(raw.engine_manifest) ? raw.engine_manifest : undefined;
  const checks = checksSummary(raw.checks);

  return {
    ok: booleanValue(raw.ok),
    version: stringOrNull(raw.version),
    enginePackPath: stringOrNull(raw.engine_pack),
    platform: platformSummary(raw.platform),
    engineVersion: engineManifest ? stringOrNull(engineManifest.version) : null,
    checksPassed: checks.checksPassed,
    checksTotal: checks.checksTotal,
    blockers: readinessBlockers(nestedReadiness(raw))
  };
}

export interface RunGbsdoctorOptions {
  enginePackPath: string;
  gbsdoctorPath: string;
  projectDir?: string;
}

export type DoctorProcessResult = EnginePackDoctorResult;

export async function runGbsdoctor(options: RunGbsdoctorOptions): Promise<DoctorProcessResult> {
  const args = makeGbsdoctorArgs({ enginePackPath: options.enginePackPath, projectDir: options.projectDir });
  const command = `${options.gbsdoctorPath} ${args.join(" ")}`;

  try {
    const invocation = toolInvocation(options.gbsdoctorPath, args);
    const { stdout, stderr } = await execFileAsync(invocation.executable, invocation.args, {
      ...execOptionsForTool(invocation),
      timeout: doctorTimeoutMs,
      maxBuffer: doctorMaxBuffer
    });
    return {
      ran: true,
      exitCode: 0,
      command,
      summary: summarizeDoctorOutput(JSON.parse(stdout)),
      stderr: stderr || undefined
    };
  } catch (error) {
    if (isRecord(error)) {
      const stdout = typeof error.stdout === "string" ? error.stdout : "";
      const stderr = typeof error.stderr === "string" ? error.stderr : "";
      const code = typeof error.code === "number" ? error.code : null;
      const parsedSummary = stdout.trim().length > 0 ? trySummarize(stdout) : undefined;
      return {
        ran: true,
        exitCode: code,
        command,
        summary: parsedSummary,
        stderr: stderr || undefined,
        error: error instanceof Error ? error.message : "Falha ao executar gbsdoctor."
      };
    }

    return {
      ran: true,
      exitCode: null,
      command,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function tryParseJson(stdout: string): unknown | undefined {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

export function summarizeBuildDryRunOutput(raw: unknown): EnginePackBuildDryRunSummary {
  if (!isRecord(raw)) {
    throw new Error("gbsbuild retornou JSON invalido.");
  }

  const command = raw.command;
  if (!Array.isArray(command) || !command.every((item) => typeof item === "string")) {
    throw new Error("gbsbuild nao retornou command[].");
  }

  const valueAfterPrefix = (prefix: string): string | null => {
    const match = command.find((item) => item.startsWith(prefix));
    return match ? match.slice(prefix.length) || null : null;
  };

  return {
    command,
    target: valueAfterPrefix("TARGET="),
    projectDir: valueAfterPrefix("PROJECT_DIR="),
    buildDir: valueAfterPrefix("BUILD_DIR=")
  };
}

export interface RunGbsbuildDryRunOptions {
  enginePackPath: string;
  gbsbuildPath: string;
  projectDir: string;
  buildDir?: string;
}

type RunGbsbuildOptions = RunGbsbuildDryRunOptions;

interface PreparedGbsbuildRun {
  options: RunGbsbuildOptions;
  originalProjectDir: string;
  originalBuildDir: string;
  originalEnginePackPath: string;
  stagedProjectDir?: string;
  stagedBuildDir?: string;
  stagedEnginePackPath?: string;
  inputsStillCurrent?: () => Promise<boolean>;
  cleanup: () => Promise<void>;
}

function pathNeedsMakeStaging(value: string | undefined): boolean {
  return Boolean(value && unsafeMakePathPattern.test(value));
}

async function prepareGbsbuildRun(options: RunGbsbuildOptions): Promise<PreparedGbsbuildRun> {
  const originalBuildDir = options.buildDir ?? path.join(options.projectDir, "build");
  const needsStaging = [
    options.enginePackPath,
    options.projectDir,
    originalBuildDir
  ].some(pathNeedsMakeStaging);

  if (!needsStaging) {
    return {
      options,
      originalProjectDir: options.projectDir,
      originalBuildDir,
      originalEnginePackPath: options.enginePackPath,
      cleanup: async () => {}
    };
  }

  const identity = createHash("sha256").update(JSON.stringify([
    await realpath(options.projectDir), path.resolve(originalBuildDir), await realpath(options.enginePackPath)
  ])).digest("hex");
  const stagingCacheRoot = path.join(os.tmpdir(), "gbastudio-engine-build-cache");
  const stagingRootRaw = path.join(stagingCacheRoot, identity);
  await pruneDiskCache(stagingCacheRoot, stagingCachePolicy);
  const release = await withDiskCacheLock(stagingCacheRoot, () => acquireBuildLock(`${stagingRootRaw}.lock`));
  const cleanup = async () => {
    try { await touchDiskCacheEntry(stagingRootRaw); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") console.warn("[GBA Studio] Falha ao registrar uso do cache:", error); }
    finally { await release(); }
    const retention = await pruneDiskCache(stagingCacheRoot, stagingCachePolicy);
    if (retention.errors.length) console.warn("[GBA Studio] Falha na retenção do cache de build:", retention.errors);
  };

  try {
    await mkdir(stagingRootRaw, { recursive: true });
    await touchDiskCacheEntry(stagingRootRaw);
    // Resolve macOS /var aliases so gbsbuild's echoed paths remap exactly.
    const stagingRoot = await realpath(stagingRootRaw);
    const stagedProjectDir = path.join(stagingRoot, "project");
    const stagedEnginePackPath = path.join(stagingRoot, "engine-pack");
    const stagedBuildDir = path.join(stagingRoot, "build");
    const sourceSignature = async () => {
      const files: unknown[] = [await exportedFileHashes(options.projectDir)];
      for (const entry of ["lib", "include", "templates"] as const) {
        files.push(existsSync(path.join(options.enginePackPath, entry))
          ? await exportedFileHashes(path.join(options.enginePackPath, entry)) : null);
      }
      return JSON.stringify(files.map(value => value && typeof value === "object" ? Object.entries(value).sort() : value));
    };
    const before = await sourceSignature();
    await copyTreeIfChanged(options.projectDir, stagedProjectDir, true);
    await mkdir(stagedEnginePackPath, { recursive: true });
    for (const entry of ["lib", "include", "templates", "enginepack.json"] as const) {
      const sourceEntry = path.join(options.enginePackPath, entry);
      const destinationEntry = path.join(stagedEnginePackPath, entry);
      if (!existsSync(sourceEntry)) continue;
      await copyTreeIfChanged(sourceEntry, destinationEntry, true);
    }

    return {
      options: {
        ...options,
        enginePackPath: stagedEnginePackPath,
        projectDir: stagedProjectDir,
        buildDir: stagedBuildDir
      },
      originalProjectDir: options.projectDir,
      originalBuildDir,
      originalEnginePackPath: options.enginePackPath,
      stagedProjectDir,
      stagedBuildDir,
      stagedEnginePackPath,
      inputsStillCurrent: async () => before === await sourceSignature(),
      cleanup
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function remapBuildDryRunSummary(summary: EnginePackBuildDryRunSummary, prepared: PreparedGbsbuildRun): EnginePackBuildDryRunSummary {
  if (!prepared.stagedProjectDir) {
    return summary;
  }

  const replacements = [
    [`PROJECT_DIR=${prepared.stagedProjectDir}`, `PROJECT_DIR=${prepared.originalProjectDir}`],
    [`BUILD_DIR=${prepared.stagedBuildDir}`, `BUILD_DIR=${prepared.originalBuildDir}`],
    [`ENGINE_PACK=${prepared.stagedEnginePackPath}`, `ENGINE_PACK=${prepared.originalEnginePackPath}`]
  ].filter((item): item is [string, string] => Boolean(item[0] && item[1]));

  return {
    ...summary,
    command: summary.command.map((item) => replacements.reduce((value, [from, to]) => value === from ? to : value, item)),
    projectDir: summary.projectDir === prepared.stagedProjectDir ? prepared.originalProjectDir : summary.projectDir,
    buildDir: summary.buildDir === prepared.stagedBuildDir ? prepared.originalBuildDir : summary.buildDir
  };
}

async function copyStagedBuildOutput(prepared: PreparedGbsbuildRun): Promise<void> {
  if (!prepared.stagedBuildDir || !existsSync(prepared.stagedBuildDir)) {
    return;
  }

  await mkdir(path.dirname(prepared.originalBuildDir), { recursive: true });
  await cp(prepared.stagedBuildDir, prepared.originalBuildDir, { recursive: true, force: true });
}

async function buildTargetFromManifest(projectDir: string): Promise<string> {
  try {
    const manifest = JSON.parse(await readFile(path.join(projectDir, "gbastudio_project.json"), "utf8")) as unknown;
    if (!isRecord(manifest) || !isRecord(manifest.build)) {
      return "game";
    }
    return stringOrNull(manifest.build.target) ?? "game";
  } catch {
    return "game";
  }
}

async function buildSummary(options: RunGbsbuildOptions): Promise<EnginePackBuildSummary> {
  const target = await buildTargetFromManifest(options.projectDir);
  const buildDir = options.buildDir ?? path.join(options.projectDir, "build");
  const romPath = path.join(buildDir, `${target}.gba`);
  let romBytes: number | undefined;
  try {
    const romInfo = await stat(romPath);
    if (romInfo.isFile()) romBytes = romInfo.size;
  } catch {
    romBytes = undefined;
  }
  return {
    target,
    projectDir: options.projectDir,
    buildDir,
    romPath,
    ...(romBytes === undefined ? {} : { romBytes })
  };
}

export async function runGbsbuildDryRun(options: RunGbsbuildDryRunOptions): Promise<EnginePackBuildDryRunResult> {
  let prepared: PreparedGbsbuildRun;
  try { prepared = await prepareGbsbuildRun(options); } catch (error) {
    return { ran: false, exitCode: null, error: error instanceof Error ? error.message : String(error) };
  }
  const args = makeGbsbuildDryRunArgs(prepared.options);
  const command = `${options.gbsbuildPath} ${args.join(" ")}`;

  try {
    const invocation = toolInvocation(options.gbsbuildPath, args);
    const { stdout, stderr } = await execFileAsync(invocation.executable, invocation.args, {
      ...execOptionsForTool(invocation),
      timeout: doctorTimeoutMs,
      maxBuffer: doctorMaxBuffer
    });
    const summary = remapBuildDryRunSummary(summarizeBuildDryRunOutput(JSON.parse(stdout)), prepared);
    return {
      ran: true,
      exitCode: 0,
      command,
      summary,
      stderr: stderr || undefined
    };
  } catch (error) {
    if (isRecord(error)) {
      const stdout = typeof error.stdout === "string" ? error.stdout : "";
      const stderr = typeof error.stderr === "string" ? error.stderr : "";
      const code = typeof error.code === "number" ? error.code : null;
      const parsed = stdout.trim().length > 0 ? tryParseJson(stdout) : undefined;
      const parsedSummary = parsed ? trySummarizeBuildDryRun(parsed) : undefined;
      const summary = parsedSummary ? remapBuildDryRunSummary(parsedSummary, prepared) : undefined;
      return {
        ran: true,
        exitCode: code,
        command,
        summary,
        stderr: stderr || undefined,
        error: error instanceof Error ? error.message : "Falha ao executar gbsbuild."
      };
    }

    return {
      ran: true,
      exitCode: null,
      command,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await prepared.cleanup();
  }
}

export async function runGbsbuild(options: RunGbsbuildOptions): Promise<EnginePackBuildResult> {
  let prepared: PreparedGbsbuildRun;
  try { prepared = await prepareGbsbuildRun(options); } catch (error) {
    return { ran: false, exitCode: null, error: error instanceof Error ? error.message : String(error) };
  }
  const args = makeGbsbuildArgs(prepared.options);
  const command = `${options.gbsbuildPath} ${args.join(" ")}`;

  try {
    const invocation = toolInvocation(options.gbsbuildPath, args);
    const { stdout, stderr } = await execFileAsync(invocation.executable, invocation.args, {
      ...execOptionsForTool(invocation),
      timeout: gbsbuildTimeoutMs,
      maxBuffer: doctorMaxBuffer
    });
    if (prepared.inputsStillCurrent && !await prepared.inputsStillCurrent()) {
      throw new Error("Fontes ou Engine Pack mudaram durante o build. Execute Play novamente.");
    }
    await copyStagedBuildOutput(prepared);
    const summary = await buildSummary(options);
    if (summary.romBytes === undefined) {
      return {
        ran: true,
        exitCode: 0,
        command,
        summary,
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        error: `A compilação terminou com sucesso, mas a ROM não foi materializada em ${summary.romPath}.`
      };
    }
    return {
      ran: true,
      exitCode: 0,
      command,
      summary,
      stdout: stdout || undefined,
      stderr: stderr || undefined
    };
  } catch (error) {
    if (isRecord(error)) {
      const stdout = typeof error.stdout === "string" ? error.stdout : "";
      const stderr = typeof error.stderr === "string" ? error.stderr : "";
      const code = typeof error.code === "number" ? error.code : null;
      return {
        ran: true,
        exitCode: code,
        command,
        summary: await buildSummary(options),
        stdout: stdout || undefined,
        stderr: stderr || undefined,
        error: error instanceof Error ? error.message : "Falha ao executar gbsbuild."
      };
    }

    return {
      ran: true,
      exitCode: null,
      command,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await prepared.cleanup();
  }
}

function trySummarizeBuildDryRun(raw: unknown): EnginePackBuildDryRunSummary | undefined {
  try {
    return summarizeBuildDryRunOutput(raw);
  } catch {
    return undefined;
  }
}

function trySummarize(stdout: string): EnginePackDoctorSummary | undefined {
  try {
    return summarizeDoctorOutput(JSON.parse(stdout));
  } catch {
    return undefined;
  }
}

export async function runSelectedEnginePackDoctor(options: EnginePackInvocationOptions = {}): Promise<EnginePackDoctorResult> {
  const status = inspectEnginePack({ preferredPath: options.enginePackPath });
  if (!status.selected?.gbsdoctorPath) {
    return {
      ran: false,
      exitCode: null,
      error: enginePackMissingMessage(options.enginePackPath, "gbsdoctor")
    };
  }

  return runGbsdoctor({
    enginePackPath: status.selected.path,
    gbsdoctorPath: status.selected.gbsdoctorPath,
    projectDir: options.projectDir
  });
}

export async function runSelectedEnginePackBuildDryRun(projectDir: string, enginePackPath?: string): Promise<EnginePackBuildDryRunResult> {
  const status = inspectEnginePack({ preferredPath: enginePackPath });
  if (!status.selected?.gbsbuildPath) {
    return {
      ran: false,
      exitCode: null,
      error: enginePackMissingMessage(enginePackPath, "gbsbuild")
    };
  }

  return runGbsbuildDryRun({
    enginePackPath: status.selected.path,
    gbsbuildPath: status.selected.gbsbuildPath,
    projectDir
  });
}

export async function runSelectedEnginePackBuild(projectDir: string, enginePackPath?: string): Promise<EnginePackBuildResult> {
  const status = inspectEnginePack({ preferredPath: enginePackPath });
  if (!status.selected?.gbsbuildPath) {
    return {
      ran: false,
      exitCode: null,
      error: enginePackMissingMessage(enginePackPath, "gbsbuild")
    };
  }

  return runGbsbuild({
    enginePackPath: status.selected.path,
    gbsbuildPath: status.selected.gbsbuildPath,
    projectDir
  });
}

function enginePackMissingMessage(preferredPath: string | undefined, tool: string): string {
  if (preferredPath?.trim()) {
    return `Engine Pack configurado em Settings nao possui ${tool}: ${preferredPath.trim()}`;
  }
  return `Nenhum GBAStudioEnginePack com ${tool} foi localizado.`;
}
