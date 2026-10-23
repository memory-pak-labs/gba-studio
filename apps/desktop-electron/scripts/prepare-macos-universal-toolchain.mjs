import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { verifiedDownload } from "./prepare-portable-runtime.mjs";
import { macosMachOArchitecture } from "./macos-universal-runtime.mjs";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export async function resolveUniversalToolchainSources(environment = process.env, prepare = prepareMacosUniversalToolchain) {
  const selectedArm64 = environment.GBA_STUDIO_DEVKITPRO_ARM64_SOURCE?.trim();
  const selectedIntel = environment.GBA_STUDIO_DEVKITPRO_X86_64_SOURCE?.trim();
  if (!selectedArm64 && !selectedIntel) return prepare();
  const arm64Root = selectedArm64;
  const x86_64Root = selectedIntel;
  if (!arm64Root || !x86_64Root || !existsSync(arm64Root) || !existsSync(x86_64Root)) {
    throw new Error("Selecione um par completo de toolchains arm64 e x86_64 com GBA_STUDIO_DEVKITPRO_ARM64_SOURCE e GBA_STUDIO_DEVKITPRO_X86_64_SOURCE.");
  }
  return { arm64Root, x86_64Root };
}

export async function prepareMacosUniversalToolchain(options = {}) {
  if (process.platform !== "darwin") throw new Error("Prepare a toolchain Universal no macOS.");
  const lock = JSON.parse(await readFile(path.join(appRoot, "scripts/portable-runtime-sources.json"), "utf8"));
  const cache = path.join(appRoot, "build/runtime-downloads");
  const architectures = options.architecture ? [macosMachOArchitecture(options.architecture)] : ["arm64", "x86_64"];
  const stage = path.join(appRoot, "build/macos-toolchain-sources", options.architecture ?? "universal");
  const archives = {};
  for (const architecture of architectures) {
    archives[architecture] = await verifiedDownload(lock.macosCompilers[architecture], cache);
  }
  const gbafixSource = await verifiedDownload(lock.gbafix.source, cache);
  const gbafixLicense = await verifiedDownload(lock.gbafix.license, cache);
  await rm(stage, { recursive: true, force: true });
  for (const architecture of architectures) {
    const root = path.join(stage, architecture);
    const compiler = path.join(root, "devkitARM");
    const tools = path.join(root, "tools/bin");
    await mkdir(compiler, { recursive: true }); await mkdir(tools, { recursive: true });
    execFileSync("/usr/bin/tar", ["-xf", archives[architecture], "--strip-components=1", "-C", compiler], { stdio: "inherit" });
    execFileSync("/usr/bin/clang", ["-arch", architecture, "-mmacosx-version-min=12.0", "-O2", gbafixSource, "-o", path.join(tools, "gbafix")], { stdio: "inherit" });
    const sourceDirectory = path.join(root, "tools/Sources/gbafix");
    await mkdir(sourceDirectory, { recursive: true });
    await copyFile(gbafixSource, path.join(sourceDirectory, "gbafix.c"));
    await copyFile(gbafixLicense, path.join(sourceDirectory, "COPYING"));
    await writeFile(path.join(root, "tools/SOURCES.txt"), [
      "Independent GNU Arm compiler; GBAStudioEngine remains the game backend.",
      `Compiler: xPack GNU Arm ${lock.compilerVersion}; upstream licenses retained under devkitARM.`,
      ...lock.correspondingSources.compilerSources,
      lock.correspondingSources.buildRecipes, lock.correspondingSources.dependenciesAndPatches,
      `gbafix: ${lock.gbafix.source.url}; source and COPYING included.`,
      "gbafix build: clang -arch arm64/x86_64 -mmacosx-version-min=12.0 -O2 gbafix.c",
      "", JSON.stringify(lock.macosCompilers, null, 2), ""
    ].join("\n"));
  }
  return { arm64Root: path.join(stage, "arm64"), x86_64Root: path.join(stage, "x86_64") };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  console.log(await prepareMacosUniversalToolchain());
}
