import { existsSync } from "node:fs";
import { chmod, copyFile, cp, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  auditUniversalMachOTree,
  mergeUniversalBinary,
  mergeUniversalMachOTrees,
  normalizeInfoPlistsToXml
} from "./macos-universal-runtime.mjs";

const scriptPath = fileURLToPath(import.meta.url);
const scriptsDir = path.dirname(scriptPath);
const appRoot = path.resolve(scriptsDir, "..");
const repositoryRoot = path.resolve(appRoot, "..", "..");
const outputRoot = path.join(appRoot, "build", "embedded-runtime");

const toolNames = new Set(["assetc", "gbsdoctor", "gbsbuild"]);

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && existsSync(candidate));
}

export function shouldPrepareEmbeddedRuntime(platform) {
  return platform === "darwin";
}

export function embeddedRuntimeProfile(environment = process.env) {
  const profile = environment.GBA_STUDIO_RUNTIME_PROFILE?.trim() || "offline";
  if (profile !== "compact" && profile !== "offline") {
    throw new Error(`Perfil de runtime macOS desconhecido: ${profile}`);
  }
  return profile;
}

export function embeddedRuntimeRequirements(profile) {
  return {
    bundledEnginePack: true,
    bundledPython: profile === "offline",
    bundledToolchain: profile === "offline"
  };
}

export function embeddedToolWrapper(toolName, profile = "offline") {
  if (!toolNames.has(toolName)) {
    throw new Error(`Ferramenta Python desconhecida: ${toolName}`);
  }

  if (profile === "compact") {
    const toolchainCheck = toolName === "gbsbuild"
      ? `if [ ! -x "$DEVKITARM/bin/arm-none-eabi-g++" ]; then
  echo "O pacote compacto requer devkitPro/devkitARM. Instale-o ou defina DEVKITPRO e DEVKITARM." >&2
  exit 127
fi
`
      : "";
    return `#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "\${0%/*}" && pwd)"
PYTHON="\${GBA_STUDIO_PYTHON:-python3}"
DEVKITPRO="\${DEVKITPRO:-/opt/devkitpro}"
DEVKITARM="\${DEVKITARM:-$DEVKITPRO/devkitARM}"
export DEVKITPRO DEVKITARM

if ! command -v "$PYTHON" >/dev/null 2>&1; then
  echo "O pacote compacto requer Python 3. Instale-o ou defina GBA_STUDIO_PYTHON." >&2
  exit 127
fi
${toolchainCheck}
exec "$PYTHON" "$SCRIPT_DIR/${toolName}.py" "$@"
`;
  }

  const toolchainStaging = toolName === "gbsbuild" ? `
TOOLCHAIN_ROOT="$DEVKITPRO"
TOOLCHAIN_LINK="/tmp/gbastudio-toolchain-$$"
/bin/rm -f "$TOOLCHAIN_LINK"
/bin/ln -s "$TOOLCHAIN_ROOT" "$TOOLCHAIN_LINK"
trap '/bin/rm -f "$TOOLCHAIN_LINK"' EXIT HUP INT TERM
DEVKITPRO="$TOOLCHAIN_LINK"
DEVKITARM="$DEVKITPRO/devkitARM"
export DEVKITPRO DEVKITARM
` : "";
  const invocation = toolName === "gbsbuild"
    ? `"$PYTHON" "$SCRIPT_DIR/${toolName}.py" "$@"`
    : `exec "$PYTHON" "$SCRIPT_DIR/${toolName}.py" "$@"`;

  return `#!/bin/sh
set -eu
SCRIPT_DIR="$(CDPATH= cd -- "\${0%/*}" && pwd)"
RESOURCES_DIR="$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd)"
PYTHON="$RESOURCES_DIR/Runtime/Python3.framework/Versions/Current/bin/python3"
DEVKITPRO="$RESOURCES_DIR/Toolchain"
DEVKITARM="$DEVKITPRO/devkitARM"
PATH="$RESOURCES_DIR/Runtime/bin:$RESOURCES_DIR/Toolchain/bin:/usr/bin:/bin"
export DEVKITPRO DEVKITARM
export PATH

if [ ! -x "$PYTHON" ]; then
  echo "Runtime Python embutido nao encontrado: $PYTHON" >&2
  exit 127
fi
if [ ! -x "$DEVKITARM/bin/arm-none-eabi-g++" ]; then
  echo "devkitARM embutido nao encontrado: $DEVKITARM" >&2
  exit 127
fi

${toolchainStaging}
${invocation}
`;
}

export function devkitProToolsPath(devkitArmPath) {
  return path.join(path.dirname(devkitArmPath), "tools");
}

export function universalRuntimeRequested(environment = process.env) {
  return environment.GBA_STUDIO_REQUIRE_UNIVERSAL_RUNTIME === "1";
}

export function preserveToolchainSymlinks(source) {
  const absolutePathDefinition = "def absolute_path(value):\n    return Path(value).expanduser().resolve()\n";
  if (!source.includes(absolutePathDefinition)) {
    throw new Error("gbsbuild.py nao possui a definicao esperada de absolute_path().");
  }

  return source
    .replace(
      absolutePathDefinition,
      `${absolutePathDefinition}\ndef logical_path(value):\n    return Path(value).expanduser().absolute()\n`
    )
    .replaceAll("absolute_path(args.devkitpro)", "logical_path(args.devkitpro)")
    .replaceAll("absolute_path(args.devkitarm)", "logical_path(args.devkitarm)");
}

function resolveSources(profile) {
  const enginePack = path.join(repositoryRoot, "packages", "GBAStudioEngine", "dist", "GBAStudioEnginePack");
  if (profile === "compact") {
    if (!existsSync(enginePack)) {
      throw new Error("Dependencias para runtime embutido ausentes: GBAStudioEnginePack");
    }
    return { enginePack, universal: false };
  }
  const requireUniversal = universalRuntimeRequested();
  const devkitProArm64 = firstExisting([
    process.env.GBA_STUDIO_DEVKITPRO_ARM64_SOURCE?.trim(),
    "/opt/devkitpro"
  ]);
  const devkitProX86_64 = firstExisting([
    process.env.GBA_STUDIO_DEVKITPRO_X86_64_SOURCE?.trim()
  ]);
  const pythonFramework = firstExisting([
    process.env.GBA_STUDIO_PYTHON_FRAMEWORK_SOURCE?.trim(),
    "/Applications/Xcode.app/Contents/Developer/Library/Frameworks/Python3.framework"
  ]);
  const devkitArm = requireUniversal
    ? firstExisting([devkitProArm64 ? path.join(devkitProArm64, "devkitARM") : undefined])
    : firstExisting([
      process.env.GBA_STUDIO_DEVKITARM_SOURCE?.trim(),
      process.env.DEVKITARM?.trim(),
      devkitProArm64 ? path.join(devkitProArm64, "devkitARM") : undefined
    ]);
  const make = firstExisting([
    process.env.GBA_STUDIO_MAKE_SOURCE?.trim(),
    "/Applications/Xcode.app/Contents/Developer/usr/bin/make"
  ]);
  const makeX86_64 = firstExisting([
    process.env.GBA_STUDIO_MAKE_X86_64_SOURCE?.trim(),
    "/usr/bin/make"
  ]);
  const devkitProTools = requireUniversal
    ? firstExisting([devkitProArm64 ? path.join(devkitProArm64, "tools") : undefined])
    : firstExisting([
      process.env.GBA_STUDIO_DEVKITPRO_TOOLS_SOURCE?.trim(),
      devkitArm ? devkitProToolsPath(devkitArm) : undefined
    ]);

  const missing = [
    [enginePack, "GBAStudioEnginePack"],
    [pythonFramework, "Python3.framework (Xcode ou GBA_STUDIO_PYTHON_FRAMEWORK_SOURCE)"],
    [devkitArm, "devkitARM (DEVKITARM ou GBA_STUDIO_DEVKITARM_SOURCE)"],
    [devkitProTools, "devkitPro/tools (GBA_STUDIO_DEVKITPRO_TOOLS_SOURCE)"],
    [make, "make real do Xcode (GBA_STUDIO_MAKE_SOURCE)"]
  ].filter(([source]) => !source || !existsSync(source));
  if (requireUniversal) {
    missing.push(...[
      [devkitProArm64, "devkitPro arm64 (GBA_STUDIO_DEVKITPRO_ARM64_SOURCE)"],
      [devkitProX86_64, "devkitPro x86_64 (GBA_STUDIO_DEVKITPRO_X86_64_SOURCE)"],
      [makeX86_64, "make x86_64 (GBA_STUDIO_MAKE_X86_64_SOURCE)"]
    ].filter(([source]) => !source || !existsSync(source)));
  }
  if (missing.length > 0) {
    throw new Error(`Dependencias para runtime embutido ausentes: ${missing.map(([, label]) => label).join(", ")}`);
  }

  return {
    enginePack,
    pythonFramework,
    devkitArm,
    devkitProTools,
    make,
    makeX86_64,
    devkitProArm64,
    devkitProX86_64,
    universal: requireUniversal
  };
}

async function copyTree(source, destination) {
  await cp(source, destination, {
    recursive: true,
    force: true,
    dereference: false,
    verbatimSymlinks: true
  });
}

export async function prepareEmbeddedRuntime(options = {}) {
  const profile = options.profile ?? embeddedRuntimeProfile();
  const requirements = embeddedRuntimeRequirements(profile);
  const sources = resolveSources(profile);
  const embeddedEnginePack = path.join(outputRoot, "EnginePack", "GBAStudioEnginePack");
  const embeddedTools = path.join(embeddedEnginePack, "tools");

  await rm(outputRoot, { recursive: true, force: true });
  await mkdir(outputRoot, { recursive: true });
  await copyTree(sources.enginePack, embeddedEnginePack);

  if (requirements.bundledPython && requirements.bundledToolchain) {
    await Promise.all([
      copyTree(sources.pythonFramework, path.join(outputRoot, "Runtime", "Python3.framework")),
      copyTree(sources.devkitArm, path.join(outputRoot, "Toolchain", "devkitARM")),
      copyTree(sources.devkitProTools, path.join(outputRoot, "Toolchain", "tools"))
    ]);

    const runtimeBin = path.join(outputRoot, "Runtime", "bin");
    const toolchainBin = path.join(outputRoot, "Toolchain", "bin");
    await Promise.all([mkdir(runtimeBin, { recursive: true }), mkdir(toolchainBin, { recursive: true })]);
    const pythonShim = path.join(runtimeBin, "python3");
    await writeFile(pythonShim, `#!/bin/sh
set -eu
RUNTIME_DIR="$(CDPATH= cd -- "\${0%/*}/.." && pwd)"
exec "$RUNTIME_DIR/Python3.framework/Versions/Current/bin/python3" "$@"
`, "utf8");
    await chmod(pythonShim, 0o755);
    const embeddedMake = path.join(toolchainBin, "make");
    await copyFile(sources.make, embeddedMake);
    await chmod(embeddedMake, 0o755);
  }

  let mergedToolchainBinaries = [];
  if (requirements.bundledToolchain && sources.universal) {
    const embeddedMake = path.join(outputRoot, "Toolchain", "bin", "make");
    mergedToolchainBinaries = await mergeUniversalMachOTrees({
      arm64Root: sources.devkitProArm64,
      x86_64Root: sources.devkitProX86_64,
      destinationRoot: path.join(outputRoot, "Toolchain")
    });
    await mergeUniversalBinary({
      arm64Path: sources.make,
      x86_64Path: sources.makeX86_64,
      outputPath: embeddedMake
    });
  }

  for (const toolName of toolNames) {
    const toolPath = path.join(embeddedTools, toolName);
    const pythonToolPath = `${toolPath}.py`;
    await rename(toolPath, pythonToolPath);
    if (profile === "offline" && toolName === "gbsbuild") {
      const source = await readFile(pythonToolPath, "utf8");
      await writeFile(pythonToolPath, preserveToolchainSymlinks(source), "utf8");
    }
    await writeFile(toolPath, embeddedToolWrapper(toolName, profile), "utf8");
    await chmod(toolPath, 0o755);
  }

  const normalizedInfoPlists = await normalizeInfoPlistsToXml(outputRoot);

  await writeFile(path.join(outputRoot, "EMBEDDED_RUNTIME.txt"), [
    "GBA Studio embedded build runtime",
    `Profile: ${profile}`,
    `Engine Pack: ${sources.enginePack}`,
    `Python: ${requirements.bundledPython ? sources.pythonFramework : "external (python3 or GBA_STUDIO_PYTHON)"}`,
    `Toolchain: ${requirements.bundledToolchain ? sources.devkitArm : "external (DEVKITPRO/DEVKITARM)"}`,
    `Architecture: ${sources.universal ? "Universal (arm64 + x86_64)" : process.arch}`,
    `Universal toolchain binaries: ${mergedToolchainBinaries.length}`,
    `Info.plist XML normalizados: ${normalizedInfoPlists.length}`,
    requirements.bundledToolchain
      ? "The packaged application invokes only the copies under Contents/Resources."
      : "The compact package bundles the Engine Pack and uses Python 3 plus devkitPro from the host.",
    ""
  ].join("\n"), "utf8");

  const architectureAudit = await auditUniversalMachOTree(outputRoot);
  if (sources.universal && architectureAudit.invalid.length > 0) {
    throw new Error(
      `Runtime embarcado ainda contem Mach-O single-arch: ${architectureAudit.invalid.map((item) => item.relativePath).join(", ")}`
    );
  }

  return { outputRoot, profile, requirements, architectureAudit, ...sources };
}

if (path.resolve(process.argv[1] ?? "") === scriptPath) {
  if (!shouldPrepareEmbeddedRuntime(process.platform)) {
    console.log(`[embedded-runtime] skipped on ${process.platform}`);
  } else {
    const result = await prepareEmbeddedRuntime();
    console.log(`[embedded-runtime] ready: ${result.outputRoot}`);
  }
}
