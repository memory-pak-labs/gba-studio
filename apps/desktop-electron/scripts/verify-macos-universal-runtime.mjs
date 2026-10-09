#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { auditUniversalMachOTree } from "./macos-universal-runtime.mjs";

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const appRoot = path.resolve(path.dirname(scriptPath), "..");
const runtimeRoot = path.resolve(process.env.GBA_STUDIO_EMBEDDED_RUNTIME_ROOT ?? path.join(appRoot, "build", "embedded-runtime"));
const evidenceDirectory = path.join(appRoot, "artifacts", "macos-universal", "latest");
const evidencePath = path.join(evidenceDirectory, "universal_runtime_evidence.json");

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function runArchitecture(architecture, executable, args = [], options = {}) {
  const result = await execFileAsync("arch", [`-${architecture}`, executable, ...args], {
    cwd: options.cwd ?? appRoot,
    env: { ...process.env, ...(options.env ?? {}) },
    maxBuffer: 32 * 1024 * 1024
  });
  return `${result.stdout}${result.stderr}`.trim();
}

async function buildFixtureForArchitecture({ architecture, enginePack, gbsbuild, projectDirectory }) {
  const buildDirectory = path.join(projectDirectory, "build");
  const target = "universal_runtime_fixture";
  await rm(buildDirectory, { recursive: true, force: true });
  const output = await runArchitecture(architecture, gbsbuild, [
    "--engine-pack", enginePack,
    "--project-dir", projectDirectory,
    "--build-dir", buildDirectory,
    "--target", target
  ]);
  const romPath = path.join(buildDirectory, `${target}.gba`);
  const romBytes = await readFile(romPath);
  return { architecture, output, romSize: romBytes.length, romSha256: sha256(romBytes) };
}

export async function verifyMacosUniversalRuntime() {
  if (process.platform !== "darwin") {
    throw new Error("A verificacao Universal requer macOS, lipo, arch e Rosetta 2.");
  }

  const architectureAudit = await auditUniversalMachOTree(runtimeRoot);
  if (architectureAudit.invalid.length > 0) {
    throw new Error(
      `Runtime possui ${architectureAudit.invalid.length} Mach-O single-arch: ${architectureAudit.invalid.map((item) => item.relativePath).join(", ")}`
    );
  }

  const enginePack = path.join(runtimeRoot, "EnginePack", "GBAStudioEnginePack");
  const python = path.join(runtimeRoot, "Runtime", "Python3.framework", "Versions", "Current", "bin", "python3");
  const compiler = path.join(runtimeRoot, "Toolchain", "devkitARM", "bin", "arm-none-eabi-g++");
  const gbsbuild = path.join(enginePack, "tools", "gbsbuild");
  const sourceFixture = path.join(enginePack, "templates", "exported_topdown");
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "gbastudio-universal-runtime-"));
  const projectDirectory = path.join(temporaryRoot, "project");

  try {
    await cp(sourceFixture, projectDirectory, { recursive: true, force: true });
    const probes = [];
    const builds = [];
    for (const architecture of ["arm64", "x86_64"]) {
      probes.push({
        architecture,
        python: await runArchitecture(architecture, python, ["--version"]),
        compiler: await runArchitecture(architecture, compiler, ["--version"]),
        enginePack: await runArchitecture(architecture, gbsbuild, ["--version"])
      });
      builds.push(await buildFixtureForArchitecture({ architecture, enginePack, gbsbuild, projectDirectory }));
    }

    if (builds[0].romSha256 !== builds[1].romSha256) {
      throw new Error(`ROM divergiu entre arquiteturas: arm64=${builds[0].romSha256}; x86_64=${builds[1].romSha256}.`);
    }

    const evidence = {
      ok: true,
      generatedAt: new Date().toISOString(),
      runtimeRoot,
      architectureAudit: {
        machOBinaries: architectureAudit.total,
        invalid: architectureAudit.invalid
      },
      probes,
      builds,
      deterministicRomSha256: builds[0].romSha256
    };
    await mkdir(evidenceDirectory, { recursive: true });
    await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
    return evidence;
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  verifyMacosUniversalRuntime().then((evidence) => {
    console.log(`[macos-universal-runtime] ok: ${evidence.architectureAudit.machOBinaries} Mach-O Universal`);
    console.log(`[macos-universal-runtime] ROM: ${evidence.deterministicRomSha256}`);
    console.log(`[macos-universal-runtime] evidence: ${evidencePath}`);
  }).catch((error) => {
    console.error("[macos-universal-runtime] failed");
    console.error(error);
    process.exitCode = 1;
  });
}
