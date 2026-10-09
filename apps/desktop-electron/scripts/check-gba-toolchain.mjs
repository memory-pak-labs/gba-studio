#!/usr/bin/env node
import { statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");

const REQUIRED_TOOLS = [
  ["make", "make"],
  ["python3", "python3"],
  ["armGcc", "arm-none-eabi-gcc"],
  ["armGxx", "arm-none-eabi-g++"],
  ["armObjcopy", "arm-none-eabi-objcopy"],
  ["gbafix", "gbafix"]
];

function pathDelimiter(platform) {
  return platform === "win32" ? ";" : ":";
}

function executableSuffixes(platform, env) {
  if (platform !== "win32") return [""];
  return (env.PATHEXT ?? ".EXE;.CMD;.BAT")
    .split(";")
    .filter(Boolean)
    .map((suffix) => suffix.toLowerCase());
}

function isExecutable(filePath, platform) {
  try {
    const fileStat = statSync(filePath);
    if (!fileStat.isFile()) return false;
    return platform === "win32" || (fileStat.mode & 0o111) !== 0;
  } catch {
    return false;
  }
}

function normalizePath(value) {
  return value ? path.resolve(value) : null;
}

function uniquePaths(values) {
  return [...new Set(values.filter(Boolean).map(normalizePath))];
}

function findExecutable(command, { pathValue, platform, env }) {
  const suffixes = executableSuffixes(platform, env);
  const directories = (pathValue ?? "")
    .split(pathDelimiter(platform))
    .filter(Boolean);

  for (const directory of directories) {
    for (const suffix of suffixes) {
      const candidate = path.resolve(directory, `${command}${suffix}`);
      if (isExecutable(candidate, platform)) return candidate;
    }
  }

  return null;
}

function defaultDevkitProRoots(platform) {
  if (platform === "win32") return ["C:\\devkitPro", "C:\\devkitpro"];
  return ["/opt/devkitpro"];
}

function defaultHostBins(platform) {
  if (platform === "win32") return [];
  return ["/usr/bin", "/bin"];
}

function existingDirectory(value) {
  const normalized = normalizePath(value);
  if (!normalized) return null;
  try {
    return statSync(normalized).isDirectory() ? normalized : null;
  } catch {
    return null;
  }
}

function inferDevkitArmFromCompiler(compilerPath) {
  return compilerPath ? path.resolve(compilerPath, "..", "..") : null;
}

function inferDevkitProFromGbafix(gbafixPath) {
  return gbafixPath ? path.resolve(gbafixPath, "..", "..", "..") : null;
}

function inferDevkitProFromDevkitArm(devkitArm) {
  return devkitArm ? path.resolve(devkitArm, "..") : null;
}

function resolveTool(command, directories, pathOptions) {
  const fromPath = findExecutable(command, pathOptions);
  if (fromPath) return fromPath;

  for (const directory of uniquePaths(directories)) {
    for (const suffix of executableSuffixes(pathOptions.platform, pathOptions.env)) {
      const candidate = path.resolve(directory, `${command}${suffix}`);
      if (isExecutable(candidate, pathOptions.platform)) return candidate;
    }
  }

  return null;
}

export function inspectGbaToolchain(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const delimiter = pathDelimiter(platform);
  const standardRoots = options.standardRoots ?? defaultDevkitProRoots(platform);
  const hostBins = options.hostRoots ?? defaultHostBins(platform);
  const pathValue = env.PATH ?? "";
  const pathOptions = { pathValue, platform, env };
  const pathArmGcc = findExecutable("arm-none-eabi-gcc", pathOptions);
  const pathGbafix = findExecutable("gbafix", pathOptions);

  const requestedDevkitPro = [env.DEVKITPRO, env.GBA_STUDIO_DEVKITPRO_SOURCE];
  const requestedDevkitArm = [env.DEVKITARM, env.GBA_STUDIO_DEVKITARM_SOURCE];
  const devkitProCandidates = uniquePaths([
    ...requestedDevkitPro,
    inferDevkitProFromGbafix(pathGbafix),
    inferDevkitProFromDevkitArm(existingDirectory(requestedDevkitArm[0])),
    ...standardRoots
  ]);
  const devkitArmCandidates = uniquePaths([
    ...requestedDevkitArm,
    inferDevkitArmFromCompiler(pathArmGcc),
    ...devkitProCandidates.map((root) => path.join(root, "devkitARM"))
  ]);

  const devkitPro = devkitProCandidates.find((candidate) => existingDirectory(candidate)) ?? null;
  const devkitArm = devkitArmCandidates.find((candidate) => existingDirectory(candidate)) ?? null;
  const armBin = devkitArm ? path.join(devkitArm, "bin") : null;
  const toolsBin = devkitPro ? path.join(devkitPro, "tools", "bin") : null;
  const hostPathValue = [pathValue, ...hostBins].filter(Boolean).join(delimiter);
  const hostPathOptions = { pathValue: hostPathValue, platform, env };

  const tools = {
    make: resolveTool("make", [], hostPathOptions),
    python3: resolveTool("python3", [], hostPathOptions)
      ?? resolveTool("python", [], hostPathOptions),
    armGcc: resolveTool("arm-none-eabi-gcc", [armBin], pathOptions),
    armGxx: resolveTool("arm-none-eabi-g++", [armBin], pathOptions),
    armObjcopy: resolveTool("arm-none-eabi-objcopy", [armBin], pathOptions),
    gbafix: resolveTool("gbafix", [toolsBin], pathOptions)
  };

  const missing = [];
  if (!devkitPro) missing.push("DEVKITPRO");
  if (!devkitArm) missing.push("DEVKITARM");
  for (const [key, label] of REQUIRED_TOOLS) {
    if (!tools[key]) missing.push(label);
  }

  return {
    ok: missing.length === 0,
    platform,
    pathDelimiter: delimiter,
    roots: {
      devkitPro,
      devkitArm
    },
    tools,
    missing,
    checkedAt: new Date().toISOString()
  };
}

export function resolveToolchainEnvironment(report, baseEnv = process.env) {
  if (!report?.ok || !report.roots?.devkitPro || !report.roots?.devkitArm) {
    throw new Error(`Toolchain GBA incompleta: ${(report?.missing ?? ["relatorio ausente"]).join(", ")}`);
  }

  const toolchainBins = [
    path.join(report.roots.devkitArm, "bin"),
    path.join(report.roots.devkitPro, "tools", "bin")
  ];
  const existingPath = baseEnv.PATH ?? "";

  return {
    ...baseEnv,
    DEVKITPRO: report.roots.devkitPro,
    DEVKITARM: report.roots.devkitArm,
    PATH: [...toolchainBins, existingPath].filter(Boolean).join(report.pathDelimiter ?? path.delimiter)
  };
}

function toolVersion(toolPath) {
  if (!toolPath) return null;
  const result = spawnSync(toolPath, ["--version"], { encoding: "utf8" });
  if (result.error || result.status !== 0) return null;
  return result.stdout.trim().split("\n")[0] || null;
}

function printHumanReport(report) {
  console.log(`Toolchain GBA: ${report.ok ? "OK" : "INCOMPLETA"}`);
  console.log(`DEVKITPRO: ${report.roots.devkitPro ?? "nao encontrado"}`);
  console.log(`DEVKITARM: ${report.roots.devkitArm ?? "nao encontrado"}`);
  for (const [key, label] of REQUIRED_TOOLS) {
    const toolPath = report.tools[key];
    const version = key === "armGxx" ? toolVersion(toolPath) : null;
    console.log(`${label}: ${toolPath ?? "nao encontrado"}${version ? ` (${version})` : ""}`);
  }
  if (report.missing.length > 0) {
    console.error(`Faltando: ${report.missing.join(", ")}`);
  }
}

async function main() {
  const report = inspectGbaToolchain();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(report);
  }
  if (!report.ok) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";

if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
