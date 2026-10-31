import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import type { GBAProjectData } from "../shared/projectFile.js";
import type { DevelopmentSceneLaunch, EnginePackBuildResult, EnginePackDoctorResult, ExportEngineProjectResult } from "../shared/ipc.js";
import { projectPersistentBuildCacheEnabled } from "./engineBuildCache.js";
import { resolveEngineToolInvocation } from "./engineToolInvocation.js";

const execFileAsync = promisify(execFile);
const digest = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

export interface PlayRomInputs {
  projectPath: string;
  data: GBAProjectData;
  enginePack: { path: string; gbsbuildPath?: string };
  bundledAssetRoots: string[];
  developmentStartScene?: DevelopmentSceneLaunch;
}
interface Candidate {
  inputs: PlayRomInputs;
  key: string;
  fingerprint: string;
  sourcePaths: string[];
}
interface Pending extends Candidate {
  result: ExportEngineProjectResult;
  checked: boolean;
  doctorResult?: EnginePackDoctorResult;
}
interface Entry extends Candidate {
  result: ExportEngineProjectResult & { romPath: string };
  romHash: string;
  dependencies: Record<string, string>;
}

/** Content, names and symlink targets matter; neither mtime nor size grants a hit. */
export async function fingerprintPlayFiles(paths: readonly string[]): Promise<string> {
  const hash = createHash("sha256");
  async function visit(file: string, ancestors = new Set<string>()): Promise<void> {
    hash.update(JSON.stringify(file));
    let info;
    try { info = await lstat(file); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      hash.update("missing"); return;
    }
    if (info.isSymbolicLink()) {
      const target = await realpath(file);
      if (ancestors.has(target)) throw new Error("Cyclic Play dependency");
      await visit(target, new Set([...ancestors, target]));
    } else if (info.isDirectory()) {
      hash.update("directory");
      for (const name of (await readdir(file)).sort()) await visit(path.join(file, name), ancestors);
    } else if (info.isFile()) {
      hash.update("file"); hash.update(digest(await readFile(file)));
    } else { throw new Error("Unsupported Play dependency"); }
  }
  for (const file of [...new Set(paths.map(file => path.resolve(file)))].sort()) await visit(file);
  return hash.digest("hex");
}

async function captureInputs(inputs: PlayRomInputs, sources: readonly string[]): Promise<string> {
  if (!inputs.enginePack.gbsbuildPath) throw new Error("Missing build launcher");
  const invocation = resolveEngineToolInvocation(inputs.enginePack.gbsbuildPath, []);
  const env = invocation.env ?? process.env;
  const findExecutable = async (name: string): Promise<string> => {
    const extensions = process.platform === "win32" ? ["", ".exe", ".cmd", ".bat"] : [""];
    const candidates = path.isAbsolute(name) || name.includes("/") || name.includes("\\")
      ? [path.resolve(name)]
      : (env.PATH ?? "").split(path.delimiter).flatMap(directory => extensions.map(ext => path.join(directory, name + ext)));
    for (const candidate of candidates) {
      try {
        const info = await lstat(candidate);
        if (info.isFile() || info.isSymbolicLink()) return candidate;
      } catch { /* Next PATH entry. */ }
    }
    throw new Error("Unresolved Play tool");
  };
  const hostTools = await Promise.all([
    env.MAKE || "make", env.GBS_SHELL || (process.platform === "win32" ? "bash" : "/bin/bash"),
    env.GBA_STUDIO_PYTHON || (process.platform === "win32" ? "python" : "python3")
  ].map(findExecutable));
  const devkitpro = env.DEVKITPRO || "/opt/devkitpro";
  const devkitarm = env.DEVKITARM || path.join(devkitpro, "devkitARM");
  const executable = (file: string) => process.platform === "win32" ? file + ".exe" : file;
  const compiler = executable(path.join(devkitarm, "bin/arm-none-eabi-g++"));
  // The driver may stay unchanged when its actual compiler, linker or libgcc changes.
  const queries = await Promise.all(["-print-prog-name=cc1plus", "-print-prog-name=as", "-print-prog-name=ld", "-print-libgcc-file-name"].map(async query => {
    const { stdout } = await execFileAsync(compiler, [query], { env, timeout: 10_000, maxBuffer: 64 * 1024 });
    const value = stdout.trim();
    if (!path.isAbsolute(value)) throw new Error("Unresolved compiler component");
    return value;
  }));
  const projectRoot = path.dirname(inputs.projectPath);
  const files = await fingerprintPlayFiles([
    inputs.enginePack.path, ...inputs.bundledAssetRoots,
    path.join(projectRoot, "Assets"), path.join(projectRoot, "plugins"), path.join(projectRoot, "Plugins"),
    ...sources.map(source => path.resolve(projectRoot, source)),
    compiler, executable(path.join(devkitarm, "bin/arm-none-eabi-objcopy")), executable(path.join(devkitpro, "tools/bin/gbafix")), ...queries, ...hostTools,
    ...[env.CPATH, env.CPLUS_INCLUDE_PATH, env.C_INCLUDE_PATH, env.PYTHONPATH].flatMap(value => value ? value.split(path.delimiter).filter(Boolean) : [])
  ]);
  return digest(JSON.stringify({ files, environment: env, executable: invocation.executable }));
}

function inputKey(inputs: PlayRomInputs): string {
  return digest(JSON.stringify({ ...inputs, projectPath: path.resolve(inputs.projectPath) }));
}

async function dependenciesMatch(dependencies: Record<string, string>): Promise<boolean> {
  try {
    for (const [file, expected] of Object.entries(dependencies)) {
      if (digest(await readFile(file)) !== expected) return false;
    }
    return true;
  } catch { return false; }
}

/** Session-local, bounded cache of ROMs that passed the existing export/doctor/build path. */
export class PlayRomCache {
  private readonly entries = new Map<string, Entry>();
  private readonly pending = new Map<string, Pending>();
  private readonly capture: typeof captureInputs;
  constructor(options: { captureInputs?: typeof captureInputs } = {}) { this.capture = options.captureInputs ?? captureInputs; }

  async begin(inputs: PlayRomInputs, sourcePaths: string[]): Promise<Candidate | null> {
    if (!projectPersistentBuildCacheEnabled(inputs.data)) return null;
    const projectRoot = path.resolve(path.dirname(inputs.projectPath));
    if (sourcePaths.some(source => {
      const relative = path.relative(projectRoot, path.resolve(projectRoot, source));
      return path.isAbsolute(source) || relative.startsWith("..") || path.isAbsolute(relative);
    })) return null;
    try {
      const snapshot = structuredClone(inputs);
      return { inputs: snapshot, key: inputKey(snapshot), sourcePaths, fingerprint: await this.capture(snapshot, sourcePaths) };
    } catch { return null; } // Unavailable fingerprints always use the normal pipeline.
  }

  async reuse(inputs: PlayRomInputs): Promise<Entry["result"] | null> {
    if (!projectPersistentBuildCacheEnabled(inputs.data)) return null;
    const key = inputKey(inputs), entry = this.entries.get(key);
    if (!entry) return null;
    try {
      if (entry.fingerprint !== await this.capture(inputs, entry.sourcePaths)
        || !await dependenciesMatch(entry.dependencies)
        || entry.romHash !== digest(await readFile(entry.result.romPath))
        || entry.fingerprint !== await this.capture(inputs, entry.sourcePaths)) {
        this.entries.delete(key); return null;
      }
      this.entries.delete(key); this.entries.set(key, entry);
      return structuredClone(entry.result);
    } catch { this.entries.delete(key); return null; }
  }

  exported(destination: string, candidate: Candidate | null, result: ExportEngineProjectResult): void {
    const key = path.resolve(destination);
    this.pending.delete(key);
    if (candidate) {
      // Discard any previous artifact for the same request until this attempt succeeds.
      this.entries.delete(candidate.key);
      this.pending.set(key, { ...candidate, result: structuredClone(result), checked: false });
      while (this.pending.size > 16) this.pending.delete(this.pending.keys().next().value!);
    }
  }

  doctorCompleted(destination: string | undefined, result: EnginePackDoctorResult, enginePackPath?: string): void {
    if (!destination) return;
    const pending = this.pending.get(path.resolve(destination));
    if (pending) {
      pending.checked = result.ran && result.exitCode === 0 && !result.error && result.summary?.ok !== false
        && (!enginePackPath || path.resolve(enginePackPath) === path.resolve(pending.inputs.enginePack.path));
      pending.doctorResult = structuredClone(result);
    }
  }

  async buildCompleted(destination: string, result: EnginePackBuildResult, enginePackPath?: string): Promise<string | undefined> {
    const key = path.resolve(destination), pending = this.pending.get(key);
    this.pending.delete(key);
    if (!pending || !pending.checked || result.error || result.exitCode !== 0 || !result.summary) return;
    try {
      if ((enginePackPath && path.resolve(enginePackPath) !== path.resolve(pending.inputs.enginePack.path))
        || pending.fingerprint !== await this.capture(pending.inputs, pending.sourcePaths)) {
        return "Assets ou Engine Pack mudaram durante o build. Execute Play novamente.";
      }
      const record = JSON.parse(await readFile(path.join(result.summary.buildDir, ".gbsbuild-success.json"), "utf8"));
      const dependencies = record.dependencies as Record<string, string> | undefined;
      if (record.schema !== 1 || !dependencies || !Object.keys(dependencies).length
        || !Object.entries(dependencies).every(([file, hash]) => path.isAbsolute(file) && typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) return;
      if (!await dependenciesMatch(dependencies)) return "Dependências mudaram durante o build. Execute Play novamente.";
      const entry: Entry = { ...pending, result: { ...pending.result, romPath: result.summary.romPath,
        playBuildResult: structuredClone(result), playDoctorResult: pending.doctorResult },
        dependencies, romHash: digest(await readFile(result.summary.romPath)) };
      this.entries.set(pending.key, entry);
      while (this.entries.size > 16) this.entries.delete(this.entries.keys().next().value!);
    } catch { /* No verified artifact: a later Play will use the normal pipeline. */ }
  }
}
