import { readFile } from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { app } from "electron";
import type { BuildEnvironmentSnapshot } from "../shared/buildDiagnosticReport.js";
import { resolveEngineToolInvocation } from "./engineToolInvocation.js";

const execute = promisify(execFile);
async function json(file: string): Promise<Record<string, unknown>> {
  try { return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>; } catch { return {}; }
}

export async function captureBuildEnvironment(options: { enginePackPath?: string; gbsbuildPath?: string; projectDir: string }): Promise<BuildEnvironmentSnapshot> {
  const [manifest, pack] = await Promise.all([
    json(path.join(options.projectDir, "gbastudio_project.json")),
    options.enginePackPath ? json(path.join(options.enginePackPath, "enginepack.json")) : Promise.resolve({} as Record<string, unknown>)
  ]);
  const invocation = options.gbsbuildPath ? resolveEngineToolInvocation(options.gbsbuildPath, []) : null;
  const env = invocation?.env ?? process.env;
  const devkit = env.DEVKITARM || path.join(env.DEVKITPRO || "/opt/devkitpro", "devkitARM");
  let compilerVersion: string | null = null;
  try {
    const { stdout } = await execute(path.join(devkit, "bin", `arm-none-eabi-g++${process.platform === "win32" ? ".exe" : ""}`), ["-dumpfullversion"], { encoding: "utf8", env, timeout: 5000, maxBuffer: 4096 });
    compilerVersion = stdout.trim();
  } catch { /* Unknown is reported explicitly; diagnostics cannot break a build. */ }
  const build = manifest.build && typeof manifest.build === "object" ? manifest.build as Record<string, unknown> : {};
  const target = typeof build.make_target === "string" ? build.make_target : "all";
  return {
    capturedAt: new Date().toISOString(),
    editorVersion: typeof app?.getVersion === "function" ? app.getVersion() : null,
    engineVersion: typeof pack.version === "string" ? pack.version : null,
    compilerVersion,
    platform: process.platform,
    arch: process.arch,
    kind: typeof manifest.kind === "string" ? manifest.kind : "unknown",
    makeTarget: ["all", "debug", "release"].includes(target) ? target : "custom",
    incrementalCache: build.incremental_cache !== false,
    customCompilerFlags: Boolean(env.CXXFLAGS || env.CPPFLAGS || env.CPATH || env.CPLUS_INCLUDE_PATH || env.C_INCLUDE_PATH)
  };
}
